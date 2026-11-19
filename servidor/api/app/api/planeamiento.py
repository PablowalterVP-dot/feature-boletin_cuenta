"""La ejecución de las actividades operativas del POI (Oficina de Planeamiento).

    GET    /api/planeamiento/actividades/{anio}                lo que Planeamiento escribió en el año
    PUT    /api/planeamiento/actividades/{anio}/{codigo}/{mes} digitar o ajustar la cifra de un mes  (registrar)
    DELETE /api/planeamiento/actividades/{anio}/{codigo}/{mes} quitarla: el mes vuelve a su cálculo  (registrar)

Todo exige `actividad.ver` **global** (Planeamiento y el superadministrador);
escribir, además `actividad.registrar`. `mes` va de 1 a 12. Lo calculado no
viaja por aquí: la interfaz lo deriva de los reportes que ya lee.
"""

from collections.abc import Callable
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencias import bd_auditada, obtener_reloj, sesion_actual
from app.datos.sesion import obtener_sesion_bd
from app.dominio import permisos
from app.dominio.reloj import Reloj
from app.dominio.reloj import hoy as hoy_de
from app.dominio.sesion import Sesion
from app.servicios import actividades as servicio

router = APIRouter(prefix="/planeamiento", tags=["planeamiento"])


def _exigir(permiso: str, mensaje: str) -> Callable[..., Sesion]:
    def dependencia(sesion: Sesion = Depends(sesion_actual)) -> Sesion:
        # Global: las actividades son de las nueve áreas, no de una unidad.
        if not sesion.puede(permiso):
            raise HTTPException(status.HTTP_403_FORBIDDEN, mensaje)
        return sesion

    return dependencia


ver = _exigir(permisos.ACTIVIDAD_VER, "Su cuenta no tiene acceso a las actividades operativas.")
registrar = _exigir(permisos.ACTIVIDAD_REGISTRAR, "Solo la Oficina de Planeamiento registra la ejecución de las actividades operativas.")

_ANIO = Path(ge=2020, le=2100)
_CODIGO = Path(pattern=r"^AOI\d{11}$")
_MES = Path(ge=1, le=12)


class Registro(BaseModel):
    codigo: str
    mes: str
    valor: float
    nota: str | None
    usuario: str | None
    fecha: datetime


class Registros(BaseModel):
    anio: int
    registros: list[Registro]


class NuevaCifra(BaseModel):
    valor: float = Field(ge=0)
    nota: str | None = None


def _hacer(fn):
    try:
        return fn()
    except servicio.ValorInvalido as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e


@router.get("/actividades/{anio}", response_model=Registros, summary="Lo que Planeamiento escribió en las actividades del año")
def ver_actividades(anio: int = _ANIO, bd: Session = Depends(obtener_sesion_bd), _: Sesion = Depends(ver)) -> Registros:
    return Registros(anio=anio, registros=[Registro(**vars(r)) for r in servicio.registros(bd, anio=anio)])


@router.put("/actividades/{anio}/{codigo}/{mes}", response_model=Registro, summary="Digitar o ajustar la ejecución de un mes")
def guardar_cifra(
    cuerpo: NuevaCifra, anio: int = _ANIO, codigo: str = _CODIGO, mes: int = _MES,
    bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(registrar),
) -> Registro:
    r = _hacer(lambda: servicio.guardar(bd, anio=anio, codigo=codigo, mes=mes, valor=cuerpo.valor, nota=cuerpo.nota, usuario_id=sesion.usuario_id, hoy=hoy_de(reloj)))
    bd.commit()
    return Registro(**vars(r))


@router.delete("/actividades/{anio}/{codigo}/{mes}", status_code=status.HTTP_204_NO_CONTENT, summary="Quitar la cifra escrita: el mes vuelve a su cálculo")
def borrar_cifra(
    anio: int = _ANIO, codigo: str = _CODIGO, mes: int = _MES,
    bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), _: Sesion = Depends(registrar),
) -> Response:
    _hacer(lambda: servicio.borrar(bd, anio=anio, codigo=codigo, mes=mes, hoy=hoy_de(reloj)))
    bd.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
