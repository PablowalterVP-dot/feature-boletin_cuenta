/* Indicadores de desempeño: cómo se leen y cómo se dicen las cifras del tablero.

   El cálculo vive en el servidor (servidor/api/app/dominio/desempeno/): aquí no
   se decide quién suma ni qué mes está consolidado. Lo que llega de
   /api/desempeno son números, fechas y estados; este archivo los convierte en
   las frases y las etiquetas de la pantalla. Así el titular del catálogo
   («1 de 34 fichas tiene resultado…») dice siempre lo que hay en la base y
   ninguna pantalla escribe una cifra a mano.

   Las fracciones llegan entre 0 y 1 (0.0731 es 7,3 %) y son null sin
   denominador: entonces el texto es «Sin datos», nunca 0 %. */

import { numero, porcentaje, fechaCorta, SIN_DATOS, SIN_META } from './formato.js';
import { etiquetaPeriodo } from './periodos.js';

/* ------------------------------------------------------------------ cifras */

/* «7,3 %» de una fracción. */
export function fraccion(valor, decimales = 1) {
  return valor == null ? SIN_DATOS : `${numero(valor * 100, decimales)} %`;
}

/* La meta, que puede no estar registrada: entonces no es meta 0. */
export function textoMeta(meta) {
  return meta == null ? SIN_META : fraccion(meta, 0);
}

/* «6 de 82» y su porcentaje, de una cifra {numerador, denominador}. */
export function cifra(c) {
  if (!c) return { texto: SIN_DATOS, detalle: 'Sin casos en el periodo.' };
  const p = porcentaje(c.numerador, c.denominador);
  return { texto: p.texto, detalle: `${numero(c.numerador)} de ${numero(c.denominador)}`, explicacion: p.explicacion };
}

/* Diferencia frente a la meta en puntos porcentuales: «−62,7 pp». */
export function puntos(diferencia) {
  if (diferencia == null) return SIN_DATOS;
  const signo = diferencia > 0 ? '+' : diferencia < 0 ? '−' : '';
  return `${signo}${numero(Math.abs(diferencia * 100), 1)} pp`;
}

/* «Septiembre», «septiembre de 2026», «21/10». */
export const nombreMes = (anio, mes) => etiquetaPeriodo(`${anio}-${String(mes).padStart(2, '0')}`).split(' ')[0];
export const mesMinuscula = (anio, mes) => nombreMes(anio, mes).toLowerCase();
export const diaMes = (iso) => (iso ? fechaCorta(iso).slice(0, 5) : SIN_DATOS);

export function plural(n, uno, varios) {
  return `${numero(n)} ${n === 1 ? uno : varios}`;
}

/* --------------------------------------------------------- estados y textos */

/* Lo que se ve de una ficha en el catálogo. */
export const RESULTADO = Object.freeze({
  cumple: { etiqueta: 'Cumple la meta', tono: 'ok' },
  bajo: { etiqueta: 'Bajo la meta', tono: 'crit' },
  sin_meta: { etiqueta: 'Meta no definida', tono: 'none' },
  sin_resultado: { etiqueta: 'Sin resultado', tono: 'none' },
  no_aplica: { etiqueta: 'No aplica', tono: 'none' },
});

export function resultadoDe({ ficha, resultado }) {
  if (!ficha.aplica) return 'no_aplica';
  const { cumple } = frenteAMeta(acumuladoVigente(resultado), resultado?.meta);
  if (!acumuladoVigente(resultado)) return 'sin_resultado';
  if (cumple == null) return 'sin_meta';
  return cumple ? 'cumple' : 'bajo';
}

