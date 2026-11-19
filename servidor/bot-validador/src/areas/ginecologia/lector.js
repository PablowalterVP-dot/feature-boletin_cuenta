/* Lector del Excel de Gineco-Obstetricia («EBVI_Consolidado_Mes_*.xlsx»:
   Eventos Bajo Vigilancia Institucional).

   El área sube un Excel nuevo cada mes, en una sola hoja (su nombre varía:
   «ENERO».."AGOSTO", o «Hoja1» en el de setiembre — el bot no busca por
   nombre de hoja, busca el cuadro por sus rótulos, en cualquier hoja del
   libro, como Lavandería).

   Dos cuadros en la misma hoja, cada uno con su propia fila de encabezado
   y su propia fila TOTAL (que el área ya trae sumada, y que el bot vuelve a
   sumar con sus filas — reglas.js la convierte en error si no cuadra):

     f1  EDAD · controles prenatales y partos según controles, 8 filas
     f2  (sin rótulo de fila) · TOTAL DE PARTOS, NACIMIENTOS, VIVOS, MUERTOS,
         4 filas por tipo de parto

   El Excel real solo trae f2 desde setiembre de 2026 (ver definicion.js): un
   cuadro que no aparece en la hoja es `null`, no un error de lectura. */

import { problema } from '../../plantillas.js';
import { letraDeColumna } from '../../xlsx.js';
import { EDADES, TIPOS_PARTO, COLUMNAS_F1, COLUMNAS_F2, VERSION, claveFila } from './definicion.js';

export { VERSION };

const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const POR_EDAD = new Map(EDADES.map((e) => [normalizar(e.rotulo), e]));
const POR_TIPO = new Map(TIPOS_PARTO.map((t) => [normalizar(t.rotulo), t]));

function cifra(v) {
  if (v == null) return { valor: null };
  if (typeof v === 'number') return { valor: v };
  const t = String(v).trim();
  if (t === '') return { valor: null };
  const limpio = t.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(limpio)) return { valor: Number(limpio) };
  return { valor: null, ilegible: t };
}

/* Las columnas de un cuadro, localizadas por su rótulo en la fila de
   encabezado (no por su posición fija: una columna movida no desalinea la
   lectura). */
function columnasDe(grid, filaEncabezado, columnas) {
  const porColumna = new Map();
  for (let c = 1; c <= grid.ultimaColumna; c += 1) {
    const col = columnas.find((x) => normalizar(grid.valor(filaEncabezado, c)) === normalizar(x.rotulo));
    if (col) porColumna.set(c, col);
  }
  return porColumna;
}

/* Busca, en cualquier hoja del libro, el encabezado de cada cuadro: f1 por
   «EDAD» en una celda y «CONTROLES PRENATALES…» en la siguiente; f2 por
   «TOTAL DE PARTOS» en alguna celda de la misma fila. */
async function ubicarCuadros(libro) {
  let f1 = null;
  let f2 = null;
  for (const hoja of libro.hojas) {
    const grid = await libro.cuadricula(hoja);
    for (let f = 1; f <= grid.ultimaFila; f += 1) {
      if (!f1 && normalizar(grid.valor(f, 1)) === 'edad') {
        const cols = columnasDe(grid, f, COLUMNAS_F1);
        if (cols.size === COLUMNAS_F1.length) f1 = { hoja, filaEncabezado: f, grid, columnas: cols };
      }
      if (!f2) {
        for (let c = 1; c <= grid.ultimaColumna; c += 1) {
          if (normalizar(grid.valor(f, c)) === 'total de partos') {
            const cols = columnasDe(grid, f, COLUMNAS_F2);
            if (cols.size === COLUMNAS_F2.length) f2 = { hoja, filaEncabezado: f, grid, columnas: cols };
            break;
          }
        }
      }
    }
  }
  return { f1, f2 };
}

export async function reconocer(libro, { periodo } = {}) {
  const { f1 } = await ubicarCuadros(libro);
  if (!f1) {
    return {
      problema: problema(
        'plantilla',
        'Este Excel no es el reporte de Gineco-Obstetricia',
        'El bot busca el cuadro con «EDAD» en una celda y «CONTROLES PRENATALES REALIZADOS» al lado, como el Excel EBVI del área.',
      ),
    };
  }
  return { plantilla: { area: 'ginecologia', periodo: periodo ?? null, version: VERSION } };
}

/* Las filas de un cuadro: desde la fila siguiente al encabezado hasta la
   fila «TOTAL» (inclusive). `porRotulo` identifica cada fila por su
   columna 1 (f1: el grupo de edad) o por su columna 1 también en f2 (el
   tipo de parto): las dos tablas rotulan su fila en la misma columna. */
