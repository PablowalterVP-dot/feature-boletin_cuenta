"""El consolidado anual (GET /api/reportes/{formato}/anual/{año}), la
herramienta que elimina un reporte y la corrección de celdas de la carga
histórica. Contra la base real; cada prueba se deshace al terminar."""

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

import escenario as e
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import RelojFijo
from app.herramientas.cargar_historico import NoSePuede as HistoricoNoSePuede
from app.herramientas.cargar_historico import _correccion, archivo_del_mes, corregir_celdas
from app.herramientas.eliminar_reporte import NoSePuede, eliminar_reporte
from app.main import app
from prueba_api_consultas import SECRETO, cabecera

pytestmark = pytest.mark.bd


@pytest.fixture
def cliente(sesion):
    reloj = RelojFijo(e.AHORA)
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: reloj
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(database_url="postgresql://x/y", jwt_secreto=SECRETO, _env_file=None)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def mes_con_valores(sesion, mes: int, estado: str, valores: dict[str, list[int]]):
    """Un reporte de 2026 con sus casillas (se escriben en borrador, como exige
    la base) y después llevado al estado pedido."""
    r = e.abrir_reporte(sesion, "NUT", mes, "borrador")
    e.dar_carga_aceptada(sesion, r)
    for codigo, dias in valores.items():
        for d, v in enumerate(dias, start=1):
            e.escribir_valor(sesion, r, codigo, d, v)
    r.estado_reporte_id = e.ids_de(sesion)[estado]
    sesion.flush()
    return r


def consolidado(cliente, sesion, actor, anio=2026):
    sesion.commit()
    return cliente.get(f"/api/reportes/NUT/anual/{anio}", headers=cabecera(actor))


# ------------------------------------------------------------------ consolidado


def prueba_el_consolidado_suma_cada_cuadro_por_mes_y_solo_los_entregados(cliente, sesion):
    mes_con_valores(sesion, 1, "remitido", {"f1.asistencial.desayuno": [10, 20], "f1.asistencial.almuerzo": [5], "f3.completa.desayuno": [7]})
    mes_con_valores(sesion, 2, "remitido", {"f2.direccion.desayuno": [3, 3]})
    mes_con_valores(sesion, 3, "borrador", {"f1.asistencial.desayuno": [999]})
    rev = e.revisor_de_estadistica(sesion)
    r = consolidado(cliente, sesion, rev)
    assert r.status_code == 200, r.text
    meses = {m["periodo"]: m for m in r.json()["meses"]}
    assert meses["2026-01"]["totales"] == {"f1": 35, "f3": 7}
    assert meses["2026-02"]["totales"] == {"f2": 6} and meses["2026-02"]["estado"] == "remitido"
    assert "2026-03" not in meses, "un borrador no salió del área: no cuenta"


def prueba_el_consolidado_se_ve_desde_el_area_y_estadistica_no_desde_otra_area(cliente, sesion):
    mes_con_valores(sesion, 1, "remitido", {"f1.asistencial.desayuno": [1]})
    assert consolidado(cliente, sesion, e.digitador_de_nutricion(sesion)).status_code == 200
    otra = e.persona(sesion, "dig.far", ("digitador", "farmacia"))
    assert consolidado(cliente, sesion, otra).status_code == 403


def prueba_un_reporte_eliminado_no_cuenta_en_el_consolidado(cliente, sesion):
    mes_con_valores(sesion, 8, "remitido", {"f1.asistencial.desayuno": [100]})
    eliminar_reporte(sesion, "NUT", "2026-08", motivo="Las cifras de agosto eran incorrectas", usuario="superadmin")
    assert consolidado(cliente, sesion, e.revisor_de_estadistica(sesion)).json()["meses"] == []


# ------------------------------------------------------------- eliminar_reporte


def prueba_eliminar_deja_el_periodo_libre_y_conserva_la_historia(cliente, sesion):
    r = e.abrir_reporte(sesion, "NUT", 8, "remitido", folio="CR-2026-08-NUT")
    eliminado = eliminar_reporte(sesion, "NUT", "2026-08", motivo="Las cifras de agosto eran incorrectas", usuario="superadmin")
    assert eliminado.id == r.id and r.fecha_eliminacion is not None
    assert r.folio_constancia.startswith("CR-2026-08-NUT-ANULADA"), "la constancia queda libre para el reporte nuevo"
    assert "incorrectas" in r.observacion
    sesion.commit()
    detalle = cliente.get("/api/reportes/NUT/2026-08", headers=cabecera(e.revisor_de_estadistica(sesion)))
    assert detalle.json()["estado"] == "no_iniciado"
    nuevo = e.abrir_reporte(sesion, "NUT", 8, "remitido", folio="CR-2026-08-NUT")
    assert nuevo.id != r.id


