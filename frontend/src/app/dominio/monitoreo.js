/* Las reglas de Monitoreo Indicadores: cómo se lee una cifra frente a su meta.

   Tres reglas que no se negocian (CLAUDE.md § 3.4):

     · Sin denominador no hay indicador: es «Sin datos», nunca 0.
     · Un dato acumulado no se suma. MINSA publica varias fichas acumuladas mes a mes
       (enero 33, febrero 45…): sumarlas da una cifra que no existe. El hospital lo hacía
       al anotar sus consolidados de las fichas 9, 11 y 17, y por eso no coincidían.
     · Una meta no registrada no es una meta de cero: sin meta no hay estado. */

/* En pantalla se dice «meta». En el código sigue siendo `logro`, el nombre del Anexo I: es la misma
   cifra (lo que el Tablero de indicadores ya llama meta) y renombrarla no cambiaría nada. */
export const ACUMULACION = Object.freeze({
  mensual: { etiqueta: 'Cifra de cada mes', nota: 'El acumulado suma numeradores y denominadores.' },
  acumulada: { etiqueta: 'Ya viene acumulada', nota: 'Cada mes incluye los anteriores: el dato del año es el del último mes, no la suma.' },
  promedio: { etiqueta: 'Promedio de los meses', nota: 'El resultado del año es el promedio de la cifra de cada mes.' },
  ultimo: { etiqueta: 'Foto del mes', nota: 'Cada mes es la situación de ese mes: el dato del año es el del último, no la suma.' },
});

export const ESTADOS = Object.freeze({
  alcanza: { etiqueta: 'Alcanza la meta', tono: 'ok', icono: 'sh-ok' },
  entre: { etiqueta: 'Entre umbral y meta', tono: 'warn', icono: 'sh-warn' },
  mixto: { etiqueta: 'Cumple en parte', tono: 'warn', icono: 'sh-warn' },
  bajo_umbral: { etiqueta: 'Bajo el umbral', tono: 'crit', icono: 'sh-crit' },
  bajo: { etiqueta: 'Por debajo de la meta', tono: 'crit', icono: 'sh-crit' },
  sin_evaluar: { etiqueta: 'Sin meta para comparar', tono: 'none', icono: 'sh-info' },
  requiere: { etiqueta: 'Se requieren datos', tono: 'none', icono: 'sh-none' },
  sin_dato: { etiqueta: 'Sin datos', tono: 'none', icono: 'sh-none' },
  contexto: { etiqueta: 'No se evalúa al hospital', tono: 'info', icono: 'sh-info' },
});

/* El resultado de un mes. Denominador cero o vacío: sin dato. */
export function valorDe(numerador, denominador, factor = 1) {
  if (numerador == null || !denominador) return null;
  return (numerador / denominador) * factor;
}

/* El resultado del periodo, según cómo se publique la cifra. `puntos`: un elemento por
   mes, con { num, den, valor }; los meses sin dato no cuentan. */
export function acumuladoDe(puntos, acumulacion, factor = 1) {
  const con = (puntos ?? []).filter((p) => p.num != null && p.den);
  if (!con.length) return null;
  const ultimo = con.at(-1);
  const meses = con.length;
  if (acumulacion === 'acumulada' || acumulacion === 'ultimo') return { num: ultimo.num, den: ultimo.den, valor: valorDe(ultimo.num, ultimo.den, factor), meses, hasta: ultimo.periodo };
  if (acumulacion === 'promedio') {
    const valor = con.reduce((a, p) => a + valorDe(p.num, p.den, factor), 0) / meses;
    return { num: null, den: null, valor, meses, hasta: ultimo.periodo };
  }
  const num = con.reduce((a, p) => a + p.num, 0);
  const den = con.reduce((a, p) => a + p.den, 0);
  return { num, den, valor: valorDe(num, den, factor), meses, hasta: ultimo.periodo };
}

/* Dónde queda una cifra frente a lo que pide el Anexo I.
     { tipo: 'minimo', valor, umbral? }   a más, mejor
     { tipo: 'maximo', valor }            a menos, mejor
     { tipo: 'rango', desde, hasta }      debe caer dentro
     { tipo: 'texto', texto }             no se compara con una sola cifra */
