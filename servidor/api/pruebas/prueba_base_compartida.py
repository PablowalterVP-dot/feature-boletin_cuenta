"""Juntar las bases del equipo sin perder reportes: cobertura, inventario,
exportar_reportes e importar_reportes (el plan; la carga real es la de
cargar_historico, que ya tiene sus pruebas)."""

from datetime import date, datetime
from pathlib import Path

import pytest

import escenario as e
from app.dominio.reloj import ZONA
from app.herramientas import exportar_reportes, importar_reportes, inventario
from app.servicios.cobertura import cobertura

HUELLA = "ab" * 32  # la de escenario.dar_carga_aceptada
HOY = date(2026, 10, 22)  # periodo vigente: setiembre


def _remitido_con_archivo(sesion, mes: int, hallazgos=()):
    r = e.abrir_reporte(sesion, "NUT", mes, "remitido", fecha_envio=datetime(2026, mes + 1, 5, 9, tzinfo=ZONA))
    e.dar_carga_aceptada(sesion, r, hallazgos)
    return r


def _eliminado(sesion, mes: int):
    r = e.abrir_reporte(sesion, "NUT", mes, "borrador")
    r.fecha_eliminacion = datetime.now(ZONA)
    sesion.flush()
    return r


def _area(c: dict, clave: str) -> dict:
    return next(a for a in c["areas"] if a["clave"] == clave)


# ------------------------------------------------------------------ cobertura


def prueba_la_cobertura_distingue_remitido_eliminado_y_lo_que_falta(sesion):
    _remitido_con_archivo(sesion, 3)
    _eliminado(sesion, 4)
    nut = _area(cobertura(sesion, 2026, HOY), "nutricion")
    marzo, abril, mayo, octubre = (nut["meses"][i] for i in (2, 3, 4, 9))
    assert (marzo["estado"], marzo["huella"], marzo["archivo"]) == ("remitido", HUELLA, "Nutricion.xlsx")
    assert abril["estado"] == "eliminado"
    assert mayo["estado"] == "no_iniciado" and mayo["esperado"]
    assert not octubre["esperado"]  # todavía no toca: no es una falta
    assert (nut["remitidos"], nut["faltan"], nut["esperados"]) == (1, 8, 9)


def prueba_un_mes_con_un_reporte_eliminado_y_otro_vigente_cuenta_el_vigente(sesion):
    _eliminado(sesion, 3)
    _remitido_con_archivo(sesion, 3)
    assert _area(cobertura(sesion, 2026, HOY), "nutricion")["meses"][2]["estado"] == "remitido"


def prueba_mantenimiento_no_aparece_en_la_cobertura(sesion):
    assert "mantenimiento" not in {a["clave"] for a in cobertura(sesion, 2026, HOY)["areas"]}


# ----------------------------------------------------------------- inventario


def _inv(origen: str, estado: str, huella: str | None) -> dict:
    meses = [{"periodo": f"2026-{m:02d}", "estado": "no_iniciado", "esperado": m <= 9, "huella": None, "archivo": None} for m in range(1, 13)]
    meses[2] = {**meses[2], "estado": estado, "huella": huella, "archivo": f"{origen}.docx"}
    return {"origen": origen, "areas": [{"clave": "farmacia", "nombre": "Farmacia", "formato": "FAR", "version_activa": "FAR-W1", "meses": meses, "faltan": 8, "esperados": 9}]}


def prueba_comparar_marca_el_mes_con_archivos_distintos():
    texto = inventario.comparar([_inv("jesus", "remitido", "1" * 64), _inv("mars", "remitido", "2" * 64)])
    assert "RR≠" in texto and "Farmacia 2026-03: jesus=jesus.docx (1111111111), mars=mars.docx (2222222222)" in texto


def prueba_comparar_no_marca_el_mismo_archivo_en_dos_bases():
    texto = inventario.comparar([_inv("jesus", "remitido", "1" * 64), _inv("servidor", "borrador", "1" * 64)])
    assert "RB " in texto and "≠" not in texto


# ---------------------------------------------------------- exportar_reportes


