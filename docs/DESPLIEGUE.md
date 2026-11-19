# Despliegue en el servidor

`docker-compose.yml`, en la raíz, levanta las cinco piezas del sistema. La base de
Estadística **no** va en Docker: es un PostgreSQL aparte que provee el servidor. La de
hospitalización sí (§ 5).

```
                 servidor
 navegador ──▶ :80 ┌──────────────┐  /api   ┌─────┐  HTTP  ┌─────┐
                   │   frontend   │ ──────▶ │ api │ ─────▶ │ bot │
                   │ nginx + Vite │         └──┬──┘        └─────┘
                   └──────┬───────┘            │ DATABASE_URL
                          │                    ▼
                          │          PostgreSQL (fuera de Docker)
                          │ /api/hospitalizacion
                          ▼
                 ┌─────────────────┐       ┌────────────────────┐
                 │ hospitalizacion │ ────▶ │ hospitalizacion-db │
                 └─────────────────┘       └────────────────────┘
```

- **frontend**: la compilación de Vite servida por nginx. Es el único servicio que
  publica un puerto, y reenvía `/api` a la API por la red interna.
- **api**: FastAPI. Guarda los Excel subidos en el volumen `cargas`.
- **bot**: el bot validador. Solo lo llama la API.
- **hospitalizacion**: la API de Egresos Hospitalarios (FastAPI). Lee el token que firma
  la API.
- **hospitalizacion-db**: su PostgreSQL 16, con los datos en el volumen `egresos_datos`.
  Al arrancar genera las claves de esa base si faltan (volumen `egresos_claves`).

La API, el bot y hospitalización no se exponen fuera del servidor, y tampoco la documentación
interactiva de la API (`/docs`).

## Requisitos

- Docker Engine 24 o superior, con el plugin `docker compose`.
- `git`, para traer el repositorio.
- Un PostgreSQL al que el servidor llegue, con `psql` para instalar el esquema.

## 1. Preparar la base de datos

Una sola vez, en el PostgreSQL del servidor.

**Usuario y base:**

```bash
sudo -u postgres psql -c "CREATE ROLE hrl LOGIN PASSWORD 'una-clave-larga'"
sudo -u postgres createdb -O hrl estadistica_hrl
```

**El esquema no se instala a mano.** Al arrancar, el contenedor de la API corre
`python -m app.herramientas.bd migrate` y `seed` (`bd/migraciones/` y
`bd/seeders/`, ver `servidor/api/bd/README.md`): en una base vacía lo instala
todo; en una base que ya existía antes del gestor, reconoce lo que ya tiene, lo
registra con lote 0 y solo aplica lo que falta. Se comprueba con:

```bash
docker compose exec api python -m app.herramientas.bd status
```

El seeder opcional de cuentas (`seed:usuarios`, clave `1234567890`) es **solo
para desarrollo**: no se corre en el servidor.

**Que los contenedores lleguen a la base.** Esto solo hace falta si PostgreSQL
corre en el mismo servidor, fuera de Docker. Dentro de un contenedor, `localhost`
es el propio contenedor: por eso `DATABASE_URL` usa `host.docker.internal`, que
apunta al servidor. Las conexiones llegan desde la red de Docker
(172.16.0.0/12), así que PostgreSQL tiene que:

- escuchar en esa interfaz. En `postgresql.conf`:
  `listen_addresses = 'localhost,172.17.0.1'` (o `'*'` si el firewall ya
  cierra el puerto 5432 hacia fuera);
- aceptar esa red. En `pg_hba.conf`:
  `host  estadistica_hrl  hrl  172.16.0.0/12  scram-sha-256`.

Luego reinicia PostgreSQL (`sudo systemctl restart postgresql`).

Si la base está en otra máquina, en `DATABASE_URL` va su nombre o su IP, y esa
máquina debe aceptar conexiones desde este servidor.

## 2. Configurar

```bash
git clone https://github.com/DevHRL/Estadistica_hrl.git
cd Estadistica_hrl
cp .env.example .env
```

En `.env`:

| Variable | Qué poner |
|---|---|
| `DATABASE_URL` | `postgresql://hrl:una-clave-larga@host.docker.internal:5432/estadistica_hrl` |
| `JWT_SECRETO` | El resultado de `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`. Distinto del de desarrollo |
| `PUERTO_WEB` | El puerto en el que se publica el sistema (80 por omisión) |