def prueba_eliminar_exige_motivo_y_un_reporte_que_exista(sesion):
    e.abrir_reporte(sesion, "NUT", 8, "remitido")
    with pytest.raises(NoSePuede, match="motivo"):
        eliminar_reporte(sesion, "NUT", "2026-08", motivo="porque sí")
    with pytest.raises(NoSePuede, match="No hay un reporte"):
        eliminar_reporte(sesion, "NUT", "2026-07", motivo="Las cifras de julio eran incorrectas")


# ------------------------------------------------------------ carga histórica


def _xlsx_con_texto(hoja: str, celda: str, texto: str) -> bytes:
    """Un .xlsx mínimo: una hoja con un texto compartido en `celda` y una fórmula
    con su resultado guardado."""
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w") as z:
        z.writestr("xl/workbook.xml", f'<workbook xmlns:r="r"><sheets><sheet name="{hoja}" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/sharedStrings.xml", f"<sst><si><t>{texto}</t></si></sst>")
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet><sheetData><row r="16"><c r="{celda}" s="3" t="s"><v>0</v></c><c r="AE16"><f>SUM(C16:AD16)</f><v>432</v></c></row><row r="17"><c r="AE17"><f t="shared" si="0"/><v>450</v></c></row></sheetData></worksheet>')
    return salida.getvalue()


def prueba_corregir_celdas_cambia_el_texto_por_el_numero_y_quita_los_resultados_guardados():
    original = _xlsx_con_texto("PACIENTES HOSP", "N16", "18+")
    corregido = corregir_celdas(original, [("PACIENTES HOSP", "N16", 18)])
    hoja = zipfile.ZipFile(io.BytesIO(corregido)).read("xl/worksheets/sheet1.xml").decode()
    assert '<c r="N16" s="3"><v>18</v></c>' in hoja, "número, sin tipo de texto, con su estilo"
    assert "<v>432</v>" not in hoja and "<f>SUM(C16:AD16)</f>" in hoja, "la fórmula queda, su resultado viejo no"
    assert "<v>450</v>" not in hoja, "también en una fórmula compartida, como las del Excel real"
    assert zipfile.ZipFile(io.BytesIO(original)).read("xl/worksheets/sheet1.xml") != hoja.encode(), "el original no se toca"


def prueba_corregir_celdas_rechaza_una_hoja_o_una_celda_que_no_existen():
    original = _xlsx_con_texto("PACIENTES HOSP", "N16", "18+")
    with pytest.raises(HistoricoNoSePuede, match="hoja"):
        corregir_celdas(original, [("OTRA HOJA", "N16", 18)])
    with pytest.raises(HistoricoNoSePuede, match="celda"):
        corregir_celdas(original, [("PACIENTES HOSP", "Z99", 18)])


def prueba_la_correccion_se_escribe_como_periodo_hoja_celda_valor():
    assert _correccion("2026-02|PACIENTES HOSP|N16=18") == ("2026-02", "PACIENTES HOSP", "N16", 18.0)
    with pytest.raises(HistoricoNoSePuede):
        _correccion("febrero N16 18")


def prueba_un_libro_anual_sirve_para_todos_los_meses_y_una_carpeta_da_el_excel_de_cada_uno(tmp_path):
    libro = tmp_path / "Oficios_Laboratorio.xlsx"
    libro.write_bytes(b"PK")
    assert archivo_del_mes(libro, "2026-01") == libro and archivo_del_mes(libro, "2026-09") == libro, "el bot elige la hoja del mes"
    (tmp_path / "SEPTIEMBRE.xlsx").write_bytes(b"PK")
    assert archivo_del_mes(tmp_path, "2026-09") == tmp_path / "SEPTIEMBRE.xlsx"
    assert archivo_del_mes(tmp_path, "2026-08") is None
