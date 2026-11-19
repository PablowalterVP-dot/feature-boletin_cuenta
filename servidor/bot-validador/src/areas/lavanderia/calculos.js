/* Aritmética del reporte de Lavandería: leer un servicio, sumar, contar
   casillas. Solo existe para f1 (kilos por servicio, diaria): es el único
   cuadro que la base cataloga como `indicador` (ver el comentario de
   definicion.js); f2, f3 y f4 no tienen casillas que contar del mismo modo,
   y el bot los valida directamente sobre `datos` en reglas.js. */

import { formato } from './definicion.js';
import { diasDelMes } from '../../periodos.js';

export function valoresDe(datos, idFormato, claveFila, periodo) {
  const n = diasDelMes(periodo);
  const fila = datos?.[idFormato]?.[claveFila] ?? [];
  return Array.from({ length: n }, (_, i) => (typeof fila[i] === 'number' ? fila[i] : null));
}

export function sumar(valores) {
  const conDato = valores.filter((v) => v != null);
  return conDato.length ? conDato.reduce((a, b) => a + b, 0) : null;
}

export function totalFila(datos, idFormato, claveFila, periodo) {
  return sumar(valoresDe(datos, idFormato, claveFila, periodo));
}

export function totalFormato(datos, idFormato, periodo) {
  return sumar(formato(idFormato).filas.map((f) => totalFila(datos, idFormato, f.clave, periodo)));
}

/* Los servicios que aplican ese mes: todos, menos los que el Excel no trajo
   (`datos.ausentes`) y los ocasionales (UCI-CIRUGIA) mientras ese mes no
   traiga su fila. */
export function filasDelMes(datos, idFormato) {
  const ausentes = datos?.ausentes?.[idFormato] ?? [];
  return formato(idFormato).filas.filter((fila) => !ausentes.includes(fila.clave) && (!fila.ocasional || datos?.[idFormato]?.[fila.clave] != null));
}

export function casillasDe(periodo, datos = null) {
  return filasDelMes(datos, 'f1').length * diasDelMes(periodo);
}

export function casillasLlenas(datos, periodo) {
  return formato('f1').filas.reduce((n, fila) => n + valoresDe(datos, 'f1', fila.clave, periodo).filter((v) => v != null).length, 0);
}

/* El total de cada cuadro, para la variación mensual (motor.js) y para
   mostrarlo. f2 y f4 no traen cifras por día: f2 cuenta trabajos, f4 suma
   las piezas que ya trae leídas (no hace falta `periodo`, a diferencia de
   f1 y f3). Si `datos` no trae el cuadro (el mes anterior, reconstruido
   solo con lo que persiste la base, no trae f2/f3/f4: ver definicion.js),
   da `null`, como cualquier cuadro sin datos. */
export function totalCuadro(datos, idFormato, periodo) {
  if (idFormato === 'f1') return totalFormato(datos, 'f1', periodo);
  if (idFormato === 'f3') {
    const comun = sumar((datos?.f3?.comun ?? []).filter((v) => typeof v === 'number'));
    const sucia = sumar((datos?.f3?.sucia ?? []).filter((v) => typeof v === 'number'));
    if (comun == null && sucia == null) return null;
    return (comun ?? 0) + (sucia ?? 0);
  }
  if (idFormato === 'f4') {
    const valores = Object.values(datos?.f4?.piezas ?? {}).filter((v) => typeof v === 'number');
    return sumar(valores);
  }
  if (idFormato === 'f2') return Array.isArray(datos?.f2) ? datos.f2.length : null;
  return null;
}
