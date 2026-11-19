/* Qué significa cada cifra de Monitoreo Indicadores, dicho para quien no conoce la ficha.

     significa  qué mide, en una frase.
     medida     lo que acompaña a la cifra grande: «0.4 %» solo no dice nada, «0.4 % de las
                emergencias graves se refirió a otro establecimiento» sí.
     lee        la cifra de este periodo, en palabras. Recibe:
                  v     el valor ya con formato y sin unidad
                  num   el numerador con formato, o null si la cifra es un promedio de meses
                  den   el denominador con formato, o null

   Las razones de los meses (cirugías por sala, egresos por cama) se dicen «al mes»: al sumar
   numeradores y denominadores de varios meses, el resultado es el promedio mensual. Las
   acumuladas se dicen «en lo que va del año»: la ficha 18, 3.8 egresos por cama, no es por día
   ni por mes. Decirlo mal aquí llevaría a una conclusión falsa. */

const de = (num, den, cuerpo) => (num != null && den != null ? ` (${num} ${cuerpo} ${den})` : '');

const porCien = (quienes, hecho, cuerpo = 'de') => ({ v, num, den }) => `De cada 100 ${quienes}, ${v} ${hecho}${de(num, den, cuerpo)}.`;

export const LECTURAS = Object.freeze({
  1: { significa: 'Niñas y niños de 12 a 18 meses que tuvieron anemia entre los 6 y los 11 meses, y ya se recuperaron.', medida: 'de los niños con anemia se recuperó', lee: porCien('niños con anemia', 'se recuperaron') },
  2: { significa: 'Niñas y niños de 6 a 11 meses que iniciaron hierro preventivo, completaron los 6 meses y siguen sin anemia.', medida: 'completó el hierro y sigue sin anemia', lee: porCien('niños que iniciaron hierro', 'lo completaron sin anemia') },
  3: { significa: 'Recién nacidos a los que se les hizo el tamizaje neonatal metabólico.', medida: 'de los recién nacidos con tamizaje', lee: porCien('recién nacidos', 'tienen su tamizaje') },
  4: { significa: 'Menores de 2 años con crecimiento inadecuado que mejoran su nutrición tras el seguimiento.', medida: 'mejoró su nutrición', lee: porCien('niños con crecimiento inadecuado', 'mejoraron') },
  5: { significa: 'Niñas y niños de 24 meses con todas las vacunas que corresponden a su edad.', medida: 'de los niños con vacunas completas', lee: porCien('niños de 24 meses', 'tienen sus vacunas completas') },
  6: { significa: 'Recién nacidos en el hospital que reciben BCG y anti-hepatitis B hasta un día después de nacer.', medida: 'de los recién nacidos, vacunados a tiempo', lee: porCien('recién nacidos', 'recibieron las dos vacunas a tiempo') },
  7: { significa: 'Personas con tuberculosis sensible que terminan su tratamiento con éxito.', medida: 'de los pacientes con TB, con tratamiento exitoso', lee: porCien('personas con TB sensible', 'terminaron con éxito') },
  8: { significa: 'Contactos de personas con tuberculosis que completan la terapia preventiva.', medida: 'de los contactos completó la terapia', lee: porCien('contactos de TB', 'completaron la terapia preventiva') },
  9: { significa: 'Adultos con VIH que inician tratamiento antirretroviral y completan la terapia preventiva de tuberculosis.', medida: 'de los adultos con VIH completó la terapia', lee: porCien('adultos con VIH que inician tratamiento', 'completaron la terapia preventiva de TB') },
  10: { significa: 'Niñas y niños de 6 meses a 6 años que reciben procedimientos preventivos de salud bucal.', medida: 'de los niños con prevención bucal', lee: porCien('niños', 'recibieron prevención bucal') },
  11: { significa: 'Personas de 15 a 49 años con consejería en salud sexual que usan un método anticonceptivo moderno.', medida: 'de las personas con consejería usa un método moderno', lee: porCien('personas con consejería', 'usaron un método moderno') },
  12: { significa: 'Gestantes referidas por factores de riesgo que tienen 2 o más atenciones prenatales en el hospital.', medida: 'de las gestantes referidas, con 2 o más atenciones', lee: porCien('gestantes referidas', 'tuvieron 2 o más atenciones prenatales') },
  13: { significa: 'Gestantes que reciben el paquete preventivo básico priorizado.', medida: 'de las gestantes con el paquete básico', lee: porCien('gestantes', 'recibieron el paquete preventivo') },
  14: { significa: 'Pacientes con cáncer que empiezan su tratamiento dentro de los 37 días desde el diagnóstico.', medida: 'de los pacientes empezó tratamiento en 37 días o menos', lee: porCien('pacientes con cáncer', 'empezaron tratamiento en 37 días o menos') },
  15: { significa: 'Mamografías de tamizaje hechas, frente a lo que puede producir el mamógrafo en un año. No es cobertura de la población.', medida: 'de la capacidad anual del mamógrafo', lee: ({ v, num, den }) => `Se hicieron ${num} mamografías de las ${den} que el mamógrafo puede producir en el año: ${v} % de su capacidad.`, proyectable: true },
  16: { significa: 'Niñas y niños de 9 años vacunados contra el virus del papiloma humano.', medida: 'de los niños de 9 años, vacunados', lee: porCien('niños de 9 años', 'están vacunados contra el VPH') },
  17: { significa: 'Menores de 5 años con riesgo de discapacidad que reciben 6 o más atenciones de rehabilitación.', medida: 'de los niños en riesgo, con 6 o más atenciones', lee: porCien('niños con riesgo de discapacidad', 'tuvieron 6 o más atenciones') },
  18: { significa: 'Cuántos pacientes dio de alta, en promedio, cada cama de la unidad de salud mental durante el año.', medida: 'egresos por cama en lo que va del año', lee: ({ v, num, den }) => `Cada cama de salud mental dio de alta a ${v} pacientes en lo que va del año (${num} egresos en ${den} camas).`, proyectable: true },
  19: { significa: 'Personas con depresión que reciben el paquete estándar de intervenciones.', medida: 'recibió el paquete completo', lee: porCien('personas con depresión', 'recibieron el paquete') },
  20: { significa: 'De las emergencias graves (prioridad I y II), cuántas se refirieron a otro establecimiento. A menos referencias, más casos resuelve el propio hospital.', medida: 'de las emergencias graves se refirió a otro establecimiento', lee: ({ v, num, den }) => `De cada 100 emergencias graves, ${v} se refirieron a otro establecimiento y las demás se resolvieron aquí${de(num, den, 'referencias en')}.` },
  21: { significa: 'Cuántas cirugías hace cada sala de operaciones en un mes.', medida: 'intervenciones por sala al mes', lee: ({ v, num, den }) => `Cada sala hizo en promedio ${v} intervenciones al mes (${num} intervenciones entre ${den} salas-mes).` },
  22: { significa: 'De las cirugías programadas, cuántas no se llegaron a hacer.', medida: 'de las cirugías programadas se suspendió', lee: porCien('cirugías programadas', 'se suspendieron') },
  23: { significa: 'Qué parte de los días-cama disponibles estuvo ocupada por un paciente.', medida: 'de los días-cama, ocupados', lee: ({ v, num, den, parte }) => `De cada 100 días-cama disponibles${parte ? ` en ${parte}` : ''}, ${v} estuvieron ocupados${de(num, den, 'de')}.` },
  24: { significa: 'Cuántos días queda vacía una cama entre que sale un paciente y entra el siguiente.', medida: 'días con la cama vacía entre un paciente y otro', lee: ({ v }) => `Entre un paciente y el siguiente, cada cama queda vacía ${v} días en promedio.` },
  25: { significa: 'Cuántos días espera un paciente referido, desde que se acepta su referencia hasta que lo atienden en consulta externa.', medida: 'días de espera por paciente referido', lee: ({ v, den }) => `Un paciente referido espera en promedio ${v} días para que lo atiendan en consulta externa${den != null ? ` (${den} pacientes)` : ''}.` },
  26: { significa: 'Cuántos turnos de medicina tiene cada consultorio físico. La meta es 2: doce horas de atención al día.', medida: 'turnos por consultorio', lee: ({ v }) => `Cada consultorio de medicina funciona en promedio con ${v} turnos al día.` },
  27: { significa: 'Infecciones que los pacientes adquieren por la atención: por días de ventilador o de catéter, o por procedimiento.', medida: '', lee: ({ v, parte, unidad }) => `${parte}: ${v} ${unidad === '%' ? '% de los pacientes intervenidos' : `casos ${unidad}`}.` },
  28: { significa: 'Qué parte de los medicamentos esenciales tuvo existencias disponibles en el mes.', medida: 'de los medicamentos esenciales, con existencias', lee: porCien('medicamentos esenciales', 'tuvieron existencias') },
  29: { significa: 'Registros de personal en INFORHUS que no tienen inconsistencias.', medida: 'de los registros, sin inconsistencias', lee: porCien('registros de personal', 'no tienen inconsistencias') },
  30: { significa: 'Registros de personal que coinciden entre AIRHSP, INFORHUS y la planilla de haberes.', medida: 'de los registros concuerda', lee: ({ v, parte }) => `${parte}: ${v} de cada 100 registros concuerdan entre los aplicativos.` },
  31: { significa: 'Médicos registrados en INFORHUS que, en el mismo mes, tienen turno y atención registrados en los demás aplicativos.', medida: 'de los médicos concuerda en los aplicativos', lee: porCien('médicos registrados', 'concuerdan en los aplicativos') },
  32: { significa: 'Cuántas teleinterconsultas hace el hospital por cada 10 000 atenciones.', medida: 'teleinterconsultas por cada 10 000 atenciones', lee: ({ v }) => `Por cada 10 000 atenciones, el hospital hizo ${v} teleinterconsultas ponderadas en lo que va del año.` },
  33: { significa: 'Atenciones de consulta externa y prenatal firmadas digitalmente en el SIHCE del MINSA.', medida: 'de las atenciones firmadas', lee: porCien('atenciones', 'se firmaron digitalmente') },
  34: { significa: 'Atenciones de consulta externa firmadas digitalmente en el SIHCE del INEN.', medida: 'de las atenciones firmadas', lee: porCien('atenciones', 'se firmaron digitalmente') },
});

