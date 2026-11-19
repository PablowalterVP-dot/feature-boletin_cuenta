/* Datos sembrados de Farmacia.

   QUÉ ES REAL Y QUÉ NO:

   · **Ningún mes sembrado es real.** El único informe que se tiene es el de
     enero de 2026, y enero no está entre los ocho periodos de la
     demostración (febrero a septiembre). Si sus cifras se cargan como
     histórico real es una decisión pendiente del equipo (documentación,
     sección 13): hasta tomarla, no se presentan como reales en ningún lugar.

   · **Enero sirve de magnitud y de prueba.** Los meses sembrados son
     variaciones de enero con el factor común del periodo. Y las cifras del
     Formato 1 de enero, que sí son las del informe y cuadran, son las que la
     prueba de humo usa para comprobar los totales y las reglas.

   · **Las matrices de enero son las del Word**, casilla por casilla
     (`01_INFORME_MES_DE_ENERO_2026.docx`): Sala de Operaciones y
     Consultorios externos con sus cuatro filas sin rótulo. Los meses
     sembrados reparten sus totales con las mismas proporciones.

   Los meses sembrados cumplen las mismas reglas que el sistema valida: si no,
   el propio sistema marcaría error en sus datos de ejemplo. La siembra es
   determinista: mismo periodo, mismas cifras. */

import { COMPONENTES_SIS, COMPONENTES_CONVENIO, OTROS_FINANCIADORES, SERVICIOS_SOP, FILAS, datosVacios } from './farmacia.js';
import { aleatorio, factorDelPeriodo } from '../azar.js';

/* Ningún periodo de la demostración trae cifras reales de Farmacia. */
export const PERIODO_CON_CIFRAS_REALES = null;

/* El informe de enero de 2026, tal como figura en el Word del área. */
export const INFORME_ENERO_2026 = Object.freeze({
  periodo: '2026-01',
  f1: Object.freeze({
    sis: Object.freeze({ hosp: 9264, emerg: 6113, ce: 2668, hemodialisis: 718, oncologia: 115 }),
    convenio: Object.freeze({ emerg: 180, hosp: 168, consultorio: 151 }),
    otros: Object.freeze({ programas: 655, boletas: 4367, credito: 0, defensa: 0, insolvencias: 0 }),
  }),
  /* Las cuatro filas sin rótulo de la tabla de Sala de Operaciones y
     Consultorios externos: MATER, GINEC, CIRU, MEDI, PEDIA, convenios de
     sala, consultas externas y convenios de consultorio. */
  matriz: Object.freeze([
    Object.freeze({ mater: 17, ginec: 17, ciru: 22, medi: 22, pedia: 3, conveniosSop: 5, consultas: 0, conveniosCe: 0 }),
    Object.freeze({ mater: 152, ginec: 42, ciru: 41, medi: 33, pedia: 139, conveniosSop: 14, consultas: 1292, conveniosCe: 137 }),
    Object.freeze({ mater: 49, ginec: 79, ciru: 93, medi: 47, pedia: 32, conveniosSop: 5, consultas: 1303, conveniosCe: 14 }),
    Object.freeze({ mater: 6, ginec: 3, ciru: 5, medi: 14, pedia: 2, conveniosSop: 0, consultas: 73, conveniosCe: 0 }),
  ]),
  /* Totales que el informe declara y que el sistema debe reproducir. */
  totales: Object.freeze({ sis: 18878, convenios: 499, otras: 5521, atenciones: 24399, recetas: 18045, hospitalizadosSop: 818, conveniosSop: 24 }),
  /* Diciembre de 2025, para el comparativo del informe. */
  diciembre2025: Object.freeze({ sis: 17310, convenios: 300, programas: 704, boletas: 3880, atenciones: 22194 }),
});

/* Reparte un total entre pesos con suma exacta: si no fuera exacta, las
   consultas del Formato 3 dejarían de cuadrar con las del Formato 1. */
