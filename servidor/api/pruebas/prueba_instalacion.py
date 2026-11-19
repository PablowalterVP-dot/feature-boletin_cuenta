"""La base instalada por las pruebas mediante migraciones y seeders, contra PostgreSQL real.

Comprueba que lo que instalan las migraciones y seeders coincide con el diseño
del sistema, el registro de control (`public.migraciones` y `public.seeders`) y
las salvaguardas de la propia instalación de pruebas.
"""

import os
import shutil
import subprocess

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError

from app.datos.sesion import crear_motor
from app.herramientas import bd as gestor_bd
from app.dominio import permisos as permisos_dominio
from app.seguridad import verificar_clave
from conftest import CARPETA_PRUEBAS, detectar_ajenos

pytestmark = pytest.mark.bd


def uno(sesion, sql: str):
    return sesion.execute(text(sql)).scalar()


# ------------------------------------------------------------ lo instalado


def prueba_la_instalacion_deja_lo_que_dice_el_informe(sesion):
    """35 tablas (las 33 de INFORME_AVANCE_04, § 3.2, y las dos de la migración 0010), 10 vistas, 58 FK y 79 disparadores."""
    esquemas = "('seguridad','organizacion','formato','reporte','auditoria')"
    assert uno(sesion, f"SELECT count(*) FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema IN {esquemas}") == 35
    assert uno(sesion, f"SELECT count(*) FROM information_schema.views WHERE table_schema IN {esquemas}") == 10
    assert uno(sesion, f"SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND connamespace::regnamespace::text IN {esquemas}") == 58
    assert uno(sesion, f"SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace::regnamespace::text IN {esquemas}") == 79


def prueba_migraciones_y_seeders_quedan_registrados_en_tablas_de_control(sesion):
    estados = gestor_bd.obtener_estado(sesion)
    # Los seeders en Python activan formatos completos: las pruebas se instalan sin ellos.
    en_sql = [e for e in estados if not e.nombre.endswith(".py")]
    assert all(e.ejecutado and not e.modificado and e.lote == 1 for e in en_sql)
    assert [e.nombre for e in estados if e.tipo == "migracion"] == [p.name for p in gestor_bd.archivos_migraciones()]
    assert [e.nombre for e in estados if e.tipo == "seeder"] == [p.name for p in gestor_bd.archivos_seeders()]
    # Correr migrar o sembrar de nuevo cuando todo está al día no aplica nada
    assert gestor_bd.migrar(sesion) == []
    assert gestor_bd.sembrar(sesion, con_catalogos=False) == []
    tabla_txt = gestor_bd.formatear_estado(estados)
    assert "0001_esquema_base.sql" in tabla_txt and "0001_semilla_base.sql" in tabla_txt and "Ejecutado" in tabla_txt


def prueba_seeder_opcional_de_usuarios_crea_las_14_cuentas_con_clave_y_roles_y_es_idempotente(sesion):
    assert gestor_bd.sembrar_opcional(sesion, "usuarios_areas.sql") == ["usuarios_areas.sql"]
    # Segunda corrida sin forzar: se niega por seguridad para no sobreescribir claves
    with pytest.raises(gestor_bd.ErrorMigracion, match="ya fue aplicado previamente"):
        gestor_bd.sembrar_opcional(sesion, "usuarios_areas.sql")
    # Con forzar: se permite reejecutar
    assert gestor_bd.sembrar_opcional(sesion, "usuarios_areas.sql", forzar=True) == ["usuarios_areas.sql"]

    esperados = {
        "superadmin", "estadistica", "farmacia", "nefrologia", "epidemiologia",
        "laboratorio", "ginecologia", "centroquirurgico", "lavanderia", "nutricion",
        "imagenes", "planeamiento", "cuerpotecnico", "direccion",
    }  # sin Mantenimiento, que no reporta
    filas = sesion.execute(
        text("SELECT nombre_usuario, contrasena_hash, debe_cambiar_contrasena, es_activo FROM seguridad.usuario WHERE fecha_eliminacion IS NULL")
    ).all()
    assert {f[0] for f in filas} == esperados
    assert all(f[2] is False and f[3] is True for f in filas)
    assert verificar_clave("1234567890", filas[0][1])

    # Epidemiología tiene doble rol (digitador y consulta sobre EPI)
    roles_epi = set(
        sesion.execute(
            text(
                "SELECT r.codigo, uo.codigo FROM seguridad.usuario_rol ur "
                "JOIN seguridad.usuario u ON u.id = ur.usuario_id "
                "JOIN seguridad.rol r ON r.id = ur.rol_id "
                "JOIN organizacion.unidad_organica uo ON uo.id = ur.unidad_organica_id "
                "WHERE u.nombre_usuario = 'epidemiologia' AND ur.fecha_eliminacion IS NULL"
            )
        ).all()
    )
    assert roles_epi == {("digitador", "EPI"), ("consulta", "EPI")}


