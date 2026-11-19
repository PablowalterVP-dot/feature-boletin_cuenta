"""Los indicadores de desempeño: reunir los datos de la base para las reglas.

Aquí se interpreta lo que `fuente` guarda en texto («40.0» es 40 años,
«2026-03-01 09:15:00» es el 1 de marzo) y se junta lo de cada persona. Qué
cuenta y qué no lo deciden `dominio/desempeno/`; de dónde sale, `datos/fuente`.
"""

import hashlib
from calendar import monthrange
from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.datos import fuente as datos
from app.datos.base import vigente
from app.datos.modelos import Corrida, DefuncionVerificada, Ficha, Fuente, LoteMes, ReferenciaMinsa, ResultadoMensual, ResultadoPaciente
from app.dominio.desempeno import defunciones as reglas_defuncion
from app.dominio.desempeno import ficha_14
from app.dominio.desempeno.defunciones import Defuncion, DefuncionSinFecha
from app.dominio.desempeno.ficha_14 import Atencion
from app.servicios import fuentes

# Tipo y número de documento, como identifica a la persona el script oficial.
Paciente = tuple[str, str]


def _texto(valor: str | None) -> str:
    return (valor or "").strip()


def _entero(valor: str | None) -> int | None:
    """El consolidado y los extractos mensuales no escriben igual los números:
    «40» y «40.0» son lo mismo."""
    texto = _texto(valor)
    return int(float(texto)) if texto else None


def _dia(valor: str | None) -> date | None:
    """El día de una fecha con hora del HIS («2026-03-01 09:15:00»)."""
    texto = _texto(valor)
    return date.fromisoformat(texto.split(" ", 1)[0]) if texto else None


def atencion_de(fila: datos.FilaHis) -> Atencion:
    return Atencion(
        id_cita=_texto(fila.id_cita),
        fecha_atencion=fila.fecha_atencion,
        codigo_item=_texto(fila.codigo_item),
        tipo_diagnostico=_texto(fila.tipo_diagnostico),
        valor_lab=_texto(fila.valor_lab),
        genero=_texto(fila.genero),
        edad=_entero(fila.edad_reg),
        tipo_edad=_texto(fila.tipo_edad),
        fecha_registro=_dia(fila.fecha_registro),
    )


def atenciones_de_la_ficha_14(bd: Session, anio: int) -> dict[Paciente, list[Atencion]]:
    """Las atenciones que la ficha mira, desde el 1 de enero del año, juntas por
    persona. Una fila sin número de documento no es de nadie y no entra."""
    por_paciente: dict[Paciente, list[Atencion]] = {}
    for fila in datos.atenciones_del_his(bd, codigos=ficha_14.CODIGOS_QUE_SE_MIRAN, desde=date(anio, 1, 1)):
        numero = _texto(fila.numero_documento)
        if not numero:
            continue
        # El tipo de documento es un código: «1» y «1.0» son el mismo.
        tipo = _texto(fila.tipo_documento).removesuffix(".0")
        por_paciente.setdefault((tipo, numero), []).append(atencion_de(fila))
    return por_paciente


@dataclass(frozen=True)
class Defunciones:
    """La fecha de defunción por DNI, y cuántas salieron de cada lugar."""

    fecha_por_documento: dict[str, date]
    de_certificados: int
    verificadas_a_mano: int


def defunciones(bd: Session, fecha_corte: date | None = None) -> Defunciones:
    """Las defunciones conocidas a la fecha de corte: los certificados del
    hospital que cuentan, más las verificadas a mano en SINADEF nacional."""
    de_certificados = []
    for c in datos.certificados_de_sinadef(bd):
        if not reglas_defuncion.certificado_cuenta(c.tipo_cdef, c.estado, c.tipo_documento):
            continue
        dni = reglas_defuncion.dni_de(c.numero_documento)
        if dni is None:
            continue
        if c.fecha_defuncion is None:
            raise DefuncionSinFecha(f"El certificado de la fila {c.fila_archivo} del reporte de SINADEF de {c.periodo} no tiene fecha de defunción.")
        de_certificados.append(Defuncion(dni, c.fecha_defuncion, c.fecha_registro))
    verificadas = [Defuncion(documento, fecha, registro) for documento, fecha, registro in datos.defunciones_verificadas(bd)]

    por_certificado = reglas_defuncion.fecha_por_documento(de_certificados, fecha_corte)
    por_verificacion = reglas_defuncion.fecha_por_documento(verificadas, fecha_corte)
    return Defunciones(
        fecha_por_documento=reglas_defuncion.fecha_por_documento(de_certificados + verificadas, fecha_corte),
        de_certificados=len(por_certificado),
        verificadas_a_mano=len(por_verificacion),
    )


