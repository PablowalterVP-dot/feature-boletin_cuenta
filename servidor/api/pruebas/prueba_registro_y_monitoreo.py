"""Lo que el sistema anota para vigilarse (migración 0010) y quién ve el panel de
monitoreo. Dirección General mira todo el hospital, pero solo lo entregado, y nunca
la lista de pacientes."""

from dataclasses import replace
from datetime import datetime

import escenario as e
import pytest
from fastapi.testclient import TestClient
from prueba_api_consultas import cliente, envio, get  # noqa: F401 - cliente es un fixture
from prueba_auth import CLAVE, crear_cuenta, entrar
from sqlalchemy import text

from app.api import errores
from app.dominio import permisos
from app.dominio.sesion import UNIDAD_DIRECCION, Asignacion, Sesion
from app.servicios import registro

MOMENTO = datetime(2026, 9, 13, 12, 0)


def sesion_con(*asignaciones) -> Sesion:
    return Sesion(usuario_id=1, usuario="x", nombre="X", asignaciones=asignaciones, debe_cambiar_clave=False, emitido_en=MOMENTO, expira_en=MOMENTO)


def de_direccion(sesion):
    """El escenario nombra la unidad por su código; el token real lleva su clave."""
    actor = e.persona(sesion, "dir.gen", ("consulta", "DG"))
    return replace(actor, asignaciones=tuple(replace(a, unidad=UNIDAD_DIRECCION) for a in actor.asignaciones))


# ------------------------------------------- quién carga el reporte DL 1153


def prueba_estadistica_no_carga_el_reporte_dl1153_aunque_digite():
    from fastapi import HTTPException

    from app.api.monitoreo import cargar_reporte, registrar

    estadistica = sesion_con(Asignacion("revisor", None, frozenset({permisos.DESEMPENO_VER, permisos.MONITOREO_REGISTRAR})))
    superadmin = sesion_con(Asignacion("superadmin", None, frozenset({permisos.DESEMPENO_VER, permisos.DESEMPENO_CARGAR, permisos.MONITOREO_REGISTRAR})))
    assert registrar(estadistica) is estadistica
    with pytest.raises(HTTPException) as e:
        cargar_reporte(estadistica)
    assert e.value.status_code == 403
    assert cargar_reporte(superadmin) is superadmin


# ------------------------------------------------------- quién ve el panel


def prueba_estadistica_y_direccion_ven_el_panel_y_las_demas_oficinas_no():
    estadistica = sesion_con(Asignacion("revisor", None, frozenset({permisos.DESEMPENO_VER})))
    direccion = sesion_con(Asignacion("consulta", UNIDAD_DIRECCION, frozenset({permisos.REPORTE_VER})))
    planeamiento = sesion_con(Asignacion("consulta", "planeamiento", frozenset({permisos.REPORTE_VER})))
    area = sesion_con(Asignacion("digitador", "nutricion", frozenset({permisos.REPORTE_VER, permisos.REPORTE_CARGAR})))
    assert estadistica.ve_monitoreo
    assert direccion.ve_monitoreo
    assert not planeamiento.ve_monitoreo
    assert not area.ve_monitoreo


def prueba_la_clave_de_direccion_es_la_que_tiene_la_unidad_en_la_base(sesion):
    assert sesion.scalar(text("SELECT clave FROM organizacion.unidad_organica WHERE codigo = 'DG'")) == UNIDAD_DIRECCION


@pytest.mark.bd
def prueba_direccion_ve_lo_entregado_de_toda_area_pero_ningun_borrador(cliente, sesion):  # noqa: F811
    direccion = de_direccion(sesion)
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    assert [f["periodo"] for f in get(cliente, sesion, direccion, "/api/reportes").json()["filas"]] == ["2026-07"]
    assert get(cliente, sesion, direccion, "/api/reportes/NUT/2026-07").status_code == 200
    assert get(cliente, sesion, direccion, "/api/reportes/NUT/2026-07/valores").status_code == 200
    assert get(cliente, sesion, direccion, "/api/reportes/NUT/2026-08").status_code == 403


@pytest.mark.bd
def prueba_otra_oficina_sigue_viendo_solo_lo_que_se_le_remitio(cliente, sesion):  # noqa: F811
    oficina = e.persona(sesion, "of.cte", ("consulta", "CTE"))
    e.abrir_reporte(sesion, "NUT", 7, "remitido", fecha_envio=envio(8, 9), folio="CR-2026-07-NUT")
    assert get(cliente, sesion, oficina, "/api/reportes/NUT/2026-07").status_code == 403


@pytest.mark.bd
def prueba_direccion_ve_el_resumen_y_la_ficha_pero_no_la_lista_de_pacientes(cliente, sesion):  # noqa: F811
    direccion = de_direccion(sesion)
    oficina = e.persona(sesion, "of.cte", ("consulta", "CTE"))
    assert get(cliente, sesion, direccion, "/api/desempeno/resumen").status_code == 200
    assert get(cliente, sesion, direccion, "/api/desempeno/fichas/14").status_code == 200
    assert get(cliente, sesion, direccion, "/api/desempeno/fichas/14/casos", mes=1).status_code == 403
    assert get(cliente, sesion, oficina, "/api/desempeno/resumen").status_code == 403


