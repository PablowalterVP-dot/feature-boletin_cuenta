-- =============================================================================
-- Avance 04 · Datos semilla (catálogos del núcleo)
--
-- Fuentes:
--   · Unidades y matriz de destinos: codigo_prototipo/frontend/src/app/datos/areas.js
--     y oficinas.js. Los NOMBRES son provisionales (CONTEXTO.md § 9).
--   · Estados y transiciones: codigo_prototipo/frontend/src/app/dominio/estados.js
--   · Formato de Nutrición: solo la cabecera (formato NUT, granularidad diaria,
--     confirmada por el usuario) y la versión NUT-1 en configuración. Los
--     cuadros e indicadores NO se siembran: el oficio N.º 122-2026 del que
--     salían es un ejemplo, no un documento real (avance 04). Están en
--     07_ejemplo_nutricion.sql, que no forma parte de la instalación.
--   · Dimensiones: solo las de valores confirmados (comida: desayuno, almuerzo
--     y cena; población y servicio de la ficha final de Estadística).
--   · Reglas del bot: codigo_prototipo/bot-validador (reglas.js, motor.js).
--   · Roles: propuesta del avance 01 (informe § 6).
-- =============================================================================

-- Usuario inicial. Todo lo que sigue queda registrado a su nombre.
-- La contraseña real se asigna desde el backend (hash bcrypt/argon2).
INSERT INTO seguridad.usuario (nombre_usuario, correo, contrasena_hash, nombres, apellidos, cargo, debe_cambiar_contrasena)
VALUES ('superadmin', NULL, 'POR_ASIGNAR', 'Administrador', 'del sistema', 'Superadministrador', TRUE);

