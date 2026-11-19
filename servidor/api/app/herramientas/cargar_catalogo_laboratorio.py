"""Carga el catálogo de Laboratorio (`LAB-1`) y lo activa.

    python -m app.herramientas.cargar_catalogo_laboratorio
    python -m app.herramientas.cargar_catalogo_laboratorio --recargar

Existe porque la base instalada (`04_semilla.sql`) trae la unidad `LAB` y su
destino en la matriz, pero **ningún formato**: sin esto, Laboratorio no puede
recibir un Excel. Crea el formato `LAB` (mensual: una cifra por casilla, sin
días), su versión `LAB-1`, una sección por cuadro y un indicador por examen y
procedencia (`bioquimica.glucosa.emergencia`, el mismo código que usa el bot).

La estructura es la del libro real del área (`Oficios_Laboratorio.xlsx`): un
Excel por año con una hoja por mes, que el área sobrescribe. Por eso la hoja de
cada cuadro es un **patrón** (una hoja con nombre de mes): el bot lee la del
mes que se reporta. No se copia aquí a mano: se lee de
`catalogos/laboratorio.json`, que se genera desde la definición del bot
(`servidor/scripts/exportar-catalogo-laboratorio.mjs`). Si la definición cambia
después de que LAB-1 leyó un archivo, se carga como **otra versión**: una
versión que aceptó un archivo queda congelada por un disparador de la base.

En una base nueva o desplegada lo activa el seeder
`0007_formatos_de_las_nueve_areas.py`; a mano solo hace falta para `--recargar`.

**Idempotente**: cada fila se busca por su clave natural antes de crearla. Sin
`--recargar`, un error ya cargado no se corrige solo; con `--recargar` se borra
el catálogo de LAB-1 (nunca la dimensión `procedencia` ni sus valores, que
pueden usar otros formatos) y se vuelve a escribir. Se niega a recargar si LAB-1
ya leyó un archivo aceptado.

No fija quién actúa (`app.usuario_id`): es un operador con acceso a la base,
igual que `cargar_catalogo_nutricion`.
"""

import argparse
import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import (
    Carga,
    CriterioReconocimiento,
    Cuadro,
    Dimension,
    DimensionValor,
    Formato,
    FormatoVersion,
    Indicador,
    IndicadorDimension,
    UnidadOrganica,
    VersionIndicador,
)

CODIGO_UNIDAD = "LAB"
CODIGO_FORMATO = "LAB"
NOMBRE_FORMATO = "Reporte mensual de Patología Clínica y Anatomía Patológica"
DESCRIPCION_FORMATO = "Exámenes del mes por sección y procedencia (hospitalización, emergencia, consulta externa, privado, convenio, insolvencia)."
INICIO_VIGENCIA = date(2026, 1, 1)

CATALOGO = Path(__file__).parent / "catalogos" / "laboratorio.json"

# De dónde viene el examen: el servicio que lo pidió o, si es de fuera, cómo se
# paga. Es la columna del Excel del área; no es del todo ni `servicio` ni
# `financiador`, por eso es una dimensión propia.
DIMENSION = ("procedencia", "Procedencia", "De dónde viene la atención: el servicio que la pidió o, si es externa, cómo se paga.")


class NoSePuede(Exception):
    """Falta la unidad LAB (¿se instaló 04_semilla.sql?), el catálogo no se puede
    leer o la configuración de LAB-1 ya está congelada."""


def leer_catalogo(ruta: Path = CATALOGO) -> dict:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise NoSePuede(f"No está el catálogo {ruta}: genérelo con node servidor/scripts/exportar-catalogo-laboratorio.mjs.") from e


def indicadores_de(catalogo: dict):
    """Un indicador por examen y procedencia de su sección, en el orden del Excel.
    Metaxénicas tiene «Programa» en vez de consulta externa, y el resumen del
    departamento una sola columna (el total)."""
    for c in catalogo["cuadros"]:
        for e in c["examenes"]:
            for p in c["procedencias"]:
                yield c, e, p, f"{c['codigo']}.{e['clave']}.{p['clave']}"


def procedencias_de(catalogo: dict) -> list[dict]:
    """Las procedencias del reporte, sin repetir, en el orden en que aparecen."""
    vistas: dict[str, dict] = {}
    for c in catalogo["cuadros"]:
        for p in c["procedencias"]:
            vistas.setdefault(p["clave"], p)
    return list(vistas.values())


def _tiene_carga_aceptada(bd: Session, version_id: int) -> bool:
    return bd.scalar(select(Carga.id).where(Carga.formato_version_id == version_id, Carga.resultado == "aceptada", vigente(Carga))) is not None


