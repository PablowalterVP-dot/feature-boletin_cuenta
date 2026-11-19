/* Lector del oficio de Diagnóstico por Imágenes, en Word.

   El oficio trae las cuatro hojas una tras otra, como tablas pequeñas, en el
   mismo orden los nueve meses de 2026 (cotejados):

     Rayos X      detalle (atendidos, pacientes, placas, por servicio) ·
                  exámenes por tecnólogo, particulares y monto · lectura e informe
     Tomografía   totales · SIS · convenios · pagados · monto · informadas
                  (y, en un párrafo, «NOTA : TOMOGRAFO INOPERATIVO»)
     Mamografía   totales · matriz SIS / convenio / pagado · campaña · monto ·
                  lectura e informe
     Ecografía    una tabla por médico, con biopsias y procedimientos oncológicos

   Las tablas se reconocen por su contenido y en ese orden (las de tomografía
   y mamografía se parecen: lo que las separa es dónde están), y cada cifra se
   lee por el rótulo de su fila, no por su posición.

   Las cifras que el Word escribe y el sistema calcula (los exámenes atendidos
   de Rayos X, el TOTAL EXAMENES de tomografía y mamografía, la columna EXAM y
   la fila T O T A L de ecografía, los totales en soles) van a `datos.escritos`:
   reglas.js las compara con lo calculado. */

import { problema } from '../../plantillas.js';
import { cifraDeCelda } from '../../docx.js';
import { letraDeColumna } from '../../xlsx.js';
import { etiquetaPeriodo, periodoDeTexto } from '../../periodos.js';
import { VERSION, matrizVacia, SERVICIOS, FINANCIADORES } from './definicion.js';
import { plano } from './calculos.js';

export { VERSION };

const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9/.]+/g, ' ')
    .trim();
const compacto = (t) => normalizar(t).replace(/[^A-Z0-9]/g, '');

/* «S/. 2,554.00», «S/. 4 ,549.50», «S/. 3 800.50», «S/.0000», «S/. .00»,
   «00000»: el monto en soles, como lo escribe el área. Sin cifras más que
   ceros es 0. Lo que no se deja leer como un importe se devuelve ilegible,
   también «S/.1 16500» (junio): sin punto decimal y con un espacio entre
   cifras puede ser 1 165,00 o 116 500, y no se adivina. */
export function soles(texto) {
  const t = String(texto ?? '').trim();
  if (t === '') return { valor: null };
  const sinMoneda = t.replace(/S\s*\/\s*\.?/i, '');
  if (!sinMoneda.includes('.') && /\d\s+\d/.test(sinMoneda)) return { valor: null, ilegible: t };
  const limpio = sinMoneda.replace(/[\s,]/g, '');
  if (/^[0.]*$/.test(limpio)) return { valor: 0 };
  if (/^\d+(\.\d{1,2})?$/.test(limpio)) return { valor: Number(limpio) };
  return { valor: null, ilegible: t };
}

/* «DR. JULIO CANELO TORRES» → «Dr. Julio Canelo Torres». */
function nombrePropio(texto) {
  return String(texto ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s.(])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
}

/* Las celdas no vacías de una fila de Word, con su columna (contando las
   combinadas, como `tabla.celdas`: es lo que la corrección muestra y parcha). */
function celdasDe(tabla, f) {
  let col = 0;
  const salida = [];
  for (const c of tabla.filas[f] ?? []) {
    if (String(c.texto ?? '').trim()) salida.push({ texto: c.texto.trim(), col });
    col += c.span;
  }
  return salida;
}

/* Cada tabla del Word es una «hoja» de la corrección, y la corrección ubica
   la tabla por el nombre de la hoja: como una hoja del oficio (Rayos X) son
   varias tablas, el nombre lleva además el número de la tabla. */
const posicion = (tabla, f, col, hoja) => ({ hoja: `${hoja} · tabla ${tabla.indice + 1}`, tabla: tabla.indice, fila: f + 1, columna: letraDeColumna(col + 1) });

const SERVICIO_DE = (rotulo) => {
  const t = compacto(rotulo);
  if (t.startsWith('CONSULT')) return 'ce';
  if (t.startsWith('EMERG')) return 'emerg';
  if (t.startsWith('HOSPITALIZ')) return 'hosp';
  return null;
};

