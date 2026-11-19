"""Configura NUT-2: la estructura real del Excel de Nutrición.

    python -m app.herramientas.configurar_nutricion_real
    python -m app.herramientas.configurar_nutricion_real --recargar

Basado en los 9 archivos reales de enero a setiembre de 2026
(`insumos/nutricion/`, fuera de git: no vienen con el repositorio).

NUT-1 (el catálogo de `servidor/bot-validador/.../definicion.js`, basado en el oficio
de ejemplo N.º 122-2026) ya aceptó una carga real en esta base y quedó
congelada por el disparador de activación: no se puede recargar. Por eso esto
crea una versión nueva, NUT-2, en vez de tocar NUT-1.

**Los 36 indicadores son los MISMOS de NUT-1.** La identidad de un indicador
es del formato, no de la versión (`INFORME_AVANCE_04.md` § 3.3): no se
duplican, se reutilizan (`cargar_catalogo_nutricion` tiene que haber corrido
antes). Lo único que cambia es la lectura: NUT-2 describe cómo encontrar esos
mismos 36 indicadores en el Excel que el área ya llena, no en la plantilla
que genera el bot.

Diferencias con NUT-1, confirmadas abriendo los 9 archivos reales con el
lector del propio bot (`xlsx.js`), celda por celda:

- **Sin hoja oculta `_plantilla`.** No hay como reconocer área/periodo/
  versión por una celda; el reconocimiento aquí es solo `hoja_existe`, sobre
  las 4 hojas reales.
- **Los nombres de hoja tienen espacios de más** (`"COMENSALES HOSP  "`, con
  dos espacios al final, igual en los 9 meses). Se escriben tal cual: es lo
  que el lector tiene que normalizar, no lo que "debería" decir.
- **La fila de los días no es la misma en las cuatro hojas**: 4 en Comensales
  (hay una fila de subtítulo de más, "SERVICIO DE..."), 3 en Pacientes.
- **Las etiquetas reales tienen errores de tipeo que se conservan tal
  cual** (`"DIETETTICA"`, con doble T, en los 9 meses) y los tres grupos de
  internos de f1 usan `"COMIDA"` en vez de `"CENA"` para la tercera comida —
  confirmado en los 9 meses: no es un error de un mes, es la etiqueta real.
- **`version_indicador.ubicacion_total` queda vacío**, igual que en NUT-1: la
  columna del total se mueve según los días del mes (AH/AG/AE, confirmado en
  los 9 archivos) y el esquema la modela como un valor fijo. Localizarla es
  trabajo del lector (bot, paso siguiente), no de esta configuración.

Lo que NO se cataloga a propósito (decisiones del 03/10/2026, pendientes de
confirmar con el área esta semana):

- **`"INT ENF UNSM"` (sin punto).** Aparece de enero a abril junto a
  `"INT. ENF UNSM"` (con punto) — dos bloques de datos distintos en los
  mismos 4 meses. Desde mayo solo queda la variante **con** punto, que es la
  que esta configuración cataloga como «Internos de Enfermería»
  (`f1.int-enfermeria.*`). La variante sin punto no se cataloga: de enero a
  abril va a salir como el hallazgo `fila_no_catalogada` (pendiente del bot,
  paso siguiente), no se pierde en silencio y tampoco se fusiona con la otra
  sin saber si son el mismo grupo.
- **`"PATRIMONIO"`** (decisión del 05/10/2026). Aparece solo en abril, con una
  sola fila (almuerzo) y cifras reales (242 raciones, incluidas en el TOTAL de
  ese mes). Siguiendo la plantilla, es un grupo más de la emergencia, con
  desayuno y almuerzo como Dirección y Residuos: NUT-2 suma sus dos
  indicadores (`f2.patrimonio.*`), los únicos que no vienen de NUT-1.
- **`"INT ENF UNSM"` sin punto** (decisión del 05/10/2026): por su lugar y sus
  cifras es Obstetricia (unas 16 raciones diarias, como «INT OBT UNSM» desde
  mayo). El bot lo corrige solo cuando convive con «INT. ENF UNSM» y lo informa
  (`definicion.js`, CORRECCIONES); aquí se documenta como una etiqueta más de
  Obstetricia.

**Activar** (`--activar`): el bot ya lee el Excel real (`areas/nutricion/
oficial.js`, versión NUT-2), así que NUT-2 pasa a `activa` y NUT-1 a
`retirada`. Sin `--activar` queda en `en_configuracion`, como antes.

Idempotente, mismo patrón que `cargar_catalogo_nutricion`: compara por clave
natural antes de crear. Sin `--recargar` no toca nada si NUT-2 ya existe.
"""

