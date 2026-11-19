"""Lee el reporte de Convenios de Gestión DL 1153 que publica MINSA.

Las hojas del Excel no sirven para leer cifras: cada una se guardó con otro filtro
(una muestra todo el país, otra solo Loreto, otra solo agosto), y el resumen es
nacional y mezcla meses. Lo confiable son las **tablas dinámicas por dentro**: sus
registros traen cada establecimiento y cada mes, sin ningún filtro, y sin datos de
pacientes.

Por eso una hoja solo se usa para saber de qué ficha es (su título en A1, porque los
nombres de hoja están cambiados: «FICHA 12 CANCER» es la 14) y qué tablas tiene.

Tres trampas del archivo que esto evita:

  · Hojas viejas. Hay tablas de 2024 y 2025 con títulos que parecen vigentes
    («Ficha 27: Productividad Hora Médico» son cirugías suspendidas de 2024). Una
    tabla actualizada antes del año del reporte no se lee.
  · Meses que aún no pasan. La ficha 9 repite agosto hasta diciembre. Se corta en el
    último mes que el propio reporte dice evaluar.
  · Datos acumulados. Aquí se guardan tal como vienen: quien los lee (el catálogo del
    panel) sabe cuáles no se pueden sumar.

Sin dependencias: solo la biblioteca estándar. Un Excel con pacientes no pasa por
aquí; si un día una tabla trajera una columna de documento, no se guarda nada de ella
porque solo se leen las columnas declaradas en `FICHAS`.
"""

from __future__ import annotations

import re
import zipfile
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.etree.ElementTree import fromstring, iterparse

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

HOSPITAL = re.compile(r"HOSPITAL REGIONAL DE LORETO", re.IGNORECASE)
REGION = "LORETO"

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "setiembre": 9, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


class ReporteRechazado(ValueError):
    """El archivo no es un reporte DL 1153 que se pueda leer; el mensaje dice por qué."""


@dataclass(frozen=True)
class Definicion:
    """Dónde está cada dato en la tabla de una ficha. Los nombres van en minúsculas."""

    denominador: str
    numerador: str
    mes: str = "mes"
    anio: str | None = "año"
    establecimiento: str | None = "eess_nombre"
    region: str = "diris"
    series: tuple[tuple[str, str, str], ...] = ()  # (serie, denominador, numerador) además de la principal
    filtros: tuple[tuple[str, object], ...] = ()  # lo que la propia hoja de MINSA deja filtrado
    con_region: bool = False  # solo las que no se evalúan al hospital: se muestran como contexto regional


FICHAS: dict[int, Definicion] = {
    1: Definicion("den", "num", establecimiento=None, filtros=(("seguro", 1),), con_region=True),
    2: Definicion("den", "num", establecimiento=None, filtros=(("seguro", 1),), con_region=True),
    3: Definicion("den", "num", anio=None, establecimiento=None, region="disa", con_region=True),
    4: Definicion("den", "num", con_region=True),
    5: Definicion("denominador", "numerador", mes="mes_eva", establecimiento=None, con_region=True),
    6: Definicion("den", "num"),
    7: Definicion("den", "num", con_region=True),
    8: Definicion("den", "num", con_region=True),
    9: Definicion("denominador", "numerador", establecimiento="eess"),
    # Su resultado se mide contra las evaluaciones orales (NUM_EOC_2026), no contra Den.
    10: Definicion("num_eoc_2026", "num", establecimiento="desc_estab", region="desc_disa", con_region=True),
    11: Definicion("den", "num", anio=None, establecimiento="eess", region="disa"),
    12: Definicion("den", "num", anio="anio"),
    13: Definicion("den", "num", establecimiento=None, con_region=True),
    14: Definicion("denominador", "numerador", establecimiento="establecimiento", region="region", filtros=(("excluye", "NO"),)),
    15: Definicion("denominador", "numerador", establecimiento="establecimiento", region="region"),
    16: Definicion("denominador", "numerador", anio="anio", establecimiento=None, region="desc_dpto", con_region=True),
    17: Definicion("den", "num", establecimiento="desc_estab"),
    18: Definicion("den", "num"),
    19: Definicion("denominador", "numerador", establecimiento="establecimiento", region="region", filtros=(("excluye", "NO"),), con_region=True),
    20: Definicion("den", "num"),
    21: Definicion("den", "num"),
    22: Definicion("total_cirugias_programadas", "total_cirugias_suspendidas"),
    23: Definicion("den_hosp", "num_hosp", series=(("uci", "den_uci", "num_uci"),), filtros=(("valido", 1),)),
    24: Definicion("den", "num", anio="anio", filtros=(("valido", 1),)),
    25: Definicion("den", "num", establecimiento="desc_estab"),
    26: Definicion("denominador_consultorio_fisico", "numerador_consultorio_funcional", establecimiento="establecimiento"),
    29: Definicion("total", "numerador", anio=None, establecimiento="nmbre de establecimiento", region="pliego y descripcion"),
    32: Definicion("den", "num"),
}


