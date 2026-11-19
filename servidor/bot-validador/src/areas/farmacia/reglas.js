/* Reglas del reporte de Farmacia.

   Una función pura: recibe los datos (definicion.js) y devuelve lo que no
   cumple. Corre igual en el servicio, en el navegador y en la prueba de humo,
   y la usan tanto la carga del Word como el formulario del sistema: las dos
   vías dicen siempre lo mismo. Tres niveles, como en las demás áreas:
     error  impide enviar. Lo que no cuadra no sale del área.
     aviso  no impide enviar, pero hay que revisarlo y aceptarlo.
     info   lo que conviene saber y no exige nada.

   Las reglas R1 a R10 son las de `Documentacion_Modulo_Farmacia_HRL`, § 8.
   R1 a R4 no pueden fallar: los totales se calculan (calculos.js). R7 y R8
   son avisos a propósito: dependen de que Sala de Operaciones esté incluida
   en Hospitalización, y eso no está confirmado.

   Del Word salen además tres reglas propias del archivo:
     totales      cada total escrito en el Word (`datos.escritos`, como en
                  Laboratorio) cuadra con la suma de sus partes. Si no, el informe está mal sumado o mal copiado.
     no-numerico  ninguna celda de cifras trae texto.
     rotulos      los títulos del Word dicen el mes y el año del reporte. El
                  de enero de 2026 decía «ENERO 2024» y «DICIEMBRE - 2023»:
                  no cambia ninguna cifra, porque el periodo sale del reporte
                  abierto, pero el documento impreso quedaría mal.

   Una regla que no se puede evaluar por falta de datos no se da por cumplida
   ni por incumplida: no se evalúa.

   Un descuadre lleva su `evidencia` (la casilla del total y las de sus
   sumandos) y una cifra mal escrita, su casilla: con eso la corrección
   guiada señala las celdas del Word y Dr. Mochi explica la cuenta. */

import { COMPONENTES_SIS, COMPONENTES_CONVENIO, OTROS_FINANCIADORES, SERVICIOS_SOP, FILAS } from './definicion.js';
import { etiquetaDe, leer } from './correccion.js';
import { etiquetaPeriodo } from '../../periodos.js';
import {
  anidar,
  totalSis,
  totalConvenios,
  totalOtras,
  totalAtenciones,
  valoresF1,
  hospitalizadosFila,
  hospitalizadosServicio,
  totalHospitalizadosSop,
  totalConveniosSop,
  totalSop,
  valoresF2,
  totalConsultasF3,
  totalConveniosF3,
  totalF3,
  valoresF3,
} from './calculos.js';

