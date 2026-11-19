/* Los gráficos del tablero de desempeño.

   El kit todavía no tiene un gráfico de línea con meta ni barras que se puedan
   pulsar (sus `SeriesBars` y `StackedBars` solo muestran). Un tablero de
   desempeño los necesita: la meta es la referencia contra la que se mira todo,
   y elegir un mes en el gráfico es la forma natural de explorarlo. Se dibujan
   aquí, en SVG y solo con tokens; si otro sistema del hospital los necesita,
   se pasan al kit.

   Criterio: los datos en el color del sistema, el contexto en gris y la escala
   real (de 0 a 100 %, con una marca cada 10): un 7 % se ve como un 7 %, lejos
   de la meta, que es lo que hay que ver. Cada punto dice su cifra en gris; la
   del último mes, en negrita y con el color de su situación. Las cifras van
   siempre arriba del punto, con un contorno del color del fondo para leerse
   aunque pasen sobre la línea. Un mes sin datos
   no se dibuja como cero. Cada columna de mes es un control (clic, Enter o
   las flechas) con su tooltip. */

import { useRef } from 'react';
import { FloatingTip, useFloatingTip } from '@hrl/core-ui';
import { numero, fechaCorta } from '@/app/dominio/formato.js';
import { CLASES, ESTADO_MES, fraccion, mesAbierto, nombreMes, plural, puntos, textoMeta } from '@/app/dominio/desempeno.js';

const MESES = Array.from({ length: 12 }, (_, i) => i + 1);
const texto = (tamano = 'var(--text-xs)', color = 'var(--muted-foreground)', peso) => ({ fontSize: tamano, fill: color, fontWeight: peso });

/* Un texto sobre el dibujo lleva un contorno del color del fondo: así se lee
   aunque pase por encima de la línea o de una marca de la escala. */
const conHalo = (estilo) => ({ ...estilo, stroke: 'var(--surface)', strokeWidth: 4, paintOrder: 'stroke', strokeLinejoin: 'round' });

/* La geometría común: doce columnas de mes, ancho fijo del dibujo (el SVG se
   escala al contenedor). */
function geometria({ W = 800, H = 380, L = 64, R = 96, T = 28, B = 80 } = {}) {
  const st = (W - L - R) / 12;
  return { W, H, L, R, T, B, st, alto: H - T - B, X: (mes) => L + st * (mes - 1) + st / 2 };
}

/* Las columnas que se pulsan: una por mes con datos. Flechas para moverse. */
function Columnas({ g, meses, elegido, onElegir, tipDe, alto }) {
  const { tip, follow, anchor, hide } = useFloatingTip();
  const refs = useRef({});
  const conDatos = meses.map((m) => m.mes);
  const mover = (mes, paso) => {
    const siguiente = conDatos[conDatos.indexOf(mes) + paso];
    if (siguiente == null) return;
    onElegir(siguiente);
    refs.current[siguiente]?.focus();
  };
  return (
    <>
      {meses.map((m) => {
        const t = tipDe(m);
        return (
          <rect
            key={m.mes}
            ref={(el) => {
              refs.current[m.mes] = el;
            }}
            className="hrl-grafico__columna"
            x={g.X(m.mes) - g.st / 2}
            y={g.T - 18}
            width={g.st}
            height={alto}
            role="button"
            tabIndex={0}
            aria-pressed={m.mes === elegido}
            aria-label={`${t.title}. ${t.body}`}
            onClick={() => onElegir(m.mes)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onElegir(m.mes);
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                mover(m.mes, e.key === 'ArrowRight' ? 1 : -1);
              }
            }}
            onMouseEnter={(e) => follow(e, t.title, t.body)}
            onMouseMove={(e) => follow(e, t.title, t.body)}
            onMouseLeave={hide}
            onFocus={(e) => anchor(e.currentTarget, t.title, t.body)}
            onBlur={hide}
          />
        );
      })}
      <FloatingTip tip={tip} />
    </>
  );
}

