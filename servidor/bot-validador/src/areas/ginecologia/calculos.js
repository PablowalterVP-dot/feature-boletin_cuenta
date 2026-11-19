/* Aritmética del reporte de Gineco-Obstetricia.

   La ausencia de dato es `null` y nunca cero: una suma sin ningún sumando
   registrado es null. Cada cuadro es una matriz (un grupo en filas, una
   cifra en columnas); no tiene sentido sumar columnas de unidades
   distintas entre sí, así que el total del cuadro es el de su columna
   principal, como en Nefrología («TOTAL DE SESIONES ATENDIDAS»). */

import { EDADES, COLUMNAS_F1, TIPOS_PARTO, COLUMNAS_F2, claveFila } from './definicion.js';

export function sumar(valores) {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  if (registrados.length === 0) return null;
  return registrados.reduce((a, b) => a + b, 0);
}

/* La casilla es plana («edad_15_19.controles_prenatales»), no un objeto
   anidado: el backend parte el código del indicador en el primer punto, así
   que una fila con más de un punto se guarda y se devuelve como una sola
   clave con puntos (claveFila en definicion.js), no como dos niveles. */
export function valor(datos, idCuadro, fila, columna) {
  const v = datos?.[idCuadro]?.[claveFila(fila, columna)];
  return typeof v === 'number' ? v : null;
}

/* Todas las cifras de una columna del cuadro, en el orden de sus filas. */
export function columnaDe(datos, idCuadro, columna) {
  const filas = idCuadro === 'f1' ? EDADES : TIPOS_PARTO;
  return filas.map((f) => valor(datos, idCuadro, f.clave, columna));
}

export function totalColumna(datos, idCuadro, columna) {
  return sumar(columnaDe(datos, idCuadro, columna));
}

/* f1: controles prenatales realizados, en todos los grupos de edad.
   f2: partos atendidos, en todos los tipos de parto. */
export function totalCuadro(datos, idCuadro) {
  if (idCuadro === 'f1') return totalColumna(datos, 'f1', 'controles_prenatales');
  if (idCuadro === 'f2') return totalColumna(datos, 'f2', 'total_partos');
  return null;
}

/* El total del mes, para el tablero: los partos atendidos si el cuadro 2
   llegó ese mes; si no, los controles prenatales del cuadro 1. */
export function totalDelMes(datos) {
  const partos = totalCuadro(datos, 'f2');
  return partos ?? totalCuadro(datos, 'f1');
}

export function valoresDelMes(datos) {
  const deF1 = EDADES.flatMap((e) => COLUMNAS_F1.map((c) => valor(datos, 'f1', e.clave, c.clave)));
  const deF2 = TIPOS_PARTO.flatMap((t) => COLUMNAS_F2.map((c) => valor(datos, 'f2', t.clave, c.clave)));
  return [...deF1, ...deF2];
}
