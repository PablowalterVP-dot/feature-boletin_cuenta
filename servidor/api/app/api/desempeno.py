"""El tablero de indicadores de desempeño.

    GET  /api/desempeno/resumen                         las 34 fichas con su último resultado, y el estado general
    GET  /api/desempeno/fichas/{numero}                 una ficha: su ficha técnica y su resultado mes a mes
    GET  /api/desempeno/fichas/{numero}/casos           los casos que todavía pueden sumar, con los datos del paciente
    PUT  /api/desempeno/fichas/{numero}/casos/{id}      el seguimiento de un caso                         (cargar)
    GET  /api/desempeno/fuentes                         cada fuente: qué fichas alimenta y qué meses tiene (cargar)
    PUT  /api/desempeno/fuentes/{codigo}                a qué fichas alimenta y quién la entrega           (cargar)
    GET  /api/desempeno/cargas                          el historial de cargas del año                     (cargar)
    POST /api/desempeno/cargas/revision                 qué pasaría si se carga el archivo; no guarda nada (cargar)
    POST /api/desempeno/cargas                          cargar el archivo y recalcular                     (cargar)
    GET  /api/desempeno/referencias                     lo publicado por MINSA, frente al cálculo          (cargar)
    PUT  /api/desempeno/referencias                     registrar lo publicado por MINSA y recalcular     (cargar)
    DELETE /api/desempeno/fuentes/{codigo}/meses/{mes}  retirar la carga de un mes y recalcular            (cargar)
    GET  /api/desempeno/verificadas                     las defunciones verificadas a mano                 (cargar)
    POST /api/desempeno/verificadas                     agregar una y recalcular                           (cargar)
    PUT  /api/desempeno/verificadas/{id}                corregirla y recalcular                            (cargar)
    DELETE /api/desempeno/verificadas/{id}              retirarla y recalcular                             (cargar)

Todo exige `desempeno.ver` **global** (Estadística y el superadministrador); lo
marcado «cargar», además `desempeno.cargar` (hoy, solo el superadministrador).
`anio` es opcional en todas: por omisión, el último con datos.

Las respuestas traen cifras, fechas y estados, no frases: la interfaz arma sus
textos con ellas, para que digan siempre lo que hay en la base en ese momento.
"""

import tempfile
from collections.abc import Callable
from datetime import date, datetime
from pathlib import Path as Ruta
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Query, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.dependencias import bd_auditada, obtener_reloj, sesion_actual
from app.api.errores import cuerpo_de_error
from app.datos.sesion import obtener_sesion_bd
from app.dominio import permisos
from app.dominio.fuentes import CargaRechazada
from app.dominio.reloj import Reloj
from app.dominio.reloj import hoy as hoy_de
from app.dominio.sesion import Sesion
from app.servicios import desempeno as calculo
from app.servicios import subida
from app.servicios import tablero as servicio
from app.servicios.errores import NoEncontrado

router = APIRouter(prefix="/desempeno", tags=["indicadores de desempeño"])


def _exigir(permiso: str, mensaje: str) -> Callable[..., Sesion]:
    def dependencia(sesion: Sesion = Depends(sesion_actual)) -> Sesion:
        # Global: el módulo mira todo el hospital, no una unidad.
        if not sesion.puede(permiso):
            raise HTTPException(status.HTTP_403_FORBIDDEN, mensaje)
        return sesion

    return dependencia


ver = _exigir(permisos.DESEMPENO_VER, "Su cuenta no tiene acceso a los indicadores de desempeño.")


def ver_monitoreo(sesion: Sesion = Depends(sesion_actual)) -> Sesion:
    """El panel de monitoreo: también Dirección, que no lleva `desempeno.ver`. Solo
    para el resumen y la ficha: la lista de pacientes sigue exigiendo el permiso."""
    if not sesion.ve_monitoreo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Su cuenta no tiene acceso a Monitoreo Indicadores.")
    return sesion


cargar = _exigir(permisos.DESEMPENO_CARGAR, "Solo el superadministrador carga datos y cambia la configuración de los indicadores.")


