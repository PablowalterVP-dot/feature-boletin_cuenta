"""Los avisos de quien hace la petición.

Solo lectura. No tiene consultas propias salvo la fecha del último cambio: se apoya en la
lista de reportes y en los recibidos, así que hereda **tal cual** su visibilidad (un
borrador solo lo ve quien lo trabaja) y su semáforo (en hora de Lima, con el reloj
inyectable). Un aviso no puede contar algo que la persona no podría ver en la lista.

Los ámbitos salen de las asignaciones, igual que el tipo de usuario de la interfaz
(`servicios/api.js`, `usuarioDesdeBackend`): `digitador`/`admin` en una unidad → área;
`revisor` → Estadística; `consulta` en una unidad → oficina. Una cuenta sin ninguno
(el superadmin) no recibe avisos, y eso no es un error.
"""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.datos import avisos as repo
from app.dominio import avisos as reglas
from app.dominio import periodos, permisos, roles
from app.dominio.consultas import DESACTUALIZADA, MAXIMO_POR_PAGINA
from app.dominio.reloj import Reloj, hoy as hoy_de
from app.dominio.sesion import Sesion
from app.servicios import consultas
from app.servicios.errores import NoEncontrado, SinPermiso

# Cuántos meses hacia atrás se miran, contando el vigente. Un año: lo que quedó sin
# cerrar el año pasado sigue siendo deuda, pero más atrás ya es otro trámite.
MESES_DE_LA_VENTANA = 12


@dataclass(frozen=True)
class Avisos:
    generado_en: datetime
    periodo_vigente: str
    avisos: list[reglas.Aviso]


def _todas_las_paginas(pedir: Callable[[int], object]) -> Iterator:
    """Recorre una lista paginada entera. Los avisos resumen todo lo visible, no una
    página: un reporte atrasado en la página dos sigue atrasado."""
    pagina = 1
    while True:
        r = pedir(pagina)
        yield from r.filas
        if pagina >= r.pagina.paginas:
            return
        pagina += 1


def _unidades_de(sesion: Sesion, rol_de_interfaz: str) -> set[str]:
    return {a.unidad for a in sesion.asignaciones if a.unidad and roles.rol_de_interfaz(a.rol) == rol_de_interfaz}


def avisos_de(bd: Session, sesion: Sesion, reloj: Reloj) -> Avisos:
    hoy = hoy_de(reloj)
    vigente = periodos.periodo_vigente(hoy)
    desde = periodos.mes_anterior(vigente, MESES_DE_LA_VENTANA - 1)

    de_area = _unidades_de(sesion, roles.AREA)
    es_estadistica = any(roles.rol_de_interfaz(a.rol) == roles.ESTADISTICA for a in sesion.asignaciones)
    oficinas = sorted(_unidades_de(sesion, roles.OFICINA))
    avisos: list[reglas.Aviso] = []

    if (de_area or es_estadistica) and sesion.puede_en_alguna(permisos.REPORTE_VER):
        filas = list(_todas_las_paginas(lambda p: consultas.listar_reportes(bd, sesion, reloj, desde=desde, hasta=vigente, pagina=p, por_pagina=MAXIMO_POR_PAGINA)))
        cambios = repo.ultimo_cambio(bd, [(f.formato, f.periodo) for f in filas if f.estado != "no_iniciado"])
        renglones = [
            reglas.Renglon(
                periodo=f.periodo, formato=f.formato, formato_nombre=f.formato_nombre, unidad=f.unidad, unidad_nombre=f.unidad_nombre,
                estado=f.estado, semaforo=f.semaforo, dias_de_retraso=f.dias_de_retraso, fecha_limite=f.fecha_limite,
                fecha_envio=f.fecha_envio, fecha_validacion=f.fecha_validacion, numero_rectificacion=f.numero_rectificacion,
                folio_constancia=f.folio_constancia, fecha_cambio=cambios.get((f.formato.upper(), f.periodo)),
            )
            for f in filas
        ]
        if de_area:
            avisos += reglas.avisos_de_area((r for r in renglones if r.unidad in de_area), vigente)
        if es_estadistica:
            avisos += reglas.avisos_de_estadistica(renglones, vigente)

    for oficina in oficinas:
        try:
            recibidos = list(_todas_las_paginas(lambda p: consultas.listar_recibidos(bd, sesion, clave=oficina, desde=desde, hasta=vigente, pagina=p, por_pagina=MAXIMO_POR_PAGINA)))
        except (NoEncontrado, SinPermiso):
            # Una consulta asignada a una unidad que no recibe reportes (o sin permiso
            # de ver): no tiene recepciones de las que avisar.
            continue
        reabiertos = repo.ultimo_cambio(bd, [(r.formato, r.periodo) for r in recibidos if r.estado_de_recepcion == DESACTUALIZADA])
        avisos += reglas.avisos_de_oficina(
            oficina,
            (
                reglas.Recibido(
                    periodo=r.periodo, formato=r.formato, unidad_nombre=r.unidad_nombre, estado_de_recepcion=r.estado_de_recepcion,
                    constancia=r.constancia,
                    # Desactualizado: cuándo se reabrió. Si no, cuándo llegó lo más reciente.
                    fecha=reabiertos.get((r.formato.upper(), r.periodo)) if r.estado_de_recepcion == DESACTUALIZADA else r.remisiones[0].fecha,
                )
                for r in recibidos
            ),
            vigente,
        )

    return Avisos(generado_en=reloj.ahora(), periodo_vigente=vigente, avisos=reglas.ordenar(avisos))
