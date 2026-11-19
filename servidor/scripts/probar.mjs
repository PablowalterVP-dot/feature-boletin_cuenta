/* Corre las pruebas de los dos componentes del servidor: primero el bot (no
   necesita nada) y luego las de la API con pytest. Las de la API que necesitan
   PostgreSQL se saltan solas sin DATABASE_URL_PRUEBAS. */

import { spawnSync } from 'node:child_process';
import { API, BOT, avisarSinPython, pythonDeLaApi } from './comun.mjs';

function correr(titulo, comando, argumentos, cwd) {
  console.log(`\n── ${titulo} ──`);
  const r = spawnSync(comando, argumentos, { cwd, stdio: 'inherit' });
  return r.error ? 1 : r.status;
}

const bot = correr('bot-validador', process.execPath, ['pruebas/prueba.mjs'], BOT);

let api = 1;
const python = pythonDeLaApi();
if (python) api = correr('api (pytest)', python, ['-m', 'pytest'], API);
else avisarSinPython();

console.log(`\nbot: ${bot === 0 ? 'bien' : 'FALLÓ'} · api: ${api === 0 ? 'bien' : 'FALLÓ'}`);
process.exit(bot || api);
