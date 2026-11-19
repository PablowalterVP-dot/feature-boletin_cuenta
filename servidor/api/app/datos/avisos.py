"""Lo que los avisos necesitan y las listas no traen: cuándo cambió de estado cada reporte.

Solo lectura. La lista de reportes da la fecha de envío y la de validación, pero no la de
una remisión ni la de una rectificación; las dos están en el historial que llenan los
disparadores de la base (`fecha_creacion`), que es la misma fecha que muestra el detalle.
"""

from datetime import datetime

from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Formato, Periodo, Reporte, ReporteHistorialEstado


def ultimo_cambio(bd: Session, reportes: list[tuple[str, str]]) -> dict[tuple[str, str], datetime]:
    """Para cada `(formato, periodo)` pedido, la fecha de su último cambio de estado. Un
    reporte sin historial (o que no existe) no aparece en el resultado: su fecha no se
    conoce, y no se rellena con otra."""
    if not reportes:
        return {}
    pedidos = [(f.upper(), int(p[:4]), int(p[5:])) for f, p in reportes]
    filas = bd.execute(
        select(Formato.codigo, Periodo.anio, Periodo.mes, func.max(ReporteHistorialEstado.fecha_creacion))
        .select_from(ReporteHistorialEstado)
        .join(Reporte, Reporte.id == ReporteHistorialEstado.reporte_id)
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .where(
            vigente(ReporteHistorialEstado), vigente(Reporte),
            tuple_(func.upper(Formato.codigo), Periodo.anio, Periodo.mes).in_(pedidos),
        )
        .group_by(Formato.codigo, Periodo.anio, Periodo.mes)
    ).all()
    return {(codigo.upper(), f"{anio:04d}-{mes:02d}"): fecha for codigo, anio, mes, fecha in filas}