/* El eje de los meses: el nombre, cuántos casos tuvo y el título del eje. */
function EjeDeMeses({ g, anio, meses, elegido, y0, conCasos = true }) {
  const de = Object.fromEntries(meses.map((m) => [m.mes, m]));
  return (
    <>
      <line x1={g.L} x2={g.W - g.R} y1={y0} y2={y0} style={{ stroke: 'var(--muted-foreground)' }} />
      {MESES.map((mes) => (
        <text key={mes} x={g.X(mes)} y={y0 + 20} textAnchor="middle" style={texto('var(--text-xs)', mes === elegido ? 'var(--foreground)' : 'var(--muted-foreground)', mes === elegido ? 'var(--weight-bold)' : undefined)} opacity={de[mes] ? 1 : 0.4}>
          {nombreMes(anio, mes).slice(0, 3)}
        </text>
      ))}
      {conCasos && (
        <>
          <text x={g.L - 12} y={y0 + 38} textAnchor="end" style={texto()}>
            Casos
          </text>
          {meses.map((m) => (
            <text key={m.mes} x={g.X(m.mes)} y={y0 + 38} textAnchor="middle" style={texto()}>
              {m.denominador}
            </text>
          ))}
        </>
      )}
      <text x={g.L + (g.W - g.L - g.R) / 2} y={y0 + 64} textAnchor="middle" style={texto('var(--text-sm)', 'var(--foreground)', 'var(--weight-semibold)')}>
        Mes del diagnóstico, {anio}
      </text>
    </>
  );
}

function TituloY({ g, children }) {
  return (
    <text transform="rotate(-90)" x={-(g.T + g.alto / 2)} y={16} textAnchor="middle" style={texto('var(--text-sm)', 'var(--foreground)', 'var(--weight-semibold)')}>
      {children}
    </text>
  );
}

/* La franja del mes elegido. */
function Elegido({ g, mes, alto }) {
  if (!mes) return null;
  return <rect x={g.X(mes) - g.st / 2} y={g.T - 18} width={g.st} height={alto} style={{ fill: 'var(--muted)' }} />;
}

/* --------------------------------------------------------- logro acumulado */

/* El acumulado de enero a cada mes, en su escala real de 0 a 100 %, con la
   meta como única guía fuerte. Punto lleno: el mes ya no cambia; punto con
   centro blanco: preliminar. Un rombo azul marca el mes en que MINSA publicó
   otra cifra; la línea punteada vertical, el corte del último reporte de MINSA. */
