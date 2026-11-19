# Bot validador

Componente del Sistema de Reporte Estadístico que **lee el Excel (o el Word)
que sube un área, lo valida y devuelve un informe**. Es aparte del frontend: tiene su
propio código, sus pruebas y su servidor HTTP, y no depende de nada del
sistema. El frontend solo le habla a través de un cliente
(`frontend/src/app/servicios/bot-validador.js`).

Hoy sabe leer el reporte de **Nutrición y Dietética** y el de **Laboratorio**
(Patología Clínica y Anatomía Patológica: un libro por año con una hoja por mes,
del que lee la del mes que se reporta; ver `areas/laboratorio/definicion.js`)
y el de **Farmacia**, que no es un Excel sino el **informe mensual en Word**
que redacta el área de Control y Archivo (§ 3.5), el de **Lavandería** y el de
**Centro Quirúrgico** (su libro del mes, acumulado: § 3.6), y el oficio en
Word de **Epidemiología** (§ 3.7) y de **Diagnóstico por Imágenes** (§ 3.8).
Agregar otra área es
agregar una carpeta (ver «Agregar un área»).

Sin dependencias: Node 20 o superior y nada más.

```bash
cd servidor/bot-validador
npm start        # servicio en http://localhost:8787 (PUERTO=… para cambiarlo)
npm run prueba   # prueba de punta a punta, incluido el servidor
```

Junto con la API se levanta desde `servidor/` con `npm run dev` (ver
[`../README.md`](../README.md)).

---

## 1. Qué problema resuelve

Las áreas ya llevan su reporte mensual en Excel, lo imprimen y Estadística lo
vuelve a digitar. El bot elimina esa segunda digitación: el área sube su
Excel, el bot extrae las cifras y comprueba que el reporte sea coherente
**antes** de que salga del área. Estadística no devuelve reportes con
observaciones (CONTEXTO.md § 3). Por eso el control tiene que estar en el
momento de subir el archivo.

## 2. Dónde está en el sistema

```
                    ┌──────────────────────────── frontend ─────────────────────────────┐
  Área ── sube .xlsx ─▶ Reporte del mes ──▶ servicios/bot-validador.js (cliente)          │
                    │                          │                                         │
                    │           ┌──────────────┴───────────────┐                         │
                    │     modo servicio                   modo embebido                  │
                    │   (VITE_BOT_URL definida)          (prototipo, sin VITE_BOT_URL)   │
                    └───────────┼──────────────────────────────┼─────────────────────────┘
                                ▼ HTTP                          ▼ import
                    ┌──────────────────────── servidor/bot-validador ─────────────────────────────┐
                    │  servidor.js ──▶ motor.js ──▶ xlsx.js (ZIP + XML)                   │
                    │                     │                                               │
                    │                     └──▶ areas/<área>/  definición · plantilla ·    │
                    │                                         cálculos · reglas           │
                    └─────────────────────────────────────────────────────────────────────┘
```

- **Modo servicio.** Si el frontend arranca con `VITE_BOT_URL=http://localhost:8787`,
  cada validación es una petición HTTP al bot. Es la forma de producción.
- **Modo embebido.** Sin esa variable, el frontend importa el mismo `motor.js`
  y lo ejecuta en el navegador. Existe para que el prototipo se pueda mostrar
  sin levantar un segundo proceso. Corre el mismo código, no una copia, y la
  pantalla de validación indica en qué modo corrió.

El sistema también toma del bot la **definición** del reporte (cuadros y
filas) y sus **reglas**, para que la hoja, el visor de Estadística y el bot
digan siempre lo mismo. Nada de eso se duplica en el frontend.

## 3. Cómo lee un documento

El bot lee **el Excel que el área ya llena cada mes** (versión `NUT-2`, desde
el 05/10/2026). No hace falta una plantilla del sistema: reconoce el libro por
sus hojas, el mes por el título y cada fila por sus rótulos. La plantilla
anterior (`NUT-1`, con nombres definidos y una hoja oculta) se retiró.

