"""La herramienta que crea cuentas y asigna roles (`python -m app.herramientas.crear_usuario`)."""

import pytest
from sqlalchemy import select

from app.config import Ajustes
from app.datos.modelos import Usuario, UsuarioRol
from app.herramientas import crear_usuario as herramienta
from app.herramientas.crear_usuario import NoSePuede, crear_usuario

pytestmark = pytest.mark.bd


def usuario(bd, nombre_usuario: str) -> Usuario | None:
    return bd.scalar(select(Usuario).where(Usuario.nombre_usuario == nombre_usuario))


def asignaciones_de(bd, nombre_usuario: str) -> list[UsuarioRol]:
    return list(bd.scalars(select(UsuarioRol).join(Usuario, Usuario.id == UsuarioRol.usuario_id).where(Usuario.nombre_usuario == nombre_usuario)))


# --------------------------------------------------------------------- crear


def prueba_crea_la_cuenta_con_clave_provisional_y_la_asignacion(sesion):
    r = crear_usuario(sesion, "dig.nut", "digitador", unidad="nutricion", nombres="Ana", apellidos="Pérez")
    assert (r.creado, r.asignacion_nueva) == (True, True)
    u = usuario(sesion, "dig.nut")
    assert (u.contrasena_hash, u.debe_cambiar_contrasena, u.es_activo) == ("POR_ASIGNAR", True, True)
    assert (u.nombres, u.apellidos) == ("Ana", "Pérez")
    (asig,) = asignaciones_de(sesion, "dig.nut")
    assert asig.unidad_organica_id is not None


def prueba_un_rol_global_acepta_no_darle_unidad(sesion):
    r = crear_usuario(sesion, "rev.est", "revisor", nombres="Milagros", apellidos="Zumaeta")
    assert (r.creado, r.asignacion_nueva) == (True, True)
    (asig,) = asignaciones_de(sesion, "rev.est")
    assert asig.unidad_organica_id is None


def prueba_un_rol_ambos_acepta_con_o_sin_unidad(sesion):
    crear_usuario(sesion, "con.pla", "consulta", unidad="planeamiento", nombres="Raúl", apellidos="Bardales")
    crear_usuario(sesion, "con.glo", "consulta", nombres="Otra", apellidos="Persona")
    assert asignaciones_de(sesion, "con.pla")[0].unidad_organica_id is not None
    assert asignaciones_de(sesion, "con.glo")[0].unidad_organica_id is None


def prueba_no_distingue_mayusculas_ni_espacios_en_el_nombre_de_usuario(sesion):
    crear_usuario(sesion, "  Dig.Nut ", "digitador", unidad="nutricion", nombres="Ana", apellidos="Pérez")
    assert usuario(sesion, "Dig.Nut") is not None
    r = crear_usuario(sesion, "DIG.NUT", "consulta", unidad="nutricion")  # misma cuenta, sin importar el caso
    assert r.creado is False


# --------------------------------------------------------------- rechazos


def prueba_un_rol_inexistente_se_rechaza_con_su_codigo(sesion):
    with pytest.raises(NoSePuede, match="No existe el rol «fantasma»"):
        crear_usuario(sesion, "x", "fantasma", nombres="A", apellidos="B")


def prueba_un_rol_global_con_unidad_se_rechaza_nombrando_el_rol(sesion):
    with pytest.raises(NoSePuede, match="«revisor» es global"):
        crear_usuario(sesion, "x", "revisor", unidad="nutricion", nombres="A", apellidos="B")


def prueba_un_rol_de_unidad_sin_unidad_se_rechaza_nombrando_el_rol(sesion):
    with pytest.raises(NoSePuede, match="«digitador» se asigna a una unidad"):
        crear_usuario(sesion, "x", "digitador", nombres="A", apellidos="B")


def prueba_una_unidad_inexistente_se_rechaza(sesion):
    with pytest.raises(NoSePuede, match="No existe una unidad con clave «marte»"):
        crear_usuario(sesion, "x", "digitador", unidad="marte", nombres="A", apellidos="B")


