"""Carga de datos crudos al esquema `fuente`: HIS MINSA, SINADEF del hospital y
las defunciones verificadas a mano.

Un archivo se lee **dos veces**. La primera solo cuenta: qué meses trae, cuántas
filas de cada uno, si su forma es la esperada. Con eso se decide todo —qué es
nuevo, qué reemplaza, qué se rechaza— **antes de escribir nada**. La segunda
copia las filas. Así un archivo que no se puede cargar no deja la base a medias,
y el consolidado de 724 MB nunca está entero en memoria.

Ninguna función confirma: quien llama hace el `commit()` (o no, para ensayar).
"""

import csv
import hashlib
import re
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

import xlrd
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.datos.base import vigente
from app.datos.fuente import FUENTE_HIS, FUENTE_SINADEF, FUENTE_VERIFICADOS
from app.datos.modelos import COLUMNAS_HIS, DefuncionVerificada, Fuente, HisAtencion, LoteCarga, LoteMes, SinadefDefuncion, Usuario
from app.dominio import fuentes as reglas
from app.dominio.fuentes import CargaRechazada, MesCargado
from app.dominio.reloj import ZONA

_POSICION_FECHA = COLUMNAS_HIS.index("fecha_atencion")
# Cuándo se digitó o corrigió cada fila: el archivo se descargó ese día o después.
_POSICIONES_DE_REGISTRO = (COLUMNAS_HIS.index("fecha_registro"), COLUMNAS_HIS.index("fecha_modificacion"))
_COPIAR_HIS = f"COPY fuente.his_atencion (lote_mes_id, fila_archivo, {', '.join(COLUMNAS_HIS)}) FROM STDIN"

# La última línea de un rechazo por no pisar a ciegas. Es para la terminal: la
# pantalla lo dice con su propio botón.
NO_SE_CARGO = "No se cargó nada. Si aun así es el archivo correcto, repita la orden con --forzar."

# Estados de un mes en el resultado de una carga.
NUEVO, REEMPLAZADO, YA_CARGADO = "nuevo", "reemplazado", "ya_cargado"


@dataclass(frozen=True)
class MesDeLaCarga:
    periodo: str
    filas: int
    estado: str  # NUEVO · REEMPLAZADO · YA_CARGADO
    filas_anteriores: int | None = None  # las que tenía el mes, si se reemplazó


@dataclass
class ResultadoCarga:
    lote_id: int | None  # None si no había nada nuevo que cargar
    nombre_archivo: str
    filas_archivo: int
    filas_cargadas: int
    filas_fuera_de_rango: int = 0
    filas_sin_fecha: int = 0
    meses: list[MesDeLaCarga] = field(default_factory=list)


# ------------------------------------------------------------- lo compartido


def huella_de(ruta: Path) -> tuple[str, int]:
    """SHA-256 y tamaño, leyendo por trozos: el consolidado no cabe cómodo en memoria."""
    h, tamano = hashlib.sha256(), 0
    with open(ruta, "rb") as archivo:
        while trozo := archivo.read(1024 * 1024):
            h.update(trozo)
            tamano += len(trozo)
    return h.hexdigest(), tamano


def _fuente(bd: Session, codigo: str) -> Fuente:
    fuente = bd.scalar(select(Fuente).where(Fuente.codigo == codigo, vigente(Fuente)))
    if fuente is None:
        raise CargaRechazada(f"La base no tiene la fuente «{codigo}»: ¿está instalado servidor/api/bd/desempeno/01_esquema.sql?")
    return fuente


def meses_vigentes(bd: Session, fuente_id: int) -> dict[str, tuple[LoteMes, LoteCarga]]:
    """La carga vigente de cada mes de una fuente, por periodo `AAAA-MM`."""
    filas = bd.execute(
        select(LoteMes, LoteCarga)
        .join(LoteCarga, LoteCarga.id == LoteMes.lote_carga_id)
        .where(LoteMes.fuente_id == fuente_id, LoteMes.es_vigente, vigente(LoteMes), vigente(LoteCarga))
    ).all()
    return {f"{m.anio:04d}-{m.mes:02d}": (m, lote) for m, lote in filas}


