"""Qué defunciones cuentan y desde cuándo se conocen. Con documentos inventados."""

from datetime import date

from app.dominio.desempeno.defunciones import Defuncion, certificado_cuenta, conocida_al, dni_de, fecha_por_documento

CORTE = date(2026, 8, 8)


def prueba_solo_cuenta_el_certificado_general_con_dni_y_sin_anular():
    assert certificado_cuenta("CDEF GRAL EN LINEA", "FIRMADO", "DNI/LE")
    assert certificado_cuenta(" CDEF GRAL EN LINEA ", "REGISTRADO", "DNI/LE")
    assert not certificado_cuenta("CDEF GRAL EN LINEA", "ANULADO", "DNI/LE")
    assert not certificado_cuenta("CDEF GRAL EN LINEA", "FIRMADO", "ACTA DE NACIMIENTO")
    assert not certificado_cuenta("CDEF FETAL", "FIRMADO", "DNI/LE")
    assert not certificado_cuenta(None, None, None)


def prueba_el_dni_son_ocho_digitos_y_no_ocho_ceros():
    assert dni_de("12345678") == "12345678"
    assert dni_de(" 12345678.0 ") == "12345678"
    for malo in (None, "", "1234567", "123456789", "00000000", "W123456T"):
        assert dni_de(malo) is None


def prueba_al_corte_solo_se_conoce_lo_ocurrido_y_registrado_hasta_ese_dia():
    assert conocida_al(Defuncion("12345678", CORTE, CORTE), CORTE)
    assert not conocida_al(Defuncion("12345678", date(2026, 8, 9), None), CORTE)
    assert not conocida_al(Defuncion("12345678", date(2026, 8, 1), date(2026, 8, 9)), CORTE)
    assert conocida_al(Defuncion("12345678", date(2026, 8, 1), None), CORTE)
    assert conocida_al(Defuncion("12345678", date(2026, 9, 1), date(2026, 9, 2)), None)


def prueba_de_varios_certificados_vale_la_fecha_mas_temprana():
    defunciones = [
        Defuncion("12345678", date(2026, 3, 10)),
        Defuncion("12345678", date(2026, 3, 8)),
        Defuncion("87654321", date(2026, 5, 1)),
    ]
    assert fecha_por_documento(defunciones) == {"12345678": date(2026, 3, 8), "87654321": date(2026, 5, 1)}


def prueba_el_corte_puede_dejar_valer_un_certificado_posterior_al_mas_temprano():
    # El más temprano se registró después del corte: ese día no se conocía.
    defunciones = [
        Defuncion("12345678", date(2026, 8, 1), date(2026, 8, 20)),
        Defuncion("12345678", date(2026, 8, 3), date(2026, 8, 4)),
    ]
    assert fecha_por_documento(defunciones, CORTE) == {"12345678": date(2026, 8, 3)}
    assert fecha_por_documento(defunciones) == {"12345678": date(2026, 8, 1)}
