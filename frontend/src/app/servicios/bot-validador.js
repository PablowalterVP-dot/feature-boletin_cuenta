/* Cliente del bot validador.

   El bot es otro componente del sistema (../servidor/bot-validador, con su README).
   Este archivo es lo único del frontend que habla con él, en uno de dos modos:

     servicio   si está definida VITE_BOT_URL, cada validación es una
                petición HTTP al bot (npm start en servidor/bot-validador/)
     embebido   si no, el mismo motor del bot corre en el navegador. Es el
                modo del prototipo: se demuestra sin levantar nada más.

   Las pantallas llaman a estas funciones y no saben en qué modo están; la
   validación muestra cuál se usó. Las reglas no viven aquí: son del bot. */

import {
  BOT,
  ETAPAS,
  validarArchivo as validarEnMotor,
  validarDatos as validarDatosEnMotor,
  plantillaDe,
  firmaDe as firmaEnMotor,
  consolidadoAnual as consolidadoEnMotor,
  mesesDelArchivo as mesesDelArchivoEnMotor,
} from '@bot/motor.js';
import { celdaDeOrigen, nombreDeArchivo } from '@bot/areas/nutricion/plantilla.js';
import { abrirCorreccion as abrirCorreccionEnMotor, revalidar as revalidarEnMotor, libroCorregido as libroCorregidoEnMotor } from '@bot/correccion.js';
import { AREAS as AREAS_BOT_INTERNO } from '@bot/areas/index.js';
import { HOY } from '@/app/dominio/periodos.js';

export { BOT, ETAPAS as ETAPAS_BOT, celdaDeOrigen, nombreDeArchivo };
export { AREAS as AREAS_BOT } from '@bot/areas/index.js';
/* Leer y parchear un Excel ajeno (la plantilla de DIRESA, servicios/remision-diresa.js): el
   lector del bot, que cambia solo las celdas pedidas y deja el resto del archivo intacto. */
export { leerLibro as leerExcel, parchearHojas as parchearExcel } from '@bot/xlsx.js';

const URL_BOT = import.meta.env?.VITE_BOT_URL ?? null;

export const MODO_BOT = URL_BOT
  ? Object.freeze({ tipo: 'servicio', texto: `Servicio en ${URL_BOT}`, detalle: `Cada validación es una petición a ${URL_BOT}/validaciones.` })
  : Object.freeze({
      tipo: 'embebido',
      texto: 'Embebido en el navegador',
      detalle: 'El bot es un servicio aparte (servidor/bot-validador/). En el prototipo su motor corre en el navegador con las mismas reglas; con VITE_BOT_URL se usa el servicio.',
    });

/* El prototipo fija su propio «hoy»; el servicio real usa su reloj. */
const FECHA = `${HOY}T12:00`;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function aBase64(bytes) {
  let texto = '';
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(texto);
}

