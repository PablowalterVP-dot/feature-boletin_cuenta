"""Deja la base lista para Nutrición real, cada vez que arranca el contenedor.

    python -m app.herramientas.preparar_base

Existe porque un redeploy reconstruye el código pero no toca la base: los
pasos que en desarrollo se corrieron a mano (activar NUT-2, sembrar plazos y
alertas, cargar los meses ya entregados) no llegaban nunca a producción, y el
bot reconocía «NUT-2» en una base que solo tenía NUT-1 (06/10/2026).

Se corre antes de uvicorn (`Dockerfile`) y **cada paso es idempotente**: en
una base ya preparada no cambia nada. Por eso no usa `--recargar` en ningún
caso que pueda tocar una versión congelada:

1. Catálogo de NUT-1, solo si NUT-1 sigue `en_configuracion` (una base recién
   instalada). Si ya está activa o retirada, no se toca: correrlo sobre una
   NUT-1 retirada la volvería a activar.
2. NUT-2: se crea si no existe; si existe y todavía no leyó ningún archivo, se
   reescribe (así una NUT-2 vieja, sin Patrimonio, queda al día); si ya está
   congelada, se deja. Luego se activa y NUT-1 queda retirada.
3. Plazos y alertas: solo crean las claves que faltan.
4. Centro Quirúrgico (22/10/2026): su catálogo `CQX-1` se crea y se activa
   si falta (`cargar_catalogo_centro_quirurgico`, sin `--recargar`: una
   versión que ya leyó archivos no se toca). Antes se activaba a mano, a
   propósito, para no meter el área al flujo antes de tiempo; ya está lista
   para probarse en `develop`, y a mano no llegaba a la base desplegada.
   Farmacia, Epidemiología y Diagnóstico por Imágenes, igual (27/10/2026):
   se decidió ponerlas en el flujo con sus nueve meses, así que su formato
   se activa aquí y no queda esperando a que alguien corra la herramienta.
   Las otras cuatro áreas las activa el seeder `0007` (03/11/2026), que corre
   antes de esto en cada despliegue.
5. Organización: Mantenimiento se retira si sigue activo
   (`bd/seeders/0004_retirar_mantenimiento.sql`, que se puede repetir). En
   Docker, `bd seed` ya lo corrió antes; aquí queda para una base que se
   levantó sin el gestor de migraciones.
6. Histórico: los meses de `historico/<área>/<año>/` (`HISTORICOS`) que no
   tengan ya un reporte. Un mes con un reporte **eliminado** tampoco se carga:
   alguien lo borró a propósito (`eliminar_reporte`) y volver a cargarlo en el
   siguiente arranque desharía esa decisión. Un área cuyo formato no tiene
   versión activa **espera**: este paso no la activa, porque activar mete al
   área en el flujo y eso se decide aparte (Farmacia, 22/10/2026).

7. Horas de Centro Quirúrgico (07/11/2026): los meses leídos con el bot
   anterior a 0.3.0 guardaron las horas en días. `recargar_horas_cqx` los
   rectifica y reenvía por el flujo de siempre, solo si comprueba que cada hora
   guardada es la del archivo dividida entre 24. En una base ya corregida no
   hace nada; sin el bot levantado, lo dice y espera al siguiente arranque.

El histórico versionado aquí es lo que hace que todas las bases —la de cada
integrante, la del servidor, la de una instalación nueva— tengan los mismos
meses sin que nadie los suba a mano. Lo que se cargó en una sola base y no
está aquí se trae con `exportar_reportes` / `importar_reportes`.

Si un paso falla, se informa y la API arranca igual: una base a medio
preparar no debe dejar el sistema entero fuera de servicio.
"""

import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import func, select, text

from app.api.dependencias import fijar_auditoria
from app.config import obtener_ajustes
from app.datos.base import vigente
from app.datos.modelos import Formato, FormatoVersion, Periodo, Reporte, Usuario
from app.dominio import periodos
from app.herramientas import (
    cargar_catalogo_centro_quirurgico,
    cargar_catalogo_epidemiologia,
    cargar_catalogo_farmacia,
    cargar_catalogo_imagenes,
    cargar_catalogo_nutricion,
    cargar_historico,
    configurar_alertas,
    configurar_nutricion_real,
    configurar_plazos,
    recargar_horas_cqx,
)

RAIZ_HISTORICO = Path(__file__).resolve().parents[2] / "historico"
RETIRAR_MANTENIMIENTO = Path(__file__).resolve().parents[2] / "bd" / "seeders" / "0004_retirar_mantenimiento.sql"


@dataclass(frozen=True)
class Historico:
    formato: str
    carpeta: Path
    desde: str
    hasta: str
    correcciones: dict[str, list[tuple[str, str, float]]] = field(default_factory=dict)
    # Meses que se entregan con los errores del original documentados, sin
    # corregir (`cargar_historico --documentar-errores`).
    documentar: tuple[str, ...] = ()


