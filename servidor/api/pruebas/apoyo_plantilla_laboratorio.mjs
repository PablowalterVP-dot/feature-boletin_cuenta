/* Apoyo de prueba_laboratorio.py: genera la plantilla de Laboratorio con el
   propio bot, llena (cada casilla según su procedencia: 10/10/10/5/5/5) para
   que la acepte sin observaciones, con roturas opcionales para forzar hallazgos.

     node apoyo_plantilla_laboratorio.mjs 2026-08
     node apoyo_plantilla_laboratorio.mjs 2026-08 '[{"cuadro":"bioquimica","fila":"glucosa.emergencia","valor":"cien"}]'
     node apoyo_plantilla_laboratorio.mjs 2026-08 '[]' 2      (todas las casillas multiplicadas por 2)

   Imprime el .xlsx en base64 por stdout: así la prueba de Python no necesita
   reimplementar el formato ni tocar el disco. */

import { CUADROS } from '../../bot-validador/src/areas/laboratorio/definicion.js';
import { crearPlantilla } from '../../bot-validador/src/areas/laboratorio/plantilla.js';

const periodo = process.argv[2];
const roturas = process.argv[3] ? JSON.parse(process.argv[3]) : [];
const factor = Number(process.argv[4] ?? 1);

const datos = {};
for (const c of CUADROS) {
  datos[c.id] = {};
  for (const f of c.filas) datos[c.id][f.clave] = ({ hospitalizacion: 10, emergencia: 10, c_externa: 10 }[f.procedencia] ?? 5) * factor;
}
for (const r of roturas) datos[r.cuadro][r.fila] = r.valor;

process.stdout.write(Buffer.from(crearPlantilla(periodo, datos)).toString('base64'));
