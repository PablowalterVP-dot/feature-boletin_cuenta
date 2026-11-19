"""Esquema `formato` de Alejandro: el catálogo de qué reporta cada área.

Solo lo que el backend necesita hoy y lo que esas tablas referencian (una clave
foránea obliga a modelar su destino para que el contrato con la base sea
completo). Los cuadros, indicadores y reglas los usará el paso de la carga del
Excel; por ahora el backend solo lee `formato` para saber de qué unidad es un
reporte.

Nada de esto se escribe desde el backend: el catálogo lo mantienen Estadística y
el superadmin con los permisos `formato.gestionar` y `formato.configurar_lectura`.
"""

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, ForeignKeyConstraint, Identity, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.datos.base import Base, ControlFechas

_ESQUEMA = {"schema": "formato"}

# En una columna JSONB anulable, SQLAlchemy guarda por omisión `None` como el JSON
# `null`, que NO es el `NULL` de SQL. `none_as_null` lo evita.
_JSONB_ANULABLE = JSONB(none_as_null=True)


class Formato(ControlFechas, Base):
    """El reporte que entrega un área: `NUT` es el de Nutrición y Dietética."""

    __tablename__ = "formato"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    unidad_organica_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("organizacion.unidad_organica.id"))
    codigo: Mapped[str] = mapped_column(String(30))
    nombre: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str | None] = mapped_column(Text)
    periodicidad: Mapped[str] = mapped_column(String(15), server_default="mensual")
    # 'diaria' (una casilla por día) o 'mensual' (una por mes).
    granularidad: Mapped[str] = mapped_column(String(15))
    es_activo: Mapped[bool] = mapped_column(Boolean, server_default="true")


class FormatoVersion(ControlFechas, Base):
    """Una estructura del Excel del área y su configuración de lectura.

    `en_configuracion` (se está armando; el bot no la usa), `activa` (el bot la usa
    para reconocer y leer archivos) o `retirada`. Sin una versión activa, la base no
    acepta ninguna carga.
    """

    __tablename__ = "formato_version"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    formato_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.formato.id"))
    codigo_version: Mapped[str] = mapped_column(String(20))  # NUT-1, NUT-2…
    estado: Mapped[str] = mapped_column(String(20), server_default="en_configuracion")
    tipo_archivo: Mapped[str | None] = mapped_column(String(10))
    lectura_periodo: Mapped[dict[str, Any] | None] = mapped_column(_JSONB_ANULABLE)
    fecha_inicio_vigencia: Mapped[date] = mapped_column(Date)
    fecha_fin_vigencia: Mapped[date | None] = mapped_column(Date)
    archivo_muestra_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("reporte.archivo.id"))
    notas: Mapped[str | None] = mapped_column(Text)


class CriterioReconocimiento(ControlFechas, Base):
    """Cómo reconoce el bot que un archivo subido tiene esta estructura: que exista una
    hoja (`hoja_existe`) o que una celda tenga cierto texto (`celda_texto`, con
    `texto_esperado` como expresión regular). Todos los obligatorios deben cumplirse."""

    __tablename__ = "criterio_reconocimiento"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    formato_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.formato_version.id"))
    tipo: Mapped[str] = mapped_column(String(20))  # hoja_existe, celda_texto
    hoja: Mapped[str] = mapped_column(String(200))
    es_patron: Mapped[bool] = mapped_column(Boolean, server_default="false")
    celda: Mapped[str | None] = mapped_column(String(10))
    texto_esperado: Mapped[str | None] = mapped_column(String(300))
    es_obligatorio: Mapped[bool] = mapped_column(Boolean, server_default="true")
    descripcion: Mapped[str | None] = mapped_column(Text)


class Cuadro(ControlFechas, Base):
    """Una tabla del reporte, ubicada en una hoja del Excel del área."""

    __tablename__ = "cuadro"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    formato_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.formato_version.id"))
    codigo: Mapped[str] = mapped_column(String(20))  # f1, f2…
    numero: Mapped[int] = mapped_column(SmallInteger)
    titulo: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str | None] = mapped_column(Text)
    hoja: Mapped[str | None] = mapped_column(String(200))
    es_hoja_patron: Mapped[bool] = mapped_column(Boolean, server_default="false")
    ubicacion: Mapped[dict[str, Any] | None] = mapped_column(_JSONB_ANULABLE)
    orden: Mapped[int] = mapped_column(SmallInteger, server_default="0")


