-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Migración 0005 · Módulo de indicadores de desempeño (Esquema base)
--
-- Se instala DESPUÉS del esquema base (necesita seguridad.usuario y las
-- funciones de auditoria). Crea dos esquemas nuevos:
--
--   fuente      datos crudos de otros sistemas (HIS MINSA, SINADEF…), tal como
--               llegan. PROVISIONAL: se vacía el día que el hospital tenga
--               acceso directo a esas bases.
--   desempeno   lo que el sistema calcula con esos datos: las corridas de cada
--               ficha y sus resultados. Sobrevive a que `fuente` se vacíe.
-- =============================================================================

CREATE SCHEMA fuente;
CREATE SCHEMA desempeno;

-- -----------------------------------------------------------------------------
-- FUENTE (datos crudos)
-- -----------------------------------------------------------------------------

CREATE TABLE fuente.fuente (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    codigo                    VARCHAR(40)  NOT NULL,
    nombre                    VARCHAR(150) NOT NULL,
    descripcion               TEXT,
    periodicidad              VARCHAR(15)  NOT NULL,
    es_activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_fuente PRIMARY KEY (id),
    CONSTRAINT ck_fuente_periodicidad CHECK (periodicidad IN ('mensual', 'eventual'))
);
CREATE UNIQUE INDEX uq_fuente_codigo ON fuente.fuente (codigo) WHERE fecha_eliminacion IS NULL;

