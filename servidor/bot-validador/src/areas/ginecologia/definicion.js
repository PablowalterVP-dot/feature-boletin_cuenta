/* Estructura del reporte del Departamento de Gineco-Obstetricia.

   Vive en el bot porque es él quien lee el Excel del área (lector.js) y
   aplica sus reglas (reglas.js): si la estructura viviera también en el
   sistema, las dos copias acabarían diciendo cosas distintas. El sistema la
   reexporta (frontend/src/app/datos/formatos/ginecologia.js).

   Levantada del Excel real del área («EBVI_Consolidado_Mes_*_2026.xlsx»,
   «EBVI»: Eventos Bajo Vigilancia Institucional). A diferencia de Nefrología
   o Laboratorio, el área SÍ sube un Excel nuevo cada mes (no un libro
   acumulado): cada mes es su propio archivo, con su propia hoja.

   Dos cuadros, los dos con la misma forma — un grupo en filas, unas
   columnas de cifras, y una fila TOTAL que el área ya trae sumada (y que el
   bot vuelve a sumar, como con cualquier otro total escrito):

     f1  Controles prenatales, por grupo de edad de la gestante (8 filas)
     f2  Partos, cesáreas y nacidos, por tipo de parto (4 filas)

   El Excel real solo trae f2 desde setiembre de 2026: de enero a agosto el
   área reportó únicamente f1. No se rellena con ceros lo que el área no
   reportó (dominio/formato): esos meses quedan con f2 incompleto, un
   hallazgo real, no un defecto del lector. */

export const EDADES = Object.freeze([
  Object.freeze({ clave: 'edad_10_14', rotulo: '10 A 14 AÑOS' }),
  Object.freeze({ clave: 'edad_15_19', rotulo: '15 A 19 AÑOS' }),
  Object.freeze({ clave: 'edad_20_24', rotulo: '20 A 24 AÑOS' }),
  Object.freeze({ clave: 'edad_25_29', rotulo: '25 A 29 AÑOS' }),
  Object.freeze({ clave: 'edad_30_34', rotulo: '30 A 34 AÑOS' }),
  Object.freeze({ clave: 'edad_35_39', rotulo: '35 A 39 AÑOS' }),
  Object.freeze({ clave: 'edad_40_44', rotulo: '40 A 44 AÑOS' }),
  Object.freeze({ clave: 'edad_45_49', rotulo: '45 A 49 AÑOS' }),
]);

export const COLUMNAS_F1 = Object.freeze([
  Object.freeze({ clave: 'controles_prenatales', rotulo: 'CONTROLES PRENATALES REALIZADOS', nombre: 'Controles prenatales realizados' }),
  Object.freeze({
    clave: 'partos_1_control',
    rotulo: 'PARTOS DE GESTANTES QUE HAN RECIBIDO POR LO MENOS 01 CONTROL PRENATAL',
    nombre: 'Partos de gestantes con al menos 1 control prenatal',
  }),
  Object.freeze({
    clave: 'partos_6_controles',
    rotulo: 'PARTOS DE GESTANTES QUE HAN RECIBIDO POR LO MENOS 6 CONTROLES PRENATALES',
    nombre: 'Partos de gestantes con al menos 6 controles prenatales',
  }),
  Object.freeze({
    clave: 'partos_1er_trimestre',
    rotulo: 'PARTOS EN GESTANTES QUE HAN RECIBIDO LA PRIMERA CONSULTA PRENATAL EN EL PRIMER TRIMESTRE DE EMBARAZO',
    nombre: 'Partos con primera consulta prenatal en el primer trimestre',
  }),
]);

