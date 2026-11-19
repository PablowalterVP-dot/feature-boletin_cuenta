/* Archivos de ejemplo de Laboratorio, para la demostración.

   La hoja del mes, con la forma del libro del área, llena con las cifras
   simuladas —ficticias, y la pantalla lo dice—, y una variante con errores
   como los que tiene el libro real de 2026: una casilla con letras («|1» en
   agosto), una fila sin registrar y un total que no cuadra con su fila.
   Pasan por el mismo lector y el mismo bot que un archivo subido. */

import { datosDeLaboratorio } from '@/app/datos/formatos/laboratorio-siembra.js';
import { plantilla } from './bot-validador.js';
import { descargar } from './ejemplos-nutricion.js';

const AREA = 'laboratorio';

function comoArchivo(bytes, nombre) {
  return {
    name: nombre,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

export function nombreDePlantilla(periodo) {
  return plantilla(periodo, null, undefined, AREA).nombre;
}

export function ejemploCorrecto(periodo) {
  return comoArchivo(plantilla(periodo, datosDeLaboratorio(periodo), undefined, AREA).bytes, `Laboratorio_${periodo}_ejemplo.xlsx`);
}

export function ejemploConErrores(periodo) {
  const datos = datosDeLaboratorio(periodo);
  datos.hematologia['hematocrito.privado'] = '|1';
  for (const k of Object.keys(datos.banco_sangre).filter((x) => x.startsWith('plasma_fresco.'))) datos.banco_sangre[k] = null;
  const lepto = Object.entries(datos.metaxenicas).filter(([k]) => k.startsWith('leptospira_rapida.')).reduce((s, [, v]) => s + v, 0);
  const { bytes } = plantilla(periodo, datos, { totalesEscritos: { 'metaxenicas|leptospira_rapida': lepto + 100, 'banco_sangre|plasma_fresco': null } }, AREA);
  return comoArchivo(bytes, `Laboratorio_${periodo}_ejemplo_con_errores.xlsx`);
}

export function descargarPlantilla(periodo) {
  const { bytes, nombre } = plantilla(periodo, null, undefined, AREA);
  descargar(bytes, nombre);
}
