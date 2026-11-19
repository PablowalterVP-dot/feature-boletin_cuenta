# 0011: Integración con el sistema de Estadística

- **Estado:** Adoptada hasta la fase 3 (14/11/2026, rama `feat/egresos-hospitalarios` de
  Estadistica_hrl). Fase 4 adoptada con cobertura parcial (15/11/2026, rama
  `feat/hospitalizacion-conexion`). El despliegue en un perfil apagado lo cambia
  [0014](0014-hospitalizacion-siempre-en-docker.md): se levanta con el resto.
- **Fecha:** 2026-11-14
- **Afecta a:** [0006](0006-credencial-por-area.md) (cuentas locales del sistema) y a
  la arquitectura de despliegue

## Contexto

Este sistema se prueba hoy en un solo equipo. Para pasar a pruebas con otras personas
tiene que vivir en un servidor, y el lugar natural es el repositorio y el despliegue del
Sistema de Reporte Estadístico (`DevHRL/Estadistica_hrl`), que ya está en el servidor
del hospital y que usa la Oficina de Estadística.

Los dos sistemas comparten el frontend: React 19, Vite 8, JavaScript, oxlint y el mismo
tag del kit (`@hrl/core-ui` v1.11.0-redesign.3). Se diferenciaban en el resto:

| | Egresos (antes) | Estadística | Ahora |
|---|---|---|---|
| Python | 3.12 | 3.13 | **3.13** |
| Contraseñas | scrypt | Argon2id | **Argon2id** (las scrypt pasan solas al entrar) |
| Sesión | Token propio con HMAC | JWT HS256 | **JWT HS256**, con `aud` propio |
| Ingreso | `POST /api/sesion` | `POST /api/auth/login`, `/auth/yo`, `/auth/cambiar-clave` | **Las mismas rutas y la misma respuesta** |
| Clave provisional | No existía | Cambio obligatorio al entrar | **Igual** |
| Intentos fallidos | Sin freno | Cinco en 15 minutos | **Igual** |
| Pruebas del frontend | `node --test` del dominio | `npm run humo` (SSR de Vite) | **`npm run humo`**, que corre también las del dominio |
| Migraciones | Alembic | Gestor SQL propio (`bd/migraciones`) | Sin cambio (ver fase 1) |
| Base | `public`, roles `egresos_*` | Esquemas `seguridad`, `organizacion`… | Sin cambio: **base aparte** |

## Decisión

Integrar en cuatro fases. Cada una deja un sistema que funciona y se puede probar; la
siguiente solo empieza cuando la anterior está en uso.

El destino final es **una sola aplicación con un solo ingreso**. Estadística entra y ve
su menú de siempre y, **debajo**, los módulos de hospitalización. Las cuentas de los
pisos (enfermería, Admisión, Mantenimiento, control de camas) entran al mismo sistema y
ven solo los suyos.

**La base sigue aparte en todas las fases.** Hospitalización guarda datos personales y
de salud de cada paciente, y Estadística guarda cifras mensuales. Juntarlas no aporta
nada que no dé una lectura entre las dos APIs, y mezclaría respaldos, permisos de la
base y migraciones de dos equipos.

### Fase 0: hablar el mismo idioma (hecha el 2026-11-14)

- Python 3.13 en el backend.
- Ingreso igual al de Estadística (`backend/app/seguridad.py`, `autenticacion.py`,
  `claves.py` y la migración `0004`). El token lleva `aud: egresos-hospitalarios`: un
  token de Estadística no abre este sistema ni al revés, aunque algún día se firmen con el
  mismo secreto, hasta que la fase 3 lo decida a propósito.
- La auditoría de `cuenta` ya no guarda el hash de la clave (antes lo copiaba en cada
  cambio de la fila); se limpió lo que había.
- `npm run humo` con la forma de la de Estadística: 8 secciones, 488 comprobaciones,
  cada pantalla renderizada con cada cuenta, con la demostración y con la base vacía.
- `paneles/indice.js`: el mapa de pantallas sale de `App.jsx`, para que la prueba (y
  luego el menú de Estadística) recorra las mismas que la aplicación.
- La tienda (`datos/tienda.js`) se puede renderizar fuera del navegador
  (`getServerSnapshot`), requisito para montarla dentro de otra aplicación.
- Lint sin avisos.

### Fase 1: sistema hermano, en el servidor (pruebas aisladas)