/* Si se pueden obtener sus datos (`ficha.datos`, del servidor). */
export const DATOS = Object.freeze({
  completo: { etiqueta: 'Datos completos', tono: 'ok', ayuda: 'Todas sus fuentes ya se cargan en el sistema.' },
  parcial: { etiqueta: 'Faltan fuentes', tono: 'warn', ayuda: 'Algunas de sus fuentes todavía no se pueden cargar: mientras falten, la ficha no calcula.' },
  sin_fuente: { etiqueta: 'Sin fuente', tono: 'crit', ayuda: 'Ninguna de sus fuentes se puede cargar todavía.' },
  no_aplica: { etiqueta: 'No aplica', tono: 'none', ayuda: 'El indicador no se evalúa en este hospital.' },
});

/* El estado de un mes del resultado. */
export const ESTADO_MES = Object.freeze({
  oficial: { etiqueta: 'Oficial', tono: 'ok', ayuda: 'Calculado con el corte de un reporte de MINSA: es la cifra que MINSA usó.' },
  consolidado: { etiqueta: 'Consolidado', tono: 'info', ayuda: 'Sus datos se cargaron después del cierre de la corrección del HIS: ya no cambia.' },
  por_cerrar: { etiqueta: 'Por cerrar', tono: 'warn', ayuda: 'Faltan datos de los días siguientes: hasta tenerlos puede aparecer un tratamiento o una exclusión, y sus cifras pueden cambiar.' },
  preliminar: { etiqueta: 'Preliminar', tono: 'warn', ayuda: 'El HIS de este mes todavía se puede corregir: la cifra puede cambiar hasta su cierre.' },
});

/* Un mes abierto todavía puede cambiar: no entra al logro del año. */
export const mesAbierto = (m) => m.estado === 'preliminar' || m.estado === 'por_cerrar';

/* Qué le falta a un mes para cerrarse, con la fecha que calculó el servidor. */
export function textoFalta(m) {
  if (!m.falta_hasta) return null;
  const [anio, mes] = m.falta_hasta.split('-').map(Number);
  return `Se cierra al subir la trama de ${mesMinuscula(anio, mes)} con datos hasta el ${diaMes(m.falta_hasta)}.`;
}

/* Cada caso del denominador, hoy, con los colores de estado del sistema: verde
   suma, azul se trató pero falta corregir el registro, ámbar todavía se puede
   tratar, gris no se sabe todavía (faltan tramas) y rojo ya venció. El color
   acompaña a la etiqueta, nunca va solo. */
export const CLASES = Object.freeze([
  { clave: 'a_tiempo', tono: 'ok', etiqueta: 'A tiempo', color: 'var(--success)', ayuda: 'Iniciaron tratamiento dentro del plazo: suman.' },
  { clave: 'por_corregir', tono: 'info', etiqueta: 'Tratado, registro por corregir', color: 'var(--info)', ayuda: 'Se trataron, pero el registro en el HIS no cumple la regla y no suman. Se pueden corregir mientras el HIS de ese mes esté abierto.' },
  { clave: 'plazo_vigente', tono: 'warn', etiqueta: 'Sin tratamiento, aún puede sumar', color: 'var(--warning)', ayuda: 'Todavía sin tratamiento, pero el plazo no ha vencido: aún pueden sumar.' },
  { clave: 'esperando_datos', tono: 'none', etiqueta: 'Esperando datos', color: 'var(--neutral-text)', ayuda: 'Sin tratamiento registrado y con el plazo ya pasado, pero los datos cargados no llegan hasta su vencimiento: su tratamiento puede estar en una trama que falta subir. Todavía no se puede decir que no se trató.' },
  { clave: 'sin_tratamiento', tono: 'crit', etiqueta: 'Sin tratamiento, plazo vencido', color: 'var(--destructive)', ayuda: 'Sin tratamiento registrado y con el plazo vencido: ya no suman.' },
]);

