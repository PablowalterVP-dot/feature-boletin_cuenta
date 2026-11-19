-- =============================================================================
-- Avance 04 · Vistas
--
-- Los totales no se guardan: se calculan aquí a partir de reporte.valor.
-- Así un dato corregido corrige todos los consolidados, sin recalcular nada.
-- Todas las vistas excluyen lo eliminado lógicamente.
-- =============================================================================

-- Dimensiones de cada indicador como objeto JSON:
--   {"poblacion": "paciente", "servicio": "emergencia", "comida": "cena", "financiador": "sis"}
CREATE OR REPLACE VIEW formato.v_indicador_dimension AS
SELECT i.id AS indicador_id,
       i.formato_id,
       i.codigo AS indicador_codigo,
       COALESCE(jsonb_object_agg(d.codigo, dv.codigo) FILTER (WHERE d.id IS NOT NULL), '{}'::jsonb) AS dimensiones
  FROM formato.indicador i
  LEFT JOIN formato.indicador_dimension idm ON idm.indicador_id = i.id AND idm.fecha_eliminacion IS NULL
  LEFT JOIN formato.dimension_valor dv      ON dv.id = idm.dimension_valor_id
  LEFT JOIN formato.dimension d             ON d.id = idm.dimension_id
 WHERE i.fecha_eliminacion IS NULL
 GROUP BY i.id, i.formato_id, i.codigo;

-- Dimensiones de cada meta, con la misma forma.
CREATE OR REPLACE VIEW formato.v_meta AS
SELECT m.id AS meta_id, m.formato_id, m.anio, m.mes, m.descripcion, m.valor,
       COALESCE(jsonb_object_agg(d.codigo, dv.codigo) FILTER (WHERE d.id IS NOT NULL), '{}'::jsonb) AS dimensiones
  FROM formato.meta m
  LEFT JOIN formato.meta_dimension md  ON md.meta_id = m.id AND md.fecha_eliminacion IS NULL
  LEFT JOIN formato.dimension_valor dv ON dv.id = md.dimension_valor_id
  LEFT JOIN formato.dimension d        ON d.id = md.dimension_id
 WHERE m.fecha_eliminacion IS NULL
 GROUP BY m.id;

-- Cada casilla con su contexto: área, periodo, estado, fecha y dimensiones.
-- Es la vista base para exportar "los datos" de cualquier área.
CREATE OR REPLACE VIEW reporte.v_valor_detalle AS
SELECT v.id               AS valor_id,
       r.id               AS reporte_id,
       u.codigo           AS unidad_codigo,
       f.codigo           AS formato_codigo,
       p.anio, p.mes,
       e.codigo           AS estado,
       r.numero_rectificacion,
       cu.codigo          AS cuadro_codigo,
       i.codigo           AS indicador_codigo,
       i.nombre           AS indicador_nombre,
       v.dia,
       CASE WHEN v.dia IS NOT NULL THEN make_date(p.anio, p.mes, v.dia) END AS fecha,
       v.valor,
       v.origen,
       vd.dimensiones
  FROM reporte.valor v
  JOIN reporte.reporte r              ON r.id = v.reporte_id AND r.fecha_eliminacion IS NULL
  JOIN reporte.estado_reporte e       ON e.id = r.estado_reporte_id
  JOIN organizacion.periodo p         ON p.id = r.periodo_id
  JOIN formato.formato f              ON f.id = r.formato_id
  JOIN organizacion.unidad_organica u ON u.id = f.unidad_organica_id
  JOIN formato.indicador i            ON i.id = v.indicador_id
  JOIN formato.v_indicador_dimension vd ON vd.indicador_id = i.id
  LEFT JOIN formato.version_indicador vi ON vi.formato_version_id = r.formato_version_id
                                        AND vi.indicador_id = i.id AND vi.fecha_eliminacion IS NULL
  LEFT JOIN formato.cuadro cu         ON cu.id = vi.cuadro_id
 WHERE v.fecha_eliminacion IS NULL;

-- Total del mes por indicador y completitud (casillas llenas / esperadas).
CREATE OR REPLACE VIEW reporte.v_total_indicador AS
SELECT r.id AS reporte_id, p.anio, p.mes, f.codigo AS formato_codigo,
       vi.cuadro_id, i.id AS indicador_id, i.codigo AS indicador_codigo,
       SUM(v.valor)                                         AS total,
       COUNT(v.valor)                                       AS casillas_con_dato,
       CASE f.granularidad
            WHEN 'diaria' THEN EXTRACT(DAY FROM p.fecha_fin)::INT
            ELSE 1 END                                      AS casillas_esperadas
  FROM reporte.reporte r
  JOIN organizacion.periodo p           ON p.id = r.periodo_id
  JOIN formato.formato f                ON f.id = r.formato_id
  JOIN formato.version_indicador vi     ON vi.formato_version_id = r.formato_version_id AND vi.fecha_eliminacion IS NULL
  JOIN formato.indicador i              ON i.id = vi.indicador_id
  LEFT JOIN reporte.valor v             ON v.reporte_id = r.id AND v.indicador_id = i.id AND v.fecha_eliminacion IS NULL
 WHERE r.fecha_eliminacion IS NULL
 GROUP BY r.id, p.anio, p.mes, f.codigo, f.granularidad, p.fecha_fin, vi.cuadro_id, i.id, i.codigo;

