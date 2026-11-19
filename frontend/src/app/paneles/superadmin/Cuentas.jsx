/* Cuentas y permisos: las cuentas reales del servidor.

   Crear una cuenta, cambiar los datos que la persona ve en su perfil (nombre,
   correo, cargo, documento), darle o quitarle roles, restablecer su
   contraseña, activarla o desactivarla, y eliminarla. Lo que se cambia aquí la
   persona lo ve al volver a entrar: su sesión abierta lleva los datos de
   cuando entró.

   Desactivar y eliminar no son lo mismo: desactivar se deshace con un clic;
   eliminar saca la cuenta del sistema y libera su usuario, aunque lo que hizo
   se conserva a su nombre (el borrado es lógico, como todo en la base).

   Las reglas que protegen al sistema (no desactivarse ni eliminarse a uno
   mismo, no dejarlo sin superadministrador, correo sin repetir) las decide el
   servidor; aquí se muestra su motivo tal cual. */

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, Dialog, Grid, IconButton, Input, Mosaic, PaginatedTable, Stack, Toast, Tooltip } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';
import { deHospitalizacion, TIPO_DE_UNIDAD_POR_ROL } from '@/app/hospitalizacion/datos/unidades.js';
import { useAdmin, Cargando, ErrorDeCarga, cuando } from './comunes.jsx';

const ESTADO_CLAVE = {
  sin_asignar: ['Sin contraseña', 'crit', 'No puede entrar hasta que se le asigne una.'],
  provisional: ['Provisional', 'warn', 'Debe cambiarla al entrar.'],
  definitiva: ['Contraseña propia', 'ok', 'Ya eligió la suya.'],
};

/* Las unidades que admite un rol, según su alcance en la base. La enfermería de
   hospitalización va en un área y su jefatura en un departamento, de los que se
   habilitan en «Unidades de hospitalización»; los roles de Estadística no las ven,
   ni aquellas ven las de Estadística. */
function unidadesPara(rol, catalogo) {
  if (!rol || rol.alcance === 'global') return [];
  const activas = catalogo.unidades.filter((u) => u.activa && !u.es_externa);
  const tipoHospitalizacion = TIPO_DE_UNIDAD_POR_ROL[rol.codigo];
  if (tipoHospitalizacion) return activas.filter((u) => deHospitalizacion(u.clave)?.tipo === tipoHospitalizacion);
  const deEstadistica = activas.filter((u) => !deHospitalizacion(u.clave));
  if (rol.codigo === 'consulta') return deEstadistica.filter((u) => u.es_receptora);
  return deEstadistica.filter((u) => u.es_reportante);
}

const SIN_UNIDADES = {
  area: 'No hay áreas de hospitalización habilitadas. Habilítelas en «Unidades de hospitalización».',
  departamento: 'No hay departamentos de hospitalización habilitados. Habilítelos en «Unidades de hospitalización».',
};

const opcionesDeUnidad = (lista) => lista.map((u) => ({ value: u.clave, label: u.nombre_corto || u.nombre }));

/* La contraseña estándar del hospital: el equipo decidió (31/10/2026) que
   todas las cuentas usen la misma, 1234567890, la que siembra
   `seed:usuarios`. El superadministrador la vuelve a poner con un clic cuando
   alguien la cambió y la olvidó. Cumple la política del servidor (10
   caracteres, sin el usuario). */
const CLAVE_ESTANDAR = '1234567890';

/* Una contraseña provisional que la persona cambiará al entrar: 14 caracteres
   legibles, sin los que se confunden al dictarlos (0/O, 1/l). */
function generarClave() {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const azar = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(azar, (n) => letras[n % letras.length]).join('');
}

/* Los datos de la persona en una rejilla de dos columnas: el diálogo es ancho
   y de dos paneles, y en una sola columna los campos quedaban largos y vacíos. */
