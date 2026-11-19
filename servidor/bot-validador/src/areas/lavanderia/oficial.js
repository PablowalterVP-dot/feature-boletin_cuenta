/* Lector del Excel oficial de Lavandería.

   El área llena cada mes el mismo libro de siempre («INFORME DE LAVANDERIA -
   PARA ESTADISTICA {MES} {AÑO}.xlsx»), con cuatro hojas de datos. A
   diferencia de Nutrición, el libro no les pone nombre («Hoja1».."Hoja4»,
   y julio y agosto traen de más una «Hoja6» completamente vacía, sobrante de
   alguna plantilla): el bot no busca una hoja por su nombre, la reconoce por
   su contenido (`clasificar`). Lo que se mantuvo igual en los tres meses
   revisados (mayo, julio y agosto de 2026) y lo que cambió, celda por celda:

     - el orden de las hojas varía (julio y agosto intercalan la «Hoja6»
       vacía entre la primera y la segunda hoja con datos);
     - la fila de los días (f1) está en la 13, no en la 4 como en Nutrición,
       y la de las letras de la semana, decorativa, en la 12 (empieza en el
       día de la semana que caiga el 1, y por eso las letras cambian de mes
       a mes: no son una comida fija, hay que calcularlas);
     - el rótulo del servicio va en la columna B (en Nutrición, A y B juntas:
       grupo y comida); aquí no hay comida, un servicio es una sola fila;
     - una fila de servicio solo aparece algunos meses (`UCI-CIRUGIA», ver
       definicion.js): no está en julio ni en agosto, y en mayo está en cero;
     - la fila TOTAL de f1 cambia de lugar según si esa fila ocasional está
       o no (34 sin ella, 35 con ella): se busca por su rótulo, no por su
       número;
     - la columna KILOGRAMOS del consolidado (f4) es texto, no número, y en
       agosto trae coma de millar («1,416»): no se lee, es la misma cifra que
       f1 agrupada (ver el comentario de definicion.js). La columna PIEZAS sí
       es numérica, salvo en mayo, donde varias filas se tecleron con un
       punto que las dejó mil veces más chicas («2.16» en vez de 2160,
       «6.468» en vez de 6468): no se corrige a adivinar, se lee tal cual y
       la regla `entero` la rechaza, como rechaza cualquier cifra no entera.

   Devuelve lo mismo que oficial.js de Nutrición: `{ datos, origen, leidas,
   hallazgos, periodo }`. */

import { SERVICIOS, GRUPOS, INSUMOS, TARIFAS } from './definicion.js';
import { comoNumero, problema } from '../../plantillas.js';
import { diasDelMes, etiquetaPeriodo, mesOficial } from '../../periodos.js';
import { letraDeColumna } from '../../xlsx.js';

export const VERSION_OFICIAL = 'LAV-1';

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* La parte numérica al principio de un texto («26.633 PIEZAS», «48 PARES DE
   GUANTES X MES»): para los totales declarados que el Excel escribe con su
   unidad pegada, y para leer la cantidad de un insumo sin descartar su
   descripción (que queda igual, para mostrarla). */
function numeroConSufijo(valor) {
  const m = String(valor ?? '').trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { numero: null, resto: String(valor ?? '').trim() };
  const r = comoNumero(m[1]);
  return { numero: r.numero ?? null, resto: m[2].trim() };
}

const esNumero = (v) => typeof v === 'number';

/* --------------------------------------------------------- clasificar hojas */

/* Las cuatro hojas de datos, por lo que tienen adentro, no por su nombre: el
   libro trae «Hoja1».."Hoja4" y a veces una hoja vacía de más (julio y agosto
   traen una «Hoja6» de 0×0, sobrante de alguna plantilla anterior). */
