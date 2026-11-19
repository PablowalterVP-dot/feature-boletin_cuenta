# Indicadores de desempeño

El tablero de las 34 fichas de desempeño de MINSA. Hoy calcula la Ficha 14
(oportunidad de tratamiento oncológico) con el HIS MINSA y SINADEF.

## Resumen: de cero a ver el resultado

| # | Paso | Dónde | Detalle |
|---|---|---|---|
| 1 | Traer el código | `git checkout indicadores` y `git pull` | 1.2 |
| 2 | Levantar el módulo | En `servidor\`: `npm run desempeno` | 1.3 |
| 3 | Entrar | `npm run dev` en `servidor\` y en `frontend\`; abrir `http://localhost:5173` como superadministrador | 2b |
| 4 | Descargar los datos | La carpeta de Drive «Análisis de Indicadores» | 1.4 |
| 5 | Subirlos | «Indicadores de desempeño» → «Carga de datos», mes por mes | 1.4 |
| 6 | Comprobar | La Ficha 14 debe dar enero a julio 6/75 | 1.5 |

Los pasos 1 a 3 dejan el tablero funcionando, vacío. Los datos van después y
cada persona los carga en su propia base: descargar el código no los trae.

Hecho: base de datos, carga por tramas, cálculo de la Ficha 14, rutas de la API
y pantallas del tablero.

---

## 1. Pasos

### 1.1 Requisitos

- Node 20 o superior y Python 3.13 o superior (o Anaconda con el entorno `hrl`).
- PostgreSQL con la base creada y el esquema `avance_04` instalado.
- `servidor/api/.env` con su `DATABASE_URL`.

Quien ya levanta el sistema con `npm run dev` los tiene. Si no:
[`servidor/api/README.md`](../servidor/api/README.md), «Arrancar».

### 1.2 Traer el código

```powershell
git fetch
git checkout indicadores
git pull
```

### 1.3 Inicializar la base de datos

Crea los esquemas `fuente` y `desempeno`, sus 15 tablas, los catálogos y los
permisos necesarios (`desempeno.ver` y `desempeno.cargar`). No inserta pacientes
ni atenciones, y si ya estaban creados, no modifica nada existente (idempotente).

**En local:**

```powershell
cd servidor
npm run desempeno
```

O directamente con Python:

```powershell
cd servidor\api
python -m app.herramientas.instalar_desempeno
```

**En el servidor (con Docker):**

```bash
docker compose exec api python -m app.herramientas.instalar_desempeno
```

O accediendo a la shell del contenedor:
```bash
docker compose exec -it api sh
python -m app.herramientas.instalar_desempeno
```

- Quien tenga una sesión abierta en el sistema debe salir y volver a entrar
  para recibir los permisos del módulo.

### 1.4 Cargar datos

Va después de levantar el módulo. Los datos tienen información de pacientes:
se guardan **fuera** del proyecto y no van a GitHub.

