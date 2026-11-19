"""El panel del superadministrador, por HTTP, contra la base real.

Cada prueba corre en una transacción que se deshace: lo que crea o cambia no
queda. El reloj está en `e.AHORA` (13/09/2026): el periodo vigente es agosto.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

import escenario as e
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import RelojFijo
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


@pytest.fixture
def raiz(sesion):
    """Un superadministrador con su asignación en la base (no solo en el token):
    las reglas de «el último superadministrador» cuentan filas reales."""
    from app.herramientas.crear_usuario import crear_usuario

    r = crear_usuario(sesion, "raiz", "superadmin", nombres="Raíz", apellidos="Del Sistema")
    r.usuario.contrasena_hash = "x"
    sesion.flush()
    return e.sesion_de(r.usuario, e.asignacion(sesion, "superadmin", None))


def pedir(cliente, sesion, actor, metodo, ruta, **kwargs):
    sesion.commit()
    return cliente.request(metodo, ruta, headers=cabecera(actor) if actor else {}, **kwargs)


# ------------------------------------------------------------------- permisos


def prueba_sin_permiso_global_no_se_entra_y_el_revisor_solo_lee_la_bitacora(cliente, sesion):
    rev = e.revisor_de_estadistica(sesion)
    admin_de_unidad = e.persona(sesion, "adm.nut", ("admin", "nutricion"))
    assert pedir(cliente, sesion, rev, "GET", "/api/admin/cuentas").status_code == 403
    assert pedir(cliente, sesion, admin_de_unidad, "GET", "/api/admin/cuentas").status_code == 403, "usuario.gestionar en su unidad no alcanza para todo el hospital"
    assert pedir(cliente, sesion, rev, "GET", "/api/admin/bitacora").status_code == 200
    assert pedir(cliente, sesion, None, "GET", "/api/admin/resumen").status_code == 401


# -------------------------------------------------------------------- cuentas


def prueba_se_crea_una_cuenta_y_se_le_cambian_nombre_correo_y_cargo(cliente, sesion, raiz):
    r = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={
        "usuario": "Ana.Rios", "nombres": "Ana", "apellidos": "Ríos", "correo": "ANA@hrl.gob.pe", "rol": "digitador", "unidad": "nutricion",
    })
    assert r.status_code == 201, r.text
    cuenta = r.json()
    assert cuenta["usuario"] == "ana.rios" and cuenta["correo"] == "ana@hrl.gob.pe" and cuenta["clave"] == "sin_asignar"
    assert [(a["rol"], a["unidad"]) for a in cuenta["asignaciones"]] == [("digitador", "nutricion")]

    r = pedir(cliente, sesion, raiz, "PATCH", f"/api/admin/cuentas/{cuenta['id']}", json={"nombres": "Ana María", "correo": "amaria@hrl.gob.pe", "cargo": "Nutricionista"})
    assert r.status_code == 200, r.text
    assert (r.json()["nombres"], r.json()["correo"], r.json()["cargo"]) == ("Ana María", "amaria@hrl.gob.pe", "Nutricionista")

    r = pedir(cliente, sesion, raiz, "PATCH", f"/api/admin/cuentas/{cuenta['id']}", json={"cargo": None})
    assert r.json()["cargo"] is None and r.json()["nombres"] == "Ana María", "solo cambia lo que viene"

    # El celular del responsable (migración 0009): se guarda limpio y uno mal escrito no pasa.
    r = pedir(cliente, sesion, raiz, "PATCH", f"/api/admin/cuentas/{cuenta['id']}", json={"telefono": " +51  965 123 456 "})
    assert r.status_code == 200, r.text
    assert r.json()["telefono"] == "+51 965 123 456"
    r = pedir(cliente, sesion, raiz, "PATCH", f"/api/admin/cuentas/{cuenta['id']}", json={"telefono": "96512a"})
    assert r.status_code in (400, 422), r.text


def prueba_lo_que_no_se_puede_guardar_se_rechaza_con_su_motivo(cliente, sesion, raiz):
    base = {"nombres": "Luis", "apellidos": "Paz", "rol": "digitador", "unidad": "nutricion"}
    assert pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={**base, "usuario": "a b"}).status_code == 422
    assert pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={**base, "usuario": "luis.paz", "correo": "no-es-correo"}).status_code == 422
    assert pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={**base, "usuario": "luis.paz", "rol": "revisor"}).status_code == 422, "revisor es global: no lleva unidad"
    assert pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={**base, "usuario": "luis.paz", "correo": "luis@x.pe"}).status_code == 201
    r = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={**base, "usuario": "luis.paz2", "correo": "LUIS@x.pe"})
    assert r.status_code == 409 and "correo" in r.json()["detail"]
    assert pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={**base, "usuario": "luis.paz"}).status_code == 409


def prueba_restablecer_la_clave_la_deja_provisional_y_el_ingreso_pide_cambiarla(cliente, sesion, raiz):
    cuenta = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={"usuario": "eva.lima", "nombres": "Eva", "apellidos": "Lima", "rol": "revisor"}).json()
    assert pedir(cliente, sesion, raiz, "POST", f"/api/admin/cuentas/{cuenta['id']}/clave", json={"clave": "corta"}).status_code == 422
    r = pedir(cliente, sesion, raiz, "POST", f"/api/admin/cuentas/{cuenta['id']}/clave", json={"clave": "una-clave-larga-1"})
    assert r.status_code == 200 and r.json()["clave"] == "provisional"
    entrada = pedir(cliente, sesion, None, "POST", "/api/auth/login", json={"usuario": "eva.lima", "clave": "una-clave-larga-1"})
    assert entrada.status_code == 200 and entrada.json()["debe_cambiar_clave"] is True


def prueba_no_se_puede_dejar_el_sistema_sin_superadministrador(cliente, sesion, raiz):
    # El sembrado («superadmin») también es superadministrador activo: con él hay dos.
    assert pedir(cliente, sesion, raiz, "PATCH", f"/api/admin/cuentas/{raiz.usuario_id}", json={"activa": False}).status_code == 409, "a sí mismo no"
    mias = pedir(cliente, sesion, raiz, "GET", "/api/admin/cuentas").json()
    sembrado = next(c for c in mias if c["usuario"] == "superadmin")
    r = pedir(cliente, sesion, raiz, "PATCH", f"/api/admin/cuentas/{sembrado['id']}", json={"activa": False})
    assert r.status_code == 200 and r.json()["activa"] is False
    propia = next(c for c in mias if c["usuario"] == "raiz")
    asignacion = propia["asignaciones"][0]["id"]
    assert pedir(cliente, sesion, raiz, "DELETE", f"/api/admin/cuentas/{raiz.usuario_id}/roles/{asignacion}").status_code == 409


def prueba_se_agrega_y_se_quita_un_rol(cliente, sesion, raiz):
    cuenta = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={"usuario": "epi.uno", "nombres": "Epi", "apellidos": "Uno", "rol": "digitador", "unidad": "epidemiologia"}).json()
    r = pedir(cliente, sesion, raiz, "POST", f"/api/admin/cuentas/{cuenta['id']}/roles", json={"rol": "consulta", "unidad": "epidemiologia"})
    assert r.status_code == 200 and len(r.json()["asignaciones"]) == 2, "Epidemiología: reporta y recibe"
    assert pedir(cliente, sesion, raiz, "POST", f"/api/admin/cuentas/{cuenta['id']}/roles", json={"rol": "consulta", "unidad": "epidemiologia"}).status_code == 409
    quitar = r.json()["asignaciones"][1]["id"]
    r = pedir(cliente, sesion, raiz, "DELETE", f"/api/admin/cuentas/{cuenta['id']}/roles/{quitar}")
    assert r.status_code == 200 and [a["rol"] for a in r.json()["asignaciones"]] == ["digitador"]


def prueba_eliminar_una_cuenta_la_saca_del_sistema_y_libera_su_usuario(cliente, sesion, raiz):
    cuenta = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={
        "usuario": "temporal", "nombres": "Temp", "apellidos": "Oral", "correo": "temp@hrl.gob.pe", "rol": "digitador", "unidad": "nutricion",
    }).json()
    pedir(cliente, sesion, raiz, "POST", f"/api/admin/cuentas/{cuenta['id']}/clave", json={"clave": "una-clave-larga-1", "provisional": False})

    assert pedir(cliente, sesion, raiz, "DELETE", f"/api/admin/cuentas/{cuenta['id']}").status_code == 204
    assert "temporal" not in [c["usuario"] for c in pedir(cliente, sesion, raiz, "GET", "/api/admin/cuentas").json()]
    assert pedir(cliente, sesion, raiz, "PATCH", f"/api/admin/cuentas/{cuenta['id']}", json={"cargo": "x"}).status_code == 404
    assert pedir(cliente, sesion, raiz, "DELETE", f"/api/admin/cuentas/{cuenta['id']}").status_code == 404, "no se elimina dos veces"
    entrada = pedir(cliente, sesion, None, "POST", "/api/auth/login", json={"usuario": "temporal", "clave": "una-clave-larga-1"})
    assert entrada.status_code == 401, "una cuenta eliminada no entra"

    # Su usuario y su correo quedan libres: la fila eliminada no los ocupa.
    otra = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={
        "usuario": "temporal", "nombres": "Otra", "apellidos": "Persona", "correo": "temp@hrl.gob.pe", "rol": "digitador", "unidad": "nutricion",
    })
    assert otra.status_code == 201, otra.text


def prueba_no_se_elimina_la_propia_cuenta_ni_el_ultimo_superadministrador(cliente, sesion, raiz):
    assert pedir(cliente, sesion, raiz, "DELETE", f"/api/admin/cuentas/{raiz.usuario_id}").status_code == 409, "a sí mismo no"
    sembrado = next(c for c in pedir(cliente, sesion, raiz, "GET", "/api/admin/cuentas").json() if c["usuario"] == "superadmin")
    # Con «raiz» activo, el sembrado no es el último: se puede eliminar.
    assert pedir(cliente, sesion, raiz, "DELETE", f"/api/admin/cuentas/{sembrado['id']}").status_code == 204


# --------------------------------------------------------------------- plazos


def _limite_de_agosto(cliente, sesion, rev):
    r = pedir(cliente, sesion, rev, "GET", "/api/reportes", params={"periodo": "2026-08", "formato": "NUT"})
    assert r.status_code == 200, r.text
    return r.json()["filas"][0]["fecha_limite"]


def prueba_el_plazo_que_se_fija_es_el_que_aplica_la_lista_de_reportes(cliente, sesion, raiz):
    rev = e.revisor_de_estadistica(sesion, nombre="rev.plazo")
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/plazos", json={"area": "NUT", "destino": "estadistica", "dia": 3}).status_code == 204
    assert _limite_de_agosto(cliente, sesion, rev) == "2026-09-03"
    plazos_ = pedir(cliente, sesion, raiz, "GET", "/api/admin/plazos").json()
    nut = next(a for a in plazos_["areas"] if a["codigo"] == "NUT")
    assert (nut["dia_propio"], nut["dia_efectivo"]) == (3, 3)
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/plazos", json={"area": "NUT", "destino": "estadistica", "dia": 31}).status_code == 422
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/plazos", json={"area": "XXX", "destino": "estadistica", "dia": 5}).status_code == 404
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/plazos", json={"area": "default", "destino": "estadistica", "dia": None}).status_code == 422


def prueba_con_dia_habil_un_plazo_en_domingo_o_feriado_se_corre(cliente, sesion, raiz):
    rev = e.revisor_de_estadistica(sesion, nombre="rev.plazo")
    # 6 de septiembre de 2026 es domingo; el 7, lunes.
    pedir(cliente, sesion, raiz, "PUT", "/api/admin/plazos", json={"area": "NUT", "destino": "estadistica", "dia": 6})
    assert _limite_de_agosto(cliente, sesion, rev) == "2026-09-06", "apagado, vence el día que diga, caiga donde caiga"
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/plazos/dia-habil", json={"activa": True}).status_code == 204
    assert _limite_de_agosto(cliente, sesion, rev) == "2026-09-07"
    assert pedir(cliente, sesion, raiz, "POST", "/api/admin/feriados", json={"fecha": "2026-09-07", "descripcion": "Feriado de prueba"}).status_code == 204
    assert _limite_de_agosto(cliente, sesion, rev) == "2026-09-08"
    assert pedir(cliente, sesion, raiz, "DELETE", "/api/admin/feriados/2026-09-07").status_code == 204
    assert _limite_de_agosto(cliente, sesion, rev) == "2026-09-07"


def prueba_el_umbral_de_alertas_se_valida(cliente, sesion, raiz):
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/alertas", json={"area": "NUT", "dias": 3}).status_code == 204
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/alertas", json={"area": "NUT", "dias": 9}).status_code == 422
    nut = next(a for a in pedir(cliente, sesion, raiz, "GET", "/api/admin/plazos").json()["areas"] if a["codigo"] == "NUT")
    assert nut["alerta_dias_efectivo"] == 3


# ----------------------------------------------------------- áreas, flujo y matriz


def prueba_pausar_un_area_la_saca_de_la_configuracion_publica_y_sin_formato_no_se_activa(cliente, sesion, raiz):
    e.montar_catalogo_de_ejemplo(sesion)
    en_flujo = lambda: [a["clave"] for a in pedir(cliente, sesion, None, "GET", "/api/configuracion").json()["areas_en_flujo"]]  # noqa: E731
    assert "nutricion" in en_flujo()
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/areas/nutricion/flujo", json={"en_flujo": False, "justificacion": "corto"}).status_code == 422
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/areas/nutricion/flujo", json={"en_flujo": False, "justificacion": "Se corrige su plantilla esta semana"}).status_code == 204
    assert "nutricion" not in en_flujo()
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/areas/lavanderia/flujo", json={"en_flujo": True, "justificacion": "Queremos que empiece ya mismo"}).status_code == 409


def prueba_un_destino_se_agrega_desde_hoy_y_se_retira_sin_borrar_su_pasado(cliente, sesion, raiz):
    justificacion = "Planeamiento pidió los datos de Farmacia"
    assert pedir(cliente, sesion, raiz, "POST", "/api/admin/matriz", json={"origen": "nutricion", "destino": "nutricion", "justificacion": justificacion}).status_code == 422
    r = pedir(cliente, sesion, raiz, "POST", "/api/admin/matriz", json={"origen": "farmacia", "destino": "cuerpo-tecnico", "justificacion": justificacion})
    assert r.status_code in (204, 409), r.text
    matriz = pedir(cliente, sesion, raiz, "GET", "/api/admin/matriz").json()
    vieja = next(f for f in matriz["vigentes"] if f["desde"] < "2026-09-13")
    assert pedir(cliente, sesion, raiz, "POST", f"/api/admin/matriz/{vieja['id']}/retirar", json={"justificacion": "Ya no lo necesitan para su consolidado"}).status_code == 204
    despues = pedir(cliente, sesion, raiz, "GET", "/api/admin/matriz").json()
    retirada = next(f for f in despues["historicas"] if f["id"] == vieja["id"])
    assert retirada["hasta"] == "2026-09-12" and "Ya no lo necesitan" in retirada["observacion"]


# --------------------------------------------------------- personalización


def prueba_la_personalizacion_se_ve_en_el_ingreso_y_el_aviso_vence(cliente, sesion, raiz):
    datos = {"nombre_sistema": "Reporte Estadístico HRL", "mensaje_ingreso": "Use su cuenta del hospital.", "aviso_texto": "Mantenimiento el sábado",
             "aviso_tono": "warning", "aviso_hasta": "2026-09-20", "pref_contraste": "alto", "pref_tamano_texto": "115", "pref_subrayar_enlaces": True}
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/personalizacion", json=datos).status_code == 204
    publica = pedir(cliente, sesion, None, "GET", "/api/configuracion").json()
    assert publica["nombre_sistema"] == "Reporte Estadístico HRL" and publica["aviso"]["tono"] == "warning"
    assert publica["preferencias"] == {"contraste": "alto", "tamano_texto": "115", "subrayar_enlaces": True}
    vencido = pedir(cliente, sesion, raiz, "PUT", "/api/admin/personalizacion", json={**datos, "aviso_hasta": "2026-09-01"})
    assert vencido.status_code == 204 and pedir(cliente, sesion, None, "GET", "/api/configuracion").json()["aviso"] is None
    assert pedir(cliente, sesion, raiz, "PUT", "/api/admin/personalizacion", json={**datos, "nombre_sistema": "  "}).status_code == 422


# ------------------------------------------------------------------- soporte


def prueba_ver_como_da_una_sesion_de_solo_lectura(cliente, sesion, raiz):
    cuenta = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={"usuario": "rev.dos", "nombres": "Rev", "apellidos": "Dos", "rol": "revisor"}).json()
    assert pedir(cliente, sesion, raiz, "POST", f"/api/admin/ver-como/{cuenta['id']}", json={"justificacion": "x"}).status_code == 422
    r = pedir(cliente, sesion, raiz, "POST", f"/api/admin/ver-como/{cuenta['id']}", json={"justificacion": "No ve la bandeja de agosto, reviso"})
    assert r.status_code == 200, r.text
    assert r.json()["usuario"]["usuario"] == "rev.dos" and r.json()["usuario"]["roles_de_interfaz"] == ["estadistica"]
    token = {"Authorization": f"Bearer {r.json()['token']}"}
    assert cliente.get("/api/reportes", headers=token).status_code == 200
    escribir = cliente.post("/api/reportes/NUT/2026-08/transiciones/revisar", headers=token, json={})
    assert escribir.status_code == 403 and "solo lectura" in escribir.json()["detail"]


# ------------------------------------------------------------------- bitácora


def prueba_la_bitacora_dice_quien_cambio_que_y_no_muestra_el_hash(cliente, sesion, raiz):
    cuenta = pedir(cliente, sesion, raiz, "POST", "/api/admin/cuentas", json={"usuario": "bita.uno", "nombres": "Bita", "apellidos": "Uno", "rol": "revisor"}).json()
    pedir(cliente, sesion, raiz, "POST", f"/api/admin/cuentas/{cuenta['id']}/clave", json={"clave": "otra-clave-larga-2"})
    pedir(cliente, sesion, raiz, "PATCH", f"/api/admin/cuentas/{cuenta['id']}", json={"apellidos": "Dos"})
    r = pedir(cliente, sesion, raiz, "GET", "/api/admin/bitacora", params={"tabla": "seguridad.usuario", "usuario_id": raiz.usuario_id})
    assert r.status_code == 200, r.text
    filas = [f for f in r.json()["filas"] if f["registro_id"] == cuenta["id"]]
    cambio_de_apellido = next(f for f in filas if "apellidos" in f["campos"])
    assert cambio_de_apellido["usuario"] == "raiz" and cambio_de_apellido["despues"]["apellidos"] == "Dos"
    assert all(f["despues"] is None or f["despues"].get("contrasena_hash") in (None, "•••") for f in filas)
    assert date.fromisoformat(r.json()["filas"][0]["fecha"][:10]) >= date(2026, 1, 1)


# ------------------------------------------------------------------ cobertura


def prueba_la_cobertura_dice_que_meses_tiene_cada_area_y_solo_la_ve_el_superadmin(cliente, sesion, raiz):
    r = e.abrir_reporte(sesion, "NUT", 3, "remitido")
    e.dar_carga_aceptada(sesion, r)
    assert pedir(cliente, sesion, e.revisor_de_estadistica(sesion), "GET", "/api/admin/cobertura").status_code == 403
    respuesta = pedir(cliente, sesion, raiz, "GET", "/api/admin/cobertura?anio=2026")
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    nut = next(a for a in cuerpo["areas"] if a["clave"] == "nutricion")
    assert cuerpo["meses"][0] == "2026-01" and len(nut["meses"]) == 12
    assert (nut["meses"][2]["estado"], nut["meses"][2]["huella"]) == ("remitido", "ab" * 32)
    assert "mantenimiento" not in {a["clave"] for a in cuerpo["areas"]}
