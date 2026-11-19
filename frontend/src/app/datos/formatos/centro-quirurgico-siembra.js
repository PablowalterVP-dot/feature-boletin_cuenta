/* Cifras simuladas del reporte de Centro Quirúrgico, para el prototipo.

   FICTICIAS, aunque la forma es la del libro real del área: los mismos
   procedimientos por especialidad (procedimientos.js del bot) y un volumen del
   orden de 2026 —muchas cesáreas y colecistectomías, una cola larga de
   procedimientos raros—. Son estables (azar.js: misma clave, misma cifra) y
   siguen el factor del periodo que comparten todas las áreas.

   Un mes simulado es COHERENTE: el RESUMEN y el cuadro de indicadores cuadran
   con las hojas por especialidad y las suspendidas con sus causas. Los
   descuadres del libro real (junio: «realizadas» 455 contra 442) no se
   inventan aquí: se ven con el ejemplo con errores (ejemplos-centro-quirurgico.js). */

import { PROCEDIMIENTOS_TIPICOS } from '@bot/areas/centro-quirurgico/procedimientos.js';
import { CAUSAS } from './centro-quirurgico.js';
import { aleatorio, factorDelPeriodo } from '../azar.js';

/* Lo que pesa un procedimiento frecuente en un mes típico; los demás van de 0 a 3. */
const FRECUENTES = Object.freeze({
  Cesarea: 90,
  'Cesarea + LBT': 55,
  'Colelap adulto': 36,
  'Apendicectomía Abierta': 26,
  'Reducción Cruenta (RAFI)': 16,
  'Hernioplastía': 12,
  'Limpiezas Quirúrgicas': 10,
  'Histerectomía Abdominal': 8,
  'Laparotomía Exploratoria': 5,
  'Exeresis': 5,
  'Legrado Uterino': 3,
});

/* Las causas que más suspenden, en un mes típico. */
const CAUSAS_TIPICAS = Object.freeze({ falta_tiempo: 4, presion_arterial: 2, ausencia_paciente: 2, mala_preparacion: 1, falta_insumos: 1 });

function simular(periodo) {
  const factor = factorDelPeriodo(periodo);
  const procedimientos = { mayor: {}, menor: {} };
  for (const tipo of ['mayor', 'menor']) {
    for (const [esp, lista] of Object.entries(PROCEDIMIENTOS_TIPICOS[tipo])) {
      procedimientos[tipo][esp] = lista.map((rotulo, i) => {
        const base = FRECUENTES[rotulo] ?? Math.floor(aleatorio(`cqx-${tipo}-${esp}-${i}`) * 3.4);
        const ruido = 0.85 + aleatorio(`cqx-${periodo}-${tipo}-${esp}-${i}`) * 0.3;
        return { rotulo, valor: Math.round(base * factor * ruido), fila: 0 };
      });
    }
  }
  const total = (tipo) => Object.values(procedimientos[tipo]).flat().reduce((a, p) => a + p.valor, 0);
  const especialidades = (tipo) => Object.fromEntries(Object.entries(procedimientos[tipo]).map(([esp, items]) => [esp, items.reduce((a, p) => a + p.valor, 0)]));

  // Casi la mitad de las mayores y una de cada diez menores son de emergencia.
  const mayor = total('mayor');
  const menor = total('menor');
  const mEmerg = Math.round(mayor * (0.44 + aleatorio(`cqx-${periodo}-emerg`) * 0.06));
  const nEmerg = Math.round(menor * 0.08);

  const suspendidas = Object.fromEntries(CAUSAS.filter((c) => !c.ocasional).map((c) => [c.clave, Math.round((CAUSAS_TIPICAS[c.clave] ?? 0) * factor * (0.5 + aleatorio(`cqx-${periodo}-susp-${c.clave}`)))]));
  const nSusp = Object.values(suspendidas).reduce((a, b) => a + b, 0);

  const horas = (clave, base) => Math.round(base * factor * (0.9 + aleatorio(`cqx-${periodo}-${clave}`) * 0.2) * 100) / 100;
  const resumen = {
    'mayores.programada': mayor - mEmerg, 'mayores.emergencia': mEmerg,
    'menores.programada': menor - nEmerg, 'menores.emergencia': nEmerg,
    'horas_programadas.programada': horas('hp-p', 36), 'horas_programadas.emergencia': horas('hp-e', 30),
    'horas_efectivas.programada': horas('he-p', 32), 'horas_efectivas.emergencia': horas('he-e', 26),
    'horas_acto.programada': horas('ha-p', 25), 'horas_acto.emergencia': horas('ha-e', 21),
    'suspendidas.programada': nSusp, 'suspendidas.emergencia': 0,
  };
  const programadas = resumen['mayores.programada'] + resumen['menores.programada'];
  const emergencia = mEmerg + nEmerg;
  const indicadores = {
    salas_utilizadas: 4, salas_emergencia: 1, salas_programadas: 3,
    intervenciones_emergencia: emergencia, intervenciones_programadas: programadas, intervenciones_suspendidas: nSusp,
    intervenciones_realizadas: programadas + emergencia,
    horas_efectivas: Math.round((resumen['horas_efectivas.programada'] + resumen['horas_efectivas.emergencia']) * 100) / 100,
    horas_programadas: Math.round((resumen['horas_programadas.programada'] + resumen['horas_programadas.emergencia']) * 100) / 100,
    reintervenidos: Math.round(aleatorio(`cqx-${periodo}-reint`) * 4), defunciones: 0,
  };

  return { resumen, indicadores, suspendidas, mayor: especialidades('mayor'), menor: especialidades('menor'), procedimientos };
}

/* `parcial`: un reporte abierto que todavía no tiene nada cargado. Se llena
   subiendo el Excel, así que el borrador empieza vacío. */
export function datosDeCentroQuirurgico(periodo, { parcial = false } = {}) {
  return parcial ? {} : simular(periodo);
}

/* No hay un mes con cifras reales del área en el prototipo: los libros del
   hospital no se versionan. */
export const PERIODO_CON_CIFRAS_REALES = null;
