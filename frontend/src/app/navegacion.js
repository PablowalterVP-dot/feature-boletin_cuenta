/* Navegación por rol.

   Cada rol ve su propio menú. No hay entradas deshabilitadas ni ocultas por
   permiso: si un rol no puede hacer algo, la entrada no existe para él. Un
   menú con la mitad de las opciones en gris enseña al usuario a ignorar el
   menú.

   `fase` y `detalle` describen lo que falta. Están aquí y no en un documento
   aparte para que el marcador de posición de cada panel pueda decir la verdad
   sobre lo que va a contener, en lugar de mostrar una pantalla vacía sin
   explicación. Cuando el panel se construye, se le quita el `detalle`. */

import { ROL } from './dominio/roles.js';
import { GRUPO, GRUPO_REPORTES, MODULOS, modulosDeRol, rolDesdePermisos } from './hospitalizacion/datos/cuentas.js';

/* Un consolidado por área que lleva libro anual. Los ven Estadística y
   Planeamiento como una sola entrada del menú, «Consolidados anuales»
   (`seccion`), y cada área es una vista de esa sección, en las pestañas del
   centro de la barra (`menuDe`, `vistasDe`). Antes eran nueve entradas en un
   grupo desplegable: crecían con cada área y repetían lo que ya decían las
   pestañas. */
export const SECCION_CONSOLIDADOS = 'Consolidados anuales';
export const SECCION_PANEL = 'Monitoreo Indicadores';

/* Lo primero que ven Estadística y Dirección al entrar. Cumplimiento es otra vista
   del mismo panel, en las pestañas de la barra. */
const MONITOREO = Object.freeze({
  id: 'monitoreo',
  label: 'Desempeño DL 1153',
  icon: 'sh-chart',
  group: 'Control',
  title: 'Indicadores de desempeño',
  subtitle: 'Lo que el Anexo I evalúa al hospital y cómo va frente a su meta',
  construido: true,
});
const GESTION_HOSPITALARIA = Object.freeze({
  id: 'monitoreo-gestion',
  label: 'Gestión hospitalaria',
  icon: 'sh-table',
  group: 'Control',
  title: 'Gestión hospitalaria',
  subtitle: 'Los 22 indicadores del formato de GERESA, mes a mes',
  construido: true,
});
const COMPROMISOS_DE_MEJORA = Object.freeze({
  id: 'monitoreo-compromisos',
  label: 'Compromisos de mejora',
  icon: 'sh-stamp',
  group: 'Control',
  title: 'Compromisos de mejora',
  subtitle: 'Los entregables del Anexo I que alcanzan al hospital, y sus plazos',
  construido: true,
});
const seccionDelPanel = (entrada, cambios = {}) => ({ ...entrada, ...cambios, seccion: SECCION_PANEL, iconoSeccion: 'sh-chart' });
const vistasDelPanel = (group) => [MONITOREO, GESTION_HOSPITALARIA, COMPROMISOS_DE_MEJORA].map((v) => seccionDelPanel(v, { group }));
/* La encargada del boletín lee el mismo panel de monitoreo que Estadística,
   pero en su menú se llama «Panel de monitoreo» y no «Monitoreo Indicadores».
   Son las mismas tres vistas: el panel usa sus ids para cambiar de pestaña. */
