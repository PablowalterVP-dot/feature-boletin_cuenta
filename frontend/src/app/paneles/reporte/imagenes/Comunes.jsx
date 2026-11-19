/* Piezas compartidas por los cuatro formatos de Diagnóstico por Imágenes.

   El oficio repite tres formas de cuadro, y aquí hay una pieza por forma:
   · la matriz financiamiento × servicio (tomografía y mamografía),
   · la tabla por profesional con esa misma matriz en columnas (ecografía),
   · la lista de personas con una cantidad (tecnólogos y lecturas).

   Los totales nunca son casillas: se pintan con la marca «Automático». */

import { Alert, Button, DataTable, Icon, IconButton, Input, NumberCell, Tooltip } from '@hrl/core-ui';
import { SERVICIOS, FINANCIADORES, filaProfesional, filaPersona } from '@/app/datos/formatos/imagenes.js';
import {
  celda,
  totalFinanciador,
  totalServicio,
  totalMatriz,
  examenesDeFila,
  totalesCuadro,
  totalPersonas,
  validar,
  hallazgosDe,
} from '@/app/datos/formatos/imagenes-calculos.js';
import { numero } from '@/app/dominio/formato.js';
import { Origen, Cifra } from '../Comunes.jsx';

const PIE = { display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 20px' };

export function conCelda(matriz, financiador, servicio, valor) {
  return { ...matriz, [financiador]: { ...matriz?.[financiador], [servicio]: valor } };
}

/* Errores y avisos de un formato, arriba de sus cuadros. Se muestran también en
   solo lectura: a Estadística le sirven igual que al área. */
export function HallazgosFormato({ datos, idFormato }) {
  const hallazgos = hallazgosDe(validar(datos), idFormato).filter((h) => !h.id.endsWith('-vacio'));
  if (!hallazgos.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hallazgos.map((h) => (
        <Alert key={h.id} tone={h.nivel === 'error' ? 'error' : 'warning'} title={h.titulo}>
          {h.detalle}
        </Alert>
      ))}
    </div>
  );
}

/* ------------------------------------------ matriz financiamiento × servicio */

export function CuadroFinanciamiento({ matriz, editable, onCambiar, nombre }) {
  const filas = [...FINANCIADORES.map((f) => ({ ...f, esTotal: false })), { clave: 'total', label: 'Total', esTotal: true }];

  const columnas = [
    {
      key: 'label',
      label: 'Financiamiento',
      tooltip: 'Quién cubre el examen. Es la agrupación del oficio.',
      render: (f) =>
        f.esTotal ? (
          <strong>Total</strong>
        ) : (
          <Tooltip title={f.nombre} body={f.ayuda} focusable={false}>
            <span style={{ cursor: 'help' }}>{f.label}</span>
          </Tooltip>
        ),
    },
    ...SERVICIOS.map((s) => ({
      key: s.clave,
      label: s.label,
      width: 140,
      align: 'right',
      tooltip: `Exámenes de pacientes de ${s.label.toLowerCase()}.`,
      render: (f) =>
        f.esTotal ? (
          <Cifra valor={totalServicio(matriz, s.clave)} fuerte />
        ) : (
          <NumberCell
            value={celda(matriz, f.clave, s.clave)}
            width={84}
            disabled={!editable}
            aria-label={`${nombre}: ${f.label}, ${s.label.toLowerCase()}`}
            onChange={(v) => onCambiar(conCelda(matriz, f.clave, s.clave, v))}
          />
        ),
    })),
    {
      key: 'total',
      label: 'Total',
      width: 120,
      align: 'right',
      tooltip: 'Suma automática de la fila. No se digita.',
      render: (f) => <Cifra valor={f.esTotal ? totalMatriz(matriz) : totalFinanciador(matriz, f.clave)} fuerte />,
    },
  ];

  return (
    <DataTable
      columns={columnas}
      rows={filas}
      rowKey={(f) => f.clave}
      empty="Sin filas."
      legend={
        <>
          <span>
            Exámenes del cuadro: <Cifra valor={totalMatriz(matriz)} fuerte />
          </span>
          <Origen tipo="suma" />
        </>
      }
    />
  );
}

/* --------------------------------------------- tabla por profesional */

