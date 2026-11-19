"""`dominio/plazos.py`: qué día vence la entrega de un área a un destino,
sin base de datos (los parámetros ya vienen leídos, como un diccionario)."""

import logging

from app.dominio import plazos


def prueba_usa_el_plazo_propio_del_area_si_existe():
    parametros = {"plazo.NEF.estadistica": "7", "plazo.default.estadistica": "5"}
    assert plazos.dia_de_entrega(parametros, "NEF", "estadistica") == 7


def prueba_cae_al_respaldo_del_destino_sin_plazo_propio():
    parametros = {"plazo.default.estadistica": "5"}
    assert plazos.dia_de_entrega(parametros, "NUT", "estadistica") == 5


def prueba_cae_al_respaldo_final_sin_nada_configurado():
    assert plazos.dia_de_entrega({}, "NUT", "estadistica") == 10
    assert plazos.dia_de_entrega({}, "NUT", "estadistica", respaldo_final=1) == 1


def prueba_un_valor_que_no_es_entero_no_revienta_usa_el_respaldo_y_lo_registra(caplog):
    parametros = {"plazo.NUT.estadistica": "cinco", "plazo.default.estadistica": "5"}
    with caplog.at_level(logging.WARNING):
        dia = plazos.dia_de_entrega(parametros, "NUT", "estadistica")
    assert dia == 5
    assert "plazo.NUT.estadistica" in caplog.text and "no es un entero" in caplog.text


def prueba_un_valor_fuera_de_rango_no_revienta_usa_el_respaldo_y_lo_registra(caplog):
    parametros = {"plazo.NUT.estadistica": "31", "plazo.default.estadistica": "5"}
    with caplog.at_level(logging.WARNING):
        dia = plazos.dia_de_entrega(parametros, "NUT", "estadistica")
    assert dia == 5
    assert "plazo.NUT.estadistica" in caplog.text and "fuera de" in caplog.text


def prueba_el_respaldo_tambien_puede_ser_invalido_y_cae_al_final(caplog):
    parametros = {"plazo.default.estadistica": "0"}  # fuera de 1-28
    with caplog.at_level(logging.WARNING):
        dia = plazos.dia_de_entrega(parametros, "NUT", "estadistica", respaldo_final=9)
    assert dia == 9
    assert "Sin" in caplog.text and "configurar_plazos" in caplog.text
