"""El tablero de indicadores de desempeño: lo que muestra cada pantalla, armado
con lo que ya está calculado y cargado.

Nada de aquí calcula un indicador (eso lo hacen las corridas) ni escribe un
texto para la pantalla: devuelve las cifras y fechas con que la interfaz arma sus
frases. Así «1 de 34 fichas tiene resultado» o «8 casos aún pueden sumar antes
del 21/10» salen siempre de los datos del momento.

Siempre se muestra la última corrida de cada ficha y año: las anteriores quedan
en la base para comparar, pero no son el dato vigente.
"""

import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.fuente import FUENTE_HIS, FUENTE_SINADEF
from app.datos.modelos import (
    Corrida,
    DefuncionVerificada,
    DimensionDesempeno,
    Ficha,
    FichaFuente,
    Fuente,
    HisAtencion,
    LoteCarga,
    LoteMes,
    ReferenciaMinsa,
    SinadefDefuncion,
    ResultadoMensual,
    ResultadoPaciente,
    SeguimientoCaso,
    Usuario,
)
from app.dominio.desempeno import calendario, ficha_14
from app.dominio.desempeno import tablero as reglas
from app.dominio.reloj import ZONA
from app.servicios.desempeno import CALCULOS, anios_con_enero
from app.servicios.errores import NoEncontrado
from app.servicios.subida import CARGABLES

# Lo que cada ficha con cálculo necesita para leerse: su meta, su plazo y los
# textos de su ficha técnica. Una ficha nueva con cálculo se agrega aquí.
METAS = {ficha_14.NUMERO: ficha_14.LOGRO_ESPERADO_POR_GRUPO[ficha_14.GRUPO_DEL_HOSPITAL] / 100}
PLAZOS = {ficha_14.NUMERO: ficha_14.PLAZO_DIAS}
FICHAS_TECNICAS = {ficha_14.NUMERO: ficha_14.FICHA_TECNICA}
NOMBRES_DE_CATEGORIA = {ficha_14.NUMERO: ficha_14.NOMBRES_DE_TIPO}
SEGUIMIENTO = {
    ficha_14.NUMERO: {reglas.PLAZO_VIGENTE: ficha_14.SEGUIMIENTO_PLAZO_VIGENTE, reglas.POR_CORREGIR: ficha_14.SEGUIMIENTO_POR_CORREGIR},
}


class ValorInvalido(Exception):
    """Lo que se pidió guardar no cumple las reglas: se dice por qué."""


# ===================================================================== catálogo


@dataclass(frozen=True)
class FuenteDeFicha:
    codigo: str
    nombre: str
    periodicidad: str
    cargable: bool
    area_responsable: str | None


@dataclass
class FichaDelCatalogo:
    id: int
    numero: int
    clave: str
    nombre: str
    nombre_corto: str | None
    dimension: str | None
    aplica: bool
    motivo_no_aplica: str | None
    tiene_calculo: bool
    fuentes: list[FuenteDeFicha]
    datos: str  # completo · parcial · sin_fuente · no_aplica

    @property
    def faltan(self) -> list[str]:
        """Las fuentes que todavía no se pueden cargar."""
        return [f.nombre for f in self.fuentes if not f.cargable]


@dataclass(frozen=True)
class Dimension:
    codigo: str
    nombre: str
    orden: int
    es_oficial: bool


def dimensiones(bd: Session) -> list[Dimension]:
    d = DimensionDesempeno
    return [Dimension(x.codigo, x.nombre, x.orden, x.es_oficial) for x in bd.scalars(select(d).where(vigente(d)).order_by(d.orden))]


def _fuentes_por_ficha(bd: Session) -> dict[int, list[FuenteDeFicha]]:
    filas = bd.execute(
        select(FichaFuente.ficha_id, Fuente.codigo, Fuente.nombre, Fuente.periodicidad, Fuente.area_responsable)
        .join(Fuente, Fuente.id == FichaFuente.fuente_id)
        .where(vigente(FichaFuente), vigente(Fuente), Fuente.es_activo)
        .order_by(Fuente.id)
    ).all()
    por_ficha: dict[int, list[FuenteDeFicha]] = {}
    for ficha_id, codigo, nombre, periodicidad, area in filas:
        por_ficha.setdefault(ficha_id, []).append(FuenteDeFicha(codigo, nombre, periodicidad, codigo in CARGABLES, area))
    return por_ficha


def catalogo(bd: Session) -> list[FichaDelCatalogo]:
    fuentes = _fuentes_por_ficha(bd)
    filas = bd.execute(
        select(Ficha, DimensionDesempeno.codigo)
        .outerjoin(DimensionDesempeno, DimensionDesempeno.id == Ficha.dimension_id)
        .where(vigente(Ficha), Ficha.es_activo)
        .order_by(Ficha.numero)
    ).all()
    salida = []
    for f, dimension in filas:
        suyas = fuentes.get(f.id, [])
        datos = reglas.estado_de_datos(aplica=f.aplica_al_hospital, cargables=[x.cargable for x in suyas])
        salida.append(FichaDelCatalogo(f.id, f.numero, f.clave, f.nombre, f.nombre_corto, dimension, f.aplica_al_hospital, f.motivo_no_aplica, f.numero in CALCULOS, suyas, datos))
    return salida


def _ficha(bd: Session, numero: int) -> FichaDelCatalogo:
    for f in catalogo(bd):
        if f.numero == numero:
            return f
    raise NoEncontrado(f"No existe la ficha {numero}.")


# ======================================================================= cargas


@dataclass(frozen=True)
class CargaDelMes:
    lote_mes_id: int
    filas: int
    archivo: str
    huella: str
    fecha_extraccion: datetime | None
    cargado_el: datetime
    cargado_por: str | None


def _cargas_vigentes(bd: Session, codigos: list[str]) -> dict[str, dict[str, CargaDelMes]]:
    """La carga vigente de cada mes de esas fuentes: {código: {«AAAA-MM»: carga}}."""
    filas = bd.execute(
        select(Fuente.codigo, LoteMes.anio, LoteMes.mes, LoteMes.id, LoteMes.filas, LoteCarga.nombre_archivo, LoteCarga.huella_sha256, LoteCarga.fecha_extraccion, LoteMes.fecha_creacion, Usuario.nombre_usuario)
        .join(LoteCarga, LoteCarga.id == LoteMes.lote_carga_id)
        .join(Fuente, Fuente.id == LoteMes.fuente_id)
        .outerjoin(Usuario, Usuario.id == LoteCarga.usuario_carga_id)
        .where(Fuente.codigo.in_(codigos), LoteMes.es_vigente, vigente(LoteMes), vigente(LoteCarga))
    ).all()
    salida: dict[str, dict[str, CargaDelMes]] = {c: {} for c in codigos}
    for codigo, anio, mes, lote_mes_id, filas_, archivo, huella, extraccion, creado, usuario in filas:
        salida[codigo][f"{anio:04d}-{mes:02d}"] = CargaDelMes(lote_mes_id, filas_, archivo, huella, extraccion, creado, usuario)
    return salida


