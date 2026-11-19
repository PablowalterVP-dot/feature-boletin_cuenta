/* Corrección guiada de un Excel con errores.

   Recorrido (lo usa la pantalla de corrección del área):
     1. abrir      se lee el archivo subido como en una carga, y además las
                   celdas de la hoja tal como están, para mostrarlas al lado
                   del formulario del bot
     2. explicar   Dr. Mochi dice dónde está cada error y por qué no cuadra
     3. revalidar  con cada cambio, las mismas reglas sobre los datos corregidos
     4. devolver   el MISMO libro, con solo esas celdas cambiadas; vuelve a
                   subirse y pasa por el bot como cualquier otro archivo

   DR. MOCHI NO ADIVINA
   La explicación sale de la evidencia que dejan las reglas (las celdas y sus
   cifras) y de unas pocas comprobaciones exactas: un sumando contado dos
   veces, uno que falta, dos dígitos invertidos, un dígito de más o de menos.
   Ninguna cifra la inventa un modelo: cada una se puede comprobar con una
   resta. Cuando ninguna comprobación encaja, solo muestra la cuenta.

   Lo que cada área sabe de sus casillas está en areas/<área>/correccion.js;
   aquí, lo común.

   UN WORD SE CORRIGE IGUAL
   Farmacia y Nefrología suben un Word: cada tabla hace de hoja (docx.js) y
   el origen de cada casilla trae además su `tabla`. Se devuelve el mismo
   documento con solo esas celdas cambiadas. */

import { leerLibro, parchearHojas } from './xlsx.js';
import { esDocumento, leerDocumento, hojaDeTabla, parchearDocumento } from './docx.js';
import { validarArchivo, informeDe } from './motor.js';
import { areaDelBot } from './areas/index.js';

const formato = (n) => (typeof n === 'number' ? n.toLocaleString('es-PE') : '—');

/* ------------------------------------------------------ dígitos tecleados */

/* Si `escrito` es `correcto` con un error de tecleo típico, cuál: dos dígitos
   vecinos invertidos, uno de más, uno de menos o uno cambiado. */
export function errorDeTecleo(correcto, escrito) {
  if (!Number.isInteger(correcto) || !Number.isInteger(escrito) || correcto < 0 || escrito < 0 || correcto === escrito) return null;
  const x = String(correcto);
  const y = String(escrito);
  const cuenta = `${formato(escrito)} en lugar de ${formato(correcto)}`;
  if (x.length === y.length) {
    const distintos = [...x].map((d, i) => (d !== y[i] ? i : -1)).filter((i) => i >= 0);
    if (distintos.length === 2 && distintos[1] === distintos[0] + 1 && x[distintos[0]] === y[distintos[1]] && x[distintos[1]] === y[distintos[0]]) {
      return { tipo: 'invertidos', texto: `dos dígitos invertidos (${cuenta})` };
    }
    if (distintos.length === 1) return { tipo: 'cambiado', texto: `un dígito distinto (${cuenta})` };
    return null;
  }
  const [largo, corto] = y.length > x.length ? [y, x] : [x, y];
  if (largo.length !== corto.length + 1) return null;
  for (let i = 0; i < largo.length; i += 1) {
    if (largo.slice(0, i) + largo.slice(i + 1) === corto) {
      return y.length > x.length ? { tipo: 'de-mas', texto: `un dígito de más (${cuenta})` } : { tipo: 'de-menos', texto: `un dígito de menos (${cuenta})` };
    }
  }
  return null;
}

/* ------------------------------------------------------------ explicar */

