# Backend

API del Sistema de Reporte Estadístico del HRL. FastAPI + SQLAlchemy 2 sobre
PostgreSQL. Lee primero [`docs/CONTEXTO.md`](../../docs/CONTEXTO.md).

**El esquema de la base de datos no lo genera el backend.** Sale de los scripts
de `bd/migraciones/` (el esquema de Alejandro y lo que se le agregó encima) y
`bd/seeders/`, que aplica el gestor `app.herramientas.bd` (`npm run migrate`,
`npm run seed`); no hay Alembic ni modelos que generen DDL. Ver
[`bd/README.md`](bd/README.md). **El esquema de Alejandro es definitivo: confirmó que no lo avanzará más.** Lo que
antes se pedía como cambio de la BD (un disparador, una fecha) queda como
limitación asumida o se resuelve del lado del backend; no hay un «avance_05» que
esperar.

## Arrancar

Lo normal es no entrar aquí: desde `servidor/`, `npm run instalar` (una vez) y
`npm run dev` levantan la API junto con el bot (ver
[`servidor/README.md`](../README.md)). Lo que el instalador **no** hace —la base
y la clave del superadmin— va igual:

```bash
cd servidor
npm run instalar                      # crea api/.venv, instala y copia .env.example → .env
# ajusta en api/.env DATABASE_URL, DATABASE_URL_PRUEBAS y JWT_SECRETO

# La base la creas tú (vacía); el gestor instala el esquema y los catálogos:
npm run migrate && npm run seed
cd api

# El superadmin sembrado no tiene contraseña (POR_ASIGNAR): asígnale una para poder entrar:
.venv\Scripts\python -m app.herramientas.asignar_clave superadmin   # Linux/macOS: .venv/bin/python; la pide dos veces; es provisional

cd .. && npm run dev                  # API en :8000 y bot en :8787
```

A mano, sin el lanzador (equivalente):

