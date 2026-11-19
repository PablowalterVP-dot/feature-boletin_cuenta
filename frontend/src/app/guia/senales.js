/* Lo que el tutorial sabe de la pantalla, y si está en marcha.

   Cada parte del flujo publica su estado con `usePublicarGuia` y lo retira al
   desmontarse. Así una señal solo existe mientras exista lo que describe, y el
   paso (`dominio/guia.js`) sale siempre de lo que hay en pantalla.

   Se publica también con el tutorial apagado: al iniciarlo ya se sabe dónde está
   la persona. Pero entonces no se avisa a nadie: una pantalla sin tutorial no
   vuelve a pintarse por esto.

   Iniciar y salir abren y cierran la práctica (`servicios/practica.js`) antes de
   avisar, para que la pantalla se vuelva a pintar ya con los datos que le tocan. */

import { useEffect, useSyncExternalStore } from 'react';
import { entrarEnPractica, salirDePractica } from '@/app/servicios/practica.js';

let senales = {};
let estado = { usuario: null, vistos: [], senales, version: 0 };
const oyentes = new Set();

function publicar(cambios) {
  estado = { ...estado, ...cambios, version: estado.version + 1 };
  oyentes.forEach((o) => o());
}

function fijarSenal(clave, valor) {
  senales = { ...senales };
  if (valor == null) delete senales[clave];
  else senales[clave] = valor;
  if (estado.usuario) publicar({ senales });
}

/* El valor se compara por su JSON: las pantallas arman un objeto nuevo en cada
   render, y publicar por eso repintaría el tutorial sin que nada cambie. */
export function usePublicarGuia(clave, valor) {
  const json = JSON.stringify(valor ?? null);
  useEffect(() => {
    fijarSenal(clave, JSON.parse(json));
  }, [clave, json]);
  useEffect(() => () => fijarSenal(clave, null), [clave]);
}

export function useGuia() {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    () => estado,
    () => estado,
  );
}

export function guiaEnMarchaPara(estadoGuia, usuarioId) {
  return Boolean(usuarioId) && estadoGuia.usuario === String(usuarioId);
}

export function iniciarGuia(usuario) {
  entrarEnPractica(usuario.area);
  publicar({ usuario: String(usuario.id), vistos: [], senales });
}

export function salirDeGuia() {
  salirDePractica();
  publicar({ usuario: null, vistos: [] });
}

export function marcarVisto(clave) {
  if (!estado.vistos.includes(clave)) publicar({ vistos: [...estado.vistos, clave] });
}

export function olvidarVisto(clave) {
  publicar({ vistos: estado.vistos.filter((v) => v !== clave) });
}