# ------------------------------------------------------------------ el cálculo


class CalculoRechazado(Exception):
    """No se puede calcular con lo que hay. `motivos` va uno por línea."""

    def __init__(self, *motivos: str):
        self.motivos = tuple(motivos)
        super().__init__(" ".join(motivos))


@dataclass(frozen=True)
class MesCalculado:
    mes: int
    numerador: int
    denominador: int
    plazo_abierto: int


@dataclass
class Calculo:
    """Lo que dio una corrida. `corrida_id` existe aunque luego no se confirme:
    quien llama decide si guarda (`commit`) o era un ensayo (`rollback`)."""

    corrida_id: int
    anio: int
    mes_hasta: int
    fecha_corte: date | None
    mes_con_corte: int  # último mes calculado con el corte; 0 si no hubo corte
    fecha_fin_observacion: date
    meses: list[MesCalculado]
    excluidos: dict[str, int]
    casos: int
    avisos: list[str] = field(default_factory=list)

    @property
    def numerador(self) -> int:
        return sum(m.numerador for m in self.meses)

    @property
    def denominador(self) -> int:
        return sum(m.denominador for m in self.meses)

    @property
    def plazo_abierto(self) -> int:
        return sum(m.plazo_abierto for m in self.meses)


def _fin_de_mes(anio: int, mes: int) -> date:
    return date(anio, mes, monthrange(anio, mes)[1])


def _meses_cargados(bd: Session, codigo_de_fuente: str) -> dict[str, tuple]:
    fuente = bd.scalar(select(Fuente).where(Fuente.codigo == codigo_de_fuente, vigente(Fuente)))
    return fuentes.meses_vigentes(bd, fuente.id) if fuente is not None else {}


def _cubierto_desde_enero(cargados: dict[str, tuple], anio: int) -> int:
    """El último mes del año cargado sin huecos desde enero; 0 si falta enero.
    Tras un hueco no se sigue: un mes sin cargar no es un mes sin casos."""
    mes = 0
    while mes < 12 and f"{anio:04d}-{mes + 1:02d}" in cargados:
        mes += 1
    return mes


def huella_de_los_datos(bd: Session) -> str:
    """Identifica el conjunto de datos crudos que hay ahora: cambia si se carga o
    se reemplaza un mes de cualquier fuente, o si cambia una defunción
    verificada. Dos cálculos con la misma huella, el mismo corte y las mismas
    reglas dan lo mismo: no hace falta repetirlos."""
    v = DefuncionVerificada
    lotes = bd.scalars(select(LoteMes.id).where(LoteMes.es_vigente, vigente(LoteMes)).order_by(LoteMes.id)).all()
    verificadas = bd.execute(select(v.id, v.fecha_defuncion, v.fecha_registro).where(vigente(v)).order_by(v.id)).all()
    return hashlib.sha256(repr((lotes, [(i, str(defuncion), str(registro)) for i, defuncion, registro in verificadas])).encode()).hexdigest()


def _resumen_de(fallecidos: Defunciones) -> dict[str, int]:
    return {"conocidas": len(fallecidos.fecha_por_documento), "de_certificados": fallecidos.de_certificados, "verificadas_a_mano": fallecidos.verificadas_a_mano}


