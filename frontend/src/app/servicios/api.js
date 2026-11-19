/* Cliente del backend.

   Dos modos, igual que servicios/bot-validador.js:

     real   si está definida VITE_API_URL: cada operación es una petición HTTP
            a /api (proxy de Vite hacia VITE_API_URL). Un área sin formato activo
            en el servidor no opera (`motivoSinServidor`).
     mock   sin VITE_API_URL (el prototipo): se delega en las funciones que YA
            existen en datos/store.js. No es un motor de mentira aparte: es el
            mismo motor de siempre, para que el modo sin backend no cambie en nada.

   El store no se vuelve asíncrono. Este archivo es la única pieza que espera
   una promesa; al resolver, escribe en el store con las funciones síncronas
   de siempre (o con `sincronizarReportesReales`/`fijarPlazosReales`, las
   nuevas). Las pantallas no saben en qué modo están, igual que con el bot. */

import { aplicarTransicion, descartarReporte, sesionVencida, fijarRecibidos, marcarFalloDeRecibidos, fijarSincronizacion, sincronizarReportesReales, fijarPlazosReales, fijarAlertasReales, usarSoloDatosReales, usarDatosSimulados, fijarConfiguracion, fusionarReporteReal, leerEstado, registrarEjecucion, fijarActividades, fijarPropios, guardarPropio } from '@/app/datos/store.js';
import { AREAS } from '@/app/datos/areas.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { FORMATOS as FORMATOS_NUTRICION } from '@/app/datos/formatos/nutricion.js';
import { totalFormato } from '@/app/datos/formatos/nutricion-calculos.js';
import { anidar as anidarFarmacia } from '@/app/datos/formatos/farmacia-calculos.js';
import { anidar as anidarEpidemiologia } from '@/app/datos/formatos/epidemiologia-calculos.js';
import { porNombreDeUsuario } from '@/app/datos/usuarios.js';
import { ROL } from '@/app/dominio/roles.js';
import { enPractica, justificarEnPractica, reporteDePractica, subirEnPractica, transicionarEnPractica } from '@/app/servicios/practica.js';

const URL_API = import.meta.env?.VITE_API_URL ?? null;

/* Áreas con datos reales en el backend, y el código de su formato. Hoy, solo
   Nutrición: es la única con una estructura instalada. Cuando otra área tenga
   la suya, se agrega su clave aquí y ninguna pantalla cambia. */
/* Clave del área → código de su formato. Hasta que llega GET /configuracion
   (`cargarConfiguracion`), Nutrición, la única con formato instalado cuando se
   escribió esto; después, lo que el servidor dice que está en el flujo: un
   área se activa o se pausa desde el panel del superadministrador, no aquí. */
let AREAS_REALES = Object.freeze({ nutricion: 'NUT' });
/* Si el servidor ya dijo cuáles son. Antes de saberlo no se afirma que a nadie le falte. */
let flujoConocido = false;

export const MODO_API = URL_API
  ? Object.freeze({
      tipo: 'real',
      texto: `Servicio en ${URL_API}`,
      detalle: 'Las áreas con su formato activo en el servidor guardan ahí sus reportes. Un área sin formato activo no puede subir nada.',
    })
  : Object.freeze({
      tipo: 'mock',
      texto: 'Datos en memoria (sin backend)',
      detalle: 'Arranque con VITE_API_URL=http://localhost:8000 npm run dev para usar el backend real.',
    });

/* Si esta área tiene datos reales en el backend. La exporta la pantalla
   (`ReporteNutricion.jsx`) para decidir si sube el Excel al backend o si sigue
   con el bot embebido, sin duplicar `AREAS_REALES` ni la condición. */
/* Las áreas cuyo formato está instalado en la base de datos, si hay backend.
   Sin backend no hay base, y la lista es vacía: el boletín, que solo publica
   lo que está en la base, no muestra ningún capítulo. */
export function areasEnBase() {
  return URL_API ? Object.keys(AREAS_REALES) : [];
}

export function esAreaReal(claveArea) {
  return Boolean(URL_API) && claveArea in AREAS_REALES;
}

/* Por qué un área no puede guardar en el servidor, con el sistema conectado a él:
   'sin-configuracion' si el servidor aún no dijo qué áreas reportan, 'fuera-del-flujo'
   si dijo que esta no. null si puede guardar o si no hay servidor (el prototipo).

   Existe por una pérdida real (03/11/2026): Gineco-Obstetricia, sin formato en la base
   desplegada, subió su Excel, lo revisó y lo envió contra el almacén del navegador, con
   constancia y todo; nada llegó al servidor y al recargar no quedaba nada. El modo en
   memoria es del prototipo: con servidor, lo que no se puede guardar no se ofrece. */
export function motivoSinServidor(claveArea) {
  if (!soloReales || enPractica(claveArea) || esAreaReal(claveArea)) return null;
  return flujoConocido ? 'fuera-del-flujo' : 'sin-configuracion';
}

/* Con el backend, el almacén no siembra nada: Estadística ve lo que de verdad
   se envió, y nada más. Lo llama main.jsx antes del primer render, para que
   no llegue a pintarse un dato simulado. Explícito y no al importar este
   módulo: la prueba de humo lo importa para probar el cliente sin que el
   prototipo se quede sin sus datos. */
let soloReales = false;

export function prepararAlmacen(real = Boolean(URL_API)) {
  soloReales = real;
  if (real) usarSoloDatosReales();
  else usarDatosSimulados();
}

/* Si la aplicación corre solo con datos del servidor. Es lo que decide el
   universo de áreas y si se ofrecen las herramientas de la demostración; no
   la variable de entorno a secas, para que la prueba de humo pueda revisar el
   prototipo y el modo real en la misma corrida. */
export function usaSoloDatosReales() {
  return soloReales;
}

/* Las áreas que reportan por el sistema: con el backend, las que el servidor dice
   que tienen su formato activo; en el prototipo, todas. Es el universo de
   Cumplimiento, la Bandeja y la Remisión: contar como «atrasada» a un área que
   todavía no puede enviar por aquí afirmaría un incumplimiento que no existe.

   Mientras no se sabe, todas: si la configuración no llegaba (el servidor aún
   arrancando al abrir la página), Cumplimiento se quedaba en «1 de 1» con las otras
   ocho rotuladas como fuera del sistema, y nada lo volvía a pedir. */
