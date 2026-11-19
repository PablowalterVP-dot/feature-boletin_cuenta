/* Raíz de la aplicación.

   Decide tres cosas y nada más: si hay sesión, qué menú corresponde al rol
   activo y qué panel se monta. Ninguna lógica del dominio vive aquí.

   El panel activo no se guarda por rol: al cambiar de sesión, `panelDe` cae en
   la primera entrada del menú nuevo si el panel anterior no existe para ese
   rol. Así nunca se queda una pantalla en blanco por un identificador que ya
   no aplica.

   La vista vive en el hash de la URL (ruta.js): cada pantalla tiene su enlace
   y «Atrás» del navegador vuelve a la anterior. Los paneles se cargan al
   abrirse (lazy): el bundle inicial ya no trae las pantallas de los otros
   roles. */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppShell, Button, EmptyState, ID_CONTENIDO, Mosaic, Skeleton, Toast } from '@hrl/core-ui';
import { leerRuta, escribirRuta, mismaRuta } from './ruta.js';
import { useEstado, leerEstado, cerrarSesion, cambiarRolActivo, fijarHoyReal, volverAAdmin, reportesEntregados } from './datos/store.js';
import { navDe, panelDe, menuDe, entradaDelMenu, vistasDe, GRUPOS_DESPLEGABLES } from './navegacion.js';
import { ROL, ROLES } from './dominio/roles.js';
import { CLAVE_TEMA, CLAVE_PREFERENCIAS } from './tema.js';
import { nombreArea } from './datos/areas.js';
import { nombreOficina } from './datos/oficinas.js';
import { avisosDe } from './avisos.js';
import { bandaDe } from './cabecera.js';
import { PERIODO_VIGENTE, periodoVigente, etiquetaPeriodo, fechaHoyNavegador, mesesDelAnioHasta, ultimosPeriodos } from './dominio/periodos.js';
import { PERIODOS } from './datos/reportes.js';
import * as api from './servicios/api.js';
import { fechaLarga, saludo } from './dominio/formato.js';
import Login from './Login.jsx';
import DemoRol from './DemoRol.jsx';
import Marcador from './paneles/Marcador.jsx';
import AvisoMochi from './AvisoMochi.jsx';
import LimiteDeErrores from './LimiteDeErrores.jsx';
import { guiaEnMarchaPara, iniciarGuia, salirDeGuia, useGuia } from './guia/senales.js';
import { useHospitalizacionDisponible } from './servicios/hospitalizacion.js';

const Guia = lazy(() => import('./guia/Guia.jsx'));
const MatrizDestinos = lazy(() => import('./paneles/MatrizDestinos.jsx'));
const Reporte = lazy(() => import('./paneles/Reporte.jsx'));
const Monitoreo = lazy(() => import('./paneles/monitoreo/Monitoreo.jsx'));
const Historial = lazy(() => import('./paneles/Historial.jsx'));
const Inicio = lazy(() => import('./paneles/Inicio.jsx'));
const Cumplimiento = lazy(() => import('./paneles/estadistica/Cumplimiento.jsx'));
const Bandeja = lazy(() => import('./paneles/estadistica/Bandeja.jsx'));
const ReportesRecibidos = lazy(() => import('./paneles/oficina/ReportesRecibidos.jsx'));
const RemisionDiresa = lazy(() => import('./paneles/estadistica/RemisionDiresa.jsx'));
const Boletin = lazy(() => import('./paneles/estadistica/Boletin.jsx'));
const Cuentas = lazy(() => import('./paneles/admin/Cuentas.jsx'));
const Bot = lazy(() => import('./paneles/admin/Bot.jsx'));
const Resumen = lazy(() => import('./paneles/superadmin/Resumen.jsx'));
const Funcionamiento = lazy(() => import('./paneles/superadmin/Funcionamiento.jsx'));
const CuentasReales = lazy(() => import('./paneles/superadmin/Cuentas.jsx'));
const UnidadesHospitalizacion = lazy(() => import('./paneles/superadmin/UnidadesHospitalizacion.jsx'));
const Plazos = lazy(() => import('./paneles/superadmin/Plazos.jsx'));
const Areas = lazy(() => import('./paneles/superadmin/Areas.jsx'));
const Bitacora = lazy(() => import('./paneles/superadmin/Bitacora.jsx'));
const Cobertura = lazy(() => import('./paneles/superadmin/Cobertura.jsx'));
const Personalizacion = lazy(() => import('./paneles/superadmin/Personalizacion.jsx'));
const Soporte = lazy(() => import('./paneles/superadmin/Soporte.jsx'));
const ConsolidadoAnual = lazy(() => import('./paneles/ConsolidadoAnual.jsx'));
const CargaDesempeno = lazy(() => import('./paneles/desempeno/Carga.jsx'));
const ActividadesOperativas = lazy(() => import('./paneles/planeamiento/ActividadesOperativas.jsx'));
/* Los módulos de hospitalización (decisión 0011 de Egresos Hospitalarios): uno solo
   los monta todos, con el estado de los pisos que trae de su propia API. */
