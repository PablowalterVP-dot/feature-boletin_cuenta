"""Esquema `desempeno`: lo que el sistema calcula de los indicadores de desempeño.

    dimension ─< ficha ─< corrida ─< resultado_mensual
                   │ │            └─< resultado_paciente
                   │ ├─< referencia_minsa
                   │ └─< seguimiento_caso
                   └─< ficha_fuente >─ fuente.fuente

No es de Alejandro: lo instalan los scripts de `servidor/api/bd/desempeno/`.

**Un resultado nunca se guarda suelto**, siempre colgado de la corrida que dice
cómo se obtuvo: el mismo mes da cifras distintas según cuándo se calcule y con
qué corte (febrero de 2026 es 3/22 con el corte oficial del 08/08 y 2/19 sin
corte). Mezclar dos corridas en una serie compararía cosas que no son comparables.

«Indicador» aquí son las 34 fichas de MINSA, no los de `formato.indicador`
(las filas de un reporte de área) ni los 22 de gestión que van a DIRESA: por eso
el módulo se llama `desempeno` y su tabla `ficha`.
"""

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Identity, Integer, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.datos.base import Base, ControlFechas

_ESQUEMA = {"schema": "desempeno"}


class ScriptAplicado(ControlFechas, Base):
    """Un script de `bd/desempeno/` que la base ya tiene: el instalador aplica
    solo los que faltan."""

    __tablename__ = "script_aplicado"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    script: Mapped[str] = mapped_column(String(80))


class DimensionDesempeno(ControlFechas, Base):
    """Agrupación de las fichas por tema. Es una propuesta del hospital, no de
    MINSA (`es_oficial`). Se llama así para no confundirla con
    `formato.dimension`, que es otra cosa."""

    __tablename__ = "dimension"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(10))
    nombre: Mapped[str] = mapped_column(String(120))
    orden: Mapped[int] = mapped_column(SmallInteger)
    es_oficial: Mapped[bool] = mapped_column(Boolean, server_default="false")


class Ficha(ControlFechas, Base):
    """Uno de los 34 indicadores de desempeño (Anexo I, MINSA 2026)."""

    __tablename__ = "ficha"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    numero: Mapped[int] = mapped_column(SmallInteger)
    clave: Mapped[str] = mapped_column(String(60))
    nombre: Mapped[str] = mapped_column(Text)
    es_activo: Mapped[bool] = mapped_column(Boolean, server_default="true")
    nombre_corto: Mapped[str | None] = mapped_column(String(80))
    dimension_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("desempeno.dimension.id"))
    aplica_al_hospital: Mapped[bool] = mapped_column(Boolean, server_default="true")
    motivo_no_aplica: Mapped[str | None] = mapped_column(Text)


class FichaFuente(ControlFechas, Base):
    """Una fuente que alimenta a una ficha. Mientras una fuente de la ficha no se
    pueda cargar, la ficha queda sin resultado, no en cero."""

    __tablename__ = "ficha_fuente"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    ficha_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("desempeno.ficha.id"))
    fuente_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("fuente.fuente.id"))


class Corrida(ControlFechas, Base):
    """Un cálculo de una ficha.

    `fecha_corte`: la del reporte oficial de MINSA; los meses ya terminados ese
    día (`detalle.mes_con_corte` dice hasta cuál) solo cuentan lo ocurrido y
    registrado hasta entonces, y los siguientes van al día. Nula es todo al día.
    `fecha_fin_observacion`: hasta qué día había datos al calcular. `detalle`:
    lotes usados, parámetros y limitaciones declaradas."""

    __tablename__ = "corrida"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    ficha_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("desempeno.ficha.id"))
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes_desde: Mapped[int] = mapped_column(SmallInteger)
    mes_hasta: Mapped[int] = mapped_column(SmallInteger)
    fecha_corte: Mapped[date | None] = mapped_column(Date)
    fecha_fin_observacion: Mapped[date] = mapped_column(Date)
    version_calculo: Mapped[str] = mapped_column(String(20))  # versión de las reglas con que se calculó
    detalle: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    usuario_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))
    observacion: Mapped[str | None] = mapped_column(Text)


class ResultadoMensual(ControlFechas, Base):
    """Numerador y denominador de un mes. `plazo_abierto`: casos del denominador
    que todavía pueden cambiar de resultado (en la Ficha 14, diagnósticos sin
    tratamiento cuyo plazo de 37 días no había vencido al calcular)."""

    __tablename__ = "resultado_mensual"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    corrida_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("desempeno.corrida.id"))
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    numerador: Mapped[int] = mapped_column(Integer)
    denominador: Mapped[int] = mapped_column(Integer)
    plazo_abierto: Mapped[int] = mapped_column(Integer, server_default="0")


