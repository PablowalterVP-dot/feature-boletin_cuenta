"""Con `INGRESO=estadistica` (fase 3 de la decisión 0011), el token lo emite la API de
Estadística y esta lo lee: sus permisos `hospitalizacion.*` deciden el rol y los
servicios de la cuenta, y la tabla `cuenta` guarda su espejo."""

import re
import time
from pathlib import Path

import jwt
import pytest
from sqlalchemy import text

from app import cuentas_estadistica as ce
from app.seguridad import TokenInvalido, crear_token, leer_token_de_estadistica, secreto

SEEDER = Path(__file__).resolve().parents[2] / "api" / "bd" / "seeders" / "0009_hospitalizacion.sql"
SERVICIOS = ["cuidados-criticos", "medicina-a", "medicina-b", "medicina-intermedios", "quemados"]
POR_DEPARTAMENTO = {"medicina": ["medicina-a", "medicina-b", "medicina-intermedios"], "uci-medicina": ["cuidados-criticos"], "quemados": ["quemados"]}


def asignacion(rol, unidad, *permisos):
    return {"rol": rol, "unidad": unidad, "permisos": list(permisos)}


def token_de_estadistica(*asignaciones, usr="medicina.b", nom="Enfermería Medicina B", aud=("estadistica", "egresos-hospitalarios"), **extra):
    """Como lo firma `servidor/api/app/seguridad.py::crear_token`."""
    ahora = int(time.time())
    reclamos = {"sub": "41", "usr": usr, "nom": nom, "asignaciones": list(asignaciones), "cc": False, "iat": ahora, "exp": ahora + 8 * 3600, **extra}
    if aud is not None:
        reclamos["aud"] = list(aud)
    return jwt.encode(reclamos, secreto(), algorithm="HS256")


def cuenta(*asignaciones, **reclamos):
    base = {"usr": "medicina.b", "nom": "Enfermería Medicina B", "asignaciones": list(asignaciones), **reclamos}
    return ce.cuenta_desde_token(base, servicios_con_camas=SERVICIOS, servicios_por_departamento=POR_DEPARTAMENTO)


# ------------------------------------------------------------------ token


def test_lee_el_token_de_estadistica_con_los_dos_destinatarios():
    r = leer_token_de_estadistica(token_de_estadistica(asignacion("enfermeria", "medicina-b", "hospitalizacion.ver", "hospitalizacion.operar")))
    assert r["usr"] == "medicina.b" and r["asignaciones"][0]["unidad"] == "medicina-b"


def test_un_token_solo_para_estadistica_no_abre_hospitalizacion():
    for aud in (("estadistica",), None):
        with pytest.raises(TokenInvalido):
            leer_token_de_estadistica(token_de_estadistica(aud=aud))


def test_un_token_del_ingreso_propio_no_sirve_con_el_de_estadistica():
    """Tiene el mismo destinatario, pero no trae asignaciones."""
    propio, _ = crear_token({"id": "medicina.b", "usuario": "medicina.b", "nombre": "x", "rol": "enfermeria"}, debe_cambiar_clave=False)
    with pytest.raises(TokenInvalido):
        leer_token_de_estadistica(propio)


def test_el_token_vencido_de_estadistica_se_reconoce():
    t = token_de_estadistica()
    with pytest.raises(TokenInvalido) as e:
        leer_token_de_estadistica(t, ahora=time.time() + 9 * 3600)
    assert e.value.vencido


# ------------------------------------------------------- permisos a cuenta


def test_la_enfermeria_opera_solo_su_area():
    c = cuenta(asignacion("enfermeria", "medicina-b", "hospitalizacion.ver", "hospitalizacion.operar"))
    assert (c["id"], c["rol"], c["servicios"], c["solo_lectura"]) == ("medicina.b", "enfermeria", ["medicina-b"], False)


