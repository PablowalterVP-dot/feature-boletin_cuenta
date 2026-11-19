"""El lector del reporte DL 1153, con un libro inventado: ninguna cifra es real.

No necesita base de datos. Arma un .xlsx mínimo con lo que el lector usa de verdad: la
hoja de resumen, los títulos de las hojas y las tablas dinámicas por dentro.
"""

import zipfile
from datetime import date
from pathlib import Path

import pytest

from app.herramientas import cargar_geresa
from app.servicios import dl1153

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
HRL = 'III-1 - 00000003 - HOSPITAL REGIONAL DE LORETO "FELIPE SANTIAGO ARRIOLA IGLESIAS"'
OTRO = "II-2 - 00000001 - HOSPITAL IQUITOS"
HOY = 46294.0  # 29/09/2026
VIEJO = 45682.0  # 25/01/2025


def _hoja(celdas: dict[str, str]) -> str:
    filas: dict[int, list[str]] = {}
    for ref, texto in celdas.items():
        fila = int("".join(c for c in ref if c.isdigit()))
        filas.setdefault(fila, []).append(f'<c r="{ref}" t="inlineStr"><is><t>{texto}</t></is></c>')
    cuerpo = "".join(f'<row r="{f}">{"".join(c)}</row>' for f, c in sorted(filas.items()))
    return f"<worksheet {NS}><sheetData>{cuerpo}</sheetData></worksheet>"


def _tabla(campos: list[str], registros: list[list[object]], actualizada: float = HOY) -> tuple[str, str]:
    defs = "".join(f'<cacheField name="{c}"><sharedItems/></cacheField>' for c in campos)
    definicion = f'<pivotCacheDefinition {NS} refreshedDate="{actualizada}"><cacheFields>{defs}</cacheFields></pivotCacheDefinition>'
    def celda(v: object) -> str:
        return f'<n v="{v}"/>' if isinstance(v, (int, float)) else f'<s v="{str(v).replace(chr(34), "&quot;")}"/>'
    filas = "".join(f'<r>{"".join(celda(v) for v in r)}</r>' for r in registros)
    return definicion, f"<pivotCacheRecords {NS}>{filas}</pivotCacheRecords>"


