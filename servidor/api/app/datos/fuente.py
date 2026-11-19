"""Lectura de los datos crudos (`fuente`) para calcular con ellos.

Solo acceso a datos. Dos cuidados en cada consulta: **solo la carga vigente** de
cada mes —lo reemplazado no cuenta— y nada eliminado lógicamente.

Devuelve los valores como están guardados, en texto: interpretarlos es de quien
calcula. El día que haya acceso directo al HIS y a SINADEF, lo que cambia es
este archivo; las reglas y los servicios no se enteran.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import DefuncionVerificada, Fuente, HisAtencion, LoteMes, SinadefDefuncion

# Los códigos del catálogo `fuente.fuente`, que siembra el script del esquema.
FUENTE_HIS = "his_minsa"
FUENTE_SINADEF = "sinadef_hrl"
FUENTE_VERIFICADOS = "sinadef_verificado"


@dataclass(frozen=True)
class FilaHis:
    """De una atención, lo que hasta hoy mira algún indicador. Otra ficha que
    necesite otra columna la agrega aquí y en la consulta."""

    tipo_documento: str | None
    numero_documento: str | None
    id_cita: str | None
    fecha_atencion: date
    codigo_item: str | None
    tipo_diagnostico: str | None
    valor_lab: str | None
    genero: str | None
    edad_reg: str | None
    tipo_edad: str | None
    fecha_registro: str | None


@dataclass(frozen=True)
class FilaSinadef:
    tipo_cdef: str | None
    estado: str | None
    tipo_documento: str | None
    numero_documento: str | None
    fecha_defuncion: date | None
    fecha_registro: date | None
    fila_archivo: int
    periodo: str


def _de_la_carga_vigente(tabla, codigo_de_fuente: str):
    return (
        select()
        .select_from(tabla)
        .join(LoteMes, LoteMes.id == tabla.lote_mes_id)
        .join(Fuente, Fuente.id == LoteMes.fuente_id)
        .where(Fuente.codigo == codigo_de_fuente, LoteMes.es_vigente, vigente(LoteMes), vigente(tabla))
    )


def atenciones_del_his(bd: Session, *, codigos: frozenset[str], desde: date) -> Iterator[FilaHis]:
    """Las atenciones con alguno de esos códigos, de `desde` en adelante. Sin
    tope final a propósito: el seguimiento de un diagnóstico de diciembre sigue
    en enero."""
    a = HisAtencion
    consulta = (
        _de_la_carga_vigente(a, FUENTE_HIS)
        .add_columns(
            a.id_tipo_documento_paciente, a.numero_documento_paciente, a.id_cita, a.fecha_atencion, a.codigo_item,
            a.tipo_diagnostico, a.valor_lab, a.genero, a.edad_reg, a.tipo_edad, a.fecha_registro,
        )  # fmt: skip
        .where(a.codigo_item.in_(sorted(codigos)), a.fecha_atencion >= desde)
        # El orden del archivo: el resultado no depende de él, pero así dos
        # lecturas de los mismos datos son iguales fila por fila.
        .order_by(a.fecha_atencion, a.id)
    )
    for fila in bd.execute(consulta):
        yield FilaHis(*fila)


def certificados_de_sinadef(bd: Session) -> Iterator[FilaSinadef]:
    """Todos los certificados cargados, anulados incluidos: cuáles cuentan lo
    decide quien calcula."""
    s = SinadefDefuncion
    consulta = (
        _de_la_carga_vigente(s, FUENTE_SINADEF)
        .add_columns(s.tipo_cdef, s.estado, s.tipo_documento, s.numero_documento, s.fecha_defuncion, s.fecha_registro, s.fila_archivo, LoteMes.anio, LoteMes.mes)
        .order_by(LoteMes.anio, LoteMes.mes, s.fila_archivo)
    )
    for *datos, anio, mes in bd.execute(consulta):
        yield FilaSinadef(*datos, periodo=f"{anio:04d}-{mes:02d}")


def defunciones_verificadas(bd: Session) -> list[tuple[str, date, date | None]]:
    """Documento, fecha de defunción y fecha de registro de cada verificada a mano."""
    v = DefuncionVerificada
    return [tuple(f) for f in bd.execute(select(v.numero_documento, v.fecha_defuncion, v.fecha_registro).where(vigente(v)).order_by(v.id))]

