/* Indicadores de Gestión Hospitalaria (formato GERESA Loreto, estándar MINSA).

   22 indicadores en tres categorías, cada uno con numerador, denominador,
   fuente de cada uno y factor. El valor es numerador entre denominador por el
   factor.

   Dos correcciones respecto de la hoja de cálculo que usa hoy el hospital, y
   que aquí se aplican por construcción:

   · Indicador 22, «Porcentaje de cirugías suspendidas»: en la hoja, las
     fórmulas de enero a julio no multiplican por 100 y los meses siguientes
     sí, así que los meses no son comparables entre sí; además agosto y
     setiembre dan #¡DIV/0! porque la fórmula no se protege del denominador
     vacío. Aquí el factor es uno solo para todos los meses y un denominador
     vacío o cero da «Sin datos».

   · Indicador 4, «Utilización de los consultorios»: sale mayor que 1 todos los
     meses porque se cuentan más consultorios funcionales que físicos. No es un
     error del cálculo sino del criterio de conteo; se muestra como está y se
     advierte, porque corregirlo en silencio sería inventar un criterio. */

import { fuentesDe } from './fuentes.js';
import { valorDiresaLaboratorio, DIRESA_LABORATORIO, sumar } from '../formatos/laboratorio-calculos.js';
import { paraDiresa } from '../formatos/centro-quirurgico-calculos.js';
import { cifrasEpidemiologia } from '../formatos/epidemiologia-calculos.js';

export const CATEGORIAS = Object.freeze([
  Object.freeze({ clave: 'A', titulo: 'A. Indicadores de producción y rendimiento' }),
  Object.freeze({ clave: 'B', titulo: 'B. Indicadores de eficiencia' }),
  Object.freeze({ clave: 'C', titulo: 'C. Indicadores de calidad' }),
]);

export const AREAS_INDICADORES = Object.freeze(['laboratorio', 'centro-quirurgico', 'epidemiologia', 'ginecologia']);

/* Insumo: una cifra con su origen. */
const propio = (clave) => ({ tipo: 'propio', clave });
const deArea = (area, leer, ajuste = null) => ({ tipo: 'area', area, leer, ajuste });

