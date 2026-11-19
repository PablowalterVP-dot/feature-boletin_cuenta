# Plan de personalización · Apariencia y accesibilidad

| | |
|---|---|
| Estado | **En curso.** Hechas (kit `v1.10.0-redesign.9`, 03/10/2026): **contraste** (Como el sistema · Estándar · Alto), **tamaño del texto** (100–150 %) y **subrayar enlaces**, en el cajón del perfil, con `check-contrast` en cuatro modos. Pendiente: los 85 colores escritos a mano dentro de las reglas (F0), espaciado del texto, movimiento, el panel en la pantalla de ingreso y las preferencias en la cuenta (F5). |
| Fecha | 03/10/2026 |
| Alcance | Kit `@hrl/core-ui` (rama `redesign`, hoy `v1.10.0-redesign.5`), aplicación (rama `redesign`) y, en la fase 5, el backend |
| Fila en el plan | `docs/PLAN.md` · N13 |
| Norma | WCAG 2.2, nivel AA como piso; AAA en el modo de alto contraste |

Este documento es lo que se retoma en la próxima sesión. La sección 10 dice
por dónde empezar.

---

## 1. Objetivo

Que cada persona ajuste la interfaz a su vista y a su equipo sin que el
sistema pierda las garantías que ya tiene. Los casos que lo motivan:

- pantallas viejas o mal calibradas;
- turnos de noche con poca luz;
- baja visión;
- fotofobia;
- dificultades de lectura.

Las garantías que no se tocan:

- el estado se muestra con icono y texto, no solo con color;
- contraste AA en todos los modos;
- tablas legibles;
- controles de 40 px como mínimo.

**Principio rector.** WCAG pide que el contenido funcione con los ajustes del
propio usuario: el zoom del navegador, el tema y el contraste del sistema
operativo, y los colores forzados de Windows. Las opciones del sistema
**complementan** esos ajustes, no los reemplazan. Por eso:

1. cada opción arranca en «Como el sistema»;
2. los colores forzados de Windows se respetan siempre, haya o no preferencia
   guardada;
3. ninguna opción puede dejar la interfaz por debajo de AA.

---

## 2. Criterios WCAG 2.2 que se atienden

| Criterio | Nivel | Qué exige | Estado hoy | Cómo lo cubre el plan |
|---|---|---|---|---|
| 1.4.1 Uso del color | A | El color no es la única señal | Se cumple: estados con icono y texto | Opción «Subrayar enlaces» para los enlaces verdes sin subrayado |
| 1.4.3 Contraste mínimo | AA | 4.5:1 texto, 3:1 texto grande | Se cumple: `check-contrast` del kit en claro y oscuro | Se mantiene en los cuatro modos |
| 1.4.6 Contraste mejorado | AAA | 7:1 texto, 4.5:1 texto grande | No se busca | Modo **alto contraste** |
| 1.4.4 Cambio de tamaño del texto | AA | 200 % sin perder contenido ni función | Sin medir | «Tamaño del texto» hasta 150 %, más zoom del navegador hasta 200 %. Se quitan las alturas fijas con texto |
| 1.4.10 Reflujo | AA | Sin scroll horizontal a 320 px CSS | Medido a 375 px | Se mide a 320 px, con texto al 100 y al 150 % |
| 1.4.11 Contraste no textual | AA | 3:1 en bordes de controles, iconos y foco | **Sin verificar** | Entra en `check-contrast`: bordes de `Input`, chips, anillo de foco, series |
| 1.4.12 Espaciado del texto | AA | Aguantar interlineado 1.5, párrafos 2×, letras 0.12 em, palabras 0.16 em | Sin medir | Opción «Espaciado amplio», que además sirve de prueba |
| 2.3.3 Animación por interacción | AAA | Desactivar el movimiento no esencial | Solo sigue `prefers-reduced-motion` | Opción «Reducir movimiento» |
| 2.4.7 Foco visible | AA | Foco visible | Se cumple | Se mantiene |
| 2.4.13 Apariencia del foco | AAA | Anillo ≥ 2 px con 3:1 de contraste | Parcial | Foco reforzado (3 px, separación de 2 px) en alto contraste |
| 2.5.8 Tamaño del objetivo | AA | 24 px como mínimo | Se cumple: 40 px (`--touch-target`) | Se mantiene a cualquier tamaño de texto |
| 4.1.3 Mensajes de estado | AA | Anunciar cambios sin mover el foco | — | Región `aria-live` en el panel |

---

## 3. Las opciones

Son seis. Cada una es un eje independiente y se combinan libremente.

