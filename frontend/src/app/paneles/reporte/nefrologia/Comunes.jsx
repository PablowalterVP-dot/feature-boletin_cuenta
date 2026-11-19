/* Piezas compartidas por el único formato de Nefrología.

   A diferencia de Farmacia, ninguna casilla de este cuadro se calcula: las
   29 son indicadores que trae el Word tal cual, uno por fila. Por eso la
   lista de campos no distingue casillas «automáticas»: todas se digitan o
   se leen igual. */

import { Alert, NumberCell, Tooltip } from '@hrl/core-ui';
import { validar, hallazgosDe } from '@/app/datos/formatos/nefrologia-calculos.js';

/* Una cifra digitada que no es un entero sin signo (regla «entero»). */
export const cifraInvalida = (v) => v != null && (!Number.isInteger(v) || v < 0);

export function HallazgosFormato({ datos, periodo, idFormato }) {
  const hallazgos = hallazgosDe(validar(datos, periodo), idFormato);
  if (!hallazgos.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hallazgos.map((h) => (
        <Alert key={h.id} tone={h.nivel === 'error' ? 'error' : h.nivel === 'aviso' ? 'warning' : 'info'} title={h.titulo}>
          {h.detalle}
        </Alert>
      ))}
    </div>
  );
}

/* Cada campo: { clave, label, ayuda, valor, onCambiar }. */
export function CamposNefrologia({ campos, editable }) {
  return (
    <ul style={{ margin: 0, padding: '4px 0 8px', listStyle: 'none' }}>
      {campos.map((c) => (
        <li
          key={c.clave}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 12,
            padding: '10px 20px',
            borderTop: '1px dashed var(--border)',
          }}
        >
          <Tooltip title={c.label} body={c.ayuda} focusable={false}>
            <span style={{ fontSize: 'var(--text-base)', cursor: 'help' }}>{c.label}</span>
          </Tooltip>
          <NumberCell
            value={c.valor}
            width={110}
            disabled={!editable}
            error={editable && cifraInvalida(c.valor)}
            aria-label={c.label}
            onChange={c.onCambiar}
          />
        </li>
      ))}
    </ul>
  );
}
