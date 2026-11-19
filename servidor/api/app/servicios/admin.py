"""El panel del superadministrador: resumen, funcionamiento, plazos, cuentas,
áreas y matriz, bitácora, personalización y soporte.

Lee y escribe **solo** tablas que ya existen en el esquema de Alejandro: los
cambios de configuración son filas de `organizacion.parametro` y de
`organizacion.destino`, y las cuentas son `seguridad.usuario` y
`seguridad.usuario_rol`. Nada de esto altera el esquema. Cada escritura pasa
por una sesión con `app.usuario_id` fijado (`bd_auditada`), así que los
disparadores dejan en `auditoria.registro_cambio` quién cambió qué, con el
antes y el después: el panel no lleva una bitácora propia, la lee.

Las funciones no confirman: el endpoint hace un solo `commit()` al final (ver
`dependencias.fijar_auditoria`).
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import httpx

from app.herramientas.bd import archivos_migraciones
from app.servicios import registro
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

from app.config import Ajustes
from app.datos.base import vigente
from app.datos.modelos import (
    Carga,
    Destino,
    EstadoReporte,
    Formato,
    FormatoVersion,
    Parametro,
    Periodo,
    Reporte,
    ReporteHistorialEstado,
    Rol,
    UnidadOrganica,
    Usuario,
    UsuarioRol,
)
from app.datos import parametros as repo_parametros
from app.dominio import alertas, configuracion, periodos, plazos
from app.dominio.claves import CLAVE_POR_ASIGNAR, problemas_de_clave
from app.dominio.configuracion import ValorInvalido
from app.dominio.reloj import ZONA
from app.dominio.sesion import Sesion
from app.herramientas.asignar_clave import NoSePuede as ClaveNoSePuede
from app.herramientas.asignar_clave import asignar_clave
from app.herramientas.crear_usuario import NoSePuede as CuentaNoSePuede
from app.herramientas.crear_usuario import crear_usuario


class NoEncontrado(LookupError):
    """La cuenta, la unidad o la fila pedida no existe."""


class Conflicto(ValueError):
    """La operación es válida en forma pero dejaría el sistema en un estado que
    no debe existir (sin superadministrador, una cuenta que se desactiva a sí
    misma…)."""


DESTINO_ENTREGA = "estadistica"


# ======================================================================= utilidades


def _hoy(ahora: datetime) -> date:
    return ahora.astimezone(ZONA).date()


def _fijar_parametro(bd: Session, clave: str, valor: str | None, *, tipo: str = "texto", descripcion: str | None = None) -> None:
    """Escribe una clave de `organizacion.parametro`. `None` la borra
    lógicamente (vuelve a su valor por omisión), sin perder su historia."""
    fila = bd.scalar(select(Parametro).where(Parametro.clave == clave, vigente(Parametro)))
    if valor is None:
        if fila is not None:
            fila.fecha_eliminacion = func.now()
        return
    if fila is None:
        bd.add(Parametro(clave=clave, valor=valor, tipo_dato=tipo, descripcion=descripcion))
    elif fila.valor != valor or (descripcion and fila.descripcion != descripcion):
        fila.valor = valor
        fila.tipo_dato = tipo
        if descripcion:
            fila.descripcion = descripcion
    bd.flush()


def _unidad(bd: Session, clave: str) -> UnidadOrganica:
    u = bd.scalar(select(UnidadOrganica).where(UnidadOrganica.clave == clave, vigente(UnidadOrganica)))
    if u is None:
        raise NoEncontrado(f"No existe la unidad «{clave}».")
    return u


def _unidades_reportantes(bd: Session) -> list[UnidadOrganica]:
    return list(
        bd.scalars(
            select(UnidadOrganica).where(UnidadOrganica.es_reportante, vigente(UnidadOrganica)).order_by(UnidadOrganica.nombre)
        )
    )


@dataclass(frozen=True)
class FormatoDeUnidad:
    codigo: str
    nombre: str
    version_activa: str | None


def _formatos_por_unidad(bd: Session) -> dict[int, FormatoDeUnidad]:
    """El formato vigente de cada unidad y el código de su versión activa (si
    tiene una). Una unidad sin fila aquí todavía no tiene cómo leerse su Excel."""
    filas = bd.execute(
        select(Formato.unidad_organica_id, Formato.codigo, Formato.nombre, FormatoVersion.codigo_version)
        .outerjoin(
            FormatoVersion,
            and_(FormatoVersion.formato_id == Formato.id, FormatoVersion.estado == "activa", vigente(FormatoVersion)),
        )
        .where(vigente(Formato), Formato.es_activo)
    ).all()
    resultado: dict[int, FormatoDeUnidad] = {}
    for unidad_id, codigo, nombre, version in filas:
        previo = resultado.get(unidad_id)
        if previo is None or (previo.version_activa is None and version is not None):
            resultado[unidad_id] = FormatoDeUnidad(codigo, nombre, version)
    return resultado


def areas_en_flujo(bd: Session) -> list[dict]:
    """Las áreas que reportan por el sistema: con formato y versión activa, y
    sin pausar (`dominio/configuracion.esta_en_flujo`). Es lo que el frontend usa
    en lugar de una lista escrita en su código."""
    parametros = repo_parametros.valores(bd, configuracion.PREFIJO_FLUJO)
    formatos = _formatos_por_unidad(bd)
    salida = []
    for u in _unidades_reportantes(bd):
        f = formatos.get(u.id)
        if u.es_activo and configuracion.esta_en_flujo(parametros, u.clave, tiene_formato_activo=bool(f and f.version_activa)):
            salida.append({"clave": u.clave, "formato": f.codigo})
    return salida


def _fecha_limite(parametros_plazo: dict[str, str], periodo: str, codigo_unidad: str) -> date:
    dia = plazos.dia_de_entrega(parametros_plazo, codigo_unidad, DESTINO_ENTREGA)
    return plazos.ajustar_a_dia_habil(periodos.plazo_de(periodo, dia), parametros_plazo)


# =========================================================================== resumen


def resumen(bd: Session, ahora: datetime) -> dict:
    hoy = _hoy(ahora)
    vigente_p = periodos.periodo_vigente(hoy)
    anio = periodos.anio_de(vigente_p)
    parametros_plazo = repo_parametros.valores(bd, plazos.PREFIJO)
    parametros_flujo = repo_parametros.valores(bd, configuracion.PREFIJO_FLUJO)
    formatos = _formatos_por_unidad(bd)

    filas = bd.execute(
        select(
            Formato.unidad_organica_id, Periodo.anio, Periodo.mes, EstadoReporte.codigo,
            Reporte.fecha_envio, Reporte.numero_rectificacion, Reporte.observacion,
        )
        .join(Formato, Formato.id == Reporte.formato_id)
        .join(Periodo, Periodo.id == Reporte.periodo_id)
        .join(EstadoReporte, EstadoReporte.id == Reporte.estado_reporte_id)
        .where(vigente(Reporte), Periodo.anio == anio)
    ).all()

    unidades = _unidades_reportantes(bd)
    por_unidad: dict[int, list] = {}
    for f in filas:
        por_unidad.setdefault(f.unidad_organica_id, []).append(f)

    enviados = a_tiempo = 0
    areas = []
    for u in unidades:
        suyas = por_unidad.get(u.id, [])
        formato = formatos.get(u.id)
        estado_vigente = "no_iniciado"
        ultimo = None
        for f in suyas:
            periodo = f"{f.anio:04d}-{f.mes:02d}"
            if periodo == vigente_p:
                estado_vigente = f.codigo
            # Una carga histórica (herramientas/cargar_historico.py) lleva la fecha
            # del día en que se cargó, no la de cuando el área lo entregó en papel:
            # no dice nada de su puntualidad, y no se cuenta.
            historica = (f.observacion or "").startswith("Carga histórica")
            if f.fecha_envio is not None and not historica:
                limite = _fecha_limite(parametros_plazo, periodo, u.codigo)
                puntual = f.fecha_envio.astimezone(ZONA).date() <= limite
                enviados += 1
                a_tiempo += puntual
                if ultimo is None or f.fecha_envio > ultimo["fecha"]:
                    ultimo = {"periodo": periodo, "fecha": f.fecha_envio, "a_tiempo": puntual}
        areas.append({
            "clave": u.clave,
            "codigo": u.codigo,
            "nombre": u.nombre_corto or u.nombre,
            "activa": u.es_activo,
            "formato": formato.codigo if formato else None,
            "version_activa": formato.version_activa if formato else None,
            "en_flujo": u.es_activo and configuracion.esta_en_flujo(parametros_flujo, u.clave, tiene_formato_activo=bool(formato and formato.version_activa)),
            "estado_periodo_vigente": estado_vigente,
            "fecha_limite_vigente": _fecha_limite(parametros_plazo, vigente_p, u.codigo),
            "ultimo_envio": ultimo,
        })

    rectificaciones = bd.scalar(
        select(func.count())
        .select_from(ReporteHistorialEstado)
        .where(ReporteHistorialEstado.accion == "rectificar", vigente(ReporteHistorialEstado), func.extract("year", ReporteHistorialEstado.fecha_creacion) == anio)
    )
    return {
        "hoy": hoy,
        "periodo_vigente": vigente_p,
        "anio": anio,
        "areas": areas,
        "enviados_del_anio": enviados,
        "a_tiempo_del_anio": a_tiempo,
        # Sin envíos, no hay puntualidad que medir: nulo, no 0 %.
        "puntualidad": round(a_tiempo / enviados * 100, 1) if enviados else None,
        "rectificaciones_del_anio": rectificaciones or 0,
    }


# ===================================================================== funcionamiento


def funcionamiento(bd: Session, ajustes: Ajustes, ahora: datetime) -> dict:
    hace_30 = ahora - timedelta(days=30)
    hace_7 = ahora - timedelta(days=7)

    version_bd = bd.scalar(text("SHOW server_version"))
    bot = {"configurado": bool(ajustes.bot_validador_url), "responde": None, "version": None, "areas": [], "detalle": None}
    if ajustes.bot_validador_url:
        try:
            r = httpx.get(f"{ajustes.bot_validador_url.rstrip('/')}/salud", timeout=3)
            bot["responde"] = r.status_code == 200
            cuerpo = r.json() if r.status_code == 200 else {}
            # El bot responde { ok, bot: { version, … }, areas: [claves] }.
            datos_bot = cuerpo.get("bot") if isinstance(cuerpo.get("bot"), dict) else {}
            bot["version"] = datos_bot.get("version")
            bot["areas"] = [a for a in cuerpo.get("areas", []) if isinstance(a, str)]
            bot["detalle"] = None if r.status_code == 200 else f"Respondió {r.status_code}."
        except (httpx.HTTPError, ValueError) as e:
            bot["responde"] = False
            bot["detalle"] = f"No responde: {type(e).__name__}."

    por_resultado = dict(
        bd.execute(select(Carga.resultado, func.count()).where(vigente(Carga), Carga.fecha_creacion >= hace_30).group_by(Carga.resultado)).all()
    )
    motivos = [
        {"codigo": codigo, "detalle": detalle, "veces": veces}
        for codigo, detalle, veces in bd.execute(
            select(Carga.codigo_bloqueo, func.max(Carga.detalle_bloqueo), func.count())
            .where(vigente(Carga), Carga.resultado == "bloqueada", Carga.fecha_creacion >= hace_30)
            .group_by(Carga.codigo_bloqueo)
            .order_by(func.count().desc())
            .limit(5)
        ).all()
    ]

    cuentas = vigente(Usuario)
    total = bd.scalar(select(func.count()).select_from(Usuario).where(cuentas)) or 0
    activas = bd.scalar(select(func.count()).select_from(Usuario).where(cuentas, Usuario.es_activo)) or 0
    recientes = bd.scalar(select(func.count()).select_from(Usuario).where(cuentas, Usuario.fecha_ultimo_acceso >= hace_7)) or 0
    nunca = bd.scalar(select(func.count()).select_from(Usuario).where(cuentas, Usuario.es_activo, Usuario.fecha_ultimo_acceso.is_(None))) or 0
    provisionales = bd.scalar(
        select(func.count()).select_from(Usuario).where(cuentas, Usuario.es_activo, Usuario.debe_cambiar_contrasena, Usuario.contrasena_hash != CLAVE_POR_ASIGNAR)
    ) or 0
    sin_clave = bd.scalar(select(func.count()).select_from(Usuario).where(cuentas, Usuario.es_activo, Usuario.contrasena_hash == CLAVE_POR_ASIGNAR)) or 0

    aplicadas = set(bd.scalars(text("SELECT nombre FROM public.migraciones")).all())
    pendientes = [a.name for a in archivos_migraciones() if a.name not in aplicadas]

    return {
        "api": {"version": "0.1.0", "hora_del_servidor": ahora},
        "base_de_datos": {"responde": True, "version": version_bd, "migraciones_pendientes": pendientes},
        "vigilancia": registro.vigilancia(bd),
        "bot": bot,
        "cargas_30_dias": {"aceptadas": por_resultado.get("aceptada", 0), "bloqueadas": por_resultado.get("bloqueada", 0), "motivos": motivos},
        "cuentas": {
            "total": total, "activas": activas, "entraron_7_dias": recientes, "nunca_entraron": nunca,
            "con_clave_provisional": provisionales, "sin_clave": sin_clave,
        },
    }


# ============================================================================ plazos


def ver_plazos(bd: Session, ahora: datetime) -> dict:
    hoy = _hoy(ahora)
    vigente_p = periodos.periodo_vigente(hoy)
    p_plazo = repo_parametros.valores(bd, plazos.PREFIJO)
    p_alerta = repo_parametros.valores(bd, alertas.PREFIJO)

    def dia_propio(area: str, destino: str) -> int | None:
        valor = p_plazo.get(plazos.clave(area, destino))
        return int(valor) if valor and valor.isdigit() else None

    areas = []
    for u in _unidades_reportantes(bd):
        propio = dia_propio(u.codigo, DESTINO_ENTREGA)
        alerta_propia = p_alerta.get(alertas.clave(u.codigo))
        areas.append({
            "clave": u.clave,
            "codigo": u.codigo,
            "nombre": u.nombre_corto or u.nombre,
            "dia_propio": propio,
            "dia_efectivo": plazos.dia_de_entrega(p_plazo, u.codigo, DESTINO_ENTREGA),
            "fecha_limite_vigente": _fecha_limite(p_plazo, vigente_p, u.codigo),
            "alerta_dias_propio": int(alerta_propia) if alerta_propia and alerta_propia.isdigit() else None,
            "alerta_dias_efectivo": alertas.dias_minimos_para_alertar(p_alerta, u.codigo),
        })
    respaldo_alerta = p_alerta.get(alertas.clave(alertas.AREA_RESPALDO))
    return {
        "periodo_vigente": vigente_p,
        "respaldo_estadistica": dia_propio(plazos.AREA_RESPALDO, DESTINO_ENTREGA),
        "respaldo_planeamiento": dia_propio(plazos.AREA_RESPALDO, "planeamiento"),
        "dia_diresa": dia_propio("EST", "diresa"),
        "alerta_respaldo": int(respaldo_alerta) if respaldo_alerta and respaldo_alerta.isdigit() else None,
        "correr_a_dia_habil": plazos.corre_a_dia_habil(p_plazo),
        "feriados": sorted(({"fecha": f, "descripcion": d} for f, d in plazos.feriados_de(p_plazo).items()), key=lambda x: x["fecha"]),
        "areas": areas,
    }


def fijar_plazo(bd: Session, area: str, destino: str, dia: int | None) -> None:
    """`area` es el código de la unidad (`NUT`) o `default`. `None` quita el
    plazo propio: el área vuelve al respaldo."""
    if destino not in (DESTINO_ENTREGA, "planeamiento", "diresa"):
        raise ValorInvalido("El destino es estadistica, planeamiento o diresa.")
    if area != plazos.AREA_RESPALDO and bd.scalar(select(UnidadOrganica.id).where(UnidadOrganica.codigo == area, vigente(UnidadOrganica))) is None:
        raise NoEncontrado(f"No existe una unidad con código «{area}».")
    if dia is not None and not (plazos.DIA_MINIMO <= dia <= plazos.DIA_MAXIMO):
        raise ValorInvalido(f"El día va de {plazos.DIA_MINIMO} a {plazos.DIA_MAXIMO}: todos los meses los tienen.")
    if dia is None and area == plazos.AREA_RESPALDO and destino == DESTINO_ENTREGA:
        raise ValorInvalido("El plazo general de entrega a Estadística no se puede quitar: es el respaldo de todas las áreas.")
    _fijar_parametro(
        bd, plazos.clave(area, destino), None if dia is None else str(dia), tipo="entero",
        descripcion=f"Día del mes siguiente en que vence la entrega de {area} a {destino} (panel de administración).",
    )


def fijar_regla_dia_habil(bd: Session, activa: bool) -> None:
    _fijar_parametro(
        bd, plazos.CORRER_A_DIA_HABIL, "true" if activa else None, tipo="booleano",
        descripcion="Un plazo que cae en fin de semana o feriado se corre al siguiente día hábil.",
    )


def agregar_feriado(bd: Session, fecha: date, descripcion: str) -> None:
    texto_ = configuracion.nombre_valido(descripcion, "La descripción del feriado", 120)
    _fijar_parametro(bd, plazos.clave_feriado(fecha), texto_, tipo="texto", descripcion="Feriado: no cuenta como día hábil para los plazos.")


def quitar_feriado(bd: Session, fecha: date) -> None:
    _fijar_parametro(bd, plazos.clave_feriado(fecha), None)


def fijar_alerta(bd: Session, area: str, dias: int | None) -> None:
    if area != alertas.AREA_RESPALDO and bd.scalar(select(UnidadOrganica.id).where(UnidadOrganica.codigo == area, vigente(UnidadOrganica))) is None:
        raise NoEncontrado(f"No existe una unidad con código «{area}».")
    if dias is not None and not (alertas.DIA_MINIMO <= dias <= alertas.DIA_MAXIMO):
        raise ValorInvalido(f"Los días van de {alertas.DIA_MINIMO} a {alertas.DIA_MAXIMO}.")
    _fijar_parametro(
        bd, alertas.clave(area), None if dias is None else str(dias), tipo="entero",
        descripcion="Días sin datos en una semana a partir de los que se avisa al área (panel de administración).",
    )


# =========================================================================== cuentas


def _asignaciones_de(bd: Session, usuario_ids: list[int]) -> dict[int, list[dict]]:
    filas = bd.execute(
        select(UsuarioRol.id, UsuarioRol.usuario_id, Rol.codigo, Rol.nombre, UnidadOrganica.clave, UnidadOrganica.nombre, UnidadOrganica.nombre_corto)
        .join(Rol, Rol.id == UsuarioRol.rol_id)
        .outerjoin(UnidadOrganica, UnidadOrganica.id == UsuarioRol.unidad_organica_id)
        .where(UsuarioRol.usuario_id.in_(usuario_ids), vigente(UsuarioRol), vigente(Rol))
        .order_by(UsuarioRol.id)
    ).all()
    salida: dict[int, list[dict]] = {}
    for id_, usuario_id, rol, rol_nombre, unidad, unidad_nombre, unidad_corto in filas:
        salida.setdefault(usuario_id, []).append(
            {"id": id_, "rol": rol, "rol_nombre": rol_nombre, "unidad": unidad, "unidad_nombre": unidad_corto or unidad_nombre}
        )
    return salida


def _cuenta_como_dict(u: Usuario, asignaciones: list[dict]) -> dict:
    return {
        "id": u.id,
        "usuario": u.nombre_usuario,
        "nombres": u.nombres,
        "apellidos": u.apellidos,
        "correo": u.correo,
        "cargo": u.cargo,
        "numero_documento": u.numero_documento,
        "telefono": u.telefono,
        "activa": u.es_activo,
        "clave": "sin_asignar" if u.contrasena_hash == CLAVE_POR_ASIGNAR else ("provisional" if u.debe_cambiar_contrasena else "definitiva"),
        "ultimo_acceso": u.fecha_ultimo_acceso,
        "creada": u.fecha_creacion,
        "asignaciones": asignaciones,
    }


def listar_cuentas(bd: Session) -> list[dict]:
    cuentas = list(bd.scalars(select(Usuario).where(vigente(Usuario)).order_by(Usuario.apellidos, Usuario.nombres)))
    asignaciones = _asignaciones_de(bd, [u.id for u in cuentas])
    return [_cuenta_como_dict(u, asignaciones.get(u.id, [])) for u in cuentas]


def _cuenta(bd: Session, usuario_id: int) -> Usuario:
    u = bd.scalar(select(Usuario).where(Usuario.id == usuario_id, vigente(Usuario)))
    if u is None:
        raise NoEncontrado("Esa cuenta no existe.")
    return u


def ver_cuenta(bd: Session, usuario_id: int) -> dict:
    u = _cuenta(bd, usuario_id)
    return _cuenta_como_dict(u, _asignaciones_de(bd, [u.id]).get(u.id, []))


def _correo_libre(bd: Session, correo: str | None, excepto: int | None = None) -> None:
    if correo is None:
        return
    otro = bd.scalar(select(Usuario.id).where(func.lower(Usuario.correo) == correo, vigente(Usuario)))
    if otro is not None and otro != excepto:
        raise Conflicto("Ese correo ya lo usa otra cuenta.")


def crear_cuenta(bd: Session, *, usuario: str, nombres: str, apellidos: str, correo: str | None, cargo: str | None,
                 numero_documento: str | None, rol: str, unidad: str | None, telefono: str | None = None) -> dict:
    nombre_usuario = configuracion.usuario_valido(usuario)
    if bd.scalar(select(Usuario.id).where(func.lower(Usuario.nombre_usuario) == nombre_usuario, vigente(Usuario))) is not None:
        raise Conflicto(f"Ya existe una cuenta «{nombre_usuario}».")
    correo_ = configuracion.correo_valido(correo)
    _correo_libre(bd, correo_)
    try:
        r = crear_usuario(
            bd, nombre_usuario, rol, unidad=unidad,
            nombres=configuracion.nombre_valido(nombres, "Los nombres"),
            apellidos=configuracion.nombre_valido(apellidos, "Los apellidos"),
            correo=correo_, cargo=configuracion.opcional_valido(cargo, "El cargo", 150),
        )
    except CuentaNoSePuede as e:
        raise ValorInvalido(str(e).replace("--unidad", "la unidad").replace("--nombres", "los nombres").replace("--apellidos", "los apellidos")) from e
    r.usuario.numero_documento = configuracion.opcional_valido(numero_documento, "El documento", 20)
    r.usuario.telefono = configuracion.telefono_valido(telefono)
    bd.flush()
    return ver_cuenta(bd, r.usuario.id)


def _superadmins_activos(bd: Session) -> set[int]:
    return set(
        bd.scalars(
            select(UsuarioRol.usuario_id)
            .join(Rol, Rol.id == UsuarioRol.rol_id)
            .join(Usuario, Usuario.id == UsuarioRol.usuario_id)
            .where(Rol.codigo == "superadmin", vigente(UsuarioRol), vigente(Usuario), Usuario.es_activo)
        )
    )


def editar_cuenta(bd: Session, actor: Sesion, usuario_id: int, cambios: dict) -> dict:
    """`cambios` trae solo lo que se cambia: nombres, apellidos, correo, cargo,
    numero_documento, telefono, activa. El nombre de usuario no cambia: es con lo que la
    persona entra y lo que la bitácora usa para reconocerla."""
    u = _cuenta(bd, usuario_id)
    if "nombres" in cambios:
        u.nombres = configuracion.nombre_valido(cambios["nombres"], "Los nombres")
    if "apellidos" in cambios:
        u.apellidos = configuracion.nombre_valido(cambios["apellidos"], "Los apellidos")
    if "correo" in cambios:
        correo_ = configuracion.correo_valido(cambios["correo"])
        _correo_libre(bd, correo_, excepto=u.id)
        u.correo = correo_
    if "cargo" in cambios:
        u.cargo = configuracion.opcional_valido(cambios["cargo"], "El cargo", 150)
    if "numero_documento" in cambios:
        u.numero_documento = configuracion.opcional_valido(cambios["numero_documento"], "El documento", 20)
    if "telefono" in cambios:
        u.telefono = configuracion.telefono_valido(cambios["telefono"])
    if "activa" in cambios and bool(cambios["activa"]) != u.es_activo:
        if not cambios["activa"]:
            if u.id == actor.usuario_id:
                raise Conflicto("No puede desactivar su propia cuenta: quedaría fuera del sistema.")
            if _superadmins_activos(bd) == {u.id}:
                raise Conflicto("Es el único superadministrador activo: active otro antes de desactivar este.")
        u.es_activo = bool(cambios["activa"])
    bd.flush()
    return ver_cuenta(bd, u.id)


def eliminar_cuenta(bd: Session, actor: Sesion, usuario_id: int) -> None:
    """Borrado lógico, como todo en la base: la cuenta y sus roles reciben
    `fecha_eliminacion` y dejan de existir para el sistema (no aparece en la
    lista, no puede entrar y su nombre de usuario y su correo quedan libres).
    Lo que hizo —reportes, cargas, la bitácora— sigue apuntando a su fila, que
    no se borra: borrarla de verdad dejaría esa historia sin autor.

    Las mismas protecciones que al desactivar: nadie se elimina a sí mismo ni
    deja al sistema sin superadministrador activo."""
    u = _cuenta(bd, usuario_id)
    if u.id == actor.usuario_id:
        raise Conflicto("No puede eliminar su propia cuenta: quedaría fuera del sistema.")
    if _superadmins_activos(bd) == {u.id}:
        raise Conflicto("Es el único superadministrador activo: active otro antes de eliminar este.")
    for fila in bd.scalars(select(UsuarioRol).where(UsuarioRol.usuario_id == u.id, vigente(UsuarioRol))):
        fila.fecha_eliminacion = func.now()
    u.es_activo = False
    u.fecha_eliminacion = func.now()
    bd.flush()


def asignar_rol(bd: Session, usuario_id: int, rol: str, unidad: str | None) -> dict:
    u = _cuenta(bd, usuario_id)
    try:
        r = crear_usuario(bd, u.nombre_usuario, rol, unidad=unidad)
    except CuentaNoSePuede as e:
        raise ValorInvalido(str(e).replace("--unidad", "la unidad")) from e
    if not r.asignacion_nueva:
        raise Conflicto("La cuenta ya tiene ese rol en esa unidad.")
    return ver_cuenta(bd, u.id)


def quitar_rol(bd: Session, actor: Sesion, usuario_id: int, asignacion_id: int) -> dict:
    u = _cuenta(bd, usuario_id)
    fila = bd.scalar(select(UsuarioRol).where(UsuarioRol.id == asignacion_id, UsuarioRol.usuario_id == u.id, vigente(UsuarioRol)))
    if fila is None:
        raise NoEncontrado("Esa asignación no existe.")
    es_superadmin = bd.scalar(select(Rol.codigo).where(Rol.id == fila.rol_id)) == "superadmin"
    if es_superadmin:
        if u.id == actor.usuario_id:
            raise Conflicto("No puede quitarse a sí mismo el rol de superadministrador.")
        if _superadmins_activos(bd) == {u.id}:
            raise Conflicto("Es el único superadministrador activo: no se le puede quitar el rol.")
    fila.fecha_eliminacion = func.now()
    bd.flush()
    return ver_cuenta(bd, u.id)


def restablecer_clave(bd: Session, usuario_id: int, clave: str, *, provisional: bool = True) -> dict:
    u = _cuenta(bd, usuario_id)
    problemas = problemas_de_clave(clave, u.nombre_usuario)
    if problemas:
        raise ValorInvalido(" ".join(problemas))
    try:
        asignar_clave(bd, u.nombre_usuario, clave, provisional=provisional)
    except ClaveNoSePuede as e:
        raise ValorInvalido(str(e)) from e
    return ver_cuenta(bd, u.id)


def catalogo(bd: Session) -> dict:
    roles_ = [
        {"codigo": r.codigo, "nombre": r.nombre, "descripcion": r.descripcion, "alcance": r.alcance}
        for r in bd.scalars(select(Rol).where(vigente(Rol)).order_by(Rol.id))
    ]
    unidades = [
        {
            "clave": u.clave, "codigo": u.codigo, "nombre": u.nombre, "nombre_corto": u.nombre_corto,
            "es_reportante": u.es_reportante, "es_receptora": u.es_receptora, "es_estadistica": u.es_estadistica,
            "es_externa": u.es_externa, "activa": u.es_activo,
        }
        for u in bd.scalars(select(UnidadOrganica).where(vigente(UnidadOrganica)).order_by(UnidadOrganica.nombre))
    ]
    return {"roles": roles_, "unidades": unidades}


# ======================================================================== áreas y matriz


def ver_areas(bd: Session) -> list[dict]:
    parametros = repo_parametros.valores(bd, configuracion.PREFIJO_FLUJO)
    formatos = _formatos_por_unidad(bd)
    salida = []
    for u in _unidades_reportantes(bd):
        f = formatos.get(u.id)
        tiene = bool(f and f.version_activa)
        salida.append({
            "clave": u.clave, "codigo": u.codigo, "nombre": u.nombre, "nombre_corto": u.nombre_corto, "activa": u.es_activo,
            "formato": f.codigo if f else None, "formato_nombre": f.nombre if f else None, "version_activa": f.version_activa if f else None,
            "pausada": parametros.get(configuracion.clave_flujo(u.clave)) == "false",
            "en_flujo": u.es_activo and configuracion.esta_en_flujo(parametros, u.clave, tiene_formato_activo=tiene),
        })
    return salida


def fijar_flujo(bd: Session, clave: str, en_flujo: bool, justificacion: str) -> None:
    u = _unidad(bd, clave)
    configuracion.justificacion_valida(justificacion)
    if en_flujo:
        formato = _formatos_por_unidad(bd).get(u.id)
        if not (formato and formato.version_activa):
            raise Conflicto(f"{u.nombre_corto or u.nombre} no tiene un formato con versión activa: no hay cómo leer su Excel todavía.")
    _fijar_parametro(
        bd, configuracion.clave_flujo(u.clave), None if en_flujo else "false", tipo="booleano",
        descripcion=f"Pausada en el flujo: {justificacion.strip()}" if not en_flujo else None,
    )


def ver_matriz(bd: Session, ahora: datetime) -> dict:
    hoy = _hoy(ahora)
    origen = UnidadOrganica.__table__.alias("u_origen")
    # Alias que no coincidan con la tabla `organizacion.destino` de la consulta.
    destino = UnidadOrganica.__table__.alias("u_destino")
    filas = bd.execute(
        select(
            Destino.id, origen.c.clave, origen.c.nombre_corto, origen.c.nombre, destino.c.clave, destino.c.nombre_corto, destino.c.nombre,
            Destino.es_entrega_inmediata, Destino.fecha_inicio_vigencia, Destino.fecha_fin_vigencia, Destino.observacion,
        )
        .join(origen, origen.c.id == Destino.unidad_origen_id)
        .join(destino, destino.c.id == Destino.unidad_destino_id)
        .where(vigente(Destino))
        .order_by(origen.c.nombre, destino.c.nombre, Destino.fecha_inicio_vigencia)
    ).all()
    vigentes, historicas = [], []
    for id_, o_clave, o_corto, o_nombre, d_clave, d_corto, d_nombre, inmediata, desde, hasta, obs in filas:
        fila = {
            "id": id_, "origen": o_clave, "origen_nombre": o_corto or o_nombre, "destino": d_clave, "destino_nombre": d_corto or d_nombre,
            "entrega_inmediata": inmediata, "desde": desde, "hasta": hasta, "observacion": obs,
        }
        (vigentes if desde <= hoy and (hasta is None or hasta >= hoy) else historicas).append(fila)
    return {"vigentes": vigentes, "historicas": historicas}


def agregar_destino(bd: Session, ahora: datetime, origen: str, destino: str, entrega_inmediata: bool, justificacion: str) -> None:
    motivo = configuracion.justificacion_valida(justificacion)
    u_origen, u_destino = _unidad(bd, origen), _unidad(bd, destino)
    if not u_origen.es_reportante:
        raise ValorInvalido(f"{u_origen.nombre} no reporta: no tiene matriz de destinos.")
    if not u_destino.es_receptora:
        raise ValorInvalido(f"{u_destino.nombre} no es una oficina receptora.")
    if u_origen.id == u_destino.id:
        raise ValorInvalido("Un área no se remite a sí misma.")
    hoy = _hoy(ahora)
    ya = bd.scalar(
        select(Destino.id).where(
            Destino.unidad_origen_id == u_origen.id, Destino.unidad_destino_id == u_destino.id, vigente(Destino),
            Destino.fecha_inicio_vigencia <= hoy, or_(Destino.fecha_fin_vigencia.is_(None), Destino.fecha_fin_vigencia >= hoy),
        )
    )
    if ya is not None:
        raise Conflicto("Ese destino ya está vigente en la matriz.")
    bd.add(Destino(
        unidad_origen_id=u_origen.id, unidad_destino_id=u_destino.id, es_entrega_inmediata=entrega_inmediata,
        fecha_inicio_vigencia=hoy, observacion=motivo,
    ))
    bd.flush()


def retirar_destino(bd: Session, ahora: datetime, destino_id: int, justificacion: str) -> None:
    """La vigencia termina ayer: desde hoy ya no se remite ahí, y lo remitido
    antes sigue explicado por la fila. Una fila que empezó hoy no tiene pasado
    que conservar: se borra lógicamente (el CHECK de vigencia no admite que
    termine antes de empezar)."""
    motivo = configuracion.justificacion_valida(justificacion)
    fila = bd.scalar(select(Destino).where(Destino.id == destino_id, vigente(Destino)))
    if fila is None:
        raise NoEncontrado("Ese destino no existe.")
    hoy = _hoy(ahora)
    if fila.fecha_fin_vigencia is not None and fila.fecha_fin_vigencia < hoy:
        raise Conflicto("Ese destino ya no estaba vigente.")
    nota = f"{fila.observacion + ' · ' if fila.observacion else ''}Retirado el {hoy.isoformat()}: {motivo}"
    fila.observacion = nota
    if fila.fecha_inicio_vigencia >= hoy:
        fila.fecha_eliminacion = func.now()
    else:
        fila.fecha_fin_vigencia = hoy - timedelta(days=1)
    bd.flush()


# =========================================================================== bitácora

# Nombres para personas, no para la base. Lo que no esté aquí sale con su
# nombre técnico, que también se entiende.
NOMBRE_DE_TABLA = {
    "seguridad.usuario": "Cuenta",
    "seguridad.usuario_rol": "Rol de una cuenta",
    "organizacion.parametro": "Configuración",
    "organizacion.destino": "Matriz de destinos",
    "organizacion.unidad_organica": "Unidad",
    "organizacion.periodo": "Periodo",
    "reporte.reporte": "Reporte",
    "reporte.reporte_historial_estado": "Paso del flujo",
    "reporte.carga": "Carga de Excel",
    "reporte.archivo": "Archivo",
    "reporte.valor": "Casillas",
    "reporte.hallazgo": "Hallazgos del bot",
    "reporte.remision": "Remisión a oficina",
    "reporte.remision_externa": "Remisión a DIRESA",
}

# Nunca salen del servidor, ni siquiera hacia el superadministrador.
_CAMPOS_SECRETOS = {"contrasena_hash"}


def _sin_secretos(datos: dict | None) -> dict | None:
    if not datos:
        return datos
    return {k: ("•••" if k in _CAMPOS_SECRETOS else v) for k, v in datos.items()}


def ver_bitacora(bd: Session, *, usuario_id: int | None, tabla: str | None, operacion: str | None,
                 desde: date | None, hasta: date | None, pagina: int, por_pagina: int) -> dict:
    condiciones = []
    if usuario_id is not None:
        condiciones.append(text("r.usuario_id = :usuario_id"))
    if tabla:
        condiciones.append(text("(r.esquema || '.' || r.tabla) = :tabla"))
    if operacion:
        condiciones.append(text("r.operacion = :operacion"))
    if desde:
        condiciones.append(text("r.fecha >= :desde"))
    if hasta:
        condiciones.append(text("r.fecha < :hasta_exclusivo"))
    donde = " AND ".join(str(c) for c in condiciones) or "TRUE"
    parametros_sql = {
        "usuario_id": usuario_id, "tabla": tabla, "operacion": operacion,
        "desde": datetime(desde.year, desde.month, desde.day, tzinfo=ZONA) if desde else None,
        "hasta_exclusivo": datetime(hasta.year, hasta.month, hasta.day, tzinfo=ZONA) + timedelta(days=1) if hasta else None,
        "limite": por_pagina, "desplazamiento": (pagina - 1) * por_pagina,
    }
    total = bd.execute(text(f"SELECT count(*) FROM auditoria.registro_cambio r WHERE {donde}"), parametros_sql).scalar_one()
    filas = bd.execute(
        text(
            f"""SELECT r.id, r.fecha, r.esquema, r.tabla, r.registro_id, r.operacion, r.campos_modificados,
                       r.datos_anteriores, r.datos_nuevos, r.usuario_id, r.direccion_ip::text AS ip,
                       u.nombre_usuario, u.nombres, u.apellidos
                  FROM auditoria.registro_cambio r
                  LEFT JOIN seguridad.usuario u ON u.id = r.usuario_id
                 WHERE {donde}
                 ORDER BY r.fecha DESC, r.id DESC
                 LIMIT :limite OFFSET :desplazamiento"""
        ),
        parametros_sql,
    ).mappings().all()
    return {
        "total": total, "pagina": pagina, "por_pagina": por_pagina, "paginas": max(1, -(-total // por_pagina)),
        "filas": [
            {
                "id": f["id"], "fecha": f["fecha"], "tabla": f"{f['esquema']}.{f['tabla']}",
                "tabla_nombre": NOMBRE_DE_TABLA.get(f"{f['esquema']}.{f['tabla']}", f"{f['esquema']}.{f['tabla']}"),
                "registro_id": f["registro_id"], "operacion": f["operacion"],
                "campos": [c for c in (f["campos_modificados"] or []) if c not in ("fecha_actualizacion",)],
                "antes": _sin_secretos(f["datos_anteriores"]), "despues": _sin_secretos(f["datos_nuevos"]),
                "usuario_id": f["usuario_id"],
                "usuario": f["nombre_usuario"],
                "usuario_nombre": f"{f['nombres']} {f['apellidos']}".strip() if f["nombres"] else None,
                "ip": f["ip"],
            }
            for f in filas
        ],
    }


# ==================================================================== personalización


def ver_personalizacion(bd: Session) -> configuracion.Personalizacion:
    return configuracion.personalizacion_de(repo_parametros.valores(bd, configuracion.PREFIJO_SISTEMA))


def guardar_personalizacion(bd: Session, p: configuracion.Personalizacion) -> None:
    for clave, valor in configuracion.filas_de_personalizacion(p).items():
        _fijar_parametro(bd, clave, valor, tipo="fecha" if clave == configuracion.AVISO_HASTA else "texto")


# =========================================================================== soporte


def registrar_ver_como(bd: Session, actor: Sesion, usuario_id: int, justificacion: str, ahora: datetime) -> Usuario:
    """Deja constancia de que el administrador entra a ver como otra cuenta.
    La fila se reescribe; la bitácora conserva cada vez (quién, a quién, cuándo
    y por qué)."""
    motivo = configuracion.justificacion_valida(justificacion)
    u = _cuenta(bd, usuario_id)
    if u.id == actor.usuario_id:
        raise ValorInvalido("Ya está en su propia cuenta.")
    if not u.es_activo:
        raise Conflicto("Esa cuenta está desactivada: no ve nada que mirar.")
    _fijar_parametro(
        bd, configuracion.clave_ver_como(actor.usuario_id),
        f"{u.nombre_usuario} · {ahora.astimezone(ZONA).isoformat(timespec='seconds')} · {motivo}",
        descripcion="Última vez que este administrador vio el sistema como otra cuenta (soporte, solo lectura).",
    )
    return u
