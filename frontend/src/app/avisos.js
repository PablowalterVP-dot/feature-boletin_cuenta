/* Avisos del cajón de notificaciones, derivados del estado real.

   No hay una lista de avisos guardada: se calculan a partir de los reportes
   cada vez. Así no puede ocurrir el caso clásico de una notificación que
   sobrevive al hecho que la provocó —«su reporte está atrasado» cuando ya se
   envió— porque el aviso desaparece en cuanto la condición deja de ser
   cierta.

   Forma que espera el AppShell:
     { id, unread, icon, bg, color, title, body, meta } */

import { ROL } from './dominio/roles.js';
import { nombreArea } from './datos/areas.js';
import { areasDelFlujo } from './servicios/api.js';
import { PERIODOS } from './datos/reportes.js';
import { estadoDe, reporteDe, reportesRecibidosPor, plazoRealDe, alertasRealesDe } from './datos/store.js';
import { periodoVigente, etiquetaPeriodo, diasDeRetraso, estaVencido, plazoEfectivo } from './dominio/periodos.js';
import { estaEntregado } from './dominio/estados.js';
import { fechaCorta } from './dominio/formato.js';

const TONOS = {
  ok: { bg: 'var(--success-soft)', color: 'var(--success-text)' },
  info: { bg: 'var(--info-soft)', color: 'var(--info-fg)' },
  warn: { bg: 'var(--warning-soft)', color: 'var(--warning-fg)' },
  crit: { bg: 'var(--destructive-soft)', color: 'var(--destructive-text)' },
};

function aviso({ id, tono, icon, title, body, meta, unread = true }) {
  return { id, unread, icon, title, body, meta, ...TONOS[tono] };
}

/* Traduce una alerta del backend (`servicios/api.js::alertasDe`) a la forma
   que espera el AppShell. Hoy solo hay un nivel («aviso»); si el backend
   agrega otro que esta función no conoce, se descarta esa alerta —nunca se
   rompe el cajón de notificaciones entero por un nivel nuevo— y se avisa
   en la consola, igual que un botón que la pantalla no debió ofrecer. */
function avisoDeBackend(a) {
  if (a.nivel !== 'aviso') {
    if (import.meta.env?.DEV) console.warn(`avisos.js no sabe traducir el nivel «${a.nivel}» de la alerta «${a.clave}».`);
    return null;
  }
  return aviso({ id: a.clave, tono: 'warn', icon: 'sh-calendar', title: a.titulo, body: a.cuerpo });
}

function avisosDeArea(reportes, claveArea, vigente, hoy, plazosReales, alertasReales) {
  const lista = [];
  const reporte = reporteDe(reportes, claveArea, vigente);
  const estado = reporte?.estado ?? 'no_iniciado';
  const periodo = etiquetaPeriodo(vigente);
  const fechaLimiteReal = plazoRealDe(plazosReales, claveArea, vigente);
  const retraso = diasDeRetraso(vigente, hoy, fechaLimiteReal);

  if (!estaEntregado(estado) && estaVencido(vigente, hoy, fechaLimiteReal)) {
    lista.push(
      aviso({
        id: 'atraso',
        tono: 'warn',
        icon: 'sh-clock',
        title: `El reporte de ${periodo} está atrasado.`,
        body: `El plazo venció el ${fechaCorta(plazoEfectivo(vigente, fechaLimiteReal))}, hace ${retraso} días.`,
        meta: estado === 'borrador' ? 'Hay un borrador empezado sin enviar' : 'Todavía no se ha abierto',
      }),
    );
  }

  if (estado === 'remitido') {
    /* Con el servidor, el mes entra primero como resumen de la lista, sin su remisión: el
       detalle llega después (`api.sincronizarArea`). Leerla sin comprobarlo tumbaba toda la
       aplicación al volver a entrar, en cuanto un área había entregado el mes vigente. */
    const oficinas = reporte.remision?.destinos.length ?? 0;
    lista.push(
      aviso({
        id: 'remitido',
        tono: 'ok',
        icon: 'sh-share',
        title: `El reporte de ${periodo} ya fue entregado.`,
        body: `Llegó validado por el bot a Estadística${oficinas ? ` y a ${oficinas} oficina(s)` : ''}. El periodo está cerrado.`,
        // Un reporte real (backend) no tiene acta: no se inventa una.
        meta: reporte.remision?.acta ? `Acta ${reporte.remision.acta}` : undefined,
        unread: false,
      }),
    );
  }

  /* Las que calculó el backend con el plazo y el reloj reales (hoy, solo
     «semana con datos faltantes» de Nutrición). Vacío para las nueve áreas
     simuladas: nadie llenó `alertasReales` para ellas. Esto se agrega a lo
     de arriba, no lo reemplaza: «atraso» y «remitido» ya leen
     datos reales de por sí (el reporte sincronizado, el plazo real). */
  for (const a of alertasRealesDe(alertasReales, claveArea, vigente)) {
    const traducida = avisoDeBackend(a);
    if (traducida) lista.push(traducida);
  }

  return lista;
}

