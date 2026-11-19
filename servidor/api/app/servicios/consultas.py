"""Las listas de reportes: la general y los «recibidos» de una oficina.

Solo lectura: no abre transacción propia ni escribe nada.

Orden de las comprobaciones, que define el código HTTP:

    lista general:  sin reporte.ver en ninguna parte → 403; filtros incoherentes → 422
    recibidos:      la oficina no existe o no recibe → 404; sin reporte.ver sobre ella → 403;
                    filtros incoherentes → 422
"""

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.datos import consultas as repo
from app.datos import parametros as repo_parametros
from app.datos import reportes as repo_reportes
from app.dominio import consultas as reglas
from app.dominio import periodos, permisos, plazos
from app.dominio.reloj import Reloj, hoy as hoy_de
from app.dominio.sesion import Sesion
from app.dominio.transiciones import constancia_de_envio
from app.servicios.errores import NoEncontrado, SinPermiso

# El destino de la entrega que importa para el semáforo de esta lista: el
# área entrega SU reporte a Estadística (el plazo a Planeamiento, día 10, es
# otra cosa: alimenta las alertas, no esta lista — dominio/plazos.py).
_DESTINO_ENTREGA = "estadistica"


@dataclass(frozen=True)
class Pagina:
    total: int
    pagina: int
    por_pagina: int
    paginas: int


@dataclass(frozen=True)
class ItemDeLista:
    """Un periodo × formato tal como lo ve quien consulta."""

    periodo: str
    formato: str
    formato_nombre: str
    unidad: str
    unidad_nombre: str
    estado: str
    espera: str
    semaforo: str
    dias_de_retraso: int | None
    fecha_limite: date
    fecha_envio: datetime | None
    fecha_validacion: datetime | None
    numero_rectificacion: int
    folio_constancia: str | None


@dataclass(frozen=True)
class ListaDeReportes:
    pagina: Pagina
    filas: list[ItemDeLista]


@dataclass(frozen=True)
class RemisionDeRecibido:
    constancia: str
    es_sin_validar: bool
    es_vigente: bool
    numero_rectificacion: int
    fecha: datetime


@dataclass(frozen=True)
class ItemDeRecibido:
    """Un reporte recibido. **No** trae el estado del reporte: una oficina no ve si el
    área lo reabrió para rectificar, sino solo que lo que tiene está desactualizado."""

    periodo: str
    formato: str
    formato_nombre: str
    unidad: str
    unidad_nombre: str
    estado_de_recepcion: str
    constancia: str
    remisiones: list[RemisionDeRecibido]


@dataclass(frozen=True)
class ListaDeRecibidos:
    oficina: str
    pagina: Pagina
    filas: list[ItemDeRecibido]


def _pagina(total: int, pagina: int, por_pagina: int) -> Pagina:
    return Pagina(total, pagina, por_pagina, reglas.total_de_paginas(total, por_pagina))


# ------------------------------------------------------------ lista de reportes


def _estados_pedidos(estado: str | None, espera: str | None) -> tuple[str, ...] | None:
    """`estado` y `espera` juntos se cruzan: piden los estados que cumplen ambos."""
    if estado is None and espera is None:
        return None
    de_la_espera = None if espera is None else set(reglas.ESTADOS_DE_LA_ESPERA[espera])
    if estado is None:
        return tuple(de_la_espera or ())
    return (estado,) if de_la_espera is None or estado in de_la_espera else ()


