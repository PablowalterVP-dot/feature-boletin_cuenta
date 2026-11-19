"""La carga real del Excel: `POST /api/reportes/{formato}/{periodo}/cargas`.

Contra el **bot real**, levantado como subproceso (`@pytest.mark.node`, igual que
`prueba_cargar_catalogo_nutricion.py`), con plantillas reales generadas por el
propio bot (`apoyo_generar_plantilla.mjs`): el Excel oficial. NUT-2 se activa con las herramientas
del paso 1 al principio de cada prueba que lo necesita.
"""

import base64
import json
import os
import shutil
import subprocess
import time
from urllib.parse import quote

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

import escenario as e
from app import seguridad
from app.api.dependencias import obtener_ajustes_api, obtener_reloj
from app.config import RAIZ_BACKEND, Ajustes
from app.datos.modelos import Archivo, Carga, Hallazgo, Reporte, TotalDeclarado, Valor
from app.datos.sesion import obtener_sesion_bd
from app.dominio.reloj import RelojFijo
from app.herramientas import configurar_nutricion_real
from app.herramientas.cargar_catalogo_nutricion import cargar_catalogo
from app.main import app

pytestmark = pytest.mark.bd

SECRETO = "secreto-de-pruebas-de-al-menos-32-caracteres"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
APOYO_PLANTILLA = RAIZ_BACKEND / "pruebas" / "apoyo_generar_plantilla.mjs"


def _node() -> str | None:
    return os.environ.get("NODE") or shutil.which("node")


