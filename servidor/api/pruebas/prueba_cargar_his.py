"""La carga de tramas del HIS MINSA a `fuente.his_atencion`
(`python -m app.herramientas.cargar_his`).

Con tramas sintéticas de 57 columnas: ninguna prueba toca datos de pacientes.
"""

import csv
from datetime import date, datetime

import pytest
from sqlalchemy import func, select, text

from app.datos.modelos import COLUMNAS_HIS, HisAtencion, LoteCarga, LoteMes
from app.dominio import fuentes as reglas
from app.dominio.fuentes import CargaRechazada, MesCargado
from app.dominio.reloj import ZONA
from app.herramientas.cargar_his import lineas_de
from app.servicios import fuentes as servicio
from app.servicios.fuentes import NUEVO, REEMPLAZADO, YA_CARGADO, cargar_his

TRAMA_4_SET = "CONSOLIDADO_NominalTrama04092026_103522-agosto.csv"
TRAMA_28_SET = "CONSOLIDADOAGOSTO_NominalTrama28092026_215720.csv"


def trama(carpeta, nombre: str, fechas: list[str], *, columnas=COLUMNAS_HIS, **comunes):
    """Una trama con una fila por fecha. `comunes` llena otras columnas igual en todas."""
    ruta = carpeta / nombre
    with open(ruta, "w", encoding="utf-8-sig", newline="") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow([c.title() for c in columnas])  # el HIS escribe «Id_Cita», «Fecha_Atencion»…
        for i, fecha in enumerate(fechas, start=1):
            valores = {"id_cita": str(1000 + i), "fecha_atencion": fecha, "codigo_item": "C509", **comunes}
            escritor.writerow([valores.get(c, "") for c in columnas])
    return ruta


def filas_de(sesion, periodo: str) -> int:
    anio, mes = (int(x) for x in periodo.split("-"))
    return sesion.scalar(
        select(func.count()).select_from(HisAtencion).where(func.extract("year", HisAtencion.fecha_atencion) == anio, func.extract("month", HisAtencion.fecha_atencion) == mes)
    )


def vigentes(sesion) -> dict[str, int]:
    return {p: m.filas for p, (m, _lote) in servicio.meses_vigentes(sesion, servicio._fuente(sesion, servicio.FUENTE_HIS).id).items()}


# ------------------------------------------------------------- reglas puras


def prueba_la_fecha_de_extraccion_sale_del_nombre_de_la_trama():
    assert reglas.fecha_de_extraccion(TRAMA_28_SET) == datetime(2026, 9, 28, 21, 57, 20, tzinfo=ZONA)
    assert reglas.fecha_de_extraccion("datos_crudo2021_2026.csv") is None
    assert reglas.fecha_de_extraccion("NominalTrama99992026_000000.csv") is None  # no se adivina una fecha imposible


def prueba_los_periodos_se_recortan_por_los_dos_extremos():
    assert reglas.en_rango("2025-12", "2025-12", None) and not reglas.en_rango("2025-11", "2025-12", None)
    assert reglas.en_rango("2026-07", None, "2026-07") and not reglas.en_rango("2026-08", None, "2026-07")
    assert reglas.en_rango("2021-01", None, None)


def prueba_reemplazar_por_una_extraccion_mas_nueva_y_con_mas_filas_es_lo_esperable():
    cargado = MesCargado(2026, 8, 32380, TRAMA_4_SET, reglas.fecha_de_extraccion(TRAMA_4_SET))
    assert reglas.motivos_para_no_reemplazar(cargado, filas=34725, fecha_extraccion=reglas.fecha_de_extraccion(TRAMA_28_SET)) == []


def prueba_no_se_pisa_con_una_extraccion_mas_antigua_ni_con_menos_filas():
    cargado = MesCargado(2026, 8, 34725, TRAMA_28_SET, reglas.fecha_de_extraccion(TRAMA_28_SET))
    motivos = reglas.motivos_para_no_reemplazar(cargado, filas=32380, fecha_extraccion=reglas.fecha_de_extraccion(TRAMA_4_SET))
    assert len(motivos) == 2 and "04/09/2026" in motivos[0] and "28/09/2026" in motivos[0] and "32380" in motivos[1]


def prueba_un_archivo_sin_fecha_de_extraccion_no_pisa_a_uno_que_la_tiene():
    cargado = MesCargado(2026, 8, 10, TRAMA_28_SET, reglas.fecha_de_extraccion(TRAMA_28_SET))
    (motivo,) = reglas.motivos_para_no_reemplazar(cargado, filas=10, fecha_extraccion=None)
    assert "no se sabe si es más nuevo" in motivo


# ------------------------------------------------------------------ la carga

pytestmark_bd = pytest.mark.bd


