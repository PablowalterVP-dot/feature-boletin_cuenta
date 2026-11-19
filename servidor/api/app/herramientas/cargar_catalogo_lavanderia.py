"""Carga el catálogo de Lavandería (`LAV-1`) y lo activa.

    python -m app.herramientas.cargar_catalogo_lavanderia
    python -m app.herramientas.cargar_catalogo_lavanderia --recargar

Existe porque la base instalada (`04_semilla.sql`) trae la unidad `LAV`, pero
ningún formato (y, a diferencia de Nutrición, tampoco una versión vacía
`en_configuracion`): sin esto, Lavandería no puede recibir un Excel. Crea el
formato `LAV` (diaria, como Nutrición: una cifra por día), su versión `LAV-1`,
un cuadro («Kilos por servicio») y un indicador por servicio del hospital
(`f1.c-externos`, `f1.emergencia`, …), con el mismo código que usa el bot
(`servidor/bot-validador/src/areas/lavanderia/definicion.js`).

**Solo el cuadro f1 se cataloga aquí.** El Excel real del área trae otros
tres cuadros (confección, ropa sucia, piezas e insumos — ver el comentario de
`definicion.js` del bot), que el bot sí lee y valida, pero no tienen fila
`indicador` ni `valor`: la granularidad de un formato es del formato entero,
no del cuadro (`cargas.py::_filas_valor`), y mezclar diaria (f1, f3) con
mensual (f2, f4) en un solo «LAV» no es compatible con eso sin tocar ese
servicio. f1 es el único cuadro día-por-día y el que alimenta el Consolidado
de DIRESA (kilos de ropa lavada, agrupados por servicio); los otros tres
quedan enteros en `carga.informe_bot`, para que Estadística los vea, pero no
se pueden consultar fila por fila desde la base. Es una decisión del
14/10/2026, no una limitación descubierta después: si se necesita llevar su
historial relacional más adelante, la salida es un segundo formato (por
ejemplo «LAV-M», mensual, para f2 y f4) — no forzar su granularidad en este.

**No hay indicador ocasional que active una dimensión nueva, a diferencia de
Nutrición**: cada servicio es ya un indicador atómico (`f1.{servicio}`), sin
un segundo eje (comida, procedencia) que cruzar. Por eso esta carga no crea
ninguna `Dimension` ni `IndicadorDimension`.

**`version_indicador.ubicacion` es documentación, no una receta exacta**: el
bot no busca la fila de un servicio por una celda fija, la reconoce por su
rótulo en la columna B, y la fila de los días puede estar en la 12 o en la 13
según el mes (ver el comentario de `oficial.js` del bot). Ningún código vivo
consulta ese campo (ver el comentario de `cargar_catalogo_nutricion.py` sobre
`lectura_periodo`, el mismo caso).

**`criterio_reconocimiento` sí hace falta, aunque tampoco lo consulte el
código vivo**: `fn_validar_activacion()` exige al menos uno obligatorio para
activar una versión. El bot no reconoce la hoja de kilos por su nombre (el
real las llama "Hoja1".."Hoja4", y a veces trae una hoja vacía de más), la
reconoce por su contenido (que tenga "DIAS" y "PROCEDIMIENTO" y una fila con
1, 2… desde la C); el criterio de abajo documenta el texto del título, que sí
es estable en los tres meses revisados («INFORME MENSUAL DEL AREA DE
LAVANDERIA», B7), no el mecanismo exacto del bot.

**Idempotente**: cada fila se busca por su clave natural antes de crearla.
Sin `--recargar`, un error ya cargado no se corrige solo; con `--recargar` se
borra el catálogo de LAV-1 y se vuelve a escribir. Se niega a recargar si
LAV-1 ya leyó un archivo aceptado.

No fija quién actúa (`app.usuario_id`): es un operador con acceso a la base,
igual que `cargar_catalogo_nutricion` y `cargar_catalogo_laboratorio`.
"""

import argparse
import sys
from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Carga, CriterioReconocimiento, Cuadro, Formato, FormatoVersion, Indicador, UnidadOrganica, VersionIndicador