async function clasificar(libro) {
  const resultado = { f1: null, f3: null, f2: null, f4: null };
  for (const hoja of libro.hojas) {
    const c = await libro.cuadricula(hoja);
    if (c.ultimaFila < 1 || c.ultimaColumna < 1) continue; // la hoja vacía de sobra

    const esquina = [];
    for (let f = 1; f <= Math.min(c.ultimaFila, 15); f += 1) {
      for (let col = 1; col <= Math.min(c.ultimaColumna, 10); col += 1) {
        const v = normalizar(c.valor(f, col));
        if (v) esquina.push(v);
      }
    }
    const tiene = (texto) => esquina.some((v) => v.includes(texto));

    if (tiene('SERVICIO') && tiene('PIEZAS') && tiene('KILOGRAMOS')) resultado.f4 = hoja;
    else if (tiene('ITEN') && tiene('DESCRIPCION') && tiene('CONFECCION')) resultado.f2 = hoja;
    else if (tiene('ITEN') && tiene('ROPA SUCIA')) resultado.f3 = hoja;
    else if (ubicarDias(c)) resultado.f1 = hoja;
  }
  return resultado;
}

/* Las dos filas de encabezado de f1 («DIAS» y «PROCEDIMIENTO», columna B) y
   dónde empiezan los datos. En julio y agosto, «DIAS» trae las letras de la
   semana y «PROCEDIMIENTO» los números (1, 2, 3…) con la columna TOTAL; en
   mayo de 2026 está al revés: «DIAS» trae los números y «PROCEDIMIENTO» las
   letras. Se ubica cada fila por su rótulo, no por cuál de las dos trae qué,
   y los datos empiezan después de la que esté más abajo. */
function ubicarDias(c) {
  let filaDias = null;
  let filaProcedimiento = null;
  let filaNumeros = null;
  for (let r = 1; r <= Math.min(20, c.ultimaFila); r += 1) {
    const b = normalizar(c.valor(r, 2));
    if (b === 'DIAS') filaDias = r;
    if (b === 'PROCEDIMIENTO') filaProcedimiento = r;
    if (filaNumeros == null && c.valor(r, 3) === 1 && c.valor(r, 4) === 2) filaNumeros = r;
  }
  if (filaNumeros == null) return null;
  let n = 2;
  while (c.valor(filaNumeros, 3 + n) === n + 1) n += 1;
  const inicioDatos = Math.max(filaDias ?? 0, filaProcedimiento ?? 0, filaNumeros) + 1;
  return { fila: filaNumeros, dias: n, columnaTotal: 3 + n, inicioDatos };
}

/* «MES: MAYO» (B) y «AÑO: 2026» (en f1 y f3, columna AA; en f4, C): dos
   celdas sueltas, no un solo título como en Nutrición. */
function periodoDelEncabezado(c, { filas = 10, colAnio } = {}) {
  let mes = null;
  let anio = null;
  for (let f = 1; f <= Math.min(filas, c.ultimaFila); f += 1) {
    for (let col = 1; col <= Math.min(c.ultimaColumna, 30); col += 1) {
      const t = normalizar(c.valor(f, col));
      if (!t) continue;
      const m = t.match(/^MES\s*:?\s*([A-ZÑ]+)/);
      if (m) mes = m[1];
      const a = t.match(/^A[ÑN]O\s*:?\s*(20\d{2})/);
      if (a) anio = a[1];
    }
  }
  if (!mes || !anio) return null;
  const MESES_OFICIALES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const mesTexto = mes === 'SEPTIEMBRE' ? 'SETIEMBRE' : mes;
  const i = MESES_OFICIALES.indexOf(mesTexto);
  if (i < 0) return null;
  return `${anio}-${String(i + 1).padStart(2, '0')}`;
}

/* ------------------------------------------------------------- reconocer */