@dataclass(frozen=True)
class FilaOficial:
    ficha: int
    serie: str
    ambito: str  # hospital | region
    mes: int
    numerador: float
    denominador: float


@dataclass
class Reporte:
    anio: int
    ultimo_mes: int
    fecha_corte: date | None
    documento: str
    filas: list[FilaOficial] = field(default_factory=list)
    fuentes: list[str] = field(default_factory=list)
    fichas_leidas: list[int] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class _Tabla:
    numero: int
    campos: tuple[str, ...]
    compartidos: tuple[list | None, ...]
    actualizada: date | None


def _valor(elemento) -> object:
    etiqueta = elemento.tag.removeprefix(_NS)
    v = elemento.get("v")
    if etiqueta == "n":
        return float(v)
    if etiqueta == "m":
        return None
    if etiqueta == "b":
        return v == "1"
    return v


def _fecha_excel(texto: str | None) -> date | None:
    if not texto:
        return None
    try:
        return (datetime(1899, 12, 30) + timedelta(days=float(texto))).date()
    except (TypeError, ValueError):
        return None


class _Libro:
    """Lo mínimo de un .xlsx: hojas, sus primeras celdas y sus tablas dinámicas."""

    def __init__(self, ruta: str | Path) -> None:
        try:
            self.zip = zipfile.ZipFile(ruta)
        except (zipfile.BadZipFile, OSError) as e:
            raise ReporteRechazado("El archivo no es un Excel .xlsx que se pueda abrir.") from e
        self.nombres = set(self.zip.namelist())
        if "xl/workbook.xml" not in self.nombres:
            raise ReporteRechazado("El archivo no es un Excel .xlsx que se pueda abrir.")
        self._textos: list[str] | None = None

    def textos(self) -> list[str]:
        if self._textos is None:
            self._textos = []
            if "xl/sharedStrings.xml" in self.nombres:
                raiz = fromstring(self.zip.read("xl/sharedStrings.xml"))
                self._textos = ["".join(t.text or "" for t in si.iter(f"{_NS}t")) for si in raiz]
        return self._textos

    def hojas(self) -> list[tuple[str, str]]:
        """(nombre, ruta interna) de cada hoja, también las ocultas."""
        relaciones = dict(
            (r.get("Id"), r.get("Target"))
            for r in fromstring(self.zip.read("xl/_rels/workbook.xml.rels"))
        )
        libro = fromstring(self.zip.read("xl/workbook.xml"))
        salida = []
        for h in libro.iter(f"{_NS}sheet"):
            rid = h.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            destino = relaciones[rid].lstrip("/")
            salida.append((h.get("name"), destino if destino.startswith("xl/") else f"xl/{destino}"))
        return salida

    def celdas(self, ruta: str, hasta_fila: int) -> dict[str, str]:
        """Las celdas de texto y número hasta una fila, sin leer la hoja entera."""
        salida: dict[str, str] = {}
        textos = self.textos()
        with self.zip.open(ruta) as f:
            for _, el in iterparse(f, events=("end",)):
                if el.tag == f"{_NS}c":
                    v = el.find(f"{_NS}v")
                    tipo = el.get("t")
                    if tipo == "inlineStr":
                        texto = "".join(t.text or "" for t in el.iter(f"{_NS}t"))
                    elif v is None or v.text is None:
                        texto = None
                    elif tipo == "s":
                        texto = textos[int(v.text)]
                    else:
                        texto = v.text
                    if texto is not None:
                        salida[el.get("r")] = texto
                elif el.tag == f"{_NS}row":
                    if int(el.get("r")) >= hasta_fila:
                        break
                    el.clear()
        return salida

    def tablas_de(self, ruta: str) -> list[int]:
        relaciones = f"xl/worksheets/_rels/{ruta.rsplit('/', 1)[-1]}.rels"
        if relaciones not in self.nombres:
            return []
        salida = []
        for pivote in re.findall(r"pivotTable\d+\.xml", self.zip.read(relaciones).decode("utf-8")):
            enlaces = self.zip.read(f"xl/pivotTables/_rels/{pivote}.rels").decode("utf-8")
            hallado = re.search(r"pivotCacheDefinition(\d+)\.xml", enlaces)
            if hallado:
                salida.append(int(hallado.group(1)))
        return salida

    def tabla(self, numero: int) -> _Tabla:
        raiz = fromstring(self.zip.read(f"xl/pivotCache/pivotCacheDefinition{numero}.xml"))
        campos, compartidos = [], []
        for campo in raiz.find(f"{_NS}cacheFields"):
            campos.append((campo.get("name") or "").strip().lower())
            items = campo.find(f"{_NS}sharedItems")
            compartidos.append([_valor(x) for x in items] if items is not None and len(items) else None)
        return _Tabla(numero, tuple(campos), tuple(compartidos), _fecha_excel(raiz.get("refreshedDate")))

    def registros(self, tabla: _Tabla) -> Iterator[dict[str, object]]:
        with self.zip.open(f"xl/pivotCache/pivotCacheRecords{tabla.numero}.xml") as f:
            for _, el in iterparse(f, events=("end",)):
                if el.tag != f"{_NS}r":
                    continue
                fila: dict[str, object] = {}
                for i, hijo in enumerate(el):
                    if i >= len(tabla.campos):
                        break
                    if hijo.tag == f"{_NS}x":
                        lista = tabla.compartidos[i]
                        fila[tabla.campos[i]] = lista[int(hijo.get("v"))] if lista else None
                    else:
                        fila[tabla.campos[i]] = _valor(hijo)
                el.clear()
                yield fila


