"""Las listas de reportes contra la base de Alejandro: la general y los «recibidos».

El «hoy» de las pruebas es el 13 de septiembre de 2026, así que el periodo vigente es
2026-08 y la lista llega de enero a agosto. Solo Nutrición trae un formato en la base
instalada: los de otras áreas son ficticios (`escenario.crear_formato`).
"""

from datetime import datetime

import pytest
from sqlalchemy import func

import escenario as e
from app.dominio.consultas import FiltrosIncompatibles, RangoInvalido
from app.dominio.reloj import ZONA, RelojFijo
from app.herramientas.configurar_plazos import configurar as configurar_plazos
from app.servicios.consultas import listar_recibidos, listar_reportes
from app.servicios.errores import NoEncontrado, SinPermiso
from app.servicios.transiciones import detalle

pytestmark = pytest.mark.bd

RELOJ = RelojFijo(e.AHORA)
AREAS = ("epidemiologia", "farmacia", "laboratorio", "imagenes", "nefrologia", "ginecologia", "lavanderia", "centro-quirurgico")
# Sin Mantenimiento: no reporta (seeders/0004_retirar_mantenimiento.sql). Son nueve áreas.


def envio(mes: int, dia: int, hora: int = 12) -> datetime:
    return datetime(2026, mes, dia, hora, 0, tzinfo=ZONA)


@pytest.fixture
def revisor(sesion):
    return e.revisor_de_estadistica(sesion)


@pytest.fixture
def consulta_global(sesion):
    return e.persona(sesion, "con.glo", ("consulta", None))


def lista(sesion, actor, reloj=RELOJ, **filtros):
    return listar_reportes(sesion, actor, reloj, **filtros)


def claves(resultado):
    return [(f.periodo, f.formato) for f in resultado.filas]


def con_ocho_areas_mas(sesion) -> list[str]:
    """Nutrición ya tiene su formato; se le suman los de las otras ocho áreas."""
    codigos = []
    for unidad in AREAS:
        codigo = "F-" + unidad[:3].upper()
        e.crear_formato(sesion, unidad, codigo)
        codigos.append(codigo)
    return codigos


# ---------------------------------------------------------------- lo que trae la lista


def prueba_estadistica_ve_un_renglon_por_periodo_hasta_el_vigente_aunque_no_haya_reportes(sesion, revisor):
    r = lista(sesion, revisor)
    assert claves(r) == [(f"2026-{m:02d}", "NUT") for m in range(8, 0, -1)]
    assert r.pagina.total == 8 and r.pagina.paginas == 1


def prueba_los_meses_que_no_terminan_no_aparecen_como_pendientes(sesion, revisor):
    assert all(f.periodo <= "2026-08" for f in lista(sesion, revisor, por_pagina=100).filas)
    assert lista(sesion, revisor, periodo="2026-10").filas == []
    assert claves(lista(sesion, revisor, hasta="2026-12")) == claves(lista(sesion, revisor))


def prueba_al_avanzar_el_reloj_entra_un_mes_mas(sesion, revisor):
    octubre = RelojFijo(datetime(2026, 10, 2, 9, 0))
    assert claves(lista(sesion, revisor, octubre))[0] == ("2026-09", "NUT")


def prueba_un_reporte_no_iniciado_se_lista_con_su_espera_y_su_atraso(sesion, revisor):
    agosto = lista(sesion, revisor, periodo="2026-08").filas[0]
    assert (agosto.estado, agosto.espera, agosto.semaforo) == ("no_iniciado", "area", "vencido")
    assert (agosto.dias_de_retraso, agosto.numero_rectificacion, agosto.folio_constancia, agosto.fecha_envio) == (3, 0, None, None)
    assert (agosto.unidad, agosto.unidad_nombre) == ("nutricion", "Nutrición y Dietética") and agosto.formato_nombre


def prueba_un_reporte_entregado_trae_su_constancia_su_rectificacion_y_su_validacion(sesion, revisor):
    r = e.abrir_reporte(sesion, "NUT", 8, "remitido", numero_rectificacion=1, fecha_envio=envio(9, 8), folio="CR-2026-08-NUT-2")
    r.fecha_validacion = envio(9, 9)
    sesion.flush()
    f = lista(sesion, revisor, periodo="2026-08").filas[0]
    assert (f.estado, f.espera, f.semaforo, f.dias_de_retraso) == ("remitido", "nadie", "a_tiempo", None)
    assert (f.numero_rectificacion, f.folio_constancia, f.fecha_validacion) == (1, "CR-2026-08-NUT-2", envio(9, 9))


