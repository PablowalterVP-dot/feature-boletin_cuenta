/* El estado y las acciones de la cabecera de cada módulo.

   Como avisos.js, se deriva del estado cada vez: no se guarda nada, así que la
   cabecera no puede decir «pendiente» de un reporte que ya se envió.

   Nació para la cabecera en banda (PageBanner) y desde el kit 1.11.0 alimenta
   la cabecera nueva (PageHeader, dentro del AppShell): el estado del módulo
   —dicho una vez— va en la franja bajo el título, con sus acciones; en Inicio,
   además, la hora. `mascot` se sigue calculando pero hoy no se dibuja: la
   banda verde con Dr. Mochi se retiró y los avisos del mes con la mascota
   tendrán su propio lugar bajo la cabecera. Cada cifra sale de los mismos selectores que usa el panel
   (store.js, estados.js, areas.js), para que la banda y el panel no puedan
   decir cosas distintas. Un botón solo aparece si lleva a un sitio que existe:
   la banda no promete acciones que el panel no tiene.

   El plazo es el que el sistema aplica hoy (dominio/periodos.js: vence el día
   DIA_PLAZO del mes siguiente, o el plazo real del backend si ya se
   sincronizó). Si cambia la regla, cambia ahí y esta cabecera la sigue.

   Devuelve datos, no JSX: App.jsx pinta los botones y navega. Forma:
     { status, mascot?, clock?, acciones: { texto, icono, tono, ayuda, ir: [id, params] }[] } */

import { ROL } from './dominio/roles.js';
import { reporteDe, plazoRealDe, reportesRecibidosPor, remisionDiresaDe, registroDe } from './datos/store.js';
import { ACTIVIDADES, ANIO_ACTIVIDADES } from './datos/planeamiento/actividades.js';
import { fuenteDeArea } from './datos/diresa/fuentes.js';
import { ejecucionDelMes } from './dominio/actividades.js';
import { AREAS, area, destinosDe, areasQueRemitenA } from './datos/areas.js';
import { OFICINAS, nombreOficina } from './datos/oficinas.js';
import { formularioDe } from './datos/formatos/levantados.js';
import { PERIODOS } from './datos/reportes.js';
import { USUARIOS } from './datos/usuarios.js';
import { estaEntregado, ESTADOS, ESPERA } from './dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, plazoEfectivo, diasParaVencer, estaVencido, mesAnterior, plazoDiresaDe } from './dominio/periodos.js';
import { fechaLarga, fechaCorta } from './dominio/formato.js';
import { textoVentana, mesMinuscula } from './dominio/desempeno.js';
import { esAreaReal, areasDelFlujo, usaSoloDatosReales, MODO_API } from './servicios/api.js';
import { MODO_BOT, AREAS_BOT } from './servicios/bot-validador.js';
import { esDeHospitalizacion } from './navegacion.js';

/* «jueves 10 de septiembre»: para una frase, sin mayúscula ni año. */
function diaYFecha(iso) {
  const [dia, resto] = fechaLarga(iso).split(', ');
  return `${dia.toLowerCase()} ${resto.replace(/ de \d{4}$/, '')}`;
}

const dias = (n) => (n === 1 ? '1 día' : `${n} días`);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/* «agosto», de un periodo. */
const mesDe = (periodo) => etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();

/* «Nutrición, Lavandería y Farmacia». */
function enumerar(nombres) {
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : (nombres[0] ?? '');
}

const ir = (texto, icono, tono, ayuda, ...destino) => ({ texto, icono, tono, ayuda, ir: destino });

/* ================================================================ áreas */

/* El estado del reporte vigente, dicho una sola vez. `fechaLimiteReal`: el
   plazo real de esta área si ya se sincronizó con el backend (`plazosReales`
   del store); sin él, el día fijo del prototipo (`dominio/periodos.js`). */
