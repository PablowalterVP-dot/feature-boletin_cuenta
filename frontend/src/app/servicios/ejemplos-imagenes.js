/* El oficio de Diagnóstico por Imágenes en Word: formato en blanco y ejemplos.

   El bot genera un Word con las mismas tablas del oficio real
   (servidor/bot-validador/src/areas/imagenes/plantilla.js). Los ejemplos
   pasan por el mismo lector y las mismas reglas que un oficio subido. Sus
   cifras son las de la siembra (imagenes-siembra.js): junio es el oficio
   real; los demás meses, variaciones ficticias. */

import { datosDeImagenes } from '@/app/datos/formatos/imagenes-siembra.js';
import { examenesDeFila } from '@/app/datos/formatos/imagenes-calculos.js';
import { plantilla } from './bot-validador.js';

const AREA = 'imagenes';
const TIPO_WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function comoArchivo(bytes, nombre) {
  return { name: nombre, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

export function nombreDePlantilla(periodo) {
  return plantilla(periodo, null, undefined, AREA).nombre;
}

export function ejemploCorrecto(periodo) {
  return comoArchivo(plantilla(periodo, datosDeImagenes(periodo), undefined, AREA).bytes, `Imagenes_${periodo}_ejemplo.docx`);
}

/* Los dos defectos más comunes de los oficios de 2026: la EXAM de un médico
   que no suma sus casillas y un tecnólogo de Rayos X con un dígito de más. */
export function ejemploConErrores(periodo) {
  const datos = datosDeImagenes(periodo);
  const primero = datos.f1.examenes[0];
  datos.f4.tecnologos[1].cantidad *= 10;
  const { bytes } = plantilla(periodo, datos, { escritos: { exam: { 'examenes.0': (examenesDeFila(primero) ?? 0) + 4 } } }, AREA);
  return comoArchivo(bytes, `Imagenes_${periodo}_ejemplo_con_errores.docx`);
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
