"""De los permisos que trae el token de Estadística a una cuenta de este sistema.

Con `INGRESO=estadistica` (fase 3 de la decisión 0011) las cuentas viven en la base
de Estadística: un rol en una unidad, con sus permisos `hospitalizacion.*`
(`servidor/api/bd/seeders/0009_hospitalizacion.sql`). Este sistema sigue pensando en
sus roles (`enfermeria`, `admision`…) y en los servicios que opera cada cuenta; esta
traducción es el único lugar donde se cruzan los dos vocabularios.

La tabla `cuenta` queda como espejo: los movimientos, los censos y la bitácora nombran
a quien los registró, así que la cuenta se crea (o se pone al día) la primera vez que
entra. Su `id` es el nombre de usuario de Estadística, el mismo que tenían aquí las
cuentas del prototipo (`medicina.b`, `estadistica`…): lo registrado antes sigue a su
nombre."""

from sqlalchemy import text

VALIDAR = "hospitalizacion.validar"
ADMISION = "hospitalizacion.admision"
CAMAS = "hospitalizacion.camas"
MANTENIMIENTO = "hospitalizacion.mantenimiento"
SUPERVISAR = "hospitalizacion.supervisar"
OPERAR = "hospitalizacion.operar"

# La clave de una unidad de hospitalización en Estadística: un prefijo y el id de este
# sistema (`servidor/api/app/servicios/unidades_hospitalizacion.py`). El prefijo evita
# que choquen con las de Estadística (`ginecologia` ya es Gineco-Obstetricia) y entre
# un departamento y su área (Cirugía).
PREFIJOS_DE_UNIDAD = ("hosp-dep-", "hosp-area-")


def id_de_unidad(clave: str) -> str:
    """El id de este sistema. Acepta también la clave sin prefijo del seeder 0009,
    la de un token emitido antes del seeder 0010."""
    for prefijo in PREFIJOS_DE_UNIDAD:
        if clave.startswith(prefijo):
            return clave[len(prefijo):]
    return clave


# Si una cuenta trae varios, manda el primero: el superadministrador los trae todos
# y entra como Estadística, no como la enfermería de todos los pisos.
PRECEDENCIA = (
    (VALIDAR, "jefatura"),
    (ADMISION, "admision"),
    (CAMAS, "camas"),
    (MANTENIMIENTO, "mantenimiento"),
    (SUPERVISAR, "departamento"),
    (OPERAR, "enfermeria"),
)


def cuenta_desde_token(reclamos: dict, *, servicios_con_camas: list[str], servicios_por_departamento: dict[str, list[str]]) -> dict | None:
    """La cuenta que corresponde al token, o `None` si no trae ningún permiso de
    hospitalización. Una función pura: la API le pasa el catálogo de la base.

    La unidad de la asignación es la clave de la unidad en Estadística: el id de este
    sistema con un prefijo (`id_de_unidad`), un servicio (`hosp-area-medicina-b`) para
    la enfermería y un departamento (`hosp-dep-medicina`) para su jefatura. Una
    asignación global vale para todos."""
    asignaciones = reclamos["asignaciones"]
    for permiso, rol in PRECEDENCIA:
        con_permiso = [a for a in asignaciones if permiso in a["permisos"]]
        if not con_permiso:
            continue
        if any(a.get("unidad") is None for a in con_permiso):
            servicios = list(servicios_con_camas)
        elif rol == "departamento":
            servicios = [s for a in con_permiso for s in servicios_por_departamento.get(id_de_unidad(a["unidad"]), [])]
        else:
            servicios = [id_de_unidad(a["unidad"]) for a in con_permiso if id_de_unidad(a["unidad"]) in servicios_con_camas]
        usuario = reclamos["usr"].strip().lower()
        return {
            "id": usuario,
            "usuario": usuario,
            "nombre": reclamos.get("nom") or usuario,
            "rol": rol,
            "servicios": sorted(dict.fromkeys(servicios)),
            "solo_lectura": reclamos.get("obs") is not None,
        }
    return None


def catalogo(conexion) -> tuple[list[str], dict[str, list[str]]]:
    filas = conexion.execute(
        text("SELECT DISTINCT s.id, s.departamento_id FROM servicio s JOIN cama c ON c.servicio_id = s.id WHERE c.activa ORDER BY s.id")
    ).all()
    por_departamento: dict[str, list[str]] = {}
    for servicio, departamento in filas:
        por_departamento.setdefault(departamento, []).append(servicio)
    return [f[0] for f in filas], por_departamento


def sincronizar(conexion, cuenta: dict) -> None:
    """Crea o pone al día el espejo de la cuenta. Solo escribe si algo cambió: la
    pantalla consulta el estado cada pocos segundos y cada escritura deja una fila
    en la auditoría."""
    actual = conexion.execute(
        text("SELECT nombre, rol, activo, origen FROM cuenta WHERE id = :c"), {"c": cuenta["id"]}
    ).mappings().first()
    servicios = sorted(conexion.execute(text("SELECT servicio_id FROM cuenta_servicio WHERE cuenta_id = :c"), {"c": cuenta["id"]}).scalars())
    igual = actual is not None and (actual["nombre"], actual["rol"], actual["activo"], actual["origen"]) == (
        cuenta["nombre"], cuenta["rol"], True, "estadistica"
    )
    if igual and servicios == cuenta["servicios"]:
        return
    conexion.execute(
        text("SELECT set_config('app.cuenta_id', :c, true)"), {"c": cuenta["id"]}
    )
    conexion.execute(
        text(
            """INSERT INTO cuenta (id, usuario, nombre, rol, origen, activo)
               VALUES (:id, :usuario, :nombre, :rol, 'estadistica', true)
               ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol,
                 origen = 'estadistica', activo = true"""
        ),
        {k: cuenta[k] for k in ("id", "usuario", "nombre", "rol")},
    )
    if servicios != cuenta["servicios"]:
        conexion.execute(text("DELETE FROM cuenta_servicio WHERE cuenta_id = :c"), {"c": cuenta["id"]})
        for s in cuenta["servicios"]:
            conexion.execute(text("INSERT INTO cuenta_servicio (cuenta_id, servicio_id) VALUES (:c, :s)"), {"c": cuenta["id"], "s": s})
