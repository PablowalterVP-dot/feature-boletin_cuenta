/* Pantalla de ingreso: la del kit (LoginScreen), con la fachada del hospital
   según la hora, igual que en los demás sistemas del hospital.

   Sin accesos directos a las cuentas: el ingreso es el de cualquier usuario.
   Las credenciales de las cuentas de prueba están en CREDENCIALES.txt, en la
   raíz del repositorio, y el equipo de desarrollo entra con la cuenta `admin`,
   desde la que puede entrar como cualquier otra.

   Vive fuera del AppShell, así que aplica el tema por su cuenta: el
   interruptor de modo oscuro está dentro del shell y sin esto el ingreso
   volvería a claro en cada cierre de sesión.

   Una cuenta con contraseña provisional (el superadmin recién sembrado, o a
   quien se le reasignó la clave) pasa primero por el cambio obligatorio: su
   token no sirve para nada más, y abrir la sesión con él dejaba cada pantalla
   sin datos. */

import { useEffect, useState } from 'react';
import { LoginScreen, ChangePasswordScreen, applyTheme, readTheme } from '@hrl/core-ui';
import * as api from './servicios/api.js';
import { iniciarSesion, useEstado } from './datos/store.js';
import { CLAVE_TEMA } from './tema.js';

const SISTEMA = 'Sistema de Reporte Estadístico';

/* El mínimo que exige el backend (servidor/api/app/dominio/claves.py). */
const LARGO_MINIMO_CLAVE = 10;

/* El pie del ingreso: en el prototipo, la advertencia de que los datos son
   ficticios (CLAUDE.md § 3.5); con el servidor eso ya no es cierto, y va el
   mensaje y el aviso que configuró el superadministrador. */
function pieDe(configuracion, avisoIngreso) {
  if (avisoIngreso) return avisoIngreso;
  if (!api.usaSoloDatosReales()) {
    return 'Prototipo de demostración: los nombres, las fechas y las cifras son ficticios, salvo los oficios de junio de 2026. No valida contraseñas y nada se guarda al recargar.';
  }
  const partes = [configuracion?.aviso?.texto && `Aviso: ${configuracion.aviso.texto}`, configuracion?.mensajeIngreso].filter(Boolean);
  return partes.length ? partes.join(' · ') : undefined;
}

export default function Login() {
  const [cambioPendiente, setCambioPendiente] = useState(false);
  const { configuracion, avisoIngreso } = useEstado();
  const sistema = configuracion?.nombreSistema ?? SISTEMA;

  useEffect(() => {
    applyTheme(readTheme(CLAVE_TEMA), CLAVE_TEMA);
  }, []);

  if (cambioPendiente) {
    return (
      <ChangePasswordScreen
        systemName={sistema}
        minLength={LARGO_MINIMO_CLAVE}
        onSubmit={async ({ current, next }) => {
          const r = await api.cambiarClave(current, next);
          if (!r.ok) throw new Error(r.error);
          iniciarSesion(r.usuario);
        }}
        footer="Su contraseña es provisional. Elija una propia para continuar: la provisional deja de servir en cuanto la cambie."
      />
    );
  }

  return (
    <LoginScreen
      systemName={sistema}
      onSubmit={async ({ username, password }) => {
        const r = await api.login(username, password);
        if (!r.ok) {
          throw new Error(r.error);
        }
        if (r.debeCambiarClave) {
          setCambioPendiente(true);
          return;
        }
        iniciarSesion(r.usuario);
      }}
      footer={pieDe(configuracion, avisoIngreso)}
    />
  );
}
