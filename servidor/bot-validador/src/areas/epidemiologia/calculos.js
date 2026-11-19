/* Aritmética del reporte de Epidemiología.

   La ausencia de dato es `null` y nunca cero: una suma sin ningún sumando
   registrado es null. (El lector ya lee como 0 los blancos de las filas de
   edad, porque así los escribe el área: ver definicion.js.) */

import { EDADES, COLUMNAS, GRUPOS } from './definicion.js';
import { anidarCuadros } from '../../anidar.js';

export function sumar(valores) {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  if (registrados.length === 0) return null;
  return registrados.reduce((a, b) => a + b, 0);
}

export const celda = (f1, edad, col) => f1?.[edad]?.[col] ?? null;

/* El total de una columna: lo que la fila TOTAL del Word debería decir. */
export function totalColumna(f1, col) {
  return sumar(EDADES.map((e) => celda(f1, e.clave, col)));
}

export function totalGrupo(f1, grupo) {
  return sumar(COLUMNAS.filter((c) => c.grupo === grupo).map((c) => totalColumna(f1, c.clave)));
}

export function totalSexo(f1, sexo, { soloInfecciones = true } = {}) {
  const grupos = new Set(GRUPOS.filter((g) => !soloInfecciones || g.infeccion).map((g) => g.clave));
  return sumar(COLUMNAS.filter((c) => c.sexo === sexo && grupos.has(c.grupo)).map((c) => totalColumna(f1, c.clave)));
}

export function totalEdad(f1, edad, { soloInfecciones = true } = {}) {
  const grupos = new Set(GRUPOS.filter((g) => !soloInfecciones || g.infeccion).map((g) => g.clave));
  return sumar(COLUMNAS.filter((c) => grupos.has(c.grupo)).map((c) => celda(f1, edad, c.clave)));
}

/* Pacientes con infección intrahospitalaria del mes: todas las columnas de
   infección, sin las dos de muertes. Es el numerador del indicador 16 de
   DIRESA y la cifra del boletín. Cuenta casos nuevos, que es lo que el
   oficio reporta: si un paciente tuvo dos infecciones distintas en el mes,
   la tabla lo cuenta dos veces, y aquí también. */
export function infeccionesDelMes(f1) {
  return sumar(GRUPOS.filter((g) => g.infeccion).map((g) => totalGrupo(f1, g.clave)));
}

export function muertesDelMes(f1) {
  return {
    neonatal: totalGrupo(f1, 'muerte_neonatal'),
    materna: totalGrupo(f1, 'muerte_materna'),
  };
}

/* El total del cuadro (el consolidado y la firma lo usan; la comparación
   con el mes anterior es la propia del área: reglas.js, VARIACION). */
export const totalCuadro = (datos) => infeccionesDelMes(anidarCuadros(datos, ['f1'])?.f1);
