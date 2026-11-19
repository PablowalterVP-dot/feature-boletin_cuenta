"""Rectifica los meses de Centro Quirúrgico cuyas horas se guardaron en días.

    python -m app.herramientas.recargar_horas_cqx            # rectifica
    python -m app.herramientas.recargar_horas_cqx --revisar  # solo dice qué haría

Por qué existe: las horas del libro del área están en formato `[h]:mm` («997:57»),
y Excel las guarda en días (41,58). Hasta la versión 0.2.0 el bot leía ese 41,58
como horas: todas las horas quedaron divididas entre 24. El bot 0.3.0 las lee bien
(07/11/2026), pero lo ya guardado no cambia solo.

**Por el camino de siempre, no por SQL.** La base no deja tocar las casillas de un
reporte remitido (`tg_valor_solo_en_borrador`), y está bien que no lo deje: lo que
recibió cada oficina tiene que quedar como prueba. Así que cada mes se **rectifica**
(queda «Desactualizada» para quien lo recibió), se vuelve a leer el mismo archivo
con el bot de ahora, conservando las justificaciones de sus avisos, y se reenvía
con una constancia de rectificación. Todo a nombre del superadministrador, con el
motivo en el historial del reporte. Un mes en borrador solo se vuelve a leer.

**Solo actúa si lo comprueba.** Antes de escribir nada, el bot relee el archivo y
se compara hora por hora con lo guardado: se rectifica un mes solo si alguna hora
difiere y **todas** las que difieren son la guardada por 24 (con la tolerancia del
redondeo a centésimas en días). Si no, se informa y no se toca: sería otro archivo
u otra cosa, y no se adivina. Las cargas hechas con el bot 0.3.0 ni se revisan.
Por eso se puede correr en cada arranque (`preparar_base`): en una base ya
corregida no hace nada.

El archivo es el que se guardó al cargarlo (`ruta_cargas`). Si en esta máquina no
está —la base compartida guarda la ruta, no el contenido—, se usa el del histórico
versionado (`historico/centro_quirurgico/`, con sus correcciones), que es el mismo.
"""

import argparse
import sys
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select

from app.api.dependencias import fijar_auditoria
from app.config import Ajustes, obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Archivo, EstadoReporte, Formato, Hallazgo, Indicador, Periodo, Reporte, Usuario, Valor
from app.datos.reportes import carga_aceptada_vigente
from app.dominio import estados, periodos
from app.dominio.reloj import ZONA, RelojSistema
from app.herramientas import cargar_historico
from app.servicios import bot
from app.servicios import transiciones as servicio_transiciones

FORMATO = "CQX"
AREA = "centro-quirurgico"
# La versión del bot que ya lee las horas en horas. Una carga anterior se revisa.
VERSION_CORREGIDA = (0, 3, 0)
# Lo que se pierde al guardar días con dos decimales: 0,005 días = 0,12 h, más el
# redondeo a centésimas de la hora.
TOLERANCIA = Decimal("0.15")
MOTIVO = (
    "Las horas quirúrgicas se habían leído en días: el libro las trae en horas:minutos "
    "(«997:57») y el bot anterior tomaba la cifra que Excel guarda por dentro (41,58 días). "
    "Se vuelve a leer el mismo archivo con el bot corregido; solo cambian las horas."
)


class NoSePuede(Exception):
    pass


@dataclass(frozen=True)
class Respaldo:
    """El archivo del histórico versionado de un mes, con sus correcciones."""

    archivo: Path
    correcciones: tuple[tuple[str, str, float], ...] = ()


def _version(texto: str | None) -> tuple[int, ...]:
    try:
        return tuple(int(x) for x in (texto or "0").split("."))
    except ValueError:
        return (0,)


def _horas_del_informe(informe: dict) -> dict[str, Decimal]:
    """{`resumen.horas_efectivas.emergencia`: horas} de lo que leyó el bot."""
    horas = {}
    for cuadro, filas in (informe.get("datos") or {}).items():
        if not isinstance(filas, dict):
            continue
        for clave, valor in filas.items():
            if "horas" in clave and isinstance(valor, (int, float)):
                horas[f"{cuadro}.{clave}"] = Decimal(str(valor)).quantize(Decimal("0.01"))
    return horas


