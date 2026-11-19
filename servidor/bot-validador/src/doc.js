/* Lectura mínima de documentos de Word 97-2003 (.doc), sin dependencias.

   Nefrología guarda su cuadro en .doc (07/11/2026: «ESTADISTICA HD 2026
   (Recuperado automáticamente).doc») y no tiene otra copia; pedirle que lo
   abra y lo guarde como .docx cada mes es un paso que se olvida. El bot lo lee
   tal como viene y devuelve lo mismo que `leerDocumento` con un .docx:
   { parrafos, tablas (con `celdas`, las columnas combinadas repetidas como
   vacías), texto, dibujos }. Así ningún lector de área distingue uno de otro.

   Un .doc es un archivo compuesto (CFB: un pequeño sistema de archivos con
   sectores, como un disquete) con tres flujos que importan:
     WordDocument  el texto y las propiedades de párrafo (FKP)
     0Table/1Table la tabla de piezas (dónde está cada tramo de texto)
     Data          las propiedades de párrafo que no caben en su FKP
   Formato: [MS-CFB] y [MS-DOC] de Microsoft.

   Lo que no hace: estilos, imágenes, notas, encabezados ni documentos
   cifrados. De los campos (fechas, numeración) se lee el resultado, no el
   código. Una tabla dentro de otra se lee como texto de la celda que la
   contiene. */

const FIRMA = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FIN_DE_CADENA = 0xfffffffe;

export function esCompuesto(bytes) {
  return bytes.length >= 512 && FIRMA.every((b, i) => bytes[i] === b);
}

/* ------------------------------------------------- el archivo compuesto */

function abrirCompuesto(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o) => v.getUint32(o, true);
  const tamSector = 1 << v.getUint16(0x1e, true);
  const tamMini = 1 << v.getUint16(0x20, true);
  const corte = u32(0x38);
  const sector = (n) => 512 + n * tamSector;

  // La FAT: sus sectores están en el DIFAT (109 en la cabecera, el resto encadenado).
  const difat = [];
  for (let i = 0; i < 109; i += 1) difat.push(u32(0x4c + i * 4));
  for (let s = u32(0x44), n = u32(0x48); n > 0 && s < FIN_DE_CADENA; n -= 1) {
    const o = sector(s);
    for (let i = 0; i < tamSector / 4 - 1; i += 1) difat.push(u32(o + i * 4));
    s = u32(o + tamSector - 4);
  }
  const fat = [];
  for (const s of difat.slice(0, u32(0x2c))) {
    const o = sector(s);
    for (let i = 0; i < tamSector / 4; i += 1) fat.push(u32(o + i * 4));
  }

  const cadena = (inicio, tabla) => {
    const lista = [];
    for (let s = inicio; s < FIN_DE_CADENA && lista.length <= tabla.length; s = tabla[s]) lista.push(s);
    return lista;
  };
  const leerCadena = (inicio, tam) => {
    const salida = new Uint8Array(cadena(inicio, fat).length * tamSector);
    cadena(inicio, fat).forEach((s, i) => salida.set(bytes.subarray(sector(s), sector(s) + tamSector), i * tamSector));
    return tam == null ? salida : salida.subarray(0, tam);
  };

  const dir = leerCadena(u32(0x30));
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entradas = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const largo = dv.getUint16(o + 0x40, true);
    const tipo = dir[o + 0x42];
    if (!tipo) continue;
    let nombre = '';
    for (let i = 0; i < Math.max(0, largo / 2 - 1); i += 1) nombre += String.fromCharCode(dv.getUint16(o + i * 2, true));
    entradas.push({ nombre, tipo, inicio: dv.getUint32(o + 0x74, true), tam: dv.getUint32(o + 0x78, true) });
  }

  const raiz = entradas.find((e) => e.tipo === 5);
  const miniFlujo = raiz ? leerCadena(raiz.inicio, raiz.tam) : new Uint8Array();
  const miniFat = [];
  if (u32(0x40) > 0) {
    const m = leerCadena(u32(0x3c));
    const mv = new DataView(m.buffer, m.byteOffset, m.byteLength);
    for (let i = 0; i + 4 <= m.length; i += 4) miniFat.push(mv.getUint32(i, true));
  }

  return (nombre) => {
    const e = entradas.find((x) => x.tipo === 2 && x.nombre === nombre);
    if (!e) return null;
    if (e.tam >= corte) return leerCadena(e.inicio, e.tam);
    const salida = new Uint8Array(e.tam);
    cadena(e.inicio, miniFat).forEach((s, i) => {
      const trozo = miniFlujo.subarray(s * tamMini, (s + 1) * tamMini);
      salida.set(trozo.subarray(0, Math.max(0, Math.min(tamMini, e.tam - i * tamMini))), i * tamMini);
    });
    return salida;
  };
}

