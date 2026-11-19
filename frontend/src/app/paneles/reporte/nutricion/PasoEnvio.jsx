/* Paso 4: qué se envía y a quién.

   Antes de un envío que no se puede deshacer, el área ve exactamente qué
   recibe cada oficina y para qué. Todas lo reciben en el mismo momento y ya
   validado por el bot: Estadística no vuelve a validarlo (12/10/2026).

   Qué usa Planeamiento está por confirmar al revisar CPlan: por eso sus dos
   cifras llevan esa marca y no se presentan como un hecho. */

import { useState } from 'react';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { Alert, Badge, Button, Card, Checkbox, DataTable, Dialog, Field, Grid, Icon, Stack, Tooltip } from '@hrl/core-ui';
import { destinosDe } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { cifrasNutricion, casillasLlenas } from '@/app/datos/formatos/nutricion-calculos.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { usePlazo } from '@/app/datos/store.js';
import { numero, fechaCorta, fechaHora, SIN_DATOS } from '@/app/dominio/formato.js';

const valor = (v) => (v == null ? <span style={{ color: 'var(--subtle-foreground)' }}>{SIN_DATOS}</span> : <strong className="hrl-mono">{numero(v)}</strong>);

/* También lo usa el envío de Laboratorio. */
export function Destino({ icono, nombre, rol, cuando, recibe, para, marca }) {
  return (
    <div className="hrl-destino">
      <Stack direction="row" gap={3} align="center">
        <span className="hrl-destino__icono">
          <Icon name={icono} size={20} />
        </span>
        <Stack gap={1} style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 'var(--text-md)' }}>{nombre}</strong>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{rol}</span>
        </Stack>
      </Stack>
      <Badge label={cuando} tone={marca} />
      <div>
        <span className="hrl-destino__rotulo">Recibe</span>
        <ul className="hrl-destino__lista">
          {recibe.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      <div>
        <span className="hrl-destino__rotulo">Para qué</span>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)' }}>{para}</p>
      </div>
    </div>
  );
}

export function kb(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-PE')} kB`;
}

