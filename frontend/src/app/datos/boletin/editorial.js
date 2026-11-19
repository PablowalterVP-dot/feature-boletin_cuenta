/* Lo que el boletín tiene de editorial: portada, presentación, directorio,
   fotos de los separadores y el párrafo que abre cada capítulo.

   Separado de las cifras a propósito. Las introducciones describen qué hace
   cada servicio y no afirman tendencias: el boletín impreso decía «la
   producción de raciones se mantuvo en crecimiento» todos los meses, crezca o
   no. Lo que dice cómo le fue al mes lo redacta el boletín con las cifras
   (`dominio/redaccion.js`), y eso no se edita.

   Lo que Estadística cambia se guarda por periodo en el almacén
   (`store.js` → `boletinEditorial`); aquí solo están los valores de partida. */

export const EDITORIAL_DEFECTO = Object.freeze({
  portada: Object.freeze({
    titulo: 'HOSPITAL REGIONAL DE LORETO',
    unidad: 'Oficina de Estadística e Informática',
    lugar: 'Iquitos – Perú',
    imagen: '/boletin/portada-foto.png',
  }),
  presentacion: Object.freeze({
    parrafo:
      'El Hospital Regional de Loreto, a través de la Oficina de Estadística e Informática, presenta a la Dirección General, investigadores, estudiantes y a todo usuario en general, la publicación mensual del boletín estadístico. El propósito del presente boletín es informar, mediante ilustraciones gráficas y tablas, sobre los principales indicadores correspondientes al ámbito en el que se desenvuelve la Institución, como es la atención médica especializada.',
    firmante: 'Oficina de Estadística e Informática',
  }),
  directorio: Object.freeze({
    /* En el boletín impreso dice «Unidad de Informática E Informática»: se
       corrige al nombre de la portada. Confirmar el nombre oficial. */
    unidad: 'Oficina de Estadística e Informática',
    director: 'M.C. Jehoshua Rafael López López.',
    directorCargo: 'Director Ejecutivo del Hospital Regional de Loreto FAI',
    adjunto: 'Dr. Raúl Chuquiyauri Haro.',
    adjuntoCargo: 'Director Adjunto del Hospital Regional de Loreto FAI',
    administrador: 'Lic. Miguel Grandez Vela',
    administradorCargo: 'Director Administrativo del Hospital Regional de Loreto FAI',
    jefeEstadistica: 'Dr. Jhosephi Vasquez Ascate',
    jefeEstadisticaCargo: 'Jefe de la Oficina de Estadística e Informática',
    logo: '/boletin/logo-hospital-fai.jpg',
  }),
  /* Solo hay fotos para los capítulos del boletín impreso. Un capítulo nuevo
     sale sin foto hasta que Estadística le ponga una. */
  separadores: Object.freeze({
    emergencia: '/boletin/cap2-emergencia.png',
    'centro-quirurgico': '/boletin/cap4-centro-quirurgico.png',
    patologia: '/boletin/cap5-patologia.png',
    laboratorio: '/boletin/cap6-laboratorio.png',
    imagenes: '/boletin/cap7-imagenes.png',
    nutricion: '/boletin/cap8-nutricion.png',
    lavanderia: '/boletin/cap9-lavanderia.png',
  }),
  introducciones: Object.freeze({
    'consulta-externa':
      'La Consulta Externa brinda atención médica especializada a pacientes ambulatorios, que acuden con cita o referidos desde otros establecimientos.',
    emergencia:
      'El Servicio de Emergencia cumple un rol esencial en la atención inmediata, continua y resolutiva de los pacientes urgentes o emergentes que comprometen la vida o la funcionalidad, asegurando su estabilización y su derivación adecuada a los servicios hospitalarios.',
    hospitalizacion:
      'Hospitalización reúne a los pacientes que ocupan una cama del hospital. Sus indicadores miden cuánto tiempo permanecen y qué tan aprovechadas están las camas disponibles.',
    'centro-quirurgico':
      'El Centro Quirúrgico concentra las intervenciones programadas y de emergencia del hospital. Sus indicadores miden el rendimiento de las salas de operaciones y la oportunidad de la atención quirúrgica.',
    patologia:
      'El servicio de Patología Clínica brinda soporte esencial al diagnóstico médico mediante el análisis de exámenes, citologías y otros estudios. Su producción es un indicador de la capacidad diagnóstica del hospital.',
    laboratorio:
      'El Laboratorio Clínico es un soporte indispensable para el diagnóstico y tratamiento de pacientes: procesa exámenes de bioquímica, hematología, microbiología, inmunología y parasitología.',
    imagenes:
      'El servicio de Diagnóstico por Imágenes apoya el proceso clínico mediante rayos X, ecografía, tomografía y mamografía. Su producción refleja la capacidad de diagnóstico temprano y de seguimiento de patologías.',
    nutricion:
      'El servicio de Nutrición y Dietética garantiza la alimentación de los pacientes hospitalizados y del personal, contribuyendo al proceso de recuperación y bienestar.',
    lavanderia:
      'El servicio de Lavandería asegura la provisión de ropa limpia para pacientes, personal y servicios asistenciales, y contribuye al control de las infecciones intrahospitalarias.',
    ginecologia:
      'El Departamento de Gineco-Obstetricia atiende el embarazo, el parto y el puerperio. Sus indicadores perinatales son parte de los de calidad de la gestión hospitalaria.',
    epidemiologia:
      'La Oficina de Epidemiología vigila las infecciones intrahospitalarias, notifica los casos sujetos a vigilancia e investiga los brotes.',
    farmacia:
      'El Departamento de Farmacia dispensa los medicamentos e insumos prescritos y vigila el abastecimiento del hospital.',
    nefrologia:
      'El Servicio de Nefrología y Hemodiálisis atiende a los pacientes con enfermedad renal en su programa de hemodiálisis.',
    indicadores:
      'Los indicadores de gestión hospitalaria siguen el formato de GERESA Loreto, estándar del Ministerio de Salud: producción y rendimiento, eficiencia y calidad.',
  }),
});

const PARTES = Object.keys(EDITORIAL_DEFECTO);

/* El editorial de un periodo: lo guardado encima de los valores de partida. */
export function editorialDe(guardado) {
  return Object.fromEntries(PARTES.map((p) => [p, { ...EDITORIAL_DEFECTO[p], ...guardado?.[p] }]));
}
