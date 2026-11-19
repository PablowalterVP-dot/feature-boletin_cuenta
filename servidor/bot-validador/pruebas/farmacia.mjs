/* Pruebas del módulo Farmacia en el bot validador: el informe en Word.
   Ejecución directa: `node pruebas/farmacia.mjs`. Sin dependencias externas.

   La sección 3 lee los Word reales del área, de enero a setiembre de 2026,
   desde `CARPETA_WORD_FARMACIA` o, si no, desde `insumos/farmacia/` (fuera del
   repositorio: no se versionan archivos del hospital). Si no está, se salta
   con un aviso y lo demás corre igual. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validarArchivo, validarDatos, plantillaDe, firmaDe } from '../src/motor.js';
import { leerDocumento, cifraDeCelda } from '../src/docx.js';
import { totalSis, totalOtras, totalAtenciones, totalHospitalizadosSop, totalConveniosSop, totalConsultasF3, totalConveniosF3 } from '../src/areas/farmacia/calculos.js';
import { FILAS, SERVICIOS_SOP } from '../src/areas/farmacia/definicion.js';

let pasadas = 0;
let fallos = 0;

function afirmar(condicion, texto, detalle) {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${texto}`);
  } else {
    fallos += 1;
    console.error(`  ✗ ${texto}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

console.log('\n--- PRUEBAS DEL MÓDULO FARMACIA (BOT VALIDADOR) ---\n');

const P = '2026-08';
const CARPETA_WORD_FARMACIA = process.env.CARPETA_WORD_FARMACIA ?? fileURLToPath(new URL('../../../insumos/farmacia/', import.meta.url));

/* Un mes con cifras coherentes, como las de la siembra del sistema. */
const porFila = (valores) => Object.fromEntries(FILAS.map((f, i) => [f.clave, valores[i]]));
const MES = {
  f1: {
    sis: { hosp: 9100, emerg: 6000, ce: 2500, hemodialisis: 700, oncologia: 120 },
    convenio: { emerg: 170, hosp: 160, consultorio: 140 },
    otros: { programas: 600, boletas: 4200, credito: 0, defensa: 0, insolvencias: 0 },
  },
  f2: {
    hospitalizados: Object.fromEntries(FILAS.map((f, i) => [f.clave, Object.fromEntries(SERVICIOS_SOP.map((s, j) => [s.clave, 10 + i * 5 + j]))])),
    convenios: porFila([4, 10, 5, 1]),
  },
  f3: { consultas: porFila([0, 1200, 1230, 70]), convenios: porFila([0, 120, 20, 0]) },
};

/* ---------------------------------------------------- 1. lector de Word */
console.log('1. Lectura de un .docx');
afirmar(cifraDeCelda('18,878').valor === 18878 && cifraDeCelda('24 399').valor === 24399, 'las cifras con separador de miles se leen como número');
afirmar(cifraDeCelda('').valor === null && cifraDeCelda('').ilegible === undefined, 'una celda vacía es «sin dato», no cero');
afirmar(cifraDeCelda('cuarenta').ilegible === 'cuarenta', 'una celda con texto se conserva para mostrársela al área');

const blanco = plantillaDe('farmacia', P);
afirmar(blanco?.nombre === 'INFORME_FARMACIA_AGOSTO_2026.docx', 'el formato en blanco es un Word con el mes en el nombre', blanco?.nombre);
const doc = await leerDocumento(blanco.bytes);
afirmar(doc.parrafos.some((p) => p.includes('Informe Mensual de Agosto 2026')), 'el formato trae el mes en el asunto');
afirmar(doc.tablas.length === 3, 'el formato trae los tres cuadros del informe: resumen, Sala de Operaciones y total final', String(doc.tablas.length));

