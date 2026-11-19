"""Compatibilidad del instalador del módulo de desempeño con la estructura
unificada de `bd/migraciones/` y `bd/seeders/`.

    python -m app.herramientas.instalar_desempeno

Para gestionar toda la base de datos (esquema base + módulos + seeders) usa
directamente el gestor unificado:

    python -m app.herramientas.bd migrate
    python -m app.herramientas.bd seed
    python -m app.herramientas.bd status
"""

import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.herramientas.bd import CARPETA_MIGRACIONES, CARPETA_SEEDERS

ESQUEMAS = ("fuente", "desempeno")
MIGRACION_ESQUEMA = CARPETA_MIGRACIONES / "0005_desempeno_esquema.sql"
MIGRACION_TABLERO = CARPETA_MIGRACIONES / "0006_desempeno_tablero.sql"
SEEDER_CATALOGOS = CARPETA_SEEDERS / "0003_desempeno_catalogos.sql"
PRIMERO = MIGRACION_ESQUEMA.name


class NoSePuede(Exception):
    """A la base le falta algo previo, o quedó instalada a medias."""


def scripts() -> list[Path]:
    """Los scripts del módulo en orden de aplicación."""
    return [MIGRACION_ESQUEMA, MIGRACION_TABLERO, SEEDER_CATALOGOS]


def _aplicados(bd: Session) -> set[str]:
    if not bd.execute(text("SELECT to_regclass('desempeno.script_aplicado') IS NOT NULL")).scalar():
        return {PRIMERO}
    registrados = set(bd.execute(text("SELECT script FROM desempeno.script_aplicado WHERE fecha_eliminacion IS NULL")).scalars())
    # Si ya se aplicaron con los nombres antiguos o los nuevos, se consideran listos
    if {"01_esquema.sql", "02_tablero.sql"} <= registrados:
        registrados |= {s.name for s in scripts()}
    return registrados


def _correr(bd: Session, script: Path) -> None:
    with bd.connection().connection.driver_connection.cursor() as cursor:
        cursor.execute(script.read_text(encoding="utf-8"))
    nombre = script.name
    if nombre != PRIMERO and bd.execute(text("SELECT to_regclass('desempeno.script_aplicado') IS NOT NULL")).scalar():
        bd.execute(
            text(
                "INSERT INTO desempeno.script_aplicado (script) "
                "SELECT CAST(:s AS VARCHAR(80)) "
                "WHERE NOT EXISTS (SELECT 1 FROM desempeno.script_aplicado WHERE script = CAST(:s AS VARCHAR(80)) AND fecha_eliminacion IS NULL)"
            ),
            {"s": nombre},
        )


def instalar(bd: Session) -> list[str]:
    """Aplica los scripts del módulo de desempeño que faltan y devuelve cuáles aplicó."""
    presentes = set(bd.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name = ANY(:e)"), {"e": list(ESQUEMAS)}).scalars())
    if presentes and presentes != set(ESQUEMAS):
        raise NoSePuede(f"La base tiene «{sorted(presentes)[0]}» pero no los dos esquemas: quedó a medias.")
    if not presentes and not bd.execute(text("SELECT to_regprocedure('auditoria.fn_instalar_auditoria(text, text)') IS NOT NULL")).scalar():
        raise NoSePuede("La base no tiene el esquema base instalado: ejecute primero `npm run migrate`.")
    ya = _aplicados(bd) if presentes else set()
    faltan = [s for s in scripts() if s.name not in ya]
    for script in faltan:
        _correr(bd, script)
    return [s.name for s in faltan]


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    from app.datos.sesion import fabrica

    print(f"Base de datos: {obtener_ajustes().url_base.split('@')[-1]}")
    try:
        with fabrica()() as bd:
            aplicados = instalar(bd)
            bd.commit()
            tablas = bd.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema = ANY(:e)"), {"e": list(ESQUEMAS)}).scalar()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    if aplicados:
        print(f"Instalado: {', '.join(aplicados)}. Los esquemas «fuente» y «desempeno» tienen {tablas} tablas.")
    else:
        print(f"Ya estaba todo instalado: los esquemas «fuente» y «desempeno» tienen {tablas} tablas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
