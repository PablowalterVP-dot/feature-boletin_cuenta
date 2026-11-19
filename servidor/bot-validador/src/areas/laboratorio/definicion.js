/* Departamento de Patología Clínica y Anatomía Patológica (Laboratorio):
   definición de su reporte mensual, tomada del Excel que el área usa
   (`Oficios_Laboratorio.xlsx`, revisado el 08/10/2026 en sus doce meses).

   EL LIBRO
   Un solo Excel por año, con una hoja por mes (ENERO, FEBRERO, MARZO, ABRIL,
   MAYO, JUN, JUL, AGO, SET, OCT, NOV, DIC) que el área sobrescribe cada año:
   la hoja de octubre tiene las cifras de 2025 hasta que se llena la de 2026.
   Trae además CONSOLIDADO (la suma del año), hojas de trabajo (Hoja1,
   CALCULO PRESUPUESTO) y a veces copias («ABRIL (2)»). El bot lee solo la hoja
   del mes que se reporta y comprueba su «Mes:» y su «Año:».

   LA HOJA DEL MES
   Dos bloques lado a lado:
     izquierda  A = examen · B–G = las seis procedencias · H = TOTAL
                Patología Clínica: Bioquímica, Hematología-Hemostasia,
                Microbiología, Uro-Parasitológicos e Inmuno-Serológicos, con la
                fila «TOTAL DE EXAMENES LABORATORIO» encima.
     derecha    J = examen · K–P = las seis procedencias · Q = TOTAL
                Anatomía Patológica, Programas/Metaxénicas (su tercera columna
                es «Programa», no «C. Externa»), Banco de Sangre y el resumen
                del departamento, con el TOTAL general (P «TOTAL», Q la cifra).
   Las filas no están en el mismo lugar cada mes y los exámenes cambian
   (renombres, exámenes que aparecen unos meses): se busca cada fila por su
   rótulo, dentro de su sección, con los alias de cada examen.

   CONTRATO DE LOS DATOS (el mismo que Nutrición)
     datos[cuadro][fila] = número | null
   Cada sección es un cuadro; cada fila, un examen en una procedencia
   (`glucosa.emergencia`). Es MENSUAL: una cifra, sin días.

   Lo que el Excel trae escrito y no es dato (los totales) va en
   `datos.escritos` y en `datos.declarados` (ver lector.js).

   `ocasional`: un examen que solo figura algunos meses. Si el mes no lo trae
   no se informa como ausente: no se ofreció. */

/* Las procedencias de las secciones de examen: columnas B–G (izquierda) o
   K–P (derecha), en este orden. */
export const PROCEDENCIAS = Object.freeze([
  { clave: 'hospitalizacion', label: 'Hospitalización' },
  { clave: 'emergencia', label: 'Emergencia' },
  { clave: 'c_externa', label: 'Consulta externa' },
  { clave: 'privado', label: 'Privado' },
  { clave: 'convenio', label: 'Convenio' },
  { clave: 'insolvencia', label: 'Insolvencia' },
]);

/* Programas/Metaxénicas cuenta en la tercera columna lo que piden los
   programas de salud, no la consulta externa. */
const PROCEDENCIAS_PROGRAMA = Object.freeze([
  PROCEDENCIAS[0],
  PROCEDENCIAS[1],
  { clave: 'programa', label: 'Programa' },
  PROCEDENCIAS[3],
  PROCEDENCIAS[4],
  PROCEDENCIAS[5],
]);

/* El resumen del departamento solo trae una cifra por fila, en la columna TOTAL. */
const PROCEDENCIA_TOTAL = Object.freeze([{ clave: 'total', label: 'Total' }]);

/* Columnas de cada bloque: la del rótulo, las de las procedencias y la del TOTAL. */
export const BLOQUES = Object.freeze({
  izquierda: Object.freeze({ rotulo: 'A', datos: ['B', 'C', 'D', 'E', 'F', 'G'], total: 'H' }),
  derecha: Object.freeze({ rotulo: 'J', datos: ['K', 'L', 'M', 'N', 'O', 'P'], total: 'Q' }),
});

