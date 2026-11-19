"""El servicio de transiciones contra la base de Alejandro.

Cada prueba corre en una transacción que se deshace. El camino feliz de `enviar` monta
antes el catálogo de EJEMPLO de Nutrición (ver `escenario.py`): con la base tal como se
instala no hay versión activa y ninguna carga se puede aceptar.
"""

import pytest
from sqlalchemy import select

import escenario as e
from app.datos import reportes as repo
from app.datos.modelos import Remision, Reporte
from app.dominio import estados, permisos
from app.dominio.reloj import RelojFijo
from app.dominio.transiciones import (
    AccionDesconocida,
    EstadoNoPermite,
    HallazgosBloquean,
    PeriodoFuturo,
    ReporteYaExiste,
    SinCargaAceptada,
)
from app.servicios.errores import NoEncontrado, SinPermiso
from app.servicios.transiciones import detalle, transicionar

pytestmark = pytest.mark.bd

RELOJ = RelojFijo(e.AHORA)
AVISO = ("aviso", "atipico|f3|liquida.cena|21", "100 raciones: el resto del mes ronda las 10", None)


@pytest.fixture
def dig(sesion):
    return e.digitador_de_nutricion(sesion)


@pytest.fixture
def rev(sesion):
    return e.revisor_de_estadistica(sesion)


def ir(sesion, actor, accion, periodo="2026-08", formato="NUT", **extra):
    return transicionar(sesion, actor, RELOJ, formato=formato, periodo=periodo, accion=accion, **extra)


def avanzar(sesion, dig, rev, hasta: str, hallazgos=()):
    """Lleva el reporte de agosto hasta un estado, por el camino legítimo."""
    ir(sesion, dig, "crear")
    if hasta == "borrador":
        e.dar_carga_aceptada(sesion, e.reporte_de(sesion), hallazgos)
        return e.reporte_de(sesion)
    e.dar_carga_aceptada(sesion, e.reporte_de(sesion), hallazgos)
    ir(sesion, dig, "enviar")  # deja el reporte remitido: no hay otro camino
    return e.reporte_de(sesion)


def estado_de(sesion) -> str:
    r = e.reporte_de(sesion)
    if r is None:
        return estados.NO_INICIADO
    return {v: k for k, v in e.ids_de(sesion).items()}[r.estado_reporte_id]


def historial(sesion):
    return repo.historial_de(sesion, e.reporte_de(sesion).id)


def vigentes(sesion):
    return [r for r in repo.remisiones_de(sesion, e.reporte_de(sesion).id) if r[2]]


# -------------------------------------------------------------------- crear


def prueba_crear_abre_un_borrador_con_su_historial(sesion, dig):
    r = ir(sesion, dig, "crear")
    assert (r.estado_origen, r.estado_destino, r.numero_rectificacion, r.constancia) == ("no_iniciado", "borrador", 0, None)
    assert estado_de(sesion) == "borrador"
    (fila,) = historial(sesion)
    accion, origen, destino, n, nota, fecha = fila
    assert (accion, origen, destino, n, nota) == ("crear", None, "borrador", 0, "Abre el reporte del periodo.")
    assert fecha is not None  # la pone el disparador de la BD


def prueba_crear_no_admite_periodos_posteriores_al_vigente(sesion, dig):
    with pytest.raises(PeriodoFuturo) as error:
        ir(sesion, dig, "crear", periodo="2026-09")  # hoy es 13 de septiembre: el vigente es agosto
    assert error.value.datos["vigente"] == "2026-08"
    assert e.reporte_de(sesion, 9) is None


def prueba_crear_dos_veces_da_reporte_ya_existe(sesion, dig):
    ir(sesion, dig, "crear")
    with pytest.raises(ReporteYaExiste) as error:
        ir(sesion, dig, "crear")
    assert error.value.datos["estado"] == "borrador"
    assert len(historial(sesion)) == 1  # el segundo intento no dejó rastro


def prueba_crear_exige_reporte_cargar_sobre_la_unidad_del_formato(sesion, rev):
    with pytest.raises(SinPermiso) as error:
        ir(sesion, rev, "crear")  # el revisor de Estadística no carga reportes
    assert error.value.datos == {"permiso": permisos.REPORTE_CARGAR, "unidad": "nutricion"}
    de_imagenes = e.sesion_de(e.crear_usuario(sesion, "dig.dxi"), e.asignacion(sesion, "digitador", "imagenes"))
    with pytest.raises(SinPermiso):
        ir(sesion, de_imagenes, "crear")  # tiene el permiso, pero en otra unidad
    assert e.reporte_de(sesion) is None