import argparse
import sys
from datetime import date
from decimal import Decimal

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
    VersionIndicador,
)
from app.herramientas.cargar_catalogo_nutricion import CUADROS as CUADROS_NUT1
from app.herramientas.cargar_catalogo_nutricion import DOS_COMIDAS, _indicadores_de

# Los cuadros de NUT-2: los de NUT-1 más Patrimonio en la emergencia, entre
# Dirección y Residuos (su lugar en el Excel de abril). Misma estructura que
# servidor/bot-validador/src/areas/nutricion/definicion.js: la prueba de
# contrato con el bot real lo comprueba.
CUADROS = tuple(
    {**cu, "grupos": cu["grupos"][:1] + (("patrimonio", "Patrimonio", DOS_COMIDAS),) + cu["grupos"][1:]} if cu["codigo"] == "f2" else cu
    for cu in CUADROS_NUT1
)

CODIGO_FORMATO = "NUT"
CODIGO_VERSION = "NUT-2"

# Hoja real (tal cual, con sus espacios) y en qué fila están los días —
# confirmado abriendo los 9 archivos reales (enero a setiembre de 2026).
HOJA_REAL = {
    "f1": {"hoja": "COMENSALES HOSP  ", "fila_dias": 4},
    "f2": {"hoja": "COMENSALES EMERG", "fila_dias": 4},
    "f3": {"hoja": "PACIENTES HOSP", "fila_dias": 3},
    "f4": {"hoja": "PACIENTES EMERG", "fila_dias": 3},
}

# Etiqueta real de cada grupo (columna A), tal cual aparece en los 9 meses.
# "int-enfermeria" cataloga la variante CON punto (ver el docstring del
# módulo sobre la variante sin punto, que no se cataloga a propósito).
ETIQUETA_GRUPO_REAL = {
    "asistencial": "ASIST.  Y ADMINIST.",
    "int-medicina": "INT MED UNAP",
    "int-obstetricia": "INT OBT  UNSM",
    "int-nutricion": "INT. NUT",
    "int-enfermeria": "INT. ENF UNSM",
    "direccion": "DIRECCION GENERAL",
    "patrimonio": "PATRIMONIO",
    "residuos": "RESIDUOS SOLIDOS",
    "nutricion": "DPTO DE NUTRICION Y DIETETTICA",
    "completa": "COMPLETA",
    "blanda": "BLANDAS",
    "licuada": "LICUADAS",
    "liquida": "LIQUIDAS",
    "sis": "SIS",
}

# Grupos donde la tercera comida se llama "COMIDA" en el Excel real, no
# "CENA" — los tres grupos de internos de f1, confirmado en los 9 meses.
GRUPOS_CON_COMIDA_EN_VEZ_DE_CENA = frozenset({"int-medicina", "int-obstetricia", "int-enfermeria"})

ETIQUETA_COMIDA_REAL = {"desayuno": "DESAYUNO", "almuerzo": "ALMUERZO", "cena": "CENA"}


class NoSePuede(Exception):
    """El formato no existe, falta algún indicador de NUT-1 que reutilizar, o
    NUT-2 ya leyó un archivo aceptado y no se puede recargar."""


def _etiqueta_comida(grupo_clave: str, comida: str) -> str:
    if comida == "cena" and grupo_clave in GRUPOS_CON_COMIDA_EN_VEZ_DE_CENA:
        return "COMIDA"
    return ETIQUETA_COMIDA_REAL[comida]


def _tiene_carga_aceptada(bd: Session, version_id: int) -> bool:
    return bd.scalar(select(Carga.id).where(Carga.formato_version_id == version_id, Carga.resultado == "aceptada", vigente(Carga))) is not None


