/* Tablero de inicio de Costura y Lavandería.

   Responde, de arriba abajo, lo que el área necesita al entrar:
   1. ¿Cómo va el reporte de este mes? Estado, plazo y avance de cada formato.
   2. ¿Cómo fue el último mes enviado? Cuatro cifras, comparadas con el anterior.
   3. ¿Cómo evoluciona? Kilos por mes y reparto por servicio.
   4. ¿Qué hizo costura y qué se consumió?

   Los meses sin reporte aparecen como hueco rotulado, nunca como cero, y la
   comparación se hace contra el último mes enviado anterior, nombrándolo. */

import { Alert, Button, Card, EmptyState, Mosaic, Ranking, SeriesBars, StatCard, Tooltip } from '@hrl/core-ui';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { PERIODOS } from '@/app/datos/reportes.js';
import {
  ultimoEnviado,
  enviadoAnterior,
  cifrasDelMes,
  comparar,
  serieMensual,
  kilosPorGrupo,
  insumosComparados,
  trabajosDelMes,
} from '@/app/datos/formatos/lavanderia-tablero.js';
import { PERIODO_CON_CIFRAS_REALES } from '@/app/datos/formatos/lavanderia-siembra.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import PeriodoEnCurso from './PeriodoEnCurso.jsx';
import { tendencia, enviadoDe } from './tendencia.js';

const AREA = 'lavanderia';

const LISTA = { margin: 0, padding: '6px 0 10px', listStyle: 'none' };
const FILA = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: 12,
  padding: '10px 20px',
  borderTop: '1px dashed var(--border)',
};
const SECUNDARIO = { display: 'block', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' };
const NUMERO = { fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--weight-bold)', whiteSpace: 'nowrap' };

function mesDe(periodo) {
  return etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();
}

function cifra(valor, unidad, decimales = 0) {
  if (valor == null) return SIN_DATOS;
  return unidad === 'S/' ? `S/ ${numero(valor, decimales)}` : `${numero(valor, decimales)} ${unidad}`;
}

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
        label="Ropa lavada"
        value={cifra(c.kilos, 'kg')}
        trend={serie('kilos')}
        note={nota('kilos')}
        info="Kilogramos del mes según el registro diario del Formato 1. Se compara con el último mes enviado anterior."
      />
      <StatCard
        label="Piezas lavadas"
        value={cifra(c.piezas, 'piezas')}
        trend={serie('piezas')}
        note={nota('piezas')}
        delay={60}
        info="Prendas del consolidado del Formato 4. Se cuentan y se digitan a mano."
      />
      <StatCard
        label="Importe de lavado"
        value={cifra(c.importe, 'S/', 2)}
        trend={serie('importe')}
        note={`Común ${cifra(c.importeComun, 'S/', 2)} · sucia ${cifra(c.importeSucia, 'S/', 2)}`}
        delay={120}
        info="Kilos del Formato 3 por su tarifa: S/ 3,00 la ropa común y S/ 4,50 la ropa sucia."
      />
      <StatCard
        label="Confeccionado"
        value={cifra(c.confeccionado, 'piezas')}
        trend={serie('confeccionado')}
        note={`${c.trabajos} ${c.trabajos === 1 ? 'trabajo' : 'trabajos'} de costura`}
        delay={180}
        info="Prendas confeccionadas por Costura y ropería, del Formato 2. En el oficio de papel esta suma no existe."
      />
    </div>
  );
}

/* Con servidor, los meses del año en curso desde enero; en el prototipo, la ventana sembrada.
   Antes era siempre la del prototipo (febrero a setiembre): con datos reales no se veía enero. */
const mesesDelTablero = (real, vigente) => (real ? mesesDelAnioHasta(vigente) : PERIODOS);

/* --------------------------------------------------------- 3. evolución */