def _estado_de_carga(anio: int, mes: int, carga: CargaDelMes | None, hoy: date) -> str:
    extraccion = carga.fecha_extraccion.date() if carga and carga.fecha_extraccion else None
    return calendario.estado_de_carga(anio, mes, cargado=carga is not None, extraccion=extraccion, hoy=hoy)


def _dia_de_descarga(carga: CargaDelMes) -> date | None:
    return carga.fecha_extraccion.astimezone(ZONA).date() if carga.fecha_extraccion else None


def _del_anio(cargas: dict[str, CargaDelMes], anio: int) -> dict[int, CargaDelMes]:
    return {int(p[5:]): c for p, c in cargas.items() if p.startswith(f"{anio:04d}-")}


def _datos_hasta(cargas: dict[str, dict[str, CargaDelMes]], anio: int) -> date | None:
    """Hasta qué día hay datos seguidos desde enero en **todas** esas fuentes: la
    que menos cubre manda. `None` si no hay fuentes que mirar."""
    return min(
        (calendario.datos_hasta(anio, {mes: _dia_de_descarga(c) for mes, c in _del_anio(de_la_fuente, anio).items()}) for de_la_fuente in cargas.values()),
        default=None,
    )


def anios_disponibles(bd: Session) -> list[int]:
    """Los años con algo que mostrar: los que ya tienen un cálculo o los que se
    pueden calcular (con enero del HIS cargado). Un diciembre cargado como margen
    del año siguiente no hace disponible a su año."""
    con_corrida = bd.scalars(select(Corrida.anio).distinct().where(vigente(Corrida))).all()
    return sorted(set(con_corrida) | set(anios_con_enero(bd)))


# ==================================================================== resultado


@dataclass(frozen=True)
class Cifra:
    numerador: int
    denominador: int

    @property
    def porcentaje(self) -> float | None:
        return reglas.porcentaje(self.numerador, self.denominador)


@dataclass(frozen=True)
class MinsaDelMes:
    numerador: int
    denominador: int
    coincide: bool
    fecha_corte: date | None
    documento: str | None
    observacion: str | None


@dataclass
class MesDeFicha:
    mes: int
    numerador: int
    denominador: int
    acumulado: Cifra
    a_tiempo: int
    por_corregir: int
    plazo_vigente: int
    esperando_datos: int
    sin_tratamiento: int
    por_gestionar: int
    estado: str  # oficial · consolidado · por_cerrar · preliminar
    falta_hasta: date | None  # hasta qué día hacen falta datos para cerrarlo; None si ya los hay
    apertura_his: date
    cierre_his: date
    minsa: MinsaDelMes | None

    @property
    def porcentaje(self) -> float | None:
        return reglas.porcentaje(self.numerador, self.denominador)


@dataclass(frozen=True)
class Seguimiento:
    estado: str
    por: str | None
    el: datetime | None


@dataclass
class Caso:
    id: int
    tipo_documento: str | None
    numero_documento: str
    categoria: str | None
    fecha_referencia: date
    es_denominador: bool
    es_numerador: bool
    fecha_cumplimiento: date | None
    motivo_exclusion: str | None
    por_corregir_fecha: date | None
    por_corregir_motivo: str | None
    clase: str | None  # solo los del denominador
    vence: date
    dias_restantes: int
    puede_sumar: bool
    seguimiento: Seguimiento | None = None
    limite: date | None = None  # hasta qué día hacen falta datos para darlo por resuelto


@dataclass(frozen=True)
class PorGestionar:
    total: int
    vencen_pronto: int  # plazo vigente que vence en 7 días o menos
    sin_revisar: int
    en_curso: int
    por_confirmar: int  # marcados como tratados o corregidos: los confirma la próxima carga
    no_corresponde: int


@dataclass(frozen=True)
class CategoriaDelMes:
    mes: int
    numerador: int
    denominador: int


@dataclass
class PorCategoria:
    categoria: str
    nombre: str
    numerador: int
    denominador: int
    meses: list[CategoriaDelMes]  # el mismo conteo, mes por mes (solo los meses con casos)


@dataclass
class Resultado:
    corrida_id: int
    calculado_el: datetime
    version: str
    fecha_corte: date | None
    mes_con_corte: int
    fecha_fin_observacion: date
    datos_hasta: date | None  # hasta qué día hay datos seguidos en todas sus fuentes mensuales
    meta: float | None
    meses: list[MesDeFicha]
    consolidado_hasta: int  # 0 si ningún mes está consolidado
    logro: Cifra | None  # el acumulado hasta el último mes consolidado
    preliminar: Cifra | None  # el acumulado con los meses preliminares, si los hay
    serie: list[float | None]  # el acumulado de cada mes consolidado
    por_gestionar: PorGestionar
    proximo_cierre: date | None  # hasta cuándo pueden sumar los casos por gestionar
    meses_con_minsa: int
    coinciden_con_minsa: int
    excluidos: dict[str, int]
    por_categoria: list[PorCategoria]
    casos: list[Caso] = field(default_factory=list, repr=False)

    @property
    def cumplimiento(self) -> float | None:
        if self.logro is None or self.logro.porcentaje is None or not self.meta:
            return None
        return self.logro.porcentaje / self.meta

    @property
    def diferencia(self) -> float | None:
        if self.logro is None or self.logro.porcentaje is None or self.meta is None:
            return None
        return self.logro.porcentaje - self.meta

    @property
    def cumple_meta(self) -> bool | None:
        return reglas.cumple_meta(self.logro.porcentaje if self.logro else None, self.meta)


def _corrida_vigente(bd: Session, ficha_id: int, anio: int) -> Corrida | None:
    return bd.scalar(select(Corrida).where(Corrida.ficha_id == ficha_id, Corrida.anio == anio, vigente(Corrida)).order_by(Corrida.id.desc()).limit(1))


def _seguimientos(bd: Session, ficha_id: int) -> dict[tuple, Seguimiento]:
    s = SeguimientoCaso
    filas = bd.execute(
        select(s.tipo_documento, s.numero_documento, s.categoria, s.fecha_referencia, s.estado, Usuario.nombre_usuario, func.coalesce(s.fecha_actualizacion, s.fecha_creacion))
        .outerjoin(Usuario, Usuario.id == s.usuario_id)
        .where(s.ficha_id == ficha_id, vigente(s))
    ).all()
    return {(t or "", n, c, f): Seguimiento(e, u, el) for t, n, c, f, e, u, el in filas}


