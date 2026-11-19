/* Pruebas del módulo Centro Quirúrgico en el bot validador.
   Ejecución directa: `node pruebas/centro-quirurgico.mjs`. Sin dependencias.

   Los libros de prueba se arman con el formato del bot (plantilla.js), que
   tiene la forma del Excel del área. La sección 7 lee además los libros
   reales de 2026 desde `EXCEL_CENTRO_QUIRURGICO` (carpeta) o, si no, desde
   `insumos/centro-quirurgico/` (fuera del repositorio: no se versionan
   archivos del hospital). Si no están, se salta con un aviso. */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validarArchivo, validarDatos, plantillaDe, consolidadoAnual, firmaDe } from '../src/motor.js';
import { CUADROS, CAUSAS, ESPECIALIDADES } from '../src/areas/centro-quirurgico/definicion.js';
import { PROCEDIMIENTOS_TIPICOS } from '../src/areas/centro-quirurgico/procedimientos.js';
import { produccion, paraDiresa, indicadoresCalculados, topTen, consolidadoPorEspecialidad, totalCuadro } from '../src/areas/centro-quirurgico/calculos.js';
import { leerLibro, crearLibro, abrirZip, empaquetarZip, parchearLibro, parchearHojas, ESTILO } from '../src/xlsx.js';
import { abrirCorreccion, revalidar, libroCorregido, explicar } from '../src/correccion.js';
import { comparacion } from '../src/areas/centro-quirurgico/correccion.js';

let pasadas = 0;
let fallos = 0;

function afirmar(condicion, texto, detalle) {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${texto}`);
  } else {
    fallos += 1;
    console.error(`  ✗ ${texto}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

console.log('\n--- PRUEBAS DEL MÓDULO CENTRO QUIRÚRGICO (BOT VALIDADOR) ---\n');

const AREA = 'centro-quirurgico';
const PERIODO = '2026-06';

/* Un mes coherente: cada procedimiento con una cifra pequeña, el RESUMEN y el
   cuadro de indicadores que cuadran con él, y tres suspendidas. */
function datosLimpios() {
  const procedimientos = { mayor: {}, menor: {} };
  for (const tipo of ['mayor', 'menor']) {
    let n = 0;
    for (const [esp, lista] of Object.entries(PROCEDIMIENTOS_TIPICOS[tipo])) {
      procedimientos[tipo][esp] = lista.map((rotulo, i) => ({ rotulo, valor: (n + i) % 4, fila: 0 }));
      n += 1;
    }
  }
  const total = (tipo) => Object.values(procedimientos[tipo]).flat().reduce((a, p) => a + p.valor, 0);
  const mayor = total('mayor');
  const menor = total('menor');
  const mEmerg = Math.floor(mayor * 0.45);
  const nEmerg = Math.floor(menor * 0.1);
  const suspendidas = Object.fromEntries(CAUSAS.filter((c) => !c.ocasional).map((c) => [c.clave, 0]));
  Object.assign(suspendidas, { falta_tiempo: 1, presion_arterial: 1, ausencia_paciente: 1 });
  const resumen = {
    'mayores.programada': mayor - mEmerg, 'mayores.emergencia': mEmerg,
    'menores.programada': menor - nEmerg, 'menores.emergencia': nEmerg,
    'horas_programadas.programada': 34.75, 'horas_programadas.emergencia': 28,
    'horas_efectivas.programada': 30.5, 'horas_efectivas.emergencia': 25.25,
    'horas_acto.programada': 24, 'horas_acto.emergencia': 20.5,
    'suspendidas.programada': 3, 'suspendidas.emergencia': 0,
  };
  const programadas = resumen['mayores.programada'] + resumen['menores.programada'];
  const emergencia = mEmerg + nEmerg;
  const indicadores = {
    salas_utilizadas: 4, salas_emergencia: 1, salas_programadas: 3,
    intervenciones_emergencia: emergencia, intervenciones_programadas: programadas, intervenciones_suspendidas: 3,
    intervenciones_realizadas: programadas + emergencia, horas_efectivas: 55.75, horas_programadas: 62.75,
    reintervenidos: 2, defunciones: 0,
  };
  return { resumen, indicadores, suspendidas, procedimientos };
}

const libroDe = (datos, periodo = PERIODO) => plantillaDe(AREA, periodo, datos).bytes;
const validar = (bytes, opciones = {}) => validarArchivo(bytes, { area: AREA, periodo: opciones.periodo ?? PERIODO, anterior: opciones.anterior });
const reglasDe = (lista) => (lista ?? []).map((h) => h.regla ?? h.id);
/* Mismas cifras, sin importar el orden de las claves. */
const mismas = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());