function RopaPorMes({ reportes, vigente, real }) {
  const puntos = serieMensual(reportes, mesesDelTablero(real, vigente), 'kilos').map((p) =>
    p.value == null && p.key !== vigente ? { ...p, detail: 'No se envió reporte de este mes' } : p,
  );
  const huecos = puntos.filter((p) => p.value == null && p.key !== vigente);

  return (
    <Card accent="var(--primary)" icon="sh-chart" title="Ropa lavada por mes" subtitle="Kilogramos del registro diario">
      <div style={{ padding: '18px 20px 10px' }}>
        <SeriesBars
          points={puntos}
          unit="kg"
          noDataLabel="Sin reporte"
          emptyTail="En curso"
          label="Kilogramos de ropa lavada por mes"
        />
      </div>
      {huecos.length > 0 && (
        <p style={{ margin: 0, padding: '0 20px 16px', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>
          {huecos.map((h) => h.title).join(', ')} sin reporte: el hueco no es un cero.
        </p>
      )}
    </Card>
  );
}

function KilosPorServicio({ actual }) {
  return (
    <Card accent="var(--primary)" icon="sh-washer" title="Kilos por servicio" subtitle={`${etiquetaPeriodo(actual.periodo)} · agrupados como en el consolidado`}>
      <div className="hrl-cuerpo">
        <Ranking
          rows={kilosPorGrupo(actual).map((g) => ({ name: g.nombre, value: g.valor, color: 'var(--primary)' }))}
          format={(n) => `${numero(n)} kg`}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------ 4. costura e insumos */

function Costura({ actual }) {
  const trabajos = trabajosDelMes(actual);
  const c = cifrasDelMes(actual);

  return (
    <Card accent="var(--accent)" icon="sh-scissors"
      title="Costura y ropería"
      subtitle={`${etiquetaPeriodo(actual.periodo)} · trabajos de confección`}
      total={cifra(c.confeccionado, 'piezas')}
    >
      {trabajos.length === 0 ? (
        <EmptyState icon="sh-scissors" title="Sin trabajos este mes" body="El Formato 2 de este mes no registra confecciones." />
      ) : (
        <ul style={LISTA}>
          {trabajos.map((t) => (
            <li key={t.fila} style={FILA}>
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 'var(--text-base)' }}>{t.descripcion}</strong>
                <span style={SECUNDARIO}>
                  {t.servicio}
                  {t.tela ? ` · ${t.tela}` : ''}
                </span>
              </span>
              <span style={NUMERO}>{t.confeccion}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const TEXTO_COMPARACION = Object.freeze({ 'sin-comparar': 'Sin comparar', igual: 'Igual', cambio: 'Cambió' });

function Insumos({ actual, anterior }) {
  const filas = insumosComparados(actual, anterior);

  return (
    <Card accent="var(--primary)" icon="sh-box"
      title="Insumos utilizados"
      subtitle={anterior ? `${etiquetaPeriodo(actual.periodo)} · frente a ${mesDe(anterior.periodo)}` : etiquetaPeriodo(actual.periodo)}
    >
      <ul style={LISTA}>
        {filas.map((i) => (
          <li key={i.clave} style={{ ...FILA, gridTemplateColumns: '1fr auto' }}>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 'var(--text-base)' }}>{i.nombre}</strong>
              <span style={SECUNDARIO}>{i.cantidad ?? SIN_DATOS}</span>
            </span>
            <Tooltip
              title={`${i.nombre} frente al mes anterior`}
              body={
                i.comparacion === 'sin-comparar'
                  ? 'No hay dato del mes anterior con el que comparar.'
                  : i.comparacion === 'igual'
                    ? 'La cantidad es la misma que el mes anterior.'
                    : `El mes anterior decía «${i.previa}».`
              }
              focusable={false}
            >
              <span className="hrl-chip" style={{ minWidth: 92, justifyContent: 'center', cursor: 'help' }}>
                {TEXTO_COMPARACION[i.comparacion]}
              </span>
            </Tooltip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------- tablero */

export default function InicioLavanderia({ reportes, irA }) {
  const vigente = periodoVigente(useHoy());
  const actual = ultimoEnviado(reportes);
  const anterior = actual ? enviadoAnterior(reportes, actual.periodo) : null;
  /* Los reportes del área vienen de la base: sus cifras son las del área, no la siembra. */
  const real = reportes.some((r) => r.area === AREA && (r.origen === 'bd' || r.resumen));

  /* Meses ya vencidos de los que nunca salió un reporte. */
  const faltan = mesesDelTablero(real, vigente).filter(
    (p) => p < vigente && !estaEntregado(reporteDe(reportes, AREA, p)?.estado ?? 'no_iniciado'),
  );

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
                ? 'Totales del oficio real del área.'
                : `Cifras simuladas para la demostración; solo ${etiquetaPeriodo(PERIODO_CON_CIFRAS_REALES)} trae los totales del oficio real.`}
            </p>
          </div>

          <Indicadores actual={actual} anterior={anterior} reportes={reportes} />

          <>
            <RopaPorMes reportes={reportes} vigente={vigente} real={real} />
            <KilosPorServicio actual={actual} />
          </>

          <>
            <Costura actual={actual} />
            <Insumos actual={actual} anterior={anterior} />
          </>
        </>
      ) : (
        <Card accent="var(--info)" icon="sh-pie" title="Cifras del área">
          <EmptyState
            icon="sh-chart"
            title="Todavía no hay meses enviados"
            body="Las cifras aparecen aquí en cuanto se envíe el primer reporte mensual."
          />
        </Card>
      )}
    </Mosaic>
  );
}