/* El estado de una fuente en un mes (Carga de datos). */
export const ESTADO_CARGA = Object.freeze({
  cierre: { etiqueta: 'Cerrado', corto: '✓', tono: 'ok', ayuda: 'Se cargó después del cierre de la corrección del HIS: es definitivo.' },
  preliminar: { etiqueta: 'Preliminar', corto: 'P', tono: 'warn', ayuda: 'Se cargó con la corrección del HIS todavía abierta: hay que volver a cargarlo después del cierre.' },
  recargar: { etiqueta: 'Recargar', corto: 'R', tono: 'crit', ayuda: 'Se cargó antes del cierre y el cierre ya pasó: cargue la versión final.' },
  sin_fecha: { etiqueta: 'Sin fecha', corto: '?', tono: 'warn', ayuda: 'No se sabe cuándo se descargó el archivo: no se puede decir si está cerrado.' },
  falta: { etiqueta: 'Falta', corto: 'Falta', tono: 'crit', ayuda: 'El mes ya terminó y no tiene datos. No cuenta como cero.' },
  futuro: { etiqueta: 'En curso', corto: '—', tono: 'none', ayuda: 'El mes todavía no termina.' },
});

/* Prioridad de un caso con plazo vigente. Siete días es el mismo umbral con
   que el servidor cuenta «vencen pronto» (dominio/desempeno/tablero.py,
   URGENTE_DIAS): si cambia allá, cambia aquí. */
export const URGENTE_DIAS = 7;

export function prioridad(dias) {
  if (dias <= URGENTE_DIAS) return { etiqueta: 'Urgente', tono: 'crit' };
  if (dias <= 2 * URGENTE_DIAS) return { etiqueta: 'Pronto', tono: 'warn' };
  return { etiqueta: 'A tiempo', tono: 'none' };
}

/* -------------------------------------------------------------- resultado */

/* El acumulado del año con todo lo cargado, también los meses que todavía
   pueden cambiar: el monitoreo mira lo que hay hoy, no solo lo cerrado.
   `preliminar` dice si incluye algún mes abierto. Null si no hay nada calculado. */
export function acumuladoVigente(resultado) {
  const ultimo = resultado?.meses.at(-1);
  return ultimo ? { ...ultimo.acumulado, mes: ultimo.mes, preliminar: resultado.meses.some(mesAbierto) } : null;
}

/* El acumulado de cada mes cargado, de enero en adelante: la tendencia. */
export const serieDe = (resultado) => resultado?.meses.map((m) => m.acumulado.porcentaje) ?? [];

/* El acumulado que se muestra: el de todo lo cargado o, si se elige un mes, el
   de enero a ese mes. `preliminar` dice si alguno de esos meses todavía puede
   cambiar. */
export function acumuladoHasta(resultado, mes) {
  if (!resultado) return null;
  if (mes == null) return acumuladoVigente(resultado);
  const delMes = resultado.meses.find((m) => m.mes === mes);
  if (!delMes) return null;
  const preliminar = resultado.meses.some((m) => m.mes <= mes && mesAbierto(m));
  return { ...delMes.acumulado, mes, preliminar };
}

/* El resultado frente a la meta, de un acumulado. */
export function frenteAMeta(acumulado, meta) {
  if (!acumulado || acumulado.porcentaje == null || meta == null) return { diferencia: null, cumplimiento: null, cumple: null };
  return { diferencia: acumulado.porcentaje - meta, cumplimiento: acumulado.porcentaje / meta, cumple: acumulado.porcentaje >= meta };
}

/* Los meses que tienen resultado en algún indicador del año: los que se pueden elegir. */
export function mesesConResultado(fichas) {
  return [...new Set(fichas.flatMap((f) => f.resultado?.meses.map((m) => m.mes) ?? []))].sort((a, b) => a - b);
}

/* ----------------------------------------------------------------- catálogo */

export const FILTROS = Object.freeze([
  { valor: 'todas', etiqueta: 'Todas', cumple: () => true },
  { valor: 'con', etiqueta: 'Con resultado', cumple: (f) => Boolean(acumuladoVigente(f.resultado)) },
  { valor: 'bajo', etiqueta: 'Bajo la meta', cumple: (f) => resultadoDe(f) === 'bajo' },
  { valor: 'gestionar', etiqueta: 'Por gestionar', cumple: (f) => (f.resultado?.por_gestionar.total ?? 0) > 0 },
  { valor: 'faltan', etiqueta: 'Faltan fuentes', cumple: (f) => ['parcial', 'sin_fuente'].includes(f.ficha.datos) },
]);

