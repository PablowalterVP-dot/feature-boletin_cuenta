"""La carga de reportes de SINADEF y de defunciones verificadas
(`python -m app.herramientas.cargar_sinadef`).

Con reportes sintéticos: ninguna prueba toca datos de personas. No hay con qué
escribir un `.xls` de verdad (xlrd solo lee), así que el libro se sustituye por
uno falso con la misma forma que el reporte: título, grupos, cabecera,
certificados y el pie con la fecha en que se generó.
"""

from datetime import date, datetime

import pytest
from sqlalchemy import func, select, text

from app.datos.modelos import DefuncionVerificada, LoteCarga, LoteMes, SinadefDefuncion
from app.dominio.fuentes import CargaRechazada
from app.dominio.reloj import ZONA
from app.herramientas.cargar_sinadef import archivos_de
from app.servicios import fuentes as servicio
from app.servicios.fuentes import NUEVO, REEMPLAZADO, YA_CARGADO, cargar_sinadef, cargar_verificados, leer_sinadef

pytestmark = pytest.mark.bd

# Como el reporte real: «TIPO DOC», «DOCUMENTO» y «FECHA REGISTRO» se repiten
# (fallecido, profesional, registrador). Vale la primera aparición.
CABECERA = ["N°", "TIPO CDEF", "ESTADO", "NOMBRES", "TIPO DOC", "DOCUMENTO", "FECHA", "NOMBRES", "TIPO DOC", "DOCUMENTO", "FECHA REGISTRO", "FECHA REGISTRO", ""]
GENERADO = 46295.5  # 30/09/2026 12:00, como lo guarda Excel


def certificado(n, documento="12345678", fecha="15/08/2026", registro="16/08/2026", estado="FIRMADO", tipo_doc="DNI/LE"):
    return [float(n), "CDEF GRAL EN LINEA", estado, "Persona de Prueba", tipo_doc, documento, fecha, "Profesional de Prueba", "DNI/LE", "87654321", registro, "17/08/2026", ""]


class LibroFalso:
    datemode = 0

    def __init__(self, filas):
        self._filas = filas
        self.nrows = len(filas)

    def sheet_by_index(self, _i):
        return self

    def cell_value(self, fila, columna):
        return self._filas[fila][columna]

    def row_values(self, fila):
        return list(self._filas[fila])


def reporte(carpeta, monkeypatch, nombre, certificados, *, desde="01/08/2026", hasta="31/08/2026", generado=GENERADO, cabecera=CABECERA):
    """Deja un archivo (su contenido es lo que decide la huella) y hace que
    `xlrd` lo lea como un reporte con esos certificados."""
    ruta = carpeta / nombre
    ruta.write_text(f"{nombre}|{desde}|{len(certificados)}|{generado}", encoding="utf-8")
    ancho = len(cabecera)
    filas = [
        [f"REPORTE DE CERTIFICADOS DE DEFUNCION REGISTRADOS EL {desde} HASTA EL {hasta}"] + [""] * (ancho - 1),
        [""] * ancho,
        list(cabecera),
        *certificados,
        [generado] + [""] * (ancho - 1),
    ]
    libros = getattr(reporte, "_libros", {})
    libros[str(ruta)] = LibroFalso(filas)
    reporte._libros = libros
    monkeypatch.setattr(servicio.xlrd, "open_workbook", lambda r: reporte._libros[r])
    return ruta


def vigentes(sesion) -> dict[str, int]:
    return {p: m.filas for p, (m, _lote) in servicio.meses_vigentes(sesion, servicio._fuente(sesion, servicio.FUENTE_SINADEF).id).items()}


# ------------------------------------------------------------------ el reporte


def prueba_lee_el_periodo_del_titulo_y_la_fecha_en_que_se_genero(tmp_path, monkeypatch):
    r = leer_sinadef(reporte(tmp_path, monkeypatch, "agosto-2026.xls", [certificado(1), certificado(2)]))
    assert (r.desde, r.hasta) == (date(2026, 8, 1), date(2026, 8, 31))
    assert r.generado == datetime(2026, 9, 30, 12, 0, tzinfo=ZONA)
    assert [fila for fila, _ in r.certificados] == [4, 5]  # el pie no es un certificado
    assert (r.posicion["TIPO DOC"], r.posicion["DOCUMENTO"], r.posicion["FECHA REGISTRO"]) == (4, 5, 10)  # la primera aparición


def prueba_un_reporte_que_cruza_meses_o_sin_titulo_se_rechaza(tmp_path, monkeypatch):
    with pytest.raises(CargaRechazada, match="cruce meses"):
        leer_sinadef(reporte(tmp_path, monkeypatch, "dos-meses.xls", [certificado(1)], desde="01/07/2026", hasta="31/08/2026"))
    ruta = reporte(tmp_path, monkeypatch, "sin-titulo.xls", [certificado(1)])
    reporte._libros[str(ruta)]._filas[0][0] = "OTRO REPORTE"
    with pytest.raises(CargaRechazada, match="no dice qué fechas cubre"):
        leer_sinadef(ruta)


