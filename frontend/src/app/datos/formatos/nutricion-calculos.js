/* Cálculos del reporte de Nutrición y Dietética que usa el sistema.

   La aritmética básica (leer una fila, sumar, contar casillas) y las reglas
   son del bot validador: se reexportan de allí, para que la hoja, el visor de
   Estadística y el bot digan siempre lo mismo. Aquí queda lo que es del
   sistema: las cifras que van a DIRESA y a Planeamiento, y el estado de cada
   cuadro en la barra de pasos. */

import { formato } from '@bot/areas/nutricion/definicion.js';
import { totalFormato, casillasLlenas, sumar } from '@bot/areas/nutricion/calculos.js';
import { diasDelMes } from '@/app/dominio/periodos.js';

export { valoresDe, totalFila, totalFormato, totalPorComida, casillasDe, casillasLlenas, filasDelMes } from '@bot/areas/nutricion/calculos.js';
export { validar, avisosPendientes, REGLAS } from '@bot/areas/nutricion/reglas.js';

/* Las cifras que salen del reporte hacia Estadística, DIRESA y Planeamiento.
   Un cuadro sin ninguna casilla da null, nunca cero. */
export function cifrasNutricion(datos, periodo) {
  const t = (id) => totalFormato(datos, id, periodo);
  const comensalesHosp = t('f1');
  const comensalesEmerg = t('f2');
  const pacientesHosp = t('f3');
  const pacientesEmerg = t('f4');
  const comensales = sumar([comensalesHosp, comensalesEmerg]);
  const pacientes = sumar([pacientesHosp, pacientesEmerg]);
  return { comensalesHosp, comensalesEmerg, pacientesHosp, pacientesEmerg, comensales, pacientes, total: sumar([comensales, pacientes]) };
}

/* Raciones para el consolidado de servicios intermedios de DIRESA (§ C).
   `tipo` es pacientes o personal; `servicio`, hosp, emerg o ce. El oficio no
   tiene consultorio externo: esa columna va vacía, no en cero, hasta que se
   aclare de dónde sale (CONTEXTO.md § 9). */
export function racionesDiresa(datos, periodo, tipo, servicio) {
  const c = cifrasNutricion(datos, periodo);
  const mapa = {
    pacientes: { hosp: c.pacientesHosp, emerg: c.pacientesEmerg },
    personal: { hosp: c.comensalesHosp, emerg: c.comensalesEmerg },
  };
  return mapa[tipo]?.[servicio] ?? null;
}

/* -------------------------------------------- estado de cada cuadro */

export function estadoDeFormato(idFormato, datos, periodo, validacion) {
  const llenas = casillasLlenas(datos, periodo, idFormato);
  if (llenas === 0) return 'vacio';
  const conError = validacion.errores.some((e) => e.formato === idFormato && e.id !== 'incompleto');
  if (conError) return 'error';
  const total = formato(idFormato).filas.length * diasDelMes(periodo);
  return llenas < total ? 'parcial' : 'ok';
}

export function notaDeFormato(idFormato, datos, periodo) {
  const total = totalFormato(datos, idFormato, periodo);
  if (total == null) return 'Sin datos';
  const llenas = casillasLlenas(datos, periodo, idFormato);
  const todas = formato(idFormato).filas.length * diasDelMes(periodo);
  return llenas < todas ? `${llenas} de ${todas} casillas` : `${total.toLocaleString('es-PE')} raciones`;
}
