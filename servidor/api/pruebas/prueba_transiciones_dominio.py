"""Reglas de las transiciones. Sin base de datos."""

from datetime import date

import pytest

from app.dominio import estados, permisos, transiciones as t
from app.dominio.transiciones import (
    AccionDesconocida,
    EstadoNoPermite,
    HallazgoVisto,
    HallazgosBloquean,
    PeriodoFuturo,
    ReporteYaExiste,
    SinCargaAceptada,
    TransicionBD,
)

# Las dos filas que quedan vigentes tras bd/flujo/01_entrega_directa.sql (12/10/2026).
DE_LA_BD = [
    TransicionBD("enviar", "borrador", "remitido", permisos.REPORTE_ENVIAR),
    TransicionBD("rectificar", "remitido", "borrador", permisos.REPORTE_RECTIFICAR),
]


def error(h: str, titulo="x", justificacion=None) -> HallazgoVisto:
    return HallazgoVisto(f"{h}|clave", "error", titulo, justificacion)


def aviso(justificacion: str | None, clave="atipico|f3|liquida.cena|21") -> HallazgoVisto:
    return HallazgoVisto(clave, "aviso", "100 raciones: el resto del mes ronda las 10", justificacion)


# ------------------------------------------------------------------- resolver


def prueba_cada_transicion_se_resuelve_desde_su_estado_de_origen():
    for fila in DE_LA_BD:
        assert t.resolver(DE_LA_BD, fila.origen, fila.accion) == fila


def prueba_enviar_entrega_directamente():
    """12/10/2026: el bot es la validación; enviar deja el reporte remitido."""
    assert t.resolver(DE_LA_BD, "borrador", "enviar").destino == "remitido"


def prueba_una_accion_desde_un_estado_que_no_la_permite_dice_desde_cuales_si():
    with pytest.raises(EstadoNoPermite) as e:
        t.resolver(DE_LA_BD, "borrador", "rectificar")
    assert e.value.codigo == "estado_no_permite"
    assert e.value.datos["desde"] == ["remitido"] and "borrador" in e.value.mensaje


@pytest.mark.parametrize("estado, accion", [("remitido", "enviar"), ("borrador", "rectificar")])
def prueba_no_se_puede_repetir_ni_adelantar_una_accion(estado, accion):
    with pytest.raises(EstadoNoPermite):
        t.resolver(DE_LA_BD, estado, accion)


@pytest.mark.parametrize("accion", ["revisar", "validar", "remitir", "devolver"])
def prueba_las_acciones_de_estadistica_ya_no_existen(accion):
    """Una acción retirada no se confunde con un estado incorrecto: no existe."""
    with pytest.raises(AccionDesconocida) as e:
        t.resolver(DE_LA_BD, "remitido", accion)
    assert e.value.codigo == "accion_desconocida"


def prueba_crear_no_esta_entre_las_transiciones_guardadas():
    with pytest.raises(AccionDesconocida):
        t.resolver(DE_LA_BD, "no_iniciado", "crear")


def prueba_no_iniciado_no_admite_ninguna_transicion_guardada():
    for accion in ("enviar", "rectificar"):
        with pytest.raises(EstadoNoPermite):
            t.resolver(DE_LA_BD, estados.NO_INICIADO, accion)


def prueba_resolver_sigue_lo_que_diga_la_bd_y_no_una_lista_fija():
    """Si Alejandro cambiara una transición, el backend lo seguiría."""
    con_cambio = [TransicionBD("enviar", "borrador", "otro", permisos.REPORTE_ENVIAR)]
    assert t.resolver(con_cambio, "borrador", "enviar").destino == "otro"
    with pytest.raises(AccionDesconocida):
        t.resolver(con_cambio, "remitido", "rectificar")


def prueba_las_transiciones_de_la_bd_coinciden_con_la_maquina_de_python():
    """Las filas de arriba son las vigentes; la maquina de estados.py las
    contiene todas (más `crear`)."""
    de_python = {(x.accion, d, x.hasta) for x in estados.TRANSICIONES for d in x.desde if x.accion != "crear"}
    assert {(x.accion, x.origen, x.destino) for x in DE_LA_BD} == de_python


# ---------------------------------------------------------------------- crear


