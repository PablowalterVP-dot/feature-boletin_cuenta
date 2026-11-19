/* La sección de hospitalización de la prueba de humo (`humo.mjs` la llama al final).

   Lo de siempre de la prueba (que cada módulo carga, que los iconos existen, que no
   hay colores escritos a mano) ya lo cubren las primeras secciones, que recorren toda
   `src/app`, hospitalización incluida. Aquí va lo propio:

   - el menú: qué ve cada rol de hospitalización y cómo se cuelga del de Estadística;
   - el contrato con los dos backends: los permisos que siembra Estadística (seeder
     0009) y la traducción a rol que hace la API de hospitalización son los mismos
     que lee el frontend;
   - el cliente: habla con /api/hospitalizacion con el token de la sesión;
   - cada pantalla, renderizada con cada rol, con la demostración y con la base vacía;
   - las reglas del dominio, que siguen escritas con node:test
     (`pruebas/hospitalizacion/*.test.mjs`).

   Lo que no comprueba: el plano 3D dibujado (el lienzo se pinta en un efecto, que
   aquí no corre) ni la API de hospitalización (sus pruebas son las de pytest en
   `servidor/hospitalizacion/pruebas`). */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const APP = join(RAIZ, 'src', 'app');
const HOSP = join(APP, 'hospitalizacion');
const SERVIDOR = join(RAIZ, '..', 'servidor');

const corta = (ruta) => relative(RAIZ, ruta).replaceAll('\\', '/');

