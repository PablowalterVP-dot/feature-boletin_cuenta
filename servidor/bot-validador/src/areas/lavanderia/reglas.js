/* Reglas del reporte de Lavandería. Una función pura: recibe los datos del
   reporte y devuelve lo que no cumple, igual que en Nutrición (reglas.js):
     error  impide enviar.
     aviso  no impide enviar, pero exige una justificación escrita.
     info   lo que conviene saber y no exige nada.

   f1 (kilos por servicio) sigue el mismo patrón que los cuadros de
   Nutrición: incompleto, no-numérico, entero, totales, atípico. f3 (ropa
   sucia) es igual, pero por día y categoría en vez de por grupo y comida.
   f2 (confección) y f4 (piezas e insumos) no son cuadrículas por día: sus
   reglas son más simples (una cifra por grupo o insumo, no 31 por fila).

   Un descuadre de totales lleva su `evidencia` (el total escrito y sus
   sumandos, con la casilla de cada uno), como en Nutrición: con eso la
   corrección guiada señala las celdas y Dr. Mochi explica la cuenta. */

import { SERVICIOS, GRUPOS, INSUMOS, formato, filaDe, claveCasilla } from './definicion.js';
import { valoresDe, totalFormato, sumar } from './calculos.js';
import { diasDelMes } from '../../periodos.js';

function dondeF1(claveFila, dia) {
  const fila = filaDe('f1', claveFila);
  return `Kilos por servicio · ${fila?.rotulo ?? claveFila}${dia ? ` · día ${dia}` : ''}`;
}

function mediana(valores) {
  const orden = valores.filter((v) => v != null).sort((a, b) => a - b);
  if (!orden.length) return null;
  const m = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2;
}

/* Un día es atípico si triplica la mediana de su fila y la supera en al
   menos 15 kilos. Solo hacia arriba: un día flojo no es un error. */
function esAtipico(v, med) {
  return med != null && med > 0 && v > Math.max(med * 3, med + 15);
}

