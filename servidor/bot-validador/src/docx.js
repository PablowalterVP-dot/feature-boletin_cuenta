/* Lectura mínima de documentos de Word (.docx), sin dependencias.

   Un .docx es, como un .xlsx, un ZIP con XML dentro: el texto del documento
   está en `word/document.xml`. Para leer el informe mensual de Farmacia basta
   con lo justo: los párrafos (para el asunto y el periodo) y las tablas, fila
   por fila y celda por celda, con su texto. Se reutiliza el ZIP de `xlsx.js`:
   el bot sigue sin dependencias y sin una segunda manera de abrir archivos.

   Lo que no hace: estilos, imágenes, gráficos incrustados (sus cifras viven
   en otro XML y son una copia de las tablas), comentarios ni control de
   cambios. Un texto con control de cambios se lee como quedó: lo insertado
   cuenta y lo borrado no.

   Las tablas de Word se pueden anidar (una tabla dentro de una celda). Cada
   tabla se devuelve por separado y en el orden en que empieza en el
   documento; la celda que contiene a otra tabla no repite su texto. */

import { abrirZip, empaquetarZip, letraDeColumna } from './xlsx.js';
import { textosDeEmf } from './emf.js';
import { esCompuesto, leerDoc } from './doc.js';
import { documento as documentoNuevo, parrafo as parrafoNuevo, tabla as tablaNueva } from './docx-plantilla.js';

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function desescapar(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTIDADES[e] ?? m;
  });
}

/* Quita lo que Word guarda dos veces o que no es texto del documento: la
   versión de respaldo de un dibujo (mc:Fallback repite el texto de mc:Choice),
   lo borrado con control de cambios y las propiedades de párrafo o de fila. */
function limpiar(xml) {
  return xml
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')
    .replace(/<w:del\b[\s\S]*?<\/w:del>/g, '')
    .replace(/<w:delText\b[\s\S]*?<\/w:delText>/g, '');
}

const normal = (texto) => texto.replace(/\s+/g, ' ').trim();

/* Recorre el cuerpo del documento con una pila de tablas, filas y celdas. */
function analizar(xml) {
  const cuerpo = limpiar(xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? xml);
  const tablas = [];
  const parrafos = [];
  const pila = [];
  let parrafo = null;

  const marca = /<(\/?)w:(tbl|tr|tc|p|t|tab|br|cr|gridSpan)\b([^>]*?)(\/?)>/g;
  let m;
  while ((m = marca.exec(cuerpo))) {
    const [, cierre, etiqueta, atributos, solo] = m;
    const tabla = pila.at(-1);

    if (etiqueta === 'tbl') {
      if (!cierre) {
        const nueva = { filas: [], indice: tablas.length, nivel: pila.length };
        tablas.push(nueva);
        pila.push(nueva);
      } else pila.pop();
    } else if (etiqueta === 'tr' && tabla) {
      if (!cierre && !solo) tabla.filas.push([]);
    } else if (etiqueta === 'tc' && tabla) {
      if (!cierre && !solo) tabla.filas.at(-1)?.push({ texto: '', span: 1 });
    } else if (etiqueta === 'gridSpan' && tabla) {
      const celda = tabla.filas.at(-1)?.at(-1);
      const n = Number(atributos.match(/w:val="(\d+)"/)?.[1]);
      if (celda && n > 1) celda.span = n;
    } else if (etiqueta === 'p') {
      if (!cierre && !solo) parrafo = { texto: '' };
      else if (cierre && parrafo) {
        const texto = normal(parrafo.texto);
        const celda = tabla?.filas.at(-1)?.at(-1);
        if (celda) celda.texto = normal(`${celda.texto} ${texto}`);
        else if (texto) parrafos.push(texto);
        parrafo = null;
      }
    } else if (etiqueta === 't' && !cierre && !solo && parrafo) {
      const fin = cuerpo.indexOf('</w:t>', marca.lastIndex);
      if (fin < 0) break;
      parrafo.texto += desescapar(cuerpo.slice(marca.lastIndex, fin));
      marca.lastIndex = fin + 6;
    } else if ((etiqueta === 'tab' || etiqueta === 'br' || etiqueta === 'cr') && parrafo) {
      parrafo.texto += ' ';
    }
  }

  /* Cada fila como lista de textos, con las celdas combinadas repetidas como
     vacías a su derecha: así la columna de una cifra no se corre cuando una
     fila combina dos celdas y la siguiente no. */
  for (const t of tablas) {
    t.celdas = t.filas.map((fila) => fila.flatMap((c) => [c.texto, ...Array(c.span - 1).fill('')]));
  }
  return { tablas, parrafos };
}