def prueba_un_reporte_sin_las_columnas_del_cruce_se_rechaza(tmp_path, monkeypatch):
    sin_estado = [c if c != "ESTADO" else "SITUACION" for c in CABECERA]
    with pytest.raises(CargaRechazada, match="ESTADO"):
        leer_sinadef(reporte(tmp_path, monkeypatch, "raro.xls", [certificado(1)], cabecera=sin_estado))


# -------------------------------------------------------------------- la carga


def prueba_guarda_todos_los_certificados_tambien_los_anulados_y_sin_dni(sesion, tmp_path, monkeypatch):
    ruta = reporte(tmp_path, monkeypatch, "agosto-2026.xls", [
        certificado(1),
        certificado(2, estado="ANULADO"),
        certificado(3, documento="", tipo_doc="IGNORADO"),
        certificado(4, documento=12345678.0),  # Excel entrega algunos documentos como número
        certificado(5, fecha="", registro=""),
    ])
    r = cargar_sinadef(sesion, ruta)

    assert [(m.periodo, m.filas, m.estado) for m in r.meses] == [("2026-08", 5, NUEVO)]
    filas = sesion.scalars(select(SinadefDefuncion).order_by(SinadefDefuncion.fila_archivo)).all()
    assert [f.fila_archivo for f in filas] == [4, 5, 6, 7, 8]
    assert [f.estado for f in filas] == ["FIRMADO", "ANULADO", "FIRMADO", "FIRMADO", "FIRMADO"]
    assert [f.numero_documento for f in filas] == ["12345678", "12345678", None, "12345678", "12345678"]
    assert (filas[0].tipo_cdef, filas[0].tipo_documento, filas[0].fecha_defuncion, filas[0].fecha_registro) == ("CDEF GRAL EN LINEA", "DNI/LE", date(2026, 8, 15), date(2026, 8, 16))
    assert (filas[4].fecha_defuncion, filas[4].fecha_registro) == (None, None)  # una casilla que no es fecha queda nula, no inventada
    # La fila completa queda guardada, en el orden de las columnas del lote.
    lote = sesion.get(LoteCarga, r.lote_id)
    assert lote.columnas == CABECERA and filas[0].fila_original[lote.columnas.index("NOMBRES")] == "Persona de Prueba"
    assert (lote.cobertura_desde, lote.cobertura_hasta, lote.fecha_extraccion) == (date(2026, 8, 1), date(2026, 8, 31), datetime(2026, 9, 30, 12, 0, tzinfo=ZONA))


def prueba_cargar_dos_veces_el_mismo_reporte_no_duplica(sesion, tmp_path, monkeypatch):
    ruta = reporte(tmp_path, monkeypatch, "agosto-2026.xls", [certificado(1), certificado(2)])
    cargar_sinadef(sesion, ruta)
    r = cargar_sinadef(sesion, ruta)
    assert r.lote_id is None and [m.estado for m in r.meses] == [YA_CARGADO]
    assert sesion.scalar(select(func.count()).select_from(SinadefDefuncion)) == 2


def prueba_el_reporte_completo_reemplaza_al_incompleto_del_mismo_mes(sesion, tmp_path, monkeypatch):
    cargar_sinadef(sesion, reporte(tmp_path, monkeypatch, "septiembre-incompleto-2026.xls", [certificado(1)], desde="01/09/2026", hasta="30/09/2026"))
    completo = reporte(tmp_path, monkeypatch, "septiembre-2026.xls", [certificado(1), certificado(2), certificado(3)], desde="01/09/2026", hasta="30/09/2026", generado=GENERADO + 10)
    r = cargar_sinadef(sesion, completo)
    assert [(m.estado, m.filas, m.filas_anteriores) for m in r.meses] == [(REEMPLAZADO, 3, 1)]
    assert vigentes(sesion) == {"2026-09": 3} and sesion.scalar(select(func.count()).select_from(SinadefDefuncion)) == 3
    assert [tuple(h) for h in sesion.execute(select(LoteMes.filas, LoteMes.es_vigente).order_by(LoteMes.id))] == [(1, False), (3, True)]


def prueba_un_reporte_mas_antiguo_y_mas_corto_no_pisa_al_cargado(sesion, tmp_path, monkeypatch):
    cargar_sinadef(sesion, reporte(tmp_path, monkeypatch, "agosto-2026.xls", [certificado(1), certificado(2)]))
    viejo = reporte(tmp_path, monkeypatch, "agosto-viejo.xls", [certificado(1)], generado=GENERADO - 20)
    with pytest.raises(CargaRechazada) as error:
        cargar_sinadef(sesion, viejo)
    assert len(error.value.motivos) == 3
    assert vigentes(sesion) == {"2026-08": 2}
    assert cargar_sinadef(sesion, viejo, forzar=True).meses[0].estado == REEMPLAZADO