function plazoDelMes(reportes, claveArea, hoy, fechaLimiteReal) {
  const periodo = periodoVigente(hoy);
  const reporte = reporteDe(reportes, claveArea, periodo);
  const delMes = `Reporte de ${etiquetaPeriodo(periodo).toLowerCase()}`;

  if (reporte && estaEntregado(reporte.estado)) {
    const cuando = reporte.enviadoEn ? ` · enviado el ${diaYFecha(reporte.enviadoEn)}` : '';
    return { situacion: 'enviado', mascot: 'done', status: { icon: 'sh-ok', label: 'Entregado', detail: `${delMes}${cuando}` } };
  }
  const quedan = diasParaVencer(periodo, hoy, fechaLimiteReal);
  if (quedan > 0) {
    return { situacion: 'pendiente', mascot: 'idle', status: { icon: 'sh-clock', label: 'Pendiente de envío', detail: `${delMes} · vence el ${diaYFecha(plazoEfectivo(periodo, fechaLimiteReal))} (${quedan === 1 ? 'queda' : 'quedan'} ${dias(quedan)})` } };
  }
  if (quedan === 0) {
    return { situacion: 'pendiente', mascot: 'thinking', status: { icon: 'sh-warn', label: 'Vence hoy', detail: `${delMes} · último día del plazo`, tone: 'warning' } };
  }
  return {
    situacion: 'pendiente',
    mascot: 'problem',
    status: { icon: 'sh-warn', label: 'Plazo vencido', detail: `${delMes} · venció el ${diaYFecha(plazoEfectivo(periodo, fechaLimiteReal))}, hace ${dias(-quedan)}`, tone: 'warning' },
  };
}

/* Las acciones del reporte del mes, según cómo se llena el de esta área:
   subiendo su Excel (Nutrición, Laboratorio), en los cuadros de pantalla (las que tienen
   su oficio levantado) o, si aún no tiene formulario, solo verlo. Llenar a
   mano no existe con el backend (se decidió el 28/09/2026: ahí solo se
   corrige subiendo el Excel). */
function accionesDelMes(situacion, claveArea) {
  if (situacion === 'enviado') {
    return [
      ir('Revisar historial de reportes', 'sh-folder', 'cta', 'Los meses ya enviados, su estado y sus constancias.', 'historial'),
      ir('Ver el reporte enviado', 'sh-eye', 'ghost', 'Lo que recibieron Estadística y las oficinas, en solo lectura, con su constancia.', 'reporte'),
    ];
  }
  const formulario = formularioDe(claveArea);
  if (!formulario) {
    return [ir('Ver el reporte del mes', 'sh-eye', 'cta', 'El formato de esta área aún se está levantando: ahí se explica qué falta.', 'reporte')];
  }
  return [
    formulario.carga
      ? ir('Subir el Excel', 'sh-upload', 'cta', 'Suba la plantilla del mes, llena: el bot la lee y la revisa.', 'reporte', { paso: 'carga' })
      : ir('Subir el Word', 'sh-upload', 'cta', 'Suba el Word del mes: el bot lo lee y lo revisa.', 'reporte', { paso: 'carga' }),
    esAreaReal(claveArea) || !formulario.digitable ? null : ir('Llenar a mano', 'sh-pencil', 'ghost', 'Digite las cifras en los cuadros, sin Excel.', 'reporte', { paso: 'revision' }),
  ].filter(Boolean);
}

function historial(reportes, claveArea, hoy, plazosReales) {
  const anio = periodoVigente(hoy).slice(0, 4);
  const enviados = reportes
    .filter((r) => r.area === claveArea && r.periodo.startsWith(anio) && estaEntregado(r.estado))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  if (!enviados.length) {
    return { status: { icon: 'sh-clock', label: 'Todavía no hay reportes enviados', detail: `En ${anio}, el primero aparecerá aquí al enviarlo` } };
  }
  const aTiempo = enviados.filter((r) => r.enviadoEn && r.enviadoEn.slice(0, 10) <= plazoEfectivo(r.periodo, plazoRealDe(plazosReales, claveArea, r.periodo))).length;
  const desde = mesDe(enviados[0].periodo);
  const hasta = mesDe(enviados.at(-1).periodo);
  const rango = desde === hasta ? `${desde} de ${anio}` : `${desde} a ${hasta} de ${anio}`;
  return {
    status: {
      icon: 'sh-ok',
      label: plural(enviados.length, 'reporte enviado', 'reportes enviados'),
      detail: `${rango[0].toUpperCase()}${rango.slice(1)} · ${aTiempo === enviados.length ? 'todos dentro del plazo' : `${aTiempo} dentro del plazo`}`,
    },
  };
}

