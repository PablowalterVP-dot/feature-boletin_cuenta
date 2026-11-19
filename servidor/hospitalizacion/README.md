# Hospitalización (Egresos Hospitalarios)

El seguimiento del paciente hospitalizado: orden de Admisión al área, designación de
habitación y cama por el área, traslados, soporte de O2 y VM, alta completa con
CIE-10, censo diario, RENOXI y mantenimiento de camas. Estadística lo mira: la gestión de
camas, el consolidado de censos y RENOXI
([decisión 0013](../../docs/hospitalizacion/decisiones/0013-estadistica-solo-visualiza.md)). Reemplaza el registro de ingresos que hoy no existe
y el de egresos de Aletheia.

Vive en el Sistema de Reporte Estadístico desde el 14/11/2026
([decisión 0011](../../docs/hospitalizacion/decisiones/0011-integracion-con-estadistica.md)):

| Parte | Dónde |
|---|---|
| Esta API (FastAPI, Alembic, Python 3.13) y su propia base PostgreSQL | `servidor/hospitalizacion/` |
| Las pantallas, dentro del shell de Estadística | `frontend/src/app/hospitalizacion/` |
| Las cuentas, sus roles y permisos `hospitalizacion.*` | La base de Estadística (seeder `servidor/api/bd/seeders/0009_hospitalizacion.sql`) |
| La documentación | `docs/hospitalizacion/` |

El plano del piso 2 ya viene cargado: **Medicina A (24 camas), Medicina B (24),
Medicina Intermedios (5), UCI (7) y Quemados (7, dos de ellas cunas)**. Cada cama
es libre, ocupada (con el paciente dibujado), con falla reportada o en
mantenimiento; el O2 o la VM van como marca.

## Arrancar en desarrollo

Necesita Docker, Python 3.13 y Node 20 o superior.

**La primera vez.** Copia `.env.example` como `servidor/hospitalizacion/.env` y
completa sus valores. `JWT_SECRETO` tiene que ser **el mismo** que el de
`servidor/api/.env`: el token lo firma la API de Estadística y esta lo lee.

```bash
cd servidor/hospitalizacion
docker compose -f docker-compose.dev.yml up -d --wait   # PostgreSQL 16 en el puerto 5544
py -3.13 -m venv .venv                                  # o: uv venv --python 3.13 --seed .venv
.venv/Scripts/pip install -r requirements.txt           # en Linux: .venv/bin/pip
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m semillas.iniciar_sin_datos --confirmar   # base vacía: sin pacientes ficticios
```

En la base de Estadística, las diez cuentas de prueba (una vez):

```bash
cd servidor && npm run migrate && npm run seed && npm run seed:hospitalizacion
```

Si no tienes otro PostgreSQL para Estadística, su base de desarrollo puede vivir en
el mismo contenedor: `CREATE DATABASE estadistica_dev` y, en `servidor/api/.env`,
`DATABASE_URL=postgresql://egresos_owner:<EGRESOS_OWNER_CLAVE>@127.0.0.1:5544/estadistica_dev`.

**Cada vez**, dos terminales:

```bash
cd servidor && npm run dev:hospitalizacion   # bot (:8787), API de Estadística (:8000) y la de hospitalización (:8010)
cd frontend && npm run dev                    # http://localhost:5173
```

`dev:hospitalizacion` revisa antes de arrancar que la base responda, que el `.env`
tenga `INGRESO=estadistica` y que `JWT_SECRETO` sea el mismo en las dos APIs, y dice
qué falta. Si cae uno de los tres, baja los otros: así la pantalla no queda diciendo
«Sin conexión con hospitalización» con el servidor apagado sin que se note.

El proxy de Vite manda `/api/hospitalizacion/` a `http://localhost:8010`
(`VITE_HOSPITALIZACION_URL` para cambiarlo). Con `INGRESO=estadistica` en el `.env`
se entra por el ingreso de Estadística y los módulos aparecen en el menú.

## Cuentas

Las diez de `npm run seed:hospitalizacion`, con clave `1234567890` (solo desarrollo):

| Usuario | Rol en Estadística | Qué hace |
|---|---|---|
| `admision` | `admision` | Envía al paciente a un área (Medicina A, B, Intermedios, UCI o Quemados) |
| `dep.medicina` | `jefe_departamento` en `medicina` | Supervisa las tres áreas de Medicina; no opera |
| `medicina.a` | `enfermeria` en `medicina-a` | Designa la cama de sus pacientes y los controla: O2, traslados, alta con CIE-10, mantenimiento, censo |
| `medicina.b` | `enfermeria` en `medicina-b` | Lo mismo en Medicina B |
| `medicina.int` | `enfermeria` en `medicina-intermedios` | Lo mismo en Intermedios |
| `uci` | `enfermeria` en `cuidados-criticos` | Lo mismo en UCI, con VM |
| `quemados` | `enfermeria` en `quemados` | Lo mismo en Quemados |
| `estadistica` | `revisor` (la cuenta oficial, sin rol aparte) | Su menú de siempre y, debajo, solo para mirar: gestión de camas, consolidado de censos y RENOXI |
| `control.camas` | `control_camas` (Responsable de RENOXI) | Control diario de camas: plano, RENOXI y tablero de ocupación |
| `mantenimiento` | `mantenimiento_camas` | Retira, repara y entrega camas |

