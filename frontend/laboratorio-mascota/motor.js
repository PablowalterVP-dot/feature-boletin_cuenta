/* Motor de reacciones del laboratorio de mascotas.

   Cada mascota es un SVG con piezas nombradas; el motor no dibuja el cuerpo
   ni los accesorios, solo los mueve. Lo que cambia con la expresión (ojos,
   boca, globo y partículas) sí lo dibuja él, para que las cinco variantes
   reaccionen igual y una sexta se enchufe sin tocar este archivo.

   Contrato del SVG:
     .m-cuerpo        todo lo que se aplasta, salta y se inclina
     [data-paralaje]  capas que siguen la mirada (1 = la cara; negativo = detrás)
     .m-cara          la cara (lleva data-paralaje="1")
     .m-ojos          data-cx, data-cy, data-sep, data-w, data-h
     .m-boca          data-cx, data-cy, data-w; data-tipo="ecg" la vuelve un
                      electrocardiograma (data-alto = amplitud)
     .m-mejillas      data-base = opacidad en reposo
     .m-globo         data-x, data-y: dónde aparece el globo (fuera de .m-cuerpo)
     .m-sombra        se encoge cuando salta
     <svg data-base>  la línea del suelo; data-cabeza-y, data-sudor-x/y

   Aquí no hay ningún color: todo sale de las variables --m-* que trae cada
   SVG en su raíz (son ilustraciones, y una ilustración trae sus colores).

   Una sola vuelta de requestAnimationFrame mueve todas las instancias. */

const NS = 'http://www.w3.org/2000/svg';

/* Lo que expresa la mascota según el estado del bot. Persiste. */
const ESTADOS = {
  reposo:   { ojos: 'pildora',    boca: 'sonrisa',    globo: null,     cuerpo: 'respira' },
  pensando: { ojos: 'pildora',    boca: 'plana',      globo: 'puntos', cuerpo: 'mece', mirada: 'busca', ritmo: 1.8 },
  listo:    { ojos: 'feliz',      boca: 'abierta',    globo: 'check',  cuerpo: 'respira', ritmo: 1.2 },
  problema: { ojos: 'preocupado', boca: 'preocupada', globo: 'alerta', cuerpo: 'inclina', ritmo: 1.5, irregular: true },
  dormido:  { ojos: 'cerrado',    boca: 'dormida',    globo: null,     cuerpo: 'duerme', ritmo: 0.7, plano: true },
};

/* Reacciones pasajeras: se ponen encima del estado y se van solas. */
const PASAJERAS = {
  toque:    { ojos: 'feliz',    boca: 'abierta',  dura: 750 },
  sorpresa: { ojos: 'grande',   boca: 'o',        globo: 'pregunta', dura: 1200 },
  mareo:    { ojos: 'espiral',  boca: 'ondulada', globo: null, cuerpo: 'tambalea', ritmo: 2.6, irregular: true, dura: 1900 },
  apretado: { ojos: 'apretado', boca: 'apretada' },
};

export const SIESTA_MS = 12000;
export const CLICS_MAREO = 5;
const VENTANA_MAREO = 1500;
const ESPERA_APRETAR = 320;

const instancias = new Set();
let cursor = null;
let ultimaActividad = performance.now();
let reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
let enMarcha = false;
let contador = 0;

function actividad() {
  ultimaActividad = performance.now();
  for (const m of instancias) if (m.dormido) m.despertar();
}
addEventListener('pointermove', (e) => { cursor = { x: e.clientX, y: e.clientY }; actividad(); }, { passive: true });
addEventListener('pointerdown', actividad, { passive: true });
addEventListener('keydown', actividad);
addEventListener('scroll', actividad, { passive: true });
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) cursor = null; });
addEventListener('blur', () => { cursor = null; });

export function fijarReducido(valor) {
  reducido = valor;
  for (const m of instancias) m.aplicarReducido();
}
export const reducidoActivo = () => reducido;

export function crearMascota(host, texto, opciones) {
  return new Mascota(host, texto, opciones);
}

/* ── Utilidades ─────────────────────────────────────────────────────────── */

const f = (n) => Math.round(n * 100) / 100;
const T = 'var(--m-tinta)';
const B = 'var(--m-brillo)';

function el(tag, attrs = {}) {
  const nodo = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) nodo.setAttribute(k, v);
  return nodo;
}

function numeros(dataset) {
  const out = {};
  for (const [k, v] of Object.entries(dataset)) out[k] = Number.isNaN(+v) ? v : +v;
  return out;
}

/* El mismo SVG se monta varias veces en la página: sin esto, sus degradados
   y recortes chocarían por id. */
