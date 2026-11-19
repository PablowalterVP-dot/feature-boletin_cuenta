/* Reglas del reporte de Laboratorio.

   Una función pura: recibe los datos (definicion.js) y devuelve lo que no
   cumple. Corre igual en el servicio, en el navegador (modo embebido) y en la
   prueba. Mismos tres niveles que Nutrición:
     error  impide enviar. Lo que no cuadra no sale del área.
     aviso  no impide enviar, pero exige una justificación escrita.
     info   lo que conviene saber y no exige nada.

   Cada hallazgo lleva `formato` (la sección) y, si es de una casilla, `fila`
   (`examen.procedencia`): con eso la API lo ata a su cuadro y a su indicador.
   Su `id` es único en el informe, que es lo que la base exige por carga.

   Los totales que el Excel trae escritos no son dato: se comparan con la suma
   de lo que sí es dato. Si falta una casilla de la suma, no se compara: el
   descuadre ya lo dice `incompleto`, y otra alarma por lo mismo confunde.

   Un descuadre lleva además su `evidencia`: el total escrito y cada sumando,
   con la casilla de donde salió (`claveCasilla` o `claveEscrita`), su rótulo
   y su cifra. Con eso la pantalla de corrección señala las celdas y Dr. Mochi
   explica la cuenta (correccion.js) sin volver a calcular nada por su lado. */

import { CUADROS, SECCIONES, cuadro, filaDe, claveCasilla, claveEscrita, claveFila, procedencia, subtotalesDelMes, examenesDeLaFilaTotal } from './definicion.js';
import { valor, sumar, filasDelMes, totalCuadro, totalExamen } from './calculos.js';

