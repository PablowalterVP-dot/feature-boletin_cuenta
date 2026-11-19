/* Datos sembrados de Costura y Lavandería.

   Julio de 2026 es un Excel real del área, leído celda por celda con el
   propio lector del bot (el mismo que usa para validar lo que se sube): los
   catorce servicios del Formato 1 día por día, los dos cuadros del Formato 3,
   las piezas y los insumos del Formato 4, y los dieciséis trabajos del
   Formato 2 de ese mes, con sus filas incompletas tal como están en el Excel
   (el bot las señala como aviso, no se completan aquí).

   Antes esta siembra usaba un oficio de junio de 2026 en papel, con el
   desglose diario simulado porque el escaneo no se podía leer con confianza.
   Ahora que se tienen los Excel reales del área (mayo, julio y agosto de
   2026, en `insumos/lavanderia/`, fuera del repositorio), julio se usa como
   ancla porque es el más limpio de los tres: no tiene los problemas reales
   que sí trae mayo (ver el comentario de `servidor/bot-validador/src/areas/
   lavanderia/oficial.js`: la fila UCI-CIRUGIA incompleta y siete piezas con
   un punto de miles mal tecleado).

   De los demás meses no hay Excel real: son variaciones de julio con un
   factor por periodo, igual que hacía esta siembra con junio antes. */

import { SERVICIOS, GRUPOS, INSUMOS } from './lavanderia.js';
import { diasDelMes } from '@/app/dominio/periodos.js';

export const PERIODO_CON_CIFRAS_REALES = '2026-07';

const r = (texto) => Object.freeze(texto.trim().split(/\s+/).map(Number));

/* Julio de 2026, día 1 a 31, leído del Excel real. */
const F1_JULIO = Object.freeze({
  'c-externos': r('34 64 15 26 12 20 8 12 20 23 35 23 29 30 16 51 24 32 16 12 29 27 28 12 30 19 12 16 10 12 13'),
  emergencia: r('18 10 10 9 8 12 9 14 10 40 10 13 16 28 13 8 8 19 8 8 16 16 17 9 18 15 18 8 17 13 18'),
  psiquiatria: r('10 12 9 9 10 10 12 8 12 9 12 11 10 11 12 10 12 8 15 14 12 16 14 10 8 10 9 6 11 10 5'),
  'med-general': r('75 80 76 100 95 77 76 84 83 90 88 79 84 96 82 79 52 77 71 57 64 72 75 65 65 79 64 73 66 64 68'),
  quemados: r('18 11 20 19 8 26 22 16 15 21 25 10 24 27 33 27 20 12 8 31 20 19 5 20 19 4 16 8 16 32 25'),
  'uci-medicina': r('14 30 23 26 18 33 40 33 30 23 22 18 31 35 12 15 20 33 16 10 25 55 13 47 18 26 44 20 23 29 22'),
  maternidad: r('17 31 18 24 14 25 31 31 28 29 21 15 24 24 21 17 24 18 10 27 13 17 18 31 18 15 23 16 23 19 18'),
  'c-obstetrico': r('19 21 16 17 12 26 13 23 25 28 22 8 25 34 16 15 22 15 16 16 25 22 13 15 10 18 12 28 18 15 25'),
  'pediatria-uci': r('36 28 25 29 20 62 39 38 41 35 38 15 38 46 29 52 39 31 24 61 38 44 28 46 31 23 32 34 35 33 28'),
  'neo-aloj': r('30 32 28 27 11 33 26 40 38 36 29 16 36 32 26 31 37 16 12 38 23 18 10 48 23 12 34 16 46 39 24'),
  ginecologia: r('38 34 24 20 17 27 30 12 21 34 41 20 27 20 25 27 26 13 20 27 27 20 19 15 19 18 16 16 24 9 12'),
  'c-quirurgico': r('162 108 160 180 78 62 103 150 102 155 94 76 107 124 126 116 133 160 50 83 132 153 77 113 137 50 61 88 87 68 106'),
  cirugia: r('17 14 21 15 8 26 23 13 16 16 16 13 10 20 14 14 15 16 11 23 13 11 6 16 17 8 17 16 21 14 10'),
  hemodialisis: r('30 46 30 36 26 20 48 30 30 30 33 13 48 24 20 59 30 33 18 32 47 30 30 30 30 30 15 30 19 22 30'),
});

const F3_JULIO = Object.freeze({
  comun: r('500 500 470 500 320 450 460 485 450 540 470 320 490 530 400 500 450 453 280 410 460 500 330 450 420 300 350 3250 400 350 380'),
  sucia: r('18 21 15 37 17 10 20 23 21 29 16 10 19 21 45 21 12 30 15 29 24 20 23 27 23 27 23 25 16 29 24'),
});

