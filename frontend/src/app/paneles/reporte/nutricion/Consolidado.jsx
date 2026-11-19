/* Consolidado del mes: lo primero que se ve al revisar.

   Los dos reportes del oficio —Comensales y Pacientes— con su reparto entre
   hospitalización y emergencia, el total y la comparación con el mes
   anterior. Es la lectura de un vistazo que el área hace antes de enviar; el
   detalle día por día queda debajo, para cuando algo no cuadra.

   El acumulado del año ya no se ofrece aquí: es una lectura de Estadística y
   de Planeamiento, no algo que el área necesite para enviar su mes. */

import { Grid, StatCard } from '@hrl/core-ui';
import { cifrasNutricion } from '@/app/datos/formatos/nutricion-calculos.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { numero, variacion } from '@/app/dominio/formato.js';

function frente(actual, previo, anterior) {
  if (!anterior || actual == null || previo == null) return null;
  const v = variacion(actual, previo, 0);
  const mes = etiquetaPeriodo(anterior.periodo).toLowerCase();
  if (v.valor == null) return null;
  return Math.abs(v.valor) < 0.5 ? `Igual que ${mes}` : `${v.texto} frente a ${mes}`;
}

export default function Consolidado({ datos, periodo, anterior }) {
  const c = cifrasNutricion(datos, periodo);
  const p = anterior ? cifrasNutricion(anterior.datos, anterior.periodo) : null;
  const reparto = (h, e) => (h == null && e == null ? 'Sin datos' : `Hosp. ${numero(h ?? 0)} · Emerg. ${numero(e ?? 0)}`);

  return (
    /* `auto-fit` y no el `auto-fill` del Grid: con tres tarjetas, auto-fill
       dejaba columnas vacías a la derecha en pantallas anchas. */
    <Grid gap={4} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
      <StatCard
        label="Raciones a comensales"
        value={c.comensales == null ? '—' : numero(c.comensales)}
        note={[reparto(c.comensalesHosp, c.comensalesEmerg), frente(c.comensales, p?.comensales, anterior)].filter(Boolean).join(' · ')}
        info="Reporte 1 del oficio: personal asistencial, administrativo e internos. Es una de las dos cifras que Planeamiento registraría en CPlan (por confirmar)."
      />
      <StatCard
        label="Raciones a pacientes"
        value={c.pacientes == null ? '—' : numero(c.pacientes)}
        note={[reparto(c.pacientesHosp, c.pacientesEmerg), frente(c.pacientes, p?.pacientes, anterior)].filter(Boolean).join(' · ')}
        delay={60}
        info="Reporte 2 del oficio: pacientes hospitalizados por tipo de dieta y pacientes SIS de emergencia. La otra cifra que usaría Planeamiento (por confirmar)."
      />
      <StatCard
        label="Total del mes"
        value={c.total == null ? '—' : numero(c.total)}
        note={frente(c.total, p?.total, anterior) ?? 'Comensales y pacientes'}
        delay={120}
        info="Suma de los dos reportes. El oficio no trae consultorio externo: DIRESA recibe esa columna vacía."
      />
    </Grid>
  );
}
