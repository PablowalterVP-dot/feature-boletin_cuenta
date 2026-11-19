# Sistema de Reporte Estadístico

Reemplaza el circuito en papel con el que **diez áreas** del Hospital Regional
de Loreto entregan su reporte mensual a la **Oficina de Estadística**, que hoy
los digita a mano. El sistema ataca tres problemas: se pierde la información que
no se digita, el mismo dato se envía en papel a varias oficinas y nadie sabe qué
área falta hasta que se necesita su dato.

!!! note "Estado: prototipo de alta fidelidad"
    Por omisión corre **sin backend**: todo vive en memoria y se reinicia al
    recargar. **Nutrición** es la excepción: se conecta a una API real que valida
    y guarda su reporte. Las otras nueve áreas siguen simuladas. Los nombres y
    cifras de la demostración son ficticios.

## Piezas

| Pieza | Carpeta | Tecnología | Qué hace |
|---|---|---|---|
| Web | `frontend/` | React + Vite, kit `@hrl/core-ui` | La interfaz. Sola es el modo demo |
| API | `servidor/api/` | FastAPI + PostgreSQL, JWT | Datos reales de Nutrición |
| Bot validador | `servidor/bot-validador/` | Node | Lee y valida el Excel de las áreas; también va embebido en la web |

## Arrancar

```bash
cd frontend
npm install
npm run dev          # modo demo: http://localhost:5173
```

Con datos reales de Nutrición hace falta además el servidor
(`cd servidor && npm run instalar && npm run dev`). El detalle está en el
`README.md` del repo y en [Despliegue](DESPLIEGUE.md).

## Tres reglas del código

1. **La máquina de estados manda.** Las pantallas preguntan a
   `dominio/estados.js` qué se puede hacer con un reporte; toda mutación pasa
   por `aplicarTransicion`.
2. **La matriz de destinos es una sola**, en `datos/areas.js`. Quién recibe qué
   no se configura desde la interfaz.
3. **Un reporte que no existe no se almacena.** Su ausencia es el estado
   `no_iniciado`, y el semáforo de cumplimiento depende de esa diferencia.

## Documentos

| Documento | Para qué |
|---|---|
| [Contexto](CONTEXTO.md) | El problema, el flujo real, la matriz de destinos y las decisiones. **Empieza aquí** |
| [Plan](PLAN.md) | Qué está hecho, qué falta y qué está bloqueado |
| [Despliegue](DESPLIEGUE.md) | Levantar el sistema en el servidor con Docker |
| [API del backend](API_BACKEND.md) | Rutas del backend con ejemplos |
| [Indicadores de desempeño](INDICADORES_DESEMPENO.md) | Carga del HIS MINSA y SINADEF, y la Ficha 14 |
| [Plan de personalización](Plan_Personalizacion.md) | Apariencia y accesibilidad (WCAG 2.2 AA) |

El contrato de implementación para tocar código está en `CLAUDE.md`, en la raíz
del repo.