def _crear_indicadores_nuevos(bd: Session, formato_id: int, existentes: dict[str, int]) -> dict[str, int]:
    """Los indicadores de NUT-2 que NUT-1 no tenía (hoy, Patrimonio), con sus
    dimensiones como los demás: población, servicio, comida y grupo. Un
    indicador es del formato, no de la versión: si ya existe, se reutiliza."""
    nuevos = {}
    dimension_id = {}
    for cu in CUADROS:
        for ind in _indicadores_de(cu):
            if ind["codigo"] in existentes:
                continue
            for codigo in ("poblacion", "servicio", "comida", cu["dimension_grupo"]):
                if codigo not in dimension_id:
                    d = bd.scalar(select(Dimension).where(Dimension.codigo == codigo, vigente(Dimension)))
                    if d is None:
                        raise NoSePuede(f"Falta la dimensión «{codigo}»: ¿corrió `cargar_catalogo_nutricion`?")
                    dimension_id[codigo] = d.id
            valor_grupo = bd.scalar(select(DimensionValor).where(DimensionValor.dimension_id == dimension_id[cu["dimension_grupo"]], DimensionValor.codigo == ind["grupo_clave"], vigente(DimensionValor)))
            if valor_grupo is None:
                orden = len(bd.scalars(select(DimensionValor.id).where(DimensionValor.dimension_id == dimension_id[cu["dimension_grupo"]])).all()) + 1
                valor_grupo = DimensionValor(dimension_id=dimension_id[cu["dimension_grupo"]], codigo=ind["grupo_clave"], nombre=ind["grupo_label"], orden=orden)
                bd.add(valor_grupo)
                bd.flush()
            indicador = Indicador(
                formato_id=formato_id, codigo=ind["codigo"], nombre=ind["nombre"],
                tipo_dato="entero", unidad_medida="raciones", valor_minimo=Decimal("0"), es_obligatorio=False,
            )
            bd.add(indicador)
            bd.flush()
            for codigo, valor in (("poblacion", cu["poblacion"]), ("servicio", cu["servicio"]), ("comida", ind["comida"])):
                v = bd.scalar(select(DimensionValor).where(DimensionValor.dimension_id == dimension_id[codigo], DimensionValor.codigo == valor, vigente(DimensionValor)))
                if v is None:
                    raise NoSePuede(f"Falta el valor «{valor}» de la dimensión «{codigo}»: ¿se instaló 04_semilla.sql?")
                bd.add(IndicadorDimension(indicador_id=indicador.id, dimension_id=dimension_id[codigo], dimension_valor_id=v.id))
            bd.add(IndicadorDimension(indicador_id=indicador.id, dimension_id=dimension_id[cu["dimension_grupo"]], dimension_valor_id=valor_grupo.id))
            bd.flush()
            nuevos[ind["codigo"]] = indicador.id
    return nuevos


def activar(bd: Session) -> str:
    """NUT-2 pasa a `activa` y NUT-1 a `retirada`. La base exige que la
    configuración de NUT-2 esté completa para activarla (disparador de
    activación): si falta algo, lo dice ella. No confirma."""
    formato = bd.scalar(select(Formato).where(Formato.codigo == CODIGO_FORMATO, vigente(Formato)))
    if formato is None:
        raise NoSePuede(f"No existe el formato «{CODIGO_FORMATO}».")
    nueva = bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.codigo_version == CODIGO_VERSION, vigente(FormatoVersion)))
    if nueva is None:
        raise NoSePuede(f"No existe «{CODIGO_VERSION}»: corra primero esta herramienta sin --activar.")
    if nueva.estado == "activa":
        return f"«{CODIGO_VERSION}» ya está activa."
    for anterior in bd.scalars(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.estado == "activa", vigente(FormatoVersion))):
        anterior.estado = "retirada"
        anterior.fecha_fin_vigencia = max(anterior.fecha_inicio_vigencia, date.today())
    bd.flush()
    nueva.estado = "activa"
    bd.flush()
    return f"«{CODIGO_VERSION}» activada: el bot lee el Excel real de Nutrición. Las versiones anteriores quedan retiradas."


