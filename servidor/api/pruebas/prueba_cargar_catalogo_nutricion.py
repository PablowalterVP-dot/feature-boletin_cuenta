"""La herramienta que carga el catálogo real de NUT-1 (`python -m app.herramientas.cargar_catalogo_nutricion`)."""

import json
import shutil
import subprocess

import pytest
from sqlalchemy import func, select

from app.config import RAIZ_BACKEND
from app.datos.base import vigente
from app.datos.modelos import (
    Carga,
    CriterioReconocimiento,
    Cuadro,
    Dimension,
    DimensionValor,
    Formato,
    FormatoVersion,
    Indicador,
    VersionIndicador,
)
from app.herramientas import cargar_catalogo_nutricion as herramienta
from app.herramientas.cargar_catalogo_nutricion import NoSePuede, cargar_catalogo

pytestmark = pytest.mark.bd


def version_nut1(bd) -> FormatoVersion:
    return bd.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == "NUT", FormatoVersion.codigo_version == "NUT-1", vigente(FormatoVersion)))


def cuadros(bd, version_id):
    return list(bd.scalars(select(Cuadro).where(Cuadro.formato_version_id == version_id, vigente(Cuadro)).order_by(Cuadro.orden)))


def indicadores(bd, formato_id):
    return list(bd.scalars(select(Indicador).where(Indicador.formato_id == formato_id, vigente(Indicador))))


# ------------------------------------------------------------------ la carga


def prueba_deja_nut1_activa_con_los_4_cuadros_y_36_indicadores(sesion):
    mensaje = cargar_catalogo(sesion)
    assert "4 cuadros, 36 indicadores" in mensaje
    v = version_nut1(sesion)
    assert (v.estado, v.tipo_archivo) == ("activa", "xlsx")
    assert len(cuadros(sesion, v.id)) == 4
    assert len(indicadores(sesion, v.formato_id)) == 36
    assert sesion.scalar(select(func.count()).select_from(VersionIndicador).where(VersionIndicador.formato_version_id == v.id)) == 36
    assert sesion.scalar(select(func.count()).select_from(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == v.id, CriterioReconocimiento.es_obligatorio)) >= 1


def prueba_las_hojas_son_las_reales_de_la_plantilla_no_las_del_ejemplo(sesion):
    cargar_catalogo(sesion)
    v = version_nut1(sesion)
    hojas = {c.codigo: c.hoja for c in cuadros(sesion, v.id)}
    assert hojas == {
        "f1": "Comensales hospitalización",
        "f2": "Comensales emergencia",
        "f3": "Pacientes hospitalización",
        "f4": "Pacientes emergencia",
    }
    assert "HOSP." not in " ".join(hojas.values())  # nada de los nombres ficticios de 06_prueba.sql


def prueba_cada_cuadro_ubica_los_dias_en_la_fila_4_desde_la_columna_c(sesion):
    cargar_catalogo(sesion)
    v = version_nut1(sesion)
    for c in cuadros(sesion, v.id):
        assert c.ubicacion == {"orientacion": "horizontal", "fila_dias": 4, "columna_primer_dia": "C"}


def prueba_lectura_periodo_y_ubicacion_total_quedan_vacios_a_proposito(sesion):
    cargar_catalogo(sesion)
    v = version_nut1(sesion)
    assert v.lectura_periodo is None
    totales = sesion.scalars(select(VersionIndicador.ubicacion_total).where(VersionIndicador.formato_version_id == v.id)).all()
    assert all(t is None for t in totales) and len(totales) == 36


def prueba_el_metodo_de_lectura_es_por_etiqueta_con_arrastre_de_vacias(sesion):
    cargar_catalogo(sesion)
    v = version_nut1(sesion)
    vi = sesion.scalar(
        select(VersionIndicador).join(Indicador).where(VersionIndicador.formato_version_id == v.id, Indicador.codigo == "f3.liquida.cena")
    )
    assert vi.metodo_lectura == "etiqueta"
    assert vi.ubicacion == {"etiquetas": ["Dieta líquida", "Cena"], "columnas": ["A", "B"], "arrastrar_vacias": True}


def prueba_el_valor_sis_de_financiador_es_nuevo_y_los_indicadores_de_f4_lo_usan(sesion):
    cargar_catalogo(sesion)
    financiador = sesion.scalar(select(Dimension).where(Dimension.codigo == "financiador"))
    sis = sesion.scalar(select(DimensionValor).where(DimensionValor.dimension_id == financiador.id, DimensionValor.codigo == "sis", vigente(DimensionValor)))
    assert sis is not None
    assert sesion.scalar(select(Indicador).where(Indicador.codigo == "f4.sis.desayuno")) is not None


# --------------------------------------------------------------- idempotencia


def prueba_correrla_dos_veces_no_duplica_nada(sesion):
    cargar_catalogo(sesion)
    v = version_nut1(sesion)
    mensaje = cargar_catalogo(sesion)
    assert "ya está activa" in mensaje
    assert len(cuadros(sesion, v.id)) == 4
    assert len(indicadores(sesion, v.formato_id)) == 36


def prueba_recargar_borra_y_vuelve_a_escribir_sin_duplicar(sesion):
    cargar_catalogo(sesion)
    mensaje = cargar_catalogo(sesion, recargar=True)
    assert "4 cuadros, 36 indicadores" in mensaje
    v = version_nut1(sesion)
    assert len(cuadros(sesion, v.id)) == 4
    assert len(indicadores(sesion, v.formato_id)) == 36


