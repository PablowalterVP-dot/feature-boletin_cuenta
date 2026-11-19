"""`GET /api/avisos` contra la base real, por HTTP.

El escenario base es el de la base instalada: solo Nutrición tiene formato, y con el reloj
en `e.AHORA` (13/09/2026) el periodo vigente es agosto, vencido hace 3 días. Los meses de
enero a julio se dejan remitidos donde estorban, para que cada prueba mire un solo hecho.
"""

import pytest
from fastapi.testclient import TestClient

import escenario as e
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.modelos import ReporteHistorialEstado
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import RelojFijo
from app.main import app
from prueba_api_consultas import SECRETO, envio, get

pytestmark = pytest.mark.bd


@pytest.fixture
def cliente(sesion):
    reloj = RelojFijo(e.AHORA)
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: reloj
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(database_url="postgresql://x/y", jwt_secreto=SECRETO, _env_file=None)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def remitir_meses_anteriores(sesion):
    for mes in range(1, 8):
        e.abrir_reporte(sesion, "NUT", mes, "remitido", fecha_envio=envio(mes + 1, 9), folio=f"CR-2026-{mes:02d}-NUT")


def avisos(cliente, sesion, actor) -> list[dict]:
    r = get(cliente, sesion, actor, "/api/avisos")
    assert r.status_code == 200, r.text
    return r.json()["avisos"]


def por_tipo(lista) -> dict[str, dict]:
    return {a["tipo"]: a for a in lista}


# ---------------------------------------------------------------------- el sobre


def prueba_responde_con_su_sobre_y_cada_aviso_con_sus_campos(cliente, sesion):
    dig = e.digitador_de_nutricion(sesion)
    remitir_meses_anteriores(sesion)
    cuerpo = get(cliente, sesion, dig, "/api/avisos").json()
    assert set(cuerpo) == {"generado_en", "periodo_vigente", "avisos"} and cuerpo["periodo_vigente"] == "2026-08"
    [atraso] = cuerpo["avisos"]
    assert atraso == {
        "clave": "atraso|NUT|2026-08", "ambito": "area", "tipo": "atraso", "tono": "warn",
        "titulo": "El reporte de agosto de 2026 está atrasado.", "detalle": atraso["detalle"],
        "fecha": "2026-09-11T00:00:00-05:00", "requiere_accion": True, "formato": "NUT", "periodo": "2026-08",
    }
    assert "10/09/2026, hace 3 días" in atraso["detalle"]


def prueba_sin_token_es_401(cliente, sesion):
    assert get(cliente, sesion, None, "/api/avisos").status_code == 401


def prueba_una_cuenta_sin_ambitos_recibe_una_lista_vacia_no_un_error(cliente, sesion):
    nadie = e.sesion_de(e.crear_usuario(sesion, "nadie"))
    assert avisos(cliente, sesion, nadie) == []


# -------------------------------------------------------------------------- área


def prueba_las_deudas_de_meses_anteriores_tambien_avisan(cliente, sesion):
    """Base instalada: nada se entregó en 2026. Ocho atrasos; los siete viejos, críticos."""
    lista = avisos(cliente, sesion, e.digitador_de_nutricion(sesion))
    assert [a["periodo"] for a in lista] == [f"2026-{m:02d}" for m in range(7, 0, -1)] + ["2026-08"]
    assert {a["tono"] for a in lista[:7]} == {"crit"} and lista[7]["tono"] == "warn"


def prueba_al_enviar_el_atraso_desaparece_y_queda_la_entrega(cliente, sesion):
    """12/10/2026: enviar ya es entregar; no queda un «en trámite»."""
    dig = e.digitador_de_nutricion(sesion)
    remitir_meses_anteriores(sesion)
    e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 12), folio="CR-2026-08-NUT")
    [aviso] = avisos(cliente, sesion, dig)
    assert (aviso["tipo"], aviso["requiere_accion"]) == ("remitido", False)
    assert "CR-2026-08-NUT" in aviso["detalle"] and aviso["fecha"].startswith("2026-09-12T12:00:00")


