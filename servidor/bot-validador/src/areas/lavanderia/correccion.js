/* Corrección del reporte de Lavandería sobre su propio Excel.

   El mismo contrato que Nutrición (nutricion/correccion.js): lo corregido se
   escribe en una copia del libro del área, que vuelve a pasar por el bot.
   Lo propio de Lavandería:

     · las casillas que se corrigen:
         `f1|servicio|día`        los kilos de un servicio en un día
         `f3|comun|día`           la ropa sucia común (o `sucia`) de un día
         `f4|grupo`               las piezas de un grupo del consolidado
         `escrito|f1|servicio`    el TOTAL de un servicio; `escrito|f1|_total`
                                  el del cuadro; `escrito|f3|comun` (y `sucia`)
                                  y `escrito|f4|_total`, los demás totales
     · confección (f2) y los insumos son texto: no hay cifra que corregir;
     · el lector guarda dónde empieza cada fila de kilos (la columna del día
       1): `expandirOrigen` calcula la celda de cada día.

   LAS FÓRMULAS: el TOTAL de cada servicio suma sus días; el del cuadro suma
   los totales de los servicios; los de ropa sucia y piezas suman sus
   casillas. Si son fórmula y nadie los cambió a mano, su valor guardado se
   recalcula con lo corregido (Excel recalcula al abrir; el bot lee lo
   guardado). Aquí se recalcula en vez de sumar la diferencia, como hace
   Nutrición, porque cada fórmula es una SUMA exacta de sus casillas: si el
   valor guardado no cuadraba con ellas, sumarle la diferencia lo arrastraría. */

import { SERVICIOS, GRUPOS, filaDe } from './definicion.js';
import { letraDeColumna } from '../../xlsx.js';

const columnaANumero = (letras) => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const CATEGORIAS = Object.freeze({ comun: 'común', sucia: 'sucia' });

function partes(casilla) {
  const p = casilla.split('|');
  if (p[0] === 'escrito') return { tipo: 'escrito', cuadro: p[1], clave: p[2] ?? null };
  return { tipo: 'dato', cuadro: p[0], clave: p[1] ?? null, dia: p[2] ? Number(p[2]) : null };
}

function esCasilla(casilla) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') {
    if (p.cuadro === 'f1') return p.clave === '_total' || Boolean(filaDe('f1', p.clave));
    if (p.cuadro === 'f3') return p.clave in CATEGORIAS;
    return p.cuadro === 'f4' && p.clave === '_total';
  }
  if (p.cuadro === 'f1') return Boolean(p.dia && filaDe('f1', p.clave));
  if (p.cuadro === 'f3') return Boolean(p.dia && p.clave in CATEGORIAS);
  return p.cuadro === 'f4' && GRUPOS.some((g) => g.clave === p.clave);
}

export function etiquetaDe(casilla) {
  const p = partes(casilla);
  const servicio = (k) => SERVICIOS.find((s) => s.clave === k)?.rotulo ?? k;
  const grupo = (k) => GRUPOS.find((g) => g.clave === k)?.rotulo ?? k;
  if (p.tipo === 'escrito') {
    if (p.cuadro === 'f1') return p.clave === '_total' ? 'Kilos por servicio · TOTAL del cuadro' : `Kilos por servicio · ${servicio(p.clave)} · TOTAL`;
    if (p.cuadro === 'f3') return `Ropa sucia · ${CATEGORIAS[p.clave]} · TOTAL`;
    return 'Consolidado · TOTAL de piezas';
  }
  if (p.cuadro === 'f1') return `Kilos por servicio · ${servicio(p.clave)} · día ${p.dia}`;
  if (p.cuadro === 'f3') return `Ropa sucia · ${CATEGORIAS[p.clave]} · día ${p.dia}`;
  return `Consolidado · ${grupo(p.clave)} · piezas`;
}

/* El valor de una casilla en unos datos: { valor, ilegible }. */
export function leer(datos, casilla) {
  const p = partes(casilla);
  const numero = (v) => (typeof v === 'number' ? v : null);
  if (p.tipo === 'escrito') return { valor: numero(datos?.declarados?.[p.cuadro]?.[p.clave]), ilegible: null };
  const ilegible = datos?.ilegibles?.[casilla] ?? null;
  if (p.cuadro === 'f1') return { valor: numero(datos?.f1?.[p.clave]?.[p.dia - 1]), ilegible };
  if (p.cuadro === 'f3') return { valor: numero(datos?.f3?.[p.clave]?.[p.dia - 1]), ilegible };
  return { valor: numero(datos?.f4?.piezas?.[p.clave]), ilegible };
}

