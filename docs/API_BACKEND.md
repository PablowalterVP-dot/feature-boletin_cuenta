# La API del backend, para conectar el frontend

Referencia rápida, pensada para leerse sin abrir el código de `servidor/api/`. Todos los
ejemplos de esta página son **respuestas reales capturadas del servidor** (no
inventadas a mano), con la base de pruebas de Alejandro y el catálogo de EJEMPLO de
Nutrición. Los IDs numéricos y los tokens cambian en cada instalación; la forma no.

Antes de escribir código de integración, lee **«Desajustes de contrato»** al final:
son las cinco cosas donde la forma del backend no calza con lo que el store del
frontend espera hoy.

---

## Levantar todo, en limpio

Los tres pasos son independientes (base → backend → frontend); cada uno se puede
repetir sin rehacer los anteriores. En Windows, `PGCLIENTENCODING=UTF8` es
obligatorio en cualquier paso que toque `psql`: sin él, la Á de «Área» revienta
la instalación con un error de codificación que no tiene nada que ver con un
archivo corrupto.

### 1. La base de datos

```bash
createdb -U <usuario> estadistica_hrl          # una vez; usa otra para pruebas si vas a correr pytest
cd servidor && npm run migrate && npm run seed
```

Migraciones (`bd/migraciones/`) y seeders (`bd/seeders/`), en orden y una sola
vez cada uno: ver `servidor/api/bd/README.md`. El esquema de Alejandro es
**definitivo** (no habrá un `avance_05`).

El superadmin sembrado no tiene contraseña utilizable (`POR_ASIGNAR`); se la
asignas en el paso siguiente, una vez que el backend tenga su `.env`.

### 2. El backend

```bash
cd servidor/api
py -3.14 -m venv .venv
.venv\Scripts\activate                # Windows; Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
copy .env.example .env                # y ajusta DATABASE_URL, DATABASE_URL_PRUEBAS y JWT_SECRETO

python -m app.herramientas.asignar_clave superadmin   # la pide dos veces; queda provisional

uvicorn app.main:app --reload --port 8000
```

Verifica con `curl http://localhost:8000/api/salud` (debe dar `{"ok": true, …}`)
o abre `http://localhost:8000/docs` (Swagger, generado solo; no hay que
mantenerlo a mano). `cd servidor/api && pytest` corre la suite completa contra
`DATABASE_URL_PRUEBAS` (nunca contra `DATABASE_URL`); instala y reinstala su
propio esquema sola.

### 3. El frontend

Por omisión corre **sin backend**, con sus propios datos en memoria
(`src/app/datos/`):

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Con el backend levantado (pasos 1 y 2), para usar sus datos reales de
Nutrición, poniendo esto en `frontend/.env` (no en el shell; ver la nota de
codificación más abajo):

```
VITE_API_URL=http://localhost:8000
```

y arrancando normal (`npm run dev`); o, sin archivo, `VITE_API_URL=http://localhost:8000 npm run dev`
en el shell, igual que `VITE_BOT_URL`. Las dos formas son válidas: `vite.config.js`
lee `frontend/.env` con `loadEnv` (no basta con `process.env`, que Vite no
llena solo desde el archivo) y también recoge lo que ya esté en el shell.

**El valor es el origen del backend** (`http://localhost:8000`), no una ruta
como `/api`: `vite.config.js` lo usa como destino del proxy `/api → VITE_API_URL`,
y `servicios/api.js` solo llama rutas relativas (`/api/...`) — nunca arma la URL
con este valor. Si el valor no empieza por `http://` o `https://`, `npm run dev`
avisa en la consola y el proxy no queda configurado.

**Si crea `frontend/.env` desde una consola de Windows, cuidado con la
codificación.** `>` y `Out-File` en PowerShell 5.1 escriben UTF-16 por
omisión, que Vite no puede leer como si fuera texto normal (la variable queda
como si no existiera, sin ningún error visible). Use un editor que guarde en
UTF-8, o en PowerShell: `Set-Content -Encoding utf8 frontend\.env -Value 'VITE_API_URL=http://localhost:8000'`.

Mismo criterio que `VITE_BOT_URL`: una variable de entorno, nada que la
interfaz pregunte. `servicios/api.js` decide, **por área**, si una operación va
al backend o al motor local (`AREAS_REALES` en ese archivo); hoy solo
`nutricion` tiene datos reales, así que las otras nueve áreas siguen
simuladas aunque `VITE_API_URL` esté puesta.

**Para probar un login real hace falta una cuenta que la base todavía no
siembra.** `04_semilla.sql` solo trae al `superadmin` (y no tiene ningún rol de
interfaz: no puede entrar al frontend). No hay todavía un endpoint para crear
cuentas (queda para la pantalla de administración); se crea con
`app.herramientas.crear_usuario` — mismo patrón que `asignar_clave`, apunta a
`DATABASE_URL`. Una cuenta por rol de interfaz, para tener con qué probar cada uno:

```bash
cd servidor/api
python -m app.herramientas.crear_usuario dig.nut --nombres Ana --apellidos Pérez --rol digitador --unidad nutricion
python -m app.herramientas.crear_usuario rev.est --nombres Milagros --apellidos Zumaeta --rol revisor
python -m app.herramientas.crear_usuario con.pla --nombres Raúl --apellidos Bardales --rol consulta --unidad planeamiento

NUEVA_CLAVE=Clave-Provisional-2026 python -m app.herramientas.asignar_clave dig.nut
NUEVA_CLAVE=Clave-Provisional-2026 python -m app.herramientas.asignar_clave rev.est
NUEVA_CLAVE=Clave-Provisional-2026 python -m app.herramientas.asignar_clave con.pla
```

`--rol` exige o admite `--unidad` según `seguridad.rol.alcance` (`digitador` y
`admin` la exigen; `revisor` y `superadmin` la rechazan —son globales—;
`consulta` la admite o no). La herramienta lee el alcance de la propia base y
lo dice con el nombre del rol si no calza, en vez del id numérico que da el
disparador que también lo impone (`tg_usuario_rol_alcance`).

Es **idempotente**: correr la misma línea dos veces no falla ni duplica nada,
y si la cuenta ya existe solo agrega la asignación que falte. Así se construye
también el caso real de Epidemiología, una cuenta con dos roles:

