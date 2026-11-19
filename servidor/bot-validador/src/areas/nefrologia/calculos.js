/* Aritmética del reporte de Nefrología y Hemodiálisis.

   La ausencia de dato es `null` y nunca cero: una suma sin ningún sumando
   registrado es null. En el Word del área, un guion («-») es la forma en que
   el servicio escribe un cero (lector.js lo traduce); una casilla vacía de
   verdad es un mes que el cuadro todavía no alcanza. */

import { INDICADORES } from './definicion.js';

export function sumar(valores) {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  if (registrados.length === 0) return null;
  return registrados.reduce((a, b) => a + b, 0);
}

/* El total del mes: no hay un indicador que sea «el total» del cuadro, así
   que se usa el que el propio informe destaca («TOTAL DE SESIONES
   ATENDIDAS»), igual que Nutrición usa el total de raciones. */
export function totalDelMes(f1) {
  return f1?.total_sesiones ?? null;
}

export const totalCuadro = (datos) => totalDelMes(datos?.f1);

export function valoresDelMes(f1) {
  return INDICADORES.map((i) => f1?.[i.clave]);
}