### 3.1 El Excel oficial de Nutrición

Cuatro hojas visibles (los nombres reales traen espacios de más; se comparan
sin ellos). Las siete ocultas (Cirugía, Pediatría…) quedaron de una plantilla
de 2020 y no se leen.

| Hoja | Cuadro | Fila de los días |
|---|---|---|
| COMENSALES EMERG | f2 · Dirección General, Patrimonio, Residuos Sólidos, Dpto. de Nutrición | 4 |
| COMENSALES HOSP | f1 · Asistencial y administrativo e internos | 4 |
| PACIENTES EMERG | f4 · Pacientes SIS | 3 |
| PACIENTES HOSP | f3 · Dieta completa, blanda, licuada y líquida | 3 |

`oficial.js` hace el trabajo; `definicion.js` dice el rótulo de cada grupo y
sus variantes. Lo que cambia de un mes a otro, comprobado en los nueve meses de
2026, y cómo se resuelve:

| En el Excel | El bot |
|---|---|
| La columna TOTAL se mueve (AE, AG o AH) | Los días van de la C a la columna anterior a «TOTAL» |
| Un encabezado de día mal escrito (agosto: el día 31 dice 178) | Lo lee por su lugar e informa |
| Un grupo que no está ese mes (Patrimonio fuera de abril, Internos de Nutrición antes de mayo) | Sus filas quedan en `datos.ausentes`: no aplican, no son casillas vacías |
| «PATRIMONIO» con una sola fila (abril) | Grupo de la emergencia con desayuno y almuerzo; el desayuno de ese mes, ausente |
| «INT ENF UNSM» junto a «INT. ENF UNSM» (enero a abril) | El primero es Obstetricia mal rotulado; se corrige e informa |
| «COMIDA» en los internos | Es la cena |
| Una fila con cifras y sin rótulos (setiembre, pacientes SIS) | Se lee por su lugar y sale un aviso que pide confirmarlo |
| Un rótulo que no es del reporte | Error: sus cifras no se pueden cargar |
| Una casilla con texto (febrero: «18+») | Error: no se suma en silencio |

El formato en blanco que el área descarga (`GET /areas/nutricion/plantilla?periodo=2026-08`)
es ese mismo libro, con el mes en el título y sin las hojas de 2020: se lee con
el mismo lector, y pegar las cifras desde el archivo propio funciona.

**El consolidado anual** (el TOTAL del área) lo arma `consolidado.js` con los
totales de los meses entregados: comensales y pacientes, hospitalización y
emergencia, por mes, con el acumulado. Un mes sin reporte queda vacío; la meta
sin registrar dice «Meta no definida».

### 3.5 El informe de Farmacia, en Word

Farmacia entrega un Word con su oficio y sus cuadros
(`01_INFORME_MES_DE_ENERO_2026.docx` es el modelo). Un .docx es también un ZIP
con XML: `docx.js` reutiliza el ZIP de `xlsx.js` y saca los párrafos y las
tablas, celda por celda. Un Word 97-2003 (`.doc`, como el cuadro de
Nefrología) lo lee `doc.js` y sale con la misma forma: ningún lector de área
distingue uno de otro. La corrección guiada de un `.doc` devuelve un `.docx`.
`areas/farmacia/lector.js` hace el resto:

| En el Word | El bot |
|---|---|
| «Asunto : Informe Mensual de Enero 2026» | Es el mes del informe. Si no es el del reporte abierto, se bloquea |
| «Resumen Total de Recetas Atendidas» | SIS por servicio a la izquierda y otras atenciones a la derecha, cada cifra por su rótulo |
| Hemodiálisis y oncología partidas en «Const. Ext» y «Hospitaliza» | Se suman e informa |
| «Total de recetas atendidas por las unidades de farmacia» y «ATENCIONES MES …» | Repiten cifras del resumen: se comparan (`totales`) |
| El cuadro del mes anterior | Se informa; no se carga |
| La tabla MATER · GINEC · CIRU · MEDI · PEDIA · … · CONSULTAS EXTERNAS · CONVENIOS | Cuatro filas sin rótulo y una de totales, por la columna de su encabezado |
| «ENERO 2024», «DICIEMBRE - 2023», número de informe «-2025» en el informe de enero de 2026 | Aviso `rotulos`: no cambia cifras, pero el impreso queda mal |
| Gráficos incrustados | No se leen: son copia de los cuadros |

