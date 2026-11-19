/* Cifras del tablero de inicio de Farmacia.

   Las mismas dos reglas que en las demás áreas levantadas:
   · Un mes sin reporte enviado vale `null`, nunca cero.
   · La comparación es contra el último mes enviado anterior, nombrándolo; si
     no lo hay, se dice «Sin mes anterior para comparar». */

import { cifrasFarmacia } from './farmacia-calculos.js';
import { COMPONENTES_SIS, OTROS_FINANCIADORES } from './farmacia.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, etiquetaMes } from '@/app/dominio/periodos.js';
import { variacion } from '@/app/dominio/formato.js';

const AREA = 'farmacia';

/* Tipos de atención del reparto, en el orden del informe. */
export const TIPOS_DE_ATENCION = Object.freeze([
  { clave: 'sis', nombre: 'SIS' },
  { clave: 'convenios', nombre: 'Convenios' },
  ...OTROS_FINANCIADORES.map((o) => ({ clave: o.clave, nombre: o.label })),
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
  return reporte ? cifrasFarmacia(reporte.datos) : null;
}

export function comparar(actual, anterior, clave, decimales = 1) {
  return variacion(actual?.[clave] ?? null, anterior?.[clave] ?? null, decimales);
}

export function serieMensual(reportes, periodos, clave) {
  const porPeriodo = new Map(enviados(reportes).map((r) => [r.periodo, r]));
  return periodos.map((p) => {
    const r = porPeriodo.get(p);
    return { key: p, label: etiquetaMes(p), title: etiquetaPeriodo(p), value: r ? cifrasFarmacia(r.datos)[clave] : null };
  });
}

/* Reparto por tipo de atención. Un cero registrado se conserva —crédito
   personal en cero es un dato—; una casilla sin registrar no aparece. */
export function porTipoDeAtencion(reporte) {
  if (!reporte) return [];
  const r = cifrasFarmacia(reporte.datos).reparto;
  return TIPOS_DE_ATENCION.map((t) => ({ ...t, valor: r[t.clave] })).filter((t) => t.valor != null);
}

export function sisPorComponente(reporte) {
  if (!reporte) return [];
  const c = cifrasFarmacia(reporte.datos).componentesSis;
  return COMPONENTES_SIS.map((x) => ({ clave: x.clave, nombre: x.label, valor: c[x.clave] })).filter((x) => x.valor != null);
}