def prueba_un_formato_o_un_periodo_que_no_existen_son_404_y_no_se_confunden(sesion, dig):
    with pytest.raises(NoEncontrado) as f:
        ir(sesion, dig, "crear", formato="XXX")
    assert f.value.datos["que"] == "formato"
    with pytest.raises(NoEncontrado) as p:
        ir(sesion, dig, "crear", periodo="2025-12")  # no está en organizacion.periodo (solo 2026)
    assert p.value.datos["que"] == "periodo"
    for malo in ("2026-8", "agosto", "2026-13", ""):
        with pytest.raises(NoEncontrado):
            ir(sesion, dig, "crear", periodo=malo)


def prueba_el_codigo_del_formato_no_distingue_mayusculas(sesion, dig):
    assert ir(sesion, dig, "crear", formato="nut").formato == "NUT"


def prueba_una_accion_que_no_existe_es_404_aunque_la_cuenta_no_tenga_permisos(sesion, dig):
    with pytest.raises(AccionDesconocida):
        ir(sesion, dig, "devolver")


# ------------------------------------------------------------------- enviar


def prueba_enviar_entrega_a_la_matriz_con_constancia_fecha_usuario_e_historial(sesion, dig, rev):
    """12/10/2026: enviar ES la validación (la hizo el bot) y entrega a la vez a
    Estadística y a las oficinas de la matriz."""
    avanzar(sesion, dig, rev, "borrador")
    r = ir(sesion, dig, "enviar")
    reporte = e.reporte_de(sesion)
    assert (r.estado_origen, r.estado_destino, r.constancia) == ("borrador", "remitido", "CR-2026-08-NUT")
    assert reporte.folio_constancia == "CR-2026-08-NUT"
    assert reporte.fecha_envio == e.AHORA  # gobierna el reloj inyectable
    assert reporte.usuario_envio_id == dig.usuario_id
    assert reporte.fecha_validacion == e.AHORA and reporte.usuario_validacion_id is None  # lo validó el bot, no una persona
    assert historial(sesion)[-1][0:4] == ("enviar", "borrador", "remitido", 0)
    assert "Constancia CR-2026-08-NUT." in historial(sesion)[-1][4] and "planeamiento" in historial(sesion)[-1][4]
    # Nutrición → Planeamiento: llega ya validada, en el mismo envío.
    assert [(d, sv, v) for d, sv, v, *_ in repo.remisiones_de(sesion, reporte.id)] == [("planeamiento", False, True)]
    assert [(x.destino, x.es_sin_validar) for x in r.remisiones] == [("planeamiento", False)]


def prueba_sin_carga_aceptada_no_se_envia_y_no_cambia_nada(sesion, dig):
    ir(sesion, dig, "crear")
    with pytest.raises(SinCargaAceptada):
        ir(sesion, dig, "enviar")
    reporte = e.reporte_de(sesion)
    assert estado_de(sesion) == "borrador" and reporte.folio_constancia is None and reporte.fecha_envio is None
    assert len(historial(sesion)) == 1 and repo.remisiones_de(sesion, reporte.id) == []


def prueba_una_carga_que_no_es_vigente_no_cuenta(sesion, dig):
    ir(sesion, dig, "crear")
    e.dar_carga_aceptada(sesion, e.reporte_de(sesion), vigente=False)
    with pytest.raises(SinCargaAceptada):
        ir(sesion, dig, "enviar")


def prueba_una_carga_vigente_sin_estructura_en_el_reporte_no_cuenta(sesion, dig):
    ir(sesion, dig, "crear")
    reporte = e.reporte_de(sesion)
    e.dar_carga_aceptada(sesion, reporte)
    reporte.formato_version_id = None
    sesion.flush()
    with pytest.raises(SinCargaAceptada):
        ir(sesion, dig, "enviar")


def prueba_un_error_del_bot_bloquea_el_envio(sesion, dig):
    ir(sesion, dig, "crear")
    e.dar_carga_aceptada(sesion, e.reporte_de(sesion), [("error", "incompleto|f1", "Faltan 12 casillas", None)])
    with pytest.raises(HallazgosBloquean) as error:
        ir(sesion, dig, "enviar")
    assert error.value.datos["errores"] == [{"clave": "incompleto|f1", "titulo": "Faltan 12 casillas"}]
    assert estado_de(sesion) == "borrador"
    assert repo.remisiones_de(sesion, e.reporte_de(sesion).id) == []  # nada llegó a ninguna oficina


