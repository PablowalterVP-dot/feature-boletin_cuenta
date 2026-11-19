-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Avance 04 · Esquema de base de datos (PostgreSQL 14+)
--
-- Núcleo común + módulo de Nutrición y Dietética.
--
-- Convenciones (ver informe, § 4):
--   · Nombres en español, singular, snake_case, sin tildes ni ñ en identificadores.
--   · PK: id BIGINT GENERATED ALWAYS AS IDENTITY.  FK: <tabla>_id.
--   · Booleanos con prefijo es_ / tiene_. Fechas con prefijo fecha_.
--   · Restricciones: pk_, fk_, uq_, ck_; índices: ix_ (y uq_ si son únicos).
--   · Toda tabla lleva tres columnas de control de fechas:
--       fecha_creacion, fecha_actualizacion, fecha_eliminacion (borrado lógico)
--     Las llenan los disparadores de 02_auditoria.sql, no la aplicación.
--     QUIÉN creó, modificó o eliminó cada registro se consulta en
--     auditoria.registro_cambio (observación 01 del avance 01: sin columnas
--     de usuario ni FK hacia seguridad.usuario en las columnas de control).
--   · Se permite el DELETE físico (observación 02); queda en la bitácora.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS seguridad;     -- usuarios, roles y permisos
CREATE SCHEMA IF NOT EXISTS organizacion;  -- unidades orgánicas, matriz de destinos, periodos
CREATE SCHEMA IF NOT EXISTS formato;       -- catálogo: qué datos reporta cada área (metadatos)
CREATE SCHEMA IF NOT EXISTS reporte;       -- operación: reportes, cargas, valores, remisiones
CREATE SCHEMA IF NOT EXISTS auditoria;     -- bitácora de cambios

-- -----------------------------------------------------------------------------
-- SEGURIDAD
-- -----------------------------------------------------------------------------

CREATE TABLE seguridad.usuario (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    nombre_usuario            VARCHAR(60)  NOT NULL,
    correo                    VARCHAR(150),
    contrasena_hash           VARCHAR(255) NOT NULL,
    nombres                   VARCHAR(100) NOT NULL,
    apellidos                 VARCHAR(100) NOT NULL,
    numero_documento          VARCHAR(20),
    cargo                     VARCHAR(150),
    es_activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
    debe_cambiar_contrasena   BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_ultimo_acceso       TIMESTAMPTZ,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_usuario PRIMARY KEY (id)
);
CREATE UNIQUE INDEX uq_usuario_nombre_usuario ON seguridad.usuario (lower(nombre_usuario)) WHERE fecha_eliminacion IS NULL;
CREATE UNIQUE INDEX uq_usuario_correo         ON seguridad.usuario (lower(correo))         WHERE fecha_eliminacion IS NULL AND correo IS NOT NULL;

-- alcance: 'global'  → el rol actúa sobre todo el sistema (unidad_organica_id nula)
--          'unidad'  → el rol se asigna atado a una unidad orgánica
--          'ambos'   → admite las dos formas (p. ej. consulta)
CREATE TABLE seguridad.rol (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    codigo                    VARCHAR(40)  NOT NULL,
    nombre                    VARCHAR(80)  NOT NULL,
    descripcion               TEXT,
    alcance                   VARCHAR(10)  NOT NULL,
    es_sistema                BOOLEAN      NOT NULL DEFAULT FALSE,  -- no se puede borrar desde la interfaz
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_rol PRIMARY KEY (id),
    CONSTRAINT ck_rol_alcance CHECK (alcance IN ('global', 'unidad', 'ambos'))
);
CREATE UNIQUE INDEX uq_rol_codigo ON seguridad.rol (codigo) WHERE fecha_eliminacion IS NULL;

CREATE TABLE seguridad.permiso (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    codigo                    VARCHAR(80)  NOT NULL,   -- <modulo>.<accion>, p. ej. reporte.enviar
    modulo                    VARCHAR(40)  NOT NULL,
    descripcion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_permiso PRIMARY KEY (id)
);
CREATE UNIQUE INDEX uq_permiso_codigo ON seguridad.permiso (codigo) WHERE fecha_eliminacion IS NULL;

CREATE TABLE seguridad.rol_permiso (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    rol_id                    BIGINT NOT NULL,
    permiso_id                BIGINT NOT NULL,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_rol_permiso PRIMARY KEY (id),
    CONSTRAINT fk_rol_permiso_rol     FOREIGN KEY (rol_id)     REFERENCES seguridad.rol (id),
    CONSTRAINT fk_rol_permiso_permiso FOREIGN KEY (permiso_id) REFERENCES seguridad.permiso (id)
);
CREATE UNIQUE INDEX uq_rol_permiso ON seguridad.rol_permiso (rol_id, permiso_id) WHERE fecha_eliminacion IS NULL;

-- usuario_rol se crea después de organizacion.unidad_organica (necesita su FK).

-- -----------------------------------------------------------------------------
-- ORGANIZACIÓN
-- -----------------------------------------------------------------------------