export function estadoFrenteAlLogro(valor, logro) {
  if (valor == null) return 'sin_dato';
  if (!logro || logro.tipo === 'texto') return 'sin_evaluar';
  if (logro.tipo === 'maximo') return valor <= logro.valor ? 'alcanza' : 'bajo';
  if (logro.tipo === 'rango') return valor >= logro.desde && valor <= logro.hasta ? 'alcanza' : 'bajo';
  if (valor >= logro.valor) return 'alcanza';
  if (logro.umbral == null) return 'bajo';
  return valor >= logro.umbral ? 'entre' : 'bajo_umbral';
}

/* El estado de un indicador con varias partes: si no van igual, cumple en parte. */
export function estadoDeSeries(estados) {
  const con = estados.filter((e) => e !== 'sin_dato');
  if (!con.length) return 'sin_dato';
  if (con.every((e) => e === con[0])) return con[0];
  return con.includes('alcanza') ? 'mixto' : con[0];
}

const conUnidad = (n, unidad) => `${n}${unidad === '%' ? ' %' : unidad ? ` ${unidad}` : ''}`;

/* El logro, escrito para personas. `escribir` da formato al número. */
export function textoDeLogro(logro, unidad, escribir = String) {
  if (!logro) return 'Meta no definida';
  if (logro.tipo === 'texto') return logro.texto;
  if (logro.tipo === 'rango') return `De ${escribir(logro.desde)} a ${conUnidad(escribir(logro.hasta), unidad)}`;
  const signo = logro.tipo === 'maximo' ? '≤' : '≥';
  const base = `${signo} ${conUnidad(escribir(logro.valor), unidad)}`;
  return logro.umbral == null ? base : `${base}, con umbral de ${conUnidad(escribir(logro.umbral), unidad)}`;
}

/* La distancia en palabras: entre dos porcentajes son puntos, no «por ciento». */
const distancia = (n, unidad, escribir) => (unidad === '%' ? `${escribir(n)} ${n === 1 ? 'punto' : 'puntos'}` : conUnidad(escribir(n), unidad));

const TITULOS_DE_CONCLUSION = Object.freeze({
  alcanza: { tono: 'success', titulo: 'Cumple la meta' },
  entre: { tono: 'warning', titulo: 'A medio camino' },
  bajo_umbral: { tono: 'error', titulo: 'Por debajo del umbral' },
  bajo: { tono: 'error', titulo: 'No alcanza la meta' },
  sin_evaluar: { tono: 'info', titulo: 'Sin meta de una sola cifra' },
});

function distanciaAlLogro(valor, logro, unidad, escribir) {
  const texto = textoDeLogro(logro, unidad, escribir);
  if (logro.tipo === 'maximo') {
    return valor <= logro.valor
      ? `${valor === logro.valor ? 'Está justo en el máximo permitido' : `Está ${distancia(logro.valor - valor, unidad, escribir)} por debajo del máximo permitido`} (${texto}). Aquí, menos es mejor.`
      : `Se pasa ${distancia(valor - logro.valor, unidad, escribir)} del máximo permitido (${texto}). Aquí, menos es mejor.`;
  }
  if (logro.tipo === 'rango') {
    if (valor < logro.desde) return `Le faltan ${distancia(logro.desde - valor, unidad, escribir)} para entrar en el rango esperado (${texto}).`;
    if (valor > logro.hasta) return `Se pasa ${distancia(valor - logro.hasta, unidad, escribir)} del rango esperado (${texto}).`;
    return `Está dentro del rango esperado (${texto}).`;
  }
  if (valor === logro.valor) return `Está justo en la meta esperada (${texto}).`;
  if (valor >= logro.valor) return `Supera por ${distancia(valor - logro.valor, unidad, escribir)} la meta esperada (${texto}).`;
  if (logro.umbral != null && valor >= logro.umbral) return `Ya pasó el umbral, pero le faltan ${distancia(logro.valor - valor, unidad, escribir)} para la meta (${texto}).`;
  if (logro.umbral != null) return `Le faltan ${distancia(logro.umbral - valor, unidad, escribir)} para el umbral y ${distancia(logro.valor - valor, unidad, escribir)} para la meta (${texto}).`;
  return `Le faltan ${distancia(logro.valor - valor, unidad, escribir)} para la meta (${texto}).`;
}

/* La conclusión de hoy frente a la meta del Anexo. `acumulado`: el resultado del periodo.
   Una cifra que crece con el año (`proyectable`) se proyecta a diciembre: en agosto, un 24 %
   de la capacidad anual se lee muy distinto si se dice adónde llega a ese ritmo. */
