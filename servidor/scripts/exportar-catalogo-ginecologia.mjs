/* Exporta el catálogo de Gineco-Obstetricia desde la definición del bot al
   JSON que lee la API (`api/app/herramientas/catalogos/ginecologia.json`).

     node scripts/exportar-catalogo-ginecologia.mjs            escribe el JSON
     node scripts/exportar-catalogo-ginecologia.mjs --stdout   lo imprime

   Igual que Nefrología: las casillas no se copian a mano en Python. Si la
   definición del bot cambia, se corre esto y se versiona el JSON. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CUADROS, VERSION, casillas } from '../bot-validador/src/areas/ginecologia/definicion.js';

const DESTINO = fileURLToPath(new URL('../api/app/herramientas/catalogos/ginecologia.json', import.meta.url));

const lista = casillas();
const catalogo = {
  _nota: 'Generado por servidor/scripts/exportar-catalogo-ginecologia.mjs desde la definición del bot. No se edita a mano.',
  version: VERSION,
  /* El nombre de la hoja varía mes a mes (ENERO..AGOSTO, o «Hoja1» en el de
     setiembre): el bot no la busca por nombre, la encuentra por sus
     rótulos (lector.js). Esto es solo descriptivo. */
  hoja: 'Reporte EBVI del mes',
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