const VISTAS_MONITOREO_BOLETIN = Object.freeze(
  [MONITOREO, GESTION_HOSPITALARIA, COMPROMISOS_DE_MEJORA].map((v) => ({ ...v, group: 'Boletín', seccion: 'Panel de monitoreo', iconoSeccion: 'sh-chart' }))
);
const CONSOLIDADOS = Object.freeze([
  {
    id: 'consolidado',
    label: 'Nutrición',
    icon: 'sh-cutlery',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Nutrición y Dietética',
    subtitle: 'El total de raciones de cada mes, armado por el bot con los meses entregados',
    construido: true,
  },
  {
    id: 'consolidado-laboratorio',
    label: 'Laboratorio',
    icon: 'sh-flask',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Laboratorio',
    subtitle: 'La hoja CONSOLIDADO del libro del área, armada por el bot con los meses entregados',
    construido: true,
  },
  {
    id: 'consolidado-centro-quirurgico',
    label: 'Centro Quirúrgico',
    icon: 'sh-scalpel',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Centro Quirúrgico',
    subtitle: 'Su reporte 1, la producción de los doce meses, armado por el bot con los meses entregados',
    construido: true,
  },
  {
    id: 'consolidado-lavanderia',
    label: 'Lavandería',
    icon: 'sh-washer',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Costura y Lavandería',
    subtitle: 'Los kilogramos de ropa lavada de cada mes, por grupo de servicios, armados por el bot con los meses entregados',
    construido: true,
  },
  {
    id: 'consolidado-farmacia',
    label: 'Farmacia',
    icon: 'sh-pill',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Farmacia',
    subtitle: 'El total de cada cuadro del informe mensual, armado por el bot con los meses entregados',
    construido: true,
  },
  {
    id: 'consolidado-nefrologia',
    label: 'Nefrología',
    icon: 'sh-drop',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Nefrología y Hemodiálisis',
    subtitle: 'Los 29 indicadores del cuadro, mes a mes, armados por el bot con los meses entregados',
    construido: true,
  },
  {
    id: 'consolidado-ginecologia',
    label: 'Gineco-Obstetricia',
    icon: 'sh-baby',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Gineco-Obstetricia',
    subtitle: 'Las columnas de los dos cuadros (controles prenatales; partos, cesáreas y nacidos), mes a mes, armadas por el bot con los meses entregados',
    construido: true,
  },
  {
    id: 'consolidado-imagenes',
    label: 'Diagnóstico por Imágenes',
    icon: 'sh-xray',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Diagnóstico por Imágenes',
    subtitle: 'Los exámenes de cada modalidad y el monto en soles, mes a mes, armados por el bot con los meses entregados',
    construido: true,
  },
  {
    id: 'consolidado-epidemiologia',
    label: 'Epidemiología',
    icon: 'sh-shield',
    group: 'Consulta',
    seccion: SECCION_CONSOLIDADOS,
    title: 'Consolidado anual de Epidemiología',
    subtitle: 'Los casos nuevos de infección intrahospitalaria por servicio, mes a mes, armados por el bot con los meses entregados',
    construido: true,
  },
]);

