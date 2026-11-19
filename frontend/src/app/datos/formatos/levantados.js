/* Áreas con su oficio levantado: el registro que el resto del sistema consulta.

   Cada área levantada tiene sus propios formatos, sus cálculos y su siembra,
   pero el recorrido es el mismo —pasos, validación, envío, visor de
   Estadística—. Este registro es lo único que cambia al levantar un área
   nueva: las pantallas y la bandeja leen de aquí y no preguntan por nombre.

   Las áreas que no están aquí siguen con la estructura propuesta de
   `areas-simuladas.js`. */

import { FORMATOS as FORMATOS_LAV, datosVacios as vaciosLav } from './lavanderia.js';
import { validar as validarLav, estadoDeFormato as estadoLav, notaDeFormato as notaLav } from './lavanderia-calculos.js';
import { datosDeLavanderia, PERIODO_CON_CIFRAS_REALES as REAL_LAV } from './lavanderia-siembra.js';
import { FORMATOS as FORMATOS_IMG, datosVacios as vaciosImg } from './imagenes.js';
import { validar as validarImg, estadoDeFormato as estadoImg, notaDeFormato as notaImg, REGLAS as REGLAS_IMG } from './imagenes-calculos.js';
import { FORMATOS as FORMATOS_EPI, datosVacios as vaciosEpi } from './epidemiologia.js';
import { validar as validarEpi, estadoDeFormato as estadoEpi, notaDeFormato as notaEpi, REGLAS as REGLAS_EPI } from './epidemiologia-calculos.js';
import { datosDeEpidemiologia, PERIODO_CON_CIFRAS_REALES as REAL_EPI } from './epidemiologia-siembra.js';
import { datosDeImagenes, PERIODO_CON_CIFRAS_REALES as REAL_IMG } from './imagenes-siembra.js';
import { FORMATOS as FORMATOS_NUT, datosVacios as vaciosNut } from './nutricion.js';
import { validar as validarNut, estadoDeFormato as estadoNut, notaDeFormato as notaNut } from './nutricion-calculos.js';
import { datosDeNutricion, PERIODO_CON_CIFRAS_REALES as REAL_NUT } from './nutricion-siembra.js';
import { CUADROS as CUADROS_LAB, datosVacios as vaciosLab } from './laboratorio.js';
import { validar as validarLab, estadoDeFormato as estadoLab, notaDeFormato as notaLab } from './laboratorio-calculos.js';
import { datosDeLaboratorio, PERIODO_CON_CIFRAS_REALES as REAL_LAB } from './laboratorio-siembra.js';
import { FORMATOS as FORMATOS_FAR, datosVacios as vaciosFar } from './farmacia.js';
import { validar as validarFar, estadoDeFormato as estadoFar, notaDeFormato as notaFar } from './farmacia-calculos.js';
import { datosDeFarmacia, PERIODO_CON_CIFRAS_REALES as REAL_FAR } from './farmacia-siembra.js';
import { REPORTES as REPORTES_CQX, datosVacios as vaciosCqx } from './centro-quirurgico.js';
import { validar as validarCqx, estadoDeFormato as estadoCqx, notaDeFormato as notaCqx } from './centro-quirurgico-calculos.js';
import { datosDeCentroQuirurgico, PERIODO_CON_CIFRAS_REALES as REAL_CQX } from './centro-quirurgico-siembra.js';
import { CUADROS as CUADROS_NEF, datosVacios as vaciosNef } from './nefrologia.js';
import { validar as validarNef, estadoDeFormato as estadoNef, notaDeFormato as notaNef } from './nefrologia-calculos.js';
import { datosDeNefrologia, PERIODO_CON_CIFRAS_REALES as REAL_NEF } from './nefrologia-siembra.js';
import { CUADROS as CUADROS_GIN, datosVacios as vaciosGin } from './ginecologia.js';
import { validar as validarGin, estadoDeFormato as estadoGin, notaDeFormato as notaGin } from './ginecologia-calculos.js';
import { datosDeGinecologia, PERIODO_CON_CIFRAS_REALES as REAL_GIN } from './ginecologia-siembra.js';
import { datosSimulados } from './areas-simuladas.js';

