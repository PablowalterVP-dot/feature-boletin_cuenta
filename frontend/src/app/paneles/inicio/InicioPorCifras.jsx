/* Tablero de inicio de Nefrología y Hemodiálisis, Epidemiología y Gineco-Obstetricia.

   Hasta el 07/11/2026 estas tres áreas no tenían tablero: su Inicio quedaba
   vacío aunque tuvieran meses entregados. Su oficio es un solo cuadro y sus
   cifras del mes ya las arma `resumen.js`, así que comparten este tablero; lo
   propio de cada una (qué se dibuja por mes y qué reparto se muestra) está en
   `TABLEROS`, abajo.

   Responde lo mismo que los demás tableros:
   1. ¿Cómo fue el último mes enviado? Sus cifras, con el mes anterior y los
      seis meses que terminan en él.
   2. ¿Cómo evoluciona? La cifra principal mes a mes, del año en curso.
   3. ¿De qué está hecha? El reparto del último mes.

   Solo cuentan los meses entregados y con su detalle ya traído: un borrador o
   un mes que todavía viene del servidor no es una cifra, y un mes sin reporte
   es un hueco, nunca un cero. */

import { Card, EmptyState, Mosaic, Ranking, SeriesBars, Stack, StatCard } from '@hrl/core-ui';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { PERIODOS } from '@/app/datos/reportes.js';
import { resumenDelReporte } from '@/app/datos/formatos/resumen.js';
import { cifrasEpidemiologia } from '@/app/datos/formatos/epidemiologia-calculos.js';
import { GRUPOS } from '@/app/datos/formatos/epidemiologia.js';
import { cifrasGinecologia, valor as valorGineco } from '@/app/datos/formatos/ginecologia-calculos.js';
import { TIPOS_PARTO } from '@/app/datos/formatos/ginecologia.js';
import { INDICADORES as INDICADORES_NEFROLOGIA } from '@/app/datos/formatos/nefrologia.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, etiquetaMes, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { numero, variacion } from '@/app/dominio/formato.js';
import { tendencia } from './tendencia.js';

const mesDe = (periodo) => etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();

/* Lo propio de cada área.
     cifras(datos, periodo)  las cifras del mes, como `resumenDelReporte`
     porMes                  { clave, titulo, subtitulo, unidad }: la cifra que se dibuja mes a mes
     reparto(datos)          { titulo, subtitulo, unidad, filas: [{ nombre, valor }], vacio } */
const TABLEROS = Object.freeze({
  nefrologia: {
    cifras: (datos, periodo) => resumenDelReporte('nefrologia', { datos }, periodo),
    porMes: { clave: 'sesiones', titulo: 'Sesiones de hemodiálisis por mes', subtitulo: '«Total de sesiones atendidas» del cuadro de cada mes', unidad: 'sesiones' },
    reparto: (datos) => ({
      titulo: 'Pacientes por acceso vascular',
      subtitulo: 'Catéter temporal, catéter tunelizado y fístula',
      unidad: 'pacientes',
      filas: ['cvc_temporal', 'cvc_tunelizado', 'fav'].map((clave) => ({ nombre: INDICADORES_NEFROLOGIA.find((i) => i.clave === clave)?.nombre ?? clave, valor: datos?.f1?.[clave] ?? null })),
      vacio: 'El cuadro de este mes no registra el acceso vascular de los pacientes.',
    }),
  },
  epidemiologia: {
    cifras: (datos, periodo) => resumenDelReporte('epidemiologia', { datos }, periodo),
    porMes: { clave: 'infecciones', titulo: 'Infecciones intrahospitalarias por mes', subtitulo: 'Casos nuevos del oficio de vigilancia, sin las muertes neonatales ni maternas', unidad: 'infecciones' },
    reparto: (datos) => {
      const c = cifrasEpidemiologia(datos);
      return {
        titulo: 'Infecciones por servicio',
        subtitulo: 'Casos nuevos del mes',
        unidad: 'infecciones',
        filas: GRUPOS.filter((g) => g.infeccion).map((g) => ({ nombre: g.label, valor: c.porGrupo[g.clave] ?? null })),
        vacio: 'El oficio de este mes no registra infecciones intrahospitalarias.',
      };
    },
  },
  ginecologia: {
    /* Sin la cifra «principal» de resumen.js: es partos o controles según el mes, y su
       tendencia mezclaría dos cosas. Cada cifra va con su nombre. */
    cifras: (datos) => {
      const c = cifrasGinecologia(datos);
      return [
        { clave: 'controles', etiqueta: 'Controles prenatales', valor: c.controlesPrenatales, ayuda: 'Indicador «CONTROLES PRENATALES REALIZADOS» del cuadro 1, sumado en los ocho grupos de edad.' },
        { clave: 'partos', etiqueta: 'Partos atendidos', valor: c.partos, ayuda: '«TOTAL DE PARTOS» del cuadro 2, en los cuatro tipos de parto. El cuadro 2 llega desde setiembre de 2026: antes no hay cifra, no es cero.' },
        { clave: 'cesareas', etiqueta: 'Cesáreas', valor: c.cesareas, ayuda: 'Partos por cesárea, con y sin complicaciones, del cuadro 2.' },
        { clave: 'nacidosVivos', etiqueta: 'Nacidos vivos', valor: c.nacidosVivos, ayuda: '«NACIDOS VIVOS» del cuadro 2, en los cuatro tipos de parto.' },
      ];
    },
    porMes: { clave: 'controles', titulo: 'Controles prenatales por mes', subtitulo: 'Cuadro 1, los ocho grupos de edad', unidad: 'controles' },
    reparto: (datos) => ({
      titulo: 'Partos por tipo',
      subtitulo: 'Cuadro 2 · total de partos',
      unidad: 'partos',
      filas: TIPOS_PARTO.map((t) => ({ nombre: t.nombre, valor: datos?.f2 ? valorGineco(datos, 'f2', t.clave, 'total_partos') : null })),
      vacio: 'El Excel de este mes no trae el cuadro 2 (partos, cesáreas y nacidos): llega desde setiembre de 2026.',
    }),
  },
});

