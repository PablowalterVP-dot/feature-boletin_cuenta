"""El cálculo de la Ficha 14 de punta a punta: de lo cargado en `fuente` a lo
guardado en `desempeno` (`python -m app.herramientas.calcular_desempeno`).

Con tramas y reportes inventados.
"""

from datetime import date

import pytest
from sqlalchemy import func, select

from app.datos.modelos import Corrida, ResultadoMensual, ResultadoPaciente
from app.dominio.desempeno.ficha_14 import MOTIVO_FALLECIO, MOTIVO_PALIATIVO
from app.herramientas import calcular_desempeno
from app.servicios.desempeno import Calculo, CalculoRechazado, MesCalculado, calcular_ficha_14
from app.servicios.fuentes import cargar_his, cargar_sinadef
from prueba_cargar_sinadef import certificado, reporte
from prueba_servicio_desempeno import atencion, trama

pytestmark = pytest.mark.bd


def persona(documento: str, cita: int, fecha: str, *, tratamiento: str | None = None, paliativo: str | None = None, **otros) -> list[dict]:
    """Una mujer con cáncer de cuello uterino diagnosticado y confirmado ese día."""
    quien = {"numero_documento_paciente": documento, **otros}
    filas = [atencion(str(cita), fecha, "C539", "D", **quien), atencion(str(cita), fecha, "57500", "D", "A", **quien)]
    if tratamiento:
        filas += [atencion(str(cita + 1), tratamiento, "C539", "R", **quien), atencion(str(cita + 1), tratamiento, "96402", "D", "1", **quien)]
    if paliativo:
        filas += [atencion(str(cita + 2), paliativo, "C539", "R", **quien), atencion(str(cita + 2), paliativo, "99489", "D", "1", **quien)]
    return filas


# Enero: una con tratamiento a tiempo y una sin él. Febrero: una fallecida en el
# plazo y una paliativa. Marzo: una diagnosticada el 20, sin tratamiento.
ATENCIONES = [
    *persona("11111111", 100, "2026-01-10", tratamiento="2026-02-05"),
    *persona("22222222", 200, "2026-01-20"),
    *persona("33333333", 300, "2026-02-03"),
    *persona("44444444", 400, "2026-02-10", paliativo="2026-02-25"),
    *persona("55555555", 500, "2026-03-20"),
]


@pytest.fixture
def cargado(sesion, tmp_path, monkeypatch):
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", ATENCIONES))
    cargar_sinadef(
        sesion,
        reporte(tmp_path, monkeypatch, "febrero-2026.xls", [certificado(1, documento="33333333", fecha="20/02/2026", registro="21/02/2026")], desde="01/02/2026", hasta="28/02/2026"),
    )
    return sesion


def cifras(calculo: Calculo) -> list[tuple[int, int, int, int]]:
    return [(m.mes, m.numerador, m.denominador, m.plazo_abierto) for m in calculo.meses]


# ------------------------------------------------------------------ el cálculo


def prueba_calcula_cada_mes_y_dice_quien_quedo_fuera(cargado):
    c = calcular_ficha_14(cargado, anio=2026)
    # Lo cargado llega hasta el 31 de marzo: el plazo de quien fue diagnosticada el 20 sigue abierto.
    assert cifras(c) == [(1, 1, 2, 0), (2, 0, 0, 0), (3, 0, 1, 1)]
    assert (c.numerador, c.denominador, c.plazo_abierto) == (1, 3, 1)
    assert c.excluidos == {MOTIVO_FALLECIO: 1, MOTIVO_PALIATIVO: 1}
    assert (c.mes_hasta, c.fecha_fin_observacion, c.casos) == (3, date(2026, 3, 31), 5)
    assert c.avisos == ["SINADEF está cargado hasta 2026-02 y el HIS se observa hasta el 31/03/2026: una defunción posterior no se conoce."]


