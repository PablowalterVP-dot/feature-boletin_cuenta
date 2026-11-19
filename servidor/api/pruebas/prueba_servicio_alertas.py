"""El servicio de alertas, contra la base de Alejandro: `semana con datos
faltantes`, sobre el periodo vigente de Nutrición (agosto, con el reloj
puesto en septiembre: el oficio real de Nutrición usa el catálogo de
EJEMPLO de 36 indicadores en 4 cuadros, igual que `prueba_servicio_valores.py`)."""

from datetime import datetime

import pytest
from sqlalchemy import select

import escenario as e
from app.datos.base import vigente
from app.datos.modelos import Parametro
from app.dominio.reloj import ZONA, RelojFijo
from app.herramientas.configurar_alertas import configurar as configurar_alertas
from app.servicios.alertas import alertas_de
from app.servicios.errores import NoEncontrado, SinPermiso

pytestmark = pytest.mark.bd

INDICADOR = "f3.liquida.cena"


@pytest.fixture
def dig(sesion):
    return e.digitador_de_nutricion(sesion)


def reloj(dia: int, mes: int = 9) -> RelojFijo:
    return RelojFijo(datetime(2026, mes, dia, 12, 0, tzinfo=ZONA))


def alertas(sesion, actor, rel, periodo="2026-08"):
    return alertas_de(sesion, actor, rel, formato="NUT", periodo=periodo)


def escribir(sesion, reporte, dias):
    for d in dias:
        e.escribir_valor(sesion, reporte, INDICADOR, d, 10)


# ------------------------------------------------------------------- de cuándo


def prueba_sin_reporte_no_alerta(sesion, dig):
    assert alertas(sesion, dig, reloj(13)) == []


def prueba_fuera_del_periodo_vigente_no_alerta(sesion, dig):
    e.abrir_reporte(sesion, "NUT", 7, "borrador")
    assert alertas(sesion, dig, reloj(13), periodo="2026-07") == []


def prueba_un_reporte_ya_enviado_no_alerta(sesion, dig):
    """Enviado en adelante, el bot ya exigió todas las casillas: no puede
    haber hueco que señalar. Se prueba con un hueco real (no por falta de
    datos): si el filtro de estado desapareciera, esto SÍ alertaría.

    Las casillas solo se escriben en borrador (lo exige la base); el
    reporte se pasa a «remitido» después, a mano, igual que hace
    `escenario.abrir_reporte` para preparar datos sin pasar por el flujo."""
    reporte = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, reporte)
    escribir(sesion, reporte, [d for d in range(1, 32) if not (3 <= d <= 9)])
    reporte.estado_reporte_id = e.ids_de(sesion)["remitido"]
    sesion.flush()
    assert alertas(sesion, dig, reloj(13)) == []


# ------------------------------------------------------- semana con datos faltantes


def prueba_sin_ninguna_subida_no_alerta(sesion, dig):
    """Nutrición entrega mensual: no sube a mitad de mes. Sin esta regla,
    alertaría todos los días hasta que suban algo."""
    e.abrir_reporte(sesion, "NUT", 8, "borrador")
    assert alertas(sesion, dig, reloj(13)) == []


def prueba_una_subida_parcial_con_una_semana_cerrada_con_huecos_alerta(sesion, dig):
    reporte = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, reporte)  # deja la estructura activa, sin tocar el estado
    # Todo agosto salvo la semana del 3 al 9 (agosto de 2026 empieza en sábado).
    escribir(sesion, reporte, [d for d in range(1, 32) if not (3 <= d <= 9)])

    lista = alertas(sesion, dig, reloj(13))
    assert len(lista) == 1
    assert "3" in lista[0].titulo and "9" in lista[0].titulo
    assert "3, 4, 5, 6, 7, 8, 9" in lista[0].cuerpo


def prueba_un_indicador_ausente_todo_el_mes_no_hace_faltar_ningun_dia(sesion, dig):
    """Un día cuenta como faltante solo si NINGÚN indicador tiene dato: hay
    grupos que legítimamente no existen algunos meses (internos que rotan,
    PATRIMONIO). Aquí se escribe un solo indicador, todos los días: basta."""
    reporte = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, reporte)
    escribir(sesion, reporte, range(1, 32))
    assert alertas(sesion, dig, reloj(13)) == []


def prueba_un_texto_ilegible_cuenta_como_dato_del_dia(sesion, dig):
    """El área sí digitó algo ese día; que el bot no pudiera leerlo es otro
    problema (un error de la carga), no un hueco de digitación."""
    reporte = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, reporte)
    escribir(sesion, reporte, [d for d in range(1, 32) if d != 3])
    e.escribir_valor(sesion, reporte, INDICADOR, 3, None, texto_original="cuarenta")
    assert alertas(sesion, dig, reloj(13)) == []


def prueba_el_umbral_sembrado_se_usa(sesion, dig):
    reporte = e.abrir_reporte(sesion, "NUT", 8, "borrador")
    e.dar_carga_aceptada(sesion, reporte)
    # Falta solo el día 2 (de la semana 1-2): con umbral 2, no alcanza.
    escribir(sesion, reporte, [d for d in range(1, 32) if d != 2])

    assert alertas(sesion, dig, reloj(13)) != []  # respaldo final: 1 día basta

    configurar_alertas(sesion)
    fila = sesion.scalar(select(Parametro).where(Parametro.clave == "alerta.default.semana_incompleta_dias", vigente(Parametro)))
    fila.valor = "2"
    sesion.flush()
    assert alertas(sesion, dig, reloj(13)) == []


# ------------------------------------------------------------------- visibilidad


def prueba_sin_permiso_es_el_mismo_error_que_el_detalle(sesion):
    nadie = e.persona(sesion, "nadie")
    with pytest.raises(SinPermiso):
        alertas(sesion, nadie, reloj(13))


def prueba_formato_inexistente_es_404(sesion, dig):
    with pytest.raises(NoEncontrado):
        alertas_de(sesion, dig, reloj(13), formato="ZZZ", periodo="2026-08")
