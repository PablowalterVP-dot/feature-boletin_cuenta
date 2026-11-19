/* El oficio de Epidemiología en Word: formato en blanco y ejemplos.

   La misma tabla del oficio real (los quince grupos de edad, las catorce
   columnas y la fila TOTAL), con la línea «MES:» sobre ella. Sirve para el
   formato que el área descarga y para los ejemplos de la demostración, que
   pasan por el mismo lector (lector.js) que un oficio real. Como el área, deja
   en blanco las celdas sin casos y escribe la fila TOTAL completa. */

import { mesOficial } from '../../periodos.js';
import { documento, parrafo, tabla, cifra } from '../../docx-plantilla.js';
import { GRUPOS, COLUMNAS, EDADES } from './definicion.js';
import { totalColumna } from './calculos.js';

export const VERSION_PLANTILLA = 'EPI-W1';

export function nombreDeArchivo(periodo) {
  return `EPIDEMIOLOGIA_IIH_${mesOficial(periodo)}_${periodo.slice(0, 4)}.docx`;
}

const ENCABEZADO = Object.freeze({
  neonatologia: 'Neonatología',
  uci: 'UCI´S: Pediatría, Medicina, Cirugía',
  gineco: 'Gineco Obstetricia',
  itu: 'OTROS SERVICIOS: Infección del tracto urinario',
  iho: 'OTROS SERVICIOS: Infección de herida operatoria',
  muerte_neonatal: 'Muerte neonatal',
  muerte_materna: 'Muerte materna',
  otras: 'OTRAS INFECCIONES* Neum. S/V, infec. piel',
});

/* `datos`: el reporte (f1), o null para el formato en blanco. Un cero se
   escribe en blanco, como el área. `opciones.totales`: fila TOTAL distinta de
   la suma, para el ejemplo con errores. */
export function crearPlantilla(periodo, datos = null, opciones = {}) {
  const f1 = datos?.f1 ?? {};
  const b = (t, span = 1) => ({ t, b: true, span });
  const filas = [
    [b('N°'), b('Grupos de edad'), ...GRUPOS.map((g) => b(ENCABEZADO[g.clave], g.sexos.length))],
    ['', '', ...COLUMNAS.map((c) => (c.grupo === 'muerte_materna' ? '' : b(c.sexo)))],
    ...EDADES.map((e, i) => [String(i + 1), e.label, ...COLUMNAS.map((c) => {
      const v = f1[e.clave]?.[c.clave];
      return v === 0 ? '' : cifra(v);
    })]),
    [b('TOTAL', 2), ...COLUMNAS.map((c) => cifra(opciones.totales?.[c.clave] ?? (datos ? totalColumna(f1, c.clave) ?? 0 : null)))],
  ];
  const [anio, mes] = periodo.split('-');
  const corto = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(mes) - 1];
  return documento(
    [
      parrafo(`ASUNTO: Remito casos de vigilancia Epidemiológica – ${mesOficial(periodo).toLowerCase()} ${anio}`),
      parrafo('NUMERO DE CASOS NUEVOS DE INFECCIONES INTRAHOSPITALARIAS', true),
      parrafo(`MES: ${corto}-${anio.slice(2)}`, true),
      tabla(filas),
    ],
    { horizontal: true },
  );
}