export async function reconocer(libro, { periodo }) {
  const hojas = await clasificar(libro);
  const faltan = Object.entries(hojas).filter(([, h]) => !h).map(([id]) => id);
  if (faltan.length === 4) {
    return {
      problema: problema(
        'plantilla',
        'Este Excel no es el reporte de Lavandería',
        'El bot busca cuatro hojas: kilos por servicio, trabajos de confección, ropa sucia y el consolidado con piezas e insumos. Suba el Excel del mes que llena el área.',
      ),
    };
  }
  if (faltan.length) {
    const NOMBRE = { f1: 'kilos por servicio', f2: 'trabajos de confección', f3: 'ropa sucia', f4: 'consolidado de piezas e insumos' };
    return {
      problema: problema('plantilla-danada', `No se encontró la hoja de ${faltan.map((f) => NOMBRE[f]).join(', ')}`, 'El reporte mensual tiene cuatro hojas de datos. Revise que no se haya borrado ninguna.'),
    };
  }

  const c1 = await libro.cuadricula(hojas.f1);
  const ubicacion = ubicarDias(c1);
  if (ubicacion.dias !== diasDelMes(periodo)) {
    const esperado = etiquetaPeriodo(periodo).toLowerCase();
    return {
      problema: problema(
        'plantilla-periodo',
        `La hoja de kilos por servicio tiene ${ubicacion.dias} días y ${esperado} tiene ${diasDelMes(periodo)}`,
        'Parece el Excel de otro mes. Suba el del mes que se está reportando.',
      ),
    };
  }
  const delTitulo = periodoDelEncabezado(c1);
  if (delTitulo && delTitulo !== periodo) {
    return {
      problema: problema(
        'plantilla-periodo',
        `El Excel es de ${etiquetaPeriodo(delTitulo).toLowerCase()} y el reporte abierto es de ${etiquetaPeriodo(periodo).toLowerCase()}`,
        `Suba el Excel de ${etiquetaPeriodo(periodo).toLowerCase()}. Se rechaza para no cargar las cifras de un mes en otro.`,
      ),
    };
  }
  return { plantilla: { area: 'lavanderia', periodo, version: VERSION_OFICIAL, hojas, mesEnTitulo: Boolean(delTitulo) } };
}

/* ------------------------------------------------------------------ f1 */

/* La celda de una casilla, para el origen: la corrección guiada la muestra y
   la corrige en el libro, y necesita saber si es una fórmula. */
const celdaDe = (c, fila, columna) => ({ hoja: c.hoja, fila, columna: letraDeColumna(columna), ...(c.esFormula(fila, columna) ? { formula: true } : {}) });

function leerF1(c, ubicacion, hallazgos) {
  const datos = {};
  const declarados = {};
  const ilegibles = {};
  const origen = {};
  let leidas = 0;
  const vistas = new Map();
  const porRotulo = new Map(SERVICIOS.map((s) => [normalizar(s.rotulo), s]));

  for (let r = ubicacion.inicioDatos; r <= c.ultimaFila; r += 1) {
    const rotulo = normalizar(c.valor(r, 2));
    const valores = Array.from({ length: ubicacion.dias }, (_, d) => c.valor(r, 3 + d));
    const total = c.valor(r, ubicacion.columnaTotal);
    const limpio = (v) => v != null && String(v).trim() !== '';
    const conDato = valores.some(limpio) || limpio(total);
    if (!rotulo && !conDato) continue; // fila en blanco

    if (rotulo === 'TOTAL') {
      const t = comoNumero(total);
      if (t.numero != null) declarados._total = t.numero;
      origen['escrito|f1|_total'] = celdaDe(c, r, ubicacion.columnaTotal);
      break;
    }

    const servicio = porRotulo.get(rotulo);
    if (!servicio) {
      /* Sin datos y sin ser un servicio conocido: un título de bloque
         («2 DO PISO», «3ER PISO», «4TO PISO»), no una fila que reportar. Con
         datos, sí es un hallazgo: es una fila que la plantilla no reconoce. */
      if (!conDato) continue;
      hallazgos.push({
        id: `fila-no-catalogada|f1|${r}`, regla: 'fila-no-catalogada', formato: 'f1',
        titulo: `«${c.valor(r, 2)}» no es un servicio del reporte`,
        detalle: `Fila ${r}. Escriba el rótulo como en la plantilla o consulte a Estadística si es un servicio nuevo.`,
      });
      continue;
    }
    if (vistas.has(servicio.clave)) {
      hallazgos.push({
        id: `fila-repetida|f1|${servicio.clave}`, regla: 'fila-no-catalogada', formato: 'f1', fila: servicio.clave,
        titulo: `«${servicio.rotulo}» aparece dos veces`,
        detalle: `Filas ${vistas.get(servicio.clave)} y ${r}. Se leyó la primera; borre o corrija la repetida.`,
      });
      continue;
    }
    vistas.set(servicio.clave, r);
    origen[`f1|${servicio.clave}`] = { hoja: c.hoja, fila: r, columna: letraDeColumna(3) };
    datos[servicio.clave] = valores.map((v, i) => {
      const n = comoNumero(v);
      if (n.ilegible != null) ilegibles[`f1|${servicio.clave}|${i + 1}`] = n.ilegible;
      if (n.numero != null) leidas += 1;
      return n.numero ?? null;
    });
    const t = comoNumero(total);
    if (t.numero != null) declarados[servicio.clave] = t.numero;
    origen[`escrito|f1|${servicio.clave}`] = celdaDe(c, r, ubicacion.columnaTotal);
  }

  const ausentes = SERVICIOS.filter((s) => !vistas.has(s.clave)).map((s) => s.clave);
  return { datos, declarados, ilegibles, origen, leidas, ausentes };
}

