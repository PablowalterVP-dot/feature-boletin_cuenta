/* Resumen de un reporte, para verlo sin abrir sus formatos.

   El historial y la bandeja de revisión necesitan decir en una línea de qué
   tamaño fue el mes. Cada área mide cosas distintas —kilos, atenciones,
   estudios—, así que cada una trae su propio resumen. Las que todavía no tienen
   su oficio levantado devuelven null, y la pantalla lo dice en lugar de pintar
   un cero.

   Forma de cada cifra:
     { clave, etiqueta, valor, unidad, decimales?, ayuda } */

import { totalF1, totalesF3, totalPiezas, totalConfeccionado } from './lavanderia-calculos.js';
import { cifrasImagenes } from './imagenes-calculos.js';
import { cifrasNutricion } from './nutricion-calculos.js';
import { totalCuadro, sumar } from './laboratorio-calculos.js';
import { cifrasFarmacia, LECTURA_RECETAS } from './farmacia-calculos.js';
import { cifrasCentroQuirurgico } from './centro-quirurgico-calculos.js';
import { cifrasNefrologia } from './nefrologia-calculos.js';
import { cifrasGinecologia } from './ginecologia-calculos.js';
import { cifrasEpidemiologia, LECTURA_IIH } from './epidemiologia-calculos.js';

function resumenLavanderia(datos, periodo) {
  const kilos = totalF1(datos.f1 ?? {}, periodo);
  const f3 = totalesF3(datos.f3 ?? {}, periodo);

  return [
    {
      clave: 'kilos',
      etiqueta: 'Ropa lavada',
      valor: kilos,
      unidad: 'kg',
      ayuda: 'Suma del registro diario del Formato 1 en todo el mes. Es la cifra que alimenta el consolidado.',
    },
    {
      clave: 'piezas',
      etiqueta: 'Piezas',
      valor: totalPiezas(datos.f4 ?? {}),
      unidad: 'piezas',
      ayuda: 'Número de prendas del Formato 4. Se cuenta y se digita: no sale de ningún otro cuadro.',
    },
    {
      clave: 'importe',
      etiqueta: 'Importe de lavado',
      valor: f3.importeTotal,
      unidad: 'soles',
      decimales: 2,
      ayuda: 'Kilos del Formato 3 por su tarifa: S/ 3,00 la ropa común y S/ 4,50 la ropa sucia.',
    },
    {
      clave: 'confeccion',
      etiqueta: 'Confeccionado',
      valor: totalConfeccionado(datos.f2 ?? []),
      unidad: 'piezas',
      ayuda: 'Total de prendas confeccionadas por Costura y ropería. En el oficio de papel esta suma no existe.',
    },
  ];
}

function resumenImagenes(datos) {
  const c = cifrasImagenes(datos);

  return [
    {
      clave: 'examenes',
      etiqueta: 'Exámenes',
      valor: c.examenes,
      unidad: 'exámenes',
      ayuda: 'Suma de las cuatro hojas: Rayos X, ecografía (con biopsias y procedimientos oncológicos), mamografía y tomografía.',
    },
    {
      clave: 'pacientes',
      etiqueta: 'Pacientes',
      valor: c.pacientes,
      unidad: 'pacientes',
      ayuda: 'Suma de los pacientes de cada hoja. Quien se hizo una ecografía y una radiografía cuenta en las dos: no son personas distintas.',
    },
    {
      clave: 'monto',
      etiqueta: 'Monto recaudado',
      valor: c.monto,
      unidad: 'soles',
      decimales: 2,
      ayuda: 'Suma de los montos que el área reporta en cada hoja. Se digitan: el oficio no dice qué tarifa aplica a cada examen.',
    },
    {
      clave: 'informes',
      etiqueta: 'Lecturas e informes',
      valor: c.informes,
      unidad: 'informes',
      ayuda: 'Tomografías informadas, lecturas de mamografía y lecturas de Rayos X. Las ecografías no llevan este cuadro: las informa el mismo médico que las hace.',
    },
  ];
}

