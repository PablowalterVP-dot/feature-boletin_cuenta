# Contrato de implementación

Reglas obligatorias para cualquier trabajo sobre este repositorio. No son
sugerencias de estilo: son el contrato que mantiene coherente el prototipo. Si
una regla impide resolver algo, dilo y propón cambiarla; no la rodees en
silencio.

Antes de tocar código, lee en este orden:

1. [`docs/CONTEXTO.md`](docs/CONTEXTO.md) — el problema, el flujo real y las
   decisiones ya tomadas. Sin esto, cualquier cambio adivina.
2. [`docs/PLAN.md`](docs/PLAN.md) — qué está hecho y qué toca.
3. `frontend/node_modules/@hrl/core-ui/UI_CATALOG.md` — el catálogo de lo que
   existe en el sistema de diseño (y `design.md`, su contrato). Léelo antes de
   crear cualquier componente.

---

## 0. Stack real

React 19 + Vite 8. CSS con custom properties. **Sin Tailwind, sin Radix, sin
CVA, sin TanStack Table, sin lucide, sin TypeScript.** El sistema de diseño es
el paquete `@hrl/core-ui` (fijado a un tag en `package.json`); el kit no tiene
ninguna dependencia más allá de React, y esa es una propiedad que se conserva a
propósito.

No instales una dependencia sin pedirlo explícitamente y explicar qué problema
concreto resuelve que no se pueda resolver con lo que ya hay. Hay una decisión
pendiente sobre esto: ver «Exportación a Excel» en `docs/PLAN.md`.

---

## 1. Estructura y fronteras

```
frontend/src/
  app/                La aplicación.
    estilos.css       Composición propia (solo tokens). Se carga tras el kit.
    tema.js           Clave con la que se recuerda el modo oscuro.
    dominio/          Reglas: estados, periodos, roles, formato de cifras.
    datos/            Datos de referencia y el almacén en memoria.
    servicios/        Clientes de lo que está fuera del frontend: el bot
                      validador (modo servicio o embebido) y los ejemplos.
    paneles/          Una pantalla por archivo.
    guia/             El tutorial guiado del reporte: sus señales y su capa.
    LimiteDeErrores.jsx  Lo que evita la pantalla en blanco si algo falla al pintar.
    ruta.js           La pantalla activa en el hash de la URL (#/reporte?periodo=…).
    App.jsx           Raíz: sesión, menú por rol, panel activo.
  main.jsx            Punto de entrada.
frontend/pruebas/     Prueba de humo.
servidor/             El lado servidor; `npm run dev` levanta sus dos partes.
  api/                FastAPI + PostgreSQL (datos reales de Nutrición y, al
                      activarlo, Laboratorio).
  bot-validador/      El bot: lee y valida el Excel de las áreas. Componente
                      aparte, con su README, sus pruebas y su servidor HTTP.
```

- **El bot no vive en el frontend.** La lectura del Excel, la definición de
  cada reporte que se sube y sus reglas están en `servidor/bot-validador/src`. El
  frontend las importa por el alias `@bot` y solo desde
  `servicios/bot-validador.js` o reexportándolas en `datos/formatos`. Una regla
  nueva se escribe en el bot, nunca en una pantalla.

- **El kit no se edita aquí.** Vive en `@hrl/core-ui`; si falta un componente,
  un token o un icono, se pide en su repositorio, se publica una versión y aquí
  se sube el tag (`npx hrl-core-ui upgrade vX.Y.Z`). No hay copia local: el
  `doctor` la marcaría.
- **El kit no sabe de áreas, reportes, periodos ni del hospital** (salvo su
  identidad: logo y fachadas). Si un componente necesita esos datos, los recibe
  por props. El nombre del sistema llega al `AppShell` por `brand`, y la clave
  del modo oscuro por `themeKey`.
- Un componente del kit no hace `fetch` ni consulta un endpoint. Nunca.
- Lo específico de este sistema vive en `app/`, aunque parezca genérico.
- **La API del kit está en inglés** (nombres, props y valores). Los estados del
  dominio siguen en español (`vacio`, `parcial`, `lleno`); se traducen en la
  frontera, donde se le pasan al kit (`pasosDe`, `CalendarioPeriodo`), y solo
  ahí.

### 1.1 Dónde va cada cosa dentro de `app/`

| Si es… | Va en |
|---|---|
| Una regla que decide qué se puede hacer | `dominio/` |
| Un dato de referencia (áreas, oficinas, usuarios) | `datos/` |
| Estado mutable de la sesión | `datos/store.js` |
| Una pantalla | `paneles/` |
| El bot validador, leer o generar un Excel | `servicios/` |

