/* Lector del oficio de Epidemiología, en Word.

     reconocer   es el oficio de vigilancia: trae la tabla de infecciones
                 intrahospitalarias, y su «MES:» es el del reporte abierto
     leerCifras  cada cifra por su grupo de edad (el rótulo de la fila) y su
                 columna (el servicio y el sexo, en el orden de definicion.js)

   La tabla se reconoce por sus encabezados («Grupos de edad», «Neonatología»,
   «Muerte materna»…) y las columnas se comprueban contra ellos antes de leer
   una sola cifra: si el área agrega o quita una columna, el bot lo dice en
   lugar de correr las cifras a la columna vecina.

   Se lee `tabla.filas` (una celda de Word por celda del documento): las filas
   de edad traen 16 celdas (N.º, grupo y 14 cifras) y la fila TOTAL 15, porque
   combina N.º y grupo en una sola. */

import { problema } from '../../plantillas.js';
import { cifraDeCelda } from '../../docx.js';
import { letraDeColumna } from '../../xlsx.js';
import { etiquetaPeriodo } from '../../periodos.js';
import { EDADES, COLUMNAS, GRUPOS, VERSION } from './definicion.js';

export { VERSION };

const HOJA = 'Infecciones intrahospitalarias';

const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/* El rótulo de edad, sin espacios ni signos: «5 -9 años» y «5 - 9 años» son
   la misma fila. «Menor de 1 año» y «65 años a más» se reconocen por su texto. */
function edadDeRotulo(texto) {
  const t = normalizar(texto);
  if (/menor/.test(t)) return 'e0';
  if (/65/.test(t)) return 'e65';
  const m = t.match(/^(\d+)\s*a?\s*(\d+)/);
  if (!m) return null;
  return EDADES.find((e) => e.desde === Number(m[1]) && e.hasta === Number(m[2]))?.clave ?? null;
}

/* Cómo escribe el área el mes del oficio: «MES: Enero-26», «MES: FEBRERO
   2026», «MES: mar-26», «MES: sep-26». */
const MESES = [
  ['enero', 'ene'], ['febrero', 'feb'], ['marzo', 'mar'], ['abril', 'abr'], ['mayo', 'may'], ['junio', 'jun'],
  ['julio', 'jul'], ['agosto', 'ago'], ['setiembre', 'septiembre', 'set', 'sep'], ['octubre', 'oct'], ['noviembre', 'nov'], ['diciembre', 'dic'],
];

export function periodoDelMes(texto) {
  const palabras = normalizar(texto).split(' ');
  const i = palabras.findIndex((p) => MESES.some((nombres) => nombres.includes(p)));
  if (i < 0) return null;
  const mes = MESES.findIndex((nombres) => nombres.includes(palabras[i])) + 1;
  const anio = palabras.slice(i + 1).find((p) => /^\d{2}$|^\d{4}$/.test(p));
  if (!anio) return null;
  return `${anio.length === 2 ? `20${anio}` : anio}-${String(mes).padStart(2, '0')}`;
}

function periodoDelDocumento(documento) {
  const linea = documento.parrafos.find((p) => /^\s*MES\s*:/i.test(p));
  return linea ? { periodo: periodoDelMes(linea.replace(/^\s*MES\s*:/i, '')), texto: linea.trim() } : null;
}

/* La tabla de infecciones: la que trae «Grupos de edad» y «Neonatología» en
   su primera fila. */
function buscarTabla(documento) {
  for (const t of documento.tablas) {
    const cabecera = (t.filas[0] ?? []).map((c) => normalizar(c.texto)).join(' | ');
    if (/grupos de edad/.test(cabecera) && /neonatolog/.test(cabecera)) return t;
  }
  return null;
}

/* Lo que el encabezado debe decir, columna por columna, para que el orden de
   definicion.js sea el del Word. */
const PISTAS = Object.freeze({
  neonatologia: /neonatolog/,
  uci: /uci/,
  gineco: /gineco/,
  itu: /tracto urinario/,
  iho: /herida operatoria/,
  muerte_neonatal: /muerte neonatal/,
  muerte_materna: /muerte materna/,
  otras: /otras infecciones/,
});

function encabezadoCuadra(tabla) {
  const grupos = (tabla.filas[0] ?? []).slice(2).map((c) => normalizar(c.texto));
  if (grupos.length !== GRUPOS.length) return `La tabla trae ${grupos.length} grupos de columnas y el reporte tiene ${GRUPOS.length}.`;
  const distinto = GRUPOS.findIndex((g, i) => !PISTAS[g.clave].test(grupos[i]));
  if (distinto >= 0) return `La columna ${distinto + 1} dice «${tabla.filas[0][distinto + 2].texto}», y en el reporte va «${GRUPOS[distinto].label}».`;
  return null;
}

function celdaDe(tabla, f, i) {
  const columna = (tabla.filas[f] ?? []).slice(0, i).reduce((n, c) => n + c.span, 0);
  return { hoja: HOJA, tabla: tabla.indice, fila: f + 1, columna: letraDeColumna(columna + 1) };
}

