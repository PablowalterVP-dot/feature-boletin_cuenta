/* Departamento de Nutrición y Dietética: estructura de su reporte mensual.

   Es la del Excel oficial que el área llena cada mes («ESTADISTICA POR MES
   NUTRICION 2026»: un libro por mes, de enero a setiembre de 2026, revisados
   uno por uno). Cuatro hojas visibles, una por cuadro de raciones diarias, y
   un consolidado anual aparte (TOTAL.xlsx) que aquí no se digita: lo arma el
   bot con los meses enviados (consolidado.js).

     f1  Comensales · Hospitalización   personal asistencial, administrativo e internos
     f2  Comensales · Emergencia        Dirección General, Residuos Sólidos y el propio departamento
     f3  Pacientes · Hospitalización    por tipo de dieta
     f4  Pacientes · Emergencia         solo pacientes SIS

   Cada grupo lleva el `rotulo` con que lo escribe el Excel oficial y sus
   `alias` (variantes que aparecen en los meses reales); el lector
   (oficial.js) los reconoce por ahí, no por la posición, porque las filas
   cambian de un mes a otro: Patrimonio solo figura en abril, los Internos de
   Nutrición aparecen en mayo. Estadística y DIRESA usan los totales de cada
   cuadro; el detalle diario se guarda igual, porque es lo que hoy se pierde
   en el archivador.

   Forma de los datos de un reporte:
     { f1: { 'asistencial.desayuno': [día 1, día 2, …] }, …,
       declarados: { f1: { 'asistencial.desayuno': 5145, _total: 22850 } },
       editadas: { 'f1|asistencial.desayuno|12': valor leído del archivo },
       ausentes: { f2: ['patrimonio.desayuno', …] },
       justificaciones: { idDelAviso: texto } }

   `ausentes` son las filas que el Excel de ese mes no trae (un grupo que no
   existía ese mes): no son casillas vacías, son filas que no aplican.

   Una casilla vacía es `null`: «no se registró», que no es lo mismo que cero.
   `declarados` son los totales que traía el Excel; sirven para comprobar que
   el archivo es coherente consigo mismo, y se descartan en la fila que se
   corrige a mano, porque dejan de describirla. */

export const COMIDAS = Object.freeze({ desayuno: 'Desayuno', almuerzo: 'Almuerzo', cena: 'Cena' });

/* Cómo escribe cada comida el Excel oficial. Los internos llaman «COMIDA» a
   la cena (en los nueve meses): es la misma ración, y se unifica para que los
   totales por comida sumen bien. */
export const ROTULO_COMIDA = Object.freeze({ desayuno: ['DESAYUNO'], almuerzo: ['ALMUERZO'], cena: ['CENA', 'COMIDA'] });

const TRES = ['desayuno', 'almuerzo', 'cena'];
const DOS = ['desayuno', 'almuerzo'];

/* `rotulo`: el texto de la columna A en el Excel oficial; `alias`, otras
   formas en que aparece; `tercera`: cómo escribe la tercera comida (los
   internos dicen «COMIDA»). */
function grupo(clave, label, comidas, { ayuda, rotulo, alias = [], tercera = 'CENA', ocasional = false } = {}) {
  return comidas.map((comida, i) =>
    Object.freeze({
      clave: `${clave}.${comida}`,
      grupo: clave,
      grupoLabel: label,
      comida,
      comidaLabel: COMIDAS[comida],
      primeraDelGrupo: i === 0,
      ayuda,
      rotulo,
      alias: Object.freeze(alias),
      rotuloComida: comida === 'cena' ? tercera : ROTULO_COMIDA[comida][0],
      /* Un grupo que solo aparece algunos meses: no va en la plantilla en blanco
         (sus filas vacías serían casillas sin dato), pero se lee si el Excel lo trae. */
      ocasional,
    }),
  );
}

