/* Estructura de los cuatro formatos del Departamento de Diagnóstico por
   Imágenes.

   Vive en el bot porque es él quien lee el Word del área (lector.js) y aplica
   sus reglas (reglas.js); el sistema la reexporta
   (frontend/src/app/datos/formatos/imagenes.js). Se levantó del oficio de
   junio de 2026 y se cotejó con los nueve de enero a setiembre: los cuadros,
   las columnas y los nombres del personal son los del papel.

   Lo que se descubrió al cotejar, y que da forma al módulo:

   1. En ecografía, la columna EXAM de cada profesional es la suma de sus nueve
      casillas SIS, convenios y pagados (cuadra en junio y julio). Aquí no se
      digita: se calcula, y la EXAM que trae el Word se compara (reglas.js).
   2. En Rayos X, los exámenes por tecnólogo suman los exámenes atendidos, y
      estos son hospitalización + emergencia + consulta externa. Son dos
      cuadros que describen lo mismo: se cruzan.
   3. Mamografía trae una fila de campaña o insolventados sin servicio ni
      financiador, con un rótulo distinto cada mes («CAMPAÑA OFICIO…»,
      «INSOLVENTADO», «CAMPAÑA (SIN DOCUMENTO) PARTICULAR GRATUITO»): suma
      aparte y su rótulo se conserva.
   4. El monto en soles no se puede calcular (no hay tarifa fija por examen):
      se lee. Los totales en soles que el Word escribe no siempre se pueden
      leer («S/.1 16500»), así que solo se avisan.

   Los cuatro formatos son mensuales: el área no registra día a día.

   Para la base, el bot entrega además cuatro cuadros planos (`eco`, `tac`,
   `mam`, `rx`: `plano()`): los totales de cada modalidad por financiador y
   servicio, que es lo que Estadística remite. El detalle por profesional
   viaja en el informe del bot con cada carga, como los procedimientos de
   Centro Quirúrgico. */

export const SERVICIOS = Object.freeze([
  Object.freeze({ clave: 'ce', label: 'Consulta externa', corto: 'C. ext.' }),
  Object.freeze({ clave: 'emerg', label: 'Emergencia', corto: 'Emer.' }),
  Object.freeze({ clave: 'hosp', label: 'Hospitalización', corto: 'Hosp.' }),
]);

export const FINANCIADORES = Object.freeze([
  Object.freeze({ clave: 'sis', label: 'SIS', nombre: 'Seguro Integral de Salud', ayuda: 'Exámenes de pacientes asegurados al Seguro Integral de Salud.' }),
  Object.freeze({ clave: 'convenio', label: 'Convenios', nombre: 'Convenios', ayuda: 'Exámenes cubiertos por una entidad con convenio con el hospital.' }),
  Object.freeze({ clave: 'pagado', label: 'Pagados', nombre: 'Pagados', ayuda: 'Exámenes que el paciente pagó directamente.' }),
]);

/* Cuadros de la hoja de ecografía. Los tres tienen las mismas columnas. */
export const CUADROS_ECO = Object.freeze([
  Object.freeze({ clave: 'examenes', titulo: 'Exámenes ecográficos', ayuda: 'Cuadro principal de la hoja: exámenes ecográficos por médico.' }),
  Object.freeze({ clave: 'biopsias', titulo: 'Biopsias', ayuda: 'Cuadro «Exámenes · Biopsias» del oficio. Se registra aparte de los exámenes ecográficos.' }),
  Object.freeze({ clave: 'oncologicos', titulo: 'Procedimientos oncológicos', ayuda: 'Cuadro de procedimientos oncológicos del oficio, con las mismas columnas que los exámenes.' }),
]);

/* Personal que figura en los oficios. Precarga las filas de un reporte nuevo
   para no reescribir los nombres cada mes; se pueden quitar o añadir. */
