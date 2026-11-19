-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Migración 0009 · Teléfono de contacto de cada cuenta
--
-- El superadministrador lleva el directorio de los responsables de cada área y
-- oficina: además de su nombre, el número al que se le llama o escribe cuando
-- su reporte se atrasa o el bot encuentra algo. Es opcional (una cuenta puede
-- no tenerlo todavía) y se guarda tal como se escribe, con su prefijo si lo
-- trae; la forma se valida en el servidor (app/dominio/configuracion.py).
--
-- La auditoría de seguridad.usuario registra la fila entera, así que un cambio
-- de teléfono queda en la bitácora como cualquier otro dato de la cuenta.
-- =============================================================================

ALTER TABLE seguridad.usuario
    ADD COLUMN telefono VARCHAR(20);

COMMENT ON COLUMN seguridad.usuario.telefono IS
    'Número de contacto (celular) del responsable. Opcional; dígitos, espacios, guiones y un + inicial.';
