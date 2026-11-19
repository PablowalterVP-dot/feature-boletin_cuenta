"""Los permisos de `seguridad.permiso` que usa el backend.

Son los códigos que Alejandro siembra en `04_semilla.sql` (`<modulo>.<accion>`).
El backend autoriza preguntando por un permiso **y** por la unidad sobre la que
se quiere actuar: `Sesion.puede(REPORTE_ENVIAR, "nutricion")`. Tener el permiso en
otra unidad no basta.

Solo se listan los que hoy se usan; una prueba comprueba que existen en la base.
"""

REPORTE_VER = "reporte.ver"
REPORTE_DESCARGAR = "reporte.descargar"
REPORTE_CARGAR = "reporte.cargar"  # crea el reporte, sube el Excel, corrige y justifica
REPORTE_ENVIAR = "reporte.enviar"
REPORTE_REVISAR = "reporte.revisar"
REPORTE_VALIDAR = "reporte.validar"
REPORTE_REMITIR = "reporte.remitir"
REPORTE_RECTIFICAR = "reporte.rectificar"
REPORTE_ELIMINAR = "reporte.eliminar"
REMISION_EXTERNA = "remision.externa"  # el consolidado a DIRESA

# Los del módulo de indicadores de desempeño. No son de Alejandro: los siembra
# `bd/desempeno/02_tablero.sql`, acordado con él. Estadística ve; solo el
# superadministrador carga.
DESEMPENO_VER = "desempeno.ver"
DESEMPENO_CARGAR = "desempeno.cargar"  # subir datos, resultado de MINSA, fuentes de cada ficha, seguimiento de casos

# Las actividades operativas del POI (seeder 0005_planeamiento.sql): Planeamiento
# las ve y las registra, con alcance global.
ACTIVIDAD_VER = "actividad.ver"
ACTIVIDAD_REGISTRAR = "actividad.registrar"

# Monitoreo Indicadores (seeder 0006_monitoreo.sql): Estadística digita lo de las oficinas y
# actualiza los compromisos. Dirección General solo mira. El reporte DL 1153 ya no entra por
# este permiso (03/11/2026): lo carga el superadministrador, con DESEMPENO_CARGAR, y
# Estadística solo mira lo cargado. La descripción que dejó el seeder 0006 en la base todavía
# lo nombra: un seeder aplicado no se reescribe, porque la base guarda su huella.
MONITOREO_REGISTRAR = "monitoreo.registrar"

# Boletín (seeder 0012): la encargada ve el boletín y el panel de monitoreo de
# sus datos. No lleva `desempeno.ver`, así que no ve la lista de pacientes de
# la ficha 14: solo las cifras agregadas que alimentan el boletín.
BOLETIN_VER = "boletin.ver"

# Hospitalización (seeder 0009, decisión 0011 de Egresos). Esta API no los usa: viajan en
# el token y los autoriza la API de hospitalización (`app/cuentas_estadistica.py`). Se
# listan para que la prueba de contrato compruebe que existen en la base.
HOSPITALIZACION_VER = "hospitalizacion.ver"
HOSPITALIZACION_OPERAR = "hospitalizacion.operar"
HOSPITALIZACION_SUPERVISAR = "hospitalizacion.supervisar"
HOSPITALIZACION_ADMISION = "hospitalizacion.admision"
HOSPITALIZACION_CAMAS = "hospitalizacion.camas"
HOSPITALIZACION_MANTENIMIENTO = "hospitalizacion.mantenimiento"
HOSPITALIZACION_VALIDAR = "hospitalizacion.validar"
HOSPITALIZACION = (
    HOSPITALIZACION_VER,
    HOSPITALIZACION_OPERAR,
    HOSPITALIZACION_SUPERVISAR,
    HOSPITALIZACION_ADMISION,
    HOSPITALIZACION_CAMAS,
    HOSPITALIZACION_MANTENIMIENTO,
    HOSPITALIZACION_VALIDAR,
)

USADOS = (
    REPORTE_VER, REPORTE_DESCARGAR, REPORTE_CARGAR, REPORTE_ENVIAR, REPORTE_REVISAR,
    REPORTE_VALIDAR, REPORTE_REMITIR, REPORTE_RECTIFICAR, REPORTE_ELIMINAR, REMISION_EXTERNA,
    DESEMPENO_VER, DESEMPENO_CARGAR, ACTIVIDAD_VER, ACTIVIDAD_REGISTRAR, MONITOREO_REGISTRAR,
    BOLETIN_VER,
    *HOSPITALIZACION,
)
