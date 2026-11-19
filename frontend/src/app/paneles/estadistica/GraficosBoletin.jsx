import { numero } from '@/app/dominio/formato.js';

/* El gráfico de torta del boletín impreso: cada porción lleva su rótulo
   («Para Pacientes, 45%») y el conjunto va en un recuadro. El impreso las
   dibuja en 3D; aquí van planas, porque la perspectiva agranda las porciones
   de adelante y el lector compara áreas que no son las del dato.

   El kit no tiene gráfico circular: se dibuja con SVG y los tokens del kit.
   Si otro módulo lo necesita, se pide al kit en lugar de copiarlo. */
const COLORES = ['var(--primary)', 'var(--warning)', 'var(--success)', 'var(--info)', 'var(--destructive)', 'var(--neutral)'];

/* Por debajo de esta parte el rótulo no cabe dentro de la porción y va
   afuera, junto al borde. */
const MINIMO_DENTRO = 0.12;

const punto = (cx, cy, r, angulo) => [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)];

export function GraficoTorta({ partes, etiqueta }) {
  const total = partes.reduce((a, p) => a + p.valor, 0);
  if (!total) return null;

  const radio = 110;
  const margen = 120;
  const ancho = 2 * (radio + margen);
  const alto = 2 * radio + 60;
  const cx = ancho / 2;
  const cy = alto / 2;

  let inicio = -Math.PI / 2;
  const porciones = partes.map((p, i) => {
    const fraccion = p.valor / total;
    const fin = inicio + fraccion * 2 * Math.PI;
    const medio = (inicio + fin) / 2;
    const [x0, y0] = punto(cx, cy, radio, inicio);
    const [x1, y1] = punto(cx, cy, radio, fin);
    const grande = fin - inicio > Math.PI ? 1 : 0;
    const camino = fraccion >= 0.9999
      ? null
      : `M ${cx} ${cy} L ${x0} ${y0} A ${radio} ${radio} 0 ${grande} 1 ${x1} ${y1} Z`;
    const dentro = fraccion >= MINIMO_DENTRO;
    const [lx, ly] = punto(cx, cy, dentro ? radio * 0.58 : radio * 1.12, medio);
    inicio = fin;
    return { ...p, i, fraccion, camino, dentro, lx, ly, derecha: Math.cos(medio) >= 0 };
  });

  return (
    <div className="boletin-grafico-marco">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={etiqueta} className="boletin-torta">
        {porciones.map((p) =>
          p.camino ? (
            <path key={p.label} d={p.camino} fill={COLORES[p.i % COLORES.length]} stroke="var(--papel)" strokeWidth="1.5" />
          ) : (
            <circle key={p.label} cx={cx} cy={cy} r={radio} fill={COLORES[p.i % COLORES.length]} />
          ),
        )}
        {porciones.map((p) => (
          <text
            key={`t-${p.label}`}
            x={p.lx}
            y={p.ly}
            textAnchor={p.dentro ? 'middle' : p.derecha ? 'start' : 'end'}
            className={`boletin-torta-rotulo${p.dentro ? ' boletin-torta-rotulo--dentro' : ''}`}
          >
            <tspan x={p.lx} dy="-0.2em">{p.label},</tspan>
            <tspan x={p.lx} dy="1.2em">
              {numero(p.fraccion * 100, 0)}% ({numero(p.valor)})
            </tspan>
          </text>
        ))}
      </svg>
    </div>
  );
}