```bash
python -m app.herramientas.crear_usuario epidemiologia --nombres Elena --apellidos Pacaya --rol digitador --unidad epidemiologia
python -m app.herramientas.crear_usuario epidemiologia --rol consulta --unidad epidemiologia   # no hace falta repetir nombres/apellidos
```

Este camino completo (login real → `crear` un borrador → `enviar` → 409 sin
carga) ya se verificó de punta a punta: backend real + servidor de Vite con el
proxy, sin abrir un navegador (`vite.ssrLoadModule` + `fetch` contra el
proxy). La cuenta y el reporte de esa verificación se borraron después; no
quedaron en ninguna base.

---

## 0. Lo que existe hoy y lo que no

El backend implementa **autenticación**, las **listas** de reportes y de
recibidos, el **detalle**, los **valores** y la **revisión** de un reporte, la
**justificación de avisos**, los **avisos de la sesión** (el cajón de
notificaciones, derivado del estado), las **transiciones** del flujo y la **carga real del
Excel** (llama al bot validador y persiste su resultado) — pero solo para **Nutrición** (`NUT`), la única área con un formato
real en la base. Las otras nueve áreas, y la remisión a DIRESA y el boletín, no
tienen equivalente real todavía.

Esto importa para el diseño del hookup: **el backend nunca podrá responder por
las otras nueve áreas**, porque esos formatos no existen en su base. No es un
endpoint que falte escribir; es que la fila no existe donde se le pida.

**El hookup ya existe** (`frontend/src/app/servicios/api.js`): login, la lista,
el detalle y las transiciones (`crear`/`enviar`/`revisar`/`validar`) de
Nutrición pueden usar el backend real, con `VITE_API_URL`. El store del
frontend sigue siendo síncrono; `api.js` es la única pieza que espera una
promesa, y al resolver escribe en el store con funciones síncronas (ver
«Levantar todo» más abajo para probarlo, y el propio archivo para el diseño
completo: por qué el store no cambió, cómo conviven datos reales y simulados en
el mismo arreglo, y las cinco traducciones de forma que hizo falta decidir).
Desde el 28/09/2026 el hookup también trae las **casillas** (`GET .../valores`),
la **revisión** (`GET .../revision`) y guarda las **justificaciones** (`PUT
.../hallazgos/{clave}/justificacion`): antes, al enviar, el store se quedaba con
`datos: {}` y el reporte enviado se veía vacío (ver
`estadistica/avances/esta_avance_01/`, fuera de esta carpeta). Con backend, la única forma
de corregir cifras es **subir el Excel corregido**: no se edita en la hoja ni se
digita.

Aparte del flujo de reportes, el backend tiene las rutas del **tablero de
indicadores de desempeño** (§ 7e), con datos reales del HIS y de SINADEF. Su
pantalla todavía no existe en el frontend.

## 1. Convenciones generales

- Base: `http://localhost:8000/api` en desarrollo (`uvicorn app.main:app --port 8000`).
- Autenticación: `Authorization: Bearer <token>` en todo excepto `POST /auth/login`
  y `GET /salud`.
- `formato` es el código del formato (`NUT`), **no** la clave de la unidad
  (`nutricion`): una unidad puede tener más de un formato el día de mañana.
- `periodo` siempre es `AAAA-MM`, con cero (`2026-08`).
- Fechas y horas, ISO 8601 con zona (`America/Lima`, UTC-5). El historial usa la
  hora real del servidor de base de datos (un disparador la pone); las demás
  fechas (`fecha_envio`, `fecha_validacion`) usan el reloj del servidor de la API.
- **Dos formas de error**, y por ahora conviven:

  ```jsonc
  // Los reportes (listas, detalle, valores, transiciones): siempre esta forma.
  { "detail": "mensaje para mostrar", "codigo": "codigo_estable", "datos": { /* variable */ } }

  // La sesión (401, 403 de contraseña provisional) y /auth: solo esto.
  { "detail": "mensaje para mostrar" }
  ```

  Unificarlas es un pendiente anotado (ver README del backend); hasta entonces,
  el cliente debe tratar `codigo`/`datos` como opcionales en cualquier respuesta.

- Estados HTTP que usa toda la API: `401` sin token o vencido · `403` sin permiso,
  o el borrador de un reporte que la cuenta no trabaja · `404` no existe (acción,
  formato, periodo, oficina) · `409` el estado no permite la acción, o una regla de
  negocio (sin carga aceptada, ya existe, sin versión activa del formato, el reporte
  no está en borrador, el bot reconoció una versión inconsistente) · `422` datos de
  entrada inválidos (forma, rango, combinación de filtros, archivo demasiado grande)
  · `503` el bot validador no respondió.

## 2. Autenticación

### `POST /api/auth/login`

```json
// Cuerpo
{ "usuario": "dig.nut2", "clave": "Clave-Segura-2026" }
```

```json
// 200
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "tipo": "Bearer",
  "expira_en": "2026-09-13T20:00:00-05:00",
  "debe_cambiar_clave": false,
  "usuario": {
    "id": 6,
    "usuario": "dig.nut2",
    "nombre": "Persona Dig.Nut2",
    "cargo": "Jefatura de Nutrición",
    "correo": "nutricion@hrl.gob.pe",
    "asignaciones": [
      { "rol": "digitador", "unidad": "nutricion", "permisos": ["reporte.cargar", "reporte.descargar", "reporte.enviar", "reporte.ver"] }
    ],
    "roles_de_interfaz": ["area"]
  }
}
```

```json
// 401 (usuario inexistente o contraseña incorrecta: la misma respuesta para las dos)
{ "detail": "Usuario o contraseña incorrectos." }
```

- **El token dura 8 horas**, con las asignaciones y permisos ya adentro: el
  frontend no vuelve a pedirlos hasta que expire. Un cambio de permisos en la
  base tarda hasta 8 horas en notarse.
- `roles_de_interfaz` es la traducción a los tres roles de la interfaz (`area`,
  `estadistica`, `oficina`). Epidemiología es la única cuenta con **dos**
  (`["area", "oficina"]`): reporta y recibe.
- `asignaciones[].unidad` es la **clave** de la unidad (`nutricion`,
  `planeamiento`…), no su sigla ni su id. Estas claves coinciden con las que ya
  usa el frontend (`area: 'nutricion'`, `oficina: 'planeamiento'`): no hace falta
  traducirlas.
