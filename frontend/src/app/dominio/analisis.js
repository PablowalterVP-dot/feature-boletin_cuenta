/* El análisis de un indicador: qué dice su serie hoy, calculado de sus cifras cada vez.

   Nada de esto se guarda ni se escribe a mano. Cada mensaje sale de las cifras que hay en este
   momento: al cargar un mes nuevo, o al corregir MINSA uno anterior, cambia solo. Una frase que
   no se cumple no aparece: por eso los mensajes de dos indicadores, o de un mismo indicador en
   dos meses, no se parecen.

   La referencia es la mediana, no el promedio ni unos límites: la mitad de los meses queda por
   encima y la otra mitad por debajo, y un mes raro no la mueve. Una cifra acumulada no lleva
   mediana, porque crece con el año: ahí se mira cuánto suma cada mes.

   Lo que esto no hace: decir la causa. Dice qué cambió y desde cuándo; por qué, lo sabe el área. */

import { numero } from './formato.js';
import { estadoFrenteAlLogro } from './monitoreo.js';

/* Cuántos meses hacen falta para comparar los últimos tres con los tres anteriores. */
const MESES_PARA_COMPARAR_TRAMOS = 6;
/* Una misma cifra exacta en esta parte de los meses ya no parece una medición. */
const PARTE_REPETIDA = 0.6;