/* Cambia un texto en las hojas de un libro (para simular un rótulo distinto). */
async function reemplazar(bytes, buscado, nuevo) {
  const zip = abrirZip(bytes);
  const archivos = [];
  for (const nombre of zip.nombres()) {
    if (nombre.startsWith('xl/worksheets/')) archivos.push({ nombre, contenido: (await zip.texto(nombre)).split(buscado).join(nuevo) });
    else archivos.push({ nombre, crudo: zip.crudo(nombre) });
  }
  return empaquetarZip(archivos);
}

/* Renombra una hoja: su nombre está en el índice del libro, no en la hoja. */
async function renombrarHoja(bytes, nombre, nuevo) {
  const zip = abrirZip(bytes);
  const archivos = [];
  for (const n of zip.nombres()) {
    if (n === 'xl/workbook.xml') archivos.push({ nombre: n, contenido: (await zip.texto(n)).replace(`name="${nombre}"`, `name="${nuevo}"`) });
    else archivos.push({ nombre: n, crudo: zip.crudo(n) });
  }
  return empaquetarZip(archivos);
}

// =============================================================================
// 1. RECONOCIMIENTO Y BLOQUEOS
// =============================================================================
console.log('1. Reconocimiento y bloqueos:');

afirmar((await validar(new Uint8Array([1, 2, 3, 4]))).bloqueo?.id === 'archivo', 'bloquea un archivo que no es un Excel');

const otroLibro = crearLibro({ hojas: [{ nombre: 'Hoja1', filas: [[{ v: 'DATOS', estilo: ESTILO.normal }]] }] });
afirmar((await validar(otroLibro)).bloqueo?.id === 'plantilla', 'bloquea un libro sin las hojas de Centro Quirúrgico');

const bSinResumen = (await validar(await renombrarHoja(libroDe(datosLimpios()), 'Resumen', 'Hoja 9'))).bloqueo;
afirmar(bSinResumen?.id === 'plantilla-danada' && /RESUMEN/.test(bSinResumen.titulo), 'bloquea un libro al que le falta una de las cinco hojas, y dice cuál', bSinResumen?.titulo);

const deMayo = (await validar(libroDe(datosLimpios(), '2026-05'))).bloqueo;
afirmar(deMayo?.id === 'plantilla-periodo' && /mayo/.test(deMayo.titulo), 'bloquea el libro de otro mes: trae llena otra columna', deMayo?.titulo);

const deOtroAnio = (await validar(libroDe(datosLimpios(), '2025-06'))).bloqueo;
afirmar(deOtroAnio?.id === 'hoja-de-otro-anio', 'bloquea el libro del mismo mes de otro año', deOtroAnio?.titulo);


// =============================================================================
// 2. LECTURA
// =============================================================================
console.log('\n2. Lectura de la columna del mes:');

