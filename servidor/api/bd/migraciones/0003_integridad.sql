-- =============================================================================
-- Avance 04 · Reglas de integridad que un CHECK no alcanza a expresar
-- =============================================================================

-- El alcance del rol manda sobre la asignación:
--   global → sin unidad; unidad → con unidad; ambos → cualquiera.
CREATE OR REPLACE FUNCTION seguridad.fn_validar_usuario_rol()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_alcance VARCHAR(10);
BEGIN
    SELECT alcance INTO v_alcance FROM seguridad.rol WHERE id = NEW.rol_id;
    IF v_alcance = 'global' AND NEW.unidad_organica_id IS NOT NULL THEN
        RAISE EXCEPTION 'El rol % es global: no se asigna a una unidad', NEW.rol_id;
    ELSIF v_alcance = 'unidad' AND NEW.unidad_organica_id IS NULL THEN
        RAISE EXCEPTION 'El rol % se asigna a una unidad: falta unidad_organica_id', NEW.rol_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_usuario_rol_alcance
    BEFORE INSERT OR UPDATE OF rol_id, unidad_organica_id ON seguridad.usuario_rol
    FOR EACH ROW EXECUTE FUNCTION seguridad.fn_validar_usuario_rol();

-- Una casilla de un formato diario debe caer dentro del mes del periodo
-- (no hay día 31 en junio) y un formato mensual no lleva día.
-- Además, el indicador debe pertenecer a la versión del reporte.
CREATE OR REPLACE FUNCTION reporte.fn_validar_valor()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_granularidad VARCHAR(15);
    v_dias         INT;
    v_en_version   BOOLEAN;
BEGIN
    SELECT f.granularidad, EXTRACT(DAY FROM p.fecha_fin)::INT,
           CASE WHEN r.formato_version_id IS NULL THEN NULL
                ELSE EXISTS (SELECT 1 FROM formato.version_indicador vi
                              WHERE vi.formato_version_id = r.formato_version_id
                                AND vi.indicador_id = NEW.indicador_id
                                AND vi.fecha_eliminacion IS NULL) END
      INTO v_granularidad, v_dias, v_en_version
      FROM reporte.reporte r
      JOIN formato.formato f      ON f.id = r.formato_id
      JOIN organizacion.periodo p ON p.id = r.periodo_id
     WHERE r.id = NEW.reporte_id;

    IF v_en_version IS NULL THEN
        RAISE EXCEPTION 'El reporte % aún no tiene estructura reconocida (formato_version_id nulo): no admite casillas', NEW.reporte_id;
    ELSIF NOT v_en_version THEN
        RAISE EXCEPTION 'El indicador % no pertenece a la estructura con que se leyó el reporte %', NEW.indicador_id, NEW.reporte_id;
    END IF;
    IF v_granularidad = 'diaria' AND (NEW.dia IS NULL OR NEW.dia > v_dias) THEN
        RAISE EXCEPTION 'Día % fuera del periodo del reporte % (tiene % días)', NEW.dia, NEW.reporte_id, v_dias;
    ELSIF v_granularidad = 'mensual' AND NEW.dia IS NOT NULL THEN
        RAISE EXCEPTION 'El formato del reporte % es mensual: la casilla no lleva día', NEW.reporte_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_valor_validar
    BEFORE INSERT OR UPDATE OF reporte_id, indicador_id, dia ON reporte.valor
    FOR EACH ROW EXECUTE FUNCTION reporte.fn_validar_valor();

-- Un reporte que ya salió del área no admite cambios en sus casillas: solo se
-- editan en borrador (tras "rectificar" vuelve a borrador).
CREATE OR REPLACE FUNCTION reporte.fn_valor_solo_en_borrador()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_estado VARCHAR(20);
BEGIN
    SELECT e.codigo INTO v_estado
      FROM reporte.reporte r JOIN reporte.estado_reporte e ON e.id = r.estado_reporte_id
     WHERE r.id = COALESCE(NEW.reporte_id, OLD.reporte_id);
    IF v_estado <> 'borrador' THEN
        RAISE EXCEPTION 'El reporte % está en estado «%»: sus casillas ya no se editan', COALESCE(NEW.reporte_id, OLD.reporte_id), v_estado;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tg_valor_solo_en_borrador
    BEFORE INSERT OR UPDATE ON reporte.valor
    FOR EACH ROW EXECUTE FUNCTION reporte.fn_valor_solo_en_borrador();

-- Una versión solo se activa si su configuración de lectura está completa:
-- tipo de archivo, al menos un criterio de reconocimiento obligatorio, hoja en
-- cada cuadro, días ubicados en cada cuadro (si el formato es diario) y
-- método + ubicación en cada indicador. Así el bot nunca recibe una
-- configuración a medias.
CREATE OR REPLACE FUNCTION formato.fn_validar_activacion()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_faltas TEXT[] := '{}';
    v_granularidad VARCHAR(15);
