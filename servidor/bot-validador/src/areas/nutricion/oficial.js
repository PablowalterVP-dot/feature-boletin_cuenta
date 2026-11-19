/* Lector del Excel oficial de Nutrición y Dietética.

   El área llena cada mes el mismo libro de siempre: cuatro hojas visibles
   (COMENSALES EMERG, COMENSALES HOSP, PACIENTES EMERG, PACIENTES HOSP) y
   siete ocultas que quedaron de una plantilla de 2020 y nadie usa. Este
   lector no exige nombres definidos ni una hoja oculta: reconoce el libro por
   sus hojas, el mes por el título y cada fila por sus rótulos, porque eso es
   lo que se mantiene de un mes a otro. Lo que cambia, y por eso no se lee por
   posición, quedó documentado al revisar los nueve meses de 2026:

     - la columna TOTAL se mueve con los días del mes (AE, AG o AH);
     - la fila de los días es la 4 en comensales y la 3 en pacientes;
     - hay grupos que aparecen o desaparecen (Patrimonio en abril, Internos de
       Nutrición desde mayo) y rótulos mal escritos (definicion.CORRECCIONES);
     - en setiembre, la primera fila de pacientes de emergencia perdió sus
       rótulos: se lee por su lugar y se pide confirmarlo;
     - algunas filas no traen su fórmula de total.

   Devuelve lo mismo que el lector de la plantilla de antes ({ datos, origen,
   leidas }), más `hallazgos`: lo que el lector decidió por su cuenta y el
   área debe saber (una fila leída por su lugar, un rótulo corregido, una fila
   que no se reconoce). Las reglas (reglas.js) los convierten en errores,
   avisos o información.

   El origen guarda también la celda del TOTAL de cada fila
   (`escrito|fila|cuadro|grupo.comida`) y la del total del cuadro
   (`escrito|cuadro|cuadro`), y si son fórmula: la corrección guiada
   (correccion.js) las señala y reescribe su valor en el libro del área. */

import { FORMATOS, ROTULO_COMIDA, CORRECCIONES } from './definicion.js';
import { comoNumero, problema } from '../../plantillas.js';
import { diasDelMes, etiquetaPeriodo, periodoDeTexto } from '../../periodos.js';
import { letraDeColumna } from '../../xlsx.js';

export const VERSION_OFICIAL = 'NUT-2';

/* Mayúsculas, sin tildes y con un solo espacio: así se comparan rótulos
   («ASIST.  Y ADMINIST.» y «Asist. y Administ.» son el mismo). Los puntos se
   conservan: «INT ENF UNSM» e «INT. ENF UNSM» son bloques distintos. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const COMIDA_DE_ROTULO = new Map(Object.entries(ROTULO_COMIDA).flatMap(([comida, rotulos]) => rotulos.map((r) => [normalizar(r), comida])));

/* Grupos del cuadro por rótulo normalizado (rótulo y alias). */
function rotulosDe(f) {
  const mapa = new Map();
  for (const fila of f.filas) {
    for (const r of [fila.rotulo, ...fila.alias]) if (r) mapa.set(normalizar(r), fila.grupo);
  }
  return mapa;
}

const esNumero = (v) => typeof v === 'number';

/* La hoja de un cuadro, por nombre normalizado (las reales traen espacios de más). */
export function hojaDe(libro, f) {
  return libro.hojas.find((h) => normalizar(h) === normalizar(f.hojaOficial)) ?? null;
}

/* Fila de los días: la primera de las 8 de arriba con 1 en C y 2 en D. Los
   días van de la C a la columna anterior a «TOTAL»; si la fila no tiene ese
   rótulo, hasta donde los números siguen en orden. Un encabezado mal escrito
   entre medias (agosto de 2026: la celda del día 31 dice 178) no corta los
   días: se informa. */
function ubicarDias(c) {
  for (let r = 1; r <= Math.min(8, c.ultimaFila); r += 1) {
    if (c.valor(r, 3) === 1 && c.valor(r, 4) === 2) {
      let columnaTotal = null;
      for (let col = 5; col <= Math.min(c.ultimaColumna, 40); col += 1) {
        if (normalizar(c.valor(r, col)) === 'TOTAL') {
          columnaTotal = col;
          break;
        }
      }
      if (columnaTotal == null) {
        let n = 0;
        while (c.valor(r, 3 + n) === n + 1) n += 1;
        return { fila: r, dias: n, columnaTotal: 3 + n, encabezadosMal: [] };
      }
      const dias = columnaTotal - 3;
      const encabezadosMal = [];
      for (let d = 1; d <= dias; d += 1) {
        const v = c.valor(r, 2 + d);
        if (v !== d) encabezadosMal.push({ dia: d, valor: v, ref: `${letraDeColumna(2 + d)}${r}` });
      }
      return { fila: r, dias, columnaTotal, encabezadosMal };
    }
  }
  return null;
}

