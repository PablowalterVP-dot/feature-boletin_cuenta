"""Carga el catálogo real de Nutrición (`NUT-1`) y la activa.

    python -m app.herramientas.cargar_catalogo_nutricion
    python -m app.herramientas.cargar_catalogo_nutricion --recargar

Existe porque la base instalada (`04_semilla.sql`) no trae ningún indicador de
Nutrición: solo el formato `NUT` y una versión `NUT-1` vacía, `en_configuracion`.
`bd/avance_04/07_ejemplo_nutricion.sql` sí trae un catálogo, pero es **de
ejemplo** (se instala dentro de una transacción de prueba que termina en
`ROLLBACK`) y su configuración de lectura en `06_prueba.sql` describe hojas de
otro Excel (`"HOSP. COMENSALES"`, etc.), no la plantilla real que genera el bot.

**Los 4 cuadros y 36 indicadores de aquí son los de la definición del bot**
(`servidor/bot-validador/src/areas/nutricion/definicion.js`), tomada del oficio
N.º 122-2026. **Ese oficio es un ejemplo, no un documento real** (avance 04 §
1): este catálogo sirve para trabajar mientras no se tenga el Excel real de
Nutrición, y se reemplaza por el verdadero cuando llegue. Lo que sí describe
algo existente es la **configuración de lectura**: la plantilla que genera el
bot (generada y desempaquetada para verificar hojas, fila de los días y celdas
de `_plantilla` antes de escribir esto — no se copió del ejemplo).

**Dos campos quedan deliberadamente vacíos** (el disparador de activación de
la base no los exige):

- `lectura_periodo`: está pensado para extraer el periodo de una frase con una
  expresión regular; el bot real compara por igualdad una celda oculta.
  Llenarlo sugeriría un mecanismo que no es el real.
- `version_indicador.ubicacion_total`: **limitación conocida del esquema**, no
  un descuido. La columna del total en la plantilla es `C + días_del_mes`: AH
  en un mes de 31, AG en uno de 30, AF en febrero. El esquema modela esta
  ubicación como un valor fijo por indicador, válido para un solo mes. Si
  alguien la completa con el valor de un mes, **fallará en los meses con
  menos días**, sin que sea evidente por qué. Se resolvería si el esquema
  calculara la columna a partir del periodo, o si el lector la ignorara y la
  recalculara; ninguna de las dos existe hoy.

**Idempotente**: cada fila se busca por su clave natural antes de crearla; si
ya existe, se deja como está. Esto significa que **corrida sin `--recargar`,
un error ya cargado no se corrige solo** (una etiqueta mal transcrita, por
ejemplo): hay que usar `--recargar`, que borra el catálogo de NUT-1 (nunca
toca las dimensiones globales `poblacion`/`servicio`/`comida`, ni sus
valores) y lo vuelve a escribir desde cero. Se niega a recargar (o a tocar
nada) si NUT-1 ya leyó un archivo aceptado: su configuración queda congelada
por un disparador de la base, y no hay vuelta atrás salvo crear otra versión.

No fija quién actúa (`app.usuario_id`): es un operador con acceso a la base,
igual que `asignar_clave` y `crear_usuario`.
"""

import argparse
import sys
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

CODIGO_FORMATO = "NUT"
CODIGO_VERSION = "NUT-1"

TRES_COMIDAS = ("desayuno", "almuerzo", "cena")
DOS_COMIDAS = ("desayuno", "almuerzo")
COMIDA_LABEL = {"desayuno": "Desayuno", "almuerzo": "Almuerzo", "cena": "Cena"}