def prueba_un_error_no_se_salva_con_una_justificacion(sesion, dig):
    ir(sesion, dig, "crear")
    e.dar_carga_aceptada(sesion, e.reporte_de(sesion), [("error", "incompleto|f1", "Faltan casillas", "Lo explico")])
    with pytest.raises(HallazgosBloquean):
        ir(sesion, dig, "enviar")


def prueba_un_aviso_sin_justificar_bloquea_y_uno_justificado_no(sesion, dig):
    from app.datos.modelos import Hallazgo

    ir(sesion, dig, "crear")
    e.dar_carga_aceptada(sesion, e.reporte_de(sesion), [AVISO, ("aviso", "variacion|f3", "Baja 24 %", "  ")])
    with pytest.raises(HallazgosBloquean) as error:
        ir(sesion, dig, "enviar")
    assert len(error.value.datos["avisos_sin_justificar"]) == 2  # el vacío y el en blanco
    for hallazgo in sesion.scalars(select(Hallazgo)):
        hallazgo.justificacion = "Simulacro del día 21."
    sesion.flush()
    assert ir(sesion, dig, "enviar").estado_destino == "remitido"


def prueba_la_informacion_no_bloquea_y_lo_eliminado_no_cuenta(sesion, dig):
    from sqlalchemy import func

    from app.datos.modelos import Hallazgo

    ir(sesion, dig, "crear")
    e.dar_carga_aceptada(sesion, e.reporte_de(sesion), [("info", "filas-iguales|f1", "Dos comidas iguales", None), ("error", "totales|f2", "No suma", None)])
    sesion.scalar(select(Hallazgo).where(Hallazgo.nivel == "error")).fecha_eliminacion = func.now()  # lo borró el revisor
    sesion.flush()
    assert ir(sesion, dig, "enviar").estado_destino == "remitido"


def prueba_los_hallazgos_de_una_carga_anterior_no_cuentan(sesion, dig):
    """Al recargar el Excel, la carga nueva es la vigente: lo que halló la vieja ya no aplica."""
    ir(sesion, dig, "crear")
    reporte = e.reporte_de(sesion)
    vieja = e.dar_carga_aceptada(sesion, reporte, [("error", "incompleto|f1", "Faltan casillas", None)])
    vieja.es_vigente = False
    sesion.flush()
    e.dar_carga_aceptada(sesion, reporte)  # la nueva, sin hallazgos
    assert ir(sesion, dig, "enviar").estado_destino == "remitido"


def prueba_enviar_exige_reporte_enviar_sobre_la_unidad(sesion, dig, rev):
    avanzar(sesion, dig, rev, "borrador")
    with pytest.raises(SinPermiso):
        ir(sesion, rev, "enviar")  # Estadística no envía: recibe
    de_imagenes = e.sesion_de(e.crear_usuario(sesion, "dig.dxi"), e.asignacion(sesion, "digitador", "imagenes"))
    with pytest.raises(SinPermiso):
        ir(sesion, de_imagenes, "enviar")
    consulta = e.consulta_de_planeamiento(sesion)
    with pytest.raises(SinPermiso):
        ir(sesion, consulta, "enviar")
    assert estado_de(sesion) == "borrador"


# --------------------------------------------- la máquina de estados que la BD no impone


ORIGENES = ["borrador", "remitido"]
PERMITIDAS = {"borrador": {"enviar"}, "remitido": {"rectificar"}}
PROHIBIDAS = [(o, a) for o in ORIGENES for a in ("enviar", "rectificar") if a not in PERMITIDAS[o]]


@pytest.mark.parametrize("origen, accion", PROHIBIDAS)
def prueba_no_se_pueden_saltar_estados_aunque_la_base_lo_permita(sesion, dig, rev, origen, accion):
    """`UPDATE reporte SET estado = …` no se lo impide a la base; al backend sí."""
    avanzar(sesion, dig, rev, origen)
    antes = (estado_de(sesion), len(historial(sesion)), len(repo.remisiones_de(sesion, e.reporte_de(sesion).id)))
    actor = dig if accion == "enviar" else rev
    with pytest.raises(EstadoNoPermite) as error:
        ir(sesion, actor, accion)
    assert error.value.datos["estado"] == origen
    assert (estado_de(sesion), len(historial(sesion)), len(repo.remisiones_de(sesion, e.reporte_de(sesion).id))) == antes  # nada cambió


