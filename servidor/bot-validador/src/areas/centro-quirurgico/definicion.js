/* Centro Quirúrgico: definición de su reporte mensual, tomada del Excel que
   el área llena (los ocho meses de enero a agosto de 2026, revisados el
   20/10/2026).

   EL LIBRO
   Un Excel por mes, ACUMULADO: cada hoja trae una columna por mes del año
   (ENE…DIC, con trimestres y semestres entre ellas) llena hasta el mes del
   libro. El bot lee solo la columna del mes que se reporta. Los meses
   anteriores de un libro a veces se corrigen en el del mes siguiente (la
   oncología mayor de enero dice 20 en el libro de enero y 12 en el de junio):
   cada mes vale por su propio libro.

   Trae además hojas que no se leen: CX PROGRAMADAS y CX EMERGENCIA (el
   registro paciente por paciente), TOP TEEN y Consolidado (se calculan aquí),
   IQMayores e IQMenores (ocultas), INDICADORES FORMULA, Hoja1, Hoja 2, BU.

   LO QUE SE LEE (cinco cuadros, todos MENSUALES: una cifra por fila)
     resumen       hoja RESUMEN · la columna del mes, programada y emergencia
     indicadores   hoja CUADRO DE INDICADORES (en enero, INDICADORES) · tabla izquierda
     suspendidas   hoja SUSPENDIDAS · una cifra por causa (columna NÚMERO)
     mayor         hoja CIRUGIA MAYOR · el total de cada especialidad
     menor         hoja CIRUGIA MENOR · el total de cada especialidad

   LO QUE SE CALCULA (no se lee ni se guarda; calculos.js)
     Top Ten, el consolidado por especialidad, la tabla derecha del cuadro de
     indicadores y el resumen anual (consolidado.js).

   LOS PROCEDIMIENTOS
   La lista de procedimientos cambia casi cada mes (de enero a agosto aparecen
   y desaparecen más de 90 rótulos: nuevos, renombres, errores de tipeo). La
   base cataloga lo estable: el total de cada especialidad. El detalle viaja
   con el reporte en `datos.procedimientos` (decisión del 20/10/2026, como los
   cuadros secundarios de Lavandería): un procedimiento nuevo nunca impide
   cargar el Excel.

   CONTRATO DE LOS DATOS (el de Laboratorio)
     datos[cuadro][fila] = número | null
     datos.procedimientos[mayor|menor][especialidad] = [{ rotulo, valor, fila }]
     datos.declarados[cuadro][fila | _total] = lo que el Excel trae escrito como total

   `ocasional`: una fila que solo figura algunos meses. Si el mes no la trae
   no se informa como ausente. */

/* Cómo se escribe cada mes en las cabeceras: abreviado en las hojas por
   especialidad y en el cuadro de indicadores, completo en el RESUMEN. */
