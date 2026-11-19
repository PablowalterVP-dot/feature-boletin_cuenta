/* Departamento de Lavandería: estructura de su reporte mensual.

   Es la del Excel oficial que el área llena cada mes («INFORME DE LAVANDERIA
   - PARA ESTADISTICA {MES} {AÑO}»: un libro por mes, revisados mayo, julio y
   agosto de 2026 celda por celda). A diferencia de Nutrición, el libro no
   nombra sus hojas («Hoja1».."Hoja4", y a veces una «Hoja6» vacía de sobra):
   el bot las reconoce por su contenido, no por su nombre (ver oficial.js).

   CUATRO CUADROS, DE TRES FORMAS DISTINTAS
     f1  Kilogramos por servicio   DIARIA  servicio × día (como Nutrición,
                                           sin el desdoble en comidas: una
                                           sola cifra por servicio y día)
     f2  Trabajos de confección    MENSUAL lista libre de trabajos (no es
                                           una cuadrícula: cada fila es un
                                           trabajo con su propia descripción)
     f3  Ropa sucia (precio)       DIARIA  un día, dos categorías (común y
                                           sucia) con su tarifa por kilo
     f4  Piezas e insumos          MENSUAL piezas por grupo de servicios +
                                           seis insumos de limpieza

   SOLO f1 SE CATALOGA EN LA BASE (decisión del 14/10/2026, documentada en
   `servidor/api/app/herramientas/cargar_catalogo_lavanderia.py`): el formato
   «LAV» es de granularidad diaria y esa granularidad es del formato, no del
   cuadro (ver `cargas.py::_filas_valor`). f1 es el único cuadro día-por-día
   de verdad y es el que alimenta el Consolidado §D de DIRESA (kilos de ropa
   lavada, agrupados por servicio). f2, f3 y f4 se leen, se validan (sus
   reglas corren igual, en reglas.js) y quedan enteros en `carga.informe_bot`
   para que Estadística los vea, pero no tienen fila `indicador` ni `valor`:
   no son casillas que la base deba rastrear una por una.

   CATORCE SERVICIOS, MÁS UNO OCASIONAL
   El área agrupa sus 14 servicios en cuatro bloques visuales del oficio
   (general, 2do piso, 3er piso, 4to piso: solo para la vista, no se suman
   aparte) y en diez GRUPOS para el consolidado (f4), que es como DIRESA
   quiere verlos. `UCI-CIRUGIA` solo aparece en mayo de 2026, con 0 en todos
   los días: por su lugar en el oficio (junto a Centro Quirúrgico y Cirugía,
   y así lo agrupa f4: «CENTRO QUIRURGICO + UCI CIRUGIA + CIRUGIA») se cataloga como un
   servicio más del grupo quirúrgico-cirugía, ocasional como Patrimonio en
   Nutrición: si un mes no trae su fila, no es una casilla vacía, es que ese
   mes no tuvo movimiento (o no se abrió esa cama).

   Los rótulos de abajo son los del Excel real, con sus erratas: «HEMODILASIS»
   (por Hemodiálisis) y «PEDIATRIA UCI - P» (el oficio corta ahí el rótulo) se
   repiten igual en los tres meses revisados: son el vocabulario real del
   área, no un error de tipeo de un solo mes. Se leen tal cual, no se
   corrigen: corregirlos en silencio escondería que el oficio real los trae
   así. */

/* Un servicio del cuadro f1 (kilos por día). `grupo`: a cuál de los GRUPOS de
   abajo pertenece, para el consolidado f4. */
function servicio(clave, rotulo, bloque, grupo, { ocasional = false, ayuda } = {}) {
  return Object.freeze({ clave, rotulo, bloque, grupo, ocasional, ayuda });
}

export const BLOQUES = Object.freeze([
  Object.freeze({ id: 'general', label: null }),
  Object.freeze({ id: '2do-piso', label: '2 DO PISO' }),
  Object.freeze({ id: '3er-piso', label: '3ER PISO' }),
  Object.freeze({ id: '4to-piso', label: '4TO PISO' }),
]);

