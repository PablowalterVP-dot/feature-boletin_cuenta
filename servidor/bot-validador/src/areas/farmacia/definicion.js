/* Estructura del reporte del Departamento de Farmacia.

   Vive en el bot porque es él quien lee el Word del área (lector.js) y aplica
   sus reglas (reglas.js): si la estructura viviera también en el sistema, las
   dos copias acabarían diciendo cosas distintas. El sistema la reexporta
   (frontend/src/app/datos/formatos/farmacia.js).

   Levantada del informe mensual de enero de 2026 (área de Control y Archivo,
   `01_INFORME_MES_DE_ENERO_2026.docx`) y de `Documentacion_Modulo_Farmacia_HRL`.
   Lo que el informe no deja claro se marca como pendiente en lugar de
   adivinarse:

   1. El informe es un resumen de **atenciones por tipo de financiamiento**:
      SIS (por servicio), convenios (por servicio), programas, boletas de venta
      y tres conceptos que en enero valieron cero (crédito personal, Defensa
      Nacional e insolvencias). Los totales del papel se digitaban a mano; aquí
      se calculan, y por eso no pueden quedar mal sumados.

   2. Sala de Operaciones y Consultorios externos van en **una sola tabla** del
      Word, con cuatro filas **sin rótulo** que comparten las dos matrices.
      Hasta confirmarlo con el área se llaman «Fila 1» a «Fila 4» y lo dicen,
      como Lavandería con sus tarifas.

   3. La introducción anuncia «Metas alcanzadas» y «Convenios y Créditos
      Personales», que no aparecen como datos (quizá estén en los gráficos
      incrustados). El Formato 4 queda reservado y sin casillas hasta saber qué
      contienen: inventarle campos sería peor que dejarlo vacío.

   4. El periodo no se escribe: sale del reporte abierto. El original decía
      «ENERO 2024» en un informe de enero de 2026, y el sistema no deja que eso
      vuelva a pasar.

   Los cuatro formatos son mensuales: el área no registra día a día. */

/* Componentes de las atenciones SIS, en el orden del informe. `diresa` dice
   a qué columna del consolidado de servicios intermedios va cada uno. */
export const COMPONENTES_SIS = Object.freeze([
  Object.freeze({ clave: 'hosp', label: 'Hospitalización', diresa: 'hosp', ayuda: 'Atenciones SIS de pacientes hospitalizados.' }),
  Object.freeze({ clave: 'emerg', label: 'Emergencia', diresa: 'emerg', ayuda: 'Atenciones SIS de pacientes de emergencia.' }),
  Object.freeze({ clave: 'ce', label: 'Consulta externa', diresa: 'ce', ayuda: 'Atenciones SIS de consulta externa. Debe coincidir con las consultas del Formato 3.' }),
  /* El Word la parte en «Const. Ext» y «Hospitaliza»; el bot suma las dos y
     lo dice (en enero, 718 + 0). */
  Object.freeze({ clave: 'hemodialisis', label: 'Hemodiálisis', diresa: null, ayuda: 'Atenciones SIS del programa de hemodiálisis. En el Word viene partida en consulta externa y hospitalización; aquí va la suma.' }),
  Object.freeze({ clave: 'oncologia', label: 'Oncología', diresa: null, ayuda: 'Atenciones SIS de pacientes oncológicos.' }),
]);

export const COMPONENTES_CONVENIO = Object.freeze([
  Object.freeze({ clave: 'emerg', label: 'Emergencia', ayuda: 'Atenciones de pacientes de emergencia cubiertas por una entidad con convenio.' }),
  Object.freeze({ clave: 'hosp', label: 'Hospitalizados', ayuda: 'Atenciones de pacientes hospitalizados cubiertas por convenio.' }),
  Object.freeze({ clave: 'consultorio', label: 'Consultorio', ayuda: 'Atenciones de consultorio externo cubiertas por convenio. Debe coincidir con los convenios del Formato 3.' }),
]);

/* Los demás financiadores. Crédito personal, Defensa Nacional e insolvencias
   valieron cero en enero, pero el informe los lista: un cero escrito es un
   dato, una casilla vacía no. */
export const OTROS_FINANCIADORES = Object.freeze([
  Object.freeze({ clave: 'programas', label: 'Programas', ayuda: 'Atenciones de programas estratégicos o presupuestales, que no pasan por SIS ni por convenio.' }),
  Object.freeze({ clave: 'boletas', label: 'Boletas de venta', ayuda: 'Atenciones pagadas directamente por el paciente, con boleta de venta.' }),
  Object.freeze({ clave: 'credito', label: 'Crédito personal', ayuda: 'Atenciones entregadas a crédito al paciente.' }),
  Object.freeze({ clave: 'defensa', label: 'Defensa Nacional', ayuda: 'Atenciones a personal cubierto por el convenio de Defensa Nacional.' }),
  Object.freeze({ clave: 'insolvencias', label: 'Insolvencias', ayuda: 'Atenciones exoneradas por insolvencia económica del paciente, con informe de Servicio Social.' }),
]);

/* Columnas de la matriz de Sala de Operaciones, con el rótulo abreviado del
   informe. El significado exacto de MATER está por confirmar. */
