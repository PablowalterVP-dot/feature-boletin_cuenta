"""La máquina de estados en TRES fuentes: frontend, Python y la base de Alejandro.

    frontend/src/app/dominio/estados.js  ─▶ contrato/estados.json   (lo que ve la interfaz)
    servidor/api/app/dominio/estados.py                                    (lo que sabe el backend)
    reporte.estado_reporte / transicion_estado                        (lo que dice la BD)

`prueba_contrato_estados.py` ya compara las dos primeras. Esta añade la tercera y
falla si cualquiera se desalinea: un estado que cambia de nombre, una transición
que Alejandro añade o quita, un permiso que cambia de rol.

Diferencia conocida y a propósito: `crear` (no_iniciado → borrador) **no** está en
`transicion_estado`. `04_semilla.sql` lo dice: no es una transición guardada sino el
INSERT del reporte, y exige `reporte.cargar`.
"""

import json
from pathlib import Path

import pytest
from sqlalchemy import text

from app.dominio import estados, permisos, roles

pytestmark = pytest.mark.bd

CONTRATO = Path(__file__).resolve().parents[1] / "contrato" / "estados.json"


@pytest.fixture(scope="module")
def frontend() -> dict:
    return json.loads(CONTRATO.read_text(encoding="utf-8"))


# -------------------------------------------------- lo que dice cada fuente


def estructura_del_frontend(frontend: dict) -> set[tuple]:
    return {(t["accion"], desde, t["hasta"]) for t in frontend["transiciones"] for desde in t["desde"]}


def estructura_de_python() -> set[tuple]:
    return {(t.accion, desde, t.hasta) for t in estados.TRANSICIONES for desde in t.desde}


def transiciones_de_la_bd(sesion) -> set[tuple]:
    """(accion, origen, destino, permiso) de `reporte.transicion_estado`."""
    filas = sesion.execute(
        text(
            "SELECT t.accion, o.codigo, d.codigo, p.codigo FROM reporte.transicion_estado t "
            "JOIN reporte.estado_reporte o ON o.id = t.estado_origen_id "
            "JOIN reporte.estado_reporte d ON d.id = t.estado_destino_id "
            "JOIN seguridad.permiso p ON p.id = t.permiso_id "
            "WHERE t.fecha_eliminacion IS NULL AND o.fecha_eliminacion IS NULL AND d.fecha_eliminacion IS NULL AND p.fecha_eliminacion IS NULL"
        )
    ).all()
    return {tuple(f) for f in filas}


def roles_de_interfaz_con_el_permiso(sesion, permiso: str) -> set[str]:
    """Qué tipos de usuario de la interfaz tienen un permiso en la BD (sin contar
    al superadmin, que tiene todos y no es de ninguno)."""
    codigos = sesion.execute(
        text(
            "SELECT r.codigo FROM seguridad.rol_permiso rp JOIN seguridad.rol r ON r.id = rp.rol_id JOIN seguridad.permiso p ON p.id = rp.permiso_id "
            "WHERE p.codigo = :p AND rp.fecha_eliminacion IS NULL AND r.fecha_eliminacion IS NULL AND p.fecha_eliminacion IS NULL"
        ),
        {"p": permiso},
    ).scalars().all()
    return {roles.ROL_DE_INTERFAZ[c] for c in codigos if c in roles.ROL_DE_INTERFAZ}


def diferencias(nombre_a: str, a: set, nombre_b: str, b: set) -> list[str]:
    return [f"solo en {nombre_a}: {sorted(a - b)}"] * bool(a - b) + [f"solo en {nombre_b}: {sorted(b - a)}"] * bool(b - a)


# ------------------------------------------------------------------ los estados


def prueba_los_estados_coinciden_en_las_tres_fuentes(sesion, frontend):
    bd = {(c, o) for c, o in sesion.execute(text("SELECT codigo, orden FROM reporte.estado_reporte WHERE fecha_eliminacion IS NULL")).all()}
    del_frontend = {(e["clave"], e["orden"]) for e in frontend["estados"] if e["clave"] != estados.NO_INICIADO}
    de_python = {(e.clave, e.orden) for e in estados.ESTADOS if e.clave != estados.NO_INICIADO}
    assert diferencias("la BD", bd, "el frontend", del_frontend) == []
    assert diferencias("Python", de_python, "el frontend", del_frontend) == []


def prueba_no_iniciado_no_es_un_estado_guardado_ni_en_la_bd_ni_en_python(sesion):
    """Un reporte que no existe no se almacena: su ausencia ES ese estado."""
    assert sesion.execute(text("SELECT count(*) FROM reporte.estado_reporte WHERE codigo = 'no_iniciado'")).scalar() == 0
    assert estados.NO_INICIADO not in estados.ESTADOS_ALMACENADOS


def prueba_solo_remitido_es_final(sesion):
    finales = sesion.execute(text("SELECT codigo FROM reporte.estado_reporte WHERE es_final")).scalars().all()
    assert finales == ["remitido"]
    assert [e.clave for e in estados.ESTADOS if e.espera == estados.ESPERA_NADIE] == ["remitido"]


# ---------------------------------------------------------------- las transiciones


