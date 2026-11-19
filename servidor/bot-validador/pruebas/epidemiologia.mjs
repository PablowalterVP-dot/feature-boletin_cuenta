/* Pruebas del módulo de Epidemiología en el bot validador.
   Ejecución directa: `node pruebas/epidemiologia.mjs`. Sin dependencias.

   La sección 4 lee los nueve oficios reales (enero a setiembre de 2026) de
   `servidor/api/historico/epidemiologia/2026/`, donde se versionan para la
   carga histórica (no traen datos de pacientes: solo cuentas por edad y
   sexo). Los nueve cuadran: la fila TOTAL coincide con sus grupos de edad. */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validarArchivo, validarDatos, plantillaDe, consolidadoAnual } from '../src/motor.js';
import { abrirCorreccion, revalidar, libroCorregido, explicar } from '../src/correccion.js';
import { EDADES, COLUMNAS, casillas } from '../src/areas/epidemiologia/definicion.js';
import { infeccionesDelMes, totalColumna } from '../src/areas/epidemiologia/calculos.js';
import { periodoDelMes } from '../src/areas/epidemiologia/lector.js';

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

console.log('\n--- PRUEBAS DEL MÓDULO EPIDEMIOLOGÍA (BOT VALIDADOR) ---\n');
const P = '2026-06';
const CARPETA = process.env.CARPETA_EPIDEMIOLOGIA ?? fileURLToPath(new URL('../../api/historico/epidemiologia/2026/', import.meta.url));

/* Un mes con pocos casos, como los reales. */
function mes(extra = {}) {
  const f1 = Object.fromEntries(EDADES.map((e) => [e.clave, Object.fromEntries(COLUMNAS.map((c) => [c.clave, 0]))]));
  f1.e0.neonatologia_m = 2;
  f1.e0.muerte_neonatal_f = 1;
  f1.e25.gineco_f = 3;
  f1.e65.uci_m = 1;
  for (const [ruta, v] of Object.entries(extra)) {
    const [e, c] = ruta.split('.');
    f1[e][c] = v;
  }
  return { f1 };
}

console.log('1. Definición y aritmética');
afirmar(casillas().length === 15 * 14, 'quince grupos de edad por catorce columnas', String(casillas().length));
afirmar(infeccionesDelMes(mes().f1) === 6, 'las infecciones no cuentan la muerte neonatal', String(infeccionesDelMes(mes().f1)));
for (const [texto, esperado] of [['Enero-26', '2026-01'], ['FEBRERO 2026', '2026-02'], ['mar-26', '2026-03'], ['sep-26', '2026-09'], ['set-26', '2026-09']]) {
  afirmar(periodoDelMes(texto) === esperado, `«MES: ${texto}» es ${esperado}`, periodoDelMes(texto));
}

console.log('\n2. Ida y vuelta por el Word');
const p = plantillaDe('epidemiologia', P, mes());
const leido = await validarArchivo(p.bytes, { area: 'epidemiologia', periodo: P, nombre: p.nombre });
afirmar(!leido.bloqueo && leido.errores.length === 0, 'un mes coherente no tiene errores', JSON.stringify(leido.bloqueo ?? leido.errores));
afirmar(JSON.stringify(leido.datos.f1) === JSON.stringify(mes().f1), 'las cifras vuelven iguales (los blancos son 0)');
afirmar(leido.leidas === 210, 'se leen las 210 casillas, también las que están en blanco', String(leido.leidas));
afirmar(leido.info.some((h) => h.regla === 'blancos-son-cero'), 'se informa que los blancos se leyeron como 0');
const otroMes = await validarArchivo(p.bytes, { area: 'epidemiologia', periodo: '2026-07', nombre: p.nombre });
afirmar(otroMes.bloqueo?.id === 'plantilla-periodo', 'un oficio de otro mes se bloquea', otroMes.bloqueo?.titulo);
const blanco = plantillaDe('epidemiologia', P);
const vacio = await validarArchivo(blanco.bytes, { area: 'epidemiologia', periodo: P, nombre: blanco.nombre });
afirmar(!vacio.bloqueo && vacio.info.some((h) => h.regla === 'sin-casos'), 'el formato en blanco es un mes sin casos, no un error', JSON.stringify(vacio.bloqueo ?? vacio.errores));
const otroWord = plantillaDe('nefrologia', P);
const ajeno = await validarArchivo(otroWord.bytes, { area: 'epidemiologia', periodo: P, nombre: otroWord.nombre });
afirmar(ajeno.bloqueo?.id === 'plantilla', 'el Word de otra área se rechaza', ajeno.bloqueo?.titulo);