/* Explica un hallazgo para Dr. Mochi.
     h         el hallazgo, con su `evidencia` si es un descuadre
     celda     (casilla) => 'H14' | null, para nombrar las celdas
     esFormula (casilla) => boolean
   Devuelve { cuenta, conclusion, pregunta, comparaciones?, causas: [{ texto, casillas?, sugerencia?, confirmar?, detalle?, grupo?, recomendada? }] }
   donde sugerencia = { texto, cambios: { casilla: número } }. La primera
   sugerencia es la recomendada. `pregunta` es lo que la pantalla le pregunta
   al área (21/10/2026: cada error se presenta como una pregunta con sus
   respuestas a la vista). `confirmar`: la causa es «la cifra es real», que
   se responde confirmando; `detalle`: se responde mirando las tablas propias
   del área. `comparaciones` [{ clave, titulo, izquierda, derecha }], con cada
   lado { titulo, celdas: [{ casilla, etiqueta, valor }], resultado }: lo que no
   coincide, en cifras, para dibujarlo (un área que compara hojas las da; una
   suma que no cuadra, la pantalla la arma con su evidencia). Una causa con
   `grupo` responde a la comparación de esa clave.

   Un área puede explicar a su manera los hallazgos que el motor no conoce
   (`explicar` en su correccion.js, con los datos corregidos): si devuelve
   algo, manda. Así Centro Quirúrgico explica el cruce del RESUMEN con sus
   hojas. */
export function explicar(h, opciones = {}) {
  const propia = opciones.area ? areaDelBot(opciones.area)?.correccion?.explicar?.(h, opciones.datos, opciones) : null;
  if (propia) return { tipo: 'cuenta', ...propia };
  const pregunta = h.nivel === 'aviso' ? '¿Es real o es un error?' : '¿Cómo lo corrige?';
  return { pregunta, tipo: tipoDe(h), ...explicarComun(h, opciones) };
}

/* LOS TRES TIPOS DE ERROR (22/10/2026), para que la pantalla dibuje cada uno
   a su manera, igual en todas las áreas:
     · 'cuenta'     una suma u operación que no cuadra (lleva `evidencia`):
                    los dos lados frente a frente;
     · 'escritura'  una cifra mal escrita (letras, símbolos, decimales, signo):
                    lo escrito, con lo que sobra marcado, y lo que debería ser;
     · 'faltan'     casillas, filas o formatos sin dato: las casillas vacías.
   Cada área nombra sus reglas a su manera (la R9 de Farmacia es la de los
   enteros; sus blancos, un aviso): aquí se reúnen. */
const ESCRITURA = new Set(['no-numerico', 'entero']);
const FALTAN = new Set(['incompleto', 'blancos', 'formato-vacio', 'seccion-vacia', 'cuadro-ausente', 'insumo-sin-cantidad', 'confeccion-incompleta']);
function tipoDe(h) {
  if (h.evidencia) return 'cuenta';
  const regla = h.correccion ?? h.regla ?? String(h.id).split('|')[0];
  if (ESCRITURA.has(regla)) return 'escritura';
  if (FALTAN.has(regla)) return 'faltan';
  return null;
}

