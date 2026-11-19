"""Qué meses tiene cada área en **esta** base, y con qué archivo.

Existe porque cada integrante del equipo cargó meses en su propia base
(22/10/2026) y nadie podía decir cuál tenía qué: Farmacia y Hemodiálisis
«tenían histórico», pero no en la base del servidor. Lo usan el panel
«Cobertura» del superadministrador (`GET /api/admin/cobertura`) y la
herramienta `inventario`, que lo imprime para cualquier base y lo guarda en
JSON para compararlo con el de otra.

La huella SHA-256 del archivo vigente es lo que permite comparar dos bases sin
mirar cifra por cifra: el mismo Excel en las dos da la misma huella; si
difieren, alguien subió un archivo distinto para ese mes.

Un mes sin reporte es `no_iniciado` (no se guarda nada: su ausencia es el
estado). Un mes cuyo único reporte se eliminó es `eliminado`: alguien lo borró
a propósito, y no es lo mismo que nunca haberlo cargado.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Archivo, Carga, EstadoReporte, Formato, Periodo, Reporte
from app.dominio import estados, periodos
from app.servicios.admin import _formatos_por_unidad, _unidades_reportantes

ELIMINADO = "eliminado"
HISTORICA = "Carga histórica"


@dataclass(frozen=True)
class Mes:
    periodo: str
    estado: str  # no_iniciado, borrador, remitido… o eliminado
    esperado: bool  # ya debía estar entregado (anterior al periodo vigente, o el vigente)
    archivo: str | None = None
    huella: str | None = None
    historica: bool = False
    fecha_envio: str | None = None


def _filas(bd: Session, anio: int):
    """Cada reporte del año (eliminados incluidos), con su carga vigente si la tiene."""
    return bd.execute(
        select(
            Formato.unidad_organica_id, Periodo.mes, EstadoReporte.codigo, Reporte.fecha_eliminacion,
            Reporte.fecha_envio, Reporte.observacion, Archivo.nombre_original, Archivo.huella_sha256,
        )
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .join(EstadoReporte, EstadoReporte.id == Reporte.estado_reporte_id)
        .outerjoin(Carga, and_(Carga.reporte_id == Reporte.id, Carga.es_vigente, Carga.resultado == "aceptada", vigente(Carga)))
        .outerjoin(Archivo, Archivo.id == Carga.archivo_id)
        .where(Periodo.anio == anio, vigente(Formato))
    ).all()


def cobertura(bd: Session, anio: int, hoy: date) -> dict:
    vigente_p = periodos.periodo_vigente(hoy)
    meses = [f"{anio:04d}-{m:02d}" for m in range(1, 13)]
    formatos = _formatos_por_unidad(bd)

    por_celda: dict[tuple[int, int], Mes] = {}
    for f in _filas(bd, anio):
        periodo = f"{anio:04d}-{f.mes:02d}"
        clave = (f.unidad_organica_id, f.mes)
        if f.fecha_eliminacion is not None:
            # Uno eliminado solo cuenta si el mes no tiene otro vigente.
            por_celda.setdefault(clave, Mes(periodo, ELIMINADO, periodo <= vigente_p))
            continue
        por_celda[clave] = Mes(
            periodo, f.codigo, periodo <= vigente_p, archivo=f.nombre_original, huella=f.huella_sha256,
            historica=(f.observacion or "").startswith(HISTORICA),
            fecha_envio=f.fecha_envio.isoformat() if f.fecha_envio else None,
        )

    areas = []
    for u in _unidades_reportantes(bd):
        formato = formatos.get(u.id)
        celdas = [por_celda.get((u.id, int(p[5:])), Mes(p, estados.NO_INICIADO, p <= vigente_p)) for p in meses]
        esperados = [c for c in celdas if c.esperado]
        areas.append({
            "clave": u.clave,
            "nombre": u.nombre_corto or u.nombre,
            "codigo_unidad": u.codigo,
            "formato": formato.codigo if formato else None,
            "version_activa": formato.version_activa if formato else None,
            "meses": [c.__dict__ for c in celdas],
            "remitidos": sum(c.estado == estados.REMITIDO for c in esperados),
            "en_borrador": sum(c.estado == estados.BORRADOR for c in esperados),
            "faltan": sum(c.estado in (estados.NO_INICIADO, ELIMINADO) for c in esperados),
            "esperados": len(esperados),
        })
    return {"anio": anio, "periodo_vigente": vigente_p, "meses": meses, "areas": areas}
