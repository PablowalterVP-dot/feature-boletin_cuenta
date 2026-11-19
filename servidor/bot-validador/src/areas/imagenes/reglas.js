/* Reglas de los cuatro formatos de Diagnóstico por Imágenes.

   Las mismas que el sistema aplicaba al digitar (se movieron aquí el
   27/10/2026 para que el formulario y el bot digan lo mismo), más las que
   solo tienen sentido con el Word: cada total que el oficio escribe se
   compara con la suma de lo que dice sumar.

   `error` impide enviar; `aviso` obliga a mirarlo. Un descuadre o una cifra
   imposible —más pacientes que exámenes— es siempre un error. Una casilla en
   blanco o un importe sin pagados puede tener explicación, y bloquear por eso
   obligaría a inventar un dato.

   Cada descuadre lleva su `evidencia` (el total escrito y sus sumandos, con la
   casilla de cada uno): con eso Dr. Mochi señala las celdas del Word y explica
   la cuenta (correccion.js). Las casillas se nombran por su ruta en los datos:
   `d|f1.examenes.0.examenes.sis.ce` (una cifra) o `e|f1.filas.examenes.0` (un
   total escrito en el Word). */

import { SERVICIOS, FINANCIADORES, CUADROS_ECO } from './definicion.js';
import {
  celda, totalFinanciador, casillasEnBlanco, examenesDeFila, filaTieneCifras, totalesCuadro,
  examenesF1, examenesF2, examenesF3, examenesF4, totalPersonas,
} from './calculos.js';

export const REGLAS = Object.freeze([
  { id: 'formato-vacio', nivel: 'error', texto: 'Las cuatro hojas tienen exámenes registrados (si no hubo, 0)' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda celda de cifras del oficio es un número' },
  { id: 'nombre', nivel: 'error', texto: 'Ecografía: toda fila con cifras tiene su profesional' },
  { id: 'pacientes', nivel: 'error', texto: 'Cada hoja tiene sus pacientes y no hay más pacientes que exámenes' },
  { id: 'totales', nivel: 'error', texto: 'Los totales que escribe el oficio cuadran con lo que suman (EXAM de cada médico, fila T O T A L, TOTAL EXAMENES, exámenes atendidos)' },
  { id: 'tecnologos', nivel: 'error', texto: 'Rayos X: los exámenes por tecnólogo suman los exámenes atendidos' },
  { id: 'informes', nivel: 'error', texto: 'Las lecturas e informes no superan a los exámenes' },
  { id: 'particulares', nivel: 'error', texto: 'Rayos X: los particulares no superan al total de pacientes' },
  { id: 'motivo', nivel: 'error', texto: 'Tomografía: si el equipo estuvo inoperativo, consta el motivo' },
  { id: 'blancos', nivel: 'aviso', texto: 'No hay casillas en blanco en las matrices (si fue cero, se escribe 0)' },
  { id: 'sin-registrar', nivel: 'aviso', texto: 'Ecografía: cada profesional de la hoja tiene sus cifras' },
  { id: 'importe', nivel: 'aviso', texto: 'Los montos en soles se corresponden con los exámenes pagados o particulares' },
  { id: 'montos', nivel: 'aviso', texto: 'Los totales en soles que escribe el oficio cuadran con la suma de los montos' },
  { id: 'inoperativo', nivel: 'aviso', texto: 'Tomografía: el estado del equipo y los exámenes no se contradicen' },
  { id: 'placas', nivel: 'aviso', texto: 'Rayos X: se registró el número de placas radiográficas' },
  { id: 'cuadro-ausente', nivel: 'aviso', texto: 'El oficio trae todas sus tablas' },
  { id: 'sin-mes', nivel: 'aviso', texto: 'El oficio dice de qué mes es' },
]);

const NIVEL_DE_LECTURA = Object.freeze({ 'cuadro-ausente': 'aviso', 'sin-mes': 'aviso' });

const numero = (n, decimales = 0) => (n == null ? 'sin registrar' : n.toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }));
const soles = (n) => (n == null ? 'sin registrar' : `S/ ${numero(n, 2)}`);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const NOMBRE_FIN = Object.fromEntries(FINANCIADORES.map((f) => [f.clave, f.label]));
const NOMBRE_SERV = Object.fromEntries(SERVICIOS.map((s) => [s.clave, s.corto]));
const MATRIZ = FINANCIADORES.flatMap((f) => SERVICIOS.map((s) => [f.clave, s.clave]));

function importeIncoherente({ monto, cobrados }) {
  return (monto ?? 0) > 0 ? !cobrados : (cobrados ?? 0) > 0 && !monto;
}