def configurar(bd: Session, *, recargar: bool = False) -> str:
    """Deja NUT-2 con la lectura real, en `en_configuracion`. No confirma:
    quien llama hace `commit()`."""
    formato = bd.scalar(select(Formato).where(Formato.codigo == CODIGO_FORMATO, vigente(Formato)))
    if formato is None:
        raise NoSePuede(f"No existe el formato «{CODIGO_FORMATO}». ¿Se instaló 04_semilla.sql?")

    version = bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.codigo_version == CODIGO_VERSION, vigente(FormatoVersion)))
    if version is not None:
        if recargar and _tiene_carga_aceptada(bd, version.id):
            raise NoSePuede(f"«{CODIGO_VERSION}» ya leyó un archivo aceptado: está congelada. Cree NUT-3 en vez de recargar esta.")
        if not recargar:
            return f"«{CODIGO_VERSION}» ya existe (estado «{version.estado}»). Nada que hacer (use --recargar para rehacerla; no se activa sola)."
        bd.execute(delete(VersionIndicador).where(VersionIndicador.formato_version_id == version.id))
        bd.execute(delete(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version.id))
        bd.execute(delete(Cuadro).where(Cuadro.formato_version_id == version.id))
        bd.flush()
    else:
        version = FormatoVersion(formato_id=formato.id, codigo_version=CODIGO_VERSION, estado="en_configuracion", tipo_archivo="xlsx", fecha_inicio_vigencia=date(2026, 1, 1))
        bd.add(version)
        bd.flush()

    indicador_id_por_codigo = dict(bd.execute(select(Indicador.codigo, Indicador.id).where(Indicador.formato_id == formato.id)).all())
    if not indicador_id_por_codigo:
        raise NoSePuede("No hay ningún indicador de NUT: corra primero `cargar_catalogo_nutricion` (NUT-2 reutiliza esos mismos 36).")
    indicador_id_por_codigo.update(_crear_indicadores_nuevos(bd, formato.id, indicador_id_por_codigo))

    for orden_cuadro, cu in enumerate(CUADROS, start=1):
        real = HOJA_REAL[cu["codigo"]]
        cuadro = Cuadro(
            formato_version_id=version.id, codigo=cu["codigo"], numero=cu["numero"], titulo=cu["titulo"], descripcion=cu["descripcion"],
            hoja=real["hoja"], es_hoja_patron=False,
            ubicacion={"orientacion": "horizontal", "fila_dias": real["fila_dias"], "columna_primer_dia": "C"},
            orden=orden_cuadro,
        )
        bd.add(cuadro)
        bd.flush()

        for orden_indicador, ind in enumerate(_indicadores_de(cu), start=1):
            indicador_id = indicador_id_por_codigo.get(ind["codigo"])
            if indicador_id is None:
                raise NoSePuede(f"Falta el indicador «{ind['codigo']}»: ¿corrió `cargar_catalogo_nutricion`?")
            etiqueta_grupo = ETIQUETA_GRUPO_REAL[ind["grupo_clave"]]
            etiqueta_comida = _etiqueta_comida(ind["grupo_clave"], ind["comida"])
            bd.add(VersionIndicador(
                formato_version_id=version.id, cuadro_id=cuadro.id, indicador_id=indicador_id, orden=orden_indicador,
                etiqueta=f"{etiqueta_grupo} · {etiqueta_comida}", metodo_lectura="etiqueta",
                ubicacion={"etiquetas": [etiqueta_grupo, etiqueta_comida], "columnas": ["A", "B"], "arrastrar_vacias": True},
            ))
        bd.flush()

    for cu in CUADROS:
        real = HOJA_REAL[cu["codigo"]]
        bd.add(CriterioReconocimiento(
            formato_version_id=version.id, tipo="hoja_existe", hoja=real["hoja"], es_obligatorio=True,
            descripcion=f"La hoja «{cu['titulo']}» del Excel real de Nutrición.",
        ))
    bd.flush()

    total_indicadores = sum(1 for cu in CUADROS for _ in _indicadores_de(cu))
    return f"«{CODIGO_VERSION}» configurada, en_configuracion: {len(CUADROS)} cuadros, {total_indicadores} indicadores (los de NUT-1 más Patrimonio). Se activa con --activar."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.configurar_nutricion_real",
        description="Configura NUT-2 (la lectura del Excel real de Nutrición) en DATABASE_URL. Reutiliza los indicadores de NUT-1 y agrega Patrimonio; con --activar, la activa.",
    )
    parser.add_argument("--recargar", action="store_true", help="Borra la configuración de NUT-2 (si no está congelada) y la vuelve a escribir desde cero.")
    parser.add_argument("--activar", action="store_true", help="Además, activa NUT-2 y retira NUT-1 (el bot ya lee el Excel real).")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {_destino(obtener_ajustes().url_base)}")
    try:
        with fabrica()() as bd:
            mensaje = configurar(bd, recargar=args.recargar)
            if args.activar:
                mensaje += "\n" + activar(bd)
            bd.commit()
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(mensaje)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