El formato que descarga el área (`GET /areas/farmacia/plantilla?periodo=…`) es
un Word con los mismos cuadros y rótulos, sin membrete ni gráficos. Las reglas
R1 a R10 son las de `Documentacion_Modulo_Farmacia_HRL` y las usa también el
formulario del sistema (`frontend/src/app/datos/formatos/farmacia-calculos.js`
las reexporta).

### 3.6 El libro de Centro Quirúrgico

Centro Quirúrgico lleva **un libro por mes, acumulado**: cada hoja tiene una
columna por mes (ENE…DIC, con trimestres y semestres entre ellos) llena hasta
el mes del libro. Revisados los ocho de enero a agosto de 2026
(`areas/centro-quirurgico/definicion.js`). El bot lee la columna del mes de
cinco hojas y no toca las demás (CX PROGRAMADAS y CX EMERGENCIA, el registro
paciente por paciente; TOP TEEN, Consolidado, IQMayores, IQMenores…):

| Hoja | Cuadro | Cómo se lee |
|---|---|---|
| RESUMEN | `resumen` | La pareja de columnas del mes (programada y emergencia), por su nombre largo (JUNIO) |
| CUADRO DE INDICADORES (en enero, INDICADORES) | `indicadores` | La tabla izquierda; la derecha se calcula |
| SUSPENDIDAS | `suspendidas` | La columna NÚMERO; su título dice el mes y el año |
| CIRUGIA MAYOR · CIRUGIA MENOR | `mayor` · `menor` | Cada especialidad y sus procedimientos, en la columna del mes (ENE…DIC) |

| En el libro | El bot |
|---|---|
| El libro de otro mes (trae llena otra columna) | Bloquea, por el título de SUSPENDIDAS («… - JUNIO 2026») |
| La columna del mes se corre por los trimestres | La busca por su cabecera, no por su letra |
| Más de 90 procedimientos aparecen y desaparecen de enero a agosto | Lee los que el mes traiga, sin catálogo: viajan en `datos.procedimientos`; la base guarda el total de cada especialidad |
| Un blanco en la columna del mes de un procedimiento | Es 0, como lo suma el SUM del área |
| El total de una especialidad que no suma sus procedimientos (enero: cirugía general mayor y obstetricia menor) | Error `subtotales`; la especialidad vale la suma |
| Una fila en mayúsculas con una suma, que no es una especialidad del catálogo | Error `especialidad-no-catalogada`: no se suma a la anterior |
| El RESUMEN, el cuadro de indicadores y las causas no coinciden entre sí (casi todos los meses) | Un aviso por cruce (`cruce-resumen`, `cruce-indicadores`, `cruce-suspendidas`), con todas sus diferencias |
| Las horas traen ruido de coma flotante (38.749999999999979) | Se redondean a centésimas |
| Abril de 2026 pesa 54 MB (CX PROGRAMADAS con formato hasta la fila un millón) | Se rechaza por su peso, y el mensaje dice cómo achicarlo |

Tres de los ocho reportes del área no se leen: se calculan con los cinco
cuadros (`calculos.js`): el Top Ten, el consolidado por especialidad y la tabla
derecha de indicadores. La producción del mes sale del RESUMEN; `paraDiresa`
la entrega a los indicadores 12, 13, 14 y 22 de DIRESA y al boletín, con las
programadas como electivas más suspendidas. El consolidado anual
(`consolidado.js`) es el reporte 1 del área con los doce meses, más el
consolidado por especialidad y el Top Ten del año.