export const SERVICIOS = Object.freeze([
  servicio('c-externos', 'C. EXTERNOS', 'general', 'consul-externos'),
  servicio('emergencia', 'EMERGENCIA', 'general', 'emergencias'),
  servicio('psiquiatria', 'PSIQUIATRIA', '2do-piso', 'psiquiatria'),
  servicio('med-general', 'MED. GENERAL', '2do-piso', 'med-uci-quemados'),
  servicio('quemados', 'QUEMADOS', '2do-piso', 'med-uci-quemados'),
  servicio('uci-medicina', 'UCI-MEDICINA', '2do-piso', 'med-uci-quemados'),
  servicio('maternidad', 'MATERNIDAD', '3er-piso', 'maternidad-gineco'),
  servicio('c-obstetrico', 'C. OBSTETRICO', '3er-piso', 'centro-obstetrico'),
  servicio('pediatria-uci', 'PEDIATRIA UCI - P', '3er-piso', 'pediatria-uci'),
  servicio('neo-aloj', 'NEO + ALOJ.CONJ.', '3er-piso', 'neonato-aloj'),
  servicio('ginecologia', 'GINECOLOGIA', '4to-piso', 'maternidad-gineco'),
  servicio('c-quirurgico', 'C. QUIRURGICO', '4to-piso', 'quirurgico-cirugia'),
  servicio('cirugia', 'CIRUGIA', '4to-piso', 'quirurgico-cirugia'),
  servicio('hemodialisis', 'HEMODILASIS', '4to-piso', 'hemodialisis'),
  servicio('uci-cirugia', 'UCI-CIRUGIA', '4to-piso', 'quirurgico-cirugia', {
    ocasional: true,
    ayuda: 'Solo figura en el Excel de mayo de 2026, con 0 en todos los días. Se cataloga por si vuelve a usarse; si un mes no la trae, no se cuenta como casilla por llenar.',
  }),
]);

export function serviciosDelGrupo(claveGrupo) {
  return SERVICIOS.filter((s) => s.grupo === claveGrupo);
}

/* Los diez grupos del consolidado (f4), como los pide DIRESA: la fila
   «CONSUL. EXTEERNOS» del Excel real está mal escrita (dos E) y así se
   deja. */
export const GRUPOS = Object.freeze([
  Object.freeze({ clave: 'emergencias', rotulo: 'EMERGENCIAS' }),
  Object.freeze({ clave: 'consul-externos', rotulo: 'CONSUL. EXTEERNOS' }),
  Object.freeze({ clave: 'psiquiatria', rotulo: 'PSIQUIATRIA' }),
  Object.freeze({ clave: 'med-uci-quemados', rotulo: 'MED. GENERAL + UCI +QUEMADOS' }),
  Object.freeze({ clave: 'maternidad-gineco', rotulo: 'MATERNIDAD +GINECOLOGIA' }),
  Object.freeze({ clave: 'centro-obstetrico', rotulo: 'CENTRO OBSTETRICO' }),
  Object.freeze({ clave: 'pediatria-uci', rotulo: 'PEDIATRIA + UCI PEDIATRIA' }),
  Object.freeze({ clave: 'neonato-aloj', rotulo: 'NEONATOLOGIA +ALOJ. CONJUNTO' }),
  Object.freeze({ clave: 'quirurgico-cirugia', rotulo: 'CENTRO QUIRURGICO + UCI CIRUGIA + CIRUGIA' }),
  Object.freeze({ clave: 'hemodialisis', rotulo: 'HEMODIALISIS' }),
]);

/* Las dos tarifas de ropa sucia (f3): comentario de la pregunta que sigue
   abierta, igual que en el modelo simulado anterior
   (`frontend/src/app/datos/formatos/lavanderia.js`): el oficio no explica qué
   distingue «ropa sucia común» de «ropa sucia» a secas; solo que la segunda
   paga media vez más por kilo. Se lee tal cual trae el Excel: dos columnas,
   cada una con su cifra y su precio. */
