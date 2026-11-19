/* El informe mensual de Farmacia en Word: formato en blanco y ejemplos.

   Genera un .docx con los mismos cuadros que el informe real del área
   (`01_INFORME_MES_DE_ENERO_2026.docx`), en el mismo orden y con los mismos
   rótulos, para dos usos:
     · el formato que el área puede descargar si quiere partir de uno limpio,
       con el mes ya escrito en el asunto y en los títulos;
     · los ejemplos de la demostración y de las pruebas, con cifras ficticias,
       que pasan por el mismo lector (lector.js) que un informe real.

   No copia el membrete, las firmas ni los gráficos del original: solo lo que
   el bot lee. Los nombres van en blanco para que el área ponga los suyos. */

import { empaquetarZip } from '../../xlsx.js';
import { etiquetaPeriodo, mesOficial } from '../../periodos.js';
import { SERVICIOS_SOP, FILAS } from './definicion.js';
import { totalSis, totalConvenios, totalOtras, totalAtenciones, hospitalizadosFila, hospitalizadosServicio, totalHospitalizadosSop, totalConveniosSop, totalConsultasF3, totalConveniosF3 } from './calculos.js';

export const VERSION_PLANTILLA = 'FAR-W1';

export function nombreDeArchivo(periodo) {
  return `INFORME_FARMACIA_${mesOficial(periodo)}_${periodo.slice(0, 4)}.docx`;
}

const escapar = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cifra = (v) => (v == null ? '' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v));

const parrafo = (texto, negrita = false) =>
  `<w:p><w:r>${negrita ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapar(texto)}</w:t></w:r></w:p>`;
