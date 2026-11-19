/* El consolidado anual de Lavandería: los kilogramos de ropa lavada del año,
   por grupo de servicios (los mismos diez grupos del Formato 4 y de la
   sección D del consolidado de servicios intermedios de DIRESA), mes a mes.

   A diferencia de Laboratorio, el reporte de Lavandería es diario (el
   Formato 1 trae un día por columna): no tiene sentido un "Excel del año"
   con la forma de un mes (31 columnas de días para doce meses). Aquí el
   consolidado es, como el de Nutrición, una tabla con los meses en columnas
   y el acumulado del año — pero de kilos por grupo, no de raciones por
   comensal.

   Un mes sin reporte entregado queda vacío, no en cero. */

import { GRUPOS, serviciosDelGrupo } from './definicion.js';
import { totalFila, sumar } from './calculos.js';
import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';

export const MESES = Object.freeze(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']);

function delAnio(anio, meses) {
  return (meses ?? []).filter((m) => m.periodo.startsWith(`${anio}-`) && m.datos);
}

function kilosDelGrupo(datos, claveGrupo, periodo) {
  return sumar(serviciosDelGrupo(claveGrupo).map((s) => totalFila(datos, 'f1', s.clave, periodo)));
}

/* Los kilos del año, grupo por grupo y mes a mes. */
export function consolidadoDe(anio, meses) {
  const entregados = delAnio(anio, meses);
  const porMesDeGrupo = (claveGrupo) =>
    MESES.map((_, i) => {
      const m = entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1);
      return m ? kilosDelGrupo(m.datos, claveGrupo, m.periodo) : null;
    });

  const grupos = GRUPOS.map((g) => {
    const porMes = porMesDeGrupo(g.clave);
    return { id: g.clave, titulo: g.rotulo, unidad: 'kilogramos', porMes, acumulado: sumar(porMes) };
  });
  const porMesTotal = MESES.map((_, i) => sumar(grupos.map((g) => g.porMes[i])));

  return {
    anio: String(anio),
    meses: MESES,
    conDato: MESES.map((_, i) => entregados.some((m) => Number(m.periodo.slice(5, 7)) === i + 1)),
    grupos,
    total: { porMes: porMesTotal, acumulado: sumar(porMesTotal) },
  };
}

/* El .xlsx: los meses en columnas, un grupo por fila, el acumulado del año.
   Las sumas son fórmulas, y solo existen donde hay meses que sumar. */
export function crearConsolidado(anio, meses, { generado } = {}) {
  const c = consolidadoDe(anio, meses);
  const COL_ACUMULADO = 14; // N
  const ultima = letraDeColumna(COL_ACUMULADO);
  const filas = [];
  const combinadas = [];
  const celdaMes = (v) => (v == null ? { v: null, estilo: ESTILO.entrada } : { v, estilo: ESTILO.entrada });

  filas.push([{ v: `AREA DE COSTURA Y LAVANDERIA / ${anio}`, estilo: ESTILO.titulo }]);
  combinadas.push(`A1:${ultima}1`);
  filas.push([{ v: 'KILOGRAMOS DE ROPA LAVADA, POR GRUPO DE SERVICIOS', estilo: ESTILO.etiqueta }]);
  combinadas.push(`A2:${ultima}2`);
  filas.push([{ v: null, estilo: ESTILO.cabecera }, ...c.meses.map((m) => ({ v: m, estilo: ESTILO.cabecera })), { v: 'ACUMULADO', estilo: ESTILO.cabecera }]);

  const filasDatos = [];
  for (const g of c.grupos) {
    filas.push([{ v: g.titulo, estilo: ESTILO.etiqueta }, ...g.porMes.map(celdaMes), { v: g.acumulado, estilo: ESTILO.total }]);
    filasDatos.push(filas.length);
  }

  const rTotal = filas.length + 1;
  filas.push([
    { v: 'TOTAL', estilo: ESTILO.total },
    ...c.total.porMes.map((v, i) =>
      v == null ? { v: null, estilo: ESTILO.total } : { f: filasDatos.map((r) => `${letraDeColumna(i + 2)}${r}`).join('+'), v, estilo: ESTILO.total },
    ),
    c.total.acumulado == null ? { v: null, estilo: ESTILO.total } : { f: `SUM(B${rTotal}:M${rTotal})`, v: c.total.acumulado, estilo: ESTILO.total },
  ]);

  const conDato = c.conDato.filter(Boolean).length;
  filas.push([{ v: `Generado por el Sistema de Reporte Estadístico${generado ? ` el ${generado}` : ''} con ${conDato} ${conDato === 1 ? 'mes enviado' : 'meses enviados'}. Un mes en blanco no tiene reporte: no es cero.`, estilo: ESTILO.nota }]);
  combinadas.push(`A${filas.length}:${ultima}${filas.length}`);

  return crearLibro({
    hojas: [{ nombre: `TOTAL ${anio}`, primera: true, filas, anchos: [34, ...Array(12).fill(10), 12], combinadas }],
  });
}

export function nombreDelConsolidado(anio) {
  return `Lavanderia_TOTAL_${anio}.xlsx`;
}
