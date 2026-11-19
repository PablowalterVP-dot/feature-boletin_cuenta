/* Las cuentas de hospitalización. Todas ven el plano de camas; el rol decide qué
   puede hacer cada una y los servicios limitan qué camas opera.

   El flujo (2026-11-13, decisión 0010): Admisión envía al paciente a un área,
   esa área designa habitación y cama y desde ahí controla al paciente: soporte,
   traslados y alta completa con CIE-10. La cuenta del departamento solo
   monitorea.

   Desde la fase 3 de la decisión 0011 las cuentas viven en la base de Estadística
   (servidor/api/bd/seeders/0009_hospitalizacion.sql) y entran con su ingreso. Lo que
   sigue aquí es lo que este sistema necesita saber de ellas: qué módulos ve cada rol
   y cómo se traduce a rol un permiso `hospitalizacion.*` del token. `CUENTAS` son
   las diez de prueba, con los mismos nombres de usuario que siembra
   `seed:hospitalizacion`; la API las carga en su base para el ingreso propio. */

const MEDICINA_A = 'medicina-a'
const MEDICINA_B = 'medicina-b'
const INTERMEDIOS = 'medicina-intermedios'
const UCI = 'cuidados-criticos'
const QUEMADOS = 'quemados'
const MEDICINA = [MEDICINA_A, MEDICINA_B, INTERMEDIOS]
const TODOS = [...MEDICINA, UCI, QUEMADOS]

/* Qué módulos ve cada rol, en el orden del menú. El primero es la pantalla con
   la que abre la cuenta. */
export const MODULOS_POR_ROL = Object.freeze({
  admision: ['mapa', 'ordenes', 'pacientes'],
  departamento: ['mapa', 'movimientos', 'censo', 'tablero', 'pacientes', 'cuentas'],
  enfermeria: ['mapa', 'movimientos', 'censo', 'pacientes'],
  /* Estadística solo mira (15/11/2026): la gestión de camas, el consolidado de censos y RENOXI. */
  jefatura: ['mapa', 'consolidado', 'renoxi'],
  camas: ['mapa', 'renoxi', 'tablero'],
  mantenimiento: ['mapa', 'mantenimiento'],
})

export const modulosDeRol = (rol) => MODULOS_POR_ROL[rol] ?? []

export const ETIQUETA_ROL = Object.freeze({
  admision: 'Admisión',
  departamento: 'Jefatura de departamento',
  enfermeria: 'Enfermería del área',
  jefatura: 'Estadística',
  camas: 'Responsable de RENOXI',
  mantenimiento: 'Mantenimiento',
})

/* El permiso del token que decide el rol. Si trae varios, manda el primero: el
   superadministrador los trae todos y entra como Estadística. Es la misma lista que
   `PRECEDENCIA` en servidor/hospitalizacion/app/cuentas_estadistica.py (la prueba de
   humo las compara). */
export const PRECEDENCIA = Object.freeze([
  ['hospitalizacion.validar', 'jefatura'],
  ['hospitalizacion.admision', 'admision'],
  ['hospitalizacion.camas', 'camas'],
  ['hospitalizacion.mantenimiento', 'mantenimiento'],
  ['hospitalizacion.supervisar', 'departamento'],
  ['hospitalizacion.operar', 'enfermeria'],
])

export const rolDesdePermisos = (permisos = []) => PRECEDENCIA.find(([permiso]) => permisos.includes(permiso))?.[1] ?? null

