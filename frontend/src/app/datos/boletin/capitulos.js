/* Los capítulos del boletín estadístico y de dónde sale cada cifra.

   El boletín no se escribe: se arma con lo que el sistema ya tiene. Cada
   capítulo declara su fuente —un área o los datos propios de Estadística— y
   una función que, con los datos del mes, devuelve sus secciones. Cuando un
   área empieza a enviar, o cuando se levanta su oficio real, su capítulo
   aparece solo; no hay que tocar la pantalla del boletín.

   La numeración de los capítulos es fija, como en el boletín impreso de julio
   de 2026: allí faltan el I y el III y la numeración salta del II al IV. Un
   capítulo sin datos deja su número libre en lugar de correr los siguientes,
   para que «Capítulo VII» sea siempre Imágenes. Del I (Consulta Externa) y el
   III (Hospitalización) se supone el contenido por el hueco que dejan; hay
   que confirmarlo con Estadística.

   Del boletín impreso se toman la estructura de Hospitalización / Emergencia /
   Consulta externa y las filas de los servicios intermedios, que son las del
   consolidado de DIRESA: por eso los capítulos V a IX se leen de
   `construirServiciosIntermedios` y no recalculan nada. El boletín y DIRESA no
   pueden dar cifras distintas.

   La forma de cada hoja copia la del boletín impreso: el título de la sección,
   el párrafo, la tabla compacta con «TOTAL» sobre Hospitalización /
   Emergencia / C. Externa, su fuente, y el gráfico de torta en recuadro. Las
   tablas y los gráficos se numeran por capítulo («Tabla N°8.1») al armar el
   boletín, no aquí.

   Forma de una sección: { clave, titulo, texto, bloques, fuente }. Bloques:
     tabla  { titulo?, encabezado, columnas: [{ clave, label, grupo? }], filas: [{ clave, label, valores, total?, grupo? }], nota? }
     torta  { titulo, partes: [{ label, valor }] }
     serie  { titulo, unidad, puntos: [{ periodo, valor }] }
   Una sección que devuelve null no se imprime: no hay hoja vacía. */

import { SERVICIOS, GRUPOS_LABORATORIO, ITEMS_ANATOMIA, EXAMENES_IMAGENES, sumar } from '../formatos/areas-simuladas.js';
import { celda } from '../diresa/servicios-intermedios.js';
import { decimalesDe } from '../diresa/indicadores.js';
import { cifrasImagenes } from '../formatos/imagenes-calculos.js';
import { cifrasEpidemiologia } from '../formatos/epidemiologia-calculos.js';
import { GRUPOS as GRUPOS_EPI } from '../formatos/epidemiologia.js';
import { totalPiezas } from '../formatos/lavanderia-calculos.js';
import { paraDiresa } from '../formatos/centro-quirurgico-calculos.js';
import { CAUSAS as CAUSAS_CQX } from '../formatos/centro-quirurgico.js';
import { campoPropio } from '../estadistica-propios.js';
import { numero, porcentaje, SIN_DATOS } from '@/app/dominio/formato.js';
import { fraseComparada, fraseMayorParte, parrafo } from '@/app/dominio/redaccion.js';

/* ----------------------------------------------------------- utilidades */

/* Como en el boletín impreso: «TOTAL» agrupa las tres columnas de servicio y
   no hay columna de total aparte. */
const ROTULO_SERVICIO = { hosp: 'Hospitalización', emerg: 'Emergencia', ce: 'C. Externa' };
const COLUMNAS_SERVICIO = SERVICIOS.map((s) => ({ clave: s.clave, label: ROTULO_SERVICIO[s.clave], grupo: 'TOTAL' }));
const COLUMNA_MES = (ctx) => [{ clave: 'valor', label: ctx.mesTitulo }];

/* Fila por servicio con su total. El total suma lo que hay y queda vacío si
   no hay nada: nunca un cero inventado. */
function filaServicios(clave, label, porServicio, extra = {}) {
  const valores = Object.fromEntries(SERVICIOS.map((s) => [s.clave, porServicio(s.clave)]));
  valores.total = sumar(Object.values(valores));
  return { clave, label, valores, ...extra };
}

const filaSimple = (clave, label, valor, extra = {}) => ({ clave, label, valores: { valor }, ...extra });

/* Valor de una celda del consolidado DIRESA. */
const si = (resultado, tabla, fila, columna) => celda(resultado, tabla, fila, columna)?.valor ?? null;

function textoIndicador(indicador) {
  if (indicador?.valor == null) return SIN_DATOS;
  const cifra = numero(indicador.valor, decimalesDe(indicador));
  if (indicador.unidad === '%') return `${cifra} %`;
  return indicador.unidad ? `${cifra} ${indicador.unidad}` : cifra;
}