/* ------------------------------------------------- 2. ida y vuelta */
console.log('\n2. Del Word a los formatos');
const lleno = plantillaDe('farmacia', P, MES);
const inf = await validarArchivo(lleno.bytes, { area: 'farmacia', periodo: P, nombre: lleno.nombre, fecha: '2026-09-05T10:00' });
afirmar(!inf.bloqueo, 'un Word con los cuadros del informe se reconoce', JSON.stringify(inf.bloqueo));
afirmar(JSON.stringify(inf.datos.f1.sis) === JSON.stringify(MES.f1.sis), 'el SIS por servicio se lee tal como se escribió', JSON.stringify(inf.datos.f1.sis));
afirmar(inf.datos.f1.convenio.consultorio === 140 && inf.datos.f1.otros.boletas === 4200, 'convenios y otros financiadores se leen por su rótulo');
afirmar(JSON.stringify(inf.datos.f2) === JSON.stringify(MES.f2) && JSON.stringify(inf.datos.f3) === JSON.stringify(MES.f3), 'las cuatro filas de Sala de Operaciones y Consultorios se leen por columna');
afirmar(inf.errores.length === 0 && inf.avisos.length === 0, 'un Word coherente no tiene errores ni avisos', [...inf.errores, ...inf.avisos].map((h) => h.id).join());
afirmar(inf.origen['f1|sis.hosp']?.hoja === 'Tabla 1 del Word' && /^[A-Z]$/.test(inf.origen['f1|sis.hosp'].columna), 'cada cifra sabe de qué tabla, fila y columna salió, con la clave del servidor');
afirmar(inf.plantilla.version === 'FAR-W1' && inf.archivo.huella?.length === 64, 'el informe guarda la versión de lectura y la huella del archivo');
afirmar(firmaDe('farmacia', inf.datos) === firmaDe('farmacia', structuredClone(inf.datos)), 'la firma de los datos es estable');

const otroMes = await validarArchivo(plantillaDe('farmacia', P, MES, { asunto: '2026-07' }).bytes, { area: 'farmacia', periodo: P });
afirmar(otroMes.bloqueo?.id === 'plantilla-periodo' && !otroMes.datos, 'un Word de otro mes se bloquea sin cargar ninguna cifra');
const excel = plantillaDe('nutricion', P);
const conExcel = await validarArchivo(excel.bytes, { area: 'farmacia', periodo: P });
afirmar(conExcel.bloqueo != null, 'un Excel subido como informe de Farmacia se rechaza');
const noZip = await validarArchivo(new TextEncoder().encode('hola'), { area: 'farmacia', periodo: P });
afirmar(noZip.bloqueo?.titulo === 'El archivo no se pudo abrir como Word', 'un archivo que no es Word lo dice');

/* Errores del propio Word. */
const malo = plantillaDe('farmacia', P, { ...MES, f3: { ...MES.f3, consultas: { ...MES.f3.consultas, fila2: 1210 } } }, { declarados: { totalSis: 18000, totalFinal: 18000 }, anioRotulo: '2024' });
const infMalo = await validarArchivo(malo.bytes, { area: 'farmacia', periodo: P });
const reglas = (lista) => lista.map((h) => h.regla);
afirmar(reglas(infMalo.errores).includes('r5'), 'R5 · consultas del Formato 3 que no cuadran con el Formato 1 son error');
afirmar(infMalo.errores.filter((e) => e.regla === 'totales').length === 2, 'un total SIS y un total final mal escritos son dos descuadres, no cinco', infMalo.errores.filter((e) => e.regla === 'totales').map((e) => e.titulo).join(' | '));
afirmar(reglas(infMalo.avisos).includes('rotulos'), 'un título con «2024» en el informe de 2026 se avisa');
const sinDeclarados = validarDatos({ ...infMalo.datos, escritos: null }, { area: 'farmacia', periodo: P });
afirmar(!reglas(sinDeclarados.errores).includes('totales'), 'sin los totales del Word (corregido a mano) no se comparan');

/* ------------------------------------- 2b. la forma en que guarda el servidor */
console.log('\n2b. Lo que guarda el servidor');
const { casillas } = await import('../src/areas/farmacia/definicion.js');
const { anidar } = await import('../src/areas/farmacia/calculos.js');
const lista = casillas();
afirmar(lista.length === 45 && new Set(lista.map((c) => c.codigo)).size === 45, 'Farmacia tiene 45 casillas, cada una con su código único');
/* Lo que devuelve el servidor: una cifra por indicador, plana. */
const plano = Object.fromEntries(['f1', 'f2', 'f3'].map((id) => [id, Object.fromEntries(lista.filter((c) => c.cuadro === id).map((c) => [c.fila, c.fila.split('.').reduce((n, k) => n?.[k], inf.datos[id]) ?? null]))]));
afirmar(lista.every((c) => c.fila.split('.').reduce((n, k) => n?.[k], inf.datos[c.cuadro]) !== undefined), 'cada cifra que lee el bot es una de las 45 casillas');
afirmar(JSON.stringify(anidar(plano).f2) === JSON.stringify(inf.datos.f2) && totalAtenciones(anidar(plano).f1) === totalAtenciones(inf.datos.f1), 'lo que devuelve el servidor, plano, se vuelve a anidar igual');
afirmar(validarDatos(plano, { area: 'farmacia', periodo: P }).errores.length === 0, 'las reglas aceptan las cifras tal como las devuelve el servidor');

