/* Cálculos del reporte de Lavandería que usa el sistema.

   Las reglas y la aritmética básica son del bot validador: se reexportan de
   allí, para que la pantalla, el visor de Estadística y el bot digan siempre
   lo mismo (igual que en laboratorio-calculos.js). Aquí queda lo propio del
   sistema: los totales que usan el tablero de inicio, el formato DIRESA y la
   barra de pasos.

   f1 y f3 son arreglos por día, como los lee el bot (no un objeto indexado
   por día, como en la versión anterior de este archivo). f4.insumos y la
   cantidad de f2 siguen siendo texto libre: no se fuerza un número donde el
   Excel real escribe «16 BOLSAS DE 15 KG X MES». */

import { SERVICIOS, GRUPOS, INSUMOS, TARIFAS, serviciosDelGrupo } from './lavanderia.js';
import { diasDelMes } from '@/app/dominio/periodos.js';

export { validar, avisosPendientes, REGLAS } from '@bot/areas/lavanderia/reglas.js';
export { casillasLlenas, casillasDe, totalCuadro } from '@bot/areas/lavanderia/calculos.js';

/* Suma que distingue el vacío del cero: null si no hubo ni un solo valor
   registrado entre los que se le pasaron. */
function sumar(valores) {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  return registrados.length ? registrados.reduce((a, b) => a + b, 0) : null;
}

/* --------------------------------------------------------------- Formato 1 */

export function totalServicio(f1, claveServicio, periodo) {
  const n = diasDelMes(periodo);
  const valores = f1?.[claveServicio] ?? [];
  return sumar(Array.from({ length: n }, (_, i) => (typeof valores[i] === 'number' ? valores[i] : null)));
}

export function totalF1(f1, periodo) {
  return sumar(SERVICIOS.map((s) => totalServicio(f1, s.clave, periodo)));
}

function diaTieneRegistro(f1, dia) {
  return SERVICIOS.some((s) => typeof f1?.[s.clave]?.[dia - 1] === 'number');
}

function diasRegistradosF1(f1, periodo) {
  const n = diasDelMes(periodo);
  return Array.from({ length: n }, (_, i) => i + 1).filter((d) => diaTieneRegistro(f1, d));
}

/* --------------------------------------------------------------- Formato 3 */

export function totalesF3(f3, periodo) {
  const n = diasDelMes(periodo);
  const comun = sumar(Array.from({ length: n }, (_, i) => (typeof f3?.comun?.[i] === 'number' ? f3.comun[i] : null)));
  const sucia = sumar(Array.from({ length: n }, (_, i) => (typeof f3?.sucia?.[i] === 'number' ? f3.sucia[i] : null)));

  return {
    kgComun: comun,
    kgSucia: sucia,
    kgTotal: sumar([comun, sucia]),
    importeComun: comun == null ? null : comun * TARIFAS.comun.tarifa,
    importeSucia: sucia == null ? null : sucia * TARIFAS.sucia.tarifa,
    importeTotal: comun == null && sucia == null ? null : (comun ?? 0) * TARIFAS.comun.tarifa + (sucia ?? 0) * TARIFAS.sucia.tarifa,
  };
}

function diaTieneRegistroF3(f3, dia) {
  return typeof f3?.comun?.[dia - 1] === 'number' || typeof f3?.sucia?.[dia - 1] === 'number';
}

function diasRegistradosF3(f3, periodo) {
  const n = diasDelMes(periodo);
  return Array.from({ length: n }, (_, i) => i + 1).filter((d) => diaTieneRegistroF3(f3, d));
}

/* --------------------------------------------------------------- Formato 4 */

/* Los kilogramos del consolidado no se digitan: son el Formato 1 agrupado. */
export function kilosDelGrupo(f1, claveGrupo, periodo) {
  return sumar(serviciosDelGrupo(claveGrupo).map((s) => totalServicio(f1, s.clave, periodo)));
}

export function piezasDelGrupo(f4, claveGrupo) {
  return f4?.piezas?.[claveGrupo] ?? null;
}

export function totalPiezas(f4) {
  return sumar(GRUPOS.map((g) => piezasDelGrupo(f4, g.clave)));
}