const Hospitalizacion = lazy(() => import('./hospitalizacion/Modulo.jsx'));

const MARCA = 'Sistema de Reporte Estadístico';

/* Título de la página. El módulo inicial de cada rol (la primera entrada de
   su menú) abre con un saludo a la persona —«Buenas noches, Milagros»—. El
   área ya no se repite en el mensaje: la ruta, encima, la dice. */
function encabezado(sesion, panel, nav) {
  if (nav[0]?.id !== panel.id) return { title: panel.title, subtitle: panel.subtitle };
  return { title: saludo(sesion.usuario.nombre), subtitle: panel.subtitle };
}

/* La ruta hasta la pantalla, sin repetir su título: el ámbito de la sesión y,
   si la pantalla cuelga de una sección o de un grupo del menú, su nombre. */
function rutaDe(sesion, panel) {
  const seccion = panel.seccion ?? panel.group;
  return [{ label: ambito(sesion) }, ...(seccion ? [{ label: seccion }] : [])];
}

/* Ámbito de la sesión en una línea: es lo que distingue a dos usuarios del
   mismo rol, y sin ello la barra superior no dice desde dónde se está viendo. */
function ambito(sesion) {
  const { usuario, rolActivo } = sesion;
  if (rolActivo === ROL.AREA) return nombreArea(usuario.area);
  if (rolActivo === ROL.OFICINA) return nombreOficina(usuario.oficina);
  if (rolActivo === ROL.PLANEAMIENTO) return ROLES[ROL.PLANEAMIENTO].label;
  if (rolActivo === ROL.BOLETIN) return ROLES[ROL.BOLETIN].label;
  if (rolActivo === ROL.ADMIN) return ROLES[ROL.ADMIN].label;
  if (rolActivo === ROL.HOSPITALIZACION) return usuario.cargo || ROLES[ROL.HOSPITALIZACION].label;
  return ROLES[ROL.ESTADISTICA].label;
}

/* Una cuenta de piso no lee reportes: pedírselos al servidor solo daría el aviso
   de que no se pudieron traer. */
const leeReportes = (sesion) => Boolean(sesion) && sesion.rolActivo !== ROL.HOSPITALIZACION;

/* Cambiar de ámbito, en el menú de la cuenta (al pie del menú lateral). Solo
   en cuentas con más de un rol; hoy, la Oficina de Epidemiología, que reporta
   como área y recibe como oficina. Antes era un botón suelto junto al título. */
function itemsDeAmbito(sesion) {
  const { usuario, rolActivo } = sesion;
  if (usuario.roles.length < 2) return [];
  return usuario.roles.map((r) => ({
    id: `ambito-${r}`,
    label: r === rolActivo ? `${ROLES[r].label} (actual)` : `Cambiar a ${ROLES[r].label}`,
    icon: ROLES[r].icono,
    disabled: r === rolActivo,
    onSelect: () => cambiarRolActivo(r),
  }));
}