const INSUMOS = {
  atencionesCE: propio('atencionesCE'),
  atendidosCE: propio('atendidosCE'),
  horasProgramadas: propio('horasProgramadas'),
  horasEfectivas: propio('horasEfectivas'),
  consultoriosFuncionales: propio('consultoriosFuncionales'),
  consultoriosFisicos: propio('consultoriosFisicos'),
  referencias: propio('referencias'),
  egresos: propio('egresos'),
  diasEstancia: propio('diasEstancia'),
  pacientesDia: propio('pacientesDia'),
  diasCamaDisponibles: propio('diasCamaDisponibles'),
  camas: propio('camas'),
  defunciones48: propio('defunciones48'),
  atencionesEmergencia: propio('atencionesEmergencia'),
  urgenciasEmergencia: propio('urgenciasEmergencia'),

  /* Análisis indicados en consulta externa: lo de consulta externa de los
     cinco grupos de DIRESA más el examen completo de orina, con la misma
     correspondencia que la sección A (laboratorio-calculos.js). Es el criterio
     que se deduce del formato; conviene confirmarlo con el área. */
  analisisCE: deArea('laboratorio', (d) =>
    sumar(
      Object.entries(DIRESA_LABORATORIO)
        .filter(([grupo]) => grupo !== 'anatomia')
        .flatMap(([grupo, items]) => Object.keys(items).map((item) => valorDiresaLaboratorio(d, grupo, item, 'ce')))
        .concat(valorDiresaLaboratorio(d, 'anatomia', 'orina', 'ce')),
    ),
  ),
  /* Centro Quirúrgico: del libro que sube el área, por `paraDiresa` (calculos.js
     del bot). Las ejecutadas salen de su RESUMEN; las programadas son las
     electivas más las suspendidas (lo que se programó), el mismo criterio que
     su propio porcentaje de suspendidas. */
  intervencionesEjecutadas: deArea('centro-quirurgico', (d) => paraDiresa(d).intervenciones.ejecutadas),
  intervencionesEmergencia: deArea('centro-quirurgico', (d) => paraDiresa(d).intervenciones.emergencia),
  intervencionesElectivas: deArea('centro-quirurgico', (d) => paraDiresa(d).intervenciones.electivas),
  intervencionesProgramadas: deArea('centro-quirurgico', (d) => paraDiresa(d).intervenciones.programadas),
  intervencionesSuspendidas: deArea('centro-quirurgico', (d) => paraDiresa(d).intervenciones.suspendidas),
  /* Las salas son las del libro del área, salvo el mes que Estadística ajustó: hay
     temporadas en las que se inhabilita alguna. */
  salasUtilizadas: deArea('centro-quirurgico', (d) => paraDiresa(d).salas.utilizadas, 'salasOperativas'),
  /* Epidemiología: los casos nuevos de infección de su oficio de vigilancia,
     sin las muertes neonatales y maternas de la misma tabla (LECTURA_IIH). */
  pacientesIIH: deArea('epidemiologia', (d) => cifrasEpidemiologia(d).infecciones),
  /* Gineco-Obstetricia: el Excel real (EBVI) trae el cuadro de partos por
     tipo (vaginal o cesárea, con o sin complicaciones), con sus nacidos
     vivos y muertos — no trae, en ningún lado, un desglose de la muerte
     neonatal por cuándo ocurrió (precoz: primeros 7 días; tardía: 8 a 28).
     «NACIDOS MUERTOS» es la muerte al momento del parto (la fetal), así que
     alimenta esa parte. La neonatal por días la lleva Estadística: viene de su
     cuadro de GERESA, y sin ella las dos tasas quedan en «Sin datos». */
  partos: deArea('ginecologia', (d) =>
    sumar(['vaginal_sin_complicaciones', 'vaginal_con_complicaciones', 'cesarea_sin_complicaciones', 'cesarea_con_complicaciones'].map((t) => d?.f2?.[`${t}.total_partos`])),
  ),
  cesareas: deArea('ginecologia', (d) => sumar(['cesarea_sin_complicaciones', 'cesarea_con_complicaciones'].map((t) => d?.f2?.[`${t}.total_partos`]))),
  rnVivos: deArea('ginecologia', (d) =>
    sumar(['vaginal_sin_complicaciones', 'vaginal_con_complicaciones', 'cesarea_sin_complicaciones', 'cesarea_con_complicaciones'].map((t) => d?.f2?.[`${t}.nacidos_vivos`])),
  ),
  muertesFetales: deArea('ginecologia', (d) =>
    sumar(['vaginal_sin_complicaciones', 'vaginal_con_complicaciones', 'cesarea_sin_complicaciones', 'cesarea_con_complicaciones'].map((t) => d?.f2?.[`${t}.nacidos_muertos`])),
  ),
  neonatalesPrecoces: propio('neonatalesPrecoces'),
  neonatalesTardias: propio('neonatalesTardias'),
};

/* Término de una fracción: qué dice, de dónde sale y cómo se calcula. */
const t = (etiqueta, fuente, insumos, calc = (v) => v[insumos[0]]) => ({ etiqueta, fuente, insumos, calc });

const ind = (n, categoria, nombre, mide, tipo, factor, unidad, num, den, nota) =>
  Object.freeze({ n, categoria, nombre, mide, tipo, factor, unidad, num, den, nota });