async function pedir(ruta, cuerpo) {
  try {
    const r = await fetch(`${URL_BOT}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const json = await r.json();
    if (!r.ok) return { bot: BOT, bloqueo: { id: 'servicio', titulo: 'El bot rechazó la petición', detalle: json.error ?? `Respuesta ${r.status}.` } };
    return json;
  } catch {
    return {
      bot: BOT,
      bloqueo: { id: 'servicio', titulo: 'No se pudo conectar con el bot', detalle: `El servicio en ${URL_BOT} no respondió. Revise que esté levantado (npm start en servidor/bot-validador/).` },
    };
  }
}

/* De qué meses de `anio` (hasta `hasta`) es un archivo, para cargar meses
   pasados sin decir a cuál va cada uno. Corre siempre en el navegador, con el
   motor embebido, aun en modo servicio: solo reconoce el Excel, no lee cifras
   ni valida. La validación de cada mes la hace después el bot de siempre (el
   servicio o, con el servidor, el backend). */
export async function mesesDelArchivo(archivo, { area, anio, hasta }) {
  return mesesDelArchivoEnMotor(new Uint8Array(await archivo.arrayBuffer()), { area, anio, hasta, nombre: archivo.name });
}

/* Lee y valida un archivo subido. `alAvanzar(idEtapa)` informa el progreso;
   `pausa` hace visibles las etapas en el modo embebido, que es instantáneo. */
export async function validarArchivo(archivo, { area = 'nutricion', periodo, anterior, alAvanzar = () => {}, pausa = 380 } = {}) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  if (URL_BOT) {
    alAvanzar('abrir');
    const informe = await pedir('/validaciones', { area, periodo, nombre: archivo.name, archivo: aBase64(bytes), anterior });
    alAvanzar('validar');
    return informe;
  }

  return validarEnMotor(bytes, {
    area,
    periodo,
    nombre: archivo.name,
    anterior,
    fecha: FECHA,
    alAvanzar: async (etapa) => {
      alAvanzar(etapa);
      await espera(pausa);
    },
  });
}

/* Revalida lo que hay en la hoja, tras corregir a mano. */
export async function validarDatos(datos, { area = 'nutricion', periodo, anterior, pausa = 250 } = {}) {
  if (URL_BOT) return pedir('/validaciones/datos', { area, periodo, datos, anterior });
  await espera(pausa);
  return validarDatosEnMotor(datos, { area, periodo, anterior, fecha: FECHA });
}

export function firmaDe(datos, area = 'nutricion') {
  return firmaEnMotor(area, datos);
}

/* La plantilla en blanco (o llena, para los ejemplos) como bytes. */
export function plantilla(periodo, datos = null, opciones, area = 'nutricion') {
  return plantillaDe(area, periodo, datos, opciones);
}

/* El consolidado anual del área (el «TOTAL» de Nutrición): lo arma el bot con
   los totales de los meses entregados. { nombre, bytes, consolidado }, o null
   si el área no lleva consolidado. Siempre en el navegador: no lee ningún
   archivo, solo cifras que el sistema ya tiene. */
export function consolidado(area, anio, meses, opciones) {
  return consolidadoEnMotor(area, anio, meses, opciones);
}

/* ------------------------------------------------- corrección guiada

   La corrección corre siempre en el navegador, también con el bot como
   servicio: trabaja sobre el archivo que el área tiene a mano y no guarda
   nada. Lo que vale es el libro corregido, que vuelve a subirse por el camino
   de siempre (`validarArchivo` o la API) y pasa por el bot como cualquier otro.

   El archivo subido se recuerda por área y mes: el servidor no lo devuelve, y
   sin él no hay libro que corregir. Se guarda en memoria y, además, en el
   almacenamiento del navegador (IndexedDB), para que recargar la página no
   obligue a elegirlo otra vez. Queda solo en este equipo, uno por área y mes
   (el nuevo reemplaza al anterior), y nunca sale de aquí. Si el navegador no
   deja guardar (ventana privada, almacenamiento bloqueado), sigue en memoria
   y la pantalla lo pide al recargar, como antes. */

const archivosDeLaSesion = new Map();

/* En la práctica del tutorial (practica.js) los archivos viven solo en memoria y
   no reemplazan a los de verdad, ni en la sesión ni en el navegador. */
let apartados = null;

export function apartarArchivos() {
  apartados = new Map(archivosDeLaSesion);
  archivosDeLaSesion.clear();
}

export function devolverArchivos() {
  archivosDeLaSesion.clear();
  for (const [clave, archivo] of apartados ?? []) archivosDeLaSesion.set(clave, archivo);
  apartados = null;
}

const BASE = 'hrl-correccion';
const ALMACEN = 'archivos';

function abrirBase() {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === 'undefined') return rechazar(new Error('sin IndexedDB'));
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

async function enBase(modo, operar) {
  const base = await abrirBase();
  try {
    return await new Promise((resolver, rechazar) => {
      const tx = base.transaction(ALMACEN, modo);
      const pedido = operar(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolver(pedido?.result ?? null);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error);
    });
  } finally {
    base.close();
  }
}

export function recordarArchivo(area, periodo, archivo) {
  const clave = `${area}|${periodo}`;
  archivosDeLaSesion.set(clave, archivo);
  if (apartados) return;
  /* Se guardan los bytes, no el File: así vale también para los archivos de
     ejemplo, que no son un File del disco. */
  Promise.resolve(archivo.arrayBuffer())
    .then((bytes) => enBase('readwrite', (almacen) => almacen.put({ nombre: archivo.name, bytes, fecha: Date.now() }, clave)))
    .catch(() => {});
}

export function archivoRecordado(area, periodo) {
  return archivosDeLaSesion.get(`${area}|${periodo}`) ?? null;
}

/* El archivo de esa área y mes, de la memoria o, si la página se recargó, del
   almacenamiento del navegador. null si no hay ninguno. */
export async function archivoGuardado(area, periodo) {
  const enMemoria = archivoRecordado(area, periodo);
  if (enMemoria) return enMemoria;
  if (apartados) return null;
  try {
    const guardado = await enBase('readonly', (almacen) => almacen.get(`${area}|${periodo}`));
    if (!guardado) return null;
    const archivo = comoArchivo(new Uint8Array(guardado.bytes), guardado.nombre);
    archivosDeLaSesion.set(`${area}|${periodo}`, archivo);
    return archivo;
  } catch {
    return null;
  }
}

/* Lo que el área sabe de sus casillas (areas/<área>/correccion.js del bot), o
   null si su reporte no se corrige así. */
export function correccionDe(area) {
  return AREAS_BOT_INTERNO[area]?.correccion ?? null;
}

/* Abre un archivo para corregirlo: { informe, hoja, celdas, bytes }. */
export async function abrirCorreccion(archivo, { area, periodo, anterior = null } = {}) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const abierto = await abrirCorreccionEnMotor(bytes, { area, periodo, anterior, nombre: archivo.name, fecha: FECHA });
  return abierto ? { ...abierto, bytes } : null;
}

export function revalidarCorreccion(area, base, cambios, { origen, periodo, anterior = null } = {}) {
  return revalidarEnMotor(area, base, cambios, { origen, periodo, anterior, fecha: FECHA });
}

export { explicar as explicarHallazgo } from '@bot/correccion.js';

/* El archivo corregido: { bytes, nombre, celdas }. El nombre conserva el del
   archivo del área, para que sepa cuál es sin abrirlo, y su extensión: un
   Word (Farmacia, Nefrología) vuelve como Word. */
export async function excelCorregido(area, abierto, datos, nombreOriginal) {
  const { bytes, celdas } = await libroCorregidoEnMotor(abierto.bytes, area, { base: abierto.informe.datos, datos, origen: abierto.informe.origen, hoja: abierto.hoja });
  const extension = abierto.tipo === 'docx' ? 'docx' : 'xlsx';
  // Un .doc vuelve como .docx: el bot no reescribe el formato antiguo (docx.js, `docxDeDoc`).
  const nombre = `${nombreOriginal.replace(/\.(xlsx|docx?)$/i, '')}_corregido.${extension}`;
  return { bytes, nombre, celdas };
}

const TIPOS = Object.freeze({
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

export function comoArchivo(bytes, nombre) {
  return new File([bytes], nombre, { type: /\.docx$/i.test(nombre) ? TIPOS.docx : TIPOS.xlsx });
}