`dominio/` no importa de `datos/`. La dirección es siempre `paneles/ → servicios/ →
datos/ → dominio/` (un panel puede saltarse `servicios/`). Si una regla necesita un dato de referencia, se le pasa como
argumento.

---

## 2. Prohibiciones de implementación

### 2.1 Nada de HTML nativo con contraparte en el kit

| Prohibido | Usa |
|---|---|
| `<button>` | `Button` · `IconButton` |
| `<input>` `<select>` `<textarea>` | `Input` (`UiField`) con su `kind` |
| `<table>` | `DataTable` · `PaginatedTable` |
| Un `div` con `position: fixed` a modo de modal | `Dialog` (`Modal`) · `DetailDialog` |
| `title="..."` como tooltip | `Tooltip` (`InfoTip`) |
| Un menú hecho con `div` + estado | `DropdownMenu` |
| `alert()` `confirm()` | `Dialog` de confirmación · `Toast` |

Excepción única: **dentro de `core-ui/`**, donde los primitivos se construyen.
Ahí el HTML nativo es la implementación, no un atajo.

### 2.2 Nada de valores arbitrarios

Prohibido escribir un color, un radio, una sombra o un tamaño de fuente como
literal, tanto en CSS como en estilos en línea:

```jsx
// NO
<span style={{ color: '#00544A', borderRadius: 12, fontSize: 13.5 }} />
.algo { background: #f9fafb; box-shadow: 0 2px 8px rgba(0,0,0,.1); }

// SÍ
<span style={{ color: 'var(--success-text)', borderRadius: 'var(--radius)', fontSize: 'var(--text-base)' }} />
.algo { background: var(--background); box-shadow: var(--shadow-md); }
```

Ningún archivo de este repositorio puede tener un literal de color: los tokens
se definen en el kit. Un color nuevo se pide al kit, con su variante clara y
oscura.

Excepción única: **las ilustraciones de `frontend/public/`** (hoy ninguna).
Un dibujo trae sus propios colores y pasarlos a tokens lo cambiaría; por eso
se usa como imagen (`<img src>`), nunca pegado en el JSX, y no puede quedar
ilegible en el modo oscuro (fondo transparente, sin texto). Lo que sea
interfaz —un fondo, un borde, un texto— sigue saliendo de tokens aunque esté
al lado de la imagen.

La mascota del bot ya no es una de ellas: es `Mascot` del kit (Dr. Mochi, la
mascota del hospital), con sus colores en tokens `--mascota-*`. Se usa por
`paneles/Mascota.jsx`, que traduce los estados del bot; no se redibuja aquí.

Corolario del modo oscuro: un color de texto pensado para fondo claro
(`#00544A`, `#B71D18`, `#7A4100`) es ilegible sobre superficie oscura. Por eso
existen `--success-text`, `--destructive-text`, `--warning-fg`, `--info-fg`,
`--neutral-text`: se invierten con el tema. Usa esos, nunca el hex.

Fondos tenues por estado: `--success-soft`, `--warning-soft`,
`--destructive-soft`, `--info-soft`, `--neutral-soft`.

### 2.3 Nada de iconos sueltos

Todo icono sale del kit vía `<Icon name="..." />`. Añadir uno se pide al kit.
Pedir un nombre que no está en el registro (`ICONS`) avisa en consola durante
el desarrollo, y la prueba de humo lo convierte en fallo.

---

## 3. Reglas del dominio

Estas son propias de este sistema y no se negocian sin decirlo.

### 3.1 El flujo pasa por la máquina de estados

`app/dominio/estados.js` es la única autoridad sobre qué le puede pasar a un
reporte y quién puede hacerlo. Una pantalla **pregunta** qué transiciones hay
disponibles (`transicionesDe(estado, rol)`) y pinta un botón por cada una. No
existe el caso de un botón visible que el flujo no permite, ni el de un estado
alcanzado por un camino que nadie declaró.

Toda mutación pasa por `aplicarTransicion`. Ninguna pantalla reescribe un
reporte a mano.

### 3.2 Los destinos no se eligen, se confirman

La matriz de `app/datos/areas.js` determina qué oficinas reciben el reporte de
cada área. Al remitir se precargan desde ahí. Si se dejaran a criterio de quien
remite, el sistema perdería la garantía de que cada oficina recibe siempre lo
que necesita. Una excepción justificada es posible; elegir de cero, no.

### 3.3 Cuatro roles del flujo, no dos