/* ------------------------------------------------- propiedades de párrafo */

/* Lo que importa de un párrafo para armar las tablas, de su lista de
   modificadores (grpprl): si está en una tabla, a qué profundidad, si cierra
   una fila y, en la marca de fin de fila, los bordes de sus celdas. */
function leerSprms(g, inicio, fin, datos, props) {
  const v = new DataView(g.buffer, g.byteOffset, g.byteLength);
  let o = inicio;
  while (o + 2 <= fin) {
    const sprm = v.getUint16(o, true);
    o += 2;
    const spra = sprm >> 13;
    let largo;
    if (spra === 0 || spra === 1) largo = 1;
    else if (spra === 2 || spra === 4 || spra === 5) largo = 2;
    else if (spra === 3) largo = 4;
    else if (spra === 7) largo = 3;
    else if (sprm === 0xd608 || sprm === 0xd606) largo = v.getUint16(o, true) + 1; // sprmTDefTable y afines: tamaño en 2 bytes, contándose a sí mismo menos 1
    else largo = g[o] + 1;
    if (o + largo > fin + 1) break;
    switch (sprm) {
      case 0x2416: props.enTabla = g[o] !== 0; break; // sprmPFInTable
      case 0x2417: props.finDeFila = g[o] !== 0; break; // sprmPFTtp
      case 0x6649: props.nivel = v.getInt32(o, true); break; // sprmPItap
      case 0x244c: props.finDeFilaInterna = g[o] !== 0; break; // sprmPFInnerTtp
      case 0xd608: { // sprmTDefTable: itcMac y los bordes de cada celda
        const n = g[o + 2];
        props.bordes = Array.from({ length: n + 1 }, (_, i) => v.getInt16(o + 3 + i * 2, true));
        break;
      }
      case 0x6646: { // sprmPHugePapx: el resto de las propiedades vive en Data
        if (datos) {
          const p = v.getUint32(o, true);
          const dvd = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
          if (p + 2 <= datos.length) {
            const cb = dvd.getUint16(p, true);
            leerSprms(datos, p + 2, Math.min(datos.length, p + 2 + cb), null, props); // PrcData: sin istd
          }
        }
        break;
      }
      default:
    }
    o += largo;
  }
}

/* Las propiedades de cada tramo de bytes del texto (PlcBtePapx → FKP). */
function tramosDeParrafo(doc, tabla, datos, fc, lcb) {
  const tv = new DataView(tabla.buffer, tabla.byteOffset, tabla.byteLength);
  const n = (lcb - 4) / 8;
  const tramos = [];
  for (let i = 0; i < n; i += 1) {
    const pn = tv.getUint32(fc + (n + 1) * 4 + i * 4, true) & 0x3fffff;
    const base = pn * 512;
    if (base + 512 > doc.length) continue;
    const fkp = doc.subarray(base, base + 512);
    const kv = new DataView(fkp.buffer, fkp.byteOffset, 512);
    const crun = fkp[511];
    for (let r = 0; r < crun; r += 1) {
      const desde = kv.getUint32(r * 4, true);
      const hasta = kv.getUint32((r + 1) * 4, true);
      const bOffset = fkp[(crun + 1) * 4 + r * 13] * 2;
      const props = { enTabla: false, finDeFila: false, nivel: 0, finDeFilaInterna: false, bordes: null };
      if (bOffset) {
        let cb = fkp[bOffset];
        let o = bOffset + 1;
        if (cb === 0) {
          cb = fkp[o] * 2;
          o += 1;
        } else cb = cb * 2 - 1;
        leerSprms(fkp, o + 2, Math.min(511, o + cb), datos, props); // + 2: el istd
      }
      tramos.push({ desde, hasta, props });
    }
  }
  tramos.sort((a, b) => a.desde - b.desde);
  return tramos;
}