export function areasDelFlujo() {
  return soloReales && flujoConocido ? AREAS.filter((a) => a.clave in AREAS_REALES) : AREAS;
}

/* Las áreas que todavía no reportan por el sistema (con el backend). Las
   pantallas las nombran para que «1 de 1» no se lea como «todas». */
export function areasFueraDelFlujo() {
  return soloReales && flujoConocido ? AREAS.filter((a) => !(a.clave in AREAS_REALES)) : [];
}

/* La fecha de hoy, según el reloj del backend (hora de Lima), no el del
   navegador. `null` si no se pudo pedir (backend caído): quien llama decide
   el respaldo (`dominio/periodos.js::fechaHoyNavegador`), nunca `new Date()`
   a secas. */
export async function hoyDelBackend() {
  const r = await pedir('/salud');
  return r.ok ? r.body?.hoy ?? null : null;
}

let token = null;

/* El token de la sesión, para el otro cliente que lo usa: el de hospitalización
   (`servicios/hospitalizacion.js`), cuya API lee el mismo token (decisión 0011 de
   Egresos Hospitalarios). Nadie más lo necesita fuera de este archivo. */
export const tokenDeSesion = () => token;

/* La red de seguridad de la práctica del tutorial: nada que escriba sale de aquí.
   Lo que se practica se simula en las funciones de abajo; si algo nuevo llegara
   hasta el servidor sin pasar por ellas, falla en lugar de guardar. */
const RECHAZO_PRACTICA = { ok: false, status: null, body: { detail: 'En el tutorial no se guarda nada.' } };

const SIN_CONEXION = { ok: false, status: null, body: { detail: 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.' } };

function mensajeDeFallo(status) {
  if ([502, 503, 504].includes(status)) return 'El servidor no está disponible en este momento. Intente de nuevo en unos minutos.';
  if (status === 413) return 'El archivo es demasiado grande para el servidor.';
  return `Ocurrió un problema en el servidor (código ${status}). Intente de nuevo; si continúa, avise a Estadística.`;
}

/* La respuesta en una sola forma. Lo que no es JSON (un error de nginx, una página
   de error) ya no se confunde con «no hay conexión»: el servidor sí respondió.
   Un 401 con sesión abierta es que el token venció: seguir en pantalla solo
   mostraría datos viejos y errores al actuar. */
function responder(r, texto, ruta) {
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }
  if (!r.ok && !cuerpo?.detail) cuerpo = { ...cuerpo, detail: mensajeDeFallo(r.status) };
  if (r.status === 401 && token && !ruta.startsWith('/auth/')) {
    token = null;
    sesionVencida();
  }
  return { ok: r.ok, status: r.status, body: cuerpo };
}

async function pedir(ruta, { method = 'GET', body, params } = {}) {
  if (enPractica() && method !== 'GET' && !ruta.startsWith('/auth')) return RECHAZO_PRACTICA;
  const query = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))).toString()
    : '';
  try {
    const r = await fetch(`/api${ruta}${query}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return responder(r, await r.text(), ruta);
  } catch {
    return SIN_CONEXION;
  }
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* Como `pedir`, pero con el archivo en `multipart/form-data`: el endpoint de
   carga lo espera así (`UploadFile` de FastAPI), no como JSON. Sin
   `Content-Type` a mano: el navegador pone el boundary del multipart solo. */
async function pedirArchivo(ruta, archivo) {
  if (enPractica()) return RECHAZO_PRACTICA;
  const cuerpo = new FormData();
  const bytes = await archivo.arrayBuffer();
  cuerpo.append('archivo', new Blob([bytes], { type: XLSX }), archivo.name);
  try {
    const r = await fetch(`/api${ruta}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: cuerpo,
    });
    return responder(r, await r.text(), ruta);
  } catch {
    return SIN_CONEXION;
  }
}

/* ------------------------------------------------------------------ sesión */

/* De la forma del backend (`DatosUsuario`) a la que ya usan las pantallas
   (`datos/usuarios.js`): { id, usuario, nombre, cargo, correo, roles, area?,
   oficina? }. Las claves de unidad ya coinciden (`nutricion`, `planeamiento`…),
   así que no hace falta traducirlas. */
function usuarioDesdeBackend(datos) {
  const deArea = datos.asignaciones.find((a) => (a.rol === 'digitador' || a.rol === 'admin') && a.unidad);
  const deOficina = datos.asignaciones.find((a) => a.rol === 'consulta' && a.unidad);
  /* El backend no le da rol de interfaz al superadmin («administra el sistema,
     no reporta ni recibe»), y con `roles: []` la sesión no tenía ni un panel y
     la página quedaba en blanco. En la interfaz es la cuenta de
     administración, la misma que `admin` del prototipo. Va al final: si algún
     día lleva además un rol del flujo, entra por ese. */
  const esSuperadmin = datos.asignaciones.some((a) => a.rol === 'superadmin');
  return {
    id: datos.id,
    usuario: datos.usuario,
    nombre: datos.nombre,
    cargo: datos.cargo,
    correo: datos.correo,
    roles: esSuperadmin ? [...datos.roles_de_interfaz, ROL.ADMIN] : datos.roles_de_interfaz,
    veMonitoreo: Boolean(datos.ve_monitoreo),
    /* Los permisos de todas sus asignaciones, como vienen en el token. Deciden
       los módulos que no dependen del rol sino de un permiso (los indicadores
       de desempeño): el menú no adivina quién puede entrar, lo dice la base. */
    permisos: [...new Set(datos.asignaciones.flatMap((a) => a.permisos ?? []))].sort(),
    ...(deArea ? { area: deArea.unidad } : {}),
    ...(deOficina ? { oficina: deOficina.unidad } : {}),
  };
}

/* `{ ok: true, usuario, token } | { ok: false, error }`. En modo mock, el
   comportamiento es exactamente el de hoy: cualquier contraseña entra. */
