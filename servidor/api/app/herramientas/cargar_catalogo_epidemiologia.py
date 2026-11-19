"""Carga el catálogo de Epidemiología (`EPI-W1`) y lo activa.

    python -m app.herramientas.cargar_catalogo_epidemiologia
    python -m app.herramientas.cargar_catalogo_epidemiologia --recargar

La semilla trae la unidad `EPI` y sus destinos, pero ningún formato: sin esto,
la oficina no puede subir su oficio de vigilancia. Crea el formato `EPI`, su
versión `EPI-W1` y su único cuadro: los casos nuevos de infecciones
intrahospitalarias por edad, columna y sexo, un indicador por casilla
(`f1.e0.neonatologia_m`, el mismo código que usa el bot). La lógica es la de
`catalogo_word.py`.
"""

from app.herramientas.catalogo_word import AreaWord, NoSePuede, leer_catalogo, main as _main
from app.herramientas.catalogo_word import cargar_catalogo as _cargar

AREA = AreaWord(
    unidad="EPI",
    formato="EPI",
    nombre="Casos nuevos de infecciones intrahospitalarias (Epidemiología)",
    descripcion="Oficio mensual de vigilancia: casos nuevos de infecciones intrahospitalarias por grupo de edad, servicio y sexo, más muertes neonatales y maternas. Se sube en Word.",
    catalogo="epidemiologia.json",
    exportador="exportar-catalogo-epidemiologia.mjs",
    notas="Estructura de los oficios reales de enero a setiembre de 2026 («Remito casos de vigilancia Epidemiológica»).",
    criterio="Un Word con la tabla «Número de casos nuevos de infecciones intrahospitalarias»: grupos de edad en filas; Neonatología, UCI, Gineco-Obstetricia, ITU, IHO, muertes y otras infecciones en columnas, por sexo.",
)

__all__ = ["AREA", "NoSePuede", "cargar_catalogo", "leer_catalogo"]


def cargar_catalogo(bd, *, recargar: bool = False, catalogo: dict | None = None) -> str:
    return _cargar(bd, AREA, recargar=recargar, catalogo=catalogo)


if __name__ == "__main__":
    raise SystemExit(_main(AREA, "python -m app.herramientas.cargar_catalogo_epidemiologia"))