Si la clave de la base tiene `@ : / # %`, escríbelos codificados en la URL
(`%40 %3A %2F %23 %25`).

## 3. Levantar

```bash
docker compose up -d --build
docker compose ps          # los cinco deben quedar «healthy»
```

La primera construcción tarda unos minutos. El sistema queda en
`http://IP-del-servidor` (o en `:PUERTO_WEB`).

## 4. Primeras cuentas y formato de Nutrición

**La API prepara la base sola al arrancar**, antes de uvicorn. Las migraciones y
los seeders dejan a Gineco-Obstetricia, Laboratorio, Lavandería y Nefrología con
su formato activo (`bd/seeders/0007_formatos_de_las_nueve_areas.py`).
`app/herramientas/preparar_base.py` activa NUT-2 y retira NUT-1, siembra plazos y
alertas, activa los formatos de Centro Quirúrgico, Farmacia, Epidemiología e
Imágenes si faltan y retira Mantenimiento si sigue activo
(`bd/seeders/0004_retirar_mantenimiento.sql`). Con `--historico`, además carga
los meses de `servidor/api/historico/`. Todo es idempotente, así que corre en
cada arranque y redeploy sin duplicar nada; un mes con reporte (incluso
eliminado) no se toca. Su resultado sale en los logs de la API con los prefijos
`[bd]` y `[preparar_base]`. `PREPARAR_BASE=no` en el entorno lo salta.

Para comprobar el resultado, «Resumen» del superadministrador debe decir «9 de 9»
en las áreas que reportan por el sistema, o:

```bash
docker compose exec api python -m app.herramientas.bd status   # 0007_… Ejecutado
```

Los comandos de abajo siguen sirviendo para hacerlo a mano o para lo que no
automatiza (contraseñas y cuentas). Una sola vez, con los contenedores arriba:

```bash
# El superadmin sembrado no tiene contraseña: asígnale una (la pide dos veces).
docker compose exec api python -m app.herramientas.asignar_clave superadmin

# Activa el formato de Nutrición (catálogo de ejemplo). Sin esto, enviar siempre da 409.
docker compose exec api python -m app.herramientas.cargar_catalogo_nutricion

# La estructura real del Excel de Nutrición (NUT-2) y los plazos y el umbral
# de alertas reales, en organizacion.parametro. Idempotentes: no pasa nada si
# se corren de nuevo.
# Con --activar, NUT-2 (el Excel real, más Patrimonio) queda activa y NUT-1
# retirada. Si NUT-2 ya existía sin Patrimonio, agregue --recargar.
docker compose exec api python -m app.herramientas.configurar_nutricion_real --recargar --activar
docker compose exec api python -m app.herramientas.configurar_plazos
docker compose exec api python -m app.herramientas.configurar_alertas

# Una cuenta de digitador para Nutrición.
docker compose exec api python -m app.herramientas.crear_usuario dig.nut \
  --nombres Ana --apellidos Perez --rol digitador --unidad nutricion
docker compose exec api python -m app.herramientas.asignar_clave dig.nut --definitiva

# Módulo de indicadores de desempeño (esquemas fuente y desempeno, catálogos y permisos).
# Idempotente: solo crea los objetos de BD, sin insertar pacientes ni requerir archivos.
docker compose exec api python -m app.herramientas.instalar_desempeno
# O entrando directamente al contenedor de la API:
# docker compose exec -it api sh
# python -m app.herramientas.instalar_desempeno
```

Los meses que Nutrición ya entregó en papel se cargan desde sus Excel
originales, por el mismo camino que una carga real (bot, enviar, validar,
remitir), marcados como carga histórica. La carpeta tiene que estar al alcance
del contenedor:

```bash
docker compose exec api python -m app.herramientas.cargar_historico /ruta/a/ESTADISTICA_POR_MES_NUTRICION_2026 \
  --hasta 2026-06 --corregir "2026-02|PACIENTES HOSP|N16=18"

# Un reporte cargado con cifras incorrectas (agosto de 2026) se elimina así;
# borrado lógico, con su motivo en la bitácora, y el mes queda libre:
docker compose exec api python -m app.herramientas.eliminar_reporte NUT 2026-08 --motivo "Las cifras cargadas eran incorrectas"
```

