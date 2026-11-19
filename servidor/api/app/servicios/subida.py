"""Subir un archivo de datos desde el tablero: reconocer qué es, decir qué
pasaría y, si se confirma, cargarlo.

Usa las mismas cargas que los comandos (`servicios/fuentes.py`), con sus mismas
reglas: no duplica, reemplaza el mes entero y no pisa a ciegas. La revisión
corre la carga de verdad dentro de un punto de guardado y la deshace: lo que
dice que pasaría es lo que pasaría, no una estimación aparte.
"""

from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.fuente import FUENTE_HIS, FUENTE_SINADEF, FUENTE_VERIFICADOS
from app.datos.modelos import Ficha, FichaFuente, Fuente
from app.dominio.desempeno import tablero as reglas
from app.dominio.fuentes import CargaRechazada
from app.servicios import fuentes

# Lo que el sistema sabe cargar. Las demás fuentes del catálogo esperan su carga.
CARGABLES = (FUENTE_HIS, FUENTE_SINADEF, FUENTE_VERIFICADOS)

# Una trama mensual del HIS pesa unos 15 MB; el consolidado de varios años (700
# MB) no se sube por el navegador: se carga una vez por terminal.
TAMANO_MAXIMO = 60 * 1024 * 1024

_ESTADO = {fuentes.NUEVO: "nuevo", fuentes.REEMPLAZADO: "reemplaza", fuentes.YA_CARGADO: "ya_cargado"}


def fuente_del_archivo(ruta: Path) -> str:
    """Qué fuente es, por su contenido: la trama del HIS por sus columnas, las
    verificadas por las suyas, SINADEF por ser el .xls de su reporte."""
    extension = ruta.suffix.lower()
    if extension == ".xls":
        return FUENTE_SINADEF
    if extension == ".csv":
        with open(ruta, encoding="utf-8-sig", errors="replace") as archivo:
            cabecera = {c.strip().strip('"').lower() for c in archivo.readline().split(",")}
        if {"id_cita", "fecha_atencion", "codigo_item"} <= cabecera:
            return FUENTE_HIS
        if {"numero_documento", "fecha_defuncion"} <= cabecera:
            return FUENTE_VERIFICADOS
        raise CargaRechazada("No se reconoce el archivo: no es la trama nominal del HIS ni el CSV de defunciones verificadas.")
    if extension == ".xlsx":
        raise CargaRechazada("Los .xlsx (egresos, camas) todavía no se cargan en el sistema. SINADEF se sube como .xls, tal como se descarga.")
    raise CargaRechazada(f"El sistema carga la trama del HIS (.csv) y el reporte de SINADEF (.xls); este archivo es «{extension or 'sin extensión'}».")


@dataclass(frozen=True)
class MesDeLaRevision:
    periodo: str
    filas: int
    estado: str  # nuevo · reemplaza · ya_cargado
    filas_anteriores: int | None
    variacion: float | None  # frente al mes anterior, solo si es sospechosa


@dataclass
class Revision:
    """Qué pasa (o pasaría) con el archivo."""

    fuente: str
    fuente_nombre: str
    archivo: str
    tamano: int
    huella: str
    filas_archivo: int
    meses: list[MesDeLaRevision] = field(default_factory=list)
    filas_fuera_de_rango: int = 0
    filas_sin_fecha: int = 0
    # Solo las defunciones verificadas: no van por meses.
    verificadas_nuevas: int | None = None
    verificadas_actualizadas: int | None = None
    errores: list[str] = field(default_factory=list)  # impiden cargar
    avisos: list[str] = field(default_factory=list)  # se puede cargar, confirmándolo
    requiere_forzar: bool = False
    fichas: list[int] = field(default_factory=list)
    cargado: bool = False

    @property
    def nada_nuevo(self) -> bool:
        if self.verificadas_nuevas is not None:
            return not (self.verificadas_nuevas or self.verificadas_actualizadas)
        return bool(self.meses) and all(m.estado == "ya_cargado" for m in self.meses)

    @property
    def puede_cargar(self) -> bool:
        return not self.errores and not self.nada_nuevo


def _cargar(bd: Session, codigo: str, ruta: Path, *, forzar: bool, usuario_id: int | None):
    if codigo == FUENTE_HIS:
        return fuentes.cargar_his(bd, ruta, usuario_id=usuario_id, forzar=forzar)
    if codigo == FUENTE_SINADEF:
        return fuentes.cargar_sinadef(bd, ruta, usuario_id=usuario_id, forzar=forzar)
    return fuentes.cargar_verificados(bd, ruta, usuario_id=usuario_id)


