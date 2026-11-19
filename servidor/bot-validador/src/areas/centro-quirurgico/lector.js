/* Lector del Excel de Centro Quirúrgico.

   El área sube su libro del mes, que es ACUMULADO (definicion.js, «EL
   LIBRO»): cada hoja trae una columna por mes y el bot lee solo la del mes
   que se reporta. El recorrido:

     1. ubica las cinco hojas por su nombre (sin tildes ni espacios de más);
        las demás no se tocan;
     2. comprueba el mes y el año con el título de SUSPENDIDAS («HOSPITAL
        REGIONAL DE LORETO - JUNIO 2026»), la única hoja que lo escribe. Un
        libro de otro mes trae otra columna llena: cargarlo mandaría las
        cifras de ese mes con el nombre de este;
     3. busca la columna del mes por su cabecera (ENE…DIC, o ENERO…DICIEMBRE
        en el RESUMEN), no por su letra: los trimestres entre los meses la
        corren;
     4. lee cada fila por su rótulo.

   Decisiones que no se ven mirando el código por encima:

   - **En las hojas por especialidad, un blanco en la columna del mes es 0.**
     Es la convención del Excel del área: el total de la especialidad es un
     SUM que cuenta los blancos como cero, y las filas agregadas a mitad de
     año quedan en blanco en los meses anteriores.
   - **El total de una especialidad es la suma de sus procedimientos**, no la
     cifra escrita en su fila: esa va a `declarados` y la regla `subtotales`
     las compara.
   - **Una especialidad nueva no se suma en silencio a la anterior.** Una fila
     en mayúsculas cuya cifra del mes es una fórmula (así son las filas de
     especialidad; los procedimientos se teclean) y que no está en el catálogo
     es un error de lectura (`especialidad-no-catalogada`).
   - **Las horas son horas:minutos, no una división.** Las celdas de horas
     tienen formato `[h]:mm`: Excel guarda la duración en días (41,58) y la
     muestra en horas («997:57»). Se leen en horas: el número por 24. Una
     celda escrita como texto («997:57») se lee igual. Hasta el 07/11/2026 se
     tomaba el 41,58 como horas: todas las horas salían divididas entre 24.
   - **Las horas se redondean a centésimas.** El RESUMEN suma duraciones del
     registro paciente por paciente y trae ruido de coma flotante
     (38.749999999999979).

   `origen` dice de qué celda salió cada casilla, y si es una fórmula. */

import {
  HOJAS, MESES_CORTOS, MESES_LARGOS, CONCEPTOS_RESUMEN, TIPOS, INSUMOS_INDICADORES, CAUSAS, ESPECIALIDADES,
  normalizar, claveCasilla,
} from './definicion.js';
import { comoNumero, problema } from '../../plantillas.js';
import { etiquetaPeriodo, periodoDeTexto } from '../../periodos.js';
import { letraDeColumna } from '../../xlsx.js';

export const VERSION = 'CQX-1';

/* ------------------------------------------------------------- las hojas */

/* El nombre real de cada hoja que se lee, o null si el libro no la trae. */
export function hojasDelLibro(libro) {
  return Object.fromEntries(
    Object.entries(HOJAS).map(([clave, nombres]) => [clave, nombres.map((n) => libro.hojas.find((h) => normalizar(h) === n)).find(Boolean) ?? null]),
  );
}

const NOMBRE_HOJA = Object.freeze({
  resumen: 'RESUMEN',
  indicadores: 'CUADRO DE INDICADORES',
  suspendidas: 'SUSPENDIDAS',
  mayor: 'CIRUGIA MAYOR',
  menor: 'CIRUGIA MENOR',
});

/* El título con el mes: «HOSPITAL REGIONAL DE LORETO - JUNIO 2026». */
function tituloDelMes(cuadricula) {
  for (let r = 1; r <= Math.min(6, cuadricula.ultimaFila); r += 1) {
    for (let c = 1; c <= Math.min(8, cuadricula.ultimaColumna); c += 1) {
      const v = cuadricula.valor(r, c);
      const periodo = periodoDeTexto(v);
      if (periodo) return { texto: String(v).trim(), periodo, ref: `${letraDeColumna(c)}${r}` };
    }
  }
  return null;
}