-- -----------------------------------------------------------------------------
-- Nutrición
-- -----------------------------------------------------------------------------

-- Raciones del mes por población y servicio: es el cuadro "total de raciones
-- atendidas" de la ficha de Estadística y la sección C del formato DIRESA
-- (para pacientes / para personal × servicio).
CREATE OR REPLACE VIEW reporte.v_nutricion_mensual AS
SELECT d.reporte_id, d.anio, d.mes, d.estado,
       d.dimensiones ->> 'poblacion' AS poblacion,
       d.dimensiones ->> 'servicio'  AS servicio,
       SUM(d.valor)                  AS raciones
  FROM reporte.v_valor_detalle d
 WHERE d.formato_codigo = 'NUT'
 GROUP BY d.reporte_id, d.anio, d.mes, d.estado, d.dimensiones ->> 'poblacion', d.dimensiones ->> 'servicio';

-- Raciones del mes por comida (desayuno / almuerzo / cena).
CREATE OR REPLACE VIEW reporte.v_nutricion_por_comida AS
SELECT d.reporte_id, d.anio, d.mes, d.estado,
       d.dimensiones ->> 'poblacion' AS poblacion,
       d.dimensiones ->> 'servicio'  AS servicio,
       d.dimensiones ->> 'comida'    AS comida,
       SUM(d.valor)                  AS raciones
  FROM reporte.v_valor_detalle d
 WHERE d.formato_codigo = 'NUT'
 GROUP BY 1, 2, 3, 4, 5, 6, 7;

-- Resumen anual con la forma de la ficha de Estadística (Hoja2): una fila por
-- población × servicio, subtotales por población y total general; doce meses,
-- total anual y meta anual. Solo cuenta reportes validados o remitidos.
CREATE OR REPLACE VIEW reporte.v_nutricion_resumen_anual AS
WITH base AS (
    SELECT anio, mes, poblacion, servicio, raciones
      FROM reporte.v_nutricion_mensual
     WHERE estado IN ('validado', 'remitido')
), agrupado AS (
    SELECT anio, poblacion, servicio,
           GROUPING(poblacion)::INT + GROUPING(servicio)::INT AS nivel,   -- 0 detalle, 1 subtotal, 2 total
           SUM(raciones) FILTER (WHERE mes = 1)  AS enero,
           SUM(raciones) FILTER (WHERE mes = 2)  AS febrero,
           SUM(raciones) FILTER (WHERE mes = 3)  AS marzo,
           SUM(raciones) FILTER (WHERE mes = 4)  AS abril,
           SUM(raciones) FILTER (WHERE mes = 5)  AS mayo,
           SUM(raciones) FILTER (WHERE mes = 6)  AS junio,
           SUM(raciones) FILTER (WHERE mes = 7)  AS julio,
           SUM(raciones) FILTER (WHERE mes = 8)  AS agosto,
           SUM(raciones) FILTER (WHERE mes = 9)  AS setiembre,
           SUM(raciones) FILTER (WHERE mes = 10) AS octubre,
           SUM(raciones) FILTER (WHERE mes = 11) AS noviembre,
           SUM(raciones) FILTER (WHERE mes = 12) AS diciembre,
           SUM(raciones)                         AS total_anual
      FROM base
     GROUP BY GROUPING SETS ((anio, poblacion, servicio), (anio, poblacion), (anio))
)
SELECT a.*,
       m.valor AS meta_anual
  FROM agrupado a
  LEFT JOIN formato.v_meta m
         ON m.formato_id = (SELECT id FROM formato.formato WHERE codigo = 'NUT' AND fecha_eliminacion IS NULL)
        AND m.anio = a.anio AND m.mes IS NULL
        AND m.dimensiones = jsonb_strip_nulls(jsonb_build_object('poblacion', a.poblacion, 'servicio', a.servicio));

-- -----------------------------------------------------------------------------
-- Cumplimiento (semáforo)
-- -----------------------------------------------------------------------------

-- Un renglón por periodo × formato activo, exista o no el reporte.
-- "espera" separa el atraso del área del atraso de Estadística.
CREATE OR REPLACE VIEW reporte.v_cumplimiento AS
SELECT p.id AS periodo_id, p.anio, p.mes, p.fecha_limite_entrega,
       u.codigo AS unidad_codigo, u.nombre AS unidad_nombre,
       f.id AS formato_id, f.codigo AS formato_codigo,
       r.id AS reporte_id,
       COALESCE(e.codigo, 'no_iniciado') AS estado,
       r.fecha_envio,
       CASE
           WHEN e.codigo IS NULL OR e.codigo = 'borrador'     THEN 'area'
           WHEN e.codigo IN ('enviado', 'en_revision', 'validado') THEN 'estadistica'
           ELSE 'nadie'
       END AS espera,
       CASE
           WHEN r.fecha_envio IS NOT NULL AND r.fecha_envio::DATE <= p.fecha_limite_entrega THEN 'a_tiempo'
           WHEN r.fecha_envio IS NOT NULL                                                   THEN 'fuera_de_plazo'
           WHEN current_date <= p.fecha_limite_entrega                                      THEN 'pendiente'
           ELSE 'vencido'
       END AS semaforo
  FROM organizacion.periodo p
  CROSS JOIN formato.formato f
  JOIN organizacion.unidad_organica u ON u.id = f.unidad_organica_id
  LEFT JOIN reporte.reporte r         ON r.formato_id = f.id AND r.periodo_id = p.id AND r.fecha_eliminacion IS NULL
  LEFT JOIN reporte.estado_reporte e  ON e.id = r.estado_reporte_id
 WHERE p.fecha_eliminacion IS NULL
   AND f.fecha_eliminacion IS NULL
   AND f.es_activo;

