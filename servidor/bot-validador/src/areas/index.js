/* Áreas que el bot sabe leer.

   Cada área aporta cinco cosas y el motor no pregunta nada más:
     definicion  sus cuadros y filas
     version     la versión vigente de su plantilla
     crearPlantilla(periodo, datos?)  el .xlsx que el área descarga
     reconocer(libro, { periodo })    si el libro es de esta área y este mes
     leerCifras(libro, { periodo })   las cifras de un libro ya reconocido
     validar(datos, periodo)          sus reglas → { errores, avisos, info }
     reglas                           la lista de reglas, para informarlas todas
     totalCuadro(datos, id, periodo)  para comparar con el mes anterior
     consolidado                      { de, crear, nombre }: el TOTAL anual, si el área lo lleva

   Un área que no sube Excel declara además `abrir(bytes)` (cómo se abre su
   archivo) y `archivo` (qué tipo de archivo es, para los mensajes): Farmacia
   sube su informe en Word.

   Agregar un área es agregar su carpeta y una línea aquí (ver README.md). */

import { FORMATOS } from './nutricion/definicion.js';
import { totalFormato } from './nutricion/calculos.js';
import { validar, REGLAS } from './nutricion/reglas.js';
import { crearPlantilla, leerCifras, nombreDeArchivo, VERSION_PLANTILLA } from './nutricion/plantilla.js';
import { reconocer } from './nutricion/oficial.js';
import { consolidadoDe, crearConsolidado, nombreDelConsolidado } from './nutricion/consolidado.js';
import * as correccionNut from './nutricion/correccion.js';

import { CUADROS as CUADROS_LAB } from './laboratorio/definicion.js';
import { validar as validarLab, REGLAS as REGLAS_LAB } from './laboratorio/reglas.js';
import { totalCuadro as totalCuadroLab } from './laboratorio/calculos.js';
import { crearPlantilla as crearPlantillaLab, nombreDeArchivo as nombreDeArchivoLab, VERSION as VERSION_LAB } from './laboratorio/plantilla.js';
import { reconocer as reconocerLab, leerCifras as leerCifrasLab } from './laboratorio/lector.js';
import { consolidadoDe as consolidadoDeLab, crearConsolidado as crearConsolidadoLab, nombreDelConsolidado as nombreDelConsolidadoLab } from './laboratorio/consolidado.js';
import * as correccionLab from './laboratorio/correccion.js';

import { CUADROS as CUADROS_FAR, VERSION as VERSION_FAR } from './farmacia/definicion.js';
import { validar as validarFar, REGLAS as REGLAS_FAR, frenteAlAnterior as frenteAlAnteriorFar } from './farmacia/reglas.js';
import { totalCuadro as totalCuadroFar } from './farmacia/calculos.js';
import { reconocer as reconocerFar, leerCifras as leerCifrasFar } from './farmacia/lector.js';
import { crearPlantilla as crearPlantillaFar, nombreDeArchivo as nombreDeArchivoFar } from './farmacia/plantilla.js';
import { consolidadoDe as consolidadoDeFar, crearConsolidado as crearConsolidadoFar, nombreDelConsolidado as nombreDelConsolidadoFar } from './farmacia/consolidado.js';
import * as correccionFar from './farmacia/correccion.js';
import { leerDocumento } from '../docx.js';

import { CUADROS as CUADROS_NEF, VERSION as VERSION_NEF } from './nefrologia/definicion.js';
import { validar as validarNef, REGLAS as REGLAS_NEF } from './nefrologia/reglas.js';
import { totalCuadro as totalCuadroNef } from './nefrologia/calculos.js';
import { reconocer as reconocerNef, leerCifras as leerCifrasNef } from './nefrologia/lector.js';
import { crearPlantilla as crearPlantillaNef, nombreDeArchivo as nombreDeArchivoNef } from './nefrologia/plantilla.js';
import { consolidadoDe as consolidadoDeNef, crearConsolidado as crearConsolidadoNef, nombreDelConsolidado as nombreDelConsolidadoNef } from './nefrologia/consolidado.js';
import * as correccionNef from './nefrologia/correccion.js';

