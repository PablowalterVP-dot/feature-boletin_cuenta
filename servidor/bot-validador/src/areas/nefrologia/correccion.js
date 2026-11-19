/* Corrección del reporte de Nefrología sobre su propio Word.

   El mismo contrato que las áreas con Excel (laboratorio/correccion.js): lo
   corregido se escribe en una copia del documento del área, que vuelve a
   pasar por el bot. Lo propio de Nefrología:

     · el cuadro es del año entero, un mes por columna; solo se corrige la
       columna del mes del reporte y los totales escritos de la fila:
         `f1|pacientes_atendidos`                   la cifra del mes
         `escrito|f1|pacientes_atendidos|trimestre3` un total escrito (III TRIM)
     · en un Word no hay fórmulas: un total no se ajusta solo, y si una
       corrección lo descuadra, la revalidación lo dice y se corrige también. */

import { INDICADORES, COLUMNAS } from './definicion.js';

function partes(casilla) {
  const p = casilla.split('|');
  if (p[0] === 'escrito') return { tipo: 'escrito', indicador: p[2], columna: p[3] ?? null };
  return { tipo: 'dato', indicador: p[1] ?? null };
}

function esCasilla(casilla) {
  const p = partes(casilla);
  if (!INDICADORES.some((i) => i.clave === p.indicador)) return false;
  return p.tipo === 'dato' || COLUMNAS.some((c) => c.tipo === 'agregado' && c.clave === p.columna);
}

export function etiquetaDe(casilla) {
  const p = partes(casilla);
  const nombre = INDICADORES.find((i) => i.clave === p.indicador)?.nombre ?? p.indicador;
  if (p.tipo === 'escrito') return `${nombre} · ${COLUMNAS.find((c) => c.clave === p.columna)?.etiqueta ?? p.columna}`;
  return `${nombre} · este mes`;
}

/* El valor de una casilla en unos datos: { valor, ilegible }. */
export function leer(datos, casilla) {
  const p = partes(casilla);
  const numero = (v) => (typeof v === 'number' ? v : null);
  if (p.tipo === 'escrito') return { valor: numero(datos?.escritos?.cuadro?.[p.indicador]?.[p.columna]), ilegible: null };
  return { valor: numero(datos?.f1?.[p.indicador]), ilegible: datos?.ilegibles?.[casilla] ?? null };
}

function escribir(datos, casilla, v) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') {
    (((datos.escritos ??= {}).cuadro ??= {})[p.indicador] ??= {})[p.columna] = v;
    return;
  }
  (datos.f1 ??= {})[p.indicador] = v;
  if (datos.ilegibles) delete datos.ilegibles[casilla];
}

/* ------------------------------------------------------ los hallazgos */

export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    return { total: ev.total.casilla, sumandos: directos, editables: [ev.total.casilla, ...directos] };
  }
  const regla = h.regla ?? h.id;
  if (regla === 'incompleto') {
    const lista = (h.casillas ?? []).map((c) => `f1|${c}`);
    return { total: null, sumandos: lista, editables: lista };
  }
  if ((regla === 'no-numerico' || regla === 'entero') && h.fila) {
    const c = `f1|${h.fila}`;
    return { total: null, sumandos: [c], editables: [c] };
  }
  return { total: null, sumandos: [], editables: [] };
}

/* --------------------------------------------------- aplicar cambios */

/* Los datos con unos cambios: { casilla: número | null }. No modifica `base`. */
export function aplicar(base, cambios) {
  const datos = structuredClone(base ?? {});
  for (const [casilla, v] of Object.entries(cambios)) if (esCasilla(casilla)) escribir(datos, casilla, v);
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

export function hojaDe(origen = {}) {
  return Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}
