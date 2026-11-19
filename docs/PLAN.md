# Plan del prototipo

Estado al 13 de septiembre de 2026. Lee primero
[`CONTEXTO.md`](CONTEXTO.md): este documento supone que las decisiones de ahí ya
se entendieron.

Marca de estado: **[hecho]** · **[en curso]** · **[pendiente]** ·
**[bloqueado]** (falta un insumo externo, indicado entre paréntesis).

---

## Fase 0 — Cimientos · **[hecho]**

No dependía de los oficios, así que se completó primero.

| # | Entrega | Estado |
|---|---|---|
| 1 | Proyecto Vite 8 + React 19, alias `@`, oxlint | [hecho] |
| 2 | `core-ui/` copiado íntegro, más `docs/UI_CATALOG.md` y el contrato adaptado | [hecho] |
| 3 | 15 pictogramas nuevos dibujados y declarados (49 en el registro) | [hecho] |
| 4 | Diez áreas, cuatro oficinas, matriz de destinos, catorce cuentas de demostración | [hecho] |
| 5 | Máquina de estados de seis transiciones, sin devolución con observaciones | [hecho] |
| 6 | Almacén en memoria que valida toda transición contra la máquina de estados | [hecho] |
| 7 | Ingreso a dos columnas con las catorce cuentas accesibles, `AppShell` por rol, conmutador «Ver como…» y selector de ámbito para el doble rol | [hecho] |
| 8 | Panel funcional de matriz de destinos, con tres vistas según quién mire | [hecho] |
| 9 | Avisos derivados del estado, no almacenados | [hecho] |
| 10 | Prueba de humo: 1353 comprobaciones, 0 fallos | [hecho] |
| 11 | La copia local de `core-ui/` se sustituye por el paquete `@hrl/core-ui` v1.6.1 (tipografía, logo y fachadas propias, ingreso con la fachada según la hora); `docs/UI_CATALOG.md` se elimina a favor del catálogo del paquete. Humo: 1355 comprobaciones | [hecho] |

### Correcciones al kit heredado

Se arreglaron tres incumplimientos del contrato que venían en la copia:

- `AppShell` traía el nombre del sistema anterior escrito dentro de `core-ui/`.
  Ahora llega por la prop `brand`.
- El cajón de notificaciones usaba literales `rgba()` y tamaños de fuente
  numéricos. Se sustituyeron por tokens; hizo falta nombrar `--info-soft`.
- `tema.js` compartía la clave de almacenamiento con el sistema anfitrión del
  otro proyecto. Ahora usa una propia.

También se añadieron los tokens `--success-soft`, `--warning-soft`,
`--destructive-soft` y `--neutral-soft`, que el kit usaba como literales dentro
de `UiBadge` y que la aplicación necesita por nombre.

### Qué verifica la prueba de humo

Dieciocho bloques, 1353 comprobaciones: que cada módulo carga con el alias resuelto,
que ningún icono pedido falta del registro, que no hay literales de color, que
los plazos y las reglas de honestidad de las cifras se cumplen, que la matriz es
coherente, que la máquina de estados no tiene callejones sin salida, que el
historial sembrado es cronológicamente posible, que el ciclo completo del reporte
corre de principio a fin, y que **cada pantalla renderiza sin lanzar** —incluida
la aplicación completa con una sesión de cada rol— usando `renderToStaticMarkup`.

### Lo que la Fase 0 **no** verifica

Que las pantallas se vean bien. Renderizar sin lanzar no es lo mismo que estar
bien maquetado: la prueba no abre un navegador, no aplica CSS y no ejecuta
efectos, así que nada dice sobre el modo oscuro, el ancho de móvil o el
comportamiento de los diálogos y los menús. **La primera revisión visual está
pendiente** y es lo primero que conviene hacer.

---

## Fase 1 — Rol Área · **[en curso]**

Costura y Lavandería y Diagnóstico por Imágenes están construidas a fondo a
partir de sus oficios de junio de 2026. Las otras ocho áreas esperan el
levantamiento del suyo.

Las dos comparten el mismo recorrido —pasos, validación, envío, visor de
Estadística, historial y tablero—. Lo que cambia por área está en un solo
registro, `datos/formatos/levantados.js` (formatos, cálculos, siembra), más
`paneles/reporte/formularios.js` (la pantalla de cada formato). Levantar una
tercera área es añadir una entrada en cada uno.

| # | Entrega | Estado |
|---|---|---|
| 11 | Tablero de inicio de Lavandería: avance del mes por formato, cuatro indicadores del último mes enviado, ropa por mes, kilos por servicio, costura e insumos. Inicio básico para las demás áreas | [hecho] |
| 11b | Registro diario con calendario mensual (lunes a domingo), días completos e incompletos marcados, paso al día anterior o siguiente y salto al siguiente día pendiente | [hecho] |
| 12 | Historial: tabla paginada, puntualidad por periodo, constancia, recorrido del reporte y apertura del periodo cerrado | [hecho] |
| 13 | Kit: `Input` numérico con etiqueta oculta, `CeldaNumerica`, `Pasos`, `TiraSeleccion`, `Calendario` y `BarrasSerie` | [hecho] |
| 13b | `nombreBreve` por área, para controles donde el texto no envuelve | [hecho] |
| 14 | Formulario del reporte: cuatro formatos, sumas automáticas, validaciones cruzadas | [hecho] para Lavandería e Imágenes · [bloqueado] para las demás |
| 14b | Tablero de inicio de Imágenes: avance de las cuatro hojas, exámenes, pacientes, monto y lecturas del último mes; exámenes por mes, por modalidad, por servicio y por financiamiento; ecografías por médico y Rayos X por tecnólogo; aviso del tomógrafo inoperativo | [hecho] |
| 14c | Kit: cabeceras agrupadas en `DataTable` y decimales en `CeldaNumerica` (montos en soles) | [hecho] |
| 15 | Rótulo de consumidor por formato | **Retirado** de la interfaz por ruido; la duda sobre DIRESA sigue abierta |
| 16 | Comparación contra el mes anterior con aviso de variación anómala | Comparación [hecho] en el tablero · aviso de anomalía [pendiente] |
| 17 | Envío: confirmación que enumera destinos, y constancia de recepción | [hecho] |
| 18 | Corregir lo devuelto por Estadística | **Descartado**: no hay devolución con observaciones |
| 19 | Exportación del reporte de un periodo | [pendiente] — ver decisión abierta |

### Simplificación del llenado

A pedido del área se quitó lo que recargaba la pantalla de llenado: la
descripción larga del estado, el rótulo «Consumidor por confirmar», las marcas
«Se digita» y las alertas explicativas de cada formato. Se mantienen solo las
señales que cambian lo que hay que hacer: el cruce entre Formato 1 y Formato 3,
los errores que impiden enviar y la marca de los totales automáticos.

### Datos sembrados de Lavandería

Seis de los ocho periodos tienen sus cuatro formatos llenos y remitidos, para
poder ver el reporte tal como queda una vez enviado. Marzo nunca se envió y
agosto sigue sin abrirse: las dos ausencias son deliberadas y sostienen la
demostración del semáforo de cumplimiento.

**Qué es real y qué no.** Los totales mensuales de junio de 2026 son los del
oficio: los 14 totales por servicio, los 12 865 + 751 kg del Formato 3, las
23 936 piezas y los ocho trabajos de confección. **El desglose día a día es
simulado**, porque el escaneo del cuadro diario no es lo bastante legible para
leer sus 420 casillas con confianza. El reparto es determinista y **suma
exactamente el total real**, así que el consolidado sigue cuadrando. Los demás
meses son variaciones de junio con un factor por periodo. La interfaz lo advierte
al abrir junio, y la pantalla de ingreso también.

### Los cuatro formatos de Costura y Lavandería

El oficio reúne **dos subáreas** con cuadros que no se parecen entre sí, y dos
periodicidades distintas. En el prototipo son cuatro pasos:

| Paso | Subárea | Qué es | Periodicidad | Qué se digita |
|---|---|---|---|---|
| Formato 1 | Lavandería | Kilogramos de ropa por servicio | **Diaria** | Los kilos de cada uno de los 14 servicios |
| Formato 2 | Costura y ropería | Trabajos de confección | Mensual | Descripción, cantidad, unidad, servicio y tela |
| Formato 3 | Lavandería | Precio de lavado de ropa sucia | **Diaria** | Solo los kilos de las dos categorías |
| Formato 4 | Lavandería | Consolidado mensual e insumos | Mensual | Solo las piezas y los insumos |

