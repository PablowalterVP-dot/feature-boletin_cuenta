/* Corrección del reporte de Centro Quirúrgico sobre su propio libro.

   El mismo contrato que Laboratorio (laboratorio/correccion.js): lo corregido
   se escribe en una copia del libro del área, que vuelve a pasar por el bot.
   Lo propio de Centro Quirúrgico:

     · tres clases de casilla:
         `cuadro|fila`              una cifra del RESUMEN, del cuadro de
                                    indicadores o de una causa de suspensión
         `mayor|especialidad#fila`  un procedimiento, por su fila en la hoja
         `escrito|…`                un total escrito: el de una especialidad
                                    (`escrito|mayor|cirugia_general`), el Sub
                                    Total de la hoja (`escrito|mayor|_total`) o
                                    el TOTAL de las causas (`escrito|suspendidas|_total`)
     · el total de cada especialidad (`datos.mayor.cirugia_general`) no es una
       casilla: es la suma de sus procedimientos y se recalcula;
     · el libro tiene cinco hojas: cada celda se nombra con la suya.

   LAS FÓRMULAS: la fila de una especialidad suma sus procedimientos, el Sub
   Total suma las especialidades y el TOTAL de SUSPENDIDAS suma las causas.
   Si son fórmula y nadie las cambió a mano, su valor guardado se ajusta con
   la diferencia (Excel recalcula al abrir, pero el bot lee el valor
   guardado). Las fórmulas que cruzan hojas (el cuadro de indicadores toma
   cifras del RESUMEN) no se siguen: el aviso de cruce lo dice. */

import { CAUSAS, ESPECIALIDADES, cuadro, filaDe, especialidad } from './definicion.js';
import { valor, sumar } from './calculos.js';
import { errorDeTecleo } from '../../correccion.js';

const TIPOS = ['mayor', 'menor'];

function partes(casilla) {
  const p = casilla.split('|');
  if (p[0] === 'escrito') return { tipo: 'escrito', cuadro: p[1], clave: p[2] ?? null };
  const [esp, fila] = (p[1] ?? '').split('#');
  if (TIPOS.includes(p[0]) && fila) return { tipo: 'procedimiento', cuadro: p[0], especialidad: esp, fila: Number(fila) };
  return { tipo: 'dato', cuadro: p[0], clave: p.slice(1).join('|') };
}

function esCasilla(casilla) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') return p.clave === '_total' ? ['mayor', 'menor', 'suspendidas'].includes(p.cuadro) : TIPOS.includes(p.cuadro) && Boolean(especialidad(p.clave));
  if (p.tipo === 'procedimiento') return Boolean(especialidad(p.especialidad));
  // El total de una especialidad se calcula: no es una casilla.
  return !TIPOS.includes(p.cuadro) && Boolean(cuadro(p.cuadro) && filaDe(p.cuadro, p.clave));
}

function procedimiento(datos, p) {
  return (datos?.procedimientos?.[p.cuadro]?.[p.especialidad] ?? []).find((i) => i.fila === p.fila) ?? null;
}

export function etiquetaDe(casilla) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') {
    if (p.cuadro === 'suspendidas') return 'Causas de suspensión · TOTAL';
    return p.clave === '_total' ? `${cuadro(p.cuadro)?.titulo} · Sub Total` : `${cuadro(p.cuadro)?.titulo} · ${especialidad(p.clave)?.label} · total escrito`;
  }
  if (p.tipo === 'procedimiento') return `${cuadro(p.cuadro)?.titulo} · ${especialidad(p.especialidad)?.label} · fila ${p.fila}`;
  const f = filaDe(p.cuadro, p.clave);
  return f ? `${cuadro(p.cuadro).titulo} · ${f.rotulo}` : casilla;
}

/* El valor de una casilla en unos datos: { valor, ilegible }. */
export function leer(datos, casilla) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') {
    const v = datos?.declarados?.[p.cuadro]?.[p.clave];
    return { valor: typeof v === 'number' ? v : null, ilegible: null };
  }
  if (p.tipo === 'procedimiento') {
    const v = procedimiento(datos, p)?.valor;
    return { valor: typeof v === 'number' ? v : null, ilegible: datos?.ilegibles?.[casilla] ?? null };
  }
  return { valor: valor(datos, p.cuadro, p.clave), ilegible: datos?.ilegibles?.[casilla] ?? null };
}