const conMes = (frase) => ({ v }) => `${frase.replace('{v}', v)}`;

/* Los 22 de GERESA. `mejor`: hacia dónde es bueno que se mueva; sin él, un cambio solo es un
   cambio: más análisis por consulta no es mejor ni peor. GERESA no les fija logro. */
export const LECTURAS_GERESA = Object.freeze({
  1: { medida: 'atenciones por hora médico programada', mejor: 'mas', lee: conMes('Por cada hora médico programada se dieron {v} atenciones.') },
  2: { medida: 'atenciones por hora médico trabajada', mejor: 'mas', lee: conMes('Por cada hora médico trabajada se dieron {v} atenciones.') },
  3: { medida: 'atenciones por paciente', lee: conMes('Cada paciente de consulta externa tuvo en promedio {v} atenciones.') },
  4: { medida: 'consultorios funcionales por cada consultorio físico', mejor: 'mas', lee: conMes('Por cada consultorio físico funcionan {v} consultorios: es mayor que 1 porque se cuentan turnos.') },
  5: { medida: 'análisis por atención', lee: conMes('Por cada atención de consulta externa se pidieron {v} análisis de laboratorio.') },
  6: { medida: 'días de hospitalización por egreso', lee: conMes('Un paciente permanece hospitalizado {v} días en promedio.') },
  7: { medida: 'días con la cama vacía entre un paciente y otro', mejor: 'menos', lee: conMes('Entre un paciente y el siguiente, cada cama queda vacía {v} días.') },
  8: { medida: 'de los días-cama, ocupados', mejor: 'mas', lee: conMes('De cada 100 días-cama disponibles, {v} estuvieron ocupados.') },
  9: { medida: 'egresos por cama al mes', mejor: 'mas', lee: conMes('Cada cama dio de alta en promedio a {v} pacientes al mes.') },
  10: { medida: 'atenciones de emergencia por cada consulta', lee: conMes('Por cada atención de consulta externa hubo {v} atenciones de emergencia de prioridad I y II.') },
  11: { medida: 'urgencias por cada consulta', lee: conMes('Por cada atención de consulta externa hubo {v} urgencias en emergencia.') },
  12: { medida: 'intervenciones por sala al mes', mejor: 'mas', lee: conMes('Cada sala hizo en promedio {v} intervenciones al mes, sumando electivas y de emergencia.') },
  13: { medida: 'intervenciones de emergencia por sala al mes', lee: conMes('Cada sala hizo en promedio {v} intervenciones de emergencia al mes.') },
  14: { medida: 'intervenciones electivas por sala al mes', mejor: 'mas', lee: conMes('Cada sala hizo en promedio {v} intervenciones electivas al mes.') },
  15: { medida: 'de las consultas se refirió a otro nivel', mejor: 'menos', lee: conMes('De cada 100 consultas externas, {v} se refirieron a otro nivel de atención.') },
  16: { medida: 'de los egresos con infección intrahospitalaria', mejor: 'menos', lee: conMes('De cada 100 pacientes que egresaron, {v} tuvieron una infección intrahospitalaria.') },
  17: { medida: 'de los egresos, por fallecimiento tras 48 horas', mejor: 'menos', lee: conMes('De cada 100 egresos, {v} fueron por fallecimiento después de 48 horas de hospitalización.') },
  18: { medida: 'de los partos por cesárea', lee: conMes('De cada 100 partos, {v} fueron por cesárea.') },
  19: { medida: 'muertes perinatales por 1 000 nacimientos', mejor: 'menos', lee: conMes('Por cada 1 000 nacimientos hubo {v} muertes fetales tardías o neonatales precoces.') },
  20: { medida: 'muertes en los primeros 7 días por 1 000 nacidos vivos', mejor: 'menos', lee: conMes('Por cada 1 000 nacidos vivos hubo {v} muertes en sus primeros 7 días de vida.') },
  21: { medida: 'muertes entre los días 8 y 28 por 1 000 nacidos vivos', mejor: 'menos', lee: conMes('Por cada 1 000 nacidos vivos hubo {v} muertes entre los 8 y los 28 días de vida.') },
  22: { medida: 'de las cirugías programadas se suspendió', mejor: 'menos', lee: conMes('De cada 100 cirugías programadas, {v} se suspendieron.') },
});

