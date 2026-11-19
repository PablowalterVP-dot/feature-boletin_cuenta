"""Esquema `seguridad` de Alejandro: quién entra y qué puede hacer.

    usuario ─< usuario_rol >─ rol ─< rol_permiso >─ permiso
                   └── unidad_organica (el ámbito; nulo = global)

Un usuario tiene roles **atados a una unidad** (`digitador` de Nutrición) o
globales (`revisor` de Estadística). Epidemiología, que reporta y recibe, es un
usuario con dos asignaciones sobre su unidad. Qué puede hacer cada asignación lo
dice `v_permiso_usuario`, que es lo que consulta el backend.
"""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Identity, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.datos.base import Base, ControlFechas, solo_lectura

_ESQUEMA = {"schema": "seguridad"}


class Usuario(ControlFechas, Base):
    __tablename__ = "usuario"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    # Único sin distinguir mayúsculas (índice sobre lower()) y solo entre las
    # filas no eliminadas: se busca con func.lower(), no con ==.
    nombre_usuario: Mapped[str] = mapped_column(String(60))
    correo: Mapped[str | None] = mapped_column(String(150))
    # Hash Argon2id. El sembrado del superadmin trae `POR_ASIGNAR`, que no es un
    # hash: nadie entra con esa cuenta hasta asignarle una contraseña.
    contrasena_hash: Mapped[str] = mapped_column(String(255))
    nombres: Mapped[str] = mapped_column(String(100))
    apellidos: Mapped[str] = mapped_column(String(100))
    numero_documento: Mapped[str | None] = mapped_column(String(20))
    cargo: Mapped[str | None] = mapped_column(String(150))
    # Número de contacto del responsable (migración 0009). Opcional.
    telefono: Mapped[str | None] = mapped_column(String(20))
    es_activo: Mapped[bool] = mapped_column(Boolean, server_default="true")
    debe_cambiar_contrasena: Mapped[bool] = mapped_column(Boolean, server_default="true")
    fecha_ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}".strip()


class Rol(ControlFechas, Base):
    """superadmin, admin, digitador, revisor y consulta."""

    __tablename__ = "rol"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(40))
    nombre: Mapped[str] = mapped_column(String(80))
    descripcion: Mapped[str | None] = mapped_column(Text)
    # 'global' (sin unidad), 'unidad' (siempre con unidad) o 'ambos'. Lo impone
    # un disparador de la BD al asignar el rol.
    alcance: Mapped[str] = mapped_column(String(10))
    es_sistema: Mapped[bool] = mapped_column(Boolean, server_default="false")


class Permiso(ControlFechas, Base):
    """Una acción autorizable: `<modulo>.<accion>`, p. ej. `reporte.enviar`."""

    __tablename__ = "permiso"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(80))
    modulo: Mapped[str] = mapped_column(String(40))
    descripcion: Mapped[str | None] = mapped_column(Text)


class RolPermiso(ControlFechas, Base):
    __tablename__ = "rol_permiso"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rol_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("seguridad.rol.id"))
    permiso_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("seguridad.permiso.id"))


class UsuarioRol(ControlFechas, Base):
    """Un rol de un usuario, en una unidad (o global si `unidad_organica_id` es nulo)."""

    __tablename__ = "usuario_rol"
    __table_args__ = _ESQUEMA

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("seguridad.usuario.id"))
    rol_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("seguridad.rol.id"))
    unidad_organica_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("organizacion.unidad_organica.id"))


@solo_lectura
class PermisoUsuario(Base):
    """Vista `seguridad.v_permiso_usuario`: los permisos **efectivos** de cada
    usuario y el ámbito en que los tiene (`unidad_organica_id` nulo = todo el
    sistema). Ya excluye usuarios inactivos o eliminados y todo lo eliminado
    lógicamente. Es lo que consulta la API para autorizar."""

    __tablename__ = "v_permiso_usuario"
    __table_args__ = _ESQUEMA

    # Una vista no tiene clave: la fila entera es la identidad (la vista es DISTINCT).
    usuario_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    unidad_organica_id: Mapped[int | None] = mapped_column(BigInteger, primary_key=True)
    rol_codigo: Mapped[str] = mapped_column(String(40), primary_key=True)
    permiso_codigo: Mapped[str] = mapped_column(String(80), primary_key=True)