HISTORICOS = (
    # El «18+» de febrero (pacientes hospitalizados, líquida, cena, día 12): Excel
    # lo ignoraba como texto; es la misma corrección que se hizo en desarrollo.
    Historico("NUT", RAIZ_HISTORICO / "nutricion" / "2026", "2026-01", "2026-06", {"2026-02": [("PACIENTES HOSP", "N16", 18.0)]}),
    # Los nueve informes en Word que el área entregó (enero a setiembre), con su
    # nombre de siempre: «01 INFORME MES DE ENERO 2026.docx». Julio va con su
    # total final corregido (la suma); marzo, julio y setiembre se entregan con
    # las inconsistencias del original documentadas (ver su README; decidido el
    # 27/10/2026).
    Historico("FAR", RAIZ_HISTORICO / "farmacia" / "2026", "2026-01", "2026-09", documentar=("2026-03", "2026-07", "2026-09")),
    # Enero a agosto, sin las hojas con datos de pacientes (ver su README). Enero
    # trae dos totales de especialidad cuya fórmula no toma todas sus filas: vale
    # la suma de sus procedimientos (113 y 4, no 105 y 6). Mayo dejó en blanco
    # «falta de instrumental»: sin suspensiones por esa causa, 0. Decidido el
    # 27/10/2026.
    Historico("CQX", RAIZ_HISTORICO / "centro_quirurgico" / "2026", "2026-01", "2026-08", {
        "2026-01": [("CIRUGIA MAYOR", "C5", 113.0), ("CIRUGIA MENOR", "C18", 4.0)],
        "2026-05": [("SUSPENDIDAS", "D12", 0.0)],
    }),
    # Los nueve oficios de vigilancia (enero a setiembre). Cuadran todos.
    Historico("EPI", RAIZ_HISTORICO / "epidemiologia" / "2026", "2026-01", "2026-09"),
    # Los nueve oficios. Enero, febrero, marzo, mayo y setiembre van con sus
    # totales escritos corregidos (la suma de sus casillas); los descuadres que
    # el oficio no permite atribuir a una cifra se entregan documentados (ver su
    # README; decidido el 27/10/2026).
    Historico("DXI", RAIZ_HISTORICO / "imagenes" / "2026", "2026-01", "2026-09", documentar=("2026-01", "2026-02", "2026-04", "2026-05", "2026-08")),
)


def _estado_version(bd, codigo_version: str) -> str | None:
    return bd.scalar(
        select(FormatoVersion.estado).join(Formato, Formato.id == FormatoVersion.formato_id)
        .where(Formato.codigo == "NUT", FormatoVersion.codigo_version == codigo_version, vigente(FormatoVersion))
    )


def preparar_formato(bd) -> list[str]:
    lineas = []
    if _estado_version(bd, "NUT-2") == "activa":
        return ["«NUT-2» ya está activa."]
    if _estado_version(bd, "NUT-1") == "en_configuracion":
        lineas.append(cargar_catalogo_nutricion.cargar_catalogo(bd))
    version = bd.scalar(
        select(FormatoVersion).join(Formato, Formato.id == FormatoVersion.formato_id)
        .where(Formato.codigo == "NUT", FormatoVersion.codigo_version == "NUT-2", vigente(FormatoVersion))
    )
    recargar = version is not None and not configurar_nutricion_real._tiene_carga_aceptada(bd, version.id)
    lineas.append(configurar_nutricion_real.configurar(bd, recargar=recargar))
    lineas.append(configurar_nutricion_real.activar(bd))
    return lineas


def retirar_mantenimiento(bd) -> str:
    """El seeder `0004`, tal cual: es idempotente y se niega si
    Mantenimiento tuviera un formato o una cuenta (lo dice como excepción)."""
    activa = bd.scalar(text("SELECT count(*) FROM organizacion.unidad_organica WHERE codigo = 'MTO' AND fecha_eliminacion IS NULL"))
    if not activa:
        return "Mantenimiento ya estaba retirado."
    bd.execute(text(RETIRAR_MANTENIMIENTO.read_text(encoding="utf-8")))
    return "Mantenimiento retirado (unidad MTO y su destino)."


