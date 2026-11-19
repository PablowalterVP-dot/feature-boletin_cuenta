/* Estado de la aplicación, en memoria.

   El prototipo no tiene backend: los reportes viven aquí y se pierden al
   recargar. Es deliberado y conviene decirlo en la reunión, porque significa
   que se puede ensayar la demo tantas veces como haga falta sin ensuciar nada.

   Excepción: Farmacia. Empieza sin historial y sus meses existen solo si el
   área sube su Word, así que perderlos al recargar obligaría a subir todo de
   nuevo cada vez. Sus reportes se guardan en el navegador (`localStorage`,
   ver «Lo que se guarda en el navegador») hasta que se instale en el
   servidor. Solo los de Farmacia, solo en el prototipo y solo en este
   navegador: otra computadora no los ve.

   Un almacén propio de veinte líneas en lugar de una librería: el kit no tiene
   dependencias más allá de React, y `useSyncExternalStore` cubre exactamente
   este caso.

   Regla de oro: ninguna pantalla muta el estado a mano. Toda transición pasa
   por `aplicarTransicion`, que la valida contra la máquina de estados. Si una
   acción no está permitida para el estado y el rol, no ocurre y se avisa. */

import { useSyncExternalStore } from 'react';
import { REPORTES_INICIALES, REMISIONES_DIRESA_INICIALES } from './reportes.js';
import { PROPIOS_INICIALES } from './estadistica-propios.js';
import { usuarioDeArea } from './usuarios.js';
import { datosSembrados } from './formatos/levantados.js';
import { AREAS, area, destinosDe } from './areas.js';
import { puede, transicion, estaEntregado } from '@/app/dominio/estados.js';
import { ROL } from '@/app/dominio/roles.js';
import { HOY, plazoEfectivo, estaVencido, diasDeRetraso, diasParaVencer } from '@/app/dominio/periodos.js';

/* Con lo que arranca el almacén y a lo que vuelve `reiniciarDatos`. En el
   prototipo, los datos sembrados de las nueve áreas; con el backend
   (`usarSoloDatosReales`), nada: lo real llega por servicios/api.js, y un
   reporte simulado al lado de uno real haría que Estadística contara
   entregas que nadie hizo. */
const SEMILLA_SIMULADA = Object.freeze({ reportes: REPORTES_INICIALES, propios: PROPIOS_INICIALES, remisionesDiresa: REMISIONES_DIRESA_INICIALES });
const SEMILLA_VACIA = Object.freeze({ reportes: Object.freeze([]), propios: Object.freeze({}), remisionesDiresa: Object.freeze([]) });
let semilla = SEMILLA_SIMULADA;

/* --------------------------------------- lo que se guarda en el navegador */

const CLAVE_GUARDADO = 'hrl-prototipo-reportes-farmacia-v1';
const AREAS_GUARDADAS = new Set(['farmacia']);

/* Un navegador en ventana privada, sin espacio o sin `localStorage` (la prueba
   de humo corre fuera del navegador) simplemente no guarda: el prototipo
   sigue funcionando en memoria, como siempre. */
