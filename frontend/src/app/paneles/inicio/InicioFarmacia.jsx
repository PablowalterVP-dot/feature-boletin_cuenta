/* Tablero de inicio de Farmacia.

   De arriba abajo, lo que el departamento necesita al entrar:
   1. ¿Cómo va el reporte de este mes? Estado, plazo y avance de cada formato.
   2. ¿Cómo fue el último mes enviado? Atenciones totales, SIS, boletas y
      convenios, cada una frente al último mes enviado anterior, nombrándolo.
   3. ¿Cómo evoluciona? Atenciones por mes; un mes sin reporte sale rotulado
      «Sin reporte», nunca como cero.
   4. ¿De dónde vienen? Reparto por tipo de atención y SIS por servicio. */

import { Alert, Button, Card, EmptyState, Mosaic, Ranking, SeriesBars, StatCard } from '@hrl/core-ui';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { ultimoEnviado, enviadoAnterior, cifrasDelMes, comparar, serieMensual, porTipoDeAtencion, sisPorComponente } from '@/app/datos/formatos/farmacia-tablero.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import PeriodoEnCurso from './PeriodoEnCurso.jsx';
import { tendencia, enviadoDe } from './tendencia.js';

const AREA = 'farmacia';

const mesDe = (periodo) => etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();
const cifra = (valor) => (valor == null ? SIN_DATOS : `${numero(valor)} atenciones`);
const formatoAtenciones = (n) => `${numero(n)} atenciones`;

/* ----------------------------------------------- 2. el último mes enviado */

function Indicadores({ actual, anterior, reportes }) {
  const c = cifrasDelMes(actual);
  /* Los seis meses que terminan en el último enviado, para la tendencia de cada cifra. */
  const serie = (clave) => tendencia(actual.periodo, (p) => cifrasDelMes(enviadoDe(reportes, AREA, p))?.[clave] ?? null);
  const p = cifrasDelMes(anterior);
  const nota = (clave) => {
    const v = comparar(c, p, clave);
    return v.valor == null ? 'Sin mes anterior para comparar' : `${v.texto} frente a ${mesDe(anterior.periodo)}`;
  };

  return (
    <div className="hrl-kpis">
      <StatCard
        label="Atenciones totales"
        value={cifra(c.atenciones)}
        trend={serie('atenciones')}
        note={nota('atenciones')}
        info="Total del Formato 1: SIS más convenios, programas, boletas de venta, crédito personal, Defensa Nacional e insolvencias. Se calcula, no se digita. Cuenta atenciones, no recetas ni pacientes. Se compara con el último mes enviado anterior."
      />
      <StatCard
        label="Atenciones SIS"
        value={cifra(c.sis)}
        trend={serie('sis')}
        note={nota('sis')}
        delay={60}
        info="Hospitalización, emergencia, consulta externa, hemodiálisis y oncología cubiertas por el Seguro Integral de Salud (SIS)."
      />
      <StatCard
        label="Boletas de venta"
        value={cifra(c.boletas)}
        trend={serie('boletas')}
        note={nota('boletas')}
        delay={120}
        info="Atenciones que el paciente pagó directamente, con boleta de venta."
      />
      <StatCard
        label="Convenios"
        value={cifra(c.convenios)}
        trend={serie('convenios')}
        note={nota('convenios')}
        delay={180}
        info="Atenciones cubiertas por una entidad con convenio con el hospital: emergencia, hospitalizados y consultorio."
      />
    </div>
  );
}

/* --------------------------------------------------------- 3. evolución */

function AtencionesPorMes({ reportes, vigente }) {
  /* Farmacia reporta por el sistema desde enero: la serie es del año. */
  const puntos = serieMensual(reportes, mesesDelAnioHasta(vigente), 'atenciones').map((p) =>
    p.value == null && p.key !== vigente ? { ...p, detail: 'No se envió reporte de este mes' } : p,
  );

  return (
    <Card accent="var(--primary)" icon="sh-chart" title="Atenciones por mes" subtitle="Total de atenciones del Formato 1">
      <div style={{ padding: '18px 20px 14px' }}>
        <SeriesBars points={puntos} unit="atenciones" noDataLabel="Sin reporte" emptyTail="En curso" label="Atenciones de Farmacia por mes" />
      </div>
    </Card>
  );
}

function RankingCard({ titulo, subtitulo, filas, vacio, pie }) {
  return (
    <Card accent="var(--primary)" icon="sh-pie" title={titulo} subtitle={subtitulo}>
      {filas.length === 0 ? (
        <EmptyState icon="sh-chart" title="Sin cifras" body={vacio} />
      ) : (
        <div className="hrl-cuerpo">
          <Ranking rows={filas.map((f) => ({ name: f.nombre, value: f.valor, color: 'var(--primary)' }))} format={formatoAtenciones} />
        </div>
      )}
      {pie && <p style={{ margin: 0, padding: '0 20px 16px', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{pie}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------- tablero */

export default function InicioFarmacia({ reportes, irA }) {
  const vigente = periodoVigente(useHoy());
  const actual = ultimoEnviado(reportes);
  const anterior = actual ? enviadoAnterior(reportes, actual.periodo) : null;

  const faltan = mesesDelAnioHasta(vigente).filter((p) => p < vigente && !estaEntregado(reporteDe(reportes, AREA, p)?.estado ?? 'no_iniciado'));

  return (
    <Mosaic className="hrl-panel">
      <PeriodoEnCurso reportes={reportes} claveArea={AREA} irA={irA} />

      {faltan.length > 0 && (
        <Alert
          tone="warning"
          title={`${faltan.map(etiquetaPeriodo).join(', ')} ${faltan.length === 1 ? 'sigue' : 'siguen'} sin reporte`}
          action={
            <Button tone="ghost" size="sm" icon="sh-upload" onClick={() => irA('reporte', { periodo: faltan[0] })}>
              Subir el de {etiquetaPeriodo(faltan[0]).toLowerCase()}
            </Button>
          }
        >
          Cada mes se llena subiendo su informe en Word. En «Reporte del mes» elija el mes en la lista.
        </Alert>
      )}

      {actual ? (
        <>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--foreground)' }}>
              Último mes enviado: {etiquetaPeriodo(actual.periodo)}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>
              Cifras que Farmacia envió por el sistema: subiendo su informe en Word o digitándolas.
            </p>
          </div>

          <Indicadores actual={actual} anterior={anterior} reportes={reportes} />

          <AtencionesPorMes reportes={reportes} vigente={vigente} />

          <>
            <RankingCard
              titulo="Reparto por tipo de atención"
              subtitulo={etiquetaPeriodo(actual.periodo)}
              filas={porTipoDeAtencion(actual).sort((a, b) => b.valor - a.valor)}
              vacio="El Formato 1 de este mes no registra atenciones."
              pie="Un tipo en cero se muestra: es un dato registrado. Un tipo sin registrar no aparece."
            />
            <RankingCard
              titulo="SIS por servicio"
              subtitulo={etiquetaPeriodo(actual.periodo)}
              filas={sisPorComponente(actual).sort((a, b) => b.valor - a.valor)}
              vacio="El Formato 1 de este mes no registra atenciones SIS."
            />
          </>
        </>
      ) : (
        <Card accent="var(--info)" icon="sh-pie" title="Cifras del área">
          <EmptyState icon="sh-chart" title="Todavía no hay meses enviados" body="Las cifras aparecen aquí en cuanto se envíe el primer informe. Empiece por enero: en «Reporte del mes», elija el mes y suba su Word." />
        </Card>
      )}
    </Mosaic>
  );
}
