/* El consolidado anual de Laboratorio: la hoja CONSOLIDADO del libro del área.

   En el libro, CONSOLIDADO suma las doce hojas del año con fórmulas, y esas
   fórmulas se rompen cuando cambian las filas de un mes (en el libro de 2025
   varios totales dan #REF! y #VALUE!). Aquí lo arma el bot con los meses
   ENTREGADOS, casilla por casilla, y se descarga con la misma forma que la
   hoja del mes (plantilla.js), con «ENERO A DICIEMBRE» en su «Mes:».

   Un mes sin reporte entregado no suma ni cuenta como cero: queda fuera, y el
   consolidado dice qué meses trae. Una casilla que ningún mes registró queda
   vacía (null), no en cero.

     meses: [{ periodo: 'AAAA-MM', datos }]   los meses entregados del año */

import { CUADROS } from './definicion.js';
import { valor, totalCuadro, sumar } from './calculos.js';
import { crearPlantilla } from './plantilla.js';

export const MESES = Object.freeze(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']);

function delAnio(anio, meses) {
  return (meses ?? []).filter((m) => m.periodo.startsWith(`${anio}-`) && m.datos);
}

/* La suma del año de cada casilla, y el total de cada sección mes por mes. */
export function consolidadoDe(anio, meses) {
  const entregados = delAnio(anio, meses);
  const datos = {};
  for (const c of CUADROS) {
    const cuadro = {};
    for (const f of c.filas) {
      const suma = sumar(entregados.map((m) => valor(m.datos, c.id, f.clave)));
      if (suma != null) cuadro[f.clave] = suma;
    }
    if (Object.keys(cuadro).length) datos[c.id] = cuadro;
  }
  const porMes = (id) => MESES.map((_, i) => {
    const m = entregados.find((x) => Number(x.periodo.slice(5, 7)) === i + 1);
    return m ? totalCuadro(m.datos, id) : null;
  });
  return {
    anio: String(anio),
    meses: MESES,
    conDato: MESES.map((_, i) => entregados.some((m) => Number(m.periodo.slice(5, 7)) === i + 1)),
    datos,
    secciones: CUADROS.map((c) => ({ id: c.id, titulo: c.titulo, unidad: c.unidad, porMes: porMes(c.id), acumulado: totalCuadro(datos, c.id) })),
  };
}

/* El .xlsx: la hoja CONSOLIDADO con la forma de la hoja del mes. */
export function crearConsolidado(anio, meses) {
  const { datos } = consolidadoDe(anio, meses);
  return crearPlantilla(`${anio}-01`, datos, { hoja: 'CONSOLIDADO', mesEscrito: 'ENERO A DICIEMBRE' });
}

export function nombreDelConsolidado(anio) {
  return `Laboratorio_CONSOLIDADO_${anio}.xlsx`;
}