Lo mínimo para dejar de trabajar en local. Dos sistemas en el mismo repositorio y el
mismo servidor, cada uno con su ingreso.

1. **Repositorio.** Traer este proyecto con su historial a una carpeta propia de
   Estadistica_hrl, en una rama y por PR:
   `git subtree add --prefix=hospitalizacion <este-repo> main`. Lleva su `CLAUDE.md`
   (Claude Code lo carga por carpeta) y una línea en el `CLAUDE.md` raíz que diga que sus
   reglas (humo de las nueve áreas, `CREDENCIALES.txt`, los cuatro roles) no se aplican a
   esa carpeta. Este repositorio se archiva con un enlace al nuevo.
2. **Contenedores.** `backend/app/config.py` lee el host de la base del ambiente (hoy
   está fijo en `127.0.0.1`). Un Dockerfile para la API, que al arrancar corre
   `alembic upgrade head` y `cargar_maestros`, y otro para el frontend con su nginx,
   copiando los de Estadística.
3. **Compose.** Los dos servicios en `docker-compose.yml` con `profiles: [hospitalizacion]`:
   el despliegue de Estadística no cambia si nadie activa el perfil.
4. **Base.** Una base `egresos` en el mismo PostgreSQL del servidor, con
   `ALTER DATABASE egresos SET timezone = 'America/Lima'`, las extensiones `btree_gist` y
   `pg_trgm` (vienen en `postgresql-contrib`) y los roles `egresos_owner`, `egresos_app`,
   `egresos_lectura` y `egresos_respaldo`, creados por quien administra la base. Entra en
   la misma rutina de respaldo que la de Estadística.
5. **Entrada.** Otro puerto o un subdominio (`hospitalizacion.<servidor>`). Montarlo en
   una ruta (`/hospitalizacion/`) choca con el `/` y el `/api` de Estadística y no vale el
   trabajo, porque en la fase 2 el frontend se funde.
6. **Ambiente.** `APP_ENV=produccion` si se prueba con pacientes reales (con HTTPS y
   respaldo diario: Ley 29733). `desarrollo` solo con la demostración: permite entrar
   como cualquier cuenta sin clave.

### Fase 2: un solo frontend, con el menú de Estadística arriba

Los módulos de hospitalización pasan al frontend de Estadística. El ingreso todavía es
doble por dentro: la pantalla de hospitalización habla con su API con su propio token
(fase 3 lo resuelve).

**El menú.** Estadística ya tiene el mecanismo: `navegacion.js` agrega al final del menú
de Estadística y de Administración el grupo «Indicadores de desempeño» solo si el token
trae el permiso (`NAVEGACION_DESEMPENO`, filtrado en `navDe`). Hospitalización entra
igual, con `NAVEGACION_HOSPITALIZACION` y un permiso por entrada:

```
Estadística (menú de siempre)          Enfermería Medicina B
─────────────────────────────          ─────────────────────
CONTROL                                HOSPITALIZACIÓN
  Monitoreo Indicadores                  Gestión de camas
  Cumplimiento                           Movimientos del día
  Bandeja de reportes                    Censo diario
SALIDAS                                  Buscar paciente
  Remisión a DIRESA
  Boletín
CONSULTA
  Consolidados anuales
  …
HOSPITALIZACIÓN                ← nuevo, debajo
  Gestión de camas
  Censo diario
  Recepción de censos
  Validación de altas
  Buscar paciente
REPORTES DE HOSPITALIZACIÓN    ← nuevo
  Consolidado
  RENOXI
  Indicadores DIRESA
```

- Los grupos se renombran para no chocar: el grupo «Estadística» de este sistema no
  tiene sentido dentro de Estadística, y su regla prohíbe grupos de una sola entrada.
- Los `id` de pantalla llevan prefijo (`hosp-mapa`, `hosp-censo`…), porque la pantalla
  activa de Estadística vive en el hash de la URL (`#/hosp-mapa`) y comparte espacio de
  nombres con las suyas.
- Cada pantalla se carga con `lazy`, como todas las de Estadística: el plano 3D no pesa
  en el ingreso de quien no lo usa.

**El código.** `src/app/` de este sistema pasa a `frontend/src/app/hospitalizacion/`
(`dominio/`, `datos/`, `paneles/`), y `datos/tienda.js` pasa a
`servicios/hospitalizacion.js`, que es donde Estadística pone los clientes de lo que
está fuera del frontend. La API queda detrás del nginx de Estadística en
`/api/hospitalizacion/` (la API toma el prefijo de una variable), antes del `/api/` de
Estadística.

