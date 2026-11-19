"""Endpoints de las oficinas.

    GET /api/oficinas/{clave}/recibidos     lo que la oficina recibió, un elemento por reporte

`clave` es la clave de la unidad (`planeamiento`), no su sigla.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencias import sesion_actual
from app.datos.sesion import obtener_sesion_bd
from app.dominio import consultas as reglas_de_consulta
from app.dominio.sesion import Sesion
from app.servicios import consultas as servicio

router = APIRouter(prefix="/oficinas", tags=["oficinas"])

_CLAVE = Path(pattern="^[a-z0-9-]{1,60}$", description="Clave de la oficina, p. ej. planeamiento.")
_PATRON_PERIODO = "^[0-9]{4}-(0[1-9]|1[0-2])$"
_PATRON_FORMATO = "^[A-Za-z0-9_-]{1,30}$"
_PATRON_RECEPCION = "^(" + "|".join(reglas_de_consulta.ESTADOS_DE_RECEPCION) + ")$"


class RemisionRecibida(BaseModel):
    constancia: str = Field(description="La constancia de la versión que esta remisión entregó.")
    es_sin_validar: bool = Field(description="Entrega inmediata, antes de que Estadística verificara las cifras.")
    es_vigente: bool = Field(description="`false`: una versión posterior la superó.")
    numero_rectificacion: int
    fecha: datetime


class ReporteRecibido(BaseModel):
    periodo: str
    formato: str
    formato_nombre: str
    unidad: str
    unidad_nombre: str
    estado_de_recepcion: str = Field(
        description="validada: hay una versión verificada vigente · sin_validar: solo hay entrega inmediata sin verificar · "
        "desactualizada: el reporte se reabrió para rectificar y lo recibido es de una versión anterior."
    )
    constancia: str = Field(description="La de la remisión más reciente (la vigente, si hay).")
    remisiones: list[RemisionRecibida] = Field(description="Todas las remisiones a esta oficina, la más nueva primero.")


class RespuestaRecibidos(BaseModel):
    oficina: str
    total: int
    pagina: int
    por_pagina: int
    paginas: int
    filas: list[ReporteRecibido]


@router.get("/{clave}/recibidos", response_model=RespuestaRecibidos, summary="Lo que una oficina recibió")
def ver_recibidos(
    clave: str = _CLAVE,
    periodo: str | None = Query(default=None, pattern=_PATRON_PERIODO, description="Un mes exacto (AAAA-MM). No se combina con `desde`/`hasta`."),
    desde: str | None = Query(default=None, pattern=_PATRON_PERIODO),
    hasta: str | None = Query(default=None, pattern=_PATRON_PERIODO),
    formato: str | None = Query(default=None, pattern=_PATRON_FORMATO),
    estado_de_recepcion: str | None = Query(default=None, pattern=_PATRON_RECEPCION),
    pagina: int = Query(default=1, ge=1, le=100_000),
    por_pagina: int = Query(default=reglas_de_consulta.FILAS_POR_PAGINA, ge=1, le=reglas_de_consulta.MAXIMO_POR_PAGINA),
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(obtener_sesion_bd),
) -> RespuestaRecibidos:
    """Un elemento por **reporte** remitido a la oficina (aunque tenga varias remisiones),
    del periodo más reciente al más antiguo. Nunca un borrador: se parte de las remisiones.

    No se expone el estado del reporte —a la oficina no le importa que el área lo esté
    corrigiendo—, sino `estado_de_recepcion`: qué de lo recibido puede usar con confianza.

    Exige `reporte.ver` **sobre esa oficina** (la propia, o en todo el sistema).

    Respuestas: 404 la clave no es una oficina receptora del hospital (Estadística, DIRESA y
    las áreas que solo reportan no lo son) · 403 sin permiso sobre ella · 422 filtros inválidos.
    """
    r = servicio.listar_recibidos(
        bd, sesion, clave=clave, periodo=periodo, desde=desde, hasta=hasta, formato=formato,
        estado_de_recepcion=estado_de_recepcion, pagina=pagina, por_pagina=por_pagina,
    )
    return RespuestaRecibidos(
        oficina=r.oficina, total=r.pagina.total, pagina=r.pagina.pagina, por_pagina=r.pagina.por_pagina, paginas=r.pagina.paginas,
        filas=[
            ReporteRecibido(
                periodo=f.periodo, formato=f.formato, formato_nombre=f.formato_nombre, unidad=f.unidad, unidad_nombre=f.unidad_nombre,
                estado_de_recepcion=f.estado_de_recepcion, constancia=f.constancia,
                remisiones=[RemisionRecibida(**vars(x)) for x in f.remisiones],
            )
            for f in r.filas
        ],
    )
