# syntax=docker/dockerfile:1
#
# El frontend compilado, servido por nginx, que además hace de puerta única:
# /api va a la API por la red interna (lo que en desarrollo hace el proxy de
# Vite). Se construye desde la raíz del repositorio porque el modo embebido del
# bot importa ../servidor/bot-validador/src (alias @bot).

FROM node:22-alpine AS construccion
RUN apk add --no-cache git

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./

# El lock fija @hrl/core-ui por git+ssh y en la imagen no hay llave SSH: se
# reescribe a HTTPS solo para este comando (variables GIT_CONFIG_*, nada queda
# guardado en la imagen). Si el repositorio del kit es privado, se pasa un token
# como secreto de construcción `github_token` (ver docs/DESPLIEGUE.md).
RUN --mount=type=secret,id=github_token \
    BASE="https://github.com/"; \
    if [ -s /run/secrets/github_token ]; then \
      BASE="https://x-access-token:$(cat /run/secrets/github_token)@github.com/"; \
    fi; \
    export GIT_CONFIG_COUNT=3 \
      GIT_CONFIG_KEY_0="url.${BASE}.insteadOf" GIT_CONFIG_VALUE_0="ssh://git@github.com/" \
      GIT_CONFIG_KEY_1="url.${BASE}.insteadOf" GIT_CONFIG_VALUE_1="git@github.com:" \
      GIT_CONFIG_KEY_2="url.${BASE}.insteadOf" GIT_CONFIG_VALUE_2="https://github.com/"; \
    npm ci

COPY servidor/bot-validador/src /app/servidor/bot-validador/src
COPY frontend/ ./

# Vite fija estas variables al compilar: cambiarlas exige reconstruir la imagen.
# VITE_API_URL vacía = modo demo, todo en memoria. Con valor, el frontend pide a
# /api (mismo origen) y el valor solo se muestra como texto en el panel del bot.
# VITE_BOT_URL vacía = bot embebido en el navegador; la API usa el servicio igual.
ARG VITE_API_URL=http://api:8000
ARG VITE_BOT_URL=
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_BOT_URL=${VITE_BOT_URL}
RUN npx vite build


FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construccion /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
