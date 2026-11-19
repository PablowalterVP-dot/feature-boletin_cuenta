"""Compara un modelo SQLAlchemy con la tabla (o vista) real de la base.

Los modelos reflejan un esquema que no es nuestro y no hay Alembic que lo
mantenga alineado. Esta comparación es lo que detecta que Alejandro cambió algo:
una columna nueva, una renombrada, un largo distinto, una nulabilidad, una clave
foránea.

Devuelve la lista de diferencias, vacía si coincide, en lugar de aserciones: así
la propia comparación se puede probar contra modelos deliberadamente mal hechos.
"""

from sqlalchemy import Table
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.engine.reflection import Inspector
from sqlalchemy.types import TypeEngine


def familia(tipo: TypeEngine) -> str:
    """El tipo de Python que representa: `int`, `str`, `bool`, `datetime`, `date`,
    `Decimal`… Es lo que importa a la aplicación; `VARCHAR` y `TEXT` son ambos
    `str`, `SMALLINT` y `BIGINT` ambos `int`."""
    try:
        base = tipo.python_type.__name__
    except NotImplementedError:
        return type(tipo).__name__
    if base == "datetime":
        return "datetime-con-zona" if getattr(tipo, "timezone", False) else "datetime-sin-zona"
    return base


def _largo(tipo: TypeEngine) -> int | None:
    return getattr(tipo, "length", None)


def _claves_foraneas_del_modelo(tabla: Table) -> set[tuple]:
    resultado = set()
    for fk in tabla.foreign_key_constraints:
        destino = fk.elements[0].column.table
        resultado.add((tuple(c.name for c in fk.columns), destino.schema, destino.name, tuple(e.column.name for e in fk.elements)))
    return resultado


def _claves_foraneas_de_la_bd(inspector: Inspector, nombre: str, esquema: str) -> set[tuple]:
    return {
        (tuple(fk["constrained_columns"]), fk["referred_schema"], fk["referred_table"], tuple(fk["referred_columns"]))
        for fk in inspector.get_foreign_keys(nombre, schema=esquema)
    }


def comparar_tabla(tabla: Table, inspector: Inspector, *, es_vista: bool = False) -> list[str]:
    """Diferencias entre `tabla` (del modelo) y la que hay en la base."""
    nombre, esquema = tabla.name, tabla.schema
    etiqueta = f"{esquema}.{nombre}"
    try:
        reales = {c["name"]: c for c in inspector.get_columns(nombre, schema=esquema)}
    except NoSuchTableError:
        return [f"{etiqueta}: no existe en la base"]

    diferencias = []
    modeladas = {c.name: c for c in tabla.columns}

    for falta in sorted(set(reales) - set(modeladas)):
        diferencias.append(f"{etiqueta}.{falta}: está en la base y el modelo no la tiene")
    for sobra in sorted(set(modeladas) - set(reales)):
        diferencias.append(f"{etiqueta}.{sobra}: la tiene el modelo y no existe en la base")

    for columna in sorted(set(modeladas) & set(reales)):
        modelo, real = modeladas[columna], reales[columna]
        if familia(modelo.type) != familia(real["type"]):
            diferencias.append(f"{etiqueta}.{columna}: tipo {familia(modelo.type)} en el modelo y {familia(real['type'])} en la base")
        if _largo(modelo.type) != _largo(real["type"]):
            diferencias.append(f"{etiqueta}.{columna}: largo {_largo(modelo.type)} en el modelo y {_largo(real['type'])} en la base")
        if not es_vista:
            if bool(modelo.nullable) != bool(real["nullable"]):
                diferencias.append(f"{etiqueta}.{columna}: nulable={modelo.nullable} en el modelo y {real['nullable']} en la base")
            identidad_real = (real.get("identity") or {}).get("always")
            identidad_modelo = modelo.identity.always if modelo.identity is not None else None
            if identidad_real != identidad_modelo:
                diferencias.append(f"{etiqueta}.{columna}: identidad {identidad_modelo} en el modelo y {identidad_real} en la base")

    if not es_vista:
        clave_real = tuple(inspector.get_pk_constraint(nombre, schema=esquema)["constrained_columns"])
        clave_modelo = tuple(c.name for c in tabla.primary_key.columns)
        if clave_real != clave_modelo:
            diferencias.append(f"{etiqueta}: clave primaria {clave_modelo} en el modelo y {clave_real} en la base")

        fk_modelo, fk_real = _claves_foraneas_del_modelo(tabla), _claves_foraneas_de_la_bd(inspector, nombre, esquema)
        for fk in sorted(fk_real - fk_modelo, key=str):
            diferencias.append(f"{etiqueta}: la base tiene la clave foránea {fk} y el modelo no")
        for fk in sorted(fk_modelo - fk_real, key=str):
            diferencias.append(f"{etiqueta}: el modelo declara la clave foránea {fk} y la base no")

    return diferencias


def tablas_de_la_bd(inspector: Inspector, esquema: str) -> tuple[set[str], set[str]]:
    """(tablas, vistas) que hay en un esquema."""
    return set(inspector.get_table_names(schema=esquema)), set(inspector.get_view_names(schema=esquema))