export const CUENTAS = [
  {
    id: 'admision',
    usuario: 'admision',
    nombre: 'Admisión',
    rol: 'admision',
    rolLabel: 'Admisión (conecta con Galeno)',
    servicios: TODOS,
  },
  {
    id: 'dep.medicina',
    usuario: 'dep.medicina',
    nombre: 'Departamento de Medicina',
    rol: 'departamento',
    rolLabel: 'Monitoreo del departamento',
    servicios: MEDICINA,
  },
  {
    id: 'medicina.a',
    usuario: 'medicina.a',
    nombre: 'Enfermería Medicina A',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [MEDICINA_A],
  },
  {
    id: 'medicina.b',
    usuario: 'medicina.b',
    nombre: 'Enfermería Medicina B',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [MEDICINA_B],
  },
  {
    id: 'medicina.int',
    usuario: 'medicina.int',
    nombre: 'Enfermería Intermedios',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [INTERMEDIOS],
  },
  {
    id: 'uci',
    usuario: 'uci',
    nombre: 'Enfermería UCI',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [UCI],
  },
  {
    id: 'quemados',
    usuario: 'quemados',
    nombre: 'Enfermería Quemados',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [QUEMADOS],
  },
  {
    id: 'estadistica',
    usuario: 'estadistica',
    nombre: 'Estadística',
    rol: 'jefatura',
    rolLabel: 'Estadística',
    servicios: TODOS,
  },
  {
    /* Quien lleva el control diario de camas y carga RENOXI a mano. */
    id: 'control.camas',
    usuario: 'control.camas',
    nombre: 'Responsable de RENOXI',
    rol: 'camas',
    rolLabel: 'Control diario de camas y RENOXI',
    servicios: TODOS,
  },
  {
    id: 'mantenimiento',
    usuario: 'mantenimiento',
    nombre: 'Mantenimiento',
    rol: 'mantenimiento',
    rolLabel: 'Mantenimiento',
    servicios: TODOS,
  },
]

/* Opera el área (designa camas, registra altas y traslados) solo su enfermería.
   El servidor aplica la misma regla. */
export const operaArea = (cuenta, servicioId) => cuenta.rol === 'enfermeria' && cuenta.servicios.includes(servicioId)

export const cuentaPorId = (id) => CUENTAS.find((c) => c.id === id) ?? null
export const cuentaPorUsuario = (u) => CUENTAS.find((c) => c.usuario === u) ?? null

/* Los grupos del menú. Dentro del Sistema de Reporte Estadístico van debajo de sus
   grupos: «Hospitalización» y, con más de un reporte, «Reportes de hospitalización»
   (navegacion.js; su menú no admite un grupo de una sola entrada). */
export const GRUPO = 'Hospitalización'
export const GRUPO_REPORTES = 'Reportes de hospitalización'

export const MODULOS = {
  mapa: { label: 'Gestión de camas', icono: 'sh-home', grupo: GRUPO, subtitulo: 'Elige una cama en la lista o en el plano: el plano se acerca a ella y abajo aparece su ficha.' },
  ordenes: { label: 'Órdenes de hospitalización', icono: 'sh-doc', grupo: GRUPO, subtitulo: 'Envía al paciente a un área. La habitación y la cama las designa esa área.' },
  movimientos: { label: 'Movimientos del día', icono: 'sh-swap', grupo: GRUPO, subtitulo: 'Lo registrado hoy en el servicio. Un movimiento no se borra: se anula con motivo.' },
  censo: { label: 'Censo diario', icono: 'sh-table', grupo: GRUPO, subtitulo: 'Se genera de los movimientos. Desde aquí se registran las altas y los traslados. Va de 00:00 a 23:59 y se cierra a las 24:00.' },
  consolidado: { label: 'Consolidado de censos', icono: 'sh-lines', grupo: GRUPO_REPORTES, subtitulo: 'Censos por día y servicio, y egresos del mes. Elige el mes arriba a la derecha.' },
  renoxi: { label: 'RENOXI', icono: 'sh-send', grupo: GRUPO_REPORTES, subtitulo: 'Lo del día en el orden del formulario web, para copiarlo o descargarlo. RENOXI no tiene API.' },
  mantenimiento: { label: 'Órdenes de camas', icono: 'sh-wrench', grupo: GRUPO, subtitulo: 'Del reporte de la falla hasta que enfermería recibe la cama.' },
  tablero: { label: 'Tablero de ocupación', icono: 'sh-pie', grupo: GRUPO_REPORTES, subtitulo: 'Ocupación actual del departamento por área.' },
  cuentas: { label: 'Cuentas y bitácora', icono: 'sh-shield', grupo: GRUPO, subtitulo: 'Qué puede hacer cada cuenta y qué se ha hecho.' },
  pacientes: { label: 'Buscar paciente', icono: 'sh-search', grupo: GRUPO, subtitulo: 'Dónde está, su trayectoria y quién completó cada dato.' },
}