- Una cuenta con contraseña provisional recibe el token igual, pero con
  `debe_cambiar_clave: true`; con ese token, **todo excepto `/auth/yo` y
  `/auth/cambiar-clave` responde 403**.

### `GET /api/auth/yo`

Igual forma que `usuario` de arriba, más `usuario_id`, `emitido_en` y
`expira_en`. Sirve para comprobar que el token sigue vigente sin tocar la base.

### `POST /api/auth/cambiar-clave`

```json
// Cuerpo
{ "clave_actual": "…", "clave_nueva": "…" }
```

Responde con la misma forma que `login`, ya con `debe_cambiar_clave: false` y un
token nuevo.

## 3. La lista de reportes

### `GET /api/reportes`

Filtros por query string: `periodo` (un mes exacto) **o** `desde`/`hasta` (no se
combinan con `periodo`), `formato`, `estado`, `espera` (`area` | `estadistica` |
`nadie`), `pagina` (desde 1), `por_pagina` (hasta 100, 10 por omisión).

```json
// GET /api/reportes  (revisor de Estadística; se recortó a 3 de 8 filas)
{
  "total": 8, "pagina": 1, "por_pagina": 10, "paginas": 1,
  "filas": [
    {
      "periodo": "2026-08", "formato": "NUT",
      "formato_nombre": "Reporte mensual de Nutrición y Dietética",
      "unidad": "nutricion", "unidad_nombre": "Nutrición y Dietética",
      "estado": "no_iniciado", "espera": "area", "semaforo": "vencido",
      "dias_de_retraso": 3, "fecha_limite": "2026-09-10",
      "fecha_envio": null, "fecha_validacion": null,
      "numero_rectificacion": 0, "folio_constancia": null
    }
  ]
}
```

- **Un renglón por periodo × formato, exista o no el reporte** (`no_iniciado` es
  un estado real, no la ausencia de fila). Nunca incluye un mes posterior al
  vigente.
- **Visibilidad**: se ve lo que se tiene `reporte.ver` sobre esa unidad. Un
  reporte que no ha salido del área (`no_iniciado`, `borrador`) solo lo ve quien
  lo trabaja — una cuenta de solo consulta nunca ve un borrador, aunque tenga
  `reporte.ver` en todo el sistema.
- `semaforo`: `a_tiempo` | `fuera_de_plazo` | `pendiente` | `vencido`.
  `dias_de_retraso` es `null` si no hay atraso, **nunca 0**.
- 403 si la cuenta no tiene `reporte.ver` en ninguna unidad. 422 con filtros mal
  escritos o incompatibles (ver el ejemplo de más abajo).

```json
// GET /api/reportes?periodo=2026-13  → 422
{
  "detail": "Los datos enviados no son válidos.",
  "codigo": "datos_invalidos",
  "datos": { "errores": [{ "donde": "query", "campo": "periodo", "mensaje": "String should match pattern '^[0-9]{4}-(0[1-9]|1[0-2])$'" }] }
}
```

## 4. El detalle de un reporte

### `GET /api/reportes/{formato}/{periodo}`

```json
// GET /api/reportes/NUT/2026-08  (no_iniciado)
{
  "formato": "NUT", "unidad": "nutricion", "periodo": "2026-08",
  "estado": "no_iniciado", "numero_rectificacion": 0, "folio_constancia": null,
  "fecha_envio": null, "fecha_validacion": null, "tiene_carga_aceptada": false,
  "hallazgos": { "errores": 0, "avisos": 0, "avisos_sin_justificar": 0, "info": 0 },
  "acciones_disponibles": ["crear"],
  "historial": [], "remisiones": []
}
```

```json
// El mismo reporte, ya en borrador con una carga aceptada y un aviso justificado
{
  "formato": "NUT", "unidad": "nutricion", "periodo": "2026-08",
  "estado": "borrador", "numero_rectificacion": 0, "folio_constancia": null,
  "fecha_envio": null, "fecha_validacion": null, "tiene_carga_aceptada": true,
  "hallazgos": { "errores": 0, "avisos": 1, "avisos_sin_justificar": 0, "info": 0 },
  "acciones_disponibles": ["enviar"],
  "historial": [
    { "accion": "crear", "estado_origen": null, "estado_destino": "borrador", "numero_rectificacion": 0, "comentario": "Abre el reporte del periodo.", "fecha": "2026-09-27T15:54:51.119542-05:00" }
  ],
  "remisiones": []
}
```

- **Sin reporte, responde `200` con `estado: "no_iniciado"`**: su ausencia ES el
  estado, no un 404.
- `acciones_disponibles` ya está filtrado por lo que el estado permite **y** lo
  que esa cuenta puede hacer: son los botones exactos a pintar, sin que la
  interfaz repita la máquina de estados.
- Misma regla de visibilidad que la lista: un borrador de otra unidad, o uno que
  la cuenta no trabaja, da `403`.
- `historial[].comentario` es una nota **ya redactada** por el backend (no una
  plantilla que arme el frontend): «Enviado a Estadística. Constancia
  CR-2026-08-NUT.», «Reabierto para rectificación (n.º 2). Las oficinas que ya lo
  recibieron quedan con una versión desactualizada.», etc.
- `remisiones[]` trae **todas** (vigentes y superadas), con `es_sin_validar` y
  `es_vigente`; no hay un campo separado para «la entrega inmediata» y «la
  remisión formal» como en el store del frontend hoy (ver desajustes, más abajo).

## 5. Transiciones

### `POST /api/reportes/{formato}/{periodo}/transiciones/{accion}`

`accion` ∈ `crear` | `enviar` | `rectificar`. Desde el 12/10/2026 no existen
`revisar`, `validar` ni `remitir` (404): `enviar` entrega a la vez a Estadística
y a las oficinas de la matriz vigente, ya validado por el bot. Cuerpo opcional:
`{ "comentario"? }`; los destinos no se eligen (un campo de más es 422).

```json
// POST .../transiciones/crear
{ "formato": "NUT", "periodo": "2026-08", "accion": "crear", "estado_origen": "no_iniciado", "estado_destino": "borrador", "numero_rectificacion": 0, "constancia": null, "nota": "Abre el reporte del periodo.", "remisiones": [] }
```