def _decidir(vigentes: dict[str, tuple[LoteMes, LoteCarga]], por_mes: dict[str, int], *, huella: str, extraccion: datetime | None, forzar: bool) -> list[MesDeLaCarga]:
    """Qué pasa con cada mes del archivo. Se decide todo antes de escribir, y si
    algo impide la carga se dicen todos los motivos juntos."""
    meses: list[MesDeLaCarga] = []
    motivos: list[str] = []
    for periodo in sorted(por_mes):
        actual = vigentes.get(periodo)
        if actual is None:
            meses.append(MesDeLaCarga(periodo, por_mes[periodo], NUEVO))
        elif actual[1].huella_sha256 == huella:
            meses.append(MesDeLaCarga(periodo, actual[0].filas, YA_CARGADO))
        else:
            mes, lote = actual
            if not forzar:
                motivos += reglas.motivos_para_no_reemplazar(
                    MesCargado(mes.anio, mes.mes, mes.filas, lote.nombre_archivo, lote.fecha_extraccion), filas=por_mes[periodo], fecha_extraccion=extraccion
                )
            meses.append(MesDeLaCarga(periodo, por_mes[periodo], REEMPLAZADO, filas_anteriores=mes.filas))
    if motivos:
        raise CargaRechazada(*motivos, NO_SE_CARGO)
    return meses


def _abrir_lote(
    bd: Session, fuente: Fuente, ruta: Path, *, huella: str, tamano: int, extraccion: datetime | None, columnas: list[str], filas_archivo: int,
    por_cargar: list[MesDeLaCarga], desde_dia: date, hasta_dia: date, vigentes: dict[str, tuple[LoteMes, LoteCarga]], tabla_de_filas: type,
    usuario_id: int | None, observacion: str | None = None,
) -> tuple[LoteCarga, dict[str, int]]:
    """Registra el lote y sus meses, y vacía los meses que se reemplazan. Devuelve
    el lote y el `lote_mes_id` de cada periodo, listo para copiar sus filas."""
    cargadas = sum(m.filas for m in por_cargar)
    lote = bd.scalar(select(LoteCarga).where(LoteCarga.fuente_id == fuente.id, LoteCarga.huella_sha256 == huella, vigente(LoteCarga)))
    if lote is None:
        lote = LoteCarga(
            fuente_id=fuente.id, nombre_archivo=ruta.name, huella_sha256=huella, tamano_bytes=tamano, fecha_extraccion=extraccion,
            cobertura_desde=desde_dia, cobertura_hasta=hasta_dia, filas_archivo=filas_archivo, filas_cargadas=cargadas,
            filas_omitidas=filas_archivo - cargadas, columnas=columnas, usuario_carga_id=usuario_id, observacion=observacion,
        )
        bd.add(lote)
    else:
        # El mismo archivo, con más meses que la vez anterior: es el mismo lote.
        lote.filas_cargadas += cargadas
        lote.filas_omitidas = lote.filas_archivo - lote.filas_cargadas
        lote.cobertura_desde = min(desde_dia, lote.cobertura_desde or desde_dia)
        lote.cobertura_hasta = max(hasta_dia, lote.cobertura_hasta or hasta_dia)
    bd.flush()

    lote_mes_de: dict[str, int] = {}
    for m in por_cargar:
        if m.estado == REEMPLAZADO:
            anterior = vigentes[m.periodo][0]
            bd.execute(delete(tabla_de_filas).where(tabla_de_filas.lote_mes_id == anterior.id))
            anterior.es_vigente = False
            bd.flush()  # antes de insertar el nuevo: el índice admite un solo vigente
        anio, mes = int(m.periodo[:4]), int(m.periodo[5:])
        # El mismo archivo, de un mes que se retiró: vuelve su misma fila (un
        # lote tiene una sola por mes), no nace otra.
        nuevo = bd.scalar(select(LoteMes).where(LoteMes.lote_carga_id == lote.id, LoteMes.anio == anio, LoteMes.mes == mes, vigente(LoteMes)))
        if nuevo is None:
            nuevo = LoteMes(lote_carga_id=lote.id, fuente_id=fuente.id, anio=anio, mes=mes, filas=m.filas)
            bd.add(nuevo)
        else:
            nuevo.es_vigente, nuevo.filas = True, m.filas
        bd.flush()
        lote_mes_de[m.periodo] = nuevo.id
    return lote, lote_mes_de


