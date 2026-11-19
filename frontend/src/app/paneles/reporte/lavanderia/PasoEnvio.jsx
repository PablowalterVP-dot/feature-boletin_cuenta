/* Paso 3 de Lavandería: qué se envía y a quién.

   Como en las otras ocho áreas: Estadística y las oficinas de su matriz
   (`app/datos/areas.js`) lo reciben en el mismo momento, ya validado por el
   bot. Estadística no vuelve a validarlo (12/10/2026).

   El resumen que el área puede comprobar contra su Excel es el consolidado
   por grupo, que es también lo que alimenta el Consolidado de DIRESA
   (sección D, kilos de ropa lavada). */

import { useState } from 'react';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { Alert, Button, Card, Checkbox, DataTable, Dialog, Field, Grid, Stack } from '@hrl/core-ui';
import { area } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { GRUPOS } from '@/app/datos/formatos/lavanderia.js';
import { casillasLlenas, kilosDelGrupo, piezasDelGrupo, totalF1, totalesF3, totalPiezas, totalConfeccionado } from '@/app/datos/formatos/lavanderia-calculos.js';
import { Destino, kb } from '../nutricion/PasoEnvio.jsx';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { usePlazo } from '@/app/datos/store.js';
import { numero, fechaCorta, fechaHora, SIN_DATOS } from '@/app/dominio/formato.js';

const CLAVE = 'lavanderia';
const valor = (v, unidad) => (v == null ? <span style={{ color: 'var(--subtle-foreground)' }}>{SIN_DATOS}</span> : <strong className="hrl-mono">{numero(v)}{unidad ? ` ${unidad}` : ''}</strong>);

export default function PasoEnvio({ datos, periodo, carga, informe, listo, motivoNoListo, onIrA, onEnviar }) {
  const [confirmado, setConfirmado] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  usePublicarGuia('envio', { listo, confirmado, preguntando });
  const plazo = usePlazo(periodo);
  const nAvisos = informe?.avisos?.length ?? 0;
  const destinos = area(CLAVE).destinos ?? [];

  const columnas = [
    { key: 'nombre', label: 'Grupo' },
    { key: 'kilos', label: 'Kilos', align: 'right', width: 110, tooltip: 'Suma del Formato 1 agrupada, calculada por el sistema.', render: (g) => valor(kilosDelGrupo(datos?.f1 ?? {}, g.clave, periodo), 'kg') },
    { key: 'piezas', label: 'Piezas', align: 'right', width: 110, render: (g) => valor(piezasDelGrupo(datos?.f4 ?? {}, g.clave)) },
  ];

  const f3 = totalesF3(datos?.f3 ?? {}, periodo);

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
                `Los cuatro cuadros del Excel (${casillasLlenas(datos, periodo).toLocaleString('es-PE')} casillas de kilos por servicio)`,
                carga ? `El Excel original «${carga.archivo.nombre}»` : 'Las cifras del reporte',
                nAvisos ? `${nAvisos} ${nAvisos === 1 ? 'justificación' : 'justificaciones'} de alertas` : 'El informe del bot, sin alertas',
              ]}
              para="Llevar los kilos por servicio al consolidado de servicios intermedios que se remite a DIRESA (sección D)."
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
                para="Está en la matriz de destinos de Lavandería."
              />
            ))}
          </Grid>
        </div>
      </Card>

      <Card accent="var(--info)" icon="sh-table" title="Consolidado por grupo" subtitle={`${etiquetaPeriodo(periodo)} · kilos calculados del Formato 1, piezas digitadas`} flush>
        <DataTable columns={columnas} rows={GRUPOS} rowKey={(g) => g.clave} />
      </Card>

      <Card accent="var(--info)" icon="sh-bill" title="Otras cifras del mes" subtitle="Para comprobar contra su Excel antes de enviar">
        <div className="hrl-campos hrl-cuerpo">
          <Field k="Total de kilos (Formato 1)" v={numero(totalF1(datos?.f1 ?? {}, periodo) ?? 0)} mono />
          <Field k="Ropa sucia (Formato 3)" v={`${numero(f3.kgTotal ?? 0)} kg · S/ ${numero(f3.importeTotal ?? 0, 2)}`} mono />
          <Field k="Piezas del consolidado (Formato 4)" v={numero(totalPiezas(datos?.f4 ?? {}) ?? 0)} mono />
          <Field k="Confeccionado (Formato 2)" v={numero(totalConfeccionado(datos?.f2 ?? []) ?? 0)} mono />
        </div>
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
              label={`Confirmo que estas cifras corresponden al registro del Área de Costura y Lavandería de ${etiquetaPeriodo(periodo).toLowerCase()}.`}
            />
          </div>
          <Stack direction="row" gap={3} justify="between" align="center" wrap>
            <Button data-guia="volver-revision" tone="ghost" icon="sh-table" onClick={() => onIrA('revision')}>
              Volver a la revisión
            </Button>
            <Button data-guia="enviar" icon="sh-send" disabled={!confirmado} onClick={() => setPreguntando(true)} style={{ minHeight: 'var(--touch-target-lg)' }}>
              Enviar a Estadística{destinos.length ? ` y ${destinos.map(nombreOficina).join(', ')}` : ''}
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
            {destinos.length > 0 && <li>{destinos.map(nombreOficina).join(', ')} lo recibe en el mismo momento.</li>}
            <li>El reporte deja de ser editable. Si después hay que corregirlo, solo Estadística puede reabrirlo (rectificación).</li>
          </ul>
        </Dialog>
      )}
    </Stack>
  );
}
