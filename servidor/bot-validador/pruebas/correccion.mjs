/* Corrección guiada en las áreas que la recibieron después de Nutrición y
   Laboratorio: Lavandería, Gineco-Obstetricia (Excel), Nefrología y Farmacia
   (Word). Centro Quirúrgico tiene la suya en centro-quirurgico.mjs.
   Ejecución directa: `node pruebas/correccion.mjs`. Sin dependencias externas.

   Cada caso arma un archivo con errores a propósito, lo abre como la
   pantalla de corrección, aplica lo que propone Dr. Mochi, devuelve el MISMO
   archivo con solo esas celdas cambiadas y lo vuelve a pasar por el bot. */

import { abrirCorreccion, revalidar, libroCorregido, explicar } from '../src/correccion.js';
import { validarArchivo, plantillaDe, mesesDelArchivo } from '../src/motor.js';
import { parchearDocumento, esDocumento } from '../src/docx.js';
import * as LAV from '../src/areas/lavanderia/definicion.js';
import * as GIN from '../src/areas/ginecologia/definicion.js';
import * as NEF from '../src/areas/nefrologia/definicion.js';
import * as FAR from '../src/areas/farmacia/definicion.js';
import { areaDelBot } from '../src/areas/index.js';

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

const reglaDe = (h) => h.correccion ?? h.regla ?? h.id;

/* Abre, aplica la primera propuesta de cada error (las de un mismo error
   pueden pisarse: se aplica de una en una, revalidando) y devuelve lo que
   dice el bot del archivo corregido. */
async function corregir(area, periodo, bytes) {
  const ab = await abrirCorreccion(bytes, { area, periodo });
  const o = ab.informe.origen;
  const celda = (k) => (o[k] ? `${o[k].hoja}!${o[k].columna}${o[k].fila}` : null);
  let datos = ab.informe.datos;
  let informe = ab.informe;
  const cambios = {};
  const vistos = new Set();
  for (let vuelta = 0; vuelta < 10 && informe.errores.length; vuelta += 1) {
    const h = informe.errores.find((x) => !vistos.has(x.id));
    if (!h) break;
    vistos.add(h.id);
    const sug = explicar(h, { celda, esFormula: (k) => Boolean(o[k]?.formula) }).causas.find((c) => c.sugerencia)?.sugerencia;
    if (!sug) continue;
    Object.assign(cambios, sug.cambios);
    ({ datos, informe } = revalidar(area, ab.informe.datos, cambios, { origen: o, periodo }));
  }
  const corr = await libroCorregido(bytes, area, { base: ab.informe.datos, datos, origen: o });
  const re = await validarArchivo(corr.bytes, { area, periodo, nombre: 'corregido' });
  return { ab, informe, corr, re };
}

console.log('\n--- CORRECCIÓN GUIADA: LAVANDERÍA, GINECO-OBSTETRICIA, NEFROLOGÍA Y FARMACIA ---\n');

/* ---------------------------------------------------------- Lavandería */
console.log('1. Lavandería');
{
  const n = 30;
  const f1 = Object.fromEntries(LAV.SERVICIOS.filter((s) => !s.ocasional).map((s) => [s.clave, Array.from({ length: n }, () => 10)]));
  f1[LAV.SERVICIOS[0].clave][4] = 100;
  const f3 = { comun: Array.from({ length: n }, () => 400), sucia: Array.from({ length: n }, () => 20) };
  f3.sucia[7] = null;
  const piezas = Object.fromEntries(LAV.GRUPOS.map((g) => [g.clave, 50]));
  const insumos = Object.fromEntries(LAV.INSUMOS.map((i) => [i.clave, '1 UNIDAD']));
  const datos = { f1, f2: [{ fila: 5, iten: 1, descripcion: 'SABANAS', confeccion: '10 UNIDADES', servicio: 'CIRUGIA', tela: 'DRILL' }], f3, f4: { piezas, insumos } };
  const bytes = plantillaDe('lavanderia', '2026-09', datos, { totalesEscritos: { [`f1|${LAV.SERVICIOS[1].clave}`]: 999 } }).bytes;
  const { ab, informe, corr, re } = await corregir('lavanderia', '2026-09', bytes);
  const total = ab.informe.errores.find((h) => reglaDe(h) === 'totales');
  afirmar(total?.evidencia?.sumandos.length === n, 'el TOTAL de un servicio trae su evidencia: los 30 días', JSON.stringify(total?.evidencia?.total));
  afirmar(ab.informe.errores.some((h) => reglaDe(h) === 'incompleto' && h.casillas?.length === 1), 'el día vacío de ropa sucia se señala por su casilla');
  const atipico = ab.informe.avisos.find((h) => h.regla === 'atipico');
  afirmar(atipico?.nivel === 'aviso' && explicar(atipico).causas.some((c) => c.sugerencia?.cambios[`f1|${LAV.SERVICIOS[0].clave}|5`] === 10), 'el atípico (100 entre dieces) propone 10 o confirmarlo');
  afirmar(informe.errores.length === 0, 'con lo propuesto, la revalidación queda sin errores', informe.errores.map((h) => h.titulo).join(' | '));
  afirmar(Object.keys(corr.celdas).length === 2, 'el libro corregido cambia solo dos celdas', JSON.stringify(corr.celdas));
  afirmar(!re.bloqueo && re.errores.length === 0, 'el libro corregido vuelve a pasar por el bot sin errores');
}

