"""Siembra los plazos reales de entrega, por área y por destino, en
`organizacion.parametro` (`dominio/plazos.py` explica la convención).

    python -m app.herramientas.configurar_plazos
    python -m app.herramientas.configurar_plazos --recargar

Sin esto, `GET /api/reportes` usa el plazo genérico de `v_cumplimiento`
(día 10, el mismo para toda área y todo destino): es un respaldo correcto,
pero no el real. El AS-IS (`docs/AS_IS 2.0.drawio`, confirmado 03/10/2026) trae
plazos distintos por área y por destino, que esta herramienta deja en la base:

| Clave                        | Día | De dónde sale |
|---|---|---|
| `plazo.default.estadistica`  | 5   | La mayoría de áreas entrega a Estadística hasta el día 5 |
| `plazo.NEF.estadistica`      | 7   | Nefrología, un día más |
| `plazo.LAV.estadistica`      | 8   | Lavandería: sin PC propia, Mantenimiento digita por ella |
| `plazo.default.planeamiento` | 10  | CEPLAN bloquea su aplicativo ese día, para toda área |
| `plazo.EST.diresa`           | 15  | Estadística remite a DIRESA (supuesto; nada lo usa todavía: no hay remisión real a DIRESA) |

**El área siempre es el código de la UNIDAD** (`organizacion.unidad_organica.codigo`:
`NUT`, `NEF`, `LAV`, `EST`…), nunca el del formato ni la clave. Existe para las diez
áreas desde la semilla, aunque todavía no tengan formato propio (Nefrología,
Lavandería) — y es estable: si un día se crea `formato.formato` para Lavandería
con un código distinto a `LAV`, el plazo sigue encontrándose igual, porque no
depende de él. Resolver por el código del formato (como se hizo al principio)
tenía justo ese riesgo silencioso: una clave que deja de aplicarse sin que nadie
lo note, cayendo al respaldo sin avisar.

Es **dato**, no un cambio del esquema: `organizacion.parametro` ya existe,
sembrada por Alejandro con otras claves (`periodo.dia_limite_entrega`, que
hoy no lee ningún código). No se tocan esas filas ni su script; esto agrega
las suyas aparte.

Idempotente, mismo patrón que las demás herramientas: compara por clave antes
de escribir. Sin `--recargar`, una clave que ya existe se deja como está (no
pisa un valor que alguien ya ajustó a mano); con `--recargar`, se actualiza al
valor de aquí.

No fija quién actúa (`app.usuario_id`): es un operador con acceso a la base,
igual que `asignar_clave` y `crear_usuario`.
"""

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Parametro, UnidadOrganica
from app.dominio import plazos

PLAZOS_CONOCIDOS = (
    # (área: código de UNIDAD, o "default", destino, día, descripción)
    ("default", "estadistica", 5, "Respaldo: la mayoría de áreas entrega a Estadística hasta el día 5 (AS-IS, confirmado 03/10/2026)."),
    ("NEF", "estadistica", 7, "Nefrología entrega a Estadística hasta el día 7 (AS-IS)."),
    ("LAV", "estadistica", 8, "Lavandería entrega a Estadística hasta el día 8 (AS-IS: sin PC propia, Mantenimiento digita por ella)."),
    ("default", "planeamiento", 10, "CEPLAN bloquea su aplicativo el día 10: toda área que entrega a Planeamiento, hasta ese día (AS-IS)."),
    ("EST", "diresa", 15, "Estadística remite a DIRESA hasta el día 15 (supuesto del prototipo; sin uso todavía: no hay remisión real a DIRESA)."),
)


class NoSePuede(Exception):
    """Un área o un destino de `PLAZOS_CONOCIDOS` no existe en esta base."""


def _area_existe(bd: Session, area: str) -> bool:
    """El área es siempre el código de la UNIDAD (`NUT`, `NEF`, `EST`…), nunca
    el del formato ni su clave — existe para las diez desde la semilla, aunque
    todavía no tengan formato propio."""
    if area == plazos.AREA_RESPALDO:
        return True
    return bd.scalar(select(UnidadOrganica.id).where(UnidadOrganica.codigo == area, vigente(UnidadOrganica))) is not None


def _destino_existe(bd: Session, destino: str) -> bool:
    return bd.scalar(select(UnidadOrganica.id).where(UnidadOrganica.clave == destino, UnidadOrganica.es_receptora, vigente(UnidadOrganica))) is not None


def configurar(bd: Session, *, recargar: bool = False) -> str:
    """Siembra `PLAZOS_CONOCIDOS` en `organizacion.parametro`. No confirma:
    quien llama hace `commit()`."""
    creadas = actualizadas = 0
    for area, destino, dia, descripcion in PLAZOS_CONOCIDOS:
        if not _area_existe(bd, area):
            raise NoSePuede(f"«{area}» no es un área conocida (ni formato, ni unidad orgánica): revise PLAZOS_CONOCIDOS.")
        if not _destino_existe(bd, destino):
            raise NoSePuede(f"«{destino}» no es una unidad receptora conocida: revise PLAZOS_CONOCIDOS.")

        su_clave = plazos.clave(area, destino)
        fila = bd.scalar(select(Parametro).where(Parametro.clave == su_clave, vigente(Parametro)))
        if fila is None:
            bd.add(Parametro(clave=su_clave, valor=str(dia), tipo_dato="entero", descripcion=descripcion))
            creadas += 1
        elif recargar:
            fila.valor = str(dia)
            fila.descripcion = descripcion
            actualizadas += 1
    bd.flush()
    return f"{creadas} clave(s) nueva(s), {actualizadas} actualizada(s) de {len(PLAZOS_CONOCIDOS)} conocidas."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.configurar_plazos",
        description="Siembra los plazos reales de entrega (por área y destino) en organizacion.parametro, en DATABASE_URL.",
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
