/* Exporta la regla del «periodo vigente» del frontend a un JSON que el backend
   compara con su propia copia (`servidor/api/app/dominio/periodos.py::periodo_vigente`).

   Las dos implementaciones son independientes --- un JS y un Python, sin
   código compartido--- así que no se puede evitar la duplicación en sí; lo
   que este contrato evita es que cambien sin que alguien lo note: si una se
   ajusta (por ejemplo, a «el mes vigente» en vez de «el mes anterior»), el
   JSON versionado queda desactualizado y `servidor/api/pruebas/
   prueba_contrato_periodo_vigente.py` lo dice.

     node scripts/exportar-contrato-periodo.mjs            escribe servidor/api/contrato/periodo_vigente.json
     node scripts/exportar-contrato-periodo.mjs --stdout    lo imprime, sin escribir */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { periodoVigente } from '../src/app/dominio/periodos.js';

const DESTINO = fileURLToPath(new URL('../../servidor/api/contrato/periodo_vigente.json', import.meta.url));

/* Casos de prueba, no todos los días del año: un mes cualquiera, el cruce de
   año (diciembre -> enero) y el primer y último día de un mes, que es donde
   un error de desfase de un día se notaría. */
const HOY_DE_PRUEBA = [
  '2026-09-13', '2026-01-01', '2026-01-31', '2026-12-01', '2026-12-31', '2027-01-15',
];

const contrato = {
  casos: HOY_DE_PRUEBA.map((hoy) => ({ hoy, vigente: periodoVigente(hoy) })),
};

const texto = `${JSON.stringify(contrato, null, 2)}\n`;

if (process.argv.includes('--stdout')) {
  process.stdout.write(texto);
} else {
  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, texto, 'utf8');
  console.log(`Contrato del periodo vigente escrito en ${DESTINO}`);
}
