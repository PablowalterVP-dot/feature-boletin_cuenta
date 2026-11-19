/* Cifras simuladas del reporte de Laboratorio, para el prototipo.

   Ficticias, aunque la estructura es la del libro real del área. Son estables
   (azar.js: misma clave, misma cifra) y siguen el factor del periodo que
   comparten todas las áreas, para que un mes con mucha actividad lo sea
   también aquí. El volumen de cada sección y el reparto por procedencia son
   del orden del libro de 2026: mucho de hospitalización y emergencia, poco de
   privados y convenios. Los exámenes ocasionales no se siembran. */

import { CUADROS } from './laboratorio.js';
import { aleatorio, factorDelPeriodo } from '../azar.js';

const PESO_PROCEDENCIA = Object.freeze({ hospitalizacion: 0.36, emergencia: 0.3, c_externa: 0.24, programa: 0.24, privado: 0.05, convenio: 0.03, insolvencia: 0.02, total: 1 });

/* Cuántos exámenes de un tipo hace el laboratorio en un mes típico (el orden
   de agosto de 2026, dividido entre sus exámenes). */
const VOLUMEN_SECCION = Object.freeze({
  bioquimica: 420,
  hematologia: 480,
  microbiologia: 18,
  uro_parasitologicos: 120,
  inmuno_serologicos: 45,
  anatomia_patologica: 180,
  metaxenicas: 60,
  banco_sangre: 130,
  actividades: 4,
});

function simular(periodo) {
  const factor = factorDelPeriodo(periodo);
  const datos = {};
  for (const c of CUADROS) {
    const cuadro = {};
    for (const e of c.examenes.filter((x) => !x.ocasional)) {
      const base = VOLUMEN_SECCION[c.id] * (0.3 + aleatorio(`lab-${c.id}-${e.clave}`) * 1.4);
      for (const f of c.filas.filter((x) => x.examen === e.clave)) {
        const ruido = 0.85 + aleatorio(`lab-${periodo}-${c.id}-${f.clave}`) * 0.3;
        cuadro[f.clave] = Math.round(base * factor * PESO_PROCEDENCIA[f.procedencia] * ruido);
      }
    }
    datos[c.id] = cuadro;
  }
  return datos;
}

/* `parcial`: un reporte abierto que todavía no tiene nada cargado. Se llena
   subiendo el Excel, así que el borrador empieza vacío. */
export function datosDeLaboratorio(periodo, { parcial = false } = {}) {
  return parcial ? {} : simular(periodo);
}

/* No hay un mes con cifras reales del área. */
export const PERIODO_CON_CIFRAS_REALES = null;