def prueba_guarda_la_corrida_sus_meses_y_sus_casos(cargado):
    c = calcular_ficha_14(cargado, anio=2026, observacion="de prueba")
    corrida = cargado.get(Corrida, c.corrida_id)
    assert (corrida.anio, corrida.mes_desde, corrida.mes_hasta, corrida.fecha_corte, corrida.observacion) == (2026, 1, 3, None, "de prueba")
    assert corrida.detalle["his"][0]["archivo"] == "CONSOLIDADO_NominalTrama05042026_100000.csv"
    assert corrida.detalle["mes_con_corte"] == 0
    assert corrida.detalle["defunciones"] == {"al_dia": {"conocidas": 1, "de_certificados": 1, "verificadas_a_mano": 0}}
    meses = cargado.execute(select(ResultadoMensual.mes, ResultadoMensual.numerador, ResultadoMensual.denominador, ResultadoMensual.plazo_abierto).where(ResultadoMensual.corrida_id == c.corrida_id).order_by(ResultadoMensual.mes)).all()
    assert [tuple(m) for m in meses] == cifras(c)
    casos = {p.numero_documento: p for p in cargado.scalars(select(ResultadoPaciente).where(ResultadoPaciente.corrida_id == c.corrida_id))}
    assert len(casos) == 5
    tratada, fallecida, paliativa, abierta = casos["11111111"], casos["33333333"], casos["44444444"], casos["55555555"]
    assert (tratada.categoria, tratada.fecha_referencia, tratada.es_numerador, tratada.fecha_cumplimiento) == ("CUELLO_UTERINO", date(2026, 1, 10), True, date(2026, 2, 5))
    assert (fallecida.es_denominador, fallecida.motivo_exclusion, fallecida.detalle) == (False, MOTIVO_FALLECIO, {"fecha_defuncion": "2026-02-20"})
    assert (paliativa.es_denominador, paliativa.motivo_exclusion, paliativa.detalle) == (False, MOTIVO_PALIATIVO, {})
    assert abierta.es_denominador and abierta.es_plazo_abierto and not abierta.es_numerador


def prueba_cada_calculo_es_una_corrida_nueva_y_no_pisa_la_anterior(cargado):
    primera = calcular_ficha_14(cargado, anio=2026)
    segunda = calcular_ficha_14(cargado, anio=2026)
    assert primera.corrida_id != segunda.corrida_id
    assert cargado.scalar(select(func.count()).select_from(ResultadoPaciente).where(ResultadoPaciente.corrida_id == primera.corrida_id)) == 5


def prueba_el_corte_vale_para_los_meses_ya_terminados_y_los_demas_van_al_dia(cargado):
    c = calcular_ficha_14(cargado, anio=2026, fecha_corte=date(2026, 2, 15))
    assert (c.mes_con_corte, c.mes_hasta, c.fecha_fin_observacion) == (1, 3, date(2026, 3, 31))
    # Enero, visto el 15 de febrero: el tratamiento del 5 ya estaba; el plazo de
    # la diagnosticada el 20 de enero seguía abierto. Febrero y marzo, al día.
    assert cifras(c) == [(1, 1, 2, 1), (2, 0, 0, 0), (3, 0, 1, 1)]
    assert c.excluidos == {MOTIVO_FALLECIO: 1, MOTIVO_PALIATIVO: 1}
    corrida = cargado.get(Corrida, c.corrida_id)
    assert (corrida.fecha_corte, corrida.detalle["mes_con_corte"]) == (date(2026, 2, 15), 1)
    assert set(corrida.detalle["defunciones"]) == {"al_corte", "al_dia"}


def prueba_lo_digitado_despues_del_corte_no_entra_al_mes_con_corte_ni_reaparece_despues(sesion, tmp_path):
    filas = [
        *persona("11111111", 100, "2026-01-10"),
        *persona("22222222", 200, "2026-01-25", fecha_registro="2026-03-01 09:00:00"),
        *persona("33333333", 300, "2026-03-05"),
        atencion("900", "2026-02-10", "Z000", "D"),
    ]
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", filas))
    con_corte = calcular_ficha_14(sesion, anio=2026, fecha_corte=date(2026, 2, 15))
    assert [(m.mes, m.denominador) for m in con_corte.meses] == [(1, 1), (2, 0), (3, 1)]
    assert [(m.mes, m.denominador) for m in calcular_ficha_14(sesion, anio=2026).meses] == [(1, 2), (2, 0), (3, 1)]


