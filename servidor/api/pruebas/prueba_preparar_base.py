"""Lo que `preparar_base` hace al arrancar la API, sobre una base recién
instalada: crea y activa Centro Quirúrgico y retira Mantenimiento, y una
segunda vez no cambia nada (corre en cada arranque y en cada redeploy).

Los pasos de Nutrición (formato, plazos, alertas, histórico) ya los prueban
sus herramientas; aquí van los que se le sumaron el 22/10/2026 para que la base
desplegada quede al día sin correrlos a mano.
"""

import pytest
from sqlalchemy import func, select, text

from app.datos.base import vigente
from app.datos.modelos import Formato, FormatoVersion, Reporte
from app.herramientas import preparar_base
from app.herramientas.cargar_catalogo_centro_quirurgico import cargar_catalogo

pytestmark = pytest.mark.bd


def _cqx1(sesion):
    return sesion.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == "CQX", FormatoVersion.codigo_version == "CQX-1", vigente(FormatoVersion)))


def _mantenimiento_activo(sesion) -> int:
    return sesion.scalar(text("SELECT count(*) FROM organizacion.unidad_organica WHERE codigo = 'MTO' AND fecha_eliminacion IS NULL"))


def prueba_activa_centro_quirurgico_y_una_segunda_vez_no_hace_nada(sesion):
    assert _cqx1(sesion) is None, "la semilla no trae el formato de Centro Quirúrgico"
    primera = cargar_catalogo(sesion)
    assert "activada" in primera
    assert _cqx1(sesion).estado == "activa"
    segunda = cargar_catalogo(sesion)
    assert "ya está activa" in segunda


def _como_antes_del_seeder_0004(sesion) -> None:
    """Una base levantada antes del gestor de migraciones: Mantenimiento activo,
    con su destino. En la de pruebas, el seeder 0004 ya lo retiró."""
    sesion.execute(text(
        "UPDATE organizacion.destino SET fecha_eliminacion = NULL WHERE unidad_origen_id = "
        "(SELECT id FROM organizacion.unidad_organica WHERE codigo = 'MTO')"
    ))
    sesion.execute(text(
        "UPDATE organizacion.unidad_organica SET fecha_eliminacion = NULL, es_activo = TRUE, es_reportante = TRUE WHERE codigo = 'MTO'"
    ))


def prueba_los_seeders_ya_dejan_mantenimiento_retirado(sesion):
    assert _mantenimiento_activo(sesion) == 0
    assert preparar_base.retirar_mantenimiento(sesion) == "Mantenimiento ya estaba retirado."


def prueba_retira_mantenimiento_una_sola_vez(sesion):
    _como_antes_del_seeder_0004(sesion)
    assert _mantenimiento_activo(sesion) == 1
    assert preparar_base.retirar_mantenimiento(sesion) == "Mantenimiento retirado (unidad MTO y su destino)."
    assert _mantenimiento_activo(sesion) == 0
    destinos = sesion.scalar(text(
        "SELECT count(*) FROM organizacion.destino d JOIN organizacion.unidad_organica u ON u.id = d.unidad_origen_id "
        "WHERE u.codigo = 'MTO' AND d.fecha_eliminacion IS NULL"
    ))
    assert destinos == 0
    assert preparar_base.retirar_mantenimiento(sesion) == "Mantenimiento ya estaba retirado."


def prueba_el_script_de_mantenimiento_viaja_en_la_imagen():
    # El Dockerfile copia servidor/api/bd: la ruta que usa preparar_base tiene que existir ahí.
    assert preparar_base.RETIRAR_MANTENIMIENTO.is_file()
    assert preparar_base.RETIRAR_MANTENIMIENTO.parts[-3:] == ("bd", "seeders", "0004_retirar_mantenimiento.sql")


# ----------------------------------------------------------- histórico por área


def prueba_el_archivo_del_mes_se_reconoce_por_el_nombre_que_trae_farmacia(tmp_path):
    from app.herramientas.cargar_historico import archivo_del_mes

    for nombre in ("01 INFORME MES DE ENERO 2026.docx", "02 INFORME MES DE SETIEMBRE 2026.docx", "~$ INFORME MES DE MARZO.docx", "notas de marzo.txt"):
        (tmp_path / nombre).write_bytes(b"x")
    assert archivo_del_mes(tmp_path, "2026-01").name == "01 INFORME MES DE ENERO 2026.docx"
    assert archivo_del_mes(tmp_path, "2026-09").name == "02 INFORME MES DE SETIEMBRE 2026.docx"
    assert archivo_del_mes(tmp_path, "2026-03") is None  # ni el temporal de Word ni un .txt


def prueba_dos_archivos_del_mismo_mes_no_se_adivinan(tmp_path):
    from app.herramientas.cargar_historico import NoSePuede, archivo_del_mes

    (tmp_path / "INFORME ENERO 2026.docx").write_bytes(b"x")
    (tmp_path / "INFORME ENERO 2026 (corregido).docx").write_bytes(b"x")
    with pytest.raises(NoSePuede, match="más de un archivo"):
        archivo_del_mes(tmp_path, "2026-01")


def prueba_nutricion_sigue_con_su_nombre_exacto(tmp_path):
    from app.herramientas.cargar_historico import archivo_del_mes

    (tmp_path / "ENERO.xlsx").write_bytes(b"x")
    (tmp_path / "ENERO copia.xlsx").write_bytes(b"x")
    assert archivo_del_mes(tmp_path, "2026-01").name == "ENERO.xlsx"


def prueba_el_historico_de_farmacia_espera_a_que_su_formato_este_activo(sesion, tmp_path):
    from contextlib import nullcontext

    (tmp_path / "01 INFORME MES DE ENERO 2026.docx").write_bytes(b"x")
    historico = preparar_base.Historico("FAR", tmp_path, "2026-01", "2026-09")
    assert preparar_base.cargar_meses(lambda: nullcontext(sesion), historico) == [
        "«FAR» no tiene versión activa: su histórico espera a que se active el formato."
    ]


def prueba_un_historico_sin_archivos_lo_dice(sesion):
    from contextlib import nullcontext

    vacio = preparar_base.RAIZ_HISTORICO / "farmacia" / "2026"  # solo su README, hasta que lleguen los Word
    historico = preparar_base.Historico("FAR", vacio, "2026-01", "2026-09")
    [linea] = preparar_base.cargar_meses(lambda: nullcontext(sesion), historico)
    assert linea.startswith("Sin histórico") or "no tiene versión activa" in linea


def prueba_farmacia_esta_en_la_lista_del_historico():
    assert [h.formato for h in preparar_base.HISTORICOS] == ["NUT", "FAR", "CQX", "EPI", "DXI"]


def prueba_preparar_base_por_defecto_no_carga_meses_historicos(sesion):
    """Por defecto, preparar_base activa formatos y catálogos, sin insertar
    reportes ni valores en las tablas operativas."""
    assert sesion.scalar(select(func.count(Reporte.id))) == 0


def prueba_centro_quirurgico_tiene_un_libro_por_mes():
    """Enero a agosto, un libro por mes, y las correcciones caen en meses de la lista."""
    from app.herramientas.cargar_historico import archivo_del_mes

    [cqx] = [h for h in preparar_base.HISTORICOS if h.formato == "CQX"]
    meses = [f"2026-{m:02d}" for m in range(1, 9)]
    assert (cqx.desde, cqx.hasta) == (meses[0], meses[-1])
    assert all(archivo_del_mes(cqx.carpeta, p) is not None for p in meses)
    assert set(cqx.correcciones) <= set(meses)
