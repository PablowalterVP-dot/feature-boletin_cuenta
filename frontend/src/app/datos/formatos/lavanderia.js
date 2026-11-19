/* Estructura de los cuatro formatos del Área de Costura y Lavandería.

   La define el bot validador (servidor/bot-validador/src/areas/lavanderia/definicion.js),
   porque es él quien genera la plantilla y lee el Excel real del área: si la
   estructura viviera también aquí, las dos copias acabarían diciendo cosas
   distintas (igual que Nutrición y Laboratorio).

   El bot guarda el `rotulo` tal como lo escribe el Excel real, en mayúsculas,
   porque es con eso que reconoce cada fila («C. EXTERNOS», «HEMODILASIS» con
   su errata). Para la pantalla, que necesita un nombre legible, se añade aquí
   un `nombre` por clave; si algún día se cataloga un servicio, grupo o insumo
   nuevo que no está en estas tablas, se usa su `rotulo` tal cual en vez de
   romper. */

export { BLOQUES, FORMATOS, formato, filaDe, claveCasilla, datosVacios } from '@bot/areas/lavanderia/definicion.js';
import { SERVICIOS as SERVICIOS_BOT, GRUPOS as GRUPOS_BOT, INSUMOS as INSUMOS_BOT, TARIFAS as TARIFAS_BOT } from '@bot/areas/lavanderia/definicion.js';
export { celdaDeOrigen } from '@bot/areas/lavanderia/oficial.js';

const NOMBRE_SERVICIO = Object.freeze({
  'c-externos': 'Consultorios externos',
  emergencia: 'Emergencia',
  psiquiatria: 'Psiquiatría',
  'med-general': 'Medicina general',
  quemados: 'Quemados',
  'uci-medicina': 'UCI Medicina',
  maternidad: 'Maternidad',
  'c-obstetrico': 'Centro obstétrico',
  'pediatria-uci': 'Pediatría y UCI Pediátrica',
  'neo-aloj': 'Neonatología y alojamiento conjunto',
  ginecologia: 'Ginecología',
  'c-quirurgico': 'Centro quirúrgico',
  cirugia: 'Cirugía',
  hemodialisis: 'Hemodiálisis',
  'uci-cirugia': 'UCI Cirugía',
});

/* Los catorce servicios del Formato 1 (más UCI Cirugía, ocasional), con su
   nombre legible. `grupo` es la fila del Formato 4 a la que suma cada uno. */
export const SERVICIOS = Object.freeze(SERVICIOS_BOT.map((s) => Object.freeze({ ...s, nombre: NOMBRE_SERVICIO[s.clave] ?? s.rotulo })));

const NOMBRE_GRUPO = Object.freeze({
  emergencias: 'Emergencias',
  'consul-externos': 'Consulta externa',
  psiquiatria: 'Psiquiatría',
  'med-uci-quemados': 'Medicina general, UCI y Quemados',
  'maternidad-gineco': 'Maternidad y Ginecología',
  'centro-obstetrico': 'Centro obstétrico',
  'pediatria-uci': 'Pediatría y UCI Pediátrica',
  'neonato-aloj': 'Neonatología y alojamiento conjunto',
  'quirurgico-cirugia': 'Centro quirúrgico, UCI Cirugía y Cirugía',
  hemodialisis: 'Hemodiálisis',
});

/* Las diez filas del consolidado. `servicios` no se escribe aquí: se deriva de
   SERVICIOS, para que no existan dos versiones de la misma agrupación. */
export const GRUPOS = Object.freeze(GRUPOS_BOT.map((g) => Object.freeze({ ...g, nombre: NOMBRE_GRUPO[g.clave] ?? g.rotulo })));

export function serviciosDelGrupo(claveGrupo) {
  return SERVICIOS.filter((s) => s.grupo === claveGrupo);
}

/* Tarifas del Formato 3, en soles por kilo. El bot las guarda como lista
   (`clave`, `rotulo`, `tarifa`); aquí se vuelven a indexar por clave, que es
   como las usa esta pantalla. Qué distingue una categoría de otra no está
   escrito en el oficio real: sigue pendiente de confirmar con el área. */
export const TARIFAS = Object.freeze(
  Object.fromEntries(
    TARIFAS_BOT.map((t) => [
      t.clave,
      Object.freeze({
        ...t,
        nombre: t.clave === 'comun' ? 'Ropa sucia común' : 'Ropa sucia',
        aclaracion:
          t.clave === 'comun'
            ? `Tarifa de S/ ${t.tarifa.toFixed(2)} por kilo. La diferencia con la otra categoría no consta en el Excel y está pendiente de confirmar con el área.`
            : `Tarifa de S/ ${t.tarifa.toFixed(2)} por kilo. Al ser más cara, es de suponer que corresponde a ropa contaminada o de manejo especial; falta confirmarlo.`,
      }),
    ]),
  ),
);

const NOMBRE_INSUMO = Object.freeze({
  detergente: 'Detergente industrial',
  hipoclorito: 'Hipoclorito de sodio',
  jabon: 'Barras de jabón',
  'bolsas-rojas': 'Bolsas rojas de 140 litros',
  pinesol: 'Pinesol',
  guantes: 'Guantes domésticos',
});

/* Insumos del Excel real, con su nombre legible. El bot guarda su cantidad
   como el texto libre que trae la celda («16 BOLSAS DE 15 KG X MES»): no se
   separa en número y unidad porque el Excel no lo escribe así de uniforme. */
export const INSUMOS = Object.freeze(INSUMOS_BOT.map((i) => Object.freeze({ ...i, nombre: NOMBRE_INSUMO[i.clave] ?? i.rotulo })));
