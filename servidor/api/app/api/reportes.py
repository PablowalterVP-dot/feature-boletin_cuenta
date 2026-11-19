"""Endpoints de los reportes: la lista, transiciones, detalle, valores y la carga del Excel.

    GET  /api/reportes                                              la lista, paginada
    GET  /api/reportes/{formato}/{periodo}                          el detalle
    GET  /api/reportes/{formato}/{periodo}/valores                  las casillas, con su linaje
    GET  /api/reportes/{formato}/{periodo}/revision                 el informe del bot vigente y sus hallazgos
    PUT  /api/reportes/{formato}/{periodo}/hallazgos/{clave}/justificacion   justifica un aviso
    POST /api/reportes/{formato}/{periodo}/transiciones/{accion}    crear, enviar, rectificar
    DELETE /api/reportes/{formato}/{periodo}                         retira con borrado lógico y motivo auditado
    POST /api/reportes/{formato}/{periodo}/cargas                   sube el Excel: lo valida el bot y persiste el resultado

`formato` es el código del formato (`NUT`, sin distinguir mayúsculas), no la clave de la
unidad: una unidad puede tener más de un formato.

Lo que una oficina recibió está en `api/oficinas.py`.
"""

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Path, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.dependencias import bd_auditada, obtener_ajustes_api, obtener_reloj, sesion_actual
from app.config import Ajustes
from app.datos.sesion import obtener_sesion_bd
from app.dominio import consultas as reglas_de_consulta
from app.dominio import estados, permisos
from app.dominio.reloj import Reloj
from app.dominio.sesion import Sesion
from app.servicios import alertas as servicio_de_alertas
from app.servicios import cargas as servicio_de_cargas
from app.servicios import consolidado as servicio_de_consolidado
from app.servicios import consultas as servicio_de_consultas
from app.servicios import revision as servicio_de_revision
from app.servicios import transiciones as servicio
from app.servicios import valores as servicio_de_valores
from app.servicios.acceso import buscar_formato_y_unidad
from app.servicios.errores import SinPermiso
from app.herramientas.eliminar_reporte import NoSePuede, eliminar_reporte

router = APIRouter(prefix="/reportes", tags=["reportes"])

# Sin barras invertidas a propósito: `[0-9]` en lugar de `\d`.
_FORMATO = Path(pattern="^[A-Za-z0-9_-]{1,30}$", description="Código del formato, p. ej. NUT (no distingue mayúsculas).")
_PERIODO = Path(pattern="^[0-9]{4}-(0[1-9]|1[0-2])$", description="Periodo AAAA-MM, con cero: 2026-08.")
_ACCION = Path(pattern="^[a-z_]{1,20}$", description="crear, enviar o rectificar.")
_CLAVE_HALLAZGO = Path(min_length=1, max_length=200, description="La clave del hallazgo, p. ej. atipico|f3|liquida.cena|21 (codificada en la URL).")

_PATRON_PERIODO = "^[0-9]{4}-(0[1-9]|1[0-2])$"
_PATRON_FORMATO = "^[A-Za-z0-9_-]{1,30}$"
_PATRON_ESTADO = "^(" + "|".join(e.clave for e in estados.ESTADOS) + ")$"
_PATRON_ESPERA = "^(" + "|".join(reglas_de_consulta.ESTADOS_DE_LA_ESPERA) + ")$"


# ------------------------------------------------------------------- esquemas


class CuerpoTransicion(BaseModel):
    """Todo es opcional. `extra=forbid`: un campo mal escrito (`destino` por `destinos`)
    se rechaza en lugar de ignorarse en silencio."""

    model_config = ConfigDict(extra="forbid")

    comentario: str | None = Field(default=None, max_length=2000, description="Se agrega a la nota estándar del historial. En `rectificar` es opcional; la nota se registra siempre.")


class RemisionCreada(BaseModel):
    destino: str
    es_sin_validar: bool


class RespuestaTransicion(BaseModel):
    formato: str
    periodo: str
    accion: str
    estado_origen: str
    estado_destino: str
    numero_rectificacion: int
    constancia: str | None
    nota: str
    remisiones: list[RemisionCreada]


