"""Lo que Planeamiento escribe de las actividades operativas del POI.

La cifra de cada mes se calcula en la interfaz con los reportes de las áreas;
aquí se guarda solo lo que Planeamiento escribe encima: una cifra donde no hay
cálculo, o un ajuste donde sí lo hay. Si el ajuste necesita nota lo decide la
interfaz, que conoce el catálogo; la base no lo conoce y solo exige el código
con la forma de CEPLAN.

No se registra un mes que todavía no empieza: su ejecución no existe.
"""

import math
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Usuario
from app.datos.modelos.planeamiento import EjecucionActividad

CODIGO = re.compile(r"AOI\d{11}")
NOTA_MAXIMA = 1000


class ValorInvalido(ValueError):
    """La cifra, el mes o el código no se pueden guardar; el mensaje dice por qué."""


@dataclass(frozen=True)
class Registro:
    codigo: str
    mes: str  # «06», como lo usa la interfaz
    valor: float
    nota: str | None
    usuario: str | None
    fecha: datetime


def _validar(anio: int, codigo: str, mes: int, hoy: date) -> None:
    if not CODIGO.fullmatch(codigo):
        raise ValorInvalido(f"«{codigo}» no es un código de actividad operativa (AOI y 11 dígitos).")
    if not 1 <= mes <= 12:
        raise ValorInvalido("El mes va de 1 a 12.")
    if (anio, mes) > (hoy.year, hoy.month):
        raise ValorInvalido("Ese mes todavía no empieza: no tiene ejecución que registrar.")


def _a_registro(fila: EjecucionActividad, nombre: str | None) -> Registro:
    return Registro(
        codigo=fila.codigo_actividad, mes=f"{fila.mes:02d}", valor=float(fila.valor), nota=fila.nota,
        usuario=nombre, fecha=fila.fecha_actualizacion or fila.fecha_creacion,
    )


def registros(bd: Session, *, anio: int) -> list[Registro]:
    e = EjecucionActividad
    # `nombre_completo` es una propiedad de Python, no una columna: se trae la cuenta.
    filas = bd.execute(
        select(e, Usuario).outerjoin(Usuario, Usuario.id == e.usuario_id)
        .where(e.anio == anio, vigente(e)).order_by(e.codigo_actividad, e.mes)
    ).all()
    return [_a_registro(fila, usuario.nombre_completo if usuario else None) for fila, usuario in filas]


def guardar(bd: Session, *, anio: int, codigo: str, mes: int, valor: float, nota: str | None, usuario_id: int, hoy: date) -> Registro:
    _validar(anio, codigo, mes, hoy)
    if not math.isfinite(valor) or valor < 0:
        raise ValorInvalido("La ejecución es una cifra de cero en adelante.")
    nota = (nota or "").strip() or None
    if nota and len(nota) > NOTA_MAXIMA:
        raise ValorInvalido(f"La nota no puede pasar de {NOTA_MAXIMA} caracteres.")
    e = EjecucionActividad
    fila = bd.scalar(select(e).where(e.anio == anio, e.codigo_actividad == codigo, e.mes == mes, vigente(e)))
    if fila is None:
        fila = EjecucionActividad(anio=anio, codigo_actividad=codigo, mes=mes, valor=Decimal(str(valor)), nota=nota, usuario_id=usuario_id)
        bd.add(fila)
    else:
        fila.valor, fila.nota, fila.usuario_id = Decimal(str(valor)), nota, usuario_id
    bd.flush()
    bd.refresh(fila)
    usuario = bd.get(Usuario, usuario_id)
    return _a_registro(fila, usuario.nombre_completo if usuario else None)


def borrar(bd: Session, *, anio: int, codigo: str, mes: int, hoy: date) -> bool:
    """Borrado lógico: el mes vuelve a su cálculo, o a «por digitar». Devuelve si
    había algo que borrar."""
    _validar(anio, codigo, mes, hoy)
    e = EjecucionActividad
    resultado = bd.execute(
        update(e).where(e.anio == anio, e.codigo_actividad == codigo, e.mes == mes, vigente(e)).values(fecha_eliminacion=datetime.now().astimezone())
    )
    return resultado.rowcount > 0
