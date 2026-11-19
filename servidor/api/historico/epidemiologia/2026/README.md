# Histórico de Epidemiología 2026

Los **nueve oficios de vigilancia** que la Oficina de Epidemiología envió a
Estadística de enero a setiembre de 2026 (`Enero.docx` … `Septiembre.docx`).
Cada uno trae una sola tabla: casos nuevos de infecciones intrahospitalarias
por grupo de edad, servicio y sexo. Son cuentas, no hay datos de pacientes
(se revisó el 27/10/2026).

`preparar_base` activa `EPI-W1` y los carga al arrancar la API
(`HISTORICOS`). Los nueve cuadran: la fila TOTAL coincide con la suma de sus
grupos de edad, columna por columna, y se entregan.

El área deja en blanco las celdas sin casos y escribe 0 solo en la fila TOTAL:
el bot lee esos blancos como 0 y lo informa.