export function LogroAcumulado({ anio, meses, meta, elegido, onElegir, mesConCorte, fechaCorte }) {
  const g = geometria();
  const y = (v) => g.T + (1 - v) * g.alto;
  const y0 = y(0);
  const conDato = meses.filter((m) => m.acumulado.porcentaje != null);
  const ultimo = conDato.at(-1);
  const fuera = (v) => meta != null && v < meta;
  const d = conDato.map((m, i) => `${i ? 'L' : 'M'}${g.X(m.mes).toFixed(1)} ${y(m.acumulado.porcentaje).toFixed(1)}`).join(' ');

  /* El acumulado de lo publicado por MINSA, para marcar dónde difiere. */
  let n = 0;
  let dd = 0;
  const difiere = [];
  for (const m of meses) {
    if (!m.minsa) break;
    n += m.minsa.numerador;
    dd += m.minsa.denominador;
    if (dd && Math.abs(n / dd - (m.acumulado.porcentaje ?? 0)) > 1e-9) difiere.push({ mes: m.mes, v: n / dd });
  }
  const siguienteAlCorte = meses.find((m) => m.mes === mesConCorte + 1);
  const alto = g.alto + 18 + 44;

  return (
    <div className="hrl-grafico">
      <svg viewBox={`0 0 ${g.W} ${g.H}`} role="group" aria-label={`Logro acumulado por mes de ${anio}${ultimo ? `: ${fraccion(ultimo.acumulado.porcentaje)}` : ''}, frente a la meta de ${textoMeta(meta)}. Elija un mes para ver su detalle.`}>
        <Elegido g={g} mes={elegido} alto={alto} />
        {Array.from({ length: 11 }, (_, i) => i / 10).map((v, i) => (
          <g key={v}>
            <line x1={g.L} x2={g.W - g.R} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--border)' }} strokeDasharray={i % 2 ? '2 4' : undefined} />
            {i % 2 === 0 && (
              <text x={g.L - 12} y={y(v) + 4} textAnchor="end" style={texto()}>
                {numero(v * 100)} %
              </text>
            )}
          </g>
        ))}
        <TituloY g={g}>Logro acumulado (%)</TituloY>
        {meta != null && (
          <g>
            <line x1={g.L} x2={g.W - g.R} y1={y(meta)} y2={y(meta)} style={{ stroke: 'var(--foreground)' }} strokeWidth="1.5" strokeDasharray="6 5" />
            <text x={g.W - g.R + 8} y={y(meta) - 3} style={texto('var(--text-sm)', 'var(--foreground)', 'var(--weight-bold)')}>
              Meta
            </text>
            <text x={g.W - g.R + 8} y={y(meta) + 14} style={texto('var(--text-sm)', 'var(--foreground)')}>
              {textoMeta(meta)}
            </text>
          </g>
        )}
        {mesConCorte > 0 && siguienteAlCorte && fechaCorte && (
          <g>
            <line x1={g.X(mesConCorte) + g.st / 2} x2={g.X(mesConCorte) + g.st / 2} y1={y(0.5)} y2={y0} style={{ stroke: 'var(--subtle-foreground)' }} strokeDasharray="1 4" />
            <text x={g.X(mesConCorte) + g.st / 2 - 6} y={y(0.5) + 4} textAnchor="end" style={conHalo(texto())}>
              Corte MINSA {fechaCorta(fechaCorte).slice(0, 5)}
            </text>
          </g>
        )}
        <path d={d} fill="none" style={{ stroke: 'var(--primary)' }} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {difiere.map((x) => (
          <path key={x.mes} d={`M${g.X(x.mes)} ${y(x.v) - 6} l6 6 l-6 6 l-6 -6z`} fill="none" style={{ stroke: 'var(--info)' }} strokeWidth="1.5" />
        ))}
        {conDato.map((m) => {
          const v = m.acumulado.porcentaje;
          const esUltimo = m === ultimo;
          const preliminar = mesAbierto(m);
          const r = m.mes === elegido ? 6 : 4.5;
          return (
            <g key={m.mes}>
              <circle cx={g.X(m.mes)} cy={y(v)} r={r} style={{ fill: preliminar ? 'var(--surface)' : 'var(--primary)', stroke: 'var(--primary)' }} strokeWidth={preliminar ? 2.5 : 0} />
              {!esUltimo && (
                <text x={g.X(m.mes)} y={y(v) - 12} textAnchor="middle" style={conHalo(texto('var(--text-xs)', m.mes === elegido ? 'var(--foreground)' : 'var(--muted-foreground)', m.mes === elegido ? 'var(--weight-bold)' : 'var(--weight-medium)'))}>
                  {fraccion(v)}
                </text>
              )}
            </g>
          );
        })}
        {ultimo && (
          <g>
            <text x={g.X(ultimo.mes) + 11} y={y(ultimo.acumulado.porcentaje) + 5} style={conHalo(texto('var(--text-md)', fuera(ultimo.acumulado.porcentaje) ? 'var(--destructive-text)' : 'var(--success-text)', 'var(--weight-bold)'))}>
              {fraccion(ultimo.acumulado.porcentaje)}
            </text>
            {mesAbierto(ultimo) && (
              <text x={g.X(ultimo.mes) + 11} y={y(ultimo.acumulado.porcentaje) - 14} style={conHalo(texto('var(--text-xs)', 'var(--foreground)', 'var(--weight-semibold)'))}>
                {ESTADO_MES[ultimo.estado].etiqueta.toLowerCase()}
              </text>
            )}
          </g>
        )}
        <EjeDeMeses g={g} anio={anio} meses={meses} elegido={elegido} y0={y0} />
        <Columnas
          g={g}
          meses={meses}
          elegido={elegido}
          onElegir={onElegir}
          alto={alto}
          tipDe={(m) => ({
            title: `${nombreMes(anio, m.mes)} · ${ESTADO_MES[m.estado].etiqueta.toLowerCase()}`,
            body: `Acumulado ${fraccion(m.acumulado.porcentaje)} (${m.acumulado.numerador} de ${m.acumulado.denominador})${meta != null && m.acumulado.porcentaje != null ? `, ${puntos(m.acumulado.porcentaje - meta)} de la meta` : ''}. En el mes, ${m.a_tiempo} de ${m.denominador} a tiempo.${m.minsa ? ` MINSA: ${m.minsa.numerador}/${m.minsa.denominador}.` : ''}`,
          })}
        />
      </svg>
    </div>
  );
}

