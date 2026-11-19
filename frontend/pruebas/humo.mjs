/* Prueba de humo.

   Ni el lint ni el build detectan lo que deja la página en blanco: un import
   que no resuelve, un export que se renombró, un módulo que lanza al cargarse,
   un icono pedido por un nombre que no está en el registro. Esto sí.

   Usa el cargador SSR de Vite para importar cada módulo de la aplicación de
   verdad, con el alias `@` resuelto igual que en el navegador, y después
   ejercita el dominio: la máquina de estados completa, las reglas de honestidad
   de las cifras y los invariantes de los datos sembrados.

   Lo que NO comprueba, y conviene decirlo en lugar de darlo por hecho: que las
   pantallas se vean bien. Eso necesita un navegador. Aquí se verifica que el
   código carga, que el flujo es coherente y que ninguna pantalla pide algo que
   no existe.

     node pruebas/humo.mjs */

import { createServer } from 'vite';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probarHospitalizacion } from './humo-hospitalizacion.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const APP = join(RAIZ, 'src', 'app');

let fallos = 0;
let pasadas = 0;

function afirmar(condicion, descripcion, detalle) {
  if (condicion) {
    pasadas += 1;
    return;
  }
  fallos += 1;
  console.error(`  x ${descripcion}${detalle ? `\n      ${detalle}` : ''}`);
}

function titulo(texto) {
  console.log(`\n${texto}`);
}

function archivos(dir, extensiones) {
  const salida = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, extensiones));
    else if (extensiones.some((e) => entrada.endsWith(e))) salida.push(ruta);
  }
  return salida;
}

function corta(ruta) {
  return relative(RAIZ, ruta).replaceAll('\\', '/');
}

const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  /* ------------------------------------------------- 1. carga de módulos */
  titulo('1. Cada módulo de la aplicación carga');

  const modulos = archivos(APP, ['.js', '.jsx']).sort();
  const cargados = new Map();

  for (const ruta of modulos) {
    const nombre = corta(ruta);
    try {
      cargados.set(nombre, await servidor.ssrLoadModule(`/${nombre}`));
      pasadas += 1;
    } catch (e) {
      fallos += 1;
      console.error(`  x ${nombre}\n      ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`  ${modulos.length} módulos, ${cargados.size} cargados.`);

  /* Todo .jsx tiene que exportar al menos un componente. No se exige que sea el
     export por defecto: los archivos de piezas compartidas exportan varios con
     nombre a propósito. Lo que se detecta aquí es el caso real —un renombrado
     que deja el export vacío— con el que React no montaría nada. */
  for (const [nombre, mod] of cargados) {
    if (!nombre.endsWith('.jsx')) continue;
    /* Un `memo` es un objeto de React, no una función, y también es un componente
       (el plano de hospitalización, `VistaMapa.jsx`). */
    const componentes = Object.values(mod).filter((v) => typeof v === 'function' || (typeof v === 'object' && v !== null && typeof v.$$typeof === 'symbol'));
    afirmar(componentes.length > 0, `${nombre} exporta algún componente`, `exports: ${Object.keys(mod).join(', ') || 'ninguno'}`);
  }

  /* --------------------------------------------------------- 2. iconos */
  titulo('2. Todo icono pedido está en el registro');

  const { ICONS } = await servidor.ssrLoadModule('@hrl/core-ui');
  const registro = new Set(ICONS);
  const pedidos = new Map();

  for (const ruta of archivos(APP, ['.js', '.jsx'])) {
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/['"](sh-[a-z0-9-]+)['"]/g)) {
      if (!pedidos.has(m[1])) pedidos.set(m[1], corta(ruta));
    }
  }
  for (const [nombre, donde] of pedidos) {
    afirmar(registro.has(nombre), `«${nombre}» está en el registro`, `pedido en ${donde}`);
  }
  console.log(`  ${pedidos.size} nombres de icono distintos en uso, ${registro.size} en el registro.`);

  /* ----------------------------------------------------- 3. sin literales */
  titulo('3. Ningún literal de color en la aplicación');

  for (const ruta of archivos(APP, ['.js', '.jsx'])) {
    const texto = readFileSync(ruta, 'utf8');
    const hex = texto.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
    /* Solo un rgb() con números escritos es un literal: el plano 3D de hospitalización
       (`pintura3d.js`) arma `rgb(${…})` con los valores que lee de los tokens, para el lienzo. */
    const rgba = texto.match(/rgba?\(\s*[\d.]/g) ?? [];
    afirmar(hex.length === 0 && rgba.length === 0, `${corta(ruta)} usa solo tokens`, [...hex, ...rgba].join(' '));
  }

  /* ------------------------------------------------------- 4. periodos */
  titulo('4. Periodos y plazos');

  const periodos = await servidor.ssrLoadModule('/src/app/dominio/periodos.js');
  /* Hoy, en el prototipo, es el 3 de octubre de 2026: se reporta septiembre,
     que vence el 10 de octubre; agosto ya venció. */
  afirmar(periodos.PERIODO_VIGENTE === '2026-09', 'el periodo vigente es septiembre 2026', periodos.PERIODO_VIGENTE);
  afirmar(periodos.plazoDe('2026-09') === '2026-10-10', 'el plazo de septiembre vence el 10 de octubre', periodos.plazoDe('2026-09'));
  afirmar(!periodos.estaVencido('2026-09') && periodos.estaVencido('2026-08'), 'septiembre sigue en plazo; agosto ya venció');
  afirmar(periodos.diasParaVencer('2026-09') === 7, 'a septiembre le quedan 7 días de plazo', String(periodos.diasParaVencer('2026-09')));
  afirmar(periodos.mesAnterior('2026-01') === '2025-12', 'el mes anterior a enero cruza el año', periodos.mesAnterior('2026-01'));
  afirmar(periodos.mesSiguiente('2026-12') === '2027-01', 'el mes siguiente a diciembre cruza el año', periodos.mesSiguiente('2026-12'));
  afirmar(periodos.etiquetaPeriodo('2026-08') === 'Agosto 2026', 'el periodo se rotula en español', periodos.etiquetaPeriodo('2026-08'));
  afirmar(periodos.periodoVigente('2026-10-03') === '2026-09', 'periodoVigente(hoy) reacciona al hoy real, no al congelado', periodos.periodoVigente('2026-10-03'));

  /* `PERIODO_VIGENTE` es el vigente **congelado** del prototipo: solo lo usan
     la siembra de datos simulados y lo que describe reiniciarla, porque esos
     dos casos siempre vuelven al mismo estado sembrado sin importar el modo.
     Cualquier otro módulo que lo importe volvería a congelar el periodo que
     muestra, exactamente el bug que esta ronda de cambios corrigió (paso «b»,
     03/10/2026): debe pedir `useHoy()` del store y `periodoVigente(hoy)`. */
  const PERMITIDOS_PERIODO_VIGENTE = new Set([
    'src/app/dominio/periodos.js',
    'src/app/datos/reportes.js',
    'src/app/paneles/admin/Cuentas.jsx',
    /* App.jsx: solo en el texto del toast de «reiniciar datos» (vuelve al
       estado sembrado, siempre el mismo sin importar el modo); el encabezado
       y los avisos de este mismo archivo ya usan `hoy`/`periodoVigente(hoy)`.
       No amplíes esta excepción sin revisar que el nuevo uso sea también
       sobre el reinicio del prototipo, no sobre qué se muestra ahora. */
    'src/app/App.jsx',
  ]);
  for (const ruta of archivos(APP, ['.js', '.jsx'])) {
    const nombre = corta(ruta);
    if (PERMITIDOS_PERIODO_VIGENTE.has(nombre)) continue;
    const texto = readFileSync(ruta, 'utf8');
    afirmar(!/\bPERIODO_VIGENTE\b/.test(texto), `${nombre} no importa el PERIODO_VIGENTE congelado`, 'use useHoy() + periodoVigente(hoy)');
  }

  /* ------------------------------------ 5. reglas de honestidad de cifras */
  titulo('5. Las cifras no mienten cuando falta el dato');

  const f = await servidor.ssrLoadModule('/src/app/dominio/formato.js');
  afirmar(f.porcentaje(0, 0).valor === null, 'denominador cero no produce un 0 %');
  afirmar(f.porcentaje(0, 0).texto === f.SIN_DATOS, 'denominador cero se rotula «Sin datos»', f.porcentaje(0, 0).texto);
  afirmar(f.porcentaje(0, 10).valor === 0, 'cero sobre diez sí es cero por ciento', f.porcentaje(0, 10).texto);
  afirmar(f.cumplimiento(50, null).texto === f.SIN_META, 'meta no registrada no es meta cero', f.cumplimiento(50, null).texto);
  afirmar(f.cumplimiento(50, 0).valor === null, 'una meta en cero no se divide');
  afirmar(f.variacion(10, 0).valor === null, 'no hay variación calculable desde cero');
  afirmar(f.variacion(null, 10).valor === null, 'un mes sin dato no vale cero');
  afirmar(f.numero(null) === f.SIN_DATOS, 'un número ausente no se pinta como cero', f.numero(null));
  afirmar(f.fecha('2026-09-10').includes('septiembre'), 'las fechas van en español', f.fecha('2026-09-10'));

  /* ------------------------------------------------------- 6. la matriz */
  titulo('6. La matriz de destinos es coherente');

  const areas = await servidor.ssrLoadModule('/src/app/datos/areas.js');
  const oficinas = await servidor.ssrLoadModule('/src/app/datos/oficinas.js');
  const clavesOficina = new Set(oficinas.OFICINAS.map((o) => o.clave));

  afirmar(areas.AREAS.length === 9, 'son nueve áreas (Mantenimiento se retiró)', String(areas.AREAS.length));
  afirmar(oficinas.OFICINAS.length === 4, 'son cuatro oficinas receptoras', String(oficinas.OFICINAS.length));

  for (const a of areas.AREAS) {
    for (const d of a.destinos) {
      afirmar(clavesOficina.has(d), `${a.clave} remite a una oficina que existe`, d);
    }
    /* El nombre breve es lo que se pinta donde el texto no envuelve. Si falta,
       el botón o la columna del semáforo quedaría con la clave interna. */
    afirmar(Boolean(a.nombreBreve) && a.nombreBreve.length <= 20, `${a.clave} tiene nombre breve utilizable`, a.nombreBreve);
    afirmar(!a.destinos.includes('estadistica'), `${a.clave} no lista Estadística entre sus destinos opcionales`);
    afirmar(areas.destinosDe(a.clave)[0] === 'estadistica', `${a.clave} tiene Estadística como primer receptor`);
  }

  const dobles = areas.AREAS.filter((a) => a.tambienEsOficina);
  afirmar(dobles.length === 1 && dobles[0].clave === 'epidemiologia', 'Epidemiología es la única con doble rol');
  afirmar(
    oficinas.OFICINAS.find((o) => o.clave === 'epidemiologia')?.tambienEsArea === true,
    'el doble rol está declarado en los dos lados',
  );

  const aFondo = areas.AREAS.filter((a) => a.profundidad === 'completa');
  afirmar(aFondo.length === 6, 'seis áreas están marcadas para modelar a fondo', aFondo.map((a) => a.clave).join(', '));
  afirmar(areas.area('farmacia').profundidad === 'completa', 'Farmacia pasó de «listada» a «completa»');
  afirmar(areas.areasQueRemitenA('cuerpo-tecnico').length === 1, 'Cuerpo Técnico recibe de una sola área');
  /* Planeamiento recibe de las nueve áreas desde el 27/10/2026: es un rol al
     nivel de Estadística, con su propio módulo (sección 25). */
  afirmar(areas.areasQueRemitenA('planeamiento').length === 9, 'Planeamiento recibe de las nueve áreas', String(areas.areasQueRemitenA('planeamiento').length));
  afirmar(areas.destinosDe('nutricion').includes('planeamiento'), 'Nutrición remite a Planeamiento, como dice su oficio');

  /* ----------------------------------------------- 7. máquina de estados */
  titulo('7. La máquina de estados no tiene callejones sin salida');

  const est = await servidor.ssrLoadModule('/src/app/dominio/estados.js');

  for (const t of est.TRANSICIONES) {
    afirmar(Boolean(est.ESTADOS[t.hasta]), `la transición «${t.accion}» llega a un estado declarado`, t.hasta);
    for (const desde of t.desde) {
      afirmar(Boolean(est.ESTADOS[desde]), `la transición «${t.accion}» parte de un estado declarado`, desde);
    }
  }

  for (const clave of Object.keys(est.ESTADOS)) {
    const salidas = ['area', 'estadistica', 'oficina'].flatMap((r) => est.transicionesDe(clave, r));
    afirmar(salidas.length > 0, `el estado «${clave}» tiene al menos una salida`);
  }

  afirmar(est.transicionesDe('no_iniciado', 'oficina').length === 0, 'una oficina receptora no puede crear un reporte');
  afirmar(est.transicionesDe('borrador', 'estadistica').length === 0, 'Estadística no toca un borrador ajeno');
  afirmar(
    !est.ESTADOS.observado && !est.transicion('observar') && !est.transicion('corregir'),
    'Estadística no devuelve reportes: no hay estado ni transición de observaciones',
  );
  afirmar(!est.puede('remitido', 'enviar', 'area'), 'no se puede enviar dos veces');
  afirmar(est.esEditable('borrador') && !est.esEditable('remitido'), 'solo el borrador es editable');
  afirmar(est.estaEntregado('remitido') && !est.estaEntregado('borrador'), 'un borrador no cuenta como entregado');
  /* 12/10/2026: el bot es la validación. Estadística ya no revisa, valida ni remite. */
  afirmar(
    !est.transicion('revisar') && !est.transicion('validar') && !est.transicion('remitir') && !est.ESTADOS.enviado && !est.ESTADOS.validado,
    'no hay revisión, validación ni remisión de Estadística',
  );
  afirmar(est.transicion('enviar').hasta === 'remitido', 'enviar entrega el reporte directamente a sus oficinas');
  afirmar(est.etiquetaDeEstado('validado') === 'Validado' && est.etiquetaDeEstado('remitido') === 'Entregado', 'un historial antiguo se sigue leyendo con sus nombres');

  /* -------------------------------------- 8. datos sembrados coherentes */
  titulo('8. El historial simulado es cronológicamente posible');

  const { REPORTES_INICIALES, PERIODOS } = await servidor.ssrLoadModule('/src/app/datos/reportes.js');
  afirmar(PERIODOS.length === 8, 'se sembraron ocho periodos', String(PERIODOS.length));

  for (const r of REPORTES_INICIALES) {
    afirmar(r.historial.length > 0, `${r.id} tiene historial`);
    afirmar(r.historial.at(-1).estado === r.estado, `${r.id} termina en el estado que declara`, `${r.historial.at(-1).estado} != ${r.estado}`);

    const fechas = r.historial.map((h) => h.fecha);
    afirmar(fechas.join() === [...fechas].sort().join(), `${r.id} tiene los pasos en orden`, fechas.join(' -> '));
    afirmar(fechas.at(-1).slice(0, 10) <= periodos.HOY, `${r.id} no ocurre en el futuro`, fechas.at(-1));

    if (est.estaEntregado(r.estado)) {
      afirmar(Boolean(r.folio && r.constancia), `${r.id} entregado tiene folio y constancia`);
    } else {
      afirmar(r.folio === null, `${r.id} sin entregar no tiene folio`);
    }

    if (r.estado === 'remitido') {
      afirmar(Boolean(r.remision?.acta), `${r.id} remitido tiene acta`);
      afirmar(r.remision.fecha === r.enviadoEn, `${r.id} llegó a sus oficinas en el mismo momento del envío`, `${r.remision.fecha} != ${r.enviadoEn}`);
      const esperados = areas.destinosDe(r.area).filter((d) => d !== 'estadistica');
      afirmar(
        r.remision.destinos.join() === esperados.join(),
        `${r.id} se remitió a los destinos de la matriz`,
        `${r.remision.destinos.join()} != ${esperados.join()}`,
      );
    }

  }

  /* El periodo vigente debe mostrar variedad: es lo que hace útil al semáforo. */
  const delVigente = REPORTES_INICIALES.filter((r) => r.periodo === periodos.PERIODO_VIGENTE);
  const distintos = new Set(delVigente.map((r) => r.estado));
  /* Los tres estados: en llenado, entregado y «no iniciado», que es la ausencia de registro. */
  afirmar(distintos.size === 2 && delVigente.length < 10, 'el periodo vigente tiene los tres estados: dos guardados y «no iniciado»', [...distintos].join(', '));
  /* Cuatro sin registro: tres que siguen en plazo y Farmacia, que empieza sin
     historial (sube sus Word desde enero). */
  afirmar(delVigente.length === 6, 'cuatro áreas aún no abren el periodo vigente', `${delVigente.length} de 10 con registro`);
  afirmar(!REPORTES_INICIALES.some((r) => r.area === 'farmacia'), 'Farmacia empieza sin historial: cada mes existe solo si sube su informe');

  /* ---------------------------------------- 9. el ciclo completo corre */
  titulo('9. El ciclo completo del reporte corre de principio a fin');

  const store = await servidor.ssrLoadModule('/src/app/datos/store.js');
  const CICLO = [
    ['crear', 'area', 'borrador'],
    ['enviar', 'area', 'remitido'],
    ['rectificar', 'estadistica', 'borrador'],
  ];

  for (const [accion, rol, esperado] of CICLO) {
    const r = store.aplicarTransicion('lavanderia', '2026-09', accion, { actor: 'Prueba de humo', rol });
    afirmar(r?.estado === esperado, `«${accion}» deja el reporte en «${esperado}»`, r ? r.estado : 'la transición fue rechazada');
    if (accion === 'enviar') {
      afirmar(
        r?.remision?.destinos.join() === areas.destinosDe('lavanderia').filter((d) => d !== 'estadistica').join() && r.remision.fecha === r.enviadoEn,
        'al enviar, el reporte llega en el mismo momento a las oficinas de la matriz',
      );
    }
  }

  afirmar(
    store.aplicarTransicion('lavanderia', '2026-09', 'enviar', { actor: 'Prueba', rol: 'estadistica' }) === null,
    'Estadística no envía el reporte de un área',
  );

  /* Lo que ve una oficina receptora: lo que las áreas le entregaron al enviar.
     Nunca un borrador, y solo lo suyo. */
  const dePlaneamiento = store.reportesRecibidosPor(REPORTES_INICIALES, 'planeamiento');
  afirmar(dePlaneamiento.length > 0, 'Planeamiento tiene reportes que ver');
  afirmar(dePlaneamiento.every((r) => r.estado === 'remitido'), 'Planeamiento solo ve reportes entregados');
  afirmar(!dePlaneamiento.some((r) => r.estado === 'borrador'), 'Planeamiento nunca ve un borrador');
  afirmar(dePlaneamiento.some((r) => r.id === 'nutricion:2026-06'), 'junio de Nutrición está en Planeamiento: llegó al enviarlo');
  afirmar(
    dePlaneamiento.every((r) => areas.area(r.area).destinos.includes('planeamiento')),
    'Planeamiento no ve reportes de áreas que no le competen',
  );
  afirmar(
    store.reportesRecibidosPor(REPORTES_INICIALES, 'cuerpo-tecnico').every((r) => r.area === 'imagenes'),
    'Cuerpo Técnico solo recibe Diagnóstico por Imágenes',
  );
  store.reiniciarDatos();

  /* ------------------------------------------------ 10. navegación por rol */
  titulo('10. Cada rol tiene su menú y ningún panel queda huérfano');

  const nav = await servidor.ssrLoadModule('/src/app/navegacion.js');
  const roles = await servidor.ssrLoadModule('/src/app/dominio/roles.js');

  /* Hospitalización solo existe con el servidor y con sus permisos: su menú se mira
     así (el detalle, en la sección 29). */
  const opcionesDe = (clave) => (clave === roles.ROL.HOSPITALIZACION ? { real: true, permisos: ['hospitalizacion.ver', 'hospitalizacion.operar'] } : {});
  for (const clave of Object.values(roles.ROL)) {
    const entradas = nav.navDe(clave, opcionesDe(clave));
    afirmar(entradas.length > 0, `el rol «${clave}» tiene menú`);
    for (const e of entradas) {
      afirmar(Boolean(e.title && e.subtitle), `${clave}/${e.id} tiene título y subtítulo`);
      afirmar(registro.has(e.icon), `${clave}/${e.id} usa un icono del registro`, e.icon);
      afirmar(
        e.fase === 0 || e.construido || Array.isArray(e.detalle),
        `${clave}/${e.id} pendiente explica qué contendrá`,
      );
    }
    /* Un identificador desconocido no debe dejar la pantalla en blanco. */
    afirmar(Boolean(nav.panelDe(clave, 'no-existe', opcionesDe(clave))), `el rol «${clave}» cae en un panel por defecto`);
  }

  /* Los usuarios de demostración cubren los tres roles del flujo, más la
     cuenta de administración del equipo de desarrollo. */
  const usuarios = await servidor.ssrLoadModule('/src/app/datos/usuarios.js');
  afirmar(usuarios.USUARIOS.length === 15, 'hay quince cuentas: catorce del flujo y la de administración', String(usuarios.USUARIOS.length));
  afirmar(usuarios.porNombreDeUsuario('admin')?.roles.includes(roles.ROL.ADMIN), 'la cuenta «admin» tiene el rol de administración');

  /* CREDENCIALES.txt es la única forma de conocer las cuentas desde que el
     ingreso no las lista: no puede faltar ninguna. */
  const credenciales = readFileSync(join(RAIZ, '..', 'CREDENCIALES.txt'), 'utf8');
  for (const u of usuarios.USUARIOS) {
    afirmar(new RegExp(`^${u.usuario}\\s`, 'm').test(credenciales), `CREDENCIALES.txt lista la cuenta «${u.usuario}»`);
  }
  for (const a of areas.AREAS) {
    afirmar(Boolean(usuarios.usuarioDeArea(a.clave)), `${a.clave} tiene una cuenta con la que entrar`);
  }
  for (const o of oficinas.OFICINAS) {
    afirmar(
      usuarios.USUARIOS.some((u) => u.oficina === o.clave),
      `${o.clave} tiene una cuenta con la que entrar`,
    );
  }

  /* ------------------------------------------- 11. las pantallas renderizan */
  titulo('11. Cada pantalla renderiza sin lanzar');

  /* `AppShell` lee la preferencia del menú en el inicializador de un useState,
     que sí corre al renderizar en servidor. Un apaño mínimo basta: los efectos
     no se ejecutan, y todo lo que se monta en portal (diálogos, tooltips,
     el conmutador de la demostración) devuelve null mientras esté cerrado. */
  const guardado = new Map();
  globalThis.localStorage ??= {
    getItem: (k) => guardado.get(k) ?? null,
    setItem: (k, v) => guardado.set(k, String(v)),
    removeItem: (k) => guardado.delete(k),
  };

  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');

  function render(descripcion, componente, props = {}) {
    try {
      const html = renderToStaticMarkup(createElement(componente, props));
      afirmar(html.length > 0, `${descripcion} produce marcado`, `longitud ${html.length}`);
      return html;
    } catch (e) {
      fallos += 1;
      console.error(`  x ${descripcion} lanzó al renderizar\n      ${e.message.split('\n')[0]}`);
      return '';
    }
  }

  const { default: Login } = await servidor.ssrLoadModule('/src/app/Login.jsx');
  const { default: App } = await servidor.ssrLoadModule('/src/app/App.jsx');
  const { default: Marcador } = await servidor.ssrLoadModule('/src/app/paneles/Marcador.jsx');
  const { default: MatrizDestinos } = await servidor.ssrLoadModule('/src/app/paneles/MatrizDestinos.jsx');

  const ingreso = render('la pantalla de ingreso', Login);
  afirmar(ingreso.includes('Reporte Estadístico'), 'el ingreso muestra el nombre del sistema');
  afirmar(ingreso.includes('ficticios'), 'el ingreso advierte que los datos son ficticios');
  afirmar(ingreso.includes('hrl-login'), 'el ingreso es el LoginScreen del kit, con la fachada');
  /* Sin accesos directos: ninguna cuenta aparece listada en el ingreso. */
  afirmar(!ingreso.includes('Accesos directos') && !ingreso.includes('Nefrología'), 'el ingreso no lista las cuentas');

  /* Administración: entra como otra cuenta y vuelve. */
  const admin = usuarios.porNombreDeUsuario('admin');
  store.iniciarSesion(admin);
  afirmar(store.leerEstado().sesion.admin?.id === 'admin', 'la sesión de administración se reconoce como tal');
  store.iniciarSesion(usuarios.usuario('area-nutricion'), { admin });
  afirmar(store.leerEstado().sesion.admin?.id === 'admin' && store.leerEstado().sesion.rolActivo === 'area', 'desde administración se entra como un área, recordando de dónde vino');
  store.volverAAdmin();
  afirmar(store.leerEstado().sesion.usuario.id === 'admin', 'y se vuelve a administración');
  store.iniciarSesion(usuarios.usuario('area-nutricion'));
  afirmar(!store.leerEstado().sesion.admin, 'una cuenta que entra por el ingreso no tiene herramientas de administración');
  store.cerrarSesion();
  const { default: Cuentas } = await servidor.ssrLoadModule('/src/app/paneles/admin/Cuentas.jsx');
  const htmlCuentas = render('las cuentas de administración', Cuentas, { sesion: { usuario: admin, rolActivo: 'admin', admin } });
  afirmar(usuarios.USUARIOS.every((u) => htmlCuentas.includes(u.usuario)), 'administración lista todas las cuentas');
  const { default: BotPanel } = await servidor.ssrLoadModule('/src/app/paneles/admin/Bot.jsx');
  afirmar(render('el panel del bot', BotPanel).includes('incompleto'), 'administración ve las reglas del bot');

  /* La matriz, desde los tres puntos de vista. */
  const completa = render('la matriz vista por Estadística', MatrizDestinos, { rol: 'estadistica' });
  afirmar(completa.includes('Matriz de destinos'), 'la matriz completa se titula');
  /* Las diez filas, por nombre: la sigla del área no se pinta en la tabla, las
     cabeceras de columna llevan las siglas de los receptores. */
  for (const a of areas.AREAS) {
    afirmar(completa.includes(a.nombreCorto), `la matriz incluye la fila de ${a.nombreCorto}`);
  }
  for (const o of oficinas.OFICINAS) {
    afirmar(completa.includes(o.sigla), `la matriz incluye la columna ${o.sigla}`);
  }
  render('la matriz vista por un área', MatrizDestinos, { rol: 'area', claveArea: 'nefrologia' });
  render('la matriz vista por una oficina', MatrizDestinos, { rol: 'oficina', claveOficina: 'planeamiento' });

  /* Todo panel pendiente debe poder pintar su marcador de posición. */
  for (const clave of Object.values(roles.ROL)) {
    for (const e of nav.navDe(clave)) {
      if (e.fase === 0 || e.construido) continue;
      const html = render(`el marcador de ${clave}/${e.id}`, Marcador, { panel: e });
      afirmar(html.includes(`Fase ${e.fase}`), `el marcador de ${clave}/${e.id} dice su fase`);
    }
  }

  /* Y la aplicación completa, con una sesión de cada rol. Es la comprobación
     que más cerca queda de abrir el navegador: monta el shell, el menú, los
     avisos derivados y el panel activo. */
  for (const id of ['est-1', 'area-nefrologia', 'of-planeamiento', 'area-epidemiologia']) {
    const u = usuarios.usuario(id);
    store.iniciarSesion(u);
    const html = render(`la aplicación con la sesión de ${u.usuario}`, App);
    afirmar(html.includes(u.nombre) || html.length > 500, `la sesión de ${u.usuario} llega al shell`);
  }

  /* La cabecera de cada módulo (kit 1.11.0): la llevan todos los módulos de
     todos los roles, el inicial abre con un saludo, dice lo que pasa con el
     reporte vigente sin contradecirlo, y sus botones solo llevan a pantallas
     que ese rol tiene. La banda verde con la mascota ya no se dibuja. */
  {
    const cabecera = await servidor.ssrLoadModule('/src/app/cabecera.js');
    const periodos = await servidor.ssrLoadModule('/src/app/dominio/periodos.js');
    const navegacion = await servidor.ssrLoadModule('/src/app/navegacion.js');
    const formato = await servidor.ssrLoadModule('/src/app/dominio/formato.js');
    const nut = usuarios.usuario('area-nutricion');
    store.reiniciarDatos();
    store.iniciarSesion(nut);
    const htmlNut = render('la aplicación con la sesión de Nutrición', App);
    const saludoNut = formato.saludo(nut.nombre);
    afirmar(htmlNut.includes('hrl-pagehead') && !htmlNut.includes('hrl-banda'), 'Nutrición entra con la cabecera nueva, sin la banda');
    afirmar(htmlNut.includes(saludoNut), 'el inicio de Nutrición saluda a la persona por su nombre', saludoNut);
    afirmar(htmlNut.includes('hrl-cuenta') && !htmlNut.includes('hrl-barra-boton--primario'), 'el perfil va al pie del menú y la barra no lleva botón «+»');
    for (const id of ['area-nefrologia', 'est-1', 'of-planeamiento', 'admin']) {
      store.iniciarSesion(usuarios.usuario(id));
      const h = render(`la aplicación con la sesión ${id}`, App);
      afirmar(h.includes('hrl-pagehead') && !h.includes('hrl-banda'), `${id} también entra con la cabecera nueva`);
      afirmar(/Buen(os días|as tardes|as noches)/.test(h), `${id} abre su módulo inicial con un saludo`);
    }
    afirmar(formato.saludo('MILAGROS ZUMAETA', new Date(2026, 9, 31, 23)) === 'Buenas noches, Milagros', 'el saludo escribe el nombre como nombre propio y sigue la hora');
    afirmar(formato.saludo('', new Date(2026, 9, 31, 8)) === 'Buenos días', 'sin nombre, el saludo va solo');
    {
      /* Las pestañas del centro son solo lo que no está en el menú lateral:
         el historial del área no lleva ninguna (está en el menú), y los
         consolidados de Estadística son una entrada del menú con sus nueve
         áreas en pestañas. En el render de servidor no hay `window`: basta
         con la dirección, que es lo único que App lee de él al montar. */
      store.iniciarSesion(nut);
      globalThis.window = { location: { hash: '#/historial' } };
      const h = render('el historial de Nutrición', App);
      afirmar(!h.includes('class="hrl-vistas"'), 'el historial no repite el menú en pestañas');
      store.iniciarSesion(usuarios.usuario('est-1'));
      globalThis.window = { location: { hash: '#/consolidado-farmacia' } };
      const hc = render('el consolidado de Farmacia', App);
      delete globalThis.window;
      afirmar(hc.includes('class="hrl-vistas"') && /aria-current="page"[^>]*>Farmacia</.test(hc), 'el consolidado de Farmacia muestra las áreas en pestañas con la suya marcada');
      afirmar((hc.match(/hrl-nav-item__label">Consolidados anuales</g) ?? []).length === 1 && !hc.includes('hrl-nav-item__label">Farmacia<'), 'el menú lleva una sola entrada de consolidados');
    }

    const estado = () => ({ ...store.leerEstado(), hoy: periodos.HOY });
    for (const id of ['area-nutricion', 'area-nefrologia', 'area-lavanderia', 'est-1', 'of-planeamiento', 'admin']) {
      const u = usuarios.usuario(id);
      for (const rol of u.roles) {
        const sesion = { usuario: u, rolActivo: rol };
        const menu = navegacion.navDe(rol);
        for (const modulo of menu) {
          const banda = cabecera.bandaDe(sesion, modulo.id, estado());
          afirmar(Boolean(banda?.status?.label && banda.status.detail), `${id} · ${modulo.id}: la banda dice su estado`);
          afirmar((banda?.mascot != null) === (rol === roles.ROL.AREA && modulo.id === 'inicio'), `${id} · ${modulo.id}: Dr. Mochi solo en el Inicio de un área`);
          for (const a of banda?.acciones ?? []) {
            afirmar(menu.some((m) => m.id === a.ir[0]), `${id} · ${modulo.id}: «${a.texto}» lleva a una pantalla que el rol tiene`);
          }
        }
      }
    }

    const sesionNut = { usuario: nut, rolActivo: roles.ROL.AREA };
    const inicio = cabecera.bandaDe(sesionNut, 'inicio', estado());
    afirmar(inicio?.clock === true && Boolean(inicio.mascot) && Boolean(inicio.status?.label), 'en Inicio: estado, mascota y hora');
    const vencido = periodos.diasParaVencer(periodos.PERIODO_VIGENTE) < 0;
    afirmar(!vencido || (inicio.status.label === 'Plazo vencido' && inicio.status.tone === 'warning'), 'un plazo vencido se dice, sobre amarillo');

    /* Lo que dice Estadística cambia con el flujo, no es un rótulo fijo. */
    const sesionEst = { usuario: usuarios.usuario('est-1'), rolActivo: roles.ROL.ESTADISTICA };
    const antes = cabecera.bandaDe(sesionEst, 'semaforo', estado()).status.label;
    store.simularEntrega('nutricion', periodos.PERIODO_VIGENTE);
    const enviado = cabecera.bandaDe(sesionNut, 'inicio', estado());
    afirmar(enviado.status.label === 'Entregado' && enviado.acciones.every((a) => a.ir[0] !== 'reporte' || !a.ir[1]), 'enviado el reporte, la cabecera deja de pedirlo');
    afirmar(cabecera.bandaDe(sesionEst, 'semaforo', estado()).status.label !== antes, 'una entrega cambia la cuenta de Cumplimiento');
    afirmar(/recibido/.test(cabecera.bandaDe(sesionEst, 'revision', estado()).status.label), 'lo entregado aparece como recibido en la bandeja, sin nada por revisar');
    store.reiniciarDatos();
  }

  /* El doble rol debe poder cambiar de ámbito sin romperse. */
  store.iniciarSesion(usuarios.usuario('area-epidemiologia'));
  store.cambiarRolActivo('oficina');
  render('la aplicación con Epidemiología en su ámbito de oficina', App);

  /* La pantalla activa vive en el hash: enlace directo y «Atrás» del navegador. */
  const ruta = await servidor.ssrLoadModule('/src/app/ruta.js');
  const conPeriodo = ruta.escribirRuta({ id: 'reporte', params: { periodo: '2026-06', paso: '' } });
  afirmar(conPeriodo === '#/reporte?periodo=2026-06', 'la ruta escribe el panel y sus parámetros, sin los vacíos', conPeriodo);
  const leida = ruta.leerRuta(conPeriodo);
  afirmar(leida?.id === 'reporte' && leida.params.periodo === '2026-06', 'y se vuelve a leer igual');
  afirmar(ruta.leerRuta('') === null && ruta.leerRuta('#contenido-principal') === null, 'un hash vacío o ajeno no es una ruta (el enlace de salto no navega)');
  afirmar(ruta.mismaRuta({ id: 'revision', params: { periodo: '2026-08', area: 'nutricion' } }, { id: 'revision', params: { area: 'nutricion', periodo: '2026-08' } }), 'el orden de los parámetros no cambia la ruta');

  /* ---------------------------------------- 12. los formatos de Lavandería */
  titulo('12. Los cuatro formatos de Lavandería');

  const estructura = await servidor.ssrLoadModule('/src/app/datos/formatos/lavanderia.js');
  const calc = await servidor.ssrLoadModule('/src/app/datos/formatos/lavanderia-calculos.js');

  afirmar(estructura.SERVICIOS.length === 15, 'el Formato 1 tiene catorce servicios y UCI-CIRUGIA, ocasional', String(estructura.SERVICIOS.length));
  afirmar(estructura.GRUPOS.length === 10, 'el consolidado tiene diez filas', String(estructura.GRUPOS.length));
  afirmar(estructura.FORMATOS.length === 4, 'son cuatro formatos', String(estructura.FORMATOS.length));

  /* Cada servicio suma a un grupo que existe, y ningún grupo se queda huérfano. */
  const clavesGrupo = new Set(estructura.GRUPOS.map((g) => g.clave));
  for (const s of estructura.SERVICIOS) {
    afirmar(clavesGrupo.has(s.grupo), `${s.clave} suma a un grupo declarado`, s.grupo);
  }
  for (const g of estructura.GRUPOS) {
    afirmar(estructura.serviciosDelGrupo(g.clave).length > 0, `el grupo ${g.clave} recibe algún servicio`);
  }

  /* El caso real: el Excel real de julio de 2026 (insumos/lavanderia/, fuera
     del repositorio), con los totales que lee el propio lector del bot. Si el
     agrupamiento del consolidado se rompiera, esto lo detecta. */
  const JULIO = '2026-07';
  const TOTALES_JULIO = {
    'c-externos': 710, emergencia: 436, psiquiatria: 327, 'med-general': 2356, quemados: 577,
    'uci-medicina': 804, maternidad: 660, 'c-obstetrico': 590, 'pediatria-uci': 1098,
    'neo-aloj': 867, ginecologia: 698, 'c-quirurgico': 3401, cirugia: 470, hemodialisis: 949,
  };
  /* Se pone cada total del Excel real en el día 1, que basta para comprobar
     el agrupamiento sin repetir aquí las cifras diarias (ya están, leídas del
     Excel real, en lavanderia-siembra.js). */
  const dia1 = (v) => {
    const a = Array.from({ length: 31 }, () => null);
    a[0] = v;
    return a;
  };
  const f1Julio = Object.fromEntries(Object.entries(TOTALES_JULIO).map(([k, v]) => [k, dia1(v)]));

  afirmar(calc.totalF1(f1Julio, JULIO) === 13943, 'el total de julio es 13 943 kg, el del Excel real', String(calc.totalF1(f1Julio, JULIO)));

  const KILOS_F4_JULIO = {
    emergencias: 436, 'consul-externos': 710, psiquiatria: 327, 'med-uci-quemados': 3737,
    'maternidad-gineco': 1358, 'centro-obstetrico': 590, 'pediatria-uci': 1098,
    'neonato-aloj': 867, 'quirurgico-cirugia': 3871, hemodialisis: 949,
  };
  for (const [grupo, esperado] of Object.entries(KILOS_F4_JULIO)) {
    const calculado = calc.kilosDelGrupo(f1Julio, grupo, JULIO);
    afirmar(calculado === esperado, `el consolidado de ${grupo} cuadra con el Excel real de julio`, `${calculado} != ${esperado}`);
  }

  /* Las tarifas: un ejemplo simple, no del Excel real. El Excel real de julio
     no trae los mismos kilos en el Formato 1 y en el Formato 3 (son dos hojas
     distintas, cada una validada por su cuenta): forzar que cuadren sería
     fabricar una regla que el propio Excel real no cumple. */
  const f3Ejemplo = { comun: dia1(100), sucia: dia1(20) };
  const tf3 = calc.totalesF3(f3Ejemplo, JULIO);
  afirmar(tf3.kgTotal === 120, 'el Formato 3 suma sus dos categorías', String(tf3.kgTotal));
  afirmar(tf3.importeComun === 300, 'la ropa común se cobra a S/ 3,00 el kilo', String(tf3.importeComun));
  afirmar(tf3.importeSucia === 90, 'la ropa sucia se cobra a S/ 4,50 el kilo', String(tf3.importeSucia));
  afirmar(tf3.importeTotal === 390, 'el importe total es la suma de las dos categorías', String(tf3.importeTotal));

  /* La ausencia de dato no es cero. */
  afirmar(calc.totalF1({}, JULIO) === null, 'un Formato 1 vacío no suma cero kilos');
  afirmar(calc.totalServicio({}, 'c-externos', JULIO) === null, 'un servicio sin registrar no vale cero');
  afirmar(calc.kilosDelGrupo({}, 'emergencias', JULIO) === null, 'un grupo sin datos no vale cero');

  /* Las piezas, que no salen de ningún otro cuadro: el bot (reglas.js) las
     exige cuando el grupo tiene kilos registrados. */
  const completo = {
    f1: Object.fromEntries(estructura.SERVICIOS.map((s) => [s.clave, Array.from({ length: 31 }, () => 10)])),
    f3: { comun: Array.from({ length: 31 }, () => 400), sucia: Array.from({ length: 31 }, () => 20) },
    f2: [],
    f4: {
      piezas: Object.fromEntries(estructura.GRUPOS.map((g) => [g.clave, 50])),
      insumos: Object.fromEntries(estructura.INSUMOS.map((i) => [i.clave, '1 UNIDAD'])),
    },
  };
  const limpio = calc.validar(completo, JULIO);
  afirmar(limpio.errores.length === 0, 'un reporte completo, con sus kilos, piezas e insumos, no tiene errores', JSON.stringify(limpio.errores.slice(0, 2)));

  const piezasSinEmergencias = { ...completo.f4.piezas };
  delete piezasSinEmergencias.emergencias;
  const sinUnaPieza = { ...completo, f4: { ...completo.f4, piezas: piezasSinEmergencias } };
  const conFalta = calc.validar(sinUnaPieza, JULIO);
  afirmar(conFalta.errores.some((e) => e.id === 'incompleto' && e.formato === 'f4'), 'faltar las piezas de un grupo con kilos es un error');

  /* Calendario: julio y agosto de 2026 tienen 31 días. */
  afirmar(periodos.diasDelMes(JULIO) === 31, 'julio de 2026 tiene 31 días', String(periodos.diasDelMes(JULIO)));
  afirmar(periodos.diasDelMes('2026-08') === 31, 'agosto de 2026 tiene 31 días');

  /* Y las pantallas del reporte renderizan. */
  const { default: Reporte } = await servidor.ssrLoadModule('/src/app/paneles/Reporte.jsx');
  store.iniciarSesion(usuarios.usuario('area-lavanderia'));
  const htmlLav = render('el reporte de Lavandería', Reporte, {
    reportes: store.leerEstado().reportes,
    usuario: usuarios.usuario('area-lavanderia'),
  });
  afirmar(htmlLav.includes('Lavandería') || htmlLav.length > 400, 'el reporte de Lavandería pinta contenido');

  /* Desde el 27/10/2026 las nueve áreas tienen su oficio levantado:
     Epidemiología, la última, ya no muestra el aviso de «en construcción». */
  const htmlEpi = render('el reporte de Epidemiología', Reporte, {
    reportes: REPORTES_INICIALES,
    usuario: usuarios.usuario('area-epidemiologia'),
  });
  afirmar(!htmlEpi.includes('todavía no está construido') && htmlEpi.includes('Word'), 'Epidemiología tiene su reporte levantado y sube su oficio en Word');

  /* ------------------------------- 13. los datos sembrados de Lavandería */
  titulo('13. Los datos sembrados de Lavandería son internamente coherentes');

  /* Seis de los ocho periodos: marzo nunca se envió y agosto, el vigente, sigue
     sin abrirse. Las dos ausencias son deliberadas y sostienen la demostración
     del semáforo de cumplimiento. */
  const deLavanderia = REPORTES_INICIALES.filter((r) => r.area === 'lavanderia');
  afirmar(deLavanderia.length === 6, 'Lavandería tiene seis periodos con registro', String(deLavanderia.length));

  const diasConDato = (arr) => (arr ?? []).filter((v) => v != null).length;

  for (const r of deLavanderia) {
    const t1 = calc.totalF1(r.datos.f1 ?? {}, r.periodo);
    const t3 = calc.totalesF3(r.datos.f3 ?? {}, r.periodo);
    const v = calc.validar(r.datos, r.periodo);

    afirmar(t1 != null && t1 > 0, `${r.periodo} tiene kilos registrados`, String(t1));
    /* Julio, el mes real, no cuadra entre el Formato 1 y el Formato 3: son
       dos hojas del Excel real que no describen la misma cifra (ver el
       comentario de lavanderia-siembra.js). Los meses simulados sí cuadran,
       porque se construyen a partir del total del Formato 1. */
    if (r.periodo !== JULIO) {
      afirmar(t1 === t3.kgTotal, `${r.periodo} cuadra entre el Formato 1 y el Formato 3 (simulado a partir del real)`, `${t1} != ${t3.kgTotal}`);
    }
    afirmar(v.errores.length === 0, `${r.periodo} se sembró sin errores de validación`, v.errores.map((e) => e.id).join(', '));

    /* Todos los días del mes registrados: son reportes ya enviados. */
    const dias = periodos.diasDe(r.periodo).length;
    afirmar(diasConDato(r.datos.f1['c-externos']) === dias, `${r.periodo} tiene los ${dias} días del Formato 1`);
    afirmar(diasConDato(r.datos.f3.comun) === dias, `${r.periodo} tiene los ${dias} días del Formato 3`);

    /* Y las piezas del consolidado, que se digitan una a una. */
    for (const g of estructura.GRUPOS) {
      afirmar(calc.piezasDelGrupo(r.datos.f4, g.clave) != null, `${r.periodo} tiene las piezas de ${g.clave}`);
    }
  }

  /* Julio es el periodo con cifras del Excel real: sus totales deben ser
     exactamente los leídos por el bot, no una aproximación. */
  const julioSembrado = deLavanderia.find((r) => r.periodo === JULIO);
  afirmar(Boolean(julioSembrado), 'julio de 2026 está sembrado');
  afirmar(calc.totalF1(julioSembrado.datos.f1, JULIO) === 13943, 'julio suma los 13 943 kg del Excel real', String(calc.totalF1(julioSembrado.datos.f1, JULIO)));
  afirmar(calc.totalPiezas(julioSembrado.datos.f4) === 24907, 'julio suma las 24 907 piezas del Excel real', String(calc.totalPiezas(julioSembrado.datos.f4)));
  afirmar(calc.totalesF3(julioSembrado.datos.f3, JULIO).kgComun === 16168, 'julio tiene los 16 168 kg comunes del Excel real');
  afirmar(calc.totalesF3(julioSembrado.datos.f3, JULIO).importeComun === 48504, 'el importe calculado de julio son S/ 48 504');
  afirmar(julioSembrado.datos.f2.length === 16, 'julio trae los dieciséis trabajos de confección del Excel real', String(julioSembrado.datos.f2.length));

  /* Cada total por servicio del Excel real se reconstruye desde el reparto diario. */
  for (const [servicio, esperado] of Object.entries(TOTALES_JULIO)) {
    const suma = calc.totalServicio(julioSembrado.datos.f1, servicio, JULIO);
    afirmar(suma === esperado, `el reparto diario de ${servicio} suma su total real`, `${suma} != ${esperado}`);
  }

  /* La siembra es determinista: dos llamadas dan lo mismo, o la demostración
     cambiaría en cada recarga. */
  const siembra = await servidor.ssrLoadModule('/src/app/datos/formatos/lavanderia-siembra.js');
  afirmar(
    JSON.stringify(siembra.datosDeLavanderia('2026-05')) === JSON.stringify(siembra.datosDeLavanderia('2026-05')),
    'la siembra es determinista',
  );

  /* Y marzo sigue sin sembrar: es la deuda arrastrada del área. */
  afirmar(
    !REPORTES_INICIALES.some((r) => r.id === 'lavanderia:2026-03'),
    'Lavandería sigue sin reporte de marzo',
  );

  /* -------------------------------------------------- 14. el historial */
  titulo('14. El historial del área');

  const { default: Historial } = await servidor.ssrLoadModule('/src/app/paneles/Historial.jsx');

  const htmlHist = render('el historial de Lavandería', Historial, {
    reportes: REPORTES_INICIALES,
    usuario: usuarios.usuario('area-lavanderia'),
    irA: () => { },
  });
  afirmar(htmlHist.includes('Junio 2026'), 'el historial lista junio de 2026');
  afirmar(htmlHist.includes('Marzo 2026'), 'el historial lista marzo, el periodo sin reporte');
  afirmar(htmlHist.includes('No iniciado'), 'el periodo sin reporte aparece como no iniciado');
  afirmar(htmlHist.includes('CR-2026-06-LAV'), 'el historial muestra la constancia de junio');
  const mesesDelHistorial = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  afirmar(mesesDelHistorial.every((m) => htmlHist.includes(`${m} 2026`)), 'el historial muestra el año entero, de enero a diciembre');
  afirmar(htmlHist.includes('Aún no corresponde'), 'los meses que todavía no terminan van vacíos, sin contar como deuda');
  afirmar(htmlHist.indexOf('Enero 2026') < htmlHist.indexOf('Diciembre 2026'), 'el año se lee de enero a diciembre');

  const htmlHistOtra = render('el historial de un área sin cifras', Historial, {
    reportes: REPORTES_INICIALES,
    usuario: usuarios.usuario('area-epidemiologia'),
    irA: () => { },
  });
  afirmar(htmlHistOtra.includes('Sin datos'), 'un área sin oficio levantado muestra «Sin datos», no un cero');

  /* Un periodo cerrado se abre en solo lectura desde el historial. */
  const htmlCerrado = render('el reporte de un periodo cerrado', Reporte, {
    reportes: REPORTES_INICIALES,
    usuario: usuarios.usuario('area-lavanderia'),
    periodo: '2026-06',
  });
  /* Lavandería se llena subiendo su Excel (como Nutrición y Laboratorio): un
     periodo remitido se abre en solo lectura, no con el aviso de «Periodo
     cerrado» del formulario genérico, que ya no usa. */
  afirmar(htmlCerrado.toLowerCase().includes('en solo lectura'), 'un periodo cerrado se abre en solo lectura');
  afirmar(htmlCerrado.includes('Entregado'), 'el periodo cerrado muestra su estado');

  /* ------------------------------------- 15. calendario y tablero de inicio */
  titulo('15. El calendario del registro diario y el tablero de inicio');

  const { CalendarioPeriodo } = await servidor.ssrLoadModule('/src/app/paneles/reporte/Comunes.jsx');
  const htmlCal = render('el calendario de agosto de 2026', CalendarioPeriodo, {
    periodo: '2026-08',
    dia: 1,
    estadoDe: (d) => (d <= 3 ? 'lleno' : d === 4 ? 'parcial' : 'vacio'),
  });
  const casillas = (htmlCal.match(/role="gridcell"/g) ?? []).length;
  afirmar(casillas === 31, 'agosto de 2026 pinta 31 casillas', String(casillas));
  /* El 1 de agosto de 2026 es sábado: con la semana empezando en lunes, antes
     van cinco huecos. Si el desfase se calculara mal, los días caerían bajo el
     día de la semana equivocado. */
  const huecosCal = (htmlCal.match(/hrl-cal__hueco/g) ?? []).length;
  afirmar(huecosCal === 5, 'el sábado 1 de agosto lleva cinco huecos delante', String(huecosCal));
  afirmar(htmlCal.includes('Completo · 3') && htmlCal.includes('Incompleto · 1'), 'la leyenda cuenta los días por estado');
  const tabulables = (htmlCal.match(/tabindex="0"/gi) ?? []).length;
  afirmar(tabulables === 1, 'solo el día elegido es tabulable', String(tabulables));

  const tablero = await servidor.ssrLoadModule('/src/app/datos/formatos/lavanderia-tablero.js');
  const ultimo = tablero.ultimoEnviado(REPORTES_INICIALES);
  afirmar(ultimo?.periodo === '2026-08', 'el último mes enviado de Lavandería es agosto', ultimo?.periodo);
  afirmar(
    tablero.enviadoAnterior(REPORTES_INICIALES, '2026-04')?.periodo === '2026-02',
    'abril se compara con febrero, porque marzo no se envió',
  );

  const serie = tablero.serieMensual(REPORTES_INICIALES, PERIODOS, 'kilos');
  afirmar(serie.find((p) => p.key === '2026-03').value === null, 'marzo va como hueco en la serie, no como cero');
  afirmar(serie.find((p) => p.key === '2026-09').value === null, 'septiembre, sin enviar, no aporta un cero a la serie');
  afirmar(serie.find((p) => p.key === '2026-07').value === 13943, 'julio en la serie son los 13 943 kg del Excel real');

  const grupos = tablero.kilosPorGrupo(ultimo);
  afirmar(
    grupos.length === 10 && grupos.reduce((a, g) => a + g.valor, 0) === calc.totalF1(ultimo.datos.f1, ultimo.periodo),
    'el reparto por servicio suma el total del mes',
  );
  afirmar(grupos.every((g, i) => i === 0 || grupos[i - 1].valor >= g.valor), 'el reparto por servicio va de mayor a menor');

  const { default: InicioLav } = await servidor.ssrLoadModule('/src/app/paneles/inicio/InicioLavanderia.jsx');
  /* El mes vigente, si el área ya lo entregó, es el último enviado: con
     septiembre entregado, ningún tablero puede seguir mostrando agosto. Se
     comprueba en los seis: a cada área se le entrega septiembre copiando su
     último mes enviado. */
  {
    const periodosV = await servidor.ssrLoadModule('/src/app/dominio/periodos.js');
    const estadosV = await servidor.ssrLoadModule('/src/app/dominio/estados.js');
    const vigenteV = periodosV.periodoVigente(periodosV.HOY);
    const tableros = {
      nutricion: 'InicioNutricion', laboratorio: 'InicioLaboratorio', 'centro-quirurgico': 'InicioCentroQuirurgico',
      farmacia: 'InicioFarmacia', imagenes: 'InicioImagenes', lavanderia: 'InicioLavanderia',
    };
    for (const [area, archivo] of Object.entries(tableros)) {
      const propios = REPORTES_INICIALES.filter((r) => r.area === area && r.periodo < vigenteV && estadosV.estaEntregado(r.estado) && r.datos)
        .sort((x, y) => x.periodo.localeCompare(y.periodo));
      const ultimo = propios.at(-1);
      if (!ultimo) {
        /* Sin meses enviados en la demostración (Farmacia): se comprueba la
           regla que elige el último enviado, que es la que usa su tablero. */
        const tablero = await servidor.ssrLoadModule(`/src/app/datos/formatos/${area}-tablero.js`);
        const prueba = [{ area, periodo: periodosV.mesAnterior(vigenteV), estado: 'enviado', datos: {} }, { area, periodo: vigenteV, estado: 'enviado', datos: {} }];
        afirmar(tablero.ultimoEnviado(prueba)?.periodo === vigenteV, `${area}: con ${vigenteV} entregado, el último enviado es ese mes`);
        continue;
      }
      const entregado = { ...ultimo, id: `${area}:${vigenteV}`, periodo: vigenteV, resumen: undefined };
      const reportesV = [...REPORTES_INICIALES.filter((r) => !(r.area === area && r.periodo === vigenteV)), entregado];
      const { default: Tablero } = await servidor.ssrLoadModule(`/src/app/paneles/inicio/${archivo}.jsx`);
      const h = render(`el tablero de ${area} con ${vigenteV} entregado`, Tablero, { reportes: reportesV, irA: () => { } }).replace(/<!-- -->/g, '');
      afirmar(h.includes(`Último mes enviado: ${periodosV.etiquetaPeriodo(vigenteV)}`), `${area}: con ${periodosV.etiquetaPeriodo(vigenteV)} entregado, el tablero muestra ese mes y no el anterior`);
    }

    /* Las nueve áreas tienen tablero (07/11/2026: Nefrología, Epidemiología y Gineco-Obstetricia
       tenían su Inicio vacío aunque tuvieran meses entregados). Las tres de un solo cuadro usan
       el común; con un mes entregado, su Inicio dibuja sus cifras y su mes a mes. */
    const { AREAS_CON_TABLERO_POR_CIFRAS } = await servidor.ssrLoadModule('/src/app/paneles/inicio/InicioPorCifras.jsx');
    const { AREAS: AREAS_V } = await servidor.ssrLoadModule('/src/app/datos/areas.js');
    const { default: InicioDelArea } = await servidor.ssrLoadModule('/src/app/paneles/Inicio.jsx');
    const conTablero = new Set([...Object.keys(tableros), ...AREAS_CON_TABLERO_POR_CIFRAS]);
    const sinTablero = AREAS_V.map((a) => a.clave ?? a.id).filter((clave) => !conTablero.has(clave));
    afirmar(!sinTablero.length, 'las nueve áreas tienen tablero en su Inicio', sinTablero.join(', '));
    for (const area of AREAS_CON_TABLERO_POR_CIFRAS) {
      const ultimo = REPORTES_INICIALES.filter((r) => r.area === area && estadosV.estaEntregado(r.estado) && r.datos && !r.resumen).sort((x, y) => x.periodo.localeCompare(y.periodo)).at(-1);
      afirmar(Boolean(ultimo), `${area}: la demostración trae al menos un mes entregado para su tablero`);
      if (!ultimo) continue;
      const h = render(`el Inicio de ${area}`, InicioDelArea, { reportes: REPORTES_INICIALES, usuario: { area }, irA: () => { } }).replace(/<!-- -->/g, '');
      afirmar(h.includes(`Último mes enviado: ${periodosV.etiquetaPeriodo(ultimo.periodo)}`) && h.includes('<svg'), `${area}: su Inicio muestra el último mes enviado y sus gráficas`);
      /* Un mes que todavía viene del servidor (`resumen`) no se dibuja como un cero. */
      const comoResumen = REPORTES_INICIALES.map((r) => (r === ultimo ? { ...r, datos: {}, resumen: true } : r));
      const hr = render(`el Inicio de ${area} con su último mes en camino`, InicioDelArea, { reportes: comoResumen, usuario: { area }, irA: () => { } }).replace(/<!-- -->/g, '');
      afirmar(!hr.includes(`Último mes enviado: ${periodosV.etiquetaPeriodo(ultimo.periodo)}`), `${area}: un mes cuyo detalle no llegó no se toma como el último enviado`);
    }
  }

  /* Los indicadores de cada área, en su cuenta (07/11/2026): uno por tema, los de GERESA, y
     calculados solo con sus reportes; nada del cuadro de GERESA, del DL 1153 ni de Estadística. */
  {
    const { INDICADORES_DEL_AREA } = await servidor.ssrLoadModule('/src/app/datos/monitoreo-lecturas.js');
    const delArea = await servidor.ssrLoadModule('/src/app/paneles/inicio/IndicadoresDelArea.jsx');
    const { calcularIndicadores } = await servidor.ssrLoadModule('/src/app/datos/diresa/indicadores.js');
    const { default: InicioConIndicadores } = await servidor.ssrLoadModule('/src/app/paneles/Inicio.jsx');
    afirmar(JSON.stringify(INDICADORES_DEL_AREA) === JSON.stringify({ 'centro-quirurgico': [12, 13, 14, 22], ginecologia: [18] }), 'cada área ve sus indicadores de GERESA, uno por tema: Centro Quirúrgico 12, 13, 14 y 22; Gineco-Obstetricia 18');
    /* Con solo sus reportes da lo mismo que con todos los del hospital y sin datos de Estadística:
       el cálculo no toma nada de otra fuente. */
    const lista = delArea.indicadoresDelArea('centro-quirurgico', REPORTES_INICIALES, '2026-09');
    const agosto = calcularIndicadores('2026-08', REPORTES_INICIALES.filter((r) => r.area === 'centro-quirurgico'), {});
    afirmar(lista.length === 4 && lista.every(({ indicador, lectura }) => {
      const p = lectura.puntos.find((x) => x.periodo === '2026-08');
      const c = agosto.find((x) => x.n === indicador.n);
      return !p.deCuadro && p.valor === c.valor && p.num === c.numerador && p.den === c.denominador;
    }), 'cada mes de sus indicadores es el que se calcula con su reporte, sin cuadro ni datos de Estadística');
    const pintarInicio = (area, params = {}) => render(`el Inicio de ${area}${params.indicador ? ' con un detalle' : ''}`, InicioConIndicadores, { reportes: REPORTES_INICIALES, usuario: { area }, params, irA: () => { } }).replace(/<!-- -->/g, '');
    const cqx = pintarInicio('centro-quirurgico');
    afirmar(cqx.includes('Sus indicadores') && ['12. ', '13. ', '14. ', '22. '].every((t) => cqx.includes(`>${t}`)), 'Centro Quirúrgico ve sus cuatro indicadores en su Inicio');
    afirmar(!cqx.includes('Ficha 21:') && !cqx.includes('Ficha 22:') && !cqx.includes('Relacionado con la ficha'), 'sin las fichas del DL 1153: el mismo tema no se mide dos veces');
    afirmar(!cqx.includes('Ver análisis'), 'la tarjeta del área no lleva «Ver análisis»: solo la flecha del detalle');
    const gin = pintarInicio('ginecologia');
    afirmar(gin.includes('Sus indicadores') && gin.includes('>18. ') && !gin.includes('>12. '), 'Gineco-Obstetricia ve su tasa de cesárea');
    afirmar(!pintarInicio('nefrologia').includes('Sus indicadores'), 'un área sin indicadores directos no ve la sección');
    const det12 = pintarInicio('centro-quirurgico', { indicador: '12' });
    afirmar(det12.includes('Volver a Inicio') && det12.includes('Mes a mes') && !det12.includes('Sus indicadores'), 'el detalle de un indicador se abre en el Inicio del área y vuelve a él');
    afirmar(!det12.includes('Cuadro de GERESA') && !det12.includes('Calculado por el sistema') && !det12.includes('ficha 21'), 'el detalle del área no mezcla el cuadro de GERESA ni la ficha del DL 1153');
    afirmar(pintarInicio('centro-quirurgico', { indicador: '5' }).includes('Sus indicadores'), 'un indicador que no es del área no abre su detalle');
  }
  const htmlInicio = render('el tablero de inicio de Lavandería', InicioLav, { reportes: REPORTES_INICIALES, irA: () => { } });
  afirmar(htmlInicio.includes('Último mes enviado: Agosto 2026'), 'el tablero rotula el último mes enviado');
  afirmar(htmlInicio.includes('Marzo 2026 sigue sin reporte'), 'el tablero avisa del mes sin reporte');
  afirmar(htmlInicio.includes('Sin reporte'), 'la serie rotula el hueco de marzo');
  afirmar(htmlInicio.includes('En curso'), 'la serie recorta septiembre en un bloque rotulado');
  afirmar(htmlInicio.includes('frente a julio'), 'los indicadores dicen contra qué mes se comparan');

  const { default: InicioPanel } = await servidor.ssrLoadModule('/src/app/paneles/Inicio.jsx');
  /* El estado del reporte del mes ya no es una tarjeta del Inicio: lo dice Dr.
     Mochi bajo la cabecera (AvisoMochi), con la acción que toca. */
  const { default: AvisoMochi } = await servidor.ssrLoadModule('/src/app/AvisoMochi.jsx');
  const cabeceraInicio = await servidor.ssrLoadModule('/src/app/cabecera.js');
  const periodosInicio = await servidor.ssrLoadModule('/src/app/dominio/periodos.js');
  const avisoDe = (idUsuario, panelId, reportesAviso = REPORTES_INICIALES) => {
    const sesion = { usuario: usuarios.usuario(idUsuario), rolActivo: 'area' };
    const ctx = { reportes: reportesAviso, hoy: periodosInicio.HOY, plazosReales: {} };
    return render(`el aviso de ${idUsuario} en ${panelId}`, AvisoMochi, {
      banda: cabeceraInicio.bandaDe(sesion, panelId, ctx), panelId, sesion, reportes: reportesAviso, hoy: periodosInicio.HOY, irA: () => { },
    });
  };
  const avisoEpi = avisoDe('area-epidemiologia', 'inicio');
  afirmar(avisoEpi.includes('hrl-mochi-aviso') && avisoEpi.includes('hrl-mascota'), 'en su Inicio, un área ve el aviso de su reporte con Dr. Mochi');
  afirmar(!renderToStaticMarkup(createElement(InicioPanel, { reportes: REPORTES_INICIALES, usuario: usuarios.usuario('area-epidemiologia'), irA: () => { } })).includes('Reporte de'), 'el Inicio no repite el aviso en una tarjeta');
  {
    const sesion = { usuario: usuarios.usuario('area-nutricion'), rolActivo: 'area' };
    const banda = cabeceraInicio.bandaDe(sesion, 'reporte', { reportes: REPORTES_INICIALES, hoy: periodosInicio.HOY, plazosReales: {} });
    afirmar(!renderToStaticMarkup(createElement(AvisoMochi, { banda, panelId: 'reporte', sesion, reportes: REPORTES_INICIALES, hoy: periodosInicio.HOY, irA: () => { } })), 'en «Reporte del mes» no hay aviso: ahí se hace lo que pide');
  }

  /* El tablero de Nutrición: meses enviados por servicio, y septiembre en curso. */
  const htmlInicioNut = render('el inicio de Nutrición', InicioPanel, {
    reportes: REPORTES_INICIALES,
    usuario: usuarios.usuario('area-nutricion'),
    irA: () => { },
  }).replace(/<!-- -->/g, '');
  afirmar(htmlInicioNut.includes('Raciones a pacientes por mes') && htmlInicioNut.includes('Raciones a comensales por mes'), 'Nutrición ve sus raciones por mes, de pacientes y de comensales');
  afirmar(htmlInicioNut.includes('Último mes enviado: Agosto 2026'), 'el tablero de Nutrición rotula el último mes enviado');
  afirmar(htmlInicioNut.includes('Set · en curso'), 'septiembre se rotula en curso, no como cero');
  afirmar(!htmlInicioNut.includes('Subir el Excel del mes'), 'el tablero de Nutrición ya no repite la tarjeta del mes');
  afirmar(avisoDe('area-nutricion', 'inicio').includes('Subir el Excel'), 'con el mes sin cargar, Dr. Mochi lleva a subir el Excel');

  /* El encabezado de un área: su nombre completo y la fecha completa. */
  const { fechaLarga } = await servidor.ssrLoadModule('/src/app/dominio/formato.js');
  afirmar(fechaLarga('2026-09-13') === 'Domingo, 13 de septiembre de 2026', 'la fecha completa lleva el día de la semana', fechaLarga('2026-09-13'));

  /* Lo que el área pidió quitar no debe volver: el consumidor por confirmar y
     la descripción larga del estado. Se comprueba sobre un reporte en llenado,
     que es donde aparecían. */
  store.aplicarTransicion('lavanderia', '2026-09', 'crear', { actor: 'Prueba de humo', rol: 'area' });
  const htmlLlenado = render('el reporte de Lavandería en llenado', Reporte, {
    reportes: store.leerEstado().reportes,
    usuario: usuarios.usuario('area-lavanderia'),
  });
  /* Lavandería ya no se digita en un calendario: se llena subiendo el Excel,
     como Nutrición y Laboratorio. */
  afirmar(htmlLlenado.includes('hrl-carga__zona'), 'un reporte sin cargar muestra la zona para subir el Excel');
  afirmar(!htmlLlenado.includes('Consumidor por confirmar'), 'el reporte ya no muestra «Consumidor por confirmar»');
  afirmar(!htmlLlenado.includes('Nadie más lo ve'), 'el reporte ya no muestra la descripción larga del estado');
  afirmar(!htmlCerrado.includes('Consumidor por confirmar'), 'un periodo cerrado tampoco lo muestra');

  /* --------------------------------------------- 16. los formatos DIRESA */
  titulo('16. Los dos formatos que Estadística remite a DIRESA');
  store.reiniciarDatos();

  const si = await servidor.ssrLoadModule('/src/app/datos/diresa/servicios-intermedios.js');
  const indicadoresMod = await servidor.ssrLoadModule('/src/app/datos/diresa/indicadores.js');
  const propiosMod = await servidor.ssrLoadModule('/src/app/datos/estadistica-propios.js');
  const simuladas = await servidor.ssrLoadModule('/src/app/datos/formatos/areas-simuladas.js');
  const PROPIOS = propiosMod.PROPIOS_INICIALES;

  afirmar(si.CAMPOS_SI.length === 196, 'el consolidado tiene 196 columnas', String(si.CAMPOS_SI.length));
  afirmar(si.CAMPOS_SI.at(-1).col === 'GN', 'la última columna es GN', si.CAMPOS_SI.at(-1).col);

  /* Cada bloque en su letra, tal como el Excel oficial. Un corrimiento de una
     columna mandaría un dato a la celda de otro sin que nadie lo note. */
  const COLUMNAS = {
    K: 'lab.bioquimicos.hosp.totalDelGrupo', Y: 'lab.parasitologicos.ce.totalDelGrupo', Z: 'lab.bioquimicos.hosp.colesterol',
    AH: 'lab.bioquimicos.hosp.total', AZ: 'lab.bioquimicos.ce.total', BA: 'lab.hematologicos.hosp.hemoglobina',
    BV: 'lab.bacteriologicos.hosp.urocultivo', CN: 'lab.inmunoserologicos.hosp.aglutinaciones',
    DO: 'lab.parasitologicos.hosp.heces', DZ: 'lab.parasitologicos.ce.total', EA: 'ap.general.pap',
    EE: 'ap.general.orina', EF: 'ap.hosp.pap', ET: 'ap.ce.orina', EU: 'img.general.fotoradiograficos',
    FA: 'img.hosp.fotoradiograficos', FR: 'img.ce.otros', FS: 'nut.hosp.pacientes', FU: 'nut.hosp.total',
    GA: 'nut.ce.total', GB: 'lav.hosp', GE: 'lav.total', GF: 'otros.general.recetas',
    GG: 'otros.general.traslados', GH: 'otros.hosp.recetas', GM: 'otros.ce.traslados', GN: 'camas',
  };
  for (const [letra, clave] of Object.entries(COLUMNAS)) {
    const campo = si.CAMPOS_SI.find((c) => c.col === letra);
    afirmar(campo?.clave === clave, `la columna ${letra} es ${clave}`, campo?.clave);
  }

  /* Los conteos del documento: 146 manuales y 50 calculados en el Excel. */
  const manualesExcel = si.CAMPOS_SI.filter((c) => c.tipo === 'manual' || (c.tipo === 'auto' && c.tipoExcel === 'manual')).length;
  const calculadosExcel = si.CAMPOS_SI.filter((c) => c.tipo === 'calculado' || (c.tipo === 'auto' && c.tipoExcel === 'calculado')).length;
  afirmar(manualesExcel === 146, 'son 146 campos manuales como en el Excel', String(manualesExcel));
  afirmar(calculadosExcel === 50, 'son 50 campos calculados como en el Excel', String(calculadosExcel));

  const campoDe = (resultado, letra) => resultado.campos.find((c) => c.col === letra);
  const julioSI = si.construirServiciosIntermedios('2026-07', REPORTES_INICIALES, PROPIOS);
  /* Farmacia empieza sin historial: julio la echa en falta, y la celda de
     recetas queda vacía, no en cero. */
  afirmar(julioSI.faltantes.map((f) => f.area).join() === 'farmacia', 'julio tiene validadas todas sus fuentes salvo Farmacia, que no ha subido julio', julioSI.faltantes.map((f) => f.area).join(', '));
  /* Completo salvo lo que ningún oficio reporta: fotoradiografías y placas
     dentales de Imágenes, y el consultorio externo de Nutrición, que su oficio
     no trae. Van vacías y no en cero. La sección A sale del reporte de
     Laboratorio (laboratorio-calculos.js, DIRESA_LABORATORIO). */
  /* Fotoradiografías, placas dentales y raciones de consulta externa van en 0: el hospital no
     tiene esos servicios (Estadística, 07/11/2026). Solo quedan vacías las recetas de Farmacia. */
  const NO_REPORTADOS = /^otros\.(hosp|emerg|ce)\.recetas$/;
  const SIN_SERVICIO = /^(img\.(hosp|emerg|ce)\.(fotoradiograficos|dentales)|nut\.ce\.(pacientes|personal))$/;
  const vaciosDe = (resultado) => resultado.campos.filter((c) => c.tipo === 'manual' && c.valor == null);
  const manualesLab = si.CAMPOS_SI.filter((c) => c.tipo === 'manual' && c.origen?.area === 'laboratorio');
  afirmar(
    vaciosDe(julioSI).length === 3 && vaciosDe(julioSI).every((c) => NO_REPORTADOS.test(c.clave)) && julioSI.campos.filter((c) => SIN_SERVICIO.test(c.clave)).every((c) => c.valor === 0),
    'julio tiene el consolidado completo, con los servicios que el hospital no tiene en 0, salvo las tres de recetas de Farmacia',
    vaciosDe(julioSI).map((c) => c.clave).join(', '),
  );
  afirmar(
    manualesLab.length === 105 && manualesLab.every((c) => /Reporte de Laboratorio: /.test(c.origen.detalle ?? '')),
    'las 105 casillas manuales de la sección A (las del formato DIRESA) salen de Laboratorio y dicen de qué exámenes',
    String(manualesLab.length),
    vaciosDe(julioSI).map((c) => c.clave).join(', '),
  );
  afirmar(campoDe(julioSI, 'K').valor === campoDe(julioSI, 'AH').valor, 'la columna K repite el total de AH');
  afirmar(campoDe(julioSI, 'GE').valor === campoDe(julioSI, 'GB').valor + campoDe(julioSI, 'GC').valor + campoDe(julioSI, 'GD').valor, 'GE suma GB, GC y GD');

  const lavJulio = REPORTES_INICIALES.find((r) => r.id === 'lavanderia:2026-07');
  afirmar(
    campoDe(julioSI, 'GE').valor === calc.totalF1(lavJulio.datos.f1, '2026-07'),
    'los kilos del consolidado son el Formato 1 de Lavandería',
  );

  /* Junio ya no es el mes con cifras reales (julio lo es, arriba): es un mes
     simulado como cualquier otro, y su consolidado solo tiene que cuadrar con
     su propio Formato 1, no con una cifra fija. */
  const junioSI = si.construirServiciosIntermedios('2026-06', REPORTES_INICIALES, PROPIOS);
  const lavJunio = REPORTES_INICIALES.find((r) => r.id === 'lavanderia:2026-06');
  afirmar(
    campoDe(junioSI, 'GE').valor === calc.totalF1(lavJunio.datos.f1, '2026-06'),
    'el consolidado de junio (simulado) lleva los kilos del Formato 1 de ese mes',
    String(campoDe(junioSI, 'GE').valor),
  );
  const septiembreSINut = si.construirServiciosIntermedios('2026-09', REPORTES_INICIALES, PROPIOS);
  afirmar(campoDe(septiembreSINut, 'FS').valor === null, 'con Nutrición sin entregar, sus raciones van vacías y no en cero');
  const marzoSI = si.construirServiciosIntermedios('2026-03', REPORTES_INICIALES, PROPIOS);
  afirmar(campoDe(marzoSI, 'GE').valor === null, 'marzo, sin reporte de Lavandería, deja los kilos vacíos');
  afirmar(campoDe(julioSI, 'J').valor === 'JULIO' && campoDe(julioSI, 'C').valor === '00000003', 'la identificación se autocompleta');
  /* El ítem «Grupo sanguíneo» no es el total de hematológicos (07/11/2026: compartían clave). */
  afirmar(new Set(si.CAMPOS_SI.map((c) => c.clave)).size === si.CAMPOS_SI.length, 'servicios intermedios: ninguna clave se repite');

  /* El Excel oficial de DIRESA, con la fila del hospital llena (servicios/remision-diresa.js). */
  {
    const remision = await servidor.ssrLoadModule('/src/app/servicios/remision-diresa.js');
    const { leerLibro } = await servidor.ssrLoadModule('@bot/xlsx.js');
    const plantilla = new Uint8Array(readFileSync(join(RAIZ, 'public', remision.RUTA_PLANTILLA_SERVICIOS_INTERMEDIOS)));
    const original = await leerLibro(plantilla);
    afirmar(original.hojas.length === 13, 'la plantilla de DIRESA trae sus doce meses y la hoja anual', original.hojas.join(','));
    const junioFila = await remision.ubicarHospital(plantilla, '2026-06');
    afirmar(junioFila.hoja === 'JUNIO' && junioFila.fila !== 148, `en JUNIO el hospital no está en la fila 148 sino en la ${junioFila.fila}: se busca por RENIPRESS`);
    const lleno = await remision.llenarServiciosIntermedios(plantilla, julioSI);
    const libro = await leerLibro(lleno.bytes);
    const [antes, despues] = [await original.cuadricula(lleno.hoja), await libro.cuadricula(lleno.hoja)];
    const col = (letra) => [...letra].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    afirmar(si.CAMPOS_SI.filter((c) => c.tipo === 'manual').every((c) => despues.valor(lleno.fila, col(c.col)) === (campoDe(julioSI, c.col).valor ?? null)), 'cada celda manual de la fila lleva la cifra del sistema, y una sin dato queda vacía');
    afirmar(si.CAMPOS_SI.filter((c) => c.tipo === 'calculado').every((c) => despues.esFormula(lleno.fila, col(c.col))), 'las celdas calculadas conservan su fórmula');
    let fuera = 0;
    for (let r = 1; r <= antes.ultimaFila; r += 1) {
      if (r === lleno.fila) continue;
      for (let k = 1; k <= antes.ultimaColumna; k += 1) if (antes.valor(r, k) !== despues.valor(r, k)) fuera += 1;
    }
    afirmar(fuera === 0, 'fuera de la fila del hospital no cambia ninguna celda', String(fuera));
    afirmar([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((k) => antes.valor(lleno.fila, k) === despues.valor(lleno.fila, k)), 'la identificación de la fila (A a J) queda como viene en la plantilla');
  }

  /* Las plantillas llegan al contenedor (16/11/2026): `.dockerignore` excluía todo
     .xlsx, y en el servidor nginx devolvía index.html en su lugar. */
  {
    const dockerignore = readFileSync(join(RAIZ, '..', '.dockerignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
    const excluye = dockerignore.lastIndexOf('**/*.xlsx');
    const incluye = dockerignore.lastIndexOf('!frontend/public/plantillas/*.xlsx');
    afirmar(incluye > excluye, 'las plantillas de DIRESA entran a la imagen del frontend (.dockerignore)');
    afirmar(/location \/plantillas\/ \{[^}]*try_files \$uri =404;/.test(readFileSync(join(RAIZ, 'nginx.conf'), 'utf8')), 'nginx responde 404, no index.html, por una plantilla que falta');
  }

  /* El boletín en PDF, armado a mano (servicios/boletin-pdf.js): cada objeto donde
     dice la tabla xref y cada stream con el largo que declara. */
  {
    const { armarPdf } = await servidor.ssrLoadModule('/src/app/servicios/boletin-pdf.js');
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = armarPdf([{ jpeg, ancho: 2, alto: 3, proporcion: 1.5 }, { jpeg, ancho: 2, alto: 2, proporcion: 297 / 210 }], { titulo: 'Boletín (prueba)' });
    const s = Buffer.from(bytes).toString('latin1');
    const inicio = Number(s.match(/startxref\n(\d+)/)?.[1]);
    const xref = s.slice(inicio).split('\n');
    const total = Number(xref[1]?.split(' ')[1]);
    let desfases = 0;
    for (let n = 1; n < total; n += 1) if (!s.startsWith(`${n} 0 obj`, Number(xref[2 + n].slice(0, 10)))) desfases += 1;
    let largos = 0;
    for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) if (s.slice(m.index + m[0].length + Number(m[1]), m.index + m[0].length + Number(m[1]) + 10) !== '\nendstream') largos += 1;
    afirmar(s.startsWith('%PDF-1.4') && xref[0] === 'xref' && total === 10 && desfases === 0 && largos === 0, 'boletín en PDF: la tabla xref y los largos de cada stream cuadran', `${total} · ${desfases} · ${largos}`);
    afirmar(s.includes('/Count 2') && s.includes('/Title (Boletin \\(prueba\\))'), 'boletín en PDF: una página por hoja y el título sin tildes ni paréntesis sueltos');
    afirmar(s.includes('/MediaBox [0 0 595.28 892.92]') && s.includes('/MediaBox [0 0 595.28 841.89]'), 'boletín en PDF: A4, o más larga si la hoja se pasó de 297 mm');
  }

  /* El consolidado anual de indicadores en su Excel oficial (07/11/2026). */
  {
    const remision = await servidor.ssrLoadModule('/src/app/servicios/remision-diresa.js');
    const { leerLibro } = await servidor.ssrLoadModule('@bot/xlsx.js');
    const plantilla = new Uint8Array(readFileSync(join(RAIZ, 'public', remision.RUTA_PLANTILLA_INDICADORES)));
    const { hoja, filas } = await remision.ubicarIndicadores(plantilla, '2026');
    afirmar(hoja === '2026' && filas[1] === 11 && filas[5] === 22 && filas[16] === 47 && filas[22] === 59, 'indicadores: la hoja del año y la fila de cada uno se hallan por su n.º', JSON.stringify(filas));
    let sinHoja = null;
    try { await remision.ubicarIndicadores(plantilla, '2031'); } catch (e) { sinHoja = e.message; }
    afirmar(sinHoja?.includes('2031'), 'indicadores: un año sin hoja no se llena a medias, se dice', String(sinHoja));
    const porMes = remision.indicadoresDelAnio('2026', REPORTES_INICIALES, PROPIOS);
    porMes['2026-01'] = [];
    const lleno = await remision.llenarIndicadoresGestion(plantilla, '2026', porMes);
    const original = await leerLibro(plantilla);
    const [antes, despues] = [await original.cuadricula(hoja), await (await leerLibro(lleno.bytes)).cuadricula(hoja)];
    const col = (letra) => [...letra].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const julio = col(remision.columnaDelMes(7));
    afirmar(remision.columnaDelMes(1) === 'E' && remision.columnaDelMes(7) === 'Q' && remision.columnaDelMes(12) === 'AA', 'indicadores: la cifra de cada mes va en E, G… AA');
    afirmar(porMes['2026-07'].every((i) => despues.valor(filas[i.n], julio) === (i.numerador ?? null) && despues.valor(filas[i.n] + 1, julio) === (i.denominador ?? null)), 'indicadores: julio lleva el numerador y el denominador del sistema, y vacío lo que no sabe');
    afirmar(antes.valor(11, col('E')) != null && despues.valor(11, col('E')) == null, 'indicadores: un mes sin cifras del sistema queda vacío aunque la plantilla trajera una tecleada');
    afirmar(despues.esFormula(11, col('F')) && despues.esFormula(11, col('AC')) && despues.esFormula(59, col('F')), 'indicadores: los valores y el total siguen siendo fórmulas de la plantilla');
    const escritas = new Set(Array.from({ length: 12 }, (_, m) => col(remision.columnaDelMes(m + 1))).flatMap((k) => Object.values(filas).flatMap((f) => [`${f}|${k}`, `${f + 1}|${k}`])));
    let fuera = 0;
    for (let r = 1; r <= antes.ultimaFila; r += 1) for (let k = 1; k <= antes.ultimaColumna; k += 1) if (!escritas.has(`${r}|${k}`) && JSON.stringify(antes.valor(r, k)) !== JSON.stringify(despues.valor(r, k))) fuera += 1;
    afirmar(fuera === 0 && lleno.celdas === 22 * 2 * 12, 'indicadores: fuera de numeradores y denominadores no cambia ninguna celda', `${fuera} · ${lleno.celdas}`);
    afirmar(!lleno.meses.includes(1) && lleno.meses.includes(7), 'indicadores: se informa qué meses llevan cifras', lleno.meses.join(','));
  }

  const julioInd = indicadoresMod.calcularIndicadores('2026-07', REPORTES_INICIALES, PROPIOS);
  afirmar(julioInd.length === 22, 'son 22 indicadores', String(julioInd.length));
  /* 19, 20 y 21 necesitan la muerte neonatal por cuándo ocurrió (precoz o
     tardía), que el Excel real de Gineco-Obstetricia no desglosa: quedan en
     «Sin datos» en cualquier mes, no solo en julio (datos/diresa/indicadores.js). */
  const SIN_DESGLOSE_NEONATAL = new Set([19, 20, 21]);
  afirmar(
    julioInd.filter((i) => !SIN_DESGLOSE_NEONATAL.has(i.n)).every((i) => i.valor != null) && julioInd.filter((i) => SIN_DESGLOSE_NEONATAL.has(i.n)).every((i) => i.valor == null),
    'julio tiene 19 de los 22 indicadores con valor (también el de análisis de laboratorio); la mortalidad neonatal por días queda sin datos',
    julioInd.filter((i) => i.valor == null).map((i) => i.n).join(', '),
  );
  afirmar(
    julioInd.find((i) => i.n === 9).denominador === campoDe(julioSI, 'GN').valor,
    'rendimiento cama y el consolidado usan la misma cifra de camas',
  );
  const i22 = julioInd.find((i) => i.n === 22);
  afirmar(Math.abs(i22.valor - (i22.numerador / i22.denominador) * 100) < 1e-9, 'el indicador 22 aplica el ×100');
  afirmar(julioInd.find((i) => i.n === 4).valor > 1, 'utilización de consultorios sale mayor que 1, como en el cuadro real');

  const conCero = { ...PROPIOS, '2026-07': { ...PROPIOS['2026-07'], horasProgramadas: 0 } };
  afirmar(
    indicadoresMod.calcularIndicadores('2026-07', REPORTES_INICIALES, conCero).find((i) => i.n === 1).valor === null,
    'un denominador cero da «Sin datos» y no cero',
  );

  const sinGineco = REPORTES_INICIALES.filter((r) => r.id !== 'ginecologia:2026-09');
  const septiembreInd = indicadoresMod.calcularIndicadores('2026-09', sinGineco, PROPIOS);
  afirmar(septiembreInd.find((i) => i.n === 18).valor === null, 'sin el reporte de Gineco-Obstetricia, la tasa de cesárea queda sin datos');

  /* El acumulado suma numeradores y denominadores; no promedia. */
  const acum = indicadoresMod.acumularIndicadores(['2026-06', '2026-07'], REPORTES_INICIALES, PROPIOS);
  const junioInd = indicadoresMod.calcularIndicadores('2026-06', REPORTES_INICIALES, PROPIOS);
  const ocup = (lista) => lista.find((i) => i.n === 8);
  const esperado = ((ocup(junioInd).numerador + ocup(julioInd).numerador) / (ocup(junioInd).denominador + ocup(julioInd).denominador)) * 100;
  afirmar(Math.abs(acum.find((a) => a.n === 8).valor - esperado) < 1e-9, 'el acumulado recalcula con las sumas');

  /* El indicador 16 sale de la tabla real de Epidemiología: los casos nuevos de
     infección, sin las muertes neonatales y maternas de la misma tabla. */
  const epiMod = await servidor.ssrLoadModule('/src/app/datos/formatos/epidemiologia-calculos.js');
  const epiJulio = REPORTES_INICIALES.find((r) => r.id === 'epidemiologia:2026-07');
  afirmar(
    epiJulio && julioInd.find((i) => i.n === 16).numerador === epiMod.cifrasEpidemiologia(epiJulio.datos).infecciones,
    'el indicador 16 cuenta las infecciones de la tabla de Epidemiología',
    String(julioInd.find((i) => i.n === 16).numerador),
  );
  afirmar(indicadoresMod.indicadoresQueUsan('epidemiologia').join() === '16', 'Epidemiología alimenta el indicador 16');
  afirmar(indicadoresMod.indicadoresQueUsan('ginecologia').join() === '18,19,20,21', 'Gineco-Obstetricia alimenta los indicadores 18 a 21');
  afirmar(indicadoresMod.indicadoresQueUsan('centro-quirurgico').join() === '12,13,14,22', 'Centro Quirúrgico alimenta los indicadores 12, 13, 14 y 22');

  /* Los datos simulados cumplen las reglas que el sistema valida. */
  for (const r of REPORTES_INICIALES.filter((x) => x.area !== 'lavanderia' && est.estaEntregado(x.estado))) {
    const incumplidas = simuladas.evaluarReglas(r.area, r.datos).filter((x) => x.cumple === false);
    afirmar(incumplidas.length === 0, `${r.id} cumple sus reglas`, incumplidas.map((x) => x.id).join(', '));
  }

  const csvMod = await servidor.ssrLoadModule('/src/app/dominio/csv.js');
  afirmar(csvMod.aCsv([['a', null, 'x;y']]) === '\uFEFFa;;"x;y"', 'el CSV deja vacío lo que no tiene dato y protege el separador');

  /* ------------------------------------------ 17. el flujo de Estadística */
  titulo('17. El flujo completo de Estadística, de la bandeja a DIRESA');

  const { default: Cumplimiento } = await servidor.ssrLoadModule('/src/app/paneles/estadistica/Cumplimiento.jsx');
  const { default: Bandeja } = await servidor.ssrLoadModule('/src/app/paneles/estadistica/Bandeja.jsx');
  const { default: RemisionDiresa } = await servidor.ssrLoadModule('/src/app/paneles/estadistica/RemisionDiresa.jsx');
  /* Cada pestaña de la remisión se monta por su cuenta: «Datos de Estadística»
     usaba Mosaic sin importarlo y, al abrirla, la aplicación entera se caía. */
  {
    const { default: DatosPropios } = await servidor.ssrLoadModule('/src/app/paneles/estadistica/DatosPropios.jsx');
    const { default: FormatoIndicadoresPestana } = await servidor.ssrLoadModule('/src/app/paneles/estadistica/FormatoIndicadores.jsx');
    afirmar(render('la pestaña «Datos de Estadística»', DatosPropios, { periodo: '2026-06', propios: {}, editable: true }).includes('Consulta externa'), 'la pestaña «Datos de Estadística» se monta');
    const indicadoresDiresa = await servidor.ssrLoadModule('/src/app/datos/diresa/indicadores.js');
    const lista = indicadoresDiresa.calcularIndicadores('2026-06', [], {});
    const acumulado = indicadoresDiresa.acumularIndicadores(['2026-06'], [], {});
    afirmar(render('la pestaña «Indicadores de gestión»', FormatoIndicadoresPestana, { lista, acumulado, periodo: '2026-06', periodosAcumulados: ['2026-06'] }).length > 0, 'la pestaña «Indicadores de gestión» se monta');
  }
  const { default: Boletin } = await servidor.ssrLoadModule('/src/app/paneles/estadistica/Boletin.jsx');
  const estadistica = usuarios.usuario('est-1');
  const ESTADO0 = store.leerEstado();
  const nada = () => { };

  const htmlCump = render('el cumplimiento', Cumplimiento, { reportes: ESTADO0.reportes, irA: nada });
  afirmar(htmlCump.includes('Esperan al área') && !htmlCump.includes('Esperan a Estadística'), 'el cumplimiento ya no espera nada de Estadística');

  const htmlBandeja = render('la bandeja de septiembre', Bandeja, { reportes: ESTADO0.reportes, params: { periodo: '2026-09' } });
  /* Sin periodo pedido, abre en el mes en curso: nada espera revisión. */
  const htmlBandejaSola = render('la bandeja sin periodo pedido', Bandeja, { reportes: ESTADO0.reportes, params: {} });
  afirmar(htmlBandejaSola.includes(`Bandeja de ${periodos.etiquetaPeriodo(periodos.PERIODO_VIGENTE)}`), 'sin periodo pedido, la bandeja abre en el mes en curso');
  /* Cuatro: Nutrición y Lavandería sin abrir, y Centro Quirúrgico y Farmacia en llenado. */
  /* El botón de simular va a la cabecera por un portal (PageActions), que el
     render de servidor no dibuja: se comprueba la cuenta que lo alimenta. */
  afirmar(/Faltan[\s\S]*?hrl-stat__value">4</.test(htmlBandeja), 'la bandeja cuenta las cuatro áreas que faltan');
  afirmar(!htmlBandeja.includes('Por revisar'), 'la bandeja ya no cuenta reportes por revisar');

  const htmlVisorLav = render('el visor de Lavandería de julio', Bandeja, { reportes: ESTADO0.reportes, params: { area: 'lavanderia', periodo: '2026-07' } });
  afirmar(htmlVisorLav.includes('Formatos enviados') && htmlVisorLav.includes('Validaciones'), 'el visor muestra los formatos de Lavandería y sus validaciones');

  const htmlVisorLab = render('el visor de Laboratorio de septiembre', Bandeja, { reportes: ESTADO0.reportes, params: { area: 'laboratorio', periodo: '2026-09' } });
  afirmar(htmlVisorLab.includes('Formatos enviados') && htmlVisorLab.includes('Bioquímica') && htmlVisorLab.includes('A dónde llegó'), 'el visor de Laboratorio muestra sus secciones y a qué oficinas llegó');
  afirmar(!htmlVisorLab.includes('Tomar para revisión') && !htmlVisorLab.includes('>Validar<'), 'el visor ya no ofrece revisar ni validar');

  const htmlDiresa = render('la remisión a DIRESA de julio', RemisionDiresa, {
    reportes: ESTADO0.reportes, propios: ESTADO0.propios, remisiones: ESTADO0.remisionesDiresa, usuario: estadistica, params: { periodo: '2026-07' },
  });
  afirmar(!htmlDiresa.includes('Todas las fuentes están entregadas') && htmlDiresa.includes('Farmacia'), 'julio dice que falta Farmacia antes de remitir a DIRESA');
  afirmar(htmlDiresa.includes('00000003') && htmlDiresa.includes('F. Camas'), 'el consolidado muestra la identificación y todas sus secciones');

  const htmlBoletin = render('el boletín', Boletin, { reportes: ESTADO0.reportes, editoriales: ESTADO0.boletinEditorial });
  afirmar(htmlBoletin.includes('Boletín estadístico') && htmlBoletin.includes('Nota metodológica'), 'el boletín se arma con sus secciones');

  /* El boletín solo publica lo que está en la base de datos, y de eso, lo entregado. */
  const { construirBoletin } = await servidor.ssrLoadModule('/src/app/datos/boletin/construir.js');
  const capituloDe = (b, clave) => b.capitulos.find((c) => c.clave === clave);
  const sinBase = construirBoletin('2026-07', ESTADO0.reportes);
  afirmar(sinBase.incluidos === 0 && sinBase.capitulos.every((c) => c.estado === 'sin-base'), 'sin base de datos el boletín no publica ningún capítulo, ni con los datos sembrados');

  const nutJulio = store.reporteDe(ESTADO0.reportes, 'nutricion', '2026-07');
  const deLaBase = (estado) => [...ESTADO0.reportes.filter((r) => r !== nutJulio), { ...nutJulio, origen: 'bd', estado }];
  const conBase = construirBoletin('2026-07', deLaBase('remitido'), { areasEnBase: ['nutricion'] });
  afirmar(capituloDe(conBase, 'nutricion').estado === 'incluido', 'un reporte entregado que viene de la base entra al boletín');
  afirmar(conBase.incluidos === 1, 'nada simulado entra junto con él: ni las otras áreas ni los datos propios de Estadística', String(conBase.incluidos));
  afirmar(capituloDe(conBase, 'lavanderia').estado === 'sin-base' && !capituloDe(conBase, 'lavanderia').pagina, 'un área que no está en la base no se imprime');
  afirmar(
    conBase.capitulos.every((c) => c.secciones.every((s) => !/(null|undefined|NaN)/.test(s.texto ?? ''))),
    'ningún párrafo del boletín dice null, undefined ni NaN',
  );
  const paginas = conBase.indice.map((i) => i.pagina);
  afirmar(paginas.every((p, i) => i === 0 || p > paginas[i - 1]), 'el índice numera las páginas en orden y sin repetir', paginas.join(','));
  afirmar(
    capituloDe(construirBoletin('2026-07', deLaBase('borrador'), { areasEnBase: ['nutricion'] }), 'nutricion').estado === 'espera-area',
    'un reporte de la base todavía en borrador no entra al boletín',
  );
  afirmar(
    capituloDe(construirBoletin('2026-07', ESTADO0.reportes, { areasEnBase: ['nutricion'] }), 'nutricion').estado === 'espera-area',
    'el reporte sembrado de un área que está en la base no cuenta: el capítulo espera el reporte de la base',
  );

  const { ultimoPeriodoConDatos } = await servidor.ssrLoadModule('/src/app/datos/boletin/construir.js');
  const enBase = { areasEnBase: ['nutricion'] };
  afirmar(ultimoPeriodoConDatos(ESTADO0.reportes, enBase) === null, 'sin reportes de la base no hay mes con datos: el boletín abre en el mes en curso');
  afirmar(ultimoPeriodoConDatos(deLaBase('remitido'), enBase) === '2026-07', 'el boletín abre en el último mes con un reporte entregado de la base');
  afirmar(ultimoPeriodoConDatos(deLaBase('borrador'), enBase) === null, 'un reporte de la base en borrador no decide el mes del boletín');
  afirmar(
    ultimoPeriodoConDatos([...deLaBase('remitido'), { ...nutJulio, id: 'nutricion:2030-01', periodo: '2030-01', origen: 'bd', estado: 'remitido' }], enBase) === '2026-07',
    'un mes que el sistema no ofrece no se elige aunque tenga datos en la base',
  );

  /* Ahora el flujo, sobre el almacén. */
  const enviados = store.simularEnvioPendientes('2026-09');
  afirmar(enviados === 4, 'la simulación envía las cuatro áreas que faltaban en septiembre', String(enviados));
  afirmar(
    areas.AREAS.every((a) => est.estaEntregado(store.estadoDe(store.leerEstado().reportes, a.clave, '2026-09'))),
    'después de simular, las nueve áreas de septiembre están entregadas',
  );

  afirmar(
    areas.AREAS.every((a) => store.estadoDe(store.leerEstado().reportes, a.clave, '2026-09') === 'remitido'),
    'septiembre queda entregado en las nueve áreas, sin pasar por Estadística',
  );

  const tras = store.leerEstado();
  store.editarBoletin('2026-09', 'portada.titulo', 'Prueba');
  afirmar(store.leerEstado().boletinEditorial['2026-09'].portada.titulo === 'Prueba', 'el editorial del boletín se guarda en el almacén, por periodo');
  store.restablecerBoletin('2026-09');
  afirmar(!store.leerEstado().boletinEditorial['2026-09'], 'restablecer borra el editorial del periodo');

  const septiembreSI = si.construirServiciosIntermedios('2026-09', tras.reportes, tras.propios);
  afirmar(
    septiembreSI.faltantes.length === 0 && vaciosDe(septiembreSI).every((c) => NO_REPORTADOS.test(c.clave)),
    'con todo validado, el consolidado de septiembre queda completo',
    vaciosDe(septiembreSI).map((c) => c.clave).join(', '),
  );

  const constancia = store.registrarRemisionDiresa('2026-09', { actor: 'Prueba de humo', faltantes: [] });
  afirmar(constancia?.constancia === 'DIR-2026-09', 'la remisión a DIRESA emite su constancia');
  afirmar(store.registrarRemisionDiresa('2026-09', { actor: 'Prueba de humo' }) === null, 'un mes no se remite dos veces a DIRESA');

  store.guardarPropio('2026-09', 'egresos', 1000);
  afirmar(
    indicadoresMod.calcularIndicadores('2026-09', store.leerEstado().reportes, store.leerEstado().propios).find((i) => i.n === 9).numerador === 1000,
    'un dato de Estadística cambia el indicador al instante',
  );

  const planeamientoAntes = store.reportesRecibidosPor(ESTADO0.reportes, 'planeamiento').length;
  const planeamientoDespues = store.reportesRecibidosPor(store.leerEstado().reportes, 'planeamiento').length;
  afirmar(planeamientoDespues > planeamientoAntes, 'Planeamiento recibe lo remitido', `${planeamientoAntes} -> ${planeamientoDespues}`);

  store.cerrarSesion();
  store.reiniciarDatos();

  /* ----------------------------------- 18. los formatos de Imágenes */
  titulo('18. Los cuatro formatos de Diagnóstico por Imágenes');

  const imgEst = await servidor.ssrLoadModule('/src/app/datos/formatos/imagenes.js');
  const imgCalc = await servidor.ssrLoadModule('/src/app/datos/formatos/imagenes-calculos.js');
  const imgSiembra = await servidor.ssrLoadModule('/src/app/datos/formatos/imagenes-siembra.js');
  const levantados = await servidor.ssrLoadModule('/src/app/datos/formatos/levantados.js');

  afirmar(imgEst.FORMATOS.length === 4, 'Imágenes tiene cuatro formatos');
  afirmar(imgEst.FORMATOS.map((x) => x.modalidad).join() === 'Ecografía,Tomografía,Mamografía,Rayos X', 'los formatos siguen el orden del oficio');
  afirmar(levantados.formularioDe('imagenes') && levantados.formularioDe('lavanderia'), 'Imágenes y Lavandería están en el registro de áreas levantadas');
  afirmar(areas.destinosDe('imagenes').join() === 'estadistica,planeamiento,cuerpo-tecnico', 'Imágenes llega a Estadística y de ahí a Planeamiento y Cuerpo Técnico');

  /* El oficio real de junio, casilla por casilla. */
  const imgJunio = REPORTES_INICIALES.find((r) => r.id === 'imagenes:2026-06');
  const dj = imgJunio.datos;
  const eco = imgCalc.totalesCuadro(dj.f1.examenes);
  afirmar(dj.f1.examenes.map(imgCalc.examenesDeFila).join() === '331,133,216,293', 'la columna EXAM de cada médico es la suma de sus nueve casillas', dj.f1.examenes.map(imgCalc.examenesDeFila).join());
  afirmar(eco.examenes === 973 && eco.pacientes === 906, 'ecografía suma 973 exámenes y 906 pacientes, como el oficio', `${eco.examenes} / ${eco.pacientes}`);
  afirmar(eco.monto === 1165, 'el monto de ecografía son S/ 1 165', String(eco.monto));
  const FILA_TOTAL = { sis: [445, 258, 196], convenio: [49, 3, 0], pagado: [19, 2, 1] };
  for (const [fin, esperados] of Object.entries(FILA_TOTAL)) {
    const obtenidos = ['ce', 'emerg', 'hosp'].map((s) => imgCalc.celda(eco.matriz, fin, s));
    afirmar(obtenidos.join() === esperados.join(), `la fila TOTAL de ${fin} cuadra con el oficio`, `${obtenidos.join()} != ${esperados.join()}`);
  }
  afirmar(imgCalc.totalesCuadro(dj.f1.biopsias).examenes === 43, 'biopsias suman 43');
  afirmar(imgCalc.totalesCuadro(dj.f1.oncologicos).examenes === 20, 'procedimientos oncológicos suman 20');
  afirmar(dj.f2.inoperativo && imgCalc.examenesF2(dj.f2) === 0, 'junio registra el tomógrafo inoperativo con cero exámenes, no sin datos');
  afirmar(imgCalc.examenesF3(dj.f3) === 385, 'mamografía suma 385 con la campaña', String(imgCalc.examenesF3(dj.f3)));
  afirmar(imgCalc.examenesF4(dj.f4) === 1372 && imgCalc.totalPersonas(dj.f4.tecnologos) === 1372, 'Rayos X: 1 372 por servicio y 1 372 por tecnólogo');

  const vJunio = imgCalc.validar(dj);
  afirmar(vJunio.errores.length === 0, 'junio no tiene errores', vJunio.errores.map((e) => e.id).join());
  afirmar(vJunio.avisos.map((a) => a.id).sort().join() === 'f3-blancos,f3-importe', 'junio avisa la casilla en blanco y el monto sin pagados de mamografía', vJunio.avisos.map((a) => a.id).join());

  for (const r of REPORTES_INICIALES.filter((x) => x.area === 'imagenes')) {
    afirmar(imgCalc.validar(r.datos).errores.length === 0, `${r.id} se sembró sin errores`, imgCalc.validar(r.datos).errores.map((e) => e.id).join());
  }
  afirmar(JSON.stringify(imgSiembra.datosDeImagenes('2026-03')) === JSON.stringify(imgSiembra.datosDeImagenes('2026-03')), 'la siembra de Imágenes es determinista');

  /* Un reporte vacío no afirma ceros, y los errores se detectan. */
  const vacio = imgEst.datosVacios();
  const vVacio = imgCalc.validar(vacio);
  afirmar(vVacio.errores.map((e) => e.id).join() === 'f1-vacio,f2-vacio,f3-vacio,f4-vacio', 'un reporte vacío solo pide llenar las cuatro hojas', vVacio.errores.map((e) => e.id).join());
  afirmar(['f1', 'f2', 'f3', 'f4'].every((x) => imgCalc.examenesDe(x, vacio) === null), 'una hoja vacía no suma cero exámenes');
  afirmar(['f1', 'f2', 'f3', 'f4'].every((x) => imgCalc.estadoDeFormato(x, vacio, '2026-08', vVacio) === 'vacio'), 'las hojas vacías se ven vacías, no en error');

  const conCambio = (formatoId, parcial) => ({ ...structuredClone(dj), [formatoId]: { ...structuredClone(dj[formatoId]), ...parcial } });
  const malTec = conCambio('f4', { tecnologos: dj.f4.tecnologos.map((t, i) => (i === 0 ? { ...t, cantidad: t.cantidad + 5 } : t)) });
  afirmar(imgCalc.validar(malTec).errores.some((e) => e.id === 'f4-tecnologos'), 'un descuadre entre tecnólogos y exámenes atendidos es error');
  const malPac = structuredClone(dj);
  malPac.f1.examenes[0].pacientes = 999;
  afirmar(imgCalc.validar(malPac).errores.some((e) => e.id === 'f1-pacientes'), 'más pacientes que exámenes es error');
  afirmar(imgCalc.validar(conCambio('f2', { nota: '' })).errores.some((e) => e.id === 'f2-motivo'), 'un tomógrafo inoperativo sin motivo es error');

  /* Lo que llega a DIRESA desde las cuatro hojas. */
  const siJunio = si.construirServiciosIntermedios('2026-06', REPORTES_INICIALES, PROPIOS);
  const col = (letra) => siJunio.campos.find((c) => c.col === letra)?.valor;
  afirmar(col('EV') === 1372 && col('EW') === 973 && col('EX') === 0, 'DIRESA recibe 1 372 radiográficos, 973 ecográficos y 0 tomográficos', `${col('EV')} ${col('EW')} ${col('EX')}`);
  afirmar(col('EU') === 0 && col('EY') === 0, 'fotoradiografías y placas dentales van en 0: el hospital no tiene esos servicios');
  afirmar(col('FN') === 499 && col('FO') === 513, 'consulta externa: 499 radiográficos y 513 ecográficos');
  afirmar(col('EZ') === 448 && col('FR') === 434, '«Otros» suma mamografías, campaña, biopsias y procedimientos', `${col('EZ')} ${col('FR')}`);

  /* Las pantallas. */
  const cuentaImg = usuarios.usuario('area-imagenes');
  const htmlImg = render('el reporte de Imágenes de agosto', Reporte, { reportes: REPORTES_INICIALES, usuario: cuentaImg });
  afirmar(htmlImg.includes('Formato 1') && htmlImg.includes('Exámenes ecográficos'), 'el reporte de Imágenes abre en ecografía');
  afirmar(htmlImg.includes('hrl-table__grupos') && /col[sS]pan="3"/.test(htmlImg), 'la tabla de ecografía agrupa SIS, convenios y pagados');
  const htmlImgJunio = render('el reporte de Imágenes de junio', Reporte, { reportes: REPORTES_INICIALES, usuario: cuentaImg, periodo: '2026-06' });
  afirmar(htmlImgJunio.includes('oficio real'), 'junio de Imágenes se rotula como oficio real');
  for (const [paso, texto] of [['f2', 'Tomografías informadas'], ['f3', 'Campaña (sin documento)'], ['f4', 'Exámenes realizados por tecnólogo']]) {
    const html = render(`el ${paso} de Imágenes de junio`, Reporte, { reportes: REPORTES_INICIALES, usuario: cuentaImg, periodo: '2026-06', paso });
    afirmar(html.includes(texto), `el ${paso} de Imágenes muestra «${texto}»`);
  }
  const htmlMamo = render('la mamografía de junio', Reporte, { reportes: REPORTES_INICIALES, usuario: cuentaImg, periodo: '2026-06', paso: 'f3' });
  afirmar(htmlMamo.includes('casilla en blanco'), 'la mamografía de junio muestra el aviso de la casilla en blanco');

  const htmlHistImg = render('el historial de Imágenes', Historial, { reportes: REPORTES_INICIALES, usuario: cuentaImg, irA: nada });
  afirmar(htmlHistImg.includes('CR-2026-06-DXI') && htmlHistImg.includes('Exámenes'), 'el historial de Imágenes muestra constancias y exámenes');

  const htmlInicioImg = render('el tablero de inicio de Imágenes', InicioPanel, { reportes: REPORTES_INICIALES, usuario: cuentaImg, irA: nada });
  afirmar(htmlInicioImg.includes('Último mes enviado: Septiembre 2026'), 'el tablero de Imágenes rotula el último mes enviado');
  afirmar(htmlInicioImg.includes('Tomógrafo inoperativo desde mayo 2026'), 'el tablero dice desde cuándo está inoperativo el tomógrafo');
  afirmar(htmlInicioImg.includes('Rayos X por tecnólogo'), 'el tablero muestra la productividad por tecnólogo');

  const htmlVisorImg = render('el visor de Imágenes de junio', Bandeja, { reportes: REPORTES_INICIALES, params: { area: 'imagenes', periodo: '2026-06' } });
  afirmar(htmlVisorImg.includes('Formatos enviados') && htmlVisorImg.includes('los exámenes por tecnólogo suman'), 'Estadística ve los formatos de Imágenes y sus comprobaciones');
  afirmar(htmlVisorImg.includes(oficinas.OFICINAS.find((o) => o.clave === 'cuerpo-tecnico').nombre), 'el visor dice que Imágenes va a Cuerpo Técnico');

  /* El flujo: rectificar, llenar y enviar, que lo entrega a sus dos oficinas. */
  const P = '2026-09';
  const actorEst = { actor: 'Prueba de humo', rol: 'estadistica' };
  store.aplicarTransicion('imagenes', P, 'rectificar', actorEst);
  afirmar(store.estadoDe(store.leerEstado().reportes, 'imagenes', P) === 'borrador', 'Imágenes de septiembre vuelve a llenado al rectificar');
  const htmlLlenadoImg = render('Imágenes en llenado', Reporte, { reportes: store.leerEstado().reportes, usuario: cuentaImg });
  afirmar(htmlLlenadoImg.includes('Añadir profesional') && htmlLlenadoImg.includes('Continuar al envío'), 'en llenado y sin servidor, Imágenes revisa, puede añadir profesionales y sigue al envío');

  store.guardarDatos('imagenes', P, { f4: { ...store.reporteDe(store.leerEstado().reportes, 'imagenes', P).datos.f4, tecnologos: [] } });
  const vRoto = imgCalc.validar(store.reporteDe(store.leerEstado().reportes, 'imagenes', P).datos);
  afirmar(vRoto.errores.some((e) => e.id === 'f4-tecnologos'), 'borrar los tecnólogos bloquea el envío');
  store.guardarDatos('imagenes', P, levantados.datosSembrados('imagenes', P));
  const remImg = store.aplicarTransicion('imagenes', P, 'enviar', { actor: 'Prueba de humo', rol: 'area' });
  afirmar(remImg?.estado === 'remitido', 'Imágenes envía el reporte corregido');
  afirmar(remImg?.remision?.destinos.join() === 'planeamiento,cuerpo-tecnico', 'al enviar, Imágenes llega a Planeamiento y Cuerpo Técnico', remImg?.remision?.destinos.join());
  afirmar(store.reportesRecibidosPor(store.leerEstado().reportes, 'cuerpo-tecnico').some((r) => r.id === `imagenes:${P}`), 'Cuerpo Técnico recibe el reporte en cuanto se envía');

  /* Las piezas nuevas del kit. */
  const { DataTable: TablaKit, NumberCell: Celda } = await servidor.ssrLoadModule('@hrl/core-ui');
  const htmlGrupos = render('una tabla con grupos de columnas', TablaKit, {
    columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', group: 'G' }, { key: 'c', label: 'C', group: 'G' }],
    rows: [{ a: 1, b: 2, c: 3 }],
  });
  afirmar(htmlGrupos.includes('colSpan="2"') || htmlGrupos.includes('colspan="2"'), 'las columnas contiguas del mismo grupo comparten una cabecera');
  afirmar(render('una casilla con decimales', Celda, { value: 4.5, 'aria-label': 'x' }).includes('value="4.5"'), 'la casilla numérica conserva decimales');

  /* ------------------------------------------ 18b. los formatos de Farmacia */
  titulo('18b. Farmacia: atenciones, Sala de Operaciones, Consultorios externos y reglas R1–R10');
  store.reiniciarDatos();

  const farEst = await servidor.ssrLoadModule('/src/app/datos/formatos/farmacia.js');
  const farCalc = await servidor.ssrLoadModule('/src/app/datos/formatos/farmacia-calculos.js');
  const farSiembra = await servidor.ssrLoadModule('/src/app/datos/formatos/farmacia-siembra.js');
  const farTablero = await servidor.ssrLoadModule('/src/app/datos/formatos/farmacia-tablero.js');

  afirmar(farEst.FORMATOS.map((x) => x.id).join() === 'f1,f2,f3,f4', 'Farmacia tiene sus cuatro formatos');
  afirmar(Boolean(levantados.formularioDe('farmacia')), 'Farmacia está en el registro de áreas levantadas');
  afirmar(areas.destinosDe('farmacia').join() === 'estadistica,planeamiento', 'Farmacia llega a Estadística y de ahí a Planeamiento');
  afirmar(farEst.FILAS.every((f) => f.label.startsWith('Fila ') && f.aclaracion.includes('por confirmar')), 'las filas sin rótulo se llaman «Fila n» y lo advierten');

  /* Los totales calculados reproducen el informe de enero de 2026. */
  const ENE = farSiembra.INFORME_ENERO_2026;
  const ene = farSiembra.datosDeEnero();
  afirmar(farCalc.totalSis(ene.f1) === ENE.totales.sis, 'R1 · el total SIS de enero son 18 878', String(farCalc.totalSis(ene.f1)));
  afirmar(farCalc.totalConvenios(ene.f1) === ENE.totales.convenios, 'R2 · el total de convenios de enero son 499');
  afirmar(farCalc.totalOtras(ene.f1) === ENE.totales.otras, 'R3 · las otras atenciones de enero son 5 521', String(farCalc.totalOtras(ene.f1)));
  afirmar(farCalc.totalAtenciones(ene.f1) === ENE.totales.atenciones, 'R4 · el total de atenciones de enero son 24 399', String(farCalc.totalAtenciones(ene.f1)));
  afirmar(farCalc.recetasDespachadas(ene.f1) === 18045, 'las recetas despachadas (lectura DIRESA) de enero son 18 045');
  afirmar(farCalc.totalHospitalizadosSop(ene.f2) === 818 && farCalc.totalConveniosSop(ene.f2) === 24, 'Sala de Operaciones de enero: 818 hospitalizados y 24 convenios');
  afirmar(farCalc.totalConsultasF3(ene.f3) === 2668 && farCalc.totalConveniosF3(ene.f3) === 151, 'Consultorios externos de enero: 2 668 consultas y 151 convenios');
  afirmar(farCalc.validar(ene, '2026-01').hallazgos.length === 0, 'enero cumple todas las reglas, como dice la documentación', farCalc.validar(ene, '2026-01').hallazgos.map((h) => h.id).join());

  /* Un formato vacío no es un formato en ceros. */
  const vacioF = farEst.datosVacios();
  afirmar(!/:-?\d/.test(JSON.stringify(vacioF)), 'un reporte de Farmacia sin llenar no trae ningún cero');
  afirmar(farCalc.totalAtenciones(vacioF.f1) === null && farCalc.totalSop(vacioF.f2) === null, 'los totales de un formato vacío son «sin dato», no cero');
  const vVacioF = farCalc.validar(vacioF, '2026-09');
  afirmar(vVacioF.errores.map((e) => e.id).join() === 'f1-vacio,f2-vacio,f3-vacio', 'un reporte vacío no se puede enviar, y solo por estar vacío', vVacioF.errores.map((e) => e.id).join());
  afirmar(['f1', 'f2', 'f3', 'f4'].every((id) => farCalc.estadoDeFormato(id, vacioF, '2026-09', vVacioF) === 'vacio'), 'sin llenar, cada paso se ve vacío y no en error');
  afirmar(!REPORTES_INICIALES.some((r) => r.area === 'farmacia' && r.periodo > '2026-09'), 'no se almacena ningún reporte de Farmacia que no exista');

  /* Cada regla se dispara cuando corresponde. */
  const con = (cambio) => {
    const d = structuredClone(ene);
    cambio(d);
    return farCalc.validar(d, '2026-01');
  };
  const dispara = (v, id, nivel) => v.hallazgos.some((h) => h.regla === id && h.nivel === nivel);
  afirmar(dispara(con((d) => { d.f3.consultas.fila1 += 1; }), 'r5', 'error'), 'R5 · consultas del Formato 3 distintas de la Consulta externa del Formato 1 es error');
  afirmar(dispara(con((d) => { d.f3.convenios.fila2 -= 1; }), 'r6', 'error'), 'R6 · convenios del Formato 3 distintos de los de consultorio es error');
  afirmar(dispara(con((d) => { d.f2.hospitalizados.fila1.ciru = 20000; }), 'r7', 'aviso'), 'R7 · más hospitalizados en Sala de Operaciones que en Hospitalización es aviso, no error');
  afirmar(dispara(con((d) => { d.f2.convenios.fila1 = 500; }), 'r8', 'aviso'), 'R8 · más convenios en Sala de Operaciones que de hospitalizados es aviso, no error');
  afirmar(dispara(con((d) => { d.f1.otros.boletas = 4367.5; }), 'r9', 'error') && dispara(con((d) => { d.f2.convenios.fila3 = -2; }), 'r9', 'error'), 'R9 · un decimal o un negativo es error');
  afirmar(dispara(con((d) => { d.periodoDocumento = '2024-01'; }), 'r10', 'error'), 'R10 · un documento de «enero 2024» en el reporte de enero de 2026 es error');
  afirmar(!dispara(con((d) => { d.f3.consultas = {}; d.f3.convenios = {}; }), 'r5', 'error'), 'una regla sin uno de sus lados no se evalúa: ni cumplida ni incumplida');
  afirmar(con((d) => { delete d.f1.otros.credito; }).avisos.some((a) => a.id === 'f1-blancos'), 'una casilla en blanco del Formato 1 se avisa');
  const vR7 = con((d) => { d.f2.hospitalizados.fila1.ciru = 20000; });
  afirmar(vR7.errores.length === 0, 'R7 y R8 no impiden enviar: descansan en un supuesto sin confirmar');

  /* Los datos de ejemplo (los Word de la demostración) cumplen las reglas. */
  for (const p of PERIODOS) {
    const v = farCalc.validar(farSiembra.datosDeFarmacia(p), p);
    afirmar(v.errores.length === 0 && v.avisos.length === 0, `el ejemplo de ${p} de Farmacia no tiene hallazgos`, v.hallazgos.map((h) => h.id).join());
  }
  afirmar(JSON.stringify(farSiembra.datosDeFarmacia('2026-05')) === JSON.stringify(farSiembra.datosDeFarmacia('2026-05')), 'la siembra de Farmacia es determinista');
  afirmar(farSiembra.PERIODO_CON_CIFRAS_REALES === null, 'ningún mes sembrado de Farmacia se presenta como real');

  /* Farmacia sube julio y agosto: con eso hay tablero, historial y DIRESA. */
  const actorAreaF = { actor: 'Prueba de humo', rol: 'area' };
  for (const p of ['2026-07', '2026-08']) {
    store.aplicarTransicion('farmacia', p, 'crear', actorAreaF);
    store.guardarDatos('farmacia', p, farSiembra.datosDeFarmacia(p));
    store.aplicarTransicion('farmacia', p, 'enviar', actorAreaF);
  }
  const conFarmacia = store.leerEstado().reportes;
  afirmar(store.estadoDe(conFarmacia, 'farmacia', '2026-07') === 'remitido', 'un mes pasado se abre, se llena y se envía aunque su plazo haya vencido');

  /* DIRESA y el Boletín: las mismas tres columnas, desde el Formato 1. */
  const farAgosto = store.reporteDe(conFarmacia, 'farmacia', '2026-08');
  const siAgosto = si.construirServiciosIntermedios('2026-08', conFarmacia, PROPIOS);
  const recetaSI = (s) => siAgosto.campos.find((c) => c.clave === `otros.${s}.recetas`);
  afirmar(['hosp', 'emerg', 'ce'].every((s) => recetaSI(s).valor === farAgosto.datos.f1.sis[s]), 'las recetas despachadas de DIRESA salen de las atenciones SIS de cada servicio');
  afirmar(siAgosto.campos.find((c) => c.clave === 'otros.general.recetas').valor === farCalc.recetasDespachadas(farAgosto.datos.f1), 'el total de recetas de DIRESA es la lectura documentada');
  afirmar(recetaSI('hosp').origen.detalle.includes('tres lecturas'), 'la celda de DIRESA dice cuál de las tres lecturas usa');

  /* El tablero, el reporte y el visor de Estadística. */
  const cuentaFar = usuarios.usuario('area-farmacia');
  const ultimoFar = farTablero.ultimoEnviado(conFarmacia);
  afirmar(ultimoFar?.periodo === '2026-08', 'el último mes enviado de Farmacia es el último que subió');
  afirmar(farTablero.serieMensual(conFarmacia, PERIODOS, 'atenciones').every((p) => p.value == null || p.value > 0), 'la serie de atenciones no tiene ceros inventados');
  const htmlInicioFar = render('el tablero de inicio de Farmacia', InicioPanel, { reportes: conFarmacia, usuario: cuentaFar, irA: nada });
  afirmar(htmlInicioFar.includes('Último mes enviado: Agosto 2026') && htmlInicioFar.includes('frente a julio'), 'el tablero de Farmacia compara con el mes anterior, nombrándolo');
  afirmar(htmlInicioFar.includes('Reparto por tipo de atención') && htmlInicioFar.includes('Atenciones por mes'), 'el tablero muestra la evolución y el reparto');
  afirmar(htmlInicioFar.includes('Enero 2026') && htmlInicioFar.includes('Subir el de enero 2026'), 'el tablero pide los meses que faltan desde enero');
  const htmlInicioVacio = render('el tablero de Farmacia sin meses', InicioPanel, { reportes: REPORTES_INICIALES, usuario: cuentaFar, irA: nada });
  afirmar(htmlInicioVacio.includes('Todavía no hay meses enviados'), 'sin meses subidos, el tablero lo dice en lugar de mostrar ceros');
  const unSoloMes = conFarmacia.filter((r) => r.area !== 'farmacia' || r.periodo === '2026-08');
  const htmlSinAnterior = render('el tablero de Farmacia con un solo mes', InicioPanel, { reportes: unSoloMes, usuario: cuentaFar, irA: nada });
  afirmar(htmlSinAnterior.includes('Sin mes anterior para comparar'), 'sin mes anterior, el tablero lo dice en lugar de comparar con cero');

  for (const [paso, texto] of [['f1', 'Total de atenciones'], ['f2', 'Filas por confirmar'], ['f3', 'R5'], ['f4', 'pendiente de definir']]) {
    const html = render(`el ${paso} de Farmacia de agosto`, Reporte, { reportes: conFarmacia, usuario: cuentaFar, periodo: '2026-08', paso });
    afirmar(html.includes(texto), `el ${paso} de Farmacia muestra «${texto}»`);
  }
  const htmlF1Far = render('el Formato 1 de Farmacia', Reporte, { reportes: conFarmacia, usuario: cuentaFar, periodo: '2026-08' });
  afirmar(htmlF1Far.includes('Automático') && !htmlF1Far.includes('aria-label="Total SIS"'), 'los totales de Farmacia se calculan: no son casillas');

  const htmlVisorFar = render('el visor de Farmacia de agosto', Bandeja, { reportes: conFarmacia, usuario: estadistica, params: { area: 'farmacia', periodo: '2026-08' } });
  afirmar(htmlVisorFar.includes('Formatos enviados') && htmlVisorFar.includes('R5'), 'Estadística ve los formatos de Farmacia y sus comprobaciones');
  const htmlHistFar = render('el historial de Farmacia', Historial, { reportes: conFarmacia, usuario: cuentaFar, irA: nada });
  afirmar(htmlHistFar.includes('Enero 2026') && htmlHistFar.includes('Atenciones'), 'el historial de Farmacia lista desde enero, con sus atenciones');
  const htmlEnero = render('el reporte de enero de Farmacia', Reporte, { reportes: conFarmacia, usuario: cuentaFar, periodo: '2026-01', irA: nada });
  afirmar(htmlEnero.includes('Suba el Word de enero 2026') && !htmlEnero.includes('Abrir el reporte') && htmlEnero.includes('Mes del reporte'), 'enero se sube directo, sin un paso previo para abrirlo, y se elige el mes en la lista');

  /* El Word del informe: el bot lo lee con el mismo lector que el real y
     llena los formatos. Los ejemplos son Word generados por el bot con los
     cuadros del informe de enero de 2026 y cifras ficticias. */
  const ejFar = await servidor.ssrLoadModule('/src/app/servicios/ejemplos-farmacia.js');
  const botFar = await servidor.ssrLoadModule('/src/app/servicios/bot-validador.js');
  const infBien = await botFar.validarArchivo(ejFar.ejemploCorrecto('2026-08'), { area: 'farmacia', periodo: '2026-08', pausa: 0 });
  afirmar(!infBien.bloqueo && infBien.errores.length === 0 && infBien.avisos.length === 0, 'el Word de ejemplo se lee sin errores ni avisos', JSON.stringify(infBien.bloqueo ?? infBien.errores.map((e) => e.id)));
  afirmar(farCalc.totalAtenciones(infBien.datos.f1) === farCalc.totalAtenciones(farSiembra.datosDeFarmacia('2026-08').f1), 'lo leído del Word son las mismas cifras que se escribieron');
  afirmar(infBien.plantilla?.documento === 'Word' && infBien.leidas > 60, 'el informe dice que se leyó un Word y cuántas cifras', String(infBien.leidas));
  const infMal = await botFar.validarArchivo(ejFar.ejemploConErrores('2026-08'), { area: 'farmacia', periodo: '2026-08', pausa: 0 });
  afirmar(infMal.errores.some((e) => e.regla === 'totales') && infMal.errores.some((e) => e.regla === 'r5'), 'el Word con errores: total SIS mal sumado y consultas que no cuadran', infMal.errores.map((e) => e.regla).join());
  afirmar(infMal.avisos.some((a) => a.regla === 'rotulos'), 'el Word con «ENERO 2024» en un título se avisa');
  const infOtroMesF = await botFar.validarArchivo(ejFar.ejemploCorrecto('2026-07'), { area: 'farmacia', periodo: '2026-08', pausa: 0 });
  afirmar(infOtroMesF.bloqueo?.id === 'plantilla-periodo', 'el Word de otro mes no se carga a medias: se bloquea');
  const noWord = { name: 'x.docx', size: 10, arrayBuffer: async () => new TextEncoder().encode('no soy un zip').buffer };
  afirmar((await botFar.validarArchivo(noWord, { area: 'farmacia', periodo: '2026-08', pausa: 0 })).bloqueo?.titulo.includes('Word'), 'un archivo que no es Word se rechaza diciendo que se esperaba un Word');
  const editado = { ...infMal.datos, f1: { ...infMal.datos.f1, sis: { ...infMal.datos.f1.sis } }, escritos: null };
  afirmar(!farCalc.validar(editado, '2026-08').errores.some((e) => e.regla === 'totales'), 'corregido a mano, los totales del Word dejan de compararse');

  /* El flujo completo con entrega directa: crear, llenar, validar y enviar a Planeamiento. */
  const PF = '2026-09';
  store.aplicarTransicion('farmacia', PF, 'crear', actorAreaF);
  store.guardarDatos('farmacia', PF, { f1: farSiembra.datosDeFarmacia(PF).f1 });
  afirmar(store.estadoDe(store.leerEstado().reportes, 'farmacia', PF) === 'borrador', 'Farmacia abre septiembre');
  const parcialF = store.reporteDe(store.leerEstado().reportes, 'farmacia', PF).datos;
  afirmar(farCalc.validar({ ...farEst.datosVacios(), ...parcialF }, PF).errores.some((e) => e.id === 'f2-vacio'), 'a medio llenar (solo el Formato 1), no se puede enviar');
  const htmlLlenadoFar = render('Farmacia en llenado', Reporte, { reportes: store.leerEstado().reportes, usuario: cuentaFar });
  afirmar(htmlLlenadoFar.includes('Continuar al envío') && htmlLlenadoFar.includes('aria-label="Hospitalización"'), 'en llenado y sin servidor, Farmacia digita y sigue al envío');
  afirmar(htmlLlenadoFar.includes('Subir el Word') && htmlLlenadoFar.includes('Revisar y resolver'), 'en llenado, Farmacia sigue los mismos tres pasos que las áreas con Excel');
  store.guardarDatos('farmacia', PF, levantados.datosSembrados('farmacia', PF));
  const actualF = store.reporteDe(store.leerEstado().reportes, 'farmacia', PF).datos;
  store.guardarDatos('farmacia', PF, { f3: { ...actualF.f3, consultas: { ...actualF.f3.consultas, fila2: actualF.f3.consultas.fila2 + 5 } } });
  const vRotoF = farCalc.validar(store.reporteDe(store.leerEstado().reportes, 'farmacia', PF).datos, PF);
  afirmar(vRotoF.errores.some((e) => e.regla === 'r5'), 'un descuadre entre Formato 3 y Formato 1 bloquea el envío');
  store.guardarDatos('farmacia', PF, levantados.datosSembrados('farmacia', PF));
  afirmar(store.aplicarTransicion('farmacia', PF, 'enviar', { actor: 'Prueba de humo', rol: 'area' })?.estado === 'remitido', 'Farmacia envía el reporte corregido');
  afirmar(store.reportesRecibidosPor(store.leerEstado().reportes, 'planeamiento').some((r) => r.id === `farmacia:${PF}`), 'Planeamiento recibe el reporte de Farmacia al enviar');
  store.reiniciarDatos();

  /* Lo que Farmacia sube se queda en el navegador: recargar no lo borra. */
  const memoria = new Map();
  globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k) };
  try {
    store.aplicarTransicion('farmacia', '2026-01', 'crear', { actor: 'Prueba de humo', rol: 'area' });
    store.guardarDatos('farmacia', '2026-01', farSiembra.datosDeEnero());
    const guardado = JSON.parse(memoria.get('hrl-prototipo-reportes-farmacia-v1') ?? '[]');
    afirmar(guardado.length === 1 && guardado[0].id === 'farmacia:2026-01', 'el mes que sube Farmacia se guarda en el navegador', JSON.stringify(guardado.map((r) => r.id)));
    afirmar(guardado.every((r) => r.area === 'farmacia'), 'en el navegador solo se guarda Farmacia');
    store.usarDatosSimulados();
    afirmar(store.reporteDe(store.leerEstado().reportes, 'farmacia', '2026-01')?.estado === 'borrador', 'al volver a cargar, enero sigue ahí');
    store.reiniciarDatos();
    afirmar(!store.reporteDe(store.leerEstado().reportes, 'farmacia', '2026-01') && JSON.parse(memoria.get('hrl-prototipo-reportes-farmacia-v1') ?? '[]').length === 0, 'reiniciar los datos borra también lo guardado');
  } finally {
    delete globalThis.localStorage;
    store.reiniciarDatos();
  }

  /* ------------------------------------------ 19. Nutrición: carga de Excel */
  titulo('19. Nutrición: plantilla, bot validador y envío a Estadística y Planeamiento');
  store.reiniciarDatos();

  const nut = await servidor.ssrLoadModule('/src/app/datos/formatos/nutricion.js');
  const nutCalc = await servidor.ssrLoadModule('/src/app/datos/formatos/nutricion-calculos.js');
  const nutSiembra = await servidor.ssrLoadModule('/src/app/datos/formatos/nutricion-siembra.js');
  const bot = await servidor.ssrLoadModule('/src/app/servicios/bot-validador.js');
  const ejemplos = await servidor.ssrLoadModule('/src/app/servicios/ejemplos-nutricion.js');

  /* La transcripción del oficio de junio suma exactamente lo impreso, cuadro
     por cuadro: si una casilla se leyó mal, esto lo dice. */
  const junioNutricion = nutSiembra.datosDeNutricion('2026-06');
  for (const f of nut.FORMATOS) {
    const tNut = nutCalc.totalFormato(junioNutricion, f.id, '2026-06');
    afirmar(tNut === nutSiembra.TOTALES_IMPRESOS_JUNIO[f.id], `${f.titulo}: junio suma ${nutSiembra.TOTALES_IMPRESOS_JUNIO[f.id]}, como el oficio`, String(tNut));
  }
  afirmar(nutCalc.cifrasNutricion(junioNutricion, '2026-06').total === 44316, 'junio: comensales y pacientes suman 44 316, como el resumen del oficio');
  for (const [p, totales] of Object.entries(nutSiembra.TOTALES_MENSUALES)) {
    const dNut = nutSiembra.datosDeNutricion(p);
    afirmar(nut.FORMATOS.every((f) => nutCalc.totalFormato(dNut, f.id, p) === totales[f.id]), `${p}: los totales por cuadro son los reales del resumen anual`);
  }
  afirmar(Object.keys(nutSiembra.datosDeNutricion('2026-08', { parcial: true })).length === 0, 'un borrador de Nutrición empieza vacío: se llena subiendo el Excel');

  /* Las reglas sobre el oficio real: sin errores, y el día 21 de la dieta
     líquida señalado para confirmar. */
  const vJunioNut = nutCalc.validar(junioNutricion, '2026-06');
  afirmar(vJunioNut.errores.length === 0, 'el oficio de junio no tiene errores', vJunioNut.errores.map((e) => e.titulo).join('; '));
  afirmar(vJunioNut.avisos.length === 1 && vJunioNut.avisos[0].dia === 21 && vJunioNut.avisos[0].fila === 'liquida.cena', 'el bot señala las 100 raciones del 21 de junio (dieta líquida, cena)');
  afirmar(vJunioNut.info.some((i) => i.fila === 'asistencial.cena'), 'el desayuno y la cena del personal asistencial iguales se informan, sin bloquear');
  const huecos = nutCalc.validar({ f1: { 'asistencial.desayuno': [5] } }, '2026-08');
  afirmar(huecos.errores.some((e) => e.id === 'incompleto'), 'una casilla vacía no es cero: impide enviar');

  /* La plantilla del bot con el oficio real: ida y vuelta, y lectura por nombre. */
  const bytesJunio = bot.plantilla('2026-06', junioNutricion).bytes;
  const leido = await bot.validarArchivo({ name: 'junio.xlsx', arrayBuffer: async () => bytesJunio }, { periodo: '2026-06', pausa: 0 });
  afirmar(!leido.bloqueo && leido.plantilla.periodo === '2026-06', 'la plantilla generada se reconoce como de Nutrición, junio');
  afirmar(
    nut.FORMATOS.every((f) => f.filas.every((fila) => JSON.stringify(leido.datos[f.id][fila.clave]) === JSON.stringify(junioNutricion[f.id][fila.clave]))),
    'lo leído de la plantilla es exactamente lo escrito, casilla por casilla',
  );
  afirmar(leido.leidas === 1080, 'junio: 36 filas por 30 días, 1 080 casillas leídas', String(leido.leidas));
  afirmar(bot.celdaDeOrigen(leido.origen, 'f3', 'liquida.cena', 21)?.ref === 'W16', 'cada casilla sabe de qué celda del Excel salió');
  const noExcel = new TextEncoder().encode('no es un excel');
  afirmar((await bot.validarArchivo({ name: 'x.xlsx', arrayBuffer: async () => noExcel }, { periodo: '2026-06', pausa: 0 })).bloqueo?.id === 'archivo', 'un archivo que no es Excel se rechaza con un motivo');
  afirmar(bot.MODO_BOT.tipo === 'embebido', 'sin VITE_BOT_URL, el prototipo usa el bot embebido');

  /* El bot, con los tres casos de la demostración. */
  const anteriorNut = { periodo: '2026-07', datos: nutSiembra.datosDeNutricion('2026-07') };
  const infCorrecto = await bot.validarArchivo(ejemplos.ejemploCorrecto('2026-08'), { periodo: '2026-08', anterior: anteriorNut, pausa: 0 });
  afirmar(!infCorrecto.bloqueo && infCorrecto.errores.length === 0 && infCorrecto.avisos.length === 0, 'el ejemplo correcto pasa sin errores ni alertas');
  /* «ok» o solo informativa: el ejemplo no trae a Patrimonio (grupo ocasional) y el bot lo dice. */
  afirmar(infCorrecto.reglas.every((r) => r.estado === 'ok' || r.estado === 'info'), 'con el mes anterior disponible, el bot evalúa todas sus reglas y ninguna falla');
  afirmar(infCorrecto.reglas.find((r) => r.id === 'filas-ausentes')?.estado === 'info', 'un grupo ocasional que no viene ese mes se informa, no se exige');
  const infErrores = await bot.validarArchivo(ejemplos.ejemploConErrores('2026-08'), { periodo: '2026-08', anterior: anteriorNut, pausa: 0 });
  const ids = new Set(infErrores.errores.map((e) => e.id));
  afirmar(['no-numerico', 'incompleto', 'totales'].every((id) => ids.has(id)), 'el ejemplo con errores trae letras, un vacío y un total tecleado', [...ids].join(', '));
  afirmar(infErrores.avisos.some((a) => a.regla === 'atipico'), 'y un día disparado como alerta');
  const infOtroMes = await bot.validarArchivo(ejemplos.ejemploCorrecto('2026-06'), { periodo: '2026-08', pausa: 0 });
  afirmar(infOtroMes.bloqueo?.id === 'plantilla-periodo' && !infOtroMes.datos, 'la plantilla de otro mes se bloquea sin cargar nada');
  const infJunio = await bot.validarDatos(junioNutricion, { periodo: '2026-06', anterior: { periodo: '2026-05', datos: nutSiembra.datosDeNutricion('2026-05') }, pausa: 0 });
  afirmar(infJunio.avisos.some((a) => a.id === 'variacion|f4'), 'el bot nota que los pacientes de emergencia bajan más de 20 % en junio');
  afirmar(bot.firmaDe(junioNutricion) === bot.firmaDe(nutSiembra.datosDeNutricion('2026-06')) && bot.firmaDe(junioNutricion) !== bot.firmaDe(infCorrecto.datos), 'la firma distingue datos distintos');

  /* DIRESA toma las raciones de los cuatro cuadros; consultorio externo va vacío. */
  const julioNut = si.construirServiciosIntermedios('2026-07', REPORTES_INICIALES, PROPIOS);
  const cJulio = nutCalc.cifrasNutricion(REPORTES_INICIALES.find((r) => r.id === 'nutricion:2026-07').datos, '2026-07');
  afirmar(campoDe(julioNut, 'FS')?.valor === cJulio.pacientesHosp, 'DIRESA, columna FS: raciones a pacientes hospitalizados del cuadro 3');
  afirmar(julioNut.campos.find((c) => c.clave === 'nut.ce.pacientes')?.valor === 0, 'DIRESA recibe 0 en consultorio externo: Nutrición no da raciones ahí');

  /* El envío: Estadística y Planeamiento en el mismo momento. */
  const septiembreCarga = await bot.validarArchivo(ejemplos.ejemploCorrecto('2026-09'), { periodo: '2026-09', pausa: 0 });
  const cargado = store.registrarCarga('nutricion', '2026-09', { datos: septiembreCarga.datos, carga: { archivo: septiembreCarga.archivo, origen: septiembreCarga.origen }, actor: 'Prueba de humo' });
  afirmar(cargado?.estado === 'borrador' && nutCalc.casillasLlenas(cargado.datos, '2026-09') === 1080, 'subir el Excel carga las 1 080 casillas de septiembre en el borrador');
  const enviadoNut = store.aplicarTransicion('nutricion', '2026-09', 'enviar', { actor: 'Prueba de humo', rol: 'area' });
  afirmar(enviadoNut?.estado === 'remitido' && enviadoNut.remision?.destinos.includes('planeamiento'), 'al enviar, Planeamiento lo recibe en el mismo momento, ya validado por el bot');
  afirmar(store.registrarCarga('nutricion', '2026-09', { datos: {}, actor: 'x' }) === null, 'un reporte enviado ya no acepta otra carga');
  const recibidosPla = store.reportesRecibidosPor(store.leerEstado().reportes, 'planeamiento');
  afirmar(recibidosPla.some((r) => r.id === 'nutricion:2026-09'), 'Planeamiento ve el reporte de septiembre de Nutrición apenas se envía');
  afirmar(!store.reportesRecibidosPor(store.leerEstado().reportes, 'epidemiologia').some((r) => r.area === 'nutricion'), 'Epidemiología no lo recibe: no está en la matriz de Nutrición');

  /* Herramientas de prueba (solo en sesiones de administración): no inventan
     estados; deshacen descartando el registro y reabriéndolo por el flujo. */
  {
    const antes = store.reporteDe(store.leerEstado().reportes, 'nutricion', '2026-09');
    const vuelto = store.devolverABorrador('nutricion', '2026-09');
    afirmar(
      vuelto?.estado === 'borrador' && !vuelto.folio && !vuelto.constancia && !vuelto.remision && JSON.stringify(vuelto.datos) === JSON.stringify(antes.datos),
      'deshacer la entrega (prueba) vuelve a «en llenado» con las mismas cifras, sin folio ni remisión',
    );
    afirmar(!store.reportesRecibidosPor(store.leerEstado().reportes, 'planeamiento').some((r) => r.id === 'nutricion:2026-09'), 'deshecha la entrega, Planeamiento deja de verla');
    afirmar(store.descartarReporte('nutricion', '2026-09') && !store.reporteDe(store.leerEstado().reportes, 'nutricion', '2026-09'), 'eliminar el reporte (prueba) lo deja «no iniciado»: no queda registro');
    const simulado = store.simularEntrega('nutricion', '2026-09');
    afirmar(simulado?.estado === 'remitido' && simulado.historial.map((h) => h.accion).join() === 'crear,enviar', 'simular la entrega pasa por las transiciones de siempre: crear y enviar');
    afirmar(store.simularEntrega('nutricion', '2026-09') === null, 'simular sobre un mes ya entregado no hace nada');
  }

  /* Las pantallas. */
  store.reiniciarDatos();
  const htmlNutVigente = render('el reporte de Nutrición en borrador', Reporte, {
    reportes: store.leerEstado().reportes,
    usuario: usuarios.usuario('area-nutricion'),
  });
  afirmar(htmlNutVigente.includes('Suba el Excel de septiembre 2026') && htmlNutVigente.includes('Subir el Excel'), 'Nutrición entra por la carga del Excel, con sus cuatro pasos');
  /* El número del paso va dentro del círculo, no en el título; el paso activo lo marca aria-current. */
  afirmar(htmlNutVigente.includes('class="hrl-trayecto"') && htmlNutVigente.includes('aria-current="step"'), 'los pasos de Nutrición son el ProgressSteps del kit, con el paso activo marcado');
  afirmar(!htmlNutVigente.includes('Herramientas de prueba'), 'una sesión normal no ve las herramientas de prueba');
  const htmlNutPruebas = render('el reporte de Nutrición abierto por administración', Reporte, {
    reportes: store.leerEstado().reportes,
    usuario: usuarios.usuario('area-nutricion'),
    pruebas: true,
  });
  afirmar(htmlNutPruebas.includes('Herramientas de prueba') && htmlNutPruebas.includes('Simular la entrega'), 'una sesión abierta por administración ve las herramientas de prueba');
  afirmar(htmlNutVigente.includes('class="hrl-mascota"') && htmlNutVigente.includes('data-pieza="cuerpo"'), 'el paso de carga muestra la mascota del bot (Mascot del kit) esperando el archivo');
  {
    /* La mascota es la del kit: cada estado del bot tiene que llegarle traducido
       a uno que el kit conozca, o se quedaría en reposo sin decirlo. */
    const { MASCOT_STATES } = await servidor.ssrLoadModule('@hrl/core-ui');
    const { ESTADO_KIT } = await servidor.ssrLoadModule('/src/app/paneles/Mascota.jsx');
    const sinTraducir = ['reposo', 'pensando', 'listo', 'problema'].filter((e) => !MASCOT_STATES.includes(ESTADO_KIT[e]));
    afirmar(sinTraducir.length === 0, `cada estado del bot llega traducido a la mascota del kit${sinTraducir.length ? ` (faltan: ${sinTraducir.join(', ')})` : ''}`);
  }
  const htmlNutJunio = render('el reporte de junio de Nutrición', Reporte, {
    reportes: store.leerEstado().reportes,
    usuario: usuarios.usuario('area-nutricion'),
    periodo: '2026-06',
  });
  afirmar(htmlNutJunio.includes('Junio viene de un oficio de ejemplo') && htmlNutJunio.includes('Planeamiento'), 'junio se ve en solo lectura, con su entrega a Planeamiento');
  const { CUADROS_NUTRICION } = await servidor.ssrLoadModule('/src/app/paneles/reporte/nutricion/Cuadros.jsx');
  const htmlCuadro = render('un cuadro de Nutrición en el visor de Estadística', CUADROS_NUTRICION.f3, { datos: junioNutricion, periodo: '2026-06' });
  afirmar(htmlCuadro.includes('Dieta líquida') && htmlCuadro.includes('Semana 1 de 5'), 'el visor de Estadística muestra el cuadro de pacientes, paginado por semana');

  /* El detalle: semanas de lunes a domingo, y los grupos fijos plegados. */
  const detalleNut = await servidor.ssrLoadModule('/src/app/paneles/reporte/nutricion/Detalle.jsx');
  const semanasAgosto = detalleNut.semanasDe('2026-08');
  afirmar(semanasAgosto.length === 6 && semanasAgosto[0].join() === '1,2' && semanasAgosto[5].join() === '31', 'agosto de 2026: seis semanas de lunes a domingo (sáb 1 y dom 2 abren el mes)');
  afirmar(detalleNut.semanasDe('2026-06').length === 5 && detalleNut.semanasDe('2026-06')[0].length === 7, 'junio de 2026 empieza en lunes: cinco semanas');
  const htmlComensales = render('el detalle de comensales de junio', detalleNut.default, { datos: junioNutricion, periodo: '2026-06', editable: false });
  /* Los grupos fijos ya no se pliegan: se ven en tabla, en el orden del oficio, con una nota. */
  afirmar(htmlComensales.replace(/<!-- -->/g, '').includes('Igual todo el mes: 20 por comida'), 'los internos de Medicina, fijos todo el mes, lo dicen en su cabecera');
  afirmar(htmlComensales.includes('0 los días 3, 10, 17, 24'), 'la nota del grupo fijo dice qué días fueron cero');
  afirmar((htmlComensales.match(/class="hrl-grupo"/g) ?? []).length === 5 && !htmlComensales.includes('Ver día por día'), 'los cinco grupos de comensales de hospitalización se ven en tabla, sin botón para abrirlos');
  const conMarcaNut = detalleNut.marcasDe({ errores: [], avisos: [{ formato: 'f3', fila: 'liquida.cena', dia: 21, titulo: 'x' }] });
  afirmar(conMarcaNut.get('f3|liquida.cena|21')?.nivel === 'aviso', 'cada hallazgo marca su casilla');

  /* En modo real, subir el Excel sube al backend, no le habla al bot desde el
     navegador: el backend es la única fuente de verdad. `api.subirCarga` debe
     armar bien el multipart y devolver el informe del bot tal cual, para que
     aplicarCarga/PorResolver/CabeceraBot lo consuman igual que en modo mock. */
  const api = await servidor.ssrLoadModule('/src/app/servicios/api.js');
  afirmar(api.MODO_API.tipo === 'real' && api.esAreaReal('nutricion'), 'con VITE_API_URL puesto (frontend/.env), Nutrición usa el backend real');

  const fetchOriginal = globalThis.fetch;
  let peticion = null;
  try {
    globalThis.fetch = async (url, opciones) => {
      peticion = { url, opciones };
      return { ok: true, status: 200, text: async () => JSON.stringify({ resultado: 'aceptada', informe: infCorrecto }) };
    };
    const rCarga = await api.subirCarga('nutricion', '2026-08', ejemplos.ejemploCorrecto('2026-08'));
    afirmar(peticion?.url === '/api/reportes/NUT/2026-08/cargas' && peticion.opciones.method === 'POST', 'subirCarga sube al endpoint de carga del backend');
    afirmar(peticion.opciones.body instanceof FormData && !('Content-Type' in (peticion.opciones.headers ?? {})), 'el archivo viaja como multipart, sin Content-Type a mano');
    afirmar(rCarga.ok && rCarga.resultado === 'aceptada' && rCarga.informe.leidas === infCorrecto.leidas, 'subirCarga desempaqueta {resultado, informe} tal cual lo manda el backend');
    afirmar(rCarga.informe.reglas.every((r) => r.estado === 'ok' || r.estado === 'info'), 'el informe que llega del backend es el mismo shape que ya sabe pintar PorResolver/CabeceraBot');

    globalThis.fetch = async () => ({ ok: false, status: 409, text: async () => JSON.stringify({ detail: 'El reporte está en «enviado»: solo se puede subir un archivo mientras se llena.', codigo: 'reporte_no_editable' }) });
    const rBloqueado = await api.subirCarga('nutricion', '2026-08', ejemplos.ejemploCorrecto('2026-08'));
    afirmar(!rBloqueado.ok && rBloqueado.detail?.startsWith('El reporte está'), 'un error de dominio del backend (409/422/503) llega con su detail');

    globalThis.fetch = async () => {
      throw new Error('red caída');
    };
    const rRed = await api.subirCarga('nutricion', '2026-08', ejemplos.ejemploCorrecto('2026-08'));
    afirmar(!rRed.ok && rRed.status === null && Boolean(rRed.detail), 'un fallo de red también trae detail: no se traga en silencio');

    /* Un reporte real trae sus casillas: antes, al enviar, el store se quedaba con
       `datos: {}` y el reporte enviado se veía vacío (esta_avance_01 § 3.1). */
    const respuestas = {
      '/api/reportes/NUT/2026-08': {
        formato: 'NUT', unidad: 'nutricion', periodo: '2026-08', estado: 'remitido', numero_rectificacion: 0, folio_constancia: 'CR-2026-08-NUT',
        fecha_envio: '2026-09-08T10:30:00-05:00', fecha_validacion: null, tiene_carga_aceptada: true,
        hallazgos: { errores: 0, avisos: 1, avisos_sin_justificar: 0, info: 0 }, acciones_disponibles: [], historial: [],
        remisiones: [{ destino: 'planeamiento', es_sin_validar: false, es_vigente: true, numero_rectificacion: 0, fecha: '2026-09-08T10:30:00-05:00' }],
      },
      '/api/reportes/NUT/2026-08/valores': {
        formato: 'NUT', unidad: 'nutricion', periodo: '2026-08',
        cuadros: [{
          cuadro: 'f3', titulo: 'Pacientes · Hospitalización',
          indicadores: [{
            indicador: 'f3.liquida.cena', nombre: 'Dieta líquida · Cena', unidad_medida: 'raciones', dimensiones: {}, total: '110.00', casillas_con_dato: 2, casillas_esperadas: 31,
            casillas: [
              { dia: 1, fecha: '2026-08-01', valor: '10.00', texto_original: null, origen: 'archivo', hoja_excel: 'H', celda_excel: 'C16' },
              { dia: 21, fecha: '2026-08-21', valor: '100.00', texto_original: null, origen: 'archivo', hoja_excel: 'H', celda_excel: 'W16' },
              { dia: 22, fecha: '2026-08-22', valor: null, texto_original: 'cien', origen: 'archivo', hoja_excel: 'H', celda_excel: 'X16' },
            ],
          }],
        }],
      },
      '/api/reportes/NUT/2026-08/revision': {
        formato: 'NUT', unidad: 'nutricion', periodo: '2026-08', estado: 'remitido',
        carga: { archivo: 'Nutricion.xlsx', fecha: '2026-09-08T10:00:00-05:00', version: 'NUT-1', version_bot: '0.2.0', casillas_leidas: 1116, informe: infCorrecto },
        hallazgos: [{ clave: 'atipico|f3|liquida.cena|21', nivel: 'aviso', titulo: 'x', detalle: null, cuadro: 'f3', indicador: 'f3.liquida.cena', dia: 21, justificacion: 'Brote en el piso 3.', fecha_justificacion: null }],
      },
    };
    const pedidas = [];
    globalThis.fetch = async (url, opciones) => {
      pedidas.push({ url, metodo: opciones?.method ?? 'GET', cuerpo: opciones?.body });
      const cuerpo = respuestas[url.split('?')[0]];
      return cuerpo
        ? { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) }
        : { ok: true, status: 200, text: async () => JSON.stringify({ clave: 'x', justificacion: 'y' }) };
    };
    const rSinc = await api.sincronizarReporte('nutricion', '2026-08');
    const traido = store.reporteDe(store.leerEstado().reportes, 'nutricion', '2026-08');
    afirmar(rSinc.ok && traido?.estado === 'remitido', 'sincronizarReporte deja en el store el reporte real');
    afirmar(
      traido.datos.f3['liquida.cena'].length === 31 && traido.datos.f3['liquida.cena'][0] === 10 && traido.datos.f3['liquida.cena'][20] === 100 && traido.datos.f3['liquida.cena'][1] === null,
      'las casillas de /valores llegan al store como datos, día por día, sin rellenar con ceros',
    );
    afirmar(traido.datos.ilegibles['f3|liquida.cena|22'] === 'cien', 'lo ilegible conserva el texto que traía el Excel');
    afirmar(traido.datos.justificaciones['atipico|f3|liquida.cena|21'] === 'Brote en el piso 3.', 'las justificaciones vienen del backend, no de la memoria del navegador');
    afirmar(traido.carga?.leidas === infCorrecto.leidas && JSON.stringify(traido.informe) === JSON.stringify(infCorrecto), 'la carga y el informe vienen de /revision: la revisión se puede volver a pintar sin el bot');

    pedidas.length = 0;
    await api.justificar('nutricion', '2026-08', 'atipico|f3|liquida.cena|21', 'Brote');
    afirmar(
      pedidas[0]?.url === '/api/reportes/NUT/2026-08/hallazgos/atipico%7Cf3%7Cliquida.cena%7C21/justificacion' && pedidas[0].metodo === 'PUT' && JSON.parse(pedidas[0].cuerpo).justificacion === 'Brote',
      'justificar guarda en el backend, con la clave codificada en la URL',
    );

    /* El plazo real no se recalcula en el frontend: sale de `fecha_limite`,
       que ya devuelve GET /api/reportes (la lista). Si avisos.js, Bandeja o
       Cumplimiento volvieran a usar el día 10 fijo del prototipo para un
       área real, dirían «vencido» o «a tiempo» en un día distinto al que ya
       calculó la API para el mismo reporte. */
    globalThis.fetch = async (url) => {
      if (url.split('?')[0] !== '/api/reportes') {
        const cuerpo = respuestas[url.split('?')[0]];
        return cuerpo
          ? { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) }
          : { ok: true, status: 200, text: async () => JSON.stringify({ clave: 'x', justificacion: 'y' }) };
      }
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          total: 1, pagina: 1, por_pagina: 100, paginas: 1,
          filas: [{
            periodo: '2026-08', formato: 'NUT', formato_nombre: 'x', unidad: 'nutricion', unidad_nombre: 'x',
            estado: 'remitido', espera: 'nadie', semaforo: 'vencido', dias_de_retraso: 3,
            // Plazo real de Nutrición a Estadística: día 5 (plazo.default.estadistica), no el día 10 del prototipo.
            fecha_limite: '2026-09-05', fecha_envio: '2026-09-08T10:30:00-05:00', fecha_validacion: null,
            numero_rectificacion: 0, folio_constancia: 'CR-2026-08-NUT',
          }],
        }),
      };
    };
    await api.sincronizarArea('nutricion', ['2026-08']);
    const fechaLimiteGuardada = store.plazoRealDe(store.leerEstado().plazosReales, 'nutricion', '2026-08');
    afirmar(fechaLimiteGuardada === '2026-09-05', 'sincronizarArea guarda el fecha_limite real (día 5), no lo recalcula');
    afirmar(
      periodos.estaVencido('2026-08', '2026-09-08', fechaLimiteGuardada) === true,
      'con el plazo real, el 8 de septiembre ya está vencido para Nutrición',
    );
    afirmar(
      periodos.estaVencido('2026-08', '2026-09-08') === false,
      'sin el plazo real, el día 10 fijo del prototipo diría lo contrario: es la discrepancia que plazoRealDe/plazoEfectivo evitan',
    );
    /* ------------------------------------------ 21. indicadores de desempeño */
    titulo('21. Indicadores de desempeño: menú por permiso, titular dinámico y pantallas con datos');
    {
      const navegacion = await servidor.ssrLoadModule('/src/app/navegacion.js');
      const cabecera = await servidor.ssrLoadModule('/src/app/cabecera.js');
      const dom = await servidor.ssrLoadModule('/src/app/dominio/desempeno.js');
      const ids = (menu) => menu.map((m) => m.id);
      const VER = 'desempeno.ver';
      const CARGAR = 'desempeno.cargar';

      /* El menú lo decide el permiso de la base, y solo con el servidor. */
      afirmar(!ids(navegacion.navDe(roles.ROL.ESTADISTICA, { permisos: [VER] })).includes('desempeno'), 'en el prototipo no hay indicadores: sin servidor no hay HIS que mostrar');
      afirmar(!ids(navegacion.navDe(roles.ROL.ESTADISTICA, { real: true })).includes('desempeno'), 'sin desempeno.ver, Estadística no ve el módulo');
      const menuEst = ids(navegacion.navDe(roles.ROL.ESTADISTICA, { real: true, permisos: [VER] }));
      afirmar(!menuEst.includes('desempeno') && !menuEst.includes('desempeno-carga'), 'Estadística no tiene el Tablero de indicadores (retirado el 07/11/2026: lo mira en Monitoreo Indicadores) ni la carga de datos');
      const menuSup = ids(navegacion.navDe(roles.ROL.ADMIN, { real: true, permisos: [VER, CARGAR] }));
      afirmar(menuSup.at(-1) === 'desempeno-carga' && !menuSup.includes('desempeno') && menuSup.includes('resumen'), 'el superadministrador ve su panel y, al final, la carga de datos; el Tablero ya no');
      afirmar(!ids(navegacion.navDe(roles.ROL.OFICINA, { real: true, permisos: [VER] })).includes('desempeno'), 'una oficina receptora no tiene el módulo aunque tuviera el permiso');
      for (const e of navegacion.NAVEGACION_DESEMPENO) {
        afirmar(registro.has(e.icon) && e.title && e.subtitle && e.construido, `desempeño/${e.id}: icono del registro, título, subtítulo y construido`);
      }

      /* Los datos, con la forma de GET /api/desempeno/* (docs/API_BACKEND.md § 7e). */
      const NUM = [1, 3, 1, 0, 1, 0, 0, 0, 0];
      const DEN = [9, 22, 10, 6, 11, 6, 11, 7, 5];
      let N = 0;
      let D = 0;
      const meses = NUM.map((n, i) => {
        N += n;
        D += DEN[i];
        const mes = i + 1;
        const preliminar = mes === 9;
        return {
          mes, numerador: n, denominador: DEN[i], porcentaje: n / DEN[i], acumulado: { numerador: N, denominador: D, porcentaje: N / D },
          a_tiempo: n, por_corregir: 0, plazo_vigente: preliminar ? 5 : 0, esperando_datos: 0, sin_tratamiento: preliminar ? 0 : DEN[i] - n, por_gestionar: preliminar ? 5 : 0,
          falta_hasta: null,
          estado: mes <= 7 ? 'oficial' : preliminar ? 'preliminar' : 'consolidado',
          apertura_his: `2026-${String(mes + 1).padStart(2, '0')}-12`, cierre_his: `2026-${String(mes + 1).padStart(2, '0')}-21`,
          minsa: mes <= 8 ? { numerador: n, denominador: DEN[i], coincide: true, fecha_corte: mes <= 7 ? '2026-08-08' : null, documento: null, observacion: null } : null,
        };
      });
      const resultado14 = {
        corrida_id: 7, calculado_el: '2026-10-08T10:00:00-05:00', version: '2', fecha_corte: '2026-08-08', mes_con_corte: 7, fecha_fin_observacion: '2026-09-30', datos_hasta: '2026-09-29', meta: 0.7,
        meses, consolidado_hasta: 8, logro: { numerador: 6, denominador: 82, porcentaje: 6 / 82 }, cumplimiento: 6 / 82 / 0.7, diferencia: 6 / 82 - 0.7, cumple_meta: false,
        preliminar: { numerador: 6, denominador: 87, porcentaje: 6 / 87 }, serie: meses.slice(0, 8).map((m) => m.acumulado.porcentaje),
        por_gestionar: { total: 5, vencen_pronto: 1, sin_revisar: 5, en_curso: 0, por_confirmar: 0, no_corresponde: 0 },
        proximo_cierre: '2026-10-21', meses_con_minsa: 8, coinciden_con_minsa: 8,
        excluidos: { primer_tratamiento_paliativo: 22, fallecio_en_plazo: 3 },
        por_categoria: [{ categoria: 'CUELLO_UTERINO', nombre: 'Cuello uterino', numerador: 1, denominador: 41 }, { categoria: 'MAMA', nombre: 'Mama', numerador: 5, denominador: 46 }],
      };
      const fuenteHis = { codigo: 'his_minsa', nombre: 'HIS MINSA', periodicidad: 'mensual', cargable: true, area_responsable: null };
      const fuenteSinadef = { codigo: 'sinadef_hrl', nombre: 'SINADEF', periodicidad: 'mensual', cargable: true, area_responsable: null };
      const fuenteCnv = { codigo: 'cnv', nombre: 'Certificado de Nacido Vivo (CNV)', periodicidad: 'mensual', cargable: false, area_responsable: 'Neonatología' };
      const fichaDe = (numero) => ({
        numero, clave: `ficha_${numero}`, nombre: `Indicador de desempeño número ${numero}`, nombre_corto: numero === 14 ? 'Oportunidad del tratamiento oncológico' : `Indicador ${numero}`,
        dimension: numero === 14 ? 'es' : 'mi', aplica: numero !== 34, motivo_no_aplica: numero === 34 ? 'Corresponde al INEN.' : null, tiene_calculo: numero === 14,
        datos: numero === 34 ? 'no_aplica' : numero === 14 || numero === 18 ? 'completo' : 'parcial', faltan: numero === 34 || numero === 14 || numero === 18 ? [] : [fuenteCnv.nombre],
        fuentes: numero === 14 ? [fuenteHis, fuenteSinadef] : numero === 34 ? [] : [fuenteHis, fuenteCnv],
      });
      const dimensiones = [
        { codigo: 'mi', nombre: 'Materno-infantil y prevención', orden: 1, es_oficial: false },
        { codigo: 'es', nombre: 'Estrategias sanitarias', orden: 2, es_oficial: false },
      ];
      const textos = { exclusion: { primer_tratamiento_paliativo: 'Primer tratamiento paliativo', fallecio_en_plazo: 'Falleció dentro del plazo' }, por_corregir: {}, categoria: {} };
      const ventana = { anio: 2026, mes: 9, apertura: '2026-10-12', cierre: '2026-10-21', abierta: false, faltan: [] };
      const resumen = {
        anio: 2026, hoy: '2026-10-08', anios: [2026], datos_al: '2026-09-30', ventana, dimensiones,
        fichas: Array.from({ length: 34 }, (_, i) => ({ ficha: fichaDe(i + 1), resultado: i + 1 === 14 ? resultado14 : null })), puede_cargar: false, textos,
      };

      /* El titular y las frases salen de los datos, no de un texto fijo. */
      const t = dom.titular(resumen.fichas);
      afirmar(/^1 de 34 fichas tiene resultado\. Oportunidad del tratamiento oncológico está en 6[.,]9 % frente a una meta de 70 %, con meses sin cerrar; 5 casos aún pueden sumar antes del 21\/10\.$/.test(t), 'el titular del catálogo se arma con lo que hay en la base', t);
      const sinNada = dom.titular(resumen.fichas.map((f) => ({ ...f, resultado: null })));
      afirmar(sinNada === 'Ninguna de las 34 fichas tiene resultado todavía.', 'sin cálculos, el titular no inventa un resultado', sinNada);
      afirmar(/enero a septiembre de 2026 con todo lo cargado; cerrado hasta agosto/.test(dom.bajada(resumen)) && /HIS MINSA · SINADEF/.test(dom.bajada(resumen)), 'la bajada dice hasta qué mes hay datos, hasta cuál es definitivo y con qué fuentes', dom.bajada(resumen));
      afirmar(dom.fraccion(null) === 'Sin datos' && dom.textoMeta(null) === 'Meta no definida', 'sin denominador no es 0 %, y sin meta no es meta 0');
      afirmar(/^−62[.,]7 pp$/.test(dom.puntos(resultado14.diferencia)), 'la distancia a la meta va en puntos porcentuales', dom.puntos(resultado14.diferencia));
      const hastaSet = dom.acumuladoHasta(resultado14, 9);
      afirmar(hastaSet.denominador === 87 && hastaSet.preliminar && dom.acumuladoHasta(resultado14, null).denominador === 87 && dom.acumuladoHasta(resultado14, null).preliminar && !dom.acumuladoHasta(resultado14, 8).preliminar, 'sin elegir mes, el acumulado cuenta todo lo cargado y se marca si incluye meses sin cerrar');
      afirmar(/6[.,]9 %, bajo la meta de 70 %\. Incluye meses sin cerrar: puede cambiar\. 5 casos todavía pueden sumar antes del 21\/10\./.test(dom.titularDeFicha({ ficha: fichaDe(14), resultado: resultado14 })), 'el titular de la ficha dice dónde está frente a la meta y qué falta');
      afirmar(dom.textoVentana(ventana, '2026-10-08') === 'Corrección del HIS de septiembre: del 12/10 al 21/10.', 'la ventana de corrección del HIS, en una frase', dom.textoVentana(ventana, '2026-10-08'));
      afirmar(dom.FILTROS.find((f) => f.valor === 'faltan').cumple(resumen.fichas[0]) && !dom.FILTROS.find((f) => f.valor === 'faltan').cumple(resumen.fichas[13]), 'el filtro «Faltan fuentes» reúne las fichas a las que les falta una');

      /* La cabecera: de cuándo son los datos, y la acción solo si lleva a un módulo del menú. */
      const sup = { usuario: { ...usuarios.usuario('admin'), id: 1, permisos: [VER, CARGAR] }, rolActivo: roles.ROL.ADMIN };
      const est = { usuario: { ...usuarios.usuario('est-1'), permisos: [VER] }, rolActivo: roles.ROL.ESTADISTICA };
      for (const [quien, sesion, menu] of [['Estadística', est, menuEst], ['superadministrador', sup, menuSup]]) {
        for (const id of menu.filter((m) => m.startsWith('desempeno'))) {
          const antes = cabecera.bandaDe(sesion, id, { ...store.leerEstado(), hoy: '2026-10-08' });
          afirmar(Boolean(antes?.status?.label && antes.status.detail) && !antes.mascot, `${quien} · ${id}: la banda dice qué es antes de leer`);
        }
      }
      const conFaltas = { anio: 2026, hoy: '2026-10-08', datosAl: '2026-09-30', ventana: { ...ventana, faltan: ['SINADEF'] }, puedeCargar: true };
      const banda = cabecera.bandaDe(sup, 'desempeno-carga', { ...store.leerEstado(), hoy: '2026-10-08', desempeno: conFaltas });
      afirmar(banda.status.label === 'Datos al 30/09/2026' && /Falta cargar SINADEF de septiembre/.test(banda.status.detail), 'la banda dice de cuándo son los datos y qué falta cargar', `${banda.status.label} · ${banda.status.detail}`);
      afirmar(banda.acciones.length === 0, 'en la carga no hay botón que lleve a la carga: ya se está ahí');
      const bandaEst = cabecera.bandaDe(est, 'desempeno-carga', { ...store.leerEstado(), hoy: '2026-10-08', desempeno: { ...conFaltas, puedeCargar: false } });
      afirmar(!bandaEst.acciones.length && !/Falta cargar/.test(bandaEst.status.detail), 'a Estadística no se le pide cargar lo que no puede cargar');

      /* Las pantallas: esqueleto mientras llega del servidor, y con datos se pintan enteras. */
      const { default: CargaPanel, VistaCarga } = await servidor.ssrLoadModule('/src/app/paneles/desempeno/Carga.jsx');
      const { VistaFicha } = await servidor.ssrLoadModule('/src/app/paneles/desempeno/Ficha.jsx');
      afirmar(render('la carga de datos mientras lee', CargaPanel, { irA: () => { } }).includes('aria-busy'), 'la carga de datos espera con esqueleto');
      /* Por trimestre y por mes: la suma de los casos de esos meses, no el acumulado. */
      const q1 = dom.cifraDelPeriodo(resultado14, 'trimestral', 1);
      afirmar(q1.numerador === 5 && q1.denominador === 41 && !q1.preliminar, 'el I trimestre suma los casos de enero a marzo (5 de 41)', JSON.stringify(q1));
      afirmar(dom.cifraDelPeriodo(resultado14, 'trimestral', 3).preliminar && dom.cifraDelPeriodo(resultado14, 'mensual', 2).denominador === 22 && dom.cifraDelPeriodo(resultado14, 'trimestral', 4) === null, 'un trimestre con un mes sin cerrar se marca; uno sin meses no tiene cifra (no es 0 %)');

      const detalle = { anio: 2026, hoy: '2026-10-08', ficha: fichaDe(14), dimensiones, ficha_tecnica: { que_mide: 'Oportunidad', numerador: 'Inician a tiempo', denominador: 'Diagnosticados', exclusiones: 'Paliativos', meta: '70 %', cumplimiento: 'Logro ÷ meta', frecuencia: 'Anual', responsable: 'DPCAN', limitaciones: ['El HIS no ve otras instituciones.'], preguntas: ['¿Quiénes siguen sin tratamiento?'] }, meta: 0.7, resultado: resultado14, datos_al: '2026-09-30', anios: [2026], puede_cargar: false, textos };
      const ficha = render('la ficha 14 con datos', VistaFicha, { datos: detalle, params: {}, irA: () => { } });
      afirmar(ficha.includes('Septiembre 2026') && ficha.includes('Para actuar antes del 21/10') && !ficha.includes('Ver los 5 casos'), 'la ficha abre en el último mes, con lo que se puede hacer y sin repetir el botón de los pacientes');
      afirmar(ficha.includes('Cómo leer este indicador') && ficha.includes('Coincide') && ficha.includes('Meta') && ficha.includes('Logro acumulado (%)') && ficha.includes('Mes del diagnóstico, 2026'), 'la ficha trae su ficha técnica en una pestaña, la comparación con MINSA y el gráfico con la meta y los títulos de sus ejes');
      afirmar(!ficha.includes('Primer tratamiento paliativo') && !ficha.includes('dni'), 'la ficha no lista excluidos ni pide los pacientes al abrirse');
      afirmar(ficha.includes('Pacientes de septiembre 2026') && ficha.includes('Mostrar los pacientes de septiembre'), 'los pacientes del mes elegido están siempre, plegados, para abrirlos cuando se quiera');
      afirmar(ficha.includes('Resultado del mes') && !ficha.includes('>Numerador<') && !ficha.includes('Plazo vigente<'), 'la tabla mes a mes deja solo lo fundamental');
      afirmar((ficha.match(/class="hrl-cuadro( hrl-cuadro--hueco)?"/g) ?? []).length === 5, 'el mes elegido dibuja un cuadro por paciente');
      const agosto = render('la ficha 14 en agosto', VistaFicha, { datos: detalle, params: { mes: '8' }, irA: () => { } });
      afirmar(agosto.includes('Agosto 2026') && agosto.includes('Ninguno de los 7 pacientes') && agosto.includes('Pacientes de agosto 2026'), 'un mes consolidado sin ningún tratado lo dice, y sus pacientes también se pueden ver');
      /* Carga por tramas: a agosto le falta la trama de octubre. Un paciente sin
         tratamiento cuyo plazo no cubren los datos espera, no «venció»; el mes está
         por cerrar y dice qué le falta. */
      const mesesAbiertos = meses.map((m) => (m.mes === 8 ? { ...m, estado: 'por_cerrar', esperando_datos: 1, sin_tratamiento: m.sin_tratamiento - 1, falta_hasta: '2026-10-05' } : m));
      const porCerrar = { ...detalle, resultado: { ...resultado14, meses: mesesAbiertos, consolidado_hasta: 7, logro: { numerador: 6, denominador: 75, porcentaje: 6 / 75 }, cumplimiento: 6 / 75 / 0.7, diferencia: 6 / 75 - 0.7 } };
      const agostoAbierto = render('la ficha 14 con agosto por cerrar', VistaFicha, { datos: porCerrar, params: { mes: '8' }, irA: () => { } });
      afirmar(agostoAbierto.includes('Por cerrar') && agostoAbierto.includes('Se cierra al subir la trama de octubre con datos hasta el 05/10'), 'un mes al que le faltan tramas está por cerrar y dice cuál falta y hasta qué día');
      afirmar(agostoAbierto.includes('Esperando datos') && agostoAbierto.includes('Acumulado, enero–septiembre') && /6[.,]9 %/.test(agostoAbierto) && agostoAbierto.includes('Ya cerrado, enero–julio') && /8[.,]0 %/.test(agostoAbierto), 'quien espera datos no figura como vencido; el acumulado cuenta todo lo cargado y lo ya cerrado va aparte');
      afirmar((agostoAbierto.match(/class="hrl-cuadro( hrl-cuadro--hueco)?"/g) ?? []).length === 7, 'los cuadros del mes siguen siendo uno por paciente, con el que espera datos');
      /* Solo la trama de enero: hay datos, pero ningún mes cerrado. Se dibuja el tablero, sin logro y sin 0 %. */
      const soloEnero = { ...detalle, resultado: { ...resultado14, meses: [{ ...meses[0], estado: 'por_cerrar', esperando_datos: 8, sin_tratamiento: 0, falta_hasta: '2026-03-09', minsa: null }], consolidado_hasta: 0, logro: null, cumplimiento: null, diferencia: null, cumple_meta: null, preliminar: meses[0].acumulado, serie: [], por_gestionar: { ...resultado14.por_gestionar, total: 0, vencen_pronto: 0, sin_revisar: 0 }, meses_con_minsa: 0, coinciden_con_minsa: 0 } };
      const conEnero = render('la ficha 14 con solo la trama de enero', VistaFicha, { datos: soloEnero, params: {}, irA: () => { } });
      afirmar(conEnero.includes('Acumulado, enero–enero') && /11[.,]1 %/.test(conEnero) && conEnero.includes('incluye meses sin cerrar') && conEnero.includes('Para cerrar enero') && conEnero.includes('Enero 2026') && conEnero.includes('Esperando datos') && conEnero.includes('trama de marzo'), 'con solo enero cargado se muestra la cifra provisional, marcada, y se dice qué trama falta');
      afirmar(dom.titular([{ ficha: fichaDe(14), resultado: soloEnero.resultado }, ...Array.from({ length: 33 }, (_, i) => ({ ficha: fichaDe(i + 1 === 14 ? 34 : i + 1), resultado: null }))]).includes('con meses sin cerrar'), 'el titular distingue «sin datos» de «con datos y sin meses cerrados»');
      const sinResultado = render('una ficha sin resultado', VistaFicha, { datos: { ...detalle, ficha: fichaDe(1), resultado: null, ficha_tecnica: null }, params: {}, irA: () => { } });
      afirmar(sinResultado.includes('Faltan fuentes') && sinResultado.includes('Certificado de Nacido Vivo') && !/[^0-9,.]0 %/.test(sinResultado.replace('no es 0 %', '')), 'una ficha sin resultado dice qué fuente le falta y no muestra 0 %');

      const meses12 = (estado) => Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, estado: i < 8 ? 'cierre' : i === 8 ? estado : 'futuro', carga: i < 9 ? { filas: 30000, archivo: 'trama.csv', huella: 'a'.repeat(64), fecha_extraccion: '2026-09-30T00:00:00', cargado_el: '2026-10-01T09:00:00', cargado_por: 'superadmin' } : null, versiones: 1 }));
      const dosFuentes = [{ codigo: 'his_minsa', nombre: 'HIS MINSA' }, { codigo: 'sinadef_hrl', nombre: 'SINADEF' }];
      const porSubir = [
        { anio: 2026, mes: 9, fuentes: dosFuentes, cargado: true, disponible: true, pasos: [{ desde: '2026-10-01', disponible: true, cierra: [], definitiva: false }, { desde: '2026-10-21', disponible: false, cierra: [], definitiva: true }] },
        { anio: 2026, mes: 11, fuentes: dosFuentes, cargado: false, disponible: false, pasos: [{ desde: '2026-11-02', disponible: false, cierra: [9], definitiva: false }] },
      ];
      const fuentesDatos = {
        anio: 2026, hoy: '2026-10-08', ventana, por_subir: porSubir, fuentes: [
          { ...fuenteHis, descripcion: null, formato: 'CSV', fichas: [14], meses: meses12('preliminar'), verificadas: null },
          { ...fuenteSinadef, descripcion: null, formato: 'XLS', fichas: [14, 19], meses: meses12('falta'), verificadas: null },
          { ...fuenteCnv, descripcion: null, formato: null, fichas: [3, 6], meses: [], verificadas: null },
        ]
      };
      const leida = (datos) => ({ datos, cargando: false, error: null, recargar: () => { } });
      const carga = render('la carga de datos con datos', VistaCarga, { resumen: leida({ ...resumen, puede_cargar: true }), fuentes: leida(fuentesDatos), historial: leida([]), referencias: leida([]), recargarTodo: () => { }, irA: () => { } });
      afirmar(carga.includes('Meses cargados de cada fuente') && carga.includes('Falta'), 'la carga muestra los meses de cada fuente y lo que falta');
      afirmar(carga.includes('Fuentes por obtener') && carga.includes('Ver las 1') && !carga.includes('Neonatología'), 'las fuentes por obtener van plegadas: se dice cuántas son y se abren a pedido');
      afirmar(carga.includes('Qué subir') && carga.includes('1 mes ya se puede subir') && carga.includes('Ya se puede') && carga.includes('reemplaza lo cargado'), 'la lista «qué subir» dice qué archivo ya se puede subir');
      afirmar(carga.includes('Desde el 01/10: completa el mes.') && carga.includes('Desde el 21/10: queda como definitiva.') && carga.includes('Desde el 02/11: cierra septiembre.'), 'cada archivo dice desde qué día sirve descargarlo y para qué');
      /* Fallecidos verificados y retirar una carga. */
      const unaCarga = (mes, extra = {}) => ({ lote_mes_id: mes, fuente: 'his_minsa', fuente_nombre: 'HIS MINSA', anio: 2026, mes, archivo: `trama_${mes}.csv`, huella: 'b'.repeat(64), fecha_extraccion: null, filas: 30000, version: 1, vigente: true, cargado_el: '2026-10-01T09:00:00', cargado_por: 'superadmin', retirada_el: null, ...extra });
      const unaVerificada = { id: 1, numero_documento: '00000000', fecha_defuncion: '2026-06-20', fecha_registro: null, origen: 'SINADEF nacional', fecha_verificacion: '2026-10-01', observacion: null, anotada_el: '2026-10-01T09:00:00' };
      const conTodo = render('la carga con fallecidos e historial', VistaCarga, { resumen: leida({ ...resumen, puede_cargar: true }), fuentes: leida(fuentesDatos), historial: leida([unaCarga(5), unaCarga(4, { vigente: false, retirada_el: '2026-10-02T10:00:00' })]), referencias: leida([]), verificadas: leida([unaVerificada]), recargarTodo: () => { }, irA: () => { } });
      afirmar(conTodo.includes('Fallecidos verificados') && conTodo.includes('1 persona') && conTodo.includes('Corregir la defunción de 00000000') && conTodo.includes('Retirar la defunción de 00000000'), 'los fallecidos verificados tienen su apartado: agregar, corregir y retirar');
      afirmar(conTodo.includes('Retirar HIS MINSA de Mayo') && !conTodo.includes('Retirar HIS MINSA de Abril') && conTodo.includes('Retirada'), 'una carga vigente se puede retirar; la ya retirada lo dice y no ofrece retirarla otra vez');
      afirmar(carga.includes('Todavía no hay ninguna defunción verificada a mano'), 'sin fallecidos verificados, su apartado lo dice');
      const seguidos = [1, 2, 3, 4, 5, 6];
      afirmar(dom.consecuenciaDeRetirar({ fuente: 'his_minsa', mes: 5 }, seguidos, 2026).includes('solo calcula hasta abril') && dom.consecuenciaDeRetirar({ fuente: 'his_minsa', mes: 1 }, seguidos, 2026).includes('se queda sin resultado'), 'antes de retirar una trama se dice hasta dónde calculará el año');
      afirmar(dom.consecuenciaDeRetirar({ fuente: 'his_minsa', mes: 8 }, seguidos, 2026).includes('no cambia') && dom.consecuenciaDeRetirar({ fuente: 'sinadef_hrl', mes: 5 }, seguidos, 2026).includes('vuelve al denominador'), 'retirar un mes fuera de la serie no cambia el cálculo; retirar SINADEF devuelve gente al denominador');
      const { avisosDe } = await servidor.ssrLoadModule('/src/app/avisos.js');
      const { ROL } = await servidor.ssrLoadModule('/src/app/dominio/roles.js');
      const comoAdmin = { usuario: {}, rolActivo: ROL.ADMIN };
      afirmar(avisosDe({}, comoAdmin, [], '2026-10-08', {}, {}, { puedeCargar: true, porSubir: 2 }).some((a) => a.title.includes('2 archivos ya se pueden subir')) && avisosDe({}, comoAdmin, [], '2026-10-08', {}, {}, { puedeCargar: true, porSubir: 0 }).length === 0 && avisosDe({}, comoAdmin, [], '2026-10-08', {}, {}, { puedeCargar: false, porSubir: 2 }).length === 0, 'la campana avisa a quien carga cuando ya se puede subir algo, y solo entonces');
      const cargaAlDia = render('la carga sin nada que subir', VistaCarga, { resumen: leida({ ...resumen, puede_cargar: true }), fuentes: leida({ ...fuentesDatos, por_subir: [] }), historial: leida([]), referencias: leida([]), recargarTodo: () => { }, irA: () => { } });
      afirmar(cargaAlDia.includes('No hace falta subir nada por ahora'), 'sin nada pendiente, la lista lo dice en vez de quedar vacía');
      afirmar(carga.includes('Lo publicado por MINSA') && carga.includes('Septiembre 2026') && !carga.includes('Octubre 2026'), 'MINSA se registra solo para meses ya terminados');
    }
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  /* Con el backend, Estadística no ve nada inventado: el almacén arranca vacío,
     solo cuentan las áreas que reportan por el sistema, y un mes anterior al
     primer reporte de un área no es una deuda suya. */
  {
    const cabecera = await servidor.ssrLoadModule('/src/app/cabecera.js');
    const sesionEst = { usuario: usuarios.usuario('est-1'), rolActivo: roles.ROL.ESTADISTICA };
    api.prepararAlmacen();
    const vacio = store.leerEstado();
    afirmar(vacio.reportes.length === 0 && vacio.remisionesDiresa.length === 0 && Object.keys(vacio.propios).length === 0, 'en modo real el almacén arranca sin reportes, remisiones ni datos propios simulados');
    store.reiniciarDatos();
    afirmar(store.leerEstado().reportes.length === 0, 'reiniciar en modo real no vuelve a sembrar datos simulados');
    /* Antes se daba por hecho que solo Nutrición: si la configuración no llegaba, las otras ocho
       salían como fuera del sistema y nada las recuperaba. */
    afirmar(api.areasDelFlujo().length === 9 && api.areasFueraDelFlujo().length === 0, 'mientras el servidor no diga qué áreas reportan, no se saca a ninguna de las cuentas');
    const semaforo = cabecera.bandaDe(sesionEst, 'semaforo', { ...store.leerEstado(), hoy: '2026-10-05' });
    afirmar(semaforo.status.label === '0 de 9 áreas entregaron', 'Cumplimiento vacío cuenta las nueve áreas', semaforo.status.label);
    const diresa = cabecera.bandaDe(sesionEst, 'diresa', { ...store.leerEstado(), hoy: '2026-10-05' });
    afirmar(diresa.status.tone !== 'warning' && /septiembre/.test(diresa.status.detail), 'sin registro de DIRESA en el servidor, no se inventa un plazo vencido de meses pasados');

    // Agosto enviado de verdad: es el primer periodo de Nutrición, y no espera a Estadística.
    store.sincronizarReportesReales('nutricion', ['2026-08'], [{ id: 'nutricion:2026-08', area: 'nutricion', periodo: '2026-08', estado: 'remitido', enviadoEn: '2026-09-11T09:00', datos: {}, historial: [] }]);
    afirmar(store.primerPeriodoDe(store.leerEstado().reportes, 'nutricion') === '2026-08', 'el primer periodo de Nutrición es el de su primer reporte real');
    const bandejaAgo = cabecera.bandaDe(sesionEst, 'revision', { ...store.leerEstado(), hoy: '2026-10-05' });
    afirmar(!/por revisar/.test(bandejaAgo.status.label), 'la bandeja ya no avisa de reportes por revisar: el bot los validó');
    /* El panel del superadministrador: con el servidor, Administración tiene sus
       diez módulos, cada uno con su cabecera, y cada pantalla carga sin romperse. */
    const navegacion = await servidor.ssrLoadModule('/src/app/navegacion.js');
    const menuSuper = navegacion.navDe(roles.ROL.ADMIN, { real: true });
    afirmar(menuSuper.map((m) => m.id).join() === 'resumen,funcionamiento,cuentas,unidades-hospitalizacion,plazos,areas,personalizacion,cobertura,bitacora,soporte', 'con el servidor, Administración es el panel del superadministrador');
    afirmar(navegacion.navDe(roles.ROL.ADMIN).some((m) => m.id === 'bot'), 'en el prototipo, Administración sigue con sus herramientas de demostración');
    const superadmin = { usuario: { ...usuarios.usuario('admin'), id: 1 }, rolActivo: roles.ROL.ADMIN };
    for (const m of menuSuper) {
      const banda = cabecera.bandaDe(superadmin, m.id, { ...store.leerEstado(), hoy: '2026-10-05' });
      afirmar(Boolean(banda?.status?.label && banda.status.detail) && !banda.mascot, `superadministrador · ${m.id}: la banda dice su estado, sin mascota`);
    }
    const PANTALLAS = { resumen: 'Resumen', funcionamiento: 'Funcionamiento', cuentas: 'Cuentas', 'unidades-hospitalizacion': 'UnidadesHospitalizacion', plazos: 'Plazos', areas: 'Areas', personalizacion: 'Personalizacion', bitacora: 'Bitacora', soporte: 'Soporte' };
    for (const [id, archivo] of Object.entries(PANTALLAS)) {
      const { default: Pantalla } = await servidor.ssrLoadModule(`/src/app/paneles/superadmin/${archivo}.jsx`);
      const html = render(`la pantalla ${id} del superadministrador`, Pantalla, { sesion: superadmin, reportes: [], irA: () => { } });
      afirmar(html.includes('aria-busy'), `${id}: mientras llega del servidor, esqueleto y no una pantalla en blanco`);
    }
    /* El consolidado anual: solo para las áreas que lo llevan, y en el prototipo
       sale de los reportes entregados del almacén. */
    afirmar(navegacion.navDe(roles.ROL.AREA, { area: 'nutricion' }).some((m) => m.id === 'consolidado'), 'Nutrición tiene su consolidado anual en el menú');
    afirmar(!navegacion.navDe(roles.ROL.AREA, { area: null }).some((m) => m.id === 'consolidado'), 'una cuenta de área sin área asignada no ve el consolidado');
    afirmar(['imagenes', 'epidemiologia'].every((a) => navegacion.navDe(roles.ROL.AREA, { area: a }).some((m) => m.id === 'consolidado')), 'Imágenes y Epidemiología ven su consolidado anual');
    afirmar(['consolidado-imagenes', 'consolidado-epidemiologia'].every((id) => navegacion.navDe(roles.ROL.ESTADISTICA).some((m) => m.id === id)), 'Estadística tiene el consolidado de Imágenes y el de Epidemiología');
    afirmar(navegacion.navDe(roles.ROL.ESTADISTICA).some((m) => m.id === 'consolidado'), 'Estadística ve el consolidado de Nutrición');
    api.prepararAlmacen(false);
    const totales = await api.totalesDelAnio('nutricion', '2026', store.leerEstado().reportes);
    afirmar(totales.ok && totales.meses.length > 0 && totales.meses.every((m) => m.totales.f1 > 0), 'en el prototipo, el consolidado sale de los meses entregados del almacén');
    const botMod = await servidor.ssrLoadModule('/src/app/servicios/bot-validador.js');
    const hecho = botMod.consolidado('nutricion', '2026', totales.meses);
    afirmar(hecho?.nombre === 'Nutricion_TOTAL_2026.xlsx' && hecho.consolidado.general.filter((v) => v != null).length === totales.meses.length, 'el bot arma el TOTAL con esos meses, y los demás quedan vacíos');
    afirmar(botMod.consolidado('mantenimiento', '2026', []) === null, 'un área que el bot no lee no arma consolidado');
    for (const a of ['imagenes', 'epidemiologia']) {
      const sembrados = store.leerEstado().reportes.filter((r) => r.area === a && r.periodo.startsWith('2026-') && r.datos && Object.keys(r.datos).length);
      const c = botMod.consolidado(a, '2026', sembrados.map((r) => ({ periodo: r.periodo, datos: r.datos })));
      afirmar(c?.bytes?.length > 0 && c.consolidado.conDato.some(Boolean), `el bot arma el consolidado de ${a} con los meses del almacén`);
    }
    afirmar(api.areasDelFlujo().length === 9 && store.leerEstado().reportes.length > 0, 'de vuelta al prototipo: las nueve áreas y sus datos sembrados');
  }

  store.reiniciarDatos();

  /* --------------------------------------------- 20. alertas reales en el cajón */
  titulo('20. Las alertas reales de Nutrición llegan al cajón de notificaciones');

  const avisosMod = await servidor.ssrLoadModule('/src/app/avisos.js');
  const sesionNut = { usuario: usuarios.usuario('area-nutricion'), rolActivo: 'area' };
  const ALERTA_BACKEND = { clave: 'semana_incompleta|3-9', nivel: 'aviso', titulo: 'Semana del 3 al 9: sin ningún dato en 7 días.', cuerpo: 'No hay ninguna casilla registrada el días 3, 4, 5, 6, 7, 8, 9 de este mes.' };

  /* Al volver a entrar, el mes ya entregado llega primero como resumen de la lista, sin su
     remisión. Leerla sin comprobarlo tumbaba la aplicación entera. */
  const delResumen = [{ id: `nutricion:${periodos.PERIODO_VIGENTE}`, area: 'nutricion', periodo: periodos.PERIODO_VIGENTE, estado: 'remitido', remision: null, resumen: true, datos: {}, historial: [] }];
  afirmar(avisosMod.avisosDe(delResumen, sesionNut, [], periodos.HOY, {}, {}).some((a) => a.id === 'remitido'), 'un mes entregado que aún es resumen, sin remisión, no rompe los avisos');
  const sinAlertas = avisosMod.avisosDe(REPORTES_INICIALES, sesionNut, [], periodos.HOY, {}, {});
  afirmar(!sinAlertas.some((a) => a.id === 'semana_incompleta|3-9'), 'sin alertas del backend, el cajón no inventa ninguna');

  const conAlertas = avisosMod.avisosDe(REPORTES_INICIALES, sesionNut, [], periodos.HOY, {}, { [`nutricion:${periodos.PERIODO_VIGENTE}`]: [ALERTA_BACKEND] });
  const traducida = conAlertas.find((a) => a.id === 'semana_incompleta|3-9');
  afirmar(Boolean(traducida), 'una alerta real del backend aparece en el cajón de Nutrición');
  afirmar(traducida?.title === ALERTA_BACKEND.titulo && traducida?.body === ALERTA_BACKEND.cuerpo, 'la alerta real conserva su título y su cuerpo tal cual los mandó el backend');

  const conNivelDesconocido = avisosMod.avisosDe(
    REPORTES_INICIALES, sesionNut, [], periodos.HOY, {},
    { [`nutricion:${periodos.PERIODO_VIGENTE}`]: [{ ...ALERTA_BACKEND, nivel: 'nuevo-nivel-del-backend' }] },
  );
  afirmar(
    !conNivelDesconocido.some((a) => a.id === 'semana_incompleta|3-9'),
    'un nivel de alerta que avisos.js no conoce se descarta, sin romper el resto del cajón',
  );

  /* ----------------------------------------- 21. Laboratorio: carga mensual */
  titulo('21. Laboratorio: plantilla, bot validador, pantallas y casillas mensuales');
  store.reiniciarDatos();
  {
    const lev = await servidor.ssrLoadModule('/src/app/datos/formatos/levantados.js');
    const lab = await servidor.ssrLoadModule('/src/app/datos/formatos/laboratorio.js');
    const labCalc = await servidor.ssrLoadModule('/src/app/datos/formatos/laboratorio-calculos.js');
    const labEjemplos = await servidor.ssrLoadModule('/src/app/servicios/ejemplos-laboratorio.js');
    const botLab = await servidor.ssrLoadModule('/src/app/servicios/bot-validador.js');
    const resumen = await servidor.ssrLoadModule('/src/app/datos/formatos/resumen.js');
    const labUsuario = usuarios.usuario('area-laboratorio');

    const formulario = lev.formularioDe('laboratorio');
    afirmar(formulario?.carga && !formulario.digitable && formulario.formatos.length === lab.CUADROS.length, 'Laboratorio está levantado: se llena subiendo su Excel, sin digitar, una sección por cuadro');
    const pasos = lev.pasosDe('laboratorio', {}, '2026-09', { errores: [], avisos: [], info: [] });
    afirmar(pasos[0].title === 'Bioquímica' && pasos.every((p) => p.status === 'empty'), 'sus pasos se nombran por sección, no «Formato N»');
    afirmar(lab.cuadro('metaxenicas').procedencias[2].clave === 'programa' && lab.cuadro('actividades').procedencias.length === 1, 'Metaxénicas cuenta «Programa» en su tercera columna y el resumen solo su total');
    const casillasDelMes = lab.CUADROS.reduce((n, c) => n + c.filas.filter((f) => !c.examenes.find((e) => e.clave === f.examen).ocasional).length, 0);

    const correcto = await botLab.validarArchivo(labEjemplos.ejemploCorrecto('2026-09'), { area: 'laboratorio', periodo: '2026-09', pausa: 0 });
    afirmar(!correcto.bloqueo && correcto.errores.length === 0 && correcto.leidas === casillasDelMes, 'el ejemplo correcto pasa por el bot embebido sin errores', `${correcto.bloqueo?.titulo ?? ''} ${(correcto.errores ?? []).map((e) => e.titulo).join(' | ')}`);
    const conErrores = await botLab.validarArchivo(labEjemplos.ejemploConErrores('2026-09'), { area: 'laboratorio', periodo: '2026-09', pausa: 0 });
    const reglasRotas = new Set((conErrores.errores ?? []).map((e) => e.regla));
    afirmar(['no-numerico', 'incompleto', 'total-fila'].every((r) => reglasRotas.has(r)), 'el ejemplo con errores trae letras, una casilla vacía y un total tecleado', [...reglasRotas].join(', '));
    afirmar(conErrores.datos?.banco_sangre['plasma_fresco.convenio'] === null, 'la casilla vacía llega como null, no como 0');
    const deOtroMes = await botLab.validarArchivo(labEjemplos.ejemploCorrecto('2026-08'), { area: 'laboratorio', periodo: '2026-09', pausa: 0 });
    afirmar(deOtroMes.bloqueo?.id === 'plantilla-periodo', 'un libro sin la hoja de setiembre no se carga como reporte de setiembre');
    const delAnioPasado = await botLab.validarArchivo(labEjemplos.ejemploCorrecto('2025-09'), { area: 'laboratorio', periodo: '2026-09', pausa: 0 });
    afirmar(delAnioPasado.bloqueo?.id === 'hoja-de-otro-anio', 'una hoja de setiembre que todavía dice 2025 se rechaza: el libro no se sobrescribió');

    /* La corrección con Dr. Mochi: el ejemplo con errores se corrige con sus
       propuestas, se devuelve el MISMO libro y el bot lo acepta al subirlo. */
    const archivoConErrores = labEjemplos.ejemploConErrores('2026-09');
    const abiertoLab = await botLab.abrirCorreccion(archivoConErrores, { area: 'laboratorio', periodo: '2026-09' });
    const origenLab = abiertoLab.informe.origen;
    const celdaLab = (k) => (origenLab[k] ? `${origenLab[k].columna}${origenLab[k].fila}` : null);
    const explicaciones = abiertoLab.informe.errores.map((h) => botLab.explicarHallazgo(h, { celda: celdaLab }));
    afirmar(explicaciones.every((e) => e.conclusion && e.causas.length), 'Dr. Mochi explica cada error del ejemplo, con su causa');
    const propuestas = Object.assign({}, ...explicaciones.map((e) => e.causas.find((c) => c.sugerencia)?.sugerencia.cambios ?? {}));
    const revisadoLab = botLab.revalidarCorreccion('laboratorio', abiertoLab.informe.datos, propuestas, { origen: origenLab, periodo: '2026-09' });
    afirmar(abiertoLab.hoja === 'SET' && revisadoLab.informe.errores.length === 0, 'con las propuestas de Dr. Mochi el ejemplo queda sin errores', revisadoLab.informe.errores.map((e) => e.titulo).join(' | '));
    const corregidoLab = await botLab.excelCorregido('laboratorio', abiertoLab, revisadoLab.datos, archivoConErrores.name);
    afirmar(corregidoLab.nombre.endsWith('_corregido.xlsx') && Object.keys(corregidoLab.celdas).length > 0, 'el libro corregido conserva el nombre del archivo y solo cambia las celdas corregidas');
    const resubidoLab = await botLab.validarArchivo(botLab.comoArchivo(corregidoLab.bytes, corregidoLab.nombre), { area: 'laboratorio', periodo: '2026-09', pausa: 0 });
    afirmar(!resubidoLab.bloqueo && resubidoLab.errores.length === 0, 'el libro corregido, subido de nuevo, pasa el bot sin errores');

    /* El diálogo va en un portal, que el render del servidor no pinta: se
       prueba la pieza que pide el libro y que el módulo cargue. */
    const moduloCorreccion = await servidor.ssrLoadModule('/src/app/paneles/reporte/Correccion.jsx');
    afirmar(typeof moduloCorreccion.default === 'function', 'la corrección de Laboratorio carga como componente');
    const pedirLibro = render('la corrección de Laboratorio sin archivo', moduloCorreccion.ElegirArchivo, { periodo: '2026-07', onArchivo() { } });
    afirmar(pedirLibro.includes('Elegir el archivo'), 'sin el archivo a mano (la página se recargó), la corrección pide elegir el archivo (Excel o Word)');
    afirmar(botLab.archivoRecordado('laboratorio', '2026-07') === null, 'un mes sin archivo subido en la sesión no tiene libro que corregir');
    botLab.recordarArchivo('laboratorio', '2026-09', archivoConErrores);
    afirmar(botLab.archivoRecordado('laboratorio', '2026-09') === archivoConErrores, 'el archivo subido en la sesión queda a mano para corregirlo sin pedirlo');

    /* 21/10/2026: el error se ve en su hoja, como en Excel, con la propuesta
       de Dr. Mochi y lo corregido dentro de la misma celda. */
    const moduloHoja = await servidor.ssrLoadModule('/src/app/paneles/reporte/HojaEnVista.jsx');
    const valoresHoja = { A3: 'Especialidad', D3: 'PROGRAMADA', A5: 'Cirugías mayores', D5: 240, A6: 'Cirugías menores', D6: 54, D7: 294, A40: 'Otra cosa', D40: 9 };
    const marcasHoja = new Map([
      ['D7', { casilla: 't', papel: 'total', etiqueta: 'Total', ahora: 294, formula: true }],
      ['D5', { casilla: 'a', papel: 'sumando', etiqueta: 'Mayores', ahora: 240, propuesta: 233 }],
      ['D6', { casilla: 'b', papel: 'sumando', etiqueta: 'Menores', ahora: 50, antes: 54, cambio: true, autor: 'mochi' }],
    ]);
    const hojaVista = render('la hoja alrededor del error', moduloHoja.HojaEnVista, { titulo: 'RESUMEN', valores: valoresHoja, marcas: marcasHoja, elegida: 'a', onElegir() { } });
    afirmar(hojaVista.includes('RESUMEN') && hojaVista.includes('Cirugías mayores') && hojaVista.includes('PROGRAMADA'), 'la hoja muestra su nombre, sus rótulos y la cabecera de la columna del error');
    afirmar(hojaVista.includes('→ 233') && hojaVista.includes('<s>54</s>'), 'la celda muestra la propuesta de Dr. Mochi («→ 233») y lo corregido tachando lo que decía');
    afirmar(!hojaVista.includes('Otra cosa'), 'las filas que no tienen que ver con el error se pliegan');
    const barra = render('la barra de la celda', moduloHoja.BarraDeCelda, { refCelda: 'D5', hoja: 'RESUMEN', m: { ...marcasHoja.get('D5'), editable: true }, doc: 'Excel', onCambiar() { } });
    afirmar(barra.includes('D5') && barra.includes('Su Excel') && !barra.includes('<input'), 'la barra nombra la celda elegida y lo que dice su Excel, sin campo para escribir: las cifras cambian con los botones');

    /* 22/10/2026: lo primero es QUÉ NO COINCIDE, en cifras (la balanza), y
       debajo los arreglos con las celdas que cambian; el porqué, en tooltips. */
    const propuestaCq = { texto: 'Corregir las de emergencia del RESUMEN', cambios: { 'resumen|mayores.emergencia': 170 } };
    const lado = (titulo, celdas, resultado) => ({ titulo, celdas, resultado });
    const comparacionCq = {
      clave: 'mayor',
      titulo: 'Cirugías mayores',
      izquierda: lado('RESUMEN', [{ casilla: 'p', ref: 'D5', etiqueta: 'Programadas', valor: 240 }, { casilla: 'e', ref: 'E5', etiqueta: 'Emergencia', valor: 177 }], 417),
      derecha: lado('CIRUGIA MAYOR', [{ casilla: 's', ref: 'D164', etiqueta: 'Suma de especialidades', valor: 410 }], 410),
    };
    const explicacionCq = {
      conclusion: 'El RESUMEN y las hojas por especialidad no dicen lo mismo.',
      comparaciones: [comparacionCq],
      causas: [
        { grupo: 'mayor', texto: 'Si la hoja está bien, el error está en las de emergencia del RESUMEN.', sugerencia: propuestaCq },
        { grupo: 'mayor', texto: 'Si el RESUMEN está bien, búsquelas en la hoja.', detalle: true },
        { texto: 'Las dos son correctas.', confirmar: true },
      ],
    };
    const propsPregunta = {
      h: { titulo: 'El RESUMEN y las hojas no coinciden', nivel: 'aviso' }, numeroDeError: 1, total: 2, estado: 'pendiente', explicacion: explicacionCq,
      comparaciones: [comparacionCq], celdasDelError: [], clavePropuesta: JSON.stringify(propuestaCq.cambios),
      cambiosDe: () => [{ casilla: 'e', ref: 'E5', antes: 177, ahora: 170 }], arreglo: [], doc: 'Excel',
      onAplicar() { }, onPrevia() { }, onConfirmar() { }, onDetalle() { },
    };
    const pregunta = render('el error a la vista', moduloCorreccion.Pregunta, propsPregunta);
    afirmar(pregunta.includes('≠') && pregunta.includes('417') && pregunta.includes('410') && pregunta.includes('CIRUGIA MAYOR') && pregunta.includes('+7'), 'lo primero es la balanza: RESUMEN 417 ≠ CIRUGIA MAYOR 410, con la diferencia (+7)');
    afirmar(pregunta.includes('Aplicar') && pregunta.includes('E5') && pregunta.includes('Ver especialidades') && pregunta.includes('Es correcto'), 'debajo, los arreglos con la celda que cambia (E5 177 › 170), buscar en la hoja o confirmar');
    afirmar(!pregunta.includes('Si la hoja está bien'), 'el porqué de cada arreglo no va a la vista: va en su tooltip');
    const cuadrada = { ...comparacionCq, izquierda: lado('RESUMEN', comparacionCq.izquierda.celdas, 410) };
    const respondida = render('el error resuelto', moduloCorreccion.Pregunta, { ...propsPregunta, estado: 'resuelto', comparaciones: [cuadrada], arreglo: [{ casilla: 'e', ref: 'E5', antes: 177, ahora: 170, deshacible: true }], siguiente: 'Siguiente: error 2', onDeshacer() { }, onSiguiente() { } });
    /* Los otros dos tipos: lo mal escrito (con lo que sobra marcado) y las casillas sin dato. */
    const escritura = render('una cifra mal escrita', moduloCorreccion.Pregunta, {
      ...propsPregunta,
      h: { titulo: '«12a» no es un número', nivel: 'error' },
      explicacion: { tipo: 'escritura', causas: [{ texto: 'Se coló una letra.', sugerencia: { texto: 'Poner 12', cambios: { e: 12 } } }] },
      comparaciones: null,
      celdasDelError: [{ casilla: 'e', ref: 'D5', etiqueta: 'Producción del mes · Cirugías mayores · programada', valor: '12a', propuesta: 12 }],
    });
    afirmar(escritura.includes('Escrito') && escritura.includes('<mark class="hrl-escrito__sobra">a</mark>') && escritura.includes('Debería ser') && escritura.includes('Tiene letras'), 'una cifra mal escrita: lo escrito con la letra marcada, lo que debería ser y el motivo');
    const faltan = render('casillas sin dato', moduloCorreccion.Pregunta, {
      ...propsPregunta,
      h: { titulo: 'Faltan 2 casillas', nivel: 'error' },
      explicacion: { tipo: 'faltan', causas: [{ texto: 'Si no hubo, escriba 0.', sugerencia: { texto: 'Poner 0 en las 2 casillas vacías', cambios: { a: 0, b: 0 } } }] },
      comparaciones: null,
      celdasDelError: [{ casilla: 'a', ref: 'D7', etiqueta: 'Causas · Falta de tiempo', valor: null, propuesta: 0 }, { casilla: 'b', ref: 'D8', etiqueta: 'Causas · Paciente ausente', valor: null }],
    });
    afirmar(faltan.includes('2 de 2 casillas sin dato') && faltan.includes('hrl-vacias__celda--propuesta') && faltan.includes('vacía'), 'casillas sin dato: cuántas faltan y cada una como recuadro vacío, con la propuesta (→ 0)');
    afirmar(respondida.includes('hrl-balanza--igual') && respondida.includes('Resuelto') && respondida.includes('Deshacer') && respondida.includes('Siguiente: error 2') && !respondida.includes('Aplicar'), 'resuelto, la balanza queda en = y ofrece deshacer o seguir; no salta sola');

    /* 12/10/2026: se corrige solo en el formulario. Finalizar aplica lo
       corregido al reporte sin ofrecer descargar el Excel ni pedir «Subir y
       reemplazar» (eso confundía: nadie estaba subiendo nada). */
    const fuenteCorreccion = readFileSync(join(RAIZ, 'src/app/paneles/reporte/Correccion.jsx'), 'utf8');
    afirmar(!fuenteCorreccion.includes('Descargar el Excel corregido') && !fuenteCorreccion.includes('descargar('), 'la corrección ya no ofrece descargar el Excel corregido');
    for (const panel of ['nutricion/ReporteNutricion.jsx', 'laboratorio/ReporteLaboratorio.jsx']) {
      const fuente = readFileSync(join(RAIZ, 'src/app/paneles/reporte', panel), 'utf8');
      afirmar(fuente.includes('subir(archivo, { corregidas })') && fuente.includes('!confirmado && !corregidas'), `${panel}: finalizar la corrección carga sin el diálogo de reemplazo`);
    }
    afirmar(
      moduloCorreccion.avisoDeCorreccion(3, { errores: [], avisos: [] }) === 'Corrección aplicada al reporte: 3 celdas corregidas. El bot volvió a revisarlo: sin observaciones.',
      'al aplicar la corrección, el aviso dice cuántas celdas cambiaron y qué dijo el bot',
    );

    /* La misma corrección, en Nutrición: su ejemplo con errores, explicado y corregido. */
    const nutEjemplos = await servidor.ssrLoadModule('/src/app/servicios/ejemplos-nutricion.js');
    const conErroresNut = nutEjemplos.ejemploConErrores('2026-08');
    const abiertoNut = await botLab.abrirCorreccion(conErroresNut, { area: 'nutricion', periodo: '2026-08' });
    afirmar(!abiertoNut.informe.bloqueo && abiertoNut.informe.errores.length > 0, 'la corrección de Nutrición abre su libro con los errores del bot');
    const origenNut = abiertoNut.informe.origen;
    const celdaNut = (k) => (origenNut[k] ? `${origenNut[k].columna}${origenNut[k].fila}` : null);
    const explicacionesNut = abiertoNut.informe.errores.map((h) => botLab.explicarHallazgo(h, { celda: celdaNut }));
    afirmar(explicacionesNut.every((e) => e.conclusion), 'Dr. Mochi explica cada error de Nutrición');
    const propuestasNut = Object.assign({}, ...explicacionesNut.map((e) => e.causas.find((c) => c.sugerencia)?.sugerencia.cambios ?? {}));
    const revisadoNut = botLab.revalidarCorreccion('nutricion', abiertoNut.informe.datos, propuestasNut, { origen: origenNut, periodo: '2026-08' });
    afirmar(Object.keys(propuestasNut).length > 0 && revisadoNut.informe.errores.length < abiertoNut.informe.errores.length, 'las propuestas de Dr. Mochi corrigen errores de Nutrición en el formulario', `${abiertoNut.informe.errores.length} → ${revisadoNut.informe.errores.length}`);
    const corregidoNut = await botLab.excelCorregido('nutricion', abiertoNut, revisadoNut.datos, conErroresNut.name);
    const resubidoNut = await botLab.validarArchivo(botLab.comoArchivo(corregidoNut.bytes, corregidoNut.nombre), { periodo: '2026-08', pausa: 0 });
    afirmar(!resubidoNut.bloqueo && resubidoNut.errores.length === revisadoNut.informe.errores.length, 'lo corregido en el formulario de Nutrición llega al reporte tal como el bot lo revisó');

    /* Las alertas también se revisan con Dr. Mochi (12/10/2026): se corrigen o se
       confirman; ya no hay un campo para escribir la justificación. */
    const alertaNut = abiertoNut.informe.avisos.find((h) => h.regla === 'atipico');
    afirmar(Boolean(alertaNut) && alertaNut.valor != null && alertaNut.referencia != null, 'la alerta de día atípico trae su cifra y lo habitual de la fila', JSON.stringify(alertaNut));
    if (alertaNut) {
      const explicaAlerta = botLab.explicarHallazgo({ ...alertaNut, nivel: 'aviso' }, { celda: celdaNut });
      afirmar(explicaAlerta.cuenta && explicaAlerta.causas.some((c) => /confírmela/.test(c.texto)), 'Dr. Mochi explica la alerta y ofrece confirmarla si es real');
      afirmar(botLab.correccionDe('nutricion').casillasDelHallazgo(alertaNut).editables.length === 1, 'la alerta señala su casilla para corregirla en el formulario');
    }
    afirmar(moduloCorreccion.TEXTO_CONFIRMADA.includes('Dr. Mochi'), 'una alerta confirmada queda justificada con un texto que dice cómo se revisó');
    const { default: PorResolverNut } = await servidor.ssrLoadModule('/src/app/paneles/reporte/nutricion/PorResolver.jsx');
    const informeAlerta = { errores: [], avisos: [{ id: 'atipico|f3|liquida.cena|21', regla: 'atipico', formato: 'f3', fila: 'liquida.cena', dia: 21, titulo: '100 raciones' }], info: [] };
    const sinRevisar = render('alertas por revisar', PorResolverNut, { informe: informeAlerta, datos: {} });
    afirmar(sinRevisar.includes('Revisar con Dr. Mochi') && !sinRevisar.includes('Justificación'), 'la lista de lo que falta ya no pide escribir una justificación');
    const revisada = render('alerta confirmada', PorResolverNut, { informe: informeAlerta, datos: { justificaciones: { 'atipico|f3|liquida.cena|21': moduloCorreccion.TEXTO_CONFIRMADA } } });
    afirmar(revisada.includes('Confirmada'), 'una alerta confirmada con Dr. Mochi se muestra como confirmada');
    const { default: LecturaNut } = await servidor.ssrLoadModule('/src/app/paneles/reporte/nutricion/Lectura.jsx');
    const soloAlertas = render('solo alertas pendientes', LecturaNut, { revisando: false, vacio: false, archivo: 'x.xlsx', errores: 0, pendientes: 1, listo: false, onEnviar: () => {}, onCorregir: () => {} });
    afirmar(soloAlertas.includes('Revisar con Dr. Mochi'), 'con solo alertas pendientes, Dr. Mochi ofrece revisarlas');

    const cifra = resumen.cifraPrincipal('laboratorio', { datos: correcto.datos }, '2026-09');
    const banco = labCalc.totalCuadro(correcto.datos, 'banco_sangre');
    const actividades = labCalc.totalCuadro(correcto.datos, 'actividades') ?? 0;
    afirmar(cifra?.etiqueta === 'Exámenes del mes' && cifra.valor === labCalc.totalGeneral(correcto.datos) - banco - actividades, 'la cifra del mes son los exámenes, sin las unidades de Banco de Sangre ni las actividades');

    /* La correspondencia con DIRESA: cada examen del libro va a una casilla o a
       la lista de lo que DIRESA no pide, una sola vez; y lo que va a DIRESA más
       lo que no (privado, convenio, insolvencia y SIN_DIRESA) es el total del mes. */
    const usados = [...Object.values(labCalc.DIRESA_LABORATORIO).flatMap((g) => Object.values(g).flat()), ...labCalc.SIN_DIRESA].map(([sec, ex]) => `${sec}.${ex}`);
    const todos = lab.CUADROS.flatMap((c) => c.examenes.map((e) => `${c.id}.${e.clave}`));
    afirmar(usados.length === todos.length && todos.every((t) => usados.includes(t)), 'cada examen del libro va a una sola casilla de DIRESA, o a ninguna a propósito', `${usados.length} de ${todos.length}`);
    const SERV = ['hosp', 'emerg', 'ce'];
    const enDiresa = Object.entries(labCalc.DIRESA_LABORATORIO).reduce((n, [g, items]) => n + Object.keys(items).reduce((m, it) => m + SERV.reduce((k, sv) => k + (labCalc.valorDiresaLaboratorio(correcto.datos, g, it, sv) ?? 0), 0), 0), 0);
    const pci = ['privado', 'convenio', 'insolvencia'];
    const fuera = lab.CUADROS.reduce((n, c) => n + c.examenes.reduce((m, e) => m + pci.reduce((k, p) => k + (labCalc.valor(correcto.datos, c.id, `${e.clave}.${p}`) ?? 0), 0), 0), 0);
    const sinDiresa = labCalc.SIN_DIRESA.reduce((n, [sec, ex]) => n + (labCalc.totalExamen(correcto.datos, sec, ex) ?? 0) - pci.reduce((k, p) => k + (labCalc.valor(correcto.datos, sec, `${ex}.${p}`) ?? 0), 0), 0);
    afirmar(enDiresa + fuera + sinDiresa === labCalc.totalGeneral(correcto.datos), 'la sección A de DIRESA, más privado, convenio e insolvencia, más lo que DIRESA no pide, es el total del mes: nada se pierde ni se duplica');
    afirmar(
      labCalc.valorDiresaLaboratorio(correcto.datos, 'anatomia', 'orina', 'emerg') === labCalc.valor(correcto.datos, 'uro_parasitologicos', 'examen_orina.emergencia'),
      'el examen completo de orina va aparte, en Anatomía Patológica de DIRESA, como pide el formato',
    );

    /* El consolidado anual: la suma de los meses entregados, casilla por casilla. */
    const consol = botLab.consolidado('laboratorio', '2026', [{ periodo: '2026-08', datos: correcto.datos }, { periodo: '2026-09', datos: correcto.datos }], {});
    afirmar(consol?.nombre === 'Laboratorio_CONSOLIDADO_2026.xlsx' && consol.consolidado.conDato.filter(Boolean).length === 2, 'el consolidado de Laboratorio se arma con los meses entregados');
    afirmar(consol.consolidado.datos.bioquimica['glucosa.emergencia'] === 2 * correcto.datos.bioquimica['glucosa.emergencia'], 'cada casilla del consolidado es la suma de esa casilla en cada mes');
    afirmar(consol.consolidado.secciones[0].porMes[0] === null, 'un mes sin reporte queda vacío en el consolidado, no en cero');
    const { default: ConsolidadoAnual } = await servidor.ssrLoadModule('/src/app/paneles/ConsolidadoAnual.jsx');
    const htmlConsol = render('el consolidado de Laboratorio', ConsolidadoAnual, { claveArea: 'laboratorio', reportes: REPORTES_INICIALES });
    afirmar(htmlConsol.includes('examen por examen') && htmlConsol.includes('Descargar el consolidado'), 'el consolidado de Laboratorio se ve con la forma del libro y se puede descargar');

    const { SERIES } = await servidor.ssrLoadModule('/src/app/paneles/inicio/InicioLaboratorio.jsx');
    afirmar(
      SERIES.flatMap((s) => s.claves).sort().join() === lab.PROCEDENCIAS_DEL_REPORTE.filter((p) => p.clave !== 'total').map((p) => p.clave).sort().join(),
      'el gráfico de Inicio cubre todas las procedencias de los exámenes, ninguna queda fuera',
    );

    /* Las pantallas. Septiembre ya está sembrado como entregado: para verlo por
       llenar, sin ese reporte; para verlo en revisión, con un borrador cargado. */
    const sinSeptiembre = store.leerEstado().reportes.filter((r) => !(r.area === 'laboratorio' && r.periodo === '2026-09'));
    const htmlCarga = render('el reporte de Laboratorio en borrador', Reporte, { reportes: sinSeptiembre, usuario: labUsuario });
    afirmar(htmlCarga.includes('Suba el Excel de septiembre 2026') && !htmlCarga.includes('digitar en la hoja'), 'Laboratorio entra por la carga del Excel, sin la opción de digitar');
    afirmar(htmlCarga.includes('Su libro del año, con una hoja por mes'), 'la pantalla pide el libro del año, del que se lee la hoja del mes');

    const borrador = { id: 'laboratorio:2026-09', area: 'laboratorio', periodo: '2026-09', estado: 'borrador', datos: conErrores.datos, carga: { archivo: conErrores.archivo, origen: conErrores.origen }, historial: [] };
    const htmlRevision = render('la revisión de Laboratorio', Reporte, { reportes: [...sinSeptiembre, borrador], usuario: labUsuario });
    afirmar(htmlRevision.includes('Bioquímica') && htmlRevision.includes('Continuar al envío'), 'con el Excel cargado, abre en la revisión, con sus secciones');
    afirmar(htmlRevision.includes('C. Ext.') && htmlRevision.includes('Total de la sección'), 'la tabla de la sección lleva sus procedencias y su total');

    /* Otros meses y el libro completo: el área elige el mes, y un solo libro
       carga cada mes que sigue en borrador, sin tocar los que ya entregó. */
    const htmlConMeses = render('el reporte de Laboratorio con selector de mes', Reporte, { reportes: sinSeptiembre, usuario: labUsuario, irA: () => { } });
    afirmar(htmlConMeses.includes('Mes del reporte') && htmlConMeses.includes('Enero 2026'), 'el área puede abrir cualquier mes del año, desde enero');
    afirmar(htmlConMeses.includes('Actualizar varios meses con el libro completo'), 'la carga ofrece subir el libro completo para varios meses');
    const libro = await servidor.ssrLoadModule('/src/app/paneles/reporte/CargaDeMeses.jsx');
    const libroDelAnio = labEjemplos.ejemploCorrecto('2026-09');
    const delLibro = await botLab.mesesDelArchivo(libroDelAnio, { area: 'laboratorio', anio: '2026', hasta: '2026-09' });
    afirmar(delLibro.meses.length >= 1 && !delLibro.problema, 'el bot reconoce los meses del libro del año', JSON.stringify(delLibro));
    const detectadosLab = [{ archivo: libroDelAnio, meses: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], descartados: [] }];
    const plan = libro.planDe([...sinSeptiembre, borrador], 'laboratorio', detectadosLab);
    afirmar(plan.length === 9 && plan[0].periodo === '2026-01' && plan.at(-1).periodo === '2026-09', 'el libro completo abarca de enero al mes vigente');
    afirmar(
      plan.every((m) => (m.accion === 'omitir') === est.estaEntregado(m.estado)),
      'un mes que ya salió del área no se toca; los demás se cargan',
      plan.map((m) => `${m.periodo}:${m.estado}:${m.accion}`).join(' '),
    );
    afirmar(plan.find((m) => m.periodo === '2026-09').accion === 'reemplazar', 'un borrador con cifras se marca para reemplazar, y por eso se confirma');
    afirmar(plan.find((m) => m.periodo === '2026-01').accion === 'cargar', 'un mes sin reporte se carga sin más');
    const enero = await libro.cargarMes('laboratorio', labEjemplos.ejemploCorrecto('2026-01'), '2026-01', 'Prueba de humo');
    afirmar(enero.resultado === 'aceptado' && store.reporteDe(store.leerEstado().reportes, 'laboratorio', '2026-01')?.estado === 'borrador', 'cargar un mes pasado lo deja en borrador, con lo leído', JSON.stringify(enero));
    const eneroMalo = await libro.cargarMes('laboratorio', labEjemplos.ejemploCorrecto('2026-03'), '2026-01', 'Prueba de humo');
    afirmar(eneroMalo.resultado === 'rechazado', 'un libro sin la hoja del mes se informa como rechazado y el mes queda como estaba');
    store.reiniciarDatos();

    /* 22/10/2026: cargar meses pasados de una vez está en las siete áreas que
       suben su archivo, no solo en Nutrición y Laboratorio; en Word para
       Farmacia y Nefrología. */
    for (const panel of ['nutricion/ReporteNutricion.jsx', 'laboratorio/ReporteLaboratorio.jsx', 'lavanderia/ReporteLavanderia.jsx', 'centro-quirurgico/ReporteCentroQuirurgico.jsx', 'ginecologia/ReporteGinecologia.jsx', 'ReporteWord.jsx']) {
      const fuente = readFileSync(join(RAIZ, 'src/app/paneles/reporte', panel), 'utf8');
      afirmar(fuente.includes('<CargaDeMeses'), `${panel}: ofrece cargar meses pasados de una vez`);
    }
    const cargaWord = render('cargar meses pasados de Farmacia', libro.default, { area: 'farmacia', reportes: [], vigente: '2026-09', usuario: { nombre: 'Prueba' } });
    afirmar(cargaWord.includes('Elegir los Word de los meses') && cargaWord.includes('accept=".docx,'), 'Farmacia elige sus Word (.docx), varios a la vez');
    const cargaNef = render('cargar meses pasados de Nefrología', libro.default, { area: 'nefrologia', reportes: [], vigente: '2026-09', usuario: { nombre: 'Prueba' } });
    afirmar(cargaNef.includes('Subir el cuadro completo'), 'Nefrología sube su cuadro del año (Word), una columna por mes');
    const cargaCqx = render('cargar meses pasados de Centro Quirúrgico', libro.default, { area: 'centro-quirurgico', reportes: [], vigente: '2026-09', usuario: { nombre: 'Prueba' } });
    afirmar(cargaCqx.includes('Elegir los Excel de los meses'), 'Centro Quirúrgico elige un Excel por mes, varios a la vez');

    /* Nutrición también carga meses pasados: un Excel por mes, varios a la vez, y
       el bot dice de qué mes es cada uno. Antes solo trabajaba el mes vigente, y
       el Excel de enero subido en septiembre se rechazaba sin salida. */
    {
      const nutEj = await servidor.ssrLoadModule('/src/app/servicios/ejemplos-nutricion.js');
      const marzo = nutEj.ejemploCorrecto('2026-03');
      const deMarzo = await botLab.mesesDelArchivo(marzo, { area: 'nutricion', anio: '2026', hasta: '2026-09' });
      afirmar(deMarzo.meses.join() === '2026-03' && !deMarzo.problema, 'el bot reconoce de qué mes es un Excel de Nutrición', JSON.stringify(deMarzo));
      const futuro = await botLab.mesesDelArchivo(nutEj.ejemploCorrecto('2026-11'), { area: 'nutricion', anio: '2026', hasta: '2026-09' });
      afirmar(futuro.meses.length === 0, 'un mes que todavía no termina no se ofrece para cargar');
      const deOtraArea = await botLab.mesesDelArchivo(labEjemplos.ejemploCorrecto('2026-03'), { area: 'nutricion', anio: '2026', hasta: '2026-09' });
      afirmar(deOtraArea.problema?.id === 'plantilla', 'el libro de otra área se rechaza con su motivo');

      const reportesNut = store.leerEstado().reportes;
      const planNut = libro.planDe(reportesNut, 'nutricion', [{ archivo: marzo, meses: ['2026-03'], descartados: [] }, { archivo: nutEj.ejemploCorrecto('2026-03'), meses: ['2026-03'], descartados: [] }]);
      afirmar(planNut.length === 2 && planNut.filter((m) => m.accion === 'omitir').length === 2, 'un mes ya entregado no se toca, y uno repetido en la tanda tampoco', planNut.map((m) => `${m.periodo}:${m.accion}`).join(' '));
      store.descartarReporte('nutricion', '2026-03');
      const apiNut = await servidor.ssrLoadModule('/src/app/servicios/api.js');
      if (apiNut.esAreaReal('nutricion')) {
        /* Con el servidor, el mes pasado se sube a su propio periodo. */
        const fetchAntes = globalThis.fetch;
        const pedidas = [];
        globalThis.fetch = async (url) => {
          pedidas.push(url);
          return { ok: false, status: 503, text: async () => JSON.stringify({ detail: 'sin servidor en la prueba' }) };
        };
        try {
          await libro.cargarMes('nutricion', marzo, '2026-03', 'Prueba de humo');
        } finally {
          globalThis.fetch = fetchAntes;
        }
        afirmar(pedidas[0] === '/api/reportes/NUT/2026-03/cargas', 'Nutrición sube un mes pasado a su propio periodo en el servidor', pedidas.join(' '));
      } else {
        const marzoCargado = await libro.cargarMes('nutricion', marzo, '2026-03', 'Prueba de humo');
        afirmar(marzoCargado.resultado === 'aceptado' && store.reporteDe(store.leerEstado().reportes, 'nutricion', '2026-03')?.estado === 'borrador', 'Nutrición carga un mes pasado y lo deja en borrador', JSON.stringify(marzoCargado));
      }
      const otro = await libro.otroMesDelArchivo('nutricion', nutEj.ejemploCorrecto('2026-02'), '2026-09', '2026-09', store.leerEstado().reportes);
      afirmar(otro?.periodo === '2026-02', 'un Excel de otro mes subido en el mes vigente se ofrece para cargarlo en su mes', JSON.stringify(otro));

      const htmlNutMeses = render('el reporte de Nutrición con selector de mes', Reporte, { reportes: store.leerEstado().reportes, usuario: usuarios.usuario('area-nutricion'), irA: () => {} });
      afirmar(htmlNutMeses.includes('Mes del reporte') && htmlNutMeses.includes('Cargar meses pasados'), 'Nutrición puede abrir otro mes y cargar meses pasados');
      store.reiniciarDatos();
    }

    const { default: Inicio } = await servidor.ssrLoadModule('/src/app/paneles/Inicio.jsx');
    const htmlInicio = render('el inicio de Laboratorio', Inicio, { reportes: REPORTES_INICIALES, usuario: labUsuario, irA: () => { } });
    afirmar(htmlInicio.includes('Exámenes por mes') && htmlInicio.includes('Banco de Sangre'), 'el inicio de Laboratorio tiene su tablero, con Banco de Sangre aparte');

    const { SECCIONES_LABORATORIO } = await servidor.ssrLoadModule('/src/app/paneles/reporte/laboratorio/Secciones.jsx');
    const htmlVisor = render('una sección de Laboratorio en el visor de Estadística', SECCIONES_LABORATORIO.banco_sangre, { datos: correcto.datos, periodo: '2026-09' });
    afirmar(htmlVisor.includes('Banco de Sangre') && htmlVisor.includes('en unidades'), 'el visor de Estadística muestra cada sección en solo lectura, con su unidad');

    const cabeceraLab = await servidor.ssrLoadModule('/src/app/cabecera.js');
    const banda = cabeceraLab.bandaDe({ usuario: labUsuario, rolActivo: 'area' }, 'inicio', { reportes: sinSeptiembre, hoy: periodos.HOY });
    afirmar(banda?.acciones.some((a) => a.texto === 'Subir el Excel') && !banda.acciones.some((a) => a.texto === 'Llenar a mano'), 'la cabecera de Laboratorio ofrece subir el Excel, no llenar a mano');

    /* Modo real: las casillas de /valores de un formato mensual llegan como una
       cifra por casilla, no como una lista de días. */
    const fetchOriginal = globalThis.fetch;
    const informeGuardado = { ...correcto, datos: { ...correcto.datos, escritos: { filas: { 'bioquimica|glucosa': 99 }, secciones: {}, general: null } } };
    const casillaMensual = (indicador, valor, texto) => ({
      indicador, nombre: 'x', unidad_medida: 'exámenes', dimensiones: {}, total: valor, casillas_con_dato: valor == null ? 0 : 1, casillas_esperadas: 1,
      casillas: valor == null && texto == null ? [] : [{ dia: null, fecha: null, valor, texto_original: texto ?? null, origen: 'archivo', hoja_excel: 'Reporte Estadístico', celda_excel: 'C9' }],
    });
    const respuestas = {
      '/api/configuracion': { nombre_sistema: 'x', mensaje_ingreso: null, aviso: null, preferencias: null, areas_en_flujo: [{ clave: 'nutricion', formato: 'NUT' }, { clave: 'laboratorio', formato: 'LAB' }] },
      '/api/reportes/LAB/2026-08': {
        formato: 'LAB', unidad: 'laboratorio', periodo: '2026-08', estado: 'borrador', numero_rectificacion: 0, folio_constancia: null, fecha_envio: null, fecha_validacion: null,
        tiene_carga_aceptada: true, hallazgos: { errores: 0, avisos: 0, avisos_sin_justificar: 0, info: 0 }, acciones_disponibles: [], historial: [], remisiones: [],
      },
      '/api/reportes/LAB/2026-08/valores': {
        formato: 'LAB', unidad: 'laboratorio', periodo: '2026-08',
        cuadros: [{
          cuadro: 'bioquimica', titulo: 'Bioquímica',
          indicadores: [
            casillaMensual('bioquimica.glucosa.emergencia', '42.00'),
            casillaMensual('bioquimica.glucosa.privado', null, 'cien'),
            casillaMensual('bioquimica.glucosa.convenio', null),
          ],
        }],
      },
      '/api/reportes/LAB/2026-08/revision': {
        formato: 'LAB', unidad: 'laboratorio', periodo: '2026-08', estado: 'borrador',
        carga: { archivo: 'Laboratorio_2026-08.xlsx', fecha: '2026-09-08T10:00:00-05:00', version: 'LAB-1', version_bot: '0.2.0', casillas_leidas: 294, informe: informeGuardado },
        hallazgos: [],
      },
    };
    try {
      globalThis.fetch = async (url) => {
        const cuerpo = respuestas[url.split('?')[0]];
        return cuerpo ? { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) } : { ok: false, status: 404, text: async () => '{}' };
      };
      await api.cargarConfiguracion();
      afirmar(api.esAreaReal('laboratorio'), 'con LAB-1 activa en el servidor, Laboratorio usa el backend real');
      api.prepararAlmacen();
      const r = await api.sincronizarReporte('laboratorio', '2026-08');
      const traido = store.reporteDe(store.leerEstado().reportes, 'laboratorio', '2026-08');
      afirmar(r.ok && traido?.datos.bioquimica['glucosa.emergencia'] === 42, 'una casilla mensual llega como su cifra, no como una lista de días');
      afirmar(traido?.datos.bioquimica['glucosa.convenio'] === null, 'una casilla sin dato llega como null, no como 0');
      afirmar(traido?.datos.ilegibles['bioquimica|glucosa.privado'] === 'cien', 'lo ilegible conserva el texto, con la clave de casilla mensual');
      afirmar(traido?.datos.escritos?.filas['bioquimica|glucosa'] === 99, 'los totales escritos en el Excel llegan del informe guardado');
    } finally {
      // De vuelta a lo que el resto de la prueba espera: solo Nutrición en el servidor, y el prototipo.
      globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ nombre_sistema: 'x', areas_en_flujo: [{ clave: 'nutricion', formato: 'NUT' }] }) });
      await api.cargarConfiguracion();
      globalThis.fetch = fetchOriginal;
      api.prepararAlmacen(false);
      store.reiniciarDatos();
    }
  }

  /* ------------------------------------- 22. Farmacia con el servidor */
  titulo('22. Farmacia con el servidor: el Word se sube a la API y las cifras vuelven de la base');
  {
    const apiF = await servidor.ssrLoadModule('/src/app/servicios/api.js');
    const storeF = await servidor.ssrLoadModule('/src/app/datos/store.js');
    const usuariosF = await servidor.ssrLoadModule('/src/app/datos/usuarios.js');
    const { default: ReporteF } = await servidor.ssrLoadModule('/src/app/paneles/Reporte.jsx');
    const { totalAtenciones: totalAt } = await servidor.ssrLoadModule('/src/app/datos/formatos/farmacia-calculos.js');
    const ejemplosF = await servidor.ssrLoadModule('/src/app/servicios/ejemplos-farmacia.js');
    const botF = await servidor.ssrLoadModule('/src/app/servicios/bot-validador.js');
    const informe = await botF.validarArchivo(ejemplosF.ejemploCorrecto('2026-09'), { area: 'farmacia', periodo: '2026-09', pausa: 0 });
    informe.avisos = [{ id: 'rotulos|f1', regla: 'rotulos', formato: 'f1', titulo: 'El Word tiene un rótulo con el año equivocado', detalle: '«ENERO 2024».' }];
    const plano = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? plano(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
    const cuadros = ['f1', 'f2', 'f3'].map((c) => ({
      cuadro: c, titulo: c,
      indicadores: plano(informe.datos[c]).map(([fila, v]) => ({ indicador: `${c}.${fila}`, nombre: fila, unidad_medida: 'atenciones', dimensiones: {}, total: String(v), casillas_con_dato: 1, casillas_esperadas: 1, casillas: [{ dia: null, fecha: null, valor: `${v}.00`, texto_original: null, origen: 'archivo', hoja_excel: 'Tabla 1 del Word', celda_excel: 'C4' }] })),
    }));
    const respuestas = {
      '/api/configuracion': { nombre_sistema: 'x', areas_en_flujo: [{ clave: 'nutricion', formato: 'NUT' }, { clave: 'farmacia', formato: 'FAR' }] },
      '/api/reportes/FAR/2026-09': { formato: 'FAR', unidad: 'farmacia', periodo: '2026-09', estado: 'borrador', numero_rectificacion: 0, folio_constancia: null, fecha_envio: null, fecha_validacion: null, tiene_carga_aceptada: true, hallazgos: { errores: 0, avisos: 1, avisos_sin_justificar: 1, info: 0 }, acciones_disponibles: ['enviar'], historial: [], remisiones: [] },
      '/api/reportes/FAR/2026-09/valores': { formato: 'FAR', unidad: 'farmacia', periodo: '2026-09', cuadros },
      '/api/reportes/FAR/2026-09/revision': { formato: 'FAR', unidad: 'farmacia', periodo: '2026-09', estado: 'borrador', carga: { archivo: 'informe.docx', fecha: '2026-10-05T10:00:00-05:00', version: 'FAR-W1', version_bot: '0.2.0', casillas_leidas: informe.leidas, informe }, hallazgos: [{ clave: 'rotulos|f1', nivel: 'aviso', titulo: 'x', detalle: null, justificacion: null }] },
      '/api/reportes/FAR/2026-09/cargas': { resultado: 'aceptada', informe },
      '/api/oficinas/epidemiologia/recibidos': {
        oficina: 'epidemiologia', total: 2, pagina: 1, por_pagina: 100, paginas: 1,
        filas: [
          { periodo: '2026-09', formato: 'NEF', formato_nombre: 'x', unidad: 'nefrologia', unidad_nombre: 'x', estado_de_recepcion: 'validada', constancia: 'CR-2026-09-NEF', remisiones: [{ constancia: 'CR-2026-09-NEF', es_sin_validar: false, es_vigente: true, numero_rectificacion: 0, fecha: '2026-10-05T10:00:00-05:00' }] },
          { periodo: '2026-08', formato: 'CQX', formato_nombre: 'x', unidad: 'centro-quirurgico', unidad_nombre: 'x', estado_de_recepcion: 'desactualizada', constancia: 'CR-2026-08-CQX', remisiones: [{ constancia: 'CR-2026-08-CQX', es_sin_validar: false, es_vigente: false, numero_rectificacion: 0, fecha: '2026-09-05T10:00:00-05:00' }] },
        ],
      },
    };
    const fetchOriginal = globalThis.fetch;
    let subida = null;
    try {
      globalThis.fetch = async (url, opciones) => {
        if (url.includes('/cargas')) subida = { url, metodo: opciones?.method };
        const cuerpo = respuestas[url.split('?')[0]];
        return cuerpo ? { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) } : { ok: false, status: 404, text: async () => '{}' };
      };
      await apiF.cargarConfiguracion();
      afirmar(apiF.esAreaReal('farmacia'), 'con FAR-W1 activa en el servidor, Farmacia es un área real');
      apiF.prepararAlmacen();
      const rSub = await apiF.subirCarga('farmacia', '2026-09', ejemplosF.ejemploCorrecto('2026-09'));
      afirmar(rSub.ok && subida?.url === '/api/reportes/FAR/2026-09/cargas' && subida.metodo === 'POST', 'el Word se sube al endpoint de cargas de Farmacia');
      const rSync = await apiF.sincronizarReporte('farmacia', '2026-09');
      const traido = storeF.reporteDe(storeF.leerEstado().reportes, 'farmacia', '2026-09');
      afirmar(rSync.ok && traido?.datos?.f1?.sis?.hosp === informe.datos.f1.sis.hosp, 'las cifras planas del servidor vuelven anidadas (f1.sis.hosp)', JSON.stringify(traido?.datos?.f1?.sis));
      afirmar(totalAt(traido.datos.f1) === totalAt(informe.datos.f1), 'el total de atenciones traído del servidor es el del Word');
      afirmar(traido.carga?.archivo?.nombre && traido.informe?.avisos?.length === 1, 'el reporte trae su carga y su informe guardados');
      const htmlReal = render('Farmacia con el servidor', ReporteF, { reportes: storeF.leerEstado().reportes, usuario: usuariosF.usuario('area-farmacia'), periodo: '2026-09' });
      afirmar(htmlReal.includes('Revisar y resolver') && htmlReal.includes('Subir el Word'), 'con el servidor, Farmacia sigue los mismos tres pasos');
      const htmlRealCarga = render('Farmacia con el servidor, al subir', ReporteF, { reportes: storeF.leerEstado().reportes, usuario: usuariosF.usuario('area-farmacia'), periodo: '2026-08' });
      afirmar(!htmlRealCarga.includes('Ejemplo correcto') && htmlRealCarga.includes('Solo .docx'), 'con el servidor no se ofrecen los ejemplos: solo el Word real');
      afirmar(!htmlReal.includes('aria-label="Hospitalización"') || htmlReal.includes('disabled=""'), 'con el servidor, las casillas no se editan a mano');

      /* Lo que una oficina recibió de un área ajena: su lista no lo trae, y sincronizar áreas no debe borrarlo. */
      const previosRecibidos = storeF.leerEstado().reportes;
      await apiF.sincronizarRecibidos('epidemiologia');
      const recibidosEpi = storeF.leerEstado().recibidos;
      afirmar(recibidosEpi?.length === 2 && storeF.leerEstado().reportes === previosRecibidos, 'lo recibido va en su propio espacio, sin tocar los reportes del área');
      const recepcionesEpi = storeF.recepcionesDe(recibidosEpi, 'epidemiologia');
      afirmar(recepcionesEpi.find((r) => r.reporte.area === 'nefrologia')?.estado === 'vigente' && recepcionesEpi.find((r) => r.reporte.area === 'centro-quirurgico')?.estado === 'desactualizada', 'cada fila dice si lo recibido sigue vigente, y un mes reabierto queda como desactualizado');
      afirmar(storeF.reportesRecibidosPor(recibidosEpi, 'epidemiologia').length === 1, 'la cabecera y los avisos no cuentan como recibido lo que se reabrió');
      const Recibidos = (await servidor.ssrLoadModule('/src/app/paneles/oficina/ReportesRecibidos.jsx')).default;
      const htmlHistorico = render('el histórico de Epidemiología con servidor', Recibidos, { historico: true, reportes: recibidosEpi, oficina: 'epidemiologia' });
      afirmar(htmlHistorico.includes('Nefrología') && htmlHistorico.includes('CR-2026-09-NEF') && htmlHistorico.includes('Desactualizada') && htmlHistorico.includes('se reabrió'), 'el histórico lista lo recibido, su constancia y avisa de lo reabierto');
      storeF.fijarRecibidos(null);

      /* La pérdida de Gineco-Obstetricia (03/11/2026): sin formato activo en el servidor, subió
         y envió contra el almacén del navegador, con constancia, y al recargar no quedaba nada. */
      const ReporteTodas = (await servidor.ssrLoadModule('/src/app/paneles/Reporte.jsx')).default;
      const usuarioGin = usuariosF.usuario('area-ginecologia');
      afirmar(apiF.motivoSinServidor('ginecologia') === 'fuera-del-flujo', 'con servidor, un área sin formato activo no puede guardar, y se sabe');
      afirmar(apiF.motivoSinServidor('farmacia') === null, 'un área con formato activo sí puede');
      const htmlSinFormato = render('Gineco-Obstetricia sin formato en el servidor', ReporteTodas, { reportes: [], usuario: usuarioGin, periodo: '2026-09' });
      afirmar(htmlSinFormato.includes('no puede recibir reportes') && !htmlSinFormato.includes('Subir el Excel'), 'sin formato activo no se ofrece subir nada');
      const previos = storeF.leerEstado().reportes.length;
      const sinGuardar = await apiF.transicionar('ginecologia', '2026-09', 'crear', { actor: 'x', rol: 'area' });
      afirmar(!sinGuardar.ok && sinGuardar.detail && storeF.leerEstado().reportes.length === previos, 'una transición de un área sin formato falla y no deja nada en el almacén');
    } finally {
      globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ nombre_sistema: 'x', areas_en_flujo: [{ clave: 'nutricion', formato: 'NUT' }] }) });
      await apiF.cargarConfiguracion();
      globalThis.fetch = fetchOriginal;
      apiF.prepararAlmacen(false);
      storeF.reiniciarDatos();
    }
  }

  /* ------------------------------- 22b. Un solo recorrido y lo recibido */
  titulo('22b. Las nueve áreas siguen los mismos pasos, y cada oficina ve lo que recibió');
  store.reiniciarDatos();
  {
    /* Imágenes, Farmacia, Nefrología y Epidemiología tenían otra pantalla hasta el 03/11/2026.
       Lo que se exige es lo que ve la persona en cada estado, no el nombre de un archivo. */
    const ReporteDeArea = (await servidor.ssrLoadModule('/src/app/paneles/Reporte.jsx')).default;
    const areasDelSistema = (await servidor.ssrLoadModule('/src/app/datos/areas.js')).AREAS;
    afirmar(areasDelSistema.length === 9, 'son nueve áreas');
    const MES = '2026-07';
    for (const { clave } of areasDelSistema) {
      const usuario = usuarios.USUARIOS.find((u) => u.area === clave && u.roles.includes(roles.ROL.AREA));
      const sinMes = store.leerEstado().reportes.filter((r) => !(r.area === clave && r.periodo === MES));
      const sinIniciar = render(`${clave} sin iniciar`, ReporteDeArea, { reportes: sinMes, usuario, periodo: MES, irA: () => {} });
      afirmar(/Suba el (Excel|Word) de julio 2026/.test(sinIniciar), `${clave}: sin iniciar, lo primero es subir su archivo`);
      afirmar(!sinIniciar.includes('Abrir el reporte'), `${clave}: no pide abrir el reporte antes de subir`);
      for (const texto of ['Pasos del reporte', 'Revisar y resolver', 'Enviar']) afirmar(sinIniciar.includes(texto), `${clave}: muestra «${texto}»`);
      afirmar(!sinIniciar.includes('errores por corregir'), `${clave}: un reporte vacío no dice que tiene errores`);
    }

    /* Lo recibido, en el prototipo. */
    const Recibidos = (await servidor.ssrLoadModule('/src/app/paneles/oficina/ReportesRecibidos.jsx')).default;
    const delPrototipo = store.leerEstado().reportes;
    const deImagenes = store.reportesRecibidosPor(delPrototipo, 'cuerpo-tecnico')[0];
    const htmlRecibidos = render('lo recibido por Cuerpo Técnico', Recibidos, { reportes: delPrototipo, oficina: 'cuerpo-tecnico', params: { periodo: deImagenes.periodo } });
    afirmar(htmlRecibidos.includes('Diagnóstico por Imágenes') && htmlRecibidos.includes('Vigente') && htmlRecibidos.includes('Abrir el reporte de'), 'Cuerpo Técnico ve lo de Imágenes y lo puede abrir');
    const htmlSinNada = render('una oficina sin nada en ese mes', Recibidos, { reportes: [], oficina: 'cuerpo-tecnico', params: { periodo: deImagenes.periodo } });
    afirmar(htmlSinNada.includes('No ha recibido reportes de') && htmlSinNada.includes('Diagnóstico por Imágenes'), 'sin nada recibido, dice por qué y qué área falta');
    const htmlCargando = render('lo recibido mientras llega', Recibidos, { reportes: null, oficina: 'cuerpo-tecnico' });
    afirmar(!htmlCargando.includes('No ha recibido reportes'), 'mientras llega del servidor no afirma que no recibió nada');
    const borradorAjeno = delPrototipo.find((r) => r.estado === 'borrador');
    if (borradorAjeno) afirmar(!store.recepcionesDe([borradorAjeno], 'planeamiento').some((r) => r.estado === 'vigente'), 'un borrador nunca se cuenta como recibido');
    store.aplicarTransicion(deImagenes.area, deImagenes.periodo, 'rectificar', { actor: 'Prueba de humo', rol: 'estadistica' });
    const reabierta = store.recepcionesDe(store.leerEstado().reportes, 'cuerpo-tecnico').find((r) => r.reporte.id === deImagenes.id);
    afirmar(reabierta?.estado === 'desactualizada', 'un mes reabierto queda como desactualizado para quien ya lo recibió');
    store.reiniciarDatos();
  }

  /* ---------------------------------------------- 23. Centro Quirúrgico */
  titulo('23. Centro Quirúrgico: libro del mes, ocho reportes, DIRESA y consolidado anual');
  store.reiniciarDatos();
  {
    const lev = await servidor.ssrLoadModule('/src/app/datos/formatos/levantados.js');
    const cq = await servidor.ssrLoadModule('/src/app/datos/formatos/centro-quirurgico.js');
    const cqCalc = await servidor.ssrLoadModule('/src/app/datos/formatos/centro-quirurgico-calculos.js');
    const cqEjemplos = await servidor.ssrLoadModule('/src/app/servicios/ejemplos-centro-quirurgico.js');
    const botCq = await servidor.ssrLoadModule('/src/app/servicios/bot-validador.js');
    const resumenCq = await servidor.ssrLoadModule('/src/app/datos/formatos/resumen.js');
    const diresa = await servidor.ssrLoadModule('/src/app/datos/diresa/indicadores.js');
    const { PANELES } = await servidor.ssrLoadModule('/src/app/paneles/reporte/formularios.js');
    const cqUsuario = usuarios.usuario('area-centro-quirurgico');
    const P = '2026-09';

    const formulario = lev.formularioDe('centro-quirurgico');
    afirmar(formulario?.carga && !formulario.digitable, 'Centro Quirúrgico está levantado: se llena subiendo su libro, sin digitar');
    const pasos = lev.pasosDe('centro-quirurgico', {}, P, { errores: [], avisos: [], info: [] });
    afirmar(pasos.length === 8 && pasos[0].title === '1 · Resumen' && pasos[7].title === '8 · Suspendidas', 'sus pasos son los ocho reportes del área, en su orden', pasos.map((p) => p.title).join(' | '));
    afirmar(cq.REPORTES.filter((r) => r.leido).length === 5 && cq.REPORTES.every((r) => PANELES['centro-quirurgico'][r.id]), 'cinco reportes se leen y tres se calculan; cada uno tiene su panel para el visor de Estadística');

    const correcto = await botCq.validarArchivo(cqEjemplos.ejemploCorrecto(P), { area: 'centro-quirurgico', periodo: P, pausa: 0 });
    afirmar(!correcto.bloqueo && correcto.errores.length === 0 && correcto.avisos.length === 0, 'el ejemplo correcto (simulado, coherente) pasa el bot embebido sin errores ni avisos', `${correcto.bloqueo?.titulo ?? ''} ${[...(correcto.errores ?? []), ...(correcto.avisos ?? [])].map((e) => e.titulo).join(' | ')}`);
    const conErrores = await botCq.validarArchivo(cqEjemplos.ejemploConErrores(P), { area: 'centro-quirurgico', periodo: P, pausa: 0 });
    const rotas = new Set([...(conErrores.errores ?? []), ...(conErrores.avisos ?? [])].map((e) => e.regla ?? e.id));
    afirmar(['no-numerico', 'incompleto', 'cruce-indicadores'].every((r) => rotas.has(r)), 'el ejemplo con errores trae letras, una causa en blanco y «realizadas» distinta del RESUMEN', [...rotas].join(', '));
    const deOtroMes = await botCq.validarArchivo(cqEjemplos.ejemploCorrecto('2026-08'), { area: 'centro-quirurgico', periodo: P, pausa: 0 });
    afirmar(deOtroMes.bloqueo?.id === 'plantilla-periodo', 'el libro de agosto no se carga como reporte de setiembre');

    /* DIRESA (12, 13, 14 y 22) y la cifra del mes salen de lo mismo: el RESUMEN. */
    const d = cqCalc.paraDiresa(correcto.datos);
    const p = cqCalc.produccion(correcto.datos);
    afirmar(d.intervenciones.ejecutadas === p.realizadas && d.intervenciones.programadas === p.programadas + p.suspendidas, 'DIRESA recibe las ejecutadas del RESUMEN y, como programadas, las electivas más las suspendidas');
    const reporteCq = { area: 'centro-quirurgico', periodo: P, estado: 'enviado', datos: correcto.datos };
    const indicadores = diresa.calcularIndicadores(P, [reporteCq], {});
    const ind12 = indicadores.find((i) => i.n === 12);
    const ind22 = indicadores.find((i) => i.n === 22);
    afirmar(ind12.numerador === p.realizadas && ind12.denominador === d.salas.utilizadas, 'el indicador 12 de DIRESA toma las ejecutadas y las salas del reporte del área', `${ind12.numerador} / ${ind12.denominador}`);
    afirmar(ind22.numerador === p.suspendidas && ind22.denominador === d.intervenciones.programadas, 'el indicador 22 divide las suspendidas entre lo programado');
    const cifra = resumenCq.cifraPrincipal('centro-quirurgico', { datos: correcto.datos }, P);
    afirmar(cifra?.etiqueta === 'Cirugías realizadas' && cifra.valor === p.realizadas, 'la cifra del mes son las cirugías realizadas del RESUMEN');

    /* El reporte 1 completo: los doce meses, con los meses sin reporte en blanco. */
    const consol = botCq.consolidado('centro-quirurgico', '2026', [{ periodo: '2026-08', datos: correcto.datos }, { periodo: '2026-09', datos: correcto.datos }], {});
    const mayores = consol.consolidado.conceptos.find((c) => c.clave === 'mayores');
    afirmar(consol.nombre === 'Centro_Quirurgico_CONSOLIDADO_2026.xlsx' && mayores.porMes.programada[0] === null && mayores.acumulado.programada === 2 * correcto.datos.resumen['mayores.programada'], 'el consolidado anual suma los meses entregados y deja en blanco los que no tienen reporte');
    const { default: ConsolidadoAnualCq } = await servidor.ssrLoadModule('/src/app/paneles/ConsolidadoAnual.jsx');
    const htmlConsol = render('el consolidado de Centro Quirúrgico', ConsolidadoAnualCq, { claveArea: 'centro-quirurgico', reportes: [reporteCq] });
    afirmar(htmlConsol.includes('Producción asistencial de intervenciones quirúrgicas') && htmlConsol.includes('Descargar el Excel'), 'el consolidado de Centro Quirúrgico se ve como su reporte 1 y se descarga');

    /* Las pantallas: por llenar (con el selector de mes), y en revisión con los ocho reportes. */
    const sinMes = store.leerEstado().reportes.filter((r) => !(r.area === 'centro-quirurgico' && r.periodo === P));
    const htmlCarga = render('el reporte de Centro Quirúrgico por llenar', Reporte, { reportes: sinMes, usuario: cqUsuario, periodo: P, irA: () => {} });
    afirmar(htmlCarga.includes('Mes del reporte') && htmlCarga.includes('Subir el Excel') && !htmlCarga.includes('digitar en la hoja'), 'Centro Quirúrgico entra por la carga de su libro, con el selector de mes y sin digitar');
    const borrador = { id: `centro-quirurgico:${P}`, area: 'centro-quirurgico', periodo: P, estado: 'borrador', datos: conErrores.datos, carga: { archivo: conErrores.archivo, origen: conErrores.origen }, historial: [] };
    const htmlRevision = render('la revisión de Centro Quirúrgico', Reporte, { reportes: [...sinMes, borrador], usuario: cqUsuario, periodo: P });
    afirmar(htmlRevision.includes('Los reportes de su Excel') && htmlRevision.includes('Leído del Excel') && htmlRevision.includes('Continuar al envío'), 'con el libro cargado, abre en la revisión con los ocho reportes');
    {
      const { default: AvisoMochiCq } = await servidor.ssrLoadModule('/src/app/AvisoMochi.jsx');
      const cabeceraCq = await servidor.ssrLoadModule('/src/app/cabecera.js');
      const sesionCq = { usuario: cqUsuario, rolActivo: 'area' };
      const ctxCq = { reportes: [reporteCq], hoy: P > '2026-10' ? `${P}-15` : '2026-10-03', plazosReales: {} };
      const htmlAviso = render('el aviso de Centro Quirúrgico', AvisoMochiCq, {
        banda: cabeceraCq.bandaDe(sesionCq, 'inicio', ctxCq), panelId: 'inicio', sesion: sesionCq, reportes: [reporteCq], hoy: ctxCq.hoy, irA: () => {},
      });
      afirmar(/Subir el Excel|Revisar historial|Continuar el reporte|Ver el reporte/.test(htmlAviso), 'el aviso de Centro Quirúrgico dice qué toca con el reporte del mes');
    }
    store.reiniciarDatos();
  }

  /* --------------------------------------- 24. cargar los meses pasados */
  titulo('24. Toda área levantada puede cargar un mes pasado que no envió');
  store.reiniciarDatos();
  {
    const lev = await servidor.ssrLoadModule('/src/app/datos/formatos/levantados.js');
    const AREAS_CON_REPORTE = ['nutricion', 'laboratorio', 'farmacia', 'lavanderia', 'centro-quirurgico', 'ginecologia', 'nefrologia'];
    afirmar(AREAS_CON_REPORTE.every((a) => lev.formularioDe(a)), 'las siete áreas con su reporte levantado', AREAS_CON_REPORTE.filter((a) => !lev.formularioDe(a)).join(', '));
    const julio = '2026-07';
    for (const clave of AREAS_CON_REPORTE) {
      const usuario = usuarios.USUARIOS.find((u) => u.area === clave && u.roles.includes(roles.ROL.AREA));
      const sinJulio = store.leerEstado().reportes.filter((r) => !(r.area === clave && r.periodo === julio));
      const html = render(`el reporte de julio de ${clave}`, Reporte, { reportes: sinJulio, usuario, periodo: julio, irA: () => {} });
      afirmar(html.includes('Mes del reporte') && html.includes('Enero 2026') && html.includes('Julio 2026'), `${clave}: elige el mes, de enero al vigente`);
      afirmar(html.includes('un mes anterior al vigente') && !html.includes('Abrir el reporte'), `${clave}: julio se carga directo y avisa que es un mes pasado`);
    }
  }

  /* ------------------------------ 25. Planeamiento y las actividades operativas */
  titulo('25. Planeamiento: rol propio y actividades operativas del POI');
  store.reiniciarDatos();
  {
    const cat = await servidor.ssrLoadModule('/src/app/datos/planeamiento/actividades.js');
    const dom = await servidor.ssrLoadModule('/src/app/dominio/actividades.js');
    const { fuenteDeArea } = await servidor.ssrLoadModule('/src/app/datos/diresa/fuentes.js');
    const { ROL } = roles;

    /* El rol. */
    const pla = usuarios.USUARIOS.find((u) => u.usuario === 'planeamiento');
    afirmar(pla?.roles.join() === ROL.PLANEAMIENTO, 'la cuenta «planeamiento» tiene el rol de Planeamiento, no el de oficina receptora');
    const menu = nav.navDe(ROL.PLANEAMIENTO).map((n) => n.id);
    afirmar(menu[0] === 'actividades' && menu.includes('recibidos') && menu.includes('consolidado-centro-quirurgico') && menu.includes('matriz'), 'su menú: actividades operativas, recibidos, los consolidados y la matriz', menu.join(', '));
    afirmar(!menu.includes('semaforo') && !menu.includes('diresa') && !menu.includes('boletin'), 'no vigila plazos ni remite a DIRESA: eso sigue siendo de Estadística');

    /* Ve lo entregado de las nueve áreas, nunca un borrador. */
    const todos = store.leerEstado().reportes;
    const vistos = store.reportesEntregados(todos);
    afirmar(vistos.length > 0 && vistos.every((r) => est.estaEntregado(r.estado)), 'Planeamiento solo ve reportes entregados');
    afirmar(todos.some((r) => r.estado === 'borrador') && !vistos.some((r) => r.estado === 'borrador'), 'un borrador nunca llega a Planeamiento');

    /* El catálogo. */
    afirmar(cat.ACTIVIDADES.length === 44, 'el catálogo trae las 44 actividades del archivo de Planeamiento', String(cat.ACTIVIDADES.length));
    afirmar(new Set(cat.ACTIVIDADES.map((a) => a.codigo)).size === 44, 'cada código de actividad es único');
    afirmar(cat.ACTIVIDADES.every((a) => a.calculo && dom.CALCULO[a.calculo.tipo]), 'cada actividad dice de dónde sale su cifra', cat.ACTIVIDADES.filter((a) => !a.calculo).map((a) => a.codigo).join(', '));
    afirmar(cat.AREAS_CON_ACTIVIDADES.length === 9 && cat.AREAS_CON_ACTIVIDADES.every((c) => areas.area(c)), 'las actividades son de las nueve áreas, todas en la matriz', cat.AREAS_CON_ACTIVIDADES.join(', '));
    afirmar(cat.ACTIVIDADES.filter((a) => a.origenCeplan === 'prorrateo').every((a) => a.calculo.tipo === 'digitar'), 'un prorrateo de la meta no se calcula solo: se digita, con la meta ÷ 12 como referencia');
    afirmar(cat.ACTIVIDADES.every((a) => a.meta > 0 && !/@|clave/i.test(JSON.stringify(a))), 'cada actividad tiene su meta, y ninguna trae usuarios ni claves de CEPLAN');

    /* El calendario de Epidemiología. */
    const meses2026 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    const semanas = meses2026.map((p) => dom.semanasEpidemiologicas(p));
    afirmar(semanas.reduce((a, b) => a + b, 0) === 52, '2026 tiene 52 semanas epidemiológicas', semanas.join(','));
    afirmar(semanas.slice(0, 10).reduce((a, b) => a + b, 0) === 43, 'a fines de octubre van 43, lo que dice el cuadro');

    /* La cifra de un mes. */
    const P = '2026-06';
    const conCifra = cat.ACTIVIDADES.filter((a) => a.calculo.tipo === 'oficio').map((a) => ({ a, e: dom.ejecucionDelMes(a, { periodo: P, fuente: fuenteDeArea(todos, a.area, P) }) }));
    afirmar(conCifra.every(({ e }) => e.valor == null || Number.isFinite(e.valor)), 'cada fórmula da un número o nada, nunca algo raro', conCifra.filter(({ e }) => e.valor != null && !Number.isFinite(e.valor)).map(({ a }) => a.codigo).join(', '));
    const areasConNumero = new Set(conCifra.filter(({ e }) => e.valor != null).map(({ a }) => a.area));
    afirmar(['centro-quirurgico', 'lavanderia', 'nefrologia', 'laboratorio', 'imagenes', 'nutricion'].every((c) => areasConNumero.has(c)), 'con los reportes sembrados de junio, las áreas con reporte dan cifras calculadas', [...areasConNumero].join(', '));
    /* El prototipo no siembra Farmacia: sus dos fórmulas, sobre un Formato 1 mínimo. */
    const f1 = { sis: { hosp: 10, oncologia: 4 }, convenio: { emerg: 2 }, otros: {} };
    const conFarmacia = (codigo) => dom.ejecucionDelMes(cat.actividad(codigo), { periodo: P, fuente: { estado: 'validado', datos: { f1 } } }).valor;
    afirmar(conFarmacia('AOI00087400313') === 16 && conFarmacia('AOI00087400999') === 4, 'Farmacia: dispensación es el total de atenciones, mezclas la línea de Oncología', `${conFarmacia('AOI00087400313')} / ${conFarmacia('AOI00087400999')}`);

    const mayores = cat.actividad('AOI00087400349');
    const fuenteCq = fuenteDeArea(todos, 'centro-quirurgico', P);
    const eCq = dom.ejecucionDelMes(mayores, { periodo: P, fuente: fuenteCq });
    afirmar(fuenteCq.estado !== 'validado' || eCq.como === 'calculado', 'intervenciones mayores de junio sale del reporte de Centro Quirúrgico');
    afirmar(dom.ejecucionDelMes(mayores, { periodo: P, fuente: { estado: 'sin-reporte', datos: null } }).como === 'sin-reporte', 'sin reporte del área, la cifra queda vacía y lo dice: no es cero');
    afirmar(dom.ejecucionDelMes(cat.actividad('AOI00087400385'), { periodo: P, fuente: { estado: 'validado', datos: {} } }).valor === 1, 'un informe entregado cuenta 1 en «programación, seguimiento y evaluación»');
    const digitable = cat.actividad('AOI00087400683');
    afirmar(dom.ejecucionDelMes(digitable, { periodo: P }).como === 'pendiente', 'la que se digita empieza por digitar');
    afirmar(dom.ejecucionDelMes(digitable, { periodo: P, registro: { valor: 20 } }).como === 'digitado', 'escrita por Planeamiento, queda como digitada');
    const ajustada = dom.ejecucionDelMes(mayores, { periodo: P, fuente: { estado: 'validado', datos: fuenteCq.datos }, registro: { valor: 1, nota: 'prueba' } });
    afirmar(ajustada.como === 'ajustado' && ajustada.valor === 1 && ajustada.calculado === eCq.calculado, 'un ajuste manda sobre el cálculo, que sigue a la vista');
    afirmar(dom.exigeNota(mayores) && !dom.exigeNota(digitable), 'ajustar una cifra calculada pide nota; digitar donde no hay cálculo, no');
    afirmar(dom.acumulado([null, null]) === null && dom.acumulado([3, null, 4]) === 7, 'el acumulado no cuenta como cero un mes sin cifra');

    /* Lo que escribe Planeamiento. */
    store.registrarEjecucion('2026', 'AOI00087400683', '06', { valor: 20, nota: '', actor: 'prueba' });
    afirmar(store.registroDe(store.leerEstado().actividades, '2026', 'AOI00087400683', '06')?.valor === 20, 'lo digitado queda en el almacén');
    store.registrarEjecucion('2026', 'AOI00087400683', '06', { valor: null });
    afirmar(store.registroDe(store.leerEstado().actividades, '2026', 'AOI00087400683', '06') === null, 'borrarlo devuelve el mes a «por digitar»');

    /* La pantalla y su banda. */
    const { default: ActividadesOperativas } = await servidor.ssrLoadModule('/src/app/paneles/planeamiento/ActividadesOperativas.jsx');
    const html = render('el panel de actividades operativas', ActividadesOperativas, { reportes: vistos, actividades: {}, usuario: pla });
    afirmar(html.includes('Ejecución física de') && html.includes('INTERVENCIONES QUIRÚRGICAS MAYORES') && html.includes('Descargar CSV del mes'), 'el panel muestra el mes, las actividades y la descarga para CEPLAN');
    afirmar(html.includes('Lo digita Planeamiento') && html.includes('Del reporte del área'), 'cada actividad dice de dónde sale su cifra');
    const cabecera = await servidor.ssrLoadModule('/src/app/cabecera.js');
    const banda = cabecera.bandaDe({ usuario: pla, rolActivo: ROL.PLANEAMIENTO }, 'actividades', { reportes: vistos, hoy: store.leerEstado().hoy, actividades: {} });
    afirmar(/de 44 con cifra/.test(banda?.status?.label ?? ''), 'la banda dice cuántas actividades tienen cifra en el mes', banda?.status?.label);
    const { default: Bandeja } = await servidor.ssrLoadModule('/src/app/paneles/estadistica/Bandeja.jsx');
    const htmlBandeja = render('la bandeja de Planeamiento', Bandeja, { reportes: vistos, simulable: false });
    afirmar(!htmlBandeja.includes('Simular envío'), 'en la bandeja de Planeamiento no está la simulación de envíos');
    store.reiniciarDatos();
  }

  /* --------------------------------- los plazos, con la fecha real */
  titulo('Ninguna pantalla calcula un plazo con la fecha del prototipo');
  {
    const sinFecha = /(estaVencido|diasDeRetraso|diasParaVencer)(s*[w.]+s*)/;
    for (const f of [...archivos(join(APP, 'paneles'), ['.jsx', '.js']), join(APP, 'avisos.js'), join(APP, 'cabecera.js')]) {
      const m = readFileSync(f, 'utf8').match(sinFecha);
      afirmar(!m, `${corta(f)} pasa la fecha de hoy a sus plazos`, m?.[0]);
    }
    const { default: EstadoPeriodo } = await servidor.ssrLoadModule('/src/app/paneles/EstadoPeriodo.jsx');
    const almacen = await servidor.ssrLoadModule('/src/app/datos/store.js');
    const hoyAntes = almacen.leerEstado().hoy;
    almacen.fijarHoyReal('2026-11-01');
    const dias = render('la etiqueta del periodo', EstadoPeriodo, { reporte: null, periodo: '2026-10', claveArea: 'lavanderia' });
    afirmar(dias.includes('Quedan 9 días'), 'el 1 de noviembre, a octubre le quedan 9 días, no los del prototipo', dias.slice(0, 200));
    almacen.fijarPlazosReales('lavanderia', [{ periodo: '2026-10', fecha_limite: '2026-11-05' }]);
    const real = render('la etiqueta con el plazo real', EstadoPeriodo, { reporte: null, periodo: '2026-10', claveArea: 'lavanderia' });
    afirmar(real.includes('Quedan 4 días'), 'con el plazo que dio el servidor, cuenta desde ese', real.slice(0, 200));
    almacen.fijarHoyReal(hoyAntes);
    almacen.reiniciarDatos();
  }

  /* --------------------------------------------- 27. Monitoreo Indicadores */
  titulo('27. Monitoreo Indicadores: 34 indicadores asignados, cartas de control y lo que no se mide no se inventa');
  {
    const mon = await servidor.ssrLoadModule('/src/app/datos/monitoreo.js');
    const reglas = await servidor.ssrLoadModule('/src/app/dominio/monitoreo.js');
    const { COMPROMISOS } = await servidor.ssrLoadModule('/src/app/datos/compromisos.js');
    const lecturas = await servidor.ssrLoadModule('/src/app/datos/monitoreo-lecturas.js');
    const analisis = await servidor.ssrLoadModule('/src/app/dominio/analisis.js');
    const { navDe, menuDe, panelDe, vistasDe } = await servidor.ssrLoadModule('/src/app/navegacion.js');
    const { ROL } = await servidor.ssrLoadModule('/src/app/dominio/roles.js');

    /* El alcance oficial del Anexo I: las 21 son las que se le evalúan a un hospital III-1. */
    const EVALUADAS = [6, 9, 11, 12, 14, 15, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
    afirmar(mon.INDICADORES.length === 34 && mon.INDICADORES.every((i, k) => i.ficha === k + 1), 'el catálogo lleva las 34 fichas del Anexo I, en su orden');
    afirmar(mon.EVALUADOS.map((i) => i.ficha).join() === EVALUADAS.join(), 'el primer bloque son las 21 que el Anexo le evalúa al hospital');
    afirmar(mon.OTROS.length === 13 && mon.OTROS.every((i) => i.situacion === 'contexto' && i.motivo), 'las otras 13 dicen por qué no se le evalúan');
    afirmar(mon.OTROS.filter((i) => i.ambito === 'poblacion').map((i) => i.ficha).join() === '1,2,4,5,8,10', 'las de población asignada son 1, 2, 4, 5, 8 y 10');
    for (const i of mon.INDICADORES) {
      afirmar(Boolean(mon.SITUACIONES[i.situacion]), `la ficha ${i.ficha} tiene una situación conocida`);
      afirmar(mon.DIMENSIONES.some((d) => d.clave === i.dimension), `la ficha ${i.ficha} está en una sección`);
      afirmar(i.fuentes.length > 0 && i.fuentes.every((f) => mon.nombreDeFuente(f) !== f), `la ficha ${i.ficha} dice su fuente oficial`);
      afirmar(Boolean(reglas.ACUMULACION[i.acumulacion]), `la ficha ${i.ficha} dice cómo se publica su cifra`);
      if (i.situacion === 'requiere') afirmar(Boolean(i.oficina && i.pide?.length), `la ficha ${i.ficha} dice qué datos pide y a quién`);
      if (i.situacion === 'oficial_y_propio') afirmar(Boolean(i.lectura?.aclara), `la ficha ${i.ficha} aclara cómo leer la cifra del hospital`);
      if (i.relacionado) afirmar(Boolean(i.relacionado.aclara), `la ficha ${i.ficha} aclara que su dato relacionado no es el indicador`);
    }
    afirmar(mon.EVALUADOS.every((i) => i.logro), 'cada indicador evaluado lleva el logro del Anexo');
    afirmar(mon.indicadorDe(11).logro.valor === 45, 'el logro de la ficha 11 es el del Anexo (45 %), no el anotado a mano (60 %)');
    afirmar(mon.EVALUADOS.filter((i) => i.situacion === 'requiere').map((i) => i.ficha).join() === '27,28,29,30,31', 'las que no llegan en el reporte son 27 a 31');
    afirmar(COMPROMISOS.map((c) => c.numero).join() === '38,41,43,44,45,46', 'los compromisos que alcanzan al hospital son seis');
    afirmar(COMPROMISOS.every((c) => c.entregables.length && c.fuente), 'cada compromiso lleva sus entregables y su fuente');

    /* Las 34 del Tablero de indicadores: cada una abordada una sola vez, explicada, y con la
       misma dimensión que el catálogo de la base. */
    const asignadas = Object.values(lecturas.ASIGNACION).flat().sort((a, b) => a - b);
    afirmar(asignadas.join() === Array.from({ length: 34 }, (_, k) => k + 1).join(), 'cada una de las 34 fichas está asignada una sola vez', asignadas.join());
    const semilla = readFileSync(join(RAIZ, '..', 'servidor', 'api', 'bd', 'seeders', '0003_desempeno_catalogos.sql'), 'utf8');
    const delTablero = [...semilla.matchAll(/\(\s*(\d+), '[^']+', '(es|mi|gh|cs|si)'\)/g)].map((m) => [Number(m[1]), m[2]]);
    afirmar(delTablero.length === 34, 'se leen las 34 dimensiones del catálogo del Tablero', String(delTablero.length));
    for (const [ficha, dimension] of delTablero) afirmar(mon.indicadorDe(ficha).dimension === dimension, `la ficha ${ficha} tiene la dimensión del Tablero`);
    for (const ficha of lecturas.ASIGNACION.gestion) afirmar(mon.indicadorDe(ficha).dimension === 'gh', `la ficha ${ficha}, asignada a gestión, es de gestión hospitalaria en el Tablero`);
    for (const i of mon.INDICADORES) {
      const l = lecturas.LECTURAS[i.ficha];
      afirmar(Boolean(l?.significa) && typeof l?.lee === 'function', `la ficha ${i.ficha} dice qué significa y cómo se lee`);
    }
    for (const g of (await servidor.ssrLoadModule('/src/app/datos/diresa/indicadores.js')).INDICADORES) afirmar(Boolean(lecturas.LECTURAS_GERESA[g.n]?.medida && lecturas.LECTURAS_GERESA[g.n]?.lee), `el indicador ${g.n} de GERESA dice su medida y cómo se lee`);

    /* El análisis: sale de las cifras. Se prueba cambiándolas: si un mensaje estuviera escrito a
       mano, no cambiaría. */
    const serie = (...valores) => valores.map((valor, k) => ({ periodo: `2026-${String(k + 1).padStart(2, '0')}`, valor }));
    const leer = (valores, opciones = {}) => analisis.lecturaDeLaSerie(analisis.analizarSerie(serie(...valores), opciones), opciones);
    afirmar(analisis.mediana([1, 2, 100]) === 2 && analisis.mediana([1, 3]) === 2 && analisis.mediana([null, 5]) === 5 && analisis.mediana([]) === null, 'la mediana no se mueve con un mes raro y no cuenta los huecos');
    const minimo80 = { tipo: 'minimo', valor: 80 };
    const sube = leer([70, 75, 90], { logro: minimo80, mejor: 'mas' });
    const baja = leer([90, 75, 70], { logro: minimo80, mejor: 'mas' });
    afirmar(sube.titulo === 'Mejoró en marzo' && sube.tono === 'bueno', 'si sube y más es mejor, dice que mejoró', sube.titulo);
    afirmar(baja.titulo === 'Empeoró en marzo' && baja.tono === 'malo', 'si baja y más es mejor, dice que empeoró', baja.titulo);
    afirmar(leer([9, 7, 5], { logro: { tipo: 'maximo', valor: 8 }, mejor: 'menos' }).titulo === 'Mejoró en marzo', 'si baja y menos es mejor, dice que mejoró');
    afirmar(leer([1, 2, 3]).titulo === 'Subió en marzo', 'sin dirección conocida, un cambio solo es un cambio');
    afirmar(sube.frases.includes('Pasó de 75.0 % en febrero a 90.0 % en marzo: 15.0 puntos más.') || sube.frases.some((f) => f.startsWith('Pasó de 75.0 en febrero a 90.0 en marzo')), 'la frase lleva las cifras de la serie', sube.frases[0]);
    afirmar(sube.frases.some((f) => f.includes('Alcanzó la meta en 1 de 3 meses')), 'cuenta los meses que alcanzan el logro');
    afirmar(sube.frases.some((f) => f === 'En marzo volvió a alcanzarla.') && baja.frases.some((f) => f === 'En marzo dejó de alcanzarla.' || f.includes('sin alcanzarla')), 'dice si acaba de alcanzarla o de perderlo');
    afirmar(leer([90, 90, 70, 70], { logro: minimo80, mejor: 'mas' }).frases.some((f) => f.includes('Lleva 2 meses seguidos sin alcanzarla, desde marzo')), 'dice desde cuándo no lo alcanza');
    afirmar(leer([90, 85, 70], { logro: minimo80, mejor: 'mas', cumpleElAcumulado: true }).frases.some((f) => f.startsWith('Atención: en el acumulado del año cumple')), 'avisa cuando el acumulado cumple pero el último mes no');
    afirmar(!leer([90, 85, 88], { logro: minimo80, mejor: 'mas', cumpleElAcumulado: true }).frases.some((f) => f.startsWith('Atención')), 'esa alerta no aparece si no se cumple');
    afirmar(leer([4, 4, 4, 4, 5.19], { decimales: 2 }).frases.some((f) => f.includes('Repite exactamente 4.00 en 4 de 5 meses')), 'una cifra que se repite se detecta sola');
    afirmar(leer([1.2, 1.2, 1.2]).titulo === 'Sin cambios en el año', 'una serie que no cambia lo dice');
    afirmar(leer([60]).frases[0].includes('único mes con dato'), 'con un solo mes no se inventa una comparación');
    const conHueco = analisis.analizarSerie(serie(10, null, 12, 14));
    afirmar(conHueco.meses === 3 && conHueco.centro === 12 && conHueco.huecos.join() === '2026-02', 'un mes sin dato no entra en la mediana y se nombra');
    afirmar(analisis.lecturaDeLaSerie(conHueco).frases.some((f) => f === 'Sin dato en febrero: no se cuenta como cero.'), 'el hueco se dice, no se rellena');
    afirmar(analisis.lecturaDeLaSerie(analisis.analizarSerie(serie(null, null))) === null, 'sin cifras no hay análisis');
    const serieAcumulada = analisis.analizarSerie(serie(1, 2, 4, 5), { acumulada: true });
    afirmar(serieAcumulada.centro === null && serieAcumulada.avanceTipico === 1, 'una cifra acumulada no lleva mediana: se mira cuánto cambia cada mes');
    afirmar(analisis.lecturaDeLaSerie(serieAcumulada, { logro: { tipo: 'rango', desde: 12, hasta: 30 }, proyectable: true }).frases.some((f) => f.includes('necesita sumar 0.9 por mes en los 8 que quedan')), 'una cifra que crece con el año dice cuánto le falta por mes');
    afirmar(analisis.lecturaDeLaSerie(analisis.analizarSerie(serie(10, 12, 13), { acumulada: true }), { logro: { tipo: 'rango', desde: 12, hasta: 30 }, proyectable: true }).frases.some((f) => f.includes('Ya llegó')), 'si ya llegó, no le pide más');
    afirmar(leer([1, 2, 3, 10, 11, 12], { mejor: 'mas' }).frases.some((f) => f.includes('van mejor que los 3 anteriores')), 'compara los últimos 3 meses con los 3 anteriores');
    const comparar = (b) => analisis.compararLecturas(serie(4.04, 5.04), serie(...b), { decimales: 1, unidad: '%' });
    afirmar(comparar([4.04, 5.04]).iguales && comparar([4.04, 5.04]).texto.includes('Coincide'), 'dos lecturas iguales mes a mes coinciden');
    const difieren = comparar([4.04, 9]);
    afirmar(!difieren.iguales && difieren.texto.includes('1 de 2') && difieren.texto.includes('febrero'), 'si una difiere, dice cuántos meses y cuál', difieren.texto);

    /* Las notas van al detalle, y en pantalla se dice «meta». */
    const delPanel = (ruta) => readFileSync(join(APP, 'paneles', 'monitoreo', ruta), 'utf8');
    afirmar(!/<ComparacionPropia/.test(delPanel('PanelDesempeno.jsx').split('function TarjetaFicha')[1].split('function TarjetaContexto')[0]) && delPanel('DetalleFicha.jsx').includes('<ComparacionPropia'), 'la comparación con lo oficial se ve en el detalle, no en la tarjeta');
    afirmar(!/>\s*Logro\b|'Logro|"Logro|`Logro/.test(['GraficoIndicador.jsx', 'PanelDesempeno.jsx', 'PanelGestion.jsx', 'DetalleFicha.jsx', 'PanelCompromisos.jsx'].map(delPanel).join()), 'en pantalla se dice meta, no logro');
    afirmar(!delPanel('GraficoIndicador.jsx').includes('FloatingTip tip'), 'el tooltip del gráfico sale encima del punto, no al costado');

    /* Lo que no se distingue al escribirlo, no cambió: pasó con la ficha 22 real, 0.85 a 0.83. */
    const casiIgual = leer([3, 0.85, 0.83], { logro: { tipo: 'maximo', valor: 5 }, mejor: 'menos' });
    afirmar(casiIgual.titulo === 'Se mantuvo en marzo' && casiIgual.frases[0].startsWith('Quedó igual') && !casiIgual.frases.join().includes('0.0 puntos'), 'un cambio que no se ve al redondear no se dice como mejora', casiIgual.frases[0]);
    afirmar(leer([6.04, 4.66], { logro: { tipo: 'maximo', valor: 5 }, mejor: 'menos' }).frases[0].endsWith('1.3 menos.'), 'la resta cuadra con las cifras que se muestran');
    afirmar(leer([70, 75], { logro: minimo80, mejor: 'mas' }).frases.some((f) => f.includes('ninguno de sus 2 meses')) && leer([90, 95], { logro: minimo80, mejor: 'mas' }).frases.some((f) => f.includes('los 2 meses')), 'los meses que alcanzan el logro se dicen en palabras');
    afirmar(reglas.conclusionFrenteAlLogro({ valor: 4.97, logro: { tipo: 'maximo', valor: 5 }, estado: 'alcanza', unidad: '%', decimales: 1, escribir: (n) => n.toFixed(1) }).texto.startsWith('Está justo en el máximo'), 'la conclusión usa la cifra que se muestra');

    /* En las 34 fichas, con cifras de verdad distintas: cada frase de cada una cambia con los datos. */
    for (const i of mon.INDICADORES) {
      const logro = i.series?.[0]?.logro ?? i.logro;
      const mejor = analisis.mejorDe({ logro, menorEsMejor: i.menorEsMejor });
      const a = analisis.lecturaDeLaSerie(analisis.analizarSerie(serie(41.5, 43.5, 47.5, 44.5), { logro, acumulada: i.acumulacion === 'acumulada' }), { logro, mejor, decimales: 1 });
      const b = analisis.lecturaDeLaSerie(analisis.analizarSerie(serie(88.5, 86.5, 81.5, 79.5, 62.5), { logro, acumulada: i.acumulacion === 'acumulada' }), { logro, mejor, decimales: 1 });
      afirmar(a.titulo !== b.titulo || a.frases.join() !== b.frases.join(), `la ficha ${i.ficha} no dice lo mismo con otras cifras`);
      afirmar(a.frases[0].includes('47.5') && b.frases[0].includes('62.5'), `el mensaje de la ficha ${i.ficha} lleva sus cifras`);
    }
    /* Lo que cambia con los meses no puede estar escrito a mano en el catálogo: se calcula. */
    const catalogo = readFileSync(join(APP, 'datos', 'monitoreo.js'), 'utf8');
    for (const frase of ['ocho meses', 'solo trae una fila', 'no le publica cifra', 'sí trae una fila']) afirmar(!catalogo.includes(frase), `el catálogo no afirma «${frase}»: eso sale de los datos`);
    afirmar(mon.INDICADORES.filter((i) => i.hallazgo).length > 0 && mon.HALLAZGOS.fichas.includes('noviembre de 2026'), 'lo que no se puede recalcular va como nota con fecha');
    const usaSpc = archivos(join(APP, 'paneles', 'monitoreo'), ['.jsx']).some((f) => /Lím\.|límites de control|Proceso estable/.test(readFileSync(f, 'utf8').split('*/').slice(1).join('*/')));
    afirmar(!usaSpc, 'el gráfico ya no dibuja límites de control');

    /* La conclusión de hoy. */
    const concluye = (valor, logro, estado, extra = {}) => reglas.conclusionFrenteAlLogro({ valor, logro, estado, escribir: (n) => n.toFixed(1), ...extra });
    afirmar(concluye(0.4, { tipo: 'maximo', valor: 5 }, 'alcanza', { unidad: '%' }).texto.includes('Aquí, menos es mejor'), 'si menos es mejor, la conclusión lo dice');
    afirmar(concluye(3.8, { tipo: 'rango', desde: 12, hasta: 30 }, 'bajo', { unidad: 'egresos por cama', acumulacion: 'acumulada', hasta: '2026-08', proyectable: true }).texto.includes('A este ritmo cerraría diciembre en 5.7 egresos por cama'), 'una cifra que crece con el año se proyecta a diciembre');
    afirmar(concluye(null, { tipo: 'minimo', valor: 80 }, 'sin_dato') === null, 'sin cifra no hay conclusión');
    afirmar(reglas.conclusionDeCompromiso([{ nombre: 'A', plazo: '2026-02-28', estado: 'vencido' }, { nombre: 'B', plazo: '2026-12-31', estado: 'pendiente' }], '2026-11-01').titulo === 'Con plazos vencidos', 'un compromiso con plazos pasados lo dice');

    /* Las reglas, con cifras conocidas del reporte de enero a agosto de 2026. */
    const meses = ['2026-01', '2026-02', '2026-03'];
    const fila = (indicador, mes, numerador, denominador, extra = {}) => ({ familia: 'dl1153', indicador, serie: 'principal', ambito: 'hospital', mes, numerador, denominador, origen: 'minsa_excel', fecha_corte: '2026-09-20', ...extra });
    const f11 = mon.indicadorDe(11);
    const acumulada = mon.lecturaRegistrada(f11, [fila(11, 1, 33, 74), fila(11, 2, 45, 94), fila(11, 3, 55, 111)], meses);
    afirmar(acumulada.partes[0].acumulado.num === 55 && acumulada.partes[0].acumulado.den === 111, 'una cifra acumulada no se suma: vale la del último mes');
    const f22 = mon.indicadorDe(22);
    const mensual = mon.lecturaRegistrada(f22, [fila(22, 1, 2, 256), fila(22, 2, 10, 304)], meses);
    afirmar(mensual.partes[0].acumulado.num === 12 && mensual.partes[0].acumulado.den === 560, 'una cifra mensual suma numeradores y denominadores');
    afirmar(mensual.partes[0].puntos[2].valor === null, 'un mes sin dato es un hueco, no un cero');
    afirmar(reglas.valorDe(5, 0) === null && reglas.valorDe(null, 5) === null, 'sin denominador no hay indicador');
    afirmar(reglas.estadoFrenteAlLogro(0.4, { tipo: 'maximo', valor: 5 }) === 'alcanza', 'a menos, mejor: 0,4 % alcanza el máximo de 5 %');
    afirmar(reglas.estadoFrenteAlLogro(89.3, { tipo: 'minimo', valor: 95, umbral: 90 }) === 'bajo_umbral', 'por debajo del umbral se dice');
    afirmar(reglas.estadoFrenteAlLogro(47.2, { tipo: 'minimo', valor: 80, umbral: 40 }) === 'entre', 'entre umbral y logro se dice');
    afirmar(reglas.estadoFrenteAlLogro(3.8, { tipo: 'rango', desde: 12, hasta: 30 }) === 'bajo', 'fuera del rango se dice');
    afirmar(reglas.estadoFrenteAlLogro(null, { tipo: 'minimo', valor: 80 }) === 'sin_dato', 'sin cifra no hay estado');
    const f23 = mon.indicadorDe(23);
    const camas = mon.lecturaRegistrada(f23, [fila(23, 1, 4231, 4680), fila(23, 1, 861, 1058, { serie: 'uci' })], meses);
    afirmar(camas.partes.length === 2 && camas.estado === 'mixto', 'hospitalización y UCI se evalúan aparte: cumple una y la otra no');
    afirmar(mon.estadoDelIndicador(mon.indicadorDe(27), mon.lecturaRegistrada(mon.indicadorDe(27), [], meses)) === 'requiere', 'sin datos de Epidemiología, la ficha 27 los pide');
    afirmar(mon.estadoDelIndicador(mon.indicadorDe(3), mon.lecturaRegistrada(mon.indicadorDe(3), [], meses)) === 'contexto', 'una ficha de otro ámbito no tiene estado frente a la meta');
    const c = mon.cuentasDelPanel([], meses);
    afirmar(c.total === 21 && c.alcanzan === 0 && c.sinDato === 21, 'sin cifras, ninguno cuenta como alcanzado: los 21 quedan sin dato');

    /* La lectura del hospital en la ficha 21: las salas son 4, y un mes ajustado usa las suyas. */
    const f21 = mon.indicadorDe(21);
    afirmar(mon.salasDelMes({}, '2026-01') === 4 && mon.salasDelMes({ '2026-01': { salasOperativas: 3 } }, '2026-01') === 3, 'son 4 salas, salvo el mes ajustado');
    const contexto = (reportes, propios = {}) => ({ reportes, propios, anio: 2026, vigente: '2026-03' });
    const reporteCQ = (periodo, estado = 'remitido', extra = {}) => ({ id: `centro-quirurgico:${periodo}`, area: 'centro-quirurgico', periodo, estado, datos: { resumen: { 'mayores.programada': 200, 'menores.programada': 48, 'mayores.emergencia': 180, 'menores.emergencia': 6 } }, ...extra });
    const conSalas4 = mon.serieDelIndicador(f21, contexto([reporteCQ('2026-01')]));
    afirmar(conSalas4.propia[0].valor === 50, 'el hospital calcula mayores electivas entre 4 salas', String(conSalas4.propia[0].valor));
    const conSalas3 = mon.serieDelIndicador(f21, contexto([reporteCQ('2026-01')], { '2026-01': { salasOperativas: 3 } }));
    afirmar(Math.abs(conSalas3.propia[0].valor - 200 / 3) < 0.001, 'el mes ajustado a 3 salas divide entre 3');
    const vacia = mon.serieDelIndicador(f22, contexto([]));
    afirmar(vacia.meses.length === 3 && vacia.propia.every((p) => p.valor === null), 'sin reportes, cada mes es un hueco, no un cero');
    const borrador = mon.serieDelIndicador(f22, contexto([reporteCQ('2026-01', 'borrador')]));
    afirmar(borrador.propia[0].valor === null, 'un borrador no entra en el panel: solo lo entregado');
    const resumen = mon.serieDelIndicador(f22, contexto([reporteCQ('2026-01', 'remitido', { resumen: true })]));
    afirmar(resumen.propia[0].pendiente === true && resumen.propia[0].valor === null, 'un reporte que aún no trajo sus cifras no se cuenta como cero');
    const conCamas = mon.serieDelIndicador(f23, contexto([], { '2026-01': { pacientesDia: 150, diasCamaDisponibles: 200 } }));
    afirmar(conCamas.propia[0].valor === 75, 'la ocupación del censo es pacientes-día entre días-cama');
    const sinDias = mon.serieDelIndicador(f23, contexto([], { '2026-01': { pacientesDia: 150, diasCamaDisponibles: 0 } }));
    afirmar(sinDias.propia[0].valor === null, 'denominador cero no es 0 %');
    const sustitucion = mon.serieDelIndicador(mon.indicadorDe(24), contexto([], { '2026-01': { pacientesDia: 150, diasCamaDisponibles: 200, egresos: 25 } }));
    afirmar(sustitucion.propia[0].valor === 2, 'el intervalo de sustitución es (días-cama − pacientes-día) entre egresos');
    const roto = mon.serieDelIndicador({ ...f22, lectura: { ...f22.lectura, leer: () => { throw new Error('dato raro'); } } }, contexto([reporteCQ('2026-01')]));
    afirmar(roto.propia[0].valor === null, 'un reporte que no se puede leer queda como hueco, sin romper el panel');

    /* El avance del año: doce lugares, y ninguna ausencia pasa por cero. */
    const avance = mon.avanceDeSerie(mensual.partes[0].puntos, meses, 2026);
    afirmar(avance.celdas.length === 12 && avance.conDato === 2 && avance.transcurridos === 3, 'el avance tiene un lugar por mes');
    afirmar(avance.celdas[2].estado === 'sin_dato' && avance.celdas[3].estado === 'futuro', 'el avance distingue lo que no llegó de lo que aún no toca');

    /* Las salas ajustadas valen también en gestión hospitalaria. */
    const geresa = await servidor.ssrLoadModule('/src/app/datos/diresa/indicadores.js');
    const conAjuste = geresa.insumosDelPeriodo('2026-01', [], { '2026-01': { salasOperativas: 3 } });
    afirmar(conAjuste.salasUtilizadas.valor === 3, 'el mes ajustado cambia las salas de los indicadores de GERESA');
    const sinAjuste = geresa.insumosDelPeriodo('2026-01', [], {});
    afirmar(sinAjuste.salasUtilizadas.valor === null, 'sin ajuste ni reporte, no se inventan salas');
    afirmar(geresa.insumosDelPeriodo('2026-01', [], { '2026-01': { neonatalesPrecoces: 3 } }).neonatalesPrecoces.valor === 3, 'la neonatal por días la lleva Estadística');

    /* La navegación: quién entra por dónde. */
    const est = navDe(ROL.ESTADISTICA, { real: true, permisos: ['desempeno.ver'] });
    afirmar(est[0].id === 'monitoreo' && panelDe(ROL.ESTADISTICA, 'inicio', { real: true, permisos: [] }).id === 'monitoreo', 'Estadística entra por el panel de monitoreo');
    afirmar(vistasDe(est, 'monitoreo').map((v) => v.id).join() === 'monitoreo,monitoreo-gestion,monitoreo-compromisos,semaforo', 'las pestañas son desempeño, gestión, compromisos y Cumplimiento');
    afirmar(menuDe(est).filter((m) => m.label === 'Monitoreo Indicadores').length === 1 && !menuDe(est).some((m) => m.id === 'semaforo'), 'en el menú, el panel es una sola entrada');
    const direccion = navDe(ROL.OFICINA, { real: true, veMonitoreo: true });
    afirmar(direccion[0].id === 'monitoreo', 'Dirección entra por el panel de monitoreo');
    afirmar(vistasDe(direccion, 'monitoreo').map((v) => v.id).join() === 'monitoreo,monitoreo-gestion,monitoreo-compromisos', 'Dirección ve las tres pestañas, sin Cumplimiento');
    afirmar(vistasDe(navDe(ROL.ADMIN, { real: true, permisos: ['desempeno.ver'] }), 'monitoreo').some((v) => v.id === 'monitoreo-gestion'), 'el superadministrador también las tiene');
    afirmar(!navDe(ROL.OFICINA, { real: true, veMonitoreo: false }).some((m) => String(m.id).startsWith('monitoreo')), 'las demás oficinas no lo ven');
    afirmar(!navDe(ROL.AREA, { real: true, area: 'nutricion' }).some((m) => m.id === 'monitoreo'), 'las áreas no lo ven');

    /* La cuenta de boletín: dos módulos y ninguno más. El panel de monitoreo
       conserva sus tres vistas para que las pestañas sigan funcionando. */
    const navBoletin = navDe(ROL.BOLETIN, { real: true, permisos: ['boletin.ver', 'reporte.ver', 'reporte.descargar'] });
    afirmar(menuDe(navBoletin).map((m) => m.id).join() === 'boletin,monitoreo', 'el boletín solo ve «Boletín estadístico» y «Panel de monitoreo»', menuDe(navBoletin).map((m) => m.id).join());
    afirmar(navBoletin[0].id === 'boletin' && panelDe(ROL.BOLETIN, 'no-existe', { real: true }).id === 'boletin', 'el boletín entra por el boletín');
    afirmar(vistasDe(navBoletin, 'monitoreo').map((v) => v.id).join() === 'monitoreo,monitoreo-gestion,monitoreo-compromisos', 'el panel del boletín tiene sus tres vistas');
    afirmar(!navBoletin.some((m) => ['revision', 'diresa', 'semaforo', 'cuentas', 'inicio'].includes(m.id)), 'el boletín no ve revisión, remisión, cumplimiento ni administración');

    /* La pantalla pinta, con y sin datos. */
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { default: Monitoreo } = await servidor.ssrLoadModule('/src/app/paneles/monitoreo/Monitoreo.jsx');
    const pintar = (props) => renderToStaticMarkup(createElement(Monitoreo, { reportes: [], propios: {}, hoy: '2026-11-01', params: {}, irA: () => {}, sesion: { usuario: { permisos: [] } }, ...props }));
    const html = pintar({});
    for (const n of EVALUADAS) afirmar(html.includes(`Ficha ${n}:`), `el panel tiene un espacio para la ficha ${n}`);
    afirmar(!html.includes('Ver análisis'), 'las tarjetas del panel abren su detalle solo con la flecha: sin «Ver análisis»');
    for (const i of mon.OTROS.filter((o) => lecturas.asignacionDe(o.ficha) !== 'compromisos')) afirmar(html.includes(`Ficha ${i.ficha}:`), `el segundo bloque lleva una tarjeta de la ficha ${i.ficha}`);
    afirmar(!html.includes('Ficha 33:') && !html.includes('Ficha 34:'), 'las firmas digitales no se repiten en la pestaña de desempeño');
    afirmar(!html.includes(' · '), 'la pestaña de desempeño no separa títulos con punto medio');
    afirmar(html.includes('Otros indicadores del DL 1153') && html.includes('Evaluados al hospital'), 'el panel tiene los dos bloques');
    afirmar(!/>0 %</.test(html), 'sin datos, ningún indicador dice 0 %');
    afirmar(html.includes('Se requieren datos de Epidemiología') && html.includes('Se requieren datos de Farmacia') && html.includes('Se requieren datos de Recursos Humanos'), 'las fichas sin fuente dicen a quién pedirle los datos');
    afirmar(!html.includes('Cargar reporte DL 1153'), 'sin el permiso no se ofrece cargar el reporte');
    const conPermiso = pintar({ sesion: { usuario: { permisos: ['monitoreo.registrar', 'desempeno.ver'] } } });
    afirmar(conPermiso.includes('Registrar datos'), 'Estadística puede digitar lo de las oficinas');
    /* El botón va por `PageActions`, un portal que no se pinta sin navegador: mirar el HTML no
       probaría nada. Se prueba la regla, y que el botón dependa de ella. */
    const comunesMonitoreo = await servidor.ssrLoadModule('/src/app/paneles/monitoreo/comunes.jsx');
    const estadisticaSesion = { usuario: { permisos: ['monitoreo.registrar', 'desempeno.ver'] } };
    const superSesion = { usuario: { permisos: ['monitoreo.registrar', 'desempeno.ver', 'desempeno.cargar'] } };
    afirmar(!comunesMonitoreo.puedeCargarReporte(estadisticaSesion) && comunesMonitoreo.puedeRegistrar(estadisticaSesion), 'Estadística digita lo de las oficinas, pero no carga el reporte DL 1153');
    afirmar(comunesMonitoreo.puedeCargarReporte(superSesion), 'el superadministrador carga el reporte DL 1153');
    const fuentePanel = readFileSync(join(APP, 'paneles', 'monitoreo', 'PanelDesempeno.jsx'), 'utf8');
    afirmar(/\{puedeCargar && \(\s*<Button[^>]*icon="sh-upload"/.test(fuentePanel), 'el botón de cargar el reporte depende de ese permiso');
    const lista = pintar({ params: { ver: 'lista' } });
    for (const n of EVALUADAS) afirmar(lista.includes(`Ficha ${n}:`), `la lista tiene la ficha ${n}`);
    afirmar(!/>0 %</.test(lista), 'sin datos, la lista no dice 0 %');
    const detalle = pintar({ params: { ficha: '29' } });
    afirmar(detalle.includes('Volver a Monitoreo Indicadores') && detalle.includes('Se requieren datos de Recursos Humanos'), 'el detalle de una ficha sin datos dice qué hace falta');
    /* Analizar hasta un mes anterior: el corte llega a todas las cuentas y no rompe nada. */
    afirmar(mon.cuentasDelPanel([fila(6, 1, 96, 100), fila(6, 2, 50, 100)], ['2026-01']).alcanzan === 1 && mon.cuentasDelPanel([fila(6, 1, 96, 100), fila(6, 2, 50, 100)], ['2026-01', '2026-02']).bajo === 1, 'al mover el corte, el estado de una ficha se recalcula con esos meses');
    const detalle21 = pintar({ params: { ficha: '21' }, sesion: { usuario: { permisos: ['monitoreo.registrar'] } } });
    afirmar(detalle21.includes('Salas de operaciones por mes'), 'en la ficha 21 se ajustan las salas');
    const detalle3 = pintar({ params: { ficha: '3' } });
    afirmar(detalle3.includes('No se le evalúa al hospital'), 'el detalle de una ficha de otro ámbito lo dice');
    const gestion = pintar({ pestana: 'gestion' });
    for (const i of geresa.INDICADORES) afirmar(gestion.includes(`${i.n}<!-- -->. `) || gestion.includes(`${i.n}. ${i.nombre}`), `gestión hospitalaria tiene el indicador ${i.n}`);
    afirmar(pintar({ pestana: 'gestion', params: { indicador: '22' } }).includes('Volver a Monitoreo Indicadores'), 'gestión hospitalaria abre el detalle de un indicador');
    const compromisos = pintar({ pestana: 'compromisos' });
    for (const cm of COMPROMISOS) afirmar(compromisos.includes(`Ficha ${cm.numero}:`), `la pestaña lleva el compromiso ${cm.numero}`);
    afirmar(compromisos.includes('Firma digital en el SIHCE: fichas 33 y 34'), 'las firmas digitales se abordan en compromisos');
    afirmar(gestion.includes('Fichas del DL 1153 que miden la gestión del hospital'), 'gestión hospitalaria enlaza las fichas de gestión del Anexo');
    for (const pantalla of [gestion, compromisos, lista, detalle]) afirmar(!pantalla.includes(' · '), 'ninguna pestaña separa títulos con punto medio');
    afirmar(compromisos.includes('Plazo vencido'), 'un plazo pasado sin marcar como cumplido se dice');
    const conAvance = reglas.estadoDeEntregable({ plazo: '2026-02-28' }, { estado: 'cumplido' }, '2026-11-01');
    afirmar(conAvance === 'cumplido' && reglas.estadoDeEntregable({ plazo: '2026-02-28' }, null, '2026-11-01') === 'vencido' && reglas.estadoDeEntregable({ plazo: '2026-12-31' }, null, '2026-11-01') === 'pendiente', 'el estado de un entregable sale de su avance y su plazo');
  }

  /* ------------------------------------------ 26. el tutorial guiado */
  titulo('26. El tutorial guiado: una práctica que no guarda, con un paso para cada estado');
  {
    const { pasoDeGuia, OBJETIVOS, FASES } = await servidor.ssrLoadModule('/src/app/dominio/guia.js');
    const { formularioDe } = await servidor.ssrLoadModule('/src/app/datos/formatos/levantados.js');

    /* Lo que señala o pulsa existe en el código de la pantalla: un botón renombrado o
       retirado dejaría al tutorial señalando a la nada, y ni el lint ni el build lo
       verían. */
    const fuentes = archivos(join(APP, 'paneles'), ['.jsx']).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const objetivo of OBJETIVOS) {
      afirmar(fuentes.includes(`data-guia="${objetivo}"`) || fuentes.includes(`data-guia={x === otroConArreglo?.h ? '${objetivo}'`), `la pantalla tiene la marca «${objetivo}» que el tutorial señala`);
    }

    /* Las marcas de las tres cargas de Word y los cinco envíos: cada área tiene las suyas. */
    const fuente = (ruta) => readFileSync(join(APP, 'paneles', 'reporte', ruta), 'utf8');
    /* Las nueve siguen un solo recorrido: las de Word usan las mismas piezas. */
    for (const m of ['pasos-reporte', 'subir-otro', 'confirmar-reemplazo']) afirmar(fuente('ReporteWord.jsx').includes(`data-guia="${m}"`), `ReporteWord.jsx tiene la marca «${m}»`);
    afirmar(fuente('ReporteWord.jsx').includes("usePublicarGuia('flujo'"), 'ReporteWord.jsx publica su paso al tutorial');
    for (const m of ['envio-destinos', 'envio-casilla', 'enviar', 'enviar-ahora', 'envio-volver', 'volver-revision', 'cancelar-envio']) afirmar(fuente('PasoEnvioWord.jsx').includes(`data-guia="${m}"`), `PasoEnvioWord.jsx tiene la marca «${m}»`);
    afirmar(fuente('PasoEnvioWord.jsx').includes("usePublicarGuia('envio'"), 'el envío de las áreas con Word publica su estado al tutorial');
    for (const f of ['nutricion', 'laboratorio', 'lavanderia', 'ginecologia', 'centro-quirurgico']) {
      for (const m of ['envio-destinos', 'envio-casilla', 'enviar', 'enviar-ahora', 'envio-volver', 'volver-revision', 'cancelar-envio']) afirmar(fuente(`${f}/PasoEnvio.jsx`).includes(`data-guia="${m}"`), `el envío de ${f} tiene la marca «${m}»`);
      afirmar(fuente(`${f}/PasoEnvio.jsx`).includes("usePublicarGuia('envio'"), `el envío de ${f} publica su estado al tutorial`);
      const reporte = readdirSync(join(APP, 'paneles', 'reporte', f)).find((a) => a.startsWith('Reporte'));
      for (const m of ['pasos-reporte', 'subir-otro', 'confirmar-reemplazo']) afirmar(fuente(`${f}/${reporte}`).includes(`data-guia="${m}"`), `${reporte} tiene la marca «${m}»`);
      afirmar(fuente(`${f}/${reporte}`).includes("usePublicarGuia('flujo'"), `${reporte} publica su paso al tutorial`);
    }

    /* Las nueve áreas: cinco con Excel, cuatro con Word. */
    const excel = ['nutricion', 'laboratorio', 'lavanderia', 'ginecologia', 'centro-quirurgico'];
    const word = ['farmacia', 'nefrologia', 'imagenes', 'epidemiologia'];
    for (const a of excel) afirmar(Boolean(formularioDe(a)?.carga), `${a} se guía como área con Excel`);
    for (const a of word) afirmar(Boolean(formularioDe(a)) && !formularioDe(a).carga, `${a} se guía como área con Word`);

    const reporte = (doc, extra = {}) => ({ mes: 'octubre 2026', doc, entregado: false, editable: true, ...extra });
    const VISTOS = ['bienvenida', 'mes', 'pasos'];
    const paso = (senales, opciones = {}) => pasoDeGuia(senales, { vistos: VISTOS, destinos: ['Estadística', 'Planeamiento'], ...opciones });
    const correccion = (extra = {}) => ({ doc: 'Excel', cargando: false, sinArchivo: false, bloqueado: false, total: 3, pendientes: 3, listo: false, actual: { numero: 1, titulo: 'El total no cuadra', esAlerta: false, resuelto: false, tipo: null, balanza: true, hayArreglo: true }, ...extra });
    const conCaso = (descripcion, senales, id, opciones) => afirmar(paso(senales, opciones).id === id, descripcion, `dio «${paso(senales, opciones).id}»`);

    /* El principio del recorrido, con «Siguiente» y «Anterior». */
    const bienvenida = pasoDeGuia({ reporte: reporte('Excel') }, {});
    afirmar(bienvenida.id === 'bienvenida' && /práctica/i.test(bienvenida.texto) && /nada se guarda/.test(bienvenida.texto), 'la bienvenida dice que es una práctica y que nada se guarda');
    afirmar(!bienvenida.anterior && bienvenida.siguiente?.visto === 'bienvenida', 'en la bienvenida no hay a dónde volver');
    const mes = pasoDeGuia({ reporte: reporte('Excel') }, { vistos: ['bienvenida'] });
    afirmar(mes.id === 'mes' && mes.anterior?.olvidar === 'bienvenida', 'el mes vuelve a la bienvenida');
    const pasos = pasoDeGuia({ reporte: reporte('Excel') }, { vistos: ['bienvenida', 'mes'] });
    afirmar(pasos.id === 'pasos' && pasos.anterior?.olvidar === 'mes', 'los tres pasos vuelven al mes');
    afirmar(pasoDeGuia({ reporte: reporte('Word') }, { vistos: ['bienvenida', 'mes'] }).id === 'pasos', 'un área con Word pasa por la misma franja de tres pasos');
    conCaso('fuera de la pantalla del reporte, invita a volver', { reporte: reporte('Excel') }, 'fuera', { enReporte: false });
    afirmar(paso({ reporte: reporte('Excel') }, { enReporte: false }).siguiente?.volver === true, 'y su botón vuelve');
    const fin = paso({ reporte: reporte('Excel', { entregado: true }) });
    afirmar(fin.id === 'fin' && fin.siguiente?.terminar === true && /no se guardó nada/.test(fin.texto), 'el final dice que no se guardó nada y termina');
    conCaso('un reporte que no se puede editar lo dice', { reporte: reporte('Excel', { editable: false }) }, 'no-editable');

    /* Excel, de principio a fin. */
    const ex = { reporte: reporte('Excel') };
    const subirExcel = paso({ ...ex, flujo: { paso: 'carga' }, carga: {} });
    afirmar(subirExcel.id === 'subir-archivo' && subirExcel.siguiente?.pulsar === 'ejemplo-errores' && subirExcel.anterior?.olvidar === 'pasos', 'Excel: sin archivo, «Siguiente» prueba con el ejemplo con errores');
    conCaso('Excel: mientras lee, espera', { ...ex, flujo: { paso: 'carga', procesando: true }, carga: { procesando: true } }, 'leyendo');
    afirmar(!paso({ ...ex, flujo: { paso: 'carga', procesando: true }, carga: { procesando: true } }).siguiente, 'mientras se espera no hay «Siguiente»');
    const otra = paso({ ...ex, flujo: { paso: 'carga' }, carga: { conDatos: true } });
    afirmar(otra.id === 'subir-otro-archivo' && otra.siguiente?.pulsar === 'volver-sin-subir', 'Excel: al volver atrás con cifras, «Siguiente» regresa sin subir nada');
    const rechazado = paso({ ...ex, flujo: { paso: 'carga' }, carga: { problema: { titulo: 'No es del mes', detalle: 'Es de setiembre.' } } });
    afirmar(rechazado.id === 'archivo-rechazado' && rechazado.titulo === 'No es del mes' && rechazado.texto.includes('Es de setiembre.'), 'Excel: un archivo rechazado dice el motivo del bot');
    conCaso('Excel: el bot todavía revisa', { ...ex, flujo: { paso: 'revision' }, revision: { revisando: true } }, 'revisando');
    conCaso('Excel: al recargar lo corregido no dice «hay errores» por un instante', { ...ex, flujo: { paso: 'revision', procesando: true }, revision: { errores: 3 } }, 'leyendo');
    const conErrores = paso({ ...ex, flujo: { paso: 'revision' }, revision: { errores: 3, pendientes: 1 } });
    afirmar(conErrores.id === 'hay-errores' && conErrores.titulo.includes('3 errores') && conErrores.siguiente?.pulsar === 'corregir' && conErrores.anterior?.pulsar === 'subir-otro', 'Excel: con errores, cuenta los del archivo y lleva a corregir');
    afirmar(paso({ ...ex, flujo: { paso: 'revision' }, revision: { errores: 1 } }).titulo.includes('1 error en'), 'el singular se escribe bien');
    conCaso('Excel: solo alertas', { ...ex, flujo: { paso: 'revision' }, revision: { errores: 0, pendientes: 2 } }, 'hay-alertas');
    conCaso('Excel: sin nada pendiente, al envío', { ...ex, flujo: { paso: 'revision' }, revision: { errores: 0, pendientes: 0, listo: true } }, 'listo-para-enviar');
    conCaso('Excel: el envío explica a quién llega', { ...ex, flujo: { paso: 'envio' }, envio: { listo: true, confirmado: false } }, 'envio-destinos');
    const casilla = { ...ex, flujo: { paso: 'envio' }, envio: { listo: true, confirmado: false } };
    conCaso('Excel: envío sin confirmar', casilla, 'envio-casilla', { vistos: [...VISTOS, 'envio-destinos'] });
    conCaso('Excel: envío confirmado', { ...ex, flujo: { paso: 'envio' }, envio: { listo: true, confirmado: true } }, 'envio-boton');
    conCaso('Excel: el envío no se puede hacer aún', { ...ex, flujo: { paso: 'envio' }, envio: { listo: false } }, 'envio-no-listo');
    const final = paso({ ...ex, flujo: { paso: 'envio' }, envio: { listo: true, confirmado: true, preguntando: true } });
    afirmar(final.id === 'envio-final' && /no llega a nadie/.test(final.texto) && final.texto.includes('Estadística y Planeamiento') && final.siguiente?.pulsar === 'enviar-ahora' && final.anterior?.pulsar === 'cancelar-envio', 'Excel: el envío de práctica dice a quién llegaría y que aquí no llega a nadie');
    const constancia = paso({ ...ex, constancia: {} });
    afirmar(constancia.id === 'constancia' && !constancia.anterior && /práctica/.test(constancia.texto), 'la constancia no tiene vuelta atrás y dice que es de práctica');

    /* Word, de principio a fin. */
    const wd = { reporte: reporte('Word') };
    conCaso('Word: sin archivo, señala la carga', { ...wd, flujo: { paso: 'carga' }, carga: {} }, 'subir-archivo');
    afirmar(paso({ ...wd, flujo: { paso: 'carga' }, carga: {} }).titulo.includes('Word'), 'Word: habla de su Word, no de un Excel');
    conCaso('Word: mientras lee, espera', { ...wd, flujo: { paso: 'carga', procesando: true }, carga: { procesando: true } }, 'leyendo');
    conCaso('Word: un archivo rechazado', { ...wd, flujo: { paso: 'carga' }, carga: { problema: { titulo: 'x', detalle: 'y' } } }, 'archivo-rechazado');
    conCaso('Word: con errores', { ...wd, flujo: { paso: 'revision' }, revision: { errores: 2, pendientes: 1 } }, 'hay-errores');
    conCaso('Word: solo alertas', { ...wd, flujo: { paso: 'revision' }, revision: { errores: 0, pendientes: 1 } }, 'hay-alertas');
    conCaso('Word: sin nada pendiente, al envío', { ...wd, flujo: { paso: 'revision' }, revision: { errores: 0, pendientes: 0, listo: true } }, 'listo-para-enviar');
    conCaso('Word: el envío explica a quién llega', { ...wd, flujo: { paso: 'envio' }, envio: { listo: true, confirmado: false } }, 'envio-destinos');
    afirmar(paso({ ...wd, flujo: { paso: 'envio' }, envio: { listo: true, preguntando: true } }).siguiente?.pulsar === 'enviar-ahora', 'Word: el envío señala el mismo botón que el de Excel');

    /* La corrección, que comparten las nueve. */
    const cc = (extra) => paso({ ...ex, flujo: { paso: 'revision' }, revision: { errores: 3 }, correccion: correccion(extra) });
    afirmar(cc({ cargando: true }).id === 'abriendo-correccion', 'corrección: mientras abre, espera');
    afirmar(cc({ sinArchivo: true }).objetivos.includes('correccion-elegir'), 'corrección: sin archivo, pide elegirlo');
    afirmar(cc({ bloqueado: true }).objetivos.includes('correccion-elegir'), 'corrección: un archivo que no es, pide otro');
    afirmar(cc({}).titulo.startsWith('Error 1 de 3: El total no cuadra'), 'corrección: el título es el del hallazgo del bot');
    afirmar(cc({}).siguiente?.pulsar === 'aplicar' && cc({}).anterior?.pulsar === 'finalizar', 'corrección: con arreglo, «Siguiente» aplica y «Anterior» sale');
    afirmar(cc({ listo: true }).anterior === undefined, 'corrección: con todo listo, «Anterior» no aplicaría nada sin querer');
    const segundo = cc({ actual: { numero: 2, titulo: 'x', esAlerta: false, resuelto: false, hayArreglo: true } });
    afirmar(segundo.anterior?.pulsar === 'error-anterior', 'corrección: desde el segundo, «Anterior» va al error anterior');
    const alerta = cc({ actual: { numero: 2, titulo: 'Cifra rara', esAlerta: true, resuelto: false, hayArreglo: false } });
    afirmar(alerta.titulo.startsWith('Alerta 2 de 3') && alerta.siguiente?.pulsar === 'confirmar-alerta', 'corrección: una alerta se confirma');
    const sinArreglo = cc({ actual: { numero: 1, titulo: 'x', esAlerta: false, resuelto: false, hayArreglo: false } });
    afirmar(sinArreglo.libre === true && sinArreglo.marca === 'sin-arreglo' && sinArreglo.siguiente?.pulsar === 'finalizar', 'corrección: un error sin arreglo no encierra a la persona');
    afirmar(cc({ otroConArreglo: true, actual: { numero: 1, titulo: 'x', esAlerta: false, resuelto: false, hayArreglo: false } }).siguiente?.pulsar === 'chip-con-arreglo', 'corrección: si queda otro con arreglo, salta a él en lugar de dar vueltas');
    const despues = paso({ ...ex, flujo: { paso: 'revision' }, revision: { errores: 1 } }, { vistos: [...VISTOS, 'sin-arreglo'] });
    afirmar(despues.libre === true && despues.objetivos.includes('subir-otro') && despues.siguiente?.pulsar === 'subir-otro', 'Excel: tras un error sin arreglo, señala subir el archivo corregido');
    afirmar(paso({ ...ex, flujo: { paso: 'carga' }, carga: { conDatos: true } }, { vistos: [...VISTOS, 'sin-arreglo'] }).siguiente?.pulsar === 'ejemplo-correcto', 'Excel: y ahí «Siguiente» usa el ejemplo correcto');
    const despuesWord = paso({ ...wd, flujo: { paso: 'revision' }, revision: { errores: 1 } }, { vistos: [...VISTOS, 'sin-arreglo'] });
    afirmar(despuesWord.libre === true && despuesWord.objetivos.includes('carga-zona') && despuesWord.siguiente?.pulsar === 'ejemplo-correcto', 'Word: tras un error sin arreglo, señala subir el Word corregido');
    const resuelto = cc({ pendientes: 2, actual: { numero: 1, titulo: 'x', resuelto: true } });
    afirmar(resuelto.siguiente?.pulsar === 'siguiente' && resuelto.anterior?.pulsar === 'deshacer', 'corrección: resuelto, «Siguiente» avanza y «Anterior» deshace');
    afirmar(cc({ pendientes: 0, listo: true }).siguiente?.pulsar === 'finalizar', 'corrección: sin pendientes, señala finalizar');
    afirmar(cc({ actual: null, total: 0, pendientes: 0 }).siguiente?.pulsar === 'finalizar', 'corrección: sin nada que corregir, deja salir');
    afirmar(cc({}).enDialogo === true, 'corrección: su diálogo no se toma por uno ajeno');

    /* Nunca un paso sin qué decir, ni una marca que no esté declarada. */
    const casos = [{ ...ex }, { ...ex, flujo: { paso: 'carga' } }, { ...ex, flujo: { paso: 'revision' } }, { ...ex, flujo: { paso: 'envio' } }, { ...wd }, { ...wd, flujo: { paso: 'revision' } }];
    for (const s of casos) {
      const p = paso(s);
      afirmar(Boolean(p.titulo && p.texto && p.mascota), `un estado a medio llegar también tiene qué decir (${p.id})`);
      if (p.fase) afirmar(Boolean(FASES[p.fase]), `la fase de «${p.id}» existe`);
    }
    for (const p of [subirExcel, otra, rechazado, conErrores, final, alerta, sinArreglo, segundo, resuelto, despues, despuesWord, cc({ pendientes: 0, listo: true })]) {
      for (const o of [...(p.objetivos ?? []), p.siguiente?.pulsar, p.anterior?.pulsar].filter(Boolean)) afirmar(OBJETIVOS.includes(o), `«${o}» está en la lista de lo que se puede señalar`);
    }

    /* La práctica: nada sale al servidor y al terminar todo queda como antes. */
    const practica = await servidor.ssrLoadModule('/src/app/servicios/practica.js');
    const api = await servidor.ssrLoadModule('/src/app/servicios/api.js');
    const store = await servidor.ssrLoadModule('/src/app/datos/store.js');
    const { ejemploConErrores } = await servidor.ssrLoadModule('/src/app/servicios/ejemplos-lavanderia.js');
    const bot = await servidor.ssrLoadModule('/src/app/servicios/bot-validador.js');
    store.reiniciarDatos();
    const real = { id: 'lavanderia:2026-10', area: 'lavanderia', periodo: '2026-10', estado: 'remitido', constancia: 'CR-REAL', enviadoEn: '2026-11-01T10:00', datos: { real: true }, carga: null, historial: [], remision: null };
    store.escribirReporte(real);
    const archivoReal = { name: 'real.xlsx', arrayBuffer: async () => new ArrayBuffer(1) };
    bot.recordarArchivo('lavanderia', '2026-10', archivoReal);
    const antes = store.leerEstado().reportes;
    const fetchOriginal = globalThis.fetch;
    const escrituras = [];
    globalThis.fetch = async (url, o = {}) => {
      if ((o.method ?? 'GET') !== 'GET') escrituras.push(String(url));
      return new Response('{}', { status: 200 });
    };
    try {
      const id = 'lavanderia:2026-10';
      const elReporte = () => store.reporteDe(store.leerEstado().reportes, 'lavanderia', '2026-10');
      practica.entrarEnPractica('lavanderia');
      afirmar(practica.enPractica('lavanderia') && !practica.enPractica('farmacia'), 'la práctica es de un área');
      practica.abrirMesEnPractica('2026-10');
      afirmar(!elReporte(), 'un mes con reporte real empieza vacío en la práctica');
      afirmar(bot.archivoRecordado('lavanderia', '2026-10') === null, 'y sin el archivo real a mano');
      store.sincronizarReportesReales('lavanderia', ['2026-10'], [real]);
      store.fusionarReporteReal(real);
      afirmar(!elReporte(), 'lo que llega del servidor no pisa el mes de la práctica');

      const carga = await api.subirCarga('lavanderia', '2026-10', ejemploConErrores('2026-10'));
      afirmar(carga.ok && carga.resultado === 'aceptada' && carga.informe.errores.length > 0, 'subir un archivo lo lee el bot en el navegador');
      afirmar(elReporte()?.estado === 'borrador' && Boolean(elReporte()?.carga) && Boolean(elReporte()?.informe), 'y queda en el reporte de la práctica con su revisión');
      const sinc = await api.sincronizarReporte('lavanderia', '2026-10');
      afirmar(sinc.ok && sinc.reporte?.id === id, 'sincronizar devuelve el reporte de la práctica');
      await api.justificar('lavanderia', '2026-10', 'alerta-x', 'Es correcta');
      afirmar(elReporte()?.datos?.justificaciones?.['alerta-x'] === 'Es correcta', 'confirmar una alerta queda en la práctica');
      const envio = await api.transicionar('lavanderia', '2026-10', 'enviar', { actor: 'x', rol: 'area' });
      afirmar(envio.ok && /PRÁCTICA/.test(envio.reporte.constancia), 'la constancia de la práctica lo dice');

      /* La red de seguridad: un área que no es la de la práctica no se simula, y aun
         así su escritura no sale. */
      const ajena = await api.justificar('farmacia', '2026-10', 'x', 'y');
      afirmar(ajena.ok === false, 'una escritura que no se simula se rechaza');
      afirmar(escrituras.length === 0, 'nada se escribió en el servidor durante la práctica', escrituras.join(', '));

      practica.salirDePractica();
      afirmar(!practica.enPractica(), 'la práctica termina');
      afirmar(store.leerEstado().reportes === antes, 'al terminar, los reportes quedan exactamente como estaban');
      afirmar(elReporte()?.constancia === 'CR-REAL', 'y el reporte real sigue ahí');
      afirmar(bot.archivoRecordado('lavanderia', '2026-10') === archivoReal, 'y su archivo también');
      store.fusionarReporteReal({ ...real, constancia: 'CR-NUEVA' });
      afirmar(elReporte()?.constancia === 'CR-NUEVA', 'y el servidor vuelve a poder escribir ese mes');
    } finally {
      globalThis.fetch = fetchOriginal;
      if (practica.enPractica()) practica.salirDePractica();
      store.reiniciarDatos();
    }

    /* El tutorial no conoce la máquina de estados: pulsa lo que la pantalla ofrece,
       y lo que escribiría ya no llega al servidor. */
    const motor = readFileSync(join(APP, 'guia', 'Guia.jsx'), 'utf8') + readFileSync(join(APP, 'dominio', 'guia.js'), 'utf8');
    afirmar(!/transicionar|aplicarTransicion|servicios\/api/.test(motor), 'el tutorial no hace transiciones ni llama a la API');
    const fuenteApi = readFileSync(join(APP, 'servicios', 'api.js'), 'utf8');
    afirmar(/enPractica\(\) && method !== 'GET'/.test(fuenteApi) && /if \(enPractica\(\)\) return RECHAZO_PRACTICA/.test(fuenteApi), 'la red de seguridad rechaza toda escritura durante la práctica');
    afirmar(!fuente('nutricion/PasoCarga.jsx').includes('Solo para la demostración'), 'los ejemplos no se ofrecen como demostración con el servidor');
    const { renderToString } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { default: BotonGuia } = await servidor.ssrLoadModule('/src/app/guia/BotonGuia.jsx');
    afirmar(renderToString(createElement(BotonGuia, { usuario: { id: 1, soloLectura: true } })) === '', '«Ver como…» no ofrece el tutorial');
  }

  /* ------------------- 28 a 33. Hospitalización (pruebas/humo-hospitalizacion.mjs) */
  await probarHospitalizacion({ servidor, afirmar, titulo, registro });
} finally {
  await servidor.close();
}

console.log(`\n${fallos === 0 ? 'OK' : 'FALLÓ'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.\n`);
process.exit(fallos === 0 ? 0 : 1);
