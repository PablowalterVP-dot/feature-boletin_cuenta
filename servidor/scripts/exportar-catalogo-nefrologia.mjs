/* Exporta el catálogo de Nefrología y Hemodiálisis desde la definición del
   bot al JSON que lee la API (`api/app/herramientas/catalogos/nefrologia.json`).

     node scripts/exportar-catalogo-nefrologia.mjs            escribe el JSON
     node scripts/exportar-catalogo-nefrologia.mjs --stdout   lo imprime (la prueba de contrato)

   Igual que Farmacia: las casillas no se copian a mano en Python. Si la
   definición del bot cambia, se corre esto y se versiona el JSON. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CUADROS, VERSION, casillas } from '../bot-validador/src/areas/nefrologia/definicion.js';

const DESTINO = fileURLToPath(new URL('../api/app/herramientas/catalogos/nefrologia.json', import.meta.url));

const lista = casillas();
const catalogo = {
  _nota: 'Generado por servidor/scripts/exportar-catalogo-nefrologia.mjs desde la definición del bot. No se edita a mano.',
  version: VERSION,
  /* Un Word no tiene hojas: el «nombre de hoja» del cuadro es el del
     documento, para que la base sepa de dónde sale (la exige al activar). */
  hoja: 'Cuadro de Hemodiálisis',
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
  console.log(`Escrito ${DESTINO}: ${catalogo.cuadros.length} cuadro, ${lista.length} casillas.`);
}
