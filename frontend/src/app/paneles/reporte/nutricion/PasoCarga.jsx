/* Paso 1: subir el archivo del mes.

   Tres caminos, en orden de uso esperado: subir el Excel del mes que el área
   ya llena (el bot lo lee tal cual: sus cuatro hojas, por los rótulos de cada
   fila), descargar el mismo formato en blanco si no lo tiene a mano, o
   digitar en la hoja si no tiene Excel.
   Los ejemplos existen solo para la demostración y lo dicen.

   Lo comparten las nueve áreas. Lo que cambia de una a otra —qué dice, qué
   formato descarga, qué ejemplos ofrece, si es un Excel o un Word (`config.tipo`)—
   llega en `config`; sin él, es el de Nutrición.

   Mientras el bot trabaja, la mascota «piensa» y va diciendo qué hace: un
   botón que se queda pensando sin decir qué hace parece colgado. */

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Icon, Stack, Tooltip } from '@hrl/core-ui';
import { ETAPAS_BOT, nombreDeArchivo } from '@/app/servicios/bot-validador.js';
import * as ejemplosNutricion from '@/app/servicios/ejemplos-nutricion.js';
import { enPractica } from '@/app/servicios/practica.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { fechaHora } from '@/app/dominio/formato.js';
import { usePublicarGuia } from '@/app/guia/senales.js';
import Mascota from '../../Mascota.jsx';

const TAMANO_MAXIMO = 5 * 1024 * 1024;

const EXCEL = Object.freeze({
  documento: 'Excel',
  extension: 'xlsx',
  accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  formatoAntiguo: /\.xls$/i,
  mensajeAntiguo: 'Es el formato antiguo de Excel. Ábralo y guárdelo como «Libro de Excel (.xlsx)».',
  noLeible: 'El bot lee el Excel del mes. Un PDF o una foto del oficio no se pueden leer todavía.',
  pesoTipico: 'El Excel del mes pesa menos de 100 kB.',
});

/* Lo que va diciendo la mascota mientras espera. Son frases de espera, no un
   informe: lo que de verdad hizo el bot lo dice la revisión al terminar. Por
   eso rotan solas y no se anuncian al lector de pantalla (ver `Espera`). */
export const CONFIG_NUTRICION = Object.freeze({
  subtitulo: 'El mismo Excel que llena cada mes, con sus cuatro hojas: el bot lo lee tal cual',
  frases: [
    'Abriendo su Excel…',
    'Contando las raciones día por día…',
    'Revisando que los totales cuadren…',
    'Buscando casillas vacías o con letras…',
    'Comparando con el mes anterior…',
    'Ya casi termino…',
  ],
  instrucciones: [
    'Descargue el formato del mes: las cuatro hojas de siempre (comensales y pacientes, hospitalización y emergencia), en blanco.',
    'Llénelo o pegue en él las cifras. Un día sin servicio lleva 0. No cambie los rótulos de grupo ni de comida.',
    'Súbalo aquí. El bot lo lee y le muestra lo leído antes de enviar nada.',
  ],
  nombreDeArchivo,
  ayudaFormato: (mes) => `Formato oficial en blanco de ${mes}. Es distinto cada mes porque cambia el número de días.`,
  descargarPlantilla: ejemplosNutricion.descargarPlantilla,
  ejemploCorrecto: ejemplosNutricion.ejemploCorrecto,
  ejemploConErrores: ejemplosNutricion.ejemploConErrores,
  ayudaErrores: 'Trae una casilla con letras, un día en blanco, un total tecleado encima de la fórmula y un día con raciones disparadas.',
});
const CADA = 2200;

/* En modo real no hay etapas que observar: una sola llamada al backend, que a
   su vez le habla al bot. `etapa` llega como 'enviando', ajeno a ETAPAS_BOT, y
   solo se ven las frases. Con el bot embebido o como servicio, además, la
   lista de etapas reales debajo. */