`area`, `estadistica`, `planeamiento` y `oficina`. Eran tres porque
Epidemiología reporta y recibe: cualquier cambio que asuma dos tipos de usuario
rompe ese caso, que es real. Desde el 27/10/2026 son cuatro: **Planeamiento**
recibe al nivel de Estadística (lo entregado por las nueve áreas, nunca un
borrador) y tiene su módulo propio, las actividades operativas del POI
(`dominio/actividades.js`, `datos/planeamiento/`). No vigila plazos, no reabre
meses ni remite a DIRESA: eso sigue siendo de Estadística, y `transicionesDe`
no le ofrece nada.

Desde el 14/11/2026 hay un **quinto tipo de usuario, `hospitalizacion`**, fuera del
flujo de reportes: las cuentas de los pisos (§ 8). `transicionesDe` no le ofrece nada.

Existe además `admin`, la cuenta del equipo de desarrollo. **No es un rol del
flujo**: no llena, no valida, no recibe, y `transicionesDe` no le ofrece nada.
Entra como cualquier otra cuenta («Cuentas y roles»), reinicia los datos y
revisa el bot. «Ver como…» solo aparece en su sesión y en las que abre ella.
Las cuentas de prueba están en `CREDENCIALES.txt`; si se agrega una cuenta,
se agrega ahí (la prueba de humo lo exige).

Con el servidor, `admin` es el **superadministrador** de la base y su menú es
otro (`NAVEGACION_SUPERADMIN`, `paneles/superadmin/`): resumen,
funcionamiento, cuentas, plazos, áreas y matriz, personalización, bitácora y
soporte, sobre `/api/admin/*` (ver `docs/API_BACKEND.md` § 7d). Todo lo que
cambia ahí queda en la bitácora de la base; lo que afecta a otras personas
(pausar un área, la matriz, reabrir un reporte, «ver como») exige
justificación. «Ver como» es de solo lectura **en el servidor**. En el
prototipo, sin servidor, siguen las herramientas de demostración de arriba.

Las áreas que reportan por el sistema vienen de `GET /api/configuracion`
(`api.cargarConfiguracion`), no de una lista en el código.

### 3.4 La ausencia de dato no se rellena

- **Denominador cero no es 0 %.** Muestra «Sin datos». Un 0 % afirma que se
  midió y dio cero. Usa `porcentaje()` de `dominio/formato.js`, que ya lo hace.
- **Meta no registrada no es meta 0.** Muestra «Meta no definida»
  (`cumplimiento()`).
- **No dibujes meses sin datos como ceros.** Recorta la serie en el último mes
  con datos y rotula el bloque vacío.
- **Un reporte que no existe no se almacena.** Su ausencia es el estado
  `no_iniciado`. Guardar un registro vacío afirmaría que alguien lo abrió.
- Si una cifra puede leerse de dos maneras (personas vs. atenciones, suma por
  categoría vs. total único), dilo en el tooltip o en la leyenda.

### 3.5 Los datos del prototipo son ficticios y se dice

Nombres de usuario, fechas y cifras son inventados. La interfaz lo advierte en
la pantalla de ingreso. No los presentes como reales en ningún texto, ni en la
demostración.

---

## 4. Reglas de interacción

### 4.1 Capas flotantes

- Todo modal, cajón, menú y tooltip **cierra con `Esc` y con clic exterior**.
- Todo lo que use `position: fixed` se monta con `createPortal` en
  `document.body`. Motivo real, no teórico: una animación con `transform` y
  `fill-mode: both` en un contenedor lo convierte en bloque contenedor, y el
  `fixed` pasa a resolverse contra él — el diálogo aparece fuera de la vista.
- El cierre se anima antes de desmontar: usa `useExitAnimation`, no desmontes
  de golpe.
- Al cerrar un menú, el foco vuelve al elemento que lo abrió.
- **Excepción: el tutorial guiado no cierra con clic exterior**, solo con su X o
  Esc, y con confirmación (01/11/2026). Un clic accidental costaría el recorrido
  a quien menos soltura tiene. Lo demás de esta sección sí lo cumple.

### 4.1a Tutorial guiado

Enseña a un área su reporte, de subir el archivo a enviarlo. Se abre solo con
«Iniciar tutorial», en la cabecera de «Reporte del mes».

- **Es una práctica: no guarda nada.** Al terminar, todo queda como antes. Se
  resuelve en la frontera, `servicios/api.js` + `servicios/practica.js`, no en
  cada pantalla: ellas siguen creyendo que hablan con el servidor, y lo que se
  practica se ve igual que lo real. Cada mes que se abre empieza vacío, y **la red
  de seguridad de `pedir` rechaza cualquier escritura**. Una operación nueva que
  escriba se simula en `practica.js`; si no, en la práctica falla, no guarda.
