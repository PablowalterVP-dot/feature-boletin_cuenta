"""Política de contraseñas.

El equipo no ha definido una; esta es la mínima razonable y está en un solo
lugar para cambiarla. Devuelve lo que falta en lugar de lanzar, para que la
interfaz pueda mostrarlo todo junto.
"""

LARGO_MINIMO = 10
LARGO_MAXIMO = 200  # Argon2 es caro a propósito: una «contraseña» de megabytes gastaría el servidor.

# El marcador con el que 04_semilla.sql deja al superadmin. No es un hash ni una clave.
CLAVE_POR_ASIGNAR = "POR_ASIGNAR"


def problemas_de_clave(clave: str, usuario: str, clave_actual: str | None = None) -> list[str]:
    problemas = []
    if len(clave) < LARGO_MINIMO:
        problemas.append(f"Debe tener al menos {LARGO_MINIMO} caracteres.")
    if len(clave) > LARGO_MAXIMO:
        problemas.append(f"No puede pasar de {LARGO_MAXIMO} caracteres.")
    if usuario and usuario.lower() in clave.lower():
        problemas.append("No puede contener su nombre de usuario.")
    if clave.strip() != clave:
        problemas.append("No puede empezar ni terminar con espacios.")
    if clave_actual is not None and clave == clave_actual:
        problemas.append("Debe ser distinta de la actual.")
    if clave == CLAVE_POR_ASIGNAR:
        problemas.append("Esa es la marca de una cuenta sin contraseña, no una contraseña.")
    return problemas