/* ------------------------------------------------------------- el texto */

const W1252 = new TextDecoder('windows-1252');
const U16 = new TextDecoder('utf-16le');

/* El texto del cuerpo, carácter por carácter, con el byte del archivo donde
   está cada uno (para saber a qué párrafo pertenece). */
function caracteres(doc, tabla, fcClx, lcbClx, ccpText) {
  const tv = new DataView(tabla.buffer, tabla.byteOffset, tabla.byteLength);
  let o = fcClx;
  const fin = fcClx + lcbClx;
  while (o < fin && tabla[o] === 0x01) o += 3 + tv.getInt16(o + 1, true); // Prc: modificadores de pieza, no hacen falta
  if (tabla[o] !== 0x02) throw new Error('El Word no tiene su tabla de piezas.');
  const lcb = tv.getUint32(o + 1, true);
  const plc = o + 5;
  const n = (lcb - 4) / 12;
  const lista = [];
  for (let i = 0; i < n; i += 1) {
    const cpDesde = tv.getUint32(plc + i * 4, true);
    const cpHasta = Math.min(tv.getUint32(plc + (i + 1) * 4, true), ccpText);
    if (cpDesde >= ccpText) break;
    const pcd = plc + (n + 1) * 4 + i * 8;
    const fcBruto = tv.getUint32(pcd + 2, true);
    const comprimido = (fcBruto & 0x40000000) !== 0;
    const largo = cpHasta - cpDesde;
    if (comprimido) {
      const fc = (fcBruto & 0x3fffffff) / 2;
      const texto = W1252.decode(doc.subarray(fc, fc + largo));
      for (let k = 0; k < texto.length; k += 1) lista.push({ c: texto[k], fc: fc + k });
    } else {
      const fc = fcBruto & 0x3fffffff;
      const texto = U16.decode(doc.subarray(fc, fc + largo * 2));
      for (let k = 0; k < texto.length; k += 1) lista.push({ c: texto[k], fc: fc + k * 2 });
    }
  }
  return lista;
}

const normal = (texto) => texto.replace(/\s+/g, ' ').trim();

/* Las columnas que abarca cada celda de una fila, contra la cuadrícula de
   toda la tabla (como el `gridSpan` de un .docx). */
function columnasCombinadas(filas) {
  const cuadricula = [...new Set(filas.flatMap((f) => f.bordes ?? []))].sort((a, b) => a - b);
  return filas.map((f) => {
    if (!f.bordes || f.bordes.length !== f.celdas.length + 1) return f.celdas.map(() => 1);
    return f.celdas.map((_, i) => Math.max(1, cuadricula.filter((x) => x > f.bordes[i] && x <= f.bordes[i + 1]).length));
  });
}

/* Abre un .doc y devuelve lo mismo que `leerDocumento` con un .docx. Lanza si
   no es un Word 97-2003 que se pueda leer. */