-- Permisos efectivos de cada usuario, con el ámbito en que los tiene
-- (unidad_organica_id nulo = en todo el sistema). La API consulta esta vista.
CREATE OR REPLACE VIEW seguridad.v_permiso_usuario AS
SELECT DISTINCT ur.usuario_id, ur.unidad_organica_id, r.codigo AS rol_codigo, p.codigo AS permiso_codigo
  FROM seguridad.usuario_rol ur
  JOIN seguridad.usuario us    ON us.id = ur.usuario_id AND us.es_activo AND us.fecha_eliminacion IS NULL
  JOIN seguridad.rol r         ON r.id = ur.rol_id AND r.fecha_eliminacion IS NULL
  JOIN seguridad.rol_permiso rp ON rp.rol_id = r.id AND rp.fecha_eliminacion IS NULL
  JOIN seguridad.permiso p     ON p.id = rp.permiso_id AND p.fecha_eliminacion IS NULL
 WHERE ur.fecha_eliminacion IS NULL;

-- -----------------------------------------------------------------------------
-- Configuración de lectura para el bot (avance 04)
-- -----------------------------------------------------------------------------

-- Un documento JSON por versión de estructura: todo lo que el bot en Node
-- necesita para reconocer el Excel propio del área, leerlo y validarlo.
-- FastAPI lo entrega al bot en cada carga (las versiones ACTIVAS del formato);
-- el bot no consulta la BD directamente.
CREATE OR REPLACE VIEW formato.v_configuracion_lectura AS
SELECT fv.id AS formato_version_id,
       f.codigo AS formato_codigo,
       fv.codigo_version,
       fv.estado,
       jsonb_build_object(
           'formato',         f.codigo,
           'unidad',          u.codigo,
           'version',         fv.codigo_version,
           'granularidad',    f.granularidad,
           'tipo_archivo',    fv.tipo_archivo,
           'lectura_periodo', fv.lectura_periodo,
           'criterios', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                          'tipo', c.tipo, 'hoja', c.hoja, 'es_patron', c.es_patron,
                          'celda', c.celda, 'texto_esperado', c.texto_esperado,
                          'es_obligatorio', c.es_obligatorio) ORDER BY c.id)
                 FROM formato.criterio_reconocimiento c
                WHERE c.formato_version_id = fv.id AND c.fecha_eliminacion IS NULL), '[]'::jsonb),
           'cuadros', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                          'codigo', cu.codigo, 'titulo', cu.titulo,
                          'hoja', cu.hoja, 'es_hoja_patron', cu.es_hoja_patron,
                          'ubicacion', cu.ubicacion,
                          'indicadores', COALESCE((
                              SELECT jsonb_agg(jsonb_build_object(
                                         'codigo', i.codigo, 'nombre', i.nombre, 'etiqueta', vi.etiqueta,
                                         'tipo_dato', i.tipo_dato, 'valor_minimo', i.valor_minimo,
                                         'valor_maximo', i.valor_maximo, 'es_obligatorio', i.es_obligatorio,
                                         'metodo_lectura', vi.metodo_lectura, 'ubicacion', vi.ubicacion,
                                         'ubicacion_total', vi.ubicacion_total) ORDER BY vi.orden)
                                FROM formato.version_indicador vi
                                JOIN formato.indicador i ON i.id = vi.indicador_id
                               WHERE vi.cuadro_id = cu.id AND vi.fecha_eliminacion IS NULL), '[]'::jsonb)
                      ) ORDER BY cu.orden)
                 FROM formato.cuadro cu
                WHERE cu.formato_version_id = fv.id AND cu.fecha_eliminacion IS NULL), '[]'::jsonb),
           'reglas', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                          'codigo', r.codigo, 'nivel', r.nivel, 'parametros', r.parametros) ORDER BY r.id)
                 FROM formato.regla_validacion r
                WHERE r.formato_id = f.id AND r.es_activo AND r.fecha_eliminacion IS NULL), '[]'::jsonb)
       ) AS configuracion
  FROM formato.formato_version fv
  JOIN formato.formato f              ON f.id = fv.formato_id
  JOIN organizacion.unidad_organica u ON u.id = f.unidad_organica_id
 WHERE fv.fecha_eliminacion IS NULL;