```bash
cd servidor/api
py -3.14 -m venv .venv
.venv\Scripts\activate                # Windows; en Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

La base de datos la provee quien despliega: el backend solo necesita
`DATABASE_URL`. El `docker-compose.yml` de la raíz levanta la API, el bot y el
frontend en el servidor, **sin base de datos**: ver
[`docs/DESPLIEGUE.md`](../../docs/DESPLIEGUE.md).

## Cargar datos reales de Nutrición y crear una cuenta de digitador

Con el esquema instalado y el superadmin con clave, para tener el formato de
Nutrición activo y una cuenta de digitador con la que probarlo:

```bash
cd servidor/api
python -m app.herramientas.cargar_catalogo_nutricion
python -m app.herramientas.configurar_nutricion_real
python -m app.herramientas.configurar_plazos
python -m app.herramientas.configurar_alertas
python -m app.herramientas.crear_usuario dig.nut --nombres Ana --apellidos Perez --rol digitador --unidad nutricion
python -m app.herramientas.asignar_clave dig.nut --definitiva
```

- `cargar_catalogo_nutricion` activa NUT-1 (4 cuadros, 36 indicadores, oficio
  N.º 122-2026). Sin esto, `enviar` siempre da 409: no hay versión activa.
- `configurar_nutricion_real` deja NUT-2 (la estructura del Excel real de
  Nutrición) en `en_configuracion`, lista para cuando el bot lea por
  `configuracion` en vez de nombres definidos — no la activa.
- `configurar_plazos` siembra el plazo real por área y destino
  (`organizacion.parametro`, clave `plazo.{área}.{destino}`); sin esto, la
  API cae al día 10 genérico para todas las áreas.
- `configurar_alertas` siembra el umbral de la alerta «semana con datos
  faltantes» (provisional: 1 día, pendiente de confirmar con Giancarlo).
- Las tres son idempotentes: correrlas de nuevo no duplica ni pisa un valor
  ya ajustado a mano (`--recargar` si se quiere actualizar al valor conocido).
- `crear_usuario` deja la cuenta con clave `POR_ASIGNAR` (no se puede entrar
  hasta asignarle una).
- `asignar_clave ... --definitiva` no la marca como provisional (sin
  `--definitiva`, la cuenta debe cambiarla al primer ingreso).

**En Windows, `asignar_clave` (que pide la contraseña dos veces con
`getpass`) no acepta la clave por una tubería (`echo clave | python ...`):
`getpass` lee directo de la consola e ignora la entrada redirigida.** Para
automatizar o pasarla sin que quede en el historial de la shell, usa la
variable de entorno `NUEVA_CLAVE` en lugar del prompt:

```bash
NUEVA_CLAVE='una-clave-de-al-menos-10' python -m app.herramientas.asignar_clave dig.nut --definitiva
```

## Activar Laboratorio

Laboratorio (Patología Clínica y Anatomía Patológica) es un formato **mensual**:
una cifra por examen y procedencia, sin días. El área sube su libro del año (una
hoja por mes) y el bot lee la del mes. Su catálogo no se activa al arrancar, a
propósito: activarlo pone a Laboratorio en el flujo. Para activarlo:

```bash
cd servidor/api
python -m app.herramientas.cargar_catalogo_laboratorio
python -m app.herramientas.crear_usuario dig.lab --nombres Ana --apellidos Perez --rol digitador --unidad laboratorio
python -m app.herramientas.asignar_clave dig.lab --definitiva
```

- Crea el formato `LAB` y activa `LAB-1` (9 cuadros, 1 081 indicadores; la hoja
  de cada cuadro es un patrón de mes) desde
  `app/herramientas/catalogos/laboratorio.json`. Ese JSON **no se edita a mano**:
  se genera de la definición del bot con
  `node servidor/scripts/exportar-catalogo-laboratorio.mjs`, y
  `prueba_laboratorio.py` falla si dejan de coincidir.
- Con `LAB-1` activa, Laboratorio entra al flujo (`GET /api/configuracion`) y el
  frontend lo trata como área real.
- Sin `configurar_plazos` para Laboratorio, su plazo es el día 10 genérico.

## Activar Farmacia

Farmacia sube su **informe mensual en Word** (`.docx`), no un Excel. El bot lo
lee (`bot-validador/src/areas/farmacia/`) y la API lo guarda como guarda el
Excel de Laboratorio: el archivo en `CARPETA_CARGAS` y una cifra por casilla en
la base. Para activarla, una sola vez:

```bash
cd servidor/api
# 1. La base de Alejandro no admite Word: la migración 0007 lo agrega (no toca datos).
cd .. && npm run migrate && cd api
# 2. El formato FAR y su versión FAR-W1 (3 cuadros, 45 casillas), activa.
python -m app.herramientas.cargar_catalogo_farmacia
# 3. La cuenta del área.
python -m app.herramientas.crear_usuario farmacia --nombres Control --apellidos Archivo --rol digitador --unidad farmacia
python -m app.herramientas.asignar_clave farmacia --definitiva
```

- Sin el paso 1, el paso 2 se niega y dice qué falta.
- Las casillas salen de `app/herramientas/catalogos/farmacia.json`, que **no se
  edita a mano**: se genera con `node servidor/scripts/exportar-catalogo-farmacia.mjs`
  y `prueba_farmacia.py` falla si deja de coincidir con el bot.
- Con `FAR-W1` activa, Farmacia entra al flujo y el frontend la trata como área
  real: lo que sube queda en el servidor, para cualquier computadora.
- Todo aviso se justifica antes de enviar, como en Nutrición (el informe de
  enero trae uno: títulos con el año equivocado).

## Activar Centro Quirúrgico

Centro Quirúrgico sube su **libro del mes**, que es acumulado (una columna por
mes): el bot lee la columna del mes de cinco hojas (RESUMEN, CUADRO DE
INDICADORES, SUSPENDIDAS, CIRUGIA MAYOR y CIRUGIA MENOR). Es un formato
**mensual**. Para activarlo, una sola vez:

```bash
cd servidor/api
python -m app.herramientas.cargar_catalogo_centro_quirurgico
python -m app.herramientas.crear_usuario dig.cqx --nombres Ana --apellidos Perez --rol digitador --unidad centro-quirurgico
python -m app.herramientas.asignar_clave dig.cqx --definitiva
```

- Crea el formato `CQX` y activa `CQX-1` (5 cuadros, 75 indicadores) desde
  `app/herramientas/catalogos/centro_quirurgico.json`, que **no se edita a
  mano**: se genera con `node servidor/scripts/exportar-catalogo-centro-quirurgico.mjs`
  y `prueba_centro_quirurgico.py` falla si deja de coincidir con el bot.
- **La base guarda el total de cada especialidad, no cada procedimiento**: la
  lista de procedimientos cambia casi cada mes, y el detalle viaja entero en
  `carga.informe_bot` (`datos.procedimientos`). Ver el docstring de la herramienta.
- Las horas del RESUMEN son indicadores `decimal`; lo demás, `entero`.
- Con `CQX-1` activa, Centro Quirúrgico entra al flujo y el frontend la trata
  como área real. Sin `configurar_plazos` para `CQX`, su plazo es el día 10 genérico.
- El libro de abril de 2026 pesa 54 MB (una hoja con formato hasta la fila un
  millón) y supera el límite de 5 MB: el área tiene que borrar las filas
  vacías y volver a guardarlo.

## Verificar

```bash
pytest
```

Las pruebas que necesitan PostgreSQL (`@pytest.mark.bd`) usan **solo**
`DATABASE_URL_PRUEBAS` (entorno o `.env`). Sin ella, se saltan y las demás
corren. Necesitan una base real: los disparadores de la auditoría, los `CHECK` y
las vistas de Alejandro no existen en SQLite.

**Instalan solas el esquema de Alejandro** en esa base (basta con que exista
vacía) y cada prueba corre en una transacción que se deshace, así que los datos
de `04_semilla.sql` están siempre y nada persiste.

**Borran los cinco esquemas del proyecto y `public`.** Por eso: no tienen
respaldo en `DATABASE_URL` (tu base de desarrollo), se niegan a correr si las dos
apuntan a la misma base, y se niegan si la base tiene esquemas o tablas que no
son del proyecto.

`prueba_instalacion.py` corre además la `06_prueba.sql` de Alejandro con `psql`
(en el PATH o en la variable `PSQL`); si no lo encuentra, esa prueba se salta.

## Contratos

Sin Alembic ni un solo dueño del esquema, lo que evita que las piezas se
desalineen son pruebas de contrato.

**Modelos ↔ base de datos** (`prueba_modelos_vs_bd.py`). Compara cada modelo con su
tabla real (columnas, tipos, largos, nulabilidad, identidad, clave primaria y
claves foráneas) y exige un modelo por cada tabla y vista de `seguridad` y
`organizacion`. Si Alejandro cambia algo y copias su avance nuevo a `bd/`, fallan y
dicen qué. El comparador (`coincidencia.py`) se prueba contra modelos
deliberadamente mal hechos, para demostrar que detecta lo que dice detectar.

**La máquina de estados, en tres fuentes.**

```
frontend/src/app/dominio/estados.js  ─▶ contrato/estados.json   lo que ve la interfaz
app/dominio/estados.py                                            lo que sabe el backend
reporte.estado_reporte / transicion_estado                        lo que dice la BD
```

`prueba_contrato_estados.py` compara el JS, el JSON y Python (sin base de datos).
`prueba_contrato_bd.py` añade la BD: estados, estructura de las transiciones, permiso
de cada acción y, lo que más importa, **quién puede**: que el frontend diga que
`enviar` es del `area` y que la BD dé ese permiso a `digitador` y `admin` sea la
misma frase. `crear` no está en `transicion_estado` a propósito (es el INSERT del
reporte y exige `reporte.cargar`).

Si cambias una transición en el frontend:

```bash
cd frontend && node scripts/exportar-contrato.mjs   # regenera el JSON
# y ajusta servidor/api/app/dominio/estados.py (y pídele a Alejandro el cambio en transicion_estado)
```

En ejecución, el backend lee `transicion_estado` de la BD; `estados.py` queda como
dominio puro y para estas pruebas.

**Las listas: reglas escritas dos veces** (`prueba_contrato_consultas.py`). El semáforo, la
visibilidad y el estado de recepción existen en SQL (para filtrar, contar y paginar en la
base) y en Python (para mostrar). Cada par tiene su prueba de que no se separan; la del
semáforo evalúa la definición real de `reporte.v_cumplimiento` el día antes, el día y el día
después de cada plazo, y si Alejandro cambia esa vista, la prueba lo dice.

## Estructura

```
app/
  main.py         Punto de entrada.
  config.py       Variables de entorno.
  seguridad.py    Contraseñas (Argon2id) y tokens (JWT).
  herramientas/   Utilidades de línea de comandos: asignar la clave inicial,
                  crear cuentas (docs/API_BACKEND.md, sin endpoint todavía) y
                  cargar el catálogo real de Nutrición y activar NUT-1.
  dominio/        Reglas: estados, periodos, roles, folios, reloj, transiciones. Sin
                  dependencias de infraestructura (ni SQLAlchemy ni FastAPI).
  datos/          Modelos SQLAlchemy sobre el esquema de Alejandro y sus consultas.
  servicios/      Las operaciones sobre reportes: transicionar, detalle, listas, carga (bot real).
  api/            Un router por recurso, y la traducción de errores a HTTP.
