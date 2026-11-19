"""Los modelos de `seguridad` y `organizacion` leyendo y escribiendo la base de Alejandro."""

from datetime import date, datetime

import pytest
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import DBAPIError

from app.datos.base import Base, vigente
from app.datos.modelos import Destino, Parametro, Periodo, Permiso, PermisoUsuario, Rol, RolPermiso, UnidadOrganica, Usuario, UsuarioRol
from app.dominio import periodos, roles
from app.seguridad import hashear_clave

pytestmark = pytest.mark.bd


def unidad(sesion, codigo: str) -> UnidadOrganica:
    return sesion.scalar(select(UnidadOrganica).where(UnidadOrganica.codigo == codigo))


def rol(sesion, codigo: str) -> Rol:
    return sesion.scalar(select(Rol).where(Rol.codigo == codigo))


def crear_usuario(sesion, nombre="ana", asignaciones=(("digitador", "NUT"),), **extra) -> Usuario:
    u = Usuario(nombre_usuario=nombre, contrasena_hash="x", nombres="Ana", apellidos="Prueba", **extra)
    sesion.add(u)
    sesion.flush()
    for codigo_rol, codigo_unidad in asignaciones:
        destino = unidad(sesion, codigo_unidad).id if codigo_unidad else None
        sesion.add(UsuarioRol(usuario_id=u.id, rol_id=rol(sesion, codigo_rol).id, unidad_organica_id=destino))
    sesion.flush()
    return u


# ------------------------------------------------------------ la semilla, leída por los modelos


def prueba_los_modelos_leen_los_roles_permisos_y_unidades_sembrados(sesion):
    assert {r.codigo for r in sesion.scalars(select(Rol).where(vigente(Rol)))} == {"superadmin", "admin", "digitador", "revisor", "consulta", "planeamiento", *roles.ROLES_DE_HOSPITALIZACION}
    # 15 de la semilla base, más reporte.eliminar (0008). monitoreo.registrar (0006) es del módulo desempeno.
    assert sesion.scalar(select(func.count()).select_from(Permiso).where(vigente(Permiso), Permiso.modulo.not_in(("desempeno", "planeamiento", "hospitalizacion")))) == 16
    assert sesion.scalar(select(func.count()).select_from(Permiso).where(vigente(Permiso), Permiso.modulo == "planeamiento")) == 2
    assert sesion.scalar(select(func.count()).select_from(UnidadOrganica).where(vigente(UnidadOrganica))) == 20  # 15 sin Mantenimiento, más 6 de hospitalización
    assert sesion.scalar(select(func.count()).select_from(RolPermiso).where(vigente(RolPermiso))) > 0


def prueba_la_unidad_se_encuentra_por_su_clave_de_api(sesion):
    nut = sesion.scalar(select(UnidadOrganica).where(UnidadOrganica.clave == "nutricion"))
    assert (nut.codigo, nut.tipo, nut.es_reportante, nut.es_receptora) == ("NUT", "departamento", True, False)


def prueba_epidemiologia_reporta_y_recibe_y_estadistica_es_la_unica_central(sesion):
    epi = unidad(sesion, "EPI")
    assert epi.es_reportante and epi.es_receptora
    centrales = sesion.scalars(select(UnidadOrganica).where(UnidadOrganica.es_estadistica)).all()
    assert [u.codigo for u in centrales] == ["EST"]


def prueba_la_matriz_de_destinos_es_la_del_prototipo(sesion):
    filas = sesion.execute(
        select(UnidadOrganica.codigo, Destino.es_entrega_inmediata, Destino.unidad_destino_id)
        .join(Destino, Destino.unidad_origen_id == UnidadOrganica.id)
        .where(vigente(Destino))
    ).all()
    codigos = {u.id: u.codigo for u in sesion.scalars(select(UnidadOrganica))}
    pares = sorted((origen, codigos[destino]) for origen, _, destino in filas)
    # La matriz del prototipo, sin el destino de Mantenimiento (seeder 0004) y con las
    # nueve áreas yendo a Planeamiento (seeder 0005).
    assert len(pares) == 13
    assert {o for o, d in pares if d == "PLA"} == {"FAR", "NEF", "EPI", "LAB", "GIN", "CQX", "LAV", "NUT", "DXI"}
    assert not [o for o, _ in pares if o == "MTO"]
    assert ("NUT", "PLA") in pares and ("DXI", "CTE") in pares and ("NEF", "DG") in pares
    assert [o for o, inmediata, _ in filas if inmediata] == ["NUT"]  # solo Nutrición entrega sin esperar


def prueba_los_plazos_guardados_en_periodo_coinciden_con_el_dominio(sesion):
    """La BD guarda el plazo de cada mes; el dominio lo calcula. Si Alejandro
    cambiara uno, esta prueba lo dice."""
    todos = sesion.scalars(select(Periodo).where(vigente(Periodo))).all()
    assert len(todos) == 12
    for p in todos:
        clave = f"{p.anio}-{p.mes:02d}"
        assert p.fecha_limite_entrega == periodos.plazo_de(clave), clave
        # DIRESA: día 15 del mes siguiente (supuesto del prototipo, por confirmar).
        assert p.fecha_limite_remision == date.fromisoformat(f"{periodos.mes_siguiente(clave)}-15"), clave
        assert p.fecha_fin.day >= 28 and p.fecha_inicio.day == 1


