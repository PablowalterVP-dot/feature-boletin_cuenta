/* Lo que comparten las pestañas de Monitoreo Indicadores. */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, CompactSelect, Icon, SegmentedControl, Tooltip } from '@hrl/core-ui';
import { numero } from '@/app/dominio/formato.js';
import { ESTADOS } from '@/app/dominio/monitoreo.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { SITUACIONES } from '@/app/datos/monitoreo.js';
import * as api from '@/app/servicios/api.js';

/* Digitar lo de las oficinas y actualizar los compromisos es de Estadística. Cargar el reporte
   DL 1153 no: es del superadministrador, con el mismo permiso de las demás cargas de los
   indicadores, y Estadística solo ve lo cargado. */
export const PERMISO_REGISTRAR = 'monitoreo.registrar';
export const PERMISO_CARGAR_REPORTE = 'desempeno.cargar';

export const puedeRegistrar = (sesion) => (sesion?.usuario?.permisos ?? []).includes(PERMISO_REGISTRAR);
export const puedeCargarReporte = (sesion) => (sesion?.usuario?.permisos ?? []).includes(PERMISO_CARGAR_REPORTE);

/* Lo registrado del año. También deja en el store lo que digita Estadística. */
export function useMonitoreo(anio) {
  const [estado, setEstado] = useState({ datos: null, cargando: api.hayServidor(), error: null });
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    api.cargarPanelMonitoreo(anio).then((r) => {
      if (!vigente) return;
      setEstado(r.ok ? { datos: r.body, cargando: false, error: null } : { datos: null, cargando: false, error: r.error });
    });
    return () => {
      vigente = false;
    };
  }, [anio, vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { ...estado, recargar };
}

export const formatoDe = (decimales = 0, unidad = '') => (n) => (n == null ? 'Sin datos' : `${numero(n, decimales)}${unidad === '%' ? ' %' : ''}`);

/* El formato que pide el gráfico: con unidad en el texto corrido, sin ella donde el espacio es
   poco, y en el eje sin decimales si la escala no los necesita. */
export const formatoDeGrafico = (decimales = 0, unidad = '') => (n, { soloNumero = false, compacto = false } = {}) => {
  if (n == null) return 'Sin datos';
  const decimalesDeEje = compacto && Number.isInteger(n) ? 0 : decimales;
  const texto = numero(n, decimalesDeEje);
  if (unidad === '%') return `${texto} %`;
  return soloNumero || !unidad ? texto : `${texto} ${unidad}`;
};

export const mesCorto = (periodo) => etiquetaPeriodo(periodo).slice(0, 3);

const cifraDe = (n) => numero(n, Number.isInteger(n) ? 0 : 2);

/* De qué está hecha una cifra. «87 de 2,175» se lee bien en un porcentaje; en una razón
   (42 egresos entre 11 camas) ese «de» diría algo falso. */
export const fraccionDe = (num, den, unidad) => `${cifraDe(num)} ${unidad === '%' ? 'de' : '÷'} ${cifraDe(den)}`;

/* La frase de una cifra, en palabras (`datos/monitoreo-lecturas.js`). */
export function frasesDe(lectura, acumulado, f, extra = {}) {
  if (!acumulado || !lectura?.lee) return null;
  return lectura.lee({ v: numero(acumulado.valor, extra.decimales ?? 1), num: acumulado.num == null ? null : cifraDe(acumulado.num), den: acumulado.den == null ? null : cifraDe(acumulado.den), f, ...extra });
}

export function Estado({ estado }) {
  const e = ESTADOS[estado] ?? ESTADOS.sin_dato;
  return <Badge label={e.etiqueta} tone={e.tono} icon={e.icono} />;
}

export function Situacion({ indicador }) {
  const s = SITUACIONES[indicador.situacion];
  return <Badge label={s.etiqueta} tone={s.tono} icon={s.icono} />;
}

/* La cifra de una tarjeta, resaltada: el número y, pegado a él, lo que mide. */
export function Cifra({ valor, unidad, nota, titulo }) {
  return (
    <div className="hrl-monitoreo__cifra">
      {titulo && <span className="hrl-monitoreo__parte">{titulo}</span>}
      <strong className="hrl-monitoreo__valor">{valor}</strong>
      {unidad && <span className="hrl-monitoreo__unidad">{unidad}</span>}
      {nota && <span className="hrl-monitoreo__nota">{nota}</span>}
    </div>
  );
}

/* La cabecera de una tarjeta: la cifra a la izquierda y, a la derecha, contra qué se mide. */
export function CifraYMeta({ children, meta, umbral }) {
  return (
    <div className="hrl-monitoreo__resumen">
      {children}
      {meta && (
        <div className="hrl-monitoreo__meta">
          <span className="hrl-monitoreo__meta-rotulo">Meta</span>
          <strong className="hrl-monitoreo__meta-valor">{meta}</strong>
          {umbral && <span className="hrl-monitoreo__meta-rotulo">{umbral}</span>}
        </div>
      )}
    </div>
  );
}