@pytest.fixture(scope="module")
def bot_real():
    """El servidor real del bot, en un puerto propio, para toda la sesión de
    pruebas de este archivo. Se salta si no hay `node` en el PATH."""
    node = _node()
    if node is None:
        pytest.skip("node no está en el PATH (ni en NODE): no se puede levantar el bot real.")

    servidor = RAIZ_BACKEND.parent / "bot-validador" / "src" / "servidor.js"
    puerto = 8799
    proceso = subprocess.Popen([node, str(servidor)], env={**os.environ, "PUERTO": str(puerto)}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    url = f"http://localhost:{puerto}"
    try:
        for _ in range(50):
            if proceso.poll() is not None:
                pytest.fail(f"El bot no arrancó: {proceso.stderr.read()}")
            try:
                httpx.get(f"{url}/salud", timeout=0.2)
                break
            except httpx.RequestError:
                time.sleep(0.1)
        else:
            pytest.fail("El bot no respondió a tiempo en /salud.")
        yield url
    finally:
        proceso.terminate()
        proceso.wait(timeout=5)


def generar_plantilla(periodo: str = "2026-08", roturas: list[dict] | None = None) -> bytes:
    node = _node()
    argv = [node, str(APOYO_PLANTILLA), periodo]
    if roturas:
        argv.append(json.dumps(roturas))
    r = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", cwd=APOYO_PLANTILLA.parent, timeout=30)
    assert r.returncode == 0, r.stderr
    return base64.b64decode(r.stdout)


@pytest.fixture
def cliente(sesion, bot_real, tmp_path_factory):
    reloj = RelojFijo(e.AHORA)
    ruta_cargas = tmp_path_factory.mktemp("cargas")
    app.dependency_overrides[obtener_sesion_bd] = lambda: sesion
    app.dependency_overrides[obtener_reloj] = lambda: reloj
    app.dependency_overrides[obtener_ajustes_api] = lambda: Ajustes(
        database_url="postgresql://x/y", jwt_secreto=SECRETO, bot_validador_url=bot_real, bot_validador_segundos=5.0, ruta_cargas=str(ruta_cargas), _env_file=None,
    )
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def dig(sesion):
    return e.digitador_de_nutricion(sesion)


def cabecera(actor) -> dict:
    token, _ = seguridad.crear_token(
        usuario_id=actor.usuario_id, usuario=actor.usuario, nombre=actor.nombre, asignaciones=actor.asignaciones,
        debe_cambiar_clave=False, ahora=e.AHORA, horas=8, secreto=SECRETO,
    )
    return {"Authorization": f"Bearer {token}"}


def subir(cliente, sesion, actor=None, *, formato="NUT", periodo="2026-08", contenido=b"PK\x03\x04 no es un excel de verdad", nombre="Nutricion_2026-08.xlsx", con_sesion=True):
    sesion.commit()  # lo preparado se queda aunque el endpoint haga rollback
    return cliente.post(
        f"/api/reportes/{formato}/{periodo}/cargas",
        files={"archivo": (nombre, contenido, XLSX)},
        headers=cabecera(actor) if con_sesion else {},
    )


def activar_nut2(sesion):
    """Como en producción desde el 05/10/2026: el catálogo, NUT-2 (el Excel real
    de Nutrición, más Patrimonio) y activarla, retirando NUT-1."""
    cargar_catalogo(sesion)
    configurar_nutricion_real.configurar(sesion)
    configurar_nutricion_real.activar(sesion)


# ----------------------------------------------------------------- el camino feliz


def prueba_una_plantilla_llena_queda_aceptada_con_sus_valores(cliente, sesion, dig):
    activar_nut2(sesion)
    r = subir(cliente, sesion, dig, contenido=generar_plantilla())
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    informe = cuerpo["informe"]
    assert (cuerpo["resultado"], informe["plantilla"]["version"]) == ("aceptada", "NUT-2")
    assert (len(informe["errores"]), len(informe["avisos"]), len(informe["info"])) == (0, 0, 0)

    reporte = e.reporte_de(sesion, 8, "NUT")
    assert reporte.formato_version_id is not None
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    assert (carga.resultado, carga.casillas_leidas) == ("aceptada", 31 * 38)
    assert sesion.scalar(select(func.count()).select_from(Valor).where(Valor.reporte_id == reporte.id)) == 31 * 38
    assert sesion.scalar(select(func.count()).select_from(Archivo)) == 1


def prueba_la_respuesta_trae_el_informe_completo_del_bot_no_un_resumen(cliente, sesion, dig):
    """El backend es la única fuente de verdad: la interfaz arma su pantalla de
    revisión (Detalle, PorResolver, CabeceraBot) con este informe, sin volver a
    llamarle al bot por su cuenta. Por eso viaja completo, no solo los conteos."""
    activar_nut2(sesion)
    r = subir(cliente, sesion, dig, contenido=generar_plantilla())
    informe = r.json()["informe"]
    assert informe["bot"]["nombre"] and informe["bot"]["version"]
    assert informe["archivo"]["nombre"] == "Nutricion_2026-08.xlsx"
    assert informe["leidas"] == 31 * 38
    assert informe["datos"]["f1"]["asistencial.desayuno"][0] == 10
    assert informe["origen"]["f1|asistencial.desayuno"] == {"hoja": "COMENSALES HOSP", "fila": 5, "columna": "C", "porLugar": False}
    assert len(informe["reglas"]) > 0 and all("estado" in regla for regla in informe["reglas"])


def prueba_subir_sin_reporte_previo_lo_crea_con_su_historial(cliente, sesion, dig):
    activar_nut2(sesion)
    assert e.reporte_de(sesion, 8, "NUT") is None
    subir(cliente, sesion, dig, contenido=generar_plantilla())
    reporte = e.reporte_de(sesion, 8, "NUT")
    assert reporte is not None
    historial = sesion.execute(text("SELECT accion FROM reporte.reporte_historial_estado WHERE reporte_id = :r ORDER BY id"), {"r": reporte.id}).scalars().all()
    assert historial == ["crear"]


def prueba_el_linaje_de_una_casilla_coincide_con_la_celda_real(cliente, sesion, dig):
    """Día 1 de la primera fila del primer cuadro: fila 5, columna C (confirmado
    desempaquetando la plantilla real en el paso 1)."""
    activar_nut2(sesion)
    subir(cliente, sesion, dig, contenido=generar_plantilla())
    reporte = e.reporte_de(sesion, 8, "NUT")
    indicador_id = sesion.scalar(text("SELECT id FROM formato.indicador WHERE codigo = 'f1.asistencial.desayuno'"))
    v = sesion.scalar(select(Valor).where(Valor.reporte_id == reporte.id, Valor.indicador_id == indicador_id, Valor.dia == 1))
    assert (v.hoja_excel, v.celda_excel, v.origen, v.valor) == ("COMENSALES HOSP", "C5", "archivo", 10)


def prueba_re_subir_reemplaza_las_casillas_anteriores(cliente, sesion, dig):
    activar_nut2(sesion)
    subir(cliente, sesion, dig, contenido=generar_plantilla())
    reporte = e.reporte_de(sesion, 8, "NUT")
    assert sesion.scalar(select(func.count()).select_from(Valor).where(Valor.reporte_id == reporte.id)) == 31 * 38

    subir(cliente, sesion, dig, contenido=generar_plantilla())
    sesion.refresh(reporte)
    assert sesion.scalar(select(func.count()).select_from(Valor).where(Valor.reporte_id == reporte.id)) == 31 * 38  # no se duplicó
    assert sesion.scalar(select(func.count()).select_from(Carga).where(Carga.reporte_id == reporte.id)) == 2
    assert sesion.scalar(select(func.count()).select_from(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente)) == 1


# ------------------------------------------------------- el hallazgo que casi rompe la demo


def prueba_dos_errores_del_mismo_tipo_no_chocan_por_clave_hallazgo(cliente, sesion, dig):
    activar_nut2(sesion)
    roturas = [
        {"cuadro": "f1", "fila": "asistencial.desayuno", "dia": 1, "valor": "cuarenta"},
        {"cuadro": "f3", "fila": "liquida.cena", "dia": 5, "valor": "treinta"},
    ]
    r = subir(cliente, sesion, dig, contenido=generar_plantilla(roturas=roturas))
    assert r.status_code == 200, r.text
    assert len(r.json()["informe"]["errores"]) == 2

    reporte = e.reporte_de(sesion, 8, "NUT")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    errores = sesion.scalars(select(Hallazgo).where(Hallazgo.carga_id == carga.id, Hallazgo.nivel == "error")).all()
    assert len(errores) == 2
    assert len({h.clave_hallazgo for h in errores}) == 2  # la clave del bot por sí sola habría chocado
    assert all(h.clave_hallazgo.startswith("no-numerico|") for h in errores)
    # la casilla rota queda con el valor nulo y el texto que traía el archivo
    indicador_id = sesion.scalar(text("SELECT id FROM formato.indicador WHERE codigo = 'f1.asistencial.desayuno'"))
    v = sesion.scalar(select(Valor).where(Valor.reporte_id == reporte.id, Valor.indicador_id == indicador_id, Valor.dia == 1))
    assert (v.valor, v.texto_original) == (None, "cuarenta")


def prueba_un_aviso_trae_su_regla_por_el_campo_regla_no_por_el_id(cliente, sesion, dig):
    """f3.liquida.cena en 100 el día 21, con el resto en 10: dispara `atipico`
    (el ejemplo real del oficio, ya usado en las pruebas del servicio)."""
    activar_nut2(sesion)
    roturas = [{"cuadro": "f3", "fila": "liquida.cena", "dia": 21, "valor": 100}]
    r = subir(cliente, sesion, dig, contenido=generar_plantilla(roturas=roturas))
    assert r.status_code == 200, r.text
    assert len(r.json()["informe"]["avisos"]) == 1

    reporte = e.reporte_de(sesion, 8, "NUT")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    aviso = sesion.scalar(select(Hallazgo).where(Hallazgo.carga_id == carga.id, Hallazgo.nivel == "aviso"))
    regla_atipico = sesion.scalar(text("SELECT id FROM formato.regla_validacion WHERE codigo = 'atipico'"))
    assert aviso.regla_validacion_id == regla_atipico
    assert aviso.clave_hallazgo == "atipico|f3|liquida.cena|21"


def prueba_el_total_declarado_se_guarda_para_comprobar_coherencia(cliente, sesion, dig):
    activar_nut2(sesion)
    subir(cliente, sesion, dig, contenido=generar_plantilla())
    reporte = e.reporte_de(sesion, 8, "NUT")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    total_del_cuadro = sesion.scalar(
        select(TotalDeclarado.valor).where(TotalDeclarado.carga_id == carga.id, TotalDeclarado.indicador_id.is_(None), TotalDeclarado.cuadro_id == sesion.scalar(text("SELECT id FROM formato.cuadro WHERE codigo='f1' AND formato_version_id=(SELECT formato_version_id FROM reporte.carga WHERE id=:c)"), {"c": carga.id}))
    )
    assert total_del_cuadro == 14 * 31 * 10  # 14 indicadores × 31 días × 10 raciones


# ------------------------------------------------------------------------ bloqueo


def prueba_una_plantilla_de_otro_periodo_bloquea_sin_tocar_valores(cliente, sesion, dig):
    activar_nut2(sesion)
    r = subir(cliente, sesion, dig, contenido=generar_plantilla(periodo="2026-07"))
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["resultado"] == "bloqueada" and cuerpo["informe"]["bloqueo"]["id"] == "plantilla-periodo"
    reporte = e.reporte_de(sesion, 8, "NUT")
    assert reporte.formato_version_id is None
    assert sesion.scalar(select(func.count()).select_from(Valor).where(Valor.reporte_id == reporte.id)) == 0
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id))
    assert (carga.resultado, carga.es_vigente) == ("bloqueada", False)


