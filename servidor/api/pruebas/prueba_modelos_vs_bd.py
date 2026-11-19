"""Contrato entre los modelos y la base de Alejandro.

Sin Alembic no hay quien avise de que el esquema cambió. Estas pruebas comparan
cada modelo con su tabla real (columnas, tipos, largos, nulabilidad, identidad,
clave primaria y claves foráneas) y fallan si Alejandro cambia algo sin que el
modelo lo siga. Si fallan tras copiar un avance nuevo de `bd/`, ajusta el modelo.
"""

import pytest
from sqlalchemy import Column, BigInteger, Integer, MetaData, String, Table, inspect

from app.datos.base import Base, ControlFechas
from app.datos.modelos import ConfiguracionLectura, Cumplimiento, DimensionesDeIndicador, PermisoUsuario, TotalIndicador, ValorDetalle
from coincidencia import comparar_tabla, tablas_de_la_bd

pytestmark = pytest.mark.bd

VISTAS = {
    PermisoUsuario.__table__.fullname, Cumplimiento.__table__.fullname,
    ValorDetalle.__table__.fullname, TotalIndicador.__table__.fullname, DimensionesDeIndicador.__table__.fullname,
    ConfiguracionLectura.__table__.fullname,
}
ESQUEMAS_MODELADOS = ("seguridad", "organizacion", "fuente", "desempeno", "planeamiento")


@pytest.fixture(scope="module")
def inspector(motor_bd):
    return inspect(motor_bd)


def modelos():
    return [(m.class_, m.local_table) for m in Base.registry.mappers]


# ------------------------------------------------------ cada modelo contra su tabla


@pytest.mark.parametrize("modelo, tabla", modelos(), ids=lambda x: getattr(x, "fullname", getattr(x, "__name__", str(x))))
def prueba_el_modelo_coincide_con_la_tabla_real(modelo, tabla, inspector):
    diferencias = comparar_tabla(tabla, inspector, es_vista=tabla.fullname in VISTAS)
    assert diferencias == [], "\n" + "\n".join(diferencias)


def prueba_hay_un_modelo_por_cada_tabla_y_vista_de_los_esquemas_modelados(inspector):
    """Si Alejandro añade una tabla a `seguridad` u `organizacion` y no hay modelo,
    se dice aquí y no cuando alguien la necesite."""
    modelados = {t.fullname for _, t in modelos()}
    for esquema in ESQUEMAS_MODELADOS:
        tablas, vistas = tablas_de_la_bd(inspector, esquema)
        reales = {f"{esquema}.{n}" for n in tablas} | {f"{esquema}.{n}" for n in vistas}
        assert reales - modelados == set(), f"sin modelo: {sorted(reales - modelados)}"
        assert {n for n in modelados if n.startswith(esquema + ".")} - reales == set(), "modelos de algo que ya no existe"


def prueba_toda_tabla_modelada_lleva_las_tres_columnas_de_control(inspector):
    """Alejandro las puso en TODAS las tablas; sus disparadores las llenan."""
    for modelo, tabla in modelos():
        if tabla.fullname in VISTAS:
            continue
        assert issubclass(modelo, ControlFechas), modelo.__name__
        assert {"fecha_creacion", "fecha_actualizacion", "fecha_eliminacion"} <= {c["name"] for c in inspector.get_columns(tabla.name, schema=tabla.schema)}


def prueba_las_vistas_son_vistas_y_las_tablas_son_tablas(inspector):
    for _, tabla in modelos():
        tablas, vistas = tablas_de_la_bd(inspector, tabla.schema)
        if tabla.fullname in VISTAS:
            assert tabla.name in vistas and tabla.name not in tablas
        else:
            assert tabla.name in tablas and tabla.name not in vistas


# --------------------------- el comparador muerde: modelos deliberadamente mal hechos


def _tabla_falsa(*columnas) -> Table:
    return Table("usuario", MetaData(), *columnas, schema="seguridad")


def prueba_el_comparador_detecta_una_columna_que_falta_en_el_modelo(inspector):
    tabla = _tabla_falsa(Column("id", BigInteger, primary_key=True))
    diferencias = comparar_tabla(tabla, inspector)
    assert any("nombre_usuario" in d and "el modelo no la tiene" in d for d in diferencias)


def prueba_el_comparador_detecta_una_columna_que_no_existe_en_la_base(inspector):
    tabla = _tabla_falsa(Column("id", BigInteger, primary_key=True), Column("columna_inexistente", String(20)))
    assert any("columna_inexistente" in d and "no existe en la base" in d for d in comparar_tabla(tabla, inspector))


def prueba_el_comparador_detecta_un_tipo_un_largo_y_una_nulabilidad_distintos(inspector):
    tabla = _tabla_falsa(
        Column("id", BigInteger, primary_key=True),
        Column("nombre_usuario", Integer, nullable=False),  # es texto
        Column("nombres", String(50), nullable=False),  # en la base son 100
        Column("cargo", String(150), nullable=False),  # en la base admite nulos
    )
    d = "\n".join(comparar_tabla(tabla, inspector))
    assert "nombre_usuario: tipo int en el modelo y str en la base" in d
    assert "nombres: largo 50 en el modelo y 100 en la base" in d
    assert "cargo: nulable=False en el modelo y True en la base" in d


def prueba_el_comparador_detecta_una_clave_primaria_y_una_foranea_distintas(inspector):
    tabla = Table(
        "usuario_rol", MetaData(), Column("id", BigInteger), Column("usuario_id", BigInteger, primary_key=True), Column("rol_id", BigInteger),
        Column("unidad_organica_id", BigInteger), schema="seguridad",
    )
    d = "\n".join(comparar_tabla(tabla, inspector))
    assert "clave primaria" in d and "la base tiene la clave foránea" in d


def prueba_el_comparador_detecta_una_tabla_que_no_existe(inspector):
    assert comparar_tabla(Table("no_existe", MetaData(), Column("id", BigInteger), schema="seguridad"), inspector) == ["seguridad.no_existe: no existe en la base"]


def prueba_el_comparador_no_da_falsos_positivos_con_el_modelo_real(inspector):
    """La otra cara: los modelos verdaderos pasan limpios, así que lo que se
    detecta arriba es una diferencia real."""
    for _, tabla in modelos():
        assert comparar_tabla(tabla, inspector, es_vista=tabla.fullname in VISTAS) == []
