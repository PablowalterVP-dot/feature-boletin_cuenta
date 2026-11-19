"""Farmacia de punta a punta: el catálogo (`cargar_catalogo_farmacia`) y la carga
de su informe **en Word**, un formato mensual (una cifra por casilla, sin días).

La migración `0007_farmacia_word.sql` habilita `docx` en `formato.formato_version`.
La carga va contra el **bot real** (`@pytest.mark.node`), con un Word que genera el
propio bot (`apoyo_word_farmacia.mjs`) con las cifras del informe de enero de 2026.
"""

import base64
import json
import subprocess

import pytest
from sqlalchemy import func, select, text

import escenario as e
from app.config import RAIZ_BACKEND
from app.datos import cargas as repo_cargas
from app.datos.base import vigente
from app.datos.modelos import Archivo, Carga, Cuadro, Formato, FormatoVersion, Hallazgo, Indicador, Valor, VersionIndicador
from app.herramientas.cargar_catalogo_farmacia import NoSePuede, base_admite_word, cargar_catalogo, leer_catalogo
from app.servicios.cargas import _aplanar
from prueba_api_cargas import _node, bot_real, cabecera, cliente, subir  # noqa: F401 (fixtures del bot real y del cliente)

pytestmark = pytest.mark.bd

APOYO = RAIZ_BACKEND / "pruebas" / "apoyo_word_farmacia.mjs"
EXPORTADOR = RAIZ_BACKEND.parent / "scripts" / "exportar-catalogo-farmacia.mjs"
SQL_WORD = RAIZ_BACKEND / "bd" / "migraciones" / "0007_farmacia_word.sql"
CATALOGO = leer_catalogo()
CASILLAS = sum(len(c["casillas"]) for c in CATALOGO["cuadros"])


def admitir_word(sesion) -> None:
    sesion.execute(text(SQL_WORD.read_text(encoding="utf-8")))
    sesion.flush()


def word(periodo: str = "2026-01", variante: str = "") -> bytes:
    r = subprocess.run([_node(), str(APOYO), periodo, variante], capture_output=True, text=True, encoding="utf-8", cwd=APOYO.parent, timeout=30)
    assert r.returncode == 0, r.stderr
    return base64.b64decode(r.stdout)


def version_far(bd) -> FormatoVersion:
    return bd.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == "FAR", FormatoVersion.codigo_version == CATALOGO["version"], vigente(FormatoVersion)))


@pytest.fixture
def dig(sesion):
    return e.persona(sesion, "dig.far", ("digitador", "farmacia"))


def subir_far(cliente, sesion, dig, periodo: str = "2026-01", variante: str = ""):
    return subir(cliente, sesion, dig, formato="FAR", periodo=periodo, contenido=word(periodo, variante), nombre=f"01_INFORME_{periodo}.docx")


# ------------------------------------------------------------------ catálogo


def prueba_sin_el_script_de_word_dice_que_correrlo(sesion):
    sesion.execute(text("ALTER TABLE formato.formato_version DROP CONSTRAINT IF EXISTS ck_formato_version_tipo"))
    sesion.execute(text("ALTER TABLE formato.formato_version ADD CONSTRAINT ck_formato_version_tipo CHECK (tipo_archivo IS NULL OR tipo_archivo IN ('xlsx', 'xls', 'csv'))"))
    sesion.flush()
    assert not base_admite_word(sesion)
    with pytest.raises(NoSePuede, match="01_word.sql|0007_farmacia_word.sql|migrate"):
        cargar_catalogo(sesion)


def prueba_el_script_de_word_se_puede_correr_dos_veces(sesion):
    admitir_word(sesion)
    admitir_word(sesion)
    assert base_admite_word(sesion)