/* -------------------------------------------------- Gineco-Obstetricia */
console.log('\n2. Gineco-Obstetricia');
{
  const f1 = {};
  const f2 = {};
  for (const e of GIN.EDADES) for (const c of GIN.COLUMNAS_F1) f1[GIN.claveFila(e.clave, c.clave)] = 12;
  for (const t of GIN.TIPOS_PARTO) for (const c of GIN.COLUMNAS_F2) f2[GIN.claveFila(t.clave, c.clave)] = 5;
  delete f2[GIN.claveFila('cesarea_con_complicaciones', 'nacidos_muertos')];
  const bytes = plantillaDe('ginecologia', '2026-09', { f1, f2 }, { declarados: { f1: { controles_prenatales: 69 } } }).bytes;
  const { ab, informe, re } = await corregir('ginecologia', '2026-09', bytes);
  const total = ab.informe.errores.find((h) => reglaDe(h) === 'totales');
  afirmar(total?.evidencia?.total.casilla === 'escrito|f1|controles_prenatales' && total.evidencia.sumandos.length === GIN.EDADES.length, 'la fila TOTAL trae su evidencia: un sumando por grupo de edad');
  afirmar(explicar(total).causas.some((c) => /invertidos/.test(c.texto)), 'Dr. Mochi ve los dígitos invertidos (69 por 96)');
  afirmar(Boolean(ab.informe.origen['f2|cesarea_con_complicaciones.nacidos_muertos']), 'la casilla vacía tiene su celda en el libro');
  afirmar(informe.errores.length === 0 && !re.bloqueo && re.errores.length === 0, 'corregido y vuelto a subir, sin errores', re.errores?.map((h) => h.titulo).join(' | '));
}

/* ---------------------------------------------------------- Nefrología */
console.log('\n3. Nefrología (Word)');
{
  const f1 = Object.fromEntries(NEF.INDICADORES.map((i, n) => [i.clave, 10 + n]));
  f1.nuevos = 2.5;
  const limpio = plantillaDe('nefrologia', '2026-03', { f1 }).bytes;
  // Enero y febrero de «pacientes atendidos» y su I TRIM mal escrito: 10 + 20 + 10 = 40, no 400.
  const bytes = await parchearDocumento(limpio, [{ tabla: 0, ref: 'B2', valor: 10 }, { tabla: 0, ref: 'C2', valor: 20 }, { tabla: 0, ref: 'E2', valor: 400 }]);
  afirmar(await esDocumento(bytes), 'el documento parchado sigue siendo un Word');
  const { ab, informe, corr, re } = await corregir('nefrologia', '2026-03', bytes);
  afirmar(ab.tipo === 'docx' && Object.keys(ab.hojas).length === 1, 'la corrección abre la tabla del Word como hoja');
  const trim = ab.informe.errores.find((h) => reglaDe(h) === 'totales');
  afirmar(trim?.evidencia?.sumandos.filter((s) => s.casilla).length === 1, 'el I TRIM señala solo el mes del reporte como corregible: los otros ya se enviaron');
  afirmar(ab.informe.errores.some((h) => reglaDe(h) === 'entero' && h.fila === 'nuevos'), 'el decimal se señala en su casilla');
  afirmar(informe.errores.length === 0 && !re.bloqueo && re.errores.length === 0, 'corregido y vuelto a subir, sin errores', re.errores?.map((h) => h.titulo).join(' | '));
  afirmar(corr.celdas['Cuadro de Hemodiálisis!E2'] === 40 && corr.celdas['Cuadro de Hemodiálisis!D3'] === 3, 'cambian solo el I TRIM y la cifra decimal', JSON.stringify(corr.celdas));
}