-- Una sola tabla para áreas que reportan, oficinas que reciben y entidades
-- externas (DIRESA). Epidemiología reporta y recibe: es_reportante y
-- es_receptora a la vez, sin necesidad de un tercer tipo de registro.
CREATE TABLE organizacion.unidad_organica (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    codigo                    VARCHAR(20)  NOT NULL,   -- sigla: NUT, EST, PLA, …
    clave                     VARCHAR(60)  NOT NULL,   -- identificador legible para la API: nutricion
    nombre                    VARCHAR(200) NOT NULL,
    nombre_corto              VARCHAR(100),
    tipo                      VARCHAR(20)  NOT NULL,
    unidad_padre_id           BIGINT,                  -- organigrama (opcional)
    es_reportante             BOOLEAN      NOT NULL DEFAULT FALSE,
    es_receptora              BOOLEAN      NOT NULL DEFAULT FALSE,
    es_estadistica            BOOLEAN      NOT NULL DEFAULT FALSE,  -- la oficina central (una sola)
    es_externa                BOOLEAN      NOT NULL DEFAULT FALSE,  -- fuera del hospital (DIRESA)
    es_activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_unidad_organica PRIMARY KEY (id),
    CONSTRAINT fk_unidad_organica_padre FOREIGN KEY (unidad_padre_id) REFERENCES organizacion.unidad_organica (id),
    CONSTRAINT ck_unidad_organica_tipo CHECK (tipo IN ('departamento', 'servicio', 'oficina', 'area', 'externa'))
);
CREATE UNIQUE INDEX uq_unidad_organica_codigo ON organizacion.unidad_organica (codigo) WHERE fecha_eliminacion IS NULL;
CREATE UNIQUE INDEX uq_unidad_organica_clave  ON organizacion.unidad_organica (clave)  WHERE fecha_eliminacion IS NULL;
CREATE UNIQUE INDEX uq_unidad_organica_estadistica ON organizacion.unidad_organica (es_estadistica) WHERE es_estadistica AND fecha_eliminacion IS NULL;

CREATE TABLE seguridad.usuario_rol (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    usuario_id                BIGINT NOT NULL,
    rol_id                    BIGINT NOT NULL,
    unidad_organica_id        BIGINT,       -- NULL = asignación global
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_usuario_rol PRIMARY KEY (id),
    CONSTRAINT fk_usuario_rol_usuario FOREIGN KEY (usuario_id)         REFERENCES seguridad.usuario (id),
    CONSTRAINT fk_usuario_rol_rol     FOREIGN KEY (rol_id)             REFERENCES seguridad.rol (id),
    CONSTRAINT fk_usuario_rol_unidad  FOREIGN KEY (unidad_organica_id) REFERENCES organizacion.unidad_organica (id)
);
CREATE UNIQUE INDEX uq_usuario_rol ON seguridad.usuario_rol (usuario_id, rol_id, COALESCE(unidad_organica_id, 0)) WHERE fecha_eliminacion IS NULL;
CREATE INDEX ix_usuario_rol_unidad ON seguridad.usuario_rol (unidad_organica_id);

-- Matriz de destinos: a qué oficinas va el reporte de cada área, además de
-- Estadística. Con vigencia, para que un cambio no reescriba el pasado.
CREATE TABLE organizacion.destino (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    unidad_origen_id          BIGINT NOT NULL,
    unidad_destino_id         BIGINT NOT NULL,
    es_entrega_inmediata      BOOLEAN NOT NULL DEFAULT FALSE,  -- recibe al enviar, sin esperar la validación
    fecha_inicio_vigencia     DATE    NOT NULL,
    fecha_fin_vigencia        DATE,
    observacion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_destino PRIMARY KEY (id),
    CONSTRAINT fk_destino_origen  FOREIGN KEY (unidad_origen_id)  REFERENCES organizacion.unidad_organica (id),
    CONSTRAINT fk_destino_destino FOREIGN KEY (unidad_destino_id) REFERENCES organizacion.unidad_organica (id),
    CONSTRAINT ck_destino_distintos CHECK (unidad_origen_id <> unidad_destino_id),
    CONSTRAINT ck_destino_vigencia  CHECK (fecha_fin_vigencia IS NULL OR fecha_fin_vigencia >= fecha_inicio_vigencia)
);
CREATE INDEX ix_destino_origen ON organizacion.destino (unidad_origen_id);

-- Periodo de reporte: el mes cerrado. Los plazos se guardan en el periodo
-- (no se recalculan) para que un cambio de regla no altere meses pasados.
CREATE TABLE organizacion.periodo (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    anio                      SMALLINT NOT NULL,
    mes                       SMALLINT NOT NULL,
    fecha_inicio              DATE     NOT NULL,
    fecha_fin                 DATE     NOT NULL,
    fecha_limite_entrega      DATE     NOT NULL,   -- áreas → Estadística
    fecha_limite_remision     DATE,                -- Estadística → DIRESA
    es_cerrado                BOOLEAN  NOT NULL DEFAULT FALSE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_periodo PRIMARY KEY (id),
    CONSTRAINT ck_periodo_mes    CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT ck_periodo_fechas CHECK (fecha_fin >= fecha_inicio AND fecha_limite_entrega > fecha_fin)
);
CREATE UNIQUE INDEX uq_periodo_anio_mes ON organizacion.periodo (anio, mes) WHERE fecha_eliminacion IS NULL;

-- Parámetros del sistema (clave → valor): nombre del establecimiento,
-- día límite de entrega, ruta base de archivos, etc.
CREATE TABLE organizacion.parametro (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    clave                     VARCHAR(80)  NOT NULL,
    valor                     TEXT         NOT NULL,
    tipo_dato                 VARCHAR(20)  NOT NULL DEFAULT 'texto',
    descripcion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_parametro PRIMARY KEY (id),
    CONSTRAINT ck_parametro_tipo_dato CHECK (tipo_dato IN ('texto', 'entero', 'decimal', 'booleano', 'fecha'))
);
CREATE UNIQUE INDEX uq_parametro_clave ON organizacion.parametro (clave) WHERE fecha_eliminacion IS NULL;

-- -----------------------------------------------------------------------------
-- FORMATO (catálogo de metadatos)
--
-- Describe QUÉ reporta cada área y CÓMO leerlo de su propio Excel, sin crear
-- tablas por área:
--   formato ─< formato_version ─< criterio_reconocimiento   (¿es este archivo?)
--      │               ├─< cuadro                         (¿en qué hoja?)
--      │               └─< version_indicador >─ indicador (¿en qué celdas?)
--      └─< indicador ─< indicador_dimension >─ dimension_valor >─ dimension
--
-- Avance 03: las áreas suben SU PROPIO Excel, el que ya usan. El sistema no
-- impone una plantilla. Por eso cada versión guarda una "configuración de
-- lectura": cómo reconocer el archivo y dónde está cada dato dentro de él.
-- Agregar un área o un dato nuevo = insertar filas aquí, no ALTER TABLE.
-- -----------------------------------------------------------------------------

