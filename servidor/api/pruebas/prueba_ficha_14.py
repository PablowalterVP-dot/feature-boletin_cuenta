"""Las reglas de la Ficha 14, con atenciones inventadas: ninguna es de un paciente.

Son las mismas situaciones que se probaron en el proyecto donde se validó la
ficha. Que el cálculo sobre los datos reales dé lo mismo que aquel se comprueba
aparte, con el comando que calcula.
"""

from dataclasses import replace
from datetime import date, timedelta

from app.dominio.desempeno import ficha_14
from app.dominio.desempeno.ficha_14 import (
    MOTIVO_FALLECIO,
    MOTIVO_PALIATIVO,
    Atencion,
    Caso,
    cumplimiento,
    dentro_del_plazo,
    evaluar_paciente,
    plazo_abierto,
)

DX = date(2026, 3, 1)


def fila(cita: str, fecha: date, codigo: str, tipo: str, lab: str = "") -> Atencion:
    return Atencion(cita, fecha, codigo, tipo, lab, "F", 40, "A", fecha)


# Cáncer de cuello uterino diagnosticado y confirmado en la misma cita.
BASE = [fila("dx", DX, "C539", "D"), fila("dx", DX, "57500", "D", "A")]


def paliativo(dias: int) -> list[Atencion]:
    fecha = DX + timedelta(days=dias)
    return [fila("pal", fecha, "99489", "D", "1"), fila("pal", fecha, "C539", "R")]


def tratamiento(dias: int) -> list[Atencion]:
    fecha = DX + timedelta(days=dias)
    return [fila("t", fecha, "C539", "R"), fila("t", fecha, "96402", "D", "1")]


def evaluar(filas, **opciones) -> list[Caso]:
    return evaluar_paciente(filas, anio=2026, **opciones)


def en_denominador(filas, **opciones) -> list[Caso]:
    return [c for c in evaluar(filas, **opciones) if c.en_denominador]


# ---- El catálogo --------------------------------------------------------------


def prueba_son_diez_tipos_de_cancer_y_ninguno_comparte_codigos():
    assert len(ficha_14.TIPOS_CANCER) == 10
    assert set(ficha_14.NOMBRES_DE_TIPO) == set(ficha_14.TIPOS_CANCER)
    assert sum(len(t.cie10) for t in ficha_14.TIPOS_CANCER.values()) == len(ficha_14.CIE10_DE_CANCER)
    confirmaciones = [c for t in ficha_14.TIPOS_CANCER.values() for c in t.confirmacion]
    assert len(confirmaciones) == len(set(confirmaciones))


def prueba_los_codigos_que_se_miran_los_cubren_todos():
    for codigo in ("C539", "57500", "96402", "77305", "77501", "99024", "99489"):
        assert codigo in ficha_14.CODIGOS_QUE_SE_MIRAN
    assert len(ficha_14.CODIGOS_TRATAMIENTO) == 19 + 15 + 15 + 1


# ---- El plazo -----------------------------------------------------------------


def prueba_el_plazo_incluye_el_dia_del_diagnostico_y_el_37():
    assert dentro_del_plazo(DX, DX)
    assert dentro_del_plazo(DX, DX + timedelta(days=37))
    assert not dentro_del_plazo(DX, DX + timedelta(days=38))
    assert not dentro_del_plazo(DX, DX - timedelta(days=1))


# ---- El denominador -----------------------------------------------------------


def prueba_un_diagnostico_confirmado_entra_al_denominador():
    assert evaluar(BASE) == [Caso("CUELLO_UTERINO", DX, en_denominador=True, en_numerador=False)]


def prueba_sin_confirmacion_en_la_misma_cita_no_hay_caso():
    assert evaluar([BASE[0], replace(BASE[1], id_cita="otra")]) == []
    assert evaluar([BASE[0], replace(BASE[1], valor_lab="")]) == []


def prueba_el_sexo_y_la_edad_se_miran_en_la_fila_de_la_confirmacion():
    assert evaluar([BASE[0], replace(BASE[1], edad=17)]) == []
    assert evaluar([BASE[0], replace(BASE[1], genero="M")]) == []
    assert evaluar([BASE[0], replace(BASE[1], tipo_edad="M")]) == []
    assert len(evaluar([replace(BASE[0], edad=17, genero="M"), BASE[1]])) == 1


def prueba_linfoma_y_leucemia_no_piden_edad_ni_sexo():
    nino = [replace(a, genero="M", edad=5) for a in (fila("dx", DX, "C819", "D"), fila("dx", DX, "38500", "D", "A"))]
    assert [c.tipo_cancer for c in evaluar(nino)] == ["LINFOMA"]