def prueba_exportar_copia_el_archivo_vigente_y_sus_justificaciones(sesion, tmp_path):
    r = _remitido_con_archivo(sesion, 3, [("aviso", "variacion:x", "Variación", "Hubo campaña ese mes")])
    cargas = tmp_path / "cargas"
    (cargas / "cargas").mkdir(parents=True)
    (cargas / "cargas" / f"{r.id}.xlsx").write_bytes(b"excel")
    manifiesto = exportar_reportes.exportar(sesion, cargas, tmp_path / "paquete", origen="jesus")
    [entrada] = manifiesto["reportes"]
    assert (entrada["formato"], entrada["periodo"], entrada["estado"], entrada["huella"]) == ("NUT", "2026-03", "remitido", HUELLA)
    assert entrada["justificaciones"] == {"variacion:x": "Hubo campaña ese mes"}
    assert (tmp_path / "paquete" / entrada["ruta"]).read_bytes() == b"excel"
    assert importar_reportes.leer_paquete(tmp_path / "paquete")["origen"] == "jesus"


def prueba_exportar_anota_el_archivo_que_falta_en_disco(sesion, tmp_path):
    _remitido_con_archivo(sesion, 3)
    [entrada] = exportar_reportes.exportar(sesion, tmp_path / "cargas", tmp_path / "paquete", origen="x")["reportes"]
    assert entrada["archivo_faltante"] and entrada["ruta"] is None


def prueba_exportar_no_deja_mezclar_dos_paquetes(sesion, tmp_path):
    (tmp_path / "paquete").mkdir()
    (tmp_path / "paquete" / "manifiesto.json").write_text("{}")
    with pytest.raises(exportar_reportes.NoSePuede, match="no está vacía"):
        exportar_reportes.exportar(sesion, tmp_path, tmp_path / "paquete", origen="x")


# ------------------------------------------------------- importar_reportes: plan


def _entrada(periodo: str, huella: str, *, formato="NUT", faltante=False) -> dict:
    return {
        "formato": formato, "periodo": periodo, "estado": "remitido", "archivo": f"{periodo}.xlsx", "huella": huella,
        "ruta": None if faltante else f"archivos/{periodo}/x.xlsx", "archivo_faltante": faltante, "justificaciones": {},
    }


def _plan(sesion, *paquetes: list[dict]) -> dict[tuple[str, str], list[str]]:
    manifiestos = [(Path(f"p{n}"), {"origen": f"base{n}", "reportes": r}) for n, r in enumerate(paquetes)]
    salida: dict[tuple[str, str], list[str]] = {}
    for paso in importar_reportes.planear(sesion, manifiestos):
        salida.setdefault((paso.entrada["formato"], paso.entrada["periodo"]), []).append(paso.accion)
    return salida


def prueba_el_plan_no_pisa_nada_de_la_base_de_destino(sesion):
    _remitido_con_archivo(sesion, 3)  # destino: marzo con el archivo HUELLA (y NUT-1 activa)
    _eliminado(sesion, 4)
    plan = _plan(sesion, [
        _entrada("2026-03", HUELLA),
        _entrada("2026-04", "4" * 64),
        _entrada("2026-05", "5" * 64),
        _entrada("2026-06", "6" * 64, faltante=True),
        _entrada("2026-05", "5" * 64, formato="FAR"),
    ])
    assert plan[("NUT", "2026-03")] == ["igual"]
    assert plan[("NUT", "2026-04")] == ["eliminado en destino"]
    assert plan[("NUT", "2026-05")] == ["nuevo"]
    assert plan[("NUT", "2026-06")] == ["sin archivo"]
    assert plan[("FAR", "2026-05")] == ["sin formato"]


def prueba_otro_archivo_para_un_mes_que_ya_esta_es_conflicto(sesion):
    _remitido_con_archivo(sesion, 3)
    assert _plan(sesion, [_entrada("2026-03", "9" * 64)])[("NUT", "2026-03")] == ["conflicto"]


def prueba_dos_paquetes_con_archivos_distintos_no_importan_ninguno(sesion):
    e.montar_catalogo_de_ejemplo(sesion)
    plan = _plan(sesion, [_entrada("2026-05", "1" * 64)], [_entrada("2026-05", "2" * 64)])
    assert plan[("NUT", "2026-05")] == ["conflicto entre paquetes", "conflicto entre paquetes"]


def prueba_dos_paquetes_con_el_mismo_archivo_lo_importan_una_vez(sesion):
    e.montar_catalogo_de_ejemplo(sesion)
    plan = _plan(sesion, [_entrada("2026-05", "1" * 64)], [_entrada("2026-05", "1" * 64)])
    assert plan[("NUT", "2026-05")] == ["nuevo"]
