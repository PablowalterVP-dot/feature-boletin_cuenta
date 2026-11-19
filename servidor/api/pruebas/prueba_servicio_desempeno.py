"""Reunir desde la base lo que las reglas de los indicadores necesitan.

Con tramas y reportes inventados, cargados como se cargan los de verdad.
"""

import csv
from datetime import date

import pytest

from app.datos.modelos import COLUMNAS_HIS
from app.dominio.desempeno.defunciones import DefuncionSinFecha
from app.dominio.desempeno.ficha_14 import Atencion, evaluar_paciente
from app.servicios import desempeno as servicio
from app.servicios.fuentes import cargar_his, cargar_sinadef, cargar_verificados
from prueba_cargar_sinadef import certificado, reporte

pytestmark = pytest.mark.bd

PACIENTE = {"id_tipo_documento_paciente": "1", "numero_documento_paciente": "11111111", "genero": "F", "edad_reg": "40", "tipo_edad": "A"}


def atencion(cita, fecha, codigo, tipo, lab="", **otros) -> dict:
    return {"id_cita": cita, "fecha_atencion": fecha, "codigo_item": codigo, "tipo_diagnostico": tipo, "valor_lab": lab, "fecha_registro": f"{fecha} 09:15:00", **PACIENTE, **otros}


def trama(carpeta, nombre: str, filas: list[dict]):
    ruta = carpeta / nombre
    with open(ruta, "w", encoding="utf-8-sig", newline="") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow([c.title() for c in COLUMNAS_HIS])
        for fila in filas:
            escritor.writerow([fila.get(c, "") for c in COLUMNAS_HIS])
    return ruta


DIAGNOSTICO = [atencion("10", "2026-03-01", "C539", "D"), atencion("10", "2026-03-01", "57500", "D", "A")]


# ------------------------------------------------------------- las atenciones


def prueba_lee_las_atenciones_de_la_ficha_ya_interpretadas(sesion, tmp_path):
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", DIAGNOSTICO))
    pacientes = servicio.atenciones_de_la_ficha_14(sesion, 2026)
    assert list(pacientes) == [("1", "11111111")]
    assert pacientes[("1", "11111111")][0] == Atencion("10", date(2026, 3, 1), "C539", "D", "", "F", 40, "A", date(2026, 3, 1))


def prueba_lo_leido_sirve_tal_cual_a_las_reglas(sesion, tmp_path):
    tratamiento = [atencion("11", "2026-03-20", "C539", "R"), atencion("11", "2026-03-20", "96402", "D", "1")]
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", DIAGNOSTICO + tratamiento))
    (filas,) = servicio.atenciones_de_la_ficha_14(sesion, 2026).values()
    (caso,) = evaluar_paciente(filas, anio=2026)
    assert caso.en_numerador and caso.fecha_tratamiento == date(2026, 3, 20)


def prueba_un_numero_escrito_con_decimal_es_el_mismo_numero(sesion, tmp_path):
    filas = [DIAGNOSTICO[0], {**DIAGNOSTICO[1], "id_tipo_documento_paciente": "1.0", "edad_reg": "40.0"}]
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", filas))
    (suyas,) = servicio.atenciones_de_la_ficha_14(sesion, 2026).values()
    assert len(suyas) == 2 and suyas[1].edad == 40


def prueba_el_mismo_numero_con_otro_tipo_de_documento_es_otra_persona(sesion, tmp_path):
    filas = [DIAGNOSTICO[0], {**DIAGNOSTICO[1], "id_tipo_documento_paciente": "2"}]
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", filas))
    assert set(servicio.atenciones_de_la_ficha_14(sesion, 2026)) == {("1", "11111111"), ("2", "11111111")}


