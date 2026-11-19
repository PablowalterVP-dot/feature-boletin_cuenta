/* El consolidado anual de Centro Quirúrgico: el reporte 1 del área, la hoja
   «PRODUCCION ASISTENCIAL DE INTERVENCIONES QUIRURGICAS» con los doce meses
   (cirugías mayores y menores, programadas y de emergencia, las horas y las
   suspendidas), más el consolidado por especialidad del año y su Top Ten.

   En el libro del área esta hoja se llena a mano o con vínculos a los libros
   de cada mes ([1]Resumen!…), que se rompen al mover los archivos. Aquí la
   arma el bot con los meses ENTREGADOS: el área solo sube su libro del mes.

   Un mes sin reporte entregado queda vacío, no en cero, y el consolidado dice
   qué meses trae.

     meses: [{ periodo: 'AAAA-MM', datos }]   los meses entregados del año */

import { MESES_LARGOS, CONCEPTOS_RESUMEN, TIPOS, ESPECIALIDADES } from './definicion.js';
import { valor, sumar, procedimientosDe } from './calculos.js';
import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';

export const MESES = MESES_LARGOS;

function delAnio(anio, meses) {
  return (meses ?? []).filter((m) => m.periodo.startsWith(`${anio}-`) && m.datos);
}

const delMes = (entregados, i) => entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1) ?? null;

export function consolidadoDe(anio, meses) {
  const entregados = delAnio(anio, meses);
  const porMes = (leer) => MESES.map((_, i) => {
    const m = delMes(entregados, i);
    return m ? leer(m.datos) : null;
  });

  const conceptos = CONCEPTOS_RESUMEN.map((c) => {
    const tipos = Object.fromEntries(TIPOS.map((t) => [t.clave, porMes((d) => valor(d, 'resumen', `${c.clave}.${t.clave}`))]));
    const total = MESES.map((_, i) => sumar(TIPOS.map((t) => tipos[t.clave][i])));
    return {
      clave: c.clave, label: c.corto, unidad: c.unidad, decimal: c.decimal,
      porMes: tipos, total,
      acumulado: { ...Object.fromEntries(TIPOS.map((t) => [t.clave, sumar(tipos[t.clave])])), total: sumar(total) },
    };
  });

  const especialidades = ESPECIALIDADES.map((e) => {
    const de = (tipo) => (e.en.includes(tipo) ? porMes((d) => valor(d, tipo, e.clave)) : MESES.map(() => null));
    const mayor = de('mayor');
    const menor = de('menor');
    return { clave: e.clave, label: e.label, mayor: { porMes: mayor, acumulado: sumar(mayor) }, menor: { porMes: menor, acumulado: sumar(menor) } };
  });

  /* El Top Ten del año: cada procedimiento con su cifra mes a mes y la del año. */
  const topTenDelAnio = (tipo) => {
    const filas = new Map();
    entregados.forEach((m) => {
      const i = Number(m.periodo.slice(5, 7)) - 1;
      for (const p of procedimientosDe(m.datos, tipo)) {
        const f = filas.get(p.clave) ?? { ...p, porMes: MESES.map(() => null), total: 0 };
        f.porMes[i] = (f.porMes[i] ?? 0) + p.valor;
        f.total += p.valor;
        filas.set(p.clave, f);
      }
    });
    return [...filas.values()]
      .filter((f) => f.total > 0)
      .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, 'es'))
      .slice(0, 10)
      .map(({ clave, rotulo, especialidad, especialidadLabel, porMes: pm, total }) => ({ clave, rotulo, especialidad, especialidadLabel, porMes: pm, total }));
  };

  return {
    anio: String(anio),
    meses: MESES,
    conDato: MESES.map((_, i) => delMes(entregados, i) != null),
    conceptos,
    especialidades,
    topTen: { mayor: topTenDelAnio('mayor'), menor: topTenDelAnio('menor') },
  };
}

/* ------------------------------------------------------------- el .xlsx */

const cabecera = (v) => ({ v, estilo: ESTILO.cabecera });
const etiqueta = (v) => ({ v, estilo: ESTILO.etiqueta });
const cifra = (v) => ({ v: v ?? null, estilo: ESTILO.entrada });
const total = (v) => ({ v: v ?? null, estilo: ESTILO.total });

function nota(c, generado) {
  const n = c.conDato.filter(Boolean).length;
  return { v: `Generado por el Sistema de Reporte Estadístico${generado ? ` el ${generado}` : ''} con ${n} ${n === 1 ? 'mes enviado' : 'meses enviados'}. Un mes en blanco no tiene reporte: no es cero.`, estilo: ESTILO.nota };
}

