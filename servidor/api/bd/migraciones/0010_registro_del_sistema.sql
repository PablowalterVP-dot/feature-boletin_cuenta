-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Migración 0010 · Lo que el sistema necesita recordar para vigilarse
--
-- Dos cosas que antes se perdían:
--
--   auditoria.intento_ingreso  cada intento de entrar. Sin esto no se podía
--                              frenar a quien prueba contraseñas, ni saber si
--                              alguien lo está haciendo.
--   auditoria.error_sistema    cada error inesperado del servidor, con una
--                              referencia que se le muestra a la persona. Así
--                              «me salió un error» se puede buscar, en vez de
--                              enterarse por teléfono y sin pistas.
--
-- Ninguna de las dos lleva disparador de auditoría: son ellas mismas un registro.
-- Guardan el usuario escrito, nunca la contraseña.
-- =============================================================================

CREATE TABLE auditoria.intento_ingreso (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_usuario VARCHAR(150) NOT NULL,
    direccion_ip   VARCHAR(45),
    exitoso        BOOLEAN      NOT NULL,
    fecha          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_intento_ingreso_usuario_fecha ON auditoria.intento_ingreso (nombre_usuario, fecha DESC);
CREATE INDEX ix_intento_ingreso_fecha ON auditoria.intento_ingreso (fecha DESC);

COMMENT ON TABLE auditoria.intento_ingreso IS
    'Cada intento de iniciar sesión. Frena a quien prueba contraseñas y alimenta el panel de funcionamiento.';

CREATE TABLE auditoria.error_sistema (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    referencia VARCHAR(12)  NOT NULL UNIQUE,
    metodo     VARCHAR(10)  NOT NULL,
    ruta       VARCHAR(300) NOT NULL,
    tipo       VARCHAR(150) NOT NULL,
    mensaje    TEXT,
    fecha      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_error_sistema_fecha ON auditoria.error_sistema (fecha DESC);

COMMENT ON TABLE auditoria.error_sistema IS
    'Errores inesperados del servidor. La referencia es la que ve la persona en pantalla.';
