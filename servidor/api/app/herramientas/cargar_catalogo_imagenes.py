"""Carga el catálogo de Diagnóstico por Imágenes (`DXI-W1`) y lo activa.

    python -m app.herramientas.cargar_catalogo_imagenes
    python -m app.herramientas.cargar_catalogo_imagenes --recargar

La semilla trae la unidad `DXI` y sus destinos (Planeamiento, Cuerpo Técnico),
pero ningún formato. Crea el formato `DXI`, su versión `DXI-W1` y cuatro
cuadros con los totales de cada modalidad (ecografía, tomografía, mamografía,
Rayos X): exámenes por financiador y servicio, pacientes, monto e informes. El
detalle por profesional y por tecnólogo no es un indicador: cambia de un mes a
otro y viaja en el informe del bot de cada carga, como los procedimientos de
Centro Quirúrgico. La lógica es la de `catalogo_word.py`.
"""

from app.herramientas.catalogo_word import AreaWord, NoSePuede, leer_catalogo, main as _main
from app.herramientas.catalogo_word import cargar_catalogo as _cargar

AREA = AreaWord(
    unidad="DXI",
    formato="DXI",
    nombre="Exámenes del Departamento de Diagnóstico por Imágenes",
    descripcion="Oficio mensual con sus cuatro hojas: Rayos X, tomografía, mamografía y ecografía (con biopsias y procedimientos oncológicos). Se sube en Word.",
    catalogo="imagenes.json",
    exportador="exportar-catalogo-imagenes.mjs",
    notas="Estructura de los oficios reales de enero a setiembre de 2026, cotejada con los formatos del sistema (oficio de junio).",
    criterio="Un Word con las tablas de Rayos X (exámenes atendidos, placas, tecnólogos), tomografía, mamografía y la tabla de ecografía por PROFESIONALES.",
)

__all__ = ["AREA", "NoSePuede", "cargar_catalogo", "leer_catalogo"]


def cargar_catalogo(bd, *, recargar: bool = False, catalogo: dict | None = None) -> str:
    return _cargar(bd, AREA, recargar=recargar, catalogo=catalogo)


if __name__ == "__main__":
    raise SystemExit(_main(AREA, "python -m app.herramientas.cargar_catalogo_imagenes"))
