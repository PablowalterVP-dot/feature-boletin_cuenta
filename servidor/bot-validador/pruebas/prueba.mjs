/* Prueba del bot, sin el sistema: la plantilla oficial de ida y vuelta, los
   fixtures con la estructura real del Excel de Nutrición, los bloqueos, las
   reglas, el consolidado anual y el servidor HTTP de punta a punta.
   `npm run prueba`.

   Si existe la carpeta de los Excel reales del área (NUTRICION_REALES, fuera
   del repositorio), además los lee y comprueba que cada mes cuadre con el
   TOTAL.xlsx que el área armó a mano. */

import { readFileSync, existsSync } from 'node:fs';
import { crearServidor } from '../src/servidor.js';
import { validarArchivo, validarDatos, plantillaDe, firmaDe, consolidadoAnual, mesesDelArchivo } from '../src/motor.js';
import { FORMATOS } from '../src/areas/nutricion/definicion.js';
import { leerLibro } from '../src/xlsx.js';
import { diasDelMes } from '../src/periodos.js';

let pasadas = 0;
let fallos = 0;
function afirmar(condicion, texto, detalle) {
  if (condicion) pasadas += 1;
  else {
    fallos += 1;
    console.error(`  x ${texto}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

/* Un mes completo con valores estables y un día disparado. Incluye a
   Patrimonio (grupo ocasional): con cifras, la plantilla lo trae. */
function datosDePrueba(periodo, { pico = true, conOcasionales = true } = {}) {
  const n = diasDelMes(periodo);
  const datos = {};
  for (const f of FORMATOS) {
    datos[f.id] = Object.fromEntries(
      f.filas.filter((fila) => conOcasionales || !fila.ocasional).map((fila, i) => [fila.clave, Array.from({ length: n }, (_, d) => 10 + ((i + d) % 5))]),
    );
  }
  if (pico) datos.f3['liquida.cena'][20] = 100;
  return datos;
}

const fixture = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url));
const FILAS = FORMATOS.reduce((n, f) => n + f.filas.length, 0);
const AGOSTO = '2026-08';

/* 1. La plantilla oficial, de ida y vuelta. */
const datos = datosDePrueba(AGOSTO);
const { bytes, nombre } = plantillaDe('nutricion', AGOSTO, datos);
afirmar(nombre === 'Nutricion_AGOSTO_2026.xlsx', 'la plantilla lleva el mes en el nombre, como el Excel del área', nombre);
const libro = await leerLibro(bytes);
afirmar(['COMENSALES EMERG', 'COMENSALES HOSP', 'PACIENTES EMERG', 'PACIENTES HOSP'].every((h) => libro.hojas.includes(h)), 'tiene las cuatro hojas del Excel oficial', libro.hojas.join(', '));
afirmar(!libro.hojas.includes('_plantilla') && libro.nombres.size === 0, 'sin la hoja oculta ni los nombres definidos de la plantilla anterior');
afirmar((await libro.valor('COMENSALES HOSP', 'A1')) === 'NUTRICIÓN Y DIETÉTICA: AGOSTO 2026', 'el título dice el mes, como en el Excel real');
afirmar((await libro.valor('COMENSALES HOSP', 'AH4')) === 'TOTAL' && (await libro.valor('PACIENTES HOSP', 'AH3')) === 'TOTAL', 'la columna TOTAL va tras el día 31 (AH), en la fila de los días de cada hoja');
const inf = await validarArchivo(bytes, { area: 'nutricion', periodo: AGOSTO, nombre, fecha: '2026-09-13T12:00' });
afirmar(!inf.bloqueo, 'la plantilla generada se reconoce', inf.bloqueo?.titulo);
afirmar(inf.plantilla?.periodo === AGOSTO && inf.plantilla?.version === 'NUT-2', 'reconoce el mes por el título y la versión es NUT-2', JSON.stringify(inf.plantilla));
afirmar(FORMATOS.every((f) => f.filas.every((fila) => JSON.stringify(inf.datos[f.id][fila.clave]) === JSON.stringify(datos[f.id][fila.clave]))), 'cada casilla leída es la escrita');
afirmar(inf.leidas === FILAS * 31, `agosto: ${FILAS} filas por 31 días`, String(inf.leidas));
afirmar(inf.errores.length === 0, 'sin errores', inf.errores.map((e) => e.titulo).join('; '));
afirmar(inf.avisos.length === 1 && inf.avisos[0].dia === 21, 'el día disparado es la única alerta');
afirmar(typeof inf.archivo.huella === 'string' && inf.archivo.huella.length === 64, 'guarda la huella SHA-256 del archivo');
afirmar(inf.origen['f3|liquida.cena']?.hoja === 'PACIENTES HOSP', 'sabe de qué hoja salió cada fila');

const enBlanco = plantillaDe('nutricion', '2026-02');
const libroBlanco = await leerLibro(enBlanco.bytes);
afirmar((await libroBlanco.valor('COMENSALES EMERG', 'AE4')) === 'TOTAL', 'febrero: TOTAL en AE, tras el día 28');
const infBlanco = await validarArchivo(enBlanco.bytes, { area: 'nutricion', periodo: '2026-02' });
afirmar(!infBlanco.bloqueo && infBlanco.errores.some((e) => e.id === 'incompleto'), 'la plantilla en blanco se reconoce y dice que está vacía');
afirmar(infBlanco.datos.ausentes?.f2?.join() === 'patrimonio.desayuno,patrimonio.almuerzo', 'Patrimonio (ocasional) no va en la plantilla en blanco: queda como fila ausente', JSON.stringify(infBlanco.datos.ausentes));

/* 2. Los fixtures: la estructura real (rótulos con espacios y errores de tipeo,
   filas que cambian de un mes a otro) con cifras inventadas. */
const julio = await validarArchivo(fixture('nutricion_tipico.xlsx'), { area: 'nutricion', periodo: '2026-07' });
afirmar(!julio.bloqueo && julio.errores.length === 0, 'julio típico: se lee sin errores', julio.bloqueo?.titulo ?? julio.errores.map((e) => e.titulo).join('; '));
afirmar(julio.datos.f1['int-medicina.cena']?.[0] === 20, 'la «COMIDA» de los internos se lee como cena');
afirmar(julio.datos.f2['nutricion.desayuno']?.[0] === 15, '«DIETETTICA» (con doble T) se reconoce');
afirmar(julio.datos.ausentes?.f2?.length === 2 && julio.info.some((i) => i.regla === 'filas-ausentes'), 'sin Patrimonio ese mes: sus filas no aplican, y se informa');

const abril = await validarArchivo(fixture('nutricion_abril_patrimonio.xlsx'), { area: 'nutricion', periodo: '2026-04' });
afirmar(!abril.bloqueo && abril.errores.length === 0, 'abril: se lee sin errores', abril.bloqueo?.titulo ?? abril.errores.map((e) => e.titulo).join('; '));
afirmar(abril.datos.f2['patrimonio.almuerzo']?.[0] === 11 && abril.datos.ausentes?.f2?.join() === 'patrimonio.desayuno', 'PATRIMONIO se lee como grupo, y su desayuno de ese mes queda ausente (no en cero)');
afirmar(abril.datos.f1['int-obstetricia.desayuno']?.[0] === 16 && abril.datos.f1['int-enfermeria.desayuno']?.[0] === 2, '«INT ENF UNSM» junto a «INT. ENF UNSM» se corrige a Obstetricia');
afirmar(abril.info.some((i) => i.regla === 'rotulo-corregido'), 'la corrección del rótulo se informa, no se hace en silencio');
afirmar(abril.datos.ausentes?.f1?.join() === 'int-nutricion.desayuno,int-nutricion.almuerzo', 'antes de mayo no hay Internos de Nutrición: filas ausentes');

const setiembre = await validarArchivo(fixture('nutricion_setiembre_sin_etiqueta.xlsx'), { area: 'nutricion', periodo: '2026-09' });
afirmar(!setiembre.bloqueo && setiembre.errores.length === 0, 'setiembre: se lee sin errores', setiembre.bloqueo?.titulo ?? setiembre.errores.map((e) => e.titulo).join('; '));
afirmar(setiembre.datos.f4['sis.desayuno']?.[0] === 44, 'la fila sin rótulo se lee por su lugar como SIS · desayuno');
const aviso = setiembre.avisos.find((a) => a.regla === 'fila-sin-rotulo');
afirmar(Boolean(aviso), 'y pide confirmarlo con un aviso (exige justificación)');
afirmar(Boolean(setiembre.datos.lectura?.some((h) => h.regla === 'fila-sin-rotulo')), 'el hallazgo viaja con los datos');
afirmar(validarDatos(setiembre.datos, { area: 'nutricion', periodo: '2026-09' }).avisos.some((a) => a.id === aviso?.id), 'al revalidar los datos, el aviso sigue ahí');

/* 3. Bloqueos: nada se carga a medias. */
const otroMes = await validarArchivo(plantillaDe('nutricion', '2026-06', datosDePrueba('2026-06')).bytes, { area: 'nutricion', periodo: '2026-07' });
afirmar(otroMes.bloqueo?.id === 'plantilla-periodo' && !otroMes.datos, 'el Excel de otro mes se bloquea sin datos', otroMes.bloqueo?.titulo);
const mismosDias = await validarArchivo(plantillaDe('nutricion', '2026-08', datosDePrueba('2026-08')).bytes, { area: 'nutricion', periodo: '2026-07' });
afirmar(mismosDias.bloqueo?.id === 'plantilla-periodo', 'con los mismos días (julio y agosto), lo decide el título', mismosDias.bloqueo?.titulo);
const noExcel = await validarArchivo(new TextEncoder().encode('esto no es un excel'), { area: 'nutricion', periodo: AGOSTO });
afirmar(noExcel.bloqueo?.id === 'archivo', 'un archivo que no es Excel se bloquea con su motivo');
const { crearLibro } = await import('../src/xlsx.js');
const otroExcel = await validarArchivo(crearLibro({ hojas: [{ nombre: 'Hoja1', filas: [['hola']] }] }), { area: 'nutricion', periodo: AGOSTO });
afirmar(otroExcel.bloqueo?.id === 'plantilla', 'un Excel cualquiera no se toma por el reporte', otroExcel.bloqueo?.titulo);

/* 4. Reglas sobre datos corregidos a mano. */
const huecos = datosDePrueba(AGOSTO, { pico: false });
huecos.f2['nutricion.cena'][9] = null;
const infHuecos = validarDatos(huecos, { area: 'nutricion', periodo: AGOSTO });
afirmar(infHuecos.errores.some((e) => e.id === 'incompleto'), 'una casilla vacía no es cero: es un error');
const anterior = { periodo: '2026-07', datos: datosDePrueba('2026-07', { pico: false }) };
const menos = datosDePrueba(AGOSTO, { pico: false });
for (const k of Object.keys(menos.f4)) menos.f4[k] = menos.f4[k].map((v) => Math.round(v / 2));
afirmar(validarDatos(menos, { area: 'nutricion', periodo: AGOSTO, anterior }).avisos.some((a) => a.id === 'variacion|f4'), 'una caída del 50 % frente al mes anterior pide explicación');
afirmar(firmaDe('nutricion', datos) !== firmaDe('nutricion', huecos), 'la firma cambia si cambian los datos');
const conTexto = datosDePrueba('2026-02', { pico: false });
const { bytes: febrero } = plantillaDe('nutricion', '2026-02', { ...conTexto, f3: { ...conTexto.f3, 'liquida.cena': conTexto.f3['liquida.cena'].map((v, i) => (i === 11 ? '18+' : v)) } });
const infFebrero = await validarArchivo(febrero, { area: 'nutricion', periodo: '2026-02' });
afirmar(infFebrero.errores.some((e) => e.id === 'no-numerico' && e.titulo.includes('18+')), '«18+» (febrero real) no es un número: error, no se suma en silencio');

/* 5. El consolidado anual (el TOTAL del área). */
const TOTALES_REALES = { '01': [21891, 1564, 16028, 4539], '02': [20233, 1426, 13954, 3757], '03': [22180, 1549, 15359, 4518] };
const meses = Object.entries(TOTALES_REALES).map(([m, t]) => ({ periodo: `2026-${m}`, totales: { f1: t[0], f2: t[1], f3: t[2], f4: t[3] } }));
const total = consolidadoAnual('nutricion', '2026', meses);
afirmar(total?.nombre === 'Nutricion_TOTAL_2026.xlsx', 'el consolidado tiene su nombre de archivo');
afirmar(total.consolidado.bloques[0].total[0] === 23455 && total.consolidado.general[0] === 44022, 'enero: 23 455 comensales y 44 022 en total, como el TOTAL.xlsx del área');
afirmar(total.consolidado.bloques[0].total[3] === null && total.consolidado.general[11] === null, 'un mes sin reporte queda vacío, no en cero');
afirmar(total.consolidado.acumuladoGeneral === 44022 + 39370 + 43606, 'el acumulado suma solo los meses con reporte');
const libroTotal = await leerLibro(total.bytes);
const hojaTotal = libroTotal.hojas[0];
afirmar((await libroTotal.valor(hojaTotal, 'B7')) === 23455 && (await libroTotal.valor(hojaTotal, 'E5')) === null, 'en el Excel: enero con su total, abril vacío');
afirmar((await libroTotal.valor(hojaTotal, 'O5')) === 'Meta no definida', 'la meta sin registrar dice «Meta no definida», no 0');

/* 6. Los Excel reales del área, si están en la máquina. */
const REALES = process.env.NUTRICION_REALES ?? 'C:/Users/Andre/Desktop/ESTADISTICA POR MES  NUTRICION 2026/ESTADISTICA POR MES  NUTRICION 2026/';
if (existsSync(REALES)) {
  const OFICIAL = { ENERO: [21891, 1564, 16028, 4539], FEBRERO: [20233, 1426, 13954, 3757], MARZO: [22180, 1549, 15359, 4518], ABRIL: [22462, 1709, 15346, 4484], MAYO: [22309, 1592, 16685, 4696], JUNIO: [22850, 1606, 16305, 3555], JULIO: [22713, 1711, 15879, 4094], AGOSTO: [23458, 1689, 15536, 3652], SETIEMBRE: [23255, 1623, 14591, 3886] };
  for (const [i, mes] of Object.keys(OFICIAL).entries()) {
    const ruta = `${REALES}/${mes}.xlsx`;
    if (!existsSync(ruta)) continue;
    const r = await validarArchivo(readFileSync(ruta), { area: 'nutricion', periodo: `2026-${String(i + 1).padStart(2, '0')}` });
    const tot = r.bloqueo ? null : ['f1', 'f2', 'f3', 'f4'].map((f) => Object.values(r.datos[f]).flat().reduce((s, v) => s + (v ?? 0), 0));
    afirmar(tot && tot.every((t, k) => t === OFICIAL[mes][k]), `Excel real de ${mes.toLowerCase()}: cuadra con el TOTAL.xlsx del área`, r.bloqueo?.titulo ?? tot?.join('/'));
  }
} else {
  console.log('(sin la carpeta de los Excel reales: se salta su comprobación)');
}

/* 7. El servidor, por HTTP. */
const servidor = crearServidor();
await new Promise((r) => servidor.listen(0, r));
const base = `http://localhost:${servidor.address().port}`;
try {
  const salud = await (await fetch(`${base}/salud`)).json();
  afirmar(salud.ok && salud.areas.includes('nutricion'), 'GET /salud responde');
  const rPlantilla = await fetch(`${base}/areas/nutricion/plantilla?periodo=${AGOSTO}`);
  afirmar(rPlantilla.ok && rPlantilla.headers.get('content-disposition')?.includes('Nutricion_AGOSTO_2026'), 'GET /plantilla entrega el .xlsx');
  const rVal = await fetch(`${base}/validaciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area: 'nutricion', periodo: AGOSTO, nombre, archivo: Buffer.from(bytes).toString('base64') }),
  });
  const infHttp = await rVal.json();
  afirmar(rVal.ok && infHttp.leidas === FILAS * 31 && infHttp.avisos.length === 1, 'POST /validaciones devuelve el mismo informe que el motor');
  const rMal = await fetch(`${base}/validaciones`, { method: 'POST', body: JSON.stringify({ area: 'nutricion', periodo: 'agosto' }) });
  afirmar(rMal.status === 400, 'un periodo mal escrito se rechaza con 400');
  const rDatos = await fetch(`${base}/validaciones/datos`, { method: 'POST', body: JSON.stringify({ area: 'nutricion', periodo: AGOSTO, datos: huecos }) });
  afirmar((await rDatos.json()).errores.some((e) => e.id === 'incompleto'), 'POST /validaciones/datos revalida lo corregido');
} finally {
  /* Cerrar las conexiones abiertas antes de salir: en Windows, salir con una
     conexión viva de fetch hace fallar a libuv. */
  servidor.closeAllConnections();
  await new Promise((r) => servidor.close(r));
}

/* Corrección guiada (Dr. Mochi) sobre el libro de Nutrición: cuatro hojas,
   una casilla por día. Las propuestas corrigen el ejemplo y el libro corregido
   es el mismo archivo, con solo esas celdas cambiadas, que el bot acepta. */
{
  const { abrirCorreccion, explicar, revalidar, libroCorregido } = await import('../src/correccion.js');
  const { abrirZip } = await import('../src/xlsx.js');
  const d = datosDePrueba(AGOSTO, { pico: false });
  const fila = (id) => FORMATOS.find((f) => f.id === id).filas[0].clave;
  d.f1[fila('f1')][4] = '1O';
  d.f2[fila('f2')][9] = null;
  const sumaF4 = d.f4[fila('f4')].reduce((s, v) => s + v, 0);
  const { bytes: conErrores } = plantillaDe('nutricion', AGOSTO, d, { totalesEscritos: { [`f4|${fila('f4')}`]: sumaF4 + 10 } });

  const abierto = await abrirCorreccion(conErrores, { area: 'nutricion', periodo: AGOSTO });
  const { informe, hojas } = abierto;
  const origen = informe.origen;
  const celda = (k) => (origen[k] ? `${origen[k].columna}${origen[k].fila}` : null);
  const ids = informe.errores.map((h) => h.id).sort();
  afirmar(JSON.stringify(ids) === JSON.stringify(['incompleto', 'no-numerico', 'totales']), 'corrección: el libro trae una casilla con letras, un día vacío y un total que no cuadra', ids.join(', '));
  afirmar(Object.keys(hojas).length === 4, 'corrección: se abren las cuatro hojas del libro', Object.keys(hojas).join(', '));
  afirmar(celda(`f1|${fila('f1')}|5`) === `G${origen[`f1|${fila('f1')}`].fila}`, 'corrección: cada día tiene su celda (el día 5 está en la columna G)');
  const descuadre = informe.errores.find((h) => h.id === 'totales');
  afirmar(descuadre.evidencia?.sumandos.length === 31 && descuadre.evidencia.diferencia === 10, 'corrección: el descuadre trae su evidencia, día por día');
  afirmar(origen[`escrito|fila|f4|${fila('f4')}`] && !origen[`escrito|fila|f4|${fila('f4')}`].formula, 'corrección: el total tecleado no es fórmula');

  const explicaciones = informe.errores.map((h) => explicar(h, { celda }));
  afirmar(explicaciones[informe.errores.findIndex((h) => h.id === 'no-numerico')].causas[0].sugerencia?.cambios[`f1|${fila('f1')}|5`] === 1, 'corrección: «1O» se propone como 1');
  const cambios = Object.assign({}, ...explicaciones.map((e) => e.causas.find((c) => c.sugerencia)?.sugerencia.cambios ?? {}));
  const revisado = revalidar('nutricion', informe.datos, cambios, { origen, periodo: AGOSTO });
  afirmar(revisado.informe.errores.length === 0, 'corrección: con las propuestas de Dr. Mochi el libro queda sin errores', revisado.informe.errores.map((h) => h.titulo).join('; '));

  const corregido = await libroCorregido(conErrores, 'nutricion', { base: informe.datos, datos: revisado.datos, origen });
  const hojasCambiadas = new Set(Object.keys(corregido.celdas).map((k) => k.slice(0, k.lastIndexOf('!'))));
  afirmar(hojasCambiadas.size === 3, 'corrección: el libro corregido cambia celdas en tres de sus hojas', [...hojasCambiadas].join(', '));
  const resubido = await validarArchivo(corregido.bytes, { area: 'nutricion', periodo: AGOSTO });
  afirmar(!resubido.bloqueo && resubido.errores.length === 0, 'corrección: el libro corregido vuelve a subirse y el bot lo acepta', resubido.errores?.map((h) => h.titulo).join('; '));
  const antes = abrirZip(conErrores);
  const despues = abrirZip(corregido.bytes);
  const iguales = antes.nombres().filter((n) => { const a = antes.crudo(n).datos; const b = despues.crudo(n).datos; return a.length === b.length && a.every((x, i) => x === b[i]); });
  /* El índice del libro solo cambia si no pedía ya recalcular al abrir (la plantilla del bot lo pide). */
  const reescritas = antes.nombres().filter((n) => !iguales.includes(n));
  afirmar(reescritas.filter((n) => n.startsWith('xl/worksheets/')).length === 3 && reescritas.every((n) => n.startsWith('xl/worksheets/') || n === 'xl/workbook.xml'), 'corrección: solo se reescriben las tres hojas tocadas (y, si hace falta, el índice del libro)', reescritas.join(', '));
}

/* De qué mes es cada archivo: para cargar meses pasados sin decir a cuál va cada uno. */
{
  const marzo = plantillaDe('nutricion', '2026-03').bytes;
  const r = await mesesDelArchivo(marzo, { area: 'nutricion', anio: '2026', hasta: '2026-09', nombre: 'cualquiera.xlsx' });
  afirmar(r.meses.join() === '2026-03' && !r.problema, 'meses: la plantilla de marzo es de marzo, por su título', JSON.stringify(r));
  const noviembre = await mesesDelArchivo(plantillaDe('nutricion', '2026-11').bytes, { area: 'nutricion', anio: '2026', hasta: '2026-09' });
  afirmar(noviembre.meses.length === 0 && !noviembre.problema, 'meses: un mes posterior al vigente no se ofrece');
  const otra = await mesesDelArchivo(plantillaDe('laboratorio', '2026-03').bytes, { area: 'nutricion', anio: '2026', hasta: '2026-09' });
  afirmar(otra.problema?.id === 'plantilla', 'meses: el libro de otra área se rechaza', otra.problema?.id);
  const roto = await mesesDelArchivo(new TextEncoder().encode('no es excel'), { area: 'nutricion', anio: '2026', hasta: '2026-09' });
  afirmar(roto.problema?.id === 'archivo', 'meses: un archivo que no es Excel se rechaza');
  const libro = await mesesDelArchivo(plantillaDe('laboratorio', '2026-09').bytes, { area: 'laboratorio', anio: '2026', hasta: '2026-09' });
  afirmar(libro.meses.includes('2026-09') && !libro.problema, 'meses: el libro de Laboratorio trae el mes de su hoja', JSON.stringify(libro));
}

console.log(`${fallos === 0 ? 'OK' : 'FALLÓ'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.`);
process.exitCode = fallos === 0 ? 0 : 1;
