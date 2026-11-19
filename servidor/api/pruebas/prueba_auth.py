"""Inicio de sesión, cambio de contraseña y control de permisos por HTTP, contra la
base de Alejandro.

`TestClient` sobre la aplicación real, con tres dependencias sustituidas: la
sesión de base de datos (la de la prueba, que se deshace), el reloj (fijo, para
controlar la expiración) y los ajustes (un secreto de prueba).
"""

from datetime import datetime, timedelta

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import seguridad
from app.api import auth, dependencias
from app.api.dependencias import bd_auditada, exigir_permiso, obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.modelos import Rol, UnidadOrganica, Usuario, UsuarioRol
from app.datos.sesion import obtener_sesion_bd
from app.dominio import permisos, roles
from app.dominio.reloj import ZONA, RelojFijo
from app.dominio.sesion import Asignacion, Sesion
from app.main import app
from app.seguridad import hashear_clave

pytestmark = pytest.mark.bd

CLAVE = "clave-correcta-de-prueba"
HASH = hashear_clave(CLAVE)  # una sola vez: Argon2 es lento a propósito
SECRETO = "secreto-de-pruebas-de-al-menos-32-caracteres"
AHORA = datetime(2026, 9, 13, 12, 0, tzinfo=ZONA)
PERMISOS_DIGITADOR = ["reporte.cargar", "reporte.descargar", "reporte.enviar", "reporte.ver"]


@pytest.fixture
def reloj():
    return RelojFijo(AHORA)


@pytest.fixture
def ajustes():
    return Ajustes(database_url="postgresql://no-se-usa/x", jwt_secreto=SECRETO, _env_file=None)


def _con_dependencias(aplicacion, sesion, reloj, ajustes):
    aplicacion.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    aplicacion.dependency_overrides[obtener_reloj] = lambda: reloj
    aplicacion.dependency_overrides[obtener_ajustes_api] = lambda: ajustes


@pytest.fixture
def cliente(sesion, reloj, ajustes):
    _con_dependencias(app, sesion, reloj, ajustes)
    yield TestClient(app)
    app.dependency_overrides.clear()


def crear_cuenta(sesion: Session, nombre="ana", asignaciones=(("digitador", "NUT"),), *, activo=True, debe_cambiar=False, clave_hash=HASH) -> Usuario:
    u = Usuario(
        nombre_usuario=nombre, contrasena_hash=clave_hash, nombres="Ana", apellidos="Prueba", cargo="Jefatura", correo=f"{nombre}@hrl.gob.pe",
        es_activo=activo, debe_cambiar_contrasena=debe_cambiar,
    )
    sesion.add(u)
    sesion.flush()
    for codigo_rol, codigo_unidad in asignaciones:
        unidad_id = sesion.scalar(select(UnidadOrganica.id).where(UnidadOrganica.codigo == codigo_unidad)) if codigo_unidad else None
        rol_id = sesion.scalar(select(Rol.id).where(Rol.codigo == codigo_rol))
        sesion.add(UsuarioRol(usuario_id=u.id, rol_id=rol_id, unidad_organica_id=unidad_id))
    sesion.flush()
    return u


def entrar(cliente, usuario="ana", clave=CLAVE):
    return cliente.post("/api/auth/login", json={"usuario": usuario, "clave": clave})