def prueba_no_trae_otros_codigos_ni_filas_sin_documento_ni_anios_anteriores(sesion, tmp_path):
    filas = DIAGNOSTICO + [
        atencion("12", "2026-03-02", "Z000", "D"),
        atencion("13", "2026-03-02", "C539", "D", numero_documento_paciente=""),
        atencion("14", "2025-12-15", "C539", "D", numero_documento_paciente="22222222"),
    ]
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", filas))
    pacientes = servicio.atenciones_de_la_ficha_14(sesion, 2026)
    assert {k: len(v) for k, v in pacientes.items()} == {("1", "11111111"): 2}
    assert ("1", "22222222") in servicio.atenciones_de_la_ficha_14(sesion, 2025)


def prueba_un_mes_reemplazado_no_se_lee_dos_veces(sesion, tmp_path):
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", DIAGNOSTICO))
    nueva = DIAGNOSTICO + [atencion("15", "2026-03-09", "C539", "R")]
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama20042026_100000.csv", nueva))
    (suyas,) = servicio.atenciones_de_la_ficha_14(sesion, 2026).values()
    assert len(suyas) == 3


def prueba_sin_datos_cargados_no_hay_pacientes(sesion):
    assert servicio.atenciones_de_la_ficha_14(sesion, 2026) == {}


# ------------------------------------------------------------ las defunciones


def prueba_las_defunciones_salen_de_los_certificados_que_cuentan(sesion, tmp_path, monkeypatch):
    certificados = [
        certificado(1, documento="11111111", fecha="10/08/2026"),
        certificado(2, documento="11111111", fecha="08/08/2026"),
        certificado(3, documento="22222222", estado="ANULADO"),
        certificado(4, documento="33333333", tipo_doc="ACTA DE NACIMIENTO"),
        certificado(5, documento="00000000"),
    ]
    cargar_sinadef(sesion, reporte(tmp_path, monkeypatch, "agosto-2026.xls", certificados))
    d = servicio.defunciones(sesion)
    assert d.fecha_por_documento == {"11111111": date(2026, 8, 8)}
    assert (d.de_certificados, d.verificadas_a_mano) == (1, 0)


def prueba_el_corte_oculta_lo_ocurrido_o_registrado_despues(sesion, tmp_path, monkeypatch):
    certificados = [
        certificado(1, documento="11111111", fecha="05/08/2026", registro="06/08/2026"),
        certificado(2, documento="22222222", fecha="05/08/2026", registro="20/08/2026"),
        certificado(3, documento="33333333", fecha="15/08/2026", registro="15/08/2026"),
    ]
    cargar_sinadef(sesion, reporte(tmp_path, monkeypatch, "agosto-2026.xls", certificados))
    assert set(servicio.defunciones(sesion, date(2026, 8, 8)).fecha_por_documento) == {"11111111"}
    assert len(servicio.defunciones(sesion).fecha_por_documento) == 3


def prueba_las_verificadas_a_mano_se_suman_y_vale_la_fecha_mas_temprana(sesion, tmp_path, monkeypatch):
    cargar_sinadef(sesion, reporte(tmp_path, monkeypatch, "agosto-2026.xls", [certificado(1, documento="11111111", fecha="10/08/2026")]))
    ruta = tmp_path / "verificados.csv"
    ruta.write_text("numero_documento,fecha_defuncion,fecha_registro\n11111111,2026-08-07,\n44444444,2026-06-20,2026-06-21\n", encoding="utf-8")
    cargar_verificados(sesion, ruta)
    d = servicio.defunciones(sesion)
    assert d.fecha_por_documento == {"11111111": date(2026, 8, 7), "44444444": date(2026, 6, 20)}
    assert (d.de_certificados, d.verificadas_a_mano) == (1, 2)


def prueba_un_certificado_que_cuenta_sin_fecha_detiene_el_calculo(sesion, tmp_path, monkeypatch):
    cargar_sinadef(sesion, reporte(tmp_path, monkeypatch, "agosto-2026.xls", [certificado(1, documento="11111111", fecha="")]))
    with pytest.raises(DefuncionSinFecha, match="2026-08"):
        servicio.defunciones(sesion)
