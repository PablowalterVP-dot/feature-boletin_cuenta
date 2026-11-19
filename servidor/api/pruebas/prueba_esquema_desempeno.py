"""Los esquemas `fuente` y `desempeno` (`servidor/api/bd/desempeno/`), instalados
encima de la base de Alejandro.

Que cada modelo coincide con su tabla ya lo comprueba `prueba_modelos_vs_bd.py`.
Aquí va lo que el esquema promete y un modelo no dice: sus catálogos, la regla de
una sola carga vigente por mes y qué tablas quedan fuera de la bitácora.
"""

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from app.datos.modelos import COLUMNAS_HIS, DimensionDesempeno, Ficha, FichaFuente, Fuente, LoteCarga, LoteMes, ReferenciaMinsa

pytestmark = pytest.mark.bd

HUELLA = "a" * 64


def _lote(sesion, fuente: Fuente, huella: str = HUELLA) -> LoteCarga:
    lote = LoteCarga(fuente_id=fuente.id, nombre_archivo="trama.csv", huella_sha256=huella, tamano_bytes=10, filas_archivo=1, filas_cargadas=1)
    sesion.add(lote)
    sesion.flush()
    return lote


def _his(sesion) -> Fuente:
    return sesion.scalar(select(Fuente).where(Fuente.codigo == "his_minsa"))


# ------------------------------------------------------------------ catálogos


def prueba_el_esquema_siembra_las_fuentes_y_las_34_fichas(sesion):
    codigos = set(sesion.scalars(select(Fuente.codigo)))
    # Las tres que se cargan, y las que el hospital todavía no carga.
    assert {"his_minsa", "sinadef_hrl", "sinadef_verificado"} <= codigos and len(codigos) == 18
    assert sesion.scalar(select(func.count()).select_from(Ficha)) == 34
    assert list(sesion.scalars(select(Ficha.numero).order_by(Ficha.numero))) == list(range(1, 35))
    assert sesion.scalar(select(Ficha.clave).where(Ficha.numero == 14)) == "oportunidad_tratamiento_oncologico"


def prueba_la_trama_del_his_son_57_columnas_y_empieza_y_termina_donde_el_archivo():
    """El orden es el del archivo: quien carga lo toma de aquí."""
    assert len(COLUMNAS_HIS) == 57
    assert COLUMNAS_HIS[0] == "id_cita" and COLUMNAS_HIS[4] == "fecha_atencion" and COLUMNAS_HIS[-1] == "nombres_registrador"


# ------------------------------------------------- una sola carga vigente por mes


def prueba_el_mismo_archivo_no_se_registra_dos_veces_en_una_fuente(sesion):
    his = _his(sesion)
    _lote(sesion, his)
    with pytest.raises(DBAPIError, match="uq_lote_carga_huella"):
        _lote(sesion, his)


def prueba_un_mes_de_una_fuente_tiene_una_sola_carga_vigente(sesion):
    his = _his(sesion)
    primero, segundo = _lote(sesion, his), _lote(sesion, his, "b" * 64)
    sesion.add(LoteMes(lote_carga_id=primero.id, fuente_id=his.id, anio=2026, mes=8, filas=1))
    sesion.flush()
    with pytest.raises(DBAPIError, match="uq_lote_mes_vigente"):
        sesion.add(LoteMes(lote_carga_id=segundo.id, fuente_id=his.id, anio=2026, mes=8, filas=1))
        sesion.flush()


def prueba_reemplazar_un_mes_conserva_la_carga_anterior_como_historia(sesion):
    his = _his(sesion)
    primero, segundo = _lote(sesion, his), _lote(sesion, his, "b" * 64)
    anterior = LoteMes(lote_carga_id=primero.id, fuente_id=his.id, anio=2026, mes=8, filas=1)
    sesion.add(anterior)
    sesion.flush()
    anterior.es_vigente = False
    sesion.add(LoteMes(lote_carga_id=segundo.id, fuente_id=his.id, anio=2026, mes=8, filas=2))
    sesion.flush()
    vigentes = sesion.scalars(select(LoteMes.lote_carga_id).where(LoteMes.fuente_id == his.id, LoteMes.anio == 2026, LoteMes.mes == 8, LoteMes.es_vigente)).all()
    assert vigentes == [segundo.id]
    assert sesion.scalar(select(func.count()).select_from(LoteMes).where(LoteMes.fuente_id == his.id)) == 2


# ---------------------------------------------------------------- bitácora


def _disparadores(sesion, esquema: str, tabla: str) -> set[str]:
    return set(
        sesion.execute(
            text("SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace::regnamespace::text = :e AND c.relname = :t"),
            {"e": esquema, "t": tabla},
        ).scalars()
    )


