"""Guarda los reportes de una base en un paquete que otra base puede importar.

    python -m app.herramientas.exportar_reportes paquete-jesus --origen jesus
    python -m app.herramientas.exportar_reportes paquete-jesus --origen jesus --formato FAR --formato NEF

Existe porque cada integrante del equipo cargó meses solo en su base
(22/10/2026). Un `pg_dump` no sirve para juntarlas: copia la base entera y
pisa la del otro. Lo que viaja aquí es lo que **originó** cada reporte —el
archivo que el área subió— y no sus filas: al importarlo, el archivo vuelve a
pasar por el bot y por el flujo de siempre en la base de destino, con sus
propios ids, su bitácora y su versión de formato. Así dos bases se juntan sin
que una sobrescriba a la otra.

El paquete es una carpeta:

    manifiesto.json                      qué reportes trae, de qué base
    archivos/2026-03/FAR/<huella>.docx   el archivo vigente de cada reporte, tal cual

Entra cada reporte vigente con un archivo aceptado por el bot (remitido o en
borrador), con las justificaciones que tenían sus avisos. Un reporte sin
archivo aceptado no entra: no hay nada que volver a leer. Un reporte
eliminado tampoco. Si el archivo falta en disco (la carpeta de cargas es de otra
máquina, o se borró), se anota en el manifiesto y en pantalla.

Solo lee la base. El paquete tiene datos reales del hospital: se comparte por
un medio privado, **nunca en git**.
"""

import argparse
import json
import shutil
import socket
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Archivo, Carga, EstadoReporte, Formato, FormatoVersion, Hallazgo, Periodo, Reporte, UnidadOrganica
from app.dominio.reloj import ZONA

VERSION_PAQUETE = 1


class NoSePuede(Exception):
    """La carpeta de salida no está vacía o un argumento está mal."""


def _reportes(bd: Session, anio: int | None, formatos: list[str]):
    consulta = (
        select(
            Reporte.id, Formato.codigo, UnidadOrganica.codigo.label("sigla"), UnidadOrganica.clave, Periodo.anio, Periodo.mes,
            EstadoReporte.codigo.label("estado"), Reporte.observacion, Reporte.fecha_envio, Carga.id.label("carga_id"),
            FormatoVersion.codigo_version, Archivo.nombre_original, Archivo.ruta_almacenamiento, Archivo.huella_sha256,
        )
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(UnidadOrganica, UnidadOrganica.id == Formato.unidad_organica_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .join(EstadoReporte, EstadoReporte.id == Reporte.estado_reporte_id)
        .join(Carga, and_(Carga.reporte_id == Reporte.id, Carga.es_vigente, Carga.resultado == "aceptada", vigente(Carga)))
        .join(Archivo, Archivo.id == Carga.archivo_id)
        .outerjoin(FormatoVersion, FormatoVersion.id == Carga.formato_version_id)
        .where(vigente(Reporte))
        .order_by(Formato.codigo, Periodo.anio, Periodo.mes)
    )
    if anio:
        consulta = consulta.where(Periodo.anio == anio)
    if formatos:
        consulta = consulta.where(Formato.codigo.in_(formatos))
    return bd.execute(consulta).all()


def _justificaciones(bd: Session, carga_id: int) -> dict[str, str]:
    filas = bd.execute(
        select(Hallazgo.clave_hallazgo, Hallazgo.justificacion)
        .where(Hallazgo.carga_id == carga_id, Hallazgo.nivel == "aviso", Hallazgo.justificacion.is_not(None), vigente(Hallazgo))
    ).all()
    return {clave: texto for clave, texto in filas if (texto or "").strip()}


def exportar(bd: Session, carpeta_cargas: Path, salida: Path, *, origen: str, anio: int | None = None, formatos: list[str] = ()) -> dict:
    if salida.exists() and any(salida.iterdir()):
        raise NoSePuede(f"La carpeta «{salida}» no está vacía: use una nueva, para no mezclar dos paquetes.")
    reportes = []
    for r in _reportes(bd, anio, list(formatos)):
        periodo = f"{r.anio:04d}-{r.mes:02d}"
        origen_archivo = carpeta_cargas / r.ruta_almacenamiento
        destino_rel = Path("archivos") / periodo / r.sigla / Path(r.ruta_almacenamiento).name
        faltante = not origen_archivo.is_file()
        if not faltante:
            (salida / destino_rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origen_archivo, salida / destino_rel)
        reportes.append({
            "formato": r.codigo, "unidad": r.clave, "periodo": periodo, "estado": r.estado,
            "version": r.codigo_version, "archivo": r.nombre_original, "huella": r.huella_sha256,
            "ruta": None if faltante else destino_rel.as_posix(), "archivo_faltante": faltante,
            "observacion": r.observacion, "fecha_envio": r.fecha_envio.isoformat() if r.fecha_envio else None,
            "justificaciones": _justificaciones(bd, r.carga_id),
        })
    manifiesto = {
        "version_paquete": VERSION_PAQUETE, "origen": origen,
        "generado": datetime.now(ZONA).isoformat(timespec="seconds"), "reportes": reportes,
    }
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "manifiesto.json").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifiesto


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m app.herramientas.exportar_reportes", description="Guarda los reportes de esta base (sus archivos originales) en un paquete importable.")
    parser.add_argument("salida", help="carpeta nueva (o vacía) donde se arma el paquete")
    parser.add_argument("--origen", help="nombre de esta base, para reconocerla al importar (por omisión, el equipo)")
    parser.add_argument("--anio", type=int, help="solo este año")
    parser.add_argument("--formato", action="append", default=[], help="solo este formato (FAR, NEF, GIN…); se puede repetir")
    args = parser.parse_args(argv)

    from app.config import obtener_ajustes
    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    ajustes = obtener_ajustes()
    origen = args.origen or socket.gethostname()
    print(f"Base de datos: {ajustes.url_base.split('@')[-1]} · cargas: {ajustes.carpeta_cargas}")
    try:
        with fabrica()() as bd:
            manifiesto = exportar(bd, ajustes.carpeta_cargas, Path(args.salida), origen=origen, anio=args.anio, formatos=[f.upper() for f in args.formato])
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    reportes = manifiesto["reportes"]
    for r in reportes:
        aviso = "  ¡FALTA EL ARCHIVO EN DISCO: no se podrá importar!" if r["archivo_faltante"] else ""
        print(f"  {r['formato']:<4} {r['periodo']}  {r['estado']:<9} {r['archivo']}{aviso}")
    faltantes = sum(r["archivo_faltante"] for r in reportes)
    print(f"\n{len(reportes)} reporte(s) en «{args.salida}» (origen «{origen}»){f', {faltantes} sin archivo' if faltantes else ''}.")
    print("Tiene datos reales: compártalo por un medio privado, nunca en git.")
    return 1 if faltantes else 0


if __name__ == "__main__":
    raise SystemExit(main())