const celda = (texto, negrita = false) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${parrafo(texto, negrita)}</w:tc>`;
const fila = (celdas) => `<w:tr>${celdas.map((c) => (typeof c === 'object' && c ? celda(c.t, c.b) : celda(c))).join('')}</w:tr>`;
const tabla = (filas) =>
  `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${filas.map(fila).join('')}</w:tbl>`;

const b = (t) => ({ t, b: true });

function mesAnterior(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/* `datos` es el reporte (f1, f2, f3) o null para el formato en blanco.
   `opciones.anterior`: las cifras del mes anterior para su cuadro;
   `opciones.declarados`: totales escritos distintos de la suma, para los
   ejemplos con errores; `opciones.asunto`: otro periodo en el asunto. */
export function crearPlantilla(periodo, datos = null, opciones = {}) {
  const mes = mesOficial(periodo);
  const anio = periodo.slice(0, 4);
  const asunto = opciones.asunto ?? periodo;
  const previo = mesAnterior(periodo);
  const f1 = datos?.f1 ?? {};
  const f2 = datos?.f2 ?? {};
  const f3 = datos?.f3 ?? {};
  const d = opciones.declarados ?? {};
  const t = (clave, calculado) => cifra(d[clave] !== undefined ? d[clave] : datos ? calculado : null);
  const v = (x) => cifra(x);

  const cuerpo = [
    parrafo(`Punchana, ____ de ${etiquetaPeriodo(asunto).split(' ')[0]} del ${asunto.slice(0, 4)}`),
    parrafo(`INFORME - ___ -${anio}-GRL-GRS-L / CONTROL Y ARCHIVO`, true),
    parrafo('PARA : Jefe del Departamento de Farmacia.', true),
    parrafo('DE : Responsable del Área de Control y Archivo', true),
    parrafo(`Asunto : Informe Mensual de ${etiquetaPeriodo(asunto)}.`, true),
    parrafo(`Mediante la presente le remito el Informe de las atenciones del mes de ${mesOficial(asunto)} ${asunto.slice(0, 4)} del Departamento de Farmacia.`),
    parrafo(`1.-ATENCIONES EN EL DEPARTAMENTO DE FARMACIA MES DE ${mes} ${anio}.`, true),
    tabla([
      [b('Resumen Total de Recetas Atendidas'), '', '', '', '', '', ''],
      [b('Recetas Atendidas en F. Dosis, F. Sala de Operaciones, F. Consultorios y F. Hemodiálisis'), '', '', '', b('Otras Atenciones'), '', ''],
      ['Hospitalización', '', v(f1.sis?.hosp), '', 'Convenios :', 'Emergencia', v(f1.convenio?.emerg)],
      ['Emergencias:', '', v(f1.sis?.emerg), '', '', 'Hospitalizados', v(f1.convenio?.hosp)],
      ['Consultas Externas:', '', v(f1.sis?.ce), '', '', 'Consultorio', v(f1.convenio?.consultorio)],
      ['Hemodiálisis:', 'Const. Ext', v(f1.sis?.hemodialisis), '', 'Crédito Personal', '', v(f1.otros?.credito)],
      ['', 'Hospitaliza', datos ? '0' : '', '', 'Insolvencias:', '', v(f1.otros?.insolvencias)],
      ['Oncología:', 'consult. Ext.', v(f1.sis?.oncologia), '', 'Defensa Nacional:', '', v(f1.otros?.defensa)],
      ['', '', '', '', 'Programas :', '', v(f1.otros?.programas)],
      [b('Total de Atenciones por SIS:'), '', t('totalSis', totalSis(f1)), '', 'Boletas/Venta:', '', v(f1.otros?.boletas)],
      ['', '', '', '', b('Total:'), t('totalOtras', totalOtras(f1)), ''],
      [b('TOTAL ATENCIONES:'), '', '', t('totalAtenciones', totalAtenciones(f1)), '', '', ''],
      ['', b('TOTAL DE RECETAS ATENDIDAS POR LAS UNIDADES DE FARMACIA'), '', '', '', '', ''],
      ['', 'CONSULTORIO EXTERNO', '', '', v(f1.sis?.ce), '', ''],
      ['', 'EMERGENCIA', '', '', v(f1.sis?.emerg), '', ''],
      ['', 'HOSPITALIZACION', '', '', v(f1.sis?.hosp), '', ''],
      [b(`ATENCIONES MES ${mes} ${opciones.anioRotulo ?? anio}`), '', '', '', '', '', ''],
      ['S.I.S.', 'CONVENIOS', 'PROGRAMAS', 'BOLETAS DE VENTA', 'CREDITO PERSONAL', 'DEFENSA NACIONAL', 'INSOLVENCIAS'],
      [t('resumenSis', totalSis(f1)), t('resumenConvenios', totalConvenios(f1)), v(f1.otros?.programas), v(f1.otros?.boletas), v(f1.otros?.credito), v(f1.otros?.defensa), v(f1.otros?.insolvencias)],
      [b('TOTAL ATENCIONES :'), '', '', '', t('resumenTotal', totalAtenciones(f1)), '', ''],
      ...(opciones.anterior
        ? [
            [b(`ATENCIONES MES ${mesOficial(previo)} ${previo.slice(0, 4)}`), '', '', '', '', '', ''],
            ['S.I.S.', 'CONVENIOS', 'PROGRAMAS', 'BOLETAS DE VENTA', 'CREDITO PERSONAL', 'DEFENSA NACIONAL', 'INSOLVENCIAS'],
            [v(totalSis(opciones.anterior.f1)), v(totalConvenios(opciones.anterior.f1)), v(opciones.anterior.f1?.otros?.programas), v(opciones.anterior.f1?.otros?.boletas), v(opciones.anterior.f1?.otros?.credito), v(opciones.anterior.f1?.otros?.defensa), v(opciones.anterior.f1?.otros?.insolvencias)],
            [b('TOTAL ATENCIONES :'), '', '', '', v(totalAtenciones(opciones.anterior.f1)), '', ''],
          ]
        : []),
    ]),
    parrafo(''),
    tabla([
      [b('FARMACIA SALA DE OPERACIONES'), '', '', '', '', '', '', b('FARMACIA CONSULTORIOS EXTERNOS'), ''],
      [...SERVICIOS_SOP.map((s) => b(s.label)), b('TOTAL SOP HOSP'), b('CONVENIOS'), b('CONSULTAS EXTERNAS'), b('CONVENIOS')],
      ...FILAS.map((f) => [
        ...SERVICIOS_SOP.map((s) => v(f2.hospitalizados?.[f.clave]?.[s.clave])),
        t(`fila.${f.clave}`, hospitalizadosFila(f2, f.clave)),
        v(f2.convenios?.[f.clave]),
        v(f3.consultas?.[f.clave]),
        v(f3.convenios?.[f.clave]),
      ]),
      [
        ...SERVICIOS_SOP.map((s) => t(`servicio.${s.clave}`, hospitalizadosServicio(f2, s.clave))),
        t('hospitalizadosSop', totalHospitalizadosSop(f2)),
        t('conveniosSop', totalConveniosSop(f2)),
        t('consultasCe', totalConsultasF3(f3)),
        t('conveniosCe', totalConveniosF3(f3)),
      ],
    ]),
    parrafo(''),
    tabla([[b('TOTAL ATENCIONES:'), '', t('totalFinal', totalAtenciones(f1)), '']]),
  ].join('');

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr></w:body></w:document>`;

  return empaquetarZip([
    {
      nombre: '[Content_Types].xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    { nombre: 'word/document.xml', contenido: documento },
  ]);
}
