/* Plantilla del reporte de Laboratorio en formato .xlsx.

   La hoja de UN mes con la forma del libro del área (definicion.js, «LA HOJA
   DEL MES»): el «Mes:» y el «Año:» arriba, Patología Clínica a la izquierda,
   Anatomía Patológica, Metaxénicas, Banco de Sangre y el resumen a la
   derecha. Se llama como la hoja del área (AGO, SET…), así que el bot la lee
   con el mismo lector que el libro anual, y quien la descarga puede pegar sus
   filas en su propio libro.

   Todo total es una fórmula —el de cada examen, el de cada sección, el de
   Patología Clínica, las filas del resumen y el TOTAL general—: lo que el
   área digita son las casillas, nunca una suma. Sin datos solo lleva los
   exámenes de todos los meses; los `ocasional` entran si vienen en los datos. */

import { SECCIONES, PROCEDENCIAS, HOJAS_DEL_MES, NOMBRES_DEL_MES, TOTAL_PATOLOGIA_CLINICA, claveFila, columnasDe, cuadro } from './definicion.js';
import { VERSION, reconocer, leerCifras, celdaDeOrigen } from './lector.js';
import { valor, totalExamen, totalProcedencia, totalCuadro, totalGeneral, sumar } from './calculos.js';
import { crearLibro, ESTILO } from '../../xlsx.js';

export { VERSION, reconocer, leerCifras, celdaDeOrigen, totalCuadro, valor };

const ENCABEZADOS = ['Hospitaliz.', 'Emergenc.', 'C. Externa', 'Privado', 'Convenio', 'Insolvencia', 'TOTAL'];
const IZQUIERDA = SECCIONES.filter((s) => s.bloque === 'izquierda');
const num = (letra) => letra.charCodeAt(0) - 64;

/* Las filas del resumen y la sección de la que copian su total. */
const RESUMEN = [
  ['EXAMEN DE PROCEDIMIENTO BIOQUÍMICO', 'bioquimica'],
  ['EXAMEN DE PROCEDIMIENTO HEMATOLÓGICO - HEMOSTASICOS', 'hematologia'],
  ['EXAMEN DE PROCEDIMIENTOS MICROBIOLÓGICOS', 'microbiologia'],
  ['EXAMEN DE PROCEDIMIENTOS UROPARASITOLÓGICOS', 'uro_parasitologicos'],
  ['EXAMEN DE PROCEDIMIENTOS INMUNOLÓGICOS', 'inmuno_serologicos'],
  ['EXAMEN DE PROCEDIMIENTO ANATOMO PATOLÓGICO', 'anatomia_patologica'],
  ['EXAMEN DE PROGRAMAS', 'metaxenicas'],
  ['UNIDADES DE BANCO DE SANGRE', 'banco_sangre'],
];

export function nombreDeArchivo(periodo) {
  return `Laboratorio_${periodo}.xlsx`;
}

/* La hoja como cuadrícula dispersa: fila → columna → celda. */
function cuadricula() {
  const filas = new Map();
  return {
    poner(r, letra, celda) {
      if (!filas.has(r)) filas.set(r, new Map());
      filas.get(r).set(num(letra), celda);
    },
    filas() {
      const ultima = Math.max(...filas.keys());
      return Array.from({ length: ultima }, (_, i) => {
        const fila = filas.get(i + 1);
        if (!fila) return [null];
        const ancho = Math.max(...fila.keys());
        return Array.from({ length: ancho }, (_, k) => fila.get(k + 1) ?? null);
      });
    },
  };
}

/* Genera el .xlsx. Con `datos` va lleno (los ejemplos y las pruebas); sin
   ellos, en blanco. `totalesEscritos` reemplaza la fórmula de un total por una
   cifra tecleada (o la deja vacía con `null`), para el ejemplo con errores:
     { 'bioquimica|glucosa': 999 }      la columna TOTAL de un examen
     { 'bioquimica|_total': 9000 }      el TOTAL de la fila de total de la sección
     { _general: 50000 }                el TOTAL general del departamento
   `hoja` y `mesEscrito` sirven al consolidado (consolidado.js): la misma forma,
   en la hoja CONSOLIDADO y con «ENERO A DICIEMBRE» en su «Mes:». */
