"""Los endpoints de reportes por HTTP, contra la base de Alejandro.

`TestClient` sobre la aplicación real con tokens de verdad. Cada prueba corre en una
transacción que se deshace; como el endpoint confirma (un `commit()`) o revierte
(`rollback()`), antes de cada petición se hace `commit()` de lo preparado: así un
`rollback()` del endpoint solo deshace lo de la petición, no el escenario.
"""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text

import escenario as e
from app import seguridad
from app.api import errores
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos import reportes as repo
from app.datos.modelos import Reporte
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import RelojFijo
from app.main import app
from app.servicios import transiciones as servicio

pytestmark = pytest.mark.bd

SECRETO = "secreto-de-pruebas-de-al-menos-32-caracteres"
AVISO = ("aviso", "atipico|f3|liquida.cena|21", "100 raciones: el resto del mes ronda las 10", None)


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


def cabecera(actor, *, debe_cambiar=False) -> dict:
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=debe_cambiar, ahora=e.AHORA, horas=8, secreto=SECRETO,
    )
    return {"Authorization": f"Bearer {token}"}


def post(cliente, sesion, actor, accion, *, periodo="2026-08", formato="NUT", json=None, **extra):
    sesion.commit()  # el escenario preparado se queda aunque el endpoint haga rollback
    return cliente.post(f"/api/reportes/{formato}/{periodo}/transiciones/{accion}", json=json, headers=cabecera(actor), **extra)


def ver(cliente, sesion, actor, periodo="2026-08", formato="NUT"):
    sesion.commit()
    return cliente.get(f"/api/reportes/{formato}/{periodo}", headers=cabecera(actor))


def estado(sesion) -> str:
    r = e.reporte_de(sesion)
    return {v: k for k, v in e.ids_de(sesion).items()}[r.estado_reporte_id] if r else "no_iniciado"


def hasta_enviable(cliente, sesion, dig, hallazgos=()):
    assert post(cliente, sesion, dig, "crear").status_code == 200
    e.dar_carga_aceptada(sesion, e.reporte_de(sesion), hallazgos)


# --------------------------------------------------------------- el flujo completo


def prueba_el_flujo_completo_por_http_con_lo_que_devuelve_cada_paso(cliente, sesion, dig, rev):
    r = post(cliente, sesion, dig, "crear")
    assert r.status_code == 200
    assert r.json() == {
        "formato": "NUT", "periodo": "2026-08", "accion": "crear", "estado_origen": "no_iniciado", "estado_destino": "borrador",
        "numero_rectificacion": 0, "constancia": None, "nota": "Abre el reporte del periodo.", "remisiones": [],
    }
    e.dar_carga_aceptada(sesion, e.reporte_de(sesion))

    # 12/10/2026: enviar entrega directo a la matriz, validado por el bot.
    enviado = post(cliente, sesion, dig, "enviar").json()
    assert (enviado["estado_destino"], enviado["constancia"], enviado["remisiones"]) == ("remitido", "CR-2026-08-NUT", [{"destino": "planeamiento", "es_sin_validar": False}])
    for retirada in ("revisar", "validar", "remitir"):
        assert post(cliente, sesion, rev, retirada).status_code == 404, retirada

    rectificado = post(cliente, sesion, rev, "rectificar", json={"comentario": "Llegó una corrección."}).json()
    assert (rectificado["estado_destino"], rectificado["numero_rectificacion"]) == ("borrador", 1)
    assert post(cliente, sesion, dig, "enviar").json()["constancia"] == "CR-2026-08-NUT-2"  # el caso del bug


