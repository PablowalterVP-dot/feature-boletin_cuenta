"""Reglas de la carga de datos crudos (`fuente`): qué mes se puede cargar y cuándo
reemplazar uno que ya está.

La regla de fondo la impone la base: **una sola carga vigente por fuente y mes**.
Aquí se decide qué hacer cuando llega un archivo con un mes que ya está cargado.
Por omisión se reemplaza —el HIS sigue recibiendo registros semanas después de
cerrado el mes, y la extracción más nueva es la buena—, salvo que el archivo
nuevo parezca *peor* que el que hay: más antiguo, o con menos filas. Entonces no
se toca nada sin que quien carga lo pida expresamente.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime

from app.dominio.reloj import ZONA


class CargaRechazada(Exception):
    """El archivo no se puede cargar tal como está. `motivos` va uno por línea:
    se dicen todos de una vez, no el primero que aparezca."""

    def __init__(self, *motivos: str):
        self.motivos = tuple(motivos)
        super().__init__(" ".join(motivos))


@dataclass(frozen=True)
class MesCargado:
    """La carga vigente de un mes: de qué archivo vino y cuántas filas trajo."""

    anio: int
    mes: int
    filas: int
    nombre_archivo: str
    fecha_extraccion: datetime | None


# El HIS nombra sus tramas con el día y la hora en que se extrajeron:
# «CONSOLIDADO_NominalTrama28092026_215720.csv» es del 28/09/2026 a las 21:57:20.
_TRAMA = re.compile(r"NominalTrama(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})(\d{2})")


def fecha_de_extraccion(nombre_archivo: str) -> datetime | None:
    """Cuándo se extrajo la trama, según su nombre. `None` si el nombre no lo
    dice (el consolidado histórico) o trae una fecha imposible: no se adivina."""
    m = _TRAMA.search(nombre_archivo)
    if m is None:
        return None
    dia, mes, anio, hora, minuto, segundo = (int(x) for x in m.groups())
    try:
        return datetime(anio, mes, dia, hora, minuto, segundo, tzinfo=ZONA)
    except ValueError:
        return None


def extraccion_por_contenido(ultimo_registro: date | None, *, hoy: date) -> datetime | None:
    """La fecha de descarga de una trama cuyo nombre no la dice, acotada por su
    contenido: si trae una fila digitada o corregida un día, se descargó ese día
    o después. Una fecha futura es un error de digitación y no acota nada."""
    if ultimo_registro is None or ultimo_registro > hoy:
        return None
    return datetime(ultimo_registro.year, ultimo_registro.month, ultimo_registro.day, tzinfo=ZONA)


def periodo_de(fecha: date) -> str:
    return f"{fecha.year:04d}-{fecha.month:02d}"


def en_rango(periodo: str, desde: str | None, hasta: str | None) -> bool:
    """Los periodos `AAAA-MM` se comparan como cadenas: ordenan igual que las fechas."""
    return (desde is None or periodo >= desde) and (hasta is None or periodo <= hasta)


def motivos_para_no_reemplazar(vigente: MesCargado, *, filas: int, fecha_extraccion: datetime | None) -> list[str]:
    """Por qué el archivo nuevo no debería pisar lo que ya hay de ese mes. Vacía
    si reemplazar es lo esperable."""
    periodo = f"{vigente.anio:04d}-{vigente.mes:02d}"
    motivos = []
    if vigente.fecha_extraccion is not None:
        if fecha_extraccion is None:
            motivos.append(
                f"{periodo}: lo cargado viene de «{vigente.nombre_archivo}», extraído el {vigente.fecha_extraccion:%d/%m/%Y}; "
                "el nombre de este archivo no dice cuándo se extrajo, así que no se sabe si es más nuevo."
            )
        elif fecha_extraccion < vigente.fecha_extraccion:
            motivos.append(
                f"{periodo}: este archivo se extrajo el {fecha_extraccion:%d/%m/%Y}, antes que el ya cargado "
                f"(«{vigente.nombre_archivo}», del {vigente.fecha_extraccion:%d/%m/%Y})."
            )
    if filas < vigente.filas:
        motivos.append(f"{periodo}: este archivo trae {filas} filas y lo ya cargado tiene {vigente.filas}; lo normal es que un mes crezca, no que baje.")
    return motivos
