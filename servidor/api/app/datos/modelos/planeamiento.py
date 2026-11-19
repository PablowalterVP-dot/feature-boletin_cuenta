"""Esquema `planeamiento`: lo que la Oficina de Planeamiento escribe de las
actividades operativas del POI (migración 0008).

Solo lo escrito: la cifra de una actividad que ningún reporte trae, o el ajuste
de una que se calcula. Lo calculado no se guarda; el catálogo de actividades
vive en el frontend (`datos/planeamiento/actividades.js`).
"""

from decimal import Decimal

from sqlalchemy import BigInteger, ForeignKey, Identity, Numeric, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.datos.base import Base, ControlFechas

_ESQUEMA = {"schema": "planeamiento"}


class EjecucionActividad(ControlFechas, Base):
    __tablename__ = "ejecucion_actividad"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    anio: Mapped[int] = mapped_column(SmallInteger)
    codigo_actividad: Mapped[str] = mapped_column(String(20))
    mes: Mapped[int] = mapped_column(SmallInteger)
    valor: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    nota: Mapped[str | None] = mapped_column(Text)
    usuario_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))
