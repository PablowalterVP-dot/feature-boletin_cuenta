/* Archivos de prueba de un mes para las nueve áreas, para ensayar el reporte
   con el selector de archivos, como lo hará el área.

     node pruebas/plantillas.mjs 2026-10

   Deja en `pruebas/plantillas-<mes>/` uno correcto y uno con errores por área.
   Con el servidor, la pantalla ya no ofrece los botones de «Ejemplo correcto» y
   «Ejemplo con errores» (solo existen sin él), y son estos mismos ejemplos: las
   cifras son ficticias. Nunca se suben a la base de verdad, porque ocuparían el
   mes del área; por eso la carpeta no se versiona. */

import { createServer } from 'vite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const periodo = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(periodo ?? '')) {
  console.error('Indique el mes: node pruebas/plantillas.mjs 2026-10');
  process.exit(1);
}

const AREAS = [
  { modulo: 'nutricion', nombre: 'Nutricion', extension: 'xlsx' },
  { modulo: 'laboratorio', nombre: 'Laboratorio', extension: 'xlsx' },
  { modulo: 'lavanderia', nombre: 'Lavanderia', extension: 'xlsx' },
  { modulo: 'ginecologia', nombre: 'Ginecologia', extension: 'xlsx' },
  { modulo: 'centro-quirurgico', nombre: 'Centro-Quirurgico', extension: 'xlsx' },
  { modulo: 'farmacia', nombre: 'Farmacia', extension: 'docx' },
  { modulo: 'nefrologia', nombre: 'Nefrologia', extension: 'docx' },
  { modulo: 'imagenes', nombre: 'Imagenes', extension: 'docx' },
  { modulo: 'epidemiologia', nombre: 'Epidemiologia', extension: 'docx' },
];

const destino = join(RAIZ, 'pruebas', `plantillas-${periodo}`);
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });

const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  for (const { modulo, nombre, extension } of AREAS) {
    const ejemplos = await servidor.ssrLoadModule(`/src/app/servicios/ejemplos-${modulo}.js`);
    for (const [variante, generar] of [['correcto', ejemplos.ejemploCorrecto], ['con-errores', ejemplos.ejemploConErrores]]) {
      const archivo = await generar(periodo);
      const bytes = Buffer.from(await archivo.arrayBuffer());
      const nombreArchivo = `${nombre}-${periodo}-${variante}.${extension}`;
      writeFileSync(join(destino, nombreArchivo), bytes);
      console.log(`${nombreArchivo}  ${Math.ceil(bytes.length / 1024)} kB`);
    }
  }
} finally {
  await servidor.close();
}
console.log(`\nListos en ${destino}`);
