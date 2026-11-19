"""Contratos de las listas de reportes: dos implementaciones de la misma regla deben coincidir.

Hay tres reglas escritas dos veces, y cada una tiene aquí su prueba de que no se separan:

1. **El semáforo, quién espera y el estado**: la vista `reporte.v_cumplimiento` de Alejandro
   (SQL, con el `current_date` de la base) y `dominio/consultas.py` (Python, con el reloj
   inyectable). Se comparan con el «hoy» de la propia base.
2. **El estado de recepción**: su versión en SQL (el filtro de los recibidos) y su versión
   en Python (lo que se muestra).
3. **La visibilidad**: su versión en SQL (que pagina y cuenta) y `Visibilidad.ve` (Python).

Si Alejandro cambia la vista o alguien toca una de las dos versiones, la prueba avisa.
"""

from datetime import date, datetime, timedelta
from itertools import combinations

import pytest
from sqlalchemy import select, text

import escenario as e
from app.datos.modelos import Cumplimiento
from app.dominio import consultas
from app.dominio.reloj import ZONA, RelojFijo
from app.servicios.consultas import listar_recibidos, listar_reportes

pytestmark = pytest.mark.bd

RELOJ = RelojFijo(e.AHORA)
ESTADOS_CON_ENVIO = ("remitido",)


def envio(mes: int, dia: int, hora: int = 12) -> datetime:
    return datetime(2026, mes, dia, hora, 0, tzinfo=ZONA)


def hoy_de_la_base(sesion):
    return sesion.scalar(text("SELECT current_date"))


# --------------------------------------- 1. la vista de Alejandro frente al dominio


def prepara_un_año_de_reportes(sesion):
    """Doce meses de Nutrición en todos los estados y con envíos a tiempo, tarde y sin envío.
    Desde el 12/10/2026 todo lo enviado está remitido: la variedad la dan las fechas."""
    plan = [
        (1, "remitido", envio(1, 20)),      # a tiempo (plazo: 10 de febrero)
        (2, "remitido", envio(3, 25)),      # tarde
        (3, "remitido", envio(4, 10)),      # el último día del plazo: a tiempo
        (4, "remitido", envio(5, 11)),      # un día tarde
        (5, "remitido", envio(6, 2)),
        (6, "remitido", envio(7, 30)),       # tarde
        (7, "borrador", None),              # sin enviar
        (8, "borrador", envio(9, 1)),       # rectificado: reabierto, pero ya se había enviado
        (9, "remitido", envio(10, 5)),
        (10, "remitido", envio(11, 8)),
        (11, "remitido", envio(12, 9)),
    ]  # el 12 queda sin abrir: no_iniciado
    for mes, estado, cuando in plan:
        e.abrir_reporte(sesion, "NUT", mes, estado, fecha_envio=cuando, folio=f"CR-2026-{mes:02d}-NUT" if cuando else None)


def prueba_el_dominio_coincide_con_la_vista_en_estado_espera_y_semaforo(sesion):
    prepara_un_año_de_reportes(sesion)
    hoy = hoy_de_la_base(sesion)
    filas = sesion.scalars(select(Cumplimiento).order_by(Cumplimiento.mes)).all()
    assert len(filas) == 12
    for f in filas:
        assert consultas.espera_de(f.estado) == f.espera, f"mes {f.mes}: quién espera"
        assert consultas.semaforo(f.fecha_envio, f.fecha_limite_entrega, hoy) == f.semaforo, f"mes {f.mes}: semáforo con hoy={hoy}"


def la_vista_evaluada_en(sesion, dia: date) -> list[tuple]:
    """La definición **real** de la vista, con su `current_date` cambiado por otro día.

    La vista no recibe el «hoy» como parámetro, y con el de la base ningún renglón cae en su
    fecha límite el día que corre la prueba: justo el borde donde `<=` y `<` se distinguen.
    Se toma su SQL tal como está instalada, así que si Alejandro la cambia, se prueba la nueva."""
    definicion = sesion.scalar(text("SELECT pg_get_viewdef('reporte.v_cumplimiento'::regclass)")).rstrip().rstrip(";")
    assert "CURRENT_DATE" in definicion, "la vista ya no usa current_date: ¿cambió Alejandro el semáforo? Ajusta esta prueba."
    cursor = sesion.connection().connection.cursor()
    cursor.execute(f"SELECT mes, estado, espera, semaforo, fecha_envio, fecha_limite_entrega FROM ({definicion.replace('CURRENT_DATE', f'DATE {chr(39)}{dia.isoformat()}{chr(39)}')}) v ORDER BY mes")
    return cursor.fetchall()


