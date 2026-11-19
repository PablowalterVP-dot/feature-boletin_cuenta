"""El teléfono de contacto de una cuenta (migración 0009): qué forma acepta.

Solo el dominio, sin base de datos: corre en cualquier equipo.
"""

import pytest

from app.dominio.claves import problemas_de_clave
from app.dominio.configuracion import ValorInvalido, telefono_valido


@pytest.mark.parametrize(
    ("escrito", "guardado"),
    [
        ("965123456", "965123456"),
        ("+51 965 123 456", "+51 965 123 456"),
        ("  965   123-456 ", "965 123-456"),
        ("065-251234", "065-251234"),
    ],
)
def prueba_un_telefono_valido_se_guarda_limpio(escrito, guardado):
    assert telefono_valido(escrito) == guardado


@pytest.mark.parametrize("vacio", [None, "", "   "])
def prueba_sin_telefono_no_es_un_error(vacio):
    assert telefono_valido(vacio) is None


@pytest.mark.parametrize(
    "malo",
    ["96512345a", "12345", "1" * 16, "51+965123456", "+51 (965) 123456", "9" * 21],
)
def prueba_un_telefono_mal_escrito_se_rechaza(malo):
    with pytest.raises(ValorInvalido):
        telefono_valido(malo)


def prueba_la_clave_estandar_cumple_la_politica():
    """La contraseña estándar que el equipo usa para todas las cuentas."""
    assert problemas_de_clave("1234567890", "nutricion") == []
