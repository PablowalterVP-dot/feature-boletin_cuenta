/* Historial de reportes del área.

   Responde tres preguntas que hoy se contestan buscando en un archivador: qué
   periodos entregué, cuáles llegaron a tiempo y dónde está la constancia de
   cada uno.

   Un periodo sin reporte **aparece igualmente**, con el estado «No iniciado».
   Si solo se listaran los entregados, el mes que nadie envió desaparecería de
   la vista, que es justo lo que pasa con el papel.

   Muestra el año entero, de enero a diciembre: los meses que todavía no
   terminan van vacíos, rotulados «Aún no corresponde», y no cuentan en las
   cifras de arriba (un mes que no se puede reportar no es una deuda). Son
   siempre doce filas, así que la tabla no se pagina: partirla dejaría
   noviembre y diciembre en otra página. */

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, DetailDialog, Field, Icon, IconButton, Mosaic, StatCard, Timeline, Tooltip } from '@hrl/core-ui';
import { area, destinosDe } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { plazoRealDe, reporteDe, useEstado } from '@/app/datos/store.js';
import { cifraPrincipal, resumenDelReporte, tieneFormatosLevantados, etiquetaCifraPrincipal } from '@/app/datos/formatos/resumen.js';
import { formularioDe } from '@/app/datos/formatos/levantados.js';
import { estado, estaEntregado, etiquetaDeEstado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, plazoEfectivo, estaVencido, mesesDelAnioHasta, periodoVigente } from '@/app/dominio/periodos.js';
import { numero, fechaCorta, fechaHora, SIN_DATOS } from '@/app/dominio/formato.js';

/* Puntualidad de una entrega, comparada con el plazo del periodo. Un mes que
   todavía no termina no tiene puntualidad: no corresponde reportarlo. */
function puntualidad(reporte, periodo, vigente, hoy, limiteReal) {
  if (periodo > vigente && !reporte?.enviadoEn) return { clave: 'por-venir', label: 'Aún no corresponde', tone: 'none' };
  if (!reporte?.enviadoEn) {
    return estaVencido(periodo, hoy, limiteReal)
      ? { clave: 'sin-entregar', label: 'Sin entregar', tone: 'crit' }
      : { clave: 'en-plazo', label: 'En plazo', tone: 'none' };
  }
  const dia = reporte.enviadoEn.slice(0, 10);
  return dia <= plazoEfectivo(periodo, limiteReal)
    ? { clave: 'a-tiempo', label: 'A tiempo', tone: 'ok' }
    : { clave: 'tarde', label: 'Fuera de plazo', tone: 'warn' };
}

function Cifra({ cifra }) {
  if (!cifra || cifra.valor == null) {
    return <span style={{ color: 'var(--subtle-foreground)' }}>{SIN_DATOS}</span>;
  }
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {numero(cifra.valor, cifra.decimales ?? 0)} <span style={{ color: 'var(--muted-foreground)' }}>{cifra.unidad}</span>
    </span>
  );
}

