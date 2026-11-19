/* Formato 4 · Metas y convenios.

   La introducción del informe de enero de 2026 anuncia dos secciones, «Metas
   alcanzadas» y «Convenios y Créditos Personales», que no aparecen como
   datos: quizá estén en los gráficos incrustados del Word. Hasta que Farmacia
   diga qué contienen, este formato no tiene casillas. Inventarle campos haría
   que el área llenara algo que nadie le pidió, y no impide enviar. */

import { Card, EmptyState, Icon } from '@hrl/core-ui';
import { formato } from '@/app/datos/formatos/farmacia.js';

const META = formato('f4');

export default function FormatoMetas() {
  return (
    <Card accent="var(--info)" icon="sh-doc" title={`Formato 4 · ${META.titulo}`} subtitle={META.subtitulo}>
      <EmptyState
        icon="sh-doc"
        tone="var(--info)"
        title="Este formato está pendiente de definir"
        body="El informe anuncia las secciones «Metas alcanzadas» y «Convenios y Créditos Personales», pero no las trae como cifras. Cuando Farmacia confirme qué contienen, se modelarán aquí con sus totales y validaciones."
      >
        <span style={{ marginTop: 14, display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>
          <Icon name="sh-info" size={15} />
          No impide enviar el reporte: no hay nada que llenar.
        </span>
      </EmptyState>
    </Card>
  );
}
