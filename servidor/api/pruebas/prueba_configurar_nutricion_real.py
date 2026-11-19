"""La herramienta que configura NUT-2, la lectura real de Nutrición
(`python -m app.herramientas.configurar_nutricion_real`)."""

import pytest
from sqlalchemy import func, select

from app.datos.base import vigente
from app.datos.modelos import Carga, CriterioReconocimiento, Cuadro, Formato, FormatoVersion, Indicador, VersionIndicador
from app.herramientas import cargar_catalogo_nutricion, configurar_nutricion_real as herramienta
from app.herramientas.configurar_nutricion_real import NoSePuede, configurar

pytestmark = pytest.mark.bd


def version_nut2(bd) -> FormatoVersion | None:
    return bd.scalar(select(FormatoVersion).join(Formato).where(Formato.codigo == "NUT", FormatoVersion.codigo_version == "NUT-2", vigente(FormatoVersion)))


def cuadros(bd, version_id):
    return list(bd.scalars(select(Cuadro).where(Cuadro.formato_version_id == version_id, vigente(Cuadro)).order_by(Cuadro.orden)))


def version_indicador_de(bd, version_id, codigo_indicador):
    return bd.scalar(select(VersionIndicador).join(Indicador).where(VersionIndicador.formato_version_id == version_id, Indicador.codigo == codigo_indicador))


# ------------------------------------------------------------------ requisito


def prueba_se_niega_sin_los_indicadores_de_nut1(sesion):
    with pytest.raises(NoSePuede, match="cargar_catalogo_nutricion"):
        configurar(sesion)


# --------------------------------------------------------------- la configuración


def prueba_deja_nut2_en_configuracion_sin_activarla(sesion):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    mensaje = configurar(sesion)
    assert "4 cuadros, 38 indicadores" in mensaje
    v = version_nut2(sesion)
    assert v.estado == "en_configuracion"  # sin --activar no se activa sola
    assert len(cuadros(sesion, v.id)) == 4
    assert sesion.scalar(select(func.count()).select_from(VersionIndicador).where(VersionIndicador.formato_version_id == v.id)) == 38


def prueba_reutiliza_los_36_indicadores_de_nut1_y_solo_agrega_los_dos_de_patrimonio(sesion):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    formato = sesion.scalar(select(Formato).where(Formato.codigo == "NUT"))
    antes = sesion.scalar(select(func.count()).select_from(Indicador).where(Indicador.formato_id == formato.id, vigente(Indicador)))
    configurar(sesion)
    despues = sesion.scalar(select(func.count()).select_from(Indicador).where(Indicador.formato_id == formato.id, vigente(Indicador)))
    assert (antes, despues) == (36, 38)
    configurar(sesion, recargar=True)
    assert sesion.scalar(select(func.count()).select_from(Indicador).where(Indicador.formato_id == formato.id, vigente(Indicador))) == 38, "recargar no los duplica"


def prueba_las_hojas_reales_llevan_sus_espacios_de_mas_tal_cual(sesion):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    hojas = {c.codigo: c.hoja for c in cuadros(sesion, v.id)}
    assert hojas == {
        "f1": "COMENSALES HOSP  ",
        "f2": "COMENSALES EMERG",
        "f3": "PACIENTES HOSP",
        "f4": "PACIENTES EMERG",
    }


def prueba_la_fila_de_dias_es_4_en_comensales_y_3_en_pacientes(sesion):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    fila_dias = {c.codigo: c.ubicacion["fila_dias"] for c in cuadros(sesion, v.id)}
    assert fila_dias == {"f1": 4, "f2": 4, "f3": 3, "f4": 3}


def prueba_las_etiquetas_reales_conservan_sus_errores_de_tipeo(sesion):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    vi = version_indicador_de(sesion, v.id, "f2.nutricion.desayuno")
    assert vi.ubicacion["etiquetas"][0] == "DPTO DE NUTRICION Y DIETETTICA"  # doble T, a propósito


def prueba_los_grupos_de_internos_usan_comida_en_vez_de_cena_para_la_tercera(sesion):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    for codigo in ("f1.int-medicina.cena", "f1.int-obstetricia.cena", "f1.int-enfermeria.cena"):
        vi = version_indicador_de(sesion, v.id, codigo)
        assert vi.ubicacion["etiquetas"][1] == "COMIDA"
    # el resto de f1 sigue diciendo CENA de verdad
    assert version_indicador_de(sesion, v.id, "f1.asistencial.cena").ubicacion["etiquetas"][1] == "CENA"