def prueba_el_formato_inactivo_no_aparece(sesion, revisor):
    e.crear_formato(sesion, "farmacia", "F-FAR", activo=False)
    assert {f.formato for f in lista(sesion, revisor, por_pagina=100).filas} == {"NUT"}


# --------------------------------------------------------------------- el semáforo


def prueba_el_semaforo_usa_el_reloj_inyectado_y_no_el_de_la_base(sesion, revisor):
    """Sin envío, agosto vence el 10 de septiembre: el mismo dato cambia con el reloj."""
    en = lambda dia: lista(sesion, revisor, RelojFijo(datetime(2026, 9, dia, 9, 0)), periodo="2026-08").filas[0]
    assert en(9).semaforo == "pendiente" and en(10).semaforo == "pendiente" and en(11).semaforo == "vencido"
    assert (en(10).dias_de_retraso, en(11).dias_de_retraso, en(20).dias_de_retraso) == (None, 1, 10)


def prueba_un_envio_de_las_nueve_de_la_noche_del_ultimo_dia_es_a_tiempo(sesion, revisor):
    e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 10, 21), folio="CR-2026-08-NUT")
    f = lista(sesion, revisor, periodo="2026-08").filas[0]
    assert (f.semaforo, f.dias_de_retraso) == ("a_tiempo", None)


def prueba_un_envio_tardio_cuenta_los_dias_hasta_el_envio_y_no_hasta_hoy(sesion, revisor):
    e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 20), folio="CR-2026-07-NUT")  # el plazo era el 10 de agosto
    f = lista(sesion, revisor, RelojFijo(datetime(2026, 12, 1, 9, 0)), periodo="2026-07").filas[0]
    assert (f.semaforo, f.dias_de_retraso) == ("fuera_de_plazo", 10)


# ------------------------------------------------- el plazo real, una vez configurado


def prueba_sin_configurar_plazos_el_respaldo_sigue_siendo_el_dia_10(sesion, revisor):
    """Nadie corrió `configurar_plazos`: organizacion.parametro no tiene ninguna
    clave «plazo.…», y el genérico de siempre (día 10) sigue valiendo — no romper
    lo que ya funcionaba es tan importante como el plazo real."""
    assert lista(sesion, revisor, periodo="2026-08").filas[0].fecha_limite.day == 10


def prueba_configurado_nutricion_usa_el_respaldo_de_estadistica_dia_5(sesion, revisor):
    """NUT no tiene fila propia: cae en «plazo.default.estadistica» (día 5)."""
    configurar_plazos(sesion)
    f = lista(sesion, revisor, periodo="2026-08").filas[0]
    assert f.fecha_limite.day == 5
    en = lambda dia: lista(sesion, revisor, RelojFijo(datetime(2026, 9, dia, 9, 0)), periodo="2026-08").filas[0]
    assert en(5).semaforo == "pendiente" and en(6).semaforo == "vencido"  # ya no el 10/11


def prueba_configurado_un_area_con_plazo_propio_lo_usa_en_vez_del_respaldo(sesion, revisor):
    """Nefrología sí tiene fila propia («plazo.NEF.estadistica» = 7): un
    formato ficticio con ese mismo código (`escenario.crear_formato`, no la
    base instalada) debe usar el 7, no el respaldo de 5."""
    configurar_plazos(sesion)
    e.crear_formato(sesion, "nefrologia", "NEF")
    f = next(x for x in lista(sesion, revisor, periodo="2026-08", por_pagina=100).filas if x.formato == "NEF")
    assert f.fecha_limite.day == 7


# ------------------------------------------------------------------- visibilidad


def prepara_borrador_y_entrega(sesion):
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")


def prueba_una_consulta_global_no_ve_borradores_ni_no_iniciados(sesion, consulta_global):
    prepara_borrador_y_entrega(sesion)
    r = lista(sesion, consulta_global)
    assert claves(r) == [("2026-07", "NUT")] and r.pagina.total == 1


def prueba_estadistica_ve_los_borradores_y_los_no_iniciados(sesion, revisor):
    prepara_borrador_y_entrega(sesion)
    por_periodo = {f.periodo: f.estado for f in lista(sesion, revisor).filas}
    assert por_periodo["2026-08"] == "borrador" and por_periodo["2026-07"] == "remitido" and por_periodo["2026-06"] == "no_iniciado"


