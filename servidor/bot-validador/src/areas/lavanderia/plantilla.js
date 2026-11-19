/* Plantilla Excel del reporte de Lavandería: el Excel oficial del área, en
   blanco para el mes pedido. Las cuatro hojas llevan el mismo encabezado y
   los mismos rótulos que el Excel real (ver definicion.js y oficial.js), por
   si el área prefiere empezar de la plantilla en vez de copiar su propio
   archivo; el bot las lee con el mismo lector (oficial.js): como no busca
   hojas por nombre, da igual cuál se use. */

import { SERVICIOS, BLOQUES, GRUPOS, INSUMOS } from './definicion.js';
import { VERSION_OFICIAL, celdaDeOrigen, leerCifras } from './oficial.js';
import { diasDelMes, mesOficial } from '../../periodos.js';
import { crearLibro, referencia, ESTILO } from '../../xlsx.js';

export { celdaDeOrigen, leerCifras };
export const VERSION_PLANTILLA = VERSION_OFICIAL;

export function nombreDeArchivo(periodo) {
  const [anio] = periodo.split('-');
  return `Lavanderia_${mesOficial(periodo)}_${anio}.xlsx`;
}

function encabezadoMes(titulo, periodo, colAnio) {
  const filas = [
    [{ v: titulo, estilo: ESTILO.titulo }],
    Array.from({ length: colAnio }, (_, i) => {
      if (i === 0) return { v: `MES: ${mesOficial(periodo)}`, estilo: ESTILO.etiqueta };
      if (i === colAnio - 1) return { v: `AÑO: ${periodo.slice(0, 4)}`, estilo: ESTILO.etiqueta };
      return null;
    }),
  ];
  return filas;
}

/* f1: kilos por servicio, un bloque por fila de BLOQUES, con los días del
   mes en columnas desde la C y el total en la última. */
function hojaF1(periodo, datos, totalesEscritos) {
  const n = diasDelMes(periodo);
  const colTotal = 3 + n;
  const filas = encabezadoMes('INFORME MENSUAL DEL AREA DE LAVANDERIA', periodo, 27);
  filas.push([null]);
  filas.push([null]);
  const encDias = [null, { v: 'DIAS', estilo: ESTILO.cabecera }];
  for (let d = 1; d <= n; d += 1) encDias.push({ v: d, estilo: ESTILO.cabecera });
  filas.push(encDias);
  const encProc = [null, { v: 'PROCEDIMIENTO', estilo: ESTILO.cabecera }];
  for (let d = 1; d <= n; d += 1) encProc.push({ v: null, estilo: ESTILO.cabecera });
  encProc.push({ v: 'TOTAL', estilo: ESTILO.cabecera });
  filas.push(encProc);

  const filasDatos = [];
  let totalGeneral = 0;
  let algunDato = false;
  for (const bloque of BLOQUES) {
    if (bloque.label) {
      filas.push([null, { v: bloque.label, estilo: ESTILO.etiqueta }]);
    }
    for (const s of SERVICIOS.filter((x) => x.bloque === bloque.id)) {
      if (s.ocasional && !(datos?.f1?.[s.clave]?.some((v) => v != null))) continue;
      const r = filas.length + 1;
      const valores = datos?.f1?.[s.clave] ?? [];
      const dias = Array.from({ length: n }, (_, d) => ({ v: valores[d] ?? null, estilo: ESTILO.entrada }));
      const numeros = dias.filter((c) => typeof c.v === 'number');
      const suma = numeros.length ? numeros.reduce((acc, c) => acc + c.v, 0) : undefined;
      if (suma != null) {
        totalGeneral += suma;
        algunDato = true;
      }
      const escrito = totalesEscritos[`f1|${s.clave}`];
      filas.push([
        null,
        { v: s.rotulo, estilo: ESTILO.etiqueta },
        ...dias,
        escrito != null ? { v: escrito, estilo: ESTILO.total } : { f: `SUM(${referencia(3, r)}:${referencia(colTotal - 1, r)})`, v: suma, estilo: ESTILO.total },
      ]);
      filasDatos.push(r);
    }
  }
  filas.push([
    null,
    { v: 'TOTAL', estilo: ESTILO.total },
    ...Array.from({ length: n }, () => ({ v: null, estilo: ESTILO.total })),
    { f: filasDatos.map((r) => referencia(colTotal, r)).join('+'), v: algunDato ? totalGeneral : undefined, estilo: ESTILO.total },
  ]);

  return { nombre: 'Kilos por servicio', primera: true, filas, anchos: [3, 22, ...Array(n).fill(4), 9] };
}

