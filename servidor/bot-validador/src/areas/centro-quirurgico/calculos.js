/* Aritmética del reporte de Centro Quirúrgico y los cuadros que se calculan.

   El área digita cinco cuadros (definicion.js). Los otros tres de sus ocho
   reportes salen de esos, y se calculan aquí en vez de leerse de su Excel,
   donde se arman a mano y a veces no cuadran con su propio detalle:

     Top Ten                     los procedimientos más frecuentes del mes
     Consolidado                 cirugía mayor y menor por especialidad
     Indicadores (tabla derecha) los cocientes de la tabla izquierda

   La producción del mes (cuántas cirugías programadas y de emergencia) sale
   del RESUMEN, que coincide con las hojas por especialidad; la cifra
   «realizadas» del cuadro de indicadores a veces no (junio: 455 contra 442).
   La regla `cruce-indicadores` lo avisa; aquí manda el RESUMEN.

   Un cociente con denominador vacío o cero es «sin datos» (null), nunca 0. */

import { CUADROS, ESPECIALIDADES, CAUSAS, PROCEDIMIENTOS_GENERICOS, normalizar, especialidad } from './definicion.js';
import { diasDelMes } from '../../periodos.js';

export function sumar(valores) {
  const conDato = valores.filter((v) => typeof v === 'number');
  return conDato.length ? conDato.reduce((a, b) => a + b, 0) : null;
}

export function valor(datos, idCuadro, clave) {
  const v = datos?.[idCuadro]?.[clave];
  return typeof v === 'number' ? v : null;
}

const cociente = (num, den, factor = 1) => (num == null || den == null || den === 0 ? null : (num / den) * factor);

/* Las filas que aplican ese mes: todas, menos las que el Excel no trajo y las
   ocasionales que ese mes no trae. */
export function filasDelMes(datos, idCuadro) {
  const c = CUADROS.find((x) => x.id === idCuadro);
  const ausentes = datos?.ausentes?.[idCuadro] ?? [];
  return c.filas.filter((f) => !ausentes.includes(f.clave) && (!f.ocasional || datos?.[idCuadro]?.[f.clave] != null));
}

/* El total de cada cuadro, para la variación con el mes anterior (motor.js).
   El cuadro de indicadores mezcla salas, horas e intervenciones: no tiene un
   total que comparar. Las causas de suspensión son pocas (2 a 27 al mes): una
   variación en porcentaje sobre eso es ruido, no una alerta. */
export function totalCuadro(datos, idCuadro) {
  if (idCuadro === 'resumen') return sumar(['mayores', 'menores'].flatMap((c) => [valor(datos, 'resumen', `${c}.programada`), valor(datos, 'resumen', `${c}.emergencia`)]));
  if (idCuadro === 'mayor' || idCuadro === 'menor') return sumar(Object.values(datos?.[idCuadro] ?? {}));
  return null;
}

/* --------------------------------------------------------------- producción */

/* Lo que se hizo en el mes, del RESUMEN y de las causas de suspensión.
     programadas   las cirugías programadas que se ejecutaron (electivas)
     emergencia    las de emergencia
     realizadas    las dos
     suspendidas   las programadas que no se hicieron (de SUSPENDIDAS; si no
                   las trae, del RESUMEN)
     agendadas     programadas + suspendidas: lo que se programó. Es el
                   denominador del porcentaje de suspendidas (decisión del
                   20/10/2026; el Excel del área divide entre las ejecutadas). */
export function produccion(datos) {
  const r = (c, t) => valor(datos, 'resumen', `${c}.${t}`);
  const programadas = sumar([r('mayores', 'programada'), r('menores', 'programada')]);
  const emergencia = sumar([r('mayores', 'emergencia'), r('menores', 'emergencia')]);
  const causas = sumar(CAUSAS.map((c) => valor(datos, 'suspendidas', c.clave)));
  const suspendidas = causas ?? sumar([r('suspendidas', 'programada'), r('suspendidas', 'emergencia')]);
  return {
    mayores: { programada: r('mayores', 'programada'), emergencia: r('mayores', 'emergencia'), total: sumar([r('mayores', 'programada'), r('mayores', 'emergencia')]) },
    menores: { programada: r('menores', 'programada'), emergencia: r('menores', 'emergencia'), total: sumar([r('menores', 'programada'), r('menores', 'emergencia')]) },
    programadas,
    emergencia,
    realizadas: sumar([programadas, emergencia]),
    suspendidas,
    agendadas: programadas == null || suspendidas == null ? null : programadas + suspendidas,
    horas: {
      programadas: sumar([r('horas_programadas', 'programada'), r('horas_programadas', 'emergencia')]),
      efectivas: sumar([r('horas_efectivas', 'programada'), r('horas_efectivas', 'emergencia')]),
      acto: sumar([r('horas_acto', 'programada'), r('horas_acto', 'emergencia')]),
    },
  };
}

