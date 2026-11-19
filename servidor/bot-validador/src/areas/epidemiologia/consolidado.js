/* El consolidado anual de Epidemiología: los casos de cada columna de la
   tabla, mes a mes, con el acumulado del año, armado con los meses
   ENTREGADOS (como Nefrología y Farmacia). Un mes sin reporte entregado queda
   vacío, no en cero: cero casos es un dato; un mes sin oficio, no. */

import { GRUPOS } from './definicion.js';
import { totalGrupo, infeccionesDelMes } from './calculos.js';
import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';
import { anidarCuadros } from '../../anidar.js';

export const MESES = Object.freeze(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']);

const sumar = (valores) => {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  return registrados.length ? registrados.reduce((a, b) => a + b, 0) : null;
};

export function consolidadoDe(anio, meses) {
  const entregados = (meses ?? []).filter((m) => m.periodo.startsWith(`${anio}-`) && m.datos);
  const delMes = (i) => entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1);
  const serie = (fn) => {
    const porMes = MESES.map((_, i) => {
      const m = delMes(i);
      return m ? fn(anidarCuadros(m.datos, ['f1']).f1) : null;
    });
    return { porMes, acumulado: sumar(porMes) };
  };

  return {
    anio: String(anio),
    meses: MESES,
    conDato: MESES.map((_, i) => Boolean(delMes(i))),
    grupos: GRUPOS.map((g) => ({ id: g.clave, titulo: g.label, infeccion: g.infeccion, ...serie((f1) => totalGrupo(f1, g.clave) ?? 0) })),
    infecciones: serie((f1) => infeccionesDelMes(f1) ?? 0),
  };
}

export function crearConsolidado(anio, meses, { generado } = {}) {
  const c = consolidadoDe(anio, meses);
  const ultima = letraDeColumna(14);
  const filas = [];
  const combinadas = [];
  const fila = (titulo, serie, estilo) => [{ v: titulo, estilo }, ...serie.porMes.map((v) => ({ v, estilo: estilo === ESTILO.total ? ESTILO.total : ESTILO.entrada })), { v: serie.acumulado, estilo: ESTILO.total }];

  filas.push([{ v: `OFICINA DE EPIDEMIOLOGÍA / ${anio}`, estilo: ESTILO.titulo }]);
  combinadas.push(`A1:${ultima}1`);
  filas.push([{ v: 'CASOS NUEVOS DE INFECCIONES INTRAHOSPITALARIAS, POR SERVICIO', estilo: ESTILO.etiqueta }]);
  combinadas.push(`A2:${ultima}2`);
  filas.push([{ v: null, estilo: ESTILO.cabecera }, ...c.meses.map((m) => ({ v: m, estilo: ESTILO.cabecera })), { v: 'ACUMULADO', estilo: ESTILO.cabecera }]);
  for (const g of c.grupos.filter((x) => x.infeccion)) filas.push(fila(g.titulo, g, ESTILO.etiqueta));
  filas.push(fila('Pacientes con infección intrahospitalaria', c.infecciones, ESTILO.total));
  for (const g of c.grupos.filter((x) => !x.infeccion)) filas.push(fila(g.titulo, g, ESTILO.etiqueta));

  const conDato = c.conDato.filter(Boolean).length;
  filas.push([{ v: `Generado por el Sistema de Reporte Estadístico${generado ? ` el ${generado}` : ''} con ${conDato} ${conDato === 1 ? 'mes entregado' : 'meses entregados'}. Un mes en blanco no tiene reporte: no es cero. Las muertes neonatales y maternas no suman a las infecciones.`, estilo: ESTILO.nota }]);
  combinadas.push(`A${filas.length}:${ultima}${filas.length}`);

  return crearLibro({ hojas: [{ nombre: `TOTAL ${anio}`, primera: true, filas, anchos: [46, ...Array(12).fill(10), 12], combinadas }] });
}

export function nombreDelConsolidado(anio) {
  return `Epidemiologia_IIH_${anio}.xlsx`;
}