/* ------------------------------------------- 3. los Word reales del área */
console.log('\n3. Los informes reales del área (enero a setiembre de 2026):');

const MESES_REALES = [
  { archivo: '01 INFORME MES DE ENERO 2026.docx', periodo: '2026-01' },
  { archivo: '02 INFORME MES DE FEBRERO 2026.docx', periodo: '2026-02' },
  { archivo: '02 INFORME MES DE MARZO 2026.docx', periodo: '2026-03' },
  { archivo: '02 INFORME MES DE ABRIL 2026.docx', periodo: '2026-04' },
  { archivo: '02 INFORME MES DE MAYO 2026.docx', periodo: '2026-05' },
  { archivo: '02 INFORME MES DE JUNIO 2026.docx', periodo: '2026-06' },
  { archivo: '02 INFORME MES DE JULIO 2026.docx', periodo: '2026-07' },
  { archivo: '02 INFORME MES DE AGOSTO 2026.docx', periodo: '2026-08' },
  { archivo: '02 INFORME MES DE SETIEMBRE 2026.docx', periodo: '2026-09' },
];

if (!existsSync(CARPETA_WORD_FARMACIA)) {
  console.log(`  ! Se salta: no está la carpeta de los Word reales en ${CARPETA_WORD_FARMACIA} (o en CARPETA_WORD_FARMACIA)`);
} else {
  for (const { archivo, periodo } of MESES_REALES) {
    const ruta = `${CARPETA_WORD_FARMACIA}${CARPETA_WORD_FARMACIA.endsWith('/') || CARPETA_WORD_FARMACIA.endsWith('\\') ? '' : '/'}${archivo}`;
    if (!existsSync(ruta)) {
      console.log(`  ! Se salta ${periodo}: no está «${archivo}»`);
      continue;
    }
    const real = await validarArchivo(readFileSync(ruta), { area: 'farmacia', periodo, nombre: archivo });

    /* Julio de 2026 trae, de verdad, un Word sin la tabla «Resumen Total de
       Recetas Atendidas»: al área se le fue esa tabla al redactar el informe
       (quedaron solo Sala de Operaciones, Consultorios y un «TOTAL
       ATENCIONES: 23 439» suelto). Sin ella no hay SIS, convenios ni otros
       financiadores que leer, y el bot no adivina: rechaza el archivo, como
       rechazaría cualquier informe real al que le falte esa tabla. */
    if (periodo === '2026-07') {
      afirmar(real.bloqueo?.id === 'plantilla-area', `${periodo}: sin la tabla del resumen, se rechaza (no se adivina)`, JSON.stringify(real.bloqueo));
      continue;
    }
    afirmar(!real.bloqueo, `${periodo}: se reconoce sin bloqueo`, JSON.stringify(real.bloqueo));
    if (real.bloqueo) continue;

    if (periodo === '2026-01') {
      const d = real.datos;
      afirmar(totalSis(d.f1) === 18878, 'enero: total SIS 18 878', String(totalSis(d.f1)));
      afirmar(totalOtras(d.f1) === 5521 && totalAtenciones(d.f1) === 24399, 'enero: otras atenciones 5 521 y total 24 399');
      afirmar(d.f1.sis.hemodialisis === 718 && d.f1.sis.oncologia === 115, 'enero: hemodiálisis (718 + 0) y oncología (115)');
      afirmar(totalHospitalizadosSop(d.f2) === 818 && totalConveniosSop(d.f2) === 24, 'enero: Sala de Operaciones: 818 hospitalizados y 24 convenios');
      afirmar(totalConsultasF3(d.f3) === 2668 && totalConveniosF3(d.f3) === 151, 'enero: Consultorios externos: 2 668 consultas y 151 convenios');
      const rotulos = real.avisos.find((a) => a.regla === 'rotulos');
      afirmar(rotulos && rotulos.detalle.includes('ENERO 2024') && rotulos.detalle.includes('DICIEMBRE - 2023') && rotulos.detalle.includes('2025'), 'enero: avisa los rótulos con el año equivocado del original', rotulos?.detalle);
      afirmar(real.errores.length === 0, 'enero: sin errores, sus cuadros cuadran', real.errores.map((e) => e.id).join());
    } else if (periodo === '2026-03' || periodo === '2026-09') {
      /* Marzo y setiembre traen, de verdad, las consultas del Formato 3
         descuadradas con la Consulta externa SIS del Formato 1: son dos
         cifras del mismo Word, cada una consistente con su propio total, que
         no coinciden entre sí. No hay con qué arbitrar cuál de las dos está
         mal (a diferencia de un total declarado que permite deducir la cifra
         correcta), así que queda como el error real que es. */
      afirmar(real.errores.length === 1 && real.errores[0].regla === 'r5', `${periodo}: un solo error real, R5 (consultas de F3 vs. CE de F1)`, JSON.stringify(real.errores));
    } else {
      afirmar(real.errores.length === 0 && real.avisos.length === 0, `${periodo}: ningún error ni aviso`, JSON.stringify([...real.errores, ...real.avisos].slice(0, 3)));
    }
  }

  /* El Word de enero no sirve para el reporte de un periodo distinto. */
  const rutaEnero = `${CARPETA_WORD_FARMACIA}${CARPETA_WORD_FARMACIA.endsWith('/') || CARPETA_WORD_FARMACIA.endsWith('\\') ? '' : '/'}01 INFORME MES DE ENERO 2026.docx`;
  if (existsSync(rutaEnero)) {
    const otro = await validarArchivo(readFileSync(rutaEnero), { area: 'farmacia', periodo: '2026-02' });
    afirmar(otro.bloqueo?.id === 'plantilla-periodo', 'el Word de enero no entra en el reporte de febrero');
  }
}

