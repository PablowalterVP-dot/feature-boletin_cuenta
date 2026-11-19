/* Datos sembrados de Diagnóstico por Imágenes.

   QUÉ ES REAL Y QUÉ NO:

   · **Junio de 2026 es el oficio real**, casilla por casilla: las cuatro filas
     de ecografía, biopsias y procedimientos oncológicos, el tomógrafo
     inoperativo, la mamografía con su casilla en blanco y su monto de S/ 385,
     y Rayos X con sus ocho tecnólogos. No hay desglose que simular: el área
     no registra por día.

   · **Los demás meses son variaciones** de junio con el factor común del
     periodo, ajustadas para que cumplan las mismas reglas que el sistema
     valida. El tomógrafo funciona hasta abril y está inoperativo desde mayo,
     para que el tablero tenga algo que contar.

   La siembra es determinista: mismo periodo, mismas cifras. */

import { PERSONAL, datosVacios } from './imagenes.js';
import { aleatorio, factorDelPeriodo } from '../azar.js';

export const PERIODO_CON_CIFRAS_REALES = '2026-06';

/* Desde este mes el tomógrafo figura inoperativo. Supuesto de la simulación:
   el oficio de junio solo dice que lo estaba ese mes. */
const TOMOGRAFO_INOPERATIVO_DESDE = '2026-05';

const porServicio = ([ce, emerg, hosp]) => ({ ce, emerg, hosp });
const m = (sis, convenio, pagado) => ({ sis: porServicio(sis), convenio: porServicio(convenio), pagado: porServicio(pagado) });
const ceros = () => m([0, 0, 0], [0, 0, 0], [0, 0, 0]);

/* ------------------------------------------ el oficio real de junio de 2026 */

const ECO_JUNIO = Object.freeze([
  { nombre: 'Dr. Julio Canelo Torres', pacientes: 303, examenes: m([145, 71, 86], [19, 1, 0], [8, 1, 0]), monto: 530 },
  { nombre: 'Dra. Rosa Quezada Torres', pacientes: 122, examenes: m([117, 0, 9], [6, 0, 0], [1, 0, 0]), monto: 50 },
  { nombre: 'Dr. Golbert Isern Babilonia', pacientes: 191, examenes: m([71, 82, 51], [7, 1, 0], [4, 0, 0]), monto: 265 },
  { nombre: 'Dr. Jorge Miguel Sibina Vela', pacientes: 290, examenes: m([112, 105, 50], [17, 1, 0], [6, 1, 1]), monto: 320 },
]);

const BIOPSIAS_JUNIO = Object.freeze([
  { nombre: 'Dra. Rosa Quezada Torres', pacientes: 39, examenes: m([34, 0, 5], [3, 0, 0], [1, 0, 0]), monto: 88 },
]);

const ONCOLOGICOS_JUNIO = Object.freeze([
  { nombre: 'Dra. Rosa Quezada Torres', pacientes: 10, examenes: m([10, 0, 9], [1, 0, 0], [0, 0, 0]), monto: 0 },
]);

/* La casilla de pagados en consulta externa está en blanco en el papel. Se
   conserva en blanco: es lo que el área envió. */
const MAMO_JUNIO = Object.freeze({ pacientes: 385, examenes: m([287, 0, 0], [3, 0, 0], [null, 0, 0]), campana: 95, monto: 385, lectura: 385 });

const RX_JUNIO = Object.freeze({
  examenes: { hosp: 293, emerg: 580, ce: 499 },
  pacientes: 1100,
  placas: 0,
  tecnologos: [103, 221, 208, 296, 227, 81, 207, 29],
  particulares: 117,
  monto: 5089,
  lectura: 25,
});

/* ------------------------------------------------------------- variación */

function escalar(valor, factor, clave) {
  if (!valor) return 0;
  return Math.max(1, Math.round(valor * factor * (0.9 + aleatorio(clave) * 0.2)));
}

function escalarMatriz(matriz, factor, clave) {
  return Object.fromEntries(
    Object.entries(matriz).map(([fin, servicios]) => [
      fin,
      Object.fromEntries(Object.entries(servicios).map(([s, v]) => [s, escalar(v, factor, `${clave}.${fin}.${s}`)])),
    ]),
  );
}

const total = (matriz) => Object.values(matriz).reduce((a, s) => a + Object.values(s).reduce((x, v) => x + (v ?? 0), 0), 0);
const pagados = (matriz) => Object.values(matriz.pagado).reduce((a, v) => a + (v ?? 0), 0);

/* Reparte un total entre pesos, con suma exacta: si no lo fuera, los
   tecnólogos dejarían de cuadrar con los exámenes atendidos y el propio
   sistema marcaría error en sus datos de ejemplo. */
function repartir(totalARepartir, pesos) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  const valores = pesos.map((p) => Math.floor((totalARepartir * p) / suma));
  let resto = totalARepartir - valores.reduce((a, b) => a + b, 0);
  for (let i = 0; resto > 0; i = (i + 1) % valores.length, resto -= 1) valores[i] += 1;
  return valores;
}

