"""Inicio de sesión y cambio de contraseña, sobre `seguridad.*` de Alejandro."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.dependencias import (
    fijar_auditoria,
    direccion_ip,
    obtener_ajustes_api,
    obtener_reloj,
    sesion_para_cambiar_clave,
)
from app.config import Ajustes
from app.datos.base import vigente
from app.datos.modelos import PermisoUsuario, UnidadOrganica, Usuario
from app.datos.sesion import obtener_sesion_bd
from app.dominio import claves
from app.dominio.reloj import Reloj
from app.dominio.sesion import Asignacion, Sesion, agrupar
from app.seguridad import crear_token, hash_de_relleno, hashear_clave, verificar_clave
from app.servicios import registro

router = APIRouter(prefix="/auth", tags=["autenticación"])

# Una sola respuesta para «no existe» y «clave equivocada»: distinguirlas le
# diría a un atacante qué usuarios están registrados.
_CREDENCIALES_INCORRECTAS = "Usuario o contraseña incorrectos."


# ------------------------------------------------------------------ esquemas


class Credenciales(BaseModel):
    usuario: str = Field(min_length=1, max_length=60)
    # Tope de largo: Argon2 es caro a propósito, y una «contraseña» de varios
    # megabytes sería una forma barata de gastar el servidor.
    clave: str = Field(min_length=1, max_length=claves.LARGO_MAXIMO)


class CambioDeClave(BaseModel):
    clave_actual: str = Field(min_length=1, max_length=claves.LARGO_MAXIMO)
    clave_nueva: str = Field(min_length=1, max_length=claves.LARGO_MAXIMO)


class DatosAsignacion(BaseModel):
    rol: str
    unidad: str | None  # clave de la unidad («nutricion»); nulo = global
    permisos: list[str]


class DatosUsuario(BaseModel):
    id: int
    usuario: str
    nombre: str
    cargo: str | None = None
    correo: str | None = None
    asignaciones: list[DatosAsignacion]
    # Qué tipos de usuario ve la interfaz (area, estadistica, oficina). Epidemiología: area y oficina.
    roles_de_interfaz: list[str]
    # El panel de monitoreo: Estadística, Dirección y el superadministrador.
    ve_monitoreo: bool = False


class RespuestaLogin(BaseModel):
    token: str
    tipo: str = "Bearer"
    expira_en: datetime
    debe_cambiar_clave: bool
    usuario: DatosUsuario


class DatosSesion(BaseModel):
    """Lo que dice el token, sin consultar la base."""

    usuario_id: int
    usuario: str
    nombre: str
    asignaciones: list[DatosAsignacion]
    roles_de_interfaz: list[str]
    debe_cambiar_clave: bool
    emitido_en: datetime
    expira_en: datetime


def _asignaciones_json(asignaciones: tuple[Asignacion, ...]) -> list[DatosAsignacion]:
    return [DatosAsignacion(rol=a.rol, unidad=a.unidad, permisos=sorted(a.permisos)) for a in asignaciones]


# ------------------------------------------------------------------- consultas


def _asignaciones_de(bd: Session, usuario_id: int) -> tuple[Asignacion, ...]:
    """Los permisos efectivos de la cuenta, de `seguridad.v_permiso_usuario`.

    La vista da la unidad como id. Se pasa a su clave, y una asignación a una
    unidad que ya no existe o está inactiva **se descarta**: si se dejara con la
    unidad en blanco, pasaría a contar como asignación global, que es justo lo
    contrario de lo que se quiso al eliminar la unidad.
    """
    filas = bd.execute(
        select(PermisoUsuario.rol_codigo, PermisoUsuario.unidad_organica_id, PermisoUsuario.permiso_codigo, UnidadOrganica.clave)
        .outerjoin(UnidadOrganica, and_(UnidadOrganica.id == PermisoUsuario.unidad_organica_id, vigente(UnidadOrganica), UnidadOrganica.es_activo))
        .where(PermisoUsuario.usuario_id == usuario_id)
    ).all()
    return agrupar((rol, clave, permiso) for rol, unidad_id, permiso, clave in filas if unidad_id is None or clave is not None)


def _emitir(cuenta: Usuario, asignaciones: tuple[Asignacion, ...], reloj: Reloj, ajustes: Ajustes) -> RespuestaLogin:
    token, sesion = crear_token(
        usuario_id=cuenta.id,
        usuario=cuenta.nombre_usuario,
        nombre=cuenta.nombre_completo,
        asignaciones=asignaciones,
        debe_cambiar_clave=cuenta.debe_cambiar_contrasena,
        ahora=reloj.ahora(),
        horas=ajustes.jwt_horas,
        secreto=ajustes.jwt_secreto,
    )
    return RespuestaLogin(
        token=token,
        expira_en=sesion.expira_en,
        debe_cambiar_clave=sesion.debe_cambiar_clave,
        usuario=DatosUsuario(
            id=cuenta.id,
            usuario=cuenta.nombre_usuario,
            nombre=cuenta.nombre_completo,
            cargo=cuenta.cargo,
            correo=cuenta.correo,
            asignaciones=_asignaciones_json(asignaciones),
            roles_de_interfaz=list(sesion.roles_de_interfaz),
            ve_monitoreo=sesion.ve_monitoreo,
        ),
    )


# ------------------------------------------------------------------- endpoints


@router.post("/login", response_model=RespuestaLogin, summary="Iniciar sesión")
def iniciar_sesion(
    credenciales: Credenciales,
    request: Request,
    bd: Session = Depends(obtener_sesion_bd),
    reloj: Reloj = Depends(obtener_reloj),
    ajustes: Ajustes = Depends(obtener_ajustes_api),
) -> RespuestaLogin:
    """Devuelve un token de 8 horas con las asignaciones de la cuenta y sus permisos.

    Una cuenta con contraseña provisional recibe el token con `debe_cambiar_clave`:
    con él solo puede consultar `/auth/yo` y llamar a `/auth/cambiar-clave`.
    """
    nombre = credenciales.usuario.strip().lower()
    # Igual que su índice único: sin distinguir mayúsculas y solo entre las no eliminadas.
    cuenta = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == nombre, vigente(Usuario)))

    # Antes de comprobar nada: quien prueba contraseñas no debe poder seguir
    # probando, ni saber si acertó.
    if registro.demasiados_intentos(bd, nombre):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Demasiados intentos fallidos. Espere {registro.MINUTOS_DE_ESPERA} minutos, o pida a Estadística que revise su cuenta.",
        )

    def rechazar() -> HTTPException:
        registro.anotar_intento(bd, nombre, direccion_ip(request), exitoso=False)
        bd.commit()
        return HTTPException(status.HTTP_401_UNAUTHORIZED, _CREDENCIALES_INCORRECTAS)

    if cuenta is None:
        # Se hace el mismo trabajo que con una cuenta real: si no, el tiempo de
        # respuesta delataría qué usuarios existen.
        verificar_clave(credenciales.clave, hash_de_relleno())
        raise rechazar()

    # La cuenta sembrada sin contraseña trae `POR_ASIGNAR`, que no es un hash:
    # `verificar_clave` da falso y nadie entra con ella.
    if not verificar_clave(credenciales.clave, cuenta.contrasena_hash):
        raise rechazar()

    # Estos dos avisos solo los ve quien ya demostró conocer la contraseña.
    if not cuenta.es_activo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "La cuenta está desactivada. Consulte con la Oficina de Estadística.")
    asignaciones = _asignaciones_de(bd, cuenta.id)
    if not asignaciones:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "La cuenta no tiene ningún permiso asignado. Consulte con la Oficina de Estadística.")

    respuesta = _emitir(cuenta, asignaciones, reloj, ajustes)

    # Quedar registrado en la bitácora a nombre de quien entró. Se hace después de
    # armar la respuesta porque el commit cierra la transacción.
    fijar_auditoria(bd, cuenta.id, direccion_ip(request))
    cuenta.fecha_ultimo_acceso = func.now()
    registro.anotar_intento(bd, nombre, direccion_ip(request), exitoso=True)
    bd.commit()
    return respuesta


@router.get("/yo", response_model=DatosSesion, summary="La sesión del token actual")
def mi_sesion(sesion: Sesion = Depends(sesion_para_cambiar_clave)) -> DatosSesion:
    """Sirve para que la interfaz compruebe que su token sigue vigente y qué
    permisos lleva, sin tocar la base. Responde también a una cuenta que debe
    cambiar su contraseña."""
    return DatosSesion(
        usuario_id=sesion.usuario_id,
        usuario=sesion.usuario,
        nombre=sesion.nombre,
        asignaciones=_asignaciones_json(sesion.asignaciones),
        roles_de_interfaz=list(sesion.roles_de_interfaz),
        debe_cambiar_clave=sesion.debe_cambiar_clave,
        emitido_en=sesion.emitido_en,
        expira_en=sesion.expira_en,
    )


@router.post("/cambiar-clave", response_model=RespuestaLogin, summary="Cambiar la contraseña")
def cambiar_clave(
    cambio: CambioDeClave,
    request: Request,
    sesion: Sesion = Depends(sesion_para_cambiar_clave),
    bd: Session = Depends(obtener_sesion_bd),
    reloj: Reloj = Depends(obtener_reloj),
    ajustes: Ajustes = Depends(obtener_ajustes_api),
) -> RespuestaLogin:
    """Cambia la contraseña de la propia cuenta y devuelve un token nuevo, ya sin
    la marca de cambio obligatorio y con los permisos que la BD dice ahora.

    Es la única operación que una cuenta con contraseña provisional puede hacer.
    """
    cuenta = bd.get(Usuario, sesion.usuario_id)
    if cuenta is None or cuenta.fecha_eliminacion is not None or not cuenta.es_activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La cuenta ya no está disponible.")

    if not verificar_clave(cambio.clave_actual, cuenta.contrasena_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "La contraseña actual no es correcta.")

    problemas = claves.problemas_de_clave(cambio.clave_nueva, cuenta.nombre_usuario, clave_actual=cambio.clave_actual)
    if problemas:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problemas)

    fijar_auditoria(bd, cuenta.id, direccion_ip(request))
    cuenta.contrasena_hash = hashear_clave(cambio.clave_nueva)
    cuenta.debe_cambiar_contrasena = False
    asignaciones = _asignaciones_de(bd, cuenta.id)
    respuesta = _emitir(cuenta, asignaciones, reloj, ajustes)
    bd.commit()
    return respuesta