def prueba_el_digitador_ve_solo_su_area_borradores_incluidos(sesion):
    e.crear_formato(sesion, "farmacia", "F-FAR")
    prepara_borrador_y_entrega(sesion)
    e.abrir_reporte(sesion, "F-FAR", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-FAR")
    r = lista(sesion, e.digitador_de_nutricion(sesion), por_pagina=100)
    assert {f.formato for f in r.filas} == {"NUT"} and r.pagina.total == 8
    assert {f.periodo: f.estado for f in r.filas}["2026-08"] == "borrador"


def prueba_la_consulta_de_una_oficina_no_ve_lo_de_otras_unidades(sesion):
    prepara_borrador_y_entrega(sesion)
    assert lista(sesion, e.consulta_de_planeamiento(sesion)).filas == []


def prueba_epidemiologia_con_dos_asignaciones_ve_sus_borradores_y_no_los_ajenos(sesion):
    e.crear_formato(sesion, "epidemiologia", "F-EPI")
    e.abrir_reporte(sesion, "F-EPI", 8, "borrador")
    prepara_borrador_y_entrega(sesion)
    epi = e.persona(sesion, "epi", ("digitador", "epidemiologia"), ("consulta", "epidemiologia"))
    r = lista(sesion, epi, por_pagina=100)
    assert {f.formato for f in r.filas} == {"F-EPI"} and r.pagina.total == 8
    assert {f.periodo: f.estado for f in r.filas}["2026-08"] == "borrador"


def prueba_sin_reporte_ver_en_ninguna_parte_es_403(sesion):
    nadie = e.sesion_de(e.crear_usuario(sesion, "nadie"))
    with pytest.raises(SinPermiso):
        lista(sesion, nadie)


def prueba_el_detalle_tambien_esconde_el_borrador_a_una_consulta_global(sesion, consulta_global):
    """Si no, la lista lo esconde y el detalle lo entrega, con su historial y sus hallazgos."""
    prepara_borrador_y_entrega(sesion)
    with pytest.raises(SinPermiso):
        detalle(sesion, consulta_global, formato="NUT", periodo="2026-08")  # borrador
    with pytest.raises(SinPermiso):
        detalle(sesion, consulta_global, formato="NUT", periodo="2026-06")  # no iniciado
    assert detalle(sesion, consulta_global, formato="NUT", periodo="2026-07").estado == "remitido"


def prueba_el_detalle_sigue_abierto_al_digitador_y_a_estadistica(sesion, revisor):
    prepara_borrador_y_entrega(sesion)
    assert detalle(sesion, e.digitador_de_nutricion(sesion), formato="NUT", periodo="2026-08").estado == "borrador"
    assert detalle(sesion, revisor, formato="NUT", periodo="2026-06").estado == "no_iniciado"


# ---------------------------------------------- nueve áreas, ocho meses, paginación


def prueba_nueve_formatos_por_ocho_meses_son_setenta_y_dos_renglones_en_ocho_paginas(sesion, revisor):
    con_ocho_areas_mas(sesion)
    primera = lista(sesion, revisor)
    assert (primera.pagina.total, primera.pagina.paginas, primera.pagina.por_pagina, len(primera.filas)) == (72, 8, 10, 10)
    todas = []
    for n in range(1, 9):
        todas += claves(lista(sesion, revisor, pagina=n))
    assert len(todas) == 72 and len(set(todas)) == 72  # ninguno repetido ni perdido entre páginas
    assert [p for p, _ in todas] == sorted((p for p, _ in todas), reverse=True)  # más reciente primero
    assert lista(sesion, revisor, pagina=9).filas == [] and lista(sesion, revisor, pagina=9).pagina.total == 72


def prueba_dentro_de_un_mes_los_formatos_van_por_codigo(sesion, revisor):
    con_ocho_areas_mas(sesion)
    agosto = lista(sesion, revisor, periodo="2026-08", por_pagina=100)
    assert [f.formato for f in agosto.filas] == sorted(f.formato for f in agosto.filas) and agosto.pagina.total == 9


def prueba_el_total_cuenta_lo_visible_y_no_lo_que_hay(sesion, consulta_global):
    con_ocho_areas_mas(sesion)
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.abrir_reporte(sesion, "F-FAR", 8, "remitido", fecha_envio=envio(9, 9), folio="CR-2026-08-FAR")
    r = lista(sesion, consulta_global)
    assert r.pagina.total == 1 and r.pagina.paginas == 1


# --------------------------------------------------------------------- filtros


def prueba_filtra_por_formato_sin_distinguir_mayusculas(sesion, revisor):
    con_ocho_areas_mas(sesion)
    assert {f.formato for f in lista(sesion, revisor, formato="f-far", por_pagina=100).filas} == {"F-FAR"}
    assert lista(sesion, revisor, formato="ZZZ").filas == []


def prueba_filtra_por_estado_y_por_quien_espera(sesion, revisor):
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    e.abrir_reporte(sesion, "NUT", 6, "remitido", fecha_envio=envio(7, 9), folio="CR-2026-06-NUT")
    assert claves(lista(sesion, revisor, estado="borrador")) == [("2026-08", "NUT")]
    assert claves(lista(sesion, revisor, espera="nadie")) == [("2026-07", "NUT"), ("2026-06", "NUT")]
    assert lista(sesion, revisor, espera="area", por_pagina=100).pagina.total == 6  # el borrador y los cinco sin abrir
    assert claves(lista(sesion, revisor, estado="no_iniciado", periodo="2026-05")) == [("2026-05", "NUT")]


def prueba_estado_y_espera_juntos_se_cruzan(sesion, revisor):
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    assert claves(lista(sesion, revisor, estado="borrador", espera="area")) == [("2026-08", "NUT")]
    assert lista(sesion, revisor, estado="borrador", espera="nadie").filas == []


def prueba_filtra_por_un_mes_y_por_un_rango(sesion, revisor):
    assert claves(lista(sesion, revisor, periodo="2026-03")) == [("2026-03", "NUT")]
    assert [p for p, _ in claves(lista(sesion, revisor, desde="2026-03", hasta="2026-05"))] == ["2026-05", "2026-04", "2026-03"]
    assert [p for p, _ in claves(lista(sesion, revisor, desde="2026-07"))] == ["2026-08", "2026-07"]
    assert [p for p, _ in claves(lista(sesion, revisor, hasta="2026-02"))] == ["2026-02", "2026-01"]


def prueba_un_rango_al_reves_o_un_mes_con_rango_se_rechazan(sesion, revisor):
    with pytest.raises(RangoInvalido):
        lista(sesion, revisor, desde="2026-05", hasta="2026-03")
    with pytest.raises(FiltrosIncompatibles):
        lista(sesion, revisor, periodo="2026-05", desde="2026-03")


def prueba_los_filtros_no_dejan_ver_lo_que_la_visibilidad_esconde(sesion, consulta_global):
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    assert lista(sesion, consulta_global, estado="borrador").filas == []
    assert lista(sesion, consulta_global, espera="area").filas == []


# ------------------------------------------------------------------- recibidos


def recibidos(sesion, actor, clave="planeamiento", **filtros):
    return listar_recibidos(sesion, actor, clave=clave, **filtros)


@pytest.fixture
def planeamiento(sesion):
    return e.consulta_de_planeamiento(sesion)


def prueba_una_oficina_ve_solo_lo_que_se_le_remitio(sesion, planeamiento):
    validado = e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    e.remitir_a(sesion, validado, "planeamiento")
    otro = e.abrir_reporte(sesion, "NUT", 6, "remitido", fecha_envio=envio(7, 9), folio="CR-2026-06-NUT")
    e.remitir_a(sesion, otro, "cuerpo-tecnico")
    e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 9), folio="CR-2026-08-NUT")  # sin remitir
    r = recibidos(sesion, planeamiento)
    assert [(f.periodo, f.formato) for f in r.filas] == [("2026-07", "NUT")]
    assert (r.oficina, r.pagina.total) == ("planeamiento", 1)


