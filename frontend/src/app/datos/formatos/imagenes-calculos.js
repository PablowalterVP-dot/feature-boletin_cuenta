/* Cálculos y validaciones de los formatos de Diagnóstico por Imágenes.

   La aritmética (la regla de siempre: nada que se pueda calcular se digita)
   y las reglas son del bot validador, que lee el Word del oficio: se
   reexportan de allí desde el 27/10/2026, para que el formulario, el visor de
   Estadística y el bot digan lo mismo. Aquí queda lo que es del sistema: las
   cifras del tablero, del boletín y de Planeamiento, el reparto en DIRESA y
   el estado de cada formato en la barra de pasos.

   La ausencia de dato es `null` y nunca cero. En este oficio la diferencia es
   visible: el tomógrafo inoperativo reporta «0» —se midió y no hubo
   exámenes—, y eso no es lo mismo que una hoja que nadie llenó. */

import { SERVICIOS } from './imagenes.js';
import { validar as validarEnBot } from '@bot/areas/imagenes/reglas.js';
import {
  sumar, totalFinanciador, totalServicio, sumarMatrices, totalesCuadro, examenesF2, examenesF3, examenesF4, examenesDe, totalPersonas,
} from '@bot/areas/imagenes/calculos.js';
import { numero } from '@/app/dominio/formato.js';

export {
  sumar, celda, totalFinanciador, totalServicio, totalMatriz, casillasEnBlanco, sumarMatrices, examenesDeFila, filaTieneCifras,
  totalesCuadro, examenesF1, examenesF2, examenesF3, examenesF4, totalPersonas, examenesDe,
} from '@bot/areas/imagenes/calculos.js';
export { REGLAS } from '@bot/areas/imagenes/reglas.js';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/* ------------------------------------------------------- cifras del mes

   Lo que el tablero, el historial y la bandeja necesitan de un reporte. */
export function cifrasImagenes(datos) {
  const { f1 = {}, f2 = {}, f3 = {}, f4 = {} } = datos ?? {};
  const eco = totalesCuadro(f1.examenes);
  const bio = totalesCuadro(f1.biopsias);
  const onc = totalesCuadro(f1.oncologicos);

  const modalidades = {
    rayosX: examenesF4(f4),
    ecografia: eco.examenes,
    mamografia: examenesF3(f3),
    tomografia: examenesF2(f2),
    biopsias: bio.examenes,
    oncologicos: onc.examenes,
  };

  /* Rayos X no desglosa por financiamiento en su hoja: queda fuera de este
     reparto y la pantalla lo dice. */
  const matriz = sumarMatrices([eco.matriz, bio.matriz, onc.matriz, f2.examenes, f3.examenes]);

  return {
    examenes: sumar(Object.values(modalidades)),
    pacientes: sumar([eco.pacientes, bio.pacientes, onc.pacientes, f2.pacientes, f3.pacientes, f4.pacientes]),
    monto: sumar([eco.monto, bio.monto, onc.monto, f2.monto, f3.monto, f4.monto]),
    informes: sumar([totalPersonas(f2.informes), totalPersonas(f3.informes), totalPersonas(f4.informes)]),
    modalidades,
    financiamiento: {
      sis: totalFinanciador(matriz, 'sis'),
      convenio: totalFinanciador(matriz, 'convenio'),
      pagado: totalFinanciador(matriz, 'pagado'),
      campana: f3.campana ?? null,
    },
    servicio: Object.fromEntries(SERVICIOS.map((s) => [s.clave, sumar([totalServicio(matriz, s.clave), f4.examenes?.[s.clave]])])),
    tomografoInoperativo: Boolean(f2.inoperativo),
  };
}

/* --------------------------------------------------------------- DIRESA

   Cómo se reparten los cuatro formatos en las seis filas de la sección B del
   consolidado de servicios intermedios. Fotoradiografías y placas dentales no
   figuran en el oficio: van vacías, no en cero. Mamografías, biopsias y
   procedimientos oncológicos van en «Otros»; la campaña de mamografía, en
   consulta externa. Las dos asignaciones son supuestos por confirmar. */
export const DETALLE_DIRESA = Object.freeze({
  fotoradiograficos: 'El oficio de Diagnóstico por Imágenes no reporta fotoradiografías: la celda queda vacía, no en cero.',
  radiograficos: 'Formato 4 de Imágenes (Rayos X): exámenes del servicio.',
  ecograficos: 'Formato 1 de Imágenes: exámenes ecográficos de todos los médicos, sumando SIS, convenios y pagados.',
  tomograficos: 'Formato 2 de Imágenes: exámenes tomográficos del servicio.',
  dentales: 'El oficio de Diagnóstico por Imágenes no reporta placas dentales: la celda queda vacía, no en cero.',
  otros: 'Mamografías (Formato 3, con la campaña en consulta externa), biopsias y procedimientos oncológicos (Formato 1). Asignación por confirmar con DIRESA.',
});

export function valorDiresa(datos, item, servicio) {
  const { f1 = {}, f2 = {}, f3 = {}, f4 = {} } = datos ?? {};
  switch (item) {
    case 'radiograficos':
      return f4.examenes?.[servicio] ?? null;
    case 'ecograficos':
      return totalServicio(totalesCuadro(f1.examenes).matriz, servicio);
    case 'tomograficos':
      return totalServicio(f2.examenes, servicio);
    case 'otros':
      return sumar([
        totalServicio(totalesCuadro(f1.biopsias).matriz, servicio),
        totalServicio(totalesCuadro(f1.oncologicos).matriz, servicio),
        totalServicio(f3.examenes, servicio),
        servicio === 'ce' ? (f3.campana ?? null) : null,
      ]);
    default:
      return null;
  }
}

/* ----------------------------------------------------------- validaciones

   Las reglas son las del bot (reglas.js), las mismas que aplica al leer el
   Word. Aquí solo se les da la forma que esperan las pantallas. */
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
const INCOMPLETOS = new Set(['f1-sin-registrar', 'f1-blancos', 'f2-blancos', 'f3-blancos', 'f4-servicios-blancos', 'f4-placas']);

export function estadoDeFormato(idFormato, datos, periodo, validacion) {
  /* Un formato sin empezar se ve vacío, no en error, aunque impida enviar. */
  if (validacion.errores.some((e) => e.formato === idFormato && !e.id.endsWith('-vacio'))) return 'error';
  if (examenesDe(idFormato, datos) == null) return 'vacio';
  if (validacion.avisos.some((a) => a.formato === idFormato && INCOMPLETOS.has(a.id))) return 'parcial';
  return 'ok';
}

export function notaDeFormato(idFormato, datos) {
  const e = examenesDe(idFormato, datos);
  if (idFormato === 'f2' && datos?.f2?.inoperativo) return e ? `Inoperativo · ${plural(e, 'examen', 'exámenes')}` : 'Tomógrafo inoperativo';
  if (e == null) return 'Sin registrar';
  return `${numero(e)} ${e === 1 ? 'examen' : 'exámenes'}`;
}
