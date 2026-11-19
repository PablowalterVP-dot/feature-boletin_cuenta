"""Ficha 14 (MINSA 2026): personas con diagnóstico de un cáncer prevalente que
inician tratamiento oncológico en 37 días o menos.

Estas reglas no se escribieron aquí: vienen del proyecto donde se validaron
contra el reporte oficial de MINSA de enero a julio de 2026 (6/75, igual mes a
mes). Aquí se juntan en un solo archivo y se conserva la lógica tal cual: al
traerlas se compararon las dos versiones sobre los datos del hospital y dieron
lo mismo en cada paciente. Las fuentes de verdad son el script SQL oficial de
OGEI/MINSA (`14_ID_Cancer_Ttov3.sql`) y la ficha técnica del Anexo I.

Las decisiones de interpretación que no son evidentes:

- **El plazo se cuenta desde el diagnóstico**, también para la exclusión por
  fallecimiento. La ficha dice «37 días de iniciar el tratamiento»; el script
  ancla a la fecha del diagnóstico, y se sigue al script.
- **El tratamiento exige `Valor_Lab = '1'`** además del código y del tipo de
  diagnóstico. La ficha no lo dice; el script sí lo ejecuta.
- **El paliativo se reconoce con `Valor_Lab = '1'`**, no con el `'2'` del
  script: en los datos del hospital, 767 de 767 registros del código 99489
  traen `'1'` y ninguno `'2'`. Es la única regla que se aparta del script.
- **La exclusión por paliativo es de la persona, no del tipo de cáncer**: quien
  la tiene sale de todos los tipos en que fue diagnosticada.
- **El «primer diagnóstico» se elige por persona, tipo y año**: un diagnóstico
  de un año anterior no impide contar el de este.
- **El sexo y la edad se miran en la fila de la confirmación**, no en la del
  diagnóstico.

Este módulo no lee la base ni un archivo: recibe las atenciones de una persona
ya reunidas y devuelve qué le corresponde.
"""

from dataclasses import dataclass
from datetime import date, timedelta

# Como está en el catálogo `desempeno.ficha`.
NUMERO = 14

# Cambia cuando cambia una regla o lo que se guarda de cada caso: cada cálculo
# guardado dice con cuál se hizo, y uno de otra versión se vuelve a hacer.
# 2: se anota qué registro de tratamiento quedó fuera por un error de registro.
VERSION = "2"


def _rango(prefijo: str) -> frozenset[str]:
    return frozenset(f"{prefijo}{digito}" for digito in range(10))


def _rangos(*prefijos: str) -> frozenset[str]:
    return frozenset().union(*(_rango(p) for p in prefijos))


@dataclass(frozen=True)
class TipoDeCancer:
    """Qué códigos lo diagnostican, cuáles lo confirman y a quién aplica."""

    cie10: frozenset[str]
    confirmacion: frozenset[str]
    sexo: str | None = None
    edad_minima: int | None = None


TIPOS_CANCER: dict[str, TipoDeCancer] = {
    "CUELLO_UTERINO": TipoDeCancer(_rango("C53"), frozenset({"57500", "58100"}), sexo="F", edad_minima=18),
    "MAMA": TipoDeCancer(_rango("C50"), frozenset({"19100", "19101", "19102"}), sexo="F", edad_minima=18),
    "PROSTATA": TipoDeCancer(frozenset({"C61X"}), frozenset({"55700", "55705", "55706"}), sexo="M", edad_minima=18),
    "COLON_RECTO": TipoDeCancer(
        _rango("C18") | {"C19X", "C20X"}, frozenset({"44388", "44389", "45359", "45358"}), edad_minima=18
    ),
    "ESTOMAGO": TipoDeCancer(_rango("C16"), frozenset({"43234", "43600"}), edad_minima=18),
    "PIEL": TipoDeCancer(_rangos("C43", "C44"), frozenset({"11100", "11101"}), edad_minima=18),
    "PULMON": TipoDeCancer(_rango("C34"), frozenset({"32405", "32400"}), edad_minima=18),
    "HIGADO": TipoDeCancer(_rango("C22"), frozenset({"47000", "47001", "47100"}), edad_minima=18),
    "LINFOMA": TipoDeCancer(_rangos("C81", "C82", "C83", "C84", "C85"), frozenset({"38500", "88206"})),
    "LEUCEMIA": TipoDeCancer(
        _rangos("C91", "C92", "C93", "C94", "C95") | {"C901"},
        frozenset(
            {"85095", "38220", "85102", "88204", "88204.01", "88182.01", "88185.02", "88185.03", "88205.04", "85060"}
        ),
    ),
}