export const INDICADORES = Object.freeze([
  ind(1, 'A', 'Productividad hora médico', 'Atenciones médicas producidas por cada hora médico programada.', 'Razón', 1, 'atenciones por hora',
    t('N° de atenciones médicas realizadas', 'HIS (Sistema de Consulta Externa)', ['atencionesCE']),
    t('N° de horas médico programadas', 'Control de Personal, rol mensual', ['horasProgramadas'])),
  ind(2, 'A', 'Rendimiento hora médico', 'Atenciones logradas por cada hora médico efectivamente trabajada.', 'Razón', 1, 'atenciones por hora',
    t('N° de atenciones médicas realizadas', 'HIS (Sistema de Consulta Externa)', ['atencionesCE']),
    t('N° de horas médico efectivas', 'Reporte del servicio', ['horasEfectivas'])),
  ind(3, 'A', 'Concentración', 'Promedio de atenciones recibidas por cada paciente atendido.', 'Razón', 1, 'atenciones por paciente',
    t('N° de atenciones médicas realizadas', 'HIS (Sistema de Consulta Externa)', ['atencionesCE']),
    t('N° de atendidos (nuevos y reingresos)', 'HIS (Sistema de Consulta Externa)', ['atendidosCE'])),
  ind(4, 'A', 'Utilización de los consultorios (médicos)', 'Proporción de consultorios físicos habilitados y en funcionamiento.', 'Razón', 1, '',
    t('N° de consultorios funcionales (médicos)', 'Inventario de consultorios', ['consultoriosFuncionales']),
    t('N° de consultorios físicos (médicos)', 'Inventario de consultorios', ['consultoriosFisicos']),
    'Da mayor que 1 porque se cuentan más consultorios funcionales que físicos, probablemente por doble turno. Conviene validar con Consulta Externa la definición de «consultorio funcional».'),

  ind(5, 'B', 'Promedio de análisis de laboratorio por consulta externa', 'Análisis de laboratorio por cada atención médica en consulta externa.', 'Promedio', 1, 'análisis por atención',
    t('N° de análisis de laboratorio indicados en consulta externa', 'Laboratorio, reporte mensual del área', ['analisisCE']),
    t('N° de atenciones médicas realizadas', 'HIS (Sistema de Consulta Externa)', ['atencionesCE']),
    'El numerador suma lo de consulta externa (con los programas) de los cinco grupos de exámenes de la sección A de DIRESA, más el examen completo de orina. Criterio por confirmar con el área.'),
  ind(6, 'B', 'Promedio de permanencia', 'Días promedio que un paciente permanece hospitalizado hasta su egreso.', 'Promedio', 1, 'días',
    t('Total de días de estancia de los egresos', 'Módulo de Egresos Hospitalarios', ['diasEstancia']),
    t('N° de egresos hospitalarios', 'Módulo de Egresos Hospitalarios', ['egresos'])),
  ind(7, 'B', 'Intervalo de sustitución de cama', 'Días promedio que una cama queda desocupada entre un egreso y el siguiente ingreso.', 'Razón', 1, 'días',
    t('Días-cama disponibles menos pacientes-día', 'Parte diario de camas', ['diasCamaDisponibles', 'pacientesDia'], (v) =>
      v.diasCamaDisponibles == null || v.pacientesDia == null ? null : v.diasCamaDisponibles - v.pacientesDia),
    t('N° de egresos hospitalarios', 'Módulo de Egresos Hospitalarios', ['egresos'])),
  ind(8, 'B', 'Porcentaje de ocupación de camas', 'Proporción de camas disponibles que estuvieron ocupadas.', 'Porcentaje', 100, '%',
    t('N° de pacientes-día', 'Parte diario de camas', ['pacientesDia']),
    t('N° de días-cama disponibles', 'Parte diario de camas', ['diasCamaDisponibles'])),
  ind(9, 'B', 'Rendimiento cama', 'Egresos producidos por cada cama disponible.', 'Razón', 1, 'egresos por cama',
    t('N° de egresos', 'Módulo de Egresos Hospitalarios', ['egresos']),
    t('N° de camas disponibles promedio', 'Parte diario de camas', ['camas'])),
  ind(10, 'B', 'Razón de emergencias por consultas médicas', 'Atención en emergencia frente a la atendida en consulta externa.', 'Razón', 1, '',
    t('N° de atenciones médicas en emergencia (PI + PII)', 'Módulo de Emergencias', ['atencionesEmergencia']),
    t('N° total de atenciones médicas en consulta externa', 'HIS (Sistema de Consulta Externa)', ['atencionesCE'])),
  ind(11, 'B', 'Razón de urgencias de emergencia por consultas médicas', 'Urgencias reales en emergencia frente a la actividad de consulta externa.', 'Razón', 1, '',
    t('N° de urgencias médicas en emergencia', 'Informe de Emergencias', ['urgenciasEmergencia']),
    t('N° total de atenciones médicas en consulta externa', 'HIS (Sistema de Consulta Externa)', ['atencionesCE'])),
  ind(12, 'B', 'Rendimiento de sala de operaciones', 'Cirugías ejecutadas por cada sala de operaciones utilizada.', 'Razón', 1, 'intervenciones por sala',
    t('N° de intervenciones quirúrgicas ejecutadas', 'Centro Quirúrgico, reporte mensual del área', ['intervencionesEjecutadas']),
    t('N° de salas de operaciones utilizadas', 'Centro Quirúrgico, reporte mensual del área', ['salasUtilizadas'])),
  ind(13, 'B', 'Rendimiento de sala de operaciones (cirugías de emergencia)', 'Intervenciones de emergencia por cada sala utilizada.', 'Razón', 1, 'intervenciones por sala',
    t('N° de intervenciones quirúrgicas de emergencia', 'Centro Quirúrgico, reporte mensual del área', ['intervencionesEmergencia']),
    t('N° de salas de operaciones utilizadas', 'Centro Quirúrgico, reporte mensual del área', ['salasUtilizadas'])),
  ind(14, 'B', 'Rendimiento de sala de operaciones (cirugías electivas)', 'Cirugías electivas ejecutadas por cada sala utilizada.', 'Razón', 1, 'intervenciones por sala',
    t('N° de intervenciones programadas ejecutadas (electivas)', 'Centro Quirúrgico, reporte mensual del área', ['intervencionesElectivas']),
    t('N° de salas de operaciones utilizadas', 'Centro Quirúrgico, reporte mensual del área', ['salasUtilizadas'])),
  ind(15, 'B', 'Grado de resolutividad del establecimiento', 'Parte de la consulta externa que se tuvo que referir a otro nivel. A menor valor, mayor capacidad resolutiva.', 'Porcentaje', 100, '%',
    t('N° de referencias enviadas desde consulta externa', 'Formatos de referencia y contrarreferencia', ['referencias']),
    t('N° total de consultas médicas', 'HIS (Sistema de Consulta Externa)', ['atencionesCE'])),

  ind(16, 'C', 'Porcentaje de infecciones intrahospitalarias', 'Infecciones asociadas a la atención de salud entre los pacientes egresados.', 'Porcentaje', 100, '%',
    t('Total de pacientes con infecciones intrahospitalarias', 'Epidemiología: casos nuevos de IIH del oficio de vigilancia (sin muertes neonatales ni maternas)', ['pacientesIIH']),
    t('N° de egresos', 'Módulo de Egresos Hospitalarios', ['egresos'])),
  ind(17, 'C', 'Tasa neta de mortalidad', 'Egresos por fallecimiento después de 48 horas de hospitalización.', 'Tasa', 100, '%',
    t('N° de egresos por defunción después de 48 horas', 'Módulo de Mortalidad Hospitalaria', ['defunciones48']),
    t('N° de egresos', 'Módulo de Egresos Hospitalarios', ['egresos'])),
  ind(18, 'C', 'Tasa de cesárea', 'Partos atendidos que culminaron por cesárea.', 'Porcentaje', 100, '%',
    t('N° total de cesáreas realizadas', 'Gineco-Obstetricia, reporte mensual del área', ['cesareas']),
    t('N° total de partos atendidos', 'Gineco-Obstetricia, reporte mensual del área', ['partos'])),
  ind(19, 'C', 'Tasa de mortalidad perinatal', 'Muertes fetales tardías y neonatales precoces por cada 1000 nacimientos.', 'Tasa', 1000, 'por 1000',
    t('Muertes fetales (22 semanas o más) más muertes neonatales precoces en el hospital', 'Gineco-Obstetricia, reporte mensual del área', ['muertesFetales', 'neonatalesPrecoces'], (v) =>
      v.muertesFetales == null || v.neonatalesPrecoces == null ? null : v.muertesFetales + v.neonatalesPrecoces),
    t('Recién nacidos en la institución más muertes fetales en la institución', 'Gineco-Obstetricia, reporte mensual del área', ['rnVivos', 'muertesFetales'], (v) =>
      v.rnVivos == null || v.muertesFetales == null ? null : v.rnVivos + v.muertesFetales)),
  ind(20, 'C', 'Mortalidad neonatal precoz', 'Muertes en los primeros 7 días de vida por cada 1000 nacidos vivos.', 'Tasa', 1000, 'por 1000',
    t('N° de recién nacidos fallecidos en los primeros 7 días', 'Gineco-Obstetricia, reporte mensual del área', ['neonatalesPrecoces']),
    t('N° de recién nacidos vivos en el establecimiento', 'Gineco-Obstetricia, reporte mensual del área', ['rnVivos'])),
  ind(21, 'C', 'Mortalidad neonatal tardía', 'Muertes entre el 8.º y el 28.º día de vida por cada 1000 nacidos vivos.', 'Tasa', 1000, 'por 1000',
    t('N° de recién nacidos fallecidos entre los 8 y 28 días', 'Gineco-Obstetricia, reporte mensual del área', ['neonatalesTardias']),
    t('N° de recién nacidos vivos en el establecimiento', 'Gineco-Obstetricia, reporte mensual del área', ['rnVivos'])),
  ind(22, 'C', 'Porcentaje de cirugías suspendidas', 'Cirugías programadas que finalmente no se realizaron.', 'Porcentaje', 100, '%',
    t('N° de intervenciones quirúrgicas suspendidas', 'Centro Quirúrgico, reporte mensual del área', ['intervencionesSuspendidas']),
    t('N° de intervenciones quirúrgicas programadas (ejecutadas más suspendidas)', 'Centro Quirúrgico, reporte mensual del área', ['intervencionesProgramadas']),
    'En la hoja de cálculo actual este indicador no aplica el ×100 de enero a julio y da #¡DIV/0! en agosto y setiembre. Aquí el factor es el mismo todos los meses y un denominador vacío da «Sin datos». Las programadas son las que se ejecutaron más las suspendidas: el cuadro de indicadores del área divide solo entre las ejecutadas (junio de 2026: 4,7 % aquí, 4,9 % allá).'),
]);

