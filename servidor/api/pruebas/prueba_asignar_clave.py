"""La herramienta que asigna la contraseña inicial (`python -m app.herramientas.asignar_clave`)."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.modelos import Usuario
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import RelojFijo
from app.herramientas import asignar_clave as herramienta
from app.herramientas.asignar_clave import NoSePuede, _destino, asignar_clave
from app.main import app
from app.seguridad import verificar_clave

pytestmark = pytest.mark.bd

CLAVE = "una-clave-inicial-larga"


def superadmin(sesion) -> Usuario:
    return sesion.scalar(select(Usuario).where(Usuario.nombre_usuario == "superadmin"))


def prueba_el_superadmin_sembrado_empieza_sin_contrasena_y_la_herramienta_se_la_da(sesion):
    u = superadmin(sesion)
    assert u.contrasena_hash == "POR_ASIGNAR" and not verificar_clave(CLAVE, u.contrasena_hash)
    asignar_clave(sesion, "superadmin", CLAVE)
    sesion.refresh(u)
    assert u.contrasena_hash.startswith("$argon2id$") and verificar_clave(CLAVE, u.contrasena_hash)


def prueba_por_omision_es_provisional_y_con_definitiva_no(sesion):
    u = asignar_clave(sesion, "superadmin", CLAVE)
    assert u.debe_cambiar_contrasena is True
    u = asignar_clave(sesion, "superadmin", CLAVE, provisional=False)
    assert u.debe_cambiar_contrasena is False


def prueba_despues_de_asignarla_el_superadmin_entra_pero_solo_para_cambiarla(sesion):
    """Recorre el arranque completo de una base nueva por HTTP."""
    asignar_clave(sesion, "superadmin", CLAVE)
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: RelojFijo(datetime(2026, 9, 13, 12, 0))
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(database_url="postgresql://x/y", jwt_secreto="secreto-de-pruebas-de-al-menos-32-caracteres", _env_file=None)
    try:
        c = TestClient(app)
        r = c.post("/api/auth/login", json={"usuario": "superadmin", "clave": CLAVE})
        assert r.status_code == 200 and r.json()["debe_cambiar_clave"] is True
        # Todos, cuando pueda operar: los de la base, también los de los módulos.
        assert len(r.json()["usuario"]["asignaciones"][0]["permisos"]) == sesion.execute(text("SELECT count(*) FROM seguridad.permiso WHERE fecha_eliminacion IS NULL")).scalar()
        cambio = c.post(
            "/api/auth/cambiar-clave",
            json={"clave_actual": CLAVE, "clave_nueva": "la-clave-definitiva-1"},
            headers={"Authorization": f"Bearer {r.json()['token']}"},
        )
        assert cambio.status_code == 200 and cambio.json()["debe_cambiar_clave"] is False
    finally:
        app.dependency_overrides.clear()


def prueba_una_cuenta_que_no_existe_o_eliminada_se_rechaza(sesion):
    with pytest.raises(NoSePuede, match="No existe"):
        asignar_clave(sesion, "nadie", CLAVE)
    sesion.execute(text("UPDATE seguridad.usuario SET fecha_eliminacion = now() WHERE nombre_usuario = 'superadmin'"))
    with pytest.raises(NoSePuede, match="No existe"):
        asignar_clave(sesion, "superadmin", CLAVE)


def prueba_una_clave_que_no_cumple_la_politica_no_se_guarda(sesion):
    with pytest.raises(NoSePuede, match="política"):
        asignar_clave(sesion, "superadmin", "corta")
    with pytest.raises(NoSePuede, match="nombre de usuario"):
        asignar_clave(sesion, "superadmin", "superadmin-y-mas-cosas")
    assert superadmin(sesion).contrasena_hash == "POR_ASIGNAR"


def prueba_no_distingue_mayusculas_en_el_nombre_de_usuario(sesion):
    asignar_clave(sesion, "  SuperAdmin ", CLAVE)
    assert verificar_clave(CLAVE, superadmin(sesion).contrasena_hash)


def prueba_la_bitacora_registra_el_cambio_sin_atribuirlo_a_ningun_usuario_de_la_aplicacion_ni_guardar_el_hash(sesion):
    sesion.execute(text("SELECT set_config('app.usuario_id', '', true)"))
    asignar_clave(sesion, "superadmin", CLAVE)
    fila = sesion.execute(
        text("SELECT usuario_id, usuario_bd, campos_modificados, COALESCE(datos_anteriores::text,'') || COALESCE(datos_nuevos::text,'') FROM auditoria.registro_cambio WHERE tabla = 'usuario' AND operacion = 'ACTUALIZAR' ORDER BY id DESC LIMIT 1")
    ).one()
    assert fila[0] is None and fila[1]  # ningún usuario de la aplicación, pero sí el de la BD
    assert "contrasena_hash" in fila[2]  # consta QUE cambió la contraseña…
    assert "argon2" not in fila[3] and "contrasena_hash" not in fila[3]  # …pero nunca su valor


# ------------------------------------------------------------------ la línea de comandos


@pytest.fixture
def linea_de_comandos(sesion, monkeypatch):
    """Sustituye la fábrica de sesiones por la de la prueba, que se deshace."""
    monkeypatch.setattr("app.datos.sesion.fabrica", lambda: (lambda: sesion))
    monkeypatch.setattr(herramienta, "obtener_ajustes", lambda: Ajustes(database_url="postgresql://u:secreta@servidor:5433/mi_base", jwt_secreto="x" * 32, _env_file=None))


def prueba_la_cli_asigna_la_clave_del_entorno_e_imprime_a_que_base_apunta_sin_la_contrasena(linea_de_comandos, sesion, monkeypatch, capsys):
    monkeypatch.setenv("NUEVA_CLAVE", CLAVE)
    assert herramienta.main(["superadmin"]) == 0
    salida = capsys.readouterr().out
    assert "servidor:5433/mi_base" in salida and "secreta" not in salida
    assert "provisional" in salida
    assert verificar_clave(CLAVE, superadmin(sesion).contrasena_hash)


def prueba_la_cli_con_definitiva_no_obliga_a_cambiarla(linea_de_comandos, sesion, monkeypatch, capsys):
    monkeypatch.setenv("NUEVA_CLAVE", CLAVE)
    assert herramienta.main(["superadmin", "--definitiva"]) == 0
    assert "provisional" not in capsys.readouterr().out
    assert superadmin(sesion).debe_cambiar_contrasena is False


def prueba_la_cli_pide_la_clave_dos_veces_y_rechaza_si_no_coinciden(linea_de_comandos, sesion, monkeypatch, capsys):
    monkeypatch.delenv("NUEVA_CLAVE", raising=False)
    respuestas = iter(["una-clave-inicial-larga", "otra-distinta-larga"])
    monkeypatch.setattr(herramienta.getpass, "getpass", lambda _mensaje: next(respuestas))
    assert herramienta.main(["superadmin"]) == 1
    assert "no coinciden" in capsys.readouterr().err
    assert superadmin(sesion).contrasena_hash == "POR_ASIGNAR"


def prueba_la_cli_falla_con_codigo_1_ante_una_cuenta_inexistente_o_una_clave_debil(linea_de_comandos, monkeypatch, capsys):
    monkeypatch.setenv("NUEVA_CLAVE", CLAVE)
    assert herramienta.main(["fantasma"]) == 1
    monkeypatch.setenv("NUEVA_CLAVE", "corta")
    assert herramienta.main(["superadmin"]) == 1
    assert "Error:" in capsys.readouterr().err


def prueba_el_destino_que_imprime_no_incluye_ni_la_contrasena_ni_el_usuario():
    salida = _destino("postgresql://usuario:contrasena-secreta@servidor:5433/mi_base")
    assert salida == "servidor:5433/mi_base" and "secreta" not in salida and "usuario" not in salida
