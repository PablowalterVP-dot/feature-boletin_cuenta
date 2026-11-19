"""Consultas y escrituras de la carga del Excel: `reporte.carga`, `reporte.valor`,
`reporte.total_declarado`, `reporte.hallazgo` y la configuración de lectura del
formato. Solo acceso a datos; la orquestación vive en `servicios/cargas.py`.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.modelos import Carga, ConfiguracionLectura, Cuadro, FormatoVersion, Hallazgo, Indicador, ReglaValidacion, TotalDeclarado, Valor

# PostgreSQL admite como mucho 65 535 parámetros enlazados por sentencia. Una casilla
# lleva 9 columnas: en una sola sentencia caben unas 7 280. Nutrición manda 1 116, pero
# un área con más de ~235 indicadores diarios no cabría. Se inserta por lotes que dejan
# margen; cada lote es una sentencia, así que la bitácora resume en una fila por lote.
_MAXIMO_PARAMETROS = 65_535
_MARGEN = 0.9


def version_activa(bd: Session, formato_id: int) -> FormatoVersion | None:
    """La versión activa del formato, si hay alguna. Si hubiera más de una a la vez
    —no debería, pero la base no lo impide— esto no elige entre ellas con ningún
    criterio: es un problema de datos que se vería en otra parte."""
    return bd.scalar(select(FormatoVersion).where(FormatoVersion.formato_id == formato_id, FormatoVersion.estado == "activa", vigente(FormatoVersion)))


def configuracion_de(bd: Session, formato_version_id: int) -> dict:
    return bd.scalar(select(ConfiguracionLectura.configuracion).where(ConfiguracionLectura.formato_version_id == formato_version_id)) or {}


def cuadro_id_por_codigo(bd: Session, formato_version_id: int) -> dict[str, int]:
    return dict(bd.execute(select(Cuadro.codigo, Cuadro.id).where(Cuadro.formato_version_id == formato_version_id, vigente(Cuadro))).all())


def indicador_id_por_codigo(bd: Session, formato_id: int) -> dict[str, int]:
    return dict(bd.execute(select(Indicador.codigo, Indicador.id).where(Indicador.formato_id == formato_id, vigente(Indicador))).all())


def regla_id_por_codigo(bd: Session, formato_id: int) -> dict[str, int]:
    return dict(bd.execute(select(ReglaValidacion.codigo, ReglaValidacion.id).where(ReglaValidacion.formato_id == formato_id, vigente(ReglaValidacion))).all())


def filas_por_lote(columnas: int) -> int:
    """Cuántas filas de `columnas` columnas caben en una sentencia, con margen."""
    return max(1, int(_MAXIMO_PARAMETROS * _MARGEN) // max(1, columnas))


def _insertar_en_lotes(bd: Session, modelo, filas: list[dict]) -> None:
    """Inserta con **una sentencia por lote** (`.values(lista)`, no `execute(stmt,
    lista)`): con `app.carga_id` fijado, es lo que deja que el disparador de la base
    resuma la bitácora en una fila por sentencia en vez de una por casilla
    (`INFORME_AVANCE_04.md` § 2.3). Sin filas, no hace ninguna sentencia de más."""
    if not filas:
        return
    lote = filas_por_lote(len(filas[0]))
    for inicio in range(0, len(filas), lote):
        bd.execute(insert(modelo).values(filas[inicio : inicio + lote]))


def reemplazar_valores(bd: Session, reporte_id: int, filas: list[dict]) -> None:
    """Borra las casillas del reporte y escribe las nuevas. La re-subida reemplaza
    todo, también lo que se hubiera corregido a mano (avance 04 § 4)."""
    bd.execute(delete(Valor).where(Valor.reporte_id == reporte_id))
    _insertar_en_lotes(bd, Valor, filas)


def insertar_totales_declarados(bd: Session, filas: list[dict]) -> None:
    _insertar_en_lotes(bd, TotalDeclarado, filas)


def insertar_hallazgos(bd: Session, filas: list[dict]) -> None:
    _insertar_en_lotes(bd, Hallazgo, filas)


# ------------------------------------------------------ lo que se arrastra de antes


@dataclass(frozen=True)
class JustificacionPrevia:
    texto: str
    fecha: datetime | None
    usuario_id: int | None


def justificaciones_vigentes(bd: Session, reporte_id: int) -> dict[str, JustificacionPrevia]:
    """Las justificaciones escritas en la carga **vigente** del reporte, por clave de
    hallazgo. Se leen antes de reemplazarla: si el Excel nuevo vuelve a disparar el
    mismo aviso (misma clave), su justificación se conserva (decisión del 28/09/2026)."""
    filas = bd.execute(
        select(Hallazgo.clave_hallazgo, Hallazgo.justificacion, Hallazgo.fecha_justificacion, Hallazgo.usuario_justificacion_id)
        .join(Carga, Carga.id == Hallazgo.carga_id)
        .where(
            Carga.reporte_id == reporte_id, Carga.es_vigente, Carga.resultado == "aceptada", vigente(Carga),
            vigente(Hallazgo), Hallazgo.nivel == "aviso", Hallazgo.justificacion.is_not(None),
        )
    ).all()
    return {clave: JustificacionPrevia(texto, fecha, usuario) for clave, texto, fecha, usuario in filas if (texto or "").strip()}


def _como_numero(valor: Decimal) -> int | float:
    return int(valor) if valor == valor.to_integral_value() else float(valor)


def datos_para_bot(bd: Session, reporte_id: int, dias: int, *, mensual: bool = False) -> dict[str, dict]:
    """Las casillas de un reporte en la forma que entiende el bot. Diario:
    `{cuadro: {fila: [día 1, día 2, …]}}`, con `None` donde no hay dato. Mensual
    (Laboratorio): `{cuadro: {fila: cifra}}`. El código del indicador es
    `{cuadro}.{fila}` (`f1.asistencial.desayuno`, `bioquimica.glucosa.emergencia`):
    se parte en el primer punto. Lo usa la regla de variación, que compara con el
    mes anterior."""
    if mensual:
        filas = bd.execute(
            select(Indicador.codigo, Valor.valor)
            .join(Indicador, Indicador.id == Valor.indicador_id)
            .where(Valor.reporte_id == reporte_id, vigente(Valor), Valor.dia.is_(None))
        ).all()
        mes: dict[str, dict] = {}
        for codigo, valor in filas:
            cuadro, _, fila = codigo.partition(".")
            mes.setdefault(cuadro, {})[fila] = None if valor is None else _como_numero(valor)
        return mes

    filas = bd.execute(
        select(Indicador.codigo, Valor.dia, Valor.valor)
        .join(Indicador, Indicador.id == Valor.indicador_id)
        .where(Valor.reporte_id == reporte_id, vigente(Valor), Valor.dia.is_not(None))
    ).all()
    datos: dict[str, dict[str, list]] = {}
    for codigo, dia, valor in filas:
        cuadro, _, fila = codigo.partition(".")
        lista = datos.setdefault(cuadro, {}).setdefault(fila, [None] * dias)
        if valor is not None and 1 <= dia <= dias:
            lista[dia - 1] = _como_numero(valor)
    return datos
