"""Registra lo que MINSA publicó de una ficha y un mes, y recalcula.

    python -m app.herramientas.registrar_minsa --ficha 14 --anio 2026 --mes 8 --numerador 0 --denominador 7
    python -m app.herramientas.registrar_minsa --ficha 14 --anio 2026 --mes 9 --numerador 0 --denominador 5 \\
        --corte 2026-10-08 --documento "reporte_oficial_minsa_2026_setiembre.xlsx"

Es lo mismo que hará la pantalla «Carga de datos» del tablero. Las cifras sirven
para comparar («coincide» o «difiere»). La fecha de corte, además, se usa al
calcular: los meses que ya habían terminado ese día se calculan con lo conocido
hasta entonces, como en el reporte de MINSA. Por eso, si se da `--corte`, se
recalcula la ficha en ese momento.

Si el mes ya estaba registrado, se reemplaza.
"""

import argparse
import sys
from datetime import date

from sqlalchemy import func, select

from app.api.dependencias import fijar_auditoria
from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Usuario
from app.dominio.reloj import RelojSistema, hoy
from app.servicios import desempeno as calculo
from app.servicios import tablero as servicio
from app.servicios.errores import NoEncontrado


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Registra lo publicado por MINSA de una ficha y un mes.")
    parser.add_argument("--ficha", type=int, required=True)
    parser.add_argument("--anio", type=int, required=True)
    parser.add_argument("--mes", type=int, required=True, choices=range(1, 13), metavar="1-12")
    parser.add_argument("--numerador", type=int, required=True)
    parser.add_argument("--denominador", type=int, required=True)
    parser.add_argument("--corte", type=date.fromisoformat, help="AAAA-MM-DD: la fecha de corte del reporte de MINSA, si se conoce")
    parser.add_argument("--documento", help="el archivo del que se tomaron las cifras")
    parser.add_argument("--observacion")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien se registra")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    print(f"Base de datos: {obtener_ajustes().url_base.split('@')[-1]}")
    with fabrica()() as bd:
        usuario = bd.scalar(select(Usuario.id).where(func.lower(Usuario.nombre_usuario) == args.usuario.lower(), vigente(Usuario)))
        if usuario is None:
            print(f"No se registró: no existe la cuenta «{args.usuario}».", file=sys.stderr)
            return 1
        fijar_auditoria(bd, usuario, None)
        try:
            r = servicio.guardar_referencia(
                bd, numero=args.ficha, anio=args.anio, mes=args.mes, numerador=args.numerador, denominador=args.denominador,
                fecha_corte=args.corte, documento=args.documento, observacion=args.observacion, hoy=hoy(RelojSistema()),
            )  # fmt: skip
        except (servicio.ValorInvalido, NoEncontrado) as e:
            print(f"No se registró: {e}", file=sys.stderr)
            return 1
        bd.commit()
        if r.numero in calculo.CALCULOS:
            recalculo = calculo.recalcular(bd, numero=r.numero, anio=r.anio, usuario_id=usuario)
            bd.commit()
            if recalculo.motivo:
                print(f"No se pudo recalcular: {recalculo.motivo}", file=sys.stderr)
            elif recalculo.calculo is not None:
                print(f"Recalculada la ficha {r.numero} de {r.anio}: corrida {recalculo.corrida_id}.")
            # La comparación, con el cálculo de después: un corte nuevo la cambia.
            r = next(x for x in servicio.referencias(bd, anio=r.anio) if x.numero == r.numero and x.mes == r.mes)
    calculado = r.calculado
    comparacion = "sin cálculo del hospital para ese mes" if calculado is None else (
        f"el hospital calcula {calculado.numerador}/{calculado.denominador}: " + ("coincide" if (calculado.numerador, calculado.denominador) == (r.numerador, r.denominador) else "DIFIERE")
    )
    print(f"Ficha {r.numero}, {r.mes:02d}/{r.anio}: MINSA {r.numerador}/{r.denominador}" + (f", corte {r.fecha_corte:%d/%m/%Y}" if r.fecha_corte else ", sin fecha de corte") + f" · {comparacion}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
