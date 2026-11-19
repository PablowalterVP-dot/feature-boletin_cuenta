/* Lectura y escritura mínima de archivos .xlsx, sin dependencias.

   Un .xlsx es un ZIP con hojas en XML. Para leer la plantilla de un área y
   para generarla basta con lo justo: celdas con número, texto o fórmula,
   nombres definidos, anchos de columna, celdas combinadas y paneles fijos.
   Se hace aquí en lugar de depender de SheetJS: el bot no tiene dependencias
   y el sistema tampoco las admite sin autorizarlas. Si se autoriza, este
   archivo es lo único que cambia.

   Lo que no hace: fórmulas (se leen sus valores ya calculados, que Excel y
   LibreOffice guardan al grabar), fechas, estilos al leer, ZIP64 ni
   archivos .xls antiguos.

   Además corrige un libro existente (`parchearLibro`): cambia el valor de
   unas celdas de una hoja y deja todo lo demás —estilos, colores, logos,
   gráficos, las otras hojas— byte por byte como venía.

   Funciona igual en el navegador y en Node (la prueba de humo): descomprime
   con DecompressionStream y lee el XML con expresiones regulares, sin DOM. */

/* ------------------------------------------------------------------ ZIP */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ZIP sin compresión (método 0): Excel lo abre igual y no hace falta deflate.
   Una entrada con `crudo` ({ metodo, datos, crc, tamano }, de `abrirZip`) se
   copia tal como venía comprimida: así una imagen o una hoja que no cambió no
   pasa por ningún proceso que pudiera alterarla. */
export function empaquetarZip(archivos) {
  const cod = new TextEncoder();
  const partes = [];
  const central = [];
  let desplazamiento = 0;

  for (const { nombre, contenido, crudo } of archivos) {
    const n = cod.encode(nombre);
    const datos = crudo ? crudo.datos : typeof contenido === 'string' ? cod.encode(contenido) : contenido;
    const metodo = crudo ? crudo.metodo : 0;
    const crc = crudo ? crudo.crc : crc32(datos);
    const tamano = crudo ? crudo.tamano : datos.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, metodo, true);
    local.setUint16(12, 0x0021, true); // 1 de enero de 1980
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, tamano, true);
    local.setUint16(26, n.length, true);
    partes.push(new Uint8Array(local.buffer), n, datos);

    const cabecera = new DataView(new ArrayBuffer(46));
    cabecera.setUint32(0, 0x02014b50, true);
    cabecera.setUint16(4, 20, true);
    cabecera.setUint16(6, 20, true);
    cabecera.setUint16(8, 0x0800, true);
    cabecera.setUint16(10, metodo, true);
    cabecera.setUint16(14, 0x0021, true);
    cabecera.setUint32(16, crc, true);
    cabecera.setUint32(20, datos.length, true);
    cabecera.setUint32(24, tamano, true);
    cabecera.setUint16(28, n.length, true);
    cabecera.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(cabecera.buffer), n);

    desplazamiento += 30 + n.length + datos.length;
  }

  const tamanoCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamanoCentral, true);
  fin.setUint32(16, desplazamiento, true);

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of todo) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

