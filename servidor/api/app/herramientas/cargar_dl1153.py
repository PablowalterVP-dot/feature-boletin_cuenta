"""Carga el reporte DL 1153 de MINSA en Monitoreo Indicadores.

    python -m app.herramientas.cargar_dl1153 "<archivo.xlsx>" [--ensayo]

Es lo mismo que el botón «Cargar reporte DL 1153» del panel. Con `--ensayo` dice qué
cambiaría, sin guardar. Volver a cargar el mismo archivo no duplica nada.
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy import func, select

from app.api.dependencias import fijar_auditoria
from app.config import obtener_ajustes
from app.datos.modelos import Usuario
from app.servicios import dl1153
from app.servicios import monitoreo as servicio


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Carga el reporte DL 1153 en Monitoreo Indicadores.")
    parser.add_argument("archivo", type=Path)
    parser.add_argument("--ensayo", action="store_true", help="dice qué cambiaría, sin guardar")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien se carga")
    args = parser.parse_args(argv)

    try:
        reporte = dl1153.leer_reporte(args.archivo)
    except dl1153.ReporteRechazado as e:
        print(f"No se cargó: {e}", file=sys.stderr)
        return 1

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {obtener_ajustes().url_base.split('@')[-1]}")
    print(f"Reporte {reporte.anio}, hasta el mes {reporte.ultimo_mes}, corte {reporte.fecha_corte}. Fichas: {reporte.fichas_leidas}")
    for aviso in reporte.avisos:
        print(f"Aviso: {aviso}")
    with fabrica()() as bd:
        usuario = bd.scalar(select(Usuario.id).where(func.lower(Usuario.nombre_usuario) == args.usuario.lower()))
        if usuario is None:
            print(f"No se cargó: no existe la cuenta «{args.usuario}».", file=sys.stderr)
            return 1
        fijar_auditoria(bd, usuario, None)
        cambios = servicio.aplicar_reporte(bd, reporte, usuario_id=usuario, guardar=not args.ensayo)
        for c in cambios:
            print(f"  Ficha {c.ficha:>2}: {c.nuevas} nuevas, {c.cambios} cambian, {c.iguales} iguales")
        if args.ensayo:
            bd.rollback()
            print("Ensayo: no se guardó nada.")
        else:
            bd.commit()
            print(f"Cargadas {len(reporte.filas)} cifras de {len(reporte.fichas_leidas)} fichas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