def prueba_una_cuenta_nueva_sin_nombres_o_apellidos_se_rechaza(sesion):
    with pytest.raises(NoSePuede, match="hacen falta --nombres y --apellidos"):
        crear_usuario(sesion, "x", "revisor", apellidos="Solo apellido")
    with pytest.raises(NoSePuede, match="hacen falta --nombres y --apellidos"):
        crear_usuario(sesion, "x", "revisor", nombres="Solo nombre")
    assert usuario(sesion, "x") is None


# --------------------------------------------------------- idempotencia y Epidemiología


def prueba_repetir_la_misma_asignacion_no_duplica_ni_falla(sesion):
    crear_usuario(sesion, "dig.nut", "digitador", unidad="nutricion", nombres="Ana", apellidos="Pérez")
    r = crear_usuario(sesion, "dig.nut", "digitador", unidad="nutricion")
    assert (r.creado, r.asignacion_nueva) == (False, False)
    assert len(asignaciones_de(sesion, "dig.nut")) == 1


def prueba_una_segunda_asignacion_sobre_un_usuario_existente_se_agrega_sin_tocar_la_cuenta(sesion):
    """El caso real de Epidemiología: reporta como área y recibe como oficina."""
    crear_usuario(sesion, "epidemiologia", "digitador", unidad="epidemiologia", nombres="Elena", apellidos="Pacaya")
    r = crear_usuario(sesion, "epidemiologia", "consulta", unidad="epidemiologia")
    assert (r.creado, r.asignacion_nueva) == (False, True)
    u = usuario(sesion, "epidemiologia")
    assert (u.nombres, u.apellidos) == ("Elena", "Pacaya")  # no se tocó
    roles = {a.rol_id for a in asignaciones_de(sesion, "epidemiologia")}
    assert len(roles) == 2


def prueba_una_cuenta_existente_ignora_nombres_apellidos_correo_y_cargo(sesion):
    crear_usuario(sesion, "dig.nut", "digitador", unidad="nutricion", nombres="Ana", apellidos="Pérez")
    crear_usuario(sesion, "dig.nut", "consulta", unidad="nutricion", nombres="Otro Nombre", apellidos="Otro Apellido", correo="x@x.pe", cargo="Otro cargo")
    u = usuario(sesion, "dig.nut")
    assert (u.nombres, u.apellidos, u.correo, u.cargo) == ("Ana", "Pérez", None, None)


# ------------------------------------------------------------------ la línea de comandos


@pytest.fixture
def linea_de_comandos(sesion, monkeypatch):
    monkeypatch.setattr("app.datos.sesion.fabrica", lambda: (lambda: sesion))
    monkeypatch.setattr(herramienta, "obtener_ajustes", lambda: Ajustes(database_url="postgresql://u:secreta@servidor:5433/mi_base", jwt_secreto="x" * 32, _env_file=None))


def prueba_la_cli_crea_la_cuenta_e_imprime_a_que_base_apunta_sin_la_contrasena(linea_de_comandos, sesion, capsys):
    codigo = herramienta.main(["dig.nut", "--rol", "digitador", "--unidad", "nutricion", "--nombres", "Ana", "--apellidos", "Pérez"])
    salida = capsys.readouterr().out
    assert codigo == 0
    assert "servidor:5433/mi_base" in salida and "secreta" not in salida
    assert "creada" in salida and "asignar_clave dig.nut" in salida
    assert usuario(sesion, "dig.nut") is not None


def prueba_la_cli_avisa_cuando_la_cuenta_ya_existia_y_se_ignoraron_los_datos(linea_de_comandos, capsys):
    herramienta.main(["dig.nut", "--rol", "digitador", "--unidad", "nutricion", "--nombres", "Ana", "--apellidos", "Pérez"])
    capsys.readouterr()
    codigo = herramienta.main(["dig.nut", "--rol", "consulta", "--unidad", "nutricion", "--nombres", "Otro"])
    salida = capsys.readouterr().out
    assert codigo == 0
    assert "ya existía: se ignoraron" in salida
    assert "ya existía." in salida
    assert "agregada" in salida


def prueba_la_cli_falla_con_codigo_1_y_error_en_stderr_ante_un_rol_inexistente(linea_de_comandos, capsys):
    codigo = herramienta.main(["x", "--rol", "fantasma", "--nombres", "A", "--apellidos", "B"])
    assert codigo == 1
    assert "Error:" in capsys.readouterr().err
