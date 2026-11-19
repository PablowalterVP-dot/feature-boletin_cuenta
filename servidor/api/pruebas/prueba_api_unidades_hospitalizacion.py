"""Las unidades de hospitalización, por HTTP, contra la base real.

El superadministrador habilita los departamentos y las áreas de hospitalización a los
que se atan las cuentas de enfermería y de jefatura
(`app/servicios/unidades_hospitalizacion.py`). Su clave lleva un prefijo propio y
nunca toca las unidades de Estadística.
"""

import pytest
from sqlalchemy import select

import escenario as e
from app.datos.modelos import Rol, UnidadOrganica
from prueba_api_admin import cliente, pedir, raiz  # noqa: F401 (fixtures)

pytestmark = pytest.mark.bd

RUTA = "/api/admin/hospitalizacion/unidades"


def _unidad(sesion, clave):
    return sesion.scalar(select(UnidadOrganica).where(UnidadOrganica.clave == clave, UnidadOrganica.fecha_eliminacion.is_(None)))


def prueba_el_seeder_0010_deja_las_seis_unidades_con_su_prefijo_y_los_roles_con_el_nombre_del_puesto(cliente, sesion, raiz):
    r = pedir(cliente, sesion, raiz, "GET", RUTA)
    assert r.status_code == 200, r.text
    por_clave = {u["clave"]: u for u in r.json()}
    assert set(por_clave) == {
        "hosp-dep-medicina", "hosp-area-medicina-a", "hosp-area-medicina-b", "hosp-area-medicina-intermedios",
        "hosp-area-cuidados-criticos", "hosp-area-quemados",
    }
    assert (por_clave["hosp-area-medicina-a"]["tipo"], por_clave["hosp-area-medicina-a"]["id"], por_clave["hosp-area-medicina-a"]["departamento"]) == ("area", "medicina-a", "medicina")
    assert por_clave["hosp-dep-medicina"]["tipo"] == "departamento"
    assert _unidad(sesion, "medicina-a") is None, "ya no queda la clave sin prefijo"
    nombres = dict(sesion.execute(select(Rol.codigo, Rol.nombre).where(Rol.codigo == "control_camas", Rol.fecha_eliminacion.is_(None))).all())
    assert nombres == {"control_camas": "Responsable de RENOXI"}


def prueba_se_habilita_un_departamento_y_su_area_y_se_le_crea_una_cuenta_de_enfermeria(cliente, sesion, raiz):
    r = pedir(cliente, sesion, raiz, "POST", RUTA, json={"tipo": "area", "id": "cirugia", "codigo": "CIRA", "nombre": "Cirugía", "departamento": "cirugia"})
    assert r.status_code == 201, r.text
    assert r.json()["departamento"] is None, "su departamento aún no estaba habilitado"

    r = pedir(cliente, sesion, raiz, "POST", RUTA, json={"tipo": "departamento", "id": "cirugia", "codigo": "cir", "nombre": "Departamento de Cirugía", "nombre_corto": "Cirugía", "areas": ["cirugia"]})
    assert r.status_code == 201, r.text
    assert (r.json()["clave"], r.json()["codigo"]) == ("hosp-dep-cirugia", "CIR"), "el mismo id que su área, otra clave"

    area = _unidad(sesion, "hosp-area-cirugia")
    assert area.unidad_padre_id == _unidad(sesion, "hosp-dep-cirugia").id, "el departamento adopta el área ya habilitada"
    assert (area.tipo, area.es_reportante, area.es_receptora) == ("servicio", False, False), "no reporta ni recibe: no aparece en Áreas y matriz"

    r = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={"usuario": "cirugia", "nombres": "Enfermería", "apellidos": "Cirugía", "rol": "enfermeria", "unidad": "hosp-area-cirugia"})
    assert r.status_code == 201, r.text
    assert r.json()["asignaciones"][0]["unidad_nombre"] == "Cirugía"
    cuentas = {u["clave"]: u["cuentas"] for u in pedir(cliente, sesion, raiz, "GET", RUTA).json()}
    assert cuentas["hosp-area-cirugia"] == 1

    areas = [a["clave"] for a in pedir(cliente, sesion, raiz, "GET", "/api/admin/areas").json()]
    assert not any(c.startswith("hosp-") for c in areas)


def prueba_no_se_cruza_con_las_unidades_de_estadistica(cliente, sesion, raiz):
    gine = _unidad(sesion, "ginecologia")
    r = pedir(cliente, sesion, raiz, "POST", RUTA, json={"tipo": "area", "id": "ginecologia", "codigo": "GIN", "nombre": "Ginecología"})
    assert r.status_code == 409 and "Gineco-Obstetricia" in r.json()["detail"] and "de Estadística" in r.json()["detail"], r.text

    r = pedir(cliente, sesion, raiz, "POST", RUTA, json={"tipo": "area", "id": "ginecologia", "codigo": "GINH", "nombre": "Ginecología"})
    assert r.status_code == 201, r.text
    assert r.json()["clave"] == "hosp-area-ginecologia"
    sesion.refresh(gine)
    assert (gine.clave, gine.codigo, gine.es_reportante) == ("ginecologia", "GIN", True), "la de Estadística sigue igual"

    assert pedir(cliente, sesion, raiz, "PATCH", f"{RUTA}/ginecologia", json={"nombre": "x"}).status_code == 422, "solo claves de hospitalización"
    assert pedir(cliente, sesion, raiz, "PATCH", f"{RUTA}/hosp-area-no-existe", json={"nombre": "x"}).status_code == 404

    r = pedir(cliente, sesion, raiz, "POST", RUTA, json={"tipo": "area", "id": "ginecologia", "codigo": "GINX", "nombre": "Otra"})
    assert r.status_code == 409, "ya está habilitada"
    r = pedir(cliente, sesion, raiz, "POST", RUTA, json={"tipo": "area", "id": "Gine Cología", "codigo": "GX", "nombre": "Otra"})
    assert r.status_code == 422


def prueba_se_edita_y_se_desactiva_una_unidad(cliente, sesion, raiz):
    r = pedir(cliente, sesion, raiz, "PATCH", f"{RUTA}/hosp-area-medicina-a", json={"nombre": "Medicina A (piso 2)", "nombre_corto": "", "codigo": "mea2"})
    assert r.status_code == 200, r.text
    assert (r.json()["nombre"], r.json()["nombre_corto"], r.json()["codigo"], r.json()["id"]) == ("Medicina A (piso 2)", None, "MEA2", "medicina-a")

    assert pedir(cliente, sesion, raiz, "PATCH", f"{RUTA}/hosp-area-medicina-a", json={"codigo": "NUT"}).status_code == 409
    assert pedir(cliente, sesion, raiz, "PATCH", f"{RUTA}/hosp-area-medicina-a", json={"nombre": "  "}).status_code == 422
    assert pedir(cliente, sesion, raiz, "PATCH", f"{RUTA}/hosp-area-medicina-a", json={"clave": "otra"}).status_code == 422, "la clave no se cambia"

    r = pedir(cliente, sesion, raiz, "PATCH", f"{RUTA}/hosp-area-medicina-a", json={"activa": False})
    assert r.status_code == 200 and r.json()["activa"] is False


def prueba_solo_el_superadministrador(cliente, sesion):
    rev = e.revisor_de_estadistica(sesion)
    assert pedir(cliente, sesion, rev, "GET", RUTA).status_code == 403
    assert pedir(cliente, sesion, rev, "POST", RUTA, json={"tipo": "area", "id": "x", "codigo": "XX", "nombre": "X"}).status_code == 403
