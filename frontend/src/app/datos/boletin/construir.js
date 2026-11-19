/* Arma el boletín de un periodo con lo que hay en la base de datos.

   **Solo publica datos de la base.** El almacén del prototipo mezcla reportes
   reales, que llegan del backend (`origen: 'bd'`, ver `servicios/api.js`), con
   reportes sembrados de cifras simuladas para ensayar el flujo. Un boletín
   publica cifras del hospital: no puede salir con cifras simuladas, ni siquiera
   rotuladas. Por eso todo lo que no viene de la base se descarta aquí, a la
   entrada, antes de calcular nada: los reportes sembrados y los datos propios
   de Estadística, que hoy solo existen en memoria.

   Los catorce capítulos quedan definidos (`capitulos.js`). Cuando el formato de
   un área se instala en la base y su primer reporte se valida, su capítulo
   aparece solo; no hay que tocar el boletín.

   Dentro de la base, **solo entra lo que el área entregó**, la misma regla que
   DIRESA (`diresa/fuentes.js`). Desde el 12/10/2026 lo entregado ya llega
   validado por el bot, así que no hay un paso «espera validación»: un mes sin
   reporte entregado deja su capítulo fuera y la pantalla dice por qué.

   No se guarda: se deriva del estado cada vez, igual que los avisos. Si un
   reporte se reabre para rectificar, su capítulo sale del boletín hasta que se
   vuelva a validar. */

import { CAPITULOS } from './capitulos.js';
import { fuenteDeArea } from '../diresa/fuentes.js';
import { construirServiciosIntermedios } from '../diresa/servicios-intermedios.js';
import { calcularIndicadores, acumularIndicadores } from '../diresa/indicadores.js';
import { area } from '../areas.js';
import { PERIODOS } from '../reportes.js';
import { etiquetaPeriodo, mesAnterior } from '@/app/dominio/periodos.js';
import { romano } from '@/app/dominio/redaccion.js';
import { estaEntregado } from '@/app/dominio/estados.js';

/* Por qué un capítulo está o no está. `icono` sale del kit y acompaña al
   color: el color no es la única señal. */
export const ESTADO_CAPITULO = Object.freeze({
  incluido: Object.freeze({ clave: 'incluido', label: 'En el boletín', tone: 'ok', icono: 'sh-ok' }),
  'espera-area': Object.freeze({ clave: 'espera-area', label: 'Sin reporte del mes en la base', tone: 'crit', icono: 'sh-none' }),
  'sin-base': Object.freeze({ clave: 'sin-base', label: 'Aún no está en la base de datos', tone: 'none', icono: 'sh-none' }),
});

/* Hojas fijas antes del primer capítulo: portada, presentación y directorio. */
const HOJAS_PRELIMINARES = 3;
export const ITEMS_POR_HOJA_INDICE = 22;

const mesDe = (periodo) => etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();

function contexto(periodo, reportes) {
  const previo = mesAnterior(periodo);
  const anio = periodo.slice(0, 4);
  const delAnio = PERIODOS.filter((p) => p.slice(0, 4) === anio && p <= periodo);
  /* Sin datos propios de Estadística: todavía no están en la base. Cuando lo
     estén, se pasan aquí y los capítulos I a III y los indicadores se
     encienden solos. */
  const propios = {};
  return {
    periodo,
    mes: `${mesDe(periodo)} de ${anio}`,
    mesTitulo: etiquetaPeriodo(periodo),
    mesPrevio: mesDe(previo),
    desdeTexto: mesDe(delAnio[0] ?? periodo),
    propios,
    propio: null,
    propioPrevio: null,
    si: construirServiciosIntermedios(periodo, reportes, propios),
    siPrevio: construirServiciosIntermedios(previo, reportes, propios),
    indicadores: calcularIndicadores(periodo, reportes, propios),
    acumulado: acumularIndicadores(delAnio, reportes, propios),
    periodosHasta: PERIODOS.filter((p) => p <= periodo),
  };
}

function estadoDe(cap, ctx, reportes, areasEnBase) {
  if (cap.fuente.tipo === 'propio') return 'sin-base';
  if (cap.fuente.tipo === 'mixta') return ctx.indicadores.some((i) => i.valor != null) ? 'incluido' : 'sin-base';
  if (!areasEnBase.includes(cap.fuente.area)) return 'sin-base';
  const f = fuenteDeArea(reportes, cap.fuente.area, ctx.periodo);
  return f.estado === 'validado' ? 'incluido' : 'espera-area';
}