export function TablaProfesionales({ filas, editable, onCambiar, nombreCuadro }) {
  const totales = totalesCuadro(filas);
  const cambiarFila = (id, parcial) => onCambiar(filas.map((f) => (f.id === id ? { ...f, ...parcial } : f)));
  const quien = (f) => f.nombre?.trim() || 'la fila sin nombre';

  const filasTabla = [...filas, { id: '__total', esTotal: true }];

  const columnas = [
    {
      key: 'nombre',
      label: 'Profesional',
      tooltip: 'Médico que realizó los exámenes. Se precarga con el personal del último oficio.',
      render: (f) =>
        f.esTotal ? (
          <strong>Total</strong>
        ) : (
          <span style={{ display: 'block', minWidth: 210 }}>
            <Input
              label={`Profesional de ${nombreCuadro}`}
              labelHidden
              value={f.nombre}
              disabled={!editable}
              placeholder="Nombre del profesional"
              onChange={(e) => cambiarFila(f.id, { nombre: e.target.value })}
            />
          </span>
        ),
    },
    {
      key: 'pacientes',
      label: 'Pacientes',
      width: 96,
      align: 'right',
      tooltip: 'Columna «TOTAL PCTS» del oficio: personas atendidas. No puede superar a los exámenes.',
      render: (f) => {
        if (f.esTotal) return <Cifra valor={totales.pacientes} fuerte />;
        const e = examenesDeFila(f);
        return (
          <NumberCell
            value={f.pacientes}
            width={64}
            disabled={!editable}
            error={editable && e != null && (f.pacientes == null || f.pacientes > e)}
            aria-label={`Pacientes de ${quien(f)} en ${nombreCuadro}`}
            onChange={(v) => cambiarFila(f.id, { pacientes: v })}
          />
        );
      },
    },
    ...FINANCIADORES.flatMap((fin) =>
      SERVICIOS.map((s) => ({
        key: `${fin.clave}-${s.clave}`,
        label: s.corto,
        group: fin.label,
        groupTooltip: fin.ayuda,
        width: 76,
        align: 'right',
        tooltip: `${fin.nombre} · ${s.label}.`,
        render: (f) =>
          f.esTotal ? (
            <Cifra valor={celda(totales.matriz, fin.clave, s.clave)} fuerte />
          ) : (
            <NumberCell
              value={celda(f.examenes, fin.clave, s.clave)}
              width={56}
              disabled={!editable}
              aria-label={`${quien(f)}: ${fin.label}, ${s.label.toLowerCase()}`}
              onChange={(v) => cambiarFila(f.id, { examenes: conCelda(f.examenes, fin.clave, s.clave, v) })}
            />
          ),
      })),
    ),
    {
      key: 'examenes',
      label: 'Exámenes',
      width: 100,
      align: 'right',
      tooltip: 'Columna «EXAM» del oficio: la suma de las nueve casillas. Se calcula, no se digita.',
      render: (f) => <Cifra valor={f.esTotal ? totales.examenes : examenesDeFila(f)} fuerte />,
    },
    {
      key: 'monto',
      label: 'Monto (S/)',
      width: 120,
      align: 'right',
      tooltip: 'Monto total en soles que reporta el área. Se digita: el oficio no dice qué tarifa aplica a cada examen.',
      render: (f) =>
        f.esTotal ? (
          <Cifra valor={totales.monto} decimales={2} fuerte />
        ) : (
          <NumberCell
            value={f.monto}
            width={88}
            disabled={!editable}
            aria-label={`Monto en soles de ${quien(f)} en ${nombreCuadro}`}
            onChange={(v) => cambiarFila(f.id, { monto: v })}
          />
        ),
    },
    {
      key: 'acciones',
      label: '',
      width: 56,
      align: 'right',
      render: (f) =>
        f.esTotal ? null : (
          <div className="hrl-acciones-icono">
            <Tooltip title="Quitar la fila" body="Quita a este profesional del cuadro de este mes. No afecta a los demás cuadros." focusable={false}>
              <IconButton
                icon="sh-trash"
                tone="action"
                disabled={!editable}
                aria-label={`Quitar a ${quien(f)} de ${nombreCuadro}`}
                onClick={() => onCambiar(filas.filter((x) => x.id !== f.id))}
              />
            </Tooltip>
          </div>
        ),
    },
  ];

  return (
    <>
      <DataTable columns={columnas} rows={filasTabla} rowKey={(f) => f.id} empty="Sin profesionales en este cuadro." />
      <div style={PIE}>
        {editable ? (
          <Button tone="ghost" icon="sh-people" onClick={() => onCambiar([...filas, filaProfesional()])}>
            Añadir profesional
          </Button>
        ) : (
          <span />
        )}
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          Exámenes: <Cifra valor={totales.examenes} fuerte />
          <Origen tipo="suma" />
        </span>
      </div>
    </>
  );
}

