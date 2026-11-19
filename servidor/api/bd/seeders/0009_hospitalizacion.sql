-- =============================================================================
-- Hospitalización: cuentas de los pisos en esta base (14/11/2026)
-- =============================================================================
--
-- Egresos Hospitalarios (`servidor/hospitalizacion/`, decisión 0011 de su carpeta
-- docs/hospitalizacion/decisiones/) entra con el ingreso de este sistema: las cuentas
-- de los pisos viven aquí y su token, que ahora nombra a los dos sistemas en `aud`,
-- abre también la API de hospitalización. Esa API guarda sus pacientes en su propia
-- base; aquí solo hay cuentas, unidades, roles y permisos.
--
-- Unidades nuevas. No reportan ni reciben: solo sirven para atar la cuenta de
-- enfermería a su área y la de la jefatura a su departamento. Su clave es el id del
-- servicio o del departamento en hospitalización (`datos/catalogo.js`), que es lo
-- que lee su API.
--
-- Permisos `hospitalizacion.*`. Esta API no los autoriza: viajan en el token y los
-- traduce `servidor/hospitalizacion/app/cuentas_estadistica.py`.
--
-- Roles:
--   enfermeria                 unidad (el área)          designa camas, O2, altas, traslados, censo
--   jefe_departamento          unidad (el departamento)  mira las áreas de su departamento
--   admision                   global                    envía al paciente a un área
--   control_camas              global                    plano, RENOXI y tablero de ocupación
--   mantenimiento_camas        global                    retira, repara y entrega camas
--   validador_hospitalizacion  global                    valida altas, cierra el mes, indicadores
--
-- Estadística no cambia de rol: a su cuenta se le suma `validador_hospitalizacion`
-- desde «Cuentas y permisos» cuando hospitalización esté en el servidor, y esos
-- módulos aparecen debajo de su menú. Este seeder no se lo asigna a nadie, para que
-- el menú no muestre módulos sin su servidor.
--
-- El superadministrador recibe los permisos nuevos, como todos; su menú no muestra
-- hospitalización (`frontend/src/app/navegacion.js`), que no es para administrar.
-- Se puede correr más de una vez: lo que ya existe no se repite.
-- =============================================================================

INSERT INTO organizacion.unidad_organica (codigo, clave, nombre, nombre_corto, tipo, es_reportante, es_receptora, es_estadistica, es_externa)
SELECT x.codigo, x.clave, x.nombre, x.nombre_corto, x.tipo, FALSE, FALSE, FALSE, FALSE
  FROM (VALUES
        ('MED', 'medicina',             'Departamento de Medicina',       'Medicina',             'departamento'),
        ('MEA', 'medicina-a',           'Medicina A',                     'Medicina A',           'servicio'),
        ('MEB', 'medicina-b',           'Medicina B',                     'Medicina B',           'servicio'),
        ('MEI', 'medicina-intermedios', 'Medicina Intermedios',           'Intermedios',          'servicio'),
        ('UCI', 'cuidados-criticos',    'Unidad de Cuidados Intensivos',  'UCI',                  'servicio'),
        ('QUE', 'quemados',             'Unidad de Quemados',             'Quemados',             'servicio')
       ) AS x (codigo, clave, nombre, nombre_corto, tipo)
 WHERE NOT EXISTS (
        SELECT 1 FROM organizacion.unidad_organica u
         WHERE (u.codigo = x.codigo OR u.clave = x.clave) AND u.fecha_eliminacion IS NULL
       );

-- Las áreas de Medicina cuelgan del departamento (organigrama).
UPDATE organizacion.unidad_organica a
   SET unidad_padre_id = d.id
  FROM organizacion.unidad_organica d
 WHERE d.clave = 'medicina' AND d.fecha_eliminacion IS NULL
   AND a.clave IN ('medicina-a', 'medicina-b', 'medicina-intermedios') AND a.fecha_eliminacion IS NULL
   AND a.unidad_padre_id IS DISTINCT FROM d.id;