def prueba_detecta_si_una_migracion_ya_aplicada_fue_modificada(sesion):
    sesion.execute(text("UPDATE public.migraciones SET hash_sha256 = :h WHERE nombre = '0001_esquema_base.sql'"), {"h": "0" * 64})
    estados = gestor_bd.obtener_estado(sesion)
    primero = next(e for e in estados if e.nombre == "0001_esquema_base.sql")
    assert primero.modificado is True
    with pytest.raises(gestor_bd.ErrorMigracion, match="ya fue ejecutado en la base pero su contenido cambió"):
        gestor_bd.migrar(sesion)


def prueba_base_preexistente_sin_tablas_de_control_adopta_lote_cero_y_aplica_solo_faltantes(sesion):
    """Simula un servidor existente (ej. Coolify) donde los esquemas y datos ya
    existen pero nunca existieron `public.migraciones` ni `public.seeders`, y
    donde falta aplicar una migración nueva (`0007_farmacia_word.sql`)."""
    sesion.execute(
        text(
            "INSERT INTO seguridad.usuario (nombre_usuario, contrasena_hash, debe_cambiar_contrasena, nombres, apellidos) "
            "VALUES ('usuario.existente', 'hash_intacto_coolify', FALSE, 'Usuario', 'Existente')"
        )
    )
    # Revertimos la restricción de 0007 para simular que esa migración aún no estaba en el servidor
    sesion.execute(
        text(
            "ALTER TABLE formato.formato_version DROP CONSTRAINT ck_formato_version_tipo, "
            "ADD CONSTRAINT ck_formato_version_tipo CHECK (tipo_archivo IS NULL OR tipo_archivo IN ('xlsx', 'xls', 'csv'))"
        )
    )
    sesion.execute(text("DROP TABLE public.migraciones, public.seeders"))

    migradas = gestor_bd.migrar(sesion)
    sembradas = gestor_bd.sembrar(sesion)

    # 0008 ya estaba (su sonda la adopta): solo falta 0007.
    assert migradas == ["0007_farmacia_word.sql"]
    assert sembradas == []

    estados = {e.nombre: e for e in gestor_bd.obtener_estado(sesion)}
    assert estados["0001_esquema_base.sql"].lote == 0
    assert estados["0006_desempeno_tablero.sql"].lote == 0
    assert estados["0007_farmacia_word.sql"].lote == 1
    assert estados["0001_semilla_base.sql"].lote == 0
    assert estados["0002_flujo_entrega_directa.sql"].lote == 0
    assert estados["0003_desempeno_catalogos.sql"].lote == 0

    # El usuario preexistente permanece intacto
    clave = sesion.execute(
        text("SELECT contrasena_hash FROM seguridad.usuario WHERE nombre_usuario = 'usuario.existente'")
    ).scalar()
    assert clave == "hash_intacto_coolify"


def prueba_estan_las_dos_vistas_que_necesita_el_backend(sesion):
    assert uno(sesion, "SELECT to_regclass('seguridad.v_permiso_usuario') IS NOT NULL")
    assert uno(sesion, "SELECT to_regclass('formato.v_configuracion_lectura') IS NOT NULL")


def prueba_la_semilla_trae_roles_permisos_y_unidades(sesion):
    # 0011 retira `validador_hospitalizacion` (borrado lógico): Estadística lo tiene en `revisor`.
    roles = dict(sesion.execute(text("SELECT codigo, alcance FROM seguridad.rol WHERE fecha_eliminacion IS NULL")).all())
    assert roles == {"superadmin": "global", "admin": "unidad", "digitador": "unidad", "revisor": "global", "consulta": "ambos", "planeamiento": "global",
                     "enfermeria": "unidad", "jefe_departamento": "unidad", "admision": "global", "control_camas": "global", "mantenimiento_camas": "global"}
    assert uno(sesion, "SELECT count(*) FROM seguridad.rol WHERE codigo = 'validador_hospitalizacion' AND fecha_eliminacion IS NOT NULL") == 1
    # 15 de la semilla base, más reporte.eliminar (0008). monitoreo.registrar (0006) es del módulo desempeno.
    assert uno(sesion, "SELECT count(*) FROM seguridad.permiso WHERE modulo NOT IN ('desempeno', 'planeamiento', 'hospitalizacion')") == 16
    assert uno(sesion, "SELECT count(*) FROM seguridad.permiso WHERE modulo = 'planeamiento'") == 2
    assert uno(sesion, "SELECT count(*) FROM seguridad.permiso WHERE modulo = 'hospitalizacion'") == 7
    # La semilla trae 15 unidades y 10 que reportan; 0004 retira Mantenimiento
    # (borrado lógico): la fila sigue, pero ya no reporta ni tiene destino vigente.
    # 0009 suma seis de hospitalización, que no reportan ni reciben.
    assert uno(sesion, "SELECT count(*) FROM organizacion.unidad_organica") == 21
    assert uno(sesion, "SELECT count(*) FROM organizacion.unidad_organica WHERE es_reportante") == 9
    assert uno(sesion, "SELECT count(*) FROM organizacion.unidad_organica WHERE fecha_eliminacion IS NULL") == 20
    # 0005_planeamiento suma tres: Gineco-Obstetricia, Lavandería y Epidemiología van a Planeamiento.
    assert uno(sesion, "SELECT count(*) FROM organizacion.destino") == 14
    assert uno(sesion, "SELECT count(*) FROM organizacion.destino WHERE fecha_eliminacion IS NULL") == 13
    assert uno(sesion, "SELECT count(*) FROM organizacion.periodo") == 12