/* ----------------------------------------------- lista de personas */

/* `esperado` compara el total con otra cifra: igual (tecnólogos contra
   exámenes atendidos) o como tope (lecturas contra exámenes). */
export function TablaPersonas({ personas, editable, onCambiar, rotulo, rotuloCantidad, unidad, esperado, modo = 'igual', ayudaCantidad }) {
  const lista = personas ?? [];
  const total = totalPersonas(lista);
  const cambiar = (id, parcial) => onCambiar(lista.map((p) => (p.id === id ? { ...p, ...parcial } : p)));
  const quien = (p) => p.nombre?.trim() || 'la fila sin nombre';

  let comparacion = null;
  if (esperado != null && total != null) {
    const bien = modo === 'igual' ? total === esperado : total <= esperado;
    comparacion = {
      bien,
      texto: modo === 'igual' ? (bien ? `Cuadra con los ${numero(esperado)} ${unidad}` : `No cuadra: deben sumar ${numero(esperado)}`) : bien ? `De ${numero(esperado)} ${unidad}` : `Supera los ${numero(esperado)} ${unidad}`,
    };
  }

  const columnas = [
    {
      key: 'nombre',
      label: rotulo,
      tooltip: 'Se precarga con el personal del último oficio; se puede cambiar, quitar o añadir.',
      render: (p) => (
        <Input label={`${rotulo}`} labelHidden value={p.nombre} disabled={!editable} placeholder="Nombres y apellidos" onChange={(e) => cambiar(p.id, { nombre: e.target.value })} />
      ),
    },
    {
      key: 'cantidad',
      label: rotuloCantidad,
      width: 150,
      align: 'right',
      tooltip: ayudaCantidad,
      render: (p) => (
        <NumberCell value={p.cantidad} width={96} disabled={!editable} aria-label={`${rotuloCantidad} de ${quien(p)}`} onChange={(v) => cambiar(p.id, { cantidad: v })} />
      ),
    },
    {
      key: 'acciones',
      label: '',
      width: 56,
      align: 'right',
      render: (p) => (
        <div className="hrl-acciones-icono">
          <Tooltip title="Quitar la fila" body="Quita a esta persona del cuadro de este mes." focusable={false}>
            <IconButton icon="sh-trash" tone="action" disabled={!editable} aria-label={`Quitar a ${quien(p)}`} onClick={() => onCambiar(lista.filter((x) => x.id !== p.id))} />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable columns={columnas} rows={lista} rowKey={(p) => p.id} empty="Nadie registrado en este cuadro." />
      <div style={PIE}>
        {editable ? (
          <Button tone="ghost" icon="sh-people" onClick={() => onCambiar([...lista, filaPersona()])}>
            Añadir persona
          </Button>
        ) : (
          <span />
        )}
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          Total: <Cifra valor={total} unidad={unidad} fuerte />
          <Origen tipo="suma" />
          {comparacion && (
            <span
              className="hrl-chip"
              style={{
                background: comparacion.bien ? 'var(--success-soft)' : 'var(--destructive-soft)',
                color: comparacion.bien ? 'var(--success-text)' : 'var(--destructive-text)',
              }}
            >
              <Icon name={comparacion.bien ? 'sh-ok' : 'sh-crit'} size={13} />
              {comparacion.texto}
            </span>
          )}
        </span>
      </div>
    </>
  );
}

/* --------------------------------------------------- cifras sueltas */

/* Cada campo: { clave, label, ayuda, valor, onCambiar?, unidad?, decimales?,
   calculado?, error? }. Un campo calculado se pinta como cifra con su marca. */
export function CamposNumericos({ campos, editable }) {
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
            <span style={{ fontSize: 'var(--text-base)', cursor: 'help', fontWeight: c.calculado ? 'var(--weight-bold)' : undefined }}>{c.label}</span>
          </Tooltip>
          {c.calculado ? (
            <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <Cifra valor={c.valor} unidad={c.unidad} decimales={c.decimales} fuerte />
              <Origen tipo="suma" />
            </span>
          ) : (
            <NumberCell
              value={c.valor}
              width={110}
              disabled={!editable}
              error={editable && c.error}
              suffix={c.unidad}
              aria-label={c.label}
              onChange={c.onCambiar}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