/* ------------------------------------------------------------------ f3 */

/* Ropa sucia: una fila por día (columna A, 1 a N), con sus dos categorías y
   los totales de kilos y precio que el Excel ya trae calculados. */
function leerF3(c, periodo, hallazgos) {
  let filaEncabezado = null;
  for (let r = 1; r <= Math.min(10, c.ultimaFila); r += 1) {
    if (normalizar(c.valor(r, 1)) === 'ITEN') {
      filaEncabezado = r;
      break;
    }
  }
  if (filaEncabezado == null) return null;

  const n = diasDelMes(periodo);
  const comun = Array.from({ length: n }, () => null);
  const sucia = Array.from({ length: n }, () => null);
  const ilegibles = {};
  const vistos = new Set();
  const declarados = {};
  const origen = {};
  let leidas = 0;

  for (let r = filaEncabezado + 1; r <= c.ultimaFila; r += 1) {
    const a = c.valor(r, 1);
    if (normalizar(a) === 'TOTAL') {
      const tc = comoNumero(c.valor(r, 3));
      const ts = comoNumero(c.valor(r, 5));
      if (tc.numero != null) declarados.comun = tc.numero;
      if (ts.numero != null) declarados.sucia = ts.numero;
      origen['escrito|f3|comun'] = celdaDe(c, r, 3);
      origen['escrito|f3|sucia'] = celdaDe(c, r, 5);
      break;
    }
    if (!esNumero(a) || a < 1 || a > n) {
      if (a != null && a !== '') {
        hallazgos.push({ id: `fila-no-catalogada|f3|${r}`, regla: 'fila-no-catalogada', formato: 'f3', titulo: `La fila ${r} de ropa sucia no es un día del mes`, detalle: `Columna A dice «${a}»: se esperaba un número de día entre 1 y ${n}.` });
      }
      continue;
    }
    if (vistos.has(a)) {
      hallazgos.push({ id: `fila-repetida|f3|dia-${a}`, regla: 'fila-no-catalogada', formato: 'f3', titulo: `El día ${a} de ropa sucia aparece dos veces`, detalle: `Fila ${r}. Se leyó la primera; borre o corrija la repetida.` });
      continue;
    }
    vistos.add(a);
    const rc = comoNumero(c.valor(r, 3));
    const rs = comoNumero(c.valor(r, 5));
    if (rc.ilegible != null) ilegibles[`f3|comun|${a}`] = rc.ilegible;
    if (rs.ilegible != null) ilegibles[`f3|sucia|${a}`] = rs.ilegible;
    comun[a - 1] = rc.numero ?? null;
    sucia[a - 1] = rs.numero ?? null;
    origen[`f3|comun|${a}`] = celdaDe(c, r, 3);
    origen[`f3|sucia|${a}`] = celdaDe(c, r, 5);
    if (rc.numero != null) leidas += 1;
    if (rs.numero != null) leidas += 1;
  }

  const ausentes = [];
  for (let d = 1; d <= n; d += 1) if (!vistos.has(d)) ausentes.push(String(d));
  return { datos: { comun, sucia }, declarados, ilegibles, origen, leidas, ausentes };
}

/* ------------------------------------------------------------------ f2 */

/* Confección: una lista libre de trabajos, no una cuadrícula. Una fila con
   ITEN pero sin ningún otro dato es un número que el área dejó sin usar, no
   un trabajo vacío que haya que llenar. */
