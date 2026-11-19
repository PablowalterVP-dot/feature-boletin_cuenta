/* Corrección del reporte de Gineco-Obstetricia sobre su propio Excel.

   El mismo contrato que Laboratorio (laboratorio/correccion.js): lo corregido
   se escribe en una copia del libro del área, que vuelve a pasar por el bot.
   Lo propio de Gineco-Obstetricia:

     · las casillas que se corrigen:
         `f1|edad_15_19.controles_prenatales`  una cifra de un cuadro
         `escrito|f1|controles_prenatales`     la fila TOTAL de esa columna
     · los dos cuadros están en la misma hoja; el lector ya guarda la celda
       de cada casilla, así que no hay nada que expandir.

   LAS FÓRMULAS: cada celda de la fila TOTAL suma su columna. Si es fórmula y
   nadie la cambió a mano, su valor guardado se recalcula con lo corregido
   (Excel recalcula al abrir; el bot lee el valor guardado). */

import { EDADES, TIPOS_PARTO, COLUMNAS_F1, COLUMNAS_F2, claveFila } from './definicion.js';

const CUADROS = Object.freeze({
  f1: { filas: EDADES, columnas: COLUMNAS_F1, titulo: 'Controles prenatales' },
  f2: { filas: TIPOS_PARTO, columnas: COLUMNAS_F2, titulo: 'Partos y nacidos' },
});

function partes(casilla) {
  const p = casilla.split('|');
  if (p[0] === 'escrito') return { tipo: 'escrito', cuadro: p[1], columna: p[2] ?? null };
  const [fila, columna] = (p[1] ?? '').split('.');
  return { tipo: 'dato', cuadro: p[0], fila, columna, clave: p[1] ?? null };
}

function esCasilla(casilla) {
  const p = partes(casilla);
  const c = CUADROS[p.cuadro];
  if (!c || !c.columnas.some((x) => x.clave === p.columna)) return false;
  return p.tipo === 'escrito' || c.filas.some((x) => x.clave === p.fila);
}

export function etiquetaDe(casilla) {
  const p = partes(casilla);
  const c = CUADROS[p.cuadro];
  const columna = c?.columnas.find((x) => x.clave === p.columna)?.nombre ?? p.columna;
  if (p.tipo === 'escrito') return `${c?.titulo} · ${columna} · TOTAL`;
  const fila = c?.filas.find((x) => x.clave === p.fila);
  return `${c?.titulo} · ${fila?.nombre ?? fila?.rotulo ?? p.fila} · ${columna}`;
}

/* El valor de una casilla en unos datos: { valor, ilegible }. */
export function leer(datos, casilla) {
  const p = partes(casilla);
  const numero = (v) => (typeof v === 'number' ? v : null);
  if (p.tipo === 'escrito') return { valor: numero(datos?.escritos?.declarados?.[p.cuadro]?.[p.columna]), ilegible: null };
  return { valor: numero(datos?.[p.cuadro]?.[p.clave]), ilegible: datos?.ilegibles?.[casilla] ?? null };
}

function escribir(datos, casilla, v) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') {
    (((datos.escritos ??= {}).declarados ??= {})[p.cuadro] ??= {})[p.columna] = v;
    return;
  }
  (datos[p.cuadro] ??= {})[p.clave] = v;
  if (datos.ilegibles) delete datos.ilegibles[casilla];
}

/* ------------------------------------------------------ los hallazgos */

/* Qué señala un hallazgo y qué deja corregir. */
export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    return { total: ev.total.casilla, sumandos: directos, editables: [ev.total.casilla, ...directos] };
  }
  const regla = h.regla ?? h.id;
  if (regla === 'incompleto') {
    const lista = (h.casillas ?? []).map((c) => `${h.formato}|${c}`);
    return { total: null, sumandos: lista, editables: lista };
  }
  if ((regla === 'no-numerico' || regla === 'entero') && h.fila) {
    const c = `${h.formato}|${h.fila}`;
    return { total: null, sumandos: [c], editables: [c] };
  }
  return { total: null, sumandos: [], editables: [] };
}

/* --------------------------------------------------- aplicar cambios */

/* Lo que suma cada TOTAL: su columna, fila por fila. */
function entradas(total) {
  const t = partes(total);
  return CUADROS[t.cuadro].filas.map((f) => `${t.cuadro}|${claveFila(f.clave, t.columna)}`);
}

/* Los datos con unos cambios: { casilla: número | null }. No modifica `base`. */
export function aplicar(base, cambios, origen = {}) {
  const datos = structuredClone(base ?? {});
  const cambiadas = new Set();
  for (const [casilla, v] of Object.entries(cambios)) {
    if (!esCasilla(casilla)) continue;
    escribir(datos, casilla, v);
    cambiadas.add(casilla);
  }
  for (const [casilla, o] of Object.entries(origen)) {
    if (!o?.formula || casilla in cambios || !esCasilla(casilla) || partes(casilla).tipo !== 'escrito') continue;
    const lista = entradas(casilla);
    if (!lista.some((e) => cambiadas.has(e))) continue;
    escribir(datos, casilla, lista.reduce((s, e) => s + (leer(datos, e).valor ?? 0), 0));
  }
  return datos;
}

/* Las celdas que cambian, nombradas con su hoja: { 'HOJA!REF': número | null }. */
export function celdasCambiadas(base, datos, origen = {}) {
  const celdas = {};
  for (const [casilla, o] of Object.entries(origen)) {
    if (!o || !esCasilla(casilla)) continue;
    const a = leer(base, casilla);
    const b = leer(datos, casilla);
    if (a.valor === b.valor && a.ilegible === b.ilegible) continue;
    celdas[`${o.hoja}!${o.columna}${o.fila}`] = b.valor;
  }
  return celdas;
}

/* El lector ya trae la celda de cada casilla. */
export function expandirOrigen(origen = {}) {
  return origen;
}

/* La hoja de los cuadros (su nombre cambia de un mes a otro). */
export function hojaDe(origen = {}) {
  return Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}
