/* Paso 3 de Gineco-Obstetricia: qué se envía y a quién.

   Va a Estadística y a Planeamiento, a la vez (areas.js, `destinos`). Además
   alimenta los indicadores 18 a 21 de DIRESA, pero eso lo arma Estadística con
   lo ya validado: no es una remisión adicional del área. */

import { useState } from 'react';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { Alert, Button, Card, Checkbox, DataTable, Dialog, Field, Grid, Stack } from '@hrl/core-ui';
import { area } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { EDADES, TIPOS_PARTO } from '@/app/datos/formatos/ginecologia.js';
import { totalCuadro } from '@/app/datos/formatos/ginecologia-calculos.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { usePlazo } from '@/app/datos/store.js';
import { numero, fechaCorta, fechaHora, SIN_DATOS } from '@/app/dominio/formato.js';
import { Destino, kb } from '../nutricion/PasoEnvio.jsx';

const CLAVE = 'ginecologia';
const cifra = (v) => (v == null ? <span style={{ color: 'var(--subtle-foreground)' }}>{SIN_DATOS}</span> : <strong className="hrl-mono">{numero(v)}</strong>);

export default function PasoEnvio({ datos, periodo, carga, informe, listo, motivoNoListo, onIrA, onEnviar }) {
  const [confirmado, setConfirmado] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  usePublicarGuia('envio', { listo, confirmado, preguntando });
  const plazo = usePlazo(periodo);
  const nAvisos = informe?.avisos?.length ?? 0;
  const destinos = area(CLAVE).destinos ?? [];
  const conF2 = Object.keys(datos?.f2 ?? {}).length > 0;

  const filas = [
    { id: 'f1', titulo: 'Controles prenatales (cuadro 1)', total: totalCuadro(datos, 'f1'), unidad: 'controles', filas: EDADES.length },
    { id: 'f2', titulo: 'Partos, cesáreas y nacidos (cuadro 2)', total: conF2 ? totalCuadro(datos, 'f2') : null, unidad: 'partos', filas: TIPOS_PARTO.length },
  ];
  const columnas = [
    { key: 'titulo', label: 'Cuadro' },
    { key: 'total', label: 'Total del cuadro', align: 'right', width: 160, tooltip: 'Suma de la columna principal en todas sus filas, calculada por el sistema.', render: (f) => cifra(f.total) },
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
                `Los dos cuadros (${EDADES.length + (conF2 ? TIPOS_PARTO.length : 0)} filas con dato)`,
                carga ? `El Excel original «${carga.archivo.nombre}»` : 'Las cifras del reporte',
                nAvisos ? `${nAvisos} ${nAvisos === 1 ? 'justificación' : 'justificaciones'} de alertas` : 'El informe del bot, sin alertas',
              ]}
              para="Llevarlo a los indicadores de gestión 18 a 21 de DIRESA (partos, cesáreas, nacidos vivos y muertes)."
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
                para="Está en la matriz de destinos de Gineco-Obstetricia."
              />
            ))}
          </Grid>
        </div>
      </Card>

      <Card accent="var(--info)" icon="sh-table" title="Total de cada cuadro" subtitle={`${etiquetaPeriodo(periodo)} · calculado de las filas, no del total escrito en el Excel`} flush>
        <DataTable columns={columnas} rows={filas} rowKey={(f) => f.id} />
        {!conF2 && (
          <div style={{ padding: '0 20px 16px' }}>
            <Alert tone="info" title="El cuadro 2 no llegó este mes">
              No es que no hubo partos: el área todavía no incluye este cuadro en su Excel. Queda vacío, no en cero.
            </Alert>
          </div>
        )}
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
              label={`Confirmo que estas cifras corresponden al registro del Departamento de Gineco-Obstetricia de ${etiquetaPeriodo(periodo).toLowerCase()}.`}
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
