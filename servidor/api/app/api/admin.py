"""Panel del superadministrador.

    GET    /api/admin/resumen                        estado de cada área y cifras del año
    GET    /api/admin/funcionamiento                 API, base, bot, cargas y cuentas
    GET    /api/admin/plazos                         plazos, día hábil, feriados y umbral de alertas
    PUT    /api/admin/plazos                         el día de un área (o el respaldo) a un destino
    PUT    /api/admin/plazos/dia-habil               correr o no el plazo al siguiente día hábil
    POST   /api/admin/feriados                       registrar un feriado
    DELETE /api/admin/feriados/{fecha}               quitarlo
    PUT    /api/admin/alertas                        umbral de «semana con datos faltantes»
    GET    /api/admin/catalogo                       roles y unidades, para los formularios
    GET    /api/admin/cuentas                        todas las cuentas con sus roles
    POST   /api/admin/cuentas                        crear una cuenta con su primer rol
    PATCH  /api/admin/cuentas/{id}                   nombres, apellidos, correo, cargo, documento, activa
    DELETE /api/admin/cuentas/{id}                   eliminar la cuenta (borrado lógico)
    POST   /api/admin/cuentas/{id}/roles             agregar un rol (en una unidad o global)
    DELETE /api/admin/cuentas/{id}/roles/{asig}      quitar un rol
    POST   /api/admin/cuentas/{id}/clave             restablecer la contraseña (provisional por omisión)
    GET    /api/admin/areas                          formato, versión activa y si está en el flujo
    PUT    /api/admin/areas/{clave}/flujo            pausar o reanudar un área (con justificación)
    GET    /api/admin/matriz                         destinos vigentes e históricos
    POST   /api/admin/matriz                         agregar un destino (con justificación)
    POST   /api/admin/matriz/{id}/retirar            retirarlo desde hoy (con justificación)
    GET    /api/admin/hospitalizacion/unidades       departamentos y áreas de hospitalización
    POST   /api/admin/hospitalizacion/unidades       habilitar uno (clave hosp-dep-… o hosp-area-…)
    PATCH  /api/admin/hospitalizacion/unidades/{c}   código, nombres o si está activa
    GET    /api/admin/bitacora                       auditoria.registro_cambio, filtrable y paginada
    GET    /api/admin/personalizacion                nombre, mensaje del ingreso, aviso general, preferencias
    PUT    /api/admin/personalizacion
    POST   /api/admin/ver-como/{id}                  token de solo lectura de otra cuenta (con justificación)

Cada grupo exige su permiso **global** (`Sesion.puede(permiso)` sin unidad): un
administrador de unidad tiene `usuario.gestionar` sobre la suya, no sobre el
hospital. Hoy solo el superadministrador los tiene todos en global; el revisor
de Estadística tiene `auditoria.ver` y por eso puede leer la bitácora.
"""

from collections.abc import Callable
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import DatosUsuario, RespuestaLogin, _asignaciones_de, _asignaciones_json
from app.api.dependencias import bd_auditada, obtener_ajustes_api, obtener_reloj, sesion_actual
from app.config import Ajustes
from app.datos.sesion import obtener_sesion_bd
from app.dominio import configuracion, periodos
from app.dominio.configuracion import Personalizacion, ValorInvalido
from app.dominio.reloj import ZONA, Reloj
from app.dominio.sesion import Sesion
from app.seguridad import crear_token
from app.servicios import admin as servicio
from app.servicios import cobertura as servicio_cobertura
from app.servicios import unidades_hospitalizacion as servicio_hosp

router = APIRouter(prefix="/admin", tags=["administración"])

USUARIOS = "usuario.gestionar"
ORGANIZACION = "organizacion.gestionar"
AUDITORIA = "auditoria.ver"

# «Ver como» dura poco a propósito: es para mirar un problema, no para quedarse.
HORAS_VER_COMO = 1


def exigir_global(permiso: str) -> Callable[..., Sesion]:
    def dependencia(sesion: Sesion = Depends(sesion_actual)) -> Sesion:
        if not sesion.puede(permiso):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta sección es del superadministrador.")
        return sesion

    return dependencia


