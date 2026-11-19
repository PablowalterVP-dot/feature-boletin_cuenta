"""El comando que deja el módulo listo de una vez
(`python -m app.herramientas.preparar_desempeno CARPETA`).

Aquí se prueba lo suyo: encontrar los archivos y saber si hay que calcular otra
vez. Cargar y calcular tienen sus propias pruebas.
"""

from datetime import date

import pytest

from app.herramientas import preparar_desempeno as preparar
from app.servicios.desempeno import calcular_ficha_14, corrida_al_dia
from app.servicios.fuentes import cargar_his, cargar_verificados
from prueba_calcular_desempeno import persona
from prueba_servicio_desempeno import trama

CORTE = date(2026, 2, 15)


def carpeta_de_datos(raiz, *, tramas=(), sinadef=True, verificados=True):
    (raiz / preparar.CONSOLIDADO).write_text("", encoding="utf-8")
    (raiz / preparar.CARPETA_DE_TRAMAS).mkdir()
    for nombre in tramas:
        (raiz / preparar.CARPETA_DE_TRAMAS / nombre).write_text("", encoding="utf-8")
    (raiz / preparar.CARPETA_DE_SINADEF).mkdir()
    if sinadef:
        (raiz / preparar.CARPETA_DE_SINADEF / "enero-2026.xls").write_text("", encoding="utf-8")
    if verificados:
        (raiz / preparar.VERIFICADOS).write_text("", encoding="utf-8")
    return raiz


# ------------------------------------------------------------- los archivos


def prueba_encuentra_los_archivos_por_su_nombre_de_origen(tmp_path):
    r = preparar.receta_de(carpeta_de_datos(tmp_path, tramas=["CONSOLIDADO_NominalTrama30092026_212639-septiembre-2026.csv"]))
    assert r.faltan == []
    assert r.consolidado.name == preparar.CONSOLIDADO and r.sinadef.name == preparar.CARPETA_DE_SINADEF and r.verificados.name == preparar.VERIFICADOS
    assert len(r.tramas) == 1


def prueba_las_tramas_se_cargan_de_la_mas_antigua_a_la_mas_nueva(tmp_path):
    # Por nombre, la del 28 de setiembre iría antes que la del 4: el orden es el de la extracción.
    tramas = ["CONSOLIDADO_NominalTrama30092026_212639-septiembre-2026.csv", "CONSOLIDADOAGOSTO_NominalTrama28092026_215720.csv", "CONSOLIDADO_NominalTrama04092026_103522-agosto.csv"]
    r = preparar.receta_de(carpeta_de_datos(tmp_path, tramas=tramas))
    assert [t.name[-25:] for t in r.tramas] == [t[-25:] for t in (tramas[2], tramas[1], tramas[0])]


def prueba_lo_que_falta_se_dice_todo_junto(tmp_path):
    (tmp_path / "vacia").mkdir()
    faltan = preparar.receta_de(tmp_path / "vacia").faltan
    assert len(faltan) == 2 and preparar.CONSOLIDADO in faltan[0] and preparar.CARPETA_DE_SINADEF in faltan[1]
    assert "No existe la carpeta" in preparar.receta_de(tmp_path / "no-esta").faltan[0]


def prueba_sin_los_verificados_se_sigue(tmp_path):
    r = preparar.receta_de(carpeta_de_datos(tmp_path, verificados=False))
    assert r.faltan == [] and r.verificados is None


def prueba_con_una_carpeta_incompleta_no_se_empieza(tmp_path, capsys):
    assert preparar.main([str(tmp_path)]) == 1
    assert "No se empezó" in capsys.readouterr().err


# ---------------------------------------------------- calcular solo si hace falta


@pytest.mark.bd
def prueba_sin_ninguna_corrida_hay_que_calcular(sesion):
    assert corrida_al_dia(sesion, numero=14, anio=2026, fecha_corte=CORTE) is None


@pytest.mark.bd
def prueba_si_no_entro_nada_nuevo_la_ultima_corrida_vale(sesion, tmp_path):
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", persona("11111111", 100, "2026-01-10") + persona("22222222", 200, "2026-02-10")))
    corrida = calcular_ficha_14(sesion, anio=2026, fecha_corte=CORTE).corrida_id
    assert corrida_al_dia(sesion, numero=14, anio=2026, fecha_corte=CORTE) == corrida
    # Con otro corte, o para otro año, esa corrida no sirve.
    assert corrida_al_dia(sesion, numero=14, anio=2026, fecha_corte=None) is None
    assert corrida_al_dia(sesion, numero=14, anio=2025, fecha_corte=CORTE) is None


@pytest.mark.bd
def prueba_si_entro_un_dato_despues_hay_que_calcular_de_nuevo(sesion, tmp_path):
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama05042026_100000.csv", persona("11111111", 100, "2026-01-10") + persona("22222222", 200, "2026-02-10")))
    corrida = calcular_ficha_14(sesion, anio=2026, fecha_corte=CORTE).corrida_id
    ruta = tmp_path / "verificados.csv"
    ruta.write_text("numero_documento,fecha_defuncion,fecha_registro\n11111111,2026-01-20,\n", encoding="utf-8")
    cargar_verificados(sesion, ruta)
    assert corrida_al_dia(sesion, numero=14, anio=2026, fecha_corte=CORTE) is None
    # Calculado otra vez, queda al día; y una trama más nueva lo vuelve a dejar atrás.
    nueva = calcular_ficha_14(sesion, anio=2026, fecha_corte=CORTE).corrida_id
    assert nueva != corrida and corrida_al_dia(sesion, numero=14, anio=2026, fecha_corte=CORTE) == nueva
    cargar_his(sesion, trama(tmp_path, "CONSOLIDADO_NominalTrama20042026_100000.csv", persona("11111111", 100, "2026-01-10") + persona("22222222", 200, "2026-02-10") + persona("33333333", 300, "2026-02-12")))
    assert corrida_al_dia(sesion, numero=14, anio=2026, fecha_corte=CORTE) is None
