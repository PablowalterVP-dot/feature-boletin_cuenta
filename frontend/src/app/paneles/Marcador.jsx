/* Marcador de posición de un panel que todavía no está construido.

   Dice en qué fase se construye y qué va a contener. Una pantalla vacía sin
   explicación en una demostración se lee como un error del prototipo; esto se
   lee como un plan. */

import { Card, EmptyState, Icon, Mosaic } from '@hrl/core-ui';

export default function Marcador({ panel }) {
  return (
    <Mosaic className="hrl-panel">
      <Card accent="var(--info)" icon="sh-info"
        title={panel.title}
        subtitle={panel.subtitle}
        total={`Fase ${panel.fase}`}
      >
        <EmptyState
          icon={panel.icon}
          tone="var(--info)"
          title={`Este panel se construye en la Fase ${panel.fase}`}
          body="La Fase 0 dejó listos los cimientos: el sistema de diseño, los tres roles, las nueve áreas, la matriz de destinos y la máquina de estados del reporte. Lo que sigue se monta sobre eso."
        >
          {panel.detalle && (
            <ul
              style={{
                margin: '20px auto 0',
                maxWidth: 560,
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 0,
                listStyle: 'none',
                fontSize: 'var(--text-base)',
                color: 'var(--muted-foreground)',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              {panel.detalle.map((linea) => (
                <li key={linea} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--primary)', flex: '0 0 auto', marginTop: 1 }}>
                    <Icon name="sh-check" size={16} />
                  </span>
                  {linea}
                </li>
              ))}
            </ul>
          )}
        </EmptyState>
      </Card>
    </Mosaic>
  );
}
