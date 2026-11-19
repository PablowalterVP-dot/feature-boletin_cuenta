/* Máquina de estados del reporte mensual.

   Un solo módulo decide qué puede pasarle a un reporte y quién puede hacerlo.
   Ninguna pantalla inventa transiciones: pide las que correspondan al estado y
   al rol, y pinta botones solo para esas.

   Estadística **ya no valida ni remite** (decisión del 12 de octubre de 2026).
   El bot validador revisa cada Excel al subirlo y no deja enviar lo que no
   cuadra ni una alerta sin justificar: esa es la validación. Volver a mirarlo
   en Estadística repetía el trabajo del bot y retrasaba a las oficinas. Por
   eso, al enviar, el reporte llega a la vez a Estadística y a todas las
   oficinas que la matriz de destinos determina, y el periodo queda cerrado.

   Tampoco devuelve reportes con observaciones (13/09/2026). La única vuelta
   atrás es reabrir un periodo cerrado al que llega una corrección.

     no_iniciado ──crear──▶ borrador ──enviar──▶ remitido
                               ▲                     │
                               └────(rectificar)─────┘

   La clave `remitido` se conserva porque es la de la base de datos; para
   quien lo lee, es «Entregado». */

/* Quién se espera que actúe. Sin la validación de Estadística, solo queda el
   área: lo que ya salió de ella no espera a nadie. */
export const ESPERA = Object.freeze({
  AREA: 'area',
  NADIE: 'nadie',
});

export const ESTADOS = Object.freeze({
  no_iniciado: Object.freeze({
    clave: 'no_iniciado',
    label: 'No iniciado',
    orden: 0,
    tono: 'none',
    icono: 'sh-none',
    espera: ESPERA.AREA,
    descripcion: 'El área todavía no ha abierto el reporte de este periodo.',
  }),
  borrador: Object.freeze({
    clave: 'borrador',
    label: 'En llenado',
    orden: 1,
    tono: 'none',
    icono: 'sh-pencil',
    espera: ESPERA.AREA,
    descripcion: 'El área lo está llenando.',
  }),
  remitido: Object.freeze({
    clave: 'remitido',
    label: 'Entregado',
    orden: 2,
    tono: 'ok',
    icono: 'sh-ok',
    espera: ESPERA.NADIE,
    descripcion: 'Validado por el bot y entregado a Estadística y a las oficinas de la matriz. El periodo está cerrado.',
  }),
});

export const LISTA_ESTADOS = Object.freeze(
  Object.values(ESTADOS).sort((a, b) => a.orden - b.orden),
);

/* Los estados que tuvo el flujo hasta el 12/10/2026. Ningún reporte queda en
   ellos (la migración de la base los pasó a `remitido`), pero siguen en el
   historial de los reportes de entonces, y ahí se leen con su nombre. */
const ESTADOS_RETIRADOS = Object.freeze({ enviado: 'Enviado', en_revision: 'En revisión', validado: 'Validado' });

export function estado(clave) {
  if (clave && ESTADOS[clave]) return ESTADOS[clave];
  if (clave && clave in ESTADOS_RETIRADOS) {
    return Object.freeze({
      ...ESTADOS.remitido,
      clave,
      label: ESTADOS_RETIRADOS[clave],
      descripcion: `${ESTADOS_RETIRADOS[clave]} (estado anterior al 12/10/2026).`,
    });
  }
  return ESTADOS.no_iniciado;
}

/* El rótulo de un estado tal como aparece en un historial. */
export function etiquetaDeEstado(clave) {
  return ESTADOS[clave]?.label ?? ESTADOS_RETIRADOS[clave] ?? clave;
}

/* Transiciones permitidas.

   `rol` es quién puede dispararla; `confirmar` marca las que exigen un diálogo
   porque cambian algo que otros ya vieron. */
export const TRANSICIONES = Object.freeze([
  Object.freeze({
    accion: 'crear',
    desde: Object.freeze(['no_iniciado']),
    hasta: 'borrador',
    rol: 'area',
    label: 'Llenar reporte',
    icono: 'sh-pencil',
    descripcion: 'Abre el formulario del periodo para empezar a registrar.',
  }),
  Object.freeze({
    accion: 'enviar',
    desde: Object.freeze(['borrador']),
    hasta: 'remitido',
    rol: 'area',
    label: 'Enviar',
    icono: 'sh-send',
    confirmar: true,
    descripcion: 'Entrega el reporte a Estadística y a las oficinas de la matriz. Deja de ser editable y se emite la constancia.',
  }),
  Object.freeze({
    accion: 'rectificar',
    desde: Object.freeze(['remitido']),
    hasta: 'borrador',
    rol: 'estadistica',
    label: 'Reabrir para rectificación',
    icono: 'sh-swap',
    confirmar: true,
    /* No es una devolución con observaciones: es la excepción de un mes ya
       cerrado al que llega una corrección, igual que ocurre con el papel. Se
       registra en el historial para que las oficinas que ya lo recibieron
       puedan enterarse. */
    descripcion: 'Reabre un periodo cerrado. Las oficinas que ya recibieron el reporte quedarán con una versión desactualizada.',
  }),
]);

/* Transiciones disponibles para un estado y un rol. Las pantallas piden esto y
   pintan un botón por cada resultado; nunca deciden por su cuenta. */
export function transicionesDe(claveEstado, rol) {
  return TRANSICIONES.filter((t) => t.desde.includes(claveEstado) && t.rol === rol);
}

export function transicion(accion) {
  return TRANSICIONES.find((t) => t.accion === accion) ?? null;
}

export function puede(claveEstado, accion, rol) {
  const t = transicion(accion);
  return Boolean(t && t.rol === rol && t.desde.includes(claveEstado));
}

/* Editable solo mientras el área lo llena: una vez enviado, el área no puede
   cambiar cifras que las oficinas ya recibieron. */
export function esEditable(claveEstado) {
  return claveEstado === 'borrador';
}

/* Un reporte está entregado desde que sale del área: con la entrega directa
   ya no hay trámite abierto después del envío. */
export function estaEntregado(claveEstado) {
  return claveEstado === 'remitido' || Boolean(claveEstado && claveEstado in ESTADOS_RETIRADOS);
}
