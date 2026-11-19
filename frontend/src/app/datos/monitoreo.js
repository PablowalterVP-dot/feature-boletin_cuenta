/* El panel de monitoreo: los 34 indicadores del Anexo I de 2026 y de dónde sale cada uno.

   Dos bloques, porque no todos se le evalúan al hospital:

     hospital   los 21 cuyo ámbito oficial alcanza a un hospital III-1. Solo estos cuentan
                en el resumen de cumplimiento.
     poblacion  6 que solo alcanzan a hospitales con población asignada.
     otro       7 que se evalúan a otros (DIRESA, redes, primer nivel, CSMC, INEN).

   Los dos últimos forman «Otros indicadores»: se muestran con lo que haya, rotulado como de
   la región, y sin estado frente a la meta. Una cifra de toda la región leída como del
   hospital le atribuiría algo que no midió.

   Las situaciones dicen de dónde sale la cifra, y ninguna se disfraza de otra:

     oficial           la publica MINSA en el reporte DL 1153.
     oficial_y_propio  además se calcula aquí con lo que entregan las áreas o Estadística.
                       Las dos lecturas se muestran lado a lado: nunca se mezclan.
     requiere          no llega en el reporte. Hace falta que una oficina envíe los datos,
                       y la tarjeta dice cuáles. Estadística los digita.
     contexto          no se evalúa al hospital.

   Fórmulas, umbrales y logros: Anexo I, firmado en diciembre de 2025. Los que el hospital
   anotó a mano en el Excel no se usan: el de la ficha 11 decía 60 % y el oficial es 45 %. */

