-- =============================================================================
-- Sistema de Reporte Estadístico — Hospital Regional de Loreto
-- Seeder 0003 · Catálogos del módulo de indicadores de desempeño
--
-- Llena los datos iniciales de los esquemas `fuente` y `desempeno` (fuentes,
-- 34 fichas de MINSA, dimensiones temáticas, matriz ficha-fuente, referencias
-- de la Ficha 14 y permisos del módulo).
-- =============================================================================

SELECT set_config('app.usuario_id', COALESCE((SELECT id::TEXT FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'), ''), false);

INSERT INTO fuente.fuente (codigo, nombre, descripcion, periodicidad) VALUES
    ('his_minsa',          'HIS MINSA',                         'Trama nominal de atenciones del Sistema de Información en Salud (57 columnas).',                      'mensual'),
    ('sinadef_hrl',        'SINADEF del hospital',              'Certificados de defunción registrados en el hospital (reporteMinsaCdefDiarioMensual).',              'mensual'),
    ('sinadef_verificado', 'SINADEF nacional, verificado a mano', 'Defunciones consultadas una por una en SINADEF nacional: certificados emitidos fuera del hospital.', 'eventual');

INSERT INTO desempeno.ficha (numero, clave, nombre) VALUES
    ( 1, 'recuperacion_anemia_infantil', 'Porcentaje de niñas y niños de 12 a 18 meses, con diagnóstico de anemia entre los 6 y 11 meses, que se han recuperado.'),
    ( 2, 'suplementacion_hierro_preventiva', 'Porcentaje de niñas y niños de 6 a 11 meses que iniciaron suplementación preventiva con hierro, culminan el esquema completo de 6 meses y se mantienen sin anemia'),
    ( 3, 'tamizaje_neonatal_metabolico', 'Porcentaje de recién nacidos con tamizaje neonatal metabólico'),
    ( 4, 'recuperacion_crecimiento_inadecuado', 'Porcentaje de niñas y niños menores de 2 años en condición de crecimiento inadecuado que luego de un periodo de seguimiento mejora sus condiciones nutricionales.'),
    ( 5, 'vacunacion_completa_24m', 'Porcentaje de niñas/niños de 24 meses de edad, que reciben vacunas para su edad'),
    ( 6, 'vacunacion_rn_bcg_hvb_24h', 'Porcentaje de recién nacidos de parto institucional, vacunados con BCG y Anti hepatitis B dentro de las 24 horas después del nacimiento.'),
    ( 7, 'exito_tratamiento_tb_sensible', 'Tasa de éxito de tratamiento para TB Sensible'),
    ( 8, 'culminacion_tpt_contactos_tb', 'Porcentaje de contactos de TB que culminan Terapia Preventiva para TB (TPTB).'),
    ( 9, 'tpt_vih_adultos_tar', 'Cobertura de la Terapia Preventiva para Tuberculosis en personas adultas viviendo con VIH que reciben tratamiento antirretroviral'),
    (10, 'salud_bucal_preventiva_infantil', 'Porcentaje de niñas y niños (6 meses a 6 años, 11 meses y 29 días) que reciben procedimientos estomatológicos preventivos.'),
    (11, 'acceso_anticonceptivos_modernos', 'Porcentaje de personas que acceden a algún método anticonceptivo moderno de planificación familiar.'),
    (12, 'control_prenatal_referidas_riesgo', 'Porcentaje de gestante atendidas con 2 o más Atenciones Prenatales (APN) en el hospital, referidas por factores de riesgo'),
    (13, 'paquete_preventivo_gestante', 'Porcentaje de gestantes con paquete preventivo básico, priorizado'),
    (14, 'oportunidad_tratamiento_oncologico', 'Porcentaje de personas con diagnóstico de cánceres prevalentes (Cuello Uterino, Mama, Próstata, Colon y Recto, estómago, Cáncer de Piel, Cáncer de Pulmón, Cáncer de hígado, Linfoma y Leucemia) que inician tratamiento oncológico (quimioterapia o radioterapia o braquiterapia o quirúrgico) en menor o igual a 37 días.'),
    (15, 'tamizaje_mamografia_bilateral', 'Porcentaje de mujeres de 40 a 69 años con mamografía bilateral de tamizaje'),
    (16, 'vacunacion_vph_9anos', 'Porcentaje niñas y niños de 9 años de edad vacunados contra el virus de papiloma humano (VPH).'),
    (17, 'rehabilitacion_infantil_riesgo', 'Porcentaje de niños y niñas menores de 5 años con deficiencias o factores de riesgo de discapacidad, con seis o más atenciones en la UPSS Medicina de Rehabilitación'),
    (18, 'rendimiento_cama_uhsma', 'Egresos de personas por problemas de salud mental en Hospitales con Unidades de Hospitalización de Salud Mental y Adicciones (UHSMA).'),
    (19, 'paquete_integral_depresion', 'Porcentaje de personas con diagnóstico de depresión que reciben el paquete estándar de intervenciones'),
    (20, 'resolutividad_emergencia', 'Porcentaje de Resolutividad'),
    (21, 'rendimiento_quirofano', 'Rendimiento de Sala de Operaciones'),
    (22, 'tasa_cirugias_suspendidas', 'Porcentaje de Cirugías Suspendidas'),
    (23, 'porcentaje_ocupacion_cama', 'Porcentaje de Ocupación Cama'),
    (24, 'intervalo_sustitucion_cama', 'Intervalo de Sustitución Cama'),
    (25, 'tiempo_espera_referencia_ce', 'Promedio de Espera para la Atención en Consulta Externa de un paciente referido'),
    (26, 'utilizacion_consultorios_medicina', 'Utilización de consultorios externos de medicina'),
    (27, 'incidencia_iaas', 'Densidad de Incidencia /Incidencia Acumulada de las Infecciones Asociadas a la Atención en Salud (IAAS) seleccionadas.'),
    (28, 'disponibilidad_medicamentos_esenciales', 'Porcentaje de Disponibilidad de Medicamentos Esenciales (%DME)'),
    (29, 'consistencia_inforhus', 'Porcentaje de personal registrado en el aplicativo del Registro Nacional de Personal de la Salud sin inconsistencias de información'),
    (30, 'concordancia_airhsp_inforhus_plh', 'Porcentaje de concordancia entre los aplicativos informáticos del Registro Centralizado de Planillas y Datos del Recurso Humano del Sector Público (AIRHSP), Registro Nacional de Personal de la Salud (INFORHUS) y de la Planilla de Haberes (PLH).'),
    (31, 'concordancia_asistencia_medica_sistemas', 'Porcentaje de concordancia del número del personal médico consignado en el Registro Nacional de Personal de la Salud (INFORHUS), la Plataforma Nacional de Turnos Asistenciales (TUA SUSALUD), el aplicativo del SIS, el HIS MINSA y el Sistema de Información de Historias Clínicas Electrónicas – SIHCE del MINSA'),
    (32, 'tasa_uso_telemedicina', 'Tasa de uso de los servicios de telemedicina'),
    (33, 'firma_digital_sihce_minsa', 'Porcentaje de uso de la firma digital de las atenciones registradas en el componente de consulta externa de medicina y Atención Prenatal del SIHCE del MINSA.'),
    (34, 'firma_digital_sihce_inen', 'Porcentaje de uso de la firma digital de las atenciones registradas en el componente de consulta externa del SIHCE del Instituto Nacional de Enfermedades Neoplásicas (INEN)');

INSERT INTO desempeno.dimension (codigo, nombre, orden) VALUES
    ('es', 'Estrategias sanitarias',               1),
    ('mi', 'Materno-infantil y prevención',          2),
    ('gh', 'Gestión hospitalaria',                   3),
    ('cs', 'Calidad y seguridad',                    4),
    ('si', 'Sistemas de información y RR. HH.',      5);

UPDATE desempeno.ficha f
   SET nombre_corto = x.corto,
       dimension_id = (SELECT d.id FROM desempeno.dimension d WHERE d.codigo = x.dimension)
  FROM (VALUES
        ( 1, 'Recuperación de anemia infantil', 'mi'),
        ( 2, 'Suplementación preventiva con hierro', 'mi'),
        ( 3, 'Tamizaje neonatal metabólico', 'mi'),
        ( 4, 'Recuperación del crecimiento inadecuado', 'mi'),
        ( 5, 'Vacunación completa a los 24 meses', 'mi'),
        ( 6, 'Vacunas BCG y HvB del recién nacido en 24 h', 'mi'),
        ( 7, 'Éxito del tratamiento de TB sensible', 'es'),
        ( 8, 'Culminación de TPT en contactos de TB', 'es'),
        ( 9, 'TPT en adultos con VIH en TAR', 'es'),
        (10, 'Salud bucal preventiva infantil', 'mi'),
        (11, 'Acceso a anticonceptivos modernos', 'mi'),
        (12, 'Control prenatal de gestantes referidas', 'mi'),
        (13, 'Paquete preventivo de la gestante', 'mi'),
        (14, 'Oportunidad del tratamiento oncológico', 'es'),
        (15, 'Tamizaje con mamografía bilateral', 'mi'),
        (16, 'Vacunación VPH a los 9 años', 'mi'),
        (17, 'Rehabilitación infantil en riesgo', 'mi'),
        (18, 'Egresos en salud mental (UHSMA)', 'gh'),
        (19, 'Paquete integral de depresión', 'es'),
        (20, 'Resolutividad en emergencia', 'gh'),
        (21, 'Rendimiento de sala de operaciones', 'gh'),
        (22, 'Cirugías suspendidas', 'gh'),
        (23, 'Ocupación de camas', 'gh'),
        (24, 'Intervalo de sustitución de cama', 'gh'),
        (25, 'Espera de referidos en consulta externa', 'gh'),
        (26, 'Utilización de consultorios de medicina', 'gh'),
        (27, 'Incidencia de IAAS', 'cs'),
        (28, 'Disponibilidad de medicamentos esenciales', 'cs'),
        (29, 'Consistencia de INFORHUS', 'si'),
        (30, 'Concordancia AIRHSP, INFORHUS y planilla', 'si'),
        (31, 'Concordancia de personal médico entre sistemas', 'si'),
        (32, 'Uso de telemedicina', 'gh'),
        (33, 'Firma digital en el SIHCE (MINSA)', 'si'),
        (34, 'Firma digital en el SIHCE (INEN)', 'si')
       ) AS x (numero, corto, dimension)
 WHERE f.numero = x.numero;

UPDATE desempeno.ficha
   SET aplica_al_hospital = FALSE,
       motivo_no_aplica   = 'Indicador del Instituto Nacional de Enfermedades Neoplásicas (INEN): no se evalúa en el hospital.'
 WHERE numero = 34;

UPDATE fuente.fuente f
   SET area_responsable = x.area, formato = x.formato
  FROM (VALUES
        ('his_minsa',          'Oficina de Estadística', 'Trama nominal de atenciones (.csv)'),
        ('sinadef_hrl',        'Oficina de Estadística', 'Certificados de defunción del hospital (.xls)'),
        ('sinadef_verificado', 'Oficina de Estadística', 'Defunciones verificadas en SINADEF nacional (.csv)')
       ) AS x (codigo, area, formato)
 WHERE f.codigo = x.codigo;

INSERT INTO fuente.fuente (codigo, nombre, descripcion, periodicidad, area_responsable, formato) VALUES
    ('egresos_hospitalarios', 'Egresos hospitalarios',              NULL, 'mensual',  'Oficina de Estadística',       'Consolidado mensual de egresos (.xlsx)'),
    ('censo_camas',           'Censo diario de camas',              NULL, 'mensual',  'Estadística / Planeamiento',   'RENOXI / censo de camas'),
    ('padron_nominal',        'Padrón Nominal',                     NULL, 'mensual',  'CRED / Pediatría',             NULL),
    ('cnv',                   'Certificado de Nacido Vivo (CNV)',   NULL, 'mensual',  'Neonatología / Estadística',   NULL),
    ('referencias',           'Referencias y contrarreferencias',   NULL, 'mensual',  'Oficina de Referencias',       NULL),
    ('poblacion_reniec',      'Población de referencia RENIEC',     NULL, 'eventual', 'Estadística / Planeamiento',   NULL),
    ('sigtb',                 'SIGTB',                              NULL, 'mensual',  'Estrategia Sanitaria de TB',   NULL),
    ('sihce_vih',             'SIHCE-VIH / NVIH',                   NULL, 'mensual',  'Estrategia ITS / VIH',         NULL),
    ('trama_emergencias',     'Trama de emergencias',               NULL, 'mensual',  'Emergencias',                  NULL),
    ('seti',                  'SETI (sala de operaciones)',         NULL, 'mensual',  'Centro Quirúrgico',            NULL),
    ('recursos_salud',        'Tabla de recursos de salud',         NULL, 'eventual', 'Estadística / Planeamiento',   NULL),
    ('vigilancia_iaas',       'Vigilancia de IAAS',                 NULL, 'mensual',  'Epidemiología',                NULL),
    ('sismed',                'SISMED',                             NULL, 'mensual',  'Farmacia / Logística',         NULL),
    ('rrhh_inforhus',         'INFORHUS / AIRHSP / Planilla',       NULL, 'mensual',  'Recursos Humanos',             NULL),
    ('firma_digital_sihce',   'Firma digital del SIHCE',            NULL, 'mensual',  'TI / Estadística',             NULL);

INSERT INTO desempeno.ficha_fuente (ficha_id, fuente_id)
SELECT fi.id, fu.id
  FROM (VALUES
        ('his_minsa', ARRAY[1,2,3,4,5,6,10,11,12,13,14,15,16,17,19,32]),
        ('sinadef_hrl', ARRAY[14,19]),
        ('sinadef_verificado', ARRAY[14]),
        ('egresos_hospitalarios', ARRAY[18,24]),
        ('censo_camas', ARRAY[23,24]),
        ('padron_nominal', ARRAY[1,2,3,5,6]),
        ('cnv', ARRAY[3,6,13,17]),
        ('referencias', ARRAY[12,20,25]),
        ('poblacion_reniec', ARRAY[16]),
        ('sigtb', ARRAY[7,8]),
        ('sihce_vih', ARRAY[9]),
        ('trama_emergencias', ARRAY[20]),
        ('seti', ARRAY[21,22]),
        ('recursos_salud', ARRAY[26]),
        ('vigilancia_iaas', ARRAY[27]),
        ('sismed', ARRAY[28]),
        ('rrhh_inforhus', ARRAY[29,30,31]),
        ('firma_digital_sihce', ARRAY[33])
       ) AS x (fuente, fichas)
  CROSS JOIN LATERAL unnest(x.fichas) AS n (numero)
  JOIN desempeno.ficha fi ON fi.numero = n.numero
  JOIN fuente.fuente fu   ON fu.codigo = x.fuente;

INSERT INTO desempeno.referencia_minsa (ficha_id, anio, mes, numerador, denominador, fecha_corte, documento, observacion)
SELECT (SELECT id FROM desempeno.ficha WHERE numero = 14), 2026, x.mes, x.num, x.den, x.corte::DATE, x.documento, x.observacion
  FROM (VALUES
        (1, 1,  9, '2026-08-08', 'reporte_oficial_minsa_2026_julio_hoja_15_ficha_14_dl_1153_2026_cg14.csv', NULL),
        (2, 3, 22, '2026-08-08', 'reporte_oficial_minsa_2026_julio_hoja_15_ficha_14_dl_1153_2026_cg14.csv', NULL),
        (3, 1, 10, '2026-08-08', 'reporte_oficial_minsa_2026_julio_hoja_15_ficha_14_dl_1153_2026_cg14.csv', NULL),
        (4, 0,  6, '2026-08-08', 'reporte_oficial_minsa_2026_julio_hoja_15_ficha_14_dl_1153_2026_cg14.csv', NULL),
        (5, 1, 11, '2026-08-08', 'reporte_oficial_minsa_2026_julio_hoja_15_ficha_14_dl_1153_2026_cg14.csv', NULL),
        (6, 0,  6, '2026-08-08', 'reporte_oficial_minsa_2026_julio_hoja_15_ficha_14_dl_1153_2026_cg14.csv', NULL),
        (7, 0, 11, '2026-08-08', 'reporte_oficial_minsa_2026_julio_hoja_15_ficha_14_dl_1153_2026_cg14.csv', NULL),
        (8, 0,  7, NULL, NULL, 'Resultado de MINSA publicado el 01/10/2026, informado por Estadística. Falta el reporte oficial y su fecha de corte.')
       ) AS x (mes, num, den, corte, documento, observacion);

INSERT INTO seguridad.permiso (codigo, modulo, descripcion)
SELECT x.codigo, 'desempeno', x.descripcion
  FROM (VALUES
        ('desempeno.ver',    'Ver el tablero de indicadores de desempeño, sus fichas y los casos por gestionar'),
        ('desempeno.cargar', 'Subir datos de HIS y SINADEF, registrar el resultado de MINSA, editar las fuentes de cada ficha y el seguimiento de casos')
       ) AS x (codigo, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.permiso p WHERE p.codigo = x.codigo AND p.fecha_eliminacion IS NULL);

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM (VALUES ('revisor', 'desempeno.ver'), ('superadmin', 'desempeno.ver'), ('superadmin', 'desempeno.cargar')) AS x (rol, permiso)
  JOIN seguridad.rol r     ON r.codigo = x.rol AND r.fecha_eliminacion IS NULL
  JOIN seguridad.permiso p ON p.codigo = x.permiso AND p.fecha_eliminacion IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id AND rp.fecha_eliminacion IS NULL);

INSERT INTO desempeno.script_aplicado (script)
SELECT x.script
  FROM (VALUES ('01_esquema.sql'), ('02_tablero.sql')) AS x (script)
 WHERE NOT EXISTS (SELECT 1 FROM desempeno.script_aplicado s WHERE s.script = x.script AND s.fecha_eliminacion IS NULL);

SELECT set_config('app.usuario_id', '', false);
