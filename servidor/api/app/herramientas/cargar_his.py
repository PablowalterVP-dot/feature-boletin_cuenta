"""Carga una trama nominal del HIS MINSA a `fuente.his_atencion`.

    python -m app.herramientas.cargar_his "C:/…/datos_crudo2021_2026.csv" --desde 2025-12
    python -m app.herramientas.cargar_his "C:/…/CONSOLIDADO_NominalTrama30092026_212639-septiembre-2026.csv"
    python -m app.herramientas.cargar_his ARCHIVO --ensayo        # dice qué haría, sin guardar

Existe mientras el hospital no tenga acceso directo a la base del HIS: los
datos se suben a mano, trama por trama. El archivo se lee desde donde está y
no se copia a ningún lado: tiene datos de pacientes y no debe acabar en el
repositorio.

- **No duplica.** Cada mes tiene una sola carga vigente. Un mes que ya vino de
  este mismo archivo se deja como está (correr la orden dos veces no cambia
  nada); uno que vino de otro archivo se reemplaza entero.
- **No pisa a ciegas.** Si el archivo es más antiguo que el ya cargado, o trae
  menos filas, no se carga nada y se dice por qué. `--forzar` lo carga igual.
- `--desde` y `--hasta` (AAAA-MM) recortan lo que se toma: el consolidado trae
  desde 2021 y solo interesa lo reciente.
- Queda a nombre de `--usuario` (por omisión, el superadmin) en la bitácora.
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy import func, select

from app.api.dependencias import fijar_auditoria
from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Usuario
from app.dominio import periodos
from app.dominio.fuentes import CargaRechazada
from app.servicios import fuentes as servicio

_ESTADO = {servicio.NUEVO: "nuevo", servicio.REEMPLAZADO: "reemplaza al anterior", servicio.YA_CARGADO: "ya estaba cargado, no se toca"}


def lineas_de(r: servicio.ResultadoCarga, *, ensayo: bool) -> list[str]:
    """El resultado, para leer en la terminal."""
    lineas = [f"{r.nombre_archivo}: {r.filas_archivo} filas en el archivo."]
    for m in r.meses:
        antes = f" (tenía {m.filas_anteriores})" if m.filas_anteriores is not None else ""
        lineas.append(f"  {m.periodo}  {m.filas:>7} filas  {_ESTADO[m.estado]}{antes}")
    if r.filas_fuera_de_rango:
        lineas.append(f"  {r.filas_fuera_de_rango} filas de otros meses, fuera de lo pedido: no se cargan.")
    if r.filas_sin_fecha:
        lineas.append(f"  ATENCIÓN: {r.filas_sin_fecha} filas sin fecha de atención legible: no se cargan.")
    if r.lote_id is None:
        lineas.append("Nada nuevo que cargar: todo lo pedido ya estaba.")
    elif ensayo:
        lineas.append(f"ENSAYO: se cargarían {r.filas_cargadas} filas. No se guardó nada.")
    else:
        lineas.append(f"Cargadas {r.filas_cargadas} filas (lote {r.lote_id}).")
    return lineas


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Carga una trama nominal del HIS MINSA.")
    parser.add_argument("archivo", help="el CSV de la trama, donde esté (no se copia)")
    parser.add_argument("--desde", help="AAAA-MM: primer mes que se toma")
    parser.add_argument("--hasta", help="AAAA-MM: último mes que se toma")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien se carga")
    parser.add_argument("--forzar", action="store_true", help="reemplaza aunque el archivo sea más antiguo o traiga menos filas")
    parser.add_argument("--ensayo", action="store_true", help="dice qué haría y no guarda nada")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    try:
        for nombre, valor in (("--desde", args.desde), ("--hasta", args.hasta)):
            if valor is not None and not periodos.es_periodo(valor):
                raise CargaRechazada(f"{nombre} es AAAA-MM (por ejemplo 2025-12), no «{valor}».")
        if args.desde and args.hasta and args.desde > args.hasta:
            raise CargaRechazada("--desde no va después de --hasta.")
        print(f"Base de datos: {obtener_ajustes().url_base.split('@')[-1]}")
        with fabrica()() as bd:
            usuario = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == args.usuario.lower(), vigente(Usuario)))
            if usuario is None:
                raise CargaRechazada(f"No existe la cuenta «{args.usuario}».")
            fijar_auditoria(bd, usuario.id, None)
            resultado = servicio.cargar_his(bd, Path(args.archivo), desde=args.desde, hasta=args.hasta, usuario_id=usuario.id, forzar=args.forzar)
            if args.ensayo:
                bd.rollback()
            else:
                bd.commit()
        print("\n".join(lineas_de(resultado, ensayo=args.ensayo)))
    except CargaRechazada as e:
        print("No se cargó:", file=sys.stderr)
        for motivo in e.motivos:
            print(f"  {motivo}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
