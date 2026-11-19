/* Suite de pruebas automatizadas del módulo Laboratorio en el bot validador.
   Ejecución directa: `node pruebas/laboratorio.mjs`.
   Sin dependencias externas.

   La sección 3 lee el libro real del área (un Excel por año con una hoja por
   mes), desde `EXCEL_LABORATORIO` o, si no, desde
   `insumos/laboratorio/estadistica 2026  - CONSOLIDADO - laboratorio.xlsx`
   (fuera del repositorio: no se versionan archivos del hospital). Si no está,
   se salta con un aviso y lo demás corre igual.

   Ese libro trae corregidos a mano, directamente en sus celdas, los errores
   reales que sí se podían deducir con certeza (un total escrito que no cuadra
   con sus partes, un «|1» de tipeo): agosto y setiembre, que antes tenían un
   error cada uno, ya no tienen ninguno. Abril (faltan 6 casillas de un examen)
   y mayo (una casilla con solo una coma, una sección entera sin llenar) siguen
   con sus errores: ahí no hay cifra real que deducir, y el bot no inventa. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/servidor.js';
import { validarArchivo, validarDatos, plantillaDe, firmaDe } from '../src/motor.js';
import { CUADROS, claveFila } from '../src/areas/laboratorio/definicion.js';
import { totalGeneral } from '../src/areas/laboratorio/calculos.js';
import { celdaDeOrigen } from '../src/areas/laboratorio/lector.js';
import { leerLibro, crearLibro, abrirZip, ESTILO } from '../src/xlsx.js';
import { abrirCorreccion, explicar, revalidar, libroCorregido, errorDeTecleo } from '../src/correccion.js';

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

console.log('\n--- PRUEBAS DEL MÓDULO LABORATORIO (BOT VALIDADOR) ---\n');

const PERIODO = '2026-08';
const RUTA_EXCEL_REAL =
  process.env.EXCEL_LABORATORIO ?? fileURLToPath(new URL('../../../insumos/laboratorio/estadistica 2026  - CONSOLIDADO - laboratorio.xlsx', import.meta.url));
const esOcasional = (c, examen) => c.examenes.find((e) => e.clave === examen).ocasional;
/* Las casillas de los exámenes de todos los meses (los ocasionales solo entran si vienen). */
const CASILLAS = CUADROS.reduce((n, c) => n + c.filas.filter((f) => !esOcasional(c, f.examen)).length, 0);

/* Datos completos y cuadrados de los exámenes de todos los meses: 10/10/10/5/5/5. */
function datosLimpios() {
  const datos = {};
  for (const c of CUADROS) {
    datos[c.id] = {};
    for (const f of c.filas) if (!esOcasional(c, f.examen)) datos[c.id][f.clave] = { hospitalizacion: 10, emergencia: 10, c_externa: 10, programa: 10 }[f.procedencia] ?? 5;
  }
  return datos;
}

const validarLlenos = (datos, opciones = {}) =>
  validarArchivo(plantillaDe('laboratorio', opciones.periodo ?? PERIODO, datos, opciones).bytes, { area: 'laboratorio', periodo: PERIODO, anterior: opciones.anterior });

// =============================================================================
// 1. RECONOCIMIENTO Y BLOQUEOS
// =============================================================================
console.log('1. Reconocimiento y bloqueos:');

const infNoExcel = await validarArchivo(new Uint8Array([1, 2, 3, 4, 5]), { area: 'laboratorio', periodo: PERIODO });
afirmar(infNoExcel.bloqueo?.id === 'archivo', 'bloquea si el archivo no es un Excel válido');

const sinMeses = crearLibro({ hojas: [{ nombre: 'Hoja1', filas: [[{ v: 'DATOS', estilo: ESTILO.normal }]] }] });
afirmar((await validarArchivo(sinMeses, { area: 'laboratorio', periodo: PERIODO })).bloqueo?.id === 'plantilla', 'bloquea un libro sin hojas por mes');

const sinCabecera = crearLibro({ hojas: [{ nombre: 'AGO', filas: [[{ v: 'OTRA COSA', estilo: ESTILO.normal }]] }] });
afirmar((await validarArchivo(sinCabecera, { area: 'laboratorio', periodo: PERIODO })).bloqueo?.id === 'plantilla-danada', 'bloquea una hoja del mes sin la cabecera de Patología Clínica');

const deJulio = await validarArchivo(plantillaDe('laboratorio', '2026-07', datosLimpios()).bytes, { area: 'laboratorio', periodo: PERIODO });
afirmar(deJulio.bloqueo?.id === 'plantilla-periodo', 'un libro sin la hoja de agosto no se carga como reporte de agosto', deJulio.bloqueo?.id);

