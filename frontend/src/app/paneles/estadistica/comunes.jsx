/* Piezas compartidas por los paneles de Estadística. */

import { Alert, Badge, CompactSelect, Input, Tooltip } from '@hrl/core-ui';
import { PERIODOS } from '@/app/datos/reportes.js';
import { nombreArea } from '@/app/datos/areas.js';
import { ESTADO_FUENTE } from '@/app/datos/diresa/fuentes.js';
import { useHoy } from '@/app/datos/store.js';
import { periodoVigente, etiquetaPeriodo, ultimosPeriodos } from '@/app/dominio/periodos.js';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import { areasFueraDelFlujo, usaSoloDatosReales } from '@/app/servicios/api.js';

export const LISTA = { margin: 0, padding: '6px 0 10px', listStyle: 'none' };
export const FILA = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: 12,
  padding: '10px 20px',
  borderTop: '1px dashed var(--border)',
};
export const SECUNDARIO = { display: 'block', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' };
export const NUMERO = { fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--weight-bold)', whiteSpace: 'nowrap' };

/* `compacto`: sin rótulo encima, para la cabecera de la página (PageActions),
   donde un campo con su etiqueta arriba se hacía más alto que los botones. El
   nombre lo dice su tooltip y su aria-label. */
export function SelectorPeriodo({ periodo, onCambiar, periodos: propios, label = 'Periodo', compacto = false }) {
  const vigente = periodoVigente(useHoy());
  /* Por omisión, los últimos meses hasta el vigente de hoy. Era `PERIODOS`, la
     ventana sembrada del prototipo, que termina en setiembre de 2026: con el
     servidor, octubre solo aparecía mientras estuviera elegido, y al pasar a
     otro mes ya no se podía volver a él (16/11/2026). En el prototipo las dos
     ventanas coinciden. */
  const periodos = propios ?? ultimosPeriodos(PERIODOS.length, vigente).reverse();
  /* Si el mes elegido quedó fuera de la ventana, igual debe poder elegirse: un valor
     seleccionado que no está entre sus propias opciones deja el selector
     mostrando el primero de la lista, no lo que de verdad está elegido. */
  const opciones = periodos.includes(periodo) ? periodos : [...periodos, periodo].sort();

  const lista = [...opciones].reverse().map((p) => ({ value: p, label: `${etiquetaPeriodo(p)}${p === vigente ? ' · en curso' : ''}` }));
  if (compacto) {
    return (
      <Tooltip title={label} body="Mes al que corresponden los reportes. Las áreas los entregan hasta el día 10 del mes siguiente." focusable={false}>
        <CompactSelect aria-label={label} options={lista} value={periodo} onChange={(e) => onCambiar(e.target.value)} width={230} />
      </Tooltip>
    );
  }

  return (
    <div style={{ minWidth: 220 }}>
      <Input
        label={label}
        kind="select"
        value={periodo}
        onChange={(e) => onCambiar(e.target.value)}
        options={lista}
        info="Mes al que corresponden los reportes. Las áreas los entregan hasta el día 10 del mes siguiente."
      />
    </div>
  );
}

/* Estado de la fuente de un dato DIRESA: validado por el bot o sin reporte. */
export function EstadoFuente({ area, estado }) {
  const e = ESTADO_FUENTE[estado] ?? ESTADO_FUENTE['sin-reporte'];
  return (
    <Tooltip
      title={area ? nombreArea(area) : e.label}
      body={
        estado === 'validado'
          ? 'El área entregó el reporte, validado por el bot: sus cifras entran al formato.'
          : estado === 'propio'
            ? 'Dato que Estadística obtiene de sus propios registros.'
            : 'El área no ha enviado el reporte de este periodo. Sus celdas quedan vacías, nunca en cero.'
      }
      focusable={false}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {area && <span style={{ fontSize: 'var(--text-sm)' }}>{nombreArea(area)}</span>}
        <Badge label={e.label} tone={e.tone} />
      </span>
    </Tooltip>
  );
}

export function Valor({ valor, unidad, decimales = 0, fuerte = false }) {
  const vacio = valor == null;
  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: fuerte ? 'var(--weight-bold)' : 'var(--weight-medium)',
        color: vacio ? 'var(--subtle-foreground)' : 'var(--foreground)',
        whiteSpace: 'nowrap',
      }}
    >
      {vacio ? SIN_DATOS : `${numero(valor, decimales)}${unidad ? ` ${unidad}` : ''}`}
    </span>
  );
}

/* Con el backend, las áreas que todavía no reportan por el sistema no entran
   en las cuentas (ni como entregadas ni como atrasadas). Este aviso las nombra
   para que «1 de 1» no se lea como «todas las áreas». En el prototipo, nada. */
export function AvisoAreasFuera() {
  const fuera = areasFueraDelFlujo();
  if (!fuera.length) return null;
  return (
    <Alert tone="info" title={`${fuera.length} áreas aún no reportan por el sistema`}>
      Solo se cuenta lo que de verdad llegó al servidor. {fuera.map((a) => a.nombreBreve).join(', ')} entrarán en estas cifras cuando su formato
      esté instalado; mientras tanto no figuran ni como entregadas ni como atrasadas.
    </Alert>
  );
}

/* Con el backend, lo que solo vive en el navegador (los datos propios de
   Estadística, la remisión a DIRESA) se dice: el servidor aún no tiene dónde
   guardarlo, y se perdería al recargar. */
export const sinServidor = () => usaSoloDatosReales();

export function AvisoSinServidor({ titulo, children }) {
  if (!sinServidor()) return null;
  return (
    <Alert tone="warning" title={titulo}>
      {children}
    </Alert>
  );
}