/* ------------------------------------------------------------ Farmacia */
console.log('\n4. Farmacia (Word)');
{
  const porFila = (v) => Object.fromEntries(FAR.FILAS.map((f, i) => [f.clave, v[i]]));
  const MES = {
    f1: { sis: { hosp: 9100, emerg: 6000, ce: 2500, hemodialisis: 700, oncologia: 120 }, convenio: { emerg: 170, hosp: 160, consultorio: 140 }, otros: { programas: 600, boletas: 4200, credito: 0, defensa: 0, insolvencias: 0 } },
    f2: { hospitalizados: Object.fromEntries(FAR.FILAS.map((f, i) => [f.clave, Object.fromEntries(FAR.SERVICIOS_SOP.map((s, j) => [s.clave, 10 + i * 5 + j]))])), convenios: porFila([4, 10, 5, 1]) },
    f3: { consultas: porFila([0, 1200, 1230, 70]), convenios: porFila([0, 120, 20, 0]) },
  };
  const limpio = plantillaDe('farmacia', '2026-03', MES).bytes;
  const leido = await validarArchivo(limpio, { area: 'farmacia', periodo: '2026-03' });
  afirmar(!leido.bloqueo && leido.errores.length === 0, 'el informe de ejemplo se lee sin errores');
  const t = leido.origen['escrito|f1.totalSis'];
  const c = leido.origen['f2|hospitalizados.fila2.ciru'];
  afirmar(t?.tabla != null && c?.tabla != null, 'los totales escritos y las cifras saben de qué tabla y celda del Word salieron');
  // El total SIS con dos dígitos invertidos y una cifra de Sala de Operaciones con decimales.
  const bytes = await parchearDocumento(limpio, [{ tabla: t.tabla, ref: `${t.columna}${t.fila}`, valor: 18402 }, { tabla: c.tabla, ref: `${c.columna}${c.fila}`, valor: 1.7 }]);
  const { ab, informe, re } = await corregir('farmacia', '2026-03', bytes);
  const sis = ab.informe.errores.find((h) => h.evidencia?.total.casilla === 'escrito|f1.totalSis');
  afirmar(Boolean(sis) && sis.evidencia.sumandos.some((s) => s.casilla?.startsWith('parte|hemodialisis')), 'el total SIS trae su evidencia, con hemodiálisis por sus dos mitades');
  const fila = ab.informe.errores.find((h) => h.evidencia?.total.casilla === 'escrito|f2.filas.fila2');
  const propuesta = fila && explicar(fila).causas[0].sugerencia;
  afirmar(propuesta?.cambios['f2|hospitalizados.fila2.ciru'] === 17, 'una suma con decimales no propone un total decimal: propone la cifra que cuadra (17)', JSON.stringify(propuesta));
  afirmar(ab.informe.errores.some((h) => h.regla === 'r9' && h.correccion === 'entero'), 'la R9 se corrige como la regla de los enteros');
  afirmar(informe.errores.length === 0 && !re.bloqueo && re.errores.length === 0, 'corregido y vuelto a subir, sin errores', re.errores?.map((h) => h.titulo).join(' | '));
}

