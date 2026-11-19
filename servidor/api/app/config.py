"""Configuración del backend, leída del entorno.

Nada sensible vive en el código: la conexión a la base y el secreto del JWT
llegan por variables de entorno (o por `servidor/api/.env`, que no se versiona).
Ver `.env.example`.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ_BACKEND = Path(__file__).resolve().parents[1]


def normalizar_url_base(url: str) -> str:
    """Fuerza el driver psycopg 3.

    Quien escribe `postgresql://…` (lo habitual) obtendría por defecto el driver
    psycopg2, que este proyecto no instala. Se traduce aquí para que la URL que
    se copia de cualquier cliente de PostgreSQL funcione sin tocarla.
    """
    for prefijo in ("postgresql://", "postgres://"):
        if url.startswith(prefijo):
            return "postgresql+psycopg://" + url[len(prefijo):]
    return url


class Ajustes(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=RAIZ_BACKEND / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    jwt_secreto: str
    # Un token vive 8 horas: los roles viajan dentro y no se consultan a la base
    # en cada petición. Cambiar roles o desactivar a alguien tarda hasta eso en
    # aplicar; si molesta, la salida es una lista de revocación.
    jwt_horas: int = 8
    # Sin URL, el envío de un reporte no puede validarse con el bot y falla.
    bot_validador_url: str | None = None
    # Tope de espera al bot. Un envío que lo supera no se acepta.
    bot_validador_segundos: float = 10.0
    # Dónde se guardan los archivos subidos. Relativa a la raíz del backend si no
    # empieza con `/` (Linux/macOS) ni con una letra de unidad (Windows).
    ruta_cargas: str = "cargas"

    @property
    def carpeta_cargas(self) -> Path:
        ruta = Path(self.ruta_cargas)
        return ruta if ruta.is_absolute() else RAIZ_BACKEND / ruta

    @field_validator("jwt_secreto")
    @classmethod
    def _secreto_largo(cls, valor: str) -> str:
        # HS256 con una clave corta se adivina por fuerza bruta. También rechaza
        # el marcador de `.env.example`, que alguien podría dejar sin cambiar.
        if len(valor) < 32:
            raise ValueError("JWT_SECRETO debe tener al menos 32 caracteres. Genera uno con: python -c \"import secrets; print(secrets.token_urlsafe(48))\"")
        return valor

    @property
    def url_base(self) -> str:
        return normalizar_url_base(self.database_url)


@lru_cache
def obtener_ajustes() -> Ajustes:
    return Ajustes()