/* ---------------------------------------------------- 4. consolidado anual */
console.log('\n4. Consolidado anual:');

const { consolidadoDe, crearConsolidado, nombreDelConsolidado } = await import('../src/areas/farmacia/consolidado.js');
const { leerLibro } = await import('../src/xlsx.js');
const { totalCuadro } = await import('../src/areas/farmacia/calculos.js');

const mesesDeEjemplo = [
  { periodo: '2026-07', datos: inf.datos },
  { periodo: '2026-08', datos: inf.datos },
];
const cons = consolidadoDe(2026, mesesDeEjemplo);
afirmar(cons.conDato.filter(Boolean).length === 2, 'cuenta los dos meses con reporte, ni uno más', String(cons.conDato.filter(Boolean).length));
afirmar(cons.conDato[0] === false && cons.conDato[6] === true && cons.conDato[7] === true, 'enero vacío, julio y agosto con dato');
afirmar(cons.cuadros.length === 3, 'son los tres cuadros del informe mensual', String(cons.cuadros.length));
const atenciones = cons.cuadros.find((c) => c.id === 'f1');
const totalF1 = totalCuadro(inf.datos, 'f1');
afirmar(atenciones.porMes[6] === totalF1 && atenciones.porMes[7] === totalF1, 'cada mes del cuadro trae su total de atenciones', String(atenciones.porMes[6]));
afirmar(atenciones.acumulado === totalF1 * 2, 'el acumulado del cuadro es la suma de los meses con dato', String(atenciones.acumulado));

const soloUnMes = consolidadoDe(2026, [{ periodo: '2026-07', datos: inf.datos }]);
afirmar(soloUnMes.cuadros[0].acumulado === soloUnMes.cuadros[0].porMes[6], 'con un solo mes, el acumulado es ese mes');

const sinMeses = consolidadoDe(2026, []);
afirmar(sinMeses.cuadros.every((c) => c.acumulado === null), 'sin ningún mes entregado, el acumulado no es cero: es vacío');

