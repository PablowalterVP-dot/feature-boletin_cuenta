/* Piezas compartidas por los formatos de Farmacia.

   · Los hallazgos de un formato, arriba de sus cuadros.
   · Una lista de cifras sueltas donde los totales no son casillas: se pintan
     con la marca «Automático» y no se pueden escribir.
   · La comparación de un total con su cifra de referencia en otro formato
     (R5, R6, R7, R8), dicha en texto y con icono: el color nunca va solo. */

import { Alert, Icon, NumberCell, Tooltip } from '@hrl/core-ui';
import { validar, hallazgosDe } from '@/app/datos/formatos/farmacia-calculos.js';
import { numero } from '@/app/dominio/formato.js';
import { Origen, Cifra } from '../Comunes.jsx';

/* Una cifra digitada que no es un entero sin signo (R9). */
export const cifraInvalida = (v) => v != null && (!Number.isInteger(v) || v < 0);

/* Errores y avisos de un formato. Se muestran también en solo lectura: a
   Estadística le sirven igual que al área. El «formato vacío» no se repite
   aquí: ya lo dice la barra de pasos. */
export function HallazgosFormato({ datos, periodo, idFormato }) {
  const hallazgos = hallazgosDe(validar(datos, periodo), idFormato).filter((h) => !h.id.endsWith('-vacio'));
  if (!hallazgos.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hallazgos.map((h) => (
        <Alert key={h.id} tone={h.nivel === 'error' ? 'error' : h.nivel === 'aviso' ? 'warning' : 'info'} title={/^r\d+$/.test(h.regla) ? `${h.regla.toUpperCase()} · ${h.titulo}` : h.titulo}>
          {h.detalle}
        </Alert>
      ))}
    </div>
  );
}

/* Cada campo: { clave, label, ayuda, valor, onCambiar?, calculado?, unidad? }.
   Un campo calculado se pinta como cifra con su marca, nunca como casilla. */
export function CamposFarmacia({ campos, editable, unidad = 'atenciones' }) {
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
            background: c.calculado ? 'var(--muted)' : undefined,
          }}
        >
          <Tooltip title={c.label} body={c.ayuda} focusable={false}>
            <span style={{ fontSize: 'var(--text-base)', cursor: 'help', fontWeight: c.calculado ? 'var(--weight-bold)' : undefined }}>{c.label}</span>
          </Tooltip>
          {c.calculado ? (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Cifra valor={c.valor} unidad={c.unidad ?? unidad} fuerte />
              <Origen tipo="suma" />
            </span>
          ) : (
            <NumberCell
              value={c.valor}
              width={110}
              disabled={!editable}
              error={editable && cifraInvalida(c.valor)}
              aria-label={c.label}
              onChange={c.onCambiar}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/* Un total frente a la cifra con la que debe cuadrar (`igual`) o que no debe
   superar (`tope`). Sin uno de los dos lados, no se compara: una regla que no
   se puede evaluar no se da por cumplida ni por incumplida. */
export function Comparacion({ valor, referencia, modo = 'igual', nombreReferencia, regla, supuesto = false }) {
  if (valor == null || referencia == null) {
    return (
      <span className="hrl-chip" style={{ background: 'var(--neutral-soft)', color: 'var(--neutral-text)' }}>
        <Icon name="sh-info" size={13} />
        {regla} · sin evaluar: falta {valor == null ? 'este total' : nombreReferencia}
      </span>
    );
  }

  const bien = modo === 'igual' ? valor === referencia : valor <= referencia;
  /* R7 y R8 descansan en un supuesto sin confirmar: avisan, no bloquean. */
  const tono = bien ? 'success' : supuesto ? 'warning' : 'destructive';
  const texto = bien
    ? modo === 'igual'
      ? `cuadra con ${nombreReferencia} (${numero(referencia)})`
      : `no supera ${nombreReferencia} (${numero(referencia)})`
    : modo === 'igual'
      ? `no cuadra: ${nombreReferencia} dice ${numero(referencia)}`
      : `supera ${nombreReferencia} (${numero(referencia)})`;

  return (
    <span
      className="hrl-chip"
      style={{
        background: `var(--${tono}-soft)`,
        color: tono === 'warning' ? 'var(--warning-fg)' : `var(--${tono}-text)`,
      }}
    >
      <Icon name={bien ? 'sh-ok' : supuesto ? 'sh-warn' : 'sh-crit'} size={13} />
      {regla} · {texto}
    </span>
  );
}
