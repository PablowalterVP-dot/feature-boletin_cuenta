/* Lector del informe de Nefrología y Hemodiálisis, en Word.

   El servicio no llena un reporte nuevo cada mes: lleva UN cuadro del año
   entero («hemodialisis - ESTADISTICA HD 2026.doc», convertido a .docx) con
   un indicador por fila y un mes por columna, y cada mes agrega su columna
   al mismo documento. Se sube el documento completo cada vez:

     reconocer   es el cuadro del servicio y trae algo en la columna del mes
                 que se está reportando
     leerCifras  cada cifra por su fila (el rótulo) y su columna (el mes)

   Entre los meses, el cuadro trae columnas de TOTAL que el área ya calculó
   (I TRIM, II TRIM, I SEM…, TOTAL ANUAL). No son datos: se vuelven a sumar
   en reglas.js, con los meses que trae este mismo documento: el lector deja
   la fila entera (cada mes y cada total escrito) en `datos.escritos.cuadro`
   — el documento entero está disponible en cada carga, así que no hace
   falta ir a buscar los meses anteriores a la base. Se suma en las reglas, y
   no aquí, para que la corrección guiada vuelva a sumar con lo corregido.

   Dos filas comparten rótulo («CAMBIO DE(CVC) CATETER VENOSO CENTRAL»): el
   Word las separa con una columna de subrótulo («Permanente»/«Temporales»),
   que corre una casilla más a la derecha las cifras de esas dos filas
   (`columnaExtra` en definicion.js).

   Se lee `tabla.filas` (una celda de Word por celda del documento), no
   `tabla.celdas`: el cuadro real combina columnas en algunas filas (de ahí
   que una fila “normal” traiga una celda vacía de más), y esa combinación no
   es igual en todas las filas. Repararla a mano, fila por fila, es más
   seguro que confiar en el relleno automático de `docx.js`. */

import { problema } from '../../plantillas.js';
import { cifraDeCelda } from '../../docx.js';
import { letraDeColumna } from '../../xlsx.js';
import { etiquetaPeriodo } from '../../periodos.js';
import { INDICADORES, COLUMNAS, VERSION } from './definicion.js';

export { VERSION };

const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const POR_ROTULO = new Map(INDICADORES.filter((i) => !i.columnaExtra).map((i) => [normalizar(i.rotulo), i]));
const POR_SUBROTULO = new Map(INDICADORES.filter((i) => i.columnaExtra).map((i) => [normalizar(i.subrotulo), i]));
const NUM_COLUMNAS = COLUMNAS.length;
const INDICE_DEL_MES = new Map(COLUMNAS.map((c, i) => [c.tipo === 'mes' ? c.mes : null, i]).filter(([mes]) => mes != null));
const HOJA = 'Cuadro de Hemodiálisis';

/* Las filas de la tabla, como listas de texto (sin el relleno de columnas
   combinadas: ver el comentario de arriba). */
function filasDeTexto(tabla) {
  return tabla.filas.map((fila) => fila.map((c) => c.texto));
}

/* «-» (y variantes del guion) es como el servicio escribe un cero. Una celda
   vacía es «no alcanzado todavía», no cero. Cualquier otro texto no numérico
   se conserva tal cual, para mostrárselo al área. */
function cifraNefro(texto) {
  const t = String(texto ?? '').trim();
  if (t === '') return { valor: null };
  if (/^[-–—]$/.test(t)) return { valor: 0 };
  return cifraDeCelda(t);
}

/* Busca la tabla del cuadro: la que trae «INDICADOR» y los meses en su
   primera fila. El documento de Nefrología no trae otra tabla. */
function buscarTabla(documento) {
  for (const t of documento.tablas) {
    const filas = filasDeTexto(t);
    const encabezado = (filas[0] ?? []).map(normalizar);
    if (encabezado[0] === 'indicador' && encabezado.includes('ene') && encabezado.includes('feb')) return { tabla: t, filas };
  }
  return null;
}

const tablaDelCuadro = (documento) => buscarTabla(documento)?.filas ?? null;

/* La celda de una casilla, para la corrección guiada: la columna se cuenta
   con las celdas combinadas (como `tabla.celdas`, que es lo que se muestra
   y se parcha: docx.js), no como la lista de celdas de Word de la fila. */
function celdaDe(tabla, f, i) {
  const columna = (tabla.filas[f] ?? []).slice(0, i).reduce((n, c) => n + c.span, 0);
  return { hoja: HOJA, tabla: tabla.indice, fila: f + 1, columna: letraDeColumna(columna + 1) };
}

/* Las celdas de una fila, en el orden de `COLUMNAS` (0 a 18): las filas con
   `columnaExtra` traen una celda de más al principio (el subrótulo). */
function valoresDeFila(celdas, conColumnaExtra) {
  const inicio = conColumnaExtra ? 2 : 1;
  return COLUMNAS.map((_, i) => cifraNefro(celdas[inicio + i]));
}

/* El indicador de una fila, por su rótulo (o su subrótulo, si la fila trae
   la columna de más). `null` si no es una fila del catálogo. */
function indicadorDeFila(celdas) {
  const sub = normalizar(celdas[1]);
  if (POR_SUBROTULO.has(sub)) return POR_SUBROTULO.get(sub);
  const rotulo = normalizar(celdas[0]);
  return POR_ROTULO.get(rotulo) ?? null;
}