def _hacer(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except servicio.ValorInvalido as e:
        raise HTTPException(422, str(e)) from e
    except NoEncontrado as e:
        raise HTTPException(404, str(e)) from e


def _anio(bd: Session, anio: int | None, reloj: Reloj) -> int:
    if anio is not None:
        return anio
    disponibles = servicio.anios_disponibles(bd)
    return disponibles[-1] if disponibles else hoy_de(reloj).year


_ANIO = Query(default=None, ge=2000, le=2100, description="Por omisión, el último año con datos.")


class _Modelo(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ======================================================================= modelos


class FuenteDeFicha(_Modelo):
    codigo: str
    nombre: str
    periodicidad: str
    cargable: bool = Field(description="El sistema ya sabe cargarla.")
    area_responsable: str | None


class Ficha(_Modelo):
    numero: int
    clave: str
    nombre: str
    nombre_corto: str | None
    dimension: str | None = Field(description="Código de su dimensión (ver `dimensiones`).")
    aplica: bool
    motivo_no_aplica: str | None
    tiene_calculo: bool = Field(description="El sistema tiene las reglas de esta ficha.")
    datos: str = Field(description="completo · parcial · sin_fuente · no_aplica")
    faltan: list[str] = Field(description="Fuentes que todavía no se pueden cargar: mientras falte una, la ficha no calcula.")
    fuentes: list[FuenteDeFicha]


class Cifra(_Modelo):
    numerador: int
    denominador: int
    porcentaje: float | None = Field(description="Fracción entre 0 y 1. Nula sin denominador: no es 0 %.")


class MinsaDelMes(_Modelo):
    numerador: int
    denominador: int
    coincide: bool
    fecha_corte: date | None
    documento: str | None
    observacion: str | None


class MesDeFicha(_Modelo):
    mes: int
    numerador: int
    denominador: int
    porcentaje: float | None
    acumulado: Cifra
    a_tiempo: int
    por_corregir: int = Field(description="Tratados, pero su registro no cumple la regla y no suman.")
    plazo_vigente: int = Field(description="Sin tratamiento y con el plazo aún vigente hoy.")
    esperando_datos: int = Field(description="Sin tratamiento y con el plazo pasado, pero los datos cargados no llegan a su vencimiento: aún no se sabe.")
    sin_tratamiento: int = Field(description="Sin tratamiento y con el plazo vencido, con datos que lo cubren.")
    por_gestionar: int = Field(description="Casos del mes que todavía pueden sumar.")
    estado: str = Field(description="oficial (con el corte de un reporte de MINSA) · consolidado · por_cerrar (faltan datos posteriores) · preliminar")
    falta_hasta: date | None = Field(description="Hasta qué día hacen falta datos para cerrar el mes. Nula si ya los hay.")
    apertura_his: date
    cierre_his: date
    minsa: MinsaDelMes | None


class PorGestionar(_Modelo):
    total: int
    vencen_pronto: int = Field(description="Con el plazo vigente y 7 días o menos para vencer.")
    sin_revisar: int
    en_curso: int
    por_confirmar: int = Field(description="Marcados como tratados o corregidos: los confirma la próxima carga del HIS.")
    no_corresponde: int


class CategoriaDelMes(_Modelo):
    mes: int
    numerador: int
    denominador: int


class PorCategoria(_Modelo):
    categoria: str
    nombre: str
    numerador: int
    denominador: int
    meses: list[CategoriaDelMes] = Field(description="El mismo conteo mes por mes; solo los meses con casos de ese tipo.")


class Resultado(_Modelo):
    corrida_id: int
    calculado_el: datetime
    version: str
    fecha_corte: date | None = Field(description="Corte del reporte de MINSA que fija los meses que cubrió.")
    mes_con_corte: int = Field(description="Último mes calculado con ese corte; 0 si ninguno.")
    fecha_fin_observacion: date = Field(description="Hasta qué día había datos al calcular.")
    datos_hasta: date | None = Field(description="Hasta qué día hay datos seguidos desde enero en todas las fuentes mensuales de la ficha.")
    meta: float | None
    meses: list[MesDeFicha]
    consolidado_hasta: int = Field(description="Último mes, seguido desde enero, que ya no va a cambiar. 0 si ninguno.")
    logro: Cifra | None = Field(description="Acumulado hasta el último mes consolidado.")
    cumplimiento: float | None = Field(description="Logro ÷ meta.")
    diferencia: float | None = Field(description="Logro − meta, en fracción (−0.627 son −62,7 puntos).")
    cumple_meta: bool | None
    preliminar: Cifra | None = Field(description="Acumulado con los meses preliminares, si los hay.")
    serie: list[float | None] = Field(description="Acumulado de cada mes consolidado: la tendencia.")
    por_gestionar: PorGestionar
    proximo_cierre: date | None = Field(description="Hasta cuándo pueden sumar los casos por gestionar.")
    meses_con_minsa: int
    coinciden_con_minsa: int
    excluidos: dict[str, int]
    por_categoria: list[PorCategoria]


class Dimension(_Modelo):
    codigo: str
    nombre: str
    orden: int
    es_oficial: bool


class Ventana(_Modelo):
    anio: int
    mes: int
    apertura: date
    cierre: date
    abierta: bool
    faltan: list[str] = Field(description="Fuentes que se pueden cargar y todavía no tienen ese mes.")


class FichaDelResumen(_Modelo):
    ficha: Ficha
    resultado: Resultado | None


class Resumen(_Modelo):
    anio: int
    hoy: date
    anios: list[int] = Field(description="Años con datos o con cálculo.")
    datos_al: date | None = Field(description="Fecha de la extracción más reciente del HIS cargada.")
    ventana: Ventana | None
    dimensiones: list[Dimension]
    fichas: list[FichaDelResumen]
    por_subir_ahora: int = Field(description="Archivos de «qué subir» cuya fecha ya llegó.")
    puede_cargar: bool = Field(description="La sesión puede subir datos y cambiar la configuración.")
    textos: dict[str, dict[str, str]] = Field(description="Nombres de los motivos (exclusión, por corregir) y de las categorías.")


class FichaTecnica(BaseModel):
    que_mide: str
    numerador: str
    denominador: str
    exclusiones: str
    meta: str
    cumplimiento: str
    frecuencia: str
    responsable: str
    limitaciones: list[str]
    preguntas: list[str]


class Detalle(_Modelo):
    anio: int
    hoy: date
    ficha: Ficha
    dimensiones: list[Dimension]
    ficha_tecnica: FichaTecnica | None = Field(description="Nula si su ficha técnica aún no está en el sistema.")
    meta: float | None
    resultado: Resultado | None
    datos_al: date | None
    anios: list[int]
    puede_cargar: bool
    textos: dict[str, dict[str, str]] = Field(description="Nombres de los motivos (exclusión, por corregir) y de las categorías.")


class Seguimiento(_Modelo):
    estado: str
    por: str | None
    el: datetime | None


class Paciente(_Modelo):
    apellido_paterno: str | None
    apellido_materno: str | None
    nombres: str | None
    historia_clinica: str | None


class CasoPorGestionar(BaseModel):
    id: int
    clase: str = Field(description="plazo_vigente · por_corregir; con `mes`, también a_tiempo · esperando_datos · sin_tratamiento")
    categoria: str | None
    nombre_categoria: str
    mes: int
    fecha_diagnostico: date
    vence: date
    dias_restantes: int
    fecha_atencion: date | None = Field(description="La del registro por corregir.")
    motivo: str | None = Field(description="Código de qué corregir (ver `textos`).")
    cierre_his: date | None = Field(description="Hasta cuándo se puede corregir en el HIS.")
    tipo_documento: str | None
    numero_documento: str
    paciente: Paciente | None = Field(description="Nula si ya no hay datos crudos de esa persona.")
    seguimiento: Seguimiento | None
    opciones: list[str] = Field(description="Los seguimientos posibles. Vacía si el caso ya no puede sumar.")


class Casos(BaseModel):
    numero: int
    anio: int
    corrida_id: int | None
    datos_al: date | None
    por_gestionar: PorGestionar | None
    casos: list[CasoPorGestionar]
    puede_editar: bool
    textos: dict[str, dict[str, str]] = Field(description="Nombres de los motivos (exclusión, por corregir) y de las categorías.")


class CargaDelMes(_Modelo):
    filas: int
    archivo: str
    huella: str
    fecha_extraccion: datetime | None
    cargado_el: datetime
    cargado_por: str | None


class MesDeCarga(_Modelo):
    mes: int
    estado: str = Field(description="cierre · preliminar · recargar · sin_fecha · falta · futuro")
    carga: CargaDelMes | None
    versiones: int


class FuenteDeCarga(_Modelo):
    codigo: str
    nombre: str
    descripcion: str | None
    formato: str | None
    area_responsable: str | None
    periodicidad: str
    cargable: bool
    fichas: list[int]
    meses: list[MesDeCarga]
    verificadas: int | None


class PasoDeSubida(_Modelo):
    desde: date = Field(description="Sirve una descarga hecha desde este día.")
    disponible: bool = Field(description="Ese día ya llegó.")
    cierra: list[int] = Field(description="Meses que se cierran con esa descarga.")
    definitiva: bool = Field(description="Desde ese día la carga ya es la final de su mes (pasó el cierre del HIS).")


class FuentePorSubir(_Modelo):
    codigo: str
    nombre: str


class PorSubir(_Modelo):
    anio: int
    mes: int
    fuentes: list[FuentePorSubir]
    cargado: bool = Field(description="Ya hay una carga de ese mes: la nueva la reemplaza.")
    disponible: bool = Field(description="Ya se puede subir algo de este mes.")
    pasos: list[PasoDeSubida]


class Fuentes(BaseModel):
    anio: int
    hoy: date
    ventana: Ventana | None
    por_subir: list[PorSubir] = Field(description="Qué descargar y subir, y desde qué fecha, para cerrar los meses abiertos.")
    fuentes: list[FuenteDeCarga]


class CargaHistorica(_Modelo):
    lote_mes_id: int
    fuente: str
    fuente_nombre: str
    anio: int
    mes: int
    archivo: str
    huella: str
    fecha_extraccion: datetime | None
    filas: int
    version: int
    vigente: bool
    cargado_el: datetime
    cargado_por: str | None
    retirada_el: datetime | None = Field(description="Cuándo se retiró, si se retiró sin que otra carga ocupara su mes.")


class Verificada(_Modelo):
    id: int
    numero_documento: str
    fecha_defuncion: date
    fecha_registro: date | None
    origen: str | None
    fecha_verificacion: date | None
    observacion: str | None
    anotada_el: datetime


class NuevaVerificada(BaseModel):
    numero_documento: str = Field(min_length=8, max_length=8)
    fecha_defuncion: date
    fecha_registro: date | None = None
    origen: str | None = Field(default=None, max_length=150)
    observacion: str | None = None


class Cambio(BaseModel):
    """Lo que pasó tras retirar una carga o tocar una defunción verificada."""

    recalculos: list["Recalculo"]
    verificada: Verificada | None = None


class Referencia(_Modelo):
    numero: int
    nombre_corto: str | None
    anio: int
    mes: int
    numerador: int
    denominador: int
    fecha_corte: date | None
    documento: str | None
    observacion: str | None
    calculado: Cifra | None
    coincide: bool | None


class MesDeLaRevision(_Modelo):
    periodo: str
    filas: int
    estado: str = Field(description="nuevo · reemplaza · ya_cargado")
    filas_anteriores: int | None
    variacion: float | None = Field(description="Frente al mes anterior, solo si es sospechosa (más de 20 %).")


class Revision(_Modelo):
    fuente: str
    fuente_nombre: str
    archivo: str
    tamano: int
    huella: str
    filas_archivo: int
    meses: list[MesDeLaRevision]
    filas_fuera_de_rango: int
    filas_sin_fecha: int
    verificadas_nuevas: int | None
    verificadas_actualizadas: int | None
    errores: list[str] = Field(description="Impiden cargar.")
    avisos: list[str] = Field(description="Se puede cargar, confirmándolo.")
    requiere_forzar: bool = Field(description="Cargarlo exige confirmar los avisos (`forzar`).")
    nada_nuevo: bool
    puede_cargar: bool
    fichas: list[int]
    cargado: bool


class Recalculo(BaseModel):
    numero: int
    anio: int
    estado: str = Field(description="calculado · al_dia · no_calculado")
    corrida_id: int | None
    numerador: int | None
    denominador: int | None
    motivo: str | None


class ResultadoDeCarga(BaseModel):
    revision: Revision
    recalculos: list[Recalculo]
    casos_confirmados: int = Field(description="Casos en seguimiento que la carga confirmó: ya suman.")


class NuevaReferencia(BaseModel):
    numero: int = Field(ge=1)
    anio: int = Field(ge=2000, le=2100)
    mes: int = Field(ge=1, le=12)
    numerador: int = Field(ge=0)
    denominador: int = Field(ge=1)
    fecha_corte: date | None = Field(default=None, description="La del reporte de MINSA, si se conoce. El cálculo la usa.")
    documento: str | None = Field(default=None, max_length=255)
    observacion: str | None = None


class ReferenciaGuardada(BaseModel):
    referencia: Referencia
    recalculo: Recalculo | None


class EdicionDeFuente(BaseModel):
    fichas: list[int] = Field(min_length=1)
    area_responsable: str | None = Field(default=None, max_length=120)


class NuevoSeguimiento(BaseModel):
    estado: str = Field(min_length=1, max_length=60)


# ===================================================================== traducción


def _textos() -> dict[str, dict[str, str]]:
    from app.dominio.desempeno import ficha_14

    return {"exclusion": ficha_14.MOTIVOS_DE_EXCLUSION, "por_corregir": ficha_14.MOTIVOS_POR_CORREGIR, "categoria": ficha_14.NOMBRES_DE_TIPO}


def _caso(c: servicio.CasoPorGestionar) -> CasoPorGestionar:
    x = c.caso
    return CasoPorGestionar(
        id=x.id, clase=x.clase, categoria=x.categoria, nombre_categoria=c.nombre_categoria, mes=x.fecha_referencia.month,
        fecha_diagnostico=x.fecha_referencia, vence=x.vence, dias_restantes=x.dias_restantes, fecha_atencion=x.por_corregir_fecha,
        motivo=x.por_corregir_motivo, cierre_his=c.cierre_his, tipo_documento=x.tipo_documento, numero_documento=x.numero_documento,
        paciente=Paciente.model_validate(c.paciente) if c.paciente else None,
        seguimiento=Seguimiento.model_validate(x.seguimiento) if x.seguimiento else None, opciones=list(c.opciones),
    )  # fmt: skip


def _recalculo(r: calculo.Recalculo) -> Recalculo:
    estado = "no_calculado" if r.motivo else ("al_dia" if r.calculo is None else "calculado")
    return Recalculo(
        numero=r.numero, anio=r.anio, estado=estado, corrida_id=r.corrida_id, motivo=r.motivo,
        numerador=r.calculo.numerador if r.calculo else None, denominador=r.calculo.denominador if r.calculo else None,
    )  # fmt: skip


# ======================================================================== vistas


@router.get("/resumen", response_model=Resumen, summary="Las 34 fichas con su último resultado")
def ver_resumen(anio: int | None = _ANIO, bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(ver_monitoreo)) -> Resumen:
    r = servicio.resumen(bd, anio=_anio(bd, anio, reloj), hoy=hoy_de(reloj))
    return Resumen.model_validate({**r.__dict__, "puede_cargar": sesion.puede(permisos.DESEMPENO_CARGAR), "textos": _textos()})


@router.get("/fichas/{numero}", response_model=Detalle, summary="Una ficha: ficha técnica y resultado mes a mes")
def ver_ficha(
    numero: int = Path(ge=1), anio: int | None = _ANIO, bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(ver_monitoreo)
) -> Detalle:
    a, hoy = _anio(bd, anio, reloj), hoy_de(reloj)
    d = servicio.detalle(bd, numero=numero, anio=a, hoy=hoy)
    return Detalle.model_validate(
        {**d.__dict__, "anio": a, "hoy": hoy, "dimensiones": servicio.dimensiones(bd), "puede_cargar": sesion.puede(permisos.DESEMPENO_CARGAR), "textos": _textos()}
    )


@router.get("/fichas/{numero}/casos", response_model=Casos, summary="Los casos que todavía pueden sumar, o los pacientes de un mes")
def ver_casos(
    numero: int = Path(ge=1),
    anio: int | None = _ANIO,
    mes: int | None = Query(default=None, ge=1, le=12, description="Todos los pacientes del denominador de ese mes, con su situación."),
    bd: Session = Depends(obtener_sesion_bd),
    reloj: Reloj = Depends(obtener_reloj),
    sesion: Sesion = Depends(ver),
) -> Casos:
    c = servicio.casos(bd, numero=numero, anio=_anio(bd, anio, reloj), hoy=hoy_de(reloj), mes=mes)
    return Casos(
        numero=numero, anio=c.anio, corrida_id=c.corrida_id, datos_al=c.datos_al,
        por_gestionar=PorGestionar.model_validate(c.por_gestionar) if c.por_gestionar else None,
        casos=[_caso(x) for x in c.casos], puede_editar=sesion.puede(permisos.DESEMPENO_CARGAR), textos=_textos(),
    )  # fmt: skip


@router.put("/fichas/{numero}/casos/{caso_id}", response_model=CasoPorGestionar, summary="Anotar el seguimiento de un caso")
def anotar_seguimiento(
    cuerpo: NuevoSeguimiento,
    numero: int = Path(ge=1),
    caso_id: int = Path(ge=1),
    anio: int | None = _ANIO,
    bd: Session = Depends(bd_auditada),
    reloj: Reloj = Depends(obtener_reloj),
    sesion: Sesion = Depends(cargar),
) -> CasoPorGestionar:
    c = _hacer(lambda: servicio.guardar_seguimiento(bd, numero=numero, anio=_anio(bd, anio, reloj), caso_id=caso_id, estado=cuerpo.estado, usuario_id=sesion.usuario_id, hoy=hoy_de(reloj)))
    bd.commit()
    return _caso(c)


# ========================================================================= carga


@router.get("/fuentes", response_model=Fuentes, summary="Cada fuente con sus fichas y sus meses cargados")
def ver_fuentes(anio: int | None = _ANIO, bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj), _: Sesion = Depends(cargar)) -> Fuentes:
    a, hoy = _anio(bd, anio, reloj), hoy_de(reloj)
    return Fuentes(
        anio=a, hoy=hoy, ventana=servicio.ventana(bd, hoy),
        por_subir=[PorSubir.model_validate(x) for x in servicio.por_subir(bd, anio=a, hoy=hoy)],
        fuentes=[FuenteDeCarga.model_validate(f) for f in servicio.fuentes_de_carga(bd, anio=a, hoy=hoy)],
    )  # fmt: skip


@router.put("/fuentes/{codigo}", response_model=FuenteDeCarga, summary="A qué fichas alimenta una fuente y quién la entrega")
def editar_fuente(
    cuerpo: EdicionDeFuente, codigo: str = Path(max_length=40), anio: int | None = _ANIO, bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), _: Sesion = Depends(cargar)
) -> FuenteDeCarga:
    f = _hacer(lambda: servicio.editar_fuente(bd, codigo=codigo, fichas=cuerpo.fichas, area_responsable=cuerpo.area_responsable, anio=_anio(bd, anio, reloj), hoy=hoy_de(reloj)))
    bd.commit()
    return FuenteDeCarga.model_validate(f)


