# Sistema de Reporte Estadístico · HRL

Prototipo de alta fidelidad del sistema que reemplaza el circuito en papel con
el que nueve áreas del Hospital Regional de Loreto entregan su reporte mensual a
la Oficina de Estadística.

**Es un prototipo de alta fidelidad.** Por omisión corre **sin backend**: todo
vive en memoria, no autentica de verdad y se reinicia al recargar la página.
Nutrición es la excepción — puede conectarse a un backend real (FastAPI +
PostgreSQL, con autenticación JWT) que ya valida y persiste su reporte; las
otras nueve áreas siguen simuladas. Los nombres, fechas y cifras de la
demostración son ficticios.

El repositorio se maneja en **dos partes**, cada una con un solo comando:

| Parte | Qué contiene | Cómo se levanta |
|---|---|---|
| `frontend/` | La interfaz. Siempre hace falta; sola es el modo demo | `npm run dev` |
| `servidor/` | La API (`api/`, FastAPI + PostgreSQL, solo para los datos reales de Nutrición) y el bot validador (`bot-validador/`, lee y valida el Excel de las áreas) | `npm run dev` (los dos juntos) |
| `servidor/hospitalizacion/` | Hospitalización (Egresos Hospitalarios): camas, censo diario, ingresos y egresos de los pacientes hospitalizados. Su propia API y su propia base; sus pantallas van en el mismo frontend, solo con el servidor | Ver su [README](servidor/hospitalizacion/README.md) |

Cada componente del servidor sigue teniendo su README:
[`servidor/README.md`](servidor/README.md) (el lanzador),
[`servidor/api/README.md`](servidor/api/README.md) y
[`servidor/bot-validador/README.md`](servidor/bot-validador/README.md).

---

## Arrancar

### Frontend solo — modo demo, en memoria (el caso normal)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

El motor del bot viene embebido en el navegador (mismas reglas), así que no
hace falta levantar nada más.

Las cuentas de prueba están en [`CREDENCIALES.txt`](CREDENCIALES.txt): las diez
áreas, Estadística, las tres oficinas receptoras restantes y `admin`, la del
equipo de desarrollo. Cualquier contraseña sirve; lo único que debe coincidir es
el usuario.

Epidemiología tiene doble ámbito: reporta como área y recibe como oficina, y
cambia de uno a otro sin cerrar sesión.

Con `admin` se entra a **Cuentas y roles**, desde donde se entra como cualquier
cuenta. En esas sesiones, **«Ver como…»** en la barra superior cambia de cuenta
sin volver a ingresar —para seguir el mismo reporte desde el área, desde
Estadística y desde la oficina que lo recibe— o vuelve a administración. Una
cuenta que entra por el ingreso no ve esas herramientas.

### Frontend + servidor — datos reales de Nutrición

Dos terminales.

**Terminal 1 — servidor** (la primera vez, `npm run instalar` crea el entorno
de Python y el `.env`; la base de datos y su esquema siguen siendo tuyos, ver
[`servidor/api/README.md`](servidor/api/README.md) § «Arrancar»):

```bash
cd servidor
npm run instalar     # solo la primera vez
npm run dev          # bot en :8787 y API en :8000, con el mismo Ctrl+C
```

**Terminal 2 — frontend** (la primera vez, copia el `.env` de ejemplo, que ya
apunta a la API):

```bash
cd frontend
copy .env.example .env     # en Linux/macOS: cp
npm run dev
```

Para usar además el bot como servicio y no el embebido, descomenta
`VITE_BOT_URL` en `frontend/.env`.