| # | Opción | Valores | Por defecto | Qué cambia |
|---|---|---|---|---|
| 1 | **Tema** | Como el sistema · Claro · Oscuro | Como el sistema | Paleta clara u oscura. «Como el sistema» lee `prefers-color-scheme` (hoy el defecto es claro fijo) |
| 2 | **Contraste** | Como el sistema · Estándar · Alto | Como el sistema | Capa de tokens AAA. «Como el sistema» lee `prefers-contrast: more` |
| 3 | **Tamaño del texto** | 100 · 115 · 130 · 150 % | 100 % | Multiplica la escala `--text-*`. No toca el espaciado ni la barra lateral |
| 4 | **Espaciado del texto** | Normal · Amplio | Normal | Interlineado 1.5 → 1.8, letras +0.12 em, palabras +0.16 em, párrafos +2× |
| 5 | **Movimiento** | Como el sistema · Reducido | Como el sistema | Activa las redefiniciones de keyframes que ya existen para `prefers-reduced-motion` |
| 6 | **Subrayar enlaces** | Sí · No | No | Subraya enlaces y `Button tone="link"` |

Además, **Restablecer** devuelve todo a su valor por defecto.

### 3.1 Por qué el contraste es un eje y no un tercer tema

Si «Claro · Oscuro · Alto contraste» fueran tres opciones excluyentes,
habría que elegir entre oscuro y contraste. Quien tiene fotofobia y baja
visión necesita las dos cosas. Con dos ejes salen cuatro modos:

| | Contraste estándar | Contraste alto |
|---|---|---|
| **Claro** | claro (el de hoy) | claro AAA |
| **Oscuro** | oscuro (el de hoy) | oscuro AAA |

### 3.2 Por qué el texto llega hasta 150 % y no a 200 %

- Llevar el texto a 200 % desde el panel obligaría a rediseñar la barra
  superior y la lateral, que no escalan.
- El zoom del navegador llega a 200 % y agranda también los controles, que es
  lo que pide 1.4.4.
- El sistema tiene que **aguantar** el zoom al 200 % de todos modos; eso se
  verifica igual (sección 8).

### 3.3 Lo que queda fuera, y por qué

| Descartado | Motivo | Alternativa |
|---|---|---|
| Filtros para daltonismo | El estado ya va con icono y texto | Revisar la paleta de series (`--serie-1…5`) con simulación de deuteranopía y protanopía en los cuatro modos |
| Fuente para dislexia | El kit no carga nada de internet; habría que empaquetarla | Séptima opción más adelante (p. ej. Atkinson Hyperlegible, licencia OFL), sin rehacer nada |
| Colores a elección | Rompe la garantía de contraste | — |
| Cursor, lupa, lector de pantalla | Son del sistema operativo | Verificar que el sistema funciona con ellos |

---

## 4. Interfaz

### 4.1 En el cajón del perfil

La sección «Apariencia y accesibilidad» reemplaza al interruptor de modo
oscuro (`InterruptorTema` en `AppShell.jsx`). Las opciones van de la más usada
a la menos usada:

```
┌ Perfil ──────────────────────────────────┐
│        (avatar)                          │
│        Nombre Apellido                   │
│        cargo · rol                       │
│                                          │
│  APARIENCIA Y ACCESIBILIDAD              │
│  Tema                                    │
│  [ Sistema | Claro | Oscuro ]            │
│  Contraste                               │
│  [ Sistema | Estándar | Alto ]           │
│  Tamaño del texto                115 %   │
│  [ A | A | A | A ]                       │
│                                          │
│  LECTURA                                 │
│  Espaciado amplio                 ( o)   │
│  Subrayar enlaces                 (o )   │
│  Reducir movimiento               (o )   │
│                                          │
│                     Restablecer          │
│  ──────────────────────────────────────  │
│  [ Cerrar sesión ]                       │
└──────────────────────────────────────────┘
```

Reglas de comportamiento:

- **Se aplica al instante.** No hay «Guardar»: el cambio es su propia vista
  previa y se deshace igual de rápido.
- **Ejes de varios valores** (tema, contraste, tamaño): `SegmentedControl`,
  un grupo de radios con aspecto de botones. Las flechas mueven la selección,
  Tab entra y sale del grupo.
- **Ejes de dos valores**: `Switch` con `role="switch"` y `aria-checked`.
- **Tamaño del texto**: cada segmento muestra una «A» al tamaño que produce,
  con `aria-label` «Texto al 115 %». El valor se muestra en texto a la derecha.
- **Anuncio**: una región `aria-live="polite"` dice lo que cambió
  («Contraste alto activado»). El foco no se mueve.
- **Ayuda**: cada opción lleva una línea de descripción y su `Tooltip`
  (CLAUDE.md § 4.7). Contraste, por ejemplo: «Texto y bordes más marcados.
  Útil con poca vista o con una pantalla con reflejos».
- **Texto grande**: con texto al 150 %, el cuerpo del cajón se desplaza por
  dentro y «Cerrar sesión» queda fijo al pie, siempre alcanzable.
