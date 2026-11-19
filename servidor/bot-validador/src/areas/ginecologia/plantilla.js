/* El Excel de Gineco-Obstetricia: formato en blanco y ejemplos.

   Genera un .xlsx con los dos cuadros del Excel real del área («EBVI»): el
   bot los encuentra por sus rótulos (lector.js), no por su posición en la
   hoja, así que esta plantilla no necesita repetir el layout exacto del
   original —con su fila de título y sus huecos—, solo sus encabezados y sus
   filas, en el mismo orden.

   `datos` es el reporte ({f1, f2}) o null para el formato en blanco. Si
   `datos.f2` no tiene claves, el cuadro 2 no se escribe: así el ejemplo
   puede mostrar un mes como los de enero a agosto, sin ese cuadro. */

import { crearLibro, ESTILO } from '../../xlsx.js';
import { EDADES, TIPOS_PARTO, COLUMNAS_F1, COLUMNAS_F2, claveFila } from './definicion.js';
import { totalColumna } from './calculos.js';
import { mesOficial } from '../../periodos.js';

export const VERSION_PLANTILLA = 'GIN-1';

function capitalizar(t) {
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function nombreDeArchivo(periodo) {
  const anio = periodo.slice(0, 4);
  return `EBVI_Consolidado_Mes_${capitalizar(mesOficial(periodo))}_${anio}.xlsx`;
}

const celda = (v, estilo = ESTILO.entrada) => ({ v, estilo });
const cifra = (v) => celda(v == null ? null : v, ESTILO.entrada);

/* `declarados`: { f1: {columna: valor}, f2: {...} } para los ejemplos con
   totales mal declarados; sin ellos, el TOTAL se escribe ya cuadrado (lo que
   vuelve a sumar el bot). */
export function crearPlantilla(periodo, datos = null, opciones = {}) {
  const declarados = opciones.declarados ?? {};
  const f1 = datos?.f1 ?? {};
  const f2 = datos?.f2 ?? {};
  const conF2 = Object.keys(f2).length > 0;

  const filas = [];
  filas.push([celda('REPORTE CONSOLIDADO DE EVENTOS BAJO VIGILANCIA INSTITUCIONAL', ESTILO.titulo)]);
  filas.push([celda(`${mesOficial(periodo)} de ${periodo.slice(0, 4)}`, ESTILO.etiqueta)]);
  filas.push([]);

  filas.push([celda('EDAD', ESTILO.cabecera), ...COLUMNAS_F1.map((c) => celda(c.rotulo, ESTILO.cabecera))]);
  for (const e of EDADES) {
    filas.push([celda(e.rotulo, ESTILO.etiqueta), ...COLUMNAS_F1.map((c) => cifra(datos ? (f1[claveFila(e.clave, c.clave)] ?? null) : null))]);
  }
  filas.push([
    celda('TOTAL', ESTILO.total),
    ...COLUMNAS_F1.map((c) => celda(declarados.f1?.[c.clave] ?? (datos ? totalColumna(datos, 'f1', c.clave) : null), ESTILO.total)),
  ]);
  filas.push([]);

  if (!datos || conF2) {
    filas.push(['', celda('TOTAL DE PARTOS', ESTILO.cabecera), celda('TOTAL DE NACIMIENTOS VIVOS + MUERTOS', ESTILO.cabecera), celda('NACIDOS VIVOS', ESTILO.cabecera), celda('NACIDOS MUERTOS', ESTILO.cabecera)]);
    for (const t of TIPOS_PARTO) {
      filas.push([celda(t.rotulo, ESTILO.etiqueta), ...COLUMNAS_F2.map((c) => cifra(datos ? (f2[claveFila(t.clave, c.clave)] ?? null) : null))]);
    }
    filas.push([
      celda('TOTAL', ESTILO.total),
      ...COLUMNAS_F2.map((c) => celda(declarados.f2?.[c.clave] ?? (datos ? totalColumna(datos, 'f2', c.clave) : null), ESTILO.total)),
    ]);
  }

  return crearLibro({
    hojas: [{ nombre: capitalizar(mesOficial(periodo)), primera: true, filas, anchos: [42, 16, 16, 16, 16] }],
  });
}