CODIGO_UNIDAD = "LAV"
CODIGO_FORMATO = "LAV"
CODIGO_VERSION = "LAV-1"
NOMBRE_FORMATO = "Reporte mensual de Lavandería"
DESCRIPCION_FORMATO = "Kilogramos de ropa lavada cada día, por servicio del hospital."
INICIO_VIGENCIA = date(2026, 1, 1)

CODIGO_CUADRO = "f1"
TITULO_CUADRO = "Kilogramos por servicio"
DESCRIPCION_CUADRO = "Kilogramos de ropa lavada cada día, por servicio del hospital. Columna B del Excel real; los días, desde la C."

# Mismo catálogo que servidor/bot-validador/src/areas/lavanderia/definicion.js
# (SERVICIOS). Si esa definición cambia, esto se actualiza a mano: son dos
# lenguajes distintos, sin forma de compartir el dato sin tooling nuevo.
SERVICIOS = (
    ("c-externos", "C. EXTERNOS"),
    ("emergencia", "EMERGENCIA"),
    ("psiquiatria", "PSIQUIATRIA"),
    ("med-general", "MED. GENERAL"),
    ("quemados", "QUEMADOS"),
    ("uci-medicina", "UCI-MEDICINA"),
    ("maternidad", "MATERNIDAD"),
    ("c-obstetrico", "C. OBSTETRICO"),
    ("pediatria-uci", "PEDIATRIA UCI - P"),
    ("neo-aloj", "NEO + ALOJ.CONJ."),
    ("ginecologia", "GINECOLOGIA"),
    ("c-quirurgico", "C. QUIRURGICO"),
    ("cirugia", "CIRUGIA"),
    ("hemodialisis", "HEMODILASIS"),
    # Ocasional: solo figuró en mayo de 2026, en 0. Se cataloga igual, por si
    # vuelve a usarse (ver definicion.js del bot).
    ("uci-cirugia", "UCI-CIRUGIA"),
)


class NoSePuede(Exception):
    """Falta la unidad LAV (¿se instaló 04_semilla.sql?), el formato ya existe
    con otra granularidad, o la configuración de LAV-1 ya está congelada."""


def _tiene_carga_aceptada(bd: Session, version_id: int) -> bool:
    return bd.scalar(select(Carga.id).where(Carga.formato_version_id == version_id, Carga.resultado == "aceptada", vigente(Carga))) is not None


def _borrar_catalogo(bd: Session, formato_id: int, version_id: int) -> None:
    """Deshace lo que esta herramienta pudo haber creado bajo LAV-1, de hijos a
    padres. No hay ninguna `Dimension` que tocar: ver el comentario de arriba."""
    bd.execute(delete(VersionIndicador).where(VersionIndicador.formato_version_id == version_id))
    bd.execute(delete(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version_id))
    bd.execute(delete(Indicador).where(Indicador.formato_id == formato_id))
    bd.execute(delete(Cuadro).where(Cuadro.formato_version_id == version_id))
    bd.flush()


def _formato_y_version(bd: Session) -> tuple[Formato, FormatoVersion]:
    unidad = bd.scalar(select(UnidadOrganica).where(UnidadOrganica.codigo == CODIGO_UNIDAD, vigente(UnidadOrganica)))
    if unidad is None:
        raise NoSePuede(f"No existe la unidad «{CODIGO_UNIDAD}»: ¿se instaló 04_semilla.sql?")

    formato = bd.scalar(select(Formato).where(Formato.codigo == CODIGO_FORMATO, vigente(Formato)))
    if formato is None:
        formato = Formato(
            unidad_organica_id=unidad.id, codigo=CODIGO_FORMATO, nombre=NOMBRE_FORMATO, descripcion=DESCRIPCION_FORMATO,
            periodicidad="mensual", granularidad="diaria",
        )
        bd.add(formato)
        bd.flush()
    elif formato.granularidad != "diaria":
        raise NoSePuede(f"El formato «{CODIGO_FORMATO}» ya existe con granularidad «{formato.granularidad}»; el de Lavandería (f1) es diaria.")

    version = bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.codigo_version == CODIGO_VERSION, vigente(FormatoVersion)))
    if version is None:
        version = FormatoVersion(
            formato_id=formato.id, codigo_version=CODIGO_VERSION, estado="en_configuracion", fecha_inicio_vigencia=INICIO_VIGENCIA,
            notas="Estructura del Excel real del área (tres meses revisados: mayo, julio y agosto de 2026). Solo f1 (kilos por servicio); ver el docstring de esta herramienta.",
        )
        bd.add(version)
        bd.flush()
    return formato, version


