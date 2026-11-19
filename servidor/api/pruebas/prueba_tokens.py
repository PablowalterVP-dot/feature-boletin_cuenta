"""Tokens JWT: creación, lectura, vigencia y manipulación. Sin base de datos.

El reloj es el inyectable (`RelojFijo`): así se prueba la expiración de 8 horas
sin esperar 8 horas.
"""

import base64
import json
from datetime import datetime, timedelta

import jwt
import pytest

from app import seguridad
from app.dominio import permisos, roles
from app.dominio.reloj import ZONA, RelojFijo
from app.dominio.sesion import Asignacion
from app.seguridad import TokenInvalido, crear_token, leer_token

SECRETO = "un-secreto-de-al-menos-treinta-y-dos-caracteres"
AHORA = datetime(2026, 9, 13, 12, 0, tzinfo=ZONA)

DIGITADOR_NUT = Asignacion(roles.DIGITADOR, "nutricion", frozenset({permisos.REPORTE_VER, permisos.REPORTE_CARGAR, permisos.REPORTE_ENVIAR}))
REVISOR = Asignacion(roles.REVISOR, None, frozenset({permisos.REPORTE_VER, permisos.REPORTE_VALIDAR, permisos.REPORTE_REMITIR}))


def emitir(asignaciones=(DIGITADOR_NUT,), **extra) -> str:
    datos = dict(usuario_id=7, usuario="nutricion", nombre="Diana Saavedra Cruz", debe_cambiar_clave=False, ahora=AHORA, horas=8, secreto=SECRETO)
    datos.update(extra)
    return crear_token(asignaciones=asignaciones, **datos)[0]


def reclamos_de(token: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))


def firmar(reclamos: dict, secreto=SECRETO, algoritmo="HS256") -> str:
    base = {"sub": "7", "usr": "x", "nom": "x", "asignaciones": [], "cc": False, "iat": int(AHORA.timestamp()), "exp": int(AHORA.timestamp()) + 3600}
    return jwt.encode({**base, **reclamos}, secreto, algorithm=algoritmo)


# ------------------------------------------------------------ ida y vuelta


def prueba_el_token_lleva_la_sesion_completa():
    token, sesion = crear_token(
        usuario_id=7, usuario="nutricion", nombre="Diana", asignaciones=(DIGITADOR_NUT,), debe_cambiar_clave=False, ahora=AHORA, horas=8, secreto=SECRETO
    )
    leida = leer_token(token, ahora=AHORA, secreto=SECRETO)
    assert leida == sesion
    assert (leida.usuario_id, leida.usuario, leida.nombre, leida.debe_cambiar_clave) == (7, "nutricion", "Diana", False)
    assert leida.asignaciones == (DIGITADOR_NUT,)


def prueba_los_permisos_viajan_en_el_token_y_autorizan_sin_consultar_la_base():
    s = leer_token(emitir(), ahora=AHORA, secreto=SECRETO)
    assert s.puede(permisos.REPORTE_ENVIAR, "nutricion")
    assert not s.puede(permisos.REPORTE_VALIDAR, "nutricion")  # ese permiso es de Estadística


def prueba_el_permiso_de_una_unidad_no_vale_en_otra():
    s = leer_token(emitir(), ahora=AHORA, secreto=SECRETO)
    assert not s.puede(permisos.REPORTE_ENVIAR, "imagenes")
    assert not s.puede(permisos.REPORTE_ENVIAR)  # ni «en todo el sistema»


def prueba_epidemiologia_lleva_dos_asignaciones_en_un_solo_token():
    epi = (
        Asignacion(roles.DIGITADOR, "epidemiologia", frozenset({permisos.REPORTE_ENVIAR})),
        Asignacion(roles.CONSULTA, "epidemiologia", frozenset({permisos.REPORTE_VER})),
    )
    s = leer_token(emitir(epi, usuario="epidemiologia"), ahora=AHORA, secreto=SECRETO)
    assert s.roles == (roles.DIGITADOR, roles.CONSULTA)
    assert s.roles_de_interfaz == (roles.AREA, roles.OFICINA)
    assert s.puede(permisos.REPORTE_ENVIAR, "epidemiologia") and s.puede(permisos.REPORTE_VER, "epidemiologia")


