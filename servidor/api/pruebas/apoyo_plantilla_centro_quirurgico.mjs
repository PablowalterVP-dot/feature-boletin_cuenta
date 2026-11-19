/* Apoyo de prueba_centro_quirurgico.py: genera el libro de Centro Quirúrgico con
   el propio bot, lleno y coherente (el RESUMEN y el cuadro de indicadores
   cuadran con las hojas por especialidad) para que lo acepte sin
   observaciones, con roturas opcionales para forzar hallazgos.

     node apoyo_plantilla_centro_quirurgico.mjs 2026-08
     node apoyo_plantilla_centro_quirurgico.mjs 2026-08 '[{"cuadro":"suspendidas","fila":"falta_insumos","valor":"dos"}]'
     node apoyo_plantilla_centro_quirurgico.mjs 2026-08 '[]' 2      (cada procedimiento multiplicado por 2)

   Imprime el .xlsx en base64 por stdout. */

import { CAUSAS } from '../../bot-validador/src/areas/centro-quirurgico/definicion.js';
import { PROCEDIMIENTOS_TIPICOS } from '../../bot-validador/src/areas/centro-quirurgico/procedimientos.js';
import { crearPlantilla } from '../../bot-validador/src/areas/centro-quirurgico/plantilla.js';

const periodo = process.argv[2];
const roturas = process.argv[3] ? JSON.parse(process.argv[3]) : [];
const factor = Number(process.argv[4] ?? 1);

const procedimientos = { mayor: {}, menor: {} };
for (const tipo of ['mayor', 'menor']) {
  for (const [esp, lista] of Object.entries(PROCEDIMIENTOS_TIPICOS[tipo])) procedimientos[tipo][esp] = lista.map((rotulo, i) => ({ rotulo, valor: (i % 3) * factor }));
}
const total = (tipo) => Object.values(procedimientos[tipo]).flat().reduce((a, p) => a + p.valor, 0);
const mayor = total('mayor');
const menor = total('menor');
const mEmerg = Math.floor(mayor / 2);
const nEmerg = Math.floor(menor / 10);
const resumen = {
  'mayores.programada': mayor - mEmerg, 'mayores.emergencia': mEmerg,
  'menores.programada': menor - nEmerg, 'menores.emergencia': nEmerg,
  'horas_programadas.programada': 34.75, 'horas_programadas.emergencia': 28,
  'horas_efectivas.programada': 30.5, 'horas_efectivas.emergencia': 25.25,
  'horas_acto.programada': 24, 'horas_acto.emergencia': 20.5,
  'suspendidas.programada': 2, 'suspendidas.emergencia': 0,
};
const suspendidas = Object.fromEntries(CAUSAS.filter((c) => !c.ocasional).map((c) => [c.clave, 0]));
Object.assign(suspendidas, { falta_tiempo: 1, falta_insumos: 1 });
const programadas = resumen['mayores.programada'] + resumen['menores.programada'];
const emergencia = mEmerg + nEmerg;
const indicadores = {
  salas_utilizadas: 4, salas_emergencia: 1, salas_programadas: 3,
  intervenciones_emergencia: emergencia, intervenciones_programadas: programadas, intervenciones_suspendidas: 2,
  intervenciones_realizadas: programadas + emergencia, horas_efectivas: 55.75, horas_programadas: 62.75,
  reintervenidos: 1, defunciones: 0,
};
const datos = { resumen, indicadores, suspendidas, procedimientos };
for (const r of roturas) datos[r.cuadro][r.fila] = r.valor;

process.stdout.write(Buffer.from(crearPlantilla(periodo, datos)).toString('base64'));