def prueba_crear_solo_procede_si_el_reporte_no_existe():
    t.resolver_crear(estados.NO_INICIADO)
    for existente in ("borrador", "remitido"):
        with pytest.raises(ReporteYaExiste) as e:
            t.resolver_crear(existente)
        assert e.value.datos["estado"] == existente


def prueba_acciones_disponibles_por_estado():
    assert t.acciones_disponibles(DE_LA_BD, "no_iniciado") == ["crear"]
    assert t.acciones_disponibles(DE_LA_BD, "borrador") == ["enviar"]
    assert t.acciones_disponibles(DE_LA_BD, "remitido") == ["rectificar"]


# -------------------------------------------------------------------- periodos


def prueba_se_puede_crear_el_periodo_vigente_y_los_anteriores():
    hoy = date(2026, 9, 13)  # vigente: agosto
    t.comprobar_periodo_creable("2026-08", hoy)
    t.comprobar_periodo_creable("2026-01", hoy)
    t.comprobar_periodo_creable("2025-12", hoy)


def prueba_no_se_puede_crear_un_periodo_posterior_al_vigente():
    with pytest.raises(PeriodoFuturo) as e:
        t.comprobar_periodo_creable("2026-09", date(2026, 9, 13))
    assert e.value.datos == {"periodo": "2026-09", "vigente": "2026-08"}


def prueba_el_periodo_vigente_avanza_con_el_mes():
    with pytest.raises(PeriodoFuturo):
        t.comprobar_periodo_creable("2026-09", date(2026, 9, 30))
    t.comprobar_periodo_creable("2026-09", date(2026, 10, 1))  # ya terminó septiembre


def prueba_el_periodo_vigente_cruza_el_anio():
    t.comprobar_periodo_creable("2025-12", date(2026, 1, 5))
    with pytest.raises(PeriodoFuturo):
        t.comprobar_periodo_creable("2026-01", date(2026, 1, 5))


# --------------------------------------------------------------------- constancia


def prueba_la_constancia_lleva_el_numero_de_rectificacion_mas_uno():
    """El caso del bug: enviar, rectificar y reenviar."""
    assert t.numero_de_envio(0) == 1 and t.numero_de_envio(1) == 2 and t.numero_de_envio(2) == 3
    assert t.constancia_de_envio("2026-08", "NUT", 0) == "CR-2026-08-NUT"
    assert t.constancia_de_envio("2026-08", "NUT", 1) == "CR-2026-08-NUT-2"
    assert t.constancia_de_envio("2026-08", "NUT", 2) == "CR-2026-08-NUT-3"


def prueba_un_reenvio_nunca_repite_la_constancia_del_anterior():
    constancias = [t.constancia_de_envio("2026-08", "NUT", n) for n in range(6)]
    assert len(set(constancias)) == 6


# ---------------------------------------------------------------------- enviar


def prueba_sin_carga_aceptada_no_se_envia_aunque_no_haya_hallazgos():
    with pytest.raises(SinCargaAceptada) as e:
        t.comprobar_se_puede_enviar(False, [])
    assert e.value.codigo == "sin_carga_aceptada"


def prueba_con_carga_y_sin_hallazgos_se_envia():
    t.comprobar_se_puede_enviar(True, [])


def prueba_un_error_bloquea_y_no_admite_justificacion():
    con_justificacion = error("incompleto", justificacion="lo explico igual")
    with pytest.raises(HallazgosBloquean) as e:
        t.comprobar_se_puede_enviar(True, [con_justificacion])
    assert e.value.datos["errores"] == [{"clave": "incompleto|clave", "titulo": "x"}] and e.value.datos["avisos_sin_justificar"] == []


def prueba_un_error_documentado_en_una_carga_historica_no_bloquea():
    documentado = error("tecnologos", justificacion=f"{t.PREFIJO_ERROR_DOCUMENTADO} Los tecnólogos suman 1429 y los atendidos 1340.")
    t.comprobar_se_puede_enviar(True, [documentado])


def prueba_el_prefijo_tiene_que_estar_al_principio():
    casi = error("tecnologos", justificacion=f"Lo explico: {t.PREFIJO_ERROR_DOCUMENTADO}")
    with pytest.raises(HallazgosBloquean):
        t.comprobar_se_puede_enviar(True, [casi])


