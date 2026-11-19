"""Roles: los de la base y los de la interfaz.

**La base de Alejandro** tiene seis roles (`seguridad.rol`), cada uno con sus
permisos, y una cuenta los lleva **atados a una unidad** o globales:

    superadmin   global    todo
    admin        unidad    gestiona su unidad y hace lo del digitador
    digitador    unidad    sube, corrige, justifica y envía el reporte de su unidad
    revisor      global    Estadística: revisa, valida, remite y rectifica
    consulta     ambos     solo lectura, de su unidad o global
    boletin      global    solo el boletín y el panel de monitoreo de sus datos
    planeamiento global    Planeamiento: lee lo entregado de todas y registra las
                           actividades operativas del POI (seeder 0005, 27/10/2026)

**La interfaz** habla de tres tipos de usuario, y son tres y no dos: Epidemiología
reporta como una de las nueve áreas y además recibe los reportes de Nefrología y
de Centro Quirúrgico. Con dos tipos ese caso, que es real, no se puede
representar. En la base no hace falta un tercer tipo: es la misma cuenta con dos
asignaciones sobre su unidad (`digitador` y `consulta`).

El cuarto es Planeamiento: recibe al nivel de Estadística (las nueve áreas) y
tiene su propio módulo. En la base y en la interfaz se llama igual.

El quinto es **Hospitalización** (14/11/2026, decisión 0011 de Egresos
Hospitalarios): las cuentas de los pisos (enfermería de cada área, la jefatura del
departamento, Admisión, el control diario de camas y Mantenimiento) no reportan ni
reciben, y solo ven los módulos de hospitalización. Sus permisos son
`hospitalizacion.*` (seeder 0009) y los autoriza la API de hospitalización
(`servidor/hospitalizacion/`), no esta. Estadística no cambia de tipo: su rol de
siempre, `revisor`, trae `hospitalizacion.validar` (seeder 0011) y esos módulos
aparecen debajo de su menú. No hay un rol aparte para eso.

Otro tipo es **Boletín** (18/11/2026): la persona encargada del boletín
estadístico entra con su propia cuenta y ve solo dos módulos —el boletín y el
panel de monitoreo de sus datos—. No reporta, revisa, remite ni administra. En
la base es el rol `boletin`, global, con `boletin.ver` (seeder 0012).

El backend autoriza por **permisos** (ver `permisos.py`), no por rol. Esta
traducción existe solo para decirle a la interfaz qué pantallas mostrar.
"""

# Los tres de la interfaz (el vocabulario del frontend y de contrato/estados.json).
AREA = "area"
ESTADISTICA = "estadistica"
OFICINA = "oficina"
PLANEAMIENTO = "planeamiento"  # también es el código del rol en la base
HOSPITALIZACION = "hospitalizacion"
BOLETIN = "boletin"  # también es el código del rol en la base (seeder 0012)

ROLES_DE_INTERFAZ = (AREA, ESTADISTICA, PLANEAMIENTO, OFICINA, HOSPITALIZACION, BOLETIN)

# Los de la base (`seguridad.rol.codigo`). BOLETIN está arriba: es el mismo
# código en la base y en la interfaz.
SUPERADMIN = "superadmin"
ADMIN = "admin"
DIGITADOR = "digitador"
REVISOR = "revisor"
CONSULTA = "consulta"

# Los de hospitalización (seeder 0009). Enfermería y la jefatura del departamento
# van atadas a su unidad (el área o el departamento); los demás son globales.
ENFERMERIA = "enfermeria"
JEFE_DEPARTAMENTO = "jefe_departamento"
ADMISION = "admision"
CONTROL_CAMAS = "control_camas"
MANTENIMIENTO_CAMAS = "mantenimiento_camas"
# Estadística no tiene uno propio: `revisor` trae `hospitalizacion.validar` (seeder 0011,
# que retiró `validador_hospitalizacion`).
ROLES_DE_HOSPITALIZACION = (ENFERMERIA, JEFE_DEPARTAMENTO, ADMISION, CONTROL_CAMAS, MANTENIMIENTO_CAMAS)

ROLES = (SUPERADMIN, ADMIN, DIGITADOR, REVISOR, CONSULTA, BOLETIN, PLANEAMIENTO, *ROLES_DE_HOSPITALIZACION)

# Qué tipo de usuario ve la interfaz según el rol de la base. `superadmin` no
# corresponde a ninguno: administra el sistema, no reporta ni recibe.
ROL_DE_INTERFAZ = {
    DIGITADOR: AREA,
    ADMIN: AREA,
    REVISOR: ESTADISTICA,
    CONSULTA: OFICINA,
    BOLETIN: BOLETIN,
    PLANEAMIENTO: PLANEAMIENTO,
    **{rol: HOSPITALIZACION for rol in ROLES_DE_HOSPITALIZACION},
}


def rol_de_interfaz(rol_de_la_base: str) -> str | None:
    return ROL_DE_INTERFAZ.get(rol_de_la_base)
