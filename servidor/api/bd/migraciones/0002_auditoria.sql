-- =============================================================================
-- Avance 04 · Auditoría
--
-- Cómo sabe la BD quién hizo el cambio: el backend (FastAPI), al abrir la
-- transacción de cada petición, ejecuta
--
--     SELECT set_config('app.usuario_id', '<id del usuario>', true);
--     SELECT set_config('app.direccion_ip', '<ip del cliente>', true);
--
-- El tercer parámetro (true) limita el valor a la transacción: no se filtra a
-- otra petición que reutilice la conexión del pool.
--
-- Cargas del bot (avance 04): durante la transacción que guarda lo que leyó
-- el bot, el backend fija además
--
--     SELECT set_config('app.carga_id', '<id de la carga>', true);
--
-- Mientras esté fijado, los INSERT y DELETE de reporte.valor,
-- reporte.total_declarado y reporte.hallazgo NO se registran fila por fila:
-- se escribe UNA fila resumen por tabla y operación ('INSERTAR_MASIVO',
-- 'ELIMINAR_MASIVO', con registro_id = id de la carga y el número de filas).
-- La evidencia de detalle es el archivo guardado (huella SHA-256) y la carga
-- con el informe completo del bot. Las correcciones manuales posteriores
-- (sin app.carga_id) sí se registran fila por fila.
--
-- Dos disparadores por tabla:
--   1. tg_<tabla>_control   (BEFORE INSERT/UPDATE) llena las fechas de control.
--   2. tg_<tabla>_auditoria (AFTER INSERT/UPDATE/DELETE) escribe en
--      auditoria.registro_cambio quién hizo qué, con el antes y el después.
--
-- Borrado: se permiten los dos (observación 02 del avance 01).
--   · Lógico: UPDATE … SET fecha_eliminacion = now()  → 'ELIMINAR_LOGICO'
--   · Físico: DELETE …                                 → 'ELIMINAR', con la
--     fila completa en datos_anteriores (se puede reconstruir desde ahí).
-- =============================================================================

-- Usuario de la aplicación en la transacción actual (nulo si no se informó).
CREATE OR REPLACE FUNCTION auditoria.fn_usuario_actual()
RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.usuario_id', true), '')::BIGINT;
$$;

-- Carga del bot en curso (nula fuera de una carga).
CREATE OR REPLACE FUNCTION auditoria.fn_carga_actual()
RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.carga_id', true), '')::BIGINT;
$$;

CREATE OR REPLACE FUNCTION auditoria.fn_ip_actual()
RETURNS INET
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.direccion_ip', true), '')::INET;
$$;

-- 1. Fechas de control -------------------------------------------------------
CREATE OR REPLACE FUNCTION auditoria.fn_columnas_control()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.fecha_creacion      := now();
        NEW.fecha_actualizacion := NULL;
        IF NEW.fecha_eliminacion IS NOT NULL THEN
            RAISE EXCEPTION 'No se puede insertar un registro ya eliminado en %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
        END IF;
    ELSE
        -- La fecha de creación no se reescribe nunca.
        NEW.fecha_creacion      := OLD.fecha_creacion;
        NEW.fecha_actualizacion := now();
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Bitácora -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION auditoria.fn_registrar_cambio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                          -- escribe aunque el usuario de la app no tenga INSERT en auditoria
SET search_path = pg_catalog, auditoria AS $$
DECLARE
    v_anterior  JSONB;
    v_nuevo     JSONB;
    v_operacion VARCHAR(15);
    v_campos    TEXT[];
    -- Las columnas de control cambian en cada UPDATE: no se listan como "modificadas".
    c_control CONSTANT TEXT[] := ARRAY['fecha_actualizacion'];
BEGIN
    -- Carga masiva del bot: la registra el disparador por sentencia (resumen).
    IF TG_OP IN ('INSERT', 'DELETE')
       AND TG_TABLE_SCHEMA = 'reporte' AND TG_TABLE_NAME IN ('valor', 'total_declarado', 'hallazgo')
       AND auditoria.fn_carga_actual() IS NOT NULL THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_nuevo := to_jsonb(NEW);
        v_operacion := 'INSERTAR';
    ELSIF TG_OP = 'DELETE' THEN
        v_anterior := to_jsonb(OLD);
        v_operacion := 'ELIMINAR';
    ELSE
        v_anterior := to_jsonb(OLD);
        v_nuevo    := to_jsonb(NEW);
        SELECT array_agg(n.key ORDER BY n.key)
          INTO v_campos
          FROM jsonb_each(v_nuevo) n
         WHERE n.value IS DISTINCT FROM v_anterior -> n.key
           AND n.key <> ALL (c_control);

        IF v_campos IS NULL THEN
            RETURN NULL;                  -- UPDATE sin cambios reales: no se registra
        END IF;

        v_operacion := CASE
            WHEN OLD.fecha_eliminacion IS NULL AND NEW.fecha_eliminacion IS NOT NULL THEN 'ELIMINAR_LOGICO'
            WHEN OLD.fecha_eliminacion IS NOT NULL AND NEW.fecha_eliminacion IS NULL THEN 'RESTAURAR'
            ELSE 'ACTUALIZAR'
        END;
    END IF;

    -- Nunca se guarda el hash de la contraseña en la bitácora.
    IF TG_TABLE_SCHEMA = 'seguridad' AND TG_TABLE_NAME = 'usuario' THEN
        v_anterior := v_anterior - 'contrasena_hash';
        v_nuevo    := v_nuevo    - 'contrasena_hash';
    END IF;

    INSERT INTO auditoria.registro_cambio
        (esquema, tabla, registro_id, operacion, datos_anteriores, datos_nuevos,
         campos_modificados, usuario_id, direccion_ip)
    VALUES
        (TG_TABLE_SCHEMA, TG_TABLE_NAME,
         COALESCE((v_nuevo ->> 'id'), (v_anterior ->> 'id'))::BIGINT,
         v_operacion, v_anterior, v_nuevo, v_campos,
         auditoria.fn_usuario_actual(), auditoria.fn_ip_actual());

    RETURN NULL;