- **El paso se deriva, no se recorre**: `pasoDeGuia` (`dominio/guia.js`) lo calcula
  de lo que publica la pantalla con `usePublicarGuia` (`guia/senales.js`). No hay
  una lista de pasos ni un índice: por eso se adapta a lo que encontró el bot en
  ese archivo. Una señal se retira al desmontarse lo que describe.
- **«Siguiente» y «Anterior» pulsan lo mismo que pulsaría la persona**, y ella
  también puede pulsarlo directamente: el paso cambia igual. Solo es aceptable
  porque es una práctica; no se hace en una pantalla que escriba de verdad.
- **Un botón del flujo que cambie de sitio o de nombre conserva su `data-guia`.**
  Una marca nueva se agrega a `OBJETIVOS`: la prueba de humo exige que exista en
  la pantalla.
- **Los textos del error salen del bot** (el título del hallazgo), no se reescriben.
- Se ensaya con el enlace `#/reporte?tutorial=1`. Los archivos de prueba de un mes
  salen de `node pruebas/plantillas.mjs 2026-10`; son ficticios y **nunca se suben
  fuera de la práctica a una base de verdad**: ocuparían el mes del área.

### 4.1a-ter El reporte del mes y lo recibido

- **Las nueve áreas siguen un solo recorrido**: subir, revisar y resolver, enviar. Cinco con Excel
  (cada una con su `Reporte*.jsx`) y cuatro con Word (`ReporteWord.jsx`, con lo de cada una en
  `CONFIGURACION`). Comparten `PasoCarga`, `Lectura`, `PorResolver` y `Correccion`. Un área nueva no
  trae una pantalla distinta. La prueba de humo lo exige a las nueve.
- **Con servidor no se simula nada.** Un área que no puede guardar en él no ve el recorrido
  (`api.motivoSinServidor`): subir contra el almacén del navegador perdió lo de Gineco-Obstetricia
  (03/11/2026), constancia incluida.
- **Lo recibido por una oficina va en `estado.recibidos`, no en `reportes`**: la sincronización de cada
  área reescribe los suyos con lo que la cuenta puede listar, y lo borraría. El detalle se pide al
  abrirlo y tampoco entra al almacén.
- **Un mes reabierto queda «Desactualizada» y no se abre** hasta el reenvío: la base no guarda una
  copia de lo remitido, y se verían cifras a medio corregir.

### 4.1a-bis Monitoreo Indicadores

Lo primero que ven Estadística y Dirección General al entrar. Tres pestañas de lo que le
piden al hospital, más Cumplimiento (solo Estadística): **Desempeño DL 1153**, **Gestión
hospitalaria** (los 22 de GERESA) y **Compromisos de mejora**. Dirección se reconoce por su
unidad (`direccion-general`, `dominio/sesion.py`): ve lo entregado por todas las áreas, nunca
un borrador ni la lista de pacientes, y no escribe. Escribir exige `monitoreo.registrar`.

- **El reporte DL 1153 lo carga solo el superadministrador** (`desempeno.cargar`, también en la
  ruta). Estadística ve lo cargado; sigue digitando lo de las oficinas y los compromisos.
- **Cada ficha está asignada una sola vez** (`ASIGNACION`, `datos/monitoreo-lecturas.js`), según
  sus fuentes: la prueba de humo la coteja con el catálogo de fichas de la base (`desempeno.ficha`).
  El «Tablero de indicadores» se retiró el 07/11/2026: lo que mostraba está aquí.
- **Toda cifra dice qué significa.** Una ficha nueva lleva en `LECTURAS` su `significa`, su
  `medida` (lo que acompaña al número) y `lee` (la cifra en palabras). Una razón de varios meses
  se dice «al mes», una acumulada «en lo que va del año»: 3.8 egresos por cama no es por día.
- **Todo mensaje sobre el estado de un indicador se calcula.** Nada se guarda: `dominio/analisis.js`,
  `conclusionFrenteAlLogro` y `conclusionDeCompromiso` lo arman con las cifras de ese momento, y
  una frase que no se cumple no aparece. En el catálogo solo va lo que no cambia con los meses:
  qué es la ficha y qué pide el Anexo. **Nunca una cifra ni un «coincide» escrito a mano.** Lo que
  no se puede recalcular (un cruce con archivos que no están en la base) va como `hallazgo`, con
  su fecha (`HALLAZGOS`). Dice qué cambió y desde cuándo; la causa no la sabe.
