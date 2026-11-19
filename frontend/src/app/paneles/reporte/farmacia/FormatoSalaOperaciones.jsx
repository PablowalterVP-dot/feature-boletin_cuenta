/* Formato 2 · Sala de Operaciones.

   La matriz del informe: cinco servicios (MATER, GINEC, CIRU, MEDI, PEDIA)
   por cuatro filas sin rótulo, más los convenios. Mientras el área no diga qué
   es cada fila, se llaman «Fila 1» a «Fila 4» y la pantalla lo advierte.

   Los totales por fila, por servicio y del cuadro se calculan. Las dos
   comparaciones con el Formato 1 (R7 y R8) suponen que Sala de Operaciones
   está dentro de Hospitalización; como eso no está confirmado, avisan y no
   impiden enviar. */

import { Alert, Card, DataTable, NumberCell, Tooltip } from '@hrl/core-ui';
import { SERVICIOS_SOP, FILAS, formato } from '@/app/datos/formatos/farmacia.js';
import {
  celdaSop,
  hospitalizadosFila,
  hospitalizadosServicio,
  totalHospitalizadosSop,
  totalConveniosSop,
  totalSop,
} from '@/app/datos/formatos/farmacia-calculos.js';
import { Origen, Cifra } from '../Comunes.jsx';
import { HallazgosFormato, Comparacion, cifraInvalida } from './Comunes.jsx';

const META = formato('f2');

export default function FormatoSalaOperaciones({ datos, periodo, editable, onCambiar }) {
  const f2 = datos.f2 ?? {};
  const f1 = datos.f1 ?? {};
  const cambiarCelda = (fila, servicio, v) =>
    onCambiar({ f2: { ...f2, hospitalizados: { ...f2.hospitalizados, [fila]: { ...f2.hospitalizados?.[fila], [servicio]: v } } } });
  const cambiarConvenio = (fila, v) => onCambiar({ f2: { ...f2, convenios: { ...f2.convenios, [fila]: v } } });

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
    ...SERVICIOS_SOP.map((s) => ({
      key: s.clave,
      label: s.label,
      group: 'Hospitalizados',
      groupTooltip: 'Atenciones de Farmacia a pacientes hospitalizados atendidos en Sala de Operaciones, por servicio.',
      width: 96,
      align: 'right',
      tooltip: `${s.nombre}. ${s.ayuda}`,
      render: (f) =>
        f.esTotal ? (
          <Cifra valor={hospitalizadosServicio(f2, s.clave)} fuerte />
        ) : (
          <NumberCell
            value={celdaSop(f2, f.clave, s.clave)}
            width={72}
            disabled={!editable}
            error={editable && cifraInvalida(celdaSop(f2, f.clave, s.clave))}
            aria-label={`Sala de Operaciones: ${f.label}, ${s.nombre}`}
            onChange={(v) => cambiarCelda(f.clave, s.clave, v)}
          />
        ),
    })),
    {
      key: 'hospitalizados',
      label: 'Hospitalizados',
      width: 130,
      align: 'right',
      tooltip: 'Suma automática de los cinco servicios de la fila. No se digita.',
      render: (f) => <Cifra valor={f.esTotal ? totalHospitalizadosSop(f2) : hospitalizadosFila(f2, f.clave)} fuerte />,
    },
    {
      key: 'convenios',
      label: 'Convenios',
      width: 112,
      align: 'right',
      tooltip: 'Atenciones de Sala de Operaciones cubiertas por convenio.',
      render: (f) =>
        f.esTotal ? (
          <Cifra valor={totalConveniosSop(f2)} fuerte />
        ) : (
          <NumberCell
            value={f2.convenios?.[f.clave] ?? null}
            width={72}
            disabled={!editable}
            error={editable && cifraInvalida(f2.convenios?.[f.clave] ?? null)}
            aria-label={`Sala de Operaciones: ${f.label}, convenios`}
            onChange={(v) => cambiarConvenio(f.clave, v)}
          />
        ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <HallazgosFormato datos={datos} periodo={periodo} idFormato="f2" />

      <Card accent="var(--primary)" icon="sh-scalpel" title={`Formato 2 · ${META.titulo}`} subtitle={META.subtitulo}>
        <div style={{ padding: '16px 20px 4px' }}>
          <Alert tone="info" title="Filas por confirmar con el área">
            El informe de enero de 2026 trae esta matriz con cuatro filas sin rótulo. Se registran como «Fila 1» a «Fila 4»
            hasta que Farmacia confirme qué representa cada una; los totales no dependen de ese nombre.
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
                Atenciones del cuadro: <Cifra valor={totalSop(f2)} fuerte />
              </span>
              <Origen tipo="suma" />
              <Comparacion
                valor={totalHospitalizadosSop(f2)}
                referencia={f1.sis?.hosp ?? null}
                modo="tope"
                nombreReferencia="la Hospitalización SIS del Formato 1"
                regla="R7"
                supuesto
              />
              <Comparacion
                valor={totalConveniosSop(f2)}
                referencia={f1.convenio?.hosp ?? null}
                modo="tope"
                nombreReferencia="los convenios de hospitalizados del Formato 1"
                regla="R8"
                supuesto
              />
            </span>
          }
        />
      </Card>
    </div>
  );
}
