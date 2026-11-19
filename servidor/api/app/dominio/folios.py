"""Folios, constancias y actas.

Todos salen de una fórmula sobre el periodo y la sigla del área, así que son
legibles y se pueden reconstruir. Pero un reporte se puede enviar y remitir más
de una vez (una rectificación reabre un mes cerrado), y cada envío y cada
remisión son hechos distintos que necesitan su propio comprobante.

El prototipo calculaba la constancia siempre igual, y un reenvío tras una
rectificación quedaba con el mismo número que el primer envío. Aquí el primero
es `CR-2026-08-NUT` y los siguientes, `CR-2026-08-NUT-2`, `-3`… Lo mismo para
las actas.

El folio, en cambio, es del reporte y no cambia: identifica el trámite entero.
"""


def _sufijo(periodo: str, sigla: str) -> str:
    return f"{periodo}-{sigla}"


def _con_numero(base: str, numero: int) -> str:
    if numero < 1:
        raise ValueError("El número de envío o de remisión empieza en 1.")
    return base if numero == 1 else f"{base}-{numero}"


def folio(periodo: str, sigla: str) -> str:
    return f"RE-{_sufijo(periodo, sigla)}"


def constancia(periodo: str, sigla: str, numero_envio: int = 1) -> str:
    """Comprobante de recepción del área: el equivalente del sello del oficio."""
    return _con_numero(f"CR-{_sufijo(periodo, sigla)}", numero_envio)


def acta(periodo: str, sigla: str, numero_remision: int = 1) -> str:
    return _con_numero(f"AR-{_sufijo(periodo, sigla)}", numero_remision)


def constancia_diresa(periodo: str) -> str:
    return f"DIR-{periodo}"
