/* Cálculos del reporte de Epidemiología que usa el sistema.

   La aritmética y las reglas son del bot validador, que es quien lee el Word
   del oficio: se reexportan de allí, para que el formulario, el visor de
   Estadística y el bot digan siempre lo mismo. Aquí queda lo que es del
   sistema: las cifras del tablero, de DIRESA y del boletín, y el estado del
   único formato en la barra de pasos.

   La ausencia de dato es `null` y nunca cero. */

import { validar as validarEnBot } from '@bot/areas/epidemiologia/reglas.js';
import { infeccionesDelMes, muertesDelMes, totalGrupo } from '@bot/areas/epidemiologia/calculos.js';
import { anidarCuadros } from '@bot/anidar.js';
import { GRUPOS } from './epidemiologia.js';
import { numero } from '@/app/dominio/formato.js';

export { sumar, celda, totalColumna, totalGrupo, totalSexo, totalEdad, infeccionesDelMes, muertesDelMes } from '@bot/areas/epidemiologia/calculos.js';
export { REGLAS } from '@bot/areas/epidemiologia/reglas.js';

/* El servidor devuelve el cuadro plano (`'e0.neonatologia_m'`): se anida aquí. */
export const anidar = (datos) => anidarCuadros(datos, ['f1']);

/* Qué cuenta como «paciente con infección intrahospitalaria» en DIRESA y en el
   boletín. Se dice en cada tooltip que la muestra. */
export const LECTURA_IIH = 'Casos nuevos de infección intrahospitalaria del oficio de Epidemiología: Neonatología, UCI, Gineco-Obstetricia, infección urinaria, infección de herida operatoria y otras infecciones. No incluye las muertes neonatales ni maternas, que el oficio registra en la misma tabla. Si un paciente tuvo dos infecciones distintas en el mes, cuenta dos veces, como en el oficio.';

/* Lo que el tablero, el historial, DIRESA y el boletín necesitan del mes. */
export function cifrasEpidemiologia(datos) {
  const f1 = anidar(datos)?.f1;
  const muertes = muertesDelMes(f1);
  return {
    infecciones: infeccionesDelMes(f1),
    porGrupo: Object.fromEntries(GRUPOS.map((g) => [g.clave, totalGrupo(f1, g.clave)])),
    muertesNeonatales: muertes.neonatal,
    muertesMaternas: muertes.materna,
  };
}

/* Las reglas son las del bot. Aquí solo se les da la forma que esperan las
   pantallas de las áreas levantadas. */
export function validar(datos, periodo) {
  const { errores, avisos, info } = validarEnBot(anidar(datos), periodo);
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
  if (validacion.errores.some((e) => e.formato === idFormato && e.regla !== 'formato-vacio')) return 'error';
  if (!Object.keys(anidar(datos)?.f1 ?? {}).length) return 'vacio';
  return 'ok';
}

export function notaDeFormato(idFormato, datos) {
  const f1 = anidar(datos)?.f1;
  if (!Object.keys(f1 ?? {}).length) return 'Sin registrar';
  const n = infeccionesDelMes(f1) ?? 0;
  return `${numero(n)} ${n === 1 ? 'infección' : 'infecciones'}`;
}