/* Valor de cada insumo en el periodo, con el estado de su fuente. */
export function insumosDelPeriodo(periodo, reportes, propios) {
  const fuentes = fuentesDe(reportes, AREAS_INDICADORES, periodo);
  const delPeriodo = propios?.[periodo] ?? {};

  return Object.fromEntries(
    Object.entries(INSUMOS).map(([clave, def]) => {
      if (def.tipo === 'propio') {
        return [clave, { valor: delPeriodo[def.clave] ?? null, estado: 'propio' }];
      }
      if (def.ajuste && delPeriodo[def.ajuste] != null) return [clave, { valor: delPeriodo[def.ajuste], estado: 'propio' }];
      const fuente = fuentes[def.area];
      return [clave, { valor: fuente.datos ? (def.leer(fuente.datos) ?? null) : null, estado: fuente.estado, area: def.area }];
    }),
  );
}

function evaluar(indicador, valores) {
  const numerador = indicador.num.calc(valores) ?? null;
  const denominador = indicador.den.calc(valores) ?? null;
  /* Denominador vacío o cero no es 0: es «Sin datos». */
  const valor = numerador == null || denominador == null || denominador === 0 ? null : (numerador / denominador) * indicador.factor;
  return { numerador, denominador, valor };
}

export function calcularIndicadores(periodo, reportes, propios) {
  const insumos = insumosDelPeriodo(periodo, reportes, propios);
  const valores = Object.fromEntries(Object.entries(insumos).map(([k, v]) => [k, v.valor]));

  return INDICADORES.map((indicador) => {
    const claves = [...indicador.num.insumos, ...indicador.den.insumos];
    const areas = [...new Set(claves.map((k) => insumos[k]).filter((i) => i.area).map((i) => `${i.area}:${i.estado}`))].map((s) => {
      const [area, estado] = s.split(':');
      return { area, estado };
    });
    return { ...indicador, ...evaluar(indicador, valores), areas };
  });
}

