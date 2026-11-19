# Servidor

El lado servidor del sistema, en un solo lugar y con un solo comando:

| Carpeta | Qué es | Puerto |
|---|---|---|
| [`api/`](api/README.md) | API FastAPI + PostgreSQL. Datos reales de Nutrición y, al activarlos, Laboratorio y Farmacia | 8000 |
| [`bot-validador/`](bot-validador/README.md) | Lee y valida el Excel de las áreas (y el Word de Farmacia). Node puro, sin dependencias | 8787 |

Siguen siendo dos componentes con su README, sus pruebas y su arranque propio:
lo que hay aquí arriba solo los coordina. El frontend (`../frontend`) no depende
de que esto esté levantado: sin servidor corre en modo demo con el bot embebido.

## Requisitos

- Node 20 o superior.
- Python 3.13 o superior (el que pide `api/pyproject.toml`).
- Una base PostgreSQL con el esquema de Alejandro instalado: la provee quien
  despliega (ver [`api/README.md`](api/README.md) § «Arrancar»).

## Comandos

```bash
cd servidor
npm run instalar   # una vez: crea api/.venv, instala la API y copia api/.env
npm run dev        # bot y API juntos, con salida prefijada [bot] / [api]
npm run api        # solo la API
npm run bot        # solo el bot
npm run dev:hospitalizacion  # bot, API y la API de hospitalización (:8010), para probar las cuentas de los pisos (hospitalizacion/README.md)
npm run prueba     # pruebas del bot y luego pytest de la API
npm run desempeno  # indicadores de desempeño: crea sus tablas y permisos, sin datos (docs/INDICADORES_DESEMPENO.md)
```

- La API corre con el Python de `api/.venv` si existe (no hace falta activarlo);
  si no, con el del entorno de conda activado (no `base`). Con Anaconda:
  `conda create -n hrl python=3.13`, `conda activate hrl` y luego
  `npm run instalar` instala en ese entorno, sin crear `.venv`.
- Juntos, a la API se le pasa `BOT_VALIDADOR_URL` apuntando al bot recién
  levantado, salvo que ya venga en el entorno.
- Si uno de los dos cae, se baja el otro, y `Ctrl+C` detiene ambos.
- Puertos: `PUERTO_BOT` y `PUERTO_API`.
- `npm run instalar` elige Python con la variable `PYTHON` si existe; si no,
  `py -3` en Windows y `python3` en lo demás. Se niega con un Python menor que
  3.13.

Los scripts están en [`scripts/`](scripts) y no usan dependencias: Node basta.
