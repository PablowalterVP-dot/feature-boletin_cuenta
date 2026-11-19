/* Plantilla Excel del reporte de Nutrición y Dietética: el Excel oficial del
   área, en blanco para el mes pedido.

   Es el mismo libro que el área ya llena (cuatro hojas: COMENSALES EMERG,
   COMENSALES HOSP, PACIENTES EMERG, PACIENTES HOSP), con sus títulos, sus
   rótulos y su fila TOTAL, y los días del mes en columnas desde la C. No lleva
   las siete hojas ocultas de 2020 que traen los archivos reales: nadie las
   usa. El bot la lee con el mismo lector que el Excel que el área ya tiene
   (oficial.js), por rótulos: copiar y pegar desde el archivo propio funciona.

   Reemplaza a la plantilla NUT-1, que era un formato del sistema (nombres
   definidos y una hoja oculta con el periodo) distinto del que usa el área. */

import { FORMATOS } from './definicion.js';
import { VERSION_OFICIAL, celdaDeOrigen, leerCifras } from './oficial.js';
import { diasDelMes, mesOficial, esFinDeSemana } from '../../periodos.js';
import { crearLibro, letraDeColumna, referencia, ESTILO } from '../../xlsx.js';

export { celdaDeOrigen, leerCifras };
export const VERSION_PLANTILLA = VERSION_OFICIAL;

const PRIMERA_COLUMNA = 3; // C: A es el grupo, B la comida
const PRIMERA_FILA = 5; // en las cuatro hojas los datos empiezan en la 5

/* El orden de las hojas del Excel oficial. */
const ORDEN = ['f2', 'f1', 'f4', 'f3'];

export function nombreDeArchivo(periodo) {
  const [anio] = periodo.split('-');
  return `Nutricion_${mesOficial(periodo)}_${anio}.xlsx`;
}

/* Las filas que lleva la hoja: las del catálogo, menos los grupos ocasionales
   (Patrimonio), salvo que `datos` traiga cifras para ellos. */
function filasDe(f, datos) {
  return f.filas.filter((fila) => !fila.ocasional || (datos?.[f.id]?.[fila.clave] ?? []).some((v) => v != null));
}

function hojaDeCuadro(f, periodo, datos, totalesEscritos) {
  const n = diasDelMes(periodo);
  const colTotal = PRIMERA_COLUMNA + n;
  const ultima = letraDeColumna(colTotal);
  const esPaciente = f.poblacion === 'pacientes';
  const filasDelCuadro = filasDe(f, datos);
  const titulo = `NUTRICIÓN Y DIETÉTICA: ${mesOficial(periodo)} ${periodo.slice(0, 4)}`;

  const encabezadoDias = [
    { v: null, estilo: ESTILO.cabecera },
    { v: null, estilo: ESTILO.cabecera },
    ...Array.from({ length: n }, (_, i) => ({ v: i + 1, estilo: ESTILO.cabecera })),
    { v: 'TOTAL', estilo: ESTILO.cabecera },
  ];

  /* Comensales: título, dos subtítulos, días (fila 4). Pacientes: título, un
     subtítulo, días (fila 3) y la sección (fila 4). Como en el archivo real. */
  const filas = esPaciente
    ? [[{ v: titulo, estilo: ESTILO.titulo }], [{ v: f.encabezado[0], estilo: ESTILO.etiqueta }], encabezadoDias, [{ v: f.seccion, estilo: ESTILO.etiqueta }]]
    : [[{ v: titulo, estilo: ESTILO.titulo }], [{ v: f.encabezado[0], estilo: ESTILO.etiqueta }], [{ v: f.encabezado[1], estilo: ESTILO.etiqueta }], encabezadoDias];
  const combinadas = [`A1:${ultima}1`, `A2:${ultima}2`, esPaciente ? `A4:${ultima}4` : `A3:${ultima}3`];

  let inicioGrupo = PRIMERA_FILA;
  filasDelCuadro.forEach((fila, i) => {
    const r = PRIMERA_FILA + i;
    const valores = datos?.[f.id]?.[fila.clave] ?? [];
    const dias = Array.from({ length: n }, (_, d) => ({
      /* Un texto se escribe tal cual: los ejemplos lo usan para mostrar qué
         pasa con una casilla mal digitada («18+»). */
      v: valores[d] ?? null,
      estilo: esFinDeSemana(periodo, d + 1) ? ESTILO.finde : ESTILO.entrada,
    }));
    const numeros = dias.filter((c) => typeof c.v === 'number');
    const suma = numeros.length ? numeros.reduce((s, c) => s + c.v, 0) : undefined;
    /* Un total tecleado encima de la fórmula: pasa en los Excel reales. */
    const escrito = totalesEscritos[`${f.id}|${fila.clave}`];
    const primera = i === 0 || filasDelCuadro[i - 1].grupo !== fila.grupo;
    filas.push([
      { v: primera ? fila.rotulo : null, estilo: ESTILO.etiqueta },
      { v: fila.rotuloComida, estilo: ESTILO.etiqueta },
      ...dias,
      escrito != null
        ? { v: escrito, estilo: ESTILO.total }
        : { f: `SUM(${referencia(PRIMERA_COLUMNA, r)}:${referencia(colTotal - 1, r)})`, v: suma, estilo: ESTILO.total },
    ]);
    const siguiente = filasDelCuadro[i + 1];
    if (!siguiente || siguiente.grupo !== fila.grupo) {
      if (r > inicioGrupo) combinadas.push(`A${inicioGrupo}:A${r}`);
      inicioGrupo = r + 1;
    }
  });

  const ultimaFila = PRIMERA_FILA + filasDelCuadro.length - 1;
  const filaTotal = ultimaFila + 1;
  const totalCuadro = filasDelCuadro.reduce(
    (s, fila) => s + (totalesEscritos[`${f.id}|${fila.clave}`] ?? (datos?.[f.id]?.[fila.clave] ?? []).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)),
    0,
  );
  filas.push([
    { v: 'TOTAL', estilo: ESTILO.total },
    ...Array.from({ length: n + 1 }, () => ({ v: null, estilo: ESTILO.total })),
    { f: `SUM(${referencia(colTotal, PRIMERA_FILA)}:${referencia(colTotal, ultimaFila)})`, v: datos ? totalCuadro : undefined, estilo: ESTILO.total },
  ]);
  combinadas.push(`A${filaTotal}:${letraDeColumna(colTotal - 1)}${filaTotal}`);

  return {
    nombre: f.hojaOficial,
    primera: f.id === ORDEN[0],
    filas,
    anchos: [26, 11, ...Array(n).fill(5), 9],
    altos: { 0: 24 },
    combinadas,
    congelar: { filas: esPaciente ? 3 : 4, columnas: 2 },
  };
}

