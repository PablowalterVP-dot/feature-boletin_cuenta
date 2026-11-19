"""Carga el catálogo de Centro Quirúrgico (`CQX-1`) y lo activa.

    python -m app.herramientas.cargar_catalogo_centro_quirurgico
    python -m app.herramientas.cargar_catalogo_centro_quirurgico --recargar

Existe porque la base instalada (`04_semilla.sql`) trae la unidad `CQX` y sus
destinos en la matriz, pero **ningún formato**: sin esto, Centro Quirúrgico no
puede recibir su Excel. Crea el formato `CQX` (mensual: una cifra por casilla,
sin días), su versión `CQX-1`, los cinco cuadros que el área digita y un
indicador por fila (`mayor.obstetricia`, `resumen.horas_efectivas.emergencia`,
el mismo código que usa el bot). No se copia aquí a mano: se lee de
`catalogos/centro_quirurgico.json`, que se genera desde la definición del bot
(`servidor/scripts/exportar-catalogo-centro-quirurgico.mjs`).

**Las especialidades son indicadores; los procedimientos, no.** La lista de
procedimientos cambia casi cada mes (más de 90 rótulos aparecen y desaparecen
de enero a agosto de 2026): catalogarlos haría que cada procedimiento nuevo
bloqueara la carga hasta que alguien lo agregara. La base guarda el total de
cada especialidad; el detalle viaja entero en `carga.informe_bot`
(`datos.procedimientos`), como los cuadros secundarios de Lavandería. Es una
decisión del 20/10/2026. Si hace falta consultar procedimientos fila por fila,
la salida es otra versión con su propio catálogo, no forzar este.

**Los cuadros calculados no se guardan** (Top Ten, el consolidado por
especialidad, la tabla derecha del cuadro de indicadores): salen de estos cinco
cada vez que se muestran, así no pueden quedar desactualizados.

**Las horas son `decimal`**: el RESUMEN suma duraciones (34,75 h). El bot las
redondea a centésimas, que es la escala de `valor.valor` (NUMERIC(14,2)).

**La hoja de cada cuadro es un patrón**: los nombres reales traen espacios al
final («CIRUGIA MAYOR ») y en enero el cuadro de indicadores se llama
«INDICADORES». El bot las busca sin espacios ni tildes; el patrón lo documenta.

Desde el 22/10/2026 también la corre `preparar_base` al arrancar la API (sin
`--recargar`): activar `CQX-1` pone a Centro Quirúrgico en el flujo, y antes se
dejaba a mano para no hacerlo antes de tiempo; ya está lista para probarse.

**Idempotente**: cada fila se busca por su clave natural antes de crearla. Con
`--recargar` se borra el catálogo de CQX-1 y se vuelve a escribir; se niega si
CQX-1 ya leyó un archivo aceptado (una versión que aceptó un archivo queda
congelada por un disparador de la base).

No fija quién actúa (`app.usuario_id`): es un operador con acceso a la base,
igual que las demás herramientas de catálogo.
"""

import argparse
import json
import re
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Carga, CriterioReconocimiento, Cuadro, Formato, FormatoVersion, Indicador, UnidadOrganica, VersionIndicador

CODIGO_UNIDAD = "CQX"
CODIGO_FORMATO = "CQX"
NOMBRE_FORMATO = "Reporte mensual de Centro Quirúrgico"
DESCRIPCION_FORMATO = "Producción quirúrgica del mes: resumen, cuadro de indicadores, cirugía mayor y menor por especialidad y causas de suspensión."
INICIO_VIGENCIA = date(2026, 1, 1)

CATALOGO = Path(__file__).parent / "catalogos" / "centro_quirurgico.json"


class NoSePuede(Exception):
    """Falta la unidad CQX (¿se instaló 04_semilla.sql?), el catálogo no se puede
    leer o la configuración de CQX-1 ya está congelada."""


def leer_catalogo(ruta: Path = CATALOGO) -> dict:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise NoSePuede(f"No está el catálogo {ruta}: genérelo con node servidor/scripts/exportar-catalogo-centro-quirurgico.mjs.") from e


def indicadores_de(catalogo: dict):
    """Un indicador por fila de cada cuadro, en el orden del Excel."""
    for c in catalogo["cuadros"]:
        for f in c["filas"]:
            yield c, f, f"{c['codigo']}.{f['clave']}"


def patron_de_hoja(nombres: list[str]) -> str:
    """Los nombres con que figuró la hoja, con los espacios de más que traen."""
    return r"^\s*(" + "|".join(re.escape(n) for n in nombres) + r")\s*$"


def _tiene_carga_aceptada(bd: Session, version_id: int) -> bool:
    return bd.scalar(select(Carga.id).where(Carga.formato_version_id == version_id, Carga.resultado == "aceptada", vigente(Carga))) is not None