export const LEVANTADOS = Object.freeze({
  /* Lavandería también se llena subiendo su Excel: el bot lo reconoce por su
     contenido (el libro real llama a sus hojas "Hoja1".."Hoja4"), no por un
     nombre fijo como Nutrición o Laboratorio. */
  lavanderia: Object.freeze({
    clave: 'lavanderia',
    nombre: 'Costura y Lavandería',
    oficio: 'Excel real del área (mayo, julio y agosto de 2026)',
    carga: true,
    formatos: FORMATOS_LAV,
    datosVacios: vaciosLav,
    validar: validarLav,
    estadoDeFormato: estadoLav,
    notaDeFormato: notaLav,
    tituloPaso: (f) => f.corto,
    rotuloPaso: null,
    sembrar: (periodo) => datosDeLavanderia(periodo),
    periodoReal: REAL_LAV,
    notaReal: 'Julio de 2026 es el Excel real del área, leído celda por celda; los demás meses son simulados.',
    textoCompleto: 'Los cuatro cuadros están completos, los kilos del consolidado cuadran con el Formato 1 y no falta ninguna pieza por registrar.',
    /* Las reglas del bot (servidor/bot-validador/src/areas/lavanderia/reglas.js). */
    chequeos: Object.freeze([
      { id: 'incompleto', texto: 'Los cuadros diarios (kilos por servicio y ropa sucia) tienen todas sus casillas' },
      { id: 'no-numerico', texto: 'Toda casilla del archivo es un número' },
      { id: 'entero', texto: 'Los kilos y las piezas son enteros sin signo' },
      { id: 'totales', texto: 'Los totales del Excel cuadran con la suma de sus días o de sus grupos' },
      { id: 'confeccion-incompleta', texto: 'Los trabajos de confección traen su cantidad y su servicio' },
      { id: 'insumo-sin-cantidad', texto: 'Los seis insumos de limpieza traen su cantidad del mes' },
    ]),
  }),

  /* Imágenes sube su oficio en Word desde el 27/10/2026 (areas/imagenes/
     del bot) y puede seguir digitando sus cuatro hojas sin servidor. Sus
     reglas son las del bot: los chequeos de la revisión son sus errores. */
  imagenes: Object.freeze({
    clave: 'imagenes',
    nombre: 'Diagnóstico por Imágenes',
    oficio: 'oficios de enero a setiembre de 2026, en Word',
    subeWord: true,
    formatos: FORMATOS_IMG,
    datosVacios: vaciosImg,
    validar: validarImg,
    estadoDeFormato: estadoImg,
    notaDeFormato: notaImg,
    rotuloPaso: (f) => f.modalidad,
    sembrar: (periodo, opciones) => datosDeImagenes(periodo, opciones),
    periodoReal: REAL_IMG,
    notaReal: 'Las cifras de este mes son las del oficio real del área, casilla por casilla.',
    textoCompleto: 'Las cuatro hojas tienen exámenes y pacientes, cada total del oficio cuadra con lo que suma, los tecnólogos de Rayos X suman los exámenes atendidos y ninguna lectura supera a los exámenes realizados.',
    chequeos: Object.freeze(REGLAS_IMG.filter((r) => r.nivel === 'error').map(({ id, texto }) => ({ id, texto }))),
  }),

  /* Nutrición se llena subiendo su Excel (`carga: true`): el área no digita
     el oficio, lo sube, y la hoja del sistema muestra lo leído. Estadística
     lo ve con las mismas pantallas que las demás áreas levantadas. */
  nutricion: Object.freeze({
    clave: 'nutricion',
    nombre: 'Nutrición y Dietética',
    oficio: 'oficio N.º 122-2026, de junio de 2026',
    carga: true,
    /* Sin backend y sin Excel, se puede digitar en la hoja. Laboratorio no:
       se corrige siempre en su Excel (ReporteLaboratorio.jsx). */
    digitable: true,
    formatos: FORMATOS_NUT,
    datosVacios: vaciosNut,
    validar: validarNut,
    estadoDeFormato: estadoNut,
    notaDeFormato: notaNut,
    rotuloPaso: (f) => f.corto,
    sembrar: (periodo, opciones) => datosDeNutricion(periodo, opciones),
    periodoReal: REAL_NUT,
    notaReal: 'Junio es el oficio real, transcrito casilla por casilla. De enero a mayo solo son reales los totales mensuales.',
    textoCompleto: 'Los cuatro cuadros están completos, sus totales cuadran con el Excel y los valores atípicos están revisados con Dr. Mochi.',
    chequeos: Object.freeze([
      { id: 'incompleto', texto: 'Los cuatro cuadros tienen todas sus casillas' },
      { id: 'no-numerico', texto: 'Toda casilla del archivo es un número' },
      { id: 'entero', texto: 'Las raciones son enteros sin signo' },
      { id: 'totales', texto: 'Los totales del Excel cuadran con la suma de sus días' },
    ]),
  }),

  /* Laboratorio también se llena subiendo su Excel: su libro del año, con
     una hoja por mes, del que el bot lee la del mes que se reporta. Su
     reporte es MENSUAL: una cifra por examen y procedencia, sin días. */
  laboratorio: Object.freeze({
    clave: 'laboratorio',
    nombre: 'Patología Clínica y Anatomía Patológica',
    oficio: 'libro anual del área (Oficios_Laboratorio.xlsx), una hoja por mes',
    carga: true,
    formatos: CUADROS_LAB,
    datosVacios: vaciosLab,
    validar: validarLab,
    estadoDeFormato: estadoLab,
    notaDeFormato: notaLab,
    tituloPaso: (f) => f.titulo,
    rotuloPaso: null,
    sembrar: (periodo, opciones) => datosDeLaboratorio(periodo, opciones),
    periodoReal: REAL_LAB,
    notaReal: null,
    textoCompleto: 'Todas las secciones están completas, cada total escrito cuadra con su suma y las alertas están revisadas con Dr. Mochi.',
    chequeos: Object.freeze([
      { id: 'incompleto', texto: 'Todas las secciones tienen sus casillas' },
      { id: 'no-numerico', texto: 'Toda casilla del archivo es un número' },
      { id: 'entero', texto: 'Las cantidades son enteros sin signo' },
      { id: 'total-fila', texto: 'La columna TOTAL de cada examen cuadra con sus procedencias' },
      { id: 'total-seccion', texto: 'La fila TOTAL de cada sección cuadra con sus exámenes' },
      { id: 'total-patologia', texto: 'El TOTAL DE EXAMENES LABORATORIO cuadra con Patología Clínica' },
      { id: 'total-general', texto: 'El TOTAL GENERAL DE ATENCIONES cuadra con las secciones' },
    ]),
  }),

  /* Centro Quirúrgico sube su libro del mes, que es acumulado: el bot lee la
     columna del mes de cinco hojas. Sus «formatos» son los ocho reportes del
     área (REPORTES): cinco leídos y tres que el sistema calcula con ellos
     (Top Ten, el consolidado por especialidad y la tabla derecha de
     indicadores). Se corrige en su Excel, como Laboratorio. */
  'centro-quirurgico': Object.freeze({
    clave: 'centro-quirurgico',
    nombre: 'Centro Quirúrgico',
    oficio: 'libro mensual del área (ESTADISTICA <MES> 2026.xlsx), acumulado',
    carga: true,
    formatos: REPORTES_CQX,
    datosVacios: vaciosCqx,
    validar: validarCqx,
    estadoDeFormato: estadoCqx,
    notaDeFormato: notaCqx,
    tituloPaso: (f) => `${f.numero} · ${f.corto}`,
    rotuloPaso: null,
    sembrar: (periodo, opciones) => datosDeCentroQuirurgico(periodo, opciones),
    periodoReal: REAL_CQX,
    notaReal: null,
    textoCompleto: 'Las cinco hojas traen la cifra del mes, cada total escrito cuadra con su suma y las diferencias entre hojas están justificadas.',
    /* Las reglas del bot (servidor/bot-validador/src/areas/centro-quirurgico/reglas.js). */
    chequeos: Object.freeze([
      { id: 'incompleto', texto: 'El resumen, el cuadro de indicadores y las causas traen su cifra del mes' },
      { id: 'no-numerico', texto: 'Toda cifra del mes es un número' },
      { id: 'entero', texto: 'Intervenciones, salas y pacientes son enteros sin signo; las horas, sin signo' },
      { id: 'subtotales', texto: 'El total de cada especialidad, cada Sub Total y el TOTAL de causas cuadran con sus filas' },
      { id: 'cruce-resumen', texto: 'El RESUMEN coincide con las hojas de cirugía mayor y menor' },
      { id: 'cruce-suspendidas', texto: 'Las suspendidas coinciden con la suma de sus causas' },
      { id: 'cruce-indicadores', texto: 'El cuadro de indicadores coincide con el RESUMEN' },
      { id: 'salas', texto: 'Las salas utilizadas son las de emergencia más las programadas' },
    ]),
  }),

  /* Farmacia se llena digitando (opción A de su documentación): entrega su
     informe en Word y el sistema solo lee Excel. Generar el Word de salida
     (opción C) o leer el suyo (opción B) quedan para fases posteriores. */
  farmacia: Object.freeze({
    clave: 'farmacia',
    nombre: 'Farmacia',
    oficio: 'informe mensual en Word (01_INFORME_MES_DE_ENERO_2026.docx), del área de Control y Archivo',
    /* Farmacia sube el Word que ya redacta cada mes y el bot llena los
       formatos con lo leído (paneles/reporte/ReporteWord.jsx). */
    subeWord: true,
    formatos: FORMATOS_FAR,
    datosVacios: vaciosFar,
    validar: validarFar,
    estadoDeFormato: estadoFar,
    notaDeFormato: notaFar,
    rotuloPaso: (f) => f.corto,
    sembrar: (periodo, opciones) => datosDeFarmacia(periodo, opciones),
    periodoReal: REAL_FAR,
    notaReal: null,
    textoCompleto: 'Los totales están calculados, las consultas y los convenios de Consultorios externos cuadran con el Formato 1 y toda cifra es un entero sin signo.',
    /* R1 a R4 no pueden fallar: los totales no se digitan. Se listan igual
       para que Estadística sepa que esa comprobación existe y por qué se
       cumple. Los ids son las reglas del bot (areas/farmacia/reglas.js). */
    chequeos: Object.freeze([
      { id: 'totales-calculados', texto: 'R1–R4 · Los totales (SIS, convenios, otras atenciones y total) se calculan, no se digitan' },
      { id: 'formato-vacio', texto: 'Los formatos 1, 2 y 3 tienen cifras registradas' },
      { id: 'r5', texto: 'R5 · Las consultas del Formato 3 cuadran con la Consulta externa SIS del Formato 1' },
      { id: 'r6', texto: 'R6 · Los convenios del Formato 3 cuadran con los de consultorio del Formato 1' },
      { id: 'r9', texto: 'R9 · Todas las cifras son enteros mayores o iguales a cero' },
      { id: 'r10', texto: 'R10 · El periodo es el del reporte abierto' },
      { id: 'totales', texto: 'Si se subió el Word, sus totales escritos cuadran con la suma de sus partes' },
      { id: 'no-numerico', texto: 'Si se subió el Word, toda celda de cifras es un número' },
    ]),
  }),

  /* Nefrología no sube un reporte nuevo cada mes: lleva UN SOLO Word del año
     entero (un indicador por fila, un mes por columna) y lo sube completo
     cada vez que agrega su columna del mes. El bot lee solo esa columna y
     deja las demás como están (areas/nefrologia/lector.js). */
  nefrologia: Object.freeze({
    clave: 'nefrologia',
    nombre: 'Nefrología y Hemodiálisis',
    oficio: 'cuadro anual en Word (hemodialisis - ESTADISTICA HD 2026.docx), del Servicio de Nefrología',
    subeWord: true,
    formatos: CUADROS_NEF,
    datosVacios: vaciosNef,
    validar: validarNef,
    estadoDeFormato: estadoNef,
    notaDeFormato: notaNef,
    tituloPaso: (f) => f.titulo,
    rotuloPaso: null,
    sembrar: (periodo, opciones) => datosDeNefrologia(periodo, opciones),
    periodoReal: REAL_NEF,
    notaReal: null,
    textoCompleto: 'El mes tiene sus 29 indicadores registrados, son enteros sin signo y los trimestres, semestres y el total anual que el cuadro ya trae calculados cuadran con sus meses.',
    /* Los ids son las reglas del bot (areas/nefrologia/reglas.js). */
    chequeos: Object.freeze([
      { id: 'incompleto', texto: 'El mes tiene todos sus indicadores registrados (sin atenciones se anota 0)' },
      { id: 'no-numerico', texto: 'Toda celda de cifras del cuadro es un número' },
      { id: 'entero', texto: 'Las cifras son enteros sin signo' },
      { id: 'totales', texto: 'Los trimestres, semestres y el total anual que el cuadro ya trae calculados cuadran con sus meses' },
      { id: 'filas-ausentes', texto: 'El cuadro trae todos los indicadores del reporte' },
      { id: 'fila-no-catalogada', texto: 'Toda fila con cifras es un indicador del reporte' },
    ]),
  }),

  /* Epidemiología sube su oficio de vigilancia en Word (areas/epidemiologia/
     del bot): una tabla de casos nuevos de infecciones intrahospitalarias por
     edad, servicio y sexo. Hasta el 27/10/2026 tenía una estructura propuesta
     con cifras simuladas (areas-simuladas.js). */
  epidemiologia: Object.freeze({
    clave: 'epidemiologia',
    nombre: 'Oficina de Epidemiología',
    oficio: 'oficios de vigilancia de enero a setiembre de 2026, en Word',
    subeWord: true,
    formatos: FORMATOS_EPI,
    datosVacios: vaciosEpi,
    validar: validarEpi,
    estadoDeFormato: estadoEpi,
    notaDeFormato: notaEpi,
    tituloPaso: (f) => f.titulo,
    rotuloPaso: null,
    sembrar: (periodo, opciones) => datosDeEpidemiologia(periodo, opciones),
    periodoReal: REAL_EPI,
    notaReal: null,
    textoCompleto: 'La tabla tiene sus quince grupos de edad, la fila TOTAL cuadra con ellos columna por columna y cada caso está en una edad posible para su columna.',
    chequeos: Object.freeze(REGLAS_EPI.filter((r) => r.nivel === 'error').map(({ id, texto }) => ({ id, texto }))),
  }),

  /* Gineco-Obstetricia sube un Excel nuevo cada mes (no un libro acumulado
     como Laboratorio o Nefrología): cada archivo es su propio reporte, en
     una sola hoja que el bot encuentra por sus rótulos. */
  ginecologia: Object.freeze({
    clave: 'ginecologia',
    nombre: 'Departamento de Gineco-Obstetricia',
    oficio: 'Excel EBVI mensual del área (EBVI_Consolidado_Mes_*.xlsx), un archivo nuevo cada mes',
    carga: true,
    formatos: CUADROS_GIN,
    datosVacios: vaciosGin,
    validar: validarGin,
    estadoDeFormato: estadoGin,
    notaDeFormato: notaGin,
    tituloPaso: (f) => f.titulo,
    rotuloPaso: null,
    sembrar: (periodo, opciones) => datosDeGinecologia(periodo, opciones),
    periodoReal: REAL_GIN,
    notaReal: null,
    textoCompleto: 'El cuadro de controles prenatales está completo y sus totales cuadran con la suma de sus filas; el de partos, cesáreas y nacidos, si llegó este mes, también.',
    /* Los ids son las reglas del bot (areas/ginecologia/reglas.js). El
       cuadro 2 ausente es un aviso, no un error: el Excel real solo lo
       trae desde setiembre de 2026. */
    chequeos: Object.freeze([
      { id: 'incompleto', texto: 'Los cuadros presentes tienen todas sus casillas (sin casos se anota 0)' },
      { id: 'no-numerico', texto: 'Toda celda de cifras del Excel es un número' },
      { id: 'entero', texto: 'Las cifras son enteros sin signo' },
      { id: 'totales', texto: 'La fila TOTAL de cada cuadro cuadra con la suma de sus filas' },
      { id: 'filas-ausentes', texto: 'Cada cuadro presente trae todas sus filas' },
      { id: 'fila-no-catalogada', texto: 'Toda fila con cifras es una fila del cuadro' },
      { id: 'cuadro-2-ausente', texto: 'El Excel trae el cuadro de partos, cesáreas y nacidos' },
    ]),
  }),
});

