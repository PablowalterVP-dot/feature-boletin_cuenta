/* Paso 3 de las áreas que suben un Word: qué se envía y a quién.

   El mismo envío que las áreas con Excel. Estadística y las oficinas de su matriz
   (`app/datos/areas.js`) lo reciben a la vez, ya validado por el bot. Lo que se
   comprueba antes de enviar es una fila por formato, con lo que dice el suyo. */

import { useState } from 'react';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { Alert, Button, Card, Checkbox, DataTable, Dialog, Field, Grid, Stack } from '@hrl/core-ui';
import { area } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { formularioDe, pasosDe } from '@/app/datos/formatos/levantados.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { usePlazo } from '@/app/datos/store.js';
import { fechaCorta, fechaHora } from '@/app/dominio/formato.js';
import { Destino, kb } from './nutricion/PasoEnvio.jsx';

export default function PasoEnvioWord({ claveArea, datos, periodo, carga, informe, listo, motivoNoListo, para, onIrA, onEnviar }) {
  const [confirmado, setConfirmado] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  usePublicarGuia('envio', { listo, confirmado, preguntando });
  const plazo = usePlazo(periodo, claveArea);
  const formulario = formularioDe(claveArea);
  const nAvisos = informe?.avisos?.length ?? 0;
  const destinos = area(claveArea).destinos ?? [];
  const textoDestinos = destinos.map(nombreOficina).join(', ');

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

  const n = formulario.formatos.length;
  const filas = pasosDe(claveArea, datos, periodo, formulario.validar(datos, periodo));
  const columnas = [
    { key: 'title', label: 'Formato' },
    { key: 'note', label: 'Qué lleva', tooltip: 'Lo que el sistema leyó en cada formato, para comprobarlo contra su Word.' },
  ];

  return (
    <Stack gap={5}>
      <Card accent="var(--primary)" icon="sh-share" title="A quién llega" subtitle="Usted envía una sola vez; el sistema lo entrega a la vez a cada oficina">
        <div data-guia="envio-destinos" className="hrl-cuerpo">
          <Grid min={300} gap={4}>
            <Destino
              icono="sh-inbox"
              nombre="Oficina de Estadística"
              rol="Recibe y consolida"
              cuando="Ahora · validado por el bot"
              marca="ok"
              recibe={[
                n === 1 ? 'El formato del mes' : `Los ${n} formatos del mes`,
                carga?.archivo?.nombre ? `El Word original «${carga.archivo.nombre}»` : 'Las cifras del reporte',
                nAvisos ? `${nAvisos} ${nAvisos === 1 ? 'justificación' : 'justificaciones'} de alertas` : 'El informe del bot, sin alertas',
              ]}
              para={para}
            />
            {destinos.map((o) => (
              <Destino
                key={o}
                icono="sh-chart"
                nombre={`Oficina de ${nombreOficina(o)}`}
                rol="Recibe en el mismo momento que Estadística"
                cuando="Ahora · validado por el bot"
                marca="ok"
                recibe={['El reporte completo, en solo lectura']}
                para={`Está en la matriz de destinos de ${formulario.nombre}.`}
              />
            ))}
          </Grid>
        </div>
      </Card>

      <Card accent="var(--info)" icon="sh-table" title={n === 1 ? 'Lo que se envía' : 'Lo que lleva cada formato'} subtitle={`${etiquetaPeriodo(periodo)} · para comprobar contra su Word antes de enviar`} flush>
        <DataTable columns={columnas} rows={filas} rowKey={(f) => f.key} />
      </Card>

      {carga?.archivo && (
        <Card accent="var(--primary)" icon="sh-folder" title="Archivo adjunto" subtitle="Se guarda tal como se subió, como respaldo de lo leído">
          <div className="hrl-campos" style={{ padding: 'var(--space-5)' }}>
            <Field k="Archivo" v={carga.archivo.nombre} />
            {carga.archivo.tamano != null && <Field k="Tamaño" v={kb(carga.archivo.tamano)} />}
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
            <Checkbox checked={confirmado} onChange={setConfirmado} label={`Confirmo que estas cifras corresponden al registro de ${formulario.nombre} de ${etiquetaPeriodo(periodo).toLowerCase()}.`} />
          </div>
          <Stack direction="row" gap={3} justify="between" align="center" wrap>
            <Button data-guia="volver-revision" tone="ghost" icon="sh-table" onClick={() => onIrA('revision')}>
              Volver a la revisión
            </Button>
            <Button data-guia="enviar" icon="sh-send" disabled={!confirmado} onClick={() => setPreguntando(true)} style={{ minHeight: 'var(--touch-target-lg)' }}>
              Enviar a Estadística{destinos.length ? ` y ${textoDestinos}` : ''}
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
            {destinos.length > 0 && <li>{textoDestinos} lo recibe en el mismo momento.</li>}
            <li>El reporte deja de ser editable. Si después hay que corregirlo, solo Estadística puede reabrirlo (rectificación).</li>
          </ul>
        </Dialog>
      )}
    </Stack>
  );
}
