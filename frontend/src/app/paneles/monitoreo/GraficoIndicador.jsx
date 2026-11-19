/* El gráfico de cada indicador: línea, o barras con las mismas referencias.

   El kit solo trae barras sin referencias (`SeriesBars`) y no tiene gráfico de línea. Se dibuja
   aquí en SVG y solo con tokens, como `paneles/desempeno/graficos.jsx`; si otro sistema del
   hospital lo necesita, se pasa al kit.

   Referencias: el logro, el umbral y la mediana, y el mes actual resaltado. Sin límites de
   control (se retiraron el 03/11/2026, a pedido de Estadística): lo que se lee es la meta.

   Criterio:
     · Lo que se concluye sale de `dominio/analisis.js`, con las cifras de este momento.
     · Un mes sin dato es un hueco: la línea se corta, y los meses vacíos del final se rotulan.
     · Las barras siempre empiezan en cero, porque su largo es la medida. La línea puede acercar
       el eje para que se vea la variación, y entonces lo dice.
     · Se dibuja al ancho real de la tarjeta y no se escala: en una tarjeta angosta, escalar
       un `viewBox` encogía también el texto hasta volverlo ilegible.
     · Un mes que no alcanza la meta cambia de forma, no solo de color: punto hueco, barra con
       contorno. Una cifra acumulada no se marca: en agosto todavía no le toca llegar.
     · Al pasar sobre un mes, ese mes se resalta y los demás se atenúan. Toda la columna responde,
       no solo el punto: nadie tiene que apuntarle a 8 píxeles.
     · El tooltip sale encima del punto y anclado a él, no al costado del cursor (`TipDelMes`). Al
       costado tapaba los meses siguientes, que es justo lo que se está comparando.
     · Un solo punto de tabulación y flechas para recorrer los meses: doce paradas por tarjeta
       harían imposible cruzar la página con el teclado. */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SegmentedControl, Tooltip } from '@hrl/core-ui';
import { analizarSerie, cumpleElLogro, lecturaDeLaSerie, nombreDelMes } from '@/app/dominio/analisis.js';
import { ritmoEsperado, textoDeLogro } from '@/app/dominio/monitoreo.js';
import { numero } from '@/app/dominio/formato.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';

const VISTAS = Object.freeze([
  { value: 'lineas', label: 'Líneas', ariaLabel: 'Ver como líneas' },
  { value: 'barras', label: 'Barras', ariaLabel: 'Ver como barras' },
]);

const ANCHO_INICIAL = 560;
const texto = (color = 'var(--muted-foreground)', peso) => ({ fontSize: 'var(--text-xs)', fill: color, fontWeight: peso });
const conHalo = (estilo) => ({ ...estilo, stroke: 'var(--surface)', strokeWidth: 4, paintOrder: 'stroke', strokeLinejoin: 'round' });

