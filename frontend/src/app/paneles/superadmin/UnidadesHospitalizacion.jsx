/* Unidades de hospitalización: los departamentos y las áreas a los que se atan las
   cuentas de los pisos.

   La enfermería se asigna en un área (Medicina A, UCI…) y la jefatura en un
   departamento. Aquí se habilitan los del catálogo de hospitalización
   (`hospitalizacion/datos/catalogo.js`) y se les cambia el código, el nombre o si
   están activos. No se cruza con lo que administra Estadística: estas unidades no
   reportan ni reciben, su clave lleva un prefijo propio (`hosp-dep-…`,
   `hosp-area-…`) y el servidor no deja tocar desde aquí las de Estadística
   (`servidor/api/app/servicios/unidades_hospitalizacion.py`).

   Las camas no se crean aquí: salen del plano. Un área sin plano se puede habilitar
   y su cuenta entra, pero no tiene camas que operar hasta que se dibuje el suyo. */

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, Dialog, IconButton, Input, Mosaic, Stack, Toast, Tooltip } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';
import { DEPARTAMENTOS } from '@/app/hospitalizacion/datos/catalogo.js';
import { camasPorArea, claveDeUnidad, siglaSugerida } from '@/app/hospitalizacion/datos/unidades.js';
import planoPiso2 from '@/app/hospitalizacion/datos/planos/medicina-b-piso2.json';
import { useAdmin, Cargando, ErrorDeCarga } from './comunes.jsx';

/* El plano que carga la API de hospitalización (semillas/exportar.mjs). */
const CAMAS = camasPorArea(planoPiso2);

const TIPO = { departamento: 'Departamento', area: 'Área' };

/* Una fila por departamento del catálogo y, debajo, sus áreas; al final, lo
   habilitado que ya no está en el catálogo. */
function filas(unidades) {
  const porClave = new Map(unidades.map((u) => [u.clave, u]));
  const vistas = new Set();
  const lista = [];
  for (const d of DEPARTAMENTOS) {
    const claveD = claveDeUnidad('departamento', d.id);
    vistas.add(claveD);
    const camasD = d.servicios.reduce((n, s) => n + (CAMAS.get(s.id) ?? 0), 0);
    lista.push({ clave: claveD, tipo: 'departamento', id: d.id, catalogo: d.nombre, unidad: porClave.get(claveD) ?? null, camas: camasD, areas: d.servicios.map((s) => s.id) });
    for (const s of d.servicios) {
      const claveA = claveDeUnidad('area', s.id);
      vistas.add(claveA);
      lista.push({ clave: claveA, tipo: 'area', id: s.id, catalogo: s.nombre, unidad: porClave.get(claveA) ?? null, camas: CAMAS.get(s.id) ?? 0, departamento: d.id, nombreDepartamento: d.nombre });
    }
  }
  for (const u of unidades) {
    if (!vistas.has(u.clave)) lista.push({ clave: u.clave, tipo: u.tipo, id: u.id, catalogo: null, unidad: u, camas: CAMAS.get(u.id) ?? 0 });
  }
  return lista;
}

/* Una sigla libre: la sugerida, o con un número si ya la usa otra unidad. */
function codigoLibre(nombre, usados) {
  const base = siglaSugerida(nombre) || 'HOSP';
  if (!usados.has(base)) return base;
  for (let i = 2; i < 100; i += 1) if (!usados.has(`${base}${i}`)) return `${base}${i}`;
  return '';
}