/* ------------------------------------------------- consolidado por especialidad */

/* Cirugía mayor y menor de cada especialidad, con sus subtotales: el cuadro
   «Consolidado» del área, armado con el total de cada especialidad leído. */
export function consolidadoPorEspecialidad(datos) {
  const filas = ESPECIALIDADES.map((e) => {
    const mayor = e.en.includes('mayor') ? valor(datos, 'mayor', e.clave) : null;
    const menor = valor(datos, 'menor', e.clave);
    return { clave: e.clave, label: e.label, mayor, menor, total: sumar([mayor, menor]) };
  });
  return {
    filas,
    mayor: sumar(filas.map((f) => f.mayor)),
    menor: sumar(filas.map((f) => f.menor)),
    total: sumar(filas.map((f) => f.total)),
  };
}

/* ---------------------------------------------------------------- Top Ten */

const GENERICOS = new Set(PROCEDIMIENTOS_GENERICOS.map(normalizar));

/* Los procedimientos del mes como lista plana, con su especialidad. Un
   procedimiento se identifica por especialidad y rótulo: «Apendicectomía» de
   cirugía general y la de cirugía pediátrica son dos filas, como en el Top
   Ten del área. Los genéricos («Otras», «2 procedimientos x cirugía») no
   compiten: no son un procedimiento. */
export function procedimientosDe(datos, tipo) {
  return Object.entries(datos?.procedimientos?.[tipo] ?? {}).flatMap(([clave, items]) =>
    items
      .filter((i) => typeof i.valor === 'number' && !GENERICOS.has(normalizar(i.rotulo)))
      .map((i) => ({ clave: `${clave}|${normalizar(i.rotulo)}`, especialidad: clave, especialidadLabel: especialidad(clave)?.label ?? clave, rotulo: i.rotulo, valor: i.valor })),
  );
}

/* Los `n` procedimientos más frecuentes. Un procedimiento en 0 no entra: un
   Top Ten con ceros no dice nada. Empates, por orden alfabético, para que la
   lista no cambie de una vez a otra. */
export function topTen(datos, tipo, n = 10) {
  return procedimientosDe(datos, tipo)
    .filter((p) => p.valor > 0)
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo, 'es'))
    .slice(0, n);
}

/* --------------------------------------------- indicadores (tabla derecha) */

/* Los indicadores del CUADRO DE INDICADORES, con la fórmula que dice el área.
   Tres diferencias con su hoja, a propósito:
     · el rendimiento de sala divide entre los días reales del mes (la hoja
       usa 31 o 28 según la columna, y trunca con QUOTIENT);
     · el porcentaje de suspendidas divide entre lo programado (ejecutadas más
       suspendidas), el mismo criterio del indicador 22 de DIRESA;
     · la producción sale del RESUMEN, no de «realizadas» (ver arriba).
   «% sustitución de camas» la hoja lo marca NO APLICA y no se calcula. */