/* Un examen: su clave estable, el rótulo del Excel y los nombres con que figuró otros meses. */
const ex = (clave, etiqueta, { alias = [], ocasional = false } = {}) => Object.freeze({ clave, etiqueta, alias: Object.freeze(alias), ocasional });

export const SECCIONES = Object.freeze([
  Object.freeze({
    id: 'bioquimica',
    label: 'Bioquímica',
    bloque: 'izquierda',
    etiquetaTotal: 'TOTAL EXAMENES BIOQUIMICOS',
    examenes: Object.freeze([
      ex('acido_urico', 'ACIDO URICO'),
      ex('calcio', 'CALCIO'),
      ex('amilasa', 'AMILASA'),
      ex('glucosa', 'GLUCOSA'),
      ex('glucosa_post_prandial', 'GLUCOSA POST PRANDIAL'),
      ex('fosforo', 'FOSFORO'),
      ex('hemoglobina_glicosilada', 'HEMOGLOBINA GLICOSILADA'),
      ex('tolerancia_glucosa', 'TOLERANCIA A LA GLUCOSA'),
      ex('creatinina', 'CREATININA'),
      ex('depuracion_creatinina', 'DEPURACION DE CREATININA'),
      ex('microalbuminuria', 'MICROALBUMINURIA'),
      ex('urea', 'UREA'),
      ex('proteinuria_24h', 'PROTEINURIA 24 HORAS'),
      ex('bilirrubina_total', 'BILIRRUBINA TOTAL'),
      ex('bilirrubina_directa', 'BILIRRUBINA DIRECTA'),
      ex('proteinas_totales', 'PROTEINAS TOTAL'),
      ex('albumina', 'ALBUMINA'),
      ex('tgo', 'TGO'),
      ex('tgp', 'TGP'),
      ex('ggtp', 'GGTP'),
      ex('dhl', 'LACTATO DESHIDROGENASA (DHL)'),
      ex('pcr_cuantitativo', 'PROTEINA C REACTIVA (CUANTITATIVO)'),
      ex('fosfatasa_alcalina', 'FOSFATASA ALCALINA'),
      ex('cpk_total', 'CPK TOTAL'),
      ex('cpk_mb', 'CPK MB'),
      ex('colesterol', 'COLESTEROL'),
      ex('trigliceridos', 'TRIGLICERIDOS'),
      ex('hdl', 'HDLC'),
      ex('ldl', 'LDLC'),
      ex('aso', 'ASO'),
      ex('factor_reumatoideo', 'FACTOR REUMATOIDEO'),
      ex('hierro', 'HIERRO'),
      ex('lipasa', 'LIPASA'),
      ex('transferrina', 'TRANSFERRINA'),
      ex('complemento_c3', 'COMPLEMENTO C3'),
      ex('complemento_c4', 'COMPLEMENTO C4'),
      ex('gases_arteriales', 'GASES ARTERIALES'),
      ex('electrolitos', 'ELECTROLITOS'),
      ex('lipidos_totales', 'LIPIDOS TOTALES', { ocasional: true }),
    ]),
  }),

  Object.freeze({
    id: 'hematologia',
    label: 'Hematología-Hemostasia',
    bloque: 'izquierda',
    etiquetaTotal: 'TOTAL EXAMENES HEMATOLOGICOS -HEMOSTASICOS',
    aliasTotal: Object.freeze(['TOTAL EXAMENES HEMATOLOGICOS-HEMOSTASICOS', 'TOTAL EXAMENES HEMATOLOGICOS - HEMOSTASICOS']),
    examenes: Object.freeze([
      ex('hematocrito', 'HEMATOCRITO'),
      ex('hemoglobina', 'HEMOGLOBINA'),
      ex('hemograma', 'HEMOGRAMA AUTOMATIZADO'),
      ex('plaquetas', 'PLAQUETAS'),
      ex('coagulacion_sangria', 'T COAGULACION & T SANGRIA', { alias: ['TC & TS'] }),
      ex('vsg', 'VELOCIDAD DE SEDIMENTACION GLOBULAR', { alias: ['VSG'] }),
      ex('coombs_directo', 'TEST COOMBS DIRECTO'),
      ex('coombs_indirecto', 'TEST DE COOMBS INDIRECTO'),
      ex('grupo_factor', 'GRUPO SANGUINEO Y FACTOR RH', { alias: ['GRUPO Y FACTOR'] }),
      ex('lamina_periferica', 'LAMINA PERIFERICA'),
      ex('constantes_corpusculares', 'CONSTANTES CORPUSCULARES'),
      ex('reticulocitos', 'RETICULOCITOS'),
      ex('tiempo_tromboplastina', 'TIEMPO DE TROMBOPLASTINA'),
      ex('tiempo_protrombina', 'TIEMPO DE PROTROMBINA'),
      ex('inr', 'INR'),
      ex('fibrinogeno', 'FIBRINOGENO'),
      ex('dimero_d', 'DIMERO D'),
    ]),
  }),

  Object.freeze({
    id: 'microbiologia',
    label: 'Microbiología',
    bloque: 'izquierda',
    etiquetaTotal: 'TOTAL EXAMENES MICROBIOLOGIA',
    examenes: Object.freeze([
      ex('urocultivo', 'UROCULTIVO'),
      ex('hemocultivo', 'HEMOCULTIVO'),
      ex('cultivo_cateter', 'CULTIVO DE CATETER'),
      /* Cultivo de secreción y citoquímico figuran casi todo el año; agosto y
         setiembre traen en su lugar cultivo bacteriano y recuento celular. Puede
         ser un renombre: por confirmar con el área antes de unirlos. */
      ex('cultivo_secrecion', 'CULTIVO DE SECRECION', { ocasional: true }),
      ex('citoquimico', 'CITOQUIMICO', { ocasional: true }),
      // Octubre de 2026 corrige el rótulo: «CULTIVO BACTERIANO».
      ex('cultivo_bacteriano', 'CULTIVO DE BACTERIANO', { alias: ['CULTIVO BACTERIANO'], ocasional: true }),
      ex('recuento_celular', 'RECUENTO CELULAR', { ocasional: true }),
      ex('coprocultivo', 'COPROCULTIVO'),
      ex('coloracion_gram', 'COLORACION GRAM (SECREC.VAGINAL Y OTROS)'),
      ex('koh_hongos', 'KOH -HONGOS', { alias: ['KOH-HONGOS', 'KOH - HONGOS'] }),
      ex('cultivo_hongos', 'CULTIVO DE HONGOS'),
      ex('tinta_china', 'TINTA CHINA'),
      ex('ph_liquidos', 'PH LIQUIDOS CORPORALES'),
      ex('baciloscopia_liquidos', 'BACILOSCOPIA DE LIQUIDOS CORPORALES'),
    ]),
  }),

  Object.freeze({
    id: 'uro_parasitologicos',
    label: 'Uro-Parasitológicos',
    bloque: 'izquierda',
    etiquetaTotal: 'TOTAL EXAMENES URO -PARASITOLOGICOS',
    aliasTotal: Object.freeze(['TOTAL EXAMENES URO-PARASITOLOGICOS', 'TOTAL EXAMENES URO - PARASITOLOGICOS']),
    examenes: Object.freeze([
      ex('heces_seriado', 'HECES SERIADO'),
      ex('coproparasitologico_funcional', 'COPROPARASITOLOGICO FUNCIONAL'),
      ex('rx_inflamatoria', 'RX INFLAMATORIA'),
      ex('thevenon', 'THEVENON HECES'),
      ex('sudan', 'SUDAN'),
      ex('benedict', 'BENEDICT'),
      ex('examen_orina', 'EXAMEN COMPLETO DE ORINA'),
      ex('test_graham', 'TEST GRAHAM', { ocasional: true }),
      ex('kinyoun', 'KINYOUN', { ocasional: true }),
      ex('baermann', 'METODO DE CONCENTRACION (BAERMANN)'),
      ex('examen_directo_heces', 'EXAMEN DIRECTO DE HECES'),
      ex('h_pylori_heces', 'ANTIGENO H. PYLORI EN HECES'),
      ex('adenovirus_rotavirus', 'ADENOVIRUS & ROTAVIRUS'),
    ]),
  }),

  Object.freeze({
    id: 'inmuno_serologicos',
    label: 'Inmuno-Serológicos',
    bloque: 'izquierda',
    etiquetaTotal: 'TOTAL EXAMENES INMUNO SEROLOGICOS',
    aliasTotal: Object.freeze(['TOTAL EXAMENES INMUNO-SEROLOGICOS']),
    /* Rótulos de subgrupo dentro de la sección: no traen cifras. */
    subtitulos: Object.freeze(['PRUEBAS RAPIDAS', 'PRUEBAS QUIMIOLUMINISCENCIA']),
    examenes: Object.freeze([
      ex('rpr', 'RPR'),
      ex('vdrl', 'VDRL'),
      ex('aglutinaciones', 'AGLUTINACIONES'),
      ex('rosa_bengala', 'ROSA DE BENGALA'),
      ex('anti_mpo', 'ANTI MIELOPEROXIDASA (MPO)'),
      ex('anti_pr3', 'ANTI PROTEINASA 3 (PR3)'),
      ex('anti_cardiolipina', 'ANTI CARDIOLIPINA'),
      ex('anti_b2_glicoproteina', 'ANTI B2-GLICOPROTEINA'),
      ex('anti_ama', 'ANTI M2-3E (AMA)'),
      ex('ana_elisa', 'ANA (ELISA)'),
      ex('h_pylori_igm', 'HELICOBACTER PILORY IGM'),
      ex('h_pylori_igg', 'HELICOBACTER PILORY IGG'),
      // Pruebas rápidas
      ex('vih_rapida', 'VIH (I - II AB)'),
      ex('vhb_superficie_rapida', 'ANTIGENO SUPERFICIE VHB (HEPATITIS B)'),
      ex('vhb_core_rapida', 'ANTICORE VHB (HEPATITIS B CORE)'),
      ex('vhc_rapida', 'ANTI VHC - AB (HEPATITIS C)'),
      ex('vha_igm_rapida', 'ANTI VHA - IGM (HEPATITIS A)'),
      ex('bhcg_cualitativo', 'B HCG CUALITATIVO'),
      // Quimioluminiscencia
      ex('vih_combo', 'HIV AG/AB COMBO'),
      ex('hbsag', 'HBSAG (ANTIGENO DE SUPERFICIE)'),
      ex('vhc_quimio', 'ANTI HVC (HEPATITIS C)'),
      ex('vha_igm_quimio', 'ANTI VHA-IGM (HEPATITIS A)'),
      ex('vhb_core_quimio', 'ANTI HBC (HEPATITIS B CORE)'),
      ex('afp', 'AFP (ALFA FETO PROTEINA)'),
      ex('cea', 'CEA (ANTIGENO CARCINOEMBRIONARIO)'),
      ex('vitamina_b12', 'VITAMINA B12'),
      ex('ca_19_9', 'CA 19.9'),
      ex('ca_15_3', 'CA 15.3'),
      ex('ca_125', 'CA 125'),
      ex('psa_total', 'PSA TOTAL'),
      ex('psa_libre', 'PSA LIBRE'),
      ex('bhcg_cuantitativo', 'B HCG CUANTITATIVO'),
      ex('procalcitonina', 'PROCALCITONINA'),
      ex('insulina', 'INSULINA'),
      ex('prolactina', 'PROLACTINA'),
      ex('progesterona', 'PROGESTERONA'),
      ex('testosterona', 'TESTOSTERONA'),
      ex('t3_libre', 'T3 LIBRE'),
      ex('t4_libre', 'T4 LIBRE'),
      ex('tsh', 'TSH'),
      ex('paratohormona', 'PARATOHORMONA'),
      ex('troponina_i', 'TROPONINA I'),
      ex('rubeola', 'RUBEOLA IGM/IGG'),
      ex('toxoplasma', 'TOXOPLASMA IG M/IG G'),
      ex('cmv', 'CMV IG M/IG G'),
      ex('vhs_1', 'VHS I IG M/IG G'),
      ex('vhs_2', 'VHS II IG M/IG G'),
      ex('ferritina', 'FERRITINA'),
      ex('acido_folico', 'ACIDO FOLICO'),
      ex('cortisol', 'CORTISOL'),
      ex('estradiol', 'ESTRADIOL'),
      ex('lh', 'HORMONA LUTEINIZANTE'),
      ex('fsh', 'HORMONA FSH'),
      ex('anti_ccp', 'PEPTIDO CICLICLO (ANTICCP)'),
      ex('b2_microglobulina', 'B2 MICROGLOBULINA', { ocasional: true }),
      ex('ana_ena', 'ANA/ENA'),
      ex('acth', 'ACTH'),
      ex('anca', 'ANCA'),
      ex('dengue_ns1', 'DENGUE NS1', { ocasional: true }),
      ex('dengue_igm', 'DENGUE IG.M', { alias: ['DENGUE IG,M', 'DENGUE IGM'], ocasional: true }),
      ex('leptospira_ig', 'LEPTOSPIRA IG G / IG M', { ocasional: true }),
    ]),
  }),

  Object.freeze({
    id: 'anatomia_patologica',
    label: 'Anatomía Patológica',
    bloque: 'derecha',
    titulo: 'ANATOMIA PATOLOGICA',
    etiquetaTotal: 'TOTAL EXAMENES ANATOMIA PATOLOGICA',
    examenes: Object.freeze([
      ex('pap', 'TOTAL EXAMENES CITOLOGICOS (PAP)'),
      ex('baaf', 'TOTAL BAAF'),
      ex('biopsia', 'TOTAL EXAMENES HISTOPATOLOGICOS (BIOPSIA)'),
      ex('pieza_quirurgica', 'TOTAL PIEZA QUIRURGICA (HISTOLOGIA)'),
      ex('citologia_especial', 'TOTAL CITOLOGIA ESPECIAL'),
      ex('tejidos_incluidos', 'TOTAL DE TEJIDOS INCLUIDOS'),
      ex('cortes_tejidos', 'TOTAL DE CORTES DE TEJIDOS'),
      ex('laminas_montadas', 'TOTAL DE LAMINAS MONTADAS'),
      ex('histoquimica', 'TOTAL DE HISTOQUIMICA'),
      ex('inmunohistoquimica', 'TOTAL DE INMUNOHISTOQUIMICA', { ocasional: true }),
      ex('autopsia_medico_legal', 'TOTAL AUTOPSIA MEDICO LEGAL'),
      ex('autopsia_clinica', 'TOTAL AUTOPSIA CLINICA'),
    ]),
  }),

  Object.freeze({
    id: 'metaxenicas',
    label: 'Programas / Metaxénicas',
    bloque: 'derecha',
    titulo: 'PROGRAMAS / METAXENICAS',
    aliasTitulo: Object.freeze(['PROGRAMAS/METAXENICAS']),
    etiquetaTotal: 'TOTAL DE EXAMENES',
    procedencias: PROCEDENCIAS_PROGRAMA,
    examenes: Object.freeze([
      ex('tuberculosis', 'TUBERCULOSIS'),
      ex('leishmania', 'LEISHMANIA', { ocasional: true }),
      ex('leprae', 'PROGRAMA LEPRAE'),
      ex('malaria', 'MALARIA'),
      /* «Referencial» casi todo el año, «varios» de mayo a agosto: puede ser el
         mismo examen renombrado. Por confirmar antes de unirlos. */
      ex('metaxenicas_referencial', 'METAXENICAS (REFERENCIAL)', { ocasional: true }),
      ex('metaxenicas_varios', 'METAXENICAS (VARIOS)', { ocasional: true }),
      ex('cultivo_tb', 'CULTIVO DE TB (REFERENCIAL)'),
      ex('dengue_rapida', 'PRUEBA RAPIDA DE DENGUE', { ocasional: true }),
      ex('leptospira_rapida', 'PRUEBA RAPIDA DE LEPTOSPIRA'),
      ex('covid_influenza', 'PRUEBA RAPIDA DE COVID + INFLUENZA', { ocasional: true }),
      ex('covid', 'PRUEBA RAPIDA DE COVID', { ocasional: true }),
      ex('elisa_dengue', 'ELISA DENGUE NS1 + IGM', { ocasional: true }),
      ex('otras_arbovirosis', 'OTRAS ARBOVIROSIS (DENGUE)', { alias: ['OTRAS ARBOVIROSIS(DENGUE)'], ocasional: true }),
      ex('tosferina', 'TOSFERINA', { ocasional: true }),
      ex('baciloscopia_lepra', 'BACILOSCOPIA DE LEPRA', { ocasional: true }),
      ex('sarampion', 'SARAMPION', { ocasional: true }),
    ]),
  }),

  Object.freeze({
    id: 'banco_sangre',
    label: 'Banco de Sangre',
    bloque: 'derecha',
    titulo: 'BANCO DE SANGRE',
    etiquetaTotal: 'TOTAL DE UNIDADES ENTREGADAS',
    unidad: 'unidades',
    /* Hasta setiembre de 2026 «TOTAL DE UNIDADES ENTREGADAS» sumaba las ocho
       filas. En octubre el área separó las pruebas con su propio subtotal, y
       desde entonces esa fila suma solo los hemocomponentes. Un mes que trae
       la fila del subtotal se lee de la manera nueva; uno que no, de la vieja. */
    subtotales: Object.freeze([
      Object.freeze({ id: 'pruebas', etiqueta: 'TOTAL DE PRUEBAS REALIZADAS', examenes: Object.freeze(['grupo_abo_gel', 'prueba_cruzada_mayor', 'prueba_cruzada_menor']) }),
    ]),
    examenes: Object.freeze([
      ex('sangre_total', 'SANGRE TOTAL'),
      ex('globulos_rojos', 'GLOBULOS ROJOS'),
      ex('plasma_fresco', 'PLASMA FRESCO CONGELADO'),
      ex('crioprecipitado', 'CRIOPRECIPITADO'),
      ex('plaquetas', 'PLAQUETAS'),
      ex('grupo_abo_gel', 'GRUPO SANGUINEO ABO EN GEL'),
      ex('prueba_cruzada_mayor', 'PRUEBA CRUZADA MAYOR'),
      ex('prueba_cruzada_menor', 'PRUEBA CRUZADA MENOR'),
    ]),
  }),

  /* El resumen del departamento: casi todo son copias de los totales de las
     secciones (no son dato), salvo las actividades de programación, que se
     cuentan aquí y suman al total general. */
  Object.freeze({
    id: 'actividades',
    label: 'Programación y seguimiento',
    bloque: 'derecha',
    titulo: 'TOTAL DE ATENCIONES EN EL DEPARTAMENTO DE PATOLOGIA CLINICA Y ANATOMIA PATOLOGICA',
    procedencias: PROCEDENCIA_TOTAL,
    unidad: 'actividades',
    examenes: Object.freeze([ex('programacion', 'PROGRAMACION, SEGUIMIENTO Y EVALUACION DE ACTIVIDADES')]),
  }),
]);

