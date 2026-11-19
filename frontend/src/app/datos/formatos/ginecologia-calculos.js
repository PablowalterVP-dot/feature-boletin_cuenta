/* Cálculos del reporte de Gineco-Obstetricia que usa el sistema.

   La aritmética (los totales por columna) y las reglas son del bot
   validador, que es quien lee el Excel del área: se reexportan de allí,
   para que el formulario, el visor de Estadística y el bot digan siempre
   lo mismo. Aquí queda lo que es del sistema: las cifras del tablero y el
   estado de los dos formatos en la barra de pasos.

   La ausencia de dato es `null` y nunca cero. */

import { validar as validarEnBot } from '@bot/areas/ginecologia/reglas.js';
import { totalCuadro, totalColumna, sumar, valor } from '@bot/areas/ginecologia/calculos.js';
import { numero } from '@/app/dominio/formato.js';

export { sumar, valor, totalColumna, totalCuadro } from '@bot/areas/ginecologia/calculos.js';
export { REGLAS } from '@bot/areas/ginecologia/reglas.js';

/* Lo que el tablero, el historial y la bandeja necesitan de un reporte. El
   cuadro 2 (partos, cesáreas y nacidos) solo llega desde setiembre de
   2026: sin él, la cifra principal es la del cuadro 1. */
export function cifrasGinecologia(datos) {
  const partos = totalCuadro(datos, 'f2');
  return {
    sesiones: partos ?? totalCuadro(datos, 'f1'),
    controlesPrenatales: totalCuadro(datos, 'f1'),
    partos,
    cesareas: datos?.f2
      ? sumar(['cesarea_sin_complicaciones', 'cesarea_con_complicaciones'].map((t) => valor(datos, 'f2', t, 'total_partos')))
      : null,
    nacidosVivos: totalColumna(datos, 'f2', 'nacidos_vivos'),
  };
}

/* Las reglas son las del bot (reglas.js), las mismas que aplica al leer el
   Excel. Aquí solo se les da la forma que esperan las pantallas de las
   áreas levantadas: una lista con su nivel, más los errores y los avisos
   aparte. */
export function validar(datos, periodo) {
  const { errores, avisos, info } = validarEnBot(datos, periodo);
  const conNivel = (lista, nivel) => lista.map((h) => ({ ...h, nivel }));
  return {
    hallazgos: [...conNivel(errores, 'error'), ...conNivel(avisos, 'aviso'), ...conNivel(info, 'info')],
    errores: conNivel(errores, 'error'),
    avisos: conNivel(avisos, 'aviso'),
    info: conNivel(info, 'info'),
  };
}

export function hallazgosDe(validacion, idFormato) {
  return validacion.hallazgos.filter((h) => h.formato === idFormato);
}

export function estadoDeFormato(idFormato, datos, periodo, validacion) {
  if (validacion.errores.some((e) => e.formato === idFormato)) return 'error';
  const cuadro = datos?.[idFormato];
  if (!cuadro || Object.keys(cuadro).length === 0) return 'vacio';
  return 'ok';
}

export function notaDeFormato(idFormato, datos) {
  const t = totalCuadro(datos, idFormato);
  if (t == null) return 'Sin registrar';
  const unidad = idFormato === 'f1' ? (t === 1 ? 'control prenatal' : 'controles prenatales') : t === 1 ? 'parto' : 'partos';
  return `${numero(t)} ${unidad}`;
}
