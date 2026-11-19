"""Laboratorio de punta a punta: el catálogo (`cargar_catalogo_laboratorio`) y la
carga de su Excel, un formato **mensual** (una cifra por casilla, sin días).

La carga va contra el **bot real** (`@pytest.mark.node`), con la plantilla que
genera el propio bot (`apoyo_plantilla_laboratorio.mjs`), igual que
`prueba_api_cargas.py` hace con Nutrición: se reutilizan su bot y su cliente.
"""

import base64
import json
import re
import subprocess

import pytest
from sqlalchemy import func, select

import escenario as e
from app.config import RAIZ_BACKEND
from app.datos import cargas as repo_cargas
from app.datos.base import vigente
from app.datos.modelos import Carga, CriterioReconocimiento, Cuadro, Formato, FormatoVersion, Hallazgo, Indicador, TotalDeclarado, Valor, VersionIndicador
from app.herramientas.cargar_catalogo_laboratorio import NoSePuede, cargar_catalogo, leer_catalogo
from prueba_api_cargas import _node, bot_real, cabecera, cliente, subir  # noqa: F401 (fixtures del bot real y del cliente)

pytestmark = pytest.mark.bd

APOYO = RAIZ_BACKEND / "pruebas" / "apoyo_plantilla_laboratorio.mjs"
EXPORTADOR = RAIZ_BACKEND.parent / "scripts" / "exportar-catalogo-laboratorio.mjs"
CATALOGO = leer_catalogo()
CASILLAS = sum(len(c["examenes"]) * len(c["procedencias"]) for c in CATALOGO["cuadros"])  # exámenes × procedencias de su sección
CUADROS = len(CATALOGO["cuadros"])
CON_FILA_TOTAL = sum(1 for c in CATALOGO["cuadros"] if c["etiqueta_total"])


def plantilla(periodo: str = "2026-08", roturas: list[dict] | None = None, factor: int = 1) -> bytes:
    r = subprocess.run([_node(), str(APOYO), periodo, json.dumps(roturas or []), str(factor)], capture_output=True, text=True, encoding="utf-8", cwd=APOYO.parent, timeout=30)
    assert r.returncode == 0, r.stderr
    return base64.b64decode(r.stdout)


def version_lab1(bd) -> FormatoVersion:
    return bd.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == "LAB", FormatoVersion.codigo_version == "LAB-1", vigente(FormatoVersion)))


@pytest.fixture
def dig(sesion):
    return e.persona(sesion, "dig.lab", ("digitador", "laboratorio"))


def subir_lab(cliente, sesion, dig, **kw):
    contenido = kw.pop("contenido", None) or plantilla(kw.get("periodo", "2026-08"))
    return subir(cliente, sesion, dig, formato="LAB", contenido=contenido, nombre=f"Laboratorio_{kw.get('periodo', '2026-08')}.xlsx", **kw)


# ------------------------------------------------------------------ catálogo


def prueba_crea_el_formato_mensual_y_activa_lab1_con_todos_sus_cuadros_e_indicadores(sesion):
    mensaje = cargar_catalogo(sesion)
    assert f"{CUADROS} cuadros, {CASILLAS} indicadores" in mensaje
    v = version_lab1(sesion)
    formato = sesion.get(Formato, v.formato_id)
    assert (formato.granularidad, v.estado, v.tipo_archivo) == ("mensual", "activa", "xlsx")
    assert sesion.scalar(select(func.count()).select_from(Cuadro).where(Cuadro.formato_version_id == v.id)) == CUADROS
    assert all(c.es_hoja_patron and re.fullmatch(c.hoja, "SET") for c in sesion.scalars(select(Cuadro).where(Cuadro.formato_version_id == v.id)))
    assert sesion.scalar(select(func.count()).select_from(VersionIndicador).where(VersionIndicador.formato_version_id == v.id)) == CASILLAS
    assert sesion.scalar(select(Indicador.codigo).where(Indicador.formato_id == formato.id, Indicador.codigo == "bioquimica.glucosa.emergencia")) is not None
    assert sesion.scalar(select(Indicador.codigo).where(Indicador.formato_id == formato.id, Indicador.codigo == "metaxenicas.tuberculosis.programa")) is not None
    criterio = sesion.scalar(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == v.id))
    assert (criterio.tipo, criterio.es_patron) == ("hoja_existe", True)