Lo que se descubrió al cotejar los cuatro cuadros entre sí:

1. **La columna de kilogramos del Formato 4 es el Formato 1 agrupado.** Las diez
   filas cuadran exactamente con la suma de los servicios que las componen. Hoy
   alguien rehace esa suma a mano cada mes; en el prototipo no se digita.
2. **El Formato 3 cuadra con el Formato 1:** 12 865 kg comunes + 751 kg de ropa
   sucia = 13 616 kg, el total exacto del Formato 1. Es una validación cruzada
   real entre dos hojas que hoy nadie confronta. En el prototipo, si no cuadran,
   el reporte no se puede enviar.
3. **El oficio de junio tiene un error aritmético.** 12 865 × S/ 3,00 son
   S/ 38 595 y el total impreso es S/ 38 295: faltan S/ 300. El de ropa sucia sí
   cuadra. Con el importe calculado, ese error deja de ser posible. *Conviene
   verificarlo contra el original en papel.*
4. **La columna «precio por kilo» del Formato 3 se suma al pie** y da 90,00, que
   son treinta veces tres. Sumar un precio unitario no significa nada: en el
   prototipo la tarifa es una constante del periodo, no una columna.
5. **El calendario del oficio se puede generar.** El 1 de junio de 2026 fue lunes
   y el mes tuvo 30 días, tal como está escrito a mano en el papel.

### Lo que falta preguntar sobre Lavandería

| Duda | Por qué importa |
|---|---|
| ~~De dónde salen las PIEZAS del Formato 4~~ | **Resuelto:** se cuentan y se digitan a mano. Más adelante podrían configurarse |
| **Qué distingue «ropa sucia común» de «ropa sucia»** | El oficio no lo dice; la tarifa más alta sugiere ropa contaminada o de manejo especial |
| **Si las tarifas cambian entre periodos** | Hoy están fijas en S/ 3,00 y S/ 4,50; si varían, hay que guardarlas por periodo |
| **Qué parte de este reporte exige DIRESA** | Condiciona la remisión a DIRESA de la Fase 2. El rótulo en pantalla se retiró; la pregunta sigue abierta aquí |
| **Si conviene precargar junio de 2026** | Los totales mensuales están verificados, pero el desglose diario del escaneo no es fiable: precargarlo exigiría una copia legible o confirmar las cifras |

### Los cuatro formatos de Diagnóstico por Imágenes

Cuatro hojas mensuales, una por modalidad. El área no registra por día, así que
no hay calendario: cada paso es la hoja del oficio.

| Paso | Hoja del oficio | Qué se digita | Qué se calcula |
|---|---|---|---|
| Formato 1 · Ecografía | Exámenes ecográficos por médico, biopsias y procedimientos oncológicos | Nombre, pacientes, las nueve casillas SIS / convenios / pagados por consulta externa, emergencia y hospitalización, y el monto | La columna EXAM de cada fila y la fila TOTAL |
| Formato 2 · Tomografía | Exámenes por financiamiento y tomografías informadas | Si el tomógrafo estuvo inoperativo y su motivo, la matriz de financiamiento, pacientes, monto y lecturas por médico | Total de exámenes |
| Formato 3 · Mamografía | Exámenes por financiamiento, campaña y lectura e informe | La matriz, la campaña (sin documento), pacientes, monto y lecturas | Total de exámenes, campaña incluida |
| Formato 4 · Rayos X | Exámenes por servicio, por tecnólogo, particulares y lectura | Exámenes de hospitalización, emergencia y consulta externa, pacientes, placas, exámenes por tecnólogo, particulares, monto y lecturas | Exámenes atendidos |

Lo que se descubrió al cotejar las cuatro hojas:

1. **La columna EXAM de ecografía es la suma de las nueve casillas.** Cuadra en
   las cuatro filas de médicos, en biopsias y en procedimientos oncológicos (331,
   133, 216, 293, 43 y 20). No se digita.
2. **Rayos X cuadra por dos lados:** 293 + 580 + 499 = 1 372 exámenes atendidos,
   y los ocho tecnólogos suman también 1 372. Si no cuadran, el reporte no se
   envía.
3. **La mamografía de junio tiene una casilla en blanco** (pagados de consulta
   externa) y **S/ 385,00 de monto sin ningún examen pagado**. Los dos se avisan
   sin bloquear: el monto puede ser de convenios. *Conviene preguntarlo.*
4. **El monto no se puede calcular.** Los importes por médico no guardan una
   tarifa fija (S/ 530 por 9 pagados, S/ 50 por 1) y el oficio no dice qué se
   cobra. Se digita.
5. **El tomógrafo inoperativo es un dato, no una nota al pie.** Si se marca,
   el motivo es obligatorio: un mes en cero sin explicación no se distingue de
   un mes sin demanda. El tablero dice desde cuándo lo está.

Validaciones que **impiden enviar**: una hoja sin exámenes (si no hubo, se
escribe 0), una fila con cifras sin profesional, más pacientes que exámenes o
pacientes sin registrar, más lecturas que exámenes, tomógrafo inoperativo sin
motivo, tecnólogos que no suman los exámenes atendidos, y más particulares que
pacientes. Validaciones que **solo avisan**: casillas en blanco, profesionales
sin cifras, monto y pagados que no se corresponden, y placas sin registrar.

**Datos sembrados.** Junio de 2026 es el oficio real casilla por casilla,
incluidos su casilla en blanco y su monto sin pagados. Los demás meses son
variaciones simuladas que cumplen todas las validaciones; el tomógrafo funciona
hasta abril y figura inoperativo desde mayo (supuesto de la simulación). Los
nombres del personal son los del oficio y precargan las filas de un mes nuevo.

### Lo que falta preguntar sobre Imágenes

| Duda | Por qué importa |
|---|---|
| **De qué es el monto de mamografía de junio** (S/ 385 sin exámenes pagados) | Si es de convenios, el aviso debería considerar también los convenios |
| **Si la casilla en blanco de mamografía es cero** | Hoy se suma como cero y se avisa |
| **«Golbert Isern Babilonia» (ecografía) e «Isern Rios» (Rayos X)** | ¿Es la misma persona? No se unificó sin confirmarlo |
| **Dónde cuentan mamografías, biopsias y procedimientos para DIRESA** | Se asignaron a «Otros», con la campaña en consulta externa |
| ~~Si DIRESA espera 0 en fotoradiografías y placas dentales~~ | **Resuelto (07/11/2026):** el hospital no tiene esos servicios; van en 0 |
| **Desde cuándo está inoperativo el tomógrafo** | La simulación supone mayo; el oficio solo dice junio |

---

## Fase 2 — Rol Estadística · **[hecho]**

| # | Entrega | Estado |
|---|---|---|
| 20 | Cumplimiento: diez áreas por ocho meses, «esperan al área» separado de «esperan a Estadística», deudas arrastradas | [hecho] |
| 21 | Bandeja del mes: un renglón por área (llegue o no), cifra del mes, validaciones, visor con acciones «Tomar para revisión» y «Validar»; simulación de la llegada de los pendientes | [hecho] |
| 22 | Remisión a oficinas: selección múltiple, destinos de la matriz, confirmación que dice qué va a quién, actas | [hecho] |
| 23 | Remisión a DIRESA: consolidado de servicios intermedios (196 columnas) e indicadores de gestión (22), datos propios de Estadística, faltantes, CSV, constancia | [hecho] |
| 24 | Boletín estadístico en A4 con la estructura del boletín impreso de julio de 2026: portada, presentación, directorio, índice, capítulos y glosario. Se arma solo (`datos/boletin/`) y **solo con datos de la base**: los reportes sembrados y los datos propios de Estadística, que hoy viven en memoria, no entran. Cada capítulo aparece cuando su formato está en la base y Estadística validó el reporte del mes; hoy solo Nutrición puede aparecer. Los servicios intermedios salen del consolidado DIRESA, así que las dos cifras no pueden diferir. Los párrafos con cifras se redactan con los datos (`dominio/redaccion.js`); los textos y las fotos se editan sobre la hoja | [hecho] · los demás capítulos esperan que su formato se instale en la base; Emergencia, además, el detalle de ALETHEIA |

### Qué envía cada área y a qué formato va

