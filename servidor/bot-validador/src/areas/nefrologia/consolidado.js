/* El consolidado anual de Nefrología y Hemodiálisis: cada indicador del
   cuadro, mes a mes, con el acumulado del año.

   El servicio no sube un Excel ni tiene una hoja CONSOLIDADO: su propio Word
   ya es, en cierto sentido, un consolidado del año (un indicador por fila, un
   mes por columna). Pero lo que la base guarda de cada reporte es solo la
   columna del mes que se envió, así que el consolidado se arma aquí, como en
   Lavandería y Farmacia, con los meses ENTREGADOS, y se descarga como un
   .xlsx propio. Un mes sin reporte entregado queda vacío, no en cero. */

import { INDICADORES } from './definicion.js';
import { totalDelMes } from './calculos.js';
import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';

export const MESES = Object.freeze(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']);

function delAnio(anio, meses) {
  return (meses ?? []).filter((m) => m.periodo.startsWith(`${anio}-`) && m.datos);
}

const sumar = (valores) => {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  return registrados.length ? registrados.reduce((a, b) => a + b, 0) : null;
};

export function consolidadoDe(anio, meses) {
  const entregados = delAnio(anio, meses);
  const porMesDe = (clave) =>
    MESES.map((_, i) => {
      const m = entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1);
      return m ? (m.datos.f1?.[clave] ?? null) : null;
    });

  const indicadores = INDICADORES.map((ind) => {
    const porMes = porMesDe(ind.clave);
    return { id: ind.clave, titulo: ind.nombre, porMes, acumulado: sumar(porMes) };
  });

  const porMesTotal = MESES.map((_, i) => {
    const m = entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1);
    return m ? totalDelMes(m.datos.f1) : null;
  });

  return {
    anio: String(anio),
    meses: MESES,
    conDato: MESES.map((_, i) => entregados.some((m) => Number(m.periodo.slice(5, 7)) === i + 1)),
    indicadores,
    total: { porMes: porMesTotal, acumulado: sumar(porMesTotal) },
  };
}

/* El .xlsx: los meses en columnas, un indicador por fila, el acumulado del
   año. Las sumas son fórmulas, y solo existen donde hay meses que sumar. */
export function crearConsolidado(anio, meses, { generado } = {}) {
  const c = consolidadoDe(anio, meses);
  const COL_ACUMULADO = 14; // N
  const ultima = letraDeColumna(COL_ACUMULADO);
  const filas = [];
  const combinadas = [];
  const celdaMes = (v) => (v == null ? { v: null, estilo: ESTILO.entrada } : { v, estilo: ESTILO.entrada });

  filas.push([{ v: `SERVICIO DE NEFROLOGÍA Y HEMODIÁLISIS / ${anio}`, estilo: ESTILO.titulo }]);
  combinadas.push(`A1:${ultima}1`);
  filas.push([{ v: 'ATENCIONES EJECUTADAS, POR INDICADOR', estilo: ESTILO.etiqueta }]);
  combinadas.push(`A2:${ultima}2`);
  filas.push([{ v: null, estilo: ESTILO.cabecera }, ...c.meses.map((m) => ({ v: m, estilo: ESTILO.cabecera })), { v: 'ACUMULADO', estilo: ESTILO.cabecera }]);

  for (const ind of c.indicadores) {
    /* «Total de sesiones atendidas» ya es uno de los indicadores del cuadro
       (la propia fila final del Word): se resalta, no se repite aparte. */
    const esTotal = ind.id === 'total_sesiones';
    filas.push([
      { v: ind.titulo, estilo: esTotal ? ESTILO.total : ESTILO.etiqueta },
      ...ind.porMes.map((v) => (esTotal ? { v, estilo: ESTILO.total } : celdaMes(v))),
      { v: ind.acumulado, estilo: ESTILO.total },
    ]);
  }

  const conDato = c.conDato.filter(Boolean).length;
  filas.push([{ v: `Generado por el Sistema de Reporte Estadístico${generado ? ` el ${generado}` : ''} con ${conDato} ${conDato === 1 ? 'mes enviado' : 'meses enviados'}. Un mes en blanco no tiene reporte: no es cero.`, estilo: ESTILO.nota }]);
  combinadas.push(`A${filas.length}:${ultima}${filas.length}`);

  return crearLibro({
    hojas: [{ nombre: `TOTAL ${anio}`, primera: true, filas, anchos: [40, ...Array(12).fill(10), 12], combinadas }],
  });
}

export function nombreDelConsolidado(anio) {
  return `Nefrologia_TOTAL_${anio}.xlsx`;
}