export async function reconocer(libro, { periodo } = {}) {
  const hojas = hojasDelLibro(libro);
  if (!hojas.mayor && !hojas.menor && !hojas.suspendidas) {
    return {
      problema: problema(
        'plantilla',
        'Este Excel no es el reporte de Centro Quirúrgico',
        'El bot busca el libro del mes del área, con sus hojas CIRUGIA MAYOR, CIRUGIA MENOR, SUSPENDIDAS, RESUMEN y CUADRO DE INDICADORES.',
      ),
    };
  }
  const faltan = Object.entries(hojas).filter(([, h]) => !h).map(([clave]) => NOMBRE_HOJA[clave]);
  if (faltan.length) {
    return {
      problema: problema(
        'plantilla-danada',
        `Al Excel le ${faltan.length === 1 ? 'falta la hoja' : 'faltan las hojas'} ${faltan.map((h) => `«${h}»`).join(', ')}`,
        'El bot lee esas cinco hojas del libro del mes. Revise que el archivo sea el del área y que no se haya borrado o renombrado una hoja.',
      ),
    };
  }

  const mes = etiquetaPeriodo(periodo).toLowerCase();
  const titulo = tituloDelMes(await libro.cuadricula(hojas.suspendidas));
  if (titulo && titulo.periodo !== periodo) {
    const mismoMes = titulo.periodo.slice(5) === periodo.slice(5);
    return {
      problema: mismoMes
        ? problema(
            'hoja-de-otro-anio',
            `El Excel es de ${etiquetaPeriodo(titulo.periodo).toLowerCase()}`,
            `El título de SUSPENDIDAS (${titulo.ref}) dice «${titulo.texto}». Suba el libro de ${mes}.`,
          )
        : problema(
            'plantilla-periodo',
            `El Excel es el de ${etiquetaPeriodo(titulo.periodo).toLowerCase()}, no el de ${mes}`,
            `El título de SUSPENDIDAS (${titulo.ref}) dice «${titulo.texto}». Cada libro trae llena la columna de su mes: suba el libro de ${mes}.`,
          ),
    };
  }

  return { plantilla: { area: 'centro-quirurgico', periodo: periodo ?? null, version: VERSION, hojas } };
}

/* ------------------------------------------------------------- columnas */

/* La columna del mes en una hoja con cabecera «INDICADOR | ENE | FEB …». */
function columnaDelMes(cuadricula, periodo) {
  const buscado = MESES_CORTOS[Number(periodo.slice(5, 7)) - 1];
  for (let r = 1; r <= Math.min(15, cuadricula.ultimaFila); r += 1) {
    for (let c = 1; c <= cuadricula.ultimaColumna; c += 1) {
      if (normalizar(cuadricula.valor(r, c)) === buscado) return { fila: r, columna: c };
    }
  }
  return null;
}

/* Las dos columnas del mes en el RESUMEN: el nombre del mes encabeza la de
   la cirugía programada; la de emergencia es la siguiente. */
function columnasDelResumen(cuadricula, periodo) {
  const buscado = MESES_LARGOS[Number(periodo.slice(5, 7)) - 1];
  for (let r = 1; r <= Math.min(10, cuadricula.ultimaFila); r += 1) {
    for (let c = 1; c <= cuadricula.ultimaColumna; c += 1) {
      if (normalizar(cuadricula.valor(r, c)) === buscado) return { fila: r, programada: c, emergencia: c + 1 };
    }
  }
  return null;
}

/* La columna NÚMERO de SUSPENDIDAS. */
function columnaDeSuspendidas(cuadricula) {
  for (let r = 1; r <= Math.min(10, cuadricula.ultimaFila); r += 1) {
    for (let c = 1; c <= cuadricula.ultimaColumna; c += 1) {
      if (normalizar(cuadricula.valor(r, c)) === 'NUMERO') return { fila: r, columna: c };
    }
  }
  return null;
}

const redondearHoras = (v) => Math.round(v * 100) / 100;

/* Las horas de una celda: { numero } en horas, { vacio } o { ilegible }. Un
   número con formato de duración está en días; un texto «h:mm» o «h:mm:ss»
   son horas y minutos. */
export function horasDeCelda(valor, enDias) {
  if (typeof valor === 'number') return { numero: enDias ? valor * 24 : valor };
  const m = String(valor ?? '').trim().match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  if (m) return { numero: Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600 };
  return comoNumero(valor);
}

