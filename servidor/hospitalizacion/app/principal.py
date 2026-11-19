"""API del sistema. Todas las escrituras pasan por `acciones.aplicar`."""


from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from app import acciones, autenticacion, cifras, cuentas_estadistica, estado
from app.claves import LARGO_MAXIMO
from app.config import ingreso_de_estadistica, url_app
from app.seguridad import TokenInvalido, leer_token, leer_token_de_estadistica, secreto

app = FastAPI(title="Egresos Hospitalarios")
secreto()  # Sin un JWT_SECRETO válido la API no arranca, como la de Estadística.
# Con INGRESO=estadistica, las sesiones las emite la API de Estadística (decisión 0011).
DE_ESTADISTICA = ingreso_de_estadistica()
motor = create_engine(url_app(), pool_pre_ping=True, connect_args={"options": "-c timezone=UTC"})

MENSAJES = {
    "23P01": "Dos pacientes ocuparían la misma cama en ese horario.",
    "23505": "Ya existe un registro igual: revisa si el paciente ya tiene una orden u hospitalización abierta.",
    "23514": "La base rechazó el registro porque incumple una regla del sistema.",
    "23503": "El registro hace referencia a un dato que no existe.",
    "23001": "Ese registro no se puede borrar: se anula con motivo.",
}


def _rechazo(mensaje: str | list[str], codigo: int = 422) -> HTTPException:
    return HTTPException(status_code=codigo, detail=mensaje)


def _cuenta_de(conexion, cuenta_id: str):
    fila = conexion.execute(text("SELECT id, nombre, rol FROM cuenta WHERE id = :c AND activo"), {"c": cuenta_id}).mappings().first()
    if not fila:
        return None
    servicios = conexion.execute(text("SELECT servicio_id FROM cuenta_servicio WHERE cuenta_id = :c"), {"c": cuenta_id}).scalars().all()
    return {**fila, "servicios": list(servicios)}


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def sesion_para_cambiar_clave(authorization: str | None = Header(default=None)) -> dict:
    """La sesión del token, aunque la cuenta deba cambiar su contraseña. Solo la
    usan `/auth/yo` y `/auth/cambiar-clave`."""
    lector = leer_token_de_estadistica if DE_ESTADISTICA else leer_token
    try:
        return lector((authorization or "").removeprefix("Bearer ").strip())
    except TokenInvalido as e:
        raise _rechazo("La sesión terminó. Vuelve a entrar." if e.vencido else "La sesión no es válida. Vuelve a entrar.", 401) from e


def cuenta_actual(sesion: dict = Depends(sesion_para_cambiar_clave)) -> dict:
    """La cuenta de una sesión que puede operar. Se lee de la base en cada pedido:
    una cuenta desactivada deja de operar sin esperar a que venza su token."""
    if sesion["cc"]:
        raise _rechazo("Debes cambiar tu contraseña antes de continuar.", 403)
    if DE_ESTADISTICA:
        return _cuenta_de_estadistica(sesion)
    with motor.connect() as conexion:
        cuenta = _cuenta_de(conexion, sesion["sub"])
    if not cuenta:
        raise _rechazo("La cuenta ya no está activa.", 401)
    return {**cuenta, "solo_lectura": False}


def _cuenta_de_estadistica(reclamos: dict) -> dict:
    """La cuenta sale de los permisos del token, no de esta base: así un cambio de
    unidad o de rol en Estadística se aplica aquí con el siguiente ingreso."""
    with motor.begin() as conexion:
        servicios, por_departamento = cuentas_estadistica.catalogo(conexion)
        cuenta = cuentas_estadistica.cuenta_desde_token(reclamos, servicios_con_camas=servicios, servicios_por_departamento=por_departamento)
        if cuenta is None:
            raise _rechazo("Esta cuenta no tiene acceso a Hospitalización. Pide a la Oficina de Estadística que te asigne un rol.", 403)
        cuentas_estadistica.sincronizar(conexion, cuenta)
    return cuenta


def _sin_ingreso_propio() -> None:
    if DE_ESTADISTICA:
        raise _rechazo("El ingreso es el del Sistema de Reporte Estadístico.", 404)


def _puede_escribir(cuenta: dict) -> dict:
    """«Ver como» de Estadística es de solo lectura, también aquí."""
    if cuenta.get("solo_lectura"):
        raise _rechazo("Está viendo el sistema como otra cuenta: es solo lectura.", 403)
    return cuenta


def cuenta_que_escribe(cuenta: dict = Depends(cuenta_actual)) -> dict:
    # Estadística solo mira hospitalización (15/11/2026): el plano, el consolidado de
    # censos y RENOXI. Cualquier acción suya se rechaza aquí, en un solo lugar.
    if cuenta["rol"] == "jefatura":
        raise _rechazo("Estadística solo visualiza hospitalización.", 403)
    return _puede_escribir(cuenta)


def _publica(cuenta: dict) -> dict:
    return {k: cuenta[k] for k in ("id", "nombre", "rol", "servicios", "solo_lectura")}