@router.get("/cargas", response_model=list[CargaHistorica], summary="Historial de cargas del año")
def ver_historial(anio: int | None = _ANIO, bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj), _: Sesion = Depends(cargar)) -> list[CargaHistorica]:
    return [CargaHistorica.model_validate(c) for c in servicio.historial(bd, anio=_anio(bd, anio, reloj))]


def _rechazo(e: CargaRechazada) -> JSONResponse:
    return JSONResponse(cuerpo_de_error(" ".join(e.motivos), "carga_rechazada", motivos=list(e.motivos)), status_code=422)


class _ArchivoRecibido:
    """El archivo subido, en una carpeta temporal y con su nombre de origen: la
    carga lee la fecha de extracción del nombre. Se borra al salir, pase lo que
    pase: tiene datos de pacientes."""

    def __init__(self, archivo: UploadFile):
        self._archivo = archivo
        self._carpeta = tempfile.TemporaryDirectory(prefix="hrl-desempeno-")

    def __enter__(self) -> Ruta:
        nombre = Ruta(self._archivo.filename or "").name or "archivo"
        ruta = Ruta(self._carpeta.name) / nombre
        tamano = 0
        with open(ruta, "wb") as destino:
            while trozo := self._archivo.file.read(1024 * 1024):
                tamano += len(trozo)
                if tamano > subida.TAMANO_MAXIMO:
                    raise CargaRechazada(f"El archivo pesa más de {subida.TAMANO_MAXIMO // (1024 * 1024)} MB. El consolidado de varios años se carga por terminal (docs/INDICADORES_DESEMPENO.md).")
                destino.write(trozo)
        return ruta

    def __exit__(self, *_):
        self._carpeta.cleanup()