function Espera({ etapa, archivo, frases }) {
  const [frase, setFrase] = useState(0);
  const actual = ETAPAS_BOT.findIndex((e) => e.id === etapa);

  useEffect(() => {
    const t = setInterval(() => setFrase((f) => Math.min(f + 1, frases.length - 1)), CADA);
    return () => clearInterval(t);
  }, [frases]);

  return (
    <div className="hrl-espera">
      <Mascota estado="pensando" tamano="lg" />
      {/* Lo único que se anuncia: qué archivo y que se está trabajando. */}
      <p className="hrl-espera__estado" role="status" aria-live="polite">
        {actual === -1 ? `Guardando «${archivo}» en el sistema` : `El bot está leyendo «${archivo}»`}
      </p>
      <p className="hrl-espera__frase" key={frase} aria-hidden="true">
        {frases[frase]}
      </p>
      {actual !== -1 && (
        <ol className="hrl-carga__etapas hrl-espera__etapas">
          {ETAPAS_BOT.map((e, i) => (
            <li key={e.id} className={i < actual ? 'hrl-carga__etapa--hecha' : i === actual ? 'hrl-carga__etapa--actual' : undefined}>
              <Icon name={i < actual ? 'sh-ok' : i === actual ? 'sh-clock' : 'sh-none'} size={16} />
              {e.texto}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* `onCargarEnOtroMes`: con el bloqueo de un archivo de otro mes que todavía se
   puede cargar (`bloqueo.otroMes`, de CargaDeMeses.jsx), lo carga allí. */
export default function PasoCarga({ periodo, carga, tieneDatos, procesando, etapa, bloqueo, onArchivo, onDigitar, onVolver, onCargarEnOtroMes, config = CONFIG_NUTRICION }) {
  const entrada = useRef(null);
  const [encima, setEncima] = useState(false);
  const [rechazo, setRechazo] = useState(null);
  const mes = etiquetaPeriodo(periodo).toLowerCase();
  const tipo = { ...EXCEL, ...config.tipo };

  const recibir = (archivo) => {
    setRechazo(null);
    if (!archivo) return;
    const extensiones = tipo.extensiones ?? [tipo.extension];
    if (!extensiones.some((e) => archivo.name.toLowerCase().endsWith(`.${e}`))) {
      setRechazo({
        titulo: `«${archivo.name}» no es un archivo ${extensiones.map((e) => `.${e}`).join(' ni ')}`,
        detalle: tipo.formatoAntiguo.test(archivo.name) ? tipo.mensajeAntiguo : tipo.noLeible,
      });
      return;
    }
    if (archivo.size > TAMANO_MAXIMO) {
      setRechazo({ titulo: 'El archivo pesa más de 5 MB', detalle: `${tipo.pesoTipico} Revise que sea el archivo correcto.` });
      return;
    }
    onArchivo(archivo);
  };

  const problema = rechazo ?? bloqueo?.bloqueo;
  usePublicarGuia('carga', { procesando: Boolean(procesando), conDatos: Boolean(tieneDatos && onVolver), problema: problema ? { titulo: problema.titulo, detalle: problema.detalle } : null });

  return (
    <div className="hrl-carga">
      <Card accent="var(--primary)" icon="sh-upload" title={`Suba el ${tipo.documento} de ${mes}`} subtitle={config.subtitulo}>
        <Stack gap={4} className="hrl-cuerpo">
          {procesando ? (
            <Espera etapa={etapa} archivo={procesando} frases={config.frases} />
          ) : (
            <div
              data-guia="carga-zona"
              className={`hrl-carga__zona${encima ? ' hrl-carga__zona--encima' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setEncima(true);
              }}
              onDragLeave={() => setEncima(false)}
              onDrop={(e) => {
                e.preventDefault();
                setEncima(false);
                recibir(e.dataTransfer.files?.[0]);
              }}
            >
              <Tooltip title="El bot validador" body={config.bot ?? `Lee su ${tipo.documento}, revisa que las cifras cuadren y le muestra lo leído antes de enviar nada a Estadística.`} focusable={false}>
                <Mascota estado={encima ? 'pensando' : 'reposo'} tamano="lg" />
              </Tooltip>
              <strong style={{ fontSize: 'var(--text-md)' }}>Arrastre aquí el archivo y lo reviso</strong>
              <span style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-sm)' }}>o</span>
              <Button data-guia="elegir-archivo" icon="sh-folder" onClick={() => entrada.current?.click()} style={{ minHeight: 'var(--touch-target-lg)' }}>
                Elegir archivo
              </Button>
              <span style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-sm)' }}>Solo {(tipo.extensiones ?? [tipo.extension]).map((e) => `.${e}`).join(' o ')} · hasta 5 MB</span>
              <input
                ref={entrada}
                type="file"
                accept={tipo.accept}
                hidden
                onChange={(e) => {
                  recibir(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          )}

          {problema && !procesando && (
            <Alert
              tone="error"
              title={problema.titulo}
              action={
                !rechazo && bloqueo?.otroMes && !bloqueo.otroMes.entregado && onCargarEnOtroMes ? (
                  <Tooltip
                    title={`Cargar en ${etiquetaPeriodo(bloqueo.otroMes.periodo).toLowerCase()}`}
                    body={bloqueo.otroMes.conCifras ? 'Ese mes ya tiene cifras: las de este Excel las reemplazan si el bot lo acepta.' : 'Abre ese mes y carga este Excel allí, por el bot como cualquier carga.'}
                    focusable={false}
                  >
                    <Button tone={bloqueo.otroMes.conCifras ? 'danger' : 'cta'} size="sm" icon="sh-upload" onClick={() => onCargarEnOtroMes(bloqueo.otroMes.periodo)}>
                      {`Cargarlo en ${etiquetaPeriodo(bloqueo.otroMes.periodo).toLowerCase()}${bloqueo.otroMes.conCifras ? ' y reemplazar' : ''}`}
                    </Button>
                  </Tooltip>
                ) : (
                  (bloqueo?.bloqueo?.id ?? '').startsWith('plantilla') && (
                    <Button tone="ghost" size="sm" icon="sh-export" onClick={() => config.descargarPlantilla(periodo)}>
                      Descargar el formato de {mes}
                    </Button>
                  )
                )
              }
            >
              {problema.detalle}
              {!rechazo && bloqueo?.otroMes?.entregado && ` ${etiquetaPeriodo(bloqueo.otroMes.periodo)} ya se entregó: para cambiarlo, Estadística debe reabrirlo.`}
            </Alert>
          )}

          {carga && !procesando && (
            <Alert tone="info" title="Este reporte ya tiene un archivo cargado">
              «{carga.archivo.nombre}», subido el {fechaHora(carga.fecha)}. Si sube otro, el sistema le preguntará antes de
              reemplazar lo cargado.
            </Alert>
          )}
          {!carga && tieneDatos && !procesando && (
            <Alert tone="info" title="Este reporte ya tiene cifras digitadas en la hoja">
              Si sube un archivo, el sistema le preguntará antes de reemplazarlas.
            </Alert>
          )}
          {/* Los pasos de arriba ya no se pulsan: sin esto, quien vino a mirar
              si había otro archivo no tendría cómo volver sin subir nada. */}
          {tieneDatos && onVolver && !procesando && (
            <Button data-guia="volver-sin-subir" tone="ghost" icon="sh-table" onClick={onVolver} style={{ alignSelf: 'flex-start' }}>
              Volver a la revisión sin subir nada
            </Button>
          )}
        </Stack>
      </Card>

      <Stack gap={5}>
        <Card accent="var(--info)" icon="sh-export" title={`¿No tiene el ${tipo.documento} a mano?`}>
          <Stack gap={3} className="hrl-cuerpo">
            <ol className="hrl-carga__pasos">
              {config.instrucciones.map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ol>
            <Tooltip title={config.nombreDeArchivo(periodo)} body={config.ayudaFormato(mes)} focusable={false}>
              <Button tone="blue" icon="sh-export" onClick={() => config.descargarPlantilla(periodo)}>
                Descargar el formato de {mes}
              </Button>
            </Tooltip>
            {/* Sin `onDigitar` (con backend) no se ofrece: esas cifras no llegarían al backend. */}
            {onDigitar && (
              <Button tone="ghost" icon="sh-table" onClick={onDigitar} disabled={Boolean(procesando)}>
                No tengo el {tipo.documento}: digitar en la hoja
              </Button>
            )}
          </Stack>
        </Card>

        {/* `onDigitar` falta con el servidor. Ahí un ejemplo cargaría cifras ficticias
            en el mes real del área: solo se ofrece sin servidor o en la práctica. */}
        {(onDigitar || enPractica()) && (
        <Card accent="var(--warning)" icon="sh-flask" title="Probar sin archivo" subtitle="Solo para practicar">
          <Stack gap={3} className="hrl-cuerpo">
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)', lineHeight: 'var(--leading-normal)' }}>
              {tipo.documento} de {mes} con cifras ficticias. Pasan por el mismo lector y el mismo bot que un archivo real.
            </p>
            <Button data-guia="ejemplo-correcto" tone="ghost" icon="sh-ok" disabled={Boolean(procesando)} onClick={() => onArchivo(config.ejemploCorrecto(periodo))}>
              Ejemplo correcto
            </Button>
            <Tooltip
              title="Ejemplo con errores"
              body={config.ayudaErrores}
              focusable={false}
            >
              <Button data-guia="ejemplo-errores" tone="ghost" icon="sh-warn" disabled={Boolean(procesando)} onClick={() => onArchivo(config.ejemploConErrores(periodo))}>
                Ejemplo con errores
              </Button>
            </Tooltip>
          </Stack>
        </Card>
        )}
      </Stack>
    </div>
  );
}
