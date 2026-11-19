"""Las reglas con que el tablero lee los resultados: el calendario de corrección
del HIS, qué es hoy cada caso y qué datos le faltan a una ficha. Sin base."""

from datetime import date

from app.dominio.desempeno import calendario as cal
from app.dominio.desempeno import tablero as t

HOY = date(2026, 10, 8)


# ---------------------------------------------------------------- calendario


def prueba_la_correccion_del_mes_va_del_12_al_21_del_mes_siguiente():
    assert (cal.apertura_his(2026, 9), cal.cierre_his(2026, 9)) == (date(2026, 10, 12), date(2026, 10, 21))
    assert (cal.apertura_his(2026, 12), cal.cierre_his(2026, 12)) == (date(2027, 1, 12), date(2027, 1, 21))


def prueba_una_carga_extraida_despues_del_cierre_es_definitiva():
    assert cal.estado_de_carga(2026, 8, cargado=True, extraccion=date(2026, 9, 28), hoy=HOY) == cal.CIERRE
    assert cal.estado_de_carga(2026, 8, cargado=True, extraccion=date(2026, 9, 21), hoy=HOY) == cal.CIERRE


def prueba_una_carga_anterior_al_cierre_es_preliminar_hasta_el_cierre_y_luego_hay_que_recargarla():
    assert cal.estado_de_carga(2026, 9, cargado=True, extraccion=date(2026, 9, 30), hoy=HOY) == cal.PRELIMINAR
    assert cal.estado_de_carga(2026, 9, cargado=True, extraccion=date(2026, 9, 30), hoy=date(2026, 10, 22)) == cal.RECARGAR


def prueba_sin_fecha_de_extraccion_no_se_afirma_nada():
    assert cal.estado_de_carga(2026, 3, cargado=True, extraccion=None, hoy=HOY) == cal.SIN_FECHA


def prueba_un_mes_terminado_sin_carga_falta_y_uno_en_curso_es_futuro():
    assert cal.estado_de_carga(2026, 9, cargado=False, extraccion=None, hoy=HOY) == cal.FALTA
    assert cal.estado_de_carga(2026, 10, cargado=False, extraccion=None, hoy=HOY) == cal.FUTURO


def prueba_un_mes_es_oficial_si_lo_cubrio_minsa_y_consolidado_si_todas_sus_fuentes_cerraron():
    assert cal.estado_del_mes(7, mes_con_corte=7, cargas=[cal.SIN_FECHA]) == cal.MES_OFICIAL
    assert cal.estado_del_mes(8, mes_con_corte=7, cargas=[cal.CIERRE, cal.CIERRE]) == cal.MES_CONSOLIDADO
    assert cal.estado_del_mes(9, mes_con_corte=7, cargas=[cal.PRELIMINAR, cal.CIERRE]) == cal.MES_PRELIMINAR
    assert cal.estado_del_mes(8, mes_con_corte=0, cargas=[]) == cal.MES_PRELIMINAR


def prueba_un_mes_al_que_le_faltan_datos_posteriores_esta_por_cerrar_aunque_tenga_corte_o_cierre():
    assert cal.estado_del_mes(7, mes_con_corte=7, cargas=[cal.SIN_FECHA], pendiente=True) == cal.MES_POR_CERRAR
    assert cal.estado_del_mes(8, mes_con_corte=7, cargas=[cal.CIERRE, cal.CIERRE], pendiente=True) == cal.MES_POR_CERRAR
    # Preliminar gana: antes de mirar lo que falta después, su propia carga no es la final.
    assert cal.estado_del_mes(9, mes_con_corte=7, cargas=[cal.PRELIMINAR, cal.CIERRE], pendiente=True) == cal.MES_PRELIMINAR


def prueba_una_carga_trae_el_mes_entero_solo_si_se_descargo_despues_de_terminado():
    assert cal.cubre_hasta(2026, 9, date(2026, 10, 22)) == date(2026, 9, 30)
    assert cal.cubre_hasta(2026, 9, None) == date(2026, 9, 30), "sin fecha conocida no se le quita nada"
    # Descargada el 30: el día 30 está a medio digitar, llega hasta el 29.
    assert cal.cubre_hasta(2026, 9, date(2026, 9, 30)) == date(2026, 9, 29)
    assert cal.cubre_hasta(2026, 10, date(2026, 10, 8)) == date(2026, 10, 7)


def prueba_los_datos_llegan_hasta_el_ultimo_mes_seguido_desde_enero():
    completo = date(2027, 1, 1)
    assert cal.datos_hasta(2026, {}) == date(2025, 12, 31), "sin enero no hay nada del año"
    assert cal.datos_hasta(2026, {2: completo}) == date(2025, 12, 31)
    assert cal.datos_hasta(2026, {1: completo, 2: None}) == date(2026, 2, 28)
    assert cal.datos_hasta(2026, {1: completo, 2: completo, 4: completo}) == date(2026, 2, 28), "tras un hueco no se sigue"
    # Un mes a medias corta la continuidad aunque el siguiente esté cargado.
    assert cal.datos_hasta(2026, {1: completo, 2: date(2026, 2, 20), 3: completo}) == date(2026, 2, 19)


