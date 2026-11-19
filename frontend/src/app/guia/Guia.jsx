/* La capa del tutorial: atenúa la pantalla, resalta lo que toca y lo explica.

   Qué paso toca lo decide `dominio/guia.js`; esta pieza solo lo muestra y hace lo
   que piden sus botones. Se monta en un portal, como toda capa fija (el `transform`
   de los paneles convertiría a su contenedor en bloque contenedor).

   Replica lo útil de React Joyride sin su dependencia (el contrato pide no instalar
   lo que se puede resolver con lo que hay, y el kit no tiene dependencias):
     - «Anterior» y «Siguiente», y Enter o las flechas ← → del teclado;
     - la tarjeta (floater) con una flecha hacia lo señalado, colocada a un lado sin
       taparlo, y la barra de progreso (showProgress);
     - lo resaltado se puede pulsar (spotlightClicks) y lo demás no;
     - un clic en la zona oscura no cierra (overlayClickAction: false): costaría el
       recorrido a quien menos soltura tiene. Excepción a la regla 4.1, 01/11/2026;
     - el foco en la tarjeta, con Tab dando la vuelta entre ella y lo resaltado, y de
       vuelta a donde estaba al salir;
     - lo señalado se trae a la vista, y si tarda en aparecer se espera sin romper.

   Salir pide confirmación, con la X o con Esc, en la propia tarjeta: un `Dialog`
   quedaría debajo del velo.

   El orden de capas, de abajo arriba, se apoya en el del kit y no lo pelea:
     diálogo (200) · menú (210) · VELO (215) · ANILLO (216) · TARJETA (218) ·
     tooltip (220) · aviso (240)
   Así lo resaltado dentro de un diálogo queda a la vista por el hueco del velo, y
   un tooltip se lee sobre el velo. Por eso esta capa no se construyó con `Dialog`:
   no es modal, tiene que dejar usar lo que señala.

   El velo son cuatro rectángulos alrededor del hueco, no una sombra enorme: así
   también detienen los clics.

   Se mide en cada cuadro porque lo señalado se mueve sin avisar: una tabla que
   carga, un diálogo que se desplaza, el texto al 150 %. Medir un elemento es
   barato y solo se repinta si algo cambió. */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton, Tooltip, useExitAnimation } from '@hrl/core-ui';
import { destinosDe } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { FASES, pasoDeGuia } from '@/app/dominio/guia.js';
import Mascota from '@/app/paneles/Mascota.jsx';
import { marcarVisto, olvidarVisto, salirDeGuia, useGuia } from './senales.js';

const MARGEN_HUECO = 6;
const SEPARACION = 14;
const BORDE_VENTANA = 16;
const ANCHO_MOVIL = 640;
const MARGEN_FLECHA = 24;
const CONTROLES = 'a[href], button:not([disabled]), input:not([disabled]):not([hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const porMarca = (marca) => document.querySelector(`[data-guia="${marca}"]`);
const visible = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

function dialogoAbierto() {
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1) ?? null;
}

/* Lo que se resalta: las marcas del paso o, con `modal`, el diálogo entero. */
function elementosDe(paso) {
  if (paso.modal) {
    const d = dialogoAbierto();
    return d ? [d] : [];
  }
  return (paso.objetivos ?? []).map(porMarca).filter((el) => el && visible(el));
}

function marcoDe(elementos) {
  if (!elementos.length) return null;
  const rects = elementos.map((el) => el.getBoundingClientRect());
  const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - MARGEN_HUECO);
  const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - MARGEN_HUECO);
  const right = Math.min(window.innerWidth, Math.max(...rects.map((r) => r.right)) + MARGEN_HUECO);
  const bottom = Math.min(window.innerHeight, Math.max(...rects.map((r) => r.bottom)) + MARGEN_HUECO);
  return { top: Math.round(top), left: Math.round(left), width: Math.round(right - left), height: Math.round(bottom - top) };
}

