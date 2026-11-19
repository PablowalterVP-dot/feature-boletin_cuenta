"""Las claves de la base pueden llegar en un archivo (decisión 0014): en Docker las
genera el contenedor `hospitalizacion-db` y nadie las escribe en `.env`."""

from app import config


def test_lee_la_clave_de_su_archivo(tmp_path, monkeypatch):
    archivo = tmp_path / "app"
    archivo.write_text("clave-generada\n", encoding="utf-8")
    monkeypatch.delenv("PRUEBA_CLAVE", raising=False)
    monkeypatch.setenv("PRUEBA_CLAVE_ARCHIVO", str(archivo))
    assert config.variable("PRUEBA_CLAVE") == "clave-generada"


def test_la_variable_escrita_gana_al_archivo(tmp_path, monkeypatch):
    archivo = tmp_path / "app"
    archivo.write_text("clave-generada", encoding="utf-8")
    monkeypatch.setenv("PRUEBA_CLAVE", "clave-escrita")
    monkeypatch.setenv("PRUEBA_CLAVE_ARCHIVO", str(archivo))
    assert config.variable("PRUEBA_CLAVE") == "clave-escrita"


def test_sin_archivo_avisa_que_falta(tmp_path, monkeypatch):
    monkeypatch.delenv("PRUEBA_CLAVE", raising=False)
    monkeypatch.setenv("PRUEBA_CLAVE_ARCHIVO", str(tmp_path / "no-existe"))
    try:
        config.variable("PRUEBA_CLAVE")
    except RuntimeError as error:
        assert "PRUEBA_CLAVE" in str(error)
    else:
        raise AssertionError("debía avisar que falta")
