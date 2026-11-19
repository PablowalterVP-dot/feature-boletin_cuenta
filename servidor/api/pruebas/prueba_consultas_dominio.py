"""Reglas de las listas de reportes: semáforo, visibilidad, recepción, paginación. Sin base de datos."""

from datetime import date, datetime, timedelta, timezone
from itertools import product

import pytest

from app.dominio import consultas, estados, periodos
from app.dominio.consultas import RemisionVista
from app.dominio.permisos import REPORTE_CARGAR, REPORTE_REVISAR, REPORTE_VER
from app.dominio.reloj import ZONA
from app.dominio.sesion import Asignacion, Sesion

LIMITE = date(2026, 9, 10)  # plazo del periodo 2026-08


def sesion(*asignaciones: Asignacion) -> Sesion:
    ahora = datetime(2026, 9, 13, 12, 0, tzinfo=ZONA)
    return Sesion(1, "x", "X", tuple(asignaciones), False, ahora, ahora)


def asignacion(unidad, *permisos) -> Asignacion:
    return Asignacion("x", unidad, frozenset(permisos))


def lima(dia: date, hora: int = 12, minuto: int = 0) -> datetime:
    return datetime(dia.year, dia.month, dia.day, hora, minuto, tzinfo=ZONA)


# ------------------------------------------------------------------- semáforo


def prueba_enviado_el_ultimo_dia_del_plazo_es_a_tiempo():
    assert consultas.semaforo(lima(LIMITE), LIMITE, date(2026, 9, 20)) == "a_tiempo"


def prueba_enviado_un_dia_despues_es_fuera_de_plazo():
    assert consultas.semaforo(lima(LIMITE + timedelta(days=1)), LIMITE, date(2026, 9, 20)) == "fuera_de_plazo"


def prueba_sin_enviar_el_ultimo_dia_del_plazo_sigue_pendiente_y_al_dia_siguiente_vence():
    assert consultas.semaforo(None, LIMITE, LIMITE) == "pendiente"
    assert consultas.semaforo(None, LIMITE, LIMITE + timedelta(days=1)) == "vencido"


def prueba_el_envio_de_las_nueve_de_la_noche_del_ultimo_dia_cuenta_como_a_tiempo():
    """Las 21:00 de Lima son las 02:00 del día siguiente en UTC: medir en UTC lo
    convertiría en tardío."""
    envio = lima(LIMITE, 21, 0)
    assert envio.astimezone(timezone.utc).date() == LIMITE + timedelta(days=1)
    assert consultas.semaforo(envio, LIMITE, date(2026, 9, 20)) == "a_tiempo"


def prueba_una_hora_sin_zona_se_toma_como_hora_de_lima():
    assert consultas.semaforo(datetime(2026, 9, 10, 21, 0), LIMITE, date(2026, 9, 20)) == "a_tiempo"


def prueba_haber_enviado_pesa_mas_que_el_plazo_de_hoy():
    """Un envío a tiempo no se vuelve «vencido» con el paso de los días."""
    assert consultas.semaforo(lima(date(2026, 9, 1)), LIMITE, date(2026, 12, 31)) == "a_tiempo"


def prueba_dias_de_retraso_de_un_envio_tardio_cuentan_hasta_el_dia_del_envio():
    assert consultas.dias_de_retraso(lima(date(2026, 9, 14)), LIMITE, date(2026, 12, 31)) == 4


def prueba_dias_de_retraso_de_uno_vencido_sin_enviar_cuentan_hasta_hoy():
    assert consultas.dias_de_retraso(None, LIMITE, date(2026, 9, 13)) == 3


def prueba_sin_retraso_no_hay_dias_de_retraso_ni_cero():
    assert consultas.dias_de_retraso(None, LIMITE, LIMITE) is None
    assert consultas.dias_de_retraso(None, LIMITE, date(2026, 9, 1)) is None
    assert consultas.dias_de_retraso(lima(LIMITE), LIMITE, date(2026, 12, 31)) is None


def prueba_los_dias_de_retraso_coinciden_con_el_semaforo():
    for envio, hoy in product([None, lima(date(2026, 9, 1)), lima(LIMITE), lima(date(2026, 9, 11))], [date(2026, 9, 5), LIMITE, date(2026, 9, 11), date(2026, 10, 1)]):
        con_retraso = consultas.dias_de_retraso(envio, LIMITE, hoy) is not None
        assert con_retraso == (consultas.semaforo(envio, LIMITE, hoy) in ("fuera_de_plazo", "vencido"))


def prueba_el_plazo_de_la_lista_es_el_de_dominio_periodos():
    """Ambos semáforos, el de Alejandro y este, se miden contra el día 10 del mes siguiente."""
    assert periodos.plazo_de("2026-08") == LIMITE


# ---------------------------------------------------------------- quién espera