function explicarComun(h, { celda = () => null, esFormula = () => false, area = null, datos = null } = {}) {
  /* La casilla de un error de escritura o de una casilla vacía la sabe el
     área (su correccion.js): cada una las nombra a su manera (`f1|fila|día`
     en Nutrición, `escrito|…` o `parte|…` en Farmacia). El nombre armado
     aquí con formato, fila y día queda solo para quien no la diga. */
  const corr = area ? areaDelBot(area)?.correccion : null;
  const delArea = corr?.casillasDelHallazgo?.(h) ?? null;
  const leerDato = (casilla) => (corr && datos ? corr.leer(datos, casilla) : { valor: null, ilegible: null });
  const nombre = (casilla, etiqueta) => (celda(casilla) ? `${etiqueta} (${celda(casilla)})` : etiqueta);
  const ev = h.evidencia;
  /* Laboratorio lleva el código del hallazgo en `regla`; los errores de
     Nutrición, en `id`. Una casilla de Nutrición lleva además el día. Si la
     regla del área se llama de otra manera (la R9 de Farmacia es la de los
     enteros), el hallazgo dice en `correccion` cuál de estas es. */
  const regla = h.correccion ?? h.regla ?? h.id;
  const casillaDe = (fila, dia) => [h.formato, fila, dia].filter((x) => x != null).join('|');

  if (ev) {
    const { total, sumandos, suma } = ev;
    const d = total.valor - suma;
    const conCifra = sumandos.filter((s) => s.valor);
    const enCero = sumandos.length - conCifra.length;
    /* Hasta seis términos: con más, la cuenta ocupaba medio panel. */
    const MAXIMO = 6;
    const terminos = conCifra.slice(0, MAXIMO).map((s) => `${s.casilla && celda(s.casilla) ? celda(s.casilla) : s.etiqueta} ${formato(s.valor)}`);
    const cuenta = `${terminos.join(' + ') || '0'}${conCifra.length > MAXIMO ? ` + … (${conCifra.length - MAXIMO} más)` : ''}${enCero ? ` · ${enCero} en cero` : ''} = ${formato(suma)}`;
    const conclusion = `${nombre(total.casilla, total.etiqueta)} dice ${formato(total.valor)}, pero la suma da ${formato(suma)}: tiene ${formato(Math.abs(d))} ${d > 0 ? 'de más' : 'de menos'}.`;

    /* Una suma con decimales no es un total que proponer: lo que se cuenta va
       en enteros, así que el problema es la casilla con decimales. Si es una
       sola y con la cifra que cuadra queda un entero, se propone esa. */
    const decimales = sumandos.filter((s) => s.casilla && !s.calculado && s.valor != null && !Number.isInteger(s.valor));
    if (!Number.isInteger(suma) && decimales.length) {
      const [s] = decimales;
      // Redondeada: 1.7 + 15.3 no da 17 exacto en coma flotante.
      const nuevo = Math.round((s.valor + d) * 1e6) / 1e6;
      return {
        cuenta,
        conclusion,
        causas: [
          {
            texto: `La suma no es entera porque ${decimales.length === 1 ? `${nombre(s.casilla, s.etiqueta)} tiene decimales` : `${decimales.length} casillas tienen decimales`}. Corrija primero esa cifra: lo que se cuenta va en enteros.`,
            casillas: decimales.map((x) => x.casilla),
            ...(decimales.length === 1 && Number.isInteger(nuevo) && nuevo >= 0
              ? { sugerencia: { texto: `Poner ${formato(nuevo)} en ${celda(s.casilla) ?? s.etiqueta}`, cambios: { [s.casilla]: nuevo } } }
              : {}),
          },
        ],
      };
    }

    const corregirTotal = { texto: `Poner ${formato(suma)} en el total`, cambios: { [total.casilla]: suma } };
    const causas = [];

    const igual = sumandos.filter((s) => s.valor === Math.abs(d));
    if (igual.length === 1) {
      const s = igual[0];
      causas.push({
        texto: d > 0
          ? `La diferencia es exactamente ${formato(s.valor)}, lo que trae ${nombre(s.casilla, s.etiqueta)}: parece que se sumó dos veces.`
          : `La diferencia es exactamente ${formato(s.valor)}, lo que trae ${nombre(s.casilla, s.etiqueta)}: parece que el total no lo incluye.`,
        casillas: [s.casilla, ...(s.casillas ?? [])].filter(Boolean),
        sugerencia: corregirTotal,
      });
    }

    const tecleoTotal = errorDeTecleo(suma, total.valor);
    if (tecleoTotal && tecleoTotal.tipo !== 'cambiado') {
      causas.push({ texto: `El total parece mal tecleado: tiene ${tecleoTotal.texto}.`, casillas: [total.casilla], sugerencia: corregirTotal });
    }

    /* Un sumando mal tecleado: si con su cifra «arreglada» la suma da el total. */
    const candidatos = sumandos
      .filter((s) => s.casilla && !s.calculado && s.valor != null)
      .map((s) => ({ s, nuevo: s.valor + d, tecleo: errorDeTecleo(s.valor + d, s.valor) }))
      .filter((x) => x.nuevo >= 0 && x.tecleo);
    const fuertes = candidatos.filter((x) => x.tecleo.tipo !== 'cambiado');
    const elegidos = fuertes.length ? fuertes : candidatos.length === 1 ? candidatos : [];
    for (const { s, nuevo, tecleo } of elegidos.slice(0, 2)) {
      causas.push({
        texto: `¿O está mal ${nombre(s.casilla, s.etiqueta)}? Con ${formato(nuevo)} la suma daría justo el total; tiene ${tecleo.texto}.`,
        casillas: [s.casilla],
        sugerencia: { texto: `Poner ${formato(nuevo)} en ${celda(s.casilla) ?? s.etiqueta}`, cambios: { [s.casilla]: nuevo } },
      });
    }

    if (!causas.length) {
      causas.push({
        texto: 'Ninguna casilla explica la diferencia por sí sola. Las cifras que forman la suma son el dato y el total es su suma: lo más seguro es corregir el total, salvo que sepa que una cifra está mal.',
        casillas: [total.casilla],
        sugerencia: corregirTotal,
      });
    } else if (!causas[0].sugerencia || causas[0].sugerencia !== corregirTotal) {
      // La propuesta principal sigue siendo la suma: las casillas son el dato.
      causas.unshift({ texto: 'El total es la suma de sus casillas: lo primero es ponerle la suma.', casillas: [total.casilla], sugerencia: corregirTotal });
    }

    if (esFormula(total.casilla)) {
      causas.push({
        texto: `${celda(total.casilla) ?? 'El total'} es una fórmula y aun así no cuadra: su rango no abarca todas las casillas, o alguna casilla tiene texto en lugar de cifra. Al corregirla aquí se guarda la cifra, pero conviene revisar la fórmula en el libro.`,
        casillas: [total.casilla],
      });
    }
    return { cuenta, conclusion, causas };
  }

  const unaCasilla = () => delArea?.editables?.[0] ?? casillaDe(h.fila, h.dia);

  if (regla === 'no-numerico') {
    const casilla = unaCasilla();
    // Lo escrito: lo que guardó la lectura o, si no, el último «…» del título (el de Gineco-Obstetricia trae dos).
    const citas = [...String(h.titulo).matchAll(/«([^«»]*)»/g)].map((m) => m[1]);
    const texto = String(leerDato(casilla).ilegible ?? citas.at(-1) ?? '');
    const digitos = texto.replace(/[^\d]/g, '');
    return {
      cuenta: `${celda(casilla) ?? 'La casilla'} dice «${texto}»`,
      conclusion: 'Una casilla de datos solo puede tener una cifra. Con letras o símbolos el bot no la puede sumar y el total queda en duda.',
      causas: digitos
        ? [{ texto: `Parece que se coló un carácter al teclear: sin él dice ${digitos}.`, casillas: [casilla], sugerencia: { texto: `Poner ${formato(Number(digitos))}`, cambios: { [casilla]: Number(digitos) } } }]
        : [{ texto: 'No trae ninguna cifra: escriba la que corresponde (0 si no hubo nada que contar).', casillas: [casilla] }],
    };
  }

  if (regla === 'entero') {
    const casilla = unaCasilla();
    const v = leerDato(casilla).valor ?? Number(h.titulo.match(/^(-?[\d.]+)/)?.[1]);
    const arreglo = Number.isFinite(v) ? Math.round(Math.abs(v)) : null;
    return {
      cuenta: `${celda(casilla) ?? 'La casilla'} dice ${Number.isFinite(v) ? formato(v) : h.titulo.split(' ')[0]}`,
      conclusion: 'Lo que se cuenta va en enteros y no puede ser negativo.',
      causas: [
        {
          texto: v < 0 ? 'Parece que se tecleó un signo menos.' : 'Parece un decimal tecleado por error.',
          casillas: [casilla],
          ...(arreglo != null ? { sugerencia: { texto: `Poner ${formato(arreglo)}`, cambios: { [casilla]: arreglo } } } : {}),
        },
      ],
    };
  }

  /* Las casillas vacías (Farmacia las avisa como «blancos»: se suman como
     cero, pero conviene escribirlo). */
  if (regla === 'incompleto' || (regla === 'blancos' && delArea?.editables?.length)) {
    const casillas = delArea?.editables?.length ? delArea.editables : (h.casillas ?? []).map((c) => (typeof c === 'string' ? casillaDe(c) : casillaDe(c.fila, c.dia)));
    const refs = casillas.map(celda).filter(Boolean);
    return {
      cuenta: `${casillas.length} ${casillas.length === 1 ? 'casilla vacía' : 'casillas vacías'}${refs.length ? `: ${refs.slice(0, 8).join(', ')}${refs.length > 8 ? '…' : ''}` : ''}`,
      conclusion: 'Una casilla vacía no es cero: el bot no puede saber si no hubo nada que contar o si falta anotarlo.',
      causas: [
        {
          texto: 'Si no hubo nada que contar, lo correcto es escribir 0. Si lo hubo, escriba cada cifra en su casilla.',
          casillas,
          sugerencia: { texto: `Poner 0 en ${casillas.length === 1 ? 'la casilla vacía' : `las ${casillas.length} casillas vacías`}`, cambios: Object.fromEntries(casillas.map((c) => [c, 0])) },
        },
      ],
    };
  }

  /* Una ALERTA no es un error: la cifra puede ser real. Dr. Mochi propone el
     arreglo si parece de tecleo (un cero de más, dígitos repetidos) y, si no,
     queda confirmarla tal cual (Correccion.jsx). Ya no se escribe una
     justificación aparte (12/10/2026). */
  if (regla === 'atipico' && h.valor != null && h.referencia != null) {
    const casilla = casillaDe(h.fila, h.dia);
    const causas = [];
    /* Un dígito de más es lo típico (100 por 10): se prueba quitando cada uno y
       se queda el que deja la cifra más cerca de lo habitual, si queda cerca. */
    const texto = String(h.valor);
    const candidato = [...texto]
      .map((_, i) => Number(texto.slice(0, i) + texto.slice(i + 1)))
      .filter((n) => Number.isInteger(n) && Math.abs(n - h.referencia) <= Math.max(5, h.referencia))
      .sort((a, b) => Math.abs(a - h.referencia) - Math.abs(b - h.referencia))[0];
    const tecleo = candidato != null ? errorDeTecleo(candidato, h.valor) : null;
    if (tecleo) {
      causas.push({
        texto: `Parece un error de tecleo: tiene ${tecleo.texto}. Con ${formato(candidato)} queda como el resto del mes.`,
        casillas: [casilla],
        sugerencia: { texto: `Poner ${formato(candidato)}`, cambios: { [casilla]: candidato } },
      });
    }
    causas.push({
      texto: 'Si la cifra es real —un brote, una campaña, un servicio que se llenó—, confírmela: el reporte se envía con ella y Estadística sabe que se revisó.',
      casillas: [casilla],
      confirmar: true,
    });
    return {
      cuenta: `${celda(casilla) ?? 'La casilla'} dice ${formato(h.valor)}; el resto de la fila ronda las ${formato(h.referencia)}`,
      conclusion: `Es ${formato(Math.round(h.valor / Math.max(1, h.referencia)))} veces lo habitual en esa fila. Puede ser real o un error al teclear.`,
      causas,
    };
  }

  /* Las alertas sin casilla (la variación frente al mes anterior, una sección
     sin atenciones): no hay nada que corregir aquí; se confirman o se corrige
     el Excel. */
  if (h.nivel === 'aviso' || regla === 'variacion' || regla === 'seccion-vacia' || regla === 'fila-sin-rotulo') {
    return {
      cuenta: null,
      conclusion: h.detalle ?? '',
      causas: [{ texto: 'Si es real, confírmela. Si es un error, corrija su Excel y vuelva a subirlo.', confirmar: true }],
    };
  }

  return { cuenta: null, conclusion: h.detalle ?? '', causas: [{ texto: 'Este error no se corrige desde aquí: corríjalo en el Excel y vuelva a subirlo.' }] };
}

