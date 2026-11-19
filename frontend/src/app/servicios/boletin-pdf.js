/* El boletín como archivo PDF, sin dependencias.

   Antes solo se imprimía con el diálogo del navegador («Guardar como PDF»), y
   eso no es una descarga: hay que saber elegir la impresora, y el resultado
   cambia con los márgenes y la escala que cada quien deje puestos. Aquí cada
   hoja A4 de la pantalla se fotografía tal como se ve y las fotos se juntan en
   un PDF de una hoja por página.

   Cómo, sin instalar nada (CLAUDE.md § 0):
   1. La hoja se clona dentro de un SVG (`foreignObject`) junto con todo el CSS
      de la página. Un SVG usado como imagen no puede pedir nada afuera, así que
      las fuentes y las fotos se le pasan ya leídas (data URI).
   2. El SVG se dibuja en un canvas y sale como JPEG.
   3. Los JPEG van tal cual al PDF (filtro DCTDecode): el formato los acepta sin
      recomprimir, y basta con escribir a mano los objetos y la tabla xref.

   Lo que se pierde frente a imprimir: el texto del PDF es imagen (no se puede
   seleccionar ni buscar). Para eso sigue el botón de imprimir.

   Siempre en tema claro: el boletín es papel, y el modo oscuro de la pantalla
   no debe llegar al archivo. */

const ESCALA = 2; // 2 px por px de pantalla: nítido al imprimir, ~200 KB por hoja.
const CALIDAD_JPEG = 0.9;
const A4 = Object.freeze({ ancho: 595.28, alto: 841.89 }); // puntos PDF

/* ------------------------------------------------------- recursos en línea */

const comoDataUri = (blob) =>
  new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(blob);
  });

