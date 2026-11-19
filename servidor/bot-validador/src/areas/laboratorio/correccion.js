/* Corrección del reporte de Laboratorio sobre su propio Excel.

   Lo que el área corrige en la pantalla de corrección no se guarda como
   «datos digitados»: se escribe en una copia de su libro (xlsx.js,
   `parchearLibro`) y ese libro vuelve a pasar por el bot como cualquier otro.
   El sistema sigue guardando solo lo que se leyó de un archivo.

   Aquí está lo que sabe del reporte de Laboratorio:
     · qué es cada casilla (un dato o un total escrito) y cómo se llama;
     · qué casillas señala y deja corregir cada hallazgo;
     · cómo quedan los datos con unos cambios, incluidas las fórmulas;
     · qué celdas del Excel cambian.

   LAS FÓRMULAS
   Las sumas del libro del área son fórmulas (`=SUM(B13:G13)`). Al cambiar una
   casilla, Excel las recalcula al abrir; pero el bot lee el valor que el libro
   trae guardado, así que la copia corregida guarda ya el valor nuevo. No se
   recalcula con la suma de este sistema sino sumando la diferencia al valor
   que traía: así respeta lo que la fórmula del área de verdad suma (el TOTAL
   DE EXAMENES LABORATORIO sumaba todo el departamento hasta marzo de 2026). */

import { CUADROS, SECCIONES, cuadro, filaDe, claveCasilla, claveEscrita, claveFila, procedencia, subtotalesDelMes, examenesDeLaFilaTotal } from './definicion.js';
import { valor, totalCuadro, sumar } from './calculos.js';

const IZQUIERDA = CUADROS.filter((c) => c.bloque === 'izquierda');

/* ----------------------------------------------------------- casillas */

/* Una casilla, desarmada. Las de datos son `sección|examen.procedencia`; las
   de totales escritos, `escrito|…` (definicion.js, `claveEscrita`). */
function partes(casilla) {
  const p = casilla.split('|');
  if (p[0] === 'escrito') return { tipo: 'escrito', clase: p[1], seccion: p[2] ?? null, resto: p[3] ?? null };
  return { tipo: 'dato', seccion: p[0], clave: p.slice(1).join('|') };
}

/* El origen trae además dos claves antiguas (`_general`, `sección|_total`) que
   repiten celdas ya nombradas con `claveEscrita`: no son casillas. */
function esCasilla(casilla) {
  if (casilla.startsWith('_')) return false;
  const p = partes(casilla);
  return p.tipo === 'escrito' || Boolean(cuadro(p.seccion) && filaDe(p.seccion, p.clave));
}

export function etiquetaDe(casilla) {
  const p = partes(casilla);
  if (p.tipo === 'dato') {
    const f = filaDe(p.seccion, p.clave);
    return f ? `${cuadro(p.seccion).titulo} · ${f.examenLabel} · ${f.procedenciaLabel}` : casilla;
  }
  const c = p.seccion ? cuadro(p.seccion) : null;
  switch (p.clase) {
    case 'fila': {
      const e = c?.examenes.find((x) => x.clave === p.resto);
      return `${c?.titulo ?? ''} · ${e?.etiqueta ?? p.resto} · TOTAL`;
    }
    case 'seccion':
      return `${c?.titulo ?? ''} · fila TOTAL · ${procedencia(p.resto)?.label ?? p.resto}`;
    case 'subtotal': {
      const [sub, proc] = String(p.resto).split('.');
      const st = SECCIONES.find((x) => x.id === p.seccion)?.subtotales?.find((x) => x.id === sub);
      return `${c?.titulo ?? ''} · ${st?.etiqueta ?? sub} · ${procedencia(proc)?.label ?? proc}`;
    }
    case 'declarado':
      return `${c?.titulo ?? ''} · TOTAL de la sección`;
    case 'patologia':
      return p.seccion === 'total' ? 'TOTAL DE EXAMENES LABORATORIO' : `TOTAL DE EXAMENES LABORATORIO · ${procedencia(p.seccion)?.label ?? p.seccion}`;
    case 'general':
      return 'TOTAL GENERAL DE ATENCIONES';
    default:
      return casilla;
  }
}