Con el servidor levantado, para activar el formato de Nutrición y tener una
cuenta de digitador con la que probarlo, ver «Cargar datos reales de
Nutrición…» en [`servidor/api/README.md`](servidor/api/README.md#cargar-datos-reales-de-nutrición-y-crear-una-cuenta-de-digitador).
Las otras nueve áreas siguen simuladas: el backend todavía no tiene su formato
instalado. Rutas y ejemplos: [`docs/API_BACKEND.md`](docs/API_BACKEND.md).

### En el servidor — Docker

`docker-compose.yml` levanta el frontend (nginx), la API y el bot. La base de
datos va aparte, en el PostgreSQL del servidor:

```bash
cp .env.example .env       # DATABASE_URL y JWT_SECRETO
docker compose up -d --build
```

Paso a paso (base de datos, primeras cuentas, HTTPS, respaldo):
[`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

## Verificar

```bash
cd frontend
npx oxlint src/      # lint, debe salir limpio
npx vite build       # debe compilar
npm run humo         # prueba de humo, debe terminar en 0 fallos
```

**La prueba de humo usa el bot embebido a propósito** (comprueba
`MODO_BOT.tipo === 'embebido'`): si hay un `VITE_BOT_URL` en `frontend/.env`
apuntando a un servicio que no está levantado, la sección 19 falla al intentar
conectarse por red. Para verificar sin tocar `.env`: `VITE_BOT_URL= npm run humo`.

```bash
cd servidor
npm run prueba       # el bot y luego pytest de la API; las que necesitan
                     # PostgreSQL real se saltan sin DATABASE_URL_PRUEBAS
```

```bash
cd servidor/hospitalizacion
.venv/Scripts/python -m pytest pruebas   # la API de hospitalización, sobre su PostgreSQL de desarrollo
```

La prueba de humo del frontend —más de 4000 comprobaciones, hospitalización incluida en sus secciones 28 a 33— carga cada módulo con el
cargador SSR de Vite, ejercita el dominio (la máquina de estados completa, las
reglas de honestidad de las cifras, los invariantes de los datos sembrados, la
coherencia de la matriz) y renderiza cada pantalla, incluida la aplicación
completa con una sesión de cada rol.

No abre un navegador: comprueba que nada lanza, no que la interfaz se vea bien.
Sin CSS y sin efectos, no dice nada sobre el modo oscuro, el ancho de móvil ni
los diálogos.

---

## Documentación

| Documento | Para qué |
|---|---|
| [`docs/CONTEXTO.md`](docs/CONTEXTO.md) | El problema, el flujo real, la matriz de destinos, los estados y las decisiones tomadas. **Empieza aquí.** |
| [`docs/PLAN.md`](docs/PLAN.md) | Qué está hecho, qué falta y qué está bloqueado por un insumo externo |
| [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) | Levantar el sistema en el servidor con Docker; la base va aparte |
| [`docs/API_BACKEND.md`](docs/API_BACKEND.md) | Las rutas del backend, con ejemplos reales, para conectar el frontend |
| [`docs/INDICADORES_DESEMPENO.md`](docs/INDICADORES_DESEMPENO.md) | Indicadores de desempeño: los pasos para cargar el HIS MINSA y SINADEF y calcular la Ficha 14, cómo abrir el tablero, y para qué sirve cada archivo, tabla y comando. Sus rutas: `API_BACKEND.md` § 7e |
| [`CLAUDE.md`](CLAUDE.md) | El contrato de implementación. Obligatorio antes de tocar código |
| [`docs/hospitalizacion/`](docs/hospitalizacion/index.md) | Hospitalización: el proceso, las reglas, el plano de camas y sus decisiones. Su integración aquí: [decisión 0011](docs/hospitalizacion/decisiones/0011-integracion-con-estadistica.md) |
| `frontend/node_modules/@hrl/core-ui/UI_CATALOG.md` | Catálogo del sistema de diseño (paquete `@hrl/core-ui`): si algo no está ahí, no existe |

---

## Estructura

```
servidor/             npm run dev levanta los dos (ver servidor/README.md)
  api/                FastAPI + PostgreSQL: datos reales de Nutrición
  bot-validador/      Lee y valida el Excel de las áreas
frontend/src/
  app/
    dominio/          estados.js   la máquina de estados del reporte
                      periodos.js  periodos mensuales y plazos
                      roles.js     los tres tipos de rol
                      formato.js   cifras y fechas, con las reglas de honestidad
    datos/            areas.js     las nueve áreas y la matriz de destinos
                      oficinas.js  las cuatro receptoras y DIRESA
                      usuarios.js  catorce cuentas de demostración
                      reportes.js  ocho periodos de historial simulado
                      estadistica-propios.js  datos que digita Estadística
                      formatos/    lo que envía cada área, con sus cálculos;
                                   levantados.js registra las áreas con oficio
                                   (Lavandería e Imágenes)
                      diresa/      los dos formatos a DIRESA y sus fuentes
                      store.js     almacén en memoria
    paneles/          una pantalla por archivo; estadistica/ para ese rol;
                      reporte/ los formatos de cada área (imagenes/ aparte);
                      inicio/ los tableros de cada área
    avisos.js         notificaciones derivadas del estado
    navegacion.js     el menú de cada rol
    App.jsx           sesión, rol activo, panel activo
    Login.jsx
    DemoRol.jsx       conmutador de sesión; andamio de la demostración
frontend/pruebas/
  humo.mjs
```

## Tres cosas que conviene saber antes de leer el código

1. **La máquina de estados manda.** Una pantalla no decide qué se puede hacer
   con un reporte: se lo pregunta a `dominio/estados.js` y pinta un botón por
   cada transición permitida. Toda mutación pasa por `aplicarTransicion`.

2. **La matriz de destinos es una sola.** Está en `datos/areas.js`.
   `oficinas.js` no repite el mapa: lo deriva. Quién recibe qué no se configura
   desde la interfaz.

3. **Un reporte que no existe no se almacena.** Su ausencia es el estado
   `no_iniciado`. Guardar un registro vacío afirmaría que alguien lo abrió, y esa
   diferencia es justo la que el semáforo de cumplimiento necesita mostrar.
