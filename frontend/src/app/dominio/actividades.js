/* Las actividades operativas (AOI) del POI y cómo se llena su ejecución física.

   Planeamiento registra cada mes, en el aplicativo CEPLAN, la ejecución física de
   las actividades operativas que alimentan los oficios de las nueve áreas. Hasta
   ahora la copiaba a mano de cada oficio, y el cuadro de 2026 muestra lo que eso
   produce: metas prorrateadas registradas como si fueran producción, y cifras que
   no cuadran con ningún oficio. Aquí cada actividad dice de dónde sale su cifra,
   y la cifra sale de ahí:

     oficio      del reporte que el área entregó (la fórmula está en el catálogo,
                 `datos/planeamiento/actividades.js`)
     informe     1 por cada mes en que el área entregó su reporte (las
                 actividades de «programación, seguimiento y evaluación»)
     calendario  semanas epidemiológicas o días del mes: no depende de un oficio
     digitar     no está en ningún oficio; la escribe Planeamiento

   Lo que Planeamiento escribe sobre una cifra calculada es un ajuste: manda sobre
   el cálculo, pero exige una nota que diga por qué, y el cálculo sigue a la vista.

   Nada se rellena. Un mes sin reporte entregado es «sin reporte», no 0; un
   prorrateo de la meta (meta ÷ 12) se muestra como referencia, nunca como
   ejecución: no mide producción (decisión del 27/10/2026). */

import { diasDelMes } from './periodos.js';

export const CALCULO = Object.freeze({
  oficio: Object.freeze({ clave: 'oficio', label: 'Del reporte del área', icono: 'sh-doc', tono: 'ok' }),
  informe: Object.freeze({ clave: 'informe', label: 'Un informe por mes', icono: 'sh-calendar', tono: 'ok' }),
  calendario: Object.freeze({ clave: 'calendario', label: 'Calendario', icono: 'sh-calendar', tono: 'info' }),
  digitar: Object.freeze({ clave: 'digitar', label: 'Lo digita Planeamiento', icono: 'sh-pencil', tono: 'neutral' }),
});

/* Cómo quedó la cifra de un mes. Cada uno con su icono: el color no es la única
   señal. */
export const COMO = Object.freeze({
  calculado: Object.freeze({ clave: 'calculado', label: 'Calculado', icono: 'sh-ok', tono: 'ok' }),
  ajustado: Object.freeze({ clave: 'ajustado', label: 'Ajustado por Planeamiento', icono: 'sh-pencil', tono: 'warn' }),
  digitado: Object.freeze({ clave: 'digitado', label: 'Digitado por Planeamiento', icono: 'sh-pencil', tono: 'info' }),
  'sin-reporte': Object.freeze({ clave: 'sin-reporte', label: 'Sin reporte del área', icono: 'sh-none', tono: 'crit' }),
  'sin-dato': Object.freeze({ clave: 'sin-dato', label: 'El reporte no trae la cifra', icono: 'sh-none', tono: 'warn' }),
  pendiente: Object.freeze({ clave: 'pendiente', label: 'Por digitar', icono: 'sh-pencil', tono: 'neutral' }),
});

/* Qué tan firme es la relación entre la actividad y el dato, según la revisión
   del cuadro de 2026 contra los oficios de junio. */
export const NIVEL = Object.freeze({
  directa: Object.freeze({ clave: 'directa', label: 'Directa', tono: 'ok', ayuda: 'El oficio trae el dato tal cual, o la suma de dos líneas suyas.' }),
  verificar: Object.freeze({
    clave: 'verificar',
    label: 'Por verificar',
    tono: 'warn',
    ayuda: 'La relación con el oficio es probable pero no está confirmada: la cifra de CEPLAN no cuadra con el oficio, o el oficio no desagrega la actividad. Confírmela con el área antes de registrarla.',
  }),
});

