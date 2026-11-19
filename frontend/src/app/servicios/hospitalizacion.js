/* Cliente de la API de hospitalización (`servidor/hospitalizacion/`), detrás de
   `/api/hospitalizacion/` en el nginx y en el proxy de Vite.

   El estado de los pisos vive en su propia base y las reglas se aplican en su
   servidor: las pantallas leen un único estado y ejecutan acciones. La sesión es la
   del Sistema de Reporte Estadístico: el mismo token (`api.tokenDeSesion`), que nombra
   a los dos sistemas en `aud` (fase 3 de la decisión 0011). */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { hayServidor, tokenDeSesion } from './api.js';

const BASE = '/api/hospitalizacion';
/* Dos equipos ven los mismos datos: el estado se vuelve a pedir cada 5 segundos
   mientras haya una pantalla de hospitalización abierta. */
const CADA_MS = 5000;

let estado = null;
let crudo = '';
let sinConexion = null;
const oyentes = new Set();

const avisar = () => oyentes.forEach((f) => f());

const suscribir = (f) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

/* El tercer argumento es lo que se ve al renderizar fuera del navegador (la prueba
   de humo): lo mismo que ahora. */
const leerEstadoActual = () => estado;
const leerSinConexion = () => sinConexion;
export const useEstadoHospitalizacion = () => useSyncExternalStore(suscribir, leerEstadoActual, leerEstadoActual);
export const useSinConexionHospitalizacion = () => useSyncExternalStore(suscribir, leerSinConexion, leerSinConexion);

class ErrorApi extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/* La política de claves devuelve la lista de lo que falta; FastAPI, la de los
   campos mal formados. Se muestra todo junto. */
function mensajeDe(detalle, codigo) {
  if (typeof detalle === 'string') return detalle;
  if (Array.isArray(detalle) && detalle.length) return detalle.map((d) => (typeof d === 'string' ? d : d?.msg)).filter(Boolean).join(' ');
  if ([502, 503, 504].includes(codigo)) return 'El servidor de hospitalización no está disponible en este momento. Intente de nuevo en unos minutos.';
  return 'El servidor de hospitalización no pudo atender el pedido.';
}

async function pedir(ruta, cuerpo) {
  const token = tokenDeSesion();
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}/${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers: { ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi('No se pudo conectar con el servidor de hospitalización.', 0);
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new ErrorApi(mensajeDe(datos?.detail, respuesta.status), respuesta.status);
  return datos;
}

let alExpirar = null;

async function recargar() {
  try {
    const nuevo = await pedir('estado');
    const texto = JSON.stringify(nuevo);
    const cambio = texto !== crudo || sinConexion !== null;
    crudo = texto;
    estado = nuevo;
    sinConexion = null;
    if (cambio) avisar();
  } catch (e) {
    if (e.codigo === 401) {
      alExpirar?.();
      return;
    }
    sinConexion = e.message;
    avisar();
  }
}

let cuentaConectada = null;

/* Carga el estado y lo mantiene al día. Devuelve con qué dejar de hacerlo. Cambiar
   de un módulo de hospitalización a otro no vacía nada; cambiar de cuenta sí: lo
   de una no se muestra, ni un instante, a la siguiente. */
export function conectar(cuentaId, onExpirar) {
  if (cuentaId !== cuentaConectada) vaciar();
  cuentaConectada = cuentaId;
  alExpirar = onExpirar;
  recargar();
  const temporizador = setInterval(recargar, CADA_MS);
  return () => clearInterval(temporizador);
}

/* Al cerrar la sesión o cambiar de cuenta: cada cuenta recibe datos distintos. */
export function vaciar() {
  estado = null;
  crudo = '';
  sinConexion = null;
  avisar();
}

/* Devuelve el mensaje de la regla incumplida, o null si se aplicó. */
export async function despachar(accion) {
  try {
    await pedir('acciones', accion);
    await recargar();
    return null;
  } catch (e) {
    if (e.codigo === 401) alExpirar?.();
    return e.message;
  }
}


/* Fase 4 de la decisión 0011: las cifras del mes de hospitalización, al lado de las que
   digita Estadística (egresos, pacientes-día, días-cama, camas). Solo de las áreas que
   tienen plano: nunca reemplazan lo digitado y siempre van con su cobertura. Las lee
   quien valida en hospitalización (Estadística); a los demás no se les piden. */
export const PERMISO_CIFRAS = 'hospitalizacion.validar';

export const veCifrasDeHospitalizacion = (permisos = []) => hayServidor() && permisos.includes(PERMISO_CIFRAS);

/* Las del año, o null mientras llegan, si la cuenta no las ve o si la API de
   hospitalización no responde: en ese caso la pantalla sigue como siempre. */
export function useCifrasHospitalizacion(anio, activo) {
  const [leidas, setLeidas] = useState(null);
  useEffect(() => {
    if (!activo) return undefined;
    let vigente = true;
    pedir(`cifras/${anio}`)
      .then((r) => vigente && setLeidas({ anio, cifras: r }))
      .catch(() => vigente && setLeidas(null));
    return () => {
      vigente = false;
    };
  }, [anio, activo]);
  return activo && leidas?.anio === anio ? leidas.cifras : null;
}

export const cifraDelMes = (cifras, periodo) => cifras?.meses?.find((m) => m.mes === periodo) ?? null;

/* Si la API de hospitalización está encendida. Las cuentas de Estadística traen sus
   permisos en el rol `revisor` (seeder 0011), aunque el servidor todavía no tenga el
   perfil `hospitalizacion`: sin esta pregunta verían en su menú módulos que solo dicen
   «Sin conexión». Se pregunta una vez por carga de la página; null mientras tanto. */
let disponible = null;
let preguntando = false;
const leerDisponible = () => disponible;

export function useHospitalizacionDisponible(preguntar) {
  useEffect(() => {
    if (!preguntar || disponible !== null || preguntando) return;
    preguntando = true;
    fetch(`${BASE}/salud`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { disponible = Boolean(d?.ok); })
      .catch(() => { disponible = false; })
      .finally(() => {
        preguntando = false;
        avisar();
      });
  }, [preguntar]);
  return useSyncExternalStore(suscribir, leerDisponible, leerDisponible);
}