function leerCuadro(ubicado, idCuadro, catalogoFilas, porRotulo) {
  const datos = {};
  const ilegibles = {};
  /* La celda de cada casilla y de cada TOTAL, con su marca de fórmula: la
     corrección guiada la muestra y la corrige en el libro (correccion.js). */
  const origen = {};
  const hallazgos = [];
  const totales = [];
  if (!ubicado) {
    hallazgos.push({
      id: `cuadro-ausente|${idCuadro}`,
      regla: 'cuadro-ausente',
      formato: idCuadro,
      titulo: `El Excel no trae el cuadro ${idCuadro === 'f1' ? '1 (controles prenatales)' : '2 (partos, cesáreas y nacidos)'}`,
      detalle: 'El área no incluyó este cuadro en el Excel de este mes. No se rellena con ceros: revise con el área si corresponde a este periodo.',
    });
    return { datos, ilegibles, origen, hallazgos, totales, leidas: 0, declarados: null };
  }

  const { grid, filaEncabezado, columnas } = ubicado;
  const celda = (f, c) => ({ hoja: ubicado.hoja, fila: f, columna: letraDeColumna(c), ...(grid.esFormula(f, c) ? { formula: true } : {}) });
  const vistos = new Set();
  let leidas = 0;
  let filaTotal = null;

  for (let f = filaEncabezado + 1; f <= grid.ultimaFila; f += 1) {
    const rotulo = normalizar(grid.valor(f, 1));
    if (!rotulo) {
      /* Una fila en blanco antes de la primera fila de datos es el hueco
         normal entre el encabezado y el cuadro (se salta); una fila en
         blanco después de haber leído alguna fila es el fin del cuadro —
         no todos los meses reales traen su TOTAL (setiembre no trae el del
         cuadro 1), así que no se puede esperar solo esa fila para parar. */
      if (vistos.size > 0) break;
      continue;
    }
    if (rotulo === 'total') {
      filaTotal = f;
      break;
    }
    const fila = porRotulo.get(rotulo);
    if (!fila) {
      const tieneAlgo = [...columnas.keys()].some((c) => grid.valor(f, c) != null && grid.valor(f, c) !== '');
      if (tieneAlgo) {
        hallazgos.push({
          id: `fila-no-catalogada|${idCuadro}|${f}`,
          regla: 'fila-no-catalogada',
          formato: idCuadro,
          titulo: `«${grid.valor(f, 1)}» no es una fila de este cuadro`,
          detalle: `Fila ${f} de la hoja «${ubicado.hoja}». Escriba el rótulo como en el cuadro o consulte a Estadística si es una fila nueva.`,
        });
      }
      continue;
    }
    if (vistos.has(fila.clave)) continue;
    vistos.add(fila.clave);

    for (const [c, columna] of columnas) {
      const r = cifra(grid.valor(f, c));
      const casilla = claveFila(fila.clave, columna.clave);
      if (r.ilegible != null) ilegibles[`${idCuadro}|${casilla}`] = r.ilegible;
      datos[casilla] = r.valor;
      origen[`${idCuadro}|${casilla}`] = celda(f, c);
      if (r.valor != null) leidas += 1;
    }
  }

  const ausentes = catalogoFilas.filter((x) => !vistos.has(x.clave));
  if (ausentes.length) {
    hallazgos.push({
      id: `filas-ausentes|${idCuadro}`,
      regla: 'filas-ausentes',
      formato: idCuadro,
      titulo: `El cuadro ${idCuadro === 'f1' ? '1' : '2'} no trae ${ausentes.length === 1 ? 'una fila' : `${ausentes.length} filas`}`,
      detalle: `${ausentes.map((x) => x.nombre ?? x.rotulo).join(', ')}. No cambie los rótulos del cuadro: el bot encuentra cada fila por ellos.`,
    });
  }

  /* El TOTAL que el área ya trae sumado, columna por columna: se vuelve a
     sumar con las filas de este mismo cuadro y la comparación queda para
     reglas.js, como cualquier otro total escrito. */
  let declarados = null;
  if (filaTotal != null) {
    declarados = {};
    for (const [c, columna] of columnas) {
      const r = cifra(grid.valor(filaTotal, c));
      declarados[columna.clave] = r.valor;
      origen[`escrito|${idCuadro}|${columna.clave}`] = celda(filaTotal, c);
    }
  }

  return { datos, ilegibles, origen, hallazgos, totales, leidas, declarados };
}

export async function leerCifras(libro, { periodo } = {}) {
  const { f1, f2 } = await ubicarCuadros(libro);
  if (!f1) return { problema: problema('plantilla', 'No se encontró el cuadro de controles prenatales') };

  const cf1 = leerCuadro(f1, 'f1', EDADES, POR_EDAD);
  const cf2 = leerCuadro(f2, 'f2', TIPOS_PARTO, POR_TIPO);

  const datos = { f1: cf1.datos, f2: cf2.datos, escritos: { declarados: {} } };
  if (cf1.declarados) datos.escritos.declarados.f1 = cf1.declarados;
  if (cf2.declarados) datos.escritos.declarados.f2 = cf2.declarados;

  const ilegibles = { ...cf1.ilegibles, ...cf2.ilegibles };
  if (Object.keys(ilegibles).length) datos.ilegibles = ilegibles;

  const hallazgos = [...cf1.hallazgos, ...cf2.hallazgos];
  const leidas = cf1.leidas + cf2.leidas;

  return { datos, origen: { ...cf1.origen, ...cf2.origen }, leidas, hallazgos, periodo };
}