export function formularioDe(claveArea) {
  return LEVANTADOS[claveArea] ?? null;
}

export function areasLevantadas() {
  return Object.values(LEVANTADOS);
}

/* Datos completos de un reporte: la estructura vacía rellenada con lo que
   haya. Un reporte recién abierto tiene `datos: {}`. */
export function datosCompletos(claveArea, datos) {
  const f = formularioDe(claveArea);
  return f ? { ...f.datosVacios(), ...datos } : (datos ?? {});
}

/* El kit nombra los estados del paso en inglés; el dominio los llama vacio y
   parcial (los usan las pruebas y las reglas de cada formato). Se traducen aquí,
   en la frontera, y solo aquí. ok y error coinciden. */
const ESTADO_DEL_PASO = { vacio: 'empty', parcial: 'partial' };

/* Pasos de la barra de formatos (`Steps` del kit), con su estado y su nota. */
export function pasosDe(claveArea, datos, periodo, validacion, { conRotulo = true } = {}) {
  const f = formularioDe(claveArea);
  return f.formatos.map((fmt) => {
    const estado = f.estadoDeFormato(fmt.id, datos, periodo, validacion);
    /* Laboratorio no tiene formatos sino secciones: se nombran por su título,
       y el rótulo sobra porque ya es el título. */
    const nota = f.notaDeFormato(fmt.id, datos, periodo);
    return {
      key: fmt.id,
      title: f.tituloPaso ? f.tituloPaso(fmt) : `Formato ${fmt.numero}`,
      note: conRotulo && f.rotuloPaso ? `${f.rotuloPaso(fmt)} · ${nota}` : nota,
      status: ESTADO_DEL_PASO[estado] ?? estado,
    };
  });
}

/* Siembra de cualquier área: la del oficio si está levantada, la simulada si
   no. Un reporte en llenado se siembra a medias. */
export function datosSembrados(claveArea, periodo, { parcial = false } = {}) {
  const f = formularioDe(claveArea);
  return f ? f.sembrar(periodo, { parcial }) : datosSimulados(claveArea, periodo, { parcial });
}