/* El valor de una casilla en unos datos: { valor, ilegible }. */
export function leer(datos, casilla) {
  const p = partes(casilla);
  if (p.tipo === 'dato') {
    return { valor: valor(datos, p.seccion, p.clave), ilegible: datos?.ilegibles?.[casilla] ?? null };
  }
  const e = datos?.escritos ?? {};
  const v =
    p.clase === 'fila' ? e.filas?.[`${p.seccion}|${p.resto}`]
    : p.clase === 'seccion' ? e.secciones?.[`${p.seccion}|${p.resto}`]
    : p.clase === 'subtotal' ? e.subtotales?.[`${p.seccion}|${String(p.resto).replace('.', '|')}`]
    : p.clase === 'declarado' ? datos?.declarados?.[p.seccion]?._total
    : p.clase === 'patologia' ? e.patologia?.[p.seccion]
    : p.clase === 'general' ? e.general
    : null;
  return { valor: typeof v === 'number' ? v : null, ilegible: null };
}

function escribir(datos, casilla, v) {
  const p = partes(casilla);
  if (p.tipo === 'dato') {
    (datos[p.seccion] ??= {})[p.clave] = v;
    if (datos.ilegibles) delete datos.ilegibles[casilla];
    return;
  }
  const e = (datos.escritos ??= {});
  if (p.clase === 'fila') (e.filas ??= {})[`${p.seccion}|${p.resto}`] = v;
  else if (p.clase === 'seccion') (e.secciones ??= {})[`${p.seccion}|${p.resto}`] = v;
  else if (p.clase === 'subtotal') (e.subtotales ??= {})[`${p.seccion}|${String(p.resto).replace('.', '|')}`] = v;
  else if (p.clase === 'declarado') (datos.declarados ??= {})[p.seccion] = { ...datos.declarados[p.seccion], _total: v };
  else if (p.clase === 'patologia') e.patologia = { ...e.patologia, [p.seccion]: v };
  else if (p.clase === 'general') e.general = v;
}

/* ------------------------------------------------------ los hallazgos */

/* Qué señala un hallazgo y qué deja corregir:
     total      la casilla del total escrito que no cuadra (o null)
     sumandos   las casillas que forman la suma
     editables  las que se pueden corregir desde la pantalla
   Una fila que el catálogo no conoce no se corrige aquí: hay que cambiar su
   rótulo en el Excel o agregar el examen al reporte. */
export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    const formados = ev.sumandos.flatMap((s) => s.casillas ?? []);
    return { total: ev.total.casilla, sumandos: [...directos, ...formados], editables: [ev.total.casilla, ...directos, ...formados] };
  }
  if (h.regla === 'incompleto') {
    const lista = (h.casillas ?? []).map((f) => claveCasilla(h.formato, f));
    return { total: null, sumandos: lista, editables: lista };
  }
  if ((h.regla === 'no-numerico' || h.regla === 'entero') && h.fila) {
    const c = claveCasilla(h.formato, h.fila);
    return { total: null, sumandos: [c], editables: [c] };
  }
  return { total: null, sumandos: [], editables: [] };
}

/* --------------------------------------------------- aplicar cambios */

/* De qué depende cada total escrito, como en las fórmulas del libro del área:
   el TOTAL de un examen y la fila TOTAL de una sección suman casillas; el
   TOTAL de la sección suma su fila TOTAL; el TOTAL DE EXAMENES LABORATORIO y
   el TOTAL GENERAL suman totales de sección. Los niveles dan el orden: un
   total se ajusta después de los totales que suma. */
const NIVELES = Object.freeze([['fila', 'seccion', 'subtotal'], ['declarado', 'patologia-procedencia'], ['patologia-total', 'general']]);

