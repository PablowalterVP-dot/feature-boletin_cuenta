/* El servidor guarda una cifra por indicador y devuelve cada cuadro plano
   (`f1: { 'e0.neonatologia_m': 1 }`); las reglas y las pantallas lo leen
   anidado (`f1.e0.neonatologia_m`). Se convierte aquí, en un solo lugar, para
   las áreas que lo necesitan (Farmacia tiene el suyo, anterior a este). Lo
   que ya viene anidado pasa igual, y lo que no es un cuadro (lectura,
   escritos…) no se toca. */

export function anidarCuadros(datos, ids) {
  if (!datos) return datos;
  const salida = { ...datos };
  for (const id of ids) {
    const cuadro = datos[id];
    if (!cuadro || typeof cuadro !== 'object' || !Object.keys(cuadro).some((k) => k.includes('.'))) continue;
    const anidado = {};
    for (const [clave, valor] of Object.entries(cuadro)) {
      const partes = clave.split('.');
      let nodo = anidado;
      for (const p of partes.slice(0, -1)) nodo = nodo[p] = nodo[p] && typeof nodo[p] === 'object' ? nodo[p] : {};
      nodo[partes.at(-1)] = valor;
    }
    salida[id] = anidado;
  }
  return salida;
}