def prueba_los_certificados_no_van_a_la_bitacora_y_su_lote_si(sesion, tmp_path, monkeypatch):
    cargar_sinadef(sesion, reporte(tmp_path, monkeypatch, "agosto-2026.xls", [certificado(1)]))
    tablas = set(sesion.execute(text("SELECT tabla FROM auditoria.registro_cambio WHERE esquema = 'fuente'")).scalars())
    assert {"lote_carga", "lote_mes"} <= tablas and "sinadef_defuncion" not in tablas


def prueba_de_una_carpeta_se_toman_todos_sus_xls(tmp_path):
    for nombre in ("b-2026.xls", "a-2026.xls", "notas.txt"):
        (tmp_path / nombre).write_text("x", encoding="utf-8")
    assert [a.name for a in archivos_de([str(tmp_path)])] == ["a-2026.xls", "b-2026.xls"]
    with pytest.raises(CargaRechazada, match="No existe"):
        archivos_de([str(tmp_path / "no-esta.xls")])


# --------------------------------------------------- defunciones verificadas


def verificados(carpeta, lineas: list[str], cabecera="numero_documento,fecha_defuncion,fecha_registro,fuente,fecha_verificacion"):
    ruta = carpeta / "fallecidos_verificados_sinadef_nacional.csv"
    ruta.write_text("\n".join([cabecera, *lineas]) + "\n", encoding="utf-8")
    return ruta


def prueba_carga_las_defunciones_verificadas(sesion, tmp_path):
    r = cargar_verificados(sesion, verificados(tmp_path, ["00000001,2026-07-02,2026-07-03,SINADEF nacional,2026-09-30", "00000002,2026-03-10,,,"]))
    assert (r.filas_archivo, r.nuevas, r.actualizadas, r.sin_cambio) == (2, 2, 0, 0)
    uno, dos = sesion.scalars(select(DefuncionVerificada).order_by(DefuncionVerificada.numero_documento)).all()
    assert (uno.fecha_defuncion, uno.fecha_registro, uno.origen, uno.fecha_verificacion) == (date(2026, 7, 2), date(2026, 7, 3), "SINADEF nacional", date(2026, 9, 30))
    assert (dos.fecha_registro, dos.origen, dos.fecha_verificacion) == (None, None, None)
    assert uno.lote_carga_id is not None


def prueba_volver_a_cargar_el_mismo_archivo_no_cambia_nada_ni_deja_lote(sesion, tmp_path):
    ruta = verificados(tmp_path, ["00000001,2026-07-02,2026-07-03,,"])
    cargar_verificados(sesion, ruta)
    r = cargar_verificados(sesion, ruta)
    assert (r.nuevas, r.actualizadas, r.sin_cambio) == (0, 0, 1)
    assert sesion.scalar(select(func.count()).select_from(LoteCarga)) == 1


def prueba_un_documento_que_ya_esta_se_actualiza_y_queda_en_la_bitacora(sesion, tmp_path):
    cargar_verificados(sesion, verificados(tmp_path, ["00000001,2026-07-02,,,"]))
    r = cargar_verificados(sesion, verificados(tmp_path, ["00000001,2026-07-05,,,", "00000003,2026-01-01,,,"]))
    assert (r.nuevas, r.actualizadas, r.sin_cambio) == (1, 1, 0)
    assert sesion.scalar(select(DefuncionVerificada.fecha_defuncion).where(DefuncionVerificada.numero_documento == "00000001")) == date(2026, 7, 5)
    operaciones = sesion.execute(text("SELECT operacion FROM auditoria.registro_cambio WHERE esquema = 'fuente' AND tabla = 'defuncion_verificada' ORDER BY id")).scalars().all()
    assert operaciones == ["INSERTAR", "ACTUALIZAR", "INSERTAR"]


@pytest.mark.parametrize("linea, motivo", [("1234567,2026-07-02,,,", "8 dígitos"), ("00000001,,,,", "falta la fecha de defunción"), ("00000001,02/07/2026,,,", "no es una fecha")])
def prueba_una_fila_invalida_detiene_la_carga_entera(sesion, tmp_path, linea, motivo):
    with pytest.raises(CargaRechazada, match=motivo):
        cargar_verificados(sesion, verificados(tmp_path, ["00000009,2026-01-01,,,", linea]))
    assert sesion.scalar(select(func.count()).select_from(DefuncionVerificada)) == 0


def prueba_un_csv_sin_las_columnas_necesarias_se_rechaza(sesion, tmp_path):
    with pytest.raises(CargaRechazada, match="fecha_defuncion"):
        cargar_verificados(sesion, verificados(tmp_path, ["00000001,2026"], cabecera="numero_documento,anio"))