function CamposPersonales({ datos, cambiar, conUsuario }) {
  return (
    <Grid min={220} gap={3}>
      {conUsuario && (
        <Input label="Usuario" value={datos.usuario} onChange={(e) => cambiar('usuario', e.target.value)} required info="Con lo que entra. No se puede cambiar después: la bitácora lo usa para reconocerla." />
      )}
      <Input label="Nombres" value={datos.nombres} onChange={(e) => cambiar('nombres', e.target.value)} required />
      <Input label="Apellidos" value={datos.apellidos} onChange={(e) => cambiar('apellidos', e.target.value)} required />
      <Input label="Correo" value={datos.correo ?? ''} onChange={(e) => cambiar('correo', e.target.value)} info="El que aparece en su perfil. Opcional; no puede repetirse entre cuentas." />
      <Input label="Cargo" value={datos.cargo ?? ''} onChange={(e) => cambiar('cargo', e.target.value)} info="Se muestra bajo su nombre en el sistema." />
      <Input
        label="Celular"
        value={datos.telefono ?? ''}
        onChange={(e) => cambiar('telefono', e.target.value)}
        autoComplete="tel"
        info="Número de contacto del responsable: al que se le llama o escribe cuando su reporte se atrasa. Dígitos, espacios o guiones, y un + si lleva prefijo de país. Opcional."
      />
      <Input label="Documento" value={datos.numero_documento ?? ''} onChange={(e) => cambiar('numero_documento', e.target.value)} info="DNI u otro. Opcional." />
    </Grid>
  );
}

/* Un panel del diálogo de cuenta: su título y su contenido. El de la derecha
   (rol y contraseña) va sobre la superficie hundida, para que los dos se lean
   como bloques distintos sin dibujar una línea entre ellos. */
function PanelDeCuenta({ titulo, lateral = false, children }) {
  return (
    <section className={`hrl-cuenta-panel${lateral ? ' hrl-cuenta-panel--lateral' : ''}`}>
      <h3 className="hrl-cuenta-panel__titulo">{titulo}</h3>
      <Stack gap={3}>{children}</Stack>
    </section>
  );
}

function SelectorDeRol({ catalogo, rol, unidad, alCambiarRol, alCambiarUnidad }) {
  const elRol = catalogo.roles.find((r) => r.codigo === rol);
  const unidades = unidadesPara(elRol, catalogo);
  const tipoHospitalizacion = TIPO_DE_UNIDAD_POR_ROL[rol];
  return (
    <>
      <Input
        label="Rol"
        kind="select"
        value={rol}
        onChange={(e) => alCambiarRol(e.target.value)}
        options={catalogo.roles.map((r) => ({ value: r.codigo, label: r.nombre }))}
        info={elRol?.descripcion ?? undefined}
        required
      />
      {elRol?.alcance === 'global' && <p className="hrl-cuenta-panel__nota">Ámbito: todo el hospital. No se le asigna una unidad.</p>}
      {elRol && elRol.alcance !== 'global' && (
        <Input
          label={elRol.alcance === 'ambos' ? 'Unidad (vacío: todo el hospital)' : 'Unidad'}
          kind="select"
          value={unidad ?? ''}
          onChange={(e) => alCambiarUnidad(e.target.value || null)}
          options={[...(elRol.alcance === 'ambos' ? [{ value: '', label: 'Todo el hospital' }] : [{ value: '', label: 'Elija la unidad' }]), ...opcionesDeUnidad(unidades)]}
          hint={tipoHospitalizacion && unidades.length === 0 ? SIN_UNIDADES[tipoHospitalizacion] : undefined}
          required={elRol.alcance === 'unidad'}
        />
      )}
    </>
  );
}

function NuevaCuenta({ catalogo, alCerrar, alCrear }) {
  const [datos, setDatos] = useState({ usuario: '', nombres: '', apellidos: '', correo: '', cargo: '', numero_documento: '', telefono: '', rol: 'digitador', unidad: null });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k, v) => setDatos((d) => ({ ...d, [k]: v }));

  const crear = async () => {
    setEnviando(true);
    setError(null);
    const vacio = (v) => (v && v.trim() ? v.trim() : null);
    const r = await api.admin('POST', '/cuentas', { ...datos, correo: vacio(datos.correo), cargo: vacio(datos.cargo), numero_documento: vacio(datos.numero_documento), telefono: vacio(datos.telefono) });
    setEnviando(false);
    if (r.ok) alCrear(r.body);
    else setError(r.error);
  };

  return (
    <Dialog
      title="Nueva cuenta"
      subtitle="Nace sin contraseña: al crearla, póngale la estándar desde su ficha"
      onClose={alCerrar}
      maxWidth={1000}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button icon="sh-people" loading={enviando} loadingText="Creando…" onClick={crear}>
            Crear la cuenta
          </Button>
        </Stack>
      }
    >
      <Stack gap={4}>
        {error && <Alert tone="error" title="No se creó">{error}</Alert>}
        <div className="hrl-cuenta-paneles">
          <PanelDeCuenta titulo="Datos de la persona">
            <CamposPersonales datos={datos} cambiar={cambiar} conUsuario />
          </PanelDeCuenta>
          <PanelDeCuenta titulo="Rol en el sistema" lateral>
            <SelectorDeRol catalogo={catalogo} rol={datos.rol} unidad={datos.unidad} alCambiarRol={(v) => setDatos((d) => ({ ...d, rol: v, unidad: null }))} alCambiarUnidad={(v) => cambiar('unidad', v)} />
            <p className="hrl-cuenta-panel__nota">
              Se pueden agregar más roles después, desde la ficha de la cuenta. La contraseña también se asigna ahí: la estándar es {CLAVE_ESTANDAR}.
            </p>
          </PanelDeCuenta>
        </div>
      </Stack>
    </Dialog>
  );
}