export const INDICADORES_CALCULADOS = Object.freeze([
  Object.freeze({ clave: 'rendimiento_sop', label: 'Rendimiento de sala de operaciones', formula: 'Cirugías ejecutadas ÷ (salas utilizadas × días del mes)', unidad: 'cirugías por sala al día', estandar: '3', decimales: 1 }),
  Object.freeze({ clave: 'rendimiento_emergencia', label: 'Rendimiento de sala (cirugía de emergencia)', formula: 'Cirugías de emergencia ÷ (salas de emergencia × días del mes)', unidad: 'cirugías por sala al día', estandar: null, decimales: 1 }),
  Object.freeze({ clave: 'rendimiento_electivas', label: 'Rendimiento de sala (cirugía electiva)', formula: 'Cirugías programadas ejecutadas ÷ (salas de cirugía programada × días del mes)', unidad: 'cirugías por sala al día', estandar: null, decimales: 1 }),
  Object.freeze({ clave: 'pct_suspendidas', label: 'Porcentaje de operaciones suspendidas', formula: 'Suspendidas × 100 ÷ (programadas ejecutadas + suspendidas)', unidad: '%', estandar: '5 %', decimales: 1 }),
  Object.freeze({ clave: 'pct_emergencia', label: 'Porcentaje de intervenciones de emergencia', formula: 'Cirugías de emergencia × 100 ÷ cirugías ejecutadas', unidad: '%', estandar: '10 %', decimales: 1 }),
  Object.freeze({ clave: 'pct_horas_efectivas', label: 'Porcentaje de horas quirúrgicas efectivas', formula: 'Horas efectivas × 100 ÷ horas programadas', unidad: '%', estandar: '85 %', decimales: 1 }),
  Object.freeze({ clave: 'tasa_mortalidad', label: 'Tasa de mortalidad en centro quirúrgico', formula: 'Defunciones × 5 000 ÷ pacientes intervenidos', unidad: 'por 5 000', estandar: '1 en 5 000', decimales: 2 }),
  Object.freeze({ clave: 'tasa_reintervenidos', label: 'Tasa de pacientes reintervenidos', formula: 'Reintervenidos × 100 ÷ pacientes intervenidos', unidad: '%', estandar: '2 %', decimales: 2 }),
  Object.freeze({ clave: 'tasa_encefalopatia', label: 'Tasa de encefalopatía hipóxica postquirúrgica', formula: 'Pacientes con encefalopatía × 10 000 ÷ pacientes intervenidos', unidad: 'por 10 000', estandar: '1 en 10 000', decimales: 2 }),
]);

export function indicadoresCalculados(datos, periodo) {
  const p = produccion(datos);
  const i = (clave) => valor(datos, 'indicadores', clave);
  const dias = diasDelMes(periodo);
  const valores = {
    rendimiento_sop: cociente(p.realizadas, i('salas_utilizadas') == null ? null : i('salas_utilizadas') * dias),
    rendimiento_emergencia: cociente(p.emergencia, i('salas_emergencia') == null ? null : i('salas_emergencia') * dias),
    rendimiento_electivas: cociente(p.programadas, i('salas_programadas') == null ? null : i('salas_programadas') * dias),
    pct_suspendidas: cociente(p.suspendidas, p.agendadas, 100),
    pct_emergencia: cociente(p.emergencia, p.realizadas, 100),
    pct_horas_efectivas: cociente(p.horas.efectivas, p.horas.programadas, 100),
    tasa_mortalidad: cociente(i('defunciones'), p.realizadas, 5000),
    tasa_reintervenidos: cociente(i('reintervenidos'), p.realizadas, 100),
    tasa_encefalopatia: cociente(i('encefalopatia'), p.realizadas, 10000),
  };
  return INDICADORES_CALCULADOS.map((d) => ({ ...d, valor: valores[d.clave] }));
}

/* ------------------------------------------------------------------ DIRESA */

/* Lo que Estadística toma de Centro Quirúrgico para los indicadores de gestión
   de DIRESA (12, 13, 14 y 22) y para el boletín:
     intervenciones.ejecutadas    cirugías ejecutadas (RESUMEN)
     intervenciones.emergencia    de emergencia
     intervenciones.electivas     programadas ejecutadas
     intervenciones.suspendidas   suspendidas (SUSPENDIDAS)
     intervenciones.programadas   electivas + suspendidas: lo que se programó
     salas.utilizadas             salas de operaciones utilizadas
     suspension                   cada causa con su cifra, en el orden del área */
export function paraDiresa(datos) {
  const p = produccion(datos);
  return {
    intervenciones: { ejecutadas: p.realizadas, emergencia: p.emergencia, electivas: p.programadas, suspendidas: p.suspendidas, programadas: p.agendadas },
    salas: { utilizadas: valor(datos, 'indicadores', 'salas_utilizadas') },
    suspension: Object.fromEntries(CAUSAS.map((c) => [c.clave, valor(datos, 'suspendidas', c.clave)]).filter(([, v]) => v != null)),
  };
}
