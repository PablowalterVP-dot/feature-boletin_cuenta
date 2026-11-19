"""Carga y activa el catálogo de un área que entrega su reporte en Word.

Lo comparten Epidemiología (`cargar_catalogo_epidemiologia`) y Diagnóstico por
Imágenes (`cargar_catalogo_imagenes`), que llegaron juntas el 27/10/2026. Es la
misma lógica que `cargar_catalogo_nefrologia`, que se escribió antes y queda
como estaba: crea el formato y su versión, un cuadro por cada uno del catálogo
y un indicador por casilla, y la activa con `tipo_archivo = 'docx'`.

Las casillas no se copian a mano: salen de `catalogos/<área>.json`, que se
genera desde la definición del bot (`servidor/scripts/exportar-catalogo-<área>.mjs`).
Una versión que aceptó un archivo queda congelada por un disparador de la
base: si la definición cambia después, se carga como otra versión.

**Idempotente**: sobre una versión ya activa no cambia nada. Lo usa también
`preparar_base` al arrancar la API.
"""

import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import (
    Carga,
    CriterioReconocimiento,
    Cuadro,
    Formato,
    FormatoVersion,
    Indicador,
    UnidadOrganica,
    VersionIndicador,
)

CATALOGOS = Path(__file__).parent / "catalogos"
INICIO_VIGENCIA = date(2026, 1, 1)


class NoSePuede(Exception):
    """Falta la unidad, la base no admite docx, el catálogo no se puede leer o
    la versión ya está congelada."""


@dataclass(frozen=True)
class AreaWord:
    unidad: str  # código de la unidad orgánica (EPI, DXI)
    formato: str  # código del formato
    nombre: str
    descripcion: str
    catalogo: str  # nombre del JSON en catalogos/
    exportador: str  # el script que lo genera
    notas: str  # de dónde salió la estructura
    criterio: str  # cómo reconoce el bot el documento


def leer_catalogo(area: AreaWord) -> dict:
    ruta = CATALOGOS / area.catalogo
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise NoSePuede(f"No está el catálogo {ruta}: genérelo con node servidor/scripts/{area.exportador}.") from e


def base_admite_word(bd: Session) -> bool:
    """Si `bd/migraciones/0007_farmacia_word.sql` ya se corrió: la restricción menciona docx."""
    definicion = bd.scalar(text(
        "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conname = 'ck_formato_version_tipo' AND conrelid = 'formato.formato_version'::regclass"
    ))
    return definicion is not None and "docx" in definicion


def _tiene_carga_aceptada(bd: Session, version_id: int) -> bool:
    return bd.scalar(select(Carga.id).where(Carga.formato_version_id == version_id, Carga.resultado == "aceptada", vigente(Carga))) is not None


def _borrar_catalogo(bd: Session, formato_id: int, version_id: int) -> None:
    bd.execute(delete(VersionIndicador).where(VersionIndicador.formato_version_id == version_id))
    bd.execute(delete(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version_id))
    bd.execute(delete(Indicador).where(Indicador.formato_id == formato_id))
    bd.execute(delete(Cuadro).where(Cuadro.formato_version_id == version_id))
    bd.flush()


def _formato_y_version(bd: Session, area: AreaWord, version_codigo: str) -> tuple[Formato, FormatoVersion]:
    unidad = bd.scalar(select(UnidadOrganica).where(UnidadOrganica.codigo == area.unidad, vigente(UnidadOrganica)))
    if unidad is None:
        raise NoSePuede(f"No existe la unidad «{area.unidad}»: ¿se corrió la semilla base?")
    formato = bd.scalar(select(Formato).where(Formato.codigo == area.formato, vigente(Formato)))
    if formato is None:
        formato = Formato(unidad_organica_id=unidad.id, codigo=area.formato, nombre=area.nombre, descripcion=area.descripcion, periodicidad="mensual", granularidad="mensual")
        bd.add(formato)
        bd.flush()
    elif formato.granularidad != "mensual":
        raise NoSePuede(f"El formato «{area.formato}» ya existe con granularidad «{formato.granularidad}»; el del área es mensual.")
    version = bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.codigo_version == version_codigo, vigente(FormatoVersion)))
    if version is None:
        version = FormatoVersion(formato_id=formato.id, codigo_version=version_codigo, estado="en_configuracion", fecha_inicio_vigencia=INICIO_VIGENCIA, notas=area.notas)
        bd.add(version)
        bd.flush()
    return formato, version