function leerF2(c) {
  let filaEncabezado = null;
  for (let r = 1; r <= Math.min(10, c.ultimaFila); r += 1) {
    if (normalizar(c.valor(r, 1)) === 'ITEN') {
      filaEncabezado = r;
      break;
    }
  }
  if (filaEncabezado == null) return { trabajos: [] };

  const trabajos = [];
  let ultimoServicio = null;
  let ultimaTela = null;
  for (let r = filaEncabezado + 1; r <= c.ultimaFila; r += 1) {
    const descripcion = c.valor(r, 2);
    const confeccion = c.valor(r, 3);
    const servicio = c.valor(r, 4);
    const tela = c.valor(r, 5);
    if (!descripcion && !confeccion && !servicio && !tela) continue; // ITEN sin trabajo, o fila en blanco
    /* El servicio y la tela se escriben una vez por grupo de trabajos y se
       dejan en blanco en las filas siguientes del mismo grupo (mayo de 2026,
       filas 10-13: cuatro prendas de «VESTIDOS PARA DAMA» sin repetir a
       quién van ni de qué tela). Se arrastran hacia abajo, como el rótulo de
       grupo en Nutrición. */
    if (servicio != null) ultimoServicio = String(servicio).trim();
    if (tela != null) ultimaTela = String(tela).trim();
    trabajos.push({
      fila: r,
      iten: esNumero(c.valor(r, 1)) ? c.valor(r, 1) : null,
      descripcion: descripcion != null ? String(descripcion).trim() : null,
      confeccion: confeccion != null ? String(confeccion).trim() : null,
      servicio: servicio != null ? String(servicio).trim() : ultimoServicio,
      tela: tela != null ? String(tela).trim() : ultimaTela,
    });
  }
  return { trabajos };
}

/* ------------------------------------------------------------------ f4 */

/* Piezas por grupo (la cifra real; los kilos de esta hoja son texto y
   duplican f1, así que no se leen: ver el comentario de definicion.js) e
   insumos de limpieza (cantidad y descripción, en un solo texto libre). */
function leerF4(c, hallazgos) {
  let filaEncabezado = null;
  for (let r = 1; r <= Math.min(10, c.ultimaFila); r += 1) {
    if (normalizar(c.valor(r, 1)) === 'SERVICIO') {
      filaEncabezado = r;
      break;
    }
  }
  const piezas = {};
  const declarados = {};
  const ilegibles = {};
  const origen = {};
  const vistos = new Set();
  let leidas = 0;

  if (filaEncabezado != null) {
    const porRotulo = new Map(GRUPOS.map((g) => [normalizar(g.rotulo), g]));
    let filaTotal = null;
    for (let r = filaEncabezado + 1; r <= c.ultimaFila; r += 1) {
      const a = normalizar(c.valor(r, 1));
      if (!a) continue;
      if (a.startsWith('TOTAL')) {
        filaTotal = r;
        break;
      }
      const grupo = porRotulo.get(a);
      if (!grupo) {
        hallazgos.push({ id: `fila-no-catalogada|f4|${r}`, regla: 'fila-no-catalogada', formato: 'f4', titulo: `«${c.valor(r, 1)}» no es un grupo del consolidado`, detalle: `Fila ${r}. Escriba el rótulo como en la plantilla o consulte a Estadística si es un grupo nuevo.` });
        continue;
      }
      if (vistos.has(grupo.clave)) continue;
      vistos.add(grupo.clave);
      const p = comoNumero(c.valor(r, 2));
      if (p.ilegible != null) ilegibles[`f4|${grupo.clave}`] = p.ilegible;
      if (p.numero != null) leidas += 1;
      piezas[grupo.clave] = p.numero ?? null;
      origen[`f4|${grupo.clave}`] = celdaDe(c, r, 2);
    }
    if (filaTotal != null) {
      /* «26.633 PIEZAS» (mayo de 2026): las piezas se cuentan enteras y en el
         Perú el punto separa los miles, así que un punto seguido de tres
         cifras es de miles, no decimal. Antes se leía 26,633 y el total
         «no cuadraba» con los 26 633 de los grupos. */
      const texto = String(c.valor(filaTotal, 2) ?? '').trim();
      const miles = texto.match(/^(\d{1,3}(?:[.,]\d{3})+)(?![\d.,])/);
      const numero = miles ? Number(miles[1].replace(/[.,]/g, '')) : numeroConSufijo(texto).numero;
      if (numero != null) declarados._total = numero;
      origen['escrito|f4|_total'] = celdaDe(c, filaTotal, 2);
    }
  }

  const ausentes = GRUPOS.filter((g) => !vistos.has(g.clave)).map((g) => g.clave);

  // Insumos: debajo del consolidado, bajo la etiqueta «INSUMOS UTILIZADOS».
  const insumos = {};
  let filaInsumos = null;
  for (let r = 1; r <= c.ultimaFila; r += 1) {
    if (normalizar(c.valor(r, 1)).startsWith('INSUMOS')) {
      filaInsumos = r;
      break;
    }
  }
  const ausentesInsumos = [];
  if (filaInsumos != null) {
    const porRotulo = new Map(INSUMOS.map((i) => [normalizar(i.rotulo), i]));
    const vistosInsumos = new Set();
    for (let r = filaInsumos + 1; r <= c.ultimaFila; r += 1) {
      const a = normalizar(c.valor(r, 1));
      if (!a) continue;
      const insumo = porRotulo.get(a);
      if (!insumo) {
        hallazgos.push({ id: `fila-no-catalogada|f4|insumo-${r}`, regla: 'fila-no-catalogada', formato: 'f4', titulo: `«${c.valor(r, 1)}» no es un insumo del reporte`, detalle: `Fila ${r}. Escriba el rótulo como en la plantilla o consulte a Estadística si es un insumo nuevo.` });
        continue;
      }
      vistosInsumos.add(insumo.clave);
      const texto = c.valor(r, 2);
      insumos[insumo.clave] = texto != null ? String(texto).trim() : null;
    }
    for (const i of INSUMOS) if (!vistosInsumos.has(i.clave)) ausentesInsumos.push(i.clave);
  }

  return { piezas, insumos, declarados, ilegibles, origen, leidas, ausentes, ausentesInsumos };
}

