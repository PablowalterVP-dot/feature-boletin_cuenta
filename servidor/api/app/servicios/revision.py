"""La revisión de un reporte: lo que encontró el bot en la carga vigente y las
justificaciones de los avisos.

    revision_de   el informe del bot tal como se guardó, con los hallazgos y sus
                  justificaciones. Es lo que la interfaz necesita para volver a pintar la
                  pantalla de revisión después de recargar, sin llamarle al bot otra vez.
    justificar    escribe (o borra) la justificación de un aviso.

Un aviso exige justificación antes de enviar (`dominio.transiciones.comprobar_se_puede_enviar`).
Hasta el 28/09/2026 no había cómo guardarla: la interfaz la tenía solo en memoria, y un
Excel con un solo aviso no se podía enviar nunca.

Solo se justifica un **aviso**: un error se corrige subiendo otro Excel (la única vía de
corrección, decisión del 28/09/2026) y un info no exige nada.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from app.datos import reportes as repo
from app.datos.base import vigente
from app.datos.modelos import Archivo, Cuadro, FormatoVersion, Hallazgo, Indicador
from app.dominio import estados, permisos
from app.dominio import transiciones as reglas
from app.dominio.reloj import Reloj
from app.dominio.sesion import Sesion
from app.servicios.acceso import buscar_formato_y_unidad, buscar_periodo, reporte_legible
from app.servicios.errores import NoEncontrado, SinPermiso


@dataclass(frozen=True)
class HallazgoDeRevision:
    clave: str
    nivel: str  # error, aviso, info
    titulo: str
    detalle: str | None
    cuadro: str | None
    indicador: str | None
    dia: int | None
    justificacion: str | None
    fecha_justificacion: datetime | None


@dataclass(frozen=True)
class CargaDeRevision:
    archivo: str
    fecha: datetime
    version: str | None
    version_bot: str | None
    casillas_leidas: int | None
    informe: dict | None


@dataclass(frozen=True)
class Revision:
    formato: str
    unidad: str
    periodo: str
    estado: str
    carga: CargaDeRevision | None  # nula: todavía no hay un Excel aceptado
    hallazgos: list[HallazgoDeRevision]


def _hallazgos(bd: Session, carga_id: int) -> list[HallazgoDeRevision]:
    cuadro, indicador = aliased(Cuadro), aliased(Indicador)
    filas = bd.execute(
        select(
            Hallazgo.clave_hallazgo, Hallazgo.nivel, Hallazgo.titulo, Hallazgo.detalle, cuadro.codigo, indicador.codigo,
            Hallazgo.dia, Hallazgo.justificacion, Hallazgo.fecha_justificacion,
        )
        .outerjoin(cuadro, cuadro.id == Hallazgo.cuadro_id)
        .outerjoin(indicador, indicador.id == Hallazgo.indicador_id)
        .where(Hallazgo.carga_id == carga_id, vigente(Hallazgo))
        .order_by(Hallazgo.id)
    ).all()
    return [HallazgoDeRevision(*f) for f in filas]


def revision_de(bd: Session, sesion: Sesion, *, formato: str, periodo: str) -> Revision:
    """La carga vigente y sus hallazgos. La lee quien puede leer el reporte
    (`servicios/acceso.py`). Sin reporte, o sin un Excel aceptado todavía, `carga` es
    nula y no hay hallazgos."""
    legible = reporte_legible(bd, sesion, formato=formato, periodo=periodo)
    base = dict(formato=legible.formato.codigo, unidad=legible.unidad.clave, periodo=periodo, estado=legible.estado)
    carga = repo.carga_aceptada_vigente(bd, legible.reporte) if legible.reporte else None
    if carga is None:
        return Revision(**base, carga=None, hallazgos=[])

    archivo = bd.get(Archivo, carga.archivo_id)
    version = bd.get(FormatoVersion, carga.formato_version_id) if carga.formato_version_id else None
    return Revision(
        **base,
        carga=CargaDeRevision(
            archivo=archivo.nombre_original, fecha=carga.fecha_creacion, version=version.codigo_version if version else None,
            version_bot=carga.version_bot, casillas_leidas=carga.casillas_leidas, informe=carga.informe_bot,
        ),
        hallazgos=_hallazgos(bd, carga.id),
    )


def justificar(bd: Session, sesion: Sesion, reloj: Reloj, *, formato: str, periodo: str, clave: str, texto: str | None) -> HallazgoDeRevision:
    """Guarda la justificación de un aviso de la carga vigente. Un texto vacío la borra.

    Mismo orden de comprobaciones que una transición: formato (404), permiso
    `reporte.cargar` sobre el área (403), periodo (404), la fila del reporte bloqueada,
    que esté en borrador (409), que tenga un Excel aceptado (409), que el hallazgo exista
    (404) y que sea un aviso (422). No confirma: el endpoint hace un solo `commit()`."""
    el_formato, la_unidad = buscar_formato_y_unidad(bd, formato)
    if not sesion.puede(permisos.REPORTE_CARGAR, la_unidad.clave):
        raise SinPermiso(
            f"Su cuenta no tiene el permiso «{permisos.REPORTE_CARGAR}» sobre {la_unidad.nombre_corto or la_unidad.nombre}.",
            permiso=permisos.REPORTE_CARGAR, unidad=la_unidad.clave,
        )
    el_periodo = buscar_periodo(bd, periodo)

    reporte = repo.bloquear_reporte(bd, el_formato.id, el_periodo.id)
    codigo_de = {v: k for k, v in repo.ids_de_estados(bd).items()}
    estado = codigo_de[reporte.estado_reporte_id] if reporte else estados.NO_INICIADO
    if not estados.es_editable(estado):
        raise reglas.ReporteNoEditable(
            f"El reporte está en «{estado}»: las justificaciones solo se escriben mientras se llena.", estado=estado,
        )
    carga = repo.carga_aceptada_vigente(bd, reporte)
    if carga is None:
        raise reglas.SinCargaAceptada("El reporte no tiene ningún Excel aceptado: no hay avisos que justificar.")

    hallazgo = bd.scalar(select(Hallazgo).where(Hallazgo.carga_id == carga.id, Hallazgo.clave_hallazgo == clave, vigente(Hallazgo)))
    if hallazgo is None:
        raise NoEncontrado(f"El Excel vigente no tiene el hallazgo «{clave}».", que="hallazgo")
    if hallazgo.nivel != "aviso":
        raise reglas.HallazgoNoJustificable(
            "Solo un aviso se justifica. Un error se corrige subiendo el Excel corregido; un info no exige nada.",
            clave=clave, nivel=hallazgo.nivel,
        )

    limpio = (texto or "").strip() or None
    hallazgo.justificacion = limpio
    hallazgo.fecha_justificacion = reloj.ahora() if limpio else None
    hallazgo.usuario_justificacion_id = sesion.usuario_id if limpio else None
    bd.flush()

    return next(h for h in _hallazgos(bd, carga.id) if h.clave == clave)