export const NAVEGACION = Object.freeze({
  [ROL.AREA]: Object.freeze([
    {
      id: 'inicio',
      label: 'Inicio',
      icon: 'sh-home',
      title: 'Inicio',
      subtitle: 'Avance del mes en curso y cifras de los últimos meses',
      fase: 1,
      construido: true,
    },
    {
      id: 'reporte',
      label: 'Reporte del mes',
      icon: 'sh-pencil',
      group: 'Mi reporte',
      title: 'Reporte del mes',
      subtitle: 'Formatos del periodo, con sumas y validaciones cruzadas',
      fase: 1,
      /* Construido para Costura y Lavandería a partir de su oficio de junio de
         2026. Las demás áreas esperan el levantamiento del suyo. */
      construido: true,
    },
    {
      id: 'historial',
      label: 'Historial',
      icon: 'sh-clock',
      group: 'Mi reporte',
      title: 'Historial de reportes',
      subtitle: 'Periodos anteriores, su estado, su puntualidad y sus constancias',
      fase: 1,
      construido: true,
    },
    {
      id: 'consolidado',
      label: 'Consolidado anual',
      icon: 'sh-table',
      group: 'Mi reporte',
      title: 'Consolidado anual',
      subtitle: 'El total del año, armado por el bot con los meses entregados',
      /* Solo las áreas que llevan consolidado (el bot lo sabe hacer). */
      soloAreas: Object.freeze(['nutricion', 'laboratorio', 'lavanderia', 'farmacia', 'nefrologia', 'ginecologia', 'centro-quirurgico', 'imagenes', 'epidemiologia']),
      construido: true,
    },
    {
      id: 'matriz',
      label: 'A quién llega',
      icon: 'sh-share',
      group: 'Mi reporte',
      title: 'A quién llega mi reporte',
      subtitle: 'Las oficinas que reciben este reporte y por qué lo necesitan',
      fase: 0,
    },
  ]),

  [ROL.ESTADISTICA]: Object.freeze([
    ...vistasDelPanel('Control'),
    {
      id: 'semaforo',
      label: 'Cumplimiento',
      icon: 'sh-traffic-light',
      group: 'Control',
      seccion: SECCION_PANEL,
      title: 'Cumplimiento por área y periodo',
      subtitle: 'Quién entregó y quién va tarde',
      fase: 2,
      construido: true,
    },
    {
      id: 'revision',
      label: 'Bandeja de reportes',
      icon: 'sh-inbox',
      group: 'Control',
      title: 'Bandeja de reportes del mes',
      subtitle: 'Lo que entregaron las áreas, validado por el bot',
      fase: 2,
      construido: true,
    },
    {
      id: 'diresa',
      label: 'Remisión a DIRESA',
      icon: 'sh-send',
      group: 'Salidas',
      title: 'Remisión a DIRESA',
      subtitle: 'Consolidado de servicios intermedios e indicadores de gestión hospitalaria',
      fase: 2,
      construido: true,
    },
    {
      id: 'boletin',
      label: 'Boletín estadístico',
      icon: 'sh-bulletin',
      group: 'Salidas',
      title: 'Boletín estadístico',
      subtitle: 'Resumen del mes, listo para imprimir o guardar en PDF',
      fase: 2,
      construido: true,
    },
    ...CONSOLIDADOS,
    {
      id: 'matriz',
      label: 'Matriz de destinos',
      icon: 'sh-share',
      group: 'Consulta',
      title: 'Matriz de destinos',
      subtitle: 'Qué oficina recibe el reporte de cada área, y por qué',
      fase: 0,
    },
  ]),

  /* La encargada del boletín: dos módulos y ninguno más. El boletín es la
     pantalla con la que abre; el panel de monitoreo trae las cifras que lo
     alimentan, con sus tres vistas bajo una sola entrada del menú. */
  [ROL.BOLETIN]: Object.freeze([
    {
      id: 'boletin',
      label: 'Boletín estadístico',
      icon: 'sh-bulletin',
      group: 'Boletín',
      title: 'Boletín estadístico',
      subtitle: 'Resumen del mes, listo para imprimir o guardar en PDF',
      construido: true,
    },
    ...VISTAS_MONITOREO_BOLETIN,
  ]),

  /* Planeamiento recibe al nivel de Estadística: lo entregado por las nueve
     áreas. Su módulo propio es el de las actividades operativas del POI. */
  [ROL.PLANEAMIENTO]: Object.freeze([
    {
      id: 'actividades',
      label: 'Actividades operativas',
      icon: 'sh-chart',
      title: 'Actividades operativas',
      subtitle: 'La ejecución física de cada mes, calculada de los reportes de las áreas o digitada',
      construido: true,
    },
    {
      id: 'recibidos',
      label: 'Reportes recibidos',
      icon: 'sh-inbox',
      title: 'Reportes recibidos',
      subtitle: 'Lo que entregaron las nueve áreas, validado por el bot',
      construido: true,
    },
    ...CONSOLIDADOS,
    {
      id: 'matriz',
      label: 'Matriz de destinos',
      icon: 'sh-share',
      group: 'Consulta',
      title: 'Matriz de destinos',
      subtitle: 'Qué oficina recibe el reporte de cada área, y por qué',
      fase: 0,
    },
  ]),

  [ROL.OFICINA]: Object.freeze([
    {
      id: 'bandeja',
      label: 'Reportes recibidos',
      icon: 'sh-inbox',
      title: 'Reportes recibidos',
      subtitle: 'Lo que las áreas le entregaron en el mes, validado por el bot',
      construido: true,
    },
    {
      id: 'historial-oficina',
      label: 'Histórico',
      icon: 'sh-clock',
      title: 'Histórico de recepción',
      subtitle: 'Todo lo que las áreas le entregaron, con filtro por área',
      construido: true,
    },
    {
      id: 'matriz',
      label: 'Matriz de destinos',
      icon: 'sh-share',
      title: 'Matriz de destinos',
      subtitle: 'Qué áreas alimentan a esta oficina, y por qué',
      fase: 0,
    },
  ]),

  /* El equipo de desarrollo. Sus herramientas no son del flujo de reportes:
     por eso no aparecen en el menú de nadie más. */
  [ROL.ADMIN]: Object.freeze([
    {
      id: 'cuentas',
      label: 'Cuentas y roles',
      icon: 'sh-people',
      group: 'Administración',
      title: 'Cuentas y roles',
      subtitle: 'Entrar como cualquier cuenta para probarla, y reiniciar los datos del prototipo',
      fase: 0,
      construido: true,
    },
    {
      id: 'bot',
      label: 'Bot validador',
      icon: 'sh-shield',
      group: 'Administración',
      title: 'Bot validador',
      subtitle: 'Dónde corre, qué versión es y qué reglas aplica',
      fase: 0,
      construido: true,
    },
    {
      id: 'matriz',
      label: 'Matriz de destinos',
      icon: 'sh-share',
      group: 'Administración',
      title: 'Matriz de destinos',
      subtitle: 'Qué oficina recibe el reporte de cada área, y por qué',
      fase: 0,
    },
  ]),
});

