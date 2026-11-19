"""Piezas de `api/dependencias.py` que no necesitan base de datos."""

import pytest
from starlette.requests import Request

from app.api.dependencias import direccion_ip


def peticion(cliente) -> Request:
    return Request({"type": "http", "headers": [], "client": cliente})


@pytest.mark.parametrize("host, esperado", [("10.1.2.3", "10.1.2.3"), ("192.168.0.1", "192.168.0.1"), ("::1", "::1"), ("2001:db8::7", "2001:db8::7")])
def prueba_una_ip_valida_se_pasa_a_la_bitacora(host, esperado):
    assert direccion_ip(peticion((host, 5000))) == esperado


@pytest.mark.parametrize("host", ["testclient", "localhost", "unix-socket", "999.1.1.1", "10.0.0.1/24", ""])
def prueba_lo_que_no_es_una_ip_se_descarta_en_lugar_de_romper_la_escritura(host):
    """La función de la BD que lee la IP hace `::INET`: un valor que no lo sea
    haría fallar toda escritura de la petición."""
    assert direccion_ip(peticion((host, 5000))) is None


def prueba_sin_cliente_no_hay_ip():
    assert direccion_ip(peticion(None)) is None