- **Restablecer** pide confirmación solo si hay más de una opción cambiada,
  con un `Toast` con «Deshacer», no un `Dialog`: no es irreversible.

### 4.2 En la pantalla de ingreso

Un `IconButton` «Apariencia» (icono `sh-gear` o uno nuevo, `sh-accesibilidad`)
en la esquina superior de `LoginScreen`. Abre el mismo `PreferencesPanel`
dentro de un `Dialog`. Quien no puede leer el formulario de ingreso nunca
llega al perfil, así que es la pantalla donde más falta hace.

### 4.3 Componentes nuevos del kit

El panel no sabe nada del hospital, así que vive en el kit (CLAUDE.md § 1):

| Componente | Props | Notas |
|---|---|---|
| `SegmentedControl` | `options` [{value, label, ariaLabel?}] · `value` · `onChange` · `label` **(req.)** · `size` | `role="radiogroup"`, flechas con salto circular, 40 px de alto mínimo |
| `Switch` | `checked` · `onChange` · `label` **(req.)** · `description` | Hoy existe solo dentro de `AppShell` (`hrl-tema__palanca`); se publica como primitivo |
| `PreferencesPanel` | `value` · `onChange` · `onReset` · `limits?` | Controlado; pinta las seis opciones con sus ayudas y la región `aria-live` |
| `usePreferences(key)` | → `[prefs, setPrefs, reset]` | Lee, migra, resuelve «Como el sistema», aplica y recuerda |
| `readPreferences(key)` / `applyPreferences(prefs)` | — | Para usar fuera de React (`main.jsx`, `Login.jsx`) |

`AppShell` recibe `preferencesKey` en lugar de `themeKey`. `themeKey` se
acepta como alias durante una versión menor.

---

## 5. Arquitectura técnica

### 5.1 Modelo de preferencias

```js
// Lo que se guarda (localStorage y, en la fase 5, la cuenta)
{
  v: 1,                                     // versión del formato, para migrar
  tema: 'sistema' | 'claro' | 'oscuro',
  contraste: 'sistema' | 'estandar' | 'alto',
  texto: 1 | 1.15 | 1.3 | 1.5,
  espaciado: 'normal' | 'amplio',
  movimiento: 'sistema' | 'reducido',
  enlaces: false | true,
}
```

- **Validación al leer.** Si un valor no es uno de los conocidos, se toma el
  valor por defecto de esa opción, no el de todas. Un JSON roto vuelve a los
  valores por defecto.
- **Migración.** Si existe la clave antigua (`hrl_re_theme`, con `dark` o
  `light`), su valor pasa a `tema` y la clave antigua se borra. Corre una sola
  vez.
- **Clave.** `hrl_re_prefs` en `app/tema.js`, que pasa a llamarse
  `app/preferencias.js`. Es propia del sistema por la misma razón que la de
  hoy: no heredar la preferencia de otro frontend del hospital en el mismo
  dominio.

### 5.2 Resolución y aplicación

JavaScript resuelve «Como el sistema» y escribe atributos **ya resueltos** en
`<html>`. El CSS mira solo los atributos.

| Preferencia | Se resuelve con | Atributo / variable en `<html>` |
|---|---|---|
| tema | `matchMedia('(prefers-color-scheme: dark)')` | `data-tema-hrl="claro\|oscuro"` (el que ya existe) |
| contraste | `matchMedia('(prefers-contrast: more)')` | `data-contraste-hrl="estandar\|alto"` |
| texto | — | `style="--hrl-escala-texto: 1.15"` |
| espaciado | — | `data-espaciado-hrl="normal\|amplio"` |
| movimiento | `matchMedia('(prefers-reduced-motion: reduce)')` | `data-movimiento-hrl="normal\|reducido"` |
| enlaces | — | `data-enlaces-hrl="si\|no"` |

Por qué así:

- **Una sola fuente de reglas.** CSS no puede decir «si el sistema lo pide *o*
  el usuario lo eligió» sin duplicar el bloque, una vez bajo `@media` y otra
  bajo el atributo. Al resolverlo en JavaScript, cada regla se escribe una vez.
- **Los cambios del sistema se siguen en vivo.** Con «Como el sistema»,
  `usePreferences` escucha el evento `change` de cada `matchMedia` y reescribe
  el atributo.
- **En `<html>`**, como el tema de hoy, para que alcance a lo que se monta por
  portal en `document.body`: diálogos, tooltips y avisos.
- **Antes del primer render.** `main.jsx` llama a
  `applyPreferences(readPreferences(CLAVE))` antes de `createRoot`, para evitar
  el destello del tema equivocado. `Login.jsx` deja de llamar a `applyTheme`
  por su cuenta.
- **Sin JavaScript no hay aplicación**, así que no se necesita un respaldo
  por `@media`. La única excepción es `forced-colors` (5.5).

