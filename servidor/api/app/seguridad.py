"""Contraseñas y tokens.

Las contraseñas se guardan con Argon2id (el valor por omisión de argon2-cffi),
nunca en claro. Los tokens son JWT firmados con HS256 (ver más abajo).
"""

from collections.abc import Iterable
from datetime import datetime, timedelta
from functools import lru_cache

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.dominio import roles
from app.dominio.reloj import ZONA
from app.dominio.sesion import Asignacion, Sesion

_hasher = PasswordHasher()


def hashear_clave(clave: str) -> str:
    return _hasher.hash(clave)


def verificar_clave(clave: str, hash_guardado: str) -> bool:
    """`False` ante cualquier fallo, sin distinguir una clave equivocada de un
    hash ilegible: quien llama no debe poder saber cuál fue."""
    try:
        return _hasher.verify(hash_guardado, clave)
    except (VerificationError, InvalidHashError):
        return False


@lru_cache
def hash_de_relleno() -> str:
    """Un hash que no corresponde a ninguna clave real.

    Al iniciar sesión con un usuario que no existe se verifica contra este, para
    que la respuesta tarde lo mismo que con uno que sí existe. Sin eso, el
    tiempo de respuesta revelaría qué usuarios están registrados.
    """
    return _hasher.hash("relleno-que-nadie-conoce")


# ------------------------------------------------------------------- tokens

# Un solo algoritmo, fijo. Aceptar el que diga el propio token es la puerta de
# los ataques clásicos a JWT (`alg: none`, cambiar RS256 por HS256).
ALGORITMO = "HS256"

# Para quién es el token. Desde el 14/11/2026 también lo lee la API de hospitalización
# (`servidor/hospitalizacion/`, decisión 0011 de Egresos), con el mismo secreto: un
# solo ingreso para los dos sistemas. Un token de hospitalización emitido por ella
# misma (sin «estadistica» entre sus destinatarios) no abre este sistema.
AUDIENCIA = "estadistica"
DESTINATARIOS = [AUDIENCIA, "egresos-hospitalarios"]


class TokenInvalido(Exception):
    """El token no se puede usar. `vencido` lo distingue de uno falso: a quien
    solo venció su sesión se le pide iniciar de nuevo, sin alarma."""

    def __init__(self, motivo: str, *, vencido: bool = False):
        super().__init__(motivo)
        self.vencido = vencido


def crear_token(
    *,
    usuario_id: int,
    usuario: str,
    nombre: str,
    asignaciones: Iterable[Asignacion],
    debe_cambiar_clave: bool,
    ahora: datetime,
    horas: int,
    secreto: str,
    observador_id: int | None = None,
) -> tuple[str, Sesion]:
    """Firma un token de `horas` de vida y devuelve también la `Sesion` que contiene.

    Lleva las asignaciones con sus permisos: así cada petición autoriza sin
    consultar la base. El tiempo lo aporta quien llama (el reloj inyectable), no
    `datetime.now()`.
    """
    emitido = int(ahora.timestamp())
    expira = emitido + int(timedelta(hours=horas).total_seconds())
    reclamos = {
        "sub": str(usuario_id),
        "usr": usuario,
        "nom": nombre,
        "asignaciones": [{"rol": a.rol, "unidad": a.unidad, "permisos": sorted(a.permisos)} for a in asignaciones],
        "cc": bool(debe_cambiar_clave),
        "aud": DESTINATARIOS,
        "iat": emitido,
        "exp": expira,
    }
    # Solo en una sesión de «ver como»: quien mira. Hace la sesión de solo lectura.
    if observador_id is not None:
        reclamos["obs"] = int(observador_id)
    token = jwt.encode(reclamos, secreto, algorithm=ALGORITMO)
    return token, _sesion_de(reclamos)


def _sesion_de(r: dict) -> Sesion:
    lista = r["asignaciones"]
    if not isinstance(lista, list):
        raise ValueError("asignaciones")
    asignaciones = []
    for a in lista:
        if not isinstance(a, dict) or a["rol"] not in roles.ROLES:
            raise ValueError("rol")
        unidad, permisos = a["unidad"], a["permisos"]
        if unidad is not None and not isinstance(unidad, str):
            raise ValueError("unidad")
        if not isinstance(permisos, list) or not all(isinstance(p, str) for p in permisos):
            raise ValueError("permisos")
        asignaciones.append(Asignacion(a["rol"], unidad, frozenset(permisos)))
    if not isinstance(r["cc"], bool):
        raise ValueError("cc")
    observador = r.get("obs")
    if observador is not None and (not isinstance(observador, int) or isinstance(observador, bool)):
        raise ValueError("obs")
    return Sesion(
        usuario_id=int(r["sub"]),
        usuario=str(r["usr"]),
        nombre=str(r["nom"]),
        asignaciones=tuple(asignaciones),
        debe_cambiar_clave=r["cc"],
        emitido_en=datetime.fromtimestamp(r["iat"], ZONA),
        expira_en=datetime.fromtimestamp(r["exp"], ZONA),
        observador_id=observador,
    )


def leer_token(token: str, *, ahora: datetime, secreto: str) -> Sesion:
    """Comprueba firma, forma y vigencia. Lanza `TokenInvalido`.

    La vigencia se compara con el reloj inyectado y no con el del sistema: por
    eso se desactiva la verificación de `exp` de PyJWT y se hace aquí.
    """
    try:
        r = jwt.decode(
            token,
            secreto,
            algorithms=[ALGORITMO],
            options={"require": ["exp", "iat", "sub"], "verify_exp": False, "verify_iat": False, "verify_aud": False},
        )
    except jwt.PyJWTError as e:
        raise TokenInvalido("El token no es válido.") from e
    # Un token sin `aud` es de antes del 14/11/2026 (duran 8 horas) y se acepta; uno
    # con `aud` tiene que nombrar a este sistema.
    aud = r.get("aud")
    if aud is not None and AUDIENCIA not in (aud if isinstance(aud, list) else [aud]):
        raise TokenInvalido("El token no es válido.")

    try:
        vencido = ahora.timestamp() >= float(r["exp"])
        sesion = _sesion_de(r)
    except (KeyError, ValueError, TypeError) as e:
        raise TokenInvalido("El token no tiene la forma esperada.") from e

    if vencido:
        raise TokenInvalido("La sesión venció.", vencido=True)
    return sesion
