"""Qué día del mes siguiente vence la entrega de un área a un destino.

Es una decisión administrativa, no un hecho del calendario: puede cambiar sin
que el código se despliegue de nuevo. Vive en `organizacion.parametro`
(agregar una fila ahí es dato, no altera el esquema de Alejandro), con la
clave `plazo.{área}.{destino}` (`plazo.NUT.estadistica`) y un respaldo por
destino, `plazo.default.{destino}`, para las áreas que todavía no tienen la
suya confirmada. Se siembra con `app.herramientas.configurar_plazos`.

**`área` es siempre el código de la UNIDAD** (`organizacion.unidad_organica.codigo`:
`NUT`, `NEF`, `LAV`…), nunca el del formato ni su clave. Existe para las diez
desde la semilla, aunque todavía no tengan formato propio (Nefrología,
Lavandería), y no cambia si el día de mañana se les crea uno con un código
distinto: resolver por el formato tenía ese riesgo — una clave que deja de
aplicarse sin que nadie lo note, cayendo al respaldo en silencio.

Aquí solo se decide **qué día**, con los parámetros ya leídos de la base
(`datos/parametros.valores`); convertir ese día en una fecha real de un
periodo sigue siendo trabajo de `dominio/periodos.plazo_de`.

El plazo es un día de **calendario** por omisión: si cae sábado, domingo o
feriado, vence ese día. Desde el panel de administración se puede activar
`plazo.correr_a_dia_habil`: entonces un plazo que cae en fin de semana o en un
feriado registrado (`plazo.feriado.AAAA-MM-DD`) se corre al siguiente día
hábil. Apagado mientras Estadística no confirme la regla, para que activarlo
sea una decisión y no un efecto del despliegue.
"""

import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)

PREFIJO = "plazo."
DIA_MINIMO = 1
DIA_MAXIMO = 28  # todos los meses tienen al menos estos días

AREA_RESPALDO = "default"


def clave(area: str, destino: str) -> str:
    return f"{PREFIJO}{area}.{destino}"


def _entero_valido(valor: str | None, su_clave: str) -> int | None:
    """`None` si falta, o si el valor no sirve (se registra por qué, con su
    clave, para que quien lo sembró mal lo encuentre en el log)."""
    if valor is None:
        return None
    try:
        dia = int(valor)
    except ValueError:
        logger.warning("Parámetro «%s» no es un entero (%r): se usa el respaldo.", su_clave, valor)
        return None
    if not (DIA_MINIMO <= dia <= DIA_MAXIMO):
        logger.warning("Parámetro «%s» = %s está fuera de %s-%s: se usa el respaldo.", su_clave, dia, DIA_MINIMO, DIA_MAXIMO)
        return None
    return dia


def dia_de_entrega(parametros: dict[str, str], area: str, destino: str, *, respaldo_final: int = 10) -> int:
    """`parametros` es el resultado de `datos.parametros.valores(bd, plazos.PREFIJO)`.

    Busca primero el plazo propio del área (`plazo.{area}.{destino}`), luego
    el respaldo del destino (`plazo.default.{destino}`), y por último
    `respaldo_final` — una constante del código, no una fila de la base: si se
    llega hasta aquí es que ni siquiera el respaldo está sembrado, y eso es un
    problema de configuración (nadie corrió `configurar_plazos`), no un dato
    por confirmar con un área.
    """
    clave_area = clave(area, destino)
    especifico = _entero_valido(parametros.get(clave_area), clave_area)
    if especifico is not None:
        return especifico

    clave_respaldo = clave(AREA_RESPALDO, destino)
    general = _entero_valido(parametros.get(clave_respaldo), clave_respaldo)
    if general is not None:
        return general

    logger.warning("Sin «%s» ni «%s»: se usa el respaldo final (día %s). ¿Se corrió configurar_plazos?", clave_area, clave_respaldo, respaldo_final)
    return respaldo_final


# ------------------------------------------------------------ día hábil

CORRER_A_DIA_HABIL = f"{PREFIJO}correr_a_dia_habil"
PREFIJO_FERIADO = f"{PREFIJO}feriado."


def clave_feriado(dia: date) -> str:
    return f"{PREFIJO_FERIADO}{dia.isoformat()}"


def feriados_de(parametros: dict[str, str]) -> dict[date, str]:
    """`{fecha: descripción}` de los feriados registrados. Una clave con una
    fecha imposible se ignora y se registra, como un plazo mal escrito."""
    feriados = {}
    for su_clave, descripcion in parametros.items():
        if not su_clave.startswith(PREFIJO_FERIADO):
            continue
        try:
            feriados[date.fromisoformat(su_clave.removeprefix(PREFIJO_FERIADO))] = descripcion
        except ValueError:
            logger.warning("Parámetro «%s» no es una fecha AAAA-MM-DD: se ignora.", su_clave)
    return feriados


def corre_a_dia_habil(parametros: dict[str, str]) -> bool:
    return parametros.get(CORRER_A_DIA_HABIL) == "true"


def ajustar_a_dia_habil(fecha: date, parametros: dict[str, str]) -> date:
    """La fecha límite real: la misma si la regla está apagada; si no, el
    primer día que no es sábado, domingo ni feriado registrado."""
    if not corre_a_dia_habil(parametros):
        return fecha
    feriados = feriados_de(parametros)
    while fecha.weekday() >= 5 or fecha in feriados:
        fecha += timedelta(days=1)
    return fecha