const PIEZAS_JULIO = Object.freeze({
  emergencias: 822,
  'consul-externos': 1420,
  psiquiatria: 642,
  'med-uci-quemados': 6687,
  'maternidad-gineco': 2646,
  'centro-obstetrico': 110,
  'pediatria-uci': 2270,
  'neonato-aloj': 1876,
  'quirurgico-cirugia': 6748,
  hemodialisis: 1686,
});

/* Texto tal como lo trae el Excel real: idéntico en los tres meses
   revisados (mayo, julio y agosto de 2026), lo que hace sospechar que el
   área copia esta fila de un mes al siguiente en vez de volver a medir. Es un
   hallazgo en sí (ver definicion.js del bot), no un error de esta siembra. */
const INSUMOS_JULIO = Object.freeze({
  detergente: '16 BOLSAS DE 15 KG X MES',
  hipoclorito: '240 LITROS X 1 MES',
  jabon: '48 BARRAS X 1 MES',
  'bolsas-rojas': '16 PAQUETES D 140 LITROS X 1 MES',
  pinesol: '20 GALONES DE 5 LITROS C/U X 1 MES',
  guantes: '48 PARES DE GUANTES DOMESTICOS X 1 MES',
});

/* Los dieciséis trabajos de julio, tal como están en el Excel real: ocho de
   ellos sin su cantidad ni su servicio (filas 1, 2, 4, 6, 8, 11, 13, 14 del
   Excel). El bot los señala con el aviso «confeccion-incompleta»; no se
   completan aquí porque no son un dato que esta siembra conozca. */
const CONFECCION_JULIO = Object.freeze([
  { descripcion: 'CAMILLA', confeccion: null, servicio: null, tela: null },
  { descripcion: 'BATAS', confeccion: null, servicio: null, tela: null },
  { descripcion: 'CORTINAS', confeccion: '2 UNIDDADES', servicio: 'GINECOLOGIA', tela: 'TAPASOL' },
  { descripcion: 'CAMPOS SIMPLES', confeccion: null, servicio: 'GINECOLOGIA', tela: 'TAPASOL' },
  { descripcion: 'DRESSING', confeccion: '5517 UNIDADES', servicio: 'CENTRO QUIRURGICO', tela: 'GSA' },
  { descripcion: 'SABANAS', confeccion: null, servicio: 'CENTRO QUIRURGICO', tela: 'GSA' },
  { descripcion: 'TOALLAS', confeccion: '8 UNIDADES', servicio: 'ADULTO MAYOR', tela: 'FELPA BLANCA' },
  { descripcion: 'PONCHOS', confeccion: null, servicio: 'ADULTO MAYOR', tela: 'FELPA BLANCA' },
  { descripcion: 'SOLERAS', confeccion: '12 UNIDADES', servicio: 'CIRUGIA', tela: 'DRILL VERDE' },
  { descripcion: 'CAMPOS', confeccion: '30 UNIDADES', servicio: 'CIRUGIA', tela: 'DRILL VERDE' },
  { descripcion: 'BATAS NIÑO', confeccion: null, servicio: 'PEDIATRIA', tela: 'POPELINA' },
  { descripcion: 'CAMPOS', confeccion: null, servicio: 'PEDIATRIA', tela: 'POPELINA' },
  { descripcion: 'PAÑAL', confeccion: '24 UNIDADES', servicio: 'NEONATOLOGIA', tela: 'FRANELA' },
  { descripcion: 'CONJUNTO', confeccion: null, servicio: 'NEONATOLOGIA', tela: 'FRANELA' },
  { descripcion: 'CAMPO', confeccion: '10 UNIDADES', servicio: 'CENTRO OBSTETRICO', tela: 'DRILL BLANCO' },
  { descripcion: 'SABANITA', confeccion: null, servicio: 'CENTRO OBSTETRICO', tela: 'DRILL BLANCO' },
]);

/* --------------------------------------------------------- azar determinista */

