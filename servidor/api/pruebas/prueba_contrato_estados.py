"""Contrato de la máquina de estados entre frontend y backend.

`frontend/src/app/dominio/estados.js` es el origen. Estas pruebas fallan si
alguna de las tres copias se desalinea: el JS, el JSON exportado
(`contrato/estados.json`) o `app/dominio/estados.py`.

Si falla la segunda, regenera el contrato:
    cd frontend && node scripts/exportar-contrato.mjs
Si falla la primera, es que el backend no siguió un cambio del frontend: ajusta
`app/dominio/estados.py`.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.dominio import estados

RAIZ = Path(__file__).resolve().parents[3]
CONTRATO = RAIZ / "servidor" / "api" / "contrato" / "estados.json"
EXPORTADOR = RAIZ / "frontend" / "scripts" / "exportar-contrato.mjs"


@pytest.fixture(scope="module")
def contrato() -> dict:
    return json.loads(CONTRATO.read_text(encoding="utf-8"))


def _del_backend() -> dict:
    """La misma forma que exporta el script, pero leída de estados.py."""
    return {
        "estados": [{"clave": e.clave, "orden": e.orden, "espera": e.espera} for e in estados.ESTADOS],
        "transiciones": [
            {"accion": t.accion, "desde": list(t.desde), "hasta": t.hasta, "rol": t.rol, "confirmar": t.confirmar}
            for t in estados.TRANSICIONES
        ],
    }


def prueba_el_backend_coincide_con_el_contrato(contrato):
    assert _del_backend() == contrato


def prueba_el_contrato_versionado_coincide_con_estados_js(contrato):
    if shutil.which("node") is None:
        pytest.skip("Node no está en el PATH: no se puede regenerar el contrato desde estados.js.")
    salida = subprocess.run(
        ["node", str(EXPORTADOR), "--stdout"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=30,
    ).stdout
    assert json.loads(salida) == contrato, (
        "estados.js cambió y servidor/api/contrato/estados.json quedó desactualizado. "
        "Regenéralo: cd frontend && node scripts/exportar-contrato.mjs"
    )


def prueba_mismas_decisiones_para_toda_combinacion(contrato):
    """No basta con que los datos coincidan: se comprueba el comportamiento de
    `puede` contra una evaluación independiente del JSON, para cada estado,
    acción y rol."""
    claves = [e["clave"] for e in contrato["estados"]]
    acciones = [t["accion"] for t in contrato["transiciones"]] + ["devolver"]
    roles_ = ["area", "estadistica", "oficina"]

    def segun_json(estado, accion, rol):
        return any(t["accion"] == accion and t["rol"] == rol and estado in t["desde"] for t in contrato["transiciones"])

    for estado in claves:
        for accion in acciones:
            for rol in roles_:
                assert estados.puede(estado, accion, rol) == segun_json(estado, accion, rol), (estado, accion, rol)


def prueba_los_estados_almacenados_son_los_del_contrato(contrato):
    del_contrato = [e["clave"] for e in contrato["estados"] if e["clave"] != "no_iniciado"]
    assert list(estados.ESTADOS_ALMACENADOS) == del_contrato
