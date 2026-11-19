/* Aritmética del reporte de Farmacia: lo que se calcula y no se digita.

   Total SIS, total de convenios, total de otras atenciones y total de
   atenciones (reglas R1 a R4): en el informe de papel se escribían a mano y
   por eso podían no cuadrar. Aquí se suman. Los totales que trae el Word se
   leen aparte (`datos.escritos`) y solo sirven para comprobar el archivo.

   La ausencia de dato es `null` y nunca cero: una suma sin ningún sumando
   registrado es null. */

import { COMPONENTES_SIS, COMPONENTES_CONVENIO, OTROS_FINANCIADORES, SERVICIOS_SOP, FILAS, CUADROS } from './definicion.js';

/* El servidor guarda una cifra por indicador y la devuelve plana
   (`f1: { 'sis.hosp': 9264 }`); las pantallas y las reglas la leen anidada
   (`f1.sis.hosp`). Se convierte aquí, en un solo lugar. Lo que ya viene
   anidado pasa igual, y lo que no es un cuadro (lectura, escritos…) no se toca. */
export function anidar(datos) {
  if (!datos) return datos;
  const salida = { ...datos };
  for (const { id } of CUADROS) {
    const cuadro = datos[id];
    if (!cuadro || !Object.keys(cuadro).some((k) => k.includes('.'))) continue;
    const anidado = {};
    for (const [clave, valor] of Object.entries(cuadro)) {
      const partes = clave.split('.');
      let nodo = anidado;
      for (const p of partes.slice(0, -1)) nodo = nodo[p] = nodo[p] && typeof nodo[p] === 'object' ? nodo[p] : {};
      nodo[partes.at(-1)] = valor;
    }
    salida[id] = anidado;
  }
  return salida;
}

export function sumar(valores) {
  const registrados = valores.filter((v) => v != null && Number.isFinite(v));
  if (registrados.length === 0) return null;
  return registrados.reduce((a, b) => a + b, 0);
}

/* ------------------------------------------------ Formato 1 · atenciones */

export const totalSis = (f1) => sumar(COMPONENTES_SIS.map((c) => f1?.sis?.[c.clave]));
export const totalConvenios = (f1) => sumar(COMPONENTES_CONVENIO.map((c) => f1?.convenio?.[c.clave]));

/* Convenios más programas, boletas, crédito, Defensa Nacional e insolvencias:
   todo lo que no es SIS. En enero de 2026, 499 + 655 + 4 367 = 5 521. */
export const totalOtras = (f1) => sumar([totalConvenios(f1), ...OTROS_FINANCIADORES.map((o) => f1?.otros?.[o.clave])]);

/* SIS más otras atenciones. En enero de 2026, 18 878 + 5 521 = 24 399. */
export const totalAtenciones = (f1) => sumar([totalSis(f1), totalOtras(f1)]);

export function valoresF1(f1) {
  return [
    ...COMPONENTES_SIS.map((c) => f1?.sis?.[c.clave]),
    ...COMPONENTES_CONVENIO.map((c) => f1?.convenio?.[c.clave]),
    ...OTROS_FINANCIADORES.map((o) => f1?.otros?.[o.clave]),
  ];
}

/* -------------------------------------- Formato 2 · Sala de Operaciones */

export const celdaSop = (f2, fila, servicio) => f2?.hospitalizados?.[fila]?.[servicio] ?? null;
export const hospitalizadosFila = (f2, fila) => sumar(SERVICIOS_SOP.map((s) => celdaSop(f2, fila, s.clave)));
export const hospitalizadosServicio = (f2, servicio) => sumar(FILAS.map((f) => celdaSop(f2, f.clave, servicio)));
export const totalHospitalizadosSop = (f2) => sumar(FILAS.map((f) => hospitalizadosFila(f2, f.clave)));
export const totalConveniosSop = (f2) => sumar(FILAS.map((f) => f2?.convenios?.[f.clave]));
export const totalSop = (f2) => sumar([totalHospitalizadosSop(f2), totalConveniosSop(f2)]);

export function valoresF2(f2) {
  return FILAS.flatMap((f) => [...SERVICIOS_SOP.map((s) => celdaSop(f2, f.clave, s.clave)), f2?.convenios?.[f.clave]]);
}

/* ------------------------------------ Formato 3 · Consultorios externos */

export const totalConsultasF3 = (f3) => sumar(FILAS.map((f) => f3?.consultas?.[f.clave]));
export const totalConveniosF3 = (f3) => sumar(FILAS.map((f) => f3?.convenios?.[f.clave]));
export const totalFilaF3 = (f3, fila) => sumar([f3?.consultas?.[fila], f3?.convenios?.[fila]]);
export const totalF3 = (f3) => sumar([totalConsultasF3(f3), totalConveniosF3(f3)]);

export function valoresF3(f3) {
  return FILAS.flatMap((f) => [f3?.consultas?.[f.clave], f3?.convenios?.[f.clave]]);
}

/* Cifra con la que se nombra cada formato; también la que el motor compara
   con el mes anterior. */
export function totalDe(idFormato, datos) {
  if (idFormato === 'f1') return totalAtenciones(datos?.f1);
  if (idFormato === 'f2') return totalSop(datos?.f2);
  if (idFormato === 'f3') return totalF3(datos?.f3);
  return null;
}

export const totalCuadro = (datos, idFormato) => totalDe(idFormato, anidar(datos));