const limpios = datosLimpios();
const inf = await validar(libroDe(limpios));
afirmar(!inf.bloqueo, 'reconoce su propio formato', JSON.stringify(inf.bloqueo));
afirmar(inf.plantilla?.version === 'CQX-1', 'el informe dice la versión de lectura', inf.plantilla?.version);
afirmar(mismas(inf.datos.resumen, limpios.resumen), 'lee el RESUMEN del mes: programada y emergencia', JSON.stringify(inf.datos.resumen));
afirmar(mismas(inf.datos.indicadores, limpios.indicadores), 'lee la tabla izquierda del cuadro de indicadores', JSON.stringify(inf.datos.indicadores));
afirmar(mismas(inf.datos.suspendidas, limpios.suspendidas), 'lee una cifra por causa de suspensión', JSON.stringify(inf.datos.suspendidas));
const sumaEsp = (tipo, esp) => limpios.procedimientos[tipo][esp].reduce((a, p) => a + p.valor, 0);
afirmar(inf.datos.mayor.obstetricia === sumaEsp('mayor', 'obstetricia') && inf.datos.menor.nefrologia === sumaEsp('menor', 'nefrologia'), 'el total de cada especialidad es la suma de sus procedimientos');
afirmar(inf.datos.procedimientos.mayor.obstetricia.map((p) => p.rotulo).join('|') === PROCEDIMIENTOS_TIPICOS.mayor.obstetricia.join('|'), 'el detalle de procedimientos viaja con los datos, con su rótulo del Excel');
afirmar(!('nefrologia' in inf.datos.mayor), 'Nefrología no existe en cirugía mayor');
afirmar(inf.datos.declarados.mayor._total === Object.values(inf.datos.mayor).reduce((a, b) => a + b, 0), 'guarda el Sub Total escrito como declarado');
afirmar(!inf.errores.length && !inf.avisos.length, 'un mes coherente no tiene errores ni avisos', [...reglasDe(inf.errores), ...reglasDe(inf.avisos)].join(', '));
afirmar(inf.origen['mayor|obstetricia']?.formula === true && inf.origen['resumen|mayores.programada']?.hoja === 'Resumen', 'cada casilla sabe de qué celda salió y si es fórmula');
afirmar(firmaDe(AREA, inf.datos) === firmaDe(AREA, structuredClone(inf.datos)), 'la firma de los datos es estable');

const blanco = await validar(plantillaDe(AREA, PERIODO).bytes);
afirmar(!blanco.bloqueo && reglasDe(blanco.errores).includes('incompleto'), 'el formato en blanco se reconoce y pide sus cifras');
afirmar(!(blanco.datos.ausentes?.indicadores ?? []).length, 'el formato en blanco trae la fila de encefalopatía (ocasional)');

const ruidoso = datosLimpios();
ruidoso.resumen['horas_efectivas.emergencia'] = 352.28194444444409;
const conRuido = await validar(libroDe(ruidoso));
afirmar(conRuido.datos.resumen['horas_efectivas.emergencia'] === 352.28, 'redondea las horas a centésimas', String(conRuido.datos.resumen['horas_efectivas.emergencia']));

/* Horas:minutos (07/11/2026). El área escribe las horas como «997:57»: en una
   celda [h]:mm Excel guarda días (41,58) y el bot las leía divididas entre 24. */
const horasEnTexto = datosLimpios();
horasEnTexto.resumen['horas_efectivas.programada'] = '30:30';
const infTexto = await validar(libroDe(horasEnTexto));
afirmar(infTexto.datos.resumen['horas_efectivas.programada'] === 30.5 && !infTexto.errores.length, '«30:30» escrito como texto son 30 horas y media, no un error ni una división', JSON.stringify(infTexto.errores.map((e) => e.titulo)));

const HISTORICO_AGOSTO = fileURLToPath(new URL('../../api/historico/centro_quirurgico/2026/8 ESTADISTICA AGOSTO 2026.xlsx', import.meta.url));
if (existsSync(HISTORICO_AGOSTO)) {
  const agostoBytes = readFileSync(HISTORICO_AGOSTO);
  const agosto = await validarArchivo(agostoBytes, { area: AREA, periodo: '2026-08' });
  const r = agosto.datos.resumen;
  afirmar(r['horas_programadas.emergencia'] === 744 && r['horas_efectivas.programada'] === 997.95, 'agosto: las celdas [h]:mm se leen en horas (744:00 y 997:57, como las ve el área)', `${r['horas_programadas.emergencia']} / ${r['horas_efectivas.programada']}`);
  afirmar(agosto.origen['resumen|horas_efectivas.programada']?.enDias === true, 'la casilla sabe que su celda guarda días');
  afirmar(!agosto.errores.length, 'agosto: las horas no dan ningún error', reglasDe(agosto.errores).join(','));
  const ab = await abrirCorreccion(agostoBytes, { area: AREA, periodo: '2026-08' });
  const o = agosto.origen['resumen|horas_efectivas.programada'];
  afirmar(ab.hojas[o.hoja].valores[`${o.columna}${o.fila}`] === '997:57', 'la corrección muestra la celda como en Excel: 997:57', String(ab.hojas[o.hoja].valores[`${o.columna}${o.fila}`]));
  const datos = structuredClone(ab.informe.datos);
  datos.resumen['horas_efectivas.programada'] = 1000;
  const { celdas } = await libroCorregido(agostoBytes, AREA, { base: ab.informe.datos, datos, origen: ab.informe.origen, hoja: ab.hoja });
  const escrita = celdas[`${o.hoja}!${o.columna}${o.fila}`];
  afirmar(Math.abs(escrita - 1000 / 24) < 1e-9, 'corregir 1000 horas escribe 41,67 días en la celda [h]:mm (Excel muestra 1000:00)', String(escrita));
}