function escribir(datos, casilla, v) {
  const p = partes(casilla);
  if (p.tipo === 'escrito') {
    ((datos.declarados ??= {})[p.cuadro] ??= {})[p.clave] = v;
    return;
  }
  if (p.tipo === 'procedimiento') {
    const item = procedimiento(datos, p);
    if (item) item.valor = v;
  } else (datos[p.cuadro] ??= {})[p.clave] = v;
  if (datos.ilegibles) delete datos.ilegibles[casilla];
}

/* El total de cada especialidad vuelve a ser la suma de sus procedimientos. */
function recalcularEspecialidades(datos) {
  for (const tipo of TIPOS) {
    for (const [esp, items] of Object.entries(datos?.procedimientos?.[tipo] ?? {})) {
      const numeros = items.filter((i) => typeof i.valor === 'number');
      if (numeros.length) (datos[tipo] ??= {})[esp] = numeros.reduce((a, i) => a + i.valor, 0);
    }
  }
}

/* ------------------------------------------------------ los hallazgos */

/* Qué señala un hallazgo y qué deja corregir. Los cruces entre hojas traen
   en `casillas` las celdas que comparan: se muestran y se pueden corregir, o
   se confirma el aviso. */
export function casillasDelHallazgo(h) {
  const ev = h.evidencia;
  if (ev) {
    const directos = ev.sumandos.filter((s) => s.casilla).map((s) => s.casilla);
    return { total: ev.total.casilla, sumandos: directos, editables: [ev.total.casilla, ...directos] };
  }
  const regla = h.regla ?? h.id;
  if (regla === 'incompleto') {
    const lista = (h.casillas ?? []).map((f) => `${h.formato}|${f}`);
    return { total: null, sumandos: lista, editables: lista };
  }
  if ((regla === 'no-numerico' || regla === 'entero') && h.fila) {
    const c = `${h.formato}|${h.fila}`;
    return { total: null, sumandos: [c], editables: [c] };
  }
  if (h.casillas?.length) return { total: null, sumandos: h.casillas, editables: h.casillas };
  return { total: null, sumandos: [], editables: [] };
}

/* --------------------------------------------------- aplicar cambios */

/* Lo que suma cada total escrito, como las fórmulas del libro. */
function entradas(total, base) {
  const t = partes(total);
  if (t.cuadro === 'suspendidas') return CAUSAS.map((c) => `suspendidas|${c.clave}`);
  if (t.clave === '_total') return ESPECIALIDADES.filter((e) => e.en.includes(t.cuadro)).map((e) => `escrito|${t.cuadro}|${e.clave}`);
  return (base?.procedimientos?.[t.cuadro]?.[t.clave] ?? []).map((i) => `${t.cuadro}|${t.clave}#${i.fila}`);
}

/* Primero las especialidades (suman procedimientos), después el Sub Total y
   el TOTAL de las causas. */
const nivelDe = (casilla) => (partes(casilla).clave === '_total' ? 2 : 1);

/* Los datos con unos cambios: { casilla: número | null }. No modifica `base`. */
export function aplicar(base, cambios, origen = {}) {
  const datos = structuredClone(base ?? {});
  const delta = new Map();
  for (const [casilla, v] of Object.entries(cambios)) {
    if (!esCasilla(casilla)) continue;
    const antes = leer(base, casilla).valor;
    escribir(datos, casilla, v);
    delta.set(casilla, (v ?? 0) - (antes ?? 0));
  }
  const formulas = Object.entries(origen).filter(([casilla, o]) => o?.formula && !(casilla in cambios) && esCasilla(casilla) && partes(casilla).tipo === 'escrito');
  for (const nivel of [1, 2]) {
    for (const [casilla] of formulas.filter(([k]) => nivelDe(k) === nivel)) {
      const suma = entradas(casilla, base).reduce((s, e) => s + (delta.get(e) ?? 0), 0);
      if (suma === 0) continue;
      escribir(datos, casilla, (leer(base, casilla).valor ?? 0) + suma);
      delta.set(casilla, suma);
    }
  }
  recalcularEspecialidades(datos);
  return datos;
}