/* Dónde se aborda cada ficha del Anexo I. Se revisó con el Tablero de indicadores, ficha por
   ficha, según sus fuentes y lo que mide (03/11/2026):

     desempeno    salud pública y estrategias sanitarias; también la calidad y los recursos
                  humanos que evalúa el Anexo. Fuentes: HIS, Padrón Nominal, CNV, SIGTB,
                  SIHCE-VIH, IAAS, SISMED, INFORHUS.
     gestion      cómo funciona el hospital. Fuentes: SEEM, RENOXI, SETI-IPRESS, REFCON,
                  recursos de salud, y el uso de telemedicina. Siguen en «Desempeño», donde el
                  Anexo las evalúa, y se enlazan desde «Gestión hospitalaria».
     compromisos  la firma digital: la del hospital se mide en el compromiso de mejora 43, y
                  las fichas 33 y 34 se evalúan a otros (primer nivel e INEN). */
export const ASIGNACION = Object.freeze({
  desempeno: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 27, 28, 29, 30, 31]),
  gestion: Object.freeze([18, 20, 21, 22, 23, 24, 25, 26, 32]),
  compromisos: Object.freeze([33, 34]),
});

/* Los indicadores que cada área ve en su propia cuenta, por el n.º de GERESA (07/11/2026,
   validado por Estadística): los que salen directamente de su oficio, uno por tema. Centro
   Quirúrgico mide en GERESA y en el DL 1153 lo mismo (rendimiento de sala, suspendidas): se
   quedan los cuatro de GERESA. Se calculan solo con sus reportes (inicio/IndicadoresDelArea.jsx).
   Los parciales y los «dato relacionado» no van: le dirían al área que su oficio basta. */
export const INDICADORES_DEL_AREA = Object.freeze({
  'centro-quirurgico': Object.freeze([12, 13, 14, 22]),
  ginecologia: Object.freeze([18]),
});

export const asignacionDe = (ficha) => Object.keys(ASIGNACION).find((k) => ASIGNACION[k].includes(Number(ficha))) ?? null;

/* Cada indicador de GERESA que comparte tema con una ficha de gestión del Anexo. No son la
   misma cifra: cambia el criterio, y la tarjeta de cada uno lo dice. */
export const GERESA_DE_FICHA = Object.freeze({ 20: 15, 21: 14, 22: 22, 23: 8, 24: 7, 26: 4 });
