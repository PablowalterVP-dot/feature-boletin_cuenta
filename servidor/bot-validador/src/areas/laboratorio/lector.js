/* Lector del Excel de Patología Clínica y Anatomía Patológica (Laboratorio).

   El área lleva UN libro por año con una hoja por mes, que sobrescribe cada
   año (definicion.js, «EL LIBRO»). Se sube el libro entero; el bot:

     1. elige la hoja del mes que se reporta por su nombre (AGO, SET, JUN…) y
        deja las demás sin tocar (CONSOLIDADO, hojas de trabajo, copias como
        «ABRIL (2)», que se informan);
     2. comprueba su «Mes:» y su «Año:». Una hoja que todavía dice el año
        anterior no se sobrescribió: se rechaza antes de leer una cifra, porque
        cargarla mandaría a Estadística las cifras del año pasado;
     3. lee los dos bloques de la hoja por los rótulos de cada fila, dentro de
        su sección, con los alias de cada examen.

   Tres decisiones que no se ven mirando el código por encima:

   - **Un blanco en una fila llenada es 0.** Es la convención del Excel del
     área: la columna TOTAL suma los blancos como cero y el área firma ese
     total. Una fila sin ninguna cifra y sin total sí es «no registrado»
     (null), y la regla `incompleto` lo pide.
   - **Un examen que el mes no trae no es una casilla vacía.** Va a
     `datos.ausentes`: si es `ocasional` (solo figura algunos meses), ni se
     informa; si no, se informa sin exigir que se llene.
   - **Una fila con cifras que el catálogo no conoce no se descarta en
     silencio**: sería un examen que no llega a Estadística sin que nadie lo
     sepa. Es un error de lectura (`fila-no-catalogada`).

   Lo que el Excel trae escrito y no es dato:
     declarados[sección]._total        el TOTAL de la fila de total de la sección (lo guarda la base)
     escritos.filas['sec|examen']      la columna TOTAL de cada examen
     escritos.secciones['sec|proc']    la fila de total de la sección, por procedencia
     escritos.subtotales['sec|sub|proc'] la fila de un subtotal dentro de la sección (y su 'total')
     escritos.patologia                la fila «TOTAL DE EXAMENES LABORATORIO»: { proc…, total }
     escritos.resumen[rótulo]          las filas del resumen que repiten totales
     escritos.general                  el TOTAL general del departamento

   `origen` dice de qué celda salió cada casilla y cada total escrito
   (`claveEscrita`), y si esa celda es una fórmula: quien corrige el libro
   reescribe la cifra de una celda tecleada, pero la de una fórmula se
   recalcula. */

import {
  SECCIONES, PROCEDENCIAS, BLOQUES, HOJAS_DEL_MES, NOMBRES_DEL_MES, FILAS_DE_RESUMEN, TOTAL_PATOLOGIA_CLINICA,
  normalizar, claveFila, claveCasilla, claveEscrita, columnasDe,
} from './definicion.js';
import { comoNumero, problema } from '../../plantillas.js';
import { etiquetaPeriodo } from '../../periodos.js';

export const VERSION = 'LAB-1';

const numeroDeColumna = (letra) => letra.charCodeAt(0) - 64;
const RESUMEN = new Set(FILAS_DE_RESUMEN.map(normalizar));
const PATOLOGIA = normalizar(TOTAL_PATOLOGIA_CLINICA);
const GENERICO = normalizar('TOTAL DE EXAMENES');

/* --------------------------------------------------------- la hoja del mes */

/* Las hojas que pueden ser la de ese mes: por su nombre exacto (sin tildes ni
   mayúsculas). «ABRIL (2)» no es «ABRIL»: es una copia, y se informa. */
export function hojaDelMes(libro, periodo) {
  const mes = Number(periodo.slice(5, 7));
  const nombres = new Set(HOJAS_DEL_MES[mes - 1].map(normalizar));
  const exacta = libro.hojas.find((h) => nombres.has(normalizar(h))) ?? null;
  const copias = libro.hojas.filter((h) => h !== exacta && [...nombres].some((n) => normalizar(h).startsWith(`${n} `) || normalizar(h).startsWith(`${n}(`)));
  return { hoja: exacta, copias };
}