# ================================================================== HIS MINSA


def _fecha_iso(valor: str) -> date | None:
    """La fecha de atención viene `AAAA-MM-DD`, a veces con la hora detrás."""
    try:
        return date.fromisoformat(valor.strip()[:10])
    except ValueError:
        return None


def leer_his(ruta: Path) -> Iterator[tuple[int, date | None, list[str]]]:
    """Las filas de una trama del HIS: (línea en el archivo, fecha de atención, valores).

    Comprueba la cabecera antes de dar la primera fila y el número de columnas en
    cada una: una trama con otra forma no se carga «hasta donde se pueda»."""
    with open(ruta, encoding="utf-8-sig", newline="") as archivo:
        lector = csv.reader(archivo)
        cabecera = [c.strip().lower() for c in next(lector, [])]
        if tuple(cabecera) != COLUMNAS_HIS:
            faltan = [c for c in COLUMNAS_HIS if c not in cabecera]
            sobran = [c for c in cabecera if c not in COLUMNAS_HIS]
            detalle = "; ".join(
                parte for parte in (f"faltan: {', '.join(faltan)}" if faltan else "", f"no se esperaban: {', '.join(sobran)}" if sobran else "") if parte
            )
            raise CargaRechazada(f"«{ruta.name}» no tiene las 57 columnas de la trama del HIS, en su orden ({detalle or 'están en otro orden'}).")
        for fila in lector:
            if len(fila) != len(COLUMNAS_HIS):
                raise CargaRechazada(f"«{ruta.name}», línea {lector.line_num}: tiene {len(fila)} columnas y deben ser {len(COLUMNAS_HIS)}.")
            yield lector.line_num, _fecha_iso(fila[_POSICION_FECHA]), fila


def _copiar_his(bd: Session, ruta: Path, lote_mes_de: dict[str, int]) -> None:
    """Copia a `his_atencion` las filas de los meses de `lote_mes_de`. Por COPY:
    340 mil INSERT de 59 parámetros serían minutos; esto son segundos."""
    bd.flush()
    conexion = bd.connection().connection.driver_connection
    with conexion.cursor() as cursor, cursor.copy(_COPIAR_HIS) as copia:
        for linea, fecha, fila in leer_his(ruta):
            lote_mes_id = lote_mes_de.get(reglas.periodo_de(fecha)) if fecha else None
            if lote_mes_id is None:
                continue
            # Una casilla vacía se guarda nula; la fecha de atención, como fecha.
            valores = [v if v != "" else None for v in fila]
            valores[_POSICION_FECHA] = fecha
            copia.write_row((lote_mes_id, linea, *valores))


