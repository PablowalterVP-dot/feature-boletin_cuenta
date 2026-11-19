# Histórico de Diagnóstico por Imágenes 2026

Los **nueve oficios** que el Departamento de Diagnóstico por Imágenes envió de
enero a setiembre de 2026 (`Enero.docx` … `Septiembre.docx`), con sus cuatro
hojas: Rayos X, tomografía, mamografía y ecografía. Traen los nombres del
personal (médicos y tecnólogos) con su producción del mes, como el oficio en
papel; no traen datos de pacientes (se revisó el 27/10/2026).

`preparar_base` activa `DXI-W1` y los carga al arrancar la API
(`HISTORICOS`). Un mes que ya tenga reporte, o que se eliminó a propósito, no
se toca.

## Correcciones y lo que se entrega documentado

Junio y julio cuadran. Los otros siete traen errores **del área** (cotejados
a mano). Se decidió (27/10/2026): cada total que el oficio escribe pasa a ser
la suma de sus casillas (las casillas son el dato), y lo que el oficio no
permite atribuir a una cifra se entrega como llegó, documentado en su
hallazgo (`--documentar-errores`). Enero, febrero, marzo, mayo y setiembre
**son copias corregidas**; los originales están en la carpeta del equipo
(«Data_historica_DxI»).

| Mes | Corregido (era → es) | Entregado documentado |
|---|---|---|
| Enero | EXAM de Dr. Canelo 136 → 133 y de Dr. Isern 245 → 241; T O T A L 805 → 798 | Tecnólogos 1 429, atendidos 1 340 |
| Febrero | EXAM de Dr. Canelo 166 → 160 y de Dr. Isern 218 → 214; T O T A L 984 → 974 | Dr. Canelo: 165 pacientes y 160 exámenes |
| Marzo | EXAM de Dr. Sibina 413 → 414; T O T A L 1 150 → 1 151 | — |
| Abril | — (el original, sin tocar) | EXAM de tres médicos muy por encima de sus casillas (331 y 129, 166 y 49, 411 y 160), con más pacientes que exámenes; tecnólogos 1 439 y atendidos 1 442 |
| Mayo | EXAM de Dr. Canelo 298 → 294; T O T A L 910 → 906 | Tecnólogos 1 381, atendidos 1 385 |
| Agosto | — | Tecnólogos 1 358, atendidos 1 365 |
| Setiembre | La fila T O T A L de ecografía, que no incluía a Dr. Ruiz Garay: EXAM 1 042 → 1 090, pacientes 893 → 962, SIS C. ext. 477 → 556, SIS Emer. 273 → 236, SIS Hosp. 208 → 226, Convenios C. ext. 55 → 38 | — |

Avisos que se confirman al enviar: el total en soles de ecografía de junio
(«S/.1 16500») no se puede leer sin adivinar; el de setiembre dice S/ 1 530 y
los médicos suman S/ 1 660.