NOMBRES_DE_TIPO = {
    "CUELLO_UTERINO": "Cuello uterino",
    "MAMA": "Mama",
    "PROSTATA": "Próstata",
    "COLON_RECTO": "Colon y recto",
    "ESTOMAGO": "Estómago",
    "PIEL": "Piel",
    "PULMON": "Pulmón",
    "HIGADO": "Hígado",
    "LINFOMA": "Linfoma",
    "LEUCEMIA": "Leucemia",
}

# Un solo conjunto de tratamientos para los diez tipos: lo que dice de qué
# cáncer es el tratamiento es el diagnóstico repetido que lo acompaña en la cita.
CODIGOS_QUIMIOTERAPIA = frozenset(
    {
        "96402", "96407", "96409", "96410", "96411", "96412", "96413", "96414", "96415", "96416",
        "96417", "96420", "96421", "96422", "96423", "96549", "90780", "90782", "90784",
    }
)  # fmt: skip
CODIGOS_RADIOTERAPIA = frozenset(
    {
        "77305", "77500", "77295", "77301", "77315", "77315.01", "77401", "77290", "76499", "77263",
        "77418", "77418.01", "77285", "77427", "77504",
    }
)  # fmt: skip
CODIGOS_BRAQUITERAPIA = frozenset(
    {
        "77501", "77781", "77784", "77501.01", "77501.02", "77501.03", "77781.01", "77781.02",
        "77781.03", "77782", "77783", "77784.01", "77785", "77786", "77787",
    }
)  # fmt: skip
CODIGOS_QUIRURGICO = frozenset({"99024"})
CODIGOS_TRATAMIENTO = CODIGOS_QUIMIOTERAPIA | CODIGOS_RADIOTERAPIA | CODIGOS_BRAQUITERAPIA | CODIGOS_QUIRURGICO

CODIGO_PALIATIVO = "99489"

DEFINITIVO = "D"
REPETIDO = "R"
LAB_CONFIRMACION = "A"
LAB_TRATAMIENTO = "1"
LAB_PALIATIVO = "1"
EDAD_EN_ANIOS = "A"

PLAZO_DIAS = 37

CIE10_DE_CANCER = frozenset().union(*(t.cie10 for t in TIPOS_CANCER.values()))

# Todo código que alguna regla mira. Quien lee las atenciones filtra por aquí:
# de cientos de miles de filas, a la ficha le importan unos miles.
CODIGOS_QUE_SE_MIRAN = (
    CIE10_DE_CANCER
    | frozenset().union(*(t.confirmacion for t in TIPOS_CANCER.values()))
    | CODIGOS_TRATAMIENTO
    | {CODIGO_PALIATIVO}
)

MOTIVO_FALLECIO = "fallecio_en_plazo"
MOTIVO_PALIATIVO = "primer_tratamiento_paliativo"
MOTIVOS_DE_EXCLUSION = {
    MOTIVO_FALLECIO: "Falleció dentro de los 37 días del diagnóstico",
    MOTIVO_PALIATIVO: "Su primer tratamiento fue paliativo",
}

# Por qué un tratamiento dentro del plazo no suma. No son reglas nuevas: es lo
# que le falta a ese registro para cumplir las de arriba, para que se pueda
# corregir en el HIS mientras el mes siga abierto.
CORREGIR_SIN_REPETIDO = "sin_diagnostico_repetido"
CORREGIR_NO_DEFINITIVO = "tratamiento_no_definitivo"
CORREGIR_VALOR_LAB = "tratamiento_sin_valor_lab"
MOTIVOS_POR_CORREGIR = {
    CORREGIR_SIN_REPETIDO: "El tratamiento se registró sin el diagnóstico de cáncer repetido (R) en la misma cita.",
    CORREGIR_NO_DEFINITIVO: "El código de tratamiento no tiene tipo de diagnóstico definitivo (D).",
    CORREGIR_VALOR_LAB: "El código de tratamiento no tiene «1» en Valor_Lab.",
}

