"""Pruebas de estructura, orden secuencial y codificación de los scripts SQL
en `servidor/api/bd/` (`migraciones/`, `seeders/` y `pruebas/`). Sin base de datos.
"""

from app.herramientas.bd import (
    CARPETA_BD,
    CARPETA_MIGRACIONES,
    CARPETA_PRUEBAS,
    CARPETA_SEEDERS,
    CARPETA_SEEDERS_OPCIONALES,
    archivos_migraciones,
    archivos_seeders,
    archivos_seeders_opcionales,
)


def prueba_existen_las_carpetas_de_migraciones_seeders_y_pruebas():
    assert CARPETA_MIGRACIONES.is_dir()
    assert CARPETA_SEEDERS.is_dir()
    assert CARPETA_SEEDERS_OPCIONALES.is_dir()
    assert CARPETA_PRUEBAS.is_dir()
    assert (CARPETA_BD / "INFORME_AVANCE_04.md").is_file()


def prueba_las_migraciones_estan_en_orden_secuencial():
    nombres = [p.name for p in archivos_migraciones()]
    assert nombres == [
        "0001_esquema_base.sql",
        "0002_auditoria.sql",
        "0003_integridad.sql",
        "0004_vistas.sql",
        "0005_desempeno_esquema.sql",
        "0006_desempeno_tablero.sql",
        "0007_farmacia_word.sql",
        "0008_planeamiento.sql",
        "0009_usuario_telefono.sql",
        "0010_registro_del_sistema.sql",
        "0011_monitoreo.sql",
    ]
    prefijos = [int(n.split("_", 1)[0]) for n in nombres]
    assert prefijos == list(range(1, len(nombres) + 1))


def prueba_los_seeders_estan_en_orden_secuencial():
    nombres = [p.name for p in archivos_seeders()]
    assert nombres == [
        "0001_semilla_base.sql",
        "0002_flujo_entrega_directa.sql",
        "0003_desempeno_catalogos.sql",
        "0004_retirar_mantenimiento.sql",
        "0005_planeamiento.sql",
        "0006_monitoreo.sql",
        "0007_formatos_de_las_nueve_areas.py",
        "0008_retirar_reportes.sql",
        "0009_hospitalizacion.sql",
        "0010_hospitalizacion_unidades.sql",
        "0011_hospitalizacion_en_estadistica.sql",
    ]
    prefijos = [int(n.split("_", 1)[0]) for n in nombres]
    assert prefijos == list(range(1, len(nombres) + 1))


def prueba_los_seeders_opcionales_no_se_incluyen_en_seeders_obligatorios():
    opcionales = [p.name for p in archivos_seeders_opcionales()]
    assert {"usuarios_areas.sql", "usuarios_hospitalizacion.sql"} <= set(opcionales)
    assert not {"usuarios_areas.sql", "usuarios_hospitalizacion.sql"} & {p.name for p in archivos_seeders()}


def prueba_los_scripts_de_prueba_no_se_mezclan_con_migraciones_ni_seeders():
    nombres_pruebas = {p.name for p in CARPETA_PRUEBAS.iterdir()}
    assert {"06_prueba.sql", "07_ejemplo_nutricion.sql"} <= nombres_pruebas
    todos_instalables = {p.name for p in (*archivos_migraciones(), *archivos_seeders())}
    assert "06_prueba.sql" not in todos_instalables
    assert "07_ejemplo_nutricion.sql" not in todos_instalables


def prueba_los_scripts_se_guardan_sin_conversion_de_fines_de_linea():
    """`.gitattributes` con `-text`: evita que git altere los bytes según el SO."""
    assert "-text" in (CARPETA_BD / ".gitattributes").read_text(encoding="utf-8")


def prueba_todos_los_scripts_son_utf8_valido_sin_bom():
    """Si esto falla, alguien guardó un SQL en otra codificación (WIN1252, UTF-16)
    o con BOM, y `psql` lo leería mal."""
    todos = [
        *archivos_migraciones(),
        *archivos_seeders(),
        *archivos_seeders_opcionales(),
        *sorted(CARPETA_PRUEBAS.glob("*.sql")),
    ]
    assert len(todos) >= 13
    for script in todos:
        crudo = script.read_bytes()
        assert not crudo.startswith(bytes([0xEF, 0xBB, 0xBF])), f"{script.name} trae BOM"
        crudo.decode("utf-8")


def prueba_0001_semilla_base_contiene_la_a_con_tilde_que_exige_un_cliente_utf8():
    """Documenta por qué existe la nota de codificación: este carácter (c3 81)
    es el que hace fallar a un cliente WIN1252."""
    texto = (CARPETA_SEEDERS / "0001_semilla_base.sql").read_bytes()
    assert "Área de Costura y Lavandería".encode("utf-8") in texto
    assert "Á".encode("utf-8") == bytes([0xC3, 0x81])
    assert "Á".encode("utf-8") in texto