### 5.3 Requisito previo: que todo color salga de tokens

El alto contraste solo puede cambiar lo que pasa por un token. Inventario de
hoy en `tokens.css` del kit:

- **85 colores escritos como literal dentro de reglas** (no en definiciones de
  tokens): 26 `background`, 9 `color`, 6 `border`, 5 `box-shadow` y otros. Casi
  todos son el gris `rgba(145, 158, 171, α)` con α entre 0.05 y 0.34, el negro
  `rgba(28, 37, 46, α)` de velos y sombras, y variantes de rojo y verde de
  error y éxito.
- **Sombras**: `--shadow-card` y `--shadow-card-hover` son tokens, pero varias
  sombras de componentes están escritas a mano.
- **Fondos «soft»**: `--*-soft` son tokens con transparencia. En alto
  contraste pasan a fondo liso con borde.

Trabajo de la fase 0:

1. Reunir esos literales en tokens semánticos de `tokens.json`, por ejemplo:
   - `--border-strong`, `--border-soft` y `--hover-overlay` para los grises;
   - `--scrim` (ya existe) y `--shadow-*` para velos y sombras;
   - `--destructive-border` y `--success-border` para los bordes de estado.
2. Que `check-literales.mjs` del kit falle con un literal de color fuera de una
   definición de token, como ya hace la aplicación con su prueba de humo.
3. Mantener el aspecto: los tokens nuevos toman exactamente el valor que
   reemplazan. El cambio visual en claro y oscuro estándar tiene que ser cero
   (se comprueba con capturas antes y después).

### 5.4 Capas de alto contraste

En `tokens.json` se suman dos capas que **solo sobrescriben lo que cambia**:
`lightHigh` y `darkHigh`. `generate-tokens.mjs` las emite así:

```css
:root[data-contraste-hrl='alto'] .hrl-nuevo, …                  { /* lightHigh */ }
:root[data-tema-hrl='oscuro'][data-contraste-hrl='alto'] .hrl-nuevo, … { /* darkHigh */ }
```

Qué cambia en alto contraste:

| Elemento | Estándar | Alto |
|---|---|---|
| Texto secundario (`--text-secondary`) | 4.5:1 | ≥ 7:1 |
| Texto deshabilitado | sin exigencia (WCAG lo exime) | ≥ 4.5:1, para que se lea |
| Bordes (`--border`, `--input-border`) | grises translúcidos | sólidos, ≥ 3:1 contra la superficie |
| Fondos `-soft` de estado | translúcidos | fondo liso con borde de 1 px del color de estado |
| Sombras de tarjeta | `--shadow-card` | ninguna; borde de 1 px `--border-strong` |
| Anillo de foco | el de hoy | 3 px sólido, separación de 2 px, ≥ 3:1 |
| Enlaces | verde | verde AAA y subrayados (aunque «Subrayar enlaces» esté apagado) |
| Chips de estado | fondo tenue + icono | borde + icono + texto AAA |
| Series de gráficos | `--serie-1…5` | paleta revisada: ≥ 3:1 contra el fondo y entre series vecinas |
| Barra de la tarjeta (`accent`) | color pleno | se mantiene; si no da 3:1, pasa a la variante `-text` |

`check-contrast.mjs` se amplía:

- evalúa los cuatro modos;
- exige 4.5:1 en estándar y 7:1 en alto para texto normal;
- exige 3:1 no textual en todos: bordes de control, foco, series contra el
  fondo y la barra `accent`;
- en alto contraste no quedan colores translúcidos, así que la lista de «no
  evaluado» tiene que quedar vacía.

### 5.5 Colores forzados (contraste alto de Windows)

Es otro mecanismo y no se puede activar desde JavaScript: el sistema operativo
reemplaza todos los colores por los suyos. Se atiende con un bloque
`@media (forced-colors: active)` en el kit:

- borde de 1 px `CanvasText` en tarjetas, botones, chips y campos, porque su
  fondo desaparece;
- iconos SVG con `fill: currentColor` (revisar el sprite);
- foco con `outline: 2px solid Highlight`;
- `forced-color-adjust: none` **solo** donde el color es el dato: barras de
  series y la mascota (`Mascot` del kit: se pide allí, porque el dibujo es suyo);
- la barra `accent` de la tarjeta toma `CanvasText`, porque si no, desaparece.

Se prueba en Windows: Configuración → Accesibilidad → Temas de contraste.

### 5.6 Tamaño del texto

**Lo que ya está a favor.** El 100 % de los `font-size` del kit y de la
aplicación sale de tokens `--text-*`; no hay ninguno escrito a mano (0 en la
aplicación, 0 sin token en el kit).

**Cambios de la fase 0:**

