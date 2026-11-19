"""El seeder `0007`: que un despliegue deje a las nueve áreas con su formato activo.

Sin él, la base desplegada tenía cinco: los otros cuatro se activaban a mano, y lo
que Gineco-Obstetricia subió sin formato se quedó en el navegador y se perdió.
"""

import pytest
from sqlalchemy import select, text

from app.datos.modelos import Formato, FormatoVersion, Indicador
from app.dominio import configuracion
from app.herramientas import (
    bd as gestor_bd,
    cargar_catalogo_centro_quirurgico,
    cargar_catalogo_epidemiologia,
    cargar_catalogo_farmacia,
    cargar_catalogo_imagenes,
    preparar_base,
)
from app.servicios import admin

pytestmark = pytest.mark.bd

SEEDER = gestor_bd.CARPETA_SEEDERS / "0007_formatos_de_las_nueve_areas.py"
NUEVE = {"centro-quirurgico", "epidemiologia", "farmacia", "ginecologia", "imagenes", "laboratorio", "lavanderia", "nefrologia", "nutricion"}


def _activas(sesion) -> set[str]:
    return set(sesion.scalars(
        select(FormatoVersion.codigo_version).where(FormatoVersion.estado == "activa", FormatoVersion.fecha_eliminacion.is_(None))
    ))


def _lo_que_hace_preparar_base(sesion) -> None:
    preparar_base.preparar_formato(sesion)
    for cargador in (cargar_catalogo_centro_quirurgico, cargar_catalogo_farmacia, cargar_catalogo_epidemiologia, cargar_catalogo_imagenes):
        cargador.cargar_catalogo(sesion)


def prueba_sin_el_seeder_cuatro_areas_quedan_fuera(sesion):
    """El estado que tenía la base desplegada: la razón de ser del seeder."""
    _lo_que_hace_preparar_base(sesion)
    assert {a["clave"] for a in admin.areas_en_flujo(sesion)} == NUEVE - {"ginecologia", "laboratorio", "lavanderia", "nefrologia"}


def prueba_el_seeder_pone_a_las_nueve_areas_en_el_flujo(sesion):
    _lo_que_hace_preparar_base(sesion)
    gestor_bd._ejecutar(sesion, SEEDER)
    assert {a["clave"] for a in admin.areas_en_flujo(sesion)} == NUEVE
    assert {"GIN-1", "LAB-1", "LAV-1", "NEF-W1"} <= _activas(sesion)


def prueba_cada_formato_queda_con_su_tipo_de_archivo(sesion):
    gestor_bd._ejecutar(sesion, SEEDER)
    filas = sesion.execute(
        select(FormatoVersion.codigo_version, FormatoVersion.tipo_archivo).where(FormatoVersion.codigo_version.in_(["GIN-1", "LAB-1", "LAV-1", "NEF-W1"]))
    ).all()
    assert dict(filas) == {"GIN-1": "xlsx", "LAB-1": "xlsx", "LAV-1": "xlsx", "NEF-W1": "docx"}


def prueba_correrlo_de_nuevo_no_cambia_nada(sesion):
    """Corre en bases donde ya estaban activos a mano, como la compartida."""
    gestor_bd._ejecutar(sesion, SEEDER)
    indicadores = sesion.scalar(select(text("count(*)")).select_from(Indicador))
    formatos = sesion.scalar(select(text("count(*)")).select_from(Formato))
    gestor_bd._ejecutar(sesion, SEEDER)
    assert sesion.scalar(select(text("count(*)")).select_from(Indicador)) == indicadores
    assert sesion.scalar(select(text("count(*)")).select_from(Formato)) == formatos


def prueba_el_gestor_lo_registra_con_su_huella_y_no_lo_repite(sesion):
    assert gestor_bd.sembrar(sesion) == [SEEDER.name]
    fila = sesion.execute(text("SELECT hash_sha256 FROM public.seeders WHERE nombre = :n"), {"n": SEEDER.name}).one()
    assert fila.hash_sha256 == gestor_bd.hash_archivo(SEEDER)
    assert gestor_bd.sembrar(sesion) == []


def prueba_no_reanuda_un_area_que_el_superadministrador_pauso(sesion):
    parametros = {configuracion.clave_flujo("ginecologia"): "false"}
    assert not configuracion.esta_en_flujo(parametros, "ginecologia", tiene_formato_activo=True)
    admin.fijar_flujo(sesion, "ginecologia", False, "Se corrige su plantilla.")
    gestor_bd._ejecutar(sesion, SEEDER)
    assert "ginecologia" not in {a["clave"] for a in admin.areas_en_flujo(sesion)}