def prueba_el_detalle_refleja_lo_que_paso(cliente, sesion, dig, rev):
    hasta_enviable(cliente, sesion, dig)
    post(cliente, sesion, dig, "enviar")
    d = ver(cliente, sesion, rev).json()
    assert (d["estado"], d["folio_constancia"], d["unidad"], d["tiene_carga_aceptada"]) == ("remitido", "CR-2026-08-NUT", "nutricion", True)
    assert [h["accion"] for h in d["historial"]] == ["crear", "enviar"] and d["historial"][1]["estado_origen"] == "borrador"
    assert d["acciones_disponibles"] == ["rectificar"]
    assert d["remisiones"][0]["destino"] == "planeamiento" and d["remisiones"][0]["es_sin_validar"] is False
    assert d["fecha_envio"].startswith("2026-09-13T12:00:00") and d["fecha_validacion"] == d["fecha_envio"]
    assert d["hallazgos"] == {"errores": 0, "avisos": 0, "avisos_sin_justificar": 0, "info": 0}


def prueba_sin_reporte_el_detalle_es_200_no_iniciado(cliente, sesion, dig):
    r = ver(cliente, sesion, dig)
    assert r.status_code == 200
    assert (r.json()["estado"], r.json()["acciones_disponibles"], r.json()["historial"]) == ("no_iniciado", ["crear"], [])


# ------------------------------------------------------------ 401, 403, 404, 409, 422


def prueba_sin_sesion_es_401_y_con_contrasena_provisional_es_403(cliente, sesion, dig):
    assert cliente.get("/api/reportes/NUT/2026-08").status_code == 401
    assert cliente.post("/api/reportes/NUT/2026-08/transiciones/crear").status_code == 401
    provisional = cliente.post("/api/reportes/NUT/2026-08/transiciones/crear", headers=cabecera(dig, debe_cambiar=True))
    assert provisional.status_code == 403 and "cambiar su contraseña" in provisional.json()["detail"]


def prueba_sin_el_permiso_sobre_la_unidad_es_403_con_su_codigo(cliente, sesion, rev):
    r = post(cliente, sesion, rev, "crear")  # el revisor no carga reportes
    assert r.status_code == 403
    assert r.json()["codigo"] == "sin_permiso" and r.json()["datos"] == {"permiso": "reporte.cargar", "unidad": "nutricion"}
    de_imagenes = e.sesion_de(e.crear_usuario(sesion, "dig.dxi"), e.asignacion(sesion, "digitador", "imagenes"))
    assert post(cliente, sesion, de_imagenes, "crear").status_code == 403
    assert e.reporte_de(sesion) is None


def prueba_un_formato_una_accion_o_un_periodo_que_no_existen_son_404(cliente, sesion, dig):
    assert post(cliente, sesion, dig, "crear", formato="XXX").json()["datos"] == {"que": "formato"}
    assert post(cliente, sesion, dig, "crear", periodo="2025-12").json()["datos"] == {"que": "periodo"}
    r = post(cliente, sesion, dig, "devolver")
    assert r.status_code == 404 and r.json()["codigo"] == "accion_desconocida"


@pytest.mark.parametrize("periodo", ["2026-8", "agosto", "2026-13", "2026-00", "2026-08-01"])
def prueba_un_periodo_mal_formado_es_422_antes_de_llegar_al_servicio(cliente, sesion, dig, periodo):
    assert post(cliente, sesion, dig, "crear", periodo=periodo).status_code == 422
    assert ver(cliente, sesion, dig, periodo=periodo).status_code == 422


def prueba_una_accion_desde_un_estado_incorrecto_es_409_y_dice_desde_cuales_si(cliente, sesion, dig, rev):
    r = post(cliente, sesion, rev, "rectificar")
    assert r.status_code == 409 and r.json()["codigo"] == "estado_no_permite"
    assert r.json()["datos"]["estado"] == "no_iniciado" and r.json()["datos"]["desde"] == ["remitido"]


def prueba_crear_dos_veces_es_409(cliente, sesion, dig):
    post(cliente, sesion, dig, "crear")
    r = post(cliente, sesion, dig, "crear")
    assert r.status_code == 409 and r.json()["codigo"] == "reporte_ya_existe"