```json
// POST .../transiciones/enviar, SIN carga aceptada → 409
{ "detail": "El reporte no tiene ningún Excel aceptado: suba el archivo antes de enviarlo.", "codigo": "sin_carga_aceptada", "datos": {} }
```

```json
// POST .../transiciones/enviar, CON carga aceptada
{
  "formato": "NUT", "periodo": "2026-08", "accion": "enviar",
  "estado_origen": "borrador", "estado_destino": "remitido", "numero_rectificacion": 0,
  "constancia": "CR-2026-08-NUT", "nota": "Entregado, validado por el bot, a Estadística y a: planeamiento. Constancia CR-2026-08-NUT.",
  "remisiones": [{ "destino": "planeamiento", "es_sin_validar": false }]
}
```

```json
// POST .../transiciones/crear sobre un periodo que ya tiene reporte → 409
{ "detail": "Ya existe un reporte de este periodo (estado «remitido»).", "codigo": "reporte_ya_existe", "datos": { "estado": "remitido" } }
```

- **Nota para el diseño del hookup**: `POST .../cargas` ya funciona de verdad para
  Nutrición (ver README del backend), así que `enviar` puede llegar a aceptarse si
  antes se sube un Excel válido; con la base recién instalada (NUT-1 sin activar)
  sigue dando `409 sin_version_activa`. El hookup del frontend para subir el
  archivo (`POST .../cargas`) no está escrito todavía: es el próximo paso.
- `remisiones[]` en la respuesta de `enviar` son solo las **nuevas** de esta
  transición (las de entrega inmediata a la matriz), no el acumulado.
- Errores de dominio: `422` con `hallazgos_bloquean_el_envio` (errores o avisos
  sin justificar), `periodo_futuro`, `destinos_sin_justificar`. `404` con
  `accion_desconocida` (una acción que no existe en ningún estado) o
  `no_encontrado` (formato/periodo). `409` con `estado_no_permite` (la acción no
  procede desde el estado actual).

## 6. Los valores del reporte

### `GET /api/reportes/{formato}/{periodo}/valores`

```json
// Recortado a un cuadro y un indicador (el reporte no tiene ninguna casilla con dato)
{
  "formato": "NUT", "unidad": "nutricion", "periodo": "2026-08",
  "cuadros": [
    {
      "cuadro": "f1", "titulo": "Comensales · Hospitalización",
      "indicadores": [
        {
          "indicador": "f1.asistencial.almuerzo", "nombre": "Asistencial y administrativo · Almuerzo",
          "unidad_medida": "raciones",
          "dimensiones": { "comida": "almuerzo", "servicio": "hospitalizacion", "poblacion": "comensal", "grupo_comensal": "asistencial" },
          "total": null, "casillas_con_dato": 0, "casillas_esperadas": 31,
          "casillas": []
        }
      ]
    }
  ]
}
```

- Un indicador aparece **aunque no tenga ninguna casilla**: `total: null`
  (nunca `0`) y `casillas: []`.
- `casillas[].hoja_excel`/`celda_excel` (el linaje) solo llegan cuando
  `origen: "archivo"`; en una corrección manual son `null`.
- Sin reporte, o sin una estructura activa todavía, `cuadros: []`.

**Quién lee un reporte** (detalle, valores y revisión, la misma regla en los tres,
`servicios/acceso.py`):

- quien tiene `reporte.ver` sobre el área —y lo que no salió del área (no iniciado,
  borrador) solo quien lo trabaja—, **o**
- la **oficina con una remisión vigente** del reporte (por ejemplo Planeamiento, que
  recibe Nutrición por entrega inmediata al enviar). Tras una rectificación la
  oficina pierde la lectura hasta el reenvío: la base no guarda una copia de lo
  remitido, y lo que vería serían cifras a medio corregir.

Sin `reporte.ver` sobre el área, cualquier falta (periodo inexistente, sin reporte,
sin remisión) es el mismo **403**, para no revelar qué existe.

## 6b. La revisión y las justificaciones

### `GET /api/reportes/{formato}/{periodo}/revision`

El informe del bot de la **carga vigente**, tal como se guardó, y sus hallazgos con
las justificaciones. Sirve para volver a pintar la revisión sin llamarle al bot
(después de recargar, o desde Estadística).

```json
{
  "formato": "NUT", "unidad": "nutricion", "periodo": "2026-08", "estado": "borrador",
  "carga": { "archivo": "nut.xlsx", "fecha": "2026-09-28T01:00:40-05:00", "version": "NUT-1",
             "version_bot": "0.2.0", "casillas_leidas": 1116, "informe": { "…": "el mismo de POST …/cargas" } },
  "hallazgos": [
    { "clave": "atipico|f3|liquida.cena|21", "nivel": "aviso", "titulo": "100 raciones: el resto del mes ronda las 10",
      "detalle": "…", "cuadro": "f3", "indicador": "f3.liquida.cena", "dia": 21,
      "justificacion": "Brote en el piso 3.", "fecha_justificacion": "2026-09-28T01:00:41-05:00" }
  ]
}
```

Sin reporte o sin Excel aceptado: `carga: null`, `hallazgos: []`. La `clave` de un
aviso es su `id` en el informe del bot.

### `PUT /api/reportes/{formato}/{periodo}/hallazgos/{clave}/justificacion`

Cuerpo `{ "justificacion": "texto" }`; vacío o `null` la borra. La `clave` va
**codificada** en la URL (`atipico%7Cf3%7Cliquida.cena%7C21`). Devuelve el hallazgo
como en la revisión. Queda en la bitácora con quién la escribió.

- `403` sin `reporte.cargar` sobre la unidad · `404` formato, periodo o hallazgo
  inexistentes · `409` `reporte_no_editable` (no está en borrador) o
  `sin_carga_aceptada` · `422` `hallazgo_no_justificable` (un error se corrige
  subiendo otro Excel; un info no exige nada).
- Si el área **vuelve a subir** un Excel que dispara el mismo aviso (misma clave), la
  justificación se **conserva**.

### Cambios en la carga (`POST …/cargas`)

- El backend manda al bot el **mes anterior** si ya se entregó (enviado o después),
  y así se aplica la regla de variación (±20 %). Antes nunca corría.
- Los archivos se guardan en `{RUTA_CARGAS}/{periodo}/{sigla}/{huella}.xlsx`.
- Las casillas se insertan por lotes (tope de 65 535 parámetros de PostgreSQL).
- Las fechas salen siempre con la zona de Lima (`-05:00`), sin importar la zona del
  servidor PostgreSQL.

