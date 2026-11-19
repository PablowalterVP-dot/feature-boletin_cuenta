"""Quién hace la petición.

Es lo que viaja dentro del token y lo que cada endpoint lee: las **asignaciones**
de la cuenta (un rol, en una unidad o global) y los permisos que cada una da. No
se consulta a la base en cada petición; por eso un cambio de roles, o desactivar
una cuenta, tarda hasta la vida del token (8 horas) en aplicar. Es una
contrapartida aceptada; si molesta, la salida es una lista de revocación.

Una cuenta con dos asignaciones (Epidemiología: `digitador` y `consulta` sobre su
unidad) lleva ambas. Cada operación pide un permiso sobre una unidad concreta, así
que el servidor no necesita saber cuál tiene «activa»: ese conmutador es solo de
la interfaz.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from app.dominio import permisos, roles

# La unidad de Dirección General: ve el panel de monitoreo y lo entregado por las
# áreas. No es un permiso de la base porque el permiso de esa cuenta es sobre su
# unidad, y el panel mira todo el hospital; decidido el 01/11/2026.
UNIDAD_DIRECCION = "direccion-general"


@dataclass(frozen=True)
class Asignacion:
    """Un rol de la cuenta, en una unidad (`unidad` es su clave, p. ej.
    «nutricion») o global (`None`), con los permisos que ese rol da."""

    rol: str
    unidad: str | None
    permisos: frozenset[str]


@dataclass(frozen=True)
class Sesion:
    usuario_id: int
    usuario: str
    nombre: str
    asignaciones: tuple[Asignacion, ...]
    # La cuenta tiene una contraseña provisional: solo puede cambiarla.
    debe_cambiar_clave: bool
    emitido_en: datetime
    expira_en: datetime
    # Quién mira, si esta sesión es la de un administrador viendo como esta
    # cuenta (soporte). Entonces es de solo lectura: ve lo que la cuenta ve,
    # pero no puede escribir nada en su nombre.
    observador_id: int | None = None

    @property
    def solo_lectura(self) -> bool:
        return self.observador_id is not None

    # ---------------------------------------------------------------- roles

    @property
    def roles(self) -> tuple[str, ...]:
        """Los códigos de rol de la base, sin repetir y en orden."""
        return tuple(dict.fromkeys(a.rol for a in self.asignaciones))

    def tiene_rol(self, rol: str) -> bool:
        return rol in self.roles

    @property
    def ve_monitoreo(self) -> bool:
        """El panel de monitoreo: quien mira los indicadores de todo el hospital
        (Estadística y el superadministrador), Dirección General y la encargada
        del boletín, que necesita esas cifras para publicarlo."""
        return (
            self.puede(permisos.DESEMPENO_VER)
            or self.puede(permisos.BOLETIN_VER)
            or any(a.unidad == UNIDAD_DIRECCION for a in self.asignaciones)
        )

    @property
    def roles_de_interfaz(self) -> tuple[str, ...]:
        """Qué tipos de usuario ve la interfaz (`area`, `estadistica`, `oficina`…).

        `hospitalizacion` solo cuando la cuenta no tiene otro: Estadística con el rol
        de validar altas sigue siendo Estadística, y los módulos de hospitalización
        aparecen debajo de su menú por sus permisos, no como un ámbito aparte."""
        traducidos = (roles.rol_de_interfaz(a.rol) for a in self.asignaciones)
        tipos = tuple(dict.fromkeys(r for r in traducidos if r is not None))
        sin_hospitalizacion = tuple(t for t in tipos if t != roles.HOSPITALIZACION)
        return sin_hospitalizacion or tipos

    # ------------------------------------------------------------- permisos

    def puede(self, permiso: str, unidad: str | None = None) -> bool:
        """¿Puede hacer esto sobre esa unidad?

        Vale una asignación **global** o una atada a **esa** unidad. Tener el
        permiso en otra unidad no cuenta. Con `unidad=None` solo vale una
        asignación global: es la pregunta «¿puede hacerlo en todo el sistema?».
        """
        return any(
            permiso in a.permisos and (a.unidad is None or (unidad is not None and a.unidad == unidad)) for a in self.asignaciones
        )

    def puede_en_alguna(self, permiso: str) -> bool:
        """¿Tiene el permiso en al menos una unidad, o global? Sirve para la
        puerta de un endpoint; la unidad concreta se comprueba después."""
        return any(permiso in a.permisos for a in self.asignaciones)

    def unidades_con(self, permiso: str) -> frozenset[str] | None:
        """Las unidades sobre las que tiene el permiso, o `None` si en todas
        (asignación global). Es lo que filtra una lista: un digitador ve las suyas,
        un revisor todas."""
        con_permiso = [a for a in self.asignaciones if permiso in a.permisos]
        if any(a.unidad is None for a in con_permiso):
            return None
        return frozenset(a.unidad for a in con_permiso if a.unidad is not None)


def agrupar(filas: Iterable[tuple[str, str | None, str]]) -> tuple[Asignacion, ...]:
    """De filas `(rol, unidad, permiso)` (lo que devuelve la vista de permisos)
    a asignaciones, una por rol y unidad, en orden estable."""
    permisos: dict[tuple[str, str | None], set[str]] = {}
    for rol, unidad, permiso in filas:
        permisos.setdefault((rol, unidad), set()).add(permiso)
    ordenadas = sorted(permisos.items(), key=lambda par: (par[0][1] is not None, par[0][1] or "", par[0][0]))
    return tuple(Asignacion(rol, unidad, frozenset(p)) for (rol, unidad), p in ordenadas)
