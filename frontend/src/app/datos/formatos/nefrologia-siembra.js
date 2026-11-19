/* Datos sembrados de Nefrología y Hemodiálisis.

   Ningún periodo de la demostración trae cifras reales: el cuadro real del
   servicio se sube por archivo (como Farmacia), y lo único real que existe
   es el Word del año, no un mes suelto para sembrar en el prototipo. Los
   meses de la demostración son cifras ficticias, deterministas por periodo,
   que cumplen las mismas reglas que el sistema valida (enteros sin signo,
   sin indicadores sin registrar): sin agregados declarados (I TRIM…), así
   que no disparan la regla de totales, que solo compara lo que el propio
   Word trae calculado. */

import { INDICADORES, datosVacios } from './nefrologia.js';
import { aleatorio, factorDelPeriodo } from '../azar.js';

export const PERIODO_CON_CIFRAS_REALES = null;

/* Una base plausible por indicador (el orden de magnitud del cuadro real:
   decenas para la mayoría, un par de cientos para «Pacientes SIS» y el
   total de sesiones). */
const BASE = Object.freeze({
  pacientes_atendidos: 80, nuevos: 10, sesiones_2: 1, sesiones_3: 75, sesiones_1: 0,
  sin_reuso: 5, cambio_filtro: 1, cvc_temporal: 25, cvc_tunelizado: 30, fav: 15,
  colocacion_cateter: 15, cvc_disfuncionantes: 4, cambio_cvc_permanente: 5, cambio_cvc_temporal: 8,
  fistulas_inmaduras: 2, infecciones_cvc: 0, infecciones_fav: 0, sis: 82, convenios: 0,
  abandono: 0, hospitalizados: 15, fallecidos: 2, alta_voluntaria: 0, atencion_consultorio: 75,
  alta_medica: 0, traslado_extrahospitalario: 0, transferencias_clinica: 2, transferencias: 0,
  total_sesiones: 950,
});

function escalar(valor, factor, clave) {
  if (!valor) return 0;
  return Math.max(0, Math.round(valor * factor * (0.9 + aleatorio(clave) * 0.2)));
}

export function datosDeNefrologia(periodo, { parcial = false } = {}) {
  if (parcial) return datosVacios();
  const factor = factorDelPeriodo(periodo);
  const f1 = Object.fromEntries(INDICADORES.map((i) => [i.clave, escalar(BASE[i.clave], factor, `${periodo}:nef:${i.clave}`)]));
  return { f1 };
}