function cacheDeDataUris() {
  const cache = new Map();
  return (url) => {
    if (url.startsWith('data:')) return Promise.resolve(url);
    if (!cache.has(url)) {
      cache.set(
        url,
        fetch(url)
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${r.status} ${url}`))))
          .then(comoDataUri)
          .catch(() => null),
      );
    }
    return cache.get(url);
  };
}

/* Todo el CSS de la página, con cada url() ya leída. Una hoja de estilos de
   otro origen no deja leer sus reglas: se omite (el boletín no usa ninguna). */
async function cssEnLinea(aDataUri) {
  const bloques = [];
  for (const hoja of document.styleSheets) {
    let reglas;
    try {
      reglas = hoja.cssRules;
    } catch {
      continue;
    }
    const base = hoja.href ?? document.baseURI;
    let texto = [...reglas].map((r) => r.cssText).join('\n');
    const urls = [...new Set([...texto.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => m[2]))].filter((u) => !u.startsWith('data:') && !u.startsWith('#'));
    for (const u of urls) {
      const dato = await aDataUri(new URL(u, base).href);
      if (dato) texto = texto.split(u).join(dato);
    }
    bloques.push(texto);
  }
  return bloques.join('\n');
}

/* ------------------------------------------------------------ una hoja */

async function clonarHoja(hoja, aDataUri) {
  const copia = hoja.cloneNode(true);
  /* Lo que en la impresión tampoco sale: botones de edición sobre las fotos. */
  for (const el of copia.querySelectorAll('.hrl-no-imprimir')) el.remove();
  for (const el of copia.querySelectorAll('[contenteditable]')) el.removeAttribute('contenteditable');
  for (const img of copia.querySelectorAll('img')) {
    const fuente = img.currentSrc || img.src;
    const dato = fuente ? await aDataUri(fuente) : null;
    if (dato) img.setAttribute('src', dato);
    img.removeAttribute('srcset');
    img.removeAttribute('loading');
  }
  /* Como en la hoja de impresión: alto A4 justo y sin sombra. */
  copia.style.boxShadow = 'none';
  copia.style.margin = '0';
  return copia;
}

function cargarImagen(src) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('El navegador no pudo dibujar la hoja.'));
    img.src = src;
  });
}

async function fotografiarHoja(hoja, css, aDataUri) {
  const ancho = Math.ceil(hoja.offsetWidth);
  const alto = Math.ceil(hoja.offsetHeight);
  const copia = await clonarHoja(hoja, aDataUri);
  /* Las clases de los contenedores: el CSS del kit y del boletín cuelga de ellas.
     Sin `data-theme`: el tema claro es el de omisión. */
  const envoltura = document.createElement('div');
  envoltura.className = 'hrl-nuevo';
  envoltura.setAttribute('style', `width:${ancho}px;height:${alto}px;background:white;`);
  const escritorio = document.createElement('div');
  escritorio.className = 'boletin-escritorio';
  escritorio.setAttribute('style', 'padding:0;margin:0;gap:0;background:none;display:block;');
  escritorio.appendChild(copia);
  envoltura.appendChild(escritorio);

  const xhtml = new XMLSerializer().serializeToString(envoltura);
  /* Sin animaciones: una imagen es un solo instante, y en el primero las barras
     de un gráfico que crecen al aparecer todavía miden cero. */
  const quieto = '*,*::before,*::after{animation:none !important;transition:none !important;}';
  const estilo = new XMLSerializer().serializeToString(Object.assign(document.createElement('style'), { textContent: `${css}\n${quieto}` }));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;">${estilo}${xhtml}</div>` +
    `</foreignObject></svg>`;

  const imagen = await cargarImagen(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ancho * ESCALA);
  canvas.height = Math.round(alto * ESCALA);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(ESCALA, ESCALA);
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', CALIDAD_JPEG));
  if (!blob) throw new Error('El navegador no pudo convertir la hoja en imagen.');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), ancho: canvas.width, alto: canvas.height, proporcion: alto / ancho };
}

/* ------------------------------------------------------------- el PDF */

/* Un PDF 1.4 con una página por imagen. La página mide A4 de ancho y el alto
   que pida la hoja: una hoja que en pantalla se pasó de 297 mm sale entera en
   una página más larga, en lugar de cortada. */
export function armarPdf(paginas, { titulo = 'Boletín estadístico' } = {}) {
  const codificar = (texto) => new TextEncoder().encode(texto);
  const partes = [];
  const desplazamientos = [];
  let largo = 0;
  const escribir = (bytes) => {
    const b = typeof bytes === 'string' ? codificar(bytes) : bytes;
    partes.push(b);
    largo += b.length;
  };
  const objeto = (n, cuerpo) => {
    desplazamientos[n] = largo;
    escribir(`${n} 0 obj\n`);
    for (const c of [].concat(cuerpo)) escribir(c);
    escribir('\nendobj\n');
  };
  /* El título va como texto PDF: solo ASCII imprimible, sin paréntesis sueltos. */
  const tituloPdf = titulo.normalize('NFD').replace(/[^\x20-\x7E]/g, '').replace(/([()\\])/g, '\\$1');

  /* La segunda línea, con bytes altos, avisa a quien lo transfiera que es binario. */
  escribir('%PDF-1.4\n%');
  escribir(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const primeraPagina = 4;
  const kids = paginas.map((_, i) => `${primeraPagina + i * 3} 0 R`).join(' ');
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objeto(2, `<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
  objeto(3, `<< /Title (${tituloPdf}) /Producer (Sistema de Reporte Estadistico HRL) >>`);
  paginas.forEach((p, i) => {
    const n = primeraPagina + i * 3;
    const ancho = A4.ancho;
    /* Un píxel de redondeo (1123 px por 297 mm) no hace una página más larga. */
    const alto = p.proporcion > A4.alto / A4.ancho + 0.01 ? +(A4.ancho * p.proporcion).toFixed(2) : A4.alto;
    const contenido = `q ${ancho} 0 0 ${alto} 0 0 cm /Im0 Do Q`;
    objeto(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    objeto(n + 1, [`<< /Length ${contenido.length} >>\nstream\n`, contenido, '\nendstream']);
    objeto(n + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.ancho} /Height ${p.alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ]);
  });
  const total = primeraPagina + paginas.length * 3;
  const inicioXref = largo;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n += 1) xref += `${String(desplazamientos[n]).padStart(10, '0')} 00000 n \n`;
  escribir(xref);
  escribir(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);

  const salida = new Uint8Array(largo);
  let pos = 0;
  for (const b of partes) {
    salida.set(b, pos);
    pos += b.length;
  }
  return salida;
}

/* --------------------------------------------------------------- descarga */

/* Fotografía las hojas, arma el PDF y lo descarga. `alAvanzar(hecho, total)`
   permite decir en pantalla por qué hoja va: con 30 hojas tarda unos segundos. */
export async function descargarBoletinPdf(hojas, nombre, { titulo, alAvanzar } = {}) {
  const lista = [...hojas];
  if (!lista.length) throw new Error('No hay hojas que descargar.');
  await document.fonts?.ready;
  const aDataUri = cacheDeDataUris();
  const css = await cssEnLinea(aDataUri);
  const paginas = [];
  for (const [i, hoja] of lista.entries()) {
    alAvanzar?.(i, lista.length);
    paginas.push(await fotografiarHoja(hoja, css, aDataUri));
  }
  alAvanzar?.(lista.length, lista.length);
  const bytes = armarPdf(paginas, { titulo });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { paginas: paginas.length, bytes: bytes.length };
}
