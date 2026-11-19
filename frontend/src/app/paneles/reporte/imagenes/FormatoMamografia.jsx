/* Formato 3 · Exámenes mamográficos.

   Igual que tomografía, más la fila «Campaña (sin documento) · particular
   gratuito», que no tiene financiador ni servicio en el oficio: suma aparte al
   total de exámenes.

   El oficio de junio trae una casilla en blanco (pagados de consulta externa)
   y S/ 385,00 de monto sin ningún examen pagado. Los dos se avisan arriba; no
   bloquean, porque pueden tener explicación. */

import { Card } from '@hrl/core-ui';
import { formato } from '@/app/datos/formatos/imagenes.js';
import { examenesF3 } from '@/app/datos/formatos/imagenes-calculos.js';
import { CuadroFinanciamiento, TablaPersonas, CamposNumericos, HallazgosFormato } from './Comunes.jsx';

const META = formato('f3');

export default function FormatoMamografia({ datos, editable, onCambiar }) {
  const f3 = datos.f3 ?? {};
  const cambiar = (parcial) => onCambiar({ f3: { ...f3, ...parcial } });
  const examenes = examenesF3(f3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <HallazgosFormato datos={datos} idFormato="f3" />

      <Card accent="var(--primary)" icon="sh-xray" title={`Formato 3 · ${META.titulo}`} subtitle={`${META.modalidad} · consolidado mensual`}>
        <CuadroFinanciamiento matriz={f3.examenes} editable={editable} nombre="Mamografía" onCambiar={(m) => cambiar({ examenes: m })} />

        <CamposNumericos
          editable={editable}
          campos={[
            {
              clave: 'campana',
              label: 'Campaña (sin documento) · particular gratuito',
              ayuda: 'Mamografías de campaña, sin documento de financiamiento. Suman al total de exámenes; para DIRESA se cuentan en consulta externa.',
              valor: f3.campana ?? null,
              onCambiar: (v) => cambiar({ campana: v }),
            },
            { clave: 'examenes', label: 'Total de exámenes', ayuda: 'Cuadro de financiamiento más campaña. No se digita.', valor: examenes, calculado: true },
            {
              clave: 'pacientes',
              label: 'Total de pacientes',
              ayuda: 'Personas atendidas. No puede superar al total de exámenes.',
              valor: f3.pacientes ?? null,
              error: examenes != null && (f3.pacientes == null || f3.pacientes > examenes),
              onCambiar: (v) => cambiar({ pacientes: v }),
            },
            { clave: 'monto', label: 'Total en soles', ayuda: 'Monto que reporta el área. Se digita.', valor: f3.monto ?? null, unidad: 'S/', onCambiar: (v) => cambiar({ monto: v }) },
          ]}
        />
      </Card>

      <Card accent="var(--accent)" icon="sh-eye" title="Lectura e informe de mamografías" subtitle="Por médico">
        <TablaPersonas
          personas={f3.informes}
          editable={editable}
          onCambiar={(lista) => cambiar({ informes: lista })}
          rotulo="Médico"
          rotuloCantidad="Leídas"
          ayudaCantidad="Mamografías que este médico leyó e informó en el mes."
          unidad="exámenes"
          esperado={examenes}
          modo="tope"
        />
      </Card>
    </div>
  );
}
