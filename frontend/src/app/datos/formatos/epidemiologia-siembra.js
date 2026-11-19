/* Datos sembrados de Epidemiología para la demostración.

   Ningún periodo trae cifras reales: los oficios reales se suben por archivo
   (con el servidor, quedan en la base), y en el prototipo no se siembran. Los
   meses de la demostración son cifras ficticias, deterministas por periodo,
   del orden de los oficios de 2026 (entre diez y veinte casos al mes), que
   cumplen las reglas del bot: cada caso en una edad plausible para su
   columna. */

import { EDADES, COLUMNAS, datosVacios } from './epidemiologia.js';
import { aleatorio } from '../azar.js';

export const PERIODO_CON_CIFRAS_REALES = null;

/* Dónde cae cada caso: [columna, grupos de edad plausibles, casos en un mes típico]. */
const REPARTO = Object.freeze([
  ['neonatologia_f', ['e0'], 0.6],
  ['neonatologia_m', ['e0'], 1],
  ['uci_f', ['e45', 'e50', 'e55', 'e60', 'e65'], 0.8],
  ['uci_m', ['e40', 'e50', 'e60', 'e65'], 1.2],
  ['gineco_f', ['e15', 'e20', 'e25', 'e30', 'e35'], 4],
  ['itu_f', ['e30', 'e50', 'e65'], 0.3],
  ['iho_f', ['e10', 'e15', 'e20', 'e30', 'e40'], 2.5],
  ['iho_m', ['e20', 'e30', 'e45'], 0.8],
  ['muerte_neonatal_f', ['e0'], 1.5],
  ['muerte_neonatal_m', ['e0'], 1.8],
  ['otras_f', ['e30', 'e60'], 0.6],
  ['otras_m', ['e40', 'e65'], 0.8],
]);

export function datosDeEpidemiologia(periodo, { parcial = false } = {}) {
  if (parcial) return datosVacios();
  const f1 = Object.fromEntries(EDADES.map((e) => [e.clave, Object.fromEntries(COLUMNAS.map((c) => [c.clave, 0]))]));
  for (const [columna, edades, media] of REPARTO) {
    const casos = Math.round(media * (0.5 + aleatorio(`${periodo}:epi:${columna}`)));
    for (let i = 0; i < casos; i += 1) {
      const edad = edades[Math.floor(aleatorio(`${periodo}:epi:${columna}:${i}`) * edades.length)];
      f1[edad][columna] += 1;
    }
  }
  return { f1 };
}
