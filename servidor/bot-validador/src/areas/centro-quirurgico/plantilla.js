/* El formato de Centro Quirúrgico que el área descarga: las cinco hojas que
   el bot lee, con la forma de su Excel (las cabeceras de los meses, las
   especialidades con sus procedimientos, el título con el mes en
   SUSPENDIDAS). Se lee con el mismo lector que el libro real (lector.js):
   pegar las cifras desde el libro propio funciona.

   No trae las hojas que el sistema calcula (Top Ten, Consolidado, la tabla
   derecha de indicadores) ni el registro paciente por paciente: el área las
   sigue llevando en su libro si quiere, pero el bot no las lee.

   Con `datos` sale lleno en la columna del mes (los ejemplos y las pruebas);
   sin ellos, en blanco, con los procedimientos que el área usó en agosto de
   2026 (procedimientos.js). */

import { MESES_CORTOS, MESES_LARGOS, CONCEPTOS_RESUMEN, TIPOS, INSUMOS_INDICADORES, CAUSAS, ESPECIALIDADES } from './definicion.js';
import { PROCEDIMIENTOS_TIPICOS } from './procedimientos.js';
import { VERSION } from './lector.js';
import { crearLibro, letraDeColumna, ESTILO } from '../../xlsx.js';
import { mesOficial } from '../../periodos.js';

export { VERSION };

const anioDe = (periodo) => periodo.slice(0, 4);
const mesDe = (periodo) => Number(periodo.slice(5, 7));

/* Las columnas de las hojas por especialidad: los meses con sus trimestres y
   semestres entre ellos, como el libro del área. */
const COLUMNAS_DEL_ANIO = Object.freeze([
  'ENE', 'FEB', 'MAR', 'I TRIM', 'ABR', 'MAY', 'JUN', 'II TRIM', 'I SEM',
  'JUL', 'AGO', 'SET', 'III TRIM', 'OCT', 'NOV', 'DIC', 'IV TRIM', 'II SEM', 'TOTAL ANUAL',
]);
/* La columna de cada mes (C = 3 es la primera). */
const columnaDelMes = (mes) => 3 + COLUMNAS_DEL_ANIO.indexOf(MESES_CORTOS[mes - 1]);

const titulo = (v) => ({ v, estilo: ESTILO.titulo });
const cabecera = (v) => ({ v, estilo: ESTILO.cabecera });
const etiqueta = (v) => ({ v, estilo: ESTILO.etiqueta });
const entrada = (v) => ({ v: v ?? null, estilo: ESTILO.entrada });

/* ------------------------------------------------- CIRUGIA MAYOR y MENOR */

function hojaPorEspecialidad(tipo, periodo, datos) {
  const mes = mesDe(periodo);
  const col = columnaDelMes(mes);
  const filas = [[], [], [titulo(`INTERVENCIONES QUIRÚRGICAS ${tipo === 'mayor' ? 'MAYORES' : 'MENORES'} EJECUTADAS POR ESPECIALIDAD`)], [{ v: `HOSPITAL REGIONAL DE LORETO - ${anioDe(periodo)}, PUNCHANA - LORETO` }]];
  filas.push([null, cabecera('INDICADOR'), ...COLUMNAS_DEL_ANIO.map(cabecera)]);

  const especialidades = ESPECIALIDADES.filter((e) => e.en.includes(tipo));
  const detalle = datos?.procedimientos?.[tipo];
  const filasEspecialidad = [];
  especialidades.forEach((e, i) => {
    const items = detalle ? (detalle[e.clave] ?? []) : (PROCEDIMIENTOS_TIPICOS[tipo][e.clave] ?? []).map((rotulo) => ({ rotulo, valor: null }));
    const rEsp = filas.length + 1;
    const desde = rEsp + 1;
    const hasta = rEsp + Math.max(items.length, 1);
    // Como el SUM de Excel: un texto no suma.
    const numeros = items.map((it) => it.valor).filter((v) => typeof v === 'number');
    const suma = numeros.length ? numeros.reduce((a, b) => a + b, 0) : null;
    const fila = [i === 0 ? etiqueta(`CIRUGIA ${tipo.toUpperCase()}`) : null, etiqueta(e.rotulos[0])];
    // La fila de la especialidad suma sus procedimientos en cada mes, como en el libro.
    MESES_CORTOS.forEach((_, m) => {
      const c = columnaDelMes(m + 1);
      fila[c - 1] = { f: `SUM(${letraDeColumna(c)}${desde}:${letraDeColumna(c)}${hasta})`, ...(m + 1 === mes && suma != null ? { v: suma } : {}), estilo: ESTILO.total };
    });
    filas.push(fila);
    filasEspecialidad.push(rEsp);
    for (const it of items) {
      const f = [null, etiqueta(it.rotulo)];
      f[col - 1] = entrada(it.valor);
      filas.push(f);
    }
    if (!items.length) filas.push([null, etiqueta('Otras')]);
  });

  const total = filasEspecialidad.reduce((a, r) => a + (typeof filas[r - 1][col - 1]?.v === 'number' ? filas[r - 1][col - 1].v : 0), 0);
  const conDatos = filasEspecialidad.some((r) => typeof filas[r - 1][col - 1]?.v === 'number');
  const sub = [{ v: 'Sub Total', estilo: ESTILO.total }, { v: null, estilo: ESTILO.total }];
  sub[col - 1] = { f: `SUM(${filasEspecialidad.map((r) => `${letraDeColumna(col)}${r}`).join(',')})`, ...(conDatos ? { v: total } : {}), estilo: ESTILO.total };
  filas.push(sub);

  return {
    nombre: tipo === 'mayor' ? 'CIRUGIA MAYOR ' : 'CIRUGIA MENOR',
    filas,
    anchos: [14, 44, ...COLUMNAS_DEL_ANIO.map(() => 8)],
    congelar: { filas: 5, columnas: 2 },
  };
}

