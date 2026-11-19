# Sistema de Migraciones y Seeders SQL y Gestión de Archivos `.env`

Este documento reporta la refactorización realizada para dotar a la base de datos PostgreSQL de un sistema controlado de **migraciones** y **seeders** al estilo Laravel, manteniendo la independencia de configuración (`.env`) de cada servicio.

---

## 1. Esquema de archivos `.env` (Independencia por servicio)

Cada componente mantiene su propio archivo `.env` (con su respectiva plantilla `.env.example`) para conservar la autonomía de cada servicio y separar el entorno de desarrollo local del despliegue con Docker:

1. **[`servidor/api/.env`](../servidor/api/.env.example)** *(Desarrollo y pruebas del Backend)*:
   - `DATABASE_URL`: Conexión a PostgreSQL de desarrollo (`localhost`).
   - `DATABASE_URL_PRUEBAS`: Conexión a la base exclusiva para `pytest`.
   - `JWT_SECRETO`: Clave secreta para firma de tokens JWT.
   - `BOT_VALIDADOR_URL`: URL local del bot validador (`http://localhost:8787`).
2. **[`frontend/.env`](../frontend/.env.example)** *(Desarrollo del Frontend con Vite)*:
   - `VITE_API_URL`: Origen del backend (`http://localhost:8000`) para activar el proxy de Vite.
   - `VITE_BOT_URL`: Comentado por defecto para usar el bot embebido en navegador y en `npm run humo`.
3. **[`.env`](../.env.example)** *(En la raíz, exclusivo para `docker compose`)*:
   - `DATABASE_URL` (con `host.docker.internal`), `JWT_SECRETO`, `PUERTO_WEB` y `WEB_CONCURRENCY`.

---

## 2. Sistema de Migraciones y Seeders SQL

### Qué se cambió
Se reorganizó el directorio [`servidor/api/bd/`](../servidor/api/bd/README.md) en una estructura secuencial clara y se construyó el gestor [`servidor/api/app/herramientas/bd.py`](../servidor/api/app/herramientas/bd.py) junto con el script [`servidor/scripts/bd.mjs`](../servidor/scripts/bd.mjs).

#### Estructura de `servidor/api/bd/`

1. **`servidor/api/bd/migraciones/`** *(Estructura DDL: esquemas, tablas, vistas, disparadores y restricciones)*:
   - `0001_esquema_base.sql` — Los 5 esquemas base (`seguridad`, `organizacion`, `formato`, `reporte`, `auditoria`) y sus 33 tablas.
   - `0002_auditoria.sql` — Funciones y disparadores de fechas de control y bitácora inmutable.
   - `0003_integridad.sql` — Disparadores de reglas de negocio e integridad.
   - `0004_vistas.sql` — Las 10 vistas del esquema base.
   - `0005_desempeno_esquema.sql` — Esquemas `fuente` y `desempeno`, sus tablas base y disparadores.
   - `0006_desempeno_tablero.sql` — Tablas y columnas adicionales para el tablero de indicadores de desempeño.
   - `0007_farmacia_word.sql` — Ampliación de la restricción `ck_formato_version_tipo` para admitir archivos `.docx`.

2. **`servidor/api/bd/seeders/`** *(Datos iniciales y catálogos DML obligatorios)*:
   - `0001_semilla_base.sql` — Usuario inicial (`superadmin`), parámetros del hospital, 15 unidades orgánicas, matriz de destinos, periodos 2026, roles, permisos, estados iniciales y formato `NUT-1`.
   - `0002_flujo_entrega_directa.sql` — Actualización del flujo de estados de reporte a entrega directa (`borrador` → `remitido`).
   - `0003_desempeno_catalogos.sql` — Catálogo de 18 fuentes, 34 fichas de indicadores de desempeño de MINSA, dimensiones temáticas, matriz ficha-fuente, referencias MINSA 2026 y permisos `desempeno.ver` / `desempeno.cargar`.
   - `0004_retirar_mantenimiento.sql` — Retira con borrado lógico la unidad `MTO` (Mantenimiento) y su destino en `organizacion.destino` (no reporta al sistema).

3. **`servidor/api/bd/seeders/opcionales/`** *(Seeders opcionales para desarrollo/pruebas)*:
   - `usuarios_areas.sql` — Crea (o activa si tenían contraseña provisional) las 15 cuentas del sistema con contraseña `1234567890` y `debe_cambiar_contrasena = FALSE`:
     - **Global:** `superadmin` (rol `superadmin`) y `estadistica` (rol `revisor`).
     - **Áreas reportantes (rol `digitador`):** `farmacia` (`FAR`), `nefrologia` (`NEF`), `epidemiologia` (`EPI`, doble rol `digitador` + `consulta`), `laboratorio` (`LAB`), `ginecologia` (`GIN`), `centroquirurgico` (`CQX`), `lavanderia` (`LAV`), `nutricion` (`NUT`), `imagenes` (`DXI`).
     - **Oficinas receptoras (rol `consulta`):** `planeamiento` (`PLA`), `cuerpotecnico` (`CTE`), `direccion` (`DG`).

4. **`servidor/api/bd/pruebas/`** *(Scripts exclusivos para pruebas automatizadas)*:
   - `06_prueba.sql` y `07_ejemplo_nutricion.sql` — Usados únicamente por `pytest` para validar el modelo y escenarios de prueba; nunca se ejecutan en migraciones ni seeders de desarrollo/producción.

---

### Tablas de control en la Base de Datos

El gestor crea y mantiene automáticamente dos tablas en el esquema `public`:

