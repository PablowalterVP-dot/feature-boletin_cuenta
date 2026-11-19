"""Las unidades de hospitalización en esta base: departamentos y áreas.

Hospitalización (`servidor/hospitalizacion/`, decisión 0011) ata cada cuenta de
enfermería a su área y cada jefatura a su departamento con una unidad de esta base.
Esas unidades no reportan ni reciben: no aparecen en «Áreas y matriz», en la
cobertura ni en el resumen. Para que nunca se crucen con las de Estadística, su clave
lleva un prefijo propio seguido del id que usa hospitalización:

    hosp-dep-<id>    un departamento (medicina, cirugia…)
    hosp-area-<id>   un área, que es un censo (medicina-a, cuidados-criticos…)

Así un área y su departamento pueden tener el mismo id (Cirugía), y el id
`ginecologia` de hospitalización no choca con Gineco-Obstetricia, que reporta a
Estadística con la clave `ginecologia`. La API de hospitalización quita el prefijo al
leer el token (`servidor/hospitalizacion/app/cuentas_estadistica.py`).

Desde aquí solo se crean, editan, activan o desactivan unidades con esos prefijos: las
de Estadística no se tocan. No se eliminan: desactivar basta, y una asignación a una
unidad inactiva deja de valer en el siguiente ingreso (`api/auth.py`).
"""

import re

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import UnidadOrganica, Usuario, UsuarioRol
from app.dominio.configuracion import ValorInvalido
from app.servicios.admin import Conflicto, NoEncontrado

PREFIJO = {"departamento": "hosp-dep-", "area": "hosp-area-"}
# En la base, un área de hospitalización es un `servicio`, como Nefrología.
TIPO_EN_BASE = {"departamento": "departamento", "area": "servicio"}

ID_VALIDO = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
CODIGO_VALIDO = re.compile(r"^[A-Z0-9-]{2,20}$")
LARGO_ID = 48


def clave_de(tipo: str, id_: str) -> str:
    return PREFIJO[tipo] + id_


def de_hospitalizacion(clave: str | None) -> tuple[str, str] | None:
    """`(tipo, id)` si la clave es de una unidad de hospitalización; si no, `None`."""
    for tipo, prefijo in PREFIJO.items():
        if clave and clave.startswith(prefijo):
            return tipo, clave[len(prefijo):]
    return None


def _de_hospitalizacion():
    return or_(*(UnidadOrganica.clave.startswith(p, autoescape=True) for p in PREFIJO.values()))


def _unidad(bd: Session, clave: str) -> UnidadOrganica:
    u = None
    if de_hospitalizacion(clave):
        u = bd.scalar(select(UnidadOrganica).where(UnidadOrganica.clave == clave, vigente(UnidadOrganica)))
    if u is None:
        raise NoEncontrado("No existe esa unidad de hospitalización. Las unidades de Estadística no se cambian desde aquí.")
    return u


def _codigo(texto: str) -> str:
    codigo = (texto or "").strip().upper()
    if not CODIGO_VALIDO.fullmatch(codigo):
        raise ValorInvalido("El código va de 2 a 20 caracteres: letras sin tilde, números o guiones (por ejemplo, CIR o MEA).")
    return codigo


def _codigo_libre(bd: Session, codigo: str, propia_id: int | None = None) -> None:
    otra = bd.scalar(select(UnidadOrganica).where(UnidadOrganica.codigo == codigo, vigente(UnidadOrganica)))
    if otra is not None and otra.id != propia_id:
        de_quien = "de hospitalización" if de_hospitalizacion(otra.clave) else "de Estadística"
        raise Conflicto(f"El código {codigo} ya lo usa «{otra.nombre}», una unidad {de_quien}. Elija otro.")


def _nombre(texto: str | None, campo: str) -> str:
    limpio = (texto or "").strip()
    if not limpio:
        raise ValorInvalido(f"Falta el {campo}.")
    return limpio


def _vista(u: UnidadOrganica, padres: dict[int, UnidadOrganica], cuentas: dict[int, int]) -> dict:
    tipo, id_ = de_hospitalizacion(u.clave)
    padre = padres.get(u.unidad_padre_id) if u.unidad_padre_id else None
    del_padre = de_hospitalizacion(padre.clave) if padre is not None else None
    return {
        "clave": u.clave,
        "tipo": tipo,
        "id": id_,
        "codigo": u.codigo,
        "nombre": u.nombre,
        "nombre_corto": u.nombre_corto,
        "departamento": del_padre[1] if del_padre and del_padre[0] == "departamento" else None,
        "activa": u.es_activo,
        "cuentas": cuentas.get(u.id, 0),
    }


