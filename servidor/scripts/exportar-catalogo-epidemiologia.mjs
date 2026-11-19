/* Exporta el catálogo de Epidemiología desde la definición del bot al JSON que
   lee la API (`api/app/herramientas/catalogos/epidemiologia.json`).

     node scripts/exportar-catalogo-epidemiologia.mjs            escribe el JSON
     node scripts/exportar-catalogo-epidemiologia.mjs --stdout   lo imprime

   Igual que Nefrología: las casillas no se copian a mano en Python. Si la
   definición del bot cambia, se corre esto y se versiona el JSON. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CUADROS, VERSION, casillas } from '../bot-validador/src/areas/epidemiologia/definicion.js';

const DESTINO = fileURLToPath(new URL('../api/app/herramientas/catalogos/epidemiologia.json', import.meta.url));

const lista = casillas();
const catalogo = {
  _nota: 'Generado por servidor/scripts/exportar-catalogo-epidemiologia.mjs desde la definición del bot. No se edita a mano.',
  version: VERSION,
  /* Un Word no tiene hojas: el «nombre de hoja» del cuadro es el de su tabla. */
  hoja: 'Infecciones intrahospitalarias',
  unidad: 'casos',
  cuadros: CUADROS.map((c) => ({
    codigo: c.id,
    numero: c.numero,
    titulo: c.titulo,
    subtitulo: c.subtitulo,
    casillas: lista.filter((x) => x.cuadro === c.id).map((x) => ({ codigo: x.codigo, fila: x.fila, nombre: x.nombre, etiquetas: x.etiquetas, decimal: false })),
  })),
};

const texto = `${JSON.stringify(catalogo, null, 2)}\n`;
if (process.argv.includes('--stdout')) process.stdout.write(texto);
else {
  writeFileSync(DESTINO, texto);
  console.log(`Escrito ${DESTINO}: ${catalogo.cuadros.length} cuadro, ${lista.length} casillas.`);
}
