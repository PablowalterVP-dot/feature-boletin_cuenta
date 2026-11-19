/* Formato 3 · Consultorios externos.

   Cuatro filas sin rótulo con consultas SIS y convenios. Sus dos totales
   cuentan las mismas atenciones que dos casillas del Formato 1 —la Consulta
   externa SIS y los convenios de consultorio—, así que tienen que cuadrar
   (R5 y R6). Si no cuadran, uno de los dos cuadros está mal y el reporte no
   sale del área. */

import { Alert, Card, DataTable, NumberCell, Tooltip } from '@hrl/core-ui';
import { FILAS, formato } from '@/app/datos/formatos/farmacia.js';
import { totalConsultasF3, totalConveniosF3, totalFilaF3, totalF3 } from '@/app/datos/formatos/farmacia-calculos.js';
import { Origen, Cifra } from '../Comunes.jsx';
import { HallazgosFormato, Comparacion, cifraInvalida } from './Comunes.jsx';

const META = formato('f3');

const COLUMNAS = Object.freeze([
  { clave: 'consultas', label: 'Consultas SIS', ayuda: 'Consultas de pacientes SIS en consultorios externos. El total debe ser igual a la Consulta externa SIS del Formato 1 (R5).' },
  { clave: 'convenios', label: 'Convenios', ayuda: 'Consultas cubiertas por convenio. El total debe ser igual a los convenios de consultorio del Formato 1 (R6).' },
]);

export default function FormatoConsultorios({ datos, periodo, editable, onCambiar }) {
  const f3 = datos.f3 ?? {};
  const f1 = datos.f1 ?? {};
  const cambiar = (columna, fila, v) => onCambiar({ f3: { ...f3, [columna]: { ...f3[columna], [fila]: v } } });
  const totales = { consultas: totalConsultasF3(f3), convenios: totalConveniosF3(f3) };

  const filas = [...FILAS, { clave: 'total', label: 'Total', esTotal: true }];

  const columnas = [
    {
      key: 'fila',
      label: 'Fila',
      tooltip: 'Las cuatro filas no tienen rótulo en el informe original. Se nombrarán cuando el área confirme qué representan.',
      render: (f) =>
        f.esTotal ? (
          <strong>Total</strong>
        ) : (
          <Tooltip title={`${f.label} (por confirmar)`} body={f.aclaracion} focusable={false}>
            <span style={{ cursor: 'help', whiteSpace: 'nowrap' }}>{f.label}</span>
          </Tooltip>
        ),
    },
    ...COLUMNAS.map((c) => ({
      key: c.clave,
      label: c.label,
      width: 160,
      align: 'right',
      tooltip: c.ayuda,
      render: (f) =>
        f.esTotal ? (
          <Cifra valor={totales[c.clave]} fuerte />
        ) : (
          <NumberCell
            value={f3[c.clave]?.[f.clave] ?? null}
            width={96}
            disabled={!editable}
            error={editable && cifraInvalida(f3[c.clave]?.[f.clave] ?? null)}
            aria-label={`Consultorios externos: ${f.label}, ${c.label.toLowerCase()}`}
            onChange={(v) => cambiar(c.clave, f.clave, v)}
          />
        ),
    })),
    {
      key: 'total',
      label: 'Total',
      width: 130,
      align: 'right',
      tooltip: 'Suma automática de consultas y convenios. No se digita.',
      render: (f) => <Cifra valor={f.esTotal ? totalF3(f3) : totalFilaF3(f3, f.clave)} fuerte />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <HallazgosFormato datos={datos} periodo={periodo} idFormato="f3" />

      <Card accent="var(--primary)" icon="sh-people" title={`Formato 3 · ${META.titulo}`} subtitle={META.subtitulo}>
        <div style={{ padding: '16px 20px 4px' }}>
          <Alert tone="info" title="Filas por confirmar con el área">
            Como en Sala de Operaciones, el informe no rotula estas cuatro filas. Lo que sí se sabe es que sus totales
            cuentan lo mismo que dos casillas del Formato 1, y por eso se cruzan.
          </Alert>
        </div>

        <DataTable
          columns={columnas}
          rows={filas}
          rowKey={(f) => f.clave}
          empty="Sin filas."
          legend={
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <span>
                Atenciones del cuadro: <Cifra valor={totalF3(f3)} fuerte />
              </span>
              <Origen tipo="suma" />
              <Comparacion valor={totales.consultas} referencia={f1.sis?.ce ?? null} nombreReferencia="la Consulta externa SIS del Formato 1" regla="R5" />
              <Comparacion valor={totales.convenios} referencia={f1.convenio?.consultorio ?? null} nombreReferencia="los convenios de consultorio del Formato 1" regla="R6" />
            </span>
          }
        />
      </Card>
    </div>
  );
}
