/* Historial simulado: ocho periodos por nueve áreas.

   LAS CIFRAS Y LAS FECHAS SON FICTICIAS. Sirven para que el prototipo tenga
   comportamiento, no para leer nada del hospital.

   Dos criterios al sembrar los datos:

   1. El periodo vigente (septiembre 2026, a 3 de octubre) tiene los tres
      estados: no iniciado, en llenado y entregado. Un semáforo donde todo
      está en verde no demuestra nada.

   2. Los periodos anteriores están entregados, salvo una deuda arrastrada a
      propósito, porque el papel también las tiene y el sistema debe hacerlas
      visibles en lugar de taparlas: Lavandería nunca envió marzo.

   Desde el 12/10/2026 no hay validación de Estadística: al enviar, el reporte
   llega a la vez a Estadística y a las oficinas de la matriz
   (dominio/estados.js).

   Un reporte que no existe no se almacena: su ausencia ES el estado
   `no_iniciado`. Guardar un registro vacío sería afirmar que alguien lo abrió. */

import { AREAS, area, destinosDe } from './areas.js';
import { PERIODO_VIGENTE, ultimosPeriodos, mesSiguiente } from '@/app/dominio/periodos.js';
import { usuarioDeArea, USUARIOS } from './usuarios.js';
import { datosSembrados } from './formatos/levantados.js';

export const PERIODOS = Object.freeze(ultimosPeriodos(8).reverse());

const RESPONSABLE_ESTADISTICA = USUARIOS.find((u) => u.id === 'est-1').nombre;

/* Pasos que llevan a cada estado. El historial no se escribe a mano: se deriva
   del estado final, así ningún registro queda con una cronología imposible. */
const CAMINO = {
  borrador: ['crear'],
  remitido: ['crear', 'enviar'],
};

/* Día del mes siguiente en que ocurre cada paso, relativo al día de envío. */
const DESFASE = { crear: -3, enviar: 0 };

const HORAS = { crear: '08:15', enviar: '10:40' };

const ESTADO_DE = { crear: 'borrador', enviar: 'remitido' };

const NOTA = {
  crear: 'Abre el formulario del periodo.',
  enviar: 'Entregado a Estadística y a las oficinas que la matriz determina.',
};

function fechaDePaso(periodo, diaEnvio, paso) {
  const dia = Math.max(1, diaEnvio + DESFASE[paso]);
  return `${mesSiguiente(periodo)}-${String(dia).padStart(2, '0')}T${HORAS[paso]}`;
}

function crearReporte({ clave, periodo, estadoFinal, diaEnvio }) {
  const a = area(clave);
  const responsable = usuarioDeArea(clave);
  const pasos = CAMINO[estadoFinal] ?? [];
  const sufijo = `${periodo}-${a.sigla}`;

  const historial = pasos.map((paso) => ({
    accion: paso,
    estado: ESTADO_DE[paso],
    fecha: fechaDePaso(periodo, diaEnvio, paso),
    actor: responsable.nombre,
    nota: NOTA[paso],
  }));

  const entregado = pasos.includes('enviar');

  return {
    id: `${clave}:${periodo}`,
    area: clave,
    periodo,
    estado: estadoFinal,
    /* Folio del reporte; la constancia es el comprobante que se queda el área,
       el equivalente del sello en el oficio de papel. */
    folio: entregado ? `RE-${sufijo}` : null,
    constancia: entregado ? `CR-${sufijo}` : null,
    enviadoEn: entregado ? fechaDePaso(periodo, diaEnvio, 'enviar') : null,
    /* Costura y Lavandería y Diagnóstico por Imágenes traen sus cuatro
       formatos, con las cifras reales de junio. Las demás áreas traen la
       estructura propuesta de lo que deben enviar, con cifras simuladas. Un
       reporte en llenado se siembra a medias. */
    datos: datosSembrados(clave, periodo, { parcial: estadoFinal === 'borrador' }),
    /* Las oficinas de la matriz lo reciben en el mismo momento del envío. */
    remision: entregado
      ? {
        acta: `AR-${sufijo}`,
        fecha: fechaDePaso(periodo, diaEnvio, 'enviar'),
        actor: responsable.nombre,
        destinos: destinosDe(clave).filter((d) => d !== 'estadistica'),
      }
      : null,
    historial,
  };
}

