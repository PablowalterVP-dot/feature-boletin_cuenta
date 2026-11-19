"""GET /api/reportes/{formato}/{periodo}/alertas, por HTTP."""

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
    reloj = RelojFijo(e.AHORA)  # 2026-09-13: el periodo vigente es 2026-08
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: reloj
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(database_url="postgresql://x/y", jwt_secreto=SECRETO, _env_file=None)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def dig(sesion):
    return e.digitador_de_nutricion(sesion)


def cabecera(actor) -> dict:
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=False, ahora=e.AHORA, horas=8, secreto=SECRETO,
    )
    return {"Authorization": f"Bearer {token}"}


def get(cliente, sesion, actor, periodo="2026-08", formato="NUT"):
    sesion.commit()
    return cliente.get(f"/api/reportes/{formato}/{periodo}/alertas", headers=cabecera(actor) if actor else {})


def prueba_sin_token_es_401(cliente, sesion):
    assert get(cliente, sesion, None).status_code == 401


def prueba_sin_reporte_responde_200_con_alertas_vacias(cliente, sesion, dig):
    r = get(cliente, sesion, dig)
    assert r.status_code == 200
    assert r.json() == {"formato": "NUT", "periodo": "2026-08", "alertas": []}


def prueba_una_semana_cerrada_con_huecos_sale_en_la_respuesta(cliente, sesion, dig):
    reporte = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, reporte)
    for d in [d for d in range(1, 32) if not (3 <= d <= 9)]:
        e.escribir_valor(sesion, reporte, "f3.liquida.cena", d, 10)

    r = get(cliente, sesion, dig)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["formato"] == "NUT" and cuerpo["periodo"] == "2026-08"
    assert len(cuerpo["alertas"]) == 1
    alerta = cuerpo["alertas"][0]
    assert alerta["clave"] == "semana_incompleta|3-9" and alerta["nivel"] == "aviso"
    assert "3" in alerta["titulo"] and "9" in alerta["titulo"]


def prueba_formato_inexistente_es_404(cliente, sesion, dig):
    assert get(cliente, sesion, dig, formato="ZZZ").status_code == 404