def prueba_crear_un_periodo_futuro_es_422(cliente, sesion, dig):
    r = post(cliente, sesion, dig, "crear", periodo="2026-09")
    assert r.status_code == 422 and r.json()["codigo"] == "periodo_futuro" and r.json()["datos"]["vigente"] == "2026-08"


def prueba_sin_excel_aceptado_no_se_envia_es_409_y_no_queda_nada_a_medias(cliente, sesion, dig):
    post(cliente, sesion, dig, "crear")
    r = post(cliente, sesion, dig, "enviar")
    assert r.status_code == 409 and r.json()["codigo"] == "sin_carga_aceptada"
    reporte = e.reporte_de(sesion)
    assert estado(sesion) == "borrador" and reporte.folio_constancia is None
    assert len(repo.historial_de(sesion, reporte.id)) == 1 and repo.remisiones_de(sesion, reporte.id) == []


def prueba_los_hallazgos_que_bloquean_son_422_con_la_lista(cliente, sesion, dig):
    hasta_enviable(cliente, sesion, dig, [AVISO, ("error", "incompleto|f1", "Faltan 12 casillas", None)])
    r = post(cliente, sesion, dig, "enviar")
    assert r.status_code == 422 and r.json()["codigo"] == "hallazgos_bloquean_el_envio"
    assert r.json()["datos"]["errores"] == [{"clave": "incompleto|f1", "titulo": "Faltan 12 casillas"}]
    assert r.json()["datos"]["avisos_sin_justificar"][0]["clave"] == "atipico|f3|liquida.cena|21"
    assert "1 error por corregir y 1 aviso sin justificar" in r.json()["detail"]
    assert estado(sesion) == "borrador"


def prueba_los_destinos_no_se_eligen_al_enviar(cliente, sesion, dig):
    """Los destinos los pone la matriz (CLAUDE.md § 3.2): pedir otros es un campo que sobra."""
    hasta_enviable(cliente, sesion, dig)
    r = post(cliente, sesion, dig, "enviar", json={"destinos": ["planeamiento", "direccion-general"], "justificacion": "x"})
    assert r.status_code == 422 and estado(sesion) == "borrador"


@pytest.mark.parametrize(
    "cuerpo",
    [{"destino": ["planeamiento"]}, {"comentario": "x" * 2001}, {"destinos": ["planeamiento"]}, {"justificacion": "x"}, {"comentario": 5}],
)
def prueba_un_cuerpo_mal_formado_es_422_y_un_campo_mal_escrito_no_se_ignora(cliente, sesion, dig, cuerpo):
    assert post(cliente, sesion, dig, "crear", json=cuerpo).status_code == 422
    assert e.reporte_de(sesion) is None


def prueba_todas_las_respuestas_de_error_tienen_la_misma_forma(cliente, sesion, dig, rev):
    for r in (
        post(cliente, sesion, rev, "crear"),  # 403
        post(cliente, sesion, dig, "crear", formato="XXX"),  # 404
        post(cliente, sesion, dig, "rectificar"),  # 409
        post(cliente, sesion, dig, "crear", periodo="2026-8"),  # 422 de validación de FastAPI
        post(cliente, sesion, dig, "crear", json={"destino": []}),  # 422 por un campo que sobra
    ):
        assert set(r.json()) == {"detail", "codigo", "datos"} and isinstance(r.json()["detail"], str) and isinstance(r.json()["datos"], dict)


# -------------------------------------------------------------------- la atomicidad


def prueba_si_algo_falla_despues_de_escribir_no_queda_nada_a_medias(cliente, sesion, dig, rev, monkeypatch):
    """Un fallo inesperado tras el `flush()` (aquí, al armar la respuesta) revierte todo:
    el estado, el historial y las remisiones."""
    hasta_enviable(cliente, sesion, dig)

    def falla(*_a, **_k):
        raise RuntimeError("fallo inesperado después de escribir")

    monkeypatch.setattr(servicio, "Resultado", falla)
    r = post(cliente, sesion, dig, "enviar")
    assert r.status_code == 500
    reporte = e.reporte_de(sesion)
    sesion.refresh(reporte)
    assert estado(sesion) == "borrador" and reporte.folio_constancia is None and reporte.fecha_envio is None
    assert len(repo.historial_de(sesion, reporte.id)) == 1 and repo.remisiones_de(sesion, reporte.id) == []


