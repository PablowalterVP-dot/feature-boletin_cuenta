"""Lo que el panel de monitoreo guarda: cifras registradas, datos del mes y compromisos.

El catálogo de indicadores y compromisos vive en el frontend (`datos/monitoreo.js`,
`datos/compromisos.js`), como los formatos DIRESA y las actividades del POI. Aquí se
valida lo que se puede validar sin conocerlo: que la cifra tenga sentido y que nadie
pise con una digitación lo que publicó MINSA.

Una ausencia no se almacena: un mes sin dato no tiene fila, y un compromiso sin avance
tampoco. Guardar un cero afirmaría que se midió.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Usuario
from app.datos.modelos.desempeno import CompromisoAvance, DatoMes, ResultadoRegistrado
from app.servicios.dl1153 import Reporte

# Las fichas que no llegan en el reporte DL 1153 y Estadística digita de lo que le
# envía cada oficina. Con su parte, cuando el indicador tiene varias.
DIGITABLES: dict[int, frozenset[str]] = {
    27: frozenset({"nav", "itu", "its", "isq", "end"}),
    28: frozenset({"principal"}),
    29: frozenset({"principal"}),
    30: frozenset({"asist", "cas", "perfil", "remuneracion"}),
    31: frozenset({"principal"}),
}
ESTADOS_DE_COMPROMISO = frozenset({"pendiente", "en_curso", "cumplido"})
TEXTO_MAXIMO = 1000


class ValorInvalido(ValueError):
    """La cifra no se puede guardar; el mensaje dice por qué."""


@dataclass(frozen=True)
class Registrado:
    id: int
    familia: str
    indicador: int
    serie: str
    ambito: str
    mes: int
    numerador: float | None
    denominador: float | None
    origen: str
    fecha_corte: date | None
    documento: str | None
    nota: str | None


@dataclass(frozen=True)
class DatoDelMes:
    mes: int
    clave: str
    valor: float
    origen: str
    nota: str | None


@dataclass(frozen=True)
class Avance:
    compromiso: int
    entregable: str
    estado: str
    fecha_cumplimiento: date | None
    evidencia: str | None
    usuario: str | None
    fecha: datetime


def _numero(v: Decimal | None) -> float | None:
    return None if v is None else float(v)


def _texto(valor: str | None, nombre: str) -> str | None:
    limpio = (valor or "").strip() or None
    if limpio and len(limpio) > TEXTO_MAXIMO:
        raise ValorInvalido(f"{nombre} no puede pasar de {TEXTO_MAXIMO} caracteres.")
    return limpio


def _validar_mes(anio: int, mes: int, hoy: date) -> None:
    if not 1 <= mes <= 12:
        raise ValorInvalido("El mes va de 1 a 12.")
    if (anio, mes) > (hoy.year, hoy.month):
        raise ValorInvalido("Ese mes todavía no empieza: no tiene datos que registrar.")


def _validar_cifra(valor: float, nombre: str) -> None:
    if not math.isfinite(valor) or valor < 0:
        raise ValorInvalido(f"{nombre} es una cifra de cero en adelante.")


# ================================================================= resultados


def resultados(bd: Session, *, anio: int) -> list[Registrado]:
    r = ResultadoRegistrado
    filas = bd.scalars(select(r).where(r.anio == anio, vigente(r)).order_by(r.familia, r.indicador, r.serie, r.ambito, r.mes)).all()
    return [
        Registrado(f.id, f.familia, f.indicador, f.serie, f.ambito, f.mes, _numero(f.numerador), _numero(f.denominador), f.origen, f.fecha_corte, f.documento, f.nota)
        for f in filas
    ]


def _fila(bd: Session, familia: str, indicador: int, serie: str, ambito: str, anio: int, mes: int) -> ResultadoRegistrado | None:
    r = ResultadoRegistrado
    return bd.scalar(select(r).where(r.familia == familia, r.indicador == indicador, r.serie == serie, r.ambito == ambito, r.anio == anio, r.mes == mes, vigente(r)))


def _escribir(bd: Session, *, familia: str, indicador: int, serie: str, ambito: str, anio: int, mes: int, numerador: float | None, denominador: float | None,
              origen: str, fecha_corte: date | None, documento: str | None, nota: str | None, usuario_id: int | None) -> str:
    """Crea o reescribe la fila. Dice qué pasó: nueva, cambio o igual."""
    num = None if numerador is None else Decimal(str(numerador))
    den = None if denominador is None else Decimal(str(denominador))
    fila = _fila(bd, familia, indicador, serie, ambito, anio, mes)
    if fila is None:
        bd.add(ResultadoRegistrado(familia=familia, indicador=indicador, serie=serie, ambito=ambito, anio=anio, mes=mes, numerador=num, denominador=den,
                                   origen=origen, fecha_corte=fecha_corte, documento=documento, nota=nota, usuario_id=usuario_id))
        return "nueva"
    igual = fila.numerador == num and fila.denominador == den
    fila.numerador, fila.denominador, fila.origen = num, den, origen
    fila.fecha_corte, fila.documento, fila.nota, fila.usuario_id = fecha_corte, documento, nota, usuario_id
    return "igual" if igual else "cambio"


def registrar(bd: Session, *, ficha: int, serie: str, anio: int, mes: int, numerador: float, denominador: float, documento: str | None, nota: str | None,
              usuario_id: int, hoy: date) -> Registrado:
    """Lo que Estadística digita de una oficina. Solo las fichas que el reporte no trae."""
    series = DIGITABLES.get(ficha)
    if series is None:
        raise ValorInvalido(f"La ficha {ficha} no se digita: sale del reporte DL 1153 de MINSA.")
    if serie not in series:
        raise ValorInvalido(f"La ficha {ficha} no tiene la parte «{serie}».")
    _validar_mes(anio, mes, hoy)
    _validar_cifra(numerador, "El numerador")
    _validar_cifra(denominador, "El denominador")
    if denominador == 0:
        raise ValorInvalido("El denominador no puede ser cero: sin denominador no hay indicador. Si no hay dato, no se registra.")
    actual = _fila(bd, "dl1153", ficha, serie, "hospital", anio, mes)
    if actual is not None and actual.origen == "minsa_excel":
        raise ValorInvalido("Ese mes ya lo publicó MINSA: la cifra oficial no se reemplaza a mano.")
    _escribir(bd, familia="dl1153", indicador=ficha, serie=serie, ambito="hospital", anio=anio, mes=mes, numerador=numerador, denominador=denominador,
              origen="digitado", fecha_corte=None, documento=_texto(documento, "El documento"), nota=_texto(nota, "La nota"), usuario_id=usuario_id)
    bd.flush()
    f = _fila(bd, "dl1153", ficha, serie, "hospital", anio, mes)
    return Registrado(f.id, f.familia, f.indicador, f.serie, f.ambito, f.mes, _numero(f.numerador), _numero(f.denominador), f.origen, f.fecha_corte, f.documento, f.nota)


def retirar(bd: Session, *, ficha: int, serie: str, anio: int, mes: int, hoy: date) -> None:
    fila = _fila(bd, "dl1153", ficha, serie, "hospital", anio, mes)
    if fila is None:
        raise ValorInvalido("No hay una cifra registrada en ese mes.")
    if fila.origen != "digitado":
        raise ValorInvalido("Esa cifra la publicó MINSA: no se retira a mano.")
    fila.fecha_eliminacion = datetime(hoy.year, hoy.month, hoy.day)


@dataclass(frozen=True)
class CambioDeFicha:
    ficha: int
    nuevas: int
    cambios: int
    iguales: int


def aplicar_reporte(bd: Session, reporte: Reporte, *, usuario_id: int | None, guardar: bool = True) -> list[CambioDeFicha]:
    """Guarda lo leído del reporte DL 1153, o con `guardar=False` solo dice qué cambiaría."""
    conteo: dict[int, list[int]] = {}
    for f in reporte.filas:
        c = conteo.setdefault(f.ficha, [0, 0, 0])
        if guardar:
            que = _escribir(bd, familia="dl1153", indicador=f.ficha, serie=f.serie, ambito=f.ambito, anio=reporte.anio, mes=f.mes, numerador=f.numerador, denominador=f.denominador,
                            origen="minsa_excel", fecha_corte=reporte.fecha_corte, documento=reporte.documento[:255], nota=None, usuario_id=usuario_id)
        else:
            actual = _fila(bd, "dl1153", f.ficha, f.serie, f.ambito, reporte.anio, f.mes)
            if actual is None:
                que = "nueva"
            else:
                que = "igual" if _numero(actual.numerador) == f.numerador and _numero(actual.denominador) == f.denominador else "cambio"
        c[{"nueva": 0, "cambio": 1, "igual": 2}[que]] += 1
    return [CambioDeFicha(k, *v) for k, v in sorted(conteo.items())]


# ============================================================== datos del mes


def datos_del_mes(bd: Session, *, anio: int) -> list[DatoDelMes]:
    d = DatoMes
    filas = bd.scalars(select(d).where(d.anio == anio, vigente(d)).order_by(d.mes, d.clave)).all()
    return [DatoDelMes(f.mes, f.clave, float(f.valor), f.origen, f.nota) for f in filas]


def guardar_dato(bd: Session, *, anio: int, mes: int, clave: str, valor: float | None, nota: str | None, usuario_id: int | None, hoy: date, origen: str = "digitado") -> None:
    """`valor` nulo borra lo escrito: el mes vuelve a no tener dato."""
    _validar_mes(anio, mes, hoy)
    clave = clave.strip()
    if not clave or len(clave) > 40:
        raise ValorInvalido("La clave del dato no es válida.")
    d = DatoMes
    fila = bd.scalar(select(d).where(d.anio == anio, d.mes == mes, d.clave == clave, vigente(d)))
    if valor is None:
        if fila is not None:
            fila.fecha_eliminacion = datetime(hoy.year, hoy.month, hoy.day)
        return
    _validar_cifra(valor, "El dato")
    decimal = Decimal(str(valor))
    if fila is None:
        bd.add(DatoMes(anio=anio, mes=mes, clave=clave, valor=decimal, origen=origen, nota=_texto(nota, "La nota"), usuario_id=usuario_id))
    else:
        fila.valor, fila.origen, fila.nota, fila.usuario_id = decimal, origen, _texto(nota, "La nota"), usuario_id


# ================================================================= compromisos


def avances(bd: Session, *, anio: int) -> list[Avance]:
    a = CompromisoAvance
    filas = bd.execute(
        select(a, Usuario).outerjoin(Usuario, Usuario.id == a.usuario_id).where(a.anio == anio, vigente(a)).order_by(a.compromiso, a.entregable)
    ).all()
    return [
        Avance(f.compromiso, f.entregable, f.estado, f.fecha_cumplimiento, f.evidencia, u.nombre_completo if u else None, f.fecha_actualizacion or f.fecha_creacion)
        for f, u in filas
    ]


def guardar_avance(bd: Session, *, anio: int, compromiso: int, entregable: str, estado: str, fecha_cumplimiento: date | None, evidencia: str | None, usuario_id: int, hoy: date) -> None:
    if not 35 <= compromiso <= 48:
        raise ValorInvalido("Los compromisos de mejora van del 35 al 48.")
    if estado not in ESTADOS_DE_COMPROMISO:
        raise ValorInvalido("El estado es pendiente, en curso o cumplido.")
    entregable = entregable.strip()
    if not entregable or len(entregable) > 40:
        raise ValorInvalido("El entregable no es válido.")
    if estado == "cumplido" and fecha_cumplimiento is None:
        raise ValorInvalido("Un entregable cumplido lleva la fecha en que se cumplió.")
    if fecha_cumplimiento is not None and fecha_cumplimiento > hoy:
        raise ValorInvalido("La fecha de cumplimiento no puede ser futura.")
    if estado != "cumplido":
        fecha_cumplimiento = None
    evidencia = _texto(evidencia, "La evidencia")
    a = CompromisoAvance
    fila = bd.scalar(select(a).where(a.anio == anio, a.compromiso == compromiso, a.entregable == entregable, vigente(a)))
    if fila is None:
        bd.add(CompromisoAvance(anio=anio, compromiso=compromiso, entregable=entregable, estado=estado, fecha_cumplimiento=fecha_cumplimiento, evidencia=evidencia, usuario_id=usuario_id))
    else:
        fila.estado, fila.fecha_cumplimiento, fila.evidencia, fila.usuario_id = estado, fecha_cumplimiento, evidencia, usuario_id
