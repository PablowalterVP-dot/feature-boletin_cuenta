"""La carga del archivo del área (el Excel, o el Word de Farmacia): guarda el archivo, llama al bot y persiste el resultado.

Sigue al pie de la letra la transacción que especifica `INFORME_AVANCE_04.md` § 4:
archivo y reporte primero; si el bot bloquea, solo la carga; si acepta, la carga
más las casillas, los totales declarados y los hallazgos, con `app.carga_id`
fijado para que la bitácora resuma en una fila por tabla en vez de una por
casilla. Un solo `commit()`, hecho por el endpoint — igual que `transicionar`.

Tres traducciones del informe del bot que no son obvias mirándolo por encima:

- **La clave de un hallazgo no siempre es única.** Los avisos e info ya traen un
  `id` compuesto (`atipico|f3|liquida.cena|21`); los errores traen como `id` el
  código de la regla, **repetido en cada celda mala** (`no-numerico` dos veces
  si hay dos celdas ilegibles). La base exige `clave_hallazgo` único por carga:
  para un error se arma como `{regla}|{formato}|{fila}|{dia}`.
- **El código de la regla vive en `regla` o en `id`**, según el nivel: en
  avisos/info está en `regla`; en errores, `id` **es** el código.
- **La celda de origen es por fila, no por día.** `origen` da la celda donde
  empieza cada fila; la de un día concreto se calcula sumando columnas
  (`servicios/bot.celda_de_origen`, réplica de `celdaDeOrigen()` del bot).

Y tres decisiones del 28/09/2026:

- **Se recorren los cuadros de la versión, no las claves del informe.** Si el bot
  agrega otra clave a `datos`, no se toma por un cuadro. Una fila que la versión no
  conoce es una inconsistencia real (`VersionInconsistente`), no un 500.
- **Una justificación se conserva** si el Excel nuevo vuelve a disparar el mismo
  aviso (misma clave): quien la escribió no tiene que repetirla.
- **Se manda el mes anterior** (si ya se entregó), para la regla de variación.
"""

import hashlib
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.datos import cargas as repo_cargas
from app.datos import reportes as repo
from app.datos.base import vigente
from app.datos.modelos import Archivo, Carga, FormatoVersion, Periodo, Reporte, ReporteHistorialEstado
from app.dominio import estados, permisos
from app.dominio.transiciones import CREAR, ArchivoDemasiadoGrande, ReporteNoEditable, SinVersionActiva, VersionInconsistente, nota_de_historial
from app.servicios.bot import celda_de_origen, validar_archivo
from app.servicios.errores import BotNoDisponible, SinPermiso
from app.servicios.acceso import buscar_formato_y_unidad, buscar_periodo

TAMANO_MAXIMO = 5 * 1024 * 1024  # igual que el bot: una plantilla llena pesa unos 80 kB

# Cuatro áreas suben Word; las demás, un Excel. El archivo se guarda con su
# extensión y su tipo, para poder abrirlo después tal como vino. El Word
# 97-2003 (.doc) también: Nefrología solo tiene su cuadro así (07/11/2026) y el
# bot lo lee igual (bot-validador/src/doc.js).
TIPOS = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
}


@dataclass(frozen=True)
class ResultadoCarga:
    resultado: str  # aceptada, bloqueada
    informe: dict  # el informe del bot, tal cual: lo arma el bot, no este servicio


def _guardar_archivo(bd: Session, contenido: bytes, nombre_original: str, ruta_base: Path, *, periodo: str, sigla: str) -> Archivo:
    """En `{periodo}/{sigla}/{huella}.xlsx` (o `.docx`, el informe de Farmacia): se
    encuentra por el mes reportado y el área, no por el día en que se subió. El
    nombre es la huella, así que subir dos veces el mismo archivo no lo duplica en
    disco (sí en `reporte.archivo`, que registra cada entrega)."""
    huella = hashlib.sha256(contenido).hexdigest()
    extension = Path(nombre_original).suffix.lower()
    if extension not in TIPOS:
        extension = ".xlsx"
    carpeta = ruta_base / periodo / sigla
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / f"{huella}{extension}"
    if not destino.exists():
        destino.write_bytes(contenido)
    archivo = Archivo(
        nombre_original=nombre_original,
        ruta_almacenamiento=str(destino.relative_to(ruta_base)),
        tipo_mime=TIPOS[extension],
        tamano_bytes=len(contenido),
        huella_sha256=huella,
        proposito="carga",
    )
    bd.add(archivo)
    bd.flush()
    return archivo