def _libro(ruta: Path, hojas: list[tuple[str, dict[str, str], tuple[str, str] | None]]) -> Path:
    with zipfile.ZipFile(ruta, "w") as z:
        relaciones, lista, numero_tabla = [], [], 0
        for i, (nombre, celdas, tabla) in enumerate(hojas, start=1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", _hoja(celdas))
            relaciones.append(f'<Relationship Id="rId{i}" Target="worksheets/sheet{i}.xml"/>')
            lista.append(f'<sheet name="{nombre}" sheetId="{i}" r:id="rId{i}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>')
            if tabla:
                numero_tabla += 1
                z.writestr(f"xl/pivotCache/pivotCacheDefinition{numero_tabla}.xml", tabla[0])
                z.writestr(f"xl/pivotCache/pivotCacheRecords{numero_tabla}.xml", tabla[1])
                z.writestr(f"xl/worksheets/_rels/sheet{i}.xml.rels", f'<Relationships><Relationship Target="../pivotTables/pivotTable{numero_tabla}.xml"/></Relationships>')
                z.writestr(f"xl/pivotTables/_rels/pivotTable{numero_tabla}.xml.rels", f'<Relationships><Relationship Target="../pivotCache/pivotCacheDefinition{numero_tabla}.xml"/></Relationships>')
        z.writestr("xl/workbook.xml", f"<workbook {NS}><sheets>{''.join(lista)}</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels", f"<Relationships>{''.join(relaciones)}</Relationships>")
    return ruta


RESUMEN = ("DL1153_2026", {"B39": "Periodo Evaluación:", "B40": "Agosto - 2026", "B43": "HIS MINSA 2026 (20/09/2026)", "B44": "SIGTB (11/09/2026)"}, None)
CAMPOS = ["Diris", "eess_nombre", "año", "mes", "den", "num"]


@pytest.fixture
def libro(tmp_path: Path) -> Path:
    return _libro(tmp_path / "reporte.xlsx", [
        RESUMEN,
        # El nombre de hoja está mal a propósito: manda el título.
        ("FICHA 12 CANCER", {"A1": "Ficha 20: Porcentaje de resolutividad."}, _tabla(CAMPOS, [
            ["LORETO", HRL, 2026, 1, 100, 1],
            ["LORETO", HRL, 2026, 2, 200, 3],
            ["LORETO", OTRO, 2026, 1, 999, 99],  # otro hospital de la región
            ["AMAZONAS", "HOSPITAL X", 2026, 1, 500, 5],
            ["LORETO", HRL, 2026, 9, 300, 3],  # mes posterior al evaluado
            ["LORETO", HRL, 2025, 1, 700, 7],  # otro año
        ])),
        # Título vigente, tabla de 2024: no se lee.
        ("DL_1153_2024_CG27", {"A1": "Ficha 27:Productividad Hora Médico"}, _tabla(CAMPOS, [["LORETO", HRL, 2024, 1, 1, 1]], VIEJO)),
        ("VIEJA", {"A1": "Ficha 25:Promedio de Espera"}, _tabla(CAMPOS, [["LORETO", HRL, 2026, 1, 1, 1]], VIEJO)),
        # Ficha que no se evalúa al hospital: también trae la región.
        ("DL_1153_2026_CG07", {"A1": "Ficha 07:Tasa de Éxito"}, _tabla(CAMPOS, [["LORETO", HRL, 2026, 1, 5, 2], ["LORETO", OTRO, 2026, 1, 10, 1]])),
    ])


def _de(reporte: dl1153.Reporte, ficha: int, ambito: str = "hospital") -> list[tuple[int, float, float]]:
    return [(f.mes, f.numerador, f.denominador) for f in reporte.filas if f.ficha == ficha and f.ambito == ambito]


def prueba_lee_periodo_corte_y_fuentes(libro: Path) -> None:
    r = dl1153.leer_reporte(libro)
    assert (r.anio, r.ultimo_mes, r.fecha_corte) == (2026, 8, date(2026, 9, 20))
    assert r.fuentes == ["HIS MINSA 2026", "SIGTB"]


def prueba_solo_el_hospital_del_anio_y_hasta_el_mes_evaluado(libro: Path) -> None:
    r = dl1153.leer_reporte(libro)
    assert _de(r, 20) == [(1, 1, 100), (2, 3, 200)]


def prueba_la_ficha_sale_del_titulo_y_no_del_nombre_de_hoja(libro: Path) -> None:
    assert 20 in dl1153.leer_reporte(libro).fichas_leidas


def prueba_una_tabla_vieja_no_se_lee_aunque_su_titulo_parezca_vigente(libro: Path) -> None:
    r = dl1153.leer_reporte(libro)
    assert 25 not in r.fichas_leidas and 27 not in r.fichas_leidas


def prueba_la_region_solo_en_las_que_no_se_evaluan_al_hospital(libro: Path) -> None:
    r = dl1153.leer_reporte(libro)
    assert _de(r, 7, "region") == [(1, 3, 15)]
    assert _de(r, 7, "hospital") == [(1, 2, 5)]
    assert _de(r, 20, "region") == []


def prueba_un_filtro_de_la_hoja_se_respeta(tmp_path: Path) -> None:
    campos = ["Region", "Establecimiento", "Año", "Mes", "Excluye", "Denominador", "Numerador"]
    ruta = _libro(tmp_path / "r.xlsx", [RESUMEN, ("X", {"A1": "Ficha 14: Cáncer"}, _tabla(campos, [["LORETO", HRL, 2026, 1, "NO", 9, 1], ["LORETO", HRL, 2026, 1, "SI", 4, 1]]))])
    assert _de(dl1153.leer_reporte(ruta), 14) == [(1, 1, 9)]


def prueba_una_columna_faltante_avisa_y_no_inventa(tmp_path: Path) -> None:
    ruta = _libro(tmp_path / "r.xlsx", [RESUMEN, ("X", {"A1": "Ficha 20: x"}, _tabla(["Diris", "eess_nombre", "año", "mes", "otra"], [["LORETO", HRL, 2026, 1, 1]])), ("Y", {"A1": "Ficha 21: y"}, _tabla(CAMPOS, [["LORETO", HRL, 2026, 1, 2, 250]]))])
    r = dl1153.leer_reporte(ruta)
    assert 20 not in r.fichas_leidas and any("Ficha 20" in a for a in r.avisos)
    assert _de(r, 21) == [(1, 250, 2)]


def prueba_otro_excel_se_rechaza(tmp_path: Path) -> None:
    ruta = _libro(tmp_path / "otro.xlsx", [("Hoja1", {"A1": "Cualquier cosa"}, None)])
    with pytest.raises(dl1153.ReporteRechazado):
        dl1153.leer_reporte(ruta)


def prueba_un_archivo_que_no_es_excel_se_rechaza(tmp_path: Path) -> None:
    ruta = tmp_path / "x.xlsx"
    ruta.write_text("no soy un excel", encoding="utf-8")
    with pytest.raises(dl1153.ReporteRechazado):
        dl1153.leer_reporte(ruta)


def prueba_libera_el_archivo_al_terminar(libro: Path) -> None:
    """En Windows, la API no podría borrar el temporal si quedara abierto."""
    dl1153.leer_reporte(libro)
    libro.unlink()
    assert not libro.exists()


def prueba_titulos_mal_numerados() -> None:
    assert dl1153._ficha_de_titulo("Ficha 32:Porcentaje de personal registrado en el aplicativo") == 29
    assert dl1153._ficha_de_titulo("Ficha 27:Productividad Hora Médico") is None
    assert dl1153._ficha_de_titulo("Ficha 01: Porcentaje") == 1
    assert dl1153._ficha_de_titulo("#REF!") is None


def prueba_cuadro_de_geresa_corta_en_el_ultimo_mes_con_atenciones(tmp_path: Path) -> None:
    celdas: dict[str, str] = {}
    fila = 10
    for n in range(1, 23):
        celdas[f"A{fila}"] = str(n)
        celdas[f"E{fila}"] = str(10 + n)
        celdas[f"E{fila + 1}"] = "100"
        fila += 2
    celdas["G10"] = "50"  # febrero: atenciones del indicador 1
    celdas["G11"] = "#DIV/0!"  # un error de la hoja no es una cifra
    celdas["S12"] = "4"  # una celda suelta de agosto en otro indicador no alarga el año
    ruta = _libro(tmp_path / "geresa.xlsx", [("2026", celdas, None)])
    datos, ultimo = cargar_geresa.leer(ruta, 2026)
    assert ultimo == 2
    assert datos[1][1] == (11.0, 100.0)
    assert datos[1][2] == (50.0, None)
    assert 8 not in datos[2]


def prueba_cuadro_sin_el_anio_se_rechaza(tmp_path: Path) -> None:
    ruta = _libro(tmp_path / "geresa.xlsx", [("2025", {"A1": "x"}, None)])
    with pytest.raises(ValueError):
        cargar_geresa.leer(ruta, 2026)
