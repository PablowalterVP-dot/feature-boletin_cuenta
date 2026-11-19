/* Lo que el bot encontró, en una sola lista ordenada por lo que el área tiene
   que hacer: primero lo que impide enviar, después las alertas por revisar,
   al final lo que conviene saber. Diez por página.

   Ni se corrige ni se justifica desde aquí: las dos cosas se hacen con Dr.
   Mochi (Correccion.jsx), que muestra la celda del Excel al lado del
   formulario. Una alerta se corrige o se confirma con un clic; la confirmación
   reemplaza a la justificación escrita (12/10/2026). Esta lista solo dice qué
   falta. `onConfirmar` es para un reporte sin Excel (digitado en el
   prototipo), que no tiene libro que abrir con Dr. Mochi.

   Lo técnico del bot —su versión, cuántas reglas aplicó, dónde corrió— ya no
   se le muestra al área: no cambia lo que tiene que hacer. Está en la pantalla
   del bot del equipo de desarrollo (admin).

   Lo comparten las áreas que suben su Excel. Dónde cae cada hallazgo y el
   texto de «sin observaciones» son de cada área y llegan por props; sin
   ellos, los de Nutrición. */

import { useState } from 'react';
import { Badge, Button, Card, Icon, Pagination, Stack, Tooltip } from '@hrl/core-ui';
import { formato, filaDe } from '@/app/datos/formatos/nutricion.js';
import { TEXTO_CONFIRMADA } from '../Correccion.jsx';

const POR_PAGINA = 10;

const NIVEL = {
  error: { icono: 'sh-crit', color: 'var(--destructive-text)', texto: 'Impide enviar', tono: 'crit' },
  aviso: { icono: 'sh-warn', color: 'var(--warning-fg)', texto: 'Revisar con Dr. Mochi', tono: 'warn' },
  info: { icono: 'sh-info', color: 'var(--info-fg)', texto: 'Para confirmar', tono: 'info' },
  ok: { icono: 'sh-ok', color: 'var(--success-text)', texto: 'Cumple' },
  'sin-evaluar': { icono: 'sh-none', color: 'var(--subtle-foreground)', texto: 'Sin datos para evaluar' },
};

const REPORTE = { comensales: 'Comensales', pacientes: 'Pacientes' };
const SERVICIO = { hosp: 'hospitalización', emerg: 'emergencia' };

function ubicacion(h) {
  const f = formato(h.formato);
  if (!f) return null;
  const fila = h.fila ? filaDe(h.formato, h.fila) : null;
  return [`${REPORTE[f.poblacion]} · ${SERVICIO[f.servicio]}`, fila && `${fila.grupoLabel} · ${fila.comidaLabel}`, h.dia && `día ${h.dia}`]
    .filter(Boolean)
    .join(' · ');
}

const LIMPIO_NUTRICION = 'Los cuatro cuadros están completos, sus totales cuadran y ningún día se dispara';

export default function PorResolver({ informe, datos, onConfirmar, ubicar = ubicacion, textoLimpio = LIMPIO_NUTRICION }) {
  const [pagina, setPagina] = useState(1);

  const lista = [
    ...informe.errores.map((h) => ({ ...h, nivel: 'error' })),
    ...informe.avisos.map((h) => ({ ...h, nivel: 'aviso' })),
    ...informe.info.map((h) => ({ ...h, nivel: 'info' })),
  ];
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);
  const pendientes = informe.errores.length + informe.avisos.filter((a) => !(datos?.justificaciones?.[a.id] ?? '').trim()).length;

  return (
    <Card accent={informe.errores.length ? 'var(--destructive)' : informe.avisos.length ? 'var(--warning)' : 'var(--success)'} icon="sh-shield"
      title={lista.length ? `Por resolver (${pendientes})` : 'Sin observaciones'}
      subtitle={
        lista.length
          ? `${informe.errores.length} ${informe.errores.length === 1 ? 'error' : 'errores'} · ${informe.avisos.length} ${informe.avisos.length === 1 ? 'alerta' : 'alertas'} · ${informe.info.length} para confirmar`
          : textoLimpio
      }
    >
      <div className="hrl-hallazgos">
        {visibles.map((h, i) => {
          const n = NIVEL[h.nivel];
          const texto = datos?.justificaciones?.[h.id] ?? '';
          const confirmada = h.nivel === 'aviso' && Boolean(texto.trim());
          return (
            <div className="hrl-hallazgo" key={`${h.id}-${i}`}>
              <span style={{ color: n.color, flex: '0 0 auto', marginTop: 2 }}>
                <Icon name={n.icono} size={18} />
              </span>
              {/* Base de 240 px: en un teléfono el texto pasa bajo el botón en vez
                  de encogerse a una palabra por línea. */}
              <Stack gap={2} style={{ minWidth: 0, flex: '1 1 240px' }}>
                <Stack direction="row" gap={2} align="center" wrap>
                  <strong style={{ fontSize: 'var(--text-base)' }}>{h.titulo}</strong>
                  <Badge label={confirmada ? 'Confirmada' : n.texto} tone={confirmada ? 'ok' : n.tono} />
                </Stack>
                {ubicar(h) && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{ubicar(h)}</span>}
                {/* Una justificación escrita antes del cambio se sigue mostrando. */}
                {confirmada && texto.trim() !== TEXTO_CONFIRMADA && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>«{texto}»</span>}
                {h.nivel === 'aviso' && !confirmada && onConfirmar && (
                  <Tooltip title="Confirmar la cifra" body="Si la cifra es real, confírmela: el reporte se envía con ella. Si es un error, corríjala en los cuadros." focusable={false}>
                    <Button tone="ghost" size="sm" icon="sh-ok" onClick={() => onConfirmar(h.id)} style={{ alignSelf: 'flex-start' }}>
                      La cifra es correcta: confirmar
                    </Button>
                  </Tooltip>
                )}
              </Stack>
            </div>
          );
        })}
      </div>

      {paginas > 1 && (
        <div style={{ padding: '0 var(--space-5) var(--space-3)' }}>
          <Pagination page={actual} totalPages={paginas} perPage={POR_PAGINA} totalItems={lista.length} onChange={setPagina} />
        </div>
      )}

    </Card>
  );
}