SELECT set_config('app.usuario_id', (SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'), false);

-- -----------------------------------------------------------------------------
-- Parámetros
-- -----------------------------------------------------------------------------
INSERT INTO organizacion.parametro (clave, valor, tipo_dato, descripcion) VALUES
    ('establecimiento.nombre',    'HOSPITAL REGIONAL DE LORETO', 'texto',  'Nombre del establecimiento'),
    ('periodo.dia_limite_entrega', '10', 'entero', 'Día del mes siguiente en que vence la entrega de las áreas (prototipo: DIA_PLAZO)'),
    ('periodo.dia_limite_diresa',  '15', 'entero', 'Día del mes siguiente para remitir a DIRESA (supuesto del prototipo, por confirmar)'),
    ('archivo.almacenamiento',     'disco_servidor', 'texto', 'Dónde se guardan los archivos subidos (decisión del avance 04: disco del servidor)'),
    ('archivo.ruta_base',          '/datos/archivos', 'texto', 'Carpeta raíz en el disco del servidor (a definir en el despliegue)'),
    ('archivo.tamano_maximo_mb',   '5', 'entero', 'Límite de tamaño de un Excel subido (bot validador)');

-- -----------------------------------------------------------------------------
-- Unidades orgánicas
-- -----------------------------------------------------------------------------
INSERT INTO organizacion.unidad_organica (codigo, clave, nombre, nombre_corto, tipo, es_reportante, es_receptora, es_estadistica, es_externa) VALUES
    ('FAR',    'farmacia',          'Departamento de Farmacia',                                  'Farmacia',                  'departamento', TRUE,  FALSE, FALSE, FALSE),
    ('NEF',    'nefrologia',        'Servicio de Nefrología y Hemodiálisis',                     'Nefrología y Hemodiálisis', 'servicio',     TRUE,  FALSE, FALSE, FALSE),
    ('EPI',    'epidemiologia',     'Oficina de Epidemiología',                                  'Epidemiología',             'oficina',      TRUE,  TRUE,  FALSE, FALSE),
    ('LAB',    'laboratorio',       'Departamento de Laboratorio Clínico y Anatomía Patológica', 'Laboratorio',               'departamento', TRUE,  FALSE, FALSE, FALSE),
    ('GIN',    'ginecologia',       'Departamento de Gineco-Obstetricia',                        'Gineco-Obstetricia',        'departamento', TRUE,  FALSE, FALSE, FALSE),
    ('CQX',    'centro-quirurgico', 'Centro Quirúrgico',                                         'Centro Quirúrgico',         'servicio',     TRUE,  FALSE, FALSE, FALSE),
    ('LAV',    'lavanderia',        'Área de Costura y Lavandería',                              'Costura y Lavandería',      'area',         TRUE,  FALSE, FALSE, FALSE),
    ('NUT',    'nutricion',         'Departamento de Nutrición y Dietética',                     'Nutrición y Dietética',     'departamento', TRUE,  FALSE, FALSE, FALSE),
    ('DXI',    'imagenes',          'Departamento de Diagnóstico por Imágenes',                  'Diagnóstico por Imágenes',  'departamento', TRUE,  FALSE, FALSE, FALSE),
    ('MTO',    'mantenimiento',     'Departamento de Mantenimiento',                             'Mantenimiento',             'departamento', TRUE,  FALSE, FALSE, FALSE),
    ('EST',    'estadistica',       'Oficina de Estadística',                                    'Estadística',               'oficina',      FALSE, TRUE,  TRUE,  FALSE),
    ('PLA',    'planeamiento',      'Oficina de Planeamiento Estratégico',                       'Planeamiento',              'oficina',      FALSE, TRUE,  FALSE, FALSE),
    ('CTE',    'cuerpo-tecnico',    'Cuerpo Técnico',                                            'Cuerpo Técnico',            'oficina',      FALSE, TRUE,  FALSE, FALSE),
    ('DG',     'direccion-general', 'Dirección General',                                         'Dirección General',         'oficina',      FALSE, TRUE,  FALSE, FALSE),
    ('DIRESA', 'diresa',            'Dirección Regional de Salud de Loreto',                     'DIRESA',                    'externa',      FALSE, TRUE,  FALSE, TRUE);

-- Matriz de destinos (además de Estadística). Vigencia desde el inicio de 2026.
INSERT INTO organizacion.destino (unidad_origen_id, unidad_destino_id, es_entrega_inmediata, fecha_inicio_vigencia, observacion)
SELECT o.id, d.id, m.inmediata, DATE '2026-01-01', m.observacion
  FROM (VALUES
        ('FAR', 'PLA', FALSE, NULL),
        ('NEF', 'PLA', FALSE, NULL),
        ('NEF', 'EPI', FALSE, NULL),
        ('NEF', 'DG',  FALSE, NULL),
        ('LAB', 'PLA', FALSE, NULL),
        ('CQX', 'PLA', FALSE, NULL),
        ('CQX', 'EPI', FALSE, NULL),
        ('NUT', 'PLA', TRUE,  'Por confirmar: se tomó de un oficio de ejemplo (N.º 122-2026). Entrega al enviar, marcada sin validar (decisión del prototipo del 24/09/2026).'),
        ('DXI', 'PLA', FALSE, NULL),
        ('DXI', 'CTE', FALSE, NULL),
        ('MTO', 'PLA', FALSE, NULL)
       ) AS m (origen, destino, inmediata, observacion)
  JOIN organizacion.unidad_organica o ON o.codigo = m.origen
  JOIN organizacion.unidad_organica d ON d.codigo = m.destino;

-- Periodos de 2026. Plazos: día 10 (áreas) y día 15 (DIRESA) del mes siguiente.
INSERT INTO organizacion.periodo (anio, mes, fecha_inicio, fecha_fin, fecha_limite_entrega, fecha_limite_remision)
SELECT 2026, m,
       make_date(2026, m, 1),
       (make_date(2026, m, 1) + INTERVAL '1 month - 1 day')::DATE,
       (make_date(2026, m, 1) + INTERVAL '1 month')::DATE + 9,
       (make_date(2026, m, 1) + INTERVAL '1 month')::DATE + 14
  FROM generate_series(1, 12) AS m;

-- -----------------------------------------------------------------------------
-- Roles y permisos
-- -----------------------------------------------------------------------------
INSERT INTO seguridad.permiso (codigo, modulo, descripcion) VALUES
    ('usuario.gestionar',      'seguridad',    'Crear, editar y desactivar usuarios y asignarles roles (en su ámbito)'),
    ('organizacion.gestionar', 'organizacion', 'Unidades orgánicas, matriz de destinos, periodos y parámetros'),
    ('formato.gestionar',      'formato',      'Formatos, indicadores, dimensiones, reglas y metas del catálogo'),
    ('formato.configurar_lectura', 'formato',  'Versiones de estructura y configuración de lectura del Excel de cada área (criterios, hojas, ubicaciones); activar y retirar versiones'),
    ('meta.gestionar',         'formato',      'Registrar y modificar metas'),
    ('reporte.ver',            'reporte',      'Ver reportes y consolidados'),
    ('reporte.descargar',      'reporte',      'Descargar datos, archivos subidos y consolidados'),
    ('reporte.cargar',         'reporte',      'Crear el reporte, subir el Excel, corregir casillas y justificar avisos'),
    ('reporte.enviar',         'reporte',      'Enviar el reporte a Estadística'),
    ('reporte.revisar',        'reporte',      'Tomar un reporte para revisión'),
    ('reporte.validar',        'reporte',      'Validar un reporte'),
    ('reporte.remitir',        'reporte',      'Remitir un reporte a las oficinas de la matriz'),
    ('reporte.rectificar',     'reporte',      'Reabrir un reporte ya remitido para rectificación'),
    ('remision.externa',       'reporte',      'Registrar la remisión del consolidado a DIRESA'),
    ('auditoria.ver',          'auditoria',    'Consultar la bitácora de cambios');

INSERT INTO seguridad.rol (codigo, nombre, descripcion, alcance, es_sistema) VALUES
    ('superadmin', 'Superadministrador', 'Acceso a todos los módulos del sistema.', 'global', TRUE),
    ('admin',      'Administrador de unidad', 'Controla una unidad: gestiona sus usuarios y metas, y hace todo lo del digitador.', 'unidad', TRUE),
    ('digitador',  'Digitador', 'Pertenece a una unidad: sube el Excel, corrige, justifica y envía el reporte.', 'unidad', TRUE),
    ('revisor',    'Revisor de Estadística', 'Personal de Estadística: revisa, valida, remite y rectifica los reportes de todas las áreas, y configura la lectura del Excel de cada área.', 'global', TRUE),
    ('consulta',   'Consulta', 'Solo lectura: ve y descarga datos y consolidados. Atado a una unidad (ve lo suyo y lo que le remiten) o global.', 'ambos', TRUE);

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM (VALUES
        -- superadmin: todos (se completa abajo)
        ('admin',     'usuario.gestionar'), ('admin', 'meta.gestionar'), ('admin', 'reporte.ver'), ('admin', 'reporte.descargar'),
        ('admin',     'reporte.cargar'),    ('admin', 'reporte.enviar'), ('admin', 'auditoria.ver'),
        ('digitador', 'reporte.ver'), ('digitador', 'reporte.descargar'), ('digitador', 'reporte.cargar'), ('digitador', 'reporte.enviar'),
        ('revisor',   'reporte.ver'), ('revisor', 'reporte.descargar'), ('revisor', 'reporte.revisar'), ('revisor', 'reporte.validar'),
        ('revisor',   'reporte.remitir'), ('revisor', 'reporte.rectificar'), ('revisor', 'remision.externa'), ('revisor', 'auditoria.ver'),
        ('revisor',   'formato.configurar_lectura'),   -- avance 04: Estadística también configura las lecturas
        ('consulta',  'reporte.ver'), ('consulta', 'reporte.descargar')
       ) AS x (rol, permiso)
  JOIN seguridad.rol r     ON r.codigo = x.rol
  JOIN seguridad.permiso p ON p.codigo = x.permiso;

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM seguridad.rol r CROSS JOIN seguridad.permiso p WHERE r.codigo = 'superadmin';

INSERT INTO seguridad.usuario_rol (usuario_id, rol_id, unidad_organica_id)
SELECT u.id, r.id, NULL FROM seguridad.usuario u, seguridad.rol r
 WHERE u.nombre_usuario = 'superadmin' AND r.codigo = 'superadmin';

-- -----------------------------------------------------------------------------
-- Estados del reporte y transiciones
-- -----------------------------------------------------------------------------
INSERT INTO reporte.estado_reporte (codigo, nombre, descripcion, orden, es_final) VALUES
    ('borrador',    'En llenado',  'El área lo está llenando.',                                   1, FALSE),
    ('enviado',     'Enviado',     'Recibido por Estadística. Aún sin revisar.',                  2, FALSE),
    ('en_revision', 'En revisión', 'Estadística está verificando las cifras antes de validarlo.', 3, FALSE),
    ('validado',    'Validado',    'Verificado por Estadística. Listo para remitir.',             4, FALSE),
    ('remitido',    'Remitido',    'Remitido a las oficinas que lo necesitan. Periodo cerrado.',  5, TRUE);

INSERT INTO reporte.transicion_estado (accion, estado_origen_id, estado_destino_id, permiso_id)
SELECT x.accion, o.id, d.id, p.id
  FROM (VALUES
        ('enviar',     'borrador',    'enviado',     'reporte.enviar'),
        ('revisar',    'enviado',     'en_revision', 'reporte.revisar'),
        ('validar',    'enviado',     'validado',    'reporte.validar'),
        ('validar',    'en_revision', 'validado',    'reporte.validar'),
        ('remitir',    'validado',    'remitido',    'reporte.remitir'),
        ('rectificar', 'remitido',    'borrador',    'reporte.rectificar')
       ) AS x (accion, origen, destino, permiso)
  JOIN reporte.estado_reporte o ON o.codigo = x.origen
  JOIN reporte.estado_reporte d ON d.codigo = x.destino
  JOIN seguridad.permiso p      ON p.codigo = x.permiso;
-- "crear" (no_iniciado → borrador) no es transición guardada: es el INSERT del
-- reporte, y exige el permiso reporte.cargar.

-- -----------------------------------------------------------------------------
-- Dimensiones (reutilizables por otras áreas)
-- Solo valores confirmados. Los valores de financiador se agregan como filas
-- de dimension_valor cuando se conozcan (sin cambiar el esquema).
-- -----------------------------------------------------------------------------
INSERT INTO formato.dimension (codigo, nombre, descripcion) VALUES
    ('poblacion',   'Población atendida', 'A quién se sirve o se atiende'),
    ('servicio',    'Servicio',           'Servicio del hospital donde se registra la atención'),
    ('comida',      'Comida',             'Tiempo de comida'),
    ('financiador', 'Financiador',        'Fuente de financiamiento de la atención. Sus valores se agregan en dimension_valor cuando se confirmen');

INSERT INTO formato.dimension_valor (dimension_id, codigo, nombre, orden)
SELECT d.id, v.codigo, v.nombre, v.orden
  FROM (VALUES
        ('poblacion', 'comensal',        'Comensales',      1),
        ('poblacion', 'paciente',        'Pacientes',       2),
        ('servicio',  'hospitalizacion', 'Hospitalización', 1),
        ('servicio',  'emergencia',      'Emergencia',      2),
        ('comida',    'desayuno',        'Desayuno',        1),
        ('comida',    'almuerzo',        'Almuerzo',        2),
        ('comida',    'cena',            'Cena',            3)
       ) AS v (dimension, codigo, nombre, orden)
  JOIN formato.dimension d ON d.codigo = v.dimension;

-- -----------------------------------------------------------------------------
-- Formato de Nutrición y Dietética (estructura NUT-1, en configuración)
-- -----------------------------------------------------------------------------
INSERT INTO formato.formato (unidad_organica_id, codigo, nombre, descripcion, periodicidad, granularidad)
SELECT id, 'NUT', 'Reporte mensual de Nutrición y Dietética',
       'Raciones diarias servidas a comensales y pacientes, en hospitalización y emergencia.',
       'mensual', 'diaria'
  FROM organizacion.unidad_organica WHERE codigo = 'NUT';

-- La configuración de lectura (tipo de archivo, criterios de reconocimiento,
-- hojas, ubicación de días y de cada fila) se completa cuando se tenga un
-- Excel real del área. Hasta entonces la versión no se puede activar.
INSERT INTO formato.formato_version (formato_id, codigo_version, estado, fecha_inicio_vigencia, notas)
SELECT id, 'NUT-1', 'en_configuracion', DATE '2026-01-01',
       'Estructura del Excel propio de Nutrición. Pendiente: configurar la lectura con un archivo real del área.'
  FROM formato.formato WHERE codigo = 'NUT';

-- Reglas del bot (reglas.js y motor.js).
INSERT INTO formato.regla_validacion (formato_id, codigo, nivel, descripcion, parametros)
SELECT fo.id, r.codigo, r.nivel, r.descripcion, r.parametros::JSONB
  FROM (VALUES
        ('incompleto',    'error', 'Todas las casillas de todos los días tienen un dato (un día sin servicio se anota 0).', '{}'),
        ('no-numerico',   'error', 'Toda casilla del archivo es un número.', '{}'),
        ('entero',        'error', 'Las raciones son números enteros, sin signo.', '{}'),
        ('totales',       'error', 'Los totales escritos en el Excel coinciden con la suma de sus días (solo si el Excel del área trae totales y están configurados).', '{}'),
        ('atipico',       'aviso', 'Ningún día se dispara frente al resto de su fila (triplica la mediana y la supera en 15 o más).', '{"factor_mediana": 3, "diferencia_minima": 15}'),
        ('variacion',     'aviso', 'El total de un cuadro no varía más del 20 % frente al mes anterior.', '{"variacion_maxima": 0.2}'),
        ('filas-iguales', 'info',  'Dos comidas del mismo grupo no repiten las mismas cifras día por día.', '{"minimo_valores_distintos": 3}')
       ) AS r (codigo, nivel, descripcion, parametros)
  JOIN formato.formato fo ON fo.codigo = 'NUT';

-- La semilla no deja usuario fijado para lo que venga después.
SELECT set_config('app.usuario_id', '', false);
