/* Conmutador de sesión del equipo de desarrollo.

   Solo aparece en la cuenta de administración y en las sesiones abiertas desde
   ella («Entrar como» en Cuentas y roles). Permite pasar de un área a
   Estadística y a una oficina receptora sin cerrar sesión —es el MISMO reporte
   visto desde tres sitios— y volver a administración. Una cuenta que entra por
   la pantalla de ingreso no lo ve.

   Es una herramienta de desarrollo, no una función del sistema. Cuando exista
   autenticación real, este componente se borra y no deja rastro: nadie más
   depende de él.

   Se monta en la ranura de acciones de la barra superior con un portal. El nodo
   pertenece al AppShell y se crea en el mismo commit que este componente, así
   que no existe todavía en el primer render: de ahí el efecto. */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, DropdownMenu, Tooltip } from '@hrl/core-ui';
import { USUARIOS } from './datos/usuarios.js';
import { area } from './datos/areas.js';
import { iniciarSesion, reiniciarDatos, volverAAdmin } from './datos/store.js';
import { ROL } from './dominio/roles.js';

export default function DemoRol({ sesion, onReinicio }) {
  const [ranura, setRanura] = useState(null);

  useEffect(() => {
    setRanura(document.getElementById('hrl-acciones-modulo'));
  }, []);

  if (!ranura || !sesion.admin) return null;
  const enAdmin = sesion.usuario.id === sesion.admin.id;

  /* Estadística y Planeamiento, que reciben de las nueve áreas, van juntas. */
  const deEstadistica = USUARIOS.filter((u) => u.roles.includes(ROL.ESTADISTICA) || u.roles.includes(ROL.PLANEAMIENTO));
  const deAreas = USUARIOS.filter((u) => u.roles.includes(ROL.AREA));
  const deOficinas = USUARIOS.filter((u) => u.roles.includes(ROL.OFICINA) && !u.roles.includes(ROL.AREA));

  const item = (u) => ({
    id: u.id,
    label: u.area ? `${area(u.area).nombreCorto}${u.roles.length > 1 ? ' (doble rol)' : ''}` : u.cargo,
    icon: u.area ? area(u.area).icono : u.roles.includes(ROL.ESTADISTICA) ? 'sh-traffic-light' : u.roles.includes(ROL.PLANEAMIENTO) ? 'sh-chart' : 'sh-inbox',
    disabled: u.id === sesion.usuario.id,
    onSelect: () => iniciarSesion(u, { admin: sesion.admin }),
  });

  const items = [
    ...(enAdmin ? [] : [{ id: 'volver', label: 'Volver a administración', icon: 'sh-gear', onSelect: volverAAdmin }, { separator: true }]),
    ...deEstadistica.map(item),
    { separator: true },
    ...deAreas.map(item),
    { separator: true },
    ...deOficinas.map(item),
    { separator: true },
    {
      id: 'reiniciar',
      label: 'Reiniciar datos del prototipo',
      icon: 'sh-swap',
      onSelect: () => {
        reiniciarDatos();
        onReinicio?.();
      },
    },
  ];

  return createPortal(
    <Tooltip
      title="Herramienta de desarrollo"
      body="Cambia de sesión sin volver a ingresar, para ver el mismo reporte desde el área, desde Estadística y desde la oficina que lo recibe, o vuelve a administración. Solo la ve la cuenta de administración."
      focusable={false}
    >
      <DropdownMenu
        label="Cambiar de sesión para la demostración"
        trigger={
          <Button tone="ghost" size="sm" icon="sh-swap">
            Ver como…
          </Button>
        }
        items={items}
      />
    </Tooltip>,
    ranura,
  );
}
