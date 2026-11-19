/* Formato de cifras y fechas, y las reglas de honestidad que van con ellas.

   Existe para que ninguna pantalla vuelva a inventar un 0 %. Las tres reglas
   que se codifican aquí costaron errores reales en el sistema anterior:

     · Denominador cero no es 0 %. Un 0 % afirma que se midió y salió cero.
       Cuando no hay con qué dividir, el texto es «Sin datos».
     · Meta no registrada no es meta 0. El texto es «Meta no definida».
     · Ausencia de dato no es cero. Un mes sin reporte no vale 0; se rotula.

   Quien necesite el número crudo usa `valor`; quien lo pinte usa `texto`. */

export const SIN_DATOS = 'Sin datos';
export const SIN_META = 'Meta no definida';

const LOCAL = 'es-PE';

export function numero(valor, decimales = 0) {
  if (valor == null || Number.isNaN(valor)) return SIN_DATOS;
  return valor.toLocaleString(LOCAL, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/* Horas como las escribe el área en su Excel: horas:minutos («997:57»). Un
   decimal (997.95) no lo reconoce nadie, y leído como «997 entre 57» confunde. */
export function horasYMinutos(horas) {
  if (horas == null || Number.isNaN(horas)) return SIN_DATOS;
  const minutos = Math.round(Math.abs(horas) * 60);
  return `${horas < 0 ? '-' : ''}${Math.floor(minutos / 60).toLocaleString(LOCAL)}:${String(minutos % 60).padStart(2, '0')}`;
}

/* Porcentaje con el denominador a la vista.

   Devuelve siempre `{ valor, texto, explicacion }`: `valor` es null cuando no
   se pudo calcular, y `explicacion` es el texto que va al tooltip para que la
   cifra no quede sin decir de qué está hecha. */
export function porcentaje(numerador, denominador, decimales = 1) {
  if (denominador == null || denominador === 0 || numerador == null) {
    return {
      valor: null,
      texto: SIN_DATOS,
      explicacion:
        denominador === 0
          ? 'No se puede calcular: el denominador es cero. No es lo mismo que cero por ciento.'
          : 'Falta uno de los dos datos necesarios para calcular el porcentaje.',
    };
  }
  const valor = (numerador / denominador) * 100;
  return {
    valor,
    texto: `${numero(valor, decimales)} %`,
    explicacion: `${numero(numerador)} de ${numero(denominador)}.`,
  };
}

/* Cumplimiento contra meta. Separa «no alcanzó la meta» de «nadie registró una
   meta», que en una tabla se ven igual y significan cosas opuestas. */
export function cumplimiento(logrado, meta, decimales = 1) {
  if (meta == null) {
    return { valor: null, texto: SIN_META, explicacion: 'El periodo no tiene meta registrada, así que no hay contra qué comparar.' };
  }
  return porcentaje(logrado, meta, decimales);
}

/* Variación respecto al mes anterior. Null cuando no hay mes anterior con
   datos: dibujar 0 % ahí afirmaría que no cambió nada. */
export function variacion(actual, anterior, decimales = 1) {
  if (actual == null || anterior == null) {
    return { valor: null, texto: SIN_DATOS, explicacion: 'Falta el dato de uno de los dos meses.' };
  }
  if (anterior === 0) {
    return { valor: null, texto: SIN_DATOS, explicacion: 'El mes anterior fue cero: no hay base para calcular la variación.' };
  }
  const valor = ((actual - anterior) / anterior) * 100;
  const signo = valor > 0 ? '+' : '';
  return {
    valor,
    texto: `${signo}${numero(valor, decimales)} %`,
    explicacion: `De ${numero(anterior)} a ${numero(actual)}.`,
  };
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/* Fechas en formato ISO 'AAAA-MM-DD' o 'AAAA-MM-DDTHH:MM'. Se parten como
   cadena, no con Date, por la misma razón que en `periodos.js`. */
/* «Domingo, 13 de septiembre de 2026». El día de la semana se calcula en UTC:
   es del calendario, no de la zona horaria de quien mira. */
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function fechaLarga(iso) {
  if (!iso) return SIN_DATOS;
  const [anio, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()]}, ${fecha(iso)}`;
}

/* «Buenas noches, Milagros»: el saludo con que abre el módulo inicial de cada
   rol. La hora es la del reloj de quien mira (un `Date`), no la fecha del
   sistema: el saludo acompaña al momento del día, no al periodo. El nombre es
   la primera palabra; si llega todo en mayúsculas (así lo guardan algunas
   cuentas del servidor) se escribe como nombre propio. Sin nombre, solo el
   saludo. */
export function saludo(nombre, ahora = new Date()) {
  const hora = ahora.getHours();
  const deLaHora = hora >= 5 && hora < 12 ? 'Buenos días' : hora >= 12 && hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const primero = String(nombre ?? '').trim().split(/\s+/)[0] ?? '';
  if (!primero) return deLaHora;
  const propio = primero === primero.toUpperCase() ? primero.charAt(0) + primero.slice(1).toLowerCase() : primero;
  return `${deLaHora}, ${propio}`;
}

export function fecha(iso) {
  if (!iso) return SIN_DATOS;
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${anio}`;
}

export function fechaCorta(iso) {
  if (!iso) return SIN_DATOS;
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

export function fechaHora(iso) {
  if (!iso) return SIN_DATOS;
  const hora = iso.slice(11, 16);
  return hora ? `${fechaCorta(iso)} · ${hora}` : fechaCorta(iso);
}

/* «hace 3 días», para el historial. Con la fecha exacta siempre disponible en
   el tooltip: lo relativo se lee rápido pero no sirve para un acta. */
export function haceCuanto(iso, hoy) {
  if (!iso) return SIN_DATOS;
  const dias = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86400000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 0) return `en ${-dias} días`;
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? 'hace un mes' : `hace ${meses} meses`;
}

export function plural(cantidad, singular, plural_) {
  return `${numero(cantidad)} ${cantidad === 1 ? singular : plural_}`;
}
