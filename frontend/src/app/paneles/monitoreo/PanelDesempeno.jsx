/* Desempeño DL 1153: dos bloques.

   «Evaluados al hospital» son los únicos que cuentan en el resumen y tienen estado frente
   al logro. «Otros indicadores» se muestran para que estén todos a la vista, con lo que
   publique MINSA de la región, rotulado así y sin estado: no le tocan al hospital. */

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, IconButton, Mosaic, PageActions, Stack, StatCard, Tabs, Tooltip } from '@hrl/core-ui';
import { fechaCorta, numero } from '@/app/dominio/formato.js';
import { acumuladoDe, conclusionFrenteAlLogro, textoDeLogro } from '@/app/dominio/monitoreo.js';
import { etiquetaPeriodo, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { compararLecturas, mejorDe } from '@/app/dominio/analisis.js';
import { avanceDeSerie, cuentasDelPanel, DIMENSIONES, estadoDelIndicador, EVALUADOS, lecturaRegistrada, OTROS, serieDelIndicador, serieDelModulo } from '@/app/datos/monitoreo.js';
import { asignacionDe, LECTURAS } from '@/app/datos/monitoreo-lecturas.js';
import { useDesempeno } from '@/app/paneles/desempeno/comunes.jsx';
import CargarReporte from '@/app/paneles/monitoreo/CargarReporte.jsx';
import GraficoIndicador from '@/app/paneles/monitoreo/GraficoIndicador.jsx';
import RegistrarDatos from '@/app/paneles/monitoreo/RegistrarDatos.jsx';
import { AvanceDelAnio, AvisoDeCorte, Cifra, CifraYMeta, Conclusion, Estado, formatoDe, formatoDeGrafico, fraccionDe, frasesDe, LeyendaDeAvance, Rotulo, SelectorDeCorte, SelectorDeVista } from '@/app/paneles/monitoreo/comunes.jsx';

const FILTROS = Object.freeze([
  { key: 'todos', label: 'Todos' },
  { key: 'alcanzan', label: 'Alcanzan' },
  { key: 'mejorar', label: 'Por mejorar' },
  { key: 'requieren', label: 'Requieren datos' },
]);

const DEL_FILTRO = Object.freeze({
  todos: () => true,
  alcanzan: (e) => e === 'alcanza',
  mejorar: (e) => ['entre', 'mixto', 'bajo', 'bajo_umbral'].includes(e),
  requieren: (e) => ['requiere', 'sin_dato', 'sin_evaluar'].includes(e),
});

/* «Enero a agosto», o «Acumulado a agosto» si ya viene acumulado. */
export function periodoDe(acumulado, acumulacion) {
  if (!acumulado?.hasta) return '';
  const mes = etiquetaPeriodo(acumulado.hasta).split(' ')[0].toLowerCase();
  if (acumulacion === 'acumulada') return `Acumulado a ${mes}`;
  if (acumulacion === 'promedio') return `Promedio a ${mes}`;
  if (acumulacion === 'ultimo') return `A ${mes}`;
  return acumulado.meses === 1 ? `Solo ${mes}` : `Enero a ${mes}`;
}

/* La lectura del hospital, en los mismos meses que la oficial: comparar enero-agosto con
   enero-octubre diría que difieren aunque coincidan. */
export function lecturaDelHospital(indicador, datos, parte, resumen14) {
  const propia = indicador.modulo ? serieDelModulo(datos.meses, resumen14?.resultado) : datos.propia;
  if (!propia) return null;
  const meses = new Set((parte?.puntos ?? []).filter((p) => p.valor != null).map((p) => p.periodo));
  const comparables = meses.size ? propia.filter((p) => meses.has(p.periodo)) : propia;
  const acumulado = acumuladoDe(comparables, 'mensual', indicador.factor);
  return { serie: propia, acumulado };
}

/* Se compara mes por mes, con las cifras de ahora: decir «coincide» a mano seguiría diciéndolo
   aunque dejara de ser cierto. */
export function ComparacionPropia({ indicador, lectura, parte }) {
  if (!lectura?.acumulado) {
    return <Rotulo>{indicador.lectura.titulo}: todavía sin cifra de este periodo.</Rotulo>;
  }
  const f = formatoDe(indicador.decimales, indicador.unidad);
  const comparacion = compararLecturas(parte.puntos, lectura.serie, { decimales: indicador.decimales, unidad: indicador.unidad });
  return (
    <div className="hrl-monitoreo__comparacion">
      <span className="hrl-monitoreo__nota">{indicador.lectura.titulo}</span>
      <strong>
        {f(lectura.acumulado.valor)} {indicador.unidad === '%' ? '' : indicador.unidad}
      </strong>
      <Rotulo icono={comparacion.iguales ? 'sh-ok' : 'sh-warn'}>{comparacion.texto ?? 'Sin meses comunes con la cifra oficial.'}</Rotulo>
    </div>
  );
}

/* Un mes del gráfico, en palabras: con qué cifras se calculó. */
const describirMesDe = (indicador, parte) => (p) => {
  if (p.num == null || p.den == null) return null;
  const n = (x) => numero(x, Number.isInteger(x) ? 0 : 2);
  const numerador = parte.numerador ?? indicador.numerador;
  const denominador = parte.denominador ?? indicador.denominador;
  if (numerador && denominador) return `${numerador}: ${n(p.num)}. ${denominador}: ${n(p.den)}.`;
  return `${fraccionDe(p.num, p.den, parte.unidad)}.`;
};

/* Una cifra oficial completa: el número con lo que mide, qué significa hoy y su mes a mes.
   `compacto`, en la tarjeta: la cifra con su meta y el dibujo. La conclusión y el análisis
   del mes a mes van solo en el detalle (07/11/2026: la tarjeta estaba saturada). */
export function ParteOficial({ indicador, parte, comparacion = null, nombreComparacion = null, alto = 240, maxFrases = 4, compacto = false }) {
  const decimales = parte.clave !== 'principal' && parte.factor === 1000 ? 2 : indicador.decimales;
  const f = formatoDe(decimales, parte.unidad);
  const a = parte.acumulado;
  const logro = parte.logro ?? indicador.logro;
  const lectura = LECTURAS[indicador.ficha];
  const escribir = (n) => numero(n, Number.isInteger(n) ? 0 : decimales);
  const textoLogro = textoDeLogro(logro, parte.unidad, escribir);
  const conFraccion = a?.num != null ? fraccionDe(a.num, a.den, parte.unidad) : null;
  const conclusion = a ? conclusionFrenteAlLogro({ valor: a.valor, estado: parte.estado, logro, unidad: parte.unidad, acumulacion: indicador.acumulacion, hasta: a.hasta, proyectable: lectura?.proyectable, escribir: (n) => numero(n, decimales), decimales }) : null;
  const frase = a ? frasesDe(lectura, a, f, { decimales, parte: parte.nombre, unidad: parte.unidad }) : null;
  const medida = parte.unidad === '%' || parte.clave === 'principal' ? lectura?.medida : parte.unidad;
  const cifra = <Cifra titulo={parte.nombre} valor={f(a?.valor ?? null)} unidad={a ? medida : null} nota={a ? [periodoDe(a, indicador.acumulacion), conFraccion].filter(Boolean).join(': ') : 'Sin cifra de este año'} />;
  const conMeta = logro && logro.tipo !== 'texto';
  return (
    <Stack gap={3}>
      {compacto ? (
        <CifraYMeta meta={conMeta ? textoDeLogro({ ...logro, umbral: null }, parte.unidad, escribir) : null} umbral={conMeta && logro.umbral != null ? `Umbral: ${escribir(logro.umbral)}${parte.unidad === '%' ? ' %' : ''}` : null}>
          {cifra}
        </CifraYMeta>
      ) : (
        cifra
      )}
      {logro && !a && !compacto && <span className="hrl-monitoreo__nota">Meta: {textoLogro}</span>}
      {a && !compacto && <Conclusion frase={frase} conclusion={conclusion} />}
      {a && (
        <GraficoIndicador
          etiqueta={`${indicador.nombre}${parte.nombre ? `, ${parte.nombre}` : ''}`}
          puntos={parte.puntos}
          logro={logro}
          unidad={parte.unidad}
          decimales={decimales}
          escribir={formatoDeGrafico(decimales, parte.unidad)}
          leerMes={(p) => frasesDe(lectura, p, f, { decimales, parte: parte.nombre, unidad: parte.unidad })}
          describir={describirMesDe(indicador, parte)}
          textoLogro={textoLogro}
          acumulada={indicador.acumulacion === 'acumulada'}
          mejor={mejorDe({ logro, menorEsMejor: indicador.menorEsMejor })}
          comparacion={comparacion}
          nombreComparacion={nombreComparacion}
          ritmo={Boolean(lectura?.proyectable)}
          alto={alto}
          cumpleElAcumulado={indicador.acumulacion === 'mensual' && logro?.tipo !== 'texto' ? parte.estado === 'alcanza' : null}
          maxFrases={maxFrases}
          compacto={compacto}
        />
      )}
    </Stack>
  );
}

/* Lo que no llega en el reporte: el mensaje dice a quién pedírselo y qué. */
export function PideDatos({ indicador, puede, registrar }) {
  return (
    <Alert tone="warning" title={`Se requieren datos de ${indicador.oficina}`} action={puede ? <Button size="sm" icon="sh-pencil" onClick={registrar}>Registrar datos</Button> : undefined}>
      {/* Con span: el Alert del kit pone su contenido dentro de un párrafo. */}
      {indicador.pide.map((p) => (
        <span key={p} className="hrl-monitoreo__pide">
          {p}
        </span>
      ))}
      {!puede && <span className="hrl-monitoreo__pide">Los registra la Oficina de Estadística.</span>}
    </Alert>
  );
}

function TarjetaFicha({ indicador, lectura, datos, resumen14, abrir, puede, registrar, cargando }) {
  const estado = estadoDelIndicador(indicador, lectura);
  const partes = lectura.partes;
  const propia = indicador.lectura ? lecturaDelHospital(indicador, datos, partes[0], resumen14) : null;
  return (
    <Card
      title={`Ficha ${indicador.ficha}: ${indicador.nombre}`}
      subtitle={LECTURAS[indicador.ficha].significa}
      /* Con varias partes va a lo ancho: dos gráficos en media tarjeta se pisan los meses. */
      wide={partes.length > 1 && lectura.hay}
      meta={cargando ? undefined : <Estado estado={estado} />}
      actions={
        <Tooltip title="Ver detalle" body="Cómo se calcula, de dónde sale y su cifra mes a mes." focusable={false}>
          <IconButton icon="sh-arrow-right" aria-label={`Ver el detalle de la ficha ${indicador.ficha}`} onClick={() => abrir(indicador.ficha)} />
        </Tooltip>
      }
    >
      <Stack gap={3} className="hrl-monitoreo__cuerpo">
        {cargando && indicador.situacion !== 'requiere' && <p className="hrl-monitoreo__motivo">Trayendo la cifra…</p>}
        {lectura.hay && (
          <div className={partes.length > 1 ? 'hrl-monitoreo__partes' : undefined}>
            {partes.map((p, k) => (
              <ParteOficial key={p.clave} indicador={indicador} parte={p} comparacion={k === 0 && propia?.serie ? propia.serie : null} nombreComparacion={k === 0 && propia?.serie ? indicador.lectura.titulo : null} alto={200} compacto />
            ))}
          </div>
        )}
        {!cargando && !lectura.hay && indicador.situacion !== 'requiere' && <p className="hrl-monitoreo__motivo">Todavía no hay cifra oficial de este año. Aparece cuando se cargue el reporte DL 1153 de MINSA. Sin dato no se dibuja nada: no significa cero.</p>}
        {indicador.situacion === 'requiere' && !lectura.hay && (
          <>
            <p className="hrl-monitoreo__motivo">
              <strong>Meta:</strong> {textoDeLogro(indicador.logro, indicador.unidad, (n) => numero(n, Number.isInteger(n) ? 0 : 1))}. No llega en el reporte de MINSA: se calcula con lo que envíe la oficina.
            </p>
            <PideDatos indicador={indicador} puede={puede} registrar={() => registrar(indicador)} />
          </>
        )}
        {indicador.situacion === 'requiere' && lectura.hay && (
          <Stack direction="row" gap={2} align="center" wrap>
            <Rotulo icono="sh-pencil">Digitado por Estadística, de {indicador.oficina}</Rotulo>
            {puede && (
              <Button tone="ghost" size="sm" icon="sh-pencil" onClick={() => registrar(indicador)}>
                Registrar otro mes
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/* Las que el Anexo no le evalúa al hospital: tarjeta completa, para que no queden en una fila
   sin explicar, pero con lo que hay de toda la región, rotulado así y sin estado frente al
   logro. El logro no se dibuja: leído aquí parecería una nota al hospital. */
function TarjetaContexto({ indicador, region, hospital, abrir }) {
  const parte = region.partes[0];
  const a = parte.acumulado;
  const lectura = LECTURAS[indicador.ficha];
  const f = formatoDe(indicador.decimales, indicador.unidad);
  const filaHospital = hospital.partes[0];
  return (
    <Card
      title={`Ficha ${indicador.ficha}: ${indicador.nombre}`}
      subtitle={lectura.significa}
      meta={<Badge label="Cifra de la región" tone="info" icon="sh-info" />}
      actions={
        <Tooltip title="Ver detalle" body="Lo que dice el Anexo I y lo publicado mes a mes." focusable={false}>
          <IconButton icon="sh-arrow-right" aria-label={`Ver el detalle de la ficha ${indicador.ficha}`} onClick={() => abrir(indicador.ficha)} />
        </Tooltip>
      }
    >
      <Stack gap={3} className="hrl-monitoreo__cuerpo">
        {a ? (
          <>
            <Cifra valor={f(a.valor)} unidad={lectura.medida} nota={`Toda la región Loreto, ${periodoDe(a, indicador.acumulacion).toLowerCase()}: ${fraccionDe(a.num, a.den, parte.unidad)}`} />
            <GraficoIndicador
              compacto
              alto={200}
              etiqueta={`${indicador.nombre}, región Loreto`}
              puntos={parte.puntos}
              unidad={parte.unidad}
              decimales={indicador.decimales}
              escribir={formatoDeGrafico(indicador.decimales, parte.unidad)}
              leerMes={(p) => `En toda la región: ${frasesDe(lectura, p, f, { decimales: indicador.decimales })}`}
              maxFrases={3}
              acumulada={indicador.acumulacion === 'acumulada'}
              mejor={mejorDe({ logro: indicador.logro })}
              comparacion={filaHospital.acumulado ? filaHospital.puntos : null}
              nombreComparacion={filaHospital.acumulado ? 'Fila del hospital' : null}
            />
          </>
        ) : (
          <Alert tone="info" title="Sin cifra publicada este año">
            {indicador.motivo}
          </Alert>
        )}
      </Stack>
    </Card>
  );
}

function ListaDeEvaluados({ indicadores, lecturas, series, anio, abrir, estados }) {
  const columnas = [
    {
      key: 'indicador',
      label: 'Indicador',
      render: (i) => (
        <span className="hrl-monitoreo__fila">
          <Button tone="link" onClick={() => abrir(i.ficha)}>
            Ficha {i.ficha}: {i.nombre}
          </Button>
          <span className="hrl-avance__nota">{LECTURAS[i.ficha].significa}</span>
        </span>
      ),
    },
    { key: 'estado', label: 'Estado', width: 200, render: (i) => <Estado estado={estados.get(i.ficha)} /> },
    {
      key: 'avance',
      label: 'Avance del año',
      width: 250,
      render: (i) => {
        const p = lecturas.get(i.ficha).partes[0];
        const f = formatoDe(i.decimales, p.unidad);
        const avance = avanceDeSerie(p.puntos, series.get(i.ficha).meses, anio);
        return <AvanceDelAnio avance={avance} escribir={f} />;
      },
    },
    {
      key: 'resultado',
      label: 'Resultado',
      width: 220,
      align: 'right',
      render: (i) => {
        const partes = lecturas.get(i.ficha).partes;
        if (partes.length > 1 && !lecturas.get(i.ficha).hay) return <span className="hrl-avance__nota">Sin datos</span>;
        /* Con varias partes se dicen todas: mostrar solo la primera ocultaría la que no cumple. */
        if (partes.length > 1) {
          return (
            <span className="hrl-avance__ultimo">
              {partes.filter((p) => p.acumulado).map((p) => (
                <span key={p.clave}>
                  <span className="hrl-avance__nota">{p.nombre}: </span>
                  <strong>{formatoDe(p.factor === 1000 ? 2 : i.decimales, p.unidad)(p.acumulado.valor)}</strong>
                </span>
              ))}
            </span>
          );
        }
        const p = partes[0];
        const f = formatoDe(i.decimales, p.unidad);
        return (
          <span className="hrl-avance__ultimo">
            <strong>{f(p.acumulado?.valor ?? null)}</strong>
            {p.acumulado && <span className="hrl-avance__nota">{LECTURAS[i.ficha].medida}</span>}
            {p.acumulado && <span className="hrl-avance__nota">{periodoDe(p.acumulado, i.acumulacion)}</span>}
          </span>
        );
      },
    },
    { key: 'logro', label: 'Meta', width: 190, render: (i) => {
        const escribir = (n) => numero(n, Number.isInteger(n) ? 0 : 1);
        const conLogroPropio = i.series?.filter((s) => s.logro) ?? [];
        return <span className="hrl-avance__nota">{conLogroPropio.length ? conLogroPropio.map((s) => `${s.nombre}: ${textoDeLogro(s.logro, i.unidad, escribir)}`).join('; ') : textoDeLogro(i.logro, i.unidad, escribir)}</span>;
      } },
    {
      key: 'ver',
      label: '',
      width: 64,
      align: 'right',
      render: (i) => (
        <Tooltip title="Ver detalle" body="Cómo se calcula, de dónde sale y su cifra mes a mes." focusable={false}>
          <IconButton icon="sh-arrow-right" aria-label={`Ver el detalle de la ficha ${i.ficha}`} onClick={() => abrir(i.ficha)} />
        </Tooltip>
      ),
    },
  ];
  return (
    <Mosaic stacked>
      <LeyendaDeAvance />
      {DIMENSIONES.map((d) => {
        const filas = indicadores.filter((i) => i.dimension === d.clave);
        if (!filas.length) return null;
        return (
          <Card key={d.clave} title={d.nombre} subtitle={`${filas.length} ${filas.length === 1 ? 'indicador' : 'indicadores'}`} wide>
            <div className="hrl-avance__tabla">
              <DataTable columns={columnas} rows={filas} rowKey={(i) => i.ficha} />
            </div>
          </Card>
        );
      })}
    </Mosaic>
  );
}

/* Las que no se le evalúan al hospital: lo que hay, rotulado como de la región. */
function TablaOtros({ indicadores, lecturasRegion, lecturas, abrir }) {
  const columnas = [
    {
      key: 'indicador',
      label: 'Indicador',
      render: (i) => (
        <span className="hrl-monitoreo__fila">
          <Button tone="link" onClick={() => abrir(i.ficha)}>
            Ficha {i.ficha}: {i.nombre}
          </Button>
          <span className="hrl-avance__nota">{LECTURAS[i.ficha].significa}</span>
        </span>
      ),
    },
    { key: 'motivo', label: 'Por qué no se evalúa al hospital', render: (i) => <span className="hrl-avance__nota">{i.motivo}</span> },
    {
      key: 'region',
      label: 'Región Loreto',
      width: 170,
      align: 'right',
      tooltip: 'Lo publicado por MINSA para toda la región: incluye a todos sus establecimientos. No es una cifra del hospital.',
      render: (i) => {
        const a = lecturasRegion.get(i.ficha).partes[0].acumulado;
        if (!a) return <span className="hrl-avance__nota">Sin dato en el reporte</span>;
        return (
          <span className="hrl-avance__ultimo">
            <strong>{formatoDe(i.decimales, i.unidad)(a.valor)}</strong>
            <span className="hrl-avance__nota">{LECTURAS[i.ficha].medida}</span>
            <span className="hrl-avance__nota">{periodoDe(a, i.acumulacion)}</span>
          </span>
        );
      },
    },
    {
      key: 'hospital',
      label: 'Hospital',
      width: 130,
      align: 'right',
      tooltip: 'Si el reporte trae una fila del hospital. Es informativa: no se le evalúa.',
      render: (i) => {
        const a = lecturas.get(i.ficha).partes[0].acumulado;
        return a ? <span>{formatoDe(i.decimales, i.unidad)(a.valor)}</span> : <span className="hrl-avance__nota">Sin dato</span>;
      },
    },
    {
      key: 'ver',
      label: '',
      width: 64,
      align: 'right',
      render: (i) => (
        <Tooltip title="Ver detalle" body="Lo que dice el Anexo I y lo publicado mes a mes." focusable={false}>
          <IconButton icon="sh-arrow-right" aria-label={`Ver el detalle de la ficha ${i.ficha}`} onClick={() => abrir(i.ficha)} />
        </Tooltip>
      ),
    },
  ];
  return <DataTable columns={columnas} rows={indicadores} rowKey={(i) => i.ficha} />;
}

/* Cuántas traen fila del hospital se cuenta con lo cargado: escrito a mano quedaría viejo. */
const textoDePoblacion = (poblacion, lecturas) => {
  const conFila = poblacion.filter((i) => lecturas.get(i.ficha).partes[0].acumulado).length;
  const filas = conFila === 0 ? 'en ninguna' : `en ${conFila} de ${poblacion.length}`;
  return `Si la Directiva incluye al hospital, pasan al primer bloque. Con lo cargado hoy, el reporte trae una fila del hospital ${filas}.`;
};

export default function PanelDesempeno({ reportes, propios, anio, vigente, panel, puede, puedeCargar = false, corte: analizarHasta = null, ver, abrir, cambiarVista }) {
  const [filtro, setFiltro] = useState('todos');
  const [registrando, setRegistrando] = useState(null);
  const [cargando, setCargando] = useState(false);

  const registrados = panel.datos?.resultados ?? [];
  const meses = useMemo(() => mesesDelAnioHasta(vigente), [vigente]);
  const resumen = useDesempeno('/resumen', { anio });
  const resultado14 = resumen.datos?.fichas?.find((f) => f.ficha?.numero === 14)?.resultado ?? null;
  const resumen14 = { resultado: resultado14 };

  const lecturas = useMemo(() => new Map([...EVALUADOS, ...OTROS].map((i) => [i.ficha, lecturaRegistrada(i, registrados, meses)])), [registrados, meses]);
  const lecturasRegion = useMemo(() => new Map(OTROS.map((i) => [i.ficha, lecturaRegistrada(i, registrados, meses, 'region')])), [registrados, meses]);
  const contexto = useMemo(() => ({ reportes, propios, anio, vigente }), [reportes, propios, anio, vigente]);
  const series = useMemo(() => new Map(EVALUADOS.map((i) => [i.ficha, serieDelIndicador(i, contexto)])), [contexto]);
  const estados = useMemo(() => new Map(EVALUADOS.map((i) => [i.ficha, estadoDelIndicador(i, lecturas.get(i.ficha))])), [lecturas]);

  const cuentas = cuentasDelPanel(registrados, meses);
  /* Mientras llega, un «0» afirmaría que ninguno alcanza. */
  const trayendo = panel.cargando && !panel.datos;
  const cifra = (n) => (trayendo ? '…' : n);
  const visibles = EVALUADOS.filter((i) => DEL_FILTRO[filtro](estados.get(i.ficha)));
  const corte = registrados.find((r) => r.familia === 'dl1153' && r.fecha_corte)?.fecha_corte ?? null;
  const documento = registrados.find((r) => r.familia === 'dl1153' && r.documento && r.origen === 'minsa_excel')?.documento ?? null;
  const hastaOficial = registrados.filter((r) => r.familia === 'dl1153' && r.origen === 'minsa_excel').reduce((m, r) => Math.max(m, r.mes), 0);

  /* Las firmas digitales (33 y 34) se abordan en Compromisos de mejora: ver `ASIGNACION`. */
  const deEstaPestana = OTROS.filter((i) => asignacionDe(i.ficha) !== 'compromisos');
  const poblacion = deEstaPestana.filter((i) => i.ambito === 'poblacion');
  const otroAmbito = deEstaPestana.filter((i) => i.ambito === 'otro');

  return (
    <Mosaic className="hrl-panel">
      <PageActions>
        <Stack direction="row" gap={2} align="center" wrap>
          <SelectorDeVista valor={ver} onChange={cambiarVista} />
          {analizarHasta?.meses.length > 1 && <SelectorDeCorte meses={analizarHasta.meses} valor={analizarHasta.hasta} onChange={analizarHasta.cambiar} />}
          {puedeCargar && (
            <Button tone="ghost" icon="sh-upload" onClick={() => setCargando(true)}>
              Cargar reporte DL 1153
            </Button>
          )}
        </Stack>
      </PageActions>

      <div className="hrl-monitoreo__cifras">
        <StatCard label="Evaluados al hospital" value={cuentas.total} note="Del Anexo I de 2026" info="De los 34 indicadores del Anexo I, los que su ámbito oficial le evalúa a un hospital III-1." />
        <StatCard label="Alcanzan la meta" value={cifra(cuentas.alcanzan)} note={trayendo ? 'Trayendo las cifras' : hastaOficial ? 'Seguimiento: se evalúa al cierre del año' : 'Sin cifras cargadas'} info="La evaluación oficial es anual. Lo de hoy es cómo va con lo publicado hasta el último corte." />
        <StatCard label="Por mejorar" value={cifra(cuentas.parcial + cuentas.bajo)} note={trayendo ? 'Trayendo las cifras' : `${cuentas.bajo} por debajo, ${cuentas.parcial} a medio camino`} severity={cuentas.bajo > 0 ? 'suspect' : 'neutral'} info="Por debajo de la meta o del umbral, o entre los dos. Un indicador acumulado todavía puede subir antes de diciembre." />
        <StatCard label="Requieren datos" value={cifra(cuentas.sinDato)} note="Se piden a otras oficinas" info="Las fichas que no llegan en el reporte de MINSA: Epidemiología, Farmacia y Recursos Humanos." />
      </div>

      {corte && (
        <Rotulo icono="sh-stamp">
          Cifra oficial: reporte DL 1153 hasta {etiquetaPeriodo(`${anio}-${String(hastaOficial).padStart(2, '0')}`).toLowerCase()}, corte al {fechaCorta(corte)}
          {documento ? `. Archivo: ${documento}` : ''}.
        </Rotulo>
      )}
      {panel.error && (
        <Alert tone="info" title="Sin cifras oficiales por ahora">
          {panel.error}
        </Alert>
      )}
      {!panel.error && !panel.cargando && !hastaOficial && (
        <Alert tone="info" title="Todavía no se ha cargado el reporte DL 1153 de este año">
          Los indicadores aparecen vacíos, no en cero. {puedeCargar ? 'Súbalo con «Cargar reporte DL 1153», en la cabecera.' : 'Lo carga el superadministrador; aquí se ve en cuanto esté cargado.'}
        </Alert>
      )}

      <AvisoDeCorte hasta={analizarHasta?.hasta} />

      <div>
        <Tabs tabs={FILTROS} active={filtro} onChange={setFiltro} />
      </div>

      <h2 className="hrl-monitoreo__bloque">Evaluados al hospital</h2>

      {ver === 'lista' && <ListaDeEvaluados indicadores={visibles} lecturas={lecturas} series={series} anio={anio} abrir={abrir} estados={estados} />}

      {ver !== 'lista' &&
        DIMENSIONES.map((d) => {
          const deLaSeccion = visibles.filter((i) => i.dimension === d.clave);
          if (!deLaSeccion.length) return null;
          return [
            <h3 key={`titulo-${d.clave}`} className="hrl-monitoreo__grupo">
              {d.nombre}
            </h3>,
            ...deLaSeccion.map((i) => <TarjetaFicha key={i.ficha} indicador={i} lectura={lecturas.get(i.ficha)} datos={series.get(i.ficha)} resumen14={resumen14} abrir={abrir} puede={puede} registrar={setRegistrando} cargando={panel.cargando && !panel.datos} />),
          ];
        })}

      {!visibles.length && <p className="hrl-monitoreo__motivo">Ningún indicador está en esta situación.</p>}

      <h2 className="hrl-monitoreo__bloque">Otros indicadores del DL 1153</h2>
      <Alert tone="info" title="No cuentan en el resumen: el Anexo I no se los evalúa al hospital">
        La columna «Región Loreto» es de toda la región, con todos sus establecimientos. No es una cifra del hospital.
      </Alert>

      {ver === 'lista' ? (
        <>
          <Card title="Solo para hospitales con población asignada" subtitle={`${poblacion.length} indicadores, por confirmar con la Directiva de los Convenios de Gestión 2026`} wide>
            <Stack gap={3} className="hrl-monitoreo__cuerpo">
              <p className="hrl-monitoreo__motivo">{textoDePoblacion(poblacion, lecturas)}</p>
              <div className="hrl-avance__tabla">
                <TablaOtros indicadores={poblacion} lecturasRegion={lecturasRegion} lecturas={lecturas} abrir={abrir} />
              </div>
            </Stack>
          </Card>
          <Card title="Se evalúan a otros" subtitle={`${otroAmbito.length} indicadores`} wide>
            <div className="hrl-avance__tabla">
              <TablaOtros indicadores={otroAmbito} lecturasRegion={lecturasRegion} lecturas={lecturas} abrir={abrir} />
            </div>
          </Card>
        </>
      ) : (
        [
          <h3 key="titulo-poblacion" className="hrl-monitoreo__grupo">
            Solo para hospitales con población asignada
          </h3>,
          <p key="nota-poblacion" className="hrl-monitoreo__motivo">
            {textoDePoblacion(poblacion, lecturas)}
          </p>,
          ...poblacion.map((i) => <TarjetaContexto key={i.ficha} indicador={i} region={lecturasRegion.get(i.ficha)} hospital={lecturas.get(i.ficha)} abrir={abrir} />),
          <h3 key="titulo-otros" className="hrl-monitoreo__grupo">
            Se evalúan a otros
          </h3>,
          ...otroAmbito.map((i) => <TarjetaContexto key={i.ficha} indicador={i} region={lecturasRegion.get(i.ficha)} hospital={lecturas.get(i.ficha)} abrir={abrir} />),
        ]
      )}

      {registrando && <RegistrarDatos indicador={registrando} anio={anio} meses={meses} registrados={registrados} onClose={() => setRegistrando(null)} onGuardado={panel.recargar} />}
      {cargando && puedeCargar && <CargarReporte onClose={() => setCargando(false)} onCargado={panel.recargar} />}
    </Mosaic>
  );
}