const delAnioPasado = await validarArchivo(plantillaDe('laboratorio', '2025-08', datosLimpios()).bytes, { area: 'laboratorio', periodo: PERIODO });
afirmar(delAnioPasado.bloqueo?.id === 'hoja-de-otro-anio', 'una hoja de agosto que todavía dice 2025 no se carga como agosto de 2026: no se sobrescribió');

const comoNutricion = await validarArchivo(plantillaDe('laboratorio', PERIODO).bytes, { area: 'nutricion', periodo: PERIODO });
afirmar(Boolean(comoNutricion.bloqueo), 'la plantilla de Laboratorio no se carga como reporte de Nutrición');

// =============================================================================
// 2. PLANTILLA DE IDA Y VUELTA
// =============================================================================
console.log('\n2. Plantilla descargable de ida y vuelta:');

const plantilla = plantillaDe('laboratorio', PERIODO);
afirmar(plantilla.nombre === `Laboratorio_${PERIODO}.xlsx`, 'nombre de archivo generado estándar', plantilla.nombre);
const libroPlantilla = await leerLibro(plantilla.bytes);
afirmar(libroPlantilla.hojas[0] === 'AGO', 'la hoja se llama como la del libro del área (AGO)', libroPlantilla.hojas.join(', '));

const infBlanco = await validarArchivo(plantilla.bytes, { area: 'laboratorio', periodo: PERIODO });
afirmar(!infBlanco.bloqueo && infBlanco.plantilla?.version === 'LAB-1' && infBlanco.plantilla.hoja === 'AGO', 'la plantilla en blanco se reconoce, versión LAB-1, hoja AGO');
afirmar(infBlanco.leidas === 0, 'en blanco no hay ninguna casilla con dato', String(infBlanco.leidas));
afirmar(
  infBlanco.errores.length === CUADROS.length && infBlanco.errores.every((e) => e.regla === 'incompleto'),
  'en blanco, un solo error «incompleto» por sección y ningún descuadre: una fila sin ninguna cifra no se registró',
  infBlanco.errores.map((e) => e.id).join(', '),
);

const limpios = datosLimpios();
const infLleno = await validarLlenos(limpios);
afirmar(infLleno.leidas === CASILLAS, `lee las ${CASILLAS} casillas de los exámenes de todos los meses`, String(infLleno.leidas));
afirmar(CUADROS.every((c) => Object.entries(limpios[c.id]).every(([k, v]) => infLleno.datos[c.id][k] === v)), 'lo leído es exactamente lo escrito, casilla por casilla');
afirmar(infLleno.datos.escritos.general === totalGeneral(limpios), 'el TOTAL general (fórmula) llega como total escrito', String(infLleno.datos.escritos.general));
afirmar(infLleno.datos.escritos.patologia?.total != null && Object.keys(infLleno.datos.escritos.resumen).length === 8, 'llegan también el total de Patología Clínica y las ocho filas del resumen');
const origenIzq = celdaDeOrigen(infLleno.origen, 'bioquimica', claveFila('acido_urico', 'emergencia'));
const origenDer = celdaDeOrigen(infLleno.origen, 'metaxenicas', claveFila('tuberculosis', 'programa'));
afirmar(/^C\d+$/.test(origenIzq?.ref ?? '') && /^M\d+$/.test(origenDer?.ref ?? ''), 'el origen de cada casilla es su celda, en su bloque (C a la izquierda, M a la derecha)', `${origenIzq?.ref} ${origenDer?.ref}`);

// =============================================================================
// 3. EL LIBRO REAL DEL ÁREA
// =============================================================================
console.log('\n3. El libro real del área (una hoja por mes):');