def listar(bd: Session) -> list[dict]:
    """Las unidades de hospitalización, con cuántas cuentas tienen un rol en cada una."""
    unidades = list(bd.scalars(select(UnidadOrganica).where(vigente(UnidadOrganica), _de_hospitalizacion()).order_by(UnidadOrganica.nombre)))
    ids = [u.id for u in unidades]
    cuentas = dict(
        bd.execute(
            select(UsuarioRol.unidad_organica_id, func.count(func.distinct(UsuarioRol.usuario_id)))
            .join(Usuario, Usuario.id == UsuarioRol.usuario_id)
            .where(UsuarioRol.unidad_organica_id.in_(ids), vigente(UsuarioRol), vigente(Usuario))
            .group_by(UsuarioRol.unidad_organica_id)
        ).all()
    ) if ids else {}
    padres = {u.id: u for u in unidades}
    return [_vista(u, padres, cuentas) for u in unidades]


def _ver(bd: Session, clave: str) -> dict:
    return next(u for u in listar(bd) if u.get("clave") == clave)


def crear(
    bd: Session,
    *,
    tipo: str,
    id: str,
    codigo: str,
    nombre: str,
    nombre_corto: str | None = None,
    departamento: str | None = None,
    areas: list[str] | tuple[str, ...] = (),
) -> dict:
    """Habilita un departamento o un área. El área cuelga de su departamento si ya
    está habilitado; el departamento adopta las áreas que ya lo estaban (`areas`, los
    ids del catálogo de hospitalización)."""
    if tipo not in PREFIJO:
        raise ValorInvalido("El tipo es «departamento» o «area».")
    if not ID_VALIDO.fullmatch(id or "") or len(id) > LARGO_ID:
        raise ValorInvalido("El id va en minúsculas, con números y guiones (el del catálogo de hospitalización, por ejemplo medicina-a).")
    clave = clave_de(tipo, id)
    ya = bd.scalar(select(UnidadOrganica).where(UnidadOrganica.clave == clave, vigente(UnidadOrganica)))
    if ya is not None:
        raise Conflicto(f"«{ya.nombre}» ya está habilitada.")
    codigo = _codigo(codigo)
    _codigo_libre(bd, codigo)

    padre_id = None
    if tipo == "area" and departamento:
        padre_id = bd.scalar(select(UnidadOrganica.id).where(UnidadOrganica.clave == clave_de("departamento", departamento), vigente(UnidadOrganica)))

    u = UnidadOrganica(
        codigo=codigo,
        clave=clave,
        nombre=_nombre(nombre, "nombre"),
        nombre_corto=(nombre_corto or "").strip() or None,
        tipo=TIPO_EN_BASE[tipo],
        unidad_padre_id=padre_id,
        es_reportante=False,
        es_receptora=False,
        es_estadistica=False,
        es_externa=False,
        es_activo=True,
    )
    bd.add(u)
    bd.flush()

    if tipo == "departamento" and areas:
        claves = [clave_de("area", a) for a in areas if ID_VALIDO.fullmatch(a or "")]
        for hija in bd.scalars(select(UnidadOrganica).where(UnidadOrganica.clave.in_(claves), vigente(UnidadOrganica))):
            hija.unidad_padre_id = u.id
        bd.flush()
    return _ver(bd, clave)


def editar(bd: Session, clave: str, cambios: dict) -> dict:
    """Cambia el código, los nombres o si está activa. El id no cambia: es lo que
    lee hospitalización y lo que guarda su plano."""
    u = _unidad(bd, clave)
    if "codigo" in cambios and cambios["codigo"] is not None:
        codigo = _codigo(cambios["codigo"])
        _codigo_libre(bd, codigo, u.id)
        u.codigo = codigo
    if "nombre" in cambios:
        u.nombre = _nombre(cambios["nombre"], "nombre")
    if "nombre_corto" in cambios:
        u.nombre_corto = (cambios["nombre_corto"] or "").strip() or None
    if cambios.get("activa") is not None:
        u.es_activo = bool(cambios["activa"])
    bd.flush()
    return _ver(bd, clave)
