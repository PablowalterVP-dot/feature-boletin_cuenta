/* Qué envía cada área que todavía no tiene su oficio levantado, y datos
   simulados de ese envío.

   LAS CIFRAS SON FICTICIAS. La estructura, en cambio, no es inventada: está
   armada para cubrir exactamente lo que Estadística necesita para sus dos
   formatos a DIRESA —el consolidado de servicios intermedios y los 22
   indicadores de gestión—, más lo que cada área reporta hoy en papel a
   Planeamiento, Epidemiología o Dirección y que no llega a ningún formato.

   Cuando se levante el oficio real de un área, su estructura se sustituye y el
   resto del sistema no cambia: Estadística lee los datos por su ruta.

   Dos tipos de bloque:
     cuadro  → filas por columnas de servicio (hospitalización, emergencia,
               consulta externa), que es como los pide DIRESA
     campos  → cifras sueltas con su unidad */

import { aleatorio, factorDelPeriodo } from '../azar.js';

export const SERVICIOS = Object.freeze([
  Object.freeze({ clave: 'hosp', label: 'Hospitalización' }),
  Object.freeze({ clave: 'emerg', label: 'Emergencia' }),
  Object.freeze({ clave: 'ce', label: 'Consulta externa' }),
]);

const f = (clave, label) => Object.freeze({ clave, label });
const c = (clave, label, unidad) => Object.freeze({ clave, label, unidad });
const cuadro = (clave, titulo, filas, unidad) => Object.freeze({ tipo: 'cuadro', clave, titulo, filas, columnas: SERVICIOS, unidad });
const campos = (clave, titulo, lista) => Object.freeze({ tipo: 'campos', clave, titulo, campos: lista });
const regla = (id, texto, prueba) => Object.freeze({ id, texto, prueba });

/* Los cinco grupos de exámenes y sus ítems, en el orden del formato DIRESA. */
export const GRUPOS_LABORATORIO = Object.freeze([
  Object.freeze({
    clave: 'bioquimicos',
    titulo: 'Exámenes bioquímicos',
    items: [f('colesterol', 'Colesterol'), f('glucosa', 'Glucosa'), f('creatinina', 'Creatinina'), f('bilirrubina', 'Bilirrubina'), f('transaminasas', 'Transaminasas'), f('fosfatasa', 'Fosfatasa alcalina'), f('trigliceridos', 'Triglicéridos'), f('otros', 'Otros')],
  }),
  Object.freeze({
    clave: 'hematologicos',
    titulo: 'Exámenes hematológicos',
    items: [f('hemoglobina', 'Hemoglobina y/o hematocrito'), f('hemograma', 'Hemograma'), f('grupo', 'Grupo sanguíneo'), f('coagulacion', 'Tiempo de sangría, coagulación y/o plaquetas'), f('vsg', 'VSG'), f('otros', 'Otros')],
  }),
  Object.freeze({
    clave: 'bacteriologicos',
    titulo: 'Exámenes bacteriológicos',
    items: [f('urocultivo', 'Urocultivo'), f('cultivos', 'Otros cultivos'), f('bk', 'Ziehl-Neelsen (BK)'), f('gram', 'GRAM (secreción vaginal y otros)'), f('otros', 'Otros')],
  }),
  Object.freeze({
    clave: 'inmunoserologicos',
    titulo: 'Exámenes inmunoserológicos',
    items: [f('aglutinaciones', 'Aglutinaciones'), f('serologicas', 'Serológicas'), f('embarazo', 'Test de embarazo'), f('vdrl', 'VDRL'), f('rpr', 'RPR'), f('elisa', 'Elisa'), f('vih', 'Prueba rápida para VIH'), f('otros', 'Otros')],
  }),
  Object.freeze({
    clave: 'parasitologicos',
    titulo: 'Exámenes parasitológicos',
    items: [f('heces', 'Parasitológico de heces'), f('gotaGruesa', 'Gota gruesa'), f('otros', 'Otros parasitológicos')],
  }),
]);