/* Filas del resumen que repiten totales de las secciones: se leen como
   totales escritos, no como dato. */
export const FILAS_DE_RESUMEN = Object.freeze([
  'PROGRAMAS DE SALUD OPORTUNOS PARA LA POBLACION',
  'EXAMEN DE PROCEDIMIENTO BIOQUIMICO',
  'EXAMEN DE PROCEDIMIENTO HEMATOLOGICO - HEMOSTASICOS',
  'EXAMEN DE PROCEDIMIENTOS MICROBIOLOGICOS',
  'EXAMEN DE PROCEDIMIENTOS UROPARASITOLOGICOS',
  'EXAMEN DE PROCEDIMIENTOS INMUNOLOGICOS',
  'EXAMEN DE PROCEDIMIENTO ANATOMO PATOLOGICO',
  'EXAMEN DE PROGRAMAS',
  'UNIDADES DE BANCO DE SANGRE',
  'EXAMEN DE PROCEDIMIENTO SERVICIO DE BIOQUIMICA, HEMATOLOGIA Y HEMOSTASIA',
  'EXAMEN DE PROCEDIMIENTOS SERVICIO DE MICROBIOLOGIA E INMUNOLOGIA',
  'EXAMEN DE PROCEDIMIENTO SERVICIO DE ANATOMIA PATOLOGICA',
]);