### 3.7 El oficio de Epidemiología, en Word

Una sola tabla, la misma en los nueve oficios de 2026: quince grupos de edad
en filas; Neonatología, UCI, Gineco-Obstetricia, ITU, IHO, muerte neonatal,
muerte materna y otras infecciones en columnas, por sexo (14 columnas), y la
fila TOTAL (`areas/epidemiologia/`).

| En el Word | El bot |
|---|---|
| «MES: Enero-26», «MES: mar-26», «MES: FEBRERO 2026» | Es el mes del oficio; si no es el del reporte, se bloquea |
| Un grupo sin casos, en blanco | Es 0 (así lo suma la fila TOTAL) y se informa |
| La fila TOTAL | Se compara, columna por columna (`totales`, error) |
| Muerte neonatal fuera de «Menor de 1 año» | Error: es del primer mes de vida |
| Neonatología fuera del primer año, muerte materna fuera de 10–54, Gineco-Obstetricia menor de 10 | Aviso: raro, puede ser una fila equivocada |
| Las dos columnas de muertes | Se registran, pero no suman a las infecciones (indicador 16 de DIRESA) |

La comparación con el mes anterior es la del área (`variacion` en
`areas/index.js`): con diez casos al mes un 20 % es ruido, así que se avisa un
**posible brote** cuando las infecciones duplican las del mes anterior y suben
en cinco o más.

### 3.8 El oficio de Diagnóstico por Imágenes, en Word

Las cuatro hojas del oficio, como tablas pequeñas una tras otra, en el mismo
orden los nueve meses de 2026 (`areas/imagenes/lector.js`): Rayos X (detalle,
tecnólogos con particulares y monto, lectura), tomografía (totales, SIS,
convenios, pagados, monto, informadas y la nota del tomógrafo inoperativo),
mamografía (totales, matriz, campaña, monto, lectura) y ecografía (una fila
por médico, con biopsias y procedimientos oncológicos). Las tablas se
reconocen por su contenido y en ese orden; cada cifra, por su rótulo.

| En el Word | El bot |
|---|---|
| EXAM de cada médico | Se compara con sus nueve casillas (error `totales`) |
| La fila T O T A L | Se compara con la suma de los médicos (con sus EXAM escritas) |
| TOTAL EXAMENES de tomografía y mamografía (con la campaña) | Se compara con su matriz |
| EXAMENES ATENDIDOS de Rayos X | Se compara con hospitalización + emergencia + consulta externa |
| Los exámenes por tecnólogo | Deben sumar los atendidos (error `tecnologos`); Dr. Mochi busca la fila que lo explica |
| «S/. 4 ,549.50», «S/.0000», «S/. .00» | Importes legibles; «S/.1 16500» no se adivina |
| Médicos y tecnólogos que cambian de un mes a otro | Se leen los que traiga; la base guarda los totales por modalidad (`eco`, `tac`, `mam`, `rx`) y el detalle viaja en el informe |

Cada tabla del Word es una «hoja» de la corrección guiada con su número
(«Rayos X · tabla 2»): una hoja del oficio son varias tablas.

### 3.9 Lo que se pega como imagen

Un cuadro de Excel pegado en Word «como imagen» queda como un dibujo EMF, que
guarda cada texto con su posición (`emf.js`): se lee sin OCR. Farmacia lo usa
cuando su resumen no es una tabla (julio de 2026) y lo avisa
(`resumen-imagen`); lo leído de una imagen no se corrige desde el sistema,
porque no hay celda que parchar.

### 3.2 Paso a paso

Lo hace `motor.js → validarArchivo()`:

