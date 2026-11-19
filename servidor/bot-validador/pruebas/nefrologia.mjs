/* Pruebas del módulo Nefrología y Hemodiálisis en el bot validador.
   Ejecución directa: `node pruebas/nefrologia.mjs`. Sin dependencias externas.

   La sección 3 lee el Word real del servicio («hemodialisis - ESTADISTICA HD
   2026.doc», convertido a .docx: el bot no lee el formato antiguo), de enero
   a setiembre de 2026, desde `CARPETA_NEFROLOGIA` o, si no, desde
   `insumos/nefrologia y hemodialisis/` (fuera del repositorio: no se
   versionan archivos del hospital). Si no está, se salta con un aviso y lo
   demás corre igual.

   El cuadro real trae, de verdad, dos clases de problemas (no del lector):
   dos indicadores que el servicio no terminó de llenar en enero, febrero y
   setiembre («PAC. CON CVC TEMPORAL» y otros dos de setiembre), y cuatro
   indicadores cuyo I TRIM o I SEM ya calculado no cuadra con sus meses
   («Cambio de CVC · permanente», «Pacientes SIS», «Abandonos de
   tratamiento», «Altas médicas»): el bot no corrige a adivinar, los
   rechaza, como rechazaría cualquier cuadro real con el mismo problema. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/servidor.js';
import { validarArchivo, validarDatos, plantillaDe, firmaDe, mesesDelArchivo } from '../src/motor.js';
import { abrirCorreccion, libroCorregido } from '../src/correccion.js';
import { leerDocumento } from '../src/docx.js';
import { INDICADORES, COLUMNAS } from '../src/areas/nefrologia/definicion.js';
import { totalDelMes } from '../src/areas/nefrologia/calculos.js';
import { leerLibro } from '../src/xlsx.js';

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

console.log('\n--- PRUEBAS DEL MÓDULO NEFROLOGÍA Y HEMODIÁLISIS (BOT VALIDADOR) ---\n');

const P = '2026-06';
const CARPETA_NEFROLOGIA = process.env.CARPETA_NEFROLOGIA ?? fileURLToPath(new URL('../../../insumos/nefrologia y hemodialisis/', import.meta.url));
const NOMBRE_REAL = 'hemodialisis - ESTADISTICA HD 2026.docx';

/* Un año con cifras coherentes: cada indicador suma su valor por mes, y los
   trimestres y semestres declarados cuadran con lo que se escribe. */
function datosLimpios(mesesConDato = [1, 2, 3, 4, 5, 6]) {
  const f1 = {};
  for (const [i, ind] of INDICADORES.entries()) f1[ind.clave] = 10 + i;
  return { f1, _mesesConDato: mesesConDato };
}

/* ---------------------------------------------------- 1. lector de Word */
console.log('1. Lectura de un .docx');
const blanco = plantillaDe('nefrologia', P);
afirmar(blanco?.nombre === 'HEMODIALISIS_ESTADISTICA_2026.docx', 'el formato en blanco trae el año en el nombre', blanco?.nombre);
const docBlanco = await leerDocumento(blanco.bytes);
afirmar(docBlanco.tablas.length === 1, 'el formato trae el único cuadro del informe', String(docBlanco.tablas.length));
afirmar(docBlanco.tablas[0].filas[0].map((c) => c.texto)[0] === 'INDICADOR', 'y su primera columna es «INDICADOR»');

