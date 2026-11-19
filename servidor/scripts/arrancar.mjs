/* Levanta el lado servidor con un solo comando.

     node scripts/arrancar.mjs        el bot (:8787) y la API (:8000), juntos
     node scripts/arrancar.mjs bot    solo el bot
     node scripts/arrancar.mjs api    solo la API
     node scripts/arrancar.mjs hospitalizacion
                                      los dos y la API de hospitalización (:8010),
                                      para probar las cuentas de los pisos

   Puertos: PUERTO_BOT y PUERTO_API. Cada línea sale con el prefijo de quien la
   escribió. Si uno de los dos cae, se baja el otro: una API arriba con el bot
   caído falla en la primera carga de Excel, lejos de la causa.

   Cuando van juntos, a la API se le pasa BOT_VALIDADOR_URL apuntando al bot que
   se acaba de levantar (salvo que ya venga en el entorno), así el .env no tiene
   que repetir el puerto. */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { API, BOT, RAIZ, WINDOWS, avisarSinPython, problemaDelPython, pythonDeLaApi } from './comun.mjs';

const PUERTO_BOT = process.env.PUERTO_BOT ?? '8787';
const PUERTO_API = process.env.PUERTO_API ?? '8000';
const PUERTO_HOSPITALIZACION = process.env.PUERTO_HOSPITALIZACION ?? '8010';
const HOSPITALIZACION = join(RAIZ, 'hospitalizacion');

const pedido = process.argv[2];
const quiereHospitalizacion = pedido === 'hospitalizacion';
const quiereBot = !pedido || pedido === 'bot' || quiereHospitalizacion;
const quiereApi = !pedido || pedido === 'api' || quiereHospitalizacion;
if (!quiereBot && !quiereApi) {
  console.error(`No sé arrancar «${pedido}». Opciones: bot, api, hospitalizacion, o nada para los dos primeros.`);
  process.exit(1);
}

/* Hospitalización (decisión 0011 de su carpeta docs/hospitalizacion/): su API vive en
   servidor/hospitalizacion/, con su .venv, su .env y su base en el PostgreSQL del
   docker-compose.dev.yml de esa carpeta. Se revisa antes de arrancar nada: sin su
   base o con otro secreto, las pantallas de los pisos dirían «Sin conexión» sin decir
   por qué. */
const PYTHON_HOSPITALIZACION = join(HOSPITALIZACION, '.venv', WINDOWS ? 'Scripts/python.exe' : 'bin/python');