def prueba_internos_de_enfermeria_cataloga_la_variante_con_punto(sesion):
    """De enero a abril el Excel real trae dos bloques: «INT ENF UNSM» y
    «INT. ENF UNSM»; desde mayo solo queda el segundo. Enfermería es el que
    sigue (con punto). El otro es Obstetricia mal rotulado: lo corrige el bot
    (definicion.js, CORRECCIONES) solo cuando conviven los dos."""
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    vi = version_indicador_de(sesion, v.id, "f1.int-enfermeria.desayuno")
    assert vi.ubicacion["etiquetas"][0] == "INT. ENF UNSM"


def prueba_patrimonio_es_un_grupo_de_la_emergencia_con_desayuno_y_almuerzo(sesion):
    """Aparece en abril con una sola fila (almuerzo) y cifras reales. Siguiendo
    la plantilla, es un grupo como Dirección y Residuos: dos indicadores nuevos,
    con sus dimensiones como los demás."""
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    for comida in ("desayuno", "almuerzo"):
        vi = version_indicador_de(sesion, v.id, f"f2.patrimonio.{comida}")
        assert vi.ubicacion["etiquetas"] == ["PATRIMONIO", comida.upper()]
    assert version_indicador_de(sesion, v.id, "f2.patrimonio.cena") is None


def prueba_activar_deja_nut2_activa_y_retira_nut1(sesion):
    from app.herramientas.configurar_nutricion_real import activar

    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    assert "activada" in activar(sesion)
    estados = dict(sesion.execute(select(FormatoVersion.codigo_version, FormatoVersion.estado).join(Formato).where(Formato.codigo == "NUT")).all())
    assert estados == {"NUT-1": "retirada", "NUT-2": "activa"}
    assert "ya está activa" in activar(sesion)


def prueba_ubicacion_total_queda_vacia_igual_que_en_nut1(sesion):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    totales = sesion.scalars(select(VersionIndicador.ubicacion_total).where(VersionIndicador.formato_version_id == v.id)).all()
    assert all(t is None for t in totales) and len(totales) == 38


def prueba_el_reconocimiento_es_solo_hoja_existe_sin_hoja_oculta(sesion):
    """El Excel real no tiene ninguna hoja oculta con metadatos: a diferencia
    de NUT-1, aquí no hay ningún criterio celda_texto."""
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    criterios = list(sesion.scalars(select(CriterioReconocimiento).where(CriterioReconocimiento.formato_version_id == v.id)))
    assert len(criterios) == 4
    assert all(c.tipo == "hoja_existe" and c.es_obligatorio for c in criterios)


# --------------------------------------------------------------- idempotencia


def prueba_correrla_dos_veces_no_duplica_nada(sesion):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    mensaje = configurar(sesion)
    assert "ya existe" in mensaje
    assert len(cuadros(sesion, v.id)) == 4


def prueba_recargar_se_niega_si_ya_hay_una_carga_aceptada(sesion):
    """Hoy NUT-2 nunca recibe una carga mientras siga `en_configuracion` (el
    disparador `fn_validar_carga` lo impide): esto simula el día en que se
    active y ya haya leído un archivo — para entonces, recargar debe seguir
    negándose, igual que con NUT-1."""
    from app.datos.modelos import Archivo, EstadoReporte, Periodo, Reporte

    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    configurar(sesion)
    v = version_nut2(sesion)
    v.estado = "activa"
    sesion.flush()
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
        configurar(sesion, recargar=True)


# ------------------------------------------------------------------ la línea de comandos


@pytest.fixture
def linea_de_comandos(sesion, monkeypatch):
    from app.config import Ajustes

    monkeypatch.setattr("app.datos.sesion.fabrica", lambda: (lambda: sesion))
    monkeypatch.setattr(herramienta, "obtener_ajustes", lambda: Ajustes(database_url="postgresql://u:secreta@servidor:5433/mi_base", jwt_secreto="x" * 32, _env_file=None))


def prueba_la_cli_configura_nut2_e_imprime_a_que_base_apunta_sin_la_contrasena(linea_de_comandos, sesion, capsys):
    cargar_catalogo_nutricion.cargar_catalogo(sesion)
    codigo = herramienta.main([])
    salida = capsys.readouterr().out
    assert codigo == 0
    assert "servidor:5433/mi_base" in salida and "secreta" not in salida
    assert "4 cuadros, 38 indicadores" in salida
    assert version_nut2(sesion).estado == "en_configuracion"


def prueba_la_cli_falla_con_codigo_1_y_error_en_stderr_sin_el_catalogo_de_nut1(linea_de_comandos, capsys):
    codigo = herramienta.main([])
    assert codigo == 1
    assert "Error:" in capsys.readouterr().err
