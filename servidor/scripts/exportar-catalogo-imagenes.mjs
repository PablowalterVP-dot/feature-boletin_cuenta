/* Exporta el catálogo de Diagnóstico por Imágenes desde la definición del bot
   al JSON que lee la API (`api/app/herramientas/catalogos/imagenes.json`).

     node scripts/exportar-catalogo-imagenes.mjs            escribe el JSON
     node scripts/exportar-catalogo-imagenes.mjs --stdout   lo imprime

   La base guarda los cuatro cuadros planos (eco, tac, mam, rx: los totales
   de cada modalidad); el detalle por profesional viaja en el informe del bot
   (definicion.js, CUADROS_BASE). Los montos en soles son decimales. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CUADROS_BASE, VERSION, casillas } from '../bot-validador/src/areas/imagenes/definicion.js';

const DESTINO = fileURLToPath(new URL('../api/app/herramientas/catalogos/imagenes.json', import.meta.url));

const lista = casillas();
const catalogo = {
  _nota: 'Generado por servidor/scripts/exportar-catalogo-imagenes.mjs desde la definición del bot. No se edita a mano.',
  version: VERSION,
  hoja: 'Oficio de Diagnóstico por Imágenes',
  unidad: 'exámenes',
  cuadros: CUADROS_BASE.map((c) => ({
    codigo: c.codigo,
    numero: c.numero,
    titulo: c.titulo,
    subtitulo: c.subtitulo,
    casillas: lista.filter((x) => x.cuadro === c.codigo).map((x) => ({ codigo: x.codigo, fila: x.fila, nombre: x.nombre, etiquetas: x.etiquetas, decimal: x.decimal })),
  })),
};

const texto = `${JSON.stringify(catalogo, null, 2)}\n`;
if (process.argv.includes('--stdout')) process.stdout.write(texto);
else {
  writeFileSync(DESTINO, texto);
  console.log(`Escrito ${DESTINO}: ${catalogo.cuadros.length} cuadros, ${lista.length} casillas.`);
}