def prueba_lo_recibido_trae_el_origen_la_constancia_y_la_remision(sesion, planeamiento):
    rep = e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    e.remitir_a(sesion, rep, "planeamiento")
    f = recibidos(sesion, planeamiento).filas[0]
    assert (f.unidad, f.unidad_nombre, f.estado_de_recepcion, f.constancia) == ("nutricion", "Nutrición y Dietética", "validada", "CR-2026-07-NUT")
    assert [(r.constancia, r.es_vigente, r.es_sin_validar, r.numero_rectificacion) for r in f.remisiones] == [("CR-2026-07-NUT", True, False, 0)]


def prueba_la_oficina_no_ve_el_estado_del_reporte(sesion, planeamiento):
    rep = e.abrir_reporte(sesion, "NUT", 7, "borrador", numero_rectificacion=1, folio="CR-2026-07-NUT")  # reabierto para rectificar
    e.remitir_a(sesion, rep, "planeamiento", es_vigente=False)
    f = recibidos(sesion, planeamiento).filas[0]
    assert f.estado_de_recepcion == "desactualizada"
    assert not hasattr(f, "estado") and not hasattr(f, "espera") and not hasattr(f, "numero_rectificacion")


def prueba_un_borrador_sin_remisiones_nunca_aparece(sesion, planeamiento):
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    assert recibidos(sesion, planeamiento).filas == []


