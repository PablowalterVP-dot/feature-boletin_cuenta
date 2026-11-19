/* Los dos formatos de DIRESA, cada uno en su propio Excel oficial.

   SERVICIOS INTERMEDIOS

   Se parte del archivo oficial con que Estadística remite (`public/plantillas/`,
   copia de «SERV INTER DIRESA ARANA.xlsx»: un libro con una hoja por mes y otra
   anual, ~180 establecimientos por hoja) y se escriben solo las celdas del
   hospital en la hoja del mes. Todo lo demás —estilos, comentarios, las otras
   filas y hojas, la identificación de la fila— queda tal como viene: el bot
   reescribe esas celdas y copia el resto del archivo byte por byte, y marca el
   libro para que Excel recalcule al abrir (los totales y la hoja ANUAL son
   fórmulas).

   Dos cosas que no se ven mirando el archivo por encima:
   - **La fila del hospital se busca por su RENIPRESS, no por su número.** En
     once hojas es la 148, pero en JUNIO el orden de las filas es otro y la 148
     es el hospital de Paita.
   - **Una celda sin dato del sistema queda vacía**, aunque la plantilla trajera
     una cifra tecleada a mano ese mes: lo que se remite es lo que el sistema
     sabe, y un vacío no es un cero (CLAUDE.md § 3.4). Las calculadas conservan
     su fórmula; se les deja además el valor, para quien abra el archivo sin
     recalcular.

   INDICADORES DE GESTIÓN (consolidado anual)
   El Excel con que Estadística remite los 22 indicadores («INDICAD GESTION H R L
   2025, 2026 ARANA.xlsx»): una hoja por año, dos filas por indicador (numerador
   y denominador) y dos columnas por mes (la cifra y su valor, que es fórmula).
   Se escriben solo numeradores y denominadores, los doce meses de la hoja del
   año: los valores, el TOTAL y su valor los calcula Excel al abrir. Lo que el
   sistema no sabe queda vacío para llenarlo a mano, aunque la plantilla trajera
   una cifra tecleada: así lo que viene lleno es siempre lo del sistema.
   - **Las filas se buscan por el n.º del indicador** (columna A), no por número
     de fila: el bloque de cada categoría lleva su propia cabecera.
   - **Las fórmulas de la plantilla no se tocan**, tampoco la del n.º 22, que en
     el original divide sin el ×100 (`=++E59/E60`): se dice al descargarlo. */

import { leerExcel, parchearExcel } from './bot-validador.js';
import { IDENTIFICACION_HRL } from '@/app/datos/diresa/servicios-intermedios.js';
import { INDICADORES, calcularIndicadores } from '@/app/datos/diresa/indicadores.js';

export const RUTA_PLANTILLA_SERVICIOS_INTERMEDIOS = 'plantillas/diresa-servicios-intermedios.xlsx';
export const RUTA_PLANTILLA_INDICADORES = 'plantillas/diresa-indicadores-gestion.xlsx';

/* El nombre de la hoja de cada mes. «DIEMBRE» es como viene en el archivo oficial. */
const HOJAS_DEL_MES = Object.freeze([
  ['ENERO'], ['FEBRERO'], ['MARZO'], ['ABRIL'], ['MAYO'], ['JUNIO'], ['JULIO'], ['AGOSTO'],
  ['SETIEMBRE', 'SEPTIEMBRE'], ['OCTUBRE'], ['NOVIEMBRE'], ['DICIEMBRE', 'DIEMBRE'],
]);

const normal = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const COLUMNA_RENIPRESS = 3; // C

/* La hoja del mes y la fila del hospital en ella. Lanza si no están: un Excel que no
   es el formato no se llena a medias. */
export async function ubicarHospital(bytes, periodo) {
  const libro = await leerExcel(bytes);
  const nombres = HOJAS_DEL_MES[Number(periodo.slice(5, 7)) - 1];
  const hoja = libro.hojas.find((h) => nombres.includes(normal(h)));
  if (!hoja) throw new Error(`El formato no tiene la hoja de ${nombres[0].toLowerCase()}.`);
  const c = await libro.cuadricula(hoja);
  for (let fila = 1; fila <= c.ultimaFila; fila += 1) {
    const codigo = c.valor(fila, COLUMNA_RENIPRESS);
    if (codigo != null && String(codigo).trim().padStart(8, '0') === IDENTIFICACION_HRL.renipress) return { hoja, fila };
  }
  throw new Error(`La hoja «${hoja}» no tiene la fila del hospital (RENIPRESS ${IDENTIFICACION_HRL.renipress}).`);
}

/* El Excel del formato con la fila del hospital llena. `resultado` es el de
   `construirServiciosIntermedios`. Devuelve { bytes, hoja, fila, celdas }. */
export async function llenarServiciosIntermedios(plantilla, resultado) {
  const bytes = plantilla instanceof Uint8Array ? plantilla : new Uint8Array(plantilla);
  const { hoja, fila } = await ubicarHospital(bytes, resultado.periodo);
  /* La identificación (A a J) ya está en la plantilla: no se toca. */
  const cambios = Object.fromEntries(resultado.campos.filter((c) => c.tipo !== 'auto').map((c) => [`${c.col}${fila}`, c.valor ?? null]));
  return { bytes: await parchearExcel(bytes, { [hoja]: cambios }), hoja, fila, celdas: Object.keys(cambios).length };
}