def prueba_un_archivo_que_no_es_excel_bloquea(cliente, sesion, dig):
    activar_nut2(sesion)
    r = subir(cliente, sesion, dig)  # el contenido por omisión no es un .xlsx real
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["resultado"] == "bloqueada" and cuerpo["informe"]["bloqueo"]["id"]


# ------------------------------------------------------------- orden de comprobaciones


def prueba_sin_sesion_es_401(cliente, sesion):
    r = subir(cliente, sesion, con_sesion=False)
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"


def prueba_sin_permiso_es_403_antes_de_mirar_si_hay_version_activa(cliente, sesion):
    """Ninguna versión activa (no se llamó a activar_nut2) y aun así da 403, no 409."""
    rev = e.revisor_de_estadistica(sesion)
    r = subir(cliente, sesion, rev)
    assert r.status_code == 403


def prueba_formato_o_periodo_inexistentes_son_404_antes_que_la_version_activa(cliente, sesion, dig):
    assert subir(cliente, sesion, dig, formato="XXX").status_code == 404
    assert subir(cliente, sesion, dig, periodo="2025-12").status_code == 404


def prueba_sin_ninguna_version_activa_es_409(cliente, sesion, dig):
    r = subir(cliente, sesion, dig)  # ninguna versión activa: no se llamó a activar_nut2
    assert r.status_code == 409 and r.json()["codigo"] == "sin_version_activa"


