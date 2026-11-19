-- =============================================================================
-- Retirar Mantenimiento (21/10/2026): no es un área que reporte
-- =============================================================================
--
-- La semilla base (0001_semilla_base.sql) trae la unidad `MTO`,
-- Departamento de Mantenimiento, como décima área que reporta, con
-- Planeamiento como destino. Mantenimiento no reporta al sistema, así que
-- se retira aquí con borrado lógico: la unidad y su destino quedan con
-- su fecha de eliminación y fuera de toda consulta (`vigente`).
--
-- Se puede correr más de una vez: lo que ya está retirado no se repite.
-- =============================================================================

DO $$
DECLARE
    mto bigint := (SELECT id FROM organizacion.unidad_organica WHERE codigo = 'MTO' AND fecha_eliminacion IS NULL);
BEGIN
    IF mto IS NULL THEN
        RAISE NOTICE 'Mantenimiento ya estaba retirado: nada que hacer.';
        RETURN;
    END IF;

    -- Si existía la cuenta de prueba 'mantenimiento' del seeder opcional, se retira junto con su rol
    UPDATE seguridad.usuario_rol ur
       SET fecha_eliminacion = now()
      FROM seguridad.usuario u
     WHERE ur.usuario_id = u.id
       AND ur.unidad_organica_id = mto
       AND lower(u.nombre_usuario) = 'mantenimiento'
       AND ur.fecha_eliminacion IS NULL;

    UPDATE seguridad.usuario
       SET es_activo = FALSE, fecha_eliminacion = now()
     WHERE lower(nombre_usuario) = 'mantenimiento'
       AND fecha_eliminacion IS NULL;

    IF EXISTS (SELECT 1 FROM formato.formato WHERE unidad_organica_id = mto AND fecha_eliminacion IS NULL)
       OR EXISTS (SELECT 1 FROM seguridad.usuario_rol WHERE unidad_organica_id = mto AND fecha_eliminacion IS NULL) THEN
        RAISE EXCEPTION 'Mantenimiento tiene un formato o una cuenta asignada: retírelos antes (este script solo retira la unidad y su destino).';
    END IF;

    UPDATE organizacion.destino
       SET fecha_eliminacion = now(), observacion = 'Retirado el 21/10/2026: Mantenimiento no reporta al sistema.'
     WHERE (unidad_origen_id = mto OR unidad_destino_id = mto) AND fecha_eliminacion IS NULL;

    UPDATE organizacion.unidad_organica
       SET es_activo = FALSE, es_reportante = FALSE, fecha_eliminacion = now()
     WHERE id = mto;

    RAISE NOTICE 'Mantenimiento retirado: la unidad MTO y su destino quedan con fecha de eliminación.';
END $$;
