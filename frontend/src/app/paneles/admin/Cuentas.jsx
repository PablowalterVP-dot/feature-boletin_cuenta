/* Cuentas y roles: la herramienta principal del equipo de desarrollo.

   Lista todas las cuentas con su rol y su ámbito, y permite entrar como
   cualquiera de ellas sin contraseña. Desde esa sesión, «Ver como…» de la
   barra superior cambia a otra cuenta o vuelve aquí. Las credenciales para
   entrar por la pantalla de ingreso están en CREDENCIALES.txt. */

import { useState } from 'react';
import { Badge, Button, Card, DataTable, Dialog, Mosaic, Stack, Toast } from '@hrl/core-ui';
import { USUARIOS } from '@/app/datos/usuarios.js';
import { nombreArea } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { iniciarSesion, reiniciarDatos } from '@/app/datos/store.js';
import { ROL, ROLES } from '@/app/dominio/roles.js';
import { etiquetaPeriodo, PERIODO_VIGENTE } from '@/app/dominio/periodos.js';

function ambito(u) {
  if (u.roles.includes(ROL.ADMIN)) return 'Todo el prototipo';
  if (u.roles.includes(ROL.PLANEAMIENTO)) return 'Las nueve áreas · actividades operativas';
  return [u.area && nombreArea(u.area), u.oficina && !u.area && nombreOficina(u.oficina), u.roles.includes(ROL.ESTADISTICA) && 'Todas las áreas']
    .filter(Boolean)
    .join(' · ');
}

export default function Cuentas({ sesion }) {
  const [reiniciando, setReiniciando] = useState(false);
  const [toast, setToast] = useState(null);

  const columnas = [
    { key: 'usuario', label: 'Usuario', width: 170, render: (u) => <span className="hrl-mono">{u.usuario}</span> },
    { key: 'nombre', label: 'Nombre (ficticio)', render: (u) => u.nombre },
    {
      key: 'roles',
      label: 'Rol',
      width: 230,
      render: (u) => (
        <Stack direction="row" gap={2} wrap>
          {u.roles.map((r) => (
            <Badge key={r} label={ROLES[r].label} tone={r === ROL.ADMIN ? 'warn' : r === ROL.ESTADISTICA || r === ROL.PLANEAMIENTO ? 'ok' : 'info'} />
          ))}
        </Stack>
      ),
    },
    { key: 'ambito', label: 'Ámbito', render: ambito },
    {
      key: 'accion',
      label: '',
      width: 150,
      align: 'right',
      render: (u) =>
        u.id === sesion.usuario.id ? (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>Sesión actual</span>
        ) : (
          <Button size="sm" tone="ghost" icon="sh-profile" onClick={() => iniciarSesion(u, { admin: sesion.usuario })} aria-label={`Entrar como ${u.usuario}`}>
            Entrar como
          </Button>
        ),
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-people"
        title="Cuentas del prototipo"
        subtitle={`${USUARIOS.length} cuentas. Al entrar como otra, «Ver como…» en la barra superior permite cambiar o volver aquí`}
        flush
      >
        <DataTable columns={columnas} rows={USUARIOS} rowKey={(u) => u.id} />
      </Card>

      <Card accent="var(--warning)" icon="sh-gear" title="Datos del prototipo" subtitle="Todo vive en memoria: reiniciar devuelve el estado sembrado">
        <Stack direction="row" gap={4} align="center" justify="between" wrap className="hrl-cuerpo">
          <span style={{ fontSize: 'var(--text-base)', lineHeight: 'var(--leading-normal)' }}>
            Deshace los envíos, las validaciones, las remisiones y las cargas de Excel hechas en esta sesión. El periodo vigente
            vuelve a ser {etiquetaPeriodo(PERIODO_VIGENTE)}.
          </span>
          <Button tone="danger" icon="sh-swap" onClick={() => setReiniciando(true)}>
            Reiniciar datos
          </Button>
        </Stack>
      </Card>

      {reiniciando && (
        <Dialog
          title="¿Reiniciar los datos del prototipo?"
          subtitle="Se pierde todo lo hecho en esta sesión"
          onClose={() => setReiniciando(false)}
          maxWidth={520}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setReiniciando(false)}>
                Cancelar
              </Button>
              <Button
                tone="danger"
                onClick={() => {
                  reiniciarDatos();
                  setReiniciando(false);
                  setToast('Datos reiniciados.');
                }}
              >
                Reiniciar
              </Button>
            </Stack>
          }
        >
          <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
            Los reportes, remisiones y cargas vuelven al estado con que arranca el prototipo. La sesión de administración se mantiene.
          </p>
        </Dialog>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
