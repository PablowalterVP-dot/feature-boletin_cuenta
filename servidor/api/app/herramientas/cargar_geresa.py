"""Carga el cuadro de Indicadores de Gestión Hospitalaria de GERESA de un año.

    python -m app.herramientas.cargar_geresa "<archivo.xlsx>" --anio 2026 [--ensayo]

Una sola vez por año ya llevado a mano: de ahí en adelante, los 22 se calculan con lo
que entregan las áreas y lo que Estadística digita en el sistema.

Guarda dos cosas: la cifra de cada indicador tal como dice el cuadro, y lo que era de
Estadística (camas, egresos, consulta externa…) como dato del mes, para que «Remisión a
DIRESA» arranque con lo real.

Se carga hasta el último mes con atenciones médicas. El cuadro trae celdas sueltas de
meses posteriores que no son datos de ese mes: consultorios repetidos hasta diciembre, o
una muerte neonatal de agosto sin su denominador.
"""

import argparse
import re
import sys
from pathlib import Path

from sqlalchemy import func, select

from app.api.dependencias import fijar_auditoria
from app.config import obtener_ajustes
from app.datos.modelos import Usuario
from app.dominio.reloj import RelojSistema, hoy
from app.servicios import monitoreo as servicio
from app.servicios.dl1153 import _Libro

# La columna donde empieza cada mes: E (enero), G (febrero)… AA (diciembre).
COLUMNAS_DE_MES = ("E", "G", "I", "K", "M", "O", "Q", "S", "U", "W", "Y", "AA")

# El indicador y la clave del dato de Estadística que trae en su numerador y denominador.
DATOS_DE_ESTADISTICA: dict[int, tuple[str | None, str | None]] = {
    1: ("atencionesCE", "horasProgramadas"),
    2: (None, "horasEfectivas"),
    3: (None, "atendidosCE"),
    4: ("consultoriosFuncionales", "consultoriosFisicos"),
    6: ("diasEstancia", "egresos"),
    8: ("pacientesDia", "diasCamaDisponibles"),
    9: (None, "camas"),
    10: ("atencionesEmergencia", None),
    11: ("urgenciasEmergencia", None),
    15: ("referencias", None),
    17: ("defunciones48", None),
    20: ("neonatalesPrecoces", None),
    21: ("neonatalesTardias", None),
}

NOTAS = {4: "En el cuadro de GERESA, estos consultorios son idénticos a los de 2025: confirmar con Consulta Externa."}


def _numero(texto: str | None) -> float | None:
    if texto is None:
        return None
    try:
        return float(texto)
    except ValueError:
        return None  # Un error de la hoja (#DIV/0!) no es una cifra.


def leer(ruta: Path, anio: int) -> tuple[dict[int, dict[int, tuple[float | None, float | None]]], int]:
    """{indicador: {mes: (numerador, denominador)}} y el último mes con datos."""
    libro = _Libro(ruta)
    hoja = next((r for n, r in libro.hojas() if n.strip() == str(anio) or re.search(rf"GEST.*{anio}", n)), None)
    if hoja is None:
        raise ValueError(f"El archivo no tiene una hoja del año {anio}.")
    celdas = libro.celdas(hoja, hasta_fila=70)
    filas: dict[int, int] = {}
    for clave, texto in celdas.items():
        hallado = re.fullmatch(r"A(\d+)", clave)
        if hallado and re.fullmatch(r"\d+(\.0)?", texto.strip()) and 1 <= int(float(texto)) <= 22:
            filas.setdefault(int(float(texto)), int(hallado.group(1)))
    if len(filas) != 22:
        raise ValueError(f"Se esperaban los 22 indicadores en la hoja {anio} y hay {len(filas)}.")
    ultimo = 0
    for mes, columna in enumerate(COLUMNAS_DE_MES, start=1):
        if _numero(celdas.get(f"{columna}{filas[1]}")) is not None:
            ultimo = mes
    if ultimo == 0:
        raise ValueError("El cuadro no trae atenciones médicas de ningún mes.")
    salida: dict[int, dict[int, tuple[float | None, float | None]]] = {}
    for indicador, fila in sorted(filas.items()):
        salida[indicador] = {}
        for mes in range(1, ultimo + 1):
            columna = COLUMNAS_DE_MES[mes - 1]
            salida[indicador][mes] = (_numero(celdas.get(f"{columna}{fila}")), _numero(celdas.get(f"{columna}{fila + 1}")))
    return salida, ultimo


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Carga el cuadro de gestión hospitalaria de GERESA.")
    parser.add_argument("archivo", type=Path)
    parser.add_argument("--anio", type=int, required=True)
    parser.add_argument("--ensayo", action="store_true", help="dice qué cargaría, sin guardar")
    parser.add_argument("--usuario", default="superadmin")
    args = parser.parse_args(argv)

    try:
        datos, ultimo = leer(args.archivo, args.anio)
    except ValueError as e:
        print(f"No se cargó: {e}", file=sys.stderr)
        return 1

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {obtener_ajustes().url_base.split('@')[-1]}")
    print(f"Cuadro de GERESA {args.anio}: 22 indicadores, hasta el mes {ultimo}.")
    documento = args.archivo.name[:255]
    with fabrica()() as bd:
        usuario = bd.scalar(select(Usuario.id).where(func.lower(Usuario.nombre_usuario) == args.usuario.lower()))
        if usuario is None:
            print(f"No se cargó: no existe la cuenta «{args.usuario}».", file=sys.stderr)
            return 1
        fijar_auditoria(bd, usuario, None)
        hoy_real = hoy(RelojSistema())
        cifras = claves = 0
        for indicador, meses in datos.items():
            nota = NOTAS.get(indicador)
            clave_num, clave_den = DATOS_DE_ESTADISTICA.get(indicador, (None, None))
            for mes, (num, den) in meses.items():
                if num is None and den is None:
                    continue  # Un mes sin dato no tiene fila: no es un cero.
                servicio._escribir(bd, familia="geresa", indicador=indicador, serie="principal", ambito="hospital", anio=args.anio, mes=mes, numerador=num, denominador=den,
                                   origen="geresa_excel", fecha_corte=None, documento=documento, nota=nota, usuario_id=usuario)
                cifras += 1
                for clave, valor in ((clave_num, num), (clave_den, den)):
                    if clave and valor is not None:
                        servicio.guardar_dato(bd, anio=args.anio, mes=mes, clave=clave, valor=valor, nota=nota, usuario_id=usuario, hoy=hoy_real, origen="geresa_excel")
                        claves += 1
        if args.ensayo:
            bd.rollback()
            print(f"Ensayo: {cifras} cifras y {claves} datos del mes; no se guardó nada.")
        else:
            bd.commit()
            print(f"Cargadas {cifras} cifras y {claves} datos del mes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
