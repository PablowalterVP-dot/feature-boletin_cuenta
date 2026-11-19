/* De qué reporte sale cada dato de los formatos DIRESA, y si se puede usar.

   Regla: **solo entra a DIRESA lo que el área entregó**. Desde el 12/10/2026 lo
   entregado ya viene validado por el bot (no sale del área con un error ni con
   una alerta sin justificar), así que no hay un paso «pendiente de validar».
   Lo que el área no entregó queda vacío, nunca en cero, y el formato dice por
   qué. */

import { estaEntregado } from '@/app/dominio/estados.js';

export const ESTADO_FUENTE = Object.freeze({
  validado: Object.freeze({ clave: 'validado', label: 'Validado por el bot', tone: 'ok', icono: 'sh-ok' }),
  'sin-reporte': Object.freeze({ clave: 'sin-reporte', label: 'Sin reporte', tone: 'crit', icono: 'sh-none' }),
  propio: Object.freeze({ clave: 'propio', label: 'Dato de Estadística', tone: 'info', icono: 'sh-traffic-light' }),
});

export function fuenteDeArea(reportes, claveArea, periodo) {
  const reporte = reportes.find((r) => r.area === claveArea && r.periodo === periodo) ?? null;
  if (!reporte || !estaEntregado(reporte.estado)) {
    return { area: claveArea, estado: 'sin-reporte', datos: null, reporte };
  }
  return { area: claveArea, estado: 'validado', datos: reporte.datos, reporte };
}

export function fuentesDe(reportes, areas, periodo) {
  return Object.fromEntries(areas.map((a) => [a, fuenteDeArea(reportes, a, periodo)]));
}