- **`public.migraciones`**:
  - `id`: Identificador autoincremental.
  - `nombre`: Nombre del archivo `.sql` (ej. `0001_esquema_base.sql`).
  - `lote`: Número de lote (*batch*) en que se ejecutó.
  - `hash_sha256`: Huella SHA-256 del contenido del archivo al momento de ejecutarse.
  - `fecha_ejecucion`: Marca de tiempo exacta (`TIMESTAMPTZ`).

- **`public.seeders`**:
  - Misma estructura (`id`, `nombre`, `lote`, `hash_sha256`, `fecha_ejecucion`) para controlar qué seeders ya fueron sembrados.

**Validación de integridad por Hash SHA-256:**
Antes de aplicar nuevas migraciones o seeders obligatorios, el gestor compara el `hash_sha256` guardado en la base de datos con el archivo actual en disco. Si alguien modificó por error un archivo que ya había sido ejecutado previamente, el sistema lo alerta inmediatamente (`MODIFICADO (hash != BD)`) y detiene la ejecución para evitar inconsistencias entre entornos.

**Adopción automática de bases de datos preexistentes (`lote = 0`):**
Si el sistema se despliega sobre una base de datos que ya fue creada y poblada antes de que existieran `public.migraciones` y `public.seeders` (por ejemplo, en el servidor de Coolify o en una base local ya en uso), la función `sincronizar_base_existente` inspecciona automáticamente la presencia de las tablas, funciones, vistas, restricciones y catálogos de cada script (`0001`–`0007` en migraciones y `0001`–`0003` en seeders):
- Los scripts cuyos objetos o datos ya existen en la base se registran automáticamente con **`lote = 0`** (`Ejecutado (base)`) **sin volver a ejecutarse**, preservando intactos los usuarios y datos existentes.
- Únicamente se ejecutan en **`lote = 1`** aquellos scripts que realmente aún no estén presentes en esa base de datos.

---

## 3. Guía de Uso de los Comandos

Todos los comandos se ejecutan desde el directorio `servidor/`:

```bash
cd servidor
```

### 3.1. Ver el estado de migraciones y seeders (`migrate:status`)
Muestra una tabla indicando qué archivos ya fueron ejecutados (con su lote y fecha), cuáles están pendientes y el estado de los seeders opcionales:

```bash
npm run migrate:status
```

### 3.2. Ejecutar migraciones pendientes (`migrate`)
Aplica en orden secuencial únicamente los archivos de `servidor/api/bd/migraciones/` que aún no estén registrados en `public.migraciones`, dentro de una transacción atómica:

```bash
npm run migrate
```

### 3.3. Ejecutar seeders obligatorios (`seed`)
Verifica primero que todas las migraciones estén aplicadas y luego ejecuta en orden secuencial los archivos pendientes de `servidor/api/bd/seeders/`:

```bash
npm run seed
```

### 3.4. Ejecutar el seeder opcional de usuarios de áreas (`seed:usuarios`)
Crea o actualiza las cuentas con contraseña `1234567890`. Por seguridad se permite ejecutar una sola vez por base de datos: si ya fue aplicado, se niega automáticamente para proteger contraseñas existentes (salvo que se use `--forzar` explícitamente en desarrollo):

```bash
npm run seed:usuarios
# O para forzar reejecución en desarrollo si fuera necesario:
# python -m app.herramientas.bd seed:usuarios --forzar
```

### 3.5. Recrear la base de datos desde cero (`migrate:fresh`)
Pensado para desarrollo y pruebas locales cuando se desea limpiar por completo la base de datos y reconstruirla desde cero:

- **Solo estructura (migraciones):**
  ```bash
  npm run migrate:fresh
  ```
- **Estructura + catálogos base (migraciones + seeders obligatorios):**
  ```bash
  npm run migrate:fresh -- --seed
  ```
- **Estructura + catálogos base + usuarios de prueba (todo listo para entrar):**
  ```bash
  npm run migrate:fresh -- --seed --usuarios
  ```

---

## 4. Flujo de Trabajo para el Equipo de Desarrollo

Cuando un desarrollador necesite agregar cambios de base de datos para un módulo:

1. **Si es un cambio de estructura** (`CREATE TABLE`, `ALTER TABLE`, `CREATE VIEW`, `CREATE TRIGGER`):
   - Crear un nuevo archivo en `servidor/api/bd/migraciones/` con el siguiente número correlativo de 4 dígitos (ej. `0008_modulo_imagenes_tablas.sql`).
   - Probarlo localmente con `npm run migrate` (o `npm run migrate:fresh -- --seed`).
2. **Si es llenado de datos iniciales o catálogos** (`INSERT`, `UPDATE` de configuración inicial):
   - Crear un nuevo archivo en `servidor/api/bd/seeders/` con el siguiente número correlativo (ej. `0004_catalogo_imagenes.sql`).
   - Probarlo localmente con `npm run seed`.
3. **Al desplegar o actualizar en otro equipo (`git pull`):**
   - El desarrollador o responsable de despliegue solo debe ejecutar:
     ```bash
     cd servidor
     npm run migrate
     npm run seed
     ```
   - El sistema detectará automáticamente cuáles archivos ya estaban aplicados y ejecutará únicamente los nuevos.
   - Si despliega con Docker Compose (`docker compose up -d --build`), el contenedor de la API ejecuta automáticamente `migrate` y `seed` al arrancar.




## 4. Flujo de Trabajo para el Equipo de Despliegue

 Para ejecutar los comandos en el despliegue en razon de su estructura principal que se va utilizar docker, se piensa
 entrar en el servicio de api, y desde ahi ejecutar los comandos correspodientes con 
 python -m app.herramientas.bd  status|migrate|seed|seed:usuarios|migrate:fresh|migrate:fresh --seed|migrate:fresh --seed --usuarios

Y así manejadose en el sistema.