@pytestmark_bd
def prueba_carga_las_filas_con_su_mes_su_lote_y_su_linea(sesion, tmp_path):
    ruta = trama(tmp_path, TRAMA_28_SET, ["2026-08-01", "2026-08-31", "2026-08-15 10:30:00"], valor_lab="A", nombres_paciente="Persona de Prueba")
    r = cargar_his(sesion, ruta)

    assert (r.filas_archivo, r.filas_cargadas, r.filas_fuera_de_rango, r.filas_sin_fecha) == (3, 3, 0, 0)
    assert [(m.periodo, m.filas, m.estado) for m in r.meses] == [("2026-08", 3, NUEVO)]
    lote = sesion.get(LoteCarga, r.lote_id)
    assert (lote.nombre_archivo, lote.filas_cargadas, lote.filas_omitidas) == (TRAMA_28_SET, 3, 0)
    assert (lote.cobertura_desde, lote.cobertura_hasta) == (date(2026, 8, 1), date(2026, 8, 31))
    assert lote.fecha_extraccion == datetime(2026, 9, 28, 21, 57, 20, tzinfo=ZONA) and lote.columnas == list(COLUMNAS_HIS)

    filas = sesion.scalars(select(HisAtencion).order_by(HisAtencion.fila_archivo)).all()
    assert [f.fila_archivo for f in filas] == [2, 3, 4]  # la 1 es la cabecera
    assert [f.fecha_atencion for f in filas] == [date(2026, 8, 1), date(2026, 8, 31), date(2026, 8, 15)]
    primera = filas[0]
    assert (primera.id_cita, primera.codigo_item, primera.valor_lab, primera.nombres_paciente) == ("1001", "C509", "A", "Persona de Prueba")
    assert primera.tipo_diagnostico is None  # una casilla vacía se guarda nula, no como texto vacío
    assert primera.fecha_creacion is not None  # la fecha de control la pone el disparador


@pytestmark_bd
def prueba_solo_toma_los_meses_pedidos(sesion, tmp_path):
    ruta = trama(tmp_path, "datos_crudo2021_2026.csv", ["2021-03-01", "2025-11-30", "2025-12-01", "2026-01-15", "2026-07-31"])
    r = cargar_his(sesion, ruta, desde="2025-12")
    assert (r.filas_archivo, r.filas_cargadas, r.filas_fuera_de_rango) == (5, 3, 2)
    assert vigentes(sesion) == {"2025-12": 1, "2026-01": 1, "2026-07": 1}
    assert sesion.get(LoteCarga, r.lote_id).filas_omitidas == 2


@pytestmark_bd
def prueba_cargar_dos_veces_el_mismo_archivo_no_duplica(sesion, tmp_path):
    ruta = trama(tmp_path, TRAMA_28_SET, ["2026-08-01", "2026-08-02"])
    cargar_his(sesion, ruta)
    r = cargar_his(sesion, ruta)
    assert r.lote_id is None and [m.estado for m in r.meses] == [YA_CARGADO]
    assert filas_de(sesion, "2026-08") == 2
    assert sesion.scalar(select(func.count()).select_from(LoteCarga)) == 1
    assert "Nada nuevo que cargar" in "\n".join(lineas_de(r, ensayo=False))


@pytestmark_bd
def prueba_pedir_mas_meses_del_mismo_archivo_los_agrega_al_mismo_lote(sesion, tmp_path):
    ruta = trama(tmp_path, "datos_crudo2021_2026.csv", ["2025-11-10", "2025-12-01", "2026-01-15"])
    primero = cargar_his(sesion, ruta, desde="2025-12")
    segundo = cargar_his(sesion, ruta, desde="2025-11")
    assert segundo.lote_id == primero.lote_id
    assert [(m.periodo, m.estado) for m in segundo.meses] == [("2025-11", NUEVO), ("2025-12", YA_CARGADO), ("2026-01", YA_CARGADO)]
    lote = sesion.get(LoteCarga, primero.lote_id)
    assert (lote.filas_cargadas, lote.filas_omitidas, lote.cobertura_desde) == (3, 0, date(2025, 11, 10))
    assert sesion.scalar(select(func.count()).select_from(HisAtencion)) == 3