def cargar_his(bd: Session, ruta: Path, *, desde: str | None = None, hasta: str | None = None, usuario_id: int | None = None, forzar: bool = False) -> ResultadoCarga:
    """Carga una trama del HIS MINSA: los meses de `desde` a `hasta` (`AAAA-MM`),
    o todos los que traiga.

    - Un mes que ya está cargado **desde este mismo archivo** se deja como está.
      Volver a correr la misma orden no cambia nada; pedir un rango más amplio
      del mismo archivo agrega solo los meses que faltaban, al mismo lote.
    - Un mes cargado desde **otro** archivo se reemplaza entero, salvo que este
      parezca peor (`reglas.motivos_para_no_reemplazar`): entonces se rechaza
      toda la carga, y `forzar` es la forma de decir «sé lo que hago».
    """
    if not ruta.is_file():
        raise CargaRechazada(f"No existe el archivo «{ruta}».")
    fuente = _fuente(bd, FUENTE_HIS)

    # Primera lectura: solo contar.
    por_mes: Counter[str] = Counter()
    filas_archivo = fuera_de_rango = sin_fecha = 0
    primera: dict[str, date] = {}
    ultima: dict[str, date] = {}
    # Una fecha de registro futura o ilegible es un error de digitación: no cuenta.
    hoy = datetime.now(ZONA).date()
    ultimo_registro, tope = "", hoy.isoformat()
    for _linea, fecha, fila in leer_his(ruta):
        filas_archivo += 1
        for posicion in _POSICIONES_DE_REGISTRO:
            if ultimo_registro < (dia := fila[posicion][:10]) <= tope:
                ultimo_registro = dia
        if fecha is None:
            sin_fecha += 1
            continue
        periodo = reglas.periodo_de(fecha)
        if not reglas.en_rango(periodo, desde, hasta):
            fuera_de_rango += 1
            continue
        por_mes[periodo] += 1
        primera[periodo] = min(fecha, primera.get(periodo, fecha))
        ultima[periodo] = max(fecha, ultima.get(periodo, fecha))
    if not por_mes:
        raise CargaRechazada(f"«{ruta.name}» no trae ninguna fila entre {desde or 'el inicio'} y {hasta or 'el final'} ({filas_archivo} filas leídas).")

    huella, tamano = huella_de(ruta)
    extraccion = reglas.fecha_de_extraccion(ruta.name)
    observaciones = [f"{sin_fecha} filas sin fecha de atención legible: no se cargaron."] if sin_fecha else []
    if extraccion is None:
        # El nombre no la trae (un corte del consolidado, un archivo renombrado):
        # la acota el contenido. No es la fecha exacta, es la más temprana posible.
        extraccion = reglas.extraccion_por_contenido(_fecha_iso(ultimo_registro), hoy=hoy)
        if extraccion is not None:
            observaciones.append(f"El nombre no trae la fecha de descarga: se tomó la del último registro del archivo ({extraccion:%d/%m/%Y}).")
    vigentes = meses_vigentes(bd, fuente.id)
    meses = _decidir(vigentes, por_mes, huella=huella, extraccion=extraccion, forzar=forzar)

    por_cargar = [m for m in meses if m.estado != YA_CARGADO]
    resultado = ResultadoCarga(None, ruta.name, filas_archivo, sum(m.filas for m in por_cargar), fuera_de_rango, sin_fecha, meses)
    if not por_cargar:
        return resultado

    lote, lote_mes_de = _abrir_lote(
        bd, fuente, ruta, huella=huella, tamano=tamano, extraccion=extraccion, columnas=list(COLUMNAS_HIS), filas_archivo=filas_archivo,
        por_cargar=por_cargar, desde_dia=min(primera[m.periodo] for m in por_cargar), hasta_dia=max(ultima[m.periodo] for m in por_cargar),
        vigentes=vigentes, tabla_de_filas=HisAtencion, usuario_id=usuario_id,
        observacion=" ".join(observaciones) or None,
    )
    _copiar_his(bd, ruta, lote_mes_de)
    resultado.lote_id = lote.id
    return resultado


# ======================================================= SINADEF del hospital

# El reporte «reporteMinsaCdefDiarioMensual»: el título en la fila 1, los grupos
# de columnas en la 2, la cabecera en la 3 y un certificado por fila después.
# La última fila no es un certificado: es el pie, con la fecha y hora en que se
# generó el reporte (que aquí hace de fecha de extracción).
_FILA_TITULO, _FILA_CABECERA = 0, 2
_TITULO_SINADEF = re.compile(r"REGISTRADOS EL (\d{2}/\d{2}/\d{4}) HASTA EL (\d{2}/\d{2}/\d{4})")

