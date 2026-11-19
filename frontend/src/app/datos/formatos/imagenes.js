/* Estructura de los cuatro formatos del Departamento de Diagnóstico por
   Imágenes.

   La define el bot validador (servidor/bot-validador/src/areas/imagenes/definicion.js)
   desde el 27/10/2026, porque es él quien lee el Word del oficio: antes vivía
   aquí y el bot no la conocía. Allí está lo que se descubrió al cotejar los
   oficios de 2026. El sistema la reexporta; aquí solo queda lo propio de la
   pantalla: las filas que el área añade a mano. */

import { matrizVacia } from '@bot/areas/imagenes/definicion.js';

export * from '@bot/areas/imagenes/definicion.js';

export function filaProfesional(nombre = '', id = nuevoId('p')) {
  return { id, nombre, pacientes: null, examenes: matrizVacia(), monto: null };
}

export function filaPersona(nombre = '', id = nuevoId('q')) {
  return { id, nombre, cantidad: null };
}

/* Identificador de una fila añadida a mano. Las filas precargadas y las que
   lee el bot usan uno fijo, para que la misma estructura dé siempre el mismo
   marcado. */
export function nuevoId(prefijo) {
  return `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