const igual = (a, b) => a === b || (a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/* La tarjeta, al lado de lo señalado y sin taparlo: debajo, encima, a un lado o, si
   lo señalado ocupa casi toda la ventana, en una esquina y sin flecha. */
function colocar(marco, ancho, alto, centrado) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= ANCHO_MOVIL) return null; // En un celular va abajo, a lo ancho (estilos.css).
  const limitarX = (x) => Math.min(Math.max(BORDE_VENTANA, x), vw - ancho - BORDE_VENTANA);
  const limitarY = (y) => Math.min(Math.max(BORDE_VENTANA, y), vh - alto - BORDE_VENTANA);
  if (!marco) return centrado ? { top: limitarY((vh - alto) / 2), left: limitarX((vw - ancho) / 2) } : { top: vh - alto - BORDE_VENTANA, left: vw - ancho - BORDE_VENTANA };

  const centroX = marco.left + marco.width / 2;
  const centroY = marco.top + marco.height / 2;
  const enVertical = (top, lado) => {
    const left = limitarX(centroX - ancho / 2);
    return { top, left, lado, flecha: Math.min(Math.max(MARGEN_FLECHA, centroX - left), ancho - MARGEN_FLECHA) };
  };
  const enHorizontal = (left, lado) => {
    const top = limitarY(centroY - alto / 2);
    return { top, left, lado, flecha: Math.min(Math.max(MARGEN_FLECHA, centroY - top), alto - MARGEN_FLECHA) };
  };

  const abajo = marco.top + marco.height + SEPARACION;
  if (abajo + alto <= vh - BORDE_VENTANA) return enVertical(abajo, 'abajo');
  const arriba = marco.top - alto - SEPARACION;
  if (arriba >= BORDE_VENTANA) return enVertical(arriba, 'arriba');
  const derecha = marco.left + marco.width + SEPARACION;
  if (derecha + ancho <= vw - BORDE_VENTANA) return enHorizontal(derecha, 'derecha');
  const izquierda = marco.left - ancho - SEPARACION;
  if (izquierda >= BORDE_VENTANA) return enHorizontal(izquierda, 'izquierda');
  return { top: vh - alto - BORDE_VENTANA, left: vw - ancho - BORDE_VENTANA };
}

/* Un diálogo que este paso no explica —«¿Reemplazar lo cargado?»— está esperando
   una respuesta: el tutorial no se le pone delante ni señala algo inalcanzable. */
function pasoConDialogoAjeno(titulo) {
  return {
    id: 'dialogo-ajeno',
    titulo: 'Hay una pregunta abierta en pantalla',
    texto: `${titulo ? `«${titulo}». ` : ''}Léala y respóndala. «Siguiente» acepta, y como es una práctica nada se reemplaza de verdad.`,
    mascota: 'reposo',
    objetivos: [],
    libre: true,
    siguiente: { pulsar: 'confirmar-reemplazo' },
  };
}

function pulsar(marca) {
  const el = porMarca(marca);
  if (!el) return;
  (el.matches(CONTROLES) ? el : el.querySelector(CONTROLES))?.click();
}

function Velo({ marco, libre }) {
  const clase = `hrl-guia__velo${libre ? ' hrl-guia__velo--libre' : ''}`;
  if (!marco) return <div className={clase} style={{ top: 0, left: 0, right: 0, bottom: 0 }} />;
  const abajo = marco.top + marco.height;
  const derecha = marco.left + marco.width;
  return (
    <>
      <div className={clase} style={{ top: 0, left: 0, right: 0, height: marco.top }} />
      <div className={clase} style={{ top: abajo, left: 0, right: 0, bottom: 0 }} />
      <div className={clase} style={{ top: marco.top, left: 0, width: marco.left, height: marco.height }} />
      <div className={clase} style={{ top: marco.top, left: derecha, right: 0, height: marco.height }} />
    </>
  );
}

