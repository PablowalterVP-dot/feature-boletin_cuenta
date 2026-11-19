/* El aviso del momento, dicho por Dr. Mochi, bajo la cabecera de la página.

   Sale de lo mismo que calcula cabecera.js (el estado de cada módulo), pero no
   se muestra siempre: solo
     - en el Inicio de un área, donde está el aviso de su reporte del mes
       (pendiente, vence hoy, vencido o ya enviado), y
     - donde algo apremia (un estado con tono de aviso: plazos vencidos, la
       remisión a DIRESA atrasada, datos por digitar).
   El resto de los estados eran informativos y repetían lo que el panel ya
   dice debajo (cuántos reportes llegaron, cuántos se enviaron): se quitaron.
   Nunca en «Reporte del mes»: ahí se está haciendo justo lo que el aviso pide,
   y el panel ya muestra el estado y el plazo.

   Las acciones son las de cabecera.js, que solo llevan a pantallas que el rol
   tiene. Si el reporte del mes ya está empezado, la acción es continuarlo y no
   «Subir el Excel», que sonaba a empezar de cero. */
import { Button, MascotAlert, Tooltip } from '@hrl/core-ui';
import { ROL } from './dominio/roles.js';
import { reporteDe } from './datos/store.js';
import { estaEntregado } from './dominio/estados.js';
import { periodoVigente } from './dominio/periodos.js';

const TONO_DE_MOCHI = { done: 'success', thinking: 'warning', problem: 'danger', idle: 'info' };

/* «Reporte de septiembre 2026 · vence el sábado 10 (quedan 7 días)»: lo de
   antes del primer punto medio es el título; lo demás, el detalle. */
function partir(detalle = '') {
  const [titulo, ...resto] = detalle.split(' · ');
  const texto = resto.join(' · ');
  return { titulo, texto: texto ? texto[0].toUpperCase() + texto.slice(1) : '' };
}

/* El reporte del mes ya empezado: qué falta, en lugar de «súbalo». */
function enCurso(reportes, sesion, hoy) {
  const reporte = reporteDe(reportes, sesion.usuario.area, periodoVigente(hoy));
  if (!reporte || estaEntregado(reporte.estado)) return null;
  return reporte.carga
    ? `Se cargó «${reporte.carga.archivo?.nombre ?? 'el Excel'}». Revise lo que encontró el bot y envíelo.`
    : 'Ya empezó a llenarlo: termine las casillas que faltan y envíelo.';
}

export default function AvisoMochi({ banda, panelId, sesion, reportes, hoy, irA }) {
  if (!banda?.status || panelId === 'reporte') return null;
  const inicioDeArea = sesion.rolActivo === ROL.AREA && panelId === 'inicio';
  const apremia = banda.status.tone === 'warning';
  if (!inicioDeArea && !apremia) return null;

  const estado = banda.mascot ?? (apremia ? 'thinking' : 'idle');
  const tono = apremia && estado === 'idle' ? 'warning' : TONO_DE_MOCHI[estado];
  const { titulo, texto } = partir(banda.status.detail);
  const empezado = inicioDeArea ? enCurso(reportes, sesion, hoy) : null;

  let acciones = banda.acciones ?? [];
  if (empezado) {
    acciones = [{ texto: 'Continuar el reporte', icono: 'sh-pencil', tono: 'cta', ayuda: 'Vuelve al reporte del mes donde lo dejó.', ir: ['reporte'] }];
  }

  return (
    <MascotAlert
      state={estado}
      tone={tono}
      label={banda.status.label}
      icon={banda.status.icon}
      title={titulo || banda.status.label}
      actions={
        acciones.length
          ? acciones.map((a) => (
              <Tooltip key={a.texto} title={a.texto} body={a.ayuda} focusable={false}>
                <Button tone={a.tono} icon={a.icono} onClick={() => irA(...a.ir)}>
                  {a.texto}
                </Button>
              </Tooltip>
            ))
          : null
      }
    >
      {[texto, empezado].filter(Boolean).join('. ')}
    </MascotAlert>
  );
}
