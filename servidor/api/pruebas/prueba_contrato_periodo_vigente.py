"""Contrato de la regla del «periodo vigente» entre frontend y backend.

Las dos implementaciones son independientes (JS y Python, sin código
compartido); lo que este contrato evita es que cambien sin que alguien lo
note. `frontend/src/app/dominio/periodos.js::periodoVigente` es el origen.

Si falla la segunda prueba, regenera el contrato:
    cd frontend && node scripts/exportar-contrato-periodo.mjs
Si falla la primera, es que el backend no siguió un cambio del frontend:
ajusta `app/dominio/periodos.py::periodo_vigente`.
"""

import json
import shutil
import subprocess
from datetime import date
from pathlib import Path

import pytest

from app.dominio import periodos

RAIZ = Path(__file__).resolve().parents[3]
CONTRATO = RAIZ / "servidor" / "api" / "contrato" / "periodo_vigente.json"
EXPORTADOR = RAIZ / "frontend" / "scripts" / "exportar-contrato-periodo.mjs"


@pytest.fixture(scope="module")
def contrato() -> dict:
    return json.loads(CONTRATO.read_text(encoding="utf-8"))


def prueba_el_backend_coincide_con_el_contrato(contrato):
    for caso in contrato["casos"]:
        assert periodos.periodo_vigente(date.fromisoformat(caso["hoy"])) == caso["vigente"], caso


def prueba_el_contrato_versionado_coincide_con_periodos_js(contrato):
    if shutil.which("node") is None:
        pytest.skip("Node no está en el PATH: no se puede regenerar el contrato desde periodos.js.")
    salida = subprocess.run(
        ["node", str(EXPORTADOR), "--stdout"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=30,
    ).stdout
    assert json.loads(salida) == contrato, (
        "periodos.js cambió y backend/contrato/periodo_vigente.json quedó desactualizado. "
        "Regenéralo: cd frontend && node scripts/exportar-contrato-periodo.mjs"
    )