/* ------------------------------------------------- 2. ida y vuelta */
console.log('\n2. Del Word a los formatos');
const lleno = plantillaDe('nefrologia', P, datosLimpios());
const inf = await validarArchivo(lleno.bytes, { area: 'nefrologia', periodo: P, nombre: lleno.nombre, fecha: '2026-07-05T10:00' });
afirmar(!inf.bloqueo, 'un Word con el cuadro del informe se reconoce', JSON.stringify(inf.bloqueo));
afirmar(inf.datos.f1.pacientes_atendidos === 10 && inf.datos.f1.total_sesiones === 10 + INDICADORES.length - 1, 'las cifras se leen tal como se escribieron, por fila y por mes', JSON.stringify(inf.datos.f1.pacientes_atendidos));
afirmar(inf.errores.length === 0 && inf.avisos.length === 0, 'un Word coherente, sin agregados declarados, no tiene errores ni avisos', [...inf.errores, ...inf.avisos].map((h) => h.id).join());
// La celda, como en un Excel: la columna de JUN es la H (INDICADOR, ENE, FEB, MAR, I TRIM, ABR, MAY, JUN).
afirmar(inf.origen['f1|pacientes_atendidos']?.hoja === 'Cuadro de Hemodiálisis' && inf.origen['f1|pacientes_atendidos'].columna === 'H' && inf.origen['f1|pacientes_atendidos'].tabla === 0, 'cada cifra sabe de qué celda del Word salió', JSON.stringify(inf.origen['f1|pacientes_atendidos']));
afirmar(inf.plantilla.version === 'NEF-W1', 'el informe guarda la versión de lectura', inf.plantilla.version);
afirmar(firmaDe('nefrologia', inf.datos) === firmaDe('nefrologia', structuredClone(inf.datos)), 'la firma de los datos es estable');

const otroMes = await validarArchivo(plantillaDe('nefrologia', '2026-12').bytes, { area: 'nefrologia', periodo: '2026-12' });
afirmar(otroMes.bloqueo?.id === 'plantilla-periodo', 'un cuadro sin la columna del mes pedido se bloquea sin cargar ninguna cifra');
const excel = plantillaDe('nutricion', P);
const conExcel = await validarArchivo(excel.bytes, { area: 'nefrologia', periodo: P });
afirmar(conExcel.bloqueo != null, 'un Excel subido como cuadro de Nefrología se rechaza');
const noZip = await validarArchivo(new TextEncoder().encode('hola'), { area: 'nefrologia', periodo: P });
afirmar(noZip.bloqueo?.titulo === 'El archivo no se pudo abrir como Word', 'un archivo que no es Word lo dice');

/* El cruce de un total declarado (I TRIM…) contra sus meses necesita los
   tres meses de un trimestre a la vez, y la plantilla solo llena la columna
   del mes pedido: no se arma un caso sintético de «totales» con un solo
   mes. Queda probado igual, y con cuatro descuadres reales distintos, en la
   sección 3 (el cuadro real del servicio). */

/* Una fila sin registrar: incompleto. */
const sinFila = datosLimpios();
delete sinFila.f1.fallecidos;
const infSinFila = await validarArchivo(plantillaDe('nefrologia', P, sinFila).bytes, { area: 'nefrologia', periodo: P });
afirmar(infSinFila.errores.some((e) => e.regla === 'incompleto' && e.casillas?.includes('fallecidos')), 'un indicador sin registrar es «incompleto»', infSinFila.errores.map((e) => e.id).join());

/* -------------------------------------------- 3. el Word real del servicio */
console.log('\n3. El Word real del servicio (2026):');

/* El servicio guarda su cuadro en Word 97-2003 (.doc); el bot lo lee tal cual
   (src/doc.js). Si está también su conversión a .docx, los dos se leen igual. */
const rutaReal = (nombre) => `${CARPETA_NEFROLOGIA}${CARPETA_NEFROLOGIA.endsWith('/') || CARPETA_NEFROLOGIA.endsWith('\\') ? '' : '/'}${nombre}`;
const REALES = [NOMBRE_REAL.replace(/\.docx$/, '.doc'), NOMBRE_REAL].filter((n) => existsSync(rutaReal(n)));