function escribir(datos, casilla, v) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') {
    ((datos.declarados ??= {})[p.cuadro] ??= {})[p.clave] = v;
    return;
  }
  if (p.cuadro === 'f1' || p.cuadro === 'f3') {
    const cuadro = (datos[p.cuadro] ??= {});
    const fila = [...(cuadro[p.clave] ?? [])];
    fila[p.dia - 1] = v;
    cuadro[p.clave] = fila;
  } else ((datos.f4 ??= {}).piezas ??= {})[p.clave] = v;
  if (datos.ilegibles) delete datos.ilegibles[casilla];
}

/* ------------------------------------------------------ los hallazgos */

/* Qué señala un hallazgo y qué deja corregir. Lavandería lleva el código de
   sus errores en `id` (reglas.js), como Nutrición. */
export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    const formados = ev.sumandos.flatMap((s) => s.casillas ?? []);
    return { total: ev.total.casilla, sumandos: [...directos, ...formados], editables: [ev.total.casilla, ...directos, ...formados] };
  }
  const regla = h.regla ?? h.id;
  if (regla === 'incompleto') {
    const lista = (h.casillas ?? []).map((c) => (typeof c === 'string' ? `${h.formato}|${c}` : `${h.formato}|${c.fila}|${c.dia}`));
    return { total: null, sumandos: lista, editables: lista };
  }
  if ((regla === 'no-numerico' || regla === 'entero' || regla === 'atipico') && h.fila) {
    const c = [h.formato, h.fila, h.dia].filter((x) => x != null).join('|');
    return { total: null, sumandos: [c], editables: [c] };
  }
  return { total: null, sumandos: [], editables: [] };
}

/* --------------------------------------------------- aplicar cambios */

/* Lo que suma cada total escrito, como las fórmulas del libro. */
function entradas(total, base) {
  const t = partes(total);
  if (t.cuadro === 'f1' && t.clave === '_total') return SERVICIOS.map((s) => `escrito|f1|${s.clave}`);
  if (t.cuadro === 'f1' || t.cuadro === 'f3') {
    const dias = base?.[t.cuadro]?.[t.clave]?.length ?? 0;
    return Array.from({ length: dias }, (_, i) => `${t.cuadro}|${t.clave}|${i + 1}`);
  }
  return GRUPOS.map((g) => `f4|${g.clave}`);
}

/* Primero los totales que suman casillas; después el del cuadro de kilos,
   que suma los totales de los servicios. */
const nivelDe = (casilla) => (casilla === 'escrito|f1|_total' ? 2 : 1);

/* Los datos con unos cambios: { casilla: número | null }. No modifica `base`. */
export function aplicar(base, cambios, origen = {}) {
  const datos = structuredClone(base ?? {});
  const delta = new Map();
  for (const [casilla, v] of Object.entries(cambios)) {
    if (!esCasilla(casilla)) continue;
    const antes = leer(base, casilla).valor;
    escribir(datos, casilla, v);
    delta.set(casilla, (v ?? 0) - (antes ?? 0));
  }
  const formulas = Object.entries(origen).filter(([casilla, o]) => o?.formula && !(casilla in cambios) && esCasilla(casilla) && partes(casilla).tipo === 'escrito');
  for (const nivel of [1, 2]) {
    for (const [casilla] of formulas.filter(([k]) => nivelDe(k) === nivel)) {
      const lista = entradas(casilla, base);
      if (!lista.some((e) => delta.get(e))) continue;
      const nuevo = lista.reduce((s, e) => s + (leer(datos, e).valor ?? 0), 0);
      delta.set(casilla, nuevo - (leer(base, casilla).valor ?? 0));
      escribir(datos, casilla, nuevo);
    }
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

/* La celda de cada día de kilos, a partir de dónde empieza su fila. */
export function expandirOrigen(origen = {}, datos = {}) {
  const expandido = { ...origen };
  for (const [clave, o] of Object.entries(origen)) {
    const p = clave.split('|');
    if (p.length !== 2 || p[0] !== 'f1' || !o?.columna) continue;
    const dias = datos?.f1?.[p[1]]?.length ?? 0;
    const inicio = columnaANumero(o.columna);
    for (let d = 1; d <= dias; d += 1) expandido[`f1|${p[1]}|${d}`] = { hoja: o.hoja, fila: o.fila, columna: letraDeColumna(inicio + d - 1) };
  }
  return expandido;
}

/* La hoja de kilos, para el título de la corrección (el libro tiene cuatro). */
export function hojaDe(origen = {}) {
  return Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}
