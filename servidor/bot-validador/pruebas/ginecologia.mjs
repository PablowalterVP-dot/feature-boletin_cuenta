/* Pruebas del módulo Gineco-Obstetricia en el bot validador.
   Ejecución directa: `node pruebas/ginecologia.mjs`. Sin dependencias externas.

   La sección 3 lee los Excel reales del área («EBVI_Consolidado_Mes_*.xlsx»),
   de enero a setiembre de 2026, desde `CARPETA_GINECOLOGIA` o, si no, desde
   `insumos/ginecologia/` (fuera del repositorio: no se versionan archivos
   del hospital). Si no está, se salta con un aviso y lo demás corre igual.

   A diferencia de Nefrología o Laboratorio, el área sube un Excel nuevo
   cada mes, no un libro acumulado: cada archivo es su propio reporte.

   El cuadro real trae, de verdad, dos particularidades (no del lector):
   el cuadro 2 (partos, cesáreas y nacidos) no aparece de enero a agosto —
   el área empezó a traerlo en setiembre— y es un aviso, no un error: el
   cuadro 1 (controles prenatales) sigue siendo un reporte útil sin él.
   Setiembre, a la vez, es el único mes cuyo cuadro 1 no trae su propia
   fila TOTAL (el cuadro simplemente termina en la última edad): sin un
   total declarado no hay nada que comparar, así que no es un hallazgo —
   el lector tiene que reconocer el fin del cuadro por una fila en blanco,
   no solo por la palabra «TOTAL». */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/servidor.js';
import { validarArchivo, validarDatos, plantillaDe } from '../src/motor.js';
import { leerLibro } from '../src/xlsx.js';
import { EDADES, TIPOS_PARTO, COLUMNAS_F1, COLUMNAS_F2, claveFila } from '../src/areas/ginecologia/definicion.js';
import { totalColumna, totalCuadro } from '../src/areas/ginecologia/calculos.js';

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

console.log('\n--- PRUEBAS DEL MÓDULO GINECO-OBSTETRICIA (BOT VALIDADOR) ---\n');

const P = '2026-06';
const CARPETA_GINECOLOGIA = process.env.CARPETA_GINECOLOGIA ?? fileURLToPath(new URL('../../../insumos/ginecologia/', import.meta.url));

function datosLimpios({ conF2 = false } = {}) {
  const f1 = {};
  for (const [i, e] of EDADES.entries()) {
    for (const [j, c] of COLUMNAS_F1.entries()) f1[claveFila(e.clave, c.clave)] = 10 + i + j;
  }
  const f2 = {};
  if (conF2) {
    for (const [i, t] of TIPOS_PARTO.entries()) {
      for (const [j, c] of COLUMNAS_F2.entries()) f2[claveFila(t.clave, c.clave)] = 5 + i + j;
    }
  }
  return { f1, f2 };
}

/* -------------------------------------------------------- 1. plantilla */
console.log('1. Plantilla en blanco y de ida y vuelta');
const blanco = plantillaDe('ginecologia', P);
afirmar(blanco?.nombre === 'EBVI_Consolidado_Mes_Junio_2026.xlsx', 'el formato en blanco trae el mes y el año en el nombre', blanco?.nombre);

const libroBlanco = await leerLibro(blanco.bytes);
const r1 = await (await import('../src/areas/ginecologia/lector.js')).reconocer(libroBlanco, { periodo: P });
afirmar(!r1.problema, 'el formato en blanco se reconoce como el cuadro del área', r1.problema?.titulo);

const datos = datosLimpios({ conF2: true });
const { bytes: bytesLlenos } = plantillaDe('ginecologia', P, datos);
const libroLleno = await leerLibro(bytesLlenos);
const lector = await import('../src/areas/ginecologia/lector.js');
const leido = await lector.leerCifras(libroLleno, { periodo: P });
afirmar(!leido.problema, 'el formato lleno se lee sin problema', leido.problema?.titulo);
afirmar(leido.datos.f1[claveFila('edad_10_14', 'controles_prenatales')] === 10, 'la primera celda del cuadro 1 vuelve igual', String(leido.datos.f1[claveFila('edad_10_14', 'controles_prenatales')]));
afirmar(leido.datos.f2[claveFila('vaginal_sin_complicaciones', 'total_partos')] === 5, 'la primera celda del cuadro 2 vuelve igual', String(leido.datos.f2[claveFila('vaginal_sin_complicaciones', 'total_partos')]));
afirmar(leido.hallazgos.every((h) => h.regla !== 'cuadro-ausente'), 'con el cuadro 2 lleno, no avisa que falte', JSON.stringify(leido.hallazgos.map((h) => h.id)));

