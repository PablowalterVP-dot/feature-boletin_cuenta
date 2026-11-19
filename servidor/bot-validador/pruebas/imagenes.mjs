/* Pruebas del módulo de Diagnóstico por Imágenes en el bot validador.
   Ejecución directa: `node pruebas/imagenes.mjs`. Sin dependencias.

   La sección 4 lee los nueve oficios reales (enero a setiembre de 2026) de
   `servidor/api/historico/imagenes/2026/`. Enero, febrero, marzo, mayo y
   setiembre son copias con sus totales escritos corregidos (la suma de sus
   casillas: ver su README); lo que queda son descuadres del original que se
   entregan documentados (tecnólogos, pacientes, abril entero). Si un mes
   cambia de resultado, cambió la lectura: se revisa antes de aceptarlo. */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validarArchivo, validarDatos, plantillaDe, consolidadoAnual } from '../src/motor.js';
import { abrirCorreccion, revalidar, libroCorregido, explicar } from '../src/correccion.js';
import { casillas, datosVacios } from '../src/areas/imagenes/definicion.js';
import { plano, examenesF4 } from '../src/areas/imagenes/calculos.js';
import { soles } from '../src/areas/imagenes/lector.js';

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

console.log('\n--- PRUEBAS DEL MÓDULO DIAGNÓSTICO POR IMÁGENES (BOT VALIDADOR) ---\n');
const P = '2026-06';
const CARPETA = process.env.CARPETA_IMAGENES ?? fileURLToPath(new URL('../../api/historico/imagenes/2026/', import.meta.url));

const matriz = (sis, conv, pag) => ({ sis: { ce: sis[0], emerg: sis[1], hosp: sis[2] }, convenio: { ce: conv[0], emerg: conv[1], hosp: conv[2] }, pagado: { ce: pag[0], emerg: pag[1], hosp: pag[2] } });
/* Un mes coherente: cada total cuadra con sus partes. */
function mes() {
  const d = datosVacios();
  d.f1.examenes = [
    { id: 'eco-1', nombre: 'Dr. Uno', pacientes: 90, examenes: matriz([40, 30, 20], [5, 1, 0], [4, 0, 0]), monto: 120 },
    { id: 'eco-2', nombre: 'Dra. Dos', pacientes: 50, examenes: matriz([30, 10, 10], [2, 0, 0], [3, 0, 0]), monto: 80 },
  ];
  d.f1.biopsias = [{ id: 'bio-1', nombre: 'Dra. Dos', pacientes: 10, examenes: matriz([8, 0, 2], [0, 0, 0], [0, 0, 0]), monto: 0 }];
  d.f1.oncologicos = [{ id: 'onc-1', nombre: 'Dra. Dos', pacientes: 5, examenes: matriz([4, 0, 1], [0, 0, 0], [0, 0, 0]), monto: 0 }];
  Object.assign(d.f2, { inoperativo: true, nota: 'TOMOGRAFO INOPERATIVO', pacientes: 0, examenes: matriz([0, 0, 0], [0, 0, 0], [0, 0, 0]), monto: 0 });
  d.f2.informes.forEach((p) => { p.cantidad = 0; });
  Object.assign(d.f3, { pacientes: 60, examenes: matriz([50, 0, 0], [3, 0, 0], [2, 0, 0]), campana: 5, campanaRotulo: 'CAMPAÑA OFICIO 1', monto: 80 });
  d.f3.informes[0].cantidad = 60;
  Object.assign(d.f4, { examenes: { ce: 400, emerg: 600, hosp: 300 }, pacientes: 1200, placas: 0, particulares: 90, monto: 3000 });
  d.f4.tecnologos = [{ id: 'tec-1', nombre: 'Uno', cantidad: 700 }, { id: 'tec-2', nombre: 'Dos', cantidad: 600 }];
  d.f4.informes[0].cantidad = 20;
  return d;
}

console.log('1. Definición, montos y cuadros de la base');
afirmar(casillas().length === 3 * 11 + 13 + 13 + 9, 'la base cataloga 68 casillas en cuatro cuadros', String(casillas().length));
for (const [texto, esperado] of [['S/. 2,554.00', 2554], ['S/. 4 ,549.50', 4549.5], ['S/. 3 800.50', 3800.5], ['S/.0000', 0], ['S/. .00', 0], ['00000', 0], ['S/.270', 270]]) {
  afirmar(soles(texto).valor === esperado, `«${texto}» son ${esperado} soles`, JSON.stringify(soles(texto)));
}
afirmar(soles('S/.1 16500').ilegible === 'S/.1 16500', '«S/.1 16500» no se adivina: queda ilegible');
const base = plano(mes());
afirmar(base.rx.examenes.emerg === 600 && base.eco.examenes.sis.ce === 70 && base.tac.inoperativo === 1 && base.mam.campana === 5, 'los cuadros planos resumen los formatos', JSON.stringify(base.rx));

