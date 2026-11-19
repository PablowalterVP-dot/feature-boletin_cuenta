"""Centro Quirúrgico de punta a punta: el catálogo (`cargar_catalogo_centro_quirurgico`)
y la carga de su libro del mes, un formato **mensual** (una cifra por casilla, sin
días).

La carga va contra el **bot real** (`@pytest.mark.node`), con el libro que genera
el propio bot (`apoyo_plantilla_centro_quirurgico.mjs`), igual que
`prueba_laboratorio.py`: se reutilizan su bot y su cliente.
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
from app.herramientas.cargar_catalogo_centro_quirurgico import NoSePuede, cargar_catalogo, leer_catalogo, patron_de_hoja
from prueba_api_cargas import _node, bot_real, cabecera, cliente, subir  # noqa: F401 (fixtures del bot real y del cliente)

pytestmark = pytest.mark.bd

APOYO = RAIZ_BACKEND / "pruebas" / "apoyo_plantilla_centro_quirurgico.mjs"
EXPORTADOR = RAIZ_BACKEND.parent / "scripts" / "exportar-catalogo-centro-quirurgico.mjs"
CATALOGO = leer_catalogo()
INDICADORES = sum(len(c["filas"]) for c in CATALOGO["cuadros"])
OCASIONALES = sum(1 for c in CATALOGO["cuadros"] for f in c["filas"] if f["ocasional"])
CUADROS = len(CATALOGO["cuadros"])


def plantilla(periodo: str = "2026-08", roturas: list[dict] | None = None, factor: int = 1) -> bytes:
    r = subprocess.run([_node(), str(APOYO), periodo, json.dumps(roturas or []), str(factor)], capture_output=True, text=True, encoding="utf-8", cwd=APOYO.parent, timeout=30)
    assert r.returncode == 0, r.stderr
    return base64.b64decode(r.stdout)


def version_cqx1(bd) -> FormatoVersion:
    return bd.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == "CQX", FormatoVersion.codigo_version == "CQX-1", vigente(FormatoVersion)))


@pytest.fixture
def dig(sesion):
    return e.persona(sesion, "dig.cqx", ("digitador", "centro-quirurgico"))


def subir_cqx(cliente, sesion, dig, **kw):
    periodo = kw.get("periodo", "2026-08")
    contenido = kw.pop("contenido", None) or plantilla(periodo)
    return subir(cliente, sesion, dig, formato="CQX", contenido=contenido, nombre=f"ESTADISTICA_CENTRO_QUIRURGICO_{periodo}.xlsx", **kw)


# ------------------------------------------------------------------ catálogo


def prueba_crea_el_formato_mensual_y_activa_cqx1_con_sus_cinco_cuadros(sesion):
    mensaje = cargar_catalogo(sesion)
    assert f"{CUADROS} cuadros, {INDICADORES} indicadores" in mensaje
    v = version_cqx1(sesion)
    formato = sesion.get(Formato, v.formato_id)
    assert (formato.granularidad, v.estado, v.tipo_archivo) == ("mensual", "activa", "xlsx")
    cuadros = {c.codigo: c for c in sesion.scalars(select(Cuadro).where(Cuadro.formato_version_id == v.id))}
    assert set(cuadros) == {"resumen", "indicadores", "suspendidas", "mayor", "menor"}
    # La hoja es un patrón: los nombres reales traen espacios, y en enero el cuadro se llama INDICADORES.
    assert re.fullmatch(cuadros["mayor"].hoja, "CIRUGIA MAYOR ") and re.fullmatch(cuadros["indicadores"].hoja, "INDICADORES")
    assert sesion.scalar(select(func.count()).select_from(VersionIndicador).where(VersionIndicador.formato_version_id == v.id)) == INDICADORES
    assert len(sesion.scalars(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == v.id)).all()) == 2


def prueba_las_horas_son_decimales_y_lo_ocasional_no_es_obligatorio(sesion):
    cargar_catalogo(sesion)
    formato = sesion.get(Formato, version_cqx1(sesion).formato_id)
    por_codigo = {i.codigo: i for i in sesion.scalars(select(Indicador).where(Indicador.formato_id == formato.id))}
    assert por_codigo["resumen.horas_efectivas.emergencia"].tipo_dato == "decimal"
    assert por_codigo["mayor.obstetricia"].tipo_dato == "entero"
    assert not por_codigo["indicadores.encefalopatia"].es_obligatorio
    assert sum(1 for i in por_codigo.values() if not i.es_obligatorio) == OCASIONALES
    assert "mayor.nefrologia" not in por_codigo and "menor.nefrologia" in por_codigo


def prueba_es_idempotente_y_recargar_no_duplica(sesion):
    cargar_catalogo(sesion)
    assert "ya está activa" in cargar_catalogo(sesion)
    cargar_catalogo(sesion, recargar=True)
    assert sesion.scalar(select(func.count()).select_from(Indicador).join(Formato).where(Formato.codigo == "CQX")) == INDICADORES


def prueba_sin_el_json_dice_como_generarlo(tmp_path):
    with pytest.raises(NoSePuede, match="exportar-catalogo-centro-quirurgico"):
        leer_catalogo(tmp_path / "no-existe.json")


def prueba_el_patron_de_hoja_tolera_espacios_y_no_otra_hoja():
    patron = patron_de_hoja(["CUADRO DE INDICADORES", "INDICADORES"])
    assert re.fullmatch(patron, "CUADRO DE INDICADORES") and re.fullmatch(patron, " INDICADORES  ")
    assert not re.fullmatch(patron, "INDICADORES FORMULA ")


@pytest.mark.node
def prueba_el_json_del_catalogo_es_el_que_exporta_el_bot():
    """Si alguien cambia la definición del bot y no regenera el JSON, la base
    quedaría con otra estructura que la que lee el bot."""
    if _node() is None:
        pytest.skip("node no está en el PATH.")
    r = subprocess.run([_node(), str(EXPORTADOR), "--stdout"], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout) == leer_catalogo(), "Regenere el JSON: node servidor/scripts/exportar-catalogo-centro-quirurgico.mjs"


# --------------------------------------------------------------------- carga


def prueba_un_libro_coherente_se_acepta_y_guarda_una_casilla_por_indicador_sin_dia(cliente, sesion, dig):
    cargar_catalogo(sesion)
    r = subir_cqx(cliente, sesion, dig)
    assert r.status_code == 200, r.text
    informe = r.json()["informe"]
    assert (r.json()["resultado"], informe["plantilla"]["version"]) == ("aceptada", "CQX-1")
    assert (informe["errores"], informe["avisos"]) == ([], [])

    reporte = e.reporte_de(sesion, 8, "CQX")
    valores = sesion.scalars(select(Valor).where(Valor.reporte_id == reporte.id)).all()
    # Todas las filas menos las ocasionales que el mes no trae.
    assert len(valores) == INDICADORES - OCASIONALES
    assert all(v.dia is None for v in valores)


def prueba_el_detalle_de_procedimientos_queda_en_el_informe_no_en_la_base(cliente, sesion, dig):
    cargar_catalogo(sesion)
    subir_cqx(cliente, sesion, dig)
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == e.reporte_de(sesion, 8, "CQX").id, Carga.es_vigente))
    detalle = carga.informe_bot["datos"]["procedimientos"]["mayor"]["obstetricia"]
    assert detalle[0]["rotulo"] == "Cesarea" and "valor" in detalle[0]
    assert sesion.scalar(select(func.count()).select_from(Indicador).join(Formato).where(Formato.codigo == "CQX", Indicador.codigo.like("%cesarea%"))) == 0


def prueba_las_horas_se_guardan_con_sus_decimales_y_su_celda(cliente, sesion, dig):
    cargar_catalogo(sesion)
    subir_cqx(cliente, sesion, dig)
    v = sesion.scalar(
        select(Valor).join(Indicador, Indicador.id == Valor.indicador_id).where(Valor.reporte_id == e.reporte_de(sesion, 8, "CQX").id, Indicador.codigo == "resumen.horas_programadas.programada")
    )
    assert float(v.valor) == 34.75
    assert v.hoja_excel == "Resumen" and v.celda_excel == "P7"  # agosto: la octava pareja de columnas; la tercera fila de datos


def prueba_el_sub_total_de_cada_hoja_y_cada_especialidad_se_guardan_como_declarados(cliente, sesion, dig):
    cargar_catalogo(sesion)
    subir_cqx(cliente, sesion, dig)
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == e.reporte_de(sesion, 8, "CQX").id, Carga.es_vigente))
    totales = sesion.scalars(select(TotalDeclarado).where(TotalDeclarado.carga_id == carga.id)).all()
    del_cuadro = [t for t in totales if t.indicador_id is None]
    assert len(del_cuadro) == 3  # Sub Total de mayor y de menor, TOTAL de las causas
    assert len(totales) - len(del_cuadro) > 20  # la fila escrita de cada especialidad


def prueba_un_texto_en_una_causa_es_un_error_atado_a_su_indicador(cliente, sesion, dig):
    cargar_catalogo(sesion)
    r = subir_cqx(cliente, sesion, dig, contenido=plantilla(roturas=[{"cuadro": "suspendidas", "fila": "falta_insumos", "valor": "dos"}]))
    errores = r.json()["informe"]["errores"]
    assert [h["regla"] for h in errores] == ["no-numerico"]
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == e.reporte_de(sesion, 8, "CQX").id, Carga.es_vigente))
    hallazgo = sesion.scalar(select(Hallazgo).where(Hallazgo.carga_id == carga.id))
    assert sesion.get(Indicador, hallazgo.indicador_id).codigo == "suspendidas.falta_insumos"


def prueba_un_cruce_entre_hojas_es_un_aviso_que_se_guarda(cliente, sesion, dig):
    cargar_catalogo(sesion)
    r = subir_cqx(cliente, sesion, dig, contenido=plantilla(roturas=[{"cuadro": "indicadores", "fila": "intervenciones_realizadas", "valor": 999}]))
    assert r.json()["resultado"] == "aceptada", r.text
    assert [a["regla"] for a in r.json()["informe"]["avisos"]] == ["cruce-indicadores"]
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == e.reporte_de(sesion, 8, "CQX").id, Carga.es_vigente))
    hallazgo = sesion.scalar(select(Hallazgo).where(Hallazgo.carga_id == carga.id, Hallazgo.nivel == "aviso"))
    assert hallazgo.clave_hallazgo == "cruce-indicadores"


def prueba_el_libro_de_otro_mes_se_rechaza(cliente, sesion, dig):
    cargar_catalogo(sesion)
    r = subir_cqx(cliente, sesion, dig, contenido=plantilla("2026-07"))
    assert r.json()["resultado"] != "aceptada"
    assert r.json()["informe"]["bloqueo"]["id"] == "plantilla-periodo"


def prueba_el_mes_anterior_llega_al_bot_y_dispara_la_variacion(cliente, sesion, dig):
    cargar_catalogo(sesion)
    julio = subir_cqx(cliente, sesion, dig, periodo="2026-07", contenido=plantilla("2026-07", factor=2))
    assert julio.json()["resultado"] == "aceptada", julio.text
    sesion.commit()
    assert cliente.post("/api/reportes/CQX/2026-07/transiciones/enviar", headers=cabecera(dig)).status_code == 200

    datos = repo_cargas.datos_para_bot(sesion, e.reporte_de(sesion, 7, "CQX").id, 31, mensual=True)
    assert datos["mayor"]["obstetricia"] > 0

    agosto = subir_cqx(cliente, sesion, dig)
    variaciones = sorted(a["formato"] for a in agosto.json()["informe"]["avisos"] if a["regla"] == "variacion")
    assert variaciones == ["mayor", "menor", "resumen"]  # todo baja a la mitad; las causas y los indicadores no se comparan


def prueba_con_cqx1_activa_centro_quirurgico_entra_al_flujo(cliente, sesion, dig):
    cargar_catalogo(sesion)
    sesion.commit()
    r = cliente.get("/api/configuracion")
    assert r.status_code == 200, r.text
    assert "centro-quirurgico" in [a["clave"] for a in r.json()["areas_en_flujo"]]