INSERT INTO seguridad.permiso (codigo, modulo, descripcion)
SELECT x.codigo, 'hospitalizacion', x.descripcion
  FROM (VALUES
        ('hospitalizacion.ver',           'Entrar a los módulos de hospitalización y ver el plano de camas'),
        ('hospitalizacion.operar',        'Enfermería de un área: designar cama, O2 y VM, altas, traslados, mantenimiento y censo'),
        ('hospitalizacion.supervisar',    'Jefatura de un departamento: ver sus áreas, censos y ocupación, sin operar'),
        ('hospitalizacion.admision',      'Admisión: enviar al paciente a un área con su orden de hospitalización'),
        ('hospitalizacion.camas',         'Control diario de camas: plano, RENOXI y tablero de ocupación'),
        ('hospitalizacion.mantenimiento', 'Mantenimiento: retirar, reparar y entregar camas'),
        ('hospitalizacion.validar',       'Estadística: validar altas, recibir censos, indicadores DIRESA y cierre de mes')
       ) AS x (codigo, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.permiso p WHERE p.codigo = x.codigo AND p.fecha_eliminacion IS NULL);

INSERT INTO seguridad.rol (codigo, nombre, descripcion, alcance, es_sistema)
SELECT x.codigo, x.nombre, x.descripcion, x.alcance, TRUE
  FROM (VALUES
        ('enfermeria',                'Enfermería de hospitalización', 'Enfermería de un área: designa camas y controla a sus pacientes hasta el alta.', 'unidad'),
        ('jefe_departamento',         'Jefatura de departamento',      'Mira las áreas de su departamento: camas, censos y ocupación. No opera.',      'unidad'),
        ('admision',                  'Admisión',                      'Envía al paciente a un área con su orden de hospitalización.',               'global'),
        ('control_camas',             'Control diario de camas',       'Lleva el plano de camas, la carga de RENOXI y el tablero de ocupación.',     'global'),
        ('mantenimiento_camas',       'Mantenimiento de camas',        'Retira, repara y entrega las camas reportadas con falla.',                    'global'),
        ('validador_hospitalizacion', 'Validación de hospitalización', 'Estadística: valida las altas, recibe los censos y cierra el mes.',           'global')
       ) AS x (codigo, nombre, descripcion, alcance)
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.rol r WHERE r.codigo = x.codigo AND r.fecha_eliminacion IS NULL);

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM (VALUES
        ('enfermeria',                'hospitalizacion.ver'), ('enfermeria',                'hospitalizacion.operar'),
        ('jefe_departamento',         'hospitalizacion.ver'), ('jefe_departamento',         'hospitalizacion.supervisar'),
        ('admision',                  'hospitalizacion.ver'), ('admision',                  'hospitalizacion.admision'),
        ('control_camas',             'hospitalizacion.ver'), ('control_camas',             'hospitalizacion.camas'),
        ('mantenimiento_camas',       'hospitalizacion.ver'), ('mantenimiento_camas',       'hospitalizacion.mantenimiento'),
        ('validador_hospitalizacion', 'hospitalizacion.ver'), ('validador_hospitalizacion', 'hospitalizacion.validar')
       ) AS x (rol, permiso)
  JOIN seguridad.rol r     ON r.codigo = x.rol AND r.fecha_eliminacion IS NULL
  JOIN seguridad.permiso p ON p.codigo = x.permiso AND p.fecha_eliminacion IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM seguridad.rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id AND rp.fecha_eliminacion IS NULL);

INSERT INTO seguridad.rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
  FROM seguridad.rol r
  JOIN seguridad.permiso p ON p.modulo = 'hospitalizacion' AND p.fecha_eliminacion IS NULL
 WHERE r.codigo = 'superadmin' AND r.fecha_eliminacion IS NULL
   AND NOT EXISTS (SELECT 1 FROM seguridad.rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id AND rp.fecha_eliminacion IS NULL);
