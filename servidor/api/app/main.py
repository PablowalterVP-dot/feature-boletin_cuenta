"""Punto de entrada de la API.

    uvicorn app.main:app --reload --port 8000

El frontend la consume bajo `/api` (proxy de Vite), por eso las rutas se montan
con ese prefijo.
"""

from fastapi import FastAPI

from app.api import admin, auth, avisos, configuracion, desempeno, errores, monitoreo, oficinas, planeamiento, reportes, salud

app = FastAPI(
    title="Sistema de Reporte Estadístico · HRL",
    description=(
        "API del sistema con el que nueve áreas del Hospital Regional de Loreto "
        "entregan su reporte mensual a la Oficina de Estadística."
    ),
    version="0.1.0",
)

app.include_router(salud.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(reportes.router, prefix="/api")
app.include_router(oficinas.router, prefix="/api")
app.include_router(avisos.router, prefix="/api")
app.include_router(configuracion.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(desempeno.router, prefix="/api")
app.include_router(planeamiento.router, prefix="/api")
app.include_router(monitoreo.router, prefix="/api")
errores.registrar(app)
