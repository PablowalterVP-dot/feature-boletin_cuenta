/* Servidor HTTP del bot validador. Sin dependencias: node:http.

     GET  /salud                               → { ok, bot, areas }
     GET  /areas/:area/reglas                  → las reglas que aplica
     GET  /areas/:area/plantilla?periodo=AAAA-MM → el .xlsx en blanco
     POST /validaciones                        → Informe
          { area, periodo, nombre, archivo: base64, anterior? }
     POST /validaciones/datos                  → Informe
          { area, periodo, datos, anterior? }

   El archivo viaja en base64 dentro de un JSON: una sola forma de petición,
   fácil de probar con curl, y el tamaño está acotado a 5 MB.

   `anterior` ({ periodo, datos }) lo manda quien llama porque el bot no
   guarda nada. En producción lo consultaría él mismo a la API del sistema;
   ver README.md, «Pendiente». */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { BOT, TAMANO_MAXIMO, validarArchivo, validarDatos, plantillaDe } from './motor.js';
import { AREAS, areaDelBot } from './areas/index.js';
import { esPeriodo } from './periodos.js';

const ORIGEN_PERMITIDO = process.env.BOT_ORIGEN ?? '*';

function responder(res, estado, cuerpo, tipo = 'application/json; charset=utf-8') {
  res.writeHead(estado, {
    'Content-Type': tipo,
    'Access-Control-Allow-Origin': ORIGEN_PERMITIDO,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(typeof cuerpo === 'string' || cuerpo instanceof Uint8Array ? cuerpo : JSON.stringify(cuerpo));
}

async function leerJson(req) {
  const partes = [];
  let tamano = 0;
  for await (const parte of req) {
    tamano += parte.length;
    /* base64 ocupa 4/3 del archivo, más el resto del JSON. */
    if (tamano > TAMANO_MAXIMO * 1.5) throw Object.assign(new Error('La petición supera el tamaño permitido.'), { estado: 413 });
    partes.push(parte);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    throw Object.assign(new Error('El cuerpo no es un JSON válido.'), { estado: 400 });
  }
}

function exigir(cuerpo) {
  if (!areaDelBot(cuerpo.area)) throw Object.assign(new Error(`Área desconocida: «${cuerpo.area}».`), { estado: 400 });
  if (!esPeriodo(cuerpo.periodo)) throw Object.assign(new Error('`periodo` debe tener la forma AAAA-MM.'), { estado: 400 });
}

export function crearServidor() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://bot');
    try {
      if (req.method === 'OPTIONS') return responder(res, 204, '');

      if (req.method === 'GET' && url.pathname === '/salud') {
        return responder(res, 200, { ok: true, bot: BOT, areas: Object.keys(AREAS) });
      }

      const reglas = url.pathname.match(/^\/areas\/([\w-]+)\/reglas$/);
      if (req.method === 'GET' && reglas) {
        const area = areaDelBot(reglas[1]);
        return area ? responder(res, 200, { area: area.clave, reglas: area.reglas }) : responder(res, 404, { error: 'Área desconocida.' });
      }

      const plantilla = url.pathname.match(/^\/areas\/([\w-]+)\/plantilla$/);
      if (req.method === 'GET' && plantilla) {
        const p = plantillaDe(plantilla[1], url.searchParams.get('periodo'));
        if (!p) return responder(res, 400, { error: 'Área o periodo inválidos.' });
        res.setHeader('Content-Disposition', `attachment; filename="${p.nombre}"`);
        /* Farmacia descarga un Word; las demás, un Excel. */
        const mime = areaDelBot(plantilla[1])?.archivo?.mime ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        return responder(res, 200, p.bytes, mime);
      }

      if (req.method === 'POST' && url.pathname === '/validaciones') {
        const cuerpo = await leerJson(req);
        exigir(cuerpo);
        if (typeof cuerpo.archivo !== 'string') return responder(res, 400, { error: 'Falta `archivo` en base64.' });
        const informe = await validarArchivo(Buffer.from(cuerpo.archivo, 'base64'), {
          area: cuerpo.area,
          periodo: cuerpo.periodo,
          nombre: cuerpo.nombre,
          anterior: cuerpo.anterior ?? null,
        });
        return responder(res, 200, informe);
      }

      if (req.method === 'POST' && url.pathname === '/validaciones/datos') {
        const cuerpo = await leerJson(req);
        exigir(cuerpo);
        return responder(res, 200, validarDatos(cuerpo.datos ?? {}, { area: cuerpo.area, periodo: cuerpo.periodo, anterior: cuerpo.anterior ?? null }));
      }

      return responder(res, 404, { error: 'Ruta desconocida.' });
    } catch (e) {
      return responder(res, e.estado ?? 500, { error: e.estado ? e.message : 'Error interno del bot.' });
    }
  });
}

/* `node src/servidor.js` lo levanta; importarlo (la prueba) no. */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const puerto = Number(process.env.PUERTO ?? 8787);
  crearServidor().listen(puerto, () => console.log(`${BOT.nombre} ${BOT.version} escuchando en http://localhost:${puerto}`));
}