/* ----------------------------------------------------------- SUSPENDIDAS */

function hojaSuspendidas(periodo, datos) {
  const causas = CAUSAS.filter((c) => !c.ocasional || datos?.suspendidas?.[c.clave] != null);
  const filas = [[], [null, titulo('CAUSAS DE SUSPENSIÓN DE CIRUGÍAS ELECTIVAS')], [null, { v: `HOSPITAL REGIONAL DE LORETO - ${mesOficial(periodo)} ${anioDe(periodo)}` }], [null, cabecera('CAUSAS'), null, cabecera('NÚMERO'), cabecera('%')]];
  const desde = filas.length + 1;
  for (const c of causas) {
    const v = datos?.suspendidas?.[c.clave];
    // El rótulo del catálogo, no el corto de las pantallas: es el que el lector reconoce.
    filas.push([null, etiqueta(c.clave === 'otros' ? 'OTROS (PACIENTE O FAMILIAR SE REHUSA, AUSENCIA DE PEDIATRA)' : c.rotulo), null, entrada(v)]);
  }
  const hasta = filas.length;
  const total = causas.reduce((a, c) => a + (datos?.suspendidas?.[c.clave] ?? 0), 0);
  const r = filas.length + 1;
  filas.push([null, { v: 'Total', estilo: ESTILO.total }, null, { f: `SUM(D${desde}:D${hasta})`, ...(datos?.suspendidas ? { v: total } : {}), estilo: ESTILO.total }]);
  // El porcentaje de cada causa: ayuda al área, el bot no lo lee.
  for (let i = desde; i <= hasta; i += 1) filas[i - 1][4] = { f: `IF(D${r}=0,0,D${i}*100/D${r})` };
  return { nombre: 'SUSPENDIDAS', filas, anchos: [4, 52, 4, 12, 10] };
}

/* --------------------------------------------------------------- RESUMEN */

function hojaResumen(periodo, datos) {
  const mes = mesDe(periodo);
  const filas = [[titulo(`PRODUCCION ASISTENCIAL DE INTERVENCIONES QUIRURGICAS ${anioDe(periodo)}`)], []];
  const meses = [null];
  const tipos = [null];
  MESES_LARGOS.forEach((m) => {
    meses.push(cabecera(m), cabecera(null));
    tipos.push(cabecera('CIRUGIA PROGR'), cabecera('CIRUGIA EMERG'));
  });
  filas.push(meses, tipos);
  for (const c of CONCEPTOS_RESUMEN) {
    const f = [etiqueta(c.rotulo)];
    TIPOS.forEach((t, i) => {
      f[2 * (mes - 1) + 1 + i] = entrada(datos?.resumen?.[`${c.clave}.${t.clave}`]);
    });
    filas.push(f);
  }
  return {
    nombre: 'Resumen',
    filas,
    anchos: [26, ...MESES_LARGOS.flatMap(() => [10, 10])],
    combinadas: MESES_LARGOS.map((_, i) => `${letraDeColumna(2 + 2 * i)}3:${letraDeColumna(3 + 2 * i)}3`),
    congelar: { filas: 4, columnas: 1 },
  };
}

/* ------------------------------------------------- CUADRO DE INDICADORES */

function hojaIndicadores(periodo, datos) {
  const col = 2 + mesDe(periodo);
  const filas = [[], [null, titulo('ESTADISTICA DE CENTRO QUIRURGICO')], [null, { v: `HOSPITAL REGIONAL DE LORETO - ${anioDe(periodo)}` }], []];
  filas.push([null, cabecera('INDICADOR'), ...MESES_CORTOS.map(cabecera), cabecera('TOTAL')]);
  // Una fila ocasional (la encefalopatía) va en blanco en el formato, y llena solo si el mes la trae.
  for (const i of INSUMOS_INDICADORES.filter((x) => !x.ocasional || !datos || datos.indicadores?.[x.clave] != null)) {
    const f = [null, etiqueta(i.rotulo.replace(/^NO\. /, 'No. '))];
    f[col - 1] = entrada(datos?.indicadores?.[i.clave]);
    filas.push(f);
  }
  return { nombre: 'CUADRO DE INDICADORES', filas, anchos: [4, 50, ...MESES_CORTOS.map(() => 8), 10], congelar: { filas: 5, columnas: 2 } };
}

/* ---------------------------------------------------------------------- */

export function crearPlantilla(periodo, datos = null) {
  return crearLibro({
    hojas: [
      { ...hojaPorEspecialidad('mayor', periodo, datos), primera: true },
      hojaPorEspecialidad('menor', periodo, datos),
      hojaSuspendidas(periodo, datos),
      hojaResumen(periodo, datos),
      hojaIndicadores(periodo, datos),
    ],
  });
}

export function nombreDeArchivo(periodo) {
  return `ESTADISTICA_CENTRO_QUIRURGICO_${mesOficial(periodo)}_${anioDe(periodo)}.xlsx`;
}