function destinos(claveArea) {
  const oficinas = destinosDe(claveArea);
  // Nombres cortos: «Estadística y Planeamiento».
  const lista = enumerar(oficinas.map((o) => (o === 'estadistica' ? 'Estadística' : nombreOficina(o))));
  const cuando = oficinas.length === 1 ? 'la recibe al enviarlo' : oficinas.length === 2 ? 'las dos lo reciben al enviarlo' : 'todas lo reciben al enviarlo';
  return {
    status: {
      icon: 'sh-share',
      label: plural(oficinas.length, 'oficina lo recibe', 'oficinas lo reciben'),
      detail: `${lista} · ${cuando}`,
    },
  };
}

function bandaDeArea(clave, panelId, { reportes, hoy, plazosReales }) {
  const fechaLimiteReal = plazoRealDe(plazosReales, clave, periodoVigente(hoy));

  if (panelId === 'inicio') {
    const p = plazoDelMes(reportes, clave, hoy, fechaLimiteReal);
    return { status: p.status, mascot: p.mascot, clock: true, acciones: accionesDelMes(p.situacion, clave) };
  }
  if (panelId === 'reporte') {
    // Ya está en el reporte: no se ofrece ir a donde ya está, solo al historial.
    const p = plazoDelMes(reportes, clave, hoy, fechaLimiteReal);
    return { status: p.status, acciones: p.situacion === 'enviado' ? accionesDelMes(p.situacion, clave).slice(0, 1) : accionesDelMes(p.situacion, clave) };
  }
  if (panelId === 'historial') return { ...historial(reportes, clave, hoy, plazosReales), acciones: [] };
  if (panelId === 'matriz') return { ...destinos(clave), acciones: [] };
  if (panelId === 'consolidado') return { status: consolidadoDe(hoy), acciones: [ir('Revisar historial de reportes', 'sh-folder', 'ghost', 'Los meses enviados, uno por uno, con sus constancias.', 'historial')] };
  return null;
}

/* El consolidado anual (ConsolidadoAnual.jsx): el bot lo arma con los meses
   entregados. La cuenta exacta la da la pantalla, que la pide al servidor;
   el almacén del navegador no tiene todos los meses del año. */
function consolidadoDe(hoy) {
  const anio = periodoVigente(hoy).slice(0, 4);
  return { icon: 'sh-table', label: `Consolidado ${anio}`, detail: 'Se arma solo con los meses entregados: un mes sin reporte queda vacío, no en cero' };
}

/* ===================================================== Oficina de Estadística */

/* El mes vigente de las nueve áreas, con el plazo de cada una (puede tener el
   real del backend). Lo mismo que cuenta Cumplimiento.jsx. */
function delMes(reportes, hoy, plazosReales) {
  const periodo = periodoVigente(hoy);
  const filas = areasDelFlujo().map((a) => {
    const estado = reporteDe(reportes, a.clave, periodo)?.estado ?? 'no_iniciado';
    const limiteReal = plazoRealDe(plazosReales, a.clave, periodo);
    return { area: a, estado, plazo: plazoEfectivo(periodo, limiteReal), vencida: ESTADOS[estado]?.espera === ESPERA.AREA && estaVencido(periodo, hoy, limiteReal) };
  });
  return {
    periodo,
    filas,
    entregadas: filas.filter((f) => estaEntregado(f.estado)),
    vencidas: filas.filter((f) => f.vencida),
  };
}

const mesAnio = (periodo) => etiquetaPeriodo(periodo);

function cumplimiento(m) {
  const total = areasDelFlujo().length;
  const faltan = total - m.entregadas.length;
  /* El plazo de las que faltan: el real de cada una si lo dio el backend. Si
     no coinciden, no se elige uno: se dice que cada área tiene el suyo. */
  const plazos = [...new Set(m.filas.filter((f) => !estaEntregado(f.estado)).map((f) => f.plazo))];
  const plazo = plazos.length === 1 ? `el plazo vence el ${diaYFecha(plazos[0])}` : 'cada área tiene su plazo';
  const status = m.vencidas.length
    ? { icon: 'sh-warn', tone: 'warning', label: `${m.entregadas.length} de ${plural(total, "área entregó", "áreas entregaron")}`, detail: `${mesAnio(m.periodo)} · ${plural(m.vencidas.length, 'área tiene', 'áreas tienen')} el plazo vencido` }
    : { icon: 'sh-traffic-light', label: `${m.entregadas.length} de ${plural(total, "área entregó", "áreas entregaron")}`, detail: `${mesAnio(m.periodo)} · ${faltan ? `${faltan === 1 ? 'falta 1' : `faltan ${faltan}`} · ${plazo}` : 'todas entregaron'}` };
  return {
    status,
    acciones: m.entregadas.length ? [ir('Ver lo recibido', 'sh-inbox', 'ghost', `Los reportes de ${mesDe(m.periodo)} que ya entregaron las áreas, validados por el bot.`, 'revision')] : [],
  };
}

