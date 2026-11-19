import { Badge, Card, DataTable, Mosaic, PaginatedTable } from '@hrl/core-ui'
import { ETIQUETA_ROL, MODULOS, modulosDeRol } from '@/app/hospitalizacion/datos/cuentas.js'
import { verFechaHora } from '@/app/hospitalizacion/dominio/tiempo.js'
import { nombreServicio, useApp } from '@/app/hospitalizacion/paneles/comun.jsx'

/* Las cuentas salen del servidor (`estado.cuentas`): con el ingreso de Estadística
   son las que han entrado alguna vez, y se crean y desactivan allá. Lo que esta
   pantalla dice de cada una (módulos y servicios) es lo que hospitalización deduce
   de sus permisos. */
export function CuentasBitacora() {
  const { estado } = useApp()
  const nombres = new Map(estado.cuentas.map((c) => [c.id, c.nombre]))
  const deEstadistica = estado.ingreso === 'estadistica'
  return (
    <Mosaic stacked className="hrl-panel">
      <Card
        title="Cuentas de hospitalización"
        subtitle={deEstadistica
          ? 'Se crean, se desactivan y reciben su rol en «Cuentas y permisos» del Sistema de Reporte Estadístico. Aquí aparecen al entrar por primera vez.'
          : 'Todas ven el plano 3D. El rol decide qué puede hacer; los servicios, qué camas opera.'}
      >
        <DataTable rowKey={(c) => c.id} rows={estado.cuentas} empty="Todavía no ha entrado ninguna cuenta." columns={[
          { key: 'id', label: 'Usuario', width: 170 },
          { key: 'nombre', label: 'Nombre', width: 210 },
          { key: 'rol', label: 'Rol', width: 200, render: (c) => (c.activo ? ETIQUETA_ROL[c.rol] ?? c.rol : <Badge label="Desactivada" tone="none" />) },
          { key: 'servicios', label: 'Servicios', width: 220, render: (c) => c.servicios.map(nombreServicio).join(', ') || '—' },
          { key: 'modulos', label: 'Módulos', render: (c) => modulosDeRol(c.rol).map((m) => MODULOS[m].label).join(', ') },
        ]} />
      </Card>
      <Card title="Bitácora" subtitle="Lo registrado, por cuenta. El censo y los reportes no se pueden alterar sin dejar rastro.">
        <PaginatedTable rowKey={(b) => b.id} rows={estado.bitacora} presorted perPage={12} empty="Todavía no se ha registrado nada." columns={[
          { key: 'fecha', label: 'Fecha', width: 150, render: (b) => verFechaHora(b.fecha) },
          { key: 'cuenta', label: 'Cuenta', width: 170, render: (b) => <Badge label={nombres.get(b.cuenta) ?? b.cuenta} tone="none" /> },
          { key: 'accion', label: 'Acción', width: 300 },
          { key: 'detalle', label: 'Detalle' },
        ]} />
      </Card>
    </Mosaic>
  )
}
