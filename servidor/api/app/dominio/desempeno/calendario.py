"""Cuándo un mes de datos se puede dar por cerrado.

El HIS sigue recibiendo y corrigiendo registros después de terminado el mes.
Según el cronograma de OGTI (comunicado 001-2026), la corrección del mes se
abre el día 12 del mes siguiente y se cierra el 21. Una carga extraída después
del cierre ya no va a cambiar; una anterior es preliminar.
"""

from calendar import monthrange
from datetime import date, timedelta

DIA_APERTURA = 12
DIA_CIERRE = 21

# El estado de la carga de una fuente en un mes.
CIERRE = "cierre"  # extraída después del cierre del HIS: definitiva
PRELIMINAR = "preliminar"  # extraída antes del cierre, y el cierre aún no llega
RECARGAR = "recargar"  # extraída antes del cierre, y el cierre ya pasó: hay una versión mejor
SIN_FECHA = "sin_fecha"  # el archivo no dice cuándo se extrajo: no se puede afirmar nada
FALTA = "falta"  # el mes terminó y no hay carga
FUTURO = "futuro"  # el mes no terminó: todavía no corresponde cargarlo

# El estado de un mes en el resultado de una ficha.
MES_OFICIAL = "oficial"  # calculado con el corte de un reporte de MINSA
MES_CONSOLIDADO = "consolidado"  # sus fuentes se cargaron después del cierre del HIS
MES_POR_CERRAR = "por_cerrar"  # su carga ya es la final, pero faltan datos posteriores que pueden cambiarlo
MES_PRELIMINAR = "preliminar"  # todavía puede cambiar


def fin_de_mes(anio: int, mes: int) -> date:
    return date(anio, mes, monthrange(anio, mes)[1])


def _mes_siguiente(anio: int, mes: int) -> tuple[int, int]:
    return (anio + 1, 1) if mes == 12 else (anio, mes + 1)


def apertura_his(anio: int, mes: int) -> date:
    """El día en que se abre la corrección del HIS de ese mes."""
    a, m = _mes_siguiente(anio, mes)
    return date(a, m, DIA_APERTURA)


def cierre_his(anio: int, mes: int) -> date:
    """El último día en que se puede corregir el HIS de ese mes."""
    a, m = _mes_siguiente(anio, mes)
    return date(a, m, DIA_CIERRE)


def estado_de_carga(anio: int, mes: int, *, cargado: bool, extraccion: date | None, hoy: date) -> str:
    if not cargado:
        return FALTA if fin_de_mes(anio, mes) < hoy else FUTURO
    if extraccion is None:
        return SIN_FECHA
    cierre = cierre_his(anio, mes)
    if extraccion >= cierre:
        return CIERRE
    return RECARGAR if hoy > cierre else PRELIMINAR


def cubre_hasta(anio: int, mes: int, extraccion: date | None) -> date:
    """Hasta qué día llegan los datos de la carga de un mes. Descargada después
    de terminado el mes (o sin fecha conocida), lo trae entero. Descargada
    antes, llega hasta la víspera: el día de la descarga está a medio digitar."""
    fin = fin_de_mes(anio, mes)
    if extraccion is None or extraccion > fin:
        return fin
    return extraccion - timedelta(days=1)


def datos_hasta(anio: int, cargas: dict[int, date | None]) -> date:
    """Hasta qué día hay datos seguidos desde enero. `cargas`: de cada mes
    cargado, cuándo se descargó (`None` si no se sabe). Se detiene en el primer
    mes que falta o que está a medias: lo que venga después no da continuidad.
    Sin enero, no hay nada del año."""
    hasta = date(anio - 1, 12, 31)
    for mes in range(1, 13):
        if mes not in cargas:
            break
        hasta = cubre_hasta(anio, mes, cargas[mes])
        if hasta < fin_de_mes(anio, mes):
            break
    return hasta


def estado_del_mes(mes: int, *, mes_con_corte: int, cargas: list[str], pendiente: bool = False) -> str:
    """Un mes que cubrió un reporte de MINSA es oficial. Si no, es consolidado
    solo cuando todas sus fuentes se cargaron después del cierre del HIS.

    `pendiente`: los datos cargados todavía no cubren el plazo de sus casos.
    Entonces ni el corte ni el cierre lo hacen definitivo: está por cerrar."""
    if mes <= mes_con_corte:
        return MES_POR_CERRAR if pendiente else MES_OFICIAL
    if cargas and all(c == CIERRE for c in cargas):
        return MES_POR_CERRAR if pendiente else MES_CONSOLIDADO
    return MES_PRELIMINAR


def ventana_de_correccion(hoy: date) -> tuple[int, int] | None:
    """El mes ya terminado cuya corrección del HIS no ha cerrado (abierta o por
    abrir). `None` si no hay ninguno."""
    anio, mes = (hoy.year - 1, 12) if hoy.month == 1 else (hoy.year, hoy.month - 1)
    return (anio, mes) if cierre_his(anio, mes) >= hoy else None