/* Paneles ya construidos. Los que no están aquí caen en el marcador de
   posición, que dice en qué fase se construyen y qué van a contener. */
const CONSTRUIDOS = {
  monitoreo: ({ sesion, reportes, estado, params, irA }) => <Monitoreo reportes={reportes} propios={estado.propios} hoy={estado.hoy} params={params} irA={irA} sesion={sesion} />,
  'monitoreo-gestion': ({ sesion, reportes, estado, params, irA }) => <Monitoreo pestana="gestion" reportes={reportes} propios={estado.propios} hoy={estado.hoy} params={params} irA={irA} sesion={sesion} />,
  'monitoreo-compromisos': ({ sesion, reportes, estado, params, irA }) => <Monitoreo pestana="compromisos" reportes={reportes} propios={estado.propios} hoy={estado.hoy} params={params} irA={irA} sesion={sesion} />,
  semaforo: ({ reportes, estado, irA }) => <Cumplimiento reportes={reportes} plazosReales={estado.plazosReales} irA={irA} />,
  revision: ({ sesion, reportes, estado, params }) => (
    <Bandeja reportes={reportes} plazosReales={estado.plazosReales} params={params} sesion={sesion} />
  ),
  diresa: ({ sesion, estado, params }) => (
    <RemisionDiresa
      reportes={estado.reportes}
      propios={estado.propios}
      remisiones={estado.remisionesDiresa}
      usuario={sesion.usuario}
      params={params}
    />
  ),
  boletin: ({ estado }) => <Boletin reportes={estado.reportes} editoriales={estado.boletinEditorial} />,
  /* Planeamiento: sus actividades operativas y lo recibido de las nueve áreas.
     La bandeja es la de Estadística, sin la simulación de envíos. */
  actividades: ({ sesion, reportes, estado }) => <ActividadesOperativas reportes={reportes} actividades={estado.actividades} usuario={sesion.usuario} />,
  recibidos: ({ reportes, estado, params }) => <Bandeja reportes={reportes} plazosReales={estado.plazosReales} params={params} simulable={false} />,
  /* Las oficinas receptoras: con el servidor, lo que él dice que recibieron. */
  bandeja: ({ sesion, reportes, estado, params }) => <ReportesRecibidos reportes={api.usaSoloDatosReales() ? estado.recibidos : reportes} oficina={sesion.usuario.oficina} params={params} />,
  'historial-oficina': ({ sesion, reportes, estado }) => <ReportesRecibidos historico reportes={api.usaSoloDatosReales() ? estado.recibidos : reportes} oficina={sesion.usuario.oficina} />,
  inicio: ({ sesion, reportes, params, irA }) => <Inicio reportes={reportes} usuario={sesion.usuario} params={params} irA={irA} />,
  /* Administración ve la matriz completa, como Estadística. */
  matriz: ({ sesion }) => (
    <MatrizDestinos
      rol={sesion.rolActivo === ROL.ADMIN ? ROL.ESTADISTICA : sesion.rolActivo}
      claveArea={sesion.usuario.area}
      claveOficina={sesion.usuario.oficina}
    />
  ),
  /* Con el servidor, las cuentas reales; en el prototipo, las de demostración. */
  cuentas: ({ sesion }) => (api.usaSoloDatosReales() ? <CuentasReales sesion={sesion} /> : <Cuentas sesion={sesion} />),
  'unidades-hospitalizacion': () => <UnidadesHospitalizacion />,
  resumen: ({ irA }) => <Resumen irA={irA} />,
  funcionamiento: () => <Funcionamiento />,
  plazos: () => <Plazos />,
  areas: () => <Areas />,
  cobertura: ({ irA }) => <Cobertura irA={irA} />,
  bitacora: () => <Bitacora />,
  personalizacion: () => <Personalizacion />,
  soporte: ({ sesion, reportes }) => <Soporte sesion={sesion} reportes={reportes} />,
  /* El área ve el suyo; Estadística tiene una entrada de menú por cada área
     que lo lleva (hoy, Nutrición, Laboratorio, Lavandería, Farmacia,
     Nefrología, Gineco-Obstetricia, Centro Quirúrgico, Diagnóstico por Imágenes
     y Epidemiología). */
  consolidado: ({ sesion, reportes }) => <ConsolidadoAnual claveArea={sesion.usuario.area ?? 'nutricion'} reportes={reportes} />,
  'consolidado-laboratorio': ({ reportes }) => <ConsolidadoAnual claveArea="laboratorio" reportes={reportes} />,
  'consolidado-lavanderia': ({ reportes }) => <ConsolidadoAnual claveArea="lavanderia" reportes={reportes} />,
  'consolidado-centro-quirurgico': ({ reportes }) => <ConsolidadoAnual claveArea="centro-quirurgico" reportes={reportes} />,
  'consolidado-farmacia': ({ reportes }) => <ConsolidadoAnual claveArea="farmacia" reportes={reportes} />,
  'consolidado-nefrologia': ({ reportes }) => <ConsolidadoAnual claveArea="nefrologia" reportes={reportes} />,
  'consolidado-ginecologia': ({ reportes }) => <ConsolidadoAnual claveArea="ginecologia" reportes={reportes} />,
  'consolidado-imagenes': ({ reportes }) => <ConsolidadoAnual claveArea="imagenes" reportes={reportes} />,
  'consolidado-epidemiologia': ({ reportes }) => <ConsolidadoAnual claveArea="epidemiologia" reportes={reportes} />,
  bot: () => <Bot />,
  /* El «Tablero de indicadores» se retiró el 07/11/2026: el Panel de monitoreo muestra las 34
     fichas, y la ficha 14 (la única que el servidor calcula persona por persona) se abre desde
     él con su pantalla completa. Queda la carga de datos del superadministrador. */
  'desempeno-carga': ({ irA }) => <CargaDesempeno irA={irA} />,
  reporte: ({ sesion, reportes, params, irA }) => (
    <Reporte reportes={reportes} usuario={sesion.usuario} periodo={params.periodo} paso={params.paso} pruebas={Boolean(sesion.admin)} irA={irA} />

  ),
  historial: ({ sesion, reportes, irA }) => (
    <Historial reportes={reportes} usuario={sesion.usuario} irA={irA} />
  ),
};

