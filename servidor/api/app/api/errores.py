"""De los errores de dominio y de la base de datos a respuestas HTTP.

Todas las respuestas de error tienen la misma forma, para que la interfaz las trate igual:

    {"detail": "mensaje para la persona", "codigo": "estado_no_permite", "datos": {...}}

`detail` es el campo estándar de FastAPI; `codigo` es estable y es por lo que la interfaz
decide qué hacer; `datos` trae lo necesario para mostrarlo (qué hallazgos bloquean, qué
destinos sobran…). Vale para los errores de los reportes (dominio, base de datos y datos
inválidos). Los de sesión (401, y el 403 de la contraseña provisional) y los de `/auth`
mantienen su forma `{"detail": "..."}`.

El orden de comprobación del servicio define cuál sale primero: 404, 403, 409, 422.
"""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

from app.datos.sesion import obtener_sesion_bd
from app.servicios import registro

from app.dominio import consultas as consultas_reglas
from app.dominio import transiciones as reglas
from app.servicios.errores import BotNoDisponible, NoEncontrado, NoImplementado, SinPermiso

# El estado HTTP de cada error de dominio.
ESTADO_HTTP: dict[type, int] = {
    reglas.AccionDesconocida: status.HTTP_404_NOT_FOUND,
    NoEncontrado: status.HTTP_404_NOT_FOUND,
    SinPermiso: status.HTTP_403_FORBIDDEN,
    reglas.EstadoNoPermite: status.HTTP_409_CONFLICT,
    reglas.ReporteYaExiste: status.HTTP_409_CONFLICT,
    reglas.SinCargaAceptada: status.HTTP_409_CONFLICT,
    reglas.SinVersionActiva: status.HTTP_409_CONFLICT,
    reglas.ReporteNoEditable: status.HTTP_409_CONFLICT,
    reglas.VersionInconsistente: status.HTTP_409_CONFLICT,
    reglas.PeriodoFuturo: 422,
    reglas.HallazgosBloquean: 422,
    reglas.ArchivoDemasiadoGrande: 422,
    reglas.HallazgoNoJustificable: 422,
    consultas_reglas.RangoInvalido: 422,
    consultas_reglas.FiltrosIncompatibles: 422,
    NoImplementado: status.HTTP_501_NOT_IMPLEMENTED,
    BotNoDisponible: status.HTTP_503_SERVICE_UNAVAILABLE,
}


def cuerpo_de_error(detalle: str, codigo: str, **datos) -> dict:
    return {"detail": detalle, "codigo": codigo, "datos": datos}


def _por_error_de_dominio(_peticion: Request, error: reglas.ErrorDeTransicion) -> JSONResponse:
    estado = ESTADO_HTTP.get(type(error), status.HTTP_409_CONFLICT)
    return JSONResponse(cuerpo_de_error(error.mensaje, error.codigo, **error.datos), status_code=estado)


# SQLSTATE de la BD: `P0001` es un `RAISE EXCEPTION` de un disparador de Alejandro (su
# mensaje está escrito para personas); la clase `23` son violaciones de integridad.
_RAISE_EXCEPTION = "P0001"


def _por_error_de_la_base(_peticion: Request, error: DBAPIError) -> JSONResponse:
    """Traduce a 409 lo que la base rechaza. **No** es una comprobación del backend: es
    la red de seguridad para lo que la base sí impone (un disparador o una restricción).
    Cualquier otro error de la base sigue siendo un 500."""
    original = error.orig
    estado_sql = getattr(original, "sqlstate", None)
    diag = getattr(original, "diag", None)

    if estado_sql == _RAISE_EXCEPTION:
        mensaje = (getattr(diag, "message_primary", None) or "La base de datos rechazó la operación.").strip()
        return JSONResponse(cuerpo_de_error(mensaje, "regla_de_la_base"), status_code=status.HTTP_409_CONFLICT)

    if estado_sql and estado_sql.startswith("23"):
        return JSONResponse(
            cuerpo_de_error(
                "La operación choca con una restricción de la base de datos.",
                "conflicto_con_la_base",
                restriccion=getattr(diag, "constraint_name", None),
            ),
            status_code=status.HTTP_409_CONFLICT,
        )

    raise error  # no es de las que sabemos traducir: que salga como un 500


def _por_datos_invalidos(_peticion: Request, error: RequestValidationError) -> JSONResponse:
    """Los 422 de validación de FastAPI (un periodo mal escrito, un campo que sobra) con
    la misma forma que los demás errores. Sin esto salen como `{"detail": [ ... ]}`, una
    lista, y la interfaz tendría que distinguir dos formas de error."""
    problemas = [
        {"donde": str(e["loc"][0]) if e["loc"] else None, "campo": ".".join(str(x) for x in e["loc"][1:]) or None, "mensaje": e["msg"]}
        for e in error.errors()
    ]
    return JSONResponse(cuerpo_de_error("Los datos enviados no son válidos.", "datos_invalidos", errores=problemas), status_code=422)


def _por_error_inesperado(peticion: Request, error: Exception) -> JSONResponse:
    """Lo que nadie previó. La persona recibe un mensaje que sirve y una referencia
    que se puede buscar en «Funcionamiento»; el detalle técnico no sale de aquí.
    Usa el proveedor de sesiones de la aplicación, no uno propio, para que una
    prueba nunca escriba en la base de desarrollo."""
    referencia = registro.nueva_referencia()
    proveedor = peticion.app.dependency_overrides.get(obtener_sesion_bd, obtener_sesion_bd)
    try:
        sesiones = proveedor()
        bd = next(sesiones)
        try:
            registro.anotar_error(bd, referencia, peticion.method, peticion.url.path, error)
        finally:
            sesiones.close()
    except Exception:  # noqa: BLE001 - la base puede ser justo lo que falló
        registro.logger.exception("No se pudo abrir la base para anotar el error %s", referencia)
    registro.logger.error("Error inesperado %s en %s %s", referencia, peticion.method, peticion.url.path, exc_info=error)
    return JSONResponse(
        cuerpo_de_error(
            f"Ocurrió un problema en el servidor. Intente de nuevo; si continúa, avise a Estadística con esta referencia: {referencia}.",
            "error_interno",
            referencia=referencia,
        ),
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def registrar(app: FastAPI) -> None:
    app.add_exception_handler(reglas.ErrorDeTransicion, _por_error_de_dominio)
    app.add_exception_handler(DBAPIError, _por_error_de_la_base)
    app.add_exception_handler(RequestValidationError, _por_datos_invalidos)
    app.add_exception_handler(Exception, _por_error_inesperado)
