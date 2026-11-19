"""Esquema `fuente`: datos crudos de otros sistemas, tal como llegan.

    fuente ─< lote_carga ─< lote_mes ─< his_atencion
                                    └─< sinadef_defuncion

No es de Alejandro: lo instala `servidor/api/bd/desempeno/01_esquema.sql`, encima
de `avance_04` y sin tocarlo. Es **provisional**: se vacía el día que el hospital
tenga acceso directo a esas bases; lo calculado vive en `desempeno` y sobrevive.

**Una sola carga vigente por fuente y mes** (`uq_lote_mes_vigente`, en la base).
Subir otra vez un mes lo reemplaza, no lo suma: es lo que impide duplicar datos y
lo que permite decir hasta qué mes está cargada cada fuente.

`his_atencion` y `sinadef_defuncion` tienen filas de pacientes y **no** llevan
bitácora fila por fila (solo las fechas de control): `auditoria.registro_cambio`
copia la fila entera y es inmutable. De esas cargas responde su lote.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, CHAR, Date, ForeignKey, Identity, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import DateTime

from app.datos.base import Base, ControlFechas

_ESQUEMA = {"schema": "fuente"}
_JSONB_ANULABLE = JSONB(none_as_null=True)


class Fuente(ControlFechas, Base):
    """Un sistema de origen: `his_minsa`, `sinadef_hrl`, `sinadef_verificado` y
    los que el hospital todavía no carga (están para que cada ficha diga qué le
    falta). Agregar un sistema es una fila aquí y una tabla para sus datos."""

    __tablename__ = "fuente"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(40))
    nombre: Mapped[str] = mapped_column(String(150))
    descripcion: Mapped[str | None] = mapped_column(Text)
    periodicidad: Mapped[str] = mapped_column(String(15))  # mensual: se controla mes a mes; eventual: sin meses
    es_activo: Mapped[bool] = mapped_column(Boolean, server_default="true")
    area_responsable: Mapped[str | None] = mapped_column(String(120))  # quién entrega el archivo
    formato: Mapped[str | None] = mapped_column(String(120))  # qué archivo es, como lo reconoce quien lo descarga


class LoteCarga(ControlFechas, Base):
    """Un archivo subido. La huella impide subir dos veces el mismo; `columnas`
    guarda su cabecera tal como vino, por si el sistema de origen cambia de formato."""

    __tablename__ = "lote_carga"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    fuente_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("fuente.fuente.id"))
    nombre_archivo: Mapped[str] = mapped_column(String(255))
    huella_sha256: Mapped[str] = mapped_column(CHAR(64))
    tamano_bytes: Mapped[int] = mapped_column(BigInteger)
    fecha_extraccion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # cuándo se sacó del origen, si el archivo lo dice
    cobertura_desde: Mapped[date | None] = mapped_column(Date)
    cobertura_hasta: Mapped[date | None] = mapped_column(Date)
    filas_archivo: Mapped[int] = mapped_column(Integer)
    filas_cargadas: Mapped[int] = mapped_column(Integer)
    filas_omitidas: Mapped[int] = mapped_column(Integer, server_default="0")  # fuera del rango pedido o ilegibles
    columnas: Mapped[list[str] | None] = mapped_column(_JSONB_ANULABLE)
    usuario_carga_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))  # nulo: desde la terminal, sin cuenta
    observacion: Mapped[str | None] = mapped_column(Text)


class LoteMes(ControlFechas, Base):
    """Un mes de los que trajo un lote. Al reemplazarlo, la fila anterior queda
    con `es_vigente = false` (se conserva como historia) y sus datos se borran.
    `fuente_id` repite el del lote: la unicidad por fuente y mes es un índice."""

    __tablename__ = "lote_mes"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    lote_carga_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("fuente.lote_carga.id"))
    fuente_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("fuente.fuente.id"))
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    filas: Mapped[int] = mapped_column(Integer)
    es_vigente: Mapped[bool] = mapped_column(Boolean, server_default="true")


class HisAtencion(ControlFechas, Base):
    """Una fila de la trama nominal del HIS MINSA: sus 57 columnas, en el orden
    y con el nombre del archivo (en minúsculas).

    Todo es texto, tal como viene: el consolidado y los extractos mensuales no
    escriben igual los números («1» y «1.0») y es el cálculo quien los
    interpreta. La excepción es `fecha_atencion`, que decide a qué mes pertenece
    la fila. Una casilla vacía se guarda nula.

    El orden de las columnas de aquí es el del archivo: quien carga lo toma de
    `COLUMNAS_HIS` en lugar de repetir la lista.
    """

    __tablename__ = "his_atencion"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    lote_mes_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("fuente.lote_mes.id"))
    fila_archivo: Mapped[int] = mapped_column(Integer)  # línea en el archivo del lote: de un dato se vuelve a su renglón
    id_cita: Mapped[str | None] = mapped_column(Text)
    anio: Mapped[str | None] = mapped_column(Text)
    mes: Mapped[str | None] = mapped_column(Text)
    dia: Mapped[str | None] = mapped_column(Text)
    fecha_atencion: Mapped[date] = mapped_column(Date)
    lote: Mapped[str | None] = mapped_column(Text)  # el «Lote» del HIS (hoja de registro), no el lote de carga
    num_pag: Mapped[str | None] = mapped_column(Text)
    num_reg: Mapped[str | None] = mapped_column(Text)
    ups: Mapped[str | None] = mapped_column(Text)
    establecimiento: Mapped[str | None] = mapped_column(Text)
    id_paciente: Mapped[str | None] = mapped_column(Text)
    id_personal: Mapped[str | None] = mapped_column(Text)
    id_registrador: Mapped[str | None] = mapped_column(Text)
    id_financiador: Mapped[str | None] = mapped_column(Text)
    id_condicion_establecimiento: Mapped[str | None] = mapped_column(Text)
    id_condicion_servicio: Mapped[str | None] = mapped_column(Text)
    edad_reg: Mapped[str | None] = mapped_column(Text)
    tipo_edad: Mapped[str | None] = mapped_column(Text)
    anio_actual_paciente: Mapped[str | None] = mapped_column(Text)
    mes_actual_paciente: Mapped[str | None] = mapped_column(Text)
    dia_actual_paciente: Mapped[str | None] = mapped_column(Text)
    id_turno: Mapped[str | None] = mapped_column(Text)
    codigo_item: Mapped[str | None] = mapped_column(Text)
    tipo_diagnostico: Mapped[str | None] = mapped_column(Text)
    valor_lab: Mapped[str | None] = mapped_column(Text)
    id_correlativo: Mapped[str | None] = mapped_column(Text)
    id_correlativo_lab: Mapped[str | None] = mapped_column(Text)
    id_otra_condicion: Mapped[str | None] = mapped_column(Text)
    id_centro_poblado: Mapped[str | None] = mapped_column(Text)
    fecha_ultima_regla: Mapped[str | None] = mapped_column(Text)
    fecha_registro: Mapped[str | None] = mapped_column(Text)
    fecha_modificacion: Mapped[str | None] = mapped_column(Text)
    id_dosis: Mapped[str | None] = mapped_column(Text)
    descripcion_item: Mapped[str | None] = mapped_column(Text)
    id_tipo_documento_paciente: Mapped[str | None] = mapped_column(Text)
    numero_documento_paciente: Mapped[str | None] = mapped_column(Text)
    apellido_paterno_paciente: Mapped[str | None] = mapped_column(Text)
    apellido_materno_paciente: Mapped[str | None] = mapped_column(Text)
    nombres_paciente: Mapped[str | None] = mapped_column(Text)
    fecha_nacimiento_paciente: Mapped[str | None] = mapped_column(Text)
    genero: Mapped[str | None] = mapped_column(Text)
    id_etnia: Mapped[str | None] = mapped_column(Text)
    historia_clinica: Mapped[str | None] = mapped_column(Text)
    id_pais: Mapped[str | None] = mapped_column(Text)
    id_tipo_documento_personal: Mapped[str | None] = mapped_column(Text)
    numero_documento_personal: Mapped[str | None] = mapped_column(Text)
    apellido_paterno_personal: Mapped[str | None] = mapped_column(Text)
    apellido_materno_personal: Mapped[str | None] = mapped_column(Text)
    nombres_personal: Mapped[str | None] = mapped_column(Text)
    fecha_nacimiento_personal: Mapped[str | None] = mapped_column(Text)
    condicion: Mapped[str | None] = mapped_column(Text)
    profesion: Mapped[str | None] = mapped_column(Text)
    id_tipo_documento_registrador: Mapped[str | None] = mapped_column(Text)
    numero_documento_registrador: Mapped[str | None] = mapped_column(Text)
    apellido_paterno_registrador: Mapped[str | None] = mapped_column(Text)
    apellido_materno_registrador: Mapped[str | None] = mapped_column(Text)
    nombres_registrador: Mapped[str | None] = mapped_column(Text)


_PROPIAS_DE_LA_TABLA = {"id", "lote_mes_id", "fila_archivo", "fecha_creacion", "fecha_actualizacion", "fecha_eliminacion"}

# Las 57 columnas de la trama, en el orden del archivo.
COLUMNAS_HIS: tuple[str, ...] = tuple(c.name for c in HisAtencion.__table__.columns if c.name not in _PROPIAS_DE_LA_TABLA)


class SinadefDefuncion(ControlFechas, Base):
    """Un certificado del reporte de SINADEF del hospital. Aparte van los seis
    datos del cruce oficial; la fila completa (91 columnas, varias con el mismo
    nombre para el fallecido, el profesional y el registrador) queda en
    `fila_original`, en el orden de `LoteCarga.columnas`.

    Se guardan **todos**, también los anulados: el filtro se aplica al calcular,
    igual que en el script. El mes de su lote es el del reporte (certificados
    *registrados* ese mes), que no siempre es el de la defunción."""

    __tablename__ = "sinadef_defuncion"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    lote_mes_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("fuente.lote_mes.id"))
    fila_archivo: Mapped[int] = mapped_column(Integer)
    tipo_cdef: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str | None] = mapped_column(Text)
    tipo_documento: Mapped[str | None] = mapped_column(Text)
    numero_documento: Mapped[str | None] = mapped_column(Text)
    fecha_defuncion: Mapped[date | None] = mapped_column(Date)  # nula si la casilla no era una fecha (queda en fila_original)
    fecha_registro: Mapped[date | None] = mapped_column(Date)
    fila_original: Mapped[list[Any]] = mapped_column(JSONB)


class DefuncionVerificada(ControlFechas, Base):
    """Una defunción confirmada a mano en SINADEF nacional: el certificado no se
    emitió en el hospital y por eso no viene en su reporte. Son pocas y cada una
    es una decisión de alguien: esta tabla sí lleva bitácora completa."""

    __tablename__ = "defuncion_verificada"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    numero_documento: Mapped[str] = mapped_column(String(15))
    fecha_defuncion: Mapped[date] = mapped_column(Date)
    fecha_registro: Mapped[date | None] = mapped_column(Date)  # cuándo se registró en SINADEF, si se anotó
    origen: Mapped[str | None] = mapped_column(String(150))  # dónde se verificó
    fecha_verificacion: Mapped[date | None] = mapped_column(Date)
    lote_carga_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("fuente.lote_carga.id"))  # nulo: registrada a mano
    observacion: Mapped[str | None] = mapped_column(Text)