END;
$$;

-- La bitácora es de solo inserción.
CREATE OR REPLACE FUNCTION auditoria.fn_bitacora_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'auditoria.registro_cambio no se modifica ni se borra';
END;
$$;

CREATE TRIGGER tg_registro_cambio_inmutable
    BEFORE UPDATE OR DELETE ON auditoria.registro_cambio
    FOR EACH ROW EXECUTE FUNCTION auditoria.fn_bitacora_inmutable();

-- Instala los dos disparadores en una tabla. Se usa al crear tablas nuevas
-- (p. ej. al agregar un módulo) para no olvidar ninguno.
CREATE OR REPLACE FUNCTION auditoria.fn_instalar_auditoria(p_esquema TEXT, p_tabla TEXT)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', 'tg_' || p_tabla || '_control', p_esquema, p_tabla);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION auditoria.fn_columnas_control()',
                   'tg_' || p_tabla || '_control', p_esquema, p_tabla);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', 'tg_' || p_tabla || '_auditoria', p_esquema, p_tabla);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION auditoria.fn_registrar_cambio()',
                   'tg_' || p_tabla || '_auditoria', p_esquema, p_tabla);
END;
$$;

-- Instalar en todas las tablas con columnas de control.
SET client_min_messages = warning;   -- silencia los avisos de DROP TRIGGER IF EXISTS
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT c.table_schema, c.table_name
          FROM information_schema.columns c
          JOIN information_schema.tables tb
            ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
         WHERE c.column_name = 'fecha_creacion'
           AND c.table_schema IN ('seguridad', 'organizacion', 'formato', 'reporte')
         ORDER BY 1, 2
    LOOP
        PERFORM auditoria.fn_instalar_auditoria(t.table_schema, t.table_name);
    END LOOP;
END;
$$;
RESET client_min_messages;

-- Resumen de cargas masivas ---------------------------------------------------
-- Disparadores por SENTENCIA con tablas de transición: cuentan las filas
-- insertadas o borradas por la carga y escriben una sola fila en la bitácora.
CREATE OR REPLACE FUNCTION auditoria.fn_registrar_insercion_masiva()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auditoria AS $$
DECLARE
    v_carga BIGINT := auditoria.fn_carga_actual();
    v_filas BIGINT;
BEGIN
    IF v_carga IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO v_filas FROM filas_nuevas;
    IF v_filas > 0 THEN
        INSERT INTO auditoria.registro_cambio (esquema, tabla, registro_id, operacion, datos_nuevos, usuario_id, direccion_ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_carga, 'INSERTAR_MASIVO',
                jsonb_build_object('carga_id', v_carga, 'filas', v_filas),
                auditoria.fn_usuario_actual(), auditoria.fn_ip_actual());
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION auditoria.fn_registrar_eliminacion_masiva()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auditoria AS $$
DECLARE
    v_carga BIGINT := auditoria.fn_carga_actual();
    v_filas BIGINT;
BEGIN
    IF v_carga IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO v_filas FROM filas_anteriores;
    IF v_filas > 0 THEN
        INSERT INTO auditoria.registro_cambio (esquema, tabla, registro_id, operacion, datos_anteriores, usuario_id, direccion_ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_carga, 'ELIMINAR_MASIVO',
                jsonb_build_object('carga_id', v_carga, 'filas', v_filas),
                auditoria.fn_usuario_actual(), auditoria.fn_ip_actual());
    END IF;
    RETURN NULL;
END;
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['valor', 'total_declarado', 'hallazgo'] LOOP
        EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON reporte.%I REFERENCING NEW TABLE AS filas_nuevas
                        FOR EACH STATEMENT EXECUTE FUNCTION auditoria.fn_registrar_insercion_masiva()',
                       'tg_' || t || '_insercion_masiva', t);
        EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON reporte.%I REFERENCING OLD TABLE AS filas_anteriores
                        FOR EACH STATEMENT EXECUTE FUNCTION auditoria.fn_registrar_eliminacion_masiva()',
                       'tg_' || t || '_eliminacion_masiva', t);
    END LOOP;
END;
$$;

-- Historial legible de un registro: SELECT * FROM auditoria.fn_historial('reporte', 'reporte', 15);
CREATE OR REPLACE FUNCTION auditoria.fn_historial(p_esquema TEXT, p_tabla TEXT, p_registro_id BIGINT)
RETURNS TABLE (fecha TIMESTAMPTZ, operacion VARCHAR, usuario TEXT, campos_modificados TEXT[], datos_anteriores JSONB, datos_nuevos JSONB)
LANGUAGE sql STABLE AS $$
    SELECT r.fecha, r.operacion,
           COALESCE(u.nombre_usuario, '(sin usuario: ' || r.usuario_bd || ')'),
           r.campos_modificados, r.datos_anteriores, r.datos_nuevos
      FROM auditoria.registro_cambio r
      LEFT JOIN seguridad.usuario u ON u.id = r.usuario_id
     WHERE r.esquema = p_esquema AND r.tabla = p_tabla AND r.registro_id = p_registro_id
     ORDER BY r.id;
$$;
