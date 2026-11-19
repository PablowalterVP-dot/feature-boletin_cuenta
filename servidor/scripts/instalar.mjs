/* Prepara la API una sola vez: instala el paquete (en el entorno de conda o en .venv) con
   sus dependencias de desarrollo y deja un .env a partir del ejemplo.

   No crea la base de datos: para instalar migraciones y seeders después de ajustar
   servidor/api/.env, usa `npm run migrate` y `npm run seed`. El bot no necesita
   instalación: no tiene dependencias.

   Dónde se instala: si hay un entorno de conda activado (que no sea `base`), en
   ese entorno, y no se crea .venv. Si no, en servidor/api/.venv, creado con el
   Python de la variable PYTHON si existe; si no, `py -3` en Windows y `python3`
   en lo demás. */

import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { API, PYTHON_VENV, WINDOWS, entornoConda } from './comun.mjs';

const VERSION_MINIMA = [3, 13]; // la de requires-python en api/pyproject.toml

function correr(comando, argumentos, opciones = {}) {
  const r = spawnSync(comando, argumentos, { cwd: API, stdio: 'inherit', ...opciones });
  if (r.error || r.status !== 0) {
    console.error(`\nFalló: ${comando} ${argumentos.join(' ')}`);
    process.exit(r.status || 1);
  }
}

function pythonDelSistema() {
  if (process.env.PYTHON) return [process.env.PYTHON, []];
  return WINDOWS ? ['py', ['-3']] : ['python3', []];
}

function exigirVersion(python, previos) {
  const version = spawnSync(python, [...previos, '-c', 'import sys; print(sys.version_info[0], sys.version_info[1])'], { encoding: 'utf-8' });
  if (version.error || version.status !== 0) {
    console.error(`No se encontró Python (${python}). Instala Python ${VERSION_MINIMA.join('.')} o superior, o indica cuál usar con la variable PYTHON.`);
    process.exit(1);
  }
  const [mayor, menor] = version.stdout.trim().split(' ').map(Number);
  if (mayor < VERSION_MINIMA[0] || (mayor === VERSION_MINIMA[0] && menor < VERSION_MINIMA[1])) {
    console.error(`La API necesita Python ${VERSION_MINIMA.join('.')} o superior y ${python} ${previos.join(' ')} es ${mayor}.${menor}.`);
    if (process.env.CONDA_PREFIX) {
      console.error('Crea un entorno propio para la API y actívalo antes de instalar:');
      console.error('  conda create -n hrl python=3.13 -y');
      console.error('  conda activate hrl');
      process.exit(1);
    }
    console.error(WINDOWS ? 'Instala uno más nuevo, o elige otro con: set PYTHON=ruta\\a\\python.exe' : 'Instala uno más nuevo, o elige otro con: PYTHON=/ruta/a/python npm run instalar');
    process.exit(1);
  }
  return `${mayor}.${menor}`;
}

const conda = entornoConda();
let PYTHON = PYTHON_VENV;
if (conda) {
  const version = exigirVersion(conda.python, []);
  console.log(`Instalando en el entorno de conda «${conda.nombre}» (Python ${version}).`);
  PYTHON = conda.python;
} else if (!existsSync(PYTHON_VENV)) {
  const [python, previos] = pythonDelSistema();
  const version = exigirVersion(python, previos);
  console.log(`Creando servidor/api/.venv con Python ${version}…`);
  correr(python, [...previos, '-m', 'venv', '.venv']);
}

console.log('Instalando la API y sus dependencias…');
correr(PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet']);
correr(PYTHON, ['-m', 'pip', 'install', '-e', '.[dev]']);

const env = join(API, '.env');
if (!existsSync(env)) {
  copyFileSync(join(API, '.env.example'), env);
  console.log('\nSe creó servidor/api/.env a partir del ejemplo.');
  console.log('Antes de arrancar, ajusta en él DATABASE_URL, DATABASE_URL_PRUEBAS y JWT_SECRETO.');
}

console.log('\nListo. Para levantar la API y el bot: npm run dev');