if (existsSync(RUTA_EXCEL_REAL)) {
  const real = readFileSync(RUTA_EXCEL_REAL);
  const leer = (periodo) => validarArchivo(real, { area: 'laboratorio', periodo, nombre: 'Oficios_Laboratorio.xlsx' });

  const agosto = await leer('2026-08');
  afirmar(!agosto.bloqueo && agosto.plantilla.hoja === 'AGO', 'para agosto de 2026 lee la hoja «AGO» del libro anual');
  afirmar(agosto.datos.bioquimica['glucosa.emergencia'] === 1235 && agosto.datos.bioquimica['glucosa.privado'] === 70, 'Glucosa de agosto: 1 235 de emergencia y 70 privados, como el libro');
  afirmar(agosto.datos.bioquimica['acido_urico.convenio'] === 0, 'un blanco en una fila llenada es 0, como lo suma su columna TOTAL');
  afirmar(agosto.datos.metaxenicas['tuberculosis.programa'] === 62, 'en Metaxénicas la tercera columna es «Programa»');
  afirmar(agosto.datos.hematologia['hematocrito.privado'] === 1, 'Hematocrito · Privado, antes «|1» (un tipeo real), ya corregido a mano en el Excel a 1');
  afirmar(agosto.datos.escritos.general === 32334, 'el TOTAL general de agosto es 32 334, ya con esa corrección', String(agosto.datos.escritos.general));
  afirmar(agosto.errores.length === 0, 'y agosto no tiene ningún error', agosto.errores.map((e) => e.titulo).join(' | '));

  for (const periodo of ['2026-10', '2026-11', '2026-12']) {
    const r = await leer(periodo);
    afirmar(r.bloqueo?.id === 'hoja-de-otro-anio' && /2025/.test(r.bloqueo.titulo), `${periodo}: su hoja todavía es de 2025, se rechaza`);
  }

  const abril = await leer('2026-04');
  afirmar(abril.plantilla?.hoja === 'ABRIL' && abril.info.some((h) => h.regla === 'hoja-copia'), 'abril lee «ABRIL» y avisa que también está «ABRIL (2)»');

  const enero = await leer('2026-01');
  afirmar(enero.info.some((h) => h.regla === 'total-patologia-amplio') && !enero.errores.some((e) => e.regla === 'total-patologia'), 'en enero el total de laboratorio sumaba todo el departamento: se informa, no se bloquea');
  afirmar(enero.datos.hematologia['coagulacion_sangria.emergencia'] != null && !enero.errores.some((e) => e.regla === 'fila-no-catalogada'), 'enero rotula «TC & TS» y «VSG»: se leen por sus alias, sin filas desconocidas');

  const setiembre = await leer('2026-09');
  afirmar(setiembre.plantilla?.hoja === 'SET' && setiembre.errores.length === 0, 'setiembre: la fila TOTAL de Uro-Parasitológicos, antes descuadrada, ya corregida a mano en el Excel');

  const abrilConErrores = await leer('2026-04');
  afirmar(abrilConErrores.errores.some((e) => e.id === 'incompleto|inmuno_serologicos'), 'abril sigue con un error real: faltan 6 casillas de ANTI M2-3E (AMA), sin cifra que deducir');

  const mayo = await leer('2026-05');
  afirmar(mayo.errores.some((e) => e.regla === 'no-numerico' && e.fila === 'cea.emergencia'), 'mayo sigue con un error real: CEA · Emergencia trae solo una coma');
  afirmar(mayo.errores.some((e) => e.id === 'incompleto|actividades'), 'y la sección Programación y seguimiento está vacía');

  const hojasLeidas = [];
  for (let m = 1; m <= 9; m += 1) {
    const r = await leer(`2026-${String(m).padStart(2, '0')}`);
    hojasLeidas.push(r.bloqueo ? `×${m}` : r.plantilla.hoja);
    if (!r.bloqueo) afirmar(!r.errores.some((e) => e.regla === 'fila-no-catalogada'), `${r.plantilla.hoja}: todas sus filas con cifras son exámenes del catálogo`, r.errores.filter((e) => e.regla === 'fila-no-catalogada').map((e) => e.titulo).join(' | '));
  }
  afirmar(hojasLeidas.join() === 'ENERO,FEBRERO,MARZO,ABRIL,MAYO,JUN,JUL,AGO,SET', 'de enero a setiembre de 2026 se lee la hoja de cada mes', hojasLeidas.join());

  /* El área lleva hoy un solo libro con las doce hojas del año, pero nada en
     `reconocer()`/`leerCifras()` exige que estén las demás: buscan la hoja del
     mes por su nombre en lo que venga. Si el área pasara a entregar un Excel
     por mes (una sola hoja, sin las demás ni el CONSOLIDADO), el bot ya lo
     lee igual: se arma aquí un libro de una sola hoja con la cuadrícula real
     de AGO y se valida como si fuera ese archivo individual. */
  const libroGrande = await leerLibro(real);
  const cuadriculaAgo = await libroGrande.cuadricula('AGO');
  const filasAgo = [];
  for (let r = 1; r <= cuadriculaAgo.ultimaFila; r += 1) {
    const fila = [];
    for (let c = 1; c <= cuadriculaAgo.ultimaColumna; c += 1) fila.push(cuadriculaAgo.valor(r, c));
    filasAgo.push(fila.map((v) => (v == null ? null : { v })));
  }
  const libroIndividual = crearLibro({ hojas: [{ nombre: 'AGO', primera: true, filas: filasAgo }] });
  const individual = await validarArchivo(libroIndividual, { area: 'laboratorio', periodo: '2026-08', nombre: 'AGO_individual.xlsx' });
  afirmar(!individual.bloqueo && individual.plantilla.hoja === 'AGO', 'un Excel con una sola hoja (sin las demás del año) también se reconoce');
  afirmar(individual.errores.length === 0 && individual.datos.escritos.general === agosto.datos.escritos.general, 'y da exactamente las mismas cifras que leerlo del libro grande', String(individual.datos.escritos.general));
} else {
  console.warn(`  ! Se salta: no está el libro del área en ${RUTA_EXCEL_REAL} (o en EXCEL_LABORATORIO)`);
}