def _hacer(fn: Callable[[], Any]) -> Any:
    """Traduce los errores del servicio a HTTP con su mensaje para la persona."""
    try:
        return fn()
    except servicio.NoEncontrado as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    except servicio.Conflicto as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    except ValorInvalido as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e


def _escribir(bd: Session, fn: Callable[[], Any]) -> Any:
    resultado = _hacer(fn)
    bd.commit()
    return resultado


# =========================================================================== resumen


class UltimoEnvio(BaseModel):
    periodo: str
    fecha: datetime
    a_tiempo: bool


class AreaDelResumen(BaseModel):
    clave: str
    codigo: str
    nombre: str
    activa: bool
    formato: str | None
    version_activa: str | None
    en_flujo: bool
    estado_periodo_vigente: str
    fecha_limite_vigente: date
    ultimo_envio: UltimoEnvio | None


class Resumen(BaseModel):
    hoy: date
    periodo_vigente: str
    anio: int
    areas: list[AreaDelResumen]
    enviados_del_anio: int
    a_tiempo_del_anio: int
    puntualidad: float | None = Field(description="Porcentaje de envíos dentro del plazo en el año. Nulo sin envíos: no es 0 %.")
    rectificaciones_del_anio: int


@router.get("/resumen", response_model=Resumen, summary="Resumen del sistema")
def ver_resumen(
    _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj)
) -> Resumen:
    return Resumen(**servicio.resumen(bd, reloj.ahora()))


@router.get("/cobertura", summary="Qué meses tiene cada área en esta base")
def ver_cobertura(
    anio: int | None = Query(None, ge=2000, le=2100, description="Por omisión, el del periodo vigente."),
    _: Sesion = Depends(exigir_global(ORGANIZACION)),
    bd: Session = Depends(obtener_sesion_bd),
    reloj: Reloj = Depends(obtener_reloj),
) -> dict:
    """Cada área que reporta, mes a mes: su estado, el archivo vigente y su huella
    (`servicios/cobertura.py`). Es lo que hay que mirar antes de juntar bases."""
    hoy = reloj.ahora().astimezone(ZONA).date()
    return servicio_cobertura.cobertura(bd, anio or periodos.anio_de(periodos.periodo_vigente(hoy)), hoy)


@router.get("/funcionamiento", summary="Cómo está funcionando el sistema")
def ver_funcionamiento(
    _: Sesion = Depends(exigir_global(ORGANIZACION)),
    bd: Session = Depends(obtener_sesion_bd),
    reloj: Reloj = Depends(obtener_reloj),
    ajustes: Ajustes = Depends(obtener_ajustes_api),
) -> dict:
    """Los ingresos fallidos no se registran en ninguna tabla (el login no los
    guarda), así que no se informan: no se inventa una cifra."""
    return servicio.funcionamiento(bd, ajustes, reloj.ahora())


# ============================================================================ plazos


class CambioDePlazo(BaseModel):
    area: str = Field(min_length=1, max_length=20, description="Código de la unidad (NUT) o «default» para el respaldo.")
    destino: str = Field(pattern="^(estadistica|planeamiento|diresa)$")
    dia: int | None = Field(default=None, description="Nulo quita el plazo propio: vuelve al respaldo.")


class ReglaDiaHabil(BaseModel):
    activa: bool


class NuevoFeriado(BaseModel):
    fecha: date
    descripcion: str = Field(min_length=1, max_length=120)


class CambioDeAlerta(BaseModel):
    area: str = Field(min_length=1, max_length=20)
    dias: int | None = None


@router.get("/plazos", summary="Plazos, feriados y alertas")
def ver_plazos(
    _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj)
) -> dict:
    return servicio.ver_plazos(bd, reloj.ahora())


@router.put("/plazos", status_code=204, summary="Cambiar un plazo")
def cambiar_plazo(cambio: CambioDePlazo, _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada)) -> None:
    _escribir(bd, lambda: servicio.fijar_plazo(bd, cambio.area, cambio.destino, cambio.dia))


