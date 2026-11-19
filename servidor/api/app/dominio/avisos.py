"""Los avisos del sistema: qué debe saber cada persona sobre los reportes que le tocan.

**No se guardan: se derivan del estado** cada vez que se piden. Es la misma decisión que
`frontend/src/app/avisos.js` (CLAUDE.md § 4.3): una notificación que sobrevive al hecho
que la provocó —«su reporte está atrasado» cuando ya se envió— es peor que ninguna, y
derivarla hace imposible ese caso. Por eso no hay tabla de notificaciones ni cola: el
aviso desaparece en cuanto su condición deja de ser cierta.

Lo único que una lista guardada daría y esta no, el «leído», se resuelve con `fecha`:
cada aviso dice **cuándo ocurrió** lo que cuenta, y quien lo muestra lo compara con la
última vez que esa persona abrió el cajón. `fecha = None` significa que no se sabe, no
que sea viejo ni nuevo; no se inventa.

Tres ámbitos, como los tres tipos de usuario (CLAUDE.md § 3.3). Epidemiología reporta y
recibe, así que recibe avisos de los dos y la interfaz muestra los del ámbito activo.

Solo reglas: sin base de datos. Las filas las arma `servicios/avisos.py`.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from app.dominio import periodos
from app.dominio.consultas import DESACTUALIZADA, SIN_VALIDAR, VALIDADA, VENCIDO
from app.dominio.reloj import ZONA

AREA = "area"
ESTADISTICA = "estadistica"
OFICINA = "oficina"

# Los mismos cuatro tonos que el cajón del frontend (`TONOS` en avisos.js).
OK = "ok"
INFO = "info"
ADVERTENCIA = "warn"
CRITICO = "crit"

_ORDEN_DE_TONO = {CRITICO: 0, ADVERTENCIA: 1, INFO: 2, OK: 3}


@dataclass(frozen=True)
class Aviso:
    """Un aviso tal como se le entrega a una persona.

    - `clave`: estable mientras el hecho sea el mismo (`atraso|NUT|2026-08`). Sirve a la
      interfaz para no repetirlo y para recordar si ya se vio.
    - `tipo`: qué regla lo produjo. La interfaz elige el icono por el tipo: el backend no
      sabe de iconos.
    - `requiere_accion`: si a quien lo recibe le toca hacer algo, no solo enterarse.
    - `formato` y `periodo`: el reporte al que lleva, si es uno solo.
    """

    clave: str
    ambito: str
    tipo: str
    tono: str
    titulo: str
    detalle: str
    fecha: datetime | None
    requiere_accion: bool
    formato: str | None = None
    periodo: str | None = None


@dataclass(frozen=True)
class Renglon:
    """Un periodo × formato visible para quien pide (lo que da la lista de reportes),
    más la fecha de su último cambio de estado, si lo tuvo."""

    periodo: str
    formato: str
    formato_nombre: str
    unidad: str
    unidad_nombre: str
    estado: str
    semaforo: str
    dias_de_retraso: int | None
    fecha_limite: date
    fecha_envio: datetime | None
    fecha_validacion: datetime | None
    numero_rectificacion: int
    folio_constancia: str | None
    fecha_cambio: datetime | None = None


@dataclass(frozen=True)
class Recibido:
    """Un reporte que una oficina recibió (lo que dan sus recibidos)."""

    periodo: str
    formato: str
    unidad_nombre: str
    estado_de_recepcion: str
    constancia: str
    # La remisión más reciente; para «desactualizada», cuándo se reabrió.
    fecha: datetime | None


# ------------------------------------------------------------------ utilidades


def _plural(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def _fecha_corta(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _inicio_del_dia(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=ZONA)


def _vencio_el(fecha_limite: date) -> datetime:
    """El atraso empieza al día siguiente del plazo: el plazo incluye su último día."""
    return _inicio_del_dia(fecha_limite + timedelta(days=1))


def _mas_reciente(fechas: Iterable[datetime | None]) -> datetime | None:
    conocidas = [f for f in fechas if f is not None]
    return max(conocidas) if conocidas else None


def _lista(nombres: Iterable[str]) -> str:
    return ", ".join(nombres) + "."


# ---------------------------------------------------------------------- área


def avisos_de_area(renglones: Iterable[Renglon], vigente: str) -> list[Aviso]:
    """Para quien llena: lo atrasado (de cualquier mes de la ventana, porque una deuda no
    se olvida al cambiar de mes), lo reabierto para rectificar, y si el del mes ya llegó.
    Desde el 12/10/2026 no hay trámite después del envío (estados.py): un reporte
    enviado ya está en sus oficinas."""
    avisos = []
    for r in renglones:
        id_ = f"{r.formato}|{r.periodo}"
        mes = periodos.etiqueta(r.periodo)

        if r.semaforo == VENCIDO:
            empezado = r.estado == "borrador"
            avisos.append(Aviso(
                clave=f"atraso|{id_}", ambito=AREA, tipo="atraso",
                tono=ADVERTENCIA if r.periodo == vigente else CRITICO,
                titulo=f"El reporte de {mes} está atrasado.",
                detalle=f"{r.formato_nombre}: el plazo venció el {_fecha_corta(r.fecha_limite)}, hace {_plural(r.dias_de_retraso or 0, 'día', 'días')}. "
                + ("Hay un borrador empezado sin enviar." if empezado else "Todavía no se ha abierto."),
                fecha=_vencio_el(r.fecha_limite), requiere_accion=True, formato=r.formato, periodo=r.periodo,
            ))

        if r.estado == "borrador" and r.numero_rectificacion > 0:
            avisos.append(Aviso(
                clave=f"rectificacion|{id_}|{r.numero_rectificacion}", ambito=AREA, tipo="rectificacion", tono=ADVERTENCIA,
                titulo=f"El reporte de {mes} está reabierto para rectificar.",
                detalle="Las oficinas que lo recibieron tienen una versión desactualizada hasta que lo vuelva a enviar.",
                fecha=r.fecha_cambio, requiere_accion=True, formato=r.formato, periodo=r.periodo,
            ))

        if r.periodo == vigente and r.estado == "remitido":
            avisos.append(Aviso(
                clave=f"remitido|{id_}", ambito=AREA, tipo="remitido", tono=OK,
                titulo=f"El reporte de {mes} ya fue entregado.",
                detalle="Llegó validado por el bot a Estadística y a las oficinas que lo necesitan. El periodo está cerrado."
                + (f" Constancia {r.folio_constancia}." if r.folio_constancia else ""),
                fecha=r.fecha_envio or r.fecha_cambio, requiere_accion=False, formato=r.formato, periodo=r.periodo,
            ))
    return avisos


# ---------------------------------------------------------------- Estadística


def avisos_de_estadistica(renglones: Iterable[Renglon], vigente: str) -> list[Aviso]:
    """Para Estadística: agrupados, no uno por área. Sin validación ni remisión propias
    (12/10/2026), lo único que puede esperar es que un área entregue."""
    del_mes = [r for r in renglones if r.periodo == vigente]
    mes = periodos.etiqueta(vigente)
    avisos = []

    atrasados = [r for r in del_mes if r.semaforo == VENCIDO]
    if atrasados:
        avisos.append(Aviso(
            clave=f"atrasadas|{vigente}", ambito=ESTADISTICA, tipo="atrasadas", tono=CRITICO,
            titulo=f"{_plural(len(atrasados), 'reporte', 'reportes')} de {mes} sin entregar.",
            detalle=_lista(r.unidad_nombre for r in atrasados) + f" El plazo venció el {_fecha_corta(atrasados[0].fecha_limite)}.",
            fecha=_vencio_el(atrasados[0].fecha_limite), requiere_accion=False, periodo=vigente,
        ))
    return avisos


# --------------------------------------------------------------------- oficina


def avisos_de_oficina(oficina: str, recibidos: Iterable[Recibido], vigente: str) -> list[Aviso]:
    """Para quien recibe. Lo más importante es lo **desactualizado**: el área reabrió un
    periodo que la oficina ya tenía, y si no se entera, sigue usando cifras que van a
    cambiar (PLAN.md, punto 27)."""
    avisos = []
    for r in recibidos:
        id_ = f"{oficina}|{r.formato}|{r.periodo}"
        mes = periodos.etiqueta(r.periodo)
        if r.estado_de_recepcion == DESACTUALIZADA:
            avisos.append(Aviso(
                clave=f"desactualizado|{id_}", ambito=OFICINA, tipo="desactualizado", tono=ADVERTENCIA,
                titulo=f"{r.unidad_nombre} reabrió {mes} para rectificar.",
                detalle=f"Lo que recibió (constancia {r.constancia}) quedó desactualizado. Llegará una versión nueva cuando el área la vuelva a enviar.",
                fecha=r.fecha, requiere_accion=False, formato=r.formato, periodo=r.periodo,
            ))
        # «Sin validar» ya no se produce: desde el 12/10/2026 toda remisión nace
        # validada por el bot. Se conserva para una base que todavía no aplicó
        # `bd/flujo/01_entrega_directa.sql`.
        elif r.estado_de_recepcion == SIN_VALIDAR:
            avisos.append(Aviso(
                clave=f"sin_validar|{id_}", ambito=OFICINA, tipo="sin_validar", tono=INFO,
                titulo=f"Recibió {r.unidad_nombre} de {mes}, sin validar.",
                detalle="Es una entrega inmediata anterior al cambio de flujo: nadie llegó a verificar las cifras.",
                fecha=r.fecha, requiere_accion=False, formato=r.formato, periodo=r.periodo,
            ))
        elif r.estado_de_recepcion == VALIDADA and r.periodo == vigente:
            avisos.append(Aviso(
                clave=f"validado|{id_}", ambito=OFICINA, tipo="recibido", tono=OK,
                titulo=f"Recibió {r.unidad_nombre} de {mes}.",
                detalle=f"El área lo entregó al enviarlo, validado por el bot. Constancia {r.constancia}.",
                fecha=r.fecha, requiere_accion=False, formato=r.formato, periodo=r.periodo,
            ))
    return avisos


# ----------------------------------------------------------------------- orden


def ordenar(avisos: Iterable[Aviso]) -> list[Aviso]:
    """Lo grave primero; dentro de cada tono, lo más reciente primero (lo que no tiene
    fecha conocida, al final)."""
    sin_fecha = datetime.min.replace(tzinfo=ZONA)
    por_fecha = sorted(avisos, key=lambda a: a.fecha or sin_fecha, reverse=True)
    return sorted(por_fecha, key=lambda a: _ORDEN_DE_TONO[a.tono])
