"""Monitoreo Indicadores.

    GET    /api/monitoreo/{anio}                         cifras registradas, datos del mes y compromisos del año
    PUT    /api/monitoreo/{anio}/resultados              digitar lo que envió una oficina (fichas 27 a 31)  (registrar)
    DELETE /api/monitoreo/{anio}/resultados              retirar una cifra digitada                         (registrar)
    PUT    /api/monitoreo/{anio}/datos                   un dato del mes: camas, egresos, salas…            (registrar)
    PUT    /api/monitoreo/{anio}/compromisos             el avance de un entregable                         (registrar)
    POST   /api/monitoreo/dl1153/revision                qué cambiaría el reporte DL 1153; no guarda nada   (cargar)
    POST   /api/monitoreo/dl1153                         cargar el reporte DL 1153                          (cargar)

Leer lo pueden Estadística, el superadministrador y Dirección General (`ve_monitoreo`).
Escribir exige `monitoreo.registrar`: Dirección solo mira. Cargar el reporte DL 1153 es solo
del superadministrador (`desempeno.cargar`): Estadística ve lo cargado. Nada de esto lleva
datos de pacientes.
"""

import tempfile
from collections.abc import Callable
from datetime import date
from pathlib import Path as Ruta
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Path, Query, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencias import bd_auditada, obtener_reloj, sesion_actual
from app.datos.sesion import obtener_sesion_bd
from app.dominio import permisos
from app.dominio.reloj import Reloj
from app.dominio.reloj import hoy as hoy_de
from app.dominio.sesion import Sesion
from app.servicios import dl1153
from app.servicios import monitoreo as servicio

router = APIRouter(prefix="/monitoreo", tags=["monitoreo indicadores"])

TAMANO_MAXIMO = 60 * 1024 * 1024


def ver(sesion: Sesion = Depends(sesion_actual)) -> Sesion:
    if not sesion.ve_monitoreo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Su cuenta no tiene acceso a Monitoreo Indicadores.")
    return sesion


def registrar(sesion: Sesion = Depends(sesion_actual)) -> Sesion:
    # Global: el panel mira todo el hospital, no una unidad.
    if not sesion.puede(permisos.MONITOREO_REGISTRAR):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo la Oficina de Estadística registra datos en Monitoreo Indicadores.")
    return sesion


def cargar_reporte(sesion: Sesion = Depends(sesion_actual)) -> Sesion:
    # No basta con ocultar el botón: Estadística conserva `monitoreo.registrar` para digitar,
    # y sin esta comprobación podría seguir cargando el reporte llamando a la ruta.
    if not sesion.puede(permisos.DESEMPENO_CARGAR):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el superadministrador carga el reporte DL 1153. Estadística visualiza lo cargado.")
    return sesion


_ANIO = Path(ge=2020, le=2100)


def _hacer(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except servicio.ValorInvalido as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e


class Registrado(BaseModel):
    id: int
    familia: str
    indicador: int
    serie: str
    ambito: str
    mes: int
    numerador: float | None
    denominador: float | None
    origen: str
    fecha_corte: date | None
    documento: str | None
    nota: str | None


class DatoDelMes(BaseModel):
    mes: int
    clave: str
    valor: float
    origen: str
    nota: str | None


class Avance(BaseModel):
    compromiso: int
    entregable: str
    estado: str
    fecha_cumplimiento: date | None
    evidencia: str | None
    usuario: str | None


class Panel(BaseModel):
    anio: int
    resultados: list[Registrado]
    datos: list[DatoDelMes]
    avances: list[Avance]


class NuevaCifra(BaseModel):
    ficha: int = Field(ge=1, le=34)
    serie: str = Field(default="principal", max_length=20)
    mes: int = Field(ge=1, le=12)
    numerador: float = Field(ge=0)
    denominador: float = Field(gt=0)
    documento: str | None = None
    nota: str | None = None


class NuevoDato(BaseModel):
    mes: int = Field(ge=1, le=12)
    clave: str = Field(max_length=40)
    valor: float | None = Field(default=None, ge=0)
    nota: str | None = None


class NuevoAvance(BaseModel):
    compromiso: int = Field(ge=35, le=48)
    entregable: str = Field(max_length=40)
    estado: str
    fecha_cumplimiento: date | None = None
    evidencia: str | None = None


class CambioDeFicha(BaseModel):
    ficha: int
    nuevas: int
    cambios: int
    iguales: int


class Revision(BaseModel):
    anio: int
    ultimo_mes: int
    fecha_corte: date | None
    documento: str
    fuentes: list[str]
    fichas: list[CambioDeFicha]
    avisos: list[str]


@router.get("/{anio}", response_model=Panel, summary="Lo registrado del año: cifras, datos del mes y compromisos")
def ver_panel(anio: int = _ANIO, bd: Session = Depends(obtener_sesion_bd), _: Sesion = Depends(ver)) -> Panel:
    return Panel(
        anio=anio,
        resultados=[Registrado(**vars(r)) for r in servicio.resultados(bd, anio=anio)],
        datos=[DatoDelMes(**vars(d)) for d in servicio.datos_del_mes(bd, anio=anio)],
        avances=[Avance(compromiso=a.compromiso, entregable=a.entregable, estado=a.estado, fecha_cumplimiento=a.fecha_cumplimiento, evidencia=a.evidencia, usuario=a.usuario) for a in servicio.avances(bd, anio=anio)],
    )


@router.put("/{anio}/resultados", response_model=Registrado, summary="Digitar lo que envió una oficina")
def digitar(cuerpo: NuevaCifra, anio: int = _ANIO, bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(registrar)) -> Registrado:
    r = _hacer(lambda: servicio.registrar(bd, anio=anio, usuario_id=sesion.usuario_id, hoy=hoy_de(reloj), **cuerpo.model_dump()))
    bd.commit()
    return Registrado(**vars(r))


@router.delete("/{anio}/resultados", status_code=status.HTTP_204_NO_CONTENT, summary="Retirar una cifra digitada")
def retirar(
    anio: int = _ANIO, ficha: int = Query(ge=1, le=34), serie: str = Query(default="principal", max_length=20), mes: int = Query(ge=1, le=12),
    bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), _: Sesion = Depends(registrar),
) -> Response:
    _hacer(lambda: servicio.retirar(bd, ficha=ficha, serie=serie, anio=anio, mes=mes, hoy=hoy_de(reloj)))
    bd.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{anio}/datos", status_code=status.HTTP_204_NO_CONTENT, summary="Un dato del mes; sin valor, lo borra")