export const nombreDelExcel = (periodo) => `SERV INTER DIRESA HRL ${periodo}.xlsx`;
export const nombreDelExcelDeIndicadores = (anio) => `INDICAD GESTION HRL ${anio}.xlsx`;

/* ------------------------------------------------- indicadores de gestión */

const COLUMNA_NUMERO = 1; // A
const letraDeColumna = (n) => (n > 26 ? letraDeColumna(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26));
/* La cifra de cada mes: E (enero), G, I… AA (diciembre); la columna siguiente es su valor. */
export const columnaDelMes = (mes) => letraDeColumna(5 + 2 * (mes - 1));

/* La hoja del año y la fila del numerador de cada indicador (el denominador va
   debajo). Lanza si falta la hoja o algún indicador: un Excel que no es el
   formato no se llena a medias. */
export async function ubicarIndicadores(bytes, anio) {
  const libro = await leerExcel(bytes);
  const delAnio = libro.hojas.filter((h) => normal(h).includes(String(anio)));
  const hoja = delAnio.find((h) => normal(h) === String(anio)) ?? delAnio[0];
  if (!hoja) throw new Error(`El formato no tiene la hoja de ${anio}.`);
  const c = await libro.cuadricula(hoja);
  const filas = {};
  for (let fila = 1; fila <= c.ultimaFila; fila += 1) {
    const n = c.valor(fila, COLUMNA_NUMERO);
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= INDICADORES.length && filas[n] == null) filas[n] = fila;
  }
  const faltan = INDICADORES.map((i) => i.n).filter((n) => filas[n] == null);
  if (faltan.length) throw new Error(`La hoja «${hoja}» no tiene ${faltan.length === 1 ? 'el indicador' : 'los indicadores'} ${faltan.join(', ')}.`);
  return { hoja, filas };
}

/* Los doce meses de un año: { 'AAAA-MM': lista de calcularIndicadores }. */
export function indicadoresDelAnio(anio, reportes, propios) {
  return Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`).map((p) => [p, calcularIndicadores(p, reportes, propios)]),
  );
}

/* El Excel del consolidado anual con lo que el sistema sabe de cada mes.
   Devuelve { bytes, hoja, celdas, conDato, meses } (meses: los que tienen al menos una cifra). */
export async function llenarIndicadoresGestion(plantilla, anio, porMes) {
  const bytes = plantilla instanceof Uint8Array ? plantilla : new Uint8Array(plantilla);
  const { hoja, filas } = await ubicarIndicadores(bytes, anio);
  const cambios = {};
  const meses = new Set();
  for (let mes = 1; mes <= 12; mes += 1) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const lista = porMes[periodo] ?? [];
    const col = columnaDelMes(mes);
    for (const { n } of INDICADORES) {
      const ind = lista.find((i) => i.n === n);
      for (const [fila, cifra] of [[filas[n], ind?.numerador], [filas[n] + 1, ind?.denominador]]) {
        cambios[`${col}${fila}`] = Number.isFinite(cifra) ? cifra : null;
        if (Number.isFinite(cifra)) meses.add(mes);
      }
    }
  }
  const conDato = Object.values(cambios).filter((v) => v != null).length;
  return { bytes: await parchearExcel(bytes, { [hoja]: cambios }), hoja, celdas: Object.keys(cambios).length, conDato, meses: [...meses].sort((a, b) => a - b) };
}

/* ---------------------------------------------------------------- descarga */

/* Un .xlsx es un ZIP: empieza por «PK». Si el servidor no tiene la plantilla y
   responde otra cosa con 200 (la página de la aplicación, como pasaba en el
   contenedor), se dice eso en lugar de un error del lector de Excel. */
const ES_ZIP = (bytes) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

async function traerPlantilla(ruta) {
  const SIN_FORMATO = 'El servidor no tiene el formato oficial de DIRESA. Avise al equipo de desarrollo.';
  let respuesta;
  try {
    respuesta = await fetch(`${import.meta.env.BASE_URL}${ruta}`, { cache: 'no-cache' });
  } catch {
    throw new Error('No se pudo conectar con el servidor para traer el formato oficial de DIRESA.');
  }
  if (!respuesta.ok) throw new Error(SIN_FORMATO);
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  if (!ES_ZIP(bytes)) throw new Error(SIN_FORMATO);
  return bytes;
}

function descargar(bytes, nombre) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Trae la plantilla, la llena y la descarga. */
export async function descargarServiciosIntermedios(resultado) {
  const { bytes, hoja, fila } = await llenarServiciosIntermedios(await traerPlantilla(RUTA_PLANTILLA_SERVICIOS_INTERMEDIOS), resultado);
  descargar(bytes, nombreDelExcel(resultado.periodo));
  return { hoja, fila };
}

export async function descargarIndicadoresGestion(anio, reportes, propios) {
  const lleno = await llenarIndicadoresGestion(await traerPlantilla(RUTA_PLANTILLA_INDICADORES), anio, indicadoresDelAnio(anio, reportes, propios));
  descargar(lleno.bytes, nombreDelExcelDeIndicadores(anio));
  return lleno;
}
