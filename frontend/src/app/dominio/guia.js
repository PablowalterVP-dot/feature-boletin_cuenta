/* El tutorial guiado del reporte del mes: qué paso le toca a la persona AHORA.

   No es una lista de pasos que se recorre: es una función del estado de la
   pantalla. Cada parte del flujo publica lo que sabe (`app/guia/senales.js`) y de
   ahí sale el paso, así que el tutorial se adapta a lo que encontró el bot en el
   archivo y no puede quedarse diciendo algo que ya dejó de ser cierto. Es lo mismo
   que decidió el cajón de avisos (`avisos.js`): se deriva, no se guarda.

   Es una PRÁCTICA (01/11/2026): nada de lo que se haga se guarda ni llega a ninguna
   oficina, y al terminar todo queda como antes (`servicios/practica.js`). Por eso
   «Siguiente» puede hacer el paso por la persona: pulsar lo mismo que ella pulsaría
   no tiene consecuencias. Puede hacerlo ella misma sobre lo resaltado, y aprende lo
   mismo: el paso cambia igual, porque cambió la pantalla.

   Los botones siguen la práctica de React Joyride, sin su dependencia: «Siguiente»
   y «Anterior» en cada paso, el botón oculto donde no hay a dónde ir (como
   `hideBackButton`) y desactivado mientras se espera (como `hideFooter` en un paso
   sin acción posible).

   Los textos no explican el error con palabras propias: el título de cada hallazgo
   llega del bot, como en la corrección con Dr. Mochi.

   Forma de un paso:
     id         distinto por paso; al cambiar, el foco y el desplazamiento se mueven
     fase       subir · revisar · enviar (el rótulo y la barra de progreso)
     titulo, texto, mascota (reposo · pensando · problema · listo)
     objetivos  los `data-guia` que se resaltan juntos
     modal      resalta el diálogo abierto entero
     enDialogo  el paso vive dentro de un diálogo: uno abierto no es ajeno
     centrado   sin objetivo y con la pantalla atenuada (la bienvenida)
     libre      la pantalla sigue respondiendo: hay más de un camino válido
     siguiente, anterior   qué hace cada botón: { pulsar: marca } | { visto: clave }
                | { olvidar: clave } | { terminar: true } | { volver: true }. Sin
                `siguiente`, se espera; sin `anterior`, no hay a dónde volver */

export const FASES = Object.freeze({
  subir: { numero: 1, texto: 'Paso 1 de 3 · Subir' },
  revisar: { numero: 2, texto: 'Paso 2 de 3 · Revisar' },
  enviar: { numero: 3, texto: 'Paso 3 de 3 · Enviar' },
});

/* Todo lo que el tutorial puede señalar o pulsar. La prueba de humo comprueba que
   cada uno exista en el código de la pantalla: un botón renombrado o retirado
   dejaría el tutorial señalando a la nada, sin que el lint ni el build lo noten. */
