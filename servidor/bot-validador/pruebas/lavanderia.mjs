/* Suite de pruebas automatizadas del módulo Lavandería en el bot validador.
   Ejecución directa: `node pruebas/lavanderia.mjs`.
   Sin dependencias externas.

   La sección 3 lee los Excel reales del área (mayo, julio y agosto de 2026),
   desde `EXCEL_LAVANDERIA` (carpeta) o, si no, desde `insumos/lavanderia/`
   (fuera del repositorio: no se versionan archivos del hospital). Si la
   carpeta no está, se salta con un aviso y lo demás corre igual. */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validarArchivo, validarDatos, plantillaDe, firmaDe } from '../src/motor.js';
import { SERVICIOS, GRUPOS, INSUMOS } from '../src/areas/lavanderia/definicion.js';
import { leerLibro, crearLibro, ESTILO } from '../src/xlsx.js';

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

console.log('\n--- PRUEBAS DEL MÓDULO LAVANDERÍA (BOT VALIDADOR) ---\n');

const PERIODO = '2026-09';
const SERVICIOS_DEL_MES = SERVICIOS.filter((s) => !s.ocasional);

function datosLimpios() {
  const n = 30; // septiembre
  const f1 = {};
  for (const s of SERVICIOS_DEL_MES) f1[s.clave] = Array.from({ length: n }, () => 10);
  const f3 = { comun: Array.from({ length: n }, () => 400), sucia: Array.from({ length: n }, () => 20) };
  const piezas = {};
  for (const g of GRUPOS) piezas[g.clave] = 50;
  const insumos = {};
  for (const i of INSUMOS) insumos[i.clave] = '1 UNIDAD';
  return { f1, f2: [{ fila: 5, iten: 1, descripcion: 'SABANAS', confeccion: '10 UNIDADES', servicio: 'CIRUGIA', tela: 'DRILL' }], f3, f4: { piezas, insumos } };
}

const validarLlenos = (datos, opciones = {}) =>
  validarArchivo(plantillaDe('lavanderia', opciones.periodo ?? PERIODO, datos, opciones).bytes, { area: 'lavanderia', periodo: PERIODO, anterior: opciones.anterior });

// =============================================================================
// 1. RECONOCIMIENTO Y BLOQUEOS
// =============================================================================
console.log('1. Reconocimiento y bloqueos:');

const infNoExcel = await validarArchivo(new Uint8Array([1, 2, 3, 4, 5]), { area: 'lavanderia', periodo: PERIODO });
afirmar(infNoExcel.bloqueo?.id === 'archivo', 'bloquea si el archivo no es un Excel válido');

const sinHojas = crearLibro({ hojas: [{ nombre: 'Hoja1', filas: [[{ v: 'DATOS', estilo: ESTILO.normal }]] }] });
afirmar((await validarArchivo(sinHojas, { area: 'lavanderia', periodo: PERIODO })).bloqueo?.id === 'plantilla', 'bloquea un libro sin ninguna de las cuatro hojas');

const deAgosto = await validarArchivo(plantillaDe('lavanderia', '2026-08', datosLimpios(), { periodo: '2026-08' }).bytes, { area: 'lavanderia', periodo: PERIODO });
afirmar(Boolean(deAgosto.bloqueo), 'un libro de agosto no se carga como reporte de septiembre', JSON.stringify(deAgosto.bloqueo));

const comoNutricion = await validarArchivo(plantillaDe('lavanderia', PERIODO).bytes, { area: 'nutricion', periodo: PERIODO });
afirmar(Boolean(comoNutricion.bloqueo), 'la plantilla de Lavandería no se carga como reporte de Nutrición');

// =============================================================================
// 2. PLANTILLA DE IDA Y VUELTA
// =============================================================================
console.log('\n2. Plantilla descargable de ida y vuelta:');

const plantilla = plantillaDe('lavanderia', PERIODO);
afirmar(plantilla.nombre === 'Lavanderia_SETIEMBRE_2026.xlsx', 'nombre de archivo generado estándar', plantilla.nombre);
const libroPlantilla = await leerLibro(plantilla.bytes);
afirmar(libroPlantilla.hojas.length === 5, 'la plantilla trae sus cuatro hojas de datos más LEEME', libroPlantilla.hojas.join(', '));

const infBlanco = await validarArchivo(plantilla.bytes, { area: 'lavanderia', periodo: PERIODO });
afirmar(!infBlanco.bloqueo && infBlanco.plantilla?.version === 'LAV-1', 'la plantilla en blanco se reconoce, versión LAV-1', JSON.stringify(infBlanco.bloqueo));
afirmar(infBlanco.leidas === 0, 'en blanco no hay ninguna casilla con dato', String(infBlanco.leidas));
afirmar(infBlanco.errores.some((e) => e.id === 'incompleto' && e.formato === 'f1'), 'en blanco, f1 (kilos por servicio) está incompleto');