/* Tabla de indicadores de gestión: el valor del mes y de qué está hecho. */
function tablaIndicadores(ctx, numeros) {
  const lista = numeros.map((n) => ctx.indicadores.find((i) => i.n === n)).filter(Boolean);
  const notas = lista.filter((i) => i.nota).map((i) => `Indicador ${i.n}: ${i.nota}`);
  return {
    tipo: 'tabla',
    columnas: [
      { clave: 'formula', label: 'Cálculo' },
      { clave: 'valor', label: ctx.mesTitulo },
    ],
    filas: lista.map((i) => ({
      clave: `ind-${i.n}`,
      label: `${i.n}. ${i.nombre}`,
      valores: {
        formula: `${i.num.etiqueta} / ${i.den.etiqueta}${i.factor !== 1 ? ` × ${numero(i.factor)}` : ''}`,
        valor: textoIndicador(i),
      },
    })),
    nota: notas.length ? notas.join(' ') : null,
  };
}

const textoIndicadorCorto = (ctx, n) => {
  const i = ctx.indicadores.find((x) => x.n === n);
  return i?.valor == null ? null : `${i.nombre.toLowerCase()}: ${textoIndicador(i)}`;
};

/* Serie mensual desde el primer periodo del sistema hasta el del boletín. */
const serie = (ctx, titulo, unidad, leer) => ({
  tipo: 'serie',
  titulo,
  unidad,
  puntos: ctx.periodosHasta.map((p) => ({ periodo: p, valor: leer(p) })),
});

const torta = (titulo, partes) => {
  const conDato = partes.filter((p) => p.valor != null && p.valor > 0);
  return conDato.length > 1 ? { tipo: 'torta', titulo, partes: conDato } : null;
};

const fuenteArea = (ctx) => `Fuente: ${ctx.area.nombre}, reporte mensual validado / Elaborado: Oficina de Estadística e Informática.`;
const fuentePropia = (...claves) =>
  `Fuente: ${[...new Set(claves.map((k) => campoPropio(k)?.fuente).filter(Boolean))].join('; ')}. Elaborado: Oficina de Estadística e Informática.`;

/* Un valor propio de Estadística del mes y del mes anterior. */
const propio = (ctx, clave) => ctx.propio?.[clave] ?? null;
const propioPrevio = (ctx, clave) => ctx.propioPrevio?.[clave] ?? null;

/* ------------------------------------------------------------ capítulos */

const capitulo = (def) => Object.freeze(def);

