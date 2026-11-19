/* Estructura del reporte de la Oficina de Epidemiología.

   Vive en el bot porque es él quien lee el Word del área (lector.js) y aplica
   sus reglas (reglas.js); el sistema la reexporta
   (frontend/src/app/datos/formatos/epidemiologia.js).

   Levantada de los nueve oficios de enero a setiembre de 2026 («Remito casos
   de vigilancia Epidemiológica», dirigidos a Estadística). Cada oficio trae
   una sola tabla, la misma los nueve meses: «Número de casos nuevos de
   infecciones intrahospitalarias», con quince grupos de edad en filas y, en
   columnas, el servicio o el tipo de infección partido por sexo, más una fila
   TOTAL.

   Lo que se vio al cotejar los nueve meses, y que da forma al módulo:

   1. El área deja en blanco las celdas sin casos y escribe 0 solo en la fila
      TOTAL. Un blanco de una fila de edad es 0 (así lo suma la propia fila
      TOTAL, que cuadra los nueve meses); un blanco en la fila TOTAL sí es un
      total sin escribir.
   2. Dos columnas no son infecciones: «Muerte neonatal» y «Muerte materna».
      Se registran igual, pero no cuentan como pacientes con infección
      intrahospitalaria (el indicador 16 de DIRESA y el boletín).
   3. Gineco-Obstetricia y Muerte materna solo tienen la columna F.
   4. No hay datos de pacientes: solo cuentas por edad y sexo. */

/* Las columnas de la tabla, en el orden del Word (después de N.º y del grupo
   de edad). `grupo` es el encabezado que las agrupa. */
export const GRUPOS = Object.freeze([
  Object.freeze({ clave: 'neonatologia', label: 'Neonatología', infeccion: true, sexos: ['F', 'M'], ayuda: 'Infecciones intrahospitalarias en el servicio de Neonatología.' }),
  Object.freeze({ clave: 'uci', label: 'UCI (Pediatría, Medicina, Cirugía)', corto: 'UCI', infeccion: true, sexos: ['F', 'M'], ayuda: 'Infecciones intrahospitalarias en las unidades de cuidados intensivos de Pediatría, Medicina y Cirugía.' }),
  Object.freeze({ clave: 'gineco', label: 'Gineco-Obstetricia', corto: 'Gineco-Obst.', infeccion: true, sexos: ['F'], ayuda: 'Infecciones intrahospitalarias en Gineco-Obstetricia. Solo tiene columna F.' }),
  Object.freeze({ clave: 'itu', label: 'Otros servicios: infección del tracto urinario', corto: 'ITU', infeccion: true, sexos: ['F', 'M'], ayuda: 'Otros servicios. ITU: infección del tracto urinario.' }),
  Object.freeze({ clave: 'iho', label: 'Otros servicios: infección de herida operatoria', corto: 'IHO', infeccion: true, sexos: ['F', 'M'], ayuda: 'Otros servicios. IHO: infección de herida operatoria.' }),
  Object.freeze({ clave: 'muerte_neonatal', label: 'Muerte neonatal', infeccion: false, sexos: ['F', 'M'], ayuda: 'Muertes neonatales registradas por la vigilancia. No es una infección: no suma a los pacientes con infección intrahospitalaria.' }),
  Object.freeze({ clave: 'muerte_materna', label: 'Muerte materna', infeccion: false, sexos: ['F'], ayuda: 'Muertes maternas registradas por la vigilancia. No es una infección: no suma a los pacientes con infección intrahospitalaria.' }),
  Object.freeze({ clave: 'otras', label: 'Otras infecciones (neumonía sin ventilador, infección de piel…)', corto: 'Otras', infeccion: true, sexos: ['F', 'M'], ayuda: 'Otras infecciones intrahospitalarias: neumonía sin ventilación mecánica, infección de piel y otras.' }),
]);

/* Las catorce columnas de cifras, en orden: una por grupo y sexo. */
export const COLUMNAS = Object.freeze(
  GRUPOS.flatMap((g) => g.sexos.map((s) => Object.freeze({ clave: `${g.clave}_${s.toLowerCase()}`, grupo: g.clave, sexo: s }))),
);