function nivelDe(t) {
  if (t.clase === 'patologia') return t.seccion === 'total' ? 'patologia-total' : 'patologia-procedencia';
  return t.clase;
}

function entradas(total, base) {
  const t = partes(total);
  const c = t.seccion ? cuadro(t.seccion) : null;
  switch (t.clase) {
    case 'fila':
      return c ? c.procedencias.map((p) => claveCasilla(c.id, claveFila(t.resto, p.clave))) : [];
    case 'seccion':
      return c ? examenesDeLaFilaTotal(base, c.id).map((e) => claveCasilla(c.id, claveFila(e.clave, t.resto))) : [];
    case 'subtotal': {
      const [sub, proc] = String(t.resto).split('.');
      const st = SECCIONES.find((x) => x.id === t.seccion)?.subtotales?.find((x) => x.id === sub);
      return c && st ? st.examenes.map((e) => claveCasilla(c.id, claveFila(e, proc))) : [];
    }
    case 'declarado':
      /* Una sección de una sola columna (el resumen) no tiene fila TOTAL por
         procedencia: su total suma sus casillas. Con subtotales, suma también
         sus filas. */
      return !c ? [] : c.procedencias.length === 1 ? c.filas.map((f) => claveCasilla(c.id, f.clave)) : [
        ...c.procedencias.map((p) => claveEscrita('seccion', c.id, p.clave)),
        ...subtotalesDelMes(base, c.id).flatMap((st) => c.procedencias.map((p) => claveEscrita('subtotal', c.id, `${st.id}.${p.clave}`))),
      ];
    case 'patologia': {
      if (t.seccion !== 'total') return IZQUIERDA.map((s) => claveEscrita('seccion', s.id, t.seccion));
      /* Hasta marzo de 2026 sumaba todo el departamento menos las
         actividades; desde abril, solo Patología Clínica (reglas.js). */
      const departamento = sumar(CUADROS.filter((x) => x.id !== 'actividades').map((x) => totalCuadro(base, x.id)));
      const amplio = base?.escritos?.patologia?.total != null && base.escritos.patologia.total === departamento;
      return (amplio ? CUADROS.filter((x) => x.id !== 'actividades') : IZQUIERDA).map((s) => claveEscrita('declarado', s.id));
    }
    case 'general':
      return CUADROS.map((s) => claveEscrita('declarado', s.id));
    default:
      return [];
  }
}

/* Los datos con unos cambios: { casilla: número | null }. No modifica `base`.
   Los totales que en el Excel son fórmula (`origen[casilla].formula`) y que
   nadie cambió a mano se ajustan solos con la diferencia de lo que suman. */
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
  /* El total de una sección con subtotales no está en ninguna celda (lector.js),
     pero los totales de arriba lo suman: se ajusta igual, sin escribirse en el libro. */
  for (const c of CUADROS) {
    const casilla = claveEscrita('declarado', c.id);
    if (subtotalesDelMes(base, c.id).length && !(casilla in origen) && !(casilla in cambios)) formulas.push([casilla, { formula: true }]);
  }
  for (const nivel of NIVELES) {
    for (const [casilla] of formulas.filter(([k]) => nivel.includes(nivelDe(partes(k))))) {
      const suma = entradas(casilla, base).reduce((s, e) => s + (delta.get(e) ?? 0), 0);
      if (suma === 0) continue;
      escribir(datos, casilla, (leer(base, casilla).valor ?? 0) + suma);
      delta.set(casilla, suma);
    }
  }
  return datos;
}

/* Las celdas del Excel que cambian entre `base` y `datos`, nombradas con su
   hoja: { 'HOJA!REF': número | null }. Una casilla ilegible que pasó a tener
   cifra también cambia. */
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

/* El origen ya trae la celda de cada casilla (el reporte es mensual). */
export function expandirOrigen(origen = {}) {
  return origen;
}

/* La hoja donde están las casillas (todas salen de la hoja del mes). */
export function hojaDe(origen = {}) {
  return Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}