def prueba_la_entrega_inmediata_aparece_sin_validar_aunque_el_reporte_siga_en_estadistica(sesion, planeamiento):
    rep = e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 9), folio="CR-2026-08-NUT")
    e.remitir_a(sesion, rep, "planeamiento", sin_validar=True)
    f = recibidos(sesion, planeamiento).filas[0]
    assert (f.estado_de_recepcion, f.constancia) == ("sin_validar", "CR-2026-08-NUT")


def prueba_la_entrega_inmediata_superada_y_la_validada_son_un_solo_reporte(sesion, planeamiento):
    rep = e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 9), folio="CR-2026-08-NUT")
    e.remitir_a(sesion, rep, "planeamiento", sin_validar=True, es_vigente=False)
    e.remitir_a(sesion, rep, "planeamiento")
    r = recibidos(sesion, planeamiento)
    assert r.pagina.total == 1 and len(r.filas) == 1
    assert r.filas[0].estado_de_recepcion == "validada"
    assert [(x.es_sin_validar, x.es_vigente) for x in r.filas[0].remisiones] == [(False, True), (True, False)]  # lo vigente primero


def prueba_tras_rectificar_y_volver_a_remitir_la_constancia_es_la_del_reenvio(sesion, planeamiento):
    rep = e.abrir_reporte(sesion, "NUT", 8, "remitido", numero_rectificacion=1, fecha_envio=envio(9, 12), folio="CR-2026-08-NUT-2")
    e.remitir_a(sesion, rep, "planeamiento", es_vigente=False, numero_rectificacion=0)
    e.remitir_a(sesion, rep, "planeamiento", numero_rectificacion=1)
    f = recibidos(sesion, planeamiento).filas[0]
    assert (f.estado_de_recepcion, f.constancia) == ("validada", "CR-2026-08-NUT-2")
    assert [r.constancia for r in f.remisiones] == ["CR-2026-08-NUT-2", "CR-2026-08-NUT"]


def prueba_una_version_superada_no_promete_la_constancia_del_reenvio_que_no_recibio(sesion, planeamiento):
    """Si el área ya reenvió (folio -2) pero Estadística aún no remite, la oficina sigue
    con la versión -1, desactualizada; no debe ver una constancia que no le llegó."""
    rep = e.abrir_reporte(sesion, "NUT", 8, "remitido", numero_rectificacion=1, fecha_envio=envio(9, 12), folio="CR-2026-08-NUT-2")
    e.remitir_a(sesion, rep, "planeamiento", es_vigente=False, numero_rectificacion=0)
    f = recibidos(sesion, planeamiento).filas[0]
    assert (f.estado_de_recepcion, f.constancia) == ("desactualizada", "CR-2026-08-NUT")


def prueba_una_remision_eliminada_no_cuenta(sesion, planeamiento):
    rep = e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    rem = e.remitir_a(sesion, rep, "planeamiento")
    rem.fecha_eliminacion = func.now()
    sesion.flush()
    assert recibidos(sesion, planeamiento).filas == []


def remite_a_planeamiento(sesion, formatos, meses):
    for formato in formatos:
        for mes in meses:
            rep = e.abrir_reporte(sesion, formato, mes, "remitido", fecha_envio=envio(mes + 1, 9), folio=f"CR-2026-{mes:02d}-{formato}")
            e.remitir_a(sesion, rep, "planeamiento")


def prueba_pagina_los_reportes_de_diez_en_diez_mas_recientes_primero(sesion, planeamiento):
    formatos = ["NUT", *con_ocho_areas_mas(sesion)[:2]]
    remite_a_planeamiento(sesion, formatos, range(1, 9))
    paginas = [recibidos(sesion, planeamiento, pagina=n) for n in (1, 2, 3, 4)]
    assert [p.pagina.total for p in paginas] == [24] * 4 and paginas[0].pagina.paginas == 3
    assert [len(p.filas) for p in paginas] == [10, 10, 4, 0]
    todos = [(f.periodo, f.formato) for p in paginas for f in p.filas]
    assert len(set(todos)) == 24 and [p for p, _ in todos] == sorted((p for p, _ in todos), reverse=True)