def _borrar_catalogo(bd: Session, formato_id: int, version_id: int) -> None:
    """Deshace lo que esta herramienta pudo haber creado bajo LAB-1, de hijos a
    padres. Nunca toca la dimensión `procedencia` ni sus valores."""
    ids_indicador = bd.scalars(select(Indicador.id).where(Indicador.formato_id == formato_id)).all()
    bd.execute(delete(VersionIndicador).where(VersionIndicador.formato_version_id == version_id))
    bd.execute(delete(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version_id))
    if ids_indicador:
        bd.execute(delete(IndicadorDimension).where(IndicadorDimension.indicador_id.in_(ids_indicador)))
    bd.execute(delete(Indicador).where(Indicador.formato_id == formato_id))
    bd.execute(delete(Cuadro).where(Cuadro.formato_version_id == version_id))
    bd.flush()


def _formato_y_version(bd: Session, version_codigo: str) -> tuple[Formato, FormatoVersion]:
    unidad = bd.scalar(select(UnidadOrganica).where(UnidadOrganica.codigo == CODIGO_UNIDAD, vigente(UnidadOrganica)))
    if unidad is None:
        raise NoSePuede(f"No existe la unidad «{CODIGO_UNIDAD}»: ¿se instaló 04_semilla.sql?")

    formato = bd.scalar(select(Formato).where(Formato.codigo == CODIGO_FORMATO, vigente(Formato)))
    if formato is None:
        formato = Formato(unidad_organica_id=unidad.id, codigo=CODIGO_FORMATO, nombre=NOMBRE_FORMATO, descripcion=DESCRIPCION_FORMATO, periodicidad="mensual", granularidad="mensual")
        bd.add(formato)
        bd.flush()
    elif formato.granularidad != "mensual":
        raise NoSePuede(f"El formato «{CODIGO_FORMATO}» ya existe con granularidad «{formato.granularidad}»; el de Laboratorio es mensual.")

    version = bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.codigo_version == version_codigo, vigente(FormatoVersion)))
    if version is None:
        version = FormatoVersion(
            formato_id=formato.id, codigo_version=version_codigo, estado="en_configuracion", fecha_inicio_vigencia=INICIO_VIGENCIA,
            notas="Estructura del libro real del área (Oficios_Laboratorio.xlsx): una hoja por mes, sobrescrita cada año.",
        )
        bd.add(version)
        bd.flush()
    return formato, version