const { bytes: bytesSinF2 } = plantillaDe('ginecologia', P, datosLimpios({ conF2: false }));
const libroSinF2 = await leerLibro(bytesSinF2);
const leidoSinF2 = await lector.leerCifras(libroSinF2, { periodo: P });
afirmar(leidoSinF2.hallazgos.some((h) => h.regla === 'cuadro-ausente' && h.formato === 'f2'), 'sin el cuadro 2, el lector avisa que no vino');
const infoSinF2 = (await import('../src/areas/ginecologia/reglas.js')).validar({ ...leidoSinF2.datos, lectura: leidoSinF2.hallazgos }, P);
afirmar(infoSinF2.errores.length === 0 && infoSinF2.avisos.some((a) => a.regla === 'cuadro-2-ausente'), 'la falta del cuadro 2 es un aviso, no bloquea el envío', JSON.stringify(infoSinF2));

/* --------------------------------------------- 2. totales mal declarados */
console.log('\n2. Un total que no cuadra con sus filas');
const conErrorTotal = { bytes: plantillaDe('ginecologia', P, datos, { declarados: { f1: { controles_prenatales: 999 } } }).bytes };
const libroConError = await leerLibro(conErrorTotal.bytes);
const leidoConError = await lector.leerCifras(libroConError, { periodo: P });
const infoConError = (await import('../src/areas/ginecologia/reglas.js')).validar({ ...leidoConError.datos, lectura: leidoConError.hallazgos }, P);
afirmar(infoConError.errores.some((e) => e.regla === 'totales' && e.declarado === 999), 'el TOTAL mal declarado del cuadro 1 se detecta', JSON.stringify(infoConError.errores.map((e) => e.id)));

/* -------------------------------------------------------- 3. Excel real */
let real = existsSync(CARPETA_GINECOLOGIA);
if (!real) {
  console.log(`\n(sin la carpeta de los Excel reales — ${CARPETA_GINECOLOGIA}: se salta su comprobación)`);
} else {
  console.log('\n3. Los nueve Excel reales del área (enero a setiembre de 2026)');
  const NOMBRES = {
    '2026-01': 'EBVI_Consolidado_Mes_Enero_2026.xlsx',
    '2026-02': 'EBVI_Consolidado_Mes_Febrero_2026.xlsx',
    '2026-03': 'EBVI_Consolidado_Mes_Marzo_2026.xlsx',
    '2026-04': 'EBVI_Consolidado_Mes_Abril_2026.xlsx',
    '2026-05': 'EBVI_Consolidado_Mes_Mayo_2026.xlsx',
    '2026-06': 'EBVI_Consolidado_Mes_Junio_2026.xlsx',
    '2026-07': 'EBVI_Consolidado_2026_Mes_Julio_2026.xlsx',
    '2026-08': 'EBVI_Consolidado_Mes_Agosto_2026.xlsx',
    '2026-09': 'EBVI_Consolidado_Mes_Septiembre_2026.xlsx',
  };

  const base = `${CARPETA_GINECOLOGIA}${CARPETA_GINECOLOGIA.endsWith('/') || CARPETA_GINECOLOGIA.endsWith('\\') ? '' : '/'}`;

  async function leer(periodo) {
    const bytes = new Uint8Array(readFileSync(`${base}${NOMBRES[periodo]}`));
    return validarArchivo(bytes, { area: 'ginecologia', periodo, nombre: NOMBRES[periodo] });
  }

  for (const periodo of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']) {
    const inf = await leer(periodo);
    afirmar(!inf.bloqueo, `${periodo}: el Excel se reconoce y se lee`, inf.bloqueo?.titulo);
    afirmar(inf.errores.length === 0, `${periodo}: sin errores (el cuadro 2 todavía no llegaba)`, JSON.stringify(inf.errores.map((e) => e.titulo)));
    afirmar(inf.avisos.some((a) => a.regla === 'cuadro-2-ausente'), `${periodo}: avisa que falta el cuadro 2`);
    afirmar(totalCuadro(inf.datos, 'f1') > 0, `${periodo}: el cuadro 1 trae controles prenatales`, String(totalCuadro(inf.datos, 'f1')));
  }

  const set = await leer('2026-09');
  afirmar(!set.bloqueo, 'setiembre: el Excel se reconoce y se lee', set.bloqueo?.titulo);
  afirmar(!set.avisos.some((a) => a.regla === 'cuadro-2-ausente'), 'setiembre: ya no avisa que falte el cuadro 2 — sí llegó');
  afirmar(totalColumna(set.datos, 'f2', 'total_partos') === 236, 'setiembre: 236 partos en total', String(totalColumna(set.datos, 'f2', 'total_partos')));
  afirmar(totalColumna(set.datos, 'f2', 'nacidos_vivos') === 237, 'setiembre: 237 nacidos vivos', String(totalColumna(set.datos, 'f2', 'nacidos_vivos')));
  afirmar(set.datos.f2[claveFila('cesarea_sin_complicaciones', 'total_partos')] === 100, 'setiembre: 100 cesáreas sin complicaciones');
  afirmar(set.errores.length === 0 && set.avisos.length === 0, 'setiembre: sin errores ni avisos, el mes más completo', JSON.stringify([...set.errores, ...set.avisos].map((h) => h.titulo)));
}