@pytest.mark.parametrize("accion", ["enviar", "rectificar"])
def prueba_un_reporte_que_no_existe_no_admite_ninguna_transicion(sesion, dig, rev, accion):
    with pytest.raises(EstadoNoPermite) as error:
        ir(sesion, dig if accion == "enviar" else rev, accion)
    assert error.value.datos["estado"] == "no_iniciado"
    assert e.reporte_de(sesion) is None  # y no se creó uno por error


@pytest.mark.parametrize("accion", ["revisar", "validar", "remitir"])
def prueba_estadistica_ya_no_revisa_valida_ni_remite(sesion, dig, rev, accion):
    """bd/flujo/01_entrega_directa.sql retiró esas transiciones: ya no existen."""
    avanzar(sesion, dig, rev, "remitido")
    with pytest.raises(AccionDesconocida):
        ir(sesion, rev, accion)
    assert estado_de(sesion) == "remitido"


# --------------------------------------------------------------------- rectificar


def prueba_rectificar_reabre_como_borrador_y_deja_desactualizado_lo_entregado(sesion, dig, rev):
    avanzar(sesion, dig, rev, "remitido")
    r = ir(sesion, rev, "rectificar")
    reporte = e.reporte_de(sesion)
    assert (r.estado_destino, r.numero_rectificacion, estado_de(sesion)) == ("borrador", 1, "borrador")
    assert vigentes(sesion) == []  # nadie tiene ya una versión vigente…
    assert len(repo.remisiones_de(sesion, reporte.id)) == 1  # …pero la entrega queda como prueba de qué recibió la oficina
    assert reporte.folio_constancia == "CR-2026-08-NUT" and reporte.fecha_envio == e.AHORA  # el envío original se conserva
    assert reporte.fecha_validacion is None and reporte.usuario_validacion_id is None  # la validación anterior ya no vale


def prueba_rectificar_registra_siempre_su_nota_con_o_sin_comentario(sesion, dig, rev):
    avanzar(sesion, dig, rev, "remitido")
    ir(sesion, rev, "rectificar")
    sin_comentario = historial(sesion)[-1]
    assert sin_comentario[0:4] == ("rectificar", "remitido", "borrador", 1)
    assert "n.º 1" in sin_comentario[4] and "versión desactualizada" in sin_comentario[4]

    e.dar_carga_aceptada(sesion, e.reporte_de(sesion), vigente=False)  # (el reporte reabierto puede recargar; aquí no importa)
    ir(sesion, dig, "enviar")
    ir(sesion, rev, "rectificar", comentario="Llegó una corrección del día 21.")
    con_comentario = historial(sesion)[-1]
    assert con_comentario[3] == 2 and con_comentario[4].endswith("Llegó una corrección del día 21.") and "n.º 2" in con_comentario[4]


def prueba_solo_estadistica_rectifica(sesion, dig, rev):
    avanzar(sesion, dig, rev, "remitido")
    with pytest.raises(SinPermiso):
        ir(sesion, dig, "rectificar")
    assert estado_de(sesion) == "remitido"


def prueba_enviar_rectificar_y_reenviar_da_una_constancia_distinta(sesion, dig, rev):
    """El bug del prototipo: la constancia salía siempre igual y un reenvío repetía la del primero."""
    avanzar(sesion, dig, rev, "remitido")
    assert e.reporte_de(sesion).folio_constancia == "CR-2026-08-NUT"
    ir(sesion, rev, "rectificar")
    segundo = ir(sesion, dig, "enviar")
    assert segundo.constancia == "CR-2026-08-NUT-2" and e.reporte_de(sesion).folio_constancia == "CR-2026-08-NUT-2"
    ir(sesion, rev, "rectificar")
    assert ir(sesion, dig, "enviar").constancia == "CR-2026-08-NUT-3"


def prueba_el_ciclo_completo_deja_el_historial_y_una_sola_remision_vigente(sesion, dig, rev):
    avanzar(sesion, dig, rev, "remitido")
    ir(sesion, rev, "rectificar")
    ir(sesion, dig, "enviar")
    acciones = [(a, n) for a, _, _, n, *_ in historial(sesion)]
    assert acciones == [("crear", 0), ("enviar", 0), ("rectificar", 1), ("enviar", 1)]
    todas = repo.remisiones_de(sesion, e.reporte_de(sesion).id)
    assert [(sv, v, n) for _, sv, v, n, _ in todas] == [(False, False, 0), (False, True, 1)]
    assert len(vigentes(sesion)) == 1  # una sola vigente por destino, y es la de la 2.ª versión