console.log('\n2. Ida y vuelta por el Word');
const p = plantillaDe('imagenes', P, mes());
const leido = await validarArchivo(p.bytes, { area: 'imagenes', periodo: P, nombre: p.nombre });
afirmar(!leido.bloqueo && leido.errores.length === 0, 'un mes coherente no tiene errores', JSON.stringify(leido.bloqueo ?? leido.errores.map((e) => e.titulo)));
/* Sin ids y con las claves en orden: el Word trae los servicios de Rayos X
   en otro orden que el formulario, y eso no es una cifra distinta. */
const sinId = (x) => JSON.stringify(x, (k, v) => (k === 'id' ? undefined : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
afirmar(['f1', 'f3', 'f4'].every((f) => sinId(leido.datos[f]) === sinId(mes()[f])), 'las cifras vuelven iguales', ['f1', 'f3', 'f4'].filter((f) => sinId(leido.datos[f]) !== sinId(mes()[f])).join(','));
afirmar(leido.datos.f2.inoperativo && leido.datos.f2.nota === 'TOMOGRAFO INOPERATIVO', 'la nota del tomógrafo inoperativo se lee');
const blanco = plantillaDe('imagenes', P);
const vacio = await validarArchivo(blanco.bytes, { area: 'imagenes', periodo: P, nombre: blanco.nombre });
afirmar(!vacio.bloqueo && vacio.errores.every((e) => e.regla === 'formato-vacio'), 'el formato en blanco solo dice que las hojas están vacías', JSON.stringify(vacio.bloqueo ?? vacio.errores.map((e) => e.id)));
const otroMes = await validarArchivo(p.bytes, { area: 'imagenes', periodo: '2026-07', nombre: p.nombre });
afirmar(otroMes.bloqueo?.id === 'plantilla-periodo', 'un oficio de otro mes se bloquea', otroMes.bloqueo?.titulo);
const ajeno = await validarArchivo(plantillaDe('epidemiologia', P).bytes, { area: 'imagenes', periodo: P, nombre: 'otro.docx' });
afirmar(ajeno.bloqueo?.id === 'plantilla', 'el Word de otra área se rechaza', ajeno.bloqueo?.titulo);

console.log('\n3. Reglas y Dr. Mochi');
const conExam = plantillaDe('imagenes', P, mes(), { escritos: { exam: { 'examenes.0': 103 }, atendidos: 1310 } });
const mal = await validarArchivo(conExam.bytes, { area: 'imagenes', periodo: P, nombre: conExam.nombre });
afirmar(mal.errores.some((e) => e.id === 'f1-exam|examenes.0') && mal.errores.some((e) => e.id === 'f4-atendidos'), 'la EXAM que no suma sus casillas y los atendidos que no suman los servicios son errores', JSON.stringify(mal.errores.map((e) => e.id)));
const abierto = await abrirCorreccion(conExam.bytes, { area: 'imagenes', periodo: P, nombre: conExam.nombre });
const exam = abierto.informe.errores.find((h) => h.id === 'f1-exam|examenes.0');
const e = explicar(exam, { area: 'imagenes', datos: abierto.informe.datos });
afirmar(e.tipo === 'cuenta' && /103/.test(e.conclusion) && /100/.test(e.conclusion), 'Dr. Mochi muestra la cuenta de la EXAM', e.conclusion);
/* Como lo haría el área: corrige un error, revalida y sigue con el que quede.
   En un Word no hay fórmulas, así que corregir la EXAM de un médico descuadra
   la fila T O T A L, y la revalidación lo dice: es el paso siguiente. */
let r = { datos: abierto.informe.datos, informe: abierto.informe };
let pasos = 0;
while (r.informe.errores.length && pasos < 5) {
  const sugerencia = explicar(r.informe.errores[0], { area: 'imagenes', datos: r.datos }).causas.find((x) => x.sugerencia)?.sugerencia;
  if (!sugerencia) break;
  r = revalidar('imagenes', r.datos, sugerencia.cambios, { origen: abierto.informe.origen, periodo: P });
  pasos += 1;
}
afirmar(r.informe.errores.length === 0 && pasos === 3, 'con las correcciones propuestas, paso a paso, el mes cuadra (EXAM, T O T A L y atendidos)', `${pasos} pasos · ${JSON.stringify(r.informe.errores.map((h) => h.id))}`);
const corregido = await libroCorregido(conExam.bytes, 'imagenes', { base: abierto.informe.datos, datos: r.datos, origen: abierto.informe.origen });
const deNuevo = await validarArchivo(corregido.bytes, { area: 'imagenes', periodo: P, nombre: 'corregido.docx' });
afirmar(deNuevo.errores.length === 0, 'el Word corregido pasa', JSON.stringify(corregido.celdas));

const tec = mes();
tec.f4.tecnologos[1].cantidad = 6000;
const conTec = validarDatos(tec, { area: 'imagenes', periodo: P });
const hTec = conTec.errores.find((h) => h.regla === 'tecnologos');
const eTec = explicar(hTec, { area: 'imagenes', datos: tec });
afirmar(eTec.causas.some((c) => c.sugerencia?.cambios?.['d|f4.tecnologos.1.cantidad'] === 600), 'un cero de más en un tecnólogo: Dr. Mochi propone la cifra que cuadra', JSON.stringify(eTec.causas));
afirmar(!eTec.causas.some((c) => c.sugerencia && Object.keys(c.sugerencia.cambios).some((k) => k === 'null')), 'no propone escribir en un total que no es una casilla');

const raro = mes();
raro.f1.examenes[0].pacientes = 200;
raro.f4.particulares = 2000;
const r2 = validarDatos(raro, { area: 'imagenes', periodo: P });
afirmar(['pacientes', 'particulares'].every((x) => r2.errores.some((h) => h.regla === x)), 'más pacientes que exámenes y más particulares que pacientes son errores', JSON.stringify(r2.errores.map((h) => h.regla)));
const anterior = { periodo: '2026-05', datos: { rx: { 'examenes.ce': 100, 'examenes.emerg': 100, 'examenes.hosp': 100 } } };
const variacion = validarDatos(mes(), { area: 'imagenes', periodo: P, anterior });
afirmar(variacion.avisos.some((h) => h.regla === 'variacion' && h.formato === 'f4'), 'Rayos X se compara con el mes anterior aunque la base lo devuelva plano', JSON.stringify(variacion.avisos.map((h) => h.id)));
const c = consolidadoAnual('imagenes', 2026, [{ periodo: '2026-01', datos: mes() }, anterior]);
afirmar(c.consolidado.modalidades.find((m) => m.id === 'rayosX').acumulado === examenesF4(mes().f4) + 300, 'el consolidado suma Rayos X de los meses entregados', JSON.stringify(c.consolidado.modalidades[0]));

console.log('\n4. Los nueve oficios reales (enero a setiembre de 2026)');
const ESPERADO = {
  Enero: ['f4-tecnologos'],
  Febrero: ['f1-pacientes'],
  Marzo: [],
  Abril: ['f1-exam|examenes.0', 'f1-exam|examenes.2', 'f1-exam|examenes.3', 'f1-pacientes', 'f4-tecnologos'],
  Mayo: ['f4-tecnologos'],
  Junio: [],
  Julio: [],
  Agosto: ['f4-tecnologos'],
  Septiembre: [],
};
if (!existsSync(CARPETA)) {
  console.log(`  ! Se salta: no está ${CARPETA}`);
} else {
  const archivos = readdirSync(CARPETA);
  for (const [i, [m, ids]] of Object.entries(ESPERADO).entries()) {
    const nombre = archivos.find((a) => a.startsWith(m));
    const periodo = `2026-${String(i + 1).padStart(2, '0')}`;
    const inf = nombre ? await validarArchivo(readFileSync(`${CARPETA}/${nombre}`), { area: 'imagenes', periodo, nombre }) : null;
    const hallados = inf?.errores?.map((h) => h.id) ?? [];
    afirmar(inf && !inf.bloqueo && JSON.stringify(hallados) === JSON.stringify(ids), `${m}: ${ids.length ? `${ids.length} ${ids.length === 1 ? 'error real' : 'errores reales'}` : 'cuadra'}`, JSON.stringify(inf?.bloqueo ?? hallados));
  }
}

console.log(`\n${fallos ? 'FALLÓ' : 'OK'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.`);
process.exitCode = fallos ? 1 : 0;
