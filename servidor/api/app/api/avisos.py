"""Los avisos de la sesión: el cajón de notificaciones.

    GET /api/avisos     lo que la persona debe saber ahora, derivado del estado

No hay endpoint para «marcar como leído» ni para borrar un aviso: no se guardan (ver
`dominio/avisos.py`). Un aviso se va cuando deja de ser cierto.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencias import obtener_reloj, sesion_actual
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import Reloj
from app.dominio.sesion import Sesion
from app.servicios import avisos as servicio

router = APIRouter(prefix="/avisos", tags=["avisos"])


class AvisoDeSesion(BaseModel):
    clave: str = Field(description="Estable mientras el hecho sea el mismo, p. ej. atraso|NUT|2026-08.")
    ambito: str = Field(description="area, estadistica u oficina: la interfaz muestra los del ámbito activo.")
    tipo: str = Field(description="Qué regla lo produjo (atraso, rectificacion, en_tramite, validado, remitido, atrasadas, por_revisar, por_remitir, arrastradas, desactualizado, sin_validar, recibido).")
    tono: str = Field(description="ok, info, warn o crit.")
    titulo: str
    detalle: str
    fecha: datetime | None = Field(description="Cuándo ocurrió lo que cuenta. `null`: no se conoce (no es «viejo»).")
    requiere_accion: bool = Field(description="Si a quien lo recibe le toca hacer algo, no solo enterarse.")
    formato: str | None = Field(description="El reporte al que lleva, si es uno solo.")
    periodo: str | None


class RespuestaAvisos(BaseModel):
    generado_en: datetime
    periodo_vigente: str
    avisos: list[AvisoDeSesion]


@router.get("", response_model=RespuestaAvisos, summary="Los avisos de la sesión")
def ver_avisos(
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(obtener_sesion_bd),
    reloj: Reloj = Depends(obtener_reloj),
) -> RespuestaAvisos:
    """Los avisos de quien pregunta, de los tres ámbitos que le correspondan, lo grave
    primero. Se calculan en cada petición a partir de la lista de reportes y de los
    recibidos, con su misma visibilidad: un aviso nunca cuenta algo que esa cuenta no
    podría ver en la lista.

    Para el «no leído», compare `fecha` con la última vez que la persona abrió el cajón.

    Siempre 200 con sesión válida; una cuenta sin ámbitos (superadmin) recibe `[]`.
    """
    r = servicio.avisos_de(bd, sesion, reloj)
    return RespuestaAvisos(generado_en=r.generado_en, periodo_vigente=r.periodo_vigente, avisos=[AvisoDeSesion(**vars(a)) for a in r.avisos])
