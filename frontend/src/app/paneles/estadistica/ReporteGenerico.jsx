/* Vista de solo lectura del reporte de un área sin oficio levantado.

   Pinta la estructura propuesta de lo que el área debe enviar: cuadros por
   servicio con sus totales automáticos, y cifras sueltas. */

import { Alert, Card, DataTable } from '@hrl/core-ui';
import { ESTRUCTURAS, SERVICIOS, totalFila, totalColumna, sumar } from '@/app/datos/formatos/areas-simuladas.js';
import { LISTA, FILA, Valor } from './comunes.jsx';

function Cuadro({ bloque, datos }) {
  const filas = [
    ...bloque.filas.map((fl) => ({
      clave: fl.clave,
      label: fl.label,
      valores: Object.fromEntries(SERVICIOS.map((s) => [s.clave, datos?.[bloque.clave]?.[fl.clave]?.[s.clave] ?? null])),
      total: totalFila(datos, bloque.clave, fl.clave),
    })),
    {
      clave: '__total',
      label: 'Total',
      esTotal: true,
      valores: Object.fromEntries(SERVICIOS.map((s) => [s.clave, totalColumna(datos, bloque.clave, bloque.filas, s.clave)])),
      total: sumar(bloque.filas.map((fl) => totalFila(datos, bloque.clave, fl.clave))),
    },
  ];

  const columnas = [
    { key: 'label', label: 'Concepto', render: (f) => (f.esTotal ? <strong>{f.label}</strong> : f.label) },
    ...SERVICIOS.map((s) => ({
      key: s.clave,
      label: s.label,
      width: 150,
      align: 'right',
      tooltip: `Lo registrado en ${s.label.toLowerCase()}.`,
      render: (f) => <Valor valor={f.valores[s.clave]} fuerte={f.esTotal} />,
    })),
    {
      key: 'total',
      label: 'Total',
      width: 130,
      align: 'right',
      tooltip: 'Suma automática de los tres servicios. No se digita.',
      render: (f) => <Valor valor={f.total} fuerte />,
    },
  ];

  return (
    <Card accent="var(--primary)" icon="sh-doc" title={bloque.titulo} subtitle={`En ${bloque.unidad}`}>
      <DataTable columns={columnas} rows={filas} rowKey={(f) => f.clave} empty="Sin datos." />
    </Card>
  );
}

function Campos({ bloque, datos }) {
  return (
    <Card accent="var(--primary)" icon="sh-doc" title={bloque.titulo}>
      <ul style={LISTA}>
        {bloque.campos.map((cp) => (
          <li key={cp.clave} style={FILA}>
            <span style={{ fontSize: 'var(--text-base)' }}>{cp.label}</span>
            <Valor valor={datos?.[bloque.clave]?.[cp.clave] ?? null} unidad={cp.unidad} fuerte />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ReporteGenerico({ claveArea, datos }) {
  const estructura = ESTRUCTURAS[claveArea];
  if (!estructura) return null;

  return (
    <>
      <Alert tone="info" title="Estructura propuesta, con cifras simuladas">
        El oficio de esta área todavía no se ha levantado. Se muestra lo que tendría que enviar para alimentar los formatos
        de DIRESA y los reportes a otras oficinas.
      </Alert>
      {estructura.bloques.map((b) =>
        b.tipo === 'cuadro' ? <Cuadro key={b.clave} bloque={b} datos={datos} /> : <Campos key={b.clave} bloque={b} datos={datos} />,
      )}
    </>
  );
}
