/* Nutrición en las pantallas que recorren los formatos de cualquier área
   levantada (el visor de Estadística): un panel por cuadro, en solo lectura,
   con el mismo detalle por semana que usa el área. */

import { Card } from '@hrl/core-ui';
import { FORMATOS } from '@/app/datos/formatos/nutricion.js';
import Detalle from './Detalle.jsx';

export function cuadro(f) {
  function Cuadro({ datos, periodo }) {
    return (
      <Card accent="var(--primary)" icon="sh-cutlery" title={f.titulo} subtitle={f.descripcion}>
        <div className="hrl-cuerpo">
          <Detalle datos={datos} periodo={periodo} editable={false} soloFormato={f.id} />
        </div>
      </Card>
    );
  }
  Cuadro.displayName = `Cuadro${f.numero}`;
  return Cuadro;
}

export const CUADROS_NUTRICION = Object.freeze(Object.fromEntries(FORMATOS.map((f) => [f.id, cuadro(f)])));