Lavandería e Imágenes envían sus formatos reales. Las ocho áreas sin oficio
levantado tienen una **estructura propuesta con cifras simuladas**
(`datos/formatos/areas-simuladas.js`), armada para cubrir exactamente lo que
Estadística necesita para DIRESA más lo que hoy se pierde en papel:

| Área | Qué envía | Alimenta |
|---|---|---|
| Laboratorio y AP | Cinco grupos de exámenes y anatomía patológica, por servicio | Consolidado §A · indicador 5 |
| Diagnóstico por Imágenes | **Sus cuatro formatos reales**: ecografía por médico, tomografía, mamografía y Rayos X, con financiamiento, pacientes, montos y lecturas | Consolidado §B · se remite a Planeamiento y Cuerpo Técnico |
| Nutrición y Dietética | Raciones para pacientes y personal, por servicio | Consolidado §C |
| Costura y Lavandería | Sus cuatro formatos; los kilos se agrupan por servicio | Consolidado §D |
| Farmacia | Levantada (oct. 2026): atenciones por financiador, Sala de Operaciones y Consultorios externos. Las recetas de §E salen de las atenciones SIS de hospitalización, emergencia y consulta externa (lectura por confirmar) | Consolidado §E |
| Centro Quirúrgico | Programadas, suspendidas, electivas, emergencia, salas, motivos de suspensión | Indicadores 12, 13, 14 y 22 |
| Gineco-Obstetricia | Partos, cesáreas, nacidos vivos, muertes fetales y neonatales | Indicadores 18 a 21 |
| Epidemiología | Pacientes con infecciones intrahospitalarias, notificaciones, brotes | Indicador 16 |
| Nefrología y Hemodiálisis | Pacientes, sesiones, nuevos, fallecidos, máquinas | Solo a sus oficinas |

El resto de los indicadores —consulta externa, egresos, camas, emergencia,
referencias— y la ambulancia no los envía ninguna de las diez áreas: los digita
Estadística en «Datos de Estadística».

### Supuestos que conviene confirmar

| Supuesto | Dónde | Por qué importa |
|---|---|---|
| Plazo de DIRESA: día 15 del mes siguiente | `dominio/periodos.js` | El formato no lo dice |
| Nivel III-1, distrito Punchana, ubigeo 160108 | `datos/diresa/servicios-intermedios.js` | Identificación autocompletada; verificar contra RENIPRESS |
| Numerador del indicador 5 = exámenes de consulta externa, orina incluida | `datos/diresa/indicadores.js` | El formato no define el criterio |
| Ambulancia y camas las digita Estadística | `datos/estadistica-propios.js` | Ninguna área del alcance los reporta |
| Solo los reportes validados entran a DIRESA | `datos/diresa/fuentes.js` | Un enviado sin validar deja sus celdas vacías |
| §B de DIRESA desde Imágenes: Rayos X → radiográficos, ecografía → ecográficos, tomografía → tomográficos; mamografía (campaña en consulta externa), biopsias y procedimientos oncológicos → «Otros»; fotoradiográficos y placas dentales en 0 | `datos/diresa/servicios-intermedios.js` (`SIN_SERVICIO`) | **Resuelto (07/11/2026):** el hospital no tiene esos servicios, ni Nutrición raciones en consulta externa; van en 0 |

---

## Nutrición con carga de Excel · **[hecho, 24/09/2026]**

| # | Entrega | Estado |
|---|---|---|
| N1 | Estructura del oficio N.º 122-2026: cuatro cuadros diarios y resumen anual (`datos/formatos/nutricion.js`) | [hecho] |
| N2 | Junio real, transcrito y cuadrado con lo impreso; enero a mayo con sus totales reales | [hecho] |
| N3 | Plantilla .xlsx generada y leída sin dependencias, por nombre de casilla; probada abriéndola y guardándola con Excel | [hecho] |
| N4 | Bot validador como componente aparte (`servidor/bot-validador/`): servidor HTTP, 7 reglas, bloqueo de plantilla de otro mes o de otra área, documentado en su README | [hecho] |
| N5 | Módulo de tres pasos: subir; revisar y resolver (consolidado, hallazgos paginados, detalle por semana con grupos fijos plegados); enviar. Sin hallazgos, el detalle queda plegado y se ofrece enviar | [hecho] |
| N5b | Digitar sin Excel: la misma semana editable, «copiar del día anterior» y «repetir en los días vacíos» (los internos se llenan escribiendo una vez) | [hecho] |
| N6 | Envío a Estadística y entrega inmediata a Planeamiento, con constancia | [hecho] |
| N6b | Tablero de inicio de Nutrición: estado del mes, cifras del último mes enviado, raciones por mes (hospitalización frente a emergencia, en pacientes y en comensales) y reparto por dieta y por grupo | [hecho] |
| N7 | Prueba de humo: 1480 comprobaciones; el bot, 19 propias | [hecho] |
| N8 | Carga más amigable: los pasos son círculos unidos por una línea (`ProgressSteps`, que se subió al kit en v1.8.0); la mascota del bot (`public/mascota-bot.svg`, DiceBear «Gaze», CC0) espera el archivo, «piensa» con frases mientras lo lee y la revisión entra con un fundido en cuanto responde. Kit 1.6.1 → 1.8.0, con los arreglos locales del logo y del ingreso retirados | [hecho] |
| N9 | Paso 2 con un recorrido claro: subo el Excel → el bot llena las cifras → corrijo o explico → envío. Un aviso de la mascota dice qué pasó y qué falta; fuera la cabecera técnica del bot (versión, reglas, dónde corrió), la lista de reglas y el acumulado del año. Las cifras siempre a la vista: los cuatro cuadros en una tira en el orden del oficio, todos los grupos en tabla (ya no se pliegan), en dos columnas en pantallas anchas, con el calendario fijo al desplazar. El detalle ocupaba un tercio menos del ancho por un choque con la clase `.hrl-detalle` del kit: ahora es `.hrl-dias`. Kit 1.9.0: `ProgressSteps` minimalista, con check de un trazo. Revisado en Chrome sin ventana a 1440 y 1920 px; el teléfono sigue desbordando por el `AppShell` | [hecho] |
| N10 | Rediseño desde la evaluación con la skill ui-ux-pro-max, medido en Chrome sin ventana (13 pantallas, tres cuentas, claro y oscuro, 1440 y 375 px). Kit `v1.10.0-redesign.2` (rama `redesign`): contraste AA en todo el texto, foco visible en los campos, `<main>` y «Saltar al contenido», menú como cajón y sin desplazamiento lateral en el teléfono, títulos h1→h2, ingreso compatible con gestores de contraseñas. Aplicación: la pantalla activa en el hash (enlaces directos y «Atrás»), paneles cargados al abrirse (bundle inicial de 603 a 316 kB), foco al contenido al cambiar de pantalla | [hecho] · falta fusionar la rama `redesign` del kit |
| N11 | Tarjetas rediseñadas desde el laboratorio de variantes (`frontend/laboratorio-tarjetas.html`): cabecera en banda (icono de sección, título, estado y acción a la misma altura), sin barra de color, un solo relleno de 12 × 16 y radio 10. Cada panel es un `Mosaic` del kit que decide solo qué tarjetas van lado a lado. Borde de página de 16 px y sin ancho máximo. Kit `v1.10.0-redesign.4` | [hecho] · revisado en N12 |
| N12 | Vuelve la medida de la tarjeta (24 px, radio 16, título grande), la barra de color y el borde de página de 32 px; queda la banda con estado a la derecha, se suma el icono en baldosa, y el `Mosaic` sigue decidiendo qué va lado a lado. Nutrición, apilada (`Mosaic stacked`). Kit `v1.10.0-redesign.5`, subido | [hecho] |
| N13 | Apariencia y accesibilidad personalizables (tema, contraste, tamaño y espaciado del texto, movimiento, enlaces). Plan en [`Plan_Personalizacion.md`](Plan_Personalizacion.md). Hechas: contraste, tamaño del texto y subrayar enlaces, en el cajón del perfil (kit `v1.10.0-redesign.9`) | [en curso] |
| N14 | La mascota del bot es Dr. Mochi, elegida en el laboratorio de mascotas (`frontend/laboratorio-mascota.html`, tres rondas: cinco médicos, cinco versiones de Mochi y su paleta): cuerpo redondo `#2fbfa0`, bata, estetoscopio y espejo frontal, sin contorno ni brillo en los ojos. Vive en el kit como `Mascot` (identidad del hospital, como el logo), con tokens `--mascota-*`, mirada propia y parpadeo en cada estado y sin seguir el cursor. `paneles/Mascota.jsx` solo traduce los estados del bot; fuera `public/mascota-bot.svg` y el CSS propio que animaba el contenedor. Kit `v1.10.0-redesign.6` | [hecho] |
| N15 | Herramientas de prueba en el reporte de Nutrición, solo en sesiones abiertas por `admin`: simular la entrega, deshacerla (vuelve a «en llenado» con las mismas cifras) y eliminar el reporte (vuelve a «no iniciado», paso 1). No son pasos del flujo: descartan el registro y lo reabren por las transiciones de siempre. Con el backend se muestran desactivadas: falta una ruta para deshacer la entrega | [hecho] · falta la ruta en el backend |
| N16 | Cabecera en banda (`PageBanner`, kit `v1.10.0-redesign.7` y `.8`), elegida en los laboratorios de cabecera (`frontend/laboratorio-cabecera*.html`): degradado verde con ondas; a un lado el título con la fecha y la hora (Inicio) o la descripción, al otro el estado dicho una sola vez y sus botones; Dr. Mochi solo en Inicio. Hoy solo en los cuatro módulos de Nutrición (`app/cabecera.js`), con el plazo vigente (día 10). La regla nueva —enviar solo del 1 al 5 del mes siguiente— queda por decidir: qué pasa si vence el 5 y cómo se llena a mano con el backend | [hecho] · regla del 1 al 5 por decidir |