@pytest.mark.parametrize("esquema, tabla", [("fuente", "his_atencion"), ("fuente", "sinadef_defuncion"), ("desempeno", "resultado_paciente"), ("desempeno", "seguimiento_caso")])
def prueba_las_tablas_con_filas_de_pacientes_no_van_a_la_bitacora(sesion, esquema, tabla):
    """La bitácora copia la fila entera y no se puede borrar: auditarlas dejaría
    los datos de pacientes duplicados para siempre."""
    assert _disparadores(sesion, esquema, tabla) == {f"tg_{tabla}_control"}


@pytest.mark.parametrize(
    "esquema, tabla",
    [("fuente", "lote_carga"), ("fuente", "lote_mes"), ("fuente", "defuncion_verificada"), ("desempeno", "corrida"), ("desempeno", "referencia_minsa"), ("desempeno", "dimension"), ("desempeno", "ficha_fuente")],
)
def prueba_las_tablas_de_control_si_llevan_bitacora(sesion, esquema, tabla):
    assert _disparadores(sesion, esquema, tabla) == {f"tg_{tabla}_control", f"tg_{tabla}_auditoria"}


def prueba_registrar_un_lote_queda_en_la_bitacora(sesion):
    lote = _lote(sesion, _his(sesion))
    operaciones = sesion.execute(
        text("SELECT operacion FROM auditoria.registro_cambio WHERE esquema = 'fuente' AND tabla = 'lote_carga' AND registro_id = :id"), {"id": lote.id}
    ).scalars().all()
    assert operaciones == ["INSERTAR"]


# -------------------------------------------------------- lo que agrega 02_tablero


def prueba_cada_ficha_tiene_nombre_corto_y_dimension_y_la_del_inen_no_aplica(sesion):
    fichas = sesion.scalars(select(Ficha).order_by(Ficha.numero)).all()
    assert all(f.nombre_corto and f.dimension_id for f in fichas)
    assert [f.numero for f in fichas if not f.aplica_al_hospital] == [34]
    assert "INEN" in fichas[33].motivo_no_aplica
    assert sesion.scalar(select(func.count()).select_from(DimensionDesempeno).where(DimensionDesempeno.es_oficial)) == 0


def prueba_la_ficha_14_se_alimenta_del_his_de_sinadef_y_de_las_verificadas(sesion):
    codigos = sesion.scalars(
        select(Fuente.codigo).join(FichaFuente, FichaFuente.fuente_id == Fuente.id).join(Ficha, Ficha.id == FichaFuente.ficha_id).where(Ficha.numero == 14)
    ).all()
    assert set(codigos) == {"his_minsa", "sinadef_hrl", "sinadef_verificado"}
    # Toda ficha que aplica tiene de dónde salir; la del INEN, no.
    con_fuente = set(sesion.scalars(select(Ficha.numero).join(FichaFuente, FichaFuente.ficha_id == Ficha.id)))
    assert con_fuente == set(range(1, 34))


def prueba_la_referencia_de_minsa_de_enero_a_julio_es_la_del_reporte_oficial(sesion):
    refs = sesion.execute(
        select(ReferenciaMinsa.mes, ReferenciaMinsa.numerador, ReferenciaMinsa.denominador, ReferenciaMinsa.fecha_corte, ReferenciaMinsa.documento).order_by(ReferenciaMinsa.mes)
    ).all()
    assert [(m, n, d) for m, n, d, _, _ in refs] == [(1, 1, 9), (2, 3, 22), (3, 1, 10), (4, 0, 6), (5, 1, 11), (6, 0, 6), (7, 0, 11), (8, 0, 7)]
    assert {str(c) for _, _, _, c, _ in refs[:7]} == {"2026-08-08"} and refs[7][3] is None and refs[7][4] is None


def prueba_estadistica_ve_y_solo_el_superadministrador_carga(sesion):
    permisos = sesion.execute(
        text("SELECT r.codigo, p.codigo FROM seguridad.rol_permiso rp JOIN seguridad.rol r ON r.id = rp.rol_id JOIN seguridad.permiso p ON p.id = rp.permiso_id WHERE p.modulo = 'desempeno'")
    ).all()
    assert set(map(tuple, permisos)) == {("revisor", "desempeno.ver"), ("superadmin", "desempeno.ver"), ("superadmin", "desempeno.cargar")}


def prueba_un_caso_tiene_un_solo_seguimiento(sesion):
    ficha = sesion.scalar(select(Ficha.id).where(Ficha.numero == 14))
    insertar = text("INSERT INTO desempeno.seguimiento_caso (ficha_id, tipo_documento, numero_documento, categoria, fecha_referencia, estado) VALUES (:f, NULL, '11111111', 'MAMA', '2026-09-01', 'Sin revisar')")
    sesion.execute(insertar, {"f": ficha})
    with pytest.raises(DBAPIError, match="uq_seguimiento_caso"):
        with sesion.begin_nested():
            sesion.execute(insertar, {"f": ficha})
