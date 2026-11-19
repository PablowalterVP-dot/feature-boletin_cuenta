/* Una ficha de desempeño, como tablero: lo importante a la vista sin bajar.

   Arriba, las cifras del año. Debajo, el gráfico grande —el logro acumulado
   frente a la meta, o los pacientes de cada mes— con el mes elegido al lado,
   como en el prototipo: elegir un mes en el gráfico (o con las flechas) cambia
   el panel sin mover la página. Debajo, los pacientes de ese mes, plegados:
   se leen al desplegarlos (traen nombre y DNI). Lo de consulta —mes a mes,
   por tipo y cómo leer el indicador— va en pestañas, para que no alargue la
   página.

   Todo sale de GET /api/desempeno/fichas/{n}. El mes elegido vive en la URL
   (`?mes=9`), como el año: un enlace abre lo mismo que se estaba mirando. */

import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, EmptyState, IconButton, Input, Mosaic, Stack, StatCard, Tabs, Tooltip } from '@hrl/core-ui';
import { fechaCorta, numero } from '@/app/dominio/formato.js';
import {
  bajadaDeFicha, CLASES, cifra, DATOS, diaMes, ESTADO_MES, fraccion, frenteAMinsa, mesMinuscula, nombreMes, plural, acumuladoVigente, frenteAMeta, mesAbierto, puntos, RESULTADO, textoFalta,
  resultadoDe, textoMeta, titularDeFicha, URGENTE_DIAS,
} from '@/app/dominio/desempeno.js';
import { Cargando, FilasQueAbren, SinAcceso, useDesempeno } from './comunes.jsx';
import { CuadrosPorPaciente, LogroAcumulado, Muestra, PacientesPorMes } from './graficos.jsx';
import Casos from './Casos.jsx';

/* Volver, a la vista y arriba: es lo primero que se busca al terminar de mirar una ficha. */
function Volver({ irA, anio, panel }) {
  return (
    <Stack direction="row" gap={3} align="center">
      <Button tone="ghost" icon="sh-table" onClick={() => irA(panel, anio ? { anio: String(anio) } : {})}>
        {panel.startsWith('monitoreo') ? 'Volver a Monitoreo Indicadores' : 'Volver al tablero'}
      </Button>
    </Stack>
  );
}

function Cabecera({ detalle, cambiarAnio }) {
  const { ficha, anio } = detalle;
  const dimension = detalle.dimensiones.find((d) => d.codigo === ficha.dimension);
  const estado = RESULTADO[resultadoDe(detalle)];
  return (
    <Card
      accent={estado === RESULTADO.bajo ? 'var(--destructive)' : estado === RESULTADO.cumple ? 'var(--success)' : 'var(--primary)'}
      icon="sh-chart"
      title={titularDeFicha(detalle)}
      subtitle={`Ficha ${String(ficha.numero).padStart(2, '0')}: ${ficha.nombre_corto ?? ficha.nombre}${dimension ? `. ${dimension.nombre}` : ''}`}
      meta={<Badge label={estado.etiqueta} tone={estado.tono} />}
      wide
    >
      <div className="hrl-cuerpo">
        <div className="hrl-cabecera-ficha">
          <p className="hrl-nota">{bajadaDeFicha(detalle)}</p>
          <Input
            label="Año"
            kind="select"
            info="Los años con datos cargados o con un cálculo guardado."
            value={String(anio)}
            options={(detalle.anios.length ? detalle.anios : [anio]).map((a) => ({ value: String(a), label: String(a) }))}
            onChange={(e) => cambiarAnio(e.target.value)}
          />
        </div>
      </div>
    </Card>
  );
}

