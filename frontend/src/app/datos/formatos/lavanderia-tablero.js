/* Cifras del tablero de inicio de Costura y Lavandería.

   Funciones puras sobre la lista de reportes: qué mes fue el último enviado,
   cómo se compara con el anterior y cómo evoluciona cada medida.

   Dos reglas de honestidad que se aplican aquí y no en la pantalla:
   · Un mes sin reporte enviado vale `null`, nunca cero. La serie lo muestra
     como hueco rotulado.
   · La comparación se hace contra el **último mes enviado anterior**, no contra
     el mes calendario previo: si marzo no se envió, abril se compara con
     febrero, y la nota lo dice con el nombre del mes. */

import { GRUPOS, INSUMOS } from './lavanderia.js';
import { totalF1, totalesF3, totalPiezas, totalConfeccionado, kilosDelGrupo, filaF2Completa, cantidadDe } from './lavanderia-calculos.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, etiquetaMes } from '@/app/dominio/periodos.js';
import { variacion } from '@/app/dominio/formato.js';

const AREA = 'lavanderia';

export function enviados(reportes) {
  return reportes
    // Un mes que solo llegó como resumen (su detalle viene en camino) no es un cero: aún no se dibuja.
    .filter((r) => r.area === AREA && estaEntregado(r.estado) && r.datos && !r.resumen)
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export function ultimoEnviado(reportes) {
  return enviados(reportes).at(-1) ?? null;
}

export function enviadoAnterior(reportes, periodo) {
  return enviados(reportes).filter((r) => r.periodo < periodo).at(-1) ?? null;
}

export function cifrasDelMes(reporte) {
  if (!reporte) return null;
  const { datos, periodo } = reporte;
  const f3 = totalesF3(datos.f3 ?? {}, periodo);

  return {
    kilos: totalF1(datos.f1 ?? {}, periodo),
    piezas: totalPiezas(datos.f4 ?? {}),
    importe: f3.importeTotal,
    importeComun: f3.importeComun,
    importeSucia: f3.importeSucia,
    confeccionado: totalConfeccionado(datos.f2 ?? []),
    trabajos: (datos.f2 ?? []).filter(filaF2Completa).length,
  };
}

export function comparar(actual, anterior, clave, decimales = 1) {
  return variacion(actual?.[clave] ?? null, anterior?.[clave] ?? null, decimales);
}

/* Serie de una medida a lo largo de los periodos. */
export function serieMensual(reportes, periodos, clave) {
  const porPeriodo = new Map(enviados(reportes).map((r) => [r.periodo, r]));

  return periodos.map((p) => {
    const r = porPeriodo.get(p);
    return {
      key: p,
      label: etiquetaMes(p),
      title: etiquetaPeriodo(p),
      value: r ? cifrasDelMes(r)[clave] : null,
    };
  });
}

export function kilosPorGrupo(reporte) {
  if (!reporte) return [];
  return GRUPOS.map((g) => ({
    clave: g.clave,
    nombre: g.nombre,
    valor: kilosDelGrupo(reporte.datos.f1 ?? {}, g.clave, reporte.periodo),
  }))
    .filter((f) => f.valor != null)
    .sort((a, b) => b.valor - a.valor);
}

/* Los insumos son texto libre («16 BOLSAS DE 15 KG X MES»), no una cifra: no
   tiene sentido una variación porcentual. Se compara el texto tal cual. */
export function insumosComparados(actual, anterior) {
  return INSUMOS.map((i) => {
    const cantidad = actual?.datos?.f4?.insumos?.[i.clave] ?? null;
    const previa = anterior?.datos?.f4?.insumos?.[i.clave] ?? null;
    const comparacion = previa == null ? 'sin-comparar' : cantidad === previa ? 'igual' : 'cambio';
    return { ...i, cantidad, previa, comparacion };
  });
}

export function trabajosDelMes(reporte) {
  return (reporte?.datos?.f2 ?? []).filter(filaF2Completa).sort((a, b) => cantidadDe(b) - cantidadDe(a));
}