function DialogoPeriodo({ fila, claveArea, onCerrar, onVerFormatos }) {
  const { reporte, periodo } = fila;
  const estadoObj = estado(reporte?.estado);
  const resumen = resumenDelReporte(claveArea, reporte, periodo);
  const destinos = destinosDe(claveArea);

  return (
    <DetailDialog
      icon={area(claveArea).icono}
      tone="var(--primary)"
      toneText="var(--primary-text)"
      badge={{ label: estadoObj.label, tone: estadoObj.tono }}
      title={etiquetaPeriodo(periodo)}
      subtitle={`${area(claveArea).nombre} · ${estadoObj.descripcion}`}
      fields={
        <>
          <Field k="Folio" v={reporte?.folio} mono />
          <Field k="Constancia" v={reporte?.constancia} mono />
          <Field k="Entregado el" v={reporte?.enviadoEn ? fechaHora(reporte.enviadoEn) : null} />
          <Field k="Plazo del periodo" v={fechaCorta(fila.plazo)} />
          <Field k="Puntualidad" v={fila.puntualidad.label} />
          <Field k="Acta de remisión" v={reporte?.remision?.acta} mono />
          {resumen?.map((c) => (
            <Field
              key={c.clave}
              k={c.etiqueta}
              v={c.valor == null ? null : `${numero(c.valor, c.decimales ?? 0)} ${c.unidad}`}
            />
          ))}
        </>
      }
      block={{
        title: 'A dónde llegó',
        text: reporte?.remision
          ? `Llegó el ${fechaCorta(reporte.remision.fecha)} a Estadística${reporte.remision.destinos.length ? ` y a ${reporte.remision.destinos.map(nombreOficina).join(', ')}` : '; ninguna otra oficina lo recibe'}, validado por el bot.`
          : `Este reporte todavía no se ha enviado. Al enviarlo llegará a la vez a ${destinos.map(nombreOficina).join(', ')}.`,
      }}
      aside={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Timeline
            title="Recorrido del reporte"
            empty="Este periodo no se llegó a abrir."
            items={(reporte?.historial ?? []).map((h, i) => ({
              key: `${h.accion}-${i}`,
              date: fechaCorta(h.fecha),
              title: etiquetaDeEstado(h.estado),
              detail: h.actor,
              mark: h.fecha.slice(11, 16),
            }))}
          />

          {tieneFormatosLevantados(claveArea) && reporte && (
            <Button icon="sh-table" tone="blue" onClick={() => onVerFormatos(periodo)}>
              {formularioDe(claveArea)?.carga && !estaEntregado(reporte.estado) ? 'Abrir el reporte de este mes' : `Ver los ${formularioDe(claveArea)?.formatos.length ?? ''} formatos`}
            </Button>
          )}
          {/* Un mes pasado sin reporte también se abre: ahí se sube su Excel. */}
          {formularioDe(claveArea)?.carga && !reporte && !fila.porVenir && (
            <Button icon="sh-upload" tone="blue" onClick={() => onVerFormatos(periodo)}>
              Abrir el reporte y subir su Excel
            </Button>
          )}
          {/* Un mes que nadie abrió se carga desde aquí, aunque su plazo haya
              vencido: la fecha real de entrega queda en la constancia. */}
          {tieneFormatosLevantados(claveArea) && !reporte && (
            <Button icon="sh-upload" onClick={() => onVerFormatos(periodo)} style={{ minHeight: 'var(--touch-target-lg)' }}>
              Cargar el reporte de este mes
            </Button>
          )}
        </div>
      }
      onClose={onCerrar}
    />
  );
}