class Indicador(ControlFechas, Base):
    """Lo que se mide: una fila de datos. Conserva su identidad entre versiones."""

    __tablename__ = "indicador"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    formato_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.formato.id"))
    codigo: Mapped[str] = mapped_column(String(80))  # f3.liquida.cena
    nombre: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str | None] = mapped_column(Text)
    tipo_dato: Mapped[str] = mapped_column(String(10), server_default="entero")
    unidad_medida: Mapped[str | None] = mapped_column(String(30))
    valor_minimo: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    valor_maximo: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    es_obligatorio: Mapped[bool] = mapped_column(Boolean, server_default="true")


class VersionIndicador(ControlFechas, Base):
    """Dónde está un indicador en el Excel de esta versión: en qué cuadro, con qué
    método (`rango`, `celda` o `etiqueta`) y su ubicación exacta. Sin método ni
    ubicación, la versión no puede activarse (lo impone un disparador de la base)."""

    __tablename__ = "version_indicador"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    formato_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.formato_version.id"))
    cuadro_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.cuadro.id"))
    indicador_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.indicador.id"))
    orden: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    etiqueta: Mapped[str | None] = mapped_column(String(200))
    metodo_lectura: Mapped[str | None] = mapped_column(String(10))
    ubicacion: Mapped[dict[str, Any] | None] = mapped_column(_JSONB_ANULABLE)
    ubicacion_total: Mapped[dict[str, Any] | None] = mapped_column(_JSONB_ANULABLE)


class Dimension(ControlFechas, Base):
    """Un eje de análisis: población, servicio, comida, financiador… Permite sumar
    «todas las cenas» sin conocer las filas de antemano."""

    __tablename__ = "dimension"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(40))
    nombre: Mapped[str] = mapped_column(String(100))
    descripcion: Mapped[str | None] = mapped_column(Text)


class DimensionValor(ControlFechas, Base):
    __tablename__ = "dimension_valor"
    __table_args__ = (
        # Para la FK compuesta de indicador_dimension, la base exige esta única sobre (id, dimension_id).
        {"schema": "formato"},
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    dimension_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.dimension.id"))
    codigo: Mapped[str] = mapped_column(String(40))
    nombre: Mapped[str] = mapped_column(String(150))
    descripcion: Mapped[str | None] = mapped_column(Text)
    orden: Mapped[int] = mapped_column(SmallInteger, server_default="0")


class IndicadorDimension(ControlFechas, Base):
    """Clasificación de un indicador: a lo más un valor por dimensión. La clave
    foránea a `dimension_valor` es compuesta `(dimension_valor_id, dimension_id)`
    porque la base la usa para impedir mezclar el valor de una dimensión con el id
    de otra."""

    __tablename__ = "indicador_dimension"
    __table_args__ = (
        ForeignKeyConstraint(["dimension_valor_id", "dimension_id"], ["formato.dimension_valor.id", "formato.dimension_valor.dimension_id"]),
        {"schema": "formato"},
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    indicador_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.indicador.id"))
    dimension_id: Mapped[int] = mapped_column(BigInteger)
    dimension_valor_id: Mapped[int] = mapped_column(BigInteger)


class ReglaValidacion(ControlFechas, Base):
    """Una regla del bot, con su nivel (`error`, `aviso`, `info`) y sus parámetros.
    La lógica vive en el código del bot; aquí solo se registra para activarla o
    ajustarla."""

    __tablename__ = "regla_validacion"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    formato_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.formato.id"))
    codigo: Mapped[str] = mapped_column(String(40))
    nivel: Mapped[str] = mapped_column(String(10))
    descripcion: Mapped[str] = mapped_column(Text)
    parametros: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    es_activo: Mapped[bool] = mapped_column(Boolean, server_default="true")
