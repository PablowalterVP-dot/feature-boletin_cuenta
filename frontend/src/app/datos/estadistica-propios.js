/* Datos que Estadística obtiene por su cuenta, sin pasar por las nueve áreas.

   Buena parte de los 22 indicadores de gestión se alimenta de registros que
   Estadística ya tiene: el HIS de consulta externa, el módulo de egresos, el
   parte diario de camas, el registro de emergencias y el de referencias. Esos
   datos no los envía ningún área del alcance del proyecto, así que en el
   prototipo los digita Estadística en el módulo de remisión a DIRESA.

   LAS CIFRAS SON FICTICIAS: órdenes de magnitud de un hospital regional de
   unas 300 camas.

   Un mismo dato alimenta los dos formatos cuando corresponde: las camas
   disponibles del mes son a la vez el denominador de «Rendimiento cama» y el
   campo «Total camas hospitalarias» del consolidado. El análisis del formato
   DIRESA recomienda justamente eso —una sola fuente— para que los dos reportes
   no den cifras distintas. */

import { aleatorio, factorDelPeriodo } from './azar.js';
import { diasDelMes, ultimosPeriodos } from '@/app/dominio/periodos.js';

export const GRUPOS_PROPIOS = Object.freeze(['Consulta externa', 'Hospitalización', 'Emergencia', 'Ambulancia', 'Mortalidad neonatal', 'Centro Quirúrgico']);

const campo = (clave, grupo, label, unidad, fuente) => Object.freeze({ clave, grupo, label, unidad, fuente });

export const CAMPOS_PROPIOS = Object.freeze([
  campo('atencionesCE', 'Consulta externa', 'Atenciones médicas realizadas', 'atenciones', 'HIS (Sistema de Consulta Externa)'),
  campo('atendidosCE', 'Consulta externa', 'Atendidos, nuevos y reingresos', 'pacientes', 'HIS (Sistema de Consulta Externa)'),
  campo('horasProgramadas', 'Consulta externa', 'Horas médico programadas', 'horas', 'Control de Personal, rol mensual'),
  campo('horasEfectivas', 'Consulta externa', 'Horas médico efectivas', 'horas', 'Reporte del servicio'),
  campo('consultoriosFuncionales', 'Consulta externa', 'Consultorios médicos funcionales', 'consultorios', 'Inventario de consultorios'),
  campo('consultoriosFisicos', 'Consulta externa', 'Consultorios médicos físicos', 'consultorios', 'Inventario de consultorios'),
  campo('referencias', 'Consulta externa', 'Referencias enviadas desde consulta externa', 'referencias', 'Formatos de referencia y contrarreferencia'),
  campo('egresos', 'Hospitalización', 'Egresos hospitalarios', 'egresos', 'Módulo de Egresos Hospitalarios'),
  campo('diasEstancia', 'Hospitalización', 'Días de estancia de los egresos', 'días', 'Módulo de Egresos Hospitalarios'),
  campo('pacientesDia', 'Hospitalización', 'Pacientes-día', 'pacientes-día', 'Parte diario de camas'),
  campo('diasCamaDisponibles', 'Hospitalización', 'Días-cama disponibles', 'días-cama', 'Parte diario de camas'),
  campo('camas', 'Hospitalización', 'Camas disponibles, promedio del mes', 'camas', 'Parte diario de camas'),
  campo('defunciones48', 'Hospitalización', 'Egresos por defunción después de 48 horas', 'defunciones', 'Módulo de Mortalidad Hospitalaria'),
  campo('atencionesEmergencia', 'Emergencia', 'Atenciones médicas en emergencia (prioridades I y II)', 'atenciones', 'Módulo de Emergencias'),
  campo('urgenciasEmergencia', 'Emergencia', 'Urgencias médicas en emergencia', 'urgencias', 'Informe de Emergencias'),
  campo('trasladosHosp', 'Ambulancia', 'Traslados en ambulancia desde hospitalización', 'traslados', 'Registro de ambulancia'),
  campo('trasladosEmerg', 'Ambulancia', 'Traslados en ambulancia desde emergencia', 'traslados', 'Registro de ambulancia'),
  campo('neonatalesPrecoces', 'Mortalidad neonatal', 'Recién nacidos fallecidos en los primeros 7 días', 'recién nacidos', 'Sistema Informático Perinatal'),
  campo('neonatalesTardias', 'Mortalidad neonatal', 'Recién nacidos fallecidos entre los 8 y 28 días', 'recién nacidos', 'Sistema Informático Perinatal'),
  campo('salasOperativas', 'Centro Quirúrgico', 'Salas de operaciones operativas', 'salas', 'Centro Quirúrgico. Sin escribir, son 4'),
  campo('trasladosCE', 'Ambulancia', 'Traslados en ambulancia desde consulta externa', 'traslados', 'Registro de ambulancia'),
]);

export function campoPropio(clave) {
  return CAMPOS_PROPIOS.find((cp) => cp.clave === clave) ?? null;
}

function variar(base, clave, periodo, factor = factorDelPeriodo(periodo)) {
  return Math.max(0, Math.round(base * factor * (0.93 + aleatorio(`${periodo}:propio:${clave}`) * 0.14)));
}

export function propiosSimulados(periodo) {
  const factor = factorDelPeriodo(periodo);
  const camas = aleatorio(`${periodo}:camas`) < 0.3 ? 296 : 300;
  const diasCamaDisponibles = camas * diasDelMes(periodo);
  /* La ocupación se mueve entre 82 % y 91 %, por debajo de la capacidad. */
  const pacientesDia = Math.round(diasCamaDisponibles * (0.82 + aleatorio(`${periodo}:ocupacion`) * 0.09));
  const egresos = variar(1350, 'egresos', periodo);
  const atencionesCE = variar(13500, 'atencionesCE', periodo);
  const atencionesEmergencia = variar(3600, 'atencionesEmergencia', periodo);
  const horasProgramadas = variar(4200, 'horasProgramadas', periodo, 1);

  return {
    atencionesCE,
    atendidosCE: Math.round(atencionesCE / (2.3 + aleatorio(`${periodo}:concentracion`) * 0.5)),
    horasProgramadas,
    horasEfectivas: Math.round(horasProgramadas * (0.86 + aleatorio(`${periodo}:efectivas`) * 0.1)),
    /* Más funcionales que físicos: el cuadro real del hospital muestra esta
       relación en todos los meses, probablemente por consultorios de doble
       turno. Se reproduce para que la observación sea visible. */
    consultoriosFuncionales: 58,
    consultoriosFisicos: 53,
    referencias: variar(180, 'referencias', periodo),
    egresos,
    diasEstancia: Math.round(egresos * (5.1 + aleatorio(`${periodo}:permanencia`) * 0.9)),
    pacientesDia: Math.min(pacientesDia, diasCamaDisponibles),
    diasCamaDisponibles,
    camas,
    defunciones48: variar(38, 'defunciones48', periodo),
    atencionesEmergencia,
    urgenciasEmergencia: Math.round(atencionesEmergencia * (0.28 + aleatorio(`${periodo}:urgencias`) * 0.06)),
    trasladosHosp: variar(60, 'trasladosHosp', periodo, factor),
    trasladosEmerg: variar(140, 'trasladosEmerg', periodo, factor),
    trasladosCE: variar(20, 'trasladosCE', periodo, factor),
  };
}

export const PROPIOS_INICIALES = Object.freeze(
  Object.fromEntries(ultimosPeriodos(8).map((p) => [p, propiosSimulados(p)])),
);