def _ficha_de_titulo(titulo: str) -> int | None:
    """El número de ficha de una hoja, por su título. Los hay mal numerados."""
    if re.search(r"personal registrado", titulo, re.IGNORECASE):
        return 29  # La hoja dice «Ficha 32», pero el Anexo I la numera 29.
    if re.search(r"productividad hora", titulo, re.IGNORECASE):
        return None  # Resto de otro año: no está en el Anexo I de 2026.
    hallado = re.match(r"\s*ficha\s*n?\D{0,3}(\d+)", titulo, re.IGNORECASE)
    return int(hallado.group(1)) if hallado else None


def _mes(valor: object) -> int | None:
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return int(valor) if 1 <= int(valor) <= 12 else None
    return MESES.get(str(valor or "").strip().lower())


def _periodo(libro: _Libro, ruta_resumen: str) -> tuple[int, int, date | None, list[str]]:
    """Año, último mes evaluado, fecha de corte y fuentes, de la hoja de resumen."""
    celdas = libro.celdas(ruta_resumen, hasta_fila=60)
    anio = mes = None
    fuentes: list[str] = []
    corte = None
    for clave, texto in celdas.items():
        if not clave.startswith("B"):
            continue
        hallado = re.fullmatch(r"\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s*-\s*(\d{4})\s*", texto)
        if hallado and hallado.group(1).lower() in MESES:
            mes, anio = MESES[hallado.group(1).lower()], int(hallado.group(2))
        fuente = re.fullmatch(r"\s*(.+?)\s*\((\d{2})/(\d{2})/(\d{4})\)\s*", texto)
        if fuente:
            fuentes.append(fuente.group(1).strip())
            if "HIS" in fuente.group(1).upper():
                corte = date(int(fuente.group(4)), int(fuente.group(3)), int(fuente.group(2)))
    if anio is None or mes is None:
        raise ReporteRechazado("No se encontró «Periodo Evaluación» en la hoja de resumen: no parece un reporte DL 1153.")
    return anio, mes, corte, fuentes


