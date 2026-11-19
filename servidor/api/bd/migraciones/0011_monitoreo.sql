-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Migración 0011 · Lo que el panel de monitoreo necesita recordar
--
-- Tres cosas que antes no existían en la base:
--
--   desempeno.resultado_registrado  cifras de un indicador tal como las publica
--                                   una fuente: el reporte DL 1153 de MINSA, el
--                                   cuadro de GERESA o lo que Estadística digita
--                                   de una oficina (fichas 27 a 31).
--   desempeno.dato_mes              lo que Estadística digita cada mes: camas,
--                                   egresos, consulta externa y las salas de
--                                   operaciones. Antes vivía en la memoria de la
--                                   sesión y se perdía al salir.
--   desempeno.compromiso_avance     cómo va cada entregable de los compromisos de
--                                   mejora. El catálogo vive en el frontend
--                                   (`datos/compromisos.js`), como los formatos.
--
-- `referencia_minsa` no alcanza para lo primero: guarda enteros y una sola serie,
-- y telemedicina publica 370,83 y la ocupación de cama trae dos (hospitalización
-- y UCI). Tampoco se reemplaza: la sigue usando el cálculo de la Ficha 14.
--
-- Son cifras agregadas: ninguna de estas tablas lleva datos de pacientes.
-- =============================================================================

CREATE TABLE desempeno.resultado_registrado (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    familia             VARCHAR(12)    NOT NULL,
    indicador           SMALLINT       NOT NULL,
    serie               VARCHAR(20)    NOT NULL DEFAULT 'principal',
    ambito              VARCHAR(10)    NOT NULL DEFAULT 'hospital',
    anio                SMALLINT       NOT NULL,
    mes                 SMALLINT       NOT NULL,
    numerador           NUMERIC(16, 4),
    denominador         NUMERIC(16, 4),
    origen              VARCHAR(20)    NOT NULL,
    fecha_corte         DATE,
    documento           VARCHAR(255),
    nota                TEXT,
    usuario_id          BIGINT,
    fecha_creacion      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    fecha_actualizacion TIMESTAMPTZ,
    fecha_eliminacion   TIMESTAMPTZ,
    CONSTRAINT pk_resultado_registrado PRIMARY KEY (id),
    CONSTRAINT fk_resultado_registrado_usuario FOREIGN KEY (usuario_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT ck_resultado_registrado_familia CHECK (familia IN ('dl1153', 'geresa')),
    CONSTRAINT ck_resultado_registrado_ambito  CHECK (ambito IN ('hospital', 'region')),
    CONSTRAINT ck_resultado_registrado_origen  CHECK (origen IN ('minsa_excel', 'geresa_excel', 'digitado')),
    CONSTRAINT ck_resultado_registrado_anio    CHECK (anio BETWEEN 2020 AND 2100),
    CONSTRAINT ck_resultado_registrado_mes     CHECK (mes BETWEEN 1 AND 12)
);

-- Una cifra vigente por indicador, serie, ámbito y mes. Una carga nueva reescribe
-- la fila; la bitácora guarda la anterior.
CREATE UNIQUE INDEX uq_resultado_registrado
    ON desempeno.resultado_registrado (familia, indicador, serie, ambito, anio, mes)
    WHERE fecha_eliminacion IS NULL;
CREATE INDEX ix_resultado_registrado_anio ON desempeno.resultado_registrado (anio, familia);

COMMENT ON TABLE desempeno.resultado_registrado IS
    'Numerador y denominador de un indicador en un mes, tal como los publica su fuente. No se calcula aquí: se registra.';
COMMENT ON COLUMN desempeno.resultado_registrado.serie IS
    'principal, o la parte de un indicador con varias: uci en la ficha 23; nav, itu, its, isq y end en la 27.';
COMMENT ON COLUMN desempeno.resultado_registrado.ambito IS
    'hospital: es del Hospital Regional de Loreto. region: es de toda la región y se rotula así; nunca se lee como del hospital.';

CREATE TABLE desempeno.dato_mes (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    anio                SMALLINT       NOT NULL,
    mes                 SMALLINT       NOT NULL,
    clave               VARCHAR(40)    NOT NULL,
    valor               NUMERIC(16, 4) NOT NULL,
    origen              VARCHAR(20)    NOT NULL DEFAULT 'digitado',
    nota                TEXT,
    usuario_id          BIGINT,
    fecha_creacion      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    fecha_actualizacion TIMESTAMPTZ,
    fecha_eliminacion   TIMESTAMPTZ,
    CONSTRAINT pk_dato_mes PRIMARY KEY (id),
    CONSTRAINT fk_dato_mes_usuario FOREIGN KEY (usuario_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT ck_dato_mes_origen CHECK (origen IN ('geresa_excel', 'digitado')),
    CONSTRAINT ck_dato_mes_anio   CHECK (anio BETWEEN 2020 AND 2100),
    CONSTRAINT ck_dato_mes_mes    CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT ck_dato_mes_valor  CHECK (valor >= 0)
);

CREATE UNIQUE INDEX uq_dato_mes ON desempeno.dato_mes (anio, mes, clave) WHERE fecha_eliminacion IS NULL;

COMMENT ON TABLE desempeno.dato_mes IS
    'Lo que Estadística obtiene por su cuenta, por mes y clave. Las claves son las de `datos/estadistica-propios.js`, más salasOperativas.';

CREATE TABLE desempeno.compromiso_avance (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    anio                SMALLINT     NOT NULL,
    compromiso          SMALLINT     NOT NULL,
    entregable          VARCHAR(40)  NOT NULL,
    estado              VARCHAR(12)  NOT NULL DEFAULT 'pendiente',
    fecha_cumplimiento  DATE,
    evidencia           TEXT,
    usuario_id          BIGINT,
    fecha_creacion      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion TIMESTAMPTZ,
    fecha_eliminacion   TIMESTAMPTZ,
    CONSTRAINT pk_compromiso_avance PRIMARY KEY (id),
    CONSTRAINT fk_compromiso_avance_usuario FOREIGN KEY (usuario_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT ck_compromiso_avance_estado CHECK (estado IN ('pendiente', 'en_curso', 'cumplido')),
    CONSTRAINT ck_compromiso_avance_anio   CHECK (anio BETWEEN 2020 AND 2100),
    CONSTRAINT ck_compromiso_avance_numero CHECK (compromiso BETWEEN 35 AND 48)
);

CREATE UNIQUE INDEX uq_compromiso_avance ON desempeno.compromiso_avance (anio, compromiso, entregable) WHERE fecha_eliminacion IS NULL;

COMMENT ON TABLE desempeno.compromiso_avance IS
    'Cómo va cada entregable de un compromiso de mejora. Sin fila, sigue pendiente: no se guarda un registro vacío.';
COMMENT ON COLUMN desempeno.compromiso_avance.evidencia IS
    'Qué lo sustenta: número de resolución, oficio o enlace. El documento se queda donde exige MINSA.';

SET client_min_messages = warning;
SELECT auditoria.fn_instalar_auditoria('desempeno', 'resultado_registrado');
SELECT auditoria.fn_instalar_auditoria('desempeno', 'dato_mes');
SELECT auditoria.fn_instalar_auditoria('desempeno', 'compromiso_avance');
RESET client_min_messages;