function semilla(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* Congruencial lineal: basta para dar variedad y no depende de Math.random,
   que haría que la demostración cambiara en cada recarga. */
function siguiente(estado) {
  const s = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
  return [s, s / 4294967296];
}

/* Reparte un total entre los días con pesos entre 0,7 y 1,3. El resto de la
   división se distribuye de uno en uno, así que **la suma es exacta**. */
function repartir(total, dias, clave) {
  if (total == null || dias === 0) return [];

  let estado = semilla(clave);
  const pesos = Array.from({ length: dias }, () => {
    const [s, p] = siguiente(estado);
    estado = s;
    return 0.7 + p * 0.6;
  });

  const suma = pesos.reduce((a, b) => a + b, 0);
  const valores = pesos.map((p) => Math.floor((total * p) / suma));

  let resto = total - valores.reduce((a, b) => a + b, 0);
  for (let i = 0; resto > 0; i = (i + 1) % valores.length) {
    valores[i] += 1;
    resto -= 1;
  }
  return valores;
}

/* Factor del periodo: julio es el mes real y vale 1; los demás varían entre
   0,88 y 1,12 de forma estable. */
function factorDe(periodo) {
  if (periodo === PERIODO_CON_CIFRAS_REALES) return 1;
  const [, p] = siguiente(semilla(`factor-${periodo}`));
  return 0.88 + p * 0.24;
}

function escalar(valor, factor) {
  return Math.max(1, Math.round(valor * factor));
}

/* ------------------------------------------------------------------ siembra */

export function datosDeLavanderia(periodo) {
  const n = diasDelMes(periodo);
  const esReal = periodo === PERIODO_CON_CIFRAS_REALES;
  const factor = factorDe(periodo);

  /* Formato 1: en julio, las cifras reales; en los demás, el total de julio
     escalado y repartido entre los días con ruido determinista. */
  const f1 = Object.fromEntries(
    SERVICIOS.filter((s) => !s.ocasional).map((s) => {
      if (esReal) return [s.clave, F1_JULIO[s.clave]];
      const total = escalar(F1_JULIO[s.clave].reduce((a, b) => a + b, 0), factor);
      return [s.clave, repartir(total, n, `${periodo}-${s.clave}`)];
    }),
  );

  /* Formato 3: en julio, las cifras reales (no cuadran en kilos con el
     Formato 1: es una diferencia real del Excel de julio, no un error de esta
     siembra). En los demás meses, se reparte con la misma proporción que
     julio entre las dos categorías, sobre el total del Formato 1 de ese mes,
     para que al menos esos meses simulados cuadren entre sí. */
  let f3;
  if (esReal) {
    f3 = F3_JULIO;
  } else {
    const totalF1 = Object.values(f1).reduce((a, b) => a + b.reduce((x, y) => x + y, 0), 0);
    const totalComunJulio = F3_JULIO.comun.reduce((a, b) => a + b, 0);
    const totalSuciaJulio = F3_JULIO.sucia.reduce((a, b) => a + b, 0);
    const proporcionComun = totalComunJulio / (totalComunJulio + totalSuciaJulio);
    const kgComun = Math.round(totalF1 * proporcionComun);
    const kgSucia = totalF1 - kgComun;
    f3 = { comun: repartir(kgComun, n, `${periodo}-comun`), sucia: repartir(kgSucia, n, `${periodo}-sucia`) };
  }

  /* Formato 4: las piezas se digitan, así que se siembran como cifra del mes.
     Los insumos del Excel real se repiten iguales mes a mes (ver el
     comentario de arriba); se siembran igual en los meses simulados. */
  const piezas = Object.fromEntries(GRUPOS.map((g) => [g.clave, escalar(PIEZAS_JULIO[g.clave], factor)]));
  const insumos = Object.fromEntries(INSUMOS.map((i) => [i.clave, INSUMOS_JULIO[i.clave]]));

  /* Formato 2: en julio, los dieciséis trabajos reales, con sus filas
     incompletas; en los demás, una parte de ellos (la costura no produce lo
     mismo todos los meses), completando lo que falte para que el mes
     simulado no muestre el mismo aviso de incompletitud sin motivo. */
  const f2 = esReal
    ? CONFECCION_JULIO.map((t, i) => ({ ...t, fila: 5 + i, iten: i + 1 }))
    : (() => {
        const cuantos = 3 + (semilla(periodo) % 6);
        return CONFECCION_JULIO.filter((t) => t.confeccion != null)
          .slice(0, cuantos)
          .map((t, i) => ({ ...t, fila: 5 + i, iten: i + 1, confeccion: `${escalar(Number(t.confeccion.match(/\d+/)[0]), factor)} UNIDADES` }));
      })();

  /* UCI-CIRUGIA no se siembra en ningún mes (ni julio, el real, la trae): se
     declara ausente, no vacía, para que el bot no la exija como una fila
     presente sin ningún día registrado (ver reglas.js del bot). */
  return { f1, f2, f3, f4: { piezas, insumos }, ausentes: { f1: ['uci-cirugia'] } };
}
