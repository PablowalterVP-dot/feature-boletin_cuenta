/* Archivos de ejemplo para la demostración.

   Permiten recorrer el módulo sin tener un Excel a mano. Son la plantilla del
   periodo llena con cifras simuladas —ficticias, y la pantalla lo dice—, y una
   variante con los errores típicos de un Excel real: una casilla con letras,
   un día en blanco, un total tecleado encima de la fórmula y un día disparado.
   Pasan por el mismo lector y el mismo bot que un archivo subido. */

import { datosDeNutricion } from '@/app/datos/formatos/nutricion-siembra.js';
import { plantilla } from './bot-validador.js';

function comoArchivo(bytes, nombre) {
  return {
    name: nombre,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

export function ejemploCorrecto(periodo) {
  return comoArchivo(plantilla(periodo, datosDeNutricion(periodo)).bytes, `Nutricion_${periodo}_ejemplo.xlsx`);
}

export function ejemploConErrores(periodo) {
  const datos = datosDeNutricion(periodo);
  datos.f4['sis.almuerzo'][2] = '4O';
  datos.f2['nutricion.cena'][9] = null;
  datos.f3['completa.almuerzo'][11] = 380;
  const almuerzo = datos.f1['asistencial.almuerzo'].reduce((a, b) => a + b, 0);
  const { bytes } = plantilla(periodo, datos, { totalesEscritos: { 'f1|asistencial.almuerzo': almuerzo + 120 } });
  return comoArchivo(bytes, `Nutricion_${periodo}_ejemplo_con_errores.xlsx`);
}

/* Descarga un archivo generado en el navegador. */
export function descargar(bytes, nombre) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function descargarPlantilla(periodo) {
  const { bytes, nombre } = plantilla(periodo);
  descargar(bytes, nombre);
}