def _casos(bd: Session, corrida: Corrida, numero: int, hoy: date, datos_hasta: date | None = None) -> list[Caso]:
    plazo = PLAZOS[numero]
    seguimientos = _seguimientos(bd, corrida.ficha_id)
    mes_con_corte = corrida.detalle.get("mes_con_corte", 0)
    salida = []
    for p in bd.scalars(select(ResultadoPaciente).where(ResultadoPaciente.corrida_id == corrida.id, vigente(ResultadoPaciente)).order_by(ResultadoPaciente.fecha_referencia, ResultadoPaciente.id)):
        corregir = (p.detalle or {}).get("por_corregir")
        fecha_corregir = date.fromisoformat(corregir["fecha_atencion"]) if corregir else None
        clase = None
        sumar = False
        # Un mes calculado con el corte de MINSA no mira nada posterior al corte.
        corte = corrida.fecha_corte if p.fecha_referencia.month <= mes_con_corte else None
        if p.es_denominador:
            clase = reglas.clase_del_caso(
                es_numerador=p.es_numerador, por_corregir=corregir is not None, fecha_referencia=p.fecha_referencia, plazo_dias=plazo, hoy=hoy,
                datos_hasta=datos_hasta, fecha_corte=corte,
            )  # fmt: skip
            # Un mes que ya cubrió un reporte de MINSA no cambia: nada suma ahí.
            sumar = p.fecha_referencia.month > mes_con_corte and reglas.puede_sumar(clase, fecha_atencion=fecha_corregir, hoy=hoy)
        vence = reglas.vence(p.fecha_referencia, plazo)
        salida.append(Caso(
            p.id, p.tipo_documento, p.numero_documento, p.categoria, p.fecha_referencia, p.es_denominador, p.es_numerador,
            p.fecha_cumplimiento, p.motivo_exclusion, fecha_corregir, corregir["motivo"] if corregir else None,
            clase, vence, (vence - hoy).days, sumar,
            seguimientos.get((p.tipo_documento or "", p.numero_documento, p.categoria, p.fecha_referencia)),
            reglas.limite_del_caso(p.fecha_referencia, plazo, corte),
        ))  # fmt: skip
    return salida


def _categoria_por_mes(casos, categoria: str) -> list[CategoriaDelMes]:
    """Numerador y denominador de una categoría en cada mes que tuvo casos."""
    den = Counter(c.fecha_referencia.month for c in casos if c.es_denominador and c.categoria == categoria)
    num = Counter(c.fecha_referencia.month for c in casos if c.es_numerador and c.categoria == categoria)
    return [CategoriaDelMes(m, num[m], den[m]) for m in sorted(den)]


def _por_gestionar(casos: list[Caso]) -> PorGestionar:
    abiertos = [c for c in casos if c.puede_sumar]
    estado = [c.seguimiento.estado if c.seguimiento else ficha_14.SEGUIMIENTO_SIN_REVISAR for c in abiertos]
    sin_revisar = sum(e == ficha_14.SEGUIMIENTO_SIN_REVISAR for e in estado)
    por_confirmar = sum(e in ficha_14.SEGUIMIENTO_POR_CONFIRMAR for e in estado)
    no_corresponde = sum(e in ficha_14.SEGUIMIENTO_NO_CORRESPONDE for e in estado)
    return PorGestionar(
        total=len(abiertos),
        vencen_pronto=sum(c.clase == reglas.PLAZO_VIGENTE and c.dias_restantes <= reglas.URGENTE_DIAS for c in abiertos),
        sin_revisar=sin_revisar,
        en_curso=len(abiertos) - sin_revisar - por_confirmar - no_corresponde,
        por_confirmar=por_confirmar,
        no_corresponde=no_corresponde,
    )


def _referencias(bd: Session, ficha_id: int, anio: int) -> dict[int, ReferenciaMinsa]:
    r = ReferenciaMinsa
    return {x.mes: x for x in bd.scalars(select(r).where(r.ficha_id == ficha_id, r.anio == anio, vigente(r)))}


