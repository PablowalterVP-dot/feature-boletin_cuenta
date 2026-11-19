/* Actividades operativas del POI: la ejecución física de cada mes.

   Una tarjeta por área, con sus actividades. La cifra del mes sale de donde dice
   el catálogo (`datos/planeamiento/actividades.js`): del reporte que el área
   entregó, del calendario, o la digita Planeamiento. Lo calculado no se escribe;
   si Planeamiento no está de acuerdo, lo ajusta con una nota y el cálculo sigue
   a la vista en el detalle.

   La primera columna es el enlace al detalle de la actividad, y cada fila lleva
   además su botón explícito. Las actividades que se digitan se escriben ahí
   mismo; un ajuste, en el detalle, porque pide la nota. */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Icon, IconButton, Input, Mosaic, NumberCell, PaginatedTable, StatCard, Toast, Tooltip } from '@hrl/core-ui';
import { ACTIVIDADES, AREAS_CON_ACTIVIDADES, ANIO_ACTIVIDADES, actividadesDe, codigoCorto } from '@/app/datos/planeamiento/actividades.js';
import { fuenteDeArea } from '@/app/datos/diresa/fuentes.js';
import { area, nombreArea } from '@/app/datos/areas.js';
import { registroDe, useHoy } from '@/app/datos/store.js';
import { cargarActividades, guardarEjecucion } from '@/app/servicios/api.js';
import { CALCULO, COMO, NIVEL, acumulado, ejecucionDelMes, exigeNota, metaAlMes, prorrateo } from '@/app/dominio/actividades.js';
import { etiquetaPeriodo, periodoVigente } from '@/app/dominio/periodos.js';
import { numero, porcentaje, fechaHora } from '@/app/dominio/formato.js';
import { descargarCsv } from '@/app/dominio/csv.js';

const COLOR_TONO = Object.freeze({
  ok: 'var(--success-text)',
  warn: 'var(--warning-fg)',
  crit: 'var(--destructive-text)',
  info: 'var(--info-fg)',
  neutral: 'var(--muted-foreground)',
});

const PEQUENO = { fontSize: 'var(--text-xs)', color: 'var(--muted-foreground)' };

const mesDe = (periodo) => periodo.slice(5, 7);
const periodoDe = (mes) => `${ANIO_ACTIVIDADES}-${mes}`;

/* Los meses del año de las actividades hasta el vigente: más allá no hay nada
   que registrar todavía. */
function mesesHasta(vigente) {
  const ultimo = vigente.startsWith(ANIO_ACTIVIDADES) ? Number(mesDe(vigente)) : vigente > ANIO_ACTIVIDADES ? 12 : 0;
  return Array.from({ length: ultimo }, (_, i) => String(i + 1).padStart(2, '0'));
}

/* La cifra de un mes, con lo que hace falta para pintarla. La fuente va
   siempre: a una actividad que se digita le da sus referencias. */
function ejecucion(actividad, reportes, actividades, mes) {
  const periodo = periodoDe(mes);
  const fuente = fuenteDeArea(reportes, actividad.area, periodo);
  const registro = registroDe(actividades, ANIO_ACTIVIDADES, actividad.codigo, mes);
  return { ...ejecucionDelMes(actividad, { periodo, fuente, registro }), registro, fuente };
}

function Como({ como }) {
  const c = COMO[como];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...PEQUENO, color: COLOR_TONO[c.tono] }}>
      <Icon name={c.icono} size={13} />
      {c.label}
    </span>
  );
}

/* Las cifras del oficio que se parecen a una actividad que se digita. */
function referenciasDe(actividad, fuente, periodo) {
  const lista = (actividad.calculo.referencias ?? []).map((r) => ({
    etiqueta: r.etiqueta,
    valor: fuente?.estado === 'validado' ? r.derivar(fuente.datos, periodo) : null,
  }));
  if (actividad.origenCeplan === 'prorrateo') lista.push({ etiqueta: 'Meta ÷ 12 (referencia, no es producción)', valor: prorrateo(actividad.meta), decimales: 1 });
  return lista;
}

function textoReferencias(referencias, fuente) {
  if (!referencias.length) return 'Ningún oficio trae esta cifra: se digita de la fuente del servicio.';
  const sinReporte = fuente && fuente.estado !== 'validado' ? ' El área todavía no entrega el reporte de este mes.' : '';
  return `${referencias.map((r) => `${r.etiqueta}: ${numero(r.valor, r.decimales ?? 0)}`).join(' · ')}.${sinReporte} Son referencias: la cifra la decide Planeamiento.`;
}

