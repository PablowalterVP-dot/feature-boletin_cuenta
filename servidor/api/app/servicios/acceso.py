"""Quién puede **leer** un reporte concreto: su detalle, sus casillas y su revisión.

Dos caminos, y basta uno:

1. **Quien trabaja o vigila el área**: `reporte.ver` sobre la unidad del reporte, con
   la regla de siempre (lo que no salió del área, solo quien lo trabaja; ver
   `dominio.consultas.Visibilidad`).
2. **La oficina que lo recibió**: una remisión **vigente** del reporte hacia una
   unidad donde la cuenta tiene `reporte.ver`. Es lo que pide el modelo desde el
   avance 01: la oficina ve lo que se le remite. Planeamiento, con `consulta` sobre
   su propia unidad, no tiene `reporte.ver` sobre Nutrición, y aun así debe poder
   leer el reporte que Nutrición le entregó.

   Tras una rectificación sus remisiones dejan de estar vigentes y la oficina **pierde
   la lectura hasta el reenvío**: la base no guarda una copia de lo remitido, así que
   lo que vería serían cifras a medio corregir (decisión del 28/09/2026).

Orden de las comprobaciones: el formato (404) va primero. Sin `reporte.ver` sobre la
unidad, cualquier otra falta —periodo inexistente, sin reporte, sin remisión— responde
el **mismo 403**, para no revelar qué existe a quien no puede verlo. Con el permiso, el
periodo inexistente es 404, como antes.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datos import reportes as repo
from app.datos.base import vigente
from app.datos.modelos import Formato, Periodo, Reporte, UnidadOrganica
from app.dominio import estados, periodos, permisos
from app.dominio.consultas import visibilidad_de
from app.dominio.sesion import Sesion
from app.servicios.errores import NoEncontrado, SinPermiso


# ------------------------------------------------------------------- búsquedas
# Viven aquí (y no en `transiciones.py`, que las reexporta) porque las usan todos los
# servicios de un reporte, incluido este, y `transiciones` a su vez usa este módulo.


def _partir_periodo(periodo: str) -> tuple[int, int]:
    if not periodos.es_periodo(periodo):
        raise NoEncontrado(f"«{periodo}» no es un periodo válido (AAAA-MM).", que="periodo")
    anio, mes = periodo.split("-")
    return int(anio), int(mes)


def buscar_formato_y_unidad(bd: Session, codigo_formato: str):
    encontrado = repo.buscar_formato(bd, codigo_formato)
    if encontrado is None:
        raise NoEncontrado(f"No existe el formato «{codigo_formato}».", que="formato")
    return encontrado


def buscar_periodo(bd: Session, periodo: str):
    anio, mes = _partir_periodo(periodo)
    fila = repo.buscar_periodo(bd, anio, mes)
    if fila is None:
        raise NoEncontrado(f"El periodo {periodo} no está registrado.", que="periodo")
    return fila


# ------------------------------------------------------------------- lectura


@dataclass(frozen=True)
class ReporteLegible:
    """Lo que ya se buscó para decidir: el que llama no lo vuelve a consultar."""

    formato: Formato
    unidad: UnidadOrganica
    periodo: Periodo
    reporte: Reporte | None
    estado: str
    por_remision: bool  # entra como oficina receptora, no por permiso sobre el área


def _nombre(unidad: UnidadOrganica) -> str:
    return unidad.nombre_corto or unidad.nombre


def _sin_permiso(unidad: UnidadOrganica) -> SinPermiso:
    return SinPermiso(f"Su cuenta no puede ver los reportes de {_nombre(unidad)}.", permiso=permisos.REPORTE_VER, unidad=unidad.clave)


def _reporte_de(bd: Session, formato_id: int, periodo_id: int) -> Reporte | None:
    return bd.scalar(select(Reporte).where(Reporte.formato_id == formato_id, Reporte.periodo_id == periodo_id, vigente(Reporte)))


def reporte_legible(bd: Session, sesion: Sesion, *, formato: str, periodo: str) -> ReporteLegible:
    el_formato, la_unidad = buscar_formato_y_unidad(bd, formato)
    codigo_de = {v: k for k, v in repo.ids_de_estados(bd).items()}

    # 1. Quien trabaja o vigila el área.
    if sesion.puede(permisos.REPORTE_VER, la_unidad.clave) or sesion.ve_monitoreo:
        el_periodo = buscar_periodo(bd, periodo)
        reporte = _reporte_de(bd, el_formato.id, el_periodo.id)
        estado = codigo_de[reporte.estado_reporte_id] if reporte else estados.NO_INICIADO
        if not visibilidad_de(sesion).ve(la_unidad.clave, estado):
            raise SinPermiso(
                f"El reporte de {_nombre(la_unidad)} todavía no salió del área que lo prepara.",
                permiso=permisos.REPORTE_VER, unidad=la_unidad.clave,
            )
        return ReporteLegible(el_formato, la_unidad, el_periodo, reporte, estado, por_remision=False)

    # 2. La oficina que lo recibió. Cualquier falta es el mismo 403.
    if not sesion.puede_en_alguna(permisos.REPORTE_VER):
        raise _sin_permiso(la_unidad)
    try:
        el_periodo = buscar_periodo(bd, periodo)
    except NoEncontrado:
        raise _sin_permiso(la_unidad) from None
    reporte = _reporte_de(bd, el_formato.id, el_periodo.id)
    if reporte is None:
        raise _sin_permiso(la_unidad)
    estado = codigo_de[reporte.estado_reporte_id]
    oficinas = sesion.unidades_con(permisos.REPORTE_VER)  # no es None: sin permiso global aquí
    if not estados.esta_entregado(estado) or not (repo.destinos_con_remision_vigente(bd, reporte.id) & (oficinas or frozenset())):
        raise _sin_permiso(la_unidad)
    return ReporteLegible(el_formato, la_unidad, el_periodo, reporte, estado, por_remision=True)