// =============================================================================
// 3. REGLAS
// =============================================================================
console.log('\n3. Reglas:');

const conTexto = datosLimpios();
conTexto.procedimientos.mayor.urologia[0].valor = 'dos';
const iTexto = await validar(libroDe(conTexto));
afirmar(iTexto.errores.some((e) => e.regla === 'no-numerico' && e.formato === 'mayor' && e.fila.startsWith('urologia#')), 'un procedimiento con letras es un error, con su especialidad y su fila', reglasDe(iTexto.errores).join(','));

const sinCausa = datosLimpios();
sinCausa.suspendidas.instrumental = null;
afirmar(reglasDe((await validar(libroDe(sinCausa))).errores).includes('incompleto'), 'una causa en blanco es «incompleto» (mayo de 2026)');

const negativo = datosLimpios();
negativo.indicadores.reintervenidos = -1;
afirmar(reglasDe((await validar(libroDe(negativo))).errores).includes('entero'), 'una cifra negativa es un error');

const causaNueva = await reemplazar(libroDe(datosLimpios()), 'FALTA DE INSUMOS', 'FALTA DE CAMILLAS');
afirmar(reglasDe((await validar(causaNueva)).errores).includes('fila-no-catalogada'), 'una causa que el reporte no conoce, con cifra, es un error de lectura');

const espNueva = await reemplazar(libroDe(datosLimpios()), '>UROLOGIA<', '>ANESTESIOLOGIA<');
const iEspNueva = await validar(espNueva);
afirmar(reglasDe(iEspNueva.errores).includes('especialidad-no-catalogada'), 'una especialidad nueva no se suma en silencio a la anterior', reglasDe(iEspNueva.errores).join(','));

// El total escrito de una especialidad que no suma sus procedimientos (enero de 2026).
const desc = datosLimpios();
const bytesDesc = libroDe(desc);
const libroDesc = await leerLibro(bytesDesc);
const cMayor = await libroDesc.cuadricula('CIRUGIA MAYOR ');
let filaOb = null;
for (let r = 1; r <= cMayor.ultimaFila; r += 1) if (cMayor.valor(r, 2) === 'OBSTETRICIA') filaOb = r;
const parchado = await parchearLibro(bytesDesc, 'CIRUGIA MAYOR ', { [`I${filaOb}`]: 999 });
const iDesc = await validar(parchado);
afirmar(iDesc.errores.some((e) => e.regla === 'subtotales' && e.fila === 'obstetricia'), 'el total de una especialidad que no suma sus procedimientos es un error', reglasDe(iDesc.errores).join(','));
afirmar(iDesc.datos.mayor.obstetricia === sumaEsp('mayor', 'obstetricia'), 'aun así, la especialidad vale la suma de sus procedimientos');

const cruzados = datosLimpios();
cruzados.resumen['mayores.programada'] += 5;
const iCruce = await validar(libroDe(cruzados));
afirmar(iCruce.avisos.some((a) => a.regla === 'cruce-resumen') && !iCruce.errores.length, 'el RESUMEN que no coincide con CIRUGIA MAYOR es un aviso, no un error');
afirmar(iCruce.avisos.filter((a) => a.regla === 'cruce-indicadores').length === 1, 'las diferencias del cuadro de indicadores se juntan en un solo aviso');

