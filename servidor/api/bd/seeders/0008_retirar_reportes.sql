-- Retiro auditado de reportes mensuales por Estadística.
INSERT INTO seguridad.permiso (codigo, modulo, descripcion)
VALUES ('reporte.eliminar', 'reporte', 'Retirar reportes mensuales por error, conservando cifras e historial en la bitácora')
-- El índice único de código es parcial (solo las no eliminadas): el ON CONFLICT lo nombra igual.
ON CONFLICT (codigo) WHERE fecha_eliminacion IS NULL DO NOTHING;

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM seguridad.rol r
  JOIN seguridad.permiso p ON p.codigo = 'reporte.eliminar'
 WHERE r.codigo IN ('revisor', 'superadmin')
ON CONFLICT DO NOTHING;