/* f3: ropa sucia, un día por fila. */
function hojaF3(periodo, datos) {
  const n = diasDelMes(periodo);
  const filas = [
    [{ v: 'UNIDAD DE SERVICIOS GENERALES', estilo: ESTILO.titulo }],
    [{ v: 'INFORME MENSUAL DEL PRECIO DE ROPA SUCIA', estilo: ESTILO.etiqueta }],
    [null],
    [
      { v: 'ITEN', estilo: ESTILO.cabecera }, { v: 'DIAS', estilo: ESTILO.cabecera },
      { v: 'ROPA SUCIA COMUN', estilo: ESTILO.cabecera }, { v: 'PRECIO X KILO', estilo: ESTILO.cabecera },
      { v: 'ROPA SUCIA', estilo: ESTILO.cabecera }, { v: 'PRECIO X KILO', estilo: ESTILO.cabecera },
      { v: 'TOTAL DE X KILO', estilo: ESTILO.cabecera }, { v: 'TOTAL DE PRECIO X KILO', estilo: ESTILO.cabecera },
    ],
  ];
  const NOMBRE_DIA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
  const primerDiaSemana = (new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1, 1)).getUTCDay() + 6) % 7;
  for (let d = 1; d <= n; d += 1) {
    const r = filas.length + 1;
    const comun = datos?.f3?.comun?.[d - 1] ?? null;
    const sucia = datos?.f3?.sucia?.[d - 1] ?? null;
    filas.push([
      { v: d, estilo: ESTILO.etiqueta }, { v: NOMBRE_DIA[(primerDiaSemana + d - 1) % 7], estilo: ESTILO.etiqueta },
      { v: comun, estilo: ESTILO.entrada }, { v: 3, estilo: ESTILO.entrada },
      { v: sucia, estilo: ESTILO.entrada }, { v: 4.5, estilo: ESTILO.entrada },
      { f: `C${r}+E${r}`, estilo: ESTILO.total }, { f: `C${r}*D${r}+E${r}*F${r}`, estilo: ESTILO.total },
    ]);
  }
  const r0 = 5;
  const rN = filas.length;
  filas.push([
    { v: 'TOTAL', estilo: ESTILO.total }, null,
    { f: `SUM(C${r0}:C${rN})`, estilo: ESTILO.total }, { f: `SUM(D${r0}:D${rN})`, estilo: ESTILO.total },
    { f: `SUM(E${r0}:E${rN})`, estilo: ESTILO.total }, { f: `SUM(F${r0}:F${rN})`, estilo: ESTILO.total },
    { f: `SUM(G${r0}:G${rN})`, estilo: ESTILO.total }, { f: `SUM(H${r0}:H${rN})`, estilo: ESTILO.total },
  ]);
  return { nombre: 'Ropa sucia', filas, anchos: [6, 12, 16, 12, 12, 12, 14, 18] };
}

/* f2: lista libre de trabajos de confección, en blanco. */
function hojaF2(periodo, datos) {
  const filas = [
    [{ v: 'REPORTE MENSUAL DE TRABAJO DE CONFECCION', estilo: ESTILO.titulo }],
    [{ v: `MES DE ${mesOficial(periodo)} DEL ${periodo.slice(0, 4)}`, estilo: ESTILO.etiqueta }],
    [null],
    [
      { v: 'ITEN', estilo: ESTILO.cabecera }, { v: 'DESCRIPCION', estilo: ESTILO.cabecera },
      { v: 'CONFECCION', estilo: ESTILO.cabecera }, { v: 'SERVICIO', estilo: ESTILO.cabecera }, { v: 'TIPO DE TELA', estilo: ESTILO.cabecera },
    ],
  ];
  const trabajos = datos?.f2 ?? [];
  const n = Math.max(trabajos.length, 20);
  for (let i = 0; i < n; i += 1) {
    const t = trabajos[i];
    filas.push([
      { v: i + 1, estilo: ESTILO.etiqueta },
      { v: t?.descripcion ?? null, estilo: ESTILO.entrada },
      { v: t?.confeccion ?? null, estilo: ESTILO.entrada },
      { v: t?.servicio ?? null, estilo: ESTILO.entrada },
      { v: t?.tela ?? null, estilo: ESTILO.entrada },
    ]);
  }
  return { nombre: 'Confección', filas, anchos: [6, 26, 16, 26, 20] };
}

