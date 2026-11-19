/* Formato DIRESA de Servicios Intermedios (MINSA, modelo 2024).

   196 columnas, en el mismo orden que el Excel oficial: identificación (A–J),
   Laboratorio y Anatomía Patológica (K–ET), Diagnóstico por Imágenes (EU–FR),
   Nutrición (FS–GA), Lavandería (GB–GE), Farmacia y Ambulancia (GF–GM) y camas
   (GN). El hospital ocupa la fila de orden 143.

   Las columnas no se escriben a mano: se generan recorriendo la estructura, y
   la prueba de humo comprueba que la columna 196 sea GN y que cada bloque caiga
   en su letra. Un desplazamiento de una columna mandaría los glucosas de
   hospitalización a la celda de la creatinina sin que nadie lo note.

   Cada campo es de uno de tres tipos:
     auto       identificación, autocompletada y fija
     manual     dato de un área o de Estadística
     calculado  suma de otras columnas; en el Excel es una fórmula que no debe
                escribirse, y aquí tampoco se escribe */

import { GRUPOS_LABORATORIO, ITEMS_ANATOMIA, EXAMENES_IMAGENES, SERVICIOS } from '../formatos/areas-simuladas.js';
import { totalF1, totalServicio } from '../formatos/lavanderia-calculos.js';
import { valorDiresa, DETALLE_DIRESA } from '../formatos/imagenes-calculos.js';
import { racionesDiresa } from '../formatos/nutricion-calculos.js';
import { valorDiresaLaboratorio, detalleDiresaLaboratorio } from '../formatos/laboratorio-calculos.js';
import { recetasDiresa, detalleDiresaFarmacia } from '../formatos/farmacia-calculos.js';
import { fuentesDe } from './fuentes.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';

