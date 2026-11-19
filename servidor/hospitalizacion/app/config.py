"""Configuración leída del ambiente o, en desarrollo, de `servidor/hospitalizacion/.env`.

Como cada servicio de este repositorio (`servidor/api/.env`), la API de
hospitalización tiene su propio `.env`. En Docker no hay archivo: todo llega
por variables de entorno (`docker-compose.yml`)."""

import os
from pathlib import Path
from urllib.parse import quote

RAIZ = Path(__file__).resolve().parents[1]


def _leer_env() -> dict[str, str]:
    archivo = RAIZ / ".env"
    if not archivo.exists():
        return {}
    valores = {}
    for linea in archivo.read_text(encoding="utf-8-sig").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#") and "=" in linea:
            clave, valor = linea.split("=", 1)
            valores[clave.strip()] = valor.strip()
    return valores


_ENV = _leer_env()


def _de_archivo(nombre: str) -> str | None:
    """`<NOMBRE>_ARCHIVO` apunta a un archivo con el valor. En Docker, las claves de la
    base las genera el contenedor `hospitalizacion-db` la primera vez y las deja en
    un volumen (decisión 0014): nadie tiene que inventarlas ni escribirlas en `.env`."""
    ruta = os.environ.get(f"{nombre}_ARCHIVO")
    if not ruta or not Path(ruta).exists():
        return None
    return Path(ruta).read_text(encoding="utf-8").strip() or None


def variable(nombre: str, defecto: str | None = None) -> str:
    valor = os.environ.get(nombre) or _ENV.get(nombre) or _de_archivo(nombre) or defecto
    if valor is None:
        raise RuntimeError(f"Falta la variable {nombre}. Revisa .env.example.")
    return valor


def _url(usuario: str, clave: str, base: str | None = None) -> str:
    """La base es aparte de la de Estadística (decisión 0011): mismo servidor de
    PostgreSQL, otra base. En Docker el host es `host.docker.internal`."""
    host = variable("EGRESOS_DB_HOST", "127.0.0.1")
    puerto = variable("EGRESOS_DB_PUERTO", "5544")
    nombre = base or variable("EGRESOS_DB", "egresos")
    return f"postgresql+psycopg://{usuario}:{quote(clave, safe='')}@{host}:{puerto}/{nombre}"


def url_owner(base: str | None = None) -> str:
    return _url("egresos_owner", variable("EGRESOS_OWNER_CLAVE"), base)


def url_app(base: str | None = None) -> str:
    return _url("egresos_app", variable("EGRESOS_APP_CLAVE"), base)


def es_demo() -> bool:
    return variable("APP_ENV", "desarrollo") != "produccion"


def ingreso_de_estadistica() -> bool:
    """`INGRESO=estadistica` (fase 3 de la decisión 0011): las sesiones las emite la
    API de Estadística y esta solo las lee. `propio` deja el ingreso de este
    sistema, para probarlo solo."""
    modo = variable("INGRESO", "propio")
    if modo not in ("propio", "estadistica"):
        raise RuntimeError(f"INGRESO debe ser «propio» o «estadistica», no «{modo}».")
    return modo == "estadistica"