/* Las celdas que cambian, nombradas con su hoja: { 'HOJA!REF': número | null }. */
export function celdasCambiadas(base, datos, origen = {}) {
  const celdas = {};
  for (const [casilla, o] of Object.entries(origen)) {
    if (!o || !esCasilla(casilla)) continue;
    const a = leer(base, casilla);
    const b = leer(datos, casilla);
    if (a.valor === b.valor && a.ilegible === b.ilegible) continue;
    // Una celda de horas con formato [h]:mm guarda días (lector.js).
    celdas[`${o.hoja}!${o.columna}${o.fila}`] = o.enDias && b.valor != null ? b.valor / 24 : b.valor;
  }
  return celdas;
}

/* El reporte es mensual: el origen ya trae la celda de cada casilla. */
export function expandirOrigen(origen = {}) {
  return origen;
}

/* La hoja principal, para el título de la corrección (el libro tiene cinco). */
export function hojaDe(origen = {}) {
  return Object.values(origen).find((o) => o?.hoja)?.hoja ?? null;
}

/* ------------------------------------------------ RESUMEN frente a hojas

   El aviso «cruce-resumen» compara dos cifras que salen de hojas distintas:
   las cirugías del RESUMEN (programada más emergencia) y las de CIRUGIA
   MAYOR o MENOR (la suma de sus especialidades). Con solo las celdas del
   aviso no se ve dónde está la diferencia; estas tablas ponen las dos hojas
   lado a lado y, debajo, cada especialidad de la hoja que no cuadra.

   Se calculan con los datos corregidos: al corregir una celda, las tablas
   cambian con ella. Devuelve [{ titulo, nota, columnas, filas }]; la
   pantalla las pinta tal cual (Correccion.jsx). */

const HOJA = Object.freeze({ mayor: 'CIRUGIA MAYOR', menor: 'CIRUGIA MENOR' });
const DEL_RESUMEN = Object.freeze({ mayor: 'mayores', menor: 'menores' });

export function comparacion(h, datos) {
  if ((h.regla ?? h.id) !== 'cruce-resumen') return [];
  const lineas = TIPOS.map((tipo) => {
    const r = (t) => valor(datos, 'resumen', `${DEL_RESUMEN[tipo]}.${t}`);
    const resumen = sumar([r('programada'), r('emergencia')]);
    const especialidades = sumar(Object.values(datos?.[tipo] ?? {}));
    const subtotal = datos?.declarados?.[tipo]?._total ?? null;
    return {
      clave: tipo,
      tipo: `Cirugías ${DEL_RESUMEN[tipo]}`,
      programada: r('programada'),
      emergencia: r('emergencia'),
      resumen,
      subtotal,
      especialidades,
      diferencia: resumen == null || especialidades == null ? null : resumen - especialidades,
    };
  });
  const tablas = [
    {
      titulo: 'RESUMEN frente a CIRUGIA MAYOR y CIRUGIA MENOR',
      nota: 'La diferencia es el total del RESUMEN menos la suma de las especialidades de la hoja. Cero: las dos hojas dicen lo mismo.',
      columnas: [
        { clave: 'tipo', rotulo: 'Fila', ayuda: 'La fila del RESUMEN. Las mayores se comparan con la hoja CIRUGIA MAYOR; las menores, con CIRUGIA MENOR.' },
        { clave: 'programada', rotulo: 'Programada', numero: true, grupo: 'RESUMEN', grupoAyuda: 'Lo que dice la hoja RESUMEN en la columna del mes.', ayuda: 'Columna del mes, programada, en la hoja RESUMEN.' },
        { clave: 'emergencia', rotulo: 'Emergencia', numero: true, grupo: 'RESUMEN', ayuda: 'Columna del mes, emergencia, en la hoja RESUMEN.' },
        { clave: 'resumen', rotulo: 'Total', numero: true, grupo: 'RESUMEN', ayuda: 'Programada más emergencia.' },
        { clave: 'subtotal', rotulo: 'Sub Total', numero: true, grupo: 'Hoja de la cirugía', grupoAyuda: 'CIRUGIA MAYOR para las mayores; CIRUGIA MENOR para las menores.', ayuda: 'El Sub Total escrito en CIRUGIA MAYOR o MENOR.' },
        { clave: 'especialidades', rotulo: 'Suma', numero: true, grupo: 'Hoja de la cirugía', ayuda: 'Lo que suman las especialidades de la hoja, procedimiento por procedimiento.' },
        { clave: 'diferencia', rotulo: 'Diferencia', numero: true, marcar: true, ayuda: 'RESUMEN menos la hoja. Distinta de cero: una de las dos está mal.' },
      ],
      filas: lineas,
    },
  ];
  for (const l of lineas.filter((x) => x.diferencia)) {
    tablas.push({
      titulo: `${HOJA[l.clave]}, especialidad por especialidad`,
      nota: `La hoja suma ${l.especialidades.toLocaleString('es-PE')}; el RESUMEN dice ${l.resumen.toLocaleString('es-PE')}. Busque la especialidad cuya cifra no es la esperada: si la hoja está bien, la que hay que corregir es la del RESUMEN.`,
      columnas: [
        { clave: 'especialidad', rotulo: 'Especialidad', ayuda: 'Cada especialidad de la hoja.' },
        { clave: 'escrito', rotulo: 'Total escrito', numero: true, ayuda: 'El total de la especialidad tal como está en la hoja.' },
        { clave: 'suma', rotulo: 'Suma de procedimientos', numero: true, ayuda: 'Lo que suman sus procedimientos. Es la cifra que cuenta.' },
        { clave: 'diferencia', rotulo: 'Diferencia', numero: true, marcar: true, ayuda: 'Total escrito menos la suma de procedimientos.' },
      ],
      filas: ESPECIALIDADES.filter((e) => e.en.includes(l.clave) && (datos?.[l.clave]?.[e.clave] != null || datos?.declarados?.[l.clave]?.[e.clave] != null)).map((e) => {
        const escrito = datos?.declarados?.[l.clave]?.[e.clave] ?? null;
        const suma = valor(datos, l.clave, e.clave);
        return { clave: e.clave, especialidad: e.label, escrito, suma, diferencia: escrito == null || suma == null ? null : escrito - suma };
      }),
    });
  }
  return tablas;
}