- **«Analizar hasta»** (`?hasta=2026-06`) recalcula todo como si ese fuera el último mes. Es la
  forma de comprobar a la vista que los mensajes salen de los datos.
- **El gráfico es `GraficoIndicador`**: líneas por omisión, con cuadrícula, meta, umbral, mediana y
  mes actual; barras con las mismas referencias, con el botón dentro de la tarjeta. **Sin límites
  de control** (decisión de Estadística, 03/11/2026). Una cifra acumulada no lleva mediana: se mira
  cuánto cambia cada mes.
- **Al pasar sobre un mes**, se resalta y su tooltip sale **encima del punto**, ancho y bajo
  (`TipDelMes`). No es `FloatingTip` del kit, que siempre sale al costado.
- **La tarjeta es la lectura rápida; las notas van al detalle.** La comparación con la cifra del
  hospital, los «a tener en cuenta» y los hallazgos solo se ven al abrir el indicador. Desde el
  07/11/2026 la tarjeta es solo la cifra con su meta (`CifraYMeta`) y el gráfico compacto
  (`GraficoIndicador compacto`); el detalle se abre con la flecha de la cabecera, la única
  acción (se retiró «Ver análisis», que hacía lo mismo). La conclusión, el análisis del mes a
  mes, los recuadros de cifras y la fuente están en el detalle. Los recuadros de cifras no llevan
  tooltip: es una excepción a § 4.7, pedida por Estadística.
- **Cada área ve sus indicadores en su Inicio: uno por tema, una sola fuente.** Centro Quirúrgico,
  GERESA 12, 13, 14 y 22 (no las fichas 21 y 22 del DL 1153, que miden lo mismo); Gineco-Obstetricia,
  GERESA 18 (`INDICADORES_DEL_AREA`, validado el 07/11/2026). Se calculan **solo con los reportes
  que el área entregó**: ni el cuadro de GERESA, ni la cifra oficial del DL 1153, ni los datos que
  digita Estadística. Misma tarjeta y mismo detalle que Monitoreo, en modo `delArea`
  (`paneles/inicio/IndicadoresDelArea.jsx`). Los parciales y los «dato relacionado» no van.
- **En pantalla se dice «meta»**, no «logro». En el código sigue siendo `logro`, como en el Anexo I.
- **Sin punto medio** como separador en los textos: «Ficha 18: Egresos…». La prueba de humo lo
  comprueba.
- **El alcance sale del Anexo I, no del Excel.** `datos/monitoreo.js` declara las 34 fichas.
  Primer bloque: las 21 cuyo ámbito oficial alcanza a un hospital III-1, las únicas que cuentan
  en el resumen. Segundo bloque: las otras 13, sin estado frente a la meta. Si la Directiva
  confirma que el hospital tiene población asignada, `HOSPITAL_CON_POBLACION_ASIGNADA` sube seis.
- **Una cifra de la región se rotula como de la región.** Leída como del hospital le atribuiría
  algo que no midió.
- **La cifra oficial y la del hospital no se mezclan.** Se muestran lado a lado, en los mismos
  meses, y se dice si coinciden. La oficial no se pisa a mano (`servicios/monitoreo.py`).
- **Cada ficha declara su `acumulacion`.** MINSA publica varias acumuladas mes a mes: sumarlas da
  una cifra que no existe (las anotaciones del hospital lo hacían en las fichas 9, 11 y 17).
- **Metas y umbrales: las del Anexo I.** Los anotados a mano en el Excel de MINSA no se usan.
- **El reporte DL 1153 se lee por dentro** (`servicios/dl1153.py`): las tablas dinámicas, no las
  hojas, que tienen cada una otro filtro. Una tabla actualizada antes del año del reporte es de
  otro año y no se lee, aunque su título parezca vigente.
- **Lo que no llega en el reporte (27 a 31) dice a quién pedírselo y qué.** Sin datos no se dibuja
  nada. Estadística lo digita de lo que envía cada oficina.
- **Son 4 salas de operaciones**, salvo el mes que Estadística ajuste en la ficha 21 (`salasOperativas`).
- **Un dato relacionado se rotula como tal.** Un conteo de mamografías no es la ficha 15.
- **Los datos de Estadística viven en el servidor** (`desempeno.dato_mes`): no en la sesión.

### 4.1b Navegación