export const REGLAS = Object.freeze([
  { id: 'fila-no-catalogada', nivel: 'error', texto: 'Cada fila del Excel es un servicio, un día o un grupo del reporte' },
  { id: 'incompleto', nivel: 'error', texto: 'Todas las casillas de todos los días tienen un dato (un día sin movimiento se anota 0)' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda casilla del archivo es un número' },
  { id: 'entero', nivel: 'error', texto: 'Los kilos, las piezas y los soles son números sin signo (las piezas, además, enteras)' },
  { id: 'totales', nivel: 'error', texto: 'Los totales escritos en el Excel coinciden con la suma de sus días o de sus grupos' },
  { id: 'atipico', nivel: 'aviso', texto: 'Ningún día se dispara frente al resto de su fila' },
  { id: 'confeccion-incompleta', nivel: 'aviso', texto: 'Todo trabajo de confección trae su servicio destinatario' },
  { id: 'insumo-sin-cantidad', nivel: 'aviso', texto: 'Los seis insumos de limpieza traen su cantidad del mes' },
  { id: 'filas-ausentes', nivel: 'info', texto: 'El Excel trae todos los servicios y grupos del reporte' },
]);

const NIVEL_DE_LECTURA = Object.freeze({ 'fila-no-catalogada': 'error' });

function ausente(datos, idFormato, claveFila) {
  return Boolean(datos?.ausentes?.[idFormato]?.includes(claveFila));
}

/* ------------------------------------------------------------------- f1 */

function validarF1(datos, periodo, errores, avisos, info) {
  const n = diasDelMes(periodo);
  const faltan = [];
  const serviciosDelMes = SERVICIOS.filter((s) => !ausente(datos, 'f1', s.clave));
  const noFiguran = SERVICIOS.filter((s) => ausente(datos, 'f1', s.clave));

  if (noFiguran.length) {
    info.push({
      id: 'filas-ausentes|f1', regla: 'filas-ausentes', formato: 'f1',
      titulo: `Kilos por servicio: el Excel no trae ${noFiguran.length === 1 ? 'un servicio' : `${noFiguran.length} servicios`} del reporte`,
      detalle: `${noFiguran.map((s) => s.rotulo).join(', ')}. Se toman como no registrados este mes, no como cero.`,
    });
  }

  for (const s of serviciosDelMes) {
    const valores = valoresDe(datos, 'f1', s.clave, periodo);
    const med = mediana(valores);

    valores.forEach((v, i) => {
      const dia = i + 1;
      const clave = claveCasilla('f1', s.clave, dia);
      const ilegible = datos?.ilegibles?.[clave];

      if (v == null && ilegible != null) {
        errores.push({ id: 'no-numerico', formato: 'f1', fila: s.clave, dia, titulo: `«${ilegible}» no es un número`, detalle: `${dondeF1(s.clave, dia)}. Escriba la cifra en la hoja o corrija el Excel y súbalo otra vez.` });
      } else if (v == null) {
        faltan.push({ fila: s.clave, dia });
      } else if (!Number.isInteger(v) || v < 0) {
        errores.push({ id: 'entero', formato: 'f1', fila: s.clave, dia, titulo: `${v} no es un número de kilos válido`, detalle: `${dondeF1(s.clave, dia)}. Los kilos se cuentan en enteros y no pueden ser negativos.` });
      } else if (esAtipico(v, med)) {
        avisos.push({
          id: `atipico|${clave}`, regla: 'atipico', nivel: 'aviso', formato: 'f1', fila: s.clave, dia,
          titulo: `${v} kilos: el resto del mes ronda los ${Math.round(med)}`,
          detalle: `${dondeF1(s.clave, dia)}. Puede ser real o un cero de más. Revíselo con Dr. Mochi: corríjalo o confirme que es correcto.`,
          /* Para que Dr. Mochi explique la alerta con cifras (correccion.js). */
          valor: v,
          referencia: Math.round(med),
        });
      }
    });

    const declarado = datos?.declarados?.f1?.[s.clave];
    const suma = sumar(valores);
    if (declarado != null && suma != null && declarado !== suma) {
      errores.push({
        id: 'totales', formato: 'f1', fila: s.clave, titulo: `El total del Excel dice ${declarado} y los días suman ${suma}`, detalle: `${dondeF1(s.clave)}. El total es la suma de los días, no se digita aparte.`,
        evidencia: {
          total: { casilla: `escrito|f1|${s.clave}`, etiqueta: `${dondeF1(s.clave)} · TOTAL`, valor: declarado },
          sumandos: valores.map((v, i) => ({ casilla: claveCasilla('f1', s.clave, i + 1), etiqueta: `día ${i + 1}`, valor: v })),
          suma,
          diferencia: declarado - suma,
        },
      });
    }
  }

  const declaradoCuadro = datos?.declarados?.f1?._total;
  const sumaCuadro = totalFormato(datos, 'f1', periodo);
  const filaDescuadrada = errores.some((e) => e.id === 'totales' && e.formato === 'f1');
  if (!filaDescuadrada && declaradoCuadro != null && sumaCuadro != null && declaradoCuadro !== sumaCuadro) {
    errores.push({
      id: 'totales', formato: 'f1', titulo: `El total del cuadro en el Excel dice ${declaradoCuadro} y los servicios suman ${sumaCuadro}`, detalle: 'Kilos por servicio.',
      evidencia: {
        total: { casilla: 'escrito|f1|_total', etiqueta: 'Kilos por servicio · TOTAL', valor: declaradoCuadro },
        // Cada servicio entra con su suma de días y se muestra por la celda de su TOTAL.
        sumandos: serviciosDelMes.map((sv) => ({
          etiqueta: sv.rotulo, valor: sumar(valoresDe(datos, 'f1', sv.clave, periodo)), calculado: true,
          total: `escrito|f1|${sv.clave}`, casillas: valoresDe(datos, 'f1', sv.clave, periodo).map((_, i) => claveCasilla('f1', sv.clave, i + 1)),
        })),
        suma: sumaCuadro,
        diferencia: declaradoCuadro - sumaCuadro,
      },
    });
  }

  if (faltan.length) {
    const muestra = faltan.slice(0, 4).map((c) => `${formato('f1').filas.find((x) => x.clave === c.fila).rotulo}, día ${c.dia}`);
    errores.push({
      id: 'incompleto', formato: 'f1', fila: faltan[0].fila, dia: faltan[0].dia, casillas: faltan,
      titulo: faltan.length === serviciosDelMes.length * n ? 'Kilos por servicio: el cuadro está vacío' : `Kilos por servicio: ${faltan.length === 1 ? 'falta 1 casilla' : `faltan ${faltan.length} casillas`}`,
      detalle: `${muestra.join('; ')}${faltan.length > 4 ? '…' : ''}. Si ese día no hubo movimiento, escriba 0.`,
    });
  }
}

/* ------------------------------------------------------------------- f3 */

function validarF3(datos, periodo, errores, avisos) {
  const n = diasDelMes(periodo);
  for (const categoria of ['comun', 'sucia']) {
    const valores = Array.from({ length: n }, (_, i) => (typeof datos?.f3?.[categoria]?.[i] === 'number' ? datos.f3[categoria][i] : null));
    const faltan = [];
    valores.forEach((v, i) => {
      const dia = i + 1;
      const clave = `f3|${categoria}|${dia}`;
      const ilegible = datos?.ilegibles?.[clave];
      const nombre = categoria === 'comun' ? 'ropa sucia común' : 'ropa sucia';
      if (v == null && ilegible != null) {
        errores.push({ id: 'no-numerico', formato: 'f3', fila: categoria, dia, titulo: `«${ilegible}» no es un número`, detalle: `Ropa sucia · ${nombre} · día ${dia}. Escriba la cifra en la hoja o corrija el Excel y súbalo otra vez.` });
      } else if (v == null) {
        if (!ausente(datos, 'f3', String(dia))) faltan.push(dia);
      } else if (!Number.isInteger(v) || v < 0) {
        errores.push({ id: 'entero', formato: 'f3', fila: categoria, dia, titulo: `${v} no es un número de kilos válido`, detalle: `Ropa sucia · ${nombre} · día ${dia}. Los kilos se cuentan en enteros y no pueden ser negativos.` });
      }
    });
    if (faltan.length) {
      errores.push({
        id: 'incompleto', formato: 'f3', fila: categoria, dia: faltan[0], casillas: faltan.map((d) => ({ fila: categoria, dia: d })),
        titulo: `Ropa sucia (${categoria === 'comun' ? 'común' : 'sucia'}): ${faltan.length === 1 ? 'falta 1 día' : `faltan ${faltan.length} días`}`,
        detalle: `Días ${faltan.slice(0, 6).join(', ')}${faltan.length > 6 ? '…' : ''}. Si ese día no hubo movimiento, escriba 0.`,
      });
    }
    const declarado = datos?.declarados?.f3?.[categoria];
    const suma = sumar(valores);
    if (declarado != null && suma != null && declarado !== suma) {
      errores.push({
        id: 'totales', formato: 'f3', fila: categoria, titulo: `El total de ${categoria === 'comun' ? 'ropa sucia común' : 'ropa sucia'} dice ${declarado} y los días suman ${suma}`, detalle: 'Ropa sucia. El total es la suma de los días, no se digita aparte.',
        evidencia: {
          total: { casilla: `escrito|f3|${categoria}`, etiqueta: `Ropa sucia · ${categoria === 'comun' ? 'común' : 'sucia'} · TOTAL`, valor: declarado },
          sumandos: valores.map((v, i) => ({ casilla: `f3|${categoria}|${i + 1}`, etiqueta: `día ${i + 1}`, valor: v })),
          suma,
          diferencia: declarado - suma,
        },
      });
    }
  }
}

/* ------------------------------------------------------------------- f4 */

function validarF4(datos, errores, avisos, info) {
  const piezas = datos?.f4?.piezas ?? {};
  let suma = null;
  const sinDato = [];
  const sinDatoClaves = [];
  for (const g of GRUPOS) {
    const v = piezas[g.clave];
    const ilegible = datos?.ilegibles?.[`f4|${g.clave}`];
    if (v == null && ilegible != null) {
      errores.push({ id: 'no-numerico', formato: 'f4', fila: g.clave, titulo: `«${ilegible}» no es un número de piezas`, detalle: `Consolidado · ${g.rotulo}. Escriba la cifra en la hoja o corrija el Excel y súbalo otra vez.` });
    } else if (v == null) {
      if (!ausente(datos, 'f4', g.clave)) {
        sinDato.push(g.rotulo);
        sinDatoClaves.push(g.clave);
      }
    } else if (!Number.isInteger(v) || v < 0) {
      errores.push({ id: 'entero', formato: 'f4', fila: g.clave, titulo: `${v} no es un número de piezas válido`, detalle: `Consolidado · ${g.rotulo}. Las piezas se cuentan en enteras y no pueden ser negativas. Si el Excel trae un punto de miles («6.468»), escríbalo sin punto (6468).` });
    } else {
      suma = (suma ?? 0) + v;
    }
  }
  if (sinDato.length) {
    errores.push({ id: 'incompleto', formato: 'f4', casillas: sinDatoClaves, titulo: `Consolidado: ${sinDato.length === 1 ? 'falta 1 grupo' : `faltan ${sinDato.length} grupos`} de piezas`, detalle: `${sinDato.join(', ')}. Si ese mes no hubo movimiento, escriba 0.` });
  }

  const noFiguranGrupos = GRUPOS.filter((g) => ausente(datos, 'f4', g.clave));
  if (noFiguranGrupos.length) {
    info.push({ id: 'filas-ausentes|f4', regla: 'filas-ausentes', formato: 'f4', titulo: `Consolidado: el Excel no trae ${noFiguranGrupos.length === 1 ? 'un grupo' : `${noFiguranGrupos.length} grupos`} de piezas`, detalle: `${noFiguranGrupos.map((g) => g.rotulo).join(', ')}. Se toman como no registrados este mes, no como cero.` });
  }

  const declarado = datos?.declarados?.f4?._total;
  if (declarado != null && suma != null && !sinDato.length && declarado !== suma) {
    errores.push({
      id: 'totales', formato: 'f4', titulo: `El total de piezas del Excel dice ${declarado} y los grupos suman ${suma}`, detalle: 'Consolidado. El total es la suma de los grupos, no se digita aparte.',
      evidencia: {
        total: { casilla: 'escrito|f4|_total', etiqueta: 'Consolidado · TOTAL de piezas', valor: declarado },
        sumandos: GRUPOS.filter((g) => !ausente(datos, 'f4', g.clave)).map((g) => ({ casilla: `f4|${g.clave}`, etiqueta: g.rotulo, valor: piezas[g.clave] ?? null })),
        suma,
        diferencia: declarado - suma,
      },
    });
  }

  const insumos = datos?.f4?.insumos ?? {};
  const sinCantidad = INSUMOS.filter((i) => !(insumos[i.clave] ?? '').trim());
  if (sinCantidad.length) {
    avisos.push({ id: `insumo-sin-cantidad|${sinCantidad.map((i) => i.clave).join('-')}`, regla: 'insumo-sin-cantidad', nivel: 'aviso', formato: 'f4', titulo: `${sinCantidad.length === 1 ? 'Un insumo no trae' : `${sinCantidad.length} insumos no traen`} su cantidad del mes`, detalle: `${sinCantidad.map((i) => i.rotulo).join(', ')}. Si de verdad no se usó, dígalo; si se olvidó anotar, corrija el Excel.` });
  }
  const noFiguranInsumos = INSUMOS.filter((i) => (datos?.ausentes?.f4Insumos ?? []).includes(i.clave));
  if (noFiguranInsumos.length) {
    info.push({ id: 'filas-ausentes|f4-insumos', regla: 'filas-ausentes', formato: 'f4', titulo: `Consolidado: el Excel no trae ${noFiguranInsumos.length === 1 ? 'un insumo' : `${noFiguranInsumos.length} insumos`} del reporte`, detalle: `${noFiguranInsumos.map((i) => i.rotulo).join(', ')}.` });
  }
}

/* ------------------------------------------------------------------- f2 */

function validarF2(datos, avisos) {
  const trabajos = datos?.f2 ?? [];
  const incompletos = trabajos.filter((t) => t.descripcion && (!t.confeccion || !t.servicio));
  if (incompletos.length) {
    avisos.push({
      id: `confeccion-incompleta|${incompletos.map((t) => t.fila).join('-')}`, regla: 'confeccion-incompleta', nivel: 'aviso', formato: 'f2',
      titulo: `${incompletos.length === 1 ? 'Un trabajo de confección no trae' : `${incompletos.length} trabajos de confección no traen`} su cantidad o su servicio destinatario`,
      detalle: `Fila${incompletos.length === 1 ? '' : 's'} ${incompletos.map((t) => t.fila).join(', ')}: «${incompletos.map((t) => t.descripcion).join('», «')}». No impide enviar, pero conviene completarlo para que Estadística sepa a quién se entregó.`,
    });
  }
}

/* ------------------------------------------------------------------- */

export function validar(datos, periodo) {
  const errores = [];
  const avisos = [];
  const info = [];

  for (const h of datos?.lectura ?? []) {
    const nivel = NIVEL_DE_LECTURA[h.regla];
    if (nivel === 'error') errores.push({ ...h, id: h.regla });
    else if (h.regla === 'filas-ausentes') info.push(h);
  }

  validarF1(datos, periodo, errores, avisos, info);
  validarF3(datos, periodo, errores, avisos);
  validarF4(datos, errores, avisos, info);
  validarF2(datos, avisos);

  return { errores, avisos, info };
}

export function avisosPendientes(validacion, datos) {
  return validacion.avisos.filter((a) => !(datos?.justificaciones?.[a.id] ?? '').trim());
}
