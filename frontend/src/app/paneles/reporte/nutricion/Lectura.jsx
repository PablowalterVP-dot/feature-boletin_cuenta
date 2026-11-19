/* Lo primero del paso 2: qué pasó con el Excel y qué falta, dicho por la
   mascota del bot en una frase.

   Reemplaza a la cabecera técnica del bot (versión, reglas aplicadas, dónde
   corrió), que no le servía al personal del área. El recorrido que tiene que
   quedar claro es: subí el archivo → el bot lo leyó y llenó las cifras de
   abajo → reviso con Dr. Mochi lo marcado (corrijo, o confirmo una alerta que
   es real) → envío.

   El estado no se dice solo con la mascota: el título lo escribe.

   Con `onCorregir` (Nutrición y Laboratorio) el mismo mensaje invita a corregir con Dr.
   Mochi y trae su botón: un solo aviso, no dos seguidos diciendo lo mismo. */

import { Button, Tooltip } from '@hrl/core-ui';
import { usePublicarGuia } from '@/app/guia/senales.js';
import Mascota from '../../Mascota.jsx';

function mensaje({ revisando, vacio, archivo, errores, pendientes, listo, corregible, documento }) {
  const deDonde = archivo ? `Leí «${archivo}» y llené con él las cifras de abajo.` : 'Las cifras de abajo son las que se digitaron.';
  if (revisando) return { estado: 'pensando', titulo: 'Estoy revisando las cifras…', detalle: 'Toma un instante. A Estadística llega exactamente lo que revisé.' };
  if (vacio) return { estado: 'reposo', titulo: 'Todavía no hay cifras', detalle: `Suba el ${documento} del mes o digite las cifras en los cuadros de abajo.` };
  if (errores)
    return {
      estado: 'problema',
      titulo: `Encontré ${errores} ${errores === 1 ? 'cosa' : 'cosas'} por corregir`,
      detalle: corregible
        ? `${deDonde} Lo marcado en rojo impide enviar. Le muestro cada error en su hoja, qué no cuadra y cómo arreglarlo; usted elige el arreglo y, al finalizar, lo corregido pasa al reporte, sin subir otro archivo. También puede corregir el ${documento} por su cuenta y subirlo otra vez.`
        : `${deDonde} Lo marcado en rojo impide enviar: corríjalo y vuelvo a revisar.`,
    };
  if (pendientes)
    return {
      estado: 'reposo',
      titulo: `Todo cuadra; ${pendientes === 1 ? 'queda una alerta por revisar' : `quedan ${pendientes} alertas por revisar`}`,
      detalle: corregible
        ? `${deDonde} Una alerta es una cifra rara pero posible. Revísela con Dr. Mochi: corríjala si es un error o confirme que es correcta.`
        : `${deDonde} Una alerta es una cifra rara pero posible: corríjala en los cuadros si es un error, o confírmela en la lista de abajo.`,
    };
  if (listo) return { estado: 'listo', titulo: 'Todo cuadra: su reporte está listo para enviar', detalle: `${deDonde} Revisarlas es opcional.` };
  return { estado: 'reposo', titulo: 'Revise las cifras', detalle: deDonde };
}

export default function Lectura({ revisando, vacio, archivo, errores, pendientes, listo, onEnviar, onCorregir, documento = 'Excel' }) {
  /* Dr. Mochi resuelve los errores y también las alertas (las confirma). */
  const corregible = Boolean(onCorregir) && Boolean(errores || pendientes) && !revisando;
  usePublicarGuia('revision', { revisando, vacio, errores, pendientes, listo });
  const m = mensaje({ revisando, vacio, archivo, errores, pendientes, listo, corregible, documento });

  return (
    <div className={`hrl-lectura hrl-lectura--${m.estado}`} role="status" aria-live="polite">
      <Mascota estado={m.estado} tamano="md" />
      <div className="hrl-lectura__texto">
        <strong className="hrl-lectura__titulo">{m.titulo}</strong>
        <span className="hrl-lectura__detalle">{m.detalle}</span>
      </div>
      {corregible && (
        <Tooltip
          title={errores ? 'Corregir con Dr. Mochi' : 'Revisar las alertas con Dr. Mochi'}
          body="Abre la revisión guiada: Dr. Mochi le muestra cada error en su hoja, le pregunta qué cifra está mal y le propone el arreglo. Los errores se corrigen; las alertas se corrigen o se confirman. Nada cambia en el reporte hasta que finalice."
          focusable={false}
        >
          <Button data-guia="corregir" icon="sh-wrench" onClick={onCorregir} style={{ minHeight: 'var(--touch-target-lg)' }}>
            {errores ? 'Corregir con Dr. Mochi' : 'Revisar con Dr. Mochi'}
          </Button>
        </Tooltip>
      )}
      {listo && !revisando && (
        <Button data-guia="continuar-envio" icon="sh-send" onClick={onEnviar} style={{ minHeight: 'var(--touch-target-lg)' }}>
          Continuar al envío
        </Button>
      )}
    </div>
  );
}