def prueba_un_aviso_sin_justificar_bloquea_igual_que_un_error():
    with pytest.raises(HallazgosBloquean) as e:
        t.comprobar_se_puede_enviar(True, [aviso(None)])
    assert e.value.datos["avisos_sin_justificar"][0]["clave"] == "atipico|f3|liquida.cena|21"
    assert "1 aviso sin justificar" in e.value.mensaje


@pytest.mark.parametrize("vacia", [None, "", "   ", "\n\t "])
def prueba_una_justificacion_en_blanco_no_cuenta(vacia):
    with pytest.raises(HallazgosBloquean):
        t.comprobar_se_puede_enviar(True, [aviso(vacia)])


def prueba_un_aviso_justificado_no_bloquea():
    t.comprobar_se_puede_enviar(True, [aviso("Fue el simulacro del día 21.")])


def prueba_la_informacion_no_bloquea():
    t.comprobar_se_puede_enviar(True, [HallazgoVisto("filas-iguales|f1", "info", "Dos comidas iguales", None)])


def prueba_el_mensaje_cuenta_errores_y_avisos_en_singular_y_plural():
    with pytest.raises(HallazgosBloquean) as e:
        t.comprobar_se_puede_enviar(True, [error("a"), error("b"), aviso(None, "x1"), aviso(" ", "x2"), aviso("ok", "x3")])
    assert e.value.mensaje == "No se puede enviar: 2 errores por corregir y 2 avisos sin justificar."
    with pytest.raises(HallazgosBloquean) as solo:
        t.comprobar_se_puede_enviar(True, [error("a")])
    assert solo.value.mensaje == "No se puede enviar: 1 error por corregir."


def prueba_sin_carga_gana_sobre_los_hallazgos():
    """Sin Excel no hay hallazgos que mirar: el error que importa es que falta el archivo."""
    with pytest.raises(SinCargaAceptada):
        t.comprobar_se_puede_enviar(False, [error("a")])


# ------------------------------------------------------------------- el historial


def prueba_cada_accion_deja_una_nota_estandar():
    assert t.nota_de_historial("crear") == "Abre el reporte del periodo."
    assert t.nota_de_historial("enviar", constancia="CR-2026-08-NUT-2") == "Entregado, validado por el bot, a Estadística. Constancia CR-2026-08-NUT-2."


def prueba_enviar_anota_a_que_oficinas_llego():
    nota = t.nota_de_historial("enviar", constancia="CR-2026-08-NUT", destinos=["planeamiento", "epidemiologia"])
    assert nota == "Entregado, validado por el bot, a Estadística y a: epidemiologia, planeamiento. Constancia CR-2026-08-NUT."


def prueba_rectificar_registra_siempre_el_numero_y_la_consecuencia_aunque_no_haya_comentario():
    nota = t.nota_de_historial("rectificar", numero_rectificacion=2)
    assert "n.º 2" in nota and "versión desactualizada" in nota


def prueba_un_comentario_se_agrega_a_la_nota_estandar_sin_reemplazarla():
    nota = t.nota_de_historial("rectificar", numero_rectificacion=1, comentario="  Llegó una corrección del día 21.  ")
    assert nota.startswith("Reabierto para rectificación (n.º 1).") and nota.endswith("Llegó una corrección del día 21.")
    assert t.nota_de_historial("crear", comentario="Todo en orden.").endswith("Todo en orden.")


def prueba_un_comentario_en_blanco_no_ensucia_la_nota():
    assert t.nota_de_historial("crear", comentario="   ") == t.nota_de_historial("crear")


# ----------------------------------------------------------- pureza del módulo


def prueba_el_modulo_no_depende_de_infraestructura():
    """La frontera de `dominio/`: ni SQLAlchemy ni FastAPI. (`prueba_dominio.py` lo
    vigila para todo el paquete; aquí se deja dicho porque este módulo es el que más
    tentaría a importarlos.)"""
    import ast
    from pathlib import Path

    fuente = Path(t.__file__).read_text(encoding="utf-8")
    importados = {n.module or "" for n in ast.walk(ast.parse(fuente)) if isinstance(n, ast.ImportFrom)}
    assert not any(m.startswith(("sqlalchemy", "fastapi", "starlette", "app.datos", "app.api")) for m in importados)
