-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Seeder 0012 · Rol de Boletín (18/11/2026)
--
-- Una persona dedicada al boletín estadístico entra con su propia cuenta y ve
-- solo dos módulos: «Boletín estadístico» y «Panel de monitoreo». No llena,
-- valida, remite, registra datos de monitoreo ni administra cuentas.
--
--   · Permiso nuevo: boletin.ver. Da acceso de lectura al boletín y al panel
--     de monitoreo de sus datos. No lleva `desempeno.ver` ni permisos de
--     hospitalización: la encargada no ve la lista de pacientes.
--   · Rol `boletin`, global: reporte.ver y reporte.descargar (para alimentar
--     el boletín con lo que ya entregaron las áreas) y boletin.ver.
--   · El superadministrador recibe el permiso nuevo, como en los seeders 0005
--     y 0006. Las cuentas no se tocan: él crea la cuenta desde «Cuentas y
--     permisos», le asigna el rol y le pone la contraseña.
--
-- Se puede correr más de una vez: lo que ya existe no se repite.
-- =============================================================================

SELECT set_config('app.usuario_id', COALESCE((SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'), ''), false);

INSERT INTO seguridad.permiso (codigo, modulo, descripcion)
SELECT 'boletin.ver', 'boletin', 'Generar el boletín estadístico y consultar el panel de monitoreo de sus datos'
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.permiso p WHERE p.codigo = 'boletin.ver');

INSERT INTO seguridad.rol (codigo, nombre, descripcion, alcance, es_sistema)
SELECT 'boletin', 'Boletín',
       'Encargada del boletín estadístico: genera el boletín y consulta el panel de monitoreo de sus datos. Ámbito: todo el hospital.',
       'global', TRUE
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.rol WHERE codigo = 'boletin');

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM (VALUES
        ('boletin',    'reporte.ver'),
        ('boletin',    'reporte.descargar'),
        ('boletin',    'boletin.ver'),
        ('superadmin', 'boletin.ver')
       ) AS x (rol, permiso)
  JOIN seguridad.rol r     ON r.codigo = x.rol AND r.fecha_eliminacion IS NULL
  JOIN seguridad.permiso p ON p.codigo = x.permiso AND p.fecha_eliminacion IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id AND rp.fecha_eliminacion IS NULL);

SELECT set_config('app.usuario_id', '', false);