// =============================================================================
// 4. DATOS VÁLIDOS Y CUADRADOS
// =============================================================================
console.log('\n4. Validación con datos limpios y cuadrados:');

afirmar(infLleno.errores.length === 0, 'datos cuadrados pasan con 0 errores', infLleno.errores.map((e) => e.titulo).join(' | '));
afirmar(infLleno.avisos.length === 0, 'datos completos pasan con 0 avisos', infLleno.avisos.map((e) => e.titulo).join(' | '));
afirmar(infLleno.reglas.every((r) => r.estado === 'ok' || r.estado === 'sin-evaluar' || r.nivel === 'info'), 'toda regla de error o aviso queda en estado «ok»');

// =============================================================================
// 5. CASILLAS MALAS
// =============================================================================
console.log('\n5. Casillas no numéricas, filas sin registrar y con signo:');

const conTexto = datosLimpios();
conTexto.bioquimica[claveFila('glucosa', 'hospitalizacion')] = 'ERR-VALOR';
const infTexto = await validarLlenos(conTexto);
const errNoNum = infTexto.errores.find((e) => e.regla === 'no-numerico');
afirmar(errNoNum?.fila === 'glucosa.hospitalizacion' && errNoNum.formato === 'bioquimica', 'un texto en una casilla es «no-numerico», atado a su sección y su fila');
afirmar(infTexto.datos.ilegibles['bioquimica|glucosa.hospitalizacion'] === 'ERR-VALOR', 'y se conserva lo que decía la casilla');

const sinRegistrar = datosLimpios();
for (const p of CUADROS.find((c) => c.id === 'hematologia').procedencias) sinRegistrar.hematologia[claveFila('plaquetas', p.clave)] = null;
const infSinRegistrar = await validarLlenos(sinRegistrar, { totalesEscritos: { 'hematologia|plaquetas': null } });
const incompleto = infSinRegistrar.errores.find((e) => e.regla === 'incompleto');
afirmar(incompleto?.formato === 'hematologia' && incompleto.casillas.length === 6, 'una fila sin ninguna cifra ni total no se registró: «incompleto»', JSON.stringify(incompleto?.casillas));

const conSigno = datosLimpios();
conSigno.microbiologia[claveFila('urocultivo', 'privado')] = -3;
const infSigno = await validarLlenos(conSigno);
afirmar(infSigno.errores.some((e) => e.regla === 'entero' && e.fila === 'urocultivo.privado'), 'una cantidad negativa es un error «entero»');

// =============================================================================
// 6. TOTALES TECLEADOS ENCIMA DE LA FÓRMULA
// =============================================================================
console.log('\n6. Totales tecleados que no cuadran:');

const tecleados = await validarLlenos(datosLimpios(), { totalesEscritos: { 'metaxenicas|leptospira_rapida': 180, 'banco_sangre|_total': 1, _general: 5 } });
afirmar(tecleados.errores.some((e) => e.id === 'total-fila|metaxenicas|leptospira_rapida'), 'la columna TOTAL de un examen que no cuadra es «total-fila»');
afirmar(tecleados.errores.some((e) => e.regla === 'total-seccion' && e.formato === 'banco_sangre'), 'el total de una sección que no cuadra es «total-seccion»');
afirmar(tecleados.errores.some((e) => e.regla === 'total-general'), 'el TOTAL general que no cuadra es «total-general»');
afirmar(new Set(tecleados.errores.map((e) => e.id)).size === tecleados.errores.length, 'cada hallazgo tiene un id único en el informe (la base lo exige por carga)');

