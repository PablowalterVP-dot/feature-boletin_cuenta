-- =============================================================================
-- Avance 04 · EJEMPLO de catálogo de Nutrición (NO forma parte de la instalación)
--
-- Cuadros, indicadores, grupos de comensales y tipos de dieta tomados del
-- oficio N.º 122-2026 del prototipo, que el usuario confirmó que es un
-- EJEMPLO y no un documento real. Sirve para que 06_prueba.sql tenga con qué
-- trabajar y para mostrar cómo se carga el catálogo de un área. Cuando se
-- tenga el Excel real de Nutrición, este archivo se reemplaza por su catálogo
-- verdadero.
--
-- Requiere 00_instalar.sql. Se ejecuta dentro de 06_prueba.sql (con ROLLBACK).
-- =============================================================================

SELECT set_config('app.usuario_id', (SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'), true);

-- Dimensiones y valores propios del ejemplo.
INSERT INTO formato.dimension (codigo, nombre, descripcion) VALUES
    ('grupo_comensal', 'Grupo de comensales', 'Grupo de personal que recibe la ración (EJEMPLO)'),
    ('tipo_dieta',     'Tipo de dieta',       'Régimen dietético del paciente (EJEMPLO)');

INSERT INTO formato.dimension_valor (dimension_id, codigo, nombre, orden)
SELECT d.id, v.codigo, v.nombre, v.orden
  FROM (VALUES
        ('grupo_comensal', 'asistencial',     'Asistencial y administrativo',   1),
        ('grupo_comensal', 'int-medicina',    'Internos de Medicina',           2),
        ('grupo_comensal', 'int-obstetricia', 'Internos de Obstetricia',        3),
        ('grupo_comensal', 'int-nutricion',   'Internos de Nutrición',          4),
        ('grupo_comensal', 'int-enfermeria',  'Internos de Enfermería',         5),
        ('grupo_comensal', 'direccion',       'Dirección General',              6),
        ('grupo_comensal', 'residuos',        'Residuos Sólidos',               7),
        ('grupo_comensal', 'nutricion',       'Dpto. de Nutrición y Dietética', 8),
        ('tipo_dieta',     'completa',        'Dieta completa',                 1),
        ('tipo_dieta',     'blanda',          'Dieta blanda',                   2),
        ('tipo_dieta',     'licuada',         'Dieta licuada',                  3),
        ('tipo_dieta',     'liquida',         'Dieta líquida',                  4),
        ('financiador',    'sis',             'SIS',                            1)
       ) AS v (dimension, codigo, nombre, orden)
  JOIN formato.dimension d ON d.codigo = v.dimension;

-- Cuadros del ejemplo. La hoja del Excel del área y la ubicación de los días
-- quedan nulas hasta configurar la lectura.
INSERT INTO formato.cuadro (formato_version_id, codigo, numero, titulo, descripcion, orden)
SELECT fv.id, c.codigo, c.numero, c.titulo, c.descripcion, c.numero
  FROM (VALUES
        ('f1', 1, 'Comensales · Hospitalización', 'Raciones servidas al personal asistencial, administrativo y a los internos, en el servicio de hospitalización.'),
        ('f2', 2, 'Comensales · Emergencia',      'Raciones servidas al personal desde el servicio de emergencia.'),
        ('f3', 3, 'Pacientes · Hospitalización',  'Raciones servidas a pacientes hospitalizados, por tipo de dieta.'),
        ('f4', 4, 'Pacientes · Emergencia',       'Raciones servidas a pacientes en emergencia.')
       ) AS c (codigo, numero, titulo, descripcion)
  JOIN formato.formato_version fv ON fv.codigo_version = 'NUT-1';

-- Filas de los cuatro cuadros: (cuadro, población, servicio, dimensión del
-- grupo, grupo, comidas). Se expanden a un indicador por grupo × comida.
CREATE TEMP TABLE tmp_fila_nut (cuadro TEXT, orden_grupo INT, poblacion TEXT, servicio TEXT, dim_grupo TEXT, grupo TEXT, comidas TEXT[]);
INSERT INTO tmp_fila_nut VALUES
    ('f1', 1, 'comensal', 'hospitalizacion', 'grupo_comensal', 'asistencial',     ARRAY['desayuno','almuerzo','cena']),
    ('f1', 2, 'comensal', 'hospitalizacion', 'grupo_comensal', 'int-medicina',    ARRAY['desayuno','almuerzo','cena']),
    ('f1', 3, 'comensal', 'hospitalizacion', 'grupo_comensal', 'int-obstetricia', ARRAY['desayuno','almuerzo','cena']),
    ('f1', 4, 'comensal', 'hospitalizacion', 'grupo_comensal', 'int-nutricion',   ARRAY['desayuno','almuerzo']),
    ('f1', 5, 'comensal', 'hospitalizacion', 'grupo_comensal', 'int-enfermeria',  ARRAY['desayuno','almuerzo','cena']),
    ('f2', 1, 'comensal', 'emergencia',      'grupo_comensal', 'direccion',       ARRAY['desayuno','almuerzo']),
    ('f2', 2, 'comensal', 'emergencia',      'grupo_comensal', 'residuos',        ARRAY['desayuno','almuerzo']),
    ('f2', 3, 'comensal', 'emergencia',      'grupo_comensal', 'nutricion',       ARRAY['desayuno','almuerzo','cena']),
    ('f3', 1, 'paciente', 'hospitalizacion', 'tipo_dieta',     'completa',        ARRAY['desayuno','almuerzo','cena']),
    ('f3', 2, 'paciente', 'hospitalizacion', 'tipo_dieta',     'blanda',          ARRAY['desayuno','almuerzo','cena']),
    ('f3', 3, 'paciente', 'hospitalizacion', 'tipo_dieta',     'licuada',         ARRAY['desayuno','almuerzo','cena']),
    ('f3', 4, 'paciente', 'hospitalizacion', 'tipo_dieta',     'liquida',         ARRAY['desayuno','almuerzo','cena']),
    ('f4', 1, 'paciente', 'emergencia',      'financiador',    'sis',             ARRAY['desayuno','almuerzo','cena']);

CREATE TEMP TABLE tmp_indicador_nut AS
SELECT f.cuadro, f.poblacion, f.servicio, f.dim_grupo, f.grupo, c.comida,
       f.orden_grupo * 10 + c.n                                    AS orden,
       f.cuadro || '.' || f.grupo || '.' || c.comida                AS codigo
  FROM tmp_fila_nut f
 CROSS JOIN LATERAL unnest(f.comidas) WITH ORDINALITY AS c (comida, n);

INSERT INTO formato.indicador (formato_id, codigo, nombre, tipo_dato, unidad_medida, valor_minimo, es_obligatorio)
SELECT fo.id, t.codigo, g.nombre || ' · ' || co.nombre, 'entero', 'raciones', 0, TRUE
  FROM tmp_indicador_nut t
  JOIN formato.formato fo ON fo.codigo = 'NUT'
  JOIN formato.dimension dg ON dg.codigo = t.dim_grupo
  JOIN formato.dimension_valor g  ON g.dimension_id = dg.id AND g.codigo = t.grupo
  JOIN formato.dimension dc ON dc.codigo = 'comida'
  JOIN formato.dimension_valor co ON co.dimension_id = dc.id AND co.codigo = t.comida;

-- Qué indicadores trae NUT-1. Método y ubicación de lectura: pendientes.
INSERT INTO formato.version_indicador (formato_version_id, cuadro_id, indicador_id, orden)
SELECT fv.id, cu.id, i.id, t.orden
  FROM tmp_indicador_nut t
  JOIN formato.formato fo          ON fo.codigo = 'NUT'
  JOIN formato.formato_version fv  ON fv.formato_id = fo.id AND fv.codigo_version = 'NUT-1'
  JOIN formato.cuadro cu           ON cu.formato_version_id = fv.id AND cu.codigo = t.cuadro
  JOIN formato.indicador i         ON i.formato_id = fo.id AND i.codigo = t.codigo;

-- Cada indicador con sus dimensiones: población, servicio, comida y su grupo.
INSERT INTO formato.indicador_dimension (indicador_id, dimension_id, dimension_valor_id)
SELECT i.id, dv.dimension_id, dv.id
  FROM tmp_indicador_nut t
  JOIN formato.formato fo   ON fo.codigo = 'NUT'
  JOIN formato.indicador i  ON i.formato_id = fo.id AND i.codigo = t.codigo
  CROSS JOIN LATERAL (VALUES ('poblacion', t.poblacion), ('servicio', t.servicio), ('comida', t.comida), (t.dim_grupo, t.grupo)) AS x (dimension, valor)
  JOIN formato.dimension d        ON d.codigo = x.dimension
  JOIN formato.dimension_valor dv ON dv.dimension_id = d.id AND dv.codigo = x.valor;

DROP TABLE tmp_indicador_nut;
DROP TABLE tmp_fila_nut;
