/* Corrección del reporte de Nutrición sobre su propio Excel.

   El mismo contrato que Laboratorio (laboratorio/correccion.js): lo corregido
   se escribe en una copia del libro del área, que vuelve a pasar por el bot.
   Lo propio de Nutrición:
     · una casilla es un día: `cuadro|grupo.comida|día`; los totales escritos
       son el de cada fila (`escrito|fila|cuadro|grupo.comida`) y el del cuadro
       (`escrito|cuadro|cuadro`);
     · el libro tiene cuatro hojas (una por cuadro), así que una celda se
       nombra con su hoja;
     · el lector guarda solo dónde empieza cada fila (la columna del día 1):
       `expandirOrigen` calcula la celda de cada día para la corrección, sin
       agrandar el informe que se guarda.

   LAS FÓRMULAS: el TOTAL de cada fila y el del cuadro son sumas en el libro.
   Al cambiar un día, su valor guardado se ajusta con la diferencia (como en
   Laboratorio): Excel recalcula al abrir, pero el bot lee el valor guardado. */

import { formato, filaDe, claveCasilla } from './definicion.js';
import { letraDeColumna } from '../../xlsx.js';

const columnaANumero = (letras) => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

function partes(casilla) {
  const p = casilla.split('|');
  if (p[0] === 'escrito') return { tipo: 'escrito', clase: p[1], cuadro: p[2] ?? null, fila: p[3] ?? null };
  return { tipo: 'dato', cuadro: p[0], fila: p[1] ?? null, dia: p[2] ? Number(p[2]) : null };
}

function esCasilla(casilla) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') return p.clase === 'cuadro' ? Boolean(formato(p.cuadro)) : Boolean(filaDe(p.cuadro, p.fila));
  return Boolean(p.dia && formato(p.cuadro) && filaDe(p.cuadro, p.fila));
}

export function etiquetaDe(casilla) {
  const p = partes(casilla);
  const f = formato(p.cuadro);
  if (!f) return casilla;
  if (p.tipo === 'escrito' && p.clase === 'cuadro') return `${f.corto} · TOTAL del cuadro`;
  const fila = filaDe(p.cuadro, p.fila);
  if (!fila) return casilla;
  const base = `${f.corto} · ${fila.grupoLabel} · ${fila.comidaLabel}`;
  return p.tipo === 'escrito' ? `${base} · TOTAL` : `${base} · día ${p.dia}`;
}

export function leer(datos, casilla) {
  const p = partes(casilla);
  if (p.tipo === 'dato') {
    const v = datos?.[p.cuadro]?.[p.fila]?.[p.dia - 1];
    return { valor: typeof v === 'number' ? v : null, ilegible: datos?.ilegibles?.[casilla] ?? null };
  }
  const v = p.clase === 'cuadro' ? datos?.declarados?.[p.cuadro]?._total : datos?.declarados?.[p.cuadro]?.[p.fila];
  return { valor: typeof v === 'number' ? v : null, ilegible: null };
}

function escribir(datos, casilla, v) {
  const p = partes(casilla);
  if (p.tipo === 'dato') {
    const cuadro = (datos[p.cuadro] ??= {});
    const fila = [...(cuadro[p.fila] ?? [])];
    fila[p.dia - 1] = v;
    cuadro[p.fila] = fila;
    if (datos.ilegibles) delete datos.ilegibles[casilla];
    return;
  }
  const declarados = (datos.declarados ??= {});
  const cuadro = (declarados[p.cuadro] ??= {});
  if (p.clase === 'cuadro') cuadro._total = v;
  else cuadro[p.fila] = v;
}

/* Qué señala un hallazgo y qué deja corregir. Los errores de Nutrición llevan
   su código en `id` (reglas.js). */
export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    const formados = ev.sumandos.flatMap((s) => s.casillas ?? []);
    return { total: ev.total.casilla, sumandos: [...directos, ...formados], editables: [ev.total.casilla, ...directos, ...formados] };
  }
  const regla = h.regla ?? h.id;
  if (regla === 'incompleto') {
    const lista = (h.casillas ?? []).map((c) => claveCasilla(h.formato, c.fila, c.dia));
    return { total: null, sumandos: lista, editables: lista };
  }
  /* Una alerta de día atípico señala su casilla: se corrige si fue un error de
     tecleo, o se confirma tal cual si la cifra es real (Correccion.jsx). */
  if ((regla === 'no-numerico' || regla === 'entero' || regla === 'atipico') && h.fila && h.dia) {
    const c = claveCasilla(h.formato, h.fila, h.dia);
    return { total: null, sumandos: [c], editables: [c] };
  }
  return { total: null, sumandos: [], editables: [] };
}

/* De qué depende cada total escrito, como en las fórmulas del libro: el TOTAL
   de una fila suma sus días; el del cuadro suma la columna TOTAL (las filas,
   no los días: si una fila trae su total tecleado, el del cuadro suma esa
   cifra). Primero las filas, después el cuadro. */
function entradas(total, base) {
  const t = partes(total);
  if (t.clase === 'fila') {
    const dias = base?.[t.cuadro]?.[t.fila]?.length ?? 0;
    return Array.from({ length: dias }, (_, i) => claveCasilla(t.cuadro, t.fila, i + 1));
  }
  const f = formato(t.cuadro);
  return f ? f.filas.map((fila) => `escrito|fila|${t.cuadro}|${fila.clave}`) : [];
}

/* Los datos con unos cambios: { casilla: número | null }. No modifica `base`.
   Los totales que en el Excel son fórmula y que nadie cambió a mano se ajustan
   solos con la diferencia de lo que suman. */
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
  for (const clase of ['fila', 'cuadro']) {
    for (const [casilla] of formulas.filter(([k]) => partes(k).clase === clase)) {
      const suma = entradas(casilla, base).reduce((s, e) => s + (delta.get(e) ?? 0), 0);
      if (suma === 0) continue;
      escribir(datos, casilla, (leer(base, casilla).valor ?? 0) + suma);
      delta.set(casilla, suma);
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

/* La celda de cada día, a partir de dónde empieza su fila. */
export function expandirOrigen(origen = {}, datos = {}) {
  const expandido = { ...origen };
  for (const [clave, o] of Object.entries(origen)) {
    const p = clave.split('|');
    if (p.length !== 2 || !o?.columna) continue;
    const [cuadro, fila] = p;
    const dias = datos?.[cuadro]?.[fila]?.length ?? 0;
    const inicio = columnaANumero(o.columna);
    for (let d = 1; d <= dias; d += 1) expandido[claveCasilla(cuadro, fila, d)] = { hoja: o.hoja, fila: o.fila, columna: letraDeColumna(inicio + d - 1) };
  }
  return expandido;
}

/* La hoja principal, para el título de la corrección (Nutrición tiene cuatro). */
export function hojaDe(origen = {}) {
  return Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}