/* Eliminar exige su propio diálogo (CLAUDE.md § 4.2): dice qué se borra, qué
   se conserva y que no se deshace desde aquí. */
function EliminarCuenta({ cuenta, alCerrar, alEliminar }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const eliminar = async () => {
    setEnviando(true);
    setError(null);
    const r = await api.admin('DELETE', `/cuentas/${cuenta.id}`);
    setEnviando(false);
    if (r.ok) alEliminar(cuenta);
    else setError(r.error);
  };

  return (
    <Dialog
      title={`¿Eliminar la cuenta de ${cuenta.nombres} ${cuenta.apellidos}?`}
      subtitle={`Usuario ${cuenta.usuario} · no se puede deshacer desde aquí`}
      onClose={alCerrar}
      maxWidth={540}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button tone="danger" icon="sh-trash" loading={enviando} loadingText="Eliminando…" onClick={eliminar}>
            Eliminar la cuenta
          </Button>
        </Stack>
      }
    >
      <Stack gap={3}>
        <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', lineHeight: 'var(--leading-normal)' }}>
          <li>Desaparece de esta lista y ya no puede entrar al sistema. Pierde sus {cuenta.asignaciones.length === 1 ? 'rol' : `${cuenta.asignaciones.length} roles`}.</li>
          <li>Su usuario «{cuenta.usuario}»{cuenta.correo ? ' y su correo quedan libres' : ' queda libre'}: se pueden usar en una cuenta nueva.</li>
          <li>Lo que hizo —reportes enviados, archivos cargados y su rastro en la bitácora— se conserva, a su nombre.</li>
          <li>Si tiene una sesión abierta, sigue hasta que venza (8 horas como máximo).</li>
        </ul>
        {cuenta.activa && <Alert tone="info" title="¿Solo quiere que deje de entrar?">Desactívela: se conserva tal cual y se reactiva con un clic.</Alert>}
        {error && <Alert tone="error" title="No se eliminó">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

function EditarCuenta({ cuenta: inicial, catalogo, propia, alCerrar, alCambiar, alPedirEliminar }) {
  const [cuenta, setCuenta] = useState(inicial);
  const [datos, setDatos] = useState({ nombres: inicial.nombres, apellidos: inicial.apellidos, correo: inicial.correo, cargo: inicial.cargo, numero_documento: inicial.numero_documento, telefono: inicial.telefono });
  const [rolNuevo, setRolNuevo] = useState({ rol: 'consulta', unidad: null });
  const [clave, setClave] = useState({ texto: '', provisional: true });
  const [confirmar, setConfirmar] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const cambiar = (k, v) => setDatos((d) => ({ ...d, [k]: v }));

  const hacer = async (que, metodo, ruta, cuerpo, mensaje) => {
    setOcupado(que);
    setAviso(null);
    const r = await api.admin(metodo, ruta, cuerpo);
    setOcupado(null);
    if (!r.ok) {
      setAviso({ tono: 'error', texto: r.error });
      return false;
    }
    setCuenta(r.body);
    alCambiar(r.body, mensaje);
    return true;
  };

  const vacio = (v) => (v && String(v).trim() ? String(v).trim() : null);
  const guardarDatos = () =>
    hacer('datos', 'PATCH', `/cuentas/${cuenta.id}`, { ...datos, correo: vacio(datos.correo), cargo: vacio(datos.cargo), numero_documento: vacio(datos.numero_documento), telefono: vacio(datos.telefono) }, 'Datos de la cuenta guardados. La persona los verá al volver a entrar.');

  const estadoClave = ESTADO_CLAVE[cuenta.clave];

  return (
    <>
      <Dialog title={`${cuenta.nombres} ${cuenta.apellidos}`} subtitle={`Usuario ${cuenta.usuario}${propia ? ' · su propia cuenta' : ''}`} onClose={alCerrar} maxWidth={1080}
        footer={
          <Stack direction="row" gap={3} justify="between" wrap>
            <Stack direction="row" gap={3} wrap>
              {cuenta.activa ? (
                <Button tone="danger" icon="sh-close" disabled={propia} onClick={() => setConfirmar({ tipo: 'desactivar' })}>
                  Desactivar la cuenta
                </Button>
              ) : (
                <Button tone="ghost" icon="sh-ok" loading={ocupado === 'activa'} onClick={() => hacer('activa', 'PATCH', `/cuentas/${cuenta.id}`, { activa: true }, 'Cuenta activada: ya puede entrar.')}>
                  Activar la cuenta
                </Button>
              )}
              <Tooltip title="Eliminar la cuenta" body={propia ? 'No puede eliminar su propia cuenta: quedaría fuera del sistema.' : 'La saca del sistema y libera su usuario. Lo que hizo se conserva. Pide confirmación.'} focusable={false}>
                <Button tone="danger" icon="sh-trash" disabled={propia} onClick={() => alPedirEliminar(cuenta)}>
                  Eliminar la cuenta
                </Button>
              </Tooltip>
            </Stack>
            <Button tone="ghost" onClick={alCerrar}>
              Cerrar
            </Button>
          </Stack>
        }
      >
        <Stack gap={5}>
          {!cuenta.activa && <Alert tone="warning" title="Cuenta desactivada">No puede entrar al sistema. Su historia y lo que hizo se conservan.</Alert>}
          {aviso && <Alert tone={aviso.tono} title={aviso.tono === 'error' ? 'No se guardó' : 'Listo'}>{aviso.texto}</Alert>}

          <div className="hrl-cuenta-paneles">
            <PanelDeCuenta titulo="Datos de la persona">
              <CamposPersonales datos={datos} cambiar={cambiar} />
              <Stack direction="row" justify="end">
                <Button icon="sh-ok" loading={ocupado === 'datos'} loadingText="Guardando…" onClick={guardarDatos}>
                  Guardar los datos
                </Button>
              </Stack>
            </PanelDeCuenta>

            <PanelDeCuenta titulo="Roles y contraseña" lateral>
              {cuenta.asignaciones.length === 0 && <Alert tone="warning" title="Sin ningún rol">Puede entrar, pero no verá ningún módulo.</Alert>}
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {cuenta.asignaciones.map((a) => (
                  <li key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <span>
                      <Badge label={a.rol_nombre} tone={a.rol === 'superadmin' ? 'warn' : a.rol === 'revisor' ? 'ok' : 'info'} /> {a.unidad_nombre ?? 'Todo el hospital'}
                    </span>
                    <Button tone="ghost" size="sm" icon="sh-trash" onClick={() => setConfirmar({ tipo: 'rol', asignacion: a })} aria-label={`Quitar el rol ${a.rol_nombre}${a.unidad_nombre ? ` en ${a.unidad_nombre}` : ''}`}>
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
              <SelectorDeRol catalogo={catalogo} rol={rolNuevo.rol} unidad={rolNuevo.unidad} alCambiarRol={(v) => setRolNuevo({ rol: v, unidad: null })} alCambiarUnidad={(v) => setRolNuevo((r) => ({ ...r, unidad: v }))} />
              <Stack direction="row" justify="end">
                <Button tone="ghost" icon="sh-people" loading={ocupado === 'rol'} onClick={() => hacer('rol', 'POST', `/cuentas/${cuenta.id}/roles`, rolNuevo, 'Rol agregado. Lo tendrá al volver a entrar.')}>
                  Agregar el rol
                </Button>
              </Stack>

              <div className="hrl-cuenta-panel__separador" />
              <Stack direction="row" gap={2} align="center">
                <strong>Contraseña</strong>
                <Badge label={estadoClave[0]} tone={estadoClave[1]} />
              </Stack>
              <Input label="Contraseña nueva" kind="password" value={clave.texto} onChange={(e) => setClave((c) => ({ ...c, texto: e.target.value }))} hint="Al menos 10 caracteres y sin el nombre de usuario." />
              <Stack direction="row" gap={2} wrap>
                <Tooltip title="La estándar" body={`Pone ${CLAVE_ESTANDAR}, la contraseña que usan todas las cuentas, y la deja como definitiva.`} focusable={false}>
                  <Button tone="ghost" icon="sh-shield" onClick={() => setClave({ texto: CLAVE_ESTANDAR, provisional: false })}>
                    Usar la estándar
                  </Button>
                </Tooltip>
                <Tooltip title="Generar" body="Una contraseña al azar de 14 caracteres, sin letras que se confundan al dictarla." focusable={false}>
                  <Button tone="ghost" icon="sh-swap" onClick={() => setClave((c) => ({ ...c, texto: generarClave() }))}>
                    Generar
                  </Button>
                </Tooltip>
              </Stack>
              <Checkbox checked={clave.provisional} onChange={(v) => setClave((c) => ({ ...c, provisional: v }))} label="Provisional: deberá cambiarla al entrar" />
              <Stack direction="row" justify="end">
                <Button
                  icon="sh-shield"
                  disabled={clave.texto.length < 10}
                  loading={ocupado === 'clave'}
                  onClick={async () => {
                    if (await hacer('clave', 'POST', `/cuentas/${cuenta.id}/clave`, { clave: clave.texto, provisional: clave.provisional }, 'Contraseña restablecida.')) {
                      setAviso({ tono: 'success', texto: `Contraseña asignada${clave.provisional ? ' (provisional)' : ' (definitiva)'}.` });
                      setClave({ texto: '', provisional: true });
                    }
                  }}
                >
                  Restablecer la contraseña
                </Button>
              </Stack>
            </PanelDeCuenta>
          </div>
        </Stack>
      </Dialog>

      {confirmar?.tipo === 'desactivar' && (
        <Dialog title={`¿Desactivar a ${cuenta.nombres} ${cuenta.apellidos}?`} subtitle="Deja de poder entrar al sistema" onClose={() => setConfirmar(null)} maxWidth={520}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setConfirmar(null)}>
                Cancelar
              </Button>
              <Button tone="danger" loading={ocupado === 'activa'} onClick={async () => { await hacer('activa', 'PATCH', `/cuentas/${cuenta.id}`, { activa: false }, 'Cuenta desactivada.'); setConfirmar(null); }}>
                Desactivar
              </Button>
            </Stack>
          }
        >
          <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
            No se borra nada: sus reportes, envíos y su rastro en la bitácora se conservan, y se puede volver a activar. Si tiene una sesión
            abierta, sigue hasta que venza (8 horas como máximo).
          </p>
        </Dialog>
      )}

      {confirmar?.tipo === 'rol' && (
        <Dialog title={`¿Quitar el rol ${confirmar.asignacion.rol_nombre}?`} subtitle={confirmar.asignacion.unidad_nombre ?? 'Todo el hospital'} onClose={() => setConfirmar(null)} maxWidth={520}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setConfirmar(null)}>
                Cancelar
              </Button>
              <Button tone="danger" loading={ocupado === 'quitar'} onClick={async () => { await hacer('quitar', 'DELETE', `/cuentas/${cuenta.id}/roles/${confirmar.asignacion.id}`, undefined, 'Rol quitado.'); setConfirmar(null); }}>
                Quitar el rol
              </Button>
            </Stack>
          }
        >
          <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
            Al volver a entrar, la persona deja de ver los módulos de ese rol. Lo que ya hizo con él se conserva en la bitácora.
          </p>
        </Dialog>
      )}
    </>
  );
}

export default function Cuentas({ sesion }) {
  const cuentas = useAdmin('/cuentas');
  const catalogo = useAdmin('/catalogo');
  const [abierta, setAbierta] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const [creando, setCreando] = useState(false);
  const [toast, setToast] = useState(null);
  const [filas, setFilas] = useState(null);

  const lista = useMemo(() => filas ?? cuentas.datos ?? [], [filas, cuentas.datos]);
  if ((cuentas.cargando && !cuentas.datos) || (catalogo.cargando && !catalogo.datos)) return <Cargando />;
  if (cuentas.error || catalogo.error) return <ErrorDeCarga error={cuentas.error ?? catalogo.error} recargar={() => { cuentas.recargar(); catalogo.recargar(); }} />;

  const reemplazar = (c, mensaje) => {
    setFilas(lista.some((x) => x.id === c.id) ? lista.map((x) => (x.id === c.id ? c : x)) : [...lista, c]);
    if (mensaje) setToast(mensaje);
  };

  const quitar = (c) => {
    setFilas(lista.filter((x) => x.id !== c.id));
    setEliminando(null);
    setAbierta(null);
    setToast(`Cuenta «${c.usuario}» eliminada. Lo que hizo se conserva en la bitácora.`);
  };

  const columnas = [
    {
      key: 'usuario',
      label: 'Usuario',
      width: 150,
      sortable: true,
      tooltip: 'Con lo que la persona entra. Abre la cuenta para editarla.',
      render: (c) => (
        <Button tone="link" onClick={() => setAbierta(c)}>
          {c.usuario}
        </Button>
      ),
    },
    { key: 'nombre', label: 'Nombre', render: (c) => `${c.nombres} ${c.apellidos}` },
    /* Correo y celular en una sola columna, uno debajo del otro: con ocho
       columnas la tabla no cabía sin barra horizontal. */
    {
      key: 'contacto',
      label: 'Contacto',
      tooltip: 'Correo y, debajo, el celular del responsable. Se editan con el lápiz de la fila.',
      render: (c) =>
        c.correo || c.telefono ? (
          <span className="hrl-cuenta-contacto">
            {c.correo && <span>{c.correo}</span>}
            {c.telefono && <span className="hrl-mono">{c.telefono}</span>}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'roles',
      label: 'Roles',
      tooltip: 'Qué puede hacer y en qué unidad. El rol arriba y su unidad debajo.',
      render: (c) =>
        c.asignaciones.length ? (
          <ul className="hrl-cuenta-roles">
            {c.asignaciones.map((a) => (
              <li key={a.id}>
                <Badge label={a.rol_nombre} tone={a.rol === 'superadmin' ? 'warn' : a.rol === 'revisor' ? 'ok' : 'info'} />
                {a.unidad_nombre && <span className="hrl-cuenta-roles__unidad">{a.unidad_nombre}</span>}
              </li>
            ))}
          </ul>
        ) : (
          'Sin roles'
        ),
    },
    {
      key: 'estado',
      label: 'Estado',
      width: 170,
      tooltip: 'Si puede entrar, y en qué está su contraseña.',
      render: (c) => (c.activa ? <Badge label={ESTADO_CLAVE[c.clave][0]} tone={ESTADO_CLAVE[c.clave][1]} /> : <Badge label="Desactivada" tone="none" />),
    },
    { key: 'acceso', label: 'Último acceso', width: 125, render: (c) => (c.ultimo_acceso ? cuando(c.ultimo_acceso) : 'Nunca') },
    {
      key: 'accion',
      label: '',
      width: 112,
      align: 'right',
      render: (c) => {
        const propia = c.id === sesion.usuario.id;
        return (
          <div className="hrl-acciones-icono">
            <Tooltip title="Editar" body="Datos, roles, contraseña y si puede entrar." focusable={false}>
              <IconButton icon="sh-pencil" tone="action" aria-label={`Editar la cuenta ${c.usuario}`} onClick={() => setAbierta(c)} />
            </Tooltip>
            <Tooltip title="Eliminar" body={propia ? 'No puede eliminar su propia cuenta.' : 'La saca del sistema y libera su usuario. Pide confirmación.'} focusable={false}>
              <IconButton icon="sh-trash" tone="action" className="hrl-accion--peligro" aria-label={`Eliminar la cuenta ${c.usuario}`} disabled={propia} onClick={() => setEliminando(c)} />
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <Card
        accent="var(--primary)"
        icon="sh-people"
        title="Cuentas del sistema"
        subtitle="Los cambios quedan en la bitácora con su autor. La persona ve sus datos nuevos al volver a entrar"
        total={`${lista.length} cuentas`}
        actions={
          <Button icon="sh-people" onClick={() => setCreando(true)}>
            Nueva cuenta
          </Button>
        }
        flush
      >
        {/* Sin barra horizontal: las columnas se reparten el ancho y los textos
            parten en líneas (hrl-tabla-cuentas en estilos.css). */}
        <div className="hrl-tabla-cuentas">
          <PaginatedTable columns={columnas} rows={lista} rowKey={(c) => c.id} />
        </div>
      </Card>

      {creando && (
        <NuevaCuenta
          catalogo={catalogo.datos}
          alCerrar={() => setCreando(false)}
          alCrear={(c) => {
            setCreando(false);
            reemplazar(c, `Cuenta «${c.usuario}» creada. Asígnele una contraseña provisional.`);
            setAbierta(c);
          }}
        />
      )}
      {abierta && (
        <EditarCuenta cuenta={abierta} catalogo={catalogo.datos} propia={abierta.id === sesion.usuario.id} alCerrar={() => setAbierta(null)} alCambiar={reemplazar} alPedirEliminar={setEliminando} />
      )}
      {eliminando && <EliminarCuenta cuenta={eliminando} alCerrar={() => setEliminando(null)} alEliminar={quitar} />}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