@router.put("/plazos/dia-habil", status_code=204, summary="Correr el plazo al siguiente día hábil")
def cambiar_dia_habil(regla: ReglaDiaHabil, _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada)) -> None:
    _escribir(bd, lambda: servicio.fijar_regla_dia_habil(bd, regla.activa))


@router.post("/feriados", status_code=204, summary="Registrar un feriado")
def nuevo_feriado(feriado: NuevoFeriado, _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada)) -> None:
    _escribir(bd, lambda: servicio.agregar_feriado(bd, feriado.fecha, feriado.descripcion))


@router.delete("/feriados/{fecha}", status_code=204, summary="Quitar un feriado")
def borrar_feriado(fecha: date, _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada)) -> None:
    _escribir(bd, lambda: servicio.quitar_feriado(bd, fecha))


@router.put("/alertas", status_code=204, summary="Umbral de la alerta de semana incompleta")
def cambiar_alerta(cambio: CambioDeAlerta, _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada)) -> None:
    _escribir(bd, lambda: servicio.fijar_alerta(bd, cambio.area, cambio.dias))


# =========================================================================== cuentas


class Asignacion(BaseModel):
    id: int
    rol: str
    rol_nombre: str
    unidad: str | None
    unidad_nombre: str | None


class Cuenta(BaseModel):
    id: int
    usuario: str
    nombres: str
    apellidos: str
    correo: str | None
    cargo: str | None
    numero_documento: str | None
    telefono: str | None = Field(default=None, description="Número de contacto (celular) del responsable")
    activa: bool
    clave: str = Field(description="sin_asignar · provisional (debe cambiarla al entrar) · definitiva")
    ultimo_acceso: datetime | None
    creada: datetime
    asignaciones: list[Asignacion]


class NuevaCuenta(BaseModel):
    usuario: str = Field(min_length=3, max_length=60)
    nombres: str = Field(min_length=1, max_length=100)
    apellidos: str = Field(min_length=1, max_length=100)
    correo: str | None = Field(default=None, max_length=150)
    cargo: str | None = Field(default=None, max_length=150)
    numero_documento: str | None = Field(default=None, max_length=20)
    telefono: str | None = Field(default=None, max_length=20)
    rol: str = Field(min_length=1, max_length=40)
    unidad: str | None = Field(default=None, max_length=60)


class CambiosDeCuenta(BaseModel, extra="forbid"):
    nombres: str | None = Field(default=None, max_length=100)
    apellidos: str | None = Field(default=None, max_length=100)
    correo: str | None = Field(default=None, max_length=150)
    cargo: str | None = Field(default=None, max_length=150)
    numero_documento: str | None = Field(default=None, max_length=20)
    telefono: str | None = Field(default=None, max_length=20)
    activa: bool | None = None


class NuevoRol(BaseModel):
    rol: str = Field(min_length=1, max_length=40)
    unidad: str | None = Field(default=None, max_length=60)


class NuevaClave(BaseModel):
    clave: str = Field(min_length=1, max_length=200)
    provisional: bool = Field(default=True, description="La persona debe cambiarla al entrar. Lo recomendable.")


@router.get("/catalogo", summary="Roles y unidades")
def ver_catalogo(_: Sesion = Depends(exigir_global(USUARIOS)), bd: Session = Depends(obtener_sesion_bd)) -> dict:
    return servicio.catalogo(bd)


@router.get("/cuentas", response_model=list[Cuenta], summary="Todas las cuentas")
def ver_cuentas(_: Sesion = Depends(exigir_global(USUARIOS)), bd: Session = Depends(obtener_sesion_bd)) -> list[dict]:
    return servicio.listar_cuentas(bd)


@router.post("/cuentas", response_model=Cuenta, status_code=201, summary="Crear una cuenta")
def nueva_cuenta(datos: NuevaCuenta, _: Sesion = Depends(exigir_global(USUARIOS)), bd: Session = Depends(bd_auditada)) -> dict:
    """Nace sin contraseña: el siguiente paso es `POST …/clave` (provisional)."""
    return _escribir(bd, lambda: servicio.crear_cuenta(bd, **datos.model_dump()))


