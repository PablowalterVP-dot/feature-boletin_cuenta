/* Corrección del informe de Farmacia sobre su propio Word.

   El mismo contrato que las áreas con Excel (laboratorio/correccion.js): lo
   corregido se escribe en una copia del documento del área, que vuelve a
   pasar por el bot. Lo propio de Farmacia:

     · tres clases de casilla:
         `f1|sis.hosp`               una cifra de un formato, por su ruta
                                     (`f2|hospitalizados.fila1.mater`, `f3|consultas.fila2`)
         `parte|hemodialisis.ce`     media cifra: hemodiálisis y oncología
                                     vienen partidas en consulta externa y
                                     hospitalización, y el reporte guarda la
                                     suma (`f1|sis.hemodialisis`), que se recalcula
         `escrito|f1.totalSis`       un total escrito en el Word, por su ruta
                                     en `datos.escritos`
     · en un Word no hay fórmulas: un total no se ajusta solo, y si una
       corrección lo descuadra, la revalidación lo dice y se corrige también.
     · cada tabla del Word hace de hoja («Tabla 1 del Word», docx.js). */

import { COMPONENTES_SIS, COMPONENTES_CONVENIO, OTROS_FINANCIADORES, SERVICIOS_SOP, FILAS } from './definicion.js';

const PARTIDAS = Object.freeze(['hemodialisis', 'oncologia']);
const LADOS = Object.freeze({ ce: 'consulta externa', hosp: 'hospitalización' });
const RESUMEN = Object.freeze({ sis: 'S.I.S.', convenios: 'CONVENIOS', programas: 'PROGRAMAS', boletas: 'BOLETAS DE VENTA', credito: 'CREDITO PERSONAL', defensa: 'DEFENSA NACIONAL', insolvencias: 'INSOLVENCIAS', total: 'TOTAL ATENCIONES' });
const fila = (f) => FILAS.find((x) => x.clave === f)?.label ?? f;
const servicio = (s) => SERVICIOS_SOP.find((x) => x.clave === s)?.label ?? s;

/* Todas las casillas, con su etiqueta: lo que no está aquí no se corrige. */
const ETIQUETAS = new Map([
  ...COMPONENTES_SIS.map((c) => [`f1|sis.${c.clave}`, `Atenciones SIS · ${c.label}`]),
  ...COMPONENTES_CONVENIO.map((c) => [`f1|convenio.${c.clave}`, `Convenios · ${c.label}`]),
  ...OTROS_FINANCIADORES.map((o) => [`f1|otros.${o.clave}`, o.label]),
  ...FILAS.flatMap((f) => [
    ...SERVICIOS_SOP.map((s) => [`f2|hospitalizados.${f.clave}.${s.clave}`, `Sala de Operaciones · ${f.label} · ${s.label}`]),
    [`f2|convenios.${f.clave}`, `Sala de Operaciones · ${f.label} · Convenios`],
    [`f3|consultas.${f.clave}`, `Consultorios externos · ${f.label} · Consultas`],
    [`f3|convenios.${f.clave}`, `Consultorios externos · ${f.label} · Convenios`],
  ]),
  ...PARTIDAS.flatMap((p) => Object.entries(LADOS).map(([lado, texto]) => [`parte|${p}.${lado}`, `${COMPONENTES_SIS.find((c) => c.clave === p)?.label} · ${texto}`])),
  ['escrito|f1.totalSis', 'Total de atenciones por SIS'],
  ['escrito|f1.totalOtras', 'Total de otras atenciones'],
  ['escrito|f1.totalAtenciones', 'TOTAL ATENCIONES del resumen'],
  ['escrito|f1.totalFinal', 'TOTAL ATENCIONES del final del informe'],
  ...COMPONENTES_SIS.filter((c) => c.diresa).map((c) => [`escrito|f1.unidades.${c.clave}`, `Unidades de farmacia · ${c.label}`]),
  ...Object.entries(RESUMEN).map(([k, texto]) => [`escrito|f1.resumen.${k}`, `Atenciones del mes · ${texto}`]),
  ...FILAS.map((f) => [`escrito|f2.filas.${f.clave}`, `TOTAL SOP HOSP · ${fila(f.clave)}`]),
  ...SERVICIOS_SOP.map((s) => [`escrito|f2.servicios.${s.clave}`, `Totales de Sala de Operaciones · ${servicio(s.clave)}`]),
  ['escrito|f2.hospitalizados', 'Totales · TOTAL SOP HOSP'],
  ['escrito|f2.convenios', 'Totales · Convenios de Sala de Operaciones'],
  ['escrito|f3.consultas', 'Totales · Consultas externas'],
  ['escrito|f3.convenios', 'Totales · Convenios de Consultorios externos'],
]);

const esCasilla = (casilla) => ETIQUETAS.has(casilla);

export function etiquetaDe(casilla) {
  return ETIQUETAS.get(casilla) ?? casilla;
}

/* Dónde vive cada casilla en los datos: [objeto raíz, ruta]. */
function lugar(datos, casilla) {
  const [tipo, ruta] = casilla.split('|');
  if (tipo === 'escrito') return [datos?.escritos, ruta.split('.')];
  if (tipo === 'parte') return [datos?.escritos?.partes, [ruta]];
  return [datos?.[tipo], ruta.split('.')];
}

/* El valor de una casilla en unos datos: { valor, ilegible }. Los datos
   pueden venir anidados (el lector) o planos (el servidor: `'sis.hosp'`). */
export function leer(datos, casilla) {
  const [raiz, ruta] = lugar(datos, casilla);
  const v = ruta.reduce((n, k) => n?.[k], raiz) ?? raiz?.[ruta.join('.')];
  return { valor: typeof v === 'number' ? v : null, ilegible: datos?.ilegibles?.[casilla] ?? null };
}

function escribir(datos, casilla, v) {
  const [tipo, ruta] = casilla.split('|');
  let nodo = tipo === 'escrito' ? (datos.escritos ??= {}) : tipo === 'parte' ? ((datos.escritos ??= {}).partes ??= {}) : (datos[tipo] ??= {});
  const claves = tipo === 'parte' ? [ruta] : ruta.split('.');
  for (const k of claves.slice(0, -1)) nodo = nodo[k] && typeof nodo[k] === 'object' ? nodo[k] : (nodo[k] = {});
  nodo[claves.at(-1)] = v;
  if (datos.ilegibles) delete datos.ilegibles[casilla];
  /* Media cifra: la que guarda el reporte vuelve a ser la suma de sus partes. */
  if (tipo === 'parte') {
    const p = ruta.split('.')[0];
    const valores = Object.keys(LADOS).map((l) => datos.escritos.partes[`${p}.${l}`]).filter((x) => typeof x === 'number');
    ((datos.f1 ??= {}).sis ??= {})[p] = valores.length ? valores.reduce((a, b) => a + b, 0) : null;
  }
}

/* ------------------------------------------------------ los hallazgos */

export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    return { total: ev.total.casilla, sumandos: directos, editables: [ev.total.casilla, ...directos] };
  }
  const regla = h.correccion ?? h.regla ?? h.id;
  if ((regla === 'no-numerico' || regla === 'entero') && h.fila) {
    const c = `${h.formato}|${h.fila}`;
    return { total: null, sumandos: [c], editables: [c] };
  }
  // Las casillas en blanco: el aviso las lista.
  if (regla === 'blancos' && h.casillas?.length) return { total: null, sumandos: h.casillas, editables: h.casillas };
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

/* La tabla del resumen, para el título de la corrección. */
export function hojaDe(origen = {}) {
  return origen['f1|sis.hosp']?.hoja ?? Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}
