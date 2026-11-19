"""Epidemiología y Diagnóstico por Imágenes: su catálogo (`catalogo_word`) y la
carga de su oficio en Word.

Lo que corre sin base (`node`): el JSON de cada catálogo es el que exporta el
bot, y cada casilla que el bot lee de un oficio real, aplanada como la guarda
la API (`_aplanar`), es un indicador del catálogo. Si no lo fuera, la carga
fallaría en producción con `VersionInconsistente`.

Lo que necesita la base de pruebas (`bd`): el catálogo se crea, se activa y es
idempotente, y un oficio real (de `historico/`) se sube de punta a punta
contra el bot real.
"""

import json
import subprocess

import pytest
from sqlalchemy import func, select, text

import escenario as e
from app.config import RAIZ_BACKEND
from app.datos.base import vigente
from app.datos.modelos import Cuadro, Formato, FormatoVersion, Indicador, Valor, VersionIndicador
from app.herramientas import cargar_catalogo_epidemiologia, cargar_catalogo_imagenes
from app.herramientas.catalogo_word import NoSePuede, base_admite_word, leer_catalogo
from app.servicios.cargas import _aplanar
from prueba_api_cargas import _node, bot_real, cliente, subir  # noqa: F401 (fixtures del bot real y del cliente)

SCRIPTS = RAIZ_BACKEND.parent / "scripts"
BOT = RAIZ_BACKEND.parent / "bot-validador" / "src" / "motor.js"
HISTORICO = RAIZ_BACKEND / "historico"
SQL_WORD = RAIZ_BACKEND / "bd" / "migraciones" / "0007_farmacia_word.sql"

AREAS = {
    "epidemiologia": (cargar_catalogo_epidemiologia, "exportar-catalogo-epidemiologia.mjs", HISTORICO / "epidemiologia" / "2026" / "Enero.docx", "2026-01"),
    "imagenes": (cargar_catalogo_imagenes, "exportar-catalogo-imagenes.mjs", HISTORICO / "imagenes" / "2026" / "Julio.docx", "2026-07"),
}


def _datos_del_bot(area: str, archivo, periodo: str) -> dict:
    """El informe del bot para un oficio real, leído con el motor (sin servidor)."""
    script = (
        "import { readFileSync } from 'node:fs';"
        "import { pathToFileURL } from 'node:url';"
        f"const {{ validarArchivo }} = await import(pathToFileURL({json.dumps(str(BOT))}).href);"
        f"const inf = await validarArchivo(readFileSync({json.dumps(str(archivo))}), {{ area: {json.dumps(area)}, periodo: {json.dumps(periodo)}, nombre: 'x.docx' }});"
        "process.stdout.write(JSON.stringify(inf));"
    )
    r = subprocess.run([_node(), "--input-type=module", "-e", script], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


# ------------------------------------------------------------- sin base


@pytest.mark.node
@pytest.mark.parametrize("area", AREAS)
def prueba_el_json_del_catalogo_es_el_que_exporta_el_bot(area):
    if _node() is None:
        pytest.skip("node no está en el PATH.")
    modulo, exportador, _, _ = AREAS[area]
    r = subprocess.run([_node(), str(SCRIPTS / exportador), "--stdout"], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout) == leer_catalogo(modulo.AREA), f"Regenere el JSON: node servidor/scripts/{exportador}"


@pytest.mark.node
@pytest.mark.parametrize("area", AREAS)
def prueba_cada_casilla_que_lee_el_bot_es_un_indicador_del_catalogo(area):
    if _node() is None:
        pytest.skip("node no está en el PATH.")
    modulo, _, archivo, periodo = AREAS[area]
    informe = _datos_del_bot(area, archivo, periodo)
    assert "bloqueo" not in informe, informe.get("bloqueo")
    catalogo = leer_catalogo(modulo.AREA)
    codigos = {x["codigo"] for c in catalogo["cuadros"] for x in c["casillas"]}
    leidas = {f"{c['codigo']}.{fila}" for c in catalogo["cuadros"] for fila in _aplanar(informe["datos"].get(c["codigo"]) or {})}
    assert leidas, "el bot no devolvió ninguna casilla de los cuadros del catálogo"
    assert leidas <= codigos, f"casillas sin indicador: {sorted(leidas - codigos)[:5]}"
    for c in catalogo["cuadros"]:
        for fila, valor in _aplanar(informe["datos"].get(c["codigo"]) or {}).items():
            assert not isinstance(valor, list), f"{c['codigo']}.{fila} vino por días en un formato mensual"


def prueba_sin_catalogo_dice_como_generarlo():
    from dataclasses import replace

    area = replace(cargar_catalogo_imagenes.AREA, catalogo="no-existe.json")
    with pytest.raises(NoSePuede, match="exportar-catalogo-imagenes"):
        leer_catalogo(area)


# ------------------------------------------------------------- con base


def _admitir_word(sesion) -> None:
    sesion.execute(text(SQL_WORD.read_text(encoding="utf-8")))
    sesion.flush()


@pytest.mark.bd
@pytest.mark.parametrize("area", AREAS)
def prueba_crea_y_activa_el_formato_mensual_en_word(sesion, area):
    modulo = AREAS[area][0]
    _admitir_word(sesion)
    assert base_admite_word(sesion)
    catalogo = leer_catalogo(modulo.AREA)
    casillas = sum(len(c["casillas"]) for c in catalogo["cuadros"])
    assert f"{casillas} indicadores" in modulo.cargar_catalogo(sesion)
    v = sesion.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == modulo.AREA.formato, FormatoVersion.codigo_version == catalogo["version"], vigente(FormatoVersion)))
    assert (v.estado, v.tipo_archivo) == ("activa", "docx")
    assert sesion.scalar(select(func.count()).select_from(Cuadro).where(Cuadro.formato_version_id == v.id)) == len(catalogo["cuadros"])
    assert sesion.scalar(select(func.count()).select_from(VersionIndicador).where(VersionIndicador.formato_version_id == v.id)) == casillas
    assert "ya está activa" in modulo.cargar_catalogo(sesion)


@pytest.mark.bd
def prueba_los_montos_de_imagenes_son_decimales(sesion):
    _admitir_word(sesion)
    cargar_catalogo_imagenes.cargar_catalogo(sesion)
    formato = sesion.scalar(select(Formato).where(Formato.codigo == "DXI", vigente(Formato)))
    tipos = dict(sesion.execute(select(Indicador.codigo, Indicador.tipo_dato).where(Indicador.formato_id == formato.id)).all())
    assert tipos["rx.monto"] == "decimal"
    assert tipos["rx.examenes.hosp"] == "entero"


@pytest.mark.bd
@pytest.mark.node
@pytest.mark.parametrize("area", AREAS)
def prueba_un_oficio_real_se_sube_y_guarda_sus_casillas(cliente, sesion, area):
    modulo, _, archivo, periodo = AREAS[area]
    _admitir_word(sesion)
    modulo.cargar_catalogo(sesion)
    actor = e.persona(sesion, f"dig.{modulo.AREA.unidad.lower()}", ("digitador", area))
    r = subir(cliente, sesion, actor, formato=modulo.AREA.formato, periodo=periodo, contenido=archivo.read_bytes(), nombre=archivo.name)
    assert r.status_code == 200, r.text
    assert r.json()["resultado"] == "aceptada"
    guardadas = sesion.scalar(select(func.count()).select_from(Valor).join(Indicador).join(Formato).where(Formato.codigo == modulo.AREA.formato, vigente(Valor)))
    assert guardadas == sum(len(c["casillas"]) for c in leer_catalogo(modulo.AREA)["cuadros"])
