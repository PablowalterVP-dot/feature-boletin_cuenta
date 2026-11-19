/* El informe de Farmacia en Word: formato en blanco y ejemplos.

   El bot genera un Word con los mismos cuadros que el informe real del área
   (servidor/bot-validador/src/areas/farmacia/plantilla.js). Los ejemplos van
   llenos con las cifras simuladas —ficticias, y la pantalla lo dice— y pasan
   por el mismo lector y las mismas reglas que un Word subido. El de errores
   trae los tres problemas del informe real de enero de 2026 que el sistema
   tiene que atajar, más un descuadre:
     · los títulos con el año equivocado («ENERO 2024»),
     · un total SIS escrito que no es la suma de sus partes,
     · consultas del cuadro de consultorios que no cuadran con el resumen. */

import { datosDeFarmacia } from '@/app/datos/formatos/farmacia-siembra.js';
import { totalSis } from '@/app/datos/formatos/farmacia-calculos.js';
import { plantilla } from './bot-validador.js';

const AREA = 'farmacia';
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
  return comoArchivo(plantilla(periodo, datosDeFarmacia(periodo), undefined, AREA).bytes, `Farmacia_${periodo}_ejemplo.docx`);
}

export function ejemploConErrores(periodo) {
  const datos = datosDeFarmacia(periodo);
  datos.f3.consultas.fila2 += 12;
  const { bytes } = plantilla(periodo, datos, { anioRotulo: String(Number(periodo.slice(0, 4)) - 2), declarados: { totalSis: totalSis(datos.f1) + 100 } }, AREA);
  return comoArchivo(bytes, `Farmacia_${periodo}_ejemplo_con_errores.docx`);
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