1. **Abrir.** Un `.xlsx` es un ZIP con archivos XML. `xlsx.js` busca el
   directorio central del ZIP, ubica `xl/workbook.xml` (hojas y nombres
   definidos), `xl/_rels/workbook.xml.rels` (qué archivo es cada hoja) y
   `xl/sharedStrings.xml` (los textos, que Excel guarda aparte). Descomprime
   solo lo que necesita, con `DecompressionStream`, que viene con Node y con
   los navegadores. Si no es un ZIP, se bloquea: «El archivo no se pudo abrir
   como Excel».
2. **Reconocer.** El área reconoce su libro (`reconocer()` de cada área): para
   Nutrición, sus cuatro hojas, el mes del título y los días de cada hoja. Si
   falta una hoja, si es de otro mes o no se encuentra la fila de los días, se
   bloquea. **Nada se carga a medias**: el informe trae `bloqueo` y ninguna cifra.
3. **Leer.** El lector del área recorre las filas por sus rótulos. Lo que
   decide por su cuenta (una fila leída por su lugar, un rótulo corregido) va
   en `datos.lectura` y las reglas lo convierten en aviso o información. Cada
   casilla pasa por `comoNumero()`:

   | En la casilla | Resultado |
   |---|---|
   | Un número | Ese número |
   | Texto con forma de número (`"171"`, `"1 234"`) | El número. Pasa cuando la columna tiene formato de texto |
   | Vacía | `null`: «no se registró», que no es cero |
   | Otro texto (`"4O"`, `"cuarenta"`) o un error de Excel (`#REF!`) | Ilegible. Se guarda el texto original para mostrárselo al área |

   También lee los **totales escritos** del Excel (el de cada fila y el del
   cuadro). No los usa como dato: sirven para comprobar que el archivo es
   coherente consigo mismo.
4. **Validar.** Aplica las reglas del área (§ 4) y la comparación con el mes
   anterior.

Además registra, por cada fila, **de qué hoja, fila y columna salió** (el
linaje). La hoja del sistema lo muestra al pararse en una casilla: «Leído del
archivo: hoja Pacientes emergencia, celda E6». Y guarda la **huella SHA-256**
del archivo como constancia de qué se subió exactamente.

### 3.3 Fórmulas

El bot **no calcula fórmulas**. Lee el valor que Excel o LibreOffice guardaron
al grabar el archivo, que es lo que el área veía en pantalla. Por eso no
confía en los totales: vuelve a sumar los días y compara. Un total tecleado
encima de la fórmula, o una fila que no suma, es un error.

### 3.4 Lo que no lee

- `.xls` (Excel 97-2003): hay que guardarlo como `.xlsx`. Lo mismo `.doc`
  (Word antiguo): hay que guardarlo como `.docx`.
- PDF u fotos del oficio: haría falta OCR, y con cifras de salud un OCR se
  equivoca en silencio (un 8 leído como 3). Ver «Pendiente».
- Un Excel con otra estructura que la del área (otras hojas, otros rótulos): el
  bot no adivina. Lo que no reconoce, lo dice.
- Macros: no se ejecuta nada del archivo, solo se lee su XML.

## 4. Reglas

Tres niveles:

| Nivel | Efecto |
|---|---|
| **error** | Impide enviar. Se corrige en la hoja del sistema o en el Excel |
| **aviso** | Se puede enviar, pero exige una justificación escrita que lee Estadística |
| **info** | Se informa y no exige nada |

Reglas de Nutrición (`areas/nutricion/reglas.js`):

| Regla | Nivel | Qué comprueba |
|---|---|---|
| `incompleto` | error | Todas las casillas de todos los días tienen dato. Un día sin servicio se anota 0 |
| `no-numerico` | error | Ninguna casilla es ilegible |
| `entero` | error | Raciones enteras y sin signo |
| `totales` | error | Los totales escritos en el Excel coinciden con la suma de los días |
| `atipico` | aviso | Un día que triplica la mediana de su fila y la supera en 15 o más (con el oficio de junio: las 100 raciones de dieta líquida del día 21) |
| `filas-iguales` | info | Dos comidas del mismo grupo con las mismas cifras todo el mes (desayuno y cena del personal asistencial en junio) |
| `variacion` | aviso | Un cuadro que varía más de 20 % frente al mes anterior (pacientes de emergencia en junio: −24 %) |