function resumenNutricion(datos, periodo) {
  const c = cifrasNutricion(datos, periodo);

  return [
    {
      clave: 'raciones',
      etiqueta: 'Raciones servidas',
      valor: c.total,
      unidad: 'raciones',
      ayuda: 'Suma de los cuatro cuadros: comensales y pacientes, en hospitalización y emergencia.',
    },
    {
      clave: 'pacientes',
      etiqueta: 'Raciones a pacientes',
      valor: c.pacientes,
      unidad: 'raciones',
      ayuda: 'Cuadros 3 y 4. Es una de las dos cifras que Planeamiento registraría en CPlan (por confirmar).',
    },
    {
      clave: 'comensales',
      etiqueta: 'Raciones a comensales',
      valor: c.comensales,
      unidad: 'raciones',
      ayuda: 'Cuadros 1 y 2: personal asistencial, administrativo e internos. La otra cifra que usaría Planeamiento (por confirmar).',
    },
  ];
}

/* Banco de Sangre cuenta unidades entregadas, no exámenes, y el resumen del
   departamento, actividades de programación: van aparte y no se suman a los
   exámenes del mes. */
const PATOLOGIA_CLINICA = ['bioquimica', 'hematologia', 'microbiologia', 'uro_parasitologicos', 'inmuno_serologicos'];

function resumenLaboratorio(datos) {
  const t = (id) => totalCuadro(datos, id);
  const examenes = sumar([...PATOLOGIA_CLINICA, 'anatomia_patologica', 'metaxenicas'].map(t));

  return [
    {
      clave: 'examenes',
      etiqueta: 'Exámenes del mes',
      valor: examenes,
      unidad: 'exámenes',
      ayuda: 'Patología Clínica, Anatomía Patológica y Programas/Metaxénicas, en todas sus procedencias. Sin Banco de Sangre (unidades) ni las actividades de programación. Cuenta exámenes, no pacientes: quien se hizo tres exámenes cuenta tres veces.',
    },
    {
      clave: 'patologia',
      etiqueta: 'Patología clínica',
      valor: sumar(PATOLOGIA_CLINICA.map(t)),
      unidad: 'exámenes',
      ayuda: 'Bioquímica, Hematología, Microbiología, Uro-Parasitológicos e Inmuno-Serológicos: la fila «TOTAL DE EXAMENES LABORATORIO» del libro (desde abril de 2026; de enero a marzo esa fila sumaba todo el departamento).',
    },
    {
      clave: 'anatomia',
      etiqueta: 'Anatomía patológica',
      valor: t('anatomia_patologica'),
      unidad: 'exámenes',
      ayuda: 'PAP, BAAF, biopsias, piezas quirúrgicas y citología especial, más los tejidos, cortes, láminas, histoquímica e inmunohistoquímica que procesa la sección.',
    },
    {
      clave: 'sangre',
      etiqueta: 'Banco de Sangre',
      valor: t('banco_sangre'),
      unidad: 'unidades',
      ayuda: 'Unidades entregadas (sangre total, glóbulos rojos, plasma, crioprecipitado, plaquetas), grupos ABO en gel y pruebas cruzadas. No se suman a los exámenes.',
    },
  ];
}

/* Farmacia cuenta atenciones por financiador. La cifra principal es el total
   de atenciones, no las «recetas despachadas»: esa cifra tiene tres lecturas
   posibles y va cuarta, con la que se usa dicha en su ayuda. */