/* Los quince grupos de edad, en el orden de las filas. `rotulos`: como el Word
   los escribe (los espacios alrededor del guion varían entre filas). */
export const EDADES = Object.freeze([
  Object.freeze({ clave: 'e0', label: 'Menor de 1 año', desde: 0, hasta: 0 }),
  Object.freeze({ clave: 'e1', label: '1 a 4 años', desde: 1, hasta: 4 }),
  Object.freeze({ clave: 'e5', label: '5 a 9 años', desde: 5, hasta: 9 }),
  Object.freeze({ clave: 'e10', label: '10 a 14 años', desde: 10, hasta: 14 }),
  Object.freeze({ clave: 'e15', label: '15 a 19 años', desde: 15, hasta: 19 }),
  Object.freeze({ clave: 'e20', label: '20 a 24 años', desde: 20, hasta: 24 }),
  Object.freeze({ clave: 'e25', label: '25 a 29 años', desde: 25, hasta: 29 }),
  Object.freeze({ clave: 'e30', label: '30 a 34 años', desde: 30, hasta: 34 }),
  Object.freeze({ clave: 'e35', label: '35 a 39 años', desde: 35, hasta: 39 }),
  Object.freeze({ clave: 'e40', label: '40 a 44 años', desde: 40, hasta: 44 }),
  Object.freeze({ clave: 'e45', label: '45 a 49 años', desde: 45, hasta: 49 }),
  Object.freeze({ clave: 'e50', label: '50 a 54 años', desde: 50, hasta: 54 }),
  Object.freeze({ clave: 'e55', label: '55 a 59 años', desde: 55, hasta: 59 }),
  Object.freeze({ clave: 'e60', label: '60 a 64 años', desde: 60, hasta: 64 }),
  Object.freeze({ clave: 'e65', label: '65 años a más', desde: 65, hasta: null }),
]);

export const FORMATOS = Object.freeze([
  Object.freeze({
    id: 'f1',
    numero: 1,
    corto: 'Infecciones',
    titulo: 'Infecciones intrahospitalarias',
    subtitulo: 'Casos nuevos del mes por grupo de edad, servicio y sexo',
    icono: 'sh-shield',
    periodicidad: 'mensual',
  }),
]);

export const CUADROS = FORMATOS;

export const VERSION = 'EPI-W1';

export function formato(id) {
  return FORMATOS.find((f) => f.id === id) ?? null;
}

export function grupo(clave) {
  return GRUPOS.find((g) => g.clave === clave) ?? null;
}

export function columna(clave) {
  return COLUMNAS.find((c) => c.clave === clave) ?? null;
}

/* Cómo se nombra una columna para una persona: «Neonatología · F». */
export function etiquetaColumna(clave) {
  const c = columna(clave);
  return c ? `${grupo(c.grupo).corto ?? grupo(c.grupo).label} · ${c.sexo}` : clave;
}

/* Las casillas del reporte: una por edad y columna (15 × 14). Es lo que se
   instala en la base como indicadores del formato
   (servidor/api/app/herramientas/cargar_catalogo_epidemiologia.py) y la forma
   plana en que el servidor guarda y devuelve las cifras: `f1`, `e0`, `neonatologia_m`
   → indicador `f1.e0.neonatologia_m`. */
export function casillas() {
  return EDADES.flatMap((e) =>
    COLUMNAS.map((c) => ({
      cuadro: 'f1',
      fila: `${e.clave}.${c.clave}`,
      codigo: `f1.${e.clave}.${c.clave}`,
      nombre: `${grupo(c.grupo).label} · ${c.sexo === 'F' ? 'femenino' : 'masculino'} · ${e.label}`,
      etiquetas: [e.label, grupo(c.grupo).label, c.sexo],
    })),
  );
}

/* Estructura de un reporte sin llenar: vacío es vacío, sin ceros. */
export function datosVacios() {
  return { f1: {} };
}
