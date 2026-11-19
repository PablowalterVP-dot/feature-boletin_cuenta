/* Apoyo de prueba_api_cargas.py: genera una plantilla real de Nutrición,
   llena con cifras (10 en cada casilla) para que el bot la acepte sin
   observaciones, con roturas opcionales para forzar hallazgos concretos.

     node apoyo_generar_plantilla.mjs 2026-08
     node apoyo_generar_plantilla.mjs 2026-08 '[{"cuadro":"f1","fila":"asistencial.desayuno","dia":1,"valor":"cuarenta"}]'

   Imprime el .xlsx en base64 por stdout: así la prueba de Python no necesita
   reimplementar el formato ni tocar el disco. */

import { FORMATOS } from '../../bot-validador/src/areas/nutricion/definicion.js';
import { crearPlantilla } from '../../bot-validador/src/areas/nutricion/plantilla.js';
import { diasDelMes } from '../../bot-validador/src/periodos.js';

const periodo = process.argv[2];
const roturas = process.argv[3] ? JSON.parse(process.argv[3]) : [];
const n = diasDelMes(periodo);

const datos = {};
for (const f of FORMATOS) {
  datos[f.id] = {};
  for (const fila of f.filas) {
    datos[f.id][fila.clave] = Array.from({ length: n }, () => 10);
  }
}
for (const r of roturas) {
  datos[r.cuadro][r.fila][r.dia - 1] = r.valor;
}

const bytes = crearPlantilla(periodo, datos);
process.stdout.write(Buffer.from(bytes).toString('base64'));
