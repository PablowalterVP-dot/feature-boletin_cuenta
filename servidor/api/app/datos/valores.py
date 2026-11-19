"""Las casillas de un reporte: `reporte.valor` y sus dos vistas.

Dos consultas con roles distintos, pensadas para combinarse en el servicio:

- `totales_de_reporte` da la **forma**: qué cuadros e indicadores tiene la estructura
  activa del reporte, con su total del mes y su completitud — incluidos los que no
  tienen ninguna casilla con dato (un indicador sin datos no desaparece).
- `valores_de_reporte` da las **casillas**, con su linaje, para colgarlas de esa forma.

Se unen por `(cuadro_codigo, indicador_codigo)`, únicos dentro de un mismo reporte.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Cuadro, DimensionesDeIndicador, Indicador, TotalIndicador, Valor, ValorDetalle


@dataclass(frozen=True)
class FilaDeValor:
    """Una casilla del día, con su linaje (`hoja_excel`/`celda_excel`, presentes solo
    cuando `origen == 'archivo'`). Se cuelga de su indicador por `(cuadro_codigo,
    indicador_codigo)`, que da `totales_de_reporte`."""

    cuadro_codigo: str | None
    indicador_codigo: str
    dia: int | None
    fecha: date | None
    valor: Decimal | None
    origen: str
    texto_original: str | None
    hoja_excel: str | None
    celda_excel: str | None


def valores_de_reporte(bd: Session, reporte_id: int) -> list[FilaDeValor]:
    """Las casillas del reporte, ordenadas por cuadro, indicador y día."""
    filas = bd.execute(
        select(
            ValorDetalle.cuadro_codigo, ValorDetalle.indicador_codigo,
            ValorDetalle.dia, ValorDetalle.fecha, ValorDetalle.valor, ValorDetalle.origen,
            Valor.texto_original, Valor.hoja_excel, Valor.celda_excel,
        )
        .join(Valor, Valor.id == ValorDetalle.valor_id)
        .where(ValorDetalle.reporte_id == reporte_id)
        .order_by(ValorDetalle.cuadro_codigo, ValorDetalle.indicador_codigo, ValorDetalle.dia)
    ).all()
    return [FilaDeValor(*f) for f in filas]


@dataclass(frozen=True)
class FilaDeTotal:
    """Un indicador de la estructura activa del reporte, con su cuadro, sus dimensiones
    y su total del mes. `total` es `None` cuando ninguna casilla tiene dato: no es cero.
    Aparece aunque no tenga ninguna casilla: la estructura no se rellena con ceros."""

    cuadro_codigo: str
    cuadro_titulo: str
    indicador_codigo: str
    indicador_nombre: str
    unidad_medida: str | None
    dimensiones: dict[str, Any]
    total: Decimal | None
    casillas_con_dato: int
    casillas_esperadas: int


def totales_de_reporte(bd: Session, reporte_id: int) -> list[FilaDeTotal]:
    """Los indicadores que trae la estructura con que se cargó el reporte (nada si
    todavía no tiene una carga aceptada), ordenados por cuadro y luego por indicador."""
    filas = bd.execute(
        select(
            Cuadro.codigo, Cuadro.titulo, Indicador.codigo, Indicador.nombre, Indicador.unidad_medida, DimensionesDeIndicador.dimensiones,
            TotalIndicador.total, TotalIndicador.casillas_con_dato, TotalIndicador.casillas_esperadas,
        )
        .select_from(TotalIndicador)
        .join(Cuadro, Cuadro.id == TotalIndicador.cuadro_id)
        .join(Indicador, Indicador.id == TotalIndicador.indicador_id)
        .join(DimensionesDeIndicador, DimensionesDeIndicador.indicador_id == TotalIndicador.indicador_id)
        .where(TotalIndicador.reporte_id == reporte_id, vigente(Cuadro), vigente(Indicador))
        .order_by(Cuadro.orden, Indicador.codigo)
    ).all()
    return [FilaDeTotal(*f) for f in filas]