/* Un JWT sin firma válida: el cliente solo lo reenvía, nunca lo verifica. */
function tokenFalso(reclamos) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(reclamos)}.firma`;
}

export async function probarHospitalizacion({ servidor, afirmar, titulo, registro }) {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');

  function render(descripcion, componente, props = {}, envoltura) {
    try {
      const elemento = createElement(componente, props);
      const html = renderToStaticMarkup(envoltura ? envoltura(elemento) : elemento);
      afirmar(html.length > 0, `${descripcion} produce marcado`, `longitud ${html.length}`);
      return html;
    } catch (e) {
      afirmar(false, `${descripcion} no lanza al renderizar`, e.message.split('\n')[0]);
      return '';
    }
  }

  const cuentas = await servidor.ssrLoadModule('/src/app/hospitalizacion/datos/cuentas.js');
  const { PANELES } = await servidor.ssrLoadModule('/src/app/hospitalizacion/paneles/indice.js');
  const { servicioExiste } = await servidor.ssrLoadModule('/src/app/hospitalizacion/datos/catalogo.js');
  const navegacion = await servidor.ssrLoadModule('/src/app/navegacion.js');
  const unidades = await servidor.ssrLoadModule('/src/app/hospitalizacion/datos/unidades.js');
  const { ROL } = await servidor.ssrLoadModule('/src/app/dominio/roles.js');
  const { MODULOS, MODULOS_POR_ROL, PRECEDENCIA, CUENTAS, GRUPO, GRUPO_REPORTES, rolDesdePermisos, modulosDeRol } = cuentas;
  const permisosDe = (rol) => ['hospitalizacion.ver', PRECEDENCIA.find(([, r]) => r === rol)[0]];

  /* ------------------------------------------------------- módulos y roles */
  titulo('28. Hospitalización: cada rol tiene sus módulos y cada módulo su pantalla');

  for (const [rol, modulos] of Object.entries(MODULOS_POR_ROL)) {
    afirmar(modulos[0] === 'mapa', `hospitalización/${rol} abre en Gestión de camas`, modulos[0]);
    for (const m of modulos) afirmar(Boolean(MODULOS[m] && PANELES[m]), `hospitalización/${rol}/${m} tiene módulo y pantalla`);
  }
  for (const [id, m] of Object.entries(MODULOS)) {
    afirmar(Boolean(PANELES[id]), `el módulo de hospitalización «${id}» tiene pantalla`);
    afirmar(Boolean(m.label && m.subtitulo) && [GRUPO, GRUPO_REPORTES].includes(m.grupo), `el módulo «${id}» tiene título, subtítulo y grupo`);
    afirmar(registro.has(m.icono), `el módulo «${id}» usa un icono del registro`, m.icono);
    afirmar(Object.values(MODULOS_POR_ROL).some((ms) => ms.includes(id)), `algún rol usa el módulo «${id}»`);
  }
  afirmar(new Set(CUENTAS.map((c) => c.usuario)).size === CUENTAS.length, 'las cuentas de prueba no repiten usuario');
  for (const c of CUENTAS) {
    afirmar(modulosDeRol(c.rol).length > 0, `la cuenta de prueba ${c.usuario} tiene un rol con módulos`);
    for (const s of c.servicios) afirmar(servicioExiste(s), `${c.usuario} opera un servicio del catálogo`, s);
  }

  /* --------------------------------------------------------------- el menú */
  titulo('29. Hospitalización: el menú, debajo del de Estadística');

  for (const [, rol] of PRECEDENCIA) {
    const menu = navegacion.navDe(ROL.HOSPITALIZACION, { real: true, permisos: permisosDe(rol) });
    afirmar(menu.map((e) => e.modulo).sort().join() === [...modulosDeRol(rol)].sort().join(), `una cuenta de piso con rol ${rol} ve exactamente sus módulos`);
    afirmar(menu[0].modulo === 'mapa', `una cuenta de piso con rol ${rol} abre en Gestión de camas`);
    const ultimoDelGrupo = menu.findLastIndex((e) => e.group === GRUPO);
    afirmar(menu.slice(0, ultimoDelGrupo + 1).every((e) => e.group === GRUPO), `en el menú de ${rol}, «Hospitalización» va antes que sus reportes`);
    for (const e of menu) {
      afirmar(navegacion.esDeHospitalizacion(e.id) && e.id === `hosp-${e.modulo}`, `${rol}/${e.modulo} lleva el prefijo hosp- en su ruta`);
      afirmar(Boolean(e.title && e.subtitle && e.construido), `${rol}/${e.modulo} tiene título y subtítulo`);
    }
    const porGrupo = Map.groupBy(menu, (e) => e.group);
    for (const [grupo, entradas] of porGrupo) afirmar(entradas.length > 1, `el menú de ${rol} no tiene un grupo de una sola entrada`, grupo);
    afirmar(Boolean(navegacion.panelDe(ROL.HOSPITALIZACION, 'no-existe', { real: true, permisos: permisosDe(rol) })), `una ruta desconocida de ${rol} cae en un panel`);
  }

  const permisosEst = ['reporte.ver', 'reporte.validar', 'desempeno.ver', ...permisosDe('jefatura')];
  const menuEst = navegacion.navDe(ROL.ESTADISTICA, { real: true, permisos: permisosEst });
  const deFlujo = navegacion.navDe(ROL.ESTADISTICA, { real: true, permisos: ['reporte.ver', 'reporte.validar', 'desempeno.ver'] });
  const primeraHosp = menuEst.findIndex((e) => navegacion.esDeHospitalizacion(e.id));
  afirmar(primeraHosp === deFlujo.length && menuEst.slice(0, primeraHosp).every((e, i) => e.id === deFlujo[i].id), 'Estadística conserva su menú y hospitalización va debajo');
  afirmar(menuEst.slice(primeraHosp).every((e) => navegacion.esDeHospitalizacion(e.id)), 'después de lo de Estadística no hay nada más que hospitalización');
  afirmar(new Set(menuEst.map((e) => e.id)).size === menuEst.length, 'ningún id de hospitalización choca con uno de Estadística');
  afirmar(JSON.stringify(menuEst.filter((e) => navegacion.esDeHospitalizacion(e.id)).map((e) => e.modulo)) === JSON.stringify(['mapa', 'consolidado', 'renoxi']), 'Estadística solo ve la gestión de camas, el consolidado de censos y RENOXI');
  afirmar(menuEst.filter((e) => navegacion.esDeHospitalizacion(e.id)).every((e) => e.group === GRUPO), 'con un solo módulo fuera de reportes, todo va en «Hospitalización» (sin grupo de una entrada)');
  afirmar(!navegacion.navDe(ROL.ESTADISTICA, { real: false, permisos: permisosEst }).some((e) => navegacion.esDeHospitalizacion(e.id)), 'sin servidor, hospitalización no aparece: el prototipo no la simula');
  afirmar(!navegacion.navDe(ROL.ADMIN, { real: true, permisos: permisosEst }).some((e) => navegacion.esDeHospitalizacion(e.id)), 'el superadministrador no la ve aunque tenga los permisos');
  afirmar(navegacion.navDe(ROL.HOSPITALIZACION, { real: true, permisos: ['reporte.ver'] }).length === 0, 'sin permisos de hospitalización, una cuenta de piso no tiene menú');
  const conApiApagada = { real: true, hospitalizacionDisponible: false };
  afirmar(!navegacion.navDe(ROL.ESTADISTICA, { ...conApiApagada, permisos: permisosEst }).some((e) => navegacion.esDeHospitalizacion(e.id)), 'con la API de hospitalización apagada, Estadística no ve esos módulos');
  afirmar(navegacion.navDe(ROL.HOSPITALIZACION, { ...conApiApagada, permisos: permisosDe('enfermeria') }).length > 0, 'una cuenta de piso sí, para que su pantalla diga que no hay conexión');
  afirmar(navegacion.navDe(ROL.ESTADISTICA, { real: true, hospitalizacionDisponible: null, permisos: permisosEst }).some((e) => navegacion.esDeHospitalizacion(e.id)), 'mientras se pregunta, el menú no cambia');

  /* ------------------------------------------------------------ contrato */
  titulo('30. Hospitalización: el frontend, la API de hospitalización y la de Estadística dicen lo mismo');

  const python = readFileSync(join(SERVIDOR, 'hospitalizacion', 'app', 'cuentas_estadistica.py'), 'utf8');
  const constantes = Object.fromEntries([...python.matchAll(/^([A-Z]+) = "(hospitalizacion\.[a-z]+)"$/gm)].map((m) => [m[1], m[2]]));
  const enPython = [...python.slice(python.indexOf('PRECEDENCIA = (')).matchAll(/\((\w+), "(\w+)"\)/g)].map((m) => [constantes[m[1]], m[2]]);
  afirmar(JSON.stringify(enPython) === JSON.stringify(PRECEDENCIA), 'la precedencia de permisos es la misma que en la API de hospitalización', JSON.stringify(enPython));
  const seeder = readFileSync(join(SERVIDOR, 'api', 'bd', 'seeders', '0009_hospitalizacion.sql'), 'utf8');
  const sembrados = new Set(seeder.match(/'hospitalizacion\.[a-z]+'/g).map((p) => p.slice(1, -1)));
  for (const [permiso] of PRECEDENCIA) afirmar(sembrados.has(permiso), `Estadística siembra el permiso ${permiso}`);
  const enEstadistica = readFileSync(join(SERVIDOR, 'api', 'bd', 'seeders', '0011_hospitalizacion_en_estadistica.sql'), 'utf8');
  afirmar(/r\.codigo = 'revisor'/.test(enEstadistica) && enEstadistica.includes("'hospitalizacion.validar'"), 'la cuenta oficial de Estadística (rol revisor) trae hospitalizacion.validar, sin un rol aparte');
  afirmar(!readFileSync(join(SERVIDOR, 'api', 'bd', 'seeders', 'opcionales', 'usuarios_hospitalizacion.sql'), 'utf8').includes("'validador_hospitalizacion'"), 'seed:hospitalizacion no da a nadie el rol retirado');
  const unidadesSql = readFileSync(join(SERVIDOR, 'api', 'bd', 'seeders', '0010_hospitalizacion_unidades.sql'), 'utf8');
  const opcional = readFileSync(join(SERVIDOR, 'api', 'bd', 'seeders', 'opcionales', 'usuarios_hospitalizacion.sql'), 'utf8');
  for (const c of CUENTAS.filter((x) => x.rol === 'enfermeria')) {
    const clave = unidades.claveDeUnidad('area', c.servicios[0]);
    afirmar(unidadesSql.includes(`'${clave}'`), `Estadística tiene la unidad de ${c.usuario} (${clave})`);
    afirmar(opcional.includes(`'${clave}')`), `seed:hospitalizacion asigna ${c.usuario} a ${clave}`);
  }
  const ceUnidades = [...python.matchAll(/PREFIJOS_DE_UNIDAD = \(([^)]*)\)/g)][0]?.[1] ?? '';
  afirmar(Object.values(unidades.PREFIJO).every((p) => ceUnidades.includes(`"${p}"`)), 'la API de hospitalización quita los mismos prefijos de unidad', ceUnidades);
  const servicioUnidades = readFileSync(join(SERVIDOR, 'api', 'app', 'servicios', 'unidades_hospitalizacion.py'), 'utf8');
  afirmar(Object.entries(unidades.PREFIJO).every(([t, p]) => servicioUnidades.includes(`"${t}": "${p}"`)), 'la API de Estadística crea las unidades con los mismos prefijos');
  afirmar(unidades.deHospitalizacion('hosp-dep-cirugia')?.tipo === 'departamento' && unidades.deHospitalizacion('hosp-area-cirugia')?.id === 'cirugia' && unidades.deHospitalizacion('ginecologia') === null, 'un departamento y su área con el mismo id no chocan, y una unidad de Estadística no es de hospitalización');
  for (const c of CUENTAS.filter((x) => x.id !== 'estadistica')) afirmar(opcional.includes(`('${c.usuario}',`), `seed:hospitalizacion crea la cuenta ${c.usuario}`);
  const roles = await servidor.ssrLoadModule('/src/app/dominio/roles.js');
  afirmar(Boolean(roles.ROLES[ROL.HOSPITALIZACION]?.label), 'el tipo de usuario hospitalizacion tiene su rótulo');
  afirmar(rolDesdePermisos(['hospitalizacion.ver']) === null, 'ver no basta para tener un rol de hospitalización');

  /* -------------------------------------------------------------- cliente */
  titulo('31. Hospitalización: el cliente usa el token de la sesión');

  const api = await servidor.ssrLoadModule('/src/app/servicios/api.js');
  const cliente = await servidor.ssrLoadModule('/src/app/servicios/hospitalizacion.js');
  const fetchOriginal = globalThis.fetch;
  const pedidos = [];
  try {
    globalThis.fetch = async (url, opciones = {}) => {
      pedidos.push({ url, metodo: opciones.method ?? 'GET', auth: opciones.headers?.Authorization, cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
      if (url === '/api/auth/cambiar-clave') {
        const datos = { id: 9, usuario: 'medicina.b', nombre: 'Enfermería Medicina B', asignaciones: [{ rol: 'enfermeria', unidad: 'medicina-b', permisos: permisosDe('enfermeria') }], roles_de_interfaz: ['hospitalizacion'] };
        return new Response(JSON.stringify({ token: tokenFalso({ sub: '9' }), debe_cambiar_clave: false, usuario: datos }), { status: 200 });
      }
      if (url === '/api/hospitalizacion/acciones') return new Response(JSON.stringify({ detail: 'Esta cama ya está ocupada.' }), { status: 422 });
      return new Response(JSON.stringify({ cuenta: { id: 'medicina.b' } }), { status: 200 });
    };
    /* Sin VITE_API_URL el ingreso es el del prototipo; el cambio de clave sí va al
       servidor y devuelve la cuenta con la misma forma que el ingreso. */
    const ingreso = await api.cambiarClave('provisional', 'definitiva');
    afirmar(ingreso.ok && ingreso.usuario.roles[0] === ROL.HOSPITALIZACION, 'una cuenta de piso entra con el tipo hospitalizacion');
    afirmar(ingreso.usuario.permisos.includes('hospitalizacion.operar'), 'y con sus permisos de hospitalización en la sesión');
    const mensaje = await cliente.despachar({ tipo: 'ingreso/confirmar' });
    const accion = pedidos.find((p) => p.url === '/api/hospitalizacion/acciones');
    afirmar(Boolean(accion) && accion.metodo === 'POST' && accion.auth === `Bearer ${api.tokenDeSesion()}`, 'las acciones van a /api/hospitalizacion con el token de la sesión de Estadística');
    afirmar(mensaje === 'Esta cama ya está ocupada.', 'el rechazo de una regla vuelve como mensaje para la pantalla', mensaje);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  const fuente = readFileSync(join(APP, 'servicios', 'hospitalizacion.js'), 'utf8');
  afirmar(!/auth\/login|sesionStorage|sessionStorage/.test(fuente), 'el cliente no tiene ingreso propio ni guarda otro token');

  /* --------------------------------------------------------- las pantallas */
  titulo('32. Hospitalización: cada pantalla renderiza con cada rol');

  const plano = JSON.parse(readFileSync(join(HOSP, 'datos', 'planos', 'medicina-b-piso2.json'), 'utf8'));
  const { crearSemilla, departamentoDe } = await servidor.ssrLoadModule('/src/app/hospitalizacion/datos/semilla.js');
  const { estadoInicial, maestroDesdePlano } = await servidor.ssrLoadModule('/src/app/hospitalizacion/dominio/hospitalizacion.js');
  const { ContextoApp } = await servidor.ssrLoadModule('/src/app/hospitalizacion/paneles/comun.jsx');
  const { default: Modulo } = await servidor.ssrLoadModule('/src/app/hospitalizacion/Modulo.jsx');

  /* La semilla del frontend no trae lo que solo arma el servidor (app/estado.py y
     principal.py): se completa con su misma forma. */
  const comoServidor = (e) => ({
    arranques: Object.fromEntries([...new Set(e.camas.map((c) => c.servicioId))].map((s) => [s, e.arranque])),
    serviciosConVM: ['cuidados-criticos'],
    camasDeBaja: [],
    bloqueos: [],
    indicadoresCerrados: {},
    ajustes: [],
    renoxi: {},
    mesesCerrados: [],
    bitacora: [],
    cuentas: CUENTAS.map((c) => ({ id: c.id, nombre: c.nombre, rol: c.rol, servicios: c.servicios, origen: 'estadistica', activo: true })),
    ingreso: 'estadistica',
    plano,
    ...e,
  });
  const escenarios = [
    ['la demostración', comoServidor(crearSemilla(plano))],
    ['la base vacía', comoServidor(estadoInicial(maestroDesdePlano(plano, departamentoDe), '2026-11-14T09:00'))],
  ];
  let pantallas = 0;
  for (const [nombre, estado] of escenarios) {
    for (const c of CUENTAS) {
      const cuenta = { ...c, modulos: modulosDeRol(c.rol), solo_lectura: false };
      const conCuenta = (hijo) => createElement(ContextoApp.Provider, { value: { estado, cuenta, hacer: async () => null } }, hijo);
      for (const m of cuenta.modulos) {
        render(`hospitalización ${c.usuario}/${m} con ${nombre}`, PANELES[m], {}, conCuenta);
        pantallas += 1;
      }
    }
  }
  console.log(`  ${pantallas} pantallas renderizadas (${CUENTAS.length} cuentas, ${escenarios.length} escenarios).`);
  const cargando = render('el módulo de hospitalización mientras llega el estado', Modulo, { modulo: 'mapa', sesion: { usuario: { id: 9 } } });
  afirmar(cargando.includes('aria-busy="true"'), 'mientras llega el estado, el módulo muestra que está cargando');

  /* ------------------------------------------------------ reglas del dominio */
  titulo('33. Hospitalización: las reglas del dominio (pruebas de node:test)');

  const carpeta = join(RAIZ, 'pruebas', 'hospitalizacion');
  const archivos = readdirSync(carpeta).filter((f) => f.endsWith('.test.mjs')).map((f) => join(carpeta, f));
  let corridas = 0;
  for await (const evento of run({ files: archivos })) {
    if (evento.data?.details?.type === 'suite') continue;
    if (evento.type === 'test:fail') {
      corridas += 1;
      afirmar(false, `${corta(evento.data.file ?? '')}: ${evento.data.name}`, String(evento.data.details?.error?.cause ?? evento.data.details?.error?.message ?? '').split('\n')[0]);
    } else if (evento.type === 'test:pass' && evento.data.nesting === 0) {
      corridas += 1;
      afirmar(true, evento.data.name);
    }
  }
  afirmar(corridas >= 79, 'corren todas las pruebas del dominio de hospitalización', String(corridas));
  console.log(`  ${archivos.length} archivos, ${corridas} pruebas.`);
}
