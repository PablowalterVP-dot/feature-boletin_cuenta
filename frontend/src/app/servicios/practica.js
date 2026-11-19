/* La práctica del tutorial: el reporte de un área sin tocar el servidor.

   El tutorial no guarda nada (decidido el 01/11/2026): al terminar, todo queda
   como antes. Se resuelve aquí y en `api.js`, en la frontera con el servidor, y
   no en cada pantalla: ellas siguen creyendo que hablan con él (`esAreaReal` sigue
   siendo cierto), así que lo que se practica se ve igual que lo real. Debajo,
   cada operación se hace en el navegador, con el mismo bot embebido que usa la
   corrección con Dr. Mochi.

   Cómo queda todo como antes:
     - al entrar se aparta una copia de los reportes del almacén y de los archivos
       recordados; al salir, se devuelven;
     - cada mes que se abre empieza vacío, aunque tenga un reporte de verdad, y la
       sincronización con el servidor no puede volver a escribirlo (`protegerReportes`);
     - `api.js` rechaza cualquier escritura que aún intentara salir: si una
       pantalla nueva llamara a un endpoint que aquí no se simula, falla en
       lugar de guardar.

   Vive en memoria a propósito: recargar la página acaba la práctica, y lo real
   sigue intacto porque nunca se tocó. */

import { useSyncExternalStore } from 'react';
import { aplicarTransicion, fijarReportes, guardarDatos, leerEstado, protegerReportes, reporteDe, escribirReporte } from '@/app/datos/store.js';
import { apartarArchivos, devolverArchivos, validarArchivo } from '@/app/servicios/bot-validador.js';
import { estaEntregado } from '@/app/dominio/estados.js';

let practica = null;
let epoca = 0;
const oyentes = new Set();

/* Cambia al entrar, al salir y al abrir un mes: `Reporte.jsx` la usa en su clave,
   para que ninguna pantalla conserve lo que recordaba de antes. */
function avanzarEpoca() {
  epoca += 1;
  oyentes.forEach((o) => o());
}

export function useEpocaPractica() {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    () => epoca,
    () => epoca,
  );
}

/* Sin área: si hay alguna práctica en curso. */
export function enPractica(claveArea) {
  return Boolean(practica) && (claveArea === undefined || practica.area === claveArea);
}

export function entrarEnPractica(claveArea) {
  if (practica) return;
  practica = { area: claveArea, copia: leerEstado().reportes, meses: new Set() };
  apartarArchivos();
  avanzarEpoca();
}

export function salirDePractica() {
  if (!practica) return;
  const { copia } = practica;
  practica = null;
  protegerReportes([]);
  fijarReportes(copia);
  devolverArchivos();
  avanzarEpoca();
}

/* Un mes abierto en la práctica empieza vacío: quien practica lo hace desde el
   principio, tenga o no su reporte real, que sigue a salvo en la copia. */
export function abrirMesEnPractica(periodo) {
  if (!practica || practica.meses.has(periodo)) return;
  practica.meses.add(periodo);
  const id = `${practica.area}:${periodo}`;
  protegerReportes([...practica.meses].map((p) => `${practica.area}:${p}`));
  fijarReportes(leerEstado().reportes.filter((r) => r.id !== id));
  avanzarEpoca();
}

/* El último mes entregado antes de este y con sus cifras ya traídas, para que el
   bot pueda comparar como lo haría el servidor. Sin él, no hay comparación: la
   alerta de variación no aparece, y es solo una práctica. */
function mesAnterior(claveArea, periodo) {
  const previos = leerEstado().reportes
    .filter((r) => r.area === claveArea && r.periodo < periodo && estaEntregado(r.estado) && !r.resumen && Object.keys(r.datos ?? {}).length > 0)
    .sort((a, b) => b.periodo.localeCompare(a.periodo));
  return previos[0] ? { periodo: previos[0].periodo, datos: previos[0].datos } : null;
}

/* Lo que haría POST …/cargas: leer con el bot y dejarlo en el reporte. */
export async function subirEnPractica(claveArea, periodo, archivo) {
  let informe;
  try {
    informe = await validarArchivo(archivo, { area: claveArea, periodo, anterior: mesAnterior(claveArea, periodo) });
  } catch {
    informe = await validarArchivo(archivo, { area: claveArea, periodo, anterior: null });
  }
  if (informe.bloqueo) return { ok: true, resultado: 'rechazada', informe };

  let actual = reporteDe(leerEstado().reportes, claveArea, periodo);
  if (!actual) actual = aplicarTransicion(claveArea, periodo, 'crear', { rol: 'area' });
  escribirReporte({
    ...actual,
    /* Como el servidor: las alertas ya confirmadas que vuelven a aparecer se conservan. */
    datos: { ...informe.datos, justificaciones: actual.datos?.justificaciones ?? {} },
    carga: { archivo: informe.archivo, fecha: `${leerEstado().hoy}T12:00`, plantilla: informe.plantilla, origen: informe.origen, leidas: informe.leidas },
    informe,
  });
  return { ok: true, resultado: 'aceptada', informe };
}

export function reporteDePractica(claveArea, periodo) {
  return { ok: true, reporte: reporteDe(leerEstado().reportes, claveArea, periodo) };
}

export function justificarEnPractica(claveArea, periodo, clave, texto) {
  const actual = reporteDe(leerEstado().reportes, claveArea, periodo);
  guardarDatos(claveArea, periodo, { justificaciones: { ...actual?.datos?.justificaciones, [clave]: texto } });
  return { ok: true };
}

/* La constancia de una práctica lo dice, para que nadie la tome por una de verdad. */
export function transicionarEnPractica(claveArea, periodo, accion, { actor, rol } = {}) {
  const resultado = aplicarTransicion(claveArea, periodo, accion, { actor, rol });
  if (!resultado) return { ok: false, status: null };
  if (accion !== 'enviar') return { ok: true, reporte: resultado };
  const entregado = { ...resultado, folio: 'PRÁCTICA, SIN VALOR', constancia: 'PRÁCTICA, SIN VALOR', enviadoEn: `${leerEstado().hoy}T12:00` };
  escribirReporte(entregado);
  return { ok: true, reporte: entregado };
}
