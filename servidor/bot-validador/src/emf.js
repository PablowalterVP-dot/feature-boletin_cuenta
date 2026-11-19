/* Los textos de un dibujo EMF, con su posición.

   Cuando un área pega un cuadro de Excel en su Word «como imagen», Word lo
   guarda como un EMF: un metarchivo con las instrucciones de dibujo, entre
   ellas cada texto que se escribió (registros EMR_EXTTEXTOUTW). No es una
   foto ni hace falta OCR: el texto está ahí tal cual, con el punto donde se
   dibujó. Farmacia pegó así el resumen de julio de 2026.

   Solo se leen los registros de texto; el resto del dibujo (líneas, rellenos)
   no importa. Un EMF dañado devuelve lo que se alcanzó a leer. */

const EMR_EXTTEXTOUTA = 83;
const EMR_EXTTEXTOUTW = 84;

export function textosDeEmf(bytes) {
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  const textos = [];
  const utf16 = new TextDecoder('utf-16le');
  const latin1 = new TextDecoder('latin1');
  let i = 0;
  while (i + 8 <= datos.length) {
    const tipo = vista.getUint32(i, true);
    const tamano = vista.getUint32(i + 4, true);
    if (tamano < 8 || i + tamano > datos.length) break;
    if (tipo === EMR_EXTTEXTOUTW || tipo === EMR_EXTTEXTOUTA) {
      /* Cabecera: tipo, tamaño, rectángulo (16), modo (4), escalas (8); luego
         EMRTEXT: punto de referencia (8), cantidad de caracteres y dónde
         empieza la cadena, contada desde el inicio del registro. */
      const base = i + 8 + 16 + 12;
      const x = vista.getInt32(base, true);
      const y = vista.getInt32(base + 4, true);
      const n = vista.getUint32(base + 8, true);
      const desde = i + vista.getUint32(base + 12, true);
      const largo = tipo === EMR_EXTTEXTOUTW ? n * 2 : n;
      if (desde + largo <= datos.length) {
        const texto = (tipo === EMR_EXTTEXTOUTW ? utf16 : latin1).decode(datos.subarray(desde, desde + largo)).replace(/\s+/g, ' ').trim();
        if (texto) textos.push({ x, y, texto });
      }
    }
    i += tamano;
  }
  return textos;
}

/* Los textos agrupados en filas: los que se dibujaron a la misma altura (con
   un margen de `tolerancia`), de izquierda a derecha. */
export function filasDeTextos(textos, tolerancia = 3) {
  const filas = [];
  for (const t of [...textos].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const fila = filas.find((f) => Math.abs(f.y - t.y) <= tolerancia);
    if (fila) fila.textos.push(t);
    else filas.push({ y: t.y, textos: [t] });
  }
  for (const f of filas) f.textos.sort((a, b) => a.x - b.x);
  return filas;
}
