/* Reglas del reporte de Gineco-Obstetricia.

   Una función pura: recibe los datos (definicion.js) y devuelve lo que no
   cumple. Tres niveles, como en las demás áreas:
     error  impide enviar. Lo que no cuadra no sale del área.
     aviso  no impide enviar, pero hay que revisarlo y aceptarlo.
     info   lo que conviene saber y no exige nada.

   Del Excel salen además, en `datos.lectura` (lector.js):
     cuadro-ausente      el Excel no trae uno de los dos cuadros ese mes
     filas-ausentes      el cuadro no trae una de sus filas
     fila-no-catalogada  una fila con cifras que el catálogo no conoce

   El cuadro 2 (partos, cesáreas y nacidos) solo lo trae el Excel real desde
   setiembre de 2026: su ausencia es un aviso, no un error — el cuadro 1
   (controles prenatales) sigue siendo un reporte útil sin él, y bloquear el
   envío dejaría a Estadística sin nada los ocho primeros meses del año.

   Cada hallazgo de una cifra nombra su casilla (`fila`, «edad_15_19.controles_prenatales»)
   y un descuadre del TOTAL lleva su `evidencia`: con eso la corrección guiada
   señala las celdas del Excel y Dr. Mochi explica la cuenta (correccion.js). */

import { EDADES, TIPOS_PARTO, COLUMNAS_F1, COLUMNAS_F2, claveFila } from './definicion.js';
import { valor, totalColumna } from './calculos.js';

