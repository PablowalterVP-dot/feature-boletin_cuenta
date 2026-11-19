"""Las transiciones de un reporte y su consulta.

Orquesta lo que ninguna otra capa hace: la base de datos de Alejandro **no** impone la
máquina de estados ni comprueba nada antes de enviar; aquí se hace, en una sola
transacción y con la fila del reporte bloqueada.

Orden de las comprobaciones (cada una corta a las siguientes, y define el código HTTP):

    1. la acción existe                       → 404
    2. el formato existe                      → 404
    3. la cuenta tiene el permiso sobre su unidad → 403   (antes de revelar si hay reporte)
    4. el periodo existe                      → 404
    5. `SELECT … FOR UPDATE` del reporte
    6. la máquina de estados permite la acción desde su estado → 409
    7. las condiciones propias de la acción   → 409 / 422
    8. los efectos, el historial y un `flush()` que hace saltar cualquier error de la BD

El servicio **no confirma**: el endpoint hace un solo `commit()` al final, para que la
auditoría (`app.usuario_id`, válido solo durante la transacción) alcance a todo.
"""

from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.datos import reportes as repo
from app.datos.modelos import ReporteHistorialEstado, Remision, UnidadOrganica
from app.dominio import estados, permisos
from app.dominio import transiciones as reglas
from app.dominio.reloj import Reloj, hoy as hoy_de
from app.dominio.sesion import Sesion
from app.dominio.transiciones import CREAR, TransicionBD
from app.servicios.acceso import buscar_formato_y_unidad, buscar_periodo, reporte_legible
from app.servicios.errores import SinPermiso


@dataclass(frozen=True)
class RemisionCreada:
    destino: str
    es_sin_validar: bool


@dataclass(frozen=True)
class Resultado:
    """Lo que ocurrió al transicionar."""

    formato: str
    periodo: str
    accion: str
    estado_origen: str
    estado_destino: str
    numero_rectificacion: int
    constancia: str | None
    nota: str
    remisiones: list[RemisionCreada] = field(default_factory=list)


@dataclass(frozen=True)
class Detalle:
    """El estado de un reporte tal como lo ve quien puede verlo."""

    formato: str
    unidad: str
    periodo: str
    estado: str
    numero_rectificacion: int
    folio_constancia: str | None
    fecha_envio: datetime | None
    fecha_validacion: datetime | None
    tiene_carga_aceptada: bool
    hallazgos: dict[str, int]
    acciones_disponibles: list[str]
    historial: list[dict]
    remisiones: list[dict]


# ------------------------------------------------------------------ utilidades


def _permiso_de(accion: str, transiciones: list[TransicionBD]) -> str:
    """El permiso que exige una acción. `crear` no está en `transicion_estado`
    (es el INSERT del reporte) y exige `reporte.cargar`."""
    if accion == CREAR:
        return permisos.REPORTE_CARGAR
    exigidos = sorted({t.permiso for t in transiciones if t.accion == accion})
    if not exigidos:
        raise reglas.AccionDesconocida(f"La acción «{accion}» no existe.", accion=accion)
    return exigidos[0]




# ----------------------------------------------------------------- transicionar