/* Abre un .docx y devuelve { parrafos, tablas, texto, dibujos }. Lanza si el
   archivo no es un ZIP o no tiene el cuerpo de un documento de Word.

   `dibujos`: los textos de cada cuadro pegado como imagen EMF (emf.js), con
   su posición. No entran en `texto` ni en `tablas`: un área los usa solo si
   le falta un cuadro (Farmacia, el resumen de julio de 2026). Una imagen PNG
   o JPG no trae texto y no se lee. */
export async function leerDocumento(buffer) {
  /* Un Word 97-2003 (.doc) se lee con doc.js y sale con la misma forma. */
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (esCompuesto(bytes)) return leerDoc(bytes);
  const zip = abrirZip(buffer);
  const xml = await zip.texto('word/document.xml');
  if (!xml) throw new Error('No es un documento de Word: falta word/document.xml.');
  const { tablas, parrafos } = analizar(xml);
  const texto = [...parrafos, ...tablas.flatMap((t) => t.celdas.flat())].join(' ');
  const dibujos = [];
  for (const nombre of zip.nombres().filter((n) => /^word\/media\/[^/]+\.emf$/i.test(n)).sort()) {
    try {
      const textos = textosDeEmf(await zip.bytes(nombre));
      if (textos.length) dibujos.push({ nombre: nombre.slice('word/media/'.length), textos });
    } catch {
      // Un dibujo que no se puede leer no impide leer el documento.
    }
  }
  return { tipo: 'docx', parrafos, tablas, texto, dibujos };
}

/* Cifra de una celda de Word. «18,878» y «18 878» son 18878; «0» es cero; una
   celda vacía es null (no se registró). Otro texto es ilegible y se devuelve
   tal cual para mostrárselo al área. */
export function cifraDeCelda(texto) {
  const t = normal(String(texto ?? ''));
  if (t === '') return { valor: null };
  const limpio = t.replace(/[\s,]/g, '');
  if (/^-?\d+$/.test(limpio)) return { valor: Number(limpio) };
  if (/^-?\d+\.\d+$/.test(limpio)) return { valor: Number(limpio) };
  return { valor: null, ilegible: t };
}

/* ------------------------------------------------- corrección guiada

   La corrección guiada (correccion.js) muestra el archivo del área al lado
   del formulario y devuelve el MISMO archivo con solo las celdas corregidas.
   Para un Word, cada tabla hace de hoja: la celda se nombra como en un Excel,
   la columna en letra (contando las celdas combinadas, como `tabla.celdas`)
   y la fila desde 1. Los lectores guardan en el origen de cada casilla su
   `tabla` (el índice en `documento.tablas`) y esa referencia. */

/* ¿Es un Word (.docx, o .doc 97-2003)? Sin lanzar: un archivo que no es ZIP
   ni un .doc legible no es Word. */
export async function esDocumento(buffer) {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (esCompuesto(bytes)) return Boolean(leerDoc(bytes));
    return abrirZip(buffer).nombres().includes('word/document.xml');
  } catch {
    return false;
  }
}

/* Una tabla del Word como hoja de la corrección: { valores: { ref: cifra o texto }, formulas: [] }. */
export function hojaDeTabla(tabla) {
  const valores = {};
  tabla.celdas.forEach((fila, f) => {
    fila.forEach((texto, c) => {
      if (!String(texto ?? '').trim()) return;
      const { valor } = cifraDeCelda(texto);
      valores[`${letraDeColumna(c + 1)}${f + 1}`] = valor ?? texto;
    });
  });
  return { valores, formulas: [] };
}

const escaparXml = (texto) => String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Una cifra como la escribe el Word del área: con coma de miles («18,878»),
   que cifraDeCelda vuelve a leer igual. Sin cifra, la celda queda vacía. */
const textoDeCifra = (valor) => (valor == null ? '' : valor.toLocaleString('en-US', { maximumFractionDigits: 6 }));

/* El texto nuevo de una celda: el primer <w:t> lo lleva (conserva el formato
   de su tramo) y los demás se vacían. Una celda sin texto recibe un tramo en
   su primer párrafo. */
function ponerTextoEnCelda(xml, texto) {
  const tramo = /<w:t(\s[^>]*)?>[\s\S]*?<\/w:t>|<w:t(\s[^>]*)?\/>/g;
  let primero = true;
  const cambiado = xml.replace(tramo, () => {
    if (!primero) return '<w:t/>';
    primero = false;
    return `<w:t xml:space="preserve">${escaparXml(texto)}</w:t>`;
  });
  if (!primero) return cambiado;
  const run = `<w:r><w:t xml:space="preserve">${escaparXml(texto)}</w:t></w:r>`;
  if (xml.includes('</w:p>')) return xml.replace('</w:p>', `${run}</w:p>`);
  return xml.replace(/<w:p(\s[^>]*)?\/>/, (m, a = '') => `<w:p${a}>${run}</w:p>`);
}