function avisosDeEstadistica(reportes, remisionesDiresa, vigente, hoy, plazosReales) {
  const lista = [];

  /* Cada área puede tener su propio plazo real (Nutrición, día 5; las demás,
     el genérico): el vencimiento se evalúa área por área, no con un solo
     plazo para el grupo. */
  const atrasadas = areasDelFlujo().filter(
    (a) => !estaEntregado(estadoDe(reportes, a.clave, vigente)) && estaVencido(vigente, hoy, plazoRealDe(plazosReales, a.clave, vigente)),
  );

  if (atrasadas.length) {
    lista.push(
      aviso({
        id: 'atrasadas',
        tono: 'crit',
        icon: 'sh-warn',
        title: `${atrasadas.length} área(s) no han entregado ${etiquetaPeriodo(vigente)}.`,
        body: atrasadas.map((a) => nombreArea(a.clave)).join(', ') + '.',
        /* Un solo número de días no describe bien a un grupo con plazos
           distintos; se dice cuántas, no desde cuándo. */
        meta: `${atrasadas.length} ${atrasadas.length === 1 ? 'área ya venció' : 'áreas ya vencieron'} su propio plazo`,
      }),
    );
  }

  /* Meses cerrados que todavía no se remitieron a DIRESA. */
  const sinDiresa = PERIODOS.filter((p) => p < vigente && !remisionesDiresa.some((r) => r.periodo === p));
  if (sinDiresa.length) {
    lista.push(
      aviso({
        id: 'diresa',
        tono: 'warn',
        icon: 'sh-send',
        title: `${sinDiresa.length} periodo(s) sin remitir a DIRESA.`,
        body: sinDiresa.map(etiquetaPeriodo).join(', ') + '.',
        meta: 'Consolidado de servicios intermedios e indicadores de gestión',
      }),
    );
  }

  return lista;
}

function avisosDeOficina(reportes, claveOficina, vigente) {
  return avisosDeRecepcion(reportesRecibidosPor(reportes, claveOficina).filter((r) => r.periodo === vigente), vigente);
}

function avisosDeRecepcion(recibidos, vigente) {
  if (!recibidos.length) return [];

  return [
    aviso({
      id: 'recibidos',
      tono: 'ok',
      icon: 'sh-inbox',
      title: `${recibidos.length} reporte(s) recibido(s) de ${etiquetaPeriodo(vigente)}.`,
      body: recibidos.map((r) => nombreArea(r.area)).join(', ') + '.',
      meta: 'Entregados por cada área al enviar, validados por el bot',
    }),
  ];
}

/* `hoy` decide el periodo vigente y los plazos: por modo, no por área (ver
   datos/store.js). En modo mock es siempre `HOY`; en modo real, el que dio el
   backend. `plazosReales` (`datos/store.js::plazosReales`) trae el plazo
   real de las áreas ya sincronizadas; para las demás se cae al cálculo
   local. `alertasReales` (`datos/store.js::alertasReales`), igual, para las
   alertas que calculó el backend. */
export function avisosDe(reportes, sesion, remisionesDiresa = [], hoy, plazosReales = {}, alertasReales = {}, desempeno = null) {
  if (!sesion) return [];
  const { usuario, rolActivo } = sesion;
  const vigente = periodoVigente(hoy);

  if (rolActivo === ROL.AREA) return avisosDeArea(reportes, usuario.area, vigente, hoy, plazosReales, alertasReales);
  if (rolActivo === ROL.ESTADISTICA) return avisosDeEstadistica(reportes, remisionesDiresa, vigente, hoy, plazosReales);
  if (rolActivo === ROL.OFICINA) return avisosDeOficina(reportes, usuario.oficina, vigente);
  /* Planeamiento recibe de las nueve áreas (`reportes` ya es solo lo entregado). */
  if (rolActivo === ROL.PLANEAMIENTO) return avisosDeRecepcion(reportes.filter((r) => r.periodo === vigente), vigente);
  return avisosDeDesempeno(desempeno);
}

/* Indicadores de desempeño: a quien carga los datos, cuántos archivos ya se
   pueden subir. La cuenta la hace el servidor (`por_subir_ahora` del resumen) y
   se conoce al abrir el módulo: antes de eso no hay nada que avisar. */
function avisosDeDesempeno(desempeno) {
  if (!desempeno?.puedeCargar || !desempeno.porSubir) return [];
  const n = desempeno.porSubir;
  return [
    aviso({
      id: 'desempeno-por-subir',
      tono: 'warn',
      icon: 'sh-upload',
      title: n === 1 ? 'Indicadores: 1 archivo ya se puede subir.' : `Indicadores: ${n} archivos ya se pueden subir.`,
      body: 'En «Carga de datos» está cuál es y para qué sirve.',
      meta: 'Indicadores de desempeño',
    }),
  ];
}
