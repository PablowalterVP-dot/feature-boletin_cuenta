/* Exporta el catálogo de Laboratorio desde la definición del bot al JSON que
   lee la API (`api/app/herramientas/catalogos/laboratorio.json`).

     node scripts/exportar-catalogo-laboratorio.mjs            escribe el JSON
     node scripts/exportar-catalogo-laboratorio.mjs --stdout   lo imprime (la prueba de contrato)

   Existe para no copiar a mano unos 160 exámenes en Python. Cuando cambie la
   definición del bot (un examen nuevo, un alias), se corre esto y se versiona
   el JSON; `prueba_laboratorio.py` (marcada `node`) falla si el JSON y el bot
   dejan de coincidir. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CUADROS, SECCIONES, HOJAS_DEL_MES, columnasDe } from '../bot-validador/src/areas/laboratorio/definicion.js';
import { VERSION } from '../bot-validador/src/areas/laboratorio/lector.js';

const DESTINO = fileURLToPath(new URL('../api/app/herramientas/catalogos/laboratorio.json', import.meta.url));

/* El libro tiene una hoja por mes y el bot lee la del mes que se reporta: en la
   base, la hoja de cada cuadro es un patrón (`es_hoja_patron`). */
const HOJA_DEL_MES = `^(${HOJAS_DEL_MES.flat().join('|')})$`;

const catalogo = {
  _nota: 'Generado por servidor/scripts/exportar-catalogo-laboratorio.mjs desde la definición del bot. No se edita a mano.',
  version: VERSION,
  hoja_patron: HOJA_DEL_MES,
  cuadros: CUADROS.map((c) => {
    const s = SECCIONES.find((x) => x.id === c.id);
    const columnas = columnasDe(c.id);
    return {
      codigo: c.id,
      numero: c.numero,
      titulo: c.titulo,
      unidad: c.unidad,
      bloque: c.bloque,
      columna_rotulo: columnas.rotulo,
      etiqueta_total: s.etiquetaTotal ?? null,
      procedencias: c.procedencias.map((p) => ({ clave: p.clave, nombre: p.label, columna: columnas.porProcedencia[p.clave] })),
      examenes: c.examenes.map((e) => ({ clave: e.clave, etiqueta: e.etiqueta, alias: [...e.alias], ocasional: e.ocasional })),
    };
  }),
};

const texto = `${JSON.stringify(catalogo, null, 2)}\n`;
if (process.argv.includes('--stdout')) process.stdout.write(texto);
else {
  writeFileSync(DESTINO, texto);
  const casillas = catalogo.cuadros.reduce((n, c) => n + c.examenes.length * c.procedencias.length, 0);
  console.log(`Catálogo ${VERSION}: ${catalogo.cuadros.length} secciones, ${catalogo.cuadros.reduce((n, c) => n + c.examenes.length, 0)} exámenes, ${casillas} indicadores → ${DESTINO}`);
}
