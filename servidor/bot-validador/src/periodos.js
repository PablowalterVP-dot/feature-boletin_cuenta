/* Lo que el bot necesita del calendario: cuántos días tiene un mes, qué día de
   la semana cae cada uno y cómo se escribe el periodo.

   El periodo es una cadena 'AAAA-MM'. El día de la semana se calcula en UTC:
   es una propiedad del calendario, no de la zona horaria del servidor. */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const LETRAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function partes(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return { anio, mes };
}

export function esPeriodo(texto) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(texto ?? ''));
}

export function etiquetaPeriodo(periodo) {
  const { anio, mes } = partes(periodo);
  return `${MESES[mes - 1]} ${anio}`;
}

export function diasDelMes(periodo) {
  const { anio, mes } = partes(periodo);
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function indiceSemana(periodo, dia) {
  const { anio, mes } = partes(periodo);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

export function letraDeDia(periodo, dia) {
  return LETRAS[indiceSemana(periodo, dia)];
}

export function esFinDeSemana(periodo, dia) {
  const i = indiceSemana(periodo, dia);
  return i === 0 || i === 6;
}

/* Cómo nombra el mes el Excel oficial de las áreas: en mayúsculas y
   «SETIEMBRE», como se escribe en el Perú. */
const MESES_OFICIALES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

export function mesOficial(periodo) {
  return MESES_OFICIALES[partes(periodo).mes - 1];
}

/* El periodo que nombra un texto («NUTRICIÓN Y DIETÉTICA: SETIEMBRE   2026»),
   o null si no nombra un mes y un año. Acepta SETIEMBRE y SEPTIEMBRE. */
export function periodoDeTexto(texto) {
  const t = String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const anio = t.match(/\b(20\d{2})\b/)?.[1];
  const palabras = new Set(t.split(/[^A-Z0-9]+/));
  const i = MESES_OFICIALES.findIndex((m) => palabras.has(m) || (m === 'SETIEMBRE' && palabras.has('SEPTIEMBRE')));
  if (!anio || i < 0) return null;
  return `${anio}-${String(i + 1).padStart(2, '0')}`;
}