**Lo que hay que adaptar a su contrato** (su `CLAUDE.md`):

| Su regla | Hoy en hospitalización | Trabajo |
|---|---|---|
| Cada panel es un `Mosaic` | `div.panel` con `Stack` | Mecánico, pantalla por pantalla |
| La pantalla activa vive en el hash (`irA`) | Estado de React | Pasar a `irA`/`ruta.js` |
| Tooltip en todo KPI, botón e icono | Parcial | Revisar cada pantalla |
| El aviso de Dr. Mochi en la cabecera | No existe | Decidir qué estados de hospitalización apremian |
| Prueba de humo única | `npm run humo` propio, con la misma forma | Sus 8 secciones entran como secciones de la suya |

Las reglas propias de este sistema (animaciones de `docs/diseno/animaciones.md`, el plano
3D, `aplicar(plano, accion)`) viajan en el `CLAUDE.md` de la carpeta.

### Fase 3: un solo ingreso

1. **Cuentas en la base de Estadística.** Las unidades de los pisos (Medicina A,
   Medicina B, Intermedios, UCI, Quemados, Admisión) y la de Mantenimiento, que
   Estadística retiró con su seeder `0004` porque no reporta. Una cuenta de piso no
   reporta (`es_reportante = false`).
2. **Permisos.** `hospitalizacion.ver`, `.operar` (enfermería del área), `.admision`,
   `.validar` (Estadística), `.mantenimiento`, `.camas` y `.supervisar` (departamento),
   en `seguridad.permiso`. Viajan en el token, como los suyos, y deciden el menú.
3. **Un token para los dos.** El token de Estadística se emite con
   `aud: ["estadistica", "egresos-hospitalarios"]` y el mismo `JWT_SECRETO` en las dos
   APIs. La API de hospitalización deja de emitir tokens (`/api/auth/login` se apaga con
   una variable) y traduce los permisos del token a sus roles. La tabla `cuenta` sigue
   existiendo como espejo: los movimientos, censos y la bitácora la nombran, y se llena
   la primera vez que una cuenta entra.
4. **La cuenta `estadistica` de este sistema desaparece**: sus permisos los recibe la
   cuenta real de Estadística.

### Fase 4: las cifras de hospitalización llegan a Monitoreo

Hoy Estadística digita a mano «camas» y «egresos» en Monitoreo
(`PUT /monitoreo/{anio}/datos`). Al cerrar el mes, hospitalización ya tiene esas cifras
calculadas desde los movimientos (`indicador_mes_cerrado`). La API de hospitalización
expone el mes cerrado en solo lectura y Monitoreo lo muestra como su fuente, con su
regla de siempre: la cifra oficial no se pisa a mano y la del hospital se pone al lado.
La dotación también: el conteo físico (260 camas) frente a la relación oficial (249).

## Cómo quedó (14/11/2026)

Las fases 1 a 3 se hicieron juntas, en un solo PR a Estadistica_hrl, y por eso la fase 1
no pasó por un puerto aparte: el frontend se fundió de una vez.

- **Dónde.** `servidor/hospitalizacion/` (la API, con su historial traído con
  `git subtree`), `frontend/src/app/hospitalizacion/` (las pantallas),
  `frontend/src/app/servicios/hospitalizacion.js` (el cliente),
  `frontend/pruebas/hospitalizacion/` y `docs/hospitalizacion/`.
- **Despliegue.** Servicio `hospitalizacion` en el perfil del mismo nombre, base `egresos`
  en el PostgreSQL del servidor, nginx con `/api/hospitalizacion/` resuelto en cada
  pedido para que arranque aunque el servicio no exista. Probado: la imagen construye,
  migra, carga los maestros y responde con un token de Estadística.
- **Menú.** `navegacionDeHospitalizacion` en `navegacion.js`, por permisos, debajo del
  menú de Estadística. Solo con servidor; el superadministrador no lo ve. Los grupos son
  «Hospitalización» y «Reportes de hospitalización», que se funden cuando uno quedaría
  con una sola entrada (regla de su menú).