/* Los grupos del menú que se pliegan con un clic en su rótulo (`AppShell`
   `collapsibleGroups`). Hoy ninguno: los consolidados, que eran el único,
   son una sección con sus áreas en pestañas. Constante: el menú del kit está
   memorizado. */
export const GRUPOS_DESPLEGABLES = Object.freeze([]);

/* Administración con el servidor: el panel del superadministrador. Sin
   servidor (el prototipo) no hay nada que administrar de verdad, y sigue con
   sus herramientas de demostración (`NAVEGACION[ROL.ADMIN]`). */
export const NAVEGACION_SUPERADMIN = Object.freeze([
  {
    id: 'resumen',
    label: 'Resumen',
    icon: 'sh-home',
    group: 'Sistema',
    title: 'Resumen del sistema',
    subtitle: 'Qué áreas reportan por el sistema, cómo van este mes y cómo va el año',
    construido: true,
  },
  {
    id: 'funcionamiento',
    label: 'Funcionamiento',
    icon: 'sh-pulse',
    group: 'Sistema',
    title: 'Cómo está funcionando',
    subtitle: 'Servidor, base de datos, bot validador, cargas de Excel y cuentas',
    construido: true,
  },
  {
    id: 'cuentas',
    label: 'Cuentas y permisos',
    icon: 'sh-people',
    group: 'Configuración',
    title: 'Cuentas y permisos',
    subtitle: 'Crear cuentas, cambiar sus datos, asignar roles y restablecer contraseñas',
    construido: true,
  },
  /* Sin el prefijo `hosp-`: es administración, no un módulo de hospitalización
     (esDeHospitalizacion), y el superadministrador sí la ve. */
  {
    id: 'unidades-hospitalizacion',
    label: 'Unidades de hospitalización',
    icon: 'sh-folder',
    group: 'Configuración',
    title: 'Unidades de hospitalización',
    subtitle: 'Departamentos y áreas a los que se asignan la enfermería y la jefatura de los pisos',
    construido: true,
  },
  {
    id: 'plazos',
    label: 'Plazos y calendario',
    icon: 'sh-calendar',
    group: 'Configuración',
    title: 'Plazos y calendario',
    subtitle: 'Día límite de cada área, feriados y aviso de semanas incompletas',
    construido: true,
  },
  {
    id: 'areas',
    label: 'Áreas y matriz',
    icon: 'sh-table',
    group: 'Configuración',
    title: 'Áreas, formatos y matriz de destinos',
    subtitle: 'Qué áreas reportan por el sistema y a qué oficinas va cada reporte',
    construido: true,
  },
  {
    id: 'personalizacion',
    label: 'Personalización',
    icon: 'sh-gear',
    group: 'Configuración',
    title: 'Personalización',
    subtitle: 'Nombre del sistema, mensaje del ingreso, aviso general y preferencias por omisión',
    construido: true,
  },
  {
    id: 'cobertura',
    label: 'Cobertura',
    icon: 'sh-calendar',
    group: 'Control',
    title: 'Cobertura de la base',
    subtitle: 'Qué meses tiene cada área en la base del servidor, y con qué archivo',
    construido: true,
  },
  {
    id: 'bitacora',
    label: 'Bitácora',
    icon: 'sh-clock',
    group: 'Control',
    title: 'Bitácora de cambios',
    subtitle: 'Quién cambió qué y cuándo, en todo el sistema',
    construido: true,
  },
  {
    id: 'soporte',
    label: 'Soporte',
    icon: 'sh-wrench',
    group: 'Control',
    title: 'Herramientas de soporte',
    subtitle: 'Ver el sistema como otra cuenta y reabrir un reporte, siempre con justificación',
    construido: true,
  },
]);

