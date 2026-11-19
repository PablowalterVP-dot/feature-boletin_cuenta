/* Tablero de inicio de Nutrición y Dietética.

   Responde, de arriba abajo, lo que el área necesita al entrar:
   1. ¿Cómo va el reporte de este mes? Estado, plazo y la acción que toca.
   2. ¿Cómo fue el último mes enviado? Raciones a pacientes y a comensales,
      el total y el promedio diario, comparados con el mes anterior.
   3. ¿Cómo evoluciona? Por mes, hospitalización frente a emergencia, en cada
      uno de los dos reportes del oficio.
   4. ¿Cómo se reparte? Pacientes hospitalizados por tipo de dieta y
      comensales por grupo, en el último mes.

   Solo cuentan los meses ya enviados: un borrador a medio cargar no es una
   cifra. El mes en curso se rotula aparte, nunca como un cero. */

import { Card, Mosaic, Ranking, Stack, StackedBars, StatCard } from '@hrl/core-ui';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { PERIODOS } from '@/app/datos/reportes.js';
import { FORMATOS } from '@/app/datos/formatos/nutricion.js';
import { cifrasNutricion, totalFila } from '@/app/datos/formatos/nutricion-calculos.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, etiquetaMes, diasDelMes, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { numero, variacion } from '@/app/dominio/formato.js';
import { tendencia } from './tendencia.js';

const AREA = 'nutricion';
const COLOR = { hosp: 'var(--serie-1)', emerg: 'var(--serie-2)' };

const mesDe = (periodo) => etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();

/* ------------------------------------------ 2. el último mes enviado */

function Indicadores({ actual, anterior, meses }) {
  const c = cifrasNutricion(actual.datos, actual.periodo);
  /* Los seis meses que terminan en el último enviado, para la tendencia de cada cifra. */
  const de = (p) => meses.find((m) => m.periodo === p)?.c ?? null;
  const serie = (leer) => tendencia(actual.periodo, (p) => (de(p) ? leer(de(p), p) : null), (v) => numero(v, 0));
  const p = anterior ? cifrasNutricion(anterior.datos, anterior.periodo) : null;
  const frente = (clave) => {
    if (!p) return 'Sin mes anterior para comparar';
    const v = variacion(c[clave], p[clave], 1);
    return v.valor == null ? v.texto : `${v.texto} frente a ${mesDe(anterior.periodo)}`;
  };
  const porDia = c.pacientesHosp == null ? null : c.pacientesHosp / diasDelMes(actual.periodo);

  return (
    <div className="hrl-kpis">
      <StatCard
        label="Raciones a pacientes"
        value={c.pacientes == null ? '—' : numero(c.pacientes)}
        note={frente('pacientes')}
        trend={serie((x) => x.pacientes)}
        info="Pacientes hospitalizados (por tipo de dieta) y pacientes SIS de emergencia. Reporte 2 del oficio."
      />
      <StatCard
        label="Raciones a comensales"
        value={c.comensales == null ? '—' : numero(c.comensales)}
        note={frente('comensales')}
        trend={serie((x) => x.comensales)}
        delay={60}
        info="Personal asistencial, administrativo e internos, en hospitalización y emergencia. Reporte 1 del oficio."
      />
      <StatCard
        label="Total de raciones"
        value={c.total == null ? '—' : numero(c.total)}
        note={frente('total')}
        trend={serie((x) => x.total)}
        delay={120}
        info="Comensales y pacientes. Es la cifra del resumen anual del oficio."
      />
      <StatCard
        label="Raciones diarias a hospitalizados"
        value={porDia == null ? '—' : numero(porDia, 0)}
        note={`Promedio por día en ${mesDe(actual.periodo)}`}
        trend={serie((x, p) => (x.pacientesHosp == null ? null : x.pacientesHosp / diasDelMes(p)))}
        delay={180}
        info="Raciones a pacientes hospitalizados del mes, divididas entre sus días. Sirve para anticipar insumos."
      />
    </div>
  );
}

/* ---------------------------------------------------- 3. evolución */

function Leyenda() {
  return (
    <Stack direction="row" gap={4} wrap style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>
      {[
        ['Hospitalización', COLOR.hosp],
        ['Emergencia', COLOR.emerg],
      ].map(([texto, color]) => (
        <Stack key={texto} direction="row" gap={2} align="center">
          <span className="hrl-leyenda-series__punto" style={{ background: color }} />
          {texto}
        </Stack>
      ))}
    </Stack>
  );
}

function PorMes({ titulo, subtitulo, meses, clave, enCurso, vigente }) {
  const hosp = meses.map((m) => m.c[`${clave}Hosp`]);
  const emerg = meses.map((m) => m.c[`${clave}Emerg`]);

  return (
    <Card accent="var(--primary)" icon="sh-chart" title={titulo} subtitle={subtitulo}>
      <Stack gap={3} style={{ padding: 'var(--space-3) var(--space-5) var(--space-4)' }}>
        <Leyenda />
        <StackedBars
          labels={meses.map((m) => etiquetaMes(m.periodo))}
          series={[
            { name: 'Hospitalización', values: hosp, color: COLOR.hosp },
            { name: 'Emergencia', values: emerg, color: COLOR.emerg },
          ]}
          unit="raciones"
          height={220}
          emptyLabel={enCurso ? `${etiquetaMes(vigente)} · en curso` : undefined}
        />
      </Stack>
    </Card>
  );
}

