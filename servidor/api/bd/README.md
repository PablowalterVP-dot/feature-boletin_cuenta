# Base de datos (`servidor/api/bd/`)

Los scripts SQL están organizados en una lista secuencial que separa **migraciones** (estructura DDL) y **seeders** (datos iniciales y catálogos DML), gestionados automáticamente desde la CLI del proyecto.

## Estructura de directorios

```text
servidor/api/bd/
├── migraciones/                         # Estructura de la BD (esquemas, tablas, vistas, triggers, constraints)
│   ├── 0001_esquema_base.sql            # 33 tablas en 5 esquemas: seguridad, organizacion, formato, reporte, auditoria
│   ├── 0002_auditoria.sql               # Fechas de control y bitácora inmutable por disparadores
│   ├── 0003_integridad.sql              # Reglas de integridad (ámbito de roles, casillas, activación de versiones)
│   ├── 0004_vistas.sql                  # 10 vistas del esquema base
│   ├── 0005_desempeno_esquema.sql       # Esquemas fuente y desempeno (tablas base y disparadores)
│   ├── 0006_desempeno_tablero.sql       # Tablas y columnas adicionales para el tablero de desempeño
│   ├── 0007_farmacia_word.sql           # Habilita archivos Word (.docx) en formato.formato_version
│   └── 0008_planeamiento.sql            # Esquema planeamiento: lo que Planeamiento escribe de las actividades del POI
├── seeders/                             # Llenado de datos primarios y catálogos
│   ├── 0001_semilla_base.sql            # Usuario superadmin, parámetros, unidades, matriz, periodos 2026, roles, permisos y NUT-1
│   ├── 0002_flujo_entrega_directa.sql   # Configuración de máquina de estados de entrega directa (borrador → remitido)
│   ├── 0003_desempeno_catalogos.sql     # Fuentes, 34 fichas de MINSA, dimensiones, matriz ficha-fuente y permisos de desempeño
│   ├── 0004_retirar_mantenimiento.sql   # Retira la unidad MTO y su destino: Mantenimiento no reporta (21/10/2026)
│   ├── 0005_planeamiento.sql            # Rol planeamiento (global), permisos actividad.*, y las nueve áreas van a Planeamiento
│   ├── 0006_monitoreo.sql               # Catálogos y permisos de Monitoreo Indicadores
│   ├── 0007_formatos_de_las_nueve_areas.py  # GIN-1, LAB-1, LAV-1 y NEF-W1 activos: las nueve áreas en el flujo
│   └── opcionales/usuarios_areas.sql    # Cuentas de desarrollo (clave 1234567890). Nunca en producción
├── pruebas/                             # Scripts exclusivos para pruebas automatizadas (no se instalan en producción)
│   ├── 06_prueba.sql                    # Prueba de punta a punta de la BD (con ROLLBACK)
│   └── 07_ejemplo_nutricion.sql         # Catálogo ficticio de ejemplo usado por 06_prueba.sql y escenario.py
└── INFORME_AVANCE_04.md                 # Documento de referencia del modelo base
```

## Comandos de uso (desde `servidor/`)

| Comando | Descripción |
|---|---|
| `npm run migrate` | Ejecuta las migraciones pendientes en `bd/migraciones/` y las registra en `public.migraciones`. |
| `npm run migrate:status` | Muestra una tabla con el estado de cada migración y seeder (`Ejecutado`, `Pendiente` o `MODIFICADO`). |
| `npm run seed` | Ejecuta los seeders pendientes en `bd/seeders/` y los registra en `public.seeders`. |
| `npm run migrate:fresh` | **Se niega si la base tiene reportes** (agregue `--forzar` sabiendo que los pierde). Limpia los esquemas de la base de datos y vuelve a correr todas las migraciones desde cero. |
| `npm run migrate:fresh -- --seed` | Recrea los esquemas desde cero, ejecuta todas las migraciones y aplica todos los seeders. |

También pueden ejecutarse directamente con Python desde `servidor/api/`:

```bash
python -m app.herramientas.bd migrate
python -m app.herramientas.bd status
python -m app.herramientas.bd seed
python -m app.herramientas.bd fresh --seed
```

## Cómo agregar una nueva migración o seeder

1. **Nueva migración (creación/modificación de tablas, columnas, vistas o restricciones):**
   - Crea un archivo `.sql` en `servidor/api/bd/migraciones/` siguiendo el correlativo de 4 dígitos, por ejemplo: `0008_nueva_tabla_modulo.sql`.
   - Guárdalo en codificación **UTF-8 sin BOM**.
   - Ejecuta `npm run migrate` en `servidor/`.

