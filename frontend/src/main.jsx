import { createRoot } from 'react-dom/client'
import { applyPreferences, readPreferences, PREFERENCE_DEFAULTS } from '@hrl/core-ui'
import '@hrl/core-ui/tokens.css'
import '@/app/estilos.css'
import App from './app/App.jsx'
import LimiteDeErrores from './app/LimiteDeErrores.jsx'
import { CLAVE_PREFERENCIAS, adoptarPreferenciasDeLaOrganizacion, preferenciasDelKit } from './app/tema.js'
import { prepararAlmacen, cargarConfiguracion } from './app/servicios/api.js'

/* Antes del primer render: así la pantalla de ingreso, que vive fuera del
   AppShell, ya sale con el contraste y el tamaño de texto elegidos, y no
   destella el equivocado al cargar. */
applyPreferences(readPreferences(CLAVE_PREFERENCIAS))

/* Con el backend, el almacén arranca vacío: solo lo que el servidor devuelva. */
prepararAlmacen()

/* La configuración del sistema (nombre, mensaje del ingreso, aviso general,
   preferencias por omisión, áreas en el flujo). No se espera para pintar: el
   ingreso sale con sus textos de siempre y se actualiza al llegar. */
cargarConfiguracion().then((c) => {
  if (c && adoptarPreferenciasDeLaOrganizacion(preferenciasDelKit(c.preferencias), PREFERENCE_DEFAULTS)) {
    applyPreferences(readPreferences(CLAVE_PREFERENCIAS))
  }
})

createRoot(document.getElementById('root')).render(
  <LimiteDeErrores>
    <App />
  </LimiteDeErrores>,
)