- **Ingreso único.** El token de Estadística lleva `aud: ["estadistica",
  "egresos-hospitalarios"]`; uno sin `aud` (emitido antes del despliegue) se sigue
  aceptando hasta que venza. La API de hospitalización lo lee con
  `INGRESO=estadistica` y traduce sus permisos con la misma precedencia que el
  frontend; la prueba de humo compara las dos y el seeder.

Lo que estaba por decidir, y cómo se resolvió:

| Pregunta | Resuelto así |
|---|---|
| ¿Un quinto tipo de usuario para las cuentas de piso? | Sí, `hospitalizacion`, solo para cuentas sin otro tipo. Su equipo lo revisa en el PR |
| ¿Mantenimiento vuelve como unidad? | No: su rol, `mantenimiento_camas`, es global. La unidad MTO sigue retirada |
| ¿Cómo llega Estadística a sus módulos? | Primero con un rol aparte, `validador_hospitalizacion`. **El 15/11/2026 se retiró**: la cuenta oficial de Estadística no debe tener un segundo rol para lo mismo. Su rol de siempre, `revisor`, trae `hospitalizacion.ver` y `.validar` (seeder `0011`), y el menú solo muestra hospitalización si su API responde |
| ¿El superadministrador? | Recibe los permisos, como todos, pero su menú no muestra hospitalización |

Lo que no se hizo:

- Los contadores del menú de antes (órdenes esperando cama, traslados por recibir): el
  menú de Estadística no los lleva. Lo pendiente sigue en «Por atender», en el plano.
- El aviso de Dr. Mochi y la revisión de tooltips pantalla por pantalla.

## Cómo quedó la fase 4 (15/11/2026)

Monitoreo **lee** las cifras de la API de hospitalización; no se copian a
`desempeno.dato_mes`. Como hoy solo tienen plano Medicina A, B e Intermedios, UCI y
Quemados (67 de las 260 camas contadas), las cifras van **al lado** de las que digita
Estadística y nunca en su lugar:

- `GET /api/hospitalizacion/cifras/{anio}` (`servidor/hospitalizacion/app/cifras.py`):
  por mes, camas, pacientes-día, días de estancia, días-cama, egresos y defunciones de
  más de 48 horas, con las claves de `datos/estadistica-propios.js`. Un mes cerrado sale
  de la foto de su cierre; el mes en curso, hasta el último censo cerrado. Lleva su
  cobertura: qué áreas, cuántas camas y cuántas tiene el hospital (relación oficial y
  conteo físico). Solo cifras agregadas, y solo para quien valida (Estadística).
- **Remisión a DIRESA, «Datos de Estadística»**: debajo de cada dato de
  hospitalización, la cifra del sistema rotulada como parcial y un aviso con la
  cobertura. Lo que se remite sigue siendo lo digitado.
- **Monitoreo, detalle de las fichas 23 y 24**: una tarjeta «Sistema de
  hospitalización» con su mes a mes y la misma fórmula que la lectura propia. No entra
  en el gráfico ni en la comparación con la cifra oficial.
- Cuando todas las áreas tengan plano (`esCoberturaCompleta`), el rótulo de parcial y
  el aviso desaparecen solos. Reemplazar lo digitado por estas cifras será otra
  decisión.

## Consecuencias

- La fase 1 no toca nada de Estadística salvo dos archivos (`docker-compose.yml`, con un
  perfil apagado, y una línea de su `CLAUDE.md`). Se puede retirar sin dejar rastro.
- Las fases 2 y 3 cambian el código de Estadística: su menú, su nginx, su base de
  cuentas y sus permisos. Las revisa y las acepta su equipo.
- Hasta la fase 3 hay dos cuentas `estadistica` con claves distintas, una en cada
  sistema.
- Mientras dure la fase 1, el ingreso de los dos sistemas se parece pero no se
  comparte: una mejora de seguridad en uno se copia al otro a mano.

## Pendiente de decidir

| Pregunta | Quién | Bloquea |
|---|---|---|
| Revisar y aceptar el PR: el quinto tipo de usuario, el token con dos destinatarios y la corrección del seeder 0008 | Equipo de Estadística | Fase 3 en el servidor |
| ¿Las pruebas son con pacientes ficticios o reales? (HTTPS y respaldo desde el primer día) | Usuario | Pacientes reales |
| ¿Cuándo dejan las cifras de hospitalización de ser solo una comparación y reemplazan lo que digita Estadística? | Estadística | Que todas las áreas tengan plano |
