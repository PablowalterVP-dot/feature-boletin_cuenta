/* Formato 2 · Exámenes tomográficos.

   El oficio lista SIS, convenios y pagados en tres cuadros de una columna; aquí
   van en una sola matriz por servicio, que es la misma información y se suma
   sola. Total de exámenes se calcula; total de pacientes y monto se digitan.

   En junio el tomógrafo estuvo inoperativo y el área lo anotó al pie. Aquí es
   un dato del formato: si se marca, el motivo es obligatorio, porque un mes en
   cero sin explicación no se distingue de un mes sin demanda. */

import { Alert, Card, Checkbox, Input } from '@hrl/core-ui';
import { formato } from '@/app/datos/formatos/imagenes.js';
import { examenesF2 } from '@/app/datos/formatos/imagenes-calculos.js';
import { CuadroFinanciamiento, TablaPersonas, CamposNumericos, HallazgosFormato } from './Comunes.jsx';

const META = formato('f2');

export default function FormatoTomografia({ datos, editable, onCambiar }) {
  const f2 = datos.f2 ?? {};
  const cambiar = (parcial) => onCambiar({ f2: { ...f2, ...parcial } });
  const examenes = examenesF2(f2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <HallazgosFormato datos={datos} idFormato="f2" />

      <Card accent="var(--primary)" icon="sh-xray" title={`Formato 2 · ${META.titulo}`} subtitle={`${META.modalidad} · consolidado mensual`}>
        <div style={{ padding: '16px 20px 6px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Checkbox
            checked={Boolean(f2.inoperativo)}
            disabled={!editable}
            label="El tomógrafo estuvo inoperativo este mes"
            onChange={(v) => cambiar({ inoperativo: v })}
          />
          {f2.inoperativo &&
            (editable ? (
              <Input
                label="Motivo o nota (obligatoria)"
                value={f2.nota ?? ''}
                placeholder="Tomógrafo inoperativo"
                onChange={(e) => cambiar({ nota: e.target.value })}
              />
            ) : (
              <Alert tone="warning" title="Tomógrafo inoperativo">
                {f2.nota?.trim() || 'Sin nota.'}
              </Alert>
            ))}
        </div>

        <CuadroFinanciamiento matriz={f2.examenes} editable={editable} nombre="Tomografía" onCambiar={(m) => cambiar({ examenes: m })} />

        <CamposNumericos
          editable={editable}
          campos={[
            { clave: 'examenes', label: 'Total de exámenes', ayuda: 'Suma del cuadro de financiamiento. No se digita.', valor: examenes, calculado: true },
            {
              clave: 'pacientes',
              label: 'Total de pacientes',
              ayuda: 'Personas atendidas. No puede superar al total de exámenes.',
              valor: f2.pacientes ?? null,
              error: examenes != null && (f2.pacientes == null || f2.pacientes > examenes),
              onCambiar: (v) => cambiar({ pacientes: v }),
            },
            { clave: 'monto', label: 'Total en soles', ayuda: 'Monto que reporta el área. Se digita.', valor: f2.monto ?? null, unidad: 'S/', onCambiar: (v) => cambiar({ monto: v }) },
          ]}
        />
      </Card>

      <Card accent="var(--accent)" icon="sh-eye" title="Tomografías informadas" subtitle="Lectura e informe por médico">
        <TablaPersonas
          personas={f2.informes}
          editable={editable}
          onCambiar={(lista) => cambiar({ informes: lista })}
          rotulo="Médico"
          rotuloCantidad="Informadas"
          ayudaCantidad="Tomografías que este médico leyó e informó en el mes."
          unidad="exámenes"
          esperado={examenes}
          modo="tope"
        />
      </Card>
    </div>
  );
}