/* Cada tabla del documento con su texto ya compacto, para reconocerla. */
function indice(documento) {
  return documento.tablas.map((t) => ({ t, texto: compacto(t.filas.map((f) => f.map((c) => c.texto).join(' ')).join(' ')) }));
}

/* Ubica las tablas de cada hoja, en orden. Devuelve { problema } si falta
   alguna de las que no pueden faltar. */
function ubicar(documento) {
  const tablas = indice(documento);
  let i = 0;
  /* Busca desde la última encontrada. Si no la encuentra, no avanza: una
     tabla que falta no se lleva con ella a las siguientes. */
  const buscar = (prueba) => {
    for (let j = i; j < tablas.length; j += 1) {
      if (prueba(tablas[j])) {
        i = j + 1;
        return tablas[j].t;
      }
    }
    return null;
  };
  const tieneTotales = (x) => /TOTALEXAMENES/.test(x.texto) && /TOTALPACIENTES/.test(x.texto);
  const u = {};
  u.rx = buscar((x) => /EXAMENESATENDIDOS/.test(x.texto) && /PLACAS/.test(x.texto));
  if (!u.rx) return null;
  u.tecnologos = buscar((x) => /NOMBRESAPELLIDOS/.test(x.texto));
  u.lecturaRx = buscar((x) => x.texto.startsWith('DATOS'));
  u.tac = buscar(tieneTotales);
  u.tacSis = buscar((x) => x.texto.startsWith('EXAMENESSIS'));
  u.tacConvenio = buscar((x) => x.texto.startsWith('CONVENIOS'));
  u.tacPagado = buscar((x) => x.texto.startsWith('PAGADOS'));
  u.tacMonto = buscar((x) => x.texto.startsWith('TOTALS'));
  u.lecturaTac = buscar((x) => x.texto.startsWith('DATOS'));
  u.mam = buscar(tieneTotales);
  u.mamMatriz = buscar((x) => x.texto.startsWith('SIS'));
  u.mamCampana = buscar((x) => !x.texto.startsWith('TOTALS') && !x.texto.startsWith('DATOS') && x.t.filas.length === 1 && /\d/.test(x.texto));
  u.mamMonto = buscar((x) => x.texto.startsWith('TOTALS'));
  u.lecturaMam = buscar((x) => x.texto.startsWith('DATOS'));
  u.eco = documento.tablas.find((t) => t.filas.some((f) => f.some((c) => compacto(c.texto) === 'PROFESIONALES')));
  return u;
}

const HOJAS = Object.freeze({ f1: 'Ecografía', f2: 'Tomografía', f3: 'Mamografía', f4: 'Rayos X' });

function periodoDelDocumento(documento) {
  for (const p of documento.parrafos) {
    if (/^\s*MES DE\b/i.test(p) || /EXAMENES (TOMOGRAFICOS|MAMOGRAFICOS) MES/i.test(normalizar(p))) {
      const periodo = periodoDeTexto(p);
      if (periodo) return { periodo, texto: p.trim() };
    }
  }
  return null;
}

export async function reconocer(documento, { periodo } = {}) {
  const u = ubicar(documento);
  if (!u?.rx || !u.eco) {
    return {
      problema: problema(
        'plantilla',
        'Este Word no es el oficio de Diagnóstico por Imágenes',
        'El bot busca las hojas de Rayos X (exámenes atendidos, placas, tecnólogos), tomografía, mamografía y ecografía (la tabla de PROFESIONALES), como en el oficio mensual del departamento.',
      ),
    };
  }
  const delWord = periodoDelDocumento(documento);
  if (delWord && periodo && delWord.periodo !== periodo) {
    return {
      problema: problema(
        'plantilla-periodo',
        `Este oficio es de ${etiquetaPeriodo(delWord.periodo).toLowerCase()}, no de ${etiquetaPeriodo(periodo).toLowerCase()}`,
        `El Word dice «${delWord.texto}». Suba el oficio del mes que está reportando.`,
      ),
    };
  }
  return { plantilla: { area: 'imagenes', periodo: periodo ?? null, version: VERSION } };
}