function resumenFarmacia(datos) {
  const c = cifrasFarmacia(datos);

  return [
    {
      clave: 'atenciones',
      etiqueta: 'Atenciones',
      valor: c.atenciones,
      unidad: 'atenciones',
      ayuda: 'Total de atenciones del Formato 1: SIS más convenios, programas, boletas de venta, crédito personal, Defensa Nacional e insolvencias. Se calcula, no se digita.',
    },
    {
      clave: 'sis',
      etiqueta: 'Atenciones SIS',
      valor: c.sis,
      unidad: 'atenciones',
      ayuda: 'Hospitalización, emergencia, consulta externa, hemodiálisis y oncología cubiertas por el Seguro Integral de Salud.',
    },
    {
      clave: 'boletas',
      etiqueta: 'Boletas de venta',
      valor: c.boletas,
      unidad: 'atenciones',
      ayuda: 'Atenciones pagadas directamente por el paciente.',
    },
    {
      clave: 'recetas',
      etiqueta: 'Recetas despachadas',
      valor: c.recetas,
      unidad: 'recetas',
      ayuda: LECTURA_RECETAS,
    },
  ];
}

/* Nefrología cuenta sesiones de hemodiálisis, no exámenes ni raciones: el
   indicador «TOTAL DE SESIONES ATENDIDAS» del propio cuadro. */
function resumenNefrologia(datos) {
  const c = cifrasNefrologia(datos);

  return [
    {
      clave: 'sesiones',
      etiqueta: 'Sesiones atendidas',
      valor: c.sesiones,
      unidad: 'sesiones',
      ayuda: 'Indicador «TOTAL DE SESIONES ATENDIDAS» del cuadro: la cifra principal del mes, tal como el servicio la trae calculada.',
    },
    {
      clave: 'pacientes',
      etiqueta: 'Pacientes atendidos',
      valor: c.pacientesAtendidos,
      unidad: 'pacientes',
      ayuda: 'Indicador «PACIENTES ATENDIDOS» del cuadro.',
    },
    {
      clave: 'hospitalizados',
      etiqueta: 'Hospitalizados',
      valor: c.hospitalizados,
      unidad: 'pacientes',
      ayuda: 'Indicador «HOSPITALIZADOS» del cuadro.',
    },
    {
      clave: 'fallecidos',
      etiqueta: 'Fallecidos',
      valor: c.fallecidos,
      unidad: 'pacientes',
      ayuda: 'Indicador «FALLECIDOS» del cuadro.',
    },
  ];
}

/* Gineco-Obstetricia cuenta partos, no sesiones ni exámenes: el indicador
   «TOTAL DE PARTOS» si el cuadro 2 llegó ese mes; si no, los controles
   prenatales del cuadro 1 (ver ginecologia-calculos.js). */
function resumenGinecologia(datos) {
  const c = cifrasGinecologia(datos);

  return [
    {
      clave: 'sesiones',
      etiqueta: c.partos != null ? 'Partos atendidos' : 'Controles prenatales',
      valor: c.sesiones,
      unidad: c.partos != null ? 'partos' : 'controles',
      ayuda: 'Indicador «TOTAL DE PARTOS» del cuadro 2 si el Excel lo trajo ese mes; si no, «CONTROLES PRENATALES REALIZADOS» del cuadro 1.',
    },
    {
      clave: 'controles',
      etiqueta: 'Controles prenatales',
      valor: c.controlesPrenatales,
      unidad: 'controles',
      ayuda: 'Indicador «CONTROLES PRENATALES REALIZADOS» del cuadro 1, sumado en los ocho grupos de edad.',
    },
    {
      clave: 'cesareas',
      etiqueta: 'Cesáreas',
      valor: c.cesareas,
      unidad: 'cesáreas',
      ayuda: 'Partos por cesárea (con y sin complicaciones) del cuadro 2. Vacío si el cuadro 2 no llegó ese mes.',
    },
    {
      clave: 'nacidosVivos',
      etiqueta: 'Nacidos vivos',
      valor: c.nacidosVivos,
      unidad: 'nacidos',
      ayuda: 'Indicador «NACIDOS VIVOS» del cuadro 2, en los cuatro tipos de parto.',
    },
  ];
}

/* Centro Quirúrgico cuenta intervenciones. La cifra principal sale del RESUMEN
   del área, no de «realizadas» de su cuadro de indicadores, que a veces no
   coincide con él (junio de 2026: 455 contra 442; el bot lo avisa). */
