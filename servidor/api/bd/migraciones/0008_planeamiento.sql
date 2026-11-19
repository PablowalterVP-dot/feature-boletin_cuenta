-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Migración 0008 · Planeamiento: ejecución de las actividades operativas (POI)
--
-- Planeamiento registra cada mes en CEPLAN la ejecución física de las
-- actividades operativas que alimentan los oficios de las nueve áreas. Casi
-- todas se calculan de los reportes que las áreas ya entregaron, y eso no se
-- guarda: se deriva cada vez, para que un reporte rectificado cambie la cifra
-- sin que nadie la copie de nuevo. Aquí va solo lo que escribe Planeamiento:
-- la cifra de una actividad que ningún reporte trae, o el ajuste (con su
-- nota) de una que sí se calcula.
--
-- El catálogo de actividades (código, meta, de dónde sale cada cifra) vive en
-- el frontend, `frontend/src/app/datos/planeamiento/actividades.js`, como los
-- formatos DIRESA. La base solo exige que el código tenga la forma de CEPLAN.
-- =============================================================================

CREATE SCHEMA planeamiento;

CREATE TABLE planeamiento.ejecucion_actividad (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    anio                      SMALLINT       NOT NULL,
    codigo_actividad          VARCHAR(20)    NOT NULL,
    mes                       SMALLINT       NOT NULL,
    valor                     NUMERIC(14, 2) NOT NULL,
    nota                      TEXT,
    usuario_id                BIGINT,
    fecha_creacion            TIMESTAMPTZ    NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_ejecucion_actividad PRIMARY KEY (id),
    CONSTRAINT fk_ejecucion_actividad_usuario FOREIGN KEY (usuario_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT ck_ejecucion_actividad_codigo  CHECK (codigo_actividad ~ '^AOI[0-9]{11}$'),
    CONSTRAINT ck_ejecucion_actividad_anio    CHECK (anio BETWEEN 2020 AND 2100),
    CONSTRAINT ck_ejecucion_actividad_mes     CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT ck_ejecucion_actividad_valor   CHECK (valor >= 0)
);

-- Una cifra vigente por actividad y mes. Cambiarla reescribe la fila (la
-- bitácora guarda la anterior); borrarla es borrado lógico.
CREATE UNIQUE INDEX uq_ejecucion_actividad ON planeamiento.ejecucion_actividad (anio, codigo_actividad, mes) WHERE fecha_eliminacion IS NULL;

COMMENT ON TABLE planeamiento.ejecucion_actividad IS
    'Lo que Planeamiento escribe de una actividad operativa del POI: la cifra del mes cuando ningún reporte la trae, o el ajuste de una calculada. Lo calculado no se guarda.';
COMMENT ON COLUMN planeamiento.ejecucion_actividad.nota IS
    'Por qué se ajustó una cifra calculada (la API la exige en ese caso), o de dónde salió una digitada.';

SET client_min_messages = warning;
SELECT auditoria.fn_instalar_auditoria('planeamiento', 'ejecucion_actividad');
RESET client_min_messages;
