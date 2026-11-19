/* Las unidades de hospitalización en la base de Estadística.

   Cada cuenta de enfermería se ata a su área y cada jefatura a su departamento con
   una unidad de esa base. Su clave lleva un prefijo propio y el id del catálogo
   (`catalogo.js`), para que nunca choque con una unidad de Estadística: el id
   `ginecologia` ya es Gineco-Obstetricia allá, y Cirugía tiene un departamento y un
   área con el mismo id. Es la misma regla que
   `servidor/api/app/servicios/unidades_hospitalizacion.py` y que
   `servidor/hospitalizacion/app/cuentas_estadistica.py`. */

export const PREFIJO = Object.freeze({ departamento: 'hosp-dep-', area: 'hosp-area-' })

export const claveDeUnidad = (tipo, id) => PREFIJO[tipo] + id

/* `{ tipo, id }` si la clave es de hospitalización; si no, `null`. */
export function deHospitalizacion(clave) {
  for (const [tipo, prefijo] of Object.entries(PREFIJO)) {
    if (typeof clave === 'string' && clave.startsWith(prefijo)) return { tipo, id: clave.slice(prefijo.length) }
  }
  return null
}

/* Los roles de Estadística que se asignan en una unidad de hospitalización, y de
   qué tipo. Los demás roles de hospitalización son globales. */
export const TIPO_DE_UNIDAD_POR_ROL = Object.freeze({
  enfermeria: 'area',
  jefe_departamento: 'departamento',
})

/* Camas dibujadas por área en un plano: las que puede operar su enfermería. Una
   cama sin área propia toma la de su habitación. */
export function camasPorArea(plano) {
  const deZona = new Map(plano.zonas.map((z) => [z.id, z.servicioId]))
  const cuenta = new Map()
  for (const c of plano.camas) {
    const area = c.servicioId ?? deZona.get(c.zonaId)
    if (area) cuenta.set(area, (cuenta.get(area) ?? 0) + 1)
  }
  return cuenta
}

/* Una sigla sugerida para el código de la unidad: las iniciales del nombre, sin
   tildes, hasta cuatro letras. El superadministrador la puede cambiar. */
export function siglaSugerida(nombre) {
  const palabras = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((p) => p && !['DE', 'DEL', 'LA', 'Y'].includes(p))
  if (palabras.length === 1) return palabras[0].slice(0, 3)
  return palabras.map((p) => p[0]).join('').slice(0, 4)
}
