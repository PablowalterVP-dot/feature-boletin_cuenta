/* Aritmética del reporte de Laboratorio: leer una casilla, sumar, contar.
   La usan las reglas, la plantilla y, a través del bot, las pantallas.

   Mismo criterio que Nutrición: una suma sin ninguna casilla con dato es
   `null` («sin datos»), no 0. */

import { CUADROS, cuadro, claveFila } from './definicion.js';

export function valor(datos, idCuadro, clave) {
  const v = datos?.[idCuadro]?.[clave];
  return typeof v === 'number' ? v : null;
}

export function sumar(valores) {
  const conDato = valores.filter((v) => v != null);
  return conDato.length ? conDato.reduce((a, b) => a + b, 0) : null;
}

/* Las filas que aplican ese mes: todas, menos los exámenes que el Excel no
   trajo (`datos.ausentes`), que no son casillas por llenar. */
export function filasDelMes(datos, idCuadro) {
  const ausentes = datos?.ausentes?.[idCuadro] ?? [];
  return cuadro(idCuadro).filas.filter((f) => !ausentes.includes(f.examen));
}

/* Un examen en todas las procedencias de su sección: la columna TOTAL del
   Excel, calculada. */
export function totalExamen(datos, idCuadro, examen) {
  return sumar(cuadro(idCuadro).procedencias.map((p) => valor(datos, idCuadro, claveFila(examen, p.clave))));
}

/* Una procedencia en todos los exámenes de la sección: su fila TOTAL. */
export function totalProcedencia(datos, idCuadro, procedencia) {
  return sumar(cuadro(idCuadro).examenes.map((e) => valor(datos, idCuadro, claveFila(e.clave, procedencia))));
}

export function totalCuadro(datos, idCuadro) {
  return sumar(cuadro(idCuadro).filas.map((f) => valor(datos, idCuadro, f.clave)));
}

export function totalGeneral(datos) {
  return sumar(CUADROS.map((c) => totalCuadro(datos, c.id)));
}

export function casillasDe(datos = null) {
  return CUADROS.reduce((n, c) => n + filasDelMes(datos, c.id).length, 0);
}

export function casillasLlenas(datos, idCuadro) {
  const lista = idCuadro ? [cuadro(idCuadro)] : CUADROS;
  return lista.reduce((n, c) => n + c.filas.filter((f) => valor(datos, c.id, f.clave) != null).length, 0);
}
