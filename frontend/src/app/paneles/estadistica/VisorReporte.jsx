/* Visor de un reporte recibido.

   A la izquierda, lo que el área envió. A la derecha, sus validaciones, a qué
   oficinas llegó, a qué formatos DIRESA alimenta y su recorrido.

   Sin acciones: Estadística ya no valida ni remite (12/10/2026). El bot no
   deja enviar lo que no cuadra, y al enviar el reporte llega a la vez a
   Estadística y a las oficinas de la matriz. Reabrir un mes cerrado sigue
   siendo posible desde el soporte del superadministrador. */

import { useState } from 'react';
import { Button, Card, EmptyState, Icon, Mosaic, Skeleton, Steps, Timeline, Tooltip } from '@hrl/core-ui';
import { area, destinosDe } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { reporteDe, useHoy, plazoRealDe } from '@/app/datos/store.js';
import { revisionDe } from '@/app/datos/formatos/revision.js';
import { formularioDe, datosCompletos, pasosDe } from '@/app/datos/formatos/levantados.js';
import { SECCIONES } from '@/app/datos/diresa/servicios-intermedios.js';
import { indicadoresQueUsan } from '@/app/datos/diresa/indicadores.js';
import { estaEntregado, etiquetaDeEstado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, plazoEfectivo, estaVencido, diasDeRetraso } from '@/app/dominio/periodos.js';
import { fechaCorta } from '@/app/dominio/formato.js';
import EstadoPeriodo from '../EstadoPeriodo.jsx';
import { PANELES } from '../reporte/formularios.js';
import ReporteGenerico from './ReporteGenerico.jsx';
import { LISTA, SECUNDARIO } from './comunes.jsx';

const MARCA = {
  ok: { icono: 'sh-ok', color: 'var(--success-text)', texto: 'Cumple' },
  error: { icono: 'sh-crit', color: 'var(--destructive-text)', texto: 'No cumple' },
  aviso: { icono: 'sh-warn', color: 'var(--warning-fg)', texto: 'Aviso' },
  'sin-evaluar': { icono: 'sh-none', color: 'var(--subtle-foreground)', texto: 'Sin datos para evaluar' },
};

/* Los formatos tal como el área los envió, con las mismas pantallas con que se
   llenaron pero en solo lectura: Estadística ve el oficio, no un resumen. */
function FormatosEnviados({ reporte, claveArea }) {
  /* El detalle de este mes todavía viene en camino (api.sincronizarArea lo trae
     en segundo plano): sin él, el visor mostraría un reporte vacío. */
  if (reporte.resumen) return <Skeleton height={320} radius="var(--radius-card)" aria-busy="true" />;
  return <FormatosCompletos reporte={reporte} claveArea={claveArea} />;
}

function FormatosCompletos({ reporte, claveArea }) {
  const formulario = formularioDe(claveArea);
  const [paso, setPaso] = useState(formulario.formatos[0].id);
  const datos = datosCompletos(claveArea, reporte.datos);
  const validacion = formulario.validar(datos, reporte.periodo);
  const pasos = pasosDe(claveArea, datos, reporte.periodo, validacion);
  const Panel = PANELES[claveArea][paso];

  return (
    <>
      <Card accent="var(--primary)" icon="sh-doc" title="Formatos enviados" subtitle={`${formulario.nombre} · solo lectura`}>
        <div className="hrl-cuerpo">
          <Steps steps={pasos} active={paso} onChange={setPaso} label="Formatos del reporte" />
        </div>
      </Card>
      <Panel datos={datos} periodo={reporte.periodo} editable={false} onCambiar={() => {}} />
    </>
  );
}

