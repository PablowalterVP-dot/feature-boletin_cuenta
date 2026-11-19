/* Las nueve áreas que reportan, y la matriz de destinos.

   La matriz es el dato más importante del sistema. Se levantó del flujo real
   de oficios en papel: cada área envía su reporte a un conjunto fijo de
   oficinas, distinto para cada una. Antes eran envíos paralelos en papel; en
   la arquitectura acordada el área envía una sola vez a Estadística, y
   Estadística remite a los destinos que la matriz ya determina.

   Consecuencia de diseño: los destinos NO son una elección libre al remitir.
   Se precargan desde aquí y Estadística confirma o añade una excepción
   justificada. Si se dejaran a criterio de quien remite, el sistema perdería
   la garantía de que Planeamiento recibe siempre lo que necesita.

   Desde el 27/10/2026 Planeamiento recibe de las nueve áreas, como Estadística
   (es un rol propio: `dominio/roles.js`). Sigue en la matriz como destino de
   cada una, porque recibir es eso: la entrega llega a su bandeja y queda en la
   constancia del área.

   `profundidad` marca el alcance del prototipo, no una propiedad del área:
     'completa' → formulario modelado con sus indicadores y validaciones
     'listada'  → aparece en semáforo, historial y remisión, con formulario
                  simplificado, a la espera del levantamiento de su oficio */

export const AREAS = Object.freeze([
  Object.freeze({
    clave: 'farmacia',
    nombre: 'Departamento de Farmacia',
    nombreCorto: 'Farmacia',
    nombreBreve: 'Farmacia',
    sigla: 'FAR',
    icono: 'sh-pill',
    destinos: Object.freeze(['planeamiento']),
    /* Levantada a partir de su informe mensual de enero de 2026: atenciones
       por financiador, Sala de Operaciones y Consultorios externos. Se llena
       subiendo ese mismo Word (el bot lo lee) o digitando. */
    profundidad: 'completa',
  }),
  Object.freeze({
    clave: 'nefrologia',
    nombre: 'Servicio de Nefrología y Hemodiálisis',
    nombreCorto: 'Nefrología y Hemodiálisis',
    nombreBreve: 'Nefrología',
    sigla: 'NEF',
    icono: 'sh-drop',
    /* El caso más exigente de la matriz: cuatro destinos contando Estadística.
       Es el que prueba que la remisión múltiple funciona. */
    destinos: Object.freeze(['planeamiento', 'epidemiologia', 'direccion-general']),
    profundidad: 'completa',
  }),
  Object.freeze({
    clave: 'epidemiologia',
    nombre: 'Oficina de Epidemiología',
    nombreCorto: 'Epidemiología',
    nombreBreve: 'Epidemiología',
    sigla: 'EPI',
    icono: 'sh-shield',
    destinos: Object.freeze(['planeamiento']),
    /* Planeamiento recibe de las nueve áreas desde el 27/10/2026. */
    profundidad: 'listada',
    /* Doble rol: reporta a Estadística y además recibe los reportes de
       Nefrología y Centro Quirúrgico. Ver `oficinas.js`. */
    tambienEsOficina: true,
  }),
  Object.freeze({
    clave: 'laboratorio',
    nombre: 'Departamento de Laboratorio Clínico y Anatomía Patológica',
    nombreCorto: 'Laboratorio y Anatomía Patológica',
    nombreBreve: 'Laboratorio',
    sigla: 'LAB',
    icono: 'sh-flask',
    destinos: Object.freeze(['planeamiento']),
    profundidad: 'listada',
  }),
  Object.freeze({
    clave: 'ginecologia',
    nombre: 'Departamento de Gineco-Obstetricia',
    nombreCorto: 'Gineco-Obstetricia',
    nombreBreve: 'Gineco-Obstetricia',
    sigla: 'GIN',
    icono: 'sh-baby',
    destinos: Object.freeze(['planeamiento']),
    /* Planeamiento recibe de las nueve áreas desde el 27/10/2026. */
    profundidad: 'listada',
  }),
  Object.freeze({
    clave: 'centro-quirurgico',
    nombre: 'Centro Quirúrgico',
    nombreCorto: 'Centro Quirúrgico',
    nombreBreve: 'Centro Quirúrgico',
    sigla: 'CQX',
    icono: 'sh-scalpel',
    destinos: Object.freeze(['planeamiento', 'epidemiologia']),
    profundidad: 'completa',
  }),
  Object.freeze({
    clave: 'lavanderia',
    nombre: 'Área de Costura y Lavandería',
    nombreCorto: 'Costura y Lavandería',
    nombreBreve: 'Lavandería',
    sigla: 'LAV',
    icono: 'sh-washer',
    destinos: Object.freeze(['planeamiento']),
    /* Planeamiento recibe de las nueve áreas desde el 27/10/2026. */
    /* El extremo no clínico de la muestra: se mide en kilos y en prendas.
       Está a fondo para demostrar que el formulario no asume un servicio
       médico. */
    profundidad: 'completa',
  }),
  Object.freeze({
    clave: 'nutricion',
    nombre: 'Departamento de Nutrición y Dietética',
    nombreCorto: 'Nutrición y Dietética',
    nombreBreve: 'Nutrición',
    sigla: 'NUT',
    icono: 'sh-cutlery',
    /* El oficio de junio de 2026 (N.º 122-2026) va dirigido al jefe de
       Planeamiento, con copia a Estadística. Qué usa Planeamiento de él
       (lo que lleva a CPlan) está por confirmar: ver CONTEXTO.md § 9. */
    destinos: Object.freeze(['planeamiento']),
    /* Levantada a partir de su oficio de junio de 2026, con carga de Excel. */
    profundidad: 'completa',
  }),
  Object.freeze({
    clave: 'imagenes',
    nombre: 'Departamento de Diagnóstico por Imágenes',
    nombreCorto: 'Diagnóstico por Imágenes',
    nombreBreve: 'Imágenes',
    sigla: 'DXI',
    icono: 'sh-xray',
    /* Única área que llega a Cuerpo Técnico. */
    destinos: Object.freeze(['planeamiento', 'cuerpo-tecnico']),
    profundidad: 'completa',
  }),
  /* Mantenimiento figuraba como décima área y se retiró el 21/10/2026: no
     reporta al sistema (fue un error incluirla). La base lo retira con
     servidor/api/bd/seeders/0004_retirar_mantenimiento.sql. */
]);

export function area(clave) {
  return AREAS.find((a) => a.clave === clave) ?? null;
}

export function nombreArea(clave) {
  return area(clave)?.nombreCorto ?? clave;
}

/* Nombre corto de verdad, para controles donde el texto no puede envolver: los
   botones del kit llevan `white-space: nowrap`, y las columnas del semáforo son
   estrechas por definición. Siempre acompañado de un tooltip con el nombre
   oficial completo: una abreviatura sin explicar es el primer motivo de un dato
   mal digitado. */
export function nombreBreveArea(clave) {
  return area(clave)?.nombreBreve ?? clave;
}

/* Qué áreas alimentan a una oficina. Se deriva de la matriz en vez de
   escribirse aparte, para que no existan dos versiones del mismo mapa. */
export function areasQueRemitenA(claveOficina) {
  return AREAS.filter((a) => a.destinos.includes(claveOficina));
}

/* Destinos de un reporte, Estadística incluida y en primer lugar: es siempre
   el primer receptor y el único que valida. */
export function destinosDe(claveArea) {
  return ['estadistica', ...(area(claveArea)?.destinos ?? [])];
}