const llenos = await validarLlenos(datosLimpios());
afirmar(!llenos.bloqueo, 'datos limpios de ida y vuelta por la plantilla se reconocen', JSON.stringify(llenos.bloqueo));
afirmar(llenos.errores.length === 0, 'y no traen ningún error', JSON.stringify(llenos.errores.slice(0, 3)));
afirmar(llenos.datos.f1['c-externos'][0] === 10, 'lo leído es exactamente lo escrito (f1)', String(llenos.datos.f1['c-externos'][0]));
afirmar(llenos.datos.f3.comun[0] === 400 && llenos.datos.f3.sucia[0] === 20, 'lo leído es exactamente lo escrito (f3)');
afirmar(llenos.datos.f4.piezas.emergencias === 50, 'lo leído es exactamente lo escrito (f4, piezas)');
afirmar(llenos.datos.f4.insumos.detergente === '1 UNIDAD', 'lo leído es exactamente lo escrito (f4, insumos)');
afirmar(llenos.datos.f2.length === 1 && llenos.datos.f2[0].descripcion === 'SABANAS', 'lo leído es exactamente lo escrito (f2, confección)');

// =============================================================================
// 3. LOS EXCEL REALES DEL ÁREA
// =============================================================================
console.log('\n3. El Excel real del área (tres meses revisados):');

const CARPETA_REAL = process.env.EXCEL_LAVANDERIA ?? fileURLToPath(new URL('../../../insumos/lavanderia/', import.meta.url));
const MESES_REALES = [
  { archivo: 'INFORME DE LAVANDERIA - PARA ESTADISTICA MAYO - 2026.xlsx', periodo: '2026-05' },
  { archivo: 'INFORME DE LAVANDERIA - PARA ESTADISTICA JULIO 2026.xlsx', periodo: '2026-07' },
  { archivo: 'INFORME DE LAVANDERIA - PARA ESTADISTICA AGOSTO 2026.xlsx', periodo: '2026-08' },
];

if (!existsSync(CARPETA_REAL)) {
  console.log(`  ! Se salta: no está la carpeta de los Excel reales en ${CARPETA_REAL} (o en EXCEL_LAVANDERIA)`);
} else {
  for (const { archivo, periodo } of MESES_REALES) {
    const ruta = `${CARPETA_REAL}${CARPETA_REAL.endsWith('/') || CARPETA_REAL.endsWith('\\') ? '' : '/'}${archivo}`;
    if (!existsSync(ruta)) {
      console.log(`  ! Se salta ${periodo}: no está «${archivo}»`);
      continue;
    }
    const buffer = readFileSync(ruta);
    const inf = await validarArchivo(buffer, { area: 'lavanderia', periodo });
    afirmar(!inf.bloqueo, `${periodo}: se reconoce sin bloqueo`, JSON.stringify(inf.bloqueo));
    /* Mayo de 2026 trajo, de verdad, un total de piezas digitado con el punto
       de los miles («26.633 PIEZAS») y una pieza de Pediatría tecleada como
       «2,16»: ya corregidos en el Excel del área y, el primero, también en
       `comoNumero` (plantillas.js), que antes leía ese punto como decimal. */
    afirmar(inf.errores?.length === 0, `${periodo}: ningún error`, JSON.stringify(inf.errores?.slice(0, 3)));
    const sumaF1 = Object.values(inf.datos?.f1 ?? {}).reduce((acc, dias) => acc + dias.filter((v) => v != null).reduce((a, b) => a + b, 0), 0);
    afirmar(sumaF1 === inf.datos?.declarados?.f1?._total, `${periodo}: el total de kilos por servicio cuadra (${sumaF1})`);
  }
}

// =============================================================================
// 4. CASILLAS NO NUMÉRICAS, FALTANTES Y CON SIGNO
// =============================================================================
console.log('\n4. Casillas no numéricas, filas sin registrar y con signo:');

const base = datosLimpios();
base.f1['c-externos'][2] = 'dieciocho';
const conTexto = await validarLlenos(base);
afirmar(conTexto.errores.some((e) => e.id === 'no-numerico' && e.formato === 'f1'), 'un texto en una casilla de f1 es «no-numerico»');

const vacio = datosLimpios();
vacio.f1['c-externos'] = Array.from({ length: 30 }, () => null);
const conFaltantes = await validarLlenos(vacio);
afirmar(conFaltantes.errores.some((e) => e.id === 'incompleto' && e.formato === 'f1'), 'un servicio sin ninguna cifra es «incompleto»');

const negativo = datosLimpios();
negativo.f1['c-externos'][0] = -5;
const conNegativo = await validarLlenos(negativo);
afirmar(conNegativo.errores.some((e) => e.id === 'entero' && e.formato === 'f1'), 'una cantidad negativa en f1 es «entero»');

const piezasDecimal = datosLimpios();
piezasDecimal.f4.piezas.emergencias = 6.468; // el error real de mayo de 2026
const conDecimal = await validarLlenos(piezasDecimal);
afirmar(conDecimal.errores.some((e) => e.id === 'entero' && e.formato === 'f4'), 'una cifra de piezas no entera (el error real de mayo) es «entero», no se corrige a adivinar');