/* Una fila de profesional variada: pacientes y monto guardan la proporción
   que tenían en junio con sus exámenes y sus pagados. */
function variarFila(fila, factor, clave) {
  const examenes = escalarMatriz(fila.examenes, factor, clave);
  const e = total(examenes);
  const pagadosJunio = pagados(fila.examenes);
  return {
    nombre: fila.nombre,
    pacientes: Math.min(e, Math.round(e * (fila.pacientes / total(fila.examenes)))),
    examenes,
    monto: pagadosJunio ? Math.round(pagados(examenes) * (fila.monto / pagadosJunio)) : 0,
  };
}

const conIds = (filas, prefijo) => filas.map((f, i) => ({ id: `${prefijo}-${i + 1}`, ...f }));
const personas = (nombres, cantidades, prefijo) => nombres.map((nombre, i) => ({ id: `${prefijo}-${i + 1}`, nombre, cantidad: cantidades[i] }));

/* ------------------------------------------------------------------ siembra */

export function datosDeImagenes(periodo, { parcial = false } = {}) {
  const real = periodo === PERIODO_CON_CIFRAS_REALES;
  const factor = factorDelPeriodo(periodo);
  const clon = (x) => structuredClone(x);
  const variar = (filas, prefijo) => (real ? clon(filas) : filas.map((f, i) => variarFila(f, factor, `${periodo}:${prefijo}:${i}`)));

  const f1 = {
    examenes: conIds(variar(ECO_JUNIO, 'eco'), 'eco'),
    biopsias: conIds(variar(BIOPSIAS_JUNIO, 'bio'), 'bio'),
    oncologicos: conIds(variar(ONCOLOGICOS_JUNIO, 'onc'), 'onc'),
  };

  /* Un reporte a medio llenar trae solo la hoja de ecografía. */
  if (parcial) return { ...datosVacios(), f1 };

  /* Formato 2 · tomografía */
  let f2;
  if (real || periodo >= TOMOGRAFO_INOPERATIVO_DESDE) {
    f2 = { inoperativo: true, nota: 'Tomógrafo inoperativo', pacientes: 0, examenes: ceros(), monto: 0, informes: personas(PERSONAL.lecturaTomografia, [0, 0], 'tac') };
  } else {
    const examenes = escalarMatriz(m([95, 140, 70], [6, 3, 1], [18, 4, 1]), factor, `${periodo}:tac`);
    const e = total(examenes);
    const sibina = Math.round(e * 0.55);
    f2 = { inoperativo: false, nota: '', pacientes: Math.round(e * 0.93), examenes, monto: pagados(examenes) * 180, informes: personas(PERSONAL.lecturaTomografia, [sibina, e - sibina], 'tac') };
  }

  /* Formato 3 · mamografía. Las campañas no son de todos los meses. */
  let f3;
  if (real) {
    f3 = { pacientes: MAMO_JUNIO.pacientes, examenes: clon(MAMO_JUNIO.examenes), campana: MAMO_JUNIO.campana, monto: MAMO_JUNIO.monto, informes: personas(PERSONAL.lecturaMamografia, [MAMO_JUNIO.lectura], 'mam') };
  } else {
    const examenes = escalarMatriz(m([287, 0, 0], [3, 0, 0], [2, 0, 0]), factor, `${periodo}:mam`);
    const campana = aleatorio(`${periodo}:campana`) < 0.5 ? 0 : escalar(95, factor, `${periodo}:campana-n`);
    const e = total(examenes) + campana;
    f3 = { pacientes: e, examenes, campana, monto: pagados(examenes) * 35, informes: personas(PERSONAL.lecturaMamografia, [e], 'mam') };
  }

  /* Formato 4 · Rayos X */
  let f4;
  if (real) {
    f4 = { ...clon(RX_JUNIO), tecnologos: personas(PERSONAL.tecnologosRx, RX_JUNIO.tecnologos, 'tec'), informes: personas(PERSONAL.lecturaRx, [RX_JUNIO.lectura], 'lrx') };
    delete f4.lectura;
  } else {
    const examenes = Object.fromEntries(Object.entries(RX_JUNIO.examenes).map(([s, v]) => [s, escalar(v, factor, `${periodo}:rx:${s}`)]));
    const e = Object.values(examenes).reduce((a, b) => a + b, 0);
    const pacientes = Math.min(e, Math.round(e * (RX_JUNIO.pacientes / 1372)));
    const particulares = Math.min(pacientes, escalar(RX_JUNIO.particulares, factor, `${periodo}:rx:part`));
    f4 = {
      examenes,
      pacientes,
      placas: 0,
      tecnologos: personas(PERSONAL.tecnologosRx, repartir(e, RX_JUNIO.tecnologos), 'tec'),
      particulares,
      monto: Math.round(particulares * (RX_JUNIO.monto / RX_JUNIO.particulares)),
      informes: personas(PERSONAL.lecturaRx, [Math.min(e, escalar(RX_JUNIO.lectura, factor, `${periodo}:rx:lec`))], 'lrx'),
    };
  }

  return { f1, f2, f3, f4 };
}
