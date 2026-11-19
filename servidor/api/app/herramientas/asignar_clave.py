"""Asigna la contraseña de una cuenta desde la línea de comandos.

    python -m app.herramientas.asignar_clave superadmin
    python -m app.herramientas.asignar_clave superadmin --definitiva

Existe porque `04_semilla.sql` deja al `superadmin` con la contraseña
`POR_ASIGNAR`, que no es un hash: nadie puede entrar hasta que el backend le
asigne una («La contraseña real se asigna desde el backend», dice el script). Es
el arranque de una base nueva.

La contraseña se pide dos veces sin mostrarla, o se toma de la variable de entorno
`NUEVA_CLAVE` (para automatizar; no la dejes en el historial de la consola).

Por omisión la contraseña es **provisional**: al iniciar sesión, la cuenta solo
puede cambiarla (`debe_cambiar_contrasena`). `--definitiva` la deja como está.

Apunta a `DATABASE_URL`, la base de **desarrollo**. Imprime a qué base apunta
antes de escribir. No fija quién actúa (`app.usuario_id`): es un operador con
acceso a la base, no un usuario de la aplicación, y atribuirle el cambio a la
cuenta sería mentir. La bitácora lo registra igualmente con el usuario de la BD.
"""

import argparse
import getpass
import os
import sys

from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Usuario
from app.dominio import claves
from app.seguridad import hashear_clave


class NoSePuede(Exception):
    """La cuenta no existe o la contraseña no cumple la política."""


def asignar_clave(bd: Session, nombre_usuario: str, clave: str, *, provisional: bool = True) -> Usuario:
    """Guarda el hash de `clave` en la cuenta. No confirma: quien llama hace `commit()`."""
    cuenta = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == nombre_usuario.strip().lower(), vigente(Usuario)))
    if cuenta is None:
        raise NoSePuede(f"No existe una cuenta «{nombre_usuario}».")
    problemas = claves.problemas_de_clave(clave, cuenta.nombre_usuario)
    if problemas:
        raise NoSePuede("La contraseña no cumple la política: " + " ".join(problemas))
    cuenta.contrasena_hash = hashear_clave(clave)
    cuenta.debe_cambiar_contrasena = provisional
    bd.flush()
    return cuenta


def _destino(url: str) -> str:
    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def _pedir_clave() -> str:
    del_entorno = os.environ.get("NUEVA_CLAVE")
    if del_entorno:
        return del_entorno
    primera = getpass.getpass("Nueva contraseña: ")
    if primera != getpass.getpass("Repítela: "):
        raise NoSePuede("Las dos contraseñas no coinciden.")
    return primera


def main(argv: list[str] | None = None) -> int:
    # La consola de Windows debe poder imprimir acentos.
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(prog="python -m app.herramientas.asignar_clave", description="Asigna la contraseña de una cuenta en DATABASE_URL (la base de desarrollo).")
    parser.add_argument("usuario", help="nombre de usuario de la cuenta (p. ej. superadmin)")
    parser.add_argument("--definitiva", action="store_true", help="no obliga a cambiarla al iniciar sesión")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {_destino(obtener_ajustes().url_base)}")
    try:
        clave = _pedir_clave()
        with fabrica()() as bd:
            asignar_clave(bd, args.usuario, clave, provisional=not args.definitiva)
            bd.commit()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(f"Contraseña asignada a «{args.usuario}»." + ("" if args.definitiva else " Es provisional: deberá cambiarla al iniciar sesión."))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
