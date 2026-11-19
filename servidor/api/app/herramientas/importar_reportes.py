"""Trae a esta base los reportes de uno o más paquetes, sin perder ninguno.

    python -m app.herramientas.importar_reportes paquete-jesus paquete-mars          # solo muestra el plan
    python -m app.herramientas.importar_reportes paquete-jesus paquete-mars --aplicar

El paquete lo arma `exportar_reportes` en la base de origen. Cada mes del
paquete se compara con esta base por formato y periodo, y por la huella
SHA-256 del archivo:

- **nuevo**: esta base no lo tiene (o tiene un borrador sin archivo). Se carga.
- **igual**: esta base ya tiene ese mismo archivo. No se toca.
- **conflicto**: esta base tiene ese mes con **otro** archivo. No se toca:
  decidir cuál vale es de una persona, no de la herramienta. Si vale el del
  paquete, se elimina el de aquí (`eliminar_reporte`, con su motivo) y se
  vuelve a importar; si vale el de aquí, no se hace nada.
- **eliminado en destino**: aquí alguien lo eliminó a propósito. No se carga,
  por la misma razón que `preparar_base` no recarga un mes eliminado.
- **sin formato**: esta base no tiene versión activa para ese formato. Hay que
  activarla primero (`cargar_catalogo_<área>`).
- **sin archivo**: el paquete no trae el archivo (faltaba en la base de origen).
- Dos paquetes con el mismo mes y archivos distintos: **conflicto entre
  paquetes**, y ese mes no entra de ninguno.

Sin `--aplicar` no escribe nada: primero se mira el plan. Con `--aplicar`, cada
mes nuevo pasa por el camino de una carga real (`cargar_historico.cargar_mes`):
el bot vuelve a leer el archivo **en esta base**, con su versión de formato, y
el reporte se envía si en el origen estaba remitido (en borrador, si no). Lleva
la observación «Carga histórica: importado de …», para que la puntualidad no
cuente la fecha de la importación como si fuera la de entrega. Se carga en
orden de mes, para que las comparaciones con el mes anterior tengan con qué.

Necesita el bot (BOT_VALIDADOR_URL), como cualquier carga.
"""

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Archivo, Carga, EstadoReporte, Formato, FormatoVersion, Periodo, Reporte, Usuario
from app.dominio import estados

NUEVO, IGUAL, CONFLICTO, ELIMINADO, SIN_FORMATO, SIN_ARCHIVO, CONFLICTO_PAQUETES = (
    "nuevo", "igual", "conflicto", "eliminado en destino", "sin formato", "sin archivo", "conflicto entre paquetes",
)


class NoSePuede(Exception):
    """Un paquete no se puede leer, o la cuenta no existe."""


@dataclass
class Paso:
    accion: str
    entrada: dict
    paquete: Path
    origen: str
    detalle: str = ""


