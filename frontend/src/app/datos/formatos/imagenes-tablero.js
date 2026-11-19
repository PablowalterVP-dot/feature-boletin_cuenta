/* Cifras del tablero de inicio de Diagnóstico por Imágenes.

   Las mismas dos reglas que en Lavandería:
   · Un mes sin reporte enviado vale `null`, nunca cero.
   · La comparación es contra el último mes enviado anterior, nombrándolo.

   Y una propia de esta área: el tomógrafo. Un mes con cero tomografías porque
   el equipo no funciona no es un mes sin demanda, y el tablero cuenta desde
   cuándo está inoperativo en lugar de dejar que el cero hable solo. */

import { cifrasImagenes, examenesDeFila } from './imagenes-calculos.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, etiquetaMes } from '@/app/dominio/periodos.js';
import { variacion } from '@/app/dominio/formato.js';

const AREA = 'imagenes';

export const MODALIDADES = Object.freeze([
  { clave: 'rayosX', nombre: 'Rayos X' },
  { clave: 'ecografia', nombre: 'Ecografía' },
  { clave: 'mamografia', nombre: 'Mamografía' },
  { clave: 'tomografia', nombre: 'Tomografía' },
  { clave: 'biopsias', nombre: 'Biopsias' },
  { clave: 'oncologicos', nombre: 'Procedimientos oncológicos' },
]);

export function enviados(reportes) {
  return reportes
    // Un mes que solo llegó como resumen (su detalle viene en camino) no es un cero: aún no se dibuja.
    .filter((r) => r.area === AREA && estaEntregado(r.estado) && r.datos && !r.resumen)
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export function ultimoEnviado(reportes) {
  return enviados(reportes).at(-1) ?? null;
}

export function enviadoAnterior(reportes, periodo) {
  return enviados(reportes).filter((r) => r.periodo < periodo).at(-1) ?? null;
}

export function cifrasDelMes(reporte) {
  return reporte ? cifrasImagenes(reporte.datos) : null;
}

export function comparar(actual, anterior, clave, decimales = 1) {
  return variacion(actual?.[clave] ?? null, anterior?.[clave] ?? null, decimales);
}

export function serieMensual(reportes, periodos, clave) {
  const porPeriodo = new Map(enviados(reportes).map((r) => [r.periodo, r]));
  return periodos.map((p) => {
    const r = porPeriodo.get(p);
    return { key: p, label: etiquetaMes(p), title: etiquetaPeriodo(p), value: r ? cifrasImagenes(r.datos)[clave] : null };
  });
}

/* Primer mes de la racha de meses enviados con el tomógrafo inoperativo que
   termina en `periodo`. Null si ese mes funcionaba. */
export function inoperativoDesde(reportes, periodo) {
  const lista = enviados(reportes).filter((r) => r.periodo <= periodo);
  let desde = null;
  for (let i = lista.length - 1; i >= 0; i -= 1) {
    if (!cifrasImagenes(lista[i].datos).tomografoInoperativo) break;
    desde = lista[i].periodo;
  }
  return desde;
}

export function porModalidad(reporte) {
  if (!reporte) return [];
  const m = cifrasImagenes(reporte.datos).modalidades;
  return MODALIDADES.map((x) => ({ ...x, valor: m[x.clave] })).filter((x) => x.valor != null);
}

export function ecografiasPorMedico(reporte) {
  return (reporte?.datos?.f1?.examenes ?? [])
    .map((f) => ({ nombre: f.nombre, valor: examenesDeFila(f) }))
    .filter((f) => f.valor != null)
    .sort((a, b) => b.valor - a.valor);
}

export function rayosXPorTecnologo(reporte) {
  return (reporte?.datos?.f4?.tecnologos ?? [])
    .filter((t) => t.cantidad != null)
    .map((t) => ({ nombre: t.nombre, valor: t.cantidad }))
    .sort((a, b) => b.valor - a.valor);
}