def prueba_la_ventana_es_la_del_mes_anterior_mientras_no_cierre():
    assert cal.ventana_de_correccion(HOY) == (2026, 9)
    assert cal.ventana_de_correccion(date(2026, 10, 21)) == (2026, 9)
    assert cal.ventana_de_correccion(date(2026, 10, 22)) is None
    assert cal.ventana_de_correccion(date(2027, 1, 5)) == (2026, 12)


# ---------------------------------------------------------------------- casos

DX = date(2026, 9, 10)


def caso(**cambios) -> str:
    datos = {"es_numerador": False, "por_corregir": False, "fecha_referencia": DX, "plazo_dias": 37, "hoy": HOY}
    return t.clase_del_caso(**{**datos, **cambios})


def prueba_cada_caso_del_denominador_es_una_sola_cosa_hoy():
    assert caso(es_numerador=True, por_corregir=True) == t.A_TIEMPO
    assert caso(por_corregir=True) == t.POR_CORREGIR
    assert caso() == t.PLAZO_VIGENTE  # vence el 17/10
    assert caso(hoy=date(2026, 10, 17)) == t.PLAZO_VIGENTE
    assert caso(hoy=date(2026, 10, 18)) == t.SIN_TRATAMIENTO


def prueba_plazo_vencido_solo_se_afirma_si_los_datos_cargados_llegan_a_su_vencimiento():
    vencido = {"hoy": date(2026, 11, 20)}  # el caso venció el 17/10
    assert caso(**vencido, datos_hasta=date(2026, 9, 30)) == t.ESPERANDO_DATOS, "su tratamiento puede estar en la trama de octubre"
    assert caso(**vencido, datos_hasta=date(2026, 10, 16)) == t.ESPERANDO_DATOS
    assert caso(**vencido, datos_hasta=date(2026, 10, 17)) == t.SIN_TRATAMIENTO
    # Con el plazo vigente sigue pudiendo sumar: eso se gestiona, no se espera.
    assert caso(datos_hasta=date(2026, 9, 30)) == t.PLAZO_VIGENTE
    # Tratado es tratado, falten o no datos.
    assert caso(**vencido, es_numerador=True, datos_hasta=date(2026, 9, 30)) == t.A_TIEMPO
    assert not t.puede_sumar(t.ESPERANDO_DATOS, fecha_atencion=None, hoy=HOY)


def prueba_un_mes_con_corte_de_minsa_solo_necesita_datos_hasta_el_corte():
    vencido = {"hoy": date(2026, 11, 20), "fecha_corte": date(2026, 10, 8)}
    assert t.limite_del_caso(DX, 37) == date(2026, 10, 17)
    assert t.limite_del_caso(DX, 37, date(2026, 10, 8)) == date(2026, 10, 8)
    assert t.limite_del_caso(DX, 37, date(2026, 12, 1)) == date(2026, 10, 17), "el corte no alarga el plazo"
    assert caso(**vencido, datos_hasta=date(2026, 10, 8)) == t.SIN_TRATAMIENTO
    assert caso(**vencido, datos_hasta=date(2026, 9, 30)) == t.ESPERANDO_DATOS


def prueba_un_caso_por_corregir_suma_solo_mientras_el_his_de_su_atencion_acepte_correcciones():
    assert t.puede_sumar(t.POR_CORREGIR, fecha_atencion=date(2026, 9, 20), hoy=date(2026, 10, 21))
    assert not t.puede_sumar(t.POR_CORREGIR, fecha_atencion=date(2026, 9, 20), hoy=date(2026, 10, 22))
    assert t.puede_sumar(t.PLAZO_VIGENTE, fecha_atencion=None, hoy=HOY)
    assert not t.puede_sumar(t.SIN_TRATAMIENTO, fecha_atencion=None, hoy=HOY)
    assert not t.puede_sumar(t.A_TIEMPO, fecha_atencion=None, hoy=HOY)


# ---------------------------------------------------------------------- datos


def prueba_basta_una_fuente_que_no_se_carga_para_que_la_ficha_no_calcule():
    assert t.estado_de_datos(aplica=True, cargables=[True, True, True]) == t.DATOS_COMPLETOS
    assert t.estado_de_datos(aplica=True, cargables=[True, False]) == t.DATOS_PARCIALES
    assert t.estado_de_datos(aplica=True, cargables=[False]) == t.SIN_FUENTE
    assert t.estado_de_datos(aplica=True, cargables=[]) == t.SIN_FUENTE
    assert t.estado_de_datos(aplica=False, cargables=[True]) == t.NO_APLICA


def prueba_el_acumulado_suma_desde_enero_y_sin_denominador_no_es_cero():
    acumulados = t.acumular([(1, 9), (0, 0), (3, 22)])
    assert [(a.numerador, a.denominador) for a in acumulados] == [(1, 9), (1, 9), (4, 31)]
    assert t.acumular([(0, 0)])[0].porcentaje is None
    assert t.porcentaje(0, 5) == 0.0


def prueba_se_avisa_de_un_mes_con_muchas_mas_o_menos_filas_que_el_anterior():
    assert t.aviso_de_filas(31250, 34725) is None
    assert round(t.aviso_de_filas(20000, 34725), 2) == -0.42
    assert t.aviso_de_filas(45000, 34725) > 0.2
    assert t.aviso_de_filas(100, None) is None


def prueba_la_meta_se_cumple_desde_el_valor_exacto():
    assert t.cumple_meta(0.70, 0.70) is True
    assert t.cumple_meta(0.073, 0.70) is False
    assert t.cumple_meta(None, 0.70) is None
