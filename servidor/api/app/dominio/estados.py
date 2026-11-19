"""Máquina de estados del reporte mensual.

Un solo módulo decide qué puede pasarle a un reporte y quién puede hacerlo. Es
la versión del backend de `frontend/src/app/dominio/estados.js`, que sigue
siendo el origen: `servidor/api/contrato/estados.json` se genera de ese archivo y
`pruebas/prueba_contrato_estados.py` falla si esta copia se desalinea de él.
Si cambia una transición, se cambia en el frontend, se regenera el contrato y
se ajusta aquí.

Estadística **ya no valida ni remite** (decisión del 12 de octubre de 2026): el
bot validador revisa cada Excel y no deja enviar lo que no cuadra ni una alerta
sin justificar. Al enviar, el reporte llega a la vez a Estadística y a las
oficinas de la matriz, y el periodo queda cerrado. Tampoco devuelve reportes con
observaciones (13/09/2026).

    no_iniciado ──crear──▶ borrador ──enviar──▶ remitido
                              ▲                     │
                              └────(rectificar)─────┘

`enviado`, `en_revision` y `validado` quedan en el historial de los reportes
anteriores al cambio, pero ya no son estados: `bd/flujo/01_entrega_directa.sql`
los retira de la base y pasa a `remitido` los reportes que estaban en ellos.

`no_iniciado` no es una fila: un reporte que no existe no se almacena, y su
ausencia es ese estado. Guardar un registro vacío afirmaría que alguien lo abrió.
"""

from dataclasses import dataclass

from app.dominio import permisos, roles

# Quién debe actuar. Sin la validación de Estadística, solo queda el área.
ESPERA_AREA = "area"
ESPERA_NADIE = "nadie"

NO_INICIADO = "no_iniciado"
BORRADOR = "borrador"
REMITIDO = "remitido"


@dataclass(frozen=True)
class Estado:
    clave: str
    orden: int
    espera: str


@dataclass(frozen=True)
class Transicion:
    accion: str
    desde: tuple[str, ...]
    hasta: str
    rol: str
    # Cambia algo que otros ya vieron: el frontend exige confirmación.
    confirmar: bool = False


ESTADOS = (
    Estado(NO_INICIADO, 0, ESPERA_AREA),
    Estado(BORRADOR, 1, ESPERA_AREA),
    Estado(REMITIDO, 2, ESPERA_NADIE),
)

# Los estados que existen como fila en `reporte.estado_reporte`: `no_iniciado` no.
ESTADOS_ALMACENADOS = tuple(e.clave for e in ESTADOS if e.clave != NO_INICIADO)

TRANSICIONES = (
    Transicion("crear", (NO_INICIADO,), BORRADOR, roles.AREA),
    # Entrega a la vez a Estadística y a las oficinas de la matriz.
    Transicion("enviar", (BORRADOR,), REMITIDO, roles.AREA, confirmar=True),
    # No es una devolución con observaciones: es la excepción de un mes cerrado
    # al que llega una corrección, igual que con el papel.
    Transicion("rectificar", (REMITIDO,), BORRADOR, roles.ESTADISTICA, confirmar=True),
)


# Qué permiso de la base (`seguridad.permiso`) exige cada acción. En la BD lo dice
# `reporte.transicion_estado.permiso_id`; `crear` no está allí porque no es una
# transición guardada sino el INSERT del reporte, y exige `reporte.cargar`.
# `pruebas/prueba_contrato_estados.py` compara esto con la BD.
PERMISO_DE_ACCION = {
    "crear": permisos.REPORTE_CARGAR,
    "enviar": permisos.REPORTE_ENVIAR,
    "rectificar": permisos.REPORTE_RECTIFICAR,
}


def transicion(accion: str) -> Transicion | None:
    return next((t for t in TRANSICIONES if t.accion == accion), None)


def transiciones_de(estado: str, rol: str) -> tuple[Transicion, ...]:
    return tuple(t for t in TRANSICIONES if estado in t.desde and t.rol == rol)


def puede(estado: str, accion: str, rol: str) -> bool:
    t = transicion(accion)
    return t is not None and t.rol == rol and estado in t.desde


def es_editable(estado: str) -> bool:
    """Solo mientras el área lo llena: una vez enviado, no puede cambiar cifras
    que las oficinas ya recibieron."""
    return estado == BORRADOR


def esta_entregado(estado: str) -> bool:
    """Entregado desde que sale del área: ya no hay trámite después del envío."""
    return estado == REMITIDO
