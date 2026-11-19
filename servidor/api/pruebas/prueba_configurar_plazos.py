"""La herramienta que siembra los plazos reales
(`python -m app.herramientas.configurar_plazos`)."""

import pytest
from sqlalchemy import select

from app.datos.base import vigente
from app.datos.modelos import Parametro, UnidadOrganica
from app.dominio import plazos
from app.herramientas import configurar_plazos as herramienta
from app.herramientas.configurar_plazos import PLAZOS_CONOCIDOS, NoSePuede, configurar

pytestmark = pytest.mark.bd


def valor_de(bd, su_clave: str) -> str | None:
    return bd.scalar(select(Parametro.valor).where(Parametro.clave == su_clave, vigente(Parametro)))


# --------------------------------------------------------------- la siembra


def prueba_siembra_las_cinco_claves_conocidas(sesion):
    mensaje = configurar(sesion)
    assert "5 clave(s) nueva(s)" in mensaje
    assert valor_de(sesion, "plazo.default.estadistica") == "5"
    assert valor_de(sesion, "plazo.NEF.estadistica") == "7"
    assert valor_de(sesion, "plazo.LAV.estadistica") == "8"
    assert valor_de(sesion, "plazo.default.planeamiento") == "10"
    assert valor_de(sesion, "plazo.EST.diresa") == "15"


def prueba_correrla_dos_veces_no_duplica_ni_pisa_un_valor_ajustado_a_mano(sesion):
    configurar(sesion)
    fila = sesion.scalar(select(Parametro).where(Parametro.clave == "plazo.NEF.estadistica"))
    fila.valor = "6"  # alguien lo ajustó a mano
    sesion.flush()

    mensaje = configurar(sesion)
    assert "0 clave(s) nueva(s), 0 actualizada(s)" in mensaje
    assert valor_de(sesion, "plazo.NEF.estadistica") == "6"  # no se pisó


def prueba_recargar_actualiza_a_los_valores_conocidos(sesion):
    configurar(sesion)
    fila = sesion.scalar(select(Parametro).where(Parametro.clave == "plazo.NEF.estadistica"))
    fila.valor = "6"
    sesion.flush()

    mensaje = configurar(sesion, recargar=True)
    assert "0 clave(s) nueva(s), 5 actualizada(s)" in mensaje
    assert valor_de(sesion, "plazo.NEF.estadistica") == "7"


# ------------------------------------------------------- cada clave apunta a algo real


def prueba_cada_clave_conocida_apunta_a_un_area_y_un_destino_que_existen(sesion):
    """Si un código de área o de destino no calza con la base real, el plazo
    caería al respaldo sin que nadie lo note — por eso se verifica aquí, no
    solo al sembrar. El área es siempre el código de la UNIDAD, nunca el del
    formato ni su clave: así no depende de si el área ya tiene formato propio."""
    codigos_unidad = set(sesion.scalars(select(UnidadOrganica.codigo).where(vigente(UnidadOrganica))))
    receptoras = set(sesion.scalars(select(UnidadOrganica.clave).where(UnidadOrganica.es_receptora, vigente(UnidadOrganica))))

    for area, destino, _dia, _descripcion in PLAZOS_CONOCIDOS:
        es_area_valida = area == plazos.AREA_RESPALDO or area in codigos_unidad
        assert es_area_valida, f"«{area}» no es ni «{plazos.AREA_RESPALDO}», ni un código de unidad orgánica real"
        assert destino in receptoras, f"«{destino}» no es una unidad receptora real"


def prueba_se_niega_si_un_area_inventada_no_existe(sesion, monkeypatch):
    monkeypatch.setattr(herramienta, "PLAZOS_CONOCIDOS", (("XXX", "estadistica", 5, "inventado"),))
    with pytest.raises(NoSePuede, match="XXX"):
        configurar(sesion)


def prueba_se_niega_si_un_destino_inventado_no_existe(sesion, monkeypatch):
    monkeypatch.setattr(herramienta, "PLAZOS_CONOCIDOS", (("default", "xxx", 5, "inventado"),))
    with pytest.raises(NoSePuede, match="xxx"):
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
    assert "5 clave(s) nueva(s)" in salida


def prueba_la_cli_falla_con_codigo_1_y_error_en_stderr_si_un_area_no_existe(linea_de_comandos, capsys, monkeypatch):
    monkeypatch.setattr(herramienta, "PLAZOS_CONOCIDOS", (("XXX", "estadistica", 5, "inventado"),))
    codigo = herramienta.main([])
    assert codigo == 1
    assert "Error:" in capsys.readouterr().err