function conIdsUnicos(texto, n) {
  return texto
    .replace(/\bid="([^"]+)"/g, `id="$1-${n}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${n})`)
    .replace(/href="#([^"]+)"/g, `href="#$1-${n}"`);
}

function resorte(x) { return { x, v: 0, obj: x }; }

/* Euler semiimplícito en cuatro subpasos: con un solo paso, un cuadro lento
   (30 fps o una pestaña que vuelve) mete energía y el cuerpo tiembla. */
function moverResorte(r, dt, k = 260, c = 15) {
  if (reducido) { r.x = r.obj; r.v = 0; return; }
  const h = dt / 4;
  for (let i = 0; i < 4; i++) {
    r.v += (k * (r.obj - r.x) - c * r.v) * h;
    r.x += r.v * h;
  }
}

/* Respiración: inhala en el 40 % del ciclo y exhala en el 60 %, con los dos
   extremos suaves. Una senoidal pura se ve mecánica: el aire no entra y sale
   al mismo ritmo. Devuelve 0 → 1 → 0. */
function respiracion(t, periodo) {
  const u = (t / periodo) % 1;
  return u < 0.4 ? (1 - Math.cos((Math.PI * u) / 0.4)) / 2 : (1 + Math.cos((Math.PI * (u - 0.4)) / 0.6)) / 2;
}

/* Cómo respira y se mueve en cada estado: periodo (s), amplitud de la
   respiración y, si la tiene, la frecuencia del balanceo. */
const RITMOS = {
  respira: { periodo: 3.6, amplitud: 0.024 },
  duerme: { periodo: 5.2, amplitud: 0.042 },
  mece: { periodo: 2.4, amplitud: 0.014, balanceo: 0.55 },
  inclina: { periodo: 4.4, amplitud: 0.014 },
  tambalea: { periodo: 2, amplitud: 0.01 },
};

/* Un latido de electrocardiograma (P, QRS, T) para u en [0, 1). */
function latido(u) {
  const g = (c, a, s) => a * Math.exp(-((u - c) ** 2) / (2 * s * s));
  return g(0.18, 0.12, 0.03) - g(0.36, 0.14, 0.012) + g(0.4, 1, 0.014) - g(0.44, 0.3, 0.014) + g(0.66, 0.25, 0.045);
}
function azar(k) { const s = Math.sin(k * 127.1) * 43758.5453; return s - Math.floor(s); }

/* ── Dibujo de lo que cambia con la expresión ───────────────────────────── */

const trazo = (d, ancho, color = T) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(ancho)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const pildora = (x, y, w, h) =>
  `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(Math.min(w, h) / 2)}" fill="${T}"/>`;
// El brillo va marcado para poder quitarlo sin tocar cada forma de ojo.
const brillo = (x, y, r) => `<circle data-brillo="" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${B}" opacity="0.9"/>`;

/* El ojo abierto según el estilo de cada mascota (data-estilo en .m-ojos).
   Las expresiones (feliz, cerrado, espiral…) son comunes a todas. */
function ojoAbierto(estilo, x, y, w, h, lado, parpado) {
  switch (estilo) {
    case 'redondo': {
      const r = w * 0.55, ry = Math.max(1.2, r * parpado);
      return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(ry)}" fill="${T}"/>`
        + (parpado > 0.6 ? brillo(x - r * 0.3, y - ry * 0.35, r * 0.32) : '');
    }
    case 'brillante': {
      const r = w * 0.66, ry = Math.max(1.2, r * parpado);
      return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(ry)}" fill="${T}"/>`
        + (parpado > 0.6 ? brillo(x - r * 0.3, y - ry * 0.32, r * 0.36) + brillo(x + r * 0.32, y + ry * 0.3, r * 0.16) : '');
    }
    case 'punto': {
      const r = w * 0.36, ry = Math.max(1.2, r * parpado);
      return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(ry)}" fill="${T}"/>`;
    }
    case 'pestanas': {
      const hh = Math.max(2.4, h * parpado);
      const pestanas = parpado > 0.5
        ? trazo(`M${f(x + lado * w * 0.42)} ${f(y - h * 0.3)} L${f(x + lado * w * 0.85)} ${f(y - h * 0.55)} M${f(x + lado * w * 0.15)} ${f(y - h * 0.46)} L${f(x + lado * w * 0.38)} ${f(y - h * 0.78)}`, w * 0.2)
        : '';
      return pildora(x, y, w, hh) + pestanas + (parpado > 0.6 ? brillo(x - w * 0.16, y - hh * 0.22, w * 0.17) : '');
    }
    default: {
      const hh = Math.max(2.4, h * parpado);
      return pildora(x, y, w, hh) + (parpado > 0.6 ? brillo(x - w * 0.16, y - hh * 0.22, w * 0.17) : '');
    }
  }
}