function bandeja(m) {
  const recibidos = m.entregadas.length;
  if (!recibidos) {
    return { status: { icon: 'sh-inbox', label: 'Todavía no llega ningún reporte', detail: `${mesAnio(m.periodo)} · aparecen aquí en cuanto un área los envía` }, acciones: [] };
  }
  const total = areasDelFlujo().length;
  return {
    status: { icon: 'sh-inbox', label: `${recibidos} de ${plural(total, 'reporte recibido', 'reportes recibidos')}`, detail: `${mesAnio(m.periodo)} · validados por el bot y ya entregados a sus oficinas` },
    acciones: [],
  };
}

/* El mismo periodo que abre RemisionDiresa.jsx: el primero sin remitir antes
   del vigente, o el vigente. Con el backend, el vigente: el servidor todavía
   no guarda las remisiones a DIRESA, así que no hay forma de saber cuáles se
   hicieron, y declarar «vencido» un mes en que el sistema ni existía sería
   inventar un incumplimiento. */
function diresa(reportes, remisiones, hoy) {
  const vigente = periodoVigente(hoy);
  const sinRegistro = usaSoloDatosReales();
  const periodo = sinRegistro ? vigente : (PERIODOS.find((p) => p < vigente && !remisionDiresaDe(remisiones, p)) ?? vigente);
  const hecha = remisionDiresaDe(remisiones, periodo);
  const consolidado = `Consolidado de ${mesDe(periodo)}`;
  if (hecha) {
    return { status: { icon: 'sh-ok', label: 'Remitido a DIRESA', detail: `${consolidado} · constancia ${hecha.constancia}` }, acciones: [] };
  }
  const enFlujo = areasDelFlujo();
  const entregadas = enFlujo.filter((a) => estaEntregado(reporteDe(reportes, a.clave, periodo)?.estado)).length;
  const plazo = plazoDiresaDe(periodo);
  const avance = `${entregadas} de ${plural(enFlujo.length, 'área entregó', 'áreas entregaron')}`;
  return hoy > plazo && !sinRegistro
    ? { status: { icon: 'sh-warn', tone: 'warning', label: 'Plazo de DIRESA vencido', detail: `${consolidado} · venció el ${diaYFecha(plazo)} · ${avance}` }, acciones: [] }
    : { status: { icon: 'sh-send', label: `Plazo: ${diaYFecha(plazo)}`, detail: `${consolidado} · ${avance}` }, acciones: [] };
}

/* El mismo periodo que abre Boletin.jsx. */
function boletin(remisiones, hoy) {
  const remitidos = remisiones.map((r) => r.periodo).sort();
  const periodo = remitidos.at(-1) ?? mesAnterior(periodoVigente(hoy));
  return remitidos.length
    ? { status: { icon: 'sh-bulletin', label: `Boletín de ${mesDe(periodo)}`, detail: `${etiquetaPeriodo(periodo)} · con el consolidado ya remitido a DIRESA` }, acciones: [] }
    : {
        status: { icon: 'sh-bulletin', tone: 'warning', label: `Boletín de ${mesDe(periodo)}`, detail: 'Aún no se remitió ningún consolidado a DIRESA: las cifras pueden cambiar' },
        acciones: [ir('Ir a la remisión a DIRESA', 'sh-send', 'ghost', 'El boletín se cierra con el consolidado remitido.', 'diresa')],
      };
}

function matrizCompleta() {
  const envios = AREAS.reduce((s, a) => s + destinosDe(a.clave).length, 0);
  return {
    status: { icon: 'sh-table', label: `${AREAS.length} áreas · ${OFICINAS.length} oficinas receptoras`, detail: `${envios} envíos por periodo, contando el de cada área a Estadística` },
    acciones: [],
  };
}

