/* Bandeja de reportes del mes.

   Todos los reportes de un periodo llegan aquí, uno por área. Los que no
   llegaron también aparecen: una bandeja que solo lista lo recibido no avisa
   de lo que falta.

   Al abrir un reporte se ve lo que el área envió, sus validaciones y a qué
   oficinas llegó. Estadística ya no valida ni remite (12/10/2026): el bot no
   deja salir del área lo que no cuadra, y al enviar el reporte llega a la vez
   aquí y a las oficinas de la matriz. */

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Icon, IconButton, Mosaic, PageActions, PaginatedTable, StatCard, Toast, Tooltip } from '@hrl/core-ui';
import { areasDelFlujo, retirarReporte, usaSoloDatosReales } from '@/app/servicios/api.js';
import { area as areaDe } from '@/app/datos/areas.js';
import { reporteDe, simularEnvioPendientes, useHoy, plazoRealDe } from '@/app/datos/store.js';
import { revisionDe, cifraDelReporte } from '@/app/datos/formatos/revision.js';
import { estado, estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, plazoEfectivo } from '@/app/dominio/periodos.js';
import { fechaCorta, fechaHora } from '@/app/dominio/formato.js';
import { SelectorPeriodo, Valor, AvisoAreasFuera } from './comunes.jsx';
import VisorReporte from './VisorReporte.jsx';

/* `simulable`: el botón de la demostración que hace enviar a las áreas que
   faltan. Planeamiento usa esta bandeja sin él: no le toca empujar entregas. */
