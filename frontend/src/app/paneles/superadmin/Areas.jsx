/* Áreas, formatos y matriz de destinos.

   Un área reporta por el sistema cuando tiene su formato instalado (la
   estructura con que el bot lee su Excel) con una versión activa. Instalar un
   formato es trabajo del bot y de su plantilla; aquí solo se pausa o se
   reanuda un área que ya lo tiene, con su motivo.

   La matriz tiene vigencia: agregar un destino vale desde hoy y retirarlo
   termina ayer, sin reescribir a quién se remitió antes. */

import { useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, Dialog, IconButton, Input, Mosaic, Stack, Toast, Tooltip } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';
import { useAdmin, Cargando, ErrorDeCarga, DialogoJustificado, LARGO_JUSTIFICACION, dia } from './comunes.jsx';

function NuevoDestino({ catalogo, alCerrar, alGuardar }) {
  const reportantes = catalogo.unidades.filter((u) => u.es_reportante && u.activa);
  const receptoras = catalogo.unidades.filter((u) => u.es_receptora && u.activa && !u.es_estadistica);
  const [datos, setDatos] = useState({ origen: '', destino: '', entrega_inmediata: false, justificacion: '' });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k, v) => setDatos((d) => ({ ...d, [k]: v }));
  const opciones = (l, vacio) => [{ value: '', label: vacio }, ...l.map((u) => ({ value: u.clave, label: u.nombre_corto || u.nombre }))];

  const guardar = async () => {
    setEnviando(true);
    setError(null);
    const r = await api.admin('POST', '/matriz', datos);
    setEnviando(false);
    if (r.ok) alGuardar('Destino agregado. Vale desde hoy.');
    else setError(r.error);
  };

  return (
    <Dialog title="Agregar un destino" subtitle="Desde hoy, el reporte de esa área también llegará a esa oficina" onClose={alCerrar} maxWidth={560}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button icon="sh-share" disabled={!datos.origen || !datos.destino || datos.justificacion.trim().length < LARGO_JUSTIFICACION} loading={enviando} onClick={guardar}>
            Agregar
          </Button>
        </Stack>
      }
    >
      <Stack gap={4}>
        <Input label="Área que reporta" kind="select" value={datos.origen} onChange={(e) => cambiar('origen', e.target.value)} options={opciones(reportantes, 'Elija el área')} required />
        <Input label="Oficina que lo recibe" kind="select" value={datos.destino} onChange={(e) => cambiar('destino', e.target.value)} options={opciones(receptoras, 'Elija la oficina')} info="Estadística no figura: recibe siempre todo." required />
        <Input label="Justificación" value={datos.justificacion} onChange={(e) => cambiar('justificacion', e.target.value)} hint={`Quién lo pidió y para qué. Al menos ${LARGO_JUSTIFICACION} caracteres.`} required />
        {error && <Alert tone="error" title="No se agregó">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

export default function Areas() {
  const areas = useAdmin('/areas');
  const matriz = useAdmin('/matriz');
  const catalogo = useAdmin('/catalogo');
  const [pausar, setPausar] = useState(null);
  const [retirar, setRetirar] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const [toast, setToast] = useState(null);

  const todos = [areas, matriz, catalogo];
  if (todos.some((x) => x.cargando && !x.datos)) return <Cargando />;
  const conError = todos.find((x) => x.error);
  if (conError) return <ErrorDeCarga error={conError.error} recargar={() => todos.forEach((x) => x.recargar())} />;

  const listo = (mensaje) => {
    setPausar(null);
    setRetirar(null);
    setAgregando(false);
    setToast(mensaje);
    areas.recargar();
    matriz.recargar();
    // El resto del sistema (Estadística, la cabecera) toma las áreas en flujo de aquí.
    api.cargarConfiguracion();
  };

  const columnasAreas = [
    { key: 'nombre', label: 'Área', render: (a) => a.nombre_corto || a.nombre },
    {
      key: 'formato',
      label: 'Formato',
      width: 220,
      tooltip: 'La estructura con que el bot lee su Excel. Se instala con la plantilla del área.',
      render: (a) => (a.formato ? `${a.formato} · ${a.version_activa ?? 'sin versión activa'}` : 'Sin formato instalado'),
    },
    {
      key: 'flujo',
      label: 'Por el sistema',
      width: 160,
      tooltip: 'Si el área entrega ya por el sistema.',
      render: (a) => <Badge label={a.en_flujo ? 'Sí' : a.pausada ? 'Pausada' : 'Todavía no'} tone={a.en_flujo ? 'ok' : a.pausada ? 'warn' : 'none'} />,
    },
    {
      key: 'accion',
      label: '',
      width: 140,
      align: 'right',
      render: (a) =>
        a.version_activa ? (
          <Button size="sm" tone="ghost" icon={a.en_flujo ? 'sh-close' : 'sh-ok'} onClick={() => setPausar(a)} aria-label={`${a.en_flujo ? 'Pausar' : 'Reanudar'} ${a.nombre_corto || a.nombre}`}>
            {a.en_flujo ? 'Pausar' : 'Reanudar'}
          </Button>
        ) : (
          <Tooltip title="Sin formato" body="Primero hay que instalar su plantilla en el bot: sin ella no hay cómo leer su Excel." focusable={false}>
            <span style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-sm)' }}>Falta su plantilla</span>
          </Tooltip>
        ),
    },
  ];

  const columnasMatriz = [
    { key: 'origen', label: 'Área', render: (f) => f.origen_nombre },
    { key: 'destino', label: 'Oficina', render: (f) => f.destino_nombre },
    { key: 'desde', label: 'Desde', width: 130, render: (f) => dia(f.desde) },
    { key: 'obs', label: 'Motivo', render: (f) => f.observacion ?? '—' },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (f) => <IconButton icon="sh-trash" aria-label={`Retirar ${f.destino_nombre} de los destinos de ${f.origen_nombre}`} onClick={() => setRetirar(f)} />,
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-table" title="Áreas que reportan" subtitle="Cuáles entregan ya por el sistema" total={`${areas.datos.filter((a) => a.en_flujo).length} de ${areas.datos.length}`} flush>
        <DataTable columns={columnasAreas} rows={areas.datos} rowKey={(a) => a.clave} />
      </Card>

      <Card
        accent="var(--info)"
        icon="sh-share"
        title="Matriz de destinos"
        subtitle="A qué oficinas va el reporte de cada área, además de Estadística"
        total={`${matriz.datos.vigentes.length} vigentes`}
        actions={
          <Button icon="sh-share" onClick={() => setAgregando(true)}>
            Agregar destino
          </Button>
        }
        flush
      >
        <DataTable columns={columnasMatriz} rows={matriz.datos.vigentes} rowKey={(f) => f.id} />
      </Card>

      {matriz.datos.historicas.length > 0 && (
        <Card accent="var(--muted-foreground)" icon="sh-clock" title="Destinos retirados" subtitle="Ya no se remite ahí; lo remitido antes sigue explicado" total={String(matriz.datos.historicas.length)} flush>
          <DataTable
            columns={[
              { key: 'origen', label: 'Área', render: (f) => f.origen_nombre },
              { key: 'destino', label: 'Oficina', render: (f) => f.destino_nombre },
              { key: 'vigencia', label: 'Vigente', width: 240, render: (f) => `${dia(f.desde)} – ${dia(f.hasta)}` },
              { key: 'obs', label: 'Motivo', render: (f) => f.observacion ?? '—' },
            ]}
            rows={matriz.datos.historicas}
            rowKey={(f) => f.id}
          />
        </Card>
      )}

      <Alert tone="info" title="La matriz de referencia de los demás roles">
        La pantalla «Matriz de destinos» que ven Estadística y las oficinas todavía muestra la del prototipo. La que decide a quién se
        remite de verdad es esta: el servidor la usa al entregar cada reporte que se envía.
      </Alert>

      {pausar && (
        <DialogoJustificado
          titulo={`${pausar.en_flujo ? 'Pausar' : 'Reanudar'} ${pausar.nombre_corto || pausar.nombre}`}
          subtitulo={pausar.en_flujo ? 'Deja de reportar por el sistema' : 'Vuelve a reportar por el sistema'}
          consecuencia={
            pausar.en_flujo
              ? 'Estadística deja de contarla (ni entregada ni atrasada) y el área no puede subir su Excel hasta reanudarla. Sus reportes ya enviados se conservan.'
              : 'Vuelve a contar en Cumplimiento y en la Bandeja, y puede subir su Excel.'
          }
          textoBoton={pausar.en_flujo ? 'Pausar' : 'Reanudar'}
          tono={pausar.en_flujo ? 'danger' : 'cta'}
          alConfirmar={async (justificacion) => {
            const r = await api.admin('PUT', `/areas/${pausar.clave}/flujo`, { en_flujo: !pausar.en_flujo, justificacion });
            if (r.ok) listo(pausar.en_flujo ? 'Área pausada.' : 'Área reanudada.');
            return r;
          }}
          alCerrar={() => setPausar(null)}
        />
      )}
      {retirar && (
        <DialogoJustificado
          titulo={`¿Retirar ${retirar.destino_nombre}?`}
          subtitulo={`De los destinos de ${retirar.origen_nombre}`}
          consecuencia={`Desde hoy, el reporte de ${retirar.origen_nombre} ya no se remitirá a ${retirar.destino_nombre}. Lo que ya recibió se conserva, y la fila queda en «Destinos retirados».`}
          textoBoton="Retirar"
          tono="danger"
          alConfirmar={async (justificacion) => {
            const r = await api.admin('POST', `/matriz/${retirar.id}/retirar`, { justificacion });
            if (r.ok) listo('Destino retirado.');
            return r;
          }}
          alCerrar={() => setRetirar(null)}
        />
      )}
      {agregando && <NuevoDestino catalogo={catalogo.datos} alCerrar={() => setAgregando(false)} alGuardar={listo} />}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
