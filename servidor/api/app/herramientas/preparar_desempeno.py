"""Deja el módulo de indicadores de desempeño listo en una base, de una sola vez:
crea las tablas, carga los datos y calcula.

    python -m app.herramientas.preparar_desempeno "C:/…/HRL/data"

Para solo levantar el módulo, sin datos, basta `npm run desempeno` (desde
servidor/), que corre únicamente el paso 1; los datos se suben después, desde la
pantalla «Carga de datos» o con este comando.

No hace nada que no hagan los otros comandos: los corre en orden, para que quien
recibe el código y la carpeta de datos no tenga que saber cuáles son ni con qué
opciones. Cada paso sigue pudiéndose correr por separado.

    1. instalar_desempeno   las tablas, si no están
    2. cargar_his           el consolidado y las tramas mensuales
    3. cargar_sinadef       los reportes de defunciones y los verificados
    4. calcular             la Ficha 14 de cada año con enero cargado, con el corte
                            del último reporte de MINSA registrado en la base

Se puede correr las veces que se quiera: lo ya cargado no se duplica y, si no
entró ningún dato nuevo desde el último cálculo, no se calcula otra vez.

La carpeta de datos se pide a Estadística y **no va al repositorio**. Debe tener
los archivos con los nombres de `RECETA`, que son los de origen.
"""

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import func, select

from app.api.dependencias import fijar_auditoria
from app.datos.base import vigente
from app.datos.modelos import Usuario
from app.dominio.fuentes import fecha_de_extraccion
from app.herramientas import calcular_desempeno, cargar_his, cargar_sinadef, instalar_desempeno, ver_fuentes
from app.servicios import desempeno as servicio

# Qué archivos se cargan. La fecha de corte no está aquí: es la del último
# reporte de MINSA registrado en la base (`desempeno.referencia_minsa`).
CONSOLIDADO = "datos_crudo2021_2026.csv"
DESDE = "2025-12"  # del consolidado, que arranca en 2021, solo esto: el año y un mes de margen
CARPETA_DE_TRAMAS = "his_minsa"
CARPETA_DE_SINADEF = "datos_de_muertos"
VERIFICADOS = "fallecidos_verificados_sinadef_nacional.csv"


@dataclass
class Receta:
    """Lo que hay en la carpeta de datos, en el orden en que se carga."""

    consolidado: Path | None = None
    tramas: list[Path] = field(default_factory=list)
    sinadef: Path | None = None
    verificados: Path | None = None
    faltan: list[str] = field(default_factory=list)


def _cuando_se_extrajo(trama: Path) -> tuple[float, str]:
    extraccion = fecha_de_extraccion(trama.name)
    return (extraccion.timestamp() if extraccion else 0.0, trama.name)


def receta_de(carpeta: Path) -> Receta:
    """Busca los archivos por su nombre de origen. Lo que falta se dice todo
    junto: nadie debería enterarse de un archivo a la vez."""
    r = Receta()
    if not carpeta.is_dir():
        r.faltan.append(f"No existe la carpeta «{carpeta}».")
        return r
    if (carpeta / CONSOLIDADO).is_file():
        r.consolidado = carpeta / CONSOLIDADO
    else:
        r.faltan.append(f"Falta «{CONSOLIDADO}»: el consolidado del HIS.")
    # Por fecha de extracción: de dos versiones del mismo mes, la más nueva
    # entra al final y es la que queda.
    r.tramas = sorted((carpeta / CARPETA_DE_TRAMAS).glob("*.csv"), key=_cuando_se_extrajo)
    if any((carpeta / CARPETA_DE_SINADEF).glob("*.xls")):
        r.sinadef = carpeta / CARPETA_DE_SINADEF
    else:
        r.faltan.append(f"Falta la carpeta «{CARPETA_DE_SINADEF}» con los reportes .xls de SINADEF.")
    # Los verificados son un complemento: sin ese archivo se sigue.
    if (carpeta / VERIFICADOS).is_file():
        r.verificados = carpeta / VERIFICADOS
    return r


def _titulo(texto: str) -> None:
    print(f"\n── {texto} ──", flush=True)


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Crea las tablas de indicadores de desempeño, carga los datos y calcula, de una vez.")
    parser.add_argument("datos", help="la carpeta con los archivos del HIS y de SINADEF (no se copian)")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien queda todo")
    args = parser.parse_args(argv)

    receta = receta_de(Path(args.datos))
    if receta.faltan:
        print("No se empezó. En la carpeta de datos:", file=sys.stderr)
        for falta in receta.faltan:
            print(f"  {falta}", file=sys.stderr)
        return 1

    _titulo("1 de 4 · Tablas")
    if instalar_desempeno.main() != 0:
        return 1

    cuenta = ["--usuario", args.usuario]
    no_cargados = 0
    _titulo("2 de 4 · HIS MINSA")
    no_cargados += cargar_his.main([str(receta.consolidado), "--desde", DESDE, *cuenta]) != 0
    for trama in receta.tramas:
        no_cargados += cargar_his.main([str(trama), *cuenta]) != 0

    _titulo("3 de 4 · SINADEF")
    verificados = ["--verificados", str(receta.verificados)] if receta.verificados else []
    no_cargados += cargar_sinadef.main([str(receta.sinadef), *verificados, *cuenta]) != 0
    if not receta.verificados:
        print(f"Sin «{VERIFICADOS}»: no se cargan defunciones verificadas a mano.")

    _titulo("Lo que quedó cargado")
    ver_fuentes.main([])
    if no_cargados:
        print(f"\nATENCIÓN: {no_cargados} archivo(s) no se cargaron; el motivo está arriba. Una versión más antigua de un mes ya cargado es lo esperable; cualquier otro motivo hay que revisarlo.")

    # El resultado va al final: es lo que se viene a buscar.
    _titulo("4 de 4 · Cálculo de la Ficha 14")
    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    with fabrica()() as bd:
        usuario = bd.scalar(select(Usuario.id).where(func.lower(Usuario.nombre_usuario) == args.usuario.lower(), vigente(Usuario)))
        fijar_auditoria(bd, usuario, None)
        resultados = servicio.recalcular_todo(bd, usuario_id=usuario)
        bd.commit()
    if not resultados:
        print("No hay ningún año con enero del HIS cargado: no hay nada que calcular.", file=sys.stderr)
        return 1
    fallo = False
    for r in resultados:
        if r.motivo:
            fallo = True
            print(f"Ficha {r.numero} · {r.anio}: no se calculó. {r.motivo}", file=sys.stderr)
        elif r.calculo is None:
            print(f"Ficha {r.numero} · {r.anio}: ya estaba calculada con estos datos (corrida {r.corrida_id}). No se calcula otra vez.")
        else:
            print("\n".join(calcular_desempeno.lineas_de(r.calculo, ensayo=False)))
    return 1 if fallo else 0


if __name__ == "__main__":
    raise SystemExit(main())