/* Un mapa rótulo → fila del catálogo, con sus alias. */
const mapaDe = (filas) => new Map(filas.flatMap((f) => [f.rotulo, ...f.alias].map((r) => [normalizar(r), f])));
const RESUMEN = mapaDe(CONCEPTOS_RESUMEN);
const INDICADORES = mapaDe(INSUMOS_INDICADORES);
const SUSPENDIDAS = mapaDe(CAUSAS);
const ESPECIALIDAD_DE = Object.fromEntries(
  ['mayor', 'menor'].map((cuadro) => [cuadro, new Map(ESPECIALIDADES.filter((e) => e.en.includes(cuadro)).flatMap((e) => e.rotulos.map((r) => [normalizar(r), e])))]),
);

/* «NO. HORAS…», «Nº HORAS…» y «N° HORAS…» son el mismo rótulo. */
const sinNumeral = (texto) => normalizar(texto).replace(/^N[O°º]\.?\s*/, 'NO. ');

const esMayusculas = (texto) => {
  const letras = String(texto ?? '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  return letras.length >= 4 && letras === letras.toUpperCase();
};

/* ------------------------------------------------------------- las cifras */

export async function leerCifras(libro, { periodo } = {}) {
  const hojas = hojasDelLibro(libro);
  const datos = { declarados: {}, ilegibles: {}, procedimientos: { mayor: {}, menor: {} } };
  const origen = {};
  const hallazgos = [];
  const ausentes = {};
  let leidas = 0;

  const celda = (cuadricula, r, c) => ({ hoja: cuadricula.hoja, fila: r, columna: letraDeColumna(c), ...(cuadricula.esFormula(r, c) ? { formula: true } : {}) });

  /* Una cifra de una fila del catálogo: número, null (vacía) o ilegible. */
  const anotar = (idCuadro, clave, cuadricula, r, c, { decimal = false } = {}) => {
    const enDias = decimal && cuadricula.esDuracion(r, c);
    const leido = decimal ? horasDeCelda(cuadricula.valor(r, c), enDias) : comoNumero(cuadricula.valor(r, c));
    const casilla = claveCasilla(idCuadro, clave);
    // `enDias`: la corrección vuelve a escribir la cifra en días, para que el Excel siga mostrando horas:minutos.
    origen[casilla] = { ...celda(cuadricula, r, c), ...(enDias ? { enDias: true } : {}) };
    const cuadro = (datos[idCuadro] ??= {});
    if (leido.ilegible != null) {
      cuadro[clave] = null;
      datos.ilegibles[casilla] = leido.ilegible;
      return;
    }
    cuadro[clave] = leido.numero == null ? null : decimal ? redondearHoras(leido.numero) : leido.numero;
    if (leido.numero != null) leidas += 1;
  };

  const noCatalogada = (idCuadro, cuadricula, r, c, rotulo) => {
    hallazgos.push({
      id: `fila-no-catalogada|${idCuadro}|${r}`,
      regla: 'fila-no-catalogada',
      formato: idCuadro,
      titulo: `La fila «${String(rotulo).trim()}» no es parte del reporte`,
      detalle: `Está en la fila ${r} de la hoja «${cuadricula.hoja}» y trae una cifra en la columna del mes (${letraDeColumna(c)}). Si es una fila nueva, hay que agregarla al reporte; si es un error de rótulo, corríjalo.`,
    });
  };

  const sinColumna = (cuadricula, buscado) => ({
    problema: problema(
      'plantilla-danada',
      `La hoja «${cuadricula.hoja}» no tiene la columna de ${etiquetaPeriodo(periodo).toLowerCase()}`,
      `El bot busca la cabecera «${buscado}». Revise que la hoja conserve la fila de los meses.`,
    ),
  });

  /* ------------------------------------------------------------- RESUMEN */
  {
    const cuadricula = await libro.cuadricula(hojas.resumen);
    const col = columnasDelResumen(cuadricula, periodo);
    if (!col) return sinColumna(cuadricula, MESES_LARGOS[Number(periodo.slice(5, 7)) - 1]);
    const vistos = new Set();
    for (let r = col.fila + 1; r <= cuadricula.ultimaFila; r += 1) {
      const rotulo = cuadricula.valor(r, 1);
      if (!normalizar(rotulo)) continue;
      const concepto = RESUMEN.get(normalizar(rotulo));
      if (concepto) {
        vistos.add(concepto.clave);
        for (const t of TIPOS) anotar('resumen', `${concepto.clave}.${t.clave}`, cuadricula, r, col[t.clave], { decimal: concepto.decimal });
      } else if (TIPOS.some((t) => comoNumero(cuadricula.valor(r, col[t.clave])).numero != null)) {
        noCatalogada('resumen', cuadricula, r, col.programada, rotulo);
      }
    }
    const faltan = CONCEPTOS_RESUMEN.filter((c) => !vistos.has(c.clave)).flatMap((c) => TIPOS.map((t) => `${c.clave}.${t.clave}`));
    if (faltan.length) ausentes.resumen = faltan;
  }

  /* ------------------------------------------------- CUADRO DE INDICADORES */
  {
    const cuadricula = await libro.cuadricula(hojas.indicadores);
    const col = columnaDelMes(cuadricula, periodo);
    if (!col) return sinColumna(cuadricula, MESES_CORTOS[Number(periodo.slice(5, 7)) - 1]);
    const vistos = new Set();
    // La tabla izquierda: rótulo en B. La derecha (Q en adelante) se calcula.
    for (let r = col.fila + 1; r <= cuadricula.ultimaFila; r += 1) {
      const rotulo = cuadricula.valor(r, 2);
      if (!normalizar(rotulo)) continue;
      const insumo = INDICADORES.get(sinNumeral(rotulo)) ?? INDICADORES.get(normalizar(rotulo));
      if (insumo) {
        vistos.add(insumo.clave);
        anotar('indicadores', insumo.clave, cuadricula, r, col.columna, { decimal: insumo.decimal });
      } else if (comoNumero(cuadricula.valor(r, col.columna)).numero != null) {
        noCatalogada('indicadores', cuadricula, r, col.columna, rotulo);
      }
    }
    const faltan = INSUMOS_INDICADORES.filter((f) => !vistos.has(f.clave)).map((f) => f.clave);
    if (faltan.length) ausentes.indicadores = faltan;
  }

  /* ---------------------------------------------------------- SUSPENDIDAS */
  {
    const cuadricula = await libro.cuadricula(hojas.suspendidas);
    const col = columnaDeSuspendidas(cuadricula);
    if (!col) return sinColumna(cuadricula, 'NÚMERO');
    const vistos = new Set();
    for (let r = col.fila + 1; r <= cuadricula.ultimaFila; r += 1) {
      // El rótulo de la causa está en B; algunas hojas lo corren a C.
      const rotulo = cuadricula.valor(r, 2) ?? cuadricula.valor(r, 3);
      const n = normalizar(rotulo);
      if (!n) continue;
      if (n === 'TOTAL') {
        const total = comoNumero(cuadricula.valor(r, col.columna)).numero;
        if (total != null) (datos.declarados.suspendidas ??= {})._total = total;
        origen['suspendidas|_total'] = celda(cuadricula, r, col.columna);
        origen['escrito|suspendidas|_total'] = origen['suspendidas|_total'];
        continue;
      }
      const causa = SUSPENDIDAS.get(n) ?? (n.startsWith('OTROS') ? SUSPENDIDAS.get('OTROS') : null);
      if (causa) {
        vistos.add(causa.clave);
        anotar('suspendidas', causa.clave, cuadricula, r, col.columna);
      } else if (comoNumero(cuadricula.valor(r, col.columna)).numero != null) {
        noCatalogada('suspendidas', cuadricula, r, col.columna, rotulo);
      }
    }
    const faltan = CAUSAS.filter((f) => !vistos.has(f.clave)).map((f) => f.clave);
    if (faltan.length) ausentes.suspendidas = faltan;
  }

  /* -------------------------------------------- CIRUGIA MAYOR y MENOR */
  for (const idCuadro of ['mayor', 'menor']) {
    const cuadricula = await libro.cuadricula(hojas[idCuadro]);
    const col = columnaDelMes(cuadricula, periodo);
    if (!col) return sinColumna(cuadricula, MESES_CORTOS[Number(periodo.slice(5, 7)) - 1]);
    const c = col.columna;
    const especialidades = ESPECIALIDAD_DE[idCuadro];
    const detalle = datos.procedimientos[idCuadro];
    const declarados = (datos.declarados[idCuadro] ??= {});
    let actual = null;

    for (let r = col.fila + 1; r <= cuadricula.ultimaFila; r += 1) {
      if (normalizar(cuadricula.valor(r, 1)).startsWith('SUB TOTAL')) {
        const total = comoNumero(cuadricula.valor(r, c)).numero;
        if (total != null) declarados._total = total;
        origen[`${idCuadro}|_total`] = celda(cuadricula, r, c);
        origen[`escrito|${idCuadro}|_total`] = origen[`${idCuadro}|_total`];
        break;
      }
      const rotulo = cuadricula.valor(r, 2);
      const n = normalizar(rotulo);
      if (!n) continue;

      const e = especialidades.get(n);
      if (e) {
        actual = e;
        detalle[e.clave] ??= [];
        const escrito = comoNumero(cuadricula.valor(r, c));
        if (escrito.numero != null) declarados[e.clave] = escrito.numero;
        origen[claveCasilla(idCuadro, e.clave)] = celda(cuadricula, r, c);
        // Las claves `escrito|…` nombran los totales escritos para la corrección guiada (correccion.js).
        origen[`escrito|${idCuadro}|${e.clave}`] = origen[claveCasilla(idCuadro, e.clave)];
        continue;
      }
      if (esMayusculas(rotulo) && cuadricula.esFormula(r, c)) {
        actual = null;
        hallazgos.push({
          id: `especialidad-no-catalogada|${idCuadro}|${r}`,
          regla: 'especialidad-no-catalogada',
          formato: idCuadro,
          titulo: `«${String(rotulo).trim()}» parece una especialidad que el reporte no conoce`,
          detalle: `Fila ${r} de la hoja «${cuadricula.hoja}»: su cifra del mes es una suma, como la de las especialidades. Sus procedimientos no se pueden asignar a ninguna. Si es una especialidad nueva, hay que agregarla al reporte; si es un procedimiento, escriba su cifra en vez de una fórmula.`,
        });
        continue;
      }

      const leido = comoNumero(cuadricula.valor(r, c));
      if (!actual) {
        if (leido.numero != null) noCatalogada(idCuadro, cuadricula, r, c, rotulo);
        continue;
      }
      const item = { rotulo: String(rotulo).trim().replace(/\s+/g, ' '), valor: leido.numero ?? 0, fila: r };
      origen[`${idCuadro}|${actual.clave}#${r}`] = celda(cuadricula, r, c);
      if (leido.ilegible != null) {
        item.valor = null;
        datos.ilegibles[`${idCuadro}|${actual.clave}#${r}`] = leido.ilegible;
      } else if (leido.numero != null) leidas += 1;
      detalle[actual.clave].push(item);
    }

    /* El total de cada especialidad: la suma de lo que el mes trae. */
    const cuadro = (datos[idCuadro] ??= {});
    for (const [clave, items] of Object.entries(detalle)) {
      const numeros = items.filter((i) => i.valor != null);
      cuadro[clave] = numeros.length ? numeros.reduce((a, i) => a + i.valor, 0) : items.length ? null : (declarados[clave] ?? null);
    }
    const faltan = ESPECIALIDADES.filter((e) => e.en.includes(idCuadro) && !(e.clave in detalle)).map((e) => e.clave);
    if (faltan.length) ausentes[idCuadro] = faltan;
  }

  if (Object.keys(ausentes).length) datos.ausentes = ausentes;

  hallazgos.push({
    id: 'hoja-leida',
    regla: 'hoja-leida',
    titulo: `Se leyó la columna de ${etiquetaPeriodo(periodo).toLowerCase()}`,
    detalle: `De las hojas ${Object.values(hojas).map((h) => `«${h.trim()}»`).join(', ')}. Las otras ${libro.hojas.length - 5} hojas del libro no se tocan: Top Ten, el consolidado por especialidad y los indicadores se calculan con lo leído.`,
  });
  if (!tituloDelMes(await libro.cuadricula(hojas.suspendidas))) {
    hallazgos.push({
      id: 'mes-no-escrito',
      regla: 'mes-no-escrito',
      nivel: 'aviso',
      titulo: 'El libro no dice de qué mes es',
      detalle: `El título de SUSPENDIDAS no nombra el mes. Se leyó la columna de ${etiquetaPeriodo(periodo).toLowerCase()}; confirme que el libro es el de ese mes y no uno posterior, que trae otras cifras para los meses ya cerrados.`,
    });
  }

  return { datos, origen, leidas, hallazgos, periodo };
}

/* La celda de una casilla, para mostrar de dónde salió. */
export function celdaDeOrigen(origen, idCuadro, clave) {
  const o = origen?.[claveCasilla(idCuadro, clave)];
  return o ? { hoja: o.hoja, ref: `${o.columna}${o.fila}` } : null;
}