export function letraColumna(n) {
  let s = '';
  let resto = n;
  while (resto > 0) {
    const r = (resto - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    resto = Math.floor((resto - 1) / 26);
  }
  return s;
}

/* Identificación del hospital. Predeterminada: no cambia de un mes a otro.
   Nivel, distrito y ubigeo deben verificarse contra RENIPRESS antes del uso
   real; el código y el número de orden son los del formato analizado. */
export const IDENTIFICACION_HRL = Object.freeze({
  orden: 143,
  nivel: 'III-1',
  renipress: '00000003',
  nombre: 'HOSPITAL REGIONAL DE LORETO',
  departamento: 'LORETO',
  provincia: 'MAYNAS',
  distrito: 'PUNCHANA',
  ubigeo: '160108',
});

export const AREAS_SERVICIOS_INTERMEDIOS = Object.freeze(['laboratorio', 'imagenes', 'nutricion', 'lavanderia', 'farmacia']);

const TOTAL = Object.freeze({ clave: 'total', label: 'Total' });
const GENERAL = Object.freeze({ clave: 'general', label: 'Total general' });

/* Tablas con que se muestra el formato. Cada campo cae en una celda
   (tabla, fila, columna); la tabla no cambia el orden de columnas del Excel. */
export const SECCIONES = Object.freeze([
  Object.freeze({ clave: 'id', titulo: '0. Identificación del establecimiento y periodo', areas: [] }),
  Object.freeze({ clave: 'A', titulo: 'A. Laboratorio y Anatomía Patológica', areas: ['laboratorio'] }),
  Object.freeze({ clave: 'B', titulo: 'B. Diagnóstico por Imágenes', areas: ['imagenes'] }),
  Object.freeze({ clave: 'C', titulo: 'C. Nutrición y Dietética', areas: ['nutricion'] }),
  Object.freeze({ clave: 'D', titulo: 'D. Lavandería', areas: ['lavanderia'] }),
  Object.freeze({ clave: 'E', titulo: 'E. Otros servicios: Farmacia y Ambulancia', areas: ['farmacia'], propios: true }),
  Object.freeze({ clave: 'F', titulo: 'F. Camas', areas: [], propios: true }),
]);

export const TABLAS = Object.freeze([
  Object.freeze({ clave: 'lab-totales', seccion: 'A', titulo: 'Totales por tipo de examen', filas: GRUPOS_LABORATORIO.map((g) => ({ clave: g.clave, label: g.titulo })), columnas: SERVICIOS }),
  ...GRUPOS_LABORATORIO.map((g) =>
    Object.freeze({ clave: `lab-${g.clave}`, seccion: 'A', titulo: g.titulo, filas: [...g.items, TOTAL], columnas: SERVICIOS }),
  ),
  Object.freeze({ clave: 'anatomia', seccion: 'A', titulo: 'Anatomía patológica y examen completo de orina', filas: ITEMS_ANATOMIA, columnas: [...SERVICIOS, GENERAL] }),
  Object.freeze({ clave: 'imagenes', seccion: 'B', titulo: 'Exámenes por imágenes', filas: EXAMENES_IMAGENES, columnas: [...SERVICIOS, GENERAL] }),
  Object.freeze({
    clave: 'nutricion',
    seccion: 'C',
    titulo: 'Raciones',
    filas: [{ clave: 'pacientes', label: 'Para pacientes' }, { clave: 'personal', label: 'Para personal' }, { clave: 'total', label: 'Total de raciones' }],
    columnas: SERVICIOS,
  }),
  Object.freeze({ clave: 'lavanderia', seccion: 'D', titulo: 'Kilogramos de ropa lavada', filas: [{ clave: 'kg', label: 'Ropa lavada' }], columnas: [...SERVICIOS, TOTAL] }),
  Object.freeze({
    clave: 'otros',
    seccion: 'E',
    titulo: 'Recetas y traslados',
    filas: [{ clave: 'recetas', label: 'Farmacia: recetas despachadas' }, { clave: 'traslados', label: 'Ambulancia: traslados efectuados' }],
    columnas: [...SERVICIOS, GENERAL],
  }),
  Object.freeze({ clave: 'camas', seccion: 'F', titulo: 'Camas', filas: [{ clave: 'camas', label: 'Total camas hospitalarias' }], columnas: [TOTAL] }),
]);

const TRASLADO = { hosp: 'trasladosHosp', emerg: 'trasladosEmerg', ce: 'trasladosCE' };

/* Lo que el hospital no hace: va en 0 todos los meses, no vacío. Lo confirmó Estadística el
   07/11/2026 («no tenemos esos servicios»); antes iba vacío porque ningún oficio lo reporta, y
   un vacío diría «no se sabe». Si el hospital abre alguno de estos servicios, se quita de aquí
   y el dato se pide en el oficio del área. */
export const SIN_SERVICIO = Object.freeze({
  'img.fotoradiograficos': 'El hospital no hace fotoradiografías: va en 0 todos los meses (Estadística, 07/11/2026).',
  'img.dentales': 'El hospital no toma placas dentales: va en 0 todos los meses (Estadística, 07/11/2026).',
  'nut.ce': 'Nutrición no da raciones en consulta externa: va en 0 todos los meses (Estadística, 07/11/2026).',
});
const sinServicio = (grupo, a, b) => SIN_SERVICIO[`${grupo}.${a}`] ?? SIN_SERVICIO[`${grupo}.${b}`] ?? null;

/* ------------------------------------------------------- las 196 columnas */

function construirCampos() {
  const lista = [];
  const agregar = (campo) => {
    const n = lista.length + 1;
    lista.push(Object.freeze({ ...campo, n, col: letraColumna(n) }));
  };
  const mes = (p) => etiquetaPeriodo(p).split(' ')[0].toUpperCase();
  const H = IDENTIFICACION_HRL;

  /* 0. Identificación (A–J). `tipoExcel` dice cómo está en el Excel; aquí
     todos se autocompletan. */
  const id = (clave, label, tipoExcel, valor) => agregar({ clave: `id.${clave}`, seccion: 'id', tabla: 'id', label, tipo: 'auto', tipoExcel, valor });
  id('orden', 'N° de orden', 'manual', () => H.orden);
  id('nivel', 'Nivel de complejidad', 'calculado', () => H.nivel);
  id('renipress', 'Código RENIPRESS', 'calculado', () => H.renipress);
  id('hospital', 'Hospital / Instituto', 'manual', () => `${H.nivel} - ${H.renipress} - ${H.nombre}`);
  id('diresa', 'DIRESA / DISA', 'calculado', () => H.departamento);
  id('departamento', 'Departamento', 'manual', () => H.departamento);
  id('provincia', 'Provincia', 'manual', () => H.provincia);
  id('distrito', 'Distrito', 'manual', () => H.distrito);
  id('ubigeo', 'Ubigeo', 'manual', () => H.ubigeo);
  id('mes', 'Mes', 'manual', (p) => mes(p));

  /* A. Totales por grupo y servicio (K–Y). Su clave no puede terminar en «.grupo»: es
     la del ítem «Grupo sanguíneo» de hematológicos, y hasta el 07/11/2026 ese ítem
     salía con el total de hematológicos (enero: 2 888 en vez de 331). */
  for (const g of GRUPOS_LABORATORIO) {
    for (const s of SERVICIOS) {
      agregar({
        clave: `lab.${g.clave}.${s.clave}.totalDelGrupo`,
        seccion: 'A',
        tabla: 'lab-totales',
        fila: g.clave,
        columna: s.clave,
        label: `Total ${g.titulo.toLowerCase()} – ${s.label}`,
        tipo: 'calculado',
        sumaDe: [`lab.${g.clave}.${s.clave}.total`],
      });
    }
  }

  /* A. Detalle por grupo, servicio e ítem, con su total (Z–DZ). */
  for (const g of GRUPOS_LABORATORIO) {
    for (const s of SERVICIOS) {
      for (const it of g.items) {
        agregar({
          clave: `lab.${g.clave}.${s.clave}.${it.clave}`,
          seccion: 'A',
          tabla: `lab-${g.clave}`,
          fila: it.clave,
          columna: s.clave,
          label: `${g.titulo} – ${s.label} – ${it.label}`,
          tipo: 'manual',
          origen: { area: 'laboratorio', derivar: (datos) => valorDiresaLaboratorio(datos, g.clave, it.clave, s.clave), detalle: detalleDiresaLaboratorio(g.clave, it.clave) },
        });
      }
      agregar({
        clave: `lab.${g.clave}.${s.clave}.total`,
        seccion: 'A',
        tabla: `lab-${g.clave}`,
        fila: 'total',
        columna: s.clave,
        label: `${g.titulo} – ${s.label} – Total`,
        tipo: 'calculado',
        sumaDe: g.items.map((it) => `lab.${g.clave}.${s.clave}.${it.clave}`),
      });
    }
  }

  /* A. Anatomía patológica y orina: total general (EA–EE) y por servicio. */
  for (const it of ITEMS_ANATOMIA) {
    agregar({
      clave: `ap.general.${it.clave}`,
      seccion: 'A',
      tabla: 'anatomia',
      fila: it.clave,
      columna: 'general',
      label: `Total general – ${it.label}`,
      tipo: 'calculado',
      sumaDe: SERVICIOS.map((s) => `ap.${s.clave}.${it.clave}`),
    });
  }
  for (const s of SERVICIOS) {
    for (const it of ITEMS_ANATOMIA) {
      agregar({
        clave: `ap.${s.clave}.${it.clave}`,
        seccion: 'A',
        tabla: 'anatomia',
        fila: it.clave,
        columna: s.clave,
        label: `${s.label} – ${it.label}`,
        tipo: 'manual',
        origen: { area: 'laboratorio', derivar: (datos) => valorDiresaLaboratorio(datos, 'anatomia', it.clave, s.clave), detalle: detalleDiresaLaboratorio('anatomia', it.clave) },
      });
    }
  }

  /* B. Imágenes: total general (EU–EZ) y por servicio (FA–FR). */
  for (const it of EXAMENES_IMAGENES) {
    agregar({
      clave: `img.general.${it.clave}`,
      seccion: 'B',
      tabla: 'imagenes',
      fila: it.clave,
      columna: 'general',
      label: `Total general – ${it.label}`,
      tipo: 'calculado',
      sumaDe: SERVICIOS.map((s) => `img.${s.clave}.${it.clave}`),
    });
  }
  for (const s of SERVICIOS) {
    for (const it of EXAMENES_IMAGENES) {
      agregar({
        clave: `img.${s.clave}.${it.clave}`,
        seccion: 'B',
        tabla: 'imagenes',
        fila: it.clave,
        columna: s.clave,
        label: `${s.label} – ${it.label}`,
        tipo: 'manual',
        /* Imágenes no envía estas seis filas tal cual: se reparten desde sus
           cuatro hojas. `detalle` dice de cuál sale cada una. */
        origen: sinServicio('img', it.clave)
          ? { sinServicio: sinServicio('img', it.clave) }
          : { area: 'imagenes', derivar: (datos) => valorDiresa(datos, it.clave, s.clave), detalle: DETALLE_DIRESA[it.clave] },
      });
    }
  }

  /* C. Nutrición (FS–GA). */
  for (const s of SERVICIOS) {
    for (const tipo of ['pacientes', 'personal']) {
      agregar({
        clave: `nut.${s.clave}.${tipo}`,
        seccion: 'C',
        tabla: 'nutricion',
        fila: tipo,
        columna: s.clave,
        label: `${s.label} – Para ${tipo}`,
        tipo: 'manual',
        /* Pacientes: cuadros 3 y 4 del oficio; personal: cuadros 1 y 2. El
           oficio no tiene consultorio externo: no hay ese servicio (SIN_SERVICIO). */
        origen: sinServicio('nut', s.clave)
          ? { sinServicio: sinServicio('nut', s.clave) }
          : { area: 'nutricion', derivar: (datos, periodo) => racionesDiresa(datos, periodo, tipo, s.clave) },
      });
    }
    agregar({
      clave: `nut.${s.clave}.total`,
      seccion: 'C',
      tabla: 'nutricion',
      fila: 'total',
      columna: s.clave,
      label: `${s.label} – Total de raciones`,
      tipo: 'calculado',
      sumaDe: [`nut.${s.clave}.pacientes`, `nut.${s.clave}.personal`],
    });
  }

  /* D. Lavandería (GB–GE). Sale del Formato 1 agrupado: emergencia y
     consultorios externos son sus propias filas, el resto es hospitalización. */
  for (const s of SERVICIOS) {
    agregar({
      clave: `lav.${s.clave}`,
      seccion: 'D',
      tabla: 'lavanderia',
      fila: 'kg',
      columna: s.clave,
      label: s.label,
      tipo: 'manual',
      origen: { area: 'lavanderia', derivado: s.clave },
    });
  }
  agregar({ clave: 'lav.total', seccion: 'D', tabla: 'lavanderia', fila: 'kg', columna: 'total', label: 'Total de kg de ropa lavada', tipo: 'calculado', sumaDe: SERVICIOS.map((s) => `lav.${s.clave}`) });

  /* E. Farmacia y ambulancia (GF–GM). */
  agregar({ clave: 'otros.general.recetas', seccion: 'E', tabla: 'otros', fila: 'recetas', columna: 'general', label: 'Total general – Recetas despachadas', tipo: 'calculado', sumaDe: SERVICIOS.map((s) => `otros.${s.clave}.recetas`) });
  agregar({ clave: 'otros.general.traslados', seccion: 'E', tabla: 'otros', fila: 'traslados', columna: 'general', label: 'Total general – Traslados efectuados', tipo: 'calculado', sumaDe: SERVICIOS.map((s) => `otros.${s.clave}.traslados`) });
  for (const s of SERVICIOS) {
    agregar({
      clave: `otros.${s.clave}.recetas`,
      seccion: 'E',
      tabla: 'otros',
      fila: 'recetas',
      columna: s.clave,
      label: `${s.label} – Farmacia: recetas despachadas`,
      tipo: 'manual',
      /* Las mismas tres columnas (hosp, emerg, ce) de siempre, ahora desde el
         Formato 1 de Farmacia: las atenciones SIS de cada servicio. Es una de
         tres lecturas posibles de «recetas despachadas»; `detalle` lo dice. */
      origen: { area: 'farmacia', derivar: (datos) => recetasDiresa(datos, s.clave), detalle: detalleDiresaFarmacia(s.clave) },
    });
    agregar({
      clave: `otros.${s.clave}.traslados`,
      seccion: 'E',
      tabla: 'otros',
      fila: 'traslados',
      columna: s.clave,
      label: `${s.label} – Ambulancia: traslados efectuados`,
      tipo: 'manual',
      /* Ninguna de las nueve áreas registra la ambulancia: lo digita Estadística. */
      origen: { propio: TRASLADO[s.clave] },
    });
  }

  /* F. Camas (GN). Misma fuente que el denominador de «Rendimiento cama». */
  agregar({ clave: 'camas', seccion: 'F', tabla: 'camas', fila: 'camas', columna: 'total', label: 'Total camas hospitalarias', tipo: 'manual', origen: { propio: 'camas' } });

  return Object.freeze(lista);
}

export const CAMPOS_SI = construirCampos();
{
  const repetidas = CAMPOS_SI.map((c) => c.clave).filter((k, i, todas) => todas.indexOf(k) !== i);
  if (repetidas.length) throw new Error(`Servicios intermedios: claves repetidas (${repetidas.join(', ')}). Una pisaría a la otra.`);
}
const POR_CLAVE = new Map(CAMPOS_SI.map((c) => [c.clave, c]));

/* Fórmula tal como la escribiría el Excel, con letras de columna. */
export function formulaDe(campo) {
  if (!campo.sumaDe) return null;
  const cols = campo.sumaDe.map((k) => POR_CLAVE.get(k).col);
  if (cols.length === 1) return `=${cols[0]}`;
  const nums = campo.sumaDe.map((k) => POR_CLAVE.get(k).n);
  const contiguas = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  return contiguas ? `=SUMA(${cols[0]}:${cols.at(-1)})` : `=${cols.join('+')}`;
}

function derivarLavanderia(datos, periodo, servicio) {
  const f1 = datos?.f1;
  if (!f1) return null;
  const emergencia = totalServicio(f1, 'emergencia', periodo);
  const externos = totalServicio(f1, 'c-externos', periodo);
  if (servicio === 'emerg') return emergencia;
  if (servicio === 'ce') return externos;
  const total = totalF1(f1, periodo);
  return total == null ? null : total - (emergencia ?? 0) - (externos ?? 0);
}

/* Arma el formato completo de un periodo.

   Devuelve cada campo con su valor —null cuando no hay dato, nunca cero— y
   con el estado de su fuente, para que la pantalla pueda decir por qué una
   celda está vacía. */
export function construirServiciosIntermedios(periodo, reportes, propios) {
  const fuentes = fuentesDe(reportes, AREAS_SERVICIOS_INTERMEDIOS, periodo);
  const delPeriodo = propios?.[periodo] ?? {};
  const valores = new Map();

  const valorDe = (campo) => {
    if (valores.has(campo.clave)) return valores.get(campo.clave);
    let v = null;
    if (campo.tipo === 'auto') {
      v = campo.valor(periodo);
    } else if (campo.tipo === 'calculado') {
      const partes = campo.sumaDe.map((k) => valorDe(POR_CLAVE.get(k)));
      const hay = partes.filter((x) => x != null);
      v = hay.length ? hay.reduce((a, b) => a + b, 0) : null;
    } else if (campo.origen.sinServicio) {
      v = 0;
    } else if (campo.origen.propio) {
      v = delPeriodo[campo.origen.propio] ?? null;
    } else {
      const fuente = fuentes[campo.origen.area];
      if (fuente.datos) {
        v = campo.origen.derivar
          ? campo.origen.derivar(fuente.datos, periodo)
          : campo.origen.derivado
            ? derivarLavanderia(fuente.datos, periodo, campo.origen.derivado)
            : campo.origen.ruta.reduce((nodo, k) => nodo?.[k], fuente.datos) ?? null;
      }
    }
    valores.set(campo.clave, v);
    return v;
  };

  const campos = CAMPOS_SI.map((c) => ({ ...c, valor: valorDe(c), formula: formulaDe(c) }));
  const manuales = campos.filter((c) => c.tipo === 'manual');

  return {
    periodo,
    campos,
    fuentes,
    manualesConDato: manuales.filter((c) => c.valor != null).length,
    manuales: manuales.length,
    calculados: campos.filter((c) => c.tipo === 'calculado').length,
    faltantes: Object.values(fuentes).filter((f) => f.estado !== 'validado'),
  };
}

export function celda(resultado, tabla, fila, columna) {
  return resultado.campos.find((c) => c.tabla === tabla && c.fila === fila && c.columna === columna) ?? null;
}

/* Filas para CSV: letras, nombres y la fila del hospital. */
export function filasCsvServiciosIntermedios(resultado) {
  return [
    resultado.campos.map((c) => c.col),
    resultado.campos.map((c) => c.label),
    resultado.campos.map((c) => c.valor),
  ];
}