/* La carga de datos de los indicadores de desempeño (las 34 fichas de MINSA). No
   depende del rol sino de un permiso de la base, `desempeno.cargar` (solo el
   superadministrador). Lo que se mira de esas fichas está en Monitoreo
   Indicadores: el «Tablero de indicadores» se retiró el 07/11/2026. Solo con el servidor: sin HIS ni SINADEF no hay nada
   que mostrar, y el prototipo no inventa resultados. */
export const NAVEGACION_DESEMPENO = Object.freeze([
  {
    id: 'desempeno-carga',
    label: 'Carga de datos',
    icon: 'sh-upload',
    group: 'Indicadores de desempeño',
    title: 'Carga de datos de los indicadores',
    subtitle: 'Qué meses tiene cada fuente, subir archivos y registrar lo que publica MINSA',
    permiso: 'desempeno.cargar',
    construido: true,
  },
]);

/* Los roles en cuyo menú caben los indicadores: Estadística y Administración. */
const ROLES_CON_DESEMPENO = new Set([ROL.ESTADISTICA, ROL.ADMIN]);

/* Hospitalización (decisión 0011 de Egresos Hospitalarios, 14/11/2026). Sus módulos
   no dependen del rol del flujo sino de los permisos `hospitalizacion.*` del token,
   como los indicadores de desempeño: el permiso decide el rol de hospitalización
   (`rolDesdePermisos`) y el rol, sus módulos. Van al final del menú, debajo de lo
   de Estadística; una cuenta de piso (tipo `hospitalizacion`) solo tiene estos.

   Solo con el servidor: los pacientes viven en la API de hospitalización y el
   prototipo no los simula. El superadministrador no los ve aunque tenga los
   permisos: su menú es para administrar.

   El `id` lleva el prefijo `hosp-` porque la pantalla activa vive en el hash
   (`#/hosp-mapa`) y comparte espacio de nombres con las de Estadística. */
const PREFIJO_HOSPITALIZACION = 'hosp-';

export const esDeHospitalizacion = (id) => typeof id === 'string' && id.startsWith(PREFIJO_HOSPITALIZACION);

export function navegacionDeHospitalizacion(permisos = []) {
  const modulos = modulosDeRol(rolDesdePermisos(permisos));
  /* Su menú no lleva grupos de una sola entrada: si alguno de los dos quedaría con
     una, todo va en «Hospitalización» (el control de camas: el plano, RENOXI y el
     tablero; la jefatura: un solo reporte). */
  const reportes = modulos.filter((m) => MODULOS[m].grupo === GRUPO_REPORTES).length;
  const separar = reportes > 1 && modulos.length - reportes > 1;
  const grupoDe = (m) => (separar ? MODULOS[m].grupo : GRUPO);
  const entradas = modulos.map((m) => ({
    id: `${PREFIJO_HOSPITALIZACION}${m}`,
    modulo: m,
    label: MODULOS[m].label,
    icon: MODULOS[m].icono,
    group: grupoDe(m),
    title: MODULOS[m].label,
    subtitle: MODULOS[m].subtitulo,
    construido: true,
  }));
  return [...entradas.filter((e) => e.group === GRUPO), ...entradas.filter((e) => e.group !== GRUPO)];
}

