"""Carga los reportes de defunciones de SINADEF a `fuente.sinadef_defuncion`, y
las defunciones verificadas a mano a `fuente.defuncion_verificada`.

    python -m app.herramientas.cargar_sinadef "C:/…/datos_de_muertos"
    python -m app.herramientas.cargar_sinadef "C:/…/octubre-2026.xls"
    python -m app.herramientas.cargar_sinadef --verificados "C:/…/fallecidos_verificados_sinadef_nacional.csv"
    python -m app.herramientas.cargar_sinadef CARPETA --ensayo        # dice qué haría, sin guardar

Lo que se pasa puede ser un `.xls` o una carpeta (se cargan todos sus `.xls`).
Cada archivo es un reporte mensual «reporteMinsaCdefDiarioMensual» y se guarda
entero, anulados incluidos: el filtro del cruce oficial se aplica al calcular.

Mismas reglas que `cargar_his`: cada mes tiene una sola carga vigente, cargar
dos veces lo mismo no cambia nada, y un reporte más antiguo o con menos
certificados que el ya cargado no lo pisa sin `--forzar`.

Cada archivo se confirma por separado: uno que no se puede cargar se informa y
no detiene a los demás.

`--verificados` es otra fuente: las defunciones consultadas una por una en
SINADEF nacional, de pacientes cuyo certificado no se emitió en el hospital.
Un documento que ya está se actualiza con lo que diga el archivo.
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy import func, select

from app.api.dependencias import fijar_auditoria
from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Usuario
from app.dominio.fuentes import CargaRechazada
from app.herramientas.cargar_his import lineas_de
from app.servicios import fuentes as servicio


def archivos_de(rutas: list[str]) -> list[Path]:
    """Los `.xls` pedidos: los archivos tal cual y, de cada carpeta, todos los suyos."""
    archivos: list[Path] = []
    for texto in rutas:
        ruta = Path(texto)
        if ruta.is_dir():
            encontrados = sorted(ruta.glob("*.xls"))
            if not encontrados:
                raise CargaRechazada(f"La carpeta «{ruta}» no tiene ningún .xls.")
            archivos += encontrados
        elif ruta.is_file():
            archivos.append(ruta)
        else:
            raise CargaRechazada(f"No existe «{ruta}».")
    return archivos


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Carga reportes de SINADEF y defunciones verificadas.")
    parser.add_argument("rutas", nargs="*", help="reportes .xls, o carpetas con ellos (no se copian)")
    parser.add_argument("--verificados", help="CSV de defunciones verificadas en SINADEF nacional")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien se carga")
    parser.add_argument("--forzar", action="store_true", help="reemplaza aunque el reporte sea más antiguo o traiga menos certificados")
    parser.add_argument("--ensayo", action="store_true", help="dice qué haría y no guarda nada")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    fallos = 0
    try:
        if not args.rutas and not args.verificados:
            raise CargaRechazada("Indique al menos un reporte .xls, una carpeta o --verificados.")
        archivos = archivos_de(args.rutas)
        print(f"Base de datos: {obtener_ajustes().url_base.split('@')[-1]}")
        with fabrica()() as bd:
            usuario_id = bd.scalar(select(Usuario.id).where(func.lower(Usuario.nombre_usuario) == args.usuario.lower(), vigente(Usuario)))
        if usuario_id is None:
            raise CargaRechazada(f"No existe la cuenta «{args.usuario}».")

        def en_una_transaccion(operacion):
            with fabrica()() as bd:
                fijar_auditoria(bd, usuario_id, None)
                resultado = operacion(bd)
                if args.ensayo:
                    bd.rollback()
                else:
                    bd.commit()
            return resultado

        certificados = 0
        for archivo in archivos:
            try:
                r = en_una_transaccion(lambda bd, archivo=archivo: servicio.cargar_sinadef(bd, archivo, usuario_id=usuario_id, forzar=args.forzar))
            except CargaRechazada as e:
                fallos += 1
                print(f"{archivo.name}: NO se cargó.", file=sys.stderr)
                for motivo in e.motivos:
                    print(f"  {motivo}", file=sys.stderr)
                continue
            # Un reporte es un solo mes: basta su línea, no el detalle de `lineas_de`.
            print(lineas_de(r, ensayo=args.ensayo)[1].replace(" filas ", " certificados ") + f"  ·  {archivo.name}")
            certificados += r.filas_cargadas if r.lote_id is not None else 0
        if archivos:
            verbo = "Se cargarían" if args.ensayo else "Cargados"
            print(f"{verbo} {certificados} certificados de {len(archivos) - fallos} reportes" + (f"; {fallos} no se pudieron cargar." if fallos else "."))

        if args.verificados:
            v = en_una_transaccion(lambda bd: servicio.cargar_verificados(bd, Path(args.verificados), usuario_id=usuario_id))
            print(f"{v.nombre_archivo}: {v.filas_archivo} defunciones verificadas — {v.nuevas} nuevas, {v.actualizadas} actualizadas, {v.sin_cambio} sin cambio.")
        if args.ensayo:
            print("ENSAYO: no se guardó nada.")
    except CargaRechazada as e:
        print("No se cargó:", file=sys.stderr)
        for motivo in e.motivos:
            print(f"  {motivo}", file=sys.stderr)
        return 1
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