def prueba_el_dominio_coincide_con_la_vista_el_dia_antes_el_dia_y_el_dia_despues_de_cada_plazo(sesion):
    prepara_un_año_de_reportes(sesion)
    plazos = [f.fecha_limite_entrega for f in sesion.scalars(select(Cumplimiento))]
    dias = sorted({p + timedelta(days=d) for p in plazos for d in (-1, 0, 1)})
    vistos = set()
    for hoy in dias:
        for mes, estado, espera, semaforo, fecha_envio, limite in la_vista_evaluada_en(sesion, hoy):
            assert consultas.espera_de(estado) == espera
            assert consultas.semaforo(fecha_envio, limite, hoy) == semaforo, f"mes {mes}, hoy={hoy}, límite={limite}"
            vistos.add(semaforo)
    assert vistos == {"a_tiempo", "fuera_de_plazo", "pendiente", "vencido"}


def prueba_la_comparacion_recorre_las_cuatro_ramas_del_semaforo_o_avisa_cuales_faltan(sesion):
    """`pendiente` y `vencido` dependen del día en que corre la prueba (la vista usa el
    `current_date` de la base); `a_tiempo` y `fuera_de_plazo` no. Las dos últimas siempre
    deben estar; de las otras se exige al menos una, o la comparación no compara nada."""
    prepara_un_año_de_reportes(sesion)
    vistos = {f.semaforo for f in sesion.scalars(select(Cumplimiento))}
    assert {"a_tiempo", "fuera_de_plazo"} <= vistos and vistos & {"pendiente", "vencido"}


def prueba_todos_los_estados_de_la_maquina_aparecen_en_la_comparacion(sesion):
    prepara_un_año_de_reportes(sesion)
    assert {f.estado for f in sesion.scalars(select(Cumplimiento))} == {"no_iniciado", "borrador", "remitido"}


def prueba_el_dominio_y_la_vista_se_separan_a_proposito_con_un_envio_de_la_noche_del_ultimo_dia(sesion):
    """La vista mide `fecha_envio::DATE` en el huso de la base; con la base en UTC, las
    21:00 de Lima del último día son ya «mañana» y la vista las marca tarde. Por eso el
    semáforo se calcula en el backend, con la hora de Lima: este es el caso que lo justifica."""
    sesion.execute(text("SET LOCAL TIME ZONE 'UTC'"))
    e.abrir_reporte(sesion, "NUT", 8, "remitido", fecha_envio=envio(9, 10, 21), folio="CR-2026-08-NUT")
    f = sesion.scalar(select(Cumplimiento).where(Cumplimiento.mes == 8))
    assert f.semaforo == "fuera_de_plazo"  # la vista, con la base en UTC
    assert consultas.semaforo(f.fecha_envio, f.fecha_limite_entrega, hoy_de_la_base(sesion)) == "a_tiempo"  # nosotros, en Lima


def prueba_el_plazo_guardado_en_la_base_es_el_de_dominio(sesion):
    """Si Alejandro cambiara la fecha límite de los periodos, el semáforo (que usa la de la
    base) y `periodos.plazo_de` (que usa el dominio) dejarían de decir lo mismo."""
    from app.dominio import periodos

    for f in sesion.scalars(select(Cumplimiento)):
        assert f.fecha_limite_entrega == periodos.plazo_de(f"{f.anio}-{f.mes:02d}")


# ---------------------------------------- 2. el estado de recepción, SQL frente a Python

# Cada remisión de una oficina es una de estas cuatro: (vigente, sin_validar).
TIPOS = [(True, False), (True, True), (False, False), (False, True)]


def prepara_todas_las_combinaciones(sesion):
    """Un reporte por cada subconjunto no vacío de los cuatro tipos (15), remitido a
    Planeamiento. Una remisión vigente de cada tipo como máximo: la base no admite dos."""
    e.crear_formato(sesion, "epidemiologia", "F-EPI")
    combinaciones = [c for n in range(1, 5) for c in combinations(TIPOS, n)]
    assert len(combinaciones) == 15
    reportes = {}
    for i, combo in enumerate(combinaciones):
        formato, mes = ("NUT", i + 1) if i < 8 else ("F-EPI", i - 7)
        rep = e.abrir_reporte(sesion, formato, mes, "remitido", fecha_envio=envio(mes + 1, 9), folio=f"CR-2026-{mes:02d}-{formato}")
        for vigente, sin_validar in combo:
            e.remitir_a(sesion, rep, "planeamiento", es_vigente=vigente, sin_validar=sin_validar)
        reportes[(f"2026-{mes:02d}", formato)] = combo
    return reportes


