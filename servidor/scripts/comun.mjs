/* Lo que comparten los scripts de servidor/: dónde está cada componente y con
   qué Python correr la API. Sin dependencias, como el bot: Node basta. */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const RAIZ = fileURLToPath(new URL('..', import.meta.url));
export const API = join(RAIZ, 'api');
export const BOT = join(RAIZ, 'bot-validador');
export const WINDOWS = process.platform === 'win32';

const PYTHON_VENV = join(API, '.venv', WINDOWS ? 'Scripts' : 'bin', WINDOWS ? 'python.exe' : 'python');

/* Un entorno de conda activado (que no sea `base`). Quien trabaja con Anaconda
   no crea un .venv: instala la API en su entorno y lo activa antes. */
export function entornoConda() {
  const prefijo = process.env.CONDA_PREFIX;
  if (!prefijo || process.env.CONDA_DEFAULT_ENV === 'base') return null;
  const python = join(prefijo, WINDOWS ? 'python.exe' : 'bin/python');
  return existsSync(python) ? { nombre: process.env.CONDA_DEFAULT_ENV, python } : null;
}

/* Con qué Python corre la API: el de api/.venv si existe; si no, el del
   entorno de conda activado. Nunca el del sistema a secas: así nadie depende
   de recordar qué tenía activado. */
export function pythonDeLaApi() {
  if (existsSync(PYTHON_VENV)) return PYTHON_VENV;
  return entornoConda()?.python ?? null;
}

export { PYTHON_VENV };

/* Antes de arrancar, que el Python elegido sirva: un entorno de conda de otro
   proyecto puede tener uvicorn por casualidad y faltarle el resto, y entonces
   la API cae con un traceback largo mientras el reloader sigue vivo. Mejor un
   motivo claro y no arrancar. Devuelve el problema, o null si está bien. */
export function problemaDelPython(python) {
  const prueba = 'import sys\n'
    + 'if sys.version_info < (3, 13): print("version", "%d.%d" % sys.version_info[:2]); sys.exit()\n'
    + 'import importlib.util as u\n'
    + 'faltan = [m for m in ("fastapi", "uvicorn", "sqlalchemy", "psycopg", "pydantic_settings", "jwt", "argon2", "xlrd") if u.find_spec(m) is None]\n'
    + 'if faltan: print("faltan", " ".join(faltan))';
  const r = spawnSync(python, ['-c', prueba], { encoding: 'utf-8' });
  if (r.error || r.status !== 0) return `No se pudo ejecutar ${python}.`;
  const [tipo, ...resto] = r.stdout.trim().split(' ');
  if (tipo === 'version') return `La API necesita Python 3.13 o superior y este entorno tiene ${resto[0]} (${python}).`;
  if (tipo === 'faltan') return `A este entorno le faltan dependencias de la API (${resto.join(', ')}). Corre: npm run instalar`;
  return null;
}

export function avisarSinPython() {
  console.error('No hay un Python para la API: ni servidor/api/.venv ni un entorno de conda activado.');
  console.error('Con Anaconda: conda activate hrl   ·   Sin Anaconda: npm run instalar');
}