def resultado(bd: Session, ficha: FichaDelCatalogo, anio: int, hoy: date) -> Resultado | None:
    """Lo último calculado de la ficha en el año, leído hoy. `None` si la ficha no
    tiene cálculo o nunca se calculó ese año."""
    if not ficha.tiene_calculo:
        return None
    corrida = _corrida_vigente(bd, ficha.id, anio)
    if corrida is None:
        return None
    mensual = {m.mes: m for m in bd.scalars(select(ResultadoMensual).where(ResultadoMensual.corrida_id == corrida.id, vigente(ResultadoMensual)))}
    mensuales = [f.codigo for f in ficha.fuentes if f.periodicidad == "mensual" and f.cargable]
    cargas = _cargas_vigentes(bd, mensuales)
    datos_hasta = _datos_hasta(cargas, anio)
    casos = _casos(bd, corrida, ficha.numero, hoy, datos_hasta)
    referencias = _referencias(bd, ficha.id, anio)
    mes_con_corte = corrida.detalle.get("mes_con_corte", 0)

    numeros = sorted(mensual)
    acumulados = reglas.acumular([(mensual[m].numerador, mensual[m].denominador) for m in numeros])
    meses = []
    for m, acumulado in zip(numeros, acumulados, strict=True):
        del_mes = [c for c in casos if c.es_denominador and c.fecha_referencia.month == m]
        clases = Counter(c.clase for c in del_mes)
        estados = [_estado_de_carga(anio, m, cargas[codigo].get(f"{anio:04d}-{m:02d}"), hoy) for codigo in mensuales]
        ref = referencias.get(m)
        fila = mensual[m]
        # El mes se cierra cuando hay datos hasta el límite de su último caso:
        # hasta entonces puede aparecer un tratamiento o una exclusión.
        limite = max((c.limite for c in del_mes), default=None)
        falta_hasta = limite if limite is not None and datos_hasta is not None and datos_hasta < limite else None
        meses.append(MesDeFicha(
            m, fila.numerador, fila.denominador, Cifra(acumulado.numerador, acumulado.denominador),
            clases[reglas.A_TIEMPO], clases[reglas.POR_CORREGIR], clases[reglas.PLAZO_VIGENTE], clases[reglas.ESPERANDO_DATOS], clases[reglas.SIN_TRATAMIENTO],
            sum(c.puede_sumar for c in del_mes),
            calendario.estado_del_mes(m, mes_con_corte=mes_con_corte, cargas=estados, pendiente=falta_hasta is not None),
            falta_hasta,
            calendario.apertura_his(anio, m), calendario.cierre_his(anio, m),
            MinsaDelMes(ref.numerador, ref.denominador, (ref.numerador, ref.denominador) == (fila.numerador, fila.denominador), ref.fecha_corte, ref.documento, ref.observacion) if ref else None,
        ))  # fmt: skip

    # Consolidado: los meses seguidos desde enero que ya no van a cambiar.
    consolidado_hasta = 0
    for mes in meses:
        if mes.estado in (calendario.MES_PRELIMINAR, calendario.MES_POR_CERRAR):
            break
        consolidado_hasta = mes.mes
    hasta = {m.mes: m for m in meses}
    logro = hasta[consolidado_hasta].acumulado if consolidado_hasta else None
    preliminar = meses[-1].acumulado if meses and meses[-1].mes > consolidado_hasta else None
    abiertos = [c for c in casos if c.puede_sumar]
    # Hasta cuándo pueden sumar: el cierre de la corrección del HIS del último mes con casos abiertos.
    proximo_cierre = max((calendario.cierre_his(anio, c.fecha_referencia.month) for c in abiertos), default=None)
    con_minsa = [m for m in meses if m.minsa]
    del_periodo = [c for c in casos if c.fecha_referencia.month <= corrida.mes_hasta]
    nombres = NOMBRES_DE_CATEGORIA.get(ficha.numero, {})
    categorias = Counter(c.categoria for c in del_periodo if c.es_denominador)
    a_tiempo = Counter(c.categoria for c in del_periodo if c.es_numerador)
    return Resultado(
        corrida_id=corrida.id,
        calculado_el=corrida.fecha_creacion,
        version=corrida.version_calculo,
        fecha_corte=corrida.fecha_corte,
        mes_con_corte=mes_con_corte,
        fecha_fin_observacion=corrida.fecha_fin_observacion,
        datos_hasta=datos_hasta,
        meta=METAS.get(ficha.numero),
        meses=meses,
        consolidado_hasta=consolidado_hasta,
        logro=logro,
        preliminar=preliminar,
        serie=[m.acumulado.porcentaje for m in meses if m.mes <= consolidado_hasta],
        por_gestionar=_por_gestionar(casos),
        proximo_cierre=proximo_cierre,
        meses_con_minsa=len(con_minsa),
        coinciden_con_minsa=sum(m.minsa.coincide for m in con_minsa),
        excluidos=dict(Counter(c.motivo_exclusion for c in del_periodo if c.motivo_exclusion)),
        por_categoria=[
            PorCategoria(k, nombres.get(k, k), a_tiempo[k], categorias[k], _categoria_por_mes(del_periodo, k))
            for k in sorted(categorias, key=lambda k: (-categorias[k], k))
        ],
        casos=casos,
    )


# ====================================================================== resumen


@dataclass(frozen=True)
class Ventana:
    """La corrección del HIS del último mes terminado: abierta o por abrir."""

    anio: int
    mes: int
    apertura: date
    cierre: date
    abierta: bool
    faltan: list[str]  # fuentes que se pueden cargar y no tienen ese mes


@dataclass
class FichaDelResumen:
    ficha: FichaDelCatalogo
    resultado: Resultado | None


@dataclass
class Resumen:
    anio: int
    hoy: date
    anios: list[int]
    datos_al: date | None
    ventana: Ventana | None
    dimensiones: list[Dimension]
    fichas: list[FichaDelResumen]
    por_subir_ahora: int = 0  # archivos de «qué subir» cuya fecha ya llegó


def ventana(bd: Session, hoy: date) -> Ventana | None:
    v = calendario.ventana_de_correccion(hoy)
    if v is None:
        return None
    anio, mes = v
    mensuales = bd.execute(select(Fuente.codigo, Fuente.nombre).where(Fuente.codigo.in_(CARGABLES), Fuente.periodicidad == "mensual", vigente(Fuente)).order_by(Fuente.id)).all()
    cargas = _cargas_vigentes(bd, [c for c, _ in mensuales])
    faltan = [nombre for codigo, nombre in mensuales if f"{anio:04d}-{mes:02d}" not in cargas[codigo]]
    apertura = calendario.apertura_his(anio, mes)
    return Ventana(anio, mes, apertura, calendario.cierre_his(anio, mes), hoy >= apertura, faltan)


def _datos_al(bd: Session) -> date | None:
    """Hasta qué día llegan los datos del HIS: la extracción más reciente."""
    extraccion = bd.scalar(
        select(func.max(LoteCarga.fecha_extraccion))
        .join(LoteMes, LoteMes.lote_carga_id == LoteCarga.id)
        .join(Fuente, Fuente.id == LoteCarga.fuente_id)
        .where(Fuente.codigo == FUENTE_HIS, LoteMes.es_vigente, vigente(LoteMes), vigente(LoteCarga))
    )
    return extraccion.date() if extraccion else None


def resumen(bd: Session, *, anio: int, hoy: date) -> Resumen:
    fichas = [FichaDelResumen(f, resultado(bd, f, anio, hoy)) for f in catalogo(bd)]
    ahora = sum(x.disponible for x in por_subir(bd, anio=anio, hoy=hoy))
    return Resumen(anio, hoy, anios_disponibles(bd), _datos_al(bd), ventana(bd, hoy), dimensiones(bd), fichas, ahora)


@dataclass
class Detalle:
    ficha: FichaDelCatalogo
    ficha_tecnica: dict | None
    meta: float | None
    resultado: Resultado | None
    datos_al: date | None
    anios: list[int]


def detalle(bd: Session, *, numero: int, anio: int, hoy: date) -> Detalle:
    f = _ficha(bd, numero)
    return Detalle(f, FICHAS_TECNICAS.get(numero), METAS.get(numero), resultado(bd, f, anio, hoy), _datos_al(bd), anios_disponibles(bd))


# ======================================================================== casos


@dataclass(frozen=True)
class Paciente:
    apellido_paterno: str | None
    apellido_materno: str | None
    nombres: str | None
    historia_clinica: str | None


