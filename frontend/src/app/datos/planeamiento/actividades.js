/* Las actividades operativas del POI 2026 que alimentan los oficios de las nueve
   áreas, y de dónde sale la ejecución física de cada una.

   Fuente: «Actividades operativas por oficio — HRL» (Planeamiento, octubre de
   2026), que cruza el cuadro de actividades operativas de enero a octubre de 2026
   con los oficios de junio de cada área. De él se toman el código, el nombre, la
   actividad presupuestal, la meta física anual, qué dato del oficio la alimenta,
   la clasificación de su origen y lo que CEPLAN tenía registrado. **No** se toman
   los usuarios ni las claves de CEPLAN que trae ese archivo, ni los montos: lo
   que aquí se registra es la ejecución física.

   `origenCeplan` es cómo se llenaba en CEPLAN según esa revisión (directo,
   calculo, prorrateo, conteo, otra-fuente, indeterminado). `calculo` es cómo se
   llena en este sistema (ver `dominio/actividades.js`):

     { tipo: 'oficio', derivar(datos, periodo), detalle }   del reporte del área
     { tipo: 'informe', detalle }                           1 por reporte entregado
     { tipo: 'calendario', unidad: 'semanas' | 'dias', detalle }
     { tipo: 'digitar', referencias?: [{ etiqueta, derivar }] }

   Las `referencias` de una actividad que se digita son cifras del oficio que se
   le parecen, para que quien digita tenga a la vista con qué compararla. No se
   copian solas: si fueran la cifra, la actividad sería `oficio`.

   Una actividad cuyo `nivel` es «verificar» tiene fórmula (el cuadro dice qué
   línea del oficio debería ser), pero CEPLAN registraba otra cosa: se calcula y
   se marca, para confirmarla con el área. */

import { cifrasCentroQuirurgico } from '../formatos/centro-quirurgico-calculos.js';
import { totalF1 } from '../formatos/lavanderia-calculos.js';
import { totalDelMes } from '../formatos/nefrologia-calculos.js';
import { valor as valorGin, totalColumna, sumar } from '../formatos/ginecologia-calculos.js';
import { totalAtenciones, totalConvenios } from '../formatos/farmacia-calculos.js';
import { totalCuadro as totalLab, totalExamen } from '../formatos/laboratorio-calculos.js';
import { cifrasImagenes } from '../formatos/imagenes-calculos.js';
import { cifrasNutricion } from '../formatos/nutricion-calculos.js';

export const ANIO_ACTIVIDADES = '2026';

const nef = (clave) => (datos) => {
  const v = datos?.f1?.[clave];
  return typeof v === 'number' ? v : null;
};
const partos = (tipos) => (datos) => sumar(tipos.map((t) => valorGin(datos, 'f2', t, 'total_partos')));
const lab = (...cuadros) => (datos) => sumar(cuadros.map((c) => totalLab(datos, c)));
const examenLab = (cuadro, examen) => (datos) => totalExamen(datos, cuadro, examen);
const imagenes = (modalidad) => (datos) => cifrasImagenes(datos).modalidades[modalidad] ?? null;

const oficio = (derivar, detalle) => ({ tipo: 'oficio', derivar, detalle });
const informe = (detalle) => ({ tipo: 'informe', detalle });
const digitar = (referencias = []) => ({ tipo: 'digitar', referencias });

/* La fórmula de cada actividad, por código. Va aparte del catálogo para que el
   catálogo se pueda comparar línea por línea con el archivo de Planeamiento. */
