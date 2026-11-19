/* Lo que una oficina receptora recibió de las áreas.

   Dos vistas de lo mismo: «Reportes recibidos», un mes a la vez, y «Histórico»,
   todo lo recibido, con filtro por área. Las dos cuentan solo lo que llegó: un
   borrador nunca aparece aquí (CONTEXTO.md § 4).

   Un reporte que Estadística reabrió se sigue listando, marcado como
   desactualizado, pero no se abre: la base no guarda una copia de lo remitido, así
   que se verían cifras a medio corregir. La oficina vuelve a leerlo cuando el área
   lo reenvía (`servidor/api/app/servicios/acceso.py`).

   Con servidor, el detalle se pide al abrirlo y no entra al almacén: la
   sincronización de cada área reescribe sus reportes con lo que esta cuenta puede
   listar, y borraría lo recibido de un área ajena. */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CompactSelect, EmptyState, IconButton, Mosaic, PageActions, PaginatedTable, Skeleton, StatCard, Tooltip } from '@hrl/core-ui';
import { area, areasQueRemitenA } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { recepcionesDe, reporteDe, useHoy, recibidosFallaron } from '@/app/datos/store.js';
import * as api from '@/app/servicios/api.js';
import { etiquetaPeriodo, mesesDelAnioHasta, periodoVigente } from '@/app/dominio/periodos.js';
import { fechaCorta, fechaHora } from '@/app/dominio/formato.js';
import { SelectorPeriodo } from '../estadistica/comunes.jsx';
import VisorReporte from '../estadistica/VisorReporte.jsx';

const SIN_FILTRO = 'todas';

const ESTADO_RECEPCION = Object.freeze({
  vigente: { label: 'Vigente', tono: 'ok', icono: 'sh-ok', ayuda: 'Es la última versión que entregó el área, validada por el bot.' },
  desactualizada: { label: 'Desactualizada', tono: 'warn', icono: 'sh-warn', ayuda: 'Estadística reabrió este mes para corregirlo: lo que usted recibió ya no es la versión final. Se podrá abrir cuando el área lo reenvíe.' },
});

function Detalle({ abierto, reportes, oficina, onVolver }) {
  const delServidor = api.usaSoloDatosReales();
  const [lectura, setLectura] = useState({ reporte: null, error: null });

  useEffect(() => {
    if (!delServidor) return undefined;
    let sigue = true;
    api.reporteRecibido(abierto.area, abierto.periodo, abierto.formato).then((r) => {
      if (sigue) setLectura(r.ok ? { reporte: r.reporte, error: null } : { reporte: null, error: r.detail ?? 'No se pudo abrir el reporte.' });
    });
    return () => {
      sigue = false;
    };
  }, [delServidor, abierto]);

  if (lectura.error) {
    return (
      <Mosaic stacked className="hrl-panel">
        <Alert tone="error" title={`No se pudo abrir el reporte de ${area(abierto.area)?.nombreCorto ?? abierto.area}`}>
          {lectura.error}
          <div style={{ marginTop: 12 }}>
            <Button tone="ghost" icon="sh-inbox" onClick={onVolver}>
              Volver a lo recibido
            </Button>
          </div>
        </Alert>
      </Mosaic>
    );
  }
  if (delServidor && !lectura.reporte) {
    return (
      <Mosaic stacked className="hrl-panel" aria-busy="true">
        <Skeleton height={120} radius="var(--radius-card)" />
        <Skeleton height={320} radius="var(--radius-card)" />
      </Mosaic>
    );
  }
  const fuente = delServidor ? [lectura.reporte] : reportes;
  if (!reporteDe(fuente, abierto.area, abierto.periodo)) return null;
  return <VisorReporte reportes={fuente} claveArea={abierto.area} periodo={abierto.periodo} onVolver={onVolver} oficina={oficina} />;
}

/* `reportes`: null mientras llegan del servidor. `historico`: todo lo recibido, con
   filtro por área, en lugar de un mes a la vez. */