/* Dr. Mochi ante el cruce del RESUMEN con sus hojas.

   Lo primero que ve el área es QUÉ NO COINCIDE, en cifras y no en frases
   (22/10/2026: el texto saturaba y no se entendía cuál era el problema):
   `comparaciones` pone, para las mayores y para las menores, el RESUMEN
   (programadas + emergencia = total) frente a la hoja (lo que suman sus
   especialidades). Se arman con los datos corregidos, así que al corregir
   la comparación pasa de ≠ a = a la vista. Van las dos aunque solo una no
   cuadre: ver la otra en = también dice dónde no está el problema.

   Las respuestas, para cada una que no cuadra (`grupo`):
     · corregir el RESUMEN, en las de emergencia o en las programadas
       (primero la que parece mal tecleada);
     · buscar en la hoja, especialidad por especialidad (las tablas de
       `comparacion`): no se sabe qué procedimiento falta;
   y, para todas, confirmar. «Recomendada» solo con un indicio fuerte (dos
   dígitos invertidos, uno de más o de menos): un dígito distinto lo tiene
   casi cualquier cifra. */
export function explicar(h, datos) {
  const regla = h.regla ?? h.id;
  if (LINEAS[regla]) return explicarCruce(h, datos, LINEAS[regla]);
  if (regla !== 'cruce-resumen') return null;
  const cifra = (n) => n.toLocaleString('es-PE');
  const comparaciones = [];
  const causas = [];
  for (const tipo of TIPOS) {
    const programada = `resumen|${DEL_RESUMEN[tipo]}.programada`;
    const emergencia = `resumen|${DEL_RESUMEN[tipo]}.emergencia`;
    const p = leer(datos, programada).valor;
    const e = leer(datos, emergencia).valor;
    const resumen = sumar([p, e]);
    const hoja = sumar(Object.values(datos?.[tipo] ?? {}));
    if (resumen == null || hoja == null) continue;
    comparaciones.push({
      clave: tipo,
      titulo: `Cirugías ${DEL_RESUMEN[tipo]}`,
      izquierda: {
        titulo: 'RESUMEN',
        celdas: [
          { casilla: programada, etiqueta: 'Programadas', valor: p },
          { casilla: emergencia, etiqueta: 'Emergencia', valor: e },
        ],
        resultado: resumen,
      },
      derecha: {
        titulo: HOJA[tipo],
        celdas: [{ casilla: `escrito|${tipo}|_total`, etiqueta: 'Suma de especialidades', valor: hoja }],
        resultado: hoja,
      },
    });
    if (resumen === hoja) continue;
    const d = resumen - hoja;
    const candidatas = [
      { casilla: emergencia, v: e, que: 'las de emergencia' },
      { casilla: programada, v: p, que: 'las programadas' },
    ]
      .filter((c) => c.v != null && c.v - d >= 0)
      .map((c) => {
        const tecleo = errorDeTecleo(c.v - d, c.v);
        return { ...c, nuevo: c.v - d, tecleo: tecleo?.tipo === 'cambiado' ? null : tecleo };
      })
      .sort((a, b) => Number(Boolean(b.tecleo)) - Number(Boolean(a.tecleo)));
    for (const c of candidatas) {
      causas.push({
        grupo: tipo,
        recomendada: Boolean(c.tecleo),
        texto: `Si la hoja ${HOJA[tipo]} está bien, el error está en ${c.que} del RESUMEN${c.tecleo ? `, que parece mal tecleada: tiene ${c.tecleo.texto}` : ''}.`,
        casillas: [c.casilla],
        sugerencia: { texto: `Corregir ${c.que} del RESUMEN`, cambios: { [c.casilla]: c.nuevo } },
      });
    }
    causas.push({
      grupo: tipo,
      texto: `Si el RESUMEN está bien, a la hoja ${HOJA[tipo]} le ${d > 0 ? 'faltan' : 'sobran'} ${cifra(Math.abs(d))} cirugías: búsquelas especialidad por especialidad y corríjalas en su Excel.`,
      casillas: [`escrito|${tipo}|_total`],
      detalle: true,
    });
  }
  if (!comparaciones.length) return null;
  if (causas.length) causas.push({ texto: 'Las cifras son correctas y hay un motivo para que difieran: confírmelo.', confirmar: true });
  return { cuenta: null, conclusion: 'El RESUMEN y las hojas por especialidad no dicen lo mismo.', comparaciones, causas };
}

