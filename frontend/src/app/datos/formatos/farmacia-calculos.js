/* Cálculos del reporte de Farmacia que usa el sistema.

   La aritmética (los totales que no se digitan, R1 a R4) y las reglas (R5 a
   R10, más las del Word) son del bot validador, que es quien lee el informe
   en Word del área: se reexportan de allí, para que el formulario, el visor
   de Estadística y el bot digan siempre lo mismo. Aquí queda lo que es del
   sistema: las cifras que van al tablero, a DIRESA y al Boletín, y el estado
   de cada formato en la barra de pasos.

   La ausencia de dato es `null` y nunca cero. */

import { COMPONENTES_SIS, OTROS_FINANCIADORES } from './farmacia.js';
import { validar as validarEnBot } from '@bot/areas/farmacia/reglas.js';
import { sumar, totalSis, totalConvenios, totalOtras, totalAtenciones, totalSop, totalF3, totalDe } from '@bot/areas/farmacia/calculos.js';
import { numero } from '@/app/dominio/formato.js';

export {
  anidar,
  sumar,
  totalSis,
  totalConvenios,
  totalOtras,
  totalAtenciones,
  celdaSop,
  hospitalizadosFila,
  hospitalizadosServicio,
  totalHospitalizadosSop,
  totalConveniosSop,
  totalSop,
  totalConsultasF3,
  totalConveniosF3,
  totalFilaF3,
  totalF3,
  totalDe,
} from '@bot/areas/farmacia/calculos.js';
export { REGLAS } from '@bot/areas/farmacia/reglas.js';

/* ----------------------------------------------- recetas despachadas

   La cifra que piden la DIRESA y el Boletín se puede leer de tres maneras, y
   en enero de 2026 dan tres números distintos:
     · Hospitalización + Emergencia + Consulta externa (SIS)  18 045
     · Total SIS                                              18 878
     · Total de atenciones                                    24 399
   Hoy la DIRESA y el Boletín usan la primera, que es la que este sistema ya
   usaba con las claves hosp, emerg y ce. Cuál corresponde está pendiente de
   confirmar con Estadística; mientras tanto, cada lugar que la muestra lo
   dice en su tooltip. */
export const LECTURA_RECETAS = 'Recetas despachadas = atenciones SIS de Hospitalización + Emergencia + Consulta externa del Formato 1 de Farmacia. No incluye hemodiálisis, oncología, convenios, programas ni boletas. Es una de tres lecturas posibles (las otras: total SIS o total de atenciones); cuál corresponde está pendiente de confirmar con Estadística.';

export function recetasDespachadas(f1) {
  return sumar(COMPONENTES_SIS.filter((c) => c.diresa).map((c) => f1?.sis?.[c.clave]));
}

/* Columna del consolidado DIRESA de servicios intermedios (hosp, emerg, ce). */
export function recetasDiresa(datos, servicio) {
  const componente = COMPONENTES_SIS.find((c) => c.diresa === servicio);
  return componente ? (datos?.f1?.sis?.[componente.clave] ?? null) : null;
}

export function detalleDiresaFarmacia(servicio) {
  const componente = COMPONENTES_SIS.find((c) => c.diresa === servicio);
  return `Formato 1 de Farmacia: atenciones SIS de ${componente?.label.toLowerCase() ?? servicio}. ${LECTURA_RECETAS}`;
}

/* ------------------------------------------------------- cifras del mes

   Lo que el tablero, el historial y la bandeja necesitan de un reporte. */
export function cifrasFarmacia(datos) {
  const f1 = datos?.f1 ?? {};
  return {
    atenciones: totalAtenciones(f1),
    sis: totalSis(f1),
    convenios: totalConvenios(f1),
    otras: totalOtras(f1),
    programas: f1.otros?.programas ?? null,
    boletas: f1.otros?.boletas ?? null,
    recetas: recetasDespachadas(f1),
    reparto: {
      sis: totalSis(f1),
      convenios: totalConvenios(f1),
      ...Object.fromEntries(OTROS_FINANCIADORES.map((o) => [o.clave, f1.otros?.[o.clave] ?? null])),
    },
    componentesSis: Object.fromEntries(COMPONENTES_SIS.map((c) => [c.clave, f1.sis?.[c.clave] ?? null])),
    sop: totalSop(datos?.f2),
    consultorios: totalF3(datos?.f3),
  };
}

/* ----------------------------------------------------------- validaciones

   Las reglas son las del bot (reglas.js), las mismas que aplica al leer el
   Word. Aquí solo se les da la forma que esperan las pantallas de las áreas
   levantadas: una lista con su nivel, más los errores y los avisos aparte. */
export function validar(datos, periodo) {
  const { errores, avisos, info } = validarEnBot(datos, periodo);
  const conNivel = (lista, nivel) => lista.map((h) => ({ ...h, nivel }));
  return {
    hallazgos: [...conNivel(errores, 'error'), ...conNivel(avisos, 'aviso'), ...conNivel(info, 'info')],
    errores: conNivel(errores, 'error'),
    avisos: conNivel(avisos, 'aviso'),
    info: conNivel(info, 'info'),
  };
}

export function hallazgosDe(validacion, idFormato) {
  return validacion.hallazgos.filter((h) => h.formato === idFormato);
}

/* Avisos que significan «falta algo», no «revise esto». Dejan el paso a medias. */
const INCOMPLETOS = new Set(['f1-blancos', 'f2-blancos', 'f3-blancos']);

export function estadoDeFormato(idFormato, datos, periodo, validacion) {
  /* El Formato 4 no tiene casillas hasta que el área diga qué contiene. */
  if (idFormato === 'f4') return 'vacio';
  /* Un formato sin empezar se ve vacío, no en error, aunque impida enviar. */
  if (validacion.errores.some((e) => e.formato === idFormato && !e.id.endsWith('-vacio'))) return 'error';
  if (totalDe(idFormato, datos) == null) return 'vacio';
  if (validacion.avisos.some((a) => a.formato === idFormato && INCOMPLETOS.has(a.id))) return 'parcial';
  return 'ok';
}

export function notaDeFormato(idFormato, datos) {
  if (idFormato === 'f4') return 'Por definir con el área';
  const t = totalDe(idFormato, datos);
  if (t == null) return 'Sin registrar';
  return `${numero(t)} ${t === 1 ? 'atención' : 'atenciones'}`;
}
