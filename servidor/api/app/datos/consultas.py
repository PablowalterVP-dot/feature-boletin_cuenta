"""Las listas de reportes: consultas de solo lectura.

Solo acceso a datos. Lo que **decide** (quién ve qué, cómo se resume una recepción) está
en `dominio/consultas.py`; aquí se traduce a SQL para que el filtrado ocurra en la base y
el total y las páginas salgan correctos: filtrar en Python una página ya cortada dejaría
páginas medio vacías y un total que miente.

Dos consultas con el mismo cuidado: nunca mezclan lo eliminado lógicamente (`vigente()`).
"""

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import and_, case, false, func, or_, select, true, tuple_
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Cumplimiento, Formato, Periodo, Remision, Reporte, UnidadOrganica
from app.dominio import consultas as reglas
from app.dominio.consultas import Visibilidad


def _periodo_de(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def _anio_mes(periodo: str) -> tuple[int, int]:
    anio, mes = periodo.split("-")
    return int(anio), int(mes)


def _unidad_en(unidades: frozenset[str] | None):
    """`None` = todas las unidades; un conjunto vacío = ninguna."""
    if unidades is None:
        return true()
    if not unidades:
        return false()
    return UnidadOrganica.clave.in_(unidades)


# ------------------------------------------------------------ lista de reportes


@dataclass(frozen=True)
class FilaDeCumplimiento:
    """Un periodo × formato, exista o no el reporte.

    `unidad_codigo` (NUT, NEF, LAV…) es el código de la UNIDAD, no del formato:
    existe para las diez áreas desde la semilla, aunque todavía no tengan
    formato propio (Nefrología, Lavandería). Es la identidad que usa el plazo
    real por área (`dominio/plazos.py`) — el código del formato podría no
    coincidir el día que se cree, y ese desalineo sería silencioso."""

    periodo: str
    formato: str
    formato_nombre: str
    unidad: str
    unidad_codigo: str
    unidad_nombre: str
    estado: str
    fecha_limite: date
    fecha_envio: datetime | None
    fecha_validacion: datetime | None
    numero_rectificacion: int
    folio_constancia: str | None


def listar_cumplimiento(
    bd: Session,
    visibilidad: Visibilidad,
    *,
    desde: str | None,
    hasta: str,
    formato: str | None,
    estados: tuple[str, ...] | None,
    desplazamiento: int,
    limite: int,
) -> tuple[int, list[FilaDeCumplimiento]]:
    """Filas de `reporte.v_cumplimiento` (una por periodo × formato activo, con o sin
    reporte) que la persona puede ver, más recientes primero. Devuelve `(total, página)`.

    La visibilidad es la de `Visibilidad.ve`, escrita en SQL: una unidad que no se ve, no
    aparece; un reporte que no ha salido del área (no iniciado, borrador) solo aparece
    donde la persona trabaja. Una prueba compara ambas versiones fila por fila.
    """
    en_estados = Cumplimiento.estado.in_(reglas.ESTADOS_ENTREGADOS)
    condiciones = [
        vigente(UnidadOrganica),
        _unidad_en(visibilidad.unidades_que_ve),
        or_(en_estados, _unidad_en(visibilidad.unidades_con_trabajo)),
        tuple_(Cumplimiento.anio, Cumplimiento.mes) <= tuple_(*_anio_mes(hasta)),
    ]
    if desde is not None:
        condiciones.append(tuple_(Cumplimiento.anio, Cumplimiento.mes) >= tuple_(*_anio_mes(desde)))
    if formato is not None:
        condiciones.append(func.upper(Cumplimiento.formato_codigo) == formato.strip().upper())
    if estados is not None:
        condiciones.append(Cumplimiento.estado.in_(estados))

    base = (
        select(
            Cumplimiento.anio, Cumplimiento.mes, Cumplimiento.formato_codigo, Formato.nombre, UnidadOrganica.clave, UnidadOrganica.codigo,
            func.coalesce(UnidadOrganica.nombre_corto, UnidadOrganica.nombre), Cumplimiento.estado,
            Cumplimiento.fecha_limite_entrega, Cumplimiento.fecha_envio, Reporte.fecha_validacion,
            func.coalesce(Reporte.numero_rectificacion, 0), Reporte.folio_constancia,
        )
        .select_from(Cumplimiento)
        .join(Formato, Formato.id == Cumplimiento.formato_id)
        .join(UnidadOrganica, UnidadOrganica.id == Formato.unidad_organica_id)
        .outerjoin(Reporte, Reporte.id == Cumplimiento.reporte_id)
        .where(*condiciones)
    )
    total = bd.scalar(select(func.count()).select_from(base.subquery())) or 0
    filas = bd.execute(
        base.order_by(Cumplimiento.anio.desc(), Cumplimiento.mes.desc(), Cumplimiento.formato_codigo, Cumplimiento.formato_id)
        .offset(desplazamiento)
        .limit(limite)
    ).all()
    return total, [FilaDeCumplimiento(_periodo_de(f[0], f[1]), *f[2:]) for f in filas]


# ----------------------------------------------------------------------- recibidos


@dataclass(frozen=True)
class RemisionRecibida:
    es_sin_validar: bool
    es_vigente: bool
    numero_rectificacion: int
    fecha: datetime


@dataclass(frozen=True)
class ReporteRecibido:
    """Un reporte que una oficina recibió, con **todas** sus remisiones a esa oficina."""

    periodo: str
    formato: str
    formato_nombre: str
    unidad: str
    unidad_nombre: str
    sigla: str
    remisiones: list[RemisionRecibida]


def _recepcion_por_reporte(oficina_id: int):
    """Una fila por reporte remitido a la oficina, con qué tiene vigente. Es la versión
    en SQL de `dominio.consultas.estado_de_recepcion`; una prueba las compara."""
    return (
        select(
            Remision.reporte_id.label("reporte_id"),
            func.bool_or(and_(Remision.es_vigente, ~Remision.es_sin_validar)).label("hay_validada"),
            func.bool_or(and_(Remision.es_vigente, Remision.es_sin_validar)).label("hay_sin_validar"),
        )
        .where(Remision.unidad_destino_id == oficina_id, vigente(Remision))
        .group_by(Remision.reporte_id)
        .subquery()
    )


def listar_recibidos(
    bd: Session,
    oficina_id: int,
    *,
    desde: str | None,
    hasta: str | None,
    formato: str | None,
    estado_de_recepcion: str | None,
    desplazamiento: int,
    limite: int,
) -> tuple[int, list[ReporteRecibido]]:
    """Los reportes que le remitieron a una oficina, uno por reporte (aunque tenga varias
    remisiones: una entrega inmediata y luego la validada, o una tras cada rectificación),
    más recientes primero. Devuelve `(total, página)`.

    Parte de las **remisiones**: un borrador no tiene ninguna, así que nunca aparece.
    """
    recepcion = _recepcion_por_reporte(oficina_id)
    resumen = case(
        (recepcion.c.hay_validada, reglas.VALIDADA),
        (recepcion.c.hay_sin_validar, reglas.SIN_VALIDAR),
        else_=reglas.DESACTUALIZADA,
    )
    origen = UnidadOrganica
    condiciones = [vigente(Reporte), vigente(Periodo), vigente(Formato), vigente(origen)]
    if desde is not None:
        condiciones.append(tuple_(Periodo.anio, Periodo.mes) >= tuple_(*_anio_mes(desde)))
    if hasta is not None:
        condiciones.append(tuple_(Periodo.anio, Periodo.mes) <= tuple_(*_anio_mes(hasta)))
    if formato is not None:
        condiciones.append(func.upper(Formato.codigo) == formato.strip().upper())
    if estado_de_recepcion is not None:
        condiciones.append(resumen == estado_de_recepcion)

    base = (
        select(Reporte.id, Periodo.anio, Periodo.mes, Formato.codigo, Formato.nombre, origen.clave, func.coalesce(origen.nombre_corto, origen.nombre), origen.codigo)
        .select_from(recepcion)
        .join(Reporte, Reporte.id == recepcion.c.reporte_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(origen, origen.id == Formato.unidad_organica_id)
        .where(*condiciones)
    )
    total = bd.scalar(select(func.count()).select_from(base.subquery())) or 0
    filas = bd.execute(base.order_by(Periodo.anio.desc(), Periodo.mes.desc(), Formato.codigo, Reporte.id).offset(desplazamiento).limit(limite)).all()

    remisiones: dict[int, list[RemisionRecibida]] = {f[0]: [] for f in filas}
    if remisiones:
        for reporte_id, sin_validar, es_vigente, n, fecha in bd.execute(
            select(Remision.reporte_id, Remision.es_sin_validar, Remision.es_vigente, Remision.numero_rectificacion, Remision.fecha_remision)
            .where(Remision.reporte_id.in_(remisiones), Remision.unidad_destino_id == oficina_id, vigente(Remision))
            .order_by(Remision.id)
        ):
            remisiones[reporte_id].append(RemisionRecibida(sin_validar, es_vigente, n, fecha))
    return total, [
        ReporteRecibido(_periodo_de(f[1], f[2]), f[3], f[4], f[5], f[6], f[7], remisiones[f[0]]) for f in filas
    ]
