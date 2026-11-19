/* Periodos mensuales y plazos.

   Todo se calcula con aritmética de cadenas 'AAAA-MM'. Nada de objetos Date
   para el periodo: construir un Date a partir de un mes introduce la zona
   horaria en un dato que no tiene hora, y un reporte de agosto acabaría
   rotulado como julio en el navegador de otra persona.

   La fecha de hoy es un constante del prototipo, no la del reloj. Motivo: el
   historial simulado está escrito alrededor de ella, y una demo que cambia de
   significado según el día en que se abre no se puede ensayar. Al conectar un
   backend, esto pasa a ser el reloj del servidor.

   Se movió del 13 de septiembre al 3 de octubre de 2026 (el día en que se
   cambió): en octubre se reporta septiembre, y agosto ya es el último mes
   enviado. Al moverla otra vez, revisar la tabla VIGENTE de datos/reportes.js:
   ningún paso sembrado puede caer después de hoy. */
export const HOY = '2026-10-03';

/* Día del mes siguiente en que vence la entrega del periodo. Es el plazo
   institucional, no un dato del área; si cambia, cambia aquí. */
export const DIA_PLAZO = 10;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

function partes(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return { anio, mes };
}

function armar(anio, mes) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

export function mesAnterior(periodo, cuantos = 1) {
  const { anio, mes } = partes(periodo);
  const total = anio * 12 + (mes - 1) - cuantos;
  return armar(Math.floor(total / 12), (total % 12) + 1);
}

export function mesSiguiente(periodo, cuantos = 1) {
  return mesAnterior(periodo, -cuantos);
}

/* El periodo que toca reportar: siempre el mes cerrado, es decir el anterior
   al corriente. En septiembre se reporta agosto.

   Misma regla que `servidor/api/app/dominio/periodos.py::periodo_vigente`
   (el mes anterior al de hoy); un contrato
   (`servidor/api/contrato/periodo_vigente.json`,
   `scripts/exportar-contrato-periodo.mjs`) falla si alguna de las dos cambia
   sin la otra. */
export function periodoVigente(hoy) {
  return mesAnterior(hoy.slice(0, 7));
}

/* El periodo vigente **del prototipo**, fijo como `HOY`: lo usa la siembra de
   datos simulados (`datos/reportes.js`, `datos/estadistica-propios.js`) y lo
   que describe reiniciar la demostración (`paneles/admin/Cuentas.jsx`), que
   siempre vuelve al mismo estado sembrado sin importar el modo. Cualquier
   pantalla que decida qué periodo mostrar **ahora** usa `periodoVigente(hoy)`
   con el `hoy` del store (`datos/store.js::useHoy`), no esta constante. */
export const PERIODO_VIGENTE = periodoVigente(HOY);

export function etiquetaPeriodo(periodo) {
  const { anio, mes } = partes(periodo);
  return `${MESES[mes - 1]} ${anio}`;
}

export function etiquetaCorta(periodo) {
  const { anio, mes } = partes(periodo);
  return `${MESES_CORTOS[mes - 1]} ${String(anio).slice(2)}`;
}

export function etiquetaMes(periodo) {
  return MESES_CORTOS[partes(periodo).mes - 1];
}

/* Serie de periodos terminada en `hasta`, del más reciente al más antiguo. */
export function ultimosPeriodos(cuantos, hasta = PERIODO_VIGENTE) {
  return Array.from({ length: cuantos }, (_, i) => mesAnterior(hasta, i));
}

/* De enero del año de `hasta` hasta `hasta`, en orden. Es el año que se cuenta
   en el consolidado y el que un libro anual (Laboratorio) trae de una vez. */
export function mesesDelAnioHasta(hasta) {
  const meses = [];
  for (let p = `${hasta.slice(0, 4)}-01`; p <= hasta; p = mesSiguiente(p)) meses.push(p);
  return meses;
}