def prueba_se_toma_el_primer_diagnostico_del_tipo_en_el_anio():
    repetidos = [replace(a, id_cita="dx2", fecha_atencion=DX + timedelta(days=40)) for a in BASE]
    casos = evaluar(BASE + repetidos + BASE)
    assert len(casos) == 1 and casos[0].fecha_diagnostico == DX


def prueba_un_diagnostico_de_un_anio_anterior_no_anula_el_de_este():
    previos = [replace(a, id_cita="previo", fecha_atencion=date(2025, 2, 1)) for a in BASE]
    assert [c.fecha_diagnostico for c in evaluar(previos + BASE)] == [DX]


def prueba_un_diagnostico_posterior_al_periodo_no_cuenta():
    assert evaluar(BASE, fecha_fin_evaluacion=date(2026, 2, 28)) == []


def prueba_dos_tipos_de_cancer_son_dos_casos():
    mama = [fila("mama", DX + timedelta(days=60), "C509", "D"), fila("mama", DX + timedelta(days=60), "19100", "D", "A")]
    assert [c.tipo_cancer for c in evaluar(BASE + mama)] == ["CUELLO_UTERINO", "MAMA"]


# ---- Las exclusiones ----------------------------------------------------------


def prueba_fallecer_dentro_del_plazo_excluye_y_se_dice_el_motivo():
    (caso,) = evaluar(BASE, fecha_defuncion=DX + timedelta(days=37))
    assert not caso.en_denominador and caso.motivo_exclusion == MOTIVO_FALLECIO
    assert en_denominador(BASE, fecha_defuncion=DX + timedelta(days=38))
    assert en_denominador(BASE, fecha_defuncion=DX - timedelta(days=1))


def prueba_el_paliativo_excluye_desde_el_dia_del_diagnostico():
    assert len(en_denominador(BASE + paliativo(-1))) == 1
    for dias in (0, 60):
        (caso,) = evaluar(BASE + paliativo(dias))
        assert not caso.en_denominador and caso.motivo_exclusion == MOTIVO_PALIATIVO


def prueba_el_paliativo_sin_diagnostico_repetido_en_su_cita_no_excluye():
    filas = paliativo(5)
    filas[1] = replace(filas[1], id_cita="otra")
    assert len(en_denominador(BASE + filas)) == 1


def prueba_el_paliativo_saca_a_la_persona_de_todos_sus_tipos():
    mama = [fila("mama", DX + timedelta(days=60), "C509", "D"), fila("mama", DX + timedelta(days=60), "19100", "D", "A")]
    casos = evaluar(BASE + mama + paliativo(30))
    assert len(casos) == 2 and en_denominador(BASE + mama + paliativo(30)) == []


def prueba_un_excluido_no_esta_en_el_numerador_aunque_tenga_tratamiento():
    (caso,) = evaluar(BASE + tratamiento(10), fecha_defuncion=DX + timedelta(days=20))
    assert not caso.en_denominador and not caso.en_numerador and caso.fecha_tratamiento is None


# ---- El numerador -------------------------------------------------------------


def prueba_el_tratamiento_dentro_del_plazo_cumple_y_guarda_su_fecha():
    (caso,) = evaluar(BASE + tratamiento(37))
    assert caso.en_numerador and caso.fecha_tratamiento == DX + timedelta(days=37)
    assert not evaluar(BASE + tratamiento(38))[0].en_numerador


def prueba_el_tratamiento_exige_la_misma_cita_y_valor_lab_uno():
    filas = tratamiento(10)
    assert not evaluar(BASE + [filas[0], replace(filas[1], valor_lab="2")])[0].en_numerador
    assert not evaluar(BASE + [filas[0], replace(filas[1], id_cita="otra")])[0].en_numerador


def prueba_el_tratamiento_de_otro_tipo_de_cancer_no_cumple():
    fecha = DX + timedelta(days=10)
    de_mama = [fila("t", fecha, "C509", "R"), fila("t", fecha, "96402", "D", "1")]
    assert not evaluar(BASE + de_mama)[0].en_numerador


def prueba_se_toma_el_primer_tratamiento():
    segundo = [replace(a, id_cita="t2", fecha_atencion=DX + timedelta(days=20)) for a in tratamiento(0)]
    assert evaluar(BASE + segundo + tratamiento(10))[0].fecha_tratamiento == DX + timedelta(days=10)


# ---- La fecha de corte --------------------------------------------------------

