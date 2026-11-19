/* Tablero de inicio de Diagnóstico por Imágenes.

   De arriba abajo, lo que el departamento necesita al entrar:
   1. ¿Cómo va el reporte de este mes? Estado, plazo y avance de las cuatro hojas.
   2. ¿Cómo fue el último mes enviado? Cuatro cifras, frente al anterior.
   3. ¿Cómo evoluciona y de dónde viene? Exámenes por mes y por modalidad,
      por servicio de origen y por financiamiento.
   4. ¿Quién los hizo? Ecografías por médico y Rayos X por tecnólogo.

   Si el tomógrafo está inoperativo, se dice desde cuándo antes que nada: el
   cero de tomografía no es falta de demanda. */

import { Alert, Button, Card, EmptyState, Mosaic, Ranking, SeriesBars, StatCard } from '@hrl/core-ui';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { PERIODOS } from '@/app/datos/reportes.js';
import {
  ultimoEnviado,
  enviadoAnterior,
  cifrasDelMes,
  comparar,
  serieMensual,
  inoperativoDesde,
  porModalidad,
  ecografiasPorMedico,
  rayosXPorTecnologo,
} from '@/app/datos/formatos/imagenes-tablero.js';
import { PERIODO_CON_CIFRAS_REALES } from '@/app/datos/formatos/imagenes-siembra.js';
import { SERVICIOS } from '@/app/datos/formatos/imagenes.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import PeriodoEnCurso from './PeriodoEnCurso.jsx';
import { tendencia, enviadoDe } from './tendencia.js';

const AREA = 'imagenes';

const mesDe = (periodo) => etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();

function cifra(valor, unidad, decimales = 0) {
  if (valor == null) return SIN_DATOS;
  return unidad === 'S/' ? `S/ ${numero(valor, decimales)}` : `${numero(valor, decimales)} ${unidad}`;
}

const formatoExamenes = (n) => `${numero(n)} exámenes`;

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
        label="Exámenes realizados"
        value={cifra(c.examenes, 'exámenes')}
        trend={serie('examenes')}
        note={nota('examenes')}
        info="Suma de las cuatro hojas: Rayos X, ecografía (con biopsias y procedimientos oncológicos), mamografía y tomografía. Se compara con el último mes enviado anterior."
      />
      <StatCard
        label="Pacientes"
        value={cifra(c.pacientes, 'pacientes')}
        trend={serie('pacientes')}
        note={nota('pacientes')}
        delay={60}
        info="Suma de los pacientes de cada hoja. Quien se hizo una ecografía y una radiografía cuenta en las dos: son atenciones por modalidad, no personas distintas."
      />
      <StatCard
        label="Monto recaudado"
        value={cifra(c.monto, 'S/', 2)}
        trend={serie('monto')}
        note={nota('monto')}
        delay={120}
        info="Suma de los montos que el área reporta en cada hoja. Se digitan: el oficio no dice qué tarifa aplica a cada examen."
      />
      <StatCard
        label="Lecturas e informes"
        value={cifra(c.informes, 'informes')}
        trend={serie('informes')}
        note={nota('informes')}
        delay={180}
        info="Tomografías informadas, lecturas de mamografía y lecturas de Rayos X. Las ecografías no llevan este cuadro."
      />
    </div>
  );
}

/* Con servidor, los meses del año en curso desde enero; en el prototipo, la ventana sembrada.
   Antes era siempre la del prototipo (febrero a setiembre): con datos reales no se veía enero. */
const mesesDelTablero = (real, vigente) => (real ? mesesDelAnioHasta(vigente) : PERIODOS);

/* --------------------------------------------------------- 3. evolución */

function ExamenesPorMes({ reportes, vigente, real }) {
  const puntos = serieMensual(reportes, mesesDelTablero(real, vigente), 'examenes').map((p) =>
    p.value == null && p.key !== vigente ? { ...p, detail: 'No se envió reporte de este mes' } : p,
  );

  return (
    <Card accent="var(--primary)" icon="sh-chart" title="Exámenes por mes" subtitle="Las cuatro modalidades juntas">
      <div style={{ padding: '18px 20px 14px' }}>
        <SeriesBars points={puntos} unit="exámenes" noDataLabel="Sin reporte" emptyTail="En curso" label="Exámenes de diagnóstico por imágenes por mes" />
      </div>
    </Card>
  );
}