/* El periodo que nombra el título (filas 1 a 3, columna A). */
function periodoDelTitulo(c) {
  for (let r = 1; r <= 3; r += 1) {
    const p = periodoDeTexto(c.valor(r, 1));
    if (p) return p;
  }
  return null;
}

/* ------------------------------------------------------------- reconocer */

/* ¿Es el Excel de Nutrición y de este periodo? Lo decide antes de leer una
   sola cifra, como hacía la hoja oculta de la plantilla anterior. */
export async function reconocer(libro, { periodo }) {
  const faltan = FORMATOS.filter((f) => !hojaDe(libro, f));
  if (faltan.length === FORMATOS.length) {
    return {
      problema: problema(
        'plantilla',
        'Este Excel no es el reporte de Nutrición y Dietética',
        'El bot busca las cuatro hojas del reporte mensual: COMENSALES EMERG, COMENSALES HOSP, PACIENTES EMERG y PACIENTES HOSP. Suba el Excel del mes que llena el área.',
      ),
    };
  }
  if (faltan.length) {
    return {
      problema: problema(
        'plantilla-danada',
        `Falta ${faltan.length === 1 ? 'la hoja' : 'las hojas'} ${faltan.map((f) => `«${f.hojaOficial}»`).join(', ')}`,
        'El reporte mensual tiene cuatro hojas. Revise que no se haya borrado ni renombrado ninguna.',
      ),
    };
  }

  /* El mes: el del título, y si no lo dice, los días de la hoja. Un archivo
     de otro mes se rechaza para no cargar las cifras de un mes en otro. */
  const esperado = etiquetaPeriodo(periodo).toLowerCase();
  const vistos = new Set();
  for (const f of FORMATOS) {
    const c = await libro.cuadricula(hojaDe(libro, f));
    const delTitulo = periodoDelTitulo(c);
    if (delTitulo) vistos.add(delTitulo);
    const dias = ubicarDias(c);
    if (!dias) {
      return {
        problema: problema('plantilla-danada', `No se encontró la fila de los días en «${f.hojaOficial}»`, 'El bot busca, arriba de la hoja, una fila con los días 1, 2, 3… desde la columna C.'),
      };
    }
    if (dias.dias !== diasDelMes(periodo)) {
      return {
        problema: problema(
          'plantilla-periodo',
          `La hoja «${f.hojaOficial}» tiene ${dias.dias} días y ${esperado} tiene ${diasDelMes(periodo)}`,
          'Parece el Excel de otro mes. Suba el del mes que se está reportando.',
        ),
      };
    }
  }
  const otro = [...vistos].find((p) => p !== periodo);
  if (otro) {
    return {
      problema: problema(
        'plantilla-periodo',
        `El Excel es de ${etiquetaPeriodo(otro).toLowerCase()} y el reporte abierto es de ${esperado}`,
        `Suba el Excel de ${esperado}. Se rechaza para no cargar las cifras de un mes en otro.`,
      ),
    };
  }
  return { plantilla: { area: 'nutricion', periodo, version: VERSION_OFICIAL, mesEnTitulo: vistos.size > 0 } };
}

/* ------------------------------------------------------------------ leer */

/* Las filas de datos de una hoja, con sus rótulos tal como están. Un rótulo de
   grupo se arrastra hacia abajo (va en la primera fila del bloque, combinado).
   Las filas de título de sección («SERVICIO DE HOSPITALIZACIÓN») no tienen
   comida ni cifras: no son datos. Termina en la fila TOTAL. */
function filasDeLaHoja(c, ubicacion) {
  const filas = [];
  let grupo = null;
  let totalCuadro = null;
  for (let r = ubicacion.fila + 1; r <= c.ultimaFila; r += 1) {
    const a = normalizar(c.valor(r, 1));
    const b = normalizar(c.valor(r, 2));
    const valores = Array.from({ length: ubicacion.dias }, (_, d) => c.valor(r, 3 + d));
    const conDato = valores.some((v) => v != null && v !== '');
    if (a === 'TOTAL') {
      totalCuadro = { fila: r, valor: c.valor(r, ubicacion.columnaTotal) };
      break;
    }
    if (!b && !conDato) continue; // título de sección o fila vacía
    if (a) grupo = a;
    filas.push({ fila: r, grupo: a ? a : null, grupoArrastrado: grupo, comida: b || null, valores, total: c.valor(r, ubicacion.columnaTotal) });
  }
  return { filas, totalCuadro };
}

