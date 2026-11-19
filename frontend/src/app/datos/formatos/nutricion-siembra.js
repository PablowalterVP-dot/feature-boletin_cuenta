/* Datos sembrados de Nutrición y Dietética.

   Junio de 2026 es el oficio real (N.º 122-2026), transcrito casilla por
   casilla de la copia escaneada. Ocho casillas eran difíciles de leer; en
   cada una se tomó la lectura con la que la fila suma el total impreso, y las
   veinte filas cuadran con él. En el desayuno y la cena del personal
   asistencial el oficio trae el mismo total (5 145) y las mismas cifras día
   por día salvo dos casillas borrosas; se dejaron iguales.

   De enero a mayo el oficio trae solo el total mensual de cada cuadro (su
   resumen anual): esos totales son reales, y el reparto por día se simula con
   el patrón semanal de junio. De julio en adelante no hay oficio: son simulados.

   Se conserva el día 21 de la dieta líquida (cena): 100 raciones con un resto
   del mes entre 6 y 27. Está así en el oficio y entra en su total. Es el caso
   que el bot debe señalar para que el área lo confirme. */

import { FORMATOS } from './nutricion.js';
import { diasDelMes } from '@/app/dominio/periodos.js';
import { aleatorio } from '../azar.js';

export const PERIODO_CON_CIFRAS_REALES = '2026-06';

const r = (texto) => Object.freeze(texto.trim().split(/\s+/).map(Number));
const fijo = (valor, ceros = []) => Object.freeze(Array.from({ length: 30 }, (_, i) => (ceros.includes(i + 1) ? 0 : valor)));

const ASISTENCIAL_DESAYUNO = r('169 168 174 164 175 171 168 174 166 173 169 171 169 168 172 175 176 175 168 169 176 172 176 174 172 176 172 179 166 168');

