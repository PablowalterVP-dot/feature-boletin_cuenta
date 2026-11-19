/* Aritmética de los formatos de Diagnóstico por Imágenes.

   La regla de siempre: nada que se pueda calcular se digita. Los exámenes de
   cada profesional, los totales por financiamiento y por servicio y los
   exámenes atendidos de Rayos X salen de aquí; los totales que trae el Word
   solo se comparan (reglas.js).

   La ausencia de dato es `null` y nunca cero. En este oficio la diferencia es
   visible: el tomógrafo inoperativo reporta «0» —se midió y no hubo
   exámenes—, y eso no es lo mismo que una hoja que nadie llenó. */

import { SERVICIOS, FINANCIADORES, CUADROS_ECO } from './definicion.js';
import { anidarCuadros } from '../../anidar.js';

export function sumar(valores) {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  if (registrados.length === 0) return null;
  return registrados.reduce((a, b) => a + b, 0);
}

/* ------------------------------------------- matriz financiamiento × servicio */

export function celda(matriz, financiador, servicio) {
  return matriz?.[financiador]?.[servicio] ?? null;
}

export function totalFinanciador(matriz, financiador) {
  return sumar(SERVICIOS.map((s) => celda(matriz, financiador, s.clave)));
}

export function totalServicio(matriz, servicio) {
  return sumar(FINANCIADORES.map((f) => celda(matriz, f.clave, servicio)));
}

export function totalMatriz(matriz) {
  return sumar(FINANCIADORES.map((f) => totalFinanciador(matriz, f.clave)));
}

/* Casillas en blanco de una matriz que ya tiene algo registrado. Una matriz
   del todo vacía no cuenta: es un formato sin empezar, no un olvido. */
export function casillasEnBlanco(matriz) {
  const valores = FINANCIADORES.flatMap((f) => SERVICIOS.map((s) => celda(matriz, f.clave, s.clave)));
  if (!valores.some((v) => v != null)) return 0;
  return valores.filter((v) => v == null).length;
}

export function sumarMatrices(matrices) {
  return Object.fromEntries(
    FINANCIADORES.map((f) => [f.clave, Object.fromEntries(SERVICIOS.map((s) => [s.clave, sumar(matrices.map((m) => celda(m, f.clave, s.clave)))]))]),
  );
}

/* ------------------------------------------------- Formato 1 · ecografía */

/* La columna EXAM del oficio: la suma de las nueve casillas de la fila. */
export function examenesDeFila(fila) {
  return totalMatriz(fila?.examenes);
}

export function filaTieneCifras(fila) {
  return fila?.pacientes != null || fila?.monto != null || examenesDeFila(fila) != null;
}

export function totalesCuadro(filas = []) {
  return {
    pacientes: sumar(filas.map((f) => f.pacientes)),
    examenes: sumar(filas.map(examenesDeFila)),
    monto: sumar(filas.map((f) => f.monto)),
    matriz: sumarMatrices(filas.map((f) => f.examenes)),
  };
}

export function examenesF1(f1) {
  return sumar(CUADROS_ECO.map((c) => totalesCuadro(f1?.[c.clave]).examenes));
}

/* ----------------------------------------- Formatos 2, 3 y 4 · totales */

export function examenesF2(f2) {
  return totalMatriz(f2?.examenes);
}

/* La campaña no tiene servicio ni financiador en el oficio: suma aparte. */
export function examenesF3(f3) {
  return sumar([totalMatriz(f3?.examenes), f3?.campana]);
}

/* Exámenes atendidos de Rayos X: hospitalización + emergencia + consulta externa. */
export function examenesF4(f4) {
  return sumar(SERVICIOS.map((s) => f4?.examenes?.[s.clave]));
}

export function totalPersonas(lista) {
  return sumar((lista ?? []).map((p) => p.cantidad));
}

export function examenesDe(idFormato, datos) {
  if (idFormato === 'f1') return examenesF1(datos?.f1);
  if (idFormato === 'f2') return examenesF2(datos?.f2);
  if (idFormato === 'f3') return examenesF3(datos?.f3);
  return examenesF4(datos?.f4);
}

/* ----------------------------------------------------- la base de datos

   Los cuatro cuadros planos que guarda la base (definicion.js, CUADROS_BASE),
   calculados con los formatos. Lo que no se registró queda en null. */
const matrizPlana = (m) => Object.fromEntries(FINANCIADORES.map((f) => [f.clave, Object.fromEntries(SERVICIOS.map((s) => [s.clave, celda(m, f.clave, s.clave)]))]));

export function plano(datos) {
  const { f1 = {}, f2 = {}, f3 = {}, f4 = {} } = datos ?? {};
  const eco = Object.fromEntries(
    CUADROS_ECO.map((c) => {
      const t = totalesCuadro(f1[c.clave]);
      return [c.clave, { ...matrizPlana(t.matriz), pacientes: t.pacientes, monto: t.monto }];
    }),
  );
  return {
    eco,
    tac: { examenes: matrizPlana(f2.examenes), pacientes: f2.pacientes ?? null, monto: f2.monto ?? null, informes: totalPersonas(f2.informes), inoperativo: f2.inoperativo ? 1 : 0 },
    mam: { examenes: matrizPlana(f3.examenes), campana: f3.campana ?? null, pacientes: f3.pacientes ?? null, monto: f3.monto ?? null, informes: totalPersonas(f3.informes) },
    rx: {
      examenes: Object.fromEntries(SERVICIOS.map((s) => [s.clave, f4.examenes?.[s.clave] ?? null])),
      pacientes: f4.pacientes ?? null, placas: f4.placas ?? null, tecnologos: totalPersonas(f4.tecnologos),
      particulares: f4.particulares ?? null, monto: f4.monto ?? null, informes: totalPersonas(f4.informes),
    },
  };
}

/* El total de un formato, para comparar con el mes anterior. Del mes anterior,
   la base solo devuelve los cuadros planos: se usan si faltan los formatos. */
export function totalCuadro(datosRecibidos, id) {
  const datos = anidarCuadros(datosRecibidos, ['eco', 'tac', 'mam', 'rx']);
  const directo = examenesDe(id, datos);
  if (directo != null || datos?.[id]) return directo;
  if (id === 'f1') return sumar(CUADROS_ECO.map((c) => totalMatriz(datos?.eco?.[c.clave])));
  if (id === 'f2') return totalMatriz(datos?.tac?.examenes);
  if (id === 'f3') return sumar([totalMatriz(datos?.mam?.examenes), datos?.mam?.campana]);
  return sumar(SERVICIOS.map((s) => datos?.rx?.examenes?.[s.clave]));
}