/* Mientras llega el código del panel: el esqueleto de una tabla, no una
   pantalla en blanco ni un spinner que no dice qué espera. */
// Bloques del tamaño de una tarjeta mientras llega el panel. No `SkeletonRows`:
// esas son filas de tabla (<tr>) y fuera de un <table> el navegador las descarta.
function CargandoPanel() {
  return (
    <Mosaic stacked className="hrl-panel" aria-busy="true">
      <Skeleton height={120} radius="var(--radius-card)" />
      <Skeleton height={320} radius="var(--radius-card)" />
    </Mosaic>
  );
}

function Panel({ panel, sesion, reportes, estado, params, irA }) {
  if (panel.modulo) {
    return (
      <LimiteDeErrores clave={panel.id}>
        <Suspense fallback={<CargandoPanel />}>
          <Hospitalizacion modulo={panel.modulo} sesion={sesion} />
        </Suspense>
      </LimiteDeErrores>
    );
  }
  const Construido = CONSTRUIDOS[panel.id];
  if (!Construido) return <Marcador panel={panel} />;
  return (
    <LimiteDeErrores clave={panel.id}>
      <Suspense fallback={<CargandoPanel />}>
        <Construido sesion={sesion} reportes={reportes} estado={estado} params={params} irA={irA} />
      </Suspense>
    </LimiteDeErrores>
  );
}

/* Lo que se trae del servidor: la ventana de siempre (los últimos 8 meses que
   muestran las listas) y, además, todo el año en curso desde enero, para que lo
   que se cuenta «en el año» (el historial, el consolidado) no se quede corto. */
