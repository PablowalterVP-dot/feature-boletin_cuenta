"""Escenarios de prueba para las transiciones de un reporte.

`montar_catalogo_de_ejemplo` deja a Nutrición en condiciones de recibir una carga
aceptada, igual que hace `06_prueba.sql`: carga el catálogo de EJEMPLO
(`07_ejemplo_nutricion.sql`) y le pone la configuración de lectura FICTICIA de `06` para
poder activar la estructura NUT-1. **Todo es ficticio**: sirve para probar el camino
feliz de `enviar`, que con el catálogo tal como se instala es imposible (sin versión
activa la base rechaza toda carga aceptada).
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datos.modelos import Archivo, Carga, Formato, FormatoVersion, Hallazgo, Indicador, Periodo, Permiso, Rol, RolPermiso, UnidadOrganica, Usuario, UsuarioRol
from app.datos.modelos import EstadoReporte, Remision, Reporte, Valor
from app.dominio.reloj import ZONA
from app.dominio.sesion import Asignacion, Sesion
from app.herramientas.bd import CARPETA_PRUEBAS

AHORA = datetime(2026, 9, 13, 12, 0, tzinfo=ZONA)

_INICIO_CONFIGURACION = "UPDATE formato.formato_version SET tipo_archivo = 'xlsx',"
_FIN_CONFIGURACION = "UPDATE formato.formato_version SET estado = 'activa' WHERE codigo_version = 'NUT-1';"


def _configuracion_de_06() -> str:
    texto = (CARPETA_PRUEBAS / "06_prueba.sql").read_text(encoding="utf-8")
    inicio = texto.find(_INICIO_CONFIGURACION)
    fin = texto.find(_FIN_CONFIGURACION, max(inicio, 0))
    assert inicio != -1 and fin != -1 and fin > inicio, (
        "No se encontró el bloque de configuración de lectura en 06_prueba.sql: "
        "¿cambió el script? Ajusta escenario.py."
    )
    return texto[inicio : fin + len(_FIN_CONFIGURACION)]


def _ejecutar(sesion: Session, sql: str) -> None:
    """Un script de varias sentencias por la conexión DBAPI de la sesión (`text()`
    interpretaría los `:` y `%` del SQL como parámetros), dentro de su transacción."""
    sesion.connection().connection.cursor().execute(sql)


def montar_catalogo_de_ejemplo(sesion: Session) -> None:
    """Activa NUT-1 con su catálogo de ejemplo. Idempotente por sesión: si ya está activa, no hace nada."""
    ya_activa = sesion.scalar(select(FormatoVersion.id).where(FormatoVersion.codigo_version == "NUT-1", FormatoVersion.estado == "activa"))
    if ya_activa:
        return
    _ejecutar(sesion, (CARPETA_PRUEBAS / "07_ejemplo_nutricion.sql").read_text(encoding="utf-8"))
    _ejecutar(sesion, _configuracion_de_06())
    sesion.expire_all()


# ------------------------------------------------------------------- personas


def crear_usuario(sesion: Session, nombre: str) -> Usuario:
    u = Usuario(nombre_usuario=nombre, contrasena_hash="x", nombres="Persona", apellidos=nombre.title(), es_activo=True, debe_cambiar_contrasena=False)
    sesion.add(u)
    sesion.flush()
    return u


def asignacion(sesion: Session, rol: str, unidad: str | None) -> Asignacion:
    """Una asignación con los permisos **reales** que la base da a ese rol."""
    permisos = frozenset(
        sesion.scalars(
            select(Permiso.codigo).join(RolPermiso, RolPermiso.permiso_id == Permiso.id).join(Rol, Rol.id == RolPermiso.rol_id).where(Rol.codigo == rol)
        )
    )
    return Asignacion(rol, unidad, permisos)


def sesion_de(usuario: Usuario, *asignaciones: Asignacion) -> Sesion:
    return Sesion(usuario.id, usuario.nombre_usuario, usuario.nombre_completo, tuple(asignaciones), False, AHORA, AHORA + timedelta(hours=8))


def digitador_de_nutricion(sesion: Session, nombre="dig.nut") -> Sesion:
    return sesion_de(crear_usuario(sesion, nombre), asignacion(sesion, "digitador", "nutricion"))


def revisor_de_estadistica(sesion: Session, nombre="rev.est") -> Sesion:
    return sesion_de(crear_usuario(sesion, nombre), asignacion(sesion, "revisor", None))


def consulta_de_planeamiento(sesion: Session, nombre="con.pla") -> Sesion:
    return sesion_de(crear_usuario(sesion, nombre), asignacion(sesion, "consulta", "planeamiento"))


def persona(sesion: Session, nombre: str, *asignaciones: tuple[str, str | None]) -> Sesion:
    """Una cuenta con las asignaciones `(rol, unidad)` dadas y los permisos reales de la base."""
    return sesion_de(crear_usuario(sesion, nombre), *(asignacion(sesion, rol, unidad) for rol, unidad in asignaciones))


# ------------------------------------------------------------------- reportes


def ids_de(sesion: Session) -> dict[str, int]:
    """Los estados vigentes. Los retirados el 12/10/2026 (enviado, en_revision,
    validado) no están: preparar un reporte en uno de ellos falla en lugar de dejar
    datos que el backend ya no sabe leer."""
    return dict(sesion.execute(select(EstadoReporte.codigo, EstadoReporte.id).where(EstadoReporte.fecha_eliminacion.is_(None))).all())


def reporte_de(sesion: Session, mes: int = 8, formato: str = "NUT") -> Reporte | None:
    return sesion.scalar(
        select(Reporte)
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .where(Formato.codigo == formato, Periodo.anio == 2026, Periodo.mes == mes)
    )


def dar_carga_aceptada(sesion: Session, reporte: Reporte, hallazgos=(), *, vigente=True) -> Carga:
    """Deja al reporte con una carga aceptada de la estructura activa, como la
    dejaría el bot. `hallazgos`: tuplas `(nivel, clave, titulo, justificacion)`."""
    montar_catalogo_de_ejemplo(sesion)
    version = sesion.scalar(select(FormatoVersion).where(FormatoVersion.codigo_version == "NUT-1", FormatoVersion.estado == "activa"))
    archivo = Archivo(nombre_original="Nutricion.xlsx", ruta_almacenamiento=f"cargas/{reporte.id}.xlsx", tamano_bytes=82311, huella_sha256="ab" * 32, proposito="carga")
    sesion.add(archivo)
    sesion.flush()
    carga = Carga(reporte_id=reporte.id, archivo_id=archivo.id, formato_version_id=version.id, version_bot="0.3.0", resultado="aceptada", casillas_leidas=1116, es_vigente=vigente)
    sesion.add(carga)
    sesion.flush()
    reporte.formato_version_id = version.id
    for nivel, clave, titulo, justificacion in hallazgos:
        sesion.add(Hallazgo(carga_id=carga.id, nivel=nivel, clave_hallazgo=clave, titulo=titulo, justificacion=justificacion))
    sesion.flush()
    return carga


def escribir_valor(
    sesion: Session, reporte: Reporte, indicador_codigo: str, dia: int | None = None, valor=None, *,
    carga: Carga | None = None, origen: str | None = None, texto_original: str | None = None,
    hoja_excel: str | None = None, celda_excel: str | None = None,
) -> Valor:
    """Una casilla directa, sin pasar por el bot (que sigue en 501). Sin `carga`, el
    origen es `manual` (la base exige carga para `archivo`: `ck_valor_carga`)."""
    origen = origen or ("archivo" if carga is not None else "manual")
    indicador_id = sesion.scalar(select(Indicador.id).where(Indicador.codigo == indicador_codigo))
    v = Valor(
        reporte_id=reporte.id, indicador_id=indicador_id, dia=dia, valor=valor, texto_original=texto_original,
        origen=origen, carga_id=carga.id if carga else None, hoja_excel=hoja_excel, celda_excel=celda_excel,
    )
    sesion.add(v)
    sesion.flush()
    return v


def id_de_unidad(sesion: Session, clave: str) -> int:
    return sesion.scalar(select(UnidadOrganica.id).where(UnidadOrganica.clave == clave))


# --------------------------------------- otras áreas: formatos y reportes ficticios


def crear_formato(sesion: Session, unidad: str, codigo: str, *, activo: bool = True) -> Formato:
    """Un formato **ficticio** para un área que en la base instalada no tiene ninguno
    (solo Nutrición trae uno). Sirve para probar la lista con varias áreas."""
    f = Formato(unidad_organica_id=id_de_unidad(sesion, unidad), codigo=codigo, nombre=f"Formato {codigo}", granularidad="mensual", es_activo=activo)
    sesion.add(f)
    sesion.flush()
    return f


def abrir_reporte(sesion: Session, formato: str, mes: int, estado: str, *, numero_rectificacion: int = 0, fecha_envio: datetime | None = None, folio: str | None = None) -> Reporte:
    """Un reporte de 2026 directamente en el estado dado, sin pasar por el flujo: es
    para preparar datos, no para probar transiciones."""
    r = Reporte(
        formato_id=sesion.scalar(select(Formato.id).where(Formato.codigo == formato)),
        periodo_id=sesion.scalar(select(Periodo.id).where(Periodo.anio == 2026, Periodo.mes == mes)),
        estado_reporte_id=ids_de(sesion)[estado], numero_rectificacion=numero_rectificacion, fecha_envio=fecha_envio, folio_constancia=folio,
    )
    sesion.add(r)
    sesion.flush()
    return r


def remitir_a(sesion: Session, reporte: Reporte, oficina: str, *, sin_validar: bool = False, es_vigente: bool = True, numero_rectificacion: int = 0) -> Remision:
    rem = Remision(reporte_id=reporte.id, unidad_destino_id=id_de_unidad(sesion, oficina), es_sin_validar=sin_validar, es_vigente=es_vigente, numero_rectificacion=numero_rectificacion)
    sesion.add(rem)
    sesion.flush()
    return rem