export const ITEMS_ANATOMIA = Object.freeze([
  f('pap', 'Citológicos (PAP)'),
  f('biopsia', 'Histopatológicos (biopsia)'),
  f('autopsiaLegal', 'Autopsia médico legal'),
  f('autopsiaClinica', 'Autopsia clínica'),
  f('orina', 'Examen completo de orina'),
]);

export const EXAMENES_IMAGENES = Object.freeze([
  f('fotoradiograficos', 'Fotoradiográficos'),
  f('radiograficos', 'Radiográficos'),
  f('ecograficos', 'Ecográficos'),
  f('tomograficos', 'Tomográficos'),
  f('dentales', 'Placas dentales'),
  f('otros', 'Otros'),
]);

/* Devuelve null si falta cualquiera de los valores: una regla que no se puede
   evaluar no se da por cumplida ni por incumplida. */
function comparar(datos, rutas, prueba) {
  const valores = rutas.map(([b, k]) => datos?.[b]?.[k]);
  if (valores.some((v) => v == null)) return null;
  return prueba(...valores);
}

export const ESTRUCTURAS = Object.freeze({
  nefrologia: Object.freeze({
    bloques: [
      campos('programa', 'Programa de hemodiálisis', [
        c('pacientes', 'Pacientes en el programa', 'pacientes'),
        c('nuevos', 'Pacientes nuevos', 'pacientes'),
        c('sesiones', 'Sesiones de hemodiálisis', 'sesiones'),
        c('fallecidos', 'Pacientes fallecidos', 'pacientes'),
        c('maquinas', 'Máquinas de hemodiálisis operativas', 'máquinas'),
      ]),
    ],
    reglas: [
      regla('nuevos', 'Los pacientes nuevos no superan a los del programa', (d) => comparar(d, [['programa', 'nuevos'], ['programa', 'pacientes']], (a, b) => a <= b)),
      regla('fallecidos', 'Los fallecidos no superan a los pacientes del programa', (d) => comparar(d, [['programa', 'fallecidos'], ['programa', 'pacientes']], (a, b) => a <= b)),
    ],
  }),

  laboratorio: Object.freeze({
    bloques: [
      ...GRUPOS_LABORATORIO.map((g) => cuadro(g.clave, g.titulo, g.items, 'exámenes')),
      cuadro('anatomia', 'Anatomía patológica y orina', ITEMS_ANATOMIA, 'exámenes'),
    ],
    reglas: [],
  }),

  ginecologia: Object.freeze({
    bloques: [
      campos('obstetricia', 'Atención obstétrica', [c('partos', 'Partos atendidos', 'partos'), c('cesareas', 'Cesáreas realizadas', 'cesáreas')]),
      campos('perinatal', 'Resultados perinatales', [
        c('rnVivos', 'Recién nacidos vivos en el establecimiento', 'recién nacidos'),
        c('muertesFetales', 'Muertes fetales de 22 semanas o más', 'muertes'),
        c('neonatalesPrecoces', 'Recién nacidos fallecidos en los primeros 7 días', 'muertes'),
        c('neonatalesTardias', 'Recién nacidos fallecidos entre los 8 y 28 días', 'muertes'),
      ]),
    ],
    reglas: [
      regla('cesareas', 'Las cesáreas no superan a los partos atendidos', (d) => comparar(d, [['obstetricia', 'cesareas'], ['obstetricia', 'partos']], (a, b) => a <= b)),
      regla('neonatales', 'Las muertes neonatales no superan a los recién nacidos vivos', (d) =>
        comparar(d, [['perinatal', 'neonatalesPrecoces'], ['perinatal', 'neonatalesTardias'], ['perinatal', 'rnVivos']], (a, b, v) => a + b <= v),
      ),
    ],
  }),

  /* Farmacia ya no está aquí: su informe de enero de 2026 se levantó y vive
     en `farmacia.js`. Diagnóstico por Imágenes tampoco: su oficio se levantó y vive en
     `imagenes.js`. Las filas de EXAMENES_IMAGENES siguen arriba porque son
     las del formato DIRESA, no las del área. Nutrición y Dietética tampoco:
     vive en `nutricion.js`. */
});

