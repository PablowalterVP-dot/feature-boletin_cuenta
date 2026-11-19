/* El cuadro de Nefrología y Hemodiálisis en Word: formato en blanco y
   ejemplos.

   El bot genera un Word con la misma tabla del cuadro real del servicio
   (servidor/bot-validador/src/areas/nefrologia/plantilla.js), con la columna
   del mes pedido ya escrita y las demás en blanco, como un cuadro que recién
   llega a ese mes. Los ejemplos pasan por el mismo lector y las mismas
   reglas que un Word subido.

   La plantilla solo puede escribir la columna de UN mes (así es el cuadro
   real: un mes a la vez, con el documento completo del año alrededor). Por
   eso el ejemplo con errores no puede mostrar un trimestre mal sumado —eso
   exige tres meses ya en el documento, que no se simulan aquí— y combina en
   cambio dos defectos que sí caben en un solo mes: una celda con texto donde
   va una cifra y un indicador sin registrar. */

import { datosDeNefrologia } from '@/app/datos/formatos/nefrologia-siembra.js';
import { plantilla } from './bot-validador.js';

const AREA = 'nefrologia';
const TIPO_WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
  return comoArchivo(plantilla(periodo, datosDeNefrologia(periodo), undefined, AREA).bytes, `Nefrologia_${periodo}_ejemplo.docx`);
}

export function ejemploConErrores(periodo) {
  const datos = datosDeNefrologia(periodo);
  datos.f1.fallecidos = 'dos'; // una celda con texto donde va una cifra
  delete datos.f1.abandono; // un indicador sin registrar
  const { bytes } = plantilla(periodo, datos, undefined, AREA);
  return comoArchivo(bytes, `Nefrologia_${periodo}_ejemplo_con_errores.docx`);
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
