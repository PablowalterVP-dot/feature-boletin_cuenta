"""Esquema `organizacion` de Alejandro: estructura y calendario.

Una sola tabla, `unidad_organica`, para las áreas que reportan, las oficinas que
reciben y las entidades externas (DIRESA). Epidemiología reporta y recibe: es
`es_reportante` y `es_receptora` a la vez, sin necesidad de un tercer tipo.
"""

from datetime import date

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Identity, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.datos.base import Base, ControlFechas

_ESQUEMA = {"schema": "organizacion"}


class UnidadOrganica(ControlFechas, Base):
    __tablename__ = "unidad_organica"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20))  # sigla: NUT, EST, PLA…
    clave: Mapped[str] = mapped_column(String(60))  # identificador legible para la API: nutricion
    nombre: Mapped[str] = mapped_column(String(200))
    nombre_corto: Mapped[str | None] = mapped_column(String(100))
    tipo: Mapped[str] = mapped_column(String(20))
    unidad_padre_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("organizacion.unidad_organica.id"))
    es_reportante: Mapped[bool] = mapped_column(Boolean, server_default="false")
    es_receptora: Mapped[bool] = mapped_column(Boolean, server_default="false")
    es_estadistica: Mapped[bool] = mapped_column(Boolean, server_default="false")  # la oficina central (una sola)
    es_externa: Mapped[bool] = mapped_column(Boolean, server_default="false")  # fuera del hospital (DIRESA)
    es_activo: Mapped[bool] = mapped_column(Boolean, server_default="true")


class Destino(ControlFechas, Base):
    """La matriz de destinos: a qué oficinas va el reporte de cada unidad,
    además de Estadística (que siempre lo recibe y no figura aquí). Con
    vigencia, para que un cambio no reescriba el pasado."""

    __tablename__ = "destino"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    unidad_origen_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("organizacion.unidad_organica.id"))
    unidad_destino_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("organizacion.unidad_organica.id"))
    # La oficina recibe al enviar, sin esperar la validación (hoy: Nutrición → Planeamiento).
    es_entrega_inmediata: Mapped[bool] = mapped_column(Boolean, server_default="false")
    fecha_inicio_vigencia: Mapped[date] = mapped_column(Date)
    fecha_fin_vigencia: Mapped[date | None] = mapped_column(Date)
    observacion: Mapped[str | None] = mapped_column(Text)


class Periodo(ControlFechas, Base):
    """El mes reportado. Los plazos se **guardan** aquí y no se recalculan: un
    cambio de regla no debe alterar los meses pasados."""

    __tablename__ = "periodo"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    fecha_limite_entrega: Mapped[date] = mapped_column(Date)  # áreas → Estadística
    fecha_limite_remision: Mapped[date | None] = mapped_column(Date)  # Estadística → DIRESA
    es_cerrado: Mapped[bool] = mapped_column(Boolean, server_default="false")


class Parametro(ControlFechas, Base):
    """Configuración clave → valor: establecimiento, días límite, ruta de archivos."""

    __tablename__ = "parametro"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    clave: Mapped[str] = mapped_column(String(80))
    valor: Mapped[str] = mapped_column(Text)
    tipo_dato: Mapped[str] = mapped_column(String(20), server_default="texto")
    descripcion: Mapped[str | None] = mapped_column(Text)
