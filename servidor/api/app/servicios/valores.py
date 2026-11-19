"""Las casillas de un reporte, agrupadas por cuadro e indicador.

Es lo que desbloquea la cifra de la Bandeja y del Historial en el frontend, y la
materia prima del futuro consolidado de DIRESA y el boletín; este servicio no los
calcula, solo entrega el dato en bruto de un reporte.

Mismas comprobaciones que `detalle` (`servicios/acceso.py`): lo lee quien tiene
`reporte.ver` sobre el área —y un reporte que no ha salido del área (no iniciado,
borrador) solo quien lo trabaja— o la oficina con una remisión vigente del reporte.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from itertools import groupby
from typing import Any

from sqlalchemy.orm import Session

from app.datos import valores as repo_valores
from app.dominio.sesion import Sesion
from app.servicios.acceso import reporte_legible


@dataclass(frozen=True)
class Casilla:
    """Un día (o el único dato, si el formato es mensual). El linaje solo llega
    cuando `origen == 'archivo'`."""

    dia: int | None
    fecha: date | None
    valor: Decimal | None
    texto_original: str | None
    origen: str
    hoja_excel: str | None
    celda_excel: str | None


@dataclass(frozen=True)
class IndicadorDeValores:
    """Aparece aunque no tenga ninguna casilla: `total` es `None`, no cero."""

    indicador: str
    nombre: str
    unidad_medida: str | None
    dimensiones: dict[str, Any]
    total: Decimal | None
    casillas_con_dato: int
    casillas_esperadas: int
    casillas: list[Casilla]


@dataclass(frozen=True)
class CuadroDeValores:
    cuadro: str
    titulo: str
    indicadores: list[IndicadorDeValores]


@dataclass(frozen=True)
class DetalleDeValores:
    formato: str
    unidad: str
    periodo: str
    cuadros: list[CuadroDeValores]


def valores_de(bd: Session, sesion: Sesion, *, formato: str, periodo: str) -> DetalleDeValores:
    """Las casillas del reporte de `formato` en `periodo`. Sin reporte, o sin una
    estructura activa todavía (un borrador sin carga), `cuadros` sale vacío: no hay
    nada que rellenar con ceros."""
    legible = reporte_legible(bd, sesion, formato=formato, periodo=periodo)
    el_formato, la_unidad, reporte = legible.formato, legible.unidad, legible.reporte

    if reporte is None:
        return DetalleDeValores(formato=el_formato.codigo, unidad=la_unidad.clave, periodo=periodo, cuadros=[])

    totales = repo_valores.totales_de_reporte(bd, reporte.id)
    casillas_de: dict[tuple[str, str], list[Casilla]] = {}
    for c in repo_valores.valores_de_reporte(bd, reporte.id):
        casillas_de.setdefault((c.cuadro_codigo, c.indicador_codigo), []).append(
            Casilla(c.dia, c.fecha, c.valor, c.texto_original, c.origen, c.hoja_excel, c.celda_excel)
        )

    cuadros = [
        CuadroDeValores(
            cuadro=cuadro_codigo, titulo=titulo,
            indicadores=[
                IndicadorDeValores(
                    indicador=t.indicador_codigo, nombre=t.indicador_nombre, unidad_medida=t.unidad_medida, dimensiones=t.dimensiones,
                    total=t.total, casillas_con_dato=t.casillas_con_dato, casillas_esperadas=t.casillas_esperadas,
                    casillas=casillas_de.get((t.cuadro_codigo, t.indicador_codigo), []),
                )
                for t in grupo
            ],
        )
        for (cuadro_codigo, titulo), grupo in groupby(totales, key=lambda t: (t.cuadro_codigo, t.cuadro_titulo))
    ]
    return DetalleDeValores(formato=el_formato.codigo, unidad=la_unidad.clave, periodo=periodo, cuadros=cuadros)
