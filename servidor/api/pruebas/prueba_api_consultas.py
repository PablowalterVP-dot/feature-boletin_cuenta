"""La lista de reportes y los recibidos de una oficina, por HTTP.

`TestClient` sobre la aplicación real con tokens de verdad. Son lecturas: no hace falta
confirmar nada, pero sí `commit()` antes de cada petición por si el escenario se preparó
en la misma sesión (ver `prueba_api_reportes.py`).
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

import escenario as e
from app import seguridad
from app.api import errores
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.sesion import obtener_sesion_bd
from app.dominio import consultas
from app.dominio.reloj import ZONA, RelojFijo
from app.dominio.transiciones import ErrorDeTransicion
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
def rev(sesion):
    return e.revisor_de_estadistica(sesion)


@pytest.fixture
def planeamiento(sesion):
    return e.consulta_de_planeamiento(sesion)


def cabecera(actor) -> dict:
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=False, ahora=e.AHORA, horas=8, secreto=SECRETO,
    )
    return {"Authorization": f"Bearer {token}"}


def get(cliente, sesion, actor, ruta, **params):
    sesion.commit()
    return cliente.get(ruta, params=params, headers=cabecera(actor) if actor else {})


def envio(mes, dia, hora=12):
    return datetime(2026, mes, dia, hora, 0, tzinfo=ZONA)


# ---------------------------------------------------------------------- la lista


def prueba_la_lista_responde_con_su_sobre_y_sus_campos(cliente, sesion, rev):
    r = get(cliente, sesion, rev, "/api/reportes")
    assert r.status_code == 200
    cuerpo = r.json()
    assert {k: cuerpo[k] for k in ("total", "pagina", "por_pagina", "paginas")} == {"total": 8, "pagina": 1, "por_pagina": 10, "paginas": 1}
    assert [f["periodo"] for f in cuerpo["filas"]] == [f"2026-{m:02d}" for m in range(8, 0, -1)]
    agosto = cuerpo["filas"][0]
    assert agosto == {
        "periodo": "2026-08", "formato": "NUT", "formato_nombre": agosto["formato_nombre"], "unidad": "nutricion", "unidad_nombre": "Nutrición y Dietética",
        "estado": "no_iniciado", "espera": "area", "semaforo": "vencido", "dias_de_retraso": 3, "fecha_limite": "2026-09-10",
        "fecha_envio": None, "fecha_validacion": None, "numero_rectificacion": 0, "folio_constancia": None,
    }


def prueba_un_reporte_entregado_sale_con_sus_fechas_y_sin_dias_de_retraso(cliente, sesion, rev):
    e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 10, 21), folio="CR-2026-08-NUT")
    f = get(cliente, sesion, rev, "/api/reportes", periodo="2026-08").json()["filas"][0]
    assert (f["estado"], f["espera"], f["semaforo"], f["dias_de_retraso"], f["folio_constancia"]) == ("remitido", "nadie", "a_tiempo", None, "CR-2026-08-NUT")
    assert f["fecha_envio"].startswith("2026-09-10T21:00:00")


def prueba_la_lista_se_pagina_y_se_filtra_por_la_url(cliente, sesion, rev):
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    cuerpo = get(cliente, sesion, rev, "/api/reportes", por_pagina=3, pagina=2).json()
    assert (cuerpo["total"], cuerpo["paginas"], cuerpo["pagina"], len(cuerpo["filas"])) == (8, 3, 2, 3)
    assert [f["periodo"] for f in cuerpo["filas"]] == ["2026-05", "2026-04", "2026-03"]
    assert [f["estado"] for f in get(cliente, sesion, rev, "/api/reportes", estado="borrador").json()["filas"]] == ["borrador"]
    assert get(cliente, sesion, rev, "/api/reportes", espera="area", formato="nut", desde="2026-07").json()["total"] == 2


def prueba_una_consulta_global_no_ve_borradores_ni_por_la_lista_ni_por_el_detalle(cliente, sesion):
    consulta = e.persona(sesion, "con.glo", ("consulta", None))
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    assert [f["periodo"] for f in get(cliente, sesion, consulta, "/api/reportes").json()["filas"]] == ["2026-07"]
    assert get(cliente, sesion, consulta, "/api/reportes/NUT/2026-08").status_code == 403
    assert get(cliente, sesion, consulta, "/api/reportes/NUT/2026-07").status_code == 200


def prueba_la_lista_y_el_detalle_conviven_en_la_misma_ruta_base(cliente, sesion, rev):
    assert get(cliente, sesion, rev, "/api/reportes").status_code == 200
    assert get(cliente, sesion, rev, "/api/reportes/NUT/2026-08").json()["estado"] == "no_iniciado"


# ---------------------------------------------------------------- errores de la lista


def prueba_sin_token_es_401_en_las_dos_rutas(cliente, sesion):
    assert get(cliente, sesion, None, "/api/reportes").status_code == 401
    assert get(cliente, sesion, None, "/api/oficinas/planeamiento/recibidos").status_code == 401


def prueba_sin_reporte_ver_es_403_con_la_forma_de_error_de_los_reportes(cliente, sesion):
    nadie = e.sesion_de(e.crear_usuario(sesion, "nadie"))
    r = get(cliente, sesion, nadie, "/api/reportes")
    assert r.status_code == 403 and r.json()["codigo"] == "sin_permiso" and set(r.json()) == {"detail", "codigo", "datos"}


@pytest.mark.parametrize(
    "params",
    [
        {"periodo": "2026-13"}, {"periodo": "agosto"}, {"desde": "2026-8"}, {"hasta": "26-08"}, {"formato": "n u t"},
        {"estado": "aprobado"}, {"espera": "gerencia"}, {"pagina": 0}, {"pagina": "x"}, {"por_pagina": 0}, {"por_pagina": 101},
    ],
)
def prueba_los_filtros_mal_escritos_son_422_con_datos_invalidos(cliente, sesion, rev, params):
    r = get(cliente, sesion, rev, "/api/reportes", **params)
    assert r.status_code == 422 and r.json()["codigo"] == "datos_invalidos"


def prueba_un_rango_al_reves_y_un_mes_con_rango_son_422_con_su_codigo(cliente, sesion, rev):
    al_reves = get(cliente, sesion, rev, "/api/reportes", desde="2026-08", hasta="2026-03")
    assert (al_reves.status_code, al_reves.json()["codigo"], al_reves.json()["datos"]) == (422, "rango_de_periodos_invalido", {"desde": "2026-08", "hasta": "2026-03"})
    mezcla = get(cliente, sesion, rev, "/api/reportes", periodo="2026-05", desde="2026-03")
    assert (mezcla.status_code, mezcla.json()["codigo"]) == (422, "filtros_incompatibles")


# ------------------------------------------------------------------- recibidos


def prueba_los_recibidos_responden_con_su_sobre_y_sus_campos(cliente, sesion, planeamiento):
    rep = e.abrir_reporte(sesion, "NUT", 7, "remitido", numero_rectificacion=1, fecha_envio=envio(8, 12), folio="CR-2026-07-NUT-2")
    e.remitir_a(sesion, rep, "planeamiento", es_vigente=False, numero_rectificacion=0)
    e.remitir_a(sesion, rep, "planeamiento", numero_rectificacion=1)
    r = get(cliente, sesion, planeamiento, "/api/oficinas/planeamiento/recibidos")
    assert r.status_code == 200
    cuerpo = r.json()
    assert {k: cuerpo[k] for k in ("oficina", "total", "pagina", "por_pagina", "paginas")} == {"oficina": "planeamiento", "total": 1, "pagina": 1, "por_pagina": 10, "paginas": 1}
    fila = cuerpo["filas"][0]
    assert set(fila) == {"periodo", "formato", "formato_nombre", "unidad", "unidad_nombre", "estado_de_recepcion", "constancia", "remisiones"}  # sin estado del reporte
    assert (fila["periodo"], fila["formato"], fila["unidad"], fila["estado_de_recepcion"], fila["constancia"]) == ("2026-07", "NUT", "nutricion", "validada", "CR-2026-07-NUT-2")
    assert [(x["constancia"], x["es_vigente"], x["numero_rectificacion"]) for x in fila["remisiones"]] == [("CR-2026-07-NUT-2", True, 1), ("CR-2026-07-NUT", False, 0)]
    assert set(fila["remisiones"][0]) == {"constancia", "es_sin_validar", "es_vigente", "numero_rectificacion", "fecha"}


def prueba_los_recibidos_se_filtran_y_se_paginan_por_la_url(cliente, sesion, planeamiento):
    for mes in range(1, 8):
        rep = e.abrir_reporte(sesion, "NUT", mes, "remitido", fecha_envio=envio(mes + 1, 9), folio=f"CR-2026-{mes:02d}-NUT")
        e.remitir_a(sesion, rep, "planeamiento", sin_validar=(mes == 7))
    cuerpo = get(cliente, sesion, planeamiento, "/api/oficinas/planeamiento/recibidos", por_pagina=3, pagina=3).json()
    assert (cuerpo["total"], cuerpo["paginas"], [f["periodo"] for f in cuerpo["filas"]]) == (7, 3, ["2026-01"])
    sin_validar = get(cliente, sesion, planeamiento, "/api/oficinas/planeamiento/recibidos", estado_de_recepcion="sin_validar").json()
    assert [f["periodo"] for f in sin_validar["filas"]] == ["2026-07"]
    assert get(cliente, sesion, planeamiento, "/api/oficinas/planeamiento/recibidos", desde="2026-02", hasta="2026-03").json()["total"] == 2


def prueba_una_oficina_ajena_es_403_y_lo_que_no_recibe_es_404(cliente, sesion, rev):
    cuerpo_tecnico = e.persona(sesion, "con.cte", ("consulta", "cuerpo-tecnico"))
    ajena = get(cliente, sesion, cuerpo_tecnico, "/api/oficinas/planeamiento/recibidos")
    assert (ajena.status_code, ajena.json()["codigo"]) == (403, "sin_permiso")
    for clave in ("estadistica", "diresa", "nutricion", "no-existe"):
        r = get(cliente, sesion, rev, f"/api/oficinas/{clave}/recibidos")
        assert (r.status_code, r.json()["codigo"]) == (404, "no_encontrado"), clave


def prueba_los_filtros_de_recibidos_mal_escritos_son_422(cliente, sesion, planeamiento):
    for params in ({"estado_de_recepcion": "vigente"}, {"periodo": "2026-1"}, {"por_pagina": 1000}, {"pagina": 0}):
        r = get(cliente, sesion, planeamiento, "/api/oficinas/planeamiento/recibidos", **params)
        assert (r.status_code, r.json()["codigo"]) == (422, "datos_invalidos"), params
    r = get(cliente, sesion, planeamiento, "/api/oficinas/planeamiento/recibidos", desde="2026-08", hasta="2026-01")
    assert (r.status_code, r.json()["codigo"]) == (422, "rango_de_periodos_invalido")


def prueba_una_clave_con_caracteres_raros_se_rechaza_sin_llegar_a_la_base(cliente, sesion, planeamiento):
    assert get(cliente, sesion, planeamiento, "/api/oficinas/PLA%20neamiento/recibidos").status_code == 422


# ------------------------------------------------------------ el mapa de errores


def _descendientes(clase):
    for hija in clase.__subclasses__():
        yield hija
        yield from _descendientes(hija)


def prueba_todo_error_de_dominio_concreto_tiene_su_estado_http_declarado():
    """Sin esto, un error nuevo caería en el 409 por omisión sin que nadie lo decidiera."""
    bases = {ErrorDeTransicion, consultas.ErrorDeConsulta}
    sin_declarar = [c.__name__ for c in _descendientes(ErrorDeTransicion) if c not in bases and c not in errores.ESTADO_HTTP]
    assert sin_declarar == []