export function repartir(total, pesos) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  const valores = pesos.map((p) => Math.floor((total * p) / suma));
  let resto = total - valores.reduce((a, b) => a + b, 0);
  /* El resto va a las casillas con peso: una casilla que en enero fue cero
     (consultas de la fila 1) sigue en cero. */
  const conPeso = valores.map((_, i) => i).filter((i) => pesos[i] > 0);
  for (let k = 0; resto > 0; k = (k + 1) % conPeso.length, resto -= 1) valores[conPeso[k]] += 1;
  return valores;
}

function escalar(valor, factor, clave) {
  if (!valor) return 0;
  return Math.max(1, Math.round(valor * factor * (0.92 + aleatorio(clave) * 0.16)));
}

const porFila = (valores) => Object.fromEntries(FILAS.map((f, i) => [f.clave, valores[i]]));

const M = INFORME_ENERO_2026.matriz;
const columna = (clave) => M.map((f) => f[clave]);

/* Matriz de Sala de Operaciones con el total exacto de hospitalizados,
   repartido con las proporciones de las veinte casillas de enero. */
function matrizSop(hospitalizados, convenios) {
  const pesos = M.flatMap((f) => SERVICIOS_SOP.map((s) => f[s.clave]));
  const celdas = repartir(hospitalizados, pesos);
  const n = SERVICIOS_SOP.length;
  return {
    hospitalizados: Object.fromEntries(FILAS.map((f, i) => [f.clave, Object.fromEntries(SERVICIOS_SOP.map((s, j) => [s.clave, celdas[i * n + j]]))])),
    convenios: porFila(repartir(convenios, columna('conveniosSop'))),
  };
}

/* Consultorios externos: se reparten exactamente las cifras del Formato 1,
   para que R5 y R6 se cumplan. */
function consultorios(f1) {
  return {
    consultas: porFila(repartir(f1.sis.ce, columna('consultas'))),
    convenios: porFila(repartir(f1.convenio.consultorio, columna('conveniosCe'))),
  };
}

function variarF1(periodo) {
  const factor = factorDelPeriodo(periodo);
  const base = INFORME_ENERO_2026.f1;
  const variar = (grupo, lista) => Object.fromEntries(lista.map((x) => [x.clave, escalar(base[grupo][x.clave], factor, `${periodo}:far:${grupo}.${x.clave}`)]));
  return {
    sis: variar('sis', COMPONENTES_SIS),
    convenio: variar('convenio', COMPONENTES_CONVENIO),
    otros: variar('otros', OTROS_FINANCIADORES),
  };
}

/* Proporción de enero entre Sala de Operaciones y su referencia del Formato 1. */
const PROPORCION_HOSP = INFORME_ENERO_2026.totales.hospitalizadosSop / INFORME_ENERO_2026.f1.sis.hosp;
const PROPORCION_CONV = INFORME_ENERO_2026.totales.conveniosSop / INFORME_ENERO_2026.f1.convenio.hosp;

export function datosDeFarmacia(periodo, { parcial = false } = {}) {
  const f1 = variarF1(periodo);

  /* Un reporte a medio llenar trae solo el Formato 1. */
  if (parcial) return { ...datosVacios(), f1 };

  const ruido = 0.95 + aleatorio(`${periodo}:far:sop`) * 0.1;
  const hospSop = Math.min(f1.sis.hosp, Math.round(f1.sis.hosp * PROPORCION_HOSP * ruido));
  const convSop = Math.min(f1.convenio.hosp, Math.round(f1.convenio.hosp * PROPORCION_CONV * ruido));

  return { f1, f2: matrizSop(hospSop, convSop), f3: consultorios(f1) };
}

/* Enero completo, tal como lo trae el Word: para las pruebas. */
export function datosDeEnero() {
  return {
    f1: structuredClone(INFORME_ENERO_2026.f1),
    f2: {
      hospitalizados: Object.fromEntries(FILAS.map((f, i) => [f.clave, Object.fromEntries(SERVICIOS_SOP.map((s) => [s.clave, M[i][s.clave]]))])),
      convenios: porFila(columna('conveniosSop')),
    },
    f3: { consultas: porFila(columna('consultas')), convenios: porFila(columna('conveniosCe')) },
  };
}
