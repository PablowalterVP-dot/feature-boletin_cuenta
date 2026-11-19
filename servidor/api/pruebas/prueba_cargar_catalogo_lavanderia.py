"""La herramienta que carga el catálogo de LAV-1 (`python -m app.herramientas.cargar_catalogo_lavanderia`)."""

import json
import shutil
import subprocess

import pytest
from sqlalchemy import func, select

from app.config import RAIZ_BACKEND
from app.datos.base import vigente
from app.datos.modelos import Cuadro, Formato, FormatoVersion, Indicador, VersionIndicador
from app.herramientas import cargar_catalogo_lavanderia as herramienta
from app.herramientas.cargar_catalogo_lavanderia import NoSePuede, cargar_catalogo

pytestmark = pytest.mark.bd


def version_lav1(bd) -> FormatoVersion:
    return bd.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == "LAV", FormatoVersion.codigo_version == "LAV-1", vigente(FormatoVersion)))


def cuadros(bd, version_id):
    return list(bd.scalars(select(Cuadro).where(Cuadro.formato_version_id == version_id, vigente(Cuadro)).order_by(Cuadro.orden)))


def indicadores(bd, formato_id):
    return list(bd.scalars(select(Indicador).where(Indicador.formato_id == formato_id, vigente(Indicador))))


# ------------------------------------------------------------------ la carga


def prueba_crea_el_formato_lav_diaria_porque_04_semilla_no_lo_trae(sesion):
    """A diferencia de NUT, 04_semilla.sql no deja un Formato ni una FormatoVersion
    vacíos para LAV: esta herramienta los crea desde cero (como Laboratorio)."""
    assert sesion.scalar(select(Formato).where(Formato.codigo == "LAV", vigente(Formato))) is None
    cargar_catalogo(sesion)
    formato = sesion.scalar(select(Formato).where(Formato.codigo == "LAV", vigente(Formato)))
    assert formato is not None
    assert formato.granularidad == "diaria"


def prueba_deja_lav1_activa_con_1_cuadro_y_15_indicadores(sesion):
    mensaje = cargar_catalogo(sesion)
    assert "1 cuadro, 15 indicadores" in mensaje
    v = version_lav1(sesion)
    assert (v.estado, v.tipo_archivo) == ("activa", "xlsx")
    assert len(cuadros(sesion, v.id)) == 1
    assert len(indicadores(sesion, v.formato_id)) == 15
    assert sesion.scalar(select(func.count()).select_from(VersionIndicador).where(VersionIndicador.formato_version_id == v.id)) == 15


def prueba_el_unico_cuadro_es_f1_kilos_por_servicio(sesion):
    cargar_catalogo(sesion)
    v = version_lav1(sesion)
    [c] = cuadros(sesion, v.id)
    assert c.codigo == "f1"
    assert c.titulo == "Kilogramos por servicio"


def prueba_uci_cirugia_es_el_unico_indicador_no_obligatorio(sesion):
    """Solo figuró en el Excel real de mayo de 2026, y en 0 (ver definicion.js del bot)."""
    cargar_catalogo(sesion)
    formato = sesion.scalar(select(Formato).where(Formato.codigo == "LAV", vigente(Formato)))
    no_obligatorios = sesion.scalars(select(Indicador.codigo).where(Indicador.formato_id == formato.id, vigente(Indicador), ~Indicador.es_obligatorio)).all()
    assert no_obligatorios == ["f1.uci-cirugia"]


# --------------------------------------------------------------- idempotencia


def prueba_correrla_dos_veces_no_duplica_nada(sesion):
    cargar_catalogo(sesion)
    v = version_lav1(sesion)
    mensaje = cargar_catalogo(sesion)
    assert "ya está activa" in mensaje
    assert len(cuadros(sesion, v.id)) == 1
    assert len(indicadores(sesion, v.formato_id)) == 15


def prueba_recargar_borra_y_vuelve_a_escribir_sin_duplicar(sesion):
    cargar_catalogo(sesion)
    mensaje = cargar_catalogo(sesion, recargar=True)
    assert "1 cuadro, 15 indicadores" in mensaje
    v = version_lav1(sesion)
    assert len(cuadros(sesion, v.id)) == 1
    assert len(indicadores(sesion, v.formato_id)) == 15