export async function login(nombreUsuario, clave) {
  if (!URL_API) {
    const encontrado = porNombreDeUsuario(nombreUsuario);
    return encontrado
      ? { ok: true, usuario: encontrado, token: null }
      : { ok: false, error: 'Ese usuario no existe en el prototipo. Use uno de los accesos directos de la derecha.' };
  }
  const r = await pedir('/auth/login', { method: 'POST', body: { usuario: nombreUsuario, clave } });
  if (!r.ok) return { ok: false, error: mensajeDe(r.body, 'No se pudo ingresar.') };
  token = r.body.token;
  /* Con contraseña provisional el token solo sirve para cambiarla: cualquier
     otra petición responde 403. Quien llama debe pedir el cambio antes de
     abrir la sesión, o la entraría a pantallas que no pueden cargar nada. */
  return { ok: true, usuario: usuarioDesdeBackend(r.body.usuario), token: r.body.token, debeCambiarClave: Boolean(r.body.debe_cambiar_clave) };
}

/* `{ ok: true, usuario } | { ok: false, error }`. Devuelve un token nuevo, ya
   sin la marca de cambio obligatorio, que reemplaza al provisional. */
export async function cambiarClave(claveActual, claveNueva) {
  const r = await pedir('/auth/cambiar-clave', { method: 'POST', body: { clave_actual: claveActual, clave_nueva: claveNueva } });
  if (!r.ok) return { ok: false, error: mensajeDe(r.body, 'No se pudo cambiar la contraseña.') };
  token = r.body.token;
  return { ok: true, usuario: usuarioDesdeBackend(r.body.usuario) };
}

/* El `detail` de FastAPI llega como texto, como lista de problemas (la regla
   de contraseñas) o como lista de errores de validación ({ msg }). */
function mensajeDe(cuerpo, respaldo) {
  const d = cuerpo?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => (typeof x === 'string' ? x : x?.msg)).filter(Boolean).join(' ') || respaldo;
  return respaldo;
}

/* ------------------------------------------------------------ transiciones */

/* De GET …/valores (cuadros → indicadores → casillas) a la forma `datos` que usan
   las pantallas de Nutrición: { f1: { 'asistencial.desayuno': [día 1, día 2, …] },
   ilegibles: { 'f1|asistencial.desayuno|3': 'cuarenta' } }.

   El código del indicador es `{cuadro}.{fila}` (`f1.asistencial.desayuno`): la fila
   es lo que sigue al cuadro. Un día sin casilla queda en null, no en 0: la ausencia
   de dato no se rellena. Sin cuadros (sin Excel aceptado), `{}`. */
function datosDesdeValores(cuerpo) {
  if (!cuerpo?.cuadros?.length) return {};
  const datos = { ilegibles: {} };
  for (const c of cuerpo.cuadros) {
    const cuadro = {};
    for (const i of c.indicadores) {
      const fila = i.indicador.slice(c.cuadro.length + 1);
      /* Un formato mensual (Laboratorio) tiene una sola casilla por indicador, sin
         día: su dato es la cifra, no una lista. Un diario espera un mes de días
         (28 o más), así que una casilla esperada no se confunde con él. */
      if (i.casillas_esperadas === 1) {
        const casilla = i.casillas.find((x) => x.dia == null);
        cuadro[fila] = casilla?.valor == null ? null : Number(casilla.valor);
        if (casilla?.texto_original != null) datos.ilegibles[`${c.cuadro}|${fila}`] = casilla.texto_original;
        continue;
      }
      const dias = Array.from({ length: i.casillas_esperadas }, () => null);
      for (const casilla of i.casillas) {
        if (casilla.dia == null) continue;
        dias[casilla.dia - 1] = casilla.valor == null ? null : Number(casilla.valor);
        if (casilla.texto_original != null) datos.ilegibles[`${c.cuadro}|${fila}|${casilla.dia}`] = casilla.texto_original;
      }
      cuadro[fila] = dias;
    }
    datos[c.cuadro] = cuadro;
  }
  return datos;
}

/* De GET …/revision a lo que guarda el store junto al reporte: la `carga` (la misma
   forma que arma `aplicarCarga` con el informe del bot), el `informe` completo —para
   volver a pintar la revisión sin llamarle al bot otra vez— y las justificaciones de
   los avisos, por la clave del aviso (que es su `id` en el informe). */
function revisionParaElStore(cuerpo) {
  const informe = cuerpo?.carga?.informe ?? null;
  return {
    /* La fecha, la de la base: la del informe la escribe el bot en UTC y sin zona, y se
       leía cinco horas adelantada en «Subido el». */
    carga: informe ? { archivo: informe.archivo, fecha: cuerpo.carga.fecha ?? informe.fecha, plantilla: informe.plantilla, origen: informe.origen, leidas: informe.leidas } : null,
    informe,
    /* Los avisos justificados y, desde el 27/10/2026, los errores de una carga
       histórica que se entregó documentada (ver dominio/transiciones.py del
       backend): Estadística lee por qué salió así. */
    justificaciones: Object.fromEntries((cuerpo?.hallazgos ?? []).filter((h) => (h.nivel === 'aviso' || h.nivel === 'error') && h.justificacion).map((h) => [h.clave, h.justificacion])),
  };
}

/* Del detalle del backend a la forma que ya usa el store. Cinco decisiones,
   ver docs/API_BACKEND.md § Desajustes de contrato:

     folio          siempre null: el backend no tiene uno separado de la
                    constancia, y no se inventa.
     remision.acta  siempre null, por la misma razón (no hay «AR-…» real).
     remision       las remisiones vigentes de `remisiones[]`: desde el
                    12/10/2026 se crean todas al enviar, a las oficinas de la
                    matriz (las superadas por una rectificación no cuentan).
     historial[].actor   no viene: se omite (la Timeline del kit ya no pinta
                    esa columna si el dato falta). Pendiente del backend:
                    unir con auditoria.registro_cambio.
     datos          las casillas, de GET .../valores (`datosDesdeValores`), con
                    las justificaciones de GET .../revision. Antes quedaba en {}
                    y el reporte enviado se veía vacío. */