bd/               Los scripts SQL de Alejandro (fuente de verdad del esquema).
contrato/         Máquina de estados exportada del frontend.
pruebas/          pytest.
```

La dirección de dependencias es `api/ → servicios/ → datos/ → dominio/`. Código, comentarios y nombres en español.

## Autenticación

Sobre `seguridad.*` de Alejandro. `POST /api/auth/login` con
`{"usuario": "...", "clave": "..."}` devuelve un JWT (HS256) de **8 horas**; el
resto de la API lo pide como `Authorization: Bearer <token>`.

- **Se autoriza por permisos y unidad, no por rol.** El token lleva las
  **asignaciones** de la cuenta (un rol en una unidad, o global) con los permisos
  que cada una da, tomados de `seguridad.v_permiso_usuario`. `sesion.puede(
  "reporte.enviar", "nutricion")` exige el permiso **y** la unidad: tener el
  permiso en otra unidad no vale, y una asignación global (`revisor`) vale en todas.
  `exigir_permiso(...)` es solo la puerta del endpoint; la unidad concreta se
  comprueba dentro.
- **Epidemiología** (reporta y recibe) es una cuenta con dos asignaciones sobre su
  unidad (`digitador` y `consulta`) y un solo token. La respuesta traduce los
  roles de la base a los tres tipos de la interfaz (`roles_de_interfaz`).
- **Se leen del token en cada petición**, sin consultar la base. Contrapartida
  aceptada: un cambio de permisos, o desactivar una cuenta, tarda hasta 8 horas en
  aplicar. Una prueba lo deja escrito; si se añade una lista de revocación, debe
  cambiar.
- **Una asignación a una unidad eliminada o inactiva se descarta**, no se vuelve
  global. Es un riesgo real de traducir el id de la unidad a su clave.
- **Contraseña provisional.** El superadmin sembrado tiene `POR_ASIGNAR` (nadie
  entra) y las cuentas nuevas nacen con `debe_cambiar_contrasena`. Con ella, el
  token solo sirve para `GET /api/auth/yo` y `POST /api/auth/cambiar-clave`; todo
  lo demás responde 403 hasta cambiarla.
- Contraseñas con Argon2id. «Usuario inexistente» y «contraseña equivocada»
  responden igual y tardan lo mismo. Una cuenta desactivada o sin permisos lo dice
  solo a quien ya demostró saber la contraseña.
- **Auditoría.** La BD no sabe quién actúa: cada petición que escribe usa
  `bd_auditada`, que fija `app.usuario_id` y `app.direccion_ip` con
  `set_config(…, true)` (solo dura esa transacción, así que el endpoint hace un
  único `commit()` al final). Una IP que no sea una IP se descarta: la función de
  la BD hace `::INET` y haría fallar la escritura.
- El secreto (`JWT_SECRETO`, al menos 32 caracteres) va por entorno. Solo HS256.
  El tiempo sale del reloj inyectable (`America/Lima`).

## Reportes

```
GET  /api/reportes                                              la lista, paginada (ver «Las listas»)
GET  /api/oficinas/{clave}/recibidos                            lo que una oficina recibió
GET  /api/reportes/{formato}/{periodo}                          el estado de un reporte
GET  /api/reportes/{formato}/{periodo}/valores                  las casillas, con su linaje (ver «Los valores»)
GET  /api/reportes/{formato}/{periodo}/alertas                  alertas del área real, con el plazo y el reloj reales (ver «Las alertas»)
POST /api/reportes/{formato}/{periodo}/transiciones/{accion}    crear, enviar, revisar, validar, remitir, rectificar
POST /api/reportes/{formato}/{periodo}/cargas                   sube el Excel: lo valida el bot y persiste el resultado
```

`formato` es el código (`NUT`, sin distinguir mayúsculas) y `periodo` es `AAAA-MM`.

**La base de datos no impone la máquina de estados ni comprueba nada antes de enviar**
(se comprobó: un `UPDATE` lleva un reporte sin carga de `enviado` a `remitido`). Lo hace
el servicio, en una sola transacción, con la fila del reporte bloqueada
(`SELECT … FOR UPDATE`) y **un solo `commit()` al final**, que es también lo que hace que la
auditoría atribuya todo lo escrito a quien actuó. Las transiciones se leen en ejecución de
`reporte.transicion_estado`.

| Acción | Permiso | Desde → hasta | Comprobaciones | Efectos |
|---|---|---|---|---|
| `crear` | `reporte.cargar` | (no existe) → borrador | el periodo existe y no es posterior al vigente | `INSERT … ON CONFLICT DO NOTHING`; historial |
| `enviar` | `reporte.enviar` | borrador → enviado | carga vigente aceptada; ningún hallazgo de error; todo aviso justificado | `folio_constancia` `CR-AAAA-MM-SIGLA[-n]`, `fecha_envio`, remisiones «sin validar» a la entrega inmediata |
| `revisar` | `reporte.revisar` | enviado → en_revision | | |
| `validar` | `reporte.validar` | enviado o en_revision → validado | | `fecha_validacion` y usuario |
| `remitir` | `reporte.remitir` | validado → remitido | destinos = matriz, o justificación escrita | una `remision` por destino; **reemplaza** la entrega inmediata (una sola vigente por destino) |
| `rectificar` | `reporte.rectificar` | remitido → borrador | | `numero_rectificacion` +1; lo entregado queda `es_vigente = false`; se limpia la validación |

- **Constancia por envío.** El primer envío es `CR-2026-08-NUT`; tras rectificar, el
  reenvío es `CR-2026-08-NUT-2` (`-3`…). Es el número de rectificación más uno.
- **Se comprueba el permiso sobre la unidad del formato**, no solo el rol. La cuenta
  de Estadística es global; un digitador solo actúa sobre su unidad.
- **Sin reporte, `GET` responde 200 con `estado: no_iniciado`**: su ausencia es el estado.
  `acciones_disponibles` son las que el estado permite y que esa cuenta puede hacer.
- **El historial usa la fecha del disparador de la BD**; el reloj inyectable solo gobierna
  `fecha_envio` y `fecha_validacion`.
- **Errores** con la misma forma `{detail, codigo, datos}`: 403 sin permiso · 404 acción,
  formato o periodo inexistentes · 409 el estado no lo permite, el reporte ya existe, no
  hay Excel aceptado, no hay versión activa del formato, el reporte no está en borrador,
  el bot reconoció una versión inconsistente con la base, o algo que la base rechaza
  (disparador o restricción) · 422 hallazgos que bloquean, periodo futuro, destinos sin
  justificar, archivo demasiado grande o datos inválidos · 503 el bot validador no
  respondió. Los de sesión (401) y los de `/auth` mantienen `{"detail": "..."}`.
- **La carga del Excel llama al bot de verdad.** Guarda el archivo (`RUTA_CARGAS`, por
  huella SHA-256, así no se duplica), le manda al bot `{area, periodo, nombre, archivo,
  configuracion}` (la `configuracion` sale de `formato.v_configuracion_lectura`) y, según
  lo que responda: si bloquea, guarda solo la `carga` con su motivo; si acepta, reemplaza
  las casillas, los totales declarados y los hallazgos dentro de la misma transacción que
  describe `INFORME_AVANCE_04.md` § 4, con `app.carga_id` fijado para que la bitácora
  resuma en una fila por tabla. Un solo `commit()`, como el resto de transiciones. Sin
  `BOT_VALIDADOR_URL` configurado, responde 503 antes de intentar guardar nada leído del
  archivo.
- **La respuesta trae el informe del bot completo, no un resumen.** `{resultado, informe}`,
  con `informe` tal cual lo arma el bot (errores, avisos, info con su fila/día/detalle,
  reglas con su estado, datos, origen, archivo, bot) — sin tipar campo por campo a
  propósito: esa forma la define el bot, no el backend, y tiparla aquí obligaría a
  perseguir cada cambio suyo. Es lo que la interfaz necesita para armar la misma revisión
  detallada que ya sabe mostrar, sin volver a llamarle al bot por su cuenta: el backend es
  la única fuente de verdad de qué se validó.

### Las listas

**`GET /api/reportes`** — un renglón por periodo × formato, del más reciente al más antiguo,
**exista o no el reporte** (un `no_iniciado` es lo que Estadística vigila). Sobre
`{total, pagina, por_pagina, paginas, filas}`; 10 por página por omisión, 100 como máximo.
Filtros: `periodo` (un mes) o `desde`/`hasta` (no se combinan), `formato`, `estado`, `espera`
(`area`, `estadistica`, `nadie`). Cada fila trae `estado`, `espera`, `semaforo`
(`a_tiempo`, `fuera_de_plazo`, `pendiente`, `vencido`), `dias_de_retraso`, `fecha_limite`,
`folio_constancia`, `numero_rectificacion` y las fechas de envío y validación.

- **Nunca pasa del periodo vigente** (el mes cerrado): la vista de Alejandro trae los doce meses
  del año, y en septiembre octubre a diciembre saldrían «pendientes» de algo que aún no se reporta.
- **El semáforo se calcula en el backend**, con la fecha de envío en hora de Lima y el reloj
  inyectable; `v_cumplimiento` solo aporta las filas. La vista usa `current_date` del servidor de
  la base y `fecha_envio::DATE` en su huso: con la base en UTC, un envío de las 21:00 de Lima del
  último día lo marca tardío (una prueba lo demuestra). `dias_de_retraso` es `null` si no hay
  atraso, nunca 0.
- **`fecha_limite` ya no es la columna de la vista.** `v_cumplimiento.fecha_limite_entrega` sigue
  calculando con su propio día fijo (10, el mismo para toda área); el backend la ignora para esta
  respuesta y calcula el plazo real por área y por destino (`dominio/plazos.py`, sembrado por
  `app.herramientas.configurar_plazos` en `organizacion.parametro`, clave `plazo.{área}.{destino}`
  con un respaldo `plazo.default.{destino}`). **Quien consulte `v_cumplimiento` directamente, sin
  pasar por la API, va a ver un plazo distinto** (el día 10 genérico) del que devuelve
  `GET /api/reportes` para la misma fila. No es un error: son dos cosas que miden lo mismo con una
  fuente distinta, a propósito.
- **El plazo es un día de calendario.** Si el día cae sábado, domingo o feriado, no se corre solo
  al siguiente día hábil — vence ese día, caiga donde caiga. Queda pendiente confirmar con
  Estadística si debería correrse; mientras no se decida, el comportamiento es el más simple
  (el día exacto, sin ajuste).
- **Visibilidad.** Se ve lo que se tiene `reporte.ver` sobre esa unidad. Un reporte que **no ha
  salido del área** (`no_iniciado`, `borrador`) solo lo ve quien lo trabaja (`reporte.cargar` o
  `reporte.revisar` sobre la unidad): una consulta, aunque sea global, no ve borradores. Se filtra
  en SQL, así que el total y las páginas son los de lo visible. **El detalle
  (`GET /reportes/{formato}/{periodo}`) aplica la misma regla** y responde 403 al borrador de
  quien no lo trabaja.
- 403 sin `reporte.ver` en ninguna parte · 422 filtro mal escrito, rango al revés
  (`rango_de_periodos_invalido`) o mes exacto junto a rango (`filtros_incompatibles`).

**`GET /api/oficinas/{clave}/recibidos`** — lo que la oficina recibió, **un elemento por
reporte** aunque tenga varias remisiones, del periodo más reciente al más antiguo. Filtros:
`periodo` o `desde`/`hasta`, `formato`, `estado_de_recepcion`, paginación como arriba.

- Parte de las **remisiones**: un borrador no tiene ninguna, así que nunca aparece.
- **No expone el estado del reporte**, sino `estado_de_recepcion`: `validada` (hay una versión
  verificada vigente), `sin_validar` (solo entrega inmediata) o `desactualizada` (el reporte se
  reabrió para rectificar y lo recibido es de una versión anterior).
- Cada remisión trae **la constancia de su versión** (`CR-2026-08-NUT` o `…-2`), no la actual del
  reporte: la oficina no debe ver una constancia de un reenvío que todavía no le llegó.
- Permiso: `reporte.ver` **sobre esa oficina** (la propia, o global). 404 si la clave no es una
  oficina receptora del hospital (Estadística, DIRESA y las áreas que solo reportan no lo son);
  el 404 va antes que el 403. El digitador de Epidemiología (reporta y recibe) ve lo que recibe.

Las pruebas usan formatos **ficticios** para las otras áreas (`escenario.crear_formato`): en la
base instalada solo Nutrición tiene uno.

### Los valores

**`GET /api/reportes/{formato}/{periodo}/valores`** — las casillas del reporte
(`reporte.valor`), agrupadas por cuadro e indicador. Es lo que desbloquea la cifra de la
Bandeja y del Historial en el frontend; el consolidado de DIRESA y el boletín se apoyarán
en esto más adelante, pero no los calcula (son formato-específicos y este endpoint es
genérico). Misma visibilidad que la lista y el detalle: `reporte.ver` sobre la unidad, y un
reporte que no ha salido del área solo lo ve quien lo trabaja.

```
{ "formato": "NUT", "unidad": "nutricion", "periodo": "2026-08",
  "cuadros": [
    { "cuadro": "f3", "titulo": "Pacientes · Hospitalización",
      "indicadores": [
        { "indicador": "f3.liquida.cena", "nombre": "…", "unidad_medida": "raciones",
          "dimensiones": {"poblacion": "paciente", "servicio": "hospitalizacion", "tipo_dieta": "liquida", "comida": "cena"},
          "total": 310.0, "casillas_con_dato": 30, "casillas_esperadas": 31,
          "casillas": [{"dia": 1, "fecha": "2026-08-01", "valor": 10.0, "texto_original": null,
                        "origen": "archivo", "hoja_excel": "Hoja1", "celda_excel": "C24"}, …] } ] } ] }