def leer_paquete(carpeta: Path) -> dict:
    try:
        manifiesto = json.loads((carpeta / "manifiesto.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise NoSePuede(f"«{carpeta}» no es un paquete de exportar_reportes (falta o está dañado su manifiesto.json): {e}") from e
    if manifiesto.get("version_paquete") != 1:
        raise NoSePuede(f"«{carpeta}» es de una versión de paquete que esta herramienta no conoce.")
    return manifiesto


def _en_destino(bd: Session, formato: str, periodo: str) -> tuple[str | None, str | None, bool]:
    """(estado del reporte vigente, huella de su archivo vigente, si hubo uno eliminado)."""
    anio, mes = (int(x) for x in periodo.split("-"))
    filas = bd.execute(
        select(Reporte.fecha_eliminacion, EstadoReporte.codigo, Archivo.huella_sha256)
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .join(EstadoReporte, EstadoReporte.id == Reporte.estado_reporte_id)
        .outerjoin(Carga, and_(Carga.reporte_id == Reporte.id, Carga.es_vigente, Carga.resultado == "aceptada", vigente(Carga)))
        .outerjoin(Archivo, Archivo.id == Carga.archivo_id)
        .where(Formato.codigo == formato, Periodo.anio == anio, Periodo.mes == mes)
    ).all()
    hubo_eliminado = any(f.fecha_eliminacion is not None for f in filas)
    vigentes = [f for f in filas if f.fecha_eliminacion is None]
    if not vigentes:
        return None, None, hubo_eliminado
    return vigentes[0].codigo, vigentes[0].huella_sha256, hubo_eliminado


def _tiene_version_activa(bd: Session, formato: str) -> bool:
    return bd.scalar(
        select(func.count()).select_from(FormatoVersion).join(Formato, Formato.id == FormatoVersion.formato_id)
        .where(Formato.codigo == formato, FormatoVersion.estado == "activa", vigente(FormatoVersion), vigente(Formato))
    ) > 0


def planear(bd: Session, paquetes: list[tuple[Path, dict]]) -> list[Paso]:
    por_mes: dict[tuple[str, str], list[Paso]] = {}
    for carpeta, manifiesto in paquetes:
        for entrada in manifiesto["reportes"]:
            por_mes.setdefault((entrada["formato"], entrada["periodo"]), []).append(Paso(NUEVO, entrada, carpeta, manifiesto["origen"]))

    plan: list[Paso] = []
    for (formato, periodo), pasos in sorted(por_mes.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        huellas = {p.entrada["huella"] for p in pasos}
        if len(huellas) > 1:
            detalle = "; ".join(f"{p.origen}: {p.entrada['archivo']} ({p.entrada['huella'][:10]})" for p in pasos)
            plan += [Paso(CONFLICTO_PAQUETES, p.entrada, p.paquete, p.origen, detalle) for p in pasos]
            continue
        paso = pasos[0]  # varios paquetes con el mismo archivo: basta uno
        estado, huella, hubo_eliminado = _en_destino(bd, formato, periodo)
        if huella is not None:
            paso.accion = IGUAL if huella == paso.entrada["huella"] else CONFLICTO
            if paso.accion == CONFLICTO:
                paso.detalle = f"aquí está en «{estado}» con otro archivo ({huella[:10]}); el paquete trae {paso.entrada['archivo']} ({paso.entrada['huella'][:10]})"
        elif estado is not None and not estados.es_editable(estado):
            paso.accion, paso.detalle = CONFLICTO, f"aquí está en «{estado}» sin archivo aceptado"
        elif estado is None and hubo_eliminado:
            paso.accion, paso.detalle = ELIMINADO, "aquí se eliminó a propósito: no se recarga"
        elif paso.entrada.get("archivo_faltante") or not paso.entrada.get("ruta"):
            paso.accion, paso.detalle = SIN_ARCHIVO, "faltaba en la base de origen"
        elif not _tiene_version_activa(bd, formato):
            paso.accion, paso.detalle = SIN_FORMATO, f"active antes el formato {formato} en esta base (cargar_catalogo_…)"
        plan.append(paso)
    return plan


def _nota(paso: Paso) -> str:
    e = paso.entrada
    enviado = f", enviado allá el {e['fecha_envio'][:10]}" if e.get("fecha_envio") else ""
    return f"Carga histórica: importado de la base «{paso.origen}» ({e['archivo']}, «{e['estado']}» allá{enviado})."


def aplicar(fabrica, ajustes, usuario_nombre: str, plan: list[Paso]) -> list[str]:
    from app.api.dependencias import fijar_auditoria
    from app.herramientas import cargar_historico

    with fabrica() as bd:
        usuario = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == usuario_nombre.lower(), vigente(Usuario)))
        if usuario is None:
            raise NoSePuede(f"No existe la cuenta «{usuario_nombre}».")
        sesion = cargar_historico._sesion_de(bd, usuario)

    lineas = []
    for paso in (p for p in plan if p.accion == NUEVO):
        e = paso.entrada
        with fabrica() as bd:
            fijar_auditoria(bd, usuario.id, None)
            try:
                linea = cargar_historico.cargar_mes(
                    bd, ajustes, sesion, formato=e["formato"], periodo=e["periodo"], archivo=paso.paquete / e["ruta"],
                    nombre=e["archivo"], nota=_nota(paso), justificaciones=e.get("justificaciones") or {},
                    enviar=e["estado"] == estados.REMITIDO,
                )
                bd.commit()
            except Exception as ex:  # un mes que falla no detiene a los demás, y se dice por qué
                bd.rollback()
                linea = f"{e['periodo']}: no se importó — {type(ex).__name__}: {ex}"
        lineas.append(f"{e['formato']:<4} {linea}")
    return lineas


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m app.herramientas.importar_reportes", description="Trae los reportes de uno o más paquetes a esta base, sin pisar lo que ya tiene.")
    parser.add_argument("paquetes", nargs="+", help="carpetas armadas por exportar_reportes")
    parser.add_argument("--aplicar", action="store_true", help="importa de verdad (sin esto, solo muestra el plan)")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien se importa")
    args = parser.parse_args(argv)

    from app.config import obtener_ajustes
    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    try:
        paquetes = [(Path(p), leer_paquete(Path(p))) for p in args.paquetes]
        ajustes = obtener_ajustes()
        print(f"Base de destino: {ajustes.url_base.split('@')[-1]} · bot: {ajustes.bot_validador_url}\n")
        with fabrica()() as bd:
            plan = planear(bd, paquetes)
        for p in plan:
            detalle = f" — {p.detalle}" if p.detalle else ""
            print(f"  {p.entrada['formato']:<4} {p.entrada['periodo']}  {p.accion:<24} {p.origen}: {p.entrada['archivo']}{detalle}")
        cuenta = {a: sum(p.accion == a for p in plan) for a in (NUEVO, IGUAL, CONFLICTO, ELIMINADO, SIN_FORMATO, SIN_ARCHIVO, CONFLICTO_PAQUETES)}
        print("\n" + " · ".join(f"{n} {a}" for a, n in cuenta.items() if n))
        if not args.aplicar:
            print("\nNo se escribió nada. Revise el plan y repita con --aplicar para importar los «nuevo».")
            return 0
        if not cuenta[NUEVO]:
            print("\nNada que importar.")
            return 0
        print()
        for linea in aplicar(fabrica(), ajustes, args.usuario, plan):
            print(linea)
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
