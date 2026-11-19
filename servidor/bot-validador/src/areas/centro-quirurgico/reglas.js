/* Reglas del reporte de Centro Quirúrgico.

   Una función pura: recibe los datos (definicion.js) y devuelve lo que no
   cumple. Los mismos tres niveles de las demás áreas:
     error  impide enviar. Lo que no cuadra no sale del área.
     aviso  no impide enviar, pero exige una justificación escrita.
     info   lo que conviene saber y no exige nada.

   Dos familias de descuadres, con distinto nivel:
     · Un total escrito que no es la suma de sus filas, DENTRO de una hoja (la
       fila de una especialidad, el Sub Total, el TOTAL de las causas): error.
       Es una fórmula mal armada (enero: la obstetricia menor suma un rango
       que no es el suyo) y el área la corrige en su Excel.
     · Dos hojas que dicen cifras distintas de lo mismo (el RESUMEN contra las
       hojas por especialidad, el cuadro de indicadores contra el RESUMEN):
       aviso. En los ocho meses revisados casi siempre hay alguno (junio:
       «realizadas» dice 455 y el RESUMEN 442), y quién tiene razón lo sabe el
       área, no el bot. Cada regla junta sus diferencias en un solo aviso, para
       que el área justifique una vez y no una por cifra.

   Si falta una cifra de la suma, no se compara: ya lo dice `incompleto`. */

import { CUADROS, CAUSAS, cuadro, filaDe, especialidad, claveCasilla } from './definicion.js';
import { valor, sumar, filasDelMes, produccion } from './calculos.js';