import { CUADROS as CUADROS_GIN, VERSION as VERSION_GIN } from './ginecologia/definicion.js';
import { validar as validarGin, REGLAS as REGLAS_GIN } from './ginecologia/reglas.js';
import { totalCuadro as totalCuadroGin } from './ginecologia/calculos.js';
import { reconocer as reconocerGin, leerCifras as leerCifrasGin } from './ginecologia/lector.js';
import { crearPlantilla as crearPlantillaGin, nombreDeArchivo as nombreDeArchivoGin } from './ginecologia/plantilla.js';
import { consolidadoDe as consolidadoDeGin, crearConsolidado as crearConsolidadoGin, nombreDelConsolidado as nombreDelConsolidadoGin } from './ginecologia/consolidado.js';
import * as correccionGin from './ginecologia/correccion.js';

import { FORMATOS as FORMATOS_LAV } from './lavanderia/definicion.js';
import { totalCuadro as totalCuadroLav } from './lavanderia/calculos.js';
import { validar as validarLav, REGLAS as REGLAS_LAV } from './lavanderia/reglas.js';
import { crearPlantilla as crearPlantillaLav, nombreDeArchivo as nombreDeArchivoLav, VERSION_PLANTILLA as VERSION_LAV } from './lavanderia/plantilla.js';
import { reconocer as reconocerLav, leerCifras as leerCifrasLav } from './lavanderia/oficial.js';
import { consolidadoDe as consolidadoDeLav, crearConsolidado as crearConsolidadoLav, nombreDelConsolidado as nombreDelConsolidadoLav } from './lavanderia/consolidado.js';
import * as correccionLav from './lavanderia/correccion.js';

import { CUADROS as CUADROS_CQX } from './centro-quirurgico/definicion.js';
import { totalCuadro as totalCuadroCqx } from './centro-quirurgico/calculos.js';
import { validar as validarCqx, REGLAS as REGLAS_CQX } from './centro-quirurgico/reglas.js';
import { crearPlantilla as crearPlantillaCqx, nombreDeArchivo as nombreDeArchivoCqx, VERSION as VERSION_CQX } from './centro-quirurgico/plantilla.js';
import { reconocer as reconocerCqx, leerCifras as leerCifrasCqx } from './centro-quirurgico/lector.js';
import { consolidadoDe as consolidadoDeCqx, crearConsolidado as crearConsolidadoCqx, nombreDelConsolidado as nombreDelConsolidadoCqx } from './centro-quirurgico/consolidado.js';
import * as correccionCqx from './centro-quirurgico/correccion.js';

import { CUADROS as CUADROS_EPI } from './epidemiologia/definicion.js';
import { totalCuadro as totalCuadroEpi } from './epidemiologia/calculos.js';
import { validar as validarEpi, REGLAS as REGLAS_EPI, VARIACION as VARIACION_EPI } from './epidemiologia/reglas.js';
import { reconocer as reconocerEpi, leerCifras as leerCifrasEpi, VERSION as VERSION_EPI } from './epidemiologia/lector.js';
import { crearPlantilla as crearPlantillaEpi, nombreDeArchivo as nombreDeArchivoEpi } from './epidemiologia/plantilla.js';
import { consolidadoDe as consolidadoDeEpi, crearConsolidado as crearConsolidadoEpi, nombreDelConsolidado as nombreDelConsolidadoEpi } from './epidemiologia/consolidado.js';
import * as correccionEpi from './epidemiologia/correccion.js';

import { CUADROS as CUADROS_DXI } from './imagenes/definicion.js';
import { totalCuadro as totalCuadroDxi } from './imagenes/calculos.js';
import { validar as validarDxi, REGLAS as REGLAS_DXI } from './imagenes/reglas.js';
import { reconocer as reconocerDxi, leerCifras as leerCifrasDxi, VERSION as VERSION_DXI } from './imagenes/lector.js';
import { crearPlantilla as crearPlantillaDxi, nombreDeArchivo as nombreDeArchivoDxi } from './imagenes/plantilla.js';
import { consolidadoDe as consolidadoDeDxi, crearConsolidado as crearConsolidadoDxi, nombreDelConsolidado as nombreDelConsolidadoDxi } from './imagenes/consolidado.js';
import * as correccionDxi from './imagenes/correccion.js';

/* Las áreas que suben Word aceptan el .docx y el Word 97-2003 (.doc, doc.js):
   Nefrología solo tiene su cuadro en .doc (07/11/2026). */
const WORD = Object.freeze({
  tipo: 'Word',
  extension: '.docx',
  extensiones: Object.freeze(['.docx', '.doc']),
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword',
});