def prueba_el_dia_limite_de_entrega_es_el_mismo_que_usa_el_dominio(sesion):
    valor = sesion.scalar(select(Parametro.valor).where(Parametro.clave == "periodo.dia_limite_entrega"))
    assert int(valor) == periodos.DIA_PLAZO


# ----------------------------------------------------- lo que llenan los disparadores


def prueba_las_fechas_de_control_las_llena_la_bd_no_la_aplicacion(sesion):
    u = crear_usuario(sesion, asignaciones=())
    sesion.refresh(u)
    assert isinstance(u.fecha_creacion, datetime) and u.fecha_creacion.tzinfo is not None
    assert u.fecha_actualizacion is None and u.fecha_eliminacion is None
    creada = u.fecha_creacion

    u.cargo = "Jefatura"
    sesion.flush()
    sesion.refresh(u)
    assert u.fecha_actualizacion is not None
    assert u.fecha_creacion == creada  # la fecha de creación no se reescribe nunca


def prueba_los_valores_por_omision_de_un_usuario_nuevo(sesion):
    u = crear_usuario(sesion, asignaciones=())
    sesion.refresh(u)
    assert u.es_activo is True and u.debe_cambiar_contrasena is True and u.fecha_ultimo_acceso is None
    assert u.nombre_completo == "Ana Prueba"


def prueba_una_fila_ya_eliminada_no_se_puede_insertar(sesion):
    with pytest.raises(DBAPIError, match="ya eliminado"):
        with sesion.begin_nested():
            sesion.add(Usuario(nombre_usuario="fantasma", contrasena_hash="x", nombres="A", apellidos="B", fecha_eliminacion=datetime.now().astimezone()))
            sesion.flush()


# ---------------------------------------------------------------- borrado lógico


def prueba_una_consulta_sin_vigente_ve_lo_eliminado_y_con_vigente_no(sesion):
    u = crear_usuario(sesion, "borrable", asignaciones=())
    u.fecha_eliminacion = func.now()
    sesion.flush()
    todos = sesion.scalars(select(Usuario).where(Usuario.nombre_usuario == "borrable")).all()
    assert len(todos) == 1  # sigue en la tabla
    assert sesion.scalars(select(Usuario).where(Usuario.nombre_usuario == "borrable", vigente(Usuario))).all() == []


def prueba_tras_eliminar_a_un_usuario_su_nombre_se_puede_reutilizar(sesion):
    """El índice único del nombre solo cuenta las filas no eliminadas."""
    viejo = crear_usuario(sesion, "reutil", asignaciones=())
    viejo.fecha_eliminacion = func.now()
    sesion.flush()
    crear_usuario(sesion, "reutil", asignaciones=())  # no lanza


def prueba_el_nombre_de_usuario_es_unico_sin_distinguir_mayusculas(sesion):
    crear_usuario(sesion, "Mixta", asignaciones=())
    with pytest.raises(DBAPIError, match="uq_usuario_nombre_usuario"):
        with sesion.begin_nested():
            crear_usuario(sesion, "MIXTA", asignaciones=())


def prueba_el_inicio_de_sesion_busca_por_lower_y_solo_entre_los_vigentes(sesion):
    crear_usuario(sesion, "Ana.Perez", asignaciones=())
    encontrado = sesion.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == "ana.perez", vigente(Usuario)))
    assert encontrado is not None and encontrado.nombre_usuario == "Ana.Perez"


# ------------------------------------------------------------------- auditoría


def prueba_la_bitacora_registra_quien_hizo_el_cambio_si_el_backend_lo_dice(sesion):
    """La BD no sabe quién actúa: el backend lo fija con `set_config` en cada
    transacción. Sin él, la bitácora guarda el cambio sin usuario."""
    jefe = crear_usuario(sesion, "jefe", asignaciones=())
    sesion.execute(text("SELECT set_config('app.usuario_id', :id, true), set_config('app.direccion_ip', '10.0.0.7', true)"), {"id": str(jefe.id)})
    otro = crear_usuario(sesion, "otro", asignaciones=())
    fila = sesion.execute(
        text("SELECT operacion, usuario_id, host(direccion_ip) FROM auditoria.registro_cambio WHERE tabla = 'usuario' AND registro_id = :id"), {"id": otro.id}
    ).one()
    assert tuple(fila) == ("INSERTAR", jefe.id, "10.0.0.7")


def prueba_la_bitacora_nunca_guarda_el_hash_de_la_contrasena(sesion):
    u = crear_usuario(sesion, "secreto", asignaciones=())
    u.contrasena_hash = hashear_clave("una-clave-nueva")
    sesion.flush()
    datos = sesion.execute(text("SELECT COALESCE(datos_anteriores::text, '') || COALESCE(datos_nuevos::text, '') FROM auditoria.registro_cambio WHERE tabla = 'usuario' AND registro_id = :id"), {"id": u.id}).scalars().all()
    assert datos and all("contrasena_hash" not in d and "argon2" not in d for d in datos)


