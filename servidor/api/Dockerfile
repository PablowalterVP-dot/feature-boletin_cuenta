# La API. Se construye desde la raíz del repositorio (docker-compose.yml).
#
# La configuración llega por variables de entorno desde el `.env` de la raíz;
# en la imagen no se copia ningún `.env`.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    RUTA_CARGAS=/datos/cargas

WORKDIR /app
COPY servidor/api/pyproject.toml ./
COPY servidor/api/app ./app
COPY servidor/api/bd ./bd
COPY servidor/api/historico ./historico
RUN pip install .

# Sin root. La carpeta de cargas se crea aquí con su dueño para que el volumen
# con nombre la herede al montarse por primera vez.
RUN useradd --system --no-create-home hrl \
 && mkdir -p /datos/cargas \
 && chown -R hrl /datos/cargas
USER hrl

EXPOSE 8000

# /api/salud no toca la base: dice que el proceso responde, no que la base esté
# disponible. Si la base se cae o una migración falla, lo dice la pantalla: el
# aviso de sincronización y «Funcionamiento» del superadministrador.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/salud', timeout=3)" || exit 1

# Detrás del nginx del frontend: --proxy-headers para que la IP del cliente
# llegue a los logs. La API no guarda estado en memoria, así que admite varios
# procesos (WEB_CONCURRENCY).
#
# Antes de levantar uvicorn, aplica migraciones y seeders pendientes (`bd.py`)
# y ejecuta `preparar_base` (NUT-2 activa, plazos, alertas, histórico). Todo es
# idempotente y, si falla, la API arranca igual. PREPARAR_BASE=no lo salta.
CMD ["sh", "-c", "[ \"$PREPARAR_BASE\" = no ] || (python -m app.herramientas.bd migrate && python -m app.herramientas.bd seed && python -m app.herramientas.preparar_base); exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --workers ${WEB_CONCURRENCY:-2}"]
