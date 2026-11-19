"""La herramienta que siembra el umbral de alertas
(`python -m app.herramientas.configurar_alertas`)."""

import pytest
from sqlalchemy import select

from app.datos.base import vigente
from app.datos.modelos import Parametro, UnidadOrganica
from app.dominio import alertas
from app.herramientas import configurar_alertas as herramienta
from app.herramientas.configurar_alertas import PARAMETROS_CONOCIDOS, NoSePuede, configurar

pytestmark = pytest.mark.bd


def valor_de(bd, su_clave: str) -> str | None:
    return bd.scalar(select(Parametro.valor).where(Parametro.clave == su_clave, vigente(Parametro)))


def prueba_siembra_el_umbral_provisional(sesion):
    mensaje = configurar(sesion)
    assert "1 clave(s) nueva(s)" in mensaje
    assert valor_de(sesion, "alerta.default.semana_incompleta_dias") == "1"


def prueba_correrla_dos_veces_no_duplica_ni_pisa_un_valor_ajustado_a_mano(sesion):
    configurar(sesion)
    fila = sesion.scalar(select(Parametro).where(Parametro.clave == "alerta.default.semana_incompleta_dias"))
    fila.valor = "3"  # Giancarlo lo confirmó distinto
    sesion.flush()

    mensaje = configurar(sesion)
    assert "0 clave(s) nueva(s), 0 actualizada(s)" in mensaje
    assert valor_de(sesion, "alerta.default.semana_incompleta_dias") == "3"


def prueba_recargar_actualiza_al_valor_conocido(sesion):
    configurar(sesion)
    fila = sesion.scalar(select(Parametro).where(Parametro.clave == "alerta.default.semana_incompleta_dias"))
    fila.valor = "3"
    sesion.flush()

    mensaje = configurar(sesion, recargar=True)
    assert "0 clave(s) nueva(s), 1 actualizada(s)" in mensaje
    assert valor_de(sesion, "alerta.default.semana_incompleta_dias") == "1"


def prueba_cada_clave_conocida_apunta_a_un_area_que_existe(sesion):
    """Si un código de área no calza con la base real, el umbral caería al
    respaldo sin que nadie lo note."""
    codigos_unidad = set(sesion.scalars(select(UnidadOrganica.codigo).where(vigente(UnidadOrganica))))
    for area, _dias, _descripcion in PARAMETROS_CONOCIDOS:
        es_area_valida = area == alertas.AREA_RESPALDO or area in codigos_unidad
        assert es_area_valida, f"«{area}» no es ni «{alertas.AREA_RESPALDO}», ni un código de unidad orgánica real"


def prueba_se_niega_si_un_area_inventada_no_existe(sesion, monkeypatch):
    monkeypatch.setattr(herramienta, "PARAMETROS_CONOCIDOS", (("XXX", 1, "inventado"),))
    with pytest.raises(NoSePuede, match="XXX"):
        configurar(sesion)


# ------------------------------------------------------------------ la línea de comandos


@pytest.fixture
def linea_de_comandos(sesion, monkeypatch):
    from app.config import Ajustes

    monkeypatch.setattr("app.datos.sesion.fabrica", lambda: (lambda: sesion))
    monkeypatch.setattr(herramienta, "obtener_ajustes", lambda: Ajustes(database_url="postgresql://u:secreta@servidor:5433/mi_base", jwt_secreto="x" * 32, _env_file=None))


def prueba_la_cli_siembra_e_imprime_a_que_base_apunta_sin_la_contrasena(linea_de_comandos, sesion, capsys):
    codigo = herramienta.main([])
    salida = capsys.readouterr().out
    assert codigo == 0
    assert "servidor:5433/mi_base" in salida and "secreta" not in salida
    assert "1 clave(s) nueva(s)" in salida


def prueba_la_cli_falla_con_codigo_1_y_error_en_stderr_si_un_area_no_existe(linea_de_comandos, capsys, monkeypatch):
    monkeypatch.setattr(herramienta, "PARAMETROS_CONOCIDOS", (("XXX", 1, "inventado"),))
    codigo = herramienta.main([])
    assert codigo == 1
    assert "Error:" in capsys.readouterr().err