/* El último mes con al menos un reporte entregado en la base, entre los que el
   sistema ofrece (`PERIODOS`); null si no hay ninguno. El boletín abre ahí y
   no en el mes en curso: el mes en curso casi nunca tiene datos todavía, y un
   boletín que abre vacío parece roto. */
export function ultimoPeriodoConDatos(todosLosReportes, { areasEnBase = [] } = {}) {
  const conDatos = todosLosReportes
    .filter((r) => r.origen === 'bd' && areasEnBase.includes(r.area) && estaEntregado(r.estado))
    .map((r) => r.periodo)
    .filter((p) => PERIODOS.includes(p))
    .sort();
  return conDatos.at(-1) ?? null;
}

/* `areasEnBase`: las áreas con su formato instalado en la base
   (`api.areasEnBase()`). Se recibe como argumento porque `datos/` no conoce
   el backend. */
export function construirBoletin(periodo, todosLosReportes, { areasEnBase = [] } = {}) {
  const reportes = todosLosReportes.filter((r) => r.origen === 'bd' && areasEnBase.includes(r.area));
  const base = contexto(periodo, reportes);

  const capitulos = CAPITULOS.map((cap) => {
    const estado = estadoDe(cap, base, reportes, areasEnBase);
    const meta = {
      clave: cap.clave,
      numero: cap.numero,
      romano: romano(cap.numero),
      titulo: cap.titulo,
      area: cap.fuente.area ?? null,
      fuente: cap.fuente.tipo,
      estado,
    };
    if (estado !== 'incluido') return { ...meta, secciones: [] };

    /* El mes anterior solo cuenta si también está entregado en la base:
       comparar contra un borrador sería comparar contra una cifra que puede
       cambiar. */
    const ctx = { ...base };
    if (cap.fuente.tipo === 'area') {
      ctx.area = area(cap.fuente.area);
      ctx.datos = fuenteDeArea(reportes, cap.fuente.area, periodo).datos;
      ctx.datosPrevio = fuenteDeArea(reportes, cap.fuente.area, mesAnterior(periodo)).datos;
    }
    /* Tablas y gráficos llevan número correlativo dentro del capítulo, como
       en el impreso: «Tabla N°8.1», «Gráfico N°8.1». */
    let tablas = 0;
    let graficos = 0;
    const secciones = cap
      .secciones(ctx)
      .filter(Boolean)
      .map((s, i) => ({
        ...s,
        numero: `${cap.numero}.${i + 1}`,
        bloques: s.bloques.filter(Boolean).map((b) => ({
          ...b,
          rotulo: b.tipo === 'tabla' ? `Tabla N°${cap.numero}.${++tablas}` : `Gráfico N°${cap.numero}.${++graficos}`,
        })),
      }));
    return { ...meta, secciones };
  });

  return paginar({ periodo, capitulos });
}

/* Una hoja de separador por capítulo y una hoja por sección: así el índice
   sabe la página exacta de cada cosa antes de pintar nada. */
function paginar(boletin) {
  const incluidos = boletin.capitulos.filter((c) => c.estado === 'incluido' && c.secciones.length);
  const itemsIndice = 3 + incluidos.reduce((a, c) => a + 1 + c.secciones.length, 0) + 1;
  const hojasIndice = Math.max(1, Math.ceil(itemsIndice / ITEMS_POR_HOJA_INDICE));

  let pagina = HOJAS_PRELIMINARES + hojasIndice + 1;
  const capitulos = boletin.capitulos.map((c) => {
    if (!incluidos.includes(c)) return c;
    const separador = pagina;
    pagina += 1;
    const secciones = c.secciones.map((s) => ({ ...s, pagina: pagina++ }));
    return { ...c, pagina: separador, secciones };
  });

  const indice = [
    { titulo: 'Presentación', pagina: 2 },
    { titulo: 'Directorio', pagina: 3 },
    { titulo: 'Índice', pagina: 4 },
    ...capitulos
      .filter((c) => c.pagina)
      .flatMap((c) => [
        { titulo: `Capítulo ${c.romano}: ${c.titulo}`, pagina: c.pagina, capitulo: true },
        ...c.secciones.map((s) => ({ titulo: `${s.numero}. ${s.titulo}`, pagina: s.pagina, sangria: true })),
      ]),
    { titulo: 'Glosario de términos', pagina, capitulo: true },
  ];

  return {
    ...boletin,
    capitulos,
    indice,
    hojasIndice,
    paginaGlosario: pagina,
    incluidos: incluidos.length,
    pendientes: capitulos.filter((c) => c.estado !== 'incluido'),
  };
}