export const MESES_CORTOS = Object.freeze(['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC']);
export const MESES_LARGOS = Object.freeze(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']);

/* Las hojas que se leen, con los nombres con que figuraron (se comparan sin
   tildes, mayúsculas ni espacios de más: los reales traen espacios al final). */
export const HOJAS = Object.freeze({
  resumen: Object.freeze(['RESUMEN']),
  indicadores: Object.freeze(['CUADRO DE INDICADORES', 'INDICADORES']),
  suspendidas: Object.freeze(['SUSPENDIDAS']),
  mayor: Object.freeze(['CIRUGIA MAYOR']),
  menor: Object.freeze(['CIRUGIA MENOR']),
});

/* Una fila con su clave estable, el rótulo con que la escribe el área y los
   que tuvo otros meses. */
const fila = (clave, rotulo, { alias = [], ocasional = false, unidad, decimal = false, corto } = {}) =>
  Object.freeze({ clave, rotulo, alias: Object.freeze(alias), ocasional, unidad, decimal, corto: corto ?? rotulo });

/* ----------------------------------------------------------------- resumen */

/* Las dos columnas del mes en el RESUMEN. */
export const TIPOS = Object.freeze([
  Object.freeze({ clave: 'programada', label: 'Programada', corto: 'Prog.' }),
  Object.freeze({ clave: 'emergencia', label: 'Emergencia', corto: 'Emerg.' }),
]);

/* Las horas son decimales: el RESUMEN suma la duración de cada cirugía del
   registro paciente por paciente (CX PROGRAMADAS, CX EMERGENCIA). */
export const CONCEPTOS_RESUMEN = Object.freeze([
  fila('mayores', 'CIRUGIAS MAYORES', { unidad: 'intervenciones', corto: 'Cirugías mayores' }),
  fila('menores', 'CIRUGIAS MENORES', { unidad: 'intervenciones', corto: 'Cirugías menores' }),
  fila('horas_programadas', 'HORAS PROGRAMADAS', { unidad: 'horas', decimal: true, corto: 'Horas programadas' }),
  fila('horas_efectivas', 'HORAS EFECTIVAS', { unidad: 'horas', decimal: true, corto: 'Horas efectivas' }),
  fila('horas_acto', 'HORAS ACTO QUIRURGICO', { unidad: 'horas', decimal: true, corto: 'Horas de acto quirúrgico' }),
  fila('suspendidas', 'CIRUGIAS SUSPENDIDAS', { unidad: 'intervenciones', corto: 'Cirugías suspendidas' }),
]);

/* ------------------------------------------------------------- indicadores */

/* La tabla izquierda del CUADRO DE INDICADORES: los insumos. La derecha (los
   indicadores mismos) se calcula con estos (calculos.js). */
export const INSUMOS_INDICADORES = Object.freeze([
  fila('salas_utilizadas', 'NO. SALAS OPERACIONES UTILIZADAS', { unidad: 'salas', corto: 'Salas de operaciones utilizadas' }),
  fila('salas_emergencia', 'NO. SALAS OPERACIONES EMERGENCIA', { unidad: 'salas', corto: 'Salas de emergencia' }),
  fila('salas_programadas', 'NO. SALAS OPERACIONES PROGRAMADAS', { unidad: 'salas', corto: 'Salas de cirugía programada' }),
  fila('intervenciones_emergencia', 'INTERVENCIONES DE EMERGENCIA', { unidad: 'intervenciones', corto: 'Intervenciones de emergencia' }),
  fila('intervenciones_programadas', 'NO. INTERVENCIONES QUIRURGICAS PROGRAMADAS', { unidad: 'intervenciones', corto: 'Intervenciones programadas' }),
  fila('intervenciones_suspendidas', 'NO. INTERVENCIONES QUIRURGICAS SUSPENDIDAS', { unidad: 'intervenciones', corto: 'Intervenciones suspendidas' }),
  fila('intervenciones_realizadas', 'NO. INTERVENCIONES QUIRURGICAS REALIZADAS', { unidad: 'intervenciones', corto: 'Intervenciones realizadas' }),
  fila('horas_efectivas', 'NO. HORAS QUIRURGICAS EFECTIVAS', { unidad: 'horas', decimal: true, corto: 'Horas quirúrgicas efectivas' }),
  fila('horas_programadas', 'NO. HORAS QUIRURGICAS PROGRAMADOS', { alias: ['NO. HORAS QUIRURGICAS PROGRAMADAS'], unidad: 'horas', decimal: true, corto: 'Horas quirúrgicas programadas' }),
  fila('reintervenidos', 'NO. PACIENTES REINTERVENIDOS', { unidad: 'pacientes', corto: 'Pacientes reintervenidos' }),
  fila('defunciones', 'NO. DEFUNCIONES EN CENTRO QUIRURGICO', { unidad: 'defunciones', corto: 'Defunciones en centro quirúrgico' }),
  /* Solo la trae la hoja de enero; los demás meses la tasa de la tabla
     derecha no tiene de dónde salir. */
  fila('encefalopatia', 'NO. PACIENTES CON ENCEFALOPATIA HIPOXICA POST QUIRURGICO', { ocasional: true, unidad: 'pacientes', corto: 'Pacientes con encefalopatía hipóxica' }),
]);

/* ------------------------------------------------------------- suspendidas */

/* Las causas de suspensión de las cirugías electivas. Las de enero se
   renombraron en febrero; las que no tienen un equivalente claro quedan como
   causas propias, ocasionales, en vez de sumarse en silencio a otra. */
export const CAUSAS = Object.freeze([
  fila('sala_ocupada', 'SALA OCUPADA POR EMERGENCIAS', { corto: 'Sala ocupada por emergencias' }),
  fila('falta_tiempo', 'FALTA TIEMPO QUIRURGICO', { alias: ['FALTA DE TIEMPO QUIRURGICO'], corto: 'Falta de tiempo quirúrgico' }),
  fila('ingesta', 'INGESTA DE ALIMENTOS', { corto: 'Ingesta de alimentos' }),
  fila('cambio_plan', 'CAMBIO PLAN QUIRURGICO', { alias: ['CAMBIO DE PLAN QUIRURGICO'], corto: 'Cambio de plan quirúrgico' }),
  fila('por_cirujano', 'SUSPENDIDO POR CIRUJANO', { corto: 'Suspendido por el cirujano' }),
  fila('estudios_incompletos', 'ESTUDIOS DE LABORATORIO INCOMPLETOS', {
    alias: ['ESTUDIOS DE LALABORATORIO INCOMPLETOS', 'ESTUDIOS PARACLINICOS INCOMPLETOS'],
    corto: 'Estudios de laboratorio incompletos',
  }),
  fila('hemoderivados', 'FALTA DE HEMODERIVADOS', { corto: 'Falta de hemoderivados' }),
  fila('instrumental', 'FALTA DE INSTRUMENTAL QUIRURGICO', { corto: 'Falta de instrumental quirúrgico' }),
  fila('mala_preparacion', 'MALA PREPARACION DEL PACIENTE', { corto: 'Mala preparación del paciente' }),
  fila('presion_arterial', 'PRESION ARTERIAL NO CONTROLADA', { alias: ['PRESION ARTERIAL NO CONTOROLADA'], corto: 'Presión arterial no controlada' }),
  fila('infeccion_respiratoria', 'INFECCION RESPIRATORIA', { corto: 'Infección respiratoria' }),
  fila('ausencia_paciente', 'AUSENCIA DEL PACIENTE', { corto: 'Ausencia del paciente' }),
  fila('falta_insumos', 'FALTA DE INSUMOS', { corto: 'Falta de insumos' }),
  fila('falta_cama_uci', 'FALTA DE CAMA UCI', { corto: 'Falta de cama UCI' }),
  fila('glucosa', 'GLUCOSA NO CONTROLADA', { corto: 'Glucosa no controlada' }),
  fila('riesgo_cardiovascular', 'RIESGO CARDIOVASCULAR DIFERIDO', { corto: 'Riesgo cardiovascular diferido' }),
  /* El rótulo de «Otros» cambia con lo que el área anota entre paréntesis:
     se reconoce por empezar con OTROS (lector.js). */
  fila('otros', 'OTROS', { corto: 'Otros (paciente o familiar se rehúsa…)' }),
  /* Solo en enero, antes de que el área cambiara su lista. */
  fila('alteraciones_cardiovasculares', 'ALTERACIONES CARDIOVASCULARES', { ocasional: true, corto: 'Alteraciones cardiovasculares' }),
  fila('falta_cirujano', 'FALTA CIRUJANO PARA EL TURNO', { alias: ['FALTA CIRUJANO PARA EL TUNRO'], ocasional: true, corto: 'Falta de cirujano para el turno' }),
  fila('falta_enfermeria', 'FALTA PERSONAL DE ENFERMERIA', { ocasional: true, corto: 'Falta de personal de enfermería' }),
]);

/* ---------------------------------------------------------- especialidades */

/* Una especialidad: su clave, su nombre y cómo la escribe cada hoja. `en` dice
   en qué hojas existe: Nefrología solo hace cirugía menor. */
const esp = (clave, label, rotulos, en = ['mayor', 'menor']) => Object.freeze({ clave, label, rotulos: Object.freeze(rotulos), en: Object.freeze(en) });

export const ESPECIALIDADES = Object.freeze([
  esp('cirugia_general', 'Cirugía general', ['CIRUGIA GENERAL']),
  esp('ginecologia', 'Ginecología', ['GINECOLOGIA']),
  esp('obstetricia', 'Obstetricia', ['OBSTETRICIA']),
  esp('traumatologia', 'Traumatología y ortopedia', ['TRAUMATOLOGIA Y ORTOP.', 'TRAUMATOLOGIA Y ORTOPEDIA', 'TRAUMATOLOGIA Y ORT.']),
  esp('neurocirugia', 'Neurocirugía', ['NEUROCIRUGIA']),
  esp('urologia', 'Urología', ['UROLOGIA']),
  esp('oftalmologia', 'Oftalmología', ['OFTALMOLOGIA']),
  esp('otorrinolaringologia', 'Otorrinolaringología', ['OTORRINOLARINGOLOGIA']),
  esp('oncologia', 'Oncología', ['ONCOLOGIA']),
  esp('quemados', 'Unidad de quemados', ['QUEMADOS', 'UNIDAD QUEMADOS']),
  esp('cirugia_plastica', 'Cirugía plástica', ['CIRUGIA PLASTICA']),
  esp('cirugia_torax', 'Cirugía de tórax y cardiovascular', ['CIRUGIA TORAX', 'CIRUGIA DE TORAX', 'CIRUGIA TORAX Y CV', 'CIRUGIA CARDIO-TORAX']),
  esp('cabeza_cuello', 'Cirugía de cabeza y cuello', ['CIRUGIA CABEZA Y CUELLO', 'CIRUGIA CABEZAY CUELLO', 'CIRUGIA DE CABEZA Y CUELLO']),
  esp('gastroenterologia', 'Gastroenterología', ['GASTROENTEROLOGIA']),
  esp('cirugia_pediatrica', 'Cirugía pediátrica', ['CIRUGIA PEDIATRICA']),
  esp('nefrologia', 'Nefrología', ['NEFROLOGIA'], ['menor']),
]);

/* Procedimientos que no son un procedimiento: cuentan cirugías con dos
   procedimientos o dos especialidades, o lo que no tiene nombre. Se leen
   (están en la suma de la especialidad) pero no compiten en el Top Ten. */
export const PROCEDIMIENTOS_GENERICOS = Object.freeze(['OTRAS', 'OTROS', '2 PROCEDIMIENTOS X CIRUGIA', 'DOS O MAS ESPECIALIDADES', '2 O MAS ESPECIALIDADES']);

/* ---------------------------------------------------------------- cuadros */

/* En el orden del Excel del área. `numero` es el lugar del cuadro entre los
   ocho reportes de Centro Quirúrgico (los otros tres se calculan). */
export const CUADROS = Object.freeze([
  Object.freeze({
    id: 'resumen',
    numero: 1,
    titulo: 'Producción del mes',
    corto: 'Resumen',
    hoja: 'RESUMEN',
    unidad: 'intervenciones',
    filas: Object.freeze(
      CONCEPTOS_RESUMEN.flatMap((c) =>
        TIPOS.map((t) =>
          Object.freeze({ clave: `${c.clave}.${t.clave}`, concepto: c.clave, tipo: t.clave, rotulo: `${c.corto} · ${t.label.toLowerCase()}`, unidad: c.unidad, decimal: c.decimal }),
        ),
      ),
    ),
  }),
  Object.freeze({
    id: 'indicadores',
    numero: 4,
    titulo: 'Cuadro de indicadores',
    corto: 'Indicadores',
    hoja: 'CUADRO DE INDICADORES',
    unidad: 'intervenciones',
    filas: Object.freeze(INSUMOS_INDICADORES.map((f) => Object.freeze({ clave: f.clave, rotulo: f.corto, unidad: f.unidad, decimal: f.decimal, ocasional: f.ocasional }))),
  }),
  Object.freeze({
    id: 'menor',
    numero: 6,
    titulo: 'Cirugía menor',
    corto: 'Cirugía menor',
    hoja: 'CIRUGIA MENOR',
    unidad: 'intervenciones',
    filas: Object.freeze(ESPECIALIDADES.filter((e) => e.en.includes('menor')).map((e) => Object.freeze({ clave: e.clave, rotulo: e.label, unidad: 'intervenciones' }))),
  }),
  Object.freeze({
    id: 'mayor',
    numero: 7,
    titulo: 'Cirugía mayor',
    corto: 'Cirugía mayor',
    hoja: 'CIRUGIA MAYOR',
    unidad: 'intervenciones',
    filas: Object.freeze(ESPECIALIDADES.filter((e) => e.en.includes('mayor')).map((e) => Object.freeze({ clave: e.clave, rotulo: e.label, unidad: 'intervenciones' }))),
  }),
  Object.freeze({
    id: 'suspendidas',
    numero: 8,
    titulo: 'Causas de suspensión',
    corto: 'Suspendidas',
    hoja: 'SUSPENDIDAS',
    unidad: 'intervenciones',
    filas: Object.freeze(CAUSAS.map((f) => Object.freeze({ clave: f.clave, rotulo: f.corto, unidad: 'intervenciones', ocasional: f.ocasional }))),
  }),
]);

/* Normalizar texto para comparar: sin tildes, en mayúsculas, sin espacios de
   más. La misma función que los demás lectores del bot. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cuadro(id) {
  return CUADROS.find((c) => c.id === id) ?? null;
}

export function filaDe(idCuadro, clave) {
  return cuadro(idCuadro)?.filas.find((f) => f.clave === clave) ?? null;
}

export function especialidad(clave) {
  return ESPECIALIDADES.find((e) => e.clave === clave) ?? null;
}

/* Un reporte recién abierto no tiene ninguna casilla: la ausencia es el dato. */
export function datosVacios() {
  return {};
}

/* Clave de una casilla, para los ilegibles, el origen y los avisos. */
export function claveCasilla(idCuadro, clave) {
  return `${idCuadro}|${clave}`;
}