/* ------------------------------------------------- semanas epidemiológicas

   La semana epidemiológica va de domingo a sábado. La 1 del año es la primera
   que tiene al menos cuatro días en él, así que su sábado cae del 4 de enero en
   adelante; la última termina el sábado anterior a la semana 1 del año
   siguiente, que puede caer en enero. Cada semana se cuenta en el mes de su
   sábado; la que termina a inicios de enero se cuenta en diciembre del año que
   cierra. 2026 tiene 52, y a fines de octubre van 43: lo que dice el cuadro. */

function primerSabadoEpidemiologico(anio) {
  const cuatro = new Date(Date.UTC(anio, 0, 4));
  return new Date(Date.UTC(anio, 0, 4 + ((6 - cuatro.getUTCDay() + 7) % 7)));
}

export function semanasEpidemiologicas(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  const desde = primerSabadoEpidemiologico(anio);
  const hasta = primerSabadoEpidemiologico(anio + 1);
  let cuenta = 0;
  for (let d = new Date(desde); d < hasta; d.setUTCDate(d.getUTCDate() + 7)) {
    const delMes = d.getUTCFullYear() === anio ? d.getUTCMonth() + 1 : 12;
    if (delMes === mes) cuenta += 1;
  }
  return cuenta;
}

const CALENDARIO = Object.freeze({
  semanas: (periodo) => semanasEpidemiologicas(periodo),
  dias: (periodo) => diasDelMes(periodo),
});

/* ------------------------------------------------------------ el mes

   `fuente`: { estado: 'validado' | 'sin-reporte', datos } del reporte del área
   en ese mes (`datos/diresa/fuentes.js::fuenteDeArea`), o null si la actividad no
   depende de un área. `registro`: { valor, nota } que guardó Planeamiento, o
   null. Devuelve { valor, como, calculado, nota }: `calculado` es la cifra que
   da la regla aunque un ajuste mande sobre ella. */

function calculoDe(actividad, fuente, periodo) {
  const { calculo } = actividad;
  if (calculo.tipo === 'calendario') return { valor: CALENDARIO[calculo.unidad](periodo), como: 'calculado' };
  if (calculo.tipo === 'digitar') return { valor: null, como: 'pendiente' };
  if (!fuente || fuente.estado !== 'validado') return { valor: null, como: 'sin-reporte' };
  if (calculo.tipo === 'informe') return { valor: 1, como: 'calculado' };
  const valor = calculo.derivar(fuente.datos, periodo);
  return valor == null ? { valor: null, como: 'sin-dato' } : { valor, como: 'calculado' };
}

export function ejecucionDelMes(actividad, { periodo, fuente = null, registro = null }) {
  const base = calculoDe(actividad, fuente, periodo);
  if (registro && registro.valor != null) {
    const como = actividad.calculo.tipo === 'digitar' ? 'digitado' : 'ajustado';
    return { valor: registro.valor, como, calculado: base.valor, comoCalculado: base.como, nota: registro.nota ?? '' };
  }
  return { valor: base.valor, como: base.como, calculado: base.valor, comoCalculado: base.como, nota: '' };
}

/* Un ajuste a una cifra calculada sin explicar por qué es una cifra que nadie
   puede defender en CEPLAN. Digitar donde no hay cálculo no pide nota: la
   fuente es la propia Planeamiento. */
export function exigeNota(actividad) {
  return actividad.calculo.tipo !== 'digitar';
}

/* --------------------------------------------------------------- el año */

/* Suma lo registrado; null si ningún mes tiene cifra (no es 0: no se midió). */
export function acumulado(valores) {
  const conDato = valores.filter((v) => v != null && Number.isFinite(v));
  return conDato.length ? conDato.reduce((a, b) => a + b, 0) : null;
}

/* Lo que correspondería llevar a esa altura del año si la meta se cumpliera
   pareja, mes a mes. Es una referencia para leer el avance; nunca una cifra
   que se registre. */
export function metaAlMes(meta, mes) {
  return meta == null ? null : (meta * mes) / 12;
}

/* Meta ÷ 12: la referencia que muestran las actividades que en CEPLAN se
   registraban prorrateadas. */
export function prorrateo(meta) {
  return meta == null ? null : meta / 12;
}
