/* Estructura del reporte de Centro Quirúrgico.

   La define el bot validador (servidor/bot-validador/src/areas/centro-quirurgico/definicion.js),
   porque es él quien genera el formato y lee el libro del área: si la
   estructura viviera también aquí, las dos copias acabarían diciendo cosas
   distintas. */

export * from '@bot/areas/centro-quirurgico/definicion.js';

/* La celda del Excel de donde salió una casilla. */
export { celdaDeOrigen } from '@bot/areas/centro-quirurgico/lector.js';

/* Los ocho reportes del área para un mes, en el orden en que el área los
   numera. Cinco se leen del Excel (`leido`); tres se calculan con esos
   (calculos.js del bot), en vez de leerse de su libro, donde se arman a mano.
   El reporte 1 completo, con los doce meses, es el consolidado anual. */
export const REPORTES = Object.freeze([
  Object.freeze({ id: 'resumen', numero: 1, titulo: 'Producción del mes', corto: 'Resumen', leido: true, icono: 'sh-table', descripcion: 'La columna del mes de la hoja RESUMEN: cirugías mayores y menores, programadas y de emergencia, las horas y las suspendidas.' }),
  Object.freeze({ id: 'top_ten', numero: 2, titulo: 'Top Ten', corto: 'Top Ten', leido: false, icono: 'sh-lines', descripcion: 'Los diez procedimientos más frecuentes del mes, mayores y menores. Se calcula con las hojas por especialidad.' }),
  Object.freeze({ id: 'consolidado', numero: 3, titulo: 'Consolidado por especialidad', corto: 'Consolidado', leido: false, icono: 'sh-pie', descripcion: 'Cirugía mayor y menor de cada especialidad. Se calcula con las hojas por especialidad.' }),
  Object.freeze({ id: 'indicadores', numero: 4, titulo: 'Cuadro de indicadores', corto: 'Insumos', leido: true, icono: 'sh-doc', descripcion: 'La tabla izquierda del cuadro de indicadores: salas, intervenciones, horas, reintervenidos y defunciones.' }),
  Object.freeze({ id: 'indicadores_calculados', numero: 5, titulo: 'Indicadores', corto: 'Indicadores', leido: false, icono: 'sh-chart', descripcion: 'La tabla derecha del cuadro de indicadores. Se calcula con la izquierda y el RESUMEN.' }),
  Object.freeze({ id: 'menor', numero: 6, titulo: 'Cirugía menor', corto: 'Cirugía menor', leido: true, icono: 'sh-scalpel', descripcion: 'Intervenciones menores por especialidad y procedimiento.' }),
  Object.freeze({ id: 'mayor', numero: 7, titulo: 'Cirugía mayor', corto: 'Cirugía mayor', leido: true, icono: 'sh-scalpel', descripcion: 'Intervenciones mayores por especialidad y procedimiento.' }),
  Object.freeze({ id: 'suspendidas', numero: 8, titulo: 'Causas de suspensión', corto: 'Suspendidas', leido: true, icono: 'sh-none', descripcion: 'Las cirugías electivas suspendidas, por causa.' }),
]);

export function reporte(id) {
  return REPORTES.find((r) => r.id === id) ?? null;
}
