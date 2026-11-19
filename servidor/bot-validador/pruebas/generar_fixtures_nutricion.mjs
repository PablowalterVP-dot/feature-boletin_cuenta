/* Genera los fixtures de pruebas/fixtures/: la MISMA estructura real del
   Excel de Nutrición (hojas con espacios de más, fila de días movida, columna
   TOTAL según los días del mes, etiquetas con sus errores de tipeo, filas que
   aparecen o desaparecen entre meses) pero con cifras inventadas — los
   archivos reales (`insumos/nutricion/`, fuera de git) no se suben al
   repositorio.

   Se corre una vez, a mano, cuando hace falta un fixture nuevo:
     node pruebas/generar_fixtures_nutricion.mjs

   Cada quirk de aquí está confirmado abriendo los 9 archivos reales de enero
   a setiembre de 2026 (ver app/herramientas/configurar_nutricion_real.py, en
   el backend, que documenta lo mismo del lado de la configuración). */

import { crearLibro } from '../src/xlsx.js';
import { writeFileSync } from 'node:fs';

const DIAS_DE_31 = 31;
const DIAS_DE_30 = 30;

/* Una fila de un grupo: etiqueta de grupo (solo en la primera comida, null
   después — así aparece en el archivo real), etiqueta de comida, y los
   valores de cada día. `null` dibuja la celda vacía (no cero). */
function filaDeGrupo(etiquetaGrupo, etiquetaComida, valoresPorDia) {
  const fila = [etiquetaGrupo, etiquetaComida];
  let total = 0;
  for (const v of valoresPorDia) {
    fila.push(v);
    if (typeof v === 'number') total += v;
  }
  fila.push(total);
  return fila;
}

function diasFijos(n, valor) {
  return Array.from({ length: n }, () => valor);
}

function filaDiasHeader(n) {
  const fila = [null, null];
  for (let d = 1; d <= n; d += 1) fila.push(d);
  fila.push('TOTAL');
  return fila;
}

function tituloFila(texto) {
  return [texto];
}

/* ---- COMENSALES HOSP: fila de días en la 4 (hay un subtítulo de más) ---- */
function hojaComensalesHosp(mes, n, { conInternosNuevos, dosBloquesEnfermeria }) {
  const filas = [
    tituloFila(`NUTRICIÓN Y DIETÉTICA: ${mes}`),
    tituloFila('COMENSALES PERSONAL ASISTENCIAL Y ADMINISTRATIVOS'),
    tituloFila('SERVICIO DE HOSPITALIZACIÓN'),
    filaDiasHeader(n),
    filaDeGrupo('ASIST.  Y ADMINIST.', 'DESAYUNO', diasFijos(n, 160)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 280)),
    filaDeGrupo(null, 'CENA', diasFijos(n, 160)),
    filaDeGrupo('INT MED UNAP', 'DESAYUNO', diasFijos(n, 20)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 20)),
    filaDeGrupo(null, 'COMIDA', diasFijos(n, 20)), // "COMIDA", no "CENA": así es en el archivo real
  ];
  if (dosBloquesEnfermeria) {
    // Los dos bloques casi iguales que aparecen de enero a abril en el
    // archivo real (sin punto y con punto) — a propósito, para probar que el
    // lector no los fusiona por sí solo.
    filas.push(
      filaDeGrupo('INT ENF UNSM', 'DESAYUNO', diasFijos(n, 16)),
      filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 16)),
      filaDeGrupo(null, 'COMIDA', diasFijos(n, 16)),
      filaDeGrupo('INT. ENF UNSM', 'DESAYUNO', diasFijos(n, 2)),
      filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 2)),
      filaDeGrupo(null, 'COMIDA', diasFijos(n, 2)),
    );
  } else {
    // Desde mayo: solo la variante con punto.
    filas.push(
      filaDeGrupo('INT. ENF UNSM', 'DESAYUNO', diasFijos(n, 2)),
      filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 2)),
      filaDeGrupo(null, 'COMIDA', diasFijos(n, 2)),
    );
  }
  if (conInternosNuevos) {
    // Desde mayo: dos grupos que antes no existían.
    filas.push(
      filaDeGrupo('INT OBT  UNSM', 'DESAYUNO', diasFijos(n, 16)),
      filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 16)),
      filaDeGrupo(null, 'COMIDA', diasFijos(n, 16)),
      filaDeGrupo('INT. NUT', 'DESAYUNO', diasFijos(n, 3)),
      filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 3)),
    );
  }
  filas.push(tituloFila('TOTAL'));
  return filas;
}

/* ---- COMENSALES EMERG: misma fila de días (4), con o sin PATRIMONIO ---- */
function hojaComensalesEmerg(mes, n, { conPatrimonio }) {
  const filas = [
    tituloFila(`NUTRICIÓN Y DIETÉTICA: ${mes}`),
    tituloFila('COMENSALES PERSONAL ASISTENCIAL Y ADMINISTRATIVOS'),
    tituloFila('SERVICIO DE EMERGENCIA'),
    filaDiasHeader(n),
    filaDeGrupo('DIRECCION GENERAL', 'DESAYUNO', diasFijos(n, 3)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 3)),
  ];
  if (conPatrimonio) {
    // Un grupo de un solo mes, con una sola comida. Se cataloga como grupo
    // de la emergencia con desayuno y almuerzo (decisión del 05/10/2026,
    // siguiendo la plantilla); su desayuno de ese mes queda como fila ausente.
    filas.push(filaDeGrupo('PATRIMONIO', 'ALMUERZO', diasFijos(n, 11)));
  }
  filas.push(
    filaDeGrupo('RESIDUOS SOLIDOS', 'DESAYUNO', diasFijos(n, 5)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 5)),
    // "DIETETTICA", doble T: así en los 9 meses reales, no se corrige.
    filaDeGrupo('DPTO DE NUTRICION Y DIETETTICA', 'DESAYUNO', diasFijos(n, 15)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 15)),
    filaDeGrupo(null, 'CENA', diasFijos(n, 3)),
    tituloFila('TOTAL'),
  );
  return filas;
}

