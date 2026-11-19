/* Selector de color del laboratorio: todo el espectro.

   Un cuadro de saturación (horizontal) y brillo (vertical) y una barra de
   tono, dibujados píxel a píxel en <canvas>: así no hace falta escribir
   ningún color, salen de la conversión HSV. Se maneja con el puntero y con
   las flechas (Mayús para pasos largos). Debajo, el valor en hexadecimal,
   editable, y en RGB.

   Es una herramienta de esta página de pruebas, fuera de la aplicación; en
   la app un selector así saldría del kit. */

import { hexARgb, hsvARgb, rgbAHex, rgbAHsv } from './paletas.js';

const limitar = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function crearSelector(raiz, { alCambiar }) {
  raiz.classList.add('selector');
  raiz.innerHTML = `
    <div class="selector__sv" tabindex="0" role="slider" aria-label="Saturación y brillo"
         aria-valuemin="0" aria-valuemax="100"><canvas></canvas><span class="selector__marca"></span></div>
    <div class="selector__tono" tabindex="0" role="slider" aria-label="Tono"
         aria-valuemin="0" aria-valuemax="360"><canvas></canvas><span class="selector__marca"></span></div>
    <div class="selector__valor">
      <span class="selector__muestra" aria-hidden="true"></span>
      <label>Hex <input class="selector__hex" type="text" inputmode="text" maxlength="7" spellcheck="false" autocomplete="off" /></label>
      <span class="selector__rgb"></span>
    </div>`;

  const sv = raiz.querySelector('.selector__sv');
  const tono = raiz.querySelector('.selector__tono');
  const [lienzoSv, lienzoTono] = raiz.querySelectorAll('canvas');
  const [marcaSv, marcaTono] = raiz.querySelectorAll('.selector__marca');
  const entrada = raiz.querySelector('.selector__hex');
  const muestra = raiz.querySelector('.selector__muestra');
  const textoRgb = raiz.querySelector('.selector__rgb');
  let h = 160, s = 0.4, v = 0.85;

  function dibujarSv() {
    const { width: w, height: alto } = lienzoSv;
    const ctx = lienzoSv.getContext('2d');
    const img = ctx.createImageData(w, alto);
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = hsvARgb(h, x / (w - 1 || 1), 1 - y / (alto - 1 || 1));
        const i = (y * w + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function dibujarTono() {
    const { width: w, height: alto } = lienzoTono;
    const ctx = lienzoTono.getContext('2d');
    const img = ctx.createImageData(w, alto);
    for (let x = 0; x < w; x++) {
      const [r, g, b] = hsvARgb((x / (w - 1 || 1)) * 360, 1, 1);
      for (let y = 0; y < alto; y++) {
        const i = (y * w + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function ajustar() {
    for (const c of [lienzoSv, lienzoTono]) {
      const r = c.getBoundingClientRect();
      c.width = Math.max(2, Math.round(r.width));
      c.height = Math.max(2, Math.round(r.height));
    }
    dibujarSv();
    dibujarTono();
  }

  function pintar(emitir) {
    const hex = rgbAHex(hsvARgb(h, s, v));
    marcaSv.style.left = `${s * 100}%`;
    marcaSv.style.top = `${(1 - v) * 100}%`;
    marcaSv.style.setProperty('--color', hex);
    marcaTono.style.left = `${(h / 360) * 100}%`;
    marcaTono.style.setProperty('--color', rgbAHex(hsvARgb(h, 1, 1)));
    muestra.style.setProperty('--color', hex);
    if (document.activeElement !== entrada) entrada.value = hex;
    const [r, g, b] = hexARgb(hex);
    textoRgb.textContent = `R ${r} · G ${g} · B ${b}`;
    sv.setAttribute('aria-valuenow', Math.round(s * 100));
    sv.setAttribute('aria-valuetext', `Saturación ${Math.round(s * 100)} %, brillo ${Math.round(v * 100)} %`);
    tono.setAttribute('aria-valuenow', Math.round(h));
    tono.setAttribute('aria-valuetext', `${Math.round(h)} grados`);
    if (emitir) alCambiar(hex);
  }

  function arrastrar(el, alMover) {
    const mover = (e) => {
      const r = el.getBoundingClientRect();
      alMover(limitar((e.clientX - r.left) / r.width), limitar((e.clientY - r.top) / r.height));
    };
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); mover(e); });
    el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) mover(e); });
  }
  arrastrar(sv, (x, y) => { s = x; v = 1 - y; pintar(true); });
  arrastrar(tono, (x) => { h = x * 360; dibujarSv(); pintar(true); });

  sv.addEventListener('keydown', (e) => {
    const paso = e.shiftKey ? 0.1 : 0.02;
    const cambios = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] }[e.key];
    if (!cambios) return;
    e.preventDefault();
    s = limitar(s + cambios[0]);
    v = limitar(v + cambios[1]);
    pintar(true);
  });
  tono.addEventListener('keydown', (e) => {
    const paso = e.shiftKey ? 15 : 2;
    const cambio = { ArrowLeft: -paso, ArrowDown: -paso, ArrowRight: paso, ArrowUp: paso }[e.key];
    if (!cambio) return;
    e.preventDefault();
    h = (h + cambio + 360) % 360;
    dibujarSv();
    pintar(true);
  });
  entrada.addEventListener('input', () => {
    const valor = entrada.value.trim();
    if (/^#?[0-9a-f]{6}$/i.test(valor)) fijar(valor.startsWith('#') ? valor : `#${valor}`, true);
  });
  entrada.addEventListener('blur', () => pintar(false));

  function fijar(hex, emitir = false) {
    const [h0, s0, v0] = rgbAHsv(hexARgb(hex));
    if (s0 > 0) h = h0; // un gris no tiene tono: se conserva el anterior
    s = s0;
    v = v0;
    dibujarSv();
    pintar(emitir);
  }

  new ResizeObserver(ajustar).observe(raiz);
  ajustar();
  pintar(false);
  return { fijar };
}