export const AREAS = Object.freeze({
  nutricion: Object.freeze({
    clave: 'nutricion',
    nombre: 'Nutrición y Dietética',
    version: VERSION_PLANTILLA,
    unidad: 'raciones',
    cuadros: FORMATOS,
    crearPlantilla,
    nombreDeArchivo,
    reconocer,
    leerCifras,
    validar,
    reglas: REGLAS,
    totalCuadro: totalFormato,
    /* El consolidado anual (TOTAL): lo arma el bot con los meses enviados. */
    consolidado: Object.freeze({ de: consolidadoDe, crear: crearConsolidado, nombre: nombreDelConsolidado }),
    /* Corrección guiada sobre su propio libro (correccion.js del bot). */
    correccion: correccionNut,
    /* Un Excel por mes: al cargar varios a la vez, cada archivo es de un solo
       mes (motor.js, `mesesDelArchivo`). Laboratorio, en cambio, sube el libro
       del año con una hoja por mes. */
    unMesPorArchivo: true,
  }),

  laboratorio: Object.freeze({
    clave: 'laboratorio',
    nombre: 'Patología Clínica y Anatomía Patológica',
    version: VERSION_LAB,
    /* Banco de Sangre cuenta unidades entregadas; lo demás, exámenes. La
       variación con el mes anterior es por sección, así que basta con la
       unidad de cada cuadro. */
    unidad: 'exámenes',
    /* Una sección es un cuadro: el motor, la API y las pantallas leen
       `datos[sección][examen.procedencia]` como leen los de Nutrición. */
    cuadros: CUADROS_LAB,
    crearPlantilla: crearPlantillaLab,
    nombreDeArchivo: nombreDeArchivoLab,
    reconocer: reconocerLab,
    leerCifras: leerCifrasLab,
    validar: validarLab,
    reglas: REGLAS_LAB,
    totalCuadro: totalCuadroLab,
    /* La hoja CONSOLIDADO del libro: la suma de los meses entregados, casilla
       por casilla (no solo el total de cada sección, como Nutrición). */
    consolidado: Object.freeze({ de: consolidadoDeLab, crear: crearConsolidadoLab, nombre: nombreDelConsolidadoLab }),
    /* Corrección guiada sobre su propio libro (correccion.js del bot). */
    correccion: correccionLab,
  }),

  /* Farmacia sube el Word que ya redacta cada mes (lector.js). El formato
     que descarga es un Word con los mismos cuadros (plantilla.js). No hay
     corrección sobre el archivo: lo que no cuadra se corrige en el Word o en
     el formulario del sistema. */
  farmacia: Object.freeze({
    /* Un archivo por mes (el informe del mes): al cargar meses pasados de una vez,
       el mes sale de lo que el área reconoce y, si calza con varios, del nombre
       del archivo (motor.js, `mesesDelArchivo`). */
    unMesPorArchivo: true,
    clave: 'farmacia',
    nombre: 'Farmacia',
    version: VERSION_FAR,
    unidad: 'atenciones',
    archivo: Object.freeze({ ...WORD, pesoTipico: 'Con sus gráficos, el informe de enero pesa 1,2 MB.' }),
    abrir: leerDocumento,
    cuadros: CUADROS_FAR,
    crearPlantilla: crearPlantillaFar,
    nombreDeArchivo: nombreDeArchivoFar,
    reconocer: reconocerFar,
    leerCifras: leerCifrasFar,
    validar: validarFar,
    reglas: REGLAS_FAR,
    /* Un cuadro copiado del mes anterior (julio de 2026). */
    frenteAlAnterior: frenteAlAnteriorFar,
    totalCuadro: totalCuadroFar,
    /* El total de cada cuadro (Atenciones, Sala de Operaciones, Consultorios),
       mes a mes, con los meses entregados. */
    consolidado: Object.freeze({ de: consolidadoDeFar, crear: crearConsolidadoFar, nombre: nombreDelConsolidadoFar }),
    /* Corrección guiada sobre su propio Word (farmacia/correccion.js). */
    correccion: correccionFar,
  }),

  lavanderia: Object.freeze({
    /* Un archivo por mes (el Excel del mes): al cargar meses pasados de una vez,
       el mes sale de lo que el área reconoce y, si calza con varios, del nombre
       del archivo (motor.js, `mesesDelArchivo`). */
    unMesPorArchivo: true,
    clave: 'lavanderia',
    nombre: 'Lavandería',
    version: VERSION_LAV,
    unidad: 'kilogramos',
    /* f1 (kilos por servicio) es el único cuadro que la base cataloga como
       `indicador`: ver el comentario de `lavanderia/definicion.js`. f2, f3 y
       f4 viajan igual en `cuadros` (para la firma y, si algún día se decide,
       la variación mensual), pero no tienen fila `indicador` ni `valor`. */
    cuadros: FORMATOS_LAV,
    crearPlantilla: crearPlantillaLav,
    nombreDeArchivo: nombreDeArchivoLav,
    reconocer: reconocerLav,
    leerCifras: leerCifrasLav,
    validar: validarLav,
    reglas: REGLAS_LAV,
    totalCuadro: totalCuadroLav,
    /* A diferencia de Nutrición y Laboratorio, el consolidado de Lavandería no
       es "la misma hoja del mes, sumada": el Formato 1 es diario (un día por
       columna) y no tiene sentido un Excel del año con esa forma. Aquí son
       los kilos de ropa lavada del año, por los mismos diez grupos de la
       sección D de DIRESA, con los meses en columnas (ver consolidado.js). */
    consolidado: Object.freeze({ de: consolidadoDeLav, crear: crearConsolidadoLav, nombre: nombreDelConsolidadoLav }),
    /* Corrección guiada sobre su propio libro (lavanderia/correccion.js). */
    correccion: correccionLav,
  }),

  /* Nefrología no llena un reporte nuevo cada mes: lleva un solo cuadro del
     año (un indicador por fila, un mes por columna) y cada mes agrega su
     columna al mismo Word, que se sube entero otra vez (lector.js lee solo
     la columna del mes pedido, como Laboratorio con la hoja de su libro). */
  nefrologia: Object.freeze({
    clave: 'nefrologia',
    nombre: 'Nefrología y Hemodiálisis',
    version: VERSION_NEF,
    unidad: 'atenciones',
    archivo: Object.freeze({ ...WORD, pesoTipico: 'El cuadro del servicio, sin gráficos, pesa poco menos de 200 KB.' }),
    abrir: leerDocumento,
    cuadros: CUADROS_NEF,
    crearPlantilla: crearPlantillaNef,
    nombreDeArchivo: nombreDeArchivoNef,
    reconocer: reconocerNef,
    leerCifras: leerCifrasNef,
    validar: validarNef,
    reglas: REGLAS_NEF,
    totalCuadro: totalCuadroNef,
    /* Cada indicador del cuadro, mes a mes, con los meses entregados. */
    consolidado: Object.freeze({ de: consolidadoDeNef, crear: crearConsolidadoNef, nombre: nombreDelConsolidadoNef }),
    /* Corrección guiada sobre su propio Word (nefrologia/correccion.js). */
    correccion: correccionNef,
  }),

  /* Gineco-Obstetricia sube un Excel nuevo cada mes (no un libro acumulado
     como Laboratorio o Nefrología). El cuadro 2 (partos, cesáreas y
     nacidos) solo lo trae el Excel real desde setiembre de 2026: su
     ausencia es un aviso, no un error (reglas.js). */
  ginecologia: Object.freeze({
    /* Un archivo por mes (el consolidado del mes, que no dice el mes en sus celdas): al cargar meses pasados de una vez,
       el mes sale de lo que el área reconoce y, si calza con varios, del nombre
       del archivo (motor.js, `mesesDelArchivo`). */
    unMesPorArchivo: true,
    clave: 'ginecologia',
    nombre: 'Departamento de Gineco-Obstetricia',
    version: VERSION_GIN,
    unidad: 'casos',
    cuadros: CUADROS_GIN,
    crearPlantilla: crearPlantillaGin,
    nombreDeArchivo: nombreDeArchivoGin,
    reconocer: reconocerGin,
    leerCifras: leerCifrasGin,
    validar: validarGin,
    reglas: REGLAS_GIN,
    totalCuadro: totalCuadroGin,
    consolidado: Object.freeze({ de: consolidadoDeGin, crear: crearConsolidadoGin, nombre: nombreDelConsolidadoGin }),
    /* Corrección guiada sobre su propio libro (ginecologia/correccion.js). */
    correccion: correccionGin,
  }),

  /* Centro Quirúrgico sube su libro del mes, acumulado: el bot lee la columna
     del mes de cinco hojas (centro-quirurgico/definicion.js). La clave lleva
     guion porque es la de la unidad en la base, que es la que manda la API.
     Su libro pesa unos 500 kB por el registro paciente por paciente, que el
     bot no lee. */
  'centro-quirurgico': Object.freeze({
    /* Un archivo por mes (el libro del mes (acumulado: trae los meses anteriores, pero cuenta el suyo)): al cargar meses pasados de una vez,
       el mes sale de lo que el área reconoce y, si calza con varios, del nombre
       del archivo (motor.js, `mesesDelArchivo`). */
    unMesPorArchivo: true,
    clave: 'centro-quirurgico',
    nombre: 'Centro Quirúrgico',
    version: VERSION_CQX,
    unidad: 'intervenciones',
    archivo: Object.freeze({
      tipo: 'Excel', extension: '.xlsx',
      pesoTipico: 'El libro mensual de Centro Quirúrgico pesa entre 400 y 600 kB. Si pesa mucho más, una hoja quedó con formato hasta el final (abril de 2026: 54 MB): borre las filas vacías de CX PROGRAMADAS y guárdelo otra vez.',
    }),
    /* Las especialidades y las causas son cuadros de la base; los
       procedimientos viajan en `datos.procedimientos` (definicion.js). */
    cuadros: CUADROS_CQX,
    crearPlantilla: crearPlantillaCqx,
    nombreDeArchivo: nombreDeArchivoCqx,
    reconocer: reconocerCqx,
    leerCifras: leerCifrasCqx,
    validar: validarCqx,
    reglas: REGLAS_CQX,
    totalCuadro: totalCuadroCqx,
    /* El reporte 1 del área: la producción de los doce meses, armada con los
       meses enviados, más el consolidado por especialidad y el Top Ten. */
    consolidado: Object.freeze({ de: consolidadoDeCqx, crear: crearConsolidadoCqx, nombre: nombreDelConsolidadoCqx }),
    /* Corrección guiada sobre su propio libro (centro-quirurgico/correccion.js). */
    correccion: correccionCqx,
  }),

  /* Epidemiología sube su oficio de vigilancia en Word: una tabla de casos
     nuevos de infecciones intrahospitalarias por edad, servicio y sexo
     (epidemiologia/definicion.js). Con diez casos al mes, la comparación con
     el anterior es la suya (un posible brote), no la del 20 %. */
  epidemiologia: Object.freeze({
    unMesPorArchivo: true,
    clave: 'epidemiologia',
    nombre: 'Oficina de Epidemiología',
    version: VERSION_EPI,
    unidad: 'casos',
    archivo: Object.freeze({ ...WORD, pesoTipico: 'El oficio de vigilancia, con su membrete, pesa unos 100 KB.' }),
    abrir: leerDocumento,
    cuadros: CUADROS_EPI,
    crearPlantilla: crearPlantillaEpi,
    nombreDeArchivo: nombreDeArchivoEpi,
    reconocer: reconocerEpi,
    leerCifras: leerCifrasEpi,
    validar: validarEpi,
    reglas: REGLAS_EPI,
    variacion: VARIACION_EPI,
    totalCuadro: totalCuadroEpi,
    consolidado: Object.freeze({ de: consolidadoDeEpi, crear: crearConsolidadoEpi, nombre: nombreDelConsolidadoEpi }),
    correccion: correccionEpi,
  }),

  /* Diagnóstico por Imágenes sube su oficio mensual en Word: las cuatro hojas
     (Rayos X, tomografía, mamografía, ecografía) como tablas pequeñas, una
     tras otra (imagenes/lector.js). Sus formatos son los de las pantallas
     del sistema; la base guarda además cuatro cuadros planos con los totales
     (imagenes/definicion.js, CUADROS_BASE). */
  imagenes: Object.freeze({
    unMesPorArchivo: true,
    clave: 'imagenes',
    nombre: 'Departamento de Diagnóstico por Imágenes',
    version: VERSION_DXI,
    unidad: 'exámenes',
    archivo: Object.freeze({ ...WORD, pesoTipico: 'El oficio del mes, con sus cuatro hojas, pesa menos de 200 KB.' }),
    abrir: leerDocumento,
    cuadros: CUADROS_DXI,
    crearPlantilla: crearPlantillaDxi,
    nombreDeArchivo: nombreDeArchivoDxi,
    reconocer: reconocerDxi,
    leerCifras: leerCifrasDxi,
    validar: validarDxi,
    reglas: REGLAS_DXI,
    totalCuadro: totalCuadroDxi,
    consolidado: Object.freeze({ de: consolidadoDeDxi, crear: crearConsolidadoDxi, nombre: nombreDelConsolidadoDxi }),
    correccion: correccionDxi,
  }),
});

export function areaDelBot(clave) {
  return AREAS[clave] ?? null;
}