export function conclusionFrenteAlLogro({ valor, estado, logro, unidad = '', acumulacion = 'mensual', hasta = null, proyectable = false, escribir = String, decimales = null }) {
  if (valor == null) return null;
  const base = TITULOS_DE_CONCLUSION[estado] ?? TITULOS_DE_CONCLUSION.sin_evaluar;
  /* La distancia se saca de la cifra tal como se muestra: que la resta cuadre a la vista. */
  const mostrado = decimales == null ? valor : Number(valor.toFixed(decimales));
  const frases = [logro && logro.tipo !== 'texto' ? distanciaAlLogro(mostrado, logro, unidad, escribir) : (logro?.texto ?? 'El Anexo no le fija una meta de una sola cifra.')];
  const mes = hasta ? Number(hasta.slice(5)) : null;
  if (mes && mes < 12 && proyectable) {
    const proyeccion = (valor * 12) / mes;
    frases.push(`A este ritmo cerraría diciembre en ${conUnidad(escribir(proyeccion), unidad)}.`);
  }
  if (mes && mes < 12 && acumulacion === 'acumulada') frases.push('Es un avance: se evalúa al cierre del año.');
  return { ...base, texto: frases.join(' ') };
}

/* Lo que el Anexo espera de la serie en cada punto, si la cifra crece con el año: la línea
   recta de cero a la meta de diciembre. */
export function ritmoEsperado(logro, mes) {
  const meta = logro?.tipo === 'rango' ? logro.desde : logro?.valor;
  return meta == null ? null : (meta * mes) / 12;
}

/* Cómo van los entregables de un compromiso de mejora. Sin registro, está pendiente. */
export function estadoDeEntregable(entregable, avance, hoy) {
  const estado = avance?.estado ?? 'pendiente';
  if (estado === 'cumplido') return 'cumplido';
  if (entregable.plazo && hoy && entregable.plazo < hoy) return 'vencido';
  return estado;
}

const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);

/* Cómo va un compromiso hoy, en palabras: cuánto lleva, qué se le pasó y qué sigue. `entregables`
   llevan ya su `estado`. Un vencido puede estar hecho y sin anotar: por eso se dice «sin marcar». */
export function conclusionDeCompromiso(entregables, hoy) {
  const total = entregables.length;
  const cumplidos = entregables.filter((e) => e.estado === 'cumplido').length;
  const vencidos = entregables.filter((e) => e.estado === 'vencido');
  const proximo = entregables.filter((e) => e.estado !== 'cumplido' && e.estado !== 'vencido' && e.plazo && e.plazo >= hoy).sort((a, b) => a.plazo.localeCompare(b.plazo))[0];
  const frases = [`Lleva ${cumplidos} de ${total} entregables marcados como cumplidos.`];
  if (vencidos.length) frases.push(`${vencidos.length === 1 ? 'Un plazo ya venció' : `${vencidos.length} plazos ya vencieron`} sin marcar como cumplido: puede estar hecho y sin anotar.`);
  if (proximo) {
    const dias = diasEntre(hoy, proximo.plazo);
    frases.push(`Lo próximo: «${proximo.nombre}», ${dias === 0 ? 'vence hoy' : `en ${dias} ${dias === 1 ? 'día' : 'días'}`}.`);
  }
  if (cumplidos === total) return { tono: 'success', titulo: 'Compromiso cumplido', texto: frases[0] };
  if (vencidos.length) return { tono: 'error', titulo: 'Con plazos vencidos', texto: frases.join(' ') };
  /* Sin nada anotado no se dice «en curso»: afirmaría un avance que nadie registró. */
  if (!cumplidos && !entregables.some((e) => e.estado === 'en_curso')) return { tono: 'info', titulo: 'Sin avance registrado, dentro de plazo', texto: frases.join(' ') };
  return { tono: 'warning', titulo: 'En curso, dentro de plazo', texto: frases.join(' ') };
}

export const ESTADOS_DE_ENTREGABLE = Object.freeze({
  pendiente: { etiqueta: 'Pendiente', tono: 'none', icono: 'sh-clock' },
  en_curso: { etiqueta: 'En curso', tono: 'info', icono: 'sh-pencil' },
  cumplido: { etiqueta: 'Cumplido', tono: 'ok', icono: 'sh-ok' },
  vencido: { etiqueta: 'Plazo vencido', tono: 'crit', icono: 'sh-crit' },
});