/* ------------------------------------------------------------------ leer */

export async function leerCifras(libro, { periodo } = {}) {
  const hallazgos = [];
  const hojas = await clasificar(libro);

  const c1 = await libro.cuadricula(hojas.f1);
  const ubicacion = ubicarDias(c1);
  const r1 = leerF1(c1, ubicacion, hallazgos);

  const c2 = await libro.cuadricula(hojas.f3);
  const r3 = leerF3(c2, periodo, hallazgos);

  const c3 = await libro.cuadricula(hojas.f2);
  const r2 = leerF2(c3);

  const c4 = await libro.cuadricula(hojas.f4);
  const r4 = leerF4(c4, hallazgos);

  if (r3 == null) {
    hallazgos.push({ id: 'plantilla-danada|f3', regla: 'fila-no-catalogada', formato: 'f3', titulo: 'No se encontró la fila «ITEN» de ropa sucia', detalle: 'El bot busca, arriba de la hoja, la columna que numera los días del 1 en adelante.' });
  }

  const datos = {
    f1: r1.datos,
    f2: r2.trabajos,
    f3: r3?.datos ?? { comun: [], sucia: [] },
    f4: { piezas: r4.piezas, insumos: r4.insumos },
    declarados: { f1: r1.declarados, f3: r3?.declarados ?? {}, f4: r4.declarados },
    ilegibles: { ...r1.ilegibles, ...(r3?.ilegibles ?? {}), ...r4.ilegibles },
    ausentes: {},
  };
  if (r1.ausentes.length) datos.ausentes.f1 = r1.ausentes;
  if (r3?.ausentes?.length) datos.ausentes.f3 = r3.ausentes;
  if (r4.ausentes.length) datos.ausentes.f4 = r4.ausentes;
  if (r4.ausentesInsumos.length) datos.ausentes.f4Insumos = r4.ausentesInsumos;
  if (!Object.keys(datos.ausentes).length) delete datos.ausentes;

  const origen = { ...r1.origen, ...(r3?.origen ?? {}), ...(r4?.origen ?? {}) };
  const leidas = r1.leidas + (r3?.leidas ?? 0) + r4.leidas;

  return { datos, origen, leidas, hallazgos, periodo };
}

export function celdaDeOrigen(origen, idFormato, claveFila, dia) {
  const o = origen?.[`${idFormato}|${claveFila}`];
  if (!o) return null;
  const inicio = [...o.columna].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  return { hoja: o.hoja, ref: `${letraDeColumna(inicio + dia - 1)}${o.fila}` };
}

export const _interno = Object.freeze({ clasificar, ubicarDias, periodoDelEncabezado, numeroConSufijo });
