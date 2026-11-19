/* Qué pantalla abre cada módulo del menú (`MODULOS` en datos/cuentas.js). App lo
   usa para montar la pantalla activa y la prueba de humo para renderizarlas todas:
   un módulo sin pantalla, o una pantalla sin módulo, falla allí y no en el piso. */

import { CuentasBitacora } from '@/app/hospitalizacion/paneles/cuentas/CuentasBitacora.jsx'
import { Ordenes } from '@/app/hospitalizacion/paneles/admision/Ordenes.jsx'
import { MapaCamas } from '@/app/hospitalizacion/paneles/camas/MapaCamas.jsx'
import { MovimientosDia } from '@/app/hospitalizacion/paneles/camas/MovimientosDia.jsx'
import { CensoDiario } from '@/app/hospitalizacion/paneles/censo/CensoDiario.jsx'
import { Consolidado, Renoxi, Tablero } from '@/app/hospitalizacion/paneles/reportes/Reportes.jsx'
import { OrdenesCama } from '@/app/hospitalizacion/paneles/mantenimiento/OrdenesCama.jsx'
import { BuscarPaciente } from '@/app/hospitalizacion/paneles/pacientes/BuscarPaciente.jsx'

export const PANELES = {
  ordenes: Ordenes,
  mapa: MapaCamas,
  movimientos: MovimientosDia,
  censo: CensoDiario,
  consolidado: Consolidado,
  renoxi: Renoxi,
  mantenimiento: OrdenesCama,
  tablero: Tablero,
  cuentas: CuentasBitacora,
  pacientes: BuscarPaciente,
}
