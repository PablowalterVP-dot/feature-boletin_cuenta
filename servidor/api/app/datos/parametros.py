"""Lectura de `organizacion.parametro`: configuración clave → valor que puede
cambiar sin un despliegue nuevo. Hoy, solo los plazos (`dominio/plazos.py`).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Parametro


def valores(bd: Session, prefijo: str) -> dict[str, str]:
    """Las filas vigentes cuya clave empieza con `prefijo`, como `{clave: valor}`."""
    filas = bd.execute(select(Parametro.clave, Parametro.valor).where(Parametro.clave.startswith(prefijo), vigente(Parametro))).all()
    return dict(filas)