export const REGLAS = Object.freeze([
  { id: 'fila-no-catalogada', nivel: 'error', texto: 'Cada fila con cifras del Excel es un examen del reporte' },
  { id: 'incompleto', nivel: 'error', texto: 'Todas las casillas tienen un dato (sin atenciones se anota 0)' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda casilla de datos es un número' },
  { id: 'entero', nivel: 'error', texto: 'Las atenciones son números enteros, sin signo' },
  { id: 'total-fila', nivel: 'error', texto: 'Para cada examen, la columna TOTAL coincide con la suma de las procedencias' },
  { id: 'total-seccion', nivel: 'error', texto: 'La fila TOTAL de cada sección coincide con la suma de sus exámenes' },
  { id: 'total-patologia', nivel: 'error', texto: 'El TOTAL DE EXAMENES LABORATORIO coincide con la suma de las cinco secciones de Patología Clínica' },
  { id: 'total-general', nivel: 'error', texto: 'El TOTAL GENERAL DE ATENCIONES coincide con la suma de todas las secciones' },
  { id: 'seccion-vacia', nivel: 'aviso', texto: 'Ninguna sección reporta cero en todas sus casillas' },
  { id: 'anio-no-escrito', nivel: 'aviso', texto: 'La hoja del mes dice de qué año es' },
  { id: 'filas-ausentes', nivel: 'info', texto: 'El Excel trae todos los exámenes del reporte' },
  { id: 'hoja-leida', nivel: 'info', texto: 'Se lee solo la hoja del mes que se reporta' },
  { id: 'total-patologia-amplio', nivel: 'info', texto: 'El TOTAL DE EXAMENES LABORATORIO suma solo Patología Clínica' },
]);

/* Qué hace cada hallazgo del lector (lector.js), según su regla. */
const NIVEL_DE_LECTURA = Object.freeze({ 'fila-no-catalogada': 'error', 'anio-no-escrito': 'aviso', 'hoja-leida': 'info', 'hoja-copia': 'info' });

const IZQUIERDA = CUADROS.filter((c) => c.bloque === 'izquierda');

function donde(idCuadro, clave) {
  const f = filaDe(idCuadro, clave);
  return `${cuadro(idCuadro).titulo} · ${f.examenLabel} · ${f.procedenciaLabel}`;
}

const diferencia = (escrito, suma) => (escrito > suma ? `${escrito - suma} de más` : `${suma - escrito} de menos`);

/* La evidencia de un descuadre. En un sumando calculado (el total de una
   sección o de un examen), `casillas` son las casillas que lo forman y
   `total`, la celda donde el Excel trae ese total: la que se muestra. */
const evidencia = (total, sumandos, suma) => ({ total, sumandos, suma, diferencia: total.valor - suma });

/* Un examen como sumando: su total calculado, con las casillas que lo forman. */
const examenComoSumando = (datos, c, e) => ({
  etiqueta: e.etiqueta,
  valor: totalExamen(datos, c.id, e.clave),
  calculado: true,
  total: claveEscrita('fila', c.id, e.clave),
  casillas: c.procedencias.map((p) => claveCasilla(c.id, claveFila(e.clave, p.clave))),
});

/* Una sección como sumando: su total calculado. */
const seccionComoSumando = (datos, c) => ({
  etiqueta: c.titulo,
  valor: totalCuadro(datos, c.id),
  calculado: true,
  total: claveEscrita('declarado', c.id),
  casillas: filasDelMes(datos, c.id).map((f) => claveCasilla(c.id, f.clave)),
});

export function validar(datos) {
  const errores = [];
  const avisos = [];
  const info = [];

  for (const h of datos?.lectura ?? []) {
    const nivel = NIVEL_DE_LECTURA[h.regla];
    if (nivel === 'error') errores.push(h);
    else if (nivel === 'aviso') avisos.push(h);
    else if (nivel === 'info') info.push(h);
  }

  const escritos = datos?.escritos ?? {};
  let todoCompleto = true;

  for (const c of CUADROS) {
    const filas = filasDelMes(datos, c.id);
    const faltan = [];

    const ausentes = datos?.ausentes?.[c.id] ?? [];
    /* Un examen ocasional que el mes no trae no se informa: no se ofreció. */
    const informados = ausentes.filter((e) => !c.examenes.find((x) => x.clave === e)?.ocasional);
    if (informados.length) {
      const nombres = informados.map((e) => c.examenes.find((x) => x.clave === e)?.etiqueta ?? e);
      info.push({
        id: `filas-ausentes|${c.id}`, regla: 'filas-ausentes', formato: c.id,
        titulo: `${c.titulo}: el Excel no trae ${informados.length === 1 ? 'un examen' : `${informados.length} exámenes`} del reporte`,
        detalle: `${nombres.join(', ')}. Se toman como no registrados este mes, no como cero.`,
      });
    }

    for (const f of filas) {
      const v = valor(datos, c.id, f.clave);
      const ilegible = datos?.ilegibles?.[claveCasilla(c.id, f.clave)];
      if (v == null && ilegible != null) {
        errores.push({
          id: `no-numerico|${c.id}|${f.clave}`, regla: 'no-numerico', formato: c.id, fila: f.clave,
          titulo: `«${ilegible}» no es un número`,
          detalle: `${donde(c.id, f.clave)}. Corrija la casilla en el Excel y súbalo otra vez.`,
        });
      } else if (v == null) {
        faltan.push(f);
      } else if (!Number.isInteger(v) || v < 0) {
        errores.push({
          id: `entero|${c.id}|${f.clave}`, regla: 'entero', formato: c.id, fila: f.clave,
          titulo: `${v} no es una cantidad válida`,
          detalle: `${donde(c.id, f.clave)}. Se cuentan en enteros y no pueden ser negativas.`,
        });
      }
    }

    /* Casillas vacías: un solo error por sección, con la lista, en lugar de
       uno por casilla. */
    if (faltan.length) {
      todoCompleto = false;
      const muestra = faltan.slice(0, 4).map((f) => `${f.examenLabel} · ${f.procedenciaLabel}`);
      errores.push({
        id: `incompleto|${c.id}`, regla: 'incompleto', formato: c.id, fila: faltan[0].clave, casillas: faltan.map((f) => f.clave),
        titulo: faltan.length === filas.length ? `${c.titulo}: la sección está vacía` : `${c.titulo}: ${faltan.length === 1 ? 'falta 1 casilla' : `faltan ${faltan.length} casillas`}`,
        detalle: `${muestra.join('; ')}${faltan.length > 4 ? '…' : ''}. Si no hubo atenciones, escriba 0.`,
      });
    }

    const completo = (valores) => valores.every((v) => v != null);

    for (const e of c.examenes) {
      if (ausentes.includes(e.clave)) continue;
      const escrito = escritos.filas?.[`${c.id}|${e.clave}`];
      const valores = c.procedencias.map((p) => valor(datos, c.id, claveFila(e.clave, p.clave)));
      if (escrito == null || !completo(valores)) continue;
      const suma = sumar(valores);
      if (escrito !== suma) {
        errores.push({
          id: `total-fila|${c.id}|${e.clave}`, regla: 'total-fila', formato: c.id, fila: claveFila(e.clave, c.procedencias[0].clave),
          titulo: `${e.etiqueta}: la columna TOTAL dice ${escrito} y las procedencias suman ${suma}`,
          detalle: `${c.titulo}. El total tiene ${diferencia(escrito, suma)}: es la suma de las procedencias, no se digita aparte.`,
          evidencia: evidencia(
            { casilla: claveEscrita('fila', c.id, e.clave), etiqueta: `${e.etiqueta} · TOTAL`, valor: escrito },
            c.procedencias.map((p, i) => ({ casilla: claveCasilla(c.id, claveFila(e.clave, p.clave)), etiqueta: p.label, valor: valores[i] })),
            suma,
          ),
        });
      }
    }

    /* La fila de total de la sección y, si la hoja los trae, sus subtotales:
       cada una con los exámenes que suma. */
    const filasDeTotal = [
      { examenes: examenesDeLaFilaTotal(datos, c.id), rotulo: SECCIONES.find((s) => s.id === c.id).etiquetaTotal, nombre: 'TOTAL', escrito: (p) => escritos.secciones?.[`${c.id}|${p}`], casilla: (p) => claveEscrita('seccion', c.id, p), id: (p) => `${c.id}|${p}` },
      ...subtotalesDelMes(datos, c.id).map((st) => ({
        examenes: c.examenes.filter((e) => st.examenes.includes(e.clave)),
        rotulo: st.etiqueta,
        nombre: `«${st.etiqueta}»`,
        escrito: (p) => escritos.subtotales?.[`${c.id}|${st.id}|${p}`],
        casilla: (p) => claveEscrita('subtotal', c.id, `${st.id}.${p}`),
        id: (p) => `${c.id}|${st.id}|${p}`,
      })),
    ];
    for (const t of filasDeTotal) {
      for (const p of c.procedencias) {
        const escrito = t.escrito(p.clave);
        const presentes = t.examenes.filter((e) => !ausentes.includes(e.clave));
        const valores = presentes.map((e) => valor(datos, c.id, claveFila(e.clave, p.clave)));
        if (escrito == null || !completo(valores)) continue;
        const suma = sumar(valores) ?? 0;
        if (escrito !== suma) {
          errores.push({
            id: `total-seccion|${t.id(p.clave)}`, regla: 'total-seccion', formato: c.id,
            titulo: `${c.titulo} · ${procedencia(p.clave).label}: la fila ${t.nombre} dice ${escrito} y los exámenes suman ${suma}`,
            detalle: `La fila «${t.rotulo}» tiene ${diferencia(escrito, suma)} en esa procedencia.`,
            evidencia: evidencia(
              { casilla: t.casilla(p.clave), etiqueta: `${c.titulo} · ${t.rotulo} · ${procedencia(p.clave).label}`, valor: escrito },
              presentes.map((e, i) => ({ casilla: claveCasilla(c.id, claveFila(e.clave, p.clave)), etiqueta: e.etiqueta, valor: valores[i] })),
              suma,
            ),
          });
        }
      }
    }

    const declarado = datos?.declarados?.[c.id]?._total;
    const sumaCuadro = totalCuadro(datos, c.id);
    const yaDescuadra = errores.some((e) => (e.regla === 'total-seccion' || e.regla === 'total-fila') && e.formato === c.id);
    if (!faltan.length && !yaDescuadra && declarado != null && sumaCuadro != null && declarado !== sumaCuadro) {
      errores.push({
        id: `total-seccion|${c.id}|total`, regla: 'total-seccion', formato: c.id,
        titulo: `${c.titulo}: el TOTAL de la sección dice ${declarado} y sus casillas suman ${sumaCuadro}`,
        detalle: `Tiene ${diferencia(declarado, sumaCuadro)}.`,
        evidencia: evidencia(
          { casilla: claveEscrita('declarado', c.id), etiqueta: `${c.titulo} · TOTAL`, valor: declarado },
          c.examenes.filter((e) => !ausentes.includes(e.clave)).map((e) => examenComoSumando(datos, c, e)),
          sumaCuadro,
        ),
      });
    }

    /* Toda la sección en cero (no vacía: con ceros escritos). Puede ser real
       —un servicio que no operó ese mes— o un Excel copiado sin llenar. */
    const conDato = filas.map((f) => valor(datos, c.id, f.clave)).filter((v) => v != null);
    // Un mes sin actividades de programación es plausible: no se pide explicarlo.
    if (c.id !== 'actividades' && filas.length && conDato.length === filas.length && conDato.every((v) => v === 0)) {
      avisos.push({
        id: `seccion-vacia|${c.id}`, regla: 'seccion-vacia', formato: c.id,
        titulo: `${c.titulo}: ninguna atención en todo el mes`,
        detalle: 'Todas sus casillas están en 0. Si la sección no operó, diga por qué; si es un error, corrija el Excel.',
      });
    }
  }

  /* La fila «TOTAL DE EXAMENES LABORATORIO». Desde abril de 2026 suma las cinco
     secciones de Patología Clínica; de enero a marzo sumaba también Anatomía
     Patológica, Metaxénicas y Banco de Sangre (verificado en el libro del
     área). Las dos son sumas correctas: la amplia se informa, no se bloquea. */
  const patologia = escritos.patologia?.total;
  const sumaPatologia = sumar(IZQUIERDA.map((c) => totalCuadro(datos, c.id)));
  const sumaDepartamento = sumar(CUADROS.filter((c) => c.id !== 'actividades').map((c) => totalCuadro(datos, c.id)));
  if (todoCompleto && patologia != null && patologia === sumaDepartamento && patologia !== sumaPatologia) {
    info.push({
      id: 'total-patologia-amplio', regla: 'total-patologia-amplio',
      titulo: 'El TOTAL DE EXAMENES LABORATORIO de este mes suma todo el departamento',
      detalle: `Dice ${patologia}: las cinco secciones de Patología Clínica (${sumaPatologia}) más Anatomía Patológica, Metaxénicas y Banco de Sangre. Así se llevaba de enero a marzo de 2026; desde abril suma solo Patología Clínica.`,
    });
  } else if (todoCompleto && patologia != null && sumaPatologia != null && patologia !== sumaPatologia) {
    errores.push({
      id: 'total-patologia', regla: 'total-patologia',
      titulo: `El TOTAL DE EXAMENES LABORATORIO dice ${patologia} y las cinco secciones de Patología Clínica suman ${sumaPatologia}`,
      detalle: `Tiene ${diferencia(patologia, sumaPatologia)}. Es la suma de Bioquímica, Hematología, Microbiología, Uro-Parasitológicos e Inmuno-Serológicos.`,
      evidencia: evidencia(
        { casilla: claveEscrita('patologia', 'total'), etiqueta: 'TOTAL DE EXAMENES LABORATORIO', valor: patologia },
        IZQUIERDA.map((c) => seccionComoSumando(datos, c)),
        sumaPatologia,
      ),
    });
  }

  const general = escritos.general;
  const suma = sumar(CUADROS.map((c) => totalCuadro(datos, c.id)));
  if (todoCompleto && general != null && suma != null && general !== suma) {
    errores.push({
      id: 'total-general', regla: 'total-general',
      titulo: `El TOTAL GENERAL DE ATENCIONES dice ${general} y las secciones suman ${suma}`,
      detalle: `Tiene ${diferencia(general, suma)}. Es la suma de todas las secciones.`,
      evidencia: evidencia(
        { casilla: claveEscrita('general'), etiqueta: 'TOTAL GENERAL DE ATENCIONES', valor: general },
        CUADROS.map((c) => seccionComoSumando(datos, c)),
        suma,
      ),
    });
  }

  return { errores, avisos, info };
}

/* Avisos sin justificar: cada aviso exige una explicación antes de enviar. */
export function avisosPendientes(validacion, datos) {
  return validacion.avisos.filter((a) => !(datos?.justificaciones?.[a.id] ?? '').trim());
}
