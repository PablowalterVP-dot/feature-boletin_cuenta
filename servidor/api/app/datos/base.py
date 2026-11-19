"""Base declarativa y lo que comparten todas las tablas de Alejandro.

Los modelos **reflejan** un esquema que no es nuestro: no lo crean ni generan
DDL (no hay Alembic). Por eso no declaran las restricciones, los índices
parciales ni los disparadores: viven en `servidor/api/bd/`. Una prueba
(`prueba_modelos_vs_bd.py`) comprueba que cada modelo sigue coincidiendo con la
tabla real, para que un cambio de Alejandro no pase inadvertido.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, DateTime, event, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ControlFechas:
    """Las tres columnas de control que lleva **toda** tabla de Alejandro.

    Las llenan sus disparadores (`02_auditoria.sql`), no la aplicación: al
    insertar, `fecha_creacion` es `now()`; al actualizar, `fecha_actualizacion`
    es `now()` y `fecha_creacion` no se reescribe. Quién hizo el cambio no está
    aquí sino en `auditoria.registro_cambio`.

    `fecha_eliminacion` es el **borrado lógico**: una fila con ella llena sigue
    en la tabla pero no existe. Ninguna consulta debe olvidarlo; usa `vigente()`.
    """

    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    fecha_actualizacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fecha_eliminacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


def vigente(modelo: Any) -> ColumnElement[bool]:
    """Condición «no está eliminada lógicamente». Va en **cada** consulta:

        select(Usuario).where(vigente(Usuario), Usuario.es_activo)

    Por eso los modelos no declaran relaciones (`relationship`): cargarían filas
    eliminadas sin filtrarlas, en silencio.
    """
    return modelo.fecha_eliminacion.is_(None)


def solo_lectura(modelo: type) -> type:
    """Marca un modelo de una vista: escribirlo sería un error de programación."""

    def rechazar(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError(f"{modelo.__name__} es una vista de solo lectura: no se inserta, actualiza ni borra.")

    for evento in ("before_insert", "before_update", "before_delete"):
        event.listen(modelo, evento, rechazar)
    return modelo
