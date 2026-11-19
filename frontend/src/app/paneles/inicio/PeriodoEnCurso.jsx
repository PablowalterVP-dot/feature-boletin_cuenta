/* Avance de los formatos del reporte del mes, en el tablero de un área
   levantada. Cada paso abre directamente ese formato en el reporte.

   Antes esta tarjeta decía también el estado, el plazo y la acción del mes.
   Eso lo dice ahora Dr. Mochi, una sola vez, bajo la cabecera (AvisoMochi):
   aquí queda solo lo que el aviso no tiene, el avance de cada formato. Con el
   reporte ya entregado no se dibuja: no queda nada por avanzar. */

import { Card, Steps } from '@hrl/core-ui';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { formularioDe, datosCompletos, pasosDe } from '@/app/datos/formatos/levantados.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo } from '@/app/dominio/periodos.js';

export default function PeriodoEnCurso({ reportes, claveArea, irA }) {
  const periodo = periodoVigente(useHoy());
  const formulario = formularioDe(claveArea);
  const reporte = reporteDe(reportes, claveArea, periodo);
  if (estaEntregado(reporte?.estado)) return null;
  const datos = datosCompletos(claveArea, reporte?.datos);
  const pasos = pasosDe(claveArea, datos, periodo, formulario.validar(datos, periodo));

  return (
    <Card title={`Avance de ${etiquetaPeriodo(periodo)}`} subtitle="Cada formato del reporte; pulse uno para abrirlo">
      <Steps
        steps={pasos}
        active={null}
        onChange={(clave) => irA('reporte', { paso: clave })}
        label={`Avance de los ${formulario.formatos.length} formatos`}
      />
    </Card>
  );
}
