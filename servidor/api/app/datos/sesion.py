"""Motor y sesiones de SQLAlchemy.

El motor se crea la primera vez que hace falta y no al importar el módulo: así
las pruebas de dominio y la ruta de salud funcionan sin base de datos.
"""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import obtener_ajustes
from app.dominio.reloj import ZONA


def crear_motor(url: str, **opciones) -> Engine:
    """El motor de SQLAlchemy, con la conexión **forzada a UTF-8**.

    libpq obedece la variable de entorno `PGCLIENTENCODING`, y en Windows es
    habitual que valga `WIN1252`. Sin forzarlo aquí, esa variable haría que el
    texto con acentos (los nombres de las unidades, de las personas) se enviara y se
    leyera en otra codificación: falla al instalar los scripts o, peor, se guarda
    corrupto sin avisar. La base de Alejandro es UTF-8 y aquí no se negocia.

    También fija la **zona horaria de la sesión en Lima**. Sin esto, las fechas
    (`timestamptz`) salen en la zona del servidor PostgreSQL: el mismo envío se
    escribe `…T17:00:00Z` en un servidor en UTC y `…T12:00:00-05:00` en uno en
    Lima. Es el mismo instante, pero la respuesta dependería de cómo se instaló
    el servidor. La zona es la del dominio (`dominio/reloj.ZONA`).
    """
    return create_engine(url, connect_args={"client_encoding": "utf8", "options": f"-c timezone={ZONA.key}"}, **opciones)


@lru_cache
def motor() -> Engine:
    # `pool_pre_ping`: una conexión que PostgreSQL cerró por inactividad se
    # detecta y se reemplaza, en vez de fallar la primera petición de la mañana.
    return crear_motor(obtener_ajustes().url_base, pool_pre_ping=True)


@lru_cache
def fabrica() -> sessionmaker[Session]:
    return sessionmaker(bind=motor(), expire_on_commit=False)


def obtener_sesion_bd() -> Iterator[Session]:
    """Dependencia de FastAPI. No confirma nada por su cuenta: quien escribe
    llama a `commit()`, y si una petición falla a medias, todo se revierte."""
    with fabrica()() as sesion:
        yield sesion
