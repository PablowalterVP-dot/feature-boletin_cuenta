/* Convenciones comunes a todas las plantillas del bot.

   Toda plantilla, de cualquier área, trae una hoja oculta con tres nombres
   definidos: de qué área es, de qué periodo y de qué versión. Es lo primero
   que el bot lee, antes de una sola cifra: con eso sabe qué lector usar y si
   el archivo corresponde al reporte que se está llenando. */

export const HOJA_META = '_plantilla';

export const META = Object.freeze({
  area: 'PLANTILLA_AREA',
  periodo: 'PLANTILLA_PERIODO',
  version: 'PLANTILLA_VERSION',
});

export function problema(id, titulo, detalle) {
  return { id, titulo, detalle };
}

/* Una casilla leída del Excel, llevada a número.

   Un texto con forma de número («1 234», «171 ») se acepta: pasa cuando la
   columna estaba formateada como texto. Un error de Excel (#REF!) o cualquier
   otro texto es ilegible, y se conserva tal cual para mostrárselo al área.

   Los totales que un área digita a mano con su unidad pegada («26.633
   PIEZAS») a veces usan el punto como separador de miles (cada grupo de
   exactamente tres cifras), al revés de la convención del propio sistema
   (es-PE: coma de miles, punto decimal). Se reconoce esa forma primero —si no
   calza, un «26.633» real se leería como 26,633 en vez de 26633 y el total
   nunca cuadraría con la suma de sus partes— y solo si no aplica se asume
   punto o coma como separador decimal simple. */
const MILES_CON_PUNTO = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/;

export function comoNumero(valor) {
  if (valor == null || valor === '') return { vacio: true };
  if (typeof valor === 'number') return { numero: valor };
  if (typeof valor === 'object' && valor.error) return { ilegible: valor.error };
  const limpio = String(valor).trim().replace(/\s/g, '');
  if (limpio === '') return { vacio: true };
  if (MILES_CON_PUNTO.test(limpio)) return { numero: Number(limpio.replace(/\./g, '').replace(',', '.')) };
  if (/^-?\d+([.,]\d+)?$/.test(limpio)) return { numero: Number(limpio.replace(',', '.')) };
  return { ilegible: String(valor).trim() };
}
