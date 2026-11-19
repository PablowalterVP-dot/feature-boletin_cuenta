/* Clave con la que se recuerda el modo oscuro. Es de este sistema y no del kit:
   así no hereda la preferencia de otro frontend del hospital en el mismo
   dominio. La usan el AppShell y la pantalla de ingreso, que vive fuera de él. */
export const CLAVE_TEMA = 'hrl_re_theme';

/* Y la de las preferencias de lectura (contraste, tamaño del texto, subrayar
   enlaces), por el mismo motivo. Se eligen en el cajón del perfil. */
export const CLAVE_PREFERENCIAS = 'hrl_re_prefs';

/* Las preferencias por omisión que fija el superadministrador
   (`configuracion.preferencias`, en español) a los valores del kit. */
const CONTRASTE = { sistema: 'system', estandar: 'standard', alto: 'high' };

export function preferenciasDelKit(p) {
  if (!p) return null;
  const salida = {};
  if (p.contraste && CONTRASTE[p.contraste]) salida.contrast = CONTRASTE[p.contraste];
  if (p.tamano_texto) salida.textScale = Number(p.tamano_texto) / 100;
  if (typeof p.subrayar_enlaces === 'boolean') salida.underlineLinks = p.subrayar_enlaces;
  return Object.keys(salida).length ? salida : null;
}

/* Las de la organización llegan a quien no eligió las suyas, sin pisar a quien
   sí lo hizo: se recuerda qué se le dejó la última vez (`…_organizacion`), y si
   lo guardado sigue siendo eso, se reemplaza por lo nuevo. Devuelve si cambió
   algo, para volver a aplicarlas. */
export function adoptarPreferenciasDeLaOrganizacion(porOmision, base) {
  const CLAVE_ORIGEN = `${CLAVE_PREFERENCIAS}_organizacion`;
  try {
    const guardadas = localStorage.getItem(CLAVE_PREFERENCIAS);
    const dejadas = localStorage.getItem(CLAVE_ORIGEN);
    const sinElegir = guardadas == null || guardadas === dejadas;
    if (!sinElegir) return false;
    if (!porOmision) {
      // La organización ya no fija nada: quien seguía con lo suyo vuelve a lo del kit.
      if (dejadas != null) {
        localStorage.removeItem(CLAVE_PREFERENCIAS);
        localStorage.removeItem(CLAVE_ORIGEN);
        return true;
      }
      return false;
    }
    const nuevas = JSON.stringify({ ...base, ...porOmision });
    if (nuevas === guardadas) return false;
    localStorage.setItem(CLAVE_PREFERENCIAS, nuevas);
    localStorage.setItem(CLAVE_ORIGEN, nuevas);
    return true;
  } catch {
    // Almacenamiento bloqueado: se queda con lo del kit.
    return false;
  }
}