def prueba_la_fecha_de_lo_entregado_es_la_del_envio_o_la_del_historial_y_si_no_no_se_inventa(cliente, sesion):
    dig = e.digitador_de_nutricion(sesion)
    remitir_meses_anteriores(sesion)
    rep = e.abrir_reporte(sesion, "NUT", 8, "remitido", folio="CR-2026-08-NUT")  # sin fecha de envío
    assert por_tipo(avisos(cliente, sesion, dig))["remitido"]["fecha"] is None

    ids = e.ids_de(sesion)
    sesion.add(ReporteHistorialEstado(reporte_id=rep.id, estado_origen_id=ids["borrador"], estado_destino_id=ids["remitido"], accion="enviar"))
    sesion.flush()
    assert por_tipo(avisos(cliente, sesion, dig))["remitido"]["fecha"] is not None


def prueba_un_periodo_reabierto_pide_al_area_reenviarlo(cliente, sesion):
    dig = e.digitador_de_nutricion(sesion)
    remitir_meses_anteriores(sesion)
    e.reporte_de(sesion, 7).estado_reporte_id = e.ids_de(sesion)["borrador"]
    e.reporte_de(sesion, 7).numero_rectificacion = 1
    e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 9), folio="CR-2026-08-NUT")
    rect = por_tipo(avisos(cliente, sesion, dig))["rectificacion"]
    assert (rect["periodo"], rect["requiere_accion"], rect["clave"]) == ("2026-07", True, "rectificacion|NUT|2026-07|1")


def prueba_un_digitador_de_otra_unidad_no_recibe_los_avisos_de_nutricion(cliente, sesion):
    farmacia = e.persona(sesion, "dig.far", ("digitador", "farmacia"))
    assert avisos(cliente, sesion, farmacia) == []


# -------------------------------------------------------------------- Estadística


def prueba_lo_entregado_no_le_pide_nada_a_estadistica(cliente, sesion):
    """12/10/2026: sin revisión ni remisión, lo entregado no le deja tarea a Estadística."""
    rev = e.revisor_de_estadistica(sesion)
    remitir_meses_anteriores(sesion)
    e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 9), folio="CR-2026-08-NUT")
    assert avisos(cliente, sesion, rev) == []


def prueba_estadistica_ve_los_atrasos_del_area_aunque_no_sean_tarea_suya(cliente, sesion):
    rev = e.revisor_de_estadistica(sesion)
    remitir_meses_anteriores(sesion)
    [aviso] = avisos(cliente, sesion, rev)
    assert (aviso["tipo"], aviso["tono"], aviso["requiere_accion"]) == ("atrasadas", "crit", False)


# ------------------------------------------------------------------------ oficina


def prueba_la_oficina_se_entera_de_lo_desactualizado_y_de_lo_que_llego_sin_validar(cliente, sesion):
    pla = e.consulta_de_planeamiento(sesion)
    julio = e.abrir_reporte(sesion, "NUT", 7, "borrador", numero_rectificacion=1, fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    e.remitir_a(sesion, julio, "planeamiento", es_vigente=False)
    # Una entrega «sin validar» que quedó de antes del 12/10/2026, en una base sin migrar.
    agosto = e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 9), folio="CR-2026-08-NUT")
    e.remitir_a(sesion, agosto, "planeamiento", sin_validar=True)
    lista = avisos(cliente, sesion, pla)
    assert [(a["tipo"], a["periodo"], a["ambito"]) for a in lista] == [("desactualizado", "2026-07", "oficina"), ("sin_validar", "2026-08", "oficina")]
    # Una oficina no ve el borrador de la rectificación: solo que lo suyo quedó viejo.
    assert "rectificacion" not in [a["tipo"] for a in lista]


def prueba_una_cuenta_que_reporta_y_recibe_tiene_avisos_de_los_dos_ambitos(cliente, sesion):
    """El caso de Epidemiología (CLAUDE.md § 3.3), con unidades que existen en la base."""
    doble = e.persona(sesion, "dig.doble", ("digitador", "nutricion"), ("consulta", "planeamiento"))
    remitir_meses_anteriores(sesion)
    agosto = e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 9), folio="CR-2026-08-NUT")
    e.remitir_a(sesion, agosto, "planeamiento")
    assert {(a["ambito"], a["tipo"]) for a in avisos(cliente, sesion, doble)} == {("area", "remitido"), ("oficina", "recibido")}


def prueba_una_consulta_sobre_una_unidad_que_no_recibe_no_falla(cliente, sesion):
    rara = e.persona(sesion, "con.nut", ("consulta", "nutricion"))
    assert avisos(cliente, sesion, rara) == []
