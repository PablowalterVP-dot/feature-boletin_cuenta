/* El consolidado anual de Nutrición y Dietética: el «TOTAL» del área.

   Hasta 2026 el área lo armaba a mano (TOTAL.xlsx): copiaba el total de cada
   uno de los cuatro reportes de cada mes. Se comprobó que sus cifras de enero a
   setiembre coinciden una por una con los meses, pero desde febrero estaban
   escritas como texto («20, 233»), y Excel no las sumaba. Aquí el bot lo arma
   con los totales de los meses ya enviados, con números de verdad y fórmulas.

     Comensales   Hospitalización (f1) · Emergencia (f2) · Total
     Pacientes    Hospitalización (f3) · Emergencia (f4) · Total
     Comensales y pacientes · Total

   Un mes sin reporte queda vacío, no en cero: un cero afirmaría que se midió.
   La meta anual no está registrada todavía: dice «Meta no definida», no 0. */

import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';

/* Así nombra los meses el TOTAL.xlsx del área. */
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

export const BLOQUES = Object.freeze([
  Object.freeze({ id: 'comensales', titulo: 'COMENSALES', filas: Object.freeze([['HOSPITALIZACION', 'f1'], ['EMERGENCIA', 'f2']]) }),
  Object.freeze({ id: 'pacientes', titulo: 'PACIENTES', filas: Object.freeze([['HOSPITALIZACION', 'f3'], ['EMERGENCIA', 'f4']]) }),
]);

export const META_NO_DEFINIDA = 'Meta no definida';

const sumar = (lista) => {
  const con = lista.filter((v) => v != null);
  return con.length ? con.reduce((a, b) => a + b, 0) : null;
};

/* meses: [{ periodo: 'AAAA-MM', totales: { f1, f2, f3, f4 } }] de un año.
   Devuelve, por mes (12), cada fila del consolidado; null donde no hay dato. */
export function consolidadoDe(anio, meses) {
  const porMes = Array.from({ length: 12 }, (_, i) => meses.find((m) => m.periodo === `${anio}-${String(i + 1).padStart(2, '0')}`) ?? null);
  const fila = (f) => porMes.map((m) => (m ? (m.totales?.[f] ?? null) : null));
  const bloques = BLOQUES.map((b) => {
    const filas = b.filas.map(([etiqueta, f]) => ({ etiqueta, formato: f, valores: fila(f) }));
    const total = porMes.map((_, i) => sumar(filas.map((x) => x.valores[i])));
    return { ...b, filas, total };
  });
  const general = porMes.map((_, i) => sumar(bloques.map((b) => b.total[i])));
  const acumulado = (valores) => sumar(valores);
  return {
    anio,
    meses: MESES,
    conDato: porMes.map((m) => Boolean(m)),
    bloques: bloques.map((b) => ({ ...b, filas: b.filas.map((x) => ({ ...x, acumulado: acumulado(x.valores) })), acumulado: acumulado(b.total) })),
    general,
    acumuladoGeneral: acumulado(general),
  };
}

/* El .xlsx, con el diseño del TOTAL.xlsx del área: un bloque por población,
   los meses en columnas, el acumulado del año y la meta. Las sumas son
   fórmulas, y solo existen donde hay meses que sumar. */
export function crearConsolidado(anio, meses, { generado } = {}) {
  const c = consolidadoDe(anio, meses);
  const COL_ACUMULADO = 14; // N
  const COL_META = 15; // O
  const ultima = letraDeColumna(COL_META);
  const filas = [];
  const combinadas = [];
  const cabecera = () => [{ v: null, estilo: ESTILO.cabecera }, ...c.meses.map((m) => ({ v: m, estilo: ESTILO.cabecera })), { v: 'ACUMULADO', estilo: ESTILO.cabecera }, { v: 'META ANUAL', estilo: ESTILO.cabecera }];
  const celdaMes = (v) => (v == null ? { v: null, estilo: ESTILO.entrada } : { v, estilo: ESTILO.entrada });
  /* Total de un mes como fórmula de las filas de arriba, solo si hay dato. */
  const formulaMes = (i, filasExcel, valor) =>
    valor == null ? { v: null, estilo: ESTILO.total } : { f: filasExcel.map((r) => `${letraDeColumna(i + 2)}${r}`).join('+'), v: valor, estilo: ESTILO.total };
  const formulaAcumulado = (r, valor) => (valor == null ? { v: null, estilo: ESTILO.total } : { f: `SUM(B${r}:M${r})`, v: valor, estilo: ESTILO.total });
  const meta = () => ({ v: META_NO_DEFINIDA, estilo: ESTILO.nota });

  filas.push([{ v: `SERVICIO DE NUTRICIÓN Y DIETÉTICA / ${anio}`, estilo: ESTILO.titulo }]);
  combinadas.push(`A1:${ultima}1`);
  filas.push([{ v: 'TOTAL DE RACIONES ATENDIDAS', estilo: ESTILO.etiqueta }]);
  combinadas.push(`A2:${ultima}2`);

  const filasDeTotal = [];
  for (const b of c.bloques) {
    filas.push([{ v: b.titulo, estilo: ESTILO.cabecera }]);
    combinadas.push(`A${filas.length}:${ultima}${filas.length}`);
    filas.push(cabecera());
    const filasDatos = [];
    for (const x of b.filas) {
      filas.push([{ v: x.etiqueta, estilo: ESTILO.etiqueta }, ...x.valores.map(celdaMes), formulaAcumulado(filas.length + 1, x.acumulado), meta()]);
      filasDatos.push(filas.length);
    }
    const rTotal = filas.length + 1;
    filas.push([{ v: 'TOTAL', estilo: ESTILO.total }, ...b.total.map((v, i) => formulaMes(i, filasDatos, v)), formulaAcumulado(rTotal, b.acumulado), meta()]);
    filasDeTotal.push(rTotal);
    filas.push([null]);
  }

  filas.push([{ v: 'COMENSALES Y PACIENTES', estilo: ESTILO.cabecera }]);
  combinadas.push(`A${filas.length}:${ultima}${filas.length}`);
  filas.push(cabecera());
  const rGeneral = filas.length + 1;
  filas.push([{ v: 'TOTAL', estilo: ESTILO.total }, ...c.general.map((v, i) => formulaMes(i, filasDeTotal, v)), formulaAcumulado(rGeneral, c.acumuladoGeneral), meta()]);
  filas.push([null]);
  const conDato = c.conDato.filter(Boolean).length;
  filas.push([{ v: `Generado por el Sistema de Reporte Estadístico${generado ? ` el ${generado}` : ''} con ${conDato} ${conDato === 1 ? 'mes enviado' : 'meses enviados'}. Un mes en blanco no tiene reporte: no es cero.`, estilo: ESTILO.nota }]);
  combinadas.push(`A${filas.length}:${ultima}${filas.length}`);

  return crearLibro({
    hojas: [{ nombre: `TOTAL ${anio}`, primera: true, filas, anchos: [24, ...Array(12).fill(12), 13, 16], combinadas }],
  });
}

export function nombreDelConsolidado(anio) {
  return `Nutricion_TOTAL_${anio}.xlsx`;
}