def _detalle_del_caso(caso: ficha_14.Caso, fecha_defuncion: date | None) -> dict:
    """Lo que explica el caso más allá de las columnas: con qué fecha de
    defunción salió, o qué registro de tratamiento no sumó y por qué."""
    detalle: dict = {}
    if caso.motivo_exclusion == ficha_14.MOTIVO_FALLECIO and fecha_defuncion is not None:
        detalle["fecha_defuncion"] = fecha_defuncion.isoformat()
    if caso.por_corregir is not None:
        detalle["por_corregir"] = {"fecha_atencion": caso.por_corregir.fecha_atencion.isoformat(), "motivo": caso.por_corregir.motivo}
    return detalle


def calcular_ficha_14(
    bd: Session,
    *,
    anio: int,
    mes_hasta: int | None = None,
    fecha_corte: date | None = None,
    usuario_id: int | None = None,
    observacion: str | None = None,
) -> Calculo:
    """Calcula la Ficha 14 de enero a `mes_hasta` (por omisión, el último mes
    cargado) y deja el resultado como una corrida nueva: nunca pisa una
    anterior. No confirma; quien llama lo hace.

    `fecha_corte` es la del reporte oficial de MINSA y vale para los meses que
    ese reporte cubre: los que ya habían terminado ese día. Esos se calculan
    solo con lo ocurrido y registrado hasta el corte, y así dan lo que MINSA
    publicó. Los meses siguientes aún no tienen reporte y se calculan al día,
    con todo lo cargado. Con el corte del 8 de agosto de 2026: enero a julio
    con corte, agosto en adelante al día.

    Nadie se cuenta dos veces: sin corte hay más filas, así que el primer
    diagnóstico de una persona solo puede ser el mismo o uno anterior; quien
    está en un mes con corte no reaparece en uno posterior.
    """
    his = _meses_cargados(bd, datos.FUENTE_HIS)
    ultimo_cargado = _cubierto_desde_enero(his, anio)
    if ultimo_cargado == 0:
        raise CalculoRechazado(f"No está cargado enero de {anio} del HIS MINSA. Lo cargado se ve con: python -m app.herramientas.ver_fuentes")
    if mes_hasta is None:
        mes_hasta = ultimo_cargado
    if mes_hasta > ultimo_cargado:
        raise CalculoRechazado(f"Se pidió hasta el mes {mes_hasta:02d} de {anio} y el HIS MINSA está cargado sin huecos solo hasta el {ultimo_cargado:02d}.")

    mes_con_corte = 0
    if fecha_corte is not None:
        mes_con_corte = min(max((m for m in range(1, 13) if _fin_de_mes(anio, m) <= fecha_corte), default=0), mes_hasta)
        if mes_con_corte == 0:
            raise CalculoRechazado(f"Con el corte del {fecha_corte:%d/%m/%Y} ningún mes de {anio} había terminado: no hay nada que calcular con él.")

    cubierto = _fin_de_mes(anio, ultimo_cargado)
    # Cada tramo: con qué corte, qué meses le tocan y hasta qué día se observa.
    tramos: list[tuple[date | None, range, date]] = []
    if mes_con_corte:
        tramos.append((fecha_corte, range(1, mes_con_corte + 1), min(cubierto, fecha_corte)))
    if mes_hasta > mes_con_corte:
        tramos.append((None, range(mes_con_corte + 1, mes_hasta + 1), cubierto))
    fin_observacion = tramos[-1][2]

    avisos = []
    sinadef = sorted(_meses_cargados(bd, datos.FUENTE_SINADEF))
    if not sinadef:
        avisos.append("No hay ningún reporte de SINADEF cargado: nadie sale del denominador por fallecimiento.")
    elif sinadef[-1] < f"{fin_observacion.year:04d}-{fin_observacion.month:02d}":
        avisos.append(f"SINADEF está cargado hasta {sinadef[-1]} y el HIS se observa hasta el {fin_observacion:%d/%m/%Y}: una defunción posterior no se conoce.")

    pacientes = atenciones_de_la_ficha_14(bd, anio)

    por_mes: dict[int, Counter[str]] = {mes: Counter() for mes in range(1, mes_hasta + 1)}
    excluidos: Counter[str] = Counter()
    filas_de_paciente = []
    defunciones_de = {}
    for corte, meses_del_tramo, observado_hasta in tramos:
        fallecidos = defunciones(bd, corte)
        defunciones_de["al_corte" if corte else "al_dia"] = _resumen_de(fallecidos)
        fin_evaluacion = _fin_de_mes(anio, meses_del_tramo[-1])
        for (tipo_documento, numero_documento), atenciones in pacientes.items():
            # Igual que el script oficial: la defunción se cruza solo por número.
            fecha_defuncion = fallecidos.fecha_por_documento.get(numero_documento)
            for caso in ficha_14.evaluar_paciente(
                atenciones, anio=anio, fecha_corte=corte, fecha_fin_evaluacion=fin_evaluacion, fecha_defuncion=fecha_defuncion
            ):
                if caso.fecha_diagnostico.month not in meses_del_tramo:
                    continue
                abierto = ficha_14.plazo_abierto(caso, observado_hasta)
                if caso.en_denominador:
                    por_mes[caso.fecha_diagnostico.month].update(denominador=1, numerador=int(caso.en_numerador), plazo_abierto=int(abierto))
                else:
                    excluidos[caso.motivo_exclusion] += 1
                filas_de_paciente.append({
                    "tipo_documento": tipo_documento or None,
                    "numero_documento": numero_documento,
                    "categoria": caso.tipo_cancer,
                    "fecha_referencia": caso.fecha_diagnostico,
                    "es_denominador": caso.en_denominador,
                    "es_numerador": caso.en_numerador,
                    "es_plazo_abierto": abierto,
                    "fecha_cumplimiento": caso.fecha_tratamiento,
                    "motivo_exclusion": caso.motivo_exclusion,
                    "detalle": _detalle_del_caso(caso, fecha_defuncion),
                })  # fmt: skip
    meses = [MesCalculado(mes, c["numerador"], c["denominador"], c["plazo_abierto"]) for mes, c in por_mes.items()]

    ficha = bd.scalar(select(Ficha).where(Ficha.numero == ficha_14.NUMERO, vigente(Ficha)))
    corrida = Corrida(
        ficha_id=ficha.id,
        anio=anio,
        mes_desde=1,
        mes_hasta=mes_hasta,
        fecha_corte=fecha_corte,
        fecha_fin_observacion=fin_observacion,
        version_calculo=ficha_14.VERSION,
        usuario_id=usuario_id,
        observacion=observacion,
        # Con qué se calculó: de una cifra se vuelve a los archivos que la dieron.
        detalle={
            "mes_con_corte": mes_con_corte,
            "huella_de_datos": huella_de_los_datos(bd),
            "his": [
                {"periodo": periodo, "lote": lote.id, "archivo": lote.nombre_archivo, "filas": mes.filas}
                for periodo, (mes, lote) in sorted(his.items())
                if periodo >= f"{anio:04d}-01"
            ],
            "sinadef": {"desde": sinadef[0], "hasta": sinadef[-1], "meses": len(sinadef)} if sinadef else None,
            "atenciones_leidas": sum(len(a) for a in pacientes.values()),
            "pacientes_leidos": len(pacientes),
            "defunciones": defunciones_de,
            "excluidos": dict(excluidos),
            "grupo": ficha_14.GRUPO_DEL_HOSPITAL,
            "logro_esperado": ficha_14.LOGRO_ESPERADO_POR_GRUPO[ficha_14.GRUPO_DEL_HOSPITAL],
            "avisos": avisos,
        },
    )
    bd.add(corrida)
    bd.flush()
    bd.execute(
        insert(ResultadoMensual),
        [{"corrida_id": corrida.id, "anio": anio, "mes": m.mes, "numerador": m.numerador, "denominador": m.denominador, "plazo_abierto": m.plazo_abierto} for m in meses],
    )
    if filas_de_paciente:
        bd.execute(insert(ResultadoPaciente), [{"corrida_id": corrida.id, **fila} for fila in filas_de_paciente])

    return Calculo(
        corrida_id=corrida.id,
        anio=anio,
        mes_hasta=mes_hasta,
        fecha_corte=fecha_corte,
        mes_con_corte=mes_con_corte,
        fecha_fin_observacion=fin_observacion,
        meses=meses,
        excluidos=dict(excluidos),
        casos=len(filas_de_paciente),
        avisos=avisos,
    )