1. Escala en `rem` multiplicada por la preferencia:
   ```css
   --text-base: calc(0.84375rem * var(--hrl-escala-texto, 1)); /* 13.5px */
   ```
   Con `rem`, el texto también respeta el tamaño de letra configurado en el
   navegador, no solo el zoom. Equivalencias: xs 11 px = 0.6875 rem ·
   sm 12.5 = 0.78125 · base 13.5 = 0.84375 · md 14 = 0.875 · lg 17 = 1.0625 ·
   xl 22 = 1.375 · 2xl 30 = 1.875.
2. **Alturas fijas con texto dentro.** De las 26 alturas en px de `tokens.css`,
   la mayoría son adornos sin texto: icono de `StatCard`, pista de progreso,
   puntos, aro de carga, interruptor, barra de la tarjeta. Las que sí
   contienen texto y se cortarían:

   | Selector | Hoy | Pasa a |
   |---|---|---|
   | `.hrl-topbar__row` | `height: 52px` | `min-height: 52px` |
   | `.hrl-field__ver` (ver contraseña) | `height: 32px` | `min-height: 32px`, ancho igual |
   | `.hrl-bell__badge` (número de avisos) | `height: 18px` | `min-height` en `em` |
   | `.hrl-paso__num` (número del paso) | `height: 26px` | `min-height` y ancho en `em` |
   | `.hrl-barras__valor` (valor de la barra) | `height: 16px` | `min-height` en `em` |
   | `.hrl-detalle__sello` | `height: 44px` | `min-height: 44px` |

   A eso se suman los 7 `height`/`minHeight` en línea de la aplicación, que hay
   que revisar uno por uno. `--touch-target` sigue siendo el mínimo de todo
   control.
3. **El mosaico en `rem`.** `Mosaic min=420` pasa a medirse en `rem`
   (26.25 rem). Con texto grande, las tarjetas se apilan solas antes de
   apretarse.
4. **Gráficos.** Confirmar que los rótulos de `SeriesBars`, de las barras de
   reparto y del calendario leen `--text-*`, y que los ejes no se enciman al
   130–150 %. Si no caben, se rota o se abrevia el rótulo con su `Tooltip`.

**Lo que no escala, a propósito:** el espaciado (`--space-*`), el ancho de la
barra lateral (260 px, 76 plegada), los iconos de los controles y los radios.
Escalar todo es el zoom del navegador, que ya existe.

### 5.7 Espaciado del texto

- Tokens nuevos: `--tracking-texto` (0 → 0.12 em), `--tracking-palabras`
  (0 → 0.16 em) y `--parrafo` (margen entre párrafos). `--leading-normal` y
  `--leading-loose` pasan de 1.5/1.6 a 1.8 bajo
  `[data-espaciado-hrl='amplio']`.
- Ningún componente escribe `line-height` ni `letter-spacing` a mano; hoy hay
  algunos (por ejemplo `letter-spacing: -0.4px` en el `h1` de `PageHeader`).
  Pasan a token.
- Los números de las tablas no se espacian: `font-variant-numeric:
  tabular-nums` y `letter-spacing: 0` en `NumberCell`, para que las columnas
  sigan alineadas.

### 5.8 Movimiento

- El kit ya redefine sus `@keyframes` bajo
  `@media (prefers-reduced-motion: reduce)`, al final de `tokens.css` y también
  para `.hrl-portal`. La aplicación hace lo mismo con `hrl-giro` en
  `estilos.css`.
- Esos dos bloques pasan a colgar de `[data-movimiento-hrl='reducido']`.
  JavaScript lo enciende cuando el sistema lo pide o cuando el usuario lo
  elige.
- La regla de CLAUDE.md § 4.6 no cambia: es una alternativa, no un apagado.
  Lo que entra conserva el fundido sin desplazarse, lo que dice «cargando»
  pulsa en el sitio.
- El `Mosaic` y los `Toast` no animan su reacomodo bajo movimiento reducido.

### 5.9 Persistencia

**Fase 1, en el dispositivo** (`localStorage`):

- funciona también antes de ingresar;
- todo acceso va en `try/catch`: en modo privado o con el almacenamiento
  bloqueado, la preferencia se aplica en la sesión y no se recuerda;
- limitación real en un hospital: en un equipo compartido, la pantalla de
  ingreso muestra la preferencia del último que lo usó. Al cerrar sesión se
  conserva igual, porque quitarla podría dejar al siguiente con una interfaz
  que no puede leer.

**Fase 5, en la cuenta:**

- La tabla `usuario` (esquema de Alejandro, avance_04) no tiene dónde
  guardarla. Hay dos caminos para **pedirle**:
  - **A (recomendada):** columna `preferencias jsonb null` en `usuario`. Es
    simple, se lee con el token de sesión y no necesita joins.
  - **B:** tabla `usuario_preferencia (usuario_id pk/fk, datos jsonb,
    fecha_modificacion)`.