/* Los nueve sumandos de una matriz, con su casilla. */
const sumandosMatriz = (ruta, matriz, prefijo = '') =>
  MATRIZ.map(([f, s]) => ({ casilla: `d|${ruta}.${f}.${s}`, etiqueta: `${prefijo}${NOMBRE_FIN[f]} ${NOMBRE_SERV[s]}`, valor: celda(matriz, f, s) ?? 0 }));

function evidencia(total, sumandos) {
  const suma = sumandos.reduce((a, s) => a + (s.valor ?? 0), 0);
  return { total, sumandos, suma, diferencia: total.valor - suma };
}

export function validar(datosRecibidos) {
  const datos = datosRecibidos ?? {};
  const { f1 = {}, f2 = {}, f3 = {}, f4 = {} } = datos;
  const escritos = datos.escritos ?? {};
  const errores = [];
  const avisos = [];
  const info = [];
  const agregar = (nivel, id, regla, formato, titulo, detalle, extra = {}) => {
    const h = { id, regla, formato, titulo, detalle, ...extra };
    (nivel === 'error' ? errores : nivel === 'aviso' ? avisos : info).push(h);
  };

  for (const h of datos.lectura ?? []) {
    if (NIVEL_DE_LECTURA[h.regla] === 'aviso') avisos.push({ ...h, nivel: 'aviso' });
    else info.push(h);
  }

  for (const [casilla, texto] of Object.entries(datos.ilegibles ?? {})) {
    const ruta = casilla.replace(/^d\|/, '');
    agregar('error', `ilegible|${ruta}`, 'no-numerico', ruta.slice(0, 2), `«${texto}» no es un número`, `En ${ruta.replace(/\./g, ' · ')}. Escriba la cifra (un importe, como S/ 150.00); si no hubo nada, 0.`, { fila: ruta });
  }

  /* ---------------------------------------------- Formato 1 · ecografía */
  const filas = CUADROS_ECO.flatMap((c) => (f1[c.clave] ?? []).map((f, i) => ({ ...f, cuadro: c.clave, titulo: c.titulo, i })));
  const rotulo = (f) => `${f.nombre?.trim() || 'Fila sin nombre'} (${f.titulo.toLowerCase()})`;

  if (examenesF1(f1) == null) {
    agregar('error', 'f1-vacio', 'formato-vacio', 'f1', 'La hoja de ecografía no tiene exámenes registrados', 'Si en el mes no se hizo ninguna ecografía, escriba 0: una hoja vacía no distingue un mes sin exámenes de un formato sin llenar.');
  }
  const sinNombre = filas.filter((f) => filaTieneCifras(f) && !f.nombre?.trim());
  if (sinNombre.length) {
    agregar('error', 'f1-nombre', 'nombre', 'f1', `${plural(sinNombre.length, 'fila tiene', 'filas tienen')} cifras sin profesional`, 'Cada fila de ecografía corresponde a un médico: sin su nombre, la productividad no se puede atribuir.');
  }

  /* La columna EXAM de cada médico, contra sus nueve casillas. */
  for (const f of filas) {
    const exam = escritos.f1?.filas?.[f.cuadro]?.[f.i];
    const suma = examenesDeFila(f) ?? 0;
    if (exam == null || exam === suma) continue;
    agregar(
      'error', `f1-exam|${f.cuadro}.${f.i}`, 'totales', 'f1',
      `${rotulo(f)}: la columna EXAM dice ${numero(exam)} y sus casillas suman ${numero(suma)}`,
      `${numero(Math.abs(exam - suma))} ${exam > suma ? 'de más' : 'de menos'}. EXAM es la suma de SIS, convenios y pagados de la fila: o EXAM está mal, o falta (o sobra) una cifra en esas casillas.`,
      { evidencia: evidencia({ casilla: `e|f1.filas.${f.cuadro}.${f.i}`, etiqueta: `EXAM · ${f.nombre}`, valor: exam }, sumandosMatriz(`f1.${f.cuadro}.${f.i}.examenes`, f.examenes)) },
    );
  }

  /* La fila T O T A L, contra la suma de los médicos (sin biopsias ni procedimientos). */
  const total = escritos.f1?.total;
  if (total) {
    const medicos = (f1.examenes ?? []).map((f, i) => ({ ...f, i }));
    /* La EXAM de la fila T O T A L se compara con las EXAM que el Word escribe
       para cada médico: si una EXAM no cuadra con sus casillas, eso ya es su
       propio error, y aquí solo interesa si la fila T O T A L suma bien. */
    const examEscrita = (f) => escritos.f1?.filas?.examenes?.[f.i];
    const columnas = [
      ['exam', 'EXAM', total.exam, medicos.map((f) => (examEscrita(f) != null
        ? { casilla: `e|f1.filas.examenes.${f.i}`, etiqueta: f.nombre, valor: examEscrita(f) }
        : { casilla: null, etiqueta: f.nombre, valor: examenesDeFila(f) ?? 0, calculado: true }))],
      ['pacientes', 'TOTAL PCTS', total.pacientes, medicos.map((f) => ({ casilla: `d|f1.examenes.${f.i}.pacientes`, etiqueta: f.nombre, valor: f.pacientes ?? 0 }))],
      ...MATRIZ.map(([fz, s]) => [`examenes.${fz}.${s}`, `${NOMBRE_FIN[fz]} ${NOMBRE_SERV[s]}`, total.examenes?.[fz]?.[s], medicos.map((f) => ({ casilla: `d|f1.examenes.${f.i}.examenes.${fz}.${s}`, etiqueta: f.nombre, valor: celda(f.examenes, fz, s) ?? 0 }))]),
    ];
    const malas = columnas.filter(([, , declarado, sumandos]) => declarado != null && declarado !== sumandos.reduce((a, x) => a + x.valor, 0));
    for (const [clave, nombre, declarado, sumandos] of malas) {
      const suma = sumandos.reduce((a, x) => a + x.valor, 0);
      agregar(
        'error', `f1-total|${clave}`, 'totales', 'f1',
        `Ecografía, fila T O T A L · ${nombre}: dice ${numero(declarado)} y los médicos suman ${numero(suma)}`,
        `${numero(Math.abs(declarado - suma))} ${declarado > suma ? 'de más' : 'de menos'}. ${medicos.length > 4 && malas.length > 3 ? 'Varias columnas no cuadran a la vez: puede que la fila T O T A L no se actualizara al agregar un médico.' : 'Corrija la fila T O T A L o la cifra del médico que esté mal.'}`,
        { evidencia: evidencia({ casilla: `e|f1.total.${clave}`, etiqueta: `T O T A L · ${nombre}`, valor: declarado }, sumandos) },
      );
    }
    const montos = totalesCuadro(f1.examenes).monto;
    if ((total.monto != null || total.montoTexto) && total.monto !== montos) {
      agregar('aviso', 'f1-montos', 'montos', 'f1', `Ecografía: el total en soles dice ${total.montoTexto ? `«${total.montoTexto}»` : soles(total.monto)} y los montos de los médicos suman ${soles(montos)}`, 'El total en soles no se usa como dato (se suman los montos de cada médico), pero el oficio impreso queda mal. Corríjalo en el Word.');
    }
  }

  const malPacientes = filas.filter((f) => {
    const e = examenesDeFila(f);
    return e != null && (f.pacientes == null || f.pacientes > e);
  });
  if (malPacientes.length) {
    agregar('error', 'f1-pacientes', 'pacientes', 'f1', `Pacientes sin registrar o mayores que los exámenes en ${plural(malPacientes.length, 'fila', 'filas')}`, `${malPacientes.map((f) => `${rotulo(f)}: ${numero(f.pacientes)} pacientes y ${numero(examenesDeFila(f))} exámenes`).join('; ')}. Cada paciente tiene al menos un examen, así que no puede haber más pacientes que exámenes.`, { fila: malPacientes[0] ? `f1.${malPacientes[0].cuadro}.${malPacientes[0].i}.pacientes` : undefined });
  }
  const sinRegistrar = filas.filter((f) => f.nombre?.trim() && !filaTieneCifras(f));
  if (sinRegistrar.length) {
    agregar('aviso', 'f1-sin-registrar', 'sin-registrar', 'f1', `${plural(sinRegistrar.length, 'profesional', 'profesionales')} sin cifras`, `${sinRegistrar.map(rotulo).join(', ')}. Si no atendieron este mes, quite la fila; si atendieron, faltan sus exámenes.`);
  }
  const blancos = filas.reduce((n, f) => n + casillasEnBlanco(f.examenes), 0);
  if (blancos) {
    agregar('aviso', 'f1-blancos', 'blancos', 'f1', `${plural(blancos, 'casilla en blanco', 'casillas en blanco')} en ecografía`, 'Se suman como si fueran cero. Si el valor es cero, conviene escribirlo: una casilla vacía también puede ser un olvido.');
  }
  const importes = filas.filter((f) => importeIncoherente({ monto: f.monto, cobrados: totalFinanciador(f.examenes, 'pagado') }));
  if (importes.length) {
    agregar('aviso', 'f1-importe', 'importe', 'f1', `Monto y exámenes pagados no se corresponden en ${plural(importes.length, 'fila', 'filas')}`, `${importes.map(rotulo).join(', ')}. Hay monto sin exámenes pagados, o exámenes pagados sin monto. Si el importe es de convenios, puede ser correcto.`);
  }

  /* -------------------------------------- Formatos 2 y 3 · tomografía y mamografía */
  const financiado = (id, nombre, d, examenes, conCampana) => {
    if (examenes == null) {
      agregar('error', `${id}-vacio`, 'formato-vacio', id, `La hoja de ${nombre} no tiene exámenes registrados`, 'Si no hubo exámenes, escriba 0 en el cuadro: una hoja vacía no distingue un mes sin exámenes de un formato sin llenar.');
      return;
    }
    const declarado = escritos[id]?.total;
    if (declarado != null && declarado !== examenes) {
      const sumandos = [...sumandosMatriz(`${id}.examenes`, d.examenes), ...(conCampana ? [{ casilla: `d|${id}.campana`, etiqueta: d.campanaRotulo || 'Campaña', valor: d.campana ?? 0 }] : [])];
      agregar(
        'error', `${id}-total`, 'totales', id,
        `${nombre[0].toUpperCase()}${nombre.slice(1)}: TOTAL EXAMENES dice ${numero(declarado)} y el cuadro suma ${numero(examenes)}`,
        `${numero(Math.abs(declarado - examenes))} ${declarado > examenes ? 'de más' : 'de menos'}. El total es la suma de SIS, convenios y pagados${conCampana ? ', más la campaña' : ''}.`,
        { evidencia: evidencia({ casilla: `e|${id}.total`, etiqueta: 'TOTAL EXAMENES', valor: declarado }, sumandos) },
      );
    }
    if (d.pacientes == null || d.pacientes > examenes) {
      agregar('error', `${id}-pacientes`, 'pacientes', id, d.pacientes == null ? `Falta el total de pacientes de ${nombre}` : `En ${nombre} hay más pacientes que exámenes`, `Exámenes: ${numero(examenes)}. Pacientes: ${numero(d.pacientes)}. Cada paciente tiene al menos un examen.`, { fila: `${id}.pacientes` });
    }
    const informes = totalPersonas(d.informes);
    if (informes != null && informes > examenes) {
      agregar('error', `${id}-informes`, 'informes', id, `Se informaron más ${nombre === 'tomografía' ? 'tomografías' : 'mamografías'} de las que se hicieron`, `Informes: ${numero(informes)}. Exámenes: ${numero(examenes)}.`);
    }
    const blancosM = casillasEnBlanco(d.examenes);
    if (blancosM) {
      agregar('aviso', `${id}-blancos`, 'blancos', id, `${plural(blancosM, 'casilla en blanco', 'casillas en blanco')} en ${nombre}`, 'Se suman como si fueran cero. Si el valor es cero, conviene escribirlo: una casilla vacía también puede ser un olvido.', { casillas: MATRIZ.filter(([f, s]) => celda(d.examenes, f, s) == null).map(([f, s]) => `${id}.examenes.${f}.${s}`) });
    }
    if (importeIncoherente({ monto: d.monto, cobrados: totalFinanciador(d.examenes, 'pagado') })) {
      agregar('aviso', `${id}-importe`, 'importe', id, `El monto de ${nombre} no se corresponde con los exámenes pagados`, `Monto: ${soles(d.monto)}. Exámenes pagados: ${numero(totalFinanciador(d.examenes, 'pagado') ?? 0)}. Si el importe es de convenios o de la campaña, puede ser correcto; conviene confirmarlo.`);
    }
  };

  const e2 = examenesF2(f2);
  if (f2.inoperativo && !f2.nota?.trim()) {
    agregar('error', 'f2-motivo', 'motivo', 'f2', 'Falta el motivo del tomógrafo inoperativo', 'El oficio lo deja escrito como nota. Sin ella, un mes en cero no se distingue de un mes sin demanda.');
  }
  financiado('f2', 'tomografía', f2, e2, false);
  if (f2.inoperativo && (e2 ?? 0) > 0) {
    agregar('aviso', 'f2-inoperativo', 'inoperativo', 'f2', 'El tomógrafo figura inoperativo, pero hay exámenes', `${numero(e2)} exámenes. Puede haber estado inoperativo solo parte del mes; conviene decirlo en la nota.`);
  }
  if (!f2.inoperativo && e2 === 0) {
    agregar('aviso', 'f2-sin-examenes', 'inoperativo', 'f2', 'Cero tomografías con el tomógrafo operativo', 'Si el equipo no funcionó, márquelo como inoperativo y anote el motivo.');
  }
  financiado('f3', 'mamografía', f3, examenesF3(f3), true);

  /* ------------------------------------------------- Formato 4 · Rayos X */
  const e4 = examenesF4(f4);
  if (e4 == null) {
    agregar('error', 'f4-vacio', 'formato-vacio', 'f4', 'La hoja de Rayos X no tiene exámenes registrados', 'Registre los exámenes de hospitalización, emergencia y consulta externa. Si no hubo, escriba 0.');
  } else {
    const atendidos = escritos.f4?.atendidos;
    if (atendidos != null && atendidos !== e4) {
      agregar(
        'error', 'f4-atendidos', 'totales', 'f4',
        `Rayos X: EXAMENES ATENDIDOS dice ${numero(atendidos)} y los servicios suman ${numero(e4)}`,
        `${numero(Math.abs(atendidos - e4))} ${atendidos > e4 ? 'de más' : 'de menos'}. Los atendidos son hospitalización + emergencia + consulta externa.`,
        { evidencia: evidencia({ casilla: 'e|f4.atendidos', etiqueta: 'EXAMENES ATENDIDOS', valor: atendidos }, SERVICIOS.map((s) => ({ casilla: `d|f4.examenes.${s.clave}`, etiqueta: s.label, valor: f4.examenes?.[s.clave] ?? 0 }))) },
      );
    }
    if (f4.pacientes == null || f4.pacientes > e4) {
      agregar('error', 'f4-pacientes', 'pacientes', 'f4', f4.pacientes == null ? 'Falta el total de pacientes de Rayos X' : 'En Rayos X hay más pacientes que exámenes', `Exámenes atendidos: ${numero(e4)}. Pacientes: ${numero(f4.pacientes)}.`, { fila: 'f4.pacientes' });
    }
    const porTecnologo = totalPersonas(f4.tecnologos);
    if (porTecnologo !== e4) {
      agregar(
        'error', 'f4-tecnologos', 'tecnologos', 'f4',
        'Los exámenes por tecnólogo no suman los exámenes atendidos',
        `Por servicio suman ${numero(e4)}; por tecnólogo, ${porTecnologo == null ? 'nada registrado' : numero(porTecnologo)}. Los dos cuadros cuentan los mismos exámenes, así que uno de los dos está mal.`,
        {
          /* El total de referencia son los servicios (cuadran con EXAMENES
             ATENDIDOS): la diferencia está en las filas de tecnólogos. */
          evidencia: evidencia(
            { casilla: null, etiqueta: 'Exámenes atendidos (por servicio)', valor: e4, calculado: true },
            (f4.tecnologos ?? []).map((t, i) => ({ casilla: `d|f4.tecnologos.${i}.cantidad`, etiqueta: t.nombre, valor: t.cantidad ?? 0 })),
          ),
        },
      );
    }
    const informes = totalPersonas(f4.informes);
    if (informes != null && informes > e4) {
      agregar('error', 'f4-informes', 'informes', 'f4', 'Se informaron más radiografías de las que se hicieron', `Informes: ${numero(informes)}. Exámenes: ${numero(e4)}.`);
    }
    if (SERVICIOS.some((s) => f4.examenes?.[s.clave] == null)) {
      agregar('aviso', 'f4-servicios-blancos', 'blancos', 'f4', 'Hay un servicio sin exámenes registrados en Rayos X', 'Se suma como cero. Si fue cero, conviene escribirlo.', { casillas: SERVICIOS.filter((s) => f4.examenes?.[s.clave] == null).map((s) => `f4.examenes.${s.clave}`) });
    }
  }
  if (f4.particulares != null && f4.pacientes != null && f4.particulares > f4.pacientes) {
    agregar('error', 'f4-particulares', 'particulares', 'f4', 'Hay más pacientes particulares que pacientes', `Particulares: ${numero(f4.particulares)}. Pacientes: ${numero(f4.pacientes)}.`, { fila: 'f4.particulares' });
  }
  if (importeIncoherente({ monto: f4.monto, cobrados: f4.particulares })) {
    agregar('aviso', 'f4-importe', 'importe', 'f4', 'El monto de Rayos X no se corresponde con los pacientes particulares', `Monto: ${soles(f4.monto)}. Particulares: ${numero(f4.particulares)}. Hay monto sin particulares, o particulares sin monto.`);
  }
  if (e4 != null && f4.placas == null) {
    agregar('aviso', 'f4-placas', 'placas', 'f4', 'No se registró el número de placas radiográficas', 'Si no se usaron placas, escriba 0.', { casillas: ['f4.placas'] });
  }

  return { errores, avisos, info };
}