Pendiente: que el bot guarde su historial de informes (hoy el sistema le manda el mes anterior), la bandeja de
Planeamiento que muestre lo entregado sin validar, y confirmar en CPlan qué dos
cifras usa. En un teléfono (390 px) el `AppShell` desborda la pantalla en todas
las vistas, no solo en esta: se pide al kit.

Pendiente desde el 03/10/2026:

- **Plazo de envío del 1 al 5 del mes siguiente** (laboratorios
  `frontend/laboratorio-cabecera-plazo.html` y `-modulos.html`). Falta decidir:
  pasar `DIA_PLAZO` de 10 a 5 y bloquear el envío fuera de esos días; qué pasa
  si vence el 5 sin enviar; y cómo se llena a mano con el backend, que hoy solo
  acepta el Excel (decisión del 28/09/2026). La cabecera sigue sola a
  `dominio/periodos.js`.
- **Cabecera en banda** en el resto de áreas y roles: diseñada en el
  laboratorio de módulos; hoy solo Nutrición.
- **Deshacer una entrega con el backend**: las herramientas de prueba (N15)
  están desactivadas en modo real hasta que el backend tenga esa ruta.
- **Personalización (N13)**: los colores escritos a mano dentro de las reglas
  del kit (F0), espaciado del texto, movimiento, el panel en la pantalla de
  ingreso y las preferencias en la cuenta (requiere el esquema de Alejandro).
- **Sin verificar con navegador real**: el movimiento de la mascota y la
  dirección pública del catálogo en Netlify.

---

## Laboratorio con carga de Excel · **[en curso, 08/10/2026]**

Patología Clínica y Anatomía Patológica se llena subiendo su Excel, como
Nutrición. El bot lee el **libro real del área** (`Oficios_Laboratorio.xlsx`):
un Excel por año con una hoja por mes (ENERO… JUN, JUL, AGO, SET…) que el área
sobrescribe cada año, más CONSOLIDADO, hojas de trabajo y copias.