def prueba_epidemiologia_reporta_y_recibe_y_estadistica_es_una_sola(sesion):
    epi = sesion.execute(text("SELECT es_reportante, es_receptora FROM organizacion.unidad_organica WHERE clave = 'epidemiologia'")).one()
    assert tuple(epi) == (True, True)
    assert uno(sesion, "SELECT count(*) FROM organizacion.unidad_organica WHERE es_estadistica") == 1


def prueba_el_superadmin_sembrado_no_puede_entrar_hasta_que_se_le_asigne_clave(sesion):
    hash_guardado, debe_cambiar = sesion.execute(
        text("SELECT contrasena_hash, debe_cambiar_contrasena FROM seguridad.usuario WHERE nombre_usuario = 'superadmin'")
    ).one()
    assert hash_guardado == "POR_ASIGNAR" and debe_cambiar is True


def prueba_la_bd_deja_a_cada_rol_los_permisos_que_dice_la_semilla(sesion):
    permisos = {}
    for rol, permiso in sesion.execute(
        text(
            "SELECT r.codigo, p.codigo FROM seguridad.rol_permiso rp JOIN seguridad.rol r ON r.id = rp.rol_id JOIN seguridad.permiso p ON p.id = rp.permiso_id"
            " WHERE rp.fecha_eliminacion IS NULL AND r.fecha_eliminacion IS NULL"
        )
    ):
        permisos.setdefault(rol, set()).add(permiso)
    # 15 de la semilla base, más monitoreo.registrar (0006) y reporte.eliminar (0008).
    assert len({p for p in permisos["superadmin"] if not p.startswith(("desempeno.", "actividad.", "hospitalizacion."))}) == 17
    assert {p for p in permisos["superadmin"] if p.startswith("hospitalizacion.")} == set(permisos_dominio.HOSPITALIZACION)
    assert permisos["enfermeria"] == {"hospitalizacion.ver", "hospitalizacion.operar"}
    assert "validador_hospitalizacion" not in permisos, "retirado en 0011"
    assert {p for p in permisos["revisor"] if p.startswith("hospitalizacion.")} == {"hospitalizacion.ver", "hospitalizacion.validar"}, "Estadística lo tiene por ser revisor (0011)"
    assert permisos["planeamiento"] == {"reporte.ver", "reporte.descargar", "actividad.ver", "actividad.registrar"}
    assert {"reporte.cargar", "reporte.enviar"} <= permisos["digitador"] and "reporte.validar" not in permisos["digitador"]
    assert {"reporte.revisar", "reporte.validar", "reporte.remitir", "reporte.rectificar"} <= permisos["revisor"]
    assert permisos["consulta"] == {"reporte.ver", "reporte.descargar"}


def prueba_la_bd_impone_el_alcance_de_los_roles(sesion):
    """Un rol global no se ata a una unidad: lo rechaza el disparador de la BD,
    no el backend."""
    sesion.execute(text("INSERT INTO seguridad.usuario (nombre_usuario, contrasena_hash, nombres, apellidos) VALUES ('prueba.alcance', 'x', 'A', 'B')"))
    with pytest.raises(DBAPIError, match="es global"):
        with sesion.begin_nested():
            sesion.execute(
                text(
                    "INSERT INTO seguridad.usuario_rol (usuario_id, rol_id, unidad_organica_id) "
                    "SELECT u.id, r.id, uo.id FROM seguridad.usuario u, seguridad.rol r, organizacion.unidad_organica uo "
                    "WHERE u.nombre_usuario = 'prueba.alcance' AND r.codigo = 'revisor' AND uo.codigo = 'EST'"
                )
            )


