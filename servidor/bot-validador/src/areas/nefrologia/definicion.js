/* Estructura del reporte del Servicio de Nefrología y Hemodiálisis.

   Vive en el bot porque es él quien lee el Word del área (lector.js) y aplica
   sus reglas (reglas.js): si la estructura viviera también en el sistema, las
   dos copias acabarían diciendo cosas distintas. El sistema la reexporta
   (frontend/src/app/datos/formatos/nefrologia.js).

   Levantada del informe real del área («hemodialisis - ESTADISTICA HD
   2026.doc», convertido a .docx: el bot no lee el formato antiguo). A
   diferencia de las demás áreas, el servicio no llena un reporte nuevo cada
   mes: lleva UN SOLO cuadro del año entero, con un indicador por fila y un
   mes por columna, y cada mes agrega su columna al mismo documento. El área
   sube ese documento completo cada vez; el bot lee solo la columna del mes
   que se está reportando y dicta las demás sin tocar — igual que Laboratorio
   con la hoja de su libro anual, pero con columnas en vez de hojas.

   El cuadro trae además, entre los meses, columnas de TOTAL ya calculadas por
   el área (I TRIM, II TRIM, I SEM…, TOTAL ANUAL): no son datos del mes, son
   lo que el área declara que suman sus partes. El bot las vuelve a sumar y
   avisa si no cuadran (reglas.js), como hace con cualquier total escrito. */

/* Las columnas del cuadro, en el orden del Word. `mes` ubica una columna de
   datos; `agregado` ubica un total declarado y de qué meses depende. */
export const COLUMNAS = Object.freeze([
  Object.freeze({ tipo: 'mes', mes: 1, etiqueta: 'ENE' }),
  Object.freeze({ tipo: 'mes', mes: 2, etiqueta: 'FEB' }),
  Object.freeze({ tipo: 'mes', mes: 3, etiqueta: 'MAR' }),
  Object.freeze({ tipo: 'agregado', clave: 'trimestre1', etiqueta: 'I TRIM', partes: ['mes1', 'mes2', 'mes3'] }),
  Object.freeze({ tipo: 'mes', mes: 4, etiqueta: 'ABR' }),
  Object.freeze({ tipo: 'mes', mes: 5, etiqueta: 'MAY' }),
  Object.freeze({ tipo: 'mes', mes: 6, etiqueta: 'JUN' }),
  Object.freeze({ tipo: 'agregado', clave: 'trimestre2', etiqueta: 'II TRIM', partes: ['mes4', 'mes5', 'mes6'] }),
  Object.freeze({ tipo: 'agregado', clave: 'semestre1', etiqueta: 'I SEM', partes: ['trimestre1', 'trimestre2'] }),
  Object.freeze({ tipo: 'mes', mes: 7, etiqueta: 'JUL' }),
  Object.freeze({ tipo: 'mes', mes: 8, etiqueta: 'AGO' }),
  Object.freeze({ tipo: 'mes', mes: 9, etiqueta: 'SET' }),
  Object.freeze({ tipo: 'agregado', clave: 'trimestre3', etiqueta: 'III TRIM', partes: ['mes7', 'mes8', 'mes9'] }),
  Object.freeze({ tipo: 'mes', mes: 10, etiqueta: 'OCT' }),
  Object.freeze({ tipo: 'mes', mes: 11, etiqueta: 'NOV' }),
  Object.freeze({ tipo: 'mes', mes: 12, etiqueta: 'DIC' }),
  Object.freeze({ tipo: 'agregado', clave: 'trimestre4', etiqueta: 'IV TRIM', partes: ['mes10', 'mes11', 'mes12'] }),
  Object.freeze({ tipo: 'agregado', clave: 'semestre2', etiqueta: 'II SEM', partes: ['trimestre3', 'trimestre4'] }),
  Object.freeze({ tipo: 'agregado', clave: 'anual', etiqueta: 'TOTAL ANUAL', partes: ['semestre1', 'semestre2'] }),
]);

export const COLUMNA_DEL_MES = new Map(COLUMNAS.filter((c) => c.tipo === 'mes').map((c) => [c.mes, c]));

/* Los indicadores, en el orden de las filas del Word. `rotulo` es como el
   área lo escribe en la primera columna; dos filas pueden compartir rótulo
   (el Word las separa con una columna de subrótulo, «Permanente»/«Temporales»:
   `subrotulo` la distingue y `columnaExtra` dice que su fila tiene una celda
   más al principio, por esa columna). */