if (!existsSync(CARPETA_NEFROLOGIA) || !REALES.length) {
  console.log(`  ! Se salta: no está el Word real («${NOMBRE_REAL.replace(/\.docx$/, '.doc')}» o «${NOMBRE_REAL}») en ${CARPETA_NEFROLOGIA} (o en CARPETA_NEFROLOGIA)`);
} else {
  if (REALES.length === 2) {
    const deDoc = await leerDocumento(readFileSync(rutaReal(REALES[0])));
    const deDocx = await leerDocumento(readFileSync(rutaReal(REALES[1])));
    afirmar(JSON.stringify(deDoc.tablas.map((t) => t.celdas)) === JSON.stringify(deDocx.tablas.map((t) => t.celdas)), 'el .doc se lee celda por celda igual que su conversión a .docx');
  }
  const nombre = REALES[0];
  const real = readFileSync(rutaReal(nombre));
  const PERSISTENTES = ['cambio_cvc_permanente', 'sis', 'abandono', 'alta_medica'];
  const { meses } = await mesesDelArchivo(real, { area: 'nefrologia', anio: '2026', nombre });
  afirmar(meses.length >= 9, `el cuadro trae al menos enero a setiembre (${meses.length} meses)`);

  for (const periodo of meses) {
    const m = Number(periodo.slice(5, 7));
    const r = await validarArchivo(real, { area: 'nefrologia', periodo, nombre });
    afirmar(!r.bloqueo, `${periodo}: se reconoce sin bloqueo`, JSON.stringify(r.bloqueo));
    if (r.bloqueo) continue;

    /* Los descuadres reales de I TRIM / I SEM: error si el total suma el mes
       del reporte; alerta si es de meses ya entregados (no impide enviar). */
    const descuadres = [...r.errores, ...r.avisos].filter((e) => e.regla === 'totales' || e.regla === 'totales-anteriores');
    afirmar(PERSISTENTES.every((clave) => descuadres.some((e) => e.id.includes(`|${clave}|`))), `${periodo}: los descuadres reales (Cambio de CVC permanente, Pacientes SIS, Abandonos, Altas médicas) se encuentran`, descuadres.map((e) => e.id).join(', '));
    afirmar(
      descuadres.every((e) => (e.regla === 'totales') === e.evidencia.sumandos.some((s) => s.casilla)),
      `${periodo}: solo es error el total que suma el mes del reporte`,
      descuadres.map((e) => `${e.regla}:${e.id}`).join(', '),
    );
    if (m >= 7) afirmar(!r.errores.some((e) => e.regla === 'totales'), `${periodo}: un descuadre de enero a junio no impide enviar el mes`);

    if (m <= 2) {
      afirmar(r.errores.some((e) => e.regla === 'incompleto' && e.casillas?.includes('cvc_temporal')), `${periodo}: «Pac. con CVC temporal» sigue sin llenar, es un error real`, r.errores.map((e) => e.id).join());
    } else if (m !== 9) {
      afirmar(!r.errores.some((e) => e.regla === 'incompleto'), `${periodo}: el mes está completo`, r.errores.map((e) => e.id).join());
    }
  }

  const junio = await validarArchivo(real, { area: 'nefrologia', periodo: '2026-06', nombre });
  afirmar(junio.datos.f1.pacientes_atendidos === 80 && junio.datos.f1.total_sesiones === 934, 'junio: 80 pacientes atendidos y 934 sesiones, como el cuadro', String(junio.datos.f1.pacientes_atendidos));
  afirmar(junio.datos.f1.cvc_temporal === 30, 'junio: 30 pacientes con CVC temporal');

  const diciembre = await validarArchivo(real, { area: 'nefrologia', periodo: '2026-12' });
  afirmar(diciembre.bloqueo?.id === 'plantilla-periodo', 'un mes cuya columna está vacía no se carga');

  /* La corrección guiada sobre el .doc devuelve un .docx que el bot vuelve a leer igual. */
  if (nombre.endsWith('.doc')) {
    const ab = await abrirCorreccion(real, { area: 'nefrologia', periodo: '2026-10', nombre });
    const sis = ab.informe.avisos.find((e) => e.id.includes('|sis|trimestre1'));
    if (sis) {
      const datos = structuredClone(ab.informe.datos);
      datos.escritos.cuadro.sis.trimestre1 = sis.calculado;
      const corregido = await libroCorregido(real, 'nefrologia', { base: ab.informe.datos, datos, origen: ab.informe.origen, hoja: ab.hoja });
      const otra = await validarArchivo(corregido.bytes, { area: 'nefrologia', periodo: '2026-10' });
      afirmar(!otra.bloqueo && !otra.avisos.some((e) => e.id.includes('|sis|trimestre1')) && otra.avisos.length === ab.informe.avisos.length - 1, 'corregir un total en el .doc lo resuelve y no mueve nada más');
    }
  }
}