def prueba_recargar_se_niega_si_ya_hay_una_carga_aceptada(sesion):
    from app.datos.modelos import Archivo, EstadoReporte, Periodo, Reporte, Carga

    cargar_catalogo(sesion)
    v = version_lav1(sesion)
    periodo = sesion.scalar(select(Periodo).where(Periodo.anio == 2026, Periodo.mes == 8))
    estado = sesion.scalar(select(EstadoReporte).where(EstadoReporte.codigo == "borrador"))
    reporte = Reporte(formato_id=v.formato_id, periodo_id=periodo.id, estado_reporte_id=estado.id, formato_version_id=v.id)
    sesion.add(reporte)
    sesion.flush()
    archivo = Archivo(nombre_original="x.xlsx", ruta_almacenamiento="x", tamano_bytes=1, huella_sha256="cd" * 32, proposito="carga")
    sesion.add(archivo)
    sesion.flush()
    sesion.add(Carga(reporte_id=reporte.id, archivo_id=archivo.id, formato_version_id=v.id, resultado="aceptada", es_vigente=True))
    sesion.flush()

    with pytest.raises(NoSePuede, match="congelada"):
        cargar_catalogo(sesion, recargar=True)


# -------------------------------------------------------------- rechazos


def prueba_sin_la_unidad_lav_falla_con_mensaje_claro(sesion):
    from app.datos.modelos import UnidadOrganica

    sesion.execute(UnidadOrganica.__table__.update().where(UnidadOrganica.codigo == "LAV").values(fecha_eliminacion=func.now()))
    with pytest.raises(NoSePuede, match="No existe la unidad «LAV»"):
        cargar_catalogo(sesion)


def prueba_se_niega_si_el_formato_ya_existe_con_otra_granularidad(sesion):
    from app.datos.modelos import UnidadOrganica

    unidad = sesion.scalar(select(UnidadOrganica).where(UnidadOrganica.codigo == "LAV", vigente(UnidadOrganica)))
    sesion.add(Formato(unidad_organica_id=unidad.id, codigo="LAV", nombre="x", descripcion="x", periodicidad="mensual", granularidad="mensual"))
    sesion.flush()
    with pytest.raises(NoSePuede, match="granularidad"):
        cargar_catalogo(sesion)


# --------------------------------------------------- contrato con el bot real


def _node() -> str | None:
    import os

    return os.environ.get("NODE") or shutil.which("node")


@pytest.mark.node
def prueba_lav1_coincide_con_los_servicios_que_define_el_bot_de_verdad(sesion):
    """El bot (definicion.js) y LAV-1 en la base describen los mismos 15 servicios
    de f1, con el mismo código. Si alguien cambia definicion.js sin tocar
    cargar_catalogo_lavanderia.py (o al revés), esta prueba lo dice."""
    node = _node()
    if node is None:
        pytest.skip("node no está en el PATH (ni en NODE): no se puede leer la definición real.")

    apoyo = RAIZ_BACKEND / "pruebas" / "contrato_bot_lavanderia.mjs"
    resultado = subprocess.run([node, str(apoyo)], capture_output=True, text=True, encoding="utf-8", cwd=apoyo.parent, timeout=30)
    assert resultado.returncode == 0, resultado.stderr
    bot = json.loads(resultado.stdout)

    cargar_catalogo(sesion)
    formato = sesion.scalar(select(Formato).where(Formato.codigo == "LAV", vigente(Formato)))
    codigos = sorted(sesion.scalars(select(Indicador.codigo).where(Indicador.formato_id == formato.id, vigente(Indicador))))
    assert codigos == bot["codigos"]


# ------------------------------------------------------------------ la línea de comandos


@pytest.fixture
def linea_de_comandos(sesion, monkeypatch):
    from app.config import Ajustes

    monkeypatch.setattr("app.datos.sesion.fabrica", lambda: (lambda: sesion))
    monkeypatch.setattr(herramienta, "obtener_ajustes", lambda: Ajustes(database_url="postgresql://u:secreta@servidor:5433/mi_base", jwt_secreto="x" * 32, _env_file=None))


def prueba_la_cli_activa_lav1_e_imprime_a_que_base_apunta_sin_la_contrasena(linea_de_comandos, sesion, capsys):
    codigo = herramienta.main([])
    salida = capsys.readouterr().out
    assert codigo == 0
    assert "servidor:5433/mi_base" in salida and "secreta" not in salida
    assert "1 cuadro, 15 indicadores" in salida
    assert version_lav1(sesion).estado == "activa"


def prueba_la_cli_recargar_funciona(linea_de_comandos, capsys):
    herramienta.main([])
    capsys.readouterr()
    codigo = herramienta.main(["--recargar"])
    assert codigo == 0
    assert "1 cuadro, 15 indicadores" in capsys.readouterr().out


def prueba_la_cli_falla_con_codigo_1_y_error_en_stderr_si_falta_la_unidad(linea_de_comandos, sesion, capsys):
    from app.datos.modelos import UnidadOrganica

    sesion.execute(UnidadOrganica.__table__.update().where(UnidadOrganica.codigo == "LAV").values(fecha_eliminacion=func.now()))
    codigo = herramienta.main([])
    assert codigo == 1
    assert "Error:" in capsys.readouterr().err
