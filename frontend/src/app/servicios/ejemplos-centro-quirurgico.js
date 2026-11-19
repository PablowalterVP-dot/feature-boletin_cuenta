/* Archivos de ejemplo de Centro Quirúrgico, para la demostración.

   Las cinco hojas que el bot lee, con la forma del libro del área, llenas con
   las cifras simuladas —ficticias, y la pantalla lo dice—, y una variante con
   errores como los de los libros de 2026: un procedimiento con letras, una
   causa en blanco (mayo) y «realizadas» distinta del RESUMEN (junio). Pasan
   por el mismo lector y el mismo bot que un archivo subido. */

import { datosDeCentroQuirurgico } from '@/app/datos/formatos/centro-quirurgico-siembra.js';
import { plantilla } from './bot-validador.js';
import { descargar } from './ejemplos-nutricion.js';

const AREA = 'centro-quirurgico';

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
  return comoArchivo(plantilla(periodo, datosDeCentroQuirurgico(periodo), undefined, AREA).bytes, `CentroQuirurgico_${periodo}_ejemplo.xlsx`);
}

export function ejemploConErrores(periodo) {
  const datos = datosDeCentroQuirurgico(periodo);
  datos.procedimientos.menor.obstetricia[0] = { ...datos.procedimientos.menor.obstetricia[0], valor: 'dos' };
  datos.suspendidas.instrumental = null;
  datos.indicadores.intervenciones_realizadas += 13;
  return comoArchivo(plantilla(periodo, datos, undefined, AREA).bytes, `CentroQuirurgico_${periodo}_ejemplo_con_errores.xlsx`);
}

export function descargarPlantilla(periodo) {
  const { bytes, nombre } = plantilla(periodo, null, undefined, AREA);
  descargar(bytes, nombre);
}
