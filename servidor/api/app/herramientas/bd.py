"""Gestor centralizado de migraciones y seeders SQL de la base de datos.

Comandos disponibles:
    python -m app.herramientas.bd migrate                   # Ejecuta migraciones pendientes
    python -m app.herramientas.bd status                    # Muestra estado de migraciones y seeders
    python -m app.herramientas.bd seed                      # Ejecuta seeders primarios pendientes
    python -m app.herramientas.bd seed:usuarios [--forzar]   # Ejecuta el seeder opcional de usuarios de áreas (solo 1 vez)
    python -m app.herramientas.bd seed:hospitalizacion [--forzar]   # Las cuentas de hospitalización para desarrollo (solo 1 vez)
    python -m app.herramientas.bd fresh [--seed] [--usuarios] [--forzar] # Recrea desde cero (se niega si hay reportes)

Registra cada archivo ejecutado en `public.migraciones` y `public.seeders` junto
con su lote (batch), fecha de ejecución y huella SHA-256 para detectar si un
archivo ya aplicado fue modificado.

Si se conecta a una base de datos preexistente (creada antes de que existieran
las tablas `public.migraciones` y `public.seeders`, como en un servidor ya
desplegado), detecta automáticamente qué migraciones y seeders base ya están
instalados y los adopta con `lote = 0` sin reejecutarlos.
"""

from __future__ import annotations

import hashlib
import importlib.util
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.config import RAIZ_BACKEND, obtener_ajustes

CARPETA_BD = RAIZ_BACKEND / "bd"
CARPETA_MIGRACIONES = CARPETA_BD / "migraciones"
CARPETA_SEEDERS = CARPETA_BD / "seeders"
CARPETA_SEEDERS_OPCIONALES = CARPETA_SEEDERS / "opcionales"
CARPETA_PRUEBAS = CARPETA_BD / "pruebas"

ESQUEMAS_DEL_PROYECTO = ("seguridad", "organizacion", "formato", "reporte", "auditoria")
ESQUEMAS_DE_MODULOS = ("fuente", "desempeno", "planeamiento")
TODOS_LOS_ESQUEMAS = ESQUEMAS_DE_MODULOS + ESQUEMAS_DEL_PROYECTO
TABLAS_CONTROL_PUBLIC = ("migraciones", "seeders")

SQL_TABLAS_CONTROL = """
CREATE TABLE IF NOT EXISTS public.migraciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL UNIQUE,
    lote            INTEGER      NOT NULL,
    hash_sha256     CHAR(64)     NOT NULL,
    fecha_ejecucion TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seeders (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL UNIQUE,
    lote            INTEGER      NOT NULL,
    hash_sha256     CHAR(64)     NOT NULL,
    fecha_ejecucion TIMESTAMPTZ  NOT NULL DEFAULT now()
);
"""

# Sondas SQL para detectar objetos ya instalados en bases de datos preexistentes
# (creadas antes de introducir `public.migraciones` y `public.seeders`).
SONDAS_MIGRACIONES_PREEXISTENTES: dict[str, str] = {
    "0001_esquema_base.sql": "SELECT to_regclass('seguridad.usuario') IS NOT NULL",
    "0002_auditoria.sql": "SELECT to_regprocedure('auditoria.fn_instalar_auditoria(text, text)') IS NOT NULL",
    "0003_integridad.sql": "SELECT to_regprocedure('seguridad.fn_validar_usuario_rol()') IS NOT NULL",
    "0004_vistas.sql": "SELECT to_regclass('seguridad.v_permiso_usuario') IS NOT NULL",
    "0005_desempeno_esquema.sql": "SELECT to_regclass('desempeno.ficha') IS NOT NULL",
    "0006_desempeno_tablero.sql": "SELECT to_regclass('desempeno.dimension') IS NOT NULL",
    "0007_farmacia_word.sql": (
        "SELECT EXISTS ("
        "SELECT 1 FROM pg_constraint "
        "WHERE conname = 'ck_formato_version_tipo' "
        "AND conrelid = to_regclass('formato.formato_version') "
        "AND pg_get_constraintdef(oid) LIKE '%docx%'"
        ")"
    ),
    "0008_planeamiento.sql": "SELECT to_regclass('planeamiento.ejecucion_actividad') IS NOT NULL",
    "0009_usuario_telefono.sql": (
        "SELECT EXISTS ("
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = 'seguridad' AND table_name = 'usuario' AND column_name = 'telefono'"
        ")"
    ),
    "0010_registro_del_sistema.sql": "SELECT to_regclass('auditoria.intento_ingreso') IS NOT NULL",
}