def _pacientes(bd: Session, documentos: set[tuple[str, str]]) -> dict[tuple[str, str], Paciente]:
    """Nombre e historia clínica de cada persona, de su atención más reciente en el
    HIS cargado. Si ya no hay datos crudos (se vaciaron), no hay nombre: no se inventa."""
    if not documentos:
        return {}
    a = HisAtencion
    numeros = {n for _, n in documentos}
    filas = bd.execute(
        select(a.id_tipo_documento_paciente, a.numero_documento_paciente, a.apellido_paterno_paciente, a.apellido_materno_paciente, a.nombres_paciente, a.historia_clinica)
        .join(LoteMes, LoteMes.id == a.lote_mes_id)
        .where(a.numero_documento_paciente.in_(numeros), LoteMes.es_vigente, vigente(LoteMes))
        .order_by(a.fecha_atencion)
    ).all()
    salida: dict[tuple[str, str], Paciente] = {}
    for tipo, numero, paterno, materno, nombres, hc in filas:
        clave = ((tipo or "").strip().removesuffix(".0"), (numero or "").strip())
        if clave in documentos and (nombres or paterno):
            salida[clave] = Paciente(paterno, materno, nombres, hc)  # gana la más reciente
    return salida


@dataclass
class CasoPorGestionar:
    caso: Caso
    nombre_categoria: str
    paciente: Paciente | None
    cierre_his: date | None  # hasta cuándo se puede corregir (solo por corregir)
    opciones: tuple[str, ...]


@dataclass
class Casos:
    ficha: FichaDelCatalogo
    anio: int
    corrida_id: int | None
    datos_al: date | None
    por_gestionar: PorGestionar | None
    casos: list[CasoPorGestionar]


# Orden de las situaciones en la lista de un mes: primero lo que se puede gestionar.
_ORDEN_DE_CLASE = {reglas.PLAZO_VIGENTE: 0, reglas.POR_CORREGIR: 1, reglas.ESPERANDO_DATOS: 2, reglas.SIN_TRATAMIENTO: 3, reglas.A_TIEMPO: 4}


def casos(bd: Session, *, numero: int, anio: int, hoy: date, mes: int | None = None) -> Casos:
    """Los casos que todavía pueden sumar, con los datos de cada paciente. Con
    `mes`, todos los pacientes del denominador diagnosticados ese mes, cada uno
    con su situación: el seguimiento solo se ofrece a los que todavía pueden sumar."""
    f = _ficha(bd, numero)
    r = resultado(bd, f, anio, hoy)
    if r is None:
        return Casos(f, anio, None, _datos_al(bd), None, [])
    if mes is None:
        abiertos = sorted((c for c in r.casos if c.puede_sumar), key=lambda c: (c.clase != reglas.PLAZO_VIGENTE, c.dias_restantes, c.fecha_referencia))
    else:
        del_mes = (c for c in r.casos if c.es_denominador and c.fecha_referencia.month == mes)
        abiertos = sorted(del_mes, key=lambda c: (_ORDEN_DE_CLASE.get(c.clase, 9), c.dias_restantes if c.puede_sumar else 0, c.fecha_referencia))
    pacientes = _pacientes(bd, {(c.tipo_documento or "", c.numero_documento) for c in abiertos})
    nombres = NOMBRES_DE_CATEGORIA.get(numero, {})
    salida = [
        CasoPorGestionar(
            c, nombres.get(c.categoria, c.categoria or ""), pacientes.get((c.tipo_documento or "", c.numero_documento)),
            calendario.cierre_his(c.por_corregir_fecha.year, c.por_corregir_fecha.month) if c.por_corregir_fecha else None,
            SEGUIMIENTO[numero][c.clase] if c.puede_sumar else (),
        )
        for c in abiertos
    ]  # fmt: skip
    return Casos(f, anio, r.corrida_id, r.fecha_fin_observacion, r.por_gestionar, salida)


def guardar_seguimiento(bd: Session, *, numero: int, anio: int, caso_id: int, estado: str, usuario_id: int | None, hoy: date) -> CasoPorGestionar:
    """Anota qué se está haciendo con un caso. Solo con los que todavía pueden
    sumar, y solo con los estados que corresponden a su situación."""
    todos = casos(bd, numero=numero, anio=anio, hoy=hoy)
    elegido = next((c for c in todos.casos if c.caso.id == caso_id), None)
    if elegido is None:
        raise NoEncontrado("Ese caso no está entre los que todavía pueden sumar en el último cálculo.")
    if estado not in elegido.opciones:
        raise ValorInvalido(f"«{estado}» no es un seguimiento posible para este caso. Puede ser: {', '.join(elegido.opciones)}.")
    c = elegido.caso
    s = SeguimientoCaso
    fila = bd.scalar(
        select(s).where(s.ficha_id == todos.ficha.id, func.coalesce(s.tipo_documento, "") == (c.tipo_documento or ""), s.numero_documento == c.numero_documento, s.categoria == c.categoria, s.fecha_referencia == c.fecha_referencia, vigente(s))
    )
    if fila is None:
        bd.add(SeguimientoCaso(ficha_id=todos.ficha.id, tipo_documento=c.tipo_documento, numero_documento=c.numero_documento, categoria=c.categoria, fecha_referencia=c.fecha_referencia, estado=estado, usuario_id=usuario_id))
    else:
        fila.estado, fila.usuario_id = estado, usuario_id
    bd.flush()
    return next(x for x in casos(bd, numero=numero, anio=anio, hoy=hoy).casos if x.caso.id == caso_id)


# ===================================================================== fuentes


@dataclass(frozen=True)
class MesDeCarga:
    mes: int
    estado: str  # cierre · preliminar · recargar · sin_fecha · falta · futuro
    carga: CargaDelMes | None
    versiones: int  # cuántas veces se cargó ese mes (la vigente y las reemplazadas)


@dataclass
class FuenteDeCarga:
    codigo: str
    nombre: str
    descripcion: str | None
    formato: str | None
    area_responsable: str | None
    periodicidad: str
    cargable: bool
    fichas: list[int]
    meses: list[MesDeCarga]
    verificadas: int | None  # solo las defunciones verificadas, que no van por meses


def fuentes_de_carga(bd: Session, *, anio: int, hoy: date) -> list[FuenteDeCarga]:
    todas = bd.scalars(select(Fuente).where(vigente(Fuente), Fuente.es_activo).order_by(Fuente.id)).all()
    fichas: dict[int, list[int]] = {}
    for fuente_id, numero in bd.execute(select(FichaFuente.fuente_id, Ficha.numero).join(Ficha, Ficha.id == FichaFuente.ficha_id).where(vigente(FichaFuente), vigente(Ficha))):
        fichas.setdefault(fuente_id, []).append(numero)
    cargas = _cargas_vigentes(bd, [f.codigo for f in todas])
    versiones = Counter(
        (codigo, mes)
        for codigo, mes in bd.execute(
            select(Fuente.codigo, LoteMes.mes).join(Fuente, Fuente.id == LoteMes.fuente_id).where(LoteMes.anio == anio, vigente(LoteMes))
        )
    )
    verificadas = bd.scalar(select(func.count()).select_from(DefuncionVerificada).where(vigente(DefuncionVerificada)))
    salida = []
    for f in todas:
        meses = []
        if f.periodicidad == "mensual":
            for m in range(1, 13):
                carga = cargas[f.codigo].get(f"{anio:04d}-{m:02d}")
                meses.append(MesDeCarga(m, _estado_de_carga(anio, m, carga, hoy), carga, versiones[(f.codigo, m)]))
        salida.append(FuenteDeCarga(
            f.codigo, f.nombre, f.descripcion, f.formato, f.area_responsable, f.periodicidad, f.codigo in CARGABLES,
            sorted(fichas.get(f.id, [])), meses, verificadas if f.codigo == "sinadef_verificado" else None,
        ))  # fmt: skip
    return salida