Los atípicos solo se buscan hacia arriba: los ceros de domingos y feriados son
habituales (internos, Dirección General) y no son errores.

## 5. Contrato HTTP

`src/servidor.js`, sobre `node:http`. Permite CORS (`BOT_ORIGEN` lo restringe).

| Método y ruta | Entrada | Salida |
|---|---|---|
| `GET /salud` | — | `{ ok, bot, areas }` |
| `GET /areas/:area/reglas` | — | `{ area, reglas }` |
| `GET /areas/:area/plantilla?periodo=AAAA-MM` | — | El `.xlsx` |
| `POST /validaciones` | `{ area, periodo, nombre, archivo (base64), anterior? }` | Informe |
| `POST /validaciones/datos` | `{ area, periodo, datos, anterior? }` | Informe |

El archivo viaja en base64 dentro del JSON: una sola forma de petición, fácil
de probar con `curl`. Límite: 5 MB (una plantilla llena pesa unos 80 kB).

`anterior` es `{ periodo, datos }` del último mes enviado. Lo manda quien
llama porque el bot no guarda nada.

### Informe

```jsonc
{
  "bot": { "nombre": "Bot validador", "version": "0.3.0" },
  "fecha": "2026-09-13T12:00",
  "area": "nutricion", "periodo": "2026-08",
  "archivo": { "nombre": "…xlsx", "tamano": 82311, "huella": "42ba46…" },
  "plantilla": { "area": "nutricion", "periodo": "2026-08", "version": "NUT-1" },
  "leidas": 1116,
  "datos": { "f1": { "asistencial.desayuno": [144, 148, …] }, "declarados": {…}, "ilegibles": {…} },
  "origen": { "f3|liquida.cena": { "hoja": "Pacientes hospitalización", "fila": 16, "columna": "C" } },
  "errores": [{ "id": "totales", "formato": "f1", "fila": "asistencial.almuerzo", "titulo": "…", "detalle": "…" }],
  "avisos":  [{ "id": "atipico|f3|completa.almuerzo|12", "regla": "atipico", "dia": 12, … }],
  "info":    [],
  "reglas":  [{ "id": "incompleto", "nivel": "error", "texto": "…", "estado": "ok" }]
}
```

Si el archivo no se puede usar, en lugar de `datos`, `errores`… viene
`"bloqueo": { "id", "titulo", "detalle" }` con qué hacer.

## 6. Agregar un área

1. Crear `src/areas/<área>/` con:
   - `definicion.js`: cuadros, filas y columnas del oficio.
   - `plantilla.js`: `crearPlantilla(periodo, datos?)`, `leerCifras(libro)`,
     `nombreDeArchivo(periodo)`, `VERSION_PLANTILLA`. La hoja oculta usa los
     nombres de `src/plantillas.js`.
   - `calculos.js` y `reglas.js`: `validar(datos, periodo)` → `{ errores, avisos, info }` y `REGLAS`.
2. Registrarla en `src/areas/index.js`.
3. Agregar sus casos a `pruebas/prueba.mjs`.

Si la estructura del oficio cambia, se sube la versión de la plantilla. Las
plantillas viejas se rechazan con un mensaje que pide descargar la nueva.

## 7. Pendiente

- **Historial propio.** Hoy quien llama manda el mes anterior. En producción
  el bot lo consultaría a la API del sistema y guardaría cada informe con su
  huella.
- **Autenticación** entre el sistema y el bot.
- **Colas.** Validar una plantilla toma milisegundos; si algún día se leen
  PDF con OCR, habrá que procesar en segundo plano.
- **OCR del oficio escaneado**, para digitalizar los meses pasados. Siempre con
  revisión humana, nunca como carga directa.
