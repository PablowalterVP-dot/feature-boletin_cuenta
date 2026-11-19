/* Formato 4 · Servicio de Rayos X.

   Cuatro cuadros del oficio: exámenes por servicio, exámenes por tecnólogo,
   particulares y lectura e informe.

   Los exámenes atendidos no se digitan: son hospitalización + emergencia +
   consulta externa. Y el cuadro por tecnólogo tiene que sumar lo mismo —en
   junio, 1 372 por los dos lados—; si no cuadra, es un error que impide
   enviar. */

import { Card } from '@hrl/core-ui';
import { formato, SERVICIOS } from '@/app/datos/formatos/imagenes.js';
import { examenesF4 } from '@/app/datos/formatos/imagenes-calculos.js';
import { TablaPersonas, CamposNumericos, HallazgosFormato } from './Comunes.jsx';

const META = formato('f4');

/* Orden del oficio: hospitalización, emergencia, consulta externa. */
const ORDEN_RX = ['hosp', 'emerg', 'ce'];

export default function FormatoRayosX({ datos, editable, onCambiar }) {
  const f4 = datos.f4 ?? {};
  const cambiar = (parcial) => onCambiar({ f4: { ...f4, ...parcial } });
  const examenes = examenesF4(f4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <HallazgosFormato datos={datos} idFormato="f4" />

      <Card accent="var(--primary)" icon="sh-xray" title={`Formato 4 · ${META.titulo}`} subtitle="Detalle de los exámenes realizados">
        <CamposNumericos
          editable={editable}
          campos={[
            ...ORDEN_RX.map((clave) => {
              const s = SERVICIOS.find((x) => x.clave === clave);
              return {
                clave,
                label: `Exámenes de ${s.label.toLowerCase()}`,
                ayuda: `Radiografías de pacientes de ${s.label.toLowerCase()}.`,
                valor: f4.examenes?.[clave] ?? null,
                onCambiar: (v) => cambiar({ examenes: { ...f4.examenes, [clave]: v } }),
              };
            }),
            { clave: 'atendidos', label: 'Exámenes atendidos', ayuda: 'Hospitalización + emergencia + consulta externa. No se digita.', valor: examenes, calculado: true },
            {
              clave: 'pacientes',
              label: 'Total de pacientes',
              ayuda: 'Personas atendidas. No puede superar a los exámenes atendidos.',
              valor: f4.pacientes ?? null,
              error: examenes != null && (f4.pacientes == null || f4.pacientes > examenes),
              onCambiar: (v) => cambiar({ pacientes: v }),
            },
            { clave: 'placas', label: 'Número de placas radiográficas', ayuda: 'Placas impresas en el mes. Si no se usaron, escriba 0.', valor: f4.placas ?? null, onCambiar: (v) => cambiar({ placas: v }) },
          ]}
        />
      </Card>

      <Card accent="var(--accent)" icon="sh-people" title="Exámenes realizados por tecnólogo" subtitle="Deben sumar los exámenes atendidos">
        <TablaPersonas
          personas={f4.tecnologos}
          editable={editable}
          onCambiar={(lista) => cambiar({ tecnologos: lista })}
          rotulo="Tecnólogo"
          rotuloCantidad="Exámenes"
          ayudaCantidad="Radiografías que tomó este tecnólogo en el mes."
          unidad="exámenes"
          esperado={examenes}
          modo="igual"
        />
      </Card>

      <Card accent="var(--warning)" icon="sh-bill" title="Particulares" subtitle="Pacientes que pagaron directamente">
        <CamposNumericos
          editable={editable}
          campos={[
            {
              clave: 'particulares',
              label: 'Pacientes particulares',
              ayuda: 'Pacientes sin seguro ni convenio. No pueden superar al total de pacientes.',
              valor: f4.particulares ?? null,
              error: f4.particulares != null && f4.pacientes != null && f4.particulares > f4.pacientes,
              onCambiar: (v) => cambiar({ particulares: v }),
            },
            { clave: 'monto', label: 'Total de exámenes en soles', ayuda: 'Monto recaudado por los exámenes particulares. Se digita.', valor: f4.monto ?? null, unidad: 'S/', onCambiar: (v) => cambiar({ monto: v }) },
          ]}
        />
      </Card>

      <Card accent="var(--accent)" icon="sh-eye" title="Lectura e informe de Rayos X" subtitle="Por médico">
        <TablaPersonas
          personas={f4.informes}
          editable={editable}
          onCambiar={(lista) => cambiar({ informes: lista })}
          rotulo="Médico"
          rotuloCantidad="Informadas"
          ayudaCantidad="Radiografías que este médico leyó e informó en el mes."
          unidad="exámenes"
          esperado={examenes}
          modo="tope"
        />
      </Card>
    </div>
  );
}
