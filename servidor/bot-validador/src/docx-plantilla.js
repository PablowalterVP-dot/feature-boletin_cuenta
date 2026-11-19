/* Escritura mínima de un .docx: párrafos y tablas, sin estilos propios.

   La usan los formatos en blanco y los ejemplos de las áreas que suben Word
   (Epidemiología, Diagnóstico por Imágenes): un documento con las mismas
   tablas que el original, que pasa por el mismo lector. No copia membretes,
   imágenes ni gráficos: solo lo que el bot lee.

   Una celda puede abarcar varias columnas (`span`), como las del original:
   así el lector encuentra cada cifra en la misma columna que en el Word del
   área. */

import { empaquetarZip } from './xlsx.js';

const escapar = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function parrafo(texto, negrita = false) {
  return `<w:p><w:r>${negrita ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapar(texto)}</w:t></w:r></w:p>`;
}

/* Una celda: texto, o { t, b (negrita), span (columnas que abarca) }. */
function celda(c) {
  const { t = '', b = false, span = 1 } = typeof c === 'object' && c !== null ? c : { t: c };
  const combinada = span > 1 ? `<w:gridSpan w:val="${span}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${combinada}</w:tcPr>${parrafo(t, b)}</w:tc>`;
}

const BORDES = '<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>';

export function tabla(filas) {
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${BORDES}</w:tblPr>${filas.map((f) => `<w:tr>${f.map(celda).join('')}</w:tr>`).join('')}</w:tbl>`;
}

/* El texto de una cifra como la escriben las áreas: con coma de miles. Sin
   cifra, la celda queda vacía. Un texto se escribe tal cual (los ejemplos
   con errores lo usan). */
export function cifra(v) {
  if (v == null) return '';
  return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v);
}

/* El .docx con esos bloques (párrafos y tablas ya escritos). */
export function documento(bloques, { horizontal = false } = {}) {
  const pagina = horizontal ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bloques.join('')}<w:sectPr>${pagina}</w:sectPr></w:body></w:document>`;
  return empaquetarZip([
    {
      nombre: '[Content_Types].xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    { nombre: 'word/document.xml', contenido: xml },
  ]);
}