function reporteDesdeDetalle(claveArea, periodo, d, { datos = {}, carga = null, informe = null } = {}) {
  const vigentes = d.remisiones.filter((r) => r.es_vigente);
  return {
    id: `${claveArea}:${periodo}`,
    area: claveArea,
    periodo,
    /* Marca de que el reporte salió de la base de datos y no de la siembra
       del prototipo. El boletín solo publica reportes con esta marca. */
    origen: 'bd',
    estado: d.estado,
    folio: null,
    constancia: d.folio_constancia,
    enviadoEn: d.fecha_envio,
    datos,
    carga,
    informe,
    remision: d.estado === 'remitido' ? { acta: null, fecha: vigentes[0]?.fecha ?? d.fecha_envio, destinos: vigentes.map((r) => r.destino) } : null,
    historial: d.historial.map((h, i) => ({ key: i, accion: h.accion, estado: h.estado_destino, fecha: h.fecha, nota: h.comentario })),
  };
}

/* Las áreas que guardan una cifra por casilla con ruta (`f1.sis.hosp`,
   `f1.e0.neonatologia_m`) y cuyas pantallas la leen anidada. Imágenes no
   está: sus pantallas leen los formatos del informe del bot, no sus cuadros
   planos de la base. */
const ANIDAR = Object.freeze({ farmacia: anidarFarmacia, epidemiologia: anidarEpidemiologia });

/* Un reporte real completo: el detalle, sus casillas y su revisión, en paralelo.
   Si las casillas o la revisión no se pueden leer (403: una cuenta que solo ve el
   estado), el reporte llega sin ellas en lugar de fallar entero. */
async function traerReporte(claveArea, periodo, formato = AREAS_REALES[claveArea]) {
  const [d, v, rev] = await Promise.all([
    pedir(`/reportes/${formato}/${periodo}`),
    pedir(`/reportes/${formato}/${periodo}/valores`),
    pedir(`/reportes/${formato}/${periodo}/revision`),
  ]);
  if (!d.ok) return { ok: false, status: d.status, codigo: d.body?.codigo, detail: d.body?.detail };
  const { carga, informe, justificaciones } = rev.ok ? revisionParaElStore(rev.body) : { carga: null, informe: null, justificaciones: {} };
  const planas = v.ok ? datosDesdeValores(v.body) : {};
  const casillas = ANIDAR[claveArea]?.(planas) ?? planas;
  /* Las filas que el Excel de ese mes no traía y lo que el lector decidió por su
     cuenta (una fila leída por su lugar) no están en las casillas: vienen del
     informe del bot guardado con la carga. Sin ellos, revalidar daría por
     vacías filas que ese mes no aplican. */
  const delInforme = informe?.datos ?? {};
  /* Laboratorio trae además los totales que su Excel tenía escritos (`escritos`):
     no son casillas, pero la pantalla los muestra junto al total calculado. */
  /* Lavandería cataloga como indicador solo su cuadro f1 (ver el comentario de
     definicion.js del bot): los demás cuadros («f2», «f3», «f4») no están en
     `casillas` (que sale de `/valores`, es decir, de la base), solo en el
     informe del bot que se guardó con la carga. Sin esto, la pantalla los
     mostraría vacíos después de recargar, aunque el Excel sí los traía. Se
     trae cualquier clave del informe que `casillas` no tenga ya; donde las dos
     coinciden (p. ej. «f1»), gana `casillas`, la que persiste la base. */
  const datos = Object.keys(casillas).length
    ? {
        ...Object.fromEntries(Object.entries(delInforme).filter(([clave]) => !(clave in casillas))),
        ...casillas,
        justificaciones,
        ...(delInforme.ausentes ? { ausentes: delInforme.ausentes } : {}),
        ...(delInforme.lectura ? { lectura: delInforme.lectura } : {}),
        ...(delInforme.escritos ? { escritos: delInforme.escritos } : {}),
      }
    : {};
  return { ok: true, reporte: reporteDesdeDetalle(claveArea, periodo, d.body, { datos, carga, informe }) };
}

/* Trae un reporte real del backend y lo deja en el store. Es lo que usa la pantalla
   después de subir un Excel: el backend ya persistió las casillas y pudo conservar
   justificaciones de avisos repetidos, así que el store se toma de ahí, no del informe. */
export async function sincronizarReporte(claveArea, periodo) {
  if (enPractica(claveArea)) return reporteDePractica(claveArea, periodo);
  if (!esAreaReal(claveArea)) return { ok: true, reporte: null };
  const r = await traerReporte(claveArea, periodo);
  if (r.ok) sincronizarReportesReales(claveArea, [periodo], [r.reporte]);
  return r;
}

/* Mueve un reporte en el flujo. En modo real: la transición y, si aceptó, el
   reporte fresco (detalle, casillas y revisión), porque la respuesta de la
   transición no trae el historial ni las remisiones completas. Actualiza el store en los
   dos modos, así que quien llama no necesita sincronizar nada más; el valor
   devuelto es solo para lo que la propia pantalla quiera hacer con él (como
   mostrar la constancia). */
export async function transicionar(claveArea, periodo, accion, { actor, rol, comentario } = {}) {
  if (enPractica(claveArea)) return transicionarEnPractica(claveArea, periodo, accion, { actor, rol });
  /* La última barrera, aunque una pantalla llegara hasta aquí: una constancia sin nada
     guardado es peor que un error, porque el área da el mes por entregado. */
  if (motivoSinServidor(claveArea)) return { ok: false, status: null, detail: 'Esta área no puede guardar en el servidor en este momento: el reporte no se envió. Avise a Estadística.' };
  if (!esAreaReal(claveArea)) {
    /* Sin `detail`, a propósito: aquí el único motivo de fallo es un botón que
       la propia pantalla no debió ofrecer (aplicarTransicion ya lo avisó por
       consola). Quien llama distingue este caso silencioso de un error real
       mirando si hay `detail`, no si hay `status`. */
    const resultado = aplicarTransicion(claveArea, periodo, accion, { actor, rol });
    return resultado ? { ok: true, reporte: resultado } : { ok: false, status: null };
  }

  const formato = AREAS_REALES[claveArea];
  const cuerpo = {};
  if (comentario) cuerpo.comentario = comentario;

  const r = await pedir(`/reportes/${formato}/${periodo}/transiciones/${accion}`, { method: 'POST', body: cuerpo });
  if (!r.ok) return { ok: false, status: r.status, codigo: r.body?.codigo, detail: r.body?.detail, datos: r.body?.datos };

  const fresco = await traerReporte(claveArea, periodo);
  if (!fresco.ok) return fresco;
  sincronizarReportesReales(claveArea, [periodo], [fresco.reporte]);
  return { ok: true, reporte: fresco.reporte };
}