def prueba_si_solo_se_piden_meses_con_corte_todo_se_ve_al_corte(cargado):
    c = calcular_ficha_14(cargado, anio=2026, mes_hasta=1, fecha_corte=date(2026, 2, 15))
    assert (c.mes_con_corte, c.fecha_fin_observacion, cifras(c)) == (1, date(2026, 2, 15), [(1, 1, 2, 1)])


def prueba_un_corte_anterior_a_que_termine_enero_no_sirve(cargado):
    with pytest.raises(CalculoRechazado, match="ningún mes de 2026 había terminado"):
        calcular_ficha_14(cargado, anio=2026, fecha_corte=date(2026, 1, 20))


def prueba_no_calcula_meses_que_no_estan_cargados(cargado):
    with pytest.raises(CalculoRechazado, match="solo hasta el 03"):
        calcular_ficha_14(cargado, anio=2026, mes_hasta=5)
    with pytest.raises(CalculoRechazado, match="No está cargado enero de 2025"):
        calcular_ficha_14(cargado, anio=2025)
    assert cargado.scalar(select(func.count()).select_from(Corrida)) == 0


def prueba_tras_un_hueco_no_se_sigue_contando(sesion, tmp_path):
    filas = persona("11111111", 100, "2026-01-10") + persona("22222222", 200, "2026-03-10")
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", filas))
    c = calcular_ficha_14(sesion, anio=2026)
    # Lo observado sin huecos acaba el 31 de enero: el plazo de la de enero sigue abierto.
    assert (c.mes_hasta, c.fecha_fin_observacion, cifras(c)) == (1, date(2026, 1, 31), [(1, 0, 1, 1)])
    assert c.avisos == ["No hay ningún reporte de SINADEF cargado: nadie sale del denominador por fallecimiento."]


# ----------------------------------------------------------------- el comando


def prueba_el_resultado_se_lee_en_la_terminal_sin_ningun_documento():
    meses = [MesCalculado(1, 1, 2, 0), MesCalculado(2, 0, 0, 0), MesCalculado(3, 0, 1, 1)]
    c = Calculo(7, 2026, 3, date(2026, 3, 8), 2, date(2026, 3, 31), meses, {MOTIVO_FALLECIO: 1}, 4, ["un aviso"])
    assert calcular_desempeno.lineas_de(c, ensayo=False) == [
        "Ficha 14 · 2026",
        "",
        "  Mes         Numerador  Denominador",
        "  Enero               1            2",
        "  Febrero             0            0",
        "  Marzo               0            1",
        "",
        "Enero a febrero: con el corte oficial del 08/03/2026.",
        "Marzo: al día, con los datos cargados hasta el 31/03/2026; puede cambiar.",
        "ATENCIÓN: un aviso",
        "Guardado como corrida 7.",
    ]
    assert calcular_desempeno.lineas_de(c, ensayo=True)[-1] == "ENSAYO: no se guardó nada."


def prueba_sin_corte_todo_se_dice_al_dia():
    c = Calculo(8, 2026, 2, None, 0, date(2026, 2, 28), [MesCalculado(1, 1, 2, 0), MesCalculado(2, 0, 1, 1)], {}, 3)
    assert calcular_desempeno.lineas_de(c, ensayo=False)[-2:] == ["Enero a febrero: al día, con los datos cargados hasta el 28/02/2026; puede cambiar.", "Guardado como corrida 8."]


def prueba_una_ficha_sin_calculo_se_dice_y_no_se_inventa(capsys):
    assert calcular_desempeno.main(["--ficha", "3", "--anio", "2026"]) == 1
    assert "La ficha 3 aún no tiene cálculo" in capsys.readouterr().err