const realizadas = datosLimpios();
realizadas.indicadores.intervenciones_realizadas += 13;
const iReal = await validar(libroDe(realizadas));
afirmar(iReal.avisos.some((a) => a.regla === 'cruce-indicadores' && /realizadas/.test(a.detalle)), '«realizadas» distinta del RESUMEN es un aviso (junio: 455 y 442)');

const salas = datosLimpios();
salas.indicadores.salas_utilizadas = 6;
afirmar(reglasDe((await validar(libroDe(salas))).avisos).includes('salas'), 'las salas utilizadas que no suman emergencia y programadas son un aviso');

const susp = datosLimpios();
susp.indicadores.intervenciones_suspendidas = 7;
afirmar(reglasDe((await validar(libroDe(susp))).avisos).includes('cruce-suspendidas'), 'las suspendidas del cuadro de indicadores distintas de las causas son un aviso');

const anterior = { periodo: '2026-05', datos: (await validar(libroDe(datosLimpios(), '2026-05'), { periodo: '2026-05' })).datos };
const mitad = datosLimpios();
for (const lista of Object.values(mitad.procedimientos.menor)) for (const p of lista) p.valor = p.valor * 3;
const iVar = await validar(libroDe(mitad), { anterior });
afirmar(iVar.avisos.some((a) => a.regla === 'variacion' && a.formato === 'menor'), 'una variación de más de 20 % frente al mes anterior pide explicación');
afirmar(totalCuadro(mitad, 'suspendidas') === null && totalCuadro(mitad, 'indicadores') === null, 'las causas y el cuadro de indicadores no entran en la variación mensual');

const reval = validarDatos(inf.datos, { area: AREA, periodo: PERIODO });
afirmar(reval.errores.length === 0, 'revalidar los datos leídos da lo mismo que el archivo');

// =============================================================================
// 4. CUADROS CALCULADOS
// =============================================================================
console.log('\n4. Cuadros calculados:');

const p = produccion(inf.datos);
afirmar(p.realizadas === p.programadas + p.emergencia && p.agendadas === p.programadas + 3, 'la producción sale del RESUMEN; lo agendado suma las suspendidas');

const d = paraDiresa(inf.datos);
afirmar(d.intervenciones.ejecutadas === p.realizadas && d.intervenciones.electivas === p.programadas && d.intervenciones.emergencia === p.emergencia, 'DIRESA recibe ejecutadas, electivas y de emergencia');
afirmar(d.intervenciones.programadas === p.programadas + d.intervenciones.suspendidas, 'DIRESA 22: programadas = electivas + suspendidas');
afirmar(d.salas.utilizadas === 4 && d.suspension.falta_tiempo === 1, 'DIRESA recibe las salas utilizadas y cada causa');

const ind = Object.fromEntries(indicadoresCalculados(inf.datos, PERIODO).map((i) => [i.clave, i.valor]));
afirmar(Math.abs(ind.rendimiento_sop - p.realizadas / (4 * 30)) < 1e-9, 'el rendimiento de sala divide entre salas y días reales del mes (junio: 30)');
afirmar(Math.abs(ind.pct_suspendidas - (3 * 100) / p.agendadas) < 1e-9, 'el porcentaje de suspendidas divide entre lo agendado');
afirmar(ind.tasa_encefalopatia === null, 'sin la fila de encefalopatía, su tasa es «sin datos», no 0');
const sinSalas = structuredClone(inf.datos);
sinSalas.indicadores.salas_utilizadas = 0;
afirmar(indicadoresCalculados(sinSalas, PERIODO).find((i) => i.clave === 'rendimiento_sop').valor === null, 'un denominador cero es «sin datos»');

const top = topTen(inf.datos, 'mayor');
afirmar(top.length === 10 && top.every((x, i) => i === 0 || top[i - 1].valor >= x.valor), 'Top Ten: diez procedimientos, de mayor a menor');
afirmar(!top.some((x) => /^(otr[ao]s|2 procedimientos)/i.test(x.rotulo)), 'Top Ten: los genéricos («Otros», «2 procedimientos x cirugía») no compiten');
afirmar(topTen(inf.datos, 'menor', 500).every((x) => x.valor > 0), 'Top Ten: un procedimiento en 0 no entra');