# Cada entrada define `(tabla_requerida, consulta_existencia)` para verificar
# primero que la tabla exista antes de consultar sus filas.
SONDAS_SEEDERS_PREEXISTENTES: dict[str, tuple[str, str]] = {
    "0001_semilla_base.sql": (
        "organizacion.unidad_organica",
        "SELECT EXISTS (SELECT 1 FROM organizacion.unidad_organica WHERE codigo = 'NUT')",
    ),
    "0002_flujo_entrega_directa.sql": (
        "reporte.estado_reporte",
        "SELECT EXISTS (SELECT 1 FROM reporte.estado_reporte WHERE codigo = 'enviado' AND fecha_eliminacion IS NOT NULL)",
    ),
    "0003_desempeno_catalogos.sql": (
        "desempeno.dimension",
        "SELECT EXISTS (SELECT 1 FROM desempeno.dimension WHERE codigo = 'es')",
    ),
    "0004_retirar_mantenimiento.sql": (
        "organizacion.unidad_organica",
        "SELECT EXISTS (SELECT 1 FROM organizacion.unidad_organica WHERE codigo = 'MTO' AND fecha_eliminacion IS NOT NULL)",
    ),
    "0005_planeamiento.sql": (
        "seguridad.rol",
        "SELECT EXISTS (SELECT 1 FROM seguridad.rol WHERE codigo = 'planeamiento')",
    ),
}


class ErrorMigracion(Exception):
    """Fallo de validación o de orden al aplicar migraciones o seeders."""


@dataclass(frozen=True)
class EstadoScript:
    nombre: str
    tipo: str  # 'migracion' | 'seeder' | 'seeder_opcional'
    ejecutado: bool
    lote: int | None
    fecha_ejecucion: datetime | None
    hash_actual: str
    hash_registrado: str | None

    @property
    def modificado(self) -> bool:
        return self.tipo != "seeder_opcional" and self.ejecutado and self.hash_registrado is not None and self.hash_registrado != self.hash_actual