- **La pantalla activa vive en el hash** (`app/ruta.js`): `irA(id, params)`
  escribe `#/id?param=…` y el cambio de hash mueve la vista. Así cada pantalla
  tiene enlace directo y «Atrás» del navegador vuelve a la anterior. No guardes
  la vista solo en el estado de React. Los parámetros son cadenas: lo que viaja
  en una URL.
- Al cambiar de pantalla, el foco va al `<main>` del `AppShell`
  (`ID_CONTENIDO`), para que un lector de pantalla anuncie la página nueva.
- Los paneles se cargan al abrirse (`lazy` en `App.jsx`). Un panel nuevo se
  agrega igual, no con un import estático.

### 4.2 Acciones irreversibles

Toda acción que cierre un periodo, remita a otra oficina o reabra algo ya
remitido exige confirmación en un `Dialog` propio que diga **qué ocurre y qué
consecuencia tiene**. Las transiciones que lo requieren están marcadas con
`confirmar: true` en `dominio/estados.js`. La reapertura de un periodo ya
remitido usa `tono="peligro"`: deja a otras oficinas con una versión
desactualizada, y hay que decírselo a quien la dispara.

### 4.3 Avisos

- `Toast` para confirmar que algo ocurrió (duración por defecto 3600 ms; no la
  cambies sin motivo).
- `Alert` en línea para una condición que persiste en la página.
- `Dialog` solo cuando hay que detener al usuario.
- El cajón de notificaciones se alimenta de `app/avisos.js`, que **deriva** los
  avisos del estado. No guardes una lista de avisos: una notificación que
  sobrevive al hecho que la provocó es peor que ninguna.

### 4.4 Tablas

- La **columna del identificador principal es el enlace** que abre el registro.
- Además, **botón de acción explícito al final de la fila** con su `aria-label`.
- Nunca hagas la fila entera clicable como único camino: rompe la selección de
  texto y no se puede alcanzar con el teclado.
- Diez filas por página (`FILAS_POR_PAGINA`). El paginador muestra siempre el
  contador de registros.
- Estado vacío con `EmptyState` que explique **por qué** está vacío y qué hacer;
  estado de carga con `cargando` (skeleton), no con la tabla vacía.

### 4.5 Objetivos táctiles

Mínimo **40px** de alto en cualquier control interactivo (`--touch-target`);
44px (`--touch-target-lg`) en acciones principales o de uso frecuente.

### 4.6 Accesibilidad mínima

- Todo control sin texto visible lleva `aria-label`.
- El color nunca es la única señal: acompáñalo de icono o de texto. Los estados
  del reporte ya traen su icono en `dominio/estados.js`; úsalo.
- Los tooltips se abren con `mouseenter` **y** con `focus`.
- Respeta `prefers-reduced-motion` con una **alternativa, no un apagado**. El kit
  redefine sus keyframes bajo esa preferencia (también en `.hrl-portal`): lo que
  entra o sale conserva el fundido sin desplazarse, lo que dice «cargando» pulsa
  en el sitio y los adornos se quedan quietos. Lo de este sistema sigue el mismo
  criterio en el bloque `@media (prefers-reduced-motion: reduce)` de
  `estilos.css`: un `@keyframes` propio se redefine ahí (ver `hrl-giro`), no se
  corta a 0 ms. Nada de animaciones en estilos en línea: ahí no hay media query
  que las cambie.

### 4.6b Tarjetas y mosaico

- **Cada panel es un `Mosaic`** del kit (`<Mosaic className="hrl-panel">`), no un
  `div` con columnas a mano. Él decide la geometría: las `Card` cortas que van
  seguidas comparten fila; una tarjeta con tabla, calendario, pasos o tira, o
  con `wide`, y todo lo que no es tarjeta (un aviso, una fila de cifras), van a
  lo largo. Para que dos tarjetas queden lado a lado, ponlas seguidas como
  hermanas; no las envuelvas en una rejilla propia. Un panel que se lee de
  arriba abajo pide `<Mosaic stacked>`: hoy, todos los de Nutrición.
- **La cabecera de una tarjeta es una fila**: `title`/`subtitle`, `meta` (el
  estado: `EstadoPeriodo`, insignias) y `actions` (la acción). El estado y el
  botón van ahí, a la derecha a la altura del título, no en una fila debajo.
  Desde la nueva interfaz (kit 1.11.0) la tarjeta ya no dibuja la barra de
  color ni la baldosa del icono: `accent` e `icon` se aceptan, pero una
  tarjeta nueva no los necesita.