import { estaEntregado } from '@/app/dominio/estados.js';
import { acumuladoDe, estadoDeSeries, estadoFrenteAlLogro, valorDe } from '@/app/dominio/monitoreo.js';
import { mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import { paraDiresa, produccion } from './formatos/centro-quirurgico-calculos.js';
import { cifrasEpidemiologia } from './formatos/epidemiologia-calculos.js';
import { cifrasFarmacia } from './formatos/farmacia-calculos.js';
import { cifrasImagenes } from './formatos/imagenes-calculos.js';
import { valorDiresaLaboratorio } from './formatos/laboratorio-calculos.js';

/* Si la Directiva de los Convenios de Gestión 2026 confirma que el hospital tiene población
   asignada, esto pasa a true y las fichas 1, 2, 4, 5, 8 y 10 suben al primer bloque. Hoy no:
   MINSA mide al hospital con el indicador B de telemedicina («sin población asignada»). */
export const HOSPITAL_CON_POBLACION_ASIGNADA = false;

/* Las salas de operaciones del hospital. Si un mes se inhabilita alguna, Estadística lo
   ajusta en la ficha 21 y vale para ese mes: aquí y en la gestión hospitalaria. */
export const SALAS_BASE = 4;

export const SITUACIONES = Object.freeze({
  oficial: { etiqueta: 'Oficial MINSA', tono: 'info', icono: 'sh-stamp' },
  oficial_y_propio: { etiqueta: 'Oficial y del hospital', tono: 'info', icono: 'sh-swap' },
  requiere: { etiqueta: 'Requiere datos', tono: 'none', icono: 'sh-none' },
  contexto: { etiqueta: 'No se evalúa al hospital', tono: 'none', icono: 'sh-info' },
});

export const DIMENSIONES = Object.freeze([
  { clave: 'gh', nombre: 'Gestión hospitalaria' },
  { clave: 'mi', nombre: 'Materno-infantil y prevención' },
  { clave: 'es', nombre: 'Estrategias sanitarias' },
  { clave: 'cs', nombre: 'Calidad y seguridad' },
  /* El mismo nombre que en el Tablero de indicadores: aquí caen también las firmas digitales. */
  { clave: 'si', nombre: 'Sistemas de información y RR. HH.' },
]);

const FUENTES = Object.freeze({
  his_minsa: 'HIS MINSA',
  cnv: 'Certificado de Nacido Vivo (CNV)',
  padron_nominal: 'Padrón Nominal',
  sihce_vih: 'SIHCE-VIH, módulo TAR',
  refcon: 'REFCON',
  sinadef: 'SINADEF',
  seem_egresos: 'SEEM-Egresos',
  seem_emergencia: 'SEEM-Emergencia',
  seti_ipress: 'SETI-IPRESS (SUSALUD)',
  reporte_sala: 'Reporte de sala de operaciones (DGOS)',
  renoxi: 'Formato F500.2 (RENOXI)',
  recursos_salud: 'Recursos de salud (SUSALUD)',
  dpcan: 'Listado de mamógrafos (DPCAN)',
  matriz_uhsma: 'Matriz de camas de salud mental (DGIESP)',
  sigtb: 'SIGTB',
  reunis: 'REUNIS',
  notiweb_iaas: 'Aplicativo de notificación de IAAS (CDC)',
  sismed_ici: 'SISMED, Informe de Consumo Integrado',
  inforhus: 'INFORHUS',
  airhsp: 'AIRHSP',
  planilla: 'Planilla de haberes',
  tua: 'TUA SUSALUD',
  arfsis: 'ARFSIS (SIS)',
  sihce: 'SIHCE',
});

/* La suma de un examen del libro de Laboratorio, en todos sus servicios. Sin dato en
   ninguno, sin dato: no es cero. */
function delLaboratorio(datos, ...examenes) {
  const valores = examenes.flatMap(([grupo, item]) => ['hosp', 'emerg', 'ce'].map((s) => valorDiresaLaboratorio(datos, grupo, item, s)));
  const con = valores.filter((v) => v != null);
  return con.length ? con.reduce((a, b) => a + b, 0) : null;
}

export const salasDelMes = (propios, periodo) => propios?.[periodo]?.salasOperativas ?? SALAS_BASE;

const DEL_ANEXO = 'Según el Anexo I, no se le evalúa a un hospital III-1.';
/* Los textos de este catálogo dicen qué es cada ficha y qué pide el Anexo: no cambian con los
   meses. Lo que depende de las cifras no se escribe aquí: lo calcula `dominio/analisis.js`, o
   va como `hallazgo`, con su fecha, para que no se lea como algo vigente (ver HALLAZGOS). */
const SOLO_POBLACION = 'Solo se evalúa a hospitales con población asignada. Lo que se muestra aquí es de toda la región.';

/* Los 34, en el orden del Anexo. `acumulacion` dice cómo publica MINSA la cifra; equivocarse
   ahí da un acumulado falso. */
export const INDICADORES = Object.freeze([
  { ficha: 1, nombre: 'Recuperación de anemia en niños de 12 a 18 meses', dimension: 'mi', ambito: 'poblacion', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', logro: { tipo: 'minimo', valor: 50, umbral: 40 }, fuentes: ['padron_nominal', 'his_minsa'], motivo: SOLO_POBLACION },
  { ficha: 2, nombre: 'Suplementación preventiva con hierro completa, sin anemia', dimension: 'mi', ambito: 'poblacion', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', logro: { tipo: 'minimo', valor: 70, umbral: 40 }, fuentes: ['padron_nominal', 'his_minsa'], motivo: SOLO_POBLACION },
  { ficha: 3, nombre: 'Tamizaje neonatal metabólico', dimension: 'mi', ambito: 'otro', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada', logro: { tipo: 'minimo', valor: 80, umbral: 50 }, fuentes: ['cnv', 'his_minsa'], motivo: `Se evalúa a redes de salud y a establecimientos I-3 e I-4. ${DEL_ANEXO}` },
  { ficha: 4, nombre: 'Recuperación del crecimiento inadecuado en menores de 2 años', dimension: 'mi', ambito: 'poblacion', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', logro: { tipo: 'minimo', valor: 50, umbral: 20 }, fuentes: ['his_minsa'], motivo: 'Solo se evalúa al primer nivel y a hospitales con población asignada.' },
  { ficha: 5, nombre: 'Niños de 24 meses con vacunas completas', dimension: 'mi', ambito: 'poblacion', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', logro: { tipo: 'minimo', valor: 85, umbral: 70 }, fuentes: ['padron_nominal', 'his_minsa'], motivo: SOLO_POBLACION },
  {
    ficha: 6, nombre: 'Recién nacidos con BCG y anti-hepatitis B en 24 horas', dimension: 'mi', ambito: 'hospital', situacion: 'oficial', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual',
    logro: { tipo: 'minimo', valor: 95, umbral: 90 }, fuentes: ['cnv', 'his_minsa'],
    numerador: 'Recién nacidos con ambas vacunas hasta un día después de nacer', denominador: 'Nacidos en el hospital según CNV, sin los de menos de 1 500 g ni contraindicados',
    formula: 'Vacunados ÷ nacidos × 100',
  },
  { ficha: 7, nombre: 'Éxito del tratamiento de TB sensible', dimension: 'es', ambito: 'otro', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada', logro: { tipo: 'minimo', valor: 90, umbral: 80 }, fuentes: ['sigtb'], motivo: `Se evalúa a DIRIS, DIRESA, GERESA y redes de salud. ${DEL_ANEXO}` },
  { ficha: 8, nombre: 'Contactos de TB que culminan la terapia preventiva', dimension: 'es', ambito: 'poblacion', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada', logro: { tipo: 'minimo', valor: 60, umbral: 20 }, fuentes: ['sigtb'], motivo: SOLO_POBLACION },
  {
    ficha: 9, nombre: 'Terapia preventiva de TB en adultos con VIH que inician TAR', dimension: 'es', ambito: 'hospital', situacion: 'oficial', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada',
    logro: { tipo: 'minimo', valor: 90, umbral: 65 }, fuentes: ['sihce_vih'],
    numerador: 'Personas del denominador que culminan la terapia preventiva', denominador: 'Personas con VIH de 18 años o más que inician TAR, de noviembre de 2025 a octubre de 2026',
    formula: 'Culminan ÷ inician × 100',
    relacionado: { area: 'laboratorio', etiqueta: 'Pruebas rápidas de VIH y baciloscopías (BK)', unidad: 'pruebas', fuente: 'Laboratorio, reporte mensual', leer: (d) => delLaboratorio(d, ['inmunoserologicos', 'vih'], ['bacteriologicos', 'bk']), aclara: 'Son pruebas realizadas a cualquier paciente. No indican cuántas personas con VIH reciben la terapia.' },
  },
  { ficha: 10, nombre: 'Procedimientos estomatológicos preventivos en niños', dimension: 'mi', ambito: 'poblacion', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada', logro: { tipo: 'texto', texto: 'Depende de las evaluaciones por odontólogo' }, fuentes: ['his_minsa'], motivo: 'Solo se evalúa a redes, primer nivel y hospitales con población asignada y cirujano dentista.' },
  {
    ficha: 11, nombre: 'Acceso a anticonceptivos modernos', dimension: 'mi', ambito: 'hospital', situacion: 'oficial', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada',
    logro: { tipo: 'minimo', valor: 45, umbral: 20 }, fuentes: ['his_minsa'],
    numerador: 'Personas del denominador que usaron un método moderno en 12 meses', denominador: 'Personas de 15 a 49 años con consejería en salud sexual y reproductiva, sin embarazadas',
    formula: 'Protegidas ÷ con consejería × 100',
  },
  {
    ficha: 12, nombre: 'Gestantes referidas con 2 o más atenciones prenatales', dimension: 'mi', ambito: 'hospital', situacion: 'oficial', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual',
    logro: { tipo: 'minimo', valor: 80, umbral: 40 }, fuentes: ['his_minsa', 'refcon'],
    numerador: 'Gestantes del denominador con 2 o más APN en el hospital', denominador: 'Gestantes referidas del primer nivel por factores de riesgo',
    formula: 'Con 2 o más APN ÷ referidas × 100',
    cuidado: 'Los últimos meses suelen ir bajos: una gestante referida en julio puede no haber tenido aún su segunda atención.',
  },
  { ficha: 13, nombre: 'Gestantes con paquete preventivo básico', dimension: 'mi', ambito: 'otro', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', logro: { tipo: 'minimo', valor: 60, umbral: 30 }, fuentes: ['his_minsa'], motivo: `Se evalúa a DIRESA, redes y primer nivel. ${DEL_ANEXO}` },
  {
    ficha: 14, nombre: 'Cáncer: tratamiento en 37 días o menos', dimension: 'es', ambito: 'hospital', situacion: 'oficial_y_propio', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', modulo: true,
    logro: { tipo: 'minimo', valor: 70 }, fuentes: ['his_minsa', 'sinadef'],
    numerador: 'Pacientes del denominador que inician tratamiento en 37 días o menos', denominador: 'Personas con diagnóstico definitivo de cáncer prevalente',
    formula: 'A tiempo ÷ diagnosticados × 100',
    lectura: { titulo: 'Calculado en el módulo de desempeño', aclara: 'Se calcula persona por persona con el HIS y SINADEF. El hospital está en el grupo B del Anexo (quimioterapia y cirugía).' },
  },
  {
    ficha: 15, nombre: 'Mamografía bilateral de tamizaje', dimension: 'mi', ambito: 'hospital', situacion: 'oficial', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada',
    logro: { tipo: 'minimo', valor: 90, umbral: 70 }, fuentes: ['his_minsa', 'dpcan'],
    numerador: 'Mamografías bilaterales de tamizaje a mujeres de 40 a 69 años', denominador: 'Capacidad del mamógrafo: 5 760 al año',
    formula: 'Mamografías ÷ capacidad × 100',
    cuidado: 'No es cobertura de la población: el denominador es lo que puede producir el mamógrafo en un año. La cifra crece mes a mes y se evalúa en diciembre.',
    relacionado: { area: 'imagenes', etiqueta: 'Mamografías realizadas', unidad: 'exámenes', fuente: 'Diagnóstico por Imágenes, reporte mensual', leer: (d) => cifrasImagenes(d).modalidades?.mamografia ?? null, aclara: 'Incluye todas las mamografías, de tamizaje o no. Sirve para ver la actividad del mes.' },
  },
  { ficha: 16, nombre: 'Vacuna VPH en niñas y niños de 9 años', dimension: 'mi', ambito: 'otro', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada', logro: { tipo: 'minimo', valor: 90, umbral: 80 }, fuentes: ['his_minsa', 'reunis'], motivo: `Se evalúa a DIRESA, GERESA y DIRIS. ${DEL_ANEXO}` },
  {
    ficha: 17, nombre: 'Menores de 5 años en Medicina de Rehabilitación', dimension: 'mi', ambito: 'hospital', situacion: 'oficial', unidad: '%', factor: 100, decimales: 1, acumulacion: 'acumulada',
    logro: { tipo: 'minimo', valor: 30, umbral: 25 }, fuentes: ['his_minsa', 'cnv'],
    numerador: 'Niños del denominador con 6 o más atenciones en rehabilitación', denominador: 'Menores de 5 años con deficiencias o factores de riesgo de discapacidad',
    formula: 'Con 6 o más atenciones ÷ con riesgo × 100',
  },
  {
    ficha: 18, nombre: 'Egresos de la unidad de salud mental por cama', dimension: 'gh', ambito: 'hospital', situacion: 'oficial', unidad: 'egresos por cama', factor: 1, decimales: 1, acumulacion: 'acumulada',
    logro: { tipo: 'rango', desde: 12, hasta: 30 }, fuentes: ['seem_egresos', 'matriz_uhsma'],
    numerador: 'Egresos de la UHSMA en el año', denominador: 'Camas de la UHSMA',
    formula: 'Egresos ÷ camas',
    cuidado: 'La meta es para el año entero: 12 a 30 egresos por cama. Antes de diciembre, la cifra es un avance.',
  },
  { ficha: 19, nombre: 'Personas con depresión con el paquete de intervenciones', dimension: 'es', ambito: 'otro', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', logro: null, fuentes: ['his_minsa', 'sinadef'], motivo: `Se evalúa a los Centros de Salud Mental Comunitaria. ${DEL_ANEXO}` },
  {
    ficha: 20, nombre: 'Porcentaje de resolutividad', dimension: 'gh', ambito: 'hospital', situacion: 'oficial', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', menorEsMejor: true,
    logro: { tipo: 'maximo', valor: 5 }, fuentes: ['refcon', 'seem_emergencia'],
    numerador: 'Referencias para emergencia registradas en REFCON', denominador: 'Atenciones de prioridad I y II en emergencia',
    formula: 'Referencias ÷ atenciones × 100',
    cuidado: 'No es «Grado de resolutividad» de GERESA, que mide referencias desde consulta externa.',
  },
  {
    ficha: 21, nombre: 'Rendimiento de sala de operaciones', dimension: 'gh', ambito: 'hospital', situacion: 'oficial_y_propio', unidad: 'intervenciones por sala', factor: 1, decimales: 1, acumulacion: 'mensual',
    logro: { tipo: 'minimo', valor: 85 }, fuentes: ['seti_ipress', 'reporte_sala'],
    numerador: 'Cirugías electivas ejecutadas, sin emergencia ni cirugía menor', denominador: 'Salas de operaciones operativas',
    formula: 'Electivas ejecutadas ÷ salas',
    lectura: {
      titulo: 'Calculado por el hospital',
      detalle: 'Cirugías mayores programadas ÷ salas del mes',
      area: 'centro-quirurgico',
      leer: (d, periodo, propios) => {
        const num = produccion(d).mayores?.programada ?? null;
        const den = salasDelMes(propios, periodo);
        return { num, den, valor: valorDe(num, den) };
      },
      aclara: 'Sigue el Anexo: solo mayores electivas, y las salas del hospital (4, salvo los meses ajustados). El Anexo cuenta solo salas electivas, por eso esta cifra sale más baja que si se dividiera entre 3.',
    },
    hallazgo: 'La cifra de MINSA incluía cirugías menores y dividía entre 2 salas, aunque su propia ficha excluye las menores y el hospital tiene 4. Conviene aclararlo con SUSALUD: las salas se reportan a DGOS.',
    ajustaSalas: true,
  },
  {
    ficha: 22, nombre: 'Cirugías suspendidas', dimension: 'gh', ambito: 'hospital', situacion: 'oficial_y_propio', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', menorEsMejor: true,
    logro: { tipo: 'maximo', valor: 5 }, fuentes: ['seti_ipress'],
    numerador: 'Cirugías programadas que se suspendieron', denominador: 'Cirugías programadas (ejecutadas más suspendidas)',
    formula: 'Suspendidas ÷ programadas × 100',
    lectura: {
      titulo: 'Calculado por el hospital',
      detalle: 'Reporte mensual de Centro Quirúrgico',
      area: 'centro-quirurgico',
      leer: (d) => {
        const { intervenciones } = paraDiresa(d);
        const [num, den] = [intervenciones?.suspendidas ?? null, intervenciones?.programadas ?? null];
        return { num, den, valor: valorDe(num, den, 100) };
      },
      aclara: 'Son las suspendidas entre las programadas, con el reporte mensual del área.',
    },
    cuidado: 'El Anexo excluye las cirugías menores, pero las suspensiones no se separan por tipo en ninguna fuente: tanto MINSA como el hospital las cuentan todas.',
  },
  {
    ficha: 23, nombre: 'Ocupación de cama', dimension: 'gh', ambito: 'hospital', situacion: 'oficial_y_propio', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual',
    logro: { tipo: 'minimo', valor: 80 }, fuentes: ['renoxi'],
    series: [
      { clave: 'principal', nombre: 'Hospitalización', logro: { tipo: 'minimo', valor: 80 } },
      { clave: 'uci', nombre: 'UCI y UCIN', logro: { tipo: 'minimo', valor: 90 } },
    ],
    numerador: 'Pacientes-día', denominador: 'Días-cama operativos',
    formula: 'Pacientes-día ÷ días-cama × 100',
    lectura: {
      titulo: 'Censo de Estadística',
      detalle: 'Hospitalización y UCI juntas',
      leerPropios: (p) => ({ num: p.pacientesDia ?? null, den: p.diasCamaDisponibles ?? null, valor: valorDe(p.pacientesDia ?? null, p.diasCamaDisponibles ?? null, 100) }),
      aclara: 'Junta hospitalización y UCI, y cuenta el mes completo. MINSA las separa y solo cuenta los días reportados en RENOXI.',
    },
    cuidado: 'Vale 60 % hospitalización y 40 % UCI. RENOXI exige al menos 20 días de registro al mes: lo oficial cuenta solo los días reportados.',
  },
  {
    ficha: 24, nombre: 'Intervalo de sustitución de cama', dimension: 'gh', ambito: 'hospital', situacion: 'oficial_y_propio', unidad: 'días', factor: 1, decimales: 1, acumulacion: 'mensual', menorEsMejor: true,
    logro: { tipo: 'rango', desde: 0, hasta: 2 }, fuentes: ['renoxi', 'seem_egresos'],
    numerador: 'Días-cama disponibles menos pacientes-día de hospitalización', denominador: 'Egresos hospitalarios',
    formula: '(Días-cama − pacientes-día) ÷ egresos',
    lectura: {
      titulo: 'Censo de Estadística',
      detalle: 'Con los egresos reales del hospital',
      leerPropios: (p) => {
        const num = p.diasCamaDisponibles == null || p.pacientesDia == null ? null : p.diasCamaDisponibles - p.pacientesDia;
        const den = p.egresos ?? null;
        return { num, den, valor: valorDe(num, den) };
      },
      aclara: 'Usa los egresos del censo del hospital; la cifra oficial usa los de SEEM.',
    },
    hallazgo: 'En SEEM faltaban unos 1 068 egresos de enero a julio (enero, febrero, marzo y julio), y eso movía la cifra oficial.',
  },
  {
    ficha: 25, nombre: 'Espera en consulta externa del paciente referido', dimension: 'gh', ambito: 'hospital', situacion: 'oficial', unidad: 'días', factor: 1, decimales: 1, acumulacion: 'mensual', menorEsMejor: true,
    logro: { tipo: 'maximo', valor: 45 }, fuentes: ['refcon'],
    numerador: 'Días de espera desde que se acepta la referencia hasta la atención', denominador: 'Pacientes atendidos por referencia en consulta externa',
    formula: 'Días de espera ÷ pacientes',
  },
  {
    ficha: 26, nombre: 'Utilización de consultorios de medicina', dimension: 'gh', ambito: 'hospital', situacion: 'oficial', unidad: 'turnos', factor: 1, decimales: 2, acumulacion: 'mensual',
    logro: { tipo: 'minimo', valor: 2 }, fuentes: ['recursos_salud'],
    numerador: 'Turnos programados de medicina por consultorio físico', denominador: 'Consultorios físicos de medicina',
    formula: 'Consultorios funcionales ÷ físicos',
    cuidado: 'Mide turnos: la meta es que cada consultorio tenga 2 (12 horas al día).',
    hallazgo: 'MINSA publicaba 42 sobre 35; el cuadro de GERESA decía 37 sobre 34.',
  },
  {
    ficha: 27, nombre: 'Infecciones asociadas a la atención (IAAS)', dimension: 'cs', ambito: 'hospital', situacion: 'requiere', unidad: '', factor: 1000, decimales: 2, acumulacion: 'mensual',
    logro: { tipo: 'texto', texto: 'Valor del año previo; si supera el referencial de su categoría, bajar hasta 30 %' }, fuentes: ['notiweb_iaas'],
    oficina: 'Epidemiología',
    pide: [
      'Por mes y por tipo de infección: casos nuevos y su denominador',
      'NAV, ITU e ITS: días de ventilador, de catéter urinario y de catéter venoso central',
      'ISQ y endometritis: pacientes por procedimiento',
      'La tasa de 2025 de cada tipo (es el umbral) y el valor referencial de la categoría III-1',
      'Si se notificó a tiempo los 12 meses: si no, el Anexo evalúa con 0 %',
    ],
    series: [
      { clave: 'nav', nombre: 'Neumonía asociada a ventilador (NAV)', numerador: 'Casos', denominador: 'Días de ventilador mecánico', factor: 1000, unidad: 'por 1 000 días' },
      { clave: 'itu', nombre: 'Infección urinaria asociada a catéter (ITU)', numerador: 'Casos', denominador: 'Días de catéter urinario', factor: 1000, unidad: 'por 1 000 días' },
      { clave: 'its', nombre: 'Infección del torrente sanguíneo (ITS)', numerador: 'Casos', denominador: 'Días de catéter venoso central', factor: 1000, unidad: 'por 1 000 días' },
      { clave: 'isq', nombre: 'Infección de sitio quirúrgico (ISQ)', numerador: 'Casos', denominador: 'Pacientes por procedimiento', factor: 100, unidad: '%' },
      { clave: 'end', nombre: 'Endometritis puerperal (END)', numerador: 'Casos', denominador: 'Pacientes por procedimiento', factor: 100, unidad: '%' },
    ],
    formula: 'Casos ÷ días de exposición × 1 000; o casos ÷ pacientes × 100',
    relacionado: { area: 'epidemiologia', etiqueta: 'Casos nuevos de infección intrahospitalaria', unidad: 'casos', fuente: 'Epidemiología, oficio de vigilancia', leer: (d) => cifrasEpidemiologia(d).infecciones ?? null, aclara: 'Es solo el numerador, y de todos los tipos. Sin los días de exposición no es una tasa.' },
  },
  {
    ficha: 28, nombre: 'Disponibilidad de medicamentos esenciales', dimension: 'cs', ambito: 'hospital', situacion: 'requiere', unidad: '%', factor: 100, decimales: 1, acumulacion: 'promedio',
    logro: { tipo: 'minimo', valor: 90, umbral: 80 }, fuentes: ['sismed_ici'],
    oficina: 'Farmacia',
    pide: [
      'Del Informe de Consumo Integrado (ICI) de cada mes: total de ítems de medicamentos esenciales',
      'Ítems con existencia disponible: normostock, sobrestock, substock que cumple y sin rotación',
      'Los medicamentos excluidos con su informe, si los hubo',
    ],
    numerador: 'Ítems con existencia disponible', denominador: 'Total de ítems de medicamentos esenciales',
    formula: 'Con existencia ÷ total de ítems × 100; el año es el promedio de los meses',
    relacionado: { area: 'farmacia', etiqueta: 'Recetas despachadas', unidad: 'recetas', fuente: 'Farmacia, informe mensual', leer: (d) => cifrasFarmacia(d).recetas ?? null, aclara: 'Son recetas atendidas, no disponibilidad de stock: se pudo despachar mucho y aun así faltar un medicamento.' },
  },
  {
    ficha: 29, nombre: 'Personal en INFORHUS sin inconsistencias', dimension: 'si', ambito: 'hospital', situacion: 'requiere', unidad: '%', factor: 100, decimales: 1, acumulacion: 'ultimo',
    logro: { tipo: 'minimo', valor: 95 }, fuentes: ['inforhus'],
    oficina: 'Recursos Humanos',
    pide: [
      'Total de registros en INFORHUS del personal bajo D. Leg. 276, 1153, 1057 y 728',
      'Cuántos quedan sin inconsistencias, según el reporte de DIGEP',
    ],
    numerador: 'Registros sin inconsistencias', denominador: 'Total de registros en INFORHUS',
    formula: 'Sin inconsistencias ÷ total × 100',
    cuidado: 'El reporte DL 1153 trae una hoja oculta de esta ficha, actualizada por última vez en enero de 2025. No se usa: es de otro año.',
  },
  {
    ficha: 30, nombre: 'Concordancia entre AIRHSP, INFORHUS y planilla', dimension: 'si', ambito: 'hospital', situacion: 'requiere', unidad: '%', factor: 100, decimales: 1, acumulacion: 'ultimo',
    logro: { tipo: 'minimo', valor: 100, umbral: 80 }, fuentes: ['airhsp', 'inforhus', 'planilla'],
    oficina: 'Recursos Humanos',
    pide: [
      'Los cuatro componentes, cada uno con el mismo peso:',
      'Personal asistencial D. Leg. 1153 y personal CAS: registros que concuerdan entre AIRHSP, INFORHUS y planilla',
      'Consistencia del perfil frente al marco normativo',
      'Consistencia del monto ejecutado frente al programado',
    ],
    series: [
      { clave: 'asist', nombre: 'Personal asistencial D. Leg. 1153', numerador: 'Registros que concuerdan', denominador: 'Registros evaluados', factor: 100, unidad: '%' },
      { clave: 'cas', nombre: 'Personal CAS', numerador: 'Registros que concuerdan', denominador: 'Registros evaluados', factor: 100, unidad: '%' },
      { clave: 'perfil', nombre: 'Consistencia del perfil', numerador: 'Registros consistentes', denominador: 'Registros evaluados', factor: 100, unidad: '%' },
      { clave: 'remuneracion', nombre: 'Consistencia de la remuneración', numerador: 'Monto ejecutado', denominador: 'Monto programado', factor: 100, unidad: '%' },
    ],
    formula: 'Promedio de los cuatro componentes',
  },
  {
    ficha: 31, nombre: 'Concordancia de médicos en cinco aplicativos', dimension: 'si', ambito: 'hospital', situacion: 'requiere', tipo: 'resultado', unidad: '%', factor: 100, decimales: 1, acumulacion: 'ultimo',
    logro: { tipo: 'minimo', valor: 80 }, fuentes: ['inforhus', 'tua', 'arfsis', 'his_minsa', 'sihce'],
    oficina: 'Recursos Humanos',
    pide: [
      'Médicos y cirujanos dentistas registrados en INFORHUS',
      'Cuántos tienen, en el mismo mes, un turno en TUA o SIHCE y una atención en SIS o HIS',
    ],
    numerador: 'Médicos con turno y atención registrados', denominador: 'Médicos y cirujanos dentistas en INFORHUS',
    formula: 'Con turno y atención ÷ registrados × 100',
  },
  {
    ficha: 32, nombre: 'Uso de servicios de telemedicina', dimension: 'gh', ambito: 'hospital', situacion: 'oficial', unidad: 'por 10 000 atenciones', factor: 10000, decimales: 1, acumulacion: 'acumulada',
    logro: { tipo: 'minimo', valor: 100, umbral: 10 }, fuentes: ['his_minsa'],
    numerador: 'Teleinterconsultas × 100/240', denominador: 'Atenciones del hospital por cualquier motivo',
    formula: 'Teleinterconsultas ponderadas ÷ atenciones × 10 000',
    cuidado: 'MINSA mide a este hospital con el indicador B, para hospitales sin población asignada.',
  },
  { ficha: 33, nombre: 'Firma digital en el SIHCE del MINSA', dimension: 'si', ambito: 'otro', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', logro: null, fuentes: ['sihce'], motivo: `Se evalúa a establecimientos I-2, I-3 e I-4. ${DEL_ANEXO} La firma digital del hospital se mide en el compromiso de mejora 43.` },
  { ficha: 34, nombre: 'Firma digital en el SIHCE del INEN', dimension: 'si', ambito: 'otro', situacion: 'contexto', unidad: '%', factor: 100, decimales: 1, acumulacion: 'mensual', logro: { tipo: 'minimo', valor: 60, umbral: 50 }, fuentes: ['sihce'], motivo: 'Solo se evalúa al Instituto Nacional de Enfermedades Neoplásicas.' },
]);

const seEvalua = (i) => i.ambito === 'hospital' || (HOSPITAL_CON_POBLACION_ASIGNADA && i.ambito === 'poblacion');

export const EVALUADOS = Object.freeze(INDICADORES.filter(seEvalua));
export const OTROS = Object.freeze(INDICADORES.filter((i) => !seEvalua(i)));

export const nombreDeFuente = (clave) => FUENTES[clave] ?? clave;

export function indicadorDe(ficha) {
  return INDICADORES.find((i) => i.ficha === Number(ficha)) ?? null;
}

/* ------------------------------------------------------- las cifras registradas */

/* El mes a mes de lo registrado: un lugar por mes. Lo que no llegó queda en null: un hueco,
   nunca un cero. */
export function puntosRegistrados(registrados, { familia = 'dl1153', indicador, serie = 'principal', ambito = 'hospital' }, meses, factor = 1) {
  const propias = (registrados ?? []).filter((r) => r.familia === familia && r.indicador === indicador && r.serie === serie && r.ambito === ambito);
  return meses.map((periodo) => {
    const r = propias.find((x) => x.mes === Number(periodo.slice(5)));
    return { periodo, mes: Number(periodo.slice(5)), num: r?.numerador ?? null, den: r?.denominador ?? null, valor: r ? valorDe(r.numerador, r.denominador, factor) : null, origen: r?.origen ?? null, registro: r ?? null };
  });
}

/* Las partes de un indicador. La mayoría tiene una sola. */
export const seriesDe = (indicador) => indicador.series ?? [{ clave: 'principal', nombre: null, logro: indicador.logro, factor: indicador.factor, unidad: indicador.unidad, numerador: indicador.numerador, denominador: indicador.denominador }];

/* La lectura registrada de un indicador en un ámbito: cada parte con su mes a mes, su
   acumulado y su estado frente a la meta. */
export function lecturaRegistrada(indicador, registrados, meses, ambito = 'hospital') {
  const partes = seriesDe(indicador).map((s) => {
    const factor = s.factor ?? indicador.factor;
    const puntos = puntosRegistrados(registrados, { indicador: indicador.ficha, serie: s.clave, ambito }, meses, factor);
    const acumulado = acumuladoDe(puntos, indicador.acumulacion, factor);
    return { ...s, factor, unidad: s.unidad ?? indicador.unidad, puntos, acumulado, estado: estadoFrenteAlLogro(acumulado?.valor ?? null, s.logro ?? indicador.logro) };
  });
  const hay = partes.some((p) => p.acumulado);
  const fila = partes.flatMap((p) => p.puntos).find((p) => p.registro?.fecha_corte)?.registro ?? null;
  return { partes, hay, estado: estadoDeSeries(partes.map((p) => p.estado)), corte: fila?.fecha_corte ?? null, documento: fila?.documento ?? null, digitado: partes.some((p) => p.puntos.some((x) => x.origen === 'digitado')) };
}

/* El estado de un indicador en el panel. Si no se le evalúa al hospital, no tiene. */
export function estadoDelIndicador(indicador, lectura) {
  if (!seEvalua(indicador)) return 'contexto';
  if (!lectura.hay) return indicador.situacion === 'requiere' ? 'requiere' : 'sin_dato';
  return lectura.estado;
}

/* Cuántos hay en cada situación, para las cifras del panel: solo los que se evalúan. */
export function cuentasDelPanel(registrados, meses) {
  const estados = EVALUADOS.map((i) => estadoDelIndicador(i, lecturaRegistrada(i, registrados, meses)));
  const cuenta = (...nombres) => estados.filter((e) => nombres.includes(e)).length;
  return {
    total: EVALUADOS.length,
    alcanzan: cuenta('alcanza'),
    parcial: cuenta('entre', 'mixto'),
    bajo: cuenta('bajo', 'bajo_umbral'),
    sinDato: cuenta('requiere', 'sin_dato', 'sin_evaluar'),
  };
}

/* ------------------------------------------- lo que se calcula en el hospital */

/* Un cálculo con datos raros de un mes no puede tumbar el panel entero: ese mes queda sin
   dato, como si no hubiera llegado. */
function seguro(leer, ...argumentos) {
  try {
    return leer(...argumentos);
  } catch (error) {
    console.warn('monitoreo: no se pudo leer un reporte', error);
    return null;
  }
}

function reporteEntregado(reportes, area, periodo) {
  const r = reportes.find((x) => x.area === area && x.periodo === periodo);
  return r && estaEntregado(r.estado) ? r : null;
}

function serieDe(meses, leerMes) {
  return meses.map((periodo) => {
    const leido = leerMes(periodo) ?? {};
    return { periodo, num: leido.num ?? null, den: leido.den ?? null, valor: leido.valor ?? null, pendiente: Boolean(leido.pendiente) };
  });
}

/* Lo que se calcula de un indicador con lo que entregan las áreas o digita Estadística, y
   el dato relacionado, si lo tiene. */
export function serieDelIndicador(indicador, { reportes, propios, anio, vigente }) {
  const hasta = String(vigente).startsWith(String(anio)) ? vigente : `${anio}-12`;
  const meses = mesesDelAnioHasta(hasta);

  const delArea = (area, leer) => (periodo) => {
    const r = reporteEntregado(reportes, area, periodo);
    if (!r) return {};
    /* Un resumen todavía no trae sus cifras: están llegando en segundo plano. */
    if (r.resumen) return { pendiente: true };
    return seguro(leer, r.datos, periodo, propios) ?? {};
  };

  const l = indicador.lectura;
  const propia = l?.leer
    ? serieDe(meses, delArea(l.area, l.leer))
    : l?.leerPropios
      ? serieDe(meses, (periodo) => (propios?.[periodo] ? seguro(l.leerPropios, propios[periodo]) : {}))
      : null;

  const relacionada = indicador.relacionado ? serieDe(meses, delArea(indicador.relacionado.area, (d) => ({ valor: indicador.relacionado.leer(d) }))) : null;

  return { meses, propia, relacionada };
}

/* El último mes con dato, y el anterior a él para la comparación. */
export function ultimoConDato(serie) {
  const con = (serie ?? []).filter((p) => p.valor != null);
  return { ultimo: con.at(-1) ?? null, previo: con.at(-2) ?? null };
}

export function hayDatos(serie) {
  return (serie ?? []).some((p) => p.valor != null);
}

/* El mes a mes de la ficha 14 en el módulo de desempeño: su porcentaje, ya calculado. */
export function serieDelModulo(meses, resultado) {
  return meses.map((periodo) => {
    const m = (resultado?.meses ?? []).find((x) => x.mes === Number(periodo.slice(5)));
    return { periodo, num: m?.numerador ?? null, den: m?.denominador ?? null, valor: m?.porcentaje == null ? null : m.porcentaje * 100, pendiente: false };
  });
}

/* El avance del año, para la lista: un lugar por mes, de enero a diciembre. Lo que no llegó
   queda `sin_dato` y lo que aún no toca, `futuro`: ninguno de los dos es un cero. */
export function avanceDeSerie(puntos, meses, anio) {
  const delMes = new Map((puntos ?? []).map((p) => [p.periodo, p]));
  const transcurridos = new Set(meses);
  const celdas = mesesDelAnioHasta(`${anio}-12`).map((periodo) => {
    if (!transcurridos.has(periodo)) return { periodo, estado: 'futuro', valor: null };
    const p = delMes.get(periodo);
    if (p?.valor != null) return { periodo, estado: 'dato', valor: p.valor };
    return { periodo, estado: p?.pendiente ? 'pendiente' : 'sin_dato', valor: null };
  });
  return { celdas, conDato: celdas.filter((c) => c.estado === 'dato').length, transcurridos: meses.length };
}

/* ------------------------------------------------------ gestión hospitalaria */

/* De cuándo son las notas escritas a mano. Lo que encontró el cruce de fuentes no se puede
   recalcular solo (compara con archivos que no están en la base), así que se dice como lo que
   es: una nota con fecha, no un análisis vigente. Lo que sí sale de las cifras está en
   `dominio/analisis.js`: por ejemplo, una cifra que se repite mes a mes se detecta sola. */
export const HALLAZGOS = Object.freeze({
  fichas: 'Nota del cruce de noviembre de 2026, con datos hasta agosto',
  geresa: 'Nota del cruce de noviembre de 2026, con el cuadro hasta julio',
});

/* Lo que encontró el cruce con el cuadro de GERESA de 2026: se dice en la tarjeta. */
export const OBSERVACIONES_GERESA = Object.freeze({
  2: 'Las horas efectivas parecen calculadas a partir de las atenciones, no medidas.',
  4: 'Los consultorios del cuadro son idénticos a los de 2025 en los doce meses. MINSA publica 42 sobre 35 (ficha 26).',
  7: 'La ficha 24 da otra cifra: usa solo hospitalización y los egresos de SEEM, que están incompletos.',
  8: 'Incluye UCI y el mes completo. La ficha 23 las separa y cuenta solo los días reportados en RENOXI.',
  12: 'Son todas las cirugías entre las salas. La ficha 21 de MINSA solo cuenta electivas.',
  14: 'Tiene el mismo numerador que publica MINSA en la ficha 21, con otras salas.',
  15: 'No es la ficha 20: esta mide referencias desde consulta externa, aquella desde emergencia.',
  16: 'El cuadro trae 118 casos de enero a julio; el oficio de Epidemiología, 106. Difieren en marzo, abril y mayo.',
  20: 'El total del cuadro suma una muerte de agosto sin su denominador: da 13,0 y debería dar 10,8.',
  22: 'En el cuadro, cada mes va sin ×100 y divide entre las ejecutadas. El sistema lo corrige.',
});

export const FICHA_EQUIVALENTE = Object.freeze({ 4: 26, 7: 24, 8: 23, 14: 21, 22: 22 });
