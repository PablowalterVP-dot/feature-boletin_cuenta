/* Los compromisos de mejora del Anexo I que alcanzan al hospital.

   El Anexo trae 14 (fichas 35 a 48, la 37 con cinco partes). Solo estos seis nombran en su
   ámbito a los hospitales de tercer nivel. A diferencia de un indicador, no se miden con
   una cifra mensual: se cumplen entregando algo a tiempo. Por eso aquí hay entregables y
   plazos, no series.

   Estadística actualiza el avance. Lo que sustenta cada entregable (resolución, oficio,
   enlace) se escribe como referencia: el documento se queda donde exige MINSA. */

export const COMPROMISOS = Object.freeze([
  {
    numero: 38,
    nombre: 'Promoción y protección de la lactancia materna',
    detalle: 'Establecimiento «Amigo de la Madre, la Niña y el Niño». El camino depende de si el hospital ya está certificado.',
    fuente: 'Resolución de certificación vigente, emitida por la autoridad regional',
    entregables: [
      { clave: 'certificacion', nombre: 'Certificación vigente, o autoevaluación de 80 % o más con solicitud de evaluación externa', plazo: '2026-11-30' },
      { clave: 'monitoreo_1', nombre: 'Primer monitoreo con la ficha del Anexo 04', plazo: null },
      { clave: 'monitoreo_2', nombre: 'Segundo monitoreo, a no más de tres meses', plazo: null },
      { clave: 'monitoreo_3', nombre: 'Tercer monitoreo, a no más de tres meses', plazo: null },
      { clave: 'monitoreo_4', nombre: 'Cuarto monitoreo, a no más de tres meses', plazo: null },
      { clave: 'informe_anual', nombre: 'Informe anual de los monitoreos, enviado a GERESA', plazo: '2026-11-30' },
    ],
  },
  {
    numero: 41,
    nombre: 'Vigilancia de sarampión-rubéola y parálisis flácida aguda',
    detalle: 'El resultado es el promedio de lo alcanzado en las dos vigilancias. El Anexo 02 le pide a este hospital 2 casos sospechosos de sarampión-rubéola y 1 de parálisis flácida.',
    fuente: 'Notiweb y módulo OSIRIS, con cierre de base al 31 de enero de 2027',
    entregables: [
      { clave: 'sr_negativa', nombre: 'Notificación negativa semanal de sarampión-rubéola en 90 % o más de las semanas (vale 10 %)', plazo: '2026-12-31' },
      { clave: 'sr_casos', nombre: 'Al menos 2 casos sospechosos de sarampión-rubéola notificados (vale 40 %)', plazo: '2026-12-31' },
      { clave: 'pfa_negativa', nombre: 'Notificación negativa semanal de parálisis flácida en 90 % o más de las semanas (vale 10 %)', plazo: '2026-12-31' },
      { clave: 'pfa_casos', nombre: 'Al menos 1 caso de parálisis flácida aguda notificado (vale 40 %)', plazo: '2026-12-31' },
    ],
  },
  {
    numero: 43,
    nombre: 'Historia clínica electrónica: firma digital',
    detalle: 'Profesionales que atienden en consulta externa de medicina con certificado digital activo para firmar en el SIHCE.',
    fuente: 'INFORHUS, RENIEC e informe del establecimiento',
    entregables: [
      { clave: 'certificados_30', nombre: '30 % de los profesionales con certificado digital activo', plazo: '2026-06-30' },
      { clave: 'certificados_80', nombre: '80 % de los profesionales con certificado digital activo', plazo: '2026-12-31' },
      { clave: 'informes', nombre: 'Informes trimestrales de avance, con la relación de profesionales', plazo: '2026-12-31' },
    ],
  },
  {
    numero: 44,
    nombre: 'Rondas de seguridad del paciente',
    detalle: 'Al menos una ronda al mes, cubriendo por semestre emergencia, cuidados intensivos, centro obstétrico y centro quirúrgico. El criterio 1 vale 30 % y el criterio 2, 70 %.',
    fuente: 'Documento de conformidad de la Unidad de Gestión de la Calidad del MINSA',
    entregables: [
      { clave: 'equipo', nombre: 'Equipo de rondas reconocido con acto resolutivo y publicado', plazo: '2026-02-28' },
      { clave: 'cronograma', nombre: 'Cronograma 2026 aprobado, con mínimo una ronda por mes', plazo: '2026-02-28' },
      { clave: 'informe_i', nombre: 'Informe del primer semestre: 6 rondas, con buenas prácticas en 70 % o más', plazo: '2026-07-31' },
      { clave: 'informe_ii', nombre: 'Informe del segundo semestre: 6 rondas, con buenas prácticas en 80 % o más', plazo: '2026-12-31' },
    ],
  },
  {
    numero: 45,
    nombre: 'Autoevaluación para la acreditación',
    detalle: 'Se envía por GERESA a la Unidad de Gestión de la Calidad del MINSA.',
    fuente: 'Documento de conformidad publicado en la web del MINSA',
    entregables: [
      { clave: 'organizacion', nombre: 'Equipo de acreditación, evaluadores internos, plan aprobado y fecha de inicio comunicada (vale 50 %)', plazo: '2026-07-30' },
      { clave: 'ejecucion', nombre: 'Informe técnico final y Excel de resultados de la autoevaluación (vale 50 %)', plazo: '2026-12-30' },
    ],
  },
  {
    numero: 46,
    nombre: 'Fomento de la investigación en salud',
    detalle: 'Para hospitales de categoría III-1. Protocolos y publicaciones se puntúan por quintiles frente a hospitales de la misma categoría. Hay informe de avance al 30 de junio.',
    fuente: 'Informe a la SUDIV del INS, por REDCap',
    entregables: [
      { clave: 'protocolos', nombre: 'Protocolos de investigación aprobados por el Comité de Ética (vale 50 %)', plazo: '2026-12-31' },
      { clave: 'comite', nombre: 'Comité de Ética registrado en el INS, o acreditado (vale 10 %)', plazo: '2026-12-31' },
      { clave: 'publicaciones', nombre: 'Publicaciones originales en revistas indizadas (vale 40 %)', plazo: '2026-12-31' },
    ],
  },
]);

export const compromisoDe = (numero) => COMPROMISOS.find((c) => c.numero === Number(numero)) ?? null;