- **La tarjeta de la nueva interfaz**: blanca, sin borde, 22 px de relleno,
  esquina de 22 y título de 17 px. El borde de la página es de 24 px y hay
  16 px entre tarjetas (`.hrl-panel` en `estilos.css`).

### 4.6c Cabecera, barra y menú (nueva interfaz)

- **Cada pantalla abre con la cabecera del kit** (`PageHeader`, la monta el
  `AppShell`): arriba, pequeña, la ruta (`rutaDe` en `App.jsx`: el ámbito y,
  si la hay, la sección o el grupo; nunca repite el título); debajo el título
  grande y su mensaje; a la derecha, solo la fecha.
- **El módulo inicial de cada rol saluda** («Buenas noches, Milagros»,
  `saludo()` de `dominio/formato.js`).
- **Dr. Mochi avisa una sola vez** (`AvisoMochi.jsx` → `MascotAlert` del kit,
  bajo la cabecera): en el Inicio de un área, el estado de su reporte del mes
  con su acción; en cualquier otra pantalla, solo si algo apremia (un estado con
  tono de aviso en `cabecera.js`). Nunca en «Reporte del mes», donde ya se está
  haciendo lo que pide. Los estados informativos no se muestran: repetían
  lo que el panel dice debajo. Ninguna tarjeta del panel repite el aviso.
- **Las pestañas del centro de la barra son solo lo que no está en el menú
  lateral**: las vistas de una sección (`seccion` en `navegacion.js`: los
  consolidados, una sola entrada con sus áreas en pestañas) o las de una
  pantalla (`PageTabs` del kit: los formatos de la remisión a DIRESA). Sin
  vistas, el centro queda libre.
- **El menú no tiene grupos de una sola entrada**: un rótulo que no agrupa
  nada ocupa sitio. Si una entrada queda sola, va sin grupo o con otra afín.
- **La cuenta, al pie del menú**, muestra quién tiene la sesión y, a su lado,
  un solo botón para cerrarla (con su tooltip). Solo una cuenta con dos ámbitos
  (Epidemiología, `itemsDeAmbito`) abre un menú al pulsar el perfil, con el
  cambio de ámbito. El **engranaje** de la barra abre la personalización.
- **Las cifras de un tablero llevan su tendencia** (`trend` de `StatCard`, con
  `paneles/inicio/tendencia.js`): los seis meses que terminan en el último
  enviado, consecutivos; un mes sin reporte es un hueco, nunca un cero.
- **Un control que afecta a toda la pantalla va en la cabecera**
  (`PageActions`), no en una tarjeta propia: el periodo de la bandeja y la
  simulación de envíos.
- **La barra no lleva botón «+»** en ningún módulo: se probó como atajo al
  reporte del mes y se retiró (31/10/2026). El kit conserva `primaryAction`.
- **Las cifras (`StatCard`) solo llevan icono cuando avisan** (sospechosa o
  anormal); una fila de iconos iguales no decía nada.
- **Solo iconografía de relleno.** El kit ya no tiene iconos de trazo; no se
  pide uno nuevo con trazo.

### 4.7 Tooltips en todo

Todo KPI, botón, icono y abreviatura lleva su `Tooltip` explicando qué es. Es
una práctica establecida del proyecto, no una opción. En un sistema donde diez
áreas usan vocabularios distintos, la abreviatura sin explicar es el primer
motivo de un dato mal digitado.

---

## 5. Importaciones

```js
import { Button, DataTable, Icon } from '@hrl/core-ui';   // kit (único punto de entrada)
import { AREAS } from '@/app/datos/areas.js';               // aplicación
import { transicionesDe } from '@/app/dominio/estados.js';
```

- `@` apunta a `frontend/src` (definido en `vite.config.js`).
- Del kit se importa solo de `@hrl/core-ui` (y `@hrl/core-ui/tokens.css` en
  `main.jsx`); nunca por una ruta interna.
- Dentro de `app/datos/`, los imports entre archivos de `datos/` son relativos
  (`./areas.js`); todo lo demás con `@/`.
- Nada de `../../../` en ningún caso.

---

## 6. Antes de dar algo por terminado

```bash
cd frontend
npx oxlint src/        # debe salir sin avisos
npx vite build         # debe compilar
npm run humo           # debe terminar en 0 fallos
npx hrl-core-ui doctor # 0 errores y 0 avisos
cd ../servidor && npm run prueba   # si tocaste el bot o la API
```

La prueba de humo es obligatoria si tocaste un componente, un icono, la máquina
de estados o los datos sembrados. Comprueba lo que el lint y el build no ven: un
import que no resuelve, un icono que no existe, un historial con fechas
imposibles, una transición que deja el reporte en un estado no declarado.