function SinResultado({ detalle }) {
  const { ficha } = detalle;
  const motivo = !ficha.aplica
    ? (ficha.motivo_no_aplica ?? 'Este indicador no se evalúa en el hospital.')
    : ficha.faltan.length
      ? `No se puede calcular mientras falte ${ficha.faltan.join(', ')}. Hay que obtener esas fuentes con sus áreas responsables.`
      : detalle.resultado
        ? `Todavía ningún mes de ${detalle.anio} está consolidado: el resultado aparece cuando cierre la corrección del HIS del primer mes.`
        : ficha.tiene_calculo
          ? `Sus fuentes se cargan, pero todavía no hay un cálculo guardado para ${detalle.anio}.`
          : 'Sus fuentes ya se cargan, pero su cálculo todavía no está en el sistema: se activa cuando su regla esté validada contra MINSA.';
  const columnas = [
    { key: 'nombre', label: 'Fuente', tooltip: 'El sistema de origen de los datos.' },
    {
      key: 'cargable',
      label: 'Situación',
      width: 190,
      tooltip: 'Si el hospital ya puede cargarla en el sistema.',
      render: (f) => <Badge label={f.cargable ? 'Se carga en el sistema' : 'Por obtener'} tone={f.cargable ? 'ok' : 'warn'} />,
    },
    { key: 'area_responsable', label: 'Área responsable', width: 220, tooltip: 'Quién entrega el archivo.', render: (f) => f.area_responsable ?? 'Estadística (carga mensual)' },
    { key: 'periodicidad', label: 'Periodicidad', width: 130, tooltip: 'Cada cuánto se carga.' },
  ];
  return (
    <>
      <Alert tone={ficha.aplica ? 'info' : 'warning'} title={DATOS[ficha.datos]?.etiqueta ?? 'Sin resultado'}>
        {motivo} «Sin resultado» no es 0 %: no se midió.
      </Alert>
      {ficha.fuentes.length > 0 && (
        <Card accent="var(--info)" icon="sh-folder" title="De dónde salen sus datos" subtitle="Las fuentes que alimentan a esta ficha" flush>
          <DataTable columns={columnas} rows={ficha.fuentes} rowKey={(f) => f.codigo} />
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------ el mes elegido */

const ESTADO_DICHO = {
  oficial: () => 'Oficial: calculado con el corte del reporte de MINSA.',
  consolidado: () => 'Consolidado: el HIS de este mes ya cerró.',
  por_cerrar: (m) => textoFalta(m) ?? 'Faltan datos posteriores.',
  preliminar: (m) => `Preliminar: el HIS se corrige del ${diaMes(m.apertura_his)} al ${diaMes(m.cierre_his)}.`,
};

function ElMes({ anio, meses, mes, elegir }) {
  const i = meses.findIndex((x) => x.mes === mes);
  const m = meses[i];
  const anterior = meses[i - 1];
  const siguiente = meses[i + 1];
  const estado = ESTADO_MES[m.estado];
  const minsa = m.minsa;
  const c = cifra(m.acumulado);
  return (
    <aside className="hrl-tablero__mes" aria-live="polite" aria-label={`Detalle de ${nombreMes(anio, mes)}`}>
      <div className="hrl-tablero__nav">
        <span className="hrl-girado">
          <IconButton icon="sh-chevron" aria-label="Mes anterior" disabled={!anterior} onClick={() => anterior && elegir(anterior.mes)} />
        </span>
        <h3>
          {nombreMes(anio, mes)} {anio}
        </h3>
        <IconButton icon="sh-chevron" aria-label="Mes siguiente" disabled={!siguiente} onClick={() => siguiente && elegir(siguiente.mes)} />
      </div>
      <Stack direction="row" gap={2} align="center" wrap>
        <Tooltip title={estado.etiqueta} body={estado.ayuda}>
          <Badge label={estado.etiqueta} tone={estado.tono} />
        </Tooltip>
        <span className="hrl-nota">{ESTADO_DICHO[m.estado](m)}</span>
      </Stack>
      {m.estado !== 'por_cerrar' && m.falta_hasta && <p className="hrl-nota">{textoFalta(m)}</p>}
      <p className="hrl-tablero__cifra">
        <strong>
          {m.a_tiempo} de {m.denominador}
        </strong>{' '}
        {m.denominador === 1 ? 'paciente inició' : 'pacientes iniciaron'} tratamiento a tiempo
      </p>
      <CuadrosPorPaciente mes={m} />
      <dl className="hrl-leyenda-mes">
        {CLASES.filter((k) => m[k.clave]).map((k) => (
          <div key={k.clave}>
            <dt>
              <Tooltip title={k.etiqueta} body={k.ayuda} focusable={false}>
                <span>
                  <Muestra clase={k} />
                  {k.etiqueta}
                </span>
              </Tooltip>
            </dt>
            <dd>{m[k.clave]}</dd>
          </div>
        ))}
      </dl>
      <dl className="hrl-pares">
        <div>
          <dt>Resultado del mes</dt>
          <dd>{m.porcentaje == null ? 'Sin casos' : fraccion(m.porcentaje)}</dd>
        </div>
        <div>
          <dt>Acumulado enero–{mesMinuscula(anio, mes)}</dt>
          <dd>
            {c.texto}: {m.acumulado.numerador}/{m.acumulado.denominador}
          </dd>
        </div>
        <div>
          <dt>Resultado MINSA</dt>
          <dd>
            {minsa && mesAbierto(m) ? (
              <Tooltip title={`MINSA: ${minsa.numerador}/${minsa.denominador}`} body="El mes todavía no está cerrado: se compara cuando estén las tramas que faltan." focusable={false}>
                <span>
                  {minsa.numerador}/{minsa.denominador}: se compara al cerrar
                </span>
              </Tooltip>
            ) : minsa ? (
              <Tooltip title={`MINSA: ${minsa.numerador}/${minsa.denominador}`} body={`${minsa.fecha_corte ? `Corte del ${fechaCorta(minsa.fecha_corte)}. ` : ''}${minsa.documento ?? minsa.observacion ?? ''}`} focusable={false}>
                <span style={{ color: minsa.coincide ? undefined : 'var(--warning-fg)' }}>
                  {minsa.numerador}/{minsa.denominador}: {minsa.coincide ? 'coincide' : 'difiere'}
                </span>
              </Tooltip>
            ) : (
              'sin publicar'
            )}
          </dd>
        </div>
      </dl>
      {m.por_gestionar > 0 ? (
        <div className="hrl-tablero__actuar">
          <strong>Para actuar antes del {diaMes(m.cierre_his)}</strong>
          {m.plazo_vigente > 0 && <span>{plural(m.plazo_vigente, 'paciente sin tratamiento que aún puede sumar', 'pacientes sin tratamiento que aún pueden sumar')}</span>}
          {m.por_corregir > 0 && <span>{plural(m.por_corregir, 'registro por corregir en el HIS', 'registros por corregir en el HIS')}</span>}
        </div>
      ) : (
        m.denominador > 0 &&
        m.a_tiempo === 0 &&
        m.sin_tratamiento === m.denominador && (
          <p className="hrl-nota">
            Ninguno de los {m.denominador} pacientes tiene tratamiento registrado en el plazo. Conviene revisar si se trataron sin registrar o en otra institución.
          </p>
        )
      )}
    </aside>
  );
}

/* -------------------------------------------------------------- las pestañas */

/* Mes a mes, lo fundamental y sin repetir: el resultado del mes (cuántos de
   cuántos y su porcentaje), el acumulado que se compara con la meta, lo que
   publicó MINSA y si el mes ya no cambia. Pulsar la fila, o su botón, lleva
   al gráfico con ese mes elegido: el detalle de cada paciente está ahí. */
function columnasDeMeses({ anio, verEnGrafico }) {
  return [
    {
      key: 'mes',
      label: 'Mes',
      width: 130,
      tooltip: 'Pulse la fila para verla en el gráfico.',
      render: (m) => (
        <Button tone="link" onClick={() => verEnGrafico(m.mes)}>
          {nombreMes(anio, m.mes)}
        </Button>
      ),
    },
    {
      key: 'resultado',
      label: 'Resultado del mes',
      width: 180,
      align: 'right',
      tooltip: 'Pacientes que iniciaron tratamiento a tiempo, de los diagnosticados en el mes.',
      render: (m) => (
        <span>
          {m.numerador} de {m.denominador}: <strong>{m.porcentaje == null ? '—' : fraccion(m.porcentaje)}</strong>
        </span>
      ),
    },
    {
      key: 'acumulado',
      label: 'Acumulado',
      width: 120,
      align: 'right',
      tooltip: 'De enero a ese mes: la cifra que se compara con la meta.',
      render: (m) => (
        <Tooltip title={`Acumulado enero–${mesMinuscula(anio, m.mes)}`} body={`${m.acumulado.numerador} de ${m.acumulado.denominador} pacientes.`} focusable={false}>
          <strong>{fraccion(m.acumulado.porcentaje)}</strong>
        </Tooltip>
      ),
    },
    {
      key: 'minsa',
      label: 'MINSA',
      width: 170,
      align: 'right',
      tooltip: 'Lo que publicó MINSA para ese mes. Si coincide con el hospital, basta con decirlo.',
      render: (m) =>
        !m.minsa ? (
          <span className="hrl-nota">sin publicar</span>
        ) : mesAbierto(m) ? (
          <span className="hrl-nota">
            {m.minsa.numerador} de {m.minsa.denominador}: al cerrar
          </span>
        ) : m.minsa.coincide ? (
          <Badge label="Coincide" tone="ok" />
        ) : (
          <Tooltip title={`El hospital calcula ${m.numerador}/${m.denominador}`} body={`${m.minsa.fecha_corte ? `Corte del ${fechaCorta(m.minsa.fecha_corte)}. ` : ''}${m.minsa.documento ?? m.minsa.observacion ?? ''}`} focusable={false}>
            <span style={{ color: 'var(--warning-fg)' }}>
              {m.minsa.numerador} de {m.minsa.denominador}: {fraccion(m.minsa.denominador ? m.minsa.numerador / m.minsa.denominador : null)}
            </span>
          </Tooltip>
        ),
    },
    {
      key: 'estado',
      label: 'Estado',
      width: 130,
      tooltip: 'Oficial: con el corte de MINSA. Consolidado: ya no cambia. Por cerrar: faltan datos posteriores. Preliminar: el HIS todavía se corrige.',
      render: (m) => (
        <Tooltip title={ESTADO_MES[m.estado].etiqueta} body={ESTADO_MES[m.estado].ayuda}>
          <Badge label={ESTADO_MES[m.estado].etiqueta} tone={ESTADO_MES[m.estado].tono} />
        </Tooltip>
      ),
    },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (m) => (
        <div className="hrl-acciones-icono">
          <Tooltip title="Ver en el gráfico" body={`Elige ${mesMinuscula(anio, m.mes)} y lleva la vista al gráfico, con sus pacientes al lado.`} focusable={false}>
            <IconButton icon="sh-chart" tone="action" aria-label={`Ver ${nombreMes(anio, m.mes)} en el gráfico`} onClick={() => verEnGrafico(m.mes)} />
          </Tooltip>
        </div>
      ),
    },
  ];
}

function ComoLeer({ tecnica, ficha }) {
  if (!tecnica) return <p className="hrl-nota">La ficha técnica de {ficha.nombre_corto ?? 'este indicador'} todavía no está en el sistema: se agrega cuando se programe su cálculo.</p>;
  const filas = [
    ['Qué mide', tecnica.que_mide],
    ['Numerador', tecnica.numerador],
    ['Denominador', tecnica.denominador],
    ['Exclusiones', tecnica.exclusiones],
    ['Meta', tecnica.meta],
    ['Cumplimiento', tecnica.cumplimiento],
    ['Frecuencia', tecnica.frecuencia],
    ['Responsable técnico', tecnica.responsable],
  ];
  return (
    <div className="hrl-tablero">
      <dl className="hrl-definiciones">
        {filas.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <Stack gap={4}>
        <Stack gap={2}>
          <strong>Limitaciones</strong>
          <ul className="hrl-lista">
            {tecnica.limitaciones.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Stack>
        <Stack gap={2}>
          <strong>Preguntas clave</strong>
          <ul className="hrl-lista">
            {tecnica.preguntas.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Stack>
      </Stack>
    </div>
  );
}

/* Por tipo de caso, del año o de un mes: el filtro dice de qué periodo son las
   cifras, para que no se confunda el total del año con un mes. */
function PorTipo({ anio, meses, categorias }) {
  const [mesTipo, setMesTipo] = useState('');
  if (!categorias.length) return <p className="hrl-nota">Esta ficha no separa sus casos por tipo.</p>;
  const m = mesTipo ? Number(mesTipo) : null;
  const filas = categorias
    .map((c) => {
      const delMes = m ? c.meses.find((x) => x.mes === m) : c;
      return delMes ? { categoria: c.categoria, nombre: c.nombre, numerador: delMes.numerador, denominador: delMes.denominador } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.denominador - a.denominador);
  const total = filas.reduce((x, f) => ({ numerador: x.numerador + f.numerador, denominador: x.denominador + f.denominador }), { numerador: 0, denominador: 0 });
  return (
    <Stack gap={3}>
      <div className="hrl-cabecera-ficha">
        <p className="hrl-nota">
          {m ? `Pacientes diagnosticados en ${mesMinuscula(anio, m)}` : `Todos los pacientes calculados de ${anio}`}: {total.numerador} de {total.denominador} a tiempo.
        </p>
        <Input
          label="Periodo"
          kind="select"
          value={mesTipo}
          onChange={(e) => setMesTipo(e.target.value)}
          options={[{ value: '', label: `Todo ${anio}` }, ...meses.map((x) => ({ value: String(x.mes), label: nombreMes(anio, x.mes) }))]}
        />
      </div>
      {filas.length ? (
        <DataTable
          columns={[
            { key: 'nombre', label: 'Tipo', tooltip: 'La categoría del caso según la ficha técnica.' },
            {
              key: 'resultado',
              label: 'A tiempo',
              width: 180,
              align: 'right',
              tooltip: 'Cuántos iniciaron tratamiento a tiempo, de los diagnosticados de ese tipo.',
              render: (c) => (
                <span>
                  {c.numerador} de {c.denominador}: <strong>{fraccion(c.numerador / c.denominador)}</strong>
                </span>
              ),
            },
          ]}
          rows={filas}
          rowKey={(c) => c.categoria}
        />
      ) : (
        <p className="hrl-nota">Ningún caso en {mesMinuscula(anio, m)}.</p>
      )}
    </Stack>
  );
}

const GRAFICOS = [
  { key: 'logro', label: 'Logro acumulado frente a la meta', icon: 'sh-chart' },
  { key: 'pacientes', label: 'Pacientes de cada mes', icon: 'sh-people' },
];

const PESTANAS = [
  { key: 'meses', label: 'Mes a mes', icon: 'sh-table' },
  { key: 'tipos', label: 'Por tipo', icon: 'sh-pie' },
  { key: 'leer', label: 'Cómo leer este indicador', icon: 'sh-doc' },
];

/* ------------------------------------------------------------------ el tablero */

function ConResultado({ detalle, mes, elegir, conPacientes = true }) {
  const { anio, resultado } = detalle;
  const [grafico, setGrafico] = useState('logro');
  const [pestana, setPestana] = useState('meses');
  const [pacientes, setPacientes] = useState(false); // la sección de pacientes, desplegada o no
  const refCasos = useRef(null);
  const ultimo = resultado.meses.at(-1);
  const consolidado = resultado.meses.find((m) => m.mes === resultado.consolidado_hasta);
  /* La cifra del año es el acumulado de todo lo cargado: el monitoreo mira lo
     que hay hoy. Lo ya cerrado (`logro`) va aparte, en la tercera tarjeta. */
  const logro = resultado.logro;
  const acc = acumuladoVigente(resultado);
  const frente = frenteAMeta(acc, resultado.meta);
  const primerAbierto = resultado.meses.find((m) => m.falta_hasta);
  const cuandoCierra = ultimo?.falta_hasta ? `faltan datos hasta el ${diaMes(ultimo.falta_hasta)}` : ultimo ? `cierra el ${diaMes(ultimo.cierre_his)}` : '';
  const minsa = frenteAMinsa(resultado);
  const pg = resultado.por_gestionar;
  const meta = textoMeta(resultado.meta);

  /* Abrir los pacientes es pedirlos: ahí sí se lleva la vista a la lista. */
  const [llevar, setLlevar] = useState(0);
  useEffect(() => {
    if (llevar) refCasos.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [llevar]);

  /* Ver los pacientes de un mes: se elige, se despliega su sección y se lleva la vista ahí. */
  const verCasos = (m) => {
    if (m) elegir(m);
    setPacientes(true);
    setLlevar((n) => n + 1);
  };
  /* Desde la cifra «Casos por gestionar»: el último mes que los tiene. */
  const mesConCasos = [...resultado.meses].reverse().find((x) => x.por_gestionar)?.mes;
  const refGrafico = useRef(null);
  /* Desde la tabla: elegir el mes y llevar la vista al gráfico, que es donde se ve. */
  const verEnGrafico = (m) => {
    elegir(m);
    refGrafico.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const alElegirEnBarras = (m) => verCasos(m);

  return (
    <>
      <div className="hrl-kpis">
        <StatCard
          label={`Acumulado, enero–${mesMinuscula(anio, acc.mes)}`}
          value={fraccion(acc.porcentaje)}
          note={`${acc.numerador} de ${acc.denominador} pacientes, ${puntos(frente.diferencia)} frente a la meta de ${meta}${acc.preliminar ? ' · incluye meses sin cerrar' : ''}`}
          severity={frente.cumple == null ? 'neutral' : frente.cumple ? 'normal' : 'abnormal'}
          percent={acc.porcentaje == null ? undefined : acc.porcentaje * 100}
          info={`El acumulado del año con todo lo cargado, de enero a ${mesMinuscula(anio, acc.mes)}.${acc.preliminar ? ' Incluye meses que todavía pueden cambiar: con las tramas siguientes puede aparecer un tratamiento o una exclusión.' : ''} La barra va de 0 a 100 %.`}
        />
        <StatCard
          label="Cumplimiento"
          value={frente.cumplimiento == null ? '—' : `${numero(frente.cumplimiento * 100, 1)} %`}
          note={`acumulado ÷ meta (${meta})`}
          severity={frente.cumplimiento == null ? 'nodata' : frente.cumplimiento >= 1 ? 'normal' : 'abnormal'}
          percent={frente.cumplimiento == null ? undefined : frente.cumplimiento * 100}
          delay={60}
          info="Cuánto del camino a la meta se ha recorrido. 100 % es haber llegado."
        />
        <StatCard
          label={!acc.preliminar ? 'Sin meses abiertos' : logro ? `Ya cerrado, enero–${mesMinuscula(anio, consolidado.mes)}` : primerAbierto ? `Para cerrar ${mesMinuscula(anio, primerAbierto.mes)}` : 'Ningún mes cerrado'}
          value={!acc.preliminar ? '—' : logro ? fraccion(logro.porcentaje) : primerAbierto ? `Datos al ${diaMes(primerAbierto.falta_hasta)}` : '—'}
          note={
            !acc.preliminar
              ? 'todo lo calculado ya está cerrado'
              : logro
                ? `${logro.numerador} de ${logro.denominador}: lo que ya no cambia${cuandoCierra ? `. ${mesMinuscula(anio, ultimo.mes)}: ${cuandoCierra}` : ''}`
                : 'falta subir las tramas siguientes: están en «Carga de datos»'
          }
          severity={acc.preliminar ? 'suspect' : 'nodata'}
          delay={120}
          info="La parte del año que ya no va a cambiar: los meses oficiales y consolidados. El resto espera tramas posteriores o el cierre del HIS."
        />
        <StatCard
          label="Casos por gestionar"
          value={String(pg.total)}
          note={pg.total ? `${pg.vencen_pronto ? `${plural(pg.vencen_pronto, 'vence', 'vencen')} en ${URGENTE_DIAS} días o menos, ` : ''}${pg.sin_revisar} sin revisar${conPacientes ? ' · ver casos' : ''}` : 'nada pendiente'}
          severity={pg.total ? 'suspect' : 'normal'}
          delay={180}
          info="Pacientes que todavía pueden sumar si se tratan o se corrige su registro antes del cierre del HIS. Pulse para verlos."
          onClick={pg.total && conPacientes ? () => verCasos(mesConCasos) : undefined}
        />
        <StatCard
          label="Frente a MINSA"
          value={minsa.texto}
          note={minsa.detalle}
          severity={minsa.tono === 'ok' ? 'normal' : minsa.tono === 'warn' ? 'suspect' : 'nodata'}
          delay={240}
          info="Compara el cálculo del hospital con lo que MINSA publicó, mes a mes. Lo publicado se registra en «Carga de datos»."
        />
      </div>

      <div ref={refGrafico}>
      <Card
        accent="var(--primary)"
        icon="sh-chart"
        title={`Evolución de ${anio}`}
        subtitle={
          grafico === 'logro'
            ? `El acumulado de enero a cada mes, frente a la meta de ${meta}. Pulse un mes para ver su detalle al lado.`
            : 'Qué le pasa hoy a cada paciente de cada mes. Pulse un mes para ver sus pacientes.'
        }
        wide
      >
        <Stack gap={4} className="hrl-cuerpo">
          <Tabs tabs={GRAFICOS} active={grafico} onChange={setGrafico} />
          <div className="hrl-tablero">
            <Stack gap={3}>
              {grafico === 'logro' ? (
                <LogroAcumulado anio={anio} meses={resultado.meses} meta={resultado.meta} elegido={mes} onElegir={elegir} mesConCorte={resultado.mes_con_corte} fechaCorte={resultado.fecha_corte} />
              ) : (
                <PacientesPorMes anio={anio} meses={resultado.meses} elegido={mes} onElegir={alElegirEnBarras} />
              )}
              <Stack direction="row" gap={4} wrap>
                {grafico === 'logro' ? (
                  <span className="hrl-nota">Punto lleno: el mes ya no cambia; con centro blanco: todavía puede cambiar. «Casos», bajo cada mes: pacientes del denominador.</span>
                ) : (
                  CLASES.map((k) => (
                    <Tooltip key={k.clave} title={k.etiqueta} body={k.ayuda}>
                      <span className="hrl-nota">
                        <Muestra clase={k} />
                        {k.etiqueta}
                      </span>
                    </Tooltip>
                  ))
                )}
              </Stack>
            </Stack>
            <ElMes anio={anio} meses={resultado.meses} mes={mes} elegir={elegir} />
          </div>
        </Stack>
      </Card>
      </div>

      {conPacientes && <div ref={refCasos}>
        <Casos numero={detalle.ficha.numero} anio={anio} mes={resultado.meses.find((x) => x.mes === mes)} abierto={pacientes} alternar={() => setPacientes((v) => !v)} />
      </div>}

      <Card accent="var(--neutral-text)" icon="sh-table" title="Para consultar" subtitle="El detalle de cada mes, los tipos de caso y la ficha técnica" wide>
        <Stack gap={4} className="hrl-cuerpo">
          <Tabs tabs={PESTANAS} active={pestana} onChange={setPestana} />
          {pestana === 'meses' && (
            <FilasQueAbren filas={resultado.meses} abrir={(m) => verEnGrafico(m.mes)}>
              <DataTable columns={columnasDeMeses({ anio, verEnGrafico })} rows={resultado.meses} rowKey={(m) => m.mes} rowClass={(m) => `hrl-fila-que-abre${m.mes === mes ? ' hrl-fila--elegida' : ''}`} />
            </FilasQueAbren>
          )}
          {pestana === 'tipos' && <PorTipo anio={anio} meses={resultado.meses} categorias={resultado.por_categoria} />}
          {pestana === 'leer' && <ComoLeer tecnica={detalle.ficha_tecnica} ficha={detalle.ficha} />}
        </Stack>
      </Card>
    </>
  );
}

/* `panel`: la pantalla desde la que se abre (el tablero o el panel de monitoreo).
   `conPacientes`: la lista de pacientes es solo para quien tiene el permiso del módulo. */
export default function Ficha({ numero: n, params, irA, panel = 'monitoreo', conPacientes = true }) {
  const anioPedido = params.anio ? Number(params.anio) : null;
  const { datos, cargando, error, status, recargar } = useDesempeno(`/fichas/${n}`, anioPedido ? { anio: anioPedido } : null);

  if (cargando && !datos) return <Cargando />;
  if (status === 404) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-table" title={`No existe la ficha ${n}`} body="Las fichas de desempeño van del 1 al 34.">
          <Button tone="ghost" icon="sh-table" onClick={() => irA(panel)}>
            Volver
          </Button>
        </EmptyState>
      </Mosaic>
    );
  }
  if (error) return <SinAcceso error={error} status={status} recargar={recargar} />;
  return <VistaFicha datos={datos} params={params} irA={irA} panel={panel} conPacientes={conPacientes} />;
}

/* Lo que se dibuja con la ficha ya leída. Aparte para que la prueba de humo la
   pinte con datos sin pasar por el servidor. */
export function VistaFicha({ datos, params, irA, panel = 'monitoreo', conPacientes = true }) {
  const n = datos.ficha.numero;
  const anioPedido = params.anio ? Number(params.anio) : null;
  const meses = datos.resultado?.meses.map((m) => m.mes) ?? [];
  const pedido = Number(params.mes);
  const mes = meses.includes(pedido) ? pedido : meses.at(-1);
  const ir = (cambios, opciones) =>
    irA(panel, Object.fromEntries(Object.entries({ ficha: String(n), anio: anioPedido ? String(anioPedido) : null, mes: mes ? String(mes) : null, ...cambios }).filter(([, v]) => v)), opciones);

  return (
    <Mosaic className="hrl-panel">
      <Volver irA={irA} anio={anioPedido} panel={panel} />
      <Cabecera detalle={datos} cambiarAnio={(a) => ir({ anio: a, mes: null }, { quieto: true })} />
      {datos.resultado?.meses.length && mes ? (
        <ConResultado detalle={datos} mes={mes} elegir={(m) => ir({ mes: String(m) }, { quieto: true })} conPacientes={conPacientes} />
      ) : (
        <>
          <SinResultado detalle={datos} />
          {datos.ficha.aplica && (
            <Card accent="var(--neutral-text)" icon="sh-doc" title="Cómo leer este indicador" subtitle={datos.ficha.nombre}>
              <div className="hrl-cuerpo">
                <ComoLeer tecnica={datos.ficha_tecnica} ficha={datos.ficha} />
              </div>
            </Card>
          )}
        </>
      )}
    </Mosaic>
  );
}