```

- **Un indicador aparece aunque no tenga ninguna casilla**, con `total: null` (no cero) y
  `casillas: []`: la estructura activa del reporte no se rellena con ceros. Viene de
  `reporte.v_total_indicador` (total y completitud) y `formato.v_indicador_dimension`
  (dimensiones), nuevas vistas modeladas; `dia` es `null` cuando el formato es mensual.
- **El linaje** (`hoja_excel`/`celda_excel`) solo llega cuando `origen: "archivo"`; una
  corrección manual (`origen: "manual"`) los trae `null`. Sirve para auditoría: de qué hoja
  y celda del Excel del área se leyó cada cifra.
- Sin reporte, o sin una estructura activa todavía (un borrador sin carga), `cuadros: []`.
- 404 formato o periodo inexistentes · 403 sin `reporte.ver`, o el mismo 403 del detalle
  cuando el reporte no ha salido del área y quien consulta no lo trabaja.

**Probar el camino feliz.** Con la base tal como se instala, `enviar` siempre da 409: NUT-1
está en configuración, y sin una versión activa la BD rechaza toda carga aceptada. Las
pruebas montan dentro de su transacción el catálogo de EJEMPLO (`07`) y la configuración
ficticia que Alejandro escribe en `06` (`pruebas/escenario.py`); todo es ficticio.

**Concurrencia.** `prueba_concurrencia.py` usa dos conexiones reales: una retiene el bloqueo
de la fila y la otra debe quedarse esperando. Confirma datos de verdad, así que reinstala la
base de pruebas al terminar (unos segundos por prueba).

### Las alertas

**`GET /api/reportes/{formato}/{periodo}/alertas`** — hoy, solo **semana con datos
faltantes**: si una semana (lunes a domingo) ya cerrada del periodo vigente tiene días sin
ningún dato, mientras el área todavía lo está llenando. No se guarda nada: se calcula en
cada consulta (`dominio/alertas.py`, `servicios/alertas.py`), con el reloj inyectable y el
plazo real que ya resuelve `dominio/plazos.py`. Misma visibilidad que el detalle.

```
{ "formato": "NUT", "periodo": "2026-08",
  "alertas": [{ "clave": "semana_incompleta|3-9", "nivel": "aviso",
                "titulo": "Semana del 3 al 9: sin ningún dato en 7 días.",
                "cuerpo": "No hay ninguna casilla registrada el días 3, 4, 5, 6, 7, 8, 9 de este mes." }] }