function bandaDeEstadistica(panelId, { reportes, hoy, plazosReales, remisionesDiresa }) {
  if (panelId === 'diresa') return diresa(reportes, remisionesDiresa, hoy);
  if (panelId === 'boletin') return boletin(remisionesDiresa, hoy);
  if (panelId === 'consolidado' || panelId === 'consolidado-laboratorio' || panelId === 'consolidado-lavanderia' || panelId === 'consolidado-farmacia' || panelId === 'consolidado-nefrologia' || panelId === 'consolidado-ginecologia' || panelId === 'consolidado-centro-quirurgico' || panelId === 'consolidado-imagenes' || panelId === 'consolidado-epidemiologia') return { status: consolidadoDe(hoy), acciones: [] };
  if (panelId === 'matriz') return matrizCompleta();
  const m = delMes(reportes, hoy, plazosReales);
  if (panelId === 'semaforo') return cumplimiento(m);
  if (panelId === 'revision') return bandeja(m);
  return null;
}

/* ============================================================ Planeamiento */

/* Cómo va el mes en curso de las actividades operativas: lo mismo que cuentan
   las cifras del panel, con las mismas reglas. */
function actividadesDelMes(reportes, actividades, periodo) {
  const mes = periodo.slice(5, 7);
  return ACTIVIDADES.map((a) =>
    ejecucionDelMes(a, { periodo, fuente: fuenteDeArea(reportes, a.area, periodo), registro: registroDe(actividades, ANIO_ACTIVIDADES, a.codigo, mes) }),
  );
}

/* `reportes` ya viene filtrado a lo entregado (App.jsx). */
function bandaDePlaneamiento(panelId, { reportes, hoy, actividades = {} }) {
  const periodo = periodoVigente(hoy);
  if (panelId === 'actividades') {
    if (!periodo.startsWith(ANIO_ACTIVIDADES)) return { status: { icon: 'sh-chart', label: `Actividades operativas ${ANIO_ACTIVIDADES}`, detail: 'El catálogo es el del POI de ese año' }, acciones: [] };
    const del = actividadesDelMes(reportes, actividades, periodo);
    const conCifra = del.filter((e) => e.valor != null).length;
    const porDigitar = del.filter((e) => e.como === 'pendiente').length;
    const sinReporte = del.filter((e) => e.como === 'sin-reporte' || e.como === 'sin-dato').length;
    const faltan = [porDigitar && plural(porDigitar, 'por digitar', 'por digitar'), sinReporte && plural(sinReporte, 'sin reporte del área', 'sin reporte del área')].filter(Boolean);
    return {
      status: {
        icon: 'sh-chart',
        label: `${conCifra} de ${del.length} con cifra`,
        detail: `${etiquetaPeriodo(periodo)}${faltan.length ? ` · ${faltan.join(' · ')}` : ' · todas tienen su ejecución'}`,
        ...(porDigitar ? { tone: 'warning' } : {}),
      },
      acciones: [],
    };
  }
  if (panelId === 'recibidos') {
    const delPeriodo = reportes.filter((r) => r.periodo === periodo);
    return {
      status: delPeriodo.length
        ? { icon: 'sh-inbox', label: plural(delPeriodo.length, 'reporte recibido', 'reportes recibidos'), detail: `${etiquetaPeriodo(periodo)} · ${enumerar(delPeriodo.map((r) => area(r.area)?.nombreBreve ?? r.area))}` }
        : { icon: 'sh-inbox', label: 'Sin reportes este periodo', detail: `${etiquetaPeriodo(periodo)} · llegan en cuanto el área los envía` },
      acciones: [],
    };
  }
  if (panelId.startsWith('consolidado')) return { status: consolidadoDe(hoy), acciones: [] };
  if (panelId === 'matriz') return matrizCompleta();
  return null;
}

/* ===================================================== oficinas receptoras */