function variablesDe(ruta) {
  if (!existsSync(ruta)) return null;
  return Object.fromEntries(
    readFileSync(ruta, 'utf-8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
  );
}

const responde = (puerto) => new Promise((resolver) => {
  const s = connect({ host: '127.0.0.1', port: Number(puerto) }, () => { s.end(); resolver(true); });
  s.on('error', () => resolver(false));
  s.setTimeout(1500, () => { s.destroy(); resolver(false); });
});

if (quiereHospitalizacion) {
  const problemas = [];
  const propio = variablesDe(join(HOSPITALIZACION, '.env'));
  const deEstadistica = variablesDe(join(API, '.env'));
  if (!existsSync(PYTHON_HOSPITALIZACION)) problemas.push('Falta servidor/hospitalizacion/.venv (ver servidor/hospitalizacion/README.md).');
  if (!propio) problemas.push('Falta servidor/hospitalizacion/.env.');
  else {
    if (propio.INGRESO !== 'estadistica') problemas.push('En servidor/hospitalizacion/.env falta INGRESO=estadistica: sin eso, las cuentas de Estadística no entran a hospitalización.');
    if (deEstadistica && propio.JWT_SECRETO !== deEstadistica.JWT_SECRETO) problemas.push('JWT_SECRETO no es el mismo en servidor/api/.env y en servidor/hospitalizacion/.env: el token de uno no abre el otro.');
    if (!(await responde(propio.EGRESOS_DB_PUERTO ?? '5544'))) problemas.push(`La base de hospitalización no responde en el puerto ${propio.EGRESOS_DB_PUERTO ?? '5544'}. Levántala con: docker compose -f hospitalizacion/docker-compose.dev.yml up -d --wait`);
  }
  if (problemas.length) {
    problemas.forEach((p) => console.error(`[hospitalizacion] ${p}`));
    process.exit(1);
  }
}

const PYTHON = quiereApi ? pythonDeLaApi() : null;
if (quiereApi) {
  if (!PYTHON) {
    avisarSinPython();
    process.exit(1);
  }
  const problema = problemaDelPython(PYTHON);
  if (problema) {
    console.error(`[api] ${problema}`);
    process.exit(1);
  }
  if (!existsSync(join(API, '.env'))) {
    console.warn('[api] No hay servidor/api/.env: la API no sabrá a qué base conectarse. Copia .env.example y ajústalo.');
  }
}

const procesos = [];
let cerrando = false;

function prefijar(flujo, etiqueta, destino) {
  let resto = '';
  flujo.setEncoding('utf-8');
  flujo.on('data', (trozo) => {
    const lineas = (resto + trozo).split(/\r?\n/);
    resto = lineas.pop();
    for (const linea of lineas) destino.write(`${etiqueta} ${linea}\n`);
  });
  flujo.on('end', () => { if (resto) destino.write(`${etiqueta} ${resto}\n`); });
}

/* En Windows, uvicorn con --reload deja un proceso hijo: matar solo al padre
   lo dejaría ocupando el puerto. taskkill /T baja el árbol entero. */
function matar(proceso) {
  if (proceso.exitCode !== null) return;
  if (WINDOWS) spawnSync('taskkill', ['/pid', String(proceso.pid), '/T', '/F'], { stdio: 'ignore' });
  else proceso.kill('SIGTERM');
}

function cerrar(codigo) {
  if (cerrando) return;
  cerrando = true;
  procesos.forEach(matar);
  process.exit(codigo);
}

function lanzar(etiqueta, comando, argumentos, opciones) {
  const proceso = spawn(comando, argumentos, { ...opciones, env: { ...process.env, ...opciones.env } });
  prefijar(proceso.stdout, etiqueta, process.stdout);
  prefijar(proceso.stderr, etiqueta, process.stderr);
  proceso.on('error', (error) => {
    console.error(`${etiqueta} no arrancó: ${error.message}`);
    cerrar(1);
  });
  proceso.on('exit', (codigo) => {
    if (cerrando) return;
    console.error(`${etiqueta} terminó (código ${codigo ?? 'sin código'}). Bajando lo demás.`);
    cerrar(codigo || 1);
  });
  procesos.push(proceso);
}

if (quiereBot) {
  lanzar('[bot]', process.execPath, ['src/servidor.js'], { cwd: BOT, env: { PUERTO: PUERTO_BOT } });
}

if (quiereApi) {
  const env = { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
  if (quiereBot && !process.env.BOT_VALIDADOR_URL) env.BOT_VALIDADOR_URL = `http://localhost:${PUERTO_BOT}`;
  lanzar('[api]', PYTHON, ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', PUERTO_API], { cwd: API, env });
}

if (quiereHospitalizacion) {
  lanzar('[hosp]', PYTHON_HOSPITALIZACION, ['-m', 'uvicorn', 'app.principal:app', '--reload', '--port', PUERTO_HOSPITALIZACION], {
    cwd: HOSPITALIZACION,
    env: { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
  });
}

console.log([
  quiereBot && `Bot validador: http://localhost:${PUERTO_BOT}`,
  quiereApi && `API:           http://localhost:${PUERTO_API}  (documentación en /docs)`,
  quiereHospitalizacion && `Hospitalización: http://localhost:${PUERTO_HOSPITALIZACION}  (el frontend la alcanza en /api/hospitalizacion)`,
  'Ctrl+C para detener.',
].filter(Boolean).join('\n'));

process.on('SIGINT', () => cerrar(0));
process.on('SIGTERM', () => cerrar(0));