2. **Nuevo seeder (inserción o actualización de datos de catálogo, permisos, parámetros):**
   - Crea un archivo `.sql` en `servidor/api/bd/seeders/` siguiendo el correlativo de 4 dígitos, por ejemplo: `0004_catalogo_nuevo_modulo.sql`.
   - Guárdalo en codificación **UTF-8 sin BOM**.
   - Ejecuta `npm run seed` en `servidor/`.
   - Un catálogo que ya vive en sus cargadores no se copia a SQL: el seeder puede ser un `.py` con `aplicar(bd)`, que corre en la misma transacción y se registra igual, con su lote y su huella. No confirma, y debe poder correr en una base que ya lo tenga.

> **Regla de oro:** Una vez que una migración o seeder ya fue ejecutado en los entornos compartidos o en producción, **no edites ese archivo** (el gestor detectará que el hash SHA-256 cambió y bloqueará la ejecución para proteger la trazabilidad). En su lugar, crea un nuevo archivo correlativo con el cambio.

## Mantenimiento no reporta

`0001_semilla_base.sql` es la semilla de Alejandro tal cual y trae la unidad
`MTO` como décima área. No se edita (su huella ya está registrada en las bases
que la corrieron): `0004_retirar_mantenimiento.sql` la retira después, con
borrado lógico, y `preparar_base` lo repite al arrancar si una base la tuviera
activa. Ninguna cuenta del seeder opcional se crea para Mantenimiento.

## Los datos no viajan con las migraciones

Migraciones y seeders reconstruyen la **estructura y los catálogos**, nunca los
reportes. Un reporte cargado en una base solo existe en esa base. Para llevar
reportes de una base a otra sin perder ninguno, ver
[`docs/BASE_COMPARTIDA.md`](../../../docs/BASE_COMPARTIDA.md)
(`inventario`, `exportar_reportes`, `importar_reportes`).

## Codificación (Windows)



Los scripts son **UTF-8 válido, sin BOM**. `psql` en una consola de Windows en

español usa `WIN1252` como codificación del cliente, lee los bytes UTF-8 como si

fueran WIN1252 y falla con:



```

ERROR: carácter con secuencia de bytes 0x81 en codificación «WIN1252» no tiene

equivalente en la codificación «UTF8»        (semilla, línea 55)

```



No es un byte corrupto: `0x81` es el segundo byte de la **`Á`** de «Área de Costura y

Lavandería» (`c3 81` en UTF-8, línea 47), y WIN1252 no define ese byte. `psql` informa la

línea donde *termina* la sentencia (el `INSERT` de las unidades va de la 40 a la 55).

**No edites el archivo**: su huella está registrada en `public.seeders`.

Dile a `psql` que el cliente habla UTF-8, de cualquiera de estas formas:



```powershell

# PowerShell

$env:PGCLIENTENCODING = "UTF8"

psql -U <usuario> -d estadistica_hrl -v ON_ERROR_STOP=1 -1 -f servidor/api/bd/migraciones/0001_esquema_base.sql

```



```bat

:: cmd

set PGCLIENTENCODING=UTF8

psql -U <usuario> -d estadistica_hrl -v ON_ERROR_STOP=1 -1 -f servidor/api/bd/migraciones/0001_esquema_base.sql

```



```bash

# Git Bash, Linux, macOS

PGCLIENTENCODING=UTF8 psql -U <usuario> -d estadistica_hrl -v ON_ERROR_STOP=1 -1 -f servidor/api/bd/migraciones/0001_esquema_base.sql

```



También sirve el parámetro en la cadena de conexión:

`psql "postgresql://usuario@localhost/estadistica_hrl?client_encoding=UTF8" …`.



**Lo que NO funciona:** `--set=client_encoding=UTF8` (y `-v client_encoding=UTF8`). Eso

define una *variable de psql*, no la codificación de la conexión, así que el error sigue

igual. El backend y sus pruebas no dependen de esa variable: `app/datos/sesion.py`

(`crear_motor`) fuerza `client_encoding=utf8` en la conexión, y una prueba lo comprueba

con `PGCLIENTENCODING=WIN1252` puesto. (Sin forzarlo, libpq obedece la variable y el

texto con acentos se guardaría corrupto sin avisar.)



## Lo que el esquema no hace (y por eso lo hace el backend)



- **No impone la máquina de estados.** `reporte.transicion_estado` son datos:

  quien cambia el estado es el backend, comprobando el permiso.

- **No bloquea enviar** un reporte con errores o con avisos sin justificar.

- **No sabe quién actúa** salvo que el backend lo diga en cada transacción con

  `set_config('app.usuario_id', …, true)` y `app.direccion_ip`.

- **No filtra lo eliminado:** el borrado es lógico (`fecha_eliminacion`) y toda

  consulta debe excluirlo.