def _regla_de_hallazgo(h: dict) -> str:
    """En avisos/info, el código de la regla está en `regla`; en errores, `id` **es**
    el código (y se repite en cada ocurrencia: no sirve como clave)."""
    return h.get("regla", h["id"])


def _clave_hallazgo(h: dict, regla_codigo: str) -> str:
    if "regla" in h:  # avisos/info: el id del bot ya es único
        return h["id"]
    return f"{regla_codigo}|{h.get('formato', '')}|{h.get('fila', '')}|{h.get('dia', '')}"


def _filas_hallazgo(
    informe: dict, carga_id: int, cuadro_id: dict[str, int], indicador_id: dict[str, int], regla_id: dict[str, int],
    previas: dict[str, repo_cargas.JustificacionPrevia],
) -> list[dict]:
    filas = []
    for nivel, lista in (("error", informe["errores"]), ("aviso", informe["avisos"]), ("info", informe["info"])):
        for h in lista:
            regla_codigo = _regla_de_hallazgo(h)
            formato_h, fila_h = h.get("formato"), h.get("fila")
            clave = _clave_hallazgo(h, regla_codigo)
            previa = previas.get(clave) if nivel == "aviso" else None
            filas.append({
                "carga_id": carga_id,
                "regla_validacion_id": regla_id.get(regla_codigo),
                "nivel": nivel,
                "clave_hallazgo": clave,
                "cuadro_id": cuadro_id.get(formato_h),
                "indicador_id": indicador_id.get(f"{formato_h}.{fila_h}") if formato_h and fila_h else None,
                "dia": h.get("dia"),
                "titulo": h["titulo"],
                "detalle": h.get("detalle"),
                "justificacion": previa.texto if previa else None,
                "fecha_justificacion": previa.fecha if previa else None,
                "usuario_justificacion_id": previa.usuario_id if previa else None,
            })
    return filas


def _id_de_indicador(indicador_id: dict[str, int], cuadro_codigo: str, fila_clave: str) -> int:
    codigo = f"{cuadro_codigo}.{fila_clave}"
    if codigo not in indicador_id:
        raise VersionInconsistente(
            f"El bot leyó la fila «{codigo}», que la estructura reconocida no tiene. El bot y la base describen versiones distintas.",
            indicador=codigo,
        )
    return indicador_id[codigo]


def _aplanar(cuadro: dict, prefijo: str = "") -> dict:
    """Las filas de un cuadro como `{fila: dato}`. Farmacia las entrega anidadas
    (`{"sis": {"hosp": 9264}}`) y su indicador es `f1.sis.hosp`: se unen con
    punto. Lo que ya es una cifra o una lista de días (Nutrición, Laboratorio)
    queda igual."""
    filas = {}
    for clave, valor in cuadro.items():
        if isinstance(valor, dict):
            filas.update(_aplanar(valor, f"{prefijo}{clave}."))
        else:
            filas[f"{prefijo}{clave}"] = valor
    return filas


def _filas_valor(informe: dict, reporte_id: int, carga_id: int, cuadros: list[str], indicador_id: dict[str, int], *, mensual: bool = False) -> list[dict]:
    """Una fila de `valor` por casilla. En un formato diario, `datos[cuadro][fila]`
    es la lista de los días; en uno mensual (Laboratorio), es la cifra del mes, y
    la casilla va sin día (la base lo exige así: `fn_validar_valor`). El origen de
    una casilla mensual ya es su celda; el de una diaria es donde empieza la fila."""
    datos = informe["datos"]
    origen = informe.get("origen", {})
    ilegibles = datos.get("ilegibles", {})
    filas = []
    for cuadro_codigo in cuadros:
        for fila_clave, valores in _aplanar(datos.get(cuadro_codigo) or {}).items():
            id_indicador = _id_de_indicador(indicador_id, cuadro_codigo, fila_clave)
            o = origen.get(f"{cuadro_codigo}|{fila_clave}")
            if mensual:
                if isinstance(valores, list):
                    raise VersionInconsistente(
                        f"El formato es mensual, pero el bot leyó la fila «{cuadro_codigo}.{fila_clave}» por días.",
                        indicador=f"{cuadro_codigo}.{fila_clave}",
                    )
                filas.append({
                    "reporte_id": reporte_id,
                    "indicador_id": id_indicador,
                    "dia": None,
                    "valor": valores,
                    "texto_original": ilegibles.get(f"{cuadro_codigo}|{fila_clave}"),
                    "origen": "archivo",
                    "carga_id": carga_id,
                    "hoja_excel": o["hoja"] if o else None,
                    "celda_excel": f"{o['columna']}{o['fila']}" if o else None,
                })
                continue
            for i, valor in enumerate(valores):
                dia = i + 1
                filas.append({
                    "reporte_id": reporte_id,
                    "indicador_id": id_indicador,
                    "dia": dia,
                    "valor": valor,
                    "texto_original": ilegibles.get(f"{cuadro_codigo}|{fila_clave}|{dia}"),
                    "origen": "archivo",
                    "carga_id": carga_id,
                    "hoja_excel": o["hoja"] if o else None,
                    "celda_excel": celda_de_origen(o, dia) if o else None,
                })
    return filas