/* Estados del periodo vigente, área por área. Es la tabla que da forma a la
   demo: cada fila del semáforo cuenta una situación distinta.

   Hoy es el 3 de octubre: todo envío cae entre el 1 y el 3. Un día mayor
   pondría un envío en el futuro, y la prueba de humo lo rechaza. */
const VIGENTE = {
  imagenes: { estadoFinal: 'remitido', diaEnvio: 1 },
  epidemiologia: { estadoFinal: 'remitido', diaEnvio: 2 },
  laboratorio: { estadoFinal: 'remitido', diaEnvio: 1 },
  nefrologia: { estadoFinal: 'remitido', diaEnvio: 2 },
  ginecologia: { estadoFinal: 'remitido', diaEnvio: 3 },
  'centro-quirurgico': { estadoFinal: 'borrador', diaEnvio: 3 },
  /* Nutrición y Lavandería no aparecen: aún no abren el
     reporte, y les quedan siete días de plazo. Nutrición entra por la carga
     del Excel de septiembre; su último mes enviado es agosto. */
};

/* Excepciones en los periodos anteriores: la deuda arrastrada. */
const EXCEPCIONES = {
  'lavanderia:2026-03': null,
};

/* Áreas que empiezan sin historial: cada mes existe solo si el área sube su
   informe. Farmacia se prueba subiendo sus Word reales desde enero de 2026
   (ReporteWord.jsx); un historial inventado se confundiría con lo subido. */
const SIN_HISTORIAL = new Set(['farmacia']);

function sembrar() {
  const lista = [];

  for (const periodo of PERIODOS) {
    AREAS.forEach((a, i) => {
      if (SIN_HISTORIAL.has(a.clave)) return;
      const id = `${a.clave}:${periodo}`;

      if (Object.prototype.hasOwnProperty.call(EXCEPCIONES, id)) {
        const excepcion = EXCEPCIONES[id];
        if (excepcion) lista.push(crearReporte({ clave: a.clave, periodo, ...excepcion }));
        return;
      }

      if (periodo === PERIODO_VIGENTE) {
        const config = VIGENTE[a.clave];
        if (config) lista.push(crearReporte({ clave: a.clave, periodo, ...config }));
        return;
      }

      /* Periodo cerrado sin excepción: entregado. El día de envío varía por
         área para que el historial no parezca generado. */
      lista.push(crearReporte({ clave: a.clave, periodo, estadoFinal: 'remitido', diaEnvio: 4 + (i % 5) }));
    });
  }

  return lista;
}

export const REPORTES_INICIALES = sembrar();

/* Remisiones a DIRESA ya hechas: de febrero a mayo, y agosto.

   Marzo se remitió sin Lavandería, que nunca envió su reporte: es lo que pasa
   con el plazo encima. Junio y julio están completos pero Estadística todavía
   no los remite a DIRESA, agosto ya se remitió y septiembre todavía está en
   curso. Cada situación es una de las que el módulo tiene que saber mostrar. */
export const REMISIONES_DIRESA_INICIALES = Object.freeze(
  PERIODOS.filter((p) => p <= '2026-05' || p === '2026-08').map((p) =>
    Object.freeze({
      id: `diresa:${p}`,
      periodo: p,
      fecha: `${mesSiguiente(p)}-14T15:20`,
      actor: RESPONSABLE_ESTADISTICA,
      constancia: `DIR-${p}`,
      formatos: Object.freeze(['servicios-intermedios', 'indicadores']),
      faltantes: Object.freeze(p === '2026-03' ? ['lavanderia'] : []),
    }),
  ),
);
