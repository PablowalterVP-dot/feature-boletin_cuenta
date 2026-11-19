"""Carga en el sistema los meses que un área ya reportó en papel, desde sus
Excel originales.

    python -m app.herramientas.cargar_historico "C:/…/ESTADISTICA POR MES  NUTRICION 2026" --hasta 2026-06
    python -m app.herramientas.cargar_historico CARPETA --desde 2026-01 --hasta 2026-06 --corregir "2026-02|PACIENTES HOSP|N16=18"
    python -m app.herramientas.cargar_historico "C:/…/Oficios_Laboratorio.xlsx" --formato LAB --hasta 2026-06

Existe para el arranque del sistema (05/10/2026): Nutrición entregó enero a
setiembre de 2026 por la vía de siempre, y el consolidado anual se arma con los
meses que están en el sistema. Se cargan los meses pedidos (hasta junio: julio,
agosto y setiembre se dejan para probar la carga real).

**Por el mismo camino que una carga real, no por SQL.** Cada mes pasa por el
bot (que lee el Excel oficial y lo valida), y después por las transiciones de
siempre —enviar, que desde el 12/10/2026 ya entrega a la matriz— con la cuenta indicada (`--usuario`, por
omisión el superadmin). Así cada mes queda con su archivo, su informe del bot,
su constancia, su historial y su rastro en la bitácora, como cualquier otro.

- Los **avisos** del bot (un día atípico, una variación) se justifican con el
  texto de carga histórica: nadie los revisó en su momento, y se dice.
- Un **error** del bot detiene ese mes en borrador y lo informa: no se fuerza.
  Salvo con `--documentar-errores` (decisión del 27/10/2026, solo para meses
  que se decidió entregar tal como llegaron): cada error queda justificado con
  `PREFIJO_ERROR_DOCUMENTADO` y su detalle, y el mes se envía. Ninguna cifra
  cambia: el oficio original no cuadra y no dice qué cifra está mal.
- `--corregir` cambia una celda del Excel antes de leerlo (solo en la copia que
  se sube; el archivo original no se toca). Es para errores evidentes, como el
  «18+» de febrero de 2026 (pacientes hospitalizados, líquida, cena, día 12):
  Excel lo ignoraba como texto. Se anota en el historial del reporte.
- Cada reporte lleva la observación «Carga histórica», para que la puntualidad
  del panel del superadministrador no lo cuente: su fecha de envío es la de la
  carga, no la de cuando el área lo entregó en papel.
"""

import argparse
import io
import re
import sys
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import _asignaciones_de
from app.api.dependencias import fijar_auditoria
from app.config import Ajustes, obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import EstadoReporte, Formato, Hallazgo, Periodo, Reporte, Usuario
from app.datos.reportes import carga_aceptada_vigente
from app.dominio import estados, periodos
from app.dominio.transiciones import PREFIJO_ERROR_DOCUMENTADO
from app.dominio.reloj import ZONA, RelojSistema
from app.dominio.sesion import Sesion
from app.servicios import cargas as servicio_cargas
from app.servicios import revision as servicio_revision
from app.servicios import transiciones as servicio_transiciones

OBSERVACION = "Carga histórica"
MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
UNIDAD_DE_FORMATO = {"NUT": "nutricion"}


class NoSePuede(Exception):
    """La carpeta, la cuenta o el formato no existen, o un argumento está mal escrito."""


EXTENSIONES = (".xlsx", ".docx")