export function crearPlantilla(periodo, datos = null, { totalesEscritos = {}, hoja: nombreHoja, mesEscrito } = {}) {
  const mes = Number(periodo.slice(5, 7));
  const hoja = cuadricula();
  const formula = (f, v) => ({ f, v: datos ? (v ?? 0) : undefined, estilo: ESTILO.total });
  const escrito = (clave, celda) => (clave in totalesEscritos ? { v: totalesEscritos[clave], estilo: ESTILO.total } : celda);
  const filaDeTotal = {};
  /* Un examen entra si es de todos los meses, o si los datos lo traen. */
  const entra = (s, e) => !e.ocasional || cuadro(s.id).procedencias.some((p) => valor(datos, s.id, claveFila(e.clave, p.clave)) != null);

  hoja.poner(1, 'A', { v: 'DEPARTAMENTO DE PATOLOGÍA CLÍNICA Y ANATOMÍA PATOLÓGICA · REPORTE ESTADÍSTICO MENSUAL', estilo: ESTILO.titulo });
  hoja.poner(4, 'A', { v: 'Establecimiento de Salud informante:', estilo: ESTILO.etiqueta });
  hoja.poner(4, 'B', { v: 'HOSPITAL REGIONAL DE LORETO', estilo: ESTILO.normal });
  hoja.poner(4, 'K', { v: 'Mes: ', estilo: ESTILO.etiqueta });
  hoja.poner(4, 'L', { v: mesEscrito ?? NOMBRES_DEL_MES[mes - 1][0], estilo: ESTILO.normal });
  hoja.poner(5, 'A', { v: 'Código Renipress: ', estilo: ESTILO.etiqueta });
  hoja.poner(5, 'B', { v: 3, estilo: ESTILO.normal });
  hoja.poner(5, 'K', { v: 'Año: ', estilo: ESTILO.etiqueta });
  hoja.poner(5, 'L', { v: Number(periodo.slice(0, 4)), estilo: ESTILO.normal });
  hoja.poner(6, 'A', { v: 'PATOLOGÍA CLÍNICA', estilo: ESTILO.titulo });
  hoja.poner(6, 'B', { v: 'TOTAL', estilo: ESTILO.cabecera });
  ENCABEZADOS.forEach((t, i) => hoja.poner(7, 'BCDEFGH'[i], { v: t, estilo: ESTILO.cabecera }));

  /* ------------------------------------------------ bloque izquierdo */
  const filaPatologia = 8;
  let r = 9;
  for (const s of IZQUIERDA) {
    const c = columnasDe(s.id);
    const filaTotal = r;
    filaDeTotal[s.id] = filaTotal;
    const examenes = s.examenes.filter((e) => entra(s, e));
    const primera = r + 1;
    const ultima = r + examenes.length;
    hoja.poner(r, 'A', { v: s.etiquetaTotal, estilo: ESTILO.total });
    for (const p of s.procedencias ?? PROCEDENCIAS) {
      const col = c.porProcedencia[p.clave];
      hoja.poner(r, col, formula(`SUM(${col}${primera}:${col}${ultima})`, totalProcedencia(datos, s.id, p.clave)));
    }
    hoja.poner(r, 'H', escrito(`${s.id}|_total`, formula(`SUM(B${r}:G${r})`, totalCuadro(datos, s.id))));
    r += 1;
    for (const e of examenes) {
      hoja.poner(r, 'A', { v: e.etiqueta, estilo: ESTILO.etiqueta });
      for (const p of s.procedencias ?? PROCEDENCIAS) hoja.poner(r, c.porProcedencia[p.clave], { v: datos ? (datos[s.id]?.[claveFila(e.clave, p.clave)] ?? null) : null, estilo: ESTILO.entrada });
      hoja.poner(r, 'H', escrito(`${s.id}|${e.clave}`, formula(`SUM(B${r}:G${r})`, totalExamen(datos, s.id, e.clave))));
      r += 1;
    }
  }
  hoja.poner(filaPatologia, 'A', { v: TOTAL_PATOLOGIA_CLINICA, estilo: ESTILO.total });
  'BCDEFGH'.split('').forEach((col, i) => {
    const valorCol = i < 6 ? sumar(IZQUIERDA.map((s) => totalProcedencia(datos, s.id, PROCEDENCIAS[i].clave))) : sumar(IZQUIERDA.map((s) => totalCuadro(datos, s.id)));
    hoja.poner(filaPatologia, col, formula(IZQUIERDA.map((s) => `${col}${filaDeTotal[s.id]}`).join('+'), valorCol));
  });

  /* ------------------------------------------------- bloque derecho */
  let d = 6;
  const seccionDerecha = (s, { conTitulo }) => {
    const c = columnasDe(s.id);
    if (conTitulo) {
      hoja.poner(d, 'J', { v: s.titulo, estilo: ESTILO.titulo });
      hoja.poner(d, 'K', { v: 'TOTAL', estilo: ESTILO.cabecera });
      d += 1;
      const encabezados = (s.procedencias ?? PROCEDENCIAS).map((p) => (p.clave === 'programa' ? 'Programa' : ENCABEZADOS[PROCEDENCIAS.findIndex((x) => x.clave === p.clave)]));
      [...encabezados, 'TOTAL'].forEach((t, i) => hoja.poner(d, 'KLMNOPQ'[i], { v: t, estilo: ESTILO.cabecera }));
      d += 1;
    }
    const examenes = s.examenes.filter((e) => entra(s, e));
    const filaTotal = d;
    filaDeTotal[s.id] = filaTotal;
    hoja.poner(d, 'J', { v: s.etiquetaTotal, estilo: ESTILO.total });
    for (const p of s.procedencias ?? PROCEDENCIAS) {
      const col = c.porProcedencia[p.clave];
      hoja.poner(d, col, formula(`SUM(${col}${d + 1}:${col}${d + examenes.length})`, totalProcedencia(datos, s.id, p.clave)));
    }
    hoja.poner(d, 'Q', escrito(`${s.id}|_total`, formula(`SUM(K${d}:P${d})`, totalCuadro(datos, s.id))));
    d += 1;
    for (const e of examenes) {
      hoja.poner(d, 'J', { v: e.etiqueta, estilo: ESTILO.etiqueta });
      for (const p of s.procedencias ?? PROCEDENCIAS) hoja.poner(d, c.porProcedencia[p.clave], { v: datos ? (datos[s.id]?.[claveFila(e.clave, p.clave)] ?? null) : null, estilo: ESTILO.entrada });
      hoja.poner(d, 'Q', escrito(`${s.id}|${e.clave}`, formula(`SUM(K${d}:P${d})`, totalExamen(datos, s.id, e.clave))));
      d += 1;
    }
    d += 1;
  };
  // Anatomía Patológica comparte las cabeceras de la fila 6 y 7 con Patología Clínica.
  hoja.poner(6, 'J', { v: 'ANATOMÍA PATOLÓGICA', estilo: ESTILO.titulo });
  hoja.poner(6, 'K', { v: 'TOTAL', estilo: ESTILO.cabecera });
  ENCABEZADOS.forEach((t, i) => hoja.poner(7, 'KLMNOPQ'[i], { v: t, estilo: ESTILO.cabecera }));
  d = 8;
  seccionDerecha(SECCIONES.find((s) => s.id === 'anatomia_patologica'), { conTitulo: false });
  seccionDerecha(SECCIONES.find((s) => s.id === 'metaxenicas'), { conTitulo: true });
  seccionDerecha(SECCIONES.find((s) => s.id === 'banco_sangre'), { conTitulo: true });

  /* El resumen del departamento. */
  const actividades = SECCIONES.find((s) => s.id === 'actividades');
  hoja.poner(d, 'J', { v: actividades.titulo, estilo: ESTILO.titulo });
  d += 1;
  hoja.poner(d, 'J', { v: 'PROGRAMAS DE SALUD OPORTUNOS PARA LA POBLACION', estilo: ESTILO.etiqueta });
  hoja.poner(d, 'Q', { v: 'TOTAL', estilo: ESTILO.cabecera });
  d += 1;
  const filaProgramacion = d;
  hoja.poner(d, 'J', { v: actividades.examenes[0].etiqueta, estilo: ESTILO.etiqueta });
  hoja.poner(d, 'Q', { v: datos ? (datos.actividades?.[claveFila('programacion', 'total')] ?? null) : null, estilo: ESTILO.entrada });
  d += 1;
  for (const [rotulo, id] of RESUMEN) {
    const col = cuadro(id).bloque === 'izquierda' ? 'H' : 'Q';
    hoja.poner(d, 'J', { v: rotulo, estilo: ESTILO.etiqueta });
    hoja.poner(d, 'Q', formula(`${col}${filaDeTotal[id]}`, totalCuadro(datos, id)));
    d += 1;
  }
  hoja.poner(d, 'P', { v: 'TOTAL', estilo: ESTILO.cabecera });
  const partes = [...SECCIONES.filter((s) => s.id !== 'actividades').map((s) => `${s.bloque === 'izquierda' ? 'H' : 'Q'}${filaDeTotal[s.id]}`), `Q${filaProgramacion}`];
  hoja.poner(d, 'Q', escrito('_general', formula(partes.join('+'), totalGeneral(datos))));

  const leeme = {
    nombre: 'LEEME',
    anchos: [110],
    filas: [
      [{ v: mesEscrito ? `Consolidado anual · Patología Clínica y Anatomía Patológica · ${periodo.slice(0, 4)}` : `Reporte mensual · Patología Clínica y Anatomía Patológica · ${NOMBRES_DEL_MES[mes - 1][0].toLowerCase()} de ${periodo.slice(0, 4)}`, estilo: ESTILO.titulo }],
      [null],
      ...(mesEscrito ? [['Suma, casilla por casilla, de los meses con reporte entregado. Un mes sin reporte no suma ni cuenta como cero.'], [null]] : []),
      ['1. Es la hoja del mes, con la misma forma que la del libro del área. Puede subir este archivo o su propio libro del año: el sistema lee la hoja del mes.'],
      ['2. Llene la cantidad de cada examen en sus procedencias. Un blanco en una fila con cifras cuenta como 0, como en su Excel.'],
      ['3. No escriba sobre las filas TOTAL ni la columna TOTAL: son sumas y se calculan solas.'],
      ['4. No cambie los nombres de los exámenes: el sistema reconoce cada fila por ellos.'],
      [null],
      [{ v: `Plantilla ${VERSION}. El «Mes:» y el «Año:» deben ser los del reporte: el sistema rechaza la hoja de otro mes o del año anterior.`, estilo: ESTILO.nota }],
    ],
  };

  return crearLibro({
    hojas: [
      { nombre: nombreHoja ?? HOJAS_DEL_MES[mes - 1][0], filas: hoja.filas(), anchos: [44, 11, 11, 11, 11, 11, 11, 12, 3, 44, 11, 11, 11, 11, 11, 11, 12], congelar: { filas: 7, columnas: 1 } },
      leeme,
    ],
  });
}