# Misma estructura que servidor/bot-validador/src/areas/nutricion/definicion.js. Si esa
# definición cambia, esto se actualiza a mano: son dos lenguajes distintos, sin
# forma de compartir el dato sin tooling nuevo. La prueba de contrato con el
# bot real (marcada @pytest.mark.node) avisa si se desalinean.
CUADROS = (
    {
        "codigo": "f1", "numero": 1, "titulo": "Comensales · Hospitalización",
        "descripcion": "Raciones servidas al personal asistencial, administrativo y a los internos, en el servicio de hospitalización.",
        "hoja": "Comensales hospitalización", "poblacion": "comensal", "servicio": "hospitalizacion",
        "dimension_grupo": "grupo_comensal",
        "grupos": (
            ("asistencial", "Asistencial y administrativo", TRES_COMIDAS),
            ("int-medicina", "Internos de Medicina (UNAP)", TRES_COMIDAS),
            ("int-obstetricia", "Internos de Obstetricia (UNSM)", TRES_COMIDAS),
            ("int-nutricion", "Internos de Nutrición", DOS_COMIDAS),
            ("int-enfermeria", "Internos de Enfermería (UNSM)", TRES_COMIDAS),
        ),
    },
    {
        "codigo": "f2", "numero": 2, "titulo": "Comensales · Emergencia",
        "descripcion": "Raciones servidas al personal desde el servicio de emergencia.",
        "hoja": "Comensales emergencia", "poblacion": "comensal", "servicio": "emergencia",
        "dimension_grupo": "grupo_comensal",
        "grupos": (
            ("direccion", "Dirección General", DOS_COMIDAS),
            ("residuos", "Residuos Sólidos", DOS_COMIDAS),
            ("nutricion", "Dpto. de Nutrición y Dietética", TRES_COMIDAS),
        ),
    },
    {
        "codigo": "f3", "numero": 3, "titulo": "Pacientes · Hospitalización",
        "descripcion": "Raciones servidas a pacientes hospitalizados, por tipo de dieta.",
        "hoja": "Pacientes hospitalización", "poblacion": "paciente", "servicio": "hospitalizacion",
        "dimension_grupo": "tipo_dieta",
        "grupos": (
            ("completa", "Dieta completa", TRES_COMIDAS),
            ("blanda", "Dieta blanda", TRES_COMIDAS),
            ("licuada", "Dieta licuada", TRES_COMIDAS),
            ("liquida", "Dieta líquida", TRES_COMIDAS),
        ),
    },
    {
        "codigo": "f4", "numero": 4, "titulo": "Pacientes · Emergencia",
        "descripcion": "Raciones servidas a pacientes en emergencia. El oficio solo registra pacientes SIS.",
        "hoja": "Pacientes emergencia", "poblacion": "paciente", "servicio": "emergencia",
        "dimension_grupo": "financiador",
        "grupos": (("sis", "Pacientes SIS", TRES_COMIDAS),),
    },
)

# Las dos dimensiones que no siembra 04_semilla.sql (financiador sí existe,
# pero sin valores: «se agregan cuando se confirmen», dice su comentario).
DIMENSIONES_NUEVAS = (
    ("grupo_comensal", "Grupo de comensales", "A qué grupo de personal o de internos corresponde la ración, dentro de los comensales."),
    ("tipo_dieta", "Tipo de dieta", "Régimen dietético que recibe el paciente."),
)

# Criterios de reconocimiento: describen la hoja oculta `_plantilla` de la
# plantilla real (confirmado desempaquetando el .xlsx que genera el bot), con
# una expresión regular por celda. La del periodo solo comprueba que tenga
# forma de periodo (AAAA-MM): cuál es exactamente lo decide el bot comparando
# con el periodo del reporte abierto, no esta base.
CRITERIOS_RECONOCIMIENTO = (
    ("celda_texto", "_plantilla", "B1", r"^nutricion$", "El área, en la hoja oculta de la plantilla."),
    ("celda_texto", "_plantilla", "B2", r"^\d{4}-(0[1-9]|1[0-2])$", "El periodo, con forma AAAA-MM."),
    ("celda_texto", "_plantilla", "B3", rf"^{CODIGO_VERSION}$", "La versión de la plantilla."),
)


class NoSePuede(Exception):
    """El formato o la versión no existen, faltan dimensiones que debería traer
    `04_semilla.sql`, o la configuración de NUT-1 ya está congelada."""


def _indicadores_de(cuadro: dict):
    for grupo_clave, grupo_label, comidas in cuadro["grupos"]:
        for comida in comidas:
            yield {
                "codigo": f"{cuadro['codigo']}.{grupo_clave}.{comida}",
                "nombre": f"{grupo_label} · {COMIDA_LABEL[comida]}",
                "grupo_clave": grupo_clave,
                "grupo_label": grupo_label,
                "comida": comida,
                "comida_label": COMIDA_LABEL[comida],
            }


def _valores_de_grupo(dimension_codigo: str):
    """(clave, etiqueta) únicas, en el orden en que aparecen los cuadros que usan
    esa dimensión. `grupo_comensal` la comparten f1 y f2; por eso se recorre por
    dimensión y no por cuadro."""
    vistos: dict[str, str] = {}
    for cu in CUADROS:
        if cu["dimension_grupo"] != dimension_codigo:
            continue
        for grupo_clave, grupo_label, _ in cu["grupos"]:
            vistos.setdefault(grupo_clave, grupo_label)
    return list(vistos.items())


def _dimension(bd: Session, codigo: str) -> Dimension:
    d = bd.scalar(select(Dimension).where(Dimension.codigo == codigo, vigente(Dimension)))
    if d is None:
        raise NoSePuede(f"Falta la dimensión «{codigo}»: ¿se instaló 04_semilla.sql?")
    return d


