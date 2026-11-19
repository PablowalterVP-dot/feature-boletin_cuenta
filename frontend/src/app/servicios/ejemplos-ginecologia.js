/* El Excel de Gineco-Obstetricia: formato en blanco y ejemplos.

   El bot genera un Excel con los mismos dos cuadros del Excel real del área
   (servidor/bot-validador/src/areas/ginecologia/plantilla.js). Los ejemplos
   van llenos con cifras simuladas —ficticias, y la pantalla lo dice— y pasan
   por el mismo lector y las mismas reglas que un Excel subido.

   El ejemplo con errores combina dos defectos reales que el Excel del área
   sí puede traer: una celda con texto donde va una cifra, y un total
   declarado que no cuadra con la suma de sus filas (como el que de verdad
   hay que corregir en el Excel, no algo que el bot inventa). */

import { datosDeGinecologia } from '@/app/datos/formatos/ginecologia-siembra.js';
import { totalColumna } from '@/app/datos/formatos/ginecologia-calculos.js';
import { claveFila } from '@/app/datos/formatos/ginecologia.js';
import { plantilla } from './bot-validador.js';

const AREA = 'ginecologia';
const TIPO_EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
  return comoArchivo(plantilla(periodo, datosDeGinecologia(periodo), undefined, AREA).bytes, `Ginecologia_${periodo}_ejemplo.xlsx`);
}

export function ejemploConErrores(periodo) {
  const datos = datosDeGinecologia(periodo);
  datos.f1[claveFila('edad_20_24', 'controles_prenatales')] = 'treinta'; // una celda con texto donde va una cifra
  const declarado = totalColumna(datos, 'f1', 'partos_1_control') + 50; // el TOTAL no cuadra con sus filas
  const { bytes } = plantilla(periodo, datos, { declarados: { f1: { partos_1_control: declarado } } }, AREA);
  return comoArchivo(bytes, `Ginecologia_${periodo}_ejemplo_con_errores.xlsx`);
}

export function descargarPlantilla(periodo) {
  const { bytes, nombre } = plantilla(periodo, null, undefined, AREA);
  const url = URL.createObjectURL(new Blob([bytes], { type: TIPO_EXCEL }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
