/* Corrección del oficio de Diagnóstico por Imágenes sobre su propio Word.

   El mismo contrato que las demás áreas: lo corregido se escribe en una copia
   del oficio, que vuelve a pasar por el bot. Como el oficio son muchas tablas
   pequeñas y filas que cambian cada mes (médicos, tecnólogos), cada casilla
   se nombra por su ruta en los datos, la misma que usa el lector:
     `d|f1.examenes.0.examenes.sis.ce`  una cifra (aquí, la del primer médico)
     `e|f1.filas.examenes.0`            un total escrito en el Word (su EXAM)
   En un Word no hay fórmulas: si una corrección descuadra un total escrito,
   la revalidación lo dice y se corrige también. */

import { errorDeTecleo } from '../../correccion.js';
import { plano } from './calculos.js';

const formato = (n) => (typeof n === 'number' ? n.toLocaleString('es-PE') : '—');

function partes(casilla) {
  const [tipo, ruta = ''] = String(casilla).split('|');
  return { tipo, ruta: ruta.split('.') };
}

function obtener(raiz, ruta) {
  return ruta.reduce((nodo, p) => (nodo == null ? undefined : nodo[p]), raiz);
}

function poner(raiz, ruta, valor) {
  let nodo = raiz;
  ruta.slice(0, -1).forEach((p, i) => {
    if (nodo[p] == null || typeof nodo[p] !== 'object') nodo[p] = /^\d+$/.test(ruta[i + 1]) ? [] : {};
    nodo = nodo[p];
  });
  nodo[ruta.at(-1)] = valor;
}

const esCasilla = (casilla) => /^[de]\|f[1-4]\./.test(String(casilla));

export function etiquetaDe(casilla) {
  const { tipo, ruta } = partes(casilla);
  return `${tipo === 'e' ? 'Total escrito · ' : ''}${ruta.join(' · ')}`;
}

export function leer(datos, casilla) {
  const { tipo, ruta } = partes(casilla);
  const v = obtener(tipo === 'e' ? datos?.escritos : datos, ruta);
  return { valor: typeof v === 'number' ? v : null, ilegible: tipo === 'd' ? (datos?.ilegibles?.[casilla] ?? null) : null };
}

function escribir(datos, casilla, v) {
  const { tipo, ruta } = partes(casilla);
  if (tipo === 'e') poner((datos.escritos ??= {}), ruta, v);
  else {
    poner(datos, ruta, v);
    if (datos.ilegibles) delete datos.ilegibles[casilla];
  }
}

export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    const total = ev.total.casilla ?? null;
    return { total, sumandos: directos, editables: [...(total ? [total] : []), ...directos] };
  }
  const lista = h.casillas?.length ? h.casillas.map((c) => `d|${c}`) : h.fila ? [`d|${h.fila}`] : [];
  return { total: null, sumandos: lista, editables: lista };
}

/* Los datos con unos cambios. Los cuadros planos de la base se recalculan:
   salen de los formatos. */
export function aplicar(base, cambios) {
  const datos = structuredClone(base ?? {});
  for (const [casilla, v] of Object.entries(cambios)) if (esCasilla(casilla)) escribir(datos, casilla, v);
  return Object.assign(datos, plano(datos));
}

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

export function expandirOrigen(origen = {}) {
  return origen;
}

/* La primera hoja con casillas: el oficio empieza por Rayos X. */
export function hojaDe(origen = {}) {
  return Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}

/* Los tecnólogos de Rayos X: el total de referencia no es una casilla que
   corregir, sino los exámenes por servicio (que cuadran con EXAMENES
   ATENDIDOS). La diferencia está en las filas de tecnólogos; Dr. Mochi busca
   la que la explica sola y, si ninguna, lo dice. */
export function explicar(h) {
  if ((h.regla ?? h.id) !== 'tecnologos' || !h.evidencia) return null;
  const { total, sumandos, suma } = h.evidencia;
  const d = suma - total.valor;
  const causas = [];
  const igual = sumandos.filter((s) => s.valor === Math.abs(d));
  if (d > 0 && igual.length === 1) {
    causas.push({ texto: `La diferencia es exactamente lo que trae ${igual[0].etiqueta} (${formato(d)}): parece una fila que no corresponde a este mes o contada dos veces.`, casillas: [igual[0].casilla] });
  }
  for (const s of sumandos.filter((x) => x.casilla)) {
    const nuevo = s.valor - d;
    const tecleo = nuevo >= 0 ? errorDeTecleo(nuevo, s.valor) : null;
    if (tecleo && tecleo.tipo !== 'cambiado') {
      causas.push({ texto: `¿Está mal ${s.etiqueta}? Con ${formato(nuevo)} los tecnólogos sumarían justo los atendidos; tiene ${tecleo.texto}.`, casillas: [s.casilla], sugerencia: { texto: `Poner ${formato(nuevo)} en ${s.etiqueta}`, cambios: { [s.casilla]: nuevo } } });
    }
  }
  if (!causas.length) {
    causas.push({ texto: 'Ninguna fila explica la diferencia por sí sola. Compare cada tecnólogo con su registro del mes y corrija la que esté mal; los exámenes por servicio no se tocan, porque cuadran con los atendidos.', casillas: sumandos.map((s) => s.casilla).filter(Boolean) });
  }
  return {
    cuenta: `${sumandos.filter((s) => s.valor).map((s) => `${s.etiqueta} ${formato(s.valor)}`).join(' + ')} = ${formato(suma)}`,
    conclusion: `Por servicio se atendieron ${formato(total.valor)} exámenes, y los tecnólogos suman ${formato(suma)}: ${formato(Math.abs(d))} ${d > 0 ? 'de más' : 'de menos'}.`,
    causas,
  };
}
