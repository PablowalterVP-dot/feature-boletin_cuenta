/* El consolidado anual de Farmacia: el total de cada uno de sus tres cuadros
   (Atenciones del mes, Sala de Operaciones y Consultorios externos), mes a
   mes, con el acumulado del año.

   Farmacia no sube un Excel: su informe mensual es un Word (lector.js), y no
   tiene un "libro del año" del que sacar una hoja CONSOLIDADO como Laboratorio.
   Como en Lavandería, el consolidado se arma aquí desde cero con los meses
   ENTREGADOS y se descarga como un .xlsx propio, independiente del formato de
   entrada. Un mes sin reporte entregado queda vacío, no en cero. */

import { CUADROS } from './definicion.js';
import { totalCuadro } from './calculos.js';
import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';

export const MESES = Object.freeze(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']);

function delAnio(anio, meses) {
  return (meses ?? []).filter((m) => m.periodo.startsWith(`${anio}-`) && m.datos);
}

const sumar = (valores) => {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  return registrados.length ? registrados.reduce((a, b) => a + b, 0) : null;
};

/* El total de cada cuadro del año, mes a mes. */
export function consolidadoDe(anio, meses) {
  const entregados = delAnio(anio, meses);
  const porMesDeCuadro = (idCuadro) =>
    MESES.map((_, i) => {
      const m = entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1);
      return m ? totalCuadro(m.datos, idCuadro) : null;
    });

  const cuadros = CUADROS.map((c) => {
    const porMes = porMesDeCuadro(c.id);
    return { id: c.id, titulo: c.titulo, corto: c.corto, unidad: 'atenciones', porMes, acumulado: sumar(porMes) };
  });

  return {
    anio: String(anio),
    meses: MESES,
    conDato: MESES.map((_, i) => entregados.some((m) => Number(m.periodo.slice(5, 7)) === i + 1)),
    cuadros,
  };
}

/* El .xlsx: los meses en columnas, un cuadro por fila, el acumulado del año.
   Las sumas son fórmulas, y solo existen donde hay meses que sumar. */
export function crearConsolidado(anio, meses, { generado } = {}) {
  const c = consolidadoDe(anio, meses);
  const COL_ACUMULADO = 14; // N
  const ultima = letraDeColumna(COL_ACUMULADO);
  const filas = [];
  const combinadas = [];
  const celdaMes = (v) => (v == null ? { v: null, estilo: ESTILO.entrada } : { v, estilo: ESTILO.entrada });

  filas.push([{ v: `DEPARTAMENTO DE FARMACIA / ${anio}`, estilo: ESTILO.titulo }]);
  combinadas.push(`A1:${ultima}1`);
  filas.push([{ v: 'ATENCIONES DEL AÑO, POR CUADRO DEL INFORME MENSUAL', estilo: ESTILO.etiqueta }]);
  combinadas.push(`A2:${ultima}2`);
  filas.push([{ v: null, estilo: ESTILO.cabecera }, ...c.meses.map((m) => ({ v: m, estilo: ESTILO.cabecera })), { v: 'ACUMULADO', estilo: ESTILO.cabecera }]);

  for (const cuadro of c.cuadros) {
    filas.push([{ v: cuadro.titulo, estilo: ESTILO.etiqueta }, ...cuadro.porMes.map(celdaMes), { v: cuadro.acumulado, estilo: ESTILO.total }]);
  }

  const conDato = c.conDato.filter(Boolean).length;
  filas.push([{ v: `Generado por el Sistema de Reporte Estadístico${generado ? ` el ${generado}` : ''} con ${conDato} ${conDato === 1 ? 'mes enviado' : 'meses enviados'}. Un mes en blanco no tiene reporte: no es cero.`, estilo: ESTILO.nota }]);
  combinadas.push(`A${filas.length}:${ultima}${filas.length}`);

  return crearLibro({
    hojas: [{ nombre: `TOTAL ${anio}`, primera: true, filas, anchos: [34, ...Array(12).fill(10), 12], combinadas }],
  });
}

export function nombreDelConsolidado(anio) {
  return `Farmacia_TOTAL_${anio}.xlsx`;
}