# ==================================================================== qué subir


@dataclass(frozen=True)
class PasoDeSubida:
    desde: date  # sirve una descarga hecha desde este día
    disponible: bool  # ese día ya llegó
    cierra: tuple[int, ...]  # los meses que se cierran con ella; vacío si solo completa su mes
    definitiva: bool  # desde ese día la carga ya es la final de su mes


@dataclass(frozen=True)
class FuentePorSubir:
    codigo: str
    nombre: str


@dataclass
class PorSubir:
    """Un archivo que hace falta: de qué mes, de qué fuentes y descargado desde
    cuándo. Un mismo mes puede pedirse más de una vez (`pasos`): una descarga
    temprana cierra meses anteriores y otra, tras el cierre del HIS, lo deja final."""

    anio: int
    mes: int
    fuentes: list[FuentePorSubir]
    cargado: bool  # ya hay una carga de ese mes: la nueva la reemplaza
    pasos: list[PasoDeSubida]

    @property
    def disponible(self) -> bool:
        return any(p.disponible for p in self.pasos)


def por_subir(bd: Session, *, anio: int, hoy: date) -> list[PorSubir]:
    """Qué descargar y subir, y desde qué fecha, para cerrar los meses abiertos.

    Sale de los casos de cada ficha con cálculo: un mes se cierra cuando todas
    sus fuentes mensuales tienen datos hasta el límite de su último caso. Para
    llegar a ese día hace falta cada mes intermedio entero y el último hasta ese
    día. Además, la carga de un mes es la final solo si se descargó tras el
    cierre de la corrección del HIS.

    El año siguiente queda fuera: lo que un mes necesite después de diciembre no
    se pide aquí."""
    fin_de_anio = date(anio, 12, 31)
    un_dia = timedelta(days=1)
    # (fuente, mes) -> {desde: meses que cierra}
    necesidades: dict[tuple[str, int], dict[date, set[int]]] = {}
    nombres: dict[str, str] = {}
    cargados: dict[str, dict[int, CargaDelMes]] = {}
    for ficha in catalogo(bd):
        if not ficha.tiene_calculo:
            continue
        mensuales = [f for f in ficha.fuentes if f.periodicidad == "mensual" and f.cargable]
        cargas = _cargas_vigentes(bd, [f.codigo for f in mensuales])
        r = resultado(bd, ficha, anio, hoy)
        abiertos = [(m.mes, min(m.falta_hasta, fin_de_anio)) for m in r.meses if m.falta_hasta is not None] if r else []
        for f in mensuales:
            nombres[f.codigo] = f.nombre
            suyos = cargados[f.codigo] = _del_anio(cargas[f.codigo], anio)
            cubre = {k: calendario.cubre_hasta(anio, k, _dia_de_descarga(c)) for k, c in suyos.items()}
            for mes_abierto, limite in abiertos:
                for k in range(1, limite.month + 1):
                    necesita = min(limite, calendario.fin_de_mes(anio, k))
                    if k in cubre and cubre[k] >= necesita:
                        continue
                    cierra = necesidades.setdefault((f.codigo, k), {}).setdefault(necesita + un_dia, set())
                    # Lo cierra la descarga que llega a su límite; las de los
                    # meses intermedios solo completan el camino.
                    if k == limite.month:
                        cierra.add(mes_abierto)
            # Todo mes ya terminado que no está cargado falta, lo pida o no un caso:
            # con la base vacía, la lista dice el estado real y no «nada que subir».
            for k in range(1, 13):
                if k not in cubre and calendario.fin_de_mes(anio, k) < hoy:
                    necesidades.setdefault((f.codigo, k), {}).setdefault(calendario.fin_de_mes(anio, k) + un_dia, set())
            # Lo cargado antes del cierre del HIS: hay una versión mejor, o la habrá.
            for k, carga in suyos.items():
                if _estado_de_carga(anio, k, carga, hoy) in (calendario.PRELIMINAR, calendario.RECARGAR):
                    necesidades.setdefault((f.codigo, k), {})

    filas: dict[tuple, PorSubir] = {}
    for (codigo, k), por_fecha in necesidades.items():
        carga = cargados[codigo].get(k)
        cierre = calendario.cierre_his(anio, k)
        ya_es_final = carga is not None and _estado_de_carga(anio, k, carga, hoy) in (calendario.CIERRE, calendario.SIN_FECHA)
        if not ya_es_final:
            por_fecha.setdefault(cierre, set())
        pasos = [PasoDeSubida(desde, desde <= hoy, tuple(sorted(cierra)), desde >= cierre) for desde, cierra in sorted(por_fecha.items())]
        # Lo que ya se puede hacer se hace con una sola descarga de hoy.
        listos = [p for p in pasos if p.disponible]
        if len(listos) > 1:
            junto = PasoDeSubida(listos[-1].desde, True, tuple(sorted({m for p in listos for m in p.cierra})), listos[-1].definitiva)
            pasos = [junto, *(p for p in pasos if not p.disponible)]
        if not pasos:
            continue
        # Dos fuentes que piden lo mismo del mismo mes van en una sola fila.
        clave = (k, tuple(pasos), carga is not None)
        if clave in filas:
            filas[clave].fuentes.append(FuentePorSubir(codigo, nombres[codigo]))
        else:
            filas[clave] = PorSubir(anio, k, [FuentePorSubir(codigo, nombres[codigo])], carga is not None, pasos)
    return sorted(filas.values(), key=lambda x: (x.pasos[0].desde, x.mes))


