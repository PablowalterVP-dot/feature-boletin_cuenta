# Contexto del sistema

Qué problema resuelve este prototipo, cómo circula hoy la información y qué se
decidió cambiar. Este documento es la fuente de la que dependen todas las
decisiones de implementación; si algo del código lo contradice, el código está
mal.

Levantado el 13 de septiembre de 2026.

---

## 1. El problema

La Oficina de Estadística del Hospital Regional de Loreto **digita a mano** los
reportes mensuales que nueve áreas le envían **impresos**. De ese material solo
se digitaliza lo que DIRESA exige remitir. El resto se queda en el oficio, en un
archivador, y deja de existir para cualquier efecto práctico.

Tres consecuencias que el sistema debe atacar:

1. **Se pierde información.** Los oficios traen cuadros que no se digitan nunca:
   equipos inoperativos, motivos de suspensión de cirugías, programación no
   ejecutada. Nadie los puede consultar después porque no están en ninguna base.
2. **El mismo dato se envía varias veces.** Un área entrega su oficio en
   Estadística, en Planeamiento y, según el caso, en Epidemiología, en Cuerpo
   Técnico y en Dirección General. Cinco copias en papel del mismo cuadro.
3. **Nadie sabe quién falta.** El control de cumplimiento vive en la memoria de
   la encargada. Un área que no entrega se detecta cuando hace falta el dato, no
   cuando incumple el plazo.

---

## 2. Las nueve áreas y la matriz de destinos

Este es el flujo real levantado del circuito en papel. Estadística recibe de
todas; la columna de destinos son las **otras** oficinas que también necesitan
el reporte.

| # | Área | Sigla | Además de Estadística, va a |
|---|---|---|---|
| 1 | Departamento de Farmacia | FAR | Planeamiento |
| 2 | Servicio de Nefrología y Hemodiálisis | NEF | Planeamiento, Epidemiología, Dirección General |
| 3 | Oficina de Epidemiología | EPI | Planeamiento |
| 4 | Departamento de Laboratorio Clínico y Anatomía Patológica | LAB | Planeamiento |
| 5 | Departamento de Gineco-Obstetricia | GIN | Planeamiento |
| 6 | Centro Quirúrgico | CQX | Planeamiento, Epidemiología |
| 7 | Área de Costura y Lavandería | LAV | Planeamiento |
| 8 | Departamento de Nutrición y Dietética | NUT | Planeamiento |
| 9 | Departamento de Diagnóstico por Imágenes | DXI | Planeamiento, Cuerpo Técnico |

Lecturas que salen de esta tabla y condicionan el diseño:

- **Planeamiento recibe de las nueve áreas** (27/10/2026; antes, de seis). Es
  un rol propio, al nivel de Estadística (§ 4), y lleva con lo recibido la
  ejecución de las actividades operativas del POI.
