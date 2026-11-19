"""Las actividades operativas de Planeamiento por HTTP, contra la base real.

El reloj está el 27/10/2026: octubre ya empezó, noviembre no. Lo que se prueba es
lo que guarda la base (lo escrito por Planeamiento) y quién puede escribirlo; la
cifra calculada no pasa por aquí.
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import escenario as e
from app import seguridad
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.base import vigente
from app.datos.modelos import Destino, EjecucionActividad, UnidadOrganica
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import ZONA, RelojFijo
from app.main import app
from prueba_api_consultas import SECRETO

pytestmark = pytest.mark.bd

HOY = datetime(2026, 10, 27, 10, 0, tzinfo=ZONA)
RUTA = "/api/planeamiento/actividades/2026"
AOI = "AOI00087400683"  # Elaboración de documentos varios (Epidemiología): se digita


@pytest.fixture
def cliente(sesion):
    reloj = RelojFijo(HOY)
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: reloj
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(database_url="postgresql://x/y", jwt_secreto=SECRETO, _env_file=None)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def pla(sesion):
    return e.persona(sesion, "pla.poi", ("planeamiento", None))


def pedir(cliente, sesion, actor, metodo, ruta, **kwargs):
    sesion.commit()
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=False, ahora=HOY, horas=8, secreto=SECRETO,
    )
    return cliente.request(metodo, ruta, headers={"Authorization": f"Bearer {token}"}, **kwargs)


def prueba_planeamiento_digita_corrige_y_borra_una_cifra(cliente, sesion, pla):
    r = pedir(cliente, sesion, pla, "PUT", f"{RUTA}/{AOI}/9", json={"valor": 20, "nota": "Registro de documentos de la oficina"})
    assert r.status_code == 200, r.text
    assert r.json()["valor"] == 20 and r.json()["mes"] == "09" and r.json()["usuario"]

    # Reescribir el mismo mes no crea otra fila: la cambia (la bitácora guarda la anterior).
    assert pedir(cliente, sesion, pla, "PUT", f"{RUTA}/{AOI}/9", json={"valor": 21}).status_code == 200
    filas = sesion.scalars(select(EjecucionActividad).where(EjecucionActividad.codigo_actividad == AOI, vigente(EjecucionActividad))).all()
    assert [float(f.valor) for f in filas] == [21.0]

    lista = pedir(cliente, sesion, pla, "GET", RUTA).json()["registros"]
    assert [(x["codigo"], x["mes"], x["valor"]) for x in lista] == [(AOI, "09", 21.0)]

    assert pedir(cliente, sesion, pla, "DELETE", f"{RUTA}/{AOI}/9").status_code == 204
    assert pedir(cliente, sesion, pla, "GET", RUTA).json()["registros"] == []


def prueba_no_se_registra_un_mes_que_no_empezo_ni_una_cifra_negativa(cliente, sesion, pla):
    assert pedir(cliente, sesion, pla, "PUT", f"{RUTA}/{AOI}/11", json={"valor": 5}).status_code == 422
    assert pedir(cliente, sesion, pla, "PUT", f"{RUTA}/{AOI}/10", json={"valor": 5}).status_code == 200
    assert pedir(cliente, sesion, pla, "PUT", f"{RUTA}/{AOI}/10", json={"valor": -1}).status_code == 422
    assert pedir(cliente, sesion, pla, "PUT", f"{RUTA}/NO-ES-CODIGO/10", json={"valor": 1}).status_code == 422


def prueba_solo_planeamiento_escribe(cliente, sesion):
    rev = e.revisor_de_estadistica(sesion)
    oficina = e.consulta_de_planeamiento(sesion)
    for actor in (rev, oficina):
        assert pedir(cliente, sesion, actor, "GET", RUTA).status_code == 403
        assert pedir(cliente, sesion, actor, "PUT", f"{RUTA}/{AOI}/9", json={"valor": 1}).status_code == 403


def prueba_planeamiento_recibe_de_las_nueve_areas(sesion):
    """La matriz: tras el seeder 0005, toda área vigente que reporta va a Planeamiento."""
    o, d = UnidadOrganica.__table__.alias("o"), UnidadOrganica.__table__.alias("d")
    origenes = set(sesion.scalars(
        select(o.c.codigo).select_from(Destino).join(o, o.c.id == Destino.unidad_origen_id).join(d, d.c.id == Destino.unidad_destino_id)
        .where(d.c.codigo == "PLA", vigente(Destino))
    ))
    reportan = set(sesion.scalars(select(UnidadOrganica.codigo).where(UnidadOrganica.es_reportante, vigente(UnidadOrganica))))
    assert reportan <= origenes, reportan - origenes