@router.patch("/cuentas/{usuario_id}", response_model=Cuenta, summary="Editar una cuenta")
def editar_cuenta(
    datos: CambiosDeCuenta, usuario_id: int = Path(ge=1), actor: Sesion = Depends(exigir_global(USUARIOS)), bd: Session = Depends(bd_auditada)
) -> dict:
    """Solo cambia lo que viene en el cuerpo. Un campo opcional enviado como nulo
    se vacía (el correo, el cargo, el documento); nombres y apellidos no admiten
    quedar vacíos. Lo que la persona ve en su perfil cambia al volver a entrar."""
    return _escribir(bd, lambda: servicio.editar_cuenta(bd, actor, usuario_id, datos.model_dump(exclude_unset=True)))


@router.delete("/cuentas/{usuario_id}", status_code=204, summary="Eliminar una cuenta")
def eliminar_cuenta(usuario_id: int = Path(ge=1), actor: Sesion = Depends(exigir_global(USUARIOS)), bd: Session = Depends(bd_auditada)) -> None:
    """Deja de existir para el sistema: no aparece, no entra, su usuario queda
    libre. Lo que hizo se conserva a su nombre (`servicios/admin.py`). Una
    sesión ya abierta sigue hasta que venza, como al desactivarla."""
    _escribir(bd, lambda: servicio.eliminar_cuenta(bd, actor, usuario_id))


@router.post("/cuentas/{usuario_id}/roles", response_model=Cuenta, summary="Agregar un rol")
def agregar_rol(datos: NuevoRol, usuario_id: int = Path(ge=1), _: Sesion = Depends(exigir_global(USUARIOS)), bd: Session = Depends(bd_auditada)) -> dict:
    return _escribir(bd, lambda: servicio.asignar_rol(bd, usuario_id, datos.rol, datos.unidad))


@router.delete("/cuentas/{usuario_id}/roles/{asignacion_id}", response_model=Cuenta, summary="Quitar un rol")
def quitar_rol(
    usuario_id: int = Path(ge=1), asignacion_id: int = Path(ge=1), actor: Sesion = Depends(exigir_global(USUARIOS)), bd: Session = Depends(bd_auditada)
) -> dict:
    return _escribir(bd, lambda: servicio.quitar_rol(bd, actor, usuario_id, asignacion_id))


@router.post("/cuentas/{usuario_id}/clave", response_model=Cuenta, summary="Restablecer la contraseña")
def restablecer_clave(datos: NuevaClave, usuario_id: int = Path(ge=1), _: Sesion = Depends(exigir_global(USUARIOS)), bd: Session = Depends(bd_auditada)) -> dict:
    return _escribir(bd, lambda: servicio.restablecer_clave(bd, usuario_id, datos.clave, provisional=datos.provisional))


# ======================================================================== áreas y matriz


class CambioDeFlujo(BaseModel):
    en_flujo: bool
    justificacion: str = Field(min_length=1, max_length=2000)


class NuevoDestino(BaseModel):
    origen: str = Field(min_length=1, max_length=60)
    destino: str = Field(min_length=1, max_length=60)
    entrega_inmediata: bool = False
    justificacion: str = Field(min_length=1, max_length=2000)


class Justificacion(BaseModel):
    justificacion: str = Field(min_length=1, max_length=2000)


@router.get("/areas", summary="Áreas, formatos y flujo")
def ver_areas(_: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(obtener_sesion_bd)) -> list[dict]:
    return servicio.ver_areas(bd)


@router.put("/areas/{clave}/flujo", status_code=204, summary="Pausar o reanudar un área en el flujo")
def cambiar_flujo(
    datos: CambioDeFlujo, clave: str = Path(pattern="^[a-z0-9-]{1,60}$"), _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada)
) -> None:
    _escribir(bd, lambda: servicio.fijar_flujo(bd, clave, datos.en_flujo, datos.justificacion))


