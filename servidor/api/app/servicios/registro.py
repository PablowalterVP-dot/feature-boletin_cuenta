"""Lo que el sistema anota para vigilarse: intentos de ingreso y errores inesperados.

Nunca se anota una contraseña. Si anotar un error falla (la base puede ser
justo lo que se cayó), no se agrega un segundo error encima: queda en los logs.

Lo mismo con los intentos de ingreso: si su tabla no se puede usar, se pierde el
freno y queda en los logs, pero la gente entra. Se eligió así a propósito: un fallo
de este registro no puede dejar a todo el hospital sin sistema. Va en un SAVEPOINT
porque en PostgreSQL un error aborta la transacción, y el ingreso sigue en ella.
"""

import logging
import secrets

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

logger = logging.getLogger("hrl.registro")

MAX_FALLOS = 5
MINUTOS_DE_ESPERA = 15


def anotar_intento(bd: Session, usuario: str, direccion_ip: str | None, *, exitoso: bool) -> None:
    try:
        with bd.begin_nested():
            bd.execute(
                text("INSERT INTO auditoria.intento_ingreso (nombre_usuario, direccion_ip, exitoso) VALUES (:u, :ip, :e)"),
                {"u": usuario[:150], "ip": direccion_ip, "e": exitoso},
            )
    except SQLAlchemyError:
        logger.exception("No se pudo anotar un intento de ingreso")


def demasiados_intentos(bd: Session, usuario: str) -> bool:
    """Cinco fallos seguidos en 15 minutos frenan esa cuenta hasta que pase la espera.

    Cuentan los fallos posteriores al último ingreso correcto: quien se equivocó
    dos veces y entró no arrastra esos fallos. Es por nombre de usuario, también
    uno que no existe, para no delatar cuáles existen."""
    try:
        with bd.begin_nested():
            fallos = bd.scalar(
                text(
                    """
                    SELECT count(*) FROM auditoria.intento_ingreso i
                    WHERE i.nombre_usuario = :u AND NOT i.exitoso
                      AND i.fecha > now() - make_interval(mins => :m)
                      AND i.fecha > coalesce(
                            (SELECT max(o.fecha) FROM auditoria.intento_ingreso o WHERE o.nombre_usuario = :u AND o.exitoso),
                            '-infinity'::timestamptz)
                    """
                ),
                {"u": usuario[:150], "m": MINUTOS_DE_ESPERA},
            )
    except SQLAlchemyError:
        logger.exception("No se pudieron leer los intentos de ingreso: el freno queda sin efecto")
        return False
    return (fallos or 0) >= MAX_FALLOS


def nueva_referencia() -> str:
    return secrets.token_hex(4).upper()


def anotar_error(bd: Session, referencia: str, metodo: str, ruta: str, error: BaseException) -> None:
    try:
        bd.rollback()
        bd.execute(
            text(
                """
                INSERT INTO auditoria.error_sistema (referencia, metodo, ruta, tipo, mensaje)
                VALUES (:r, :m, :p, :t, :x)
                """
            ),
            {"r": referencia, "m": metodo[:10], "p": ruta[:300], "t": type(error).__name__[:150], "x": str(error)[:2000]},
        )
        bd.commit()
    except Exception:  # noqa: BLE001 - registrar un error nunca debe causar otro
        logger.exception("No se pudo anotar el error %s en la base", referencia)
        try:
            bd.rollback()
        except Exception:  # noqa: BLE001
            logger.debug("Tampoco se pudo deshacer la transacción", exc_info=True)


def vigilancia(bd: Session) -> dict:
    """Lo que muestra «Funcionamiento». Si la migración 0010 aún no llegó a esta
    base, no se cae la pantalla: dice que no hay registro."""
    try:
        fallidos = bd.scalar(text("SELECT count(*) FROM auditoria.intento_ingreso WHERE NOT exitoso AND fecha > now() - interval '24 hours'")) or 0
        frenadas = bd.scalar(
            text(
                """
                SELECT count(*) FROM (
                    SELECT nombre_usuario FROM auditoria.intento_ingreso
                    WHERE NOT exitoso AND fecha > now() - make_interval(mins => :m)
                    GROUP BY nombre_usuario HAVING count(*) >= :n
                ) f
                """
            ),
            {"m": MINUTOS_DE_ESPERA, "n": MAX_FALLOS},
        ) or 0
        errores_7 = bd.scalar(text("SELECT count(*) FROM auditoria.error_sistema WHERE fecha > now() - interval '7 days'")) or 0
        ultimos = bd.execute(
            text("SELECT referencia, metodo, ruta, tipo, fecha FROM auditoria.error_sistema ORDER BY fecha DESC LIMIT 5")
        ).all()
    except Exception:  # noqa: BLE001 - una base sin migrar no debe tumbar el panel que lo avisa
        bd.rollback()
        logger.warning("Sin registro de vigilancia en esta base", exc_info=True)
        return {"disponible": False, "ingresos_fallidos_24h": 0, "cuentas_frenadas": 0, "errores_7_dias": 0, "ultimos_errores": []}
    return {
        "disponible": True,
        "ingresos_fallidos_24h": fallidos,
        "cuentas_frenadas": frenadas,
        "errores_7_dias": errores_7,
        "ultimos_errores": [
            {"referencia": r, "metodo": m, "ruta": p, "tipo": t, "fecha": f} for r, m, p, t, f in ultimos
        ],
    }
