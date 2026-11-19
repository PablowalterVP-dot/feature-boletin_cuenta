/* Corrección del reporte de Epidemiología sobre su propio Word.

   El mismo contrato que Nefrología (nefrologia/correccion.js): lo corregido se
   escribe en una copia del oficio del área, que vuelve a pasar por el bot.
   Dos clases de casilla:
     `f1|e20.gineco_f`        los casos de un grupo de edad en una columna
     `escrito|total|gineco_f` el total escrito en la fila TOTAL
   En un Word no hay fórmulas: si una corrección descuadra la fila TOTAL, la
   revalidación lo dice y se corrige también. */

import { EDADES, COLUMNAS, etiquetaColumna } from './definicion.js';

function partes(casilla) {
  const p = casilla.split('|');
  if (p[0] === 'escrito') return { tipo: 'escrito', columna: p[2] };
  const [edad, columna] = String(p[1] ?? '').split('.');
  return { tipo: 'dato', edad, columna };
}

function esCasilla(casilla) {
  const p = partes(casilla);
  if (!COLUMNAS.some((c) => c.clave === p.columna)) return false;
  return p.tipo === 'escrito' || EDADES.some((e) => e.clave === p.edad);
}

export function etiquetaDe(casilla) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') return `TOTAL · ${etiquetaColumna(p.columna)}`;
  return `${etiquetaColumna(p.columna)} · ${EDADES.find((e) => e.clave === p.edad)?.label ?? p.edad}`;
}

export function leer(datos, casilla) {
  const p = partes(casilla);
  const numero = (v) => (typeof v === 'number' ? v : null);
  if (p.tipo === 'escrito') return { valor: numero(datos?.escritos?.total?.[p.columna]), ilegible: null };
  return { valor: numero(datos?.f1?.[p.edad]?.[p.columna]), ilegible: datos?.ilegibles?.[casilla] ?? null };
}

function escribir(datos, casilla, v) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') {
    ((datos.escritos ??= {}).total ??= {})[p.columna] = v;
    return;
  }
  ((datos.f1 ??= {})[p.edad] ??= {})[p.columna] = v;
  if (datos.ilegibles) delete datos.ilegibles[casilla];
}

export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    return { total: ev.total.casilla, sumandos: directos, editables: [ev.total.casilla, ...directos] };
  }
  if (h.fila) {
    const c = `f1|${h.fila}`;
    return { total: null, sumandos: [c], editables: [c] };
  }
  return { total: null, sumandos: [], editables: [] };
}

export function aplicar(base, cambios) {
  const datos = structuredClone(base ?? {});
  for (const [casilla, v] of Object.entries(cambios)) if (esCasilla(casilla)) escribir(datos, casilla, v);
  return datos;
}

export function celdasCambiadas(base, datos, origen = {}) {
  const celdas = {};
  for (const [casilla, o] of Object.entries(origen)) {
    if (!o || !esCasilla(casilla)) continue;
    const a = leer(base, casilla);
    const b = leer(datos, casilla);
    if (a.valor === b.valor && a.ilegible === b.ilegible) continue;
    /* Como el área: un grupo sin casos queda en blanco, no en 0. */
    celdas[`${o.hoja}!${o.columna}${o.fila}`] = partes(casilla).tipo === 'dato' && b.valor === 0 ? null : b.valor;
  }
  return celdas;
}

export function expandirOrigen(origen = {}) {
  return origen;
}

export function hojaDe(origen = {}) {
  return Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}
