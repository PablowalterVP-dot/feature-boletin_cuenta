/* Exporta el catálogo de Centro Quirúrgico desde la definición del bot al
   JSON que lee la API (`api/app/herramientas/catalogos/centro_quirurgico.json`).

     node scripts/exportar-catalogo-centro-quirurgico.mjs            escribe el JSON
     node scripts/exportar-catalogo-centro-quirurgico.mjs --stdout   lo imprime (la prueba de contrato)

   Como el de Laboratorio: para no copiar a mano en Python las especialidades,
   las causas y sus rótulos. Cuando cambie la definición del bot, se corre esto
   y se versiona el JSON; `prueba_centro_quirurgico.py` (marcada `node`) falla si
   el JSON y el bot dejan de coincidir.

   Solo los cinco cuadros que el área digita. Los procedimientos no son
   indicadores (definicion.js, «LOS PROCEDIMIENTOS») y los cuadros calculados
   no se guardan. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CUADROS, HOJAS, CONCEPTOS_RESUMEN, INSUMOS_INDICADORES, CAUSAS, ESPECIALIDADES } from '../bot-validador/src/areas/centro-quirurgico/definicion.js';
import { VERSION } from '../bot-validador/src/areas/centro-quirurgico/lector.js';

const DESTINO = fileURLToPath(new URL('../api/app/herramientas/catalogos/centro_quirurgico.json', import.meta.url));

/* Los rótulos con que el Excel escribe cada fila, para documentarlo en la base. */
const ROTULOS = {
  resumen: (f) => CONCEPTOS_RESUMEN.find((c) => c.clave === f.concepto).rotulo,
  indicadores: (f) => INSUMOS_INDICADORES.find((i) => i.clave === f.clave).rotulo,
  suspendidas: (f) => CAUSAS.find((c) => c.clave === f.clave).rotulo,
  mayor: (f) => ESPECIALIDADES.find((e) => e.clave === f.clave).rotulos[0],
  menor: (f) => ESPECIALIDADES.find((e) => e.clave === f.clave).rotulos[0],
};
const ALIAS = {
  resumen: (f) => CONCEPTOS_RESUMEN.find((c) => c.clave === f.concepto).alias,
  indicadores: (f) => INSUMOS_INDICADORES.find((i) => i.clave === f.clave).alias,
  suspendidas: (f) => CAUSAS.find((c) => c.clave === f.clave).alias,
  mayor: (f) => ESPECIALIDADES.find((e) => e.clave === f.clave).rotulos.slice(1),
  menor: (f) => ESPECIALIDADES.find((e) => e.clave === f.clave).rotulos.slice(1),
};

const catalogo = {
  _nota: 'Generado por servidor/scripts/exportar-catalogo-centro-quirurgico.mjs desde la definición del bot. No se edita a mano.',
  version: VERSION,
  cuadros: CUADROS.map((c) => ({
    codigo: c.id,
    numero: c.numero,
    titulo: c.titulo,
    unidad: c.unidad,
    hojas: [...HOJAS[c.id]],
    filas: c.filas.map((f) => ({
      clave: f.clave,
      nombre: f.rotulo,
      etiqueta: ROTULOS[c.id](f),
      alias: [...ALIAS[c.id](f)],
      ...(f.tipo ? { columna: f.tipo } : {}),
      unidad: f.unidad,
      decimal: Boolean(f.decimal),
      ocasional: Boolean(f.ocasional),
    })),
  })),
};

const texto = `${JSON.stringify(catalogo, null, 2)}\n`;
if (process.argv.includes('--stdout')) process.stdout.write(texto);
else {
  writeFileSync(DESTINO, texto);
  console.log(`Catálogo ${VERSION}: ${catalogo.cuadros.length} cuadros, ${catalogo.cuadros.reduce((n, c) => n + c.filas.length, 0)} indicadores → ${DESTINO}`);
}