// =============================================================================
// 5. TOTALES QUE NO CUADRAN
// =============================================================================
console.log('\n5. Totales que no cuadran:');

const totalMal = await validarLlenos(datosLimpios(), { totalesEscritos: { 'f1|c-externos': 999 } });
afirmar(totalMal.errores.some((e) => e.id === 'totales' && e.formato === 'f1' && e.fila === 'c-externos'), 'el total de un servicio que no cuadra con sus días es «totales»');

// =============================================================================
// 6. FILAS OCASIONALES Y AUSENTES
// =============================================================================
console.log('\n6. Filas ocasionales y ausentes:');

const sinOcasional = await validarLlenos(datosLimpios());
afirmar(!sinOcasional.errores.some((e) => e.fila === 'uci-cirugia'), 'UCI-CIRUGIA ausente no exige casillas: no es un error');
afirmar(sinOcasional.info.some((i) => i.regla === 'filas-ausentes' && i.formato === 'f1'), 'y se informa como fila ausente', JSON.stringify(sinOcasional.info.map((i) => i.id)));

const conOcasional = datosLimpios();
conOcasional.f1['uci-cirugia'] = Array.from({ length: 30 }, () => 0);
const informeConOcasional = await validarLlenos(conOcasional);
afirmar(!informeConOcasional.info.some((i) => i.formato === 'f1' && i.regla === 'filas-ausentes'), 'si el Excel trae UCI-CIRUGIA (aunque en 0), no se informa como ausente');

// =============================================================================
// 7. FIRMA
// =============================================================================
console.log('\n7. Firma:');

const d1 = datosLimpios();
const f1firma = firmaDe('lavanderia', d1);
const d2 = datosLimpios();
d2.f1['c-externos'][0] = 999;
afirmar(firmaDe('lavanderia', d2) !== f1firma, 'la firma cambia si cambia una casilla de f1');
const d3 = datosLimpios();
d3.f4.piezas.emergencias = 999;
afirmar(firmaDe('lavanderia', d3) !== f1firma, 'la firma también cambia si cambia una casilla de f4 (piezas), aunque no tenga indicador en la base');

// =============================================================================
// 8. CONSOLIDADO ANUAL
// =============================================================================
console.log('\n8. Consolidado anual:');

const { consolidadoDe, crearConsolidado, nombreDelConsolidado } = await import('../src/areas/lavanderia/consolidado.js');

const mesesDeEjemplo = [
  { periodo: '2026-07', datos: datosLimpios() },
  { periodo: '2026-08', datos: datosLimpios() },
];
const cons = consolidadoDe(2026, mesesDeEjemplo);
afirmar(cons.conDato.filter(Boolean).length === 2, 'cuenta los dos meses con reporte, ni uno más', String(cons.conDato.filter(Boolean).length));
afirmar(cons.conDato[0] === false && cons.conDato[6] === true && cons.conDato[8] === false, 'enero vacío, julio con dato, setiembre vacío');
afirmar(cons.grupos.length === 10, 'son los diez grupos de la sección D de DIRESA', String(cons.grupos.length));
const emergencias = cons.grupos.find((g) => g.id === 'emergencias');
afirmar(emergencias.porMes[6] === 300 && emergencias.porMes[7] === 300, 'cada mes del grupo trae sus kilos (datos de ejemplo: 10 kg/día × 30 días)', String(emergencias.porMes[6]));
afirmar(emergencias.acumulado === 600, 'el acumulado del grupo es la suma de los meses con dato', String(emergencias.acumulado));
afirmar(cons.total.acumulado === cons.grupos.reduce((s, g) => s + g.acumulado, 0), 'el total del año es la suma de los diez grupos');

const soloUnMes = consolidadoDe(2026, [{ periodo: '2026-07', datos: datosLimpios() }]);
afirmar(soloUnMes.grupos[0].acumulado === soloUnMes.grupos[0].porMes[6], 'con un solo mes, el acumulado es ese mes');

const sinMeses = consolidadoDe(2026, []);
afirmar(sinMeses.grupos.every((g) => g.acumulado === null), 'sin ningún mes entregado, el acumulado no es cero: es vacío');

afirmar(nombreDelConsolidado(2026) === 'Lavanderia_TOTAL_2026.xlsx', 'el nombre del consolidado es el del área', nombreDelConsolidado(2026));
const libroConsolidado = crearConsolidado(2026, mesesDeEjemplo, { generado: '14/10/2026' });
afirmar(libroConsolidado.length > 0 || libroConsolidado.byteLength > 0, 'el consolidado se descarga como un .xlsx de verdad');
const releido = await leerLibro(libroConsolidado);
afirmar(releido.hojas[0] === 'TOTAL 2026', 'la hoja se llama TOTAL 2026', releido.hojas[0]);

console.log(`\n-------------------------------------------------------`);
console.log(`Resultado final: ${pasadas} pruebas pasadas, ${fallos} fallos.`);
if (fallos > 0) {
  console.error('\n¡HAY PRUEBAS FALLIDAS!');
  process.exit(1);
} else {
  console.log('¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
}