En el servidor no se siembran: el superadministrador habilita el área o el departamento
en «Unidades de hospitalización» y luego crea la cuenta y le da su rol desde «Cuentas y
permisos» (la de enfermería, atada a su área; la jefatura, a su departamento). En la base
de Estadística esas unidades se llaman `hosp-area-<id>` y `hosp-dep-<id>`, para no
cruzarse con las suyas ([decisión 0012](../../docs/hospitalizacion/decisiones/0012-unidades-de-hospitalizacion.md)).

Qué ve cada rol lo deciden sus permisos (`MODULOS_POR_ROL` y `PRECEDENCIA` en
`frontend/src/app/hospitalizacion/datos/cuentas.js`, y `app/cuentas_estadistica.py`
aquí). La tabla `cuenta` de esta base es un espejo: se llena la primera vez que cada
cuenta entra, porque los movimientos, los censos y la bitácora la nombran.

## Recorrer el proceso con las cuentas

Con la base vacía (`iniciar_sin_datos`, más abajo) y una cuenta por pestaña privada o
por navegador, para tener varias sesiones a la vez:

1. **`admision`**: «Gestión de camas», nueva orden a Medicina B con los datos que escribas.
2. **`dep.medicina`**: ve la orden y la ocupación de sus tres áreas; no tiene botones
   para operar.
3. **`medicina.b`**: en «Por atender», designa habitación y cama. Prueba también el O2,
   un traslado a Intermedios (lo confirma **`medicina.int`**) y el alta con CIE-10 y
   médico.
4. **`medicina.b`**: reporta una cama con falla. **`mantenimiento`** la retira, anota la
   reparación y la entrega; **`medicina.b`** la recibe.
5. **`medicina.b`**: después de las 24:00, «Censo diario» cierra el censo del día (también
   pasadas las 08:00, aunque ese día ya no admita movimientos).
6. **`estadistica`**: solo mira. «Gestión de camas» con todas las áreas, «Consolidado de
   censos» del mes que elija y «RENOXI». En Monitoreo, ficha 23 o 24, y en «Remisión a
   DIRESA», pestaña «Datos de Estadística», aparecen las cifras de hospitalización al lado
   de las digitadas, rotuladas como parciales.
7. **`control.camas`**: plano de todas las áreas, descarga de RENOXI del día y «Marcar
   como cargado».

Lo mismo vale para Medicina A, UCI (con VM) y Quemados, cada una con su cuenta. Las
áreas sin plano (Psiquiatría, Infectología, Oncología y el resto) se pueden habilitar
en «Unidades de hospitalización», pero no tienen camas que operar hasta que se dibuje
el suyo.

## Probar la API sola

Con `INGRESO=propio`, la API tiene su ingreso (Argon2id y JWT, las mismas rutas que
Estadística: `/api/auth/login`, `/auth/yo`, `/auth/cambiar-clave`) y las cuentas de
`datos/cuentas.js` entran con `CLAVE_INICIAL_CUENTAS`. TI fija la clave de una cuenta
así (la pide dos veces y no la muestra):

```bash
.venv/Scripts/python -m semillas.asignar_clave medicina.b               # provisional
.venv/Scripts/python -m semillas.asignar_clave medicina.b --definitiva
```

No hay modo de demostración: el sistema usa siempre la hora real y no trae pacientes
ficticios (los de las pruebas automáticas viven en `pruebas/historia_ficticia.py` y no se
cargan en una base de trabajo).

### Empezar sin datos

Borra **todos** los datos (pacientes, órdenes, censos, egresos, mantenimiento y
bitácora) y deja solo el plano, las cuentas y los catálogos. Sin `--confirmar` solo
muestra qué haría:

```bash
.venv/Scripts/python -m semillas.iniciar_sin_datos --confirmar --arranque AAAA-MM-DD
```

El día de arranque, cada piso registra con «Censo inicial» a los pacientes que ya
estaban hospitalizados.

## Pruebas

```bash
cd servidor/hospitalizacion && .venv/Scripts/python -m pytest pruebas   # sobre PostgreSQL 16, en una base aparte
cd frontend && npm run humo                                               # secciones 28 a 33: hospitalización
```

## En el servidor

Servicios `hospitalizacion` y `hospitalizacion-db` de `docker-compose.yml`, que se levantan con
el resto (decisión 0014):
[`docs/DESPLIEGUE.md`](../../docs/DESPLIEGUE.md) § «Hospitalización».

El modelo de datos y sus reglas están en
[`docs/hospitalizacion/tareas/base-de-datos-postgresql.md`](../../docs/hospitalizacion/tareas/base-de-datos-postgresql.md).
Nada con datos de pacientes en el repositorio ni en la documentación.
