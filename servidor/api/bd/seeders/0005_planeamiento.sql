-- =============================================================================
-- Planeamiento, rol propio (27/10/2026)
-- =============================================================================
--
-- Planeamiento deja de ser una oficina receptora más (`consulta` sobre su
-- unidad, que solo lee lo que la matriz le remite) y pasa a recibir al nivel de
-- Estadística: lo entregado por las nueve áreas. Con eso registra la ejecución
-- de las actividades operativas del POI (migración 0008).
--
--   · Permisos nuevos: actividad.ver y actividad.registrar.
--   · Rol `planeamiento`, global: reporte.ver y reporte.descargar en todas las
--     unidades (nunca ve un borrador: eso lo decide la visibilidad, no el
--     rol) y los dos de actividades. No revisa, no rectifica ni remite.
--   · El superadministrador recibe los permisos nuevos, como todos.
--   · Matriz: Gineco-Obstetricia, Lavandería y Epidemiología, las tres áreas
--     que no iban a Planeamiento, ahora van.
--
-- Las cuentas no se tocan: el superadministrador le asigna el rol a quien
-- corresponda desde «Cuentas y permisos».
--
-- Se puede correr más de una vez: lo que ya existe no se repite.
-- =============================================================================

INSERT INTO seguridad.permiso (codigo, modulo, descripcion)
SELECT x.codigo, 'planeamiento', x.descripcion
  FROM (VALUES
        ('actividad.ver',       'Ver la ejecución de las actividades operativas del POI'),
        ('actividad.registrar', 'Digitar o ajustar la ejecución mensual de una actividad operativa')
       ) AS x (codigo, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.permiso p WHERE p.codigo = x.codigo);

INSERT INTO seguridad.rol (codigo, nombre, descripcion, alcance, es_sistema)
SELECT 'planeamiento', 'Planeamiento',
       'Oficina de Planeamiento: recibe lo entregado por las nueve áreas y registra la ejecución de las actividades operativas del POI.',
       'global', TRUE
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.rol WHERE codigo = 'planeamiento');

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM (VALUES
        ('planeamiento', 'reporte.ver'), ('planeamiento', 'reporte.descargar'),
        ('planeamiento', 'actividad.ver'), ('planeamiento', 'actividad.registrar'),
        ('superadmin',   'actividad.ver'), ('superadmin',   'actividad.registrar')
       ) AS x (rol, permiso)
  JOIN seguridad.rol r     ON r.codigo = x.rol
  JOIN seguridad.permiso p ON p.codigo = x.permiso
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id);

INSERT INTO organizacion.destino (unidad_origen_id, unidad_destino_id, es_entrega_inmediata, fecha_inicio_vigencia, observacion)
SELECT o.id, d.id, FALSE, DATE '2026-01-01', 'Planeamiento recibe de las nueve áreas desde el 27/10/2026.'
  FROM (VALUES ('GIN'), ('LAV'), ('EPI')) AS m (origen)
  JOIN organizacion.unidad_organica o ON o.codigo = m.origen AND o.fecha_eliminacion IS NULL
  JOIN organizacion.unidad_organica d ON d.codigo = 'PLA' AND d.fecha_eliminacion IS NULL
 WHERE NOT EXISTS (
        SELECT 1 FROM organizacion.destino x
         WHERE x.unidad_origen_id = o.id AND x.unidad_destino_id = d.id AND x.fecha_eliminacion IS NULL
       );