def test_la_jefatura_del_departamento_ve_sus_tres_areas():
    c = cuenta(asignacion("jefe_departamento", "medicina", "hospitalizacion.ver", "hospitalizacion.supervisar"), usr="dep.medicina")
    assert (c["rol"], c["servicios"]) == ("departamento", ["medicina-a", "medicina-b", "medicina-intermedios"])


def test_la_clave_con_prefijo_de_estadistica_llega_al_id_de_este_sistema():
    """Desde el seeder 0010, las unidades de hospitalización en Estadística llevan
    `hosp-area-` o `hosp-dep-`: así `ginecologia` no choca con Gineco-Obstetricia."""
    c = cuenta(asignacion("enfermeria", "hosp-area-medicina-b", "hospitalizacion.ver", "hospitalizacion.operar"))
    assert c["servicios"] == ["medicina-b"]
    c = cuenta(asignacion("jefe_departamento", "hosp-dep-medicina", "hospitalizacion.ver", "hospitalizacion.supervisar"), usr="dep.medicina")
    assert c["servicios"] == ["medicina-a", "medicina-b", "medicina-intermedios"]


def test_un_area_sin_camas_en_el_plano_entra_sin_servicios():
    c = cuenta(asignacion("enfermeria", "hosp-area-cirugia", "hospitalizacion.ver", "hospitalizacion.operar"), usr="cirugia")
    assert (c["rol"], c["servicios"]) == ("enfermeria", [])


@pytest.mark.parametrize("clave, id_", [("hosp-area-quemados", "quemados"), ("hosp-dep-quemados", "quemados"), ("medicina-a", "medicina-a"), ("hosp-areas", "hosp-areas")])
def test_id_de_unidad(clave, id_):
    assert ce.id_de_unidad(clave) == id_


@pytest.mark.parametrize(
    "rol_de_estadistica, permiso, rol",
    [
        ("admision", "hospitalizacion.admision", "admision"),
        ("control_camas", "hospitalizacion.camas", "camas"),
        ("mantenimiento_camas", "hospitalizacion.mantenimiento", "mantenimiento"),
        ("revisor", "hospitalizacion.validar", "jefatura"),
    ],
)
def test_los_roles_globales_ven_todas_las_areas(rol_de_estadistica, permiso, rol):
    c = cuenta(asignacion(rol_de_estadistica, None, "hospitalizacion.ver", permiso))
    assert (c["rol"], c["servicios"]) == (rol, SERVICIOS)


def test_estadistica_con_su_rol_de_revisor_entra_como_jefatura():
    """Un solo rol: `revisor` trae los permisos de hospitalización (seeder 0011 de Estadística)."""
    c = cuenta(
        asignacion("revisor", None, "reporte.ver", "reporte.validar", "hospitalizacion.ver", "hospitalizacion.validar"),
        usr="Estadistica",
    )
    assert (c["id"], c["rol"]) == ("estadistica", "jefatura")


def test_el_superadministrador_con_todos_los_permisos_entra_como_estadistica():
    todos = [f"hospitalizacion.{p}" for p in ("ver", "operar", "supervisar", "admision", "camas", "mantenimiento", "validar")]
    assert cuenta(asignacion("superadmin", None, *todos))["rol"] == "jefatura"


def test_sin_permisos_de_hospitalizacion_no_hay_cuenta():
    assert cuenta(asignacion("digitador", "nutricion", "reporte.ver", "reporte.enviar")) is None
    assert cuenta(asignacion("enfermeria", "medicina-b", "hospitalizacion.ver")) is None


def test_una_unidad_que_no_tiene_camas_aqui_no_da_servicios():
    c = cuenta(asignacion("enfermeria", "nutricion", "hospitalizacion.ver", "hospitalizacion.operar"))
    assert c["rol"] == "enfermeria" and c["servicios"] == []


def test_ver_como_es_de_solo_lectura():
    assert cuenta(asignacion("enfermeria", "medicina-b", "hospitalizacion.ver", "hospitalizacion.operar"), obs=1)["solo_lectura"]