/* -------------------------------------------------- 4. consolidado anual */
console.log('\n4. Consolidado anual');
const consolidadoMod = await import('../src/areas/ginecologia/consolidado.js');
const mesesSimulados = [
  { periodo: '2026-01', datos: datosLimpios({ conF2: false }) },
  { periodo: '2026-02', datos: datosLimpios({ conF2: true }) },
];
const c = consolidadoMod.consolidadoDe(2026, mesesSimulados);
afirmar(c.conDato[0] && c.conDato[1] && !c.conDato[2], 'el consolidado solo cuenta los meses con reporte', JSON.stringify(c.conDato.slice(0, 3)));
const indControles = c.indicadores.find((i) => i.id === 'f1.controles_prenatales');
afirmar(indControles.porMes[0] === totalCuadro(mesesSimulados[0].datos, 'f1'), 'el indicador del cuadro 1 trae el total de enero');
const indPartos = c.indicadores.find((i) => i.id === 'f2.total_partos');
afirmar(indPartos.porMes[0] == null && indPartos.porMes[1] != null, 'el indicador del cuadro 2 queda vacío en el mes sin ese cuadro, no en cero', JSON.stringify(indPartos.porMes.slice(0, 2)));
const libroConsolidado = consolidadoMod.crearConsolidado(2026, mesesSimulados, {});
afirmar(libroConsolidado.length > 0, 'el consolidado se arma como un .xlsx');
afirmar(consolidadoMod.nombreDelConsolidado(2026) === 'Ginecologia_TOTAL_2026.xlsx', 'el nombre del consolidado trae el año');

/* ------------------------------------------------------- 5. servidor HTTP */
console.log('\n5. El mismo motor servido por HTTP');
const servidor = crearServidor();
await new Promise((resolver) => servidor.listen(0, resolver));
const puerto = servidor.address().port;
try {
  const r = await fetch(`http://localhost:${puerto}/validaciones/datos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area: 'ginecologia', periodo: P, datos: datosLimpios({ conF2: true }) }),
  });
  const cuerpo = await r.json();
  afirmar(r.ok && cuerpo.errores.length === 0, 'el servidor valida los mismos datos sin errores', JSON.stringify(cuerpo.errores));
} finally {
  servidor.close();
}

console.log(`\n${fallos ? 'FALLÓ' : 'OK'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.\n`);
if (fallos) process.exit(1);
