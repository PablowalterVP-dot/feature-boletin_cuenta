"""Dependencias compartidas de los endpoints: quién pide, con qué reloj, con qué
configuración y sobre qué transacción.

Todas se pueden sustituir en las pruebas con `app.dependency_overrides`.
"""

import ipaddress

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Ajustes, obtener_ajustes
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import Reloj, RelojSistema
from app.dominio.sesion import Sesion
from app.seguridad import TokenInvalido, leer_token

_esquema = HTTPBearer(auto_error=False, description="Token devuelto por POST /api/auth/login")

# Sin `WWW-Authenticate` un cliente HTTP correcto no sabe que debe presentar
# credenciales; es lo que exige el estándar para un 401.
_ENCABEZADO_401 = {"WWW-Authenticate": "Bearer"}


def obtener_reloj() -> Reloj:
    return RelojSistema()


def obtener_ajustes_api() -> Ajustes:
    return obtener_ajustes()


# ------------------------------------------------------------------- sesión


def sesion_para_cambiar_clave(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_esquema),
    reloj: Reloj = Depends(obtener_reloj),
    ajustes: Ajustes = Depends(obtener_ajustes_api),
) -> Sesion:
    """Lee la sesión del token, **aunque la cuenta deba cambiar su contraseña**.

    Solo la usan `/auth/yo` y `/auth/cambiar-clave`: una cuenta con contraseña
    provisional puede ver quién es y cambiarla, y nada más.
    """
    if credenciales is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta iniciar sesión.", headers=_ENCABEZADO_401)
    try:
        return leer_token(credenciales.credentials, ahora=reloj.ahora(), secreto=ajustes.jwt_secreto)
    except TokenInvalido as e:
        detalle = "La sesión venció. Inicie sesión de nuevo." if e.vencido else "La sesión no es válida. Inicie sesión de nuevo."
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detalle, headers=_ENCABEZADO_401) from e


def sesion_actual(request: Request, sesion: Sesion = Depends(sesion_para_cambiar_clave)) -> Sesion:
    """La sesión de una cuenta que puede operar. Los permisos salen del token y no
    de la base: se leen en cada petición sin consultar nada.

    Una cuenta con contraseña provisional (`debe_cambiar_contrasena`) no pasa: el
    superadmin sembrado nace así, y no debe poder hacer nada hasta cambiarla.
    """
    if sesion.debe_cambiar_clave:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Debe cambiar su contraseña antes de continuar.")
    # «Ver como» (soporte): el administrador ve lo que ve la cuenta, sin poder
    # escribir en su nombre. Se decide aquí, por método, y no endpoint por
    # endpoint: un endpoint nuevo que escribe queda cubierto sin acordarse.
    if sesion.solo_lectura and request.method not in ("GET", "HEAD", "OPTIONS"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Está viendo el sistema como otra cuenta: es solo lectura.")
    return sesion


def exigir_permiso(permiso: str):
    """Puerta de un endpoint: deja pasar a quien tenga el permiso en **alguna**
    unidad (o global).

    Ojo: no basta. Un digitador de Nutrición tiene `reporte.enviar` y aun así no
    puede enviar el reporte de Imágenes; el endpoint debe comprobar además la
    unidad concreta con `sesion.puede(permiso, unidad)`.
    """

    def dependencia(sesion: Sesion = Depends(sesion_actual)) -> Sesion:
        if not sesion.puede_en_alguna(permiso):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Su cuenta no tiene permiso para esta operación.")
        return sesion

    return dependencia


# ---------------------------------------------------------------- auditoría


def direccion_ip(request: Request) -> str | None:
    """La IP del cliente, **solo si es una IP**. La función de la BD que la lee
    (`fn_ip_actual`) hace `::INET`: un valor que no lo sea (`testclient`, un
    nombre de socket) haría fallar toda escritura. Detrás de un proxy inverso
    esto sería la IP del proxy; leer `X-Forwarded-For` queda pendiente hasta
    saber cómo se despliega."""
    host = request.client.host if request.client else None
    try:
        return str(ipaddress.ip_address(host)) if host else None
    except ValueError:
        return None


def fijar_auditoria(bd: Session, usuario_id: int | None, ip: str | None) -> None:
    """Dice a la BD quién actúa, para su bitácora inmutable.

    `set_config(…, true)` vale solo hasta el fin de **esta transacción**: no se
    filtra a otra petición que reutilice la conexión del pool. Por eso se llama
    al empezar cada petición que escribe y el endpoint hace **un solo**
    `commit()` al final: después de él, la transacción siguiente ya no lo sabe.
    Vacío significa «sin dato» (la BD lo lee con NULLIF).
    """
    bd.execute(
        text("SELECT set_config('app.usuario_id', :usuario, true), set_config('app.direccion_ip', :ip, true)"),
        {"usuario": str(usuario_id) if usuario_id else "", "ip": ip or ""},
    )


def bd_auditada(request: Request, bd: Session = Depends(obtener_sesion_bd), sesion: Sesion = Depends(sesion_actual)) -> Session:
    """La sesión de base de datos ya con el usuario y la IP fijados. Todo
    endpoint que escribe la usa en lugar de `obtener_sesion_bd`."""
    fijar_auditoria(bd, sesion.usuario_id, direccion_ip(request))
    return bd