def _filas_total_declarado(informe: dict, carga_id: int, cuadro_id: dict[str, int], indicador_id: dict[str, int]) -> list[dict]:
    declarados = informe["datos"].get("declarados", {})
    filas = []
    for cuadro_codigo, id_cuadro in cuadro_id.items():
        for fila_clave, valor in (declarados.get(cuadro_codigo) or {}).items():
            filas.append({
                "carga_id": carga_id,
                "cuadro_id": id_cuadro,
                "indicador_id": None if fila_clave == "_total" else _id_de_indicador(indicador_id, cuadro_codigo, fila_clave),
                "valor": valor,
            })
    return filas


def _anterior(bd: Session, formato_id: int, el_periodo: Periodo, codigo_de: dict[int, str], *, mensual: bool = False) -> dict | None:
    """El mes inmediatamente anterior, **solo si ya se entregó** (enviado o después),
    en la forma `{periodo, datos}` que espera el bot. Si no se entregó, o no tiene
    casillas, no se compara: el bot omite la regla de variación sin error. No se busca
    un mes más atrás: comparar con otro que no sea el anterior no es lo que dice la
    regla (decisión del 28/09/2026)."""
    anio, mes = (el_periodo.anio, el_periodo.mes - 1) if el_periodo.mes > 1 else (el_periodo.anio - 1, 12)
    previo = repo.buscar_periodo(bd, anio, mes)
    if previo is None:
        return None
    reporte = bd.scalar(select(Reporte).where(Reporte.formato_id == formato_id, Reporte.periodo_id == previo.id, vigente(Reporte)))
    if reporte is None or not estados.esta_entregado(codigo_de[reporte.estado_reporte_id]):
        return None
    datos = repo_cargas.datos_para_bot(bd, reporte.id, previo.fecha_fin.day, mensual=mensual)
    return {"periodo": f"{anio:04d}-{mes:02d}", "datos": datos} if datos else None