export const REGLAS = Object.freeze([
  { id: 'formato-vacio', nivel: 'error', texto: 'Los formatos 1, 2 y 3 tienen cifras registradas (sin atenciones se anota 0)' },
  { id: 'r5', nivel: 'error', texto: 'R5 · Las consultas del Formato 3 cuadran con la Consulta externa SIS del Formato 1' },
  { id: 'r6', nivel: 'error', texto: 'R6 · Los convenios del Formato 3 cuadran con los de consultorio del Formato 1' },
  { id: 'r7', nivel: 'aviso', texto: 'R7 · Los hospitalizados de Sala de Operaciones no superan la Hospitalización SIS (supuesto por confirmar)' },
  { id: 'r8', nivel: 'aviso', texto: 'R8 · Los convenios de Sala de Operaciones no superan los de hospitalizados (supuesto por confirmar)' },
  { id: 'r9', nivel: 'error', texto: 'R9 · Todas las cifras son enteros mayores o iguales a cero' },
  { id: 'r10', nivel: 'error', texto: 'R10 · El periodo del informe es el del reporte abierto' },
  { id: 'totales', nivel: 'error', texto: 'Cada total escrito en el Word cuadra con la suma de sus partes' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda celda de cifras del Word es un número' },
  { id: 'blancos', nivel: 'aviso', texto: 'Ninguna casilla queda en blanco (una casilla vacía se suma como cero)' },
  { id: 'rotulos', nivel: 'aviso', texto: 'Los títulos del Word dicen el mes y el año del reporte' },
  { id: 'no-encontrado', nivel: 'aviso', texto: 'El Word trae todos los rótulos del resumen' },
  { id: 'resumen-imagen', nivel: 'aviso', texto: 'El resumen viene como tabla de Word, no pegado como imagen' },
  { id: 'copiado', nivel: 'aviso', texto: 'Sala de Operaciones y Consultorios no son una copia del mes anterior' },
  { id: 'lectura', nivel: 'info', texto: 'Lo que el bot decidió al leer el Word' },
]);

/* Qué hace cada hallazgo del lector (lector.js), según su regla. */
const NIVEL_DE_LECTURA = Object.freeze({ rotulos: 'aviso', 'no-encontrado': 'aviso', 'resumen-imagen': 'aviso', lectura: 'info' });

const cifra = (n) => (n == null ? 'sin registrar' : n.toLocaleString('es-PE', { maximumFractionDigits: 2 }));
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const enBlanco = (valores) => (valores.some((v) => v != null) ? valores.filter((v) => v == null).length : 0);

/* Las casillas de cada formato, en el orden de valoresF1, F2 y F3: el aviso de
   blancos dice CUÁLES están en blanco, para que la corrección las muestre y
   proponga ponerles 0 (22/10/2026; antes solo las contaba). */
const CASILLAS = {
  f1: [...COMPONENTES_SIS.map((c) => `f1|sis.${c.clave}`), ...COMPONENTES_CONVENIO.map((c) => `f1|convenio.${c.clave}`), ...OTROS_FINANCIADORES.map((o) => `f1|otros.${o.clave}`)],
  f2: FILAS.flatMap((f) => [...SERVICIOS_SOP.map((s) => `f2|hospitalizados.${f.clave}.${s.clave}`), `f2|convenios.${f.clave}`]),
  f3: FILAS.flatMap((f) => [`f3|consultas.${f.clave}`, `f3|convenios.${f.clave}`]),
};
const noEsEnteroValido = (v) => v != null && (!Number.isInteger(v) || v < 0);

/* Las casillas que forman cada total. Hemodiálisis y oncología entran por
   sus dos mitades cuando el Word las trae partidas. */
function casillasSis(datos) {
  return COMPONENTES_SIS.flatMap((c) => {
    const partes = ['ce', 'hosp'].map((l) => `${c.clave}.${l}`).filter((k) => datos?.escritos?.partes?.[k] != null);
    return partes.length ? partes.map((k) => `parte|${k}`) : [`f1|sis.${c.clave}`];
  });
}
const CONVENIOS = COMPONENTES_CONVENIO.map((c) => `f1|convenio.${c.clave}`);
const OTROS = OTROS_FINANCIADORES.map((o) => `f1|otros.${o.clave}`);
const MATRIZ = FILAS.flatMap((f) => SERVICIOS_SOP.map((s) => `f2|hospitalizados.${f.clave}.${s.clave}`));
const CASILLAS_F1 = [...COMPONENTES_SIS.map((c) => `f1|sis.${c.clave}`), ...CONVENIOS, ...OTROS];
const CASILLAS_F2 = FILAS.flatMap((f) => [...SERVICIOS_SOP.map((s) => `f2|hospitalizados.${f.clave}.${s.clave}`), `f2|convenios.${f.clave}`]);
const CASILLAS_F3 = FILAS.flatMap((f) => [`f3|consultas.${f.clave}`, `f3|convenios.${f.clave}`]);

const evidencia = (datos, total, declarado, casillas, suma) => ({
  total: { casilla: total, etiqueta: etiquetaDe(total), valor: declarado },
  sumandos: casillas.map((c) => ({ casilla: c, etiqueta: etiquetaDe(c), valor: leer(datos, c).valor })),
  suma,
  diferencia: declarado - suma,
});

/* Los totales escritos en el Word, cada uno con lo que debería valer. */
function comparacionesDeTotales(datos) {
  const d = datos?.escritos;
  if (!d) return [];
  const { f1 = {}, f2 = {}, f3 = {} } = datos;
  const lista = [];
  /* `concepto` agrupa los lugares del Word que escriben la misma cifra: un
     componente mal copiado descuadra a la vez el total SIS, el resumen y el
     total final, y eso es un solo problema, no cinco. */
  /* `casilla` es la del total escrito y `sumandos`, las que lo forman. */
  const agregar = (formato, concepto, rotulo, declarado, calculado, casilla, sumandos) => {
    if (declarado != null) lista.push({ formato, concepto, rotulo, declarado, calculado, casilla, sumandos });
  };
  const sis = casillasSis(datos);
  const todas = [...sis, ...CONVENIOS, ...OTROS];

  agregar('f1', 'sis', '«Total de Atenciones por SIS»', d.f1?.totalSis, totalSis(f1), 'escrito|f1.totalSis', sis);
  agregar('f1', 'otras', '«Total» de Otras Atenciones', d.f1?.totalOtras, totalOtras(f1), 'escrito|f1.totalOtras', [...CONVENIOS, ...OTROS]);
  agregar('f1', 'atenciones', '«TOTAL ATENCIONES» del resumen', d.f1?.totalAtenciones, totalAtenciones(f1), 'escrito|f1.totalAtenciones', todas);
  agregar('f1', 'atenciones', '«TOTAL ATENCIONES» del final del informe', d.f1?.totalFinal, totalAtenciones(f1), 'escrito|f1.totalFinal', todas);

  /* Las unidades de farmacia repiten tres cifras del SIS. */
  for (const c of COMPONENTES_SIS.filter((x) => x.diresa)) {
    agregar('f1', `unidades-${c.clave}`, `«${c.label}» en Total de recetas por las unidades de farmacia`, d.f1?.unidades?.[c.clave], f1.sis?.[c.clave] ?? null, `escrito|f1.unidades.${c.clave}`, [`f1|sis.${c.clave}`]);
  }

  /* El cuadro «ATENCIONES MES …» repite el resumen por financiador. */
  const r = d.f1?.resumen ?? {};
  agregar('f1', 'sis', '«S.I.S.» del cuadro de atenciones del mes', r.sis, totalSis(f1), 'escrito|f1.resumen.sis', sis);
  agregar('f1', 'convenios', '«CONVENIOS» del cuadro de atenciones del mes', r.convenios, totalConvenios(f1), 'escrito|f1.resumen.convenios', CONVENIOS);
  for (const [clave, rotulo] of [['programas', 'PROGRAMAS'], ['boletas', 'BOLETAS DE VENTA'], ['credito', 'CREDITO PERSONAL'], ['defensa', 'DEFENSA NACIONAL'], ['insolvencias', 'INSOLVENCIAS']]) {
    agregar('f1', clave, `«${rotulo}» del cuadro de atenciones del mes`, r[clave], f1.otros?.[clave] ?? null, `escrito|f1.resumen.${clave}`, [`f1|otros.${clave}`]);
  }
  agregar('f1', 'atenciones', '«TOTAL ATENCIONES» del cuadro de atenciones del mes', r.total, totalAtenciones(f1), 'escrito|f1.resumen.total', todas);

  for (const f of FILAS) {
    agregar('f2', `fila-${f.clave}`, `«TOTAL SOP HOSP» de la ${f.label.toLowerCase()}`, d.f2?.filas?.[f.clave], hospitalizadosFila(f2, f.clave), `escrito|f2.filas.${f.clave}`, SERVICIOS_SOP.map((s) => `f2|hospitalizados.${f.clave}.${s.clave}`));
  }
  for (const s of SERVICIOS_SOP) {
    agregar('f2', `servicio-${s.clave}`, `fila de totales de Sala de Operaciones, columna ${s.label}`, d.f2?.servicios?.[s.clave], hospitalizadosServicio(f2, s.clave), `escrito|f2.servicios.${s.clave}`, FILAS.map((f) => `f2|hospitalizados.${f.clave}.${s.clave}`));
  }
  agregar('f2', 'hospitalizados', 'fila de totales, columna «TOTAL SOP HOSP»', d.f2?.hospitalizados, totalHospitalizadosSop(f2), 'escrito|f2.hospitalizados', MATRIZ);
  agregar('f2', 'convenios-sop', 'fila de totales, columna «CONVENIOS» de Sala de Operaciones', d.f2?.convenios, totalConveniosSop(f2), 'escrito|f2.convenios', FILAS.map((f) => `f2|convenios.${f.clave}`));
  agregar('f3', 'consultas-ce', 'fila de totales, columna «CONSULTAS EXTERNAS»', d.f3?.consultas, totalConsultasF3(f3), 'escrito|f3.consultas', FILAS.map((f) => `f3|consultas.${f.clave}`));
  agregar('f3', 'convenios-ce', 'fila de totales, columna «CONVENIOS» de Consultorios externos', d.f3?.convenios, totalConveniosF3(f3), 'escrito|f3.convenios', FILAS.map((f) => `f3|convenios.${f.clave}`));
  return lista;
}

export function validar(datosRecibidos, periodo) {
  const datos = anidar(datosRecibidos);
  const { f1 = {}, f2 = {}, f3 = {} } = datos ?? {};
  const errores = [];
  const avisos = [];
  const info = [];
  const hallazgo = (nivel, id, regla, titulo, detalle, extra = {}) => {
    const h = { id, regla, formato: id.slice(0, 2), ...(nivel === 'aviso' ? { nivel } : {}), titulo, detalle, ...extra };
    (nivel === 'error' ? errores : nivel === 'aviso' ? avisos : info).push(h);
  };

  for (const h of datos?.lectura ?? []) {
    const nivel = NIVEL_DE_LECTURA[h.regla];
    if (nivel === 'aviso') avisos.push({ ...h, nivel: 'aviso' });
    else if (nivel === 'info') info.push(h);
  }

  /* R10 · El periodo sale del reporte abierto. Con el formulario no hay otro
     periodo que lo contradiga; con el Word, el lector deja en
     `periodoDocumento` el del asunto. */
  if (datos?.periodoDocumento && periodo && datos.periodoDocumento !== periodo) {
    hallazgo('error', 'f1-periodo', 'r10', 'El periodo del informe no es el del reporte', `El informe dice ${datos.periodoDocumento}; el reporte abierto es ${periodo}.`);
  }

  /* No numérico · una celda del Word con texto donde va una cifra. */
  const ilegibles = Object.entries(datos?.ilegibles ?? {});
  for (const [clave, texto] of ilegibles) {
    /* La clave es la del servidor: `f1|sis.hosp`. */
    hallazgo('error', `${clave.slice(0, 2)}-ilegible-${clave.replace('|', '.')}`, 'no-numerico', `Una celda del Word no es un número: «${texto}»`, `Celda de ${clave.slice(3).replaceAll('.', ' · ')}. Escriba la cifra en el Word y vuelva a subirlo, o digítela aquí.`, { fila: clave.slice(3) });
  }

  /* R9 · Toda cifra es un entero mayor o igual a cero. */
  /* Uno por casilla, empezando por la cifra: la corrección guiada la lee del
     título y la trata como la regla de los enteros (`correccion`). */
  for (const casilla of [...CASILLAS_F1, ...CASILLAS_F2, ...CASILLAS_F3]) {
    const v = leer(datos, casilla).valor;
    if (!noEsEnteroValido(v)) continue;
    const [id, ruta] = casilla.split('|');
    hallazgo('error', `${id}-enteros-${ruta}`, 'r9', `${v} en ${etiquetaDe(casilla)} no es un entero sin signo`, 'Se cuentan atenciones: no hay medias atenciones ni atenciones negativas.', { fila: ruta, correccion: 'entero' });
  }

  /* Formatos vacíos y casillas en blanco. */
  if (totalAtenciones(f1) == null) {
    hallazgo('error', 'f1-vacio', 'formato-vacio', 'El Formato 1 no tiene atenciones registradas', 'Registre las atenciones SIS, de convenios y de los demás financiadores. Si un concepto no tuvo atenciones, escriba 0: una casilla vacía no distingue un cero de un olvido.');
  }
  if (totalSop(f2) == null) {
    hallazgo('error', 'f2-vacio', 'formato-vacio', 'El Formato 2 no tiene atenciones registradas', 'Registre la matriz de Sala de Operaciones. Si no hubo atenciones, escriba 0.');
  }
  if (totalF3(f3) == null) {
    hallazgo('error', 'f3-vacio', 'formato-vacio', 'El Formato 3 no tiene consultas registradas', 'Registre las consultas SIS y los convenios de Consultorios externos. Si no hubo, escriba 0.');
  }
  for (const [id, nombre, valores, ayuda] of [
    ['f1', 'el Formato 1', valoresF1(f1), 'Si el valor es cero, escríbalo: en el informe de enero, crédito personal, Defensa Nacional e insolvencias figuran con 0.'],
    ['f2', 'Sala de Operaciones', valoresF2(f2), 'Si el valor es cero, conviene escribirlo.'],
    ['f3', 'Consultorios externos', valoresF3(f3), 'Si el valor es cero, conviene escribirlo.'],
  ]) {
    const n = enBlanco(valores);
    if (n) {
      const casillas = CASILLAS[id].filter((_, i) => valores[i] == null);
      hallazgo('aviso', `${id}-blancos`, 'blancos', `${plural(n, 'casilla en blanco', 'casillas en blanco')} en ${nombre}`, `Se suman como si fueran cero. ${ayuda}`, { casillas });
    }
  }

  /* R7 · Hospitalizados de Sala de Operaciones ≤ Hospitalización SIS. */
  const hospSop = totalHospitalizadosSop(f2);
  const hospSis = f1.sis?.hosp ?? null;
  if (hospSop != null && hospSis != null && hospSop > hospSis) {
    hallazgo('aviso', 'f2-hospitalizacion', 'r7', 'Sala de Operaciones tiene más hospitalizados que la Hospitalización SIS del Formato 1', `Sala de Operaciones: ${cifra(hospSop)}. Hospitalización SIS: ${cifra(hospSis)}. Solo es un error si Sala de Operaciones está incluida en Hospitalización, y eso está por confirmar con el área.`);
  }

  /* R8 · Convenios de Sala de Operaciones ≤ convenios de hospitalizados. */
  const convSop = totalConveniosSop(f2);
  const convHosp = f1.convenio?.hosp ?? null;
  if (convSop != null && convHosp != null && convSop > convHosp) {
    hallazgo('aviso', 'f2-convenios', 'r8', 'Sala de Operaciones tiene más convenios que los convenios de hospitalizados del Formato 1', `Sala de Operaciones: ${cifra(convSop)}. Convenios de hospitalizados: ${cifra(convHosp)}. Supuesto por confirmar: solo es un error si Sala de Operaciones forma parte de hospitalizados.`);
  }

  /* R5 · Consultas del Formato 3 = Consulta externa SIS del Formato 1. */
  const consultas = totalConsultasF3(f3);
  const ceSis = f1.sis?.ce ?? null;
  if (consultas != null && ceSis != null && consultas !== ceSis) {
    hallazgo('error', 'f3-consultas', 'r5', 'Las consultas del Formato 3 no cuadran con la Consulta externa del Formato 1', `Formato 3: ${cifra(consultas)}. Consulta externa SIS en el Formato 1: ${cifra(ceSis)}. Las dos cifras cuentan las mismas atenciones, así que una de las dos está mal.`, { evidencia: evidencia(datos, 'f1|sis.ce', ceSis, FILAS.map((f) => `f3|consultas.${f.clave}`), consultas) });
  }

  /* R6 · Convenios del Formato 3 = convenios de consultorio del Formato 1. */
  const conveniosF3 = totalConveniosF3(f3);
  const convConsultorio = f1.convenio?.consultorio ?? null;
  if (conveniosF3 != null && convConsultorio != null && conveniosF3 !== convConsultorio) {
    hallazgo('error', 'f3-convenios', 'r6', 'Los convenios del Formato 3 no cuadran con los de consultorio del Formato 1', `Formato 3: ${cifra(conveniosF3)}. Convenios de consultorio en el Formato 1: ${cifra(convConsultorio)}.`, { evidencia: evidencia(datos, 'f1|convenio.consultorio', convConsultorio, FILAS.map((f) => `f3|convenios.${f.clave}`), conveniosF3) });
  }

  /* Totales escritos en el Word. Si falta un sumando, no se compara: la
     casilla en blanco ya tiene su aviso. */
  const descuadres = new Map();
  for (const c of comparacionesDeTotales(datos)) {
    if (c.calculado == null || c.declarado === c.calculado) continue;
    if (!descuadres.has(c.concepto)) descuadres.set(c.concepto, []);
    descuadres.get(c.concepto).push(c);
  }
  for (const [concepto, lugares] of descuadres) {
    const [c] = lugares;
    const dif = c.declarado - c.calculado;
    const otros = lugares.slice(1).map((x) => `${x.rotulo} (${cifra(x.declarado)})`);
    hallazgo(
      'error',
      `${c.formato}-total-${concepto}`,
      'totales',
      `El Word dice ${cifra(c.declarado)} en ${c.rotulo}, pero sus partes suman ${cifra(c.calculado)}`,
      `${Math.abs(dif).toLocaleString('es-PE')} ${dif > 0 ? 'de más' : 'de menos'}.${otros.length ? ` La misma cifra se repite en ${otros.join(' y ')}.` : ''} Corrija el total o la cifra que lo descuadra en el Word y vuelva a subirlo; si corrige aquí una casilla, los totales del Word dejan de compararse.`,
      { declarado: c.declarado, calculado: c.calculado, evidencia: evidencia(datos, c.casilla, c.declarado, c.sumandos, c.calculado) },
    );
  }

  return { errores, avisos, info };
}

/* Un cuadro copiado del mes anterior (julio de 2026: Sala de Operaciones y
   Consultorios externos traían, casilla por casilla, las cifras de junio). Se
   compara con el último mes que Farmacia ENTREGÓ, el mismo que usa la
   variación: si las cuarenta casillas de los formatos 2 y 3 son idénticas, es
   casi seguro un cuadro que no se actualizó. Aviso, no error: un mes
   idéntico es posible, pero hay que confirmarlo. */
export function frenteAlAnterior(datosRecibidos, periodo, anterior) {
  const datos = anidar(datosRecibidos);
  const previos = anidar(anterior?.datos);
  if (!previos) return [];
  const actual = [...valoresF2(datos?.f2), ...valoresF3(datos?.f3)];
  const previo = [...valoresF2(previos.f2), ...valoresF3(previos.f3)];
  const conCifras = actual.filter((v) => v != null && v !== 0).length;
  if (conCifras < 5 || actual.some((v, i) => v !== previo[i])) return [];
  const mes = etiquetaPeriodo(anterior.periodo).toLowerCase();
  return [
    {
      id: 'f2-copiado', regla: 'copiado', formato: 'f2', nivel: 'aviso',
      titulo: `Sala de Operaciones y Consultorios externos son idénticos a ${mes}`,
      detalle: `Las ${actual.length} casillas de los formatos 2 y 3 traen exactamente las cifras de ${mes} (consultas externas: ${cifra(totalConsultasF3(datos?.f3))}). Lo más probable es que el cuadro no se actualizara. Pegue en el Word el cuadro de este mes; si de verdad se repitieron todas las cifras, confírmelo.`,
    },
  ];
}