/* ---- PACIENTES HOSP: fila de días en la 3 ---- */
function hojaPacientesHosp(mes, n) {
  return [
    tituloFila(`NUTRICIÓN Y DIETÉTICA: ${mes}`),
    tituloFila('COMENSALES DE   PACIENTES'),
    filaDiasHeader(n),
    tituloFila('SERVICIO DE HOSPITALIZACIÓN'),
    filaDeGrupo('COMPLETA', 'DESAYUNO', diasFijos(n, 65)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 70)),
    filaDeGrupo(null, 'CENA', diasFijos(n, 65)),
    filaDeGrupo('BLANDAS', 'DESAYUNO', diasFijos(n, 70)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 75)),
    filaDeGrupo(null, 'CENA', diasFijos(n, 70)),
    filaDeGrupo('LICUADAS', 'DESAYUNO', diasFijos(n, 14)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 14)),
    filaDeGrupo(null, 'CENA', diasFijos(n, 14)),
    filaDeGrupo('LIQUIDAS', 'DESAYUNO', diasFijos(n, 15)),
    filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 12)),
    filaDeGrupo(null, 'CENA', diasFijos(n, 13)),
    tituloFila('TOTAL'),
  ];
}

/* ---- PACIENTES EMERG: fila de días en la 3; opción sin etiqueta ---- */
function hojaPacientesEmerg(mes, n, { sinEtiqueta = false } = {}) {
  const filas = [
    tituloFila(`NUTRICIÓN Y DIETÉTICA  PACIENTES - ${mes}`),
    tituloFila('COMENSALES DE   PACIENTES'),
    filaDiasHeader(n),
    tituloFila('SERVICIO DE EMERGENCIA'),
  ];
  if (sinEtiqueta) {
    // El caso real de setiembre: la fila trae cifras pero ni el grupo (A) ni
    // la comida (B) tienen etiqueta. El cuadro tiene un solo grupo y las
    // otras dos comidas sí están rotuladas: se lee por su lugar como
    // desayuno y sale un AVISO que pide confirmarlo (no se pierde en silencio).
    filas.push(
      filaDeGrupo(null, null, diasFijos(n, 44)),
      filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 42)),
      filaDeGrupo(null, 'CENA', diasFijos(n, 43)),
    );
  } else {
    filas.push(
      filaDeGrupo('SIS', 'DESAYUNO', diasFijos(n, 44)),
      filaDeGrupo(null, 'ALMUERZO', diasFijos(n, 42)),
      filaDeGrupo(null, 'CENA', diasFijos(n, 43)),
    );
  }
  filas.push(tituloFila('TOTAL'));
  return filas;
}

function libroDe(mes, n, opciones) {
  return crearLibro({
    hojas: [
      // Los nombres de hoja llevan los espacios de más tal cual están en el
      // archivo real: es lo que el lector tiene que normalizar.
      { nombre: 'COMENSALES EMERG', filas: hojaComensalesEmerg(mes, n, opciones) },
      { nombre: 'COMENSALES HOSP  ', filas: hojaComensalesHosp(mes, n, opciones) },
      { nombre: 'PACIENTES EMERG', filas: hojaPacientesEmerg(mes, n, opciones) },
      { nombre: 'PACIENTES HOSP', filas: hojaPacientesHosp(mes, n) },
    ],
    nombres: [], // el archivo real no tiene ningún nombre definido
  });
}

const FIXTURES = [
  {
    archivo: 'nutricion_tipico.xlsx',
    descripcion: 'Un mes típico (31 días, como julio): los grupos ya estables desde mayo, sin PATRIMONIO ni filas sin etiqueta.',
    mes: 'JULIO   2026', n: DIAS_DE_31,
    opciones: { conInternosNuevos: true, dosBloquesEnfermeria: false, conPatrimonio: false },
  },
  {
    archivo: 'nutricion_abril_patrimonio.xlsx',
    descripcion: 'Como abril real: 30 días, antes de los internos nuevos, con la fila PATRIMONIO (un solo mes, una sola comida) y los dos bloques de enfermería.',
    mes: 'ABRIL  2026', n: DIAS_DE_30,
    opciones: { conInternosNuevos: false, dosBloquesEnfermeria: true, conPatrimonio: true },
  },
  {
    archivo: 'nutricion_setiembre_sin_etiqueta.xlsx',
    descripcion: 'Como setiembre real: 30 días, con la fila de "Pacientes SIS · Emergencia" sin ninguna etiqueta (ni grupo ni comida) a pesar de tener cifras.',
    mes: 'SETIEMBRE  2026', n: DIAS_DE_30,
    opciones: { conInternosNuevos: true, dosBloquesEnfermeria: false, conPatrimonio: false, sinEtiqueta: true },
  },
];

for (const f of FIXTURES) {
  const bytes = libroDe(f.mes, f.n, f.opciones);
  writeFileSync(new URL(`./fixtures/${f.archivo}`, import.meta.url), bytes);
  console.log(`${f.archivo} — ${f.descripcion}`);
}