function almacenNavegador() {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function leerGuardados() {
  try {
    const lista = JSON.parse(almacenNavegador()?.getItem(CLAVE_GUARDADO) ?? '[]');
    return Array.isArray(lista) ? lista.filter((r) => AREAS_GUARDADAS.has(r?.area) && r.id && r.periodo) : [];
  } catch {
    return [];
  }
}

function escribirGuardados(reportes) {
  try {
    almacenNavegador()?.setItem(CLAVE_GUARDADO, JSON.stringify(reportes.filter((r) => AREAS_GUARDADAS.has(r.area))));
  } catch {
    /* Sin espacio o bloqueado: sigue en memoria. */
  }
}

function borrarGuardados() {
  try {
    almacenNavegador()?.removeItem(CLAVE_GUARDADO);
  } catch {
    /* Nada que borrar. */
  }
}

/* La semilla del prototipo más lo que Farmacia ya subió en este navegador. */
function reportesDeInicio() {
  if (semilla !== SEMILLA_SIMULADA) return semilla.reportes;
  const guardados = leerGuardados();
  const ids = new Set(guardados.map((r) => r.id));
  return [...semilla.reportes.filter((r) => !ids.has(r.id)), ...guardados];
}

let estado = {
  reportes: reportesDeInicio(),
  /* Datos que Estadística digita por su cuenta, por periodo. */
  propios: semilla.propios,
  /* Remisiones a DIRESA registradas, una por periodo. */
  remisionesDiresa: semilla.remisionesDiresa,
  /* Lo que Estadística cambió del editorial del boletín, por periodo. Las
     cifras del boletín no están aquí: se derivan de los reportes. */
  boletinEditorial: {},
  /* { usuario, rolActivo } — null mientras nadie ha ingresado. */
  sesion: null,
  /* Qué día es hoy, para decidir el periodo vigente. Empieza en el `HOY` del
     prototipo; en modo real (`MODO_API.tipo === 'real'`), `fijarHoyReal` lo
     reemplaza por la fecha que da el backend apenas hay sesión. La decisión
     es por modo, no por área: si se decidiera por área, la Bandeja de
     Estadística mostraría a Nutrición en un mes y a las otras nueve en otro,
     en la misma pantalla. */
  hoy: HOY,
  avisoIngreso: null,
  sincronizacionFallida: [],
  /* El `fecha_limite` real de cada área y periodo, tal como lo devolvió
     GET /api/reportes (`servicios/api.js::fijarPlazosReales`). Clave
     `"area:periodo"`. Solo tiene filas para áreas reales ya sincronizadas
     (hoy, Nutrición); para las demás, o antes de la primera sincronización,
     no hay entrada y se sigue calculando con el día fijo del prototipo
     (`dominio/periodos.js::plazoDe`). El plazo de un área real **nunca se
     recalcula en el frontend**: la API ya resuelve el plazo.{área}.{destino}
     real (`servidor/api/app/dominio/plazos.py`), que puede no ser el día 10. */
  plazosReales: {},
  /* Alertas de un área real, calculadas en el backend con el plazo y el
     reloj reales (hoy, solo «semana con datos faltantes» de Nutrición,
     sobre su propio periodo vigente — `servicios/api.js::alertasDe`). Clave
     `"area:periodo"`. Las nueve áreas simuladas siguen con lo que calcula
     avisos.js aquí mismo; esto solo se agrega encima, no lo reemplaza. */
  alertasReales: {},
  /* Lo que la oficina de la sesión recibió, leído de GET /oficinas/{clave}/recibidos.
     Aparte de `reportes`: la sincronización de cada área reescribe los suyos con lo
     que esta cuenta puede listar, y borraría lo recibido de un área ajena. Null
     mientras no llega. */
  recibidos: null,
  recibidosFallaron: false,
  /* Lo que configura el superadministrador (servicios/api.js::cargarConfiguracion):
     { nombreSistema, mensajeIngreso, aviso, preferencias }. Null en el
     prototipo o mientras no llega: las pantallas usan sus textos de siempre. */
  configuracion: null,
  /* Lo último que leyó el módulo de indicadores de desempeño, para su cabecera:
     { anio, hoy, datosAl, ventana }. Lo escribe la pantalla al recibir
     GET /api/desempeno/resumen (`fijarDesempeno`); null mientras no llega. No
     guarda resultados ni pacientes: solo de cuándo son los datos. */
  desempeno: null,
  /* Lo que Planeamiento escribió en las actividades operativas: una cifra donde
     no hay cálculo, o un ajuste con su nota donde sí lo hay. Por año, código y
     mes: { '2026': { AOI…: { '06': { valor, nota, actor, fecha } } } }. Lo
     calculado no se guarda: se deriva de los reportes cada vez, para que un
     reporte rectificado cambie la cifra sin que nadie la copie de nuevo. */
  actividades: {},
};

const oyentes = new Set();

function emitir(siguiente) {
  /* Solo en el prototipo: con el backend, lo que vale es lo del servidor. */
  if (semilla === SEMILLA_SIMULADA && siguiente.reportes !== estado.reportes) escribirGuardados(siguiente.reportes);
  estado = siguiente;
  for (const oyente of oyentes) oyente();
}

function suscribir(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

function leer() {
  return estado;
}

/* Lectura directa del estado, fuera de React. La usa la prueba de humo para
   comprobar el resultado de una transición sin montar un componente. */
export function leerEstado() {
  return estado;
}

/* Las pantallas leen el estado completo y derivan lo que necesitan con
   useMemo. Devolver una porción calculada desde aquí crearía un objeto nuevo
   en cada lectura y useSyncExternalStore entraría en bucle. */
export function useEstado() {
  return useSyncExternalStore(suscribir, leer, leer);
}

/* El día de hoy que está usando la aplicación (mock o real, según el modo).
   La usa cualquier pantalla que decida qué periodo mostrar «ahora»; nadie
   más debe leer `dominio/periodos.HOY` directamente para eso. */
export function useHoy() {
  return useEstado().hoy;
}

/* El plazo de un reporte, con la fecha de hoy y el límite que de verdad aplican:
   los del servidor, si los hay. Sin área, la de la sesión. Es lo que debe usar una
   pantalla: sin ellos, `estaVencido` y sus vecinas toman el `HOY` del prototipo, y
   así el reporte decía «Quedan 38 días» cuando quedaban 9 (01/11/2026). */
export function usePlazo(periodo, claveArea) {
  const { hoy, plazosReales, sesion } = useEstado();
  const limite = plazoRealDe(plazosReales, claveArea ?? sesion?.usuario?.area, periodo);
  return {
    fecha: plazoEfectivo(periodo, limite),
    vencido: estaVencido(periodo, hoy, limite),
    retraso: diasDeRetraso(periodo, hoy, limite),
    quedan: diasParaVencer(periodo, hoy, limite),
  };
}

/* En modo real, reemplaza el `hoy` del store por el que dio el backend
   (`servicios/api.js::hoyDelBackend`). Sin efecto si nunca se llama: el store
   sigue con el `HOY` del prototipo, que es lo correcto en modo mock. */
export function fijarConfiguracion(configuracion) {
  emitir({ ...estado, configuracion });
}

export function fijarDesempeno(desempeno) {
  emitir({ ...estado, desempeno });
}

export function fijarHoyReal(fecha) {
  emitir({ ...estado, hoy: fecha });
}

/* Vuelca en el store el `fecha_limite` de cada fila que dio GET /api/reportes
   (`filas`, de `servicios/api.js::sincronizarArea`), **exista o no el
   reporte todavía**: el plazo de un periodo sin abrir es justo el que hace
   falta para saber si ya está atrasado (avisos.js). */
export function fijarPlazosReales(claveArea, filas) {
  const nuevas = Object.fromEntries(filas.map((f) => [`${claveArea}:${f.periodo}`, f.fecha_limite]));
  emitir({ ...estado, plazosReales: { ...estado.plazosReales, ...nuevas } });
}

/* `null` si el área no está sincronizada con el backend (todavía, o nunca:
   una de las nueve simuladas) — quien llama cae al cálculo local de
   `dominio/periodos.js::plazoDe`. */
export function plazoRealDe(plazosReales, claveArea, periodo) {
  return plazosReales[`${claveArea}:${periodo}`] ?? null;
}

/* Vuelca en el store las alertas que dio el backend para un área y un
   periodo (`GET .../alertas`). No se guarda nada más: la próxima
   sincronización reemplaza esta entrada, igual que las propias avisos.js
   no sobreviven al hecho que las provocó. */
export function fijarAlertasReales(claveArea, periodo, alertas) {
  emitir({ ...estado, alertasReales: { ...estado.alertasReales, [`${claveArea}:${periodo}`]: alertas } });
}

/* `[]` si el área no tiene alertas del backend (todavía no sincronizada, o
   una de las nueve simuladas). */
export function alertasRealesDe(alertasReales, claveArea, periodo) {
  return alertasReales[`${claveArea}:${periodo}`] ?? [];
}

/* ------------------------------------------------------------------ sesión */

/* `admin` es la cuenta de administración desde la que se entró como otro
   usuario: mientras exista, la barra ofrece «Ver como…» y volver. Una sesión
   normal no la tiene y no ve esas herramientas. */
export function iniciarSesion(usuario, { admin = null } = {}) {
  const esAdmin = usuario.roles.includes(ROL.ADMIN);
  emitir({ ...estado, sesion: { usuario, rolActivo: usuario.roles[0], admin: esAdmin ? usuario : admin } });
}

/* Vuelve a la cuenta de administración desde la que se entró. */
export function volverAAdmin() {
  if (estado.sesion?.admin) iniciarSesion(estado.sesion.admin);
}

export function cerrarSesion() {
  emitir({ ...estado, sesion: null, desempeno: null, avisoIngreso: null, sincronizacionFallida: [], recibidos: null, recibidosFallaron: false });
}

/* El token venció (dura 8 horas, y en el hospital una PC se queda abierta días):
   vuelve al ingreso diciendo por qué, en vez de seguir con datos viejos. */
export function sesionVencida() {
  if (!estado.sesion) return;
  emitir({ ...estado, sesion: null, desempeno: null, sincronizacionFallida: [], recibidos: null, recibidosFallaron: false, avisoIngreso: 'Su sesión venció. Ingrese de nuevo para continuar.' });
}

/* Las áreas cuyos reportes no se pudieron traer: la pantalla avisa que lo que
   muestra puede estar desactualizado. */
export function fijarSincronizacion(claveArea, ok) {
  const sin = estado.sincronizacionFallida.filter((a) => a !== claveArea);
  const siguiente = ok ? sin : [...sin, claveArea];
  if (siguiente.length !== estado.sincronizacionFallida.length) emitir({ ...estado, sincronizacionFallida: siguiente });
}

/* Solo tiene efecto en cuentas con más de un rol; hoy, Epidemiología. */
export function cambiarRolActivo(rolActivo) {
  if (!estado.sesion?.usuario.roles.includes(rolActivo)) return;
  emitir({ ...estado, sesion: { ...estado.sesion, rolActivo } });
}

/* ---------------------------------------------------------------- lectura */

export function reporteDe(reportes, claveArea, periodo) {
  return reportes.find((r) => r.area === claveArea && r.periodo === periodo) ?? null;
}

/* La ausencia de registro ES el estado `no_iniciado`. Ver `reportes.js`. */
export function estadoDe(reportes, claveArea, periodo) {
  return reporteDe(reportes, claveArea, periodo)?.estado ?? 'no_iniciado';
}

export function reportesDeArea(reportes, claveArea) {
  return reportes.filter((r) => r.area === claveArea);
}

/* El primer periodo en que un área tiene un reporte, o null. Antes de él, el
   área no reportaba por el sistema: esos meses no son entregas pendientes,
   son meses en que el sistema aún no existía para ella. Con el backend real
   esto importa (los periodos de 2026 están sembrados desde enero, pero
   Nutrición empezó en agosto); en el prototipo, sembrado mes a mes, no cambia
   nada. */
export function primerPeriodoDe(reportes, claveArea) {
  let primero = null;
  for (const r of reportes) if (r.area === claveArea && (primero == null || r.periodo < primero)) primero = r.periodo;
  return primero;
}

export function reportesDePeriodo(reportes, periodo) {
  return reportes.filter((r) => r.periodo === periodo);
}

/* Lo que una oficina receptora puede ver: lo que las áreas le entregaron al
   enviar, según la matriz. Nunca un borrador. */
export function reportesRecibidosPor(reportes, claveOficina) {
  return reportes.filter((r) => estaEntregado(r.estado) && r.remision?.destinos.includes(claveOficina));
}

/* Lo que ve Planeamiento: lo entregado por las nueve áreas, como el backend con
   `reporte.ver` global. Nunca un borrador. */
export function reportesEntregados(reportes) {
  return reportes.filter((r) => estaEntregado(r.estado));
}

/* Cada cosa recibida por una oficina, con su estado: 'vigente', o 'desactualizada' si
   Estadística reabrió el mes y lo recibido quedó atrás. */
export function recepcionesDe(reportes, claveOficina) {
  return reportes.flatMap((r) => {
    if (estaEntregado(r.estado) && r.remision?.destinos.includes(claveOficina)) return [{ reporte: r, estado: 'vigente', fecha: r.remision.fecha ?? r.enviadoEn }];
    if (!estaEntregado(r.estado) && r.remisionAnterior?.destinos.includes(claveOficina)) return [{ reporte: r, estado: 'desactualizada', fecha: r.remisionAnterior.fecha ?? null }];
    return [];
  });
}

export function fijarRecibidos(recibidos) {
  emitir({ ...estado, recibidos, recibidosFallaron: false });
}

export function marcarFalloDeRecibidos() {
  emitir({ ...estado, recibidosFallaron: true });
}

export function recibidosFallaron() {
  return estado.recibidosFallaron;
}

export function validadoPara(reporte, claveOficina) {
  return reporte.estado === 'remitido' && reporte.remision?.destinos.includes(claveOficina);
}

/* ------------------------------------------------------------ transiciones */

function sufijo(claveArea, periodo) {
  return `${periodo}-${area(claveArea).sigla}`;
}

/* Aplica una acción del flujo. Devuelve el reporte resultante, o null si la
   máquina de estados no permite esa acción desde ese estado y con ese rol.

   `enviar` emite aquí el folio y la constancia, y entrega a la vez a las
   oficinas de la matriz: los destinos no se eligen (CLAUDE.md § 3.2). */
export function aplicarTransicion(claveArea, periodo, accion, { actor, rol } = {}) {
  const actual = reporteDe(estado.reportes, claveArea, periodo);
  const estadoActual = actual?.estado ?? 'no_iniciado';

  if (!puede(estadoActual, accion, rol)) {
    /* No se lanza una excepción: una pantalla que ofrece una acción imposible
       es un error de programación, y en desarrollo conviene verlo sin que se
       caiga la demo. */
    if (import.meta.env?.DEV) {
      console.warn(`aplicarTransicion: «${accion}» no está permitida desde «${estadoActual}» para el rol «${rol}».`);
    }
    return null;
  }

  const t = transicion(accion);
  const ahora = `${HOY}T12:00`;
  const base = actual ?? {
    id: `${claveArea}:${periodo}`,
    area: claveArea,
    periodo,
    folio: null,
    constancia: null,
    enviadoEn: null,
    datos: {},
    remision: null,
    historial: [],
  };

  const siguiente = {
    ...base,
    estado: t.hasta,
    historial: [...base.historial, { accion, estado: t.hasta, fecha: ahora, actor, nota: t.descripcion }],
  };

  if (accion === 'enviar') {
    siguiente.folio = base.folio ?? `RE-${sufijo(claveArea, periodo)}`;
    siguiente.constancia = `CR-${sufijo(claveArea, periodo)}`;
    siguiente.enviadoEn = ahora;
    siguiente.remision = { acta: `AR-${sufijo(claveArea, periodo)}`, fecha: ahora, actor, destinos: destinosDe(claveArea).filter((d) => d !== 'estadistica') };
  }

  if (accion === 'rectificar') {
    /* La remisión anterior se conserva: es la prueba de que esas oficinas ya
       recibieron una versión que ahora quedó desactualizada. */
    siguiente.remisionAnterior = base.remision;
    siguiente.remision = null;
  }

  const resto = estado.reportes.filter((r) => r.id !== siguiente.id);
  emitir({ ...estado, reportes: [...resto, siguiente] });
  return siguiente;
}

/* Carga un archivo en el reporte: reemplaza todos los datos por los leídos y
   guarda de dónde salieron. Solo en borrador; si el reporte no existía, lo
   abre, porque subir el archivo es la forma de empezarlo. */
export function registrarCarga(claveArea, periodo, { datos, carga, actor }) {
  let actual = reporteDe(estado.reportes, claveArea, periodo);
  if (!actual) actual = aplicarTransicion(claveArea, periodo, 'crear', { actor, rol: 'area' });
  if (!actual || actual.estado !== 'borrador') return null;

  const siguiente = { ...actual, datos, carga };
  emitir({
    ...estado,
    reportes: estado.reportes.map((r) => (r.id === siguiente.id ? siguiente : r)),
  });
  return siguiente;
}

/* Guarda el formulario sin cambiar de estado. Solo en borrador. */
export function guardarDatos(claveArea, periodo, datos) {
  const actual = reporteDe(estado.reportes, claveArea, periodo);
  if (!actual || actual.estado !== 'borrador') return null;

  const siguiente = { ...actual, datos: { ...actual.datos, ...datos } };
  emitir({
    ...estado,
    reportes: estado.reportes.map((r) => (r.id === siguiente.id ? siguiente : r)),
  });
  return siguiente;
}

/* --------------------------------------------------- datos reales del backend

   Única función que usa servicios/api.js para escribir en el store: reemplaza
   las entradas de `claveArea` dentro de `periodos` por `lista` (ya en esta
   misma forma de reporte), y dejar todas las demás áreas y periodos intactos.

   `periodos` incluye también los que no tienen reporte real: por eso se
   recorren para poder BORRAR una entrada simulada que ya no debe estar (un
   reporte que no existe no se almacena; su ausencia ES el estado
   `no_iniciado`), no solo para agregar las que sí llegaron. */
export function sincronizarReportesReales(claveArea, periodos, lista) {
  const propios = new Set(periodos.map((p) => `${claveArea}:${p}`));
  const resto = estado.reportes.filter((r) => !propios.has(r.id) || protegidos.has(r.id));
  emitir({ ...estado, reportes: [...resto, ...lista.filter((r) => !protegidos.has(r.id))] });
}

/* Escribe un reporte real (reemplaza el que tenga el mismo id, o lo agrega) sin
   tocar los demás: así la sincronización puede ir entregando los reportes de
   uno en uno, a medida que llegan, y no todos juntos al final. */
export function fusionarReporteReal(reporte) {
  if (protegidos.has(reporte.id)) return;
  escribirReporte(reporte);
}

/* La práctica del tutorial (servicios/practica.js). Lo que el servidor trae
   mientras tanto no pisa el mes que se está practicando; lo demás entra normal. */
let protegidos = new Set();

export function protegerReportes(ids) {
  protegidos = new Set(ids);
}

export function escribirReporte(reporte) {
  emitir({ ...estado, reportes: [...estado.reportes.filter((r) => r.id !== reporte.id), reporte] });
}

export function fijarReportes(reportes) {
  emitir({ ...estado, reportes });
}

/* Devuelve el prototipo a su estado sembrado. Existe para poder repetir la
   demostración sin recargar la página y perder el modo oscuro. */
/* Reiniciar es empezar de cero, también lo que Farmacia subió en este
   navegador. */
export function reiniciarDatos() {
  borrarGuardados();
  emitir({ ...estado, ...semilla, boletinEditorial: {}, actividades: {} });
}

/* Modo real: el almacén deja de sembrar datos simulados y empieza vacío. Lo
   llama servicios/api.js al cargarse con VITE_API_URL (este archivo no puede
   saber el modo: `datos/` no importa de `servicios/`). Después, solo hay lo
   que el backend devuelve. */
export function usarSoloDatosReales() {
  semilla = SEMILLA_VACIA;
  emitir({ ...estado, ...semilla, actividades: {} });
}

/* Lo contrario. Solo para la prueba de humo, que comprueba los dos modos en
   la misma corrida. */
export function usarDatosSimulados() {
  semilla = SEMILLA_SIMULADA;
  emitir({ ...estado, ...semilla, reportes: reportesDeInicio() });
}

/* --------------------------------------------------- datos de Estadística */

/* Lo que el servidor sabe de un año: reemplaza esos meses, y solo esos. */
export function fijarPropios(porPeriodo) {
  emitir({ ...estado, propios: { ...estado.propios, ...porPeriodo } });
}

export function guardarPropio(periodo, clave, valor) {
  const delPeriodo = { ...estado.propios[periodo] };
  if (valor == null) delete delPeriodo[clave];
  else delPeriodo[clave] = valor;
  emitir({ ...estado, propios: { ...estado.propios, [periodo]: delPeriodo } });
}

/* ------------------------------------------ actividades operativas (POI) */

/* `valor` null borra lo escrito: el mes vuelve a su cálculo, o queda por
   digitar. */
export function registrarEjecucion(anio, codigo, mes, { valor, nota = '', actor = null, fecha = new Date().toISOString() }) {
  const delAnio = estado.actividades[anio] ?? {};
  const deLaActividad = { ...delAnio[codigo] };
  if (valor == null) delete deLaActividad[mes];
  else deLaActividad[mes] = { valor, nota, actor, fecha };
  emitir({ ...estado, actividades: { ...estado.actividades, [anio]: { ...delAnio, [codigo]: deLaActividad } } });
}

/* Lo que devolvió el servidor para un año reemplaza lo que había de ese año. */
export function fijarActividades(anio, registros) {
  emitir({ ...estado, actividades: { ...estado.actividades, [anio]: registros } });
}

export function registroDe(actividades, anio, codigo, mes) {
  return actividades?.[anio]?.[codigo]?.[mes] ?? null;
}

/* ------------------------------------------------- editorial del boletín */

/* `ruta` es «parte.campo» (`portada.titulo`, `separadores.nutricion`). Solo se
   guarda lo que Estadística cambió; el resto sale de `boletin/editorial.js`. */
export function editarBoletin(periodo, ruta, valor) {
  const [parte, campo] = ruta.split('.');
  if (!parte || !campo) return;
  const delPeriodo = estado.boletinEditorial[periodo] ?? {};
  const siguiente = { ...delPeriodo, [parte]: { ...delPeriodo[parte], [campo]: valor } };
  emitir({ ...estado, boletinEditorial: { ...estado.boletinEditorial, [periodo]: siguiente } });
}

export function restablecerBoletin(periodo) {
  const resto = { ...estado.boletinEditorial };
  delete resto[periodo];
  emitir({ ...estado, boletinEditorial: resto });
}

/* ----------------------------------------------------- remisión a DIRESA */

export function remisionDiresaDe(remisiones, periodo) {
  return remisiones.find((r) => r.periodo === periodo) ?? null;
}

/* Una sola remisión por periodo. Remitir otra vez el mismo mes sería una
   rectificación ante DIRESA, que es otro trámite. */
export function registrarRemisionDiresa(periodo, { actor, faltantes = [] }) {
  if (remisionDiresaDe(estado.remisionesDiresa, periodo)) return null;
  const registro = {
    id: `diresa:${periodo}`,
    periodo,
    fecha: `${HOY}T12:00`,
    actor,
    constancia: `DIR-${periodo}`,
    formatos: ['servicios-intermedios', 'indicadores'],
    faltantes,
  };
  emitir({ ...estado, remisionesDiresa: [...estado.remisionesDiresa, registro] });
  return registro;
}

/* ------------------------------------------ simulación para la demostración

   Hace que las áreas que no entregaron un periodo lo llenen y lo envíen, con
   datos simulados. Pasa por las mismas transiciones que un envío real —abrir,
   guardar, enviar—, así que no se salta ninguna regla. No forma parte del
   sistema: existe para mostrar la bandeja llenándose. */
export function simularEnvioPendientes(periodo) {
  let enviados = 0;
  for (const a of AREAS) {
    if (simularEntrega(a.clave, periodo)) enviados += 1;
  }
  return enviados;
}

/* ------------------------------------------------------- herramientas de prueba

   Para ensayar el flujo de un área una y otra vez: entregar en un clic, o
   deshacer la entrega y volver al paso 1. Solo se ofrecen en las sesiones que
   abrió `admin` («Ver como…»); un usuario real nunca las ve.

   NO son pasos del flujo. La máquina de estados sigue sin «retirar una
   entrega»: nadie devuelve reportes (dominio/estados.js). Por eso no
   inventan un estado ni una acción del historial: deshacer es descartar el
   registro —su ausencia es `no_iniciado`, como en `reiniciarDatos`— y, si se
   conservan las cifras, volver a abrirlo con las transiciones de siempre. */

/* Llena el reporte con los datos de ejemplo y lo envía, por las transiciones
   de siempre (abrir, guardar, enviar). Si ya estaba entregado, no hace nada. */
export function simularEntrega(claveArea, periodo) {
  const actual = reporteDe(estado.reportes, claveArea, periodo);
  if (actual && estaEntregado(actual.estado)) return null;
  const actor = usuarioDeArea(claveArea)?.nombre ?? area(claveArea).nombreCorto;
  if (!actual) aplicarTransicion(claveArea, periodo, 'crear', { actor, rol: 'area' });
  guardarDatos(claveArea, periodo, datosSembrados(claveArea, periodo));
  return aplicarTransicion(claveArea, periodo, 'enviar', { actor, rol: 'area' });
}

/* Borra el reporte del periodo: vuelve a «no iniciado» y al paso 1. */
export function descartarReporte(claveArea, periodo) {
  const id = `${claveArea}:${periodo}`;
  if (!estado.reportes.some((r) => r.id === id)) return false;
  emitir({ ...estado, reportes: estado.reportes.filter((r) => r.id !== id) });
  return true;
}

/* Deshace la entrega conservando las cifras y el archivo: el reporte vuelve a
   «en llenado» sin folio, constancia ni remisión, como si nunca se hubiera
   enviado. Se descarta y se vuelve a abrir, así que el historial también
   empieza de nuevo. */
export function devolverABorrador(claveArea, periodo) {
  const actual = reporteDe(estado.reportes, claveArea, periodo);
  if (!actual || !estaEntregado(actual.estado)) return null;
  const actor = usuarioDeArea(claveArea)?.nombre ?? area(claveArea).nombreCorto;
  descartarReporte(claveArea, periodo);
  if (actual.carga) return registrarCarga(claveArea, periodo, { datos: actual.datos, carga: actual.carga, actor });
  aplicarTransicion(claveArea, periodo, 'crear', { actor, rol: 'area' });
  return guardarDatos(claveArea, periodo, actual.datos);
}