/* f4: consolidado de piezas por grupo (los kilos no se digitan: se derivan
   de f1, ver definicion.js) y los seis insumos de limpieza. */
function hojaF4(periodo, datos) {
  const filas = [
    [null],
    [{ v: 'INFORME MENSUAL DEL AREA DE LAVANDERIA', estilo: ESTILO.titulo }],
    [{ v: `MES: ${mesOficial(periodo)}`, estilo: ESTILO.etiqueta }, null, { v: `AÑO:${periodo.slice(0, 4)}`, estilo: ESTILO.etiqueta }],
    [null],
    [null],
    [{ v: 'SERVICIO', estilo: ESTILO.cabecera }, { v: 'PIEZAS', estilo: ESTILO.cabecera }, { v: 'KILOGRAMOS', estilo: ESTILO.cabecera }],
  ];
  const filasGrupo = [];
  for (const g of GRUPOS) {
    const r = filas.length + 1;
    filas.push([{ v: g.rotulo, estilo: ESTILO.etiqueta }, { v: datos?.f4?.piezas?.[g.clave] ?? null, estilo: ESTILO.entrada }, { v: null, estilo: ESTILO.nota }]);
    filasGrupo.push(r);
  }
  filas.push([null]);
  filas.push([
    { v: 'TOTAL :', estilo: ESTILO.total },
    { f: filasGrupo.map((r) => `B${r}`).join('+'), estilo: ESTILO.total },
    { f: filasGrupo.map((r) => `C${r}`).join('+'), estilo: ESTILO.total },
  ]);
  for (let i = 0; i < 4; i += 1) filas.push([null]);
  filas.push([{ v: 'INSUMOS UTILIZADOS', estilo: ESTILO.etiqueta }]);
  filas.push([null]);
  for (const ins of INSUMOS) {
    filas.push([{ v: ins.rotulo, estilo: ESTILO.etiqueta }, { v: datos?.f4?.insumos?.[ins.clave] ?? null, estilo: ESTILO.entrada }]);
  }
  return { nombre: 'Piezas e insumos', filas, anchos: [34, 18, 14] };
}

export function crearPlantilla(periodo, datos = null, { totalesEscritos = {} } = {}) {
  const hojas = [hojaF1(periodo, datos, totalesEscritos), hojaF3(periodo, datos), hojaF2(periodo, datos), hojaF4(periodo, datos)];
  const leeme = {
    nombre: 'LEEME',
    anchos: [110],
    filas: [
      [{ v: `Reporte mensual · Lavandería · ${mesOficial(periodo)} ${periodo.slice(0, 4)}`, estilo: ESTILO.titulo }],
      [null],
      ['1. Es el mismo Excel de siempre: llene cada hoja con sus datos del mes.'],
      ['2. En «Kilos por servicio» y «Ropa sucia», si un día no hubo movimiento, escriba 0. Una casilla vacía significa «no registrado».'],
      ['3. No cambie los rótulos de servicio, de grupo ni de insumo: el sistema reconoce cada fila por ellos.'],
      ['4. También puede subir directamente el Excel que ya usa el área: el sistema lo lee igual, sin importar el nombre de sus hojas.'],
      [null],
      [{ v: `Plantilla ${VERSION_PLANTILLA}. Es del mes indicado: el sistema rechaza el Excel de un mes distinto al que se reporta.`, estilo: ESTILO.nota }],
    ],
  };
  return crearLibro({ hojas: [...hojas, leeme] });
}
