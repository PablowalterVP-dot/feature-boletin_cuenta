"""GET /api/reportes/{formato}/{periodo}/valores, por HTTP."""

import pytest
from fastapi.testclient import TestClient

import escenario as e
from app import seguridad
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import RelojFijo
from app.main import app

pytestmark = pytest.mark.bd

SECRETO = "secreto-de-pruebas-de-al-menos-32-caracteres"


@pytest.fixture
def cliente(sesion):
    reloj = RelojFijo(e.AHORA)
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: reloj
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(database_url="postgresql://x/y", jwt_secreto=SECRETO, _env_file=None)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def dig(sesion):
    return e.digitador_de_nutricion(sesion)


@pytest.fixture
def rev(sesion):
    return e.revisor_de_estadistica(sesion)


def cabecera(actor) -> dict:
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=False, ahora=e.AHORA, horas=8, secreto=SECRETO,
    )
    return {"Authorization": f"Bearer {token}"}


def get(cliente, sesion, actor, periodo="2026-08", formato="NUT"):
    sesion.commit()
    return cliente.get(f"/api/reportes/{formato}/{periodo}/valores", headers=cabecera(actor) if actor else {})


def prueba_sin_token_es_401(cliente, sesion):
    assert get(cliente, sesion, None).status_code == 401


def prueba_sin_reporte_responde_200_con_cuadros_vacios(cliente, sesion, dig):
    r = get(cliente, sesion, dig)
    assert r.status_code == 200
    assert r.json() == {"formato": "NUT", "unidad": "nutricion", "periodo": "2026-08", "cuadros": []}


def prueba_formato_o_periodo_inexistentes_son_404(cliente, sesion, dig):
    assert get(cliente, sesion, dig, formato="ZZZ").status_code == 404
    assert get(cliente, sesion, dig, periodo="2099-01").status_code == 404


def prueba_una_consulta_global_recibe_403_sobre_un_borrador(cliente, sesion):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep)
    glo = e.persona(sesion, "glo", ("consulta", None))
    r = get(cliente, sesion, glo)
    assert r.status_code == 403 and r.json()["codigo"] == "sin_permiso"


def prueba_la_respuesta_trae_cuadros_indicadores_y_casillas_con_su_linaje(cliente, sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    carga = e.dar_carga_aceptada(sesion, rep)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 1, 10, carga=carga, hoja_excel="Hoja1", celda_excel="C24")
    cuerpo = get(cliente, sesion, dig).json()
    assert (cuerpo["formato"], cuerpo["unidad"], cuerpo["periodo"]) == ("NUT", "nutricion", "2026-08")
    assert len(cuerpo["cuadros"]) == 4 and sum(len(cu["indicadores"]) for cu in cuerpo["cuadros"]) == 36
    f3 = next(cu for cu in cuerpo["cuadros"] if cu["cuadro"] == "f3")
    ind = next(i for i in f3["indicadores"] if i["indicador"] == "f3.liquida.cena")
    assert (ind["total"], ind["casillas_con_dato"], ind["casillas_esperadas"]) == ("10.00", 1, 31)
    assert ind["dimensiones"] == {"poblacion": "paciente", "servicio": "hospitalizacion", "tipo_dieta": "liquida", "comida": "cena"}
    casilla = ind["casillas"][0]
    assert (casilla["dia"], casilla["fecha"], casilla["valor"], casilla["origen"]) == (1, "2026-08-01", "10.00", "archivo")
    assert (casilla["hoja_excel"], casilla["celda_excel"]) == ("Hoja1", "C24")
    otro = next(i for i in f3["indicadores"] if i["indicador"] != "f3.liquida.cena")
    assert (otro["total"], otro["casillas"]) == (None, [])


def prueba_una_casilla_manual_no_trae_linaje(cliente, sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 1, 7, origen="manual")
    cuerpo = get(cliente, sesion, dig).json()
    f3 = next(cu for cu in cuerpo["cuadros"] if cu["cuadro"] == "f3")
    ind = next(i for i in f3["indicadores"] if i["indicador"] == "f3.liquida.cena")
    casilla = ind["casillas"][0]
    assert (casilla["origen"], casilla["hoja_excel"], casilla["celda_excel"]) == ("manual", None, None)
