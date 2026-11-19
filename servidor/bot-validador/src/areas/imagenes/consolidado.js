/* El consolidado anual de Diagnóstico por Imágenes: los exámenes de cada
   modalidad, mes a mes, con el acumulado del año, armado con los meses
   ENTREGADOS. Un mes sin reporte entregado queda vacío, no en cero. */

import { totalesCuadro, examenesF2, examenesF3, examenesF4, sumar, totalMatriz } from './calculos.js';
import { CUADROS_ECO, SERVICIOS } from './definicion.js';
import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';
import { anidarCuadros } from '../../anidar.js';

export const MESES = Object.freeze(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']);

/* Cada modalidad: con los formatos (f1…f4) si el mes los trae; si solo trae
   los cuadros planos de la base (eco, tac, mam, rx), con ellos. */
const MODALIDADES = Object.freeze([
  { id: 'rayosX', titulo: 'Rayos X', de: (d) => (d.f4 ? examenesF4(d.f4) : sumar(SERVICIOS.map((s) => d.rx?.examenes?.[s.clave]))) },
  { id: 'ecografia', titulo: 'Ecografía', de: (d) => (d.f1 ? totalesCuadro(d.f1.examenes).examenes : totalMatriz(d.eco?.examenes)) },
  { id: 'biopsias', titulo: 'Biopsias', de: (d) => (d.f1 ? totalesCuadro(d.f1.biopsias).examenes : totalMatriz(d.eco?.biopsias)) },
  { id: 'oncologicos', titulo: 'Procedimientos oncológicos', de: (d) => (d.f1 ? totalesCuadro(d.f1.oncologicos).examenes : totalMatriz(d.eco?.oncologicos)) },
  { id: 'tomografia', titulo: 'Tomografía', de: (d) => (d.f2 ? examenesF2(d.f2) : totalMatriz(d.tac?.examenes)) },
  { id: 'mamografia', titulo: 'Mamografía (con campaña)', de: (d) => (d.f3 ? examenesF3(d.f3) : sumar([totalMatriz(d.mam?.examenes), d.mam?.campana])) },
]);

const montoDe = (d) =>
  d.f1
    ? sumar([...CUADROS_ECO.map((c) => totalesCuadro(d.f1[c.clave]).monto), d.f2?.monto, d.f3?.monto, d.f4?.monto])
    : sumar([...CUADROS_ECO.map((c) => d.eco?.[c.clave]?.monto), d.tac?.monto, d.mam?.monto, d.rx?.monto]);

export function consolidadoDe(anio, meses) {
  const entregados = (meses ?? []).filter((m) => m.periodo.startsWith(`${anio}-`) && m.datos);
  const delMes = (i) => entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1);
  const serie = (fn) => {
    const porMes = MESES.map((_, i) => {
      const m = delMes(i);
      return m ? fn(anidarCuadros(m.datos, ['eco', 'tac', 'mam', 'rx'])) : null;
    });
    return { porMes, acumulado: sumar(porMes) };
  };
  const modalidades = MODALIDADES.map((m) => ({ id: m.id, titulo: m.titulo, ...serie(m.de) }));
  return {
    anio: String(anio),
    meses: MESES,
    conDato: MESES.map((_, i) => Boolean(delMes(i))),
    modalidades,
    total: serie((d) => sumar(MODALIDADES.map((m) => m.de(d)))),
    monto: serie(montoDe),
  };
}

export function crearConsolidado(anio, meses, { generado } = {}) {
  const c = consolidadoDe(anio, meses);
  const ultima = letraDeColumna(14);
  const filas = [];
  const combinadas = [];
  const fila = (titulo, s, total = false) => [{ v: titulo, estilo: total ? ESTILO.total : ESTILO.etiqueta }, ...s.porMes.map((v) => ({ v, estilo: total ? ESTILO.total : ESTILO.entrada })), { v: s.acumulado, estilo: ESTILO.total }];

  filas.push([{ v: `DEPARTAMENTO DE DIAGNÓSTICO POR IMÁGENES / ${anio}`, estilo: ESTILO.titulo }]);
  combinadas.push(`A1:${ultima}1`);
  filas.push([{ v: 'EXÁMENES POR MODALIDAD', estilo: ESTILO.etiqueta }]);
  combinadas.push(`A2:${ultima}2`);
  filas.push([{ v: null, estilo: ESTILO.cabecera }, ...c.meses.map((m) => ({ v: m, estilo: ESTILO.cabecera })), { v: 'ACUMULADO', estilo: ESTILO.cabecera }]);
  for (const m of c.modalidades) filas.push(fila(m.titulo, m));
  filas.push(fila('Total de exámenes', c.total, true));
  filas.push(fila('Monto en soles', c.monto));

  const conDato = c.conDato.filter(Boolean).length;
  filas.push([{ v: `Generado por el Sistema de Reporte Estadístico${generado ? ` el ${generado}` : ''} con ${conDato} ${conDato === 1 ? 'mes entregado' : 'meses entregados'}. Un mes en blanco no tiene reporte: no es cero.`, estilo: ESTILO.nota }]);
  combinadas.push(`A${filas.length}:${ultima}${filas.length}`);
  return crearLibro({ hojas: [{ nombre: `TOTAL ${anio}`, primera: true, filas, anchos: [34, ...Array(12).fill(10), 12], combinadas }] });
}

export function nombreDelConsolidado(anio) {
  return `Imagenes_TOTAL_${anio}.xlsx`;
}
