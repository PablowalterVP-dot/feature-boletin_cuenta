/* Frases que el boletín redacta solo a partir de las cifras.

   El boletín impreso de julio de 2026 se armaba reemplazando el nombre del mes
   en el del mes anterior («Director AdJULto» salió de ahí) y con párrafos que
   afirmaban un «incremento significativo» sin decir de cuánto. Aquí cada
   frase con una cifra se arma con la cifra: si el dato no está, la frase lo
   dice en lugar de afirmar una tendencia. */

import { numero, variacion } from './formato.js';

/* «3 612 atenciones, 4,2 % más que en junio (3 466).» En un porcentaje la
   comparación va en puntos: pasar de 2 % a 3 % es «1 punto más», y decir
   «50 % más» induce a leer una catástrofe donde no la hay. */
export function fraseComparada({ prefijo = '', actual, previo, mesPrevio, unidad = '', decimales = 0, enPuntos = false }) {
  /* Sin la cifra no hay frase: «se registraron Sin datos atenciones» no se
     escribe nunca. */
  if (actual == null) return null;
  const cifra = `${prefijo ? `${prefijo} ` : ''}${numero(actual, decimales)}${unidad ? ` ${unidad}` : ''}`;
  if (previo == null) return `${cifra}; no hay dato validado de ${mesPrevio} para comparar`;
  if (enPuntos) {
    const d = actual - previo;
    if (Math.abs(d) < 0.05) return `${cifra}, igual que en ${mesPrevio}`;
    return `${cifra}, ${numero(Math.abs(d), 1)} ${Math.abs(d) === 1 ? 'punto' : 'puntos'} ${d > 0 ? 'más' : 'menos'} que en ${mesPrevio}`;
  }
  const v = variacion(actual, previo);
  if (v.valor == null) return `${cifra}; ${mesPrevio} no da base para comparar`;
  if (Math.abs(v.valor) < 0.05) return `${cifra}, igual que en ${mesPrevio}`;
  return `${cifra}, ${numero(Math.abs(v.valor), 1)} % ${v.valor > 0 ? 'más' : 'menos'} que en ${mesPrevio} (${numero(previo, decimales)})`;
}

/* La parte de mayor peso de un reparto: «la mayor parte (61,3 %) corresponde
   a hospitalización». Redactada así para que concuerde con cualquier rótulo,
   en singular o en plural. */
export function fraseMayorParte(partes) {
  const conDato = partes.filter((p) => p.valor != null && p.valor > 0);
  const total = conDato.reduce((a, p) => a + p.valor, 0);
  if (conDato.length < 2 || total === 0) return null;
  const mayor = conDato.reduce((a, b) => (b.valor > a.valor ? b : a));
  const rotulo = mayor.label.charAt(0).toLowerCase() + mayor.label.slice(1);
  const destino = rotulo.startsWith('el ') ? `al ${rotulo.slice(3)}` : `a ${rotulo}`;
  return `la mayor parte (${numero((mayor.valor / total) * 100, 1)} %) corresponde ${destino}`;
}

/* Une frases sueltas en un párrafo: descarta las vacías y cierra con punto. */
export function parrafo(...frases) {
  const hay = frases.filter(Boolean);
  if (!hay.length) return null;
  return hay.map((f) => f.charAt(0).toUpperCase() + f.slice(1)).join('. ') + '.';
}

const ROMANOS = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function romano(n) {
  let resto = n;
  let s = '';
  for (const [valor, letra] of ROMANOS) {
    while (resto >= valor) {
      s += letra;
      resto -= valor;
    }
  }
  return s;
}
