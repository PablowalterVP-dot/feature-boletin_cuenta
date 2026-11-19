"""El tablero de indicadores de desempeño por HTTP, contra la base real y con
datos inventados.

El reloj está el 08/10/2026. La base de pruebas trae lo publicado por MINSA de la
Ficha 14 en 2026 (enero a julio con corte al 08/08), así que enero a julio salen
«oficiales». El escenario, todo en 2026:

    11111111  diagnóstico 10/02, tratamiento a tiempo el 01/03      febrero: a tiempo
    22222222  diagnóstico 05/08, sin tratamiento                     agosto: plazo vencido
    44444444  diagnóstico 03/09, sin tratamiento (vence el 10/10)    setiembre: plazo vigente, urgente
    55555555  diagnóstico 05/09, tratamiento sin el «R» en su cita   setiembre: por corregir
    33333333  diagnóstico 20/09, sin tratamiento (vence el 27/10)    setiembre: plazo vigente

La trama trae además una fila por mes para que enero a setiembre estén cargados.
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

import escenario as e
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import Ajustes
from app.datos.modelos import SeguimientoCaso
from app.datos.sesion import obtener_sesion_bd
from app.dominio.desempeno import calendario
from app.dominio.reloj import ZONA, RelojFijo
from app import seguridad
from app.main import app
from app.servicios import subida
from app.servicios.fuentes import cargar_sinadef
from prueba_api_consultas import SECRETO
from prueba_calcular_desempeno import persona
from prueba_cargar_sinadef import certificado, reporte
from prueba_servicio_desempeno import atencion, trama

pytestmark = pytest.mark.bd

HOY = datetime(2026, 10, 8, 10, 0, tzinfo=ZONA)
TRAMA = "CONSOLIDADO_NominalTrama30092026_212639.csv"
NOMBRE = {"nombres_paciente": "Persona", "apellido_paterno_paciente": "De Prueba", "historia_clinica": "HC-1"}


def relleno(meses=range(1, 10)) -> list[dict]:
    return [atencion(f"9{m:02d}", f"2026-{m:02d}-01", "Z000", "D", numero_documento_paciente="99999999") for m in meses]


def setiembre() -> list[dict]:
    sin_repetido = [atencion("551", "2026-09-15", "C539", "D", numero_documento_paciente="55555555"), atencion("551", "2026-09-15", "96402", "D", "1", numero_documento_paciente="55555555")]
    return [
        *persona("44444444", 400, "2026-09-03", **NOMBRE),
        *persona("55555555", 500, "2026-09-05", **NOMBRE),
        *sin_repetido,
        *persona("33333333", 300, "2026-09-20", **NOMBRE),
    ]


ESCENARIO = [*relleno(), *persona("11111111", 100, "2026-02-10", tratamiento="2026-03-01"), *persona("22222222", 200, "2026-08-05"), *setiembre()]


@pytest.fixture
def cliente(sesion):
    reloj = RelojFijo(HOY)
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: reloj
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(database_url="postgresql://x/y", jwt_secreto=SECRETO, _env_file=None)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def raiz(sesion):
    return e.persona(sesion, "raiz.desempeno", ("superadmin", None))


@pytest.fixture
def rev(sesion):
    return e.revisor_de_estadistica(sesion)


def cabecera(actor) -> dict:
    """Un token emitido el día del escenario: los de las otras pruebas vencen en setiembre."""
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=False, ahora=HOY, horas=8, secreto=SECRETO,
    )
    return {"Authorization": f"Bearer {token}"}


def pedir(cliente, sesion, actor, metodo, ruta, **kwargs):
    sesion.commit()
    return cliente.request(metodo, ruta, headers=cabecera(actor) if actor else {}, **kwargs)


def subir(cliente, sesion, actor, ruta, *, revision=False, forzar=False):
    with open(ruta, "rb") as archivo:
        datos = {} if revision else {"forzar": str(forzar).lower()}
        return pedir(cliente, sesion, actor, "POST", "/api/desempeno/cargas" + ("/revision" if revision else ""), files={"archivo": (ruta.name, archivo, "text/csv")}, data=datos)


@pytest.fixture
def cargado(cliente, sesion, raiz, tmp_path, monkeypatch):
    """SINADEF de enero a setiembre por el servicio (generado el 30/09); la trama
    del HIS por HTTP, como se subirá desde el tablero."""
    for mes in range(1, 10):
        sinadef_del_mes(sesion, tmp_path, monkeypatch, mes)
    r = subir(cliente, sesion, raiz, trama(tmp_path, TRAMA, ESCENARIO))
    assert r.status_code == 200, r.text
    return r.json()


def sinadef_del_mes(sesion, tmp_path, monkeypatch, mes: int):
    ultimo = calendario.fin_de_mes(2026, mes).day
    cargar_sinadef(sesion, reporte(tmp_path, monkeypatch, f"sinadef-{mes:02d}-2026.xls", [certificado(1, documento="88888888")], desde=f"01/{mes:02d}/2026", hasta=f"{ultimo}/{mes:02d}/2026"))


def ficha_14(resumen: dict) -> dict:
    return next(x for x in resumen["fichas"] if x["ficha"]["numero"] == 14)


# ------------------------------------------------------------------- permisos


def prueba_estadistica_ve_el_tablero_y_no_la_carga(cliente, sesion, rev):
    for ruta in ("/api/desempeno/resumen", "/api/desempeno/fichas/14", "/api/desempeno/fichas/14/casos"):
        assert pedir(cliente, sesion, rev, "GET", ruta).status_code == 200, ruta
    for ruta in ("/api/desempeno/fuentes", "/api/desempeno/cargas", "/api/desempeno/referencias"):
        assert pedir(cliente, sesion, rev, "GET", ruta).status_code == 403, ruta
    assert pedir(cliente, sesion, rev, "PUT", "/api/desempeno/fichas/14/casos/1", json={"estado": "Sin revisar"}).status_code == 403
    assert pedir(cliente, sesion, rev, "GET", "/api/desempeno/resumen").json()["puede_cargar"] is False


def prueba_sin_el_permiso_no_se_entra(cliente, sesion):
    consulta = e.consulta_de_planeamiento(sesion)
    digitador = e.persona(sesion, "dig.nut", ("digitador", "nutricion"))
    for actor in (consulta, digitador):
        assert pedir(cliente, sesion, actor, "GET", "/api/desempeno/resumen").status_code == 403
    assert pedir(cliente, sesion, None, "GET", "/api/desempeno/resumen").status_code == 401


# ---------------------------------------------------------------------- carga


def prueba_subir_la_trama_carga_sus_meses_y_recalcula_solo(cargado):
    revision = cargado["revision"]
    assert revision["fuente"] == "his_minsa" and revision["cargado"] is True
    assert [m["periodo"] for m in revision["meses"]] == [f"2026-{m:02d}" for m in range(1, 10)]
    assert {m["estado"] for m in revision["meses"]} == {"nuevo"}
    assert 14 in revision["fichas"]
    (recalculo,) = cargado["recalculos"]
    assert (recalculo["numero"], recalculo["anio"], recalculo["estado"], recalculo["numerador"], recalculo["denominador"]) == (14, 2026, "calculado", 1, 5)


def prueba_la_revision_dice_que_pasaria_sin_guardar_nada(cliente, sesion, raiz, tmp_path):
    ruta = trama(tmp_path, TRAMA, ESCENARIO)
    r = subir(cliente, sesion, raiz, ruta, revision=True)
    assert r.status_code == 200, r.text
    assert r.json()["puede_cargar"] is True and len(r.json()["meses"]) == 9
    assert pedir(cliente, sesion, raiz, "GET", "/api/desempeno/cargas").json() == []


def prueba_subir_otra_vez_lo_mismo_no_tiene_nada_nuevo(cliente, sesion, raiz, cargado, tmp_path):
    r = subir(cliente, sesion, raiz, tmp_path / TRAMA, revision=True)
    assert r.json()["nada_nuevo"] is True and r.json()["puede_cargar"] is False


def prueba_una_trama_mas_antigua_pide_confirmacion_y_sin_ella_no_se_carga(cliente, sesion, raiz, cargado, tmp_path):
    vieja = trama(tmp_path, "CONSOLIDADO_NominalTrama20092026_100000.csv", setiembre())
    r = subir(cliente, sesion, raiz, vieja, revision=True)
    assert r.json()["requiere_forzar"] is True and r.json()["errores"] == []
    assert any("antes que el ya cargado" in a for a in r.json()["avisos"])
    assert not any("--forzar" in a for a in r.json()["avisos"]), "la pantalla no habla de opciones de la terminal"
    rechazo = subir(cliente, sesion, raiz, vieja)
    assert rechazo.status_code == 422 and rechazo.json()["codigo"] == "carga_rechazada"
    assert subir(cliente, sesion, raiz, vieja, forzar=True).status_code == 200


def prueba_un_archivo_que_no_es_de_ninguna_fuente_se_rechaza_entero(cliente, sesion, raiz, tmp_path):
    otro = tmp_path / "otra_cosa.csv"
    otro.write_text("a,b\n1,2\n", encoding="utf-8")
    r = subir(cliente, sesion, raiz, otro, revision=True)
    assert r.status_code == 422 and "No se reconoce el archivo" in r.json()["detail"]
    xlsx = tmp_path / "egresos.xlsx"
    xlsx.write_bytes(b"x")
    assert "todavía no se cargan" in subir(cliente, sesion, raiz, xlsx, revision=True).json()["detail"]


def prueba_un_archivo_demasiado_grande_no_se_recibe(cliente, sesion, raiz, tmp_path, monkeypatch):
    monkeypatch.setattr(subida, "TAMANO_MAXIMO", 100)
    r = subir(cliente, sesion, raiz, trama(tmp_path, TRAMA, ESCENARIO), revision=True)
    assert r.status_code == 422 and "pesa más de" in r.json()["detail"]


# -------------------------------------------------------------------- resumen


def prueba_recien_instalado_y_sin_datos_el_tablero_ya_funciona(cliente, sesion, raiz, rev):
    """Primero se levanta el módulo y después se suben los datos: con las tablas
    creadas y nada cargado, todas las pantallas responden, sin resultados y sin ceros."""
    r = pedir(cliente, sesion, rev, "GET", "/api/desempeno/resumen")
    assert r.status_code == 200, r.text
    r = r.json()
    assert len(r["fichas"]) == 34 and all(x["resultado"] is None for x in r["fichas"])
    assert r["datos_al"] is None and r["anio"] == HOY.year
    d = pedir(cliente, sesion, rev, "GET", "/api/desempeno/fichas/14").json()
    assert d["resultado"] is None and d["ficha"]["tiene_calculo"] is True and d["ficha_tecnica"] is not None
    c = pedir(cliente, sesion, rev, "GET", "/api/desempeno/fichas/14/casos?mes=9").json()
    assert c["casos"] == [] and c["corrida_id"] is None
    # Lo del superadministrador también: la pantalla desde la que se sube el primer archivo.
    f = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fuentes")
    assert f.status_code == 200 and not any(m["carga"] for x in f.json()["fuentes"] for m in x["meses"])
    # Vacía, la lista «qué subir» no dice «nada»: pide cada mes ya terminado (el reloj está en octubre).
    assert [(x["mes"], x["cargado"], x["disponible"]) for x in f.json()["por_subir"]] == [(m, False, True) for m in range(1, 10)]
    assert pedir(cliente, sesion, raiz, "GET", "/api/desempeno/cargas").json() == []
    assert pedir(cliente, sesion, raiz, "GET", "/api/desempeno/referencias").status_code == 200


def prueba_el_resumen_trae_las_34_fichas_y_el_resultado_consolidado(cliente, sesion, raiz, cargado):
    r = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/resumen").json()
    assert (r["anio"], r["anios"], r["datos_al"], r["puede_cargar"]) == (2026, [2026], "2026-09-30", True)
    assert len(r["fichas"]) == 34 and [x["ficha"]["numero"] for x in r["fichas"] if x["resultado"]] == [14]
    assert r["ventana"] == {"anio": 2026, "mes": 9, "apertura": "2026-10-12", "cierre": "2026-10-21", "abierta": False, "faltan": []}
    resultado = ficha_14(r)["resultado"]
    # Enero a julio, oficiales; agosto, consolidado; setiembre, preliminar.
    assert resultado["consolidado_hasta"] == 8
    assert resultado["logro"] == {"numerador": 1, "denominador": 2, "porcentaje": 0.5}
    assert resultado["preliminar"]["numerador"] == 1 and resultado["preliminar"]["denominador"] == 5
    assert resultado["meta"] == 0.7 and resultado["cumple_meta"] is False
    assert round(resultado["cumplimiento"], 4) == round(0.5 / 0.7, 4) and round(resultado["diferencia"], 2) == -0.2
    assert resultado["por_gestionar"]["total"] == 3 and resultado["por_gestionar"]["vencen_pronto"] == 1
    assert resultado["proximo_cierre"] == "2026-10-21"
    assert len(resultado["serie"]) == 8
    assert r["textos"]["por_corregir"]["sin_diagnostico_repetido"].startswith("El tratamiento se registró")


def prueba_cada_ficha_dice_que_fuente_le_falta(cliente, sesion, raiz):
    r = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/resumen").json()
    por_numero = {x["ficha"]["numero"]: x["ficha"] for x in r["fichas"]}
    assert por_numero[14]["datos"] == "completo" and por_numero[14]["faltan"] == []
    assert por_numero[16]["datos"] == "parcial" and por_numero[16]["faltan"] == ["Población de referencia RENIEC"]
    assert por_numero[34]["datos"] == "no_aplica" and por_numero[34]["aplica"] is False
    assert {d["codigo"] for d in r["dimensiones"]} == {"es", "mi", "gh", "cs", "si"}


def prueba_sin_calculo_el_resumen_no_inventa_cifras(cliente, sesion, raiz):
    r = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/resumen").json()
    assert all(x["resultado"] is None for x in r["fichas"])
    assert r["datos_al"] is None


# -------------------------------------------------------------------- detalle


def prueba_el_detalle_dice_que_es_cada_caso_de_cada_mes(cliente, sesion, raiz, cargado):
    d = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14").json()
    assert d["ficha_tecnica"]["numerador"].startswith("Pacientes que inician tratamiento")
    meses = {m["mes"]: m for m in d["resultado"]["meses"]}
    assert (meses[2]["estado"], meses[2]["a_tiempo"], meses[2]["minsa"]["coincide"]) == ("oficial", 1, False)
    assert (meses[8]["estado"], meses[8]["sin_tratamiento"]) == ("consolidado", 1)
    assert (meses[9]["estado"], meses[9]["plazo_vigente"], meses[9]["por_corregir"], meses[9]["por_gestionar"]) == ("preliminar", 2, 1, 3)
    assert meses[9]["minsa"] is None and meses[9]["porcentaje"] == 0.0
    assert meses[4]["porcentaje"] is None, "un mes sin casos no es 0 %"
    assert meses[9]["cierre_his"] == "2026-10-21"
    # Los nombres de los motivos viajan con la ficha: la pantalla no los escribe.
    assert set(d["textos"]) == {"exclusion", "por_corregir", "categoria"} and d["textos"]["categoria"]["CUELLO_UTERINO"]
    # Por tipo: el año y cada mes; la suma de los meses es el año.
    for t in d["resultado"]["por_categoria"]:
        assert sum(m["denominador"] for m in t["meses"]) == t["denominador"] and sum(m["numerador"] for m in t["meses"]) == t["numerador"]
    assert (d["anio"], d["hoy"]) == (2026, HOY.date().isoformat()) and any(x["codigo"] == d["ficha"]["dimension"] for x in d["dimensiones"])


def prueba_una_ficha_sin_calculo_tiene_detalle_sin_resultado(cliente, sesion, raiz):
    d = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/1").json()
    assert d["resultado"] is None and d["ficha_tecnica"] is None and d["ficha"]["tiene_calculo"] is False
    assert pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/99").status_code == 404


# ---------------------------------------------------------------------- casos


def prueba_los_casos_por_gestionar_vienen_con_el_paciente_y_lo_mas_urgente_primero(cliente, sesion, rev, cargado):
    c = pedir(cliente, sesion, rev, "GET", "/api/desempeno/fichas/14/casos").json()
    assert c["puede_editar"] is False and c["por_gestionar"]["sin_revisar"] == 3
    primero, segundo, tercero = c["casos"]
    assert (primero["numero_documento"], primero["clase"], primero["dias_restantes"], primero["vence"]) == ("44444444", "plazo_vigente", 2, "2026-10-10")
    assert primero["paciente"] == {"apellido_paterno": "De Prueba", "apellido_materno": None, "nombres": "Persona", "historia_clinica": "HC-1"}
    assert segundo["numero_documento"] == "33333333"
    assert (tercero["clase"], tercero["motivo"], tercero["fecha_atencion"], tercero["cierre_his"]) == ("por_corregir", "sin_diagnostico_repetido", "2026-09-15", "2026-10-21")
    assert tercero["opciones"][0] == "Sin revisar" and "Corregido en el HIS" in tercero["opciones"]
    assert c["textos"]["por_corregir"][tercero["motivo"]].startswith("El tratamiento se registró")


def prueba_con_mes_vienen_todos_los_pacientes_del_mes_con_su_situacion(cliente, sesion, rev, cargado):
    d = pedir(cliente, sesion, rev, "GET", "/api/desempeno/fichas/14").json()
    for m in d["resultado"]["meses"]:
        c = pedir(cliente, sesion, rev, "GET", f"/api/desempeno/fichas/14/casos?mes={m['mes']}").json()
        clases = [x["clase"] for x in c["casos"]]
        assert len(clases) == m["denominador"], m["mes"]
        assert (clases.count("a_tiempo"), clases.count("sin_tratamiento"), clases.count("plazo_vigente"), clases.count("por_corregir")) == (m["a_tiempo"], m["sin_tratamiento"], m["plazo_vigente"], m["por_corregir"])
        # El seguimiento solo para lo que todavía puede sumar, y lo que se puede gestionar va primero.
        assert all(bool(x["opciones"]) == (x["clase"] in ("plazo_vigente", "por_corregir")) for x in c["casos"])
        assert clases == sorted(clases, key=["plazo_vigente", "por_corregir", "esperando_datos", "sin_tratamiento", "a_tiempo"].index)
    assert pedir(cliente, sesion, rev, "GET", "/api/desempeno/fichas/14/casos?mes=13").status_code == 422


def prueba_el_seguimiento_se_anota_y_solo_con_los_estados_del_caso(cliente, sesion, raiz, cargado):
    casos = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14/casos").json()["casos"]
    vigente, por_corregir = casos[0], casos[2]
    r = pedir(cliente, sesion, raiz, "PUT", f"/api/desempeno/fichas/14/casos/{vigente['id']}", json={"estado": "En gestión con el servicio"})
    assert r.status_code == 200, r.text
    assert r.json()["seguimiento"]["estado"] == "En gestión con el servicio" and r.json()["seguimiento"]["por"] == "raiz.desempeno"
    malo = pedir(cliente, sesion, raiz, "PUT", f"/api/desempeno/fichas/14/casos/{por_corregir['id']}", json={"estado": "En gestión con el servicio"})
    assert malo.status_code == 422
    assert pedir(cliente, sesion, raiz, "PUT", "/api/desempeno/fichas/14/casos/999999", json={"estado": "Sin revisar"}).status_code == 404
    resumen = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14/casos").json()["por_gestionar"]
    assert (resumen["en_curso"], resumen["sin_revisar"]) == (1, 2)
    # Otra vez el mismo caso: se actualiza, no se duplica.
    pedir(cliente, sesion, raiz, "PUT", f"/api/desempeno/fichas/14/casos/{vigente['id']}", json={"estado": "Sin revisar"})
    assert sesion.scalar(select(func.count()).select_from(SeguimientoCaso)) == 1


def prueba_la_siguiente_carga_confirma_los_casos_marcados_como_tratados(cliente, sesion, raiz, cargado, tmp_path):
    caso = next(c for c in pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14/casos").json()["casos"] if c["numero_documento"] == "33333333")
    pedir(cliente, sesion, raiz, "PUT", f"/api/desempeno/fichas/14/casos/{caso['id']}", json={"estado": "Tratado, falta registrar en el HIS"})
    tratado = persona("33333333", 300, "2026-09-20", tratamiento="2026-09-28", **NOMBRE)
    nueva = [*relleno([9]), *[x for x in setiembre() if x["numero_documento_paciente"] != "33333333"], *tratado]
    r = subir(cliente, sesion, raiz, trama(tmp_path, "CONSOLIDADO_NominalTrama07102026_090000.csv", nueva))
    assert r.status_code == 200, r.text
    assert r.json()["casos_confirmados"] == 1
    assert r.json()["recalculos"][0]["numerador"] == 2
    resultado = ficha_14(pedir(cliente, sesion, raiz, "GET", "/api/desempeno/resumen").json())["resultado"]
    assert resultado["por_gestionar"]["total"] == 2


# ----------------------------------------------------------- fuentes e historial


def prueba_las_fuentes_dicen_que_mes_tiene_cada_una_y_si_ya_se_puede_cargar(cliente, sesion, raiz, cargado):
    f = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fuentes").json()
    por_codigo = {x["codigo"]: x for x in f["fuentes"]}
    his = por_codigo["his_minsa"]
    assert [m["estado"] for m in his["meses"]] == ["cierre"] * 8 + ["preliminar"] + ["futuro"] * 3
    assert his["meses"][8]["carga"]["archivo"] == TRAMA and his["meses"][8]["versiones"] == 1
    assert [m["estado"] for m in por_codigo["sinadef_hrl"]["meses"]][6:9] == ["cierre", "cierre", "preliminar"]
    assert por_codigo["egresos_hospitalarios"]["cargable"] is False and por_codigo["sinadef_verificado"]["verificadas"] == 0
    historial = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/cargas").json()
    assert len(historial) == 18 and all(h["vigente"] for h in historial)


def prueba_se_cambia_a_que_fichas_alimenta_una_fuente(cliente, sesion, raiz):
    r = pedir(cliente, sesion, raiz, "PUT", "/api/desempeno/fuentes/egresos_hospitalarios", json={"fichas": [18], "area_responsable": "Oficina de Estadística"})
    assert r.status_code == 200, r.text
    assert (r.json()["fichas"], r.json()["area_responsable"]) == ([18], "Oficina de Estadística")
    ficha_24 = next(x["ficha"] for x in pedir(cliente, sesion, raiz, "GET", "/api/desempeno/resumen").json()["fichas"] if x["ficha"]["numero"] == 24)
    assert "Egresos hospitalarios" not in ficha_24["faltan"]
    assert pedir(cliente, sesion, raiz, "PUT", "/api/desempeno/fuentes/egresos_hospitalarios", json={"fichas": [99]}).status_code == 422
    assert pedir(cliente, sesion, raiz, "PUT", "/api/desempeno/fuentes/no_existe", json={"fichas": [1]}).status_code == 404


# ------------------------------------------------------------ carga por tramas

FEBRERO = datetime(2027, 2, 1, 10, 0, tzinfo=ZONA)  # todo 2026 ya venció: lo que falte es por datos, no por plazo


def enero(tmp_path, nombre="trama_de_enero.csv"):
    """La trama de enero sola, con un nombre que no dice cuándo se descargó. La
    10101010 se diagnostica el 25/01 (vence el 03/03) y no tiene tratamiento."""
    filas = [*relleno([1]), *persona("10101010", 700, "2026-01-25", **NOMBRE), *persona("20202020", 800, "2026-01-05", tratamiento="2026-01-20", **NOMBRE)]
    filas[0] = {**filas[0], "fecha_modificacion": "2026-03-05 08:00:00"}
    return trama(tmp_path, nombre, filas)


def febrero(tmp_path, nombre, *, hasta: int = 28, con_tratamiento=False):
    filas = [*relleno([2])]
    if con_tratamiento:
        filas += persona("10101010", 700, "2026-01-25", tratamiento="2026-02-10", **NOMBRE)[2:]
    return trama(tmp_path, nombre, [{**f, "fecha_registro": f"2026-02-{min(hasta, int(f['fecha_atencion'][8:10])):02d} 09:00:00"} for f in filas])


@pytest.fixture
def en_febrero_de_2027(cliente):
    app.dependency_overrides[obtener_reloj] = lambda: RelojFijo(FEBRERO)


def cabecera_de(actor, ahora) -> dict:
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=False, ahora=ahora, horas=8, secreto=SECRETO,
    )
    return {"Authorization": f"Bearer {token}"}


def prueba_con_solo_la_trama_de_enero_nadie_figura_con_el_plazo_vencido_si_faltan_datos(cliente, sesion, raiz, tmp_path, monkeypatch, en_febrero_de_2027):
    def ver(ruta):
        sesion.commit()
        return cliente.get(ruta, headers=cabecera_de(raiz, FEBRERO)).json()

    def subir_(ruta):
        sesion.commit()
        with open(ruta, "rb") as archivo:
            r = cliente.post("/api/desempeno/cargas", headers=cabecera_de(raiz, FEBRERO), files={"archivo": (ruta.name, archivo, "text/csv")}, data={"forzar": "false"})
        assert r.status_code == 200, r.text
        return r.json()

    sinadef_del_mes(sesion, tmp_path, monkeypatch, 1)
    subir_(enero(tmp_path))

    # El nombre no trae la fecha: se toma la del último registro del archivo.
    his = next(x for x in ver("/api/desempeno/fuentes")["fuentes"] if x["codigo"] == "his_minsa")
    assert his["meses"][0]["carga"]["fecha_extraccion"].startswith("2026-03-05") and his["meses"][0]["estado"] == "cierre"

    d = ver("/api/desempeno/fichas/14")["resultado"]
    mes = d["meses"][0]
    assert (mes["numerador"], mes["denominador"]) == (1, 2)
    # Su plazo venció hace meses, pero lo cargado llega al 31/01: no se sabe si se trató.
    assert (mes["a_tiempo"], mes["esperando_datos"], mes["sin_tratamiento"], mes["plazo_vigente"]) == (1, 1, 0, 0)
    assert (mes["estado"], mes["falta_hasta"], d["datos_hasta"]) == ("por_cerrar", "2026-03-03", "2026-01-31")
    # Enero tiene corte de MINSA, pero sin los datos no es oficial ni entra al logro.
    assert d["consolidado_hasta"] == 0 and d["logro"] is None
    clases = {c["numero_documento"]: c for c in ver("/api/desempeno/fichas/14/casos?mes=1")["casos"]}
    assert clases["10101010"]["clase"] == "esperando_datos" and clases["10101010"]["opciones"] == []

    # Qué subir: todo mes terminado sin cargar, de las dos fuentes, en orden. Marzo cierra enero.
    por_subir = ver("/api/desempeno/fuentes")["por_subir"]
    assert [x["mes"] for x in por_subir] == list(range(2, 13))
    assert all((x["cargado"], x["disponible"], sorted(f["codigo"] for f in x["fuentes"])) == (False, True, ["his_minsa", "sinadef_hrl"]) for x in por_subir)
    marzo = por_subir[1]["pasos"]
    assert len(marzo) == 1 and marzo[0]["cierra"] == [1] and marzo[0]["disponible"] is True

    # Febrero descargado el 15/02 no llega al final del mes: sigue esperando.
    sinadef_del_mes(sesion, tmp_path, monkeypatch, 2)
    subir_(febrero(tmp_path, "CONSOLIDADO_NominalTrama15022026_100000.csv", hasta=14))
    d = ver("/api/desempeno/fichas/14")["resultado"]
    assert d["datos_hasta"] == "2026-02-14" and d["meses"][0]["esperando_datos"] == 1

    # La trama final de febrero trae su tratamiento del 10/02: pasa a tiempo, sin duplicarse.
    r = subir_(febrero(tmp_path, "CONSOLIDADO_NominalTrama22032026_100000.csv", con_tratamiento=True))
    assert [m["estado"] for m in r["revision"]["meses"]] == ["reemplaza"]
    d = ver("/api/desempeno/fichas/14")["resultado"]
    mes = d["meses"][0]
    assert (mes["numerador"], mes["denominador"], mes["a_tiempo"], mes["esperando_datos"]) == (2, 2, 2, 0)
    # Aun así enero no se cierra: hasta el 03/03 puede aparecer una defunción que lo cambie.
    assert (mes["estado"], mes["falta_hasta"]) == ("por_cerrar", "2026-03-03")


# ------------------------------------------- retirar una carga · verificadas


def prueba_retirar_un_mes_borra_sus_filas_recalcula_y_al_volver_a_subirlo_da_lo_mismo(cliente, sesion, raiz, rev, cargado, tmp_path):
    antes = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14").json()["resultado"]
    assert len(antes["meses"]) == 9
    assert pedir(cliente, sesion, rev, "DELETE", "/api/desempeno/fuentes/his_minsa/meses/5").status_code == 403
    r = pedir(cliente, sesion, raiz, "DELETE", "/api/desempeno/fuentes/his_minsa/meses/5")
    assert r.status_code == 200, r.text
    assert r.json()["recalculos"][0]["estado"] == "calculado"
    # Sin mayo, el año calcula hasta abril: un mes sin cargar no es un mes sin casos.
    sin_mayo = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14").json()["resultado"]
    assert [m["mes"] for m in sin_mayo["meses"]] == [1, 2, 3, 4]
    fuentes = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fuentes").json()
    his = next(x for x in fuentes["fuentes"] if x["codigo"] == "his_minsa")
    assert his["meses"][4]["estado"] == "falta" and his["meses"][4]["carga"] is None and his["meses"][5]["carga"] is not None
    assert fuentes["por_subir"][0]["mes"] == 5 and fuentes["por_subir"][0]["disponible"] is True
    retirada = next(h for h in pedir(cliente, sesion, raiz, "GET", "/api/desempeno/cargas").json() if h["fuente"] == "his_minsa" and h["mes"] == 5)
    assert retirada["vigente"] is False and retirada["retirada_el"] is not None
    # Retirar dos veces, o lo que no es una carga mensual, se dice.
    assert pedir(cliente, sesion, raiz, "DELETE", "/api/desempeno/fuentes/his_minsa/meses/5").status_code == 404
    assert pedir(cliente, sesion, raiz, "DELETE", "/api/desempeno/fuentes/sinadef_verificado/meses/5").status_code == 422
    # El mismo archivo otra vez: mayo vuelve y el resultado es el de antes.
    r = subir(cliente, sesion, raiz, tmp_path / TRAMA)
    assert r.status_code == 200, r.text
    assert [(m["periodo"], m["estado"]) for m in r.json()["revision"]["meses"] if m["estado"] != "ya_cargado"] == [("2026-05", "nuevo")]
    despues = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14").json()["resultado"]
    assert [(m["mes"], m["numerador"], m["denominador"], m["estado"]) for m in despues["meses"]] == [(m["mes"], m["numerador"], m["denominador"], m["estado"]) for m in antes["meses"]]


def prueba_sin_enero_no_queda_un_resultado_que_ya_no_describe_lo_cargado(cliente, sesion, raiz, cargado):
    assert pedir(cliente, sesion, raiz, "DELETE", "/api/desempeno/fuentes/his_minsa/meses/1").status_code == 200
    assert pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14").json()["resultado"] is None


def prueba_una_defuncion_verificada_se_agrega_se_corrige_y_se_retira_recalculando(cliente, sesion, raiz, rev, cargado):
    assert pedir(cliente, sesion, rev, "GET", "/api/desempeno/verificadas").status_code == 403
    assert pedir(cliente, sesion, raiz, "GET", "/api/desempeno/verificadas").json() == []
    denominador = lambda: pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fichas/14").json()["resultado"]["meses"][7]["denominador"]  # noqa: E731
    assert denominador() == 1
    # La 22222222 (diagnóstico 05/08) falleció el 20/08: sale del denominador de agosto.
    r = pedir(cliente, sesion, raiz, "POST", "/api/desempeno/verificadas", json={"numero_documento": "22222222", "fecha_defuncion": "2026-08-20", "origen": "SINADEF nacional"})
    assert r.status_code == 200, r.text
    v = r.json()["verificada"]
    assert (v["numero_documento"], v["fecha_verificacion"], r.json()["recalculos"][0]["estado"]) == ("22222222", HOY.date().isoformat(), "calculado")
    assert denominador() == 0
    # La misma persona dos veces, un documento mal escrito o una fecha futura no entran.
    for cuerpo, motivo in (({"numero_documento": "22222222", "fecha_defuncion": "2026-08-21"}, "Ya hay una"), ({"numero_documento": "2222222A", "fecha_defuncion": "2026-08-21"}, "8 dígitos"), ({"numero_documento": "33333333", "fecha_defuncion": "2026-12-01"}, "futura")):
        malo = pedir(cliente, sesion, raiz, "POST", "/api/desempeno/verificadas", json=cuerpo)
        assert malo.status_code == 422 and motivo in malo.json()["detail"], cuerpo
    # Corregida a una fecha fuera del plazo (37 días desde el 05/08), vuelve a contar.
    r = pedir(cliente, sesion, raiz, "PUT", f"/api/desempeno/verificadas/{v['id']}", json={"numero_documento": "22222222", "fecha_defuncion": "2026-09-30"})
    assert r.status_code == 200 and denominador() == 1
    pedir(cliente, sesion, raiz, "PUT", f"/api/desempeno/verificadas/{v['id']}", json={"numero_documento": "22222222", "fecha_defuncion": "2026-08-20"})
    assert denominador() == 0
    # Retirada, la paciente vuelve al denominador; y ya no se puede retirar otra vez.
    assert pedir(cliente, sesion, raiz, "DELETE", f"/api/desempeno/verificadas/{v['id']}").status_code == 200
    assert denominador() == 1 and pedir(cliente, sesion, raiz, "GET", "/api/desempeno/verificadas").json() == []
    assert pedir(cliente, sesion, raiz, "DELETE", f"/api/desempeno/verificadas/{v['id']}").status_code == 404


def prueba_el_resumen_dice_cuantos_archivos_ya_se_pueden_subir(cliente, sesion, raiz, cargado):
    r = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/resumen").json()
    disponibles = sum(x["disponible"] for x in pedir(cliente, sesion, raiz, "GET", "/api/desempeno/fuentes").json()["por_subir"])
    assert r["por_subir_ahora"] == disponibles and disponibles >= 1


# ----------------------------------------------------------- referencia MINSA


def prueba_lo_registrado_de_minsa_se_compara_y_su_corte_se_usa_al_calcular(cliente, sesion, raiz, cargado):
    refs = pedir(cliente, sesion, raiz, "GET", "/api/desempeno/referencias").json()
    assert [r["mes"] for r in refs] == list(range(1, 9)) and refs[1]["calculado"] == {"numerador": 1, "denominador": 1, "porcentaje": 1.0}
    r = pedir(cliente, sesion, raiz, "PUT", "/api/desempeno/referencias", json={"numero": 14, "anio": 2026, "mes": 9, "numerador": 0, "denominador": 3, "fecha_corte": "2026-10-08", "documento": "reporte de setiembre"})
    assert r.status_code == 200, r.text
    assert r.json()["referencia"]["coincide"] is True and r.json()["recalculo"]["estado"] == "calculado"
    # Con un corte que cubre setiembre nada suma ya ahí. Pero setiembre no es oficial
    # todavía: lo cargado llega al 29/09 y el corte es del 08/10. Falta la trama de octubre.
    resultado = ficha_14(pedir(cliente, sesion, raiz, "GET", "/api/desempeno/resumen").json())["resultado"]
    assert (resultado["mes_con_corte"], resultado["consolidado_hasta"], resultado["por_gestionar"]["total"]) == (9, 8, 0)
    setiembre_ = resultado["meses"][8]
    assert (setiembre_["estado"], setiembre_["falta_hasta"], resultado["datos_hasta"]) == ("por_cerrar", "2026-10-08", "2026-09-29")


def prueba_lo_registrado_de_minsa_tiene_que_tener_sentido(cliente, sesion, raiz):
    base = {"numero": 14, "anio": 2026, "mes": 9, "numerador": 1, "denominador": 3}
    for cambio, motivo in (({"numerador": 4}, "entre 0 y el denominador"), ({"mes": 10}, "ya terminó"), ({"fecha_corte": "2026-09-15"}, "después del fin del mes"), ({"numero": 34}, "no se evalúa")):
        r = pedir(cliente, sesion, raiz, "PUT", "/api/desempeno/referencias", json={**base, **cambio})
        assert r.status_code == 422 and motivo in r.json()["detail"], cambio