- Endpoints:
  - `GET /api/cuentas/yo/preferencias` → el objeto o `null`;
  - `PUT /api/cuentas/yo/preferencias` → valida la versión y los valores
    conocidos, y rechaza claves extra (422).
- Precedencia:
  - antes de ingresar, manda el dispositivo;
  - al ingresar, manda la cuenta si tiene preferencias, y se copia al
    dispositivo;
  - si la cuenta no tiene, se sube la del dispositivo.
- Cada cambio en el panel guarda en el dispositivo al instante y en la cuenta
  con un retraso de unos 800 ms, para no mandar una petición por cada clic.
  Si la petición falla, se reintenta al siguiente cambio y no se avisa con
  error: la preferencia ya está aplicada.
- En modo demo (sin `VITE_API_URL`) solo existe la fase 1.

### 5.10 Lo que se rompe si no se cuida

| Riesgo | Medida |
|---|---|
| **Impresión** del boletín y de los reportes | `@media print` fuerza claro estándar, texto al 100 % y sin espaciado amplio |
| **Excel y PDF exportados** | No heredan nada, y está bien. Se dice en la ayuda |
| **Logo** en alto contraste | Ya tiene variante oscura (`.hrl-logo` bajo `oscuro`); revisar que dé 3:1 en alto |
| **Mascota** (ilustración, excepción de § 2.2) | Revisar que no pierda la silueta en los cuatro modos y con colores forzados |
| **Destello al cargar** | Aplicar antes de `createRoot` (5.2) |
| **Código que lee `data-tema-hrl`** | Se mantiene el atributo y sus valores; lo que ya existe sigue funcionando |
| **Pruebas y capturas** que asumen un solo modo | La matriz de la sección 8 |
| **Rendimiento** | Cambiar un atributo de `<html>` recalcula los estilos una vez; sin costo apreciable. El `Mosaic` se reacomoda solo (ResizeObserver) |

---

## 6. Fases y tareas

### F0 · Tokens limpios (kit) — requisito de todo lo demás

- [ ] Inventario automático de los 85 colores escritos como literal en reglas de `tokens.css`, agrupados por valor.
- [ ] Tokens semánticos nuevos en `tokens.json` (light y dark) con los valores exactos de hoy.
- [ ] Reemplazo en `tokens.css`; `check-literales.mjs` falla con un literal fuera de una definición.
- [ ] `--text-*` en `rem` multiplicados por `--hrl-escala-texto`.
- [ ] Las seis alturas fijas con texto (5.6) pasan a `min-height`.
- [ ] `--leading-*`, `--tracking-*` y `--parrafo` como tokens; `letter-spacing` y `line-height` escritos a mano pasan a token.
- [ ] `Mosaic min` en `rem`.
- [ ] **Aceptación:** capturas antes y después idénticas en claro y oscuro al 100 %; `verificar` y `contrast` en verde.

### F1 · Motor de preferencias (kit)

- [ ] `readPreferences`, `applyPreferences` y `usePreferences`, con validación, migración de la clave antigua y `matchMedia` en vivo.
- [ ] `AppShell` acepta `preferencesKey`; `themeKey`, `readTheme` y `applyTheme` quedan como alias marcados en `deprecated.js`.
- [ ] Bloques de movimiento reducido bajo `[data-movimiento-hrl='reducido']`.
- [ ] `[data-espaciado-hrl='amplio']` y `[data-enlaces-hrl='si']`.
- [ ] Pruebas en `humo.mjs` del kit: migración, valores inválidos, resolución de «sistema».
- [ ] **Aceptación:** cambiar el tema del sistema operativo con «Como el sistema» cambia la interfaz sin recargar.

### F2 · Alto contraste (kit) — en paralelo con F1, una vez cerrada F0

- [ ] Capas `lightHigh` y `darkHigh` en `tokens.json`, y su emisión en `generate-tokens.mjs`.
- [ ] Foco reforzado; tarjetas con borde y sin sombra; chips con borde; enlaces subrayados.
- [ ] Paleta de series revisada para los cuatro modos, con simulación de deuteranopía y protanopía.
- [ ] Bloque `@media (forced-colors: active)`.
- [ ] `check-contrast.mjs`: cuatro modos, AAA en alto, 3:1 no textual, lista de «no evaluado» vacía en alto.
- [ ] **Aceptación:** `contrast` en verde en los cuatro modos; captura de cada pantalla del kit (stories) en los cuatro.

### F3 · Panel (kit)

