# 0014: Hospitalización se levanta con el resto, con su base en Docker

- **Estado:** Adoptada
- **Fecha:** 2026-11-16
- **Cambia:** [0011](0011-integracion-con-estadistica.md) (servicio en un perfil apagado y
  base `egresos` creada a mano en el PostgreSQL del servidor)

## Contexto

Con el servicio `hospitalizacion` en un perfil de `docker-compose.yml`, un
`docker compose up -d --build` levantaba Estadística sin hospitalización. Sus módulos
aparecían igual para las cuentas de piso, Admisión, Mantenimiento y RENOXI, y todas
sus pantallas mostraban «Sin conexión con hospitalización». Encenderlo esperaba a que
quien administra el servidor creara la base `egresos` y su dueño.

## Decisión

**Hospitalización se levanta siempre con el resto.** `docker-compose.yml` ya no tiene
perfiles. Trae un contenedor más, `hospitalizacion-db` (PostgreSQL 16, zona horaria
de Lima, con `btree_gist` y `pg_trgm` incluidos), que guarda pacientes, censos y egresos
en el volumen `egresos_datos`. No publica puerto: solo lo alcanza el servicio
`hospitalizacion` por la red interna, y este arranca cuando la base responde.

La base de Estadística no cambia: sigue en el PostgreSQL que provee el servidor.

**Las claves de la base se generan solas.** Son cuatro: la de la dueña, que crea la
base la primera vez, y las de los roles `egresos_app`, `egresos_lectura` y
`egresos_respaldo`, que crea la primera migración. `hospitalizacion-db`, antes de
arrancar PostgreSQL, las genera al azar si no existen y las guarda en el volumen `egresos_claves`; la base las lee con
`POSTGRES_PASSWORD_FILE` y la API con `<VARIABLE>_ARCHIVO` (`app/config.py`). No se
escriben en `.env` ni en el repositorio, y nadie tiene que inventarlas: desplegar es
`git pull` y `docker compose up -d --build`, con el `.env` que ya tenía Estadística.
Van dentro de la base y no en un contenedor aparte que corre una vez y termina, porque
Coolify, donde se despliega, reinicia los contenedores que terminan.

Para usar el PostgreSQL del servidor en vez del contenedor, en `.env` se escriben
`EGRESOS_DB_HOST=host.docker.internal`, `EGRESOS_DB_PUERTO=5432` y las cuatro claves, con
la base creada como antes (`docs/DESPLIEGUE.md` § «Hospitalización»). Una clave escrita
en `.env` gana a la generada.

## Consecuencias

- El `.env` del servidor no cambia: basta con el `JWT_SECRETO` que ya tenía.
- `egresos_claves` va con `egresos_datos`: si se borra solo, las claves nuevas no abren
  la base ya creada.
- El respaldo diario suma `pg_dump` de esta base desde su contenedor.
- `docker compose down -v` borra el volumen `egresos_datos` con los pacientes: igual que
  `cargas`, nunca se usa en el servidor.
- Sigue pendiente decidir si las pruebas son con pacientes ficticios o reales; con
  reales, HTTPS desde el primer día.
