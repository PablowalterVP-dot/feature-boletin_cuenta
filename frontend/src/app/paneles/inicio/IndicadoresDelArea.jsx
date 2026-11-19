/* Los indicadores del área, en su propia cuenta (07/11/2026).

   **Un indicador por tema y una sola fuente: lo que el área envió.** Centro Quirúrgico tenía el
   mismo tema medido dos veces (rendimiento de sala y suspendidas, en GERESA y en el DL 1153); se
   quedan los cuatro de GERESA, que son más, y Gineco-Obstetricia su tasa de cesárea
   (`INDICADORES_DEL_AREA`). Se calculan solo con los reportes del área ya entregados al sistema:
   ni el cuadro de GERESA que Estadística llevó a mano, ni la cifra oficial del DL 1153, ni los
   ajustes que digita Estadística (las salas de un mes, por ejemplo: aquí valen las del libro del
   área). Así lo que el área ve es lo que ella misma reportó.

   Son las mismas tarjetas de Monitoreo Indicadores (`Tarjeta` y `Detalle` de PanelGestion, en
   su modo `delArea`). El detalle se abre en el mismo Inicio (`#/inicio?indicador=12`). */

import { useMemo } from 'react';
import { Mosaic } from '@hrl/core-ui';
import { INDICADORES as GERESA } from '@/app/datos/diresa/indicadores.js';
import { INDICADORES_DEL_AREA } from '@/app/datos/monitoreo-lecturas.js';
import { useHoy } from '@/app/datos/store.js';
import { mesesDelAnioHasta, periodoVigente } from '@/app/dominio/periodos.js';
import { calcularSeguro, Detalle, lecturaDe, Tarjeta } from '@/app/paneles/monitoreo/PanelGestion.jsx';

export const tieneIndicadores = (area) => Boolean(INDICADORES_DEL_AREA[area]);

/* ¿La ruta pide el detalle de uno de sus indicadores? */
export function pideDetalle(area, params = {}) {
  return Boolean(INDICADORES_DEL_AREA[area]?.includes(Number(params.indicador)));
}

/* Sin datos de Estadística: el cálculo usa solo los reportes del área. */
const SIN_DATOS_DE_ESTADISTICA = Object.freeze({});
/* Sin cuadro de GERESA: cada mes es lo que el sistema calcula con el reporte del área. */
const SIN_CUADRO = Object.freeze([]);

/* Sus indicadores, con la serie de cada mes del año hasta el vigente. */
export function indicadoresDelArea(area, reportes, vigente) {
  const meses = mesesDelAnioHasta(vigente);
  const delArea = reportes.filter((r) => r.area === area);
  const calculados = new Map(meses.map((p) => [p, calcularSeguro(p, delArea, SIN_DATOS_DE_ESTADISTICA)]));
  return GERESA.filter((i) => INDICADORES_DEL_AREA[area].includes(i.n)).map((i) => ({ indicador: i, lectura: lecturaDe(i, SIN_CUADRO, meses, calculados) }));
}

function useIndicadoresDelArea(area, reportes) {
  const vigente = periodoVigente(useHoy());
  return useMemo(() => indicadoresDelArea(area, reportes, vigente), [area, reportes, vigente]);
}

/* El detalle de uno de sus indicadores, en lugar del tablero. */
export function DetalleDelArea({ area, reportes, params, irA }) {
  const lista = useIndicadoresDelArea(area, reportes);
  const pedido = lista.find((x) => x.indicador.n === Number(params.indicador));
  if (!pedido) return null;
  return <Detalle indicador={pedido.indicador} lectura={pedido.lectura} volver={() => irA('inicio')} volverA="Inicio" delArea />;
}

/* La sección del Inicio. */
export default function IndicadoresDelArea({ area, reportes, irA }) {
  const lista = useIndicadoresDelArea(area, reportes);
  return (
    <section className="hrl-indicadores-area" aria-labelledby="hrl-indicadores-area-titulo">
      <h2 id="hrl-indicadores-area-titulo" className="hrl-monitoreo__bloque">
        Sus indicadores
      </h2>
      <p className="hrl-monitoreo__motivo">Calculados con los reportes que su área envió al sistema este año. Un mes sin reporte entregado queda sin dato, no en cero.</p>
      <Mosaic>
        {lista.map(({ indicador, lectura }) => (
          <Tarjeta key={indicador.n} indicador={indicador} lectura={lectura} abrir={(n) => irA('inicio', { indicador: String(n) })} delArea />
        ))}
      </Mosaic>
    </section>
  );
}
