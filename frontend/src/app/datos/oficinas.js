/* Oficinas que reciben información, y el destino externo.

   Estadística no aparece en la lista de receptoras porque no es un destino
   más: es el centro de la arquitectura acordada. Toda área envía a Estadística
   y solo Estadística remite hacia afuera. Ver `areas.js` para la matriz. */

export const ESTADISTICA = Object.freeze({
  clave: 'estadistica',
  nombre: 'Oficina de Estadística',
  sigla: 'EST',
  icono: 'sh-traffic-light',
});

/* Las cuatro oficinas del hospital a las que Estadística remite. El campo
   `recibeDe` no se escribe aquí: se deriva de la matriz de `areas.js`, para
   que el mapa de destinos tenga una sola fuente y no dos que se contradigan. */
export const OFICINAS = Object.freeze([
  Object.freeze({
    clave: 'planeamiento',
    nombre: 'Oficina de Planeamiento Estratégico',
    nombreCorto: 'Planeamiento',
    sigla: 'PLA',
    icono: 'sh-chart',
    /* Por qué recibe: usa la producción de los servicios para el
       planeamiento operativo y la programación presupuestal. */
    motivo: 'Programación presupuestal y planeamiento operativo institucional.',
  }),
  Object.freeze({
    clave: 'epidemiologia',
    nombre: 'Oficina de Epidemiología',
    nombreCorto: 'Epidemiología',
    sigla: 'EPI',
    icono: 'sh-shield',
    motivo: 'Vigilancia epidemiológica e infecciones asociadas a la atención de salud.',
    /* Epidemiología es además una de las nueve áreas que reportan. Es el único
       caso de doble rol y la razón por la que el sistema no puede tener solo
       dos tipos de usuario. */
    tambienEsArea: true,
  }),
  Object.freeze({
    clave: 'cuerpo-tecnico',
    nombre: 'Cuerpo Técnico',
    nombreCorto: 'Cuerpo Técnico',
    sigla: 'CTE',
    icono: 'sh-people',
    motivo: 'Control de la carga de trabajo y la dotación del personal técnico.',
  }),
  Object.freeze({
    clave: 'direccion-general',
    nombre: 'Dirección General',
    nombreCorto: 'Dirección General',
    sigla: 'DG',
    icono: 'sh-diamond',
    motivo: 'Seguimiento directivo de los servicios críticos del hospital.',
  }),
]);

/* Destino externo. No es una oficina del hospital y su remisión es un acto
   distinto: tiene plazo propio y formato propio. */
export const DIRESA = Object.freeze({
  clave: 'diresa',
  nombre: 'Dirección Regional de Salud de Loreto',
  nombreCorto: 'DIRESA Loreto',
  sigla: 'DIRESA',
  icono: 'sh-send',
  motivo: 'Consolidado mensual de producción que el hospital está obligado a remitir.',
});

export function oficina(clave) {
  return OFICINAS.find((o) => o.clave === clave) ?? null;
}

export function nombreOficina(clave) {
  if (clave === DIRESA.clave) return DIRESA.nombreCorto;
  if (clave === ESTADISTICA.clave) return ESTADISTICA.nombre;
  return oficina(clave)?.nombreCorto ?? clave;
}
