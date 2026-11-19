/* Bitácora de cambios: `auditoria.registro_cambio`, que escriben los
   disparadores de la base en cada INSERT, UPDATE o borrado. Nadie la edita, ni
   desde aquí: solo se lee. Las contraseñas no salen nunca (el servidor
   reemplaza su hash por «•••»). */

import { useState } from 'react';
import { Badge, Button, Card, DataTable, Dialog, EmptyState, FilterBar, IconButton, Input, Mosaic, Pagination, Stack } from '@hrl/core-ui';
import { useAdmin, Cargando, ErrorDeCarga, cuando } from './comunes.jsx';

const OPERACIONES = {
  INSERTAR: ['Creó', 'ok'],
  ACTUALIZAR: ['Cambió', 'info'],
  ELIMINAR_LOGICO: ['Retiró', 'warn'],
  RESTAURAR: ['Restauró', 'ok'],
  ELIMINAR: ['Borró', 'crit'],
  INSERTAR_MASIVO: ['Cargó', 'info'],
  ELIMINAR_MASIVO: ['Reemplazó', 'warn'],
};

const TABLAS = [
  ['seguridad.usuario', 'Cuentas'],
  ['seguridad.usuario_rol', 'Roles de una cuenta'],
  ['organizacion.parametro', 'Configuración'],
  ['organizacion.destino', 'Matriz de destinos'],
  ['reporte.reporte', 'Reportes'],
  ['reporte.reporte_historial_estado', 'Pasos del flujo'],
  ['reporte.carga', 'Cargas de Excel'],
  ['reporte.remision', 'Remisiones a oficinas'],
];

/* Lo que no dice nada a quien lee: fechas de control que cambian siempre. */
const CAMPOS_DE_CONTROL = new Set(['fecha_creacion', 'fecha_actualizacion']);

function valor(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function Detalle({ fila, alCerrar }) {
  const campos = fila.campos.length
    ? fila.campos
    : Object.keys(fila.despues ?? fila.antes ?? {}).filter((c) => !CAMPOS_DE_CONTROL.has(c));
  return (
    <Dialog title={`${OPERACIONES[fila.operacion]?.[0] ?? fila.operacion} · ${fila.tabla_nombre}`} subtitle={`${cuando(fila.fecha)} · ${fila.usuario_nombre ?? 'Sin autor registrado'}${fila.ip ? ` · ${fila.ip}` : ''}`} onClose={alCerrar} maxWidth={720}>
      <DataTable
        columns={[
          { key: 'campo', label: 'Campo', width: 200, render: (c) => <span className="hrl-mono">{c}</span> },
          { key: 'antes', label: 'Antes', render: (c) => valor(fila.antes?.[c]) },
          { key: 'despues', label: 'Después', render: (c) => valor(fila.despues?.[c]) },
        ]}
        rows={campos}
        rowKey={(c) => c}
        empty={<EmptyState icon="sh-info" title="Sin campos que mostrar" body="Es una operación masiva: el detalle está en la carga del Excel, no fila por fila." />}
      />
    </Dialog>
  );
}

export default function Bitacora() {
  const [filtros, setFiltros] = useState({ usuario_id: '', tabla: '', operacion: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [abierta, setAbierta] = useState(null);
  const params = Object.fromEntries(Object.entries({ ...filtros, pagina, por_pagina: porPagina }).filter(([, v]) => v !== '' && v != null));
  const { datos, cargando, error, recargar } = useAdmin('/bitacora', params);
  const cuentas = useAdmin('/cuentas');

  if (!datos && cargando) return <Cargando />;
  if (error) return <ErrorDeCarga error={error} recargar={recargar} />;

  const filtrar = (k, v) => {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPagina(1);
  };

  const columnas = [
    { key: 'fecha', label: 'Cuándo', width: 190, render: (f) => cuando(f.fecha) },
    {
      key: 'quien',
      label: 'Quién',
      width: 210,
      tooltip: 'La cuenta que hizo el cambio. «Sin autor» si se hizo desde la base, fuera del sistema.',
      render: (f) => f.usuario_nombre ?? <span style={{ color: 'var(--muted-foreground)' }}>Sin autor registrado</span>,
    },
    {
      key: 'que',
      label: 'Qué',
      render: (f) => (
        <Button tone="link" onClick={() => setAbierta(f)}>
          {f.tabla_nombre} #{f.registro_id}
        </Button>
      ),
    },
    {
      key: 'operacion',
      label: 'Operación',
      width: 130,
      render: (f) => <Badge label={OPERACIONES[f.operacion]?.[0] ?? f.operacion} tone={OPERACIONES[f.operacion]?.[1] ?? 'none'} />,
    },
    { key: 'campos', label: 'Campos', render: (f) => f.campos.filter((c) => !CAMPOS_DE_CONTROL.has(c)).join(', ') || '—' },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (f) => <IconButton icon="sh-eye" tone="action" aria-label={`Ver el detalle del cambio ${f.id}`} onClick={() => setAbierta(f)} />,
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <FilterBar>
        <Input
          label="Quién"
          kind="select"
          value={filtros.usuario_id}
          onChange={(e) => filtrar('usuario_id', e.target.value)}
          options={[{ value: '', label: 'Cualquiera' }, ...(cuentas.datos ?? []).map((c) => ({ value: String(c.id), label: `${c.nombres} ${c.apellidos} (${c.usuario})` }))]}
        />
        <Input label="Qué" kind="select" value={filtros.tabla} onChange={(e) => filtrar('tabla', e.target.value)} options={[{ value: '', label: 'Todo' }, ...TABLAS.map(([value, label]) => ({ value, label }))]} />
        <Input
          label="Operación"
          kind="select"
          value={filtros.operacion}
          onChange={(e) => filtrar('operacion', e.target.value)}
          options={[{ value: '', label: 'Cualquiera' }, ...Object.entries(OPERACIONES).map(([value, [label]]) => ({ value, label }))]}
        />
        <Input label="Desde" kind="date" value={filtros.desde} onChange={(e) => filtrar('desde', e.target.value)} />
        <Input label="Hasta" kind="date" value={filtros.hasta} onChange={(e) => filtrar('hasta', e.target.value)} />
      </FilterBar>

      <Card accent="var(--primary)" icon="sh-clock" title="Cambios" subtitle="El más reciente primero" total={`${datos.total.toLocaleString('es-PE')} registros`} flush>
        <DataTable
          columns={columnas}
          rows={datos.filas}
          rowKey={(f) => f.id}
          loading={cargando}
          empty={<EmptyState icon="sh-clock" title="Ningún cambio con esos filtros" body="Pruebe con otro rango de fechas, o quite el filtro de persona: un cambio hecho desde la base no tiene autor." />}
        />
        <Stack className="hrl-cuerpo">
          <Pagination page={datos.pagina} totalPages={datos.paginas} perPage={porPagina} totalItems={datos.total} onChange={setPagina} onPerPageChange={(n) => { setPorPagina(n); setPagina(1); }} />
        </Stack>
      </Card>
      {abierta && <Detalle fila={abierta} alCerrar={() => setAbierta(null)} />}
    </Mosaic>
  );
}
