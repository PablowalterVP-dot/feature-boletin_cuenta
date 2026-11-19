/* Cálculos del reporte de Laboratorio que usa el sistema.

   La aritmética (leer una casilla, sumar, contar) y las reglas son del bot
   validador: se reexportan de allí, para que la pantalla, el visor de
   Estadística y el bot digan siempre lo mismo. Aquí queda lo del sistema: el
   estado de cada sección en la barra de pasos y la correspondencia con DIRESA. */

import { cuadro } from '@bot/areas/laboratorio/definicion.js';
import { totalCuadro, casillasLlenas, filasDelMes, valor, sumar } from '@bot/areas/laboratorio/calculos.js';

export { valor, sumar, totalExamen, totalProcedencia, totalCuadro, totalGeneral, casillasDe, casillasLlenas, filasDelMes } from '@bot/areas/laboratorio/calculos.js';
export { validar, avisosPendientes, REGLAS } from '@bot/areas/laboratorio/reglas.js';

/* ------------------------------------------------ correspondencia con DIRESA

   La sección A del consolidado de servicios intermedios (DIRESA) se llena con
   este reporte. DIRESA agrupa los exámenes de otra forma que el libro del área:
   cinco grupos con unos pocos ítems y «Otros», y Anatomía Patológica con el
   examen completo de orina aparte (así lo pide el formato: la orina no suma en
   bioquímicos). Esta tabla dice qué exámenes del libro van a cada ítem.

   Tres reglas:
     · cada examen del libro va, como mucho, a UN ítem: nada se cuenta dos veces;
     · las columnas de DIRESA son Hospitalización, Emergencia y Consulta externa.
       «Programa» (la tercera columna de Metaxénicas) va a Consulta externa, que
       es donde están los programas. Privado, Convenio e Insolvencia no tienen
       columna en DIRESA y no se suman: se dice en cada casilla;
     · lo que DIRESA no pide (Banco de Sangre, el procesamiento de Anatomía
       Patológica, las actividades) no va a ninguna casilla (SIN_DIRESA).

   Verificada contra `Campos_Formato_Servicios_Intermedios_DIRESA.pdf` (§ 4) el
   09/10/2026. Las asignaciones discutibles llevan su motivo al lado. */

const SERVICIO_DIRESA = Object.freeze({ hosp: ['hospitalizacion'], emerg: ['emergencia'], ce: ['c_externa', 'programa'] });

const de = (seccion, ...examenes) => examenes.map((examen) => Object.freeze([seccion, examen]));