/* -------------------------------------------- abrir, revalidar, devolver */

/* La hoja como la ve el área en Excel: una celda de duración ([h]:mm) guarda
   días y se muestra en horas:minutos («997:57»), no como 41,58. */
function comoSeVe(hoja) {
  const duraciones = new Set(hoja.duraciones ?? []);
  if (!duraciones.size) return hoja;
  const enHoras = (dias) => {
    const minutos = Math.round(Math.abs(dias) * 24 * 60);
    return `${dias < 0 ? '-' : ''}${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
  };
  const valores = Object.fromEntries(Object.entries(hoja.valores).map(([ref, v]) => [ref, duraciones.has(ref) && typeof v === 'number' ? enHoras(v) : v]));
  return { ...hoja, valores };
}

/* Abre un archivo para corregirlo: el informe del bot (como en una carga) y
   las celdas de la hoja leída. null si el área no se corrige así. */
export async function abrirCorreccion(bytes, { area, periodo, anterior = null, nombre, fecha } = {}) {
  const a = areaDelBot(area);
  if (!a?.correccion) return null;
  const leido = await validarArchivo(bytes, { area, periodo, anterior, nombre, fecha });
  if (leido.bloqueo) return { informe: leido };
  /* El origen, con la celda de cada casilla (Nutrición guarda solo dónde
     empieza cada fila). Solo para corregir: el informe que se guarda no cambia. */
  const informe = { ...leido, origen: a.correccion.expandirOrigen(leido.origen, leido.datos) };
  const hojas = {};
  const word = await esDocumento(bytes);
  if (word) {
    const documento = await leerDocumento(bytes);
    for (const o of Object.values(informe.origen)) if (o?.hoja && o.tabla != null && !hojas[o.hoja] && documento.tablas[o.tabla]) hojas[o.hoja] = hojaDeTabla(documento.tablas[o.tabla]);
  } else {
    const libro = await leerLibro(bytes);
    for (const o of Object.values(informe.origen)) if (o?.hoja && !hojas[o.hoja]) hojas[o.hoja] = comoSeVe(await libro.celdas(o.hoja));
  }
  return { informe, hoja: a.correccion.hojaDe(informe.origen), hojas, tipo: word ? 'docx' : 'xlsx' };
}

/* Los datos con unos cambios y lo que dice el bot de ellos. */
export function revalidar(area, base, cambios, { origen, periodo, anterior = null, fecha } = {}) {
  const c = areaDelBot(area).correccion;
  const datos = c.aplicar(base, cambios, origen);
  return { datos, informe: informeDe({ area, datos, periodo, anterior, fecha }) };
}

/* El libro corregido: los mismos bytes, con solo las celdas que cambiaron
   (nombradas «HOJA!REF», en una o varias hojas). Un Word, igual, tabla por tabla. */
export async function libroCorregido(bytes, area, { base, datos, origen }) {
  const celdas = areaDelBot(area).correccion.celdasCambiadas(base, datos, origen);
  if (await esDocumento(bytes)) {
    const tablaDe = new Map(Object.values(origen).filter((o) => o?.tabla != null).map((o) => [o.hoja, o.tabla]));
    const cambios = Object.entries(celdas).map(([nombre, valor]) => {
      const i = nombre.lastIndexOf('!');
      return { tabla: tablaDe.get(nombre.slice(0, i)), ref: nombre.slice(i + 1), valor };
    });
    return { bytes: await parchearDocumento(bytes, cambios), celdas };
  }
  const porHoja = {};
  for (const [nombre, valor] of Object.entries(celdas)) {
    const i = nombre.lastIndexOf('!');
    (porHoja[nombre.slice(0, i)] ??= {})[nombre.slice(i + 1)] = valor;
  }
  return { bytes: await parchearHojas(bytes, porHoja), celdas };
}
