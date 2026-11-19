"""Vistas del esquema `reporte` que el backend lee.

Solo lectura: una vista no se inserta, no se actualiza ni se borra. Una prueba
(`prueba_modelos_vs_bd.py`) compara sus columnas con las reales, como con las tablas.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, Date, Integer, Numeric, SmallInteger, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import DateTime

from app.datos.base import Base, solo_lectura


@solo_lectura
class Cumplimiento(Base):
    """`reporte.v_cumplimiento`: un renglón por **periodo × formato activo, exista o no
    el reporte**. Es la fuente de las filas de la lista de reportes: sin ella se
    esconderían justo las áreas que no han empezado.

    Ojo con sus límites, que el servicio corrige:

    - Trae **todos** los periodos registrados (2026 entero), también los futuros.
    - `semaforo` y `espera` los calcula con `current_date` del **servidor de la base**,
      no con nuestro reloj inyectable ni con la hora de Lima. Aquí se leen las filas y
      el semáforo se recalcula en el backend (`dominio/consultas.py`); una prueba de
      contrato comprueba que ambos coinciden.
    - No trae la constancia, el número de rectificación, la fecha de validación ni la
      clave de la unidad: se unen aparte.
    """

    __tablename__ = "v_cumplimiento"
    __table_args__ = {"schema": "reporte"}

    # Una vista no tiene clave: la identidad de un renglón es (periodo, formato).
    periodo_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    formato_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    fecha_limite_entrega: Mapped[date] = mapped_column(Date)
    unidad_codigo: Mapped[str] = mapped_column(String(20))
    unidad_nombre: Mapped[str] = mapped_column(String(200))
    formato_codigo: Mapped[str] = mapped_column(String(30))
    reporte_id: Mapped[int | None] = mapped_column(BigInteger)
    estado: Mapped[str] = mapped_column(String)  # COALESCE(código, 'no_iniciado')
    fecha_envio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    espera: Mapped[str] = mapped_column(String)
    semaforo: Mapped[str] = mapped_column(String)


@solo_lectura
class ValorDetalle(Base):
    """`reporte.v_valor_detalle`: cada casilla de `reporte.valor` con su contexto (área,
    periodo, estado, cuadro, indicador) y sus dimensiones (población, servicio, comida…)
    ya armadas en un JSON. Es la vista base del endpoint de valores; el linaje
    (`hoja_excel`/`celda_excel`) no está aquí, se une con `Valor` por `valor_id`.
    """

    __tablename__ = "v_valor_detalle"
    __table_args__ = {"schema": "reporte"}

    valor_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    reporte_id: Mapped[int] = mapped_column(BigInteger)
    unidad_codigo: Mapped[str] = mapped_column(String(20))
    formato_codigo: Mapped[str] = mapped_column(String(30))
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    estado: Mapped[str] = mapped_column(String(20))
    numero_rectificacion: Mapped[int] = mapped_column(SmallInteger)
    cuadro_codigo: Mapped[str | None] = mapped_column(String(20))
    indicador_codigo: Mapped[str] = mapped_column(String(80))
    indicador_nombre: Mapped[str] = mapped_column(String(200))
    dia: Mapped[int | None] = mapped_column(SmallInteger)
    fecha: Mapped[date | None] = mapped_column(Date)
    valor: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    origen: Mapped[str] = mapped_column(String(10))
    dimensiones: Mapped[dict[str, Any]] = mapped_column(JSONB)


@solo_lectura
class TotalIndicador(Base):
    """`reporte.v_total_indicador`: el total del mes por indicador y su completitud
    (casillas con dato vs. esperadas), calculado a partir de `reporte.valor`. Un total
    `None` significa que ninguna casilla tiene dato todavía, no que valga cero."""

    __tablename__ = "v_total_indicador"
    __table_args__ = {"schema": "reporte"}

    reporte_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    formato_codigo: Mapped[str] = mapped_column(String(30))
    cuadro_id: Mapped[int] = mapped_column(BigInteger)
    indicador_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    indicador_codigo: Mapped[str] = mapped_column(String(80))
    total: Mapped[Decimal | None] = mapped_column(Numeric)  # SUM(numeric(14,2)) pierde la precisión fija
    casillas_con_dato: Mapped[int] = mapped_column(BigInteger)  # COUNT(...)
    casillas_esperadas: Mapped[int] = mapped_column(Integer)


@solo_lectura
class DimensionesDeIndicador(Base):
    """`formato.v_indicador_dimension`: las dimensiones de cada indicador (población,
    servicio, comida…) ya armadas en un JSON, uno por indicador exista o no un valor
    todavía. Sin ella, un indicador sin ninguna casilla se quedaría sin dimensiones.

    No confundir con el modelo `IndicadorDimension` de `formato.py`: esa es la tabla
    (una fila por clasificación); esta es la vista agregada (una fila por indicador,
    con sus dimensiones ya juntas en un JSON)."""

    __tablename__ = "v_indicador_dimension"
    __table_args__ = {"schema": "formato"}

    indicador_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    formato_id: Mapped[int] = mapped_column(BigInteger)
    indicador_codigo: Mapped[str] = mapped_column(String(80))
    dimensiones: Mapped[dict[str, Any]] = mapped_column(JSONB)


@solo_lectura
class ConfiguracionLectura(Base):
    """`formato.v_configuracion_lectura`: todo lo que necesita el bot para reconocer,
    leer y validar el Excel de una versión — un documento JSON por versión
    (`configuracion`). El backend la arma en cada carga y se la envía al bot; el bot
    no consulta la base directamente."""

    __tablename__ = "v_configuracion_lectura"
    __table_args__ = {"schema": "formato"}

    formato_version_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    formato_codigo: Mapped[str] = mapped_column(String(30))
    codigo_version: Mapped[str] = mapped_column(String(20))
    estado: Mapped[str] = mapped_column(String(20))
    configuracion: Mapped[dict[str, Any]] = mapped_column(JSONB)