def prueba_la_estructura_de_las_transiciones_coincide_en_las_tres_fuentes(sesion, frontend):
    """(acción, desde, hasta), dejando fuera `crear`, que la BD no guarda."""
    bd = {(a, o, d) for a, o, d, _ in transiciones_de_la_bd(sesion)}
    del_frontend = {t for t in estructura_del_frontend(frontend) if t[0] != "crear"}
    de_python = {t for t in estructura_de_python() if t[0] != "crear"}
    assert diferencias("la BD", bd, "el frontend", del_frontend) == [], "la BD y el frontend no coinciden"
    assert diferencias("Python", de_python, "el frontend", del_frontend) == [], "Python y el frontend no coinciden"
    assert len(bd) == 2  # enviar (directo a remitido) y rectificar: bd/flujo/01_entrega_directa.sql


def prueba_crear_no_es_una_transicion_guardada_en_la_bd(sesion):
    assert "crear" not in {a for a, *_ in transiciones_de_la_bd(sesion)}
    assert estados.transicion("crear") is not None  # pero sí la conoce el backend


def prueba_el_permiso_de_cada_accion_coincide_entre_python_y_la_bd(sesion):
    bd = {(a, p) for a, _, _, p in transiciones_de_la_bd(sesion)}
    de_python = {(a, p) for a, p in estados.PERMISO_DE_ACCION.items() if a != "crear"}
    assert diferencias("la BD", bd, "Python", de_python) == []


def prueba_cada_accion_de_python_tiene_su_permiso_y_ese_permiso_existe_en_la_bd(sesion):
    assert set(estados.PERMISO_DE_ACCION) == {t.accion for t in estados.TRANSICIONES}
    existentes = set(sesion.execute(text("SELECT codigo FROM seguridad.permiso WHERE fecha_eliminacion IS NULL")).scalars())
    assert set(estados.PERMISO_DE_ACCION.values()) <= existentes
    assert estados.PERMISO_DE_ACCION["crear"] == "reporte.cargar"


def prueba_todos_los_permisos_que_usa_el_backend_existen_en_la_bd(sesion):
    existentes = set(sesion.execute(text("SELECT codigo FROM seguridad.permiso WHERE fecha_eliminacion IS NULL")).scalars())
    assert set(permisos.USADOS) - existentes == set()


def prueba_una_accion_por_estado_de_origen_como_exige_la_bd(sesion):
    """`uq_transicion_estado (estado_origen_id, accion)`: no hay dos filas iguales,
    y Python tampoco declara una acción dos veces desde el mismo estado."""
    pares = [(t.accion, desde) for t in estados.TRANSICIONES for desde in t.desde]
    assert len(pares) == len(set(pares))


# ------------------------------------------------- quién puede: rol de interfaz ↔ permiso de la BD


def prueba_el_rol_de_cada_transicion_en_el_frontend_es_el_de_los_roles_que_tienen_su_permiso_en_la_bd(sesion, frontend):
    """El frontend dice que `enviar` es del `area`; la BD dice que lo tienen
    `digitador` y `admin`. Esas dos frases deben ser la misma."""
    for t in frontend["transiciones"]:
        permiso = estados.PERMISO_DE_ACCION[t["accion"]]
        assert roles_de_interfaz_con_el_permiso(sesion, permiso) == {t["rol"]}, f"{t['accion']} ({permiso})"


def prueba_lo_que_python_permite_a_cada_tipo_de_usuario_es_lo_que_permite_la_bd(sesion):
    """Recorre cada estado y cada tipo de usuario y compara las acciones
    disponibles según Python con las que se derivan de la BD."""
    bd = transiciones_de_la_bd(sesion)
    for estado in [e.clave for e in estados.ESTADOS if e.clave != estados.NO_INICIADO]:
        for tipo in roles.ROLES_DE_INTERFAZ:
            desde_la_bd = {a for a, origen, _, permiso in bd if origen == estado and tipo in roles_de_interfaz_con_el_permiso(sesion, permiso)}
            desde_python = {t.accion for t in estados.transiciones_de(estado, tipo) if t.accion != "crear"}
            assert desde_python == desde_la_bd, (estado, tipo)


def prueba_un_tipo_oficina_no_puede_ninguna_transicion_ni_en_la_bd(sesion):
    for _, _, _, permiso in transiciones_de_la_bd(sesion):
        assert roles.OFICINA not in roles_de_interfaz_con_el_permiso(sesion, permiso)


# ------------------------------------------------------------ el contrato muerde


def prueba_las_diferencias_entre_fuentes_se_detectan():
    """Si esto no detectara nada, las pruebas de arriba no valdrían: se comprueba
    con datos manipulados a propósito."""
    frontend = {"transiciones": [{"accion": "enviar", "desde": ["borrador"], "hasta": "enviado"}]}
    igual = estructura_del_frontend(frontend)
    assert diferencias("A", igual, "B", set(igual)) == []
    con_transicion_de_mas = set(igual) | {("devolver", "enviado", "borrador")}
    assert diferencias("A", igual, "B", con_transicion_de_mas) == ["solo en B: [('devolver', 'enviado', 'borrador')]"]
    assert diferencias("A", con_transicion_de_mas, "B", igual) == ["solo en A: [('devolver', 'enviado', 'borrador')]"]
    con_destino_distinto = {("enviar", "borrador", "validado")}
    assert len(diferencias("A", igual, "B", con_destino_distinto)) == 2