export const TIPOS_PARTO = Object.freeze([
  Object.freeze({ clave: 'vaginal_sin_complicaciones', rotulo: 'PARTO VAGINAL SIN COMPLICACIONES', nombre: 'Parto vaginal sin complicaciones' }),
  Object.freeze({ clave: 'vaginal_con_complicaciones', rotulo: 'PARTO VAGINAL CON COMPLICACIONES', nombre: 'Parto vaginal con complicaciones' }),
  Object.freeze({ clave: 'cesarea_sin_complicaciones', rotulo: 'PARTO POR CESAREA SIN COMPLICACIONES', nombre: 'Parto por cesárea sin complicaciones' }),
  Object.freeze({ clave: 'cesarea_con_complicaciones', rotulo: 'PARTO POR CESAREA CON COMPLICACIONES', nombre: 'Parto por cesárea con complicaciones' }),
]);

export const COLUMNAS_F2 = Object.freeze([
  Object.freeze({ clave: 'total_partos', rotulo: 'TOTAL DE PARTOS', nombre: 'Total de partos' }),
  Object.freeze({ clave: 'total_nacimientos', rotulo: 'TOTAL DE NACIMIENTOS VIVOS + MUERTOS', nombre: 'Total de nacimientos (vivos más muertos)' }),
  Object.freeze({ clave: 'nacidos_vivos', rotulo: 'NACIDOS VIVOS', nombre: 'Nacidos vivos' }),
  Object.freeze({ clave: 'nacidos_muertos', rotulo: 'NACIDOS MUERTOS', nombre: 'Nacidos muertos' }),
]);

export const FORMATOS = Object.freeze([
  Object.freeze({
    id: 'f1',
    numero: 1,
    corto: 'Controles prenatales',
    titulo: 'Controles prenatales',
    subtitulo: 'Por grupo de edad de la gestante',
    icono: 'sh-baby',
    periodicidad: 'mensual',
  }),
  Object.freeze({
    id: 'f2',
    numero: 2,
    corto: 'Partos y nacidos',
    titulo: 'Partos, cesáreas y nacidos',
    subtitulo: 'Por tipo de parto',
    icono: 'sh-baby',
    periodicidad: 'mensual',
  }),
]);

export const CUADROS = FORMATOS;

export const VERSION = 'GIN-1';

/* Clave plana de una casilla dentro de su cuadro: «edad_15_19.controles_prenatales»,
   no un objeto anidado. Igual que Laboratorio (claveFila en su definicion.js):
   el backend parte el código del indicador en el primer punto («cuadro.resto»)
   y guarda «resto» tal cual, así que una fila con más de un punto se rompe si
   se intenta leer como un objeto anidado. */
export const claveFila = (fila, columna) => `${fila}.${columna}`;

export function formato(id) {
  return FORMATOS.find((f) => f.id === id) ?? null;
}

/* Las casillas del reporte, una por cifra que se digita. Es lo que se
   instala en la base como indicadores del formato
   (`servidor/api/app/herramientas/cargar_catalogo_ginecologia.py`) y la
   forma plana en que el servidor guarda y devuelve las cifras: `f1` /
   `f2`, `edad_15_19.controles_prenatales` → indicador
   `f1.edad_15_19.controles_prenatales`. */
export function casillas() {
  const deF1 = EDADES.flatMap((e) => COLUMNAS_F1.map((c) => ({
    cuadro: 'f1',
    fila: claveFila(e.clave, c.clave),
    codigo: `f1.${claveFila(e.clave, c.clave)}`,
    nombre: `${c.nombre} · ${e.rotulo}`,
    etiquetas: [e.rotulo, c.rotulo],
  })));
  const deF2 = TIPOS_PARTO.flatMap((t) => COLUMNAS_F2.map((c) => ({
    cuadro: 'f2',
    fila: claveFila(t.clave, c.clave),
    codigo: `f2.${claveFila(t.clave, c.clave)}`,
    nombre: `${c.nombre} · ${t.nombre}`,
    etiquetas: [t.rotulo, c.rotulo],
  })));
  return [...deF1, ...deF2];
}

/* Estructura de un reporte sin llenar. Vacío es vacío: un objeto sin claves,
   no lleno de ceros. */
export function datosVacios() {
  return { f1: {}, f2: {} };
}