def _escribir(funcion):
    """Ejecuta en una transacción y traduce los rechazos a un mensaje para la pantalla."""
    try:
        with motor.begin() as conexion:
            return funcion(conexion)
    except acciones.ErrorRegla as error:
        raise _rechazo(str(error)) from error
    except DBAPIError as error:
        sqlstate = getattr(error.orig, "sqlstate", None)
        if sqlstate in MENSAJES:
            raise _rechazo(MENSAJES[sqlstate]) from error
        raise


@app.get("/api/salud")
def salud():
    """Que el proceso responde, sin tocar la base: lo usa el HEALTHCHECK del contenedor."""
    return {"ok": True, "ingreso": "estadistica" if DE_ESTADISTICA else "propio"}


class Credenciales(BaseModel):
    usuario: str = Field(min_length=1, max_length=60)
    # Tope de largo: Argon2 es caro a propósito.
    clave: str = Field(min_length=1, max_length=LARGO_MAXIMO)


class CambioDeClave(BaseModel):
    clave_actual: str = Field(min_length=1, max_length=LARGO_MAXIMO)
    clave_nueva: str = Field(min_length=1, max_length=LARGO_MAXIMO)


def _con_registro(funcion):
    """Confirma lo que la función anotó (el intento fallido) aunque termine en rechazo."""
    with motor.begin() as conexion:
        try:
            return funcion(conexion)
        except autenticacion.Rechazo as r:
            rechazo = r
    raise _rechazo(rechazo.detalle, rechazo.codigo)


@app.post("/api/auth/login")
def iniciar_sesion(credenciales: Credenciales, request: Request):
    _sin_ingreso_propio()
    return _con_registro(lambda c: autenticacion.ingresar(c, credenciales.usuario, credenciales.clave, _ip(request)))


@app.get("/api/auth/yo")
def mi_sesion(sesion: dict = Depends(sesion_para_cambiar_clave)):
    if DE_ESTADISTICA:
        return {**_publica(cuenta_actual(sesion)), "usuario": sesion["usr"], "debe_cambiar_clave": sesion["cc"], "expira_en": sesion["exp"]}
    return {"usuario": sesion["usr"], "id": sesion["sub"], "nombre": sesion["nom"], "rol": sesion["rol"], "debe_cambiar_clave": sesion["cc"], "expira_en": sesion["exp"]}


@app.post("/api/auth/cambiar-clave")
def cambiar_clave(cambio: CambioDeClave, request: Request, sesion: dict = Depends(sesion_para_cambiar_clave)):
    _sin_ingreso_propio()
    return _con_registro(lambda c: autenticacion.cambiar_clave(c, sesion["sub"], cambio.clave_actual, cambio.clave_nueva, _ip(request)))




@app.get("/api/estado")
def leer_estado(cuenta: dict = Depends(cuenta_actual)):
    with motor.connect() as conexion:
        return {
            **estado.construir(conexion, cuenta, acciones.ahora_de(conexion)),
            "cuenta": _publica(cuenta),
            "cuentas": _cuentas(conexion),
            "ingreso": "estadistica" if DE_ESTADISTICA else "propio",
        }


@app.get("/api/cifras/{anio}")
def leer_cifras(anio: int, cuenta: dict = Depends(cuenta_actual)):
    """Las cifras del mes, en solo lectura, para ponerlas al lado de las que digita
    Estadística (fase 4 de la decisión 0011). Solo para quien valida: Estadística."""
    if cuenta["rol"] != "jefatura":
        raise _rechazo("Las cifras del mes son de la Oficina de Estadística.", 403)
    if not 2020 <= anio <= 2100:
        raise _rechazo("El año no es válido.")
    with motor.connect() as conexion:
        return cifras.del_anio(conexion, anio)


def _cuentas(conexion) -> list[dict]:
    """Quién es quién en la bitácora y en «Cuentas y bitácora». Con el ingreso de
    Estadística, las cuentas se administran allá: aquí solo se listan."""
    filas = conexion.execute(
        text(
            """SELECT c.id, c.nombre, c.rol, c.origen, c.activo,
                      coalesce(array_agg(cs.servicio_id ORDER BY cs.servicio_id) FILTER (WHERE cs.servicio_id IS NOT NULL), '{}') AS servicios
                 FROM cuenta c LEFT JOIN cuenta_servicio cs ON cs.cuenta_id = c.id
                WHERE c.rol <> 'sistema' GROUP BY c.id ORDER BY c.nombre"""
        )
    ).mappings()
    return [{**f, "servicios": list(f["servicios"])} for f in filas]


@app.post("/api/acciones")
def ejecutar_accion(accion: dict, request: Request, cuenta: dict = Depends(cuenta_que_escribe)):
    def hacer(conexion):
        acciones.aplicar(conexion, cuenta, accion, acciones.ahora_de(conexion), _ip(request))
    _escribir(hacer)
    return {"ok": True}

