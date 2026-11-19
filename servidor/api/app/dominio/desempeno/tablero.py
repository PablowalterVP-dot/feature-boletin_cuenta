"""Cómo se leen los resultados de una ficha en el tablero.

No calcula el indicador (eso es de cada ficha): dice qué es cada caso hoy, qué
datos le faltan a una ficha y cuándo una cifra merece un aviso.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.dominio.desempeno.calendario import cierre_his

# Qué es hoy un caso del denominador.
A_TIEMPO = "a_tiempo"  # inició tratamiento dentro del plazo
POR_CORREGIR = "por_corregir"  # se trató, pero el registro no cumple la regla y no suma
PLAZO_VIGENTE = "plazo_vigente"  # sin tratamiento, y su plazo todavía no vence
ESPERANDO_DATOS = "esperando_datos"  # sin tratamiento y con el plazo pasado, pero los datos cargados no llegan a su vencimiento
SIN_TRATAMIENTO = "sin_tratamiento"  # sin tratamiento, y su plazo ya venció
CLASES = (A_TIEMPO, POR_CORREGIR, PLAZO_VIGENTE, ESPERANDO_DATOS, SIN_TRATAMIENTO)

# Qué datos tiene una ficha.
DATOS_COMPLETOS = "completo"
DATOS_PARCIALES = "parcial"
SIN_FUENTE = "sin_fuente"
NO_APLICA = "no_aplica"

URGENTE_DIAS = 7

# Un mes con 20 % más o menos filas que el anterior suele ser un archivo
# incompleto o de otro mes.
VARIACION_SOSPECHOSA = 0.20


def porcentaje(numerador: int, denominador: int) -> float | None:
    """`None` sin denominador: no se midió, que no es 0 %."""
    return numerador / denominador if denominador else None


def vence(fecha_referencia: date, plazo_dias: int) -> date:
    return fecha_referencia + timedelta(days=plazo_dias)


def limite_del_caso(fecha_referencia: date, plazo_dias: int, fecha_corte: date | None = None) -> date:
    """Hasta qué día hacen falta datos para dar por resuelto el caso: su
    vencimiento, o el corte de MINSA si el mes se calculó con él y llega antes."""
    fin = vence(fecha_referencia, plazo_dias)
    return min(fin, fecha_corte) if fecha_corte is not None else fin


def clase_del_caso(
    *, es_numerador: bool, por_corregir: bool, fecha_referencia: date, plazo_dias: int, hoy: date, datos_hasta: date | None = None, fecha_corte: date | None = None
) -> str:
    """Un caso del denominador, visto hoy.

    «Sin tratamiento, plazo vencido» afirma que no se trató. Solo se puede decir
    si los datos cargados llegan hasta su límite (`datos_hasta`); si no, su
    tratamiento puede estar en una trama que nadie subió: está esperando datos.
    Sin `datos_hasta` no se pregunta (se decide solo con la fecha de hoy)."""
    if es_numerador:
        return A_TIEMPO
    if por_corregir:
        return POR_CORREGIR
    if vence(fecha_referencia, plazo_dias) >= hoy:
        return PLAZO_VIGENTE
    if datos_hasta is not None and datos_hasta < limite_del_caso(fecha_referencia, plazo_dias, fecha_corte):
        return ESPERANDO_DATOS
    return SIN_TRATAMIENTO


def puede_sumar(clase: str, *, fecha_atencion: date | None, hoy: date) -> bool:
    """Si el caso todavía puede pasar al numerador. Uno con el plazo vigente,
    siempre. Uno por corregir, mientras el HIS del mes de su atención acepte
    correcciones."""
    if clase == PLAZO_VIGENTE:
        return True
    if clase == POR_CORREGIR and fecha_atencion is not None:
        return cierre_his(fecha_atencion.year, fecha_atencion.month) >= hoy
    return False


def estado_de_datos(*, aplica: bool, cargables: list[bool]) -> str:
    """`cargables`: si cada fuente de la ficha se puede cargar ya en el sistema.
    Basta una que no para que la ficha no pueda calcular."""
    if not aplica:
        return NO_APLICA
    if cargables and all(cargables):
        return DATOS_COMPLETOS
    return DATOS_PARCIALES if any(cargables) else SIN_FUENTE


def cumple_meta(logro: float | None, meta: float | None) -> bool | None:
    if logro is None or meta is None:
        return None
    return logro >= meta


@dataclass(frozen=True)
class Acumulado:
    numerador: int
    denominador: int

    @property
    def porcentaje(self) -> float | None:
        return porcentaje(self.numerador, self.denominador)


def acumular(meses: list[tuple[int, int]]) -> list[Acumulado]:
    """De (numerador, denominador) de cada mes al acumulado desde enero."""
    n = d = 0
    salida = []
    for numerador, denominador in meses:
        n += numerador
        d += denominador
        salida.append(Acumulado(n, d))
    return salida


def aviso_de_filas(filas: int, filas_de_referencia: int | None) -> float | None:
    """La variación frente a un mes de referencia, si es tan grande que hay que
    avisar. `None` si no hay con qué comparar o si está dentro de lo normal."""
    if not filas_de_referencia:
        return None
    variacion = filas / filas_de_referencia - 1
    return variacion if abs(variacion) > VARIACION_SOSPECHOSA else None
