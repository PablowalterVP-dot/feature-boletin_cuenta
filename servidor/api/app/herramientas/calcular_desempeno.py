"""Calcula un indicador de desempeño con los datos cargados en `fuente` y guarda
el resultado en `desempeno`.

    python -m app.herramientas.calcular_desempeno --ficha 14 --anio 2026
    python -m app.herramientas.calcular_desempeno --ficha 14 --anio 2026 --corte 2026-08-08
    python -m app.herramientas.calcular_desempeno --ficha 14 --anio 2026 --ensayo   # calcula y muestra, sin guardar

Cada vez que se corre queda una **corrida** nueva, con su fecha de corte y los
archivos de los que salió; las anteriores no se tocan. Es a propósito: el mismo
mes da cifras distintas según cuándo se calcule, y solo así se pueden comparar.

- `--corte AAAA-MM-DD` es la fecha de corte del reporte oficial de MINSA. Los
  meses que ya habían terminado ese día se calculan solo con lo ocurrido y
  registrado hasta entonces, y dan lo que MINSA publicó; los siguientes, que aún
  no tienen reporte, se calculan al día. Sin ella, todo se calcula al día.
- `--hasta-mes` es el último mes cuyos diagnósticos se cuentan. Por omisión, el
  último cargado.
- Muestra el numerador y el denominador de cada mes. Lo demás (plazos abiertos,
  excluidos y por qué) queda guardado con la corrida.
- No muestra a ningún paciente: la lista nominal queda en la base
  (`desempeno.resultado_paciente`), no en la terminal.
"""

import argparse
import sys
from datetime import date

from sqlalchemy import func, select

from app.api.dependencias import fijar_auditoria
from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Usuario
from app.dominio.desempeno.defunciones import DefuncionSinFecha
from app.servicios import desempeno as servicio
from app.servicios.desempeno import CalculoRechazado

CALCULOS = servicio.CALCULOS

_MESES = ("", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre")


def _tramo(desde: int, hasta: int) -> str:
    return _MESES[desde].capitalize() if desde == hasta else f"{_MESES[desde].capitalize()} a {_MESES[hasta]}"


def lineas_de(c: servicio.Calculo, *, ensayo: bool) -> list[str]:
    """El resultado, para leer en la terminal."""
    lineas = [f"Ficha 14 · {c.anio}", "", "  Mes         Numerador  Denominador"]
    for m in c.meses:
        lineas.append(f"  {_MESES[m.mes].capitalize():<10}  {m.numerador:>9}  {m.denominador:>11}")
    lineas.append("")
    if c.mes_con_corte:
        lineas.append(f"{_tramo(1, c.mes_con_corte)}: con el corte oficial del {c.fecha_corte:%d/%m/%Y}.")
    if c.mes_hasta > c.mes_con_corte:
        lineas.append(f"{_tramo(c.mes_con_corte + 1, c.mes_hasta)}: al día, con los datos cargados hasta el {c.fecha_fin_observacion:%d/%m/%Y}; puede cambiar.")
    for aviso in c.avisos:
        lineas.append(f"ATENCIÓN: {aviso}")
    lineas.append("ENSAYO: no se guardó nada." if ensayo else f"Guardado como corrida {c.corrida_id}.")
    return lineas


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Calcula un indicador de desempeño y guarda el resultado.")
    parser.add_argument("--ficha", type=int, required=True, help="número de la ficha (hoy: 14)")
    parser.add_argument("--anio", type=int, required=True, help="año que se evalúa")
    parser.add_argument("--hasta-mes", type=int, choices=range(1, 13), metavar="1-12", help="último mes que se cuenta; por omisión, el último cargado")
    parser.add_argument("--corte", type=date.fromisoformat, help="AAAA-MM-DD: corte del reporte oficial de MINSA; vale para los meses ya terminados ese día")
    parser.add_argument("--observacion", help="una nota que queda con la corrida (por ejemplo, «corte oficial de MINSA»)")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien se calcula")
    parser.add_argument("--ensayo", action="store_true", help="calcula y muestra, sin guardar")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    try:
        calcular = CALCULOS.get(args.ficha)
        if calcular is None:
            raise CalculoRechazado(f"La ficha {args.ficha} aún no tiene cálculo en el sistema. Las que tienen: {', '.join(str(n) for n in sorted(CALCULOS))}.")
        print(f"Base de datos: {obtener_ajustes().url_base.split('@')[-1]}")
        with fabrica()() as bd:
            usuario = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == args.usuario.lower(), vigente(Usuario)))
            if usuario is None:
                raise CalculoRechazado(f"No existe la cuenta «{args.usuario}».")
            fijar_auditoria(bd, usuario.id, None)
            calculo = calcular(bd, anio=args.anio, mes_hasta=args.hasta_mes, fecha_corte=args.corte, usuario_id=usuario.id, observacion=args.observacion)
            if args.ensayo:
                bd.rollback()
            else:
                bd.commit()
        print("\n".join(lineas_de(calculo, ensayo=args.ensayo)))
    except CalculoRechazado as e:
        print("No se calculó:", file=sys.stderr)
        for motivo in e.motivos:
            print(f"  {motivo}", file=sys.stderr)
        return 1
    except DefuncionSinFecha as e:
        print(f"No se calculó:\n  {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