function ojo(tipo, x, y, w, h, lado, parpado, giro, estilo) {
  switch (tipo) {
    case 'feliz':
      return trazo(`M${f(x - w * 0.62)} ${f(y + h * 0.14)} Q${f(x)} ${f(y - h * 0.6)} ${f(x + w * 0.62)} ${f(y + h * 0.14)}`, w * 0.42);
    case 'cerrado':
      return trazo(`M${f(x - w * 0.62)} ${f(y)} Q${f(x)} ${f(y + h * 0.3)} ${f(x + w * 0.62)} ${f(y)}`, w * 0.34);
    case 'apretado': {
      // «> <»: la punta mira hacia el centro de la cara.
      const fuera = x + lado * w * 0.5, punta = x - lado * w * 0.45;
      return trazo(`M${f(fuera)} ${f(y - h * 0.32)} L${f(punta)} ${f(y)} L${f(fuera)} ${f(y + h * 0.32)}`, w * 0.36);
    }
    case 'espiral': {
      let d = '';
      const n = 30, R = w * 0.85, g0 = (giro * Math.PI) / 180 * lado;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 3.4 + g0, r = (R * i) / n;
        d += `${i ? 'L' : 'M'}${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)}`;
      }
      return trazo(d, w * 0.2);
    }
    case 'grande': {
      const r = w * 0.68, ry = Math.max(1.2, r * parpado);
      return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(ry)}" fill="${T}"/>`
        + (parpado > 0.6 ? brillo(x - r * 0.32, y - ry * 0.35, r * 0.3) : '');
    }
    case 'preocupado': {
      // Ceja con el extremo interior alzado: preocupación, no enojo.
      return ojoAbierto(estilo, x, y + h * 0.08, w, h * 0.8, lado, parpado)
        + trazo(`M${f(x + lado * w * 0.85)} ${f(y - h * 0.62)} L${f(x - lado * w * 0.7)} ${f(y - h * 0.92)}`, w * 0.3);
    }
    default:
      return ojoAbierto(estilo, x, y, w, h, lado, parpado);
  }
}

function dibujarOjos(tipo, d, parpado, dil, giro) {
  return [-1, 1].map((lado) => ojo(tipo, d.cx + (lado * d.sep) / 2, d.cy, d.w * dil, d.h * dil, lado, parpado, giro, d.estilo)).join('');
}

function dibujarBoca(tipo, { cx: x, cy: y, w, grosor = 3.4 }) {
  switch (tipo) {
    case 'abierta':
      return `<path d="M${f(x - w * 0.55)} ${f(y)} Q${f(x)} ${f(y + w * 0.95)} ${f(x + w * 0.55)} ${f(y)} Z" fill="${T}" stroke="${T}" stroke-width="${f(grosor * 0.6)}" stroke-linejoin="round"/>`;
    case 'plana': return trazo(`M${f(x - w * 0.3)} ${f(y + w * 0.12)} L${f(x + w * 0.3)} ${f(y + w * 0.12)}`, grosor);
    case 'o': return `<ellipse cx="${f(x)}" cy="${f(y + w * 0.18)}" rx="${f(w * 0.2)}" ry="${f(w * 0.26)}" fill="${T}"/>`;
    case 'dormida': return `<ellipse cx="${f(x)}" cy="${f(y + w * 0.15)}" rx="${f(w * 0.12)}" ry="${f(w * 0.15)}" fill="${T}"/>`;
    case 'preocupada': return trazo(`M${f(x - w * 0.42)} ${f(y + w * 0.25)} Q${f(x)} ${f(y - w * 0.1)} ${f(x + w * 0.42)} ${f(y + w * 0.25)}`, grosor);
    case 'ondulada': {
      const p = w / 4;
      return trazo(`M${f(x - w / 2)} ${f(y + w * 0.1)} q${f(p / 2)} ${f(-p * 0.7)} ${f(p)} 0 t${f(p)} 0 t${f(p)} 0 t${f(p)} 0`, grosor);
    }
    case 'apretada':
      return trazo(`M${f(x - w * 0.42)} ${f(y + w * 0.1)} L${f(x - w * 0.21)} ${f(y)} L${f(x)} ${f(y + w * 0.1)} L${f(x + w * 0.21)} ${f(y)} L${f(x + w * 0.42)} ${f(y + w * 0.1)}`, grosor * 0.85);
    // Sonrisas de reposo propias de cada mascota (data-estilo en .m-boca).
    case 'gato':
      return trazo(`M${f(x - w / 2)} ${f(y)} q${f(w / 4)} ${f(w * 0.38)} ${f(w / 2)} 0 q${f(w / 4)} ${f(w * 0.38)} ${f(w / 2)} 0`, grosor);
    case 'pequena':
      return trazo(`M${f(x - w * 0.3)} ${f(y + w * 0.05)} Q${f(x)} ${f(y + w * 0.35)} ${f(x + w * 0.3)} ${f(y + w * 0.05)}`, grosor);
    case 'abierta-suave':
      return `<path d="M${f(x - w * 0.4)} ${f(y)} Q${f(x)} ${f(y + w * 0.7)} ${f(x + w * 0.4)} ${f(y)} Z" fill="${T}" stroke="${T}" stroke-width="${f(grosor * 0.6)}" stroke-linejoin="round"/>`;
    case 'ladeada':
      return trazo(`M${f(x - w * 0.42)} ${f(y + w * 0.1)} Q${f(x + w * 0.05)} ${f(y + w * 0.45)} ${f(x + w * 0.5)} ${f(y - w * 0.06)}`, grosor);
    default: return trazo(`M${f(x - w / 2)} ${f(y)} Q${f(x)} ${f(y + w * 0.5)} ${f(x + w / 2)} ${f(y)}`, grosor);
  }
}