def prueba_el_filtro_en_sql_y_el_resumen_en_python_dicen_lo_mismo_en_las_quince_combinaciones(sesion):
    reportes = prepara_todas_las_combinaciones(sesion)
    planeamiento = e.consulta_de_planeamiento(sesion)
    todos = listar_recibidos(sesion, planeamiento, clave="planeamiento", por_pagina=100).filas
    assert len(todos) == 15
    en_python = {(f.periodo, f.formato): f.estado_de_recepcion for f in todos}
    # Y el resumen de Python coincide con el que sale de las remisiones tal como se crearon.
    for clave, combo in reportes.items():
        assert en_python[clave] == consultas.estado_de_recepcion(consultas.RemisionVista(v, s) for v, s in combo)
    for valor in consultas.ESTADOS_DE_RECEPCION:
        en_sql = {
            (f.periodo, f.formato)
            for f in listar_recibidos(sesion, planeamiento, clave="planeamiento", estado_de_recepcion=valor, por_pagina=100).filas
        }
        assert en_sql == {clave for clave, v in en_python.items() if v == valor}, valor
        assert en_sql, f"ninguna combinación produce «{valor}»: la prueba no lo comprueba"


# ----------------------------------------------- 3. la visibilidad, SQL frente a Python

FORMATOS_DE_LAS_AREAS = {"NUT": "nutricion", "F-EPI": "epidemiologia", "F-FAR": "farmacia", "F-LAB": "laboratorio", "F-DXI": "imagenes"}
CICLO_DE_ESTADOS = ["no_iniciado", "borrador", "remitido"]


def prepara_areas_en_todos_los_estados(sesion):
    for formato, unidad in FORMATOS_DE_LAS_AREAS.items():
        if formato != "NUT":
            e.crear_formato(sesion, unidad, formato)
    for i, formato in enumerate(FORMATOS_DE_LAS_AREAS):
        for mes in range(1, 9):
            estado = CICLO_DE_ESTADOS[(i + mes) % len(CICLO_DE_ESTADOS)]
            if estado != "no_iniciado":
                e.abrir_reporte(sesion, formato, mes, estado, fecha_envio=envio(mes + 1, 5) if estado not in ("borrador",) else None, folio=f"CR-2026-{mes:02d}-{formato}")


def todas_las_paginas(sesion, actor):
    filas, pagina = [], 1
    while True:
        r = listar_reportes(sesion, actor, RELOJ, pagina=pagina, por_pagina=7)  # 7: que no coincida con el tamaño del universo
        filas += r.filas
        if pagina >= r.pagina.paginas:
            return r.pagina.total, filas
        pagina += 1


def personas(sesion):
    return {
        "digitador de Nutrición": e.persona(sesion, "p1", ("digitador", "nutricion")),
        "Epidemiología (digitador + consulta)": e.persona(sesion, "p2", ("digitador", "epidemiologia"), ("consulta", "epidemiologia")),
        "consulta global": e.persona(sesion, "p3", ("consulta", None)),
        "consulta de Planeamiento": e.persona(sesion, "p4", ("consulta", "planeamiento")),
        "revisor global": e.persona(sesion, "p5", ("revisor", None)),
        "superadmin": e.persona(sesion, "p6", ("superadmin", None)),
        "admin de Farmacia": e.persona(sesion, "p7", ("admin", "farmacia")),
        "dos digitadores": e.persona(sesion, "p8", ("digitador", "nutricion"), ("digitador", "laboratorio")),
        "digitador + consulta global": e.persona(sesion, "p9", ("digitador", "imagenes"), ("consulta", None)),
    }


def prueba_la_visibilidad_en_sql_es_la_de_python_para_cada_tipo_de_cuenta_y_cada_renglon(sesion):
    prepara_areas_en_todos_los_estados(sesion)
    universo = todas_las_paginas(sesion, e.persona(sesion, "todo", ("superadmin", None)))[1]
    assert len(universo) == 5 * 8 and {f.estado for f in universo} == set(CICLO_DE_ESTADOS)
    for nombre, actor in personas(sesion).items():
        visibilidad = consultas.visibilidad_de(actor)
        esperado = sorted((f.periodo, f.formato) for f in universo if visibilidad.ve(f.unidad, f.estado))
        total, filas = todas_las_paginas(sesion, actor) if actor.puede_en_alguna("reporte.ver") else (0, [])
        assert sorted((f.periodo, f.formato) for f in filas) == esperado, nombre
        assert total == len(esperado) == len(filas), f"{nombre}: el total no cuenta lo mismo que las filas"


def prueba_ninguna_cuenta_de_solo_consulta_ve_un_borrador_ni_un_no_iniciado_en_ninguna_pagina(sesion):
    prepara_areas_en_todos_los_estados(sesion)
    cuentas = personas(sesion)
    for nombre in ("consulta global", "consulta de Planeamiento"):
        _, filas = todas_las_paginas(sesion, cuentas[nombre])
        assert not {f.estado for f in filas} & {"no_iniciado", "borrador"}, nombre
