"""Arranque sin datos ficticios: para probar el flujo a mano con datos nuevos.

Borra TODO (pacientes, órdenes, hospitalizaciones, censos, bitácora…) y deja solo
lo de referencia: estructura, plano, cuentas, dotación, parámetros, CIE-10 y
médicos, y pone la fecha de arranque de las áreas con plano. El sistema usa
siempre la hora real.

    .venv/Scripts/python -m semillas.iniciar_sin_datos                     # muestra qué haría
    .venv/Scripts/python -m semillas.iniciar_sin_datos --confirmar         # arranca hoy
    .venv/Scripts/python -m semillas.iniciar_sin_datos --confirmar --arranque 2026-11-12

No borra nada sin `--confirmar`. Después, el día de arranque, enfermería registra
con «Censo inicial» a los pacientes que ya estaban hospitalizados."""

import argparse
from datetime import date

from sqlalchemy import create_engine, text

from app.config import url_owner
from semillas.cargar_maestros import DIGITALES, cargar as cargar_maestros, exportar

INCORPORADOS = tuple(sorted(DIGITALES))

TABLAS = (
    "auditoria, bitacora, parametro, renoxi_carga, ajuste_periodo, indicador_mes_cerrado, periodo, dotacion_detalle, dotacion_version, "
    "conteo_unidad_diario, censo_nota, censo_detalle, censo_diario, correccion_movimiento, control_hc, diagnostico_egreso, egreso, "
    "traslado, ocupacion_cama, movimiento, hospitalizacion, orden_hospitalizacion, paciente, cie10, medico, orden_mantenimiento, "
    "activo_cama, bloqueo_cama, cuenta_servicio, cuenta, cama, zona, piso, servicio, departamento"
)


def cargar_clinicos(conexion, datos: dict) -> None:
    """CIE-10 y médicos. Hoy son la muestra del prototipo (ver datos/clinicos.js)."""
    for c in datos["cie10"]:
        conexion.execute(text("INSERT INTO cie10 (codigo, nombre) VALUES (:c, :n) ON CONFLICT DO NOTHING"), {"c": c["value"], "n": c["label"]})
    for m in datos["medicos"]:
        conexion.execute(text("INSERT INTO medico (id, nombre) VALUES (:id, :n) ON CONFLICT DO NOTHING"), {"id": m["value"], "n": m["label"]})


def iniciar(conexion, arranque: str) -> None:
    datos = exportar()
    conexion.execute(text(f"TRUNCATE {TABLAS} RESTART IDENTITY CASCADE"))
    cargar_maestros(conexion, datos)
    conexion.execute(text("SELECT set_config('app.cuenta_id', 'sistema', true)"))
    cargar_clinicos(conexion, datos)
    conexion.execute(
        text("UPDATE servicio SET fecha_arranque = CAST(:d AS date) WHERE id = ANY(:s)"), {"d": arranque, "s": list(INCORPORADOS)}
    )
    conexion.execute(text("SELECT refrescar_indicadores()"))


def principal() -> None:
    p = argparse.ArgumentParser(description="Borra todos los datos y deja el sistema listo para cargar datos nuevos.")
    p.add_argument("--arranque", default=date.today().isoformat(), help="Día de arranque de las áreas con plano (AAAA-MM-DD). Por defecto, hoy.")
    p.add_argument("--confirmar", action="store_true", help="Sin esto no se borra nada.")
    a = p.parse_args()
    date.fromisoformat(a.arranque)
    if a.arranque > date.today().isoformat():
        raise SystemExit("El arranque no puede ser una fecha futura.")
    if not a.confirmar:
        print("No se borró nada. Con --confirmar se haría esto:")
        print("  - borrar pacientes, órdenes, hospitalizaciones, movimientos, censos, egresos, mantenimiento y bitácora;")
        print("  - cargar estructura, plano, las cuentas, dotación, parámetros, CIE-10 y médicos;")
        print(f"  - arranque de las áreas con plano: {a.arranque};")
        return
    with create_engine(url_owner()).begin() as c:
        iniciar(c, a.arranque)
    print(f"Listo: sin datos de pacientes. Arranque {a.arranque}.")


if __name__ == "__main__":
    principal()
