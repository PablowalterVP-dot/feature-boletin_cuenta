import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const BOT = fileURLToPath(new URL('../servidor/bot-validador/src', import.meta.url))

export default defineConfig(({ mode }) => {
  /* El backend (servidor/api/, otro componente del sistema, en producción un
     servicio aparte). Con VITE_API_URL, servicios/api.js usa datos reales de
     Nutrición y aquí se proxea /api hacia él, para no necesitar CORS en el
     backend. Sin ella, todo sigue en memoria (src/app/datos/), como siempre.

     `process.env` NO trae lo que hay en frontend/.env: Vite solo expone esos
     valores al código de la aplicación (import.meta.env), no a este archivo.
     Para leerlos aquí, en la configuración misma, hace falta pedírselos con
     loadEnv (también recoge una VITE_API_URL puesta en el shell, como con
     VITE_BOT_URL). */
  const URL_API = loadEnv(mode, process.cwd(), '').VITE_API_URL || null
  /* La API de hospitalización en desarrollo (`servidor/hospitalizacion/`, puerto 8010). */
  const URL_HOSPITALIZACION = loadEnv(mode, process.cwd(), '').VITE_HOSPITALIZACION_URL || 'http://localhost:8010'
  if (URL_API && !/^https?:\/\//.test(URL_API)) {
    console.warn(`VITE_API_URL debe ser el origen del backend (p. ej. http://localhost:8000), no una ruta: "${URL_API}" no sirve como destino del proxy.`)
  }

  return {
    plugins: [react()],
    /* `@` es la aplicación. `@bot` es el bot validador, que vive fuera del
       frontend (../servidor/bot-validador) porque es otro componente del sistema: en
       producción, un servicio aparte. El frontend lo importa solo para el modo
       embebido del prototipo, a través de src/app/servicios/bot-validador.js. */
    resolve: {
      alias: {
        '@bot': BOT,
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      allowedHosts: true,
      fs: {
        allow: [fileURLToPath(new URL('.', import.meta.url)), BOT],
      },
      /* Hospitalización (servidor/hospitalizacion/) va antes que /api: Vite toma la
         primera regla que coincide. Su API escucha en /api, sin el prefijo. */
      proxy: URL_API
        ? {
            '/api/hospitalizacion': { target: URL_HOSPITALIZACION, changeOrigin: true, rewrite: (ruta) => ruta.replace(/^\/api\/hospitalizacion/, '/api') },
            '/api': { target: URL_API, changeOrigin: true },
          }
        : undefined,
    },
  }
})
