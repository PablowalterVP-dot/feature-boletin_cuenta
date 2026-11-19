/* Compromisos de mejora: seis, con sus entregables y plazos. Los actualiza Estadística;
   Dirección solo los mira. Un plazo vencido sin registro se dice como vencido, aunque
   pueda estar cumplido y sin anotar: por eso el aviso de arriba lo aclara. */

import { useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, Dialog, IconButton, Input, Mosaic, Stack, StatCard, Toast, Tooltip } from '@hrl/core-ui';
import { COMPROMISOS } from '@/app/datos/compromisos.js';
import { indicadorDe, nombreDeFuente } from '@/app/datos/monitoreo.js';
import { ASIGNACION, LECTURAS } from '@/app/datos/monitoreo-lecturas.js';
import { fechaCorta } from '@/app/dominio/formato.js';
import { conclusionDeCompromiso, ESTADOS_DE_ENTREGABLE, estadoDeEntregable } from '@/app/dominio/monitoreo.js';
import { Conclusion } from '@/app/paneles/monitoreo/comunes.jsx';
import * as api from '@/app/servicios/api.js';

const OPCIONES = Object.freeze([
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'cumplido', label: 'Cumplido' },
]);

function EstadoEntregable({ estado }) {
  const e = ESTADOS_DE_ENTREGABLE[estado];
  return <Badge label={e.etiqueta} tone={e.tono} icon={e.icono} />;
}

function Actualizar({ compromiso, entregable, avance, anio, hoy, onClose, onGuardado }) {
  const [form, setForm] = useState({ estado: avance?.estado ?? 'pendiente', fecha: avance?.fecha_cumplimiento ?? '', evidencia: avance?.evidencia ?? '' });
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    if (form.estado === 'cumplido' && !form.fecha) {
      setError('Un entregable cumplido lleva la fecha en que se cumplió.');
      return;
    }
    setOcupado(true);
    const r = await api.monitoreo('PUT', `/${anio}/compromisos`, { cuerpo: { compromiso: compromiso.numero, entregable: entregable.clave, estado: form.estado, fecha_cumplimiento: form.estado === 'cumplido' ? form.fecha : null, evidencia: form.evidencia || null } });
    setOcupado(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onGuardado();
    onClose();
  };

  return (
    <Dialog
      title="Actualizar entregable"
      subtitle={`Compromiso ${compromiso.numero}: ${entregable.nombre}`}
      onClose={onClose}
      maxWidth={560}
      footer={
        <>
          <Button tone="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="sh-ok" loading={ocupado} loadingText="Guardando…" onClick={guardar}>
            Guardar
          </Button>
        </>
      }
    >
      <Stack gap={3}>
        {error && (
          <Alert tone="error" title="No se guardó">
            {error}
          </Alert>
        )}
        <Input label="Estado" kind="select" options={OPCIONES} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} />
        {form.estado === 'cumplido' && <Input label="Fecha de cumplimiento" kind="date" required value={form.fecha} max={hoy} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />}
        <Input label="Evidencia" value={form.evidencia} onChange={(e) => setForm({ ...form, evidencia: e.target.value })} info={`Qué lo sustenta: resolución, oficio o enlace. MINSA pide: ${compromiso.fuente}.`} />
      </Stack>
    </Dialog>
  );
}

/* Las firmas digitales: su fuente y su ámbito las llevan aquí, no a desempeño. El Anexo se las
   evalúa a otros, y la del hospital se mide en el compromiso 43. */
function FirmaDigital({ abrirFicha, registrados }) {
  const conCifra = ASIGNACION.compromisos.filter((ficha) => registrados.some((r) => r.indicador === ficha && r.familia === 'dl1153'));
  const columnas = [
    {
      key: 'ficha',
      label: 'Ficha',
      render: (i) => (
        <span className="hrl-monitoreo__fila">
          <Button tone="link" onClick={() => abrirFicha(i.ficha)}>
            Ficha {i.ficha}: {i.nombre}
          </Button>
          <span className="hrl-avance__nota">{LECTURAS[i.ficha].significa}</span>
        </span>
      ),
    },
    { key: 'motivo', label: 'Por qué no se evalúa al hospital', render: (i) => <span className="hrl-avance__nota">{i.motivo}</span> },
    { key: 'fuente', label: 'Fuente', width: 90, render: (i) => <span className="hrl-avance__nota">{i.fuentes.map(nombreDeFuente).join(', ')}</span> },
    {
      key: 'ver',
      label: '',
      width: 64,
      align: 'right',
      render: (i) => (
        <Tooltip title="Ver la ficha" body="Lo que dice el Anexo I de esta ficha." focusable={false}>
          <IconButton icon="sh-arrow-right" aria-label={`Ver la ficha ${i.ficha}`} onClick={() => abrirFicha(i.ficha)} />
        </Tooltip>
      ),
    },
  ];
  return (
    <Card title="Firma digital en el SIHCE: fichas 33 y 34" subtitle="Dos indicadores del Anexo I que no se le evalúan al hospital: su avance en firma digital es el compromiso 43" wide>
      <Stack gap={3} className="hrl-monitoreo__cuerpo">
        <Conclusion tono="info" titulo={conCifra.length ? 'Con cifra en el reporte DL 1153' : 'Sin cifra para el hospital'}>
          <span className="hrl-monitoreo__frase">
            {conCifra.length ? `Lo cargado trae datos de la ficha ${conCifra.join(' y ')}: se ven en su detalle.` : 'Lo cargado del reporte DL 1153 no trae datos de estas dos fichas, y no se dibuja nada: no significa cero.'} Lo que el hospital debe cumplir está en el compromiso 43, arriba.
          </span>
        </Conclusion>
        <div className="hrl-avance__tabla">
          <DataTable columns={columnas} rows={ASIGNACION.compromisos.map(indicadorDe)} rowKey={(i) => i.ficha} />
        </div>
      </Stack>
    </Card>
  );
}