export function tieneEstructura(claveArea) {
  return Boolean(ESTRUCTURAS[claveArea]);
}

export function evaluarReglas(claveArea, datos) {
  return (ESTRUCTURAS[claveArea]?.reglas ?? []).map((r) => {
    let cumple;
    try {
      cumple = r.prueba(datos ?? {});
    } catch {
      cumple = null;
    }
    return { id: r.id, texto: r.texto, cumple };
  });
}

/* Suma que distingue el vacío del cero. */
export function sumar(valores) {
  const hay = valores.filter((v) => v != null);
  return hay.length ? hay.reduce((a, b) => a + b, 0) : null;
}

export function totalFila(datos, bloque, fila) {
  return sumar(SERVICIOS.map((s) => datos?.[bloque]?.[fila]?.[s.clave]));
}

export function totalColumna(datos, bloque, filas, servicio) {
  return sumar(filas.map((fl) => datos?.[bloque]?.[fl.clave]?.[servicio]));
}

export function totalCuadro(datos, bloque) {
  const def = ESTRUCTURAS_BLOQUES()[bloque];
  return def ? sumar(def.filas.map((fl) => totalFila(datos, bloque, fl.clave))) : null;
}

function ESTRUCTURAS_BLOQUES() {
  const mapa = {};
  for (const e of Object.values(ESTRUCTURAS)) for (const b of e.bloques) mapa[b.clave] = b;
  return mapa;
}

/* Cifra que resume el mes de cada área, para bandejas y tableros. */
export function cifraPrincipal(claveArea, datos) {
  if (!datos) return null;
  const d = datos;
  const cuadroTotal = (bloque, filas) => sumar(filas.map((fl) => totalFila(d, bloque, fl.clave)));

  switch (claveArea) {
    case 'nefrologia':
      return { etiqueta: 'Sesiones de hemodiálisis', valor: d.programa?.sesiones ?? null, unidad: 'sesiones' };
    case 'laboratorio':
      return {
        etiqueta: 'Exámenes realizados',
        valor: sumar([...GRUPOS_LABORATORIO.map((g) => cuadroTotal(g.clave, g.items)), cuadroTotal('anatomia', ITEMS_ANATOMIA)]),
        unidad: 'exámenes',
      };
    case 'ginecologia':
      return { etiqueta: 'Partos atendidos', valor: d.obstetricia?.partos ?? null, unidad: 'partos' };
    default:
      return null;
  }
}

/* ------------------------------------------------------------ simulación

   Magnitudes de partida pensadas para un hospital regional de unas 300 camas.
   Son órdenes de magnitud plausibles, no cifras del hospital. */

const s3 = (hosp, emerg, ce) => ({ hosp, emerg, ce });