/* ------------------------------------------------------ días del periodo

   Los formatos de registro diario necesitan saber cuántos días tiene el mes y
   qué día de la semana cae cada uno. En el oficio de papel esa columna se
   escribe a mano; aquí se genera, que es una de las cosas que el sistema puede
   dejar de pedirle a nadie.

   Aquí sí se usa Date, con horas UTC: el día de la semana es una propiedad del
   calendario y no de la zona horaria de quien mira. */
const LETRAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const NOMBRES_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function diasDelMes(periodo) {
  const { anio, mes } = partes(periodo);
  /* Día 0 del mes siguiente es el último del mes pedido. */
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function indiceSemana(periodo, dia) {
  const { anio, mes } = partes(periodo);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

export function letraDeDia(periodo, dia) {
  return LETRAS_SEMANA[indiceSemana(periodo, dia)];
}

export function nombreDeDia(periodo, dia) {
  return NOMBRES_SEMANA[indiceSemana(periodo, dia)];
}

export function esFinDeSemana(periodo, dia) {
  const i = indiceSemana(periodo, dia);
  return i === 0 || i === 6;
}

/* [1, 2, … n] del mes. */
export function diasDe(periodo) {
  return Array.from({ length: diasDelMes(periodo) }, (_, i) => i + 1);
}

/* El día 10 del mes siguiente: el plazo genérico del prototipo, el mismo
   para toda área. Solo es correcto en modo mock, o para un área real que
   todavía no se sincronizó con el backend; un área real sincronizada tiene
   su `fecha_limite` propio en `datos/store.js::plazosReales`, que puede ser
   otro día (`servidor/api/app/dominio/plazos.py` resuelve, por ejemplo, el
   día 5 para Nutrición). */
export function plazoDe(periodo) {
  const siguiente = mesSiguiente(periodo);
  return `${siguiente}-${String(DIA_PLAZO).padStart(2, '0')}`;
}

/* El plazo que de verdad aplica: el real, si se conoce, o el calculado
   localmente. **Nunca se recalcula el real** — se usa tal cual lo dio la
   API (`datos/store.js::plazoRealDe`); esta función solo decide cuál de los
   dos usar. */
export function plazoEfectivo(periodo, fechaLimiteReal) {
  return fechaLimiteReal ?? plazoDe(periodo);
}

export function estaVencido(periodo, hoy = HOY, fechaLimiteReal) {
  return hoy > plazoEfectivo(periodo, fechaLimiteReal);
}

/* Días transcurridos desde el vencimiento. Cero o negativo significa que
   todavía hay plazo. Aquí sí se usa Date porque son fechas completas y la
   diferencia en días sí tiene sentido. */
export function diasDeRetraso(periodo, hoy = HOY, fechaLimiteReal) {
  const ms = Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${plazoEfectivo(periodo, fechaLimiteReal)}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function diasParaVencer(periodo, hoy = HOY, fechaLimiteReal) {
  return -diasDeRetraso(periodo, hoy, fechaLimiteReal);
}

/* Respaldo si el backend no responde a tiempo (`servicios/api.js::hoyDelBackend`):
   la fecha de hoy, pero en la zona de Lima explícita, nunca `new Date()` a
   secas. El reloj de una PC del hospital puede estar mal puesto o en otra
   zona; forzar 'America/Lima' es mejor que confiar en lo que diga esa PC, aun
   sin ser tan fiable como el reloj del servidor. */
const _FORMATO_LIMA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });

export function fechaHoyNavegador() {
  return _FORMATO_LIMA.format(new Date());
}

/* Plazo de la remisión a DIRESA. SUPUESTO: día 15 del mes siguiente. El
   plazo real no consta en los formatos recibidos y debe confirmarse con
   Estadística; cambiarlo es cambiar esta constante. */
export const DIA_PLAZO_DIRESA = 15;

export function plazoDiresaDe(periodo) {
  return `${mesSiguiente(periodo)}-${String(DIA_PLAZO_DIRESA).padStart(2, '0')}`;
}
