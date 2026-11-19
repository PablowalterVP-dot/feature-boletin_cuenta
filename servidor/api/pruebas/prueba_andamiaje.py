from datetime import datetime

from fastapi.testclient import TestClient

from app.api.dependencias import obtener_reloj
from app.config import normalizar_url_base
from app.dominio.reloj import ZONA, RelojFijo
from app.main import app


def prueba_salud_responde_sin_base():
    respuesta = TestClient(app).get("/api/salud")
    assert respuesta.status_code == 200
    assert respuesta.json()["ok"] is True


def prueba_salud_trae_la_fecha_de_hoy_en_lima():
    """El frontend la pide al iniciar para no fiarse del reloj del navegador
    (dominio/periodos.py § «hoy»)."""
    app.dependency_overrides[obtener_reloj] = lambda: RelojFijo(datetime(2026, 10, 3, 23, 30, tzinfo=ZONA))
    try:
        cuerpo = TestClient(app).get("/api/salud").json()
    finally:
        del app.dependency_overrides[obtener_reloj]
    assert cuerpo["hoy"] == "2026-10-03"


def prueba_url_de_postgres_usa_psycopg_3():
    assert normalizar_url_base("postgresql://u:c@localhost/x") == "postgresql+psycopg://u:c@localhost/x"
    assert normalizar_url_base("postgres://u:c@localhost/x") == "postgresql+psycopg://u:c@localhost/x"


def prueba_url_con_driver_explicito_no_se_toca():
    url = "postgresql+psycopg://u:c@localhost/x"
    assert normalizar_url_base(url) == url


# ------------------------------------------------- configuración y seguridad


def prueba_un_secreto_jwt_corto_se_rechaza():
    import pytest
    from pydantic import ValidationError

    from app.config import Ajustes

    with pytest.raises(ValidationError, match="al menos 32 caracteres"):
        Ajustes(database_url="postgresql://x/y", jwt_secreto="cambia-esto", _env_file=None)
    assert Ajustes(database_url="postgresql://x/y", jwt_secreto="a" * 32, _env_file=None).jwt_horas == 8


def prueba_las_pruebas_reconocen_que_dos_urls_son_la_misma_base():
    """La salvaguarda que impide que `pytest` vacíe la base de desarrollo."""
    from conftest import _misma_base

    assert _misma_base("postgresql://u:p@localhost/x", "postgresql+psycopg://otro:clave@localhost:5432/x")
    assert not _misma_base("postgresql://u:p@localhost/x", "postgresql://u:p@localhost/x_pruebas")
    assert not _misma_base("postgresql://u:p@localhost:5432/x", "postgresql://u:p@localhost:5433/x")