| # | Qué | Estado |
|---|---|---|
| L1 | Bot: elige la hoja del mes por su nombre, comprueba su «Mes:» y su «Año:» (una hoja que todavía dice el año anterior se rechaza: no se sobrescribió) y lee sus dos bloques por rótulo y con alias: Patología Clínica (5 secciones) a la izquierda; Anatomía Patológica, Metaxénicas (con «Programa» en vez de consulta externa), Banco de Sangre y el resumen a la derecha. 181 exámenes, 23 de ellos ocasionales. Un blanco en una fila llenada es 0 (la convención del libro); una fila sin cifras ni total no se registró | [hecho] |
| L2 | API: casillas mensuales (`dia` nulo), mes anterior para la variación, sin alerta de semana incompleta. `cargar_catalogo_laboratorio` crea `LAB` y activa `LAB-1` (9 cuadros, 1 081 indicadores) desde `catalogos/laboratorio.json`, generado del bot; la hoja de cada cuadro es un patrón de mes. No corre al arrancar | [hecho] |
| L3 | Frontend: Laboratorio levantado, su recorrido de tres pasos, sus secciones en el visor de Estadística, su Inicio y su cabecera. No se digita ni se corrige en pantalla: se corrige el libro y se vuelve a subir | [hecho] |
| L4 | DIRESA: las 105 casillas manuales de la sección A de servicios intermedios y el indicador de análisis por consulta externa se llenan solas desde Laboratorio (`laboratorio-calculos.js`, `DIRESA_LABORATORIO`). Cada examen del libro va a una sola casilla o a ninguna a propósito (`SIN_DIRESA`: Banco de Sangre, el procesamiento de Anatomía Patológica, las actividades). «Programa» va a consulta externa; privado, convenio e insolvencia no tienen columna en DIRESA. Verificado con agosto real: 28 969 en DIRESA + 395 privados/convenios/insolvencias + 2 969 que DIRESA no pide = 32 333, el total del libro | [hecho] · por confirmar con el área |
| L5 | Consolidado anual: la hoja CONSOLIDADO del libro, armada por el bot con los meses entregados casilla por casilla (en el libro del área sus fórmulas dan #REF!). Se ve y se descarga desde «Consolidado anual» (área) y «Consolidado de Laboratorio» (Estadística) | [hecho] |
| L6 | Cuenta `dig.laboratorio` (digitador de Laboratorio) y `LAB-1` activa en la base de desarrollo, 09/10/2026. El superadministrador cambia su nombre y su clave desde «Cuentas» | [hecho] |

Lo que el bot encontró en el libro de 2026 (son errores del libro, no del bot):
agosto tiene «|1» en Hematocrito · Privado; setiembre, la fila TOTAL de
Uro-Parasitológicos no suma todos sus exámenes; mayo, un «,» en una casilla, un
total de Coprocultivo que dice 0 y la fila de programación vacía; junio, el total
de Metaxénicas en emergencia; abril, la fila ANTI M2-3E (AMA) sin registrar. Octubre
a diciembre todavía tienen las cifras de 2025.

Por confirmar con el área:

- Si cultivo de secreción → cultivo bacteriano, citoquímico → recuento celular y
  metaxénicas (referencial) → (varios) son el mismo examen renombrado. Hoy se
  leen como exámenes distintos (ocasionales); unirlos es agregar un alias.
- Que la fila «TOTAL DE EXAMENES LABORATORIO» sume solo Patología Clínica (así
  desde abril de 2026; de enero a marzo sumaba todo el departamento: el bot acepta
  las dos y la amplia la informa).
- Banco de Sangre cuenta unidades, no exámenes, y el resumen trae «Programación,
  seguimiento y evaluación de actividades», que suma al total general.
- La correspondencia con DIRESA (L4) en sus asignaciones discutibles: HDL y LDL en
  bioquímicos «otros»; tuberculosis y lepra (Metaxénicas) como BK; las pruebas
  rápidas de dengue y leptospira como serológicas; malaria como gota gruesa;
  pieza quirúrgica dentro de histopatológicos; «Programa» como consulta externa;
  privado, convenio e insolvencia fuera de DIRESA.

---

## Farmacia levantada · **[hecho, fases 1 a 5, 12/10/2026]**

Según `Documentacion_Modulo_Farmacia_HRL` (informe mensual de enero de 2026).
Pasa de «listada» a «completa» y se llena digitando (opción A).

- `datos/formatos/farmacia.js`, `-calculos.js`, `-siembra.js`, `-tablero.js`;
  registro en `levantados.js` y `resumen.js`; estructura simplificada retirada
  de `areas-simuladas.js`.
- Cuatro formatos: F1 Atenciones del mes (totales calculados, R1–R4), F2 Sala
  de Operaciones, F3 Consultorios externos y F4 Metas y convenios (sin
  casillas hasta que el área lo defina).
- Reglas R5, R6, R9 y R10 son errores; R7 y R8, avisos (dependen de que Sala
  de Operaciones esté dentro de Hospitalización, sin confirmar).
- `paneles/reporte/farmacia/` y `paneles/inicio/InicioFarmacia.jsx`.
- DIRESA §E y el Boletín conservan las columnas hosp, emerg y ce, ahora desde
  el Formato 1, y dicen en su tooltip qué lectura de «recetas despachadas» usan.
- Ningún mes sembrado es real: enero de 2026 no está entre los periodos de la
  demostración; sus cifras se usan como magnitud y en la prueba de humo.

**Carga del Word (opción B), 12/10/2026.** Con el informe real
(`01_INFORME_MES_DE_ENERO_2026.docx`) el bot lee el Word del área
(`servidor/bot-validador/src/docx.js` y `areas/farmacia/`): reconoce el
informe por sus cuadros y el mes por el asunto, lee cada cifra por su rótulo,
compara los totales escritos y avisa los títulos con el año equivocado. La
definición y las reglas de Farmacia pasaron al bot y el sistema las reexporta.
En «Reporte del mes», Farmacia sube su Word y se llenan los formatos; puede
seguir digitando. El Word real de enero se lee completo y sin errores (con el
aviso de sus rótulos «ENERO 2024», «DICIEMBRE - 2023» y el número «-2025»);
sus matrices dan, casilla por casilla, la siembra de Sala de Operaciones y
Consultorios.

**Farmacia sin historial inventado, 13/10/2026.** En la demostración Farmacia
empieza vacía: cada mes existe solo si el área sube su Word. En «Reporte del
mes» elige el mes (de enero al vigente), lo abre y sube el informe; un mes
pasado se puede enviar aunque su plazo haya vencido. Consecuencia buscada: en
DIRESA y en el cumplimiento, Farmacia figura sin reporte hasta que suba sus
meses.

**Farmacia en el servidor (fase 6), 13/10/2026.** Lo que Farmacia sube queda en
la base. `bd/farmacia/01_word.sql` hace que la base admita Word (avance_04 solo
admitía xlsx, xls y csv; va aparte, como `bd/desempeno/`, sin parchar los
scripts de Alejandro). `cargar_catalogo_farmacia` crea `FAR` / `FAR-W1`
(mensual, 3 cuadros, 45 casillas, `tipo_archivo = 'docx'`) desde
`catalogos/farmacia.json`, que exporta el bot. La API guarda el `.docx` con su
tipo y aplana las cifras anidadas de Farmacia (`f1.sis.hosp`). En el frontend,
con Farmacia activa, el Word se sube a la API, las cifras vuelven del servidor,
los avisos se justifican antes de enviar (como exige la API) y las casillas no
se editan a mano. Probado contra PostgreSQL 16 real: el script, la activación
y guardar el informe de enero (24 399 atenciones). La API en Python no se pudo
correr aquí (sin acceso a PyPI): `prueba_farmacia.py` queda por correr.

Pendiente (sección 13 de la documentación): rótulos de las filas de F2 y F3,
Sala de Operaciones dentro de Hospitalización, contenido de F4, lectura de
«recetas despachadas» y fase 7 (generar el Word de salida, opción C).

## Centro Quirúrgico con carga de Excel · **[hecho, 20/10/2026]**

Con los libros reales de enero a agosto de 2026. El área sube su **libro del
mes**, acumulado (una columna por mes): el bot lee la columna del mes de cinco
hojas y el sistema muestra sus **ocho reportes** en el orden del área:

| N.º | Reporte | Origen |
|---|---|---|
| 1 | Producción del mes (RESUMEN) | Leído. Con los doce meses, es el consolidado anual |
| 2 | Top Ten | Calculado con las hojas por especialidad |
| 3 | Consolidado por especialidad | Calculado con las hojas por especialidad |
| 4 | Cuadro de indicadores (tabla izquierda) | Leído |
| 5 | Indicadores (tabla derecha) | Calculado con la izquierda y el RESUMEN |
| 6 | Cirugía menor | Leído |
| 7 | Cirugía mayor | Leído |
| 8 | Causas de suspensión | Leído |

Decisiones del 20/10/2026, con el usuario:

- **El reporte 1 sale del RESUMEN de cada libro mensual.** El archivo
  «estadistica 2026 ABRIL - CONSOLIDADO» que llegó con los libros es el libro
  anual de Laboratorio, no el de Centro Quirúrgico; el RESUMEN del libro
  mensual tiene la forma del reporte 1, y el consolidado anual lo arma el bot
  con los meses entregados.
- **La base cataloga las especialidades, no los procedimientos.** De enero a
  agosto aparecen y desaparecen más de 90 rótulos de procedimiento; un catálogo
  por procedimiento bloquearía la carga casi cada mes. El detalle viaja con el
  reporte (`datos.procedimientos`) y alimenta el Top Ten.
- **DIRESA 22: programadas = ejecutadas + suspendidas.** El cuadro del área
  divide solo entre las ejecutadas (junio: 4,9 % allá, 4,7 % aquí); se dice en
  la nota del indicador.

DIRESA (indicadores 12, 13, 14 y 22) y el capítulo 4 del boletín dejaron de
leer la estructura simulada (retirada de `areas-simuladas.js`): leen el libro
del área por `paraDiresa`. El boletín lista las causas de suspensión del área
tal como las anota, en vez de cuatro grupos inventados.

Lo que los libros reales enseñan (y el bot dice): casi todos los meses el
RESUMEN, las hojas por especialidad y el cuadro de indicadores no coinciden
entre sí (avisos que el área justifica); enero tiene dos especialidades cuyo
total no suma sus procedimientos (errores: hay que corregir el libro antes de
enviarlo); mayo tiene una causa en blanco (error); abril pesa 54 MB y no se
puede subir hasta que el área lo achique.

Pendiente: **imprimir los formularios** (ningún usuario lo tiene todavía; se
hará primero en este módulo), el plazo propio de `CQX` en `configurar_plazos`
y confirmar con el área los estándares de su cuadro de indicadores.

## Una sola base para el equipo · **[en curso, 22/10/2026]**

Cada integrante tenía meses cargados solo en su base. Hecho:

- Migraciones y seeders (`bd/migraciones/`, `bd/seeders/`, de CatFly) al día con
  `develop`; Mantenimiento se retira en el seeder `0004`; `migrate:fresh` se
  niega si la base tiene reportes.
- `inventario`, `exportar_reportes`, `importar_reportes` y el panel «Cobertura»
  del superadministrador. Guía: [`BASE_COMPARTIDA.md`](BASE_COMPARTIDA.md).
- `preparar_base` carga el histórico por área (`HISTORICOS`). Farmacia está en
  la lista y espera dos cosas: sus nueve Word en `historico/farmacia/2026/` y
  su formato activo (`cargar_catalogo_farmacia`).
- Centro Quirúrgico, enero a agosto de 2026, en `historico/centro_quirurgico/2026/`
  (27/10/2026): copias **sin las hojas nominales** (nombre, DNI e historia de
  cada paciente), con las que el bot lee lo mismo que del original. Enero y mayo
  se corrigen al cargar (ver su README).

Falta: que cada integrante corra `inventario` y comparta su JSON; decidir los
meses en conflicto; activar en el servidor los formatos de Nefrología y
Gineco-Obstetricia, e importar sus meses.

## Epidemiología, Imágenes y el histórico de Farmacia · **[hecho, 27/10/2026]**

Las nueve áreas tienen ya su oficio levantado.

- **Epidemiología** (`EPI-W1`, Word): su oficio de vigilancia, una tabla de
  casos nuevos de infecciones intrahospitalarias por edad, servicio y sexo
  (`areas/epidemiologia/` del bot). Sustituye la estructura simulada; alimenta
  el indicador 16 de DIRESA y el capítulo 11 del boletín con las infecciones,
  sin las muertes neonatales y maternas de la misma tabla (`LECTURA_IIH`).
  Reglas propias: fila TOTAL, edades plausibles y posible brote (no la
  variación del 20 %).
- **Diagnóstico por Imágenes** (`DXI-W1`, Word): el bot lee el oficio con sus
  cuatro hojas (`areas/imagenes/`). La estructura y las reglas que vivían en
  el frontend pasaron al bot y se reexportan; se suman las comparaciones de
  cada total escrito (EXAM, fila T O T A L, TOTAL EXAMENES, atendidos). La
  base guarda los totales por modalidad (`eco`, `tac`, `mam`, `rx`); el
  detalle por profesional viaja en el informe del bot.
- **Farmacia**: el bot lee un resumen pegado como imagen EMF (julio de 2026:
  su texto, sin OCR, `emf.js`) y avisa un cuadro copiado del mes anterior
  (`copiado`, con `frenteAlAnterior` en el motor).
- `preparar_base` activa `FAR-W1`, `EPI-W1` y `DXI-W1` y carga los nueve meses
  de cada una desde `historico/`. **Un mes con errores del área queda en
  borrador** para que el área lo corrija con Dr. Mochi (decidido el
  27/10/2026): Farmacia marzo, julio y setiembre; Imágenes, siete de nueve
  (ver los README de `historico/`). Epidemiología cuadra los nueve.
- Base compartida (27/10/2026): migración `0008` y seeder `0005` aplicados,
  formatos activos, cuentas `dig.dxi` y `dig.epi` (esta, digitador y consulta:
  reporta y recibe), meses cargados.

**Borradores resueltos (27/10/2026, decisión de Estadística).** Los 16
borradores con errores de la base compartida se entregaron con tres reglas:
un total escrito que no cuadra pasa a ser la suma de sus casillas; lo que el
original no permite atribuir a una cifra se entrega como llegó, con cada error
documentado (`PREFIJO_ERROR_DOCUMENTADO` en `dominio/transiciones.py`: solo lo
escribe `cargar_historico --documentar-errores`; la API sigue sin dejar
justificar un error); una casilla en blanco va a 0 solo si de verdad no hubo
nada que contar (en Laboratorio sí; en Nefrología no: «CVC temporal» de enero
y febrero y el total de sesiones de setiembre quedan sin dato, documentados,
porque un 0 sería falso). Lavandería mayo era un falso error del bot (el punto
de miles de «26.633 PIEZAS»), corregido en el bot. Centro Quirúrgico, enero a
agosto, cargado. Detalle en los README de `historico/`.

Pendiente: Lavandería setiembre (lo que se subió fue un Excel de pacientes:
falta el reporte del área); Cuerpo Técnico y las oficinas receptoras siguen
sin cuenta `consulta`.

## Las nueve áreas en la base desplegada · **[hecho en código, 03/11/2026; falta desplegar]**

Gineco-Obstetricia subió sus datos en el sistema desplegado y se perdieron. La causa, reproducida
instalando `main` en una base limpia: `preparar_base` activaba cinco formatos y los otros cuatro
(GIN, LAB, LAV, NEF) se activaban a mano, en la base compartida y nunca en la desplegada. Sin
formato, la pantalla usaba el modo en memoria del prototipo: subía, revisaba y enviaba con
constancia, sin tocar el servidor, y al recargar no quedaba nada. Esos datos no se pueden recuperar.

- Seeder `0007_formatos_de_las_nueve_areas.py`: corre al desplegar y es idempotente. El gestor
  admite seeders en Python para no copiar los catálogos a SQL.
- Con servidor, un área que no puede guardar no ve el recorrido del reporte
  (`api.motivoSinServidor`), tampoco mientras no llega la configuración. También vale para un área
  pausada.
- Lavandería decía que las oficinas recibían después de que Estadística validara. Ya dice lo mismo
  que las otras ocho.
- Un área que había entregado el mes vigente no podía volver a entrar: al iniciar sesión el mes
  llega como resumen, sin remisión, y `avisos.js` la leía sin comprobarlo. Toda la aplicación caía
  en «Esta pantalla tuvo un problema», también al recargar. Lo encontró la prueba en navegador.
- Ensayado con API y bot reales, sobre una base que partía de la tabla de cinco áreas: las nueve
  suben, un archivo con errores no se envía, lo enviado sigue al volver a entrar y cada oficina
  recibe lo que dice su matriz. Gineco-Obstetricia, además, en Chrome de principio a fin.

### Un solo recorrido para las nueve áreas (03/11/2026)

Imágenes, Farmacia, Nefrología y Epidemiología tenían otra pantalla: había que «abrir» el reporte
antes de subir nada, sus formatos eran pestañas, la zona de subida nunca se iba, un reporte vacío
decía tener errores y el envío era un diálogo. Ahora siguen los mismos tres pasos que las áreas con
Excel, con las mismas piezas (`ReporteWord.jsx`, `PasoEnvioWord.jsx`, `PasoCarga`, `Lectura`,
`PorResolver`, `Correccion`). Lo único distinto es el tipo de archivo. El tutorial perdió su rama de
Word por lo mismo. Con esto, una alerta de Farmacia ya no se justifica escribiendo: se corrige o se
confirma con Dr. Mochi, como en las demás. La prueba de humo exige lo que ve la persona en las nueve,
no el nombre de un archivo.

La hora de «Subido el» salía cinco horas adelantada en todas las áreas: se leía la del informe del
bot, en UTC y sin zona, en vez de la de la base.

## Observaciones del 07/11/2026 · **[hecho en código; falta lo marcado]**

| # | Observación | Qué se hizo | Estado |
|---|---|---|---|
| O1 | Laboratorio no podía enviar octubre | El área partió Banco de Sangre en dos subtotales (unidades y una fila nueva «TOTAL DE PRUEBAS REALIZADAS») y escribió «CULTIVO BACTERIANO». El bot admite subtotales dentro de una sección (`subtotales` en `definicion.js`) y el alias; octubre pasa de 11 errores a 0. El total de la sección que guarda la base sigue siendo unidades más pruebas | [hecho] |
| O2 | Nefrología no podía subir su cuadro | Lo tiene en Word 97-2003 (`.doc`) y el sistema lo rechazaba. El bot lo lee sin dependencias (`src/doc.js`), igual celda por celda que la conversión de Word; vale para las cuatro áreas con Word. La corrección guiada de un `.doc` devuelve un `.docx`. Un descuadre de un trimestre ya entregado (I TRIM al enviar octubre) pasa de error a alerta (`totales-anteriores`): bloqueaba todos los meses | [hecho] |
| O3 | Panel de indicadores saturado | La tarjeta queda en cifra, meta, gráfico y «Ver análisis»; lo demás, en el detalle (CLAUDE.md § 4.1a-bis) | [hecho] · falta verlo en el navegador |
| O4 | Áreas con histórico sin gráficas en su Inicio | Nefrología, Epidemiología y Gineco-Obstetricia no tenían tablero: comparten `InicioPorCifras`. Imágenes y Lavandería usaban la ventana del prototipo (sin enero) y decían «cifras simuladas» sobre datos reales. Un mes que solo llegó como resumen ya no se dibuja como cero | [hecho] |
| O5 | Indicadores ligados a los oficios | Validados (07/11/2026): uno por tema y de una sola fuente. Centro Quirúrgico ve en su Inicio GERESA 12, 13, 14 y 22 (no las fichas 21 y 22 del DL 1153, que miden lo mismo); Gineco-Obstetricia, GERESA 18. Calculados solo con los reportes que el área entregó, sin el cuadro de GERESA, el DL 1153 ni los datos de Estadística. Mismas tarjetas que Monitoreo (`inicio/IndicadoresDelArea.jsx`) | [hecho] |
| O6 | Horas quirúrgicas de Centro Quirúrgico | Sus celdas tienen formato `[h]:mm`: Excel guarda días y el bot los leía como horas (todas divididas entre 24). Ahora las lee en horas, entiende también «997:57» escrito como texto, las muestra en horas:minutos y la corrección escribe de vuelta en días | [hecho] · los meses ya cargados se rectifican con `recargar_horas_cqx` (bot 0.3.0): rectificar, volver a leer el mismo archivo y reenviar, por el flujo de siempre, porque la base no deja tocar un reporte remitido. Base compartida: enero a agosto rectificados el 07/11/2026 (constancias `CR-2026-MM-CQX-2`). La desplegada se corrige sola al arrancar (`preparar_base`, paso 7) |
| O7 | Exportar a Excel la remisión a DIRESA | El Excel oficial (`public/plantillas/diresa-servicios-intermedios.xlsx`) con solo la fila del hospital llena en la hoja del mes (`servicios/remision-diresa.js`); el resto del archivo, byte por byte. La fila se busca por RENIPRESS: en JUNIO no es la 148. De paso, el ítem «Grupo sanguíneo» salía con el total de hematológicos (compartía clave con los totales K–Y) | [hecho] · Laboratorio: criterio de asignación a DIRESA por decidir (ver abajo) |
| O8 | Retirar el «Tablero de indicadores» | Lo que mostraba está en Monitoreo Indicadores; la ficha 14 conserva su pantalla, que se abre desde allí. Queda «Carga de datos» | [hecho] |
| O9 | Exportar el consolidado anual de indicadores | El Excel oficial («INDICAD GESTION H R L 2025, 2026 ARANA.xlsx», `public/plantillas/diresa-indicadores-gestion.xlsx`) con numerador y denominador de los doce meses de la hoja del año, lo que el sistema puede calcular; lo demás queda vacío para completarlo a mano. Valores y total siguen siendo las fórmulas de la plantilla. Botón «Indicadores del año (Excel)» en la remisión a DIRESA | [hecho] · la fórmula del n.º 22 en la plantilla no multiplica por 100 (`=++E59/E60`): no se tocó, por decidir |
| O10 | Cuentas locales iguales a las del despliegue | La base compartida tenía solo las `dig.*`; se aplicó el seeder opcional `usuarios_areas.sql` (07/11/2026): `farmacia`, `nefrologia`, `laboratorio`… `planeamiento`, `cuerpotecnico`, `direccion`, todas con 1234567890. Las `dig.*` siguen | [hecho] |
| O11 | Cifras que desbordan su tarjeta | En una tarjeta angosta, la cifra de un `StatCard` con tendencia se partía y pasaba por debajo de las barras («S/ 43,938.00»). La tarjeta mide su ancho: baja la cifra un escalón y, si aun así no cabe, la tendencia pasa a su propia línea (`estilos.css`). Conviene llevarlo al kit | [hecho] · falta verlo en el navegador |
| O12 | Dos botones para lo mismo en las tarjetas de Monitoreo | Se retiró «Ver análisis»; queda la flecha «Ver detalle» de la cabecera | [hecho] |

**Laboratorio frente a lo que se tecleaba a mano (enero de 2026).** Con el libro real, 41 de 85 celdas
coinciden; las demás difieren por criterio, no por error: a mano se suman privado, convenio e
insolvencia a consulta externa (el sistema no, porque DIRESA no tiene esas columnas), «Tiempo de
coagulación» llevaba protrombina más tromboplastina (el sistema: TC y TS más plaquetas), las
transaminasas iban en «Otros», la tolerancia a la glucosa no se sumaba a glucosa, y «Otros»
bioquímicos traía cifras redondas (5 000). Hay que decidir con el área qué criterio vale.

## Fase 3 — Oficinas receptoras · **[en curso]**

| # | Entrega | Estado |
|---|---|---|
| 25 | Planeamiento como rol propio (27/10/2026): recibe de las nueve áreas (la bandeja de Estadística, sin simular envíos) y lleva las 44 actividades operativas del POI 2026 — cada una con su origen (reporte del área, informe entregado, calendario o digitada), ajuste con nota sobre lo calculado, acumulado, avance contra la meta y CSV del mes para CEPLAN. Backend: migración 0008, seeder 0005 y `/api/planeamiento/actividades` | [hecho] · falta confirmar con Planeamiento las 20 actividades «por verificar» y registrar el CSV en CEPLAN una vez |
| 25b | Acta de remisión en la bandeja de Planeamiento | [pendiente] |
| 26 | «Reportes recibidos» e «Histórico» de las oficinas (`paneles/oficina/ReportesRecibidos.jsx`, sobre `/api/oficinas/{clave}/recibidos`). Epidemiología demuestra el doble rol: reporta en un ámbito y recibe en el otro | [hecho, 03/11/2026] |
| 27 | Aviso cuando un periodo ya recibido se reabrió para rectificación: queda «Desactualizada», sin poder abrirse hasta el reenvío (`servicios/acceso.py`), y lo dice la pantalla | [hecho, 03/11/2026] |

---

## Tutorial guiado de las nueve áreas · **[hecho]**

Enseña a cada área su reporte, de subir el archivo a enviarlo, señalando el botón
que toca y explicando lo que encontró el bot en el archivo. Es una práctica: nada
se guarda y al terminar todo queda como antes. Las reglas de cómo se construye
están en `CLAUDE.md` § 4.1a.

| # | Entrega | Estado |
|---|---|---|
| T1 | El paso como función del estado (`dominio/guia.js`), sin dependencias | [hecho] |
| T2 | Capa al estilo de React Joyride: «Siguiente» y «Anterior», flecha, progreso, X con confirmación (`guia/`), con el estilo del kit | [hecho] |
| T3 | Las nueve áreas: cinco con Excel, cuatro con Word, y la corrección que comparten | [hecho] |
| T4 | «Iniciar tutorial» en la cabecera de «Reporte del mes», encima de la fecha | [hecho] |
| T5 | La práctica sin escritura (`servicios/practica.js`) y la red de seguridad de `api.js` | [hecho] |
| T5b | Archivos de prueba de un mes (`pruebas/plantillas.mjs`) y prueba de humo | [hecho] |
| T6 | Validación de Andre con las plantillas de octubre, en una copia local de la base | [hecho] |
| T7 | Fusión a `main` | [hecho] |
| T8 | Cuenta de Centro Quirúrgico en la base real: `dig.cqx` | [hecho, 03/11/2026] |

---

## Monitoreo Indicadores y vigilancia · **[en validación, 03/11/2026]**

Se llamaba «Panel de monitoreo» hasta el 03/11/2026.

Rediseñado tras cotejar el Anexo I, el reporte DL 1153 de agosto, el cuadro de GERESA y el POI.
Tres pestañas más Cumplimiento. Migración 0011 y seeder 0006, aplicados en la base compartida.

| Situación | Fichas |
|---|---|
| Oficial de MINSA | 6, 9, 11, 12, 15, 17, 18, 20, 25, 26, 32 |
| Oficial y calculada por el hospital | 14, 21, 22, 23, 24 |
| Requiere datos de otra oficina | 27 (Epidemiología), 28 (Farmacia), 29, 30, 31 (Recursos Humanos) |
| Solo con población asignada | 1, 2, 4, 5, 8, 10 |
| Se evalúan a otros | 3, 7, 13, 16, 19, 33, 34 |

| # | Pendiente | Estado |
|---|---|---|
| M1 | Validación de Andre en local | [pendiente] |
| M2 | Guardar en el servidor lo que digita Estadística (`desempeno.dato_mes`) | [hecho] |
| M3 | Cotejar las fórmulas con el Anexo I y registrar logros y umbrales | [hecho] |
| M4 | Las etiquetas de mes de `SeriesBars` se juntan a ancho de teléfono: se pide al kit | [pendiente] |
| M5 | Respaldos: los conversa el equipo | [pendiente] |
| M6 | Recibir de Epidemiología, Farmacia y Recursos Humanos los datos de las fichas 27 a 31 | [pendiente] |
| M7 | Confirmar con la Directiva 2026 si el hospital tiene población asignada | [pendiente] |
| M8 | Aclarar con DGOS y SUSALUD las salas y las cirugías menores de la ficha 21 | [pendiente] |
| M9 | Revisar en SEEM los egresos que faltan de enero, febrero, marzo y julio | [pendiente] |
| M10 | Probar la carga con otro mes del reporte DL 1153, para confirmar que su estructura no cambia | [pendiente] |
| M11 | Marcar en `desempeno.ficha` las fichas que no aplican al hospital (hoy solo la 34): el tablero del superadministrador sigue diciendo 33 | [pendiente] |
| M12 | Cuenta de Centro Quirúrgico en la base compartida: `dig.cqx`, creada el 03/11/2026 con la clave estándar (ver T8). Falta su nombre real y su reporte de setiembre | [hecho] · falta el reporte |
| M13 | Lavandería: faltan en la base enero a abril y junio, y setiembre sigue en llenado. Su cuenta `dig.lav` ya existía y entra. No hay archivos en `historico/`: el área los está completando | [pendiente] |
| M14 | «Registrar datos» (fichas 27 a 31) y los compromisos siguen siendo potestad de Estadística (decisión del 03/11/2026) | [hecho] |

### Cruce con el Tablero de indicadores (03/11/2026)

Las 34 fichas del Tablero (`desempeno.ficha`) están todas en el módulo, con el mismo número y la
misma dimensión; la prueba de humo lo coteja con el seeder 0003. Lo que faltaba no era una ficha:
las 13 que el Anexo no le evalúa al hospital eran una fila sin explicar. Quedaron así
(`ASIGNACION`, según sus fuentes):

| Pestaña | Fichas | Por qué |
|---|---|---|
| Desempeño | 6, 9, 11, 12, 14, 15, 17, 27 a 31 (evaluadas); 1 a 5, 7, 8, 10, 13, 16, 19 (cifra de la región) | Salud pública, estrategias sanitarias, calidad y recursos humanos: HIS, Padrón Nominal, CNV, SIGTB, SIHCE-VIH, IAAS, SISMED, INFORHUS |
| Gestión hospitalaria | 18, 20 a 26, 32 | Cómo funciona el hospital: SEEM, RENOXI, SETI-IPRESS, REFCON, recursos de salud, telemedicina. Se evalúan en Desempeño, donde el Anexo las pone, y se enlazan desde Gestión |
| Compromisos de mejora | 33, 34 | Firma digital: se evalúan a otros (primer nivel e INEN) y la del hospital se mide en el compromiso 43 |

### Cumplimiento: lo que fallaba (03/11/2026)

El servidor siempre dio las nueve áreas; el fallo estaba en cómo las pintaba el frontend:

- La tabla usaba la ventana fija del prototipo (febrero a setiembre): no mostraba enero ni octubre.
- Las áreas se pedían una sola vez al abrir la página. Si la API aún no respondía, quedaba solo
  Nutrición, «1 de 1», y las otras ocho rotuladas como fuera del sistema, hasta recargar.
- La lista se pintaba después de traer completos dos reportes por área: unos 5 segundos con
  «No iniciado» en meses ya entregados.

---

## Fase 4 — Cierre · **[pendiente]**

| # | Entrega | Estado |
|---|---|---|
| 28 | Revisión visual en navegador, claro y oscuro, y a 400 px de ancho | [pendiente] |
| 29 | `oxlint` sin avisos, `vite build`, `npm run humo` en cero fallos | [hecho para la Fase 0; repetir al cierre] |
| 30 | Guion de demostración de ~10 minutos con la ruta narrativa | [pendiente] |

### Ruta narrativa propuesta para la demostración

1. **Entrar como Estadística → Cumplimiento.** Dos áreas no entregaron agosto,
   otras esperan revisión y hay meses anteriores sin cerrar. Esto es lo que hoy
   vive en la memoria de una persona.
2. **«Ver como…» → Lavandería → Inicio.** El tablero muestra agosto sin abrir y
   las cifras de julio. Abrir el reporte y llenar un día en el calendario.
3. **«Ver como…» → Imágenes → Inicio.** El tomógrafo lleva meses inoperativo y
   el tablero lo dice antes que nada. Abrir junio desde el historial: es el
   oficio real, con la casilla en blanco y el monto sin pagados avisados en la
   mamografía, y Rayos X cuadrando 1 372 por servicio y por tecnólogo.
4. **Volver a Estadística → Bandeja de agosto → «Simular envío de las áreas
   pendientes».** Los diez reportes llegan. Abrir Imágenes: sus cuatro hojas en
   solo lectura, sus comprobaciones y que va a Planeamiento y Cuerpo Técnico.
   Abrir Laboratorio: su estructura propuesta. Validar.
5. **Remisión a oficinas.** Seleccionar los validados: los destinos vienen de la
   matriz y cada uno emite su acta.
6. **Remisión a DIRESA → julio.** El consolidado de 196 columnas y los 22
   indicadores ya están armados, sin digitar nada. Mostrar junio: Nutrición sin
   validar deja sus raciones vacías, no en cero. Descargar el CSV y registrar la
   remisión.
7. **Boletín** (con el backend levantado). El panel dice qué capítulos tienen
   datos en la base y cuáles todavía no. Nutrición aparece cuando su reporte
   del mes está validado; imprimir a PDF.
8. **«Ver como…» → Planeamiento → Matriz.** Siete de las diez áreas la
   alimentan; hoy eso son siete oficios en papel al mes.

---

## Hospitalización (Egresos Hospitalarios) · **[hecho en código, 14/11/2026; falta desplegar]**

El seguimiento del paciente hospitalizado (camas, censo diario, ingresos, altas y
traslados) entra a este sistema con su propia API y su propia base
(`servidor/hospitalizacion/`) y sus pantallas en este frontend, debajo del menú de
Estadística. Las cuentas de los pisos son de esta base (seeder 0009) y entran con
este ingreso. Detalle y lo que falta: `docs/hospitalizacion/decisiones/0011-integracion-con-estadistica.md`;
cómo encenderlo en el servidor: `DESPLIEGUE.md` § 5.

| # | Qué | Estado |
|---|---|---|
| H1 | Repositorio: historial importado, API en `servidor/hospitalizacion/`, pantallas en `frontend/src/app/hospitalizacion/` | [hecho] |
| H2 | Un solo frontend: los módulos debajo del menú de Estadística, por permisos | [hecho] |
| H3 | Un solo ingreso: roles y permisos `hospitalizacion.*`, token con dos destinatarios | [hecho] |
| H4 | Servicio `hospitalizacion` con su base `hospitalizacion-db` en `docker-compose.yml`, siempre encendido (decisión 0014 de `docs/hospitalizacion/`) | [hecho en código; falta levantarlo en el servidor] |
| H5 | Camas y egresos del mes cerrado hacia Monitoreo | [pendiente] |

## Decisiones abiertas

### Exportación a Excel

Generar un `.xlsx` verdadero exige una dependencia nueva (SheetJS), y el
contrato prohíbe instalar sin autorización explícita. Para Nutrición se
resolvió sin ella: `servicios/xlsx.js` lee y escribe lo justo (celdas,
fórmulas con su valor, nombres definidos). Para el resto:

- **CSV descargable real** — Excel lo abre sin problema, cero dependencias.
- **Vista de impresión** con CSS de impresión para el boletín, vía el
  diálogo del navegador.
- **Boletín en PDF descargable** (16/11/2026, `servicios/boletin-pdf.js`), también
  sin dependencias: cada hoja A4 se dibuja en un canvas (SVG con
  `foreignObject`, fuentes y fotos en línea) y los JPEG se juntan en un PDF
  escrito a mano. El texto queda como imagen; para texto seleccionable sigue
  «Imprimir».

Para un prototipo de presentación eso alcanza. Si se quiere `.xlsx` nativo con
varias hojas y formato, hay que autorizar la dependencia.

### Envío paralelo o Estadística como paso único

La arquitectura acordada (CONTEXTO.md § 3) hace que el área envíe una sola vez
a Estadística y que Estadística remita. En la práctica, hoy el área envía el
oficio en paralelo a Estadística y a Planeamiento, y el 24 de septiembre de 2026
se planteó **mantener el envío paralelo** mientras no se sepa qué usa
Planeamiento, y pasar a enviar directo a Planeamiento cuando la validación
automática al subir el reporte sea confiable.

Lo que falta decidir y cambia el diseño:

- Si el envío es paralelo, Planeamiento recibe un reporte **sin validar por
  Estadística**, y la regla de que ninguna oficina ve cifras provisionales
  (CONTEXTO.md § 4) deja de valer para ella. Una salida: que lo reciba al
  enviarse pero marcado como «enviado, sin validar», y que vea el cambio cuando
  Estadística valide.
- Si Planeamiento solo usa totales que ya están en el boletín, quizá no necesita
  el reporte del área, sino el boletín o una vista de totales.

El prototipo mantiene por ahora el paso único; no se cambia hasta decidirlo.

### Firma y respaldo legal

Hoy el oficio va firmado y sellado por la jefatura del área. No se ha definido
si el envío digital sustituye la firma, si hace falta adjuntar el oficio
escaneado, o si la constancia de recepción del sistema es suficiente. Afecta al
punto 17 y conviene resolverlo antes de construirlo.

### Notificaciones fuera del sistema

El cajón de avisos funciona dentro de la aplicación. No se ha definido si un
área debe recibir además un correo cuando su plazo está por vencer. Si la respuesta
es sí, es trabajo de backend y queda fuera del prototipo.

---

## Verificación

```bash
cd frontend
npm install
npx oxlint src/        # sin avisos
npx vite build         # compila
npm run humo           # 0 fallos
npm run dev            # http://localhost:5173
```