/* Retira un reporte por un error de periodo o cifras. En el backend es borrado
   lógico y el motivo queda auditado; en el prototipo se descarta del almacén local. */
export async function retirarReporte(claveArea, periodo) {
  if (enPractica(claveArea)) return { ok: false, detail: 'La práctica es de solo lectura.' };
  if (!esAreaReal(claveArea)) {
    return descartarReporte(claveArea, periodo)
      ? { ok: true }
      : { ok: false, detail: 'No hay un reporte que retirar en este mes.' };
  }
  const r = await pedir(`/reportes/${AREAS_REALES[claveArea]}/${periodo}`, { method: 'DELETE' });
  if (!r.ok) return { ok: false, status: r.status, detail: r.body?.detail };
  const actualizado = await sincronizarReporte(claveArea, periodo);
  return actualizado.ok ? { ok: true } : actualizado;
}

/* ------------------------------------------------------------- recibidos */

/* Una fila de GET /oficinas/{clave}/recibidos, con la forma de un reporte del almacén
   para que el prototipo y el sistema se pinten igual. La oficina no ve el estado del
   reporte (un borrador de rectificación no es asunto suyo), sino si lo recibido sigue
   vigente: el estado de aquí solo dice eso. */
function recibidoDesdeBackend(claveOficina, f) {
  const vigente = f.estado_de_recepcion !== 'desactualizada';
  const remision = { acta: null, fecha: f.remisiones[0]?.fecha ?? null, destinos: [claveOficina] };
  return {
    id: `${f.unidad}:${f.periodo}`,
    area: f.unidad,
    formato: f.formato,
    periodo: f.periodo,
    origen: 'bd',
    estado: vigente ? 'remitido' : 'borrador',
    folio: null,
    constancia: f.constancia,
    enviadoEn: vigente ? remision.fecha : null,
    datos: {},
    carga: null,
    informe: null,
    remision: vigente ? remision : null,
    remisionAnterior: vigente ? null : remision,
    historial: [],
    resumen: true,
  };
}

/* Trae al almacén todo lo que una oficina recibió, de todos los meses. Sin servidor no
   hace nada: el prototipo lo deriva de sus reportes. */
export async function sincronizarRecibidos(claveOficina) {
  if (!soloReales || !claveOficina) return;
  const filas = [];
  let pagina = 1;
  let paginas = 1;
  do {
    const r = await pedir(`/oficinas/${claveOficina}/recibidos`, { params: { pagina, por_pagina: 100 } });
    if (!r.ok) {
      marcarFalloDeRecibidos();
      return;
    }
    filas.push(...r.body.filas);
    paginas = r.body.paginas;
    pagina += 1;
  } while (pagina <= paginas);
  fijarRecibidos(filas.map((f) => recibidoDesdeBackend(claveOficina, f)));
}

/* Un reporte recibido, completo, para abrirlo. No entra al almacén (ver el estado
   `recibidos` de store.js). El formato viene de la fila: un área pausada ya no figura
   en el flujo, y lo que entregó se sigue pudiendo leer. */
export function reporteRecibido(claveArea, periodo, formato) {
  return traerReporte(claveArea, periodo, formato ?? AREAS_REALES[claveArea]);
}

/* ----------------------------------------------------------- consolidado */

/* Los totales de cada cuadro, mes por mes, de los reportes entregados de un
   área y un año: [{ periodo, estado, totales: { f1, … } }]. Con el servidor, de
   GET /reportes/{formato}/anual/{año} (sumado de las casillas guardadas); en el
   prototipo, de los reportes del almacén. Un mes sin reporte entregado no
   aparece: quien lo pinta lo deja vacío, no en cero. */