@pytestmark_bd
def prueba_una_extraccion_mas_nueva_reemplaza_el_mes_entero(sesion, tmp_path):
    cargar_his(sesion, trama(tmp_path, TRAMA_4_SET, ["2026-08-01", "2026-08-02"], valor_lab="viejo"))
    r = cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-08-01", "2026-08-02", "2026-08-03"], valor_lab="nuevo"))

    assert [(m.periodo, m.filas, m.estado, m.filas_anteriores) for m in r.meses] == [("2026-08", 3, REEMPLAZADO, 2)]
    assert set(sesion.scalars(select(HisAtencion.valor_lab))) == {"nuevo"} and filas_de(sesion, "2026-08") == 3
    assert vigentes(sesion) == {"2026-08": 3}
    # La carga anterior queda como historia: se sabe que existió y qué trajo.
    historia = sesion.execute(select(LoteMes.filas, LoteMes.es_vigente).order_by(LoteMes.id)).all()
    assert [tuple(h) for h in historia] == [(2, False), (3, True)]


@pytestmark_bd
def prueba_una_extraccion_mas_antigua_no_pisa_y_no_deja_nada_a_medias(sesion, tmp_path):
    cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-08-01", "2026-08-02", "2026-08-03"], valor_lab="nuevo"))
    vieja = trama(tmp_path, TRAMA_4_SET, ["2026-08-01", "2026-08-02"], valor_lab="viejo")
    with pytest.raises(CargaRechazada) as error:
        cargar_his(sesion, vieja)
    assert len(error.value.motivos) == 3 and "--forzar" in error.value.motivos[-1]
    assert set(sesion.scalars(select(HisAtencion.valor_lab))) == {"nuevo"} and vigentes(sesion) == {"2026-08": 3}
    assert sesion.scalar(select(func.count()).select_from(LoteCarga)) == 1


@pytestmark_bd
def prueba_forzar_carga_lo_que_se_habria_rechazado(sesion, tmp_path):
    cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-08-01", "2026-08-02", "2026-08-03"]))
    r = cargar_his(sesion, trama(tmp_path, TRAMA_4_SET, ["2026-08-01"]), forzar=True)
    assert [m.estado for m in r.meses] == [REEMPLAZADO] and vigentes(sesion) == {"2026-08": 1}


@pytestmark_bd
def prueba_un_archivo_solo_reemplaza_los_meses_que_trae(sesion, tmp_path):
    cargar_his(sesion, trama(tmp_path, "datos_crudo2021_2026.csv", ["2026-07-01", "2026-07-02", "2026-06-30"]))
    cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-07-05", "2026-07-06", "2026-07-07"]), forzar=True)
    assert vigentes(sesion) == {"2026-06": 1, "2026-07": 3}
    assert filas_de(sesion, "2026-06") == 1 and filas_de(sesion, "2026-07") == 3


@pytestmark_bd
def prueba_una_fila_sin_fecha_de_atencion_no_se_carga_y_se_dice(sesion, tmp_path):
    r = cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-08-01", "", "31/08/2026"]))
    assert (r.filas_cargadas, r.filas_sin_fecha) == (1, 2)
    assert "2 filas sin fecha" in sesion.get(LoteCarga, r.lote_id).observacion
    assert "ATENCIÓN: 2 filas sin fecha" in "\n".join(lineas_de(r, ensayo=False))


@pytestmark_bd
def prueba_una_trama_con_otras_columnas_se_rechaza_entera(sesion, tmp_path):
    sin_una = tuple(c for c in COLUMNAS_HIS if c != "valor_lab")
    with pytest.raises(CargaRechazada, match="faltan: valor_lab"):
        cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-08-01"], columnas=sin_una))
    assert sesion.scalar(select(func.count()).select_from(LoteCarga)) == 0


@pytestmark_bd
def prueba_una_fila_con_columnas_de_menos_detiene_la_carga(sesion, tmp_path):
    ruta = trama(tmp_path, TRAMA_28_SET, ["2026-08-01"])
    with open(ruta, "a", encoding="utf-8", newline="") as archivo:
        archivo.write("1002,2026,8\n")
    with pytest.raises(CargaRechazada, match="línea 3: tiene 3 columnas"):
        cargar_his(sesion, ruta)


@pytestmark_bd
def prueba_sin_filas_en_el_rango_pedido_no_se_registra_ningun_lote(sesion, tmp_path):
    with pytest.raises(CargaRechazada, match="no trae ninguna fila"):
        cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-08-01"]), desde="2026-09")
    assert sesion.scalar(select(func.count()).select_from(LoteCarga)) == 0


@pytestmark_bd
def prueba_la_bitacora_registra_el_lote_y_no_las_filas_de_pacientes(sesion, tmp_path):
    r = cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-08-01", "2026-08-02"], numero_documento_paciente="00000000"))
    por_tabla = dict(sesion.execute(text("SELECT tabla, count(*) FROM auditoria.registro_cambio WHERE esquema = 'fuente' GROUP BY tabla")).all())
    assert por_tabla.get("lote_carga", 0) >= 1 and por_tabla.get("lote_mes", 0) >= 1 and "his_atencion" not in por_tabla
    assert r.filas_cargadas == 2
