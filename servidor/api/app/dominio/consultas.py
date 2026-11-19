"""Reglas de las listas de reportes, sin base de datos.

Dos listas leen el mismo dato y responden preguntas distintas:

- la **lista de reportes** (`GET /api/reportes`): qué pasa con cada periodo × formato,
  desde el punto de vista de quien lo produce o lo vigila;
- los **recibidos** de una oficina: qué le han entregado, sin mirar cómo va el reporte
  por dentro.

Aquí viven las decisiones que las dos comparten: el semáforo, quién ve qué, cómo se
resume lo recibido y cómo se pagina. La base (`reporte.v_cumplimiento`) solo aporta las
filas: su semáforo usa `current_date` del servidor de la base, sin la hora de Lima ni
un reloj que las pruebas puedan mover, así que se recalcula aquí.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from math import ceil

from app.dominio import estados, periodos, permisos
from app.dominio.reloj import ZONA
from app.dominio.sesion import Sesion
from app.dominio.transiciones import ErrorDeTransicion

FILAS_POR_PAGINA = 10
MAXIMO_POR_PAGINA = 100


class ErrorDeConsulta(ErrorDeTransicion):
    codigo = "consulta_invalida"


class RangoInvalido(ErrorDeConsulta):
    codigo = "rango_de_periodos_invalido"


class FiltrosIncompatibles(ErrorDeConsulta):
    codigo = "filtros_incompatibles"


# ------------------------------------------------------------------- semáforo

A_TIEMPO = "a_tiempo"
FUERA_DE_PLAZO = "fuera_de_plazo"
PENDIENTE = "pendiente"
VENCIDO = "vencido"

SEMAFOROS = (A_TIEMPO, FUERA_DE_PLAZO, PENDIENTE, VENCIDO)


def fecha_de_envio(fecha_envio: datetime) -> date:
    """El día en que se envió, **en Lima**. A las 21:00 de Lima ya es «mañana» en UTC, y
    un envío hecho el último día del plazo no puede contar como tardío por eso. Una hora
    sin zona se toma como hora de Lima."""
    if fecha_envio.tzinfo is None:
        fecha_envio = fecha_envio.replace(tzinfo=ZONA)
    return fecha_envio.astimezone(ZONA).date()


def semaforo(fecha_envio: datetime | None, fecha_limite: date, hoy: date) -> str:
    """Si ya se envió, mide contra el plazo el día del envío; si no, contra hoy. El plazo
    incluye su último día (`<=`). Lo que cuenta es haber **entregado**: un reporte enviado
    a tiempo sigue «a tiempo» aunque Estadística tarde en validarlo (esa espera es de
    otro, y la dice `espera`)."""
    if fecha_envio is not None:
        return A_TIEMPO if fecha_de_envio(fecha_envio) <= fecha_limite else FUERA_DE_PLAZO
    return PENDIENTE if hoy <= fecha_limite else VENCIDO


def dias_de_retraso(fecha_envio: datetime | None, fecha_limite: date, hoy: date) -> int | None:
    """Días de atraso, o `None` si no hay atraso que contar. Un reporte fuera de plazo
    cuenta hasta el día en que se envió; uno vencido sin enviar, hasta hoy y sigue
    creciendo. Nunca devuelve 0 ni negativo: «sin retraso» es `None`, no un cero que
    parezca una medición."""
    if fecha_envio is not None:
        dias = (fecha_de_envio(fecha_envio) - fecha_limite).days
    else:
        dias = (hoy - fecha_limite).days
    return dias if dias > 0 else None


# ---------------------------------------------------------------- quién espera

ESTADOS_DE_LA_ESPERA: dict[str, tuple[str, ...]] = {
    espera: tuple(e.clave for e in estados.ESTADOS if e.espera == espera)
    for espera in (estados.ESPERA_AREA, estados.ESPERA_NADIE)
}


def espera_de(estado: str) -> str:
    """Quién debe actuar. Es la misma regla que aplica la vista de Alejandro; una prueba
    de contrato comprueba que coinciden."""
    return next((e.espera for e in estados.ESTADOS if e.clave == estado), estados.ESPERA_NADIE)


# ------------------------------------------------------------------ visibilidad


ESTADOS_ENTREGADOS = tuple(e.clave for e in estados.ESTADOS if estados.esta_entregado(e.clave))


def _incluye(unidades: frozenset[str] | None, unidad: str) -> bool:
    return unidades is None or unidad in unidades


@dataclass(frozen=True)
class Visibilidad:
    """Qué renglones de la lista puede ver quien la pide.

    - `unidades_que_ve`: donde tiene `reporte.ver` (`None` = todas).
    - `unidades_con_trabajo`: donde participa en producir o revisar el reporte
      (`reporte.cargar` o `reporte.revisar`; `None` = todas).

    Un reporte que **no ha salido del área** (no iniciado o en borrador) solo lo ve quien
    trabaja en él. Un borrador es trabajo a medias, con cifras que su autor todavía puede
    cambiar: una oficina de consulta, aunque tenga `reporte.ver` sobre todo el sistema,
    no debe verlo. Desde `enviado` el reporte es una entrega y lo ve cualquiera con
    `reporte.ver` sobre la unidad.
    """

    unidades_que_ve: frozenset[str] | None
    unidades_con_trabajo: frozenset[str] | None

    def ve(self, unidad: str, estado: str) -> bool:
        if not _incluye(self.unidades_que_ve, unidad):
            return False
        return estados.esta_entregado(estado) or _incluye(self.unidades_con_trabajo, unidad)


def _union(*conjuntos: frozenset[str] | None) -> frozenset[str] | None:
    if any(c is None for c in conjuntos):
        return None
    return frozenset().union(*conjuntos)


def visibilidad_de(sesion: Sesion) -> Visibilidad:
    return Visibilidad(
        # Dirección mira todo el hospital, pero solo lo entregado: `unidades_con_trabajo`
        # sigue siendo lo suyo, así que un borrador sigue sin verse.
        unidades_que_ve=None if sesion.ve_monitoreo else sesion.unidades_con(permisos.REPORTE_VER),
        unidades_con_trabajo=_union(
            sesion.unidades_con(permisos.REPORTE_CARGAR),
            sesion.unidades_con(permisos.REPORTE_REVISAR),
        ),
    )


# ------------------------------------------------------------------ recibidos

VALIDADA = "validada"
SIN_VALIDAR = "sin_validar"
DESACTUALIZADA = "desactualizada"

ESTADOS_DE_RECEPCION = (VALIDADA, SIN_VALIDAR, DESACTUALIZADA)


@dataclass(frozen=True)
class RemisionVista:
    """Lo que importa de una remisión para resumir lo que recibió una oficina."""

    es_vigente: bool
    es_sin_validar: bool


def estado_de_recepcion(remisiones: Iterable[RemisionVista]) -> str:
    """Cómo está lo que **una oficina** recibió de un reporte, a partir de todas sus
    remisiones a esa oficina:

    - `validada`: hay una remisión vigente y validada (desde el 12/10/2026, todas: el
      envío entrega a la matriz lo que el bot ya validó);
    - `sin_validar`: solo hay vigentes de entrega inmediata, todavía sin verificar. Ya no
      se produce; queda para una base sin `bd/flujo/01_entrega_directa.sql`;
    - `desactualizada`: ninguna vigente: el reporte se reabrió para rectificar y lo que
      la oficina tiene es de una versión anterior.

    La oficina no ve el estado del reporte (un borrador de rectificación no es asunto
    suyo): ve esto, que es lo que puede usar con confianza.
    """
    vistas = list(remisiones)
    if not vistas:
        raise ValueError("Una recepción sin remisiones no existe: no se puede resumir.")
    vigentes = [r for r in vistas if r.es_vigente]
    if any(not r.es_sin_validar for r in vigentes):
        return VALIDADA
    if vigentes:
        return SIN_VALIDAR
    return DESACTUALIZADA


# ------------------------------------------------------------ filtros de periodo


def tope_de_periodo(hasta: str | None, hoy: date) -> str:
    """El último periodo que la lista puede mostrar: nunca uno posterior al vigente. La
    vista trae los doce meses del año, y en septiembre octubre a diciembre saldrían como
    «pendientes» de algo que todavía no se puede reportar."""
    vigente = periodos.periodo_vigente(hoy)
    return vigente if hasta is None else min(hasta, vigente)


def comprobar_rango(desde: str | None, hasta: str | None) -> None:
    if desde is not None and hasta is not None and desde > hasta:
        raise RangoInvalido(
            f"El rango está al revés: «desde» ({desde}) es posterior a «hasta» ({hasta}).",
            desde=desde,
            hasta=hasta,
        )


def rango_pedido(periodo: str | None, desde: str | None, hasta: str | None) -> tuple[str | None, str | None]:
    """De los tres filtros de periodo a un rango `(desde, hasta)`, abierto si falta un
    extremo.

    `periodo` es un mes exacto y no se combina con `desde`/`hasta`: mezclarlos no tiene
    un significado evidente y callar cuál ganó escondería un error de quien consulta."""
    if periodo is not None:
        if desde is not None or hasta is not None:
            raise FiltrosIncompatibles(
                "«periodo» no se combina con «desde» ni «hasta»: use uno u otro.",
                periodo=periodo,
                desde=desde,
                hasta=hasta,
            )
        desde = hasta = periodo
    comprobar_rango(desde, hasta)
    return desde, hasta


# ------------------------------------------------------------------- paginación


def desplazamiento(pagina: int, por_pagina: int) -> int:
    return (pagina - 1) * por_pagina


def total_de_paginas(total: int, por_pagina: int) -> int:
    """Al menos una: una lista vacía tiene una página vacía, no cero páginas."""
    return max(1, ceil(total / por_pagina))
