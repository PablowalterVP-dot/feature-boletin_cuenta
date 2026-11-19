"""El reloj del sistema, inyectable.

El prototipo fija su «hoy» en una constante porque su historial simulado está
escrito alrededor de ella. El backend usa el reloj del servidor, en la zona
horaria del hospital. Las pruebas necesitan controlar el tiempo, así que nadie
llama a `datetime.now()` directamente: se pide el reloj y se le pregunta.
"""

from datetime import date, datetime
from typing import Protocol
from zoneinfo import ZoneInfo

# Loreto está en UTC-5 todo el año (Perú no usa horario de verano).
ZONA = ZoneInfo("America/Lima")


class Reloj(Protocol):
    def ahora(self) -> datetime:
        """Instante actual, siempre con zona horaria."""
        ...


class RelojSistema:
    def ahora(self) -> datetime:
        return datetime.now(ZONA)


class RelojFijo:
    """Reloj controlable para las pruebas."""

    def __init__(self, instante: datetime):
        if instante.tzinfo is None:
            # Una hora sin zona es ambigua: se toma como hora de Lima.
            instante = instante.replace(tzinfo=ZONA)
        self._instante = instante

    def ahora(self) -> datetime:
        return self._instante

    def fijar(self, instante: datetime) -> None:
        self._instante = instante if instante.tzinfo else instante.replace(tzinfo=ZONA)


def hoy(reloj: Reloj) -> date:
    """La fecha de hoy en Lima, no en UTC: a las 21:00 de Lima ya es «mañana»
    en UTC, y el plazo de un periodo no debe adelantarse por eso."""
    return reloj.ahora().astimezone(ZONA).date()
