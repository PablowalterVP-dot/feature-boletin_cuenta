/* El oficio de Diagnóstico por Imágenes en Word: formato en blanco y ejemplos.

   Las mismas tablas del oficio real, en el mismo orden y con los mismos
   rótulos (Rayos X, tomografía, mamografía, ecografía), sin membrete: el
   formato que el área descarga y los ejemplos de la demostración, que pasan
   por el mismo lector (lector.js) que un oficio real. Los totales que el
   oficio escribe se escriben con la suma, salvo que `opciones.escritos` diga
   otra cosa (los ejemplos con errores). */

import { mesOficial } from '../../periodos.js';
import { documento, parrafo, tabla, cifra } from '../../docx-plantilla.js';
import { SERVICIOS, FINANCIADORES, datosVacios } from './definicion.js';
import { examenesDeFila, examenesF2, examenesF3, examenesF4, totalesCuadro, celda } from './calculos.js';

export const VERSION_PLANTILLA = 'DXI-W1';

export function nombreDeArchivo(periodo) {
  return `IMAGENES_${mesOficial(periodo)}_${periodo.slice(0, 4)}.docx`;
}

const b = (t, span = 1) => ({ t, b: true, span });
const soles = (v) => (v == null ? '' : `S/. ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ROTULO_SERVICIO = Object.freeze({ ce: 'CONSULTORIO EXTERNO', emerg: 'EMERGENCIA', hosp: 'HOSPITALIZACION' });
const mayus = (t) => String(t ?? '').toUpperCase();

export function crearPlantilla(periodo, datosRecibidos = null, opciones = {}) {
  const lleno = Boolean(datosRecibidos);
  const datos = datosRecibidos ?? datosVacios();
  const { f1, f2, f3, f4 } = datos;
  const w = opciones.escritos ?? {};
  const v = (x) => (lleno ? cifra(x) : '');
  const mes = `${mesOficial(periodo)} ${periodo.slice(0, 4)}`;
  const personas = (lista) => (lista ?? []).map((p) => [mayus(p.nombre), v(p.cantidad)]);
  const matrizEnFilas = (m, rotulos) => FINANCIADORES.map((f) => [[b(rotulos[f.clave]), b('CANTIDAD')], ...SERVICIOS.map((s) => [ROTULO_SERVICIO[s.clave], v(celda(m, f.clave, s.clave))])]);

  const bloques = [
    parrafo('DEPARTAMENTO DE DIAGNOSTICO POR IMÁGENES', true),
    parrafo('SERVICIO DE RAYOS X', true),
    parrafo(`MES DE ${mes}`, true),
    tabla([
      [b('DETALLE DE LOS EXAMENES RELAIZADOS'), b('CANTIDAD')],
      ['EXAMENES ATENDIDOS', v(w.atendidos ?? examenesF4(f4))],
      ['TOTAL DE PACIENTES', v(f4.pacientes)],
      ['NRO DE PLACAS RADIOGRAFICAS', v(f4.placas)],
      ['EXAMENS DE HOSPITALIZACION', v(f4.examenes?.hosp)],
      ['EXAMENES POR EMERGENCIA', v(f4.examenes?.emerg)],
      ['EXAMENES POR CONSULTA EXTERNA', v(f4.examenes?.ce)],
    ]),
    parrafo('EXAMENES REALIZADOS POR:'),
    tabla([
      [b('NOMBRES - APELLIDOS'), b('CANTIDAD')],
      ...personas(f4.tecnologos),
      [b('P A R T I C U L A R E S', 2)],
      ['PACIENTES PARTICULARES', v(f4.particulares)],
      ['TOTAL DE EXAMENES EN SOLES', lleno ? soles(f4.monto) : ''],
    ]),
    tabla([[b('LECTURA E INFORME DE RAYOS X')]]),
    tabla([[b('DATOS'), b('CANTIDAD')], ...personas(f4.informes)]),

    parrafo('DEPARTAMENTO DE DIAGNOSTICO POR IMÁGENES', true),
    parrafo(`EXAMENES TOMOGRAFICOS MES DE ${mes}`, true),
    tabla([[b('DETALLE DE LOS EXAMENES RELAIZADOS'), b('CANTIDAD')], ['TOTAL EXAMENES', v(w.tac ?? examenesF2(f2))], ['TOTAL PACIENTES', v(f2.pacientes)]]),
    ...matrizEnFilas(f2.examenes, { sis: 'EXAMENES SIS', convenio: 'CONVENIOS', pagado: 'PAGADOS' }).map((filas) => tabla(filas)),
    tabla([['TOTAL S/.', lleno ? soles(f2.monto) : '']]),
    parrafo('TOMOGRAFIAS INFORMADAS'),
    tabla([[b('DATOS'), b('CANTIDAD')], ...personas(f2.informes)]),
    ...(f2.inoperativo ? [parrafo(`NOTA : ${mayus(f2.nota || 'TOMOGRAFO INOPERATIVO')}`, true)] : []),

    parrafo('DEPARTAMENTO DE DIAGNOSTICO POR IMÁGENES', true),
    parrafo(`EXAMENES MAMOGRAFICOS MES DE ${mes}`, true),
    tabla([[b('DETALLE DE LOS EXAMENES RELAIZADOS'), b('CANTIDAD')]]),
    tabla([['TOTAL EXAMENES', v(w.mam ?? examenesF3(f3))], ['TOTAL PACIENTES', v(f3.pacientes)]]),
    tabla(FINANCIADORES.flatMap((f) => [[b({ sis: 'S.I.S.', convenio: 'CONVENIO', pagado: 'PAGADO' }[f.clave]), '']].concat(SERVICIOS.map((s) => [ROTULO_SERVICIO[s.clave], v(celda(f3.examenes, f.clave, s.clave))])))),
    tabla([[mayus(f3.campanaRotulo) || 'CAMPAÑA', v(f3.campana)]]),
    tabla([['TOTAL S/.', lleno ? soles(f3.monto) : '']]),
    parrafo('LECTURA E INFORME DE MAMOGRAFIAS'),
    tabla([[b('DATOS'), b('CANTIDAD')], ...personas(f3.informes)]),

    parrafo(`EXAMENES ECOGRAFICOS ${mes}`, true),
    tabla(ecografia(f1, lleno, w)),
  ];
  return documento(bloques, { horizontal: true });
}

function ecografia(f1, lleno, w) {
  const v = (x) => (lleno ? cifra(x) : '');
  const fila = (f, i, cuadro) => [
    mayus(f.nombre),
    v(w.exam?.[`${cuadro}.${i}`] ?? examenesDeFila(f)),
    v(f.pacientes),
    ...FINANCIADORES.flatMap((fz) => SERVICIOS.map((s) => v(celda(f.examenes, fz.clave, s.clave)))),
    lleno ? soles(f.monto) : '',
  ];
  const t = totalesCuadro(f1.examenes);
  /* Como el área: la EXAM de la fila T O T A L suma las EXAM escritas. */
  const examEscrita = (f1.examenes ?? []).reduce((a, f, i) => a + (w.exam?.[`examenes.${i}`] ?? examenesDeFila(f) ?? 0), 0);
  const total = [
    b('T O T A L'), v(t.examenes == null ? null : examEscrita), v(t.pacientes),
    ...FINANCIADORES.flatMap((fz) => SERVICIOS.map((s) => v(celda(t.matriz, fz.clave, s.clave)))),
    lleno ? soles(t.monto) : '',
  ];
  return [
    [b('PROFESIONALES'), b('EXAM'), b('TOTAL'), b('S.I.S.', 3), b('CONVENIOS', 3), b('PAGADOS', 3), b('MONTO')],
    ['', '', b('PCTS'), 'C/ EXT', 'EMER', 'HOSP', 'C.E X', 'EMER', 'HOS', 'C.EX', 'EMER', 'HOS', b('TOTAL')],
    ...(f1.examenes ?? []).map((f, i) => fila(f, i, 'examenes')),
    total,
    [b('EXAMENES BIOPSIAS', 13)],
    ...(f1.biopsias ?? []).map((f, i) => fila(f, i, 'biopsias')),
    [b('PROCEDIMIENTOS ONCOLOGICOS', 13)],
    ...(f1.oncologicos ?? []).map((f, i) => fila(f, i, 'oncologicos')),
  ];
}