export const DIRESA_LABORATORIO = Object.freeze({
  bioquimicos: Object.freeze({
    colesterol: de('bioquimica', 'colesterol'),
    glucosa: de('bioquimica', 'glucosa', 'glucosa_post_prandial', 'tolerancia_glucosa'),
    creatinina: de('bioquimica', 'creatinina'),
    bilirrubina: de('bioquimica', 'bilirrubina_total', 'bilirrubina_directa'),
    transaminasas: de('bioquimica', 'tgo', 'tgp'),
    fosfatasa: de('bioquimica', 'fosfatasa_alcalina'),
    trigliceridos: de('bioquimica', 'trigliceridos'),
    // HDL y LDL son fracciones del colesterol, pero se cuentan como exámenes aparte: van a «Otros».
    otros: de(
      'bioquimica', 'acido_urico', 'calcio', 'amilasa', 'fosforo', 'hemoglobina_glicosilada', 'depuracion_creatinina', 'microalbuminuria', 'urea',
      'proteinuria_24h', 'proteinas_totales', 'albumina', 'ggtp', 'dhl', 'pcr_cuantitativo', 'cpk_total', 'cpk_mb', 'hdl', 'ldl', 'aso',
      'factor_reumatoideo', 'hierro', 'lipasa', 'transferrina', 'complemento_c3', 'complemento_c4', 'gases_arteriales', 'electrolitos', 'lipidos_totales',
    ),
  }),
  hematologicos: Object.freeze({
    hemoglobina: de('hematologia', 'hemoglobina', 'hematocrito'),
    hemograma: de('hematologia', 'hemograma'),
    grupo: de('hematologia', 'grupo_factor'),
    // «Tiempo de sangría, coagulación y/o plaquetas»: el formato junta los tres.
    coagulacion: de('hematologia', 'coagulacion_sangria', 'plaquetas'),
    vsg: de('hematologia', 'vsg'),
    otros: de(
      'hematologia', 'coombs_directo', 'coombs_indirecto', 'lamina_periferica', 'constantes_corpusculares', 'reticulocitos',
      'tiempo_tromboplastina', 'tiempo_protrombina', 'inr', 'fibrinogeno', 'dimero_d',
    ),
  }),
  bacteriologicos: Object.freeze({
    urocultivo: de('microbiologia', 'urocultivo'),
    cultivos: [
      ...de('microbiologia', 'hemocultivo', 'cultivo_cateter', 'cultivo_secrecion', 'cultivo_bacteriano', 'coprocultivo', 'cultivo_hongos'),
      ...de('metaxenicas', 'cultivo_tb'),
    ],
    // Ziehl-Neelsen (BK) es la baciloscopía: la de líquidos y las de los programas de tuberculosis y lepra.
    bk: [...de('microbiologia', 'baciloscopia_liquidos'), ...de('metaxenicas', 'tuberculosis', 'leprae', 'baciloscopia_lepra')],
    gram: de('microbiologia', 'coloracion_gram'),
    otros: [...de('microbiologia', 'koh_hongos', 'tinta_china', 'ph_liquidos', 'citoquimico', 'recuento_celular'), ...de('metaxenicas', 'tosferina')],
  }),
  inmunoserologicos: Object.freeze({
    aglutinaciones: de('inmuno_serologicos', 'aglutinaciones'),
    serologicas: [
      ...de('inmuno_serologicos', 'rosa_bengala', 'h_pylori_igm', 'h_pylori_igg', 'rubeola', 'toxoplasma', 'cmv', 'vhs_1', 'vhs_2', 'dengue_igm', 'leptospira_ig'),
      ...de('metaxenicas', 'dengue_rapida', 'leptospira_rapida', 'elisa_dengue', 'otras_arbovirosis'),
    ],
    embarazo: de('inmuno_serologicos', 'bhcg_cualitativo'),
    vdrl: de('inmuno_serologicos', 'vdrl'),
    rpr: de('inmuno_serologicos', 'rpr'),
    elisa: de('inmuno_serologicos', 'ana_elisa'),
    vih: de('inmuno_serologicos', 'vih_rapida'),
    otros: [
      ...de(
        'inmuno_serologicos', 'anti_mpo', 'anti_pr3', 'anti_cardiolipina', 'anti_b2_glicoproteina', 'anti_ama', 'vhb_superficie_rapida', 'vhb_core_rapida',
        'vhc_rapida', 'vha_igm_rapida', 'vih_combo', 'hbsag', 'vhc_quimio', 'vha_igm_quimio', 'vhb_core_quimio', 'afp', 'cea', 'vitamina_b12', 'ca_19_9',
        'ca_15_3', 'ca_125', 'psa_total', 'psa_libre', 'bhcg_cuantitativo', 'procalcitonina', 'insulina', 'prolactina', 'progesterona', 'testosterona',
        't3_libre', 't4_libre', 'tsh', 'paratohormona', 'troponina_i', 'ferritina', 'acido_folico', 'cortisol', 'estradiol', 'lh', 'fsh', 'anti_ccp',
        'b2_microglobulina', 'ana_ena', 'acth', 'anca', 'dengue_ns1',
      ),
      ...de('metaxenicas', 'covid', 'covid_influenza', 'sarampion'),
    ],
  }),
  parasitologicos: Object.freeze({
    heces: de('uro_parasitologicos', 'heces_seriado', 'coproparasitologico_funcional', 'examen_directo_heces', 'baermann'),
    // La gota gruesa es el examen de malaria.
    gotaGruesa: de('metaxenicas', 'malaria'),
    otros: [
      ...de('uro_parasitologicos', 'test_graham', 'kinyoun', 'thevenon', 'rx_inflamatoria', 'sudan', 'benedict', 'h_pylori_heces', 'adenovirus_rotavirus'),
      ...de('metaxenicas', 'leishmania', 'metaxenicas_referencial', 'metaxenicas_varios'),
    ],
  }),
  anatomia: Object.freeze({
    pap: de('anatomia_patologica', 'pap'),
    // Histopatológicos: biopsias y piezas quirúrgicas (histología).
    biopsia: de('anatomia_patologica', 'biopsia', 'pieza_quirurgica'),
    autopsiaLegal: de('anatomia_patologica', 'autopsia_medico_legal'),
    autopsiaClinica: de('anatomia_patologica', 'autopsia_clinica'),
    // El formato DIRESA lleva la orina aparte, no dentro de bioquímicos ni parasitológicos.
    orina: de('uro_parasitologicos', 'examen_orina'),
  }),
});

