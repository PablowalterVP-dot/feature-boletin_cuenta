/* Reglas del reporte de Nefrología y Hemodiálisis.

   Una función pura: recibe los datos (definicion.js) y devuelve lo que no
   cumple. Tres niveles, como en las demás áreas:
     error  impide enviar. Lo que no cuadra no sale del servicio.
     aviso  no impide enviar, pero hay que revisarlo y aceptarlo.
     info   lo que conviene saber y no exige nada.

   Del Word salen además, en `datos.lectura` (lector.js):
     filas-ausentes      el cuadro no trae un indicador del catálogo
     fila-no-catalogada  una fila con cifras que el catálogo no conoce

   Cada hallazgo de una cifra nombra su casilla (`fila`, la clave del
   indicador) y el descuadre de un total lleva su `evidencia`: con eso la
   corrección guiada señala las celdas del Word y Dr. Mochi explica la cuenta. */

import { INDICADORES, COLUMNAS } from './definicion.js';

export const REGLAS = Object.freeze([
  { id: 'incompleto', nivel: 'error', texto: 'El mes tiene todos sus indicadores registrados (sin atenciones se anota 0)' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda celda de cifras del cuadro es un número' },
  { id: 'entero', nivel: 'error', texto: 'Las cifras son enteros sin signo' },
  { id: 'totales', nivel: 'error', texto: 'Los trimestres, semestres y el total anual que suman el mes del reporte cuadran con sus meses' },
  { id: 'totales-anteriores', nivel: 'aviso', texto: 'Los totales de meses ya entregados que el cuadro trae escritos cuadran con sus meses' },
  { id: 'filas-ausentes', nivel: 'aviso', texto: 'El cuadro trae todos los indicadores del reporte' },
  { id: 'fila-no-catalogada', nivel: 'error', texto: 'Toda fila con cifras es un indicador del reporte' },
]);

const NIVEL_DE_LECTURA = Object.freeze({ 'filas-ausentes': 'aviso' });

const cifra = (n) => (n == null ? 'sin registrar' : n.toLocaleString('es-PE'));
const noEsEnteroValido = (v) => v != null && (!Number.isInteger(v) || v < 0);

/* Los meses que suma un total del cuadro: un semestre suma sus dos
   trimestres y el total anual sus dos semestres, así que se baja hasta los
   meses. */
function mesesDe(clave) {
  if (clave.startsWith('mes')) return [Number(clave.slice(3))];
  return COLUMNAS.find((c) => c.clave === clave)?.partes.flatMap(mesesDe) ?? [];
}

/* Los totales escritos de una fila que no cuadran con sus meses. El mes del
   reporte se toma de `datos.f1` (lo que la corrección guiada corrige); los
   demás, del mismo documento. Un total con algún mes vacío no se compara. */
function descuadres(datos, periodo) {
  const mesDelReporte = Number(String(periodo ?? '').slice(5, 7));
  const lista = [];
  for (const [clave, fila] of Object.entries(datos.escritos?.cuadro ?? {})) {
    const indicador = INDICADORES.find((i) => i.clave === clave);
    if (!indicador) continue;
    const delMes = (m) => (m === mesDelReporte ? datos.f1?.[clave] ?? null : fila[`mes${m}`] ?? null);
    for (const col of COLUMNAS.filter((c) => c.tipo === 'agregado')) {
      const declarado = fila[col.clave];
      const meses = mesesDe(col.clave);
      const valores = meses.map(delMes);
      if (declarado == null || valores.some((v) => v == null)) continue;
      const calculado = valores.reduce((a, b) => a + b, 0);
      if (declarado === calculado) continue;
      lista.push({
        indicador: clave, indicadorNombre: indicador.nombre, clave: col.clave, etiqueta: col.etiqueta, declarado, calculado, delMes: meses.includes(mesDelReporte),
        evidencia: {
          total: { casilla: `escrito|f1|${clave}|${col.clave}`, etiqueta: `${indicador.nombre} · ${col.etiqueta}`, valor: declarado },
          /* Solo el mes del reporte se corrige aquí: los demás ya se enviaron. */
          sumandos: meses.map((m, i) => ({
            ...(m === mesDelReporte ? { casilla: `f1|${clave}` } : {}),
            etiqueta: COLUMNAS.find((c) => c.mes === m).etiqueta,
            valor: valores[i],
          })),
          suma: calculado,
          diferencia: declarado - calculado,
        },
      });
    }
  }
  return lista;
}

export function validar(datosRecibidos, periodo) {
  const datos = datosRecibidos ?? {};
  const f1 = datos.f1 ?? {};
  const errores = [];
  const avisos = [];
  const info = [];
  const hallazgo = (nivel, id, regla, titulo, detalle, extra = {}) => {
    const h = { id, regla, formato: 'f1', titulo, detalle, ...extra };
    (nivel === 'error' ? errores : nivel === 'aviso' ? avisos : info).push(h);
  };

  for (const h of datos.lectura ?? []) {
    if (h.regla === 'fila-no-catalogada') {
      errores.push(h);
      continue;
    }
    const nivel = NIVEL_DE_LECTURA[h.regla];
    if (nivel === 'aviso') avisos.push({ ...h, nivel: 'aviso' });
    else if (nivel === 'info') info.push(h);
  }

  /* No numérico: una celda del Word con texto donde va una cifra. */
  for (const [clave, texto] of Object.entries(datos.ilegibles ?? {})) {
    const indicador = INDICADORES.find((i) => `f1|${i.clave}` === clave);
    hallazgo(
      'error', `ilegible-${clave}`, 'no-numerico',
      `«${indicador?.nombre ?? clave}» no es un número: «${texto}»`,
      'Corrija la celda en el Word (un guion «-» cuenta como cero) y vuelva a subirlo.',
      { fila: indicador?.clave },
    );
  }

  /* Enteros sin signo: uno por casilla, empezando por la cifra (la
     corrección guiada la lee del título para proponer el entero). */
  for (const i of INDICADORES) {
    const v = f1[i.clave];
    if (!noEsEnteroValido(v)) continue;
    hallazgo(
      'error', `enteros|${i.clave}`, 'entero',
      `${v} en «${i.nombre}» no es un entero sin signo`,
      'Se cuentan atenciones: no hay medias atenciones ni atenciones negativas.',
      { fila: i.clave },
    );
  }

  /* Incompleto: el mes tiene alguna cifra pero no todas. Si no tiene ninguna,
     reconocer() ya bloqueó el archivo: no se llega hasta aquí. */
  const sinRegistrar = INDICADORES.filter((i) => f1[i.clave] == null && !(datos.ilegibles?.[`f1|${i.clave}`] != null));
  if (sinRegistrar.length) {
    hallazgo(
      'error', 'incompleto', 'incompleto',
      `${sinRegistrar.length === 1 ? 'Falta un indicador' : `Faltan ${sinRegistrar.length} indicadores`} de este mes`,
      `${sinRegistrar.map((i) => i.nombre).join(', ')}. Si no hubo casos, escriba 0 (o el guion «-» que usa el cuadro): una casilla vacía no distingue un cero de un olvido.`,
      { casillas: sinRegistrar.map((i) => i.clave) },
    );
  }

  /* Totales: los trimestres, semestres y el total anual que el cuadro ya
     trae calculados, vueltos a sumar con los meses del mismo documento.

     El cuadro es del año entero. Un total que suma el mes del reporte es
     error: no cuadra con lo que se envía. Uno que no lo suma (I TRIM, al
     enviar octubre) es de meses ya entregados: es alerta, se corrige o se
     confirma, pero no impide enviar el mes. Antes del 07/11/2026 era error, y
     un descuadre de marzo dejaba a Nefrología sin poder enviar ningún mes. */
  for (const c of descuadres(datos, periodo)) {
    const dif = c.declarado - c.calculado;
    const cuenta = `${Math.abs(dif).toLocaleString('es-PE')} ${dif > 0 ? 'de más' : 'de menos'}. ${c.etiqueta} es la suma de sus meses, no se digita aparte.`;
    hallazgo(
      c.delMes ? 'error' : 'aviso', `${c.delMes ? 'totales' : 'totales-anteriores'}|${c.indicador}|${c.clave}`, c.delMes ? 'totales' : 'totales-anteriores',
      `«${c.indicadorNombre}»: el cuadro dice ${cifra(c.declarado)} en ${c.etiqueta} y sus meses suman ${cifra(c.calculado)}`,
      c.delMes
        ? `${cuenta} Corrija el cuadro y vuelva a subirlo.`
        : `${cuenta} Son meses ya entregados: no impide enviar este mes, pero el cuadro sigue mal. Corrija el total o confírmelo.`,
      { declarado: c.declarado, calculado: c.calculado, evidencia: c.evidencia },
    );
  }

  return { errores, avisos, info };
}
