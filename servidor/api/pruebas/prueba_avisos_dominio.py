"""Las reglas de los avisos, sin base de datos.

Lo que se protege: que un aviso exista **solo mientras su condición es cierta**, que cada
ámbito vea lo suyo y que la fecha nunca se invente.
"""

from datetime import date, datetime

from app.dominio import avisos as a
from app.dominio.reloj import ZONA

VIGENTE = "2026-08"


def renglon(periodo=VIGENTE, estado="no_iniciado", *, semaforo="pendiente", unidad="nutricion", rect=0, **otros) -> a.Renglon:
    base = dict(
        periodo=periodo, formato="NUT", formato_nombre="Raciones", unidad=unidad, unidad_nombre=unidad.capitalize(), estado=estado,
        semaforo=semaforo, dias_de_retraso=3 if semaforo == "vencido" else None, fecha_limite=date(2026, 9, 10),
        fecha_envio=None, fecha_validacion=None, numero_rectificacion=rect, folio_constancia=None,
    )
    return a.Renglon(**{**base, **otros})


def tipos(avisos) -> list[str]:
    return [x.tipo for x in avisos]


# ------------------------------------------------------------------------- área


def prueba_un_reporte_vencido_sin_enviar_avisa_atraso_desde_el_dia_siguiente_al_plazo():
    [aviso] = a.avisos_de_area([renglon(semaforo="vencido")], VIGENTE)
    assert (aviso.tipo, aviso.tono, aviso.requiere_accion) == ("atraso", a.ADVERTENCIA, True)
    assert aviso.clave == "atraso|NUT|2026-08"
    assert aviso.fecha == datetime(2026, 9, 11, tzinfo=ZONA)
    assert "hace 3 días" in aviso.detalle and "Todavía no se ha abierto" in aviso.detalle


def prueba_el_atraso_dice_si_hay_un_borrador_empezado():
    [aviso] = a.avisos_de_area([renglon(estado="borrador", semaforo="vencido")], VIGENTE)
    assert "borrador empezado" in aviso.detalle


def prueba_una_deuda_de_un_mes_anterior_es_critica_no_se_olvida_al_cambiar_de_mes():
    [aviso] = a.avisos_de_area([renglon("2026-06", semaforo="vencido", fecha_limite=date(2026, 7, 10))], VIGENTE)
    assert aviso.tono == a.CRITICO and aviso.periodo == "2026-06"


def prueba_en_cuanto_se_envia_el_atraso_desaparece():
    """El caso que motiva no guardar avisos: enviado tarde ya no es «atrasado»."""
    enviado = renglon(estado="remitido", semaforo="fuera_de_plazo", fecha_envio=datetime(2026, 9, 12, tzinfo=ZONA))
    assert "atraso" not in tipos(a.avisos_de_area([enviado], VIGENTE))


def prueba_el_reporte_entregado_del_mes_avisa_con_la_fecha_del_envio():
    """12/10/2026: enviar ya es entregar. No hay «en trámite» ni «validado»."""
    envio, cambio = datetime(2026, 9, 5, tzinfo=ZONA), datetime(2026, 9, 7, tzinfo=ZONA)
    [aviso] = a.avisos_de_area([renglon(estado="remitido", fecha_envio=envio, fecha_cambio=cambio, folio_constancia="CR-2026-08-NUT")], VIGENTE)
    assert (aviso.tipo, aviso.fecha, aviso.requiere_accion) == ("remitido", envio, False)
    assert "validado por el bot" in aviso.detalle and "CR-2026-08-NUT" in aviso.detalle


def prueba_lo_del_mes_no_se_repite_para_meses_anteriores():
    assert a.avisos_de_area([renglon("2026-07", "remitido")], VIGENTE) == []


def prueba_un_reporte_reabierto_para_rectificar_pide_reenviarlo():
    [aviso] = a.avisos_de_area([renglon("2026-07", "borrador", rect=1, fecha_cambio=datetime(2026, 9, 2, tzinfo=ZONA))], VIGENTE)
    assert (aviso.tipo, aviso.requiere_accion, aviso.clave) == ("rectificacion", True, "rectificacion|NUT|2026-07|1")
    assert aviso.fecha == datetime(2026, 9, 2, tzinfo=ZONA)