def prueba_es_idempotente(sesion):
    cargar_catalogo(sesion)
    assert "ya está activa" in cargar_catalogo(sesion)
    assert sesion.scalar(select(func.count()).select_from(Indicador).join(Formato).where(Formato.codigo == "LAB")) == CASILLAS


def prueba_recargar_rehace_el_catalogo_sin_duplicar(sesion):
    cargar_catalogo(sesion)
    cargar_catalogo(sesion, recargar=True)
    v = version_lab1(sesion)
    assert v.estado == "activa"
    assert sesion.scalar(select(func.count()).select_from(VersionIndicador).where(VersionIndicador.formato_version_id == v.id)) == CASILLAS


def prueba_sin_el_json_dice_como_generarlo(tmp_path):
    with pytest.raises(NoSePuede, match="exportar-catalogo-laboratorio"):
        leer_catalogo(tmp_path / "no-existe.json")


@pytest.mark.node
def prueba_el_json_del_catalogo_es_el_que_exporta_el_bot():
    """Si alguien cambia la definición del bot y no regenera el JSON, la base
    quedaría con otra estructura que la que lee el bot."""
    if _node() is None:
        pytest.skip("node no está en el PATH.")
    r = subprocess.run([_node(), str(EXPORTADOR), "--stdout"], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout) == leer_catalogo(), "Regenere el JSON: node servidor/scripts/exportar-catalogo-laboratorio.mjs"


# --------------------------------------------------------------------- carga


def prueba_una_plantilla_llena_guarda_una_casilla_por_examen_y_procedencia_sin_dia(cliente, sesion, dig):
    cargar_catalogo(sesion)
    r = subir_lab(cliente, sesion, dig)
    assert r.status_code == 200, r.text
    informe = r.json()["informe"]
    assert (r.json()["resultado"], informe["plantilla"]["version"]) == ("aceptada", "LAB-1")
    assert (informe["errores"], informe["avisos"]) == ([], [])

    reporte = e.reporte_de(sesion, 8, "LAB")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    assert carga.casillas_leidas == CASILLAS
    assert sesion.scalar(select(func.count()).select_from(Valor).where(Valor.reporte_id == reporte.id)) == CASILLAS
    assert sesion.scalar(select(func.count()).select_from(Valor).where(Valor.reporte_id == reporte.id, Valor.dia.is_not(None))) == 0


def prueba_el_linaje_de_una_casilla_es_su_celda(cliente, sesion, dig):
    cargar_catalogo(sesion)
    subir_lab(cliente, sesion, dig)
    reporte = e.reporte_de(sesion, 8, "LAB")
    v = sesion.scalar(
        select(Valor).join(Indicador, Indicador.id == Valor.indicador_id).where(Valor.reporte_id == reporte.id, Indicador.codigo == "bioquimica.acido_urico.emergencia")
    )
    assert (v.valor, v.hoja_excel) == (10, "AGO")  # la hoja del mes, como en el libro del área
    assert v.celda_excel.startswith("C")  # Emergencia es la columna C


def prueba_el_total_de_cada_seccion_se_guarda_como_total_declarado_del_cuadro(cliente, sesion, dig):
    cargar_catalogo(sesion)
    subir_lab(cliente, sesion, dig)
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == e.reporte_de(sesion, 8, "LAB").id, Carga.es_vigente))
    totales = sesion.scalars(select(TotalDeclarado).where(TotalDeclarado.carga_id == carga.id)).all()
    assert len(totales) == CON_FILA_TOTAL and all(t.indicador_id is None for t in totales)