# El seguimiento de un caso que todavía puede sumar. Lo anota Estadística; no
# cambia el indicador: la siguiente carga del HIS lo confirma o no.
SEGUIMIENTO_SIN_REVISAR = "Sin revisar"
SEGUIMIENTO_PLAZO_VIGENTE = (
    SEGUIMIENTO_SIN_REVISAR,
    "En gestión con el servicio",
    "Tratado, falta registrar en el HIS",
    "No corresponde (falleció u otra IPRESS)",
)
SEGUIMIENTO_POR_CORREGIR = (SEGUIMIENTO_SIN_REVISAR, "Corrección solicitada", "Corregido en el HIS")
# Los que esperan que la próxima carga los confirme, y los que ya no cuentan.
SEGUIMIENTO_POR_CONFIRMAR = frozenset({"Tratado, falta registrar en el HIS", "Corregido en el HIS"})
SEGUIMIENTO_NO_CORRESPONDE = frozenset({"No corresponde (falleció u otra IPRESS)"})
# Lo anota el sistema, no una persona: la carga confirmó que el caso ya suma.
SEGUIMIENTO_CONFIRMADO = "Confirmado por la carga"

# El logro esperado depende del grupo del establecimiento según qué
# tratamientos ofrece (Nota 7 de la ficha). El hospital es del grupo B.
LOGRO_ESPERADO_POR_GRUPO = {"A": 80.0, "B": 70.0, "C": 60.0, "D": 40.0}
GRUPO_DEL_HOSPITAL = "B"

# Lo que el tablero muestra en «Cómo leer este indicador». Sale de la ficha
# técnica; lo que depende de los datos (la validación contra MINSA, cuántos
# casos hay por mes) no va aquí: se calcula.
FICHA_TECNICA = {
    "que_mide": "Porcentaje de personas con diagnóstico de cánceres prevalentes que inician tratamiento oncológico (quimioterapia, radioterapia, braquiterapia o quirúrgico) en 37 días o menos.",
    "numerador": "Pacientes que inician tratamiento (código CPMS) entre 0 y 37 días después del diagnóstico definitivo.",
    "denominador": "Pacientes con primer diagnóstico definitivo de alguno de los 10 cánceres prevalentes en el periodo.",
    "exclusiones": "Fallecidos dentro de los 37 días del diagnóstico (SINADEF) y pacientes cuyo primer tratamiento es paliativo.",
    "meta": "70 %: logro esperado del Grupo B, donde el anexo de la ficha ubica al hospital. Grupo A 80 %, C 60 %, D 40 %.",
    "cumplimiento": "Logro ÷ meta: la ficha no usa valor umbral.",
    "frecuencia": "Anual: el resultado oficial es el acumulado del año. El mes a mes es seguimiento interno.",
    "responsable": "DPCAN, MINSA.",
    "limitaciones": [
        "El HIS del hospital no muestra tratamientos hechos en otras instituciones: un paciente tratado fuera cuenta como no tratado.",
        "El reporte de SINADEF del hospital no incluye defunciones certificadas fuera de él; esas se verifican a mano en SINADEF nacional.",
        "Con pocos casos por mes, el porcentaje mensual cambia mucho: mire los casos y el acumulado.",
        "Un mes preliminar puede cambiar hasta el cierre de la corrección del HIS (día 21 del mes siguiente).",
    ],
    "preguntas": [
        "¿Qué pacientes del mes abierto siguen sin tratamiento y cuántos días les quedan?",
        "¿Los casos sin tratamiento tienen el código registrado en el HIS o se atendieron sin registrar?",
        "¿Algún paciente se trató o falleció fuera del hospital?",
        "¿El acumulado se acerca a la meta o se aleja?",
    ],
}


@dataclass(frozen=True)
class Atencion:
    """Una fila del HIS con lo que la ficha mira. De quién es no va aquí: quien
    llama entrega juntas las de una misma persona."""

    id_cita: str
    fecha_atencion: date
    codigo_item: str
    tipo_diagnostico: str
    valor_lab: str
    genero: str
    edad: int | None
    tipo_edad: str
    fecha_registro: date | None = None


@dataclass(frozen=True)
class PorCorregir:
    """El primer registro de tratamiento dentro del plazo que no suma, y por qué."""

    fecha_atencion: date
    motivo: str


@dataclass(frozen=True)
class Caso:
    """Una persona en un tipo de cáncer: su primer diagnóstico confirmado del
    año y qué pasó después. Quien quedó fuera del denominador también sale, con
    su motivo, para que la lista de pacientes pueda explicarlo."""

    tipo_cancer: str
    fecha_diagnostico: date
    en_denominador: bool
    en_numerador: bool
    fecha_tratamiento: date | None = None
    motivo_exclusion: str | None = None
    por_corregir: PorCorregir | None = None