export const PERSONAL = Object.freeze({
  medicosEco: Object.freeze(['Dr. Julio Canelo Torres', 'Dra. Rosa Quezada Torres', 'Dr. Golbert Isern Babilonia', 'Dr. Jorge Miguel Sibina Vela']),
  biopsias: Object.freeze(['Dra. Rosa Quezada Torres']),
  oncologicos: Object.freeze(['Dra. Rosa Quezada Torres']),
  lecturaTomografia: Object.freeze(['Dr. Jorge Miguel Sibina Vela', 'Dra. Rosa Quezada Torres']),
  lecturaMamografia: Object.freeze(['Dr. Jorge Miguel Sibina Vela']),
  tecnologosRx: Object.freeze([
    'Jhony Paima Palla',
    'David Gomez Rengifo',
    'Thomas Ramirez Yuimachi',
    'Luis Tuananama Rengifo',
    'Veronica Vega Talexio',
    'Magally Alvarado Mestanza',
    'Azucena Alvan Pinedo',
    'Blandina Gutierrez Sincoma',
  ]),
  /* Así figura en la hoja de Rayos X; en la de ecografía el apellido materno
     es otro. No se unifica sin confirmarlo con el área. */
  lecturaRx: Object.freeze(['Dr. Golbert Isern Rios']),
});

export const FORMATOS = Object.freeze([
  Object.freeze({ id: 'f1', numero: 1, modalidad: 'Ecografía', corto: 'Ecografía', titulo: 'Exámenes ecográficos', subtitulo: 'Por profesional, con biopsias y procedimientos oncológicos', periodicidad: 'mensual', unidad: 'exámenes' }),
  Object.freeze({ id: 'f2', numero: 2, modalidad: 'Tomografía', corto: 'Tomografía', titulo: 'Exámenes tomográficos', subtitulo: 'Por financiamiento, con las tomografías informadas', periodicidad: 'mensual', unidad: 'exámenes' }),
  Object.freeze({ id: 'f3', numero: 3, modalidad: 'Mamografía', corto: 'Mamografía', titulo: 'Exámenes mamográficos', subtitulo: 'Por financiamiento, campaña y lectura e informe', periodicidad: 'mensual', unidad: 'exámenes' }),
  Object.freeze({ id: 'f4', numero: 4, modalidad: 'Rayos X', corto: 'Rayos X', titulo: 'Servicio de Rayos X', subtitulo: 'Por servicio y por tecnólogo, particulares y lectura e informe', periodicidad: 'mensual', unidad: 'exámenes' }),
]);

export const CUADROS = FORMATOS;

export const VERSION = 'DXI-W1';

export function formato(id) {
  return FORMATOS.find((f) => f.id === id) ?? null;
}

/* Matriz vacía de financiamiento por servicio. Vacía es vacía: sin ceros. */
export function matrizVacia() {
  return { sis: {}, convenio: {}, pagado: {} };
}

const filaProfesional = (nombre, id) => ({ id, nombre, pacientes: null, examenes: matrizVacia(), monto: null });
const filaPersona = (nombre, id) => ({ id, nombre, cantidad: null });
const precargar = (nombres, prefijo, crear) => nombres.map((n, i) => crear(n, `${prefijo}-${i + 1}`));

/* Estructura de un reporte sin llenar: el personal precargado y ninguna cifra.
   Una fila con nombre y sin números no afirma nada; una con ceros afirmaría
   que ese profesional no hizo exámenes. */
export function datosVacios() {
  return {
    f1: {
      examenes: precargar(PERSONAL.medicosEco, 'eco', filaProfesional),
      biopsias: precargar(PERSONAL.biopsias, 'bio', filaProfesional),
      oncologicos: precargar(PERSONAL.oncologicos, 'onc', filaProfesional),
    },
    f2: { inoperativo: false, nota: '', pacientes: null, examenes: matrizVacia(), monto: null, informes: precargar(PERSONAL.lecturaTomografia, 'tac', filaPersona) },
    f3: { pacientes: null, examenes: matrizVacia(), campana: null, campanaRotulo: '', monto: null, informes: precargar(PERSONAL.lecturaMamografia, 'mam', filaPersona) },
    f4: { examenes: {}, pacientes: null, placas: null, tecnologos: precargar(PERSONAL.tecnologosRx, 'tec', filaPersona), particulares: null, monto: null, informes: precargar(PERSONAL.lecturaRx, 'lrx', filaPersona) },
  };
}

