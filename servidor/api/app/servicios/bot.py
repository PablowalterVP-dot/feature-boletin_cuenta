"""Cliente HTTP del bot validador (`servidor/bot-validador/`, otro componente del sistema).

Le habla con la **clave de la unidad** (`'nutricion'`), no el código del formato
(`'NUT'`): el bot conoce áreas, no formatos — son dos vocabularios distintos que
coinciden por coincidencia en los nombres, no por diseño.

Se le envía `configuracion` (el documento de `formato.v_configuracion_lectura`,
`INFORME_AVANCE_04.md` § 2.4) aunque el bot, leyendo hoy por nombres definidos de
su propia plantilla, no la necesite: es el contrato que describe Alejandro, y el
bot ignora cualquier campo que no lee. El día que tenga un lector genérico, el
backend no cambia.

`anterior` (`{periodo, datos}`, el mes previo ya entregado) alimenta la regla de
variación. El bot no guarda nada, así que se lo manda quien llama; sin él, el bot
omite esa regla sin error.
"""

import base64

import httpx

from app.servicios.errores import BotNoDisponible


def validar_archivo(
    *,
    base_url: str,
    segundos: float,
    area: str,
    periodo: str,
    nombre: str,
    contenido: bytes,
    configuracion: dict | None = None,
    anterior: dict | None = None,
) -> dict:
    """Llama a `POST {base_url}/validaciones`. Devuelve el informe del bot tal cual:
    con `bloqueo`, o con `datos`, `origen`, `errores`, `avisos`, `info`."""
    cuerpo: dict = {
        "area": area,
        "periodo": periodo,
        "nombre": nombre,
        "archivo": base64.b64encode(contenido).decode("ascii"),
    }
    if configuracion is not None:
        cuerpo["configuracion"] = configuracion
    if anterior is not None:
        cuerpo["anterior"] = anterior

    try:
        r = httpx.post(f"{base_url}/validaciones", json=cuerpo, timeout=segundos)
    except httpx.RequestError as e:
        raise BotNoDisponible(f"No se pudo conectar con el bot validador en {base_url}. Revise que esté levantado.") from e

    if r.status_code >= 400:
        try:
            motivo = r.json().get("error")
        except ValueError:
            motivo = None
        raise BotNoDisponible(f"El bot validador rechazó la petición ({r.status_code}): {motivo or 'sin más detalle.'}")

    try:
        return r.json()
    except ValueError as e:
        raise BotNoDisponible("El bot validador respondió algo que no se pudo interpretar como JSON.") from e


def _numero_de_columna(letras: str) -> int:
    n = 0
    for c in letras:
        n = n * 26 + (ord(c) - 64)
    return n


def _letra_de_columna(n: int) -> str:
    letras = ""
    while n > 0:
        n, resto = divmod(n - 1, 26)
        letras = chr(65 + resto) + letras
    return letras


def celda_de_origen(origen_fila: dict, dia: int) -> str:
    """La celda de un día concreto, a partir de la celda de inicio de su fila
    (`{hoja, fila, columna}`, tal como lo da `origen` en el informe del bot: el
    linaje que trae es por fila, no por día). Replica `celdaDeOrigen()` de
    `servidor/bot-validador/src/areas/nutricion/plantilla.js`."""
    inicio = _numero_de_columna(origen_fila["columna"])
    return f"{_letra_de_columna(inicio + dia - 1)}{origen_fila['fila']}"