/* ---------------------------------------------------- 4. reparto */

function Reparto({ titulo, subtitulo, filas }) {
  return (
    <Card accent="var(--info)" icon="sh-pie" title={titulo} subtitle={subtitulo}>
      <div className="hrl-cuerpo">
        <Ranking rows={filas} format={(n) => `${numero(n)} raciones`} />
      </div>
    </Card>
  );
}

function porGrupo(datos, periodo, idFormato, color) {
  const f = FORMATOS.find((x) => x.id === idFormato);
  const grupos = new Map();
  for (const fila of f.filas) {
    grupos.set(fila.grupoLabel, (grupos.get(fila.grupoLabel) ?? 0) + (totalFila(datos, idFormato, fila.clave, periodo) ?? 0));
  }
  return [...grupos].map(([name, value]) => ({ name, value, color })).sort((a, b) => b.value - a.value);
}

/* ----------------------------------------------------------- tablero */

export default function InicioNutricion({ reportes }) {
  const vigente = periodoVigente(useHoy());
  /* Hasta el mes vigente incluido: si el área ya lo entregó, es el último
     enviado y sus cifras son las que se muestran. Antes se cortaba en el mes
     anterior y, con septiembre ya entregado, el tablero seguía en agosto. */
  const enviados = [...new Set([...PERIODOS, ...mesesDelAnioHasta(vigente)])]
    .sort()
    .filter((p) => p <= vigente)
    .map((periodo) => ({ periodo, reporte: reporteDe(reportes, AREA, periodo) }))
    /* Un mes cuyo detalle todavía no llegó del servidor (`resumen`) no se dibuja:
       sus casillas están vacías y saldría como un cero. Entra al llegar; los dos
       más recientes, que son los que se comparan, siempre llegan antes. */
    .filter((m) => m.reporte && estaEntregado(m.reporte.estado) && !m.reporte.resumen)
    .map((m) => ({ periodo: m.periodo, datos: m.reporte.datos, c: cifrasNutricion(m.reporte.datos, m.periodo) }));
  const actual = enviados.at(-1) ?? null;
  const anterior = enviados.at(-2) ?? null;
  const reporteVigente = reporteDe(reportes, AREA, vigente);
  const enCurso = !estaEntregado(reporteVigente?.estado);

  // Nutrición se lee de arriba abajo, una sección debajo de otra: por ahora no
  // comparte fila aunque quepa (ver CLAUDE.md § 4.6b).
  return (
    <Mosaic stacked className="hrl-panel">

      {actual ? (
        <>
          <Stack gap={2}>
            <strong style={{ fontSize: 'var(--text-md)' }}>Último mes enviado: {etiquetaPeriodo(actual.periodo)}</strong>
            <Indicadores actual={actual} anterior={anterior} meses={enviados} />
          </Stack>

          <>
            <PorMes
              titulo="Raciones a pacientes por mes"
              subtitulo="Hospitalización frente a emergencia"
              meses={enviados}
              clave="pacientes"
              enCurso={enCurso}
              vigente={vigente}
            />
            <PorMes
              titulo="Raciones a comensales por mes"
              subtitulo="Personal e internos, hospitalización frente a emergencia"
              meses={enviados}
              clave="comensales"
              enCurso={enCurso}
              vigente={vigente}
            />
          </>

          <>
            <Reparto
              titulo="Pacientes hospitalizados por dieta"
              subtitulo={`${etiquetaPeriodo(actual.periodo)} · desayuno, almuerzo y cena`}
              filas={porGrupo(actual.datos, actual.periodo, 'f3', 'var(--serie-1)')}
            />
            <Reparto
              titulo="Comensales por grupo"
              subtitulo={`${etiquetaPeriodo(actual.periodo)} · hospitalización`}
              filas={porGrupo(actual.datos, actual.periodo, 'f1', 'var(--serie-3)')}
            />
          </>

          {/* Solo con la siembra del prototipo: con servidor, todas las cifras son las del área. */}
          {!reportes.some((r) => r.area === AREA && (r.origen === 'bd' || r.resumen)) && (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--subtle-foreground)', lineHeight: 'var(--leading-normal)' }}>
              Junio es el oficio real. De enero a mayo los totales mensuales son reales (resumen anual del oficio) y el reparto por día
              es simulado; julio es simulado.
            </p>
          )}
        </>
      ) : (
        <Card accent="var(--info)" icon="sh-chart" title="Todavía no hay meses enviados">
          <p style={{ margin: 0, padding: 'var(--space-5)' }}>Cuando envíe su primer reporte, aquí verá sus raciones por mes.</p>
        </Card>
      )}
    </Mosaic>
  );
}
