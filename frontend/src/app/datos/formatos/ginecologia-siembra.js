/* Datos sembrados de Gineco-Obstetricia.

   Ningún periodo de la demostración trae cifras reales: el cuadro real del
   área se sube por archivo (como Laboratorio), y lo único real que existe
   son los nueve Excel EBVI del área, uno por mes, no un mes suelto para
   sembrar en el prototipo. Los meses de la demostración son cifras
   ficticias, deterministas por periodo, que cumplen las mismas reglas que
   el sistema valida (enteros sin signo, totales que cuadran con sus
   filas): sin agregados escritos, así que no disparan la regla de
   totales, que solo compara lo que el propio Excel trae calculado.

   El cuadro 2 (partos, cesáreas y nacidos) se siembra siempre, a
   diferencia del Excel real (que solo lo trae desde setiembre de 2026):
   así la demostración muestra el reporte completo. */

import { EDADES, TIPOS_PARTO, claveFila, datosVacios } from './ginecologia.js';
import { aleatorio, factorDelPeriodo } from '../azar.js';

export const PERIODO_CON_CIFRAS_REALES = null;

/* Una base plausible por grupo de edad (controles prenatales) y por tipo de
   parto (partos atendidos), del orden de magnitud del Excel real. */
const BASE_EDAD = Object.freeze({
  edad_10_14: 15, edad_15_19: 45, edad_20_24: 42, edad_25_29: 50,
  edad_30_34: 55, edad_35_39: 35, edad_40_44: 18, edad_45_49: 0,
});
const BASE_TIPO = Object.freeze({
  vaginal_sin_complicaciones: 90, vaginal_con_complicaciones: 25,
  cesarea_sin_complicaciones: 95, cesarea_con_complicaciones: 20,
});

function escalar(valor, factor, clave) {
  if (!valor) return 0;
  return Math.max(0, Math.round(valor * factor * (0.9 + aleatorio(clave) * 0.2)));
}

export function datosDeGinecologia(periodo, { parcial = false } = {}) {
  if (parcial) return datosVacios();
  const factor = factorDelPeriodo(periodo);

  const f1 = {};
  for (const e of EDADES) {
    const controles = escalar(BASE_EDAD[e.clave], factor, `${periodo}:gin:f1:${e.clave}:controles`);
    /* Los partos según controles no pueden superar los controles del grupo:
       se derivan de él, como el Excel real (una fracción decreciente). */
    const c1 = Math.round(controles * 0.35);
    const c6 = Math.round(controles * 0.55);
    const c1t = Math.round(controles * 0.4);
    f1[claveFila(e.clave, 'controles_prenatales')] = controles;
    f1[claveFila(e.clave, 'partos_1_control')] = c1;
    f1[claveFila(e.clave, 'partos_6_controles')] = c6;
    f1[claveFila(e.clave, 'partos_1er_trimestre')] = c1t;
  }

  const f2 = {};
  for (const t of TIPOS_PARTO) {
    const partos = escalar(BASE_TIPO[t.clave], factor, `${periodo}:gin:f2:${t.clave}:partos`);
    const muertos = Math.round(partos * (t.clave.includes('con_complicaciones') ? 0.02 : 0.002));
    f2[claveFila(t.clave, 'total_partos')] = partos;
    f2[claveFila(t.clave, 'total_nacimientos')] = partos + muertos;
    f2[claveFila(t.clave, 'nacidos_vivos')] = partos;
    f2[claveFila(t.clave, 'nacidos_muertos')] = muertos;
  }

  return { f1, f2 };
}