export function buscar(texto) {
  const q = texto.trim().toLowerCase();
  if (!q) return () => true;
  return ({ ficha }) => `ficha ${String(ficha.numero).padStart(2, '0')} ${ficha.numero} ${ficha.nombre_corto ?? ''} ${ficha.nombre}`.toLowerCase().includes(q);
}

/* Lo que todavía puede sumar en todo el año, y hasta cuándo (el cierre más próximo). */
export function porGestionarDelAnio(fichas) {
  const conCasos = fichas.filter((f) => (f.resultado?.por_gestionar.total ?? 0) > 0);
  const total = conCasos.reduce((s, f) => s + f.resultado.por_gestionar.total, 0);
  const cierres = conCasos.map((f) => f.resultado.proximo_cierre).filter(Boolean).sort();
  return { total, cierre: cierres[0] ?? null, vencenPronto: conCasos.reduce((s, f) => s + f.resultado.por_gestionar.vencen_pronto, 0) };
}

/* El titular del catálogo, armado con lo que hay en la base. Con una sola ficha
   calculada se la nombra; con varias, se dice cuántas están bajo su meta. */
export function titular(fichas) {
  const conResultado = fichas.filter((f) => acumuladoVigente(f.resultado));
  const total = fichas.length;
  if (!conResultado.length) return `Ninguna de las ${total} fichas tiene resultado todavía.`;
  const gestion = porGestionarDelAnio(fichas);
  const cola = gestion.total
    ? `; ${plural(gestion.total, 'caso aún puede sumar', 'casos aún pueden sumar')}${gestion.cierre ? ` antes del ${diaMes(gestion.cierre)}` : ''}.`
    : '.';
  if (conResultado.length === 1) {
    const [f] = conResultado;
    const nombre = f.ficha.nombre_corto ?? f.ficha.nombre;
    const acc = acumuladoVigente(f.resultado);
    /* Con meses sin cerrar se dice: la cifra cuenta lo cargado y puede cambiar. */
    const abierto = acc.preliminar ? ', con meses sin cerrar' : '';
    return `1 de ${total} fichas tiene resultado. ${nombre} está en ${fraccion(acc.porcentaje)} frente a una meta de ${textoMeta(f.resultado.meta)}${abierto}${cola}`;
  }
  const bajo = conResultado.filter((f) => resultadoDe(f) === 'bajo').length;
  return `${conResultado.length} de ${total} fichas tienen resultado y ${plural(bajo, 'está', 'están')} bajo la meta${cola}`;
}

/* Los nombres de las fuentes, separados con «·»: alguno lleva coma por dentro
   («SINADEF nacional, verificado a mano») y con comas no se sabría dónde acaba. */
const listaDeFuentes = (nombres) => nombres.join(' · ');

/* La bajada: hasta qué mes es definitivo y de dónde salen los datos. */
export function bajada(resumen) {
  const conResultado = resumen.fichas.filter((f) => acumuladoVigente(f.resultado));
  if (!conResultado.length) return `Año ${resumen.anio}. Las fichas calculan cuando sus fuentes están cargadas.`;
  const hasta = Math.min(...conResultado.map((f) => f.resultado.consolidado_hasta));
  const cargado = Math.max(...conResultado.map((f) => acumuladoVigente(f.resultado).mes));
  const fuentes = [...new Set(conResultado.flatMap((f) => f.ficha.fuentes.filter((x) => x.cargable).map((x) => x.nombre)))];
  const datos = resumen.datos_al ? ` Datos del HIS al ${fechaCorta(resumen.datos_al)}.` : '';
  const cerrado = hasta >= cargado ? 'todo cerrado' : hasta ? `cerrado hasta ${mesMinuscula(resumen.anio, hasta)}` : 'ningún mes cerrado todavía';
  return `Acumulado de enero a ${mesMinuscula(resumen.anio, cargado)} de ${resumen.anio} con todo lo cargado; ${cerrado}.${datos} Fuentes: ${listaDeFuentes(fuentes)}.`;
}