/* La fila que suma las cinco secciones de Patología Clínica. */
export const TOTAL_PATOLOGIA_CLINICA = 'TOTAL DE EXAMENES LABORATORIO';

/* Las hojas del libro, por mes: el nombre que usa el área primero, y los que
   podría usar. */
export const HOJAS_DEL_MES = Object.freeze([
  ['ENERO', 'ENE'],
  ['FEBRERO', 'FEB'],
  ['MARZO', 'MAR'],
  ['ABRIL', 'ABR'],
  ['MAYO', 'MAY'],
  ['JUN', 'JUNIO'],
  ['JUL', 'JULIO'],
  ['AGO', 'AGOSTO'],
  ['SET', 'SETIEMBRE', 'SEPTIEMBRE', 'SEP'],
  ['OCT', 'OCTUBRE'],
  ['NOV', 'NOVIEMBRE'],
  ['DIC', 'DICIEMBRE'],
]);

/* Lo que puede decir la celda «Mes:» de cada hoja. */
export const NOMBRES_DEL_MES = Object.freeze([
  ['ENERO'], ['FEBRERO'], ['MARZO'], ['ABRIL'], ['MAYO'], ['JUNIO'], ['JULIO'], ['AGOSTO'], ['SETIEMBRE', 'SEPTIEMBRE'], ['OCTUBRE'], ['NOVIEMBRE'], ['DICIEMBRE'],
]);