def _tuvo_reporte(bd, formato: str, periodo: str) -> bool:
    """Si el mes tiene o tuvo reporte, incluidos los eliminados."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return bd.scalar(
        select(func.count(Reporte.id)).join(Formato, Formato.id == Reporte.formato_id).join(Periodo, Periodo.id == Reporte.periodo_id)
        .where(Formato.codigo == formato, Periodo.anio == anio, Periodo.mes == mes)
    ) > 0


def _version_activa(bd, formato: str) -> bool:
    return bd.scalar(
        select(func.count(FormatoVersion.id)).join(Formato, Formato.id == FormatoVersion.formato_id)
        .where(Formato.codigo == formato, FormatoVersion.estado == "activa", vigente(FormatoVersion), vigente(Formato))
    ) > 0


def cargar_meses(fabrica, historico: Historico) -> list[str]:
    if not historico.carpeta.is_dir() or not any(a.suffix.lower() in cargar_historico.EXTENSIONES for a in historico.carpeta.iterdir()):
        return [f"Sin histórico: no hay archivos en {historico.carpeta.relative_to(RAIZ_HISTORICO.parent)}."]
    with fabrica() as bd:
        if not _version_activa(bd, historico.formato):
            return [f"«{historico.formato}» no tiene versión activa: su histórico espera a que se active el formato."]
    ajustes = obtener_ajustes()
    with fabrica() as bd:
        usuario = bd.scalar(select(Usuario).where(func.lower(Usuario.nombre_usuario) == "superadmin", vigente(Usuario)))
        if usuario is None:
            return ["Sin histórico: no existe la cuenta «superadmin»."]
        sesion = cargar_historico._sesion_de(bd, usuario)

    lineas = []
    periodo = historico.desde
    while periodo <= historico.hasta:
        try:
            archivo = cargar_historico.archivo_del_mes(historico.carpeta, periodo)
        except cargar_historico.NoSePuede as e:
            lineas.append(f"{periodo}: {e}")
            periodo = periodos.mes_siguiente(periodo)
            continue
        with fabrica() as bd:
            if archivo is None:
                lineas.append(f"{periodo}: no hay archivo en el histórico.")
            elif _tuvo_reporte(bd, historico.formato, periodo):
                lineas.append(f"{periodo}: ya tiene reporte, no se toca.")
            else:
                fijar_auditoria(bd, usuario.id, None)
                try:
                    lineas.append(cargar_historico.cargar_mes(
                        bd, ajustes, sesion, formato=historico.formato, periodo=periodo, archivo=archivo,
                        correcciones=historico.correcciones.get(periodo, []),
                        documentar_errores=periodo in historico.documentar,
                    ))
                    bd.commit()
                except Exception as e:  # un mes que falla no detiene a los demás
                    bd.rollback()
                    lineas.append(f"{periodo}: no se cargó — {type(e).__name__}: {e}")
        periodo = periodos.mes_siguiente(periodo)
    return lineas


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    from app.datos.sesion import fabrica  # import diferido: no exige DATABASE_URL al importar

    print("[preparar_base] Inicio.")
    pasos = [
        ("formato", lambda bd: preparar_formato(bd)),
        ("plazos", lambda bd: [configurar_plazos.configurar(bd)]),
        ("alertas", lambda bd: [configurar_alertas.configurar(bd)]),
        ("centro quirúrgico", lambda bd: [cargar_catalogo_centro_quirurgico.cargar_catalogo(bd)]),
        ("farmacia", lambda bd: [cargar_catalogo_farmacia.cargar_catalogo(bd)]),
        ("epidemiología", lambda bd: [cargar_catalogo_epidemiologia.cargar_catalogo(bd)]),
        ("diagnóstico por imágenes", lambda bd: [cargar_catalogo_imagenes.cargar_catalogo(bd)]),
        ("organización", lambda bd: [retirar_mantenimiento(bd)]),
    ]
    fallos = 0
    for nombre, paso in pasos:
        try:
            with fabrica()() as bd:
                lineas = paso(bd)
                bd.commit()
            for linea in lineas:
                print(f"[preparar_base] {nombre}: {linea}")
        except Exception as e:
            fallos += 1
            print(f"[preparar_base] {nombre}: FALLÓ — {type(e).__name__}: {e}", file=sys.stderr)

    if "--historico" in sys.argv:
        for historico in HISTORICOS:
            try:
                for linea in cargar_meses(fabrica(), historico):
                    print(f"[preparar_base] histórico {historico.formato}: {linea}")
            except Exception as e:
                fallos += 1
                print(f"[preparar_base] histórico {historico.formato}: FALLÓ — {type(e).__name__}: {e}", file=sys.stderr)

    try:
        for linea in recargar_horas_cqx.recargar(fabrica(), respaldos=recargar_horas_cqx.respaldos_del_historico()):
            print(f"[preparar_base] horas de centro quirúrgico: {linea}")
    except Exception as e:
        fallos += 1
        print(f"[preparar_base] horas de centro quirúrgico: FALLÓ — {type(e).__name__}: {e}", file=sys.stderr)

    print(f"[preparar_base] Fin{f', con {fallos} paso(s) fallido(s)' if fallos else ''}.")
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