CREATE TABLE formato.formato (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    unidad_organica_id        BIGINT       NOT NULL,
    codigo                    VARCHAR(30)  NOT NULL,
    nombre                    VARCHAR(200) NOT NULL,
    descripcion               TEXT,
    periodicidad              VARCHAR(15)  NOT NULL DEFAULT 'mensual',
    granularidad              VARCHAR(15)  NOT NULL,   -- nivel del dato capturado
    es_activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_formato PRIMARY KEY (id),
    CONSTRAINT fk_formato_unidad FOREIGN KEY (unidad_organica_id) REFERENCES organizacion.unidad_organica (id),
    CONSTRAINT ck_formato_periodicidad CHECK (periodicidad IN ('mensual')),
    CONSTRAINT ck_formato_granularidad CHECK (granularidad IN ('diaria', 'mensual'))
);
CREATE UNIQUE INDEX uq_formato_codigo ON formato.formato (codigo) WHERE fecha_eliminacion IS NULL;

-- Versión de la ESTRUCTURA del archivo propio del área, con su configuración
-- de lectura. Si el área cambia su Excel (mueve un cuadro, renombra una hoja,
-- agrega filas) o se quiere jalar un dato más, se crea otra versión: los
-- reportes ya cargados quedan atados a la configuración que los leyó.
--
-- estado:
--   en_configuracion → se está armando; el bot no la usa
--   activa           → el bot la usa para reconocer y leer archivos
--   retirada         → ya no se usa para archivos nuevos (el área cambió su Excel)
-- Pueden coexistir varias activas: el bot se queda con la única cuyos criterios
-- de reconocimiento se cumplen.
CREATE TABLE formato.formato_version (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    formato_id                BIGINT      NOT NULL,
    codigo_version            VARCHAR(20) NOT NULL,    -- código interno: NUT-1, NUT-2…
    estado                    VARCHAR(20) NOT NULL DEFAULT 'en_configuracion',
    tipo_archivo              VARCHAR(10),             -- xlsx, xls, csv (obligatorio al activar)
    lectura_periodo           JSONB,                   -- de dónde sale el mes/año dentro del archivo (opcional)
    fecha_inicio_vigencia     DATE        NOT NULL,
    fecha_fin_vigencia        DATE,
    archivo_muestra_id        BIGINT,                  -- un archivo real del área usado para configurar (FK abajo)
    notas                     TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_formato_version PRIMARY KEY (id),
    CONSTRAINT fk_formato_version_formato FOREIGN KEY (formato_id) REFERENCES formato.formato (id),
    CONSTRAINT ck_formato_version_estado  CHECK (estado IN ('en_configuracion', 'activa', 'retirada')),
    CONSTRAINT ck_formato_version_tipo    CHECK (tipo_archivo IS NULL OR tipo_archivo IN ('xlsx', 'xls', 'csv')),
    CONSTRAINT ck_formato_version_periodo CHECK (lectura_periodo IS NULL OR jsonb_typeof(lectura_periodo) = 'object'),
    CONSTRAINT ck_formato_version_vigencia CHECK (fecha_fin_vigencia IS NULL OR fecha_fin_vigencia >= fecha_inicio_vigencia)
);
CREATE UNIQUE INDEX uq_formato_version_codigo ON formato.formato_version (formato_id, codigo_version) WHERE fecha_eliminacion IS NULL;

-- Cómo reconoce el bot que un archivo subido tiene ESTA estructura. Todos los
-- criterios obligatorios de la versión deben cumplirse.
--   hoja_existe  → existe una hoja con ese nombre (o que cumple el patrón)
--   celda_texto  → en esa hoja y celda hay un texto que cumple el patrón
-- Los textos se comparan sin distinguir mayúsculas, tildes ni espacios extra.
CREATE TABLE formato.criterio_reconocimiento (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    formato_version_id        BIGINT       NOT NULL,
    tipo                      VARCHAR(20)  NOT NULL,
    hoja                      VARCHAR(200) NOT NULL,   -- nombre exacto o patrón (según es_patron)
    es_patron                 BOOLEAN      NOT NULL DEFAULT FALSE,
    celda                     VARCHAR(10),             -- A1, solo para celda_texto
    texto_esperado            VARCHAR(300),            -- patrón (expresión regular), solo para celda_texto
    es_obligatorio            BOOLEAN      NOT NULL DEFAULT TRUE,
    descripcion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_criterio_reconocimiento PRIMARY KEY (id),
    CONSTRAINT fk_criterio_reconocimiento_version FOREIGN KEY (formato_version_id) REFERENCES formato.formato_version (id),
    CONSTRAINT ck_criterio_reconocimiento_tipo  CHECK (tipo IN ('hoja_existe', 'celda_texto')),
    CONSTRAINT ck_criterio_reconocimiento_celda CHECK (tipo <> 'celda_texto' OR (celda IS NOT NULL AND texto_esperado IS NOT NULL))
);
CREATE INDEX ix_criterio_reconocimiento_version ON formato.criterio_reconocimiento (formato_version_id);

