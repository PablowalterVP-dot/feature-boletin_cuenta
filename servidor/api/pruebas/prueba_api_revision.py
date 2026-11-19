"""La revisión de un reporte y la lectura por remisión, por HTTP.

    GET /api/reportes/{formato}/{periodo}/revision
    PUT /api/reportes/{formato}/{periodo}/hallazgos/{clave}/justificacion

y la regla de `servicios/acceso.py`: una oficina lee el reporte que se le remitió
(detalle, valores y revisión) aunque no tenga `reporte.ver` sobre el área.

Sin bot: la carga se prepara con `escenario.dar_carga_aceptada` (el camino con el bot
real está en `prueba_api_cargas.py`).
"""

from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

import escenario as e
from app import seguridad
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.modelos import Hallazgo
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import RelojFijo
from app.main import app

pytestmark = pytest.mark.bd

SECRETO = "secreto-de-pruebas-de-al-menos-32-caracteres"
AVISO = ("aviso", "atipico|f3|liquida.cena|21", "100 raciones: el resto del mes ronda las 10", None)
ERROR = ("error", "incompleto|f1", "Faltan 12 casillas", None)


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


@pytest.fixture
def pla(sesion):
    return e.consulta_de_planeamiento(sesion)


def cabecera(actor) -> dict:
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=False, ahora=e.AHORA, horas=8, secreto=SECRETO,
    )
    return {"Authorization": f"Bearer {token}"}


def get(cliente, sesion, actor, ruta="", periodo="2026-08"):
    sesion.commit()
    return cliente.get(f"/api/reportes/NUT/{periodo}{ruta}", headers=cabecera(actor))


def justificar(cliente, sesion, actor, clave, texto, periodo="2026-08"):
    sesion.commit()
    return cliente.put(
        f"/api/reportes/NUT/{periodo}/hallazgos/{quote(clave, safe='')}/justificacion",
        json={"justificacion": texto}, headers=cabecera(actor),
    )


def transicionar(cliente, sesion, actor, accion):
    sesion.commit()
    return cliente.post(f"/api/reportes/NUT/2026-08/transiciones/{accion}", json={}, headers=cabecera(actor))


def borrador_con_carga(sesion, hallazgos=()):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep, hallazgos)
    return rep


# ------------------------------------------------------------------- la revisión


def prueba_sin_reporte_la_revision_no_tiene_carga(cliente, sesion, dig):
    r = get(cliente, sesion, dig, "/revision")
    assert r.status_code == 200
    assert r.json() == {"formato": "NUT", "unidad": "nutricion", "periodo": "2026-08", "estado": "no_iniciado", "carga": None, "hallazgos": []}


def prueba_la_revision_trae_la_carga_vigente_y_sus_hallazgos(cliente, sesion, dig):
    borrador_con_carga(sesion, [AVISO, ERROR])
    cuerpo = get(cliente, sesion, dig, "/revision").json()
    assert cuerpo["estado"] == "borrador"
    assert (cuerpo["carga"]["archivo"], cuerpo["carga"]["version"], cuerpo["carga"]["casillas_leidas"]) == ("Nutricion.xlsx", "NUT-1", 1116)
    assert [(h["nivel"], h["clave"], h["justificacion"]) for h in cuerpo["hallazgos"]] == [
        ("aviso", "atipico|f3|liquida.cena|21", None),
        ("error", "incompleto|f1", None),
    ]


def prueba_una_consulta_no_lee_la_revision_de_un_borrador(cliente, sesion, pla):
    borrador_con_carga(sesion, [AVISO])
    r = get(cliente, sesion, pla, "/revision")
    assert r.status_code == 403 and r.json()["codigo"] == "sin_permiso"


# ---------------------------------------------------------------- justificar


def prueba_justificar_un_aviso_lo_guarda_y_desbloquea_el_envio(cliente, sesion, dig):
    borrador_con_carga(sesion, [AVISO])
    assert transicionar(cliente, sesion, dig, "enviar").status_code == 422

    r = justificar(cliente, sesion, dig, AVISO[1], "  Hubo un brote en el piso 3.  ")
    assert r.status_code == 200, r.text
    assert (r.json()["clave"], r.json()["justificacion"]) == (AVISO[1], "Hubo un brote en el piso 3.")
    assert r.json()["fecha_justificacion"].startswith("2026-09-13T12:00:00")

    h = sesion.scalar(select(Hallazgo).where(Hallazgo.clave_hallazgo == AVISO[1]))
    assert h.usuario_justificacion_id == dig.usuario_id
    assert get(cliente, sesion, dig, "/revision").json()["hallazgos"][0]["justificacion"] == "Hubo un brote en el piso 3."
    assert transicionar(cliente, sesion, dig, "enviar").status_code == 200


def prueba_una_justificacion_vacia_la_borra(cliente, sesion, dig):
    borrador_con_carga(sesion, [AVISO])
    justificar(cliente, sesion, dig, AVISO[1], "Motivo")
    r = justificar(cliente, sesion, dig, AVISO[1], "   ")
    assert r.status_code == 200 and (r.json()["justificacion"], r.json()["fecha_justificacion"]) == (None, None)
    assert transicionar(cliente, sesion, dig, "enviar").status_code == 422


