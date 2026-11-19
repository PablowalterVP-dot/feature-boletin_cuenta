/* Lector del informe mensual de Farmacia, en Word.

   Farmacia no llena un Excel: el área de Control y Archivo redacta cada mes un
   Word (`01_INFORME_MES_DE_ENERO_2026.docx` es el modelo) con un oficio y sus
   cuadros. El bot lee ese mismo Word, sin plantilla del sistema:

     reconocer   es el informe de Farmacia (sus cuadros) y su asunto dice el
                 mes del reporte que se está llenando
     leerCifras  cada cifra por el rótulo que la acompaña, no por su lugar

   Estructura del Word de enero de 2026, comprobada tabla por tabla:

   | Tabla | Qué trae | Cómo se lee |
   |---|---|---|
   | «Resumen Total de Recetas Atendidas» | SIS por servicio a la izquierda; convenios, crédito, insolvencias, Defensa Nacional, programas y boletas a la derecha; sus totales | Por rótulo, en dos mitades: la columna de «Otras Atenciones» las separa |
   | (la misma) «Total de recetas atendidas por las unidades de farmacia» | Consulta externa, emergencia y hospitalización otra vez | Se comparan con el SIS: son la misma cifra |
   | (la misma) «ATENCIONES MES …» | El resumen por financiador, del mes y del anterior | El del mes se compara; el del anterior se informa |
   | Datos del gráfico | SIS y venta de dos meses | No se lee: copia el resumen. Solo se revisan sus rótulos |
   | «FARMACIA SALA DE OPERACIONES» y «CONSULTORIOS EXTERNOS» | Cuatro filas sin rótulo y una de totales | Por las columnas de su encabezado |
   | «TOTAL ATENCIONES» | El total final | Se compara |

   Los gráficos incrustados son imágenes y copias de los cuadros: no se leen.

   Lo que el lector decide por su cuenta (sumar las dos casillas de
   hemodiálisis, un rótulo con el año equivocado, un dato que no encontró) va
   en `hallazgos` y las reglas lo convierten en aviso o información. */

import { problema } from '../../plantillas.js';
import { cifraDeCelda } from '../../docx.js';
import { filasDeTextos } from '../../emf.js';
import { letraDeColumna } from '../../xlsx.js';
import { etiquetaPeriodo, periodoDeTexto } from '../../periodos.js';
import { SERVICIOS_SOP, FILAS, VERSION, datosVacios } from './definicion.js';

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/* Rótulo comparable: sin tildes, sin signos y en minúsculas. */
const rotulo = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const esCifra = (texto) => /^[\d\s,.-]+$/.test(String(texto ?? '').trim()) && /\d/.test(texto);
const tieneTexto = (texto) => String(texto ?? '').trim() !== '' && !esCifra(texto);