def recibir_carga(bd: Session, sesion, *, formato: str, periodo: str, nombre_archivo: str, contenido: bytes, ruta_cargas: Path, bot_url: str | None, bot_segundos: float) -> ResultadoCarga:
    """Toda la transacción de una carga. No confirma: el endpoint hace un solo
    `commit()` al final (igual que `transicionar`)."""
    el_formato, la_unidad = buscar_formato_y_unidad(bd, formato)
    if not sesion.puede(permisos.REPORTE_CARGAR, la_unidad.clave):
        raise SinPermiso(f"Su cuenta no tiene el permiso «{permisos.REPORTE_CARGAR}» sobre {la_unidad.nombre_corto or la_unidad.nombre}.", permiso=permisos.REPORTE_CARGAR, unidad=la_unidad.clave)
    el_periodo = buscar_periodo(bd, periodo)

    version = repo_cargas.version_activa(bd, el_formato.id)
    if version is None:
        raise SinVersionActiva(f"El formato «{el_formato.codigo}» no tiene ninguna estructura activa: no hay con qué reconocer un archivo.", formato=el_formato.codigo)

    ids_estado = repo.ids_de_estados(bd)
    codigo_de_estado = {v: k for k, v in ids_estado.items()}

    reporte = repo.bloquear_reporte(bd, el_formato.id, el_periodo.id)
    if reporte is None:
        reporte = repo.insertar_reporte_si_no_existe(bd, el_formato.id, el_periodo.id, ids_estado[estados.BORRADOR])
        if reporte is None:  # otra persona lo creó entre medias
            reporte = repo.bloquear_reporte(bd, el_formato.id, el_periodo.id)
        else:
            nota = nota_de_historial(CREAR)
            bd.add(ReporteHistorialEstado(reporte_id=reporte.id, estado_origen_id=None, estado_destino_id=ids_estado[estados.BORRADOR], accion=CREAR, numero_rectificacion=0, comentario=nota))
            bd.flush()

    estado_actual = codigo_de_estado[reporte.estado_reporte_id]
    if not estados.es_editable(estado_actual):
        raise ReporteNoEditable(
            f"El reporte está en «{estado_actual}»: solo se puede subir un archivo mientras se llena o justo después de rectificar.",
            estado=estado_actual,
        )

    if len(contenido) > TAMANO_MAXIMO:
        raise ArchivoDemasiadoGrande(f"El archivo pesa más de {TAMANO_MAXIMO // (1024 * 1024)} MB.", tamano=len(contenido))

    # Antes de escribir nada en disco: sin bot no hay carga, y el archivo quedaría huérfano.
    if bot_url is None:
        raise BotNoDisponible("No hay un bot validador configurado (falta BOT_VALIDADOR_URL).")
    archivo = _guardar_archivo(bd, contenido, nombre_archivo, ruta_cargas, periodo=periodo, sigla=la_unidad.codigo)
    informe = validar_archivo(
        base_url=bot_url, segundos=bot_segundos, area=la_unidad.clave, periodo=periodo, nombre=nombre_archivo,
        contenido=contenido, configuracion=repo_cargas.configuracion_de(bd, version.id),
        anterior=_anterior(bd, el_formato.id, el_periodo, codigo_de_estado, mensual=el_formato.granularidad == "mensual"),
    )

    if "bloqueo" in informe:
        bloqueo = informe["bloqueo"]
        carga = Carga(
            reporte_id=reporte.id, archivo_id=archivo.id, version_bot=informe["bot"]["version"],
            resultado="bloqueada", codigo_bloqueo=bloqueo["id"], detalle_bloqueo=f"{bloqueo['titulo']}. {bloqueo['detalle']}",
            informe_bot=informe,
        )
        bd.add(carga)
        bd.flush()
        return ResultadoCarga("bloqueada", informe)

    version_reconocida = bd.scalar(
        select(FormatoVersion).where(
            FormatoVersion.formato_id == el_formato.id, FormatoVersion.codigo_version == informe["plantilla"]["version"],
            FormatoVersion.estado == "activa", vigente(FormatoVersion),
        )
    )
    if version_reconocida is None:
        raise VersionInconsistente(
            f"El bot reconoció la versión «{informe['plantilla']['version']}», que aquí no existe o no está activa.",
            version=informe["plantilla"]["version"],
        )

    carga = Carga(
        reporte_id=reporte.id, archivo_id=archivo.id, formato_version_id=version_reconocida.id, version_bot=informe["bot"]["version"],
        resultado="aceptada", casillas_leidas=informe["leidas"],
        total_errores=len(informe["errores"]), total_avisos=len(informe["avisos"]), total_info=len(informe["info"]),
        informe_bot=informe, es_vigente=False,
    )
    bd.add(carga)
    bd.flush()

    # fn_validar_valor exige reporte.formato_version_id ya puesto antes de admitir
    # casillas: se actualiza aquí, antes de las inserciones, no al final.
    reporte.formato_version_id = version_reconocida.id
    bd.flush()

    # Se leen antes de reemplazar la carga vigente: las del mismo aviso se conservan.
    previas = repo_cargas.justificaciones_vigentes(bd, reporte.id)

    # Mientras dure, los INSERT/DELETE masivos de valor/total_declarado/hallazgo
    # resumen la bitácora en una fila por tabla en vez de una por casilla.
    bd.execute(text("SELECT set_config('app.carga_id', :id, true)"), {"id": str(carga.id)})
    try:
        cuadro_id = repo_cargas.cuadro_id_por_codigo(bd, version_reconocida.id)
        indicador_id = repo_cargas.indicador_id_por_codigo(bd, el_formato.id)
        regla_id = repo_cargas.regla_id_por_codigo(bd, el_formato.id)

        mensual = el_formato.granularidad == "mensual"
        repo_cargas.reemplazar_valores(bd, reporte.id, _filas_valor(informe, reporte.id, carga.id, list(cuadro_id), indicador_id, mensual=mensual))
        repo_cargas.insertar_totales_declarados(bd, _filas_total_declarado(informe, carga.id, cuadro_id, indicador_id))
        repo_cargas.insertar_hallazgos(bd, _filas_hallazgo(informe, carga.id, cuadro_id, indicador_id, regla_id, previas))

        bd.execute(update(Carga).where(Carga.reporte_id == reporte.id, Carga.es_vigente).values(es_vigente=False))
        carga.es_vigente = True
        bd.flush()
    finally:
        bd.execute(text("SELECT set_config('app.carga_id', '', true)"))

    return ResultadoCarga("aceptada", informe)
