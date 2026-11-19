/* Apoyo de la prueba de contrato bot ↔ catálogo (@pytest.mark.node).

   Genera la plantilla oficial de Nutrición con el propio código del bot y la
   vuelve a leer con su propio lector (xlsx.js), para no reimplementar el
   formato .xlsx en Python. Imprime en JSON: las hojas del libro y los códigos
   de indicador de cada cuadro según la definición del bot (`f2.patrimonio.
   almuerzo`…). La prueba de Python los compara con lo que
   configurar_nutricion_real.py escribe para NUT-2. */

import { plantillaDe } from '../../bot-validador/src/motor.js';
import { leerLibro } from '../../bot-validador/src/xlsx.js';
import { FORMATOS } from '../../bot-validador/src/areas/nutricion/definicion.js';

const plantilla = plantillaDe('nutricion', '2026-08');
const libro = await leerLibro(plantilla.bytes);

const codigosPorCuadro = Object.fromEntries(FORMATOS.map((f) => [f.id, f.filas.map((fila) => `${f.id}.${fila.clave}`).sort()]));
const hojaPorCuadro = Object.fromEntries(FORMATOS.map((f) => [f.id, f.hojaOficial]));

process.stdout.write(JSON.stringify({ hojas: libro.hojas, hojaPorCuadro, codigosPorCuadro, version: plantilla && 'NUT-2' }));
