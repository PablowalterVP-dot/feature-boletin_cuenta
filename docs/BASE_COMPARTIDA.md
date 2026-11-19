# Una sola base: cómo se juntan los reportes del equipo

**El problema (22/10/2026).** Cada integrante tenía su propia base de PostgreSQL
y cargaba meses en ella: Farmacia, Hemodiálisis y Gineco-Obstetricia «tenían
histórico», pero no en la base del servidor, y nadie podía decir quién tenía
qué. Las migraciones (`npm run migrate`, `npm run seed`) no lo resuelven:
reconstruyen la **estructura**, nunca los reportes. Un `pg_dump` tampoco:
copia una base entera encima de otra y la pisa.

**La regla.** La base del servidor es la única que cuenta. Las bases locales
son para desarrollar y se pueden tirar. Un reporte que solo existe en una base
local no existe para el sistema.

## Las piezas

| Qué | Para qué |
|---|---|
| `historico/<área>/<año>/` | Los archivos originales que el área entregó antes del sistema. `preparar_base` los carga en **toda** base al arrancar (servidor, la de cada uno, una nueva). Es el camino preferido: versionado y reproducible |
| `inventario` | Qué meses tiene cada área en una base. Solo lee |
| `exportar_reportes` | Empaqueta los reportes de una base: el archivo que subió el área y un manifiesto. Solo lee |
| `importar_reportes` | Trae un paquete a otra base **sin pisar nada**. Sin `--aplicar` solo muestra el plan |
| Panel «Cobertura» (superadmin) | Lo mismo que `inventario`, de la base del servidor, en pantalla |

Lo que viaja de una base a otra no son filas sino **el archivo original**: al
importar, el bot lo vuelve a leer en la base de destino y el reporte pasa por el
flujo de siempre, con sus ids, su bitácora y su versión de formato. Dos meses se
comparan por la **huella SHA-256** del archivo: misma huella, mismo archivo.

Todos los comandos se corren desde `servidor/api/` con el Python de la API
(`.venv\Scripts\python` en Windows) o, en el servidor, con
`docker compose exec api python -m …`.

## 1. Ver qué tiene cada uno

Cada integrante, en su máquina, contra su base:

```bash
python -m app.herramientas.inventario --origen jesus --json inventario-jesus.json
```

```
Área                       Fmt   Ene Feb Mar Abr May Jun Jul Ago Set Oct Nov Dic   Faltan
Farmacia                   FAR     R   R   R   R   R   R   R   R   R               0/9
Nefrología y Hemodiálisis  NEF     R   R   R   ·   ·   R   R   ·   ·               4/9
…
R remitido · B borrador · x eliminado · · falta · (espacio) todavía no toca
```

Cada uno comparte su JSON (no tiene cifras ni datos de pacientes: solo
estados, nombres de archivo y huellas). Con todos juntos, más el del servidor:

```bash
python -m app.herramientas.inventario --comparar servidor.json inventario-jesus.json inventario-mars.json
```

Una letra por base en cada celda, en el orden en que se pasaron. `≠` marca un
mes que dos bases tienen con **archivos distintos**; al final se listan, con
el nombre de cada archivo. Eso se decide entre personas antes de importar.

En el servidor, el panel **Administración → Cobertura** muestra lo mismo.

## 2. Llevar los meses al servidor

**a) Si el área tiene sus archivos originales** (lo preferido): se ponen en
`servidor/api/historico/<área>/<año>/`, se agrega el área a `HISTORICOS` en
`app/herramientas/preparar_base.py` y se sube a git. En el siguiente
despliegue, el servidor los carga solo; también la base de cada integrante
en su siguiente arranque. Farmacia ya está en la lista
(`historico/farmacia/2026/`, ver su README): falta poner sus nueve Word.

**b) Si los meses solo están en la base de alguien:**

```bash
# En la máquina de quien los tiene:
python -m app.herramientas.exportar_reportes paquete-jesus --origen jesus --formato FAR --formato NEF
```

El paquete es una carpeta con datos reales del hospital: se pasa por un medio
privado (USB, carpeta compartida del hospital), **nunca por git**. En el
servidor:

```bash
docker compose cp paquete-jesus api:/tmp/paquete-jesus
docker compose exec api python -m app.herramientas.importar_reportes /tmp/paquete-jesus            # el plan
docker compose exec api python -m app.herramientas.importar_reportes /tmp/paquete-jesus --aplicar  # importar
```

El plan dice qué pasa con cada mes:

| Plan | Qué hace `--aplicar` | Qué hacer |
|---|---|---|
| `nuevo` | Lo carga, y lo envía si allá estaba remitido | — |
| `igual` | Nada: ya está el mismo archivo | — |
| `conflicto` | Nada | Decidir cuál vale. Si vale el del paquete: `eliminar_reporte FMT AAAA-MM --motivo "…"` y volver a importar |
| `conflicto entre paquetes` | Nada, de ninguno | Lo mismo, entre los dos paquetes |
| `eliminado en destino` | Nada: alguien lo borró a propósito | Si fue un error, se carga a mano |
| `sin formato` | Nada | Activar el formato: `python -m app.herramientas.cargar_catalogo_<área>` |
| `sin archivo` | Nada | El archivo faltaba en la carpeta de cargas de la base de origen |

Importar dos veces el mismo paquete no duplica nada: la segunda vez todo es
`igual`. Lo importado lleva la observación «Carga histórica: importado de …», y
la puntualidad del año no lo cuenta (la fecha de envío es la de la importación).

**Antes de importar, el formato del área tiene que estar activo en el servidor.**
Desde el seeder `0007` (03/11/2026) las nueve áreas lo tienen al desplegar.

## 3. Después: que no vuelva a pasar

- Las áreas suben **en el servidor**, nunca en una base local.
- Para desarrollar con datos reales, se trae el servidor a la base local, no al
  revés: `exportar_reportes` en el servidor e `importar_reportes` en local
  (o un `pg_dump` del servidor restaurado en una base local que se puede
  tirar).
- `npm run migrate:fresh` se niega si la base tiene reportes. Con `--forzar` los
  pierde: exporte antes.
- Un cambio de estructura o de catálogo va en `bd/migraciones/` o
  `bd/seeders/` (ver `servidor/api/bd/README.md`), no a mano en una base.