function RankingCard({ titulo, subtitulo, filas, formato = formatoExamenes, vacio, pie }) {
  return (
    <Card accent="var(--primary)" icon="sh-chart" title={titulo} subtitle={subtitulo}>
      {filas.length === 0 ? (
        <EmptyState icon="sh-chart" title="Sin cifras" body={vacio} />
      ) : (
        <div className="hrl-cuerpo">
          <Ranking rows={filas.map((f) => ({ name: f.nombre, value: f.valor, color: 'var(--primary)' }))} format={formato} />
        </div>
      )}
      {pie && <p style={{ margin: 0, padding: '0 20px 16px', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{pie}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------- tablero */

export default function InicioImagenes({ reportes, irA }) {
  const vigente = periodoVigente(useHoy());
  const actual = ultimoEnviado(reportes);
  const anterior = actual ? enviadoAnterior(reportes, actual.periodo) : null;
  /* Los reportes del área vienen de la base: sus cifras son las del área, no la siembra. */
  const real = reportes.some((r) => r.area === AREA && (r.origen === 'bd' || r.resumen));
  const c = cifrasDelMes(actual);
  const desde = actual ? inoperativoDesde(reportes, actual.periodo) : null;

  const faltan = mesesDelTablero(real, vigente).filter((p) => p < vigente && !estaEntregado(reporteDe(reportes, AREA, p)?.estado ?? 'no_iniciado'));

  return (
    <Mosaic className="hrl-panel">
      <PeriodoEnCurso reportes={reportes} claveArea={AREA} irA={irA} />

      {faltan.length > 0 && (
        <Alert
          tone="warning"
          title={`${faltan.map(etiquetaPeriodo).join(', ')} ${faltan.length === 1 ? 'sigue' : 'siguen'} sin reporte`}
          action={
            <Button tone="ghost" size="sm" icon="sh-clock" onClick={() => irA('historial')}>
              Ver historial
            </Button>
          }
        />
      )}

      {actual ? (
        <>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--foreground)' }}>
              Último mes enviado: {etiquetaPeriodo(actual.periodo)}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>
              {real || actual.periodo === PERIODO_CON_CIFRAS_REALES
                ? 'Cifras del oficio real del área.'
                : `Cifras simuladas para la demostración; solo ${etiquetaPeriodo(PERIODO_CON_CIFRAS_REALES)} trae las cifras del oficio real.`}
            </p>
          </div>

          {desde && (
            <Alert tone="warning" title={`Tomógrafo inoperativo desde ${etiquetaPeriodo(desde).toLowerCase()}`}>
              {desde === actual.periodo
                ? 'En este mes no se hicieron tomografías por falla del equipo.'
                : `Van varios meses seguidos sin tomografías por falla del equipo. El cero de tomografía no es falta de demanda.`}
            </Alert>
          )}

          <Indicadores actual={actual} anterior={anterior} reportes={reportes} />

          <>
            <ExamenesPorMes reportes={reportes} vigente={vigente} real={real} />
            <RankingCard titulo="Exámenes por modalidad" subtitulo={etiquetaPeriodo(actual.periodo)} filas={porModalidad(actual).sort((a, b) => b.valor - a.valor)} />
          </>

          <>
            <RankingCard
              titulo="Por servicio de origen"
              subtitulo={`${etiquetaPeriodo(actual.periodo)} · las cuatro hojas`}
              filas={SERVICIOS.map((s) => ({ nombre: s.label, valor: c.servicio[s.clave] }))
                .filter((f) => f.valor != null)
                .sort((a, b) => b.valor - a.valor)}
              pie={c.financiamiento.campana ? `No incluye ${numero(c.financiamiento.campana)} mamografías de campaña, que no tienen servicio de origen.` : undefined}
            />
            <RankingCard
              titulo="Por financiamiento"
              subtitulo={`${etiquetaPeriodo(actual.periodo)} · ecografía, tomografía y mamografía`}
              filas={[
                { nombre: 'SIS', valor: c.financiamiento.sis },
                { nombre: 'Convenios', valor: c.financiamiento.convenio },
                { nombre: 'Pagados', valor: c.financiamiento.pagado },
                { nombre: 'Campaña (gratuito)', valor: c.financiamiento.campana },
              ]
                .filter((f) => f.valor != null)
                .sort((a, b) => b.valor - a.valor)}
              pie="Rayos X no aparece: su hoja no desglosa por financiamiento, solo cuenta los pacientes particulares."
            />
          </>

          <>
            <RankingCard titulo="Ecografías por médico" subtitulo={`${etiquetaPeriodo(actual.periodo)} · sin biopsias ni procedimientos`} filas={ecografiasPorMedico(actual)} vacio="El Formato 1 de este mes no registra exámenes por médico." />
            <RankingCard titulo="Rayos X por tecnólogo" subtitulo={etiquetaPeriodo(actual.periodo)} filas={rayosXPorTecnologo(actual)} vacio="El Formato 4 de este mes no registra exámenes por tecnólogo." />
          </>
        </>
      ) : (
        <Card accent="var(--info)" icon="sh-pie" title="Cifras del área">
          <EmptyState icon="sh-chart" title="Todavía no hay meses enviados" body="Las cifras aparecen aquí en cuanto se envíe el primer reporte mensual." />
        </Card>
      )}
    </Mosaic>
  );
}
