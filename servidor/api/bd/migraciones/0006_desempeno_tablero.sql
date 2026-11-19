-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Migración 0006 · Módulo de indicadores de desempeño (Tablero)
--
-- Se instala después de 0005_desempeno_esquema.sql.
-- Agrega tablas y columnas necesarias para el tablero de desempeño:
--   desempeno.script_aplicado
--   desempeno.dimension
--   desempeno.ficha (+ nombre_corto, dimension_id, aplica_al_hospital, motivo_no_aplica)
--   fuente.fuente (+ area_responsable, formato)
--   desempeno.ficha_fuente
--   desempeno.seguimiento_caso
-- =============================================================================

CREATE TABLE desempeno.script_aplicado (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    script                    VARCHAR(80) NOT NULL,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_script_aplicado PRIMARY KEY (id)
);
CREATE UNIQUE INDEX uq_script_aplicado ON desempeno.script_aplicado (script) WHERE fecha_eliminacion IS NULL;

CREATE TABLE desempeno.dimension (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    codigo                    VARCHAR(10)  NOT NULL,
    nombre                    VARCHAR(120) NOT NULL,
    orden                     SMALLINT     NOT NULL,
    es_oficial                BOOLEAN      NOT NULL DEFAULT FALSE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_dimension PRIMARY KEY (id)
);
CREATE UNIQUE INDEX uq_dimension_codigo ON desempeno.dimension (codigo) WHERE fecha_eliminacion IS NULL;

ALTER TABLE desempeno.ficha
    ADD COLUMN nombre_corto       VARCHAR(80),
    ADD COLUMN dimension_id       BIGINT,
    ADD COLUMN aplica_al_hospital BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN motivo_no_aplica   TEXT,
    ADD CONSTRAINT fk_ficha_dimension FOREIGN KEY (dimension_id) REFERENCES desempeno.dimension (id),
    ADD CONSTRAINT ck_ficha_no_aplica CHECK (aplica_al_hospital OR motivo_no_aplica IS NOT NULL);

ALTER TABLE fuente.fuente
    ADD COLUMN area_responsable VARCHAR(120),
    ADD COLUMN formato          VARCHAR(120);

CREATE TABLE desempeno.ficha_fuente (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    ficha_id                  BIGINT NOT NULL,
    fuente_id                 BIGINT NOT NULL,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_ficha_fuente PRIMARY KEY (id),
    CONSTRAINT fk_ficha_fuente_ficha  FOREIGN KEY (ficha_id)  REFERENCES desempeno.ficha (id),
    CONSTRAINT fk_ficha_fuente_fuente FOREIGN KEY (fuente_id) REFERENCES fuente.fuente (id)
);
CREATE UNIQUE INDEX uq_ficha_fuente ON desempeno.ficha_fuente (ficha_id, fuente_id) WHERE fecha_eliminacion IS NULL;

CREATE TABLE desempeno.seguimiento_caso (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    ficha_id                  BIGINT      NOT NULL,
    tipo_documento            VARCHAR(5),
    numero_documento          VARCHAR(15) NOT NULL,
    categoria                 VARCHAR(40) NOT NULL,
    fecha_referencia          DATE        NOT NULL,
    estado                    VARCHAR(60) NOT NULL,
    usuario_id                BIGINT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_seguimiento_caso PRIMARY KEY (id),
    CONSTRAINT fk_seguimiento_caso_ficha   FOREIGN KEY (ficha_id)   REFERENCES desempeno.ficha (id),
    CONSTRAINT fk_seguimiento_caso_usuario FOREIGN KEY (usuario_id) REFERENCES seguridad.usuario (id)
);
CREATE UNIQUE INDEX uq_seguimiento_caso ON desempeno.seguimiento_caso (ficha_id, COALESCE(tipo_documento, ''), numero_documento, categoria, fecha_referencia)
    WHERE fecha_eliminacion IS NULL;

-- -----------------------------------------------------------------------------
-- Fechas de control y bitácora
-- -----------------------------------------------------------------------------
SET client_min_messages = warning;

SELECT auditoria.fn_instalar_auditoria(t.esquema, t.tabla)
  FROM (VALUES ('desempeno', 'dimension'), ('desempeno', 'ficha_fuente')) AS t (esquema, tabla);

CREATE TRIGGER tg_script_aplicado_control BEFORE INSERT OR UPDATE ON desempeno.script_aplicado
    FOR EACH ROW EXECUTE FUNCTION auditoria.fn_columnas_control();
CREATE TRIGGER tg_seguimiento_caso_control BEFORE INSERT OR UPDATE ON desempeno.seguimiento_caso
    FOR EACH ROW EXECUTE FUNCTION auditoria.fn_columnas_control();

RESET client_min_messages;