- [ ] `SegmentedControl` y `Switch` como primitivos, con stories y entrada en `UI_CATALOG.md`.
- [ ] `PreferencesPanel`, con la región `aria-live`, las ayudas y los tooltips.
- [ ] `ProfileDrawer` usa el panel en lugar de `InterruptorTema`; el cuerpo se desplaza por dentro y «Cerrar sesión» queda fijo.
- [ ] `LoginScreen` gana el botón «Apariencia», que abre el panel en un `Dialog`.
- [ ] Icono `sh-accesibilidad` en el registro, si se decide usar uno propio.
- [ ] CHANGELOG, `MIGRACION.md` (de `themeKey` a `preferencesKey`) y versión menor.
- [ ] **Aceptación:** el panel completo se maneja solo con teclado; NVDA anuncia el nombre, el valor y el cambio de cada control.

### F4 · Aplicación

- [ ] `npx hrl-core-ui upgrade` a la versión del kit con F0–F3.
- [ ] `app/tema.js` → `app/preferencias.js` (clave `hrl_re_prefs`); `main.jsx` aplica antes del render; `Login.jsx` y `App.jsx` usan la clave nueva.
- [ ] Revisar los 7 `height`/`minHeight` en línea y `estilos.css` (`.hrl-carga__zona`, `.hrl-dias`, calendario fijo bajo la barra, `.hrl-lectura`).
- [ ] Pantallas de Nutrición, Lavandería, Imágenes y Estadística revisadas a 150 % y en alto contraste.
- [ ] `@media print` en claro estándar para el boletín.
- [ ] CLAUDE.md: reglas nuevas (sección 9).
- [ ] **Aceptación:** la matriz de la sección 8 en verde.

### F5 · Preferencias en la cuenta (backend) — independiente, requiere el visto bueno del esquema

- [ ] Pedir a Alejandro la opción A o B (5.9).
- [ ] Modelo, servicio y API (`dominio/ servicios/ datos/ api/` del backend, como avisos), con pruebas.
- [ ] Cliente en `app/servicios/` y precedencia en `usePreferences` (el kit recibe `onChange` y `initial`; no hace fetch, CLAUDE.md § 1).
- [ ] **Aceptación:** la preferencia elegida en un equipo aparece al ingresar desde otro.

### F6 · Verificación final y documentación

- [ ] Matriz completa (sección 8), prueba manual con NVDA, Windows en contraste alto y zoom al 200 %.
- [ ] `docs/PLAN.md` N13 en [hecho]; `UI_CATALOG.md` y `design.md` del kit actualizados.

**Orden:** F0 → (F1 ∥ F2) → F3 → F4 → F6. F5 en cualquier momento después de F1.

---

## 7. Cambios por archivo (mapa)

| Archivo | Fase | Cambio |
|---|---|---|
| kit `tokens.json` | F0, F2 | Tokens nuevos; capas `lightHigh` y `darkHigh` |
| kit `scripts/generate-tokens.mjs` | F2 | Emitir las capas de alto contraste |
| kit `scripts/check-contrast.mjs` | F2 | Cuatro modos, AAA, no textual |
| kit `scripts/check-literales.mjs` | F0 | Fallar con literales en reglas |
| kit `tokens.css` | F0–F2 | Literales a tokens, escala en `rem`, `min-height`, atributos de preferencias, `forced-colors` |
| kit `src/theme.js` → `src/preferences.js` | F1 | Motor; `theme.js` reexporta los alias |
| kit `src/AppShell.jsx` | F3 | `ProfileDrawer` con `PreferencesPanel`; `preferencesKey` |
| kit `src/LoginScreen.jsx` | F3 | Botón «Apariencia» y `Dialog` |
| kit `src/SegmentedControl.jsx`, `src/Switch.jsx`, `src/PreferencesPanel.jsx` | F3 | Nuevos |
| kit `src/Layout.jsx` | F0 | `Mosaic min` en `rem` |
| kit `src/index.js`, `src/deprecated.js`, `UI_CATALOG.md`, `MIGRACION.md`, `CHANGELOG.md` | F1, F3 | Exportaciones, alias, documentación |
| app `src/main.jsx` | F4 | Aplicar las preferencias antes de `createRoot` |
| app `src/app/tema.js` → `src/app/preferencias.js` | F4 | Clave nueva |
| app `src/app/Login.jsx`, `src/app/App.jsx` | F4 | Usar la clave nueva |
| app `src/app/estilos.css` | F4 | Alturas, movimiento bajo atributo, impresión |
| app `frontend/pruebas/humo.mjs` | F4 | Matriz de modos y tamaños |
| backend `app/datos/modelos/seguridad.py` y una API nueva | F5 | Preferencias en la cuenta |
| `CLAUDE.md`, `docs/PLAN.md` | F4, F6 | Reglas y estado |

---

## 8. Verificación

**Automática (cada fase, antes de darla por terminada):**