def cargar_catalogo(bd: Session, area: AreaWord, *, recargar: bool = False, catalogo: dict | None = None) -> str:
    """Deja la versión del catálogo creada y activa. No confirma: quien llama hace `commit()`."""
    if not base_admite_word(bd):
        raise NoSePuede("La base no admite archivos Word todavía. Corra antes: npm run migrate (bd/migraciones/0007_farmacia_word.sql)")
    catalogo = catalogo or leer_catalogo(area)
    version_codigo = catalogo["version"]
    formato, version = _formato_y_version(bd, area, version_codigo)

    if recargar and _tiene_carga_aceptada(bd, version.id):
        raise NoSePuede(f"«{version_codigo}» ya leyó un archivo aceptado: su configuración está congelada. Cree una versión nueva en vez de recargar esta.")
    if recargar:
        _borrar_catalogo(bd, formato.id, version.id)
        version.estado = "en_configuracion"
        version.tipo_archivo = None
        bd.flush()
    elif version.estado == "activa":
        return f"«{version_codigo}» ya está activa. Nada que hacer (use --recargar para rehacerla)."

    cuadro_id: dict[str, int] = {}
    for orden, c in enumerate(catalogo["cuadros"], start=1):
        cuadro = bd.scalar(select(Cuadro).where(Cuadro.formato_version_id == version.id, Cuadro.codigo == c["codigo"], vigente(Cuadro)))
        if cuadro is None:
            # Mensual: no hay días que ubicar. La «hoja» es el documento.
            cuadro = Cuadro(
                formato_version_id=version.id, codigo=c["codigo"], numero=c["numero"], titulo=c["titulo"],
                descripcion=c["subtitulo"], hoja=catalogo["hoja"], es_hoja_patron=False, ubicacion=None, orden=orden,
            )
            bd.add(cuadro)
            bd.flush()
        cuadro_id[c["codigo"]] = cuadro.id

    filas = [(c, x) for c in catalogo["cuadros"] for x in c["casillas"]]
    existentes = {i.codigo: i for i in bd.scalars(select(Indicador).where(Indicador.formato_id == formato.id, vigente(Indicador)))}
    nuevos = []
    for _, x in filas:
        if x["codigo"] in existentes:
            continue
        indicador = Indicador(
            formato_id=formato.id, codigo=x["codigo"], nombre=x["nombre"][:200],
            tipo_dato="decimal" if x.get("decimal") else "entero",
            unidad_medida="soles" if x.get("decimal") else catalogo.get("unidad", "casos"),
            valor_minimo=Decimal("0"),
            # Un monto o un examen puede faltar ese mes (una hoja sin campaña): el
            # bot decide qué es obligatorio, no la base.
            es_obligatorio=False,
        )
        existentes[x["codigo"]] = indicador
        nuevos.append(indicador)
    bd.add_all(nuevos)
    bd.flush()

    en_version = set(bd.scalars(select(VersionIndicador.indicador_id).where(VersionIndicador.formato_version_id == version.id, vigente(VersionIndicador))))
    orden_en_cuadro: dict[str, int] = {}
    por_agregar = []
    for c, x in filas:
        orden_en_cuadro[c["codigo"]] = orden_en_cuadro.get(c["codigo"], 0) + 1
        indicador = existentes[x["codigo"]]
        if indicador.id in en_version:
            continue
        por_agregar.append(VersionIndicador(
            formato_version_id=version.id, cuadro_id=cuadro_id[c["codigo"]], indicador_id=indicador.id, orden=orden_en_cuadro[c["codigo"]],
            etiqueta=x["nombre"][:200], metodo_lectura="etiqueta",
            # El bot encuentra cada cifra por los rótulos de su tabla en el Word.
            # «columnas» la exige la base; en un Word no hay columnas fijas.
            ubicacion={"etiquetas": x["etiquetas"], "columnas": [], "fila": x["fila"], "documento": "docx"},
        ))
    bd.add_all(por_agregar)
    bd.flush()

    if bd.scalar(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version.id, vigente(CriterioReconocimiento))) is None:
        bd.add(CriterioReconocimiento(
            formato_version_id=version.id, tipo="hoja_existe", hoja=catalogo["hoja"], es_patron=False, es_obligatorio=True, descripcion=area.criterio,
        ))
        bd.flush()

    version.tipo_archivo = "docx"
    version.estado = "activa"
    bd.flush()
    return f"«{version_codigo}» activada: {len(catalogo['cuadros'])} {'cuadro' if len(catalogo['cuadros']) == 1 else 'cuadros'}, {len(filas)} indicadores."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(area: AreaWord, prog: str, argv: list[str] | None = None) -> int:
    import argparse
    import sys

    from app.config import obtener_ajustes

    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog=prog, description=f"Carga el catálogo de {area.nombre} y lo activa, en DATABASE_URL.")
    parser.add_argument("--recargar", action="store_true", help="Borra el catálogo de la versión (si no está congelada) y lo vuelve a escribir.")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {_destino(obtener_ajustes().url_base)}")
    try:
        with fabrica()() as bd:
            mensaje = cargar_catalogo(bd, area, recargar=args.recargar)
            bd.commit()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    print(mensaje)
    return 0