## 7. Recibidos de una oficina

### `GET /api/oficinas/{clave}/recibidos`

```json
{
  "oficina": "planeamiento", "total": 1, "pagina": 1, "por_pagina": 10, "paginas": 1,
  "filas": [
    {
      "periodo": "2026-08", "formato": "NUT",
      "formato_nombre": "Reporte mensual de Nutrición y Dietética",
      "unidad": "nutricion", "unidad_nombre": "Nutrición y Dietética",
      "estado_de_recepcion": "validada", "constancia": "CR-2026-08-NUT",
      "remisiones": [
        { "constancia": "CR-2026-08-NUT", "es_sin_validar": false, "es_vigente": true, "numero_rectificacion": 0, "fecha": "2026-09-27T15:54:51.119542-05:00" },
        { "constancia": "CR-2026-08-NUT", "es_sin_validar": true, "es_vigente": false, "numero_rectificacion": 0, "fecha": "2026-09-27T15:54:51.119542-05:00" }
      ]
    }
  ]
}
```

```json
// Sin reporte.ver sobre esa oficina → 403
{ "detail": "Su cuenta no puede ver lo que recibió «planeamiento».", "codigo": "sin_permiso", "datos": { "permiso": "reporte.ver", "unidad": "planeamiento" } }
```

- `clave` es la clave de la unidad (`planeamiento`), no su sigla.
- **No expone el estado del reporte**, solo `estado_de_recepcion`: `validada` |
  `sin_validar` | `desactualizada`.
- 404 si `clave` no es una oficina receptora del hospital (Estadística, DIRESA y
  las áreas que solo reportan no lo son); el 404 va antes que el 403.

## 7b. Avisos de la sesión

### `GET /api/avisos`

El cajón de notificaciones. **No se guardan: se derivan del estado** en cada petición,
con la misma regla que `frontend/src/app/avisos.js` (CLAUDE.md § 4.3). Un aviso dura lo
que dura su condición; por eso no hay «marcar como leído», ni borrar, ni tabla, ni cola.

```json
{
  "generado_en": "2026-09-13T12:00:00-05:00",
  "periodo_vigente": "2026-08",
  "avisos": [
    {
      "clave": "atraso|NUT|2026-08", "ambito": "area", "tipo": "atraso", "tono": "warn",
      "titulo": "El reporte de agosto de 2026 está atrasado.",
      "detalle": "Reporte mensual de Nutrición y Dietética: el plazo venció el 10/09/2026, hace 3 días. Todavía no se ha abierto.",
      "fecha": "2026-09-11T00:00:00-05:00", "requiere_accion": true, "formato": "NUT", "periodo": "2026-08"
    }
  ]
}
```

| Ámbito | Para quién | Tipos |
|---|---|---|
| `area` | `digitador`/`admin` en una unidad, sobre los formatos de esa unidad | `atraso` (cualquier mes de los últimos 12; `crit` si no es el vigente) · `rectificacion` (reabierto, hay que reenviarlo) · del mes vigente: `en_tramite`, `validado`, `remitido` |
| `estadistica` | `revisor` | `atrasadas` (del mes, espera al área) · `por_revisar` · `por_remitir` · `arrastradas` (meses anteriores sin cerrar) — agrupados, no uno por área |
| `oficina` | `consulta` en una oficina receptora | `desactualizado` (el área reabrió algo ya recibido; PLAN.md, punto 27) · `sin_validar` · `recibido` (validado, del mes vigente) |

- **Una cuenta con dos ámbitos recibe los dos** (Epidemiología); la interfaz muestra los
  de `rolActivo`. Sin ámbito (superadmin), `avisos: []` con 200.
- **Misma visibilidad que las listas**: se calculan sobre `GET /api/reportes` y los
  recibidos, así que un aviso nunca cuenta algo que esa cuenta no vería en la lista.
- **`fecha` es cuándo ocurrió lo que cuenta** (el día siguiente al plazo, el envío, la
  validación, el último cambio de estado del historial, la llegada de la remisión). Para
  el «no leído», compárela con la última vez que la persona abrió el cajón; guardar eso es
  una comodidad por usuario y puede vivir en el navegador. `null` = no se conoce, no «viejo».
- `tipo` decide el icono en la interfaz; el backend no sabe de iconos. `clave` es estable
  mientras el hecho sea el mismo.
- Orden: `crit`, `warn`, `info`, `ok`; dentro de cada tono, lo más reciente primero.
- Con este volumen basta con pedirlo al abrir la sesión, al volver a la pestaña y cada
  minuto o dos. Si alguna vez hace falta inmediatez, se agrega un canal SSE que avise
  «hay cambios» tras cada transición; los avisos siguen saliendo de esta misma regla.

## 7b2. Consolidado anual

### `GET /api/reportes/{formato}/anual/{año}`

El total de cada cuadro, mes por mes, de los reportes **entregados** (enviado,
en revisión, validado, remitido), sumado desde `reporte.valor`:
`{ formato, unidad, anio, meses: [{ periodo, estado, totales: { f1, f2, … } }] }`.
Un mes sin reporte entregado no aparece (no es cero). Es lo que el bot
convierte en el «TOTAL» de Nutrición (`bot-validador/src/areas/nutricion/consolidado.js`).
Exige `reporte.ver` sobre la unidad del formato o global.

## 7c. Configuración pública

### `GET /api/configuracion`

Sin sesión (la pantalla de ingreso la necesita). Devuelve `nombre_sistema`,
`mensaje_ingreso`, `aviso` (solo mientras esté vigente), `preferencias` (las de
quien aún no eligió las suyas: `contraste` sistema·estandar·alto, `tamano_texto`
100·115·130·150, `subrayar_enlaces`) y `areas_en_flujo` (`[{clave, formato}]`):
las áreas con formato de versión activa y sin pausar. **El frontend toma de aquí
qué áreas son reales**; antes era una lista escrita en `servicios/api.js`.

## 7d. Panel del superadministrador (`/api/admin/*`)