export const FORMATOS = Object.freeze([
  Object.freeze({
    id: 'f1',
    numero: 1,
    poblacion: 'comensales',
    servicio: 'hosp',
    titulo: 'Comensales · Hospitalización',
    corto: 'Comensales hosp.',
    descripcion: 'Raciones servidas al personal asistencial, administrativo y a los internos, en el servicio de hospitalización.',
    hoja: 'Comensales hospitalización',
    hojaOficial: 'COMENSALES HOSP',
    encabezado: Object.freeze(['COMENSALES PERSONAL ASISTENCIAL Y ADMINISTRATIVOS', 'SERVICIO DE HOSPITALIZACIÓN']),
    filas: Object.freeze([
      ...grupo('asistencial', 'Asistencial y administrativo', TRES, { ayuda: 'Personal del hospital que hace turnos diurnos y nocturnos.', rotulo: 'ASIST. Y ADMINIST.' }),
      ...grupo('int-medicina', 'Internos de Medicina (UNAP)', TRES, { ayuda: 'Internos de la Universidad Nacional de la Amazonía Peruana.', rotulo: 'INT MED UNAP', tercera: 'COMIDA' }),
      ...grupo('int-obstetricia', 'Internos de Obstetricia (UNSM)', TRES, { ayuda: 'Internos de la Universidad Nacional de San Martín.', rotulo: 'INT OBT UNSM', tercera: 'COMIDA' }),
      ...grupo('int-nutricion', 'Internos de Nutrición', DOS, { ayuda: 'Solo reciben desayuno y almuerzo. Figuran desde mayo de 2026.', rotulo: 'INT. NUT' }),
      ...grupo('int-enfermeria', 'Internos de Enfermería (UNSM)', TRES, { ayuda: 'Internos de la Universidad Nacional de San Martín.', rotulo: 'INT. ENF UNSM', tercera: 'COMIDA' }),
    ]),
  }),
  Object.freeze({
    id: 'f2',
    numero: 2,
    poblacion: 'comensales',
    servicio: 'emerg',
    titulo: 'Comensales · Emergencia',
    corto: 'Comensales emerg.',
    descripcion: 'Raciones servidas al personal desde el servicio de emergencia.',
    hoja: 'Comensales emergencia',
    hojaOficial: 'COMENSALES EMERG',
    encabezado: Object.freeze(['COMENSALES PERSONAL ASISTENCIAL Y ADMINISTRATIVOS', 'SERVICIO DE EMERGENCIA']),
    filas: Object.freeze([
      ...grupo('direccion', 'Dirección General', DOS, { rotulo: 'DIRECCION GENERAL' }),
      /* En abril de 2026 el Excel trae «PATRIMONIO» con una sola fila, de
         almuerzo: es un grupo más de la emergencia, escrito a medias. Siguiendo
         la plantilla, lleva desayuno y almuerzo como Dirección y Residuos; el
         desayuno de abril queda como fila ausente (no registrada), no en cero. */
      ...grupo('patrimonio', 'Patrimonio', DOS, { ayuda: 'Personal de la Oficina de Patrimonio. Figura en abril de 2026, solo con almuerzo.', rotulo: 'PATRIMONIO', ocasional: true }),
      ...grupo('residuos', 'Residuos Sólidos', DOS, { rotulo: 'RESIDUOS SOLIDOS' }),
      ...grupo('nutricion', 'Dpto. de Nutrición y Dietética', TRES, { rotulo: 'DPTO DE NUTRICION Y DIETETICA', alias: ['DPTO DE NUTRICION Y DIETETTICA'] }),
    ]),
  }),
  Object.freeze({
    id: 'f3',
    numero: 3,
    poblacion: 'pacientes',
    servicio: 'hosp',
    titulo: 'Pacientes · Hospitalización',
    corto: 'Pacientes hosp.',
    descripcion: 'Raciones servidas a pacientes hospitalizados, por tipo de dieta.',
    hoja: 'Pacientes hospitalización',
    hojaOficial: 'PACIENTES HOSP',
    encabezado: Object.freeze(['COMENSALES DE PACIENTES']),
    seccion: 'SERVICIO DE HOSPITALIZACIÓN',
    filas: Object.freeze([
      ...grupo('completa', 'Dieta completa', TRES, { rotulo: 'COMPLETA' }),
      ...grupo('blanda', 'Dieta blanda', TRES, { rotulo: 'BLANDAS', alias: ['BLANDA'] }),
      ...grupo('licuada', 'Dieta licuada', TRES, { rotulo: 'LICUADAS', alias: ['LICUADA'] }),
      ...grupo('liquida', 'Dieta líquida', TRES, { rotulo: 'LIQUIDAS', alias: ['LIQUIDA'] }),
    ]),
  }),
  Object.freeze({
    id: 'f4',
    numero: 4,
    poblacion: 'pacientes',
    servicio: 'emerg',
    titulo: 'Pacientes · Emergencia',
    corto: 'Pacientes emerg.',
    descripcion: 'Raciones servidas a pacientes en emergencia. El oficio solo registra pacientes SIS.',
    hoja: 'Pacientes emergencia',
    hojaOficial: 'PACIENTES EMERG',
    encabezado: Object.freeze(['COMENSALES DE PACIENTES']),
    seccion: 'SERVICIO DE EMERGENCIA',
    filas: Object.freeze([
      ...grupo('sis', 'Pacientes SIS', TRES, {
        ayuda: 'El Excel no registra pacientes de emergencia con otro financiamiento. Está por confirmar si no los hay o si no se anotan.',
        rotulo: 'SIS',
      }),
    ]),
  }),
]);

/* Rótulos mal escritos en meses reales, que se corrigen siguiendo la lógica de
   la plantilla y se informan (no se corrigen en silencio).

   De enero a abril de 2026 la hoja de comensales de hospitalización trae dos
   bloques de enfermería: «INT ENF UNSM» (sin punto) y «INT. ENF UNSM». El
   primero ocupa el lugar de Obstetricia y tiene sus mismas cifras (unas 16
   raciones diarias, como «INT OBT UNSM» desde mayo); el segundo, unas 2,
   como Enfermería todo el año. Se lee el primero como Obstetricia solo
   cuando conviven los dos: un «INT ENF UNSM» suelto es Enfermería. */
export const CORRECCIONES = Object.freeze([
  Object.freeze({
    formato: 'f1',
    rotulo: 'INT ENF UNSM',
    siTambien: 'INT. ENF UNSM',
    grupo: 'int-obstetricia',
    motivo: 'Entre enero y abril el Excel rotula a los internos de Obstetricia como «INT ENF UNSM», junto al bloque de Enfermería: por su lugar y sus cifras es Obstetricia.',
  }),
]);

export function formato(id) {
  return FORMATOS.find((f) => f.id === id) ?? null;
}

export function filaDe(idFormato, claveFila) {
  return formato(idFormato)?.filas.find((f) => f.clave === claveFila) ?? null;
}

/* Un reporte recién abierto no tiene ninguna casilla: la ausencia es el dato. */
export function datosVacios() {
  return {};
}

/* Clave de una casilla, para las marcas de edición y los avisos. */
export function claveCasilla(idFormato, claveFila, dia) {
  return `${idFormato}|${claveFila}|${dia}`;
}
