/* Paletas candidatas para Dr. Mochi, y cómo derivar una de un solo color.

   Son colores de la ilustración, no de la interfaz: por eso viven aquí, junto
   a los SVG, y no en los tokens del kit. Cada una cambia cinco variables de
   dr-mochi.svg (ver su comentario). Todas parten del verde del logo del HRL y
   se mueven hacia el agua, la menta o el gris; la tinta es la misma familia,
   muy oscura, para que la cara no pierda contraste.

   El orden importa: la primera es la que se muestra al abrir. */

export const PALETAS = [
  { id: 'verde-agua', nombre: 'Verde agua', nota: 'La de la ronda 2. Equilibrada entre verde y azul.',
    piel1: '#e6f7f2', piel2: '#a8dfcb', solapa: '#b5d3c8', tubo: '#1f6f63', tinta: '#163a33' },
  { id: 'menta', nombre: 'Menta fresca', nota: 'Más verde y más luminosa; se aleja del azul.',
    piel1: '#eafaf0', piel2: '#a6e3bf', solapa: '#b6d8c4', tubo: '#1d6b4c', tinta: '#14382a' },
  { id: 'verde-hrl', nombre: 'Verde HRL', nota: 'La más cercana al verde de la marca, aclarada.',
    piel1: '#e2f3ea', piel2: '#8fd1b0', solapa: '#b1d3c2', tubo: '#00704a', tinta: '#0f3324' },
  { id: 'jade', nombre: 'Jade', nota: 'Verde agua más saturado; destaca más sobre fondo blanco.',
    piel1: '#dcf2ea', piel2: '#7fcdb4', solapa: '#aecfc4', tubo: '#0e5e57', tinta: '#0f332a' },
  { id: 'aguamarina', nombre: 'Aguamarina', nota: 'El tono más azulado del verde agua.',
    piel1: '#e3f6f6', piel2: '#9fd9d6', solapa: '#b3d0cf', tubo: '#1e5f6b', tinta: '#143b3a' },
  { id: 'turquesa', nombre: 'Turquesa clínico', nota: 'Casi celeste, el color de los uniformes de quirófano.',
    piel1: '#e0f4f7', piel2: '#94d3dd', solapa: '#b0cfd5', tubo: '#1c5c6e', tinta: '#12343d' },
  { id: 'pastel', nombre: 'Verde agua pastel', nota: 'La más suave; se lee mejor en modo oscuro que en claro.',
    piel1: '#f0faf7', piel2: '#c4ebdd', solapa: '#c3ddd3', tubo: '#3b7d70', tinta: '#1d3d36' },
  { id: 'salvia', nombre: 'Salvia', nota: 'Verde apagado, con gris. La más sobria.',
    piel1: '#eef3ee', piel2: '#bdd3c4', solapa: '#c5d4c9', tubo: '#45634f', tinta: '#223329' },
];

/* Pone una paleta en una mascota ya montada (su <svg> inline). */
export function aplicarPaleta(svg, paleta) {
  svg.style.setProperty('--m-piel-1', paleta.piel1);
  svg.style.setProperty('--m-piel-2', paleta.piel2);
  svg.style.setProperty('--m-solapa', paleta.solapa);
  svg.style.setProperty('--m-tubo', paleta.tubo);
  svg.style.setProperty('--m-tinta', paleta.tinta);
}

/* ── Conversiones (h en grados; s, l y v entre 0 y 1) ── */

export const hexARgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbAHex = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;

export function hsvARgb(h, s, v) {
  const k = (n) => (n + h / 60) % 6;
  const canal = (n) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [canal(5), canal(3), canal(1)].map((c) => Math.round(c * 255));
}

export function rgbAHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hslARgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const canal = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [canal(0), canal(8), canal(4)].map((c) => Math.round(c * 255));
}

export function rgbAHsl(rgb) {
  const [h, , v] = rgbAHsv(rgb);
  const [r, g, b] = rgb.map((c) => c / 255);
  const min = Math.min(r, g, b);
  const l = (v + min) / 2;
  const s = v === min ? 0 : (v - min) / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}

/* Toda la paleta a partir del color del cuerpo. El color elegido es la parte
   baja del degradado; la alta es ese mismo color muy aclarado (el «brillo»
   del mochi), las solapas son un gris de su familia, y el estetoscopio y la
   tinta, el mismo tono muy oscuro y menos saturado: así la cara se lee con
   cualquier color que se elija. */
export function derivarPaleta(base) {
  const rgb = hexARgb(base);
  const [h, s, l] = rgbAHsl(rgb);
  const aclarado = rgb.map((c) => c + (255 - c) * 0.72);
  return {
    id: 'propia', nombre: 'Color propio', nota: 'Derivada del color elegido para el cuerpo.',
    piel1: rgbAHex(aclarado),
    piel2: rgbAHex(rgb),
    solapa: rgbAHex(hslARgb(h, s * 0.35, Math.min(0.86, l + (1 - l) * 0.45))),
    tubo: rgbAHex(hslARgb(h, Math.min(s, 0.6), 0.27)),
    tinta: rgbAHex(hslARgb(h, Math.min(s, 0.45), 0.13)),
  };
}