export const SERVICIOS_SOP = Object.freeze([
  Object.freeze({ clave: 'mater', label: 'MATER', nombre: 'Maternidad (por confirmar)', ayuda: 'Rótulo «MATER» del informe. Su significado exacto está por confirmar con el área: puede ser Maternidad u Obstetricia.' }),
  Object.freeze({ clave: 'ginec', label: 'GINEC', nombre: 'Ginecología', ayuda: 'Rótulo «GINEC» del informe: Ginecología.' }),
  Object.freeze({ clave: 'ciru', label: 'CIRU', nombre: 'Cirugía', ayuda: 'Rótulo «CIRU» del informe: Cirugía.' }),
  Object.freeze({ clave: 'medi', label: 'MEDI', nombre: 'Medicina', ayuda: 'Rótulo «MEDI» del informe: Medicina.' }),
  Object.freeze({ clave: 'pedia', label: 'PEDIA', nombre: 'Pediatría', ayuda: 'Rótulo «PEDIA» del informe: Pediatría.' }),
]);

/* Las cuatro filas sin rótulo de las matrices de Sala de Operaciones y de
   Consultorios externos. Se sustituyen por su nombre cuando el área lo diga. */
const ACLARACION_FILA = 'El informe original no rotula esta fila. Qué representa está por confirmar con el área de Farmacia.';

export const FILAS = Object.freeze(
  [1, 2, 3, 4].map((n) => Object.freeze({ clave: `fila${n}`, label: `Fila ${n}`, aclaracion: ACLARACION_FILA })),
);

export const FORMATOS = Object.freeze([
  Object.freeze({
    id: 'f1',
    numero: 1,
    corto: 'Atenciones',
    titulo: 'Atenciones del mes',
    subtitulo: 'Por tipo de financiamiento: SIS, convenios, programas, boletas y otros',
    icono: 'sh-pill',
    periodicidad: 'mensual',
  }),
  Object.freeze({
    id: 'f2',
    numero: 2,
    corto: 'Sala de Operaciones',
    titulo: 'Sala de Operaciones',
    subtitulo: 'Atenciones a hospitalizados por servicio, más convenios',
    icono: 'sh-scalpel',
    periodicidad: 'mensual',
  }),
  Object.freeze({
    id: 'f3',
    numero: 3,
    corto: 'Consultorios externos',
    titulo: 'Consultorios externos',
    subtitulo: 'Consultas SIS y convenios',
    icono: 'sh-people',
    periodicidad: 'mensual',
  }),
  Object.freeze({
    id: 'f4',
    numero: 4,
    corto: 'Metas y convenios',
    titulo: 'Metas y convenios',
    subtitulo: 'Pendiente de definir con el área',
    icono: 'sh-doc',
    periodicidad: 'mensual',
    pendiente: true,
  }),
]);

/* Los formatos que llevan cifras: el Formato 4 no tiene casillas todavía. */
export const CUADROS = Object.freeze(FORMATOS.filter((f) => !f.pendiente));

/* Versión de la lectura del Word. Si el área cambia la estructura de su
   informe, se sube y el lector dice qué no encontró. */
export const VERSION = 'FAR-W1';

export function formato(id) {
  return FORMATOS.find((f) => f.id === id) ?? null;
}

/* Las casillas del reporte, una por cifra que se digita (los totales no: se
   calculan). Es lo que se instala en la base como indicadores del formato
   (`servidor/api/app/herramientas/cargar_catalogo_farmacia.py`) y la forma
   plana en que el servidor guarda y devuelve las cifras: `f1` y
   `sis.hosp` → indicador `f1.sis.hosp`. `etiquetas` es el rótulo del Word
   con que el bot encuentra la cifra. */
export function casillas() {
  const lista = [];
  const agregar = (cuadro, fila, nombre, etiquetas) => lista.push({ cuadro, fila, codigo: `${cuadro}.${fila}`, nombre, etiquetas });
  for (const c of COMPONENTES_SIS) agregar('f1', `sis.${c.clave}`, `SIS · ${c.label}`, [c.label]);
  for (const c of COMPONENTES_CONVENIO) agregar('f1', `convenio.${c.clave}`, `Convenios · ${c.label}`, ['Convenios', c.label]);
  for (const o of OTROS_FINANCIADORES) agregar('f1', `otros.${o.clave}`, o.label, [o.label]);
  for (const f of FILAS) {
    for (const s of SERVICIOS_SOP) agregar('f2', `hospitalizados.${f.clave}.${s.clave}`, `Sala de Operaciones · ${f.label} · ${s.label}`, ['FARMACIA SALA DE OPERACIONES', s.label]);
    agregar('f2', `convenios.${f.clave}`, `Sala de Operaciones · ${f.label} · Convenios`, ['FARMACIA SALA DE OPERACIONES', 'CONVENIOS']);
  }
  for (const f of FILAS) {
    agregar('f3', `consultas.${f.clave}`, `Consultorios externos · ${f.label} · Consultas`, ['FARMACIA CONSULTORIOS EXTERNOS', 'CONSULTAS EXTERNAS']);
    agregar('f3', `convenios.${f.clave}`, `Consultorios externos · ${f.label} · Convenios`, ['FARMACIA CONSULTORIOS EXTERNOS', 'CONVENIOS']);
  }
  return lista;
}

/* Estructura de un reporte sin llenar. Vacío es vacío: objetos sin claves, no
   llenos de ceros. Un cero afirma que se contó y no hubo atenciones; una
   casilla vacía solo dice que nadie la ha llenado. */
export function datosVacios() {
  return {
    f1: { sis: {}, convenio: {}, otros: {} },
    f2: { hospitalizados: {}, convenios: {} },
    f3: { consultas: {}, convenios: {} },
  };
}
