/* Gestión hospitalaria: los 22 del formato de GERESA.

   Hay dos cifras de cada mes y se muestran las dos: la del cuadro que el hospital llevó a
   mano (cargado una vez, hasta julio de 2026) y la que el sistema calcula con los oficios y
   lo que digita Estadística. Para los meses sin cuadro, manda el cálculo: de ahí en adelante
   no hay nada que copiar.

   GERESA no les fija logro: la conclusión de cada tarjeta se saca de su propia historia, no de
   una meta inventada. Abajo se enlazan las fichas del DL 1153 que también
   miden la gestión del hospital: se evalúan con otro criterio y no son la misma cifra. */

import { useMemo } from 'react';
import { Alert, Badge, Button, Card, DataTable, IconButton, Mosaic, PageActions, Stack, StatCard, Tooltip } from '@hrl/core-ui';
import { calcularIndicadores, CATEGORIAS, decimalesDe, INDICADORES as GERESA } from '@/app/datos/diresa/indicadores.js';
import { avanceDeSerie, estadoDelIndicador, FICHA_EQUIVALENTE, HALLAZGOS, indicadorDe, lecturaRegistrada, OBSERVACIONES_GERESA, puntosRegistrados } from '@/app/datos/monitoreo.js';
import { ASIGNACION, GERESA_DE_FICHA, LECTURAS, LECTURAS_GERESA } from '@/app/datos/monitoreo-lecturas.js';
import { numero } from '@/app/dominio/formato.js';
import { mediana } from '@/app/dominio/analisis.js';
import { acumuladoDe } from '@/app/dominio/monitoreo.js';
import { etiquetaPeriodo, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import GraficoIndicador from '@/app/paneles/monitoreo/GraficoIndicador.jsx';
import { AvanceDelAnio, AvisoDeCorte, BotonVolver, Cifra, Conclusion, Estado, formatoDe, formatoDeGrafico, fraccionDe, frasesDe, LeyendaDeAvance, Rotulo, SelectorDeCorte, SelectorDeVista } from '@/app/paneles/monitoreo/comunes.jsx';

const entero = (n) => (n == null ? 'Sin datos' : numero(n, Number.isInteger(n) ? 0 : 2));
const unidadDe = (i) => (i.factor === 100 ? '%' : i.unidad);

export function calcularSeguro(periodo, reportes, propios) {
  try {
    return calcularIndicadores(periodo, reportes, propios);
  } catch (error) {
    console.warn('monitoreo: no se pudo calcular la gestión hospitalaria', error);
    return [];
  }
}

/* Cada mes, con el cuadro y con el cálculo. El resultado del mes es el del cuadro si lo hay. */
export function lecturaDe(i, registrados, meses, calculados) {
  const puntos = puntosRegistrados(registrados, { familia: 'geresa', indicador: i.n }, meses, i.factor).map((p) => {
    const c = calculados.get(p.periodo)?.[i.n - 1] ?? null;
    const delSistema = c?.valor ?? null;
    const hayCuadro = p.num != null && p.den != null;
    return { ...p, num: hayCuadro ? p.num : (c?.numerador ?? null), den: hayCuadro ? p.den : (c?.denominador ?? null), valor: hayCuadro ? p.valor : delSistema, delSistema, deCuadro: hayCuadro };
  });
  return { puntos, acumulado: acumuladoDe(puntos, 'mensual', i.factor) };
}

const hastaMes = (a) => etiquetaPeriodo(a.hasta).split(' ')[0].toLowerCase();

/* Lo que se puede concluir sin un logro: cómo quedó el último mes frente a lo habitual. */
function fraseDelUltimoMes(lectura, f) {
  const con = lectura.puntos.filter((p) => p.valor != null);
  if (con.length < 2) return null;
  const ultimo = con.at(-1);
  const centro = mediana(con.map((p) => p.valor));
  const dif = ultimo.valor - centro;
  const mes = etiquetaPeriodo(ultimo.periodo).split(' ')[0];
  if (Math.abs(dif) < 1e-9) return `${mes}, el último mes con dato, quedó justo en su mediana (${f(centro)}).`;
  return `${mes}, el último mes con dato, quedó en ${f(ultimo.valor)}: ${f(Math.abs(dif))} ${dif > 0 ? 'por encima' : 'por debajo'} de su mediana (${f(centro)}).`;
}

/* El gráfico de un indicador, con el cálculo del sistema al lado solo donde hay cuadro. */
function GraficoDe({ indicador: i, lectura, alto, maxFrases = null, compacto = false }) {
  const unidad = unidadDe(i);
  const decimales = decimalesDe(i);
  const conSistema = lectura.puntos.map((p) => ({ periodo: p.periodo, valor: p.deCuadro ? p.delSistema : null }));
  const hayComparacion = conSistema.some((p) => p.valor != null);
  return (
    <GraficoIndicador
      etiqueta={i.nombre}
      puntos={lectura.puntos}
      unidad={unidad}
      decimales={decimales}
      escribir={formatoDeGrafico(decimales, unidad)}
      leerMes={(p) => `${frasesDe(LECTURAS_GERESA[i.n], p, formatoDe(decimales, unidad), { decimales })}${p.num == null ? '' : ` ${i.num.etiqueta}: ${entero(p.num)}. ${i.den.etiqueta}: ${entero(p.den)}.`}`}
      mejor={LECTURAS_GERESA[i.n].mejor ?? null}
      comparacion={hayComparacion ? conSistema : null}
      nombreComparacion={hayComparacion ? 'Calculado por el sistema' : null}
      alto={alto}
      maxFrases={maxFrases}
      compacto={compacto}
    />
  );
}

/* También en la cuenta del área (paneles/inicio/IndicadoresDelArea.jsx): la misma tarjeta. Allí,
   `delArea`: la cifra sale solo de sus reportes, así que no se la relaciona con otra fuente. */
export function Tarjeta({ indicador: i, lectura, abrir, delArea = false }) {
  const unidad = unidadDe(i);
  const decimales = decimalesDe(i);
  const f = formatoDe(decimales, unidad);
  const a = lectura.acumulado;
  const ficha = delArea ? null : FICHA_EQUIVALENTE[i.n];
  const lee = LECTURAS_GERESA[i.n];
  return (
    <Card
      title={`${i.n}. ${i.nombre}`}
      subtitle={i.mide}
      meta={ficha ? <Badge label={`Relacionado con la ficha ${ficha}`} tone="info" icon="sh-swap" /> : undefined}
      actions={
        <Tooltip title="Ver detalle" body="Cómo se calcula y el mes a mes, con el cuadro y con el sistema." focusable={false}>
          <IconButton icon="sh-arrow-right" aria-label={`Ver el detalle del indicador ${i.n}`} onClick={() => abrir(i.n)} />
        </Tooltip>
      }
    >
      <Stack gap={3} className="hrl-monitoreo__cuerpo">
        {a ? (
          <>
            <Cifra valor={f(a.valor)} unidad={lee.medida} nota={`Enero a ${hastaMes(a)}: ${fraccionDe(a.num, a.den, unidad)}`} />
            {/* Qué dice la cifra y su análisis, en el detalle (07/11/2026). */}
            <GraficoDe indicador={i} lectura={lectura} alto={200} compacto />
          </>
        ) : (
          <p className="hrl-monitoreo__motivo">Todavía sin cifras este año. Sin dato no se dibuja nada: no significa cero.</p>
        )}
      </Stack>
    </Card>
  );
}

/* `delArea`: el detalle en la cuenta del área, sin el cuadro de GERESA ni la ficha del DL 1153. */
export function Detalle({ indicador: i, lectura, volver, volverA, delArea = false }) {
  const unidad = unidadDe(i);
  const decimales = decimalesDe(i);
  const f = formatoDe(decimales, unidad);
  const a = lectura.acumulado;
  const lee = LECTURAS_GERESA[i.n];
  const columnas = [
    { key: 'mes', label: 'Mes', render: (p) => etiquetaPeriodo(p.periodo) },
    { key: 'num', label: i.num.etiqueta, align: 'right', render: (p) => entero(p.num) },
    { key: 'den', label: i.den.etiqueta, align: 'right', render: (p) => entero(p.den) },
    { key: 'valor', label: 'Resultado', align: 'right', render: (p) => <strong>{f(p.valor)}</strong> },
    ...(delArea ? [] : [{ key: 'sistema', label: 'Calculado por el sistema', align: 'right', tooltip: 'Con los oficios de las áreas y lo que digita Estadística. Sirve para ver dónde no coincide con el cuadro.', render: (p) => f(p.delSistema) },
    { key: 'origen', label: 'De dónde sale', render: (p) => (p.valor == null ? 'Sin datos' : p.deCuadro ? 'Cuadro de GERESA' : 'Sistema') }]),
  ];
  return (
    <Mosaic stacked className="hrl-panel">
      <div>
        <BotonVolver onClick={volver} a={volverA} />
      </div>
      <Card title={`${i.n}. ${i.nombre}`} subtitle={CATEGORIAS.find((c) => c.clave === i.categoria)?.titulo} wide>
        <Stack gap={3} className="hrl-monitoreo__cuerpo">
          <p className="hrl-monitoreo__motivo">{i.mide}</p>
          {a && <Cifra valor={f(a.valor)} unidad={lee.medida} nota={`Enero a ${hastaMes(a)}: ${fraccionDe(a.num, a.den, unidad)}`} />}
          {a && (
            <Conclusion tono="info" titulo="Qué dice esta cifra" frase={frasesDe(lee, a, f, { decimales })}>
              {fraseDelUltimoMes(lectura, f) && <span className="hrl-monitoreo__frase">{fraseDelUltimoMes(lectura, f)}</span>}
            </Conclusion>
          )}
          <p className="hrl-monitoreo__motivo">
            <strong>Numerador:</strong> {i.num.etiqueta} ({i.num.fuente}). <strong>Denominador:</strong> {i.den.etiqueta} ({i.den.fuente}).
          </p>
          {i.nota && <p className="hrl-monitoreo__motivo">{i.nota}</p>}
          {!delArea && OBSERVACIONES_GERESA[i.n] && (
            <Alert tone="warning" title={HALLAZGOS.geresa}>
              {OBSERVACIONES_GERESA[i.n]} Es una nota con fecha: no se recalcula con cada mes.
            </Alert>
          )}
          {!delArea && FICHA_EQUIVALENTE[i.n] && <Rotulo icono="sh-swap">Tema compartido con la ficha {FICHA_EQUIVALENTE[i.n]} del DL 1153, pero no es la misma cifra.</Rotulo>}
        </Stack>
      </Card>
      <Card title="Mes a mes" subtitle={delArea ? 'Con los reportes que su área envió al sistema. GERESA no define una meta para estos indicadores' : 'GERESA no define una meta para estos indicadores'} wide>
        <Stack gap={4} className="hrl-monitoreo__cuerpo">
          <GraficoDe indicador={i} lectura={lectura} alto={320} />
          <DataTable columns={columnas} rows={lectura.puntos.filter((p) => p.valor != null || p.delSistema != null)} rowKey={(p) => p.periodo} empty="Todavía no hay cifras de este año." />
        </Stack>
      </Card>
    </Mosaic>
  );
}

/* Las fichas del Anexo I que también miden cómo funciona el hospital. Se evalúan en la pestaña
   de desempeño: aquí se enlazan, con su cifra oficial, y no se repite su tarjeta. */
function FichasDeGestion({ registrados, meses, abrirFicha }) {
  const filas = ASIGNACION.gestion.map(indicadorDe);
  const columnas = [
    {
      key: 'ficha',
      label: 'Ficha del DL 1153',
      render: (i) => (
        <span className="hrl-monitoreo__fila">
          <Button tone="link" onClick={() => abrirFicha(i.ficha)}>
            Ficha {i.ficha}: {i.nombre}
          </Button>
          <span className="hrl-avance__nota">{LECTURAS[i.ficha].significa}</span>
        </span>
      ),
    },
    {
      key: 'oficial',
      label: 'Cifra oficial',
      width: 220,
      align: 'right',
      tooltip: 'Lo publicado por MINSA en el reporte DL 1153.',
      render: (i) => {
        const p = lecturaRegistrada(i, registrados, meses).partes[0];
        return (
          <span className="hrl-avance__ultimo">
            <strong>{formatoDe(i.decimales, p.unidad)(p.acumulado?.valor ?? null)}</strong>
            {p.acumulado && <span className="hrl-avance__nota">{LECTURAS[i.ficha].medida}</span>}
          </span>
        );
      },
    },
    { key: 'estado', label: 'Frente a su meta', width: 200, render: (i) => <Estado estado={estadoDelIndicador(i, lecturaRegistrada(i, registrados, meses))} /> },
    {
      key: 'geresa',
      label: 'En GERESA',
      width: 110,
      tooltip: 'El indicador de esta pestaña que trata el mismo tema, con otro criterio.',
      render: (i) => (GERESA_DE_FICHA[i.ficha] ? `Indicador ${GERESA_DE_FICHA[i.ficha]}` : <span className="hrl-avance__nota">No tiene</span>),
    },
    {
      key: 'ver',
      label: '',
      width: 64,
      align: 'right',
      render: (i) => (
        <Tooltip title="Ver la ficha" body="Abre su cifra oficial, su gráfico y cómo se calcula." focusable={false}>
          <IconButton icon="sh-arrow-right" aria-label={`Ver la ficha ${i.ficha}`} onClick={() => abrirFicha(i.ficha)} />
        </Tooltip>
      ),
    },
  ];
  return (
    <Card title="Fichas del DL 1153 que miden la gestión del hospital" subtitle="Sus fuentes son los sistemas de producción del hospital: SEEM, RENOXI, SETI-IPRESS, REFCON y recursos de salud. Las evalúa el Anexo I, con otro criterio que GERESA: no son la misma cifra" wide>
      <div className="hrl-avance__tabla">
        <DataTable columns={columnas} rows={filas} rowKey={(i) => i.ficha} />
      </div>
    </Card>
  );
}

export default function PanelGestion({ reportes, propios, anio, vigente, panel, corte = null, params, abrir, abrirFicha, volver, cambiarVista }) {
  const registrados = panel.datos?.resultados ?? [];
  const meses = useMemo(() => mesesDelAnioHasta(vigente), [vigente]);
  const calculados = useMemo(() => new Map(meses.map((p) => [p, calcularSeguro(p, reportes, propios)])), [meses, reportes, propios]);
  const lecturas = useMemo(() => new Map(GERESA.map((i) => [i.n, lecturaDe(i, registrados, meses, calculados)])), [registrados, meses, calculados]);

  const pedido = GERESA.find((i) => i.n === Number(params.indicador));
  if (pedido) return <Detalle indicador={pedido} lectura={lecturas.get(pedido.n)} volver={volver} />;

  const ver = params.ver === 'lista' ? 'lista' : 'tarjetas';
  const conCifra = GERESA.filter((i) => lecturas.get(i.n).acumulado).length;
  const delCuadro = registrados.filter((r) => r.familia === 'geresa');
  const hastaCuadro = delCuadro.reduce((m, r) => Math.max(m, r.mes), 0);

  const columnas = [
    {
      key: 'indicador',
      label: 'Indicador',
      render: (i) => (
        <span className="hrl-monitoreo__fila">
          <Button tone="link" onClick={() => abrir(i.n)}>
            {i.n}. {i.nombre}
          </Button>
          <span className="hrl-avance__nota">{i.mide}</span>
        </span>
      ),
    },
    {
      key: 'avance',
      label: 'Avance del año',
      width: 250,
      render: (i) => <AvanceDelAnio avance={avanceDeSerie(lecturas.get(i.n).puntos, meses, anio)} escribir={formatoDe(decimalesDe(i), unidadDe(i))} />,
    },
    {
      key: 'resultado',
      label: 'Resultado',
      width: 230,
      align: 'right',
      render: (i) => {
        const a = lecturas.get(i.n).acumulado;
        const u = unidadDe(i);
        return (
          <span className="hrl-avance__ultimo">
            <strong>{formatoDe(decimalesDe(i), u)(a?.valor ?? null)}</strong>
            {a && <span className="hrl-avance__nota">{LECTURAS_GERESA[i.n].medida}</span>}
          </span>
        );
      },
    },
    {
      key: 'ver',
      label: '',
      width: 64,
      align: 'right',
      render: (i) => (
        <Tooltip title="Ver detalle" body="Cómo se calcula y el mes a mes, con el cuadro y con el sistema." focusable={false}>
          <IconButton icon="sh-arrow-right" aria-label={`Ver el detalle del indicador ${i.n}`} onClick={() => abrir(i.n)} />
        </Tooltip>
      ),
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <PageActions>
        <Stack direction="row" gap={2} align="center" wrap>
          <SelectorDeVista valor={ver} onChange={cambiarVista} />
          {corte?.meses.length > 1 && <SelectorDeCorte meses={corte.meses} valor={corte.hasta} onChange={corte.cambiar} />}
        </Stack>
      </PageActions>

      <div className="hrl-monitoreo__cifras">
        <StatCard label="Indicadores" value={GERESA.length} note="Formato de GERESA Loreto" info="Los 22 de producción, eficiencia y calidad que el hospital remite a DIRESA." />
        <StatCard label="Con cifra este año" value={conCifra} note={`de ${GERESA.length}`} info="Con el cuadro cargado o con lo que calcula el sistema." />
        <StatCard label="Cuadro de GERESA" value={hastaCuadro ? etiquetaPeriodo(`${anio}-${String(hastaCuadro).padStart(2, '0')}`).split(' ')[0] : 'Sin cargar'} note="Hasta ese mes viene del cuadro" info="Lo que el hospital llevó a mano. Desde el mes siguiente, los calcula el sistema con los oficios y lo que digita Estadística." />
        <StatCard label="Con observación" value={Object.keys(OBSERVACIONES_GERESA).length} note="Diferencias del cruce" info="Indicadores donde el cuadro no coincide con otra fuente. Se explica en cada uno." />
      </div>

      {panel.error && (
        <Alert tone="info" title="Sin el cuadro de GERESA por ahora">
          {panel.error}
        </Alert>
      )}

      <AvisoDeCorte hasta={corte?.hasta} />

      {ver === 'lista' && <LeyendaDeAvance />}

      {CATEGORIAS.map((c) => {
        const delGrupo = GERESA.filter((i) => i.categoria === c.clave);
        if (ver === 'lista') {
          return (
            <Card key={c.clave} title={c.titulo} subtitle={`${delGrupo.length} indicadores`} wide>
              <div className="hrl-avance__tabla">
                <DataTable columns={columnas} rows={delGrupo} rowKey={(i) => i.n} />
              </div>
            </Card>
          );
        }
        return [
          <h2 key={`titulo-${c.clave}`} className="hrl-monitoreo__grupo">
            {c.titulo}
          </h2>,
          ...delGrupo.map((i) => <Tarjeta key={i.n} indicador={i} lectura={lecturas.get(i.n)} abrir={abrir} />),
        ];
      })}

      <FichasDeGestion registrados={registrados} meses={meses} abrirFicha={abrirFicha} />
    </Mosaic>
  );
}
