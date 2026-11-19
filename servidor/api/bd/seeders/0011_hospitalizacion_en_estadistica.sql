-- =============================================================================
-- Hospitalización en la cuenta oficial de Estadística (15/11/2026)
-- =============================================================================
--
-- El seeder 0009 creó `validador_hospitalizacion` («Estadística de hospitalización»)
-- para sumarlo a la cuenta de Estadística cuando hospitalización estuviera en el
-- servidor. En la práctica era un segundo rol para la misma persona. Se decidió
-- (decisiones 0011 y 0013 de docs/hospitalizacion/decisiones/) que esos módulos sean
-- parte del rol de siempre, y que Estadística solo los mire: la gestión de camas, el
-- consolidado de censos y RENOXI. El permiso conserva su código, `validar`:
--
--   1. `revisor` (Revisor de Estadística) recibe `hospitalizacion.ver` y
--      `hospitalizacion.validar`. Toda cuenta de Estadística ve, debajo de su menú,
--      los módulos de hospitalización, sin que nadie tenga que asignarle nada.
--   2. `validador_hospitalizacion` se retira con borrado lógico, junto con sus
--      permisos y sus asignaciones: ya no se puede dar ni aparece en «Cuentas y
--      permisos».
--
-- Si hospitalización no está encendida en el servidor, el menú no la muestra: el
-- frontend pregunta antes si su API responde (`servicios/hospitalizacion.js`).
--
-- Se puede correr más de una vez: lo que ya está hecho no se repite.
-- =============================================================================

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM seguridad.rol r
  JOIN seguridad.permiso p ON p.codigo IN ('hospitalizacion.ver', 'hospitalizacion.validar') AND p.fecha_eliminacion IS NULL
 WHERE r.codigo = 'revisor' AND r.fecha_eliminacion IS NULL
   AND NOT EXISTS (SELECT 1 FROM seguridad.rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id AND rp.fecha_eliminacion IS NULL);

UPDATE seguridad.usuario_rol ur
   SET fecha_eliminacion = now()
  FROM seguridad.rol r
 WHERE ur.rol_id = r.id AND r.codigo = 'validador_hospitalizacion'
   AND r.fecha_eliminacion IS NULL AND ur.fecha_eliminacion IS NULL;

UPDATE seguridad.rol_permiso rp
   SET fecha_eliminacion = now()
  FROM seguridad.rol r
 WHERE rp.rol_id = r.id AND r.codigo = 'validador_hospitalizacion'
   AND r.fecha_eliminacion IS NULL AND rp.fecha_eliminacion IS NULL;

UPDATE seguridad.rol
   SET fecha_eliminacion = now()
 WHERE codigo = 'validador_hospitalizacion' AND fecha_eliminacion IS NULL;
