"""Qué defunciones cuentan para los indicadores y desde cuándo se conocen.

Es el cruce del script oficial de la Ficha 14: certificados generales en línea,
con DNI, por número de documento. No es de una ficha sola: cualquier indicador
que excluya a quien falleció cruza igual.

Dos decisiones que el script no toma y aquí sí:

- **Un certificado anulado no cuenta.** El script lee una trama ya validada por
  MINSA; el reporte del hospital trae también los anulados.
- **Lo verificado a mano en SINADEF nacional vale igual que un certificado.** El
  reporte del hospital no trae los certificados emitidos en otro lugar.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

CDEF_GENERAL_EN_LINEA = "CDEF GRAL EN LINEA"
DOCUMENTO_DNI = "DNI/LE"
ANULADO = "ANULADO"

_DNI = re.compile(r"[0-9]{8}")


class DefuncionSinFecha(Exception):
    """Un certificado que cuenta no trae fecha de defunción. No se sigue: tratarlo
    como «no falleció» metería a esa persona en un denominador."""


@dataclass(frozen=True)
class Defuncion:
    numero_documento: str
    fecha_defuncion: date
    fecha_registro: date | None = None


def dni_de(numero_documento: str | None) -> str | None:
    """El DNI con que se cruza, o `None` si no sirve para cruzar. Excel deja a
    veces el número como «12345678.0»; ocho ceros es un documento sin llenar."""
    texto = (numero_documento or "").strip().removesuffix(".0")
    if _DNI.fullmatch(texto) is None or texto == "0" * 8:
        return None
    return texto


def certificado_cuenta(tipo_cdef: str | None, estado: str | None, tipo_documento: str | None) -> bool:
    return (
        (tipo_cdef or "").strip() == CDEF_GENERAL_EN_LINEA
        and (estado or "").strip() != ANULADO
        and (tipo_documento or "").strip() == DOCUMENTO_DNI
    )


def conocida_al(defuncion: Defuncion, fecha_corte: date | None) -> bool:
    """Si a la fecha de corte ya había ocurrido y ya estaba registrada. Sin fecha
    de registro se da por conocida: que falte no prueba que se registró tarde."""
    if fecha_corte is None:
        return True
    if defuncion.fecha_defuncion > fecha_corte:
        return False
    return defuncion.fecha_registro is None or defuncion.fecha_registro <= fecha_corte


def fecha_por_documento(defunciones: Iterable[Defuncion], fecha_corte: date | None = None) -> dict[str, date]:
    """La fecha de defunción de cada documento. Si tiene varios certificados
    vale la más temprana."""
    fechas: dict[str, date] = {}
    for d in defunciones:
        if not conocida_al(d, fecha_corte):
            continue
        anterior = fechas.get(d.numero_documento)
        if anterior is None or d.fecha_defuncion < anterior:
            fechas[d.numero_documento] = d.fecha_defuncion
    return fechas