/* Genera el .xlsx. Con `datos`, va lleno (los ejemplos de la demostración y
   las pruebas); sin ellos, en blanco. `totalesEscritos`
   ({ 'f1|asistencial.almuerzo': 9000 }) reemplaza la fórmula de un total por
   una cifra tecleada, para el ejemplo con errores. */
export function crearPlantilla(periodo, datos = null, { totalesEscritos = {} } = {}) {
  const hojas = ORDEN.map((id) => hojaDeCuadro(FORMATOS.find((f) => f.id === id), periodo, datos, totalesEscritos));
  const leeme = {
    nombre: 'LEEME',
    anchos: [110],
    filas: [
      [{ v: `Reporte mensual · Nutrición y Dietética · ${mesOficial(periodo)} ${periodo.slice(0, 4)}`, estilo: ESTILO.titulo }],
      [null],
      ['1. Es el mismo Excel de siempre: llene las raciones de cada día en las cuatro hojas. Puede pegar las cifras desde su propio archivo.'],
      ['2. Si un día no hubo servicio, escriba 0. Una casilla vacía significa «no registrado».'],
      ['3. No cambie el rótulo de los grupos (columna A) ni de las comidas (columna B): el sistema reconoce cada fila por ellos.'],
      ['4. Si un mes atienden a un grupo que no está (por ejemplo, Patrimonio), agregue sus filas con su rótulo antes de la fila TOTAL.'],
      ['5. También puede subir directamente el Excel que ya usa el área: el sistema lo lee igual.'],
      [null],
      [{ v: `Plantilla ${VERSION_PLANTILLA}. Es del mes indicado: el sistema rechaza el Excel de un mes distinto al que se reporta.`, estilo: ESTILO.nota }],
    ],
  };
  return crearLibro({ hojas: [...hojas, leeme] });
}

/* Para las pruebas: la fila de Excel donde queda cada fila del catálogo. */
export function filaEnPlantilla(idFormato, claveFila, datos = null) {
  const f = FORMATOS.find((x) => x.id === idFormato);
  const i = filasDe(f, datos).findIndex((x) => x.clave === claveFila);
  return i < 0 ? null : PRIMERA_FILA + i;
}