CORTE = date(2026, 8, 20)
TARDE = date(2026, 8, 21)


def prueba_lo_digitado_despues_del_corte_no_se_ve():
    assert evaluar([BASE[0], replace(BASE[1], fecha_registro=TARDE)], fecha_corte=CORTE) == []
    tardio = [replace(a, fecha_registro=TARDE) for a in paliativo(5)]
    assert len(en_denominador(BASE + tardio, fecha_corte=CORTE)) == 1
    filas = tratamiento(30)
    assert not evaluar(BASE + [filas[0], replace(filas[1], fecha_registro=TARDE)], fecha_corte=CORTE)[0].en_numerador


def prueba_lo_atendido_despues_del_corte_no_se_ve():
    corte = DX + timedelta(days=9)
    assert not evaluar(BASE + tratamiento(10), fecha_corte=corte)[0].en_numerador
    assert evaluar(BASE + tratamiento(9), fecha_corte=corte)[0].en_numerador


def prueba_una_fila_sin_fecha_de_registro_se_conserva():
    assert len(evaluar([replace(a, fecha_registro=None) for a in BASE], fecha_corte=CORTE)) == 1


# ---- Lo que se informa --------------------------------------------------------


def prueba_el_plazo_abierto_es_de_quien_aun_puede_cumplir():
    (sin_tratamiento,) = evaluar(BASE)
    assert plazo_abierto(sin_tratamiento, DX + timedelta(days=36))
    assert not plazo_abierto(sin_tratamiento, DX + timedelta(days=37))
    (con_tratamiento,) = evaluar(BASE + tratamiento(5))
    assert not plazo_abierto(con_tratamiento, DX + timedelta(days=10))
    (excluido,) = evaluar(BASE, fecha_defuncion=DX)
    assert not plazo_abierto(excluido, DX + timedelta(days=10))


def prueba_el_cumplimiento_es_el_logro_sobre_lo_esperado_sin_umbral():
    assert cumplimiento(7, 10) == 1.0
    assert cumplimiento(8, 10, grupo="A") == 1.0
    assert cumplimiento(4, 10, grupo="A") == 0.5


def prueba_sin_denominador_no_hay_cumplimiento_que_no_es_cero():
    assert cumplimiento(0, 0) is None
    assert cumplimiento(0, 10) == 0.0


# ---- Los registros por corregir ------------------------------------------------


def por_corregir(filas) -> ficha_14.PorCorregir | None:
    (caso,) = evaluar(BASE + filas)
    return caso.por_corregir


def prueba_un_tratamiento_sin_el_diagnostico_repetido_en_su_cita_queda_por_corregir():
    fecha = DX + timedelta(days=10)
    sin_repetido = [fila("t", fecha, "C539", "D"), fila("t", fecha, "96402", "D", "1")]
    assert por_corregir(sin_repetido) == ficha_14.PorCorregir(fecha, ficha_14.CORREGIR_SIN_REPETIDO)
    assert por_corregir([fila("t", fecha, "96402", "D", "1")]).motivo == ficha_14.CORREGIR_SIN_REPETIDO


def prueba_un_tratamiento_que_no_es_definitivo_o_sin_valor_lab_uno_queda_por_corregir():
    filas = tratamiento(10)
    assert por_corregir([filas[0], replace(filas[1], tipo_diagnostico="R")]).motivo == ficha_14.CORREGIR_NO_DEFINITIVO
    assert por_corregir([filas[0], replace(filas[1], valor_lab="")]).motivo == ficha_14.CORREGIR_VALOR_LAB


def prueba_un_tratamiento_de_otro_cancer_no_es_un_error_de_registro():
    fecha = DX + timedelta(days=10)
    de_mama = [fila("t", fecha, "C509", "R"), fila("t", fecha, "96402", "D", "1")]
    assert por_corregir(de_mama) is None


def prueba_fuera_del_plazo_o_con_tratamiento_valido_no_hay_nada_que_corregir():
    tarde = [replace(a, valor_lab="") if a.codigo_item == "96402" else a for a in tratamiento(38)]
    assert por_corregir(tarde) is None
    (caso,) = evaluar(BASE + tratamiento(10) + [replace(a, id_cita="t2", valor_lab="") for a in tratamiento(12)])
    assert caso.en_numerador and caso.por_corregir is None


def prueba_un_excluido_no_tiene_registro_por_corregir():
    filas = tratamiento(10)
    (caso,) = evaluar(BASE + [filas[0], replace(filas[1], valor_lab="")], fecha_defuncion=DX + timedelta(days=20))
    assert caso.por_corregir is None
