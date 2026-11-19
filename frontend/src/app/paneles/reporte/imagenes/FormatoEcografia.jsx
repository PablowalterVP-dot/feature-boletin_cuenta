/* Formato 1 · Exámenes ecográficos.

   La hoja del oficio: una fila por médico con pacientes, nueve casillas de
   financiamiento por servicio y el monto. Debajo, con las mismas columnas,
   biopsias y procedimientos oncológicos.

   La columna EXAM del papel no se digita: es la suma de las nueve casillas, y
   cotejada contra junio cuadra en las seis filas. */

import { Card } from '@hrl/core-ui';
import { CUADROS_ECO, formato } from '@/app/datos/formatos/imagenes.js';
import { totalesCuadro } from '@/app/datos/formatos/imagenes-calculos.js';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import { TablaProfesionales, HallazgosFormato } from './Comunes.jsx';

const META = formato('f1');

export default function FormatoEcografia({ datos, editable, onCambiar }) {
  const f1 = datos.f1 ?? {};
  const cambiar = (clave, filas) => onCambiar({ f1: { ...f1, [clave]: filas } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <HallazgosFormato datos={datos} idFormato="f1" />

      {CUADROS_ECO.map((c, i) => {
        const t = totalesCuadro(f1[c.clave]);
        return (
          <Card accent={i === 0 ? 'var(--primary)' : 'var(--accent)'} icon="sh-xray"
            key={c.clave}
            title={i === 0 ? `Formato 1 · ${META.titulo}` : c.titulo}
            subtitle={i === 0 ? `${META.modalidad} · consolidado mensual por profesional` : c.ayuda}
            total={t.examenes == null ? SIN_DATOS : `${numero(t.examenes)} exámenes`}
          >
            <TablaProfesionales filas={f1[c.clave] ?? []} editable={editable} nombreCuadro={c.titulo.toLowerCase()} onCambiar={(filas) => cambiar(c.clave, filas)} />
          </Card>
        );
      })}
    </div>
  );
}