# ------------------------------------------------------------------- la auditoría


def _olvidar_quien_actua(sesion):
    sesion.execute(text("SELECT set_config('app.usuario_id', '', true), set_config('app.direccion_ip', '', true)"))


def prueba_todo_lo_que_escribe_una_transicion_queda_en_la_bitacora_a_nombre_de_quien_actua(sesion, dig, rev):
    reloj = RelojFijo(e.AHORA)
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: reloj
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(database_url="postgresql://x/y", jwt_secreto=SECRETO, _env_file=None)
    try:
        c = TestClient(app, client=("10.9.8.7", 5000), raise_server_exceptions=False)
        post(c, sesion, dig, "crear")
        e.dar_carga_aceptada(sesion, e.reporte_de(sesion))
        sesion.commit()
        inicio = sesion.scalar(text("SELECT coalesce(max(id), 0) FROM auditoria.registro_cambio"))
        _olvidar_quien_actua(sesion)  # que el endpoint lo diga él, no lo herede de una petición anterior
        assert post(c, sesion, dig, "enviar").status_code == 200
    finally:
        app.dependency_overrides.clear()
    filas = sesion.execute(
        text("SELECT tabla, operacion, usuario_id, host(direccion_ip) FROM auditoria.registro_cambio WHERE id > :i AND tabla IN ('reporte', 'reporte_historial_estado', 'remision') ORDER BY id"),
        {"i": inicio},
    ).all()
    assert {(t, o) for t, o, *_ in filas} == {("reporte", "ACTUALIZAR"), ("reporte_historial_estado", "INSERTAR"), ("remision", "INSERTAR")}
    assert all(u == dig.usuario_id and ip == "10.9.8.7" for _, _, u, ip in filas), filas


# ------------------------------------------- errores de la base traducidos a 409


@pytest.fixture
def app_con_errores_de_la_base(sesion):
    """Una aplicación mínima con las mismas reglas de traducción y rutas que provocan
    lo que la base rechaza (una regla de disparador, una restricción y un error cualquiera)."""
    pequena = FastAPI()
    errores.registrar(pequena)

    @pequena.get("/disparador")
    def disparador(bd=Depends(obtener_sesion_bd)):
        with bd.begin_nested():
            bd.execute(text("DO $$ BEGIN RAISE EXCEPTION 'El reporte 5 está en estado «enviado»: sus casillas ya no se editan'; END $$"))

    @pequena.get("/duplicado")
    def duplicado(bd=Depends(obtener_sesion_bd)):
        with bd.begin_nested():
            for _ in range(2):
                bd.execute(text("INSERT INTO organizacion.parametro (clave, valor) VALUES ('clave.repetida', 'x')"))

    @pequena.get("/otro-error")
    def otro_error(bd=Depends(obtener_sesion_bd)):
        with bd.begin_nested():
            bd.execute(text("SELECT 1/0"))

    pequena.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    return TestClient(pequena, raise_server_exceptions=False)


def prueba_un_error_de_un_disparador_de_la_base_se_traduce_a_409_con_su_mensaje(app_con_errores_de_la_base):
    r = app_con_errores_de_la_base.get("/disparador")
    assert r.status_code == 409 and r.json()["codigo"] == "regla_de_la_base"
    assert r.json()["detail"] == "El reporte 5 está en estado «enviado»: sus casillas ya no se editan"


def prueba_una_violacion_de_integridad_es_409_con_el_nombre_de_la_restriccion(app_con_errores_de_la_base):
    r = app_con_errores_de_la_base.get("/duplicado")
    assert r.status_code == 409 and r.json()["codigo"] == "conflicto_con_la_base"
    assert r.json()["datos"] == {"restriccion": "uq_parametro_clave"} and "restricción" in r.json()["detail"]


