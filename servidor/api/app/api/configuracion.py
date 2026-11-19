"""Configuración pública del sistema.

    GET /api/configuracion

Sin sesión, a propósito: la pantalla de ingreso necesita el nombre del sistema,
su mensaje y el aviso general antes de que nadie haya entrado. No expone nada
que no se vea en la propia pantalla, salvo qué áreas reportan por el sistema
(sus claves y el código de su formato), que tampoco es reservado.
"""

from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencias import obtener_reloj
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import Reloj
from app.dominio.reloj import hoy as hoy_de
from app.servicios import admin as servicio

router = APIRouter(tags=["configuración"])


class AvisoGeneral(BaseModel):
    texto: str
    tono: str
    hasta: date | None


class Preferencias(BaseModel):
    contraste: str | None = Field(description="sistema · estandar · alto. Nulo: la del kit.")
    tamano_texto: str | None = Field(description="100 · 115 · 130 · 150. Nulo: la del kit.")
    subrayar_enlaces: bool | None


class AreaEnFlujo(BaseModel):
    clave: str
    formato: str


class Configuracion(BaseModel):
    nombre_sistema: str
    mensaje_ingreso: str | None
    aviso: AvisoGeneral | None = Field(description="Solo mientras esté vigente.")
    preferencias: Preferencias = Field(description="Las de quien todavía no eligió las suyas.")
    areas_en_flujo: list[AreaEnFlujo] = Field(description="Las áreas que reportan por el sistema: formato con versión activa y sin pausar.")


@router.get("/configuracion", response_model=Configuracion, summary="Configuración pública")
def ver_configuracion(bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj)) -> Configuracion:
    p = servicio.ver_personalizacion(bd)
    return Configuracion(
        nombre_sistema=p.nombre_sistema,
        mensaje_ingreso=p.mensaje_ingreso,
        aviso=AvisoGeneral(texto=p.aviso_texto, tono=p.aviso_tono, hasta=p.aviso_hasta) if p.aviso_vigente(hoy_de(reloj)) else None,
        preferencias=Preferencias(contraste=p.pref_contraste, tamano_texto=p.pref_tamano_texto, subrayar_enlaces=p.pref_subrayar_enlaces),
        areas_en_flujo=[AreaEnFlujo(**a) for a in servicio.areas_en_flujo(bd)],
    )