Cada grupo exige su permiso **global** (`Sesion.puede(permiso)` sin unidad):
`organizacion.gestionar` (resumen, funcionamiento, plazos, áreas, matriz,
personalización), `usuario.gestionar` (cuentas, ver como) y `auditoria.ver`
(bitácora; el revisor también la tiene). Un administrador de unidad no entra.
La lista completa de rutas está en el docstring de `app/api/admin.py` y en `/docs`.

- **No altera el esquema**: la configuración son filas de `organizacion.parametro`
  (`plazo.*`, `alerta.*`, `sistema.*`, `flujo.*`, `soporte.*`) y de
  `organizacion.destino`; las cuentas, `seguridad.usuario` y `usuario_rol`.
- **Bitácora gratis**: toda escritura usa `bd_auditada`, así que los
  disparadores dejan en `auditoria.registro_cambio` quién, qué, antes y después.
  `GET /api/admin/bitacora` la lee y reemplaza `contrasena_hash` por `•••`.
- **Plazos y día hábil**: `plazo.correr_a_dia_habil` (apagado por omisión) y
  `plazo.feriado.AAAA-MM-DD`. Con la regla activa, un plazo en sábado, domingo
  o feriado se corre al siguiente día hábil. Se aplica en el único lugar donde
  se calcula la fecha límite (`servicios/consultas.py`), así que la lista, los
  avisos y la cabecera la siguen.
- **Matriz con vigencia**: agregar vale desde hoy; retirar termina ayer (o borra
  lógicamente si empezó hoy). Ambos exigen justificación (≥ 15 caracteres).
- **Guardas de cuentas** (409): no desactivarse a sí mismo, no quitarse el rol
  de superadministrador, no dejar el sistema sin un superadministrador activo,
  correo sin repetir.
- **Datos de la cuenta**: `nombres`, `apellidos`, `correo`, `cargo`,
  `numero_documento` y `telefono` (migración 0009, el celular del
  responsable), en `POST /cuentas` y `PATCH /cuentas/{id}`. El teléfono es
  opcional; se aceptan dígitos, espacios, guiones y un `+` inicial, entre 6 y
  15 dígitos (`dominio/configuracion.telefono_valido`); otra forma da 422.
- **Contraseña estándar**: el equipo usa `1234567890` para todas las cuentas
  (31/10/2026). `POST /cuentas/{id}/clave` la acepta (cumple la política de
  `dominio/claves.py`); la pantalla de cuentas la pone con «Usar la estándar».
- **Ver como** (`POST /api/admin/ver-como/{id}`, con justificación): token de 1
  hora con el claim `obs` (quién mira). `sesion_actual` rechaza con 403 toda
  petición que no sea GET/HEAD/OPTIONS con ese token: la sesión es de solo
  lectura en el servidor, no solo en la interfaz. Queda en la bitácora como
  `soporte.ver_como.{id del administrador}`.
- **Lo que no se informa**: los ingresos fallidos (el login no los guarda) y las
  sesiones activas (son tokens, sin registro). No se inventa una cifra.
- **Devolver a borrador** un reporte enviado o validado no existe en la máquina
  de estados (solo `rectificar` desde `remitido`). Es una decisión del flujo por
  acordar con Estadística; el panel de soporte reabre con `rectificar`.

## 7e. Indicadores de desempeño (`/api/desempeno/*`)

El tablero de las 34 fichas de MINSA. Cómo se instala, se cargan los datos y se
calcula: [`INDICADORES_DESEMPENO.md`](INDICADORES_DESEMPENO.md).

| Ruta | Para qué sirve | Permiso |
|---|---|---|
| `GET /api/desempeno/resumen` | Las 34 fichas con su último resultado, el estado de los datos y la ventana de corrección del HIS | `desempeno.ver` |
| `GET /api/desempeno/fichas/{numero}` | Una ficha: su ficha técnica y su resultado mes a mes | `desempeno.ver` |
| `GET /api/desempeno/fichas/{numero}/casos` | Los casos que todavía pueden sumar, **con DNI y nombre**. Con `?mes=8`, todos los pacientes del denominador de ese mes, cada uno con su situación (`opciones` vacía si ya no puede sumar) | `desempeno.ver` |
| `PUT /api/desempeno/fichas/{numero}/casos/{id}` | El seguimiento de un caso (`{"estado": …}`, uno de sus `opciones`) | `desempeno.cargar` |
| `GET /api/desempeno/fuentes` | Cada fuente: qué fichas alimenta, si ya se carga y el estado de cada mes | `desempeno.cargar` |
| `PUT /api/desempeno/fuentes/{codigo}` | A qué fichas alimenta y quién la entrega (`{"fichas": [18], "area_responsable": …}`) | `desempeno.cargar` |
| `GET /api/desempeno/cargas` | El historial de cargas del año, también las reemplazadas | `desempeno.cargar` |
| `POST /api/desempeno/cargas/revision` | Qué pasaría si se carga el archivo (`multipart`, campo `archivo`). No guarda nada | `desempeno.cargar` |
| `POST /api/desempeno/cargas` | Cargar el archivo y recalcular (campos `archivo` y `forzar`) | `desempeno.cargar` |
| `GET /api/desempeno/referencias` | Lo publicado por MINSA, frente al cálculo | `desempeno.cargar` |
| `PUT /api/desempeno/referencias` | Registrar lo publicado por MINSA de una ficha y un mes, y recalcular | `desempeno.cargar` |
| `DELETE /api/desempeno/fuentes/{codigo}/meses/{mes}` | Retirar la carga vigente de un mes (HIS o SINADEF) y recalcular. Queda en el historial con `retirada_el` | `desempeno.cargar` |
| `GET /api/desempeno/verificadas` | Las defunciones verificadas a mano en SINADEF nacional | `desempeno.cargar` |
| `POST /api/desempeno/verificadas` · `PUT …/{id}` · `DELETE …/{id}` | Agregar, corregir o retirar una, y recalcular | `desempeno.cargar` |

`GET /api/desempeno/fuentes` trae además `por_subir`: qué archivo falta de cada
mes, de qué fuentes y desde qué día sirve descargarlo (`pasos`). El resumen trae
`por_subir_ahora`. Cada mes del resultado trae `esperando_datos` y `falta_hasta`,
y su `estado` puede ser `por_cerrar`.

- **Permisos, globales.** `desempeno.ver`: el revisor de Estadística y el
  superadministrador. `desempeno.cargar`: solo el superadministrador. Los
  siembra `bd/desempeno/02_tablero.sql`. Viajan en el token: una cuenta que
  entró antes de instalarlos tiene que volver a iniciar sesión.