/* La ventana de corrección del HIS, en una frase. */
export function textoVentana(ventana, hoy) {
  if (!ventana) return null;
  const mes = mesMinuscula(ventana.anio, ventana.mes);
  if (ventana.abierta) {
    const dias = Math.round((Date.parse(`${ventana.cierre}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
    return `Corrección del HIS de ${mes}: abierta hasta el ${diaMes(ventana.cierre)} (${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}).`;
  }
  return `Corrección del HIS de ${mes}: del ${diaMes(ventana.apertura)} al ${diaMes(ventana.cierre)}.`;
}

/* ------------------------------------------------------------------- ficha */

/* El titular de una ficha: dónde está el acumulado frente a la meta y qué
   todavía puede cambiarlo. */
export function titularDeFicha({ ficha, resultado }) {
  const nombre = ficha.nombre_corto ?? ficha.nombre;
  if (!ficha.aplica) return `${nombre}: no se evalúa en este hospital.`;
  const acc = acumuladoVigente(resultado);
  if (!acc) return `${nombre}: sin resultado todavía.`;
  const { cumple } = frenteAMeta(acc, resultado.meta);
  const donde = cumple == null ? 'sin meta definida' : cumple ? `por encima de la meta de ${textoMeta(resultado.meta)}` : `bajo la meta de ${textoMeta(resultado.meta)}`;
  const pg = resultado.por_gestionar.total;
  const cola = pg ? ` ${plural(pg, 'caso todavía puede sumar', 'casos todavía pueden sumar')}${resultado.proximo_cierre ? ` antes del ${diaMes(resultado.proximo_cierre)}` : ''}.` : '';
  const abierto = acc.preliminar ? ' Incluye meses sin cerrar: puede cambiar.' : '';
  return `El acumulado está en ${fraccion(acc.porcentaje)}, ${donde}.${abierto}${cola}`;
}

/* La bajada de una ficha: hasta qué mes es definitivo, qué está preliminar y
   con qué fuentes se calcula. */
export function bajadaDeFicha({ ficha, resultado, datos_al: datosAl, anio }) {
  const fuentes = listaDeFuentes(ficha.fuentes.map((f) => f.nombre));
  if (!resultado) return `${ficha.nombre.replace(/\.$/, '')}. Fuentes: ${fuentes || 'sin fuentes registradas'}.`;
  const abiertos = resultado.meses.filter(mesAbierto).map((m) => `${mesMinuscula(anio, m.mes)} ${ESTADO_MES[m.estado].etiqueta.toLowerCase()}`);
  const hasta = resultado.consolidado_hasta ? `Consolidado hasta ${mesMinuscula(anio, resultado.consolidado_hasta)}` : 'Ningún mes cerrado todavía';
  const datos = datosAl ? ` (datos del HIS al ${fechaCorta(datosAl)})` : '';
  const prel = abiertos.length ? `; ${abiertos.join(', ')}` : '';
  return `${hasta}${datos}${prel}. Fuentes: ${fuentes}.`;
}

/* ------------------------------------------------------------- qué subir */

const enumerarMeses = (anio, meses) => meses.map((m) => mesMinuscula(anio, m)).join(' y ');

/* Para qué sirve una descarga hecha desde cierto día. */
export function paraQueSirve(paso, anio) {
  const partes = [];
  if (paso.cierra.length) partes.push(`cierra ${enumerarMeses(anio, paso.cierra)}`);
  if (paso.definitiva) partes.push('queda como definitiva');
  return partes.length ? partes.join(' y ') : 'completa el mes';
}

/* «Desde el 06/10: cierra agosto». */
export const textoDePaso = (paso, anio) => `Desde el ${diaMes(paso.desde)}: ${paraQueSirve(paso, anio)}.`;

/* Qué pasa al retirar la carga de un mes. `cargados`: los meses que esa fuente
   tiene cargados en el año. El cálculo va de enero al último mes seguido. */
export function consecuenciaDeRetirar({ fuente, mes }, cargados, anio) {
  let hasta = 0;
  while (cargados.includes(hasta + 1)) hasta += 1;
  const nombre = mesMinuscula(anio, mes);
  if (mes > hasta) return `${nombre} no está en la serie seguida desde enero: el cálculo de hoy no cambia.`;
  if (fuente !== 'his_minsa') return `Las defunciones registradas en ${nombre} dejan de conocerse: quien falleció ese mes vuelve al denominador, y los meses abiertos no se cierran hasta volver a subirlo.`;
  if (mes === 1) return `Sin enero, ${anio} se queda sin resultado hasta volver a subirlo.`;
  return `El año solo calcula hasta ${mesMinuscula(anio, mes - 1)}: de ${nombre} en adelante deja de mostrarse hasta volver a subirlo.`;
}

/* Lo que dice MINSA frente al cálculo, en todo el año. */
export function frenteAMinsa(resultado) {
  if (!resultado?.meses_con_minsa) return { texto: 'Sin publicar', detalle: 'MINSA todavía no tiene resultado registrado para comparar.', tono: 'none' };
  /* Solo se comparan los meses cerrados: a uno abierto le faltan datos, y que
     difiera de MINSA no dice nada todavía. */
  const cerrados = resultado.meses.filter((m) => m.minsa && !mesAbierto(m));
  if (!cerrados.length) return { texto: 'Por comparar', detalle: 'Se compara con MINSA cuando el mes esté cerrado: todavía faltan tramas.', tono: 'none' };
  const coinciden = cerrados.filter((m) => m.minsa.coincide).length;
  const todos = coinciden === cerrados.length;
  return {
    texto: todos ? 'Coincide' : 'Difiere',
    detalle: `${coinciden} de ${plural(cerrados.length, 'mes cerrado coincide', 'meses cerrados coinciden')} con lo publicado por MINSA`,
    tono: todos ? 'ok' : 'warn',
  };
}

/* ----------------------------------------------------------------- tablero

   El tablero de las 34 fichas se mira por mes, por trimestre o por año. El
   resultado oficial de una ficha es el ANUAL (el acumulado de enero a la
   fecha): el mes y el trimestre son seguimiento, y con pocos casos por mes su
   porcentaje cambia mucho. La meta es anual; frente a un mes o un trimestre se
   compara como referencia, y se dice. */

export const VISTAS = Object.freeze([
  { valor: 'mensual', etiqueta: 'Mensual', ayuda: 'El resultado de un solo mes: los casos de ese mes. Es seguimiento, no el resultado oficial.' },
  { valor: 'trimestral', etiqueta: 'Trimestral', ayuda: 'La suma de los casos de los tres meses del trimestre. Es seguimiento, no el resultado oficial.' },
  { valor: 'anual', etiqueta: 'Anual', ayuda: 'El acumulado de enero al último mes cargado: es el resultado que MINSA evalúa.' },
]);

export const TRIMESTRES = Object.freeze([
  { n: 1, meses: [1, 2, 3], corto: 'I trim.', etiqueta: 'I trimestre (enero–marzo)' },
  { n: 2, meses: [4, 5, 6], corto: 'II trim.', etiqueta: 'II trimestre (abril–junio)' },
  { n: 3, meses: [7, 8, 9], corto: 'III trim.', etiqueta: 'III trimestre (julio–setiembre)' },
  { n: 4, meses: [10, 11, 12], corto: 'IV trim.', etiqueta: 'IV trimestre (octubre–diciembre)' },
]);

export const trimestreDe = (mes) => TRIMESTRES.find((t) => t.meses.includes(mes));

/* Suma de los casos de unos meses: { numerador, denominador, porcentaje,
   preliminar, meses }, o null si ninguno tiene resultado. */
function sumaDeMeses(resultado, meses) {
  const delPeriodo = (resultado?.meses ?? []).filter((m) => meses.includes(m.mes));
  if (!delPeriodo.length) return null;
  const numerador = delPeriodo.reduce((s, m) => s + m.numerador, 0);
  const denominador = delPeriodo.reduce((s, m) => s + m.denominador, 0);
  return { numerador, denominador, porcentaje: denominador ? numerador / denominador : null, preliminar: delPeriodo.some(mesAbierto), meses: delPeriodo.map((m) => m.mes) };
}

/* La cifra de una ficha en el periodo elegido. `periodo`: el mes (mensual), el
   número de trimestre (trimestral) o, en la vista anual, el mes «hasta» (null:
   todo lo cargado). */
export function cifraDelPeriodo(resultado, vista, periodo) {
  if (!resultado) return null;
  if (vista === 'mensual') return periodo == null ? null : sumaDeMeses(resultado, [periodo]);
  if (vista === 'trimestral') return periodo == null ? null : sumaDeMeses(resultado, TRIMESTRES[periodo - 1].meses);
  return acumuladoHasta(resultado, periodo);
}

/* Los periodos que se pueden elegir: los que tienen resultado en alguna ficha. */
export function periodosDe(fichas, vista) {
  const meses = mesesConResultado(fichas);
  if (vista === 'trimestral') return [...new Set(meses.map((m) => trimestreDe(m).n))];
  return meses;
}

/* El periodo que se muestra si no se eligió: el último con resultado (en la
   vista anual, todo lo cargado). */
export function periodoPorDefecto(fichas, vista) {
  if (vista === 'anual') return null;
  return periodosDe(fichas, vista).at(-1) ?? null;
}

export function etiquetaDelPeriodo(vista, periodo, anio) {
  if (vista === 'mensual') return periodo == null ? 'Sin meses con resultado' : `${nombreMes(anio, periodo)} ${anio}`;
  if (vista === 'trimestral') return periodo == null ? 'Sin trimestres con resultado' : `${TRIMESTRES[periodo - 1].etiqueta} ${anio}`;
  return periodo == null ? `Acumulado ${anio}` : `Enero–${mesMinuscula(anio, periodo)} ${anio}`;
}

/* La serie de una ficha en la vista elegida, para un gráfico de barras: un
   punto por mes, por trimestre o, en la anual, el acumulado de cada mes (cómo
   se acerca o se aleja de la meta). Un periodo sin resultado va en null: no
   se dibuja como cero. */
export function serieDelPeriodo(resultado, vista, anio) {
  if (vista === 'trimestral') {
    return TRIMESTRES.map((t) => {
      const c = sumaDeMeses(resultado, t.meses);
      return { key: `t${t.n}`, label: t.corto, title: `${t.etiqueta} ${anio}`, value: c?.porcentaje == null ? null : c.porcentaje * 100, detail: c ? `${numero(c.numerador)} de ${numero(c.denominador)}${c.preliminar ? ' · con meses sin cerrar' : ''}` : 'Sin resultado' };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const m = resultado?.meses.find((x) => x.mes === mes);
    const c = !m ? null : vista === 'anual' ? m.acumulado : m;
    return {
      key: `m${mes}`,
      label: nombreMes(anio, mes).slice(0, 3),
      title: vista === 'anual' ? `Acumulado enero–${mesMinuscula(anio, mes)}` : `${nombreMes(anio, mes)} ${anio}`,
      value: c?.porcentaje == null ? null : c.porcentaje * 100,
      detail: c ? `${numero(c.numerador)} de ${numero(c.denominador)}${m && mesAbierto(m) ? ' · sin cerrar' : ''}` : 'Sin resultado',
    };
  });
}

/* Los casos del denominador de las fichas con resultado, por su situación de
   hoy (CLASES), en cada periodo: trimestres en la vista trimestral, meses en
   las demás. Los periodos sin casos del final no se dibujan. */
export function casosPorPeriodo(fichas, vista, anio) {
  const conResultado = fichas.filter((f) => f.resultado?.meses.length);
  const periodos = vista === 'trimestral'
    ? TRIMESTRES.map((t) => ({ etiqueta: t.corto, meses: t.meses }))
    : Array.from({ length: 12 }, (_, i) => ({ etiqueta: nombreMes(anio, i + 1).slice(0, 3), meses: [i + 1] }));
  const conCasos = (p) => conResultado.some((f) => f.resultado.meses.some((m) => p.meses.includes(m.mes)));
  let fin = periodos.length;
  while (fin > 0 && !conCasos(periodos[fin - 1])) fin -= 1;
  const visibles = periodos.slice(0, fin);
  const suma = (p, clave) => conResultado.reduce((s, f) => s + f.resultado.meses.filter((m) => p.meses.includes(m.mes)).reduce((a, m) => a + (m[clave] ?? 0), 0), 0);
  return { etiquetas: visibles.map((p) => p.etiqueta), series: CLASES.map((c) => ({ name: c.etiqueta, color: c.color, values: visibles.map((p) => suma(p, c.clave)) })) };
}

/* La situación de una ficha frente a la meta en el periodo elegido. */
export function situacionEnPeriodo(f, vista, periodo) {
  if (!f.ficha.aplica) return 'no_aplica';
  const c = cifraDelPeriodo(f.resultado, vista, periodo);
  if (!c || c.porcentaje == null) return 'sin_resultado';
  const { cumple } = frenteAMeta(c, f.resultado?.meta);
  if (cumple == null) return 'sin_meta';
  return cumple ? 'cumple' : 'bajo';
}

/* El color de cada situación en los gráficos: siempre con su etiqueta al lado. */
export const COLOR_SITUACION = Object.freeze({
  cumple: 'var(--success)',
  bajo: 'var(--destructive)',
  sin_meta: 'var(--info)',
  sin_resultado: 'var(--neutral-text)',
  no_aplica: 'var(--border)',
});

/* Cuántas fichas hay en cada situación, por dimensión. */
export function situacionPorDimension(fichas, dimensiones, vista, periodo) {
  const usadas = dimensiones.filter((d) => fichas.some((f) => f.ficha.dimension === d.codigo));
  const grupos = [...usadas.map((d) => ({ codigo: d.codigo, nombre: d.nombre })), ...(fichas.some((f) => !f.ficha.dimension) ? [{ codigo: null, nombre: 'Sin dimensión' }] : [])];
  return {
    etiquetas: grupos.map((g) => g.nombre),
    series: Object.keys(RESULTADO).map((clave) => ({
      name: RESULTADO[clave].etiqueta,
      color: COLOR_SITUACION[clave],
      values: grupos.map((g) => fichas.filter((f) => (f.ficha.dimension ?? null) === g.codigo && situacionEnPeriodo(f, vista, periodo) === clave).length),
    })),
  };
}

/* Las cifras de la cabecera del tablero, en el periodo elegido. */
export function cifrasDelTablero(fichas, vista, periodo) {
  const situaciones = fichas.map((f) => situacionEnPeriodo(f, vista, periodo));
  const cuenta = (s) => situaciones.filter((x) => x === s).length;
  const aplican = fichas.filter((f) => f.ficha.aplica);
  const gestion = porGestionarDelAnio(fichas);
  return {
    total: fichas.length,
    aplican: aplican.length,
    conResultado: cuenta('cumple') + cuenta('bajo') + cuenta('sin_meta'),
    cumplen: cuenta('cumple'),
    bajo: cuenta('bajo'),
    conCalculo: fichas.filter((f) => f.ficha.tiene_calculo).length,
    fuentesListas: aplican.filter((f) => f.ficha.datos === 'completo').length,
    faltanFuentes: aplican.filter((f) => f.ficha.datos === 'parcial' || f.ficha.datos === 'sin_fuente').length,
    porGestionar: gestion.total,
    vencenPronto: gestion.vencenPronto,
    cierre: gestion.cierre,
  };
}