function mesAnterior(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/* Rótulos de la mitad izquierda del resumen (atenciones SIS). Hemodiálisis y
   oncología traen además un subrótulo («Const. Ext», «Hospitaliza»). */
const IZQUIERDA = [
  { patron: /^total de atenciones por sis/, destino: 'escritos.f1.totalSis' },
  { patron: /^total atenciones/, destino: 'escritos.f1.totalAtenciones' },
  { patron: /^hospitalizacion/, destino: 'f1.sis.hosp' },
  { patron: /^emergencia/, destino: 'f1.sis.emerg' },
  { patron: /^consultas? externas?/, destino: 'f1.sis.ce' },
  { patron: /^hemodialisis/, grupo: 'hemodialisis' },
  { patron: /^oncologia/, grupo: 'oncologia' },
];

/* Rótulos de la mitad derecha (otras atenciones). «Convenios» abre un grupo
   cuyos subrótulos (emergencia, hospitalizados, consultorio) van debajo. */
const DERECHA = [
  { patron: /^convenios?$/, grupo: 'convenio' },
  { patron: /^credito personal/, destino: 'f1.otros.credito' },
  { patron: /^insolvencia/, destino: 'f1.otros.insolvencias' },
  { patron: /^defensa nacional/, destino: 'f1.otros.defensa' },
  { patron: /^programas?/, destino: 'f1.otros.programas' },
  { patron: /^boletas?/, destino: 'f1.otros.boletas' },
  { patron: /^total$/, destino: 'escritos.f1.totalOtras' },
];

const SUBROTULO = {
  hemodialisis: [
    { patron: /const|consult|ext/, destino: 'hemodialisis.ce' },
    { patron: /hosp/, destino: 'hemodialisis.hosp' },
  ],
  oncologia: [
    { patron: /const|consult|ext/, destino: 'oncologia.ce' },
    { patron: /hosp/, destino: 'oncologia.hosp' },
  ],
  convenio: [
    { patron: /^emergencia/, destino: 'f1.convenio.emerg' },
    { patron: /^hospitaliza/, destino: 'f1.convenio.hosp' },
    { patron: /^consultorio/, destino: 'f1.convenio.consultorio' },
  ],
};

/* Columnas del resumen «ATENCIONES MES …», por su encabezado. */
const RESUMEN = [
  { patron: /^s i s$|^sis$/, clave: 'sis' },
  { patron: /^convenios?/, clave: 'convenios' },
  { patron: /^programas?/, clave: 'programas' },
  { patron: /^boletas?/, clave: 'boletas' },
  { patron: /^credito/, clave: 'credito' },
  { patron: /^defensa/, clave: 'defensa' },
  { patron: /^insolvencia/, clave: 'insolvencias' },
];

/* Campos que el informe siempre trae; si alguno no aparece, se avisa. */
const OBLIGATORIOS = [
  ['f1.sis.hosp', 'Hospitalización'],
  ['f1.sis.emerg', 'Emergencias'],
  ['f1.sis.ce', 'Consultas Externas'],
  ['hemodialisis.ce', 'Hemodiálisis'],
  ['oncologia.ce', 'Oncología'],
  ['f1.convenio.emerg', 'Convenios · Emergencia'],
  ['f1.convenio.hosp', 'Convenios · Hospitalizados'],
  ['f1.convenio.consultorio', 'Convenios · Consultorio'],
  ['f1.otros.credito', 'Crédito Personal'],
  ['f1.otros.insolvencias', 'Insolvencias'],
  ['f1.otros.defensa', 'Defensa Nacional'],
  ['f1.otros.programas', 'Programas'],
  ['f1.otros.boletas', 'Boletas/Venta'],
];

function poner(objeto, ruta, valor) {
  const partes = ruta.split('.');
  let nodo = objeto;
  for (const p of partes.slice(0, -1)) nodo = nodo[p] ??= {};
  nodo[partes.at(-1)] = valor;
}

const tablaCon = (documento, patron) => documento.tablas.find((t) => t.celdas.some((fila) => fila.some((c) => patron.test(rotulo(c)))));

/* El resumen pegado como imagen (julio de 2026): Word lo guardó como un
   dibujo EMF, con cada texto y su posición (emf.js). Se arma con él una tabla
   como la del Word, para leerla con el mismo código:
     · hasta «Total de recetas atendidas por las unidades», cada fila en dos
       mitades de ANCHO celdas, partidas donde empieza «Convenios :» (la
       primera etiqueta de «Otras Atenciones»), como las mitades del cuadro;
     · después, cada fila tal cual, de izquierda a derecha; un encabezado
       partido en dos líneas («PROGRA» / «MAS») se une a la palabra de abajo
       más cercana.
   No tiene celdas que parchar: lo que se lee de ella no se corrige en el Word
   desde el sistema (`deImagen`). */
const ANCHO = 4;
function resumenDesdeDibujo(documento) {
  const dibujo = (documento.dibujos ?? []).find((d) => d.textos.some((t) => rotulo(t.texto).startsWith('total de atenciones por sis')));
  if (!dibujo) return null;
  /* Una copia: unir los encabezados no debe tocar el documento, que se lee
     dos veces (reconocer y leerCifras). */
  const filas = filasDeTextos(dibujo.textos.map((t) => ({ ...t })));
  const corte = filas.flatMap((f) => f.textos).find((t) => /^convenios?$/.test(rotulo(t.texto)))?.x;
  const finResumen = filas.find((f) => f.textos.some((t) => /unidades de farmacia/.test(rotulo(t.texto))))?.y ?? Infinity;
  const celdas = [];
  for (let i = 0; i < filas.length; i += 1) {
    const { y, textos } = filas[i];
    if (y < finResumen && corte != null) {
      const izq = textos.filter((t) => t.x < corte).map((t) => t.texto);
      const der = textos.filter((t) => t.x >= corte).map((t) => t.texto);
      celdas.push([...izq, ...Array(Math.max(0, ANCHO - izq.length)).fill(''), ...der, ...Array(Math.max(0, ANCHO - der.length)).fill('')]);
      continue;
    }
    const siguiente = filas[i + 1];
    const sinCifras = (f) => f && !f.textos.some((t) => esCifra(t.texto));
    if (sinCifras(filas[i]) && sinCifras(siguiente) && siguiente.y - y < 20 && textos.length < siguiente.textos.length) {
      for (const t of textos) {
        const cerca = siguiente.textos.reduce((a, b) => (Math.abs(b.x - t.x) < Math.abs(a.x - t.x) ? b : a));
        cerca.texto = `${t.texto}${cerca.texto}`;
      }
      continue;
    }
    celdas.push(textos.map((t) => t.texto));
  }
  return { indice: null, deImagen: dibujo.nombre, celdas, filas: celdas.map((f) => f.map((texto) => ({ texto, span: 1 }))) };
}

const tablaDelResumen = (documento) => tablaCon(documento, /^total de atenciones por sis/) ?? resumenDesdeDibujo(documento);

/* ------------------------------------------------------------ reconocer */

export function reconocer(documento, { periodo }) {
  if (documento?.tipo !== 'docx') {
    return { problema: problema('archivo', 'El informe de Farmacia se sube en Word', 'Suba el informe mensual en .docx, el mismo que se imprime y se firma.') };
  }
  const resumen = tablaDelResumen(documento);
  const sop = tablaCon(documento, /^mater$/);
  if (!/farmacia/i.test(documento.texto) || !resumen) {
    return {
      problema: problema(
        'plantilla-area',
        'Este Word no es el informe mensual de Farmacia',
        'No se encontró el cuadro «Resumen Total de Recetas Atendidas» con «Total de Atenciones por SIS». Suba el informe que prepara el área de Control y Archivo.',
      ),
    };
  }
  if (!sop) {
    return {
      problema: problema(
        'plantilla-estructura',
        'Falta el cuadro de Sala de Operaciones y Consultorios externos',
        'El informe trae una tabla con las columnas MATER, GINEC, CIRU, MEDI, PEDIA, TOTAL SOP HOSP, CONVENIOS, CONSULTAS EXTERNAS y CONVENIOS. No se encontró en este Word.',
      ),
    };
  }

  /* El mes del informe sale del asunto («Informe Mensual de Enero 2026»); si
     no lo tiene, de la frase «atenciones del mes de ENERO 2026». */
  const asunto = documento.parrafos.find((p) => /asunto/i.test(p) && /informe/i.test(p)) ?? documento.parrafos.find((p) => /informe mensual/i.test(p));
  const frase = documento.parrafos.find((p) => /atenciones del mes de/i.test(p));
  const delDocumento = periodoDeTexto(asunto) ?? periodoDeTexto(frase?.match(/atenciones del mes de\s+[^;.,]+/i)?.[0]);
  if (!delDocumento) {
    return {
      problema: problema(
        'plantilla-periodo',
        'El informe no dice de qué mes es',
        'El asunto debe decir el mes y el año, por ejemplo «Asunto : Informe Mensual de Enero 2026». Corríjalo en el Word y vuelva a subirlo.',
      ),
    };
  }
  if (delDocumento !== periodo) {
    return {
      problema: problema(
        'plantilla-periodo',
        `Este informe es de ${etiquetaPeriodo(delDocumento).toLowerCase()}, no de ${etiquetaPeriodo(periodo).toLowerCase()}`,
        `Su asunto dice «${asunto ?? frase}». Suba el informe de ${etiquetaPeriodo(periodo).toLowerCase()} o abra el reporte de ${etiquetaPeriodo(delDocumento).toLowerCase()}.`,
      ),
    };
  }
  return { plantilla: { area: 'farmacia', periodo, version: VERSION, documento: 'Word' } };
}

/* ------------------------------------------------------------ leerCifras */

export function leerCifras(documento, { periodo }) {
  const datos = { ...datosVacios(), escritos: { f1: {}, f2: {}, f3: {} }, ilegibles: {}, periodoDocumento: periodo };
  const tmp = {};
  const origen = {};
  const hallazgos = [];
  /* Rótulos encontrados, tengan cifra o no: un rótulo sin cifra es una
     casilla en blanco (aviso propio); uno que no está es otra cosa. */
  const vistos = new Set();
  let leidas = 0;

  /* Guarda una cifra con su linaje: de qué tabla, fila y columna salió. */
  const guardar = (ruta, texto, t, f, c) => {
    const { valor, ilegible } = cifraDeCelda(texto);
    const destino = ruta.startsWith('f') || ruta.startsWith('escritos') ? datos : tmp;
    /* La clave de una casilla es la del servidor: cuadro y fila, `f1|sis.hosp`.
       La columna va en letra, como en un Excel: «Tabla 1 del Word», celda C4. */
    const clave = ruta.startsWith('f') ? `${ruta.slice(0, 2)}|${ruta.slice(3)}` : null;
    /* La corrección guiada nombra también los totales escritos y las dos
       mitades de hemodiálisis y oncología (correccion.js); `tabla` dice en
       qué tabla del Word parchar la celda (docx.js). */
    const casilla = clave ?? (ruta.startsWith('escritos.') ? `escrito|${ruta.slice(9)}` : /^(hemodialisis|oncologia)\./.test(ruta) ? `parte|${ruta}` : null);
    /* Lo leído de una imagen no tiene celda que parchar: sin origen, la
       corrección guiada no intenta escribirla en el Word. */
    if (casilla && !t.deImagen) origen[casilla] = { hoja: `Tabla ${t.indice + 1} del Word`, tabla: t.indice, fila: f + 1, columna: letraDeColumna(c + 1) };
    if (ilegible != null) {
      if (clave) datos.ilegibles[clave] = ilegible;
      return;
    }
    if (valor == null) return;
    poner(destino, ruta, valor);
    leidas += 1;
  };

  /* 1. El resumen: dos mitades, y debajo las unidades de farmacia y los
     cuadros «ATENCIONES MES …». */
  const resumen = tablaDelResumen(documento);
  if (resumen.deImagen) {
    hallazgos.push({
      id: 'lectura|resumen-imagen',
      regla: 'resumen-imagen',
      formato: 'f1',
      titulo: 'El resumen está pegado como imagen: se leyó el texto de la imagen',
      detalle: `El cuadro «Resumen Total de Recetas Atendidas» no es una tabla de Word sino un dibujo (${resumen.deImagen}). Su texto se leyó tal cual, sin adivinar ninguna cifra. Para corregir una cifra del resumen, cámbiela en el Excel de origen y vuelva a pegarla en el Word como tabla (Pegado especial → Formato HTML), no como imagen.`,
    });
  }
  const filaOtras = resumen.celdas.find((fila) => fila.some((c) => /^otras atenciones/.test(rotulo(c))));
  const corte = filaOtras ? filaOtras.findIndex((c) => /^otras atenciones/.test(rotulo(c))) : Math.floor((resumen.celdas[0]?.length ?? 2) / 2);

  let modo = 'resumen';
  let grupoIzq = null;
  let grupoDer = null;
  let columnasResumen = null;
  let bloqueMes = null;

  resumen.celdas.forEach((fila, f) => {
    const textos = fila.map((c) => rotulo(c));
    const titulo = textos.find((x) => x);

    if (textos.some((x) => /unidades de farmacia/.test(x))) {
      modo = 'unidades';
      return;
    }
    const encabezadoMes = fila.find((c) => /^atenciones mes/.test(rotulo(c)));
    if (encabezadoMes) {
      modo = 'mes';
      const p = periodoDeTexto(encabezadoMes);
      const mes = MESES.findIndex((m) => rotulo(encabezadoMes).includes(rotulo(m)) || (m === 'SETIEMBRE' && rotulo(encabezadoMes).includes('septiembre')));
      const mesDelReporte = Number(periodo.slice(5)) - 1;
      const mesPrevio = Number(mesAnterior(periodo).slice(5)) - 1;
      bloqueMes = { texto: encabezadoMes, tipo: mes === mesDelReporte ? 'actual' : mes === mesPrevio ? 'anterior' : 'otro', periodo: p };
      columnasResumen = null;
      return;
    }

    if (modo === 'unidades') {
      const etiqueta = textos.find((x) => x);
      const c = fila.findIndex((x) => esCifra(x));
      if (!etiqueta || c < 0) return;
      const clave = /consultorio|externo/.test(etiqueta) ? 'ce' : /emergencia/.test(etiqueta) ? 'emerg' : /hospitaliza/.test(etiqueta) ? 'hosp' : null;
      if (clave) guardar(`escritos.f1.unidades.${clave}`, fila[c], resumen, f, c);
      return;
    }

    if (modo === 'mes') {
      if (!columnasResumen && textos.some((x) => /^s i s$|^sis$/.test(x))) {
        columnasResumen = textos.map((x) => RESUMEN.find((r) => r.patron.test(x))?.clave ?? null);
        return;
      }
      if (/^total atenciones/.test(titulo ?? '')) {
        const c = fila.findIndex((x) => esCifra(x));
        if (c >= 0 && bloqueMes?.tipo === 'actual') guardar('escritos.f1.resumen.total', fila[c], resumen, f, c);
        if (c >= 0 && bloqueMes?.tipo === 'anterior') guardar('mesAnterior.total', fila[c], resumen, f, c);
        return;
      }
      if (columnasResumen && fila.some((x) => esCifra(x))) {
        fila.forEach((texto, c) => {
          const clave = columnasResumen[c];
          if (!clave || !String(texto).trim()) return;
          if (bloqueMes?.tipo === 'actual') guardar(`escritos.f1.resumen.${clave}`, texto, resumen, f, c);
          else if (bloqueMes?.tipo === 'anterior') guardar(`mesAnterior.${clave}`, texto, resumen, f, c);
        });
      }
      return;
    }

    /* Mitades izquierda y derecha: cada cifra va al último rótulo de su mitad. */
    for (const lado of ['izq', 'der']) {
      const desde = lado === 'izq' ? 0 : corte;
      const hasta = lado === 'izq' ? corte : fila.length;
      let destino = null;
      for (let c = desde; c < hasta; c += 1) {
        const texto = fila[c];
        if (tieneTexto(texto)) {
          const r = rotulo(texto);
          const tabla = lado === 'izq' ? IZQUIERDA : DERECHA;
          const principal = tabla.find((x) => x.patron.test(r));
          const grupo = lado === 'izq' ? grupoIzq : grupoDer;
          if (principal?.grupo) {
            if (lado === 'izq') grupoIzq = principal.grupo;
            else grupoDer = principal.grupo;
            destino = null;
          } else if (principal) {
            destino = principal.destino;
            vistos.add(destino);
            if (lado === 'izq') grupoIzq = null;
            else grupoDer = null;
          } else if (grupo) {
            const sub = SUBROTULO[grupo].find((x) => x.patron.test(r))?.destino;
            if (sub) vistos.add(sub);
            destino = sub ?? destino;
          }
        } else if (String(texto ?? '').trim() && destino) {
          guardar(destino, texto, resumen, f, c);
          destino = null;
        }
      }
    }
  });

  /* Hemodiálisis y oncología vienen partidas en consulta externa y
     hospitalización. El reporte guarda una cifra por componente: la suma. */
  for (const [clave, nombre] of [['hemodialisis', 'Hemodiálisis'], ['oncologia', 'Oncología']]) {
    const partes = tmp[clave] ?? {};
    const valores = [partes.ce, partes.hosp].filter((v) => v != null);
    if (!valores.length) continue;
    datos.f1.sis[clave] = valores.reduce((a, b) => a + b, 0);
    // Las dos mitades, para corregir la que esté mal (correccion.js).
    for (const lado of ['ce', 'hosp']) if (partes[lado] != null) (datos.escritos.partes ??= {})[`${clave}.${lado}`] = partes[lado];
    if (partes.hosp != null) {
      hallazgos.push({
        id: `lectura|${clave}`,
        regla: 'lectura',
        formato: 'f1',
        titulo: `${nombre}: se suman consulta externa y hospitalización`,
        detalle: `El Word trae ${(partes.ce ?? 0).toLocaleString('es-PE')} de consulta externa y ${partes.hosp.toLocaleString('es-PE')} de hospitalización. El reporte guarda la suma: ${datos.f1.sis[clave].toLocaleString('es-PE')}.`,
      });
    }
  }

  /* 2. Sala de Operaciones y Consultorios externos: por su encabezado. Sin
     ninguna fila con cifras (el formato en blanco) no hay nada que leer, y
     las reglas dirán que los formatos están vacíos. */
  const sop = tablaCon(documento, /^mater$/);
  const h = sop.celdas.findIndex((fila) => fila.some((c) => rotulo(c) === 'mater'));
  const encabezado = sop.celdas[h].map(rotulo);
  const col = Object.fromEntries(SERVICIOS_SOP.map((s) => [s.clave, encabezado.indexOf(s.label.toLowerCase())]));
  const colTotalSop = encabezado.findIndex((x) => /^total sop/.test(x));
  const colConsultas = encabezado.findIndex((x) => /^consultas? externas?/.test(x));
  const convenios = encabezado.map((x, i) => (/^convenios?$/.test(x) ? i : -1)).filter((i) => i >= 0);
  const colConvSop = convenios.find((i) => i < colConsultas) ?? convenios[0];
  const colConvCe = convenios.find((i) => i > colConsultas) ?? convenios[1];

  const numericas = sop.celdas.map((fila, i) => ({ fila, i })).filter(({ fila, i }) => i > h && fila.some((x) => esCifra(x)));
  let totales = null;
  let filas = numericas;
  if (numericas.length === FILAS.length + 1) {
    totales = numericas.at(-1);
    filas = numericas.slice(0, -1);
  } else if (numericas.length !== FILAS.length && numericas.length !== 0) {
    return {
      problema: problema(
        'plantilla-estructura',
        `El cuadro de Sala de Operaciones tiene ${numericas.length} filas con cifras`,
        `Se esperan ${FILAS.length} filas y una de totales, como en el informe de enero de 2026. Si el área agregó o quitó filas, hay que confirmarlo antes de leerlas: hoy no tienen rótulo y el bot no puede saber cuál es cuál.`,
      ),
    };
  }

  filas.forEach(({ fila, i }, n) => {
    const clave = FILAS[n].clave;
    for (const s of SERVICIOS_SOP) if (col[s.clave] >= 0) guardar(`f2.hospitalizados.${clave}.${s.clave}`, fila[col[s.clave]], sop, i, col[s.clave]);
    if (colConvSop >= 0) guardar(`f2.convenios.${clave}`, fila[colConvSop], sop, i, colConvSop);
    if (colConsultas >= 0) guardar(`f3.consultas.${clave}`, fila[colConsultas], sop, i, colConsultas);
    if (colConvCe >= 0) guardar(`f3.convenios.${clave}`, fila[colConvCe], sop, i, colConvCe);
    if (colTotalSop >= 0) guardar(`escritos.f2.filas.${clave}`, fila[colTotalSop], sop, i, colTotalSop);
  });
  if (totales) {
    const { fila, i } = totales;
    for (const s of SERVICIOS_SOP) if (col[s.clave] >= 0) guardar(`escritos.f2.servicios.${s.clave}`, fila[col[s.clave]], sop, i, col[s.clave]);
    if (colTotalSop >= 0) guardar('escritos.f2.hospitalizados', fila[colTotalSop], sop, i, colTotalSop);
    if (colConvSop >= 0) guardar('escritos.f2.convenios', fila[colConvSop], sop, i, colConvSop);
    if (colConsultas >= 0) guardar('escritos.f3.consultas', fila[colConsultas], sop, i, colConsultas);
    if (colConvCe >= 0) guardar('escritos.f3.convenios', fila[colConvCe], sop, i, colConvCe);
  }

  /* 3. El total final, en su propia tabla al pie del informe. */
  const final = documento.tablas.find((t) => t !== resumen && t !== sop && t.celdas.some((fila) => fila.some((c) => /^total atenciones/.test(rotulo(c)))));
  if (final) {
    final.celdas.forEach((fila, f) => {
      const c = fila.findIndex((x) => esCifra(x));
      if (c >= 0 && fila.some((x) => /^total atenciones/.test(rotulo(x)))) guardar('escritos.f1.totalFinal', fila[c], final, f, c);
    });
  }

  /* Lo que no apareció. Sin el rótulo no hay cifra, y adivinar su lugar
     podría cargar la cifra de otro concepto. */
  const faltan = OBLIGATORIOS.filter(([ruta]) => !vistos.has(ruta)).map(([, nombre]) => nombre);
  if (faltan.length) {
    hallazgos.push({
      id: 'no-encontrado|f1',
      regla: 'no-encontrado',
      formato: 'f1',
      titulo: `No se encontró ${faltan.length === 1 ? 'un rótulo' : `${faltan.length} rótulos`} del resumen en el Word`,
      detalle: `${faltan.join(', ')}. Esas casillas quedan en blanco. Revise que el cuadro conserve sus rótulos o digite la cifra aquí.`,
    });
  }

  /* 4. Rótulos con el año equivocado: no cambian ninguna cifra, pero el
     documento impreso queda mal. Se buscan en todo el Word, incluido el
     cuadro de datos del gráfico. */
  const previo = mesAnterior(periodo);
  const malos = new Set();
  const textos = [...documento.parrafos, ...documento.tablas.flatMap((t) => t.celdas.flat())];
  for (const texto of textos) {
    const t = String(texto).toUpperCase();
    for (const m of t.matchAll(/\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SETIEMBRE|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b\s*(?:-|DE|DEL)?\s*(20\d{2})\b/g)) {
      const p = periodoDeTexto(`${m[1]} ${m[2]}`);
      const mes = p?.slice(5);
      const esperado = mes === periodo.slice(5) ? periodo : mes === previo.slice(5) ? previo : null;
      if (esperado && p !== esperado) malos.add(m[0].replace(/\s+/g, ' ').trim());
    }
    const numero = t.match(/INFORME\s*-?\s*\d+\s*-\s*(20\d{2})/);
    if (numero && numero[1] !== periodo.slice(0, 4)) malos.add(`número de informe «${numero[0].replace(/\s+/g, ' ')}»`);
  }
  if (malos.size) {
    hallazgos.push({
      id: 'rotulos|f1',
      regla: 'rotulos',
      formato: 'f1',
      titulo: `El Word tiene ${malos.size === 1 ? 'un rótulo' : `${malos.size} rótulos`} con el año equivocado`,
      detalle: `${[...malos].map((x) => (x.startsWith('número') ? x : `«${x}»`)).join(', ')}. El reporte es de ${etiquetaPeriodo(periodo).toLowerCase()}. No cambia ninguna cifra (el periodo sale del reporte abierto), pero corríjalo en el Word antes de imprimirlo.`,
    });
  }

  if (tmp.mesAnterior) {
    const total = tmp.mesAnterior.total;
    hallazgos.push({
      id: 'lectura|mes-anterior',
      regla: 'lectura',
      formato: 'f1',
      titulo: `El Word repite el mes de ${etiquetaPeriodo(previo).toLowerCase()}`,
      detalle: `${total != null ? `${total.toLocaleString('es-PE')} atenciones. ` : ''}El sistema no carga esas cifras: compara con el último mes que Farmacia envió por el sistema.`,
    });
  }

  return { datos, origen, leidas, hallazgos };
}