function dibujarGlobo(tipo) {
  const F = 'var(--m-globo)', Bd = 'var(--m-globo-borde)', Tn = 'var(--m-globo-tinta)';
  const burbuja = `<circle cx="-14" cy="15" r="3.6" fill="${F}" stroke="${Bd}" stroke-width="2"/>`
    + `<circle cx="-20" cy="21" r="2.2" fill="${F}" stroke="${Bd}" stroke-width="1.6"/>`
    + `<circle r="16" fill="${F}" stroke="${Bd}" stroke-width="2"/>`;
  const contenido = {
    puntos: [-6, 0, 6].map((x) => `<circle class="m-punto" cx="${x}" cy="0" r="2.7" fill="${Tn}"/>`).join(''),
    alerta: '<rect x="-2.4" y="-10" width="4.8" height="12" rx="2.4" fill="var(--m-alerta)"/><circle cy="7" r="2.7" fill="var(--m-alerta)"/>',
    check: trazo('M-7 0.5 L-2 5.5 L7.5 -5.5', 4, 'var(--m-ok)'),
    pregunta: trazo('M-5 -4.5 Q-5 -10.5 0.5 -10.5 Q6 -10.5 6 -5.5 Q6 -1.5 0.5 0.5 L0.5 2.5', 3.4, Tn)
      + `<circle cx="0.5" cy="8" r="2.3" fill="${Tn}"/>`,
  }[tipo];
  return burbuja + contenido;
}