@pytest.mark.parametrize("estado", [e.clave for e in estados.ESTADOS])
def prueba_espera_de_sale_de_la_maquina_de_estados(estado):
    assert consultas.espera_de(estado) == next(e.espera for e in estados.ESTADOS if e.clave == estado)


def prueba_los_estados_de_cada_espera_cubren_todos_los_estados_una_sola_vez():
    todos = [e for grupo in consultas.ESTADOS_DE_LA_ESPERA.values() for e in grupo]
    assert sorted(todos) == sorted(e.clave for e in estados.ESTADOS)
    assert consultas.ESTADOS_DE_LA_ESPERA["area"] == ("no_iniciado", "borrador")
    assert consultas.ESTADOS_DE_LA_ESPERA["nadie"] == ("remitido",)
    assert "estadistica" not in consultas.ESTADOS_DE_LA_ESPERA  # 12/10/2026: nada espera a Estadística


# ----------------------------------------------------------------- visibilidad

ESTADOS_ENTREGADOS = ("remitido",)
ESTADOS_DE_TRABAJO = ("no_iniciado", "borrador")


def prueba_el_digitador_ve_sus_borradores_y_no_los_de_otra_unidad():
    v = consultas.visibilidad_de(sesion(asignacion("nutricion", REPORTE_VER, REPORTE_CARGAR)))
    assert v.ve("nutricion", "borrador") and v.ve("nutricion", "no_iniciado")
    assert not v.ve("epidemiologia", "borrador")
    assert not v.ve("epidemiologia", "enviado")  # sin reporte.ver allí, ni siquiera lo entregado


def prueba_una_consulta_global_ve_lo_entregado_de_todos_y_ningun_borrador():
    v = consultas.visibilidad_de(sesion(asignacion(None, REPORTE_VER)))
    for unidad, estado in product(("nutricion", "epidemiologia"), ESTADOS_ENTREGADOS):
        assert v.ve(unidad, estado)
    for unidad, estado in product(("nutricion", "epidemiologia"), ESTADOS_DE_TRABAJO):
        assert not v.ve(unidad, estado)


def prueba_la_consulta_de_una_oficina_ve_lo_entregado_solo_de_donde_tiene_reporte_ver():
    v = consultas.visibilidad_de(sesion(asignacion("planeamiento", REPORTE_VER)))
    assert not v.ve("nutricion", "remitido")
    assert not v.ve("planeamiento", "borrador")


def prueba_el_revisor_global_ve_todo_incluidos_los_no_iniciados():
    """Estadística necesita ver quién no ha entregado: por eso ve también los borradores."""
    v = consultas.visibilidad_de(sesion(asignacion(None, REPORTE_VER, REPORTE_REVISAR)))
    for unidad, estado in product(("nutricion", "epidemiologia"), ESTADOS_DE_TRABAJO + ESTADOS_ENTREGADOS):
        assert v.ve(unidad, estado)


def prueba_reporte_cargar_sin_reporte_ver_no_da_visibilidad():
    v = consultas.visibilidad_de(sesion(asignacion("nutricion", REPORTE_CARGAR)))
    assert not v.ve("nutricion", "borrador")


def prueba_epidemiologia_con_digitador_y_consulta_ve_sus_borradores_y_lo_entregado_de_todos():
    """Un token, dos asignaciones: digitador en su unidad y consulta global."""
    v = consultas.visibilidad_de(sesion(asignacion("epidemiologia", REPORTE_VER, REPORTE_CARGAR), asignacion(None, REPORTE_VER)))
    assert v.ve("epidemiologia", "borrador")
    assert v.ve("nutricion", "remitido")
    assert not v.ve("nutricion", "borrador")


def prueba_dos_digitadores_de_unidades_distintas_unen_sus_unidades_de_trabajo():
    v = consultas.visibilidad_de(sesion(asignacion("nutricion", REPORTE_VER, REPORTE_CARGAR), asignacion("epidemiologia", REPORTE_VER, REPORTE_CARGAR)))
    assert v.ve("nutricion", "borrador") and v.ve("epidemiologia", "borrador")
    assert not v.ve("planeamiento", "borrador")


def prueba_sin_ningun_permiso_no_se_ve_nada():
    v = consultas.visibilidad_de(sesion())
    assert not any(v.ve(u, e) for u, e in product(("nutricion",), ESTADOS_DE_TRABAJO + ESTADOS_ENTREGADOS))


def prueba_todo_estado_es_de_trabajo_o_entregado_y_no_queda_ninguno_fuera():
    """Si aparece un estado nuevo, la regla de visibilidad debe decidir qué es."""
    assert set(ESTADOS_DE_TRABAJO + ESTADOS_ENTREGADOS) == {e.clave for e in estados.ESTADOS}


# ------------------------------------------------------------------- recepción


def rem(vigente: bool, sin_validar: bool) -> RemisionVista:
    return RemisionVista(es_vigente=vigente, es_sin_validar=sin_validar)