/* RESUMEN: la hoja del área, con un par de columnas por mes y el acumulado. */
function hojaResumen(c, generado) {
  const filas = [[{ v: `PRODUCCION ASISTENCIAL DE INTERVENCIONES QUIRURGICAS ${c.anio}`, estilo: ESTILO.titulo }], []];
  const combinadas = [`A1:${letraDeColumna(27)}1`];
  filas.push([null, ...c.meses.flatMap((m) => [cabecera(m), cabecera(null)]), cabecera('ACUMULADO'), cabecera(null)]);
  filas.push([null, ...[...c.meses, 'ACUMULADO'].flatMap(() => [cabecera('CIRUGIA PROGR'), cabecera('CIRUGIA EMERG')])]);
  [...c.meses, null].forEach((_, i) => combinadas.push(`${letraDeColumna(2 + 2 * i)}3:${letraDeColumna(3 + 2 * i)}3`));
  for (const k of c.conceptos) {
    filas.push([
      etiqueta(k.label.toUpperCase()),
      ...c.meses.flatMap((_, i) => TIPOS.map((t) => cifra(k.porMes[t.clave][i]))),
      ...TIPOS.map((t) => total(k.acumulado[t.clave])),
    ]);
  }
  filas.push([nota(c, generado)]);
  combinadas.push(`A${filas.length}:${letraDeColumna(27)}${filas.length}`);
  return { nombre: 'RESUMEN', primera: true, filas, combinadas, anchos: [28, ...Array(26).fill(10)], congelar: { filas: 4, columnas: 1 } };
}

/* CONSOLIDADO: cirugía mayor y menor por especialidad, mes a mes. */
function hojaEspecialidades(c, generado) {
  const filas = [[{ v: `INTERVENCIONES QUIRÚRGICAS EJECUTADAS POR ESPECIALIDAD ${c.anio}`, estilo: ESTILO.titulo }], []];
  filas.push([cabecera(null), cabecera('ESPECIALIDAD'), ...c.meses.map((m) => cabecera(m.slice(0, 3))), cabecera('TOTAL')]);
  for (const tipo of ['mayor', 'menor']) {
    const lista = c.especialidades.filter((e) => ESPECIALIDADES.find((x) => x.clave === e.clave).en.includes(tipo));
    lista.forEach((e, i) => filas.push([i === 0 ? etiqueta(`CIRUGIA ${tipo.toUpperCase()}`) : null, etiqueta(e.label), ...e[tipo].porMes.map(cifra), total(e[tipo].acumulado)]));
    const sub = c.meses.map((_, i) => sumar(lista.map((e) => e[tipo].porMes[i])));
    filas.push([total('Sub Total'), total(null), ...sub.map(total), total(sumar(sub))]);
  }
  filas.push([nota(c, generado)]);
  return { nombre: 'CONSOLIDADO', filas, anchos: [16, 34, ...Array(12).fill(8), 10], congelar: { filas: 3, columnas: 2 } };
}

/* TOP TEN: los diez procedimientos más frecuentes del año, mayores y menores. */
function hojaTopTen(c, generado) {
  const filas = [[{ v: `10 INTERVENCIONES QUIRÚRGICAS MÁS FRECUENTES ${c.anio}`, estilo: ESTILO.titulo }], []];
  for (const tipo of ['mayor', 'menor']) {
    filas.push([cabecera(`CIRUGIA ${tipo.toUpperCase()}`), cabecera('ESPECIALIDAD'), ...c.meses.map((m) => cabecera(m.slice(0, 3))), cabecera('TOTAL')]);
    for (const p of c.topTen[tipo]) filas.push([etiqueta(p.rotulo), etiqueta(p.especialidadLabel), ...p.porMes.map(cifra), total(p.total)]);
    filas.push([]);
  }
  filas.push([nota(c, generado)]);
  return { nombre: 'TOP TEN', filas, anchos: [40, 30, ...Array(12).fill(8), 10] };
}

export function crearConsolidado(anio, meses, { generado } = {}) {
  const c = consolidadoDe(anio, meses);
  return crearLibro({ hojas: [hojaResumen(c, generado), hojaEspecialidades(c, generado), hojaTopTen(c, generado)] });
}

export function nombreDelConsolidado(anio) {
  return `Centro_Quirurgico_CONSOLIDADO_${anio}.xlsx`;
}