/* ------------------------------------------- los tres tipos, en todas */
console.log('\n5. Escritura y casillas vacías en las siete áreas (Excel y Word)');
{
  /* En cada área, una casilla de datos con letras, con decimales y vacía: Dr.
     Mochi dice de qué tipo es el error (la pantalla lo dibuja según eso),
     nombra una casilla que tiene su celda en el archivo y su arreglo lo
     resuelve. Farmacia y Nefrología no aceptan un Word vacío: van con cifras. */
  const porFila = (v) => Object.fromEntries(FAR.FILAS.map((f, i) => [f.clave, v[i]]));
  const CON_CIFRAS = {
    farmacia: [
      {
        f1: { sis: { hosp: 9100, emerg: 6000, ce: 2500, hemodialisis: 700, oncologia: 120 }, convenio: { emerg: 170, hosp: 160, consultorio: 140 }, otros: { programas: 600, boletas: 4200, credito: 0, defensa: 0, insolvencias: 0 } },
        f2: { hospitalizados: Object.fromEntries(FAR.FILAS.map((f, i) => [f.clave, Object.fromEntries(FAR.SERVICIOS_SOP.map((s, j) => [s.clave, 10 + i * 5 + j]))])), convenios: porFila([4, 10, 5, 1]) },
        f3: { consultas: porFila([0, 1200, 1230, 70]), convenios: porFila([0, 120, 20, 0]) },
      },
      'f2|hospitalizados.fila2.ciru',
    ],
    nefrologia: [{ f1: Object.fromEntries(NEF.INDICADORES.map((i, n) => [i.clave, 10 + n])) }, 'f1|pacientes_atendidos'],
  };
  const periodo = '2026-03';
  for (const area of ['nutricion', 'laboratorio', 'lavanderia', 'centro-quirurgico', 'ginecologia', 'farmacia', 'nefrologia']) {
    const corr = areaDelBot(area).correccion;
    const [cifras, elegida] = CON_CIFRAS[area] ?? [undefined, null];
    const ab = await abrirCorreccion(plantillaDe(area, periodo, cifras).bytes, { area, periodo });
    const origen = ab.informe.origen;
    let base = ab.informe.datos;
    let c = elegida;
    if (!c) {
      // La plantilla vacía: se llena la primera casilla vacía que señala el bot y se usa esa.
      const vacio = ab.informe.errores.find((h) => explicar(h).tipo === 'faltan' && corr.casillasDelHallazgo(h).editables.length);
      const casillas = corr.casillasDelHallazgo(vacio).editables;
      base = revalidar(area, base, Object.fromEntries(casillas.map((k) => [k, 3])), { origen, periodo }).datos;
      [c] = casillas;
    }
    const caso = (nombre, datos, tipo) => {
      const inf = revalidar(area, datos, {}, { origen, periodo }).informe;
      const h = [...inf.errores, ...inf.avisos].find((x) => explicar(x).tipo === tipo && corr.casillasDelHallazgo(x).editables.includes(c));
      const sug = h && explicar(h, { area, datos }).causas.find((x) => x.sugerencia)?.sugerencia;
      // Resuelto: ningún error del mismo tipo señala ya esa casilla (en Nutrición y Lavandería, «incompleto» es el id de todos sus cuadros).
      const resuelto = sug && Object.keys(sug.cambios).every((k) => origen[k]) && !revalidar(area, datos, sug.cambios, { origen, periodo }).informe.errores.some((x) => explicar(x).tipo === tipo && corr.casillasDelHallazgo(x).editables.includes(c));
      afirmar(Boolean(resuelto), `${area} · ${nombre}: error de tipo «${tipo}» en su celda, y el arreglo de Dr. Mochi lo resuelve`, h ? JSON.stringify(sug?.cambios) : 'no apareció el error');
    };
    const conLetras = structuredClone(revalidar(area, base, { [c]: null }, { origen, periodo }).datos);
    (conLetras.ilegibles ??= {})[c] = '1O';
    caso('una cifra con letras', conLetras, 'escritura');
    caso('una cifra con decimales', revalidar(area, base, { [c]: 2.5 }, { origen, periodo }).datos, 'escritura');
    caso('una casilla vacía', revalidar(area, base, { [c]: null }, { origen, periodo }).datos, 'faltan');
  }
}

/* ------------------------------------------- meses pasados, en todas */
console.log('\n6. Cargar meses pasados: cada área reconoce el mes de su archivo (Excel y Word)');
{
  /* La carga de meses pasados (CargaDeMeses.jsx) no pregunta a qué mes va cada
     archivo: el bot lo reconoce. Un archivo por mes da un solo mes; el que no
     lo dice en sus celdas (Gineco-Obstetricia) lo toma del nombre; un Word se
     abre como Word. */
  const cifrasNef = { f1: Object.fromEntries(NEF.INDICADORES.map((i, n) => [i.clave, 10 + n])) };
  for (const area of ['nutricion', 'laboratorio', 'lavanderia', 'centro-quirurgico', 'ginecologia', 'farmacia', 'nefrologia']) {
    const p = plantillaDe(area, '2026-03', area === 'nefrologia' ? cifrasNef : undefined);
    const r = await mesesDelArchivo(p.bytes, { area, anio: '2026', hasta: '2026-09', nombre: p.nombre });
    afirmar(!r.problema && r.meses.length === 1 && r.meses[0] === '2026-03', `${area}: «${p.nombre}» es de marzo, y solo de marzo`, JSON.stringify(r));
  }
  const p = plantillaDe('ginecologia', '2026-03');
  const sinMes = await mesesDelArchivo(p.bytes, { area: 'ginecologia', anio: '2026', hasta: '2026-09', nombre: 'consolidado.xlsx' });
  afirmar(sinMes.problema?.id === 'mes-ambiguo', 'un consolidado de Gineco-Obstetricia sin el mes en el nombre no se adivina: se pide nombrarlo o subirlo desde su mes');
}

console.log(`\n${fallos ? 'FALLÓ' : 'OK'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.`);
process.exitCode = fallos ? 1 : 0;