class EventoDelHistorial(BaseModel):
    accion: str
    estado_origen: str | None
    estado_destino: str
    numero_rectificacion: int
    comentario: str | None
    fecha: datetime


class RemisionDelReporte(BaseModel):
    destino: str
    es_sin_validar: bool
    es_vigente: bool
    numero_rectificacion: int
    fecha: datetime


class ResumenDeHallazgos(BaseModel):
    errores: int
    avisos: int
    avisos_sin_justificar: int
    info: int


class RespuestaDetalle(BaseModel):
    formato: str
    unidad: str
    periodo: str
    estado: str
    numero_rectificacion: int
    folio_constancia: str | None
    fecha_envio: datetime | None
    fecha_validacion: datetime | None
    tiene_carga_aceptada: bool
    hallazgos: ResumenDeHallazgos
    acciones_disponibles: list[str]
    historial: list[EventoDelHistorial]
    remisiones: list[RemisionDelReporte]


class FilaDeReporte(BaseModel):
    periodo: str
    formato: str
    formato_nombre: str
    unidad: str
    unidad_nombre: str
    estado: str = Field(description="no_iniciado, borrador, enviado, en_revision, validado o remitido.")
    espera: str = Field(description="Quién debe actuar: area, estadistica o nadie.")
    semaforo: str = Field(description="a_tiempo, fuera_de_plazo (enviado tarde), pendiente (aún hay plazo) o vencido (sin enviar).")
    dias_de_retraso: int | None = Field(description="Días de atraso; `null` si no hay atraso que contar (no es 0).")
    fecha_limite: date
    fecha_envio: datetime | None
    fecha_validacion: datetime | None
    numero_rectificacion: int
    folio_constancia: str | None


class AlertaDeArea(BaseModel):
    clave: str
    nivel: str = Field(description="Hoy, siempre «aviso»: no bloquea nada, a diferencia de un error del bot al subir.")
    titulo: str
    cuerpo: str


class RespuestaAlertas(BaseModel):
    formato: str
    periodo: str
    alertas: list[AlertaDeArea]