CREATE TABLE fuente.lote_carga (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    fuente_id                 BIGINT       NOT NULL,
    nombre_archivo            VARCHAR(255) NOT NULL,
    huella_sha256             CHAR(64)     NOT NULL,
    tamano_bytes              BIGINT       NOT NULL,
    fecha_extraccion          TIMESTAMPTZ,
    cobertura_desde           DATE,
    cobertura_hasta           DATE,
    filas_archivo             INTEGER      NOT NULL,
    filas_cargadas            INTEGER      NOT NULL,
    filas_omitidas            INTEGER      NOT NULL DEFAULT 0,
    columnas                  JSONB,
    usuario_carga_id          BIGINT,
    observacion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_lote_carga PRIMARY KEY (id),
    CONSTRAINT fk_lote_carga_fuente  FOREIGN KEY (fuente_id)        REFERENCES fuente.fuente (id),
    CONSTRAINT fk_lote_carga_usuario FOREIGN KEY (usuario_carga_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT ck_lote_carga_huella    CHECK (huella_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_lote_carga_tamano    CHECK (tamano_bytes >= 0),
    CONSTRAINT ck_lote_carga_filas     CHECK (filas_archivo >= 0 AND filas_cargadas >= 0 AND filas_omitidas >= 0),
    CONSTRAINT ck_lote_carga_cobertura CHECK (cobertura_hasta IS NULL OR cobertura_desde IS NULL OR cobertura_hasta >= cobertura_desde),
    CONSTRAINT ck_lote_carga_columnas  CHECK (columnas IS NULL OR jsonb_typeof(columnas) = 'array')
);
CREATE UNIQUE INDEX uq_lote_carga_huella ON fuente.lote_carga (fuente_id, huella_sha256) WHERE fecha_eliminacion IS NULL;
CREATE INDEX ix_lote_carga_fuente ON fuente.lote_carga (fuente_id);

CREATE TABLE fuente.lote_mes (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    lote_carga_id             BIGINT   NOT NULL,
    fuente_id                 BIGINT   NOT NULL,
    anio                      SMALLINT NOT NULL,
    mes                       SMALLINT NOT NULL,
    filas                     INTEGER  NOT NULL,
    es_vigente                BOOLEAN  NOT NULL DEFAULT TRUE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_lote_mes PRIMARY KEY (id),
    CONSTRAINT fk_lote_mes_lote   FOREIGN KEY (lote_carga_id) REFERENCES fuente.lote_carga (id),
    CONSTRAINT fk_lote_mes_fuente FOREIGN KEY (fuente_id)     REFERENCES fuente.fuente (id),
    CONSTRAINT ck_lote_mes_mes   CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT ck_lote_mes_filas CHECK (filas >= 0)
);
CREATE UNIQUE INDEX uq_lote_mes_vigente ON fuente.lote_mes (fuente_id, anio, mes) WHERE es_vigente AND fecha_eliminacion IS NULL;
CREATE UNIQUE INDEX uq_lote_mes_lote ON fuente.lote_mes (lote_carga_id, anio, mes) WHERE fecha_eliminacion IS NULL;

CREATE TABLE fuente.his_atencion (
    id                            BIGINT GENERATED ALWAYS AS IDENTITY,
    lote_mes_id                   BIGINT  NOT NULL,
    fila_archivo                  INTEGER NOT NULL,
    id_cita                       TEXT,
    anio                          TEXT,
    mes                           TEXT,
    dia                           TEXT,
    fecha_atencion                DATE    NOT NULL,
    lote                          TEXT,
    num_pag                       TEXT,
    num_reg                       TEXT,
    ups                           TEXT,
    establecimiento               TEXT,
    id_paciente                   TEXT,
    id_personal                   TEXT,
    id_registrador                TEXT,
    id_financiador                TEXT,
    id_condicion_establecimiento  TEXT,
    id_condicion_servicio         TEXT,
    edad_reg                      TEXT,
    tipo_edad                     TEXT,
    anio_actual_paciente          TEXT,
    mes_actual_paciente           TEXT,
    dia_actual_paciente           TEXT,
    id_turno                      TEXT,
    codigo_item                   TEXT,
    tipo_diagnostico              TEXT,
    valor_lab                     TEXT,
    id_correlativo                TEXT,
    id_correlativo_lab            TEXT,
    id_otra_condicion             TEXT,
    id_centro_poblado             TEXT,
    fecha_ultima_regla            TEXT,
    fecha_registro                TEXT,
    fecha_modificacion            TEXT,
    id_dosis                      TEXT,
    descripcion_item              TEXT,
    id_tipo_documento_paciente    TEXT,
    numero_documento_paciente     TEXT,
    apellido_paterno_paciente     TEXT,
    apellido_materno_paciente     TEXT,
    nombres_paciente              TEXT,
    fecha_nacimiento_paciente     TEXT,
    genero                        TEXT,
    id_etnia                      TEXT,
    historia_clinica              TEXT,
    id_pais                       TEXT,
    id_tipo_documento_personal    TEXT,
    numero_documento_personal     TEXT,
    apellido_paterno_personal     TEXT,
    apellido_materno_personal     TEXT,
    nombres_personal              TEXT,
    fecha_nacimiento_personal     TEXT,
    condicion                     TEXT,
    profesion                     TEXT,
    id_tipo_documento_registrador TEXT,
    numero_documento_registrador  TEXT,
    apellido_paterno_registrador  TEXT,
    apellido_materno_registrador  TEXT,
    nombres_registrador           TEXT,
    fecha_creacion                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion           TIMESTAMPTZ,
    fecha_eliminacion             TIMESTAMPTZ,
    CONSTRAINT pk_his_atencion PRIMARY KEY (id),
    CONSTRAINT fk_his_atencion_lote_mes FOREIGN KEY (lote_mes_id) REFERENCES fuente.lote_mes (id)
);
CREATE INDEX ix_his_atencion_lote_mes  ON fuente.his_atencion (lote_mes_id);
CREATE INDEX ix_his_atencion_fecha     ON fuente.his_atencion (fecha_atencion);
CREATE INDEX ix_his_atencion_codigo    ON fuente.his_atencion (codigo_item, fecha_atencion);
CREATE INDEX ix_his_atencion_documento ON fuente.his_atencion (numero_documento_paciente);
CREATE INDEX ix_his_atencion_cita      ON fuente.his_atencion (id_cita);

CREATE TABLE fuente.sinadef_defuncion (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    lote_mes_id               BIGINT  NOT NULL,
    fila_archivo              INTEGER NOT NULL,
    tipo_cdef                 TEXT,
    estado                    TEXT,
    tipo_documento            TEXT,
    numero_documento          TEXT,
    fecha_defuncion           DATE,
    fecha_registro            DATE,
    fila_original             JSONB   NOT NULL,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_sinadef_defuncion PRIMARY KEY (id),
    CONSTRAINT fk_sinadef_defuncion_lote_mes FOREIGN KEY (lote_mes_id) REFERENCES fuente.lote_mes (id),
    CONSTRAINT ck_sinadef_defuncion_fila CHECK (jsonb_typeof(fila_original) = 'array')
);
CREATE INDEX ix_sinadef_defuncion_lote_mes  ON fuente.sinadef_defuncion (lote_mes_id);
CREATE INDEX ix_sinadef_defuncion_documento ON fuente.sinadef_defuncion (numero_documento);

CREATE TABLE fuente.defuncion_verificada (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    numero_documento          VARCHAR(15) NOT NULL,
    fecha_defuncion           DATE        NOT NULL,
    fecha_registro            DATE,
    origen                    VARCHAR(150),
    fecha_verificacion        DATE,
    lote_carga_id             BIGINT,
    observacion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_defuncion_verificada PRIMARY KEY (id),
    CONSTRAINT fk_defuncion_verificada_lote FOREIGN KEY (lote_carga_id) REFERENCES fuente.lote_carga (id)
);
CREATE UNIQUE INDEX uq_defuncion_verificada_documento ON fuente.defuncion_verificada (numero_documento) WHERE fecha_eliminacion IS NULL;

-- -----------------------------------------------------------------------------
-- DESEMPEÑO (lo calculado)
-- -----------------------------------------------------------------------------

CREATE TABLE desempeno.ficha (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    numero                    SMALLINT    NOT NULL,
    clave                     VARCHAR(60) NOT NULL,
    nombre                    TEXT        NOT NULL,
    es_activo                 BOOLEAN     NOT NULL DEFAULT TRUE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_ficha PRIMARY KEY (id),
    CONSTRAINT ck_ficha_numero CHECK (numero > 0)
);
CREATE UNIQUE INDEX uq_ficha_numero ON desempeno.ficha (numero) WHERE fecha_eliminacion IS NULL;
CREATE UNIQUE INDEX uq_ficha_clave  ON desempeno.ficha (clave)  WHERE fecha_eliminacion IS NULL;

CREATE TABLE desempeno.corrida (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    ficha_id                  BIGINT      NOT NULL,
    anio                      SMALLINT    NOT NULL,
    mes_desde                 SMALLINT    NOT NULL,
    mes_hasta                 SMALLINT    NOT NULL,
    fecha_corte               DATE,
    fecha_fin_observacion     DATE        NOT NULL,
    version_calculo           VARCHAR(20) NOT NULL,
    detalle                   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    usuario_id                BIGINT,
    observacion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_corrida PRIMARY KEY (id),
    CONSTRAINT fk_corrida_ficha   FOREIGN KEY (ficha_id)   REFERENCES desempeno.ficha (id),
    CONSTRAINT fk_corrida_usuario FOREIGN KEY (usuario_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT ck_corrida_meses   CHECK (mes_desde BETWEEN 1 AND 12 AND mes_hasta BETWEEN mes_desde AND 12),
    CONSTRAINT ck_corrida_detalle CHECK (jsonb_typeof(detalle) = 'object')
);
CREATE INDEX ix_corrida_ficha ON desempeno.corrida (ficha_id, anio);

CREATE TABLE desempeno.resultado_mensual (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    corrida_id                BIGINT   NOT NULL,
    anio                      SMALLINT NOT NULL,
    mes                       SMALLINT NOT NULL,
    numerador                 INTEGER  NOT NULL,
    denominador               INTEGER  NOT NULL,
    plazo_abierto             INTEGER  NOT NULL DEFAULT 0,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_resultado_mensual PRIMARY KEY (id),
    CONSTRAINT fk_resultado_mensual_corrida FOREIGN KEY (corrida_id) REFERENCES desempeno.corrida (id),
    CONSTRAINT ck_resultado_mensual_mes     CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT ck_resultado_mensual_conteos CHECK (numerador >= 0 AND denominador >= numerador AND plazo_abierto BETWEEN 0 AND denominador)
);
CREATE UNIQUE INDEX uq_resultado_mensual ON desempeno.resultado_mensual (corrida_id, anio, mes) WHERE fecha_eliminacion IS NULL;

CREATE TABLE desempeno.resultado_paciente (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    corrida_id                BIGINT      NOT NULL,
    tipo_documento            VARCHAR(5),
    numero_documento          VARCHAR(15) NOT NULL,
    categoria                 VARCHAR(40),
    fecha_referencia          DATE        NOT NULL,
    es_denominador            BOOLEAN     NOT NULL,
    es_numerador              BOOLEAN     NOT NULL DEFAULT FALSE,
    es_plazo_abierto          BOOLEAN     NOT NULL DEFAULT FALSE,
    fecha_cumplimiento        DATE,
    motivo_exclusion          VARCHAR(40),
    detalle                   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_resultado_paciente PRIMARY KEY (id),
    CONSTRAINT fk_resultado_paciente_corrida FOREIGN KEY (corrida_id) REFERENCES desempeno.corrida (id),
    CONSTRAINT ck_resultado_paciente_numerador CHECK (NOT es_numerador OR es_denominador),
    CONSTRAINT ck_resultado_paciente_exclusion CHECK (motivo_exclusion IS NULL OR NOT es_denominador),
    CONSTRAINT ck_resultado_paciente_detalle   CHECK (jsonb_typeof(detalle) = 'object')
);
CREATE INDEX ix_resultado_paciente_corrida   ON desempeno.resultado_paciente (corrida_id);
CREATE INDEX ix_resultado_paciente_documento ON desempeno.resultado_paciente (numero_documento);

CREATE TABLE desempeno.referencia_minsa (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    ficha_id                  BIGINT   NOT NULL,
    anio                      SMALLINT NOT NULL,
    mes                       SMALLINT NOT NULL,
    numerador                 INTEGER  NOT NULL,
    denominador               INTEGER  NOT NULL,
    fecha_corte               DATE,
    documento                 VARCHAR(255),
    observacion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_referencia_minsa PRIMARY KEY (id),
    CONSTRAINT fk_referencia_minsa_ficha FOREIGN KEY (ficha_id) REFERENCES desempeno.ficha (id),
    CONSTRAINT ck_referencia_minsa_mes     CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT ck_referencia_minsa_conteos CHECK (numerador >= 0 AND denominador >= numerador)
);
CREATE UNIQUE INDEX uq_referencia_minsa ON desempeno.referencia_minsa (ficha_id, anio, mes) WHERE fecha_eliminacion IS NULL;

-- -----------------------------------------------------------------------------
-- Fechas de control y bitácora
-- -----------------------------------------------------------------------------
SET client_min_messages = warning;

SELECT auditoria.fn_instalar_auditoria(t.esquema, t.tabla)
  FROM (VALUES
        ('fuente', 'fuente'), ('fuente', 'lote_carga'), ('fuente', 'lote_mes'), ('fuente', 'defuncion_verificada'),
        ('desempeno', 'ficha'), ('desempeno', 'corrida'), ('desempeno', 'resultado_mensual'), ('desempeno', 'referencia_minsa')
       ) AS t (esquema, tabla);

CREATE TRIGGER tg_his_atencion_control BEFORE INSERT OR UPDATE ON fuente.his_atencion
    FOR EACH ROW EXECUTE FUNCTION auditoria.fn_columnas_control();
CREATE TRIGGER tg_sinadef_defuncion_control BEFORE INSERT OR UPDATE ON fuente.sinadef_defuncion
    FOR EACH ROW EXECUTE FUNCTION auditoria.fn_columnas_control();
CREATE TRIGGER tg_resultado_paciente_control BEFORE INSERT OR UPDATE ON desempeno.resultado_paciente
    FOR EACH ROW EXECUTE FUNCTION auditoria.fn_columnas_control();

RESET client_min_messages;