def _horas_guardadas(bd, reporte_id: int) -> dict[str, Decimal]:
    filas = bd.execute(
        select(Indicador.codigo, Valor.valor)
        .join(Indicador, Indicador.id == Valor.indicador_id)
        .where(Valor.reporte_id == reporte_id, vigente(Valor), Indicador.codigo.like("%horas%"), Valor.valor.is_not(None))
    ).all()
    return {codigo: valor for codigo, valor in filas}


def _archivo(ajustes: Ajustes, archivo: Archivo, respaldo: Respaldo | None) -> tuple[Path, tuple]:
    """El archivo guardado al cargarlo; si aquí no está, el del histórico."""
    guardado = ajustes.carpeta_cargas / archivo.ruta_almacenamiento.replace("\\", "/")
    if guardado.is_file():
        return guardado, ()
    if respaldo is not None and respaldo.archivo.is_file():
        return respaldo.archivo, respaldo.correcciones
    raise NoSePuede(f"no está el archivo «{archivo.nombre_original}» ni en {ajustes.carpeta_cargas} ni en el histórico")


def _sesion(bd):
    usuario = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == "superadmin", vigente(Usuario)))
    if usuario is None:
        raise NoSePuede("no existe la cuenta «superadmin»")
    return usuario, cargar_historico._sesion_de(bd, usuario)


def _meses(bd) -> list[tuple[str, int]]:
    filas = bd.execute(
        select(Periodo.anio, Periodo.mes, Reporte.id)
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .where(Formato.codigo == FORMATO, vigente(Reporte))
        .order_by(Periodo.anio, Periodo.mes)
    ).all()
    return [(f"{anio}-{mes:02d}", reporte_id) for anio, mes, reporte_id in filas]


def revisar_mes(bd, ajustes: Ajustes, periodo: str, reporte_id: int, respaldo: Respaldo | None):
    """Qué hay que hacer con un mes, sin escribir: (None, motivo) si nada; si no,
    (plan, detalle), con el plan que necesita `rectificar_mes`."""
    reporte = bd.get(Reporte, reporte_id)
    carga = carga_aceptada_vigente(bd, reporte)
    if carga is None:
        return None, "sin archivo aceptado"
    if _version(carga.version_bot) >= VERSION_CORREGIDA:
        return None, f"leído con el bot {carga.version_bot}: ya en horas"
    guardadas = _horas_guardadas(bd, reporte_id)
    if not guardadas:
        return None, "sin horas guardadas"
    archivo = bd.get(Archivo, carga.archivo_id)
    ruta, correcciones = _archivo(ajustes, archivo, respaldo)
    contenido = cargar_historico.corregir_celdas(ruta.read_bytes(), list(correcciones))
    informe = bot.validar_archivo(
        base_url=ajustes.bot_validador_url, segundos=max(ajustes.bot_validador_segundos, 60.0),
        area=AREA, periodo=periodo, nombre=archivo.nombre_original, contenido=contenido,
    )
    if informe.get("bloqueo"):
        raise NoSePuede(f"el bot no acepta hoy el archivo: {informe['bloqueo'].get('titulo')}")
    nuevas = _horas_del_informe(informe)
    distintas = {k: (v, nuevas.get(k)) for k, v in guardadas.items() if nuevas.get(k) is None or abs(nuevas[k] - v) > Decimal("0.01")}
    if not distintas:
        return None, "las horas guardadas ya coinciden con el archivo"
    ajenas = [k for k, (antes, ahora) in distintas.items() if ahora is None or abs(ahora - antes * 24) > TOLERANCIA]
    if ajenas:
        raise NoSePuede("estas horas no son las guardadas por 24, no se toca: " + ", ".join(
            f"{k} {distintas[k][0]} → {distintas[k][1]}" for k in ajenas))
    estado = bd.scalar(select(EstadoReporte.codigo).where(EstadoReporte.id == reporte.estado_reporte_id))
    ejemplo = max(distintas, key=lambda k: distintas[k][1])
    detalle = f"{len(distintas)} horas en días (p. ej. {ejemplo}: {distintas[ejemplo][0]} → {distintas[ejemplo][1]})"
    plan = {"estado": estado, "ruta": ruta, "correcciones": correcciones, "nombre": archivo.nombre_original, "carga_id": carga.id}
    return plan, detalle