# Las seis columnas del cruce oficial. Varias se repiten en el reporte (para el
# fallecido, el profesional y el registrador): vale la PRIMERA aparición, que es
# como las toma el script de la Ficha 14.
_COLUMNAS_SINADEF = ("TIPO CDEF", "ESTADO", "TIPO DOC", "DOCUMENTO", "FECHA", "FECHA REGISTRO")


def _fecha_ddmmaaaa(valor: Any) -> date | None:
    try:
        return datetime.strptime(str(valor).strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


@dataclass(frozen=True)
class ReporteSinadef:
    desde: date
    hasta: date
    generado: datetime | None
    columnas: list[str]
    certificados: list[tuple[int, list[Any]]]  # (fila en el archivo, contada desde 1; valores)
    posicion: dict[str, int]


def leer_sinadef(ruta: Path) -> ReporteSinadef:
    """Un reporte mensual de SINADEF, entero: son decenas de filas, no miles."""
    try:
        libro = xlrd.open_workbook(str(ruta))
    except (xlrd.XLRDError, OSError) as e:
        raise CargaRechazada(f"«{ruta.name}» no se pudo abrir como .xls: {e}") from e
    hoja = libro.sheet_by_index(0)
    if hoja.nrows <= _FILA_CABECERA:
        raise CargaRechazada(f"«{ruta.name}» no tiene la forma del reporte de SINADEF (le faltan filas).")

    titulo = _TITULO_SINADEF.search(str(hoja.cell_value(_FILA_TITULO, 0)))
    desde, hasta = (_fecha_ddmmaaaa(titulo.group(i)) for i in (1, 2)) if titulo else (None, None)
    if desde is None or hasta is None:
        raise CargaRechazada(f"«{ruta.name}»: el título no dice qué fechas cubre («REGISTRADOS EL … HASTA EL …»).")
    if (desde.year, desde.month) != (hasta.year, hasta.month):
        raise CargaRechazada(f"«{ruta.name}» cubre del {desde:%d/%m/%Y} al {hasta:%d/%m/%Y}: se carga un reporte por mes, no uno que cruce meses.")

    columnas = [str(c).strip() for c in hoja.row_values(_FILA_CABECERA)]
    posicion: dict[str, int] = {}
    for i, nombre in enumerate(columnas):
        posicion.setdefault(nombre, i)
    faltan = [c for c in _COLUMNAS_SINADEF if c not in posicion]
    if faltan:
        raise CargaRechazada(f"«{ruta.name}» no tiene las columnas {', '.join(faltan)} del reporte de SINADEF.")

    filas = [(r + 1, hoja.row_values(r)) for r in range(_FILA_CABECERA + 1, hoja.nrows)]
    generado = None
    if filas and not str(filas[-1][1][posicion["TIPO CDEF"]]).strip():
        pie = filas.pop()[1][0]
        if isinstance(pie, float):
            try:
                generado = xlrd.xldate_as_datetime(pie, libro.datemode).replace(tzinfo=ZONA)
            except (xlrd.XLDateError, OverflowError):
                generado = None
    return ReporteSinadef(desde, hasta, generado, columnas, filas, posicion)


def _texto(valor: Any) -> str | None:
    """Como lo lee el script: Excel entrega algunos documentos como número («12345678.0»)."""
    texto = str(valor).strip().removesuffix(".0")
    return texto or None


def cargar_sinadef(bd: Session, ruta: Path, *, usuario_id: int | None = None, forzar: bool = False) -> ResultadoCarga:
    """Carga un reporte mensual de SINADEF. Guarda **todos** los certificados,
    también los anulados y los que no traen DNI: el filtro del cruce oficial se
    aplica al calcular, no al cargar.

    El mes es el del reporte (certificados registrados entre las fechas de su
    título). Las mismas reglas que el HIS: no duplica y no pisa a ciegas."""
    if not ruta.is_file():
        raise CargaRechazada(f"No existe el archivo «{ruta}».")
    fuente = _fuente(bd, FUENTE_SINADEF)
    reporte = leer_sinadef(ruta)
    periodo = reglas.periodo_de(reporte.desde)
    filas_archivo = len(reporte.certificados)

    huella, tamano = huella_de(ruta)
    vigentes = meses_vigentes(bd, fuente.id)
    meses = _decidir(vigentes, {periodo: filas_archivo}, huella=huella, extraccion=reporte.generado, forzar=forzar)
    por_cargar = [m for m in meses if m.estado != YA_CARGADO]
    resultado = ResultadoCarga(None, ruta.name, filas_archivo, sum(m.filas for m in por_cargar), meses=meses)
    if not por_cargar:
        return resultado

    lote, lote_mes_de = _abrir_lote(
        bd, fuente, ruta, huella=huella, tamano=tamano, extraccion=reporte.generado, columnas=reporte.columnas, filas_archivo=filas_archivo,
        por_cargar=por_cargar, desde_dia=reporte.desde, hasta_dia=reporte.hasta, vigentes=vigentes, tabla_de_filas=SinadefDefuncion, usuario_id=usuario_id,
    )
    p = reporte.posicion
    if reporte.certificados:
        bd.execute(
            insert(SinadefDefuncion),
            [
                {
                    "lote_mes_id": lote_mes_de[periodo], "fila_archivo": numero, "tipo_cdef": _texto(v[p["TIPO CDEF"]]), "estado": _texto(v[p["ESTADO"]]),
                    "tipo_documento": _texto(v[p["TIPO DOC"]]), "numero_documento": _texto(v[p["DOCUMENTO"]]),
                    "fecha_defuncion": _fecha_ddmmaaaa(v[p["FECHA"]]), "fecha_registro": _fecha_ddmmaaaa(v[p["FECHA REGISTRO"]]), "fila_original": v,
                }
                for numero, v in reporte.certificados
            ],
        )
    resultado.lote_id = lote.id
    return resultado


# ============================================ defunciones verificadas a mano

_COLUMNAS_VERIFICADOS = ("numero_documento", "fecha_defuncion", "fecha_registro")


@dataclass
class ResultadoVerificados:
    nombre_archivo: str
    filas_archivo: int
    nuevas: int
    actualizadas: int
    sin_cambio: int


def _fecha_opcional(valor: str | None, que: str, donde: str) -> date | None:
    texto = (valor or "").strip()
    if not texto:
        return None
    try:
        return date.fromisoformat(texto)
    except ValueError:
        raise CargaRechazada(f"{donde}: la {que} «{texto}» no es una fecha AAAA-MM-DD.") from None


def cargar_verificados(bd: Session, ruta: Path, *, usuario_id: int | None = None) -> ResultadoVerificados:
    """Carga el CSV de defunciones verificadas una por una en SINADEF nacional
    (`numero_documento`, `fecha_defuncion`, `fecha_registro`; `fuente` y
    `fecha_verificacion` si vienen).

    Una persona, una fila: si el documento ya está, se actualiza con lo del
    archivo. Una fila inválida detiene la carga entera, igual que en el script:
    aquí cada fila decide si un paciente sale de un denominador."""
    if not ruta.is_file():
        raise CargaRechazada(f"No existe el archivo «{ruta}».")
    fuente = _fuente(bd, FUENTE_VERIFICADOS)
    with open(ruta, encoding="utf-8-sig", newline="") as archivo:
        lector = csv.DictReader(archivo)
        columnas = [c.strip() for c in (lector.fieldnames or [])]
        faltan = [c for c in _COLUMNAS_VERIFICADOS if c not in columnas]
        if faltan:
            raise CargaRechazada(f"«{ruta.name}» no tiene las columnas {', '.join(faltan)}.")
        filas = []
        for fila in lector:
            donde = f"«{ruta.name}», línea {lector.line_num}"
            documento = (fila.get("numero_documento") or "").strip()
            if re.fullmatch(r"[0-9]{8}", documento) is None:
                raise CargaRechazada(f"{donde}: el número de documento no son 8 dígitos.")
            defuncion = _fecha_opcional(fila.get("fecha_defuncion"), "fecha de defunción", donde)
            if defuncion is None:
                raise CargaRechazada(f"{donde}: falta la fecha de defunción.")
            filas.append({
                "numero_documento": documento, "fecha_defuncion": defuncion,
                "fecha_registro": _fecha_opcional(fila.get("fecha_registro"), "fecha de registro", donde),
                "origen": (fila.get("fuente") or "").strip() or None,
                "fecha_verificacion": _fecha_opcional(fila.get("fecha_verificacion"), "fecha de verificación", donde),
            })

    huella, tamano = huella_de(ruta)
    lote = bd.scalar(select(LoteCarga).where(LoteCarga.fuente_id == fuente.id, LoteCarga.huella_sha256 == huella, vigente(LoteCarga)))
    resultado = ResultadoVerificados(ruta.name, len(filas), 0, 0, 0)
    for datos in filas:
        actual = bd.scalar(select(DefuncionVerificada).where(DefuncionVerificada.numero_documento == datos["numero_documento"], vigente(DefuncionVerificada)))
        if actual is None:
            resultado.nuevas += 1
        elif any(getattr(actual, campo) != valor for campo, valor in datos.items()):
            resultado.actualizadas += 1
        else:
            resultado.sin_cambio += 1
            continue
        if lote is None:
            # Recién aquí: un archivo que no cambia nada no deja un lote vacío.
            lote = LoteCarga(
                fuente_id=fuente.id, nombre_archivo=ruta.name, huella_sha256=huella, tamano_bytes=tamano, filas_archivo=len(filas),
                filas_cargadas=len(filas), columnas=columnas, usuario_carga_id=usuario_id,
            )
            bd.add(lote)
            bd.flush()
        if actual is None:
            bd.add(DefuncionVerificada(lote_carga_id=lote.id, **datos))
        else:
            for campo, valor in datos.items():
                setattr(actual, campo, valor)
            actual.lote_carga_id = lote.id
        bd.flush()
    return resultado


# ============================================================ qué hay cargado


@dataclass(frozen=True)
class MesDeUnaFuente:
    fuente: str
    periodo: str
    filas: int
    nombre_archivo: str
    fecha_extraccion: datetime | None
    fecha_carga: datetime
    usuario: str | None
    lote_id: int


def estado_de_fuentes(bd: Session) -> list[MesDeUnaFuente]:
    """La carga vigente de cada mes de cada fuente, por fuente y mes. Es la
    respuesta a «¿hasta qué mes está cargado?» y a «¿de qué archivo salió?»."""
    filas = bd.execute(
        select(Fuente.codigo, LoteMes.anio, LoteMes.mes, LoteMes.filas, LoteCarga.nombre_archivo, LoteCarga.fecha_extraccion, LoteMes.fecha_creacion, Usuario.nombre_usuario, LoteCarga.id)
        .join(LoteCarga, LoteCarga.id == LoteMes.lote_carga_id)
        .join(Fuente, Fuente.id == LoteMes.fuente_id)
        .outerjoin(Usuario, Usuario.id == LoteCarga.usuario_carga_id)
        .where(LoteMes.es_vigente, vigente(LoteMes), vigente(LoteCarga))
        .order_by(Fuente.codigo, LoteMes.anio, LoteMes.mes)
    ).all()
    return [MesDeUnaFuente(f, f"{a:04d}-{m:02d}", n, archivo, extraccion, carga, usuario, lote) for f, a, m, n, archivo, extraccion, carga, usuario, lote in filas]
