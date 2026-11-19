"""El consolidado anual de un formato: el total de cada cuadro, mes por mes.

Es lo que el bot convierte en el «TOTAL» de Nutrición (areas/nutricion/
consolidado.js): antes el área lo copiaba a mano de sus nueve Excel. Aquí se
suma desde `reporte.valor`, la única fuente: nada se guarda aparte, así que
el consolidado no puede quedar desfasado de los meses.

Solo cuentan los reportes **entregados** (enviado, en revisión, validado,
remitido): un borrador no salió del área. Un mes sin reporte entregado no
aparece; quien lo pinta lo deja vacío, no en cero.
"""

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import EstadoReporte, Indicador, Periodo, Reporte, Valor
from app.dominio import estados, permisos
from app.dominio.sesion import Sesion
from app.servicios.acceso import buscar_formato_y_unidad
from app.servicios.errores import SinPermiso


@dataclass(frozen=True)
class MesDelConsolidado:
    periodo: str
    estado: str
    totales: dict[str, int]  # por cuadro: {"f1": 23255, …}


@dataclass(frozen=True)
class Consolidado:
    formato: str
    unidad: str
    anio: int
    meses: list[MesDelConsolidado]


def consolidado(bd: Session, sesion: Sesion, *, formato: str, anio: int) -> Consolidado:
    el_formato, la_unidad = buscar_formato_y_unidad(bd, formato)
    if not sesion.puede(permisos.REPORTE_VER, la_unidad.clave):
        raise SinPermiso(f"Su cuenta no puede ver los reportes de {la_unidad.nombre_corto or la_unidad.nombre}.", permiso=permisos.REPORTE_VER, unidad=la_unidad.clave)

    cuadro = func.split_part(Indicador.codigo, ".", 1)
    filas = bd.execute(
        select(Periodo.mes, EstadoReporte.codigo, cuadro, func.sum(Valor.valor))
        .join(Reporte, Reporte.periodo_id == Periodo.id)
        .join(EstadoReporte, EstadoReporte.id == Reporte.estado_reporte_id)
        .join(Valor, Valor.reporte_id == Reporte.id)
        .join(Indicador, Indicador.id == Valor.indicador_id)
        .where(Reporte.formato_id == el_formato.id, Periodo.anio == anio, vigente(Reporte), vigente(Periodo), vigente(Valor))
        .group_by(Periodo.mes, EstadoReporte.codigo, cuadro)
        .order_by(Periodo.mes)
    ).all()

    por_mes: dict[int, dict] = defaultdict(lambda: {"estado": None, "totales": {}})
    for mes, estado, codigo_cuadro, suma in filas:
        if not estados.esta_entregado(estado):
            continue
        por_mes[mes]["estado"] = estado
        por_mes[mes]["totales"][codigo_cuadro] = int(suma or 0)

    return Consolidado(
        formato=el_formato.codigo, unidad=la_unidad.clave, anio=anio,
        meses=[MesDelConsolidado(f"{anio:04d}-{mes:02d}", d["estado"], d["totales"]) for mes, d in sorted(por_mes.items())],
    )
