/* Cálculos del reporte de Centro Quirúrgico que usa el sistema.

   La aritmética, los cuadros calculados (Top Ten, consolidado, indicadores) y
   las reglas son del bot validador: se reexportan de allí, para que la
   pantalla, el visor de Estadística, DIRESA y el bot digan siempre lo mismo.
   Aquí queda lo del sistema: el estado de cada uno de los ocho reportes en la
   barra de pasos y las cifras de una línea. */

import { REPORTES, cuadro } from './centro-quirurgico.js';
import { valor, sumar, filasDelMes, produccion, topTen, consolidadoPorEspecialidad, indicadoresCalculados } from '@bot/areas/centro-quirurgico/calculos.js';

export {
  valor, sumar, filasDelMes, totalCuadro, produccion, topTen, procedimientosDe, consolidadoPorEspecialidad, indicadoresCalculados, INDICADORES_CALCULADOS, paraDiresa,
} from '@bot/areas/centro-quirurgico/calculos.js';
export { validar, avisosPendientes, REGLAS } from '@bot/areas/centro-quirurgico/reglas.js';

/* Los cuadros que se leen: los que tienen casillas. */
const LEIDOS = REPORTES.filter((r) => r.leido).map((r) => r.id);

/* Las casillas con dato de un cuadro leído. */
export function casillasLlenasDe(datos, idCuadro) {
  return filasDelMes(datos, idCuadro).filter((f) => valor(datos, idCuadro, f.clave) != null).length;
}

export function casillasLlenas(datos) {
  return LEIDOS.reduce((n, id) => n + casillasLlenasDe(datos, id), 0);
}

export function casillasDe(datos = null) {
  return LEIDOS.reduce((n, id) => n + filasDelMes(datos, id).length, 0);
}

/* Un cuadro calculado está listo cuando lo están los cuadros de los que sale. */
const FUENTES = Object.freeze({
  top_ten: ['mayor', 'menor'],
  consolidado: ['mayor', 'menor'],
  indicadores_calculados: ['indicadores', 'resumen'],
});

/* El estado de un cuadro leído: vacío, con error, a medias o completo. */
function estadoLeido(id, datos, validacion) {
  const llenas = casillasLlenasDe(datos, id);
  if (llenas === 0) return 'vacio';
  if (validacion.errores.some((e) => e.formato === id && (e.regla ?? e.id) !== 'incompleto')) return 'error';
  return llenas < filasDelMes(datos, id).length ? 'parcial' : 'ok';
}

export function estadoDeFormato(id, datos, _periodo, validacion) {
  if (!FUENTES[id]) return estadoLeido(id, datos, validacion);
  const estados = FUENTES[id].map((f) => estadoLeido(f, datos, validacion));
  if (estados.every((e) => e === 'vacio')) return 'vacio';
  return estados.includes('error') ? 'error' : estados.every((e) => e === 'ok') ? 'ok' : 'parcial';
}

const n = (v) => v.toLocaleString('es-PE');

export function notaDeFormato(id, datos, periodo) {
  if (id === 'top_ten') {
    const top = topTen(datos, 'mayor');
    return top.length ? `1.º ${top[0].rotulo}` : 'Sin datos';
  }
  if (id === 'consolidado') {
    const c = consolidadoPorEspecialidad(datos);
    return c.total == null ? 'Sin datos' : `${n(c.total)} intervenciones`;
  }
  if (id === 'indicadores_calculados') {
    const con = indicadoresCalculados(datos, periodo).filter((i) => i.valor != null).length;
    return con ? `${con} de ${indicadoresCalculados(datos, periodo).length} con dato` : 'Sin datos';
  }
  const llenas = casillasLlenasDe(datos, id);
  const todas = filasDelMes(datos, id).length;
  if (!llenas) return 'Sin datos';
  if (llenas < todas) return `${llenas} de ${todas} cifras`;
  if (id === 'resumen') {
    const p = produccion(datos);
    return p.realizadas == null ? `${todas} cifras` : `${n(p.realizadas)} cirugías`;
  }
  if (id === 'indicadores') return `${todas} cifras`;
  const total = sumar(Object.values(datos?.[id] ?? {}));
  return total == null ? 'Sin datos' : `${n(total)} ${cuadro(id).unidad}`;
}

/* Las cifras del mes, para el historial, la bandeja y la portada. */
export function cifrasCentroQuirurgico(datos) {
  const p = produccion(datos);
  return {
    realizadas: p.realizadas,
    programadas: p.programadas,
    emergencia: p.emergencia,
    suspendidas: p.suspendidas,
    mayores: p.mayores.total,
    menores: p.menores.total,
  };
}