export default function Historial({ reportes, usuario, irA }) {
  const claveArea = usuario.area;
  const { hoy, plazosReales } = useEstado();
  const vigente = periodoVigente(hoy);
  const anio = vigente.slice(0, 4);
  const [sort, setSort] = useState({ key: 'periodo', dir: 'asc' });
  const [detalle, setDetalle] = useState(null);

  const filas = useMemo(
    () =>
      mesesDelAnioHasta(`${anio}-12`).map((periodo) => {
        const reporte = reporteDe(reportes, claveArea, periodo);
        return {
          clave: periodo,
          periodo,
          reporte,
          porVenir: periodo > vigente,
          estado: reporte?.estado ?? 'no_iniciado',
          entregado: reporte?.enviadoEn ?? null,
          plazo: plazoEfectivo(periodo, plazoRealDe(plazosReales, claveArea, periodo)),
          puntualidad: puntualidad(reporte, periodo, vigente, hoy, plazoRealDe(plazosReales, claveArea, periodo)),
          cifra: cifraPrincipal(claveArea, reporte, periodo),
        };
      }),
    [reportes, claveArea, anio, vigente, hoy, plazosReales],
  );

  /* Lo que se cuenta: los meses que ya se pueden reportar, de enero al vigente. */
  const exigibles = filas.filter((f) => !f.porVenir);
  const entregados = filas.filter((f) => estaEntregado(f.estado));
  const aTiempo = filas.filter((f) => f.puntualidad.clave === 'a-tiempo');
  const tarde = filas.filter((f) => f.puntualidad.clave === 'tarde');
  const sinEntregar = filas.filter((f) => f.puntualidad.clave === 'sin-entregar');

  /* La columna de cifra cambia de nombre con el área: kilos en Lavandería,
     exámenes en Imágenes. Sin oficio levantado no hay cifra que mostrar. */
  const rotuloCifra = etiquetaCifraPrincipal(claveArea) ?? {
    etiqueta: 'Cifra del mes',
    ayuda: 'Las áreas cuyo oficio aún no se ha levantado no tienen cifras.',
  };

  const verFormatos = (periodo) => {
    setDetalle(null);
    irA('reporte', { periodo });
  };

  const columnas = [
    {
      key: 'periodo',
      label: 'Periodo',
      width: 160,
      sortable: true,
      tooltip: 'Mes al que corresponde el reporte. Se entrega al mes siguiente.',
      render: (f) => (
        <Button tone="link" onClick={() => setDetalle(f)}>
          {etiquetaPeriodo(f.periodo)}
        </Button>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      width: 150,
      sortable: true,
      tooltip: 'En qué punto del recorrido está el reporte de ese periodo.',
      render: (f) => {
        if (f.porVenir && !f.reporte) return <span style={{ color: 'var(--subtle-foreground)' }}>—</span>;
        const e = estado(f.estado);
        return <Badge label={e.label} tone={e.tono} />;
      },
    },
    {
      key: 'entregado',
      label: 'Entregado el',
      width: 160,
      sortable: true,
      tooltip: 'Fecha y hora en que el reporte llegó a Estadística.',
      render: (f) =>
        f.entregado ? (
          <Tooltip title="Entrega" body={fechaHora(f.entregado)} focusable={false}>
            <span style={{ cursor: 'help' }}>{fechaCorta(f.entregado)}</span>
          </Tooltip>
        ) : (
          <span style={{ color: 'var(--subtle-foreground)' }}>—</span>
        ),
    },
    {
      key: 'puntualidad',
      label: 'Puntualidad',
      width: 160,
      tooltip: `El plazo vence el día 10 del mes siguiente. «A tiempo» significa que la entrega ocurrió en esa fecha o antes.`,
      render: (f) => <Badge label={f.puntualidad.label} tone={f.puntualidad.tone} />,
    },
    {
      key: 'cifra',
      label: rotuloCifra.etiqueta,
      width: 150,
      align: 'right',
      tooltip: rotuloCifra.ayuda,
      render: (f) => <Cifra cifra={f.cifra} />,
    },
    {
      key: 'constancia',
      label: 'Constancia',
      width: 170,
      tooltip: 'Comprobante de entrega. Sustituye al sello del oficio de papel.',
      render: (f) =>
        f.reporte?.constancia ? (
          <span className="hrl-mono">{f.reporte.constancia}</span>
        ) : (
          <span style={{ color: 'var(--subtle-foreground)' }}>—</span>
        ),
    },
    {
      key: 'acciones',
      label: '',
      width: 64,
      align: 'right',
      render: (f) => (
        <div className="hrl-acciones-icono">
          <Tooltip
            title="Ver el periodo"
            body="Abre el detalle con la constancia, el recorrido del reporte y sus cifras."
            focusable={false}
          >
            <IconButton
              icon="sh-eye"
              tone="action"
              aria-label={`Ver el reporte de ${etiquetaPeriodo(f.periodo)}`}
              onClick={() => setDetalle(f)}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <div className="hrl-kpis">
        <StatCard
          label={`Entregados · ${anio}`}
          value={`${entregados.length} de ${exigibles.length}`}
          severity={entregados.length >= exigibles.length ? 'normal' : 'suspect'}
          info={`Meses de ${anio} que ya salieron del área, de los que ya se pueden reportar (de enero al mes vigente). Los meses que todavía no terminan no cuentan.`}
        />
        <StatCard
          label="A tiempo"
          value={String(aTiempo.length)}
          severity="normal"
          note="Entregados dentro del plazo"
          info="Entregas ocurridas el día 10 del mes siguiente o antes."
        />
        <StatCard
          label="Fuera de plazo"
          value={String(tarde.length)}
          severity={tarde.length ? 'suspect' : 'normal'}
          note="Entregados con retraso"
          info="Llegaron, pero después del día 10 del mes siguiente."
        />
        <StatCard
          label="Sin entregar"
          value={String(sinEntregar.length)}
          severity={sinEntregar.length ? 'abnormal' : 'normal'}
          note="Periodos vencidos sin reporte"
          info="Periodos cuyo plazo ya venció y de los que nunca salió un reporte. En papel, estos meses desaparecen del archivador."
        />
      </div>

      {sinEntregar.length > 0 && (
        <Alert tone="warning" title={`${sinEntregar.length} periodo(s) vencido(s) sin reporte`}>
          {sinEntregar.map((f) => etiquetaPeriodo(f.periodo)).join(', ')}. Siguen abiertos: se pueden llenar y enviar,
          y la constancia registrará la fecha real de entrega.
        </Alert>
      )}

      <Card accent="var(--primary)" icon="sh-table"
        title={`Reportes de ${anio}`}
        subtitle="De enero a diciembre: los meses sin reporte también aparecen, y los que aún no terminan van vacíos"
        total={`${exigibles.length} de 12 meses ya se pueden reportar`}
      >
        <DataTable
          columns={columnas}
          rows={filas}
          sort={sort}
          onSortChange={setSort}
          rowKey={(f) => f.clave}
          empty="Ningún periodo que mostrar."
          legend={
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="sh-stamp" size={15} />
                La constancia es el comprobante de entrega: sustituye al sello del oficio de papel.
              </span>
              <span>El periodo es el enlace que abre el detalle del reporte.</span>
            </>
          }
        />
      </Card>

      {detalle && (
        <DialogoPeriodo
          fila={detalle}
          claveArea={claveArea}
          onCerrar={() => setDetalle(null)}
          onVerFormatos={verFormatos}
        />
      )}
    </Mosaic>
  );
}