def prueba_el_revisor_global_actua_sobre_cualquier_unidad():
    s = leer_token(emitir((REVISOR,), usuario="estadistica"), ahora=AHORA, secreto=SECRETO)
    assert s.puede(permisos.REPORTE_VALIDAR, "nutricion") and s.puede(permisos.REPORTE_VALIDAR, "imagenes")
    assert s.puede(permisos.REPORTE_VALIDAR)  # y en todo el sistema
    assert s.unidades_con(permisos.REPORTE_VALIDAR) is None  # None = todas


def prueba_la_marca_de_cambio_obligatorio_de_clave_viaja_en_el_token():
    assert leer_token(emitir(debe_cambiar_clave=True), ahora=AHORA, secreto=SECRETO).debe_cambiar_clave is True
    assert leer_token(emitir(), ahora=AHORA, secreto=SECRETO).debe_cambiar_clave is False


def prueba_el_token_no_contiene_ni_la_clave_ni_su_hash_ni_el_secreto():
    token = emitir()
    assert set(reclamos_de(token)) == {"sub", "usr", "nom", "asignaciones", "cc", "aud", "iat", "exp"}
    assert SECRETO not in token


# ---------------------------------------------------------------- vigencia


def prueba_el_token_dura_ocho_horas():
    _, sesion = crear_token(usuario_id=7, usuario="x", nombre="x", asignaciones=(), debe_cambiar_clave=False, ahora=AHORA, horas=8, secreto=SECRETO)
    assert sesion.expira_en - sesion.emitido_en == timedelta(hours=8)
    assert sesion.expira_en == AHORA + timedelta(hours=8)


def prueba_sirve_hasta_el_ultimo_segundo_y_deja_de_servir_al_cumplirse_las_ocho_horas():
    token = emitir()
    leer_token(token, ahora=AHORA + timedelta(hours=8, seconds=-1), secreto=SECRETO)
    with pytest.raises(TokenInvalido) as e:
        leer_token(token, ahora=AHORA + timedelta(hours=8), secreto=SECRETO)
    assert e.value.vencido


def prueba_un_token_vencido_se_distingue_de_uno_falso():
    with pytest.raises(TokenInvalido) as vencido:
        leer_token(emitir(), ahora=AHORA + timedelta(days=1), secreto=SECRETO)
    assert vencido.value.vencido is True
    with pytest.raises(TokenInvalido) as falso:
        leer_token("esto.no.es-un-token", ahora=AHORA, secreto=SECRETO)
    assert falso.value.vencido is False


def prueba_la_vigencia_sigue_al_reloj_inyectado_y_no_al_del_sistema():
    reloj = RelojFijo(datetime(2026, 9, 13, 12, 0))
    token = emitir(ahora=reloj.ahora())
    leer_token(token, ahora=reloj.ahora(), secreto=SECRETO)
    reloj.fijar(datetime(2026, 9, 13, 20, 0, 1))
    with pytest.raises(TokenInvalido):
        leer_token(token, ahora=reloj.ahora(), secreto=SECRETO)


# ------------------------------------------------------------ manipulación


def prueba_un_secreto_distinto_no_puede_leer_el_token():
    with pytest.raises(TokenInvalido):
        leer_token(emitir(), ahora=AHORA, secreto="otro-secreto-igualmente-largo-para-la-prueba")


def prueba_darse_permisos_dentro_del_token_rompe_la_firma():
    cabecera, cuerpo, firma = emitir().split(".")
    reclamos = reclamos_de(emitir())
    reclamos["asignaciones"] = [{"rol": roles.SUPERADMIN, "unidad": None, "permisos": [permisos.REPORTE_VALIDAR]}]  # escalada de privilegios
    falso = base64.urlsafe_b64encode(json.dumps(reclamos).encode()).rstrip(b"=").decode()
    with pytest.raises(TokenInvalido):
        leer_token(f"{cabecera}.{falso}.{firma}", ahora=AHORA, secreto=SECRETO)


def prueba_un_token_sin_firma_alg_none_se_rechaza():
    reclamos = {"sub": "7", "usr": "x", "nom": "x", "asignaciones": [], "cc": False, "iat": int(AHORA.timestamp()), "exp": int(AHORA.timestamp()) + 3600}
    with pytest.raises(TokenInvalido):
        leer_token(jwt.encode(reclamos, None, algorithm="none"), ahora=AHORA, secreto=SECRETO)


