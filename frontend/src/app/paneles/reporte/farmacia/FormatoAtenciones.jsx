/* Formato 1 · Atenciones del mes.

   El resumen por tipo de atención del informe de Farmacia: SIS por servicio,
   convenios por servicio y los demás financiadores. En el papel, los cuatro
   totales se escribían a mano; aquí se calculan (R1 a R4) y no se pueden
   escribir, así que no pueden quedar mal sumados.

   Las tarjetas cortas van seguidas, como hermanas, para que el mosaico las
   ponga de dos en dos. */

import { Card } from '@hrl/core-ui';
import { COMPONENTES_SIS, COMPONENTES_CONVENIO, OTROS_FINANCIADORES, formato } from '@/app/datos/formatos/farmacia.js';
import { totalSis, totalConvenios, totalOtras, totalAtenciones, recetasDespachadas, LECTURA_RECETAS } from '@/app/datos/formatos/farmacia-calculos.js';
import { CamposFarmacia, HallazgosFormato } from './Comunes.jsx';

const META = formato('f1');

export default function FormatoAtenciones({ datos, periodo, editable, onCambiar }) {
  const f1 = datos.f1 ?? {};
  const cambiar = (grupo, clave, valor) => onCambiar({ f1: { ...f1, [grupo]: { ...f1[grupo], [clave]: valor } } });
  const campo = (grupo) => (c) => ({
    clave: `${grupo}.${c.clave}`,
    label: c.label,
    ayuda: c.ayuda,
    valor: f1[grupo]?.[c.clave] ?? null,
    onCambiar: (v) => cambiar(grupo, c.clave, v),
  });

  return (
    <>
      <HallazgosFormato datos={datos} periodo={periodo} idFormato="f1" />

      <Card accent="var(--primary)" icon="sh-shield" title="SIS" subtitle={`Formato 1 · ${META.titulo} · Seguro Integral de Salud`}>
        <CamposFarmacia
          editable={editable}
          campos={[
            ...COMPONENTES_SIS.map(campo('sis')),
            { clave: 'total-sis', label: 'Total SIS', ayuda: 'R1 · Suma de los cinco componentes SIS. No se digita.', valor: totalSis(f1), calculado: true },
          ]}
        />
      </Card>

      <Card accent="var(--accent)" icon="sh-stamp" title="Convenios" subtitle="Atenciones cubiertas por una entidad con convenio">
        <CamposFarmacia
          editable={editable}
          campos={[
            ...COMPONENTES_CONVENIO.map(campo('convenio')),
            { clave: 'total-convenios', label: 'Total convenios', ayuda: 'R2 · Suma de emergencia, hospitalizados y consultorio. No se digita.', valor: totalConvenios(f1), calculado: true },
          ]}
        />
      </Card>

      <Card accent="var(--warning)" icon="sh-bill" title="Otros financiadores" subtitle="Programas, boletas de venta y exoneraciones">
        <CamposFarmacia editable={editable} campos={OTROS_FINANCIADORES.map(campo('otros'))} />
      </Card>

      <Card accent="var(--primary)" icon="sh-chart" title="Totales del mes" subtitle="Calculados: no se digitan">
        <CamposFarmacia
          editable={editable}
          campos={[
            { clave: 'sis', label: 'Total SIS', ayuda: 'R1 · Suma de los cinco componentes SIS.', valor: totalSis(f1), calculado: true },
            {
              clave: 'otras',
              label: 'Total otras atenciones',
              ayuda: 'R3 · Convenios más programas, boletas de venta, crédito personal, Defensa Nacional e insolvencias: todo lo que no es SIS.',
              valor: totalOtras(f1),
              calculado: true,
            },
            { clave: 'atenciones', label: 'Total de atenciones', ayuda: 'R4 · SIS más otras atenciones. Es la cifra principal del informe.', valor: totalAtenciones(f1), calculado: true },
            { clave: 'recetas', label: 'Recetas despachadas (DIRESA)', ayuda: LECTURA_RECETAS, valor: recetasDespachadas(f1), unidad: 'recetas', calculado: true },
          ]}
        />
      </Card>
    </>
  );
}
