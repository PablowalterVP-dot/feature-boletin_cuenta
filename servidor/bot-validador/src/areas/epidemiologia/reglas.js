/* Reglas del reporte de Epidemiología.

   Una función pura: recibe los datos (definicion.js) y devuelve lo que no
   cumple, en los tres niveles de siempre:
     error  impide enviar. Lo que no cuadra no sale del área.
     aviso  se puede enviar, pero hay que revisarlo y confirmarlo.
     info   lo que conviene saber y no exige nada.

   Las de edad son de plausibilidad clínica: una muerte neonatal fuera del
   primer año es imposible por definición (error); un caso de Neonatología o
   una muerte materna fuera de su edad habitual es raro, pero puede ser real o
   una fila equivocada (aviso: Dr. Mochi lo señala y el área lo confirma).

   La comparación con el mes anterior no es la general del motor (un 20 % de
   variación es ruido con diez casos al mes): aquí se avisa un posible brote,
   cuando las infecciones del mes duplican las del anterior y suben en cinco o
   más (`variacion`, abajo). */

import { EDADES, COLUMNAS, GRUPOS, grupo, etiquetaColumna } from './definicion.js';
import { celda, totalColumna, totalGrupo, infeccionesDelMes } from './calculos.js';
import { etiquetaPeriodo } from '../../periodos.js';
import { anidarCuadros } from '../../anidar.js';

/* El mes anterior (y un reporte traído de la base) llega con cada cuadro plano. */
const anidar = (datos) => anidarCuadros(datos, ['f1']);

