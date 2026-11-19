/* Estructura del reporte de Patología Clínica y Anatomía Patológica
   (Laboratorio): sus secciones, exámenes y procedencias.

   La define el bot validador (servidor/bot-validador/src/areas/laboratorio/definicion.js),
   porque es él quien genera la plantilla y lee el libro del área (un Excel por
   año, una hoja por mes): si la estructura viviera también aquí, las dos
   copias acabarían diciendo cosas distintas. */

export * from '@bot/areas/laboratorio/definicion.js';

/* La celda del Excel de donde salió una casilla (mensual: la fila y la
   columna ya son la celda). */
export { celdaDeOrigen } from '@bot/areas/laboratorio/lector.js';