export const INDICADORES = Object.freeze([
  Object.freeze({ clave: 'pacientes_atendidos', rotulo: 'PACIENTES ATENDIDOS', nombre: 'Pacientes atendidos' }),
  Object.freeze({ clave: 'nuevos', rotulo: 'NUEVOS', nombre: 'Pacientes nuevos' }),
  Object.freeze({ clave: 'sesiones_2', rotulo: 'ATENDIDOS 2 SESIONES X SEMANA', nombre: 'Atendidos con 2 sesiones por semana' }),
  Object.freeze({ clave: 'sesiones_3', rotulo: 'ATENDIDOS 3 SESIONES X SEMANA', nombre: 'Atendidos con 3 sesiones por semana' }),
  Object.freeze({ clave: 'sesiones_1', rotulo: 'ATENDIDOS 1 SESION X SEMANA', nombre: 'Atendidos con 1 sesión por semana' }),
  Object.freeze({ clave: 'sin_reuso', rotulo: 'PCTS. CON SESIONES SIN REUSO (VIH, HEPATITIS, ETC)', nombre: 'Pacientes con sesiones sin reuso (VIH, hepatitis, etc.)' }),
  Object.freeze({ clave: 'cambio_filtro', rotulo: 'CAMBIO DE FILTRO', nombre: 'Cambios de filtro' }),
  Object.freeze({ clave: 'cvc_temporal', rotulo: 'PAC. CON CVC TEMPORAL', nombre: 'Pacientes con catéter venoso central temporal' }),
  Object.freeze({ clave: 'cvc_tunelizado', rotulo: 'PAC. CON CVC TUNELIZADO ( PERMANENTE )', nombre: 'Pacientes con catéter venoso central tunelizado (permanente)' }),
  Object.freeze({ clave: 'fav', rotulo: 'PAC. CON FISTULA ARTERIO VENOSA (FAV)', nombre: 'Pacientes con fístula arterio-venosa' }),
  Object.freeze({ clave: 'colocacion_cateter', rotulo: 'COLOCACION DE CATETER VENOSO', nombre: 'Colocaciones de catéter venoso' }),
  Object.freeze({ clave: 'cvc_disfuncionantes', rotulo: 'CVC DISFUNCIONANTES', nombre: 'Catéteres venosos centrales disfuncionantes' }),
  Object.freeze({ clave: 'cambio_cvc_permanente', rotulo: 'CAMBIO DE(CVC) CATETER VENOSO CENTRAL', subrotulo: 'PERMANENTE', columnaExtra: true, nombre: 'Cambio de catéter venoso central · permanente' }),
  Object.freeze({ clave: 'cambio_cvc_temporal', rotulo: 'CAMBIO DE(CVC) CATETER VENOSO CENTRAL', subrotulo: 'TEMPORALES', columnaExtra: true, nombre: 'Cambio de catéter venoso central · temporal' }),
  Object.freeze({ clave: 'fistulas_inmaduras', rotulo: 'FISTULAS INMADURAS', nombre: 'Fístulas inmaduras' }),
  Object.freeze({ clave: 'infecciones_cvc', rotulo: 'PACIENTES CON INFECCIONES CVC', nombre: 'Pacientes con infecciones de catéter venoso central' }),
  Object.freeze({ clave: 'infecciones_fav', rotulo: 'PACIENTES CON INFECCIONES FAV', nombre: 'Pacientes con infecciones de fístula arterio-venosa' }),
  Object.freeze({ clave: 'sis', rotulo: 'Nº DE PACIENTES. SIS', nombre: 'Pacientes SIS' }),
  Object.freeze({ clave: 'convenios', rotulo: 'Nº DE PACIENTES CONVENIOS', nombre: 'Pacientes de convenio' }),
  Object.freeze({ clave: 'abandono', rotulo: 'ABANDONO DE TRATAMIENTO', nombre: 'Abandonos de tratamiento' }),
  Object.freeze({ clave: 'hospitalizados', rotulo: 'HOSPITALIZADOS', nombre: 'Hospitalizados' }),
  Object.freeze({ clave: 'fallecidos', rotulo: 'FALLECIDOS', nombre: 'Fallecidos' }),
  Object.freeze({ clave: 'alta_voluntaria', rotulo: 'ALTA VOLUNTARIA', nombre: 'Altas voluntarias' }),
  Object.freeze({ clave: 'atencion_consultorio', rotulo: 'ATENCION DE CONSULTORIO', nombre: 'Atenciones de consultorio' }),
  Object.freeze({ clave: 'alta_medica', rotulo: 'ALTA MEDICA', nombre: 'Altas médicas' }),
  Object.freeze({ clave: 'traslado_extrahospitalario', rotulo: 'TRASLADO EXTRAHOSPITALARIO', nombre: 'Traslados extrahospitalarios' }),
  Object.freeze({ clave: 'transferencias_clinica', rotulo: 'TRANSFERENCIAS A CLINICA (TERCERIZADOS)', nombre: 'Transferencias a clínica (tercerizados)' }),
  Object.freeze({ clave: 'transferencias', rotulo: 'TRANSFERENCIAS', nombre: 'Transferencias' }),
  Object.freeze({ clave: 'total_sesiones', rotulo: 'TOTAL DE SESIONES ATENDIDAS', nombre: 'Total de sesiones atendidas' }),
]);

export const FORMATOS = Object.freeze([
  Object.freeze({
    id: 'f1',
    numero: 1,
    corto: 'Atenciones',
    titulo: 'Atenciones ejecutadas',
    subtitulo: 'Un indicador por fila, un mes por columna: el mismo cuadro que crece cada mes',
    icono: 'sh-drop',
    periodicidad: 'mensual',
  }),
]);

export const CUADROS = FORMATOS;

export const VERSION = 'NEF-W1';

export function formato(id) {
  return FORMATOS.find((f) => f.id === id) ?? null;
}

/* Las casillas del reporte, una por cifra que se digita. Es lo que se
   instala en la base como indicadores del formato
   (`servidor/api/app/herramientas/cargar_catalogo_nefrologia.py`) y la forma
   plana en que el servidor guarda y devuelve las cifras: `f1` y
   `pacientes_atendidos` → indicador `f1.pacientes_atendidos`. */
export function casillas() {
  return INDICADORES.map((i) => ({
    cuadro: 'f1',
    fila: i.clave,
    codigo: `f1.${i.clave}`,
    nombre: i.nombre,
    etiquetas: i.subrotulo ? [i.rotulo, i.subrotulo] : [i.rotulo],
  }));
}

/* Estructura de un reporte sin llenar. Vacío es vacío: un objeto sin claves,
   no lleno de ceros. */
export function datosVacios() {
  return { f1: {} };
}
