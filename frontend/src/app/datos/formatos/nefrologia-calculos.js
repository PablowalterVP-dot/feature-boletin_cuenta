/* Cálculos del cuadro de Nefrología y Hemodiálisis que usa el sistema.

   La aritmética (el total del mes) y las reglas son del bot validador, que
   es quien lee el Word del servicio: se reexportan de allí, para que el
   formulario, el visor de Estadística y el bot digan siempre lo mismo. Aquí
   queda lo que es del sistema: las cifras del tablero y el estado del único
   formato en la barra de pasos.

   La ausencia de dato es `null` y nunca cero. */

import { validar as validarEnBot } from '@bot/areas/nefrologia/reglas.js';
import { totalDelMes } from '@bot/areas/nefrologia/calculos.js';
import { numero } from '@/app/dominio/formato.js';

export { sumar, totalDelMes, valoresDelMes } from '@bot/areas/nefrologia/calculos.js';
export { REGLAS } from '@bot/areas/nefrologia/reglas.js';

/* Lo que el tablero, el historial y la bandeja necesitan de un reporte. */
export function cifrasNefrologia(datos) {
  const f1 = datos?.f1 ?? {};
  return {
    sesiones: totalDelMes(f1),
    pacientesAtendidos: f1.pacientes_atendidos ?? null,
    hospitalizados: f1.hospitalizados ?? null,
    fallecidos: f1.fallecidos ?? null,
  };
}

/* Las reglas son las del bot (reglas.js), las mismas que aplica al leer el
   Word. Aquí solo se les da la forma que esperan las pantallas de las áreas
   levantadas: una lista con su nivel, más los errores y los avisos aparte. */
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
  if (totalDelMes(datos?.f1) == null) return 'vacio';
  return 'ok';
}

export function notaDeFormato(idFormato, datos) {
  const t = totalDelMes(datos?.f1);
  if (t == null) return 'Sin registrar';
  return `${numero(t)} ${t === 1 ? 'sesión' : 'sesiones'}`;
}