def _borrar_catalogo(bd: Session, formato_id: int, version_id: int) -> None:
    """Deshace lo que esta herramienta pudo haber creado bajo CQX-1, de hijos a padres."""
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
        raise NoSePuede(f"El formato «{CODIGO_FORMATO}» ya existe con granularidad «{formato.granularidad}»; el de Centro Quirúrgico es mensual.")

    version = bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.codigo_version == version_codigo, vigente(FormatoVersion)))
    if version is None:
        version = FormatoVersion(
            formato_id=formato.id, codigo_version=version_codigo, estado="en_configuracion", fecha_inicio_vigencia=INICIO_VIGENCIA,
            notas="Estructura del libro mensual real del área (enero a agosto de 2026 revisados): acumulado, el bot lee la columna del mes de cinco hojas.",
        )
        bd.add(version)
        bd.flush()
    return formato, version


def cargar_catalogo(bd: Session, *, recargar: bool = False, catalogo: dict | None = None) -> str:
    """Deja CQX-1 con su catálogo y activa. No confirma: quien llama hace `commit()`."""
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
            cuadro = Cuadro(
                formato_version_id=version.id, codigo=c["codigo"], numero=c["numero"], titulo=c["titulo"],
                descripcion=f"Hoja {c['hojas'][0]} del libro del mes: la columna del mes. Se cuenta en {c['unidad']}.",
                hoja=patron_de_hoja(c["hojas"]), es_hoja_patron=True, ubicacion=None, orden=orden,
            )
            bd.add(cuadro)
            bd.flush()
        cuadro_id[c["codigo"]] = cuadro.id

    existentes = {i.codigo: i for i in bd.scalars(select(Indicador).where(Indicador.formato_id == formato.id, vigente(Indicador)))}
    filas = list(indicadores_de(catalogo))
    nuevos = []
    for c, f, codigo in filas:
        if codigo not in existentes:
            indicador = Indicador(
                formato_id=formato.id, codigo=codigo, nombre=f"{c['titulo']} · {f['nombre']}"[:200],
                tipo_dato="decimal" if f["decimal"] else "entero", unidad_medida=f["unidad"], valor_minimo=Decimal("0"),
                # Una fila que solo figura algunos meses (la encefalopatía, las
                # causas de enero) no es obligatoria.
                es_obligatorio=not f["ocasional"],
            )
            existentes[codigo] = indicador
            nuevos.append(indicador)
    bd.add_all(nuevos)
    bd.flush()

    en_version = set(bd.scalars(select(VersionIndicador.indicador_id).where(VersionIndicador.formato_version_id == version.id, vigente(VersionIndicador))))
    orden_en_cuadro: dict[str, int] = {}
    por_agregar = []
    for c, f, codigo in filas:
        orden_en_cuadro[c["codigo"]] = orden_en_cuadro.get(c["codigo"], 0) + 1
        indicador = existentes[codigo]
        if indicador.id in en_version:
            continue
        ubicacion = {"etiquetas": [f["etiqueta"]], "alias": f["alias"], "columna_valor": f.get("columna", "mes")}
        por_agregar.append(VersionIndicador(
            formato_version_id=version.id, cuadro_id=cuadro_id[c["codigo"]], indicador_id=indicador.id, orden=orden_en_cuadro[c["codigo"]],
            etiqueta=f["etiqueta"], metodo_lectura="etiqueta", ubicacion=ubicacion,
        ))
    bd.add_all(por_agregar)
    bd.flush()

    # El mismo reconocimiento que hace el bot (lector.js): el libro trae las
    # hojas por especialidad y SUSPENDIDAS, cuyo título dice el mes.
    for hoja, descripcion in (
        (patron_de_hoja(["CIRUGIA MAYOR"]), "El libro del mes trae la hoja CIRUGIA MAYOR."),
        (patron_de_hoja(["SUSPENDIDAS"]), "El libro del mes trae SUSPENDIDAS; su título («HOSPITAL REGIONAL DE LORETO - JUNIO 2026») dice el mes y el año, que el bot compara con el periodo."),
    ):
        existente = bd.scalar(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version.id, CriterioReconocimiento.hoja == hoja, vigente(CriterioReconocimiento)))
        if existente is None:
            bd.add(CriterioReconocimiento(formato_version_id=version.id, tipo="hoja_existe", hoja=hoja, es_patron=True, es_obligatorio=True, descripcion=descripcion))
    bd.flush()

    version.tipo_archivo = "xlsx"
    version.estado = "activa"
    bd.flush()
    return f"«{version_codigo}» activada: {len(catalogo['cuadros'])} cuadros, {len(filas)} indicadores."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.cargar_catalogo_centro_quirurgico",
        description="Carga el catálogo de Centro Quirúrgico (CQX-1: 5 cuadros) y lo activa, en DATABASE_URL.",
    )
    parser.add_argument("--recargar", action="store_true", help="Borra el catálogo de CQX-1 (si no está congelado) y lo vuelve a escribir desde cero.")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {_destino(obtener_ajustes().url_base)}")
    try:
        catalogo = leer_catalogo()
        with fabrica()() as bd:
            mensaje = cargar_catalogo(bd, recargar=args.recargar, catalogo=catalogo)
            bd.commit()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(mensaje)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
