/* Herramientas de soporte, siempre con justificación y con rastro.

   «Ver como»: el servidor da una sesión de solo lectura de otra cuenta, por
   una hora. Se ve lo que esa persona ve; cualquier escritura la rechaza el
   servidor (no solo se esconde el botón). Queda en la bitácora quién miró a
   quién y por qué.

   Reabrir un reporte: la misma transición «rectificar» de siempre, por la
   máquina de estados, con el motivo en el historial del reporte. Devolver a
   borrador un reporte enviado o validado no existe en el flujo: no se inventa
   una puerta lateral. */

import { useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, IconButton, Input, Mosaic, Stack, Toast } from '@hrl/core-ui';
import { iniciarSesion } from '@/app/datos/store.js';
import { nombreArea } from '@/app/datos/areas.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import * as api from '@/app/servicios/api.js';
import { useAdmin, Cargando, ErrorDeCarga, DialogoJustificado, cuando } from './comunes.jsx';

export default function Soporte({ sesion, reportes }) {
  const cuentas = useAdmin('/cuentas');
  const [buscar, setBuscar] = useState('');
  const [mirar, setMirar] = useState(null);
  const [reabrir, setReabrir] = useState(null);
  const [toast, setToast] = useState(null);

  if (cuentas.cargando && !cuentas.datos) return <Cargando />;
  if (cuentas.error) return <ErrorDeCarga error={cuentas.error} recargar={cuentas.recargar} />;

  const texto = buscar.trim().toLowerCase();
  const visibles = cuentas.datos.filter(
    (c) => c.id !== sesion.usuario.id && c.activa && c.asignaciones.length && (!texto || `${c.usuario} ${c.nombres} ${c.apellidos}`.toLowerCase().includes(texto)),
  );
  const remitidos = reportes.filter((r) => r.estado === 'remitido' && api.esAreaReal(r.area)).sort((a, b) => b.periodo.localeCompare(a.periodo));

  const columnasCuentas = [
    { key: 'usuario', label: 'Usuario', width: 170, render: (c) => <span className="hrl-mono">{c.usuario}</span> },
    { key: 'nombre', label: 'Nombre', render: (c) => `${c.nombres} ${c.apellidos}` },
    {
      key: 'roles',
      label: 'Roles',
      render: (c) => (
        <Stack direction="row" gap={2} wrap>
          {c.asignaciones.map((a) => (
            <Badge key={a.id} label={`${a.rol_nombre}${a.unidad_nombre ? ` · ${a.unidad_nombre}` : ''}`} tone="info" />
          ))}
        </Stack>
      ),
    },
    {
      key: 'accion',
      label: '',
      width: 150,
      align: 'right',
      render: (c) => (
        <Button size="sm" tone="ghost" icon="sh-eye" onClick={() => setMirar(c)} aria-label={`Ver el sistema como ${c.usuario}`}>
          Ver como
        </Button>
      ),
    },
  ];

  const columnasReportes = [
    { key: 'area', label: 'Área', render: (r) => nombreArea(r.area) },
    { key: 'periodo', label: 'Periodo', width: 170, render: (r) => etiquetaPeriodo(r.periodo) },
    { key: 'constancia', label: 'Constancia', width: 170, render: (r) => <span className="hrl-mono">{r.constancia ?? '—'}</span> },
    { key: 'remitido', label: 'Remitido', width: 190, render: (r) => cuando(r.remision?.fecha) },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (r) => <IconButton icon="sh-swap" tone="action" aria-label={`Reabrir ${nombreArea(r.area)} de ${etiquetaPeriodo(r.periodo)} para rectificar`} onClick={() => setReabrir(r)} />,
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-eye" title="Ver el sistema como otra cuenta" subtitle="Solo lectura, por una hora, y queda en la bitácora con su motivo" flush>
        <div className="hrl-cuerpo">
          <Input label="Buscar cuenta" value={buscar} onChange={(e) => setBuscar(e.target.value)} searchIcon labelHidden />
        </div>
        <DataTable columns={columnasCuentas} rows={visibles} rowKey={(c) => c.id} />
      </Card>

      <Card accent="var(--warning)" icon="sh-swap" title="Reabrir un reporte remitido" subtitle="Para corregirlo: vuelve a llenado y las oficinas quedan con una versión que cambiará" flush>
        {remitidos.length ? (
          <DataTable columns={columnasReportes} rows={remitidos} rowKey={(r) => r.id} />
        ) : (
          <div className="hrl-cuerpo">
            <Alert tone="info" title="Ningún reporte remitido todavía">Solo un reporte ya remitido a las oficinas se puede reabrir para rectificarlo.</Alert>
          </div>
        )}
        <div className="hrl-cuerpo">
          <Alert tone="info" title="Devolver a borrador un reporte enviado o validado no existe en el flujo">
            La máquina de estados no tiene esa transición: hoy un error antes de remitir se corrige con la rectificación después de remitir.
            Agregarla es una decisión del flujo que hay que acordar con Estadística, no una herramienta de soporte.
          </Alert>
        </div>
      </Card>

      {mirar && (
        <DialogoJustificado
          titulo={`Ver como ${mirar.nombres} ${mirar.apellidos}`}
          subtitulo={`Usuario ${mirar.usuario}`}
          consecuencia="Verá exactamente sus pantallas y sus datos, sin poder cambiar nada en su nombre. Vuelve a su cuenta con «Volver a mi cuenta», arriba."
          textoBoton="Ver como esta cuenta"
          icono="sh-eye"
          alConfirmar={async (justificacion) => {
            const r = await api.verComo(mirar.id, justificacion);
            if (r.ok) iniciarSesion(r.usuario, { admin: sesion.usuario });
            return r;
          }}
          alCerrar={() => setMirar(null)}
        />
      )}
      {reabrir && (
        <DialogoJustificado
          titulo={`¿Reabrir ${nombreArea(reabrir.area)} de ${etiquetaPeriodo(reabrir.periodo)}?`}
          subtitulo="Rectificación"
          consecuencia="El reporte vuelve a llenado para que el área lo corrija. Las oficinas que lo recibieron conservan su versión, marcada como desactualizada hasta la nueva remisión."
          textoBoton="Reabrir para rectificar"
          tono="danger"
          icono="sh-swap"
          alConfirmar={async (justificacion) => {
            const r = await api.transicionar(reabrir.area, reabrir.periodo, 'rectificar', { actor: sesion.usuario.nombre, rol: 'estadistica', comentario: justificacion });
            if (r.ok) {
              setReabrir(null);
              setToast('Reporte reabierto para rectificar.');
              return r;
            }
            return { ok: false, error: r.detail ?? 'No se pudo reabrir.' };
          }}
          alCerrar={() => setReabrir(null)}
        />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