export default function Guia({ usuario, panelId, irA }) {
  const guia = useGuia();
  const destinos = useMemo(() => (usuario.area ? destinosDe(usuario.area).map(nombreOficina) : []), [usuario.area]);
  const calculado = pasoDeGuia(guia.senales, { vistos: guia.vistos, destinos, enReporte: panelId === 'reporte' });

  const [marco, setMarco] = useState(null);
  const [ajeno, setAjeno] = useState(null);
  const [posicion, setPosicion] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const tarjeta = useRef(null);
  const principal = useRef(null);
  const idTitulo = useId();
  const idTexto = useId();

  const paso = ajeno != null ? pasoConDialogoAjeno(ajeno) : calculado;
  const conVelo = Boolean(marco) || Boolean(paso.centrado);
  const bloquea = conVelo && !paso.libre;
  const fase = paso.fase ? FASES[paso.fase] : null;
  const termina = Boolean(paso.siguiente?.terminar);

  const pasoActual = useRef(paso);
  pasoActual.current = paso;

  const { leaving, close } = useExitAnimation(salirDeGuia);

  useEffect(() => {
    if (paso.marca) marcarVisto(paso.marca);
  }, [paso.marca]);

  const hacer = (accion) => {
    if (!accion) return;
    if (accion.pulsar) pulsar(accion.pulsar);
    if (accion.visto) marcarVisto(accion.visto);
    if (accion.olvidar) olvidarVisto(accion.olvidar);
    if (accion.volver) irA('reporte');
    if (accion.terminar) close();
  };
  const hacerRef = useRef(hacer);
  hacerRef.current = hacer;
  const confirmandoRef = useRef(confirmando);
  confirmandoRef.current = confirmando;

  /* Medir: cada cuadro, lo señalado y el diálogo que haya abierto. */
  useLayoutEffect(() => {
    let cuadro;
    const medir = () => {
      const p = calculado;
      const d = dialogoAbierto();
      const els = elementosDe(p);
      /* Un paso centrado (la bienvenida) se lee y se pulsa encima de lo que haya:
         cederle el lugar al diálogo dejaría el tutorial sin poder empezar. */
      const dentro = d && (p.modal || els.some((el) => d.contains(el)) || p.enDialogo || p.centrado);
      setAjeno(d && !dentro ? (d.getAttribute('aria-label') ?? '') : null);
      setMarco((m) => {
        const nuevo = d && !dentro ? null : marcoDe(els);
        return igual(m, nuevo) ? m : nuevo;
      });
      cuadro = requestAnimationFrame(medir);
    };
    medir();
    return () => cancelAnimationFrame(cuadro);
  });

  /* La tarjeta se coloca cuando se sabe su tamaño, que depende del texto. */
  useLayoutEffect(() => {
    const el = tarjeta.current;
    if (!el) return;
    const nueva = colocar(marco, el.offsetWidth, el.offsetHeight, paso.centrado);
    setPosicion((p) => (p?.top === nueva?.top && p?.left === nueva?.left && p?.lado === nueva?.lado && p?.flecha === nueva?.flecha ? p : nueva));
  }, [marco, paso.id, paso.texto, paso.centrado, confirmando]);

  /* Al cambiar de paso: lo señalado a la vista y el foco en la tarjeta, en su botón
     principal, para que Enter avance y el lector de pantalla lea el paso. */
  useEffect(() => {
    setConfirmando(false);
    const t = setTimeout(() => {
      const primero = elementosDe(pasoActual.current)[0];
      if (primero) {
        const r = primero.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          primero.scrollIntoView({ block: 'center', behavior: suave ? 'smooth' : 'auto' });
        }
      }
      const boton = principal.current;
      (boton && !boton.disabled ? boton : tarjeta.current)?.focus?.({ preventScroll: true });
    }, 80);
    return () => clearTimeout(t);
  }, [paso.id]);

  /* El foco vuelve a donde estaba al salir (4.1). */
  useEffect(() => {
    const previo = document.activeElement;
    return () => {
      if (previo?.isConnected) previo.focus?.({ preventScroll: true });
    };
  }, []);

  /* Esc pide salir, o cancela esa pregunta, y nada más: se atrapa antes de llegar
     al diálogo que haya debajo, que también lo escucha y se cerraría.
     Las flechas avanzan y retroceden, salvo en un control que las usa.
     Tab no se escapa a lo que está detrás del velo: da la vuelta entre lo señalado
     y la tarjeta. Con un paso libre, todo sigue al alcance. */
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setConfirmando((c) => !c);
        return;
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !confirmandoRef.current && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) {
        e.preventDefault();
        hacerRef.current(e.key === 'ArrowRight' ? pasoActual.current.siguiente : pasoActual.current.anterior);
        return;
      }
      if (e.key !== 'Tab' || (pasoActual.current.libre && !confirmandoRef.current)) return;
      const zonas = [...(confirmandoRef.current ? [] : elementosDe(pasoActual.current)), tarjeta.current].filter(Boolean);
      const controles = zonas.flatMap((z) => (z.matches?.(CONTROLES) ? [z] : [...z.querySelectorAll(CONTROLES)])).filter(visible);
      if (!controles.length) return;
      const i = controles.indexOf(document.activeElement);
      const siguiente = i === -1 ? 0 : (i + (e.shiftKey ? -1 : 1) + controles.length) % controles.length;
      e.preventDefault();
      controles[siguiente].focus({ preventScroll: true });
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, []);

  /* Al preguntar, el foco en «Seguir»: lo que no se quiere por accidente es salir. */
  useEffect(() => {
    if (confirmando) tarjeta.current?.querySelector('[data-guia-seguir]')?.focus({ preventScroll: true });
  }, [confirmando]);

  return createPortal(
    <div className={`hrl-portal hrl-guia${leaving ? ' hrl-guia--saliendo' : ''}`}>
      {conVelo && <Velo marco={marco} libre={!bloquea} />}
      {marco && <div className="hrl-guia__anillo" style={marco} aria-hidden="true" />}
      <div
        ref={tarjeta}
        className="hrl-guia__tarjeta"
        style={posicion ? { top: posicion.top, left: posicion.left } : undefined}
        role="dialog"
        aria-labelledby={idTitulo}
        aria-describedby={idTexto}
        tabIndex={-1}
      >
        {posicion?.lado && !confirmando && <span className={`hrl-guia__flecha hrl-guia__flecha--${posicion.lado}`} style={{ '--guia-flecha': `${posicion.flecha}px` }} aria-hidden="true" />}
        <div className="hrl-guia__contenido">
          {confirmando ? (
            <>
              <div className="hrl-guia__cabeza">
                <Mascota estado="reposo" tamano="sm" />
                <strong id={idTitulo} className="hrl-guia__titulo">
                  ¿Salir del tutorial?
                </strong>
              </div>
              <p id={idTexto} className="hrl-guia__texto" role="status" aria-live="polite">
                Lo que practicó no se guarda y su reporte queda como estaba. Puede volver cuando quiera con «Iniciar tutorial».
              </p>
              <div className="hrl-guia__acciones">
                <Button tone="ghost" onClick={close}>
                  Sí, salir
                </Button>
                <Button data-guia-seguir="" onClick={() => setConfirmando(false)}>
                  Seguir en el tutorial
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="hrl-guia__cabeza">
                <Mascota estado={paso.mascota} tamano="sm" />
                <div className="hrl-guia__titulos">
                  <span className="hrl-guia__fase">{fase ? `Práctica · ${fase.texto}` : 'Práctica: nada se guarda'}</span>
                  <strong id={idTitulo} className="hrl-guia__titulo">
                    {paso.titulo}
                  </strong>
                </div>
                {!termina && (
                  <Tooltip title="Salir del tutorial" body="También con la tecla Esc. Se le pregunta antes de salir." focusable={false}>
                    <IconButton icon="sh-close" aria-label="Salir del tutorial" onClick={() => setConfirmando(true)} />
                  </Tooltip>
                )}
              </div>
              {/* Dentro de la tarjeta y no fuera: una región en vivo fuera de un diálogo
                  abierto puede no anunciarse en algunos lectores de pantalla. */}
              <p id={idTexto} className="hrl-guia__texto" role="status" aria-live="polite">
                {paso.texto}
              </p>
              {fase && (
                <div className="hrl-guia__progreso" aria-hidden="true">
                  {Object.values(FASES).map((f) => (
                    <span key={f.numero} className={`hrl-guia__tramo${f.numero <= fase.numero ? ' hrl-guia__tramo--hecho' : ''}`} />
                  ))}
                </div>
              )}
              <div className="hrl-guia__acciones">
                {paso.anterior ? (
                  <Button tone="ghost" icon="sh-chevron" className="hrl-guia__anterior" onClick={() => hacer(paso.anterior)}>
                    Anterior
                  </Button>
                ) : (
                  <span />
                )}
                <Button ref={principal} disabled={!paso.siguiente} onClick={() => hacer(paso.siguiente)} style={{ minHeight: 'var(--touch-target-lg)' }}>
                  {termina ? 'Terminar' : paso.id === 'bienvenida' ? 'Empezar' : paso.siguiente ? 'Siguiente' : 'Un momento…'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
