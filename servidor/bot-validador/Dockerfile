# El bot validador como servicio. Se construye desde la raíz del repositorio
# (docker-compose.yml); no tiene dependencias, así que no hay `npm ci`.
FROM node:22-alpine

ENV NODE_ENV=production \
    PUERTO=8787

WORKDIR /app
COPY servidor/bot-validador/package.json ./
COPY servidor/bot-validador/src ./src

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/salud >/dev/null || exit 1

CMD ["node", "src/servidor.js"]
