"""Siembra el umbral de la alerta «semana con datos faltantes» en
`organizacion.parametro` (`dominio/alertas.py` explica la convención).

    python -m app.herramientas.configurar_alertas
    python -m app.herramientas.configurar_alertas --recargar

Sin esto, la alerta usa el respaldo final del código (1 día), que es
correcto pero no editable sin desplegar.

**Umbral provisional, pendiente de confirmar con Giancarlo**: un día sin
ningún dato en una semana ya cerrada basta para alertar. Mientras no se
confirme, es el valor que esta herramienta siembra; cambiarlo es un UPDATE
de un parámetro (`--recargar`), no un despliegue.

Es **dato**, no un cambio del esquema: `organizacion.parametro` ya existe.
Idempotente, mismo patrón que `configurar_plazos`: sin `--recargar`, una
clave que ya existe se deja como está; con `--recargar`, se actualiza al
valor de aquí.
"""

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Parametro, UnidadOrganica
from app.dominio import alertas

PARAMETROS_CONOCIDOS = (
    # (área: código de UNIDAD, o "default", días mínimos, descripción)
    ("default", 1, "Provisional (por confirmar con Giancarlo): un día sin ningún dato en una semana ya cerrada basta para alertar."),
)


class NoSePuede(Exception):
    """Un área de `PARAMETROS_CONOCIDOS` no existe en esta base."""


def _area_existe(bd: Session, area: str) -> bool:
    """El área es siempre el código de la UNIDAD (`NUT`, `NEF`…), nunca el
    del formato ni su clave — misma convención que `configurar_plazos`."""
    if area == alertas.AREA_RESPALDO:
        return True
    return bd.scalar(select(UnidadOrganica.id).where(UnidadOrganica.codigo == area, vigente(UnidadOrganica))) is not None


def configurar(bd: Session, *, recargar: bool = False) -> str:
    """Siembra `PARAMETROS_CONOCIDOS` en `organizacion.parametro`. No
    confirma: quien llama hace `commit()`."""
    creadas = actualizadas = 0
    for area, dias, descripcion in PARAMETROS_CONOCIDOS:
        if not _area_existe(bd, area):
            raise NoSePuede(f"«{area}» no es un área conocida (ni «{alertas.AREA_RESPALDO}», ni una unidad orgánica real): revise PARAMETROS_CONOCIDOS.")

        su_clave = alertas.clave(area)
        fila = bd.scalar(select(Parametro).where(Parametro.clave == su_clave, vigente(Parametro)))
        if fila is None:
            bd.add(Parametro(clave=su_clave, valor=str(dias), tipo_dato="entero", descripcion=descripcion))
            creadas += 1
        elif recargar:
            fila.valor = str(dias)
            fila.descripcion = descripcion
            actualizadas += 1
    bd.flush()
    return f"{creadas} clave(s) nueva(s), {actualizadas} actualizada(s) de {len(PARAMETROS_CONOCIDOS)} conocidas."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.configurar_alertas",
        description="Siembra el umbral de la alerta de semana incompleta en organizacion.parametro, en DATABASE_URL.",
    )
    parser.add_argument("--recargar", action="store_true", help="Actualiza las claves que ya existen al valor conocido, en vez de dejarlas como están.")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {_destino(obtener_ajustes().url_base)}")
    try:
        with fabrica()() as bd:
            mensaje = configurar(bd, recargar=args.recargar)
            bd.commit()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(mensaje)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
