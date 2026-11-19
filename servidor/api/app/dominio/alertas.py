"""Alertas de un área real, calculadas con el plazo real y el reloj real —
no se guardan, se derivan en cada consulta (igual que `avisos.js` del
frontend para las nueve áreas todavía simuladas: «una notificación que
sobrevive al hecho que la provocó es peor que ninguna»).

Hoy solo hay una: **semana con datos faltantes**. Vive separada de
`dominio/periodos.py`/`dominio/plazos.py` porque no decide un plazo de
entrega (esa alerta, «momento de enviar», ya la resuelve `avisos.js` del
frontend con el plazo real que expone `GET /api/reportes`): decide si la
digitación diaria se está quedando atrás **dentro** del propio periodo que
el área todavía está llenando.

Nutrición entrega mensual, no sube a mitad de mes: si la alerta avisara
desde el primer día sin dato, avisaría *todos los días del mes* hasta que
suban algo, y nadie le haría caso. Por eso:

- No se dispara si el área no subió nada todavía en el periodo (para ese
  caso ya está la alerta de plazo).
- Un día cuenta como faltante solo si **ningún** indicador tiene dato ese
  día, no si falta uno: hay grupos que legítimamente no existen algunos
  meses (internos que rotan, «PATRIMONIO» solo en abril). Exigir todos los
  indicadores haría salir incompleto cualquier mes real.
- Solo mira semanas (lunes a domingo) **ya cerradas**, y dentro de los días
  **ya transcurridos** del mes — nunca un día futuro.

El umbral (cuántos días sin ningún dato, dentro de una semana cerrada,
hacen falta para alertar) es un parámetro de `organizacion.parametro`
(`app.herramientas.configurar_alertas`), no una constante del código:
mientras no se confirme con Giancarlo, puede cambiar sin desplegar.
"""

import logging
from calendar import monthrange
from dataclasses import dataclass
from datetime import date

logger = logging.getLogger(__name__)

PREFIJO = "alerta."
AREA_RESPALDO = "default"
DIA_MINIMO = 1
DIA_MAXIMO = 7  # una semana tiene estos días


def clave(area: str) -> str:
    return f"{PREFIJO}{area}.semana_incompleta_dias"


def _entero_valido(valor: str | None, su_clave: str) -> int | None:
    """Mismo criterio que `dominio/plazos.py`, acotado a 1-7 (días de una
    semana): un valor imposible no debe reventar la alerta, solo caer al
    respaldo y quedar registrado con su clave."""
    if valor is None:
        return None
    try:
        dias = int(valor)
    except ValueError:
        logger.warning("Parámetro «%s» no es un entero (%r): se usa el respaldo.", su_clave, valor)
        return None
    if not (DIA_MINIMO <= dias <= DIA_MAXIMO):
        logger.warning("Parámetro «%s» = %s está fuera de %s-%s: se usa el respaldo.", su_clave, dias, DIA_MINIMO, DIA_MAXIMO)
        return None
    return dias


def dias_minimos_para_alertar(parametros: dict[str, str], area: str, *, respaldo_final: int = 1) -> int:
    """`parametros` es `datos.parametros.valores(bd, alertas.PREFIJO)`. Busca
    primero el umbral propio del área, luego el respaldo general
    (`alerta.default.semana_incompleta_dias`), y por último `respaldo_final`
    — una constante del código, no una fila de la base: si se llega hasta
    aquí es que nadie corrió `configurar_alertas`."""
    clave_area = clave(area)
    especifico = _entero_valido(parametros.get(clave_area), clave_area)
    if especifico is not None:
        return especifico

    clave_respaldo = clave(AREA_RESPALDO)
    general = _entero_valido(parametros.get(clave_respaldo), clave_respaldo)
    if general is not None:
        return general

    logger.warning("Sin «%s» ni «%s»: se usa el respaldo final (%s día(s)). ¿Se corrió configurar_alertas?", clave_area, clave_respaldo, respaldo_final)
    return respaldo_final


def dias_transcurridos(periodo: str, hoy: date) -> list[int]:
    """[1, 2, … n] del `periodo`, recortado al día de hoy: nunca un día
    futuro. En este sistema el periodo que se llena (el vigente) ya es un
    mes cerrado —todos sus días ya pasaron—, pero esta función no asume eso:
    decide por fecha, no por convención, para seguir siendo correcta si
    algún día «el periodo que se llena» dejara de ser siempre el anterior."""
    anio, mes = int(periodo[:4]), int(periodo[5:7])
    if (anio, mes) > (hoy.year, hoy.month):
        return []
    dias_del_mes = monthrange(anio, mes)[1]
    if (anio, mes) < (hoy.year, hoy.month):
        return list(range(1, dias_del_mes + 1))
    return list(range(1, min(hoy.day, dias_del_mes) + 1))


def semanas_cerradas(periodo: str, dias: list[int]) -> list[list[int]]:
    """Las semanas (lunes a domingo) que ya terminaron dentro de `dias`
    (de `dias_transcurridos`). Un resto final que no llega a domingo es la
    semana en curso: no se evalúa todavía, porque le faltaría pedir datos
    de días que ni siquiera pasaron."""
    anio, mes = int(periodo[:4]), int(periodo[5:7])
    cerradas: list[list[int]] = []
    actual: list[int] = []
    for d in dias:
        actual.append(d)
        if date(anio, mes, d).isoweekday() == 7:  # domingo
            cerradas.append(actual)
            actual = []
    return cerradas


@dataclass(frozen=True)
class AlertaSemanaIncompleta:
    """Una semana (lunes a domingo) ya cerrada donde uno o más días no
    tienen dato de ningún indicador."""

    primer_dia: int
    ultimo_dia: int
    dias_sin_dato: tuple[int, ...]


def semanas_con_datos_faltantes(
    tiene_dato_el_dia: dict[int, bool],
    periodo: str,
    hoy: date,
    dias_minimos: int,
) -> tuple[AlertaSemanaIncompleta, ...]:
    """`tiene_dato_el_dia[d]` es si **algún** indicador tiene valor ese día
    (no si los tiene todos: ver el módulo). Un día ausente del diccionario
    cuenta como sin dato.

    Vacío si el área no subió nada todavía en el periodo (no hay de qué
    alertar «a mitad de mes»), o si ninguna semana cerrada llega al
    umbral."""
    dias = dias_transcurridos(periodo, hoy)
    if not any(tiene_dato_el_dia.get(d, False) for d in dias):
        return ()

    resultado = []
    for semana in semanas_cerradas(periodo, dias):
        sin_dato = tuple(d for d in semana if not tiene_dato_el_dia.get(d, False))
        if len(sin_dato) >= dias_minimos:
            resultado.append(AlertaSemanaIncompleta(semana[0], semana[-1], sin_dato))
    return tuple(resultado)