BEGIN
    IF NEW.estado <> 'activa' OR (TG_OP = 'UPDATE' AND OLD.estado = 'activa') THEN
        RETURN NEW;
    END IF;

    SELECT granularidad INTO v_granularidad FROM formato.formato WHERE id = NEW.formato_id;

    IF NEW.tipo_archivo IS NULL THEN
        v_faltas := array_append(v_faltas, 'tipo_archivo');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM formato.criterio_reconocimiento
                    WHERE formato_version_id = NEW.id AND es_obligatorio AND fecha_eliminacion IS NULL) THEN
        v_faltas := array_append(v_faltas, 'al menos un criterio de reconocimiento obligatorio');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM formato.version_indicador
                    WHERE formato_version_id = NEW.id AND fecha_eliminacion IS NULL) THEN
        v_faltas := array_append(v_faltas, 'indicadores de la versión');
    END IF;
    IF EXISTS (SELECT 1 FROM formato.cuadro
                WHERE formato_version_id = NEW.id AND fecha_eliminacion IS NULL
                  AND (hoja IS NULL OR (v_granularidad = 'diaria' AND ubicacion IS NULL))) THEN
        v_faltas := array_append(v_faltas, 'hoja o ubicación de días en algún cuadro');
    END IF;
    IF EXISTS (SELECT 1 FROM formato.version_indicador
                WHERE formato_version_id = NEW.id AND fecha_eliminacion IS NULL
                  AND (metodo_lectura IS NULL OR ubicacion IS NULL)) THEN
        v_faltas := array_append(v_faltas, 'método o ubicación en algún indicador');
    END IF;

    IF cardinality(v_faltas) > 0 THEN
        RAISE EXCEPTION 'La versión % no se puede activar; falta: %', NEW.codigo_version, array_to_string(v_faltas, '; ');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_formato_version_activacion
    BEFORE INSERT OR UPDATE OF estado ON formato.formato_version
    FOR EACH ROW EXECUTE FUNCTION formato.fn_validar_activacion();

-- Una configuración que ya leyó al menos un archivo aceptado queda congelada:
-- cambiarla haría que esos reportes ya no se puedan explicar ni reprocesar
-- igual. Para cambiar dónde se lee un dato, se crea otra versión.
CREATE OR REPLACE FUNCTION formato.fn_congelar_configuracion()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_version_id BIGINT := COALESCE(NEW.formato_version_id, OLD.formato_version_id);
BEGIN
    IF EXISTS (SELECT 1 FROM reporte.carga
                WHERE formato_version_id = v_version_id AND resultado = 'aceptada' AND fecha_eliminacion IS NULL) THEN
        RAISE EXCEPTION 'La versión % ya leyó archivos aceptados: su configuración no se modifica. Cree una versión nueva.', v_version_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tg_criterio_reconocimiento_congelado
    BEFORE INSERT OR UPDATE OR DELETE ON formato.criterio_reconocimiento
    FOR EACH ROW EXECUTE FUNCTION formato.fn_congelar_configuracion();
CREATE TRIGGER tg_cuadro_congelado
    BEFORE INSERT OR UPDATE OR DELETE ON formato.cuadro
    FOR EACH ROW EXECUTE FUNCTION formato.fn_congelar_configuracion();
CREATE TRIGGER tg_version_indicador_congelado
    BEFORE INSERT OR UPDATE OR DELETE ON formato.version_indicador
    FOR EACH ROW EXECUTE FUNCTION formato.fn_congelar_configuracion();

-- Una carga aceptada debe traer la estructura reconocida, y esa estructura
-- debe ser una versión activa del mismo formato que el reporte.
CREATE OR REPLACE FUNCTION reporte.fn_validar_carga()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_ok BOOLEAN;
BEGIN
    IF NEW.resultado <> 'aceptada' THEN
        RETURN NEW;
    END IF;
    IF NEW.formato_version_id IS NULL THEN
        RAISE EXCEPTION 'Una carga aceptada debe indicar la estructura reconocida (formato_version_id)';
    END IF;
    SELECT fv.estado = 'activa' AND fv.formato_id = r.formato_id
      INTO v_ok
      FROM formato.formato_version fv, reporte.reporte r
     WHERE fv.id = NEW.formato_version_id AND r.id = NEW.reporte_id;
    IF NOT COALESCE(v_ok, FALSE) THEN
        RAISE EXCEPTION 'La estructura % no es una versión activa del formato del reporte %', NEW.formato_version_id, NEW.reporte_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_carga_validar
    BEFORE INSERT OR UPDATE OF resultado, formato_version_id ON reporte.carga
    FOR EACH ROW EXECUTE FUNCTION reporte.fn_validar_carga();