def hash_archivo(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def archivos_migraciones() -> list[Path]:
    return sorted(CARPETA_MIGRACIONES.glob("[0-9][0-9][0-9][0-9]_*.sql"))


def archivos_seeders() -> list[Path]:
    """Los seeders en orden. Uno en SQL se ejecuta tal cual; uno en Python define
    `aplicar(bd)`: es para un catálogo que ya vive en sus cargadores, sin copiarlo."""
    return sorted(p for p in CARPETA_SEEDERS.glob("[0-9][0-9][0-9][0-9]_*") if p.suffix in (".sql", ".py"))


def archivos_seeders_opcionales() -> list[Path]:
    if not CARPETA_SEEDERS_OPCIONALES.is_dir():
        return []
    return sorted(CARPETA_SEEDERS_OPCIONALES.glob("*.sql"))


def _cursor_crudo(bd: Session):
    return bd.connection().connection.driver_connection.cursor()


def asegurar_tablas_control(bd: Session) -> None:
    with _cursor_crudo(bd) as cursor:
        cursor.execute(SQL_TABLAS_CONTROL)


def _registros_tabla(bd: Session, tabla: str) -> dict[str, tuple[int, str, datetime]]:
    existe = bd.execute(text("SELECT to_regclass(:reg) IS NOT NULL"), {"reg": f"public.{tabla}"}).scalar()
    if not existe:
        return {}
    filas = bd.execute(
        text(f"SELECT nombre, lote, hash_sha256, fecha_ejecucion FROM public.{tabla} ORDER BY id")
    ).all()
    return {nombre: (lote, huella, fecha) for nombre, lote, huella, fecha in filas}


def sincronizar_base_existente(bd: Session) -> tuple[list[str], list[str]]:
    """Detecta migraciones y seeders históricos que ya están presentes en una
    base de datos preexistente y los registra con `lote = 0` sin reejecutarlos."""
    asegurar_tablas_control(bd)
    registradas_mig = _registros_tabla(bd, "migraciones")
    registradas_seed = _registros_tabla(bd, "seeders")

    mig_adoptadas: list[str] = []
    seed_adoptados: list[str] = []

    for archivo in archivos_migraciones():
        if archivo.name in registradas_mig:
            continue
        sonda = SONDAS_MIGRACIONES_PREEXISTENTES.get(archivo.name)
        if not sonda:
            continue
        ya_instalada = bool(bd.execute(text(sonda)).scalar())
        if ya_instalada:
            bd.execute(
                text("INSERT INTO public.migraciones (nombre, lote, hash_sha256) VALUES (:n, 0, :h)"),
                {"n": archivo.name, "h": hash_archivo(archivo)},
            )
            mig_adoptadas.append(archivo.name)

    for archivo in archivos_seeders():
        if archivo.name in registradas_seed:
            continue
        sonda_seed = SONDAS_SEEDERS_PREEXISTENTES.get(archivo.name)
        if not sonda_seed:
            continue
        tabla_req, sql_verificacion = sonda_seed
        existe_tabla = bool(bd.execute(text("SELECT to_regclass(:t) IS NOT NULL"), {"t": tabla_req}).scalar())
        if not existe_tabla:
            continue
        ya_sembrado = bool(bd.execute(text(sql_verificacion)).scalar())
        if ya_sembrado:
            bd.execute(
                text("INSERT INTO public.seeders (nombre, lote, hash_sha256) VALUES (:n, 0, :h)"),
                {"n": archivo.name, "h": hash_archivo(archivo)},
            )
            seed_adoptados.append(archivo.name)

    return mig_adoptadas, seed_adoptados


def obtener_estado(bd: Session, *, incluir_opcionales: bool = False) -> list[EstadoScript]:
    sincronizar_base_existente(bd)
    registradas_mig = _registros_tabla(bd, "migraciones")
    registradas_seed = _registros_tabla(bd, "seeders")
    salida: list[EstadoScript] = []

    for archivo in archivos_migraciones():
        reg = registradas_mig.get(archivo.name)
        salida.append(
            EstadoScript(
                nombre=archivo.name,
                tipo="migracion",
                ejecutado=reg is not None,
                lote=reg[0] if reg else None,
                hash_registrado=reg[1] if reg else None,
                fecha_ejecucion=reg[2] if reg else None,
                hash_actual=hash_archivo(archivo),
            )
        )

    for archivo in archivos_seeders():
        reg = registradas_seed.get(archivo.name)
        salida.append(
            EstadoScript(
                nombre=archivo.name,
                tipo="seeder",
                ejecutado=reg is not None,
                lote=reg[0] if reg else None,
                hash_registrado=reg[1] if reg else None,
                fecha_ejecucion=reg[2] if reg else None,
                hash_actual=hash_archivo(archivo),
            )
        )

    if incluir_opcionales:
        for archivo in archivos_seeders_opcionales():
            reg = registradas_seed.get(archivo.name)
            salida.append(
                EstadoScript(
                    nombre=archivo.name,
                    tipo="seeder_opcional",
                    ejecutado=reg is not None,
                    lote=reg[0] if reg else None,
                    hash_registrado=reg[1] if reg else None,
                    fecha_ejecucion=reg[2] if reg else None,
                    hash_actual=hash_archivo(archivo),
                )
            )

    return salida


def _ejecutar(bd: Session, archivo: Path) -> None:
    if archivo.suffix == ".py":
        especificacion = importlib.util.spec_from_file_location(f"seeder_{archivo.stem}", archivo)
        modulo = importlib.util.module_from_spec(especificacion)
        especificacion.loader.exec_module(modulo)
        modulo.aplicar(bd)
        return
    with _cursor_crudo(bd) as cursor:
        cursor.execute(archivo.read_text(encoding="utf-8"))


def _aplicar_lote(bd: Session, tabla: str, archivos: list[Path], *, reejecutar_si_existe: bool = False) -> list[str]:
    sincronizar_base_existente(bd)
    registrados = _registros_tabla(bd, tabla)

    if not reejecutar_si_existe:
        for archivo in archivos:
            if archivo.name in registrados:
                _, hash_reg, _ = registrados[archivo.name]
                actual = hash_archivo(archivo)
                if hash_reg != actual:
                    raise ErrorMigracion(
                        f"El archivo «{archivo.name}» ya fue ejecutado en la base pero su contenido cambió "
                        f"(hash registrado {hash_reg[:10]}… != actual {actual[:10]}…). "
                        "Crea un nuevo archivo secuencial en lugar de modificar uno ya aplicado, o usa 'fresh' en desarrollo."
                    )

    pendientes = archivos if reejecutar_si_existe else [a for a in archivos if a.name not in registrados]
    if not pendientes:
        return []

    lote = (max((datos[0] for datos in registrados.values()), default=0)) + 1
    aplicados: list[str] = []

    for archivo in pendientes:
        huella = hash_archivo(archivo)
        _ejecutar(bd, archivo)
        if archivo.name in registrados:
            bd.execute(
                text(f"UPDATE public.{tabla} SET lote = :l, hash_sha256 = :h, fecha_ejecucion = now() WHERE nombre = :n"),
                {"n": archivo.name, "l": lote, "h": huella},
            )
        else:
            bd.execute(
                text(f"INSERT INTO public.{tabla} (nombre, lote, hash_sha256) VALUES (:n, :l, :h)"),
                {"n": archivo.name, "l": lote, "h": huella},
            )
        aplicados.append(archivo.name)

    return aplicados


def migrar(bd: Session) -> list[str]:
    """Aplica las migraciones pendientes en orden secuencial y las registra en `public.migraciones`."""
    return _aplicar_lote(bd, "migraciones", archivos_migraciones())


def sembrar(bd: Session, *, con_catalogos: bool = True) -> list[str]:
    """Aplica los seeders primarios pendientes en orden secuencial y los registra en `public.seeders`.

    `con_catalogos=False` deja fuera los seeders en Python, que activan formatos completos.
    Es para las pruebas: cada una carga el catálogo que necesita y parte de no tenerlo."""
    faltan_mig = [e.nombre for e in obtener_estado(bd) if e.tipo == "migracion" and not e.ejecutado]
    if faltan_mig:
        raise ErrorMigracion(
            f"Faltan migraciones por aplicar antes de correr los seeders ({', '.join(faltan_mig)}). "
            "Ejecuta primero: npm run migrate"
        )
    archivos = archivos_seeders()
    return _aplicar_lote(bd, "seeders", archivos if con_catalogos else [a for a in archivos if a.suffix == ".sql"])


def sembrar_opcional(bd: Session, nombre_archivo: str = "usuarios_areas.sql", *, forzar: bool = False) -> list[str]:
    """Ejecuta un seeder opcional de `bd/seeders/opcionales/` y lo registra en `public.seeders`.
    Solo se permite ejecutarlo una sola vez por base de datos para evitar sobreescribir contraseñas
    existentes, salvo que se use `forzar=True` explícitamente."""
    faltan_mig = [e.nombre for e in obtener_estado(bd) if e.tipo == "migracion" and not e.ejecutado]
    if faltan_mig:
        raise ErrorMigracion(
            f"Faltan migraciones por aplicar antes de correr el seeder opcional ({', '.join(faltan_mig)}). "
            "Ejecuta primero: npm run migrate"
        )
    registrados = _registros_tabla(bd, "seeders")
    if nombre_archivo in registrados and not forzar:
        raise ErrorMigracion(
            f"El seeder «{nombre_archivo}» ya fue aplicado previamente en esta base de datos. "
            "Por seguridad, no se puede volver a ejecutar para evitar sobreescribir contraseñas existentes."
        )
    ruta = CARPETA_SEEDERS_OPCIONALES / nombre_archivo
    if not ruta.is_file():
        raise ErrorMigracion(f"No existe el seeder opcional «{nombre_archivo}» en {CARPETA_SEEDERS_OPCIONALES}.")
    return _aplicar_lote(bd, "seeders", [ruta], reejecutar_si_existe=forzar)


def reportes_en_la_base(bd: Session) -> int:
    """Cuántos reportes guarda la base, eliminados incluidos (0 si no hay esquema)."""
    if not bd.execute(text("SELECT to_regclass('reporte.reporte') IS NOT NULL")).scalar():
        return 0
    return int(bd.execute(text("SELECT count(*) FROM reporte.reporte")).scalar())


def recrear_desde_cero(
    motor: Engine, *, con_seed: bool = True, con_usuarios: bool = False, forzar: bool = False, con_catalogos: bool = True
) -> tuple[list[str], list[str]]:
    """Borra todos los esquemas del proyecto y `public`, y corre todas las migraciones
    (y opcionalmente todos los seeders y usuarios) en una transacción limpia.

    Se niega si la base tiene reportes, salvo `forzar`: las migraciones
    reconstruyen la estructura, no los reportes, y cada integrante del equipo
    tenía meses cargados solo en su base (22/10/2026). Antes de recrear,
    `exportar_reportes` los guarda en un paquete que se vuelve a importar."""
    with Session(motor) as bd:
        cuantos = reportes_en_la_base(bd)
        if cuantos and not forzar:
            raise ErrorMigracion(
                f"La base tiene {cuantos} reporte(s) y 'fresh' los borraría sin vuelta atrás. "
                "Guárdelos antes con `python -m app.herramientas.exportar_reportes`, "
                "o repita con --forzar si de verdad quiere perderlos."
            )
        with _cursor_crudo(bd) as cursor:
            for esquema in TODOS_LOS_ESQUEMAS:
                cursor.execute(f"DROP SCHEMA IF EXISTS {esquema} CASCADE")
            cursor.execute("DROP SCHEMA IF EXISTS public CASCADE")
            cursor.execute("CREATE SCHEMA public")
        migrados = migrar(bd)
        sembrados = sembrar(bd, con_catalogos=con_catalogos) if con_seed else []
        if con_usuarios:
            sembrados.extend(sembrar_opcional(bd, "usuarios_areas.sql", forzar=True))
            sembrados.extend(sembrar_opcional(bd, "usuarios_hospitalizacion.sql", forzar=True))
        bd.commit()
        return migrados, sembrados


def formatear_estado(estados: list[EstadoScript]) -> str:
    lineas = [
        "Tipo              | Archivo                              | Estado                 | Lote | Fecha de ejecución",
        "------------------+--------------------------------------+------------------------+------+-------------------",
    ]
    for e in estados:
        if e.tipo == "migracion":
            tipo_txt = "Migración        "
        elif e.tipo == "seeder_opcional":
            tipo_txt = "Seeder (Opcional)"
        else:
            tipo_txt = "Seeder           "

        if e.modificado:
            est_txt = "MODIFICADO (hash != BD)"
        elif e.ejecutado and e.lote == 0:
            est_txt = "Ejecutado (base)"
        elif e.ejecutado:
            est_txt = "Ejecutado"
        elif e.tipo == "seeder_opcional":
            est_txt = "No aplicado (opcional)"
        else:
            est_txt = "Pendiente"
        lote_txt = str(e.lote) if e.lote is not None else "-"
        fecha_txt = e.fecha_ejecucion.strftime("%Y-%m-%d %H:%M:%S") if e.fecha_ejecucion else "-"
        lineas.append(f"{tipo_txt} | {e.nombre:<36} | {est_txt:<22} | {lote_txt:<4} | {fecha_txt}")
    return "\n".join(lineas)


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")

    args = list(sys.argv[1:] if argv is None else argv)
    comando = args[0] if args else "status"
    banderas = set(args[1:])

    comandos_validos = ("migrate", "status", "migrate:status", "seed", "seed:usuarios", "seed:hospitalizacion", "fresh", "migrate:fresh")
    if comando not in comandos_validos:
        print(
            f"Comando desconocido: «{comando}».\n"
            "Uso: python -m app.herramientas.bd [migrate | status | seed | seed:usuarios [--forzar] | seed:hospitalizacion [--forzar] | fresh [--seed] [--usuarios] [--forzar]]",
            file=sys.stderr,
        )
        return 1

    from app.datos.sesion import fabrica, motor  # import diferido

    destino = obtener_ajustes().url_base.split("@")[-1]
    print(f"[bd] Base de datos: {destino}")

    try:
        if comando in ("status", "migrate:status"):
            with fabrica()() as bd:
                estados = obtener_estado(bd, incluir_opcionales=True)
                bd.commit()
            print(formatear_estado(estados))
            modificados = [e.nombre for e in estados if e.modificado]
            if modificados:
                print(f"\n[bd] ATENCIÓN: Hay archivos modificados respecto a lo registrado en BD: {', '.join(modificados)}", file=sys.stderr)
                return 1
            return 0

        if comando == "migrate":
            with fabrica()() as bd:
                mig_base, _ = sincronizar_base_existente(bd)
                aplicados = migrar(bd)
                bd.commit()
            if mig_base:
                print(f"[bd] Migraciones preexistentes adoptadas (lote 0): {', '.join(mig_base)}")
            if aplicados:
                print(f"[bd] Migraciones aplicadas ({len(aplicados)}): {', '.join(aplicados)}")
            else:
                print("[bd] Nada por migrar: todas las migraciones están al día.")
            return 0

        if comando == "seed":
            with fabrica()() as bd:
                _, seed_base = sincronizar_base_existente(bd)
                aplicados = sembrar(bd)
                if "--usuarios" in banderas:
                    aplicados.extend(sembrar_opcional(bd, "usuarios_areas.sql", forzar="--forzar" in banderas))
                bd.commit()
            if seed_base:
                print(f"[bd] Seeders preexistentes adoptados (lote 0): {', '.join(seed_base)}")
            if aplicados:
                print(f"[bd] Seeders aplicados ({len(aplicados)}): {', '.join(aplicados)}")
            else:
                print("[bd] Nada por sembrar: todos los seeders primarios están al día.")
            return 0

        if comando == "seed:hospitalizacion":
            with fabrica()() as bd:
                aplicados = sembrar_opcional(bd, "usuarios_hospitalizacion.sql", forzar="--forzar" in banderas)
                bd.commit()
            print(f"[bd] Cuentas de hospitalización aplicadas: {', '.join(aplicados)} (contraseña: 1234567890)")
            return 0

        if comando == "seed:usuarios":
            forzar = "--forzar" in banderas
            with fabrica()() as bd:
                aplicados = sembrar_opcional(bd, "usuarios_areas.sql", forzar=forzar)
                bd.commit()
            print(f"[bd] Seeder opcional de usuarios aplicado: {', '.join(aplicados)} (contraseña: 1234567890)")
            return 0

        if comando in ("fresh", "migrate:fresh"):
            con_seed = "--seed" in banderas or "--usuarios" in banderas
            con_usuarios = "--usuarios" in banderas
            migrados, sembrados = recrear_desde_cero(motor(), con_seed=con_seed, con_usuarios=con_usuarios, forzar="--forzar" in banderas)
            print(f"[bd] Esquemas recreados desde cero. Migraciones aplicadas ({len(migrados)}): {', '.join(migrados)}")
            if con_seed:
                print(f"[bd] Seeders aplicados ({len(sembrados)}): {', '.join(sembrados)}")
            return 0

    except ErrorMigracion as e:
        print(f"[bd] Error: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