export const TARIFAS = Object.freeze([
  Object.freeze({ clave: 'comun', rotulo: 'ROPA SUCIA  COMUN', tarifa: 3 }),
  Object.freeze({ clave: 'sucia', rotulo: 'ROPA SUCIA', tarifa: 4.5 }),
]);

/* Los seis insumos de limpieza (f4), con el texto exacto del Excel real: en
   los tres meses revisados (mayo, julio, agosto de 2026) viene palabra por
   palabra igual, cantidad incluida. Es un hallazgo en sí (ver oficial.js):
   puede que el área copie la fila de un mes al siguiente en vez de volver a
   medir, y conviene que Estadística lo sepa, no que el bot lo oculte. */
export const INSUMOS = Object.freeze([
  Object.freeze({ clave: 'detergente', rotulo: 'DETERGENTE INDUSTRIAL' }),
  Object.freeze({ clave: 'hipoclorito', rotulo: 'HIPOCLORITO DE SODIO' }),
  Object.freeze({ clave: 'jabon', rotulo: 'BARRAS DE JABON' }),
  Object.freeze({ clave: 'bolsas-rojas', rotulo: 'BOLSA DE ROJAS DE 140 LITROS' }),
  Object.freeze({ clave: 'pinesol', rotulo: 'PINESOL' }),
  Object.freeze({ clave: 'guantes', rotulo: 'GUANTES' }),
]);

/* Los cuatro cuadros, para mostrarlos y para la firma y la variación mensual
   (motor.js). Solo f1 tiene fila `indicador` en la base (ver el comentario
   de arriba): los otros tres igual entran aquí, para que un cambio en ellos
   no deje una firma obsoleta y para que, si algún día se decide llevarles la
   variación mes a mes, ya tengan su cuadro. */
export const FORMATOS = Object.freeze([
  Object.freeze({
    id: 'f1',
    numero: 1,
    titulo: 'Kilogramos por servicio',
    corto: 'Kilos por servicio',
    descripcion: 'Kilogramos de ropa lavada cada día, por servicio del hospital.',
    unidad: 'kilogramos',
    periodicidad: 'diaria',
    filas: SERVICIOS.map((s) => Object.freeze({ clave: s.clave, rotulo: s.rotulo, grupo: s.grupo, ocasional: s.ocasional })),
  }),
  Object.freeze({
    id: 'f2',
    numero: 2,
    titulo: 'Trabajos de confección',
    corto: 'Confección',
    descripcion: 'Prendas y ropa de cama confeccionadas o reparadas por Costura y Ropería.',
    unidad: 'trabajos',
    periodicidad: 'mensual',
  }),
  Object.freeze({
    id: 'f3',
    numero: 3,
    titulo: 'Ropa sucia',
    corto: 'Ropa sucia',
    descripcion: 'Kilogramos de ropa sucia recibidos cada día, por tarifa (común o sucia).',
    unidad: 'kilogramos',
    periodicidad: 'diaria',
  }),
  Object.freeze({
    id: 'f4',
    numero: 4,
    titulo: 'Piezas e insumos',
    corto: 'Piezas e insumos',
    descripcion: 'Piezas de ropa lavadas por grupo de servicios e insumos de limpieza usados en el mes.',
    unidad: 'piezas',
    periodicidad: 'mensual',
  }),
]);

export function formato(id) {
  return FORMATOS.find((f) => f.id === id) ?? null;
}

export function filaDe(idFormato, claveFila) {
  return formato(idFormato)?.filas?.find((f) => f.clave === claveFila) ?? null;
}

export function datosVacios() {
  return {};
}

export function claveCasilla(idFormato, claveFila, dia) {
  return `${idFormato}|${claveFila}|${dia}`;
}