def prueba_solo_se_acepta_hs256_aunque_el_secreto_sea_el_correcto():
    with pytest.raises(TokenInvalido):
        leer_token(firmar({}, algoritmo="HS512"), ahora=AHORA, secreto=SECRETO)
    assert seguridad.ALGORITMO == "HS256"


@pytest.mark.parametrize("quitar", ["exp", "iat", "sub"])
def prueba_un_token_sin_vigencia_ni_sujeto_se_rechaza(quitar):
    base = {"sub": "7", "usr": "x", "nom": "x", "asignaciones": [], "cc": False, "iat": int(AHORA.timestamp()), "exp": int(AHORA.timestamp()) + 3600}
    del base[quitar]
    with pytest.raises(TokenInvalido):
        leer_token(jwt.encode(base, SECRETO, algorithm="HS256"), ahora=AHORA, secreto=SECRETO)


@pytest.mark.parametrize(
    "malas",
    [
        [{"rol": "administrador", "unidad": None, "permisos": []}],  # rol que no existe en la base
        [{"rol": roles.DIGITADOR, "unidad": 5, "permisos": []}],  # unidad que no es una clave
        [{"rol": roles.DIGITADOR, "unidad": "nutricion", "permisos": "reporte.enviar"}],  # permisos que no es lista
        [{"rol": roles.DIGITADOR, "unidad": "nutricion", "permisos": [1, 2]}],
        [{"rol": roles.DIGITADOR, "unidad": "nutricion"}],  # sin permisos
        ["digitador"],  # no es un objeto
        "digitador",  # no es lista
        None,
    ],
)
def prueba_un_token_con_asignaciones_mal_formadas_se_rechaza(malas):
    with pytest.raises(TokenInvalido, match="forma"):
        leer_token(firmar({"asignaciones": malas}), ahora=AHORA, secreto=SECRETO)


def prueba_un_token_sin_la_marca_de_cambio_de_clave_o_con_un_valor_raro_se_rechaza():
    for malo in ("no", 1, None):
        with pytest.raises(TokenInvalido, match="forma"):
            leer_token(firmar({"cc": malo}), ahora=AHORA, secreto=SECRETO)


def prueba_un_sujeto_que_no_es_un_numero_se_rechaza():
    with pytest.raises(TokenInvalido, match="forma"):
        leer_token(firmar({"sub": "no-es-numero"}), ahora=AHORA, secreto=SECRETO)


@pytest.mark.parametrize("basura", ["", "abc", "a.b.c", "Bearer x", "\x00", "a" * 10000])
def prueba_basura_en_lugar_de_token_no_lanza_otra_cosa_que_token_invalido(basura):
    with pytest.raises(TokenInvalido):
        leer_token(basura, ahora=AHORA, secreto=SECRETO)


# ------------------------------------------------ destinatarios (hospitalización)


def prueba_el_token_nombra_a_estadistica_y_a_hospitalizacion():
    """Desde el 14/11/2026 el mismo token abre la API de hospitalización (decisión 0011
    de Egresos): la lista de destinatarios lo dice."""
    token, _ = crear_token(
        usuario_id=1, usuario="estadistica", nombre="Estadística", asignaciones=(), debe_cambiar_clave=False, ahora=AHORA, horas=8, secreto=SECRETO
    )
    reclamos = jwt.decode(token, SECRETO, algorithms=["HS256"], audience="egresos-hospitalarios", options={"verify_exp": False})
    assert reclamos["aud"] == ["estadistica", "egresos-hospitalarios"]
    assert leer_token(token, ahora=AHORA, secreto=SECRETO).usuario == "estadistica"


def prueba_un_token_solo_para_hospitalizacion_no_abre_este_sistema():
    for aud in ("egresos-hospitalarios", ["egresos-hospitalarios"]):
        with pytest.raises(TokenInvalido):
            leer_token(firmar({"aud": aud}), ahora=AHORA, secreto=SECRETO)


def prueba_un_token_sin_destinatarios_de_antes_del_cambio_sigue_valiendo():
    """Los emitidos antes del despliegue no traen `aud` y duran hasta 8 horas."""
    assert leer_token(firmar({}), ahora=AHORA, secreto=SECRETO).usuario_id == 7
