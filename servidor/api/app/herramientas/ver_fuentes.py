"""Muestra qué datos crudos hay cargados en `fuente`: por cada sistema de origen,
qué meses, cuántas filas, de qué archivo salieron y quién los cargó.

    python -m app.herramientas.ver_fuentes
    python -m app.herramientas.ver_fuentes --fuente his_minsa

Solo lee. Es la forma de saber «¿hasta qué mes vamos?» antes de cargar una
trama nueva, y de comprobar una carga después de hacerla, sin abrir la base.
"""

import argparse
import sys

from sqlalchemy import func, select

from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import DefuncionVerificada, Fuente
from app.servicios import fuentes as servicio
from app.servicios.subida import CARGABLES


def _siguiente(periodo: str) -> str:
    anio, mes = int(periodo[:4]), int(periodo[5:])
    return f"{anio + 1:04d}-01" if mes == 12 else f"{anio:04d}-{mes + 1:02d}"


def lineas_de(meses: list[servicio.MesDeUnaFuente], nombres: dict[str, str], verificadas: int) -> list[str]:
    """Lo cargado, para leer en la terminal. `nombres`: código → nombre de las fuentes a mostrar."""
    lineas: list[str] = []
    for codigo, nombre in nombres.items():
        suyos = [m for m in meses if m.fuente == codigo]
        if codigo == servicio.FUENTE_VERIFICADOS:
            lineas += ["", f"{nombre} ({codigo}): {verificadas} defunciones verificadas."]
            continue
        if not suyos:
            lineas += ["", f"{nombre} ({codigo}): sin datos cargados."]
            continue
        lineas += ["", f"{nombre} ({codigo}): {suyos[0].periodo} a {suyos[-1].periodo} · {len(suyos)} meses · {sum(m.filas for m in suyos)} filas"]
        # Un hueco en medio se dice: «cargado hasta setiembre» no debe esconder que falta junio.
        cargados = {m.periodo for m in suyos}
        faltan, periodo = [], suyos[0].periodo
        while periodo < suyos[-1].periodo:
            if periodo not in cargados:
                faltan.append(periodo)
            periodo = _siguiente(periodo)
        if faltan:
            lineas.append(f"  ATENCIÓN: faltan meses en medio: {', '.join(faltan)}")
        for m in suyos:
            extraccion = f"extraído el {m.fecha_extraccion:%d/%m/%Y}" if m.fecha_extraccion else "sin fecha de extracción"
            lineas.append(f"  {m.periodo}  {m.filas:>7} filas  lote {m.lote_id:<4} {m.nombre_archivo} · {extraccion} · cargado el {m.fecha_carga:%d/%m/%Y} por {m.usuario or '(sin cuenta)'}")
    return lineas[1:]


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Muestra qué datos crudos hay cargados.")
    parser.add_argument("--fuente", help="solo esta fuente (his_minsa, sinadef_hrl, sinadef_verificado)")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {obtener_ajustes().url_base.split('@')[-1]}")
    with fabrica()() as bd:
        # Solo las que el sistema sabe cargar: las demás están en el catálogo para
        # decir qué le falta a cada ficha, y aquí serían una lista de «sin datos».
        nombres = dict(bd.execute(select(Fuente.codigo, Fuente.nombre).where(vigente(Fuente), Fuente.codigo.in_(CARGABLES)).order_by(Fuente.id)).all())
        if args.fuente:
            if args.fuente not in nombres:
                print(f"Error: no existe la fuente «{args.fuente}». Las que hay: {', '.join(nombres)}.", file=sys.stderr)
                return 1
            nombres = {args.fuente: nombres[args.fuente]}
        verificadas = bd.scalar(select(func.count()).select_from(DefuncionVerificada).where(vigente(DefuncionVerificada)))
        print("\n".join(lineas_de(servicio.estado_de_fuentes(bd), nombres, verificadas)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