/* Junio de 2026, día 1 a 30. El 1 de junio fue lunes; el 29, feriado. */
export const JUNIO = Object.freeze({
  f1: Object.freeze({
    'asistencial.desayuno': ASISTENCIAL_DESAYUNO,
    'asistencial.almuerzo': r('318 304 324 322 298 305 231 324 296 312 310 328 303 240 321 306 318 315 332 300 241 319 288 306 309 314 308 243 258 291'),
    'asistencial.cena': ASISTENCIAL_DESAYUNO,
    'int-medicina.desayuno': fijo(20),
    'int-medicina.almuerzo': fijo(20),
    'int-medicina.cena': fijo(20),
    'int-obstetricia.desayuno': fijo(16),
    'int-obstetricia.almuerzo': fijo(16),
    'int-obstetricia.cena': fijo(16),
    'int-nutricion.desayuno': fijo(3, [3, 10, 17, 24]),
    'int-nutricion.almuerzo': fijo(3, [3, 10, 17, 24]),
    'int-enfermeria.desayuno': fijo(2),
    'int-enfermeria.almuerzo': fijo(2),
    'int-enfermeria.cena': fijo(2),
  }),
  f2: Object.freeze({
    'direccion.desayuno': fijo(3, [7, 14, 21, 28, 29]),
    'direccion.almuerzo': fijo(3, [7, 14, 21, 28, 29]),
    'residuos.desayuno': fijo(5),
    'residuos.almuerzo': fijo(5),
    'nutricion.desayuno': r('22 20 21 20 20 14 12 24 18 19 22 15 16 13 18 17 21 20 19 19 12 19 17 22 18 18 16 14 13 19'),
    'nutricion.almuerzo': r('21 19 21 22 18 13 12 23 16 17 23 16 16 12 18 18 21 19 19 17 12 18 17 20 17 19 16 12 12 18'),
    'nutricion.cena': r('3 3 3 3 4 3 3 3 3 4 3 3 3 3 4 3 3 3 3 4 3 3 3 3 4 3 3 3 3 4'),
  }),
  f3: Object.freeze({
    'completa.desayuno': r('75 68 80 76 71 71 66 67 66 55 68 67 64 71 69 73 69 55 67 87 72 69 66 72 64 72 85 66 75 71'),
    'completa.almuerzo': r('73 73 66 78 68 84 73 78 72 71 75 75 75 76 69 68 74 64 70 76 64 67 69 101 83 79 84 75 83 80'),
    'completa.cena': r('72 81 66 70 76 69 69 55 62 69 67 75 118 68 69 114 62 68 66 66 68 69 66 94 73 76 72 65 79 79'),
    'blanda.desayuno': r('80 72 82 65 93 99 105 85 87 107 78 102 97 92 65 69 83 83 69 69 88 75 82 84 81 78 68 68 62 71'),
    'blanda.almuerzo': r('83 71 66 83 85 96 97 92 85 89 82 103 103 85 85 84 85 92 93 75 84 80 87 69 77 90 67 65 74 77'),
    'blanda.cena': r('59 66 59 86 98 96 87 91 78 84 82 91 93 77 81 84 84 81 79 76 86 78 87 61 80 75 66 65 71 79'),
    'licuada.desayuno': r('8 14 9 11 10 8 9 7 9 12 11 8 7 14 13 14 18 16 8 8 14 13 13 11 13 10 15 16 11 13'),
    'licuada.almuerzo': r('7 15 9 9 8 9 7 8 9 10 9 9 10 14 20 18 16 17 17 9 11 15 11 11 11 14 16 11 13 13'),
    'licuada.cena': r('9 9 12 9 9 7 6 10 10 10 10 9 14 18 18 19 16 19 15 9 17 14 11 12 14 14 16 11 14 11'),
    'liquida.desayuno': r('11 18 12 10 19 15 21 12 13 11 14 13 12 7 6 17 10 11 11 11 23 20 18 16 11 9 17 17 21 8'),
    'liquida.almuerzo': r('10 18 11 12 20 10 11 9 9 8 22 11 13 15 8 13 13 10 5 17 20 10 20 9 22 12 24 26 20 6'),
    'liquida.cena': r('13 11 18 27 17 6 14 15 17 12 25 13 16 23 13 13 17 10 11 24 100 18 14 12 13 12 18 21 10 7'),
  }),
  f4: Object.freeze({
    'sis.desayuno': r('44 45 40 37 38 39 40 37 34 36 38 43 42 38 39 41 40 37 43 43 46 40 42 37 39 39 41 39 33 35'),
    'sis.almuerzo': r('44 41 47 37 37 40 40 37 35 40 39 43 42 38 40 41 42 36 43 41 42 39 42 38 39 40 40 39 34 35'),
    'sis.cena': r('44 41 40 37 37 40 40 34 37 38 42 42 38 39 40 41 37 40 44 40 43 39 42 38 41 40 39 36 33 37'),
  }),
});

/* Totales tal como están impresos en el oficio de junio: la prueba de humo
   comprueba que la transcripción suma exactamente esto. */
export const TOTALES_IMPRESOS_JUNIO = Object.freeze({ f1: 22850, f2: 1606, f3: 16305, f4: 3555 });

/* Resumen anual del oficio: total del mes por cuadro, enero a junio. */
export const TOTALES_MENSUALES = Object.freeze({
  '2026-01': Object.freeze({ f1: 21891, f2: 1564, f3: 16028, f4: 4539 }),
  '2026-02': Object.freeze({ f1: 20233, f2: 1426, f3: 13954, f4: 3757 }),
  '2026-03': Object.freeze({ f1: 22180, f2: 1549, f3: 15359, f4: 4518 }),
  '2026-04': Object.freeze({ f1: 22462, f2: 1709, f3: 15346, f4: 4484 }),
  '2026-05': Object.freeze({ f1: 22309, f2: 1592, f3: 16685, f4: 4696 }),
  '2026-06': TOTALES_IMPRESOS_JUNIO,
});

/* Sin oficio: la media de enero a junio. */
function totalEstimado(idFormato) {
  const meses = Object.values(TOTALES_MENSUALES);
  return Math.round(meses.reduce((s, m) => s + m[idFormato], 0) / meses.length);
}

