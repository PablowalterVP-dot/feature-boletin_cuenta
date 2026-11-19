-- =============================================================================
-- Avance 04 · Prueba de punta a punta (se deshace al final: ROLLBACK)
--
-- Recorre: configurar la lectura del Excel propio del área → activarla →
-- crear el reporte → carga rechazada por estructura no reconocida → carga
-- aceptada → corregir una casilla → enviar → validar → remitir. Comprueba
-- auditoría, borrado lógico y físico, reglas de integridad y vistas.
--
-- TODAS LAS CIFRAS, USUARIOS, NOMBRES DE HOJA Y CELDAS SON FICTICIOS.
-- La configuración de lectura de abajo NO describe el Excel real de Nutrición
-- (no se tiene todavía) y el catálogo viene de 07_ejemplo_nutricion.sql,
-- basado en un oficio de ejemplo: solo ejercitan el modelo.
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- Catálogo de EJEMPLO de Nutrición (no real): cuadros, indicadores y grupos.
\ir 07_ejemplo_nutricion.sql

-- Usuarios de prueba --------------------------------------------------------
SELECT set_config('app.usuario_id', (SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'), true);

INSERT INTO seguridad.usuario (nombre_usuario, contrasena_hash, nombres, apellidos, cargo)
VALUES ('digitador.nut', 'x', 'Usuario', 'Ficticio Uno', 'Digitador de prueba'),
       ('revisor.est',   'x', 'Usuario', 'Ficticio Dos', 'Revisor de prueba'),
       ('consulta.pla',  'x', 'Usuario', 'Ficticio Tres', 'Consulta de prueba');

INSERT INTO seguridad.usuario_rol (usuario_id, rol_id, unidad_organica_id)
SELECT u.id, r.id, uo.id
  FROM (VALUES ('digitador.nut', 'digitador', 'NUT'),
               ('revisor.est',   'revisor',   NULL),
               ('consulta.pla',  'consulta',  'PLA')) AS x (usuario, rol, unidad)
  JOIN seguridad.usuario u ON u.nombre_usuario = x.usuario
  JOIN seguridad.rol r     ON r.codigo = x.rol
  LEFT JOIN organizacion.unidad_organica uo ON uo.codigo = x.unidad;

-- Un rol global no se ata a una unidad.
DO $$
BEGIN
    INSERT INTO seguridad.usuario_rol (usuario_id, rol_id, unidad_organica_id)
    SELECT u.id, r.id, uo.id FROM seguridad.usuario u, seguridad.rol r, organizacion.unidad_organica uo
     WHERE u.nombre_usuario = 'revisor.est' AND r.codigo = 'revisor' AND uo.codigo = 'EST';
    RAISE EXCEPTION 'FALLO: se aceptó un rol global con unidad';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK · rol global con unidad rechazado: %', SQLERRM;
END $$;

-- Meta anual de prueba: pacientes de hospitalización 2026.
INSERT INTO formato.meta (formato_id, anio, descripcion, valor)
SELECT id, 2026, 'Meta de prueba · pacientes hospitalización', 50000 FROM formato.formato WHERE codigo = 'NUT';
INSERT INTO formato.meta_dimension (meta_id, dimension_id, dimension_valor_id)
SELECT (SELECT max(id) FROM formato.meta), dv.dimension_id, dv.id
  FROM formato.dimension_valor dv JOIN formato.dimension d ON d.id = dv.dimension_id
 WHERE (d.codigo, dv.codigo) IN (('poblacion', 'paciente'), ('servicio', 'hospitalizacion'));

-- Configuración de lectura (superadmin) ------------------------------------
-- Activar NUT-1 sin configurar debe fallar.
DO $$
BEGIN
    UPDATE formato.formato_version SET estado = 'activa' WHERE codigo_version = 'NUT-1';
    RAISE EXCEPTION 'FALLO: se activó una versión sin configurar';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK · activación incompleta rechazada: %', SQLERRM;
END $$;

-- Configuración FICTICIA: cuatro hojas, días en la fila 3 desde la columna C,
-- cada fila se encuentra por su texto en las columnas A (grupo) y B (comida),
-- total del Excel en la columna AG.
UPDATE formato.formato_version SET tipo_archivo = 'xlsx',
       lectura_periodo = '{"hoja": "HOSP. COMENSALES", "celda": "A1", "patron": "(?i)(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\\s+(\\d{4})"}'
 WHERE codigo_version = 'NUT-1';

INSERT INTO formato.criterio_reconocimiento (formato_version_id, tipo, hoja, celda, texto_esperado, descripcion)
SELECT fv.id, c.tipo, c.hoja, c.celda, c.texto, 'Ficticio'
  FROM formato.formato_version fv,
       (VALUES ('hoja_existe', 'HOSP. COMENSALES', NULL, NULL),
               ('hoja_existe', 'HOSP. PACIENTES',  NULL, NULL),
               ('celda_texto', 'HOSP. PACIENTES',  'A2', '(?i)pacientes.*hospitalizaci')) AS c (tipo, hoja, celda, texto)
 WHERE fv.codigo_version = 'NUT-1';

UPDATE formato.cuadro cu
   SET hoja = h.hoja,
       ubicacion = '{"orientacion": "horizontal", "fila_dias": 3, "columna_primer_dia": "C"}'
  FROM (VALUES ('f1', 'HOSP. COMENSALES'), ('f2', 'EMERG. COMENSALES'),
               ('f3', 'HOSP. PACIENTES'),  ('f4', 'EMERG. PACIENTES')) AS h (codigo, hoja)
 WHERE cu.codigo = h.codigo;

UPDATE formato.version_indicador vi
   SET metodo_lectura = 'etiqueta',
       etiqueta = g.nombre || ' · ' || co.nombre,
       ubicacion = jsonb_build_object('etiquetas', jsonb_build_array(g.nombre, co.nombre),
                                      'columnas', jsonb_build_array('A', 'B'),
                                      'arrastrar_vacias', true),
       ubicacion_total = '{"columna": "AG"}'
  FROM formato.indicador_dimension ig
  JOIN formato.dimension dg       ON dg.id = ig.dimension_id AND dg.codigo IN ('grupo_comensal', 'tipo_dieta', 'financiador')
  JOIN formato.dimension_valor g  ON g.id = ig.dimension_valor_id,
       formato.indicador_dimension ic
  JOIN formato.dimension dc       ON dc.id = ic.dimension_id AND dc.codigo = 'comida'
  JOIN formato.dimension_valor co ON co.id = ic.dimension_valor_id
 WHERE ig.indicador_id = vi.indicador_id AND ic.indicador_id = vi.indicador_id;

UPDATE formato.formato_version SET estado = 'activa' WHERE codigo_version = 'NUT-1';

-- Una ubicación mal formada la rechaza el CHECK.
DO $$
BEGIN
    UPDATE formato.version_indicador SET metodo_lectura = 'rango', ubicacion = '{"celda": "C5"}' WHERE id = (SELECT min(id) FROM formato.version_indicador);
    RAISE EXCEPTION 'FALLO: se aceptó una ubicación mal formada';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK · ubicación mal formada rechazada: %', SQLERRM;
END $$;

-- El digitador crea el reporte de junio 2026 y sube el Excel ---------------
SELECT set_config('app.usuario_id', (SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'digitador.nut'), true);
SELECT set_config('app.direccion_ip', '10.0.0.15', true);

-- El reporte nace sin estructura: todavía no se sabe con qué Excel vendrá.
INSERT INTO reporte.reporte (formato_id, periodo_id, estado_reporte_id)
SELECT f.id, p.id, e.id
  FROM formato.formato f
  JOIN organizacion.periodo p     ON p.anio = 2026 AND p.mes = 6
  JOIN reporte.estado_reporte e   ON e.codigo = 'borrador'
 WHERE f.codigo = 'NUT';

INSERT INTO reporte.reporte_historial_estado (reporte_id, estado_destino_id, accion)
SELECT r.id, r.estado_reporte_id, 'crear' FROM reporte.reporte r;

INSERT INTO reporte.archivo (nombre_original, ruta_almacenamiento, tipo_mime, tamano_bytes, huella_sha256, proposito)
VALUES ('Nutricion_2026-06.xlsx', 'cargas/2026/06/NUT/prueba.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 82311, repeat('ab', 32), 'carga');

-- Primer intento: el área sube otro Excel que no cumple ningún criterio.
INSERT INTO reporte.archivo (nombre_original, ruta_almacenamiento, tipo_mime, tamano_bytes, huella_sha256, proposito)
VALUES ('otro_archivo.xlsx', 'cargas/2026/06/NUT/otro.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 15000, repeat('cd', 32), 'carga');
INSERT INTO reporte.carga (reporte_id, archivo_id, version_bot, resultado, codigo_bloqueo, detalle_bloqueo)
SELECT r.id, a.id, '0.3.0', 'bloqueada', 'estructura_no_reconocida',
       'El archivo no coincide con ninguna estructura activa de Nutrición.'
  FROM reporte.reporte r, reporte.archivo a WHERE a.nombre_original = 'otro_archivo.xlsx';

-- Sin estructura reconocida el reporte no admite casillas.
DO $$
BEGIN
    INSERT INTO reporte.valor (reporte_id, indicador_id, dia, valor, origen)
    SELECT r.id, i.id, 1, 1, 'manual' FROM reporte.reporte r, formato.indicador i WHERE i.codigo = 'f1.asistencial.desayuno';
    RAISE EXCEPTION 'FALLO: se aceptó una casilla sin estructura';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK · casilla sin estructura rechazada: %', SQLERRM;
END $$;

-- Segundo intento: el Excel correcto. El bot reconoce NUT-1 y la carga
-- aceptada fija la estructura del reporte.
INSERT INTO reporte.carga (reporte_id, archivo_id, formato_version_id, version_bot, resultado, casillas_leidas, total_avisos, es_vigente)
SELECT r.id, a.id, fv.id, '0.3.0', 'aceptada', 1116, 1, TRUE
  FROM reporte.reporte r, reporte.archivo a, formato.formato_version fv
 WHERE a.nombre_original = 'Nutricion_2026-06.xlsx' AND fv.codigo_version = 'NUT-1';
UPDATE reporte.reporte r SET formato_version_id = c.formato_version_id
  FROM reporte.carga c WHERE c.reporte_id = r.id AND c.es_vigente;

-- Una configuración que ya leyó un archivo aceptado queda congelada.
DO $$
BEGIN
    UPDATE formato.cuadro SET hoja = 'OTRA HOJA' WHERE codigo = 'f1';
    RAISE EXCEPTION 'FALLO: se modificó una configuración en uso';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK · configuración en uso congelada: %', SQLERRM;
END $$;

-- Lo que leyó el bot se guarda en masa: con app.carga_id fijado, la bitácora
-- registra un resumen por tabla en lugar de una fila por casilla.
SELECT set_config('app.carga_id', (SELECT id::TEXT FROM reporte.carga WHERE es_vigente), true);

-- 36 filas × 30 días, cifra ficticia = 10 por casilla. La celda de origen la
-- informaría el bot; aquí se simula: días desde la columna C, fila = orden.
INSERT INTO reporte.valor (reporte_id, indicador_id, dia, valor, origen, carga_id, hoja_excel, celda_excel)
SELECT r.id, vi.indicador_id, d, 10, 'archivo', c.id, cu.hoja,
       CASE WHEN d <= 24 THEN chr(66 + d) ELSE 'A' || chr(64 + d - 24) END || (3 + vi.orden)
  FROM reporte.reporte r
  JOIN reporte.carga c              ON c.reporte_id = r.id AND c.es_vigente
  JOIN formato.version_indicador vi ON vi.formato_version_id = r.formato_version_id
  JOIN formato.cuadro cu            ON cu.id = vi.cuadro_id
 CROSS JOIN generate_series(1, 30) AS d;

-- Hallazgo del bot con su justificación.
INSERT INTO reporte.hallazgo (carga_id, regla_validacion_id, nivel, clave_hallazgo, indicador_id, dia, titulo, justificacion, fecha_justificacion, usuario_justificacion_id)
SELECT c.id, rv.id, 'aviso', 'atipico|f3|liquida.cena|21', i.id, 21, '100 raciones: el resto del mes ronda las 10',
       'Justificación de prueba', now(), auditoria.fn_usuario_actual()
  FROM reporte.carga c, formato.regla_validacion rv, formato.indicador i
 WHERE c.es_vigente AND rv.codigo = 'atipico' AND i.codigo = 'f3.liquida.cena';

-- Termina la carga masiva: lo que sigue (correcciones, envío…) se audita fila por fila.
SELECT set_config('app.carga_id', '', true);

-- Día 31 no existe en junio.
DO $$
BEGIN
    INSERT INTO reporte.valor (reporte_id, indicador_id, dia, valor, origen)
    SELECT r.id, i.id, 31, 1, 'manual' FROM reporte.reporte r, formato.indicador i WHERE i.codigo = 'f1.asistencial.desayuno';
    RAISE EXCEPTION 'FALLO: se aceptó el día 31 de junio';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK · día fuera del mes rechazado: %', SQLERRM;
END $$;

-- Corrección manual de una casilla (queda en la bitácora).
UPDATE reporte.valor v SET valor = 100, origen = 'manual'
  FROM formato.indicador i
 WHERE i.id = v.indicador_id AND i.codigo = 'f3.liquida.cena' AND v.dia = 21;

-- Borrado físico permitido (observación 02): se borra un total declarado y
-- queda la fila completa en la bitácora.
INSERT INTO reporte.total_declarado (carga_id, cuadro_id, indicador_id, valor)
SELECT c.id, cu.id, NULL, 999 FROM reporte.carga c, formato.cuadro cu WHERE c.es_vigente AND cu.codigo = 'f1';
DELETE FROM reporte.total_declarado WHERE valor = 999;

-- Pero no deja huérfanos: un reporte con casillas no se borra (FK sin cascada).
DO $$
BEGIN
    DELETE FROM reporte.reporte;
    RAISE EXCEPTION 'FALLO: se borró un reporte con casillas';
EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK · DELETE de reporte con hijos rechazado por FK: %', SQLERRM;
END $$;

-- Envío ----------------------------------------------------------------------
UPDATE reporte.reporte r
   SET estado_reporte_id = (SELECT id FROM reporte.estado_reporte WHERE codigo = 'enviado'),
       fecha_envio = TIMESTAMPTZ '2026-07-08 10:30-05', usuario_envio_id = auditoria.fn_usuario_actual(),
       folio_constancia = 'NUT-2026-06-0001';

-- Planeamiento recibe al enviar, sin validar (entrega inmediata de la matriz).
INSERT INTO reporte.remision (reporte_id, unidad_destino_id, es_sin_validar, usuario_remision_id)
SELECT r.id, d.unidad_destino_id, TRUE, auditoria.fn_usuario_actual()
  FROM reporte.reporte r
  JOIN formato.formato f       ON f.id = r.formato_id
  JOIN organizacion.destino d  ON d.unidad_origen_id = f.unidad_organica_id AND d.es_entrega_inmediata;

-- Ya enviado: las casillas no se editan.
DO $$
BEGIN
    UPDATE reporte.valor SET valor = 11 WHERE dia = 1;
    RAISE EXCEPTION 'FALLO: se editó un reporte enviado';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK · edición de reporte enviado rechazada: %', SQLERRM;
END $$;

-- Estadística valida y remite -----------------------------------------------
SELECT set_config('app.usuario_id', (SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'revisor.est'), true);

UPDATE reporte.reporte
   SET estado_reporte_id = (SELECT id FROM reporte.estado_reporte WHERE codigo = 'validado'),
       fecha_validacion = now(), usuario_validacion_id = auditoria.fn_usuario_actual();
UPDATE reporte.reporte
   SET estado_reporte_id = (SELECT id FROM reporte.estado_reporte WHERE codigo = 'remitido');
INSERT INTO reporte.remision (reporte_id, unidad_destino_id, es_sin_validar, usuario_remision_id)
SELECT r.id, d.unidad_destino_id, FALSE, auditoria.fn_usuario_actual()
  FROM reporte.reporte r JOIN formato.formato f ON f.id = r.formato_id
  JOIN organizacion.destino d ON d.unidad_origen_id = f.unidad_organica_id;

-- Borrado lógico de un hallazgo (lo hace el revisor, para probar la marca).
UPDATE reporte.hallazgo SET fecha_eliminacion = now();

-- Resultados -----------------------------------------------------------------
\echo '--- Catálogo de Nutrición: indicadores por cuadro'
SELECT cu.codigo, cu.titulo, count(*) AS filas
  FROM formato.version_indicador vi JOIN formato.cuadro cu ON cu.id = vi.cuadro_id
 GROUP BY 1, 2 ORDER BY 1;

\echo '--- Configuración de lectura de muestra (FICTICIA)'
SELECT cu.hoja, vi.etiqueta, vi.metodo_lectura, vi.ubicacion ->> 'columnas' AS columnas, vi.ubicacion_total
  FROM formato.version_indicador vi JOIN formato.cuadro cu ON cu.id = vi.cuadro_id
  JOIN formato.indicador i ON i.id = vi.indicador_id
 WHERE i.codigo IN ('f3.liquida.cena', 'f4.sis.almuerzo') ORDER BY 1;

\echo '--- Cargas del reporte: la rechazada y la aceptada'
SELECT a.nombre_original, c.resultado, c.codigo_bloqueo, fv.codigo_version AS estructura, c.es_vigente
  FROM reporte.carga c JOIN reporte.archivo a ON a.id = c.archivo_id
  LEFT JOIN formato.formato_version fv ON fv.id = c.formato_version_id ORDER BY c.id;

\echo '--- Linaje de una casilla'
SELECT i.codigo, v.dia, v.valor, v.hoja_excel, v.celda_excel
  FROM reporte.valor v JOIN formato.indicador i ON i.id = v.indicador_id
 WHERE i.codigo = 'f3.liquida.cena' AND v.dia = 21;

\echo '--- Dimensiones de un indicador'
SELECT indicador_codigo, dimensiones FROM formato.v_indicador_dimension WHERE indicador_codigo IN ('f4.sis.cena', 'f1.int-nutricion.almuerzo');

\echo '--- Raciones del mes por población y servicio (esperado: 14/7/12/3 filas × 30 días × 10, +90 por la corrección)'
SELECT anio, mes, estado, poblacion, servicio, raciones FROM reporte.v_nutricion_mensual ORDER BY poblacion, servicio;

\echo '--- Resumen anual (forma de la ficha de Estadística)'
SELECT anio, nivel, poblacion, servicio, junio, total_anual, meta_anual
  FROM reporte.v_nutricion_resumen_anual ORDER BY nivel, poblacion, servicio;

\echo '--- Semáforo de junio 2026'
SELECT unidad_codigo, formato_codigo, estado, espera, semaforo FROM reporte.v_cumplimiento WHERE anio = 2026 AND mes = 6;

\echo '--- Remisiones'
SELECT u.codigo AS destino, r.es_sin_validar, r.es_vigente FROM reporte.remision r JOIN organizacion.unidad_organica u ON u.id = r.unidad_destino_id;

\echo '--- Bitácora del reporte'
SELECT operacion, usuario, campos_modificados
  FROM auditoria.fn_historial('reporte', 'reporte', (SELECT id FROM reporte.reporte));

\echo '--- Bitácora de la casilla corregida'
SELECT operacion, usuario, datos_anteriores ->> 'valor' AS antes, datos_nuevos ->> 'valor' AS despues
  FROM auditoria.fn_historial('reporte', 'valor',
       (SELECT v.id FROM reporte.valor v JOIN formato.indicador i ON i.id = v.indicador_id WHERE i.codigo = 'f3.liquida.cena' AND v.dia = 21));

\echo '--- Borrado lógico del hallazgo: la fecha en la tabla, el quién en la bitácora'
SELECT h.fecha_eliminacion IS NOT NULL AS eliminado, b.operacion, b.usuario AS eliminado_por
  FROM reporte.hallazgo h
 CROSS JOIN LATERAL auditoria.fn_historial('reporte', 'hallazgo', h.id) b
 WHERE b.operacion = 'ELIMINAR_LOGICO';

\echo '--- Borrado físico del total declarado: fila completa recuperable desde la bitácora'
SELECT operacion, usuario, datos_anteriores ->> 'valor' AS valor_borrado
  FROM auditoria.registro_cambio r
  CROSS JOIN LATERAL (SELECT nombre_usuario AS usuario FROM seguridad.usuario WHERE id = r.usuario_id) u
 WHERE tabla = 'total_declarado' AND operacion = 'ELIMINAR';

\echo '--- ¿Quién creó el reporte? (antes era usuario_creacion_id; ahora se consulta la bitácora)'
SELECT r.id AS reporte_id, r.fecha_creacion, u.nombre_usuario AS creado_por
  FROM reporte.reporte r
  JOIN auditoria.registro_cambio b ON b.esquema = 'reporte' AND b.tabla = 'reporte' AND b.registro_id = r.id AND b.operacion = 'INSERTAR'
  LEFT JOIN seguridad.usuario u ON u.id = b.usuario_id;

\echo '--- Carga masiva: una fila resumen por tabla (no 1 080 filas)'
SELECT tabla, operacion, registro_id AS carga_id, datos_nuevos ->> 'filas' AS filas
  FROM auditoria.registro_cambio WHERE operacion LIKE '%MASIVO' ORDER BY id;

\echo '--- Configuración que FastAPI entrega al bot (resumen de la vista)'
SELECT codigo_version, estado,
       configuracion ->> 'tipo_archivo'                    AS tipo_archivo,
       jsonb_array_length(configuracion -> 'criterios')    AS criterios,
       jsonb_array_length(configuracion -> 'cuadros')      AS cuadros,
       jsonb_array_length(configuracion -> 'reglas')       AS reglas,
       configuracion -> 'cuadros' -> 2 -> 'indicadores' -> 11 AS un_indicador
  FROM formato.v_configuracion_lectura;

\echo '--- Permiso de configurar lecturas: roles que lo tienen'
SELECT r.codigo FROM seguridad.rol r JOIN seguridad.rol_permiso rp ON rp.rol_id = r.id
  JOIN seguridad.permiso p ON p.id = rp.permiso_id WHERE p.codigo = 'formato.configurar_lectura' ORDER BY 1;

\echo '--- Operaciones registradas en la bitácora'
SELECT tabla, operacion, count(*) FROM auditoria.registro_cambio GROUP BY 1, 2 ORDER BY 1, 2;

\echo '--- La bitácora es inmutable'
DO $$
BEGIN
    UPDATE auditoria.registro_cambio SET usuario_id = NULL;
    RAISE EXCEPTION 'FALLO: se modificó la bitácora';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK · bitácora inmutable: %', SQLERRM;
END $$;

\echo '--- Permisos efectivos del digitador'
SELECT unidad_organica_id IS NOT NULL AS atado_a_unidad, string_agg(permiso_codigo, ', ' ORDER BY permiso_codigo) AS permisos
  FROM seguridad.v_permiso_usuario v JOIN seguridad.usuario u ON u.id = v.usuario_id
 WHERE u.nombre_usuario = 'digitador.nut' GROUP BY 1;

ROLLBACK;