export default function PasoEnvio({ datos, periodo, carga, informe, listo, motivoNoListo, onIrA, onEnviar }) {
  const [confirmado, setConfirmado] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  usePublicarGuia('envio', { listo, confirmado, preguntando });
  const plazo = usePlazo(periodo);
  const c = cifrasNutricion(datos, periodo);
  const nAvisos = informe?.avisos?.length ?? 0;
  const oficinas = destinosDe('nutricion').filter((d) => d !== 'estadistica');

  const cifras = [
    { clave: 'ch', cifra: 'Raciones a comensales · hospitalización', valor: c.comensalesHosp, sale: 'Cuadro 1', va: ['Estadística: DIRESA, «para personal», hosp.', 'Boletín'] },
    { clave: 'ce', cifra: 'Raciones a comensales · emergencia', valor: c.comensalesEmerg, sale: 'Cuadro 2', va: ['Estadística: DIRESA, «para personal», emerg.', 'Boletín'] },
    { clave: 'ph', cifra: 'Raciones a pacientes · hospitalización', valor: c.pacientesHosp, sale: 'Cuadro 3', va: ['Estadística: DIRESA, «para pacientes», hosp.', 'Boletín'] },
    { clave: 'pe', cifra: 'Raciones a pacientes · emergencia', valor: c.pacientesEmerg, sale: 'Cuadro 4', va: ['Estadística: DIRESA, «para pacientes», emerg.', 'Boletín'] },
    { clave: 'tc', cifra: 'Total de raciones a comensales', valor: c.comensales, sale: 'Cuadros 1 + 2', va: ['Planeamiento: CPlan (por confirmar)'], total: true },
    { clave: 'tp', cifra: 'Total de raciones a pacientes', valor: c.pacientes, sale: 'Cuadros 3 + 4', va: ['Planeamiento: CPlan (por confirmar)'], total: true },
    {
      clave: 'cx',
      cifra: 'Consultorio externo',
      valor: null,
      sale: 'No está en el oficio',
      va: ['DIRESA recibe la columna vacía, no en cero'],
      nota: 'Estadística registraba un total de consultorio externo, pero el oficio no lo trae. Está por aclarar de dónde sale.',
    },
  ];

  const columnas = [
    {
      key: 'cifra',
      label: 'Cifra',
      render: (r) =>
        r.nota ? (
          <Tooltip title={r.cifra} body={r.nota}>
            <span>{r.cifra}</span>
          </Tooltip>
        ) : r.total ? (
          <strong>{r.cifra}</strong>
        ) : (
          r.cifra
        ),
    },
    { key: 'valor', label: 'Raciones', align: 'right', width: 120, render: (r) => valor(r.valor) },
    { key: 'sale', label: 'Sale de', width: 150 },
    {
      key: 'va',
      label: 'Llega a',
      render: (r) => (
        <span className="hrl-chips-fila">
          {r.va.map((v) => (
            <span key={v} className="hrl-chip">
              {v}
            </span>
          ))}
        </span>
      ),
    },
  ];

  if (!listo) {
    return (
      <Card accent="var(--warning)" icon="sh-warn" title="Todavía no se puede enviar">
        <Stack gap={4} className="hrl-cuerpo">
          <Alert tone="warning" title={motivoNoListo.titulo}>
            {motivoNoListo.detalle}
          </Alert>
          <Button data-guia="envio-volver" icon="sh-shield" onClick={() => onIrA(motivoNoListo.paso)} style={{ alignSelf: 'flex-start' }}>
            {motivoNoListo.accion}
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap={5}>
      <Card accent="var(--primary)" icon="sh-share" title="A quién llega" subtitle="Usted envía una sola vez; el sistema entrega a cada oficina lo que necesita">
        <div data-guia="envio-destinos" className="hrl-cuerpo">
          <Grid min={300} gap={4}>
            <Destino
              icono="sh-inbox"
              nombre="Oficina de Estadística"
              rol="Recibe y consolida"
              cuando="Ahora · validado por el bot"
              marca="ok"
              recibe={[
                `Los cuatro cuadros completos, día por día (${casillasLlenas(datos, periodo).toLocaleString('es-PE')} casillas)`,
                carga ? `El Excel original «${carga.archivo.nombre}»` : 'Las cifras digitadas en la hoja',
                nAvisos ? `${nAvisos} ${nAvisos === 1 ? 'alerta revisada' : 'alertas revisadas'} con Dr. Mochi` : 'El informe del bot, sin alertas',
              ]}
              para="Llevar las raciones al consolidado de servicios intermedios que se remite a DIRESA (sección C) y publicarlas en el boletín mensual."
            />
            {oficinas.map((o) => (
              <Destino
                key={o}
                icono="sh-chart"
                nombre={`Oficina de ${nombreOficina(o)}`}
                rol="Recibe en el mismo momento que Estadística"
                cuando="Ahora · validado por el bot"
                marca="ok"
                recibe={['Total de raciones a pacientes', 'Total de raciones a comensales', 'El reporte completo, en solo lectura']}
                para="Registrar el avance del mes en CPlan (por confirmar al revisar CPlan)."
              />
            ))}
          </Grid>
        </div>
      </Card>

      <Card accent="var(--info)" icon="sh-table" title="Cifras que salen del reporte" subtitle={`${etiquetaPeriodo(periodo)} · calculadas de los cuadros, no digitadas aparte`} flush>
        <DataTable columns={columnas} rows={cifras} rowKey={(r) => r.clave} rowClass={(r) => (r.total ? 'hrl-fila--total' : undefined)} />
      </Card>

      {carga && (
        <Card accent="var(--primary)" icon="sh-folder" title="Archivo adjunto" subtitle="Se guarda tal como se subió, como respaldo de lo leído">
          <div className="hrl-campos" style={{ padding: 'var(--space-5)' }}>
            <Field k="Archivo" v={carga.archivo.nombre} />
            <Field k="Tamaño" v={kb(carga.archivo.tamano)} />
            <Field k="Subido el" v={fechaHora(carga.fecha)} />
            <Field k="Huella SHA-256" v={carga.archivo.huella ? `${carga.archivo.huella.slice(0, 16)}…` : null} mono />
          </div>
        </Card>
      )}

      <Card accent="var(--primary)" icon="sh-send" title="Confirmar y enviar">
        <Stack gap={4} className="hrl-cuerpo">
          {plazo.vencido && (
            <Alert tone="warning" title="El plazo de este periodo ya venció">
              Vencía el {fechaCorta(plazo.fecha)}, hace {plazo.retraso} días. Se recibe igual y la fecha queda en la constancia.
            </Alert>
          )}
          <div data-guia="envio-casilla">
            <Checkbox
              checked={confirmado}
              onChange={setConfirmado}
              label={`Confirmo que estas cifras corresponden al registro del Departamento de Nutrición y Dietética de ${etiquetaPeriodo(periodo).toLowerCase()}.`}
            />
          </div>
          <Stack direction="row" gap={3} justify="between" align="center" wrap>
            <Button data-guia="volver-revision" tone="ghost" icon="sh-table" onClick={() => onIrA('revision')}>
              Volver a la revisión
            </Button>
            <Button data-guia="enviar" icon="sh-send" disabled={!confirmado} onClick={() => setPreguntando(true)} style={{ minHeight: 'var(--touch-target-lg)' }}>
              Enviar a Estadística{oficinas.length ? ` y ${oficinas.map(nombreOficina).join(', ')}` : ''}
            </Button>
          </Stack>
        </Stack>
      </Card>

      {preguntando && (
        <Dialog
          title={`¿Enviar el reporte de ${etiquetaPeriodo(periodo).toLowerCase()}?`}
          subtitle="Esta acción no se puede deshacer desde el área"
          onClose={() => setPreguntando(false)}
          maxWidth={560}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button data-guia="cancelar-envio" tone="ghost" onClick={() => setPreguntando(false)}>
                Cancelar
              </Button>
              <Button
                data-guia="enviar-ahora"
                icon="sh-send"
                onClick={() => {
                  setPreguntando(false);
                  onEnviar();
                }}
              >
                Enviar ahora
              </Button>
            </Stack>
          }
        >
          <ul className="hrl-destino__lista" style={{ fontSize: 'var(--text-base)' }}>
            <li>Estadística lo recibe ahora mismo, ya validado por el bot. Se emite la constancia de entrega.</li>
            {oficinas.map((o) => (
              <li key={o}>{nombreOficina(o)} lo recibe en el mismo momento.</li>
            ))}
            <li>El reporte deja de ser editable. Si después hay que corregirlo, solo Estadística puede reabrirlo (rectificación), y las oficinas reciben un aviso.</li>
          </ul>
        </Dialog>
      )}
    </Stack>
  );
}
