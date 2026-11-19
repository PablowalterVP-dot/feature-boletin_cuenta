/* Formato 1 · Casos nuevos de infecciones intrahospitalarias.

   La única tabla del oficio de Epidemiología, como la trae el Word: quince
   grupos de edad en filas y, en columnas, el servicio o el tipo de infección
   por sexo, con la fila TOTAL calculada. Las dos columnas de muertes van al
   final, separadas en el encabezado, porque no suman a las infecciones.

   Sin servidor se puede digitar (`editable`); con él, las cifras solo entran
   subiendo el Word, como en las demás áreas que suben archivo. */

import { Alert, Card, DataTable, NumberCell, Tooltip } from '@hrl/core-ui';
import { EDADES, COLUMNAS, GRUPOS, formato, etiquetaColumna } from '@/app/datos/formatos/epidemiologia.js';
import { validar, hallazgosDe, celda, totalColumna, totalEdad, infeccionesDelMes, anidar, LECTURA_IIH } from '@/app/datos/formatos/epidemiologia-calculos.js';
import { numero } from '@/app/dominio/formato.js';

const META = formato('f1');
const cifra = (v) => (v == null ? '—' : numero(v));
const grupoDe = (c) => GRUPOS.find((g) => g.clave === c.grupo);
const invalida = (v) => v != null && (!Number.isInteger(v) || v < 0);

function HallazgosFormato({ datos, periodo }) {
  const hallazgos = hallazgosDe(validar(datos, periodo), 'f1').filter((h) => h.nivel !== 'info');
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

export default function FormatoInfecciones({ datos, periodo, editable, onCambiar }) {
  const f1 = anidar(datos)?.f1 ?? {};
  const cambiar = (edad, columna, valor) => onCambiar({ f1: { ...f1, [edad]: { ...f1[edad], [columna]: valor } } });
  const TOTAL = { clave: 'total', label: 'TOTAL', total: true };

  const columnas = [
    { key: 'edad', label: 'Grupo de edad', width: 150, render: (e) => (e.total ? <strong>{e.label}</strong> : e.label) },
    ...COLUMNAS.map((c) => {
      const g = grupoDe(c);
      return {
        key: c.clave,
        label: etiquetaColumna(c.clave),
        align: 'right',
        tooltip: `${g.label}, ${c.sexo === 'F' ? 'femenino' : 'masculino'}. ${g.ayuda}`,
        render: (e) => {
          if (e.total) return <strong className="hrl-mono">{cifra(totalColumna(f1, c.clave))}</strong>;
          const v = celda(f1, e.clave, c.clave);
          return editable ? (
            <NumberCell value={v} width={56} error={invalida(v)} aria-label={`${etiquetaColumna(c.clave)}, ${e.label}`} onChange={(n) => cambiar(e.clave, c.clave, n)} />
          ) : (
            <span className="hrl-mono">{v ? numero(v) : v === 0 ? '·' : '—'}</span>
          );
        },
      };
    }),
    {
      key: 'infecciones',
      label: 'Infecciones',
      align: 'right',
      tooltip: 'Casos nuevos de infección del grupo de edad: todas las columnas menos las de muertes.',
      render: (e) => <strong className="hrl-mono">{cifra(e.total ? infeccionesDelMes(f1) : totalEdad(f1, e.clave))}</strong>,
    },
  ];

  return (
    <>
      <HallazgosFormato datos={datos} periodo={periodo} />
      <Card
        accent="var(--primary)"
        icon={META.icono}
        title={META.titulo}
        subtitle={`Formato 1 · ${META.subtitulo}`}
        meta={
          <Tooltip title="Infecciones intrahospitalarias del mes" body={LECTURA_IIH} focusable={false}>
            <span className="hrl-mono" style={{ fontSize: 'var(--text-md)', cursor: 'help' }}>
              {cifra(infeccionesDelMes(f1))} casos
            </span>
          </Tooltip>
        }
        flush
      >
        <DataTable columns={columnas} rows={[...EDADES, TOTAL]} rowKey={(e) => e.clave} />
        <p style={{ margin: 0, padding: '12px 20px 16px', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)', lineHeight: 'var(--leading-normal)' }}>
          «·» es un grupo sin casos (en el oficio, la celda en blanco). Las muertes neonatales y maternas se registran en la misma tabla pero no son infecciones: no suman a la columna «Infecciones».
        </p>
      </Card>
    </>
  );
}