const cons = consolidadoPorEspecialidad(inf.datos);
afirmar(cons.mayor === Object.values(inf.datos.mayor).reduce((a, b) => a + b, 0) && cons.total === cons.mayor + cons.menor, 'el consolidado por especialidad suma mayor y menor');
afirmar(cons.filas.find((f) => f.clave === 'nefrologia').mayor === null, 'Nefrología no tiene cirugía mayor: vacía, no 0');

// =============================================================================
// 5. CONSOLIDADO ANUAL (reporte 1)
// =============================================================================
console.log('\n5. Consolidado anual:');

const meses = [
  { periodo: '2026-01', datos: inf.datos },
  { periodo: '2026-03', datos: iCruce.datos },
];
const anual = consolidadoAnual(AREA, 2026, meses);
const may = anual.consolidado.conceptos.find((c) => c.clave === 'mayores');
afirmar(may.porMes.programada[0] === inf.datos.resumen['mayores.programada'] && may.porMes.programada[1] === null, 'cada mes en su columna; un mes sin reporte queda vacío, no en 0');
afirmar(may.acumulado.programada === inf.datos.resumen['mayores.programada'] + iCruce.datos.resumen['mayores.programada'], 'el acumulado suma los meses entregados');
afirmar(anual.consolidado.conDato.map(Number).join('') === '101000000000', 'dice qué meses trae');
afirmar(anual.consolidado.topTen.mayor.length === 10, 'trae el Top Ten del año');
const libroAnual = await leerLibro(anual.bytes);
afirmar(libroAnual.hojas.join('|') === 'RESUMEN|CONSOLIDADO|TOP TEN', 'se descarga con el RESUMEN, el consolidado y el Top Ten', libroAnual.hojas.join('|'));
afirmar(anual.nombre === 'Centro_Quirurgico_CONSOLIDADO_2026.xlsx', 'el nombre del archivo es el del área', anual.nombre);

// =============================================================================
// 6. CONTRATO
// =============================================================================
console.log('\n6. Contrato:');

afirmar(CUADROS.map((c) => c.id).join(',') === 'resumen,indicadores,menor,mayor,suspendidas', 'cinco cuadros, en el orden del Excel');
afirmar(CUADROS.find((c) => c.id === 'mayor').filas.length === ESPECIALIDADES.filter((e) => e.en.includes('mayor')).length, 'una fila de cirugía mayor por especialidad');
afirmar(new Set(CUADROS.flatMap((c) => c.filas.map((f) => `${c.id}.${f.clave}`))).size === CUADROS.reduce((n, c) => n + c.filas.length, 0), 'ninguna fila se repite dentro de su cuadro');

// =============================================================================
// 7. LOS LIBROS REALES DE 2026 (si están)
// =============================================================================
console.log('\n7. Los libros reales del área:');

const carpeta = process.env.EXCEL_CENTRO_QUIRURGICO ?? fileURLToPath(new URL('../../../insumos/centro-quirurgico/', import.meta.url));
const reales = existsSync(carpeta) ? readdirSync(carpeta).filter((f) => /^\d+ ESTADISTICA .*\.xlsx$/i.test(f)) : [];
if (!reales.length) {
  console.log(`  (se salta: no hay libros en ${carpeta}; defina EXCEL_CENTRO_QUIRURGICO)`);
} else {
  const ruta = (mes) => reales.find((f) => f.startsWith(`${mes} `));
  if (ruta(6)) {
    const junio = await validarArchivo(readFileSync(`${carpeta}/${ruta(6)}`), { area: AREA, periodo: '2026-06' });
    afirmar(!junio.bloqueo && junio.errores.length === 0, 'junio se lee sin errores', reglasDe(junio.errores).join(','));
    afirmar(Object.values(junio.datos.mayor).reduce((a, b) => a + b, 0) === 383 && Object.values(junio.datos.menor).reduce((a, b) => a + b, 0) === 59, 'junio: 383 cirugías mayores y 59 menores, como sus Sub Total');
    afirmar(paraDiresa(junio.datos).intervenciones.ejecutadas === 442, 'junio: 442 ejecutadas para DIRESA (el RESUMEN; «realizadas» dice 455)');
    afirmar(reglasDe(junio.avisos).includes('cruce-indicadores'), 'junio: avisa que «realizadas» y las horas programadas no coinciden con el RESUMEN');
  }
  if (ruta(1)) {
    const enero = await validarArchivo(readFileSync(`${carpeta}/${ruta(1)}`), { area: AREA, periodo: '2026-01' });
    afirmar(enero.errores.filter((e) => e.regla === 'subtotales').length === 2, 'enero: dos especialidades cuyo total no suma sus procedimientos (cirugía general mayor, obstetricia menor)');
    afirmar(enero.datos.indicadores.encefalopatia === 0, 'enero: lee la hoja INDICADORES (sin «CUADRO DE») y su fila de encefalopatía');
  }
  if (ruta(4)) {
    const pesado = statSync(`${carpeta}/${ruta(4)}`).size > 5 * 1024 * 1024;
    if (pesado) afirmar((await validarArchivo(readFileSync(`${carpeta}/${ruta(4)}`), { area: AREA, periodo: '2026-04' })).bloqueo?.id === 'tamano', 'abril (54 MB) se rechaza por su peso, con el motivo');
  }
}