export async function reconocer(documento, { periodo } = {}) {
  const tabla = buscarTabla(documento);
  if (!tabla) {
    return {
      problema: problema(
        'plantilla',
        'Este Word no es el oficio de vigilancia de Epidemiología',
        'El bot busca la tabla «Número de casos nuevos de infecciones intrahospitalarias», con los grupos de edad en filas y Neonatología, UCI, Gineco-Obstetricia… en columnas.',
      ),
    };
  }
  const descuadre = encabezadoCuadra(tabla);
  if (descuadre) {
    return { problema: problema('plantilla-columnas', 'Las columnas de la tabla no son las del reporte', `${descuadre} No cambie el orden ni los títulos de las columnas: el bot encuentra cada cifra por su columna.`) };
  }
  const delWord = periodoDelDocumento(documento);
  if (delWord?.periodo && periodo && delWord.periodo !== periodo) {
    return {
      problema: problema(
        'plantilla-periodo',
        `Este oficio es de ${etiquetaPeriodo(delWord.periodo).toLowerCase()}, no de ${etiquetaPeriodo(periodo).toLowerCase()}`,
        `El Word dice «${delWord.texto}». Suba el oficio del mes que está reportando.`,
      ),
    };
  }
  return { plantilla: { area: 'epidemiologia', periodo: periodo ?? null, version: VERSION } };
}

export async function leerCifras(documento, { periodo } = {}) {
  const tabla = buscarTabla(documento);
  if (!tabla) return { problema: problema('plantilla', 'No se encontró la tabla de infecciones intrahospitalarias') };

  const datos = { f1: {}, escritos: { total: {} } };
  const ilegibles = {};
  const origen = {};
  const hallazgos = [];
  const vistas = new Set();
  let leidas = 0;
  let blancos = 0;

  for (let f = 1; f < tabla.filas.length; f += 1) {
    const fila = tabla.filas[f];
    const textos = fila.map((c) => c.texto);
    const esTotal = normalizar(textos[0]) === 'total';
    /* Las cifras empiezan después de N.º y del grupo de edad; en la fila TOTAL,
       después de la celda que combina los dos. */
    const inicio = esTotal ? 1 : 2;
    if (esTotal) {
      COLUMNAS.forEach((c, i) => {
        const leida = cifraDeCelda(textos[inicio + i]);
        datos.escritos.total[c.clave] = leida.valor ?? null;
        origen[`escrito|total|${c.clave}`] = celdaDe(tabla, f, inicio + i);
      });
      continue;
    }
    const edad = edadDeRotulo(textos[1]);
    if (!edad) {
      if (textos.slice(2).some((t) => String(t).trim()) && normalizar(textos[1])) {
        hallazgos.push({
          id: `fila-no-catalogada|${f}`, regla: 'fila-no-catalogada', formato: 'f1',
          titulo: `«${textos[1]}» no es un grupo de edad del reporte`,
          detalle: `Fila ${f + 1} de la tabla. Escriba el grupo como en el oficio (por ejemplo «20 - 24 años») o consulte a Estadística si es un grupo nuevo.`,
        });
      }
      continue;
    }
    if (vistas.has(edad)) continue;
    vistas.add(edad);
    const cifras = {};
    COLUMNAS.forEach((c, i) => {
      const texto = textos[inicio + i];
      const casilla = `f1|${edad}.${c.clave}`;
      origen[casilla] = celdaDe(tabla, f, inicio + i);
      if (String(texto ?? '').trim() === '') {
        /* Así escribe el área un «sin casos»: ver definicion.js. */
        cifras[c.clave] = 0;
        blancos += 1;
        leidas += 1;
        return;
      }
      const leida = cifraDeCelda(texto);
      if (leida.ilegible != null) ilegibles[casilla] = leida.ilegible;
      cifras[c.clave] = leida.valor ?? null;
      leidas += 1;
    });
    datos.f1[edad] = cifras;
  }

  const faltan = EDADES.filter((e) => !vistas.has(e.clave));
  if (faltan.length) {
    hallazgos.push({
      id: 'filas-ausentes', regla: 'filas-ausentes', formato: 'f1',
      titulo: `La tabla no trae ${faltan.length === 1 ? 'un grupo de edad' : `${faltan.length} grupos de edad`}`,
      detalle: `${faltan.map((e) => e.label).join(', ')}. No borre filas de la tabla: un grupo sin casos se deja en blanco.`,
      casillas: faltan.map((e) => e.clave),
    });
  }
  if (blancos) {
    hallazgos.push({
      id: 'blancos-son-cero', regla: 'blancos-son-cero', formato: 'f1',
      titulo: `${blancos} celdas en blanco se leyeron como 0`,
      detalle: 'El oficio deja en blanco los grupos sin casos y escribe 0 solo en la fila TOTAL; así se suman.',
    });
  }
  const delWord = periodoDelDocumento(documento);
  if (!delWord?.periodo) {
    hallazgos.push({
      id: 'sin-mes', regla: 'sin-mes', formato: 'f1',
      titulo: 'El oficio no dice de qué mes es',
      detalle: 'No se encontró la línea «MES:» sobre la tabla. Se cargó en el reporte abierto; revise que sea el mes correcto.',
    });
  }

  if (Object.keys(ilegibles).length) datos.ilegibles = ilegibles;
  return { datos, origen, leidas, hallazgos, periodo };
}