def prueba_justificar_queda_en_la_bitacora_con_quien_lo_hizo(cliente, sesion, dig):
    borrador_con_carga(sesion, [AVISO])
    justificar(cliente, sesion, dig, AVISO[1], "Motivo")
    fila = sesion.execute(
        text("SELECT operacion, usuario_id, campos_modificados FROM auditoria.registro_cambio WHERE tabla = 'hallazgo' AND operacion = 'ACTUALIZAR'")
    ).one()
    assert fila[1] == dig.usuario_id and "justificacion" in fila[2]


def prueba_un_error_no_se_justifica_es_422(cliente, sesion, dig):
    borrador_con_carga(sesion, [ERROR])
    r = justificar(cliente, sesion, dig, ERROR[1], "No aplica")
    assert r.status_code == 422 and r.json()["codigo"] == "hallazgo_no_justificable"


def prueba_un_hallazgo_que_no_existe_es_404(cliente, sesion, dig):
    borrador_con_carga(sesion, [AVISO])
    r = justificar(cliente, sesion, dig, "atipico|f1|asistencial.desayuno|2", "x")
    assert r.status_code == 404 and r.json()["datos"]["que"] == "hallazgo"


def prueba_sin_reporte_cargar_sobre_el_area_es_403(cliente, sesion, rev):
    borrador_con_carga(sesion, [AVISO])
    r = justificar(cliente, sesion, rev, AVISO[1], "x")
    assert r.status_code == 403 and r.json()["codigo"] == "sin_permiso"


def prueba_un_reporte_enviado_ya_no_se_justifica_es_409(cliente, sesion, dig):
    borrador_con_carga(sesion, [(*AVISO[:3], "Motivo")])
    assert transicionar(cliente, sesion, dig, "enviar").status_code == 200
    r = justificar(cliente, sesion, dig, AVISO[1], "Otro motivo")
    assert r.status_code == 409 and r.json()["codigo"] == "reporte_no_editable"


def prueba_sin_excel_aceptado_no_hay_que_justificar_es_409(cliente, sesion, dig):
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    r = justificar(cliente, sesion, dig, AVISO[1], "x")
    assert r.status_code == 409 and r.json()["codigo"] == "sin_carga_aceptada"


# ------------------------------------------------------ lectura por remisión (B3)


def prueba_la_oficina_lee_detalle_valores_y_revision_de_lo_que_recibio(cliente, sesion, dig, pla):
    """Desde el 12/10/2026 toda la matriz recibe al enviar: Planeamiento ya lo tiene."""
    rep = borrador_con_carga(sesion)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 1, 10)
    assert transicionar(cliente, sesion, dig, "enviar").status_code == 200

    d = get(cliente, sesion, pla)
    assert d.status_code == 200, d.text
    assert (d.json()["estado"], d.json()["acciones_disponibles"]) == ("remitido", [])

    v = get(cliente, sesion, pla, "/valores")
    assert v.status_code == 200
    f3 = next(c for c in v.json()["cuadros"] if c["cuadro"] == "f3")
    assert next(i for i in f3["indicadores"] if i["indicador"] == "f3.liquida.cena")["total"] == "10.00"

    assert get(cliente, sesion, pla, "/revision").status_code == 200


def prueba_tras_rectificar_la_oficina_pierde_la_lectura_hasta_el_reenvio(cliente, sesion, dig, rev, pla):
    rep = borrador_con_carga(sesion)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 1, 10)
    for actor, accion in [(dig, "enviar"), (rev, "rectificar")]:
        assert transicionar(cliente, sesion, actor, accion).status_code == 200, accion
    for ruta in ("", "/valores", "/revision"):
        r = get(cliente, sesion, pla, ruta)
        assert r.status_code == 403 and r.json()["codigo"] == "sin_permiso", ruta

    assert transicionar(cliente, sesion, dig, "enviar").status_code == 200
    assert get(cliente, sesion, pla, "/valores").status_code == 200


def prueba_otra_oficina_que_no_lo_recibio_no_lo_lee(cliente, sesion, dig):
    borrador_con_carga(sesion)
    assert transicionar(cliente, sesion, dig, "enviar").status_code == 200
    cte = e.persona(sesion, "con.cte", ("consulta", "cuerpo-tecnico"))
    assert get(cliente, sesion, cte, "/valores").status_code == 403


def prueba_sin_permiso_sobre_el_area_un_periodo_inexistente_no_se_revela(cliente, sesion, pla):
    """Sin `reporte.ver` sobre Nutrición, un periodo que no existe responde el mismo 403
    que uno que existe: no se revela qué hay a quien no puede verlo."""
    r = get(cliente, sesion, pla, "/valores", periodo="2099-01")
    assert r.status_code == 403 and r.json()["codigo"] == "sin_permiso"


def prueba_con_permiso_sobre_el_area_un_periodo_inexistente_sigue_siendo_404(cliente, sesion, dig):
    assert get(cliente, sesion, dig, "/valores", periodo="2099-01").status_code == 404
