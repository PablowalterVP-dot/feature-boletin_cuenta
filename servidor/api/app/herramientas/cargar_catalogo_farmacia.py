"""Carga el catálogo de Farmacia (`FAR-W1`) y lo activa.

    python -m app.herramientas.cargar_catalogo_farmacia
    python -m app.herramientas.cargar_catalogo_farmacia --recargar

La base instalada (`04_semilla.sql`) trae la unidad `FAR` y su destino en la
matriz (Planeamiento), pero ningún formato: sin esto, Farmacia no puede subir
su informe. Crea el formato `FAR` (mensual: una cifra por casilla, sin días),
su versión `FAR-W1`, los tres cuadros (atenciones del mes, Sala de
Operaciones y Consultorios externos) y un indicador por casilla
(`f1.sis.hosp`, el mismo código que usa el bot). El Formato 4 (metas y
convenios) no tiene casillas hasta que el área diga qué contiene.

**Farmacia entrega un Word, no un Excel.** La versión se activa con
`tipo_archivo = 'docx'`, que avance_04 no admite: antes hay que correr
`bd/migraciones/0007_farmacia_word.sql`. Si falta, esta herramienta lo dice en vez de dejar
que la base responda con un error de restricción.

Las casillas no se copian aquí a mano: se leen de `catalogos/farmacia.json`,
que se genera desde la definición del bot
(`servidor/scripts/exportar-catalogo-farmacia.mjs`). Una versión que aceptó un
archivo queda congelada por un disparador de la base: si la definición
cambia después, se carga como otra versión.

No se activa sola al arrancar la API, a propósito: activar `FAR-W1` pone a
Farmacia en el flujo. Se corre a mano cuando el área empiece a reportar por el
sistema. **Idempotente**, como la de Laboratorio.
"""

import argparse
import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
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

CODIGO_UNIDAD = "FAR"
CODIGO_FORMATO = "FAR"
NOMBRE_FORMATO = "Informe mensual del Departamento de Farmacia"
DESCRIPCION_FORMATO = "Atenciones del mes por financiador, Sala de Operaciones y Consultorios externos. Se sube el informe en Word."
INICIO_VIGENCIA = date(2026, 1, 1)

CATALOGO = Path(__file__).parent / "catalogos" / "farmacia.json"


class NoSePuede(Exception):
    """Falta la unidad FAR, la base no admite docx, el catálogo no se puede leer
    o la configuración de FAR-W1 ya está congelada."""


def leer_catalogo(ruta: Path = CATALOGO) -> dict:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise NoSePuede(f"No está el catálogo {ruta}: genérelo con node servidor/scripts/exportar-catalogo-farmacia.mjs.") from e


def casillas_de(catalogo: dict):
    """Cada casilla con su cuadro, en el orden del informe."""
    for c in catalogo["cuadros"]:
        for x in c["casillas"]:
            yield c, x


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
        raise NoSePuede(f"El formato «{CODIGO_FORMATO}» ya existe con granularidad «{formato.granularidad}»; el de Farmacia es mensual.")

    version = bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.codigo_version == version_codigo, vigente(FormatoVersion)))
    if version is None:
        version = FormatoVersion(
            formato_id=formato.id, codigo_version=version_codigo, estado="en_configuracion", fecha_inicio_vigencia=INICIO_VIGENCIA,
            notas="Estructura del informe mensual real del área en Word (01_INFORME_MES_DE_ENERO_2026.docx).",
        )
        bd.add(version)
        bd.flush()
    return formato, version


def cargar_catalogo(bd: Session, *, recargar: bool = False, catalogo: dict | None = None) -> str:
    """Deja FAR-W1 con su catálogo y activa. No confirma: quien llama hace `commit()`."""
    if not base_admite_word(bd):
        raise NoSePuede("La base no admite archivos Word todavía. Corra antes: npm run migrate (bd/migraciones/0007_farmacia_word.sql)")

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

    existentes = {i.codigo: i for i in bd.scalars(select(Indicador).where(Indicador.formato_id == formato.id, vigente(Indicador)))}
    filas = list(casillas_de(catalogo))
    nuevos = []
    for _, x in filas:
        if x["codigo"] not in existentes:
            indicador = Indicador(
                formato_id=formato.id, codigo=x["codigo"], nombre=x["nombre"][:200],
                tipo_dato="entero", unidad_medida="atenciones", valor_minimo=Decimal("0"), es_obligatorio=True,
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
            # El bot encuentra la cifra por el rótulo que la acompaña en el Word
            # (areas/farmacia/lector.js). «columnas» la exige la base; en un Word
            # no hay columnas de rótulo fijas.
            ubicacion={"etiquetas": x["etiquetas"], "columnas": [], "fila": x["fila"], "documento": "docx"},
        ))
    bd.add_all(por_agregar)
    bd.flush()

    # Cómo reconoce el bot el informe (lector.js): por su cuadro «Resumen Total
    # de Recetas Atendidas» y el mes del asunto. La base solo sabe de hojas y
    # celdas: se deja descrito.
    existente = bd.scalar(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version.id, vigente(CriterioReconocimiento)))
    if existente is None:
        bd.add(CriterioReconocimiento(
            formato_version_id=version.id, tipo="hoja_existe", hoja=catalogo["hoja"], es_patron=False, es_obligatorio=True,
            descripcion="Un Word con el cuadro «Resumen Total de Recetas Atendidas» y la tabla de Sala de Operaciones; el mes sale del asunto.",
        ))
        bd.flush()

    version.tipo_archivo = "docx"
    version.estado = "activa"
    bd.flush()
    return f"«{version_codigo}» activada: {len(catalogo['cuadros'])} cuadros, {len(filas)} casillas."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.cargar_catalogo_farmacia",
        description="Carga el catálogo de Farmacia (FAR-W1) y lo activa, en DATABASE_URL.",
    )
    parser.add_argument("--recargar", action="store_true", help="Borra el catálogo de FAR-W1 (si no está congelado) y lo vuelve a escribir desde cero.")
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