Verifica también que no has introducido literales:

```bash
grep -rnE "#[0-9A-Fa-f]{6}" frontend/src/
```

Lo que no puedes verificar sin navegador —que algo se vea bien— dilo
explícitamente en lugar de afirmarlo.

---

## 7. Idioma

Código, comentarios y textos de interfaz en **español**. Los nombres canónicos
del kit están en inglés porque son el vocabulario del sistema de diseño
(`Button`, `DataTable`, `PageHeader`); todo lo demás —props, variables,
comentarios— va en español.

Los comentarios explican **por qué**, no qué. Un comentario que repite lo que
dice la línea siguiente sobra. Los comentarios de este repositorio registran
decisiones: si cambias una, actualiza el comentario que la justificaba.

## 8. Hospitalización

Egresos Hospitalarios (camas, censo diario, ingresos y egresos de los pacientes
hospitalizados) vive aquí desde el 14/11/2026: su API en `servidor/hospitalizacion/`,
con su propia base PostgreSQL, y sus pantallas en `frontend/src/app/hospitalizacion/`,
montadas en este mismo shell. Sus reglas están en
[`frontend/src/app/hospitalizacion/CLAUDE.md`](frontend/src/app/hospitalizacion/CLAUDE.md)
y su documentación en `docs/hospitalizacion/`.

- Lo de este archivo vale también allí, salvo lo que ese archivo dice que se aparta
  y por qué.
- **Lo del flujo de reportes no se le aplica**: las nueve áreas, la matriz de
  destinos, la máquina de estados, `CREDENCIALES.txt` y la práctica del tutorial.
- Hay un **quinto tipo de usuario**, `hospitalizacion` (§ 3.3): las cuentas de los
  pisos, que no reportan ni reciben. Estadística no pasa a ese tipo ni tiene un rol aparte:
  su rol `revisor` trae `hospitalizacion.validar` (seeder 0011) y ve esos módulos debajo
  de su menú, solo si la API de hospitalización responde.
- **El token nombra a los dos sistemas** (`aud`) y la API de hospitalización lo lee con
  el mismo `JWT_SECRETO`. Un cambio en el token (`app/seguridad.py`) se revisa contra
  `servidor/hospitalizacion/app/seguridad.py::leer_token_de_estadistica`.

<!-- hrl-core-ui:inicio -->
<!-- Generado por `npx hrl-core-ui init` y refrescado por `npx hrl-core-ui upgrade`. No lo edites: lo que sea de este proyecto va fuera de estas marcas. -->

## Sistema de diseño (`@hrl/core-ui` v1.11.0-redesign.7)

El sistema de diseño **no vive en este repositorio**: es el paquete `@hrl/core-ui`,
fijado a un tag en `package.json`. Este proyecto es un consumidor.

- Contrato completo para modificar el kit: `node_modules/@hrl/core-ui/design.md`.
  Catálogo de componentes: `node_modules/@hrl/core-ui/UI_CATALOG.md`. Léelos antes de
  crear un componente.
- Si falta un componente, un token o un icono, **se pide en el repositorio del kit**,
  se publica una versión y aquí se sube el tag. No se copia ni se edita aquí:
  `node_modules` se pierde en cada instalación.
- Importa solo de `@hrl/core-ui` y de `@hrl/core-ui/tokens.css`; nunca por una ruta
  interna. `tokens.css` se carga **antes** que los estilos de la aplicación.
- Sin HTML nativo con contraparte en el kit: `<button>` → `Button`/`IconButton`;
  `<input>`/`<select>`/`<textarea>` → `Input`; `<table>` → `DataTable`/`PaginatedTable`;
  modales → `Dialog`/`DetailDialog`; `title="…"` como tooltip → `Tooltip`; menús →
  `DropdownMenu`; `alert()`/`confirm()` → `Dialog`/`Toast`.
- Sin valores arbitrarios: colores, radios, sombras y tamaños de fuente salen de
  tokens (`var(--…)`), nunca escritos como literal.
- Los iconos salen solo de `<Icon name="sh-…" />`.
- La API del kit está en inglés; el código de la aplicación, sus comentarios y sus
  textos, en español.

Comprobar que la integración sigue sana: `npx hrl-core-ui doctor`.
Actualizar el kit: `npx hrl-core-ui upgrade vX.Y.Z` (cambia el tag, instala sin subir
otras dependencias, muestra el CHANGELOG y revisa el proyecto).
<!-- hrl-core-ui:fin -->
