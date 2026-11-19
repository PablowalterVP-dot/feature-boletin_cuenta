/* Tablero de inicio de Patología Clínica y Anatomía Patológica (Laboratorio).

   Responde, de arriba abajo, lo que el área necesita al entrar:
   1. ¿Cómo va el reporte de este mes? Estado, plazo y la acción que toca.
   2. ¿Cómo fue el último mes enviado? Exámenes, patología clínica, anatomía
      patológica y unidades de sangre, comparados con el mes anterior.
   3. ¿Cómo evoluciona? Exámenes por mes, por procedencia.
   4. ¿Cómo se reparte? Exámenes del último mes por sección.

   Banco de Sangre cuenta unidades entregadas, no exámenes: tiene su propia
   cifra y no se suma a los exámenes (resumen.js). Solo cuentan los meses ya
   enviados: un borrador a medio cargar no es una cifra. El mes en curso se
   rotula aparte, nunca como un cero. */

import { Card, Mosaic, Ranking, Stack, StackedBars, StatCard } from '@hrl/core-ui';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { PERIODOS } from '@/app/datos/reportes.js';
import { CUADROS } from '@/app/datos/formatos/laboratorio.js';
import { totalCuadro, totalProcedencia, sumar } from '@/app/datos/formatos/laboratorio-calculos.js';
import { resumenDelReporte } from '@/app/datos/formatos/resumen.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, etiquetaMes, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { numero, variacion } from '@/app/dominio/formato.js';
import { tendencia } from './tendencia.js';

const AREA = 'laboratorio';
const EXAMENES = CUADROS.filter((c) => c.unidad === 'exámenes');
/* Las tres procedencias que más pesan, y el resto junto: seis tramos por
   barra no se distinguen a simple vista. «Programa» es la tercera columna de
   Metaxénicas: va con el resto. */
export const SERIES = [
  { claves: ['hospitalizacion'], nombre: 'Hospitalización', color: 'var(--serie-1)' },
  { claves: ['emergencia'], nombre: 'Emergencia', color: 'var(--serie-2)' },
  { claves: ['c_externa'], nombre: 'Consulta externa', color: 'var(--serie-3)' },
  { claves: ['privado', 'convenio', 'insolvencia', 'programa'], nombre: 'Privado, convenio, insolvencia y programas', color: 'var(--serie-4)' },
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
  const valores = (s) => meses.map((m) => sumar(EXAMENES.flatMap((c) => s.claves.map((p) => totalProcedencia(m.datos, c.id, p)))));

  return (
    <Card accent="var(--primary)" icon="sh-chart" title="Exámenes por mes" subtitle="Por procedencia · sin Banco de Sangre, que cuenta unidades">
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
          series={SERIES.map((s) => ({ name: s.nombre, values: valores(s), color: s.color }))}
          unit="exámenes"
          height={220}
          emptyLabel={enCurso ? `${etiquetaMes(vigente)} · en curso` : undefined}
        />
      </Stack>
    </Card>
  );
}

function PorSeccion({ actual }) {
  const filas = EXAMENES.map((c) => ({ name: c.titulo, value: totalCuadro(actual.datos, c.id) ?? 0, color: 'var(--serie-1)' })).sort((a, b) => b.value - a.value);
  return (
    <Card accent="var(--info)" icon="sh-pie" title="Exámenes por sección" subtitle={`${etiquetaPeriodo(actual.periodo)} · en las seis procedencias`}>
      <div className="hrl-cuerpo">
        <Ranking rows={filas} format={(n) => `${numero(n)} exámenes`} />
      </div>
    </Card>
  );
}

export default function InicioLaboratorio({ reportes }) {
  const vigente = periodoVigente(useHoy());
  /* Un mes cuyo detalle todavía no llegó del servidor (`resumen`) no se
     dibuja: sus casillas están vacías y saldría como un cero. */
  /* Hasta el mes vigente incluido: si el área ya lo entregó, es el último
     enviado y sus cifras son las que se muestran. Antes se cortaba en el mes
     anterior y, con septiembre ya entregado, el tablero seguía en agosto. */
  const enviados = [...new Set([...PERIODOS, ...mesesDelAnioHasta(vigente)])]
    .sort()
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
          <PorMes meses={enviados} enCurso={enCurso} vigente={vigente} />
          <PorSeccion actual={actual} />
        </>
      ) : (
        <Card accent="var(--info)" icon="sh-chart" title="Todavía no hay meses enviados">
          <p style={{ margin: 0, padding: 'var(--space-5)' }}>Cuando envíe su primer reporte, aquí verá sus exámenes por mes.</p>
        </Card>
      )}
    </Mosaic>
  );
}

