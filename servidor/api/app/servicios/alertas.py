"""Alertas de un área real: hoy, solo «semana con datos faltantes», sobre
el periodo vigente de Nutrición (`dominio/alertas.py` explica por qué).
Las nueve áreas simuladas siguen con `avisos.js` del frontend.

No se guardan: se calculan en cada consulta, con la misma visibilidad que
el detalle del reporte (`servicios/acceso.py::reporte_legible`)."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.datos import parametros as repo_parametros
from app.datos import valores as repo_valores
from app.dominio import alertas as reglas
from app.dominio import periodos
from app.dominio.reloj import Reloj
from app.dominio.reloj import hoy as hoy_de
from app.dominio.sesion import Sesion
from app.servicios.acceso import reporte_legible

# Estados en los que el área todavía está llenando el periodo. Enviado en
# adelante, el bot ya exige todas las casillas para aceptar la carga: no
# puede haber un hueco que esta alerta tenga sentido en señalar.
_ESTADOS_EN_LLENADO = ("no_iniciado", "borrador")


@dataclass(frozen=True)
class Alerta:
    clave: str
    nivel: str
    titulo: str
    cuerpo: str


def _alerta_de_semana(s: reglas.AlertaSemanaIncompleta) -> Alerta:
    dias = ", ".join(str(d) for d in s.dias_sin_dato)
    plural = len(s.dias_sin_dato) != 1
    return Alerta(
        clave=f"semana_incompleta|{s.primer_dia}-{s.ultimo_dia}",
        nivel="aviso",
        titulo=f"Semana del {s.primer_dia} al {s.ultimo_dia}: sin ningún dato en {len(s.dias_sin_dato)} día{'s' if plural else ''}.",
        cuerpo=f"No hay ninguna casilla registrada el día{'s' if plural else ''} {dias} de este mes.",
    )


def alertas_de(bd: Session, sesion: Sesion, reloj: Reloj, *, formato: str, periodo: str) -> list[Alerta]:
    """Vacío fuera del periodo vigente, si el reporte ya salió del área, o si
    todavía no se subió nada (para ese caso está la alerta de plazo, no esta)."""
    legible = reporte_legible(bd, sesion, formato=formato, periodo=periodo)
    hoy = hoy_de(reloj)

    if periodo != periodos.periodo_vigente(hoy) or legible.estado not in _ESTADOS_EN_LLENADO or legible.reporte is None:
        return []
    # «Semana con datos faltantes» mira los días: un formato mensual (Laboratorio)
    # no tiene días, y sin esto toda semana del mes saldría como faltante.
    if legible.formato.granularidad != "diaria":
        return []

    tiene_dato_el_dia: dict[int, bool] = {}
    for fila in repo_valores.valores_de_reporte(bd, legible.reporte.id):
        if fila.dia is not None and (fila.valor is not None or fila.texto_original is not None):
            tiene_dato_el_dia[fila.dia] = True

    parametros = repo_parametros.valores(bd, reglas.PREFIJO)
    dias_minimos = reglas.dias_minimos_para_alertar(parametros, legible.unidad.codigo)

    semanas = reglas.semanas_con_datos_faltantes(tiene_dato_el_dia, periodo, hoy, dias_minimos)
    return [_alerta_de_semana(s) for s in semanas]
