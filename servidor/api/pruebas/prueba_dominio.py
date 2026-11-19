import ast
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from app.dominio import estados, folios, periodos, reloj, roles

DOMINIO = Path(__file__).resolve().parents[1] / "app" / "dominio"

# ------------------------------------------------------------------ frontera


def prueba_dominio_no_depende_de_infraestructura():
    """`dominio/` no importa SQLAlchemy, FastAPI, httpx ni las capas de arriba."""
    prohibidos = ("sqlalchemy", "fastapi", "httpx", "starlette", "psycopg", "app.datos", "app.api")
    for archivo in DOMINIO.glob("*.py"):
        for nodo in ast.walk(ast.parse(archivo.read_text(encoding="utf-8"))):
            if isinstance(nodo, ast.Import):
                nombres = [a.name for a in nodo.names]
            elif isinstance(nodo, ast.ImportFrom):
                nombres = [nodo.module or ""]
            else:
                continue
            for nombre in nombres:
                assert not nombre.startswith(prohibidos), f"{archivo.name} importa {nombre}"


# -------------------------------------------------------------------- estados


def prueba_reporte_no_iniciado_no_se_almacena():
    assert estados.NO_INICIADO not in estados.ESTADOS_ALMACENADOS
    assert estados.ESTADOS_ALMACENADOS == ("borrador", "remitido")


def prueba_tres_transiciones_cada_una_con_su_rol():
    """12/10/2026: sin revisar, validar ni remitir; el bot es la validación."""
    assert [t.accion for t in estados.TRANSICIONES] == ["crear", "enviar", "rectificar"]
    assert {t.rol for t in estados.TRANSICIONES} == {roles.AREA, roles.ESTADISTICA}


def prueba_el_area_solo_crea_y_envia():
    assert [t.accion for t in estados.transiciones_de("no_iniciado", roles.AREA)] == ["crear"]
    assert [t.accion for t in estados.transiciones_de("borrador", roles.AREA)] == ["enviar"]
    assert estados.transiciones_de("remitido", roles.AREA) == ()


def prueba_enviar_entrega_directamente_sin_pasar_por_estadistica():
    assert estados.transicion("enviar").hasta == estados.REMITIDO
    assert estados.transiciones_de("borrador", roles.ESTADISTICA) == ()


def prueba_una_oficina_no_puede_ninguna_transicion():
    for e in estados.ESTADOS:
        assert estados.transiciones_de(e.clave, roles.OFICINA) == ()


def prueba_nadie_puede_validar_ni_remitir():
    for rol in (roles.AREA, roles.ESTADISTICA, roles.OFICINA):
        assert not estados.puede("remitido", "validar", rol) and not estados.puede("remitido", "remitir", rol)


def prueba_una_accion_inexistente_no_se_puede():
    assert estados.transicion("devolver") is None
    assert not estados.puede("enviado", "devolver", roles.ESTADISTICA)


def prueba_no_hay_devolucion_con_observaciones():
    # Decisión del 13 de septiembre de 2026: Estadística no devuelve.
    # La única vuelta a borrador que dispara Estadística es reabrir un mes ya
    # remitido; nada devuelve un reporte recién enviado.
    assert [t.accion for t in estados.TRANSICIONES if t.hasta == estados.BORRADOR and t.rol == roles.ESTADISTICA] == ["rectificar"]


def prueba_ningun_estado_es_un_callejon_sin_salida():
    for e in estados.ESTADOS:
        salidas = [t for t in estados.TRANSICIONES if e.clave in t.desde]
        assert salidas, f"{e.clave} es un callejón sin salida"


def prueba_solo_el_borrador_es_editable():
    assert [e.clave for e in estados.ESTADOS if estados.es_editable(e.clave)] == ["borrador"]


def prueba_entregado_es_desde_que_sale_del_area():
    assert [e.clave for e in estados.ESTADOS if estados.esta_entregado(e.clave)] == ["remitido"]


def prueba_las_transiciones_que_confirman():
    assert {t.accion for t in estados.TRANSICIONES if t.confirmar} == {"enviar", "rectificar"}


# -------------------------------------------------------------------- periodos


@pytest.mark.parametrize("valor", ["2026-08", "1999-01", "2026-12"])
def prueba_periodos_validos(valor):
    assert periodos.es_periodo(valor)


@pytest.mark.parametrize("valor", ["2026-8", "2026-13", "2026-00", "26-08", "2026/08", "", None, 202608])
def prueba_periodos_invalidos(valor):
    assert not periodos.es_periodo(valor)


def prueba_mes_anterior_cruza_el_anio():
    assert periodos.mes_anterior("2026-01") == "2025-12"
    assert periodos.mes_anterior("2026-03", 3) == "2025-12"
    assert periodos.mes_siguiente("2025-12") == "2026-01"


def prueba_en_septiembre_se_reporta_agosto():
    assert periodos.periodo_vigente(date(2026, 9, 13)) == "2026-08"
    assert periodos.periodo_vigente(date(2026, 1, 2)) == "2025-12"


def prueba_el_plazo_vence_el_dia_10_del_mes_siguiente():
    assert periodos.plazo_de("2026-08") == date(2026, 9, 10)
    assert periodos.plazo_de("2026-12") == date(2027, 1, 10)


