"""Lo que decide `recargar_horas_cqx` sin tocar la base: qué carga se revisa y qué
horas trae el informe del bot. Lo demás (rectificar y reenviar) es el flujo de
siempre, con sus propias pruebas."""

from decimal import Decimal

from app.herramientas import recargar_horas_cqx as r


def prueba_solo_se_revisan_las_cargas_del_bot_anterior():
    assert r._version("0.2.0") < r.VERSION_CORREGIDA
    assert r._version("0.3.0") >= r.VERSION_CORREGIDA
    assert r._version("0.10.1") >= r.VERSION_CORREGIDA
    assert r._version(None) < r.VERSION_CORREGIDA
    assert r._version("x") < r.VERSION_CORREGIDA


def prueba_las_horas_del_informe_son_las_filas_de_horas_con_cifra():
    informe = {"datos": {
        "resumen": {"horas_efectivas.programada": 997.95, "horas_acto.emergencia": None, "realizadas.programada": 120},
        "indicadores": {"horas_programadas": 1008},
        "ilegibles": {},
        "procedimientos": {"mayor": {}},
    }}
    assert r._horas_del_informe(informe) == {
        "resumen.horas_efectivas.programada": Decimal("997.95"),
        "indicadores.horas_programadas": Decimal("1008.00"),
    }


def prueba_la_tolerancia_cubre_el_redondeo_de_los_dias():
    # 997:57 son 41,58125 días; guardados con dos decimales, 41,58: por 24, 997,92.
    guardada, en_horas = Decimal("41.58"), Decimal("997.95")
    assert abs(en_horas - guardada * 24) <= r.TOLERANCIA