-- Cuadro = una tabla del reporte, ubicada en una hoja del Excel del área.
-- ubicacion (JSONB) dice cómo están dispuestos los días en esa hoja, p. ej.:
--   {"orientacion": "horizontal", "fila_dias": 3, "columna_primer_dia": "C"}
--   {"orientacion": "horizontal", "buscar_fila_dias": true}
--   {"orientacion": "vertical",   "columna_dias": "A", "fila_primer_dia": 5}
-- Los formatos de granularidad mensual no la necesitan.
CREATE TABLE formato.cuadro (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    formato_version_id        BIGINT       NOT NULL,
    codigo                    VARCHAR(20)  NOT NULL,   -- f1, f2, …
    numero                    SMALLINT     NOT NULL,
    titulo                    VARCHAR(200) NOT NULL,
    descripcion               TEXT,
    hoja                      VARCHAR(200),            -- nombre exacto o patrón de la hoja (obligatorio al activar)
    es_hoja_patron            BOOLEAN      NOT NULL DEFAULT FALSE,
    ubicacion                 JSONB,                   -- disposición de los días en la hoja
    orden                     SMALLINT     NOT NULL DEFAULT 0,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_cuadro PRIMARY KEY (id),
    CONSTRAINT fk_cuadro_formato_version FOREIGN KEY (formato_version_id) REFERENCES formato.formato_version (id),
    CONSTRAINT ck_cuadro_ubicacion CHECK (ubicacion IS NULL OR (jsonb_typeof(ubicacion) = 'object' AND ubicacion ? 'orientacion'))
);
CREATE UNIQUE INDEX uq_cuadro_codigo ON formato.cuadro (formato_version_id, codigo) WHERE fecha_eliminacion IS NULL;

-- Indicador = una fila de datos (lo que se mide). Pertenece al formato, no a
-- la versión: conserva su identidad entre versiones para poder comparar meses.
CREATE TABLE formato.indicador (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    formato_id                BIGINT       NOT NULL,
    codigo                    VARCHAR(80)  NOT NULL,   -- f3.liquida.cena
    nombre                    VARCHAR(200) NOT NULL,
    descripcion               TEXT,
    tipo_dato                 VARCHAR(10)  NOT NULL DEFAULT 'entero',
    unidad_medida             VARCHAR(30),             -- raciones, kg, exámenes…
    valor_minimo              NUMERIC(14,2),
    valor_maximo              NUMERIC(14,2),
    es_obligatorio            BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_indicador PRIMARY KEY (id),
    CONSTRAINT fk_indicador_formato FOREIGN KEY (formato_id) REFERENCES formato.formato (id),
    CONSTRAINT ck_indicador_tipo_dato CHECK (tipo_dato IN ('entero', 'decimal'))
);
CREATE UNIQUE INDEX uq_indicador_codigo ON formato.indicador (formato_id, codigo) WHERE fecha_eliminacion IS NULL;

-- Qué indicadores trae cada versión, en qué cuadro y DÓNDE están en el Excel
-- del área. Es lo que el bot usa para "jalar" los datos.
--
-- metodo_lectura + ubicacion (JSONB):
--   rango    → {"rango": "C12:AF12"}
--              celdas fijas: los días en orden (o una sola celda si es mensual)
--   celda    → {"celda": "D5"}
--              una sola celda (formatos mensuales)
--   etiqueta → {"etiquetas": ["Dieta líquida", "Cena"], "columnas": ["A", "B"], "arrastrar_vacias": true}
--              busca la fila cuyo texto en esas columnas coincide; los días se
--              toman según la ubicacion del cuadro. "arrastrar_vacias" repite
--              hacia abajo el último texto visto (celdas combinadas o en blanco).
--              Sobrevive a que el área inserte o mueva filas.
-- ubicacion_total: dónde está el total que el propio Excel escribe para esa
-- fila, si lo tiene ({"columna": "AG"} o {"celda": "AG12"}). Sirve para la regla
-- "totales"; si el archivo no trae totales, queda nulo.
CREATE TABLE formato.version_indicador (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    formato_version_id        BIGINT       NOT NULL,
    cuadro_id                 BIGINT       NOT NULL,
    indicador_id              BIGINT       NOT NULL,
    orden                     SMALLINT     NOT NULL DEFAULT 0,
    etiqueta                  VARCHAR(200),            -- cómo se llama la fila en el Excel del área
    metodo_lectura            VARCHAR(10),             -- obligatorio al activar
    ubicacion                 JSONB,                   -- obligatoria al activar
    ubicacion_total           JSONB,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_version_indicador PRIMARY KEY (id),
    CONSTRAINT fk_version_indicador_version   FOREIGN KEY (formato_version_id) REFERENCES formato.formato_version (id),
    CONSTRAINT fk_version_indicador_cuadro    FOREIGN KEY (cuadro_id)          REFERENCES formato.cuadro (id),
    CONSTRAINT fk_version_indicador_indicador FOREIGN KEY (indicador_id)       REFERENCES formato.indicador (id),
    CONSTRAINT ck_version_indicador_metodo    CHECK (metodo_lectura IS NULL OR metodo_lectura IN ('rango', 'celda', 'etiqueta')),
    CONSTRAINT ck_version_indicador_ubicacion CHECK (
        ubicacion IS NULL
        OR (metodo_lectura = 'rango'    AND ubicacion ? 'rango')
        OR (metodo_lectura = 'celda'    AND ubicacion ? 'celda')
        OR (metodo_lectura = 'etiqueta' AND jsonb_typeof(ubicacion -> 'etiquetas') = 'array'
                                        AND jsonb_typeof(ubicacion -> 'columnas')  = 'array')
    ),
    CONSTRAINT ck_version_indicador_total CHECK (ubicacion_total IS NULL OR jsonb_typeof(ubicacion_total) = 'object')
);
CREATE UNIQUE INDEX uq_version_indicador ON formato.version_indicador (formato_version_id, indicador_id) WHERE fecha_eliminacion IS NULL;

-- Dimensiones de análisis: población, servicio, comida, financiador…
-- Permiten sumar "todas las cenas" o "pacientes de emergencia" sin conocer
-- las filas de antemano.
CREATE TABLE formato.dimension (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    codigo                    VARCHAR(40)  NOT NULL,
    nombre                    VARCHAR(100) NOT NULL,
    descripcion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_dimension PRIMARY KEY (id)
);
CREATE UNIQUE INDEX uq_dimension_codigo ON formato.dimension (codigo) WHERE fecha_eliminacion IS NULL;