def rectificar_mes(bd, ajustes: Ajustes, periodo: str, reporte_id: int, plan: dict) -> str:
    """Rectifica, vuelve a leer y reenvía. No confirma: si el mes no queda remitido
    (o en borrador, si así estaba), lanza, y quien llama deshace."""
    usuario, sesion = _sesion(bd)
    fijar_auditoria(bd, usuario.id, None)
    reporte = bd.get(Reporte, reporte_id)
    justificaciones = {
        h.clave_hallazgo: h.justificacion
        for h in bd.scalars(select(Hallazgo).where(Hallazgo.carga_id == plan["carga_id"], vigente(Hallazgo), Hallazgo.justificacion.is_not(None)))
    }
    enviar = plan["estado"] == estados.REMITIDO
    fecha = datetime.now(ZONA).strftime("%d/%m/%Y")
    if enviar:
        servicio_transiciones.transicionar(
            bd, sesion, RelojSistema(), formato=FORMATO, periodo=periodo, accion="rectificar", comentario=MOTIVO,
        )
    elif plan["estado"] != estados.BORRADOR:
        raise NoSePuede(f"está en «{plan['estado']}»")
    anterior = (reporte.observacion or "").strip()
    nota = f"{anterior + ' ' if anterior else ''}Rectificado el {fecha}: horas quirúrgicas leídas en horas (antes, en días)."
    linea = cargar_historico.cargar_mes(
        bd, ajustes, sesion, formato=FORMATO, periodo=periodo, archivo=plan["ruta"], correcciones=list(plan["correcciones"]),
        nota=nota, justificaciones=justificaciones, enviar=enviar, nombre=plan["nombre"],
    )
    final = bd.scalar(select(EstadoReporte.codigo).join(Reporte, Reporte.estado_reporte_id == EstadoReporte.id).where(Reporte.id == reporte_id))
    if final != plan["estado"]:
        raise NoSePuede(f"no se pudo dejar como estaba: {linea}")
    return ("rectificado, " if enviar else "vuelto a leer, sigue en borrador: ") + linea.split(": ", 1)[-1].rstrip(".")


def recargar(fabrica, *, respaldos: dict[str, Respaldo] | None = None, solo_revisar: bool = False) -> list[str]:
    """Una línea por mes de Centro Quirúrgico. Cada mes en su propia transacción:
    uno que falla no deshace a los demás."""
    ajustes = obtener_ajustes()
    if not ajustes.bot_validador_url:
        return ["Sin bot configurado (BOT_VALIDADOR_URL): no se puede comprobar ni volver a leer."]
    with fabrica() as bd:
        meses = _meses(bd)
    if not meses:
        return ["Sin meses de Centro Quirúrgico en la base."]
    lineas = []
    for periodo, reporte_id in meses:
        with fabrica() as bd:
            try:
                plan, detalle = revisar_mes(bd, ajustes, periodo, reporte_id, (respaldos or {}).get(periodo))
                if plan is None:
                    lineas.append(f"{periodo}: {detalle}.")
                    continue
                if solo_revisar:
                    lineas.append(f"{periodo}: se rectificaría, {detalle}.")
                    continue
                resultado = rectificar_mes(bd, ajustes, periodo, reporte_id, plan)
                bd.commit()
                lineas.append(f"{periodo}: {detalle}; {resultado}.")
            except Exception as e:  # el mes queda como estaba, y se dice por qué
                bd.rollback()
                lineas.append(f"{periodo}: no se tocó — {e}")
    return lineas


def respaldos_del_historico() -> dict[str, Respaldo]:
    """Los meses del histórico versionado de Centro Quirúrgico, con sus correcciones."""
    from app.herramientas.preparar_base import HISTORICOS  # diferido: preparar_base importa este módulo

    respaldos = {}
    for h in HISTORICOS:
        if h.formato != FORMATO or not h.carpeta.is_dir():
            continue
        periodo = h.desde
        while periodo <= h.hasta:
            try:
                archivo = cargar_historico.archivo_del_mes(h.carpeta, periodo)
            except cargar_historico.NoSePuede:
                archivo = None
            if archivo is not None:
                respaldos[periodo] = Respaldo(archivo, tuple(h.correcciones.get(periodo, [])))
            periodo = periodos.mes_siguiente(periodo)
    return respaldos


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m app.herramientas.recargar_horas_cqx", description=__doc__.split("\n\n")[0])
    parser.add_argument("--revisar", action="store_true", help="solo dice qué meses rectificaría, sin escribir")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    ajustes = obtener_ajustes()
    print(f"Base de datos: {ajustes.url_base.split('@')[-1]} · bot: {ajustes.bot_validador_url}")
    for linea in recargar(fabrica(), respaldos=respaldos_del_historico(), solo_revisar=args.revisar):
        print(linea)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