def prueba_el_historial_va_en_orden_y_cada_paso_nombra_de_donde_viene(sesion, dig, rev):
    avanzar(sesion, dig, rev, "remitido")
    pasos = [(a, o, d) for a, o, d, *_ in historial(sesion)]
    assert pasos == [("crear", None, "borrador"), ("enviar", "borrador", "remitido")]


# --------------------------------------------------------------------- detalle


def prueba_sin_reporte_el_detalle_es_no_iniciado_con_crear_disponible_solo_para_el_area(sesion, dig, rev):
    d = detalle(sesion, dig, formato="NUT", periodo="2026-08")
    assert (d.estado, d.numero_rectificacion, d.folio_constancia, d.historial, d.remisiones, d.tiene_carga_aceptada) == ("no_iniciado", 0, None, [], [], False)
    assert d.acciones_disponibles == ["crear"]
    assert detalle(sesion, rev, formato="NUT", periodo="2026-08").acciones_disponibles == []  # Estadística no crea


def prueba_las_acciones_disponibles_son_las_del_estado_y_las_que_la_cuenta_puede(sesion, dig, rev):
    avanzar(sesion, dig, rev, "borrador")
    assert detalle(sesion, dig, formato="NUT", periodo="2026-08").acciones_disponibles == ["enviar"]
    ir(sesion, dig, "enviar")
    assert detalle(sesion, dig, formato="NUT", periodo="2026-08").acciones_disponibles == []
    assert detalle(sesion, rev, formato="NUT", periodo="2026-08").acciones_disponibles == ["rectificar"]


def prueba_el_detalle_resume_los_hallazgos_de_la_carga_vigente(sesion, dig, rev):
    avanzar(sesion, dig, rev, "borrador", hallazgos=[AVISO, ("error", "incompleto|f1", "Faltan casillas", None), ("info", "filas-iguales|f1", "Iguales", None)])
    d = detalle(sesion, dig, formato="NUT", periodo="2026-08")
    assert d.tiene_carga_aceptada and d.hallazgos == {"errores": 1, "avisos": 1, "avisos_sin_justificar": 1, "info": 1}


def prueba_el_detalle_trae_historial_remisiones_constancia_y_fechas(sesion, dig, rev):
    avanzar(sesion, dig, rev, "remitido")
    d = detalle(sesion, rev, formato="NUT", periodo="2026-08")
    assert (d.estado, d.folio_constancia, d.fecha_envio, d.fecha_validacion, d.unidad) == ("remitido", "CR-2026-08-NUT", e.AHORA, e.AHORA, "nutricion")
    assert [h["accion"] for h in d.historial] == ["crear", "enviar"]
    assert [(r["destino"], r["es_sin_validar"], r["es_vigente"]) for r in d.remisiones] == [("planeamiento", False, True)]
    assert d.acciones_disponibles == ["rectificar"]


def prueba_ver_un_reporte_exige_reporte_ver_sobre_su_unidad(sesion, dig, rev):
    ir(sesion, dig, "crear")
    with pytest.raises(SinPermiso):
        detalle(sesion, e.consulta_de_planeamiento(sesion), formato="NUT", periodo="2026-08")  # Planeamiento lee lo que le remiten, no el borrador
    de_imagenes = e.sesion_de(e.crear_usuario(sesion, "dig.dxi"), e.asignacion(sesion, "digitador", "imagenes"))
    with pytest.raises(SinPermiso):
        detalle(sesion, de_imagenes, formato="NUT", periodo="2026-08")
    with pytest.raises(NoEncontrado):
        detalle(sesion, dig, formato="XXX", periodo="2026-08")
    with pytest.raises(NoEncontrado):
        detalle(sesion, dig, formato="NUT", periodo="2025-12")


def prueba_el_servicio_no_confirma_nada(sesion, dig):
    """El endpoint hace un solo commit al final (para que la auditoría alcance a todo): el
    servicio solo hace flush."""
    ir(sesion, dig, "crear")
    assert sesion.scalar(select(Reporte.id)) is not None
    assert not [x for x in sesion.new]  # todo lo pendiente ya se escribió con flush