export const REGLAS = Object.freeze([
  { id: 'fila-no-catalogada', nivel: 'error', texto: 'Cada fila con cifras del mes es una fila del reporte' },
  { id: 'especialidad-no-catalogada', nivel: 'error', texto: 'Cada especialidad del Excel es una especialidad del reporte' },
  { id: 'incompleto', nivel: 'error', texto: 'El resumen, el cuadro de indicadores y las causas traen su cifra del mes (sin movimiento se anota 0)' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda cifra del mes es un número' },
  { id: 'entero', nivel: 'error', texto: 'Las intervenciones, las salas y los pacientes son enteros sin signo; las horas, sin signo' },
  { id: 'subtotales', nivel: 'error', texto: 'El total de cada especialidad, el Sub Total de cada hoja y el TOTAL de las causas coinciden con la suma de sus filas' },
  { id: 'cruce-resumen', nivel: 'aviso', texto: 'Las cirugías mayores y menores del RESUMEN coinciden con las hojas por especialidad' },
  { id: 'cruce-suspendidas', nivel: 'aviso', texto: 'Las suspendidas del RESUMEN y del cuadro de indicadores coinciden con la suma de las causas' },
  { id: 'cruce-indicadores', nivel: 'aviso', texto: 'Las intervenciones y las horas del cuadro de indicadores coinciden con el RESUMEN' },
  { id: 'salas', nivel: 'aviso', texto: 'Las salas utilizadas son las de emergencia más las de cirugía programada' },
  { id: 'mes-no-escrito', nivel: 'aviso', texto: 'El libro dice de qué mes es' },
  { id: 'filas-ausentes', nivel: 'info', texto: 'El Excel trae todas las filas y especialidades del reporte' },
  { id: 'hoja-leida', nivel: 'info', texto: 'Se lee solo la columna del mes que se reporta' },
]);

/* Qué hace cada hallazgo del lector (lector.js), según su regla. */
const NIVEL_DE_LECTURA = Object.freeze({ 'fila-no-catalogada': 'error', 'especialidad-no-catalogada': 'error', 'mes-no-escrito': 'aviso', 'hoja-leida': 'info' });

const formatear = (v) => (Number.isInteger(v) ? v.toLocaleString('es-PE') : v.toLocaleString('es-PE', { maximumFractionDigits: 2 }));

/* Las horas, como las escribe el área en su Excel: horas:minutos («997:57»). */
const horasYMinutos = (horas) => {
  const minutos = Math.round(Math.abs(horas) * 60);
  return `${horas < 0 ? '-' : ''}${Math.floor(minutos / 60).toLocaleString('es-PE')}:${String(minutos % 60).padStart(2, '0')}`;
};
const diferencia = (escrito, suma) => (escrito > suma ? `${formatear(escrito - suma)} de más` : `${formatear(suma - escrito)} de menos`);
/* Las horas vienen de sumar duraciones: una diferencia de centésimas es ruido. */
const iguales = (a, b, decimal) => (decimal ? Math.abs(a - b) < 0.05 : a === b);

function donde(idCuadro, clave) {
  return `${cuadro(idCuadro).titulo} · ${filaDe(idCuadro, clave)?.rotulo ?? clave}`;
}

/* ------------------------------------------- casillas: número, entero, vacías */

function validarCasillas(datos, errores, info) {
  for (const c of CUADROS) {
    const faltan = [];
    for (const f of filasDelMes(datos, c.id)) {
      const v = datos?.[c.id]?.[f.clave];
      const ilegible = datos?.ilegibles?.[claveCasilla(c.id, f.clave)];
      if (v == null && ilegible != null) {
        errores.push({ id: `no-numerico|${c.id}|${f.clave}`, regla: 'no-numerico', formato: c.id, fila: f.clave, titulo: `«${ilegible}» no es un número`, detalle: `${donde(c.id, f.clave)}. Corrija la celda en el Excel y súbalo otra vez.` });
      } else if (v == null) {
        // En las hojas por especialidad, un blanco ya es 0 (lector.js): solo
        // queda vacía la especialidad sin ninguna fila ni total escrito.
        faltan.push(f);
      } else if (v < 0 || (!f.decimal && !Number.isInteger(v))) {
        errores.push({
          id: `entero|${c.id}|${f.clave}`, regla: 'entero', formato: c.id, fila: f.clave,
          titulo: `${formatear(v)} no es una cifra válida`,
          detalle: `${donde(c.id, f.clave)}. ${f.decimal ? 'Las horas no pueden ser negativas.' : 'Se cuenta en enteros y no puede ser negativo.'}`,
        });
      }
    }
    if (faltan.length) {
      errores.push({
        id: `incompleto|${c.id}`, regla: 'incompleto', formato: c.id, fila: faltan[0].clave, casillas: faltan.map((f) => f.clave),
        titulo: `${c.titulo}: ${faltan.length === 1 ? 'falta 1 cifra' : `faltan ${faltan.length} cifras`} del mes`,
        detalle: `${faltan.slice(0, 5).map((f) => f.rotulo).join('; ')}${faltan.length > 5 ? '…' : ''}. Si no hubo movimiento, escriba 0.`,
      });
    }
    const noFiguran = (datos?.ausentes?.[c.id] ?? []).map((clave) => filaDe(c.id, clave)).filter((f) => f && !f.ocasional);
    if (noFiguran.length) {
      info.push({
        id: `filas-ausentes|${c.id}`, regla: 'filas-ausentes', formato: c.id,
        titulo: `${c.titulo}: el Excel no trae ${noFiguran.length === 1 ? '1 fila' : `${noFiguran.length} filas`} del reporte`,
        detalle: `${noFiguran.map((f) => f.rotulo).join(', ')}. Se toman como no registradas este mes, no como cero.`,
      });
    }
  }

  /* Un procedimiento con letras en vez de cifra. */
  for (const [clave, texto] of Object.entries(datos?.ilegibles ?? {})) {
    const m = clave.match(/^(mayor|menor)\|([^#]+)#(\d+)$/);
    if (!m) continue;
    errores.push({
      // `fila` lleva la fila de la hoja: así la corrección guiada señala la celda del procedimiento.
      id: `no-numerico|${m[1]}|${m[2]}|${m[3]}`, regla: 'no-numerico', formato: m[1], fila: `${m[2]}#${m[3]}`,
      titulo: `«${texto}» no es un número`,
      detalle: `${cuadro(m[1]).titulo} · ${especialidad(m[2])?.label ?? m[2]}, fila ${m[3]} de la hoja. Corrija la celda en el Excel y súbalo otra vez.`,
    });
  }
}

/* ------------------------------------------------------------ subtotales */

function validarSubtotales(datos, errores) {
  for (const id of ['mayor', 'menor']) {
    const declarados = datos?.declarados?.[id] ?? {};
    const conIlegible = new Set(Object.keys(datos?.ilegibles ?? {}).map((k) => k.match(new RegExp(`^${id}\\|([^#]+)#`))?.[1]).filter(Boolean));
    for (const f of cuadro(id).filas) {
      const escrito = declarados[f.clave];
      const suma = valor(datos, id, f.clave);
      if (escrito == null || suma == null || conIlegible.has(f.clave) || escrito === suma) continue;
      errores.push({
        id: `subtotales|${id}|${f.clave}`, regla: 'subtotales', formato: id, fila: f.clave,
        titulo: `${cuadro(id).titulo} · ${f.rotulo}: el Excel dice ${formatear(escrito)} y sus procedimientos suman ${formatear(suma)}`,
        detalle: `${diferencia(escrito, suma)}. La fila de la especialidad suma sus procedimientos: revise que su fórmula tome todas sus filas y solo esas.`,
        evidencia: {
          total: { casilla: `escrito|${id}|${f.clave}`, etiqueta: `${cuadro(id).titulo} · ${f.rotulo} · total escrito`, valor: escrito },
          sumandos: (datos?.procedimientos?.[id]?.[f.clave] ?? []).filter((p) => typeof p.valor === 'number').map((p) => ({ casilla: `${id}|${f.clave}#${p.fila}`, etiqueta: p.rotulo, valor: p.valor })),
          suma,
          diferencia: escrito - suma,
        },
      });
    }
    // El Sub Total suma las filas de especialidad tal como están escritas: así
    // un descuadre de una especialidad no se informa dos veces.
    const escritos = cuadro(id).filas.map((f) => declarados[f.clave]).filter((v) => v != null);
    const sumaEscritos = escritos.length ? escritos.reduce((a, b) => a + b, 0) : null;
    if (declarados._total != null && sumaEscritos != null && declarados._total !== sumaEscritos) {
      errores.push({
        id: `subtotales|${id}|_total`, regla: 'subtotales', formato: id,
        titulo: `${cuadro(id).titulo}: el Sub Total dice ${formatear(declarados._total)} y las especialidades suman ${formatear(sumaEscritos)}`,
        detalle: `${diferencia(declarados._total, sumaEscritos)}. Revise que la fórmula del Sub Total tome todas las especialidades de la hoja.`,
        evidencia: {
          total: { casilla: `escrito|${id}|_total`, etiqueta: `${cuadro(id).titulo} · Sub Total`, valor: declarados._total },
          sumandos: cuadro(id).filas.filter((f) => declarados[f.clave] != null).map((f) => ({ casilla: `escrito|${id}|${f.clave}`, etiqueta: f.rotulo, valor: declarados[f.clave] })),
          suma: sumaEscritos,
          diferencia: declarados._total - sumaEscritos,
        },
      });
    }
  }

  const total = datos?.declarados?.suspendidas?._total;
  const causas = sumar(CAUSAS.map((c) => valor(datos, 'suspendidas', c.clave)));
  const faltaAlguna = filasDelMes(datos, 'suspendidas').some((f) => valor(datos, 'suspendidas', f.clave) == null);
  if (total != null && causas != null && !faltaAlguna && total !== causas) {
    errores.push({
      id: 'subtotales|suspendidas|_total', regla: 'subtotales', formato: 'suspendidas',
      titulo: `Causas de suspensión: el TOTAL dice ${formatear(total)} y las causas suman ${formatear(causas)}`,
      detalle: `${diferencia(total, causas)}. El TOTAL es la suma de las causas.`,
      evidencia: {
        total: { casilla: 'escrito|suspendidas|_total', etiqueta: 'Causas de suspensión · TOTAL', valor: total },
        sumandos: filasDelMes(datos, 'suspendidas').map((c) => ({ casilla: `suspendidas|${c.clave}`, etiqueta: c.rotulo, valor: valor(datos, 'suspendidas', c.clave) })),
        suma: causas,
        diferencia: total - causas,
      },
    });
  }
}

/* --------------------------------------------------------------- cruces */

/* Un aviso que junta las diferencias de una regla: [{ que, a, b, decimal, casillas }].
   `casillas` son las celdas que compara cada línea: la corrección guiada las
   muestra y deja corregir la que esté mal, o confirmar el aviso. */
function cruce(avisos, regla, titulo, lineas, pie) {
  const distintas = lineas.filter((l) => l.a != null && l.b != null && !iguales(l.a, l.b, l.decimal));
  if (!distintas.length) return;
  avisos.push({
    id: regla, regla, nivel: 'aviso',
    casillas: [...new Set(distintas.flatMap((l) => l.casillas ?? []))],
    titulo: distintas.length === 1 ? `${titulo}: ${distintas[0].que}` : `${titulo}: ${distintas.length} cifras no coinciden`,
    detalle: `${distintas.map((l) => `${l.que}: ${l.decimal ? horasYMinutos(l.a) : formatear(l.a)} y ${l.decimal ? horasYMinutos(l.b) : formatear(l.b)}`).join('; ')}. ${pie}`,
  });
}

function validarCruces(datos, avisos) {
  const p = produccion(datos);
  const mayor = sumar(Object.values(datos?.mayor ?? {}));
  const menor = sumar(Object.values(datos?.menor ?? {}));
  cruce(avisos, 'cruce-resumen', 'El RESUMEN y las hojas por especialidad', [
    { que: 'cirugías mayores (RESUMEN y CIRUGIA MAYOR)', a: p.mayores.total, b: mayor, casillas: ['resumen|mayores.programada', 'resumen|mayores.emergencia', 'escrito|mayor|_total'] },
    { que: 'cirugías menores (RESUMEN y CIRUGIA MENOR)', a: p.menores.total, b: menor, casillas: ['resumen|menores.programada', 'resumen|menores.emergencia', 'escrito|menor|_total'] },
  ], 'Si una de las dos está mal, corríjala en el Excel; si las dos son correctas, explique por qué difieren. La producción del mes se toma del RESUMEN.');

  const causas = sumar(CAUSAS.map((c) => valor(datos, 'suspendidas', c.clave)));
  cruce(avisos, 'cruce-suspendidas', 'Las cirugías suspendidas', [
    { que: 'suspendidas del RESUMEN y suma de las causas', a: sumar([valor(datos, 'resumen', 'suspendidas.programada'), valor(datos, 'resumen', 'suspendidas.emergencia')]), b: causas, casillas: ['resumen|suspendidas.programada', 'resumen|suspendidas.emergencia', 'escrito|suspendidas|_total'] },
    { que: 'suspendidas del cuadro de indicadores y suma de las causas', a: valor(datos, 'indicadores', 'intervenciones_suspendidas'), b: causas, casillas: ['indicadores|intervenciones_suspendidas', 'escrito|suspendidas|_total'] },
  ], 'Cada cirugía suspendida tiene su causa en la hoja SUSPENDIDAS.');

  const i = (clave) => valor(datos, 'indicadores', clave);
  cruce(avisos, 'cruce-indicadores', 'El cuadro de indicadores y el RESUMEN', [
    { que: 'intervenciones programadas', a: i('intervenciones_programadas'), b: p.programadas, casillas: ['indicadores|intervenciones_programadas', 'resumen|mayores.programada', 'resumen|menores.programada'] },
    { que: 'intervenciones de emergencia', a: i('intervenciones_emergencia'), b: p.emergencia, casillas: ['indicadores|intervenciones_emergencia', 'resumen|mayores.emergencia', 'resumen|menores.emergencia'] },
    { que: 'intervenciones realizadas', a: i('intervenciones_realizadas'), b: p.realizadas, casillas: ['indicadores|intervenciones_realizadas', 'resumen|mayores.programada', 'resumen|menores.programada', 'resumen|mayores.emergencia', 'resumen|menores.emergencia'] },
    { que: 'realizadas y programadas más emergencia, en el mismo cuadro', a: i('intervenciones_realizadas'), b: sumar([i('intervenciones_programadas'), i('intervenciones_emergencia')]), casillas: ['indicadores|intervenciones_realizadas', 'indicadores|intervenciones_programadas', 'indicadores|intervenciones_emergencia'] },
    { que: 'horas quirúrgicas efectivas', a: i('horas_efectivas'), b: p.horas.efectivas, decimal: true, casillas: ['indicadores|horas_efectivas', 'resumen|horas_efectivas.programada', 'resumen|horas_efectivas.emergencia'] },
    { que: 'horas quirúrgicas programadas', a: i('horas_programadas'), b: p.horas.programadas, decimal: true, casillas: ['indicadores|horas_programadas', 'resumen|horas_programadas.programada', 'resumen|horas_programadas.emergencia'] },
  ], 'El cuadro de indicadores toma sus cifras del RESUMEN: revise sus fórmulas. Los indicadores del sistema se calculan con el RESUMEN.');

  const salas = i('salas_utilizadas');
  const partes = sumar([i('salas_emergencia'), i('salas_programadas')]);
  if (salas != null && partes != null && salas !== partes) {
    avisos.push({
      id: 'salas', regla: 'salas', nivel: 'aviso', formato: 'indicadores', fila: 'salas_utilizadas', casillas: ['indicadores|salas_utilizadas', 'indicadores|salas_emergencia', 'indicadores|salas_programadas'],
      titulo: `Salas utilizadas: ${formatear(salas)}, pero las de emergencia y las de cirugía programada suman ${formatear(partes)}`,
      detalle: 'El rendimiento de sala divide entre las salas utilizadas. Si una sala se usó para las dos cosas, dígalo.',
    });
  }
}

/* ------------------------------------------------------------------- */

export function validar(datos) {
  const errores = [];
  const avisos = [];
  const info = [];

  for (const h of datos?.lectura ?? []) {
    const nivel = NIVEL_DE_LECTURA[h.regla];
    if (nivel === 'error') errores.push(h);
    else if (nivel === 'aviso') avisos.push(h);
    else if (nivel === 'info') info.push(h);
  }

  validarCasillas(datos, errores, info);
  validarSubtotales(datos, errores);
  validarCruces(datos, avisos);

  return { errores, avisos, info };
}

export function avisosPendientes(validacion, datos) {
  return validacion.avisos.filter((a) => !(datos?.justificaciones?.[a.id] ?? '').trim());
}
