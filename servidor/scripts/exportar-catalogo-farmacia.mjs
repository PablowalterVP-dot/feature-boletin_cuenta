/* Exporta el catálogo de Farmacia desde la definición del bot al JSON que lee
   la API (`api/app/herramientas/catalogos/farmacia.json`).

     node scripts/exportar-catalogo-farmacia.mjs            escribe el JSON
     node scripts/exportar-catalogo-farmacia.mjs --stdout   lo imprime (la prueba de contrato)

   Igual que Laboratorio: las casillas no se copian a mano en Python. Si la
   definición del bot cambia, se corre esto y se versiona el JSON;
   `prueba_farmacia.py` (marcada `node`) falla si dejan de coincidir. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CUADROS, VERSION, casillas } from '../bot-validador/src/areas/farmacia/definicion.js';

const DESTINO = fileURLToPath(new URL('../api/app/herramientas/catalogos/farmacia.json', import.meta.url));

const lista = casillas();
const catalogo = {
  _nota: 'Generado por servidor/scripts/exportar-catalogo-farmacia.mjs desde la definición del bot. No se edita a mano.',
  version: VERSION,
  /* Un Word no tiene hojas: el «nombre de hoja» de cada cuadro es el del
     documento, para que la base sepa de dónde sale (la exige al activar). */
  hoja: 'Informe mensual (Word)',
  cuadros: CUADROS.map((c) => ({
    codigo: c.id,
    numero: c.numero,
    titulo: c.titulo,
    subtitulo: c.subtitulo,
    casillas: lista.filter((x) => x.cuadro === c.id).map((x) => ({ codigo: x.codigo, fila: x.fila, nombre: x.nombre, etiquetas: x.etiquetas })),
  })),
};

const texto = `${JSON.stringify(catalogo, null, 2)}\n`;
if (process.argv.includes('--stdout')) process.stdout.write(texto);
else {
  writeFileSync(DESTINO, texto);
  console.log(`Escrito ${DESTINO}: ${catalogo.cuadros.length} cuadros, ${lista.length} casillas.`);
}