def cargar_catalogo(bd: Session, *, recargar: bool = False, catalogo: dict | None = None) -> str:
    """Deja LAB-1 con su catálogo y activa. No confirma: quien llama hace `commit()`."""
    catalogo = catalogo or leer_catalogo()
    version_codigo = catalogo["version"]
    formato, version = _formato_y_version(bd, version_codigo)

    if recargar and _tiene_carga_aceptada(bd, version.id):
        raise NoSePuede(f"«{version_codigo}» ya leyó un archivo aceptado: su configuración está congelada. Cree una versión nueva en vez de recargar esta.")
    if recargar:
        _borrar_catalogo(bd, formato.id, version.id)
        version.estado = "en_configuracion"
        version.tipo_archivo = None
        bd.flush()
    elif version.estado == "activa":
        return f"«{version_codigo}» ya está activa. Nada que hacer (use --recargar para rehacerla)."

    codigo_dim, nombre_dim, descripcion_dim = DIMENSION
    dimension = bd.scalar(select(Dimension).where(Dimension.codigo == codigo_dim, vigente(Dimension)))
    if dimension is None:
        dimension = Dimension(codigo=codigo_dim, nombre=nombre_dim, descripcion=descripcion_dim)
        bd.add(dimension)
        bd.flush()
    valor_id: dict[str, int] = {}
    for orden, p in enumerate(procedencias_de(catalogo), start=1):
        v = bd.scalar(select(DimensionValor).where(DimensionValor.dimension_id == dimension.id, DimensionValor.codigo == p["clave"], vigente(DimensionValor)))
        if v is None:
            v = DimensionValor(dimension_id=dimension.id, codigo=p["clave"], nombre=p["nombre"], orden=orden)
            bd.add(v)
            bd.flush()
        valor_id[p["clave"]] = v.id

    cuadro_id: dict[str, int] = {}
    for orden, c in enumerate(catalogo["cuadros"], start=1):
        cuadro = bd.scalar(select(Cuadro).where(Cuadro.formato_version_id == version.id, Cuadro.codigo == c["codigo"], vigente(Cuadro)))
        if cuadro is None:
            # Mensual: la base no exige ubicar días; la hoja sí.
            total = f"Fila TOTAL en el Excel: «{c['etiqueta_total']}». " if c["etiqueta_total"] else ""
            cuadro = Cuadro(
                formato_version_id=version.id, codigo=c["codigo"], numero=c["numero"], titulo=c["titulo"],
                descripcion=f"{total}Bloque {c['bloque']} de la hoja del mes. Se cuenta en {c['unidad']}.",
                hoja=catalogo["hoja_patron"], es_hoja_patron=True, ubicacion=None, orden=orden,
            )
            bd.add(cuadro)
            bd.flush()
        cuadro_id[c["codigo"]] = cuadro.id

    # Por lotes: son más de mil indicadores, y uno por consulta tardaba minutos
    # (cada fila pasa además por los disparadores de la bitácora). Se busca lo que
    # ya existe en una sola consulta y se inserta lo que falta de una vez.
    existentes = {i.codigo: i for i in bd.scalars(select(Indicador).where(Indicador.formato_id == formato.id, vigente(Indicador)))}
    filas = list(indicadores_de(catalogo))
    nuevos = []
    for c, e, p, codigo in filas:
        if codigo not in existentes:
            indicador = Indicador(
                formato_id=formato.id, codigo=codigo, nombre=f"{c['titulo']} · {e['etiqueta'].capitalize()} · {p['nombre']}"[:200],
                tipo_dato="entero", unidad_medida=c["unidad"], valor_minimo=Decimal("0"), es_obligatorio=True,
            )
            existentes[codigo] = indicador
            nuevos.append((indicador, p))
    bd.add_all([i for i, _ in nuevos])
    bd.flush()
    bd.add_all([IndicadorDimension(indicador_id=i.id, dimension_id=dimension.id, dimension_valor_id=valor_id[p["clave"]]) for i, p in nuevos])

    en_version = set(bd.scalars(select(VersionIndicador.indicador_id).where(VersionIndicador.formato_version_id == version.id, vigente(VersionIndicador))))
    orden_en_cuadro: dict[str, int] = {}
    por_agregar = []
    for c, e, p, codigo in filas:
        orden_en_cuadro[c["codigo"]] = orden_en_cuadro.get(c["codigo"], 0) + 1
        indicador = existentes[codigo]
        if indicador.id in en_version:
            continue
        por_agregar.append(VersionIndicador(
            formato_version_id=version.id, cuadro_id=cuadro_id[c["codigo"]], indicador_id=indicador.id, orden=orden_en_cuadro[c["codigo"]],
            etiqueta=e["etiqueta"], metodo_lectura="etiqueta",
            # La fila se busca por el nombre del examen dentro de su sección, con
            # sus alias; la procedencia es su columna.
            ubicacion={"etiquetas": [e["etiqueta"]], "columnas": [c["columna_rotulo"]], "alias": e["alias"], "seccion": c["codigo"], "columna_valor": p["columna"]},
        ))
    bd.add_all(por_agregar)
    bd.flush()

    # El mismo reconocimiento que hace el bot (lector.js): una hoja con nombre de
    # mes. El mes y el año de esa hoja los comprueba el bot contra el periodo.
    existente = bd.scalar(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version.id, CriterioReconocimiento.tipo == "hoja_existe", vigente(CriterioReconocimiento)))
    if existente is None:
        bd.add(CriterioReconocimiento(
            formato_version_id=version.id, tipo="hoja_existe", hoja=catalogo["hoja_patron"], es_patron=True,
            es_obligatorio=True, descripcion="El libro del año trae una hoja por mes (ENERO… AGO, SET…).",
        ))
        bd.flush()

    version.tipo_archivo = "xlsx"
    version.estado = "activa"
    bd.flush()
    total = sum(1 for _ in indicadores_de(catalogo))
    return f"«{version_codigo}» activada: {len(catalogo['cuadros'])} cuadros, {total} indicadores."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.cargar_catalogo_laboratorio",
        description="Carga el catálogo de Laboratorio (LAB-1) y lo activa, en DATABASE_URL.",
    )
    parser.add_argument("--recargar", action="store_true", help="Borra el catálogo de LAB-1 (si no está congelado) y lo vuelve a escribir desde cero.")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {_destino(obtener_ajustes().url_base)}")
    try:
        with fabrica()() as bd:
            mensaje = cargar_catalogo(bd, recargar=args.recargar)
            bd.commit()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(mensaje)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