function Validaciones({ revision }) {
  if (!revision || revision.items.length === 0) {
    return (
      <Card accent="var(--info)" icon="sh-shield" title="Validaciones">
        <p style={{ margin: 0, padding: '14px 20px 18px', fontSize: 'var(--text-base)', color: 'var(--muted-foreground)' }}>
          Esta área todavía no tiene reglas de validación: se definen cuando se levanta su oficio.
        </p>
      </Card>
    );
  }

  return (
    <Card accent={revision.errores ? 'var(--destructive)' : 'var(--success)'} icon="sh-shield"
      title="Validaciones"
      subtitle={revision.errores ? `${revision.errores} con error` : `${revision.cumplidas} de ${revision.total} cumplidas`}
    >
      <ul style={LISTA}>
        {revision.items.map((it) => {
          const m = MARCA[it.estado];
          return (
            <li key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 20px', borderTop: '1px dashed var(--border)' }}>
              <span style={{ color: m.color, flex: '0 0 auto', marginTop: 2 }} role="img" aria-label={m.texto}>
                <Icon name={m.icono} size={16} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-base)' }}>{it.texto}</span>
                {it.detalle && <span style={SECUNDARIO}>{it.detalle}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* Con el reporte entregado, las oficinas que de verdad lo recibieron (su
   remisión); antes, las que lo recibirán según la matriz. */
function ADondeVa({ claveArea, reporte }) {
  const externos = reporte?.remision?.destinos ?? destinosDe(claveArea).filter((d) => d !== 'estadistica');
  const secciones = SECCIONES.filter((s) => s.areas.includes(claveArea));
  const indicadores = indicadoresQueUsan(claveArea);

  return (
    <Card accent="var(--info)" icon="sh-share" title={reporte?.remision ? 'A dónde llegó' : 'A dónde va'} subtitle="Al mismo tiempo que a Estadística, en el momento del envío">
      <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 'var(--text-base)' }}>
        <div>
          <strong style={{ display: 'block', marginBottom: 6 }}>Oficinas del hospital</strong>
          {externos.length ? (
            <span className="hrl-chips-fila">
              {externos.map((d) => (
                <span key={d} className="hrl-chip">
                  {nombreOficina(d)}
                </span>
              ))}
            </span>
          ) : (
            <span style={SECUNDARIO}>Ninguna: el reporte termina en Estadística.</span>
          )}
        </div>
        <div>
          <strong style={{ display: 'block', marginBottom: 6 }}>Formatos a DIRESA</strong>
          {secciones.length === 0 && indicadores.length === 0 ? (
            <span style={SECUNDARIO}>No alimenta ningún formato de DIRESA.</span>
          ) : (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {secciones.map((s) => (
                <span key={s.clave}>Servicios intermedios · {s.titulo}</span>
              ))}
              {indicadores.length > 0 && (
                <Tooltip
                  title="Indicadores de gestión"
                  body="Números de los indicadores cuyo numerador o denominador sale de este reporte."
                  focusable={false}
                >
                  <span style={{ cursor: 'help' }}>
                    Indicadores de gestión · {indicadores.length === 1 ? 'n.º' : 'n.os'} {indicadores.join(', ')}
                  </span>
                </Tooltip>
              )}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/* `oficina`: quien lee es una oficina receptora, no quien administra la bandeja. */
export default function VisorReporte({ reportes, plazosReales = {}, claveArea, periodo, onVolver, oficina = null, onEliminar = null }) {
  const hoy = useHoy();
  const fechaLimiteReal = plazoRealDe(plazosReales, claveArea, periodo);
  const a = area(claveArea);
  const reporte = reporteDe(reportes, claveArea, periodo);
  const entregado = estaEntregado(reporte?.estado ?? 'no_iniciado');
  const revision = entregado ? revisionDe(claveArea, reporte) : null;

  return (
    <Mosaic className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-folder" title={a.nombre} subtitle={`Reporte de ${etiquetaPeriodo(periodo)}`}>
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <Button tone="ghost" size="sm" icon="sh-inbox" onClick={onVolver}>
            {oficina ? 'Volver a lo recibido' : 'Volver a la bandeja'}
          </Button>
          {onEliminar && (
            <Button tone="danger" size="sm" icon="sh-trash" onClick={onEliminar}>
              Eliminar reporte del mes
            </Button>
          )}
          <EstadoPeriodo reporte={reporte} periodo={periodo} claveArea={claveArea} />
        </div>
      </Card>

      {!entregado ? (
        <Card accent="var(--warning)" icon="sh-none" title="Sin reporte recibido">
          <EmptyState
            icon={a.icono}
            tone="var(--warning)"
            title={`${a.nombreCorto} todavía no envía el reporte de ${etiquetaPeriodo(periodo)}`}
            body={
              estaVencido(periodo, hoy, fechaLimiteReal)
                ? `El plazo venció el ${fechaCorta(plazoEfectivo(periodo, fechaLimiteReal))}, hace ${diasDeRetraso(periodo, hoy, fechaLimiteReal)} días.${reporte ? ' El área lo tiene a medio llenar.' : ''}`
                : `El plazo vence el ${fechaCorta(plazoEfectivo(periodo, fechaLimiteReal))}.`
            }
          />
        </Card>
      ) : (
        <div className="hrl-visor">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            {formularioDe(claveArea) ? (
              <FormatosEnviados key={reporte.id} reporte={reporte} claveArea={claveArea} />
            ) : (
              <ReporteGenerico claveArea={claveArea} datos={reporte.datos} />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            <Validaciones revision={revision} />
            <ADondeVa claveArea={claveArea} reporte={reporte} />
            <Card accent="var(--primary)" icon="sh-clock" title="Recorrido">
              <div style={{ padding: '14px 20px 18px' }}>
                <Timeline
                  title="Pasos del reporte"
                  empty="Sin pasos registrados."
                  items={(reporte.historial ?? []).map((h, i) => ({
                    key: `${h.accion}-${i}`,
                    date: fechaCorta(h.fecha),
                    title: etiquetaDeEstado(h.estado),
                    detail: h.actor,
                    mark: h.fecha.slice(11, 16),
                  }))}
                />
              </div>
            </Card>
          </div>
        </div>
      )}
    </Mosaic>
  );
}