// =============================================================================
// 8. CORRECCIÓN GUIADA
// =============================================================================
console.log('\n8. Corrección guiada:');
{
  const limpio = libroDe(datosLimpios());
  const o = (await validar(limpio)).origen;
  const total = o['escrito|suspendidas|_total'];
  afirmar(Boolean(total), 'el TOTAL de las causas de suspensión tiene su celda en el libro', JSON.stringify(total));
  // 3 suspendidas; el TOTAL dice 30.
  const bytes = await parchearHojas(limpio, { [total.hoja]: { [`${total.columna}${total.fila}`]: 30 } });
  const ab = await abrirCorreccion(bytes, { area: AREA, periodo: PERIODO });
  const h = ab.informe.errores.find((e) => e.evidencia?.total.casilla === 'escrito|suspendidas|_total');
  afirmar(Boolean(h) && h.evidencia.sumandos.every((s) => s.casilla?.startsWith('suspendidas|')), 'el descuadre trae su evidencia: una casilla por causa', reglasDe(ab.informe.errores).join(','));
  const sug = h && explicar(h).causas.find((c) => c.sugerencia)?.sugerencia;
  afirmar(sug?.cambios['escrito|suspendidas|_total'] === 3, 'Dr. Mochi propone poner 3 en el TOTAL (un cero de más)', JSON.stringify(sug));
  const rv = revalidar(AREA, ab.informe.datos, sug?.cambios ?? {}, { origen: ab.informe.origen, periodo: PERIODO });
  const corr = await libroCorregido(bytes, AREA, { base: ab.informe.datos, datos: rv.datos, origen: ab.informe.origen });
  const re = await validar(corr.bytes);
  afirmar(rv.informe.errores.length === 0 && !re.bloqueo && re.errores.length === 0, 'corregido y vuelto a subir, sin errores', reglasDe(re.errores).join(','));
}
{
  // El RESUMEN dice 5 cirugías mayores programadas de más: el aviso trae sus tablas.
  const d = datosLimpios();
  d.resumen['mayores.programada'] += 5;
  const inf = await validar(libroDe(d));
  const aviso = inf.avisos.find((a) => a.regla === 'cruce-resumen');
  const tablas = aviso ? comparacion(aviso, inf.datos) : [];
  const mayor = tablas[0]?.filas.find((f) => f.clave === 'mayor');
  afirmar(tablas.length === 2 && mayor?.diferencia === 5, 'el aviso RESUMEN/hojas trae su tabla: la fila de mayores difiere en 5, y el detalle por especialidad de CIRUGIA MAYOR', JSON.stringify(tablas.map((x) => x.titulo)));
  afirmar(tablas[0].filas.find((f) => f.clave === 'menor')?.diferencia === 0, 'la fila de menores, que cuadra, dice diferencia 0');
  afirmar(comparacion({ regla: 'subtotales' }, inf.datos).length === 0, 'los demás hallazgos no traen tablas');
  // Lo que no coincide va en cifras, y cada respuesta trae su arreglo.
  const ex = explicar(aviso, { area: 'centro-quirurgico', datos: inf.datos });
  const arreglos = ex.causas.filter((c) => c.sugerencia);
  const lado = (clave) => ex.comparaciones.find((c) => c.clave === clave);
  afirmar(
    lado('mayor').izquierda.resultado - lado('mayor').derecha.resultado === 5 && lado('menor').izquierda.resultado === lado('menor').derecha.resultado,
    'la comparación pone el RESUMEN frente a CIRUGIA MAYOR (5 de diferencia) y frente a CIRUGIA MENOR (cuadra)',
    JSON.stringify(ex.comparaciones),
  );
  afirmar(arreglos.length === 2 && arreglos.some((c) => c.sugerencia.cambios['resumen|mayores.programada'] === d.resumen['mayores.programada'] - 5), 'una respuesta corrige las programadas del RESUMEN (las 5 de más)', JSON.stringify(arreglos.map((c) => c.sugerencia.cambios)));
  afirmar(ex.causas.some((c) => c.detalle) && ex.causas.some((c) => c.confirmar), 'las otras respuestas: el RESUMEN está bien (ver por especialidad) o las dos lo están (confirmar)');
  const rv = revalidar('centro-quirurgico', inf.datos, arreglos.find((c) => 'resumen|mayores.programada' in c.sugerencia.cambios).sugerencia.cambios, { origen: inf.origen, periodo: inf.periodo });
  afirmar(!rv.informe.avisos.some((x) => x.regla === 'cruce-resumen'), 'aplicada esa respuesta, el RESUMEN y las hojas coinciden');
  const despues = explicar(aviso, { area: 'centro-quirurgico', datos: rv.datos });
  afirmar(despues.comparaciones.every((c) => c.izquierda.resultado === c.derecha.resultado) && despues.causas.length === 0, 'con lo corregido, la comparación queda en = y ya no ofrece respuestas');
}
{
  // El cuadro de indicadores dice 3 programadas de más: su balanza y su arreglo.
  const d = datosLimpios();
  d.indicadores.intervenciones_programadas += 3;
  d.indicadores.intervenciones_realizadas += 3;
  const inf = await validar(libroDe(d));
  const aviso = inf.avisos.find((a) => a.regla === 'cruce-indicadores');
  const ex = aviso && explicar(aviso, { area: 'centro-quirurgico', datos: inf.datos });
  const programadas = ex?.comparaciones.find((c) => c.clave === 'programadas');
  afirmar(programadas && programadas.izquierda.resultado - programadas.derecha.resultado === 3 && programadas.derecha.celdas.length === 2, 'el cruce de indicadores va en balanza: el cuadro (1 celda) frente al RESUMEN (mayores + menores), 3 de diferencia', JSON.stringify(ex?.comparaciones));
  afirmar(!ex.comparaciones.some((c) => c.clave === 'emergencia'), 'solo se muestran las líneas que no cuadran');
  const arreglos = ex.causas.filter((c) => c.sugerencia);
  afirmar(arreglos.length === 2 && arreglos.every((c) => c.recomendada), 'propone poner en el cuadro de indicadores la cifra del RESUMEN (recomendada: el cuadro toma sus cifras de ahí)');
  const cambios = Object.assign({}, ...arreglos.map((c) => c.sugerencia.cambios));
  const rv = revalidar('centro-quirurgico', inf.datos, cambios, { origen: inf.origen, periodo: inf.periodo });
  afirmar(!rv.informe.avisos.some((x) => x.regla === 'cruce-indicadores'), 'aplicados los dos arreglos, el cuadro y el RESUMEN coinciden');
  const despues = explicar(aviso, { area: 'centro-quirurgico', datos: rv.datos });
  afirmar(despues?.comparaciones.length > 0 && despues.comparaciones.every((c) => c.izquierda.resultado === c.derecha.resultado), 'corregido, las líneas que el aviso señalaba se ven en =');
}

console.log(`\n-------------------------------------------------------`);
console.log(`Resultado final: ${pasadas} pruebas pasadas, ${fallos} fallos.`);
if (fallos > 0) {
  console.error('\n¡HAY PRUEBAS FALLIDAS!');
  process.exit(1);
} else {
  console.log('¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
}