console.log('\n3. Reglas y Dr. Mochi');
const conTotalMal = plantillaDe('epidemiologia', P, mes(), { totales: { gineco_f: 5 } });
const mal = await validarArchivo(conTotalMal.bytes, { area: 'epidemiologia', periodo: P, nombre: conTotalMal.nombre });
afirmar(mal.errores.length === 1 && mal.errores[0].regla === 'totales', 'una fila TOTAL que no suma es un error', JSON.stringify(mal.errores.map((e) => e.titulo)));
const abierto = await abrirCorreccion(conTotalMal.bytes, { area: 'epidemiologia', periodo: P, nombre: conTotalMal.nombre });
const e = explicar(abierto.informe.errores[0], { area: 'epidemiologia', datos: abierto.informe.datos });
afirmar(e.tipo === 'cuenta' && /suma da 3/.test(e.conclusion), 'Dr. Mochi muestra la cuenta del total', e.conclusion);
const r = revalidar('epidemiologia', abierto.informe.datos, e.causas[0].sugerencia.cambios, { origen: abierto.informe.origen, periodo: P });
afirmar(r.informe.errores.length === 0, 'con la corrección propuesta, el mes cuadra');
const corregido = await libroCorregido(conTotalMal.bytes, 'epidemiologia', { base: abierto.informe.datos, datos: r.datos, origen: abierto.informe.origen });
const deNuevo = await validarArchivo(corregido.bytes, { area: 'epidemiologia', periodo: P, nombre: 'corregido.docx' });
afirmar(deNuevo.errores.length === 0 && Object.keys(corregido.celdas).length === 1, 'el Word corregido cambia una celda y pasa', JSON.stringify(corregido.celdas));

const neonatal = validarDatos(mes({ 'e20.muerte_neonatal_m': 1 }), { area: 'epidemiologia', periodo: P });
afirmar(neonatal.errores.some((h) => h.regla === 'muerte-neonatal-edad'), 'una muerte neonatal fuera del primer año es un error');
const raras = validarDatos(mes({ 'e5.gineco_f': 1, 'e60.muerte_materna_f': 1, 'e1.neonatologia_f': 1 }), { area: 'epidemiologia', periodo: P });
afirmar(['gineco-edad', 'muerte-materna-edad', 'neonatologia-edad'].every((r) => raras.avisos.some((h) => h.regla === r)) && raras.errores.length === 0, 'las edades raras son avisos, no errores', JSON.stringify(raras.avisos.map((h) => h.regla)));
const ilegible = validarDatos({ ...mes(), ilegibles: { 'f1|e30.iho_f': '2?' } }, { area: 'epidemiologia', periodo: P });
afirmar(ilegible.errores.some((h) => h.regla === 'no-numerico'), 'una celda con texto es un error');
const brote = validarDatos(mes({ 'e30.iho_f': 9 }), { area: 'epidemiologia', periodo: P, anterior: { periodo: '2026-05', datos: mes() } });
afirmar(brote.avisos.some((h) => h.regla === 'variacion' && /brote/i.test(h.titulo)), 'el doble de infecciones que el mes anterior avisa un posible brote', JSON.stringify(brote.avisos.map((h) => h.titulo)));
const pocas = validarDatos(mes({ 'e30.iho_f': 2 }), { area: 'epidemiologia', periodo: P, anterior: { periodo: '2026-05', datos: mes() } });
afirmar(!pocas.avisos.some((h) => h.regla === 'variacion'), 'dos casos más no son un brote (sin la variación del 20 %)');
const plano = Object.fromEntries(EDADES.flatMap((ed) => COLUMNAS.map((c) => [`${ed.clave}.${c.clave}`, mes().f1[ed.clave][c.clave]])));
const desdeLaBase = validarDatos(mes({ 'e30.iho_f': 9 }), { area: 'epidemiologia', periodo: P, anterior: { periodo: '2026-05', datos: { f1: plano } } });
afirmar(desdeLaBase.avisos.some((h) => h.regla === 'variacion'), 'el mes anterior plano, como lo devuelve la base, también se compara');

const c = consolidadoAnual('epidemiologia', 2026, [{ periodo: '2026-01', datos: mes() }, { periodo: '2026-02', datos: { f1: plano } }]);
afirmar(c.consolidado.infecciones.acumulado === 12 && c.consolidado.conDato.filter(Boolean).length === 2, 'el consolidado suma los meses entregados', JSON.stringify(c.consolidado.infecciones));
afirmar(c.consolidado.infecciones.porMes[2] === null, 'un mes sin reporte queda vacío, no en cero');

console.log('\n4. Los nueve oficios reales (enero a setiembre de 2026)');
if (!existsSync(CARPETA)) {
  console.log(`  ! Se salta: no está ${CARPETA}`);
} else {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre'];
  const archivos = readdirSync(CARPETA);
  for (const [i, m] of MESES.entries()) {
    const nombre = archivos.find((a) => a.startsWith(m));
    if (!nombre) {
      afirmar(false, `${m}: está en la carpeta`);
      continue;
    }
    const periodo = `2026-${String(i + 1).padStart(2, '0')}`;
    const inf = await validarArchivo(readFileSync(`${CARPETA}/${nombre}`), { area: 'epidemiologia', periodo, nombre });
    const totalOk = !inf.bloqueo && COLUMNAS.every((col) => (totalColumna(inf.datos.f1, col.clave) ?? 0) === inf.datos.escritos.total[col.clave]);
    afirmar(!inf.bloqueo && inf.errores.length === 0 && inf.avisos.length === 0 && totalOk, `${m}: se lee entero, sin errores ni avisos, y su TOTAL cuadra`, JSON.stringify(inf.bloqueo ?? [...inf.errores, ...inf.avisos].map((h) => h.titulo)));
  }
}

console.log(`\n${fallos ? 'FALLÓ' : 'OK'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.`);
process.exitCode = fallos ? 1 : 0;
