-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Seeder Opcional: cuentas de hospitalización para desarrollo y pruebas
--
-- Las nueve cuentas de los pisos con las que se probaba Egresos Hospitalarios, con
-- el mismo nombre de usuario (lo que registraron sigue a su nombre en la base de
-- hospitalización). La décima es `estadistica`, de usuarios_areas.sql: no se crea
-- aquí ni recibe nada, porque su rol `revisor` ya trae los módulos de hospitalización
-- (seeder 0011). Las cuentas llevan el nombre de su puesto, no el de una persona.
--
-- Contraseña para todas: 1234567890
-- Obligatorio cambiar contraseña al iniciar sesión: NO
-- Necesita los seeders 0009, 0010 y 0011 de hospitalización (roles y unidades).
--
-- Ejecución manual:
--   npm run seed:hospitalizacion
--   (o: python -m app.herramientas.bd seed:hospitalizacion)
-- =============================================================================

SELECT set_config('app.usuario_id', COALESCE((SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'), ''), false);

INSERT INTO seguridad.usuario (nombre_usuario, correo, contrasena_hash, nombres, apellidos, cargo, es_activo, debe_cambiar_contrasena)
SELECT u.nombre_usuario, NULL,
       '$argon2id$v=19$m=65536,t=3,p=4$QFSGOhcEcbdnTpO9oXTfuA$NeOoABeR6A/59/BDbGRPWLyFWAD3fcUIulljz1OnYwY',
       u.nombres, u.apellidos, u.cargo, TRUE, FALSE
  FROM (VALUES
        ('admision',      'Admisión',      'Hospitalización',      'Admisión'),
        ('dep.medicina',  'Departamento',  'de Medicina',          'Jefatura del Departamento de Medicina'),
        ('medicina.a',    'Enfermería',    'Medicina A',           'Enfermería de Medicina A'),
        ('medicina.b',    'Enfermería',    'Medicina B',           'Enfermería de Medicina B'),
        ('medicina.int',  'Enfermería',    'Intermedios',          'Enfermería de Medicina Intermedios'),
        ('uci',           'Enfermería',    'UCI',                  'Enfermería de la Unidad de Cuidados Intensivos'),
        ('quemados',      'Enfermería',    'Quemados',             'Enfermería de la Unidad de Quemados'),
        ('control.camas', 'Responsable',   'de RENOXI',            'Control diario de camas y RENOXI'),
        ('mantenimiento', 'Mantenimiento', 'de camas',             'Mantenimiento de camas')
       ) AS u (nombre_usuario, nombres, apellidos, cargo)
 WHERE NOT EXISTS (
       SELECT 1 FROM seguridad.usuario x
        WHERE lower(x.nombre_usuario) = lower(u.nombre_usuario) AND x.fecha_eliminacion IS NULL
 );

INSERT INTO seguridad.usuario_rol (usuario_id, rol_id, unidad_organica_id)
SELECT u.id, r.id, uo.id
  FROM (VALUES
        ('admision',      'admision',                  NULL),
        ('dep.medicina',  'jefe_departamento',         'hosp-dep-medicina'),
        ('medicina.a',    'enfermeria',                'hosp-area-medicina-a'),
        ('medicina.b',    'enfermeria',                'hosp-area-medicina-b'),
        ('medicina.int',  'enfermeria',                'hosp-area-medicina-intermedios'),
        ('uci',           'enfermeria',                'hosp-area-cuidados-criticos'),
        ('quemados',      'enfermeria',                'hosp-area-quemados'),
        ('control.camas', 'control_camas',             NULL),
        ('mantenimiento', 'mantenimiento_camas',       NULL)
       ) AS a (nombre_usuario, rol_codigo, unidad_clave)
  JOIN seguridad.usuario u ON lower(u.nombre_usuario) = a.nombre_usuario AND u.fecha_eliminacion IS NULL
  JOIN seguridad.rol r     ON r.codigo = a.rol_codigo AND r.fecha_eliminacion IS NULL
  LEFT JOIN organizacion.unidad_organica uo ON uo.clave = a.unidad_clave AND uo.fecha_eliminacion IS NULL
 WHERE (a.unidad_clave IS NULL OR uo.id IS NOT NULL)
   AND NOT EXISTS (
       SELECT 1 FROM seguridad.usuario_rol ur
        WHERE ur.usuario_id = u.id AND ur.rol_id = r.id
          AND ur.unidad_organica_id IS NOT DISTINCT FROM uo.id
          AND ur.fecha_eliminacion IS NULL
 );

SELECT set_config('app.usuario_id', '', false);
