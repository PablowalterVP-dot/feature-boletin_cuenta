/* Un módulo de hospitalización dentro del Sistema de Reporte Estadístico.

   App.jsx lo monta para toda entrada del menú que viene de
   `navegacionDeHospitalizacion` (navegacion.js): el shell, la cabecera, el menú y la
   sesión son los de Estadística; esto pone lo de hospitalización, que no comparte
   nada con su almacén: el estado de los pisos, que vive en la API de hospitalización
   y se vuelve a pedir cada pocos segundos, y la cuenta tal como esa API la entiende
   (su rol y los servicios que opera, deducidos de los permisos del token).

   Se carga con `lazy`: el plano 3D no pesa en el ingreso de quien no lo usa. */

import { useEffect, useMemo, useState } from 'react'
import { Alert, EmptyState, Mosaic, Skeleton, Toast } from '@hrl/core-ui'
import { sesionVencida } from '@/app/datos/store.js'
import { conectar, despachar, useEstadoHospitalizacion, useSinConexionHospitalizacion } from '@/app/servicios/hospitalizacion.js'
import { MODULOS, modulosDeRol } from '@/app/hospitalizacion/datos/cuentas.js'
import { ContextoApp } from '@/app/hospitalizacion/paneles/comun.jsx'
import { PANELES } from '@/app/hospitalizacion/paneles/indice.js'
import '@/app/hospitalizacion/estilos.css'

export default function Hospitalizacion({ modulo, sesion }) {
  const estado = useEstadoHospitalizacion()
  const sinConexion = useSinConexionHospitalizacion()
  const [toast, setToast] = useState(null)
  const usuarioId = sesion.usuario.id

  useEffect(() => conectar(usuarioId, sesionVencida), [usuarioId])

  const cuenta = useMemo(() => (estado?.cuenta ? { ...estado.cuenta, modulos: modulosDeRol(estado.cuenta.rol) } : null), [estado?.cuenta])
  const contexto = useMemo(() => ({
    estado,
    cuenta,
    hacer: async (tipo, datos = {}, aviso) => {
      const mensaje = await despachar({ tipo, ...datos })
      if (mensaje) setToast(mensaje)
      else if (aviso) setToast(aviso)
      return mensaje
    },
  }), [estado, cuenta])

  if (!estado) {
    return (
      <Mosaic stacked className="hrl-panel" aria-busy={!sinConexion}>
        {sinConexion
          ? <Alert tone="error" title="Sin conexión con hospitalización">{sinConexion} El resto del sistema sigue funcionando.</Alert>
          : <Skeleton height={420} radius="var(--radius-card)" />}
      </Mosaic>
    )
  }

  if (!cuenta.modulos.includes(modulo)) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-shield" title={`${MODULOS[modulo]?.label ?? 'Este módulo'} no es de tu rol`} body="Lo que ve cada cuenta en hospitalización lo deciden sus permisos. Si te falta, pídelo a la Oficina de Estadística." />
      </Mosaic>
    )
  }

  const Panel = PANELES[modulo]
  return (
    <ContextoApp.Provider value={contexto}>
      {sinConexion && <Alert tone="warning" title="Lo que ves puede estar desactualizado">{sinConexion}</Alert>}
      <Panel />
      <Toast message={toast} onClose={() => setToast(null)} />
    </ContextoApp.Provider>
  )
}