def prueba_filtra_lo_recibido_por_formato_mes_rango_y_estado_de_recepcion(sesion, planeamiento):
    formatos = ["NUT", *con_ocho_areas_mas(sesion)[:1]]
    remite_a_planeamiento(sesion, formatos, range(1, 5))
    rep = e.abrir_reporte(sesion, "NUT", 6, "borrador", numero_rectificacion=1, folio="CR-2026-06-NUT")
    e.remitir_a(sesion, rep, "planeamiento", es_vigente=False)
    assert {f.formato for f in recibidos(sesion, planeamiento, formato="nut", por_pagina=100).filas} == {"NUT"}
    assert [f.formato for f in recibidos(sesion, planeamiento, periodo="2026-02", por_pagina=100).filas] == ["F-EPI", "NUT"]
    assert {f.periodo for f in recibidos(sesion, planeamiento, desde="2026-02", hasta="2026-03", por_pagina=100).filas} == {"2026-02", "2026-03"}
    desactualizadas = recibidos(sesion, planeamiento, estado_de_recepcion="desactualizada")
    assert [(f.periodo, f.formato) for f in desactualizadas.filas] == [("2026-06", "NUT")] and desactualizadas.pagina.total == 1
    assert recibidos(sesion, planeamiento, estado_de_recepcion="validada").pagina.total == 8
    assert recibidos(sesion, planeamiento, estado_de_recepcion="sin_validar").filas == []


def prueba_un_rango_al_reves_en_recibidos_se_rechaza(sesion, planeamiento):
    with pytest.raises(RangoInvalido):
        recibidos(sesion, planeamiento, desde="2026-05", hasta="2026-03")
    with pytest.raises(FiltrosIncompatibles):
        recibidos(sesion, planeamiento, periodo="2026-05", hasta="2026-06")


# ------------------------------------------- quién puede ver los recibidos de quién


def prueba_otra_oficina_no_ve_los_recibidos_de_planeamiento(sesion):
    cuerpo_tecnico = e.persona(sesion, "con.cte", ("consulta", "cuerpo-tecnico"))
    with pytest.raises(SinPermiso):
        recibidos(sesion, cuerpo_tecnico, "planeamiento")


def prueba_estadistica_con_reporte_ver_global_ve_los_recibidos_de_cualquier_oficina(sesion, revisor):
    assert recibidos(sesion, revisor, "planeamiento").pagina.total == 0
    assert recibidos(sesion, revisor, "cuerpo-tecnico").pagina.total == 0


def prueba_el_digitador_de_la_propia_unidad_ve_lo_que_recibe_epidemiologia(sesion):
    """Epidemiología reporta y recibe: su digitador ve lo que otras áreas le remiten."""
    rep = e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    e.remitir_a(sesion, rep, "epidemiologia")
    epi = e.persona(sesion, "dig.epi", ("digitador", "epidemiologia"))
    assert recibidos(sesion, epi, "epidemiologia").pagina.total == 1
    with pytest.raises(SinPermiso):
        recibidos(sesion, epi, "planeamiento")


def prueba_el_digitador_de_una_area_que_no_es_la_oficina_no_ve_sus_recibidos(sesion):
    with pytest.raises(SinPermiso):
        recibidos(sesion, e.digitador_de_nutricion(sesion), "planeamiento")


@pytest.mark.parametrize("clave", ["estadistica", "diresa", "nutricion", "no-existe"])
def prueba_lo_que_no_es_una_oficina_receptora_del_hospital_es_404(sesion, revisor, clave):
    """Estadística recibe todo y no figura como destino; DIRESA es externa (recibe el
    consolidado, no reportes de un área); Nutrición solo reporta."""
    with pytest.raises(NoEncontrado):
        recibidos(sesion, revisor, clave)


def prueba_el_404_va_antes_que_el_403(sesion):
    """Quien no tiene permiso sobre «nutricion» recibe 404: no es una oficina, no hay
    nada que proteger ni que revelar."""
    with pytest.raises(NoEncontrado):
        recibidos(sesion, e.consulta_de_planeamiento(sesion), "nutricion")
