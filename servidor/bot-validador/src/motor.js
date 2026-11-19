/* Motor del bot validador: de un archivo a un informe.

   Recorrido de un archivo (ver README.md, «Cómo lee un documento»):
     1. abrir      el .xlsx es un ZIP; se abre y se ubica su índice de hojas
     2. reconocer  el área reconoce su Excel (sus hojas y el mes del título) y
                   se compara con el reporte que se está llenando
     3. leer       el lector del área toma cada fila por sus rótulos
     4. validar    las reglas del área, más la comparación con el mes anterior

   Si un paso falla, el informe trae `bloqueo` y ninguna cifra: un archivo que
   no es de este reporte no se carga a medias.

   El motor no sabe de pantallas, de React ni del almacén del sistema. Lo usan
   el servidor HTTP (servidor.js) y, en el prototipo, el navegador. */

import { leerLibro } from './xlsx.js';
import { problema } from './plantillas.js';
import { areaDelBot } from './areas/index.js';
import { esPeriodo, etiquetaPeriodo } from './periodos.js';

/* 0.3.0 (07/11/2026): las horas de Centro Quirúrgico se leen en horas (antes, en días), Word 97-2003 (.doc) y
   los subtotales de Banco de Sangre. `recargar_horas_cqx` (API) rectifica lo leído con una versión anterior. */
export const BOT = Object.freeze({ nombre: 'Bot validador', version: '0.3.0' });

export const ETAPAS = Object.freeze([
  { id: 'abrir', texto: 'Abriendo el archivo' },
  { id: 'reconocer', texto: 'Reconociendo la plantilla' },
  { id: 'leer', texto: 'Leyendo las cifras' },
  { id: 'validar', texto: 'Aplicando las reglas' },
]);

/* Variación mensual de un cuadro a partir de la cual se pide explicación. */
export const VARIACION_MAXIMA = 0.2;

export const TAMANO_MAXIMO = 5 * 1024 * 1024;

