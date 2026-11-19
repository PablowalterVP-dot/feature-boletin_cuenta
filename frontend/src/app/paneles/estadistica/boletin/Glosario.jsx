import { HojaA4 } from './HojaA4.jsx';

/* Glosario del boletín impreso, sin cambios de fondo. La nota metodológica
   ahora es cierta: el boletín solo toma reportes validados. */
const TERMINOS_1 = [
  ['Consulta médica', 'Es la consulta realizada por el médico en la consulta externa para formular el diagnóstico, tratamiento y pronóstico de una persona que acude como paciente ambulatorio al hospital.'],
  ['Consulta externa', 'Es la atención regular de salud impartida por personal calificado a una persona no hospitalizada ni en el Servicio de Urgencias.'],
  ['Productividad hora médico programada', 'Permite evaluar la productividad del recurso médico, al conocer el número de atenciones que realiza por cada hora programada de trabajo en consultorio externo.'],
  ['Concentración de consultas', 'Promedio de consultas que se ha otorgado a cada paciente que acudió al establecimiento de salud durante un periodo.'],
  ['Utilización de consultorios', 'Grado de uso de los consultorios de consulta externa en relación con los turnos que se programan para la atención en el servicio.'],
  ['Atendido', 'Pacientes nuevos y reingresantes que recibieron atención médica especializada. Atendidos = nuevos + reingresantes.'],
  ['Atenciones', 'Pacientes nuevos, reingresantes y continuadores que recibieron atención médica especializada. Atenciones = nuevos + reingresantes + continuadores.'],
];

const TERMINOS_2 = [
  ['Paciente nuevo (N)', 'Persona que por primera vez en su vida acude a solicitar atención de salud en el establecimiento.'],
  ['Paciente continuador (C)', 'Persona que acude a atenderse por segunda o más veces en el año.'],
  ['Paciente reingresante (R)', 'Persona que acude por primera vez en el año, pero ya fue atendida en años anteriores.'],
  ['Diagnóstico presuntivo (P)', 'Se usa cuando no existe certeza del diagnóstico o requiere confirmación de laboratorio.'],
  ['Diagnóstico definitivo (D)', 'Cuando existe certeza clínica o por exámenes auxiliares.'],
  ['Diagnóstico repetido (R)', 'Cuando el paciente vuelve por seguimiento del mismo proceso.'],
  ['Egreso hospitalario', 'Retiro de los servicios de hospitalización de un paciente que ha ocupado una cama del hospital: alta médica, traslado, defunción o retiro voluntario.'],
  ['Porcentaje de ocupación de camas', 'Relación entre los pacientes hospitalizados por día y las camas disponibles por día. Mide el grado de utilización del recurso cama en un periodo.'],
];

const Lista = ({ terminos }) => (
  <dl className="boletin-glosario">
    {terminos.map(([t, d]) => (
      <div key={t}>
        <dt>{t}</dt>
        <dd>{d}</dd>
      </div>
    ))}
  </dl>
);

export function Glosario({ periodo, pagina }) {
  return (
    <>
      <HojaA4 numero={pagina} periodo={periodo}>
        <h2 className="boletin-titulo-hoja">Glosario de términos</h2>
        <Lista terminos={TERMINOS_1} />
      </HojaA4>
      <HojaA4 numero={pagina + 1} periodo={periodo}>
        <Lista terminos={TERMINOS_2} />
        <p className="boletin-nota">
          <strong>Nota metodológica.</strong> Los indicadores siguen el formato de Indicadores de Gestión Hospitalaria de GERESA
          Loreto, estándar del Ministerio de Salud. El boletín solo incluye reportes validados por la Oficina de Estadística: un
          capítulo cuya área no envió o cuyo reporte no se validó no se publica. Cuando falta el numerador o el denominador, o el
          denominador es cero, el indicador figura como «Sin datos» y no como cero.
        </p>
      </HojaA4>
    </>
  );
}