const BASE = {
  nefrologia: { programa: { pacientes: 92, nuevos: 4, sesiones: 1150, fallecidos: 1, maquinas: 14 } },
  laboratorio: {
    bioquimicos: {
      colesterol: s3(420, 180, 1650), glucosa: s3(1900, 1350, 2600), creatinina: s3(1500, 980, 1400), bilirrubina: s3(380, 210, 260),
      transaminasas: s3(760, 430, 690), fosfatasa: s3(260, 120, 230), trigliceridos: s3(390, 150, 1500), otros: s3(2100, 1200, 1800),
    },
    hematologicos: {
      hemoglobina: s3(900, 700, 1300), hemograma: s3(2400, 1900, 2100), grupo: s3(420, 260, 380), coagulacion: s3(850, 520, 410), vsg: s3(180, 90, 320), otros: s3(300, 140, 210),
    },
    bacteriologicos: { urocultivo: s3(260, 120, 540), cultivos: s3(310, 80, 120), bk: s3(90, 30, 210), gram: s3(140, 60, 380), otros: s3(70, 20, 60) },
    inmunoserologicos: {
      aglutinaciones: s3(120, 160, 240), serologicas: s3(210, 90, 520), embarazo: s3(60, 280, 190), vdrl: s3(80, 40, 260),
      rpr: s3(70, 50, 230), elisa: s3(110, 30, 180), vih: s3(190, 140, 420), otros: s3(90, 40, 150),
    },
    parasitologicos: { heces: s3(160, 90, 640), gotaGruesa: s3(240, 310, 380), otros: s3(30, 10, 40) },
    anatomia: { pap: s3(20, 0, 540), biopsia: s3(180, 10, 120), autopsiaLegal: s3(0, 0, 0), autopsiaClinica: s3(2, 0, 0), orina: s3(780, 690, 1450) },
  },
  ginecologia: { obstetricia: { partos: 520, cesareas: 190 }, perinatal: { rnVivos: 518, muertesFetales: 6, neonatalesPrecoces: 5, neonatalesTardias: 2 } },
};

function escalarArbol(nodo, ruta, periodo, factor) {
  if (typeof nodo === 'number') {
    if (nodo === 0) return 0;
    return Math.max(0, Math.round(nodo * factor * (0.92 + aleatorio(`${periodo}:${ruta}`) * 0.16)));
  }
  return Object.fromEntries(Object.entries(nodo).map(([k, v]) => [k, escalarArbol(v, `${ruta}.${k}`, periodo, factor)]));
}

/* Ajustes que devuelven la coherencia interna que el ruido rompe: las mismas
   reglas que el sistema valida tienen que cumplirse en los datos de ejemplo. */
const AJUSTES = {
  nefrologia: (d, periodo) => {
    const p = d.programa;
    p.maquinas = aleatorio(`${periodo}:maquinas`) < 0.3 ? 13 : 14;
    p.nuevos = Math.min(p.nuevos, p.pacientes);
    p.fallecidos = Math.min(p.fallecidos, p.pacientes);
    return d;
  },
  ginecologia: (d, periodo) => {
    const o = d.obstetricia;
    const pe = d.perinatal;
    o.cesareas = Math.min(o.cesareas, o.partos);
    pe.muertesFetales = Math.min(pe.muertesFetales, o.partos);
    /* Nacidos vivos: partos menos muertes fetales, más algún parto múltiple. */
    pe.rnVivos = o.partos - pe.muertesFetales + Math.round(o.partos * 0.012 * aleatorio(`${periodo}:gemelares`));
    pe.neonatalesPrecoces = Math.min(pe.neonatalesPrecoces, pe.rnVivos);
    pe.neonatalesTardias = Math.min(pe.neonatalesTardias, pe.rnVivos - pe.neonatalesPrecoces);
    return d;
  },
};

/* Un reporte en llenado se siembra a medias: el primer renglón de cada cuadro
   y la primera mitad de los campos. Un borrador completo sin enviar no
   describe ninguna situación real. */
function recortarParcial(claveArea, datos) {
  const salida = {};
  for (const b of ESTRUCTURAS[claveArea].bloques) {
    if (!datos[b.clave]) continue;
    if (b.tipo === 'cuadro') {
      const primera = b.filas[0].clave;
      salida[b.clave] = { [primera]: datos[b.clave][primera] };
    } else {
      const mitad = b.campos.slice(0, Math.ceil(b.campos.length / 2));
      salida[b.clave] = Object.fromEntries(mitad.map((cp) => [cp.clave, datos[b.clave][cp.clave]]));
    }
  }
  return salida;
}

export function datosSimulados(claveArea, periodo, { parcial = false } = {}) {
  const base = BASE[claveArea];
  if (!base) return {};
  let datos = escalarArbol(base, claveArea, periodo, factorDelPeriodo(periodo));
  datos = AJUSTES[claveArea]?.(datos, periodo) ?? datos;
  return parcial ? recortarParcial(claveArea, datos) : datos;
}