// =============================================================================
// 7. SECCIÓN EN CERO, EXÁMENES AUSENTES Y FILAS DESCONOCIDAS
// =============================================================================
console.log('\n7. Sección en cero, exámenes ausentes y filas desconocidas:');

const enCero = datosLimpios();
for (const k of Object.keys(enCero.microbiologia)) enCero.microbiologia[k] = 0;
const infCero = await validarLlenos(enCero);
afirmar(infCero.avisos.some((a) => a.regla === 'seccion-vacia' && a.formato === 'microbiologia'), 'genera aviso «seccion-vacia» si una sección reporta 0 en todo el mes');

const libro = await leerLibro(plantillaDe('laboratorio', PERIODO, datosLimpios()).bytes);
const cuadricula = await libro.cuadricula('AGO');
const filas = [];
for (let r = 1; r <= cuadricula.ultimaFila; r += 1) filas.push(Array.from({ length: 17 }, (_, c) => cuadricula.valor(r, c + 1)));
const sinRpr = filas.filter((f) => f[0] !== 'RPR');
const conIntrusa = [...sinRpr.slice(0, 10), ['EXAMEN INVENTADO', 3, 1, 0, 0, 0, 0, 4], ...sinRpr.slice(10)];
const editado = crearLibro({ hojas: [{ nombre: 'AGO', filas: conIntrusa.map((f) => f.map((v) => ({ v, estilo: ESTILO.normal }))) }] });
const infEditado = await validarArchivo(editado, { area: 'laboratorio', periodo: PERIODO });
afirmar(infEditado.datos.ausentes?.inmuno_serologicos?.includes('rpr'), 'un examen que el Excel no trae queda como ausente, no como vacío');
afirmar(infEditado.info.some((h) => h.regla === 'filas-ausentes' && h.formato === 'inmuno_serologicos'), 'y se informa («filas-ausentes»)');
afirmar(!infEditado.info.some((h) => h.regla === 'filas-ausentes' && /LIPIDOS/.test(h.detalle)), 'un examen ocasional que el mes no trae no se informa');
afirmar(infEditado.errores.some((e) => e.regla === 'fila-no-catalogada'), 'una fila con cifras que no es un examen del reporte es un error, no se descarta en silencio');
afirmar(infEditado.avisos.some((a) => a.regla === 'anio-no-escrito') === false, 'con su «Año:» escrito no se pide confirmarlo');

/* Octubre de 2026: el área separó en Banco de Sangre las pruebas con su
   propio subtotal («TOTAL DE PRUEBAS REALIZADAS») y desde entonces «TOTAL DE
   UNIDADES ENTREGADAS» suma solo los hemocomponentes. */
const PRUEBAS = new Set(['GRUPO SANGUINEO ABO EN GEL', 'PRUEBA CRUZADA MAYOR', 'PRUEBA CRUZADA MENOR']);
const filaUnidades = filas.findIndex((f) => f[9] === 'TOTAL DE UNIDADES ENTREGADAS');
const primeraPrueba = filas.findIndex((f) => PRUEBAS.has(f[9]));
const sumaDe = (lista, col) => lista.reduce((n, f) => n + (Number(f[col]) || 0), 0);
const deBanco = filas.slice(filaUnidades + 1, filas.findIndex((f, i) => i > filaUnidades && f[9] === 'PRUEBA CRUZADA MENOR') + 1);
const unidades = deBanco.filter((f) => !PRUEBAS.has(f[9]));
const pruebas = deBanco.filter((f) => PRUEBAS.has(f[9]));
const conSubtotal = filas.map((f) => [...f]);
for (let col = 10; col <= 16; col += 1) conSubtotal[filaUnidades][col] = sumaDe(unidades, col);
const subtotal = Array.from({ length: 17 }, (_, col) => (col === 9 ? 'TOTAL DE PRUEBAS REALIZADAS' : col >= 10 ? sumaDe(pruebas, col) : null));
conSubtotal.splice(primeraPrueba, 0, subtotal);
const libroOctubre = crearLibro({ hojas: [{ nombre: 'AGO', filas: conSubtotal.map((f) => f.map((v) => ({ v, estilo: ESTILO.normal }))) }] });
const infOctubre = await validarArchivo(libroOctubre, { area: 'laboratorio', periodo: PERIODO });
afirmar(infOctubre.errores.length === 0, 'Banco de Sangre con «TOTAL DE PRUEBAS REALIZADAS» aparte se lee sin errores', infOctubre.errores.map((e) => e.titulo).join(' | '));
afirmar(infOctubre.datos.declarados.banco_sangre._total === infLleno.datos.declarados.banco_sangre._total, 'el total de la sección que guarda la base es el mismo: unidades más pruebas');
const pruebaMal = structuredClone(infOctubre.datos);
pruebaMal.banco_sangre[claveFila('prueba_cruzada_mayor', 'hospitalizacion')] += 4;
const infPruebaMal = validarDatos(pruebaMal, { area: 'laboratorio', periodo: PERIODO });
afirmar(infPruebaMal.errores.some((e) => e.regla === 'total-seccion' && /TOTAL DE PRUEBAS REALIZADAS/.test(e.titulo)), 'una prueba que no cuadra se señala en su subtotal, no en el de unidades');
afirmar(!infPruebaMal.errores.some((e) => e.regla === 'total-seccion' && /fila TOTAL/.test(e.titulo)), 'y la fila de unidades sigue cuadrando');