/* Normalizar texto para comparación: sin tildes, mayúsculas, sin espacios extra.
   Misma función que en nutricion/oficial.js para consistencia del bot. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------- contrato estándar */

/* Abreviatura de cada procedencia, para las cabeceras de tabla (con su
   Tooltip en la pantalla: la abreviatura sola es el primer motivo de un dato
   mal digitado). */
export const ABREVIATURA = Object.freeze({
  hospitalizacion: 'Hosp.',
  emergencia: 'Emerg.',
  c_externa: 'C. Ext.',
  programa: 'Prog.',
  privado: 'Priv.',
  convenio: 'Conv.',
  insolvencia: 'Insolv.',
  total: 'Total',
});

/* Las procedencias que existen en el reporte, sin repetir. */
export const PROCEDENCIAS_DEL_REPORTE = Object.freeze([...PROCEDENCIAS, PROCEDENCIAS_PROGRAMA[2], PROCEDENCIA_TOTAL[0]]);
export const procedencia = (clave) => PROCEDENCIAS_DEL_REPORTE.find((p) => p.clave === clave) ?? null;

/* La fila de una casilla: un examen en una procedencia. */
export const claveFila = (examen, procedenciaClave) => `${examen}.${procedenciaClave}`;

/* Cada sección es un cuadro del reporte, con una fila por examen y procedencia. */
export const CUADROS = Object.freeze(
  SECCIONES.map((s, i) => {
    const procedencias = s.procedencias ?? PROCEDENCIAS;
    return Object.freeze({
      id: s.id,
      numero: i + 1,
      titulo: s.label,
      corto: s.label,
      unidad: s.unidad ?? 'exámenes',
      bloque: s.bloque,
      procedencias,
      examenes: s.examenes,
      filas: Object.freeze(
        s.examenes.flatMap((e) =>
          procedencias.map((p) =>
            Object.freeze({ clave: claveFila(e.clave, p.clave), examen: e.clave, examenLabel: e.etiqueta, procedencia: p.clave, procedenciaLabel: p.label }),
          ),
        ),
      ),
    });
  }),
);