- **Cuerpo Técnico recibe de una sola área** (Diagnóstico por Imágenes).
- **Epidemiología aparece dos veces**: como área que reporta (#3) y como oficina
  que recibe de Nefrología y de Centro Quirúrgico. Es el único caso de doble
  rol, y es la razón por la que el sistema tiene tres tipos de usuario.
- Tres áreas no tienen ningún destino más que Estadística. Su reporte existe
  para el consolidado a DIRESA y para el boletín.
- **Nutrición se corrigió el 24 de septiembre de 2026.** Se había levantado sin
  destino externo, pero su oficio de junio (N.º 122-2026) va **dirigido al jefe
  de Planeamiento**, con copia a Estadística y al archivo. Estadística lo recibe
  porque es copia, no porque sea el destinatario. Conviene revisar con el mismo
  criterio —a quién va dirigido y a quién con copia— los oficios de las demás
  áreas: la matriz se levantó por relato y este caso muestra que puede fallar.

La matriz vive en [`frontend/src/app/datos/areas.js`](../frontend/src/app/datos/areas.js).
Es la única fuente: `oficinas.js` no repite el mapa, lo deriva.

---

## 3. La decisión de arquitectura: Estadística como paso único

**Antes (papel):** el área reparte copias a todas las oficinas de su lista, en
paralelo. Estadística es una de ellas.

**Ahora (sistema):** el área envía **una sola vez** y el reporte llega a la vez
a Estadística y a las oficinas que la matriz determina.

**Entrega directa (12 de octubre de 2026).** Hasta esa fecha Estadística
revisaba, validaba y después remitía. Se retiró: el bot validador ya revisa cada
Excel al subirlo y no deja enviar lo que no cuadra ni una alerta sin
justificar, así que la validación de Estadística repetía su trabajo y retrasaba
a las oficinas. Desde entonces el envío **es** la validación (la del bot) y la
remisión. La base se migró con `servidor/api/bd/seeders/0002_flujo_entrega_directa.sql`.

Consecuencias que hay que sostener, no solo enunciar:

- Estadística **no devuelve reportes con observaciones**: se descartó el 13 de
  septiembre de 2026 por sobreproceso. El filtro está antes de que el reporte
  salga del área: el bot impide enviar un reporte con errores o con alertas sin
  justificar.
- Las oficinas receptoras **ya no dependen** de que Estadística remita: reciben
  en el momento del envío. El semáforo de cumplimiento solo vigila una demora,
  la del área.
- Los destinos **no se eligen**: los pone la matriz al enviar. Ver §3.2 del
  contrato.
- Estadística conserva reabrir un mes ya entregado (`rectificar`), el
  consolidado a DIRESA y el boletín.

---

## 4. Los cuatro roles del flujo

| Rol | Quién | Qué hace |
|---|---|---|
| `area` | Las nueve áreas | Sigue su mes en el tablero de inicio, llena y envía su reporte, consulta su historial y sus constancias |
| `estadistica` | Oficina de Estadística | Vigila cumplimiento, consulta lo recibido, reabre un mes entregado, remite a DIRESA, genera el boletín |
| `planeamiento` | Oficina de Planeamiento | Recibe lo entregado por las nueve áreas, consulta sus consolidados y registra la ejecución física mensual de las 44 actividades operativas del POI: calculada de los reportes, del calendario, o digitada |
| `oficina` | Epidemiología, Cuerpo Técnico, Dirección General | Consulta lo que las áreas le entregaron («Reportes recibidos» e «Histórico»), y sabe si un mes recibido se reabrió |

Planeamiento era una oficina receptora más hasta el 27/10/2026. Pasó a rol
propio porque necesita todo lo que entregan las áreas para llenar el POI, y lo
que hacía era copiar a mano cada oficio en CEPLAN. El cuadro de 2026 muestra lo
que eso producía: metas prorrateadas registradas como producción y cifras que
no cuadran con ningún oficio. En el sistema cada actividad dice de dónde sale su
cifra; un prorrateo (meta ÷ 12) se muestra como referencia y nunca como
ejecución.

Fuera del flujo hay una cuenta más, `admin`, del equipo de desarrollo:
entra como cualquier otra cuenta para probarla, reinicia los datos y revisa el
bot validador. No actúa sobre ningún reporte.

Nadie ve fuera de su ámbito. Una oficina receptora **no ve** reportes que el
área aún está llenando: solo lo entregado. Esto es
deliberado: exponer un borrador a otra oficina convierte cualquier cifra
provisional en un dato que alguien va a citar.

Epidemiología tiene los dos ámbitos en una sola cuenta y cambia entre ellos sin
cerrar sesión.

---

## 5. Estados del reporte

```
no_iniciado ──crear──▶ borrador ──enviar──▶ remitido
                          ▲                     │
                          └────(rectificar)─────┘
```

| Estado | Rótulo | Espera a | Significa |
|---|---|---|---|
| `no_iniciado` | No iniciado | el área | No hay registro. La ausencia ES el estado |
| `borrador` | En llenado | el área | El área lo está llenando |
| `remitido` | Entregado | nadie | Validado por el bot y entregado a Estadística y a las oficinas de la matriz. Periodo cerrado |

`enviado`, `en_revision` y `validado` existieron hasta el 12/10/2026. Ningún
reporte queda en ellos, pero siguen nombrados en el historial de los reportes
de entonces (`etiquetaDeEstado` en `dominio/estados.js`).

`rectificar` existe porque en papel también ocurre: llega una corrección de un
mes ya remitido. Reabre el periodo y **conserva la remisión anterior** como
prueba de que esas oficinas recibieron una versión que quedó desactualizada.

Autoridad única: [`frontend/src/app/dominio/estados.js`](../frontend/src/app/dominio/estados.js).

---

## 6. Plazos

El periodo que se reporta es siempre el **mes cerrado**: en septiembre se
reporta agosto. El plazo vence el **día 10 del mes siguiente**
(`DIA_PLAZO` en `dominio/periodos.js`).

El prototipo fija el «hoy» en **3 de octubre de 2026**: se reporta
septiembre, que vence el 10 de octubre, y agosto es el último mes enviado.
Es deliberado que sea una fecha fija: una demostración que cambia de
significado según el día en que se abre no se puede ensayar. Hasta el 3 de
octubre estuvo en el 13 de septiembre, con agosto vencido; se movió porque en
octubre no tenía sentido seguir pidiendo agosto. Los incumplimientos que el
semáforo debe mostrar quedan en los meses anteriores (Lavandería sin marzo,
Nutrición con junio sin revisar).

Mantenimiento figuraba como décima área y se retiró el 21/10/2026: no reporta
al sistema. La unidad `MTO` sigue en la semilla de Alejandro (no se edita) y
se retira con `servidor/api/bd/seeders/0004_retirar_mantenimiento.sql`.

---

## 7. Vacíos del planteamiento inicial y cómo se resolvieron

El planteamiento de partida tenía dos roles y tres acciones por rol. Al
confrontarlo con la matriz aparecieron seis huecos estructurales:

| Hueco | Resolución |
|---|---|
| Epidemiología reporta y recibe; con dos roles no se representa | Tercer tipo de rol, y cuentas con varios ámbitos |
| Los destinos parecían una elección libre de Estadística, pero la matriz los fija | Precargados desde la matriz; Estadística confirma |
| Estadística «valida» pero no podía rechazar | Se propuso un ciclo de devolución con observaciones y **se descartó por sobreproceso**. El control pasa a las validaciones cruzadas, que impiden enviar lo que no cuadra |
| No había control de quién incumple el plazo | Semáforo de cumplimiento, que separa el atraso del área del atraso de Estadística |
| El área perdía el sello del oficio como prueba de entrega | Constancia de recepción con folio, fecha y hora |
| El argumento central —lo que hoy se pierde en papel— no se veía en ninguna pantalla | Se probó a rotular cada formato con quién lo consume; el rótulo «por confirmar» se quitó de la interfaz porque recargaba el llenado. Queda pendiente saber qué exige DIRESA |

---

## 8. Decisiones tomadas

Registradas el 13 de septiembre de 2026.

| Decisión | Qué se eligió |
|---|---|
| Flujo | **Estadística como paso único.** El área envía una vez; Estadística remite |
| Profundidad | **Cinco áreas a fondo, cinco listadas.** Las listadas aparecen en semáforo, historial y remisión con formulario simplificado |
| Áreas a fondo | Nefrología y Hemodiálisis, Centro Quirúrgico, Diagnóstico por Imágenes, Costura y Lavandería — **a confirmar**, ver §9 |
| Oficinas receptoras | **Bandeja mínima de recepción**, para que la remisión no termine en un botón sin destino visible |
| Devolución con observaciones | **No existe.** Estadística revisa y valida, pero no devuelve: sería sobreproceso |
| Piezas del Formato 4 de Lavandería | **Se digitan a mano.** Más adelante podrían configurarse |
| Imágenes | **Cuatro formatos mensuales**, uno por hoja del oficio. Estadística lo recibe, lo valida y lo remite a Planeamiento y Cuerpo Técnico |
| Nutrición (24/09/2026) | **Se llena subiendo su Excel**, no digitando: plantilla oficial leída por nombre de casilla, un bot validador y un solo módulo de tres pasos (subir; revisar y resolver; enviar). El oficio son dos reportes —Comensales y Pacientes—, cada uno en hospitalización y emergencia; la revisión muestra primero el consolidado y lo que encontró el bot, y el detalle se pagina por semana con los grupos fijos plegados. El bot es un componente aparte (`servidor/bot-validador/`, con su README): servicio HTTP o, en el prototipo, embebido en el navegador |
| Entrega a Planeamiento (24/09/2026) | **Nutrición entrega a Planeamiento al enviar**, sin esperar a Estadística, marcado «sin validar» (`entregaInmediata` en `areas.js`). Es una excepción a §4 mientras se confirma qué usa Planeamiento en CPlan; ver PLAN.md |

Las cuatro áreas se eligieron por contraste, no por importancia: la de matriz
más compleja (NEF, tres destinos externos), la más rica en validaciones y en
datos que hoy se pierden (CQX, cirugías programadas vs. realizadas vs.
suspendidas), la única que llega a Cuerpo Técnico (DXI), y el extremo no clínico
que se mide en kilos y prendas (LAV). Se marcan con `profundidad: 'completa'` en
`areas.js`; cambiar la elección es cambiar esa línea.

---

## 9. Lo que falta levantar

Sin esto, las fases 1 y 2 avanzan a ciegas en la parte de contenido.

| Falta | Para qué | Estado |
|---|---|---|
| Oficio de Costura y Lavandería | Modelar sus cuatro formatos | **Recibido** (junio de 2026) y construido. Ver `PLAN.md` |
| Oficio de Diagnóstico por Imágenes | Modelar sus cuatro hojas | **Recibido** (junio de 2026) y construido: ecografía, tomografía, mamografía y Rayos X. Desde el 27/10/2026 se sube en Word y lo lee el bot, con los nueve oficios de 2026. Ver `PLAN.md` |
| Oficio de Epidemiología | Modelar su reporte | **Recibido** (enero a setiembre de 2026) y construido: casos nuevos de infecciones intrahospitalarias por edad, servicio y sexo, en Word. Ver `PLAN.md` |
| Fotos de los oficios de las otras 2 áreas a fondo | Modelar sus formularios con indicadores reales | **Pendiente** (Nefrología y Centro Quirúrgico). Basta foto de celular, solo las hojas con cuadros de datos |
| Una foto de la primera hoja de las 6 áreas restantes | Nombrar bien las secciones del formulario simplificado | **Pendiente** |
| Reglas de validación concretas de al menos un área | Sumas automáticas y validaciones cruzadas | **Pendiente** |
| Formatos que se remiten a DIRESA | Armar los dos formatos | **Recibidos** y construidos: servicios intermedios e indicadores de gestión. Ver §11 |
| Plazo y canal de la remisión a DIRESA | ¿Correo, plataforma? ¿Qué día? | **Pendiente**. El prototipo supone el día 15 y exporta CSV |
| Un boletín estadístico ya publicado | Cotejar la estructura del boletín | **Recibido** (julio de 2026) y cotejado. El boletín sigue su estructura y se arma solo con lo validado; ver `PLAN.md`. Por confirmar: qué son los capítulos I y III (el impreso salta del II al IV) y qué exporta ALETHEIA, de donde sale el detalle de Emergencia (destino, condición, sexo, morbilidad CIE-10, camas por servicio) que el sistema aún no recibe |
| Confirmación de las 4 áreas a fondo | Fijar el alcance | **Pendiente** |
| Nombres oficiales exactos de áreas y oficinas | Textos de interfaz | Provisionales en `areas.js` y `oficinas.js` |
| Uno o varios usuarios por área | ¿Digita uno y firma otro? Cambia el flujo interno del área | **Pendiente** |
| Qué usa Planeamiento de cada oficio | Saber qué necesita de verdad: lo que lleva a CPlan. Si solo son totales, podría tomarlos del boletín o del sistema en vez del oficio | **Pendiente**. Se dice que usa el boletín mensual de Estadística y que de Nutrición solo registra dos totales (raciones a pacientes y a comensales), pero no está confirmado. Pedir a Planeamiento la pantalla o el formato de CPlan |
| Oficio de Nutrición y Dietética | Modelar su formulario | **Recibido** (junio de 2026) y **construido** con carga de Excel. Junio transcrito casilla por casilla (cuadra con los totales impresos); enero a mayo, solo sus totales reales. Cuatro cuadros diarios (comensales y pacientes × hospitalización y emergencia) y un resumen anual. Por aclarar: no trae consultorio externo, aunque Estadística registra ese total; los pacientes de emergencia solo figuran como SIS; unas filas dicen «cena» y otras «comida»; la meta anual está vacía |
| Magnitudes reales aproximadas | Que las cifras de la demostración sean creíbles | **Pendiente**; si no llegan, se inventan y se rotulan como ficticias |

---

## 10. Honestidad del prototipo

- **Nombres de usuario, fechas y cifras son ficticios.** No corresponden a
  personal ni a producción del hospital. La pantalla de ingreso lo advierte.
- **No hay backend.** Todo vive en memoria y se pierde al recargar. Ventaja para
  la demostración: se puede ensayar tantas veces como haga falta.
- **No hay autenticación.** Cualquier contraseña entra, y la pantalla lo dice en
  lugar de simular una seguridad que no tiene.
- **El conmutador «Ver como…»** de la barra superior es una herramienta de
  desarrollo, no una función del sistema: solo lo ve la cuenta `admin` y las
  sesiones que abre. Cuando exista autenticación real se borra sin dejar
  rastro, igual que `CREDENCIALES.txt`. Lo mismo el botón «Simular envío de las áreas
  pendientes» de la bandeja de Estadística.

---

## 11. Los dos formatos que Estadística remite a DIRESA

**1. Consolidado de servicios intermedios** (formato MINSA 2024). Una fila por
establecimiento; el hospital es el n.º de orden 143, código RENIPRESS 00000003.
196 columnas: identificación (A–J), Laboratorio y Anatomía Patológica (K–ET),
Diagnóstico por Imágenes (EU–FR), Nutrición (FS–GA), Lavandería (GB–GE),
Farmacia y Ambulancia (GF–GM) y camas (GN). En el Excel son 146 manuales y 50
calculadas; en el sistema la identificación se autocompleta y los 47 totales se
calculan, así que solo 139 dependen de un dato.

**2. Indicadores de gestión hospitalaria** (GERESA Loreto, estándar MINSA). 22
indicadores en producción y rendimiento (1–4), eficiencia (5–15) y calidad
(16–22), cada uno con numerador, denominador, fuente y factor.

De dónde sale cada dato:

- **De las áreas**, solo si su reporte está **validado**: Laboratorio (§A e
  indicador 5), Imágenes (§B, repartiendo sus cuatro hojas: Rayos X,
  ecografía y tomografía en sus filas; mamografía, biopsias y procedimientos
  oncológicos en «Otros»; fotoradiografías y placas dentales en 0, porque el
  hospital no tiene esos servicios: lo confirmó Estadística el 07/11/2026), Nutrición (§C), Lavandería (§D, agrupando el
  Formato 1: emergencia y consultorios externos por su lado, el resto como
  hospitalización), Farmacia (§E), Centro Quirúrgico (12–14 y 22),
  Gineco-Obstetricia (18–21) y Epidemiología (16).
- **De Estadística**: consulta externa, egresos, camas, emergencia, referencias y
  ambulancia. Las camas son un solo dato para el campo GN y para el
  denominador de «Rendimiento cama», como recomienda el análisis del formato.

Dos correcciones respecto de la hoja de indicadores actual, aplicadas por
construcción: el indicador 22 usa el mismo ×100 todos los meses (en la hoja,
enero a julio no lo aplican) y un denominador vacío da «Sin datos» en vez de
#¡DIV/0!. El indicador 4 sale mayor que 1, igual que en la hoja, y se advierte:
el criterio de «consultorio funcional» debe validarse con Consulta Externa.