class RespuestaListaDeReportes(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    paginas: int
    filas: list[FilaDeReporte]


class Casilla(BaseModel):
    dia: int | None = Field(description="Nulo si el formato es mensual (un solo dato).")
    fecha: date | None
    valor: Decimal | None = Field(description="Nulo = no se registró; no es lo mismo que 0.")
    texto_original: str | None = Field(description="Lo que decía la casilla, cuando no era un número.")
    origen: str = Field(description="archivo o manual.")
    hoja_excel: str | None = Field(description="Linaje: de qué hoja del Excel se leyó. Solo si origen es «archivo».")
    celda_excel: str | None = Field(description="Linaje: de qué celda. Solo si origen es «archivo».")


class IndicadorDeValores(BaseModel):
    indicador: str
    nombre: str
    unidad_medida: str | None
    dimensiones: dict[str, str] = Field(description="Población, servicio, comida… lo que distingue esta fila de otras del mismo cuadro.")
    total: Decimal | None = Field(description="Del mes. Nulo = ninguna casilla tiene dato; no es 0.")
    casillas_con_dato: int
    casillas_esperadas: int
    casillas: list[Casilla] = Field(description="Vacío si el indicador no tiene ningún dato todavía.")


class CuadroDeValores(BaseModel):
    cuadro: str
    titulo: str
    indicadores: list[IndicadorDeValores]


class HallazgoDeRevision(BaseModel):
    clave: str = Field(description="Estable: la misma que el `id` del aviso en el informe del bot.")
    nivel: str = Field(description="error, aviso o info.")
    titulo: str
    detalle: str | None
    cuadro: str | None
    indicador: str | None
    dia: int | None
    justificacion: str | None = Field(description="Solo en avisos. Nula = sin justificar: el reporte no se puede enviar.")
    fecha_justificacion: datetime | None


class CargaDeRevision(BaseModel):
    archivo: str = Field(description="El nombre con que se subió el Excel.")
    fecha: datetime
    version: str | None = Field(description="La estructura con que se leyó, p. ej. NUT-1.")
    version_bot: str | None
    casillas_leidas: int | None
    informe: dict | None = Field(description="El informe del bot tal como se guardó (la misma forma que devuelve POST .../cargas).")


class RespuestaRevision(BaseModel):
    formato: str
    unidad: str
    periodo: str
    estado: str
    carga: CargaDeRevision | None = Field(description="Nula: todavía no hay un Excel aceptado.")
    hallazgos: list[HallazgoDeRevision]


class CuerpoJustificacion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    justificacion: str | None = Field(default=None, max_length=2000, description="Vacía o nula la borra.")


class RespuestaValores(BaseModel):
    formato: str
    unidad: str
    periodo: str
    cuadros: list[CuadroDeValores] = Field(description="Vacío sin reporte, o sin una estructura activa todavía.")


# ------------------------------------------------------------------ endpoints


@router.get("", response_model=RespuestaListaDeReportes, summary="La lista de reportes por periodo y formato")
def listar_reportes(
    periodo: str | None = Query(default=None, pattern=_PATRON_PERIODO, description="Un mes exacto (AAAA-MM). No se combina con `desde`/`hasta`."),
    desde: str | None = Query(default=None, pattern=_PATRON_PERIODO, description="Primer mes del rango, incluido."),
    hasta: str | None = Query(default=None, pattern=_PATRON_PERIODO, description="Último mes del rango, incluido. Nunca pasa del periodo vigente."),
    formato: str | None = Query(default=None, pattern=_PATRON_FORMATO, description="Código del formato, p. ej. NUT."),
    estado: str | None = Query(default=None, pattern=_PATRON_ESTADO),
    espera: str | None = Query(default=None, pattern=_PATRON_ESPERA, description="Quién debe actuar: area, estadistica o nadie."),
    pagina: int = Query(default=1, ge=1, le=100_000),
    por_pagina: int = Query(default=reglas_de_consulta.FILAS_POR_PAGINA, ge=1, le=reglas_de_consulta.MAXIMO_POR_PAGINA),
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(obtener_sesion_bd),
    reloj: Reloj = Depends(obtener_reloj),
) -> RespuestaListaDeReportes:
    """Un renglón por periodo y formato, del más reciente al más antiguo, **exista o no el
    reporte** (un `no_iniciado` es justo lo que Estadística vigila). Nunca incluye un mes
    posterior al periodo vigente.

    Ve cada persona lo que su cuenta permite: `reporte.ver` sobre la unidad, y un reporte
    que todavía no salió del área (no iniciado, borrador) solo quien lo trabaja; una
    consulta, aunque sea global, no ve borradores.

    Respuestas: 403 sin `reporte.ver` en ninguna parte · 422 filtros inválidos, un rango al
    revés o `periodo` junto con `desde`/`hasta`.
    """
    r = servicio_de_consultas.listar_reportes(
        bd, sesion, reloj, periodo=periodo, desde=desde, hasta=hasta, formato=formato, estado=estado, espera=espera, pagina=pagina, por_pagina=por_pagina,
    )
    return RespuestaListaDeReportes(
        total=r.pagina.total, pagina=r.pagina.pagina, por_pagina=r.pagina.por_pagina, paginas=r.pagina.paginas,
        filas=[FilaDeReporte(**vars(f)) for f in r.filas],
    )


class MesDelConsolidado(BaseModel):
    periodo: str
    estado: str = Field(description="El estado del reporte de ese mes; solo figuran los entregados.")
    totales: dict[str, int] = Field(description="El total de raciones de cada cuadro: {\"f1\": 23255, …}.")


class RespuestaConsolidado(BaseModel):
    formato: str
    unidad: str
    anio: int
    meses: list[MesDelConsolidado] = Field(description="Un elemento por mes con reporte entregado. Un mes ausente no tiene reporte: no es cero.")


@router.get("/{formato}/anual/{anio}", response_model=RespuestaConsolidado, summary="El consolidado anual (el TOTAL del área)")
def ver_consolidado(
    formato: str = _FORMATO,
    anio: int = Path(ge=2000, le=2100),
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(obtener_sesion_bd),
) -> RespuestaConsolidado:
    """El total de cada cuadro, mes por mes, sumado desde las casillas guardadas: lo
    que el área copiaba a mano en su TOTAL.xlsx. El bot lo convierte en el Excel
    (areas/nutricion/consolidado.js). Solo reportes entregados. Exige `reporte.ver`
    sobre la unidad del formato (o global)."""
    c = servicio_de_consolidado.consolidado(bd, sesion, formato=formato, anio=anio)
    return RespuestaConsolidado(formato=c.formato, unidad=c.unidad, anio=c.anio, meses=[MesDelConsolidado(**vars(m)) for m in c.meses])


@router.get("/{formato}/{periodo}", response_model=RespuestaDetalle, summary="El estado de un reporte")
def ver_reporte(
    formato: str = _FORMATO,
    periodo: str = _PERIODO,
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(obtener_sesion_bd),
) -> RespuestaDetalle:
    """Sin reporte responde **200 con `estado: no_iniciado`**: su ausencia ES el estado.
    `acciones_disponibles` son las que el estado permite Y que esta cuenta puede hacer.

    Un reporte que todavía no salió del área (no iniciado, borrador) solo lo ve quien lo
    trabaja: una consulta, aunque tenga `reporte.ver`, recibe 403. Es la misma regla de la lista."""
    d = servicio.detalle(bd, sesion, formato=formato, periodo=periodo)
    return RespuestaDetalle(
        formato=d.formato, unidad=d.unidad, periodo=d.periodo, estado=d.estado, numero_rectificacion=d.numero_rectificacion,
        folio_constancia=d.folio_constancia, fecha_envio=d.fecha_envio, fecha_validacion=d.fecha_validacion,
        tiene_carga_aceptada=d.tiene_carga_aceptada, hallazgos=ResumenDeHallazgos(**d.hallazgos),
        acciones_disponibles=d.acciones_disponibles,
        historial=[EventoDelHistorial(**h) for h in d.historial],
        remisiones=[RemisionDelReporte(**r) for r in d.remisiones],
    )


@router.get("/{formato}/{periodo}/valores", response_model=RespuestaValores, summary="Las casillas de un reporte")
def ver_valores(
    formato: str = _FORMATO,
    periodo: str = _PERIODO,
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(obtener_sesion_bd),
) -> RespuestaValores:
    """Las casillas del reporte, agrupadas por cuadro e indicador, con su linaje
    (`hoja_excel`/`celda_excel`) cuando vienen de un Excel. Un indicador aparece aunque no
    tenga ninguna casilla, con `total: null`: la ausencia de dato no se rellena con ceros.

    Misma regla de visibilidad que el detalle: un reporte que no ha salido del área (no
    iniciado, borrador) solo lo ve quien lo trabaja."""
    d = servicio_de_valores.valores_de(bd, sesion, formato=formato, periodo=periodo)
    return RespuestaValores(
        formato=d.formato, unidad=d.unidad, periodo=d.periodo,
        cuadros=[
            CuadroDeValores(
                cuadro=c.cuadro, titulo=c.titulo,
                indicadores=[
                    IndicadorDeValores(
                        indicador=i.indicador, nombre=i.nombre, unidad_medida=i.unidad_medida, dimensiones=i.dimensiones,
                        total=i.total, casillas_con_dato=i.casillas_con_dato, casillas_esperadas=i.casillas_esperadas,
                        casillas=[Casilla(**vars(cas)) for cas in i.casillas],
                    )
                    for i in c.indicadores
                ],
            )
            for c in d.cuadros
        ],
    )


@router.get("/{formato}/{periodo}/alertas", response_model=RespuestaAlertas, summary="Alertas del área, con el plazo y el reloj reales")
def ver_alertas(
    formato: str = _FORMATO,
    periodo: str = _PERIODO,
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(obtener_sesion_bd),
    reloj: Reloj = Depends(obtener_reloj),
) -> RespuestaAlertas:
    """No se guardan: se calculan en cada consulta. Vacío fuera del periodo vigente, si
    el reporte ya salió del área, o si todavía no se subió nada ese mes (`dominio/
    alertas.py`). Misma visibilidad que el detalle."""
    alertas = servicio_de_alertas.alertas_de(bd, sesion, reloj, formato=formato, periodo=periodo)
    return RespuestaAlertas(formato=formato.upper(), periodo=periodo, alertas=[AlertaDeArea(**vars(a)) for a in alertas])


@router.get("/{formato}/{periodo}/revision", response_model=RespuestaRevision, summary="Lo que encontró el bot en el Excel vigente")
def ver_revision(
    formato: str = _FORMATO,
    periodo: str = _PERIODO,
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(obtener_sesion_bd),
) -> RespuestaRevision:
    """El informe del bot de la carga vigente, tal como se guardó, y sus hallazgos con las
    justificaciones escritas. Sirve para volver a pintar la revisión sin llamarle al bot otra
    vez (después de recargar, o desde Estadística).

    Misma regla de lectura que el detalle y los valores. Sin reporte o sin Excel aceptado,
    `carga: null` y `hallazgos: []`."""
    r = servicio_de_revision.revision_de(bd, sesion, formato=formato, periodo=periodo)
    return RespuestaRevision(
        formato=r.formato, unidad=r.unidad, periodo=r.periodo, estado=r.estado,
        carga=CargaDeRevision(**vars(r.carga)) if r.carga else None,
        hallazgos=[HallazgoDeRevision(**vars(h)) for h in r.hallazgos],
    )


@router.put("/{formato}/{periodo}/hallazgos/{clave}/justificacion", response_model=HallazgoDeRevision, summary="Justificar un aviso")
def justificar_aviso(
    cuerpo: CuerpoJustificacion,
    formato: str = _FORMATO,
    periodo: str = _PERIODO,
    clave: str = _CLAVE_HALLAZGO,
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(bd_auditada),
    reloj: Reloj = Depends(obtener_reloj),
) -> HallazgoDeRevision:
    """Escribe la justificación de un aviso del Excel vigente (o la borra, si viene vacía).
    La lee Estadística al revisar. Si el área vuelve a subir un Excel que dispara el mismo
    aviso, la justificación se conserva.

    Respuestas: 403 sin `reporte.cargar` sobre la unidad · 404 formato, periodo o hallazgo
    inexistentes · 409 el reporte no está en borrador o no tiene Excel aceptado · 422 el
    hallazgo no es un aviso (un error se corrige subiendo otro Excel).
    """
    try:
        h = servicio_de_revision.justificar(bd, sesion, reloj, formato=formato, periodo=periodo, clave=clave, texto=cuerpo.justificacion)
        bd.commit()  # UNO solo: `app.usuario_id` (auditoría) dura lo que la transacción
    except Exception:
        bd.rollback()
        raise
    return HallazgoDeRevision(**vars(h))


@router.post("/{formato}/{periodo}/transiciones/{accion}", response_model=RespuestaTransicion, summary="Mover un reporte en el flujo")
def transicionar(
    formato: str = _FORMATO,
    periodo: str = _PERIODO,
    accion: str = _ACCION,
    cuerpo: CuerpoTransicion | None = None,
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(bd_auditada),
    reloj: Reloj = Depends(obtener_reloj),
) -> RespuestaTransicion:
    """Una sola transacción: comprueba, bloquea la fila del reporte, aplica los efectos y
    **confirma una sola vez al final**. Si algo falla, no queda nada a medias.

    Respuestas: 403 sin el permiso sobre la unidad · 404 la acción, el formato o el periodo
    no existen · 409 el estado no la permite, el reporte ya existe o no hay Excel aceptado ·
    422 hallazgos que bloquean o periodo futuro.

    `enviar` entrega a la vez a Estadística y a las oficinas de la matriz vigente: no hay
    destinos que elegir (12/10/2026).
    """
    cuerpo = cuerpo or CuerpoTransicion()
    try:
        r = servicio.transicionar(bd, sesion, reloj, formato=formato, periodo=periodo, accion=accion, comentario=cuerpo.comentario)
        bd.commit()  # UNO solo: `app.usuario_id` (auditoría) dura lo que la transacción
    except Exception:
        bd.rollback()
        raise
    return RespuestaTransicion(
        formato=r.formato, periodo=r.periodo, accion=r.accion, estado_origen=r.estado_origen, estado_destino=r.estado_destino,
        numero_rectificacion=r.numero_rectificacion, constancia=r.constancia, nota=r.nota,
        remisiones=[RemisionCreada(destino=x.destino, es_sin_validar=x.es_sin_validar) for x in r.remisiones],
    )


@router.delete("/{formato}/{periodo}", status_code=204, summary="Retirar un reporte del mes con borrado lógico")
def retirar_reporte(
    formato: str = _FORMATO,
    periodo: str = _PERIODO,
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(bd_auditada),
) -> None:
    """Solo Estadística (o superadministración) puede retirar un reporte. Conserva las
    cifras y el historial en la base y la bitácora; libera el mes para una nueva carga."""
    try:
        el_formato, unidad = buscar_formato_y_unidad(bd, formato)
        if not sesion.puede(permisos.REPORTE_ELIMINAR, unidad.clave):
            raise SinPermiso("Su cuenta no tiene permiso para retirar reportes en esta área.", permiso=permisos.REPORTE_ELIMINAR, unidad=unidad.clave)
        eliminar_reporte(bd, el_formato.codigo, periodo, motivo="Retiro efectuado desde la bandeja de Estadística.", usuario_id=sesion.usuario_id)
        bd.commit()
    except NoSePuede as e:
        bd.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e
    except Exception:
        bd.rollback()
        raise


class RespuestaCarga(BaseModel):
    resultado: str = Field(description="aceptada o bloqueada.")
    informe: dict = Field(
        description="El informe del bot, tal cual (ver servidor/bot-validador/README.md): errores, "
        "avisos, info (cada uno con titulo/fila/dia/formato/id), reglas (con su estado), "
        "datos, origen, leidas, plantilla, archivo y bot; más bloqueo si resultado es "
        "«bloqueada». No se tipa campo por campo a propósito: esa forma la define el bot, "
        "y tiparla aquí obligaría a perseguir cada cambio suyo desde el backend."
    )


@router.post("/{formato}/{periodo}/cargas", response_model=RespuestaCarga, summary="Subir el Excel del área")
async def subir_excel(
    formato: str = _FORMATO,
    periodo: str = _PERIODO,
    archivo: UploadFile = File(description="El Excel del área (.xlsx) o, en las áreas con Word, su documento (.docx o .doc), de hasta 5 MB."),
    sesion: Sesion = Depends(sesion_actual),
    bd: Session = Depends(bd_auditada),
    ajustes: Ajustes = Depends(obtener_ajustes_api),
) -> RespuestaCarga:
    """Guarda el archivo, arma la configuración de lectura de la versión activa desde
    `formato.v_configuracion_lectura`, llama al bot validador y persiste el resultado en
    una sola transacción (`INFORME_AVANCE_04.md` § 4): si el bot bloquea, solo la carga;
    si acepta, además las casillas, los totales declarados y los hallazgos. Devuelve el
    informe del bot completo (no solo un resumen): es lo que la interfaz necesita para
    pintar la misma revisión detallada que ya sabe mostrar, sin volver a llamar al bot
    por su cuenta — el backend es la única fuente de verdad de qué se validó.

    Respuestas: 403 sin `reporte.cargar` sobre la unidad · 404 formato o periodo
    inexistentes · 409 sin ninguna versión activa, el reporte no está en `borrador`
    (ni recién creado), o el bot reconoció una versión que aquí no está activa ·
    422 el archivo pesa más de 5 MB · 503 el bot no responde.
    """
    contenido = await archivo.read()
    try:
        r = servicio_de_cargas.recibir_carga(
            bd, sesion, formato=formato, periodo=periodo, nombre_archivo=archivo.filename or "archivo.xlsx", contenido=contenido,
            ruta_cargas=ajustes.carpeta_cargas, bot_url=ajustes.bot_validador_url, bot_segundos=ajustes.bot_validador_segundos,
        )
        bd.commit()  # UNO solo: `app.usuario_id` y `app.carga_id` duran lo que la transacción
    except Exception:
        bd.rollback()
        raise
    return RespuestaCarga(resultado=r.resultado, informe=r.informe)