afirmar(nombreDelConsolidado(2026) === 'Farmacia_TOTAL_2026.xlsx', 'el nombre del consolidado es el del área', nombreDelConsolidado(2026));
const libroConsolidado = crearConsolidado(2026, mesesDeEjemplo, { generado: '19/10/2026' });
afirmar(libroConsolidado.length > 0 || libroConsolidado.byteLength > 0, 'el consolidado se descarga como un .xlsx de verdad');
const releido = await leerLibro(libroConsolidado);
afirmar(releido.hojas[0] === 'TOTAL 2026', 'la hoja se llama TOTAL 2026', releido.hojas[0]);

/* Los informes reales de 2026, versionados para la carga histórica. Julio
   trae el resumen pegado como imagen (un EMF: se lee su texto, sin OCR) y el
   cuadro de Sala de Operaciones y Consultorios copiado de junio; marzo y
   setiembre, consultas del Formato 3 que no cuadran con el Formato 1. Son
   errores del área: quedan en borrador para que Farmacia los corrija. */
console.log('\nInformes reales de 2026 (historico/farmacia/2026):');
const HISTORICO = fileURLToPath(new URL('../../api/historico/farmacia/2026/', import.meta.url));
const real = (mes) => `${HISTORICO}/02 INFORME MES DE ${mes} 2026.docx`;
if (!existsSync(real('JULIO'))) {
  console.log(`  ! Se salta: no está ${HISTORICO}`);
} else {
  const junio = await validarArchivo(readFileSync(real('JUNIO')), { area: 'farmacia', periodo: '2026-06', nombre: 'junio.docx' });
  const julio = await validarArchivo(readFileSync(real('JULIO')), { area: 'farmacia', periodo: '2026-07', nombre: 'julio.docx', anterior: { periodo: '2026-06', datos: junio.datos } });
  afirmar(!julio.bloqueo, 'julio se reconoce aunque su resumen sea una imagen', julio.bloqueo?.titulo);
  afirmar(totalSis(julio.datos?.f1) === 18207 && julio.datos?.f1?.otros?.programas === 624 && julio.datos?.escritos?.f1?.totalAtenciones === 23143, 'el resumen de julio se lee del texto de la imagen: SIS 18 207, programas 624, total 23 143', JSON.stringify(julio.datos?.f1));
  afirmar(julio.avisos?.some((h) => h.regla === 'resumen-imagen'), 'se avisa que el resumen vino como imagen');
  afirmar(julio.avisos?.some((h) => h.regla === 'copiado'), 'se avisa que Sala de Operaciones y Consultorios son los de junio');
  afirmar(julio.errores?.some((h) => h.regla === 'r5'), 'y las consultas copiadas no cuadran con la consulta externa de julio');
  const sinAnterior = await validarArchivo(readFileSync(real('JULIO')), { area: 'farmacia', periodo: '2026-07', nombre: 'julio.docx' });
  afirmar(!sinAnterior.avisos.some((h) => h.regla === 'copiado'), 'sin el mes anterior no se puede decir que sea una copia');
  for (const [mes, periodo] of [['MARZO', '2026-03'], ['SETIEMBRE', '2026-09']]) {
    const inf = await validarArchivo(readFileSync(real(mes)), { area: 'farmacia', periodo, nombre: `${mes}.docx` });
    afirmar(inf.errores.length === 1 && inf.errores[0].regla === 'r5', `${mes.toLowerCase()}: las consultas del Formato 3 no cuadran con el Formato 1`, JSON.stringify(inf.errores.map((h) => h.titulo)));
  }
  for (const [mes, periodo] of [['FEBRERO', '2026-02'], ['ABRIL', '2026-04'], ['MAYO', '2026-05'], ['JUNIO', '2026-06'], ['AGOSTO', '2026-08']]) {
    const inf = await validarArchivo(readFileSync(real(mes)), { area: 'farmacia', periodo, nombre: `${mes}.docx` });
    afirmar(!inf.bloqueo && inf.errores.length === 0, `${mes.toLowerCase()}: sin errores`, JSON.stringify(inf.bloqueo ?? inf.errores.map((h) => h.titulo)));
  }
}

console.log(`\n${fallos === 0 ? 'OK' : 'FALLÓ'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.\n`);
process.exit(fallos === 0 ? 0 : 1);