export const AREAS_CON_TABLERO_POR_CIFRAS = Object.freeze(Object.keys(TABLEROS));

function Indicadores({ area, actual, anterior, meses }) {
  const t = TABLEROS[area];
  const cifras = t.cifras(actual.datos, actual.periodo);
  const porMes = new Map(meses.map((m) => [m.periodo, t.cifras(m.datos, m.periodo)]));
  const serie = (clave) => tendencia(actual.periodo, (p) => porMes.get(p)?.find((x) => x.clave === clave)?.valor ?? null, (v) => numero(v));
  const previas = anterior ? t.cifras(anterior.datos, anterior.periodo) : null;
  return (
    <div className="hrl-kpis">
      {cifras.map((c, i) => {
        const p = previas?.find((x) => x.clave === c.clave)?.valor;
        const v = variacion(c.valor, p, 1);
        const nota = c.valor == null ? 'Sin cifra este mes' : !anterior ? 'Sin mes anterior para comparar' : v.valor == null ? v.texto : `${v.texto} frente a ${mesDe(anterior.periodo)}`;
        return <StatCard key={c.clave} label={c.etiqueta} value={c.valor == null ? '—' : numero(c.valor)} note={nota} trend={serie(c.clave)} delay={i * 60} info={`${c.ayuda} ${anterior && c.valor != null ? v.explicacion : ''}`.trim()} />;
      })}
    </div>
  );
}

function PorMes({ area, ventana, enviados, vigente }) {
  const { porMes } = TABLEROS[area];
  const delMes = new Map(enviados.map((m) => [m.periodo, TABLEROS[area].cifras(m.datos, m.periodo).find((x) => x.clave === porMes.clave)?.valor ?? null]));
  const puntos = ventana.map((p) => {
    const value = delMes.get(p) ?? null;
    return { key: p, label: etiquetaMes(p), title: etiquetaPeriodo(p), value, ...(value == null && p !== vigente ? { detail: delMes.has(p) ? 'El reporte de este mes no trae esta cifra' : 'No se envió reporte de este mes' } : {}) };
  });
  return (
    <Card title={porMes.titulo} subtitle={porMes.subtitulo} wide>
      <div className="hrl-cuerpo">
        <SeriesBars points={puntos} unit={porMes.unidad} noDataLabel="Sin reporte" emptyTail="En curso" label={porMes.titulo} />
      </div>
    </Card>
  );
}

function Reparto({ area, actual }) {
  const r = TABLEROS[area].reparto(actual.datos);
  const filas = r.filas.filter((f) => f.valor != null && f.valor > 0).sort((a, b) => b.valor - a.valor);
  return (
    <Card title={r.titulo} subtitle={`${etiquetaPeriodo(actual.periodo)} · ${r.subtitulo}`}>
      {filas.length ? (
        <div className="hrl-cuerpo">
          <Ranking rows={filas.map((f) => ({ name: f.nombre, value: f.valor, color: 'var(--serie-1)' }))} format={(n) => `${numero(n)} ${r.unidad}`} />
        </div>
      ) : (
        <EmptyState icon="sh-chart" title="Sin cifras que repartir" body={r.vacio} />
      )}
    </Card>
  );
}

/* `indicadores`: los indicadores directos del área (Inicio.jsx), si los tiene. */
export default function InicioPorCifras({ area, reportes, indicadores = null }) {
  const vigente = periodoVigente(useHoy());
  /* El año en curso desde enero (y, en el prototipo, la ventana sembrada), hasta el mes vigente. */
  const ventana = [...new Set([...PERIODOS, ...mesesDelAnioHasta(vigente)])].sort().filter((p) => p <= vigente && p.slice(0, 4) === vigente.slice(0, 4));
  const enviados = ventana
    .map((periodo) => ({ periodo, reporte: reporteDe(reportes, area, periodo) }))
    .filter((m) => m.reporte && estaEntregado(m.reporte.estado) && !m.reporte.resumen)
    .map((m) => ({ periodo: m.periodo, datos: m.reporte.datos }));
  const actual = enviados.at(-1) ?? null;
  const anterior = enviados.at(-2) ?? null;

  return (
    <Mosaic stacked className="hrl-panel">
      {actual ? (
        <>
          <Stack gap={2}>
            <strong style={{ fontSize: 'var(--text-md)' }}>Último mes enviado: {etiquetaPeriodo(actual.periodo)}</strong>
            <Indicadores area={area} actual={actual} anterior={anterior} meses={enviados} />
          </Stack>
          {indicadores}
          <PorMes area={area} ventana={ventana} enviados={enviados} vigente={vigente} />
          <Reparto area={area} actual={actual} />
        </>
      ) : (
        <Card title="Todavía no hay meses enviados">
          <EmptyState icon="sh-chart" title="Sin meses entregados este año" body="Cuando envíe su primer reporte, aquí verá sus cifras por mes." />
        </Card>
      )}
      {!actual && indicadores}
    </Mosaic>
  );
}