def prueba_la_bitacora_es_inmutable(sesion):
    crear_usuario(sesion, asignaciones=())
    with pytest.raises(DBAPIError, match="no se modifica ni se borra"):
        with sesion.begin_nested():
            sesion.execute(text("DELETE FROM auditoria.registro_cambio"))


# ----------------------------------------------------- la vista de permisos efectivos


def _permisos_de(sesion, usuario: Usuario) -> dict[tuple[str, int | None], set[str]]:
    """{(rol, unidad_id): {permisos}} tal como los ve el backend."""
    resultado: dict[tuple[str, int | None], set[str]] = {}
    for fila in sesion.scalars(select(PermisoUsuario).where(PermisoUsuario.usuario_id == usuario.id)):
        resultado.setdefault((fila.rol_codigo, fila.unidad_organica_id), set()).add(fila.permiso_codigo)
    return resultado


def prueba_un_digitador_de_nutricion_puede_cargar_y_enviar_pero_solo_en_su_unidad(sesion):
    u = crear_usuario(sesion, asignaciones=(("digitador", "NUT"),))
    permisos = _permisos_de(sesion, u)
    assert list(permisos) == [("digitador", unidad(sesion, "NUT").id)]
    assert permisos[("digitador", unidad(sesion, "NUT").id)] == {"reporte.ver", "reporte.descargar", "reporte.cargar", "reporte.enviar"}


def prueba_el_revisor_es_global_y_valida_remite_y_rectifica(sesion):
    u = crear_usuario(sesion, "rev", asignaciones=(("revisor", None),))
    (clave, permisos), = _permisos_de(sesion, u).items()
    assert clave == ("revisor", None)  # unidad nula: en todo el sistema
    assert {"reporte.revisar", "reporte.validar", "reporte.remitir", "reporte.rectificar", "remision.externa"} <= permisos
    assert "reporte.enviar" not in permisos  # Estadística no envía: recibe


def prueba_epidemiologia_es_un_usuario_con_dos_asignaciones_sobre_su_unidad(sesion):
    u = crear_usuario(sesion, "epi", asignaciones=(("digitador", "EPI"), ("consulta", "EPI")))
    epi = unidad(sesion, "EPI").id
    permisos = _permisos_de(sesion, u)
    assert set(permisos) == {("digitador", epi), ("consulta", epi)}
    assert "reporte.enviar" in permisos[("digitador", epi)] and "reporte.enviar" not in permisos[("consulta", epi)]


def prueba_la_vista_ya_excluye_lo_inactivo_y_lo_eliminado(sesion):
    u = crear_usuario(sesion, "temp", asignaciones=(("digitador", "NUT"), ("consulta", "PLA")))
    assert len(_permisos_de(sesion, u)) == 2

    # Una asignación eliminada lógicamente deja de dar permisos.
    asignacion = sesion.scalar(select(UsuarioRol).where(UsuarioRol.usuario_id == u.id, UsuarioRol.rol_id == rol(sesion, "consulta").id))
    asignacion.fecha_eliminacion = func.now()
    sesion.flush()
    assert list(_permisos_de(sesion, u)) == [("digitador", unidad(sesion, "NUT").id)]

    # Un usuario desactivado no tiene ninguno.
    u.es_activo = False
    sesion.flush()
    assert _permisos_de(sesion, u) == {}


def prueba_la_bd_impone_el_alcance_del_rol_al_asignarlo(sesion):
    """Un rol global no se ata a una unidad y uno de unidad la exige: lo rechaza
    un disparador, no el backend."""
    u = crear_usuario(sesion, "mal", asignaciones=())
    with pytest.raises(DBAPIError, match="es global"):
        with sesion.begin_nested():
            sesion.add(UsuarioRol(usuario_id=u.id, rol_id=rol(sesion, "revisor").id, unidad_organica_id=unidad(sesion, "EST").id))
            sesion.flush()
    with pytest.raises(DBAPIError, match="falta unidad_organica_id"):
        with sesion.begin_nested():
            sesion.add(UsuarioRol(usuario_id=u.id, rol_id=rol(sesion, "digitador").id, unidad_organica_id=None))
            sesion.flush()


def prueba_la_vista_es_de_solo_lectura(sesion):
    with pytest.raises(RuntimeError, match="vista de solo lectura"):
        sesion.add(PermisoUsuario(usuario_id=1, unidad_organica_id=None, rol_codigo="x", permiso_codigo="y"))
        sesion.flush()
    sesion.rollback()


# ------------------------------------------------------------------- criterios de diseño


def prueba_los_modelos_no_declaran_relaciones_porque_cargarian_filas_eliminadas(sesion):
    for mapper in Base.registry.mappers:
        assert list(inspect(mapper.class_).relationships) == [], mapper.class_.__name__
