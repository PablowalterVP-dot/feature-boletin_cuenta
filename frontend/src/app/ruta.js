/* La pantalla activa, en la URL.

   Antes la vista vivía solo en el estado de React: la URL no cambiaba nunca,
   así que no había enlace directo a una pantalla y «Atrás» del navegador
   sacaba de la aplicación. Ahora la vista se escribe en el hash:

     #/reporte                    el panel
     #/reporte?periodo=2026-06    con sus parámetros (los mismos de irA)

   Hash y no rutas de verdad: el prototipo se sirve como archivos estáticos y
   un hash no necesita que el servidor sepa de rutas. Los parámetros son
   cadenas (periodo, paso, área): lo que viaja en una URL. Sin dependencias. */

const PREFIJO = '#/';

/* Del hash a { id, params }. Un hash vacío o ajeno es `null`: quien llama
   decide a qué panel caer (el primero del menú del rol). */
export function leerRuta(hash) {
  if (!hash || !hash.startsWith(PREFIJO)) return null;
  const [camino, consulta = ''] = hash.slice(PREFIJO.length).split('?');
  const id = decodeURIComponent(camino).trim();
  if (!id) return null;
  const params = Object.fromEntries(new URLSearchParams(consulta));
  return { id, params };
}

/* De { id, params } al hash. Los parámetros vacíos no se escriben, y van en
   orden alfabético para que la misma vista dé siempre la misma URL. */
export function escribirRuta({ id, params = {} }) {
  const pares = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, String(v)]);
  const consulta = new URLSearchParams(pares).toString();
  return `${PREFIJO}${encodeURIComponent(id)}${consulta ? `?${consulta}` : ''}`;
}

/* Dos vistas son la misma si dan la misma URL: así se evita apilar en el
   historial una entrada repetida al volver a pulsar el panel en el que ya se está. */
export function mismaRuta(a, b) {
  return escribirRuta(a) === escribirRuta(b);
}
