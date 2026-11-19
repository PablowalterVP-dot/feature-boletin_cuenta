# Hospitalización: reglas propias

Egresos Hospitalarios vive en este repositorio desde el 14/11/2026 (decisión 0011,
`docs/hospitalizacion/decisiones/0011-integracion-con-estadistica.md`). Todo el
contrato del `CLAUDE.md` de la raíz vale aquí; esto agrega lo propio y dice dónde
hospitalización se aparta, con su motivo.

Antes de tocar código, lee `docs/hospitalizacion/` (en especial `proceso/reglas.md`,
`proceso/camas-y-mantenimiento.md` y `piloto-medicina.md`): ahí están las decisiones
del dominio.

## Dónde está cada parte

| Qué | Dónde |
|---|---|
| Reglas del dominio (plano, censo, indicadores), funciones puras | `frontend/src/app/hospitalizacion/dominio/` |
| Catálogo de servicios, plano, cuentas de prueba, pacientes ficticios de las pruebas automáticas | `frontend/src/app/hospitalizacion/datos/` |
| Pantallas | `frontend/src/app/hospitalizacion/paneles/<módulo>/`, registradas en `paneles/indice.js` |
| El módulo que las monta dentro del shell de Estadística | `frontend/src/app/hospitalizacion/Modulo.jsx` |
| Cliente de la API | `frontend/src/app/servicios/hospitalizacion.js` |
| Menú: qué ve cada rol | `MODULOS_POR_ROL` y `PRECEDENCIA` en `datos/cuentas.js`; `navegacionDeHospitalizacion` en `navegacion.js` |
| API (FastAPI, Alembic, su propia base PostgreSQL) | `servidor/hospitalizacion/` |
| Cuentas, roles y permisos `hospitalizacion.*` | Base de Estadística, seeders `servidor/api/bd/seeders/0009_hospitalizacion.sql`, `0010_hospitalizacion_unidades.sql` y `0011_hospitalizacion_en_estadistica.sql` (Estadística entra con su rol `revisor`) |
| Unidades (departamentos y áreas) en la base de Estadística | Panel del superadministrador `paneles/superadmin/UnidadesHospitalizacion.jsx`, API `servidor/api/app/servicios/unidades_hospitalizacion.py`, prefijos en `datos/unidades.js` (decisión 0012) |
| Pruebas del dominio | `frontend/pruebas/hospitalizacion/*.test.mjs` (`node --test`) |
| Su sección de la prueba de humo | `frontend/pruebas/humo-hospitalizacion.mjs` (secciones 28 a 33) |

## Dónde se aparta del contrato de la raíz

- **Imports relativos en `dominio/`, `datos/` y en los `.js` de `paneles/plano/`.**
  Los prueba `node --test` y los lee `servidor/hospitalizacion/semillas/exportar.mjs`
  con Node, que no conoce el alias `@`. Las pantallas (`.jsx`) usan `@/` como todo lo
  demás.
- **El plano de camas no es un `Mosaic`.** `MapaCamas.jsx` parte la pantalla en dos
  columnas, la lista y el plano 3D a toda la altura; un `Mosaic` lo apilaría. Las
  demás pantallas sí lo son.
- **Sin modo demo.** Los pacientes viven en la API de hospitalización y el prototipo
  no los simula: sin servidor, el menú no muestra hospitalización.
- **Sin aviso de Dr. Mochi** (`cabecera.js` devuelve `null`): lo que apremia en un
  piso lo dice su propia pantalla.

## Reglas propias

- **Todo cambio del plano pasa por `aplicar(plano, accion)`** y todo hecho clínico
  por `acciones.aplicar` en la API, para que deshacer, guardar y auditar vean un único
  punto de cambio.
- **Animaciones:** [`docs/hospitalizacion/diseno/animaciones.md`](../../../../docs/hospitalizacion/diseno/animaciones.md).
  Nada salta, arranca y llega despacio, curvas y vuelo de cámara de
  `paneles/plano/camara3d.js`, tokens de tiempo del kit, 4 ms por cuadro como máximo y
  pruebas que muestrean la curva.
- **Nada de datos de pacientes** en el repositorio ni en la documentación.
- Los `id` del catálogo de servicios (`datos/catalogo.js`) los guarda el plano y son
  las claves de las unidades en la base de Estadística: **no se renombran**.
- El archivo del plano lleva `version`; si cambia su forma, se sube la versión y se
  migra al abrir.
- **El rol sale de los permisos.** Un permiso `hospitalizacion.*` nuevo, o un cambio en
  qué rol manda, va a la vez en `datos/cuentas.js` (`PRECEDENCIA`),
  `servidor/hospitalizacion/app/cuentas_estadistica.py` y el seeder de Estadística. La
  prueba de humo compara los tres.
- **Una pantalla nueva** entra en `paneles/indice.js`, en `MODULOS` y en
  `MODULOS_POR_ROL`; la prueba de humo la renderiza con cada rol.
- **Ingreso:** el de Estadística. La API de hospitalización lee su token (mismo
  `JWT_SECRETO`, `aud` con los dos sistemas) con `INGRESO=estadistica`. Su ingreso
  propio (`INGRESO=propio`, Argon2id y JWT con `aud: egresos-hospitalarios`) queda para
  probar la API sola; no se le agrega nada que el de Estadística no tenga.

## Antes de dar algo por terminado

Lo de la raíz (`npm run humo`, que ya incluye hospitalización, `npx oxlint src/`,
`npx vite build`, `npx hrl-core-ui doctor`) y, si tocaste la API o la base:

```bash
cd servidor/hospitalizacion && .venv/Scripts/python -m pytest pruebas
```