def test_los_permisos_que_se_leen_son_los_que_siembra_estadistica():
    """El contrato entre las dos bases: lo que traduce esta API existe en el seeder 0009
    de Estadística, con los roles y unidades que esta prueba usa."""
    seeder = SEEDER.read_text(encoding="utf-8")
    sembrados = set(re.findall(r"'(hospitalizacion\.[a-z]+)'", seeder))
    assert {p for p, _ in ce.PRECEDENCIA} | {"hospitalizacion.ver"} == sembrados
    for clave in [*SERVICIOS, "medicina"]:
        assert f"'{clave}'" in seeder, f"la unidad {clave} no está en el seeder"


# ---------------------------------------------------------------- espejo


def test_el_espejo_se_crea_sin_clave_y_se_pone_al_dia(conn):
    c = cuenta(asignacion("enfermeria", "medicina-b", "hospitalizacion.ver", "hospitalizacion.operar"), usr="nueva.enfermera", nom="Enfermería B, turno noche")
    ce.sincronizar(conn, c)
    fila = conn.execute(text("SELECT nombre, rol, origen, clave_hash FROM cuenta WHERE id = 'nueva.enfermera'")).one()
    assert tuple(fila) == ("Enfermería B, turno noche", "enfermeria", "estadistica", None)

    c["servicios"] = ["medicina-a", "medicina-b"]
    ce.sincronizar(conn, c)
    servicios = conn.execute(text("SELECT servicio_id FROM cuenta_servicio WHERE cuenta_id = 'nueva.enfermera' ORDER BY 1")).scalars().all()
    assert servicios == ["medicina-a", "medicina-b"]


def test_sin_cambios_el_espejo_no_escribe(conn):
    c = cuenta(asignacion("enfermeria", "medicina-b", "hospitalizacion.ver", "hospitalizacion.operar"), usr="otra.enfermera", nom="Enfermería")
    ce.sincronizar(conn, c)
    antes = conn.execute(text("SELECT count(*) FROM auditoria")).scalar_one()
    ce.sincronizar(conn, c)
    assert conn.execute(text("SELECT count(*) FROM auditoria")).scalar_one() == antes


def test_la_cuenta_del_prototipo_pasa_a_ser_la_de_estadistica_y_conserva_su_historia(conn):
    """`medicina.b` registró movimientos con el ingreso propio; al entrar con el de
    Estadística sigue siendo la misma fila, ahora con origen estadistica."""
    antes = conn.execute(text("SELECT count(*) FROM movimiento WHERE cuenta_id = 'medicina.b'")).scalar_one()
    ce.sincronizar(conn, cuenta(asignacion("enfermeria", "medicina-b", "hospitalizacion.ver", "hospitalizacion.operar")))
    assert conn.execute(text("SELECT origen FROM cuenta WHERE id = 'medicina.b'")).scalar_one() == "estadistica"
    assert conn.execute(text("SELECT count(*) FROM movimiento WHERE cuenta_id = 'medicina.b'")).scalar_one() == antes


def test_el_catalogo_sale_de_las_camas_activas(conn):
    servicios, por_departamento = ce.catalogo(conn)
    assert servicios == SERVICIOS
    assert por_departamento["medicina"] == ["medicina-a", "medicina-b", "medicina-intermedios"]


def test_estadistica_solo_mira_hospitalizacion():
    """15/11/2026: Estadística ve el plano, el consolidado y RENOXI, pero no opera.
    La API rechaza cualquier acción suya en un solo lugar."""
    from fastapi import HTTPException

    from app.principal import cuenta_que_escribe

    with pytest.raises(HTTPException) as e:
        cuenta_que_escribe({"id": "estadistica", "rol": "jefatura", "servicios": SERVICIOS, "solo_lectura": False})
    assert e.value.status_code == 403
    assert cuenta_que_escribe({"id": "medicina.b", "rol": "enfermeria", "servicios": ["medicina-b"], "solo_lectura": False})["rol"] == "enfermeria"