_ARCHIVO = File(description="La trama del HIS (.csv), el reporte de SINADEF (.xls) o el CSV de defunciones verificadas, tal como se descargan. Hasta 60 MB.")


@router.post("/cargas/revision", response_model=Revision, summary="Qué pasaría si se carga el archivo (no guarda nada)")
def revisar_archivo(archivo: UploadFile = _ARCHIVO, bd: Session = Depends(bd_auditada), sesion: Sesion = Depends(cargar)):
    try:
        with _ArchivoRecibido(archivo) as ruta:
            r = subida.revisar(bd, ruta, usuario_id=sesion.usuario_id)
    except CargaRechazada as e:
        bd.rollback()
        return _rechazo(e)
    bd.rollback()
    return Revision.model_validate(r)


@router.post("/cargas", response_model=ResultadoDeCarga, summary="Cargar el archivo y recalcular")
def cargar_archivo(
    archivo: UploadFile = _ARCHIVO,
    forzar: bool = Form(default=False, description="Cargar aunque sea más antiguo o traiga menos filas que lo ya cargado."),
    bd: Session = Depends(bd_auditada),
    reloj: Reloj = Depends(obtener_reloj),
    sesion: Sesion = Depends(cargar),
):
    try:
        with _ArchivoRecibido(archivo) as ruta:
            r = subida.cargar(bd, ruta, usuario_id=sesion.usuario_id, forzar=forzar)
    except CargaRechazada as e:
        bd.rollback()
        return _rechazo(e)
    bd.commit()
    recalculos = calculo.recalcular_todo(bd, usuario_id=sesion.usuario_id)
    confirmados = sum(servicio.confirmar_seguimientos(bd, numero=x.numero, anio=x.anio) for x in recalculos if x.calculo is not None)
    bd.commit()
    return ResultadoDeCarga(revision=Revision.model_validate(r), recalculos=[_recalculo(x) for x in recalculos], casos_confirmados=confirmados)


