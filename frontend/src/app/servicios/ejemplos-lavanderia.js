/* Archivos de ejemplo de Lavandería, para la demostración.

   Las cuatro hojas, con la forma del Excel real, llenas con las cifras
   sembradas —ficticias salvo julio de 2026, y la pantalla lo dice—, y una
   variante con errores como los que de verdad tiene el Excel de mayo de
   2026: una casilla con letras, un total que no cuadra y una cifra de
   piezas tecleada con un punto de miles. Pasan por el mismo lector y el
   mismo bot que un archivo subido. */

import { datosDeLavanderia } from '@/app/datos/formatos/lavanderia-siembra.js';
import { plantilla } from './bot-validador.js';
import { descargar } from './ejemplos-nutricion.js';

const AREA = 'lavanderia';

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
  return comoArchivo(plantilla(periodo, datosDeLavanderia(periodo), undefined, AREA).bytes, `Lavanderia_${periodo}_ejemplo.xlsx`);
}

export function ejemploConErrores(periodo) {
  const datos = datosDeLavanderia(periodo);
  datos.f1['c-externos'] = [...datos.f1['c-externos']];
  datos.f1['c-externos'][2] = '18+'; // una casilla ilegible, como «|1» en Laboratorio
  datos.f4.piezas.emergencias = 6.468; // el error real de mayo de 2026: punto de miles tecleado como decimal
  const { bytes } = plantilla(periodo, datos, { totalesEscritos: { 'f1|emergencia': 999 } }, AREA);
  return comoArchivo(bytes, `Lavanderia_${periodo}_ejemplo_con_errores.xlsx`);
}

export function descargarPlantilla(periodo) {
  const { bytes, nombre } = plantilla(periodo, null, undefined, AREA);
  descargar(bytes, nombre);
}
