-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Seeder 0006 · Quién escribe en el panel de monitoreo
--
-- Estadística (rol revisor) carga el reporte DL 1153, digita lo que envían
-- Epidemiología, Farmacia y Recursos Humanos, ajusta las salas de operaciones y
-- actualiza los compromisos de mejora. El superadministrador puede lo mismo.
-- Dirección General solo mira.
--
-- Se puede correr más de una vez: lo que ya existe no se repite.
-- =============================================================================

SELECT set_config('app.usuario_id', COALESCE((SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'), ''), false);

INSERT INTO seguridad.permiso (codigo, modulo, descripcion)
SELECT 'monitoreo.registrar', 'desempeno', 'Cargar el reporte DL 1153, digitar los datos de las oficinas, ajustar las salas y actualizar los compromisos de mejora'
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.permiso p WHERE p.codigo = 'monitoreo.registrar' AND p.fecha_eliminacion IS NULL);

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM (VALUES ('revisor'), ('superadmin')) AS x (rol)
  JOIN seguridad.rol r     ON r.codigo = x.rol AND r.fecha_eliminacion IS NULL
  JOIN seguridad.permiso p ON p.codigo = 'monitoreo.registrar' AND p.fecha_eliminacion IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id AND rp.fecha_eliminacion IS NULL);

SELECT set_config('app.usuario_id', '', false);