export default function PanelCompromisos({ anio, hoy, panel, puede, abrirFicha }) {
  const [editando, setEditando] = useState(null);
  const [toast, setToast] = useState(null);
  const avances = panel.datos?.avances ?? [];
  const avanceDe = (c, e) => avances.find((a) => a.compromiso === c.numero && a.entregable === e.clave) ?? null;

  const todos = COMPROMISOS.flatMap((c) => c.entregables.map((e) => estadoDeEntregable(e, avanceDe(c, e), hoy)));
  const cuenta = (estado) => todos.filter((e) => e === estado).length;

  const columnasDe = (c) => [
    {
      key: 'entregable',
      label: 'Entregable',
      render: (e) =>
        puede ? (
          <Button tone="link" onClick={() => setEditando({ compromiso: c, entregable: e })}>
            {e.nombre}
          </Button>
        ) : (
          e.nombre
        ),
    },
    { key: 'plazo', label: 'Plazo', width: 120, render: (e) => (e.plazo ? fechaCorta(e.plazo) : 'En el año') },
    { key: 'estado', label: 'Estado', width: 170, render: (e) => <EstadoEntregable estado={estadoDeEntregable(e, avanceDe(c, e), hoy)} /> },
    {
      key: 'evidencia',
      label: 'Evidencia',
      width: 220,
      render: (e) => {
        const a = avanceDe(c, e);
        if (!a?.evidencia && !a?.fecha_cumplimiento) return <span className="hrl-avance__nota">Sin registrar</span>;
        return (
          <span className="hrl-avance__nota">
            {a.fecha_cumplimiento ? `${fechaCorta(a.fecha_cumplimiento)}${a.evidencia ? ': ' : ''}` : ''}
            {a.evidencia ?? ''}
          </span>
        );
      },
    },
    ...(puede
      ? [{
          key: 'accion',
          label: '',
          width: 64,
          align: 'right',
          render: (e) => (
            <Tooltip title="Actualizar" body="Cambiar su estado y anotar qué lo sustenta." focusable={false}>
              <IconButton icon="sh-pencil" aria-label={`Actualizar: ${e.nombre}`} onClick={() => setEditando({ compromiso: c, entregable: e })} />
            </Tooltip>
          ),
        }]
      : []),
  ];

  return (
    <Mosaic stacked className="hrl-panel">
      <p className="hrl-monitoreo__motivo">Un compromiso de mejora no se mide con una cifra mensual: se cumple entregando algo a tiempo. Cada uno dice qué se pide, cómo va hoy y qué sigue.</p>
      <div className="hrl-monitoreo__cifras">
        <StatCard label="Compromisos que aplican" value={COMPROMISOS.length} note="De 14 en el Anexo I" info="Los que nombran en su ámbito a los hospitales de tercer nivel." />
        <StatCard label="Entregables cumplidos" value={cuenta('cumplido')} note={`de ${todos.length}`} info="Marcados como cumplidos por Estadística, con su fecha." />
        <StatCard label="En curso" value={cuenta('en_curso')} note="Con avance registrado" info="Todavía dentro de su plazo." />
        <StatCard label="Plazo vencido" value={cuenta('vencido')} note="Sin marcar como cumplidos" severity={cuenta('vencido') > 0 ? 'suspect' : 'neutral'} info="Ya pasó su plazo y no figuran como cumplidos. Pueden estar hechos y sin anotar." />
      </div>

      {!avances.length && !panel.cargando && (
        <Alert tone="info" title="Todavía no se ha registrado ningún avance">
          Lo que aparece con «Plazo vencido» puede estar hecho y sin anotar. {puede ? 'Actualice cada entregable con lo que ya se entregó.' : 'Lo actualiza la Oficina de Estadística.'}
        </Alert>
      )}
      {panel.error && (
        <Alert tone="info" title="No se pudo traer el avance">
          {panel.error}
        </Alert>
      )}

      {COMPROMISOS.map((c) => {
        const cumplidos = c.entregables.filter((e) => estadoDeEntregable(e, avanceDe(c, e), hoy) === 'cumplido').length;
        const conclusion = conclusionDeCompromiso(c.entregables.map((e) => ({ ...e, estado: estadoDeEntregable(e, avanceDe(c, e), hoy) })), hoy);
        return (
          <Card key={c.numero} title={`Ficha ${c.numero}: ${c.nombre}`} subtitle={c.detalle} meta={<Badge label={`${cumplidos} de ${c.entregables.length} cumplidos`} tone={cumplidos === c.entregables.length ? 'ok' : 'none'} icon={cumplidos === c.entregables.length ? 'sh-ok' : 'sh-clock'} />} wide>
            <Stack gap={3} className="hrl-monitoreo__cuerpo">
              <Conclusion conclusion={conclusion} />
              <div className="hrl-avance__tabla">
                <DataTable columns={columnasDe(c)} rows={c.entregables} rowKey={(e) => e.clave} />
              </div>
              <span className="hrl-monitoreo__nota">Fuente auditable: {c.fuente}.</span>
            </Stack>
          </Card>
        );
      })}

      <FirmaDigital abrirFicha={abrirFicha} registrados={panel.datos?.resultados ?? []} />

      {editando && (
        <Actualizar
          {...editando}
          avance={avanceDe(editando.compromiso, editando.entregable)}
          anio={anio}
          hoy={hoy}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            panel.recargar();
            setToast('Entregable actualizado.');
          }}
        />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