/* ------------------------------------------------------------ el detalle */

function DetalleActividad({ actividad, reportes, actividades, meses, mesInicial, editable, actor, onClose, onGuardado }) {
  const [mes, setMes] = useState(mesInicial);
  const actual = ejecucion(actividad, reportes, actividades, mes);
  const [cifra, setCifra] = useState(actual.registro?.valor ?? null);
  const [nota, setNota] = useState(actual.registro?.nota ?? '');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cambiarMes = (m) => {
    const otro = ejecucion(actividad, reportes, actividades, m);
    setMes(m);
    setCifra(otro.registro?.valor ?? null);
    setNota(otro.registro?.nota ?? '');
    setError(null);
  };

  const conNota = exigeNota(actividad);
  const guardar = async (valor) => {
    if (valor != null && conNota && !nota.trim()) {
      setError('Escriba por qué ajusta la cifra calculada: es lo que se responde si CEPLAN o el área la cuestionan.');
      return;
    }
    setGuardando(true);
    const r = await guardarEjecucion(ANIO_ACTIVIDADES, actividad.codigo, mes, { valor, nota: nota.trim(), actor });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onGuardado(valor == null ? `${etiquetaPeriodo(periodoDe(mes))}: la actividad ${codigoCorto(actividad.codigo)} vuelve a su cálculo.` : `${etiquetaPeriodo(periodoDe(mes))}: cifra guardada en la actividad ${codigoCorto(actividad.codigo)}.`);
  };

  const filas = meses.map((m) => ({ mes: m, ...ejecucion(actividad, reportes, actividades, m) }));
  const columnas = [
    { key: 'mes', label: 'Mes', render: (f) => etiquetaPeriodo(periodoDe(f.mes)) },
    { key: 'valor', label: 'Ejecución', align: 'right', tooltip: 'La cifra que vale para el mes: la calculada o, si la hay, la que escribió Planeamiento.', render: (f) => <strong>{numero(f.valor)}</strong> },
    { key: 'como', label: 'Cómo', render: (f) => <Como como={f.como} /> },
    {
      key: 'calculado',
      label: 'Cálculo',
      align: 'right',
      tooltip: 'Lo que da la regla de la actividad, aunque un ajuste mande sobre ello.',
      render: (f) => (actividad.calculo.tipo === 'digitar' ? <span style={PEQUENO}>—</span> : numero(f.calculado)),
    },
    { key: 'nota', label: 'Nota', render: (f) => (f.nota ? <span style={PEQUENO}>{f.nota}</span> : <span style={PEQUENO}>—</span>) },
  ];

  const referencias = referenciasDe(actividad, actual.fuente, periodoDe(mes));
  const calculo = CALCULO[actividad.calculo.tipo];
  const nivel = NIVEL[actividad.nivel];

  return (
    <Dialog
      title={`${codigoCorto(actividad.codigo)} · ${actividad.nombre}`}
      subtitle={`${nombreArea(actividad.area)} · ${actividad.actividadPresupuestal}`}
      onClose={onClose}
      maxWidth={880}
      footer={
        <Button tone="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
          <Badge label={calculo.label} tone={calculo.tono === 'neutral' ? 'none' : calculo.tono} />
          <Tooltip title={`Relación con el oficio: ${nivel.label}`} body={nivel.ayuda}>
            <Badge label={nivel.label} tone={nivel.tono} />
          </Tooltip>
          <span style={PEQUENO}>
            Meta física {ANIO_ACTIVIDADES}: <strong>{numero(actividad.meta)}</strong> · Mide: {actividad.mide}
          </span>
        </div>

        <p style={{ margin: 0, fontSize: 'var(--text-base)' }}>
          {actividad.calculo.tipo === 'digitar' ? 'Ningún reporte trae esta cifra tal cual: la digita Planeamiento de la fuente del servicio.' : actividad.calculo.detalle}
        </p>

        {actividad.observacion && (
          <Alert tone="warning" title="Lo que encontró la revisión del cuadro de 2026">
            {actividad.observacion} En CEPLAN figuraba {numero(actividad.ceplan.ejecutado)} acumulado: {actividad.ceplan.como}
          </Alert>
        )}

        <PaginatedTable columns={columnas} rows={filas} rowKey={(f) => f.mes} empty="Todavía no hay meses que registrar este año." legend={actividad.calculo.tipo === 'oficio' || actividad.calculo.tipo === 'informe' ? <span>«Sin reporte» no es cero: el área no entregó ese mes.</span> : undefined} />

        {editable && (
          <Card accent="var(--primary)" icon="sh-pencil" title={conNota ? 'Ajustar la cifra de un mes' : 'Digitar la cifra de un mes'} subtitle={conNota ? 'El ajuste manda sobre el cálculo y pide una nota' : 'Planeamiento es la fuente de esta cifra'}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-end', marginTop: 'var(--space-4)' }}>
              <div style={{ minWidth: 200 }}>
                <Input label="Mes" kind="select" value={mes} onChange={(e) => cambiarMes(e.target.value)} options={[...meses].reverse().map((m) => ({ value: m, label: etiquetaPeriodo(periodoDe(m)) }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={PEQUENO}>Cifra del mes</span>
                <NumberCell value={cifra} onChange={setCifra} width={140} aria-label={`Cifra de ${etiquetaPeriodo(periodoDe(mes))}`} />
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Input
                  label={conNota ? 'Por qué se ajusta' : 'Nota (opcional)'}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  required={conNota}
                  error={error ?? undefined}
                  info={conNota ? `El cálculo da ${numero(actual.calculado)}. La nota queda junto a la cifra.` : 'De dónde salió la cifra, si sirve a quien la revise después.'}
                />
              </div>
            </div>
            {!conNota && <p style={{ ...PEQUENO, margin: 'var(--space-3) 0 0' }}>{textoReferencias(referencias, actual.fuente)}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <Button tone="cta" icon="sh-ok" loading={guardando} disabled={cifra == null} onClick={() => guardar(cifra)}>
                Guardar la cifra
              </Button>
              {actual.registro && (
                <Tooltip title={conNota ? 'Volver al cálculo' : 'Borrar la cifra'} body={conNota ? 'Quita el ajuste: el mes vuelve a la cifra que sale del reporte del área.' : 'Quita la cifra digitada: el mes vuelve a quedar por digitar.'}>
                  <Button tone="ghost" icon={conNota ? 'sh-swap' : 'sh-trash'} disabled={guardando} onClick={() => guardar(null)}>
                    {conNota ? 'Volver al cálculo' : 'Borrar la cifra'}
                  </Button>
                </Tooltip>
              )}
            </div>
            {actual.registro?.fecha && (
              <p style={{ ...PEQUENO, margin: 'var(--space-3) 0 0' }}>
                Escrito el {fechaHora(actual.registro.fecha)}
                {actual.registro.actor ? ` por ${actual.registro.actor}` : ''}.
              </p>
            )}
          </Card>
        )}
      </div>
    </Dialog>
  );
}

/* --------------------------------------------------------------- el panel */

export default function ActividadesOperativas({ reportes, actividades, usuario }) {
  const vigente = periodoVigente(useHoy());
  const meses = useMemo(() => mesesHasta(vigente), [vigente]);
  const [mes, setMes] = useState(() => meses.at(-1) ?? '01');
  const [filtroArea, setFiltroArea] = useState('todas');
  const [abierta, setAbierta] = useState(null);
  const [toast, setToast] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const editable = !usuario.soloLectura;

  useEffect(() => {
    cargarActividades(ANIO_ACTIVIDADES).then((r) => setErrorCarga(r.ok ? null : r.error));
  }, []);

  const mesesHastaElElegido = meses.filter((m) => m <= mes);
  const filas = useMemo(
    () =>
      ACTIVIDADES.map((a) => {
        const delMes = ejecucion(a, reportes, actividades, mes);
        const acum = acumulado(mesesHastaElElegido.map((m) => ejecucion(a, reportes, actividades, m).valor));
        return { actividad: a, ...delMes, acumulado: acum, avance: porcentaje(acum, a.meta), esperado: metaAlMes(a.meta, Number(mes)) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportes, actividades, mes],
  );

  const guardarDigitada = async (a, valor) => {
    const r = await guardarEjecucion(ANIO_ACTIVIDADES, a.codigo, mes, { valor, actor: usuario.nombre });
    setToast(r.ok ? `${codigoCorto(a.codigo)} · ${etiquetaPeriodo(periodoDe(mes))}: ${valor == null ? 'cifra borrada' : 'cifra guardada'}.` : r.error);
  };

  const conCifra = filas.filter((f) => f.valor != null).length;
  const porDigitar = filas.filter((f) => f.como === 'pendiente').length;
  const sinReporte = filas.filter((f) => f.como === 'sin-reporte' || f.como === 'sin-dato').length;
  const ajustadas = filas.filter((f) => f.como === 'ajustado').length;

  const exportar = () =>
    descargarCsv(`HRL_actividades_operativas_${periodoDe(mes)}.csv`, [
      ['Código', 'Actividad operativa', 'Área', `Meta física ${ANIO_ACTIVIDADES}`, `Ejecución ${etiquetaPeriodo(periodoDe(mes))}`, 'Cómo se obtuvo', 'Acumulado al mes', 'Avance (%)', 'Nota'],
      ...filas.map((f) => [
        f.actividad.codigo,
        f.actividad.nombre,
        nombreArea(f.actividad.area),
        f.actividad.meta,
        f.valor,
        COMO[f.como].label,
        f.acumulado,
        f.avance.valor == null ? null : Math.round(f.avance.valor * 10) / 10,
        f.nota || null,
      ]),
    ]);

  const columnas = [
    {
      key: 'actividad',
      label: 'Actividad operativa',
      tooltip: 'Código de la actividad en CEPLAN y su nombre. Abre el detalle: de dónde sale la cifra, los meses del año y el ajuste.',
      render: (f) => (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <Button tone="link" onClick={() => setAbierta(f.actividad.codigo)}>
            {codigoCorto(f.actividad.codigo)} · {f.actividad.nombre}
          </Button>
          <span style={PEQUENO}>Mide: {f.actividad.mide}</span>
        </span>
      ),
    },
    {
      key: 'origen',
      label: 'De dónde sale',
      width: 190,
      tooltip: 'Del reporte del área, del calendario, o la digita Planeamiento. «Por verificar»: la relación con el oficio está por confirmar.',
      render: (f) => {
        const c = CALCULO[f.actividad.calculo.tipo];
        const n = NIVEL[f.actividad.nivel];
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
              <Icon name={c.icono} size={14} />
              {c.label}
            </span>
            {f.actividad.nivel === 'verificar' && (
              <Tooltip title={n.label} body={n.ayuda} focusable={false}>
                <Badge label={n.label} tone={n.tono} />
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      key: 'mes',
      label: etiquetaPeriodo(periodoDe(mes)),
      width: 190,
      align: 'right',
      tooltip: 'La ejecución física del mes elegido. Las que se digitan se escriben aquí; un ajuste a una cifra calculada, en el detalle.',
      render: (f) => {
        if (f.actividad.calculo.tipo === 'digitar' && editable) {
          const refs = referenciasDe(f.actividad, f.fuente, periodoDe(mes));
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Tooltip title="Referencias" body={textoReferencias(refs, f.fuente)}>
                <Icon name="sh-info" size={15} />
              </Tooltip>
              <NumberCell value={f.valor} onChange={(v) => guardarDigitada(f.actividad, v)} width={112} aria-label={`Ejecución de ${codigoCorto(f.actividad.codigo)} en ${etiquetaPeriodo(periodoDe(mes))}`} />
            </span>
          );
        }
        return (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <strong>{numero(f.valor)}</strong>
            <Como como={f.como} />
          </span>
        );
      },
    },
    {
      key: 'acumulado',
      label: 'Acumulado',
      width: 120,
      align: 'right',
      tooltip: `Suma de enero a ${etiquetaPeriodo(periodoDe(mes)).toLowerCase()}. Un mes sin cifra no suma, y no se cuenta como cero.`,
      render: (f) => numero(f.acumulado),
    },
    {
      key: 'avance',
      label: 'Avance',
      width: 130,
      align: 'right',
      tooltip: 'Acumulado sobre la meta física anual.',
      render: (f) => (
        <Tooltip title={`Meta ${ANIO_ACTIVIDADES}: ${numero(f.actividad.meta)}`} body={`${f.avance.explicacion} Con la meta pareja, a ${etiquetaPeriodo(periodoDe(mes)).toLowerCase()} irían ${numero(f.esperado)}: es una referencia, no una cifra que se registre.`} focusable={false}>
          <span style={{ cursor: 'help' }}>{f.avance.texto}</span>
        </Tooltip>
      ),
    },
    {
      key: 'acciones',
      label: '',
      width: 64,
      align: 'right',
      render: (f) => (
        <div className="hrl-acciones-icono">
          <Tooltip title="Abrir la actividad" body="De dónde sale la cifra, los meses del año y, si hace falta, el ajuste con su nota." focusable={false}>
            <IconButton icon="sh-eye" tone="action" aria-label={`Abrir la actividad ${codigoCorto(f.actividad.codigo)}`} onClick={() => setAbierta(f.actividad.codigo)} />
          </Tooltip>
        </div>
      ),
    },
  ];

  const areas = filtroArea === 'todas' ? AREAS_CON_ACTIVIDADES : [filtroArea];
  const actividadAbierta = abierta ? ACTIVIDADES.find((a) => a.codigo === abierta) : null;

  return (
    <Mosaic className="hrl-panel">
      {errorCarga && (
        <Alert tone="error" title="No se pudo leer lo que Planeamiento ya escribió">
          {errorCarga} Las cifras calculadas sí están a la vista; lo digitado y los ajustes no, hasta volver a cargar la página.
        </Alert>
      )}

      <Card accent="var(--primary)" icon="sh-calendar" title={`Ejecución física de ${etiquetaPeriodo(periodoDe(mes))}`} subtitle={`${ACTIVIDADES.length} actividades operativas de las nueve áreas`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div style={{ minWidth: 220 }}>
              <Input
                label="Mes"
                kind="select"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                options={[...meses].reverse().map((m) => ({ value: m, label: `${etiquetaPeriodo(periodoDe(m))}${periodoDe(m) === vigente ? ' · en curso' : ''}` }))}
                info="Mes cuya ejecución se registra. Las áreas entregan su reporte hasta inicios del mes siguiente: hasta entonces, su cifra queda «sin reporte»."
              />
            </div>
            <div style={{ minWidth: 240 }}>
              <Input
                label="Área"
                kind="select"
                value={filtroArea}
                onChange={(e) => setFiltroArea(e.target.value)}
                options={[{ value: 'todas', label: 'Las nueve áreas' }, ...AREAS_CON_ACTIVIDADES.map((c) => ({ value: c, label: nombreArea(c) }))]}
              />
            </div>
          </div>
          <Tooltip title="Descargar el mes" body="Un CSV con la ejecución del mes de cada actividad, su acumulado y su avance, para registrarla en CEPLAN. Una cifra que falta va en blanco, no en cero.">
            <Button tone="ghost" icon="sh-export" onClick={exportar}>
              Descargar CSV del mes
            </Button>
          </Tooltip>
        </div>
      </Card>

      <div className="hrl-kpis">
        <StatCard label="Con cifra" value={`${conCifra} de ${filas.length}`} percent={(conCifra / filas.length) * 100} severity={conCifra === filas.length ? 'normal' : 'suspect'} info="Actividades que ya tienen ejecución en el mes: calculada, digitada o ajustada." />
        <StatCard label="Por digitar" value={String(porDigitar)} severity={porDigitar ? 'suspect' : 'normal'} delay={60} info="Actividades que ningún reporte trae y que Planeamiento todavía no escribió este mes." />
        <StatCard label="Sin reporte" value={String(sinReporte)} severity={sinReporte ? 'suspect' : 'normal'} delay={120} info="Actividades que salen de un reporte que el área aún no entrega este mes, o que no trae la cifra. Quedan vacías, no en cero." />
        <StatCard label="Ajustadas" value={String(ajustadas)} severity="neutral" delay={180} info="Cifras calculadas que Planeamiento reemplazó, cada una con su nota." />
      </div>

      {areas.map((clave) => {
        const de = filas.filter((f) => f.actividad.area === clave);
        const fuente = fuenteDeArea(reportes, clave, periodoDe(mes));
        const dependeDeReporte = actividadesDe(clave).some((a) => a.calculo.tipo === 'oficio' || a.calculo.tipo === 'informe');
        return (
          <Card
            key={clave}
            accent="var(--primary)"
            icon={area(clave)?.icono ?? 'sh-chart'}
            title={nombreArea(clave)}
            subtitle={de.length === 1 ? '1 actividad operativa' : `${de.length} actividades operativas`}
            meta={
              dependeDeReporte ? (
                <Badge label={fuente.estado === 'validado' ? 'Reporte entregado' : 'Sin reporte del mes'} tone={fuente.estado === 'validado' ? 'ok' : 'warn'} />
              ) : (
                <Badge label="No depende de un reporte" tone="info" />
              )
            }
            wide
          >
            <PaginatedTable columns={columnas} rows={de} rowKey={(f) => f.actividad.codigo} empty="Esta área no tiene actividades operativas en el catálogo." />
          </Card>
        );
      })}

      {actividadAbierta && (
        <DetalleActividad
          key={actividadAbierta.codigo}
          actividad={actividadAbierta}
          reportes={reportes}
          actividades={actividades}
          meses={meses}
          mesInicial={mes}
          editable={editable}
          actor={usuario.nombre}
          onClose={() => setAbierta(null)}
          onGuardado={setToast}
        />
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
