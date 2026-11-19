"""El dominio de la alerta «semana con datos faltantes»: puro, sin base."""

from datetime import date

import pytest

from app.dominio import alertas


# --------------------------------------------------------- días transcurridos


def prueba_un_dia_futuro_nunca_cuenta_como_transcurrido():
    """Caso defensivo: hoy la alerta siempre mira el periodo vigente (el mes
    anterior, ya cerrado), pero la función no asume eso — decide por fecha."""
    dias = alertas.dias_transcurridos("2026-08", date(2026, 8, 12))
    assert dias == list(range(1, 13)) and 13 not in dias


def prueba_un_periodo_ya_cerrado_trae_todos_sus_dias():
    assert alertas.dias_transcurridos("2026-08", date(2026, 9, 13)) == list(range(1, 32))


def prueba_un_periodo_todavia_no_empezado_no_tiene_dias():
    assert alertas.dias_transcurridos("2026-09", date(2026, 8, 1)) == []


# --------------------------------------------------------------- semana cerrada


def prueba_la_semana_en_curso_no_se_evalua():
    """Agosto de 2026 empieza en sábado: la primera semana cierra el día 2
    (domingo). Si hoy es el 5 de agosto, el 3-5 todavía no cerró."""
    cerradas = alertas.semanas_cerradas("2026-08", alertas.dias_transcurridos("2026-08", date(2026, 8, 5)))
    assert cerradas == [[1, 2]]


# ------------------------------------------------- semanas con datos faltantes


def prueba_sin_ninguna_subida_no_alerta():
    """No hay de qué alertar «a mitad de mes»: para eso está la alerta de plazo."""
    assert alertas.semanas_con_datos_faltantes({}, "2026-08", date(2026, 9, 13), 1) == ()


def prueba_una_subida_parcial_con_una_semana_cerrada_con_huecos_alerta():
    # Todo agosto con dato, salvo la semana del 3 al 9.
    tiene_dato = {d: True for d in range(1, 32) if not (3 <= d <= 9)}
    resultado = alertas.semanas_con_datos_faltantes(tiene_dato, "2026-08", date(2026, 9, 13), 1)
    assert len(resultado) == 1
    alerta = resultado[0]
    assert (alerta.primer_dia, alerta.ultimo_dia) == (3, 9)
    assert alerta.dias_sin_dato == (3, 4, 5, 6, 7, 8, 9)


def prueba_dias_futuros_nunca_entran_en_el_hueco():
    """Si hoy cayera dentro del propio mes (caso defensivo, ver arriba), un
    día futuro no debe aparecer como «sin dato»: no debe aparecer en
    absoluto. Con hoy el 5 de agosto, los días 3-5 son la semana en curso
    (cierra el domingo 9, que todavía no llegó) y ni siquiera se evalúan;
    solo la semana ya cerrada 1-2 puede alertar."""
    tiene_dato = {1: True}  # el único día subido
    resultado = alertas.semanas_con_datos_faltantes(tiene_dato, "2026-08", date(2026, 8, 5), 1)
    assert len(resultado) == 1 and resultado[0].dias_sin_dato == (2,)
    assert all(d <= 5 for alerta in resultado for d in alerta.dias_sin_dato)


def prueba_el_umbral_filtra_semanas_con_pocos_huecos():
    # Falta un solo día (el 2) de la semana 1-2: con umbral 2, no alcanza.
    tiene_dato = {1: True, **{d: True for d in range(3, 32)}}
    assert alertas.semanas_con_datos_faltantes(tiene_dato, "2026-08", date(2026, 9, 13), 2) == ()
    assert len(alertas.semanas_con_datos_faltantes(tiene_dato, "2026-08", date(2026, 9, 13), 1)) == 1


# ------------------------------------------------------- umbral por parámetro


def prueba_usa_el_umbral_propio_del_area():
    assert alertas.dias_minimos_para_alertar({alertas.clave("NUT"): "3", alertas.clave("default"): "1"}, "NUT") == 3


def prueba_sin_umbral_propio_cae_al_respaldo_del_destino():
    assert alertas.dias_minimos_para_alertar({alertas.clave("default"): "2"}, "NUT") == 2


def prueba_sin_nada_sembrado_cae_al_respaldo_final():
    assert alertas.dias_minimos_para_alertar({}, "NUT") == 1


def prueba_un_umbral_invalido_no_revienta_cae_al_siguiente_respaldo(caplog):
    parametros = {alertas.clave("NUT"): "no-es-numero", alertas.clave("default"): "2"}
    with caplog.at_level("WARNING"):
        assert alertas.dias_minimos_para_alertar(parametros, "NUT") == 2
    assert "no es un entero" in caplog.text


def prueba_un_umbral_fuera_de_rango_cae_al_respaldo():
    assert alertas.dias_minimos_para_alertar({alertas.clave("default"): "9"}, "NUT") == 1