export function insumoRegistrado(f4, claveInsumo) {
  const v = f4?.insumos?.[claveInsumo];
  return v != null && String(v).trim() !== '' ? v : null;
}

export function insumosRegistrados(f4) {
  return INSUMOS.filter((i) => insumoRegistrado(f4, i.clave) != null);
}

/* --------------------------------------------------------------- Formato 2 */

/* La cantidad de un trabajo: el número al principio del texto libre que trae
   el Excel («5517 UNIDADES», «2 UNIDDADES», con su errata). No se separa su
   unidad, porque el Excel no la escribe de forma uniforme. Sin un número al
   principio, no se cuenta: no se inventa una cantidad. */
export function cantidadDe(fila) {
  const m = String(fila?.confeccion ?? '')
    .trim()
    .match(/^(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/* Una fila cuenta como completa cuando tiene qué se confeccionó, cuánto y
   para quién. El tipo de tela es opcional: el Excel real deja varias filas
   sin él. */
export function filaF2Completa(fila) {
  return Boolean(fila?.descripcion?.trim() && cantidadDe(fila) != null && fila?.servicio?.trim());
}

export function totalConfeccionado(f2) {
  return sumar((f2 ?? []).filter(filaF2Completa).map(cantidadDe));
}

/* --------------------------------------------------------- estado de cada cuadro

   Para la barra de pasos (pasosDe, en levantados.js) y para el visor de
   Estadística. Un cuadro con un error se marca en error aunque esté lleno:
   lleno y correcto no son lo mismo. */
export function estadoDeFormato(idFormato, datos, periodo, validacion) {
  const tieneError = validacion.errores.some((e) => e.formato === idFormato);
  if (tieneError) return 'error';

  const dias = diasDelMes(periodo);

  if (idFormato === 'f1') {
    const n = diasRegistradosF1(datos.f1 ?? {}, periodo).length;
    return n === 0 ? 'vacio' : n === dias ? 'ok' : 'parcial';
  }
  if (idFormato === 'f3') {
    const n = diasRegistradosF3(datos.f3 ?? {}, periodo).length;
    return n === 0 ? 'vacio' : n === dias ? 'ok' : 'parcial';
  }
  if (idFormato === 'f2') {
    return (datos.f2 ?? []).some(filaF2Completa) ? 'ok' : 'vacio';
  }

  /* f4: se da por completo cuando están las piezas de todos los grupos con
     kilos. Los insumos no bloquean, solo avisan (ver reglas.js del bot). */
  const conKilos = GRUPOS.filter((g) => (kilosDelGrupo(datos.f1 ?? {}, g.clave, periodo) ?? 0) > 0);
  if (!conKilos.length) return 'vacio';
  const conPiezas = conKilos.filter((g) => piezasDelGrupo(datos.f4 ?? {}, g.clave) != null);
  return conPiezas.length === 0 ? 'vacio' : conPiezas.length === conKilos.length ? 'ok' : 'parcial';
}

/* Resumen de una línea por formato, para la barra de pasos. */
export function notaDeFormato(idFormato, datos, periodo) {
  const dias = diasDelMes(periodo);

  if (idFormato === 'f1') {
    const n = diasRegistradosF1(datos.f1 ?? {}, periodo).length;
    return `${n} de ${dias} días`;
  }
  if (idFormato === 'f3') {
    const n = diasRegistradosF3(datos.f3 ?? {}, periodo).length;
    return `${n} de ${dias} días`;
  }
  if (idFormato === 'f2') {
    const n = (datos.f2 ?? []).filter(filaF2Completa).length;
    return n === 0 ? 'Sin trabajos' : `${n} ${n === 1 ? 'trabajo' : 'trabajos'}`;
  }

  const conKilos = GRUPOS.filter((g) => (kilosDelGrupo(datos.f1 ?? {}, g.clave, periodo) ?? 0) > 0);
  const conPiezas = conKilos.filter((g) => piezasDelGrupo(datos.f4 ?? {}, g.clave) != null);
  return conKilos.length ? `${conPiezas.length} de ${conKilos.length} servicios` : 'Espera al Formato 1';
}