```

- **No es «momento de enviar» (el plazo de entrega).** Esa alerta sigue en el frontend
  (`avisos.js`), que ya usa el plazo real de `GET /api/reportes` (ver «Las listas»); aquí solo
  vive lo que esa lista no puede dar, porque necesita las casillas día por día.
- **Vacío fuera del periodo vigente, si el reporte ya salió del área (`enviado` en
  adelante — el bot ya exigió todas las casillas al aceptar la carga; no puede haber hueco
  que señalar), o si el área no subió nada todavía ese mes.** Sin esta última regla,
  Nutrición (que entrega mensual, no a mitad de mes) recibiría la alerta *todos los días*
  hasta que suba algo, y nadie le haría caso.
- **Un día cuenta como faltante solo si NINGÚN indicador tiene dato ese día**, no si falta
  uno: hay grupos que legítimamente no existen algunos meses (internos que rotan,
  «PATRIMONIO» solo en abril). Exigir todos los indicadores haría salir incompleto
  cualquier mes real.
- **El umbral (cuántos días sin ningún dato hacen falta para alertar) es un parámetro**,
  no una constante: `organizacion.parametro`, clave `alerta.{área}.semana_incompleta_dias`
  con un respaldo `alerta.default.semana_incompleta_dias`, sembrado por
  `app.herramientas.configurar_alertas` — mismo patrón que los plazos.
  **Provisional, pendiente de confirmar con Giancarlo: 1 día.**
- **Pendiente, pedido por Giancarlo, no resuelto ahora:** alertas «a todos según el
  motivo» — más adelante, Estadística debería poder ver también si un área (cualquiera,
  no solo Nutrición) lleva semanas sin cargar, no solo la propia área en su panel. Hoy esta
  alerta solo llega a la vista propia del área real; las nueve simuladas y la vista agregada
  de Estadística siguen con `avisos.js` del frontend, sin cambio.

## Avisos

`GET /api/avisos` da el cajón de notificaciones de la sesión (forma y tipos en
[`docs/API_BACKEND.md`](../docs/API_BACKEND.md) § 7b). **No se guardan ni se encolan: se
derivan del estado** en cada petición (`dominio/avisos.py`, reglas puras;
`servicios/avisos.py`, que se apoya en la lista de reportes y en los recibidos y hereda su
visibilidad y su semáforo). Por eso no necesitan tabla ni cola, y el esquema de Alejandro
no cambia: un aviso dura exactamente lo que dura su condición, y nunca sobrevive al hecho
que lo provocó.

Lo único nuevo que se lee de la base es la fecha del último cambio de estado
(`reporte_historial_estado`, `datos/avisos.py`), para que cada aviso diga cuándo ocurrió.
El «leído» no lo guarda el backend: la interfaz compara `fecha` con la última vez que la
persona abrió el cajón.

## Estado y pendientes

`avance_04` es el esquema definitivo (Alejandro no lo avanzará más), así que lo que sigue
ya no son cambios que pedirle a él: son decisiones nuestras o limitaciones que se asumen.

- **Versiones inmutables.** El esquema reemplaza los valores al recargar y la
  bitácora de cargas guarda solo un resumen: la versión que recibió una oficina
  no se puede recuperar tras una rectificación. **Es una limitación asumida del
  esquema tal como quedó**, no algo pendiente de la BD: si hace falta conservar
  versiones anteriores, habría que guardarlas desde el backend (por ejemplo, una
  copia de `reporte.valor` al remitir), no esperar un cambio de Alejandro.
- **Carga del Excel: completa para Nutrición.** NUT-1 se activa con
  `python -m app.herramientas.cargar_catalogo_nutricion` (catálogo real: 4 cuadros, 36
  indicadores, tomados del oficio N.º 122-2026) y `POST .../cargas` ya valida contra el
  bot real y persiste el resultado (`app/servicios/cargas.py`, probado con el bot
  levantado como subproceso en `prueba_api_cargas.py`). **El bot no necesitó ningún
  cambio**: sigue leyendo por nombres definidos de su propia plantilla, que es
  justamente lo que describe la `configuracion` que arma `formato.v_configuracion_lectura`
  (confirmado desempaquetando la plantilla real, no solo leyendo su código). El motor
  de lectura genérico (por rango, celda o etiqueta, para el Excel propio de un área)
  queda para cuando un área suba el suyo, no para este primer flujo.
- **NUT-2: la lectura real, todavía sin activar.** `app.herramientas.configurar_nutricion_real`
  deja una segunda versión (NUT-2) con la estructura del Excel real de Nutrición (enero a
  setiembre de 2026), reutilizando los mismos 36 indicadores de NUT-1 — sigue en
  `en_configuracion` hasta que el bot sepa leerla por `configuracion` en vez de nombres
  definidos. **Supuesto pendiente de confirmar con el área:** de enero a abril el Excel real
  trae dos bloques casi iguales para «Internos de Enfermería» (`"INT ENF UNSM"` y
  `"INT. ENF UNSM"`, con y sin punto); esta versión cataloga solo la variante con punto, porque
  es la que sigue apareciendo de mayo en adelante. La otra, de enero a abril, queda sin
  catalogar a propósito — sale como el hallazgo `fila_no_catalogada` (pendiente del lector del
  bot), no se pierde en silencio y tampoco se fusiona con la otra sin que el área confirme si
  son el mismo grupo.
- **Limitación conocida: `version_indicador.ubicacion_total` no se llena.** La columna
  del total en la plantilla es `C + días_del_mes` (`AH` con 31 días, `AG` con 30, `AF`
  en febrero); el esquema modela esa ubicación como un valor fijo por indicador,
  válido para un solo mes. Si alguien la completa con el valor de un mes, **fallará
  en los meses con menos días**, sin que sea evidente por qué. Se resolvería si el
  esquema calculara la columna a partir del periodo, o si el lector la ignorara y la
  recalculara; ninguna de las dos existe hoy, así que se deja vacía a propósito.
- **Otras nueve áreas y digitación manual.** Fuera del alcance por ahora: solo
  Nutrición, cuando el bot esté listo.
- **Consolidados de DIRESA y el boletín (el siguiente paso).** El endpoint de valores da la
  casilla en bruto por reporte; falta lo formato-específico: los totales por dimensión que ya
  calculan `v_nutricion_mensual`, `v_nutricion_por_comida` y `v_nutricion_resumen_anual`, y el
  export para DIRESA. Se apoyan en `GET .../valores`, no lo reemplazan.
- **El historial no dice quién hizo cada paso.** `historial[]` no trae actor
  (queda en `auditoria.registro_cambio`, no en esta respuesta); el frontend ya
  oculta esa columna para un reporte real en vez de inventar un genérico. Unir
  ambas fuentes es un pendiente descubierto al conectar el frontend
  (`docs/API_BACKEND.md`).
- **Aviso de reapertura.** El backend ya lo da: `GET /api/avisos` trae un aviso
  `desactualizado` a cada oficina que recibió un periodo que luego se reabrió (además de
  `estado_de_recepcion = desactualizada` en los recibidos). Falta que el frontend lo muestre:
  hoy el cajón se sigue calculando en el navegador (`frontend/src/app/avisos.js`).
- **Acuse de lectura** (`remision.fecha_lectura`): excluido. Las listas no lo marcan ni lo leen.
- **Unificar la forma de los errores** (último paso): hoy los de los reportes son
  `{detail, codigo, datos}`, pero los 401, el 403 de la contraseña provisional y los de `/auth`
  son solo `{detail}`. Se hará aparte, con la actualización de `prueba_auth`.
- **Disparador que impida enviar sin carga aceptada:** no vendrá; era la segunda barrera que se le
  pidió a Alejandro. **El backend es la única barrera** (lo comprueba en `comprobar_se_puede_enviar`),
  así que esa comprobación queda como definitiva y no como algo provisional a reforzar después.
- **`organizacion.periodo.es_cerrado`** no lo usa ningún script de Alejandro: se ignora hasta saber qué significa.
- **Límite de intentos de inicio de sesión** (fuerza bruta): hoy no hay ninguno.
- **IP detrás de un proxy:** `bd_auditada` usa la IP del socket; con proxy inverso habría
  que leer `X-Forwarded-For`, pero solo cuando se sepa cómo se despliega.