/* Los demás cruces (cuadro de indicadores, suspendidas, salas): cada línea
   que compara reglas.js, con sus dos lados en celdas, para la balanza. El
   aviso solo traía las celdas en una lista y no se veía qué se comparaba
   con qué (22/10/2026). Mismas cuentas que validarCruces: si cambia una,
   cambia aquí. */
const R = (k) => `resumen|${k}`;
const I = (k) => `indicadores|${k}`;
const CAUSAS_CELDAS = CAUSAS.map((c) => `suspendidas|${c.clave}`);
const LINEAS = Object.freeze({
  'cruce-indicadores': [
    { clave: 'programadas', titulo: 'Intervenciones programadas', a: ['Cuadro de indicadores', [I('intervenciones_programadas')]], b: ['RESUMEN', [R('mayores.programada'), R('menores.programada')]] },
    { clave: 'emergencia', titulo: 'Intervenciones de emergencia', a: ['Cuadro de indicadores', [I('intervenciones_emergencia')]], b: ['RESUMEN', [R('mayores.emergencia'), R('menores.emergencia')]] },
    { clave: 'realizadas', titulo: 'Intervenciones realizadas', a: ['Cuadro de indicadores', [I('intervenciones_realizadas')]], b: ['RESUMEN', [R('mayores.programada'), R('menores.programada'), R('mayores.emergencia'), R('menores.emergencia')]] },
    { clave: 'realizadas-cuadro', titulo: 'Realizadas = programadas + emergencia', a: ['Cuadro de indicadores', [I('intervenciones_realizadas')]], b: ['Cuadro de indicadores', [I('intervenciones_programadas'), I('intervenciones_emergencia')]] },
    { clave: 'horas-efectivas', titulo: 'Horas quirúrgicas efectivas', decimal: true, a: ['Cuadro de indicadores', [I('horas_efectivas')]], b: ['RESUMEN', [R('horas_efectivas.programada'), R('horas_efectivas.emergencia')]] },
    { clave: 'horas-programadas', titulo: 'Horas quirúrgicas programadas', decimal: true, a: ['Cuadro de indicadores', [I('horas_programadas')]], b: ['RESUMEN', [R('horas_programadas.programada'), R('horas_programadas.emergencia')]] },
  ],
  'cruce-suspendidas': [
    { clave: 'resumen', titulo: 'Suspendidas del RESUMEN', a: ['RESUMEN', [R('suspendidas.programada'), R('suspendidas.emergencia')]], b: ['SUSPENDIDAS', CAUSAS_CELDAS] },
    { clave: 'indicadores', titulo: 'Suspendidas del cuadro de indicadores', a: ['Cuadro de indicadores', [I('intervenciones_suspendidas')]], b: ['SUSPENDIDAS', CAUSAS_CELDAS] },
  ],
  salas: [{ clave: 'salas', titulo: 'Salas utilizadas', a: ['Cuadro de indicadores', [I('salas_utilizadas')]], b: ['Cuadro de indicadores', [I('salas_emergencia'), I('salas_programadas')]] }],
});

