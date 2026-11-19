/* El consolidado anual de Gineco-Obstetricia: cada columna de los dos
   cuadros (controles prenatales; partos, cesáreas y nacidos), sumada entre
   sus filas, mes a mes, con el acumulado del año.

   El cuadro 2 solo lo trae el Excel real desde setiembre de 2026: los meses
   anteriores no quedan en cero, quedan vacíos (igual que un mes sin reporte
   entregado), porque no es lo mismo «no hubo partos» que «el área no trajo
   este cuadro». */

import { COLUMNAS_F1, COLUMNAS_F2 } from './definicion.js';
import { totalColumna } from './calculos.js';
import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';

export const MESES = Object.freeze(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']);

function delAnio(anio, meses) {
  return (meses ?? []).filter((m) => m.periodo.startsWith(`${anio}-`) && m.datos);
}

const sumar = (valores) => {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  return registrados.length ? registrados.reduce((a, b) => a + b, 0) : null;
};

const INDICADORES = Object.freeze([
  ...COLUMNAS_F1.map((c) => ({ id: `f1.${c.clave}`, titulo: c.nombre, cuadro: 'f1', columna: c.clave })),
  ...COLUMNAS_F2.map((c) => ({ id: `f2.${c.clave}`, titulo: c.nombre, cuadro: 'f2', columna: c.clave })),
]);

export function consolidadoDe(anio, meses) {
  const entregados = delAnio(anio, meses);
  const porMesDe = (cuadro, columna) =>
    MESES.map((_, i) => {
      const m = entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1);
      if (!m) return null;
      return totalColumna(m.datos, cuadro, columna);
    });

  const indicadores = INDICADORES.map((ind) => {
    const porMes = porMesDe(ind.cuadro, ind.columna);
    return { id: ind.id, titulo: ind.titulo, cuadro: ind.cuadro, porMes, acumulado: sumar(porMes) };
  });

  return {
    anio: String(anio),
    meses: MESES,
    conDato: MESES.map((_, i) => entregados.some((m) => Number(m.periodo.slice(5, 7)) === i + 1)),
    indicadores,
  };
}

export function crearConsolidado(anio, meses, { generado } = {}) {
  const c = consolidadoDe(anio, meses);
  const COL_ACUMULADO = 14; // N
  const ultima = letraDeColumna(COL_ACUMULADO);
  const filas = [];
  const combinadas = [];
  const celdaMes = (v) => (v == null ? { v: null, estilo: ESTILO.entrada } : { v, estilo: ESTILO.entrada });

  filas.push([{ v: `DEPARTAMENTO DE GINECO-OBSTETRICIA / ${anio}`, estilo: ESTILO.titulo }]);
  combinadas.push(`A1:${ultima}1`);
  filas.push([{ v: 'EVENTOS BAJO VIGILANCIA INSTITUCIONAL, POR CUADRO', estilo: ESTILO.etiqueta }]);
  combinadas.push(`A2:${ultima}2`);
  filas.push([{ v: null, estilo: ESTILO.cabecera }, ...c.meses.map((m) => ({ v: m, estilo: ESTILO.cabecera })), { v: 'ACUMULADO', estilo: ESTILO.cabecera }]);

  let cuadroActual = null;
  for (const ind of c.indicadores) {
    if (ind.cuadro !== cuadroActual) {
      cuadroActual = ind.cuadro;
      const titulo = cuadroActual === 'f1' ? 'CUADRO 1 · CONTROLES PRENATALES' : 'CUADRO 2 · PARTOS, CESÁREAS Y NACIDOS';
      filas.push([{ v: titulo, estilo: ESTILO.etiqueta }]);
      combinadas.push(`A${filas.length}:${ultima}${filas.length}`);
    }
    filas.push([{ v: ind.titulo, estilo: ESTILO.etiqueta }, ...ind.porMes.map(celdaMes), { v: ind.acumulado, estilo: ESTILO.total }]);
  }

  const conDato = c.conDato.filter(Boolean).length;
  filas.push([{ v: `Generado por el Sistema de Reporte Estadístico${generado ? ` el ${generado}` : ''} con ${conDato} ${conDato === 1 ? 'mes enviado' : 'meses enviados'}. Un mes en blanco no tiene reporte, o no trajo ese cuadro: no es cero.`, estilo: ESTILO.nota }]);
  combinadas.push(`A${filas.length}:${ultima}${filas.length}`);

  return crearLibro({
    hojas: [{ nombre: `TOTAL ${anio}`, primera: true, filas, anchos: [46, ...Array(12).fill(10), 12], combinadas }],
  });
}

export function nombreDelConsolidado(anio) {
  return `Ginecologia_TOTAL_${anio}.xlsx`;
}
