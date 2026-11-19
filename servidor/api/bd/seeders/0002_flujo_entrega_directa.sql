-- =============================================================================
-- Entrega directa (12/10/2026): Estadística ya no valida ni remite
-- =============================================================================
--
-- El bot validador revisa cada Excel al subirlo y no deja enviar lo que no
-- cuadra ni una alerta sin justificar: esa es la validación. Volver a validarlo
-- en Estadística repetía su trabajo y retrasaba a las oficinas. Desde hoy:
--
--     borrador ──enviar──▶ remitido          (rectificar lo devuelve a borrador)
--
-- Al enviar, el reporte llega a la vez a Estadística y a todas las oficinas de
-- la matriz vigente. `enviado`, `en_revision` y `validado` dejan de ser estados.
--
-- No edita `avance_04/` (la copia de Alejandro, con sus hashes): cambia DATOS
-- de la máquina de estados, que la base guarda como filas, y pasa a `remitido`
-- los reportes que estaban a medio camino. Se puede correr más de una vez: lo
-- que ya está hecho no se repite.
--
--   psql -U <usuario> -d <base> -v ON_ERROR_STOP=1 -1 -f 01_entrega_directa.sql
--
-- Lo que hace, en orden:
--   1. Los reportes en enviado / en revisión / validado pasan a remitido: llegan
--      a las oficinas de su matriz vigente, su historial lo dice y la fecha de
--      validación queda en la del cambio si no tenían una.
--   2. Las entregas «sin validar» que siguen vigentes se dan por superadas: la
--      oficina ya tiene la remisión validada que las reemplaza.
--   3. `enviar` lleva directo a remitido; revisar, validar y remitir se retiran.
--   4. Los tres estados intermedios se retiran (borrado lógico: el historial de
--      los reportes de antes los sigue nombrando) y remitido pasa a orden 2.
-- =============================================================================

-- La auditoría (02_auditoria.sql) anota quién hizo cada cambio si se lo dicen.
-- Aquí no hay persona: lo dice el comentario del historial.

-- 1 ---------------------------------------------------------------------------
DROP TABLE IF EXISTS pendientes_de_entrega;
CREATE TEMPORARY TABLE pendientes_de_entrega AS
SELECT r.id AS reporte_id, r.estado_reporte_id AS estado_origen_id, r.numero_rectificacion, f.unidad_organica_id
  FROM reporte.reporte r
  JOIN reporte.estado_reporte e ON e.id = r.estado_reporte_id
  JOIN formato.formato f        ON f.id = r.formato_id
 WHERE e.codigo IN ('enviado', 'en_revision', 'validado')
   AND r.fecha_eliminacion IS NULL;

INSERT INTO reporte.remision (reporte_id, unidad_destino_id, numero_rectificacion, es_sin_validar, es_vigente)
SELECT p.reporte_id, d.unidad_destino_id, p.numero_rectificacion, FALSE, TRUE
  FROM pendientes_de_entrega p
  JOIN organizacion.destino d          ON d.unidad_origen_id = p.unidad_organica_id
  JOIN organizacion.unidad_organica u  ON u.id = d.unidad_destino_id
 WHERE d.fecha_eliminacion IS NULL
   AND u.fecha_eliminacion IS NULL AND u.es_activo
   AND d.fecha_inicio_vigencia <= current_date
   AND (d.fecha_fin_vigencia IS NULL OR d.fecha_fin_vigencia >= current_date)
   AND NOT EXISTS (SELECT 1 FROM reporte.remision x
                    WHERE x.reporte_id = p.reporte_id AND x.unidad_destino_id = d.unidad_destino_id
                      AND NOT x.es_sin_validar AND x.es_vigente AND x.fecha_eliminacion IS NULL);

INSERT INTO reporte.reporte_historial_estado (reporte_id, estado_origen_id, estado_destino_id, accion, numero_rectificacion, comentario)
SELECT p.reporte_id, p.estado_origen_id, rem.id, 'enviar', p.numero_rectificacion,
       'Entregado a las oficinas de la matriz por el cambio de flujo del 12/10/2026: el bot ya lo había validado, y Estadística ya no valida ni remite.'
  FROM pendientes_de_entrega p
 CROSS JOIN (SELECT id FROM reporte.estado_reporte WHERE codigo = 'remitido' AND fecha_eliminacion IS NULL) rem;

UPDATE reporte.reporte r
   SET estado_reporte_id = (SELECT id FROM reporte.estado_reporte WHERE codigo = 'remitido' AND fecha_eliminacion IS NULL),
       fecha_validacion  = COALESCE(r.fecha_validacion, now())
  FROM pendientes_de_entrega p
 WHERE r.id = p.reporte_id;

-- 2 ---------------------------------------------------------------------------
UPDATE reporte.remision
   SET es_vigente = FALSE
 WHERE es_sin_validar AND es_vigente AND fecha_eliminacion IS NULL;

-- 3 ---------------------------------------------------------------------------
UPDATE reporte.transicion_estado t
   SET estado_destino_id = (SELECT id FROM reporte.estado_reporte WHERE codigo = 'remitido' AND fecha_eliminacion IS NULL)
 WHERE t.accion = 'enviar' AND t.fecha_eliminacion IS NULL
   AND t.estado_destino_id <> (SELECT id FROM reporte.estado_reporte WHERE codigo = 'remitido' AND fecha_eliminacion IS NULL);

UPDATE reporte.transicion_estado
   SET fecha_eliminacion = now()
 WHERE accion IN ('revisar', 'validar', 'remitir') AND fecha_eliminacion IS NULL;

-- 4 ---------------------------------------------------------------------------
UPDATE reporte.estado_reporte
   SET fecha_eliminacion = now()
 WHERE codigo IN ('enviado', 'en_revision', 'validado') AND fecha_eliminacion IS NULL;

UPDATE reporte.estado_reporte
   SET orden = 2,
       descripcion = 'Validado por el bot y entregado a Estadística y a las oficinas de la matriz. Periodo cerrado.'
 WHERE codigo = 'remitido' AND fecha_eliminacion IS NULL AND orden <> 2;

DROP TABLE pendientes_de_entrega;