def prueba_un_texto_en_una_casilla_es_un_error_atado_a_su_indicador_y_conserva_el_texto(cliente, sesion, dig):
    cargar_catalogo(sesion)
    r = subir_lab(cliente, sesion, dig, contenido=plantilla(roturas=[{"cuadro": "bioquimica", "fila": "glucosa.emergencia", "valor": "cien"}]))
    assert [h["regla"] for h in r.json()["informe"]["errores"]] == ["no-numerico"]

    reporte = e.reporte_de(sesion, 8, "LAB")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    hallazgo = sesion.scalar(select(Hallazgo).where(Hallazgo.carga_id == carga.id))
    indicador = sesion.get(Indicador, hallazgo.indicador_id)
    assert (hallazgo.clave_hallazgo, indicador.codigo, hallazgo.dia) == ("no-numerico|bioquimica|glucosa.emergencia", "bioquimica.glucosa.emergencia", None)
    v = sesion.scalar(select(Valor).where(Valor.reporte_id == reporte.id, Valor.indicador_id == indicador.id))
    assert (v.valor, v.texto_original) == (None, "cien")


def prueba_las_casillas_se_leen_sin_dia_y_con_una_esperada(cliente, sesion, dig):
    cargar_catalogo(sesion)
    subir_lab(cliente, sesion, dig)
    sesion.commit()
    r = cliente.get("/api/reportes/LAB/2026-08/valores", headers=cabecera(dig))
    assert r.status_code == 200, r.text
    cuadros = {c["cuadro"]: c for c in r.json()["cuadros"]}
    assert len(cuadros) == CUADROS
    glucosa = next(i for i in cuadros["bioquimica"]["indicadores"] if i["indicador"] == "bioquimica.glucosa.emergencia")
    assert glucosa["casillas_esperadas"] == 1
    assert [(c["dia"], float(c["valor"])) for c in glucosa["casillas"]] == [(None, 10.0)]


def prueba_la_alerta_de_semana_incompleta_no_corre_en_un_formato_mensual(cliente, sesion, dig):
    """Agosto es el periodo vigente el 13/09/2026: sin esto, cada semana del mes
    saldría como «sin datos», porque Laboratorio no tiene días."""
    cargar_catalogo(sesion)
    subir_lab(cliente, sesion, dig)
    sesion.commit()
    r = cliente.get("/api/reportes/LAB/2026-08/alertas", headers=cabecera(dig))
    assert r.status_code == 200, r.text
    assert r.json()["alertas"] == []


def prueba_el_mes_anterior_llega_al_bot_por_seccion_y_dispara_la_variacion(cliente, sesion, dig):
    cargar_catalogo(sesion)
    julio = subir_lab(cliente, sesion, dig, periodo="2026-07", contenido=plantilla("2026-07", factor=2))
    assert julio.json()["resultado"] == "aceptada", julio.text
    sesion.commit()
    assert cliente.post("/api/reportes/LAB/2026-07/transiciones/enviar", headers=cabecera(dig)).status_code == 200

    datos = repo_cargas.datos_para_bot(sesion, e.reporte_de(sesion, 7, "LAB").id, 31, mensual=True)
    assert datos["bioquimica"]["glucosa.emergencia"] == 20

    agosto = subir_lab(cliente, sesion, dig)
    variaciones = sorted(a["formato"] for a in agosto.json()["informe"]["avisos"] if a["regla"] == "variacion")
    assert len(variaciones) == CUADROS  # todas las secciones bajan a la mitad


def prueba_con_lab1_activa_laboratorio_entra_al_flujo(cliente, sesion, dig):
    cargar_catalogo(sesion)
    sesion.commit()
    r = cliente.get("/api/configuracion")
    assert r.status_code == 200, r.text
    assert "laboratorio" in [a["clave"] for a in r.json()["areas_en_flujo"]]