def prueba_sin_historial_la_fecha_queda_desconocida_no_se_inventa():
    [aviso] = a.avisos_de_area([renglon(estado="remitido")], VIGENTE)
    assert aviso.fecha is None


def prueba_un_borrador_normal_en_plazo_no_avisa_nada():
    assert a.avisos_de_area([renglon(estado="borrador")], VIGENTE) == []


# ------------------------------------------------------------------ Estadística


def prueba_estadistica_solo_recibe_el_aviso_de_lo_que_no_se_entrego():
    """12/10/2026: nada espera a Estadística; lo entregado no le pide revisar ni remitir."""
    envio = datetime(2026, 9, 8, tzinfo=ZONA)
    filas = [
        renglon(semaforo="vencido", unidad="farmacia"),
        renglon(semaforo="vencido", unidad="laboratorio"),
        renglon(estado="remitido", unidad="nutricion", fecha_envio=envio),
        renglon("2026-06", "remitido", unidad="nefrologia", fecha_envio=envio),
    ]
    avisos = {x.tipo: x for x in a.avisos_de_estadistica(filas, VIGENTE)}
    assert set(avisos) == {"atrasadas"}
    assert avisos["atrasadas"].titulo.startswith("2 reportes") and "Farmacia, Laboratorio." in avisos["atrasadas"].detalle
    assert not avisos["atrasadas"].requiere_accion  # la demora es del área


def prueba_sin_nada_pendiente_estadistica_no_recibe_avisos():
    assert a.avisos_de_estadistica([renglon(estado="remitido")], VIGENTE) == []


# ---------------------------------------------------------------------- oficina


def recibido(estado, periodo=VIGENTE, fecha=None) -> a.Recibido:
    return a.Recibido(periodo=periodo, formato="NUT", unidad_nombre="Nutrición", estado_de_recepcion=estado, constancia="CR-2026-08-NUT", fecha=fecha)


def prueba_la_oficina_se_entera_de_que_lo_recibido_quedo_desactualizado():
    reabierto = datetime(2026, 9, 9, tzinfo=ZONA)
    [aviso] = a.avisos_de_oficina("planeamiento", [recibido("desactualizada", "2026-06", reabierto)], VIGENTE)
    assert (aviso.tipo, aviso.tono, aviso.fecha) == ("desactualizado", a.ADVERTENCIA, reabierto)
    assert aviso.clave == "desactualizado|planeamiento|NUT|2026-06"
    assert "CR-2026-08-NUT" in aviso.detalle


def prueba_la_oficina_distingue_lo_recibido_sin_validar_de_lo_validado():
    avisos = a.avisos_de_oficina("planeamiento", [recibido("sin_validar"), recibido("validada")], VIGENTE)
    assert tipos(avisos) == ["sin_validar", "recibido"]


def prueba_lo_validado_de_meses_anteriores_no_es_novedad():
    assert a.avisos_de_oficina("planeamiento", [recibido("validada", "2026-06")], VIGENTE) == []


# ------------------------------------------------------------------------ orden


def prueba_lo_grave_va_primero_y_dentro_de_cada_tono_lo_mas_reciente():
    def aviso(tono, dia):
        return a.Aviso(clave=f"{tono}{dia}", ambito="area", tipo="x", tono=tono, titulo="", detalle="",
                       fecha=None if dia is None else datetime(2026, 9, dia, tzinfo=ZONA), requiere_accion=False)

    orden = a.ordenar([aviso(a.OK, 9), aviso(a.ADVERTENCIA, 1), aviso(a.ADVERTENCIA, None), aviso(a.CRITICO, 2), aviso(a.ADVERTENCIA, 5)])
    assert [x.clave for x in orden] == ["crit2", "warn5", "warn1", "warnNone", "ok9"]