class ResultadoPaciente(ControlFechas, Base):
    """La lista nominal detrás de cada cifra: una fila por persona y categoría
    evaluada. Los nombres son genéricos porque sirve a las 34 fichas: en la
    Ficha 14, `categoria` es el tipo de cáncer, `fecha_referencia` la del
    diagnóstico y `fecha_cumplimiento` la del inicio de tratamiento.

    Tiene datos de pacientes: sin bitácora fila por fila (ver `fuente.py`)."""

    __tablename__ = "resultado_paciente"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    corrida_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("desempeno.corrida.id"))
    tipo_documento: Mapped[str | None] = mapped_column(String(5))
    numero_documento: Mapped[str] = mapped_column(String(15))
    categoria: Mapped[str | None] = mapped_column(String(40))
    fecha_referencia: Mapped[date] = mapped_column(Date)
    es_denominador: Mapped[bool] = mapped_column(Boolean)
    es_numerador: Mapped[bool] = mapped_column(Boolean, server_default="false")
    es_plazo_abierto: Mapped[bool] = mapped_column(Boolean, server_default="false")
    fecha_cumplimiento: Mapped[date | None] = mapped_column(Date)
    motivo_exclusion: Mapped[str | None] = mapped_column(String(40))  # por qué no entró al denominador, si se evaluó y quedó fuera
    detalle: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")


class ReferenciaMinsa(ControlFechas, Base):
    """Lo que MINSA publicó de un mes, para decir «coincide» o «no coincide».
    No entra a ningún cálculo. `documento` dice de dónde se tomó: una cifra
    informada de palabra no vale lo mismo que una leída del reporte oficial."""

    __tablename__ = "referencia_minsa"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    ficha_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("desempeno.ficha.id"))
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    numerador: Mapped[int] = mapped_column(Integer)
    denominador: Mapped[int] = mapped_column(Integer)
    fecha_corte: Mapped[date | None] = mapped_column(Date)
    documento: Mapped[str | None] = mapped_column(String(255))
    observacion: Mapped[str | None] = mapped_column(Text)


class SeguimientoCaso(ControlFechas, Base):
    """Qué se está haciendo con un caso que todavía puede sumar. El caso es la
    persona, la categoría (en la Ficha 14, el tipo de cáncer) y la fecha de su
    diagnóstico: así sobrevive a que se calcule otra vez. No cambia el
    indicador; lo confirma o no la siguiente carga del HIS.

    Tiene datos de pacientes: sin bitácora fila por fila. La fila dice quién la
    cambió por última vez (`usuario_id`) y cuándo (`fecha_actualizacion`)."""

    __tablename__ = "seguimiento_caso"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    ficha_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("desempeno.ficha.id"))
    tipo_documento: Mapped[str | None] = mapped_column(String(5))
    numero_documento: Mapped[str] = mapped_column(String(15))
    categoria: Mapped[str] = mapped_column(String(40))
    fecha_referencia: Mapped[date] = mapped_column(Date)
    estado: Mapped[str] = mapped_column(String(60))
    usuario_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))


class ResultadoRegistrado(ControlFechas, Base):
    """Numerador y denominador de un indicador en un mes, tal como los publica su
    fuente: el reporte DL 1153, el cuadro de GERESA o lo que Estadística digita de una
    oficina. No se calcula aquí. Un mes sin dato no tiene fila: no es un cero."""

    __tablename__ = "resultado_registrado"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    familia: Mapped[str] = mapped_column(String(12))
    indicador: Mapped[int] = mapped_column(SmallInteger)
    serie: Mapped[str] = mapped_column(String(20), server_default="principal")
    ambito: Mapped[str] = mapped_column(String(10), server_default="hospital")
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    numerador: Mapped[Decimal | None] = mapped_column(Numeric(16, 4))
    denominador: Mapped[Decimal | None] = mapped_column(Numeric(16, 4))
    origen: Mapped[str] = mapped_column(String(20))
    fecha_corte: Mapped[date | None] = mapped_column(Date)
    documento: Mapped[str | None] = mapped_column(String(255))
    nota: Mapped[str | None] = mapped_column(Text)
    usuario_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))


class DatoMes(ControlFechas, Base):
    """Lo que Estadística obtiene por su cuenta, por mes: camas, egresos, consulta
    externa y las salas de operaciones."""

    __tablename__ = "dato_mes"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    anio: Mapped[int] = mapped_column(SmallInteger)
    mes: Mapped[int] = mapped_column(SmallInteger)
    clave: Mapped[str] = mapped_column(String(40))
    valor: Mapped[Decimal] = mapped_column(Numeric(16, 4))
    origen: Mapped[str] = mapped_column(String(20), server_default="digitado")
    nota: Mapped[str | None] = mapped_column(Text)
    usuario_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))


class CompromisoAvance(ControlFechas, Base):
    """Cómo va un entregable de un compromiso de mejora. Sin fila, sigue pendiente."""

    __tablename__ = "compromiso_avance"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    anio: Mapped[int] = mapped_column(SmallInteger)
    compromiso: Mapped[int] = mapped_column(SmallInteger)
    entregable: Mapped[str] = mapped_column(String(40))
    estado: Mapped[str] = mapped_column(String(12), server_default="pendiente")
    fecha_cumplimiento: Mapped[date | None] = mapped_column(Date)
    evidencia: Mapped[str | None] = mapped_column(Text)
    usuario_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))