# ============================================ retirar una carga · verificadas


def _recalcular(bd: Session, sesion: Sesion) -> list[Recalculo]:
    """Lo mismo que tras una carga. Si una ficha ya no se puede calcular, su
    último resultado deja de ser el vigente: describía datos que ya no están."""
    recalculos = calculo.recalcular_todo(bd, usuario_id=sesion.usuario_id)
    for x in recalculos:
        if x.calculo is not None:
            servicio.confirmar_seguimientos(bd, numero=x.numero, anio=x.anio)
    return [_recalculo(x) for x in recalculos]


@router.delete("/fuentes/{codigo}/meses/{mes}", response_model=Cambio, summary="Retirar la carga de un mes y recalcular")
def retirar_carga(
    codigo: str = Path(max_length=40), mes: int = Path(ge=1, le=12), anio: int | None = _ANIO, bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(cargar)
) -> Cambio:
    a = _anio(bd, anio, reloj)
    _hacer(lambda: servicio.retirar_mes(bd, codigo=codigo, anio=a, mes=mes))
    recalculos = _recalcular(bd, sesion)
    # Sin enero no hay año que calcular: recalcular_todo ni lo intenta.
    if a not in calculo.anios_con_enero(bd):
        for numero in calculo.CALCULOS:
            servicio.retirar_resultados(bd, numero=numero, anio=a)
    bd.commit()
    return Cambio(recalculos=recalculos)


