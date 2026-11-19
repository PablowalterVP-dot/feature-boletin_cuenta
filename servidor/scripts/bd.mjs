/* Ejecuta el gestor de migraciones y seeders SQL de la API.

     npm run migrate                  Aplica migraciones pendientes
     npm run migrate:status           Muestra tabla de estado (migraciones y seeders)
     npm run seed                     Aplica seeders pendientes
     npm run migrate:fresh            Recrea esquemas desde cero y aplica migraciones
     npm run migrate:fresh -- --seed  Recrea esquemas desde cero, migra y corre seeders */

import { spawnSync } from 'node:child_process';
import { API, avisarSinPython, problemaDelPython, pythonDeLaApi } from './comun.mjs';

const python = pythonDeLaApi();
if (!python) {
  avisarSinPython();
  process.exit(1);
}
const problema = problemaDelPython(python);
if (problema) {
  console.error(problema);
  process.exit(1);
}

const args = process.argv.slice(2);
const r = spawnSync(python, ['-m', 'app.herramientas.bd', ...args], { cwd: API, stdio: 'inherit' });
process.exit(r.error ? 1 : r.status);