export async function leerCifras(libro, { periodo } = {}) {
  const datos = { declarados: {}, ilegibles: {}, ausentes: {} };
  const origen = {};
  const hallazgos = [];
  let leidas = 0;

  for (const f of FORMATOS) {
    const nombreHoja = hojaDe(libro, f);
    const c = await libro.cuadricula(nombreHoja);
    const ubicacion = ubicarDias(c);
    const { filas, totalCuadro } = filasDeLaHoja(c, ubicacion);
    const rotulos = rotulosDe(f);
    const grupos = [...new Set(f.filas.map((x) => x.grupo))];
    const presentes = new Set(filas.map((x) => x.grupoArrastrado).filter(Boolean));

    datos[f.id] = {};
    datos.declarados[f.id] = {};
    const celdaDeTotal = (r) => ({
      hoja: nombreHoja,
      fila: r,
      columna: letraDeColumna(ubicacion.columnaTotal),
      ...(c.esFormula(r, ubicacion.columnaTotal) ? { formula: true } : {}),
    });

    for (const e of ubicacion.encabezadosMal) {
      hallazgos.push({
        id: `rotulo-corregido|${f.id}|dia-${e.dia}`, regla: 'rotulo-corregido', formato: f.id,
        titulo: `El encabezado del día ${e.dia} dice «${e.valor ?? 'vacío'}»`,
        detalle: `Hoja «${f.hojaOficial}», celda ${e.ref}. Por su lugar es el día ${e.dia}, y así se leyó. Conviene corregir el encabezado en el Excel.`,
      });
    }

    /* De qué grupo es cada fila: su rótulo, una corrección conocida o, si es
       el único grupo del cuadro, ese (setiembre: pacientes de emergencia sin
       rótulo). */
    const grupoDe = (fila) => {
      const rotulo = fila.grupoArrastrado;
      if (rotulo && rotulos.has(rotulo)) return { grupo: rotulos.get(rotulo) };
      const correccion = CORRECCIONES.find((k) => k.formato === f.id && normalizar(k.rotulo) === rotulo && presentes.has(normalizar(k.siTambien)));
      if (correccion) return { grupo: correccion.grupo, correccion };
      if (!rotulo && grupos.length === 1) return { grupo: grupos[0], porLugar: true };
      return { grupo: null };
    };

    const vistas = new Map();
    const corregidos = new Map();
    const pendientesDeComida = [];

    for (const fila of filas) {
      const { grupo, correccion, porLugar } = grupoDe(fila);
      if (!grupo) {
        hallazgos.push({
          id: `fila-no-catalogada|${f.id}|${fila.fila}`, regla: 'fila-no-catalogada', formato: f.id,
          titulo: `«${fila.grupoArrastrado ?? 'sin rótulo'}${fila.comida ? ` · ${fila.comida}` : ''}» no es un grupo del reporte`,
          detalle: `Hoja «${f.hojaOficial}», fila ${fila.fila}. Sus raciones no se pueden cargar: escriba el rótulo como en la plantilla (${grupos.map((g) => f.filas.find((x) => x.grupo === g).rotulo).join(', ')}) o consulte a Estadística si es un grupo nuevo.`,
        });
        continue;
      }
      if (correccion) corregidos.set(fila.grupoArrastrado, correccion);
      const comida = fila.comida ? COMIDA_DE_ROTULO.get(fila.comida) : null;
      if (fila.comida && !comida) {
        hallazgos.push({
          id: `fila-no-catalogada|${f.id}|${fila.fila}`, regla: 'fila-no-catalogada', formato: f.id,
          titulo: `«${fila.comida}» no es una comida del reporte`,
          detalle: `Hoja «${f.hojaOficial}», fila ${fila.fila}. Las comidas son DESAYUNO, ALMUERZO y CENA (o COMIDA).`,
        });
        continue;
      }
      if (!comida) {
        pendientesDeComida.push({ fila, grupo, porLugar });
        continue;
      }
      registrar(fila, grupo, comida, { porLugar });
    }

    /* Una fila con cifras y sin comida se lee por su lugar: la comida del grupo
       que falta, en el orden de la plantilla. Se pide confirmarlo. */
    for (const { fila, grupo } of pendientesDeComida) {
      const delGrupo = f.filas.filter((x) => x.grupo === grupo);
      const libre = delGrupo.find((x) => !vistas.has(x.clave));
      if (!libre) {
        hallazgos.push({
          id: `fila-no-catalogada|${f.id}|${fila.fila}`, regla: 'fila-no-catalogada', formato: f.id,
          titulo: `Fila ${fila.fila} sin rótulo de comida`,
          detalle: `Hoja «${f.hojaOficial}». El grupo ya tiene todas sus comidas: no se sabe a cuál corresponde.`,
        });
        continue;
      }
      registrar(fila, grupo, libre.comida, { porLugar: true });
      hallazgos.push({
        id: `fila-sin-rotulo|${f.id}|${libre.clave}`, regla: 'fila-sin-rotulo', formato: f.id, fila: libre.clave,
        titulo: `La fila ${fila.fila} no tiene rótulo: se leyó como «${libre.grupoLabel} · ${libre.comidaLabel}»`,
        detalle: `Hoja «${f.hojaOficial}». Por su lugar en el cuadro es esa comida. Confírmelo, o escriba el rótulo en el Excel y súbalo otra vez.`,
      });
    }

    for (const [rotulo, k] of corregidos) {
      hallazgos.push({
        id: `rotulo-corregido|${f.id}|${k.grupo}`, regla: 'rotulo-corregido', formato: f.id,
        titulo: `«${rotulo}» se leyó como ${f.filas.find((x) => x.grupo === k.grupo).grupoLabel}`,
        detalle: k.motivo,
      });
    }

    /* Filas del catálogo que el Excel de este mes no trae: no aplican este mes. */
    const ausentes = f.filas.filter((x) => !vistas.has(x.clave)).map((x) => x.clave);
    if (ausentes.length) datos.ausentes[f.id] = ausentes;

    const total = comoNumero(totalCuadro?.valor);
    if (total.numero != null) datos.declarados[f.id]._total = total.numero;
    if (totalCuadro) origen[`escrito|cuadro|${f.id}`] = celdaDeTotal(totalCuadro.fila);

    function registrar(fila, grupo, comida, { porLugar }) {
      const clave = `${grupo}.${comida}`;
      const def = f.filas.find((x) => x.clave === clave);
      if (!def) {
        hallazgos.push({
          id: `fila-no-catalogada|${f.id}|${fila.fila}`, regla: 'fila-no-catalogada', formato: f.id,
          titulo: `${f.filas.find((x) => x.grupo === grupo).grupoLabel} no tiene ${comida}`,
          detalle: `Hoja «${f.hojaOficial}», fila ${fila.fila}. Según la plantilla, ese grupo no recibe esa comida.`,
        });
        return;
      }
      if (vistas.has(clave)) {
        hallazgos.push({
          id: `fila-repetida|${f.id}|${clave}`, regla: 'fila-no-catalogada', formato: f.id, fila: clave,
          titulo: `«${def.grupoLabel} · ${def.comidaLabel}» aparece dos veces`,
          detalle: `Hoja «${f.hojaOficial}», filas ${vistas.get(clave)} y ${fila.fila}. Se leyó la primera; borre o corrija la repetida.`,
        });
        return;
      }
      vistas.set(clave, fila.fila);
      origen[`${f.id}|${clave}`] = { hoja: nombreHoja, fila: fila.fila, columna: letraDeColumna(3), porLugar: Boolean(porLugar) };
      origen[`escrito|fila|${f.id}|${clave}`] = celdaDeTotal(fila.fila);
      datos[f.id][clave] = fila.valores.map((v, i) => {
        const r = comoNumero(v);
        if (r.ilegible != null) datos.ilegibles[`${f.id}|${clave}|${i + 1}`] = r.ilegible;
        if (r.numero != null) leidas += 1;
        return r.numero ?? null;
      });
      const declarado = comoNumero(fila.total);
      if (declarado.numero != null) datos.declarados[f.id][clave] = declarado.numero;
    }
  }

  if (!Object.keys(datos.ausentes).length) delete datos.ausentes;
  return { datos, origen, leidas, hallazgos, periodo };
}

/* La celda de un día, para mostrar de dónde salió. */
export function celdaDeOrigen(origen, idFormato, claveFila, dia) {
  const o = origen?.[`${idFormato}|${claveFila}`];
  if (!o) return null;
  const inicio = [...o.columna].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  return { hoja: o.hoja, ref: `${letraDeColumna(inicio + dia - 1)}${o.fila}` };
}

/* El rango de días de una hoja (para la plantilla y las pruebas). */
export const _interno = Object.freeze({ ubicarDias, filasDeLaHoja });
