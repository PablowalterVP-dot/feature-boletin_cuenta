# 0013: Estadística solo visualiza hospitalización, y sin demostración

- **Estado:** Adoptada
- **Fecha:** 2026-11-15
- **Cambia:** [0010](0010-el-area-designa-y-registra-el-alta.md) (Estadística validaba las
  altas, recogía los censos y cerraba el mes) y [0011](0011-integracion-con-estadistica.md)
  (el rol aparte `validador_hospitalizacion`)

## Contexto

Al probar con las cuentas reales, la Oficina de Estadística tenía ocho módulos de
hospitalización y varias acciones: validar altas, recibir censos, cerrar el censo atrasado,
reabrirlo, cerrar el mes y registrar ajustes. Además tenía un rol aparte para eso y el
sistema traía un botón «Demostración» con un reloj simulado y pacientes ficticios. Se
decidió ordenarlo.

## Decisión

**Estadística solo mira.** La cuenta oficial (rol `revisor`, sin rol aparte: seeder `0011`)
ve tres módulos, todos de lectura:

| Módulo | Qué ve |
|---|---|
| Gestión de camas | El plano de todas las áreas, sin acciones |
| Consolidado de censos | Censos por día y servicio, y los egresos, del mes que elija |
| RENOXI | Lo del día en el orden del formulario, con descarga del día o del mes |

La API rechaza cualquier acción suya en un solo lugar (`cuenta_que_escribe` en
`servidor/hospitalizacion/app/principal.py`). Marcar RENOXI como cargado es solo de
`control.camas`, que es quien lo carga.

El permiso conserva su código, `hospitalizacion.validar`, para no tocar el token ni las
asignaciones; hoy significa «Estadística mira hospitalización».

**El censo lo cierra siempre su área**, también pasadas las 08:00. Antes, después de esa
hora solo Estadística podía cerrarlo; sin ella, ese censo no lo cerraría nadie. A partir de
las 08:00 el día sigue sin admitir movimientos: solo el cierre.

**Sin demostración.** Se quitan el botón, el reloj simulado (`reloj_demo`) y las rutas
`/api/demo/*`: el sistema usa siempre la hora real. Los pacientes ficticios dejan de ser un
seeder (`semillas/cargar_demostracion.py`) y quedan como datos de las pruebas automáticas
(`pruebas/historia_ficticia.py`). Una base de trabajo arranca vacía con
`semillas/iniciar_sin_datos.py` y el flujo se prueba a mano con las cuentas.

Se retiran las pantallas Recepción de censos, Validación de altas e Indicadores DIRESA, que
solo usaba Estadística.

## Consecuencias

- Las cifras del mes que Monitoreo y la remisión a DIRESA ponen al lado de las digitadas
  (fase 4 de la 0011) salen siempre de «hasta el último censo cerrado»: nadie cierra el mes.
- Las altas cuentan desde que el área las registra, como ya decía la 0010; ya no pasan a
  «validado».

## Pendiente de decidir

Estas reglas siguen en la API y en el dominio del frontend, con sus pruebas, pero ninguna
cuenta las puede usar:

| Regla | Qué hacía | Pregunta |
|---|---|---|
| `egreso/validar` | Estadística validaba el alta | ¿Se elimina o alguien revisa las altas? |
| `mes/cerrar` y `mes/ajustar` | Fijaba las cifras del mes y registraba correcciones | ¿Se elimina el cierre o lo hace otro rol? |
| `censo/reabrir` | Reabría un censo cerrado con motivo | ¿Quién corrige un censo mal cerrado? |
| `ingreso/corregir` | Corregía la fecha de ingreso | ¿Quién corrige un ingreso mal fechado? |