export default function ReportesRecibidos({ reportes, oficina, params = {}, historico = false }) {
  const vigente = periodoVigente(useHoy());
  /* Derivado mientras nadie elija: el «hoy» del servidor llega después de abrir la
     pantalla, y fijado al montar se quedaba en el mes del `HOY` del prototipo. */
  const [elegido, setPeriodo] = useState(params.periodo ?? null);
  const periodo = elegido ?? vigente;
  const [filtroArea, setFiltroArea] = useState(SIN_FILTRO);
  const [sort, setSort] = useState({ key: 'llegada', dir: 'desc' });
  const [abierto, setAbierto] = useState(null);
  const fallo = recibidosFallaron();
  const cargando = reportes == null && !fallo;

  const recepciones = useMemo(() => recepcionesDe(reportes ?? [], oficina), [reportes, oficina]);
  const areasDeLaOficina = useMemo(() => areasQueRemitenA(oficina), [oficina]);

  const filas = useMemo(
    () =>
      recepciones
        .filter((r) => (historico ? filtroArea === SIN_FILTRO || r.reporte.area === filtroArea : r.reporte.periodo === periodo))
        .map((r) => ({
          clave: r.reporte.id,
          area: r.reporte.area,
          formato: r.reporte.formato,
          nombre: area(r.reporte.area)?.nombreCorto ?? r.reporte.area,
          periodo: r.reporte.periodo,
          llegada: r.fecha ?? '',
          constancia: r.reporte.constancia,
          recepcion: r.estado,
        })),
    [recepciones, historico, filtroArea, periodo],
  );

  if (abierto) return <Detalle abierto={abierto} reportes={reportes} oficina={oficina} onVolver={() => setAbierto(null)} />;

  const reabiertos = filas.filter((f) => f.recepcion === 'desactualizada').length;
  const porLlegar = areasDeLaOficina.filter((a) => !filas.some((f) => f.area === a.clave));
  const abrir = (f) => setAbierto({ area: f.area, periodo: f.periodo, formato: f.formato });

  const columnas = [
    {
      key: 'nombre',
      label: 'Área',
      sortable: true,
      tooltip: 'Área que entregó el reporte. Abre lo que recibió esta oficina.',
      render: (f) =>
        f.recepcion === 'vigente' ? (
          <Button tone="link" onClick={() => abrir(f)}>
            {f.nombre}
          </Button>
        ) : (
          f.nombre
        ),
    },
    ...(historico ? [{ key: 'periodo', label: 'Mes', width: 170, sortable: true, tooltip: 'Mes al que corresponde el reporte.', render: (f) => etiquetaPeriodo(f.periodo) }] : []),
    {
      key: 'llegada',
      label: 'Recibido el',
      width: 130,
      sortable: true,
      tooltip: 'Fecha en que el área lo envió: la oficina lo recibe en ese mismo momento.',
      render: (f) =>
        f.llegada ? (
          <Tooltip title="Recepción" body={fechaHora(f.llegada)} focusable={false}>
            <span style={{ cursor: 'help' }}>{fechaCorta(f.llegada)}</span>
          </Tooltip>
        ) : (
          <span style={{ color: 'var(--subtle-foreground)' }}>—</span>
        ),
    },
    { key: 'constancia', label: 'Constancia', width: 190, tooltip: 'Constancia de la entrega: identifica la versión recibida.', render: (f) => <span className="hrl-mono">{f.constancia ?? '—'}</span> },
    {
      key: 'recepcion',
      label: 'Estado',
      width: 170,
      sortable: true,
      tooltip: 'Si lo que recibió sigue siendo la última versión.',
      render: (f) => {
        const e = ESTADO_RECEPCION[f.recepcion];
        return (
          <Tooltip title={e.label} body={e.ayuda} focusable={false}>
            <span style={{ display: 'inline-flex', cursor: 'help' }}>
              <Badge label={e.label} tone={e.tono} />
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: 'acciones',
      label: '',
      width: 64,
      align: 'right',
      /* Lo reabierto no se abre: su estado ya dice por qué. Un botón desactivado se pinta
         igual que uno activo y parecería que no responde. */
      render: (f) =>
        f.recepcion === 'vigente' ? (
          <div className="hrl-acciones-icono">
            <Tooltip title="Abrir el reporte" body="Muestra lo que entregó el área, en solo lectura." focusable={false}>
              <IconButton icon="sh-eye" tone="action" aria-label={`Abrir el reporte de ${f.nombre}, ${etiquetaPeriodo(f.periodo)}`} onClick={() => abrir(f)} />
            </Tooltip>
          </div>
        ) : null,
    },
  ];

  const opcionesArea = [{ value: SIN_FILTRO, label: 'Todas las áreas' }, ...areasDeLaOficina.map((a) => ({ value: a.clave, label: a.nombreCorto }))];
  const periodos = api.usaSoloDatosReales() ? mesesDelAnioHasta(vigente) : undefined;
  const vacio = historico
    ? { titulo: filtroArea === SIN_FILTRO ? 'Todavía no ha recibido ningún reporte' : `Todavía no ha recibido nada de ${area(filtroArea)?.nombreCorto ?? 'esta área'}`, cuerpo: 'Cada reporte aparece aquí en cuanto el área lo envía.' }
    : { titulo: `No ha recibido reportes de ${etiquetaPeriodo(periodo)}`, cuerpo: porLlegar.length ? `Le llegan en cuanto el área los envía. Falta: ${porLlegar.map((a) => a.nombreCorto).join(', ')}.` : 'Ninguna área tiene a esta oficina como destino.' };

  return (
    <Mosaic className="hrl-panel">
      <PageActions>
        {historico ? (
          <Tooltip title="Área" body="Muestra solo lo recibido de un área." focusable={false}>
            <CompactSelect aria-label="Área" options={opcionesArea} value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} width={230} />
          </Tooltip>
        ) : (
          <SelectorPeriodo compacto periodo={periodo} onCambiar={setPeriodo} periodos={periodos} />
        )}
      </PageActions>

      {fallo && (
        <Alert
          tone="error"
          title="No se pudo leer lo recibido"
          action={
            <Button tone="ghost" size="sm" icon="sh-clock" onClick={() => api.sincronizarRecibidos(oficina)}>
              Reintentar
            </Button>
          }
        >
          Revise la conexión con el servidor. Lo que recibió sigue guardado.
        </Alert>
      )}

      {!cargando && !fallo && (
        <div className="hrl-kpis">
          <StatCard label="Recibidos" value={String(filas.length)} severity="normal" info={historico ? 'Reportes recibidos con este filtro, de todos los meses.' : `Reportes de ${etiquetaPeriodo(periodo)} que ya le llegaron.`} />
          {!historico && <StatCard label="Por llegar" value={String(porLlegar.length)} severity={porLlegar.length ? 'suspect' : 'normal'} delay={60} info={porLlegar.length ? `Áreas que le envían y aún no entregan este mes: ${porLlegar.map((a) => a.nombreCorto).join(', ')}.` : 'Todas las áreas que le envían ya entregaron este mes.'} />}
          <StatCard label="Desactualizados" value={String(reabiertos)} severity={reabiertos ? 'suspect' : 'normal'} delay={120} info="Reportes que Estadística reabrió para corregirlos. Lo recibido no es la versión final hasta que el área lo reenvíe." />
        </div>
      )}

      {reabiertos > 0 && (
        <Alert tone="warning" title={reabiertos === 1 ? 'Un reporte recibido se reabrió para corregirlo' : `${reabiertos} reportes recibidos se reabrieron para corregirlos`}>
          No use esas cifras como definitivas: el área todavía no entrega la versión corregida.
        </Alert>
      )}

      <Card accent="var(--primary)" icon="sh-inbox" title={historico ? 'Todo lo recibido' : `Recibido de ${etiquetaPeriodo(periodo)}`} subtitle={`${nombreOficina(oficina)} · solo lo que las áreas ya entregaron, nunca un borrador`} flush>
        {!cargando && !fallo && filas.length === 0 ? (
          <EmptyState icon="sh-inbox" tone="var(--info)" title={vacio.titulo} body={vacio.cuerpo} />
        ) : (
          <PaginatedTable columns={columnas} rows={filas} sort={sort} onSortChange={setSort} rowKey={(f) => f.clave} loading={cargando} legend={<span>El área es el enlace a su reporte, en solo lectura.</span>} />
        )}
      </Card>
    </Mosaic>
  );
}