const CALCULOS = {
  /* Centro Quirúrgico. La producción sale del RESUMEN (ver su calculos.js). */
  AOI00087400341: informe('1 por cada mes en que Centro Quirúrgico entregó su reporte estadístico.'),
  AOI00087400349: oficio((d) => cifrasCentroQuirurgico(d).mayores, 'Cirugías mayores del RESUMEN: programadas + emergencia.'),
  AOI00087400500: oficio((d) => cifrasCentroQuirurgico(d).menores, 'Cirugías menores del RESUMEN: programadas + emergencia.'),
  AOI00087400889: digitar([{ etiqueta: 'Intervenciones realizadas en el mes', derivar: (d) => cifrasCentroQuirurgico(d).realizadas }]),
  AOI00087400890: digitar([{ etiqueta: 'Intervenciones realizadas en el mes', derivar: (d) => cifrasCentroQuirurgico(d).realizadas }]),
  AOI00087400066: oficio((d) => cifrasCentroQuirurgico(d).emergencia, 'Intervenciones de emergencia del RESUMEN: mayores + menores.'),

  /* Costura y Lavandería. */
  AOI00087400382: oficio((d, periodo) => totalF1(d?.f1, periodo), 'Kilogramos de ropa lavada del mes: el total del Formato 1, todos los servicios.'),

  /* Nefrología y Hemodiálisis. */
  AOI00087400087: oficio(nef('atencion_consultorio'), '«Atención de consultorio» del cuadro del mes.'),
  AOI00087400472: digitar([
    { etiqueta: 'Sesiones atendidas', derivar: (d) => totalDelMes(d?.f1 ?? {}) },
    { etiqueta: 'Pacientes atendidos', derivar: nef('pacientes_atendidos') },
  ]),
  AOI00087400473: digitar(),
  AOI00087400719: oficio(nef('colocacion_cateter'), '«Colocación de catéter venoso» del cuadro del mes.'),
  AOI00087400720: oficio(nef('cambio_cvc_permanente'), '«Cambio de CVC · permanente» del cuadro del mes.'),
  AOI00087400721: oficio(nef('cambio_cvc_temporal'), '«Cambio de CVC · temporales» del cuadro del mes.'),
  AOI00087401005: digitar([
    { etiqueta: 'Pacientes atendidos', derivar: nef('pacientes_atendidos') },
    { etiqueta: 'Sesiones atendidas', derivar: (d) => totalDelMes(d?.f1 ?? {}) },
  ]),

  /* Gineco-Obstetricia: el cuadro 2 (partos) llega desde setiembre de 2026. */
  AOI00087400033: digitar([{ etiqueta: 'Controles prenatales realizados', derivar: (d) => totalColumna(d, 'f1', 'controles_prenatales') }]),
  AOI00087400036: oficio(partos(['vaginal_sin_complicaciones', 'vaginal_con_complicaciones']), 'Partos vaginales sin complicaciones + con complicaciones (cuadro 2).'),
  AOI00087400949: digitar([{ etiqueta: 'Partos vaginales con complicaciones', derivar: partos(['vaginal_con_complicaciones']) }]),
  AOI00087400950: digitar([{ etiqueta: 'Partos vaginales con complicaciones', derivar: partos(['vaginal_con_complicaciones']) }]),
  AOI00087400056: oficio(partos(['cesarea_sin_complicaciones', 'cesarea_con_complicaciones']), 'Cesáreas sin complicaciones + con complicaciones (cuadro 2).'),
  AOI00087400342: oficio((d) => totalColumna(d, 'f2', 'nacidos_vivos'), 'Nacidos vivos, todos los tipos de parto (cuadro 2).'),

  /* Farmacia. */
  AOI00087400313: oficio((d) => totalAtenciones(d?.f1 ?? {}), 'Total de atenciones (recetas) del Formato 1: SIS, convenios, programas, boletas y otros.'),
  AOI00087400999: oficio((d) => d?.f1?.sis?.oncologia ?? null, 'Atenciones SIS de Oncología del Formato 1. El cuadro dice «Farmacia de mezclas oncológicas»: confirme que es la misma línea.'),
  AOI00087400938: digitar([{ etiqueta: 'Atenciones por convenio', derivar: (d) => totalConvenios(d?.f1 ?? {}) }]),

  /* Laboratorio. */
  AOI00087400400: oficio(examenLab('actividades', 'programacion'), '«Programación, seguimiento y evaluación de actividades» del libro del mes.'),
  AOI00087400997: oficio(lab('microbiologia', 'inmuno_serologicos'), 'Total de exámenes de Microbiología + Inmuno-Serológicos.'),
  AOI00087400402: oficio(lab('anatomia_patologica'), 'Total de Anatomía Patológica.'),
  AOI00087400403: oficio(lab('bioquimica', 'hematologia'), 'Total de exámenes Bioquímicos + Hematológicos-Hemostásicos.'),
  AOI00087400073: oficio(examenLab('metaxenicas', 'malaria'), 'Exámenes de malaria (Programas / Metaxénicas).'),
  AOI00087400646: oficio(examenLab('metaxenicas', 'dengue_rapida'), 'Pruebas rápidas de dengue (Programas / Metaxénicas).'),
  AOI00087400651: oficio(examenLab('metaxenicas', 'leptospira_rapida'), 'Pruebas rápidas de leptospira (Programas / Metaxénicas).'),
  AOI00087400024: digitar([{ etiqueta: 'Exámenes de tuberculosis', derivar: examenLab('metaxenicas', 'tuberculosis') }]),
  AOI00087400520: digitar([{ etiqueta: 'Exámenes de tuberculosis', derivar: examenLab('metaxenicas', 'tuberculosis') }]),

  /* Diagnóstico por Imágenes. */
  AOI00087400404: informe('1 por cada mes en que Diagnóstico por Imágenes entregó su reporte estadístico.'),
  AOI00087400351: oficio(imagenes('ecografia'), 'Exámenes ecográficos del Formato 1.'),
  AOI00087400507: oficio(imagenes('tomografia'), 'Exámenes tomográficos del Formato 2.'),
  AOI00087400509: oficio(imagenes('mamografia'), 'Exámenes mamográficos del Formato 3, con la campaña.'),
  AOI00087400371: oficio(
    (d) => sumar(['hosp', 'emerg'].map((s) => d?.f4?.examenes?.[s] ?? null)),
    'Rayos X de hospitalización + emergencia del Formato 4, sin consulta externa: el criterio con que cuadra lo registrado en CEPLAN.',
  ),
  AOI00087400060: digitar([
    { etiqueta: 'Exámenes mamográficos', derivar: imagenes('mamografia') },
    { etiqueta: 'Mamografías de campaña', derivar: (d) => d?.f3?.campana ?? null },
  ]),

  /* Epidemiología: su meta se mide en semanas y en días, no en casos. */
  AOI00087401030: { tipo: 'calendario', unidad: 'semanas', detalle: 'Semanas epidemiológicas que terminan en el mes (52 en 2026). Los casos del oficio son el sustento, no la cifra.' },
  AOI00087400120: { tipo: 'calendario', unidad: 'dias', detalle: 'Días del mes (365 en 2026).' },
  AOI00087400683: digitar(),

  /* Nutrición y Dietética. */
  AOI00087400385: informe('1 por cada mes en que Nutrición entregó su reporte estadístico.'),
  AOI00087400513: oficio((d, periodo) => cifrasNutricion(d, periodo).pacientesHosp, 'Raciones para pacientes de hospitalización (sin emergencia).'),
  AOI00087400514: oficio((d, periodo) => cifrasNutricion(d, periodo).comensales, 'Raciones para el personal (comensales) de hospitalización + emergencia.'),
};

