/* Azar determinista para los datos simulados.

   Misma clave, mismo número: la demostración da siempre las mismas cifras al
   recargar, y se puede ensayar. Math.random haría que cada recarga contara una
   historia distinta.

   El factor del periodo es común a todas las áreas: un mes con mucha actividad
   lo es para lavandería, para farmacia y para el laboratorio a la vez, que es
   lo que pasa en un hospital de verdad. Junio de 2026 vale 1 porque es el mes
   del que se tienen cifras reales de Lavandería. */

export function semilla(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* Congruencial lineal: basta para dar variedad sin depender de Math.random. */
export function siguiente(estado) {
  const s = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
  return [s, s / 4294967296];
}

/* Número entre 0 y 1, estable para una clave. */
export function aleatorio(clave) {
  return siguiente(semilla(clave))[1];
}

export function factorDelPeriodo(periodo) {
  if (periodo === '2026-06') return 1;
  return 0.88 + aleatorio(`factor-${periodo}`) * 0.24;
}