function periodosASincronizar(hoy) {
  return [...new Set([...ultimosPeriodos(PERIODOS.length, periodoVigente(hoy)), ...mesesDelAnioHasta(periodoVigente(hoy))])].sort();
}

const hashActual = () => (typeof window === 'undefined' ? '' : window.location.hash);

export default function App() {
  const estado = useEstado();
  const { reportes, sesion, hoy } = estado;
  /* La vista lleva parámetros además del identificador: el historial abre un
     periodo concreto del reporte, no el vigente. Elegir en el menú los
     descarta, porque entonces se pide el panel entero y no un caso suyo. */
  const [vista, setVista] = useState(() => leerRuta(hashActual()) ?? { id: 'inicio', params: {} });
  const [toast, setToast] = useState(null);

  /* Navegar es escribir el hash; el cambio de hash es lo que mueve la vista.
     Así «Atrás» y un enlace pegado pasan por el mismo camino que el menú. */
  /* `quieto`: el cambio es dentro de la misma pantalla (un filtro, el mes
     elegido) y no debe llevar al encabezado: quien eligió un mes quiere seguir
     viendo ese mes, no volver arriba. */
  const quieto = useRef(false);
  const irA = (id, params = {}, { quieto: sinMover = false } = {}) => {
    const destino = { id, params };
    if (mismaRuta(destino, vista)) return;
    quieto.current = sinMover;
    window.location.hash = escribirRuta(destino);
  };

  useEffect(() => {
    const alCambiar = () => setVista(leerRuta(hashActual()) ?? { id: 'inicio', params: {} });
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  /* Al cambiar de pantalla, el foco va al contenido: quien usa lector de
     pantalla oye la página nueva en vez de quedarse en el botón del menú. No
     en la primera carga, para no robarle el foco al ingreso. */
  const primeraVista = useRef(true);
  useEffect(() => {
    if (primeraVista.current) {
      primeraVista.current = false;
      return;
    }
    if (quieto.current) {
      quieto.current = false;
      return;
    }
    document.getElementById(ID_CONTENIDO)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [vista]);

  /* En modo real, trae al store lo que el backend ya sabe de Nutrición en
     cuanto hay sesión (la petición necesita el token que dejó el login). Sin
     efecto en modo mock. Depende del id de usuario, no de `sesion` entera:
     cambiar de ámbito (Epidemiología) no debe repetir la sincronización. */
  /* También al cambiar el mes vigente. Al iniciar sesión, `hoy` todavía es el del
     prototipo y el del servidor llega un momento después: si ese mes es otro, lo
     traído se queda corto. Pasó el 01/11/2026: con hoy en noviembre solo se pedía
     hasta setiembre, y octubre se veía «No iniciado» aunque estuviera entregado. */
  /* Y cuando el servidor dice qué áreas reportan: si esa respuesta llegaba después de entrar,
     solo se traía Nutrición y las demás se veían «No iniciado» hasta volver a la pestaña. */
  const mesVigente = periodoVigente(hoy);
  const areasEnFlujo = estado.configuracion?.areasEnFlujo ?? null;
  useEffect(() => {
    if (leeReportes(sesion)) for (const clave of api.clavesDeAreasReales()) api.sincronizarArea(clave, periodosASincronizar(hoy));
    if (sesion?.usuario?.oficina) api.sincronizarRecibidos(sesion.usuario.oficina);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.usuario?.id, mesVigente, areasEnFlujo]);

  /* La configuración se pide al abrir la página. Si el servidor todavía no estaba arriba, nadie
     la volvía a pedir: se insiste mientras haya sesión y no haya llegado. */
  const faltaConfiguracion = Boolean(sesion) && api.usaSoloDatosReales() && !areasEnFlujo;
  useEffect(() => {
    if (!faltaConfiguracion) return undefined;
    api.cargarConfiguracion();
    const intento = setInterval(() => api.cargarConfiguracion(), 5000);
    return () => clearInterval(intento);
  }, [faltaConfiguracion]);

  /* Lo que digita Estadística vive en el servidor: se trae al entrar, para que el panel y
     «Remisión a DIRESA» arranquen con lo guardado y no con una sesión vacía. */
  useEffect(() => {
    if (sesion?.usuario?.veMonitoreo) api.cargarPanelMonitoreo(mesVigente.slice(0, 4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.usuario?.id, mesVigente]);

  /* El «hoy» real, del reloj del backend: decide por MODO, no por área (ver
     datos/store.js). Si el backend no responde, se usa el navegador con la
     zona de Lima explícita — nunca el reloj de la PC a secas. En modo mock no
     se pide nada: el store sigue con el `HOY` del prototipo.

     Se repite cada hora y al volver a la pestaña, no solo al iniciar sesión:
     en el hospital una PC se queda con el sistema abierto días enteros, y sin
     esto alguien que entró el 30 de setiembre seguiría viendo setiembre como
     vigente el 1 de octubre, sin recargar la página.

     Mismo ciclo para las alertas de la propia área (hoy, solo Nutrición):
     piden poco y no tiene sentido un segundo reloj de refresco aparte.

     Y para los reportes reales: sin esto, Estadística solo veía lo que había
     al iniciar sesión, y un envío de Nutrición con la página ya abierta no
     llegaba a su bandeja hasta volver a entrar. Al volver a la pestaña se
     trae lo nuevo. */
  useEffect(() => {
    if (!sesion || api.MODO_API.tipo !== 'real') return;
    let vigente = true;
    const actualizar = () => {
      api.hoyDelBackend().then((fecha) => {
        if (!vigente) return;
        const hoyReal = fecha ?? fechaHoyNavegador();
        fijarHoyReal(hoyReal);
        if (sesion.usuario.area) api.alertasDe(sesion.usuario.area, periodoVigente(hoyReal));
      });
    };
    actualizar();
    const refrescar = () => {
      actualizar();
      if (leeReportes(sesion)) for (const clave of api.clavesDeAreasReales()) api.sincronizarArea(clave, periodosASincronizar(leerEstado().hoy));
      if (sesion.usuario.oficina) api.sincronizarRecibidos(sesion.usuario.oficina);
    };
    const intervalo = setInterval(refrescar, 60 * 60 * 1000);
    const alVolver = () => {
      if (document.visibilityState === 'visible') refrescar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.usuario?.id]);

  /* El tutorial guiado. Un enlace `?tutorial=1` también lo abre, para ensayarlo. El
     parámetro se quita al usarlo, para que otra cuenta no lo vuelva a abrir. */
  const guia = useGuia();
  const pedidoTutorial = vista.params?.tutorial;
  const usuarioDeLaSesion = sesion?.usuario?.id;
  useEffect(() => {
    if (!pedidoTutorial || !usuarioDeLaSesion) return;
    /* Una cuenta con dos ámbitos (Epidemiología) entra primero como oficina: el
       reporte del mes es del ámbito de área. Quien no reporta no tiene qué guiar. */
    if (sesion.usuario.roles.includes(ROL.AREA)) {
      if (sesion.rolActivo !== ROL.AREA) cambiarRolActivo(ROL.AREA);
      if (!guia.usuario) iniciarGuia(sesion.usuario);
    }
    /* Se quita también de la vista, no solo de la URL: si quedara, otra cuenta que
       entre en esta pestaña lo volvería a abrir. */
    const { tutorial: _usado, ...resto } = vista.params;
    const limpia = { id: vista.id, params: resto };
    window.history.replaceState(null, '', escribirRuta(limpia));
    quieto.current = true;
    setVista(limpia);
    // Solo cuando llega el pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoTutorial, usuarioDeLaSesion]);

  /* Cerrar la sesión o cambiar a otro ámbito acaba la práctica: lo que se apartó al
     entrar vuelve antes de que nadie más mire. */
  const tutorialValido = guiaEnMarchaPara(guia, usuarioDeLaSesion) && sesion?.rolActivo === ROL.AREA;
  useEffect(() => {
    if (guia.usuario && !tutorialValido) salirDeGuia();
  }, [guia.usuario, tutorialValido]);

  /* Al terminar se vuelve a traer lo real, por si llegó algo mientras se practicaba:
     mientras tanto, la sincronización no toca el mes de la práctica (store.js). */
  const habiaTutorial = useRef(false);
  useEffect(() => {
    if (habiaTutorial.current && !guia.usuario && leeReportes(sesion)) for (const clave of api.clavesDeAreasReales()) api.sincronizarArea(clave, periodosASincronizar(hoy));
    habiaTutorial.current = Boolean(guia.usuario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guia.usuario]);

  const real = api.usaSoloDatosReales();
  const hospitalizacionDisponible = useHospitalizacionDisponible(real && Boolean(sesion));
  const opcionesDeMenu = sesion
    ? { real, area: sesion.usuario.area, permisos: sesion.usuario.permisos ?? [], veMonitoreo: Boolean(sesion.usuario.veMonitoreo), hospitalizacionDisponible }
    : null;
  const nav = sesion ? navDe(sesion.rolActivo, opcionesDeMenu) : [];
  const panel = sesion ? panelDe(sesion.rolActivo, vista.id, opcionesDeMenu) : null;
  /* Planeamiento ve lo entregado, nunca un borrador: el filtro va aquí, una
     vez, y no en cada pantalla que comparte con Estadística. */
  const esPlaneamiento = sesion?.rolActivo === ROL.PLANEAMIENTO;
  const reportesDelRol = useMemo(() => (esPlaneamiento ? reportesEntregados(reportes) : reportes), [esPlaneamiento, reportes]);
  /* Lo que una oficina recibió, para su cabecera y sus avisos. Dirección General también
     tiene sus pantallas de Monitoreo, que leen los reportes: el cambio es solo para esto. */
  const lectorDeRecibidos = real && sesion?.rolActivo === ROL.OFICINA;
  const recibidosDeOficina = lectorDeRecibidos ? (estado.recibidos ?? []) : reportesDelRol;
  const reportesDeCabecera = lectorDeRecibidos && (panel?.id === 'bandeja' || panel?.id === 'historial-oficina') ? recibidosDeOficina : reportesDelRol;
  const marca = estado.configuracion?.nombreSistema ?? MARCA;

  /* Un enlace a un panel que este rol no tiene cae en el primero de su menú
     (panelDe); la URL se corrige para decir dónde se está de verdad, sin
     apilar una entrada más en el historial. */
  useEffect(() => {
    if (!panel || panel.id === vista.id) return;
    window.history.replaceState(null, '', escribirRuta({ id: panel.id, params: {} }));
  }, [panel, vista.id]);

  /* El estado de cada módulo (cabecera.js): de él sale el aviso de Dr. Mochi. */
  const banda = useMemo(
    () =>
      sesion && panel
        ? bandaDe(sesion, panel.id, { reportes: reportesDeCabecera, hoy, plazosReales: estado.plazosReales, remisionesDiresa: estado.remisionesDiresa, configuracion: estado.configuracion, desempeno: estado.desempeno, actividades: estado.actividades })
        : null,
    [sesion, panel, reportesDeCabecera, hoy, estado.plazosReales, estado.remisionesDiresa, estado.configuracion, estado.desempeno, estado.actividades],
  );

  const avisos = useMemo(
    () => (sesion ? avisosDe(recibidosDeOficina, sesion, estado.remisionesDiresa, hoy, estado.plazosReales, estado.alertasReales, estado.desempeno) : []),
    [recibidosDeOficina, sesion, estado.remisionesDiresa, hoy, estado.plazosReales, estado.alertasReales, estado.desempeno],
  );

  if (!sesion) return <Login />;

  /* Una cuenta del backend sin ningún rol que la interfaz sepa mostrar: antes
     esto era un `panel.id` sobre null y la página en blanco, sin decir nada. */
  if (!panel) {
    return (
      <AppShell
        brand={marca}
        themeKey={CLAVE_TEMA}
        preferencesKey={CLAVE_PREFERENCIAS}
        navItems={[]}
        title="Cuenta sin módulos"
        subtitle={sesion.usuario.nombre}
        user={{ name: sesion.usuario.nombre, email: sesion.usuario.correo, role: sesion.usuario.cargo }}
        onSignOut={cerrarSesion}
      >
        <Mosaic stacked className="hrl-panel">
          <EmptyState
            icon="sh-people"
            title="Esta cuenta no tiene ningún módulo asignado"
            body="Entró bien, pero sus permisos no corresponden a un área, a la Oficina de Estadística, a la de Planeamiento ni a una oficina receptora. Pida a la Oficina de Estadística que le asigne un rol y vuelva a ingresar."
          >
            <Button tone="cta" icon="sh-swap" onClick={cerrarSesion}>
              Cerrar sesión
            </Button>
          </EmptyState>
        </Mosaic>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell
        brand={marca}
        themeKey={CLAVE_TEMA}
        preferencesKey={CLAVE_PREFERENCIAS}
        navItems={menuDe(nav)}
        collapsibleGroups={GRUPOS_DESPLEGABLES}
        active={entradaDelMenu(nav, panel.id)}
        onSelect={(id) => irA(id)}
        {...encabezado(sesion, panel, nav)}
        breadcrumbs={rutaDe(sesion, panel)}
        date={fechaLarga(hoy)}
        tabs={
          vistasDe(nav, panel.id).length > 1
            ? { items: vistasDe(nav, panel.id), active: panel.id, onSelect: (id) => irA(id), label: panel.seccion }
            : undefined
        }
        notice={<AvisoMochi banda={banda} panelId={panel.id} sesion={sesion} reportes={reportesDelRol} hoy={hoy} irA={irA} />}
        accountItems={itemsDeAmbito(sesion)}
        user={{ name: sesion.usuario.nombre, email: sesion.usuario.correo, role: sesion.usuario.cargo }}
        notifications={avisos}
        onSignOut={cerrarSesion}
      >
        {sesion.usuario.soloLectura && (
          <Alert
            tone="warning"
            title={`Está viendo el sistema como ${sesion.usuario.nombre}`}
            action={
              <Button
                tone="ghost"
                icon="sh-swap"
                onClick={() => {
                  api.volverDeVerComo();
                  volverAAdmin();
                }}
              >
                Volver a mi cuenta
              </Button>
            }
          >
            Solo lectura: ve lo que esta cuenta ve, pero el servidor rechaza cualquier cambio. Dura una hora.
          </Alert>
        )}
        {estado.sincronizacionFallida.length > 0 && (
          <Alert
            tone="warning"
            title="No se pudieron traer todos los reportes"
            action={
              <Button tone="ghost" icon="sh-swap" onClick={() => estado.sincronizacionFallida.forEach((clave) => api.sincronizarArea(clave, periodosASincronizar(hoy)))}>
                Reintentar
              </Button>
            }
          >
            Lo que ve puede estar desactualizado: un reporte ya entregado podría figurar como no iniciado. Se vuelve a intentar al reintentar o al regresar a esta pestaña.
          </Alert>
        )}
        {estado.configuracion?.aviso && (
          <Alert tone={estado.configuracion.aviso.tono} title="Aviso">
            {estado.configuracion.aviso.texto}
          </Alert>
        )}
        <Panel panel={panel} sesion={sesion} reportes={reportesDelRol} estado={estado} params={vista.params} irA={irA} />
      </AppShell>

      {/* Las herramientas de demostración, solo en el prototipo: con el servidor no hay datos simulados que reiniciar. */}
      {!real && <DemoRol sesion={sesion} onReinicio={() => setToast(`Prototipo reiniciado. El periodo vigente vuelve a ser ${etiquetaPeriodo(PERIODO_VIGENTE)}.`)} />}

      {tutorialValido && (
        <Suspense fallback={null}>
          <Guia usuario={sesion.usuario} panelId={panel.id} irA={irA} />
        </Suspense>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}
