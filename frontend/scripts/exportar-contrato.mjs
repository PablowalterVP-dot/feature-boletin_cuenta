/* Exporta la máquina de estados del frontend a un JSON que el backend compara
   con su propia copia.

   `src/app/dominio/estados.js` es el origen: si cambia una transición, se
   cambia allí, se regenera este archivo y se ajusta `servidor/api/app/dominio/
   estados.py`. La prueba `servidor/api/pruebas/prueba_contrato_estados.py` falla si
   el JSON versionado no coincide con lo que este script produce, o si el
   backend se desalinea del JSON.

   Solo se exporta lo que decide el comportamiento (qué transiciones hay, desde
   dónde, hacia dónde y quién las dispara). Los rótulos, iconos y descripciones
   son presentación y se quedan en el frontend.

     node scripts/exportar-contrato.mjs            escribe servidor/api/contrato/estados.json
     node scripts/exportar-contrato.mjs --stdout   lo imprime, sin escribir */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTA_ESTADOS, TRANSICIONES } from '../src/app/dominio/estados.js';

const DESTINO = fileURLToPath(new URL('../../servidor/api/contrato/estados.json', import.meta.url));

const contrato = {
  estados: LISTA_ESTADOS.map((e) => ({ clave: e.clave, orden: e.orden, espera: e.espera })),
  transiciones: TRANSICIONES.map((t) => ({
    accion: t.accion,
    desde: [...t.desde],
    hasta: t.hasta,
    rol: t.rol,
    confirmar: t.confirmar === true,
  })),
};

const texto = `${JSON.stringify(contrato, null, 2)}\n`;

if (process.argv.includes('--stdout')) {
  process.stdout.write(texto);
} else {
  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, texto, 'utf8');
  console.log(`Contrato de estados escrito en ${DESTINO}`);
}