function bandaDeOficina(claveOficina, panelId, { reportes, hoy }) {
  const recibidos = reportesRecibidosPor(reportes, claveOficina);
  if (panelId === 'bandeja') {
    const periodo = periodoVigente(hoy);
    const delPeriodo = recibidos.filter((r) => r.periodo === periodo);
    const nombres = enumerar(delPeriodo.map((r) => area(r.area)?.nombreBreve ?? r.area));
    return {
      status: delPeriodo.length
        ? { icon: 'sh-inbox', label: plural(delPeriodo.length, 'reporte recibido', 'reportes recibidos'), detail: `${etiquetaPeriodo(periodo)} · ${nombres}` }
        : { icon: 'sh-inbox', label: 'Sin reportes este periodo', detail: `${etiquetaPeriodo(periodo)} · llegan en cuanto el área los envía` },
      acciones: [],
    };
  }
  if (panelId === 'historial-oficina') {
    const anio = periodoVigente(hoy).slice(0, 4);
    const delAnio = recibidos.filter((r) => r.periodo.startsWith(anio));
    const areas = new Set(delAnio.map((r) => r.area)).size;
    return {
      status: { icon: 'sh-clock', label: plural(delAnio.length, 'reporte recibido', 'reportes recibidos'), detail: delAnio.length ? `En ${anio} · de ${plural(areas, 'área', 'áreas')}` : `En ${anio}, todavía ninguno` },
      acciones: [],
    };
  }
  if (panelId === 'matriz') {
    const areas = areasQueRemitenA(claveOficina);
    return { status: { icon: 'sh-share', label: plural(areas.length, 'área le envía', 'áreas le envían'), detail: enumerar(areas.map((a) => a.nombreBreve)) || 'Ninguna área la tiene como destino' }, acciones: [] };
  }
  return null;
}

/* ========================================================== administración */

/* El panel del superadministrador (con el servidor). Lo que cada pantalla
   carga lo dice ella; aquí, solo lo que ya se sabe sin pedir nada. */
function bandaDeSuperadmin(panelId, { hoy, plazosReales, configuracion }) {
  const enFlujo = areasDelFlujo();
  const flujo = {
    icon: 'sh-table',
    label: `${enFlujo.length} de ${plural(AREAS.length, 'área reporta', 'áreas reportan')} por el sistema`,
    detail: enFlujo.length ? enumerar(enFlujo.map((a) => a.nombreBreve)) : 'Ninguna tiene todavía su formato instalado',
  };
  const periodo = periodoVigente(hoy);
  switch (panelId) {
    case 'resumen':
    case 'areas':
      return { status: flujo, acciones: [] };
    case 'funcionamiento':
      return { status: { icon: 'sh-pulse', label: 'Conectado al servidor', detail: MODO_API.texto }, acciones: [] };
    case 'cuentas':
      return { status: { icon: 'sh-people', label: 'Cuentas del servidor', detail: 'Cada cambio queda en la bitácora; la persona lo ve al volver a entrar' }, acciones: [] };
    case 'unidades-hospitalizacion':
      return { status: { icon: 'sh-folder', label: 'Solo las de hospitalización', detail: 'Las áreas que reportan a Estadística se ven en «Áreas y matriz»' }, acciones: [] };
    case 'plazos': {
      const primera = enFlujo[0];
      const vence = primera ? plazoEfectivo(periodo, plazoRealDe(plazosReales, primera.clave, periodo)) : null;
      return {
        status: { icon: 'sh-calendar', label: `${etiquetaPeriodo(periodo)} en curso`, detail: primera ? `${primera.nombreBreve}: vence el ${diaYFecha(vence)}` : 'Ninguna área reporta todavía por el sistema' },
        acciones: [],
      };
    }
    case 'personalizacion':
      return {
        status: { icon: 'sh-gear', label: configuracion?.nombreSistema ?? 'Sistema de Reporte Estadístico', detail: configuracion?.aviso ? `Aviso vigente: ${configuracion.aviso.texto}` : 'Sin aviso general' },
        acciones: [],
      };
    case 'cobertura':
      return { status: { icon: 'sh-calendar', label: 'La base del servidor', detail: 'Lo cargado solo en la base de otro integrante no aparece hasta importarlo' }, acciones: [] };
    case 'bitacora':
      return { status: { icon: 'sh-clock', label: 'Solo lectura', detail: 'Cada cambio lo escribe la propia base de datos: nadie lo edita, ni desde aquí' }, acciones: [] };
    case 'soporte':
      return { status: { icon: 'sh-wrench', label: 'Siempre con justificación', detail: '«Ver como» es de solo lectura, dura una hora y queda en la bitácora' }, acciones: [] };
    default:
      return null;
  }
}