const FORMAS = {
  corazon: '<path d="M0 3.5 C-6 -1.5 -4.5 -7 0 -4 C4.5 -7 6 -1.5 0 3.5Z" fill="var(--m-corazon)"/>',
  cruz: '<path d="M-2.2 -6.5h4.4v4.3h4.3v4.4h-4.3v4.3h-4.4v-4.3h-4.3v-4.4h4.3z" fill="var(--m-cruz)"/>',
  destello: '<path d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6Z" fill="var(--m-destello)"/>',
  gota: '<path d="M0 -6 C3 -2 4.5 1 4.5 2.8 A4.5 4.5 0 0 1 -4.5 2.8 C-4.5 1 -3 -2 0 -6Z" fill="var(--m-sudor)"/>',
  z: '<path d="M-4 -4 H4 L-4 4 H4" fill="none" stroke="var(--m-zz)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};

/* ── La mascota ─────────────────────────────────────────────────────────── */

class Mascota {
  constructor(host, texto, { interactiva = true, alReaccionar = () => {} } = {}) {
    this.host = host;
    this.alReaccionar = alReaccionar;
    host.innerHTML = conIdsUnicos(texto, ++contador);
    const svg = (this.svg = host.querySelector('svg'));
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('overflow', 'visible');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const q = (s) => svg.querySelector(s);
    this.cuerpo = q('.m-cuerpo');
    this.sombra = q('.m-sombra');
    this.capas = [...svg.querySelectorAll('[data-paralaje]')].map((nodo) => ({ nodo, p: +nodo.dataset.paralaje, x: 0, y: 0, vx: 0, vy: 0 }));
    this.ojos = q('.m-ojos');
    this.boca = q('.m-boca');
    this.mejillas = q('.m-mejillas');
    this.dOjos = numeros(this.ojos.dataset);
    this.dBoca = numeros(this.boca.dataset);
    this.baseMejillas = this.mejillas ? +this.mejillas.dataset.base || 0.3 : 0;
    const datos = numeros(svg.dataset);
    this.base = datos.base ?? 178;
    this.cabezaY = datos.cabezaY ?? 60;
    this.sudor = { x: datos.sudorX ?? 140, y: datos.sudorY ?? 80 };

    const ancla = q('.m-globo');
    this.dGlobo = numeros(ancla.dataset);
    this.globoG = el('g');
    ancla.append(this.globoG);
    this.particulas = el('g', { class: 'm-particulas' });
    svg.append(this.particulas);

    if (this.dBoca.tipo === 'ecg') {
      const comun = { fill: 'none', stroke: T, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      this.ecg = [el('path', { ...comun, 'stroke-width': 6, opacity: 0.22 }), el('path', { ...comun, 'stroke-width': 2.4 })];
      this.boca.append(...this.ecg);
      this.fase = 0;
    }

    this.estado = 'reposo';
    this.pasajera = null;
    this.apretando = false;
    this.dormido = false;
    this.mirada = { x: 0, y: 0 };
    this.curioseo = { x: 0, y: 0, t: 0 };
    this.sx = resorte(1);
    this.sy = resorte(1);
    this.rot = resorte(0);
    this.oy = 0;
    this.vy = 0;
    this.rubor = 0;
    this.parpado = 1;
    this.parpadeo = null;
    this.proxParpadeo = performance.now() / 1000 + 1 + Math.random() * 3;
    this.pop = 0;
    this.popV = 0;
    this.globoMostrado = null;
    this.vivas = [];
    this.clics = [];
    this.proxEfecto = 0;
    this.claveOjos = '';
    this.claveBoca = null;
    // Rasgos que se encienden y apagan: el SVG decide cómo empieza
    // (data-brillo="no" en .m-ojos lo arranca sin brillo).
    this.conBrillo = this.dOjos.brillo !== 'no';
    this.conBoca = true;

    if (interactiva) this.escuchar();
    instancias.add(this);
    this.aplicarReducido();
    arrancar();
  }

  /* ── Entradas ── */

  escuchar() {
    const h = this.host;
    h.addEventListener('pointerenter', () => { this.encima = true; });
    h.addEventListener('pointerleave', () => { this.encima = false; this.soltar(false); });
    h.addEventListener('pointerdown', (e) => { if (e.button === 0) this.presionar(); });
    h.addEventListener('pointerup', () => this.soltar(true));
    h.addEventListener('pointercancel', () => this.soltar(false));
    h.addEventListener('focus', () => { this.enfocada = true; });
    h.addEventListener('blur', () => { this.enfocada = false; this.soltar(false); });
    h.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); this.presionar(); }
    });
    h.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.soltar(true); }
    });
  }

  presionar() {
    this.presionado = true;
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.apretando = true;
      this.alReaccionar('apretar');
    }, ESPERA_APRETAR);
  }

  soltar(valido) {
    if (!this.presionado) return;
    this.presionado = false;
    clearTimeout(this.temporizador);
    if (this.apretando) {
      // Al soltarlo rebota: el aplastado guarda energía.
      this.apretando = false;
      this.saltar(340);
      this.lanzar('toque', 600);
    } else if (valido) {
      this.toque();
    }
  }

  /* Un clic no suelta nada: solo responde el cuerpo y la cara. Los clics
     seguidos se cuentan, y al quinto se marea. */
  toque() {
    const ahora = performance.now();
    if (this.pasajera?.nombre === 'mareo') return;
    this.clics = this.clics.filter((t) => ahora - t < VENTANA_MAREO);
    this.clics.push(ahora);
    if (this.clics.length >= CLICS_MAREO) {
      this.clics = [];
      this.lanzar('mareo');
      this.alReaccionar('mareo');
      return;
    }
    this.lanzar('toque');
    this.aplastar(0.9);
    this.saltar(170);
    this.alReaccionar('toque');
  }

  despertar() {
    this.dormido = false;
    this.lanzar('sorpresa');
    this.saltar(220);
    this.alReaccionar('despertar');
  }

  setEstado(estado) {
    if (estado === this.estado) return;
    this.estado = estado;
    this.dormido = false;
    this.proxEfecto = 0;
    if (estado === 'listo') { this.saltar(300); this.estallar('destello', 7); }
    if (estado === 'problema') this.aplastar(0.5);
    this.alReaccionar(estado);
  }

  fijarBrillo(valor) {
    this.conBrillo = valor;
    this.claveOjos = '';
  }

  fijarBoca(valor) {
    this.conBoca = valor;
    this.claveBoca = null;
    if (this.ecg) this.boca.style.display = valor ? '' : 'none';
  }

  aplicarReducido() {
    if (reducido) this.svg.pauseAnimations?.();
    else this.svg.unpauseAnimations?.();
  }

  /* ── Efectos ── */

  lanzar(nombre, dura) {
    const d = dura ?? PASAJERAS[nombre].dura;
    this.pasajera = { nombre, dura: d, hasta: performance.now() + d };
  }

  aplastar(fuerza) {
    if (reducido) return;
    this.sx.v += 3.2 * fuerza;
    this.sy.v -= 3.2 * fuerza;
    // Los accesorios van sueltos: el golpe les llega un poco después y rebotan.
    for (const c of this.capas) if (c.p !== 1) c.vy += 60 * fuerza;
  }

  saltar(v) {
    if (reducido || this.oy < 0) return;
    this.vy = -v;
    this.oy = -0.01;
    // Se estira al despegar (y se aplasta al caer, en paso()).
    this.sy.v += v / 140;
    this.sx.v -= v / 160;
  }

  soltarParticula(tipo, x, y, o = {}) {
    const g = el('g');
    g.innerHTML = FORMAS[tipo];
    this.particulas.append(g);
    const p = {
      g, x, y,
      vx: o.vx ?? Math.random() * 40 - 20, vy: o.vy ?? -70, gr: o.gr ?? 0,
      vida: o.vida ?? 1.1, edad: 0, giro: o.giro ?? Math.random() * 60 - 30, escala: o.escala ?? 1.4,
    };
    // Con movimiento reducido la partícula aparece y se desvanece en su sitio.
    if (reducido) Object.assign(p, { vx: 0, vy: 0, gr: 0, giro: 0 });
    this.vivas.push(p);
  }

  estallar(tipo, n) {
    const cy = this.cabezaY + 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      this.soltarParticula(tipo, 100 + Math.cos(a) * 40, cy + Math.sin(a) * 40, {
        vx: Math.cos(a) * 80, vy: Math.sin(a) * 80 - 20, vida: 0.75, escala: 1.1,
      });
    }
  }

  expresion(ahora) {
    if (this.pasajera && ahora > this.pasajera.hasta) this.pasajera = null;
    const e = { ...ESTADOS[this.dormido ? 'dormido' : this.estado] };
    if (this.pasajera) Object.assign(e, PASAJERAS[this.pasajera.nombre]);
    if (this.apretando) Object.assign(e, PASAJERAS.apretado);
    return e;
  }

  /* ── Un cuadro ── */

  paso(t, dt, ahora) {
    if (!this.dormido && this.estado === 'reposo' && !this.apretando && ahora - ultimaActividad > SIESTA_MS) {
      this.dormido = true;
      this.proxEfecto = 0;
      this.alReaccionar('siesta');
    }
    const e = this.expresion(ahora);

    // Mirada: al cursor, o buscando mientras lee, o curioseando si no hay cursor.
    let mx, my;
    if (e.mirada === 'busca') { mx = Math.sin(t * 1.4) * 0.85; my = -0.5; }
    else if (['cerrado', 'espiral', 'apretado'].includes(e.ojos)) { mx = 0; my = this.dormido ? 0.4 : 0; }
    else if (cursor) {
      const r = this.host.getBoundingClientRect();
      const dx = cursor.x - (r.left + r.width / 2), dy = cursor.y - (r.top + r.height * 0.45);
      mx = dx / (Math.abs(dx) + 160);
      my = dy / (Math.abs(dy) + 160);
    } else {
      if (t > this.curioseo.t) {
        const centro = Math.random() < 0.3;
        this.curioseo = { x: centro ? 0 : Math.random() * 1.4 - 0.7, y: centro ? 0 : Math.random() * 0.9 - 0.5, t: t + 1.6 + Math.random() * 2 };
      }
      mx = this.curioseo.x;
      my = this.curioseo.y;
    }
    const a = 1 - Math.exp(-dt * 9);
    this.mirada.x += (mx - this.mirada.x) * a;
    this.mirada.y += (my - this.mirada.y) * a;

    // Parpadeo: 1 → 0 → 1 en 160 ms; a veces dos seguidos.
    if (this.parpadeo === null && t > this.proxParpadeo) this.parpadeo = t;
    if (this.parpadeo !== null) {
      const p = (t - this.parpadeo) / 0.16;
      if (p >= 1) {
        this.parpadeo = null;
        this.parpado = 1;
        this.proxParpadeo = t + (Math.random() < 0.18 ? 0.22 : 2.4 + Math.random() * 3.6);
      } else this.parpado = Math.max(0.08, Math.abs(1 - 2 * p));
    }

    const quiere = this.encima || this.enfocada || this.apretando ? 1 : 0;
    this.rubor += (quiere - this.rubor) * (1 - Math.exp(-dt * 6));

    // Cuerpo. Es un mochi: todo lo que lo deforma conserva el volumen (lo que
    // crece a lo alto lo pierde a lo ancho) y el apoyo es siempre la base.
    const ritmo = RITMOS[e.cuerpo] ?? RITMOS.respira;
    let resp = 0, rotExtra = 0, desp = 0, temblor = 0;
    if (!reducido) {
      resp = respiracion(t, ritmo.periodo) * ritmo.amplitud;
      if (ritmo.balanceo) {
        // Mecerse leyendo: un péndulo lento; el cuerpo se desplaza hacia
        // donde se inclina, como quien se balancea en la silla.
        const fase = Math.sin(t * Math.PI * 2 * ritmo.balanceo);
        rotExtra = fase * 3.2;
        desp = fase * 2.4;
      }
      if (e.cuerpo === 'tambalea' && this.pasajera) {
        // El mareo crece y se apaga (envolvente en campana) y dibuja un ocho:
        // giro y desplazamiento a frecuencias 2:1.
        const p = 1 - (this.pasajera.hasta - ahora) / this.pasajera.dura;
        const env = Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
        rotExtra = Math.sin(t * 7) * 8 * env;
        desp = Math.sin(t * 3.5) * 5 * env;
        temblor = Math.sin(t * 14) * 0.025 * env;
      }
    }
    this.rot.obj = (e.cuerpo === 'inclina' ? -7 : 0) + (reducido ? 0 : this.mirada.x * 4);
    this.sx.obj = this.apretando ? 1.13 : 1;
    this.sy.obj = this.apretando ? 0.84 : 1;
    // Poco amortiguado a propósito: al soltarlo o al aterrizar rebota dos o
    // tres veces y se asienta, como gelatina.
    moverResorte(this.sx, dt, 300, 13);
    moverResorte(this.sy, dt, 300, 13);
    // La inclinación hacia el cursor se pasa un poco y vuelve.
    moverResorte(this.rot, dt, 140, 11);
    if (this.oy < 0) {
      this.vy += 1500 * dt;
      this.oy += this.vy * dt;
      if (this.oy >= 0) {
        const golpe = Math.min(1, this.vy / 400);
        this.oy = 0;
        this.vy = 0;
        this.aplastar(golpe * 0.8);
      }
    }
    const sy = this.sy.x + resp + temblor;
    const sx = this.sx.x - resp * 0.85 - temblor * 0.85;
    // La parte de arriba llega tarde a la inclinación: un sesgo que depende de
    // la velocidad del giro hace que el cuerpo se doble en vez de rotar rígido.
    const sesgo = reducido ? 0 : Math.max(-6, Math.min(6, -this.rot.v * 0.1));
    this.cuerpo.setAttribute('transform',
      `translate(${f(100 + desp)} ${f(this.base + this.oy)}) rotate(${f(this.rot.x + rotExtra)}) skewX(${f(sesgo)}) scale(${f(sx)} ${f(sy)}) translate(-100 ${-this.base})`);
    if (this.sombra) {
      const s = Math.max(0.5, 1 + this.oy / 140);
      this.sombra.setAttribute('transform', `translate(${f(100 + desp)} ${this.base}) scale(${f(s * sx)} 1) translate(-100 ${-this.base})`);
      this.sombra.setAttribute('opacity', f(0.14 * s));
    }

    // Capas: la cara sigue la mirada al instante; los accesorios van en un
    // resorte propio, así que se quedan un poco atrás y se balancean al parar.
    for (const c of this.capas) {
      const ox = this.mirada.x * 7 * c.p, oy = this.mirada.y * 5 * c.p;
      if (c.p === 1 || reducido) {
        c.x = ox; c.y = oy; c.vx = 0; c.vy = 0;
      } else {
        const h = dt / 4;
        for (let i = 0; i < 4; i++) {
          c.vx += (150 * (ox - c.x) - 12 * c.vx) * h;
          c.vy += (150 * (oy - c.y) - 12 * c.vy) * h;
          c.x += c.vx * h;
          c.y += c.vy * h;
        }
      }
      c.nodo.setAttribute('transform', `translate(${f(c.x)} ${f(c.y)})`);
    }

    // Ojos: solo se redibujan si algo cambió.
    const dil = 1 + this.rubor * 0.08;
    const giro = e.ojos === 'espiral' ? Math.round(t * 420) % 360 : 0;
    const parpado = ['pildora', 'grande', 'preocupado'].includes(e.ojos) ? this.parpado : 1;
    const clave = `${e.ojos}|${f(parpado)}|${f(dil)}|${giro}|${this.conBrillo}`;
    if (clave !== this.claveOjos) {
      this.claveOjos = clave;
      const ojos = dibujarOjos(e.ojos, this.dOjos, parpado, dil, giro);
      this.ojos.innerHTML = this.conBrillo ? ojos : ojos.replace(/<circle data-brillo[^>]*\/>/g, '');
    }

    if (this.ecg) {
      if (this.conBoca) this.latir(e, dt);
    } else {
      // En reposo sonríe a su manera; las demás expresiones son comunes.
      const boca = !this.conBoca ? '' : e.boca === 'sonrisa' && this.dBoca.estilo ? this.dBoca.estilo : e.boca;
      if (boca !== this.claveBoca) {
        this.claveBoca = boca;
        this.boca.innerHTML = boca ? dibujarBoca(boca, this.dBoca) : '';
      }
    }

    if (this.mejillas) {
      const op = this.baseMejillas + (e.ojos === 'feliz' ? 0.2 : 0) + this.rubor * 0.5;
      this.mejillas.setAttribute('opacity', f(Math.min(1, op)));
    }

    this.moverGlobo(e.globo ?? null, t, dt);
    this.efectosDeEstado(e, t);
    this.moverParticulas(dt);
  }

  latir(e, dt) {
    if (!reducido) this.fase += dt * (e.ritmo ?? 1) * 1.2;
    const { cx, cy, w, alto } = this.dBoca;
    const n = 72, ventana = 2.2;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const pos = this.fase - (1 - i / n) * ventana;
      const k = Math.floor(pos);
      let v = latido(pos - k);
      if (e.irregular) { const h = azar(k); v = h < 0.3 ? 0 : v * (0.6 + h * 0.8); }
      if (e.plano) v *= 0.45;
      d += `${i ? 'L' : 'M'}${f(cx - w / 2 + (w * i) / n)} ${f(cy - v * alto)}`;
    }
    for (const p of this.ecg) p.setAttribute('d', d);
  }

  moverGlobo(tipo, t, dt) {
    if (tipo && tipo !== this.globoMostrado) {
      this.globoG.innerHTML = dibujarGlobo(tipo);
      this.globoMostrado = tipo;
      this.puntos = [...this.globoG.querySelectorAll('.m-punto')];
      this.pop = Math.min(this.pop, 0.4);
    }
    const obj = tipo ? 1 : 0;
    let escala = 1;
    if (reducido) {
      // Sin rebote: el globo aparece y se va con un fundido.
      this.pop += Math.max(-dt * 6, Math.min(dt * 6, obj - this.pop));
    } else {
      this.popV += (320 * (obj - this.pop) - 18 * this.popV) * dt;
      this.pop += this.popV * dt;
      escala = Math.max(0, this.pop);
    }
    if (!tipo && this.pop < 0.02) {
      this.globoMostrado = null;
      this.globoG.innerHTML = '';
      this.pop = 0;
      this.popV = 0;
      return;
    }
    const { x, y } = this.dGlobo;
    this.globoG.setAttribute('transform',
      `translate(${f(x + this.mirada.x * 3)} ${f(y + this.mirada.y * 2 + this.oy)}) scale(${f(escala)})`);
    this.globoG.setAttribute('opacity', f(Math.max(0, Math.min(1, this.pop * (reducido ? 1 : 2)))));
    // Los puntos de «pensando»: saltan; con movimiento reducido pulsan en su sitio.
    this.puntos?.forEach((p, i) => {
      const s = Math.max(0, Math.sin(t * 6 - i * 0.9));
      if (reducido) { p.setAttribute('cy', 0); p.setAttribute('opacity', f(0.35 + 0.65 * s)); }
      else p.setAttribute('cy', f(-3.5 * s));
    });
  }

  efectosDeEstado(e, t) {
    if (t < this.proxEfecto) return;
    if (this.dormido && !this.pasajera) {
      this.soltarParticula('z', this.dGlobo.x - 14, this.dGlobo.y + 14, { vx: 14, vy: -22, vida: 2.2, giro: 0, escala: 1.2 });
      this.proxEfecto = t + 1.3;
    } else if (this.estado === 'problema' && !this.pasajera) {
      this.soltarParticula('gota', this.sudor.x, this.sudor.y, { vx: 4, vy: 8, gr: 160, vida: 1.1, giro: 0, escala: 1.2 });
      this.proxEfecto = t + 2.6;
    } else {
      this.proxEfecto = t + 0.5;
    }
  }

  moverParticulas(dt) {
    this.vivas = this.vivas.filter((p) => {
      p.edad += dt;
      if (p.edad >= p.vida) { p.g.remove(); return false; }
      p.vy += p.gr * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const prog = p.edad / p.vida;
      const op = prog < 0.15 ? prog / 0.15 : prog > 0.6 ? (1 - prog) / 0.4 : 1;
      const s = p.escala * (reducido ? 1 : 0.6 + 0.4 * Math.min(1, prog * 4));
      p.g.setAttribute('transform', `translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.giro * prog)}) scale(${f(s)})`);
      p.g.setAttribute('opacity', f(op));
      return true;
    });
  }
}

function arrancar() {
  if (enMarcha) return;
  enMarcha = true;
  let previo = performance.now();
  const vuelta = (ahora) => {
    const dt = Math.max(0, Math.min((ahora - previo) / 1000, 1 / 30));
    previo = ahora;
    for (const m of instancias) {
      if (!m.host.isConnected) { instancias.delete(m); continue; }
      m.paso(ahora / 1000, dt, ahora);
    }
    requestAnimationFrame(vuelta);
  };
  requestAnimationFrame(vuelta);
}
