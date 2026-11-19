"""Fixtures compartidas.

Las pruebas marcadas `bd` necesitan un PostgreSQL real: los disparadores de la
auditoría, los `CHECK` con expresiones regulares y las vistas no existen en
SQLite, y una prueba que los simulara no probaría nada.

**La base la instalan las propias pruebas** usando el gestor unificado de
migraciones y seeders (`app.herramientas.bd`): no hace falta preparar
`DATABASE_URL_PRUEBAS` a mano, solo que exista una base vacía a la que apuntar.
Se instala una vez por sesión (`recrear_desde_cero`), y cada prueba corre dentro
de una transacción que se deshace al terminar, así que los datos de los seeders
están siempre y nada de lo que hace una prueba persiste.

La conexión sale **solo** de `DATABASE_URL_PRUEBAS` (entorno o `servidor/api/.env`).
No hay respaldo en `DATABASE_URL`: esa es la base de desarrollo, y una prueba que
cayera en ella por descuido la vaciaría. Sin `DATABASE_URL_PRUEBAS`, las pruebas
que necesitan PostgreSQL se saltan y las demás corren.

**Instalar borra los esquemas del proyecto y `public`.** Salvaguardas:
  1. solo usan `DATABASE_URL_PRUEBAS`;
  2. se niegan a correr si apunta a la misma base que `DATABASE_URL`;
  3. se niegan a correr si la base tiene esquemas o tablas que no sean del
     proyecto (ni de su diseño anterior, que se limpia).
"""

import os
from pathlib import Path

import pytest
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

# Las pruebas no firman tokens reales, pero `Ajustes` exige un secreto largo.
os.environ.setdefault("JWT_SECRETO", "secreto-solo-para-pruebas-0123456789")

from app.config import RAIZ_BACKEND, normalizar_url_base  # noqa: E402
from app.datos.sesion import crear_motor  # noqa: E402
from app.herramientas.bd import (  # noqa: E402
    CARPETA_BD,
    CARPETA_MIGRACIONES,
    CARPETA_PRUEBAS,
    CARPETA_SEEDERS,
    ESQUEMAS_DE_MODULOS,
    ESQUEMAS_DEL_PROYECTO,
    TABLAS_CONTROL_PUBLIC,
    archivos_migraciones,
    archivos_seeders,
    recrear_desde_cero,
)

BD_SCRIPTS = CARPETA_BD

# Tablas de `public` que dejó el diseño anterior del backend (el de Alembic y
# JSONB, descartado) más las tablas de control actuales (`migraciones`, `seeders`).
TABLAS_DEL_DISEÑO_ANTERIOR = frozenset(
    {
        "alembic_version", "areas", "oficinas", "area_destino", "usuarios", "usuario_roles", "reportes",
        "reporte_versiones", "reporte_eventos", "entregas", "remisiones", "remision_destinos",
        "propios_estadistica", "remisiones_diresa",
        *TABLAS_CONTROL_PUBLIC,
    }
)


class _Entorno(BaseSettings):
    """Lo que las pruebas leen del entorno y de `servidor/api/.env`. Aparte de
    `Ajustes`: esa exige `DATABASE_URL` (desarrollo), y una máquina de pruebas
    puede no tenerla."""

    model_config = SettingsConfigDict(env_file=RAIZ_BACKEND / ".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str | None = None
    database_url_pruebas: str | None = None


def _misma_base(a: str, b: str) -> bool:
    x, y = make_url(normalizar_url_base(a)), make_url(normalizar_url_base(b))
    return (x.host, x.port or 5432, x.database) == (y.host, y.port or 5432, y.database)


def _url_de_pruebas() -> str | None:
    entorno = _Entorno()
    if not entorno.database_url_pruebas:
        return None
    if entorno.database_url and _misma_base(entorno.database_url, entorno.database_url_pruebas):
        pytest.skip(
            "DATABASE_URL_PRUEBAS apunta a la misma base que DATABASE_URL (la de desarrollo). "
            "Estas pruebas borran sus esquemas: usa una base aparte."
        )
    return normalizar_url_base(entorno.database_url_pruebas)


# ------------------------------------------------------------ instalación


def scripts_de_instalacion() -> list[Path]:
    """Todos los archivos de migración y seeders en orden secuencial."""
    return [*archivos_migraciones(), *archivos_seeders()]


def detectar_ajenos(motor: Engine) -> list[str]:
    """Esquemas y tablas de `public` que no son del proyecto ni de su diseño
    anterior. Vacía si la base se puede reinstalar sin llevarse nada ajeno."""
    with motor.connect() as c:
        esquemas = c.execute(
            text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name NOT LIKE 'pg\\_%' AND schema_name NOT IN ('information_schema', 'public')"
            )
        ).scalars().all()
        tablas = c.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).scalars().all()
    return sorted(
        [f"esquema {e}" for e in esquemas if e not in ESQUEMAS_DEL_PROYECTO + ESQUEMAS_DE_MODULOS]
        + [f"tabla public.{t}" for t in tablas if t not in TABLAS_DEL_DISEÑO_ANTERIOR]
    )


def instalar_bd(motor: Engine) -> None:
    """Recrea los esquemas desde cero y aplica todas las migraciones y seeders."""
    # `forzar`: es la base de pruebas (nunca la de desarrollo, ver `_url_de_pruebas`),
    # y sus reportes son los que dejaron otras corridas.
    # `con_catalogos=False`: cada prueba carga el formato que necesita y parte de no tenerlo.
    recrear_desde_cero(motor, con_seed=True, forzar=True, con_catalogos=False)


# --------------------------------------------------------------- fixtures


@pytest.fixture(scope="session")
def url_bd() -> str:
    url = _url_de_pruebas()
    if url is None:
        pytest.skip("Sin DATABASE_URL_PRUEBAS: se saltan las pruebas que necesitan PostgreSQL.")
    return url


@pytest.fixture(scope="session")
def motor_bd(url_bd):
    # El mismo motor que usa la aplicación, con UTF-8 forzado.
    motor = crear_motor(url_bd)
    fallo_de_conexion = None
    try:
        ajenos = detectar_ajenos(motor)
    except OperationalError as e:
        fallo_de_conexion = e
    if fallo_de_conexion is not None:
        destino = make_url(url_bd)
        motor.dispose()
        motivo = str(fallo_de_conexion.orig).strip().splitlines()[0] if fallo_de_conexion.orig else str(fallo_de_conexion)
        pytest.fail(
            f"No se pudo conectar a DATABASE_URL_PRUEBAS ({destino.host}:{destino.port or 5432}/{destino.database}): {motivo}. "
            "Revisa servidor/api/.env: ¿siguen los valores de ejemplo de .env.example (usuario:clave@…)?",
            pytrace=False,
        )
    if ajenos:
        motor.dispose()
        pytest.skip(
            f"La base tiene cosas que no son del proyecto ({', '.join(ajenos)}). "
            "Las pruebas la reinstalan desde cero: apunta a una base solo para pruebas."
        )
    instalar_bd(motor)
    yield motor
    motor.dispose()


@pytest.fixture
def sesion(motor_bd):
    """Sesión dentro de una transacción que se deshace al terminar.

    Un `commit()` de la prueba (o del endpoint que prueba) libera un punto de
    guardado, no confirma nada. Los datos de los seeders están siempre.
    """
    conexion = motor_bd.connect()
    transaccion = conexion.begin()
    s = Session(bind=conexion, join_transaction_mode="create_savepoint")
    try:
        yield s
    finally:
        s.close()
        transaccion.rollback()
        conexion.close()
