"""Errores de las operaciones sobre reportes que no son una regla del dominio puro.

Comparten la base y el `codigo` estable de `dominio.transiciones.ErrorDeTransicion`, así
que la API los trata igual y la interfaz los distingue por su código.
"""

from app.dominio.transiciones import ErrorDeTransicion


class NoEncontrado(ErrorDeTransicion):
    """El formato o el periodo no existen (`datos["que"]` dice cuál)."""

    codigo = "no_encontrado"


class SinPermiso(ErrorDeTransicion):
    """La cuenta no tiene el permiso sobre la unidad del reporte."""

    codigo = "sin_permiso"


class NoImplementado(ErrorDeTransicion):
    """Algo que el frontend ya puede llamar pero todavía no hace nada."""

    codigo = "no_implementado"


class BotNoDisponible(ErrorDeTransicion):
    """No se pudo conectar con el bot validador, tardó más de lo tolerado, o
    respondió algo que no se pudo interpretar. No es un error de quien sube el
    archivo: es el servicio externo el que falló."""

    codigo = "bot_no_disponible"