**De dónde salen.** Están ordenados en la carpeta de Drive del equipo,
[«Análisis de Indicadores»](https://drive.google.com/drive/folders/1onVfCp45WFgp4fLorWkYINCr-pugk0VU)
(hay que tener acceso; se pide a la Oficina de Estadística):

```
Análisis de Indicadores\
  1_his_minsa\2026\
    01_enero_2026\datos_crudos_hrl_2026_01.csv
    02_febrero_2026\ … 07_julio_2026\      (una trama por mes)
    agosto\CONSOLIDADOAGOSTO_NominalTrama28092026_215720.csv
    setiembre\                              (la trama de setiembre)
  2_datos_de_muertos\
    enero-2026.xls … agosto-2026.xls, septiembre-incompleto-2026.xls
    (también 2023 a 2025: no hacen falta para 2026)
  3_fallecidos_verificados\
    fallecidos_verificados_sinadef_nacional.csv
```

| Carpeta | Qué es | Cómo entra al sistema |
|---|---|---|
| `1_his_minsa` | La trama nominal del HIS MINSA, un `.csv` por mes | Se sube tal cual |
| `2_datos_de_muertos` | El reporte de SINADEF del hospital, un `.xls` por mes | Se sube tal cual |
| `3_fallecidos_verificados` | Defunciones confirmadas a mano en SINADEF nacional | Por el formulario «Agregar», o subiendo el `.csv` |

Se descargan a una carpeta de la máquina y **no se abren ni se editan**: Excel
cambia fechas y números al guardar.

**Cómo se suben (lo normal).** Entrar como superadministrador e ir a
«Indicadores de desempeño» → «Carga de datos» → «Subir un archivo». El sistema
reconoce cada archivo por su contenido, lo revisa antes de guardar y recalcula
solo. Hasta 60 MB por archivo.

1. **Mes por mes, en orden desde enero:** primero la trama del HIS de ese mes y
   luego su reporte de SINADEF. Así de enero a setiembre: 18 archivos.
2. **Al final, el fallecido verificado:** en «Fallecidos verificados» →
   «Agregar», con el documento y la fecha de defunción del `.csv`. La casilla
   «Registro en SINADEF» se deja vacía si el archivo no la trae: no es la fecha
   en que se verificó.

La lista «Qué subir», arriba en esa pantalla, dice en cada momento qué falta.
Mientras se sube, las cifras se acomodan: un mes no se cierra con su propia
trama (ver 3b). El acumulado se muestra desde el primer mes, marcado como «con
meses sin cerrar».

**Por terminal (alternativa, todo de una vez).** Sirve para quien tiene la
carpeta completa de la Oficina de Estadística, con el consolidado de varios
años (`datos_crudo2021_2026.csv`, más de 60 MB: no entra por la web). Da el
mismo resultado que subir por tramas.

```
<DATOS>\
  datos_crudo2021_2026.csv
  fallecidos_verificados_sinadef_nacional.csv
  his_minsa\          (las tramas de agosto y setiembre)
  datos_de_muertos\   (los .xls de SINADEF)
```

Desde `servidor\api`, con el entorno de Python activado (`conda activate hrl`
o `.venv\Scripts\activate`):

```powershell
python -m app.herramientas.preparar_desempeno "<DATOS>"
```

Crea las tablas si faltan, carga todo y calcula. Tarda cerca de un minuto.
Correrlo otra vez no duplica nada: carga solo lo nuevo.

### 1.5 Comprobar

Tras levantar el módulo (1.3), el comando muestra:

```
Instalado: 01_esquema.sql, 02_tablero.sql. Los esquemas «fuente» y «desempeno» tienen 15 tablas.
```

(O `Ya estaba todo instalado...` si ya existían.)

Sin datos, el tablero dice «Ninguna de las 34 fichas tiene resultado todavía»
y «Qué subir» pide cada mes ya terminado, con la marca «Falta».

Con los 18 archivos y el fallecido verificado cargados, la Ficha 14 queda así
(«Mes a mes», en la ficha):

```
  Mes         Numerador  Denominador
  Enero               1            9
  Febrero             3           22
  Marzo               1           10
  Abril               0            6
  Mayo                1           11
  Junio               0            6
  Julio               0           11
  Agosto              0            7
  Setiembre           0            5
```

- **Enero a julio suma 6/75**: lo publicado por MINSA (corte del 08/08/2026).
  Pasan a «Oficial» al subir agosto, que trae los datos hasta ese corte.
- Antes de agregar el fallecido verificado, junio sale 0/7.
- El acumulado de enero a setiembre es 6/87 (6,9 %), con agosto «por cerrar» y
  setiembre «preliminar».

Subir por tramas y cargar por terminal dan lo mismo, paciente por paciente.

---

## 2. Ver el resultado en la base

En pgAdmin: clic derecho sobre la base → `Query Tool`, pegar y `F5`.

Resultado mes a mes:

```sql
SELECT mes, numerador, denominador
  FROM desempeno.resultado_mensual
 WHERE corrida_id = (SELECT max(id) FROM desempeno.corrida)
 ORDER BY mes;
```

Pacientes detrás de cada cifra (muestra DNI: no compartir capturas):

```sql
SELECT numero_documento, categoria AS tipo_cancer, fecha_referencia AS fecha_diagnostico,
       es_denominador, es_numerador, fecha_cumplimiento AS fecha_tratamiento, motivo_exclusion
  FROM desempeno.resultado_paciente
 WHERE corrida_id = (SELECT max(id) FROM desempeno.corrida)
 ORDER BY fecha_referencia;
```

Cálculos hechos, con su fecha de corte:

```sql
SELECT id, fecha_creacion, fecha_corte, mes_hasta, observacion FROM desempeno.corrida ORDER BY id;
```

## 2b. Ver el tablero

1. La primera vez, en `frontend\`: `npm install` y copiar `.env.example` como
   `.env` (ya trae `VITE_API_URL=http://localhost:8000`).
2. Levantar las dos partes, cada una en su terminal, y dejarlas abiertas:
   - en `servidor\`: `npm run dev` (la API y el bot);
   - en `frontend\`: `npm run dev`, y abrir `http://localhost:5173/`.

   Si al entrar dice que no se puede conectar (en la terminal del frontend,
   `ECONNREFUSED`), es que la del servidor no está levantada.
3. Entrar con una cuenta de Estadística (revisor) o con el superadministrador.
   Si la sesión estaba abierta cuando se corrió `npm run desempeno`, salir y
   volver a entrar: los permisos se leen al ingresar.
4. En el menú, grupo «Indicadores de desempeño». Si no aparece: la cuenta no
   tiene el permiso, o no se corrió `npm run desempeno` en esa base (1.3).
   Sin datos cargados aparece igual, con las 34 fichas sin resultado.

| Pantalla | Quién | Para qué sirve |
|---|---|---|
| ~~Tablero de indicadores~~ | — | **Retirado el 07/11/2026.** Todo lo que mostraba está en Monitoreo Indicadores: las 34 fichas con su estado (tarjetas o lista) y, para la ficha 14, la única que el servidor calcula persona por persona, su pantalla completa con los pacientes y el seguimiento («Abrir la ficha en el módulo de desempeño»). Queda «Carga de datos» |
| Una ficha | Estadística y superadministrador | Tablero: las cifras del año, el gráfico del logro acumulado con la línea de la meta (o el de pacientes por mes) y, al lado, el mes elegido con un cuadro por paciente. Pulsar un mes lo elige sin mover la página. Debajo, «Pacientes de [mes]», plegada: al desplegarla lista los pacientes de ese mes con nombre, DNI y su situación. En pestañas: mes a mes, por tipo (del año o de un mes) y cómo leer el indicador |
| Carga de datos | Solo superadministrador | «Qué subir» (qué falta y desde qué día sirve), subir un archivo (con revisión antes de guardar), qué meses tiene cada fuente, fallecidos verificados, fuentes por obtener, lo publicado por MINSA y el historial de cargas, desde donde se retira una |

Todas las frases del tablero («1 de 34 fichas tiene resultado…») se arman con
lo que hay en la base en ese momento: nada se escribe a mano. La lista de
pacientes no se pide al abrir la ficha, sino al desplegar su sección.

Solo funciona con el servidor: sin `VITE_API_URL` (el prototipo) el módulo no
aparece en el menú.

---

## 3. Cuando llegan datos nuevos

Desde el tablero (superadministrador): «Carga de datos» → «Subir un archivo».
Se elige el archivo tal como se descargó; el servidor dice qué fuente es, qué
meses trae y si reemplaza algo, y solo carga después de confirmar. Luego
recalcula solo.

Por terminal (lo mismo, para quien tiene la carpeta de datos):

1. Guardar el archivo en la carpeta de datos: la trama del HIS en `his_minsa\`,
   el reporte de SINADEF en `datos_de_muertos\`. Una defunción verificada se
   agrega como fila a `fallecidos_verificados_sinadef_nacional.csv`.
2. Desde `servidor\api`: `python -m app.herramientas.preparar_desempeno "<DATOS>"`.

Carga solo lo nuevo y calcula otra vez, en una corrida nueva. El consolidado de
varios años (más de 60 MB) va siempre por terminal.

Dónde va cada archivo y qué formato debe tener:

| Dato | Dónde se guarda | Formato |
|---|---|---|
| Trama del HIS MINSA | `<DATOS>\his_minsa\` | `.csv` tal como lo entrega el HIS: 57 columnas, separado por comas. No cambiarle el nombre: `NominalTrama28092026_215720` dice que se extrajo el 28/09/2026 a las 21:57:20, y con eso se sabe cuál es la versión más nueva de un mes |
| Reporte de SINADEF | `<DATOS>\datos_de_muertos\` | `.xls` tal como se descarga (reporte «reporteMinsaCdefDiarioMensual»), uno por mes. No guardarlo como `.xlsx`. El nombre no importa: el mes se lee del título |
| Defunción verificada en SINADEF nacional | Una fila más en `<DATOS>\fallecidos_verificados_sinadef_nacional.csv` | Columnas `numero_documento` (8 dígitos), `fecha_defuncion` y `fecha_registro` (`AAAA-MM-DD`; la de registro puede ir vacía) |

Los archivos no se abren ni se editan antes de cargarlos: Excel cambia fechas y
números al guardar.

Cuando MINSA publica un reporte, registrar sus cifras y su fecha de corte
(desde `servidor\api`, con el entorno activado):

```powershell
python -m app.herramientas.registrar_minsa --ficha 14 --anio 2026 --mes 9 --numerador 0 --denominador 5 --corte 2026-10-08 --documento "<archivo de MINSA>"
```

Un mes por orden. Con `--corte`, la ficha se recalcula en el momento: los meses
que ya habían terminado ese día pasan a calcularse con ese corte. Sin `--corte`,
las cifras solo sirven para comparar. También se registra desde el tablero:
«Carga de datos» → «Lo publicado por MINSA».

---

## 3b. Subir mes a mes (tramas)

La forma normal de trabajo: cada mes se descarga la trama de ese mes y se sube.
Subir por tramas da el mismo resultado que la carga completa (comprobado con los
18 archivos reales de enero a setiembre de 2026, paciente por paciente).

**Por qué un mes no se cierra con su propia trama.** El plazo de la Ficha 14
corre por paciente: 37 días desde su diagnóstico. Un paciente del 31 de enero
tiene hasta el 9 de marzo. Enero se cierra con datos hasta ese día, es decir,
con las tramas de febrero y marzo. Mientras faltan, puede aparecer un
tratamiento (sube el numerador) o una exclusión (baja el denominador).

**«Qué subir»** (arriba en «Carga de datos»). El sistema calcula, con los
pacientes de cada mes, qué archivo falta y desde qué día sirve descargarlo:

| Dice | Significa |
|---|---|
| «Ya se puede» | Una descarga de hoy sirve |
| «Desde el 06/10: cierra agosto» | Descargada ese día o después, trae lo que agosto necesita |
| «Completa el mes» | El mes se descargó antes de terminar: hace falta entero |
| «Queda como definitiva» | Descargada tras el cierre de la corrección del HIS (día 21 del mes siguiente) |

Una descarga más reciente sirve también para las fechas anteriores. Basta una
visita al mes, después del día 21, con la trama final del mes anterior y la del
mes en curso, más el reporte de SINADEF.

**Estados nuevos.**

| Dónde | Estado | Cuándo |
|---|---|---|
| Paciente | Esperando datos (gris) | Sin tratamiento y con el plazo pasado, pero lo cargado no llega a su vencimiento. No es «plazo vencido»: todavía no se sabe |
| Mes | Por cerrar | Su carga ya es la final, pero faltan datos posteriores. Dice qué trama falta y hasta qué día |

El acumulado que se muestra cuenta todo lo cargado y dice si incluye meses sin
cerrar; lo ya cerrado (meses oficiales y consolidados) va aparte. Un mes con corte
de MINSA es oficial cuando hay datos hasta el corte.

**La fecha de descarga.** Sale del nombre del archivo (`NominalTrama…`). Si el
nombre no la trae, se toma la del último registro del archivo: se descargó ese
día o después.

**Fallecidos verificados.** Apartado propio en «Carga de datos»: agregar,
corregir o retirar una defunción confirmada en SINADEF nacional. Una persona,
una fila. Cada cambio recalcula. El CSV sigue sirviendo para varias a la vez.

**Retirar una carga.** En «Historial de cargas», el botón de la fila vigente.
Antes dice la consecuencia («el año solo calcula hasta abril»). Borra las filas
de ese mes, recalcula y la deja en el historial como «Retirada». No devuelve la
versión anterior: para recuperarla se sube otra vez el archivo. Sin enero, el
año queda sin resultado.

Fuera de esto, por ahora: el cambio de año. Lo que diciembre necesite de enero
y febrero del año siguiente no se pide en «Qué subir».

---

## 4. Comandos sueltos

`npm run desempeno` corre solo el 1. `preparar_desempeno` (1.4) corre todos, en
este orden. Sueltos sirven para cargar un solo archivo o cuando un paso falla. Desde `servidor\api`, con el entorno de Python
activado (`conda activate hrl` o `.venv\Scripts\activate`):

| # | Comando | Para qué sirve | Termina con |
|---|---|---|---|
| 1 | `python -m app.herramientas.instalar_desempeno` | Crea las tablas, o agrega lo que les falta | `Instalado: 01_esquema.sql, 02_tablero.sql. Los esquemas «fuente» y «desempeno» tienen 15 tablas.` |
| 2 | `python -m app.herramientas.cargar_his "<DATOS>\datos_crudo2021_2026.csv" --desde 2025-12` | Carga el HIS de diciembre de 2025 a julio de 2026 | `Cargadas 276904 filas` |
| 3 | `python -m app.herramientas.cargar_his "<DATOS>\his_minsa\CONSOLIDADOAGOSTO_NominalTrama28092026_215720.csv"` | Carga el HIS de agosto | `Cargadas 34725 filas` |
| 4 | `python -m app.herramientas.cargar_his "<DATOS>\his_minsa\CONSOLIDADO_NominalTrama30092026_212639-septiembre-2026.csv"` | Carga el HIS de setiembre | `Cargadas 31250 filas` |
| 5 | `python -m app.herramientas.cargar_sinadef "<DATOS>\datos_de_muertos" --verificados "<DATOS>\fallecidos_verificados_sinadef_nacional.csv"` | Carga las defunciones | `Cargados 2824 certificados de 45 reportes.` |
| 6 | `python -m app.herramientas.ver_fuentes` | Muestra qué meses hay cargados y de qué archivo | Las tres líneas de fuentes de 1.5 |
| 7 | `python -m app.herramientas.calcular_desempeno --ficha 14 --anio 2026 --corte 2026-08-08` | Calcula la Ficha 14 y guarda el resultado | La tabla de 1.5 |
| — | `python -m app.herramientas.registrar_minsa --ficha 14 --anio 2026 --mes 8 --numerador 0 --denominador 7` | Registra lo publicado por MINSA de un mes (ver 3) | `MINSA 0/7 … coincide.` |

`preparar_desempeno` y la carga desde la web toman la fecha de corte del último
reporte de MINSA registrado en la base; el comando 7 la pide explícita.

Opciones:

| Opción | Comandos | Para qué sirve |
|---|---|---|
| `--ensayo` | 2 a 5 y 7 | Dice qué haría, sin guardar |
| `--forzar` | 2 a 5 | Carga aunque el archivo sea más antiguo o traiga menos filas que lo ya cargado |
| `--desde`, `--hasta` (`AAAA-MM`) | 2 a 4 | Toma solo esos meses del archivo |
| `--corte` (`AAAA-MM-DD`) | 7 | Fecha de corte del reporte de MINSA. Sin ella, todo se calcula al día |
| `--hasta-mes` | 7 | Último mes que se cuenta. Por omisión, el último cargado |

---

## 5. Archivos del módulo

En `servidor/api/`, salvo indicación.

| Archivo | Para qué sirve |
|---|---|
| `bd/desempeno/01_esquema.sql` | Crea los esquemas `fuente` y `desempeno` |
| `bd/desempeno/02_tablero.sql` | Lo que necesita el tablero: dimensiones, fuentes de cada ficha, seguimiento de casos, permisos y lo publicado por MINSA |
| `bd/desempeno/README.md` | Cómo desinstalar |
| `app/datos/modelos/fuente.py`, `desempeno.py` | Describen las tablas para Python |
| `app/datos/fuente.py` | Lee los datos crudos de la base. Es lo que cambia cuando haya acceso directo al HIS |
| `app/dominio/fuentes.py` | Reglas de la carga: cuándo se reemplaza un mes |
| `app/dominio/desempeno/ficha_14.py` | Reglas de la Ficha 14 |
| `app/dominio/desempeno/defunciones.py` | Qué certificados de defunción cuentan |
| `app/dominio/desempeno/calendario.py` | Cuándo un mes queda cerrado: la corrección del HIS va del 12 al 21 del mes siguiente |
| `app/dominio/desempeno/tablero.py` | Qué es hoy cada caso, qué datos le faltan a una ficha, cuándo avisar |
| `app/dominio/permisos.py` | Los permisos `desempeno.ver` y `desempeno.cargar` |
| `app/servicios/fuentes.py` | Carga los archivos a la base |
| `app/servicios/desempeno.py` | Reúne los datos por paciente, calcula, guarda y recalcula cuando hace falta |
| `app/servicios/tablero.py` | Lo que muestra cada pantalla del tablero |
| `app/servicios/subida.py` | Subir un archivo desde el tablero: reconocerlo, revisarlo y cargarlo |
| `app/api/desempeno.py` | Las rutas del tablero (`/api/desempeno/*`, ver `API_BACKEND.md` § 7e) |
| `app/herramientas/preparar_desempeno.py` | La carga completa por terminal: instala, carga la carpeta de datos y calcula. Aquí están los nombres de archivo de la carpeta |
| `app/herramientas/instalar_desempeno.py`, `cargar_his.py`, `cargar_sinadef.py`, `ver_fuentes.py`, `calcular_desempeno.py`, `registrar_minsa.py` | Los comandos sueltos |
| `pruebas/prueba_*desempeno*.py`, `prueba_cargar_his.py`, `prueba_cargar_sinadef.py`, `prueba_ficha_14.py`, `prueba_defunciones.py`, `prueba_tablero_dominio.py` | Pruebas, con datos inventados |
| `../scripts/desempeno.mjs` | Hace que exista `npm run desempeno`: levanta el módulo (tablas, catálogos y permisos), sin datos |

En `frontend/src/app/`:

| Archivo | Para qué sirve |
|---|---|
| `dominio/desempeno.js` | Cómo se dicen las cifras: el titular, los porcentajes, los estados de cada mes y de cada caso |
| `paneles/desempeno/Indicadores.jsx` | Abre el tablero o, con `?ficha=14`, una ficha |
| `paneles/desempeno/Tablero.jsx` | El tablero de las 34 fichas (reemplazó al catálogo el 28/10/2026) |
| `paneles/desempeno/Ficha.jsx` | Una ficha |
| `paneles/desempeno/graficos.jsx` | Los gráficos propios: logro acumulado con meta, pacientes por mes, cuadros por paciente y la tendencia de la tabla del tablero (el kit todavía no los tiene) |
| `paneles/desempeno/Casos.jsx` | Los casos que todavía pueden sumar, y su seguimiento |
| `paneles/desempeno/Carga.jsx` | Carga de datos |
| `paneles/desempeno/comunes.jsx` | Leer de la API y piezas que comparten |
| `navegacion.js` (`NAVEGACION_DESEMPENO`) | Las dos entradas del menú y el permiso que pide cada una |
| `cabecera.js` (`bandaDeDesempeno`) | La cabecera: de cuándo son los datos y qué falta cargar |
| `servicios/api.js` (`desempeno`, `subirADesempeno`) | Las llamadas a `/api/desempeno/*` |

No se toca `bd/avance_04/` (el esquema de Alejandro): esto se instala encima.

---

## 6. Tablas

**`fuente`**: datos crudos. Provisional, hasta tener acceso directo al HIS y a SINADEF.

| Tabla | Para qué sirve |
|---|---|
| `fuente` | Los sistemas de origen, con quién entrega cada archivo. Se cargan `his_minsa`, `sinadef_hrl` y `sinadef_verificado`; las otras 15 están para decir qué le falta a cada ficha |
| `lote_carga` | Cada archivo cargado: nombre, huella, filas, quién |
| `lote_mes` | Qué meses trajo cada archivo y cuál es la carga vigente de cada mes |
| `his_atencion` | La trama del HIS, con sus 57 columnas |
| `sinadef_defuncion` | Los certificados de SINADEF, anulados incluidos |
| `defuncion_verificada` | Defunciones confirmadas a mano en SINADEF nacional |

**`desempeno`**: lo calculado.

| Tabla | Para qué sirve |
|---|---|
| `ficha` | Catálogo de las 34 fichas, con nombre corto, dimensión y si aplica al hospital |
| `dimension` | Agrupación de las fichas por tema (propuesta del hospital, no de MINSA) |
| `ficha_fuente` | Qué fuentes alimentan a cada ficha |
| `corrida` | Cada cálculo: fecha de corte, quién, cuándo y con qué archivos |
| `resultado_mensual` | Numerador y denominador de cada mes |
| `resultado_paciente` | Cada persona evaluada, con su diagnóstico, su tratamiento, el registro por corregir si lo hay y, si quedó fuera, el motivo |
| `referencia_minsa` | Lo publicado por MINSA. Sus cifras sirven para comparar; su fecha de corte, para calcular |
| `seguimiento_caso` | Qué se está haciendo con cada caso que todavía puede sumar |
| `script_aplicado` | Qué scripts de `bd/desempeno/` tiene la base |

---

## 7. Reglas

**De la carga**

- Un mes tiene una sola carga vigente. Repetir una carga no duplica.
- Un archivo más nuevo del mismo mes reemplaza el mes entero.
- Un archivo más antiguo, o con menos filas, se rechaza salvo `--forzar`.
- Si el archivo tiene un problema, no se guarda ninguna fila.
- Los datos se guardan tal como vienen; los filtros se aplican al calcular.

**Del cálculo**

- La fecha de corte vale para los meses ya terminados ese día: solo cuentan lo
  registrado hasta entonces, como en el reporte de MINSA. Los meses siguientes
  se calculan con todo lo cargado.
- Cada cálculo es una corrida nueva; las anteriores no se pisan.
- Si falta cargar un mes del HIS, no calcula.
- La fecha de corte es la del último reporte de MINSA registrado
  (`referencia_minsa`).
- Después de cada carga desde el tablero, se recalcula solo; si los datos no
  cambiaron, no se repite el cálculo.
- Un tratamiento dentro del plazo que no cumple la regla (le falta el «R» del
  cáncer en su cita, no es «D» o no tiene «1» en Valor_Lab) no suma: queda
  «por corregir», y se avisa mientras el HIS de ese mes acepte correcciones.
- Las reglas de la Ficha 14 se trajeron del proyecto `indicadores_desemp`,
  fuera de este repositorio. Si una cambia allá, se cambia en `ficha_14.py`, se
  sube su `VERSION` y se comparan los dos resultados.

**Del tablero**

- Lo ven Estadística (`revisor`) y el superadministrador: permiso
  `desempeno.ver`. Solo el superadministrador sube datos, registra lo de MINSA,
  cambia las fuentes de una ficha y anota el seguimiento de los casos:
  `desempeno.cargar`.
- Muestra siempre la última corrida de cada ficha y año.
- Un mes es «oficial» si lo calculó el corte de MINSA, «consolidado» si sus
  fuentes se cargaron después del cierre del HIS, «por cerrar» si le faltan
  datos posteriores (3b) y «preliminar» si su HIS todavía se corrige.
- Una ficha calcula solo cuando todas sus fuentes se pueden cargar; mientras
  falte una, queda sin resultado, no en cero.

**De los datos de pacientes**

- Los archivos de datos no se copian al repositorio.
- No se pegan filas reales en un commit, una prueba, un issue o un chat.
- No se comparten respaldos ni volcados de una base con datos cargados.
- Las filas de pacientes no van a la bitácora (`auditoria.registro_cambio`);
  sí van cada archivo cargado y cada corrida.

---

## 8. Trazabilidad

De una atención al archivo y la línea de donde salió:

```sql
SELECT h.id_cita, h.fecha_atencion, h.codigo_item, l.nombre_archivo, h.fila_archivo
  FROM fuente.his_atencion h
  JOIN fuente.lote_mes m   ON m.id = h.lote_mes_id
  JOIN fuente.lote_carga l ON l.id = m.lote_carga_id
 WHERE h.numero_documento_paciente = '<documento>'
 ORDER BY h.fecha_atencion;
```

Las cargas de un mes, también las reemplazadas:

```sql
SELECT m.anio, m.mes, m.filas, m.es_vigente, l.nombre_archivo, l.fecha_extraccion, m.fecha_creacion
  FROM fuente.lote_mes m JOIN fuente.lote_carga l ON l.id = m.lote_carga_id
 WHERE m.anio = 2026 AND m.mes = 8
 ORDER BY m.id;
```

Con qué archivos se calculó una corrida:

```sql
SELECT detalle FROM desempeno.corrida WHERE id = <corrida>;
```

---

## 9. Si algo sale mal

| Mensaje | Qué hacer |
|---|---|
| El menú «Indicadores de desempeño» no aparece | Correr `npm run desempeno` (1.3) y volver a iniciar sesión. Con una cuenta que no sea de Estadística ni superadministrador no aparece |
| El tablero dice «Ninguna de las 34 fichas tiene resultado» | No es un error: el módulo está levantado y faltan los datos (1.4) |
| `Falta la carpeta de datos` | Pasar la ruta a la carga completa: `python -m app.herramientas.preparar_desempeno "<DATOS>"` |
| `No se empezó. En la carpeta de datos: …` | Falta un archivo o tiene otro nombre: ver 1.4 |
| `A este entorno le faltan dependencias` · `No module named 'xlrd'` | `npm run instalar` |
| `La base no tiene el esquema de Alejandro` | Instalar `avance_04`: `servidor/api/README.md` |
| `La base no tiene la fuente «his_minsa»` | Crear las tablas: comando 1 |
| `quedó a medias` | `bd/desempeno/README.md`, «Desinstalar», y empezar de nuevo |
| `no tiene las 57 columnas de la trama del HIS` | El archivo no es una trama nominal |
| `línea N: tiene X columnas y deben ser 57` | El archivo está dañado: volver a extraerlo |
| `este archivo se extrajo el …, antes que el ya cargado` | Es una versión antigua del mes: no cargarla |
| `trae N filas y lo ya cargado tiene M` | Revisar si está incompleto. `--forzar` si es el correcto |
| `no trae ninguna fila entre … y …` | Revisar `--desde` y `--hasta` |
| `el título no dice qué fechas cubre` | El `.xls` no es el reporte mensual de SINADEF |
| `No está cargado enero de … del HIS MINSA` | Cargar el HIS de ese año |
| `está cargado sin huecos solo hasta el …` | Falta un mes: `ver_fuentes` dice cuál |
| `ATENCIÓN: SINADEF está cargado hasta …` | Cargar los reportes de SINADEF que faltan y correr de nuevo |
| `no tiene fecha de defunción` | Corregir esa fila del reporte y volver a cargarlo |
| `La ficha N aún no tiene cálculo` | Solo la 14 está calculada |
| `Su cuenta no tiene acceso a los indicadores de desempeño` | La cuenta no es de Estadística ni superadministrador, o entró antes de instalar el módulo: salir y volver a entrar |
| `pesa más de 60 MB` | Por el tablero van las tramas mensuales; el consolidado se carga con el comando 2 |

---

## 10. Pruebas y pendientes

```powershell
cd servidor
npm run prueba
```

Usa una base aparte (`DATABASE_URL_PRUEBAS`) que se reinstala sola. No toca la
base de desarrollo.

Pendiente:

1. Pasar al kit los gráficos de `paneles/desempeno/graficos.jsx` si otro
   sistema del hospital los necesita.
2. El reporte oficial de MINSA de agosto y su fecha de corte: hoy agosto está
   registrado sin documento.
3. Instalar en el servidor del hospital: la imagen de Docker de la API ya incluye `bd/`, listo para ejecutar con `docker compose exec api python -m app.herramientas.instalar_desempeno`.
4. Retirar un lote o una corrida, y volver a una versión anterior de un mes: hoy
   lo reemplazado no se guarda, así que se vuelve cargando el archivo anterior.
5. Las otras 33 fichas: un archivo por ficha en `app/dominio/desempeno/` y una
   entrada en `CALCULOS` de `app/servicios/desempeno.py` (y su meta en
   `app/servicios/tablero.py`).