/* El valor que sigue a un rótulo («Mes:», «Año:») en las primeras filas. */
function rotulado(cuadricula, rotulo) {
  for (let r = 1; r <= Math.min(10, cuadricula.ultimaFila); r += 1) {
    for (let c = 1; c <= cuadricula.ultimaColumna; c += 1) {
      if (normalizar(cuadricula.valor(r, c)).replace(/\s/g, '') !== rotulo) continue;
      for (let d = c + 1; d <= c + 3; d += 1) {
        const v = cuadricula.valor(r, d);
        if (v != null && String(v).trim() !== '') return { valor: v, ref: `${String.fromCharCode(64 + d)}${r}` };
      }
      return { valor: null, ref: null };
    }
  }
  return null;
}

/* La fila de cabecera del bloque izquierdo: «Hospitaliz…» en B y «TOTAL» en H.
   Si no está, la hoja no tiene la forma del reporte. */
function filaDeCabecera(cuadricula) {
  for (let r = 1; r <= Math.min(20, cuadricula.ultimaFila); r += 1) {
    if (normalizar(cuadricula.valor(r, 2)).startsWith('HOSP') && normalizar(cuadricula.valor(r, 8)) === 'TOTAL') return r;
  }
  return null;
}

const anioDe = (v) => {
  const m = String(v ?? '').match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : null;
};

/* Reconoce si el libro es el de Laboratorio y si su hoja del mes corresponde
   al periodo que se reporta. */
export async function reconocer(libro, { periodo } = {}) {
  const tieneMeses = HOJAS_DEL_MES.some((nombres) => libro.hojas.some((h) => nombres.map(normalizar).includes(normalizar(h))));
  if (!tieneMeses) {
    return {
      problema: problema('plantilla', 'Este Excel no es el reporte de Laboratorio', 'El bot busca un libro con una hoja por mes (ENERO, FEBRERO… AGO, SET…), como el que el área llena cada año.'),
    };
  }
  const mes = etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();
  const { hoja } = hojaDelMes(libro, periodo);
  if (!hoja) {
    return {
      problema: problema('plantilla-periodo', `El Excel no tiene la hoja de ${mes}`, `El bot busca la hoja «${HOJAS_DEL_MES[Number(periodo.slice(5, 7)) - 1][0]}». Revise que el libro sea el del año y que la hoja tenga ese nombre.`),
    };
  }

  const cuadricula = await libro.cuadricula(hoja);
  if (filaDeCabecera(cuadricula) == null) {
    return {
      problema: problema('plantilla-danada', `La hoja «${hoja}» no tiene la forma del reporte`, 'El bot busca la cabecera de Patología Clínica: «Hospitaliz.» en la columna B y «TOTAL» en la H.'),
    };
  }

  const delMes = rotulado(cuadricula, 'MES:');
  const nombresDelMes = NOMBRES_DEL_MES[Number(periodo.slice(5, 7)) - 1];
  if (delMes?.valor != null && !nombresDelMes.includes(normalizar(delMes.valor))) {
    return {
      problema: problema('plantilla-periodo', `La hoja «${hoja}» dice que es de ${String(delMes.valor).trim().toLowerCase()}`, `Su celda «Mes:» (${delMes.ref}) no es ${mes}. Revise la hoja antes de subir el libro.`),
    };
  }

  const anio = anioDe(rotulado(cuadricula, 'ANO:')?.valor);
  const pedido = Number(periodo.slice(0, 4));
  if (anio != null && anio !== pedido) {
    return {
      problema: problema(
        'hoja-de-otro-anio',
        `La hoja de ${mes} todavía tiene las cifras de ${anio}`,
        `Su «Año:» dice ${anio}. El libro se sobrescribe cada año: llene la hoja «${hoja}» con las cifras de ${mes} de ${pedido} y vuelva a subirlo.`,
      ),
    };
  }

  return { plantilla: { area: 'laboratorio', periodo: periodo ?? null, version: VERSION, hoja } };
}

/* ------------------------------------------------------------- las cifras */