def prueba_un_periodo_mal_formado_es_422(cliente, sesion, dig):
    assert subir(cliente, sesion, dig, periodo="2026-8").status_code == 422


def prueba_un_reporte_que_no_esta_en_borrador_da_409_reporte_no_editable(cliente, sesion, dig):
    activar_nut2(sesion)
    subir(cliente, sesion, dig, contenido=generar_plantilla())
    rev = e.revisor_de_estadistica(sesion)
    sesion.commit()
    assert cliente.post("/api/reportes/NUT/2026-08/transiciones/enviar", headers=cabecera(dig)).status_code == 200
    r = subir(cliente, sesion, dig, contenido=generar_plantilla())
    assert r.status_code == 409 and r.json()["codigo"] == "reporte_no_editable"


# --------------------------------------------------------------------- la bitácora


def prueba_la_bitacora_resume_en_una_fila_por_tabla_no_una_por_casilla(cliente, sesion, dig):
    """El caso que mide INFORME_AVANCE_04.md § 2.3: 1080 filas → 2 (aquí, 1116 → 2,
    porque agosto tiene 31 días)."""
    activar_nut2(sesion)
    subir(cliente, sesion, dig, contenido=generar_plantilla())
    reporte = e.reporte_de(sesion, 8, "NUT")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    filas_bitacora_valor = sesion.execute(
        text("SELECT operacion, datos_nuevos FROM auditoria.registro_cambio WHERE tabla = 'valor' AND registro_id = :c"), {"c": carga.id}
    ).all()
    assert len(filas_bitacora_valor) == 1
    assert filas_bitacora_valor[0][0] == "INSERTAR_MASIVO"


# ------------------------------------------------------- arreglos del 28/09/2026


def prueba_el_archivo_se_guarda_por_periodo_y_area(cliente, sesion, dig):
    activar_nut2(sesion)
    subir(cliente, sesion, dig, contenido=generar_plantilla())
    archivo = sesion.scalar(select(Archivo))
    assert archivo.ruta_almacenamiento.replace("\\", "/").startswith("2026-08/NUT/")
    assert archivo.ruta_almacenamiento.endswith(f"{archivo.huella_sha256}.xlsx")


def _justificar(cliente, sesion, actor, clave, texto):
    sesion.commit()
    return cliente.put(f"/api/reportes/NUT/2026-08/hallazgos/{quote(clave, safe='')}/justificacion", json={"justificacion": texto}, headers=cabecera(actor))