function bandaDeAdmin(panelId) {
  if (panelId === 'cuentas') {
    return { status: { icon: 'sh-people', label: plural(USUARIOS.length, 'cuenta de prueba', 'cuentas de prueba'), detail: 'Datos ficticios · se pueden reiniciar desde aquí' }, acciones: [] };
  }
  if (panelId === 'bot') {
    const sabe = Object.keys(AREAS_BOT).length;
    return { status: { icon: 'sh-shield', label: MODO_BOT.tipo === 'servicio' ? 'Bot como servicio' : 'Bot embebido en el navegador', detail: `Sabe leer el archivo de ${plural(sabe, 'área', 'áreas')}` }, acciones: [] };
  }
  if (panelId === 'matriz') return matrizCompleta();
  return null;
}

/* ================================================ indicadores de desempeño */

/* Lo que dice la cabecera es de cuándo son los datos y si la corrección del HIS
   está abierta: lo mismo que el panel leyó del servidor (`estado.desempeno`,
   de GET /api/desempeno/resumen). Mientras no llega, solo qué es el módulo. */
function bandaDeDesempeno(panelId, { desempeno, hoy }) {
  if (panelId !== 'desempeno-carga') return null;
  if (!desempeno) {
    return { status: { icon: 'sh-chart', label: 'Indicadores de desempeño', detail: 'Leyendo el último cálculo guardado en la base' }, acciones: [] };
  }
  const { anio, datosAl, ventana, puedeCargar, porSubir = 0 } = desempeno;
  const label = datosAl ? `Datos al ${fechaCorta(datosAl)}` : `${anio}: todavía sin datos del HIS`;
  const faltan = ventana?.faltan ?? [];
  /* Lo que el servidor calculó que ya se puede subir manda sobre el aviso del mes que falta. */
  const falta = porSubir ? `${porSubir === 1 ? '1 archivo ya se puede subir' : `${porSubir} archivos ya se pueden subir`}` : faltan.length ? `Falta cargar ${enumerar(faltan)} de ${mesMinuscula(ventana.anio, ventana.mes)}` : null;
  const detail = [textoVentana(ventana, desempeno.hoy ?? hoy)?.replace(/\.$/, ''), puedeCargar ? falta : null].filter(Boolean).join(' · ') || `Año ${anio} · cada cifra sale del último cálculo guardado`;
  return { status: { icon: 'sh-upload', label, detail, ...(falta && puedeCargar ? { tone: 'warning' } : {}) }, acciones: [] };
}

/* ================================================================= entrada */

/* La banda del módulo abierto, o null si ese módulo no la lleva.
   `estado`: { reportes, hoy, plazosReales, remisionesDiresa } del store. */
/* El panel de monitoreo dice lo mismo a quien lo mire: su estado está en el panel. */
const BANDA_MONITOREO = Object.freeze({
  status: { icon: 'sh-chart', label: 'Indicadores del hospital', detail: 'Lo que evalúa el Anexo I, con la cifra oficial de MINSA y la del hospital' },
});

export function bandaDe(sesion, panelId, estado) {
  if (panelId.startsWith('monitoreo')) return BANDA_MONITOREO;
  /* Hospitalización no tiene aviso de Dr. Mochi: lo que apremia en un piso (una
     orden sin cama, un censo sin cerrar) lo dice su propia pantalla. */
  if (esDeHospitalizacion(panelId)) return null;
  const datos = { plazosReales: {}, remisionesDiresa: [], ...estado };
  switch (sesion.rolActivo) {
    case ROL.AREA:
      return sesion.usuario.area ? bandaDeArea(sesion.usuario.area, panelId, datos) : null;
    case ROL.ESTADISTICA:
      return bandaDeDesempeno(panelId, datos) ?? bandaDeEstadistica(panelId, datos);
    case ROL.PLANEAMIENTO:
      return bandaDePlaneamiento(panelId, datos);
    case ROL.OFICINA:
      return sesion.usuario.oficina ? bandaDeOficina(sesion.usuario.oficina, panelId, datos) : null;
    case ROL.ADMIN:
      return bandaDeDesempeno(panelId, datos) ?? (usaSoloDatosReales() ? bandaDeSuperadmin(panelId, datos) : bandaDeAdmin(panelId));
    default:
      return null;
  }
}
