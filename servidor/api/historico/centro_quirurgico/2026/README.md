# Histórico de Centro Quirúrgico 2026

Los ocho libros mensuales (enero a agosto) que el área entregó antes del
sistema, con el nombre que traen: `1 ESTADISTICA ENERO 2026.xlsx` …
`8 ESTADISTICA AGOSTO 2026.xlsx`. `preparar_base` los carga al arrancar la API
(`HISTORICOS`, formato `CQX`). Un mes que ya tenga reporte, o que se eliminó a
propósito, no se toca.

## No son los originales: van sin datos de pacientes

Los libros del área traen las listas nominales de cirugías (`CX PROGRAMADAS`,
`CX EMERGENCIA`): nombre, DNI, historia clínica y diagnóstico de cada paciente.
Eso no se versiona. Aquí está una copia que conserva **intactas** las cinco
hojas que lee el bot (`RESUMEN`, `CUADRO DE INDICADORES`/`INDICADORES`,
`SUSPENDIDAS`, `CIRUGIA MAYOR`, `CIRUGIA MENOR`) y vacía las demás. Además quita
el texto de los comentarios, la copia guardada de los vínculos a otros libros y
`calcChain.xml`.

Se comprobó el 27/10/2026, mes por mes:

- el bot lee de la copia **los mismos datos y los mismos hallazgos** que del
  original;
- ningún DNI, historia clínica ni nombre completo de las hojas nominales queda
  en ningún archivo de la copia.

Como la copia no es el mismo archivo, su huella SHA-256 no es la del original.
Si alguna base ya tiene un mes cargado desde el original, `inventario
--comparar` lo marca `≠`: es el mismo mes con otro archivo, no otra cifra.

## Correcciones al cargar

`preparar_base` corrige dos meses en la copia que sube, sin tocar el archivo:

| Mes | Celda | Escrito | Se carga | Por qué |
|---|---|---|---|---|
| Enero | `CIRUGIA MAYOR` C5 | 105 | 113 | El total de Cirugía general no suma todos sus procedimientos |
| Enero | `CIRUGIA MENOR` C18 | 6 | 4 | El total de Obstetricia no es la suma de sus procedimientos |
| Mayo | `SUSPENDIDAS` D12 | (vacío) | 0 | Falta de instrumental: sin suspensiones por esa causa |

Cada corrección queda escrita en la observación y en el historial del reporte.

## Abril

El libro de abril pesa 61 MB por las imágenes pegadas y el bot lo rechaza por
tamaño. Aquí va su versión «liviana», que el área preparó sin las imágenes: sus
cinco hojas leídas tienen los mismos valores que las del libro pesado
(comprobado el 27/10/2026).
