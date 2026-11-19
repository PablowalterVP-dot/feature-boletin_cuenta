/* Tablero de inicio de Centro Quirúrgico.

   Responde, de arriba abajo, lo que el área necesita al entrar:
   1. ¿Cómo va el reporte de este mes? Estado, plazo y la acción que toca.
   2. ¿Cómo fue el último mes enviado? Cirugías, mayores, de emergencia y
      suspendidas, comparadas con el mes anterior.
   3. ¿Cómo evoluciona? Cirugías por mes, programadas y de emergencia.
   4. ¿Dónde se opera más? Cirugías del último mes por especialidad.

   Solo cuentan los meses ya enviados: un borrador a medio cargar no es una
   cifra. Los meses son los del año en curso desde enero, no solo los últimos
   ocho: un mes de enero cargado tarde también se ve. */

import { Card, Mosaic, Ranking, Stack, StackedBars, StatCard } from '@hrl/core-ui';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { PERIODOS } from '@/app/datos/reportes.js';
import { produccion, consolidadoPorEspecialidad } from '@/app/datos/formatos/centro-quirurgico-calculos.js';
import { resumenDelReporte } from '@/app/datos/formatos/resumen.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, etiquetaMes, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { numero, variacion } from '@/app/dominio/formato.js';
import { tendencia } from './tendencia.js';

const AREA = 'centro-quirurgico';
const SERIES = [
  { clave: 'programadas', nombre: 'Programadas', color: 'var(--serie-1)' },
  { clave: 'emergencia', nombre: 'Emergencia', color: 'var(--serie-2)' },
];

const mesDe = (periodo) => etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();

function Indicadores({ actual, anterior, meses }) {
  const cifras = resumenDelReporte(AREA, { datos: actual.datos }, actual.periodo);
  /* Las cifras de cada mes enviado, para la tendencia de cada tarjeta. */
  const porMes = new Map(meses.map((m) => [m.periodo, resumenDelReporte(AREA, { datos: m.datos }, m.periodo)]));
  const serie = (clave) => tendencia(actual.periodo, (p) => porMes.get(p)?.find((x) => x.clave === clave)?.valor ?? null, (v) => numero(v));
  const previas = anterior ? resumenDelReporte(AREA, { datos: anterior.datos }, anterior.periodo) : null;

  return (
    <div className="hrl-kpis">
      {cifras.map((c, i) => {
        const p = previas?.find((x) => x.clave === c.clave)?.valor;
        const v = variacion(c.valor, p, 1);
        const nota = !anterior ? 'Sin mes anterior para comparar' : v.valor == null ? v.texto : `${v.texto} frente a ${mesDe(anterior.periodo)}`;
        return <StatCard key={c.clave} label={c.etiqueta} value={c.valor == null ? '—' : numero(c.valor)} note={nota} trend={serie(c.clave)} delay={i * 60} info={`${c.ayuda} ${anterior ? v.explicacion : ''}`.trim()} />;
      })}
    </div>
  );
}

function PorMes({ meses, enCurso, vigente }) {
  return (
    <Card accent="var(--primary)" icon="sh-chart" title="Cirugías por mes" subtitle="Programadas y de emergencia, mayores y menores · del RESUMEN de cada mes">
      <Stack gap={3} style={{ padding: 'var(--space-3) var(--space-5) var(--space-4)' }}>
        <Stack direction="row" gap={4} wrap style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>
          {SERIES.map((s) => (
            <Stack key={s.nombre} direction="row" gap={2} align="center">
              <span className="hrl-leyenda-series__punto" style={{ background: s.color }} />
              {s.nombre}
            </Stack>
          ))}
        </Stack>
        <StackedBars
          labels={meses.map((m) => etiquetaMes(m.periodo))}
          series={SERIES.map((s) => ({ name: s.nombre, values: meses.map((m) => produccion(m.datos)[s.clave]), color: s.color }))}
          unit="cirugías"
          height={220}
          emptyLabel={enCurso ? `${etiquetaMes(vigente)} · en curso` : undefined}
        />
      </Stack>
    </Card>
  );
}

function PorEspecialidad({ actual }) {
  const filas = consolidadoPorEspecialidad(actual.datos)
    .filas.filter((f) => f.total)
    .map((f) => ({ name: f.label, value: f.total, color: 'var(--serie-1)' }))
    .sort((a, b) => b.value - a.value);
  return (
    <Card accent="var(--info)" icon="sh-pie" title="Cirugías por especialidad" subtitle={`${etiquetaPeriodo(actual.periodo)} · mayores y menores`}>
      <div className="hrl-cuerpo">
        <Ranking rows={filas} format={(n) => `${numero(n)} cirugías`} />
      </div>
    </Card>
  );
}

/* `indicadores`: sus indicadores directos (Inicio.jsx), bajo las cifras del último mes. */
export default function InicioCentroQuirurgico({ reportes, indicadores = null }) {
  const vigente = periodoVigente(useHoy());
  /* Un mes cuyo detalle todavía no llegó del servidor (`resumen`) no se
     dibuja: sus cifras están vacías y saldría como un cero. */
  const enviados = [...new Set([...PERIODOS, ...mesesDelAnioHasta(vigente)])]
    .sort()
    /* Hasta el mes vigente incluido: si ya se entregó, es el último enviado. */
    .filter((p) => p <= vigente)
    .map((periodo) => ({ periodo, reporte: reporteDe(reportes, AREA, periodo) }))
    .filter((m) => m.reporte && estaEntregado(m.reporte.estado) && !m.reporte.resumen)
    .map((m) => ({ periodo: m.periodo, datos: m.reporte.datos }));
  const actual = enviados.at(-1) ?? null;
  const anterior = enviados.at(-2) ?? null;
  const enCurso = !estaEntregado(reporteDe(reportes, AREA, vigente)?.estado);

  return (
    <Mosaic stacked className="hrl-panel">

      {actual ? (
        <>
          <Stack gap={2}>
            <strong style={{ fontSize: 'var(--text-md)' }}>Último mes enviado: {etiquetaPeriodo(actual.periodo)}</strong>
            <Indicadores actual={actual} anterior={anterior} meses={enviados} />
          </Stack>
          {indicadores}
          <PorMes meses={enviados} enCurso={enCurso} vigente={vigente} />
          <PorEspecialidad actual={actual} />
        </>
      ) : (
        <Card accent="var(--info)" icon="sh-chart" title="Todavía no hay meses enviados">
          <p style={{ margin: 0, padding: 'var(--space-5)' }}>Cuando envíe su primer reporte, aquí verá sus cirugías por mes.</p>
        </Card>
      )}
      {!actual && indicadores}
    </Mosaic>
  );
}