def prueba_lo_que_hace_una_prueba_no_persiste(sesion, motor_bd):
    sesion.execute(text("INSERT INTO seguridad.usuario (nombre_usuario, contrasena_hash, nombres, apellidos) VALUES ('efimero', 'x', 'A', 'B')"))
    assert uno(sesion, "SELECT count(*) FROM seguridad.usuario WHERE nombre_usuario = 'efimero'") == 1
    sesion.commit()
    with motor_bd.connect() as otra:
        assert otra.execute(text("SELECT count(*) FROM seguridad.usuario WHERE nombre_usuario = 'efimero'")).scalar() == 0


def prueba_cada_prueba_empieza_con_la_semilla_intacta(sesion):
    assert uno(sesion, "SELECT count(*) FROM seguridad.usuario") == 1


# ------------------------------------------------------------- codificación de la conexión


def _codificacion(motor) -> str:
    with motor.connect() as c:
        return c.execute(text("SHOW client_encoding")).scalar()


def prueba_la_conexion_es_utf8_aunque_el_entorno_pida_otra_codificacion(url_bd, motor_bd, monkeypatch):
    monkeypatch.setenv("PGCLIENTENCODING", "WIN1252")
    control = create_engine(url_bd)
    forzado = crear_motor(url_bd)
    try:
        assert _codificacion(control) == "WIN1252"
        assert _codificacion(forzado) == "UTF8"
    finally:
        control.dispose()
        forzado.dispose()


def prueba_el_texto_con_acentos_se_guarda_y_se_lee_intacto(sesion):
    nombre = sesion.execute(text("SELECT nombre FROM organizacion.unidad_organica WHERE codigo = 'LAV'")).scalar()
    assert nombre == "Área de Costura y Lavandería"


# ---------------------------------------------------- salvaguardas de la instalación


def prueba_la_base_instalada_no_tiene_nada_ajeno(motor_bd):
    assert detectar_ajenos(motor_bd) == []


def prueba_una_base_con_un_esquema_ajeno_se_detecta_y_no_se_reinstalaria(motor_bd):
    with motor_bd.begin() as c:
        c.execute(text("CREATE SCHEMA datos_de_otro_sistema"))
    try:
        assert detectar_ajenos(motor_bd) == ["esquema datos_de_otro_sistema"]
    finally:
        with motor_bd.begin() as c:
            c.execute(text("DROP SCHEMA datos_de_otro_sistema"))


def prueba_una_tabla_ajena_en_public_se_detecta_pero_las_del_diseno_anterior_se_limpian(motor_bd):
    with motor_bd.begin() as c:
        c.execute(text("CREATE TABLE public.alembic_version (v int)"))
        c.execute(text("CREATE TABLE public.facturas (id int)"))
    try:
        assert detectar_ajenos(motor_bd) == ["tabla public.facturas"]
    finally:
        with motor_bd.begin() as c:
            c.execute(text("DROP TABLE public.alembic_version, public.facturas"))


# ----------------------------------------------- la prueba de punta a punta de Alejandro


def _psql() -> str | None:
    return os.environ.get("PSQL") or shutil.which("psql")


def prueba_06_prueba_de_alejandro_pasa_contra_la_base_instalada(motor_bd, url_bd):
    """Corre `06_prueba.sql` con `psql`. Se deshace sola (ROLLBACK). Necesita
    `psql` en el PATH o en la variable de entorno PSQL; si no, se salta."""
    psql = _psql()
    if psql is None:
        pytest.skip("psql no está en el PATH (ni en PSQL): no se puede correr 06_prueba.sql.")
    uri = make_url(url_bd).set(drivername="postgresql").render_as_string(hide_password=False)
    r = subprocess.run(
        [psql, uri, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "06_prueba.sql"],
        cwd=CARPETA_PRUEBAS, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
        env={**os.environ, "PGCLIENTENCODING": "UTF8"},
    )
    salida = r.stdout + r.stderr
    assert r.returncode == 0, salida[-1500:]
    assert salida.count("OK ·") >= 9 and "FALLO" not in salida


def prueba_fresh_se_niega_si_la_base_tiene_reportes(monkeypatch):
    """Recrear borra los reportes, y las migraciones no los traen de vuelta."""
    monkeypatch.setattr(gestor_bd, "reportes_en_la_base", lambda bd: 3)
    with pytest.raises(gestor_bd.ErrorMigracion, match="3 reporte"):
        gestor_bd.recrear_desde_cero(None, con_seed=True)


def prueba_una_base_con_mantenimiento_ya_retirado_adopta_el_seeder_0004_sin_correrlo(sesion):
    sesion.execute(text("DELETE FROM public.seeders WHERE nombre = '0004_retirar_mantenimiento.sql'"))
    _, adoptados = gestor_bd.sincronizar_base_existente(sesion)
    assert adoptados == ["0004_retirar_mantenimiento.sql"]
    assert uno(sesion, "SELECT lote FROM public.seeders WHERE nombre = '0004_retirar_mantenimiento.sql'") == 0
