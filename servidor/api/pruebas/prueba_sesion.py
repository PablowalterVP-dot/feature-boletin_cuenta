"""Sesión, roles y política de contraseñas del dominio. Sin base de datos."""

from datetime import datetime

import pytest

from app.dominio import claves, permisos, roles
from app.dominio.reloj import ZONA
from app.dominio.sesion import Asignacion, Sesion, agrupar

AHORA = datetime(2026, 9, 13, 12, 0, tzinfo=ZONA)


def sesion(*asignaciones: Asignacion) -> Sesion:
    return Sesion(1, "x", "X", tuple(asignaciones), False, AHORA, AHORA)


def a(rol, unidad, *perms) -> Asignacion:
    return Asignacion(rol, unidad, frozenset(perms))


# ----------------------------------------------------------------- roles


def prueba_los_roles_de_la_base_y_los_de_la_interfaz():
    assert roles.ROLES == (
        "superadmin", "admin", "digitador", "revisor", "consulta", "boletin", "planeamiento",
        "enfermeria", "jefe_departamento", "admision", "control_camas", "mantenimiento_camas",
    )
    assert roles.ROLES_DE_INTERFAZ == ("area", "estadistica", "planeamiento", "oficina", "hospitalizacion", "boletin")


@pytest.mark.parametrize("rol_de_la_base", roles.ROLES_DE_HOSPITALIZACION)
def prueba_los_roles_de_hospitalizacion_son_del_tipo_hospitalizacion(rol_de_la_base):
    assert roles.rol_de_interfaz(rol_de_la_base) == "hospitalizacion"


def prueba_una_cuenta_de_piso_es_de_hospitalizacion():
    s = sesion(a("enfermeria", "medicina-b", permisos.HOSPITALIZACION_OPERAR))
    assert s.roles_de_interfaz == ("hospitalizacion",)


def prueba_estadistica_con_altas_por_validar_sigue_siendo_estadistica():
    """Los módulos de hospitalización van debajo de su menú, no en un ámbito aparte."""
    s = sesion(a("revisor", None, permisos.REPORTE_VER, permisos.HOSPITALIZACION_VER, permisos.HOSPITALIZACION_VALIDAR))
    assert s.roles_de_interfaz == ("estadistica",)


@pytest.mark.parametrize(
    "rol_de_la_base, tipo",
    [("digitador", "area"), ("admin", "area"), ("revisor", "estadistica"), ("planeamiento", "planeamiento"), ("consulta", "oficina"), ("boletin", "boletin"), ("superadmin", None)],
)
def prueba_cada_rol_de_la_base_se_traduce_a_un_tipo_de_interfaz(rol_de_la_base, tipo):
    assert roles.rol_de_interfaz(rol_de_la_base) == tipo


def prueba_la_encargada_del_boletin_ve_el_monitoreo_sin_datos_de_pacientes():
    """`boletin.ver` abre el panel de monitoreo; no lleva `desempeno.ver`, así
    que la ficha 14 no le muestra la lista de pacientes (seeder 0012)."""
    s = sesion(a("boletin", None, permisos.BOLETIN_VER, permisos.REPORTE_VER, permisos.REPORTE_DESCARGAR))
    assert s.roles_de_interfaz == ("boletin",)
    assert s.ve_monitoreo
    assert not s.puede(permisos.DESEMPENO_VER)
    assert not s.puede(permisos.HOSPITALIZACION_VER)


def prueba_el_superadmin_no_es_ni_area_ni_oficina_ni_estadistica():
    assert sesion(a("superadmin", None, permisos.REPORTE_VER)).roles_de_interfaz == ()


def prueba_los_roles_no_se_repiten_y_conservan_el_orden():
    s = sesion(a("digitador", "nutricion"), a("digitador", "imagenes"), a("consulta", "planeamiento"))
    assert s.roles == ("digitador", "consulta")
    assert s.roles_de_interfaz == ("area", "oficina")


# --------------------------------------------------------------- permisos


def prueba_puede_exige_el_permiso_y_la_unidad():
    s = sesion(a("digitador", "nutricion", permisos.REPORTE_ENVIAR))
    assert s.puede(permisos.REPORTE_ENVIAR, "nutricion")
    assert not s.puede(permisos.REPORTE_ENVIAR, "imagenes")
    assert not s.puede(permisos.REPORTE_VALIDAR, "nutricion")
    assert not s.puede(permisos.REPORTE_ENVIAR)


def prueba_una_asignacion_global_vale_para_cualquier_unidad_y_para_todo_el_sistema():
    s = sesion(a("revisor", None, permisos.REPORTE_VALIDAR))
    assert s.puede(permisos.REPORTE_VALIDAR, "nutricion") and s.puede(permisos.REPORTE_VALIDAR)