CREATE TABLE formato.dimension_valor (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    dimension_id              BIGINT       NOT NULL,
    codigo                    VARCHAR(40)  NOT NULL,
    nombre                    VARCHAR(150) NOT NULL,
    descripcion               TEXT,
    orden                     SMALLINT     NOT NULL DEFAULT 0,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_dimension_valor PRIMARY KEY (id),
    CONSTRAINT fk_dimension_valor_dimension FOREIGN KEY (dimension_id) REFERENCES formato.dimension (id),
    CONSTRAINT uq_dimension_valor_id_dimension UNIQUE (id, dimension_id)   -- para la FK compuesta de abajo
);
CREATE UNIQUE INDEX uq_dimension_valor_codigo ON formato.dimension_valor (dimension_id, codigo) WHERE fecha_eliminacion IS NULL;

-- Un indicador toma a lo más UN valor por dimensión (FK compuesta).
CREATE TABLE formato.indicador_dimension (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    indicador_id              BIGINT NOT NULL,
    dimension_id              BIGINT NOT NULL,
    dimension_valor_id        BIGINT NOT NULL,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_indicador_dimension PRIMARY KEY (id),
    CONSTRAINT fk_indicador_dimension_indicador FOREIGN KEY (indicador_id) REFERENCES formato.indicador (id),
    CONSTRAINT fk_indicador_dimension_valor     FOREIGN KEY (dimension_valor_id, dimension_id)
        REFERENCES formato.dimension_valor (id, dimension_id)
);
CREATE UNIQUE INDEX uq_indicador_dimension ON formato.indicador_dimension (indicador_id, dimension_id) WHERE fecha_eliminacion IS NULL;
CREATE INDEX ix_indicador_dimension_valor ON formato.indicador_dimension (dimension_valor_id);

-- Reglas que aplica el bot. La lógica vive en el código del bot; aquí se
-- registran su nivel y sus parámetros para poder activarlas o ajustarlas.
CREATE TABLE formato.regla_validacion (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    formato_id                BIGINT       NOT NULL,
    codigo                    VARCHAR(40)  NOT NULL,   -- incompleto, totales, atipico…
    nivel                     VARCHAR(10)  NOT NULL,
    descripcion               TEXT         NOT NULL,
    parametros                JSONB        NOT NULL DEFAULT '{}'::jsonb,
    es_activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_regla_validacion PRIMARY KEY (id),
    CONSTRAINT fk_regla_validacion_formato FOREIGN KEY (formato_id) REFERENCES formato.formato (id),
    CONSTRAINT ck_regla_validacion_nivel CHECK (nivel IN ('error', 'aviso', 'info'))
);
CREATE UNIQUE INDEX uq_regla_validacion_codigo ON formato.regla_validacion (formato_id, codigo) WHERE fecha_eliminacion IS NULL;

-- Metas: anuales (mes nulo) o mensuales, sobre un corte de dimensiones.
-- Ej.: meta anual de raciones a pacientes de hospitalización = meta con
-- dimensiones {poblacion: paciente, servicio: hospitalizacion}.
CREATE TABLE formato.meta (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    formato_id                BIGINT        NOT NULL,
    anio                      SMALLINT      NOT NULL,
    mes                       SMALLINT,
    descripcion               VARCHAR(200),
    valor                     NUMERIC(14,2) NOT NULL,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_meta PRIMARY KEY (id),
    CONSTRAINT fk_meta_formato FOREIGN KEY (formato_id) REFERENCES formato.formato (id),
    CONSTRAINT ck_meta_mes   CHECK (mes IS NULL OR mes BETWEEN 1 AND 12),
    CONSTRAINT ck_meta_valor CHECK (valor >= 0)
);
CREATE INDEX ix_meta_formato_anio ON formato.meta (formato_id, anio);

CREATE TABLE formato.meta_dimension (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    meta_id                   BIGINT NOT NULL,
    dimension_id              BIGINT NOT NULL,
    dimension_valor_id        BIGINT NOT NULL,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_meta_dimension PRIMARY KEY (id),
    CONSTRAINT fk_meta_dimension_meta  FOREIGN KEY (meta_id) REFERENCES formato.meta (id),
    CONSTRAINT fk_meta_dimension_valor FOREIGN KEY (dimension_valor_id, dimension_id)
        REFERENCES formato.dimension_valor (id, dimension_id)
);
CREATE UNIQUE INDEX uq_meta_dimension ON formato.meta_dimension (meta_id, dimension_id) WHERE fecha_eliminacion IS NULL;

-- -----------------------------------------------------------------------------
-- REPORTE (operación)
-- -----------------------------------------------------------------------------

-- Estados del reporte y transiciones permitidas (máquina de estados).
-- "no_iniciado" no se guarda: la ausencia de reporte ES ese estado.
CREATE TABLE reporte.estado_reporte (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    codigo                    VARCHAR(20)  NOT NULL,
    nombre                    VARCHAR(60)  NOT NULL,
    descripcion               TEXT,
    orden                     SMALLINT     NOT NULL,
    es_final                  BOOLEAN      NOT NULL DEFAULT FALSE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_estado_reporte PRIMARY KEY (id)
);
CREATE UNIQUE INDEX uq_estado_reporte_codigo ON reporte.estado_reporte (codigo) WHERE fecha_eliminacion IS NULL;