def editar_fuente(bd: Session, *, codigo: str, fichas: list[int], area_responsable: str | None, anio: int, hoy: date) -> FuenteDeCarga:
    """Cambia a qué fichas alimenta una fuente y quién la entrega. Lo que una
    ficha calcula no cambia por esto: cambia qué dice que le falta."""
    fuente = bd.scalar(select(Fuente).where(Fuente.codigo == codigo, vigente(Fuente)))
    if fuente is None:
        raise NoEncontrado(f"No existe la fuente «{codigo}».")
    pedidas = set(fichas)
    existentes = {f.numero: f.id for f in bd.scalars(select(Ficha).where(Ficha.numero.in_(pedidas), vigente(Ficha)))}
    desconocidas = sorted(pedidas - set(existentes))
    if desconocidas:
        raise ValorInvalido(f"No existen las fichas {', '.join(map(str, desconocidas))}.")
    if not pedidas:
        raise ValorInvalido("Una fuente alimenta al menos a una ficha.")
    actuales = {x.ficha_id: x for x in bd.scalars(select(FichaFuente).where(FichaFuente.fuente_id == fuente.id, vigente(FichaFuente)))}
    for ficha_id, fila in actuales.items():
        if ficha_id not in existentes.values():
            fila.fecha_eliminacion = func.now()
    for ficha_id in existentes.values():
        if ficha_id not in actuales:
            bd.add(FichaFuente(ficha_id=ficha_id, fuente_id=fuente.id))
    area = (area_responsable or "").strip() or None
    if area != fuente.area_responsable:
        fuente.area_responsable = area
    bd.flush()
    return next(f for f in fuentes_de_carga(bd, anio=anio, hoy=hoy) if f.codigo == codigo)


@dataclass(frozen=True)
class CargaHistorica:
    lote_mes_id: int
    fuente: str
    fuente_nombre: str
    anio: int
    mes: int
    archivo: str
    huella: str
    fecha_extraccion: datetime | None
    filas: int
    version: int
    vigente: bool
    cargado_el: datetime
    cargado_por: str | None
    retirada_el: datetime | None = None  # se retiró sin que otra carga ocupara su mes


def historial(bd: Session, *, anio: int) -> list[CargaHistorica]:
    """Cada carga de cada mes del año, también las reemplazadas, de la más
    reciente a la más antigua."""
    filas = bd.execute(
        select(LoteMes.id, Fuente.codigo, Fuente.nombre, LoteMes.anio, LoteMes.mes, LoteCarga.nombre_archivo, LoteCarga.huella_sha256, LoteCarga.fecha_extraccion, LoteMes.filas, LoteMes.es_vigente, LoteMes.fecha_creacion, Usuario.nombre_usuario, LoteMes.fecha_actualizacion)
        .join(LoteCarga, LoteCarga.id == LoteMes.lote_carga_id)
        .join(Fuente, Fuente.id == LoteMes.fuente_id)
        .outerjoin(Usuario, Usuario.id == LoteCarga.usuario_carga_id)
        .where(LoteMes.anio == anio, vigente(LoteMes))
        .order_by(LoteMes.id)
    ).all()
    version: Counter = Counter()
    total = Counter((codigo, m) for _id, codigo, _n, _a, m, *_ in filas)
    salida = []
    for lote_mes_id, codigo, nombre, a, m, archivo, huella, extraccion, filas_, es_vigente, creado, usuario, actualizado in filas:
        version[(codigo, m)] += 1
        # La última carga de su mes y ya no vigente: nadie la reemplazó, se retiró.
        retirada = actualizado if not es_vigente and version[(codigo, m)] == total[(codigo, m)] else None
        salida.append(CargaHistorica(lote_mes_id, codigo, nombre, a, m, archivo, huella, extraccion, filas_, version[(codigo, m)], es_vigente, creado, usuario, retirada))
    return list(reversed(salida))


# ============================================================ retirar una carga

_TABLA_DE_FILAS = {FUENTE_HIS: HisAtencion, FUENTE_SINADEF: SinadefDefuncion}


def retirar_mes(bd: Session, *, codigo: str, anio: int, mes: int) -> CargaDelMes:
    """Retira la carga vigente de un mes de una fuente: borra sus filas y la deja
    en el historial como no vigente. No devuelve la versión anterior (lo
    reemplazado no se guarda): para volver atrás se sube otra vez el archivo.
    No recalcula ni confirma: quien llama lo hace."""
    tabla = _TABLA_DE_FILAS.get(codigo)
    if tabla is None:
        raise ValorInvalido("Solo se retiran las cargas mensuales del HIS MINSA y de SINADEF.")
    carga = _cargas_vigentes(bd, [codigo])[codigo].get(f"{anio:04d}-{mes:02d}")
    if carga is None:
        raise NoEncontrado(f"No hay una carga vigente de {mes:02d}/{anio} en esa fuente.")
    bd.execute(delete(tabla).where(tabla.lote_mes_id == carga.lote_mes_id))
    del_mes = bd.get(LoteMes, carga.lote_mes_id)
    del_mes.es_vigente = False
    # El archivo ya no tiene cargadas esas filas: si se vuelve a subir, cuentan otra vez.
    lote = bd.get(LoteCarga, del_mes.lote_carga_id)
    lote.filas_cargadas -= del_mes.filas
    lote.filas_omitidas = lote.filas_archivo - lote.filas_cargadas
    bd.flush()
    return carga


def retirar_resultados(bd: Session, *, numero: int, anio: int) -> None:
    """Sin datos para calcular (se retiró enero), lo último calculado ya no
    describe lo cargado: deja de ser el resultado vigente. Queda en la base."""
    ficha_id = bd.scalar(select(Ficha.id).where(Ficha.numero == numero, vigente(Ficha)))
    for corrida in bd.scalars(select(Corrida).where(Corrida.ficha_id == ficha_id, Corrida.anio == anio, vigente(Corrida))):
        corrida.fecha_eliminacion = func.now()
    bd.flush()


# ====================================================== defunciones verificadas


@dataclass(frozen=True)
class Verificada:
    id: int
    numero_documento: str
    fecha_defuncion: date
    fecha_registro: date | None
    origen: str | None
    fecha_verificacion: date | None
    observacion: str | None
    anotada_el: datetime


def _verificada(v: DefuncionVerificada) -> Verificada:
    return Verificada(v.id, v.numero_documento, v.fecha_defuncion, v.fecha_registro, v.origen, v.fecha_verificacion, v.observacion, v.fecha_actualizacion or v.fecha_creacion)


def verificadas(bd: Session) -> list[Verificada]:
    v = DefuncionVerificada
    return [_verificada(x) for x in bd.scalars(select(v).where(vigente(v)).order_by(v.fecha_defuncion.desc(), v.id.desc()))]


