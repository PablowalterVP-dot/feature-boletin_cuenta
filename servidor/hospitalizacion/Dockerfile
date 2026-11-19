# La API de hospitalización (decisión 0011). Se construye desde la raíz del
# repositorio (docker-compose.yml, servicio `hospitalizacion`).
#
# Los datos de referencia (catálogo de servicios, plano del piso 2, cuentas de
# prueba, CIE-10 y médicos de muestra) viven en el frontend, en
# frontend/src/app/hospitalizacion/datos/. La imagen no lleva Node: una primera
# etapa los exporta a JSON y la API los lee de ahí (semillas/cargar_maestros.py).

FROM node:22-alpine AS maestros
WORKDIR /app
COPY frontend/src/app/hospitalizacion/datos frontend/src/app/hospitalizacion/datos
COPY frontend/src/app/hospitalizacion/dominio frontend/src/app/hospitalizacion/dominio
COPY servidor/hospitalizacion/semillas/exportar.mjs servidor/hospitalizacion/semillas/exportar.mjs
RUN node servidor/hospitalizacion/semillas/exportar.mjs > /app/maestros.json


FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=America/Lima

WORKDIR /app
COPY servidor/hospitalizacion/requirements.txt ./
RUN pip install -r requirements.txt
COPY servidor/hospitalizacion/alembic.ini ./
COPY servidor/hospitalizacion/app ./app
COPY servidor/hospitalizacion/migraciones ./migraciones
COPY servidor/hospitalizacion/semillas ./semillas
COPY --from=maestros /app/maestros.json ./maestros.json

RUN useradd --system --no-create-home hrl
USER hrl

EXPOSE 8010

# /api/salud no toca la base: dice que el proceso responde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8010/api/salud', timeout=3)" || exit 1

# Antes de levantar uvicorn, aplica las migraciones pendientes y pone al día los
# maestros (idempotente: no toca pacientes, censos ni egresos). Detrás del nginx del
# frontend, que reenvía /api/hospitalizacion/ a /api/ de este servicio.
CMD ["sh", "-c", "alembic upgrade head && python -m semillas.cargar_maestros && exec uvicorn app.principal:app --host 0.0.0.0 --port 8010 --proxy-headers --forwarded-allow-ips='*' --workers ${WEB_CONCURRENCY:-2}"]