def _valor_de_dimension(bd: Session, dimension_id: int, codigo_dimension: str, codigo_valor: str) -> DimensionValor:
    v = bd.scalar(select(DimensionValor).where(DimensionValor.dimension_id == dimension_id, DimensionValor.codigo == codigo_valor, vigente(DimensionValor)))
    if v is None:
        raise NoSePuede(f"Falta el valor «{codigo_valor}» de la dimensión «{codigo_dimension}»: ¿se instaló 04_semilla.sql?")
    return v


def _tiene_carga_aceptada(bd: Session, version_id: int) -> bool:
    return bd.scalar(select(Carga.id).where(Carga.formato_version_id == version_id, Carga.resultado == "aceptada", vigente(Carga))) is not None


def _borrar_catalogo(bd: Session, formato_id: int, version_id: int) -> None:
    """Deshace lo que esta herramienta pudo haber creado, de hijos a padres. Nunca
    toca `poblacion`/`servicio`/`comida` ni sus valores (no los creó ella)."""
    ids_indicador = bd.scalars(select(Indicador.id).where(Indicador.formato_id == formato_id)).all()
    bd.execute(delete(VersionIndicador).where(VersionIndicador.formato_version_id == version_id))
    bd.execute(delete(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version_id))
    if ids_indicador:
        bd.execute(delete(IndicadorDimension).where(IndicadorDimension.indicador_id.in_(ids_indicador)))
    bd.execute(delete(Indicador).where(Indicador.formato_id == formato_id))
    bd.execute(delete(Cuadro).where(Cuadro.formato_version_id == version_id))

    ids_dimension_nueva = bd.scalars(select(Dimension.id).where(Dimension.codigo.in_(codigo for codigo, _, _ in DIMENSIONES_NUEVAS))).all()
    if ids_dimension_nueva:
        bd.execute(delete(DimensionValor).where(DimensionValor.dimension_id.in_(ids_dimension_nueva)))
    financiador = bd.scalar(select(Dimension.id).where(Dimension.codigo == "financiador"))
    if financiador is not None:
        bd.execute(delete(DimensionValor).where(DimensionValor.dimension_id == financiador, DimensionValor.codigo == "sis"))
    bd.execute(delete(Dimension).where(Dimension.codigo.in_(codigo for codigo, _, _ in DIMENSIONES_NUEVAS)))
    bd.flush()