export async function totalesDelAnio(claveArea, anio, reportes) {
  if (soloReales && esAreaReal(claveArea)) {
    const r = await pedir(`/reportes/${AREAS_REALES[claveArea]}/anual/${anio}`);
    if (!r.ok) return { ok: false, error: mensajeDe(r.body, 'No se pudo leer el consolidado.') };
    return { ok: true, meses: r.body.meses };
  }
  const meses = reportes
    .filter((rep) => rep.area === claveArea && rep.periodo.startsWith(`${anio}-`) && estaEntregado(rep.estado))
    .map((rep) => ({ periodo: rep.periodo, estado: rep.estado, totales: Object.fromEntries(FORMATOS_NUTRICION.map((f) => [f.id, totalFormato(rep.datos, f.id, rep.periodo) ?? 0])) }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  return { ok: true, meses };
}

/* -------------------------------------------------------- configuración */

/* Lo que el superadministrador configura y todos ven: nombre del sistema,
   mensaje del ingreso, aviso general, preferencias por omisión y qué áreas
   reportan por el sistema. Sin sesión: la pantalla de ingreso lo necesita.
   Si el servidor no responde, el sistema sigue con lo que ya tenía. */
export async function cargarConfiguracion() {
  if (!URL_API) return null;
  const r = await pedir('/configuracion');
  if (!r.ok) return null;
  AREAS_REALES = Object.freeze(Object.fromEntries(r.body.areas_en_flujo.map((a) => [a.clave, a.formato])));
  flujoConocido = true;
  const configuracion = {
    /* Para que App.jsx traiga los reportes de un área que recién entra al flujo. */
    areasEnFlujo: Object.keys(AREAS_REALES).sort().join(),
    nombreSistema: r.body.nombre_sistema,
    mensajeIngreso: r.body.mensaje_ingreso,
    aviso: r.body.aviso,
    preferencias: r.body.preferencias,
  };
  fijarConfiguracion(configuracion);
  return configuracion;
}

/* Las áreas reales que hay que traer al almacén al iniciar sesión. */
export function clavesDeAreasReales() {
  return Object.keys(AREAS_REALES);
}

/* --------------------------------------------------------- administración

   El panel del superadministrador habla con /api/admin/*. Devuelve la forma
   de siempre ({ ok, status, body }) con `error` ya legible, para que cada
   pantalla solo tenga que mostrarlo. */
export async function admin(metodo, ruta, cuerpo) {
  const r = await pedir(`/admin${ruta}`, metodo === 'GET' ? {} : { method: metodo, body: cuerpo });
  return r.ok ? { ok: true, body: r.body } : { ok: false, status: r.status, error: mensajeDe(r.body, 'No se pudo completar.') };
}

export const adminGet = (ruta, params) => pedir(`/admin${ruta}`, { params }).then((r) => (r.ok ? { ok: true, body: r.body } : { ok: false, status: r.status, error: mensajeDe(r.body, 'No se pudo leer.') }));

/* «Ver como»: el servidor da un token de solo lectura de esa cuenta. El del
   superadministrador se guarda aparte para volver sin pedir la contraseña. */
let tokenPropio = null;

export async function verComo(usuarioId, justificacion) {
  const r = await pedir(`/admin/ver-como/${usuarioId}`, { method: 'POST', body: { justificacion } });
  if (!r.ok) return { ok: false, error: mensajeDe(r.body, 'No se pudo entrar como esa cuenta.') };
  tokenPropio = token;
  token = r.body.token;
  return { ok: true, usuario: { ...usuarioDesdeBackend(r.body.usuario), soloLectura: true } };
}

export function volverDeVerComo() {
  if (tokenPropio) token = tokenPropio;
  tokenPropio = null;
}

/* --------------------------------------------------------------- listas */

/* Trae al store lo que el backend sabe de un área, para los periodos dados.
   Solo tiene efecto en modo real y solo para un área con datos reales; en
   cualquier otro caso no hace nada (el store ya tiene lo que necesita).

   Si la lista no se pudo traer (backend caído), no toca el store: es mejor
   dejar lo que ya había que borrarlo sin poder reemplazarlo. */
export async function sincronizarArea(claveArea, periodos) {
  if (!esAreaReal(claveArea)) return;
  const formato = AREAS_REALES[claveArea];
  const ordenados = [...periodos].sort();

  const lista = await pedir('/reportes', { params: { formato, desde: ordenados[0], hasta: ordenados.at(-1), por_pagina: 100 } });
  /* Se dice: sin esto, un mes entregado se veía «No iniciado» sin ninguna señal. */
  fijarSincronizacion(claveArea, lista.ok);
  if (!lista.ok) return;

  /* El `fecha_limite` de cada fila, exista o no el reporte: el plazo real
     no se recalcula en el frontend (dominio/periodos.js::plazoEfectivo). */
  fijarPlazosReales(claveArea, lista.body.filas);

  /* Un no_iniciado no se trae: su ausencia ES el estado y no se agrega nada.

     En dos tiempos, para que la pantalla no espere a todo el año. Cada reporte
     real son tres peticiones (detalle, casillas con ~1.000 valores y revisión
     del bot), y al iniciar sesión se pedían todos juntos: la primera pintada
     llegaba tras varios segundos y con datos a medias.
       1. La lista ya dice estado, constancia y fecha de envío de cada mes: con
          eso se pintan Cumplimiento, Historial y las cabeceras de inmediato.
       2. Los dos meses más recientes, completos, enseguida: son los que se
          abren primero (el reporte del mes y el anterior, que la comparación
          de variación necesita).
       3. El resto, en segundo plano y por la misma cola, de más nuevo a más
          viejo. Cada uno entra al almacén cuando llega. */
  const entregados = lista.body.filas.filter((f) => f.estado !== 'no_iniciado').sort((a, b) => b.periodo.localeCompare(a.periodo));
  const previos = new Map(leerEstado().reportes.filter((r) => r.area === claveArea).map((r) => [r.periodo, r]));
  /* Un reporte ya completo que no cambió (mismo estado y misma fecha de envío)
     se conserva: la actualización cada hora no debe borrar lo ya traído. */
  const vigente = (f) => {
    const p = previos.get(f.periodo);
    return p && !p.resumen && p.estado === f.estado && p.enviadoEn === f.fecha_envio ? p : null;
  };
  const resumen = (f) => ({
    id: `${claveArea}:${f.periodo}`, area: claveArea, periodo: f.periodo, estado: f.estado, folio: null, constancia: f.folio_constancia,
    enviadoEn: f.fecha_envio, datos: {}, carga: null, informe: null, remision: null, historial: [], resumen: true,
  });
  /* La lista se pinta antes de esperar a nadie. Se pintaba después de traer esos dos meses
     completos y, con nueve áreas, Cumplimiento decía «No iniciado» unos segundos en meses ya
     entregados: un dato falso, peor que uno que tarda. */
  sincronizarReportesReales(claveArea, periodos, entregados.map((f) => vigente(f) ?? resumen(f)));

  const traer = (f, cola) =>
    encolarDetalle(cola, `${claveArea}:${f.periodo}`, async () => {
      const t = await traerReporte(claveArea, f.periodo);
      if (t.ok) fusionarReporteReal(t.reporte);
    });

  /* Sin `await` para el resto: su detalle llega mientras la persona ya usa la pantalla. */
  for (const f of entregados.slice(2).filter((x) => !vigente(x))) traer(f, DETALLE_DESPUES);
  await Promise.all(entregados.slice(0, 2).filter((f) => !vigente(f)).map((f) => traer(f, DETALLE_PRIMERO)));
}

/* El detalle de los reportes, de todas las áreas, por una sola cola. Cada área abría sus propias
   descargas: con nueve eran más de 380 peticiones seguidas, el navegador se quedaba sin
   conexiones y abrir otra pantalla tardaba 15 segundos en cargar su código. Dos a la vez dejan
   sitio para lo que la persona pide y no saturan una base compartida. */
const DETALLE_A_LA_VEZ = 2;
const DETALLE_PRIMERO = new Map();
const DETALLE_DESPUES = new Map();
let detalleEnCurso = 0;

function atenderDetalle() {
  while (detalleEnCurso < DETALLE_A_LA_VEZ) {
    const cola = DETALLE_PRIMERO.size ? DETALLE_PRIMERO : DETALLE_DESPUES;
    if (!cola.size) return;
    const [clave, { tarea, terminar }] = cola.entries().next().value;
    cola.delete(clave);
    detalleEnCurso += 1;
    tarea().catch(() => {}).finally(() => {
      detalleEnCurso -= 1;
      terminar();
      atenderDetalle();
    });
  }
}

/* Un mes que ya espera turno no se pide dos veces: al llegar el «hoy» del servidor se vuelve a
   sincronizar todo, y sin esto cada reporte se descargaba por duplicado. */
function encolarDetalle(cola, clave, tarea) {
  const yaEnCola = DETALLE_PRIMERO.get(clave) ?? DETALLE_DESPUES.get(clave);
  if (yaEnCola) return yaEnCola.promesa;
  let terminar;
  const promesa = new Promise((r) => {
    terminar = r;
  });
  cola.set(clave, { tarea, terminar, promesa });
  atenderDetalle();
  return promesa;
}

/* Los reportes del almacén con el detalle completo de los meses pedidos. Al iniciar
   sesión, un mes entregado llega primero como resumen (estado, sin cifras) y sus
   casillas detrás, por la cola: un Excel de DIRESA armado en ese rato salía con el
   área «entregada» y sus celdas vacías. Lo que se va a descargar espera a lo suyo,
   y se adelanta en la cola. En el prototipo no hay resúmenes: devuelve lo que hay. */
export async function reportesConDetalle(periodos) {
  const meses = new Set(periodos);
  const faltan = leerEstado().reportes.filter((r) => r.resumen && meses.has(r.periodo) && esAreaReal(r.area) && estaEntregado(r.estado));
  await Promise.all(
    faltan.map((r) => {
      const enEspera = DETALLE_DESPUES.get(r.id);
      if (enEspera) {
        DETALLE_DESPUES.delete(r.id);
        DETALLE_PRIMERO.set(r.id, enEspera);
        atenderDetalle();
        return enEspera.promesa;
      }
      return encolarDetalle(DETALLE_PRIMERO, r.id, async () => {
        const t = await traerReporte(r.area, r.periodo);
        if (t.ok) fusionarReporteReal(t.reporte);
      });
    }),
  );
  return leerEstado().reportes;
}

/* Trae las alertas que calculó el backend para un área y un periodo (hoy,
   solo «semana con datos faltantes» de Nutrición, sobre su propio periodo
   vigente: fuera de él el backend ya responde vacío). Se llama en el mismo
   ciclo que `App.jsx` refresca el «hoy» — cada hora y al volver la pestaña
   —, no en cada sincronización de la lista completa. */
export async function alertasDe(claveArea, periodo) {
  if (!esAreaReal(claveArea)) return;
  const formato = AREAS_REALES[claveArea];
  const r = await pedir(`/reportes/${formato}/${periodo}/alertas`);
  if (r.ok) fijarAlertasReales(claveArea, periodo, r.body.alertas);
}

/* --------------------------------------------------------------------- carga */

/* Sube el Excel al backend, que llama al bot y persiste el resultado: es la
   única fuente de verdad de qué se validó (ver docs/API_BACKEND.md). Solo
   tiene sentido si `esAreaReal(claveArea)`; quien llama decide la rama.

   En éxito, `informe` es el que arma el bot, tal cual — la misma forma que ya
   sabe pintar la pantalla de revisión cuando el bot corre embebido, así que
   `aplicarCarga` no distingue de dónde vino. */
export async function subirCarga(claveArea, periodo, archivo) {
  if (enPractica(claveArea)) return subirEnPractica(claveArea, periodo, archivo);
  const formato = AREAS_REALES[claveArea];
  const r = await pedirArchivo(`/reportes/${formato}/${periodo}/cargas`, archivo);
  if (!r.ok) return { ok: false, status: r.status, codigo: r.body?.codigo, detail: r.body?.detail, datos: r.body?.datos };
  return { ok: true, resultado: r.body.resultado, informe: r.body.informe };
}

/* ------------------------------------------------------------ justificación */

/* Guarda en el backend la justificación de un aviso (texto vacío la borra). Sin
   esto la justificación vivía solo en memoria y el backend rechazaba el envío. */
export async function justificar(claveArea, periodo, clave, texto) {
  if (enPractica(claveArea)) return justificarEnPractica(claveArea, periodo, clave, texto);
  const formato = AREAS_REALES[claveArea];
  const r = await pedir(`/reportes/${formato}/${periodo}/hallazgos/${encodeURIComponent(clave)}/justificacion`, {
    method: 'PUT',
    body: { justificacion: texto },
  });
  return r.ok ? { ok: true } : { ok: false, status: r.status, codigo: r.body?.codigo, detail: r.body?.detail };
}

/* --------------------------------------- actividades operativas (POI)

   Lo que Planeamiento escribe en una actividad: /api/planeamiento/actividades.
   Lo calculado no viaja: se deriva de los reportes en la pantalla. En el
   prototipo todo queda en el store. */

function registroDesdeBackend(r) {
  return { valor: r.valor, nota: r.nota ?? '', actor: r.usuario ?? null, fecha: r.fecha };
}

/* Trae lo escrito en el año y lo deja en el store. `{ ok, error? }`. */
export async function cargarActividades(anio) {
  if (!URL_API) return { ok: true };
  const r = await pedir(`/planeamiento/actividades/${anio}`);
  if (!r.ok) return { ok: false, error: mensajeDe(r.body, 'No se pudieron leer las actividades operativas.') };
  const registros = {};
  for (const fila of r.body.registros) {
    registros[fila.codigo] = { ...registros[fila.codigo], [fila.mes]: registroDesdeBackend(fila) };
  }
  fijarActividades(anio, registros);
  return { ok: true };
}

/* `valor` null borra lo escrito. `{ ok, error? }`. */
export async function guardarEjecucion(anio, codigo, mes, { valor, nota = '', actor = null }) {
  if (!URL_API) {
    registrarEjecucion(anio, codigo, mes, { valor, nota, actor });
    return { ok: true };
  }
  const ruta = `/planeamiento/actividades/${anio}/${codigo}/${mes}`;
  const r = valor == null ? await pedir(ruta, { method: 'DELETE' }) : await pedir(ruta, { method: 'PUT', body: { valor, nota } });
  if (!r.ok) return { ok: false, error: mensajeDe(r.body, 'No se pudo guardar la cifra.') };
  registrarEjecucion(anio, codigo, mes, valor == null ? { valor: null } : registroDesdeBackend(r.body));
  return { ok: true };
}

/* ----------------------------------------------------- panel de monitoreo

   /api/monitoreo/*: lo registrado del año. Devuelve { ok, body } o { ok: false,
   status, error } con el error ya escrito para personas. Sin servidor no hay nada que
   traer: el prototipo no inventa cifras oficiales. */
export async function monitoreo(metodo, ruta, { params, cuerpo } = {}) {
  if (!URL_API) return { ok: false, status: null, error: 'El panel solo trae cifras oficiales con el servidor.' };
  const r = await pedir(`/monitoreo${ruta}`, metodo === 'GET' ? { params } : { method: metodo, body: cuerpo, params });
  return r.ok ? { ok: true, body: r.body } : { ok: false, status: r.status, error: mensajeDe(r.body, 'No se pudo completar.') };
}

/* Convierte lo que digita Estadística en lo que espera el store: { '2026-01': { egresos: 868 } }. */
export function propiosDeRegistro(anio, datos) {
  const porPeriodo = {};
  for (const d of datos) {
    const periodo = `${anio}-${String(d.mes).padStart(2, '0')}`;
    (porPeriodo[periodo] ??= {})[d.clave] = d.valor;
  }
  return porPeriodo;
}

/* Al entrar lo piden a la vez la sesión y el panel: una sola petición para los dos. */
const panelesEnCurso = new Map();

export const hayServidor = () => Boolean(URL_API);

export function cargarPanelMonitoreo(anio) {
  const clave = String(anio);
  if (panelesEnCurso.has(clave)) return panelesEnCurso.get(clave);
  const pedido = monitoreo('GET', `/${anio}`).then((r) => {
    if (r.ok) fijarPropios(propiosDeRegistro(anio, r.body.datos));
    panelesEnCurso.delete(clave);
    return r;
  });
  panelesEnCurso.set(clave, pedido);
  return pedido;
}

/* Un dato del mes. Sin servidor, queda en la sesión. Con él, si no se guarda, se devuelve
   a lo que estaba: un dato que parece guardado y se pierde al salir es peor que un error. */
export async function guardarDatoDelMes(periodo, clave, valor) {
  const anterior = leerEstado().propios?.[periodo]?.[clave] ?? null;
  guardarPropio(periodo, clave, valor);
  if (!URL_API) return { ok: true };
  const r = await monitoreo('PUT', `/${periodo.slice(0, 4)}/datos`, { cuerpo: { mes: Number(periodo.slice(5)), clave, valor } });
  if (!r.ok) guardarPropio(periodo, clave, anterior);
  return r;
}

/* Sube el reporte DL 1153 tal como lo publicó MINSA. `ruta`: «/dl1153/revision» no guarda. */
export async function subirReporteDL1153(ruta, archivo) {
  if (enPractica()) return RECHAZO_PRACTICA;
  const cuerpo = new FormData();
  cuerpo.append('archivo', archivo, archivo.name);
  try {
    const r = await fetch(`/api/monitoreo${ruta}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: cuerpo });
    const texto = await r.text();
    const body = texto ? JSON.parse(texto) : null;
    return r.ok ? { ok: true, body } : { ok: false, status: r.status, error: mensajeDe(body, 'No se pudo leer el archivo.') };
  } catch {
    return { ok: false, status: null, error: 'No se pudo conectar con el backend. Revise que esté levantado.' };
  }
}

/* ------------------------------------------------ indicadores de desempeño

   /api/desempeno/*: el tablero de las 34 fichas de MINSA. Solo con el
   servidor: sin él no hay HIS ni SINADEF que mostrar, y el prototipo no
   inventa resultados. Devuelve { ok, body } o { ok: false, status, error,
   motivos? } con el error ya escrito para personas. */
export async function desempeno(metodo, ruta, { params, cuerpo } = {}) {
  const r = await pedir(`/desempeno${ruta}`, metodo === 'GET' ? { params } : { method: metodo, body: cuerpo, params });
  return r.ok ? { ok: true, body: r.body } : { ok: false, status: r.status, error: mensajeDe(r.body, 'No se pudo completar.'), motivos: r.body?.datos?.motivos ?? null };
}

/* Sube un archivo de datos (trama del HIS, SINADEF…) tal como se descargó: el
   servidor lo reconoce por su contenido. `campos` va junto al archivo en el
   mismo formulario (`forzar`). */
export async function subirADesempeno(ruta, archivo, campos = {}) {
  const cuerpo = new FormData();
  cuerpo.append('archivo', archivo, archivo.name);
  for (const [k, v] of Object.entries(campos)) cuerpo.append(k, String(v));
  try {
    const r = await fetch(`/api/desempeno${ruta}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: cuerpo });
    const texto = await r.text();
    const body = texto ? JSON.parse(texto) : null;
    return r.ok ? { ok: true, body } : { ok: false, status: r.status, error: mensajeDe(body, 'No se pudo subir el archivo.'), motivos: body?.datos?.motivos ?? null };
  } catch {
    return { ok: false, status: null, error: 'No se pudo conectar con el backend. Revise que esté levantado.', motivos: null };
  }
}