/* Un mapa rótulo → examen por sección, con los alias. */
const EXAMENES = new Map(SECCIONES.map((s) => [s.id, new Map(s.examenes.flatMap((e) => [e.etiqueta, ...e.alias].map((r) => [normalizar(r), e])))]));
const TOTALES = new Map(SECCIONES.filter((s) => s.etiquetaTotal).flatMap((s) => [s.etiquetaTotal, ...(s.aliasTotal ?? [])].map((r) => [normalizar(r), s])));
const TITULOS = new Map(SECCIONES.filter((s) => s.titulo).flatMap((s) => [s.titulo, ...(s.aliasTitulo ?? [])].map((r) => [normalizar(r), s])));
const SUBTITULOS = new Set(SECCIONES.flatMap((s) => s.subtitulos ?? []).map(normalizar));
const SUBTOTALES = new Map(SECCIONES.flatMap((s) => (s.subtotales ?? []).map((st) => [`${s.id}|${normalizar(st.etiqueta)}`, st])));

/* Lee una fila: las procedencias de la sección y su total. Si la fila tiene
   alguna cifra (o su total), sus blancos son 0: así los suma el TOTAL del
   Excel. Si no tiene ninguna, la fila no se registró. */
function leerFila(cuadricula, r, columnas) {
  const celdas = Object.fromEntries(Object.entries(columnas.porProcedencia).map(([p, col]) => [p, comoNumero(cuadricula.valor(r, numeroDeColumna(col)))]));
  const total = comoNumero(cuadricula.valor(r, numeroDeColumna(columnas.total)));
  const llenada = total.numero != null || Object.values(celdas).some((c) => c.numero != null || c.ilegible != null);
  const valores = {};
  const ilegibles = {};
  for (const [p, c] of Object.entries(celdas)) {
    if (c.ilegible != null) {
      valores[p] = null;
      ilegibles[p] = c.ilegible;
    } else valores[p] = c.numero ?? (llenada ? 0 : null);
  }
  return { valores, ilegibles, total: total.numero ?? null, conCifras: llenada };
}

/* Las procedencias de la fila de total de un bloque (sin las del resumen). */
function totalesDeBloque(cuadricula, r, bloque) {
  const b = BLOQUES[bloque];
  const fila = {};
  PROCEDENCIAS.forEach((p, i) => {
    const v = comoNumero(cuadricula.valor(r, numeroDeColumna(b.datos[i]))).numero;
    if (v != null) fila[p.clave] = v;
  });
  const total = comoNumero(cuadricula.valor(r, numeroDeColumna(b.total))).numero;
  if (total != null) fila.total = total;
  return fila;
}

