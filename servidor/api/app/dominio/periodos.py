"""Periodos mensuales y plazos.

Un periodo es la cadena 'AAAA-MM'. Se calcula con aritmética sobre ella y no con
objetos `date`: un mes no tiene día ni hora, y convertirlo en fecha introduce
una zona horaria en un dato que no la tiene. Las cadenas 'AAAA-MM' se ordenan
igual que los meses, así que comparar con `<` es correcto.

El periodo que se reporta es siempre el **mes cerrado**: en septiembre se
reporta agosto. El «hoy» no se lee aquí: lo aporta quien llama, con el reloj
del servidor (o uno fijo en las pruebas).
"""

import re
from datetime import date

# Día del mes siguiente en que vence la entrega del periodo. Es el plazo
# institucional; si cambia, cambia aquí.
DIA_PLAZO = 10

_FORMATO = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


_MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")


def es_periodo(valor: object) -> bool:
    return isinstance(valor, str) and _FORMATO.match(valor) is not None


def _partes(periodo: str) -> tuple[int, int]:
    if not es_periodo(periodo):
        raise ValueError(f"Periodo inválido: {periodo!r}. Debe tener la forma AAAA-MM.")
    anio, mes = periodo.split("-")
    return int(anio), int(mes)


def _armar(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def mes_anterior(periodo: str, cuantos: int = 1) -> str:
    anio, mes = _partes(periodo)
    total = anio * 12 + (mes - 1) - cuantos
    return _armar(total // 12, total % 12 + 1)


def mes_siguiente(periodo: str, cuantos: int = 1) -> str:
    return mes_anterior(periodo, -cuantos)


def periodo_de(fecha: date) -> str:
    return _armar(fecha.year, fecha.month)


def periodo_vigente(hoy: date) -> str:
    """El que toca reportar: el mes anterior al corriente."""
    return mes_anterior(periodo_de(hoy))


def etiqueta(periodo: str) -> str:
    """«agosto de 2026»: como lo escribe la interfaz (`etiquetaPeriodo` del frontend)."""
    anio, mes = _partes(periodo)
    return f"{_MESES[mes - 1]} de {anio}"


def anio_de(periodo: str) -> int:
    return _partes(periodo)[0]


def plazo_de(periodo: str, dia: int = DIA_PLAZO) -> date:
    """Último día para entregar el periodo: el `dia` dado del mes siguiente.

    Sin `dia`, es el plazo genérico (`DIA_PLAZO`, el mismo que usa `v_cumplimiento`
    de Alejandro). Quien necesite el plazo real por área y destino se lo pasa ya
    resuelto (`dominio/plazos.dia_de_entrega`); esta función solo convierte un día
    del mes en la fecha real del periodo."""
    anio, mes = _partes(mes_siguiente(periodo))
    return date(anio, mes, dia)


def esta_vencido(periodo: str, hoy: date) -> bool:
    return hoy > plazo_de(periodo)


def dias_de_retraso(periodo: str, hoy: date) -> int:
    """Días desde el vencimiento. Cero o negativo: todavía hay plazo."""
    return (hoy - plazo_de(periodo)).days