def guardar_verificada(
    bd: Session, *, verificada_id: int | None, numero_documento: str, fecha_defuncion: date, fecha_registro: date | None, origen: str | None, observacion: str | None, hoy: date
) -> Verificada:
    """Agrega una defunción verificada a mano, o corrige una. Una persona, una
    fila: igual que al cargar el CSV. No recalcula ni confirma."""
    v = DefuncionVerificada
    documento = numero_documento.strip()
    if re.fullmatch(r"[0-9]{8}", documento) is None:
        raise ValorInvalido("El número de documento son 8 dígitos.")
    if fecha_defuncion > hoy:
        raise ValorInvalido("La fecha de defunción no puede ser futura.")
    if fecha_registro is not None and not fecha_defuncion <= fecha_registro <= hoy:
        raise ValorInvalido("La fecha de registro va entre la de defunción y hoy.")
    otra = bd.scalar(select(v).where(v.numero_documento == documento, vigente(v)))
    if otra is not None and otra.id != verificada_id:
        raise ValorInvalido(f"Ya hay una defunción verificada con el documento {documento}: corrija esa.")
    valores = {"numero_documento": documento, "fecha_defuncion": fecha_defuncion, "fecha_registro": fecha_registro, "origen": (origen or "").strip() or None, "observacion": (observacion or "").strip() or None}
    if verificada_id is None:
        fila = DefuncionVerificada(**valores, fecha_verificacion=hoy)
        bd.add(fila)
    else:
        fila = bd.scalar(select(v).where(v.id == verificada_id, vigente(v)))
        if fila is None:
            raise NoEncontrado("Esa defunción verificada no existe o ya se retiró.")
        if fila.numero_documento != documento:
            # Otra persona es otra fila: la anterior se retira y esta nace nueva,
            # para que el cálculo vea que los datos cambiaron.
            fila.fecha_eliminacion = func.now()
            fila = DefuncionVerificada(**valores, fecha_verificacion=hoy)
            bd.add(fila)
        else:
            for campo, valor in valores.items():
                setattr(fila, campo, valor)
    bd.flush()
    bd.refresh(fila)
    return _verificada(fila)


def retirar_verificada(bd: Session, *, verificada_id: int) -> None:
    v = DefuncionVerificada
    fila = bd.scalar(select(v).where(v.id == verificada_id, vigente(v)))
    if fila is None:
        raise NoEncontrado("Esa defunción verificada no existe o ya se retiró.")
    fila.fecha_eliminacion = func.now()
    bd.flush()


# ============================================================== referencia MINSA


@dataclass(frozen=True)
class Referencia:
    numero: int
    nombre_corto: str | None
    anio: int
    mes: int
    numerador: int
    denominador: int
    fecha_corte: date | None
    documento: str | None
    observacion: str | None
    calculado: Cifra | None  # lo que da el último cálculo del hospital para ese mes
    coincide: bool | None


def referencias(bd: Session, *, anio: int) -> list[Referencia]:
    r = ReferenciaMinsa
    filas = bd.execute(select(r, Ficha.numero, Ficha.nombre_corto, Ficha.id).join(Ficha, Ficha.id == r.ficha_id).where(r.anio == anio, vigente(r)).order_by(Ficha.numero, r.mes)).all()
    calculos: dict[int, dict[int, ResultadoMensual]] = {}
    salida = []
    for ref, numero, corto, ficha_id in filas:
        if ficha_id not in calculos:
            corrida = _corrida_vigente(bd, ficha_id, anio)
            calculos[ficha_id] = {} if corrida is None else {m.mes: m for m in bd.scalars(select(ResultadoMensual).where(ResultadoMensual.corrida_id == corrida.id, vigente(ResultadoMensual)))}
        m = calculos[ficha_id].get(ref.mes)
        cifra = Cifra(m.numerador, m.denominador) if m else None
        salida.append(Referencia(numero, corto, anio, ref.mes, ref.numerador, ref.denominador, ref.fecha_corte, ref.documento, ref.observacion, cifra, (cifra.numerador, cifra.denominador) == (ref.numerador, ref.denominador) if cifra else None))
    return salida


def guardar_referencia(
    bd: Session, *, numero: int, anio: int, mes: int, numerador: int, denominador: int, fecha_corte: date | None, documento: str | None, observacion: str | None, hoy: date
) -> Referencia:
    """Registra lo que MINSA publicó de una ficha y un mes. Solo sirve para
    comparar, salvo su fecha de corte: el próximo cálculo la usa."""
    f = _ficha(bd, numero)
    if not f.aplica:
        raise ValorInvalido(f"La ficha {numero} no se evalúa en el hospital.")
    if not 1 <= mes <= 12:
        raise ValorInvalido("El mes va de 1 a 12.")
    if calendario.fin_de_mes(anio, mes) >= hoy:
        raise ValorInvalido("Solo se registra el resultado de un mes que ya terminó.")
    if denominador < 1 or not 0 <= numerador <= denominador:
        raise ValorInvalido("El numerador debe ser un entero entre 0 y el denominador, y el denominador al menos 1.")
    if fecha_corte is not None and (fecha_corte <= calendario.fin_de_mes(anio, mes) or fecha_corte > hoy):
        raise ValorInvalido("La fecha de corte va después del fin del mes y no puede ser futura.")
    r = ReferenciaMinsa
    fila = bd.scalar(select(r).where(r.ficha_id == f.id, r.anio == anio, r.mes == mes, vigente(r)))
    valores = {"numerador": numerador, "denominador": denominador, "fecha_corte": fecha_corte, "documento": (documento or "").strip() or None, "observacion": (observacion or "").strip() or None}
    if fila is None:
        bd.add(ReferenciaMinsa(ficha_id=f.id, anio=anio, mes=mes, **valores))
    else:
        for campo, valor in valores.items():
            setattr(fila, campo, valor)
    bd.flush()
    return next(x for x in referencias(bd, anio=anio) if x.numero == numero and x.mes == mes)


def confirmar_seguimientos(bd: Session, *, numero: int, anio: int) -> int:
    """Los casos marcados como «tratado» o «corregido» que el último cálculo ya
    cuenta en el numerador: quedan confirmados. Devuelve cuántos."""
    f = _ficha(bd, numero)
    corrida = _corrida_vigente(bd, f.id, anio)
    if corrida is None:
        return 0
    s, p = SeguimientoCaso, ResultadoPaciente
    filas = bd.scalars(
        select(s)
        .join(p, (p.corrida_id == corrida.id) & (func.coalesce(p.tipo_documento, "") == func.coalesce(s.tipo_documento, "")) & (p.numero_documento == s.numero_documento) & (p.categoria == s.categoria) & (p.fecha_referencia == s.fecha_referencia))
        .where(s.ficha_id == f.id, s.estado.in_(sorted(ficha_14.SEGUIMIENTO_POR_CONFIRMAR)), p.es_numerador, vigente(s))
    ).all()
    for fila in filas:
        fila.estado = ficha_14.SEGUIMIENTO_CONFIRMADO
    bd.flush()
    return len(filas)