const CATALOGO = [
  {
    codigo: 'AOI00087400341',
    nombre: 'PROGRAMACIÓN SEGUIMIENTO Y EVALUACIÓN DE CIRUGÍAS',
    area: 'centro-quirurgico',
    actividadPresupuestal: '5001563 - ATENCION EN HOSPITALIZACION',
    meta: 12,
    mide: '1 informe estadístico mensual',
    nivel: 'directa',
    origenCeplan: 'conteo',
    ceplan: { ejecutado: 9, como: '1 por mes por emitir el informe estadístico (12 al año). No usa cifras del oficio; el oficio es el sustento.' },
  },
  {
    codigo: 'AOI00087400349',
    nombre: 'INTERVENCIONES QUIRÚRGICAS MAYORES',
    area: 'centro-quirurgico',
    actividadPresupuestal: '5001563 - ATENCION EN HOSPITALIZACION',
    meta: 5000,
    mide: 'Cirugías mayores (programadas + emergencia)',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 3416, como: 'Suma mensual de \'Cirugías mayores\' (programadas + emergencia) del oficio.' },
  },
  {
    codigo: 'AOI00087400500',
    nombre: 'INTERVENCIONES QUIRÚRGICAS MENORES (COMPLEMENTARIAS)',
    area: 'centro-quirurgico',
    actividadPresupuestal: '5001563 - ATENCION EN HOSPITALIZACION',
    meta: 600,
    mide: 'Cirugías menores',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 152, como: 'Debería ser la suma de \'Cirugías menores\' del oficio.' },
    observacion: 'Ejecución acumulada (152) es menor que lo que el oficio reporta solo en ene–jun (400). No se puede reconstruir el origen.',
  },
  {
    codigo: 'AOI00087400889',
    nombre: 'ATENCION POST OPERATORIA EN TERAPIA DEL DOLOR',
    area: 'centro-quirurgico',
    actividadPresupuestal: '5001563 - ATENCION EN HOSPITALIZACION',
    meta: 3731,
    mide: 'N° intervenciones quirúrgicas realizadas',
    nivel: 'verificar',
    origenCeplan: 'prorrateo',
    ceplan: { ejecutado: 2799, como: 'Meta anual 3,731 ÷ 12 = 311 por mes, copiado igual en cada mes de Seguimiento POI (311 × 9 = 2,799). Confirmado en captura de CEPLAN.' },
    observacion: 'Misma meta que sala de recuperación. Ejecución = programación todos los meses; no refleja producción real. Total en CEPLAN muestra 2,177 aunque hay 9 meses con 311 (2,799).',
  },
  {
    codigo: 'AOI00087400890',
    nombre: 'ATENCION EN SALA DE RECUPERACIÓN',
    area: 'centro-quirurgico',
    actividadPresupuestal: '5001563 - ATENCION EN HOSPITALIZACION',
    meta: 3731,
    mide: 'N° intervenciones quirúrgicas realizadas (pasan a URPA)',
    nivel: 'verificar',
    origenCeplan: 'prorrateo',
    ceplan: { ejecutado: 2799, como: 'Mismo patrón que la AOI 889: 311 × 9 = 2,799 (inferido; mismos valores de meta y ejecución).' },
    observacion: 'Ejecución idéntica a la AOI 889 y exactamente igual a la meta mensual × 9. Verificar en CEPLAN.',
  },
  {
    codigo: 'AOI00087400066',
    nombre: 'ATENCION DE LA EMERGENCIA QUIRURGICA',
    area: 'centro-quirurgico',
    actividadPresupuestal: '5005905 - ATENCION DE LA EMERGENCIA QUIRURGICA',
    meta: 2640,
    mide: 'Intervenciones de emergencia',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 1521, como: 'Suma mensual de \'Intervenciones de emergencia\' del oficio.' },
    observacion: 'Totales físicos en la fila de total del bloque. Promedio de ejecución (~169/mes) algo menor que el del oficio (~196/mes); revisar hasta qué mes está registrado.',
  },
  {
    codigo: 'AOI00087400382',
    nombre: 'ASEPSIA Y BIOSEGURIDAD DEL ROPAJE HOSPITALARIO EN EL SERVICIO DE LAVANDERÍA',
    area: 'lavanderia',
    actividadPresupuestal: '5001195 - SERVICIOS GENERALES',
    meta: 150000,
    mide: 'Kilogramos de ropa lavada (13,616 kg en junio)',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 125056, como: 'Debería ser el total mensual de kilos de ropa lavada del oficio.' },
    observacion: 'Unidad: kg. 125,056 es casi exactamente 12,500 (meta mensual) × 10 = 125,000. Junio real fue 13,616. Puede ser prorrateo con ajuste o datos reales; no se puede determinar.',
  },
  {
    codigo: 'AOI00087400087',
    nombre: 'CONSULTA EXTERNA A PACIENTES NEFROLOGICOS',
    area: 'nefrologia',
    actividadPresupuestal: '5001562 - ATENCION EN CONSULTAS EXTERNAS',
    meta: 1100,
    mide: 'Atención de consultorio',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 473, como: 'Suma mensual de \'Atención de consultorio\' del oficio.' },
    observacion: 'Acumulado (473) parece llegar solo hasta julio; revisar meses pendientes.',
  },
  {
    codigo: 'AOI00087400472',
    nombre: 'SESIONES DE HEMODIALISIS',
    area: 'nefrologia',
    actividadPresupuestal: '5001562 - ATENCION EN CONSULTAS EXTERNAS',
    meta: 960,
    mide: 'Pacientes atendidos / total de sesiones',
    nivel: 'verificar',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 537, como: 'Toma \'Pacientes atendidos\' del oficio, no sesiones.' },
    observacion: 'Meta 960 ≈ 80 pacientes/mes; el oficio reporta ~880 sesiones/mes. Verificar unidad de medida. El nombre dice \'sesiones\' pero la cifra corresponde a pacientes. Además no coincide con la AOI 1005 (488), que mide lo mismo.',
  },
  {
    codigo: 'AOI00087400473',
    nombre: 'DIÁLISIS DE EMERGENCIAS',
    area: 'nefrologia',
    actividadPresupuestal: '5001562 - ATENCION EN CONSULTAS EXTERNAS',
    meta: 152,
    mide: 'No se desagrega en el oficio',
    nivel: 'verificar',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 128, como: 'El oficio no reporta diálisis de emergencia por separado.' },
    observacion: '128 ≈ meta mensual 12.67 × 10; podría ser prorrateo pero no es exacto. Origen desconocido.',
  },
  {
    codigo: 'AOI00087400719',
    nombre: 'COLOCACION DE CATETER VENOSO',
    area: 'nefrologia',
    actividadPresupuestal: '5001562 - ATENCION EN CONSULTAS EXTERNAS',
    meta: 150,
    mide: 'Colocación de catéter venoso',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 108, como: 'Debería ser \'Colocación de catéter venoso\' del oficio.' },
    observacion: '108 coincide exactamente con 12 × 9 (meta mensual redondeada × 9 meses), pero también podría ser 73 + jul–set. Verificar en CEPLAN si repite 12 cada mes.',
  },
  {
    codigo: 'AOI00087400720',
    nombre: 'CAMBIO DE CATETER VENOSO CENTRAL PERMANENTE',
    area: 'nefrologia',
    actividadPresupuestal: '5001562 - ATENCION EN CONSULTAS EXTERNAS',
    meta: 60,
    mide: 'Cambio de CVC – permanente',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 39, como: 'Suma mensual de \'Cambio de CVC – permanente\' del oficio.' },
  },
  {
    codigo: 'AOI00087400721',
    nombre: 'CAMBIO DE CATETER VENOSO CENTRAL TEMPORAL',
    area: 'nefrologia',
    actividadPresupuestal: '5001562 - ATENCION EN CONSULTAS EXTERNAS',
    meta: 40,
    mide: 'Cambio de CVC – temporal',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 25, como: 'Debería ser \'Cambio de CVC – temporales\' del oficio.' },
    observacion: 'Ejecución acumulada (25) es menor que lo que el oficio reporta solo en ene–jun (32).',
  },
  {
    codigo: 'AOI00087401005',
    nombre: 'HEMODIALISIS POR INSUFICIENCIA RENAL',
    area: 'nefrologia',
    actividadPresupuestal: '5006372 - HEMODIALISIS POR INSUFICIENCIA RENAL',
    meta: 960,
    mide: 'Pacientes atendidos',
    nivel: 'verificar',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 488, como: 'Mismo concepto que la AOI 472 (pacientes en hemodiálisis).' },
    observacion: 'Sin responsable registrado en el cuadro. Misma meta (960) que la AOI 472 pero distinta ejecución (488 vs 537). No se puede saber cuál cifra usan.',
  },
  {
    codigo: 'AOI00087400033',
    nombre: 'ATENCION A LA GESTANTE',
    area: 'ginecologia',
    actividadPresupuestal: '5000037 - BRINDAR ATENCION PRENATAL REENFOCADA',
    meta: 400,
    mide: 'Controles prenatales realizados',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 320, como: 'Debería salir de \'Controles prenatales realizados\' del oficio.' },
    observacion: '320 acumulado es menor que un solo mes del oficio. Probablemente viene del HIS (gestantes atendidas), no del oficio.',
  },
  {
    codigo: 'AOI00087400036',
    nombre: 'ATENCION DEL PARTO NORMAL',
    area: 'ginecologia',
    actividadPresupuestal: '5000045 - ATENCION DEL PARTO NORMAL',
    meta: 1500,
    mide: 'Parto vaginal sin complicaciones',
    nivel: 'verificar',
    origenCeplan: 'calculo',
    ceplan: { ejecutado: 893, como: 'Suma de \'Parto vaginal sin complicaciones\' + \'con complicaciones\' del oficio (promedio ~99/mes).' },
    observacion: '893/9 meses ≈ 99/mes, cercano al total de partos vaginales (97 en junio). Verificar. Si solo se tomara \'sin complicaciones\' (68/mes) no alcanzaría 893. Confirmar criterio.',
  },
  {
    codigo: 'AOI00087400949',
    nombre: 'TRABAJO DE PARTO DISFUNCIONAL',
    area: 'ginecologia',
    actividadPresupuestal: '5000046 - BRINDAR ATENCION DEL PARTO COMPLICADO NO QUIRURGICO',
    meta: 180,
    mide: 'Parto vaginal con complicaciones',
    nivel: 'verificar',
    origenCeplan: 'otra-fuente',
    ceplan: { ejecutado: 145, como: 'El oficio no desagrega trabajo de parto disfuncional; viene de registros del servicio/HIS.' },
    observacion: 'Su ejecución (145) + hemorragias (104) = 249 supera el total de partos vaginales con complicaciones del oficio.',
  },
  {
    codigo: 'AOI00087400950',
    nombre: 'HEMORRAGIAS INTRAPARTO Y POSTPARTO',
    area: 'ginecologia',
    actividadPresupuestal: '5000046 - BRINDAR ATENCION DEL PARTO COMPLICADO NO QUIRURGICO',
    meta: 230,
    mide: 'Parto vaginal con complicaciones',
    nivel: 'verificar',
    origenCeplan: 'otra-fuente',
    ceplan: { ejecutado: 104, como: 'El oficio no desagrega hemorragias intraparto/postparto; viene de registros del servicio/HIS.' },
  },
  {
    codigo: 'AOI00087400056',
    nombre: 'CESAREA',
    area: 'ginecologia',
    actividadPresupuestal: '5000047 - BRINDAR ATENCION DEL PARTO COMPLICADO QUIRURGICO',
    meta: 1400,
    mide: 'Cesárea sin + con complicaciones',
    nivel: 'directa',
    origenCeplan: 'calculo',
    ceplan: { ejecutado: 1109, como: 'Suma de \'Cesárea sin complicaciones\' + \'con complicaciones\' del oficio.' },
    observacion: 'Totales físicos en la fila de total del bloque.',
  },
  {
    codigo: 'AOI00087400342',
    nombre: 'ATENCION INMEDIATA DEL RECIEN NACIDO',
    area: 'ginecologia',
    actividadPresupuestal: '5000053 - ATENDER AL RECIEN NACIDO NORMAL',
    meta: 3200,
    mide: 'Nacidos vivos',
    nivel: 'verificar',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 2038, como: 'Total de \'Nacidos vivos\' del oficio.' },
  },
  {
    codigo: 'AOI00087400313',
    nombre: 'DISPENSACIÓN DE PRODUCTOS FARMACÉUTICOS, HOSPITALARIOS MÉDICOS Y PRODUCTOS SANITARIOS PARA PACIENTES DE LOS SERVICIOS MÉDICOS',
    area: 'farmacia',
    actividadPresupuestal: '5002268 - SERVICIO DE DISPENSION DE MEDICAMENTOS Y PRODUCTOS FARMACEUTICOS,',
    meta: 241500,
    mide: 'Total de recetas atendidas (23,439 en junio)',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 189313, como: '\'Total atenciones\' (recetas) mensual del oficio de Farmacia, acumulado. Coincide: 142,638 (ene–jun) + ~23,300 × 2 ≈ 189,313 (acumulado a agosto).' },
  },
  {
    codigo: 'AOI00087400999',
    nombre: 'ELABORACIÓN Y DISPENSACIÓN DE FORMULAS MAGISTRALES, MEZCLAS ENTERALES Y PARANTERALES ESPECIALIZADAS EN LOS DIFERENTES SERVICIOS DEL HOSPITAL',
    area: 'farmacia',
    actividadPresupuestal: '5002268 - SERVICIO DE DISPENSION DE MEDICAMENTOS Y PRODUCTOS FARMACEUTICOS,',
    meta: 1500,
    mide: 'Farmacia de mezclas oncológicas (102 en junio)',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 933, como: 'Recetas de \'Farmacia de mezclas oncológicas\' del oficio.' },
  },
  {
    codigo: 'AOI00087400938',
    nombre: 'CONSULTA EXTERNA, EMERGENCIA Y HOSPITALIZACION',
    area: 'farmacia',
    actividadPresupuestal: '5001566 - OTRAS ATENCIONES DE SALUD ESPECIALIZADAS',
    meta: 1000,
    mide: 'Convenios (posible)',
    nivel: 'verificar',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 748, como: 'No identificado en el oficio.' },
    observacion: 'Mismo responsable que la dispensación. 748 ≈ 83.33 × 9 (meta mensual × 9 = 750); posible prorrateo con ajuste. Ninguna línea del oficio coincide.',
  },
  {
    codigo: 'AOI00087400400',
    nombre: 'PROGRAMACIÓN,SEGUIMIENTO Y EVALUACIÓN DE ACTIVIDADES',
    area: 'laboratorio',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 34,
    mide: 'Línea \'Programación, seguimiento y evaluación de actividades\'',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 26, como: 'El oficio tiene una línea \'Programación, seguimiento y evaluación de actividades\'.' },
    observacion: 'Meta 34 no es múltiplo de 12; 26 no coincide con conteo mensual fijo. Verificar valor que reporta el oficio.',
  },
  {
    codigo: 'AOI00087400997',
    nombre: 'EXAMENES DE PROCEDIMIENTOS MICROBIOLÓGICOS E INMUNOLÓGICOS',
    area: 'laboratorio',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 110700,
    mide: 'Exámenes microbiológicos (760) + inmunológicos (3,726)',
    nivel: 'directa',
    origenCeplan: 'calculo',
    ceplan: { ejecutado: 45262, como: 'Suma de \'Procedimientos microbiológicos\' + \'inmunológicos\' del oficio.' },
  },
  {
    codigo: 'AOI00087400402',
    nombre: 'EXAMEN DE PROCEDIMIENTOS DE ANATOMÍA PATOLÓGICA',
    area: 'laboratorio',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 20000,
    mide: 'Examen de procedimiento anatomopatológico (3,573)',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 14281, como: 'Debería ser \'Examen de procedimiento anatomopatológico\' del oficio.' },
    observacion: 'Promedio de ejecución (~1,590/mes) es menos de la mitad de lo que reporta el oficio en junio. Puede que usen solo histopatología/citología.',
  },
  {
    codigo: 'AOI00087400403',
    nombre: 'EXAMEN DE PROCEDIMIENTOS BIOQUÍMICOS - HEMATOLOGICOS HEMOSTÁTICO',
    area: 'laboratorio',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 400000,
    mide: 'Bioquímico (26,484) + hematológico-hemostásico (10,615)',
    nivel: 'directa',
    origenCeplan: 'calculo',
    ceplan: { ejecutado: 365941, como: 'Suma de \'Procedimiento bioquímico\' + \'hematológico-hemostásico\' del oficio.' },
  },
  {
    codigo: 'AOI00087400073',
    nombre: 'LOCALIZACION Y DIAGNOSTICO DE CASOS DE MALARIA',
    area: 'laboratorio',
    actividadPresupuestal: '5000093 - EVALUACION, DIAGNOSTICO Y TRATAMIENTO DE ENFERMEDADES METAXENICAS',
    meta: 4700,
    mide: 'Bloque Programas/Metaxénicas: malaria',
    nivel: 'verificar',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 2883, como: 'Exámenes de malaria del bloque Programas/Metaxénicas del oficio.' },
    observacion: 'Verificar cifra mensual en el oficio.',
  },
  {
    codigo: 'AOI00087400646',
    nombre: 'DETECCION Y DIAGNOSTICO DE CASO PROBABLE DE DENGUE',
    area: 'laboratorio',
    actividadPresupuestal: '5000093 - EVALUACION, DIAGNOSTICO Y TRATAMIENTO DE ENFERMEDADES METAXENICAS',
    meta: 1300,
    mide: 'Prueba rápida de dengue',
    nivel: 'verificar',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 716, como: 'Debería ser \'Prueba rápida de dengue\' del oficio.' },
    observacion: 'No se puede comprobar la cifra con el oficio.',
  },
  {
    codigo: 'AOI00087400651',
    nombre: 'DIAGNOSTICO LABORATORIAL DE LEPTOSPIROSIS',
    area: 'laboratorio',
    actividadPresupuestal: '5000094 - EVALUACION, DIAGNOSTICO Y TRATAMIENTO DE CASOS DE ENFERMEDADES ZOONOTICAS,',
    meta: 29,
    mide: 'Prueba rápida de leptospira',
    nivel: 'verificar',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 2, como: 'Debería ser \'Prueba rápida de leptospira\' del oficio.' },
    observacion: 'Ejecución acumulada (2) es mucho menor que el oficio; probablemente cuentan casos confirmados, no exámenes.',
  },
  {
    codigo: 'AOI00087400024',
    nombre: 'DIAGNOSTICO DE TUBERCULOSIS EXTRA PULMONAR',
    area: 'laboratorio',
    actividadPresupuestal: '5004438 - DIAGNOSTICO DE CASOS DE TUBERCULOSIS',
    meta: 50,
    mide: 'Bloque Programas: tuberculosis',
    nivel: 'verificar',
    origenCeplan: 'otra-fuente',
    ceplan: { ejecutado: 27, como: 'Casos diagnosticados del programa TB (registro de la ESN-TB), no exámenes del oficio.' },
  },
  {
    codigo: 'AOI00087400520',
    nombre: 'DIAGNOSTICO DE TUBERCULOSIS PULMONAR',
    area: 'laboratorio',
    actividadPresupuestal: '5004438 - DIAGNOSTICO DE CASOS DE TUBERCULOSIS',
    meta: 160,
    mide: 'Bloque Programas: tuberculosis',
    nivel: 'verificar',
    origenCeplan: 'otra-fuente',
    ceplan: { ejecutado: 91, como: 'Casos diagnosticados del programa TB, no exámenes del oficio.' },
    observacion: '91 = 13 (meta mensual) × 7 exacto; podría ser prorrateo. Verificar en CEPLAN.',
  },
  {
    codigo: 'AOI00087400404',
    nombre: 'PROGRAMACIÓN,SEGUIMIENTO Y EVALUACIÓN DE ACTIVIDADES DEL DEPARTAMENTO',
    area: 'imagenes',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 12,
    mide: '1 informe estadístico mensual',
    nivel: 'directa',
    origenCeplan: 'conteo',
    ceplan: { ejecutado: 9, como: '1 por mes por emitir el informe estadístico.' },
  },
  {
    codigo: 'AOI00087400351',
    nombre: 'SERVICIO DE PROCEDIMIENTO ESPECIAL (ECOGRAFIAS',
    area: 'imagenes',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 10000,
    mide: 'Exámenes ecográficos (973 en junio)',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 7638, como: 'Total de \'Exámenes ecográficos\' del oficio.' },
  },
  {
    codigo: 'AOI00087400507',
    nombre: 'SERVICIO DE PROCEDIMIENTO ESPECIAL (TOMOGRAFÍA)',
    area: 'imagenes',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 13900,
    mide: 'Exámenes tomográficos (0 en junio – tomógrafo inoperativo)',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 8507, como: 'Debería ser \'Exámenes tomográficos\' del oficio.' },
    observacion: '8,507 acumulado con el tomógrafo inoperativo; revisar en qué meses se registró producción.',
  },
  {
    codigo: 'AOI00087400509',
    nombre: 'SERVICIO DE PROCEDIMIENTO ESPECIAL (MAMOGRAFIA)',
    area: 'imagenes',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 880,
    mide: 'Exámenes mamográficos (385 en junio)',
    nivel: 'directa',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 719, como: 'Debería ser \'Exámenes mamográficos\' del oficio.' },
    observacion: 'Solo junio (385) es más de la mitad del acumulado (719). Posible campaña o registro incompleto en otros meses.',
  },
  {
    codigo: 'AOI00087400371',
    nombre: 'APOYO AL DIAGNOSTICO DE LOS PACIENTES DE LOS DIFERENTES DEPARTAMENTOS)',
    area: 'imagenes',
    actividadPresupuestal: '5001189 - SERVICIOS DE APOYO AL DIAGNOSTICO Y TRATAMIENTO',
    meta: 14400,
    mide: 'Exámenes de Rayos X (1,372 en junio)',
    nivel: 'verificar',
    origenCeplan: 'calculo',
    ceplan: { ejecutado: 7693, como: 'Rayos X de hospitalización + emergencia del oficio (sin consulta externa); coincide con el promedio ~855/mes.' },
    observacion: 'Criterio no explícito: si se usara el total de RX (1,372/mes) no cuadraría. Confirmar.',
  },
  {
    codigo: 'AOI00087400060',
    nombre: 'TAMIZAJE EN MUJER CON MAMOGRAFIA BILATERAL PARA DETECCION DE CANCER DE MAMA',
    area: 'imagenes',
    actividadPresupuestal: '5006006 - TAMIZAJE EN MUJER CON MAMOGRAFIA BILATERAL PARA DETECCION DE CANCER DE MAMA',
    meta: 1034,
    mide: 'Mamografías SIS / campaña',
    nivel: 'verificar',
    origenCeplan: 'indeterminado',
    ceplan: { ejecutado: 668, como: 'Mamografías de tamizaje (SIS/campaña) del oficio.' },
    observacion: 'Totales físicos en la fila de total del bloque. Comparte dato con la AOI 509 (719) pero registra 668; no se sabe qué parte del oficio usa cada una.',
  },
  {
    codigo: 'AOI00087401030',
    nombre: 'BÚSQUEDA Y NOTIFICACIÓN DE LAS ENFERMEDADES Y/O EVENTOS SUJETOS A VIGILANCIA EPIDEMIOLÓGICA',
    area: 'epidemiologia',
    actividadPresupuestal: '5001286 - VIGILANCIA Y CONTROL EPIDEMIOLOGICO',
    meta: 52,
    mide: 'Sustento de la notificación (casos nuevos de IIH)',
    nivel: 'verificar',
    origenCeplan: 'conteo',
    ceplan: { ejecutado: 43, como: 'Semanas epidemiológicas transcurridas (52 al año; 43 = semana a fines de octubre). No usa cifras del oficio.' },
    observacion: 'La meta se mide en semanas, no en casos: el oficio sirve como evidencia, no como cifra.',
  },
  {
    codigo: 'AOI00087400120',
    nombre: 'CONTROL DE INFECCIONES ASOCIADAS A LA SALUD AMBIENTAL Y DISPOSICIÓN FINAL DE RESIDUOS SÓLIDOS',
    area: 'epidemiologia',
    actividadPresupuestal: '5001286 - VIGILANCIA Y CONTROL EPIDEMIOLOGICO',
    meta: 365,
    mide: 'Sustento (infecciones asociadas)',
    nivel: 'verificar',
    origenCeplan: 'conteo',
    ceplan: { ejecutado: 304, como: 'Días transcurridos (365 al año; 304 = 1 ene – 31 oct). No usa cifras del oficio.' },
    observacion: 'La meta se mide en días.',
  },
  {
    codigo: 'AOI00087400683',
    nombre: 'ELABORACION DE DOCUMENTOS VARIOS',
    area: 'epidemiologia',
    actividadPresupuestal: '5001286 - VIGILANCIA Y CONTROL EPIDEMIOLOGICO',
    meta: 240,
    mide: 'Sustento documental',
    nivel: 'verificar',
    origenCeplan: 'prorrateo',
    ceplan: { ejecutado: 200, como: 'Meta 240 ÷ 12 = 20 por mes × 10 meses = 200.' },
    observacion: 'Ejecución exactamente igual a la meta mensual × 10.',
  },
  {
    codigo: 'AOI00087400385',
    nombre: 'PROGRAMACIÓN, SEGUIMIENTO Y EVALUACIÓN DE LAS ACTIVIDADES DEL DEPARTAMENTO',
    area: 'nutricion',
    actividadPresupuestal: '5000723 - DISPONIBILIDAD DE ALIMENTOS CON CALIDAD NUTRICIONAL PARA LA POBLACION,',
    meta: 12,
    mide: '1 informe estadístico mensual',
    nivel: 'directa',
    origenCeplan: 'conteo',
    ceplan: { ejecutado: 9, como: '1 por mes por emitir el informe estadístico.' },
  },
  {
    codigo: 'AOI00087400513',
    nombre: 'ATENCION DE RACIONES PARA PACIENTES HOSPITALIZADOS',
    area: 'nutricion',
    actividadPresupuestal: '5000723 - DISPONIBILIDAD DE ALIMENTOS CON CALIDAD NUTRICIONAL PARA LA POBLACION,',
    meta: 180000,
    mide: 'Comensales pacientes (hospitalización + emergencia)',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 135840, como: 'Raciones de pacientes del servicio de hospitalización del oficio.' },
    observacion: 'Promedio ~15,100/mes coincide con hospitalización; no incluye emergencia (3,555).',
  },
  {
    codigo: 'AOI00087400514',
    nombre: 'ATENCIÓN DE RACIONES PARA PERSONAL DE TURNO',
    area: 'nutricion',
    actividadPresupuestal: '5000723 - DISPONIBILIDAD DE ALIMENTOS CON CALIDAD NUTRICIONAL PARA LA POBLACION,',
    meta: 410000,
    mide: 'Comensales personal asistencial y administrativo',
    nivel: 'directa',
    origenCeplan: 'directo',
    ceplan: { ejecutado: 255398, como: 'Raciones de comensales (personal asistencial y administrativo) del oficio.' },
  },
];

export const ACTIVIDADES = Object.freeze(CATALOGO.map((a) => Object.freeze({ ...a, calculo: Object.freeze(CALCULOS[a.codigo]) })));

/* Las áreas en el orden del archivo de Planeamiento. */
export const AREAS_CON_ACTIVIDADES = Object.freeze([...new Set(ACTIVIDADES.map((a) => a.area))]);

export function actividad(codigo) {
  return ACTIVIDADES.find((a) => a.codigo === codigo) ?? null;
}

export function actividadesDe(claveArea) {
  return ACTIVIDADES.filter((a) => a.area === claveArea);
}

/* «AOI00087400349» → «400349», como se nombra en el cuadro y en CEPLAN. */
export function codigoCorto(codigo) {
  return codigo.slice(-6);
}