/* ---------------------------------------------------- la base de datos

   Los cuadros planos que se instalan como indicadores del formato
   (servidor/api/app/herramientas/cargar_catalogo_imagenes.py): por cada
   modalidad, sus exámenes por financiador y servicio, sus pacientes, su monto
   y sus lecturas. `eco.examenes.sis.ce` es un indicador. */
const MATRIZ = FINANCIADORES.flatMap((f) => SERVICIOS.map((s) => ({ fila: `${f.clave}.${s.clave}`, nombre: `${f.label} · ${s.label}` })));

export const CUADROS_BASE = Object.freeze([
  Object.freeze({
    codigo: 'eco', numero: 1, titulo: 'Ecografía', subtitulo: 'Totales de los médicos: exámenes, biopsias y procedimientos oncológicos',
    casillas: CUADROS_ECO.flatMap((c) => [
      ...MATRIZ.map((m) => ({ fila: `${c.clave}.${m.fila}`, nombre: `${c.titulo} · ${m.nombre}` })),
      { fila: `${c.clave}.pacientes`, nombre: `${c.titulo} · pacientes` },
      { fila: `${c.clave}.monto`, nombre: `${c.titulo} · monto en soles`, decimal: true },
    ]),
  }),
  Object.freeze({
    codigo: 'tac', numero: 2, titulo: 'Tomografía', subtitulo: 'Exámenes por financiador y servicio, pacientes, monto e informes',
    casillas: [
      ...MATRIZ.map((m) => ({ fila: `examenes.${m.fila}`, nombre: `Exámenes · ${m.nombre}` })),
      { fila: 'pacientes', nombre: 'Pacientes' },
      { fila: 'monto', nombre: 'Monto en soles', decimal: true },
      { fila: 'informes', nombre: 'Tomografías informadas' },
      { fila: 'inoperativo', nombre: 'Tomógrafo inoperativo (1 = sí)' },
    ],
  }),
  Object.freeze({
    codigo: 'mam', numero: 3, titulo: 'Mamografía', subtitulo: 'Exámenes por financiador y servicio, campaña, pacientes, monto e informes',
    casillas: [
      ...MATRIZ.map((m) => ({ fila: `examenes.${m.fila}`, nombre: `Exámenes · ${m.nombre}` })),
      { fila: 'campana', nombre: 'Campaña o insolventados' },
      { fila: 'pacientes', nombre: 'Pacientes' },
      { fila: 'monto', nombre: 'Monto en soles', decimal: true },
      { fila: 'informes', nombre: 'Mamografías informadas' },
    ],
  }),
  Object.freeze({
    codigo: 'rx', numero: 4, titulo: 'Rayos X', subtitulo: 'Exámenes por servicio, pacientes, placas, particulares, monto e informes',
    casillas: [
      ...SERVICIOS.map((s) => ({ fila: `examenes.${s.clave}`, nombre: `Exámenes · ${s.label}` })),
      { fila: 'pacientes', nombre: 'Pacientes' },
      { fila: 'placas', nombre: 'Placas radiográficas' },
      { fila: 'tecnologos', nombre: 'Exámenes por tecnólogo (suma)' },
      { fila: 'particulares', nombre: 'Pacientes particulares' },
      { fila: 'monto', nombre: 'Monto en soles', decimal: true },
      { fila: 'informes', nombre: 'Radiografías informadas' },
    ],
  }),
]);

export function casillas() {
  return CUADROS_BASE.flatMap((c) =>
    c.casillas.map((x) => ({ cuadro: c.codigo, fila: x.fila, codigo: `${c.codigo}.${x.fila}`, nombre: x.nombre, decimal: Boolean(x.decimal), etiquetas: [c.titulo, x.nombre] })),
  );
}