/* Día de junio con el mismo día de la semana y en la misma semana del mes, para
   copiar el patrón semanal: ceros de domingo, feriados, picos de lunes. */
function diaEspejo(periodo, dia) {
  const [a, m] = periodo.split('-').map(Number);
  const semana = new Date(Date.UTC(a, m - 1, dia)).getUTCDay();
  const primeroJunio = 1; // lunes
  let espejo = ((semana - primeroJunio + 7) % 7) + 1 + 7 * Math.floor((dia - 1) / 7);
  while (espejo > 30) espejo -= 7;
  return espejo;
}

/* Los grupos ocasionales (Patrimonio, solo en abril real) no se simulan: el
   prototipo los deja como el bot deja un grupo que el Excel del mes no trae,
   en `ausentes`, no en cero. */
const filasSembradas = (f) => f.filas.filter((fila) => !fila.ocasional);

function ausentesSembrados() {
  const ausentes = Object.fromEntries(FORMATOS.map((f) => [f.id, f.filas.filter((fila) => fila.ocasional).map((fila) => fila.clave)]).filter(([, l]) => l.length));
  return Object.keys(ausentes).length ? { ausentes } : {};
}

function simular(periodo) {
  const n = diasDelMes(periodo);
  const datos = {};

  for (const f of FORMATOS) {
    const objetivo = TOTALES_MENSUALES[periodo]?.[f.id] ?? totalEstimado(f.id);
    const base = Object.values(JUNIO[f.id]).reduce((s, fila) => s + fila.reduce((a, b) => a + b, 0), 0) / 30;
    const factor = objetivo / (base * n);
    const cuadro = {};

    for (const fila of filasSembradas(f)) {
      const junio = JUNIO[f.id][fila.clave];
      const varia = new Set(junio).size > 2;
      /* El pico del 21 de junio es un hecho de junio: no se copia a otros meses. */
      const orden = [...junio].sort((a, b) => a - b);
      const mediana = orden[15];
      cuadro[fila.clave] = Array.from({ length: n }, (_, i) => {
        const leido = junio[diaEspejo(periodo, i + 1) - 1];
        const v = leido > Math.max(mediana * 3, mediana + 15) ? mediana : leido;
        if (v === 0) return 0;
        const ruido = varia ? 0.9 + aleatorio(`nut:${periodo}:${f.id}:${fila.clave}:${i}`) * 0.2 : 1;
        return Math.max(0, Math.round(v * factor * ruido));
      });
    }

    /* El redondeo deja unas raciones de diferencia con el total real: se
       reparten de a una en la fila más grande, en sus días con servicio. */
    const mayor = filasSembradas(f).reduce((a, b) => (JUNIO[f.id][b.clave].reduce((x, y) => x + y, 0) > JUNIO[f.id][a.clave].reduce((x, y) => x + y, 0) ? b : a));
    let diferencia = objetivo - Object.values(cuadro).reduce((s, fila) => s + fila.reduce((a, b) => a + b, 0), 0);
    const fila = cuadro[mayor.clave];
    for (let i = 0; diferencia !== 0 && i < n * 20; i += 1) {
      const d = i % n;
      if (fila[d] === 0) continue;
      const paso = diferencia > 0 ? 1 : -1;
      fila[d] += paso;
      diferencia -= paso;
    }

    datos[f.id] = cuadro;
  }
  return datos;
}

/* `parcial`: un reporte abierto que todavía no tiene nada cargado. En este
   módulo se llena subiendo el Excel, así que el borrador empieza vacío. */
export function datosDeNutricion(periodo, { parcial = false } = {}) {
  if (parcial) return {};
  if (periodo === PERIODO_CON_CIFRAS_REALES) {
    return { ...Object.fromEntries(Object.entries(JUNIO).map(([id, cuadro]) => [id, Object.fromEntries(Object.entries(cuadro).map(([k, v]) => [k, [...v]]))])), ...ausentesSembrados() };
  }
  return { ...simular(periodo), ...ausentesSembrados() };
}