/* Las celdas de cada tabla, con su posición en el XML: recorre el cuerpo como
   `analizar` (mismo orden de tablas, mismas columnas combinadas) y salta lo
   que `limpiar` quita, para que los índices coincidan con los del lector. */
function celdasConPosicion(xml) {
  const inicioCuerpo = xml.indexOf('<w:body>');
  const finCuerpo = xml.lastIndexOf('</w:body>');
  const desde = inicioCuerpo < 0 ? 0 : inicioCuerpo;
  const hasta = finCuerpo < 0 ? xml.length : finCuerpo;
  const saltos = [];
  for (const patron of [/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, /<w:del\b[\s\S]*?<\/w:del>/g, /<w:delText\b[\s\S]*?<\/w:delText>/g]) {
    for (const m of xml.matchAll(patron)) saltos.push([m.index, m.index + m[0].length]);
  }
  const saltado = (i) => saltos.some(([a, b]) => i >= a && i < b);

  const celdas = [];
  const pila = [];
  let tablas = 0;
  const marca = /<(\/?)w:(tbl|tr|tc|gridSpan)\b([^>]*?)(\/?)>/g;
  marca.lastIndex = desde;
  let m;
  while ((m = marca.exec(xml)) && m.index < hasta) {
    if (saltado(m.index)) continue;
    const [, cierre, etiqueta, atributos, solo] = m;
    const tabla = pila.at(-1);
    if (etiqueta === 'tbl') {
      if (!cierre) pila.push({ indice: tablas++, fila: -1, columna: 0, celda: null });
      else pila.pop();
    } else if (etiqueta === 'tr' && tabla && !cierre && !solo) {
      tabla.fila += 1;
      tabla.columna = 0;
    } else if (etiqueta === 'tc' && tabla && !solo) {
      if (!cierre) tabla.celda = { tabla: tabla.indice, fila: tabla.fila, columna: tabla.columna, span: 1, inicio: m.index + m[0].length };
      else if (tabla.celda) {
        celdas.push({ ...tabla.celda, fin: m.index });
        tabla.columna += tabla.celda.span;
        tabla.celda = null;
      }
    } else if (etiqueta === 'gridSpan' && tabla?.celda) {
      const n = Number(atributos.match(/w:val="(\d+)"/)?.[1]);
      if (n > 1) tabla.celda.span = n;
    }
  }
  return celdas;
}

/* El documento corregido: los mismos bytes, con solo esas celdas cambiadas.
   cambios: [{ tabla, ref: 'C4', valor: número | null }]. */
export async function parchearDocumento(buffer, cambios) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (esCompuesto(bytes)) return parchearDocumento(docxDeDoc(bytes), cambios);
  const zip = abrirZip(buffer);
  const xml = await zip.texto('word/document.xml');
  if (!xml) throw new Error('No es un documento de Word: falta word/document.xml.');
  const celdas = celdasConPosicion(xml);
  const reemplazos = cambios.map(({ tabla, ref, valor }) => {
    const m = String(ref).match(/^([A-Z]+)(\d+)$/);
    if (!m) throw new Error(`«${ref}» no es una celda.`);
    if (valor != null && !Number.isFinite(valor)) throw new Error(`«${valor}» no es una cifra para ${ref}.`);
    const columna = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const fila = Number(m[2]) - 1;
    const celda = celdas.find((c) => c.tabla === tabla && c.fila === fila && columna >= c.columna && columna < c.columna + c.span);
    if (!celda) throw new Error(`La tabla ${tabla + 1} del Word no tiene la celda ${ref}.`);
    return { celda, texto: textoDeCifra(valor) };
  });
  let nuevo = xml;
  for (const { celda, texto } of reemplazos.sort((a, b) => b.celda.inicio - a.celda.inicio)) {
    nuevo = nuevo.slice(0, celda.inicio) + ponerTextoEnCelda(nuevo.slice(celda.inicio, celda.fin), texto) + nuevo.slice(celda.fin);
  }
  return empaquetarZip(
    zip.nombres().map((nombre) => (nombre === 'word/document.xml' ? { nombre, contenido: nuevo } : { nombre, crudo: zip.crudo(nombre) })),
  );
}

/* Un .doc no se puede corregir celda por celda sin reescribirlo entero: la
   corrección guiada devuelve un .docx con sus párrafos y sus tablas, celda
   por celda y con las mismas celdas combinadas: así las filas y las
   referencias del lector siguen valiendo. Pierde el formato, no las cifras;
   el área lo abre en Word como cualquier otro. */
export function docxDeDoc(bytes) {
  const { parrafos, tablas } = leerDoc(bytes);
  const filas = (t) => t.filas.map((f) => f.map((c) => ({ t: c.texto, span: c.span })));
  return documentoNuevo([...parrafos.map((t) => parrafoNuevo(t)), ...tablas.map((t) => tablaNueva(filas(t)))], { horizontal: true });
}