Sin `--definitiva`, la cuenta tiene que cambiar su contraseña en el primer
ingreso. Detalle de estas herramientas: [`servidor/api/README.md`](../servidor/api/README.md).

**Qué es real y qué no.** Con la API activa, el ingreso se comprueba contra la
base: las cuentas de `CREDENCIALES.txt` no sirven. Con la API activa nada se
simula: un área con formato activo guarda en la base, y un área sin él o pausada
no puede subir nada, para que no crea haber entregado algo que no se guardó
(03/11/2026).

## 5. Hospitalización

Egresos Hospitalarios (`servidor/hospitalizacion/`, decisiones 0011 y 0014 en
`docs/hospitalizacion/decisiones/`) **se levanta con el resto**: el servicio
`hospitalizacion` y su base, `hospitalizacion-db`. Sus pacientes van en una base
**aparte** de la de Estadística, en el volumen `egresos_datos`. Las cuentas, en cambio,
son las de Estadística: entran con su ingreso. Sin este servicio, sus pantallas dicen
«Sin conexión con hospitalización» y el resto sigue igual.

**Son datos personales y de salud (Ley 29733).** Con pacientes reales: HTTPS (§ HTTPS)
y la base en la rutina de respaldo diario.

**1. Configurar: nada.** Usa el mismo `JWT_SECRETO` de la API (el token que firma ella
lo lee hospitalización). Las cuatro claves de su base (la dueña y los roles
`egresos_app`, `egresos_lectura` y `egresos_respaldo`) las genera
`hospitalizacion-db` la primera vez y las guarda en el volumen `egresos_claves`;
nadie las escribe ni las necesita conocer. Para verlas:
`docker compose exec hospitalizacion cat /claves/owner`.

**2. Levantar.** `docker compose up -d --build`. Se generan las claves si faltan, la
base arranca y, cuando responde, el contenedor `hospitalizacion` aplica sus migraciones
(`alembic upgrade head`) y pone al día el plano y los catálogos; no toca pacientes,
censos ni egresos. Los logs: `docker compose logs -f hospitalizacion`. Para comprobarlo:

```bash
docker compose ps                      # hospitalizacion y hospitalizacion-db: healthy
curl http://localhost/api/hospitalizacion/salud
```

**En Coolify.** El recurso de Estadística (Docker Compose desde este repositorio) toma
los dos servicios nuevos al volver a desplegar; si no aparecen, «Reload Compose File».
En «Environment Variables» aparecen `EGRESOS_DB_HOST`, `EGRESOS_DB_PUERTO` y
`EGRESOS_DB` ya llenas, y las cuatro `EGRESOS_*_CLAVE` vacías: se dejan así. Dominio,
solo el del `frontend`: `hospitalizacion` y `hospitalizacion-db` no llevan ninguno. Para
comprobar, `https://<dominio>/api/hospitalizacion/salud` responde
`{"ok":true,"ingreso":"estadistica"}`. Al borrar el recurso, nunca se marca «Delete
volumes».

**3. Otra base (opcional).** Para usar el PostgreSQL del servidor en vez del
contenedor, en `.env` se escriben `EGRESOS_DB_HOST=host.docker.internal`,
`EGRESOS_DB_PUERTO=5432` y las cuatro claves `EGRESOS_*`, y la base se crea una sola vez con una dueña que pueda crear
los otros tres roles, con la zona horaria de Lima:

```bash
sudo -u postgres psql -c "CREATE ROLE egresos_owner LOGIN CREATEROLE PASSWORD 'otra-clave-larga'"
sudo -u postgres createdb -O egresos_owner egresos
sudo -u postgres psql -c "ALTER DATABASE egresos SET timezone = 'America/Lima'"
```

Usa las extensiones `btree_gist` y `pg_trgm`, que vienen en `postgresql-contrib`. En
`pg_hba.conf`, la misma línea que para la API:
`host  egresos  all  172.16.0.0/12  scram-sha-256`.