export const CAPITULOS = Object.freeze([
  capitulo({
    clave: 'consulta-externa',
    numero: 1,
    titulo: 'Consulta Externa',
    fuente: { tipo: 'propio', requiere: ['atencionesCE'] },
    secciones: (ctx) => [
      {
        clave: 'atenciones',
        titulo: 'Atenciones y atendidos en consulta externa',
        texto: parrafo(
          fraseComparada({ prefijo: `en ${ctx.mes} se registraron`, actual: propio(ctx, 'atencionesCE'), previo: propioPrevio(ctx, 'atencionesCE'), mesPrevio: ctx.mesPrevio, unidad: 'atenciones médicas' }),
          propio(ctx, 'atendidosCE') != null && `se atendió a ${numero(propio(ctx, 'atendidosCE'))} pacientes nuevos y reingresantes`,
        ),
        bloques: [
          {
            tipo: 'tabla',
            columnas: COLUMNA_MES(ctx),
            filas: [
              filaSimple('atenciones', 'Atenciones médicas realizadas', propio(ctx, 'atencionesCE')),
              filaSimple('atendidos', 'Atendidos (nuevos y reingresos)', propio(ctx, 'atendidosCE')),
              filaSimple('horasProg', 'Horas médico programadas', propio(ctx, 'horasProgramadas')),
              filaSimple('horasEfec', 'Horas médico efectivas', propio(ctx, 'horasEfectivas')),
              filaSimple('referencias', 'Referencias enviadas', propio(ctx, 'referencias')),
            ],
          },
          serie(ctx, 'Atenciones médicas en consulta externa por mes', 'atenciones', (p) => ctx.propios?.[p]?.atencionesCE ?? null),
        ],
        fuente: fuentePropia('atencionesCE', 'horasProgramadas', 'horasEfectivas', 'referencias'),
      },
      {
        clave: 'indicadores',
        titulo: 'Indicadores de consulta externa',
        texto: parrafo(textoIndicadorCorto(ctx, 1), textoIndicadorCorto(ctx, 3)),
        bloques: [tablaIndicadores(ctx, [1, 2, 3, 4, 15])],
        fuente: fuentePropia('atencionesCE', 'consultoriosFuncionales', 'referencias'),
      },
    ],
  }),

  capitulo({
    clave: 'emergencia',
    numero: 2,
    titulo: 'Emergencia',
    fuente: { tipo: 'propio', requiere: ['atencionesEmergencia'] },
    secciones: (ctx) => [
      {
        clave: 'atenciones',
        titulo: 'Atenciones en emergencia',
        texto: parrafo(
          fraseComparada({ prefijo: `en ${ctx.mes} el servicio de Emergencia registró`, actual: propio(ctx, 'atencionesEmergencia'), previo: propioPrevio(ctx, 'atencionesEmergencia'), mesPrevio: ctx.mesPrevio, unidad: 'atenciones de prioridad I y II' }),
          propio(ctx, 'urgenciasEmergencia') != null &&
            `de ellas, ${numero(propio(ctx, 'urgenciasEmergencia'))} fueron urgencias médicas (${porcentaje(propio(ctx, 'urgenciasEmergencia'), propio(ctx, 'atencionesEmergencia')).texto})`,
        ),
        bloques: [
          {
            tipo: 'tabla',
            columnas: COLUMNA_MES(ctx),
            filas: [
              filaSimple('atenciones', 'Atenciones médicas (prioridades I y II)', propio(ctx, 'atencionesEmergencia')),
              filaSimple('urgencias', 'Urgencias médicas', propio(ctx, 'urgenciasEmergencia')),
              filaSimple('traslados', 'Traslados en ambulancia desde emergencia', propio(ctx, 'trasladosEmerg')),
            ],
          },
          serie(ctx, 'Atenciones en emergencia por mes', 'atenciones', (p) => ctx.propios?.[p]?.atencionesEmergencia ?? null),
        ],
        fuente: fuentePropia('atencionesEmergencia', 'urgenciasEmergencia', 'trasladosEmerg'),
      },
      {
        clave: 'indicadores',
        titulo: 'Indicadores de emergencia',
        texto: parrafo(textoIndicadorCorto(ctx, 10)),
        bloques: [tablaIndicadores(ctx, [10, 11])],
        fuente: fuentePropia('atencionesEmergencia', 'atencionesCE'),
      },
    ],
  }),

  capitulo({
    clave: 'hospitalizacion',
    numero: 3,
    titulo: 'Hospitalización',
    fuente: { tipo: 'propio', requiere: ['egresos'] },
    secciones: (ctx) => [
      {
        clave: 'egresos',
        titulo: 'Egresos y uso de camas',
        texto: parrafo(
          fraseComparada({ prefijo: `en ${ctx.mes} hubo`, actual: propio(ctx, 'egresos'), previo: propioPrevio(ctx, 'egresos'), mesPrevio: ctx.mesPrevio, unidad: 'egresos hospitalarios' }),
          textoIndicadorCorto(ctx, 8),
        ),
        bloques: [
          {
            tipo: 'tabla',
            columnas: COLUMNA_MES(ctx),
            filas: [
              filaSimple('egresos', 'Egresos hospitalarios', propio(ctx, 'egresos')),
              filaSimple('estancia', 'Días de estancia de los egresos', propio(ctx, 'diasEstancia')),
              filaSimple('pacientesDia', 'Pacientes-día', propio(ctx, 'pacientesDia')),
              filaSimple('diasCama', 'Días-cama disponibles', propio(ctx, 'diasCamaDisponibles')),
              filaSimple('camas', 'Camas disponibles (promedio del mes)', propio(ctx, 'camas')),
              filaSimple('defunciones', 'Egresos por defunción después de 48 horas', propio(ctx, 'defunciones48')),
            ],
          },
          serie(ctx, 'Egresos hospitalarios por mes', 'egresos', (p) => ctx.propios?.[p]?.egresos ?? null),
        ],
        fuente: fuentePropia('egresos', 'pacientesDia', 'defunciones48'),
      },
      {
        clave: 'indicadores',
        titulo: 'Indicadores hospitalarios',
        texto: parrafo(textoIndicadorCorto(ctx, 6), textoIndicadorCorto(ctx, 9)),
        bloques: [tablaIndicadores(ctx, [6, 7, 8, 9, 17])],
        fuente: fuentePropia('egresos', 'pacientesDia', 'defunciones48'),
      },
    ],
  }),

  capitulo({
    clave: 'centro-quirurgico',
    numero: 4,
    titulo: 'Centro Quirúrgico',
    fuente: { tipo: 'area', area: 'centro-quirurgico' },
    secciones: (ctx) => {
      /* Del libro que sube el área, con la misma lectura que DIRESA (paraDiresa). */
      const cq = ctx.datos ? paraDiresa(ctx.datos) : null;
      const i = cq?.intervenciones ?? {};
      const iPrevio = ctx.datosPrevio ? paraDiresa(ctx.datosPrevio).intervenciones : {};
      /* Las causas del área tal como las anota, las que tuvieron casos ese mes,
         de más a menos. No se agrupan: agruparlas sería inventar un criterio. */
      const causas = CAUSAS_CQX.map((c) => ({ ...c, valor: cq?.suspension[c.clave] ?? null }))
        .filter((c) => c.valor > 0)
        .sort((a, b) => b.valor - a.valor);
      return [
        {
          clave: 'tipos',
          titulo: 'Intervenciones Quirúrgicas: Tipos de Cirugías',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} se ejecutaron`, actual: i.ejecutadas, previo: iPrevio.ejecutadas, mesPrevio: ctx.mesPrevio, unidad: 'intervenciones quirúrgicas' }),
            i.electivas != null && i.emergencia != null && `${numero(i.electivas)} electivas y ${numero(i.emergencia)} de emergencia`,
            i.suspendidas != null && `se suspendieron ${numero(i.suspendidas)} de ${numero(i.programadas)} programadas (${porcentaje(i.suspendidas, i.programadas).texto})`,
          ),
          bloques: [
            {
              tipo: 'tabla',
              columnas: [...COLUMNA_MES(ctx), { clave: 'parte', label: '%' }],
              filas: [
                filaSimple('programadas', 'Cirugías programadas', i.programadas),
                { ...filaSimple('electivas', 'Programadas ejecutadas (electivas)', i.electivas), valores: { valor: i.electivas, parte: porcentaje(i.electivas, i.ejecutadas).texto } },
                { ...filaSimple('emergencia', 'Cirugías de emergencia', i.emergencia), valores: { valor: i.emergencia, parte: porcentaje(i.emergencia, i.ejecutadas).texto } },
                { clave: 'ejecutadas', label: 'Total de intervenciones ejecutadas', valores: { valor: i.ejecutadas, parte: i.ejecutadas ? '100 %' : null }, total: true },
                { clave: 'suspendidas', label: 'Cirugías suspendidas', valores: { valor: i.suspendidas, parte: porcentaje(i.suspendidas, i.programadas).texto } },
              ],
              nota: 'El porcentaje de electivas y de emergencia es sobre las ejecutadas; el de suspendidas, sobre las programadas. Las suspendidas no se suman al total ejecutado.',
            },
            torta('Intervenciones ejecutadas por tipo', [
              { label: 'Electivas', valor: i.electivas },
              { label: 'Emergencia', valor: i.emergencia },
            ]),
          ],
          fuente: fuenteArea(ctx),
        },
        causas.length && i.suspendidas
          ? {
              clave: 'suspension',
              titulo: 'Motivos de suspensión',
              texto: parrafo(fraseMayorParte(causas.map((c) => ({ label: c.corto.toLowerCase(), valor: c.valor })))),
              bloques: [
                {
                  tipo: 'tabla',
                  columnas: COLUMNA_MES(ctx),
                  filas: [
                    ...causas.map((c) => filaSimple(c.clave, c.corto, c.valor)),
                    filaSimple('total', 'Total de suspendidas', i.suspendidas, { total: true }),
                  ],
                  nota: 'Las causas como las anota Centro Quirúrgico en su hoja SUSPENDIDAS. Las que no tuvieron casos en el mes no se listan.',
                },
              ],
              fuente: fuenteArea(ctx),
            }
          : null,
        {
          clave: 'indicadores',
          titulo: 'Indicadores Estadísticos',
          texto: parrafo(
            cq?.salas.utilizadas != null && `se utilizaron ${numero(cq.salas.utilizadas)} salas de operaciones`,
            textoIndicadorCorto(ctx, 12),
          ),
          bloques: [tablaIndicadores(ctx, [12, 13, 14, 22])],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'patologia',
    numero: 5,
    titulo: 'Patología Clínica',
    fuente: { tipo: 'area', area: 'laboratorio' },
    secciones: (ctx) => {
      const ROTULO = {
        pap: 'EXÁMENES CITOLÓGICOS (PAP)',
        biopsia: 'EXÁMENES HISTOPATOLÓGICOS (Biopsia)',
        autopsiaLegal: 'AUTOPSIA MÉDICO LEGAL',
        autopsiaClinica: 'AUTOPSIA CLÍNICA',
        orina: 'EXAMEN COMPLETO DE ORINA',
      };
      const filas = ITEMS_ANATOMIA.map((it) => filaServicios(it.clave, ROTULO[it.clave] ?? it.label, (s) => si(ctx.si, 'anatomia', it.clave, s)));
      const total = sumar(filas.map((f) => f.valores.total));
      return [
        {
          clave: 'principales',
          titulo: 'Patología: Principales Indicadores',
          texto: parrafo(
            total != null && `en ${ctx.mes} se procesaron ${numero(total)} exámenes de anatomía patológica y orina`,
            fraseMayorParte(ITEMS_ANATOMIA.map((it, i) => ({ label: `los exámenes de ${it.label.toLowerCase()}`, valor: filas[i].valores.total }))),
          ),
          bloques: [
            { tipo: 'tabla', titulo: 'Exámenes de Patología Clínica por servicio', encabezado: 'Laboratorio y Anatomía Patológica', columnas: COLUMNAS_SERVICIO, filas },
            torta('Exámenes Servicio de Patología Clínica', ITEMS_ANATOMIA.map((it, i) => ({ label: it.label, valor: filas[i].valores.total }))),
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'laboratorio',
    numero: 6,
    titulo: 'Laboratorio Clínico',
    fuente: { tipo: 'area', area: 'laboratorio' },
    secciones: (ctx) => {
      const grupos = GRUPOS_LABORATORIO.map((g) => ({
        g,
        total: filaServicios(g.clave, `TOTAL ${g.titulo.toUpperCase()}`, (s) => si(ctx.si, 'lab-totales', g.clave, s), { total: true }),
        items: g.items.map((it) => filaServicios(`${g.clave}.${it.clave}`, it.label, (s) => si(ctx.si, `lab-${g.clave}`, it.clave, s), { grupo: true })),
      }));
      const general = filaServicios('general', 'TOTAL DE EXÁMENES LABORATORIO', (s) => sumar(grupos.map((x) => x.total.valores[s])), { total: true });
      const totalPrevio = ctx.siPrevio ? sumar(GRUPOS_LABORATORIO.flatMap((g) => SERVICIOS.map((s) => si(ctx.siPrevio, 'lab-totales', g.clave, s.clave)))) : null;
      /* Los cinco grupos con su detalle son 36 filas: no caben en una hoja A4.
         Se parten en dos secciones, por grupos enteros. */
      const filasDe = (claves) => grupos.filter((x) => claves.includes(x.g.clave)).flatMap((x) => [x.total, ...x.items]);
      return [
        {
          clave: 'examenes',
          titulo: 'Exámenes de Laboratorio Clínico – Principales Indicadores',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} el laboratorio procesó`, actual: general.valores.total, previo: totalPrevio, mesPrevio: ctx.mesPrevio, unidad: 'exámenes' }),
            fraseMayorParte(grupos.map((x) => ({ label: `el grupo de ${x.g.titulo.toLowerCase()}`, valor: x.total.valores.total }))),
          ),
          bloques: [{ tipo: 'tabla', titulo: 'Exámenes bioquímicos y hematológicos', encabezado: 'Laboratorio y Anatomía Patológica', columnas: COLUMNAS_SERVICIO, filas: [general, ...filasDe(['bioquimicos', 'hematologicos'])] }],
          fuente: fuenteArea(ctx),
        },
        {
          clave: 'examenes-2',
          titulo: 'Exámenes bacteriológicos, inmunoserológicos y parasitológicos',
          texto: null,
          bloques: [{ tipo: 'tabla', titulo: 'Exámenes bacteriológicos, inmunoserológicos y parasitológicos', encabezado: 'Laboratorio y Anatomía Patológica', columnas: COLUMNAS_SERVICIO, filas: filasDe(['bacteriologicos', 'inmunoserologicos', 'parasitologicos']) }],
          fuente: fuenteArea(ctx),
        },
        {
          clave: 'grupos',
          titulo: 'Exámenes de laboratorio por grupo',
          texto: parrafo(fraseMayorParte(SERVICIOS.map((s) => ({ label: s.label, valor: general.valores[s.clave] })))),
          bloques: [
            torta('Exámenes por grupo', grupos.map((x) => ({ label: x.g.titulo, valor: x.total.valores.total }))),
            torta('Exámenes por servicio', SERVICIOS.map((s) => ({ label: s.label, valor: general.valores[s.clave] }))),
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'imagenes',
    numero: 7,
    titulo: 'Diagnósticos por Imágenes',
    fuente: { tipo: 'area', area: 'imagenes' },
    secciones: (ctx) => {
      const rotulo = (it) => (it.clave === 'dentales' ? 'Placas Dentales' : it.clave === 'otros' ? 'Otros (mamografías y otros)' : `Exámenes ${it.label}`);
      const filas = EXAMENES_IMAGENES.map((it) => filaServicios(it.clave, rotulo(it), (s) => si(ctx.si, 'imagenes', it.clave, s)));
      const total = filaServicios('total', 'TOTAL DE EXÁMENES IMÁGENES', (s) => sumar(filas.map((f) => f.valores[s])), { total: true });
      const totalPrevio = ctx.siPrevio ? sumar(EXAMENES_IMAGENES.map((it) => si(ctx.siPrevio, 'imagenes', it.clave, 'general'))) : null;
      const c = cifrasImagenes(ctx.datos);
      return [
        {
          clave: 'principales',
          titulo: 'Diagnósticos por Imágenes: Indicadores Principales',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} se realizaron`, actual: total.valores.total, previo: totalPrevio, mesPrevio: ctx.mesPrevio, unidad: 'exámenes de imágenes' }),
            fraseMayorParte(EXAMENES_IMAGENES.map((it, i) => ({ label: `los exámenes ${it.label.toLowerCase()}`, valor: filas[i].valores.total }))),
          ),
          bloques: [
            { tipo: 'tabla', titulo: 'Exámenes de imágenes por servicio', encabezado: 'Diagnóstico por Imágenes', columnas: COLUMNAS_SERVICIO, filas: [total, ...filas], nota: 'Fotoradiográficos y placas dentales quedan vacíos porque el oficio del área no los reporta. «Otros» reúne mamografías, biopsias y procedimientos oncológicos.' },
            torta('Exámenes Imágenes', EXAMENES_IMAGENES.map((it, i) => ({ label: it.clave === 'otros' ? 'Otros' : `Exámenes ${it.label}`, valor: filas[i].valores.total }))),
          ],
          fuente: fuenteArea(ctx),
        },
        {
          clave: 'modalidades',
          titulo: 'Exámenes por modalidad y financiamiento',
          texto: parrafo(
            c.pacientes != null && `se atendió a ${numero(c.pacientes)} pacientes`,
            c.tomografoInoperativo && 'el tomógrafo estuvo inoperativo durante el mes',
          ),
          bloques: [
            {
              tipo: 'tabla',
              titulo: 'Exámenes por modalidad',
              encabezado: 'Modalidad',
              columnas: COLUMNA_MES(ctx),
              filas: [
                filaSimple('rx', 'Rayos X', c.modalidades.rayosX),
                filaSimple('eco', 'Ecografía', c.modalidades.ecografia),
                filaSimple('tom', 'Tomografía', c.modalidades.tomografia),
                filaSimple('mam', 'Mamografía', c.modalidades.mamografia),
                filaSimple('bio', 'Biopsias', c.modalidades.biopsias),
                filaSimple('onc', 'Procedimientos oncológicos', c.modalidades.oncologicos),
                filaSimple('total', 'Total de exámenes', c.examenes, { total: true }),
              ],
            },
            {
              tipo: 'tabla',
              titulo: 'Exámenes por financiamiento',
              encabezado: 'Financiamiento',
              columnas: COLUMNA_MES(ctx),
              filas: [
                filaSimple('sis', 'SIS', c.financiamiento.sis),
                filaSimple('convenio', 'Convenios', c.financiamiento.convenio),
                filaSimple('pagado', 'Pagados', c.financiamiento.pagado),
                filaSimple('campana', 'Campaña de mamografía', c.financiamiento.campana),
              ],
              nota: 'Rayos X no desglosa por financiamiento en su hoja: no entra en este reparto.',
            },
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'nutricion',
    numero: 8,
    titulo: 'Nutrición',
    fuente: { tipo: 'area', area: 'nutricion' },
    secciones: (ctx) => {
      const filas = [
        filaServicios('pacientes', 'Para Pacientes', (s) => si(ctx.si, 'nutricion', 'pacientes', s)),
        filaServicios('personal', 'Para Personal (comensales)', (s) => si(ctx.si, 'nutricion', 'personal', s)),
      ];
      const total = filaServicios('total', 'TOTAL DE RACIONES', (s) => si(ctx.si, 'nutricion', 'total', s), { total: true });
      const totalPrevio = ctx.siPrevio ? sumar(SERVICIOS.map((s) => si(ctx.siPrevio, 'nutricion', 'total', s.clave))) : null;
      return [
        {
          clave: 'raciones',
          titulo: 'Nutrición y Dietética – Indicadores Principales',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} se sirvieron`, actual: total.valores.total, previo: totalPrevio, mesPrevio: ctx.mesPrevio, unidad: 'raciones' }),
            fraseMayorParte([
              { label: 'las raciones para pacientes', valor: filas[0].valores.total },
              { label: 'las raciones para el personal (comensales)', valor: filas[1].valores.total },
            ]),
          ),
          bloques: [
            { tipo: 'tabla', titulo: 'Raciones por servicio', encabezado: 'Nutrición y Dietética', columnas: COLUMNAS_SERVICIO, filas: [total, ...filas], nota: 'El oficio de Nutrición no registra consulta externa: esa columna queda vacía, no en cero.' },
            torta('Raciones – Nutrición', filas.map((f) => ({ label: f.label, valor: f.valores.total }))),
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'lavanderia',
    numero: 9,
    titulo: 'Lavandería',
    fuente: { tipo: 'area', area: 'lavanderia' },
    secciones: (ctx) => {
      const kg = filaServicios('kg', 'Kilogramos de ropa lavada', (s) => si(ctx.si, 'lavanderia', 'kg', s), { total: true });
      const previo = ctx.siPrevio ? si(ctx.siPrevio, 'lavanderia', 'kg', 'total') : null;
      const piezas = totalPiezas(ctx.datos?.f4);
      return [
        {
          clave: 'ropa',
          titulo: 'Lavandería – Indicadores Principales',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} se lavaron`, actual: kg.valores.total, previo, mesPrevio: ctx.mesPrevio, unidad: 'kg de ropa' }),
            fraseMayorParte(SERVICIOS.map((s) => ({ label: s.label, valor: kg.valores[s.clave] }))),
            piezas != null && `se procesaron ${numero(piezas)} piezas`,
          ),
          bloques: [
            {
              tipo: 'tabla',
              titulo: 'Kilogramos de ropa lavada por servicio',
              encabezado: 'Lavandería',
              columnas: [{ clave: 'valor', label: 'Kg.' }],
              filas: [
                filaSimple('total', 'TOTAL DE KG. ROPA LAVADA', kg.valores.total, { total: true }),
                ...SERVICIOS.map((s) => filaSimple(s.clave, s.label, kg.valores[s.clave])),
              ],
              nota: 'Emergencia y consultorios externos son sus propias filas del Formato 1; el resto de los servicios se agrupa como hospitalización.',
            },
            torta('Porcentaje del Servicio de Lavandería', SERVICIOS.map((s) => ({ label: s.label, valor: kg.valores[s.clave] }))),
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  /* Del X en adelante: lo que el sistema recibe y el boletín impreso no
     publicaba. Cada uno aparece cuando su área envía y Estadística valida. */

  capitulo({
    clave: 'ginecologia',
    numero: 10,
    titulo: 'Gineco-Obstetricia',
    fuente: { tipo: 'area', area: 'ginecologia' },
    secciones: (ctx) => {
      const o = ctx.datos?.obstetricia ?? {};
      const p = ctx.datos?.perinatal ?? {};
      return [
        {
          clave: 'atencion',
          titulo: 'Atención obstétrica y resultados perinatales',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} se atendieron`, actual: o.partos, previo: ctx.datosPrevio?.obstetricia?.partos, mesPrevio: ctx.mesPrevio, unidad: 'partos' }),
            textoIndicadorCorto(ctx, 18),
          ),
          bloques: [
            {
              tipo: 'tabla',
              columnas: COLUMNA_MES(ctx),
              filas: [
                filaSimple('partos', 'Partos atendidos', o.partos),
                filaSimple('cesareas', 'Cesáreas realizadas', o.cesareas),
                filaSimple('rn', 'Recién nacidos vivos', p.rnVivos),
                filaSimple('fetales', 'Muertes fetales (22 semanas o más)', p.muertesFetales),
                filaSimple('precoces', 'Muertes neonatales precoces (0 a 7 días)', p.neonatalesPrecoces),
                filaSimple('tardias', 'Muertes neonatales tardías (8 a 28 días)', p.neonatalesTardias),
              ],
            },
            tablaIndicadores(ctx, [18, 19, 20, 21]),
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'epidemiologia',
    numero: 11,
    titulo: 'Epidemiología',
    fuente: { tipo: 'area', area: 'epidemiologia' },
    /* El oficio de vigilancia: casos nuevos de infección por servicio, y las
       muertes que registra la misma tabla, aparte (LECTURA_IIH). */
    secciones: (ctx) => {
      const v = cifrasEpidemiologia(ctx.datos);
      const previo = ctx.datosPrevio ? cifrasEpidemiologia(ctx.datosPrevio).infecciones : null;
      return [
        {
          clave: 'vigilancia',
          titulo: 'Vigilancia epidemiológica',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} se registraron`, actual: v.infecciones, previo, mesPrevio: ctx.mesPrevio, unidad: 'casos nuevos de infección intrahospitalaria' }),
            textoIndicadorCorto(ctx, 16),
          ),
          bloques: [
            {
              tipo: 'tabla',
              columnas: COLUMNA_MES(ctx),
              filas: [
                filaSimple('iih', 'Casos nuevos de infección intrahospitalaria', v.infecciones),
                ...GRUPOS_EPI.filter((g) => g.infeccion).map((g) => filaSimple(g.clave, `· ${g.label}`, v.porGrupo[g.clave])),
                filaSimple('muertesNeonatales', 'Muertes neonatales', v.muertesNeonatales),
                filaSimple('muertesMaternas', 'Muertes maternas', v.muertesMaternas),
              ],
            },
            tablaIndicadores(ctx, [16]),
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'farmacia',
    numero: 12,
    titulo: 'Farmacia',
    fuente: { tipo: 'area', area: 'farmacia' },
    secciones: (ctx) => {
      const r = ctx.datos?.recetas ?? {};
      const despachadas = filaServicios('despachadas', 'Recetas despachadas', (s) => r.despachadas?.[s] ?? null, { total: true });
      const parciales = filaServicios('parciales', 'Recetas atendidas parcialmente', (s) => r.parciales?.[s] ?? null);
      const previo = sumar(SERVICIOS.map((s) => ctx.datosPrevio?.recetas?.despachadas?.[s.clave]));
      const desabastecidos = ctx.datos?.abastecimiento?.desabastecidos ?? null;
      return [
        {
          clave: 'recetas',
          titulo: 'Recetas despachadas y abastecimiento',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} se despacharon`, actual: despachadas.valores.total, previo, mesPrevio: ctx.mesPrevio, unidad: 'recetas' }),
            parciales.valores.total != null && `${numero(parciales.valores.total)} se atendieron solo en parte (${porcentaje(parciales.valores.total, despachadas.valores.total).texto})`,
            desabastecidos != null && `al cierre del mes había ${numero(desabastecidos)} productos desabastecidos`,
          ),
          bloques: [
            { tipo: 'tabla', columnas: COLUMNAS_SERVICIO, filas: [despachadas, parciales] },
            torta('Recetas despachadas por servicio', SERVICIOS.map((s) => ({ label: s.label, valor: despachadas.valores[s.clave] }))),
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'nefrologia',
    numero: 13,
    titulo: 'Nefrología y Hemodiálisis',
    fuente: { tipo: 'area', area: 'nefrologia' },
    secciones: (ctx) => {
      const p = ctx.datos?.programa ?? {};
      return [
        {
          clave: 'programa',
          titulo: 'Programa de hemodiálisis',
          texto: parrafo(
            fraseComparada({ prefijo: `en ${ctx.mes} se realizaron`, actual: p.sesiones, previo: ctx.datosPrevio?.programa?.sesiones, mesPrevio: ctx.mesPrevio, unidad: 'sesiones de hemodiálisis' }),
            p.pacientes != null && `el programa atendió a ${numero(p.pacientes)} pacientes, ${numero(p.nuevos)} de ellos nuevos`,
          ),
          bloques: [
            {
              tipo: 'tabla',
              columnas: COLUMNA_MES(ctx),
              filas: [
                filaSimple('pacientes', 'Pacientes en el programa', p.pacientes),
                filaSimple('nuevos', 'Pacientes nuevos', p.nuevos),
                filaSimple('sesiones', 'Sesiones de hemodiálisis', p.sesiones),
                filaSimple('fallecidos', 'Pacientes fallecidos', p.fallecidos),
                filaSimple('maquinas', 'Máquinas de hemodiálisis operativas', p.maquinas),
              ],
            },
          ],
          fuente: fuenteArea(ctx),
        },
      ];
    },
  }),

  capitulo({
    clave: 'indicadores',
    numero: 14,
    titulo: 'Indicadores de Gestión Hospitalaria',
    /* Mezcla fuentes: se incluye si al menos un indicador tiene valor, y cada
       uno que no lo tiene figura como «Sin datos». */
    fuente: { tipo: 'mixta' },
    secciones: (ctx) =>
      ['A', 'B', 'C'].map((cat) => {
        const lista = ctx.indicadores.filter((i) => i.categoria === cat);
        const titulos = { A: 'Indicadores de producción y rendimiento', B: 'Indicadores de eficiencia', C: 'Indicadores de calidad' };
        return {
          clave: `cat-${cat}`,
          titulo: titulos[cat],
          texto: parrafo(
            `${lista.filter((i) => i.valor != null).length} de ${lista.length} indicadores tienen dato en ${ctx.mes}`,
            `el acumulado suma numeradores y denominadores de ${ctx.desdeTexto} a ${ctx.mes}, sin promediar los valores mensuales`,
          ),
          bloques: [
            {
              tipo: 'tabla',
              columnas: [
                { clave: 'valor', label: ctx.mesTitulo },
                { clave: 'acumulado', label: 'Acumulado del año' },
              ],
              filas: lista.map((i) => ({
                clave: `ind-${i.n}`,
                label: `${i.n}. ${i.nombre}`,
                valores: { valor: textoIndicador(i), acumulado: textoIndicador({ ...i, valor: ctx.acumulado.find((a) => a.n === i.n)?.valor ?? null }) },
              })),
            },
          ],
          fuente: 'Fuente: formato de Indicadores de Gestión Hospitalaria, GERESA Loreto (estándar MINSA). Elaborado: Oficina de Estadística e Informática.',
        };
      }),
  }),
]);
