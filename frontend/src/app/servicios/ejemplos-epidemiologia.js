/* El oficio de Epidemiología en Word: formato en blanco y ejemplos.

   El bot genera un Word con la misma tabla del oficio real
   (servidor/bot-validador/src/areas/epidemiologia/plantilla.js). Los ejemplos
   pasan por el mismo lector y las mismas reglas que un oficio subido; sus
   cifras son ficticias (epidemiologia-siembra.js). */

import { datosDeEpidemiologia } from '@/app/datos/formatos/epidemiologia-siembra.js';
import { plantilla } from './bot-validador.js';

const AREA = 'epidemiologia';
const TIPO_WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function comoArchivo(bytes, nombre) {
  return { name: nombre, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

export function nombreDePlantilla(periodo) {
  return plantilla(periodo, null, undefined, AREA).nombre;
}

export function ejemploCorrecto(periodo) {
  return comoArchivo(plantilla(periodo, datosDeEpidemiologia(periodo), undefined, AREA).bytes, `Epidemiologia_${periodo}_ejemplo.docx`);
}

/* Dos defectos que Dr. Mochi sabe explicar: una fila TOTAL que no suma sus
   grupos de edad y una muerte neonatal anotada en una fila de adultos. */
export function ejemploConErrores(periodo) {
  const datos = datosDeEpidemiologia(periodo);
  datos.f1.e25.muerte_neonatal_m = 1;
  const totalGineco = Object.values(datos.f1).reduce((a, fila) => a + (fila.gineco_f ?? 0), 0);
  const { bytes } = plantilla(periodo, datos, { totales: { gineco_f: totalGineco + 2 } }, AREA);
  return comoArchivo(bytes, `Epidemiologia_${periodo}_ejemplo_con_errores.docx`);
}

export function descargarPlantilla(periodo) {
  const { bytes, nombre } = plantilla(periodo, null, undefined, AREA);
  const url = URL.createObjectURL(new Blob([bytes], { type: TIPO_WORD }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