function DialogoUnidad({ fila, usados, alCerrar, alGuardar }) {
  const nueva = !fila.unidad;
  const [datos, setDatos] = useState(() =>
    nueva
      ? {
          codigo: codigoLibre(fila.catalogo, usados),
          nombre: fila.tipo === 'departamento' ? `Departamento de ${fila.catalogo}` : fila.catalogo,
          nombre_corto: fila.catalogo,
        }
      : { codigo: fila.unidad.codigo, nombre: fila.unidad.nombre, nombre_corto: fila.unidad.nombre_corto ?? '' },
  );
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k, v) => setDatos((d) => ({ ...d, [k]: v }));

  const guardar = async () => {
    setEnviando(true);
    setError(null);
    const cuerpo = { codigo: datos.codigo.trim(), nombre: datos.nombre.trim(), nombre_corto: datos.nombre_corto.trim() || null };
    const r = nueva
      ? await api.admin('POST', '/hospitalizacion/unidades', {
          ...cuerpo,
          tipo: fila.tipo,
          id: fila.id,
          ...(fila.tipo === 'area' ? { departamento: fila.departamento ?? null } : { areas: fila.areas ?? [] }),
        })
      : await api.admin('PATCH', `/hospitalizacion/unidades/${fila.clave}`, cuerpo);
    setEnviando(false);
    if (r.ok) alGuardar(nueva ? `«${r.body.nombre}» habilitada. Ya se le pueden asignar cuentas.` : 'Unidad guardada. Las cuentas ven el nombre nuevo al volver a entrar.');
    else setError(r.error);
  };

  const sinPlano = fila.tipo === 'area' && fila.camas === 0;
  return (
    <Dialog
      title={nueva ? `Habilitar ${fila.catalogo}` : `Editar ${fila.unidad.nombre}`}
      subtitle={`${TIPO[fila.tipo]} de hospitalización${fila.nombreDepartamento && fila.tipo === 'area' ? ` en ${fila.nombreDepartamento}` : ''}`}
      onClose={alCerrar}
      maxWidth={560}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button icon="sh-ok" disabled={!datos.codigo.trim() || !datos.nombre.trim()} loading={enviando} loadingText="Guardando…" onClick={guardar}>
            {nueva ? 'Habilitar' : 'Guardar'}
          </Button>
        </Stack>
      }
    >
      <Stack gap={4}>
        {nueva && (
          <p className="hrl-cuenta-panel__nota">
            {fila.tipo === 'area'
              ? 'Con el área habilitada, en «Cuentas y permisos» se le crea su cuenta de enfermería.'
              : 'Con el departamento habilitado, en «Cuentas y permisos» se le crea la cuenta de su jefatura, que mira todas sus áreas.'}
          </p>
        )}
        {nueva && sinPlano && (
          <Alert tone="warning" title="Esta área aún no tiene plano">
            Su cuenta podrá entrar, pero no tendrá camas que designar hasta que se dibuje su plano.
          </Alert>
        )}
        <Input label="Código" value={datos.codigo} onChange={(e) => cambiar('codigo', e.target.value.toUpperCase())} info="La sigla de la unidad. No puede repetir la de ninguna otra, tampoco la de un área de Estadística." required />
        <Input label="Nombre" value={datos.nombre} onChange={(e) => cambiar('nombre', e.target.value)} required />
        <Input label="Nombre corto" value={datos.nombre_corto} onChange={(e) => cambiar('nombre_corto', e.target.value)} info="El que se lee en las listas y en la tabla de cuentas. Opcional." />
        {error && <Alert tone="error" title="No se guardó">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

function DialogoActiva({ fila, alCerrar, alGuardar }) {
  const desactivar = fila.unidad.activa;
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const n = fila.unidad.cuentas;

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    const r = await api.admin('PATCH', `/hospitalizacion/unidades/${fila.clave}`, { activa: !desactivar });
    setEnviando(false);
    if (r.ok) alGuardar(desactivar ? `«${fila.unidad.nombre}» desactivada.` : `«${fila.unidad.nombre}» activada otra vez.`);
    else setError(r.error);
  };

  return (
    <Dialog
      title={`¿${desactivar ? 'Desactivar' : 'Activar'} ${fila.unidad.nombre}?`}
      subtitle={desactivar ? 'Se deshace con un clic' : 'Vuelve a ofrecerse en «Cuentas y permisos»'}
      onClose={alCerrar}
      maxWidth={520}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button tone={desactivar ? 'danger' : 'cta'} loading={enviando} onClick={confirmar}>
            {desactivar ? 'Desactivar' : 'Activar'}
          </Button>
        </Stack>
      }
    >
      <Stack gap={3}>
        <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
          {desactivar
            ? n > 0
              ? `${n === 1 ? 'La cuenta que tiene' : `Las ${n} cuentas que tienen`} un rol en esta unidad ${n === 1 ? 'deja' : 'dejan'} de entrar a hospitalización desde su siguiente ingreso. Sus roles no se borran: vuelven a valer al activarla.`
              : 'Ninguna cuenta tiene un rol en ella. Deja de ofrecerse al asignar roles.'
            : 'Las cuentas con un rol en ella vuelven a entrar a hospitalización desde su siguiente ingreso.'}
        </p>
        {error && <Alert tone="error" title="No se guardó">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

export default function UnidadesHospitalizacion() {
  const unidades = useAdmin('/hospitalizacion/unidades');
  const catalogo = useAdmin('/catalogo');
  const [editando, setEditando] = useState(null);
  const [activando, setActivando] = useState(null);
  const [toast, setToast] = useState(null);

  const lista = useMemo(() => filas(unidades.datos ?? []), [unidades.datos]);
  const usados = useMemo(() => new Set((catalogo.datos?.unidades ?? []).map((u) => u.codigo)), [catalogo.datos]);

  if ((unidades.cargando && !unidades.datos) || (catalogo.cargando && !catalogo.datos)) return <Cargando />;
  if (unidades.error || catalogo.error) return <ErrorDeCarga error={unidades.error ?? catalogo.error} recargar={() => { unidades.recargar(); catalogo.recargar(); }} />;

  const listo = (mensaje) => {
    setEditando(null);
    setActivando(null);
    setToast(mensaje);
    unidades.recargar();
    catalogo.recargar();
  };

  const habilitadas = (unidades.datos ?? []).length;
  const columnas = [
    {
      key: 'nombre',
      label: 'Unidad',
      tooltip: 'Cada departamento y, debajo, sus áreas. Un área es un censo: la enfermería se asigna en ella.',
      render: (f) => (
        <span className={f.tipo === 'departamento' ? 'hrl-unidad-hosp hrl-unidad-hosp--departamento' : 'hrl-unidad-hosp'}>
          {f.unidad?.nombre_corto || f.unidad?.nombre || f.catalogo}
        </span>
      ),
    },
    { key: 'tipo', label: 'Tipo', width: 130, render: (f) => TIPO[f.tipo] },
    { key: 'codigo', label: 'Código', width: 110, render: (f) => (f.unidad ? <span className="hrl-mono">{f.unidad.codigo}</span> : '—') },
    {
      key: 'camas',
      label: 'Camas en el plano',
      width: 160,
      align: 'right',
      tooltip: 'Las camas dibujadas en el plano, que la enfermería del área puede operar. Sin plano, la cuenta entra pero no tiene camas.',
      render: (f) => (f.camas > 0 ? f.camas : <span className="hrl-unidad-hosp__nota">Sin plano</span>),
    },
    { key: 'cuentas', label: 'Cuentas', width: 100, align: 'right', tooltip: 'Cuántas cuentas tienen un rol en esta unidad.', render: (f) => (f.unidad ? f.unidad.cuentas : '—') },
    {
      key: 'estado',
      label: 'Estado',
      width: 150,
      render: (f) => (!f.unidad ? <Badge label="Sin habilitar" tone="none" /> : f.unidad.activa ? <Badge label="Habilitada" tone="ok" /> : <Badge label="Desactivada" tone="warn" />),
    },
    {
      key: 'accion',
      label: '',
      width: 150,
      align: 'right',
      render: (f) =>
        !f.unidad ? (
          f.catalogo && (
            <Button tone="ghost" size="sm" icon="sh-plus" onClick={() => setEditando(f)}>
              Habilitar
            </Button>
          )
        ) : (
          <div className="hrl-acciones-icono">
            <Tooltip title="Editar" body="Código, nombre y nombre corto." focusable={false}>
              <IconButton icon="sh-pencil" tone="action" aria-label={`Editar ${f.unidad.nombre}`} onClick={() => setEditando(f)} />
            </Tooltip>
            <Tooltip title={f.unidad.activa ? 'Desactivar' : 'Activar'} body={f.unidad.activa ? 'Quienes tienen un rol en ella dejan de entrar a hospitalización. Pide confirmación.' : 'Vuelve a valer para las cuentas con un rol en ella.'} focusable={false}>
              <IconButton
                icon={f.unidad.activa ? 'sh-close' : 'sh-ok'}
                tone="action"
                className={f.unidad.activa ? 'hrl-accion--peligro' : undefined}
                aria-label={`${f.unidad.activa ? 'Desactivar' : 'Activar'} ${f.unidad.nombre}`}
                onClick={() => setActivando(f)}
              />
            </Tooltip>
          </div>
        ),
    },
  ];

  return (
    <Mosaic stacked className="hrl-panel">
      <Alert tone="info" title="Para crear las cuentas de los pisos">
        Habilite aquí el área (para su enfermería) o el departamento (para su jefatura); luego asígnele el rol en «Cuentas y permisos». Estas unidades no reportan a Estadística y no aparecen en «Áreas y matriz».
      </Alert>
      <Card
        accent="var(--primary)"
        title="Departamentos y áreas"
        subtitle="Los del catálogo de hospitalización. Las camas salen del plano, no de aquí"
        total={`${habilitadas} habilitadas`}
        flush
      >
        <div className="hrl-tabla-cuentas">
          <DataTable columns={columnas} rows={lista} rowKey={(f) => f.clave} rowClass={(f) => (f.tipo === 'departamento' ? 'hrl-fila-departamento' : undefined)} />
        </div>
      </Card>

      {editando && <DialogoUnidad fila={editando} usados={usados} alCerrar={() => setEditando(null)} alGuardar={listo} />}
      {activando && <DialogoActiva fila={activando} alCerrar={() => setActivando(null)} alGuardar={listo} />}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