export function cuadro(id) {
  return CUADROS.find((c) => c.id === id) ?? null;
}

export function filaDe(idCuadro, clave) {
  return cuadro(idCuadro)?.filas.find((f) => f.clave === clave) ?? null;
}

/* Un reporte recién abierto no tiene ninguna casilla: la ausencia es el dato. */
export function datosVacios() {
  return {};
}

/* Clave de una casilla, para los ilegibles, el origen y los avisos. */
export function claveCasilla(idCuadro, clave) {
  return `${idCuadro}|${clave}`;
}

/* Los subtotales que la hoja del mes trae en una sección (ver Banco de
   Sangre): los que tienen alguna cifra escrita. */
export function subtotalesDelMes(datos, idCuadro) {
  const escritos = Object.keys(datos?.escritos?.subtotales ?? {});
  const seccion = SECCIONES.find((s) => s.id === idCuadro);
  return (seccion?.subtotales ?? []).filter((st) => escritos.some((k) => k.startsWith(`${idCuadro}|${st.id}|`)));
}

/* Los exámenes que suma la fila de total de la sección: todos, salvo los que
   ese mes tienen su propio subtotal. */
export function examenesDeLaFilaTotal(datos, idCuadro) {
  const aparte = new Set(subtotalesDelMes(datos, idCuadro).flatMap((st) => st.examenes));
  return cuadro(idCuadro).examenes.filter((e) => !aparte.has(e.clave));
}

/* Clave de un total que el Excel trae escrito (no es dato: se compara con la
   suma). La usan el origen, la evidencia de los hallazgos y la corrección:
     escrito|fila|sección|examen           la columna TOTAL de un examen
     escrito|seccion|sección|procedencia   la fila de total de la sección
     escrito|subtotal|sección|sub.proc     la fila de un subtotal de la sección
     escrito|declarado|sección             el TOTAL de esa fila
     escrito|patologia|procedencia·total   la fila TOTAL DE EXAMENES LABORATORIO
     escrito|general                       el TOTAL general del departamento */
export function claveEscrita(...partes) {
  return ['escrito', ...partes].join('|');
}

/* Las columnas de una sección: rótulo, una por procedencia (en el orden de la
   sección) y total. El resumen solo tiene la del total. */
export function columnasDe(idCuadro) {
  const c = cuadro(idCuadro);
  const b = BLOQUES[c.bloque];
  const datos = c.procedencias.length === 1 ? [b.total] : b.datos;
  return { rotulo: b.rotulo, total: b.total, porProcedencia: Object.fromEntries(c.procedencias.map((p, i) => [p.clave, datos[i]])) };
}