def prueba_crea_el_formato_mensual_y_activa_far_w1_en_word(sesion):
    admitir_word(sesion)
    mensaje = cargar_catalogo(sesion)
    assert f"3 cuadros, {CASILLAS} casillas" in mensaje
    v = version_far(sesion)
    formato = sesion.get(Formato, v.formato_id)
    assert (formato.granularidad, v.estado, v.tipo_archivo) == ("mensual", "activa", "docx")
    assert sesion.scalar(select(func.count()).select_from(Cuadro).where(Cuadro.formato_version_id == v.id)) == 3
    assert sesion.scalar(select(func.count()).select_from(VersionIndicador).where(VersionIndicador.formato_version_id == v.id)) == CASILLAS
    for codigo in ("f1.sis.hosp", "f1.otros.boletas", "f2.hospitalizados.fila1.mater", "f3.convenios.fila4"):
        assert sesion.scalar(select(Indicador.codigo).where(Indicador.formato_id == formato.id, Indicador.codigo == codigo)) == codigo


def prueba_es_idempotente(sesion):
    admitir_word(sesion)
    cargar_catalogo(sesion)
    assert "ya está activa" in cargar_catalogo(sesion)
    assert sesion.scalar(select(func.count()).select_from(Indicador).join(Formato).where(Formato.codigo == "FAR")) == CASILLAS


def prueba_aplanar_une_las_filas_anidadas_de_farmacia_y_deja_igual_lo_demas():
    assert _aplanar({"sis": {"hosp": 9264}, "convenio": {"emerg": 180}}) == {"sis.hosp": 9264, "convenio.emerg": 180}
    assert _aplanar({"hospitalizados": {"fila1": {"mater": 17}}}) == {"hospitalizados.fila1.mater": 17}
    assert _aplanar({"glucosa.emergencia": 42, "asistencial.desayuno": [1, 2]}) == {"glucosa.emergencia": 42, "asistencial.desayuno": [1, 2]}


@pytest.mark.node
def prueba_el_json_del_catalogo_es_el_que_exporta_el_bot():
    if _node() is None:
        pytest.skip("node no está en el PATH.")
    r = subprocess.run([_node(), str(EXPORTADOR), "--stdout"], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout) == leer_catalogo(), "Regenere el JSON: node servidor/scripts/exportar-catalogo-farmacia.mjs"


# --------------------------------------------------------------------- carga


@pytest.mark.node
def prueba_el_word_de_enero_guarda_sus_cifras_y_el_archivo(cliente, sesion, dig):
    admitir_word(sesion)
    cargar_catalogo(sesion)
    r = subir_far(cliente, sesion, dig)
    assert r.status_code == 200, r.text
    informe = r.json()["informe"]
    assert (r.json()["resultado"], informe["plantilla"]["version"]) == ("aceptada", CATALOGO["version"])
    assert informe["errores"] == []

    reporte = e.reporte_de(sesion, 1, "FAR")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    archivo = sesion.get(Archivo, carga.archivo_id)
    assert archivo.ruta_almacenamiento.endswith(".docx") and "wordprocessingml" in archivo.tipo_mime
    assert sesion.scalar(select(func.count()).select_from(Valor).where(Valor.reporte_id == reporte.id, Valor.dia.is_not(None))) == 0

    datos = repo_cargas.datos_para_bot(sesion, reporte.id, 31, mensual=True)
    assert sum(datos["f1"].values()) == 24399  # el total de atenciones del informe
    assert datos["f2"]["hospitalizados.fila2.mater"] == 152
    assert sum(datos["f3"][f"consultas.fila{n}"] for n in range(1, 5)) == 2668


@pytest.mark.node
def prueba_un_total_mal_escrito_en_el_word_queda_como_error(cliente, sesion, dig):
    admitir_word(sesion)
    cargar_catalogo(sesion)
    r = subir_far(cliente, sesion, dig, variante="roto")
    assert r.status_code == 200, r.text
    reporte = e.reporte_de(sesion, 1, "FAR")
    carga = sesion.scalar(select(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente))
    claves = sesion.scalars(select(Hallazgo.clave_hallazgo).where(Hallazgo.carga_id == carga.id, Hallazgo.nivel == "error")).all()
    assert "f1-total-sis" in claves


def prueba_con_far_w1_activa_farmacia_entra_al_flujo(cliente, sesion):
    admitir_word(sesion)
    cargar_catalogo(sesion)
    sesion.commit()
    r = cliente.get("/api/configuracion")
    assert r.status_code == 200, r.text
    assert "farmacia" in [a["clave"] for a in r.json()["areas_en_flujo"]]