export async function leerCifras(documento, { periodo } = {}) {
  const u = ubicar(documento);
  if (!u?.rx || !u.eco) return { problema: problema('plantilla', 'No se encontraron las hojas del oficio de Diagnóstico por Imágenes') };

  const datos = {
    f1: { examenes: [], biopsias: [], oncologicos: [] },
    f2: { inoperativo: false, nota: '', pacientes: null, examenes: matrizVacia(), monto: null, informes: [] },
    f3: { pacientes: null, examenes: matrizVacia(), campana: null, campanaRotulo: '', monto: null, informes: [] },
    f4: { examenes: {}, pacientes: null, placas: null, tecnologos: [], particulares: null, monto: null, informes: [] },
    escritos: { f1: { filas: {}, total: null }, f2: {}, f3: {}, f4: {} },
  };
  const ilegibles = {};
  const origen = {};
  const hallazgos = [];
  let leidas = 0;

  /* Una cifra leída: queda en los datos por su ruta (`f4.examenes.hosp`), con
     su celda en `origen` y su texto si no se pudo leer. */
  const anotar = (ruta, tabla, f, col, hoja, leida) => {
    origen[`d|${ruta}`] = posicion(tabla, f, col, hoja);
    if (leida.ilegible != null) ilegibles[`d|${ruta}`] = leida.ilegible;
    if (leida.valor != null) leidas += 1;
    return leida.valor ?? null;
  };
  const anotarEscrito = (ruta, tabla, f, col, hoja, leida) => {
    origen[`e|${ruta}`] = posicion(tabla, f, col, hoja);
    return leida.valor ?? null;
  };

  /* Un cuadro «rótulo | cifra» por filas: devuelve [{ rotulo, texto, f, col }]. */
  const pares = (tabla) =>
    (tabla?.filas ?? []).flatMap((_, f) => {
      const c = celdasDe(tabla, f);
      return c.length >= 2 ? [{ rotulo: c[0].texto, texto: c.at(-1).texto, f, col: c.at(-1).col }] : c.length === 1 ? [{ rotulo: c[0].texto, texto: '', f, col: null }] : [];
    });

  /* Personas «nombre | cantidad» (tecnólogos, lecturas e informes). */
  const personas = (tabla, ruta, hoja, prefijo, hasta = () => false) => {
    const lista = [];
    for (const p of pares(tabla)) {
      if (/^(DATOS|NOMBRES)/.test(compacto(p.rotulo))) continue;
      if (hasta(p)) break;
      if (p.col == null || !/\d/.test(p.texto)) continue;
      const n = lista.length;
      const cantidad = anotar(`${ruta}.${n}.cantidad`, tabla, p.f, p.col, hoja, cifraDeCelda(p.texto));
      lista.push({ id: `${prefijo}-${n + 1}`, nombre: nombrePropio(p.rotulo), cantidad });
    }
    return lista;
  };

  /* ---------------------------------------------------------- Rayos X */
  const hojaRx = HOJAS.f4;
  for (const p of pares(u.rx)) {
    const r = compacto(p.rotulo);
    if (p.col == null) continue;
    const leida = cifraDeCelda(p.texto);
    if (/ATENDIDOS/.test(r)) datos.escritos.f4.atendidos = anotarEscrito('f4.atendidos', u.rx, p.f, p.col, hojaRx, leida);
    else if (/PACIENTES/.test(r)) datos.f4.pacientes = anotar('f4.pacientes', u.rx, p.f, p.col, hojaRx, leida);
    else if (/PLACAS/.test(r)) datos.f4.placas = anotar('f4.placas', u.rx, p.f, p.col, hojaRx, leida);
    else {
      const s = /HOSPITALIZ/.test(r) ? 'hosp' : /EMERGENCIA/.test(r) ? 'emerg' : /CONSULTA/.test(r) ? 'ce' : null;
      if (s) datos.f4.examenes[s] = anotar(`f4.examenes.${s}`, u.rx, p.f, p.col, hojaRx, leida);
    }
  }
  const esParticulares = (p) => /PARTICULARES/.test(compacto(p.rotulo)) || compacto(p.rotulo).startsWith('TOTAL');
  datos.f4.tecnologos = personas(u.tecnologos, 'f4.tecnologos', hojaRx, 'tec', esParticulares);
  for (const p of pares(u.tecnologos)) {
    const r = compacto(p.rotulo);
    if (p.col == null) continue;
    if (r.startsWith('PACIENTESPARTICULARES')) datos.f4.particulares = anotar('f4.particulares', u.tecnologos, p.f, p.col, hojaRx, cifraDeCelda(p.texto));
    else if (r.startsWith('TOTAL')) datos.f4.monto = anotar('f4.monto', u.tecnologos, p.f, p.col, hojaRx, soles(p.texto));
  }
  datos.f4.informes = personas(u.lecturaRx, 'f4.informes', hojaRx, 'lrx');

  /* ------------------------------------------------------- Tomografía */
  const hojaTac = HOJAS.f2;
  for (const p of pares(u.tac)) {
    if (p.col == null) continue;
    const r = compacto(p.rotulo);
    if (/TOTALEXAMENES/.test(r)) datos.escritos.f2.total = anotarEscrito('f2.total', u.tac, p.f, p.col, hojaTac, cifraDeCelda(p.texto));
    else if (/TOTALPACIENTES/.test(r)) datos.f2.pacientes = anotar('f2.pacientes', u.tac, p.f, p.col, hojaTac, cifraDeCelda(p.texto));
  }
  for (const [financiador, tabla] of [['sis', u.tacSis], ['convenio', u.tacConvenio], ['pagado', u.tacPagado]]) {
    for (const p of pares(tabla)) {
      const s = SERVICIO_DE(p.rotulo);
      if (!s || p.col == null) continue;
      datos.f2.examenes[financiador][s] = anotar(`f2.examenes.${financiador}.${s}`, tabla, p.f, p.col, hojaTac, cifraDeCelda(p.texto));
    }
  }
  const montoTac = pares(u.tacMonto)[0];
  if (montoTac?.col != null) datos.f2.monto = anotar('f2.monto', u.tacMonto, montoTac.f, montoTac.col, hojaTac, soles(montoTac.texto));
  datos.f2.informes = personas(u.lecturaTac, 'f2.informes', hojaTac, 'tac');
  const nota = documento.parrafos.find((p) => /INOPERATIV/i.test(p));
  if (nota) {
    datos.f2.inoperativo = true;
    datos.f2.nota = nota.replace(/^\s*NOTA\s*:\s*/i, '').trim();
  }

  /* ------------------------------------------------------- Mamografía */
  const hojaMam = HOJAS.f3;
  for (const p of pares(u.mam)) {
    if (p.col == null) continue;
    const r = compacto(p.rotulo);
    if (/TOTALEXAMENES/.test(r)) datos.escritos.f3.total = anotarEscrito('f3.total', u.mam, p.f, p.col, hojaMam, cifraDeCelda(p.texto));
    else if (/TOTALPACIENTES/.test(r)) datos.f3.pacientes = anotar('f3.pacientes', u.mam, p.f, p.col, hojaMam, cifraDeCelda(p.texto));
  }
  let financiador = null;
  for (const p of pares(u.mamMatriz)) {
    const r = compacto(p.rotulo);
    if (r === 'SIS') financiador = 'sis';
    else if (r.startsWith('CONVENIO')) financiador = 'convenio';
    else if (r.startsWith('PAGADO')) financiador = 'pagado';
    const s = SERVICIO_DE(p.rotulo);
    if (!s || !financiador) continue;
    const celda = celdasDe(u.mamMatriz, p.f);
    /* Una fila sin cifra (pagados de emergencia, en enero) queda en blanco:
       su celda es la segunda columna de la tabla. */
    const col = p.col ?? (celda[0].col + (u.mamMatriz.filas[p.f][0]?.span ?? 1));
    datos.f3.examenes[financiador][s] = anotar(`f3.examenes.${financiador}.${s}`, u.mamMatriz, p.f, col, hojaMam, cifraDeCelda(p.col == null ? '' : p.texto));
  }
  const campana = pares(u.mamCampana)[0];
  if (campana?.col != null) {
    datos.f3.campana = anotar('f3.campana', u.mamCampana, campana.f, campana.col, hojaMam, cifraDeCelda(campana.texto));
    datos.f3.campanaRotulo = campana.rotulo.trim();
  }
  const montoMam = pares(u.mamMonto)[0];
  if (montoMam?.col != null) datos.f3.monto = anotar('f3.monto', u.mamMonto, montoMam.f, montoMam.col, hojaMam, soles(montoMam.texto));
  else if (montoMam) origen['d|f3.monto'] = posicion(u.mamMonto, montoMam.f, 1, hojaMam);
  datos.f3.informes = personas(u.lecturaMam, 'f3.informes', hojaMam, 'mam');

  /* -------------------------------------------------------- Ecografía */
  const hojaEco = HOJAS.f1;
  const eco = u.eco;
  const cabecera = eco.celdas.findIndex((fila) => fila.some((t) => compacto(t) === 'PROFESIONALES'));
  const colNombre = eco.celdas[cabecera].findIndex((t) => compacto(t) === 'PROFESIONALES');
  /* EXAM, TOTAL PCTS, las nueve casillas (SIS, convenios, pagados × C. ext.,
     Emer., Hosp.) y el MONTO, en ese orden. */
  const MATRIZ = FINANCIADORES.flatMap((fz) => SERVICIOS.map((s) => [fz.clave, s.clave]));
  let cuadro = 'examenes';
  for (let f = cabecera + 1; f < eco.celdas.length; f += 1) {
    const textos = eco.celdas[f];
    const nombre = String(textos[colNombre] ?? '').trim();
    const r = compacto(nombre || textos.join(' '));
    if (!r) continue;
    if (/BIOPSIA/.test(r)) { cuadro = 'biopsias'; continue; }
    if (/ONCOLOG/.test(r)) { cuadro = 'oncologicos'; continue; }
    const valores = textos.slice(colNombre + 1, colNombre + 13);
    if (!valores.some((v) => /\d/.test(String(v)))) continue;
    if (r === 'TOTAL') {
      const total = { examenes: matrizVacia() };
      total.exam = anotarEscrito(`f1.total.exam`, eco, f, colNombre + 1, hojaEco, cifraDeCelda(valores[0]));
      total.pacientes = anotarEscrito(`f1.total.pacientes`, eco, f, colNombre + 2, hojaEco, cifraDeCelda(valores[1]));
      MATRIZ.forEach(([fz, s], i) => { total.examenes[fz][s] = anotarEscrito(`f1.total.examenes.${fz}.${s}`, eco, f, colNombre + 3 + i, hojaEco, cifraDeCelda(valores[2 + i])); });
      const monto = soles(valores[11]);
      total.monto = anotarEscrito(`f1.total.monto`, eco, f, colNombre + 12, hojaEco, monto);
      if (monto.ilegible != null) total.montoTexto = monto.ilegible;
      datos.escritos.f1.total = total;
      continue;
    }
    const n = datos.f1[cuadro].length;
    const ruta = `f1.${cuadro}.${n}`;
    const fila = { id: `${cuadro.slice(0, 3)}-${n + 1}`, nombre: nombrePropio(nombre), pacientes: null, examenes: matrizVacia(), monto: null };
    (datos.escritos.f1.filas[cuadro] ??= [])[n] = anotarEscrito(`f1.filas.${cuadro}.${n}`, eco, f, colNombre + 1, hojaEco, cifraDeCelda(valores[0]));
    fila.pacientes = anotar(`${ruta}.pacientes`, eco, f, colNombre + 2, hojaEco, cifraDeCelda(valores[1]));
    MATRIZ.forEach(([fz, s], i) => { fila.examenes[fz][s] = anotar(`${ruta}.examenes.${fz}.${s}`, eco, f, colNombre + 3 + i, hojaEco, cifraDeCelda(valores[2 + i])); });
    fila.monto = anotar(`${ruta}.monto`, eco, f, colNombre + 12, hojaEco, soles(valores[11]));
    datos.f1[cuadro].push(fila);
  }

  for (const [clave, tabla, texto] of [
    ['tecnologos', u.tecnologos, 'los exámenes por tecnólogo'],
    ['lectura-tac', u.tacSis, 'los exámenes tomográficos por financiamiento'],
    ['lectura-mam', u.mamMatriz, 'la matriz de mamografía'],
  ]) {
    if (!tabla) {
      hallazgos.push({ id: `cuadro-ausente|${clave}`, regla: 'cuadro-ausente', formato: clave === 'tecnologos' ? 'f4' : clave === 'lectura-tac' ? 'f2' : 'f3', titulo: `El oficio no trae ${texto}`, detalle: 'No borre ni cambie el título de las tablas del oficio: el bot encuentra cada una por su contenido.' });
    }
  }
  if (!periodoDelDocumento(documento)) {
    hallazgos.push({ id: 'sin-mes', regla: 'sin-mes', formato: 'f4', titulo: 'El oficio no dice de qué mes es', detalle: 'No se encontró «MES DE …» en las hojas. Se cargó en el reporte abierto; revise que sea el mes correcto.' });
  }

  if (Object.keys(ilegibles).length) datos.ilegibles = ilegibles;
  /* Los cuadros planos que guarda la base (definicion.js, CUADROS_BASE). */
  Object.assign(datos, plano(datos));
  return { datos, origen, leidas, hallazgos, periodo };
}