/* --------------------------------------------------------- pacientes por mes */

/* Escala redonda para contar pacientes: 0, paso, 2·paso… hasta cubrir el máximo. */
function escala(maximo) {
  const paso = Math.max(1, Math.ceil(maximo / 5));
  return { tope: paso * 5, marcas: [0, 1, 2, 3, 4, 5].map((i) => i * paso) };
}

/* Qué le pasa hoy a cada paciente del denominador, mes a mes: una barra sólida
   por mes, con el total encima. Pulsar un mes lo elige; si tiene casos que
   todavía pueden sumar, quien lo usa abre su lista. */
export function PacientesPorMes({ anio, meses, elegido, onElegir }) {
  const g = geometria();
  const { tope, marcas } = escala(Math.max(1, ...meses.map((m) => m.denominador)));
  const y = (v) => g.T + (1 - v / tope) * g.alto;
  const y0 = y(0);
  const ancho = g.st * 0.62;
  const alto = g.alto + 18 + 44;
  return (
    <div className="hrl-grafico">
      <svg viewBox={`0 0 ${g.W} ${g.H}`} role="group" aria-label={`Pacientes de cada mes de ${anio}, según lo que les pasa hoy. Elija un mes para ver sus casos.`}>
        <Elegido g={g} mes={elegido} alto={alto} />
        {marcas.map((v) => (
          <g key={v}>
            <line x1={g.L} x2={g.W - g.R} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--border)' }} />
            <text x={g.L - 12} y={y(v) + 4} textAnchor="end" style={texto()}>
              {v}
            </text>
          </g>
        ))}
        <TituloY g={g}>Pacientes del mes</TituloY>
        {meses.map((m) => {
          let base = 0;
          return (
            <g key={m.mes}>
              {CLASES.map((k) => {
                const v = m[k.clave];
                if (!v) return null;
                const arriba = y(base + v);
                const h = y(base) - arriba;
                base += v;
                return <rect key={k.clave} x={g.X(m.mes) - ancho / 2} y={arriba} width={ancho} height={h} style={{ fill: k.color }} />;
              })}
              <text x={g.X(m.mes)} y={y(m.denominador) - 7} textAnchor="middle" style={conHalo(texto('var(--text-xs)', 'var(--foreground)', 'var(--weight-semibold)'))}>
                {m.denominador}
              </text>
            </g>
          );
        })}
        <EjeDeMeses g={g} anio={anio} meses={meses} elegido={elegido} y0={y0} conCasos={false} />
        <Columnas
          g={g}
          meses={meses}
          elegido={elegido}
          onElegir={onElegir}
          alto={alto}
          tipDe={(m) => ({
            title: `${nombreMes(anio, m.mes)} · ${plural(m.denominador, 'paciente', 'pacientes')}`,
            body: `${CLASES.filter((k) => m[k.clave]).map((k) => `${k.etiqueta}: ${m[k.clave]}`).join(' · ')}${m.por_gestionar ? `. ${plural(m.por_gestionar, 'caso todavía puede sumar', 'casos todavía pueden sumar')}: pulse para verlos.` : '.'}`,
          })}
        />
      </svg>
    </div>
  );
}

/* --------------------------------------------------------------- cuadritos */

/* Un cuadro por paciente del mes, en el orden de las clases: con pocos casos
   por mes, contar personas se entiende mejor que un porcentaje. */
export function CuadrosPorPaciente({ mes }) {
  const resumen = CLASES.filter((k) => mes[k.clave]).map((k) => `${k.etiqueta}: ${mes[k.clave]}`).join('; ');
  return (
    <div className="hrl-cuadros" role="img" aria-label={`Un cuadro por paciente. ${resumen}.`}>
      {CLASES.flatMap((k) => Array.from({ length: mes[k.clave] }, (_, i) => <span key={`${k.clave}-${i}`} className="hrl-cuadro" style={{ '--cuadro': k.color }} />))}
    </div>
  );
}

/* La muestra de una clase, para las leyendas. */
export function Muestra({ clase }) {
  return <span aria-hidden="true" className="hrl-cuadro hrl-cuadro--chico" style={{ '--cuadro': clase.color }} />;
}

/* --------------------------------------------------------------- tendencia */
