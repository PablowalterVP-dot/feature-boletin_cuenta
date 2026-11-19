"""Configuración del sistema que se cambia desde el panel de administración.

Todo vive en `organizacion.parametro` (clave → valor), igual que los plazos
(`dominio/plazos.py`) y las alertas (`dominio/alertas.py`): agregar una fila es
dato, no altera el esquema de Alejandro, y cada cambio queda en su bitácora
(`auditoria.registro_cambio`) con quién y cuándo, porque la tabla tiene
disparador.

Aquí solo hay reglas: qué claves existen, qué valor toman si no se configuraron
y qué valor es aceptable. Leer y escribir es de `servicios/admin.py`.
"""

import re
from dataclasses import dataclass
from datetime import date

# ------------------------------------------------------------ personalización

PREFIJO_SISTEMA = "sistema."

NOMBRE_SISTEMA = "sistema.nombre"
MENSAJE_INGRESO = "sistema.mensaje_ingreso"
AVISO_TEXTO = "sistema.aviso.texto"
AVISO_TONO = "sistema.aviso.tono"
AVISO_HASTA = "sistema.aviso.hasta"

NOMBRE_POR_OMISION = "Sistema de Reporte Estadístico"
TONOS_DE_AVISO = ("info", "warning")
LARGO_MAXIMO_TEXTO = 600
LARGO_MAXIMO_NOMBRE = 80

# Valores por omisión de las preferencias de lectura que el kit aplica a quien
# todavía no eligió las suyas. Mismos valores que acepta `usePreferences` del kit.
PREF_CONTRASTE = "sistema.preferencias.contraste"
PREF_TAMANO = "sistema.preferencias.tamano_texto"
PREF_ENLACES = "sistema.preferencias.subrayar_enlaces"
CONTRASTES = ("sistema", "estandar", "alto")
TAMANOS = ("100", "115", "130", "150")


class ValorInvalido(ValueError):
    """Un valor que no se puede guardar, con un mensaje para la persona."""


@dataclass(frozen=True)
class Personalizacion:
    nombre_sistema: str
    mensaje_ingreso: str | None
    aviso_texto: str | None
    aviso_tono: str
    aviso_hasta: date | None
    pref_contraste: str | None
    pref_tamano_texto: str | None
    pref_subrayar_enlaces: bool | None

    def aviso_vigente(self, hoy: date) -> bool:
        """Un aviso general se muestra mientras tenga texto y no haya pasado su fecha."""
        return bool(self.aviso_texto) and (self.aviso_hasta is None or hoy <= self.aviso_hasta)


def _texto(valor: str | None) -> str | None:
    if valor is None:
        return None
    limpio = valor.strip()
    return limpio or None


def _fecha(valor: str | None) -> date | None:
    try:
        return date.fromisoformat(valor) if valor else None
    except ValueError:
        return None


def personalizacion_de(parametros: dict[str, str]) -> Personalizacion:
    """`parametros` es `datos.parametros.valores(bd, PREFIJO_SISTEMA)`. Un valor
    ilegible cae a su omisión: la pantalla de ingreso no se puede romper por un
    parámetro mal escrito."""
    tono = parametros.get(AVISO_TONO)
    contraste = parametros.get(PREF_CONTRASTE)
    tamano = parametros.get(PREF_TAMANO)
    enlaces = parametros.get(PREF_ENLACES)
    return Personalizacion(
        nombre_sistema=_texto(parametros.get(NOMBRE_SISTEMA)) or NOMBRE_POR_OMISION,
        mensaje_ingreso=_texto(parametros.get(MENSAJE_INGRESO)),
        aviso_texto=_texto(parametros.get(AVISO_TEXTO)),
        aviso_tono=tono if tono in TONOS_DE_AVISO else "info",
        aviso_hasta=_fecha(parametros.get(AVISO_HASTA)),
        pref_contraste=contraste if contraste in CONTRASTES else None,
        pref_tamano_texto=tamano if tamano in TAMANOS else None,
        pref_subrayar_enlaces=None if enlaces not in ("true", "false") else enlaces == "true",
    )


def filas_de_personalizacion(p: Personalizacion) -> dict[str, str | None]:
    """Lo que se escribe: `None` borra el parámetro (vuelve a su omisión).
    Valida antes de devolver: nada a medias."""
    nombre = _texto(p.nombre_sistema)
    if nombre is None:
        raise ValorInvalido("El nombre del sistema no puede quedar vacío.")
    if len(nombre) > LARGO_MAXIMO_NOMBRE:
        raise ValorInvalido(f"El nombre del sistema no puede pasar de {LARGO_MAXIMO_NOMBRE} caracteres.")
    for etiqueta, texto in (("El mensaje del ingreso", p.mensaje_ingreso), ("El aviso general", p.aviso_texto)):
        if texto and len(texto) > LARGO_MAXIMO_TEXTO:
            raise ValorInvalido(f"{etiqueta} no puede pasar de {LARGO_MAXIMO_TEXTO} caracteres.")
    if p.aviso_tono not in TONOS_DE_AVISO:
        raise ValorInvalido("El tono del aviso es «info» o «warning».")
    if p.pref_contraste is not None and p.pref_contraste not in CONTRASTES:
        raise ValorInvalido(f"El contraste es uno de: {', '.join(CONTRASTES)}.")
    if p.pref_tamano_texto is not None and p.pref_tamano_texto not in TAMANOS:
        raise ValorInvalido(f"El tamaño del texto es uno de: {', '.join(TAMANOS)}.")
    return {
        NOMBRE_SISTEMA: None if nombre == NOMBRE_POR_OMISION else nombre,
        MENSAJE_INGRESO: _texto(p.mensaje_ingreso),
        AVISO_TEXTO: _texto(p.aviso_texto),
        AVISO_TONO: p.aviso_tono if _texto(p.aviso_texto) else None,
        AVISO_HASTA: p.aviso_hasta.isoformat() if p.aviso_hasta and _texto(p.aviso_texto) else None,
        PREF_CONTRASTE: p.pref_contraste,
        PREF_TAMANO: p.pref_tamano_texto,
        PREF_ENLACES: None if p.pref_subrayar_enlaces is None else ("true" if p.pref_subrayar_enlaces else "false"),
    }