// =============================================================================
// 8. COMPARACIÓN CON EL MES ANTERIOR Y FIRMA
// =============================================================================
console.log('\n8. Variación frente al mes anterior y firma:');

const mitad = datosLimpios();
for (const k of Object.keys(mitad.bioquimica)) mitad.bioquimica[k] = Math.round(mitad.bioquimica[k] / 2);
const infVariacion = await validarLlenos(datosLimpios(), { anterior: { periodo: '2026-07', datos: mitad } });
const variaciones = infVariacion.avisos.filter((a) => a.regla === 'variacion');
afirmar(variaciones.length === 1 && variaciones[0].formato === 'bioquimica', 'dispara aviso de variación solo en la sección que cambia más de 20 %', variaciones.map((a) => a.titulo).join(' | '));
afirmar(/exámenes/.test(variaciones[0]?.detalle ?? ''), 'en exámenes, no en raciones', variaciones[0]?.detalle);

const otra = datosLimpios();
otra.inmuno_serologicos[claveFila('vih_rapida', 'emergencia')] = 99;
afirmar(firmaDe('laboratorio', limpios) !== firmaDe('laboratorio', otra), 'la firma cambia si cambia una casilla');
afirmar(validarDatos(infLleno.datos, { area: 'laboratorio', periodo: PERIODO }).errores.length === 0, 'revalidar los datos leídos (sin el archivo) da lo mismo');

// =============================================================================
// 9. SERVIDOR HTTP DEL BOT (DE PUNTA A PUNTA)
// =============================================================================
console.log('\n9. Servidor HTTP del Bot:');

