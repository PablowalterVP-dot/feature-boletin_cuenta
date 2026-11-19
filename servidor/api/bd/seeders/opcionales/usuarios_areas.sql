-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Seeder Opcional · Usuarios de prueba por área y oficina
--
-- Crea (o actualiza si tenían clave provisional POR_ASIGNAR) las 14 cuentas de
-- desarrollo para todas las áreas reportantes (9), oficinas receptoras (3),
-- Estadística y superadmin.
--
-- Contraseña para todas las cuentas: 1234567890
-- Obligatorio cambiar contraseña al iniciar sesión: NO (debe_cambiar_contrasena = FALSE)
--
-- Ejecución manual:
--   npm run seed:usuarios
--   (o: python -m app.herramientas.bd seed:usuarios)
-- =============================================================================

SELECT set_config('app.usuario_id', COALESCE((SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'), ''), false);

-- 1. Asegurar que superadmin exista y tenga la contraseña de desarrollo sin cambio obligatorio
INSERT INTO seguridad.usuario (nombre_usuario, correo, contrasena_hash, nombres, apellidos, cargo, es_activo, debe_cambiar_contrasena)
SELECT 'superadmin', 'desarrollo@hrl.gob.pe',
       '$argon2id$v=19$m=65536,t=3,p=4$QFSGOhcEcbdnTpO9oXTfuA$NeOoABeR6A/59/BDbGRPWLyFWAD3fcUIulljz1OnYwY',
       'Administrador', 'del sistema', 'Superadministrador', TRUE, FALSE
 WHERE NOT EXISTS (
       SELECT 1 FROM seguridad.usuario WHERE lower(nombre_usuario) = 'superadmin' AND fecha_eliminacion IS NULL
 );

UPDATE seguridad.usuario
   SET contrasena_hash = '$argon2id$v=19$m=65536,t=3,p=4$QFSGOhcEcbdnTpO9oXTfuA$NeOoABeR6A/59/BDbGRPWLyFWAD3fcUIulljz1OnYwY',
       debe_cambiar_contrasena = FALSE,
       es_activo = TRUE
 WHERE lower(nombre_usuario) = 'superadmin'
   AND fecha_eliminacion IS NULL
   AND (contrasena_hash = 'POR_ASIGNAR' OR debe_cambiar_contrasena = TRUE);

-- 2. Crear usuarios de Estadística, las 9 áreas reportantes y las 3 oficinas receptoras
INSERT INTO seguridad.usuario (nombre_usuario, correo, contrasena_hash, nombres, apellidos, cargo, es_activo, debe_cambiar_contrasena)
SELECT u.nombre_usuario,
       u.correo,
       '$argon2id$v=19$m=65536,t=3,p=4$QFSGOhcEcbdnTpO9oXTfuA$NeOoABeR6A/59/BDbGRPWLyFWAD3fcUIulljz1OnYwY',
       u.nombres,
       u.apellidos,
       u.cargo,
       TRUE,
       FALSE
  FROM (VALUES
        -- Oficina de Estadística
        ('estadistica',      'estadistica@hrl.gob.pe',        'Milagros', 'Zumaeta Pinedo',    'Responsable de la Oficina de Estadística'),
        -- Áreas que reportan (9)
        ('farmacia',         'farmacia@hrl.gob.pe',           'Lucía',    'Ramírez Dávila',    'Jefatura del Departamento de Farmacia'),
        ('nefrologia',       'hemodialisis@hrl.gob.pe',       'Marco',    'Tuesta Yumbato',    'Coordinación de Nefrología y Hemodiálisis'),
        ('epidemiologia',    'epidemiologia@hrl.gob.pe',      'Elena',    'Pacaya Ruiz',       'Responsable de la Oficina de Epidemiología'),
        ('laboratorio',      'laboratorio@hrl.gob.pe',        'Rosa',     'Ahuanari Silva',    'Jefatura de Laboratorio Clínico y Anatomía Patológica'),
        ('ginecologia',      'ginecoobstetricia@hrl.gob.pe',  'Karina',   'Mozombite León',    'Jefatura del Departamento de Gineco-Obstetricia'),
        ('centroquirurgico', 'centroquirurgico@hrl.gob.pe',   'Julio',    'Nashnate Vela',     'Coordinación de Centro Quirúrgico'),
        ('lavanderia',       'lavanderia@hrl.gob.pe',         'Teresa',   'Cachique Flores',   'Responsable del Área de Costura y Lavandería'),
        ('nutricion',        'nutricion@hrl.gob.pe',          'Diana',    'Saavedra Cruz',     'Jefatura del Departamento de Nutrición y Dietética'),
        ('imagenes',         'imagenes@hrl.gob.pe',           'Óscar',    'Villacorta Rengifo','Jefatura del Departamento de Diagnóstico por Imágenes'),
        -- Oficinas receptoras (3)
        ('planeamiento',     'planeamiento@hrl.gob.pe',       'Raúl',     'Bardales Noriega',  'Jefatura de la Oficina de Planeamiento Estratégico'),
        ('cuerpotecnico',    'cuerpotecnico@hrl.gob.pe',      'Nancy',    'Sangama Huayta',    'Coordinación del Cuerpo Técnico'),
        ('direccion',        'direccion@hrl.gob.pe',          'Alberto',  'Ferreyra Campos',   'Dirección General')
       ) AS u (nombre_usuario, correo, nombres, apellidos, cargo)
 WHERE NOT EXISTS (
       SELECT 1 FROM seguridad.usuario x
        WHERE lower(x.nombre_usuario) = lower(u.nombre_usuario)
          AND x.fecha_eliminacion IS NULL
 );

-- Si alguna de estas cuentas ya existía con contraseña provisional (POR_ASIGNAR), dejarla lista con 1234567890
UPDATE seguridad.usuario
   SET contrasena_hash = '$argon2id$v=19$m=65536,t=3,p=4$QFSGOhcEcbdnTpO9oXTfuA$NeOoABeR6A/59/BDbGRPWLyFWAD3fcUIulljz1OnYwY',
       debe_cambiar_contrasena = FALSE,
       es_activo = TRUE
 WHERE lower(nombre_usuario) IN (
       'estadistica', 'farmacia', 'nefrologia', 'epidemiologia', 'laboratorio',
       'ginecologia', 'centroquirurgico', 'lavanderia', 'nutricion', 'imagenes',
       'planeamiento', 'cuerpotecnico', 'direccion'
 )
   AND fecha_eliminacion IS NULL
   AND (contrasena_hash = 'POR_ASIGNAR' OR debe_cambiar_contrasena = TRUE);

-- 3. Asignación de roles globales (superadmin y estadistica)
INSERT INTO seguridad.usuario_rol (usuario_id, rol_id, unidad_organica_id)
SELECT u.id, r.id, NULL
  FROM (VALUES
        ('superadmin',  'superadmin'),
        ('estadistica', 'revisor'),
        -- Desde el 27/10/2026 Planeamiento tiene su propio rol, global (seeder 0005).
        ('planeamiento', 'planeamiento')
       ) AS a (nombre_usuario, rol_codigo)
  JOIN seguridad.usuario u ON lower(u.nombre_usuario) = a.nombre_usuario AND u.fecha_eliminacion IS NULL
  JOIN seguridad.rol r     ON r.codigo = a.rol_codigo AND r.fecha_eliminacion IS NULL
 WHERE NOT EXISTS (
       SELECT 1 FROM seguridad.usuario_rol ur
        WHERE ur.usuario_id = u.id
          AND ur.rol_id = r.id
          AND ur.unidad_organica_id IS NULL
          AND ur.fecha_eliminacion IS NULL
 );

-- 4. Asignación de roles por unidad orgánica (áreas reportantes y oficinas receptoras)
-- Nota: Epidemiología recibe ambos roles ('digitador' para reportar y 'consulta' para recibir).
INSERT INTO seguridad.usuario_rol (usuario_id, rol_id, unidad_organica_id)
SELECT u.id, r.id, uo.id
  FROM (VALUES
        ('farmacia',         'digitador', 'FAR'),
        ('nefrologia',       'digitador', 'NEF'),
        ('epidemiologia',    'digitador', 'EPI'),
        ('epidemiologia',    'consulta',  'EPI'),
        ('laboratorio',      'digitador', 'LAB'),
        ('ginecologia',      'digitador', 'GIN'),
        ('centroquirurgico', 'digitador', 'CQX'),
        ('lavanderia',       'digitador', 'LAV'),
        ('nutricion',        'digitador', 'NUT'),
        ('imagenes',         'digitador', 'DXI'),
        ('cuerpotecnico',    'consulta',  'CTE'),
        ('direccion',        'consulta',  'DG')
       ) AS a (nombre_usuario, rol_codigo, unidad_codigo)
  JOIN seguridad.usuario u          ON lower(u.nombre_usuario) = a.nombre_usuario AND u.fecha_eliminacion IS NULL
  JOIN seguridad.rol r              ON r.codigo = a.rol_codigo AND r.fecha_eliminacion IS NULL
  JOIN organizacion.unidad_organica uo ON uo.codigo = a.unidad_codigo AND uo.fecha_eliminacion IS NULL
 WHERE NOT EXISTS (
       SELECT 1 FROM seguridad.usuario_rol ur
        WHERE ur.usuario_id = u.id
          AND ur.rol_id = r.id
          AND ur.unidad_organica_id = uo.id
          AND ur.fecha_eliminacion IS NULL
 );

SELECT set_config('app.usuario_id', '', false);