def dentro_del_plazo(fecha_diagnostico: date, fecha: date) -> bool:
    """Entre el día del diagnóstico y 37 días después, los dos incluidos."""
    return 0 <= (fecha - fecha_diagnostico).days <= PLAZO_DIAS


def motivo_de_exclusion(
    fecha_diagnostico: date, fecha_defuncion: date | None, primer_tratamiento_paliativo: bool
) -> str | None:
    """Por qué un diagnóstico confirmado no entra al denominador; `None` si entra."""
    if fecha_defuncion is not None and dentro_del_plazo(fecha_diagnostico, fecha_defuncion):
        return MOTIVO_FALLECIO
    if primer_tratamiento_paliativo:
        return MOTIVO_PALIATIVO
    return None


def plazo_abierto(caso: Caso, fin_observacion: date) -> bool:
    """Está en el denominador sin tratamiento, pero sus 37 días aún no terminan
    dentro de lo observado: todavía puede cumplir, o fallecer y salir. Su cifra
    no es definitiva y hay que decirlo."""
    vence = caso.fecha_diagnostico + timedelta(days=PLAZO_DIAS)
    return caso.en_denominador and not caso.en_numerador and vence > fin_observacion


def cumplimiento(numerador: int, denominador: int, grupo: str = GRUPO_DEL_HOSPITAL) -> float | None:
    """Logro alcanzado sobre logro esperado, como lo escribe la ficha: esta no
    resta un valor umbral. `None` sin denominador: no se midió, que no es 0 %."""
    if denominador == 0:
        return None
    return (100 * numerador / denominador) / LOGRO_ESPERADO_POR_GRUPO[grupo]


def _por_cita(atenciones: list[Atencion]) -> dict[str, list[Atencion]]:
    por_cita: dict[str, list[Atencion]] = {}
    for a in atenciones:
        # Una fila sin cita no acompaña a ninguna otra.
        if a.id_cita:
            por_cita.setdefault(a.id_cita, []).append(a)
    return por_cita


def _tiene_confirmacion(filas_de_la_cita: list[Atencion], tipo: TipoDeCancer) -> bool:
    for a in filas_de_la_cita:
        if not (a.codigo_item in tipo.confirmacion and a.tipo_diagnostico == DEFINITIVO and a.valor_lab == LAB_CONFIRMACION):
            continue
        if tipo.sexo is not None and a.genero != tipo.sexo:
            continue
        if tipo.edad_minima is not None and (a.tipo_edad != EDAD_EN_ANIOS or a.edad is None or a.edad < tipo.edad_minima):
            continue
        return True
    return False


def _diagnosticos_confirmados(
    atenciones: list[Atencion], por_cita: dict[str, list[Atencion]], tipo: TipoDeCancer, anio: int
) -> list[date]:
    return [
        a.fecha_atencion
        for a in atenciones
        if a.fecha_atencion.year == anio
        and a.codigo_item in tipo.cie10
        and a.tipo_diagnostico == DEFINITIVO
        and a.valor_lab == ""
        and _tiene_confirmacion(por_cita.get(a.id_cita, []), tipo)
    ]


def _primer_tratamiento_fue_paliativo(por_cita: dict[str, list[Atencion]], primer_diagnostico: date) -> bool:
    """Una cita con el código paliativo y, en la misma cita, un diagnóstico
    repetido de cualquiera de los diez tipos, desde el primer diagnóstico de la
    persona en adelante."""
    for filas in por_cita.values():
        if not any(
            a.codigo_item == CODIGO_PALIATIVO and a.tipo_diagnostico == DEFINITIVO and a.valor_lab == LAB_PALIATIVO
            for a in filas
        ):
            continue
        if any(
            a.codigo_item in CIE10_DE_CANCER
            and a.tipo_diagnostico == REPETIDO
            and a.valor_lab == ""
            and a.fecha_atencion >= primer_diagnostico
            for a in filas
        ):
            return True
    return False