async function huella(buffer) {
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function variaciones(area, datos, periodo, anterior) {
  if (!anterior?.datos) return [];
  /* Un área puede traer su propia comparación (Epidemiología: con diez casos
     al mes, un 20 % es ruido; lo que importa es un posible brote). */
  if (area.variacion) return area.variacion.evaluar(datos, periodo, anterior);
  return area.cuadros.flatMap((c) => {
    const actual = area.totalCuadro(datos, c.id, periodo);
    const previo = area.totalCuadro(anterior.datos, c.id, anterior.periodo);
    if (actual == null || !previo) return [];
    const cambio = (actual - previo) / previo;
    if (Math.abs(cambio) <= VARIACION_MAXIMA) return [];
    return [
      {
        id: `variacion|${c.id}`,
        regla: 'variacion',
        formato: c.id,
        // Las cifras, para que la corrección las compare a la vista.
        actual,
        previo,
        anterior: anterior.periodo,
        titulo: `${c.titulo}: ${cambio > 0 ? 'sube' : 'baja'} ${Math.round(Math.abs(cambio) * 100)} % frente a ${etiquetaPeriodo(anterior.periodo).toLowerCase()}`,
        detalle: `${actual.toLocaleString('es-PE')} ${c.unidad ?? area.unidad ?? 'casillas'} este mes y ${previo.toLocaleString('es-PE')} el anterior. Si hubo un motivo (menos camas, un brote, un servicio cerrado), anótelo.`,
      },
    ];
  });
}

/* Informe de unos datos ya leídos (de un archivo o de la hoja del sistema). */
export function informeDe({ area: clave, datos, periodo, anterior, fecha, extra = {} }) {
  const area = areaDelBot(clave);
  const v = area.validar(datos, periodo);
  /* `frenteAlAnterior`: las reglas de un área que necesitan el mes anterior,
     además de la variación (Farmacia: un cuadro copiado de ese mes). */
  const conAnterior = anterior?.datos && area.frenteAlAnterior ? area.frenteAlAnterior(datos, periodo, anterior) : [];
  const avisos = [...v.avisos, ...variaciones(area, datos, periodo, anterior), ...conAnterior];
  const estado = (id, nivel) => {
    const lista = nivel === 'error' ? v.errores : nivel === 'aviso' ? avisos : v.info;
    return lista.some((h) => (h.regla ?? h.id) === id) ? nivel : 'ok';
  };
  return {
    bot: BOT,
    fecha: fecha ?? new Date().toISOString().slice(0, 16),
    area: clave,
    periodo,
    ...extra,
    datos,
    errores: v.errores,
    avisos,
    info: v.info,
    reglas: [
      ...area.reglas.map((r) => ({ ...r, estado: estado(r.id, r.nivel) })),
      {
        id: 'variacion',
        nivel: 'aviso',
        texto: area.variacion?.texto ?? `Ningún cuadro varía más de ${VARIACION_MAXIMA * 100} % frente al mes anterior`,
        estado: anterior?.datos ? estado('variacion', 'aviso') : 'sin-evaluar',
      },
    ],
  };
}

function bloqueado(bloqueo, extra) {
  return { bot: BOT, ...extra, bloqueo };
}

/* Valida un archivo.
     buffer    el contenido del .xlsx (ArrayBuffer o Uint8Array)
     area      el área cuyo reporte se está llenando
     periodo   'AAAA-MM' del reporte abierto
     nombre    nombre del archivo, para el informe
     anterior  { periodo, datos } del último mes enviado, o null
     fecha     marca de tiempo del informe (el prototipo fija la suya)
     alAvanzar (idEtapa) => void | Promise, para mostrar el progreso: se
               espera, así quien llama puede pausar entre etapas */
export async function validarArchivo(buffer, { area: clave, periodo, nombre = 'archivo.xlsx', anterior = null, fecha, alAvanzar = () => {} } = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const archivo = { nombre, tamano: bytes.byteLength, huella: await huella(bytes) };
  const extra = { fecha: fecha ?? new Date().toISOString().slice(0, 16), archivo };

  /* El área decide cómo se abre su archivo: casi todas suben Excel; Farmacia,
     su informe en Word (areas/index.js). */
  const esperada = areaDelBot(clave);
  const tipo = esperada?.archivo ?? { tipo: 'Excel', extension: '.xlsx', pesoTipico: 'El Excel mensual de un área pesa menos de 100 kB.' };

  if (bytes.byteLength > TAMANO_MAXIMO) {
    return bloqueado(problema('tamano', 'El archivo pesa más de 5 MB', `${tipo.pesoTipico} Revise que sea el archivo correcto.`), extra);
  }

  await alAvanzar('abrir');
  let libro;
  try {
    libro = await (esperada?.abrir ?? leerLibro)(bytes);
  } catch {
    return bloqueado(
      tipo.tipo === 'Word'
        ? problema('archivo', 'El archivo no se pudo abrir como Word', 'Suba el Word del área (.docx o .doc). Un PDF o una foto no se pueden leer; si el Word tiene contraseña, quítesela y vuelva a subirlo.')
        : problema(
            'archivo',
            'El archivo no se pudo abrir como Excel',
            'Suba un archivo .xlsx. Si lo tiene en .xls (Excel antiguo) o en PDF, ábralo en Excel y guárdelo como «Libro de Excel (.xlsx)».',
          ),
      extra,
    );
  }

  await alAvanzar('reconocer');
  if (!esperada) {
    return bloqueado(problema('plantilla-area', 'El bot no sabe leer el reporte de esta área', `Área «${clave}».`), extra);
  }
  /* Cada área reconoce su propio archivo: Nutrición, por sus cuatro hojas y el
     mes del título (areas/nutricion/oficial.js); Farmacia, por sus cuadros y
     el asunto del informe (areas/farmacia/lector.js). Antes de leer una sola
     cifra: un archivo que no es de este reporte o de este mes no se carga a
     medias. */
  const reconocido = await esperada.reconocer(libro, { periodo });
  if (reconocido.problema) return bloqueado(reconocido.problema, extra);
  const plantilla = reconocido.plantilla;

  await alAvanzar('leer');
  const leido = await esperada.leerCifras(libro, { periodo });
  if (leido.problema) return bloqueado(leido.problema, { ...extra, plantilla });
  /* Lo que el lector decidió por su cuenta (una fila leída por su lugar, un
     rótulo corregido) viaja con los datos: así sigue ahí al revalidar. */
  if (leido.hallazgos?.length) leido.datos.lectura = leido.hallazgos;

  await alAvanzar('validar');
  return informeDe({
    area: clave,
    datos: leido.datos,
    periodo,
    anterior,
    fecha: extra.fecha,
    extra: { archivo, plantilla, origen: leido.origen, leidas: leido.leidas },
  });
}

/* De qué meses es un archivo, sin leer cifras: los meses de `anio`, hasta
   `hasta` ('AAAA-MM', incluido), que el área reconoce en él. Sirve para cargar
   meses pasados de una vez sin decir a cuál va cada archivo:
     · un libro anual (Laboratorio) da todos los meses que tienen su hoja;
     · un Excel mensual (Nutrición) da uno, por el mes de su título.
   Si el título no lo dice y los días cuadran con varios meses, el nombre del
   archivo («ENERO.xlsx») desempata; si tampoco, se dice en lugar de adivinar.

   Devuelve { meses, descartados, problema? }:
     meses        los periodos reconocidos, en orden
     descartados  [{ periodo, titulo }]: meses cuya hoja existe pero no sirve
                  (la de julio todavía con las cifras del año pasado)
     problema     el archivo no es de esta área, no se abre o no se sabe el mes */
const MESES_EN_NOMBRE = [['ENERO'], ['FEBRERO'], ['MARZO'], ['ABRIL'], ['MAYO'], ['JUNIO'], ['JULIO'], ['AGOSTO'], ['SETIEMBRE', 'SEPTIEMBRE'], ['OCTUBRE'], ['NOVIEMBRE'], ['DICIEMBRE']];
const DE_OTRO_MES = new Set(['plantilla-periodo', 'hoja-de-otro-anio']);

function mesDelNombre(nombre) {
  const limpio = String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const hallados = MESES_EN_NOMBRE.flatMap((nombres, i) => (nombres.some((n) => limpio.includes(n)) ? [i + 1] : []));
  return hallados.length === 1 ? hallados[0] : null;
}

export async function mesesDelArchivo(buffer, { area: clave, anio, hasta, nombre = '' } = {}) {
  const area = areaDelBot(clave);
  if (!area) return { meses: [], descartados: [], problema: problema('plantilla-area', 'El bot no sabe leer el reporte de esta área', `Área «${clave}».`) };
  /* Como al validar, el área decide cómo se abre su archivo: Farmacia y
     Nefrología suben un Word (22/10/2026: antes solo se abría Excel y esas
     dos áreas no podían cargar meses pasados de una vez). */
  let libro;
  try {
    libro = await (area.abrir ?? leerLibro)(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  } catch {
    return area.archivo?.tipo === 'Word'
      ? { meses: [], descartados: [], problema: problema('archivo', 'El archivo no se pudo abrir como Word', 'Suba el Word del área (.docx o .doc), sin contraseña.') }
      : { meses: [], descartados: [], problema: problema('archivo', 'El archivo no se pudo abrir como Excel', 'Guárdelo como «Libro de Excel (.xlsx)».') };
  }

  const meses = [];
  const descartados = [];
  for (let mes = 1; mes <= 12; mes += 1) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    if (hasta && periodo > hasta) break;
    const r = await area.reconocer(libro, { periodo });
    if (!r.problema) meses.push(periodo);
    else if (r.problema.id === 'hoja-de-otro-anio') descartados.push({ periodo, titulo: r.problema.titulo });
    else if (!DE_OTRO_MES.has(r.problema.id)) return { meses: [], descartados: [], problema: r.problema };
  }

  if (area.unMesPorArchivo && meses.length > 1) {
    const delNombre = mesDelNombre(nombre);
    const elegido = meses.find((p) => Number(p.slice(5, 7)) === delNombre);
    if (!elegido) {
      return {
        meses: [],
        descartados,
        problema: problema(
          'mes-ambiguo',
          'No se sabe de qué mes es este Excel',
          'Su título no dice el mes y sus días calzan con varios. Póngale al archivo el nombre del mes (por ejemplo «ENERO.xlsx») o súbalo desde el reporte de ese mes.',
        ),
      };
    }
    return { meses: [elegido], descartados };
  }
  return { meses, descartados };
}

/* Revalida datos tal como están en la hoja del sistema, tras corregir a mano. */
export function validarDatos(datos, { area, periodo, anterior = null, fecha } = {}) {
  return informeDe({ area, datos, periodo, anterior, fecha });
}

/* Genera la plantilla en blanco (o llena, para ejemplos) de un área y periodo. */
export function plantillaDe(clave, periodo, datos = null, opciones) {
  const area = areaDelBot(clave);
  if (!area?.crearPlantilla || !esPeriodo(periodo)) return null;
  return { nombre: area.nombreDeArchivo(periodo), bytes: area.crearPlantilla(periodo, datos, opciones) };
}

/* Firma de unos datos: dice si un informe sigue describiendo la hoja o si
   alguien la cambió después de validar. */
export function firmaDe(clave, datos) {
  const area = areaDelBot(clave);
  const util = area.cuadros.map((c) => JSON.stringify(datos?.[c.id] ?? {})).join('|') + JSON.stringify(datos?.ilegibles ?? {});
  let h = 2166136261;
  for (let i = 0; i < util.length; i += 1) h = Math.imul(h ^ util.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

/* El consolidado anual de un área (el «TOTAL» de Nutrición), con los totales
   de los meses enviados: { nombre, bytes, consolidado }. null si el área no
   lleva consolidado. meses: [{ periodo, totales: { f1, f2, … } }]. */
export function consolidadoAnual(clave, anio, meses, opciones) {
  const c = areaDelBot(clave)?.consolidado;
  if (!c) return null;
  return { nombre: c.nombre(anio), bytes: c.crear(anio, meses, opciones), consolidado: c.de(anio, meses) };
}