# --------------------------------------------------------------- recalcular

# Las fichas que el sistema sabe calcular. Las demás están en el catálogo
# (`desempeno.ficha`) pero aún no tienen reglas.
CALCULOS = {ficha_14.NUMERO: calcular_ficha_14}
VERSIONES = {ficha_14.NUMERO: ficha_14.VERSION}


def corte_oficial(bd: Session, *, numero: int, anio: int) -> date | None:
    """La fecha de corte del último reporte de MINSA registrado de la ficha en
    ese año. Es la que fija los meses que ese reporte ya cubrió."""
    return bd.scalar(
        select(ReferenciaMinsa.fecha_corte)
        .join(Ficha, Ficha.id == ReferenciaMinsa.ficha_id)
        .where(Ficha.numero == numero, ReferenciaMinsa.anio == anio, ReferenciaMinsa.fecha_corte.is_not(None), vigente(ReferenciaMinsa))
        .order_by(ReferenciaMinsa.fecha_corte.desc())
        .limit(1)
    )


def corrida_al_dia(bd: Session, *, numero: int, anio: int, fecha_corte: date | None) -> int | None:
    """La corrida que ya refleja lo cargado, o `None` si hay que calcular: no hay
    ninguna con ese corte y esas reglas, o los datos cambiaron desde la última."""
    corrida = bd.execute(
        select(Corrida.id, Corrida.detalle)
        .join(Ficha, Ficha.id == Corrida.ficha_id)
        .where(Ficha.numero == numero, Corrida.anio == anio, Corrida.fecha_corte.is_not_distinct_from(fecha_corte), Corrida.version_calculo == VERSIONES[numero], vigente(Corrida))
        .order_by(Corrida.id.desc())
        .limit(1)
    ).first()
    if corrida is None or corrida.detalle.get("huella_de_datos") != huella_de_los_datos(bd):
        return None
    return corrida.id


