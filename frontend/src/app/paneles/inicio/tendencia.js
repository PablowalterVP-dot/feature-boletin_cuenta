/* La tendencia de una cifra del tablero de un área: los seis meses que terminan
   en el último enviado, para la minigráfica de StatCard (`trend`).

   Los meses son consecutivos aunque falte alguno: un mes sin reporte enviado
   queda como hueco (`null`), no como cero ni se salta, porque saltarlo
   juntaría dos meses que no son vecinos y la forma diría otra cosa. */
import { estaEntregado } from '@/app/dominio/estados.js';
import { mesAnterior, etiquetaPeriodo } from '@/app/dominio/periodos.js';

const MESES = 6;

/* `valorDe(periodo)` devuelve la cifra de ese mes, o null si no la hay. */
export function tendencia(hasta, valorDe, format) {
  const periodos = Array.from({ length: MESES }, (_, i) => mesAnterior(hasta, MESES - 1 - i));
  return {
    label: `De ${etiquetaPeriodo(periodos[0]).toLowerCase()} a ${etiquetaPeriodo(hasta).toLowerCase()}`,
    format,
    points: periodos.map((p) => {
      const v = valorDe(p);
      return { label: etiquetaPeriodo(p).slice(0, 3), title: etiquetaPeriodo(p), value: typeof v === 'number' && Number.isFinite(v) ? v : null };
    }),
  };
}

/* El reporte enviado de un área en un mes, con su detalle ya cargado: uno que
   solo trae el resumen del servidor saldría vacío, como un cero. */
export function enviadoDe(reportes, area, periodo) {
  return reportes.find((r) => r.area === area && r.periodo === periodo && estaEntregado(r.estado) && r.datos && !r.resumen) ?? null;
}