export const REGLAS = Object.freeze([
  { id: 'incompleto', nivel: 'error', texto: 'Los cuadros presentes tienen todas sus casillas (sin casos se anota 0)' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda celda de cifras del Excel es un número' },
  { id: 'entero', nivel: 'error', texto: 'Las cifras son enteros sin signo' },
  { id: 'totales', nivel: 'error', texto: 'La fila TOTAL de cada cuadro cuadra con la suma de sus filas' },
  { id: 'filas-ausentes', nivel: 'aviso', texto: 'Cada cuadro presente trae todas sus filas' },
  { id: 'fila-no-catalogada', nivel: 'error', texto: 'Toda fila con cifras es una fila del cuadro' },
  { id: 'cuadro-2-ausente', nivel: 'aviso', texto: 'El Excel trae el cuadro de partos, cesáreas y nacidos' },
]);

const NIVEL_DE_LECTURA = Object.freeze({ 'filas-ausentes': 'aviso' });
const filasDe = (idCuadro) => (idCuadro === 'f1' ? EDADES : TIPOS_PARTO);
const columnasDe = (idCuadro) => (idCuadro === 'f1' ? COLUMNAS_F1 : COLUMNAS_F2);
const rotuloDe = (fila) => fila.nombre ?? fila.rotulo;

const cifraTexto = (n) => (n == null ? 'sin registrar' : n.toLocaleString('es-PE'));
const noEsEnteroValido = (v) => v != null && (!Number.isInteger(v) || v < 0);

export function validar(datosRecibidos, periodo) {
  const datos = datosRecibidos ?? {};
  const f1 = datos.f1 ?? {};
  const f2 = datos.f2 ?? {};
  const errores = [];
  const avisos = [];
  const info = [];
  const hallazgo = (nivel, id, regla, titulo, detalle, extra = {}) => {
    const h = { id, regla, ...extra, titulo, detalle };
    (nivel === 'error' ? errores : nivel === 'aviso' ? avisos : info).push(h);
  };

  for (const h of datos.lectura ?? []) {
    if (h.regla === 'fila-no-catalogada') {
      errores.push(h);
    } else if (h.regla === 'cuadro-ausente') {
      if (h.formato === 'f2') avisos.push({ ...h, regla: 'cuadro-2-ausente', nivel: 'aviso' });
      else errores.push(h);
    } else {
      const nivel = NIVEL_DE_LECTURA[h.regla];
      if (nivel === 'aviso') avisos.push({ ...h, nivel: 'aviso' });
      else if (nivel === 'info') info.push(h);
    }
  }

  /* No numérico: una celda del Excel con texto donde va una cifra. */
  for (const [clave, texto] of Object.entries(datos.ilegibles ?? {})) {
    const [idCuadro, casilla] = clave.split('|');
    const [fila, columna] = casilla.split('.');
    const filaInfo = filasDe(idCuadro).find((x) => x.clave === fila);
    const columnaInfo = columnasDe(idCuadro).find((x) => x.clave === columna);
    hallazgo(
      'error', `ilegible-${clave}`, 'no-numerico',
      `«${columnaInfo?.nombre ?? columna}» (${filaInfo?.rotulo ?? fila}) no es un número: «${texto}»`,
      'Corrija la celda en el Excel y vuelva a subirlo.',
      { formato: idCuadro, fila: casilla },
    );
  }

  /* Enteros sin signo, en los dos cuadros presentes. */
  /* Uno por casilla, empezando por la cifra: la corrección guiada la lee del
     título para proponer el entero. */
  for (const idCuadro of ['f1', 'f2']) {
    if (!Object.keys(idCuadro === 'f1' ? f1 : f2).length) continue;
    for (const fila of filasDe(idCuadro)) {
      for (const columna of columnasDe(idCuadro)) {
        const v = valor(datos, idCuadro, fila.clave, columna.clave);
        if (!noEsEnteroValido(v)) continue;
        const casilla = claveFila(fila.clave, columna.clave);
        hallazgo(
          'error', `enteros|${idCuadro}|${casilla}`, 'entero',
          `${v} en «${columna.nombre}» (${rotuloDe(fila)}) no es un entero sin signo`,
          'Se cuentan personas y atenciones: no hay medias ni negativas.',
          { formato: idCuadro, fila: casilla },
        );
      }
    }
  }

  /* Incompleto: el cuadro tiene alguna cifra pero no todas. Un cuadro
     ausente por completo ya lo dice «cuadro-ausente» (arriba); aquí solo
     importa el cuadro que sí llegó y le falta alguna casilla suelta. */
  if (Object.keys(f1).length) {
    const vacias = EDADES.flatMap((e) => COLUMNAS_F1.filter((c) => valor(datos, 'f1', e.clave, c.clave) == null).map((c) => ({ casilla: claveFila(e.clave, c.clave), texto: `${c.nombre} · ${e.rotulo}` })));
    const sinRegistrar = vacias.map((x) => x.texto);
    if (sinRegistrar.length) {
      hallazgo(
        'error', 'incompleto|f1', 'incompleto',
        `${sinRegistrar.length === 1 ? 'Falta una casilla' : `Faltan ${sinRegistrar.length} casillas`} del cuadro 1`,
        `${sinRegistrar.join(', ')}. Si no hubo casos, escriba 0: una casilla vacía no distingue un cero de un olvido.`,
        { formato: 'f1', casillas: vacias.map((x) => x.casilla) },
      );
    }
  }
  if (Object.keys(f2).length) {
    const vacias = TIPOS_PARTO.flatMap((t) => COLUMNAS_F2.filter((c) => valor(datos, 'f2', t.clave, c.clave) == null).map((c) => ({ casilla: claveFila(t.clave, c.clave), texto: `${c.nombre} · ${t.nombre}` })));
    const sinRegistrar = vacias.map((x) => x.texto);
    if (sinRegistrar.length) {
      hallazgo(
        'error', 'incompleto|f2', 'incompleto',
        `${sinRegistrar.length === 1 ? 'Falta una casilla' : `Faltan ${sinRegistrar.length} casillas`} del cuadro 2`,
        `${sinRegistrar.join(', ')}. Si no hubo casos, escriba 0: una casilla vacía no distingue un cero de un olvido.`,
        { formato: 'f2', casillas: vacias.map((x) => x.casilla) },
      );
    }
  }

  /* Totales: la fila TOTAL que el Excel ya trae, vuelta a sumar con las
     filas del mismo cuadro. */
  for (const [idCuadro, columnas] of [['f1', COLUMNAS_F1], ['f2', COLUMNAS_F2]]) {
    const declarados = datos.escritos?.declarados?.[idCuadro];
    if (!declarados) continue;
    for (const columna of columnas) {
      const declarado = declarados[columna.clave];
      const calculado = totalColumna(datos, idCuadro, columna.clave);
      if (declarado != null && calculado != null && declarado !== calculado) {
        const dif = declarado - calculado;
        hallazgo(
          'error', `totales|${idCuadro}|${columna.clave}`, 'totales',
          `«${columna.nombre}»: la fila TOTAL dice ${cifraTexto(declarado)} y sus filas suman ${cifraTexto(calculado)}`,
          `${Math.abs(dif).toLocaleString('es-PE')} ${dif > 0 ? 'de más' : 'de menos'}. El TOTAL es la suma de las filas del cuadro, no se digita aparte. Corrija el Excel y vuelva a subirlo.`,
          {
            formato: idCuadro, declarado, calculado,
            evidencia: {
              total: { casilla: `escrito|${idCuadro}|${columna.clave}`, etiqueta: `${columna.nombre} · TOTAL`, valor: declarado },
              sumandos: filasDe(idCuadro).map((f) => ({ casilla: `${idCuadro}|${claveFila(f.clave, columna.clave)}`, etiqueta: rotuloDe(f), valor: valor(datos, idCuadro, f.clave, columna.clave) })),
              suma: calculado,
              diferencia: dif,
            },
          },
        );
      }
    }
  }

  return { errores, avisos, info };
}
