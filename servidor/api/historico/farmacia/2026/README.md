# Histórico de Farmacia 2026

Los **nueve informes en Word** que Farmacia entregó de enero a setiembre de
2026, tal como los redacta Control y Archivo (`01 INFORME MES DE ENERO
2026.docx` … `02 INFORME MES DE SETIEMBRE 2026.docx`). Son los originales: no
traen datos de pacientes (se revisó el 27/10/2026). Basta con que el nombre
diga el mes; el bot comprueba además el mes del **asunto**, así que un archivo
mal nombrado no puede quedar en otro mes.

`preparar_base` activa `FAR-W1` y los carga al arrancar la API
(`HISTORICOS`). Un mes que ya tenga reporte, o que se eliminó a propósito, no
se toca.

## Tres meses se entregan con lo que el original no permite corregir

Seis informes cuadran. Tres traen errores **del área**, no del lector. Se
decidió (27/10/2026) entregarlos sin inventar ninguna cifra: lo que el informe
permite corregir se corrige, y lo demás se entrega como llegó, con cada
inconsistencia documentada en su hallazgo (`cargar_historico
--documentar-errores`, `HISTORICOS` en `preparar_base`).

| Mes | Qué pasa | Cómo se entrega |
|---|---|---|
| Marzo | Las consultas por turno del Formato 3 suman 2 515 (1 600 + 915) y la consulta externa SIS dice 2 424, cifra que se repite en cinco lugares | Como llegó, con la inconsistencia documentada |
| Julio | El resumen está pegado como **imagen** (un EMF): el bot lee su texto, sin OCR (SIS 18 207, total 23 143). El cuadro de Sala de Operaciones y Consultorios externos es, casilla por casilla, el de **junio** | **Esta es una copia corregida**: el total del pie decía 23 439 (el de junio) y dice 23 143, la suma. El cuadro copiado de junio se entrega como llegó, documentado: no son las cifras de julio |
| Setiembre | Como marzo: 2 585 (1 441 + 1 144) contra 2 528 | Como llegó, documentado |

El original de julio, sin corregir, está en la carpeta del equipo
(«farmacia-data-historica»).

Los informes son documentos del hospital, como los Excel de
`historico/nutricion/`. Se versionan aquí para que **todas** las bases (la del
servidor, la de cada integrante) tengan los mismos meses sin subirlos a mano.
