"""Consultas y escrituras sobre `reporte.*` que necesitan las transiciones.

Solo acceso a datos: nada de reglas de negocio (esas están en `dominio/transiciones.py`)
ni de permisos (eso lo decide el servicio). Todas las consultas excluyen lo eliminado
lógicamente con `vigente()`.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as insertar_pg
from sqlalchemy.orm import Session, aliased

from app.datos.base import vigente
from app.datos.modelos import (
    Carga,
    Destino,
    EstadoReporte,
    Formato,
    Hallazgo,
    Periodo,
    Permiso,
    Remision,
    Reporte,
    ReporteHistorialEstado,
    TransicionEstado,
    UnidadOrganica,
)
from app.dominio.transiciones import HallazgoVisto, TransicionBD


def buscar_formato(bd: Session, codigo: str) -> tuple[Formato, UnidadOrganica] | None:
    """El formato por su código (`NUT`, sin distinguir mayúsculas) y su unidad."""
    fila = bd.execute(
        select(Formato, UnidadOrganica)
        .join(UnidadOrganica, UnidadOrganica.id == Formato.unidad_organica_id)
        .where(func.upper(Formato.codigo) == codigo.strip().upper(), vigente(Formato), vigente(UnidadOrganica))
    ).first()
    return (fila[0], fila[1]) if fila else None


def buscar_periodo(bd: Session, anio: int, mes: int) -> Periodo | None:
    return bd.scalar(select(Periodo).where(Periodo.anio == anio, Periodo.mes == mes, vigente(Periodo)))


def leer_transiciones(bd: Session) -> list[TransicionBD]:
    """`reporte.transicion_estado` con los códigos: la fuente de verdad de qué se
    puede hacer y qué permiso exige cada acción."""
    origen, destino = aliased(EstadoReporte), aliased(EstadoReporte)
    filas = bd.execute(
        select(TransicionEstado.accion, origen.codigo, destino.codigo, Permiso.codigo)
        .join(origen, origen.id == TransicionEstado.estado_origen_id)
        .join(destino, destino.id == TransicionEstado.estado_destino_id)
        .join(Permiso, Permiso.id == TransicionEstado.permiso_id)
        .where(vigente(TransicionEstado), vigente(origen), vigente(destino), vigente(Permiso))
    ).all()
    return [TransicionBD(accion, o, d, p) for accion, o, d, p in filas]


def ids_de_estados(bd: Session) -> dict[str, int]:
    return dict(bd.execute(select(EstadoReporte.codigo, EstadoReporte.id).where(vigente(EstadoReporte))).all())


def bloquear_reporte(bd: Session, formato_id: int, periodo_id: int) -> Reporte | None:
    """El reporte vigente del formato y periodo, **bloqueando su fila**
    (`SELECT … FOR UPDATE`) hasta el fin de la transacción.

    Dos personas de Estadística que validen o remitan a la vez ya no se pisan: la
    segunda espera, ve el estado nuevo y recibe un 409 en lugar de repetir la
    acción. `populate_existing` obliga a leer el estado actual aunque la sesión ya
    tuviera el objeto en memoria.
    """
    return bd.scalar(
        select(Reporte)
        .where(Reporte.formato_id == formato_id, Reporte.periodo_id == periodo_id, vigente(Reporte))
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def insertar_reporte_si_no_existe(bd: Session, formato_id: int, periodo_id: int, estado_id: int) -> Reporte | None:
    """Crea el reporte, o devuelve `None` si alguien lo creó antes.

    `ON CONFLICT DO NOTHING` sobre el índice único parcial `(formato, periodo)`: si dos
    personas abren el mismo periodo a la vez, una lo crea y la otra recibe `None`, sin
    excepción de integridad.
    """
    nuevo_id = bd.execute(
        insertar_pg(Reporte)
        .values(formato_id=formato_id, periodo_id=periodo_id, estado_reporte_id=estado_id, numero_rectificacion=0)
        .on_conflict_do_nothing(index_elements=[Reporte.formato_id, Reporte.periodo_id], index_where=Reporte.fecha_eliminacion.is_(None))
        .returning(Reporte.id)
    ).scalar()
    return bd.get(Reporte, nuevo_id) if nuevo_id is not None else None


def carga_aceptada_vigente(bd: Session, reporte: Reporte) -> Carga | None:
    """La carga que dio origen a los valores del reporte: aceptada, vigente y con la
    estructura reconocida. Sin ella no hay nada que enviar."""
    if reporte.formato_version_id is None:
        return None
    return bd.scalar(
        select(Carga).where(
            Carga.reporte_id == reporte.id, Carga.es_vigente, Carga.resultado == "aceptada", vigente(Carga)
        )
    )


def hallazgos_de(bd: Session, carga_id: int) -> list[HallazgoVisto]:
    filas = bd.execute(
        select(Hallazgo.clave_hallazgo, Hallazgo.nivel, Hallazgo.titulo, Hallazgo.justificacion)
        .where(Hallazgo.carga_id == carga_id, vigente(Hallazgo))
        .order_by(Hallazgo.id)
    ).all()
    return [HallazgoVisto(clave, nivel, titulo, justificacion) for clave, nivel, titulo, justificacion in filas]


@dataclass(frozen=True)
class DestinoDeMatriz:
    unidad_id: int
    clave: str
    es_entrega_inmediata: bool


def matriz_de(bd: Session, unidad_origen_id: int, hoy: date) -> list[DestinoDeMatriz]:
    """A qué oficinas va el reporte de una unidad, además de Estadística, según la
    matriz **vigente hoy** (la matriz tiene vigencia para no reescribir el pasado)."""
    filas = bd.execute(
        select(UnidadOrganica.id, UnidadOrganica.clave, Destino.es_entrega_inmediata)
        .join(Destino, Destino.unidad_destino_id == UnidadOrganica.id)
        .where(
            Destino.unidad_origen_id == unidad_origen_id,
            vigente(Destino),
            vigente(UnidadOrganica),
            UnidadOrganica.es_activo,
            Destino.fecha_inicio_vigencia <= hoy,
            or_(Destino.fecha_fin_vigencia.is_(None), Destino.fecha_fin_vigencia >= hoy),
        )
        .order_by(UnidadOrganica.clave)
    ).all()
    return [DestinoDeMatriz(uid, clave, inmediata) for uid, clave, inmediata in filas]


def unidades_receptoras(bd: Session, claves: list[str]) -> dict[str, int]:
    """De las claves pedidas, las que son una oficina receptora activa **del hospital**.

    Quedan fuera Estadística (siempre recibe y no figura como destino) y las entidades
    externas: DIRESA está sembrada como receptora, pero lo que se le envía es el
    consolidado del periodo (`remision_externa`), no un reporte de un área.
    """
    filas = bd.execute(
        select(UnidadOrganica.clave, UnidadOrganica.id).where(
            UnidadOrganica.clave.in_(claves), UnidadOrganica.es_receptora, UnidadOrganica.es_activo, ~UnidadOrganica.es_estadistica, ~UnidadOrganica.es_externa, vigente(UnidadOrganica)
        )
    ).all()
    return dict(filas)


def superar_remisiones(bd: Session, reporte_id: int) -> int:
    """Marca como no vigentes las remisiones vigentes del reporte y devuelve cuántas: una
    rectificación deja desactualizado todo lo entregado."""
    condicion = [Remision.reporte_id == reporte_id, Remision.es_vigente, vigente(Remision)]
    resultado = bd.execute(update(Remision).where(and_(*condicion)).values(es_vigente=False))
    return resultado.rowcount or 0


def destinos_con_remision_vigente(bd: Session, reporte_id: int) -> frozenset[str]:
    """Las claves de las oficinas que hoy tienen una remisión **vigente** del reporte
    (entrega inmediata o validada). Tras una rectificación no queda ninguna hasta que
    se vuelva a enviar."""
    return frozenset(
        bd.scalars(
            select(UnidadOrganica.clave)
            .join(Remision, Remision.unidad_destino_id == UnidadOrganica.id)
            .where(Remision.reporte_id == reporte_id, Remision.es_vigente, vigente(Remision), vigente(UnidadOrganica))
        ).all()
    )


def historial_de(bd: Session, reporte_id: int) -> list[tuple]:
    """La línea de tiempo, de la más antigua a la más reciente:
    (acción, origen, destino, n.º de rectificación, comentario, fecha)."""
    origen, destino = aliased(EstadoReporte), aliased(EstadoReporte)
    return list(
        bd.execute(
            select(
                ReporteHistorialEstado.accion, origen.codigo, destino.codigo, ReporteHistorialEstado.numero_rectificacion,
                ReporteHistorialEstado.comentario, ReporteHistorialEstado.fecha_creacion,
            )
            .outerjoin(origen, origen.id == ReporteHistorialEstado.estado_origen_id)
            .join(destino, destino.id == ReporteHistorialEstado.estado_destino_id)
            .where(ReporteHistorialEstado.reporte_id == reporte_id, vigente(ReporteHistorialEstado))
            .order_by(ReporteHistorialEstado.id)
        ).all()
    )


def remisiones_de(bd: Session, reporte_id: int) -> list[tuple]:
    """Todas las remisiones del reporte, vigentes o superadas:
    (destino, sin validar, vigente, n.º de rectificación, fecha)."""
    return list(
        bd.execute(
            select(UnidadOrganica.clave, Remision.es_sin_validar, Remision.es_vigente, Remision.numero_rectificacion, Remision.fecha_remision)
            .join(UnidadOrganica, UnidadOrganica.id == Remision.unidad_destino_id)
            .where(Remision.reporte_id == reporte_id, vigente(Remision))
            .order_by(Remision.id)
        ).all()
    )