def listar_reportes(
    bd: Session,
    sesion: Sesion,
    reloj: Reloj,
    *,
    periodo: str | None = None,
    desde: str | None = None,
    hasta: str | None = None,
    formato: str | None = None,
    estado: str | None = None,
    espera: str | None = None,
    pagina: int = 1,
    por_pagina: int = reglas.FILAS_POR_PAGINA,
) -> ListaDeReportes:
    """Un renglón por periodo × formato que la persona puede ver, más reciente primero,
    **exista o no el reporte** (un `no_iniciado` es justo lo que Estadística vigila).

    Nunca pasa del periodo vigente: los meses que no terminan no se reportan todavía. Y un
    reporte que no ha salido del área solo lo ve quien lo trabaja (ver `Visibilidad`).
    """
    if not sesion.puede_en_alguna(permisos.REPORTE_VER):
        raise SinPermiso("Su cuenta no puede ver reportes.", permiso=permisos.REPORTE_VER)
    hoy = hoy_de(reloj)
    desde, hasta = reglas.rango_pedido(periodo, desde, hasta)
    hasta = reglas.tope_de_periodo(hasta, hoy)

    total, filas = repo.listar_cumplimiento(
        bd, reglas.visibilidad_de(sesion), desde=desde, hasta=hasta, formato=formato,
        estados=_estados_pedidos(estado, espera), desplazamiento=reglas.desplazamiento(pagina, por_pagina), limite=por_pagina,
    )
    # El plazo real por área, no el genérico de v_cumplimiento (día 10 para
    # todas): una sola lectura de organizacion.parametro para toda la página.
    parametros_plazo = repo_parametros.valores(bd, plazos.PREFIJO)

    filas_de_salida = []
    for f in filas:
        dia = plazos.dia_de_entrega(parametros_plazo, f.unidad_codigo, _DESTINO_ENTREGA)
        fecha_limite = plazos.ajustar_a_dia_habil(periodos.plazo_de(f.periodo, dia), parametros_plazo)
        filas_de_salida.append(ItemDeLista(
            periodo=f.periodo, formato=f.formato, formato_nombre=f.formato_nombre, unidad=f.unidad, unidad_nombre=f.unidad_nombre,
            estado=f.estado, espera=reglas.espera_de(f.estado),
            semaforo=reglas.semaforo(f.fecha_envio, fecha_limite, hoy),
            dias_de_retraso=reglas.dias_de_retraso(f.fecha_envio, fecha_limite, hoy),
            fecha_limite=fecha_limite, fecha_envio=f.fecha_envio, fecha_validacion=f.fecha_validacion,
            numero_rectificacion=f.numero_rectificacion, folio_constancia=f.folio_constancia,
        ))
    return ListaDeReportes(_pagina(total, pagina, por_pagina), filas_de_salida)


# ----------------------------------------------------------------------- recibidos


def listar_recibidos(
    bd: Session,
    sesion: Sesion,
    *,
    clave: str,
    periodo: str | None = None,
    desde: str | None = None,
    hasta: str | None = None,
    formato: str | None = None,
    estado_de_recepcion: str | None = None,
    pagina: int = 1,
    por_pagina: int = reglas.FILAS_POR_PAGINA,
) -> ListaDeRecibidos:
    """Lo que una oficina recibió, uno por reporte. Exige `reporte.ver` **sobre esa
    oficina**: quien ve las recepciones de Planeamiento es Planeamiento (y quien tenga
    el permiso en todo el sistema), no otra oficina.

    Un borrador nunca aparece: solo hay recepción donde hubo una remisión.
    """
    oficina_id = repo_reportes.unidades_receptoras(bd, [clave]).get(clave)
    if oficina_id is None:
        raise NoEncontrado(f"«{clave}» no es una oficina que reciba reportes.", que="oficina")
    if not sesion.puede(permisos.REPORTE_VER, clave):
        raise SinPermiso(f"Su cuenta no puede ver lo que recibió «{clave}».", permiso=permisos.REPORTE_VER, unidad=clave)
    desde, hasta = reglas.rango_pedido(periodo, desde, hasta)

    total, filas = repo.listar_recibidos(
        bd, oficina_id, desde=desde, hasta=hasta, formato=formato, estado_de_recepcion=estado_de_recepcion,
        desplazamiento=reglas.desplazamiento(pagina, por_pagina), limite=por_pagina,
    )
    items = []
    for f in filas:
        # De más nueva a más vieja: primero lo vigente, luego la rectificación más alta.
        remisiones = sorted(f.remisiones, key=lambda r: (r.es_vigente, r.numero_rectificacion, r.fecha), reverse=True)
        vistas = [
            RemisionDeRecibido(constancia_de_envio(f.periodo, f.sigla, r.numero_rectificacion), r.es_sin_validar, r.es_vigente, r.numero_rectificacion, r.fecha)
            for r in remisiones
        ]
        items.append(
            ItemDeRecibido(
                periodo=f.periodo, formato=f.formato, formato_nombre=f.formato_nombre, unidad=f.unidad, unidad_nombre=f.unidad_nombre,
                estado_de_recepcion=reglas.estado_de_recepcion(reglas.RemisionVista(r.es_vigente, r.es_sin_validar) for r in remisiones),
                constancia=vistas[0].constancia, remisiones=vistas,
            )
        )
    return ListaDeRecibidos(clave, _pagina(total, pagina, por_pagina), items)