def prueba_cualquier_otro_error_de_la_base_sigue_siendo_500_y_no_filtra_el_mensaje(app_con_errores_de_la_base):
    r = app_con_errores_de_la_base.get("/otro-error")
    assert r.status_code == 500 and "division" not in r.text.lower() and "1/0" not in r.text


def prueba_un_conflicto_real_de_constancia_repetida_llega_como_409(cliente, sesion, dig, rev):
    """La constancia es única en toda la tabla: si ya existe (aquí, en otro periodo), la
    base rechaza el UPDATE y el endpoint lo traduce en lugar de responder 500."""
    hasta_enviable(cliente, sesion, dig)
    post(cliente, sesion, dig, "enviar")  # CR-2026-08-NUT en el reporte de agosto
    # Otro reporte que ya tiene la constancia que le tocaría a julio:
    sesion.commit()
    post(cliente, sesion, dig, "crear", periodo="2026-07")
    julio = e.reporte_de(sesion, 7)
    e.dar_carga_aceptada(sesion, julio)
    agosto = e.reporte_de(sesion, 8)
    agosto.folio_constancia = "CR-2026-07-NUT"  # ocupa la constancia de julio
    sesion.flush()
    r = post(cliente, sesion, dig, "enviar", periodo="2026-07")
    assert r.status_code == 409 and r.json()["codigo"] == "conflicto_con_la_base" and r.json()["datos"]["restriccion"] == "uq_reporte_folio"
    assert e.reporte_de(sesion, 7).folio_constancia is None  # nada a medias


# ------------------------------------------------------------- lo que la BD sí hace


def prueba_los_reportes_de_otra_unidad_no_se_ven_ni_se_tocan(cliente, sesion, dig, rev):
    hasta_enviable(cliente, sesion, dig)
    consulta = e.consulta_de_planeamiento(sesion)
    assert ver(cliente, sesion, consulta).status_code == 403  # lee lo que le remiten, no el borrador
    de_imagenes = e.sesion_de(e.crear_usuario(sesion, "dig.dxi"), e.asignacion(sesion, "digitador", "imagenes"))
    assert ver(cliente, sesion, de_imagenes).status_code == 403
    assert post(cliente, sesion, de_imagenes, "enviar").status_code == 403
    assert estado(sesion) == "borrador"


def prueba_el_superadmin_puede_ver_pero_esa_cuenta_no_es_del_flujo(cliente, sesion):
    """El superadmin tiene todos los permisos: en la base ve y opera todo. (Que la
    cuenta esté pensada para administrar y no para reportar es una política, no una regla
    del backend.)"""
    admin = e.sesion_de(e.crear_usuario(sesion, "root"), e.asignacion(sesion, "superadmin", None))
    assert ver(cliente, sesion, admin).status_code == 200


def prueba_un_reporte_creado_en_agosto_no_afecta_a_otros_periodos(cliente, sesion, dig):
    post(cliente, sesion, dig, "crear")
    assert ver(cliente, sesion, dig, periodo="2026-07").json()["estado"] == "no_iniciado"
    assert sesion.scalar(select(Reporte.id).where(Reporte.id == e.reporte_de(sesion).id)) is not None


def prueba_un_dato_invalido_dice_donde_y_cual_campo(cliente, sesion, dig):
    r = post(cliente, sesion, dig, "crear", periodo="2026-8")
    assert r.status_code == 422 and r.json()["codigo"] == "datos_invalidos"
    (problema,) = r.json()["datos"]["errores"]
    assert (problema["donde"], problema["campo"]) == ("path", "periodo")
    sobrante = post(cliente, sesion, dig, "crear", json={"destino": ["x"]}).json()["datos"]["errores"][0]
    assert (sobrante["donde"], sobrante["campo"]) == ("body", "destino")