def prueba_re_subir_conserva_la_justificacion_del_mismo_aviso(cliente, sesion, dig):
    activar_nut2(sesion)
    atipico = [{"cuadro": "f3", "fila": "liquida.cena", "dia": 21, "valor": 100}]
    subir(cliente, sesion, dig, contenido=generar_plantilla(roturas=atipico))
    assert _justificar(cliente, sesion, dig, "atipico|f3|liquida.cena|21", "Brote en el piso 3.").status_code == 200

    subir(cliente, sesion, dig, contenido=generar_plantilla(roturas=atipico))
    reporte = e.reporte_de(sesion, 8, "NUT")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    aviso = sesion.scalar(select(Hallazgo).where(Hallazgo.carga_id == carga.id, Hallazgo.nivel == "aviso"))
    assert (aviso.justificacion, aviso.usuario_justificacion_id) == ("Brote en el piso 3.", dig.usuario_id)
    sesion.commit()
    assert cliente.post("/api/reportes/NUT/2026-08/transiciones/enviar", headers=cabecera(dig)).status_code == 200


def prueba_un_aviso_nuevo_no_hereda_la_justificacion_de_otro(cliente, sesion, dig):
    activar_nut2(sesion)
    subir(cliente, sesion, dig, contenido=generar_plantilla(roturas=[{"cuadro": "f3", "fila": "liquida.cena", "dia": 21, "valor": 100}]))
    _justificar(cliente, sesion, dig, "atipico|f3|liquida.cena|21", "Brote en el piso 3.")
    subir(cliente, sesion, dig, contenido=generar_plantilla(roturas=[{"cuadro": "f3", "fila": "liquida.cena", "dia": 5, "valor": 100}]))
    reporte = e.reporte_de(sesion, 8, "NUT")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    aviso = sesion.scalar(select(Hallazgo).where(Hallazgo.carga_id == carga.id, Hallazgo.nivel == "aviso"))
    assert (aviso.clave_hallazgo, aviso.justificacion) == ("atipico|f3|liquida.cena|5", None)


def prueba_con_el_mes_anterior_entregado_se_aplica_la_regla_de_variacion(cliente, sesion, dig):
    """Julio con los pacientes de emergencia (f4) a la mitad; agosto normal: f4 sube 100 %
    y el bot lo marca. Antes el backend no le mandaba el mes anterior y esta regla nunca
    corría."""
    activar_nut2(sesion)
    mitad = [{"cuadro": "f4", "fila": fila, "dia": d, "valor": 5} for fila in ("sis.desayuno", "sis.almuerzo", "sis.cena") for d in range(1, 32)]
    julio = subir(cliente, sesion, dig, periodo="2026-07", contenido=generar_plantilla("2026-07", mitad), nombre="Nutricion_2026-07.xlsx")
    assert julio.json()["resultado"] == "aceptada", julio.text
    sesion.commit()
    assert cliente.post("/api/reportes/NUT/2026-07/transiciones/enviar", headers=cabecera(dig)).status_code == 200

    agosto = subir(cliente, sesion, dig, contenido=generar_plantilla())
    avisos = [a["id"] for a in agosto.json()["informe"]["avisos"]]
    assert avisos == ["variacion|f4"]


def prueba_sin_el_mes_anterior_entregado_no_hay_variacion(cliente, sesion, dig):
    activar_nut2(sesion)
    mitad = [{"cuadro": "f4", "fila": "sis.cena", "dia": d, "valor": 5} for d in range(1, 32)]
    subir(cliente, sesion, dig, periodo="2026-07", contenido=generar_plantilla("2026-07", mitad), nombre="Nutricion_2026-07.xlsx")  # queda en borrador
    agosto = subir(cliente, sesion, dig, contenido=generar_plantilla())
    assert agosto.json()["informe"]["avisos"] == []


def prueba_las_casillas_se_insertan_por_lotes_y_la_bitacora_resume_cada_lote(cliente, sesion, dig, monkeypatch):
    """Con un tope de parámetros artificialmente bajo, las 1 116 casillas van en varias
    sentencias: todas se guardan y la bitácora trae una fila resumen por lote."""
    from app.datos import cargas as repo_cargas

    monkeypatch.setattr(repo_cargas, "_MAXIMO_PARAMETROS", 5_000)  # ~500 filas de 9 columnas por lote
    activar_nut2(sesion)
    subir(cliente, sesion, dig, contenido=generar_plantilla())
    reporte = e.reporte_de(sesion, 8, "NUT")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    assert sesion.scalar(select(func.count()).select_from(Valor).where(Valor.reporte_id == reporte.id)) == 31 * 38
    lotes = sesion.execute(
        text("SELECT (datos_nuevos->>'filas')::int FROM auditoria.registro_cambio WHERE tabla = 'valor' AND registro_id = :c AND operacion = 'INSERTAR_MASIVO'"),
        {"c": carga.id},
    ).scalars().all()
    assert len(lotes) == 3 and sum(lotes) == 31 * 38
