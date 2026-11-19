/* El cuadro de Nefrología y Hemodiálisis en Word: formato en blanco y
   ejemplos.

   Genera un .docx con la misma tabla del cuadro real del área (un indicador
   por fila, un mes por columna), para dos usos: el formato que el servicio
   puede descargar si quiere partir de uno limpio, y los ejemplos de la
   demostración y de las pruebas, con cifras ficticias, que pasan por el
   mismo lector (lector.js) que un cuadro real.

   No copia el membrete del original: solo la tabla que el bot lee. */

import { empaquetarZip } from '../../xlsx.js';
import { mesOficial } from '../../periodos.js';
import { INDICADORES, COLUMNAS } from './definicion.js';

export const VERSION_PLANTILLA = 'NEF-W1';

export function nombreDeArchivo(periodo) {
  return `HEMODIALISIS_ESTADISTICA_${periodo.slice(0, 4)}.docx`;
}

const escapar = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cifra = (v) => (v == null ? '' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v));

const parrafo = (texto, negrita = false) =>
  `<w:p><w:r>${negrita ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapar(texto)}</w:t></w:r></w:p>`;
const celda = (texto, negrita = false) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${parrafo(texto, negrita)}</w:tc>`;
const fila = (celdas) => `<w:tr>${celdas.map((c) => (typeof c === 'object' && c ? celda(c.t, c.b) : celda(c))).join('')}</w:tr>`;
const tabla = (filas) =>
  `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${filas.map(fila).join('')}</w:tbl>`;

const b = (t) => ({ t, b: true });

/* `datos` es el reporte (f1) o null para el formato en blanco. Solo se
   escribe la columna del mes pedido: las demás quedan en blanco, como un
   cuadro que recién empieza su año. `opciones.declarados`: agregados
   (I TRIM…) distintos de la suma, para los ejemplos con errores. */
export function crearPlantilla(periodo, datos = null, opciones = {}) {
  const mesNum = Number(periodo.slice(5, 7));
  const f1 = datos?.f1 ?? {};
  const d = opciones.declarados ?? {};
  const v = (x) => cifra(x);

  const encabezado = [b('INDICADOR'), ...COLUMNAS.map((c) => b(c.etiqueta))];

  const filasIndicadores = [];
  let ultimoRotuloCompartido = null;
  for (const i of INDICADORES) {
    const primeraDelPar = i.columnaExtra && i.rotulo !== ultimoRotuloCompartido;
    if (i.columnaExtra) ultimoRotuloCompartido = i.rotulo;

    const fila = [];
    if (i.columnaExtra) {
      fila.push(primeraDelPar ? i.rotulo : '');
      fila.push(i.subrotulo);
    } else {
      fila.push(i.rotulo);
    }
    for (const col of COLUMNAS) {
      if (col.tipo === 'mes' && col.mes === mesNum) fila.push(v(datos ? f1[i.clave] : null));
      else if (col.tipo === 'agregado' && d[`${i.clave}.${col.clave}`] !== undefined) fila.push(v(d[`${i.clave}.${col.clave}`]));
      else fila.push('');
    }
    filasIndicadores.push(fila);
  }

  const cuerpo = [
    parrafo('ESTADISTICA SERVICIO DE HEMODIALISIS', true),
    parrafo('ATENCIONES EJECUTADAS', true),
    parrafo(`HOSPITAL REGIONAL DE LORETO – ${periodo.slice(0, 4)} PUNCHANA – LORETO`),
    parrafo(`Columna de ${mesOficial(periodo)} de ${periodo.slice(0, 4)}.`),
    tabla([encabezado, ...filasIndicadores]),
  ].join('');

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr></w:body></w:document>`;

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
    { nombre: 'word/document.xml', contenido: documento },
  ]);
}
