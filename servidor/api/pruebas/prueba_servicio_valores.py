"""El servicio de valores contra la base de Alejandro.

Usa el catálogo de EJEMPLO de Nutrición (36 indicadores en 4 cuadros, granularidad
diaria) montado por `escenario.dar_carga_aceptada`.
"""

import pytest

import escenario as e
from app.servicios.errores import NoEncontrado, SinPermiso
from app.servicios.valores import valores_de

pytestmark = pytest.mark.bd


@pytest.fixture
def dig(sesion):
    return e.digitador_de_nutricion(sesion)


@pytest.fixture
def rev(sesion):
    return e.revisor_de_estadistica(sesion)


def ver(sesion, actor, periodo="2026-08", formato="NUT"):
    return valores_de(sesion, actor, formato=formato, periodo=periodo)


def indicador(d, codigo):
    return next(i for cu in d.cuadros for i in cu.indicadores if i.indicador == codigo)


# ------------------------------------------------------------------- sin reporte


def prueba_sin_reporte_los_cuadros_salen_vacios(sesion, dig):
    assert ver(sesion, dig).cuadros == []


def prueba_un_borrador_sin_carga_tampoco_tiene_cuadros(sesion, dig):
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    assert ver(sesion, dig).cuadros == []


def prueba_formato_o_periodo_inexistentes_son_404(sesion, dig):
    with pytest.raises(NoEncontrado):
        ver(sesion, dig, formato="ZZZ")
    with pytest.raises(NoEncontrado):
        ver(sesion, dig, periodo="2099-01")


# --------------------------------------------------------- la forma, sin datos


def prueba_con_carga_aceptada_aparecen_los_36_indicadores_sin_datos(sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep)
    d = ver(sesion, dig)
    total_indicadores = sum(len(cu.indicadores) for cu in d.cuadros)
    assert len(d.cuadros) == 4 and total_indicadores == 36
    assert all(i.total is None and i.casillas_con_dato == 0 and i.casillas == [] for cu in d.cuadros for i in cu.indicadores)
    assert {cu.cuadro for cu in d.cuadros} == {"f1", "f2", "f3", "f4"}
    f3 = next(cu for cu in d.cuadros if cu.cuadro == "f3")
    assert f3.titulo == "Pacientes · Hospitalización"


def prueba_los_cuadros_van_en_su_orden_y_los_indicadores_por_codigo(sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep)
    d = ver(sesion, dig)
    assert [cu.cuadro for cu in d.cuadros] == ["f1", "f2", "f3", "f4"]
    for cu in d.cuadros:
        assert [i.indicador for i in cu.indicadores] == sorted(i.indicador for i in cu.indicadores)


def prueba_un_indicador_trae_su_unidad_de_medida_y_sus_dimensiones(sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep)
    i = indicador(ver(sesion, dig), "f3.liquida.cena")
    assert i.unidad_medida == "raciones"
    assert i.dimensiones == {"poblacion": "paciente", "servicio": "hospitalizacion", "tipo_dieta": "liquida", "comida": "cena"}
    assert i.casillas_esperadas == 31  # agosto tiene 31 días


# -------------------------------------------------------------------- casillas


def prueba_las_casillas_escritas_aparecen_con_su_valor_y_van_ordenadas_por_dia(sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    carga = e.dar_carga_aceptada(sesion, rep)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 5, 12, carga=carga)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 1, 10, carga=carga)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 3, 11, carga=carga)
    i = indicador(ver(sesion, dig), "f3.liquida.cena")
    assert [c.dia for c in i.casillas] == [1, 3, 5]
    assert (i.total, i.casillas_con_dato) == (33, 3)


def prueba_el_texto_no_numerico_queda_en_texto_original_con_el_valor_nulo(sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    carga = e.dar_carga_aceptada(sesion, rep)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 1, None, carga=carga, texto_original="N/A")
    c = indicador(ver(sesion, dig), "f3.liquida.cena").casillas[0]
    assert (c.valor, c.texto_original) == (None, "N/A")


def prueba_el_linaje_solo_aparece_cuando_el_origen_es_archivo(sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    carga = e.dar_carga_aceptada(sesion, rep)
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 1, 10, carga=carga, hoja_excel="Hoja1", celda_excel="C24")
    e.escribir_valor(sesion, rep, "f3.liquida.cena", 2, 100, origen="manual")  # corrección, sin carga
    d = ver(sesion, dig)
    por_dia = {c.dia: c for c in indicador(d, "f3.liquida.cena").casillas}
    assert (por_dia[1].origen, por_dia[1].hoja_excel, por_dia[1].celda_excel) == ("archivo", "Hoja1", "C24")
    assert (por_dia[2].origen, por_dia[2].hoja_excel, por_dia[2].celda_excel) == ("manual", None, None)


# ----------------------------------------------------------------- visibilidad


def prueba_el_digitador_ve_su_propio_borrador(sesion, dig):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep)
    assert len(ver(sesion, dig).cuadros) == 4


def prueba_una_consulta_global_no_ve_un_borrador(sesion):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep)
    glo = e.persona(sesion, "glo", ("consulta", None))
    with pytest.raises(SinPermiso):
        ver(sesion, glo)


def prueba_una_consulta_global_si_ve_un_reporte_ya_entregado(sesion):
    rep = e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=e.AHORA, folio="CR-2026-08-NUT")
    e.dar_carga_aceptada(sesion, rep)
    glo = e.persona(sesion, "glo", ("consulta", None))
    assert len(ver(sesion, glo).cuadros) == 4


def prueba_el_revisor_ve_borradores_de_cualquier_unidad(sesion, rev):
    rep = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, rep)
    assert len(ver(sesion, rev).cuadros) == 4


def prueba_sin_reporte_ver_sobre_la_unidad_es_sin_permiso(sesion):
    otra = e.persona(sesion, "otra", ("digitador", "farmacia"))
    with pytest.raises(SinPermiso):
        ver(sesion, otra)