/* «Cuadro · Fila» → «Fila»: en la balanza el cuadro ya es el título del lado. */
const etiquetaCorta = (casilla) => {
  const p = partes(casilla);
  return (p.tipo === 'dato' && filaDe(p.cuadro, p.clave)?.rotulo) || etiquetaDe(casilla);
};

function ladoDe([titulo, casillas], datos) {
  const celdas = casillas.map((casilla) => ({ casilla, etiqueta: etiquetaCorta(casilla), valor: leer(datos, casilla).valor }));
  /* Las causas de suspensión son muchas: solo las que tienen cifra. */
  const visibles = casillas.length > 4 ? celdas.filter((c) => c.valor) : celdas;
  return { titulo, celdas: visibles.slice(0, 6), mas: Math.max(0, visibles.length - 6), resultado: sumar(celdas.map((c) => c.valor)) };
}

/* Se muestran las líneas que no cuadran; si ya cuadran todas (se corrigió),
   las que el aviso señalaba, para que se vean en =. Cuando un lado es una
   sola celda, se propone ponerle la cifra del otro; en el cuadro de
   indicadores es la recomendada, porque toma sus cifras del RESUMEN. El
   mismo arreglo no se repite bajo dos líneas. */
function explicarCruce(h, datos, lineas) {
  const cifra = (n) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });
  const todas = lineas.map((l) => ({ l, a: ladoDe(l.a, datos), b: ladoDe(l.b, datos) })).filter((x) => x.a.resultado != null && x.b.resultado != null);
  const difiere = (x) => (x.l.decimal ? Math.abs(x.a.resultado - x.b.resultado) >= 0.05 : x.a.resultado !== x.b.resultado);
  const distintas = todas.filter(difiere);
  const vistas = distintas.length ? distintas : todas.filter((x) => x.l.a[1].every((c) => (h.casillas ?? []).includes(c)));
  if (!vistas.length) return null;
  const causas = [];
  for (const x of distintas) {
    if (x.l.a[1].length !== 1) continue;
    const [casilla] = x.l.a[1];
    // Dos líneas pueden pedir el mismo arreglo (D12 en «realizadas» y en «realizadas = programadas + emergencia»): una vez.
    if (causas.some((c) => c.sugerencia.cambios[casilla] === x.b.resultado)) continue;
    causas.push({
      grupo: x.l.clave,
      recomendada: x.l.a[0] === 'Cuadro de indicadores' && x.l.b[0] === 'RESUMEN',
      texto: `Si «${x.l.b[0]}» está bien, «${x.l.a[0]}» debe decir ${cifra(x.b.resultado)}.`,
      casillas: [casilla],
      sugerencia: { texto: `Poner ${cifra(x.b.resultado)} en ${x.l.a[0]}`, cambios: { [casilla]: x.b.resultado } },
    });
  }
  if (distintas.length) causas.push({ texto: 'Las cifras son correctas y hay un motivo para que difieran: confírmelo.', confirmar: true });
  return {
    cuenta: null,
    conclusion: h.detalle ?? h.titulo,
    comparaciones: vistas.map((x) => ({ clave: x.l.clave, titulo: x.l.titulo, tolerancia: x.l.decimal ? 0.05 : 0, izquierda: x.a, derecha: x.b })),
    causas,
  };
}
