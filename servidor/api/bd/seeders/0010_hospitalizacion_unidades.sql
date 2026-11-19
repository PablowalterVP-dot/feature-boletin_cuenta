-- =============================================================================
-- Hospitalización: unidades con clave propia y roles con el nombre del puesto (15/11/2026)
-- =============================================================================
--
-- Las unidades de hospitalización pasan a una clave con prefijo propio, para que
-- nunca se crucen con las de Estadística:
--
--   hosp-dep-<id>    un departamento        hosp-area-<id>   un área (un censo)
--
-- El seeder 0009 usaba el id de hospitalización tal cual (`medicina-a`). Con eso,
-- Ginecología no podía entrar: `ginecologia` ya es la clave de Gineco-Obstetricia,
-- que reporta a Estadística; y Cirugía, Oncología o Infectología tienen un
-- departamento y un área con el mismo id. Desde ahora el superadministrador habilita
-- cada departamento y área en «Unidades de hospitalización»
-- (`app/servicios/unidades_hospitalizacion.py`), y la API de hospitalización quita
-- el prefijo al leer el token. Las asignaciones ya hechas siguen valiendo: apuntan
-- al id de la unidad, no a su clave.
--
-- Los roles «Control diario de camas» y «Validación de hospitalización» llevan ahora
-- el nombre del puesto que los usa: quien lleva RENOXI y Estadística. Su código
-- no cambia.
--
-- Se puede correr más de una vez.
-- =============================================================================

UPDATE organizacion.unidad_organica u
   SET clave = x.nueva
  FROM (VALUES
        ('MED', 'medicina',             'hosp-dep-medicina'),
        ('MEA', 'medicina-a',           'hosp-area-medicina-a'),
        ('MEB', 'medicina-b',           'hosp-area-medicina-b'),
        ('MEI', 'medicina-intermedios', 'hosp-area-medicina-intermedios'),
        ('UCI', 'cuidados-criticos',    'hosp-area-cuidados-criticos'),
        ('QUE', 'quemados',             'hosp-area-quemados')
       ) AS x (codigo, vieja, nueva)
 WHERE u.codigo = x.codigo AND u.clave = x.vieja AND u.fecha_eliminacion IS NULL
   AND NOT u.es_reportante AND NOT u.es_receptora AND NOT u.es_estadistica AND NOT u.es_externa
   AND NOT EXISTS (
        SELECT 1 FROM organizacion.unidad_organica o
         WHERE o.clave = x.nueva AND o.fecha_eliminacion IS NULL
       );

UPDATE seguridad.rol
   SET nombre = 'Responsable de RENOXI',
       descripcion = 'Control diario de camas: el plano, la carga de RENOXI y el tablero de ocupación.'
 WHERE codigo = 'control_camas' AND fecha_eliminacion IS NULL AND nombre = 'Control diario de camas';

UPDATE seguridad.rol
   SET nombre = 'Estadística de hospitalización',
       descripcion = 'Para la cuenta de Estadística: valida las altas, recibe los censos, ve los indicadores DIRESA y cierra el mes.'
 WHERE codigo = 'validador_hospitalizacion' AND fecha_eliminacion IS NULL AND nombre = 'Validación de hospitalización';

UPDATE seguridad.rol
   SET descripcion = 'Enfermería de un área (Medicina A, UCI…): designa camas y controla a sus pacientes hasta el alta. Se asigna en un área.'
 WHERE codigo = 'enfermeria' AND fecha_eliminacion IS NULL
   AND descripcion = 'Enfermería de un área: designa camas y controla a sus pacientes hasta el alta.';

UPDATE seguridad.rol
   SET descripcion = 'Jefatura de un departamento: mira sus áreas (camas, censos y ocupación) sin operar. Se asigna en un departamento.'
 WHERE codigo = 'jefe_departamento' AND fecha_eliminacion IS NULL
   AND descripcion = 'Mira las áreas de su departamento: camas, censos y ocupación. No opera.';