def cabecera(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def olvidar_quien_actua(sesion) -> None:
    """En producción cada petición es una transacción nueva y `set_config(…, true)`
    no sobrevive a ella. En las pruebas todo ocurre en UNA transacción, así que lo
    que fijó una petición seguiría valiendo para la siguiente y taparía a un
    endpoint que olvidó fijarlo. Esto lo devuelve a «sin dato» entre peticiones."""
    sesion.execute(text("SELECT set_config('app.usuario_id', '', true), set_config('app.direccion_ip', '', true)"))


def bitacora(sesion, tabla: str, registro_id: int, operacion: str):
    return sesion.execute(
        text("SELECT usuario_id, host(direccion_ip) FROM auditoria.registro_cambio WHERE tabla = :t AND registro_id = :r AND operacion = :o ORDER BY id DESC LIMIT 1"),
        {"t": tabla, "r": registro_id, "o": operacion},
    ).one_or_none()


# -------------------------------------------------------------------- login


def prueba_iniciar_sesion_devuelve_un_token_de_ocho_horas_con_los_permisos_de_la_cuenta(cliente, sesion):
    crear_cuenta(sesion)
    r = entrar(cliente)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["tipo"] == "Bearer" and cuerpo["debe_cambiar_clave"] is False
    assert datetime.fromisoformat(cuerpo["expira_en"]) == AHORA + timedelta(hours=8)
    u = cuerpo["usuario"]
    assert (u["usuario"], u["nombre"], u["cargo"], u["correo"]) == ("ana", "Ana Prueba", "Jefatura", "ana@hrl.gob.pe")
    assert u["asignaciones"] == [{"rol": "digitador", "unidad": "nutricion", "permisos": PERMISOS_DIGITADOR}]
    assert u["roles_de_interfaz"] == ["area"]


def prueba_el_token_de_la_respuesta_lleva_las_asignaciones_y_esta_firmado_con_el_secreto(cliente, sesion):
    crear_cuenta(sesion)
    reclamos = jwt.decode(entrar(cliente).json()["token"], SECRETO, algorithms=["HS256"], audience="estadistica", options={"verify_exp": False})
    assert reclamos["asignaciones"] == [{"rol": "digitador", "unidad": "nutricion", "permisos": PERMISOS_DIGITADOR}]
    assert reclamos["cc"] is False and reclamos["exp"] - reclamos["iat"] == 8 * 3600


def prueba_la_respuesta_nunca_incluye_la_clave_ni_su_hash(cliente, sesion):
    crear_cuenta(sesion)
    texto = entrar(cliente).text
    assert CLAVE not in texto and "argon2" not in texto and "hash" not in texto


def prueba_el_usuario_no_distingue_mayusculas_ni_espacios_de_los_bordes(cliente, sesion):
    crear_cuenta(sesion, "Ana.Perez")
    assert entrar(cliente, "  ANA.perez ").status_code == 200


def prueba_la_clave_si_distingue_mayusculas(cliente, sesion):
    crear_cuenta(sesion)
    assert entrar(cliente, clave=CLAVE.upper()).status_code == 401


def prueba_clave_equivocada_y_usuario_inexistente_dan_exactamente_la_misma_respuesta(cliente, sesion):
    crear_cuenta(sesion)
    equivocada = entrar(cliente, "ana", "incorrecta")
    inexistente = entrar(cliente, "nadie", "incorrecta")
    assert equivocada.status_code == inexistente.status_code == 401
    assert equivocada.json() == inexistente.json() == {"detail": "Usuario o contraseña incorrectos."}


def prueba_con_un_usuario_inexistente_igual_se_hace_el_trabajo_de_verificar(cliente, sesion, monkeypatch):
    """Si no se verificara nada, responder sería más rápido que con una cuenta
    real y el tiempo delataría qué usuarios existen."""
    llamadas = []
    original = auth.verificar_clave

    def espiada(clave, hash_guardado):
        llamadas.append(hash_guardado)
        return original(clave, hash_guardado)

    monkeypatch.setattr(auth, "verificar_clave", espiada)
    entrar(cliente, "nadie", "x")
    assert llamadas == [seguridad.hash_de_relleno()]


def prueba_el_superadmin_sembrado_no_puede_entrar_con_ninguna_clave(cliente):
    """`04_semilla.sql` lo deja con `POR_ASIGNAR`, que no es un hash. Ni siquiera
    esa palabra sirve como contraseña."""
    for clave in ("POR_ASIGNAR", "superadmin", CLAVE, "x"):
        assert entrar(cliente, "superadmin", clave).status_code == 401


def prueba_una_cuenta_desactivada_lo_dice_solo_a_quien_sabe_la_clave(cliente, sesion):
    crear_cuenta(sesion, activo=False)
    con_clave = entrar(cliente)
    sin_clave = entrar(cliente, clave="incorrecta")
    assert con_clave.status_code == 403 and "desactivada" in con_clave.json()["detail"]
    assert sin_clave.status_code == 401 and "desactivada" not in sin_clave.text


def prueba_una_cuenta_eliminada_lo_ve_como_si_no_existiera(cliente, sesion):
    u = crear_cuenta(sesion)
    u.fecha_eliminacion = func.now()
    sesion.flush()
    assert entrar(cliente).json() == {"detail": "Usuario o contraseña incorrectos."}


def prueba_una_cuenta_sin_permisos_no_puede_entrar(cliente, sesion):
    crear_cuenta(sesion, asignaciones=())
    r = entrar(cliente)
    assert r.status_code == 403 and "ningún permiso" in r.json()["detail"]


@pytest.mark.parametrize("cuerpo", [{}, {"usuario": "ana"}, {"clave": "x"}, {"usuario": "", "clave": "x"}, {"usuario": "ana", "clave": ""}, {"usuario": "a" * 61, "clave": "x"}, {"usuario": "ana", "clave": "x" * 201}])
def prueba_un_cuerpo_mal_formado_o_desmedido_se_rechaza_antes_de_gastar_argon2(cliente, cuerpo):
    assert cliente.post("/api/auth/login", json=cuerpo).status_code == 422


# ------------------------------------------------- las asignaciones que salen de la BD


def prueba_el_revisor_de_estadistica_entra_como_global(cliente, sesion):
    crear_cuenta(sesion, "rev", (("revisor", None),))
    u = entrar(cliente, "rev").json()["usuario"]
    (asignacion,) = u["asignaciones"]
    assert (asignacion["rol"], asignacion["unidad"]) == ("revisor", None)
    assert {"reporte.validar", "reporte.remitir", "reporte.rectificar"} <= set(asignacion["permisos"])
    assert u["roles_de_interfaz"] == ["estadistica"]


def prueba_epidemiologia_recibe_un_solo_token_con_sus_dos_asignaciones(cliente, sesion):
    crear_cuenta(sesion, "epi", (("digitador", "EPI"), ("consulta", "EPI")))
    u = entrar(cliente, "epi").json()["usuario"]
    assert [(a["rol"], a["unidad"]) for a in u["asignaciones"]] == [("consulta", "epidemiologia"), ("digitador", "epidemiologia")]
    assert u["roles_de_interfaz"] == ["oficina", "area"] or set(u["roles_de_interfaz"]) == {"area", "oficina"}
    consulta, digitador = u["asignaciones"]
    assert "reporte.enviar" not in consulta["permisos"] and "reporte.enviar" in digitador["permisos"]


def prueba_planeamiento_es_una_consulta_atada_a_su_unidad(cliente, sesion):
    crear_cuenta(sesion, "pla", (("consulta", "PLA"),))
    u = entrar(cliente, "pla").json()["usuario"]
    assert u["asignaciones"] == [{"rol": "consulta", "unidad": "planeamiento", "permisos": ["reporte.descargar", "reporte.ver"]}]
    assert u["roles_de_interfaz"] == ["oficina"]


def prueba_si_se_elimina_la_unidad_la_asignacion_se_pierde_y_no_pasa_a_ser_global(cliente, sesion):
    """Peligro real: la vista da la unidad como id. Si al traducirla a clave la
    unidad ya no existe y se dejara el campo vacío, un digitador de una unidad
    eliminada pasaría a valer en TODAS."""
    crear_cuenta(sesion)
    sesion.execute(text("UPDATE organizacion.unidad_organica SET fecha_eliminacion = now() WHERE codigo = 'NUT'"))
    r = entrar(cliente)
    assert r.status_code == 403 and "ningún permiso" in r.json()["detail"]


def prueba_una_unidad_inactiva_tampoco_da_permisos(cliente, sesion):
    crear_cuenta(sesion)
    sesion.execute(text("UPDATE organizacion.unidad_organica SET es_activo = false WHERE codigo = 'NUT'"))
    assert entrar(cliente).status_code == 403


def prueba_una_asignacion_eliminada_deja_de_dar_permisos(cliente, sesion):
    u = crear_cuenta(sesion, asignaciones=(("digitador", "NUT"), ("consulta", "PLA")))
    sesion.execute(text("UPDATE seguridad.usuario_rol SET fecha_eliminacion = now() WHERE usuario_id = :u AND unidad_organica_id = (SELECT id FROM organizacion.unidad_organica WHERE codigo = 'PLA')"), {"u": u.id})
    assert [a["unidad"] for a in entrar(cliente).json()["usuario"]["asignaciones"]] == ["nutricion"]


# ------------------------------------------------- a nombre de quién queda escrito


def prueba_iniciar_sesion_anota_el_ultimo_acceso_y_lo_deja_en_la_bitacora_a_nombre_de_quien_entro(sesion, reloj, ajustes):
    _con_dependencias(app, sesion, reloj, ajustes)
    try:
        u = crear_cuenta(sesion)
        assert u.fecha_ultimo_acceso is None
        assert TestClient(app, client=("10.1.2.3", 50000)).post("/api/auth/login", json={"usuario": "ana", "clave": CLAVE}).status_code == 200
    finally:
        app.dependency_overrides.clear()
    sesion.refresh(u)
    assert u.fecha_ultimo_acceso is not None
    assert tuple(bitacora(sesion, "usuario", u.id, "ACTUALIZAR")) == (u.id, "10.1.2.3")


def prueba_una_ip_que_no_es_ip_no_rompe_la_escritura_y_queda_sin_dato(cliente, sesion):
    """El cliente de pruebas se identifica como `testclient`. La función de la BD
    hace `::INET`: sin validar, ese valor haría fallar el inicio de sesión."""
    u = crear_cuenta(sesion)
    assert entrar(cliente).status_code == 200
    assert tuple(bitacora(sesion, "usuario", u.id, "ACTUALIZAR")) == (u.id, None)


def prueba_la_bitacora_del_acceso_no_guarda_la_contrasena(cliente, sesion):
    u = crear_cuenta(sesion)
    entrar(cliente)
    guardado = sesion.execute(text("SELECT COALESCE(datos_anteriores::text,'') || COALESCE(datos_nuevos::text,'') FROM auditoria.registro_cambio WHERE tabla = 'usuario' AND registro_id = :i"), {"i": u.id}).scalars().all()
    assert guardado and not any("contrasena_hash" in g or "argon2" in g for g in guardado)


# ----------------------------------------------------------------- /auth/yo


def prueba_yo_devuelve_lo_que_dice_el_token_sin_tocar_la_base(cliente, sesion):
    crear_cuenta(sesion)
    r = cliente.get("/api/auth/yo", headers=cabecera(entrar(cliente).json()["token"]))
    assert r.status_code == 200
    cuerpo = r.json()
    assert (cuerpo["usuario"], cuerpo["roles_de_interfaz"], cuerpo["debe_cambiar_clave"]) == ("ana", ["area"], False)
    assert cuerpo["asignaciones"][0]["unidad"] == "nutricion"


def prueba_sin_token_es_401_con_el_encabezado_que_exige_el_estandar(cliente):
    r = cliente.get("/api/auth/yo")
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("encabezado", ["Bearer", "Bearer ", "Token abc", "abc", "Bearer a.b.c"])
def prueba_un_encabezado_mal_formado_es_401_y_nunca_500(cliente, encabezado):
    assert cliente.get("/api/auth/yo", headers={"Authorization": encabezado}).status_code == 401


def prueba_a_las_ocho_horas_la_sesion_vence_y_pide_iniciar_de_nuevo(cliente, sesion, reloj):
    crear_cuenta(sesion)
    encabezado = cabecera(entrar(cliente).json()["token"])
    reloj.fijar(AHORA + timedelta(hours=7, minutes=59))
    assert cliente.get("/api/auth/yo", headers=encabezado).status_code == 200
    reloj.fijar(AHORA + timedelta(hours=8))
    r = cliente.get("/api/auth/yo", headers=encabezado)
    assert r.status_code == 401 and "venció" in r.json()["detail"]


def prueba_un_token_alterado_o_de_otro_secreto_es_401(cliente, sesion):
    crear_cuenta(sesion)
    token = entrar(cliente).json()["token"]
    alterado = token[:-3] + ("AAA" if not token.endswith("AAA") else "BBB")
    de_otro = jwt.encode(
        {"sub": "1", "usr": "x", "nom": "x", "asignaciones": [], "cc": False, "iat": 1, "exp": 4102444800}, "otro-secreto-de-mas-de-treinta-y-dos", algorithm="HS256"
    )
    for malo in (alterado, de_otro):
        r = cliente.get("/api/auth/yo", headers=cabecera(malo))
        assert r.status_code == 401 and "no es válida" in r.json()["detail"]


def prueba_desactivar_una_cuenta_no_invalida_su_token_hasta_que_venza(cliente, sesion):
    """Contrapartida aceptada del diseño (los permisos viajan en el token y no se
    consultan a la base): un cambio de permisos o una desactivación tarda hasta
    8 h en aplicar. Esta prueba lo deja escrito para que nadie lo descubra por
    sorpresa; si se añade una lista de revocación, debe cambiar."""
    u = crear_cuenta(sesion)
    encabezado = cabecera(entrar(cliente).json()["token"])
    u.es_activo = False
    sesion.flush()
    assert entrar(cliente).status_code == 403  # no puede iniciar una sesión nueva…
    assert cliente.get("/api/auth/yo", headers=encabezado).status_code == 200  # …pero la vigente sigue


# ---------------------------------------------------- cambio obligatorio de contraseña


@pytest.fixture
def app_protegida(sesion, reloj, ajustes):
    """Una aplicación mínima con rutas protegidas, para lo que no toca /auth."""
    pequena = FastAPI()

    @pequena.get("/solo-estadistica")
    def solo_estadistica(s: Sesion = Depends(exigir_permiso(permisos.REPORTE_VALIDAR))):
        return {"usuario": s.usuario}

    @pequena.get("/enviar/{unidad}")
    def enviar(unidad: str, s: Sesion = Depends(exigir_permiso(permisos.REPORTE_ENVIAR))):
        # La puerta deja pasar a quien envía en ALGUNA unidad; la unidad concreta se comprueba aquí.
        if not s.puede(permisos.REPORTE_ENVIAR, unidad):
            from fastapi import HTTPException

            raise HTTPException(403, "No es de su unidad.")
        return {"unidad": unidad}

    @pequena.post("/anotar")
    def anotar(cargo: str, bd: Session = Depends(bd_auditada), s: Sesion = Depends(exigir_permiso(permisos.REPORTE_ENVIAR))):
        bd.get(Usuario, s.usuario_id).cargo = cargo
        bd.commit()
        return {"ok": True}

    _con_dependencias(pequena, sesion, reloj, ajustes)
    return pequena


def prueba_una_cuenta_con_contrasena_provisional_puede_ver_quien_es_y_cambiarla_pero_nada_mas(cliente, sesion, app_protegida):
    crear_cuenta(sesion, debe_cambiar=True)
    r = entrar(cliente)
    assert r.status_code == 200 and r.json()["debe_cambiar_clave"] is True
    token = r.json()["token"]
    assert cliente.get("/api/auth/yo", headers=cabecera(token)).json()["debe_cambiar_clave"] is True
    bloqueada = TestClient(app_protegida).get("/enviar/nutricion", headers=cabecera(token))
    assert bloqueada.status_code == 403 and "cambiar su contraseña" in bloqueada.json()["detail"]


def prueba_cambiar_la_clave_da_un_token_nuevo_sin_la_marca_y_la_clave_vieja_deja_de_servir(cliente, sesion, app_protegida):
    u = crear_cuenta(sesion, debe_cambiar=True)
    token = entrar(cliente).json()["token"]
    r = cliente.post("/api/auth/cambiar-clave", json={"clave_actual": CLAVE, "clave_nueva": "una-clave-nueva-y-larga"}, headers=cabecera(token))
    assert r.status_code == 200 and r.json()["debe_cambiar_clave"] is False
    nuevo = r.json()["token"]
    assert TestClient(app_protegida).get("/enviar/nutricion", headers=cabecera(nuevo)).status_code == 200

    sesion.refresh(u)
    assert u.debe_cambiar_contrasena is False and u.contrasena_hash != HASH and u.contrasena_hash.startswith("$argon2id$")
    assert entrar(cliente, clave=CLAVE).status_code == 401
    assert entrar(cliente, clave="una-clave-nueva-y-larga").status_code == 200


def prueba_una_cuenta_normal_tambien_puede_cambiar_su_clave_por_su_cuenta(cliente, sesion):
    crear_cuenta(sesion)
    token = entrar(cliente).json()["token"]
    r = cliente.post("/api/auth/cambiar-clave", json={"clave_actual": CLAVE, "clave_nueva": "otra-clave-bien-larga"}, headers=cabecera(token))
    assert r.status_code == 200


def prueba_cambiar_la_clave_exige_conocer_la_actual(cliente, sesion):
    u = crear_cuenta(sesion, debe_cambiar=True)
    token = entrar(cliente).json()["token"]
    r = cliente.post("/api/auth/cambiar-clave", json={"clave_actual": "no-es-esa", "clave_nueva": "una-clave-nueva-y-larga"}, headers=cabecera(token))
    assert r.status_code == 403 and "actual no es correcta" in r.json()["detail"]
    sesion.refresh(u)
    assert u.contrasena_hash == HASH and u.debe_cambiar_contrasena is True  # nada cambió


@pytest.mark.parametrize(
    "nueva, esperado",
    [("corta", "al menos 10"), ("mi-ana-clave-larga", "nombre de usuario"), (CLAVE, "distinta"), (" con-espacios-al-borde ", "espacios")],
)
def prueba_una_clave_nueva_que_no_cumple_la_politica_se_rechaza_con_todos_sus_problemas(cliente, sesion, nueva, esperado):
    crear_cuenta(sesion)
    token = entrar(cliente).json()["token"]
    r = cliente.post("/api/auth/cambiar-clave", json={"clave_actual": CLAVE, "clave_nueva": nueva}, headers=cabecera(token))
    assert r.status_code == 422 and any(esperado in p for p in r.json()["detail"])


def prueba_cambiar_la_clave_sin_sesion_es_401(cliente):
    assert cliente.post("/api/auth/cambiar-clave", json={"clave_actual": "x", "clave_nueva": "y" * 12}).status_code == 401


def prueba_el_token_nuevo_trae_los_permisos_que_la_bd_dice_ahora(cliente, sesion):
    """Cambiar la clave refresca los permisos: es una de las pocas ocasiones en
    que el token se rehace sin volver a iniciar sesión."""
    u = crear_cuenta(sesion)
    token = entrar(cliente).json()["token"]
    sesion.add(UsuarioRol(usuario_id=u.id, rol_id=sesion.scalar(select(Rol.id).where(Rol.codigo == "consulta")), unidad_organica_id=sesion.scalar(select(UnidadOrganica.id).where(UnidadOrganica.codigo == "PLA"))))
    sesion.flush()
    r = cliente.post("/api/auth/cambiar-clave", json={"clave_actual": CLAVE, "clave_nueva": "otra-clave-bien-larga"}, headers=cabecera(token))
    assert [a["unidad"] for a in r.json()["usuario"]["asignaciones"]] == ["nutricion", "planeamiento"]


def prueba_el_cambio_de_clave_queda_en_la_bitacora_a_nombre_de_quien_lo_hizo_y_sin_el_hash(cliente, sesion):
    u = crear_cuenta(sesion, debe_cambiar=True)
    token = entrar(cliente).json()["token"]
    olvidar_quien_actua(sesion)  # que el endpoint tenga que decirlo él, no heredarlo del login
    cliente.post("/api/auth/cambiar-clave", json={"clave_actual": CLAVE, "clave_nueva": "una-clave-nueva-y-larga"}, headers=cabecera(token))
    quien, _ = bitacora(sesion, "usuario", u.id, "ACTUALIZAR")
    assert quien == u.id
    cambios = sesion.execute(text("SELECT campos_modificados FROM auditoria.registro_cambio WHERE tabla = 'usuario' AND registro_id = :i AND operacion = 'ACTUALIZAR' ORDER BY id DESC LIMIT 1"), {"i": u.id}).scalar()
    assert "debe_cambiar_contrasena" in cambios
    guardado = sesion.execute(text("SELECT datos_anteriores::text || datos_nuevos::text FROM auditoria.registro_cambio WHERE tabla = 'usuario' AND registro_id = :i AND operacion = 'ACTUALIZAR'"), {"i": u.id}).scalars().all()
    assert not any("contrasena_hash" in g or "argon2" in g for g in guardado)


# ------------------------------------------------------------- exigir_permiso


def _token(app_, *asignaciones: Asignacion, debe_cambiar=False) -> dict:
    token, _ = seguridad.crear_token(
        usuario_id=1, usuario="x", nombre="X", asignaciones=asignaciones, debe_cambiar_clave=debe_cambiar, ahora=AHORA, horas=8, secreto=SECRETO
    )
    return cabecera(token)


DIGITADOR_NUT = Asignacion(roles.DIGITADOR, "nutricion", frozenset({permisos.REPORTE_ENVIAR}))
REVISOR = Asignacion(roles.REVISOR, None, frozenset({permisos.REPORTE_VALIDAR}))


def prueba_un_digitador_no_entra_a_lo_de_estadistica_y_estadistica_si(app_protegida):
    c = TestClient(app_protegida)
    assert c.get("/solo-estadistica", headers=_token(app_protegida, DIGITADOR_NUT)).status_code == 403
    assert c.get("/solo-estadistica", headers=_token(app_protegida, REVISOR)).status_code == 200


def prueba_tener_el_permiso_en_una_unidad_no_da_acceso_a_otra(app_protegida):
    """La puerta (`exigir_permiso`) no basta: un digitador de Nutrición pasa la
    puerta de «enviar» y aun así no puede enviar el reporte de Imágenes."""
    c, h = TestClient(app_protegida), _token(app_protegida, DIGITADOR_NUT)
    assert c.get("/enviar/nutricion", headers=h).status_code == 200
    assert c.get("/enviar/imagenes", headers=h).status_code == 403


def prueba_una_asignacion_global_pasa_por_cualquier_unidad(app_protegida):
    revisor_que_envia = Asignacion(roles.REVISOR, None, frozenset({permisos.REPORTE_ENVIAR}))
    assert TestClient(app_protegida).get("/enviar/imagenes", headers=_token(app_protegida, revisor_que_envia)).status_code == 200


def prueba_una_cuenta_con_dos_asignaciones_pasa_si_alguna_tiene_el_permiso(app_protegida):
    epi = (Asignacion(roles.CONSULTA, "epidemiologia", frozenset({permisos.REPORTE_VER})), Asignacion(roles.DIGITADOR, "epidemiologia", frozenset({permisos.REPORTE_ENVIAR})))
    c = TestClient(app_protegida)
    assert c.get("/enviar/epidemiologia", headers=_token(app_protegida, *epi)).status_code == 200
    assert c.get("/enviar/nutricion", headers=_token(app_protegida, *epi)).status_code == 403


def prueba_sin_sesion_es_401_y_con_contrasena_provisional_es_403(app_protegida):
    c = TestClient(app_protegida)
    assert c.get("/solo-estadistica").status_code == 401
    assert c.get("/solo-estadistica", headers=_token(app_protegida, REVISOR, debe_cambiar=True)).status_code == 403


# -------------------------------------------------------------------- auditoría


def prueba_bd_auditada_deja_escrito_quien_hizo_cada_cambio(sesion, app_protegida):
    """Toda ruta que escribe usa `bd_auditada`: la bitácora inmutable de la BD
    registra el usuario que el backend le dice."""
    u = crear_cuenta(sesion, "editor", (("digitador", "NUT"),))
    token, _ = seguridad.crear_token(
        usuario_id=u.id, usuario="editor", nombre="X", asignaciones=(DIGITADOR_NUT,), debe_cambiar_clave=False, ahora=AHORA, horas=8, secreto=SECRETO
    )
    r = TestClient(app_protegida, client=("192.168.1.9", 5000)).post("/anotar", params={"cargo": "Jefatura de Nutrición"}, headers=cabecera(token))
    assert r.status_code == 200
    assert tuple(bitacora(sesion, "usuario", u.id, "ACTUALIZAR")) == (u.id, "192.168.1.9")


# ------------------------------------------------------------------- superficie


def prueba_toda_ruta_de_la_api_salvo_salud_y_login_pide_sesion():
    """Guardián para lo que venga: al añadir un endpoint sin protección, esta
    prueba falla. Lista las rutas públicas a propósito."""
    # /configuracion: la pantalla de ingreso la necesita antes de que haya sesión
    # (nombre del sistema, mensaje, aviso). Solo lee lo que esa pantalla muestra.
    publicas = {("/api/salud", "get"), ("/api/auth/login", "post"), ("/api/configuracion", "get")}
    for ruta, metodos in app.openapi()["paths"].items():
        for metodo, operacion in metodos.items():
            if (ruta, metodo) in publicas:
                continue
            assert operacion.get("security"), f"{metodo.upper()} {ruta} no exige sesión"
