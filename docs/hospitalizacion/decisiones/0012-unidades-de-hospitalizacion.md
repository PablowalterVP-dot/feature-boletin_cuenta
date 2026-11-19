# 0012: Las unidades de hospitalización, con clave propia y su propio panel

- **Estado:** Adoptada
- **Fecha:** 2026-11-15
- **Completa:** [0011](0011-integracion-con-estadistica.md) (las cuentas viven en la base de
  Estadística)

## Contexto

Al crear las primeras cuentas de los pisos desde «Cuentas y permisos» aparecieron dos
problemas:

- El rol «Enfermería de hospitalización» no ofrecía ninguna unidad. El selector solo
  mostraba las unidades que reportan a Estadística, y las de hospitalización no reportan.
- Solo existían las seis unidades del seeder 0009 (Medicina y sus tres áreas, UCI y
  Quemados), y no había dónde crear las demás. Además, su clave era el id de
  hospitalización tal cual: `ginecologia` ya es la clave de Gineco-Obstetricia, que
  reporta a Estadística, y Cirugía, Oncología o Infectología tienen un departamento y un
  área con el mismo id.

## Decisión

**Clave con prefijo propio.** Una unidad de hospitalización en la base de Estadística se
llama `hosp-dep-<id>` (un departamento) o `hosp-area-<id>` (un área, que es un censo),
con el id del catálogo de hospitalización. Nunca choca con una unidad de Estadística ni
el departamento con su área. El seeder `0010_hospitalizacion_unidades` pasa las seis
unidades existentes a esa forma; las asignaciones ya hechas siguen valiendo porque
apuntan al id de la unidad, no a su clave. La API de hospitalización quita el prefijo al
leer el token y acepta también la clave vieja.

**Panel «Unidades de hospitalización»** en el menú del superadministrador, bajo
Configuración. Lista los departamentos y áreas del catálogo, con su código, las camas
que tienen en el plano y cuántas cuentas tienen un rol en ellas. Desde ahí se habilitan,
se cambian el código y los nombres, y se desactivan. No se eliminan.

**No se cruza con Estadística.** Las rutas `/api/admin/hospitalizacion/unidades` solo
leen y escriben unidades con esos prefijos: una de Estadística responde 404. Las de
hospitalización no reportan ni reciben, así que no aparecen en «Áreas y matriz», en la
cobertura ni en el resumen. El código (la sigla) no puede repetir el de ninguna unidad,
y el mensaje dice de quién es.

**Cada rol, sus unidades.** En «Cuentas y permisos», `enfermeria` ofrece solo las áreas
de hospitalización habilitadas y `jefe_departamento` solo sus departamentos. Los roles
de Estadística no ven las de hospitalización.

**Las camas no se crean aquí.** Salen del plano. Un área sin plano se puede habilitar y
su cuenta entra, pero no tiene camas que operar hasta que se dibuje el suyo; el panel lo
avisa.

**Roles con el nombre del puesto.** `control_camas` se muestra como «Responsable de
RENOXI» y `validador_hospitalizacion` como «Estadística de hospitalización». Sus códigos
no cambian.

> **15/11/2026.** `validador_hospitalizacion` se retiró (seeder `0011`): sus permisos los
> trae el rol `revisor` de la cuenta oficial de Estadística. Ver la decisión 0011.

## Consecuencias

- La tabla de cuentas cabe sin barra horizontal: cada rol va en dos líneas (el rol y,
  debajo, su unidad) y el correo y el celular comparten la columna «Contacto».
- Un permiso o un tipo de unidad nuevo de hospitalización se cambia a la vez en
  `frontend/src/app/hospitalizacion/datos/unidades.js`,
  `servidor/api/app/servicios/unidades_hospitalizacion.py` y
  `servidor/hospitalizacion/app/cuentas_estadistica.py`. La prueba de humo compara los
  prefijos de los tres.