@router.get("/verificadas", response_model=list[Verificada], summary="Las defunciones verificadas a mano en SINADEF nacional")
def ver_verificadas(bd: Session = Depends(obtener_sesion_bd), _: Sesion = Depends(cargar)) -> list[Verificada]:
    return [Verificada.model_validate(v) for v in servicio.verificadas(bd)]


def _guardar_verificada(cuerpo: NuevaVerificada, verificada_id: int | None, bd: Session, reloj: Reloj, sesion: Sesion) -> Cambio:
    v = _hacer(lambda: servicio.guardar_verificada(bd, verificada_id=verificada_id, hoy=hoy_de(reloj), **cuerpo.model_dump()))
    recalculos = _recalcular(bd, sesion)
    bd.commit()
    return Cambio(recalculos=recalculos, verificada=Verificada.model_validate(v))


@router.post("/verificadas", response_model=Cambio, summary="Agregar una defunción verificada y recalcular")
def agregar_verificada(cuerpo: NuevaVerificada, bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(cargar)) -> Cambio:
    return _guardar_verificada(cuerpo, None, bd, reloj, sesion)


@router.put("/verificadas/{verificada_id}", response_model=Cambio, summary="Corregir una defunción verificada y recalcular")
def corregir_verificada(
    cuerpo: NuevaVerificada, verificada_id: int = Path(ge=1), bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(cargar)
) -> Cambio:
    return _guardar_verificada(cuerpo, verificada_id, bd, reloj, sesion)