def _sin_tildes(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().upper()


def archivo_del_mes(carpeta: Path, periodo: str) -> Path | None:
    """El archivo de un mes en la carpeta del área.

    Primero el nombre exacto, como los nombra Nutrición (`ENERO.xlsx` …
    `SETIEMBRE.xlsx`, acepta SEPTIEMBRE). Si no está, el único archivo cuyo
    nombre dice el mes, como los de Farmacia («01 INFORME MES DE ENERO
    2026.docx»). Si dos lo dicen, es ambiguo y no se adivina. Equivocarse de
    archivo no lo deja en otro mes: el bot comprueba el mes que dice el
    documento.

    Si el origen es un archivo y no una carpeta, es un libro anual con una hoja
    por mes (Laboratorio): el mismo libro sirve para todos los meses y es el bot
    quien elige la hoja del periodo."""
    if carpeta.is_file():
        return carpeta
    mes = MESES[int(periodo[5:]) - 1]
    nombres = (mes, "SEPTIEMBRE") if mes == "SETIEMBRE" else (mes,)
    for nombre in nombres:
        if (carpeta / f"{nombre}.xlsx").exists():
            return carpeta / f"{nombre}.xlsx"
    candidatos = [
        a for a in sorted(carpeta.iterdir())
        if a.is_file() and a.suffix.lower() in EXTENSIONES and not a.name.startswith("~$")
        and any(re.search(rf"\b{n}\b", _sin_tildes(a.stem)) for n in nombres)
    ]
    if len(candidatos) > 1:
        raise NoSePuede(f"Hay más de un archivo de {mes.lower()} en {carpeta}: " + ", ".join(a.name for a in candidatos) + ".")
    return candidatos[0] if candidatos else None


def corregir_celdas(contenido: bytes, correcciones: list[tuple[str, str, float]]) -> bytes:
    """Cambia celdas de un .xlsx en memoria: [(hoja, celda, valor)]. Las fórmulas
    de esas hojas pierden su resultado guardado, para que Excel (y el bot) no
    lean un total calculado sin la corrección: el bot vuelve a sumar los días."""
    if not correcciones:
        return contenido
    origen = zipfile.ZipFile(io.BytesIO(contenido))
    libro = origen.read("xl/workbook.xml").decode("utf-8")
    relaciones = origen.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    destino_de = {m.group(1): m.group(2) for m in re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', relaciones)}
    ruta_de_hoja = {}
    for m in re.finditer(r'<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', libro):
        ruta_de_hoja[" ".join(m.group(1).split()).upper()] = "xl/" + destino_de[m.group(2)].lstrip("/").removeprefix("xl/")
    cambios: dict[str, str] = {}
    for hoja, celda, valor in correcciones:
        ruta = ruta_de_hoja.get(" ".join(hoja.split()).upper())
        if ruta is None:
            raise NoSePuede(f"El Excel no tiene la hoja «{hoja}».")
        xml = cambios.get(ruta) or origen.read(ruta).decode("utf-8")
        patron = re.compile(rf'<c r="{celda}"([^>]*?)(?:/>|>.*?</c>)', re.S)
        if not patron.search(xml):
            raise NoSePuede(f"La hoja «{hoja}» no tiene la celda {celda}.")
        xml = patron.sub(lambda m, celda=celda, valor=valor: _celda_numerica(celda, m.group(1), valor), xml, count=1)
        # La fórmula puede venir completa (<f>…</f>) o compartida (<f t="shared" …/>),
        # como en los Excel reales: en las dos, el resultado guardado se quita.
        xml = re.sub(r"(</f>|<f\b[^>]*/>)<v>[^<]*</v>", r"\1", xml)
        cambios[ruta] = xml
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as z:
        for item in origen.infolist():
            z.writestr(item, cambios[item.filename].encode("utf-8") if item.filename in cambios else origen.read(item.filename))
    return salida.getvalue()


def _celda_numerica(celda: str, atributos: str, valor: float) -> str:
    """La celda como número: sin el tipo (texto compartido, en línea), con su estilo."""
    sin_tipo = re.sub(r' t="[^"]*"', "", atributos)
    return f'<c r="{celda}"{sin_tipo}><v>{valor:g}</v></c>'


def _sesion_de(bd: Session, usuario: Usuario) -> Sesion:
    asignaciones = _asignaciones_de(bd, usuario.id)
    if not asignaciones:
        raise NoSePuede(f"La cuenta «{usuario.nombre_usuario}» no tiene permisos.")
    ahora = datetime.now(ZONA)
    return Sesion(usuario.id, usuario.nombre_usuario, usuario.nombre_completo, asignaciones, False, ahora, ahora)


def _reporte(bd: Session, formato: str, periodo: str) -> Reporte | None:
    anio, mes = (int(x) for x in periodo.split("-"))
    return bd.scalar(
        select(Reporte).join(Formato, Formato.id == Reporte.formato_id).join(Periodo, Periodo.id == Reporte.periodo_id)
        .where(Formato.codigo == formato, Periodo.anio == anio, Periodo.mes == mes, vigente(Reporte))
    )


def cargar_mes(
    bd: Session, ajustes: Ajustes, sesion: Sesion, *, formato: str, periodo: str, archivo: Path, correcciones=(),
    nota: str | None = None, justificaciones: dict[str, str] | None = None, enviar: bool = True, nombre: str | None = None,
    documentar_errores: bool = False,
) -> str:
    """Carga un mes hasta remitirlo. Devuelve qué pasó, en una línea. No confirma.

    `importar_reportes` la reusa para traer un mes de otra base: con su propia
    `nota` (que empieza igual, «Carga histórica», para que la puntualidad no lo
    cuente), las `justificaciones` que ya tenía allá por clave de aviso, sin
    `enviar` si allá solo estaba en borrador, y con el `nombre` original del
    archivo (en el paquete se guarda por su huella)."""
    existente = _reporte(bd, formato, periodo)
    if existente is not None:
        estado = bd.scalar(select(EstadoReporte.codigo).where(EstadoReporte.id == existente.estado_reporte_id))
        if not estados.es_editable(estado):
            return f"{periodo}: ya está en el sistema («{estado}»), no se toca (reporte {existente.id})."

    reloj = RelojSistema()
    contenido = corregir_celdas(archivo.read_bytes(), list(correcciones))
    resultado = servicio_cargas.recibir_carga(
        bd, sesion, formato=formato, periodo=periodo, nombre_archivo=nombre or archivo.name, contenido=contenido,
        ruta_cargas=ajustes.carpeta_cargas, bot_url=ajustes.bot_validador_url, bot_segundos=ajustes.bot_validador_segundos,
    )
    if resultado.resultado != "aceptada":
        return f"{periodo}: el bot no aceptó el archivo — {resultado.informe.get('bloqueo', {}).get('titulo')}"

    revision = servicio_revision.revision_de(bd, sesion, formato=formato, periodo=periodo)
    errores = [h for h in revision.hallazgos if h.nivel == "error"]
    if errores and not documentar_errores:
        return f"{periodo}: queda en borrador, el bot encontró errores — " + "; ".join(h.titulo for h in errores)
    if errores:
        # La API no deja justificar un error: se escribe aquí, como operador.
        carga = carga_aceptada_vigente(bd, _reporte(bd, formato, periodo))
        claves = {h.clave: h for h in errores}
        for fila in bd.scalars(select(Hallazgo).where(Hallazgo.carga_id == carga.id, Hallazgo.nivel == "error", vigente(Hallazgo))):
            h = claves.get(fila.clave_hallazgo)
            if h is None:
                continue
            fila.justificacion = f"{PREFIJO_ERROR_DOCUMENTADO} {h.titulo}. Se entrega con las cifras del original (decisión de Estadística del 27/10/2026)."
            fila.fecha_justificacion = datetime.now(ZONA)
            fila.usuario_justificacion_id = sesion.usuario_id
        bd.flush()
    mes = periodos.etiqueta(periodo)
    previas = justificaciones or {}
    for h in revision.hallazgos:
        if h.nivel == "aviso" and not h.justificacion:
            servicio_revision.justificar(
                bd, sesion, reloj, formato=formato, periodo=periodo, clave=h.clave,
                texto=previas.get(h.clave) or f"Carga histórica: cifra del Excel original del área de {mes}, tal como se entregó; no se revisó en el sistema en su momento.",
            )
    if not enviar:
        return f"{periodo}: cargado en borrador, como estaba en la base de origen ({resultado.informe.get('leidas')} casillas leídas)."

    if nota is None:
        nota = f"{OBSERVACION} desde el Excel original del área ({archivo.name})."
        if correcciones:
            nota += " Corregido antes de leerlo: " + ", ".join(f"{h} {c} = {v:g}" for h, c, v in correcciones) + "."
        if errores:
            nota += f" Se entrega con {len(errores)} {'inconsistencia' if len(errores) == 1 else 'inconsistencias'} del original, documentada{'s' if len(errores) > 1 else ''} y sin corregir."
    # Desde el 12/10/2026, enviar ya entrega a las oficinas de la matriz: no hay validar ni remitir.
    servicio_transiciones.transicionar(bd, sesion, reloj, formato=formato, periodo=periodo, accion="enviar", comentario=nota)

    reporte = _reporte(bd, formato, periodo)
    reporte.observacion = nota
    bd.flush()
    extra = (", con corrección" if correcciones else "") + (f", {len(errores)} errores documentados" if errores else "")
    return f"{periodo}: cargado y remitido ({resultado.informe.get('leidas')} casillas leídas{extra})."


def _correccion(texto: str) -> tuple[str, str, str, float]:
    """«2026-02|PACIENTES HOSP|N16=18» → (periodo, hoja, celda, valor)."""
    m = re.fullmatch(r"(\d{4}-\d{2})\|([^|]+)\|([A-Z]+\d+)=(-?\d+(?:\.\d+)?)", texto.strip())
    if not m:
        raise NoSePuede(f"«{texto}» no tiene la forma AAAA-MM|HOJA|CELDA=VALOR.")
    return m.group(1), m.group(2), m.group(3), float(m.group(4))


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m app.herramientas.cargar_historico", description="Carga meses ya reportados desde los Excel originales del área, por el camino de una carga real.")
    parser.add_argument("carpeta", help="carpeta con ENERO.xlsx, FEBRERO.xlsx, …, o el libro anual del área (una hoja por mes)")
    parser.add_argument("--formato", default="NUT")
    parser.add_argument("--desde", default="2026-01")
    parser.add_argument("--hasta", required=True, help="último mes a cargar (incluido), AAAA-MM")
    parser.add_argument("--usuario", default="superadmin", help="la cuenta a nombre de quien se carga")
    parser.add_argument("--corregir", action="append", default=[], help="AAAA-MM|HOJA|CELDA=VALOR, se puede repetir")
    parser.add_argument("--documentar-errores", action="append", default=[], metavar="AAAA-MM",
                        help="mes que se entrega con sus errores del original documentados, sin corregir; se puede repetir")
    args = parser.parse_args(argv)

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL para ver --help

    try:
        carpeta = Path(args.carpeta)
        if not (carpeta.is_dir() or carpeta.is_file()):
            raise NoSePuede(f"No existe la carpeta ni el libro «{carpeta}».")
        if not (periodos.es_periodo(args.desde) and periodos.es_periodo(args.hasta)) or args.desde > args.hasta:
            raise NoSePuede("--desde y --hasta son AAAA-MM, y --desde no va después de --hasta.")
        correcciones = [_correccion(c) for c in args.corregir]
        ajustes = obtener_ajustes()
        print(f"Base de datos: {ajustes.url_base.split('@')[-1]} · bot: {ajustes.bot_validador_url}")
        periodo = args.desde
        with fabrica()() as bd:
            usuario = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == args.usuario.lower(), vigente(Usuario)))
            if usuario is None:
                raise NoSePuede(f"No existe la cuenta «{args.usuario}».")
            sesion = _sesion_de(bd, usuario)
        while periodo <= args.hasta:
            archivo = archivo_del_mes(carpeta, periodo)
            if archivo is None:
                print(f"{periodo}: no hay Excel para este mes en la carpeta.")
            else:
                with fabrica()() as bd:
                    fijar_auditoria(bd, usuario.id, None)
                    try:
                        linea = cargar_mes(bd, ajustes, sesion, formato=args.formato, periodo=periodo, archivo=archivo,
                                           correcciones=[(h, c, v) for p, h, c, v in correcciones if p == periodo],
                                           documentar_errores=periodo in args.documentar_errores)
                        bd.commit()
                    except Exception as e:  # un mes que falla no detiene a los demás, y se dice por qué
                        bd.rollback()
                        linea = f"{periodo}: no se cargó — {type(e).__name__}: {e}"
                print(linea)
            periodo = periodos.mes_siguiente(periodo)
    except NoSePuede as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