def _inicio_de_tratamiento(
    atenciones: list[Atencion], por_cita: dict[str, list[Atencion]], tipo: TipoDeCancer, fecha_diagnostico: date
) -> date | None:
    """El primer tratamiento dentro del plazo que vaya, en su cita, con un
    diagnóstico repetido de ese mismo tipo de cáncer."""
    fechas = [
        a.fecha_atencion
        for a in atenciones
        if a.codigo_item in CODIGOS_TRATAMIENTO
        and a.tipo_diagnostico == DEFINITIVO
        and a.valor_lab == LAB_TRATAMIENTO
        and dentro_del_plazo(fecha_diagnostico, a.fecha_atencion)
        and any(
            f.codigo_item in tipo.cie10 and f.tipo_diagnostico == REPETIDO and f.valor_lab == ""
            for f in por_cita.get(a.id_cita, [])
        )
    ]
    return min(fechas, default=None)


def _registro_por_corregir(
    atenciones: list[Atencion], por_cita: dict[str, list[Atencion]], tipo: TipoDeCancer, fecha_diagnostico: date
) -> PorCorregir | None:
    """Un tratamiento dentro del plazo que no suma por cómo se registró. Si su
    cita trae solo el diagnóstico de otro cáncer, es de ese otro y no se cuenta."""
    for a in sorted(atenciones, key=lambda x: x.fecha_atencion):
        if a.codigo_item not in CODIGOS_TRATAMIENTO or not dentro_del_plazo(fecha_diagnostico, a.fecha_atencion):
            continue
        filas = por_cita.get(a.id_cita, [])
        repetido = any(f.codigo_item in tipo.cie10 and f.tipo_diagnostico == REPETIDO and f.valor_lab == "" for f in filas)
        de_este = any(f.codigo_item in tipo.cie10 for f in filas)
        de_otro = any(f.codigo_item in CIE10_DE_CANCER and f.codigo_item not in tipo.cie10 for f in filas)
        if de_otro and not de_este:
            continue
        if not repetido:
            return PorCorregir(a.fecha_atencion, CORREGIR_SIN_REPETIDO)
        if a.tipo_diagnostico != DEFINITIVO:
            return PorCorregir(a.fecha_atencion, CORREGIR_NO_DEFINITIVO)
        if a.valor_lab != LAB_TRATAMIENTO:
            return PorCorregir(a.fecha_atencion, CORREGIR_VALOR_LAB)
    return None


def evaluar_paciente(
    atenciones: list[Atencion],
    *,
    anio: int,
    fecha_corte: date | None = None,
    fecha_fin_evaluacion: date | None = None,
    fecha_defuncion: date | None = None,
) -> list[Caso]:
    """Los casos de una persona en el año: uno por cada tipo de cáncer en que
    tuvo un diagnóstico confirmado.

    `fecha_corte` deja fuera lo atendido o digitado después: así se reproduce lo
    que MINSA podía ver el día que armó su reporte. Una fila sin fecha de
    registro se conserva: que falte la fecha no prueba que se digitó tarde.
    `fecha_fin_evaluacion` limita los diagnósticos que se cuentan, no el
    seguimiento: el tratamiento puede llegar después.
    """
    if fecha_corte is not None:
        atenciones = [
            a
            for a in atenciones
            if a.fecha_atencion <= fecha_corte and (a.fecha_registro is None or a.fecha_registro <= fecha_corte)
        ]
    por_cita = _por_cita(atenciones)

    primer_diagnostico: dict[str, date] = {}
    for clave, tipo in TIPOS_CANCER.items():
        fechas = [
            f
            for f in _diagnosticos_confirmados(atenciones, por_cita, tipo, anio)
            if fecha_fin_evaluacion is None or f <= fecha_fin_evaluacion
        ]
        if fechas:
            primer_diagnostico[clave] = min(fechas)
    if not primer_diagnostico:
        return []

    paliativo = _primer_tratamiento_fue_paliativo(por_cita, min(primer_diagnostico.values()))

    casos = []
    for clave, fecha_diagnostico in primer_diagnostico.items():
        motivo = motivo_de_exclusion(fecha_diagnostico, fecha_defuncion, paliativo)
        if motivo is not None:
            casos.append(Caso(clave, fecha_diagnostico, en_denominador=False, en_numerador=False, motivo_exclusion=motivo))
            continue
        tipo = TIPOS_CANCER[clave]
        fecha_tratamiento = _inicio_de_tratamiento(atenciones, por_cita, tipo, fecha_diagnostico)
        casos.append(
            Caso(
                clave,
                fecha_diagnostico,
                en_denominador=True,
                en_numerador=fecha_tratamiento is not None,
                fecha_tratamiento=fecha_tratamiento,
                por_corregir=None if fecha_tratamiento else _registro_por_corregir(atenciones, por_cita, tipo, fecha_diagnostico),
            )
        )
    return casos