/* Acumulado de varios periodos: se suman numeradores y denominadores y se
   recalcula, igual que la columna TOTAL del cuadro. Promediar los valores
   mensuales daría otro número y sería incorrecto. */
export function acumularIndicadores(periodos, reportes, propios) {
  const porPeriodo = periodos.map((p) => calcularIndicadores(p, reportes, propios));

  return INDICADORES.map((indicador, i) => {
    const nums = porPeriodo.map((lista) => lista[i].numerador);
    const dens = porPeriodo.map((lista) => lista[i].denominador);
    const completos = nums.map((nm, k) => nm != null && dens[k] != null);
    const numerador = completos.some(Boolean) ? nums.reduce((a, nm, k) => (completos[k] ? a + nm : a), 0) : null;
    const denominador = completos.some(Boolean) ? dens.reduce((a, dn, k) => (completos[k] ? a + dn : a), 0) : null;
    const valor = numerador == null || !denominador ? null : (numerador / denominador) * indicador.factor;
    return { n: indicador.n, numerador, denominador, valor, mesesConDato: completos.filter(Boolean).length };
  });
}

export function decimalesDe(indicador) {
  return indicador.factor === 1 ? 2 : 1;
}

export function filasCsvIndicadores(lista, acumulado) {
  return [
    ['N°', 'Categoría', 'Indicador', 'Numerador', 'Denominador', 'Factor', 'Valor del mes', 'Numerador acumulado', 'Denominador acumulado', 'Valor acumulado'],
    ...lista.map((ind, i) => [
      ind.n,
      ind.categoria,
      ind.nombre,
      ind.numerador,
      ind.denominador,
      ind.factor,
      ind.valor == null ? null : Number(ind.valor.toFixed(decimalesDe(ind))),
      acumulado?.[i]?.numerador ?? null,
      acumulado?.[i]?.denominador ?? null,
      acumulado?.[i]?.valor == null ? null : Number(acumulado[i].valor.toFixed(decimalesDe(ind))),
    ]),
  ];
}

/* Números de los indicadores que se alimentan de un área. */
export function indicadoresQueUsan(claveArea) {
  return INDICADORES.filter((indicador) =>
    [...indicador.num.insumos, ...indicador.den.insumos].some((k) => INSUMOS[k]?.area === claveArea),
  ).map((indicador) => indicador.n);
}
