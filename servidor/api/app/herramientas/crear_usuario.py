"""Crea una cuenta y le asigna un rol, desde la línea de comandos.

    python -m app.herramientas.crear_usuario dig.nut --nombres Ana --apellidos Pérez --rol digitador --unidad nutricion
    python -m app.herramientas.crear_usuario rev.est --nombres Milagros --apellidos Zumaeta --rol revisor
    python -m app.herramientas.crear_usuario con.pla --nombres Raúl --apellidos Bardales --rol consulta --unidad planeamiento

Existe porque la base no siembra ninguna cuenta de área ni de oficina (solo al
`superadmin`, sin rol de interfaz) y no hay todavía un endpoint para crear
usuarios (queda para la pantalla de administración). Sin esto, probar el
sistema con una cuenta real exige escribir SQL a mano.

Nace con contraseña provisional (`POR_ASIGNAR`, igual que el superadmin
sembrado): el siguiente paso siempre es

    python -m app.herramientas.asignar_clave <usuario>

**Idempotente a propósito.** Si la cuenta ya existe, no la toca (`--nombres`,
`--apellidos`, `--correo` y `--cargo` se ignoran) y solo se ocupa de agregar la
asignación si falta. Esto es lo que permite construir una cuenta con dos roles
—el caso real de Epidemiología, que reporta como área y recibe como oficina—
corriendo esta herramienta dos veces con el mismo usuario y un rol distinto
cada vez, y lo que permite repetir un script de preparación sin que la segunda
corrida falle.

`--rol` exige o admite `--unidad` según el alcance del rol (`seguridad.rol.alcance`,
que ya impone un disparador de la base): se lee de la propia base, no se
duplica aquí, y el error se traduce con el nombre del rol en vez del id
numérico que da el disparador.

Apunta a `DATABASE_URL`, la base de **desarrollo**. No fija quién actúa
(`app.usuario_id`): es un operador con acceso a la base, no un usuario de la
aplicación, igual que `asignar_clave`.
"""

import argparse
import sys
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Rol, UnidadOrganica, Usuario, UsuarioRol


class NoSePuede(Exception):
    """El rol o la unidad no existen, la combinación no es válida, o faltan
    datos para crear la cuenta."""


@dataclass(frozen=True)
class Resultado:
    usuario: Usuario
    creado: bool  # la cuenta se creó ahora (si no, ya existía)
    asignacion_nueva: bool  # el rol (en esa unidad) se agregó ahora


def crear_usuario(
    bd: Session,
    nombre_usuario: str,
    rol: str,
    *,
    unidad: str | None = None,
    nombres: str | None = None,
    apellidos: str | None = None,
    correo: str | None = None,
    cargo: str | None = None,
) -> Resultado:
    """Crea la cuenta si no existe y le agrega la asignación si falta. No
    confirma: quien llama hace `commit()`."""
    el_rol = bd.scalar(select(Rol).where(Rol.codigo == rol, vigente(Rol)))
    if el_rol is None:
        raise NoSePuede(f"No existe el rol «{rol}».")
    if el_rol.alcance == "global" and unidad is not None:
        raise NoSePuede(f"El rol «{rol}» es global: no se le asigna una unidad.")
    if el_rol.alcance == "unidad" and unidad is None:
        raise NoSePuede(f"El rol «{rol}» se asigna a una unidad: falta --unidad.")

    unidad_id = None
    if unidad is not None:
        la_unidad = bd.scalar(select(UnidadOrganica).where(UnidadOrganica.clave == unidad, vigente(UnidadOrganica)))
        if la_unidad is None:
            raise NoSePuede(f"No existe una unidad con clave «{unidad}».")
        unidad_id = la_unidad.id

    cuenta = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == nombre_usuario.strip().lower(), vigente(Usuario)))
    creado = False
    if cuenta is None:
        if not nombres or not apellidos:
            raise NoSePuede("Para crear una cuenta nueva hacen falta --nombres y --apellidos.")
        cuenta = Usuario(
            nombre_usuario=nombre_usuario.strip(),
            correo=correo,
            contrasena_hash="POR_ASIGNAR",
            nombres=nombres.strip(),
            apellidos=apellidos.strip(),
            cargo=cargo,
            es_activo=True,
            debe_cambiar_contrasena=True,
        )
        bd.add(cuenta)
        bd.flush()
        creado = True

    condicion_unidad = UsuarioRol.unidad_organica_id.is_(None) if unidad_id is None else UsuarioRol.unidad_organica_id == unidad_id
    ya_la_tiene = bd.scalar(
        select(UsuarioRol).where(UsuarioRol.usuario_id == cuenta.id, UsuarioRol.rol_id == el_rol.id, condicion_unidad, vigente(UsuarioRol))
    )
    asignacion_nueva = ya_la_tiene is None
    if asignacion_nueva:
        bd.add(UsuarioRol(usuario_id=cuenta.id, rol_id=el_rol.id, unidad_organica_id=unidad_id))
        bd.flush()

    return Resultado(usuario=cuenta, creado=creado, asignacion_nueva=asignacion_nueva)


def _destino(url: str) -> str:
    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    # La consola de Windows debe poder imprimir acentos.
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.crear_usuario",
        description="Crea una cuenta y le asigna un rol en DATABASE_URL (la base de desarrollo). Nace con contraseña provisional.",
    )
    parser.add_argument("usuario", help="nombre de usuario de la cuenta (p. ej. dig.nut)")
    parser.add_argument("--rol", required=True, help="superadmin, admin, digitador, revisor o consulta")
    parser.add_argument("--unidad", default=None, help="clave de la unidad (p. ej. nutricion); según el rol, la exige, la admite o la rechaza")
    parser.add_argument("--nombres", default=None, help="obligatorio si la cuenta no existe todavía")
    parser.add_argument("--apellidos", default=None, help="obligatorio si la cuenta no existe todavía")
    parser.add_argument("--correo", default=None)
    parser.add_argument("--cargo", default=None)
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {_destino(obtener_ajustes().url_base)}")
    try:
        with fabrica()() as bd:
            r = crear_usuario(
                bd, args.usuario, args.rol, unidad=args.unidad, nombres=args.nombres, apellidos=args.apellidos, correo=args.correo, cargo=args.cargo
            )
            bd.commit()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if not r.creado and any((args.nombres, args.apellidos, args.correo, args.cargo)):
        print(f"La cuenta «{args.usuario}» ya existía: se ignoraron --nombres/--apellidos/--correo/--cargo.")
    print(f"Cuenta «{args.usuario}»: {'creada' if r.creado else 'ya existía'}.")
    donde = f"sobre «{args.unidad}»" if args.unidad else "(global)"
    print(f"Asignación {args.rol} {donde}: {'agregada' if r.asignacion_nueva else 'ya la tenía'}.")
    if r.creado:
        print(f"Contraseña provisional (POR_ASIGNAR): asígnela con `python -m app.herramientas.asignar_clave {args.usuario}`.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