def prueba_los_permisos_de_asignaciones_distintas_no_se_mezclan_entre_unidades():
    """Digitador de Nutrición y consulta de Planeamiento: el permiso de enviar es
    solo de Nutrición y el de ver es solo de Planeamiento."""
    s = sesion(a("digitador", "nutricion", permisos.REPORTE_ENVIAR), a("consulta", "planeamiento", permisos.REPORTE_VER))
    assert s.puede(permisos.REPORTE_ENVIAR, "nutricion") and not s.puede(permisos.REPORTE_ENVIAR, "planeamiento")
    assert s.puede(permisos.REPORTE_VER, "planeamiento") and not s.puede(permisos.REPORTE_VER, "nutricion")


def prueba_puede_en_alguna_es_la_puerta_del_endpoint_no_la_autorizacion_final():
    s = sesion(a("digitador", "nutricion", permisos.REPORTE_ENVIAR))
    assert s.puede_en_alguna(permisos.REPORTE_ENVIAR) and not s.puede_en_alguna(permisos.REPORTE_VALIDAR)


def prueba_unidades_con_dice_donde_se_tiene_el_permiso_y_none_si_en_todas():
    s = sesion(a("digitador", "nutricion", permisos.REPORTE_VER), a("consulta", "planeamiento", permisos.REPORTE_VER), a("revisor", None, permisos.REPORTE_VALIDAR))
    assert s.unidades_con(permisos.REPORTE_VER) == frozenset({"nutricion", "planeamiento"})
    assert s.unidades_con(permisos.REPORTE_VALIDAR) is None
    assert s.unidades_con(permisos.REPORTE_ENVIAR) == frozenset()  # en ninguna


def prueba_una_asignacion_global_convierte_la_lista_de_unidades_en_todas():
    s = sesion(a("digitador", "nutricion", permisos.REPORTE_VER), a("revisor", None, permisos.REPORTE_VER))
    assert s.unidades_con(permisos.REPORTE_VER) is None


def prueba_agrupar_junta_las_filas_de_la_vista_por_rol_y_unidad():
    filas = [
        ("digitador", "nutricion", "reporte.enviar"),
        ("digitador", "nutricion", "reporte.cargar"),
        ("revisor", None, "reporte.validar"),
        ("consulta", "epidemiologia", "reporte.ver"),
        ("digitador", "epidemiologia", "reporte.enviar"),
    ]
    resultado = agrupar(filas)
    # Primero las globales; después por unidad y, dentro de una unidad, por rol.
    assert [(x.rol, x.unidad) for x in resultado] == [("revisor", None), ("consulta", "epidemiologia"), ("digitador", "epidemiologia"), ("digitador", "nutricion")]
    assert resultado[3].permisos == frozenset({"reporte.enviar", "reporte.cargar"})


def prueba_agrupar_es_estable_sin_importar_el_orden_de_entrada():
    filas = [("digitador", "nutricion", "reporte.enviar"), ("revisor", None, "reporte.validar"), ("consulta", "planeamiento", "reporte.ver")]
    assert agrupar(filas) == agrupar(list(reversed(filas)))


# ------------------------------------------------------------ contraseñas


def prueba_una_clave_razonable_no_tiene_problemas():
    assert claves.problemas_de_clave("una-clave-larga-y-buena", "ana") == []


@pytest.mark.parametrize(
    "clave, esperado",
    [
        ("corta", "al menos 10"),
        ("x" * 201, "pasar de 200"),
        ("mi-ana-clave-larga", "nombre de usuario"),
        (" con-espacios-al-borde ", "espacios"),
        ("POR_ASIGNAR", "marca de una cuenta sin contraseña"),
    ],
)
def prueba_problemas_de_clave(clave, esperado):
    assert any(esperado in p for p in claves.problemas_de_clave(clave, "ana"))


def prueba_la_clave_nueva_debe_ser_distinta_de_la_actual():
    assert any("distinta" in p for p in claves.problemas_de_clave("una-clave-larga-1", "ana", clave_actual="una-clave-larga-1"))
    assert claves.problemas_de_clave("una-clave-larga-2", "ana", clave_actual="una-clave-larga-1") == []


def prueba_se_informan_todos_los_problemas_juntos():
    assert len(claves.problemas_de_clave("ana", "ana")) >= 2


def prueba_planeamiento_lee_todo_lo_entregado_pero_nunca_un_borrador():
    """Con `reporte.ver` global ve todas las unidades; sin cargar ni revisar, un
    borrador no es suyo (la misma regla que una oficina de consulta)."""
    from app.dominio.consultas import visibilidad_de

    v = visibilidad_de(sesion(a("planeamiento", None, permisos.REPORTE_VER, permisos.ACTIVIDAD_VER, permisos.ACTIVIDAD_REGISTRAR)))
    assert v.ve("ginecologia", "remitido") and v.ve("lavanderia", "remitido")
    assert not v.ve("nutricion", "borrador")