| Prueba | Dónde | Exige |
|---|---|---|
| Contraste | `npm run contrast` del kit | AA en estándar, AAA en alto, 3:1 no textual; «no evaluado» vacío en alto |
| Literales | `npm run verificar` del kit; humo de la aplicación | Ningún color fuera de un token |
| Render | `npm run humo` de la aplicación | Cada pantalla en las 16 combinaciones (4 modos × 4 tamaños), sin lanzar |
| Reflujo | Chrome sin ventana por CDP (scripts del scratchpad, a promover a `frontend/pruebas/`) | Sin scroll horizontal de página a 320 px, con texto al 100 y al 150 % |
| Recortes | ídem | Ningún control con `scrollHeight > clientHeight` bajo `overflow: hidden`; nada con texto cortado por `text-overflow` sin `Tooltip` |
| Objetivos táctiles | ídem | Ningún control por debajo de 40 px en ningún tamaño |
| Foco | ídem | Anillo visible y 3:1 contra su fondo en los cuatro modos |
| 1.4.12 | ídem | Inyectar los cuatro espaciados y medir que nada se corte ni se superponga |
| Lint, build, doctor | CLAUDE.md § 6 | Como siempre |

**Manual (F6):**

- NVDA con Firefox y Chrome: nombre, valor y anuncio de cada control del
  panel; recorrido completo del flujo de Nutrición con texto al 150 %.
- Windows con tema de contraste alto: el flujo de Nutrición completo.
- Zoom del navegador al 200 % con texto al 100 %: nada se pierde ni se superpone.
- Un teléfono real a 375 px con texto al 130 %.

Lo que solo se ve con el ojo (que algo se vea bien) se dice como tal en el
informe, no se afirma (CLAUDE.md § 6).

---

## 9. Reglas nuevas para CLAUDE.md (al cerrar F4)

- Ningún color escrito como literal, tampoco `rgba`, ni en el kit ni en la
  aplicación. Todo token de color nuevo lleva sus **cuatro** variantes: claro,
  oscuro, claro AAA y oscuro AAA.
- Ningún `height` fijo en un elemento con texto: `min-height` y relleno.
- Ningún `line-height` ni `letter-spacing` escrito a mano: salen de token.
- Toda animación nueva se redefine bajo `[data-movimiento-hrl='reducido']`.
- Toda pantalla nueva se revisa a 150 % y en alto contraste antes de darla por
  terminada.
- Las preferencias se leen con `usePreferences`. Ninguna pantalla consulta
  `localStorage` ni `matchMedia` por su cuenta.

---

## 10. Para retomar en la próxima sesión

**Estado del repositorio al guardar este plan:**

- **Kit** `DevHRL/hrl-core-ui`, rama `redesign`, tag `v1.10.0-redesign.5`
  (subido). La copia de trabajo está en el scratchpad de la sesión anterior; en
  la próxima sesión se vuelve a clonar.
- **Aplicación** `DevHRL/Estadistica_hrl`, rama `redesign`, ya apuntando a
  `#v1.10.0-redesign.5` (subido en `a0ccb77`).
- **Sin subir:** solo este plan y las filas N12–N13 de `docs/PLAN.md`, que
  quedan sin confirmar en git. Todo lo demás, incluida la carga de panel con
  bloques (`c4afb7c`), ya está en el remoto.
- **Servicios locales:** solo el modo real (`:5173`, con
  `VITE_API_URL=http://localhost:8000`) y el backend en `:8000`. El modo demo
  (`:5174`) no se levanta. Tras tocar el kit, se reinicia `:5173` con `--force`
  y se recarga con Ctrl+Shift+R.

**Primer paso:** responder las decisiones de la sección 11 y empezar F0 por el
inventario de literales del kit:

```bash
git clone -b redesign https://github.com/DevHRL/hrl-core-ui.git
cd hrl-core-ui
grep -nE "rgba\(|#[0-9a-fA-F]{3,8}\b" tokens.css | grep -vE "^\s*[0-9]+:\s*--"
```

---

## 11. Decisiones pendientes

| # | Pregunta | Recomendación | Qué cambia según la respuesta |
|---|---|---|---|
| 1 | ¿Contraste como eje propio o alto contraste como tercer tema? | **Eje propio** | Con tercer tema desaparece el oscuro AAA y `darkHigh` |
| 2 | ¿Tope de texto en el panel: 150 % o 200 %? | **150 %** | 200 % obliga a rediseñar la barra superior y la lateral (F0 crece) |
| 3 | ¿Se pide a Alejandro guardar las preferencias en la cuenta? ¿Opción A (columna) o B (tabla)? | **Sí, opción A** | Sin ella, F5 no existe y la preferencia no sigue a la persona |
| 4 | ¿Fuente para dislexia ahora o después? | **Después** | Ahora suma una fuente empaquetada (peso del kit) y una séptima opción |
| 5 | ¿Icono propio `sh-accesibilidad` para el botón de la pantalla de ingreso? | **Sí** | Con `sh-gear`, se confunde con «configuración del sistema» |