/* `hospitalizacionDisponible`: false si la API de hospitalización no respondió. Entonces
   quien tiene otro menú (Estadística) no ve esos módulos; una cuenta de piso sí, para
   que su pantalla le diga que no hay conexión. Mientras se pregunta (null), se muestran.
   `real`: la sesión corre contra el servidor (`api.usaSoloDatosReales`).
   `area`: la del usuario, para las entradas que solo tienen algunas áreas
   (`soloAreas`). Sin área, esas entradas no se muestran.
   `permisos`: los de la cuenta (vienen en el token), para las entradas que
   piden uno (`permiso`). */
export function navDe(rol, opciones = {}) {
  const { real = false, permisos = [], hospitalizacionDisponible = null } = opciones;
  const apagada = hospitalizacionDisponible === false && rol !== ROL.HOSPITALIZACION;
  const hospitalizacion = real && rol !== ROL.ADMIN && !apagada ? navegacionDeHospitalizacion(permisos) : [];
  if (rol === ROL.HOSPITALIZACION) return hospitalizacion;
  return [...navDelFlujo(rol, opciones), ...hospitalizacion];
}

function navDelFlujo(rol, { real = false, area = null, permisos = [], veMonitoreo = false } = {}) {
  const base = real && rol === ROL.ADMIN ? NAVEGACION_SUPERADMIN : (NAVEGACION[rol] ?? []).filter((n) => !n.soloAreas || n.soloAreas.includes(area));
  /* Dirección entra por el panel; el superadministrador lo tiene junto a su módulo. */
  if (rol === ROL.OFICINA && veMonitoreo) return [...vistasDelPanel(undefined), ...base];
  if (!real || !ROLES_CON_DESEMPENO.has(rol)) return base;
  const propios = NAVEGACION_DESEMPENO.filter((n) => permisos.includes(n.permiso));
  /* El superadministrador tiene el panel si puede mirar los indicadores o cargarlos: antes
     llegaba junto con el «Tablero de indicadores», retirado el 07/11/2026. */
  const vePanel = rol === ROL.ADMIN && (permisos.includes('desempeno.ver') || propios.length > 0);
  const conPanel = vePanel ? [...vistasDelPanel('Indicadores de desempeño'), ...propios] : propios;
  return conPanel.length ? [...base, ...conPanel] : base;
}

export function panelDe(rol, id, opciones) {
  const menu = navDe(rol, opciones);
  return menu.find((n) => n.id === id) ?? menu[0] ?? null;
}

/* El menú lateral: las entradas de una misma `seccion` (los consolidados) se
   funden en una sola, que lleva a la primera. Las demás pasan tal cual. */
export function menuDe(nav) {
  const vistas = new Set();
  const menu = [];
  for (const n of nav) {
    if (!n.seccion) {
      menu.push(n);
      continue;
    }
    if (vistas.has(n.seccion)) continue;
    vistas.add(n.seccion);
    menu.push({ id: n.id, label: n.seccion, icon: n.iconoSeccion ?? 'sh-table', group: n.group });
  }
  return menu;
}

/* Qué entrada del menú se marca: la de la sección, si la pantalla es una de
   sus vistas. */
export function entradaDelMenu(nav, id) {
  const panel = nav.find((n) => n.id === id);
  if (!panel?.seccion) return id;
  return nav.find((n) => n.seccion === panel.seccion)?.id ?? id;
}

/* Las vistas de la sección de una pantalla, para la píldora del centro de la
   barra. Solo lo que no está en el menú lateral: una pantalla que no es vista
   de ninguna sección no tiene pestañas, y el centro queda libre. */
export function vistasDe(nav, id) {
  const panel = nav.find((n) => n.id === id);
  if (!panel?.seccion) return [];
  return nav.filter((n) => n.seccion === panel.seccion).map((n) => ({ id: n.id, label: n.label }));
}