def cargar_catalogo(bd: Session, *, recargar: bool = False) -> str:
    """Deja LAV-1 con su catálogo y activa. No confirma: quien llama hace `commit()`."""
    formato, version = _formato_y_version(bd)

    if recargar and _tiene_carga_aceptada(bd, version.id):
        raise NoSePuede(f"«{CODIGO_VERSION}» ya leyó un archivo aceptado: su configuración está congelada. Cree una versión nueva en vez de recargar esta.")
    if recargar:
        _borrar_catalogo(bd, formato.id, version.id)
        version.estado = "en_configuracion"
        version.tipo_archivo = None
        bd.flush()
    elif version.estado == "activa":
        return f"«{CODIGO_VERSION}» ya está activa. Nada que hacer (use --recargar para rehacerla)."

    cuadro = bd.scalar(select(Cuadro).where(Cuadro.formato_version_id == version.id, Cuadro.codigo == CODIGO_CUADRO, vigente(Cuadro)))
    if cuadro is None:
        cuadro = Cuadro(
            formato_version_id=version.id, codigo=CODIGO_CUADRO, numero=1, titulo=TITULO_CUADRO, descripcion=DESCRIPCION_CUADRO,
            hoja="Kilos por servicio", es_hoja_patron=False,
            ubicacion={"orientacion": "horizontal", "columna_rotulo": "B", "columna_primer_dia": "C"},
            orden=1,
        )
        bd.add(cuadro)
        bd.flush()

    for orden, (clave, rotulo) in enumerate(SERVICIOS, start=1):
        codigo = f"{CODIGO_CUADRO}.{clave}"
        indicador = bd.scalar(select(Indicador).where(Indicador.formato_id == formato.id, Indicador.codigo == codigo, vigente(Indicador)))
        if indicador is None:
            indicador = Indicador(
                formato_id=formato.id, codigo=codigo, nombre=f"Kilos por servicio · {rotulo}",
                tipo_dato="entero", unidad_medida="kilogramos", valor_minimo=Decimal("0"),
                # UCI-CIRUGIA no es obligatoria: solo figuró en mayo de 2026 (y en 0).
                es_obligatorio=clave != "uci-cirugia",
            )
            bd.add(indicador)
            bd.flush()

        existente = bd.scalar(select(VersionIndicador).where(VersionIndicador.formato_version_id == version.id, VersionIndicador.indicador_id == indicador.id, vigente(VersionIndicador)))
        if existente is None:
            bd.add(VersionIndicador(
                formato_version_id=version.id, cuadro_id=cuadro.id, indicador_id=indicador.id, orden=orden,
                etiqueta=rotulo, metodo_lectura="etiqueta",
                ubicacion={"etiquetas": [rotulo], "columnas": ["B"]},
            ))
            bd.flush()

    existente = bd.scalar(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version.id, CriterioReconocimiento.tipo == "celda_texto", vigente(CriterioReconocimiento)))
    if existente is None:
        bd.add(CriterioReconocimiento(
            formato_version_id=version.id, tipo="celda_texto", hoja=TITULO_CUADRO, celda="B7",
            texto_esperado=r"(?i)lavanderia", es_patron=True, es_obligatorio=True,
            descripcion="El título de la hoja de kilos («INFORME MENSUAL DEL AREA DE LAVANDERIA», B7 en los tres meses revisados). El bot no reconoce la hoja por este criterio exacto: la reconoce por su contenido, no por un nombre ni una celda fija (ver el docstring de esta herramienta).",
        ))
        bd.flush()

    version.tipo_archivo = "xlsx"
    version.estado = "activa"
    bd.flush()
    return f"«{CODIGO_VERSION}» activada: 1 cuadro, {len(SERVICIOS)} indicadores."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.cargar_catalogo_lavanderia",
        description="Carga el catálogo de Lavandería (LAV-1: 1 cuadro, 15 indicadores) y lo activa, en DATABASE_URL.",
    )
    parser.add_argument("--recargar", action="store_true", help="Borra el catálogo de LAV-1 (si no está congelado) y lo vuelve a escribir desde cero.")
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