# -------------------------------------------------------------- áreas en flujo

PREFIJO_FLUJO = "flujo."


def clave_flujo(unidad: str) -> str:
    """`flujo.nutricion`: si un área con su formato instalado reporta ya por el
    sistema. Sin la fila, sí: instalar el formato basta. `false` la saca del
    flujo sin desinstalar nada (para pausarla mientras se corrige su plantilla)."""
    return f"{PREFIJO_FLUJO}{unidad}"


def esta_en_flujo(parametros: dict[str, str], unidad: str, *, tiene_formato_activo: bool) -> bool:
    """Un área reporta por el sistema si tiene un formato con versión activa y
    nadie la pausó. Sin formato no hay cómo leer su Excel: no basta con querer."""
    return tiene_formato_activo and parametros.get(clave_flujo(unidad)) != "false"


# ---------------------------------------------------------------- soporte

PREFIJO_SOPORTE = "soporte."


def clave_ver_como(admin_id: int) -> str:
    """Una fila por administrador, que se reescribe cada vez que entra a ver como
    otra cuenta. La bitácora de la tabla guarda cada versión: quién miró a quién
    y cuándo, aunque la fila solo tenga la última."""
    return f"{PREFIJO_SOPORTE}ver_como.{admin_id}"


LARGO_MINIMO_JUSTIFICACION = 15


def justificacion_valida(texto: str | None) -> str:
    limpio = (texto or "").strip()
    if len(limpio) < LARGO_MINIMO_JUSTIFICACION:
        raise ValorInvalido(f"La justificación debe explicar el motivo (al menos {LARGO_MINIMO_JUSTIFICACION} caracteres).")
    return limpio


# ---------------------------------------------------------------- cuentas

_PATRON_USUARIO = re.compile(r"^[a-z0-9][a-z0-9._-]{2,59}$")
_PATRON_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def usuario_valido(nombre: str) -> str:
    limpio = (nombre or "").strip().lower()
    if not _PATRON_USUARIO.match(limpio):
        raise ValorInvalido("El usuario lleva de 3 a 60 caracteres: minúsculas, números, punto, guion o guion bajo, empezando por letra o número.")
    return limpio


def correo_valido(correo: str | None) -> str | None:
    limpio = _texto(correo)
    if limpio is None:
        return None
    if len(limpio) > 150 or not _PATRON_CORREO.match(limpio):
        raise ValorInvalido("El correo no tiene la forma nombre@dominio.")
    return limpio.lower()


def nombre_valido(valor: str | None, etiqueta: str, largo: int = 100) -> str:
    limpio = _texto(valor)
    if limpio is None:
        raise ValorInvalido(f"{etiqueta} no puede quedar vacío.")
    if len(limpio) > largo:
        raise ValorInvalido(f"{etiqueta} no puede pasar de {largo} caracteres.")
    return limpio


def telefono_valido(valor: str | None) -> str | None:
    """Número de contacto: dígitos, con espacios o guiones para leerlo y un
    «+» inicial si trae prefijo de país. Entre 6 y 15 dígitos (un anexo corto
    y el máximo internacional). Los espacios repetidos se juntan. Vacío es
    «sin teléfono», no un error."""
    limpio = _texto(valor)
    if limpio is None:
        return None
    limpio = " ".join(limpio.split())
    if len(limpio) > 20:
        raise ValorInvalido("El teléfono no puede pasar de 20 caracteres.")
    cuerpo = limpio[1:] if limpio.startswith("+") else limpio
    if any(c not in "0123456789 -" for c in cuerpo):
        raise ValorInvalido("El teléfono solo lleva dígitos, espacios, guiones y un «+» al inicio.")
    digitos = sum(c.isdigit() for c in cuerpo)
    if not 6 <= digitos <= 15:
        raise ValorInvalido("El teléfono debe tener entre 6 y 15 dígitos.")
    return limpio


def opcional_valido(valor: str | None, etiqueta: str, largo: int) -> str | None:
    limpio = _texto(valor)
    if limpio is not None and len(limpio) > largo:
        raise ValorInvalido(f"{etiqueta} no puede pasar de {largo} caracteres.")
    return limpio