@router.get("/matriz", summary="Matriz de destinos")
def ver_matriz(
    _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj)
) -> dict:
    return servicio.ver_matriz(bd, reloj.ahora())


@router.post("/matriz", status_code=204, summary="Agregar un destino")
def agregar_destino(
    datos: NuevoDestino, _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj)
) -> None:
    """Vale desde hoy. Lo ya remitido no cambia: la matriz tiene vigencia."""
    _escribir(bd, lambda: servicio.agregar_destino(bd, reloj.ahora(), datos.origen, datos.destino, datos.entrega_inmediata, datos.justificacion))


@router.post("/matriz/{destino_id}/retirar", status_code=204, summary="Retirar un destino")
def retirar_destino(
    datos: Justificacion,
    destino_id: int = Path(ge=1),
    _: Sesion = Depends(exigir_global(ORGANIZACION)),
    bd: Session = Depends(bd_auditada),
    reloj: Reloj = Depends(obtener_reloj),
) -> None:
    _escribir(bd, lambda: servicio.retirar_destino(bd, reloj.ahora(), destino_id, datos.justificacion))


# =========================================================== unidades de hospitalización


class NuevaUnidadHospitalizacion(BaseModel):
    tipo: Literal["departamento", "area"]
    id: str = Field(min_length=1, max_length=48, description="El id del catálogo de hospitalización: medicina-a, cirugia…")
    codigo: str = Field(min_length=2, max_length=20)
    nombre: str = Field(min_length=1, max_length=200)
    nombre_corto: str | None = Field(default=None, max_length=100)
    departamento: str | None = Field(default=None, max_length=48, description="Para un área: el id de su departamento")
    areas: list[str] = Field(default_factory=list, max_length=50, description="Para un departamento: sus áreas ya habilitadas")


class CambiosDeUnidadHospitalizacion(BaseModel, extra="forbid"):
    codigo: str | None = Field(default=None, min_length=2, max_length=20)
    nombre: str | None = Field(default=None, max_length=200)
    nombre_corto: str | None = Field(default=None, max_length=100)
    activa: bool | None = None


@router.get("/hospitalizacion/unidades", summary="Unidades de hospitalización")
def ver_unidades_hospitalizacion(_: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(obtener_sesion_bd)) -> list[dict]:
    """Solo las de hospitalización (`servicios/unidades_hospitalizacion.py`): las que
    atan a la enfermería con su área y a la jefatura con su departamento."""
    return servicio_hosp.listar(bd)


@router.post("/hospitalizacion/unidades", status_code=201, summary="Habilitar una unidad de hospitalización")
def nueva_unidad_hospitalizacion(
    datos: NuevaUnidadHospitalizacion, _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada)
) -> dict:
    return _escribir(bd, lambda: servicio_hosp.crear(bd, **datos.model_dump()))


@router.patch("/hospitalizacion/unidades/{clave}", summary="Editar una unidad de hospitalización")
def editar_unidad_hospitalizacion(
    datos: CambiosDeUnidadHospitalizacion,
    clave: str = Path(pattern="^hosp-(dep|area)-[a-z0-9-]{1,48}$"),
    _: Sesion = Depends(exigir_global(ORGANIZACION)),
    bd: Session = Depends(bd_auditada),
) -> dict:
    """Desactivarla quita el acceso a quienes tienen un rol en ella, desde su
    siguiente ingreso. Las unidades de Estadística responden 404."""
    return _escribir(bd, lambda: servicio_hosp.editar(bd, clave, datos.model_dump(exclude_unset=True)))


# =========================================================================== bitácora


