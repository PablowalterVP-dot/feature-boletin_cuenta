/* Lo que Estadística ve de un reporte recibido: sus
   comprobaciones y la cifra que resume el mes.

   Las áreas con oficio levantado tienen sus propias validaciones entre
   formatos; las demás, las reglas de su estructura propuesta. Las dos se
   devuelven con la misma forma, para que la bandeja no tenga que distinguirlas:
     { items: [{ id, texto, estado: ok|error|aviso|sin-evaluar, detalle? }],
       errores, avisos, cumplidas, total } */

import { formularioDe, datosCompletos } from './levantados.js';
import { cifraPrincipal as cifraLevantada } from './resumen.js';
import { evaluarReglas, cifraPrincipal as cifraSimulada } from './areas-simuladas.js';

function resumir(items) {
  return {
    items,
    errores: items.filter((i) => i.estado === 'error').length,
    avisos: items.filter((i) => i.estado === 'aviso').length,
    cumplidas: items.filter((i) => i.estado === 'ok').length,
    total: items.filter((i) => i.estado !== 'aviso').length,
  };
}

export function revisionDe(claveArea, reporte) {
  if (!reporte?.datos || Object.keys(reporte.datos).length === 0) return null;

  const formulario = formularioDe(claveArea);
  if (formulario) {
    const v = formulario.validar(datosCompletos(claveArea, reporte.datos), reporte.periodo);
    return resumir([
      ...formulario.chequeos.map((ch) => {
        /* Nutrición nombra el error por su regla en `id`; Laboratorio le da un
           `id` único y la regla en `regla` (la base exige ids únicos por carga). */
        const hallazgo = v.errores.find((e) => (e.regla ?? e.id) === ch.id);
        /* Un error de una carga histórica entregada tal cual sigue en error (el
           original no cuadra), pero se dice por qué se entregó así. */
        const documentado = hallazgo ? reporte.datos.justificaciones?.[hallazgo.id]?.trim() : null;
        return { id: ch.id, texto: ch.texto, estado: hallazgo ? 'error' : 'ok', detalle: documentado ? `${hallazgo.detalle} Entregado así: «${documentado}»` : hallazgo?.detalle };
      }),
      /* Si el área justificó la alerta (Nutrición lo exige antes de enviar),
         Estadística lee su explicación en lugar de la advertencia genérica. */
      ...v.avisos.map((a) => {
        const justificacion = reporte.datos.justificaciones?.[a.id]?.trim();
        return { id: a.id, texto: a.titulo, estado: 'aviso', detalle: justificacion ? `El área la revisó: «${justificacion}»` : a.detalle };
      }),
    ]);
  }

  return resumir(
    evaluarReglas(claveArea, reporte.datos).map((r) => ({
      id: r.id,
      texto: r.texto,
      estado: r.cumple === true ? 'ok' : r.cumple === false ? 'error' : 'sin-evaluar',
    })),
  );
}

export function cifraDelReporte(claveArea, reporte) {
  if (!reporte?.datos) return null;
  if (formularioDe(claveArea)) return cifraLevantada(claveArea, reporte, reporte.periodo);
  return cifraSimulada(claveArea, reporte.datos);
}