function useAnchoDe(referencia) {
  const [ancho, setAncho] = useState(ANCHO_INICIAL);
  useEffect(() => {
    const el = referencia.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(([e]) => {
      const nuevo = Math.round(e.contentRect.width);
      if (nuevo > 0) setAncho(nuevo);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [referencia]);
  return ancho;
}

/* Marcas redondas que cubren de `desde` a `hasta`: 1, 2, 2,5 o 5 por potencia de 10. */
function marcasDeEscala(desde, hasta, cuantas = 5) {
  const rango = hasta - desde || Math.abs(hasta) || 1;
  const crudo = rango / cuantas;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo) ?? 10 * potencia;
  const inicio = Math.floor(desde / paso) * paso;
  const marcas = [];
  for (let v = inicio; v < hasta + paso * 0.999; v += paso) marcas.push(Number(v.toFixed(6)));
  return marcas;
}

/* Las referencias a la derecha: si dos caen casi juntas se separan, en orden, para no pisarse. */
function separarRotulos(rotulos, alto, minimo = 13) {
  const orden = [...rotulos].sort((a, b) => a.y - b.y);
  for (let k = 1; k < orden.length; k++) {
    if (orden[k].y - orden[k - 1].y < minimo) orden[k] = { ...orden[k], y: orden[k - 1].y + minimo };
  }
  const exceso = (orden.at(-1)?.y ?? 0) - alto;
  return exceso > 0 ? orden.map((r) => ({ ...r, y: r.y - exceso })) : orden;
}

function tramosDeLinea(puntos, x, y) {
  const tramos = [];
  let actual = [];
  puntos.forEach((p, i) => {
    if (p.valor == null) {
      if (actual.length) tramos.push(actual);
      actual = [];
    } else {
      actual.push(`${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`);
    }
  });
  if (actual.length) tramos.push(actual);
  return tramos.filter((t) => t.length > 1).map((t) => `M${t.join(' L')}`);
}

const nivel = (cuanto, referencia, escribir, nombre) => {
  const dif = cuanto - referencia;
  if (Math.abs(dif) < 1e-9) return `Justo en ${nombre} (${escribir(referencia)}).`;
  return `${escribir(Math.abs(dif))} ${dif > 0 ? 'por encima' : 'por debajo'} de ${nombre} (${escribir(referencia)}).`;
};

/* Lo que explica el tooltip de un mes: qué es ese valor y cómo queda frente a todo lo demás. */
function explicarMes(p, i, { puntos, analisis, escribir, leerMes, describir, logro, marcarLogro, ritmo, comparacion, nombreComparacion, textoLogro }) {
  const solo = (n) => escribir(n, { soloNumero: true });
  const lineas = [];
  const lectura = leerMes?.(p) ?? describir?.(p);
  if (lectura) lineas.push(lectura);
  const anterior = puntos.slice(0, i).reverse().find((x) => x.valor != null);
  if (anterior) {
    const dif = p.valor - anterior.valor;
    lineas.push(Math.abs(dif) < 1e-9 ? `Igual que en ${nombreDelMes(anterior.periodo)}.` : `${dif > 0 ? 'Sube' : 'Baja'} ${solo(Math.abs(dif))} frente a ${nombreDelMes(anterior.periodo)}.`);
  }
  if (analisis.centro != null && analisis.meses > 1) lineas.push(nivel(p.valor, analisis.centro, solo, 'la mediana'));
  if (marcarLogro) lineas.push(`${cumpleElLogro(p.valor, logro) ? 'Este mes alcanza la meta' : 'Este mes no alcanza la meta'} (${textoLogro}).`);
  if (ritmo) lineas.push(`Para ir camino a la meta de diciembre, a este mes debía llevar ${solo(ritmoEsperado(logro, Number(p.periodo.slice(5))))}.`);
  const otra = comparacion?.find((c) => c.periodo === p.periodo)?.valor;
  if (otra != null) lineas.push(`${nombreComparacion}: ${solo(otra)}.`);
  return lineas;
}

const MARGEN_DE_VENTANA = 12;
const SEPARACION_DEL_PUNTO = 16;

/* El tooltip de un mes. `FloatingTip` del kit sale siempre al costado, a propósito: aquí se pidió
   encima (Estadística, 03/11/2026), así que se ubica aquí, con el mismo aspecto (`.hrl-tip`). Se
   mide antes de pintarse para no salirse de la ventana; si arriba no cabe, va abajo. Si otro
   sistema lo necesita, se pasa al kit. */
function TipDelMes({ tip }) {
  const caja = useRef(null);
  const [lugar, setLugar] = useState(null);
  useLayoutEffect(() => {
    const { offsetWidth: ancho, offsetHeight: alto } = caja.current;
    const anchoVentana = document.documentElement.clientWidth;
    const left = Math.min(Math.max(tip.x - ancho / 2, MARGEN_DE_VENTANA), anchoVentana - ancho - MARGEN_DE_VENTANA);
    const arriba = tip.y - alto - SEPARACION_DEL_PUNTO;
    const cabeArriba = arriba >= MARGEN_DE_VENTANA;
    setLugar({ left, top: cabeArriba ? arriba : tip.y + SEPARACION_DEL_PUNTO, flecha: tip.x - left, abajo: !cabeArriba });
  }, [tip]);
  return createPortal(
    <div
      ref={caja}
      role="tooltip"
      className={`hrl-portal hrl-tip hrl-graf__flotante${lugar?.abajo ? ' hrl-graf__flotante--abajo' : ''}`}
      style={lugar ? { left: lugar.left, top: lugar.top, '--hrl-graf-flecha': `${lugar.flecha}px` } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      <strong className="hrl-tip__title">{tip.title}</strong>
      {tip.body}
    </div>,
    document.body,
  );
}

function Dibujo({ vista, puntos, analisis, logro, unidad, escribir, leerMes, describir, alto, comparacion, nombreComparacion, ritmo, etiqueta, textoLogro, marcarLogro }) {
  const contenedor = useRef(null);
  const ancho = useAnchoDe(contenedor);
  const lienzo = useRef(null);
  const [tip, setTip] = useState(null);
  const [activo, setActivo] = useState(null);
  const refs = useRef({});
  const idDescripcion = useId();

  const conDato = puntos.map((p, i) => ({ ...p, i })).filter((p) => p.valor != null);
  const ultimoConDato = conDato.at(-1)?.i ?? -1;
  const angosto = ancho < 460;
  const conReferencias = analisis.centro != null || (logro && logro.tipo !== 'texto');
  const L = 50;
  /* El margen derecho es para los rótulos de las referencias: sin ellas, sobra. */
  const R = angosto || !conReferencias ? 12 : 96;
  const T = 18;
  const B = 28;
  const anchoPlot = Math.max(120, ancho - L - R);
  const altoPlot = alto - T - B;
  const st = anchoPlot / Math.max(1, puntos.length);
  const x = (i) => L + st * i + st / 2;

  const valores = conDato.map((p) => p.valor);
  const conComparacion = (comparacion ?? []).filter((c) => c.valor != null).map((c) => c.valor);
  /* El rango de la meta entra solo por su inicio: con 3.8 egresos, un tope de 30 aplastaría la
     serie. Su extremo lejano se dice en la tarjeta. */
  const referencias = [logro?.tipo === 'rango' ? logro.desde : logro?.valor, logro?.umbral, analisis.centro].filter((v) => v != null);
  const todos = [...valores, ...conComparacion, ...referencias];
  const maximo = Math.max(...todos, 0);
  const minimo = Math.min(...todos);
  const techoNatural = unidad === '%' && maximo <= 100 ? 100 : Infinity;
  const tope = Math.min(maximo * 1.08 || 1, techoNatural);
  /* Solo la línea acerca el eje, y solo si la serie queda en la parte alta de la escala. */
  const piso = vista === 'lineas' && minimo > 0 && minimo > tope * 0.45 ? minimo - (tope - minimo) * 0.18 : 0;
  const marcas = marcasDeEscala(piso, tope);
  const desde = marcas[0];
  const hasta = marcas.at(-1);
  const y = (v) => T + (1 - (v - desde) / (hasta - desde || 1)) * altoPlot;
  const base = y(desde);
  const solo = (n) => escribir(n, { soloNumero: true });

  const rotulos = separarRotulos(
    [
      analisis.centro != null && analisis.meses > 1 && { clave: 'mediana', y: y(analisis.centro), texto: `Mediana ${solo(analisis.centro)}` },
      logro?.tipo === 'minimo' && { clave: 'logro', y: y(logro.valor), texto: `Meta ${solo(logro.valor)}`, fuerte: true },
      logro?.tipo === 'maximo' && { clave: 'logro', y: y(logro.valor), texto: `Máximo ${solo(logro.valor)}`, fuerte: true },
      logro?.tipo === 'rango' && { clave: 'logro', y: y(logro.desde), texto: `Meta desde ${solo(logro.desde)}`, fuerte: true },
      logro?.umbral != null && { clave: 'umbral', y: y(logro.umbral), texto: `Umbral ${solo(logro.umbral)}` },
    ].filter(Boolean),
    base,
  );

  const mover = (i, paso) => {
    let k = i + paso;
    while (k >= 0 && k < puntos.length && puntos[k].valor == null) k += paso;
    if (k < 0 || k >= puntos.length) return;
    setActivo(k);
    refs.current[k]?.focus();
  };

  const contexto = { puntos, analisis, escribir, leerMes, describir, logro, marcarLogro, ritmo, comparacion, nombreComparacion, textoLogro };
  const contenidoDe = (p, i) => {
    if (p.valor == null) {
      const aviso = p.pendiente ? 'Trayendo la cifra de este mes…' : 'Sin datos este mes: no significa cero.';
      return { title: etiquetaPeriodo(p.periodo), body: aviso, texto: aviso };
    }
    const lineas = explicarMes(p, i, contexto);
    return {
      title: `${etiquetaPeriodo(p.periodo)}: ${escribir(p.valor)}`,
      body: (
        <span className="hrl-graf__tip">
          {lineas.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      ),
      texto: lineas.join(' '),
    };
  };

  const mostrar = (i, t) => {
    const r = lienzo.current.getBoundingClientRect();
    const v = puntos[i].valor;
    setActivo(i);
    setTip({ x: r.left + x(i), y: r.top + (v == null ? T + altoPlot / 2 : y(v)), title: t.title, body: t.body });
  };
  const ocultar = () => {
    setActivo(null);
    setTip(null);
  };

  /* Anclado al punto, no sigue al cursor: al desplazar la página quedaría flotando en otro lado.
     Esc lo cierra también con el mouse (§ 4.1). */
  useEffect(() => {
    if (!tip) return undefined;
    const alTeclear = (e) => {
      if (e.key === 'Escape') ocultar();
    };
    window.addEventListener('scroll', ocultar, true);
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('scroll', ocultar, true);
      window.removeEventListener('keydown', alTeclear);
    };
  }, [tip]);

  const parada = activo ?? ultimoConDato;
  const hueco = ultimoConDato >= 0 && ultimoConDato < puntos.length - 1 ? { desde: x(ultimoConDato) + st / 2 } : null;
  const anchoBarra = Math.min(26, st * 0.6);
  const claseDe = (i) => `hrl-graf__marca${activo === i ? ' hrl-graf__marca--activa' : ''}`;
  const puntoActivo = activo != null && puntos[activo]?.valor != null ? puntos[activo] : null;
  const noAlcanza = (p) => marcarLogro && cumpleElLogro(p.valor, logro) === false;
  const delRotulo = conDato.at(-1);

  return (
    <div ref={contenedor} className="hrl-graf__dibujo">
      <p id={idDescripcion} className="hrl-graf__oculto">
        {conDato.map((p) => `${etiquetaPeriodo(p.periodo)}: ${escribir(p.valor)}.`).join(' ')}
      </p>
      <svg ref={lienzo} width={ancho} height={alto} role="group" aria-label={`${etiqueta}, mes a mes. Use las flechas para recorrer los meses.`} aria-describedby={idDescripcion} className={`hrl-graf__svg${puntoActivo ? ' hrl-graf__svg--con-activo' : ''}`}>
        {/* La cuadrícula: horizontal por valor y vertical por mes. */}
        {marcas.map((v) => (
          <g key={v}>
            <line x1={L} x2={L + anchoPlot} y1={y(v)} y2={y(v)} className="hrl-graf__rejilla" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" style={texto()}>
              {escribir(v, { soloNumero: true, compacto: true })}
            </text>
          </g>
        ))}
        {puntos.map((p, i) => (
          <line key={p.periodo} x1={x(i)} x2={x(i)} y1={T} y2={base} className="hrl-graf__rejilla" />
        ))}

        {hueco && (
          <g>
            <rect x={hueco.desde} y={T} width={L + anchoPlot - hueco.desde} height={altoPlot} className="hrl-graf__vacio" />
            {L + anchoPlot - hueco.desde >= 44 && (
              <text x={(hueco.desde + L + anchoPlot) / 2} y={T + 14} textAnchor="middle" style={texto()}>
                Sin datos
              </text>
            )}
          </g>
        )}

        {analisis.centro != null && analisis.meses > 1 && <line x1={L} x2={L + anchoPlot} y1={y(analisis.centro)} y2={y(analisis.centro)} className="hrl-graf__mediana" />}
        {logro?.umbral != null && <line x1={L} x2={L + anchoPlot} y1={y(logro.umbral)} y2={y(logro.umbral)} className="hrl-graf__umbral" />}
        {logro && logro.tipo !== 'texto' && <line x1={L} x2={L + anchoPlot} y1={y(logro.tipo === 'rango' ? logro.desde : logro.valor)} y2={y(logro.tipo === 'rango' ? logro.desde : logro.valor)} className="hrl-graf__logro" />}
        {ritmo && (
          <path
            d={`M${x(0).toFixed(1)} ${y(ritmoEsperado(logro, Number(puntos[0].periodo.slice(5)))).toFixed(1)} L${x(puntos.length - 1).toFixed(1)} ${y(Math.min(ritmoEsperado(logro, Number(puntos.at(-1).periodo.slice(5))), hasta)).toFixed(1)}`}
            className="hrl-graf__ritmo"
          />
        )}

        {puntoActivo && (
          <>
            <line x1={x(activo)} x2={x(activo)} y1={T} y2={base} className="hrl-graf__guia" />
            <line x1={L} x2={x(activo)} y1={y(puntoActivo.valor)} y2={y(puntoActivo.valor)} className="hrl-graf__guia" />
          </>
        )}

        {vista === 'barras' &&
          conDato.map((p) => {
            const arriba = y(p.valor);
            /* Un cero medido se ve: un trazo bajo, no un vacío. */
            const altoBarra = Math.max(2, base - arriba);
            const r = Math.min(4, altoBarra);
            const x0 = x(p.i) - anchoBarra / 2;
            const clase = noAlcanza(p) ? 'hrl-graf__barra hrl-graf__barra--no-alcanza' : 'hrl-graf__barra';
            return <path key={p.periodo} d={`M${x0} ${base} V${base - altoBarra + r} Q${x0} ${base - altoBarra} ${x0 + r} ${base - altoBarra} H${x0 + anchoBarra - r} Q${x0 + anchoBarra} ${base - altoBarra} ${x0 + anchoBarra} ${base - altoBarra + r} V${base}Z`} className={`${clase} ${claseDe(p.i)}`} />;
          })}

        {vista === 'lineas' && (
          <>
            {tramosDeLinea(comparacion ?? [], x, y).map((d) => (
              <path key={d} d={d} className="hrl-graf__comparacion" />
            ))}
            {tramosDeLinea(puntos, x, y).map((d) => (
              <path key={d} d={d} className="hrl-graf__linea" />
            ))}
            {conDato.map((p) => {
              const esActual = p.i === ultimoConDato;
              const esActivo = p.i === activo;
              return (
                <g key={p.periodo} className={claseDe(p.i)}>
                  {(esActivo || esActual) && <circle cx={x(p.i)} cy={y(p.valor)} r={esActivo ? 13 : 9} className="hrl-graf__halo" />}
                  <circle cx={x(p.i)} cy={y(p.valor)} r={esActivo ? 7 : esActual ? 5.5 : 4} className={noAlcanza(p) ? 'hrl-graf__punto hrl-graf__punto--no-alcanza' : 'hrl-graf__punto'} />
                </g>
              );
            })}
          </>
        )}
        {vista === 'barras' && (comparacion ?? []).map((c, i) => (c.valor == null ? null : <circle key={c.periodo} cx={x(i)} cy={y(c.valor)} r={3.5} className="hrl-graf__comparacion-punto" />))}

        {/* Solo el mes actual lleva su número: el del mes que se mira ya lo dice el tooltip. */}
        {delRotulo && (
          <text x={x(ultimoConDato)} y={Math.max(T - 4, y(delRotulo.valor) - 13)} textAnchor="middle" style={conHalo(texto('var(--foreground)', 'var(--weight-bold)'))}>
            {solo(delRotulo.valor)}
          </text>
        )}

        {!angosto &&
          rotulos.map((r) => (
            <text key={r.clave} x={L + anchoPlot + 6} y={r.y + 4} style={texto(r.fuerte ? 'var(--foreground)' : 'var(--muted-foreground)', r.fuerte ? 'var(--weight-bold)' : undefined)}>
              {r.texto}
            </text>
          ))}

        <line x1={L} x2={L + anchoPlot} y1={base} y2={base} className="hrl-graf__eje" />
        {puntos.map((p, i) => (
          <text key={p.periodo} x={x(i)} y={base + 18} textAnchor="middle" style={texto(i === activo ? 'var(--foreground)' : 'var(--muted-foreground)', i === activo ? 'var(--weight-bold)' : undefined)}>
            {etiquetaPeriodo(p.periodo).slice(0, st < 26 ? 1 : 3)}
          </text>
        ))}

        {puntos.map((p, i) => {
          const t = contenidoDe(p, i);
          return (
            <rect
              key={p.periodo}
              ref={(el) => {
                refs.current[i] = el;
              }}
              x={x(i) - st / 2}
              y={0}
              width={st}
              height={base}
              className="hrl-graf__columna"
              role="img"
              tabIndex={i === parada ? 0 : -1}
              aria-label={`${t.title}. ${t.texto}`}
              onMouseEnter={() => mostrar(i, t)}
              onMouseLeave={ocultar}
              onFocus={() => mostrar(i, t)}
              onBlur={ocultar}
              /* En un teléfono no hay cursor: tocar el mes hace lo mismo. */
              onClick={() => mostrar(i, t)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  mover(i, e.key === 'ArrowRight' ? 1 : -1);
                }
              }}
            />
          );
        })}
      </svg>
      {tip && <TipDelMes tip={tip} />}
      {vista === 'lineas' && piso > 0 && <span className="hrl-graf__aviso">El eje empieza en {solo(desde)} para que se vea la variación. Las barras sí parten de cero.</span>}
    </div>
  );
}

/* Las cifras que ordenan la lectura, a la vista antes del gráfico. Sin tooltip, a pedido de
   Estadística (03/11/2026): dicen lo que son, y la mediana se explica en la leyenda. */
function Dato({ etiqueta, valor, nota }) {
  return (
    <div className="hrl-graf__dato">
      <span className="hrl-graf__dato-etiqueta">{etiqueta}</span>
      <strong className="hrl-graf__dato-valor">{valor}</strong>
      {nota && <span className="hrl-graf__dato-nota">{nota}</span>}
    </div>
  );
}

function Clave({ clase, titulo, cuerpo, children }) {
  return (
    <Tooltip title={titulo} body={cuerpo} focusable={false}>
      <span className="hrl-graf__clave">
        <span aria-hidden="true" className={`hrl-graf__muestra hrl-graf__muestra--${clase}`} />
        {children}
      </span>
    </Tooltip>
  );
}

function Leyenda({ vista, analisis, logro, ritmo, nombreComparacion, marcarLogro }) {
  return (
    <div className="hrl-graf__leyenda">
      <Clave clase={vista === 'lineas' ? 'linea' : 'barra'} titulo="Resultado del mes" cuerpo="Cada uno es la cifra de un mes. Pase el cursor o use las flechas para leer qué significa.">
        {vista === 'lineas' ? 'Cada punto' : 'Cada barra'}: un mes
      </Clave>
      {marcarLogro && (
        <Clave clase={vista === 'lineas' ? 'hueco' : 'contorno'} titulo="Mes que no alcanza la meta" cuerpo="Ese mes, por sí solo, queda fuera de lo que pide el Anexo I.">
          {vista === 'lineas' ? 'Punto hueco' : 'Barra con contorno'}: no alcanza
        </Clave>
      )}
      {nombreComparacion && (
        <Clave clase="comparacion" titulo={nombreComparacion} cuerpo="Otra lectura del mismo indicador, en los mismos meses. No se mezcla con la cifra oficial.">
          {nombreComparacion}
        </Clave>
      )}
      {analisis.centro != null && analisis.meses > 1 && (
        <Clave clase="mediana" titulo="Mediana" cuerpo="La mitad de los meses queda por encima y la otra mitad por debajo. A diferencia del promedio, un mes raro no la mueve.">
          Mediana
        </Clave>
      )}
      {logro && logro.tipo !== 'texto' && (
        <Clave clase="logro" titulo="Meta del Anexo I" cuerpo="Lo que el Anexo I espera del hospital. Se evalúa al cierre del año.">
          Meta
        </Clave>
      )}
      {logro?.umbral != null && (
        <Clave clase="umbral" titulo="Umbral" cuerpo="El mínimo aceptable del Anexo I, por debajo de la meta.">
          Umbral
        </Clave>
      )}
      {ritmo && (
        <Clave clase="ritmo" titulo="Ritmo necesario" cuerpo="La línea recta de cero a la meta de diciembre: dónde tendría que ir la cifra en cada mes para llegar.">
          Ritmo para llegar a la meta
        </Clave>
      )}
    </div>
  );
}

/* El gráfico completo: el botón de vista arriba y dentro de la tarjeta, las cifras clave, el
   dibujo y lo que dice la serie hoy.
     puntos             un lugar por mes: { periodo, valor, num, den }
     escribir           (n, { soloNumero, compacto }) => texto
     leerMes            (punto) => esa cifra, en palabras, para el tooltip
     describir          (punto) => de qué está hecha, si no hay `leerMes`
     cumpleElAcumulado  si el resultado del año alcanza la meta
     maxFrases          cuántas frases del análisis caben
     compacto           en una tarjeta: solo el dibujo y su leyenda. Las cifras clave y el
                        análisis van en el detalle del indicador (07/11/2026: la tarjeta
                        estaba saturada) */
export default function GraficoIndicador({ etiqueta, puntos, logro = null, unidad = '', decimales = 1, escribir, leerMes, describir, textoLogro, acumulada = false, mejor = null, comparacion = null, nombreComparacion = null, ritmo = false, alto = 260, cumpleElAcumulado = null, maxFrases = null, compacto = false }) {
  const [vista, setVista] = useState('lineas');
  const analisis = useMemo(() => analizarSerie(puntos, { logro, acumulada }), [puntos, logro, acumulada]);
  const lectura = useMemo(() => lecturaDeLaSerie(analisis, { mejor, logro, decimales, unidad, cumpleElAcumulado, proyectable: ritmo }), [analisis, mejor, logro, decimales, unidad, cumpleElAcumulado, ritmo]);
  if (!analisis.meses) return null;

  const solo = (n) => escribir(n, { soloNumero: true });
  const { ultimo, previo } = analisis;
  const cumple = cumpleElLogro(ultimo.valor, logro);
  const marcarLogro = !acumulada && cumple != null;
  const frases = maxFrases ? lectura.frases.slice(0, maxFrases) : lectura.frases;
  const primero = puntos.find((p) => p.valor != null);
  /* En el recuadro va solo la cifra: la unidad ya está junto al número grande de la tarjeta. */
  const conLogro = logro && logro.tipo !== 'texto';
  const logroCorto = conLogro ? textoDeLogro({ ...logro, umbral: null }, unidad === '%' ? '%' : '', (n) => numero(n, Number.isInteger(n) ? 0 : decimales)) : null;

  return (
    <div className="hrl-graf">
      <div className="hrl-graf__cabecera">
        <span className="hrl-graf__titulo">Mes a mes</span>
        <SegmentedControl label={`Cómo ver el mes a mes de ${etiqueta}`} options={VISTAS} value={vista} onChange={setVista} />
      </div>

      {!compacto && (
      <div className="hrl-graf__datos">
        <Dato etiqueta={`Actual: ${nombreDelMes(ultimo.periodo)}`} valor={solo(ultimo.valor)} nota={marcarLogro ? (cumple ? 'Alcanza la meta' : 'No alcanza la meta') : undefined} />
        {previo && <Dato etiqueta={`Anterior: ${nombreDelMes(previo.periodo)}`} valor={solo(previo.valor)} />}
        {analisis.centro != null && analisis.meses > 1 && <Dato etiqueta="Mediana" valor={solo(analisis.centro)} nota={`De ${analisis.meses} meses`} />}
        {analisis.acumulada && analisis.avanceTipico != null && <Dato etiqueta="Cambio típico" valor={solo(analisis.avanceTipico)} nota="Mediana por mes" />}
        {conLogro && <Dato etiqueta="Meta" valor={logroCorto} nota={logro.umbral != null ? `Umbral: ${numero(logro.umbral, Number.isInteger(logro.umbral) ? 0 : decimales)}${unidad === '%' ? ' %' : ''}` : undefined} />}
      </div>
      )}

      <Dibujo vista={vista} puntos={puntos} analisis={analisis} logro={logro} unidad={unidad} escribir={escribir} leerMes={leerMes} describir={describir} alto={alto} comparacion={comparacion} nombreComparacion={nombreComparacion} ritmo={ritmo} etiqueta={etiqueta} textoLogro={textoLogro} marcarLogro={marcarLogro} />
      <Leyenda vista={vista} analisis={analisis} logro={logro} ritmo={ritmo} nombreComparacion={nombreComparacion} marcarLogro={marcarLogro} />

      {!compacto && (
      <div className={`hrl-graf__lectura hrl-graf__lectura--${lectura.tono}`}>
        <strong>{lectura.titulo}</strong>
        <ul>
          {frases.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <span className="hrl-graf__sello">
          Calculado con {analisis.meses} {analisis.meses === 1 ? 'mes' : 'meses'} con dato{analisis.meses > 1 ? `, de ${nombreDelMes(primero.periodo)} a ${nombreDelMes(ultimo.periodo)}` : `: ${nombreDelMes(ultimo.periodo)}`}.{maxFrases && lectura.frases.length > maxFrases ? ' El análisis completo está en el detalle.' : ''}
        </span>
      </div>
      )}
    </div>
  );
}