def prueba_una_remision_vigente_verificada_es_validada():
    assert consultas.estado_de_recepcion([rem(True, False)]) == "validada"


def prueba_una_remision_vigente_de_entrega_inmediata_es_sin_validar():
    assert consultas.estado_de_recepcion([rem(True, True)]) == "sin_validar"


def prueba_sin_remisiones_vigentes_es_desactualizada():
    assert consultas.estado_de_recepcion([rem(False, False)]) == "desactualizada"
    assert consultas.estado_de_recepcion([rem(False, True), rem(False, False)]) == "desactualizada"


def prueba_la_verificada_vigente_gana_a_la_sin_validar_vigente():
    assert consultas.estado_de_recepcion([rem(True, True), rem(True, False)]) == "validada"


def prueba_una_verificada_superada_no_cuenta_frente_a_una_sin_validar_vigente():
    assert consultas.estado_de_recepcion([rem(False, False), rem(True, True)]) == "sin_validar"


def prueba_sin_remisiones_no_hay_recepcion_que_resumir():
    with pytest.raises(ValueError):
        consultas.estado_de_recepcion([])


def prueba_todos_los_conjuntos_de_remisiones_dan_uno_de_los_tres_valores():
    posibles = [rem(v, s) for v, s in product((True, False), repeat=2)]
    vistos = set()
    for n in range(1, len(posibles) + 1):
        for tanda in product(posibles, repeat=n):
            vistos.add(consultas.estado_de_recepcion(tanda))
    assert vistos == set(consultas.ESTADOS_DE_RECEPCION)


# ------------------------------------------------------------ filtros de periodo


def prueba_el_tope_es_el_periodo_vigente_si_no_se_pide_otro():
    assert consultas.tope_de_periodo(None, date(2026, 9, 27)) == "2026-08"


def prueba_pedir_un_periodo_futuro_se_recorta_al_vigente():
    assert consultas.tope_de_periodo("2026-12", date(2026, 9, 27)) == "2026-08"


def prueba_pedir_un_periodo_anterior_se_respeta():
    assert consultas.tope_de_periodo("2026-05", date(2026, 9, 27)) == "2026-05"


def prueba_el_tope_cambia_con_el_mes_y_cruza_el_anio():
    assert consultas.tope_de_periodo(None, date(2027, 1, 3)) == "2026-12"


def prueba_un_rango_al_reves_es_un_error_con_su_codigo():
    with pytest.raises(consultas.RangoInvalido) as error:
        consultas.comprobar_rango("2026-08", "2026-03")
    assert error.value.codigo == "rango_de_periodos_invalido"
    assert error.value.datos == {"desde": "2026-08", "hasta": "2026-03"}


def prueba_un_rango_de_un_solo_mes_o_abierto_es_valido():
    consultas.comprobar_rango("2026-03", "2026-03")
    consultas.comprobar_rango(None, "2026-03")
    consultas.comprobar_rango("2026-03", None)
    consultas.comprobar_rango(None, None)


def prueba_un_mes_exacto_es_un_rango_de_ese_mes():
    assert consultas.rango_pedido("2026-03", None, None) == ("2026-03", "2026-03")


def prueba_desde_y_hasta_se_dejan_como_vienen_y_pueden_faltar():
    assert consultas.rango_pedido(None, "2026-01", "2026-03") == ("2026-01", "2026-03")
    assert consultas.rango_pedido(None, None, None) == (None, None)
    assert consultas.rango_pedido(None, None, "2026-03") == (None, "2026-03")


def prueba_un_mes_exacto_no_se_combina_con_un_rango():
    for desde, hasta in [("2026-01", None), (None, "2026-03"), ("2026-01", "2026-03")]:
        with pytest.raises(consultas.FiltrosIncompatibles) as error:
            consultas.rango_pedido("2026-02", desde, hasta)
        assert error.value.codigo == "filtros_incompatibles"


def prueba_rango_pedido_tambien_rechaza_el_rango_al_reves():
    with pytest.raises(consultas.RangoInvalido):
        consultas.rango_pedido(None, "2026-08", "2026-03")


def prueba_los_estados_entregados_son_los_que_salieron_del_area():
    assert consultas.ESTADOS_ENTREGADOS == ("remitido",)


# ------------------------------------------------------------------- paginación


def prueba_el_desplazamiento_salta_las_paginas_anteriores():
    assert [consultas.desplazamiento(p, 10) for p in (1, 2, 5)] == [0, 10, 40]


@pytest.mark.parametrize(("total", "esperado"), [(0, 1), (1, 1), (10, 1), (11, 2), (80, 8), (81, 9)])
def prueba_total_de_paginas_nunca_baja_de_una(total, esperado):
    assert consultas.total_de_paginas(total, 10) == esperado


def prueba_la_pagina_por_defecto_es_la_de_las_tablas_del_proyecto():
    assert consultas.FILAS_POR_PAGINA == 10