def _fichas_de(bd: Session, codigo: str) -> list[int]:
    return sorted(
        bd.scalars(
            select(Ficha.numero)
            .join(FichaFuente, FichaFuente.ficha_id == Ficha.id)
            .join(Fuente, Fuente.id == FichaFuente.fuente_id)
            .where(Fuente.codigo == codigo, vigente(FichaFuente), vigente(Ficha))
        )
    )


def _anterior(periodo: str) -> str:
    anio, mes = int(periodo[:4]), int(periodo[5:])
    return f"{anio - 1:04d}-12" if mes == 1 else f"{anio:04d}-{mes - 1:02d}"


def _revision(bd: Session, codigo: str, ruta: Path, resultado, *, forzar: bool, vigentes_antes: dict) -> Revision:
    huella, tamano = fuentes.huella_de(ruta)
    fuente = bd.scalar(select(Fuente).where(Fuente.codigo == codigo, vigente(Fuente)))
    r = Revision(codigo, fuente.nombre, ruta.name, tamano, huella, resultado.filas_archivo, fichas=_fichas_de(bd, codigo), requiere_forzar=forzar)
    if isinstance(resultado, fuentes.ResultadoVerificados):
        r.verificadas_nuevas, r.verificadas_actualizadas = resultado.nuevas, resultado.actualizadas
        return r
    r.filas_fuera_de_rango, r.filas_sin_fecha = resultado.filas_fuera_de_rango, resultado.filas_sin_fecha
    for m in resultado.meses:
        variacion = None
        # Solo el HIS: los certificados de un mes varían mucho sin que el reporte esté mal.
        if codigo == FUENTE_HIS and m.estado != fuentes.YA_CARGADO:
            previo = vigentes_antes.get(_anterior(m.periodo))
            variacion = reglas.aviso_de_filas(m.filas, previo[0].filas if previo else None)
            if variacion is not None:
                r.avisos.append(f"{m.periodo}: {m.filas} filas, {variacion:+.0%} frente al mes anterior. Una diferencia grande suele indicar un archivo incompleto o de otro mes.")
        r.meses.append(MesDeLaRevision(m.periodo, m.filas, _ESTADO[m.estado], m.filas_anteriores, variacion))
    if r.filas_sin_fecha:
        r.avisos.append(f"{r.filas_sin_fecha} filas no tienen una fecha de atención legible: no se cargan.")
    return r


def revisar(bd: Session, ruta: Path, *, usuario_id: int | None) -> Revision:
    """Qué pasaría si se cargara el archivo. No deja nada escrito."""
    codigo = fuente_del_archivo(ruta)
    fuente = bd.scalar(select(Fuente).where(Fuente.codigo == codigo, vigente(Fuente)))
    vigentes = fuentes.meses_vigentes(bd, fuente.id)
    forzar = False
    try:
        with bd.begin_nested() as punto:
            resultado = _cargar(bd, codigo, ruta, forzar=False, usuario_id=usuario_id)
            punto.rollback()
    except CargaRechazada as rechazo:
        # ¿Lo rechaza solo por no pisar a ciegas? Entonces se puede cargar
        # confirmándolo; si no, es un error del archivo.
        try:
            with bd.begin_nested() as punto:
                resultado = _cargar(bd, codigo, ruta, forzar=True, usuario_id=usuario_id)
                punto.rollback()
            forzar = True
        except CargaRechazada as error:
            huella, tamano = fuentes.huella_de(ruta)
            return Revision(codigo, fuente.nombre, ruta.name, tamano, huella, 0, errores=list(error.motivos), fichas=_fichas_de(bd, codigo))
        r = _revision(bd, codigo, ruta, resultado, forzar=forzar, vigentes_antes=vigentes)
        r.avisos = [m for m in rechazo.motivos if m != fuentes.NO_SE_CARGO] + r.avisos
        return r
    return _revision(bd, codigo, ruta, resultado, forzar=forzar, vigentes_antes=vigentes)


def cargar(bd: Session, ruta: Path, *, usuario_id: int | None, forzar: bool = False) -> Revision:
    """Carga el archivo. Si la revisión pedía confirmación, hace falta `forzar`.
    No confirma la transacción: quien llama lo hace."""
    codigo = fuente_del_archivo(ruta)
    fuente = bd.scalar(select(Fuente).where(Fuente.codigo == codigo, vigente(Fuente)))
    vigentes = fuentes.meses_vigentes(bd, fuente.id)
    resultado = _cargar(bd, codigo, ruta, forzar=forzar, usuario_id=usuario_id)
    r = _revision(bd, codigo, ruta, resultado, forzar=forzar, vigentes_antes=vigentes)
    r.cargado = not r.nada_nuevo
    return r