function tieneAlgo(valor) {
  return String(valor ?? '').trim() !== '';
}

export async function reconocer(documento, { periodo } = {}) {
  const filas = tablaDelCuadro(documento);
  if (!filas) {
    return {
      problema: problema('plantilla', 'Este Word no es el cuadro de Nefrología y Hemodiálisis', 'El bot busca la tabla «INDICADOR» con los meses en columnas (ENE, FEB, MAR…), como el cuadro del servicio.'),
    };
  }

  const mes = Number(periodo?.slice(5, 7));
  const columna = INDICE_DEL_MES.get(mes);
  if (columna == null) {
    return { problema: problema('plantilla-periodo', 'Periodo no reconocido', 'El periodo del reporte no corresponde a un mes del cuadro.') };
  }

  let conDato = false;
  for (let f = 1; f < filas.length; f += 1) {
    const celdas = filas[f];
    const indicador = indicadorDeFila(celdas);
    if (!indicador) continue;
    const inicio = indicador.columnaExtra ? 2 : 1;
    if (tieneAlgo(celdas[inicio + columna])) {
      conDato = true;
      break;
    }
  }
  if (!conDato) {
    const etiqueta = COLUMNAS[columna].etiqueta;
    return {
      problema: problema(
        'plantilla-periodo',
        `El cuadro no trae todavía la columna de ${etiquetaPeriodo(periodo).split(' ')[0]}`,
        `Se buscó la columna «${etiqueta}» y no tiene ninguna cifra. Agregue la columna del mes al mismo documento del año y vuelva a subirlo.`,
      ),
    };
  }

  return { plantilla: { area: 'nefrologia', periodo: periodo ?? null, version: VERSION } };
}

export async function leerCifras(documento, { periodo } = {}) {
  const encontrada = buscarTabla(documento);
  if (!encontrada) return { problema: problema('plantilla', 'No se encontró el cuadro de Nefrología') };
  const { tabla, filas } = encontrada;
  const mes = Number(periodo?.slice(5, 7));
  const columnaDelMes = INDICE_DEL_MES.get(mes);

  const datos = { f1: {}, escritos: { cuadro: {} } };
  const ilegibles = {};
  const origen = {};
  const hallazgos = [];
  const vistos = new Set();
  let leidas = 0;

  for (let f = 1; f < filas.length; f += 1) {
    const celdas = filas[f];
    const indicador = indicadorDeFila(celdas);
    if (!indicador) {
      // Una fila con texto en su primera celda que no es del catálogo: podría
      // ser un título de bloque o una fila nueva. Solo es hallazgo si trae
      // alguna cifra (si no, es una fila de adorno del Word).
      if (celdas.slice(1).some(tieneAlgo) && normalizar(celdas[0])) {
        hallazgos.push({
          id: `fila-no-catalogada|${f}`, regla: 'fila-no-catalogada', formato: 'f1',
          titulo: `«${celdas[0]}» no es un indicador del reporte`,
          detalle: `Fila ${f + 1} del cuadro. Escriba el rótulo como en el cuadro o consulte a Estadística si es un indicador nuevo.`,
        });
      }
      continue;
    }
    if (vistos.has(indicador.clave)) continue;
    vistos.add(indicador.clave);

    const valoresPorColumna = valoresDeFila(celdas, indicador.columnaExtra);
    const delMes = columnaDelMes == null ? { valor: null } : valoresPorColumna[columnaDelMes];
    if (delMes.ilegible != null) ilegibles[`f1|${indicador.clave}`] = delMes.ilegible;
    datos.f1[indicador.clave] = delMes.valor ?? null;
    if (delMes.valor != null) leidas += 1;
    const inicio = indicador.columnaExtra ? 2 : 1;
    if (columnaDelMes != null) origen[`f1|${indicador.clave}`] = celdaDe(tabla, f, inicio + columnaDelMes);

    /* La fila entera: cada mes (`mes7`) y cada total escrito (`trimestre3`).
       reglas.js vuelve a sumar los totales con los meses. */
    const fila = {};
    for (let i = 0; i < NUM_COLUMNAS; i += 1) {
      const col = COLUMNAS[i];
      const clave = col.tipo === 'mes' ? `mes${col.mes}` : col.clave;
      fila[clave] = valoresPorColumna[i].valor ?? null;
      if (col.tipo === 'agregado') origen[`escrito|f1|${indicador.clave}|${col.clave}`] = celdaDe(tabla, f, inicio + i);
    }
    datos.escritos.cuadro[indicador.clave] = fila;
  }

  const ausentes = INDICADORES.filter((i) => !vistos.has(i.clave)).map((i) => i.clave);
  if (ausentes.length) {
    hallazgos.push({
      id: 'filas-ausentes', regla: 'filas-ausentes', formato: 'f1',
      titulo: `El cuadro no trae ${ausentes.length === 1 ? 'un indicador' : `${ausentes.length} indicadores`} del reporte`,
      detalle: `${ausentes.map((c) => INDICADORES.find((i) => i.clave === c).nombre).join(', ')}. No cambie los rótulos del cuadro: el bot encuentra cada fila por su rótulo.`,
    });
  }

  if (Object.keys(ilegibles).length) datos.ilegibles = ilegibles;
  return { datos, origen, leidas, hallazgos, periodo };
}
