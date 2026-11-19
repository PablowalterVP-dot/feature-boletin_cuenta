from fastapi import APIRouter, Depends

from app.api.dependencias import obtener_reloj
from app.dominio.reloj import Reloj
from app.dominio.reloj import hoy as hoy_de

router = APIRouter(tags=["salud"])


@router.get("/salud")
def salud(reloj: Reloj = Depends(obtener_reloj)) -> dict:
    """Responde sin tocar la base: dice que el proceso está vivo, no que la
    base esté disponible.

    `hoy` es la fecha de hoy en Lima, según el reloj del servidor. El frontend
    la pide al iniciar para decidir qué periodo está vigente, en vez de fiarse
    del reloj de la PC de quien usa el sistema (en un hospital, no siempre
    correcto ni en la zona horaria correcta)."""
    return {"ok": True, "servicio": "backend-reporte-estadistico-hrl", "hoy": hoy_de(reloj).isoformat()}