await new Promise((resolver, rechazar) => {
  const servidor = crearServidor();
  servidor.listen(0, async () => {
    try {
      const base = `http://localhost:${servidor.address().port}`;
      const salud = await fetch(`${base}/salud`).then((r) => r.json());
      afirmar(salud.areas.includes('laboratorio'), 'HTTP /salud reporta laboratorio activo');
      const reglasHttp = await fetch(`${base}/areas/laboratorio/reglas`).then((r) => r.json());
      afirmar(reglasHttp.reglas.some((r) => r.id === 'total-patologia'), 'HTTP /areas/laboratorio/reglas lista sus reglas');
      const plantHttp = await fetch(`${base}/areas/laboratorio/plantilla?periodo=2026-08`);
      afirmar(plantHttp.status === 200 && plantHttp.headers.get('content-disposition')?.includes('Laboratorio_2026-08.xlsx'), 'HTTP /areas/laboratorio/plantilla entrega el archivo');

      const tecleado = plantillaDe('laboratorio', PERIODO, datosLimpios(), { totalesEscritos: { 'metaxenicas|leptospira_rapida': 180 } });
      const informe = await fetch(`${base}/validaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: 'laboratorio', periodo: PERIODO, nombre: tecleado.nombre, archivo: Buffer.from(tecleado.bytes).toString('base64') }),
      }).then((r) => r.json());
      afirmar(informe.area === 'laboratorio' && informe.leidas === CASILLAS, 'HTTP POST /validaciones lee y valida Laboratorio');
      afirmar(informe.errores.length === 1 && informe.errores[0].regla === 'total-fila', 'y devuelve el informe completo con el descuadre');
      servidor.close();
      resolver();
    } catch (e) {
      servidor.close();
      rechazar(e);
    }
  });
});

// =============================================================================
// 10. CORRECCIÓN GUIADA (DR. MOCHI) Y LIBRO CORREGIDO
// =============================================================================
console.log('\n10. Corrección guiada y libro corregido:');

{
  const datos = datosLimpios();
  datos.hematologia['hematocrito.privado'] = '|1';
  for (const k of Object.keys(datos.banco_sangre).filter((x) => x.startsWith('plasma_fresco.'))) datos.banco_sangre[k] = null;
  const lepto = Object.entries(datos.metaxenicas).filter(([k]) => k.startsWith('leptospira_rapida.')).reduce((s, [, v]) => s + v, 0);
  const { bytes } = plantillaDe('laboratorio', PERIODO, datos, { totalesEscritos: { 'metaxenicas|leptospira_rapida': lepto + 100, 'banco_sangre|plasma_fresco': null } });

  const abierto = await abrirCorreccion(bytes, { area: 'laboratorio', periodo: PERIODO });
  const { informe, hoja, hojas } = abierto;
  const celdas = hojas[hoja];
  const origen = informe.origen;
  const celda = (k) => (origen[k] ? `${origen[k].columna}${origen[k].fila}` : null);
  const esFormula = (k) => Boolean(origen[k]?.formula);
  afirmar(informe.errores.length === 3 && hoja === 'AGO', 'abre el archivo como una carga: tres errores en la hoja del mes');
  afirmar(Object.keys(celdas.valores).length > 100 && celdas.formulas.length > 50, 'y trae las celdas de la hoja, con cuáles son fórmula');
  afirmar(origen['escrito|fila|metaxenicas|leptospira_rapida'] && !origen['escrito|fila|metaxenicas|leptospira_rapida'].formula, 'el origen dice la celda de un total escrito, y que el tecleado no es fórmula');
  afirmar(origen['escrito|fila|bioquimica|glucosa']?.formula === true, 'y que el total de un examen sin tocar sí es fórmula');

  const descuadre = informe.errores.find((h) => h.regla === 'total-fila');
  afirmar(descuadre.evidencia?.total.valor === lepto + 100 && descuadre.evidencia.suma === lepto && descuadre.evidencia.sumandos.length === 6, 'un descuadre trae su evidencia: el total escrito y sus seis sumandos');

  const e1 = explicar(descuadre, { celda, esFormula });
  afirmar(e1.cuenta.endsWith(`= ${lepto}`) && e1.conclusion.includes('100 de más'), 'Dr. Mochi muestra la cuenta y cuánto sobra');
  afirmar(e1.causas.some((c) => c.texto.includes('dígito de más')), 'y reconoce un dígito de más en el total');
  afirmar(e1.causas[0].sugerencia?.cambios['escrito|fila|metaxenicas|leptospira_rapida'] === lepto, 'su primera propuesta es poner la suma en el total');

  const ilegible = informe.errores.find((h) => h.regla === 'no-numerico');
  const e2 = explicar(ilegible, { celda });
  afirmar(e2.causas[0].sugerencia?.cambios['hematologia|hematocrito.privado'] === 1, '«|1» se propone como 1: el carácter que se coló al teclear');

  const vacio = informe.errores.find((h) => h.regla === 'incompleto');
  const e3 = explicar(vacio, { celda });
  afirmar(Object.values(e3.causas[0].sugerencia.cambios).every((v) => v === 0) && Object.keys(e3.causas[0].sugerencia.cambios).length === 6, 'una fila vacía se propone en 0, casilla por casilla, diciendo que vacío no es cero');

  afirmar(errorDeTecleo(45, 54)?.tipo === 'invertidos' && errorDeTecleo(42, 142)?.tipo === 'de-mas' && errorDeTecleo(142, 42)?.tipo === 'de-menos' && errorDeTecleo(10, 37) === null, 'reconoce dígitos invertidos, de más y de menos, y no inventa uno donde no lo hay');
  const sumando = explicar(
    { regla: 'total-fila', evidencia: { total: { casilla: 't', etiqueta: 'Total', valor: 100 }, sumandos: [{ casilla: 'a', etiqueta: 'A', valor: 54 }, { casilla: 'b', etiqueta: 'B', valor: 55 }], suma: 109, diferencia: -9 } },
    { celda: (k) => ({ a: 'B3', b: 'C3', t: 'H3' })[k] },
  );
  afirmar(sumando.causas.some((c) => c.sugerencia?.cambios.a === 45), 'si el total está bien, señala el sumando con dos dígitos invertidos (54 por 45)');
  const doble = explicar({ regla: 'total-fila', evidencia: { total: { casilla: 't', etiqueta: 'Total', valor: 130 }, sumandos: [{ casilla: 'a', etiqueta: 'A', valor: 30 }, { casilla: 'b', etiqueta: 'B', valor: 70 }], suma: 100, diferencia: 30 } });
  afirmar(doble.causas.some((c) => c.texto.includes('dos veces') && c.casillas.includes('a')), 'una diferencia igual a un sumando: se sumó dos veces');

  const cambios = Object.assign({}, ...[e1, e2, e3].map((e) => e.causas.find((c) => c.sugerencia).sugerencia.cambios));
  const revisado = revalidar('laboratorio', informe.datos, cambios, { origen, periodo: PERIODO });
  afirmar(revisado.informe.errores.length === 0, 'con las tres propuestas aplicadas el bot no encuentra errores');
  afirmar(informe.datos.hematologia['hematocrito.privado'] == null, 'aplicar cambios no toca los datos originales');

  const corregido = await libroCorregido(bytes, 'laboratorio', { base: informe.datos, datos: revisado.datos, origen, hoja });
  afirmar(corregido.celdas[`${hoja}!${celda('hematologia|hematocrito.privado')}`] === 1 && corregido.celdas[`${hoja}!${celda('escrito|fila|hematologia|hematocrito')}`] != null, 'el libro cambia la casilla corregida y la fórmula que depende de ella guarda su nuevo valor');
  const resubido = await validarArchivo(corregido.bytes, { area: 'laboratorio', periodo: PERIODO });
  afirmar(!resubido.bloqueo && resubido.errores.length === 0, 'el libro corregido vuelve a subirse y el bot lo acepta sin errores');
  const libro = await leerLibro(corregido.bytes);
  afirmar((await libro.cuadricula('AGO')).esFormula(origen['escrito|fila|hematologia|hematocrito'].fila, 8), 'las fórmulas del libro siguen siendo fórmulas');
}

if (existsSync(RUTA_EXCEL_REAL)) {
  /* Agosto y setiembre ya quedaron corregidos a mano en el Excel (arriba);
     mayo sigue con sus dos errores reales, y sirve para probar Dr. Mochi
     contra el libro real tal como llega: la coma de CEA no tiene sugerencia
     (no hay cifra que adivinar), la sección vacía sí la tiene. */
  const real = readFileSync(RUTA_EXCEL_REAL);
  const { informe, hoja } = await abrirCorreccion(real, { area: 'laboratorio', periodo: '2026-05' });
  const origen = informe.origen;
  const cambios = Object.assign({}, ...informe.errores.map((h) => explicar(h, { celda: (k) => (origen[k] ? `${origen[k].columna}${origen[k].fila}` : null) }).causas.find((c) => c.sugerencia)?.sugerencia.cambios ?? {}));
  afirmar(cambios['actividades|programacion.total'] === 0, 'Dr. Mochi propone 0 para la sección vacía, y ninguna cifra para la coma de CEA: no hay con qué adivinarla', JSON.stringify(cambios));
  const revisado = revalidar('laboratorio', informe.datos, cambios, { origen, periodo: '2026-05' });
  afirmar(revisado.informe.errores.length === 1 && revisado.informe.errores[0].regla === 'no-numerico', 'con esa propuesta aplicada solo queda el error que no se puede deducir');
  const { bytes } = await libroCorregido(real, 'laboratorio', { base: informe.datos, datos: revisado.datos, origen, hoja });
  const antes = abrirZip(real);
  const despues = abrirZip(bytes);
  const iguales = antes.nombres().filter((n) => {
    const a = antes.crudo(n).datos;
    const b = despues.crudo(n)?.datos;
    return b && a.length === b.length && a.every((x, i) => x === b[i]);
  });
  const diferentes = antes.nombres().filter((n) => !iguales.includes(n));
  afirmar(diferentes.length === 1 && diferentes[0].startsWith('xl/worksheets/'), `libro real: solo cambia una hoja (la de ${hoja}); el resto del libro (logo, estilos, otras hojas) queda idéntico`, JSON.stringify(diferentes));
  afirmar(antes.nombres().some((n) => n.startsWith('xl/media/')) && iguales.some((n) => n.startsWith('xl/media/')), 'el logo del libro llega intacto');
  const resubido = await validarArchivo(bytes, { area: 'laboratorio', periodo: '2026-05' });
  afirmar(!resubido.bloqueo && resubido.errores.length === 1, 'libro real de mayo: corregido con Dr. Mochi, solo queda el error real que no se puede deducir');
} else {
  console.log('  (sin el libro real: se salta la comprobación sobre el archivo del área)');
}

console.log('\n-------------------------------------------------------');
console.log(`Resultado final: ${pasadas} pruebas pasadas, ${fallos} fallos.`);
if (fallos > 0) process.exitCode = 1;
else console.log('¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!\n');