def cargar_catalogo(bd: Session, *, recargar: bool = False) -> str:
    """Deja NUT-1 con su catálogo real y activa. No confirma: quien llama hace
    `commit()`."""
    formato = bd.scalar(select(Formato).where(Formato.codigo == CODIGO_FORMATO, vigente(Formato)))
    if formato is None:
        raise NoSePuede(f"No existe el formato «{CODIGO_FORMATO}».")
    version = bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato.id, FormatoVersion.codigo_version == CODIGO_VERSION, vigente(FormatoVersion)))
    if version is None:
        raise NoSePuede(f"No existe la versión «{CODIGO_VERSION}» de «{CODIGO_FORMATO}».")

    congelada = _tiene_carga_aceptada(bd, version.id)
    if recargar and congelada:
        raise NoSePuede(f"«{CODIGO_VERSION}» ya leyó un archivo aceptado: su configuración está congelada. Cree una versión nueva en vez de recargar esta.")

    if recargar:
        _borrar_catalogo(bd, formato.id, version.id)
        version.estado = "en_configuracion"
        version.tipo_archivo = None
        bd.flush()
    elif version.estado == "activa":
        return f"«{CODIGO_VERSION}» ya está activa. Nada que hacer (use --recargar para rehacerla)."

    dimension_id = {codigo: _dimension(bd, codigo).id for codigo in ("poblacion", "servicio", "comida", "financiador")}
    for codigo, nombre, descripcion in DIMENSIONES_NUEVAS:
        d = bd.scalar(select(Dimension).where(Dimension.codigo == codigo, vigente(Dimension)))
        if d is None:
            d = Dimension(codigo=codigo, nombre=nombre, descripcion=descripcion)
            bd.add(d)
            bd.flush()
        dimension_id[codigo] = d.id

    valor_id: dict[tuple[str, str], int] = {}
    for dimension_codigo in ("grupo_comensal", "tipo_dieta"):
        for orden, (clave, etiqueta) in enumerate(_valores_de_grupo(dimension_codigo), start=1):
            v = bd.scalar(select(DimensionValor).where(DimensionValor.dimension_id == dimension_id[dimension_codigo], DimensionValor.codigo == clave, vigente(DimensionValor)))
            if v is None:
                v = DimensionValor(dimension_id=dimension_id[dimension_codigo], codigo=clave, nombre=etiqueta, orden=orden)
                bd.add(v)
                bd.flush()
            valor_id[(dimension_codigo, clave)] = v.id

    v = bd.scalar(select(DimensionValor).where(DimensionValor.dimension_id == dimension_id["financiador"], DimensionValor.codigo == "sis", vigente(DimensionValor)))
    if v is None:
        v = DimensionValor(dimension_id=dimension_id["financiador"], codigo="sis", nombre="SIS", orden=1)
        bd.add(v)
        bd.flush()
    valor_id[("financiador", "sis")] = v.id

    for dimension_codigo, codigo_valor in (
        ("poblacion", "comensal"), ("poblacion", "paciente"),
        ("servicio", "hospitalizacion"), ("servicio", "emergencia"),
        ("comida", "desayuno"), ("comida", "almuerzo"), ("comida", "cena"),
    ):
        valor_id[(dimension_codigo, codigo_valor)] = _valor_de_dimension(bd, dimension_id[dimension_codigo], dimension_codigo, codigo_valor).id

    for orden_cuadro, cu in enumerate(CUADROS, start=1):
        cuadro = bd.scalar(select(Cuadro).where(Cuadro.formato_version_id == version.id, Cuadro.codigo == cu["codigo"], vigente(Cuadro)))
        if cuadro is None:
            cuadro = Cuadro(
                formato_version_id=version.id, codigo=cu["codigo"], numero=cu["numero"], titulo=cu["titulo"], descripcion=cu["descripcion"],
                hoja=cu["hoja"], es_hoja_patron=False,
                ubicacion={"orientacion": "horizontal", "fila_dias": 4, "columna_primer_dia": "C"},
                orden=orden_cuadro,
            )
            bd.add(cuadro)
            bd.flush()

        for orden_indicador, ind in enumerate(_indicadores_de(cu), start=1):
            indicador = bd.scalar(select(Indicador).where(Indicador.formato_id == formato.id, Indicador.codigo == ind["codigo"], vigente(Indicador)))
            if indicador is None:
                indicador = Indicador(
                    formato_id=formato.id, codigo=ind["codigo"], nombre=ind["nombre"],
                    tipo_dato="entero", unidad_medida="raciones", valor_minimo=Decimal("0"), es_obligatorio=True,
                )
                bd.add(indicador)
                bd.flush()
                for dimension_codigo, codigo_valor in (
                    ("poblacion", cu["poblacion"]), ("servicio", cu["servicio"]),
                    ("comida", ind["comida"]), (cu["dimension_grupo"], ind["grupo_clave"]),
                ):
                    bd.add(IndicadorDimension(indicador_id=indicador.id, dimension_id=dimension_id[dimension_codigo], dimension_valor_id=valor_id[(dimension_codigo, codigo_valor)]))
                bd.flush()

            existente = bd.scalar(select(VersionIndicador).where(VersionIndicador.formato_version_id == version.id, VersionIndicador.indicador_id == indicador.id, vigente(VersionIndicador)))
            if existente is None:
                bd.add(VersionIndicador(
                    formato_version_id=version.id, cuadro_id=cuadro.id, indicador_id=indicador.id, orden=orden_indicador,
                    etiqueta=ind["nombre"], metodo_lectura="etiqueta",
                    ubicacion={"etiquetas": [ind["grupo_label"], ind["comida_label"]], "columnas": ["A", "B"], "arrastrar_vacias": True},
                ))
                bd.flush()

    for tipo, hoja, celda, texto_esperado, descripcion in CRITERIOS_RECONOCIMIENTO:
        existente = bd.scalar(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == version.id, CriterioReconocimiento.hoja == hoja, CriterioReconocimiento.celda == celda, vigente(CriterioReconocimiento)))
        if existente is None:
            bd.add(CriterioReconocimiento(formato_version_id=version.id, tipo=tipo, hoja=hoja, celda=celda, texto_esperado=texto_esperado, es_obligatorio=True, descripcion=descripcion))
            bd.flush()

    version.tipo_archivo = "xlsx"
    version.estado = "activa"
    bd.flush()
    total_indicadores = sum(1 for cu in CUADROS for _ in _indicadores_de(cu))
    return f"«{CODIGO_VERSION}» activada: {len(CUADROS)} cuadros, {total_indicadores} indicadores."


def _destino(url: str) -> str:
    from sqlalchemy.engine import make_url

    u = make_url(url)
    return f"{u.host}:{u.port or 5432}/{u.database}"


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m app.herramientas.cargar_catalogo_nutricion",
        description="Carga el catálogo real de Nutrición (NUT-1: 4 cuadros, 36 indicadores) y la activa, en DATABASE_URL.",
    )
    parser.add_argument("--recargar", action="store_true", help="Borra el catálogo de NUT-1 (si no está congelado) y lo vuelve a escribir desde cero.")
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