export function mediana(valores) {
  const orden = [...valores].filter((v) => v != null).sort((a, b) => a - b);
  if (!orden.length) return null;
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

/* La dirección en que un indicador mejora. Un rango no tiene una sola. */
export function mejorDe({ logro, menorEsMejor }) {
  if (menorEsMejor) return 'menos';
  if (logro?.tipo === 'maximo') return 'menos';
  if (logro?.tipo === 'minimo') return 'mas';
  return null;
}

/* Si un mes alcanza la meta. Sin meta de una sola cifra, no se puede decir: null. */
export function cumpleElLogro(valor, logro) {
  if (valor == null || !logro || logro.tipo === 'texto') return null;
  return estadoFrenteAlLogro(valor, logro) === 'alcanza';
}

const iguales = (a, b) => Math.abs(a - b) < 1e-9;

function repetido(valores) {
  const veces = new Map();
  for (const v of valores) veces.set(v.toFixed(6), (veces.get(v.toFixed(6)) ?? 0) + 1);
  const [clave, cuantas] = [...veces.entries()].sort((a, b) => b[1] - a[1])[0];
  return { valor: Number(clave), veces: cuantas };
}

/* Las cifras de la serie, sin palabras. `puntos`: un lugar por mes, en orden, con { periodo, valor }.
   Un mes sin dato es un hueco: no entra en ninguna cuenta. */
export function analizarSerie(puntos, { logro = null, acumulada = false } = {}) {
  const lugares = puntos ?? [];
  const con = lugares.filter((p) => p.valor != null);
  const base = { meses: con.length, ultimo: con.at(-1) ?? null, previo: con.at(-2) ?? null, acumulada };
  if (!con.length) return base;

  const valores = con.map((p) => p.valor);
  const indiceUltimo = lugares.indexOf(con.at(-1));
  const huecos = lugares.slice(0, indiceUltimo).filter((p) => p.valor == null && !p.pendiente).map((p) => p.periodo);
  const cambio = base.previo ? base.ultimo.valor - base.previo.valor : null;
  const constante = con.length > 1 && valores.every((v) => iguales(v, valores[0]));
  const masVeces = repetido(valores);
  const hayRepetido = !constante && con.length >= 3 && masVeces.veces >= 3 && masVeces.veces / con.length >= PARTE_REPETIDA;
  const resultado = { ...base, huecos, cambio, constante, repetido: hayRepetido ? masVeces : null };

  if (acumulada) {
    const avances = con.slice(1).map((p, k) => p.valor - con[k].valor);
    return { ...resultado, centro: null, avanceTipico: avances.length ? mediana(avances) : null };
  }

  const alto = con.reduce((a, p) => (p.valor > a.valor ? p : a));
  const bajo = con.reduce((a, p) => (p.valor < a.valor ? p : a));
  const evaluables = logro && logro.tipo !== 'texto';
  const cumplen = evaluables ? con.filter((p) => cumpleElLogro(p.valor, logro)).length : null;
  let racha = 0;
  if (evaluables) {
    const actual = cumpleElLogro(base.ultimo.valor, logro);
    for (let k = con.length - 1; k >= 0 && cumpleElLogro(con[k].valor, logro) === actual; k--) racha += 1;
  }
  const tramos = con.length >= MESES_PARA_COMPARAR_TRAMOS ? { recientes: mediana(valores.slice(-3)), anteriores: mediana(valores.slice(-6, -3)) } : null;
  return { ...resultado, centro: mediana(valores), alto, bajo, cumplen, racha, desdeRacha: racha ? con.at(-racha) : null, tramos };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreDelMes = (periodo) => MESES[Number(periodo.slice(5)) - 1];
const conMayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const unirConY = (lista) => (lista.length < 2 ? lista.join('') : `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}`);

/* Formatos de una lectura: la cifra, y la distancia entre dos (entre porcentajes son puntos). */
function formatos(decimales, unidad) {
  const cifra = (n) => numero(n, decimales);
  return {
    cifra,
    escribir: (n) => `${cifra(n)}${unidad === '%' ? ' %' : ''}`,
    distancia: (n) => (unidad === '%' ? `${cifra(n)} ${Number(cifra(n)) === 1 ? 'punto' : 'puntos'}` : cifra(n)),
  };
}

function tituloDel(a, mejor, cambio) {
  if (a.meses === 1) return { titulo: 'Solo hay un mes con dato', tono: 'neutro' };
  if (a.constante) return { titulo: 'Sin cambios en el año', tono: 'neutro' };
  const mes = nombreDelMes(a.ultimo.periodo);
  if (iguales(cambio, 0)) return { titulo: `Se mantuvo en ${mes}`, tono: 'neutro' };
  const sube = cambio > 0;
  if (!mejor) return { titulo: `${sube ? 'Subió' : 'Bajó'} en ${mes}`, tono: 'neutro' };
  const mejora = sube === (mejor === 'mas');
  return { titulo: `${mejora ? 'Mejoró' : 'Empeoró'} en ${mes}`, tono: mejora ? 'bueno' : 'malo' };
}

function frasesDelLogro(a, logro) {
  if (a.cumplen == null) return [];
  const mes = nombreDelMes(a.ultimo.periodo);
  const cumpleAhora = cumpleElLogro(a.ultimo.valor, logro);
  const frases = [
    a.cumplen === 0
      ? `No alcanzó la meta en ${a.meses === 1 ? 'ese mes' : `ninguno de sus ${a.meses} meses`}.`
      : a.cumplen === a.meses
        ? `Alcanzó la meta en ${a.meses === 1 ? 'ese mes' : `los ${a.meses} meses`}.`
        : `Alcanzó la meta en ${a.cumplen} de ${a.meses} meses.`,
  ];
  if (a.racha >= 2 && a.racha < a.meses) frases.push(`Lleva ${a.racha} meses seguidos ${cumpleAhora ? 'alcanzándola' : 'sin alcanzarla'}, desde ${nombreDelMes(a.desdeRacha.periodo)}.`);
  if (a.racha === 1 && a.meses > 1) frases.push(`En ${mes} ${cumpleAhora ? 'volvió a alcanzarla' : 'dejó de alcanzarla'}.`);
  return frases;
}

/* El resultado del año y el último mes pueden contar historias distintas, y eso es lo primero
   que hay que ver: un acumulado que cumple puede estar escondiendo una caída reciente. */
function fraseDelAcumulado(a, logro, cumpleElAcumulado) {
  if (cumpleElAcumulado == null || a.cumplen == null) return null;
  const mes = nombreDelMes(a.ultimo.periodo);
  const cumpleAhora = cumpleElLogro(a.ultimo.valor, logro);
  if (cumpleElAcumulado && !cumpleAhora) return `Atención: en el acumulado del año cumple, pero ${mes} por sí solo no llega.`;
  if (!cumpleElAcumulado && cumpleAhora) return `${conMayuscula(mes)} por sí solo llega a la meta, aunque el acumulado del año todavía no.`;
  return null;
}

function fraseDelRitmo(a, logro, f) {
  const mesActual = Number(a.ultimo.periodo.slice(5));
  const meta = logro?.tipo === 'rango' ? logro.desde : logro?.valor;
  const faltan = 12 - mesActual;
  if (meta == null || faltan <= 0) return null;
  if (a.ultimo.valor >= meta) return `Ya llegó a lo que la meta pide para diciembre (${f.escribir(meta)}).`;
  const porMes = (meta - a.ultimo.valor) / faltan;
  const tipico = a.avanceTipico == null ? '' : `; su avance típico es de ${f.distancia(a.avanceTipico)}`;
  return `Para llegar a ${f.escribir(meta)} en diciembre necesita sumar ${f.distancia(porMes)} por mes en los ${faltan} que quedan${tipico}.`;
}

/* Qué dice la serie hoy, en palabras: un titular y solo las frases que se cumplen ahora.
     mejor              'mas', 'menos' o null: de ahí sale si un cambio es bueno o malo.
     cumpleElAcumulado  si el resultado del año alcanza la meta.
     proyectable        la cifra crece con el año y la meta es de diciembre. */
export function lecturaDeLaSerie(a, { mejor = null, logro = null, decimales = 1, unidad = '', cumpleElAcumulado = null, proyectable = false } = {}) {
  if (!a?.meses) return null;
  const f = formatos(decimales, unidad);
  /* Las distancias se sacan de las cifras tal como se muestran. Con las exactas salía «pasó de
     0.9 % a 0.8 %: 0.0 puntos menos» bajo el título «Mejoró», o una resta que no cuadraba a la
     vista (6.0 a 4.7: 1.4). Lo que no se distingue al escribirlo, no cambió. */
  const redondo = (n) => Number(n.toFixed(decimales));
  const cambio = a.previo ? redondo(a.ultimo.valor) - redondo(a.previo.valor) : 0;
  const { titulo, tono } = tituloDel(a, mejor, cambio);
  const frases = [];
  const mes = nombreDelMes(a.ultimo.periodo);

  if (a.constante) {
    frases.push(`Tiene la misma cifra (${f.escribir(a.ultimo.valor)}) en sus ${a.meses} meses: suele indicar un dato de inventario, no una medición de cada mes.`);
  } else if (a.previo) {
    const sentido = cambio > 0 ? 'más' : 'menos';
    frases.push(iguales(cambio, 0)
      ? `Quedó igual que en ${nombreDelMes(a.previo.periodo)}: ${f.escribir(a.ultimo.valor)}.`
      : `Pasó de ${f.escribir(a.previo.valor)} en ${nombreDelMes(a.previo.periodo)} a ${f.escribir(a.ultimo.valor)} en ${mes}: ${f.distancia(Math.abs(cambio))} ${sentido}.`);
  } else {
    frases.push(`${conMayuscula(mes)} es el único mes con dato: todavía no hay con qué compararlo.`);
  }

  const delAcumulado = fraseDelAcumulado(a, logro, cumpleElAcumulado);
  if (delAcumulado) frases.push(delAcumulado);
  if (a.repetido) frases.push(`Repite exactamente ${f.escribir(a.repetido.valor)} en ${a.repetido.veces} de ${a.meses} meses: conviene revisar si se mide de verdad o se arrastra.`);
  frases.push(...frasesDelLogro(a, logro));

  if (a.acumulada) {
    if (proyectable) {
      const delRitmo = fraseDelRitmo(a, logro, f);
      if (delRitmo) frases.push(delRitmo);
    } else if (a.avanceTipico != null && a.meses > 1) {
      frases.push(`Cada mes cambia típicamente ${f.distancia(Math.abs(a.avanceTipico))} (mediana).`);
    }
  } else if (a.centro != null && a.meses > 1 && !a.constante) {
    const dif = redondo(a.ultimo.valor) - redondo(a.centro);
    frases.push(iguales(dif, 0)
      ? `${conMayuscula(mes)} queda justo en su mediana (${f.escribir(a.centro)}).`
      : `${conMayuscula(mes)} queda ${f.distancia(Math.abs(dif))} ${dif > 0 ? 'por encima' : 'por debajo'} de la mediana de sus ${a.meses} meses (${f.escribir(a.centro)}).`);
  }

  if (a.tramos && !iguales(redondo(a.tramos.recientes), redondo(a.tramos.anteriores))) {
    const sube = a.tramos.recientes > a.tramos.anteriores;
    const juicio = mejor ? (sube === (mejor === 'mas') ? 'van mejor que' : 'van peor que') : sube ? 'van por encima de' : 'van por debajo de';
    frases.push(`Los últimos 3 meses (mediana ${f.escribir(a.tramos.recientes)}) ${juicio} los 3 anteriores (${f.escribir(a.tramos.anteriores)}).`);
  }

  if (a.alto && !a.constante && a.meses >= 3) {
    const [bueno, malo] = mejor === 'menos' ? [a.bajo, a.alto] : [a.alto, a.bajo];
    frases.push(mejor
      ? `Mejor mes: ${nombreDelMes(bueno.periodo)} (${f.escribir(bueno.valor)}). Peor mes: ${nombreDelMes(malo.periodo)} (${f.escribir(malo.valor)}).`
      : `Mes más alto: ${nombreDelMes(a.alto.periodo)} (${f.escribir(a.alto.valor)}). Más bajo: ${nombreDelMes(a.bajo.periodo)} (${f.escribir(a.bajo.valor)}).`);
  }

  if (a.huecos?.length) frases.push(`Sin dato en ${unirConY(a.huecos.map(nombreDelMes))}: no se cuenta como cero.`);
  return { titulo, tono, frases };
}

/* Dos lecturas del mismo indicador, mes por mes. Antes el texto decía a mano «coincide en los
   ocho meses»: seguiría diciéndolo aunque dejara de ser cierto. */
export function compararLecturas(oficial, propia, { decimales = 1, unidad = '' } = {}) {
  const f = formatos(decimales, unidad);
  const delOtro = new Map((propia ?? []).filter((p) => p.valor != null).map((p) => [p.periodo, p]));
  const comparables = (oficial ?? []).filter((p) => p.valor != null && delOtro.has(p.periodo));
  if (!comparables.length) return { comparados: 0, difieren: [], iguales: false, texto: null };
  const difieren = comparables.filter((p) => f.cifra(p.valor) !== f.cifra(delOtro.get(p.periodo).valor));
  const n = comparables.length;
  const meses = (lista) => unirConY(lista.map((p) => nombreDelMes(p.periodo)));
  if (!difieren.length) return { comparados: n, difieren, iguales: true, texto: `Coincide con la cifra oficial en ${n === 1 ? 'el mes comparado' : `los ${n} meses comparados`}.` };
  const mayor = difieren.reduce((a, p) => (Math.abs(p.valor - delOtro.get(p.periodo).valor) > Math.abs(a.valor - delOtro.get(a.periodo).valor) ? p : a));
  const donde = difieren.length === n ? 'todos los meses comparados' : meses(difieren);
  return {
    comparados: n,
    difieren,
    iguales: false,
    texto: `Difiere de la cifra oficial en ${difieren.length} de ${n} ${n === 1 ? 'mes' : 'meses'} (${donde}). La mayor distancia es en ${nombreDelMes(mayor.periodo)}: ${f.escribir(mayor.valor)} oficial, ${f.escribir(delOtro.get(mayor.periodo).valor)} aquí.`,
  };
}