@router.get("/bitacora", summary="Bitácora de cambios")
def ver_bitacora(
    usuario_id: int | None = Query(default=None, ge=1),
    tabla: str | None = Query(default=None, pattern="^[a-z_]+\\.[a-z_]+$"),
    operacion: str | None = Query(default=None, pattern="^(INSERTAR|ACTUALIZAR|ELIMINAR_LOGICO|RESTAURAR|ELIMINAR|INSERTAR_MASIVO|ELIMINAR_MASIVO)$"),
    desde: date | None = None,
    hasta: date | None = None,
    pagina: int = Query(default=1, ge=1, le=100_000),
    por_pagina: int = Query(default=25, ge=1, le=100),
    _: Sesion = Depends(exigir_global(AUDITORIA)),
    bd: Session = Depends(obtener_sesion_bd),
) -> dict:
    """Las contraseñas (su hash) nunca salen: se reemplazan por «•••»."""
    return servicio.ver_bitacora(bd, usuario_id=usuario_id, tabla=tabla, operacion=operacion, desde=desde, hasta=hasta, pagina=pagina, por_pagina=por_pagina)


# ==================================================================== personalización


class DatosPersonalizacion(BaseModel):
    nombre_sistema: str = Field(min_length=1, max_length=configuracion.LARGO_MAXIMO_NOMBRE)
    mensaje_ingreso: str | None = Field(default=None, max_length=configuracion.LARGO_MAXIMO_TEXTO)
    aviso_texto: str | None = Field(default=None, max_length=configuracion.LARGO_MAXIMO_TEXTO)
    aviso_tono: str = Field(default="info", pattern="^(info|warning)$")
    aviso_hasta: date | None = None
    pref_contraste: str | None = Field(default=None, pattern="^(sistema|estandar|alto)$")
    pref_tamano_texto: str | None = Field(default=None, pattern="^(100|115|130|150)$")
    pref_subrayar_enlaces: bool | None = None


@router.get("/personalizacion", response_model=DatosPersonalizacion, summary="Personalización")
def ver_personalizacion(_: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(obtener_sesion_bd)) -> dict:
    return vars(servicio.ver_personalizacion(bd))


@router.put("/personalizacion", status_code=204, summary="Guardar la personalización")
def guardar_personalizacion(datos: DatosPersonalizacion, _: Sesion = Depends(exigir_global(ORGANIZACION)), bd: Session = Depends(bd_auditada)) -> None:
    _escribir(bd, lambda: servicio.guardar_personalizacion(bd, Personalizacion(**datos.model_dump())))


# =========================================================================== soporte


@router.post("/ver-como/{usuario_id}", response_model=RespuestaLogin, summary="Ver el sistema como otra cuenta")
def ver_como(
    datos: Justificacion,
    usuario_id: int = Path(ge=1),
    actor: Sesion = Depends(exigir_global(USUARIOS)),
    bd: Session = Depends(bd_auditada),
    reloj: Reloj = Depends(obtener_reloj),
    ajustes: Ajustes = Depends(obtener_ajustes_api),
) -> RespuestaLogin:
    """Un token de **solo lectura** con los permisos de esa cuenta, por una hora.
    Cualquier escritura con él responde 403 (`dependencias.sesion_actual`). Queda
    en la bitácora quién miró a quién, cuándo y por qué."""
    cuenta = _escribir(bd, lambda: servicio.registrar_ver_como(bd, actor, usuario_id, datos.justificacion, reloj.ahora()))
    asignaciones = _asignaciones_de(bd, cuenta.id)
    if not asignaciones:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esa cuenta no tiene ningún rol: no hay nada que ver.")
    token, sesion = crear_token(
        usuario_id=cuenta.id, usuario=cuenta.nombre_usuario, nombre=cuenta.nombre_completo, asignaciones=asignaciones,
        debe_cambiar_clave=False, ahora=reloj.ahora(), horas=HORAS_VER_COMO, secreto=ajustes.jwt_secreto, observador_id=actor.usuario_id,
    )
    return RespuestaLogin(
        token=token, expira_en=sesion.expira_en, debe_cambiar_clave=False,
        usuario=DatosUsuario(
            id=cuenta.id, usuario=cuenta.nombre_usuario, nombre=cuenta.nombre_completo, cargo=cuenta.cargo, correo=cuenta.correo,
            asignaciones=_asignaciones_json(asignaciones), roles_de_interfaz=list(sesion.roles_de_interfaz), ve_monitoreo=sesion.ve_monitoreo,
        ),
    )