def prueba_vencimiento_y_retraso():
    # El «hoy» del prototipo: tres días después del vencimiento de agosto.
    hoy = date(2026, 9, 13)
    assert periodos.esta_vencido("2026-08", hoy)
    assert periodos.dias_de_retraso("2026-08", hoy) == 3
    assert not periodos.esta_vencido("2026-08", date(2026, 9, 10))
    assert periodos.dias_de_retraso("2026-08", date(2026, 9, 1)) == -9


def prueba_los_periodos_se_ordenan_como_cadenas():
    assert "2025-12" < "2026-01" < "2026-02"


def prueba_un_periodo_invalido_lanza():
    with pytest.raises(ValueError):
        periodos.mes_anterior("2026-13")


# --------------------------------------------------------------------- folios


def prueba_folio_por_periodo_y_sigla():
    assert folios.folio("2026-08", "NUT") == "RE-2026-08-NUT"


def prueba_la_primera_constancia_no_lleva_numero():
    assert folios.constancia("2026-08", "NUT") == "CR-2026-08-NUT"
    assert folios.constancia("2026-08", "NUT", 1) == "CR-2026-08-NUT"


def prueba_cada_reenvio_tiene_su_propia_constancia():
    numeradas = [folios.constancia("2026-08", "NUT", n) for n in (1, 2, 3)]
    assert numeradas == ["CR-2026-08-NUT", "CR-2026-08-NUT-2", "CR-2026-08-NUT-3"]
    assert len(set(numeradas)) == 3


def prueba_lo_mismo_para_las_actas():
    assert folios.acta("2026-08", "NUT") == "AR-2026-08-NUT"
    assert folios.acta("2026-08", "NUT", 2) == "AR-2026-08-NUT-2"


def prueba_el_numero_de_envio_empieza_en_uno():
    with pytest.raises(ValueError):
        folios.constancia("2026-08", "NUT", 0)


def prueba_constancia_de_diresa():
    assert folios.constancia_diresa("2026-08") == "DIR-2026-08"


# ---------------------------------------------------------------------- reloj


def prueba_el_reloj_del_sistema_esta_en_lima():
    assert reloj.RelojSistema().ahora().utcoffset().total_seconds() == -5 * 3600


def prueba_reloj_fijo_es_controlable():
    r = reloj.RelojFijo(datetime(2026, 9, 13, 12, 0))
    assert r.ahora().utcoffset().total_seconds() == -5 * 3600
    r.fijar(datetime(2026, 10, 1, 8, 0))
    assert r.ahora().month == 10


def prueba_hoy_es_la_fecha_de_lima_no_la_de_utc():
    # 21:00 en Lima del 10 de septiembre ya es 02:00 del 11 en UTC.
    r = reloj.RelojFijo(datetime(2026, 9, 11, 2, 0, tzinfo=timezone.utc))
    assert reloj.hoy(r) == date(2026, 9, 10)
    assert not periodos.esta_vencido("2026-08", reloj.hoy(r))


# ------------------------------------------- el caso de la rectificación


def prueba_envio_rectificacion_y_reenvio_dan_comprobantes_distintos():
    """El bug del prototipo: `CR-…` se calculaba siempre igual, y un reenvío
    tras rectificar quedaba con el mismo número que el primero. La constancia es
    lo que la oficina ve, así que cada envío debe tener la suya.

    Quien rectifica es Estadística, no el área; y solo se rectifica un mes ya
    entregado. El área vuelve a enviar cuando corrige, y cada envío es también
    una remisión: llega a la vez a las oficinas (12/10/2026).
    """
    estado, envios = estados.NO_INICIADO, 0
    constancias, actas, folio = [], [], folios.folio("2026-08", "NUT")

    recorrido = [
        ("crear", roles.AREA),
        ("enviar", roles.AREA),        # envío y remisión 1
        ("rectificar", roles.ESTADISTICA),  # reabre el mes cerrado
        ("enviar", roles.AREA),        # envío y remisión 2: el reenvío
    ]
    for accion, rol in recorrido:
        assert estados.puede(estado, accion, rol), f"{accion} desde {estado} como {rol}"
        estado = estados.transicion(accion).hasta
        if accion == "enviar":
            envios += 1
            constancias.append(folios.constancia("2026-08", "NUT", envios))
            actas.append(folios.acta("2026-08", "NUT", envios))

    assert estado == estados.REMITIDO
    assert constancias == ["CR-2026-08-NUT", "CR-2026-08-NUT-2"]
    assert actas == ["AR-2026-08-NUT", "AR-2026-08-NUT-2"]
    # El folio, en cambio, identifica el trámite entero y no cambia.
    assert folio == "RE-2026-08-NUT"


def prueba_solo_estadistica_rectifica_y_solo_un_mes_remitido():
    assert not estados.puede("borrador", "rectificar", roles.ESTADISTICA)
    assert not estados.puede("remitido", "rectificar", roles.AREA)
    assert not estados.puede("remitido", "rectificar", roles.OFICINA)
    assert estados.puede("remitido", "rectificar", roles.ESTADISTICA)