def transicionar(
    bd: Session,
    sesion: Sesion,
    reloj: Reloj,
    *,
    formato: str,
    periodo: str,
    accion: str,
    comentario: str | None = None,
) -> Resultado:
    transiciones = repo.leer_transiciones(bd)  # la BD es la fuente de verdad
    permiso = _permiso_de(accion, transiciones)

    el_formato, la_unidad = buscar_formato_y_unidad(bd, formato)
    if not sesion.puede(permiso, la_unidad.clave):
        raise SinPermiso(
            f"Su cuenta no tiene el permiso «{permiso}» sobre {la_unidad.nombre_corto or la_unidad.nombre}.",
            permiso=permiso,
            unidad=la_unidad.clave,
        )
    el_periodo = buscar_periodo(bd, periodo)

    hoy = hoy_de(reloj)
    ids = repo.ids_de_estados(bd)
    codigo_de = {v: k for k, v in ids.items()}

    # ---- crear: el reporte todavía no existe
    if accion == CREAR:
        reglas.comprobar_periodo_creable(periodo, hoy)
        existente = repo.bloquear_reporte(bd, el_formato.id, el_periodo.id)
        if existente is not None:
            reglas.resolver_crear(codigo_de[existente.estado_reporte_id])  # lanza ReporteYaExiste
        nuevo = repo.insertar_reporte_si_no_existe(bd, el_formato.id, el_periodo.id, ids[estados.BORRADOR])
        if nuevo is None:  # otra persona lo creó entre la lectura y la escritura
            carrera = repo.bloquear_reporte(bd, el_formato.id, el_periodo.id)
            reglas.resolver_crear(codigo_de[carrera.estado_reporte_id])
            raise AssertionError("el reporte debería existir")  # pragma: no cover
        nota = reglas.nota_de_historial(CREAR, comentario=comentario)
        bd.add(ReporteHistorialEstado(reporte_id=nuevo.id, estado_origen_id=None, estado_destino_id=ids[estados.BORRADOR], accion=CREAR, numero_rectificacion=0, comentario=nota))
        bd.flush()
        return Resultado(el_formato.codigo, periodo, CREAR, estados.NO_INICIADO, estados.BORRADOR, 0, None, nota)

    # ---- las demás: el reporte debe existir y se bloquea su fila
    reporte = repo.bloquear_reporte(bd, el_formato.id, el_periodo.id)
    estado_actual = codigo_de[reporte.estado_reporte_id] if reporte is not None else estados.NO_INICIADO
    transicion = reglas.resolver(transiciones, estado_actual, accion)  # 409 si el estado no lo permite
    assert reporte is not None  # `no_iniciado` no admite ninguna transición guardada: resolver ya lanzó

    remisiones: list[RemisionCreada] = []
    constancia: str | None = None
    destinos_entregados: list[str] = []

    if accion == "enviar":
        carga = repo.carga_aceptada_vigente(bd, reporte)
        hallazgos = repo.hallazgos_de(bd, carga.id) if carga is not None else []
        reglas.comprobar_se_puede_enviar(carga is not None, hallazgos)
        constancia = reglas.constancia_de_envio(periodo, la_unidad.codigo, reporte.numero_rectificacion)
        ahora = reloj.ahora()
        reporte.folio_constancia = constancia
        reporte.fecha_envio = ahora
        reporte.usuario_envio_id = sesion.usuario_id
        # Entrega directa (12/10/2026): el bot ya validó, así que el envío ES la
        # validación —por eso la fecha— y llega a la vez a todas las oficinas de la
        # matriz vigente. Nadie de Estadística la validó: `usuario_validacion_id`
        # queda vacío, no se le atribuye a una persona.
        reporte.fecha_validacion = ahora
        reporte.usuario_validacion_id = None
        for d in repo.matriz_de(bd, la_unidad.id, hoy):
            bd.add(Remision(reporte_id=reporte.id, unidad_destino_id=d.unidad_id, numero_rectificacion=reporte.numero_rectificacion, es_sin_validar=False, usuario_remision_id=sesion.usuario_id))
            remisiones.append(RemisionCreada(d.clave, False))
            destinos_entregados.append(d.clave)

    elif accion == "rectificar":
        # Todo lo entregado queda desactualizado (queda como prueba de qué recibió cada oficina).
        repo.superar_remisiones(bd, reporte.id)
        reporte.numero_rectificacion += 1
        # Una validación anterior no vale para lo que se va a corregir; el historial la conserva.
        reporte.fecha_validacion = None
        reporte.usuario_validacion_id = None

    reporte.estado_reporte_id = ids[transicion.destino]
    nota = reglas.nota_de_historial(
        accion, constancia=constancia, destinos=destinos_entregados,
        numero_rectificacion=reporte.numero_rectificacion, comentario=comentario,
    )
    bd.add(ReporteHistorialEstado(reporte_id=reporte.id, estado_origen_id=ids[transicion.origen], estado_destino_id=ids[transicion.destino], accion=accion, numero_rectificacion=reporte.numero_rectificacion, comentario=nota))
    bd.flush()  # que cualquier error de la base salte aquí, antes de confirmar

    return Resultado(el_formato.codigo, periodo, accion, transicion.origen, transicion.destino, reporte.numero_rectificacion, reporte.folio_constancia, nota, remisiones)


# ---------------------------------------------------------------------- detalle


def detalle(bd: Session, sesion: Sesion, *, formato: str, periodo: str) -> Detalle:
    """El estado de un reporte. Sin reporte responde `no_iniciado`: su ausencia ES el estado.

    Lo lee quien tiene `reporte.ver` sobre el área (lo que no salió del área, solo quien lo
    trabaja) o la oficina que tiene una remisión vigente del reporte (`servicios/acceso.py`)."""
    legible = reporte_legible(bd, sesion, formato=formato, periodo=periodo)
    el_formato, la_unidad, reporte, estado = legible.formato, legible.unidad, legible.reporte, legible.estado
    transiciones = repo.leer_transiciones(bd)

    # Solo las acciones que el estado permite Y que esta cuenta puede hacer sobre esta unidad.
    acciones = [a for a in reglas.acciones_disponibles(transiciones, estado) if sesion.puede(_permiso_de(a, transiciones), la_unidad.clave)]

    carga = repo.carga_aceptada_vigente(bd, reporte) if reporte else None
    vistos = repo.hallazgos_de(bd, carga.id) if carga else []
    resumen = {
        "errores": sum(1 for h in vistos if h.nivel == "error"),
        "avisos": sum(1 for h in vistos if h.nivel == "aviso"),
        "avisos_sin_justificar": sum(1 for h in vistos if h.nivel == "aviso" and not (h.justificacion or "").strip()),
        "info": sum(1 for h in vistos if h.nivel == "info"),
    }
    historial = [
        {"accion": a, "estado_origen": o, "estado_destino": d, "numero_rectificacion": n, "comentario": c, "fecha": f}
        for a, o, d, n, c, f in (repo.historial_de(bd, reporte.id) if reporte else [])
    ]
    remisiones = [
        {"destino": d, "es_sin_validar": sv, "es_vigente": v, "numero_rectificacion": n, "fecha": f}
        for d, sv, v, n, f in (repo.remisiones_de(bd, reporte.id) if reporte else [])
    ]
    return Detalle(
        formato=el_formato.codigo, unidad=la_unidad.clave, periodo=periodo, estado=estado,
        numero_rectificacion=reporte.numero_rectificacion if reporte else 0,
        folio_constancia=reporte.folio_constancia if reporte else None,
        fecha_envio=reporte.fecha_envio if reporte else None,
        fecha_validacion=reporte.fecha_validacion if reporte else None,
        tiene_carga_aceptada=carga is not None, hallazgos=resumen, acciones_disponibles=acciones, historial=historial, remisiones=remisiones,
    )