**4. Cuentas.** Los seeders `0009` y `0010` de la API ya dejaron los roles, los permisos
y las unidades de Medicina, UCI y Quemados. El superadministrador:

- habilita en «Unidades de hospitalización» los demás departamentos y áreas que vayan
  a entrar (decisión 0012 de `docs/hospitalizacion/decisiones/`);
- crea en «Cuentas y permisos» una cuenta por área con el rol `enfermeria` atado a su
  área, y las de `admision`, `control_camas` (Responsable de RENOXI),
  `mantenimiento_camas` y `jefe_departamento` (atada a su departamento);
- **a la cuenta de Estadística no le suma nada**: su rol `revisor` ya trae los permisos
  de hospitalización (seeder `0011`). En cuanto el servicio responde, sus módulos de
  lectura (gestión de camas, consolidado de censos y RENOXI) aparecen debajo de su menú
  y, en Monitoreo (fichas 23 y 24) y en la remisión a
  DIRESA, ve las cifras de hospitalización al lado de las que digita. Si el servicio
  no responde, no ve nada de eso.

O por consola: `docker compose exec api python -m app.herramientas.crear_usuario
medicina.b --nombres Enfermería --apellidos "Medicina B" --rol enfermeria --unidad
hosp-area-medicina-b`.

**5. Arrancar sin datos.** La primera migración no carga pacientes. El día de arranque
de cada área, su enfermería registra con «Censo inicial» a los que ya estaban
hospitalizados.

**Respaldo:** junto con el de `estadistica_hrl`, el de la base de hospitalización. No
guarda archivos fuera de la base:

```bash
docker compose exec -T hospitalizacion-db pg_dump -U egresos_owner -Fc egresos > egresos-$(date +%F).dump
```

**Nunca `docker compose down -v`** en el servidor: borra `egresos_datos` con los
pacientes, igual que borra `cargas`. Tampoco se borra solo `egresos_claves`: las
claves nuevas no abrirían la base ya creada.

## Operación

```bash
docker compose logs -f api            # logs de un servicio (api, bot, frontend, hospitalizacion)
docker compose restart api            # reiniciar uno
docker compose down                   # detener todo (los volúmenes cargas, egresos_datos y egresos_claves quedan)
```

**Actualizar a una versión nueva:**

```bash
git pull
docker compose up -d --build
```

Si la versión nueva trae un cambio del esquema, se instala en la base antes de
levantar.

**Respaldo.** Hay tres cosas que respaldar: la base (`pg_dump`), el volumen de
los Excel subidos y la base de hospitalización (§ 5):

```bash
docker run --rm -v estadistica-hrl_cargas:/datos -v "$PWD":/respaldo alpine \
  tar czf /respaldo/cargas-$(date +%F).tar.gz -C /datos .
```

`docker compose down -v` **borra** ese volumen.

## HTTPS

El nginx del contenedor sirve HTTP. Para HTTPS, pon delante el proxy del
servidor (nginx, Caddy, Traefik) con el certificado y reenvía al puerto
`PUERTO_WEB`. Las contraseñas viajan en el login: fuera de una red interna,
HTTPS es obligatorio.

## Si el repositorio del kit es privado

El frontend se instala con `@hrl/core-ui` desde GitHub. Si
`DevHRL/hrl-core-ui` es privado, la construcción del frontend falla en
`npm ci`. En ese caso:

1. Crea en GitHub un token con permiso de solo lectura sobre ese repositorio.
2. En `docker-compose.yml`, descomenta los dos bloques `secrets` (el del
   servicio `frontend` y el del final del archivo).
3. Construye con el token en el entorno:
   `GITHUB_TOKEN=ghp_... docker compose up -d --build`.

El token se usa solo durante `npm ci` y no queda guardado en la imagen.

## Modo demo en el servidor

Para publicar solo la demostración (todo en memoria, sin base de datos),
pon `VITE_API_URL=` (vacía) en `.env` y reconstruye. `DATABASE_URL` y
`JWT_SECRETO` se siguen exigiendo, porque la API arranca igual aunque nadie la
use: `DATABASE_URL` puede ser cualquier URL, pero `JWT_SECRETO` necesita 32
caracteres o más, o la API no arranca y el frontend tampoco, porque espera a
que la API esté sana.