CREATE TABLE reporte.transicion_estado (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    accion                    VARCHAR(20) NOT NULL,    -- enviar, revisar, validar, remitir, rectificar
    estado_origen_id          BIGINT      NOT NULL,
    estado_destino_id         BIGINT      NOT NULL,
    permiso_id                BIGINT      NOT NULL,    -- permiso que exige la acción
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_transicion_estado PRIMARY KEY (id),
    CONSTRAINT fk_transicion_estado_origen  FOREIGN KEY (estado_origen_id)  REFERENCES reporte.estado_reporte (id),
    CONSTRAINT fk_transicion_estado_destino FOREIGN KEY (estado_destino_id) REFERENCES reporte.estado_reporte (id),
    CONSTRAINT fk_transicion_estado_permiso FOREIGN KEY (permiso_id)        REFERENCES seguridad.permiso (id)
);
CREATE UNIQUE INDEX uq_transicion_estado ON reporte.transicion_estado (estado_origen_id, accion) WHERE fecha_eliminacion IS NULL;

-- Archivo físico (Excel subido por el área, archivo de muestra, exportación). La BD guarda solo la
-- ubicación y la huella; el contenido vive en el almacenamiento de archivos.
CREATE TABLE reporte.archivo (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    nombre_original           VARCHAR(255) NOT NULL,
    ruta_almacenamiento       VARCHAR(500) NOT NULL,
    tipo_mime                 VARCHAR(120),
    tamano_bytes              BIGINT       NOT NULL,
    huella_sha256             CHAR(64)     NOT NULL,
    proposito                 VARCHAR(20)  NOT NULL,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_archivo PRIMARY KEY (id),
    CONSTRAINT ck_archivo_tamano    CHECK (tamano_bytes >= 0),
    CONSTRAINT ck_archivo_huella    CHECK (huella_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_archivo_proposito CHECK (proposito IN ('carga', 'muestra', 'exportacion', 'remision'))
);
CREATE INDEX ix_archivo_huella ON reporte.archivo (huella_sha256);

ALTER TABLE formato.formato_version
    ADD CONSTRAINT fk_formato_version_archivo FOREIGN KEY (archivo_muestra_id) REFERENCES reporte.archivo (id);

-- Reporte: un formato de un área para un periodo. Uno solo vigente por
-- formato y periodo; una rectificación no crea otro reporte, sube el número.
-- formato_version_id lo fija la carga aceptada: el sistema no sabe con qué
-- estructura viene el Excel del área hasta que el bot la reconoce.
CREATE TABLE reporte.reporte (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    formato_id                BIGINT      NOT NULL,
    periodo_id                BIGINT      NOT NULL,
    formato_version_id        BIGINT,                  -- la estructura con que se leyó; nula hasta la primera carga aceptada
    estado_reporte_id         BIGINT      NOT NULL,
    numero_rectificacion      SMALLINT    NOT NULL DEFAULT 0,
    folio_constancia          VARCHAR(30),             -- constancia de recepción (reemplaza el sello de cargo)
    fecha_envio               TIMESTAMPTZ,
    usuario_envio_id          BIGINT,
    fecha_validacion          TIMESTAMPTZ,
    usuario_validacion_id     BIGINT,
    observacion               TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_reporte PRIMARY KEY (id),
    CONSTRAINT fk_reporte_formato         FOREIGN KEY (formato_id)            REFERENCES formato.formato (id),
    CONSTRAINT fk_reporte_periodo         FOREIGN KEY (periodo_id)            REFERENCES organizacion.periodo (id),
    CONSTRAINT fk_reporte_formato_version FOREIGN KEY (formato_version_id)    REFERENCES formato.formato_version (id),
    CONSTRAINT fk_reporte_estado          FOREIGN KEY (estado_reporte_id)     REFERENCES reporte.estado_reporte (id),
    CONSTRAINT fk_reporte_usuario_envio   FOREIGN KEY (usuario_envio_id)      REFERENCES seguridad.usuario (id),
    CONSTRAINT fk_reporte_usuario_valida  FOREIGN KEY (usuario_validacion_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT ck_reporte_rectificacion   CHECK (numero_rectificacion >= 0)
);
CREATE UNIQUE INDEX uq_reporte_formato_periodo ON reporte.reporte (formato_id, periodo_id) WHERE fecha_eliminacion IS NULL;
CREATE UNIQUE INDEX uq_reporte_folio ON reporte.reporte (folio_constancia) WHERE folio_constancia IS NOT NULL;
CREATE INDEX ix_reporte_periodo ON reporte.reporte (periodo_id);
CREATE INDEX ix_reporte_estado  ON reporte.reporte (estado_reporte_id);

-- Historia de estados: quién movió el reporte, cuándo y de dónde a dónde.
-- Alimenta el semáforo ("el área no envió" vs. "Estadística no revisó").
CREATE TABLE reporte.reporte_historial_estado (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    reporte_id                BIGINT      NOT NULL,
    estado_origen_id          BIGINT,                  -- nulo al crear
    estado_destino_id         BIGINT      NOT NULL,
    accion                    VARCHAR(20) NOT NULL,
    numero_rectificacion      SMALLINT    NOT NULL DEFAULT 0,
    comentario                TEXT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_reporte_historial_estado PRIMARY KEY (id),
    CONSTRAINT fk_historial_reporte FOREIGN KEY (reporte_id)        REFERENCES reporte.reporte (id),
    CONSTRAINT fk_historial_origen  FOREIGN KEY (estado_origen_id)  REFERENCES reporte.estado_reporte (id),
    CONSTRAINT fk_historial_destino FOREIGN KEY (estado_destino_id) REFERENCES reporte.estado_reporte (id)
);
CREATE INDEX ix_historial_reporte ON reporte.reporte_historial_estado (reporte_id, fecha_creacion);

-- Carga: cada vez que el área sube un Excel y el bot lo procesa.
-- Solo una carga vigente por reporte (la que dio origen a los valores).
CREATE TABLE reporte.carga (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    reporte_id                BIGINT      NOT NULL,
    archivo_id                BIGINT      NOT NULL,
    formato_version_id        BIGINT,                  -- estructura reconocida por sus criterios; nula si no se reconoció
    version_bot               VARCHAR(20),
    resultado                 VARCHAR(15) NOT NULL,
    codigo_bloqueo            VARCHAR(40),
    detalle_bloqueo           TEXT,
    casillas_leidas           INTEGER,
    total_errores             INTEGER     NOT NULL DEFAULT 0,
    total_avisos              INTEGER     NOT NULL DEFAULT 0,
    total_info                INTEGER     NOT NULL DEFAULT 0,
    informe_bot               JSONB,                   -- informe completo, tal como lo devolvió el bot
    es_vigente                BOOLEAN     NOT NULL DEFAULT FALSE,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_carga PRIMARY KEY (id),
    CONSTRAINT fk_carga_reporte FOREIGN KEY (reporte_id)         REFERENCES reporte.reporte (id),
    CONSTRAINT fk_carga_archivo FOREIGN KEY (archivo_id)         REFERENCES reporte.archivo (id),
    CONSTRAINT fk_carga_version FOREIGN KEY (formato_version_id) REFERENCES formato.formato_version (id),
    CONSTRAINT ck_carga_resultado CHECK (resultado IN ('aceptada', 'bloqueada')),
    CONSTRAINT ck_carga_bloqueo   CHECK ((resultado = 'bloqueada') = (codigo_bloqueo IS NOT NULL)),
    CONSTRAINT ck_carga_vigente   CHECK (NOT es_vigente OR resultado = 'aceptada')
);
CREATE UNIQUE INDEX uq_carga_vigente ON reporte.carga (reporte_id) WHERE es_vigente AND fecha_eliminacion IS NULL;
CREATE INDEX ix_carga_reporte ON reporte.carga (reporte_id);

-- Valor: una casilla. dia nulo = dato mensual (formatos de granularidad mensual).
-- El total del mes NO se guarda: se calcula (vistas de 05_vistas.sql).
CREATE TABLE reporte.valor (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    reporte_id                BIGINT        NOT NULL,
    indicador_id              BIGINT        NOT NULL,
    dia                       SMALLINT,
    valor                     NUMERIC(14,2),           -- nulo = no se registró (≠ 0)
    texto_original            VARCHAR(100),            -- lo que decía la casilla si no era un número
    origen                    VARCHAR(10)   NOT NULL,
    carga_id                  BIGINT,
    hoja_excel                VARCHAR(100),            -- linaje: de qué hoja y celda del archivo del área se leyó
    celda_excel               VARCHAR(10),
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_valor PRIMARY KEY (id),
    CONSTRAINT fk_valor_reporte   FOREIGN KEY (reporte_id)   REFERENCES reporte.reporte (id),
    CONSTRAINT fk_valor_indicador FOREIGN KEY (indicador_id) REFERENCES formato.indicador (id),
    CONSTRAINT fk_valor_carga     FOREIGN KEY (carga_id)     REFERENCES reporte.carga (id),
    CONSTRAINT ck_valor_dia       CHECK (dia IS NULL OR dia BETWEEN 1 AND 31),
    CONSTRAINT ck_valor_origen    CHECK (origen IN ('archivo', 'manual')),
    CONSTRAINT ck_valor_carga     CHECK (origen = 'manual' OR carga_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_valor_casilla ON reporte.valor (reporte_id, indicador_id, COALESCE(dia, 0)) WHERE fecha_eliminacion IS NULL;
CREATE INDEX ix_valor_indicador ON reporte.valor (indicador_id);

-- Totales que traía escritos el Excel. No son dato: sirven para comprobar que
-- el archivo es coherente consigo mismo (regla "totales").
CREATE TABLE reporte.total_declarado (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    carga_id                  BIGINT        NOT NULL,
    cuadro_id                 BIGINT        NOT NULL,
    indicador_id              BIGINT,                  -- nulo = total del cuadro
    valor                     NUMERIC(14,2),
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_total_declarado PRIMARY KEY (id),
    CONSTRAINT fk_total_declarado_carga     FOREIGN KEY (carga_id)     REFERENCES reporte.carga (id),
    CONSTRAINT fk_total_declarado_cuadro    FOREIGN KEY (cuadro_id)    REFERENCES formato.cuadro (id),
    CONSTRAINT fk_total_declarado_indicador FOREIGN KEY (indicador_id) REFERENCES formato.indicador (id)
);
CREATE UNIQUE INDEX uq_total_declarado ON reporte.total_declarado (carga_id, cuadro_id, COALESCE(indicador_id, 0)) WHERE fecha_eliminacion IS NULL;

-- Hallazgos del bot. Los avisos exigen justificación antes de enviar; esa
-- justificación la lee Estadística.
CREATE TABLE reporte.hallazgo (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    carga_id                  BIGINT        NOT NULL,
    regla_validacion_id       BIGINT,
    nivel                     VARCHAR(10)   NOT NULL,
    clave_hallazgo            VARCHAR(200)  NOT NULL,  -- id estable del bot: atipico|f3|liquida.cena|21
    cuadro_id                 BIGINT,
    indicador_id              BIGINT,
    dia                       SMALLINT,
    titulo                    VARCHAR(300)  NOT NULL,
    detalle                   TEXT,
    justificacion             TEXT,
    fecha_justificacion       TIMESTAMPTZ,
    usuario_justificacion_id  BIGINT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_hallazgo PRIMARY KEY (id),
    CONSTRAINT fk_hallazgo_carga     FOREIGN KEY (carga_id)                 REFERENCES reporte.carga (id),
    CONSTRAINT fk_hallazgo_regla     FOREIGN KEY (regla_validacion_id)      REFERENCES formato.regla_validacion (id),
    CONSTRAINT fk_hallazgo_cuadro    FOREIGN KEY (cuadro_id)                REFERENCES formato.cuadro (id),
    CONSTRAINT fk_hallazgo_indicador FOREIGN KEY (indicador_id)             REFERENCES formato.indicador (id),
    CONSTRAINT fk_hallazgo_usuario   FOREIGN KEY (usuario_justificacion_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT ck_hallazgo_nivel     CHECK (nivel IN ('error', 'aviso', 'info')),
    CONSTRAINT ck_hallazgo_dia       CHECK (dia IS NULL OR dia BETWEEN 1 AND 31)
);
CREATE UNIQUE INDEX uq_hallazgo_clave ON reporte.hallazgo (carga_id, clave_hallazgo) WHERE fecha_eliminacion IS NULL;

-- Remisión interna: Estadística pone el reporte a disposición de una oficina
-- de la matriz. Al rectificar, la remisión anterior queda con es_vigente =
-- false como prueba de que esa oficina recibió una versión ya superada.
CREATE TABLE reporte.remision (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    reporte_id                BIGINT      NOT NULL,
    unidad_destino_id         BIGINT      NOT NULL,
    numero_rectificacion      SMALLINT    NOT NULL DEFAULT 0,
    es_sin_validar            BOOLEAN     NOT NULL DEFAULT FALSE,  -- entrega inmediata, antes de validar
    es_vigente                BOOLEAN     NOT NULL DEFAULT TRUE,
    fecha_remision            TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_remision_id       BIGINT,
    fecha_lectura             TIMESTAMPTZ,            -- primera vez que la oficina la abrió
    usuario_lectura_id        BIGINT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_remision PRIMARY KEY (id),
    CONSTRAINT fk_remision_reporte  FOREIGN KEY (reporte_id)          REFERENCES reporte.reporte (id),
    CONSTRAINT fk_remision_destino  FOREIGN KEY (unidad_destino_id)   REFERENCES organizacion.unidad_organica (id),
    CONSTRAINT fk_remision_usuario  FOREIGN KEY (usuario_remision_id) REFERENCES seguridad.usuario (id),
    CONSTRAINT fk_remision_lector   FOREIGN KEY (usuario_lectura_id)  REFERENCES seguridad.usuario (id)
);
CREATE UNIQUE INDEX uq_remision_vigente ON reporte.remision (reporte_id, unidad_destino_id, es_sin_validar) WHERE es_vigente AND fecha_eliminacion IS NULL;
CREATE INDEX ix_remision_destino ON reporte.remision (unidad_destino_id);

-- Remisión externa: el consolidado del periodo que Estadística envía a una
-- entidad externa (DIRESA). Agrupa varias áreas, por eso no cuelga de un reporte.
CREATE TABLE reporte.remision_externa (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    periodo_id                BIGINT       NOT NULL,
    unidad_destino_id         BIGINT       NOT NULL,
    descripcion               VARCHAR(200) NOT NULL,
    canal                     VARCHAR(40),             -- por confirmar (CONTEXTO.md § 9)
    archivo_id                BIGINT,
    fecha_remision            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    usuario_remision_id       BIGINT,
    fecha_creacion            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ,
    fecha_eliminacion         TIMESTAMPTZ,
    CONSTRAINT pk_remision_externa PRIMARY KEY (id),
    CONSTRAINT fk_remision_externa_periodo FOREIGN KEY (periodo_id)          REFERENCES organizacion.periodo (id),
    CONSTRAINT fk_remision_externa_destino FOREIGN KEY (unidad_destino_id)   REFERENCES organizacion.unidad_organica (id),
    CONSTRAINT fk_remision_externa_archivo FOREIGN KEY (archivo_id)          REFERENCES reporte.archivo (id),
    CONSTRAINT fk_remision_externa_usuario FOREIGN KEY (usuario_remision_id) REFERENCES seguridad.usuario (id)
);
CREATE INDEX ix_remision_externa_periodo ON reporte.remision_externa (periodo_id);

-- -----------------------------------------------------------------------------
-- AUDITORÍA
-- -----------------------------------------------------------------------------

-- Una fila por cada INSERT / UPDATE / borrado lógico / DELETE en cualquier
-- tabla. La escriben los disparadores; nadie la edita (ver 02_auditoria.sql).
-- No lleva columnas de control: ella misma es el control. usuario_id no tiene
-- FK a propósito: el registro sobrevive aunque el usuario se elimine.
CREATE TABLE auditoria.registro_cambio (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY,
    esquema                   VARCHAR(63)  NOT NULL,
    tabla                     VARCHAR(63)  NOT NULL,
    registro_id               BIGINT       NOT NULL,       -- en operaciones *_MASIVO es el id de la carga
    operacion                 VARCHAR(15)  NOT NULL,
    datos_anteriores          JSONB,
    datos_nuevos              JSONB,
    campos_modificados        TEXT[],
    usuario_id                BIGINT,                  -- de app.usuario_id; nulo si la BD no lo recibió
    usuario_bd                VARCHAR(63)  NOT NULL DEFAULT current_user,
    direccion_ip              INET,                    -- de app.direccion_ip
    id_transaccion            BIGINT       NOT NULL DEFAULT txid_current(),
    fecha                     TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT pk_registro_cambio PRIMARY KEY (id),
    CONSTRAINT ck_registro_cambio_operacion CHECK (operacion IN ('INSERTAR', 'ACTUALIZAR', 'ELIMINAR_LOGICO', 'RESTAURAR', 'ELIMINAR',
                                                                   'INSERTAR_MASIVO', 'ELIMINAR_MASIVO'))
);
CREATE INDEX ix_registro_cambio_registro ON auditoria.registro_cambio (esquema, tabla, registro_id);
CREATE INDEX ix_registro_cambio_usuario  ON auditoria.registro_cambio (usuario_id, fecha);
CREATE INDEX ix_registro_cambio_fecha    ON auditoria.registro_cambio (fecha);
