"""Reglas de las transiciones de un reporte, sin base de datos.

La **fuente de verdad** de qué transiciones existen y qué permiso exige cada una es
`reporte.transicion_estado` de la BD (`estados.py` es su copia para el contrato con el
frontend). Aquí se decide con lo que el servicio ya leyó: recibe las transiciones
como datos y devuelve una decisión o lanza un error de dominio.

Cada error de dominio lleva un `codigo` estable (para que la interfaz lo distinga) y
un mensaje en español. La API lo traduce a un código HTTP; este módulo no sabe de HTTP.

La base de datos **no** impone nada de esto: un `UPDATE` puede llevar un reporte de
`borrador` a `remitido` sin pasar por el bot, y enviar uno sin ninguna carga.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from app.dominio import estados, folios, periodos

CREAR = "crear"


# ------------------------------------------------------------------- errores


class ErrorDeTransicion(Exception):
    """Base de los errores de dominio: `codigo` estable + mensaje para la persona."""

    codigo = "error_de_transicion"

    def __init__(self, mensaje: str, **datos):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.datos = datos


class AccionDesconocida(ErrorDeTransicion):
    codigo = "accion_desconocida"


class EstadoNoPermite(ErrorDeTransicion):
    codigo = "estado_no_permite"


class ReporteYaExiste(ErrorDeTransicion):
    codigo = "reporte_ya_existe"


class SinCargaAceptada(ErrorDeTransicion):
    codigo = "sin_carga_aceptada"


class SinVersionActiva(ErrorDeTransicion):
    """El formato no tiene ninguna `formato_version` en estado `activa`: no hay con
    qué reconocer un archivo, así que no vale la pena llamar al bot."""

    codigo = "sin_version_activa"


class ReporteNoEditable(ErrorDeTransicion):
    """El reporte existe y no está en `borrador`: la re-subida solo vale mientras se
    llena o justo después de una rectificación."""

    codigo = "reporte_no_editable"


class ArchivoDemasiadoGrande(ErrorDeTransicion):
    codigo = "archivo_demasiado_grande"


class VersionInconsistente(ErrorDeTransicion):
    """El bot reconoció una versión (`plantilla.version`) que aquí no existe o no
    está activa. No debería pasar si el bot lee la `configuracion` que se le envió;
    si pasa, es una inconsistencia real entre el bot y la base, no algo que se
    resuelve adivinando cuál versión usar."""

    codigo = "version_inconsistente"


class PeriodoFuturo(ErrorDeTransicion):
    codigo = "periodo_futuro"


class HallazgosBloquean(ErrorDeTransicion):
    codigo = "hallazgos_bloquean_el_envio"


class HallazgoNoJustificable(ErrorDeTransicion):
    """Solo un aviso se justifica. Un error se corrige (subiendo otro Excel) y un
    info no exige nada."""

    codigo = "hallazgo_no_justificable"


# --------------------------------------------------------------------- datos


@dataclass(frozen=True)
class TransicionBD:
    """Una fila de `reporte.transicion_estado`, ya con los códigos en lugar de ids."""

    accion: str
    origen: str
    destino: str
    permiso: str


@dataclass(frozen=True)
class HallazgoVisto:
    """Lo que interesa de un hallazgo del bot para decidir si se puede enviar."""

    clave: str
    nivel: str  # error, aviso, info
    titulo: str
    justificacion: str | None


# ------------------------------------------------------ qué procede desde un estado


def resolver(transiciones: Iterable[TransicionBD], estado_actual: str, accion: str) -> TransicionBD:
    """La transición que corresponde a `accion` desde `estado_actual`.

    `crear` no es una transición guardada (no está en `transicion_estado`): la
    resuelve `resolver_crear`. Lanza `AccionDesconocida` si la acción no existe en
    ningún estado y `EstadoNoPermite` si existe pero no desde este.
    """
    todas = list(transiciones)
    de_la_accion = [t for t in todas if t.accion == accion]
    if not de_la_accion:
        raise AccionDesconocida(f"La acción «{accion}» no existe.", accion=accion)
    for t in de_la_accion:
        if t.origen == estado_actual:
            return t
    validas = sorted({t.origen for t in de_la_accion})
    raise EstadoNoPermite(
        f"No se puede «{accion}» un reporte en estado «{estado_actual}»; solo desde: {', '.join(validas)}.",
        accion=accion,
        estado=estado_actual,
        desde=validas,
    )


def resolver_crear(estado_actual: str) -> None:
    """`crear` solo procede si el reporte no existe: su ausencia es `no_iniciado`."""
    if estado_actual != estados.NO_INICIADO:
        raise ReporteYaExiste(
            f"Ya existe un reporte de este periodo (estado «{estado_actual}»).",
            estado=estado_actual,
        )


def acciones_disponibles(transiciones: Iterable[TransicionBD], estado_actual: str) -> list[str]:
    """Las acciones que la máquina permite desde un estado (sin mirar permisos)."""
    if estado_actual == estados.NO_INICIADO:
        return [CREAR]
    return sorted({t.accion for t in transiciones if t.origen == estado_actual})


# -------------------------------------------------------------------- periodos


def comprobar_periodo_creable(periodo: str, hoy: date) -> None:
    """Un reporte no se abre para un periodo posterior al vigente (el mes cerrado):
    en septiembre se reporta agosto, y septiembre todavía no terminó."""
    vigente = periodos.periodo_vigente(hoy)
    if periodo > vigente:
        raise PeriodoFuturo(
            f"El periodo {periodo} todavía no se puede reportar: el vigente es {vigente}.",
            periodo=periodo,
            vigente=vigente,
        )


# ---------------------------------------------------------------------- envío


def numero_de_envio(numero_rectificacion: int) -> int:
    """El primer envío es el 1; tras cada rectificación, un reenvío sube uno."""
    return numero_rectificacion + 1


def constancia_de_envio(periodo: str, sigla: str, numero_rectificacion: int) -> str:
    """`CR-2026-08-NUT` para el primer envío, `CR-2026-08-NUT-2` para el segundo…
    La constancia es lo que ve la oficina: cada envío debe tener la suya, y un
    reenvío tras rectificar no puede repetir la del primero."""
    return folios.constancia(periodo, sigla, numero_de_envio(numero_rectificacion))


"""Cómo empieza la justificación de un error que se deja tal cual en una carga
histórica (decisión del 27/10/2026): el oficio original no cuadra, el documento
no dice qué cifra está mal y se decidió entregar las cifras como llegaron, sin
inventar ninguna. Solo la escribe `cargar_historico` (un operador con acceso a
la base): la API no deja justificar un error (`revision.justificar`), así que
para un área un error sigue bloqueando el envío."""
PREFIJO_ERROR_DOCUMENTADO = "Carga histórica: inconsistencia del oficio original, no corregida."


def es_error_documentado(h: HallazgoVisto) -> bool:
    return h.nivel == "error" and (h.justificacion or "").startswith(PREFIJO_ERROR_DOCUMENTADO)


def comprobar_se_puede_enviar(hay_carga_aceptada: bool, hallazgos: Iterable[HallazgoVisto]) -> None:
    """Las condiciones de negocio para enviar, que la base no comprueba:

    1. hay una carga vigente aceptada (sin Excel leído no hay nada que enviar);
    2. ningún hallazgo de nivel `error` (lo que no cuadra no sale del área: la
       revisión del bot es la validación del reporte), salvo uno documentado
       en una carga histórica (`PREFIJO_ERROR_DOCUMENTADO`);
    3. todo `aviso` tiene su justificación escrita (la leen Estadística y las
       oficinas, que reciben el reporte al mismo tiempo).
    """
    if not hay_carga_aceptada:
        raise SinCargaAceptada("El reporte no tiene ningún Excel aceptado: suba el archivo antes de enviarlo.")

    vistos = list(hallazgos)
    errores = [h for h in vistos if h.nivel == "error" and not es_error_documentado(h)]
    sin_justificar = [h for h in vistos if h.nivel == "aviso" and not (h.justificacion or "").strip()]
    if errores or sin_justificar:
        partes = []
        if errores:
            partes.append(f"{len(errores)} {'error' if len(errores) == 1 else 'errores'} por corregir")
        if sin_justificar:
            partes.append(f"{len(sin_justificar)} {'aviso' if len(sin_justificar) == 1 else 'avisos'} sin justificar")
        raise HallazgosBloquean(
            "No se puede enviar: " + " y ".join(partes) + ".",
            errores=[{"clave": h.clave, "titulo": h.titulo} for h in errores],
            avisos_sin_justificar=[{"clave": h.clave, "titulo": h.titulo} for h in sin_justificar],
        )


# ------------------------------------------------------------- texto del historial


def nota_de_historial(accion: str, *, constancia: str | None = None, destinos: Iterable[str] | None = None,
                      numero_rectificacion: int = 0, comentario: str | None = None) -> str:
    """El texto que queda en `reporte_historial_estado.comentario`.

    Siempre lleva algo: una línea estándar de la acción y, si la persona escribió un
    comentario, a continuación. En `rectificar` el comentario es opcional pero **queda
    registrado siempre**, con el número de rectificación.
    """
    extra = (comentario or "").strip()
    if accion == CREAR:
        base = "Abre el reporte del periodo."
    elif accion == "enviar":
        oficinas = sorted(destinos or [])
        base = f"Entregado, validado por el bot, a Estadística{' y a: ' + ', '.join(oficinas) if oficinas else ''}. Constancia {constancia}."
    elif accion == "rectificar":
        base = f"Reabierto para rectificación (n.º {numero_rectificacion}). Las oficinas que ya lo recibieron quedan con una versión desactualizada."
    else:
        base = f"Acción «{accion}»."
    return f"{base} {extra}".strip() if extra else base