function resumenCentroQuirurgico(datos) {
  const c = cifrasCentroQuirurgico(datos);

  return [
    {
      clave: 'realizadas',
      etiqueta: 'Cirugías realizadas',
      valor: c.realizadas,
      unidad: 'intervenciones',
      ayuda: 'Cirugías mayores y menores, programadas y de emergencia, del RESUMEN del área. Cuenta intervenciones, no pacientes: un paciente operado dos veces cuenta dos.',
    },
    {
      clave: 'mayores',
      etiqueta: 'Cirugías mayores',
      valor: c.mayores,
      unidad: 'intervenciones',
      ayuda: 'Programadas y de emergencia, del RESUMEN. El detalle por especialidad y procedimiento está en la hoja CIRUGIA MAYOR.',
    },
    {
      clave: 'emergencia',
      etiqueta: 'De emergencia',
      valor: c.emergencia,
      unidad: 'intervenciones',
      ayuda: 'Cirugías mayores y menores de emergencia, del RESUMEN.',
    },
    {
      clave: 'suspendidas',
      etiqueta: 'Suspendidas',
      valor: c.suspendidas,
      unidad: 'intervenciones',
      ayuda: 'Cirugías electivas suspendidas: la suma de sus causas en la hoja SUSPENDIDAS.',
    },
  ];
}

/* Epidemiología cuenta casos nuevos de infección intrahospitalaria; las
   muertes que el oficio registra en la misma tabla van aparte. */
function resumenEpidemiologia(datos) {
  const c = cifrasEpidemiologia(datos);

  return [
    {
      clave: 'infecciones',
      etiqueta: 'Infecciones intrahospitalarias',
      valor: c.infecciones,
      unidad: 'casos',
      ayuda: LECTURA_IIH,
    },
    {
      clave: 'gineco',
      etiqueta: 'En Gineco-Obstetricia',
      valor: c.porGrupo.gineco,
      unidad: 'casos',
      ayuda: 'Casos nuevos de infección en Gineco-Obstetricia (solo columna F).',
    },
    {
      clave: 'iho',
      etiqueta: 'Herida operatoria',
      valor: c.porGrupo.iho,
      unidad: 'casos',
      ayuda: 'Infecciones de herida operatoria (IHO) en otros servicios, mujeres y hombres.',
    },
    {
      clave: 'muertesNeonatales',
      etiqueta: 'Muertes neonatales',
      valor: c.muertesNeonatales,
      unidad: 'muertes',
      ayuda: 'Muertes neonatales registradas en la tabla de vigilancia. No son infecciones: no suman a la primera cifra.',
    },
  ];
}

const RESUMENES = {
  epidemiologia: resumenEpidemiologia,
  farmacia: resumenFarmacia,
  'centro-quirurgico': resumenCentroQuirurgico,
  lavanderia: resumenLavanderia,
  imagenes: resumenImagenes,
  nutricion: resumenNutricion,
  laboratorio: resumenLaboratorio,
  nefrologia: resumenNefrologia,
  ginecologia: resumenGinecologia,
};

export function resumenDelReporte(claveArea, reporte, periodo) {
  const fn = RESUMENES[claveArea];
  if (!fn || !reporte?.datos) return null;
  return fn(reporte.datos, periodo);
}

/* Cifra principal del área, para una celda de tabla. */
export function cifraPrincipal(claveArea, reporte, periodo) {
  return resumenDelReporte(claveArea, reporte, periodo)?.[0] ?? null;
}

/* Rótulo de la cifra principal, aunque no haya ningún reporte: la cabecera de
   la columna del historial no puede depender de que exista una fila. */
export function etiquetaCifraPrincipal(claveArea) {
  const [primera] = RESUMENES[claveArea]?.({}, '2026-01') ?? [];
  return primera ? { etiqueta: primera.etiqueta, ayuda: primera.ayuda } : null;
}

export function tieneFormatosLevantados(claveArea) {
  return Boolean(RESUMENES[claveArea]);
}