def anios_con_enero(bd: Session) -> list[int]:
    """Los años que se pueden calcular: los que tienen enero del HIS cargado."""
    return sorted(int(p[:4]) for p in _meses_cargados(bd, datos.FUENTE_HIS) if p.endswith("-01"))


@dataclass(frozen=True)
class Recalculo:
    """Qué pasó con una ficha y un año: se calculó, ya estaba al día o no se pudo."""

    numero: int
    anio: int
    corrida_id: int | None
    calculo: Calculo | None = None
    motivo: str | None = None

    @property
    def al_dia(self) -> bool:
        return self.calculo is None and self.motivo is None


def recalcular(bd: Session, *, numero: int, anio: int, usuario_id: int | None, fecha_corte: date | None = None, observacion: str | None = None) -> Recalculo:
    """Calcula la ficha si los datos o el corte cambiaron desde la última corrida.
    Sin `fecha_corte`, usa la del último reporte de MINSA registrado. No confirma."""
    corte = fecha_corte if fecha_corte is not None else corte_oficial(bd, numero=numero, anio=anio)
    hecha = corrida_al_dia(bd, numero=numero, anio=anio, fecha_corte=corte)
    if hecha is not None:
        return Recalculo(numero, anio, hecha)
    try:
        calculo = CALCULOS[numero](bd, anio=anio, fecha_corte=corte, usuario_id=usuario_id, observacion=observacion)
    except (CalculoRechazado, DefuncionSinFecha) as e:
        return Recalculo(numero, anio, None, motivo=" ".join(getattr(e, "motivos", None) or (str(e),)))
    return Recalculo(numero, anio, calculo.corrida_id, calculo)


def recalcular_todo(bd: Session, *, usuario_id: int | None) -> list[Recalculo]:
    """Cada ficha con cálculo, en cada año que se puede calcular. Lo que ya está al
    día no se repite: es lo que se corre después de cada carga."""
    return [recalcular(bd, numero=numero, anio=anio, usuario_id=usuario_id) for numero in sorted(CALCULOS) for anio in anios_con_enero(bd)]
