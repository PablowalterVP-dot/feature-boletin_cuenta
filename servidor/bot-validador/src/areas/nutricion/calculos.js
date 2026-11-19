/* Aritmética del reporte de Nutrición: leer una fila, sumar, contar casillas.
   La usan las reglas del bot y, a través de él, el sistema. */

import { FORMATOS, formato } from './definicion.js';
import { diasDelMes } from '../../periodos.js';

/* ------------------------------------------------------------ lectura */

export function valoresDe(datos, idFormato, claveFila, periodo) {
  const n = diasDelMes(periodo);
  const fila = datos?.[idFormato]?.[claveFila] ?? [];
  return Array.from({ length: n }, (_, i) => (typeof fila[i] === 'number' ? fila[i] : null));
}

export function sumar(valores) {
  const conDato = valores.filter((v) => v != null);
  return conDato.length ? conDato.reduce((a, b) => a + b, 0) : null;
}

export function totalFila(datos, idFormato, claveFila, periodo) {
  return sumar(valoresDe(datos, idFormato, claveFila, periodo));
}

export function totalFormato(datos, idFormato, periodo) {
  return sumar(formato(idFormato).filas.map((f) => totalFila(datos, idFormato, f.clave, periodo)));
}

export function totalPorComida(datos, idFormato, comida, periodo) {
  return sumar(formato(idFormato).filas.filter((f) => f.comida === comida).map((f) => totalFila(datos, idFormato, f.clave, periodo)));
}

/* Las filas que aplican ese mes: todas, menos las que el Excel no trajo
   (`datos.ausentes`: un grupo que no existía ese mes) y los grupos ocasionales
   (Patrimonio) mientras ese mes no traiga sus filas: no se cuentan como
   casillas por llenar antes de saber si ese mes los hubo. */
export function filasDelMes(datos, idFormato) {
  const ausentes = datos?.ausentes?.[idFormato] ?? [];
  return formato(idFormato).filas.filter((fila) => !ausentes.includes(fila.clave) && (!fila.ocasional || datos?.[idFormato]?.[fila.clave] != null));
}

export function casillasDe(periodo, datos = null) {
  return FORMATOS.reduce((n, f) => n + filasDelMes(datos, f.id).length, 0) * diasDelMes(periodo);
}

export function casillasLlenas(datos, periodo, idFormato) {
  const lista = idFormato ? [formato(idFormato)] : FORMATOS;
  return lista.reduce(
    (n, f) => n + f.filas.reduce((m, fila) => m + valoresDe(datos, f.id, fila.clave, periodo).filter((v) => v != null).length, 0),
    0,
  );
}
