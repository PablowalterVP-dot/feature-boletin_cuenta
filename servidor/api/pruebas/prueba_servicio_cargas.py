"""Traducción del informe del bot a filas, sin base de datos (`servicios/cargas.py`)."""

import pytest

from app.datos.cargas import filas_por_lote
from app.dominio.transiciones import VersionInconsistente
from app.servicios.cargas import _filas_total_declarado, _filas_valor

INDICADORES = {"f1.asistencial.desayuno": 11, "f1.asistencial.almuerzo": 12}
CUADROS = {"f1": 1}


def _informe(datos: dict) -> dict:
    return {"datos": datos, "origen": {"f1|asistencial.desayuno": {"hoja": "H", "fila": 5, "columna": "C"}}}


def prueba_una_clave_de_datos_que_no_es_un_cuadro_de_la_version_se_ignora():
    """Antes, cualquier clave nueva de `datos` (que no fuera `declarados` ni `ilegibles`)
    se tomaba por un cuadro y terminaba en un KeyError (500)."""
    informe = _informe({"f1": {"asistencial.desayuno": [10, 11]}, "editadas": {"x": 1}, "declarados": {}, "ilegibles": {}})
    filas = _filas_valor(informe, reporte_id=1, carga_id=2, cuadros=list(CUADROS), indicador_id=INDICADORES)
    assert [(f["indicador_id"], f["dia"], f["valor"], f["celda_excel"]) for f in filas] == [(11, 1, 10, "C5"), (11, 2, 11, "D5")]


def prueba_una_fila_que_la_version_no_tiene_es_una_inconsistencia_no_un_500():
    informe = _informe({"f1": {"fila-nueva.cena": [1]}})
    with pytest.raises(VersionInconsistente) as e:
        _filas_valor(informe, reporte_id=1, carga_id=2, cuadros=list(CUADROS), indicador_id=INDICADORES)
    assert e.value.datos == {"indicador": "f1.fila-nueva.cena"}


def prueba_los_totales_declarados_tambien_recorren_los_cuadros_de_la_version():
    informe = _informe({"declarados": {"f1": {"asistencial.desayuno": 21, "_total": 21}, "f9": {"x": 1}}})
    filas = _filas_total_declarado(informe, carga_id=2, cuadro_id=CUADROS, indicador_id=INDICADORES)
    assert [(f["cuadro_id"], f["indicador_id"], f["valor"]) for f in filas] == [(1, 11, 21), (1, None, 21)]


def prueba_un_lote_de_casillas_cabe_en_el_tope_de_parametros_de_postgresql():
    assert filas_por_lote(9) * 9 <= 65_535
    assert filas_por_lote(9) >= 31 * 36  # Nutrición entra en una sola sentencia
