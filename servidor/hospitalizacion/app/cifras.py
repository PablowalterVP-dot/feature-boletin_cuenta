"""Las cifras del mes que Estadística pone al lado de las suyas (fase 4 de la decisión 0011).

Estadística digita cada mes los egresos, los pacientes-día, los días-cama y las camas del
hospital entero, y con ellos calcula la ocupación (ficha 23) y el intervalo de sustitución
(ficha 24). Este sistema ya tiene esas cifras, calculadas desde los movimientos, pero solo
de las áreas que tienen plano. Por eso se entregan **al lado**, nunca en lugar de lo
digitado, y siempre con su cobertura: qué áreas, cuántas camas y cuántas tiene el
hospital según la relación oficial y según el conteo físico.

Un mes cerrado se lee de `indicador_mes_cerrado`, la foto que guardó el cierre. El mes en
curso se lee de `mv_indicadores_mes`, que se refresca al cerrar cada censo: sus cifras
llegan hasta el último censo cerrado. Las correcciones posteriores al cierre
(`ajuste_periodo`) no se aplican: se cuentan para avisar que existen.

Solo cifras agregadas: nada de esto lleva datos de pacientes."""

from sqlalchemy import text

# Las claves de Estadística (`frontend/src/app/datos/estadistica-propios.js`) frente a las
# variables de este sistema (`proceso/reglas.md`).
VARIABLES = {"camas": "a", "pacientesDia": "b", "diasEstancia": "c", "diasCamaDisponibles": "d", "egresos": "e"}


def _filas(conexion, sql: str, **parametros) -> list[dict]:
    return [dict(f) for f in conexion.execute(text(sql), parametros).mappings()]


def _dotacion(conexion, oficial: bool) -> tuple[int, dict[str, int]]:
    """El total del hospital y el de cada departamento en la dotación vigente hoy."""
    filas = _filas(
        conexion,
        """SELECT dd.departamento_id, sum(dd.n_camas)::integer AS camas
             FROM dotacion_detalle dd JOIN dotacion_version v ON v.id = dd.version_id
            WHERE v.id = (SELECT id FROM dotacion_version
                           WHERE oficial = :oficial AND vigente_desde <= current_date
                             AND (vigente_hasta IS NULL OR vigente_hasta >= current_date)
                           ORDER BY vigente_desde DESC LIMIT 1)
            GROUP BY dd.departamento_id""",
        oficial=oficial,
    )
    por_departamento = {f["departamento_id"]: f["camas"] for f in filas}
    return sum(por_departamento.values()), por_departamento


def cobertura(conexion) -> dict:
    """Qué parte del hospital miden estas cifras."""
    servicios = _filas(
        conexion,
        """SELECT s.id, s.nombre, s.departamento_id, d.nombre AS departamento, count(c.id)::integer AS camas
             FROM servicio s JOIN departamento d ON d.id = s.departamento_id
             JOIN cama c ON c.servicio_id = s.id AND c.activa
            GROUP BY s.id, d.nombre ORDER BY d.nombre, s.nombre""",
    )
    departamentos = sorted({s["departamento_id"] for s in servicios})
    oficial, oficial_por_departamento = _dotacion(conexion, True)
    fisico, _ = _dotacion(conexion, False)
    return {
        "servicios": [{"id": s["id"], "nombre": s["nombre"], "departamento": s["departamento"], "camas": s["camas"]} for s in servicios],
        "camas": sum(s["camas"] for s in servicios),
        "departamentos": len(departamentos),
        # Lo que esos departamentos tienen en la relación oficial: Medicina tiene 53 camas
        # contadas y 42 en la relación.
        "camasOficialesDeLosDepartamentos": sum(oficial_por_departamento.get(d, 0) for d in departamentos),
        "camasOficialesDelHospital": oficial,
        "camasContadasDelHospital": fisico or None,
    }


def del_anio(conexion, anio: int) -> dict:
    desde, hasta = f"{anio}-01-01", f"{anio + 1}-01-01"
    cerrados = {f["mes"] for f in _filas(conexion, "SELECT mes FROM periodo WHERE estado = 'cerrado' AND mes >= CAST(:d AS date) AND mes < CAST(:h AS date)", d=desde, h=hasta)}
    columnas = "mes, sum(a)::integer AS a, sum(b)::integer AS b, sum(c)::integer AS c, sum(d)::integer AS d, sum(e)::integer AS e, max(dias_con_censo)::integer AS dias"
    filtro = "base = 'mapeo' AND mes >= CAST(:d AS date) AND mes < CAST(:h AS date) GROUP BY mes"
    fotos = {f["mes"]: f for f in _filas(conexion, f"SELECT {columnas} FROM indicador_mes_cerrado WHERE {filtro}", d=desde, h=hasta)}
    vivos = {f["mes"]: f for f in _filas(conexion, f"SELECT {columnas} FROM mv_indicadores_mes WHERE {filtro}", d=desde, h=hasta)}
    defunciones = {
        f["mes"]: f["n"]
        for f in _filas(
            conexion,
            """SELECT date_trunc('month', dia_censo(e.fecha_hora))::date AS mes, count(*)::integer AS n
                 FROM egreso e
                WHERE NOT e.anulado AND e.estado IN ('completo', 'validado', 'cerrado') AND e.tipo = 'fallecido_mayor_48'
                  AND date_trunc('month', dia_censo(e.fecha_hora))::date >= CAST(:d AS date)
                  AND date_trunc('month', dia_censo(e.fecha_hora))::date < CAST(:h AS date)
                GROUP BY 1""",
            d=desde, h=hasta,
        )
    }
    ajustes = {f["mes"]: f["n"] for f in _filas(conexion, "SELECT mes, count(*)::integer AS n FROM ajuste_periodo WHERE mes >= CAST(:d AS date) AND mes < CAST(:h AS date) GROUP BY mes", d=desde, h=hasta)}

    meses = []
    for mes in sorted(set(fotos) | set(vivos)):
        cerrado = mes in cerrados and mes in fotos
        fila = fotos[mes] if cerrado else vivos.get(mes)
        if not fila:
            continue
        meses.append({
            "mes": mes.strftime("%Y-%m"),
            "cerrado": cerrado,
            **{clave: fila[variable] for clave, variable in VARIABLES.items()},
            "defunciones48": defunciones.get(mes, 0),
            "diasConCenso": fila["dias"],
            "ajustes": ajustes.get(mes, 0),
        })
    return {"anio": anio, "cobertura": cobertura(conexion), "meses": meses}
