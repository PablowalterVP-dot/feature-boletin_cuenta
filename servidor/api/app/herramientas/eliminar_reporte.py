"""Elimina un reporte cargado por error, desde la línea de comandos.

    python -m app.herramientas.eliminar_reporte NUT 2026-08 --motivo "Las cifras de agosto eran incorrectas"

Existe para el caso del 05/10/2026: el reporte de agosto de Nutrición se cargó
con cifras incorrectas y se pidió eliminarlo para volver a cargarlo de cero.

**Es un borrado lógico** (`fecha_eliminacion`), como todo en el esquema de
Alejandro: el reporte deja de existir para el sistema —la lista, el detalle,
lo que reciben las oficinas, el consolidado y los avisos lo ignoran, porque
filtran lo eliminado—, pero su historia, sus cargas y sus valores siguen en la
base y en la bitácora (`auditoria.registro_cambio`), con el motivo. El
periodo queda libre: el área puede volver a subir su Excel.

La constancia del reporte eliminado se renombra (`…-ANULADA-{id}`): su índice
único no excluye lo eliminado, y sin eso el reporte nuevo del mismo mes no
podría recibir su constancia.

Fija quién actúa (`--usuario`, por omisión el superadmin) para que la bitácora
diga quién lo eliminó.
"""

import argparse
import sys

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencias import fijar_auditoria
from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Formato, Periodo, Reporte, Usuario
from app.dominio import periodos

LARGO_MINIMO_MOTIVO = 15


class NoSePuede(Exception):
    """El formato, el periodo, el reporte o la cuenta no existen, o falta el motivo."""


def eliminar_reporte(bd: Session, formato: str, periodo: str, *, motivo: str, usuario: str = "superadmin", usuario_id: int | None = None) -> Reporte:
    """No confirma: quien llama hace `commit()`."""
    if len((motivo or "").strip()) < LARGO_MINIMO_MOTIVO:
        raise NoSePuede(f"El motivo debe explicar por qué (al menos {LARGO_MINIMO_MOTIVO} caracteres): queda en la bitácora.")
    if not periodos.es_periodo(periodo):
        raise NoSePuede(f"«{periodo}» no es un periodo AAAA-MM.")
    actor = bd.get(Usuario, usuario_id) if usuario_id is not None else bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == usuario.strip().lower(), vigente(Usuario)))
    if actor is None:
        raise NoSePuede(f"No existe la cuenta «{usuario}».")
    fijar_auditoria(bd, actor.id, None)

    anio, mes = (int(x) for x in periodo.split("-"))
    reporte = bd.scalar(
        select(Reporte)
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .where(Formato.codigo == formato, Periodo.anio == anio, Periodo.mes == mes, vigente(Reporte))
    )
    if reporte is None:
        raise NoSePuede(f"No hay un reporte vigente de «{formato}» para {periodo}.")

    if reporte.folio_constancia:
        reporte.folio_constancia = f"{reporte.folio_constancia}-ANULADA-{reporte.id}"[:30]
    nota = f"Eliminado: {motivo.strip()}"
    reporte.observacion = f"{reporte.observacion} · {nota}" if reporte.observacion else nota
    reporte.fecha_eliminacion = func.now()
    bd.flush()
    return reporte


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m app.herramientas.eliminar_reporte", description="Elimina (borrado lógico, con bitácora) un reporte de DATABASE_URL.")
    parser.add_argument("formato", help="código del formato, p. ej. NUT")
    parser.add_argument("periodo", help="AAAA-MM, p. ej. 2026-08")
    parser.add_argument("--motivo", required=True, help="por qué se elimina; queda en la bitácora")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien queda en la bitácora")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    url = obtener_ajustes().url_base
    print(f"Base de datos: {url.split('@')[-1]}")
    try:
        with fabrica()() as bd:
            reporte = eliminar_reporte(bd, args.formato, args.periodo, motivo=args.motivo, usuario=args.usuario)
            bd.commit()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    print(f"Reporte {args.formato} {args.periodo} (id {reporte.id}) eliminado. El periodo queda libre para volver a cargarlo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