export default function Bandeja({ reportes, plazosReales = {}, params = {}, simulable = true, sesion = null }) {
  /* Abre en el mes en curso: sin revisión pendiente, nada de un mes anterior
     espera a Estadística. */
  const vigente = periodoVigente(useHoy());
  /* Derivado mientras nadie elija: el «hoy» del servidor llega después de abrir la
     pantalla, y fijado al montar se quedaba en el mes del `HOY` del prototipo. */
  const [elegido, setPeriodo] = useState(params.periodo ?? null);
  const periodo = elegido ?? vigente;
  const [abierto, setAbierto] = useState(params.area ?? null);
  const [sort, setSort] = useState({ key: 'llegada', dir: 'asc' });
  const [toast, setToast] = useState(null);
  const [retiro, setRetiro] = useState(null);
  const [periodoRetiro, setPeriodoRetiro] = useState(periodo);
  const [retirando, setRetirando] = useState(false);
  const [errorRetiro, setErrorRetiro] = useState(null);
  const puedeRetirar = sesion?.rolActivo === 'estadistica';
  const periodosRetirables = retiro
    ? [...new Set(reportes.filter((r) => r.area === retiro.clave && r.estado !== 'no_iniciado').map((r) => r.periodo))].sort().reverse()
    : [];

  const confirmarRetiro = async () => {
    if (!retiro || !periodosRetirables.includes(periodoRetiro)) return;
    setRetirando(true);
    setErrorRetiro(null);
    const r = await retirarReporte(retiro.clave, periodoRetiro);
    setRetirando(false);
    if (!r.ok) {
      setErrorRetiro(r.detail ?? 'No se pudo retirar el reporte. Intente nuevamente.');
      return;
    }
    setRetiro(null);
    setAbierto(null);
    setToast(`Se retiró el reporte de ${retiro.nombre} de ${etiquetaPeriodo(periodoRetiro)}. La acción quedó registrada.`);
  };

  const filas = useMemo(
    () =>
      areasDelFlujo().map((a) => {
        const reporte = reporteDe(reportes, a.clave, periodo);
        const estadoClave = reporte?.estado ?? 'no_iniciado';
        const entregado = estaEntregado(estadoClave);
        return {
          clave: a.clave,
          area: a,
          reporte,
          estado: estadoClave,
          orden: estado(estadoClave).orden,
          /* Los no recibidos van al final al ordenar por llegada. */
          llegada: reporte?.enviadoEn ?? '9999',
          revision: entregado ? revisionDe(a.clave, reporte) : null,
          cifra: entregado ? cifraDelReporte(a.clave, reporte) : null,
        };
      }),
    [reportes, periodo],
  );

  if (abierto) {
    return (
      <>
        <VisorReporte reportes={reportes} plazosReales={plazosReales} claveArea={abierto} periodo={periodo} onVolver={() => setAbierto(null)} onEliminar={puedeRetirar && reportes.some((r) => r.area === abierto && r.estado !== 'no_iniciado') ? () => { const a = areaDe(abierto); const meses = [...new Set(reportes.filter((r) => r.area === abierto && r.estado !== 'no_iniciado').map((r) => r.periodo))].sort().reverse(); setRetiro({ clave: abierto, nombre: a.nombreCorto }); setPeriodoRetiro(meses.includes(periodo) ? periodo : meses[0]); setErrorRetiro(null); } : null} />
        {retiro && (
          <Dialog
            title="Eliminar reporte del mes"
            subtitle={retiro.nombre}
            onClose={() => { if (!retirando) setRetiro(null); }}
            maxWidth={540}
            footer={(
              <>
                <Button tone="ghost" disabled={retirando} onClick={() => setRetiro(null)}>Cancelar</Button>
                <Button tone="danger" loading={retirando} loadingText="Eliminando…" disabled={!periodosRetirables.includes(periodoRetiro)} onClick={confirmarRetiro}>Sí, eliminar reporte</Button>
              </>
            )}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Alert tone="warning" title="Se retirará este reporte y se liberará el mes">
                El área podrá volver a cargarlo.
              </Alert>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                Mes del reporte
                <select value={periodoRetiro} onChange={(e) => setPeriodoRetiro(e.target.value)} style={{ minHeight: 42, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit' }}>
                  {periodosRetirables.map((p) => <option key={p} value={p}>{etiquetaPeriodo(p)}</option>)}
                </select>
              </label>
              {errorRetiro && <Alert tone="danger" title="No se pudo eliminar">{errorRetiro}</Alert>}
            </div>
          </Dialog>
        )}
        <Toast message={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  const recibidos = filas.filter((f) => estaEntregado(f.estado));
  const faltan = filas.filter((f) => !estaEntregado(f.estado));
  const tarde = recibidos.filter((f) => f.reporte.enviadoEn.slice(0, 10) > plazoEfectivo(periodo, plazoRealDe(plazosReales, f.clave, periodo)));

  const simular = () => {
    const n = simularEnvioPendientes(periodo);
    setToast(`${n} reporte(s) de ${etiquetaPeriodo(periodo)} llegaron a la bandeja.`);
  };

  const columnas = [
    {
      key: 'area',
      label: 'Área',
      sortable: true,
      tooltip: 'Área que envía el reporte. Abre lo que entregó.',
      render: (f) => (
        <Button tone="link" onClick={() => setAbierto(f.clave)}>
          {f.area.nombreCorto}
        </Button>
      ),
    },
    {
      key: 'orden',
      label: 'Estado',
      width: 140,
      sortable: true,
      numeric: true,
      tooltip: 'En qué punto del recorrido está el reporte.',
      render: (f) => <Badge label={estado(f.estado).label} tone={estado(f.estado).tono} />,
    },
    {
      key: 'llegada',
      label: 'Recibido el',
      width: 130,
      sortable: true,
      tooltip: 'Fecha en que el reporte llegó a Estadística.',
      render: (f) =>
        f.reporte?.enviadoEn ? (
          <Tooltip title="Recepción" body={fechaHora(f.reporte.enviadoEn)} focusable={false}>
            <span style={{ cursor: 'help' }}>{fechaCorta(f.reporte.enviadoEn)}</span>
          </Tooltip>
        ) : (
          <span style={{ color: 'var(--subtle-foreground)' }}>No recibido</span>
        ),
    },
    {
      key: 'puntualidad',
      label: 'Puntualidad',
      width: 140,
      tooltip: 'El plazo de cada área (puede ser distinto: el de Nutrición, por ejemplo, no es el mismo que el genérico).',
      render: (f) => {
        if (!f.reporte?.enviadoEn) return <span style={{ color: 'var(--subtle-foreground)' }}>—</span>;
        const plazo = plazoEfectivo(periodo, plazoRealDe(plazosReales, f.clave, periodo));
        return f.reporte.enviadoEn.slice(0, 10) <= plazo ? <Badge label="A tiempo" tone="ok" /> : <Badge label="Fuera de plazo" tone="warn" />;
      },
    },
    {
      key: 'cifra',
      label: 'Cifra del mes',
      width: 200,
      align: 'right',
      tooltip: 'La cifra que mejor resume el reporte de cada área.',
      render: (f) =>
        f.cifra ? (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Valor valor={f.cifra.valor} unidad={f.cifra.unidad} fuerte />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted-foreground)' }}>{f.cifra.etiqueta}</span>
          </span>
        ) : (
          <Valor valor={null} />
        ),
    },
    {
      key: 'validaciones',
      label: 'Validaciones',
      width: 150,
      tooltip: 'Comprobaciones del reporte: cuadres entre cuadros y reglas de coherencia.',
      render: (f) => {
        if (!f.revision) return <span style={{ color: 'var(--subtle-foreground)' }}>—</span>;
        if (f.revision.errores) {
          return (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--destructive-text)' }}>
              <Icon name="sh-crit" size={15} />
              {f.revision.errores} con error
            </span>
          );
        }
        if (!f.revision.total) return <span style={{ color: 'var(--muted-foreground)' }}>Sin reglas</span>;
        return (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--success-text)' }}>
            <Icon name="sh-ok" size={15} />
            {f.revision.cumplidas} de {f.revision.total}
          </span>
        );
      },
    },
    {
      key: 'acciones',
      label: '',
      width: 64,
      align: 'right',
      render: (f) => (
        <div className="hrl-acciones-icono">
          <Tooltip title="Abrir el reporte" body="Muestra lo que entregó el área, sus validaciones y a qué oficinas llegó." focusable={false}>
            <IconButton icon="sh-eye" tone="action" aria-label={`Abrir el reporte de ${f.area.nombreCorto}`} onClick={() => setAbierto(f.clave)} />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <AvisoAreasFuera />
      {/* El periodo y la simulación afectan a toda la pantalla: van en la
          cabecera, junto al título, y no en una tarjeta propia que ocupaba
          una franja entera para un solo campo. */}
      <PageActions>
        <SelectorPeriodo compacto periodo={periodo} onCambiar={setPeriodo} />
        {/* Solo en el prototipo: con el backend crearía en el navegador reportes que el servidor no tiene. */}
        {simulable && !usaSoloDatosReales() && faltan.length > 0 && (
          <Tooltip
            title="Solo para la demostración"
            body={`Hace que las ${faltan.length} áreas que faltan llenen y envíen su reporte con datos simulados, pasando por las mismas reglas que un envío real.`}
            focusable={false}
          >
            <Button tone="ghost" icon="sh-send" onClick={simular}>
              Simular envíos
            </Button>
          </Tooltip>
        )}
      </PageActions>

      <div className="hrl-kpis">
        <StatCard label="Recibidos" value={`${recibidos.length} de ${areasDelFlujo().length}`} severity={faltan.length ? 'suspect' : 'normal'} percent={(recibidos.length / areasDelFlujo().length) * 100} info="Reportes que ya salieron del área. Llegan validados por el bot y, en el mismo momento, a las oficinas de la matriz." />
        <StatCard label="Faltan" value={String(faltan.length)} severity={faltan.length ? 'suspect' : 'normal'} delay={60} info="Áreas que todavía no envían el reporte de este mes: sin abrir o en llenado." />
        <StatCard label="Fuera de plazo" value={String(tarde.length)} severity={tarde.length ? 'suspect' : 'normal'} delay={120} info="Recibidos después del plazo de su área. Cuenta solo lo que llegó; lo que falta está en «Faltan»." />
      </div>

      <Card accent="var(--primary)" icon="sh-table" title={`Bandeja de ${etiquetaPeriodo(periodo)}`} subtitle="Una fila por área, lleguen o no; lo que espera más tiempo, primero" total={areasDelFlujo().length === 1 ? "1 área" : `${areasDelFlujo().length} áreas`}>
        <PaginatedTable
          columns={columnas}
          rows={filas}
          sort={sort}
          onSortChange={setSort}
          rowKey={(f) => f.clave}
          empty="No hay áreas registradas."
          legend={<span>El área es el enlace a su reporte. Los datos de las áreas sin oficio levantado son simulados.</span>}
        />
      </Card>

      <Toast message={toast} onClose={() => setToast(null)} />
      {retiro && (
        <Dialog
          title="Eliminar reporte del mes"
          subtitle={retiro.nombre}
          onClose={() => { if (!retirando) setRetiro(null); }}
          maxWidth={540}
          footer={(
            <>
              <Button tone="ghost" disabled={retirando} onClick={() => setRetiro(null)}>Cancelar</Button>
              <Button tone="danger" loading={retirando} loadingText="Eliminando…" disabled={!periodosRetirables.includes(periodoRetiro)} onClick={confirmarRetiro}>Sí, eliminar reporte</Button>
            </>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Alert tone="warning" title="Se retirará este reporte y se liberará el mes">
              El área podrá volver a cargarlo.
            </Alert>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              Mes del reporte
              <select value={periodoRetiro} onChange={(e) => setPeriodoRetiro(e.target.value)} style={{ minHeight: 42, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit' }}>
                {periodosRetirables.map((p) => <option key={p} value={p}>{etiquetaPeriodo(p)}</option>)}
              </select>
            </label>
            {errorRetiro && <Alert tone="danger" title="No se pudo eliminar">{errorRetiro}</Alert>}
          </div>
        </Dialog>
      )}
    </Mosaic>
  );
}