export const OBJETIVOS = Object.freeze([
  'selector-mes',
  'pasos-reporte',
  'carga-zona',
  'elegir-archivo',
  'ejemplo-errores',
  'ejemplo-correcto',
  'volver-sin-subir',
  'confirmar-reemplazo',
  'corregir',
  'subir-otro',
  'continuar-envio',
  'correccion-elegir',
  'correccion-chips',
  'pregunta',
  'aplicar',
  'confirmar-alerta',
  'deshacer',
  'siguiente',
  'error-anterior',
  'chip-con-arreglo',
  'finalizar',
  'envio-destinos',
  'envio-volver',
  'volver-revision',
  'envio-casilla',
  'enviar',
  'enviar-ahora',
  'cancelar-envio',
  'constancia-cerrar',
]);

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/* «Estadística», «Estadística y Planeamiento», «Estadística, Planeamiento y Epidemiología». */
function enumerar(nombres) {
  if (nombres.length <= 1) return nombres[0] ?? 'Estadística';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

/* ---------------------------------------------------------- pasos comunes */

function esperando(id, fase, titulo, texto, extra = {}) {
  return { id, fase, titulo, texto, mascota: 'pensando', objetivos: [], libre: true, ...extra };
}

/* Quien ya vio un error sin arreglo «corrige su archivo»: el ejemplo correcto hace
   ese papel. Si no, se practica con el que trae errores, que es el que enseña. */
function ejemploDe(sinArreglo) {
  return { pulsar: sinArreglo ? 'ejemplo-correcto' : 'ejemplo-errores' };
}

function subir({ mes, doc, problema, conDatos, sinArreglo, anterior }) {
  if (problema) {
    return {
      id: 'archivo-rechazado',
      fase: 'subir',
      titulo: problema.titulo,
      texto: `${problema.detalle} No se cargó ninguna cifra. Elija el ${doc} correcto de ${mes}, o pulse «Siguiente» y pruebo con uno de ejemplo.`,
      mascota: 'problema',
      objetivos: ['carga-zona'],
      libre: true,
      siguiente: ejemploDe(sinArreglo),
      anterior,
    };
  }
  if (conDatos && !sinArreglo) {
    return {
      id: 'subir-otro-archivo',
      fase: 'subir',
      titulo: `Aquí se sube otro ${doc}`,
      texto: `Si su ${doc} cambió, súbalo de nuevo: lo vuelvo a revisar entero. Pulse «Siguiente» para volver a la revisión sin subir nada.`,
      mascota: 'reposo',
      objetivos: ['carga-zona'],
      libre: true,
      siguiente: { pulsar: 'volver-sin-subir' },
    };
  }
  return {
    id: 'subir-archivo',
    fase: 'subir',
    titulo: `Suba su ${doc} de ${mes}`,
    texto: `Arrástrelo a este recuadro o pulse el botón para elegirlo. También puede pulsar «Siguiente» y pruebo con un ${doc} de ejemplo, con cifras ficticias. Le muestro lo que encuentre antes de enviar nada.`,
    mascota: 'reposo',
    objetivos: ['carga-zona'],
    libre: true,
    siguiente: ejemploDe(sinArreglo),
    anterior,
  };
}

function leyendo(doc) {
  return esperando('leyendo', 'subir', `Estoy leyendo su ${doc}`, 'Reviso que las cifras cuadren. Toma un momento: en cuanto termine le digo qué encontré.');
}

function porCorregir({ errores, alertas, doc, sinArreglo, anterior }) {
  /* Ya vio un error que no tiene arreglo seguro: insistir con la corrección no lo
     resolvería. El camino es su archivo, y la pantalla sigue libre por si le
     quedan otros que sí tienen arreglo. */
  if (errores > 0 && sinArreglo) {
    return {
      id: 'corregir-en-el-archivo',
      fase: 'revisar',
      titulo: `Corrija su ${doc} y súbalo de nuevo`,
      texto: `Quedan ${plural(errores, 'error', 'errores')}. Con su reporte de verdad, abriría su ${doc}, corregiría las cifras que le mostré, lo guardaría y lo subiría de nuevo${doc === 'Word' ? ' aquí' : ' con «Subir otro archivo»'}. Pulse «Siguiente» y practicamos con un ejemplo ya corregido.`,
      mascota: 'problema',
      objetivos: [doc === 'Word' ? 'carga-zona' : 'subir-otro'],
      libre: true,
      siguiente: doc === 'Word' ? { pulsar: 'ejemplo-correcto' } : { pulsar: 'subir-otro' },
      anterior,
    };
  }
  if (errores > 0) {
    return {
      id: 'hay-errores',
      fase: 'revisar',
      titulo: `Encontré ${plural(errores, 'error', 'errores')} en su ${doc}`,
      texto: 'Lo que no cuadra impide enviar, y por eso no sale del área. Pulse «Corregir con Dr. Mochi»: le muestro cada error en su hoja y le propongo el arreglo. Su archivo no cambia.',
      mascota: 'problema',
      objetivos: ['corregir'],
      siguiente: { pulsar: 'corregir' },
      anterior,
    };
  }
  return {
    id: 'hay-alertas',
    fase: 'revisar',
    titulo: `Todo cuadra, pero hay ${plural(alertas, 'alerta', 'alertas')}`,
    texto: 'Una alerta es una cifra rara pero posible. Pulse el botón para revisarla conmigo: la corrige si es un error, o confirma que es correcta y se envía tal cual.',
    mascota: 'reposo',
    objetivos: ['corregir'],
    siguiente: { pulsar: 'corregir' },
    anterior,
  };
}

/* ------------------------------------------------- la corrección, error a error */

function queMirar(a, doc) {
  if (a.esAlerta) return a.hayArreglo ? 'Es una cifra rara pero posible. Si es un error, pulse «Aplicar». Si es real, pulse «Es correcto: confirmar».' : 'Es una cifra rara pero posible. Si es real, pulse «Es correcto: confirmar». Si no lo es, se corrige en su archivo y se sube de nuevo.';
  const que = a.balanza
    ? 'Compare los dos lados: tienen que dar lo mismo.'
    : a.tipo === 'escritura'
      ? 'Esta celda tiene algo que no es una cifra.'
      : a.tipo === 'faltan'
        ? 'Estas casillas no tienen dato. Un cero solo va si de verdad fue cero.'
        : 'Revise la celda marcada.';
  if (!a.hayArreglo) return `${que} No tengo un arreglo seguro para esto: se corrige en su ${doc} y se sube de nuevo. Pulse «Siguiente» para pasar al que sigue.`;
  return `${que} Pase el puntero por el arreglo para verlo en la hoja de abajo y pulse «Aplicar». «Siguiente» aplica el primero.`;
}

function enCorreccion(c) {
  const base = { fase: 'revisar', enDialogo: true };
  if (c.cargando) return { ...esperando('abriendo-correccion', 'revisar', 'Abriendo su archivo', 'Busco cada error en su hoja.'), enDialogo: true };
  if (c.bloqueado || c.sinArchivo) {
    return {
      ...base,
      id: 'correccion-archivo',
      titulo: 'Necesito el archivo que subió',
      texto: 'Para mostrarle cada error en su hoja, elija el mismo archivo que subió. No se envía nada: solo lo abro aquí.',
      mascota: 'reposo',
      objetivos: ['correccion-elegir'],
    };
  }
  if (!c.actual) {
    return {
      ...base,
      id: 'correccion-vacia',
      titulo: 'Este archivo no tiene nada por corregir',
      texto: 'Pulse «Finalizar corrección» para volver al reporte.',
      mascota: 'listo',
      objetivos: ['finalizar'],
      siguiente: { pulsar: 'finalizar' },
    };
  }
  /* Volver atrás desde aquí es salir de la corrección, y «Finalizar» solo sale sin
     aplicar nada mientras no esté todo resuelto. */
  const salir = c.listo ? undefined : { pulsar: 'finalizar' };
  if (c.pendientes === 0) {
    return {
      ...base,
      id: 'correccion-lista',
      titulo: 'Ya no queda nada por resolver',
      texto: c.listo ? 'Pulse «Finalizar corrección»: lo corregido pasa al reporte y vuelvo a revisarlo. No tiene que subir otro archivo.' : 'Pulse «Finalizar corrección» para volver al reporte.',
      mascota: 'listo',
      objetivos: ['finalizar'],
      siguiente: { pulsar: 'finalizar' },
    };
  }
  const a = c.actual;
  const rotulo = `${a.esAlerta ? 'Alerta' : 'Error'} ${a.numero} de ${c.total}`;
  const irAlAnterior = a.numero > 1 ? { pulsar: 'error-anterior' } : salir;
  if (a.resuelto) {
    return {
      ...base,
      id: `resuelto-${a.numero}`,
      titulo: `${rotulo}: resuelto`,
      texto: `${plural(c.pendientes, 'punto queda', 'puntos quedan')} por resolver. Pulse «Siguiente» para pasar al que sigue. «Anterior» deshace este arreglo.`,
      mascota: 'listo',
      objetivos: ['correccion-chips', 'pregunta'],
      siguiente: { pulsar: 'siguiente' },
      anterior: { pulsar: 'deshacer' },
    };
  }
  const sinSalida = !a.esAlerta && !a.hayArreglo;
  return {
    ...base,
    id: `hallazgo-${a.numero}`,
    titulo: `${rotulo}: ${a.titulo}`,
    texto: queMirar(a, c.doc),
    mascota: a.esAlerta ? 'reposo' : 'problema',
    objetivos: ['correccion-chips', 'pregunta'],
    libre: sinSalida,
    marca: sinSalida ? 'sin-arreglo' : undefined,
    siguiente: a.esAlerta
      ? { pulsar: 'confirmar-alerta' }
      : a.hayArreglo
        ? { pulsar: 'aplicar' }
        : { pulsar: c.otroConArreglo ? 'chip-con-arreglo' : 'finalizar' },
    anterior: irAlAnterior,
  };
}

/* ------------------------------------------------------------- el envío */

function envioFinal({ mes, destinos, boton, marca }) {
  return {
    id: 'envio-final',
    fase: 'enviar',
    titulo: 'Este sería el envío',
    texto: `Con su reporte de verdad, al pulsar «${boton}» ${enumerar(destinos)} lo reciben y se emite su constancia, y ya no podría editarlo: solo Estadística puede reabrirlo. Aquí es una práctica: no llega a nadie. Pulse «Siguiente» para ver cómo termina.`,
    mascota: 'reposo',
    modal: true,
    enDialogo: true,
    siguiente: { pulsar: marca },
    anterior: { pulsar: 'cancelar-envio' },
    detalle: mes,
  };
}

/* ------------------------------------------------- el recorrido de las nueve */

function enFlujo(s, { mes, doc, destinos, sinArreglo, anteriorInicio }) {
  const { flujo, carga, revision, envio } = s;
  const paso = flujo?.paso;

  if (paso === 'carga') {
    if (carga?.procesando) return leyendo(doc);
    return subir({ mes, doc, problema: carga?.problema, conDatos: carga?.conDatos, sinArreglo, anterior: anteriorInicio });
  }

  /* Lo corregido se está volviendo a cargar: lo que dice la revisión todavía es
     de antes, y señalar «hay errores» por un instante confundiría. */
  if (flujo?.procesando) return leyendo(doc);

  if (paso === 'revision') {
    const atras = { pulsar: 'subir-otro' };
    if (!revision) {
      return { id: 'revision-vacia', fase: 'revisar', titulo: 'Todavía no hay nada que revisar', texto: `Pulse «Subir el ${doc}» para cargar su ${doc} de ${mes}.`, mascota: 'reposo', objetivos: [], libre: true };
    }
    if (revision.revisando) return esperando('revisando', 'revisar', 'Estoy revisando las cifras', 'Toma un instante. A Estadística llega exactamente lo que revisé.');
    if (revision.errores > 0 || revision.pendientes > 0) return porCorregir({ errores: revision.errores, alertas: revision.pendientes, doc, sinArreglo, anterior: atras });
    if (revision.listo) {
      return {
        id: 'listo-para-enviar',
        fase: 'revisar',
        titulo: 'Todo cuadra: su reporte está listo',
        texto: 'Más abajo están las cifras que leí, por si quiere revisarlas. Cuando quiera, pulse «Continuar al envío». Todavía no se envía nada.',
        mascota: 'listo',
        objetivos: ['continuar-envio'],
        siguiente: { pulsar: 'continuar-envio' },
        anterior: atras,
      };
    }
    return { id: 'revision-vacia', fase: 'revisar', titulo: 'Todavía no hay cifras', texto: `Vuelva a subir su ${doc} de ${mes}.`, mascota: 'reposo', objetivos: [], libre: true };
  }

  if (paso === 'envio') {
    if (!envio) return esperando('preparando-envio', 'enviar', 'Preparando el envío', 'Un momento.');
    if (!envio.listo) {
      return { id: 'envio-no-listo', fase: 'enviar', titulo: 'Todavía no se puede enviar', texto: 'Queda algo por resolver. Pulse el botón para volver a lo pendiente.', mascota: 'problema', objetivos: ['envio-volver'], siguiente: { pulsar: 'envio-volver' } };
    }
    if (envio.preguntando) return envioFinal({ mes, destinos, boton: 'Enviar ahora', marca: 'enviar-ahora' });
    if (envio.confirmado) {
      return {
        id: 'envio-boton',
        fase: 'enviar',
        titulo: 'Ya se puede enviar',
        texto: 'Pulse el botón. Antes de salir, el sistema pregunta una última vez.',
        mascota: 'reposo',
        objetivos: ['enviar'],
        siguiente: { pulsar: 'enviar' },
        anterior: { pulsar: 'envio-casilla' },
      };
    }
    if (!s.vistos?.includes('envio-destinos')) {
      return {
        id: 'envio-destinos',
        fase: 'enviar',
        titulo: 'A quién llega su reporte',
        texto: `Usted envía una sola vez y llega a la vez a ${enumerar(destinos)}. Aquí se ve qué recibe cada oficina y para qué.`,
        mascota: 'reposo',
        objetivos: ['envio-destinos'],
        siguiente: { visto: 'envio-destinos' },
        anterior: { pulsar: 'volver-revision' },
      };
    }
    return {
      id: 'envio-casilla',
      fase: 'enviar',
      titulo: 'Confirme que las cifras son las suyas',
      texto: `Con su reporte de verdad, marcaría esta casilla si las cifras corresponden a su registro de ${mes}.`,
      mascota: 'reposo',
      objetivos: ['envio-casilla'],
      siguiente: { pulsar: 'envio-casilla' },
      anterior: { olvidar: 'envio-destinos' },
    };
  }

  return esperando('preparando', 'subir', 'Preparando su reporte', 'Un momento.');
}

/* --------------------------------------------------------------- el paso */

/* `senales`: lo que publicó cada parte de la pantalla. `vistos`: lo que ya se
   explicó o ya ocurrió en este recorrido. `destinos`: los nombres de las oficinas
   que reciben el reporte (la matriz; dominio/ no importa de datos/). `enReporte`:
   si la pantalla abierta es la del reporte del mes. */
export function pasoDeGuia(senales, { vistos = [], destinos = [], enReporte = true } = {}) {
  if (!enReporte) {
    return {
      id: 'fuera',
      titulo: 'El tutorial sigue en «Reporte del mes»',
      texto: 'Vuelva a esa pantalla y seguimos donde lo dejó.',
      mascota: 'reposo',
      objetivos: [],
      libre: true,
      siguiente: { volver: true },
    };
  }

  const r = senales.reporte;
  if (!r) return esperando('preparando', null, 'Preparando su reporte', 'Un momento.');
  const { mes, doc } = r;

  if (senales.constancia) {
    return {
      id: 'constancia',
      fase: 'enviar',
      titulo: '¡Reporte entregado!',
      texto: 'Así termina: con esta constancia, que sustituye al sello de recepción del oficio y queda en el historial. Esta dice «práctica» porque no llegó a nadie.',
      mascota: 'listo',
      modal: true,
      enDialogo: true,
      siguiente: { pulsar: 'constancia-cerrar' },
    };
  }

  if (r.entregado) {
    return {
      id: 'fin',
      titulo: 'Eso es todo: ya sabe hacerlo',
      texto: `Como fue una práctica, no se guardó nada: al terminar, su reporte de ${mes} queda exactamente como estaba. Cuando tenga su ${doc}, súbalo aquí mismo y siga los mismos pasos. Este tutorial sigue en el botón «Iniciar tutorial».`,
      mascota: 'listo',
      objetivos: [],
      centrado: true,
      siguiente: { terminar: true },
    };
  }

  if (!r.editable) {
    return {
      id: 'no-editable',
      titulo: `El reporte de ${mes} no se puede editar ahora`,
      texto: 'Su estado actual no permite cambios. Si cree que es un error, consúltelo con Estadística.',
      mascota: 'reposo',
      objetivos: [],
      centrado: true,
      siguiente: { terminar: true },
    };
  }

  if (!vistos.includes('bienvenida')) {
    return {
      id: 'bienvenida',
      titulo: `Practiquemos su reporte de ${mes}`,
      texto: `Soy Dr. Mochi. Le señalo cada botón y le explico qué hace, según lo que encuentre en el ${doc}. Es una práctica: nada se guarda ni llega a ninguna oficina, y al terminar todo queda como antes. Avance con «Siguiente» o pulsando usted mismo lo que le señale.`,
      mascota: 'reposo',
      objetivos: [],
      centrado: true,
      siguiente: { visto: 'bienvenida' },
    };
  }

  if (!vistos.includes('mes')) {
    return {
      id: 'mes',
      fase: 'subir',
      titulo: 'Primero, el mes',
      texto: `Aquí se elige el mes del reporte. Por omisión es el que toca entregar: ${mes}. Si quedó uno pendiente, se abre desde esta lista.`,
      mascota: 'reposo',
      objetivos: ['selector-mes'],
      siguiente: { visto: 'mes' },
      anterior: { olvidar: 'bienvenida' },
    };
  }

  if (!vistos.includes('pasos')) {
    return {
      id: 'pasos',
      fase: 'subir',
      titulo: 'Son tres pasos',
      texto: `Subir su ${doc}, revisar lo que encontré y enviarlo. Esta franja le dice siempre en cuál va.`,
      mascota: 'reposo',
      objetivos: ['pasos-reporte'],
      siguiente: { visto: 'pasos' },
      anterior: { olvidar: 'mes' },
    };
  }

  if (senales.correccion) return enCorreccion(senales.correccion);

  const contexto = {
    mes,
    doc,
    destinos,
    sinArreglo: vistos.includes('sin-arreglo'),
    anteriorInicio: { olvidar: 'pasos' },
  };
  return enFlujo({ ...senales, vistos }, contexto);
}
