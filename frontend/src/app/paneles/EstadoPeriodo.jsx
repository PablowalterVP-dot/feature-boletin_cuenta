/* Estado de un periodo en una línea: la etiqueta del estado y, al lado, la
   fecha de entrega si ya salió del área o el plazo si todavía no. Lo usan el
   inicio y el reporte, para que las dos pantallas digan lo mismo con las mismas
   palabras. */

import { Badge, Icon, Tooltip } from '@hrl/core-ui';
import { estado, estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { usePlazo } from '@/app/datos/store.js';
import { fechaCorta } from '@/app/dominio/formato.js';

/* `claveArea`: el área del reporte, si el que mira no es ella (Estadística). */
export default function EstadoPeriodo({ reporte, periodo, claveArea }) {
  const estadoObj = estado(reporte?.estado);
  const plazo = usePlazo(periodo, reporte?.area ?? claveArea);
  const vencido = plazo.vencido;

  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <Badge label={estadoObj.label} tone={estadoObj.tono} />

      {estaEntregado(estadoObj.clave) ? (
        <Tooltip title="Constancia de entrega" body={`Folio ${reporte.folio}. Constancia ${reporte.constancia}.`} focusable={false}>
          <span className="hrl-chip">
            <Icon name="sh-stamp" size={13} />
            Entregado el {fechaCorta(reporte.enviadoEn)}
          </span>
        </Tooltip>
      ) : (
        <Tooltip
          title="Plazo del periodo"
          body={`El de ${etiquetaPeriodo(periodo)} vence el ${fechaCorta(plazo.fecha)}.`}
          focusable={false}
        >
          <span className="hrl-chip" style={vencido ? { background: 'var(--warning-soft)', color: 'var(--warning-fg)' } : undefined}>
            <Icon name="sh-clock" size={13} />
            {vencido ? `Plazo vencido hace ${plazo.retraso} días` : `Quedan ${plazo.quedan} días de plazo`}
          </span>
        </Tooltip>
      )}
    </span>
  );
}