- **`anio` es opcional** en todas las rutas: por omisión, el último con datos.
- **Cifras, no frases.** Las respuestas traen números, fechas y estados; la
  interfaz arma sus textos («1 de 34 fichas tiene resultado…») con ellos. Los
  porcentajes son fracciones (`0.0731` es 7,31 %) y son `null` sin denominador:
  no es 0 %.
- **Siempre la última corrida** de cada ficha y año. Las anteriores siguen en la
  base, pero no son el dato vigente.
- **Estado de un mes**: `oficial` (calculado con el corte de un reporte de
  MINSA), `consolidado` (sus fuentes se cargaron después del cierre de la
  corrección del HIS, el día 21 del mes siguiente) o `preliminar`.
- **Cada caso del denominador, hoy**: `a_tiempo`, `por_corregir` (se trató, pero
  el registro no cumple la regla), `plazo_vigente` o `sin_tratamiento`. Los
  «por gestionar» son los que todavía pueden sumar.
- **Subir un archivo**: se reconoce por su contenido (trama del HIS, `.xls` de
  SINADEF, CSV de verificadas). Hasta 60 MB; el consolidado de varios años va
  por terminal. Un archivo más antiguo o con menos filas que lo cargado vuelve
  en la revisión con `requiere_forzar: true`; sin `forzar`, la carga responde
  422 `carga_rechazada` con sus `motivos`. Después de cargar se recalcula solo,
  y los casos marcados como tratados que ya suman quedan confirmados.
- **La ficha y los casos traen `textos`**, como el resumen: los nombres de los
  motivos de exclusión y de qué corregir. La ficha trae además `anio`, `hoy` y
  `dimensiones`, para decir de qué año es y a qué dimensión pertenece.
- **`por_categoria`** trae el año y, en `meses`, el mismo conteo de cada mes
  con casos: la pantalla filtra «Por tipo» por mes sin pedir nada más.
- **Las pantallas** (`frontend/src/app/paneles/desempeno/`) solo usan estas
  rutas; el menú muestra el módulo según los permisos del token.
- **Datos de pacientes**: solo `…/casos` los trae. No se registran en la
  bitácora las lecturas.

`GET /api/desempeno/resumen`, como revisor, el 08/10/2026 (recortado a la Ficha 14
y a sus dos últimos meses):

```json
{
  "anio": 2026, "hoy": "2026-10-08", "anios": [2026], "datos_al": "2026-09-30",
  "ventana": { "anio": 2026, "mes": 9, "apertura": "2026-10-12", "cierre": "2026-10-21", "abierta": false, "faltan": [] },
  "puede_cargar": false,
  "fichas": [ "…", {
    "ficha": { "numero": 14, "clave": "oportunidad_tratamiento_oncologico", "nombre_corto": "Oportunidad del tratamiento oncológico",
               "dimension": "es", "aplica": true, "tiene_calculo": true, "datos": "completo", "faltan": [], "fuentes": ["…"] },
    "resultado": {
      "corrida_id": 7, "version": "2", "fecha_corte": "2026-08-08", "mes_con_corte": 7, "fecha_fin_observacion": "2026-09-30", "meta": 0.7,
      "meses": [
        { "mes": 8, "numerador": 0, "denominador": 7, "porcentaje": 0.0, "acumulado": { "numerador": 6, "denominador": 82, "porcentaje": 0.07317073170731707 },
          "a_tiempo": 0, "por_corregir": 0, "plazo_vigente": 0, "sin_tratamiento": 7, "por_gestionar": 0, "estado": "consolidado",
          "apertura_his": "2026-09-12", "cierre_his": "2026-09-21",
          "minsa": { "numerador": 0, "denominador": 7, "coincide": true, "fecha_corte": null, "documento": null, "observacion": "Resultado de MINSA publicado el 01/10/2026, informado por Estadística. Falta el reporte oficial y su fecha de corte." } },
        { "mes": 9, "numerador": 0, "denominador": 5, "porcentaje": 0.0, "acumulado": { "numerador": 6, "denominador": 87, "porcentaje": 0.06896551724137931 },
          "a_tiempo": 0, "por_corregir": 0, "plazo_vigente": 5, "sin_tratamiento": 0, "por_gestionar": 5, "estado": "preliminar",
          "apertura_his": "2026-10-12", "cierre_his": "2026-10-21", "minsa": null }
      ],
      "consolidado_hasta": 8,
      "logro": { "numerador": 6, "denominador": 82, "porcentaje": 0.07317073170731707 },
      "cumplimiento": 0.10452961672473868, "diferencia": -0.6268292682926829, "cumple_meta": false,
      "preliminar": { "numerador": 6, "denominador": 87, "porcentaje": 0.06896551724137931 },
      "serie": [0.1111, 0.1290, 0.1220, 0.1064, 0.1034, 0.0938, 0.08, 0.0732],
      "por_gestionar": { "total": 5, "vencen_pronto": 1, "sin_revisar": 5, "en_curso": 0, "por_confirmar": 0, "no_corresponde": 0 },
      "proximo_cierre": "2026-10-21", "meses_con_minsa": 8, "coinciden_con_minsa": 8,
      "excluidos": { "primer_tratamiento_paliativo": 22, "fallecio_en_plazo": 3 },
      "por_categoria": [ { "categoria": "CUELLO_UTERINO", "nombre": "Cuello uterino", "numerador": 1, "denominador": 41 }, "…" ]
    } }, "…" ],
  "textos": { "exclusion": { "…": "…" }, "por_corregir": { "…": "…" }, "categoria": { "…": "…" } }
}
```

(`serie` va redondeada aquí para leerla; la respuesta trae todos los decimales.)
Con esto, el titular del prototipo sale así: 1 ficha con `resultado` de 34; la
14 está en `logro.porcentaje` (7,3 %) frente a `meta` (70 %); `por_gestionar.total`
casos (5) aún pueden sumar antes del `proximo_cierre` (21/10).

