"""Las nueve áreas con su formato activo (03/11/2026).

`preparar_base` activaba solo cinco formatos al arrancar: Nutrición, Centro
Quirúrgico, Farmacia, Epidemiología e Imágenes. Los otros cuatro se activaban a
mano, y a mano nunca llegaron a la base desplegada: ahí Gineco-Obstetricia,
Laboratorio, Nefrología y Lavandería figuraban «Sin formato instalado», y lo que
Gineco-Obstetricia subió se quedó en el navegador y se perdió al recargar.

Es Python y no SQL porque el catálogo ya vive en los cargadores (Laboratorio tiene
1081 indicadores): copiarlo aquí dejaría dos fuentes de verdad. Cada cargador es
idempotente: en una base que ya tiene el formato activo no cambia nada, ni toca una
versión que ya leyó archivos. Por eso este seeder sirve igual en la base desplegada,
en la compartida y en una nueva.

Activar un formato pone al área en el flujo, y las nueve deben estarlo desde el
03/11/2026. Pausar un área sigue siendo cosa del superadministrador, y esto no la
reanuda.

No confirma: el gestor (`app/herramientas/bd.py`) lo corre en su transacción, y si
un cargador falla no queda nada a medias.
"""

from sqlalchemy.orm import Session

from app.herramientas import (
    cargar_catalogo_ginecologia,
    cargar_catalogo_laboratorio,
    cargar_catalogo_lavanderia,
    cargar_catalogo_nefrologia,
)


def aplicar(bd: Session) -> None:
    for cargador in (cargar_catalogo_ginecologia, cargar_catalogo_laboratorio, cargar_catalogo_lavanderia, cargar_catalogo_nefrologia):
        print(f"[bd] {cargador.cargar_catalogo(bd)}")
