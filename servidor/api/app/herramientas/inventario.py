"""Qué meses tiene cada área en una base, y qué base tiene qué.

    python -m app.herramientas.inventario                         # la base de .env, año en curso
    python -m app.herramientas.inventario --anio 2026 --json inventario-andre.json --origen andre
    python -m app.herramientas.inventario --comparar inventario-andre.json inventario-jesus.json servidor.json

Existe porque cada integrante del equipo tenía meses cargados solo en su base
(22/10/2026), y nadie podía decir cuáles. Cada uno corre la primera forma en su
máquina, guarda su JSON y lo comparte; con `--comparar` se ve en una sola tabla
quién tiene cada mes y si los archivos coinciden (misma huella SHA-256 = mismo
archivo). Es lo que hay que mirar antes de `exportar_reportes` /
`importar_reportes`, que mueven los meses a la base común.

Solo lee: no cambia nada en la base.

Leyenda de la tabla: R remitido · B borrador · x eliminado · · no está ·
(espacio) mes que todavía no toca. En `--comparar`, una letra por base, en el
orden en que se pasaron, y `≠` al final de la celda si dos bases tienen el mes
con archivos distintos.
"""

import argparse
import json
import socket
import sys
from datetime import datetime
from pathlib import Path

from app.dominio import estados, periodos
from app.dominio.reloj import ZONA

LETRA = {estados.REMITIDO: "R", estados.BORRADOR: "B", "eliminado": "x", estados.NO_INICIADO: "·"}
MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"]


def _letra(mes: dict) -> str:
    if mes["estado"] == estados.NO_INICIADO and not mes["esperado"]:
        return " "
    return LETRA.get(mes["estado"], "?")


def tabla(inventario: dict) -> str:
    """La matriz área × mes de un inventario, con sus totales."""
    ancho = max(len(a["nombre"]) for a in inventario["areas"])
    lineas = [f"{'Área':<{ancho}}  Fmt   " + " ".join(f"{m:>3}" for m in MESES_CORTOS) + "   Faltan"]
    for a in inventario["areas"]:
        celdas = " ".join(f"{_letra(m):>3}" for m in a["meses"])
        formato = a["formato"] or "—"
        sin_version = "" if a["version_activa"] else "  (sin formato activo: no puede recibir)"
        lineas.append(f"{a['nombre']:<{ancho}}  {formato:<5} {celdas}   {a['faltan']}/{a['esperados']}{sin_version}")
    return "\n".join(lineas)


def comparar(inventarios: list[dict]) -> str:
    """Una tabla con una letra por base en cada celda, y `≠` si los archivos difieren."""
    nombres = [i.get("origen", f"base {n + 1}") for n, i in enumerate(inventarios)]
    lineas = ["Bases, en este orden: " + " · ".join(f"{n + 1}={nombre}" for n, nombre in enumerate(nombres)), ""]
    por_area: dict[str, list[dict | None]] = {}
    nombres_area: dict[str, str] = {}
    for n, inv in enumerate(inventarios):
        for a in inv["areas"]:
            por_area.setdefault(a["clave"], [None] * len(inventarios))[n] = a
            nombres_area[a["clave"]] = a["nombre"]
    ancho_area = max(len(v) for v in nombres_area.values())
    ancho_celda = len(inventarios) + 1
    lineas.append(f"{'Área':<{ancho_area}}  " + " ".join(f"{m:<{ancho_celda}}" for m in MESES_CORTOS))
    distintos = []
    for clave, por_base in sorted(por_area.items(), key=lambda kv: nombres_area[kv[0]]):
        celdas = []
        for i in range(12):
            meses = [a["meses"][i] if a else None for a in por_base]
            letras = "".join(_letra(m) if m else "-" for m in meses)
            huellas = {m["huella"] for m in meses if m and m.get("huella")}
            if len(huellas) > 1:
                letras += "≠"
                distintos.append(f"{nombres_area[clave]} {meses[0]['periodo'] if meses[0] else i + 1}: " + ", ".join(
                    f"{nombres[n]}={m['archivo']} ({m['huella'][:10]})" for n, m in enumerate(meses) if m and m.get("huella")
                ))
            celdas.append(f"{letras:<{ancho_celda}}")
        lineas.append(f"{nombres_area[clave]:<{ancho_area}}  " + " ".join(celdas))
    if distintos:
        lineas += ["", "Mismo mes con archivos distintos (hay que decidir cuál vale antes de importar):"] + [f"  - {d}" for d in distintos]
    return "\n".join(lineas)


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m app.herramientas.inventario", description="Qué meses tiene cada área en una base; o, con --comparar, qué base tiene qué.")
    parser.add_argument("--anio", type=int, help="por omisión, el del periodo vigente")
    parser.add_argument("--json", help="guarda el inventario en este archivo, para compararlo después")
    parser.add_argument("--origen", help="nombre de esta base en el JSON (por omisión, equipo y base)")
    parser.add_argument("--comparar", nargs="+", metavar="JSON", help="compara inventarios guardados con --json (no lee la base)")
    args = parser.parse_args(argv)

    if args.comparar:
        try:
            inventarios = [json.loads(Path(r).read_text(encoding="utf-8")) for r in args.comparar]
        except (OSError, json.JSONDecodeError) as e:
            print(f"Error: no se pudo leer un inventario — {e}", file=sys.stderr)
            return 1
        print(comparar(inventarios))
        return 0

    from app.config import obtener_ajustes
    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para --comparar
    from app.servicios.cobertura import cobertura

    hoy = datetime.now(ZONA).date()
    anio = args.anio or periodos.anio_de(periodos.periodo_vigente(hoy))
    base = obtener_ajustes().url_base.split("@")[-1]
    with fabrica()() as bd:
        inventario = cobertura(bd, anio, hoy)
    inventario["origen"] = args.origen or f"{socket.gethostname()} · {base}"
    inventario["generado"] = datetime.now(ZONA).isoformat(timespec="seconds")

    print(f"Base de datos: {base} · año {anio} · periodo vigente {inventario['periodo_vigente']}\n")
    print(tabla(inventario))
    print("\nR remitido · B borrador · x eliminado · · falta · (espacio) todavía no toca")
    if args.json:
        Path(args.json).write_text(json.dumps(inventario, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nGuardado en {args.json}: compártalo y compárelo con --comparar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
