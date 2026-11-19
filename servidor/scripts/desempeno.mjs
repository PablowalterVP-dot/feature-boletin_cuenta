/* Prepara el módulo de indicadores de desempeño en la base de datos:
   crea los esquemas, tablas, índices, catálogos estructurales y permisos,
   sin insertar datos de pacientes ni requerir archivos.

     npm run desempeno

   Los datos se suben después desde el tablero web («Carga de datos») o mediante
   las herramientas específicas de carga. */

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

const r = spawnSync(python, ['-m', 'app.herramientas.instalar_desempeno'], { cwd: API, stdio: 'inherit' });
process.exit(r.error ? 1 : r.status);