export function leerDoc(bytes) {
  if (!esCompuesto(bytes)) throw new Error('No es un documento de Word 97-2003.');
  const flujo = abrirCompuesto(bytes);
  const doc = flujo('WordDocument');
  if (!doc || doc.length < 0x200) throw new Error('No es un documento de Word: falta WordDocument.');
  const v = new DataView(doc.buffer, doc.byteOffset, doc.byteLength);
  if (v.getUint16(0, true) !== 0xa5ec) throw new Error('No es un documento de Word 97-2003.');
  const banderas = v.getUint16(0x0a, true);
  if (banderas & 0x0100) throw new Error('El Word está protegido con contraseña.');
  const tabla = flujo(banderas & 0x0200 ? '1Table' : '0Table');
  if (!tabla) throw new Error('El Word no tiene su tabla de piezas.');
  const datos = flujo('Data');

  const csw = v.getUint16(32, true);
  const lw = 32 + 2 + csw * 2;
  const cslw = v.getUint16(lw, true);
  const ccpText = v.getUint32(lw + 2 + 3 * 4, true);
  const rg = lw + 2 + cslw * 4 + 2;
  const par = (i) => [v.getUint32(rg + i * 8, true), v.getUint32(rg + i * 8 + 4, true)];
  const [fcPapx, lcbPapx] = par(13);
  const [fcClx, lcbClx] = par(33);

  const lista = caracteres(doc, tabla, fcClx, lcbClx, ccpText);
  const tramos = tramosDeParrafo(doc, tabla, datos, fcPapx, lcbPapx);
  let t = 0;
  const propsDe = (fc) => {
    if (!tramos.length) return {};
    if (tramos[t].desde > fc) t = 0;
    while (t < tramos.length - 1 && tramos[t].hasta <= fc) t += 1;
    return tramos[t].desde <= fc && fc < tramos[t].hasta ? tramos[t].props : {};
  };

  const parrafos = [];
  const tablas = [];
  let actual = null; // la tabla abierta
  let fila = [];
  let celda = '';
  let texto = '';
  let campo = []; // en un campo, ¿se está en su código (true) o en su resultado (false)?

  const cerrarTabla = () => {
    if (!actual) return;
    if (fila.length) actual.filas.push({ celdas: fila, bordes: null });
    const spans = columnasCombinadas(actual.filas);
    tablas.push({
      indice: tablas.length,
      nivel: 0,
      filas: actual.filas.map((f, i) => f.celdas.map((c, j) => ({ texto: c, span: spans[i][j] }))),
      celdas: actual.filas.map((f, i) => f.celdas.flatMap((c, j) => [c, ...Array(spans[i][j] - 1).fill('')])),
    });
    actual = null;
    fila = [];
  };

  for (const { c, fc } of lista) {
    const code = c.charCodeAt(0);
    if (code === 0x13) { campo.push(true); continue; }
    if (code === 0x14) { if (campo.length) campo[campo.length - 1] = false; continue; }
    if (code === 0x15) { campo.pop(); continue; }
    if (campo.at(-1)) continue;
    if (c !== '\r' && c !== '\x07') {
      if (code === 0x0b || code === 0x09 || code === 0x0c || code === 0xa0) texto += ' ';
      else if (code === 0x1e) texto += '-';
      else if (code >= 0x20) texto += c;
      continue;
    }
    // Fin de párrafo (\r) o de celda (\x07).
    const p = propsDe(fc);
    const nivel = p.nivel || (p.enTabla ? 1 : 0);
    const limpio = normal(texto);
    texto = '';
    if (nivel === 0 && c === '\r') {
      cerrarTabla();
      if (limpio) parrafos.push(limpio);
      continue;
    }
    actual ??= { filas: [] };
    if (nivel > 1) {
      // Una tabla anidada: su texto va a la celda que la contiene.
      celda = normal(`${celda} ${limpio}`);
    } else if (c === '\x07' && p.finDeFila) {
      actual.filas.push({ celdas: fila, bordes: p.bordes });
      fila = [];
      celda = '';
    } else if (c === '\x07') {
      fila.push(normal(`${celda} ${limpio}`));
      celda = '';
    } else {
      celda = normal(`${celda} ${limpio}`);
    }
  }
  cerrarTabla();

  const todo = [...parrafos, ...tablas.flatMap((x) => x.celdas.flat())].join(' ');
  return { tipo: 'doc', parrafos, tablas, texto: todo, dibujos: [] };
}