async function inflar(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/* Índice del ZIP: nombre → función que devuelve su texto. Solo se
   descomprime lo que se pide. Lanza si el archivo no es un ZIP. */
export function abrirZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('No es un archivo .xlsx: no tiene la estructura de un libro de Excel.');

  const entradas = new Map();
  const total = vista.getUint16(fin + 10, true);
  let p = vista.getUint32(fin + 16, true);
  const dec = new TextDecoder();

  for (let k = 0; k < total; k += 1) {
    if (vista.getUint32(p, true) !== 0x02014b50) throw new Error('El archivo está dañado.');
    const metodo = vista.getUint16(p + 10, true);
    const crc = vista.getUint32(p + 16, true);
    const comprimido = vista.getUint32(p + 20, true);
    const tamano = vista.getUint32(p + 24, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const largoExtra = vista.getUint16(p + 30, true);
    const largoComentario = vista.getUint16(p + 32, true);
    const local = vista.getUint32(p + 42, true);
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    entradas.set(nombre, { metodo, crc, comprimido, tamano, local });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }

  const crudo = (e) => {
    const inicio = e.local + 30 + vista.getUint16(e.local + 26, true) + vista.getUint16(e.local + 28, true);
    return bytes.subarray(inicio, inicio + e.comprimido);
  };

  return {
    tiene: (nombre) => entradas.has(nombre),
    /* Los nombres en el orden del archivo, para volver a empaquetarlo igual. */
    nombres: () => [...entradas.keys()],
    /* Una entrada tal como está guardada, sin descomprimir (empaquetarZip). */
    crudo(nombre) {
      const e = entradas.get(nombre);
      return e ? { metodo: e.metodo, datos: crudo(e), crc: e.crc, tamano: e.tamano } : null;
    },
    async texto(nombre) {
      const e = entradas.get(nombre);
      if (!e) return null;
      const datos = crudo(e);
      if (e.metodo === 0) return dec.decode(datos);
      if (e.metodo === 8) return dec.decode(await inflar(datos));
      throw new Error('El archivo usa una compresión que no se puede leer.');
    },
    /* Una entrada binaria, descomprimida (las imágenes de un Word: docx.js). */
    async bytes(nombre) {
      const e = entradas.get(nombre);
      if (!e) return null;
      const datos = crudo(e);
      if (e.metodo === 0) return datos;
      if (e.metodo === 8) return inflar(datos);
      throw new Error('El archivo usa una compresión que no se puede leer.');
    },
  };
}

/* ------------------------------------------------------------ utilidades */

export function letraDeColumna(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function numeroDeColumna(letras) {
  return [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}

export function referencia(columna, fila) {
  return `${letraDeColumna(columna)}${fila}`;
}

function escapar(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function desescapar(texto) {
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function atributos(texto) {
  const a = {};
  for (const m of texto.matchAll(/([\w:]+)="([^"]*)"/g)) a[m[1]] = desescapar(m[2]);
  return a;
}

/* ---------------------------------------------------------- escritura */

/* Estilos del archivo. Son colores del documento Excel, en su formato ARGB:
   el Excel no lee las variables CSS del sistema. Índices de `cellXfs`:
     0 normal · 1 título · 2 cabecera · 3 casilla para escribir
     4 casilla de fin de semana · 5 total · 6 etiqueta de fila · 7 nota */
export const ESTILO = Object.freeze({ normal: 0, titulo: 1, cabecera: 2, entrada: 3, finde: 4, total: 5, etiqueta: 6, nota: 7 });

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="13"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF637381"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F2EF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F3F5"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6D6"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFC4CDD5"/></left><right style="thin"><color rgb="FFC4CDD5"/></right><top style="thin"><color rgb="FFC4CDD5"/></top><bottom style="thin"><color rgb="FFC4CDD5"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="1" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="3" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
</styleSheet>`;

function celdaXml(ref, celda) {
  if (celda == null) return '';
  const c = typeof celda === 'object' ? celda : { v: celda };
  const s = c.estilo ? ` s="${c.estilo}"` : '';
  if (c.f) {
    const v = typeof c.v === 'number' ? `<v>${c.v}</v>` : '';
    return `<c r="${ref}"${s}><f>${escapar(c.f)}</f>${v}</c>`;
  }
  if (typeof c.v === 'number') return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  if (c.v == null || c.v === '') return c.estilo ? `<c r="${ref}"${s}/>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapar(c.v)}</t></is></c>`;
}

function hojaXml(hoja) {
  const vista = hoja.congelar
    ? `<sheetViews><sheetView workbookViewId="0"${hoja.primera ? ' tabSelected="1"' : ''}><pane xSplit="${hoja.congelar.columnas}" ySplit="${hoja.congelar.filas}" topLeftCell="${referencia(hoja.congelar.columnas + 1, hoja.congelar.filas + 1)}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"${hoja.primera ? ' tabSelected="1"' : ''}/></sheetViews>`;
  const cols = hoja.anchos?.length
    ? `<cols>${hoja.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const filas = hoja.filas
    .map((fila, i) => {
      const celdas = fila.map((celda, j) => celdaXml(referencia(j + 1, i + 1), celda)).join('');
      const alto = hoja.altos?.[i] ? ` ht="${hoja.altos[i]}" customHeight="1"` : '';
      return celdas || alto ? `<row r="${i + 1}"${alto}>${celdas}</row>` : '';
    })
    .join('');
  const combinadas = hoja.combinadas?.length
    ? `<mergeCells count="${hoja.combinadas.length}">${hoja.combinadas.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${vista}${cols}<sheetData>${filas}</sheetData>${combinadas}</worksheet>`;
}

/* libro: { hojas: [{ nombre, oculta?, filas: celda[][], anchos?, altos?,
   combinadas?, congelar? }], nombres: [{ nombre, ref }] }
   celda: número | texto | { v, f?, estilo? } | null */
export function crearLibro({ hojas, nombres = [] }) {
  const archivos = [];
  const sobrescrituras = hojas
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');

  archivos.push({
    nombre: '[Content_Types].xml',
    contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sobrescrituras}</Types>`,
  });
  archivos.push({
    nombre: '_rels/.rels',
    contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  });
  archivos.push({
    nombre: 'xl/workbook.xml',
    contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
      .map((h, i) => `<sheet name="${escapar(h.nombre)}" sheetId="${i + 1}"${h.oculta ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`)
      .join('')}</sheets>${
      nombres.length ? `<definedNames>${nombres.map((n) => `<definedName name="${n.nombre}">${escapar(n.ref)}</definedName>`).join('')}</definedNames>` : ''
    }<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
  });
  archivos.push({
    nombre: 'xl/_rels/workbook.xml.rels',
    contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  });
  archivos.push({ nombre: 'xl/styles.xml', contenido: ESTILOS_XML });
  hojas.forEach((h, i) => archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h) }));

  return empaquetarZip(archivos);
}

/* ------------------------------------------------------------- lectura */

/* Devuelve { hojas: [nombre], nombres: Map, valor(hoja, ref), rango(nombre) }.
   Un valor es número, texto, booleano o null (vacía o fórmula sin calcular). */
/* Nombre de hoja → su ruta dentro de xl/ («worksheets/sheet8.xml»). */
async function rutasDeHojas(zip, libro) {
  const relaciones = new Map();
  for (const m of ((await zip.texto('xl/_rels/workbook.xml.rels')) ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = atributos(m[1]);
    relaciones.set(a.Id, a.Target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  const hojas = new Map();
  for (const m of libro.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = atributos(m[1]);
    hojas.set(a.name, relaciones.get(a['r:id']));
  }
  return hojas;
}

/* ¿Un formato de número es una hora o una duración? Los integrados 18 a 21 y
   45 a 47 (h:mm, h:mm:ss, [h]:mm:ss, mm:ss…) y los propios con horas y
   minutos sin día ni año (así un «dd/mm/yyyy hh:mm» sigue siendo fecha). */
export function esFormatoDeDuracion(id, codigo) {
  if ([18, 19, 20, 21, 45, 46, 47].includes(id)) return true;
  if (!codigo) return false;
  const limpio = codigo.replace(/"[^"]*"/g, '').replace(/\[\$[^\]]*\]/g, '').toLowerCase();
  return /\[?h+\]?\s*:\s*\[?m/.test(limpio) && !/[dy]/.test(limpio);
}

export async function leerLibro(buffer) {
  const zip = abrirZip(buffer);
  const libro = await zip.texto('xl/workbook.xml');
  if (!libro) throw new Error('No es un libro de Excel: falta su índice de hojas.');

  const compartidos = [];
  const sst = await zip.texto('xl/sharedStrings.xml');
  if (sst) {
    for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      compartidos.push(desescapar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
    }
  }

  const hojas = await rutasDeHojas(zip, libro);

  /* Qué estilos son una duración o una hora ([h]:mm, h:mm:ss…). Excel guarda
     ahí una fracción de día: «997:57» es 41,58. Centro Quirúrgico escribe así
     sus horas (07/11/2026), y leer el 41,58 como horas las dividía entre 24. */
  const duraciones = new Set();
  const estilos = await zip.texto('xl/styles.xml');
  if (estilos) {
    const propios = new Map([...estilos.matchAll(/<numFmt\b([^>]*)\/?>/g)].map((m) => {
      const a = atributos(m[1]);
      return [Number(a.numFmtId), desescapar(a.formatCode ?? '')];
    }));
    const xfs = estilos.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
    [...xfs.matchAll(/<xf\b([^>]*?)\/?>/g)].forEach((m, i) => {
      const id = Number(atributos(m[1]).numFmtId ?? 0);
      if (esFormatoDeDuracion(id, propios.get(id))) duraciones.add(i);
    });
  }

  const nombres = new Map();
  for (const m of libro.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    nombres.set(atributos(m[1]).name, desescapar(m[2]).trim());
  }

  /* Las celdas con fórmula de cada hoja: su valor es el calculado al grabar,
     y quien corrige el libro necesita saber que no es una cifra tecleada. */
  const formulasPorHoja = new Map();
  const duracionesPorHoja = new Map();
  const celdasPorHoja = new Map();
  async function celdas(nombreHoja) {
    if (celdasPorHoja.has(nombreHoja)) return celdasPorHoja.get(nombreHoja);
    const ruta = hojas.get(nombreHoja);
    const xml = ruta ? await zip.texto(`xl/${ruta}`) : null;
    const mapa = new Map();
    const formulas = new Set();
    const enDuracion = new Set();
    if (xml) {
      for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = atributos(m[1]);
        const dentro = m[2] ?? '';
        if (/<f[\s>/]/.test(dentro)) formulas.add(a.r);
        if (a.s != null && duraciones.has(Number(a.s))) enDuracion.add(a.r);
        const v = dentro.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let valor = null;
        if (a.t === 's') valor = v != null ? compartidos[Number(v)] ?? null : null;
        else if (a.t === 'inlineStr') valor = desescapar([...dentro.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
        else if (a.t === 'str') valor = v != null ? desescapar(v) : null;
        else if (a.t === 'b') valor = v === '1';
        else if (a.t === 'e') valor = v != null ? { error: desescapar(v) } : null;
        else if (v != null && v !== '') valor = Number(v);
        mapa.set(a.r, valor);
      }
    }
    celdasPorHoja.set(nombreHoja, mapa);
    formulasPorHoja.set(nombreHoja, formulas);
    duracionesPorHoja.set(nombreHoja, enDuracion);
    return mapa;
  }

  /* 'Hoja con espacios'!$C$5:$AG$5 → { hoja, celdas: [ref…] } */
  function resolver(ref) {
    const m = ref.match(/^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/);
    if (!m) return null;
    const hoja = (m[1] ?? m[2]).replace(/''/g, "'");
    const c1 = numeroDeColumna(m[3]);
    const f1 = Number(m[4]);
    const c2 = m[5] ? numeroDeColumna(m[5]) : c1;
    const f2 = m[6] ? Number(m[6]) : f1;
    const lista = [];
    for (let f = f1; f <= f2; f += 1) for (let c = c1; c <= c2; c += 1) lista.push(referencia(c, f));
    return { hoja, celdas: lista };
  }

  return {
    hojas: [...hojas.keys()],
    nombres,
    async valor(hoja, ref) {
      return (await celdas(hoja)).get(ref) ?? null;
    },
    /* Una hoja como cuadrícula: valor(fila, columna) con números de 1 en
       adelante. La usa el lector del Excel real del área, que no trae
       nombres definidos: busca por etiquetas, fila por fila. */
    async cuadricula(hoja) {
      const mapa = await celdas(hoja);
      let ultimaFila = 0;
      let ultimaColumna = 0;
      for (const ref of mapa.keys()) {
        const m = ref.match(/^([A-Z]+)(\d+)$/);
        if (!m) continue;
        ultimaFila = Math.max(ultimaFila, Number(m[2]));
        ultimaColumna = Math.max(ultimaColumna, numeroDeColumna(m[1]));
      }
      const formulas = formulasPorHoja.get(hoja);
      return {
        hoja,
        ultimaFila,
        ultimaColumna,
        valor: (fila, columna) => mapa.get(referencia(columna, fila)) ?? null,
        esFormula: (fila, columna) => formulas.has(referencia(columna, fila)),
        /* ¿La celda tiene formato de duración? Su número es una fracción de día. */
        esDuracion: (fila, columna) => duracionesPorHoja.get(hoja).has(referencia(columna, fila)),
      };
    },
    /* Todas las celdas de una hoja: { ref: valor }, y las que son fórmula. */
    async celdas(hoja) {
      const mapa = await celdas(hoja);
      return { valores: Object.fromEntries(mapa), formulas: [...formulasPorHoja.get(hoja)], duraciones: [...duracionesPorHoja.get(hoja)] };
    },
    /* Valores de un nombre definido, en orden de fila y columna, con su celda. */
    async rango(nombre) {
      const ref = nombres.get(nombre);
      const r = ref ? resolver(ref) : null;
      if (!r || !hojas.has(r.hoja)) return null;
      const mapa = await celdas(r.hoja);
      return { hoja: r.hoja, celdas: r.celdas.map((c) => ({ ref: c, valor: mapa.get(c) ?? null })) };
    },
  };
}

/* ------------------------------------------------------------- parche */

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Pone `valor` (número, o null para vaciarla) en la celda `ref` del XML de una
   hoja. Conserva su estilo (`s`). Si la celda es una fórmula, la fórmula se
   queda y solo cambia el valor guardado: Excel la recalcula al abrir. Una
   celda que no existe se crea en su fila, en el orden de columnas que exige
   el formato. */
function ponerValor(xml, ref, valor) {
  const v = valor == null ? '' : `<v>${valor}</v>`;
  const patron = new RegExp(`<c\\b([^>]*?\\br="${escaparRegex(ref)}"[^>]*?)(/>|>([\\s\\S]*?)</c>)`);
  const m = xml.match(patron);
  if (m) {
    const formula = (m[3] ?? '').match(/<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/)?.[0];
    // Sin tipo: una cifra no lo lleva (antes podía ser texto compartido o en línea).
    const attrs = m[1].replace(/\s+t="[^"]*"/, '').replace(/\s*\/?$/, '');
    if (formula) return xml.replace(patron, () => `<c${attrs}>${formula}${v}</c>`);
    return xml.replace(patron, () => (v ? `<c${attrs}>${v}</c>` : `<c${attrs}/>`));
  }
  if (valor == null) return xml;

  const fila = Number(ref.match(/\d+$/)[0]);
  const columna = numeroDeColumna(ref.match(/^[A-Z]+/)[0]);
  const celda = `<c r="${ref}">${v}</c>`;
  const patronFila = new RegExp(`<row\\b([^>]*?\\br="${fila}"[^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const mf = xml.match(patronFila);
  if (mf) {
    const dentro = mf[3] ?? '';
    const despues = [...dentro.matchAll(/<c\b[^>]*?\br="([A-Z]+)\d+"/g)].find((c) => numeroDeColumna(c[1]) > columna);
    const nuevo = despues ? dentro.slice(0, despues.index) + celda + dentro.slice(despues.index) : dentro + celda;
    return xml.replace(patronFila, () => `<row${mf[1].replace(/\s*\/?$/, '')}>${nuevo}</row>`);
  }
  const filaNueva = `<row r="${fila}">${celda}</row>`;
  const siguiente = [...xml.matchAll(/<row\b[^>]*?\br="(\d+)"/g)].find((r) => Number(r[1]) > fila);
  if (siguiente) return xml.slice(0, siguiente.index) + filaNueva + xml.slice(siguiente.index);
  if (/<sheetData\s*\/>/.test(xml)) return xml.replace(/<sheetData\s*\/>/, () => `<sheetData>${filaNueva}</sheetData>`);
  return xml.replace('</sheetData>', () => `${filaNueva}</sheetData>`);
}

/* Un libro corregido: el mismo archivo con otros valores en unas celdas de una
   hoja. cambios: { ref: número | null }.

   Solo se reescriben dos partes: la hoja y el índice del libro (para pedirle a
   Excel que recalcule todo al abrir, así las fórmulas de otras hojas —el
   CONSOLIDADO— toman las cifras corregidas). Todo lo demás se copia tal como
   venía comprimido. Ninguna fórmula se borra, de modo que la cadena de
   cálculo del libro (calcChain.xml) sigue siendo válida. */
export async function parchearLibro(buffer, hoja, cambios) {
  return parchearHojas(buffer, { [hoja]: cambios });
}

/* Lo mismo, en varias hojas a la vez: { hoja: { ref: número | null } }. El
   libro de Nutrición tiene una hoja por cuadro. */
export async function parchearHojas(buffer, porHoja) {
  const zip = abrirZip(buffer);
  const libro = await zip.texto('xl/workbook.xml');
  if (!libro) throw new Error('No es un libro de Excel: falta su índice de hojas.');
  const rutas = await rutasDeHojas(zip, libro);

  const reescritas = new Map();
  for (const [hoja, cambios] of Object.entries(porHoja)) {
    const ruta = rutas.get(hoja);
    if (!ruta) throw new Error(`El libro no tiene la hoja «${hoja}».`);
    const nombreHoja = `xl/${ruta}`;
    let xml = reescritas.get(nombreHoja) ?? (await zip.texto(nombreHoja));
    for (const [ref, valor] of Object.entries(cambios)) {
      if (!/^[A-Z]+\d+$/.test(ref)) throw new Error(`«${ref}» no es una celda.`);
      if (valor != null && !Number.isFinite(valor)) throw new Error(`«${valor}» no es una cifra para ${ref}.`);
      xml = ponerValor(xml, ref, valor);
    }
    reescritas.set(nombreHoja, xml);
  }

  const calcPr = libro.match(/<calcPr\b[^>]*?\/?>/)?.[0];
  const indice = calcPr
    ? libro.replace(calcPr, () =>
        /fullCalcOnLoad=/.test(calcPr) ? calcPr.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"') : calcPr.replace(/\s*(\/?>)$/, ' fullCalcOnLoad="1"$1'),
      )
    : libro.replace('</workbook>', () => '<calcPr fullCalcOnLoad="1"/></workbook>');

  return empaquetarZip(
    zip.nombres().map((nombre) => {
      if (reescritas.has(nombre)) return { nombre, contenido: reescritas.get(nombre) };
      if (nombre === 'xl/workbook.xml') return { nombre, contenido: indice };
      return { nombre, crudo: zip.crudo(nombre) };
    }),
  );
}