@router.delete("/verificadas/{verificada_id}", response_model=Cambio, summary="Retirar una defunción verificada y recalcular")
def retirar_verificada(verificada_id: int = Path(ge=1), bd: Session = Depends(bd_auditada), sesion: Sesion = Depends(cargar)) -> Cambio:
    _hacer(lambda: servicio.retirar_verificada(bd, verificada_id=verificada_id))
    recalculos = _recalcular(bd, sesion)
    bd.commit()
    return Cambio(recalculos=recalculos)


# ============================================================== referencia MINSA


@router.get("/referencias", response_model=list[Referencia], summary="Lo publicado por MINSA, frente al cálculo")
def ver_referencias(anio: int | None = _ANIO, bd: Session = Depends(obtener_sesion_bd), reloj: Reloj = Depends(obtener_reloj), _: Sesion = Depends(cargar)) -> list[Referencia]:
    return [Referencia.model_validate(r) for r in servicio.referencias(bd, anio=_anio(bd, anio, reloj))]


@router.put("/referencias", response_model=ReferenciaGuardada, summary="Registrar lo publicado por MINSA de una ficha y un mes")
def guardar_referencia(cuerpo: NuevaReferencia, bd: Session = Depends(bd_auditada), reloj: Reloj = Depends(obtener_reloj), sesion: Sesion = Depends(cargar)) -> ReferenciaGuardada:
    _hacer(lambda: servicio.guardar_referencia(bd, hoy=hoy_de(reloj), **cuerpo.model_dump()))
    bd.commit()
    # Una fecha de corte nueva cambia qué meses quedan fijados: se recalcula.
    recalculo = None
    if cuerpo.numero in calculo.CALCULOS:
        recalculo = _recalculo(calculo.recalcular(bd, numero=cuerpo.numero, anio=cuerpo.anio, usuario_id=sesion.usuario_id))
        bd.commit()
    guardada = next(r for r in servicio.referencias(bd, anio=cuerpo.anio) if r.numero == cuerpo.numero and r.mes == cuerpo.mes)
    return ReferenciaGuardada(referencia=Referencia.model_validate(guardada), recalculo=recalculo)