def prueba_recargar_no_toca_las_dimensiones_globales(sesion):
    """poblacion/servicio/comida las siembra 04_semilla.sql; no las creó esta herramienta."""
    antes = sesion.scalar(select(func.count()).select_from(DimensionValor).join(Dimension).where(Dimension.codigo.in_(["poblacion", "servicio", "comida"])))
    cargar_catalogo(sesion)
    cargar_catalogo(sesion, recargar=True)
    despues = sesion.scalar(select(func.count()).select_from(DimensionValor).join(Dimension).where(Dimension.codigo.in_(["poblacion", "servicio", "comida"])))
    assert antes == despues


def prueba_recargar_se_niega_si_ya_hay_una_carga_aceptada(sesion):
    from app.datos.modelos import Archivo, EstadoReporte, Periodo, Reporte

    cargar_catalogo(sesion)
    v = version_nut1(sesion)
    periodo = sesion.scalar(select(Periodo).where(Periodo.anio == 2026, Periodo.mes == 8))
    estado = sesion.scalar(select(EstadoReporte).where(EstadoReporte.codigo == "borrador"))
    reporte = Reporte(formato_id=v.formato_id, periodo_id=periodo.id, estado_reporte_id=estado.id, formato_version_id=v.id)
    sesion.add(reporte)
    sesion.flush()
    archivo = Archivo(nombre_original="x.xlsx", ruta_almacenamiento="x", tamano_bytes=1, huella_sha256="ab" * 32, proposito="carga")
    sesion.add(archivo)
    sesion.flush()
    sesion.add(Carga(reporte_id=reporte.id, archivo_id=archivo.id, formato_version_id=v.id, resultado="aceptada", es_vigente=True))
    sesion.flush()

    with pytest.raises(NoSePuede, match="congelada"):
        cargar_catalogo(sesion, recargar=True)


# -------------------------------------------------------------- rechazos


def prueba_sin_04_semilla_las_dimensiones_globales_faltarian_con_mensaje_claro(sesion):
    sesion.execute(Dimension.__table__.update().where(Dimension.codigo == "poblacion").values(fecha_eliminacion=func.now()))
    with pytest.raises(NoSePuede, match="Falta la dimensión «poblacion»"):
        cargar_catalogo(sesion)


# --------------------------------------------------- contrato con el bot real


def _node() -> str | None:
    import os

    return os.environ.get("NODE") or shutil.which("node")


@pytest.mark.node
def prueba_nut2_coincide_con_lo_que_lee_y_genera_el_bot_de_verdad(sesion):
    """El bot (definicion.js y su plantilla oficial) y NUT-2 en la base describen
    lo mismo: los mismos indicadores por cuadro y las mismas hojas. Genera la
    plantilla con el bot real y la relee con su propio lector (xlsx.js), sin
    reimplementar el .xlsx en Python. Si alguien cambia definicion.js sin
    tocar configurar_nutricion_real.py (o al revés), esta prueba lo dice."""
    from app.herramientas.configurar_nutricion_real import configurar

    node = _node()
    if node is None:
        pytest.skip("node no está en el PATH (ni en NODE): no se puede generar la plantilla real.")

    apoyo = RAIZ_BACKEND / "pruebas" / "contrato_bot_nutricion.mjs"
    resultado = subprocess.run([node, str(apoyo)], capture_output=True, text=True, encoding="utf-8", cwd=apoyo.parent, timeout=30)
    assert resultado.returncode == 0, resultado.stderr
    bot = json.loads(resultado.stdout)

    cargar_catalogo(sesion)
    configurar(sesion)
    v = sesion.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == "NUT", FormatoVersion.codigo_version == "NUT-2"))

    normalizar = lambda h: " ".join(h.split()).upper()  # noqa: E731 — el bot compara las hojas así
    for c in cuadros(sesion, v.id):
        assert normalizar(c.hoja) == normalizar(bot["hojaPorCuadro"][c.codigo])
        assert normalizar(bot["hojaPorCuadro"][c.codigo]) in {normalizar(h) for h in bot["hojas"]}
        codigos = sorted(sesion.scalars(
            select(Indicador.codigo).join(VersionIndicador, VersionIndicador.indicador_id == Indicador.id)
            .where(VersionIndicador.formato_version_id == v.id, VersionIndicador.cuadro_id == c.id)
        ))
        assert codigos == bot["codigosPorCuadro"][c.codigo]


# ------------------------------------------------------------------ la línea de comandos


@pytest.fixture
def linea_de_comandos(sesion, monkeypatch):
    from app.config import Ajustes

    monkeypatch.setattr("app.datos.sesion.fabrica", lambda: (lambda: sesion))
    monkeypatch.setattr(herramienta, "obtener_ajustes", lambda: Ajustes(database_url="postgresql://u:secreta@servidor:5433/mi_base", jwt_secreto="x" * 32, _env_file=None))


def prueba_la_cli_activa_nut1_e_imprime_a_que_base_apunta_sin_la_contrasena(linea_de_comandos, sesion, capsys):
    codigo = herramienta.main([])
    salida = capsys.readouterr().out
    assert codigo == 0
    assert "servidor:5433/mi_base" in salida and "secreta" not in salida
    assert "4 cuadros, 36 indicadores" in salida
    assert version_nut1(sesion).estado == "activa"


def prueba_la_cli_recargar_funciona(linea_de_comandos, capsys):
    herramienta.main([])
    capsys.readouterr()
    codigo = herramienta.main(["--recargar"])
    assert codigo == 0
    assert "4 cuadros, 36 indicadores" in capsys.readouterr().out


def prueba_la_cli_falla_con_codigo_1_y_error_en_stderr_si_falta_el_formato(linea_de_comandos, sesion, capsys):
    sesion.execute(Formato.__table__.update().where(Formato.codigo == "NUT").values(fecha_eliminacion=func.now()))
    codigo = herramienta.main([])
    assert codigo == 1
    assert "Error:" in capsys.readouterr().err