/* La conclusión de hoy: cómo está y por qué. Con span: el Alert pone su contenido en un párrafo. */
export function Conclusion({ frase, conclusion, tono, titulo, children }) {
  return (
    <Alert tone={conclusion?.tono ?? tono ?? 'info'} title={conclusion?.titulo ?? titulo}>
      {frase && <span className="hrl-monitoreo__frase">{frase}</span>}
      {conclusion?.texto && <span className="hrl-monitoreo__frase">{conclusion.texto}</span>}
      {children}
    </Alert>
  );
}

/* Tarjetas o lista: toda la pantalla cambia, por eso va en la cabecera (§ 4.6c). */
export function SelectorDeVista({ valor, onChange }) {
  return (
    <SegmentedControl
      label="Cómo ver los indicadores"
      options={[
        { value: 'tarjetas', label: 'Tarjetas' },
        { value: 'lista', label: 'Lista' },
      ]}
      value={valor}
      onChange={onChange}
    />
  );
}

/* Analizar como si un mes anterior fuera el último. Sirve para comprobar que los mensajes salen
   de las cifras: al elegir otro mes, cambian todos. No guarda nada. */
export function SelectorDeCorte({ meses, valor, onChange }) {
  const opciones = [{ value: '', label: 'Último dato' }, ...[...meses].reverse().map((p) => ({ value: p, label: `Hasta ${etiquetaPeriodo(p).toLowerCase()}` }))];
  return (
    <Tooltip title="Analizar hasta" body="Recalcula cifras, gráficos y mensajes como si ese fuera el último mes. Sirve para ver cómo cambia el análisis. No guarda nada." focusable={false}>
      <CompactSelect aria-label="Analizar hasta" options={opciones} value={valor ?? ''} onChange={(e) => onChange(e.target.value || null)} width={200} />
    </Tooltip>
  );
}

export function AvisoDeCorte({ hasta }) {
  if (!hasta) return null;
  return (
    <Alert tone="info" title={`Analizando hasta ${etiquetaPeriodo(hasta).toLowerCase()}`}>
      Las cifras, los gráficos y los mensajes se recalcularon como si ese fuera el último mes. Usa la cifra de cada mes tal como está hoy: MINSA pudo corregirla después.
    </Alert>
  );
}

/* `a`: adónde vuelve. El mismo detalle se abre también desde el Inicio de un área. */
export function BotonVolver({ onClick, a = 'Monitoreo Indicadores' }) {
  return (
    <Button tone="ghost" icon="sh-table" onClick={onClick}>
      Volver a {a}
    </Button>
  );
}

/* Cada mes tiene su lugar y se ve distinto si tiene cifra, si no llegó o si aún no toca.
   No se usa `Sparkline` del kit porque dibuja un mes sin dato como una barra baja, y aquí
   se leería como una cifra pequeña. */
const TEXTO_DE_MES = Object.freeze({
  sin_dato: 'Sin datos: este mes no llegó la información.',
  pendiente: 'Trayendo la cifra de este mes…',
  futuro: 'Este mes todavía no toca.',
});

export function AvanceDelAnio({ avance, escribir }) {
  const mayor = Math.max(0, ...avance.celdas.map((c) => c.valor ?? 0));
  const leer = (c) => (c.estado === 'dato' ? escribir(c.valor) : TEXTO_DE_MES[c.estado]);
  return (
    <div className="hrl-avance" role="img" aria-label={avance.celdas.map((c) => `${etiquetaPeriodo(c.periodo)}: ${leer(c)}`).join('. ')}>
      {avance.celdas.map((c) => (
        <Tooltip key={c.periodo} title={etiquetaPeriodo(c.periodo)} body={leer(c)} focusable={false} style={{ flex: '1 1 0', minWidth: 0 }}>
          <span className={`hrl-avance__mes hrl-avance__mes--${c.estado}`}>
            <span className="hrl-avance__pista">
              {c.estado !== 'futuro' && (
                <span
                  className={`hrl-avance__barra hrl-avance__barra--${c.estado === 'dato' ? 'dato' : 'sin-dato'}`}
                  /* Un cero medido se ve, pequeño y lleno: el hueco es el que va punteado. */
                  style={c.estado === 'dato' ? { height: `${mayor > 0 ? Math.max(8, (c.valor / mayor) * 100) : 8}%` } : undefined}
                />
              )}
            </span>
            <span className="hrl-avance__inicial" aria-hidden="true">
              {etiquetaPeriodo(c.periodo).charAt(0)}
            </span>
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

export function LeyendaDeAvance() {
  return (
    <p className="hrl-avance__leyenda">
      <span className="hrl-avance__clave">
        <span className="hrl-avance__muestra hrl-avance__barra--dato" /> Con cifra
      </span>
      <span className="hrl-avance__clave">
        <span className="hrl-avance__muestra hrl-avance__barra--sin-dato" /> Mes sin dato
      </span>
      <span>Cada lugar es un mes, de enero a diciembre. La altura compara los meses de un indicador, no un indicador con otro.</span>
    </p>
  );
}

export function Rotulo({ icono = 'sh-info', children }) {
  return (
    <span className="hrl-monitoreo__rotulo">
      <Icon name={icono} size={14} /> {children}
    </span>
  );
}