def _leer_tabla(libro: _Libro, tabla: _Tabla, ficha: int, d: Definicion, anio: int, ultimo_mes: int) -> list[FilaOficial]:
    medidas = (("principal", d.denominador, d.numerador), *d.series)
    acumulado: dict[tuple[str, str, int], list[float]] = defaultdict(lambda: [0.0, 0.0])
    for fila in libro.registros(tabla):
        if any(fila.get(c) != v for c, v in d.filtros):
            continue
        if d.anio and fila.get(d.anio) is not None and int(float(fila[d.anio])) != anio:
            continue
        mes = _mes(fila.get(d.mes))
        if mes is None or mes > ultimo_mes:
            continue
        ambitos = []
        if d.establecimiento and HOSPITAL.search(str(fila.get(d.establecimiento) or "")):
            ambitos.append("hospital")
        if d.con_region and str(fila.get(d.region) or "").strip().upper() == REGION:
            ambitos.append("region")
        for ambito in ambitos:
            for serie, den, num in medidas:
                par = acumulado[(serie, ambito, mes)]
                for i, campo in enumerate((den, num)):
                    v = fila.get(campo)
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        par[i] += v
    return [
        FilaOficial(ficha, serie, ambito, mes, round(par[1], 4), round(par[0], 4))
        for (serie, ambito, mes), par in sorted(acumulado.items(), key=lambda x: (x[0][0], x[0][1], x[0][2]))
    ]


def leer_reporte(ruta: str | Path, nombre: str | None = None) -> Reporte:
    """Lee el reporte entero. No toca la base: quien llama decide si guarda."""
    libro = _Libro(ruta)
    # Se cierra siempre: en Windows, un archivo abierto no se puede borrar, y la API lo
    # recibe en un temporal.
    try:
        return _leer(libro, ruta, nombre)
    finally:
        libro.zip.close()


def _leer(libro: _Libro, ruta: str | Path, nombre: str | None) -> Reporte:
    hojas = libro.hojas()
    resumen = next((r for n, r in hojas if re.fullmatch(r"DL\s*_?1153_\d{4}", n.strip(), re.IGNORECASE)), None)
    if resumen is None:
        raise ReporteRechazado("No tiene la hoja de resumen del reporte (DL1153_AAAA): no parece un reporte DL 1153.")
    anio, ultimo_mes, corte, fuentes = _periodo(libro, resumen)
    reporte = Reporte(anio=anio, ultimo_mes=ultimo_mes, fecha_corte=corte, documento=nombre or Path(ruta).name, fuentes=fuentes)

    leidas: set[int] = set()
    for nombre_hoja, ruta_hoja in hojas:
        titulo = libro.celdas(ruta_hoja, hasta_fila=1).get("A1", "")
        ficha = _ficha_de_titulo(titulo)
        if ficha is None or ficha in leidas or ficha not in FICHAS:
            continue
        d = FICHAS[ficha]
        for numero in libro.tablas_de(ruta_hoja):
            tabla = libro.tabla(numero)
            # Una tabla actualizada antes del año del reporte es de otro año, aunque la hoja diga 2026.
            if tabla.actualizada is not None and tabla.actualizada.year < anio:
                continue
            requeridos = {d.denominador, d.numerador, d.mes, *(c for _, c1, c2 in d.series for c in (c1, c2)), *(c for c, _ in d.filtros)}
            faltan = sorted(c for c in requeridos if c not in tabla.campos)
            if faltan:
                reporte.avisos.append(f"Ficha {ficha} (hoja «{nombre_hoja.strip()}»): la tabla no trae {', '.join(faltan)}. No se leyó; pudo cambiar el formato de MINSA.")
                continue
            reporte.filas.extend(_leer_tabla(libro, tabla, ficha, d, anio, ultimo_mes))
            leidas.add(ficha)
            break
    reporte.fichas_leidas = sorted(leidas)
    if not leidas:
        raise ReporteRechazado("No se reconoció ninguna ficha en el archivo: no parece un reporte DL 1153.")
    return reporte