/* Lee las cifras de la hoja del mes, ya reconocida. */
export async function leerCifras(libro, { periodo } = {}) {
  const { hoja, copias } = hojaDelMes(libro, periodo);
  if (!hoja) return { problema: problema('plantilla-periodo', 'No se encontró la hoja del mes') };
  const cuadricula = await libro.cuadricula(hoja);

  const datos = { declarados: {}, escritos: { filas: {}, secciones: {}, subtotales: {}, resumen: {}, patologia: null, general: null }, ilegibles: {} };
  const origen = {};
  const celda = (r, columna) => ({ hoja, fila: r, columna, ...(cuadricula.esFormula(r, numeroDeColumna(columna)) ? { formula: true } : {}) });
  const hallazgos = [];
  const vistos = new Map(SECCIONES.map((s) => [s.id, new Set()]));
  let leidas = 0;

  const registrar = (s, examen, r, columnas) => {
    vistos.get(s.id).add(examen.clave);
    const fila = leerFila(cuadricula, r, columnas);
    const cuadro = (datos[s.id] ??= {});
    for (const [p, v] of Object.entries(fila.valores)) {
      const clave = claveFila(examen.clave, p);
      cuadro[clave] = v;
      if (fila.ilegibles[p] != null) datos.ilegibles[claveCasilla(s.id, clave)] = fila.ilegibles[p];
      if (v != null) leidas += 1;
      origen[claveCasilla(s.id, clave)] = celda(r, columnas.porProcedencia[p]);
    }
    // En el resumen la única columna es el TOTAL: no hay otro total que comparar.
    if (Object.keys(columnas.porProcedencia).length > 1) {
      if (fila.total != null) datos.escritos.filas[`${s.id}|${examen.clave}`] = fila.total;
      origen[claveEscrita('fila', s.id, examen.clave)] = celda(r, columnas.total);
    }
  };

  const desconocida = (s, r, columnaRotulo) => {
    hallazgos.push({
      id: `fila-no-catalogada|${s?.id ?? 'hoja'}|${r}`,
      regla: 'fila-no-catalogada',
      ...(s ? { formato: s.id } : {}),
      titulo: `La fila «${String(cuadricula.valor(r, numeroDeColumna(columnaRotulo))).trim()}» no es un examen del reporte`,
      detalle: `Está en la fila ${r} de la hoja «${hoja}»${s ? `, dentro de ${s.label}` : ''}, y trae cifras. Si es un examen nuevo, hay que agregarlo al reporte; si es un error de rótulo, corríjalo.`,
    });
  };

  for (const bloque of ['izquierda', 'derecha']) {
    const b = BLOQUES[bloque];
    let actual = null;
    for (let r = 1; r <= cuadricula.ultimaFila; r += 1) {
      // El TOTAL general: «TOTAL» en P y la cifra en Q, sin rótulo en J.
      if (bloque === 'derecha' && normalizar(cuadricula.valor(r, 16)) === 'TOTAL') {
        const general = comoNumero(cuadricula.valor(r, 17)).numero;
        if (general != null) {
          datos.escritos.general = general;
          origen._general = { hoja, fila: r, columna: 'Q' };
          origen[claveEscrita('general')] = celda(r, 'Q');
        }
        continue;
      }
      const rotulo = normalizar(cuadricula.valor(r, numeroDeColumna(b.rotulo)));
      if (!rotulo) continue;
      // Las filas de cabecera de columnas («Hospitaliz.», «Emergenc.»…).
      if (normalizar(cuadricula.valor(r, numeroDeColumna(b.datos[0]))).startsWith('HOSP') && !TOTALES.has(rotulo)) continue;

      if (bloque === 'izquierda' && rotulo === PATOLOGIA) {
        datos.escritos.patologia = totalesDeBloque(cuadricula, r, bloque);
        PROCEDENCIAS.forEach((p, i) => (origen[claveEscrita('patologia', p.clave)] = celda(r, b.datos[i])));
        origen[claveEscrita('patologia', 'total')] = celda(r, b.total);
        continue;
      }
      const titulo = TITULOS.get(rotulo);
      if (titulo?.bloque === bloque) {
        actual = titulo;
        continue;
      }
      const total = TOTALES.get(rotulo);
      // «TOTAL DE EXAMENES» es el de Metaxénicas: genérico, solo vale dentro de su título.
      if (total?.bloque === bloque && (rotulo !== GENERICO || actual?.id === total.id)) {
        actual = total;
        const fila = totalesDeBloque(cuadricula, r, bloque);
        const columnas = columnasDe(total.id);
        for (const p of total.procedencias ?? PROCEDENCIAS) {
          const v = comoNumero(cuadricula.valor(r, numeroDeColumna(columnas.porProcedencia[p.clave]))).numero;
          if (v != null) datos.escritos.secciones[`${total.id}|${p.clave}`] = v;
          origen[claveEscrita('seccion', total.id, p.clave)] = celda(r, columnas.porProcedencia[p.clave]);
        }
        if (fila.total != null) datos.declarados[total.id] = { _total: fila.total };
        origen[`${total.id}|_total`] = { hoja, fila: r, columna: b.total };
        origen[claveEscrita('declarado', total.id)] = celda(r, b.total);
        continue;
      }
      if (!actual) continue;

      if (actual.id === 'actividades' && RESUMEN.has(rotulo)) {
        const v = comoNumero(cuadricula.valor(r, numeroDeColumna(b.total))).numero;
        if (v != null) datos.escritos.resumen[rotulo] = v;
        continue;
      }
      const examen = EXAMENES.get(actual.id).get(rotulo);
      if (examen) {
        registrar(actual, examen, r, columnasDe(actual.id));
        continue;
      }
      if (SUBTITULOS.has(rotulo)) continue;
      const subtotal = SUBTOTALES.get(`${actual.id}|${rotulo}`);
      if (subtotal) {
        const columnas = columnasDe(actual.id);
        for (const p of actual.procedencias ?? PROCEDENCIAS) {
          const v = comoNumero(cuadricula.valor(r, numeroDeColumna(columnas.porProcedencia[p.clave]))).numero;
          if (v != null) datos.escritos.subtotales[`${actual.id}|${subtotal.id}|${p.clave}`] = v;
          origen[claveEscrita('subtotal', actual.id, `${subtotal.id}.${p.clave}`)] = celda(r, columnas.porProcedencia[p.clave]);
        }
        const total = comoNumero(cuadricula.valor(r, numeroDeColumna(columnas.total))).numero;
        if (total != null) datos.escritos.subtotales[`${actual.id}|${subtotal.id}|total`] = total;
        continue;
      }
      if (leerFila(cuadricula, r, columnasDe(actual.id)).conCifras) desconocida(actual, r, b.rotulo);
    }
  }

  /* Una sección con subtotales: su fila de total ya no es el total de la
     sección, sino el de lo que queda fuera de los subtotales. El total de la
     sección (el que guarda la base) es la suma de esas filas, y ninguna celda
     lo trae escrito: no se corrige como una celda. */
  for (const s of SECCIONES) {
    const subtotales = Object.entries(datos.escritos.subtotales).filter(([k]) => k.startsWith(`${s.id}|`) && k.endsWith('|total'));
    if (!subtotales.length || datos.declarados[s.id]?._total == null) continue;
    datos.declarados[s.id]._total += subtotales.reduce((n, [, v]) => n + v, 0);
    delete origen[claveEscrita('declarado', s.id)];
  }

  /* Los exámenes que la hoja no trae: no aplican ese mes, no están vacíos. */
  const ausentes = {};
  for (const s of SECCIONES) {
    const faltan = s.examenes.filter((e) => !vistos.get(s.id).has(e.clave)).map((e) => e.clave);
    if (faltan.length) ausentes[s.id] = faltan;
  }
  if (Object.keys(ausentes).length) datos.ausentes = ausentes;

  /* Lo que conviene saber de la hoja leída. */
  const anio = anioDe(rotulado(cuadricula, 'ANO:')?.valor);
  hallazgos.push({
    id: 'hoja-leida',
    regla: 'hoja-leida',
    titulo: `Se leyó la hoja «${hoja}»`,
    detalle: `${etiquetaPeriodo(periodo)}${anio ? ` (su «Año:» dice ${anio})` : ''}. Las otras ${libro.hojas.length - 1} hojas del libro no se tocan.`,
  });
  if (copias.length) {
    hallazgos.push({
      id: 'hoja-copia',
      regla: 'hoja-copia',
      titulo: `El libro trae también ${copias.map((c) => `«${c}»`).join(', ')}`,
      detalle: `Se leyó «${hoja}», no la copia. Si la copia es la que tiene las cifras correctas, cópielas a «${hoja}» y vuelva a subir el libro.`,
    });
  }
  if (anio == null) {
    hallazgos.push({
      id: 'anio-no-escrito',
      regla: 'anio-no-escrito',
      titulo: `La hoja «${hoja}» no dice de qué año es`,
      detalle: `El libro se sobrescribe cada año y sin el «Año:» no se puede comprobar que estas sean las cifras de ${periodo.slice(0, 4)} y no las del año anterior. Confírmelo.`,
    });
  }

  return { datos, origen, leidas, hallazgos, periodo };
}

/* La celda de una casilla, para mostrar de dónde salió. Es mensual: la fila y
   la columna del origen ya son la celda, no hay día que sumar. */
export function celdaDeOrigen(origen, idCuadro, clave) {
  const o = origen?.[claveCasilla(idCuadro, clave)];
  return o ? { hoja: o.hoja, ref: `${o.columna}${o.fila}` } : null;
}