/* Lo del libro que DIRESA no pide: no va a ninguna casilla. */
export const SIN_DIRESA = Object.freeze([
  ...de('anatomia_patologica', 'baaf', 'citologia_especial', 'tejidos_incluidos', 'cortes_tejidos', 'laminas_montadas', 'histoquimica', 'inmunohistoquimica'),
  ...de('banco_sangre', ...cuadro('banco_sangre').examenes.map((e) => e.clave)),
  ...de('actividades', 'programacion'),
]);

/* El valor de una casilla de DIRESA: la suma de sus exámenes en las
   procedencias de ese servicio. null si ninguno tiene dato (no es cero). */
export function valorDiresaLaboratorio(datos, grupo, item, servicio) {
  const fuentes = DIRESA_LABORATORIO[grupo]?.[item];
  if (!fuentes) return null;
  return sumar(
    fuentes.flatMap(([seccion, examen]) =>
      cuadro(seccion).procedencias.filter((p) => SERVICIO_DIRESA[servicio].includes(p.clave)).map((p) => valor(datos, seccion, `${examen}.${p.clave}`)),
    ),
  );
}

/* De dónde sale una casilla, para su tooltip: qué exámenes del libro suma. */
export function detalleDiresaLaboratorio(grupo, item) {
  const fuentes = DIRESA_LABORATORIO[grupo]?.[item] ?? [];
  const nombres = fuentes.map(([seccion, examen]) => cuadro(seccion).examenes.find((e) => e.clave === examen)?.etiqueta.toLowerCase() ?? examen);
  const muestra = nombres.length > 6 ? `${nombres.slice(0, 6).join(', ')} y ${nombres.length - 6} más` : nombres.join(', ');
  return `Reporte de Laboratorio: ${muestra}. Hospitalización, emergencia y consulta externa (con los programas); privado, convenio e insolvencia no tienen columna en DIRESA.`;
}

/* -------------------------------------------- estado de cada sección */

export function estadoDeFormato(idCuadro, datos, _periodo, validacion) {
  const llenas = casillasLlenas(datos, idCuadro);
  if (llenas === 0) return 'vacio';
  if (validacion.errores.some((e) => e.formato === idCuadro && e.regla !== 'incompleto')) return 'error';
  return llenas < filasDelMes(datos, idCuadro).length ? 'parcial' : 'ok';
}

export function notaDeFormato(idCuadro, datos) {
  const total = totalCuadro(datos, idCuadro);
  if (total == null) return 'Sin datos';
  const llenas = casillasLlenas(datos, idCuadro);
  const todas = filasDelMes(datos, idCuadro).length;
  return llenas < todas ? `${llenas} de ${todas} casillas` : `${total.toLocaleString('es-PE')} ${cuadro(idCuadro).unidad}`;
}
