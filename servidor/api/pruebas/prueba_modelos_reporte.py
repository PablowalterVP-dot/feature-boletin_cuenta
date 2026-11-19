"""Los modelos de `formato` y `reporte` leyendo y escribiendo la base de Alejandro."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError

from app.datos.base import vigente
from app.datos.modelos import (
    Archivo,
    Carga,
    Cumplimiento,
    EstadoReporte,
    Formato,
    FormatoVersion,
    Periodo,
    Permiso,
    ReglaValidacion,
    Remision,
    Reporte,
    ReporteHistorialEstado,
    TransicionEstado,
    UnidadOrganica,
)

pytestmark = pytest.mark.bd


def estado(sesion, codigo: str) -> EstadoReporte:
    return sesion.scalar(select(EstadoReporte).where(EstadoReporte.codigo == codigo))


def nut(sesion) -> Formato:
    return sesion.scalar(select(Formato).where(Formato.codigo == "NUT"))


def periodo(sesion, mes=8) -> Periodo:
    return sesion.scalar(select(Periodo).where(Periodo.anio == 2026, Periodo.mes == mes))


def nuevo_reporte(sesion, mes=8, estado_codigo="borrador", **extra) -> Reporte:
    r = Reporte(formato_id=nut(sesion).id, periodo_id=periodo(sesion, mes).id, estado_reporte_id=estado(sesion, estado_codigo).id, **extra)
    sesion.add(r)
    sesion.flush()
    return r


def planeamiento_id(sesion) -> int:
    return sesion.scalar(select(UnidadOrganica.id).where(UnidadOrganica.codigo == "PLA"))


# ------------------------------------------------------------ la semilla, leída por los modelos


def prueba_los_dos_estados_guardados_y_ninguno_es_no_iniciado(sesion):
    """Tras bd/flujo/01_entrega_directa.sql (12/10/2026): sin los intermedios."""
    estados = sesion.scalars(select(EstadoReporte).where(vigente(EstadoReporte)).order_by(EstadoReporte.orden)).all()
    assert [e.codigo for e in estados] == ["borrador", "remitido"]
    assert [e.codigo for e in estados if e.es_final] == ["remitido"]


def prueba_las_dos_transiciones_guardadas_con_su_permiso(sesion):
    filas = sesion.execute(
        select(TransicionEstado.accion, EstadoReporte.codigo, Permiso.codigo)
        .join(EstadoReporte, EstadoReporte.id == TransicionEstado.estado_origen_id)
        .join(Permiso, Permiso.id == TransicionEstado.permiso_id)
        .where(vigente(TransicionEstado))
    ).all()
    assert len(filas) == 2
    assert {(a, o) for a, o, _ in filas} == {("enviar", "borrador"), ("rectificar", "remitido")}
    assert dict((a, p) for a, _, p in filas)["rectificar"] == "reporte.rectificar"


def prueba_el_formato_de_nutricion_es_de_su_unidad_y_diario(sesion):
    f = nut(sesion)
    unidad = sesion.get(UnidadOrganica, f.unidad_organica_id)
    assert (unidad.clave, unidad.codigo, f.granularidad, f.periodicidad, f.es_activo) == ("nutricion", "NUT", "diaria", "mensual", True)


def prueba_la_estructura_de_nutricion_esta_en_configuracion_y_no_hay_ninguna_activa(sesion):
    versiones = sesion.scalars(select(FormatoVersion).where(vigente(FormatoVersion))).all()
    assert [(v.codigo_version, v.estado) for v in versiones] == [("NUT-1", "en_configuracion")]


def prueba_las_reglas_del_bot_de_nutricion(sesion):
    reglas = sesion.scalars(select(ReglaValidacion).where(vigente(ReglaValidacion), ReglaValidacion.formato_id == nut(sesion).id)).all()
    assert len(reglas) == 7
    por_nivel = {n: sorted(r.codigo for r in reglas if r.nivel == n) for n in ("error", "aviso", "info")}
    assert por_nivel["error"] == ["entero", "incompleto", "no-numerico", "totales"]
    assert por_nivel["aviso"] == ["atipico", "variacion"]
    assert por_nivel["info"] == ["filas-iguales"]
    assert next(r for r in reglas if r.codigo == "atipico").parametros == {"factor_mediana": 3, "diferencia_minima": 15}


# ------------------------------------------------------------------ un reporte, escrito


def prueba_un_reporte_nuevo_nace_sin_folio_sin_estructura_y_sin_rectificaciones(sesion):
    r = nuevo_reporte(sesion)
    sesion.refresh(r)
    assert (r.numero_rectificacion, r.folio_constancia, r.formato_version_id, r.fecha_envio) == (0, None, None, None)
    assert r.fecha_creacion is not None and r.fecha_eliminacion is None


def prueba_solo_hay_un_reporte_vigente_por_formato_y_periodo(sesion):
    nuevo_reporte(sesion)
    with pytest.raises(DBAPIError, match="uq_reporte_formato_periodo"):
        with sesion.begin_nested():
            nuevo_reporte(sesion)


def prueba_un_reporte_eliminado_deja_crear_otro_del_mismo_periodo(sesion):
    viejo = nuevo_reporte(sesion)
    viejo.fecha_eliminacion = func.now()
    sesion.flush()
    nuevo_reporte(sesion)  # el índice único solo cuenta los vigentes


def prueba_el_folio_de_constancia_es_unico_en_toda_la_tabla(sesion):
    nuevo_reporte(sesion, 7, folio_constancia="CR-2026-07-NUT")
    with pytest.raises(DBAPIError, match="uq_reporte_folio"):
        with sesion.begin_nested():
            nuevo_reporte(sesion, 8, folio_constancia="CR-2026-07-NUT")


def prueba_el_historial_se_escribe_desde_el_backend_y_su_fecha_la_pone_la_bd(sesion):
    r = nuevo_reporte(sesion)
    sesion.add(ReporteHistorialEstado(reporte_id=r.id, estado_origen_id=None, estado_destino_id=r.estado_reporte_id, accion="crear"))
    sesion.flush()
    h = sesion.scalar(select(ReporteHistorialEstado).where(ReporteHistorialEstado.reporte_id == r.id))
    sesion.refresh(h)
    assert h.estado_origen_id is None and h.numero_rectificacion == 0 and h.comentario is None
    assert h.fecha_creacion is not None  # la llenó el disparador de control


def prueba_una_remision_nace_vigente_y_no_marcada_como_sin_validar(sesion):
    r = nuevo_reporte(sesion)
    rem = Remision(reporte_id=r.id, unidad_destino_id=planeamiento_id(sesion))
    sesion.add(rem)
    sesion.flush()
    sesion.refresh(rem)
    assert (rem.es_vigente, rem.es_sin_validar, rem.numero_rectificacion) == (True, False, 0)
    assert rem.fecha_remision is not None


def prueba_solo_hay_una_remision_vigente_por_reporte_destino_y_tipo(sesion):
    r = nuevo_reporte(sesion)
    pla = planeamiento_id(sesion)
    sesion.add(Remision(reporte_id=r.id, unidad_destino_id=pla))
    sesion.flush()
    with pytest.raises(DBAPIError, match="uq_remision_vigente"):
        with sesion.begin_nested():
            sesion.add(Remision(reporte_id=r.id, unidad_destino_id=pla))
            sesion.flush()
    # La sin validar (entrega inmediata) y la validada pueden convivir para el mismo destino…
    sesion.add(Remision(reporte_id=r.id, unidad_destino_id=pla, es_sin_validar=True))
    sesion.flush()
    # …y una superada (no vigente) no cuenta.
    sesion.add(Remision(reporte_id=r.id, unidad_destino_id=pla, es_vigente=False))
    sesion.flush()


# ------------------------------------------------------- lo que la BD sí impone sobre las cargas


def _archivo(sesion) -> Archivo:
    a = Archivo(nombre_original="Nutricion_2026-08.xlsx", ruta_almacenamiento="cargas/2026/08/NUT/x.xlsx", tamano_bytes=82311, huella_sha256="ab" * 32, proposito="carga")
    sesion.add(a)
    sesion.flush()
    return a


def prueba_sin_una_version_activa_la_bd_rechaza_toda_carga_aceptada(sesion):
    """Por eso, con el catálogo tal como se instala, ningún reporte puede llegar a
    tener una carga aceptada y `enviar` responde 409."""
    r = nuevo_reporte(sesion)
    version = sesion.scalar(select(FormatoVersion).where(FormatoVersion.codigo_version == "NUT-1"))
    with pytest.raises(DBAPIError, match="no es una versión activa"):
        with sesion.begin_nested():
            sesion.add(Carga(reporte_id=r.id, archivo_id=_archivo(sesion).id, formato_version_id=version.id, resultado="aceptada", es_vigente=True))
            sesion.flush()


def prueba_una_carga_bloqueada_si_se_guarda_y_no_puede_ser_vigente(sesion):
    r = nuevo_reporte(sesion)
    sesion.add(Carga(reporte_id=r.id, archivo_id=_archivo(sesion).id, resultado="bloqueada", codigo_bloqueo="estructura_no_reconocida"))
    sesion.flush()
    c = sesion.scalar(select(Carga).where(Carga.reporte_id == r.id))
    sesion.refresh(c)
    assert (c.resultado, c.es_vigente, c.total_errores, c.formato_version_id) == ("bloqueada", False, 0, None)
    with pytest.raises(DBAPIError, match="ck_carga_vigente"):
        with sesion.begin_nested():
            c.es_vigente = True  # solo una carga aceptada puede ser vigente
            sesion.flush()


# -------------------------------------------------------- la vista de cumplimiento


def prueba_la_vista_trae_un_renglon_por_periodo_y_formato_exista_o_no_el_reporte(sesion):
    filas = sesion.scalars(select(Cumplimiento).order_by(Cumplimiento.mes)).all()
    assert len(filas) == 12 and {f.formato_codigo for f in filas} == {"NUT"}
    assert {f.estado for f in filas} == {"no_iniciado"} and {f.espera for f in filas} == {"area"}
    assert all(f.reporte_id is None and f.fecha_envio is None for f in filas)


def prueba_la_vista_trae_tambien_los_periodos_futuros(sesion):
    """Por eso el servicio limita la lista al periodo vigente: sin ese corte, octubre a
    diciembre saldrían como «pendientes» aunque todavía no se puedan reportar."""
    assert sorted(sesion.scalars(select(Cumplimiento.mes))) == list(range(1, 13))


def prueba_un_reporte_aparece_en_su_renglon_con_su_estado_y_quien_lo_espera(sesion):
    nuevo_reporte(sesion, 8, "enviado", folio_constancia="CR-2026-08-NUT")
    fila = sesion.scalar(select(Cumplimiento).where(Cumplimiento.mes == 8))
    assert (fila.estado, fila.espera) == ("enviado", "estadistica") and fila.reporte_id is not None
    assert fila.fecha_limite_entrega.isoformat() == "2026-09-10"


def prueba_la_vista_es_de_solo_lectura(sesion):
    with pytest.raises(RuntimeError, match="vista de solo lectura"):
        sesion.add(Cumplimiento(periodo_id=1, formato_id=1, anio=2026, mes=1, unidad_codigo="X", unidad_nombre="X", formato_codigo="X", estado="x", espera="x", semaforo="x", fecha_limite_entrega=None))
        sesion.flush()
    sesion.rollback()