`GET …/casos` no lleva ejemplo aquí porque trae datos de pacientes. Por caso:
`id`, `clase`, `categoria` y su nombre, `fecha_diagnostico`, `vence`,
`dias_restantes`, `fecha_atencion` y `motivo` (si es por corregir), `cierre_his`,
`tipo_documento`, `numero_documento`, `paciente` (apellidos, nombres e historia
clínica de su atención más reciente en el HIS cargado; `null` si ya no hay datos
crudos), `seguimiento` (`estado`, `por`, `el`) y `opciones`.

## 7f. Actividades operativas de Planeamiento (`/api/planeamiento/*`)

Lo que la Oficina de Planeamiento **escribe** de las 44 actividades operativas
del POI. Lo calculado no viaja: la interfaz lo deriva de los reportes que ya lee
(`frontend/src/app/datos/planeamiento/actividades.js`). Todo exige
`actividad.ver` global (rol `planeamiento` y superadministrador); escribir,
además `actividad.registrar`. Esquema `planeamiento` (migración 0008), rol y
permisos en el seeder 0005.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/planeamiento/actividades/{anio}` | `{ anio, registros: [{ codigo, mes: "06", valor, nota, usuario, fecha }] }` |
| `PUT` | `/api/planeamiento/actividades/{anio}/{codigo}/{mes}` | Cuerpo `{ valor ≥ 0, nota? }`. Crea o reescribe la cifra del mes; devuelve el registro |
| `DELETE` | `/api/planeamiento/actividades/{anio}/{codigo}/{mes}` | Borrado lógico: el mes vuelve a su cálculo, o a «por digitar». `204` |

`codigo` es `AOI` y 11 dígitos; `mes`, 1 a 12. Un mes que todavía no empieza
responde `422`. Que un ajuste lleve nota lo exige la interfaz, que sabe qué
actividades se calculan; la base no conoce el catálogo.

## 8. `GET /api/salud`

```json
{ "ok": true, "servicio": "backend-reporte-estadistico-hrl" }
```

Sin autenticación. Sirve para el chequeo de arranque del proxy de Vite.

---

## Desajustes de contrato (leer antes de programar el hookup)

Cinco puntos donde la forma que hoy asume `frontend/src/app/datos/store.js` **no
calza** con lo que el backend realmente devuelve:

1. **El backend no tiene un «folio» (`RE-…`) separado de la constancia.** El
   store guarda `folio` (`RE-2026-08-NUT`) y `constancia` (`CR-2026-08-NUT`) como
   dos campos distintos; el backend solo persiste uno (`folio_constancia`, con el
   prefijo `CR-`). Si el frontend necesita seguir mostrando un «folio» con otro
   prefijo, hay que decidir si se deriva del mismo valor o si se pide a Alejandro.

2. **Tampoco hay un «acta de remisión» (`AR-…`).** El store arma
   `remision.acta` con ese prefijo; el backend no calcula ni guarda ningún folio
   para el conjunto de una remisión. Cada destino es una fila independiente
   (`remisiones[]`), sin un identificador que agrupe «esta remisión, a estos tres
   destinos, con esta acta».

3. **El backend junta en una sola lista lo que el store separa en dos:**
   `entregas` (la entrega inmediata, antes de validar) y `remision` (ya
   validada). El backend expone **una** lista, `remisiones[]`, con
   `es_sin_validar` y `es_vigente` para distinguir ambos casos por destino. Hay
   que decidir en qué punto se arma el objeto `remision` que las pantallas
   actuales esperan (probablemente derivándolo de `remisiones[]` filtradas), y
   qué pasa con el campo `remisionAnterior` que usa `Historial.jsx` tras una
   rectificación (el backend no lo separa: sigue en `remisiones[]` con
   `es_vigente: false`).

4. **Ningún evento del historial trae quién lo hizo.** El store guarda `actor`
   por paso; el backend expone `historial[]` sin ese campo (queda en
   `auditoria.registro_cambio`, no en esta respuesta). **Decisión tomada**: por
   ahora la interfaz oculta esa columna para un reporte real en lugar de
   mostrar un actor genérico o adivinado (el `Timeline` del kit ya omite el
   dato cuando falta). Mostrar el actor de verdad es un pendiente del backend:
   unir el historial con `auditoria.registro_cambio` por transacción o por
   ventana de tiempo cercana a `fecha_creacion`.

5. **Resuelto (28/09/2026).** El backend no tiene un `datos` por área, pero
   `servicios/api.js` traduce `GET .../valores` (cuadros → indicadores → casillas)
   a la forma `datos` de `paneles/reporte/nutricion/*` (`datosDesdeValores`): la
   fila es lo que sigue al cuadro en el código del indicador (`f1.asistencial.desayuno`),
   y un día sin casilla queda en `null`, no en 0.

Ninguno de estos cinco es un error: son decisiones de diseño distintas a las que
tomó el prototipo. Se resuelven en la capa de traducción (`servicios/api.js`), no
cambiando la base de Alejandro ni reescribiendo el store desde cero.

## Monitoreo Indicadores (`/api/monitoreo`)

Leer: Estadística, superadministrador y Dirección General (`ve_monitoreo`). Escribir: `monitoreo.registrar` (seeder 0006). Cargar el reporte DL 1153: solo el superadministrador, con `desempeno.cargar`; Estadística ve lo cargado. Sin datos de pacientes.

| Ruta | Para qué |
|---|---|
| `GET /monitoreo/{anio}` | Cifras registradas, datos del mes y avance de los compromisos |
| `PUT /monitoreo/{anio}/resultados` | Digitar lo que envió una oficina. Solo fichas 27 a 31; lo publicado por MINSA no se pisa |
| `DELETE /monitoreo/{anio}/resultados?ficha&serie&mes` | Retirar una cifra digitada |
| `PUT /monitoreo/{anio}/datos` | Un dato del mes (camas, egresos, `salasOperativas`…). Sin valor, lo borra |
| `PUT /monitoreo/{anio}/compromisos` | El avance de un entregable. Cumplido exige fecha |
| `POST /monitoreo/dl1153/revision` | Qué cambiaría el reporte DL 1153; no guarda nada. Exige `desempeno.cargar` |
| `POST /monitoreo/dl1153` | Cargar el reporte DL 1153. Exige `desempeno.cargar` |

Por terminal, desde `servidor/api`: `python -m app.herramientas.cargar_dl1153 "<archivo>"` y, una vez por año ya llevado a mano, `python -m app.herramientas.cargar_geresa "<archivo>" --anio 2026`. Ambas aceptan `--ensayo`.