def guardar_dato(cuerpo: NuevoDato, anio: int = _ANIO, bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(registrar)) -> Response:
    _hacer(lambda: servicio.guardar_dato(bd, anio=anio, usuario_id=sesion.usuario_id, hoy=hoy_de(reloj), **cuerpo.model_dump()))
    bd.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{anio}/compromisos", status_code=status.HTTP_204_NO_CONTENT, summary="El avance de un entregable de un compromiso de mejora")
def guardar_avance(cuerpo: NuevoAvance, anio: int = _ANIO, bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(registrar)) -> Response:
    _hacer(lambda: servicio.guardar_avance(bd, anio=anio, usuario_id=sesion.usuario_id, hoy=hoy_de(reloj), **cuerpo.model_dump()))
    bd.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class _Recibido:
    """El archivo subido, en un temporal que se borra al terminar."""

    def __init__(self, archivo: UploadFile) -> None:
        self.archivo = archivo
        self.ruta: Ruta | None = None

    def __enter__(self) -> Ruta:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as t:
            total = 0
            while bloque := self.archivo.file.read(1024 * 1024):
                total += len(bloque)
                if total > TAMANO_MAXIMO:
                    t.close()
                    Ruta(t.name).unlink(missing_ok=True)
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "El archivo pesa más de 60 MB: no parece el reporte DL 1153.")
                t.write(bloque)
            self.ruta = Ruta(t.name)
        return self.ruta

    def __exit__(self, *_: object) -> None:
        if self.ruta:
            self.ruta.unlink(missing_ok=True)


_ARCHIVO = File(description="El Excel del reporte DL 1153, tal como lo publica MINSA.")


def _procesar(archivo: UploadFile, bd: Session, *, guardar: bool, usuario_id: int) -> Revision:
    nombre = Ruta(archivo.filename or "reporte_dl1153.xlsx").name
    with _Recibido(archivo) as ruta:
        try:
            reporte = dl1153.leer_reporte(ruta, nombre)
        except dl1153.ReporteRechazado as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    cambios = servicio.aplicar_reporte(bd, reporte, usuario_id=usuario_id, guardar=guardar)
    return Revision(
        anio=reporte.anio, ultimo_mes=reporte.ultimo_mes, fecha_corte=reporte.fecha_corte, documento=reporte.documento, fuentes=reporte.fuentes,
        fichas=[CambioDeFicha(**vars(c)) for c in cambios], avisos=reporte.avisos,
    )


@router.post("/dl1153/revision", response_model=Revision, summary="Qué cambiaría el reporte DL 1153 (no guarda nada)")
def revisar(archivo: UploadFile = _ARCHIVO, bd: Session = Depends(obtener_sesion_bd), sesion: Sesion = Depends(cargar_reporte)) -> Revision:
    return _procesar(archivo, bd, guardar=False, usuario_id=sesion.usuario_id)


@router.post("/dl1153", response_model=Revision, summary="Cargar el reporte DL 1153")
def cargar(archivo: UploadFile = _ARCHIVO, bd: Session = Depends(bd_auditada), sesion: Sesion = Depends(cargar_reporte)) -> Revision:
    r = _procesar(archivo, bd, guardar=True, usuario_id=sesion.usuario_id)
    bd.commit()
    return r
