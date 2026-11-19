"""Esquema `reporte` de Alejandro: la operación mensual.

    reporte ─< reporte_historial_estado      la línea de tiempo de estados
       │─< carga ─< hallazgo                  cada subida del Excel y lo que halló el bot
       └─< remision                           lo que llegó a cada oficina

**Lo que la base NO hace** (y por eso lo hace el backend, con pruebas): no impone la
máquina de estados (un `UPDATE` puede llevar un reporte de `enviado` a `remitido`
sin pasar por `validado`), no comprueba que un reporte tenga una carga aceptada
antes de enviarse y no escribe el historial de estados. Los disparadores de esta
base solo llenan las fechas de control, anotan la bitácora y validan las casillas
y las cargas.

Un reporte que no existe no se guarda: su ausencia es el estado `no_iniciado`.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, Boolean, CHAR, ForeignKey, Identity, Integer, Numeric, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import DateTime

from app.datos.base import Base, ControlFechas

_ESQUEMA = {"schema": "reporte"}
_JSONB_ANULABLE = JSONB(none_as_null=True)


class EstadoReporte(ControlFechas, Base):
    """borrador, enviado, en_revision, validado y remitido (`no_iniciado` no)."""

    __tablename__ = "estado_reporte"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20))
    nombre: Mapped[str] = mapped_column(String(60))
    descripcion: Mapped[str | None] = mapped_column(Text)
    orden: Mapped[int] = mapped_column(SmallInteger)
    es_final: Mapped[bool] = mapped_column(Boolean, server_default="false")


class TransicionEstado(ControlFechas, Base):
    """Una transición permitida y el permiso que exige. En ejecución, el backend la
    lee de aquí: es la fuente de verdad de qué se puede hacer y quién puede.

    `crear` (no_iniciado → borrador) no está: no es una transición guardada sino el
    INSERT del reporte, y exige `reporte.cargar`.
    """

    __tablename__ = "transicion_estado"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    accion: Mapped[str] = mapped_column(String(20))
    estado_origen_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.estado_reporte.id"))
    estado_destino_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.estado_reporte.id"))
    permiso_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("seguridad.permiso.id"))


class Archivo(ControlFechas, Base):
    """Un archivo en el disco del servidor. La base guarda solo su ubicación y su
    huella: el contenido no está en ella."""

    __tablename__ = "archivo"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    nombre_original: Mapped[str] = mapped_column(String(255))
    ruta_almacenamiento: Mapped[str] = mapped_column(String(500))
    tipo_mime: Mapped[str | None] = mapped_column(String(120))
    tamano_bytes: Mapped[int] = mapped_column(BigInteger)
    huella_sha256: Mapped[str] = mapped_column(CHAR(64))
    proposito: Mapped[str] = mapped_column(String(20))  # carga, muestra, exportacion, remision


class Reporte(ControlFechas, Base):
    """Un formato de una unidad para un periodo. Uno solo vigente por formato y
    periodo: una rectificación no crea otro reporte, sube `numero_rectificacion`."""

    __tablename__ = "reporte"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    formato_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.formato.id"))
    periodo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("organizacion.periodo.id"))
    # La estructura con que se leyó. Nula hasta la primera carga aceptada: el
    # sistema no sabe con qué Excel vendrá hasta que el bot lo reconoce.
    formato_version_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("formato.formato_version.id"))
    estado_reporte_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.estado_reporte.id"))
    numero_rectificacion: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    # La constancia de recepción (el equivalente del sello del oficio). Única.
    folio_constancia: Mapped[str | None] = mapped_column(String(30))
    fecha_envio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usuario_envio_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))
    fecha_validacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usuario_validacion_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))
    observacion: Mapped[str | None] = mapped_column(Text)


class ReporteHistorialEstado(ControlFechas, Base):
    """La línea de tiempo: quién movió el reporte, cuándo y de dónde a dónde.

    Lo escribe el backend, no un disparador. Su fecha (`fecha_creacion`) la pone el
    disparador de control con la hora de la base, no la del reloj inyectable.
    """

    __tablename__ = "reporte_historial_estado"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    reporte_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.reporte.id"))
    estado_origen_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("reporte.estado_reporte.id"))  # nulo al crear
    estado_destino_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.estado_reporte.id"))
    accion: Mapped[str] = mapped_column(String(20))
    numero_rectificacion: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    comentario: Mapped[str | None] = mapped_column(Text)


class Carga(ControlFechas, Base):
    """Cada vez que el área sube un Excel y el bot lo procesa. Una sola vigente por
    reporte: la que dio origen a los valores."""

    __tablename__ = "carga"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    reporte_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.reporte.id"))
    archivo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.archivo.id"))
    formato_version_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("formato.formato_version.id"))
    version_bot: Mapped[str | None] = mapped_column(String(20))
    resultado: Mapped[str] = mapped_column(String(15))  # 'aceptada' o 'bloqueada'
    codigo_bloqueo: Mapped[str | None] = mapped_column(String(40))
    detalle_bloqueo: Mapped[str | None] = mapped_column(Text)
    casillas_leidas: Mapped[int | None] = mapped_column(Integer)
    total_errores: Mapped[int] = mapped_column(Integer, server_default="0")
    total_avisos: Mapped[int] = mapped_column(Integer, server_default="0")
    total_info: Mapped[int] = mapped_column(Integer, server_default="0")
    informe_bot: Mapped[dict[str, Any] | None] = mapped_column(_JSONB_ANULABLE)
    es_vigente: Mapped[bool] = mapped_column(Boolean, server_default="false")


class TotalDeclarado(ControlFechas, Base):
    """Un total que ya traía escrito el Excel del área. No es dato: sirve para
    comprobar que el archivo es coherente consigo mismo (la regla `totales`).
    `indicador_id` nulo = el total del cuadro entero, no el de una fila."""

    __tablename__ = "total_declarado"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    carga_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.carga.id"))
    cuadro_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.cuadro.id"))
    indicador_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("formato.indicador.id"))
    valor: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))


class Hallazgo(ControlFechas, Base):
    """Lo que encontró el bot en una carga: errores, avisos e información.

    Los avisos exigen justificación antes de enviar, y esa justificación la lee
    Estadística. Un error no se justifica: se corrige.
    """

    __tablename__ = "hallazgo"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    carga_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.carga.id"))
    regla_validacion_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("formato.regla_validacion.id"))
    nivel: Mapped[str] = mapped_column(String(10))  # error, aviso, info
    clave_hallazgo: Mapped[str] = mapped_column(String(200))  # id estable del bot: atipico|f3|liquida.cena|21
    cuadro_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("formato.cuadro.id"))
    indicador_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("formato.indicador.id"))
    dia: Mapped[int | None] = mapped_column(SmallInteger)
    titulo: Mapped[str] = mapped_column(String(300))
    detalle: Mapped[str | None] = mapped_column(Text)
    justificacion: Mapped[str | None] = mapped_column(Text)
    fecha_justificacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usuario_justificacion_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))


class Remision(ControlFechas, Base):
    """Lo que Estadística (o el envío inmediato) pone a disposición de una oficina.

    Al rectificar, la remisión anterior queda con `es_vigente = false`: es la prueba
    de que esa oficina recibió una versión que después quedó desactualizada.
    """

    __tablename__ = "remision"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    reporte_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.reporte.id"))
    unidad_destino_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("organizacion.unidad_organica.id"))
    numero_rectificacion: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    es_sin_validar: Mapped[bool] = mapped_column(Boolean, server_default="false")  # entrega inmediata, antes de validar
    es_vigente: Mapped[bool] = mapped_column(Boolean, server_default="true")
    fecha_remision: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    usuario_remision_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))
    fecha_lectura: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usuario_lectura_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))


class Valor(ControlFechas, Base):
    """Una casilla. `dia` nulo = dato mensual. El total del mes no se guarda aquí: se
    calcula (`reporte.v_total_indicador`). `hoja_excel`/`celda_excel` son el linaje: de
    dónde se leyó, solo presentes cuando `origen = 'archivo'`."""

    __tablename__ = "valor"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    reporte_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("reporte.reporte.id"))
    indicador_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("formato.indicador.id"))
    dia: Mapped[int | None] = mapped_column(SmallInteger)
    valor: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))  # nulo = no se registró (≠ 0)
    texto_original: Mapped[str | None] = mapped_column(String(100))
    origen: Mapped[str] = mapped_column(String(10))  # archivo, manual
    carga_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("reporte.carga.id"))
    hoja_excel: Mapped[str | None] = mapped_column(String(100))
    celda_excel: Mapped[str | None] = mapped_column(String(10))
