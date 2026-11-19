/* Un informe de Farmacia en Word, en base64, para las pruebas de la API.

     node apoyo_word_farmacia.mjs 2026-01            con las cifras del informe de enero de 2026
     node apoyo_word_farmacia.mjs 2026-01 roto       con el total SIS mal escrito

   Lo genera el propio bot (areas/farmacia/plantilla.js), con los mismos
   cuadros y rótulos que el Word real del área, así que pasa por el mismo
   lector. Las cifras son las del informe de enero de 2026. */

import { plantillaDe } from '../../bot-validador/src/motor.js';
import { FILAS } from '../../bot-validador/src/areas/farmacia/definicion.js';

const [periodo = '2026-01', variante = ''] = process.argv.slice(2);
const porFila = (valores) => Object.fromEntries(FILAS.map((f, i) => [f.clave, valores[i]]));
const fila = (mater, ginec, ciru, medi, pedia) => ({ mater, ginec, ciru, medi, pedia });

const ENERO = {
  f1: {
    sis: { hosp: 9264, emerg: 6113, ce: 2668, hemodialisis: 718, oncologia: 115 },
    convenio: { emerg: 180, hosp: 168, consultorio: 151 },
    otros: { programas: 655, boletas: 4367, credito: 0, defensa: 0, insolvencias: 0 },
  },
  f2: {
    hospitalizados: porFila([fila(17, 17, 22, 22, 3), fila(152, 42, 41, 33, 139), fila(49, 79, 93, 47, 32), fila(6, 3, 5, 14, 2)]),
    convenios: porFila([5, 14, 5, 0]),
  },
  f3: { consultas: porFila([0, 1292, 1303, 73]), convenios: porFila([0, 137, 14, 0]) },
};

const opciones = variante === 'roto' ? { declarados: { totalSis: 18000 } } : {};
const { bytes } = plantillaDe('farmacia', periodo, ENERO, opciones);
process.stdout.write(Buffer.from(bytes).toString('base64'));