/* ---------------------------------------------- 4. consolidado anual */
console.log('\n4. Consolidado anual:');

const { consolidadoDe, crearConsolidado, nombreDelConsolidado } = await import('../src/areas/nefrologia/consolidado.js');

const mesesDeEjemplo = [
  { periodo: '2026-07', datos: inf.datos },
  { periodo: '2026-08', datos: inf.datos },
];
const cons = consolidadoDe(2026, mesesDeEjemplo);
afirmar(cons.conDato.filter(Boolean).length === 2, 'cuenta los dos meses con reporte, ni uno más', String(cons.conDato.filter(Boolean).length));
afirmar(cons.conDato[0] === false && cons.conDato[6] === true && cons.conDato[7] === true, 'enero vacío, julio y agosto con dato');
afirmar(cons.indicadores.length === INDICADORES.length, 'son los mismos indicadores del cuadro', String(cons.indicadores.length));
const pacientes = cons.indicadores.find((i) => i.id === 'pacientes_atendidos');
afirmar(pacientes.porMes[6] === 10 && pacientes.porMes[7] === 10, 'cada mes del indicador trae su cifra (datos de ejemplo: 10)', String(pacientes.porMes[6]));
afirmar(pacientes.acumulado === 20, 'el acumulado del indicador es la suma de los meses con dato', String(pacientes.acumulado));
afirmar(cons.total.acumulado === totalDelMes(inf.datos.f1) * 2, 'el total del cuadro acumula el total de sesiones de cada mes con dato');

const soloUnMes = consolidadoDe(2026, [{ periodo: '2026-07', datos: inf.datos }]);
afirmar(soloUnMes.indicadores[0].acumulado === soloUnMes.indicadores[0].porMes[6], 'con un solo mes, el acumulado es ese mes');

const sinMeses = consolidadoDe(2026, []);
afirmar(sinMeses.indicadores.every((i) => i.acumulado === null), 'sin ningún mes entregado, el acumulado no es cero: es vacío');

afirmar(nombreDelConsolidado(2026) === 'Nefrologia_TOTAL_2026.xlsx', 'el nombre del consolidado es el del servicio', nombreDelConsolidado(2026));
const libroConsolidado = crearConsolidado(2026, mesesDeEjemplo, { generado: '20/10/2026' });
afirmar(libroConsolidado.length > 0 || libroConsolidado.byteLength > 0, 'el consolidado se descarga como un .xlsx de verdad');
const releido = await leerLibro(libroConsolidado);
afirmar(releido.hojas[0] === 'TOTAL 2026', 'la hoja se llama TOTAL 2026', releido.hojas[0]);

/* ---------------------------------------------- 5. servidor HTTP del bot */
console.log('\n5. Servidor HTTP del Bot:');

await new Promise((resolver, rechazar) => {
  const servidor = crearServidor();
  servidor.listen(0, async () => {
    try {
      const base = `http://localhost:${servidor.address().port}`;
      const salud = await fetch(`${base}/salud`).then((r) => r.json());
      afirmar(salud.areas.includes('nefrologia'), 'HTTP /salud reporta nefrologia activa');
      const plantHttp = await fetch(`${base}/areas/nefrologia/plantilla?periodo=2026-06`);
      afirmar(plantHttp.status === 200 && plantHttp.headers.get('content-disposition')?.includes('HEMODIALISIS_ESTADISTICA_2026.docx'), 'HTTP /areas/nefrologia/plantilla entrega el archivo');

      const informe = await fetch(`${base}/validaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: 'nefrologia', periodo: P, nombre: lleno.nombre, archivo: Buffer.from(lleno.bytes).toString('base64') }),
      }).then((r) => r.json());
      afirmar(informe.area === 'nefrologia' && informe.leidas === INDICADORES.length, 'HTTP POST /validaciones lee y valida Nefrología', String(informe.leidas));
      servidor.close();
      resolver();
    } catch (e) {
      servidor.close();
      rechazar(e);
    }
  });
});

console.log(`\n${fallos === 0 ? 'OK' : 'FALLÓ'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.\n`);
process.exit(fallos === 0 ? 0 : 1);