# ------------------------------------------------------- intentos de ingreso

try:
    from prueba_auth import ajustes, cliente as cliente_auth, reloj  # noqa: F401 - son fixtures
except ImportError:  # pragma: no cover
    raise


@pytest.mark.bd
def prueba_cinco_fallos_seguidos_frenan_la_cuenta_aun_con_la_clave_correcta(cliente_auth, sesion):  # noqa: F811
    crear_cuenta(sesion)
    for _ in range(registro.MAX_FALLOS):
        assert entrar(cliente_auth, clave="clave-equivocada").status_code == 401
    r = entrar(cliente_auth)
    assert r.status_code == 429
    assert "Espere" in r.json()["detail"]


@pytest.mark.bd
def prueba_un_ingreso_correcto_borra_los_fallos_anteriores(cliente_auth, sesion):  # noqa: F811
    crear_cuenta(sesion)
    sesion.execute(text("INSERT INTO auditoria.intento_ingreso (nombre_usuario, exitoso, fecha) SELECT 'ana', FALSE, now() - interval '5 minutes' FROM generate_series(1, 4)"))
    sesion.execute(text("INSERT INTO auditoria.intento_ingreso (nombre_usuario, exitoso, fecha) VALUES ('ana', TRUE, now() - interval '1 minute')"))
    assert not registro.demasiados_intentos(sesion, "ana")
    assert entrar(cliente_auth, clave="clave-equivocada").status_code == 401
    assert entrar(cliente_auth).status_code == 200


@pytest.mark.bd
def prueba_los_fallos_viejos_ya_no_frenan(sesion):
    sesion.execute(text("INSERT INTO auditoria.intento_ingreso (nombre_usuario, exitoso, fecha) SELECT 'ana', FALSE, now() - interval '20 minutes' FROM generate_series(1, 9)"))
    assert not registro.demasiados_intentos(sesion, "ana")


@pytest.mark.bd
def prueba_un_usuario_que_no_existe_tambien_se_frena_para_no_delatar_cuales_existen(cliente_auth):  # noqa: F811
    for _ in range(registro.MAX_FALLOS):
        assert entrar(cliente_auth, usuario="nadie", clave="clave-equivocada").status_code == 401
    assert entrar(cliente_auth, usuario="nadie", clave="clave-equivocada").status_code == 429


@pytest.mark.bd
def prueba_un_intento_nunca_guarda_la_contrasena(cliente_auth, sesion):  # noqa: F811
    crear_cuenta(sesion)
    entrar(cliente_auth, clave="clave-secreta-equivocada")
    columnas = sesion.execute(text("SELECT * FROM auditoria.intento_ingreso WHERE nombre_usuario = 'ana'")).mappings().one()
    assert "clave-secreta-equivocada" not in str(dict(columnas))
    assert columnas["exitoso"] is False


@pytest.mark.bd
def prueba_sin_el_registro_de_intentos_la_gente_igual_entra(cliente_auth, sesion):  # noqa: F811
    """Vigilar no puede costar el sistema entero: sin la tabla se pierde el freno, no el ingreso."""
    crear_cuenta(sesion)
    sesion.execute(text("ALTER TABLE auditoria.intento_ingreso RENAME TO intento_ingreso_ausente"))
    assert entrar(cliente_auth, clave="clave-equivocada").status_code == 401
    assert entrar(cliente_auth).status_code == 200


# -------------------------------------------------------- errores inesperados


@pytest.mark.bd
def prueba_un_error_inesperado_queda_anotado_con_su_referencia(sesion):
    referencia = registro.nueva_referencia()
    registro.anotar_error(sesion, referencia, "GET", "/api/x", ValueError("algo raro"))
    fila = sesion.execute(text("SELECT tipo, ruta, mensaje FROM auditoria.error_sistema WHERE referencia = :r"), {"r": referencia}).one()
    assert tuple(fila) == ("ValueError", "/api/x", "algo raro")


@pytest.mark.bd
def prueba_vigilancia_cuenta_lo_que_paso(sesion):
    registro.anotar_error(sesion, registro.nueva_referencia(), "GET", "/api/x", ValueError("x"))
    sesion.execute(text("INSERT INTO auditoria.intento_ingreso (nombre_usuario, exitoso) SELECT 'ana', FALSE FROM generate_series(1, 5)"))
    v = registro.vigilancia(sesion)
    assert v["disponible"] and v["errores_7_dias"] == 1 and v["ingresos_fallidos_24h"] == 5 and v["cuentas_frenadas"] == 1
    assert v["ultimos_errores"][0]["tipo"] == "ValueError"


def prueba_la_persona_recibe_una_referencia_y_no_el_detalle_tecnico():
    from fastapi import FastAPI

    aplicacion = FastAPI()
    errores.registrar(aplicacion)

    @aplicacion.get("/roto")
    def roto():
        raise ValueError("contraseña de la base: secreta")

    aplicacion.dependency_overrides[errores.obtener_sesion_bd] = lambda: (_ for _ in ())
    r = TestClient(aplicacion, raise_server_exceptions=False).get("/roto")
    assert r.status_code == 500
    cuerpo = r.json()
    assert cuerpo["codigo"] == "error_interno"
    assert cuerpo["datos"]["referencia"] in cuerpo["detail"]
    assert "secreta" not in r.text