export const REGLAS = Object.freeze([
  { id: 'formato-vacio', nivel: 'error', texto: 'La tabla tiene sus grupos de edad registrados (sin casos, en blanco o 0)' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda celda de la tabla es un número' },
  { id: 'entero', nivel: 'error', texto: 'Los casos son enteros sin signo' },
  { id: 'totales', nivel: 'error', texto: 'La fila TOTAL cuadra con la suma de los grupos de edad, columna por columna' },
  { id: 'muerte-neonatal-edad', nivel: 'error', texto: 'Las muertes neonatales están en «Menor de 1 año»' },
  { id: 'fila-no-catalogada', nivel: 'error', texto: 'Toda fila con cifras es un grupo de edad del reporte' },
  { id: 'filas-ausentes', nivel: 'aviso', texto: 'La tabla trae los quince grupos de edad' },
  { id: 'neonatologia-edad', nivel: 'aviso', texto: 'Los casos de Neonatología están en «Menor de 1 año»' },
  { id: 'muerte-materna-edad', nivel: 'aviso', texto: 'Las muertes maternas están entre los 10 y los 54 años' },
  { id: 'gineco-edad', nivel: 'aviso', texto: 'Los casos de Gineco-Obstetricia tienen 10 años o más' },
  { id: 'total-en-blanco', nivel: 'aviso', texto: 'La fila TOTAL trae escrito el total de cada columna' },
  { id: 'sin-mes', nivel: 'aviso', texto: 'El oficio dice de qué mes es' },
]);

const NIVEL_DE_LECTURA = Object.freeze({ 'filas-ausentes': 'aviso', 'sin-mes': 'aviso', 'blancos-son-cero': 'info' });

const cifra = (n) => (n == null ? 'sin registrar' : n.toLocaleString('es-PE'));
const noEsEnteroValido = (v) => v != null && (!Number.isInteger(v) || v < 0);
const edad = (clave) => EDADES.find((e) => e.clave === clave);
const enEdades = (f1, col, edades) => edades.filter((e) => (celda(f1, e.clave, col) ?? 0) > 0);

export function validar(datosRecibidos) {
  const datos = anidar(datosRecibidos) ?? {};
  const f1 = datos.f1 ?? {};
  const errores = [];
  const avisos = [];
  const info = [];
  const hallazgo = (nivel, id, regla, titulo, detalle, extra = {}) => {
    const h = { id, regla, formato: 'f1', titulo, detalle, ...extra };
    (nivel === 'error' ? errores : nivel === 'aviso' ? avisos : info).push(h);
  };

  for (const h of datos.lectura ?? []) {
    if (h.regla === 'fila-no-catalogada') errores.push(h);
    else if (NIVEL_DE_LECTURA[h.regla] === 'aviso') avisos.push({ ...h, nivel: 'aviso' });
    else if (NIVEL_DE_LECTURA[h.regla] === 'info') info.push(h);
  }

  if (!Object.keys(f1).length) {
    hallazgo('error', 'formato-vacio', 'formato-vacio', 'La tabla de infecciones no tiene ningún grupo de edad registrado', 'Registre los casos del mes. Si no hubo ninguno, deje la tabla en cero: un mes sin casos es un dato, una tabla vacía no.');
    return { errores, avisos, info };
  }

  for (const [casilla, texto] of Object.entries(datos.ilegibles ?? {})) {
    const [, fila] = casilla.split('|');
    const [e, col] = fila.split('.');
    hallazgo('error', `ilegible-${fila}`, 'no-numerico', `«${texto}» no es un número (${etiquetaColumna(col)}, ${edad(e)?.label ?? e})`, 'Escriba la cifra; si no hubo casos, déjela en blanco o en 0.', { fila });
  }

  for (const e of EDADES) {
    for (const c of COLUMNAS) {
      const v = celda(f1, e.clave, c.clave);
      if (!noEsEnteroValido(v)) continue;
      hallazgo('error', `entero|${e.clave}.${c.clave}`, 'entero', `${v} en ${etiquetaColumna(c.clave)} (${e.label}) no es un entero sin signo`, 'Se cuentan casos: no hay medios casos ni casos negativos.', { fila: `${e.clave}.${c.clave}` });
    }
  }

  /* Totales: la fila TOTAL del Word, columna por columna. */
  const escritos = datos.escritos?.total ?? {};
  const enBlanco = [];
  for (const c of COLUMNAS) {
    const declarado = escritos[c.clave];
    const suma = totalColumna(f1, c.clave) ?? 0;
    if (declarado === undefined) continue; // digitado en el sistema: no hay fila TOTAL que comparar
    if (declarado == null) {
      if (suma > 0) enBlanco.push(c.clave);
      continue;
    }
    if (declarado === suma) continue;
    const dif = declarado - suma;
    hallazgo(
      'error', `totales|${c.clave}`, 'totales',
      `${etiquetaColumna(c.clave)}: la fila TOTAL dice ${cifra(declarado)} y los grupos de edad suman ${cifra(suma)}`,
      `${Math.abs(dif)} ${dif > 0 ? 'de más' : 'de menos'}. El total es la suma de los grupos de edad: corrija el total o el grupo que esté mal.`,
      {
        declarado, calculado: suma,
        evidencia: {
          total: { casilla: `escrito|total|${c.clave}`, etiqueta: `TOTAL · ${etiquetaColumna(c.clave)}`, valor: declarado },
          sumandos: EDADES.map((e) => ({ casilla: `f1|${e.clave}.${c.clave}`, etiqueta: e.label, valor: celda(f1, e.clave, c.clave) ?? 0 })),
          suma, diferencia: dif,
        },
      },
    );
  }
  if (enBlanco.length) {
    hallazgo('aviso', 'total-en-blanco', 'total-en-blanco', `La fila TOTAL está en blanco en ${enBlanco.length === 1 ? 'una columna con casos' : `${enBlanco.length} columnas con casos`}`, `${enBlanco.map(etiquetaColumna).join(', ')}. El total se calcula con los grupos de edad; conviene escribirlo en el oficio impreso.`);
  }

  /* Edad: la muerte neonatal es del primer mes de vida, así que solo cabe en
     «Menor de 1 año». */
  const mayores = EDADES.filter((e) => e.clave !== 'e0');
  for (const c of COLUMNAS.filter((x) => x.grupo === 'muerte_neonatal')) {
    const fuera = enEdades(f1, c.clave, mayores);
    if (fuera.length) {
      hallazgo('error', `muerte-neonatal-edad|${c.clave}`, 'muerte-neonatal-edad', `Hay muertes neonatales fuera de «Menor de 1 año» (${etiquetaColumna(c.clave)})`, `${fuera.map((e) => `${e.label}: ${celda(f1, e.clave, c.clave)}`).join(', ')}. Una muerte neonatal ocurre en los primeros 28 días de vida: el caso va en la fila «Menor de 1 año». Puede ser una fila equivocada al digitar.`, { fila: `${fuera[0].clave}.${c.clave}` });
    }
  }
  for (const c of COLUMNAS.filter((x) => x.grupo === 'neonatologia')) {
    const fuera = enEdades(f1, c.clave, mayores);
    if (fuera.length) {
      hallazgo('aviso', `neonatologia-edad|${c.clave}`, 'neonatologia-edad', `Neonatología tiene casos de 1 año o más (${etiquetaColumna(c.clave)})`, `${fuera.map((e) => `${e.label}: ${celda(f1, e.clave, c.clave)}`).join(', ')}. Neonatología atiende recién nacidos: revise si el caso está en la fila de edad o en la columna correcta.`, { fila: `${fuera[0].clave}.${c.clave}` });
    }
  }
  const fueraMaterna = EDADES.filter((e) => e.desde < 10 || e.desde >= 55);
  for (const c of COLUMNAS.filter((x) => x.grupo === 'muerte_materna')) {
    const fuera = enEdades(f1, c.clave, fueraMaterna);
    if (fuera.length) {
      hallazgo('aviso', `muerte-materna-edad|${c.clave}`, 'muerte-materna-edad', 'Hay muertes maternas fuera de la edad fértil', `${fuera.map((e) => `${e.label}: ${celda(f1, e.clave, c.clave)}`).join(', ')}. Revise la fila de edad; si es correcta, confírmelo.`, { fila: `${fuera[0].clave}.${c.clave}` });
    }
  }
  const ninas = EDADES.filter((e) => e.desde < 10);
  for (const c of COLUMNAS.filter((x) => x.grupo === 'gineco')) {
    const fuera = enEdades(f1, c.clave, ninas);
    if (fuera.length) {
      hallazgo('aviso', `gineco-edad|${c.clave}`, 'gineco-edad', 'Gineco-Obstetricia tiene casos menores de 10 años', `${fuera.map((e) => `${e.label}: ${celda(f1, e.clave, c.clave)}`).join(', ')}. Revise la fila de edad o la columna del servicio.`, { fila: `${fuera[0].clave}.${c.clave}` });
    }
  }

  const infecciones = infeccionesDelMes(f1);
  if (infecciones === 0) {
    hallazgo('info', 'sin-casos', 'sin-casos', 'Ningún caso nuevo de infección intrahospitalaria este mes', 'Un mes sin casos es posible: se registra como 0, no como un mes sin reporte.');
  }
  return { errores, avisos, info };
}

/* La comparación con el mes anterior propia del área (ver arriba): reemplaza
   la variación general del motor. */
export const VARIACION = Object.freeze({
  texto: 'Las infecciones del mes no duplican las del anterior (posible brote)',
  evaluar(datosRecibidos, periodo, anterior) {
    const datos = anidar(datosRecibidos);
    const previos = anidar(anterior?.datos);
    const actual = infeccionesDelMes(datos?.f1);
    const previo = infeccionesDelMes(previos?.f1);
    if (actual == null || previo == null || actual < previo * 2 || actual - previo < 5) return [];
    const porGrupo = GRUPOS.filter((g) => g.infeccion)
      .map((g) => ({ g, d: (totalGrupo(datos.f1, g.clave) ?? 0) - (totalGrupo(previos.f1, g.clave) ?? 0) }))
      .filter((x) => x.d > 0)
      .sort((a, b) => b.d - a.d);
    return [
      {
        id: 'variacion|f1', regla: 'variacion', formato: 'f1', actual, previo, anterior: anterior.periodo,
        titulo: `Posible brote: ${actual} infecciones este mes y ${previo} en ${etiquetaPeriodo(anterior.periodo).toLowerCase()}`,
        detalle: `Suben sobre todo ${porGrupo.slice(0, 2).map((x) => `${grupo(x.g.clave).corto ?? grupo(x.g.clave).label} (+${x.d})`).join(' y ')}. Si hubo un brote, confírmelo: la cifra es real y Estadística sabrá que se revisó. Si no, revise las filas de edad.`,
      },
    ];
  },
});
