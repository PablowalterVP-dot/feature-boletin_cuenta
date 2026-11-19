/* Carga de datos de los indicadores: solo el superadministrador (`desempeno.cargar`).

   Cada fuente se carga una vez por mes y alimenta a todas sus fichas. Subir un
   archivo pasa por la revisión del servidor (POST …/cargas/revision, que no
   guarda nada): qué fuente es, qué meses trae, si reemplaza algo y qué avisos
   tiene. Solo después se carga, y el servidor recalcula solo. El archivo se
   reconoce por su contenido, no por su nombre ni por lo que se elija aquí.

   Arriba, «Qué subir»: el servidor calcula, con los pacientes de cada mes, qué
   archivo falta y desde qué día sirve descargarlo. Reemplaza al aviso de la
   ventana de corrección del HIS, que decía lo mismo sin las fechas.

   Lo publicado por MINSA también se registra aquí: sirve para comparar y, si
   trae fecha de corte, fija los meses que ese reporte cubrió. */

import { useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, DataTable, Dialog, IconButton, Input, Mosaic, PaginatedTable, ProgressSteps, Stack, Toast, Tooltip } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';
import { fechaCorta, fechaHora, numero } from '@/app/dominio/formato.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { consecuenciaDeRetirar, diaMes, ESTADO_CARGA, mesMinuscula, nombreMes, plural, textoDePaso } from '@/app/dominio/desempeno.js';
import { Cargando, EstadoDeCarga, SinAcceso, useCabeceraDesempeno, useDesempeno } from './comunes.jsx';

const MESES = Array.from({ length: 12 }, (_, i) => i + 1);
const kb = (n) => (n > 1048576 ? `${numero(n / 1048576, 1)} MB` : `${numero(Math.max(1, Math.round(n / 1024)))} KB`);
const fichasTexto = (lista) => (lista.length ? lista.map((n) => String(n).padStart(2, '0')).join(', ') : 'ninguna');

/* ------------------------------------------------------------- subir archivo */

const ESTADO_DEL_MES = {
  nuevo: { etiqueta: 'Nuevo', tono: 'ok', ayuda: 'Ese mes no tenía datos de esta fuente.' },
  reemplaza: { etiqueta: 'Reemplaza', tono: 'warn', ayuda: 'Reemplaza la carga vigente de ese mes; la anterior queda en el historial.' },
  ya_cargado: { etiqueta: 'Ya cargado', tono: 'none', ayuda: 'Es el mismo archivo que ya está cargado: no cambia nada.' },
};

function Revision({ revision, nombres }) {
  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <strong style={{ fontSize: 'var(--text-lg)' }}>{revision.fuente_nombre}</strong>
        <span className="hrl-nota">
          {revision.archivo} · {kb(revision.tamano)} · {plural(revision.filas_archivo, 'fila', 'filas')} · huella {revision.huella.slice(0, 12)}…
        </span>
      </Stack>
      {revision.meses.length > 0 && (
        <DataTable
          columns={[
            { key: 'periodo', label: 'Mes', tooltip: 'El mes de los datos que trae el archivo.', render: (m) => etiquetaPeriodo(m.periodo) },
            { key: 'filas', label: 'Filas', width: 100, align: 'right', numeric: true, tooltip: 'Filas de ese mes en el archivo.', render: (m) => numero(m.filas) },
            {
              key: 'estado',
              label: 'Qué hace',
              width: 140,
              tooltip: 'Si el mes es nuevo, reemplaza lo cargado o ya estaba.',
              render: (m) => (
                <Tooltip title={ESTADO_DEL_MES[m.estado]?.etiqueta ?? m.estado} body={ESTADO_DEL_MES[m.estado]?.ayuda ?? ''}>
                  <Badge label={ESTADO_DEL_MES[m.estado]?.etiqueta ?? m.estado} tone={ESTADO_DEL_MES[m.estado]?.tono ?? 'none'} />
                </Tooltip>
              ),
            },
            { key: 'filas_anteriores', label: 'Antes', width: 100, align: 'right', tooltip: 'Filas de la carga vigente de ese mes.', render: (m) => (m.filas_anteriores == null ? '—' : numero(m.filas_anteriores)) },
            {
              key: 'variacion',
              label: 'Frente al mes anterior',
              width: 170,
              tooltip: 'Solo aparece si la diferencia de filas con el mes anterior pasa del 20 %: suele indicar un archivo incompleto.',
              render: (m) => (m.variacion == null ? '—' : <Badge label={`${m.variacion > 0 ? '+' : ''}${numero(m.variacion * 100, 0)} %`} tone="warn" />),
            },
          ]}
          rows={revision.meses}
          rowKey={(m) => m.periodo}
        />
      )}
      {(revision.filas_fuera_de_rango > 0 || revision.filas_sin_fecha > 0) && (
        <p className="hrl-nota">
          {revision.filas_fuera_de_rango > 0 && `${plural(revision.filas_fuera_de_rango, 'fila es', 'filas son')} de años que no se cargan. `}
          {revision.filas_sin_fecha > 0 && `${plural(revision.filas_sin_fecha, 'fila no tiene', 'filas no tienen')} fecha y no se cargan.`}
        </p>
      )}
      {revision.verificadas_nuevas != null && (
        <p className="hrl-nota">
          Defunciones verificadas: {revision.verificadas_nuevas} nuevas y {revision.verificadas_actualizadas ?? 0} actualizadas.
        </p>
      )}
      <p className="hrl-nota">
        Alimenta a {revision.fichas.length === 1 ? 'la ficha' : 'las fichas'} {revision.fichas.map((n) => `${String(n).padStart(2, '0')}${nombres[n] ? ` (${nombres[n]})` : ''}`).join(', ') || 'ninguna'}.
      </p>
      {revision.errores.length > 0 && (
        <Alert tone="error" title="No se puede cargar">
          <ul className="hrl-lista">
            {revision.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      {revision.avisos.length > 0 && (
        <Alert tone="warning" title="Revise antes de cargar">
          <ul className="hrl-lista">
            {revision.avisos.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      {revision.nada_nuevo && <Alert tone="info" title="Nada nuevo">El archivo no trae nada que no esté cargado ya. Cargarlo no cambia ningún resultado.</Alert>}
    </Stack>
  );
}

function Subida({ nombres, alCargar }) {
  const entrada = useRef(null);
  const [encima, setEncima] = useState(false);
  const [estado, setEstado] = useState({ fase: 'elegir' });
  const [confirmar, setConfirmar] = useState(false);
  const [ack, setAck] = useState(false);

  const revisar = async (archivo) => {
    if (!archivo) return;
    setAck(false);
    setEstado({ fase: 'revisando', archivo });
    const r = await api.subirADesempeno('/cargas/revision', archivo);
    setEstado(r.ok ? { fase: 'revisado', archivo, revision: r.body } : { fase: 'elegir', error: r.error, motivos: r.motivos, archivo });
  };

  const cargar = async () => {
    const { archivo, revision } = estado;
    setEstado({ fase: 'cargando', archivo, revision });
    const r = await api.subirADesempeno('/cargas', archivo, { forzar: revision.requiere_forzar && ack });
    setConfirmar(false);
    if (!r.ok) {
      setEstado({ fase: 'revisado', archivo, revision, error: r.error, motivos: r.motivos });
      return;
    }
    setEstado({ fase: 'hecho', archivo, revision, resultado: r.body });
    alCargar(r.body);
  };

  const { fase, revision, resultado } = estado;
  const conAvisos = revision && (revision.avisos.length > 0 || revision.requiere_forzar);
  const puedeCargar = revision && revision.puede_cargar && !revision.nada_nuevo && (!conAvisos || ack);
  const pasos = [
    { key: 'archivo', title: 'Archivo', note: estado.archivo?.name, status: fase === 'elegir' && !estado.error ? 'partial' : estado.error && fase === 'elegir' ? 'error' : 'ok' },
    { key: 'revision', title: 'Revisión', note: revision ? (revision.errores.length ? 'con errores' : conAvisos ? 'con avisos' : 'sin problemas') : undefined, status: !revision ? 'empty' : revision.errores.length ? 'error' : fase === 'revisado' ? 'partial' : 'ok' },
    { key: 'carga', title: 'Carga y cálculo', status: fase === 'hecho' ? 'ok' : fase === 'cargando' ? 'partial' : 'empty' },
  ];
  const activo = fase === 'hecho' || fase === 'cargando' ? 'carga' : revision ? 'revision' : 'archivo';
  const otro = () => {
    setEstado({ fase: 'elegir' });
    setAck(false);
  };

  return (
    <Card accent="var(--primary)" icon="sh-upload" title="Subir un archivo" subtitle="Tal como se descarga: la trama del HIS (.csv), el reporte de SINADEF (.xls) o el CSV de defunciones verificadas" wide>
      <Stack gap={4} className="hrl-cuerpo">
        <ProgressSteps label="Pasos de la carga" steps={pasos} active={activo} />

        {(fase === 'elegir' || fase === 'revisando') && (
          <div
            className={`hrl-carga__zona${encima ? ' hrl-carga__zona--encima' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setEncima(true);
            }}
            onDragLeave={() => setEncima(false)}
            onDrop={(e) => {
              e.preventDefault();
              setEncima(false);
              revisar(e.dataTransfer.files?.[0]);
            }}
          >
            <strong style={{ fontSize: 'var(--text-md)' }}>{fase === 'revisando' ? `Revisando «${estado.archivo.name}»…` : 'Arrastre aquí el archivo'}</strong>
            <span className="hrl-nota">o</span>
            <Button icon="sh-folder" loading={fase === 'revisando'} loadingText="Revisando…" onClick={() => entrada.current?.click()} style={{ minHeight: 'var(--touch-target-lg)' }}>
              Elegir archivo
            </Button>
            <span className="hrl-nota">.csv, .xls o .xlsx · hasta 60 MB. El consolidado de varios años se carga por terminal.</span>
            {/* hrl-nativo: el kit no tiene selector de archivos; el botón de arriba lo abre. */}
            <input
              ref={entrada}
              type="file"
              accept=".csv,.xls,.xlsx"
              hidden
              onChange={(e) => {
                revisar(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {estado.error && (
          <Alert tone="error" title={fase === 'elegir' ? `No se pudo revisar «${estado.archivo?.name ?? 'el archivo'}»` : 'No se cargó'}>
            {estado.motivos?.length ? (
              <ul className="hrl-lista">
                {estado.motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              estado.error
            )}
          </Alert>
        )}

        {revision && fase !== 'hecho' && <Revision revision={revision} nombres={nombres} />}

        {revision && fase !== 'hecho' && (
          <Stack gap={3}>
            {conAvisos && revision.puede_cargar && !revision.nada_nuevo && (
              <Checkbox checked={ack} onChange={setAck} label={revision.requiere_forzar ? 'Revisé los avisos: quiero cargarlo aunque sea más antiguo o traiga menos filas que lo cargado.' : 'Revisé los avisos y quiero continuar.'} />
            )}
            <Stack direction="row" gap={3} justify="end" wrap>
              <Button tone="ghost" icon="sh-swap" onClick={otro} disabled={fase === 'cargando'}>
                Elegir otro archivo
              </Button>
              <Tooltip title="Cargar" body="Guarda el archivo en la base y recalcula las fichas que alimenta. Antes pide confirmación." focusable={false}>
                <Button tone="cta" icon="sh-upload" disabled={!puedeCargar} loading={fase === 'cargando'} loadingText="Cargando…" onClick={() => setConfirmar(true)}>
                  Cargar
                </Button>
              </Tooltip>
            </Stack>
          </Stack>
        )}

        {fase === 'hecho' && (
          <Stack gap={3}>
            <Alert tone="success" title={`${resultado.revision.fuente_nombre}: cargado`}>
              <ul className="hrl-lista">
                {resultado.revision.meses.map((m) => (
                  <li key={m.periodo}>
                    {etiquetaPeriodo(m.periodo)}: {plural(m.filas, 'fila', 'filas')} ({ESTADO_DEL_MES[m.estado]?.etiqueta.toLowerCase() ?? m.estado})
                  </li>
                ))}
                {resultado.recalculos.map((x) => (
                  <li key={`${x.numero}-${x.anio}`}>
                    Ficha {String(x.numero).padStart(2, '0')} de {x.anio}:{' '}
                    {x.estado === 'calculado' ? `recalculada, ${x.numerador}/${x.denominador} en el año` : x.estado === 'al_dia' ? 'ya estaba al día' : `no se recalculó (${x.motivo})`}
                  </li>
                ))}
                {resultado.casos_confirmados > 0 && <li>{plural(resultado.casos_confirmados, 'caso en seguimiento quedó confirmado', 'casos en seguimiento quedaron confirmados')}: ya suman.</li>}
              </ul>
            </Alert>
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" icon="sh-upload" onClick={otro}>
                Subir otro archivo
              </Button>
            </Stack>
          </Stack>
        )}
      </Stack>

      {confirmar && (
        <Dialog
          title={`Cargar ${revision.fuente_nombre}`}
          subtitle={revision.archivo}
          onClose={() => setConfirmar(false)}
          maxWidth={560}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
              <Button tone="cta" icon="sh-upload" loading={fase === 'cargando'} loadingText="Cargando…" onClick={cargar}>
                Sí, cargar
              </Button>
            </Stack>
          }
        >
          <Stack gap={3}>
            <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
              Se guardan {revision.meses.filter((m) => m.estado !== 'ya_cargado').map((m) => etiquetaPeriodo(m.periodo).toLowerCase()).join(', ') || 'los datos'} y se recalculan las fichas {fichasTexto(revision.fichas)}.
            </p>
            {revision.meses.some((m) => m.estado === 'reemplaza') && (
              <Alert tone="warning" title="Reemplaza lo cargado">
                Los meses marcados «Reemplaza» dejan de usar la carga anterior. Esa carga queda en el historial, pero el tablero pasa a mostrar la nueva.
              </Alert>
            )}
          </Stack>
        </Dialog>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- qué subir */

/* Una fila por archivo que falta. Lo primero que se puede hacer va en claro;
   lo que ese mismo archivo resolverá con una descarga posterior, debajo. */
function QueSubir({ porSubir, anio }) {
  const listos = porSubir.filter((x) => x.disponible).length;
  const columnas = [
    {
      key: 'mes',
      label: 'Qué subir',
      tooltip: 'El mes del archivo y de qué sistemas se descarga.',
      render: (x) => (
        <Stack gap={1}>
          <strong>
            {nombreMes(x.anio, x.mes)} {x.anio}
          </strong>
          <span className="hrl-nota">
            {x.fuentes.map((f) => f.nombre).join(' · ')}
            {x.cargado ? ' · reemplaza lo cargado' : ' · sin cargar'}
          </span>
        </Stack>
      ),
    },
    {
      key: 'cuando',
      label: 'Descargado',
      width: 170,
      tooltip: 'Falta: el mes ya terminó y no está cargado. Ya se puede: una descarga de hoy mejora lo cargado. Con fecha: desde ese día sirve la descarga.',
      render: (x) => <Badge label={x.disponible ? (x.cargado ? 'Ya se puede' : 'Falta') : `Desde el ${diaMes(x.pasos[0].desde)}`} tone={x.disponible ? (x.cargado ? 'ok' : 'crit') : 'none'} />,
    },
    {
      key: 'para',
      label: 'Para qué',
      tooltip: 'Qué se resuelve con cada descarga. Una descarga más reciente sirve también para las fechas anteriores.',
      render: (x) => (
        <Stack gap={1}>
          {x.pasos.map((p, i) => (
            <span key={p.desde} className={i ? 'hrl-nota' : undefined}>
              {textoDePaso(p, anio)}
            </span>
          ))}
        </Stack>
      ),
    },
  ];
  return (
    <Card
      accent={listos ? 'var(--warning)' : 'var(--success)'}
      icon={listos ? 'sh-warn' : 'sh-ok'}
      title="Qué subir"
      subtitle="Lo calcula el sistema con los pacientes de cada mes: un mes se cierra cuando hay datos hasta el último día de plazo de sus pacientes."
      total={porSubir.length ? plural(listos, 'mes ya se puede subir', 'meses ya se pueden subir') : undefined}
      flush
    >
      <DataTable columns={columnas} rows={porSubir} rowKey={(x) => `${x.mes}-${x.fuentes.map((f) => f.codigo).join('+')}`} empty="No hace falta subir nada por ahora: todo lo calculado está cerrado." />
    </Card>
  );
}

/* ------------------------------------------------------------- las fuentes */

function EditarFuente({ fuente, fichas, anio, alCerrar, alGuardar }) {
  const [elegidas, setElegidas] = useState(new Set(fuente.fichas));
  const [area, setArea] = useState(fuente.area_responsable ?? '');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!elegidas.size) {
      setError('Marque al menos una ficha.');
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await api.desempeno('PUT', `/fuentes/${encodeURIComponent(fuente.codigo)}`, { params: { anio }, cuerpo: { fichas: [...elegidas].sort((a, b) => a - b), area_responsable: area.trim() || null } });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    alGuardar(`${fuente.nombre}: fichas y área actualizadas.`);
  };

  return (
    <Dialog
      title={`Qué alimenta ${fuente.nombre}`}
      subtitle={fuente.cargable ? 'Las fichas que usan esta fuente se recalculan con la próxima carga.' : 'Mientras no se pueda cargar, sus fichas quedan sin resultado (no en cero).'}
      onClose={alCerrar}
      maxWidth={760}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button tone="cta" icon="sh-ok" loading={guardando} loadingText="Guardando…" onClick={guardar}>
            Guardar
          </Button>
        </Stack>
      }
    >
      <Stack gap={4}>
        <Input label="Área responsable" value={area} onChange={(e) => setArea(e.target.value)} info="Quién entrega el archivo de esta fuente." placeholder="Servicio u oficina" />
        <Stack gap={2}>
          <strong>Fichas que alimenta ({elegidas.size})</strong>
          <div className="hrl-casillas">
            {fichas.map((f) => (
              <Checkbox
                key={f.numero}
                checked={elegidas.has(f.numero)}
                label={`${String(f.numero).padStart(2, '0')} · ${f.nombre_corto ?? f.nombre}`}
                onChange={(v) =>
                  setElegidas((s) => {
                    const n = new Set(s);
                    if (v) n.add(f.numero);
                    else n.delete(f.numero);
                    return n;
                  })
                }
              />
            ))}
          </div>
        </Stack>
        {error && <Alert tone="error" title="No se guardó">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

/* -------------------------------------------------- fallecidos verificados */

const VACIA = { numero_documento: '', fecha_defuncion: '', fecha_registro: '', origen: '', observacion: '' };

function FormularioVerificada({ verificada, hoy, alCerrar, alGuardar }) {
  const nueva = !verificada.id;
  const [form, setForm] = useState({ ...VACIA, ...Object.fromEntries(Object.entries(verificada).map(([k, v]) => [k, v ?? ''])) });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const guardar = async () => {
    const e = {};
    if (!/^\d{8}$/.test(form.numero_documento.trim())) e.numero_documento = 'Son 8 dígitos.';
    if (!form.fecha_defuncion) e.fecha_defuncion = 'Indique la fecha.';
    else if (form.fecha_defuncion > hoy) e.fecha_defuncion = 'No puede ser futura.';
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    setError(null);
    const cuerpo = { numero_documento: form.numero_documento.trim(), fecha_defuncion: form.fecha_defuncion, fecha_registro: form.fecha_registro || null, origen: form.origen.trim() || null, observacion: form.observacion.trim() || null };
    const r = await api.desempeno(nueva ? 'POST' : 'PUT', nueva ? '/verificadas' : `/verificadas/${verificada.id}`, { cuerpo });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    alGuardar(`Defunción verificada ${nueva ? 'agregada' : 'corregida'}: la ficha se recalculó.`);
  };

  return (
    <Dialog
      title={nueva ? 'Agregar un fallecido verificado' : 'Corregir el fallecido verificado'}
      subtitle="Una defunción confirmada en SINADEF nacional que no viene en el reporte del hospital. Al guardar se recalcula."
      onClose={alCerrar}
      maxWidth={620}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button tone="cta" icon="sh-ok" loading={guardando} loadingText="Guardando…" onClick={guardar}>
            Guardar
          </Button>
        </Stack>
      }
    >
      <Stack gap={4}>
        <div className="hrl-desempeno-filtros">
          <Input label="Documento (DNI)" required value={form.numero_documento} onChange={campo('numero_documento')} error={errores.numero_documento} info="Los 8 dígitos del DNI de la persona." />
          <Input label="Fecha de defunción" kind="date" required value={form.fecha_defuncion} onChange={campo('fecha_defuncion')} error={errores.fecha_defuncion} info="Si cae dentro de los 37 días del diagnóstico, la persona sale del denominador." />
          <Input label="Registro en SINADEF (opcional)" kind="date" value={form.fecha_registro} onChange={campo('fecha_registro')} info="Cuándo SINADEF registró el certificado. No es el día en que usted lo verificó. Si no lo sabe, déjela vacía: con una fecha posterior al corte de MINSA, la defunción no cuenta en los meses de ese corte." />
          <Input label="Dónde se verificó" value={form.origen} onChange={campo('origen')} placeholder="SINADEF nacional" />
          <Input label="Observación" value={form.observacion} onChange={campo('observacion')} placeholder="Opcional" />
        </div>
        {error && <Alert tone="error" title="No se guardó">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

function Verificadas({ lectura, hoy, alCambiar }) {
  const [editando, setEditando] = useState(null);
  const [retirando, setRetirando] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const filas = lectura?.datos ?? [];

  const retirar = async () => {
    setOcupado(true);
    setError(null);
    const r = await api.desempeno('DELETE', `/verificadas/${retirando.id}`);
    setOcupado(false);
    setRetirando(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    alCambiar('Defunción verificada retirada: la ficha se recalculó.');
  };

  const columnas = [
    { key: 'numero_documento', label: 'Documento', width: 130, tooltip: 'El DNI de la persona. Abre el formulario para corregirla.', render: (v) => (
      <Button tone="link" onClick={() => setEditando(v)}>
        {v.numero_documento}
      </Button>
    ) },
    { key: 'fecha_defuncion', label: 'Defunción', width: 120, tooltip: 'La fecha de defunción verificada.', render: (v) => fechaCorta(v.fecha_defuncion) },
    { key: 'fecha_registro', label: 'Registro', width: 120, tooltip: 'Cuándo se registró en SINADEF.', render: (v) => (v.fecha_registro ? fechaCorta(v.fecha_registro) : '—') },
    { key: 'origen', label: 'Dónde se verificó', tooltip: 'De dónde salió el dato.', render: (v) => v.origen ?? v.observacion ?? '—' },
    { key: 'anotada_el', label: 'Anotada', width: 120, tooltip: 'Cuándo se anotó o corrigió en el sistema.', render: (v) => fechaCorta(v.anotada_el) },
    {
      key: 'accion',
      label: '',
      width: 100,
      align: 'right',
      render: (v) => (
        <div className="hrl-acciones-icono">
          <IconButton icon="sh-pencil" tone="action" aria-label={`Corregir la defunción de ${v.numero_documento}`} onClick={() => setEditando(v)} />
          <IconButton icon="sh-trash" className="hrl-accion--peligro" aria-label={`Retirar la defunción de ${v.numero_documento}`} onClick={() => setRetirando(v)} />
        </div>
      ),
    },
  ];

  return (
    <Card
      accent="var(--info)"
      icon="sh-profile"
      title="Fallecidos verificados"
      subtitle="Defunciones confirmadas a mano en SINADEF nacional: no vienen en el reporte del hospital."
      total={plural(filas.length, 'persona', 'personas')}
      actions={
        <Tooltip title="Agregar" body="Anota una defunción verificada. Para varias a la vez sirve el CSV, en «Subir un archivo»." focusable={false}>
          <Button tone="cta" size="sm" icon="sh-profile" onClick={() => setEditando({})}>
            Agregar
          </Button>
        </Tooltip>
      }
      flush
    >
      {(lectura?.error || error) && <Alert tone="error" title="No se pudo">{lectura?.error ?? error}</Alert>}
      <PaginatedTable columns={columnas} rows={filas} rowKey={(v) => v.id} presorted loading={Boolean(lectura?.cargando && !lectura.datos)} empty="Todavía no hay ninguna defunción verificada a mano." />
      {editando && (
        <FormularioVerificada
          verificada={editando}
          hoy={hoy}
          alCerrar={() => setEditando(null)}
          alGuardar={(t) => {
            setEditando(null);
            alCambiar(t);
          }}
        />
      )}
      {retirando && (
        <Dialog
          title="Retirar el fallecido verificado"
          subtitle={`Documento ${retirando.numero_documento} · defunción del ${fechaCorta(retirando.fecha_defuncion)}`}
          onClose={() => setRetirando(null)}
          maxWidth={560}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setRetirando(null)}>
                Cancelar
              </Button>
              <Button tone="danger" icon="sh-trash" loading={ocupado} loadingText="Retirando…" onClick={retirar}>
                Sí, retirar
              </Button>
            </Stack>
          }
        >
          <Alert tone="warning" title="La ficha se recalcula">
            Sin esta defunción, la persona vuelve a contar en el denominador si no tiene otro certificado. Queda registrado quién la retiró.
          </Alert>
        </Dialog>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ lo de MINSA */

function RegistroMinsa({ fichas, anio, hoy, alGuardar }) {
  const conCalculo = fichas.find((f) => f.tiene_calculo) ?? fichas[0];
  /* Solo los meses ya terminados: de un mes en curso MINSA no publica nada. */
  const cerrados = MESES.filter((m) => new Date(Date.UTC(anio, m, 0)).toISOString().slice(0, 10) < hoy);
  const [form, setForm] = useState({ numero: String(conCalculo?.numero ?? ''), mes: String(cerrados.at(-1) ?? ''), numerador: '', denominador: '', fecha_corte: '', documento: '', observacion: '' });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validar = () => {
    const e = {};
    const n = Number(form.numerador);
    const d = Number(form.denominador);
    if (!/^\d+$/.test(form.numerador)) e.numerador = 'Un número entero, 0 o más.';
    if (!/^\d+$/.test(form.denominador) || d < 1) e.denominador = 'Un número entero, 1 o más.';
    if (!e.numerador && !e.denominador && n > d) e.numerador = 'No puede ser mayor que el denominador.';
    if (!form.numero) e.numero = 'Elija la ficha.';
    if (!form.mes) e.mes = 'Elija el mes.';
    setErrores(e);
    if (!Object.keys(e).length) setConfirmar(true);
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const cuerpo = {
      numero: Number(form.numero), anio, mes: Number(form.mes), numerador: Number(form.numerador), denominador: Number(form.denominador),
      fecha_corte: form.fecha_corte || null, documento: form.documento.trim() || null, observacion: form.observacion.trim() || null,
    };
    const r = await api.desempeno('PUT', '/referencias', { cuerpo });
    setGuardando(false);
    setConfirmar(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const ref = r.body.referencia;
    setForm((f) => ({ ...f, numerador: '', denominador: '', fecha_corte: '', documento: '', observacion: '' }));
    alGuardar(`MINSA, ficha ${String(ref.numero).padStart(2, '0')} de ${mesMinuscula(anio, ref.mes)}: ${ref.numerador}/${ref.denominador}${ref.coincide == null ? '' : ref.coincide ? ', coincide' : ', difiere'}.`);
  };

  const ficha = fichas.find((f) => String(f.numero) === form.numero);
  return (
    <Stack gap={4}>
      <div className="hrl-desempeno-filtros">
        <Input label="Ficha" kind="select" value={form.numero} onChange={campo('numero')} error={errores.numero} options={fichas.map((f) => ({ value: String(f.numero), label: `${String(f.numero).padStart(2, '0')} · ${f.nombre_corto ?? f.nombre}` }))} />
        <Input label="Mes" kind="select" value={form.mes} onChange={campo('mes')} error={errores.mes} options={cerrados.map((m) => ({ value: String(m), label: `${nombreMes(anio, m)} ${anio}` }))} info="Solo los meses ya terminados." />
        <Input label="Numerador" kind="number" required value={form.numerador} onChange={campo('numerador')} error={errores.numerador} info="El numerador del hospital en el reporte de MINSA." />
        <Input label="Denominador" kind="number" required value={form.denominador} onChange={campo('denominador')} error={errores.denominador} />
        <Input label="Fecha de corte" kind="date" value={form.fecha_corte} onChange={campo('fecha_corte')} info="La del reporte de MINSA, si la trae. Los meses terminados hasta ese día se recalculan con lo conocido entonces, como hizo MINSA." />
        <Input label="Documento" value={form.documento} onChange={campo('documento')} placeholder="reporte_minsa_2026_09.xlsx" info="El archivo del que se tomaron las cifras." />
        <Input label="Observación" value={form.observacion} onChange={campo('observacion')} placeholder="Opcional" />
      </div>
      {error && <Alert tone="error" title="No se registró">{error}</Alert>}
      <Stack direction="row" justify="end">
        <Button tone="cta" icon="sh-ok" onClick={validar}>
          Registrar
        </Button>
      </Stack>
      {confirmar && (
        <Dialog
          title="Registrar lo publicado por MINSA"
          subtitle={`Ficha ${form.numero.padStart(2, '0')} · ${nombreMes(anio, Number(form.mes))} ${anio}`}
          onClose={() => setConfirmar(false)}
          maxWidth={560}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
              <Button tone="cta" icon="sh-ok" loading={guardando} loadingText="Guardando…" onClick={guardar}>
                Sí, registrar
              </Button>
            </Stack>
          }
        >
          <Stack gap={3}>
            <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
              MINSA: {form.numerador}/{form.denominador}. Si ese mes ya estaba registrado, se reemplaza.
            </p>
            {form.fecha_corte && ficha?.tiene_calculo && (
              <Alert tone="warning" title={`Con corte del ${fechaCorta(form.fecha_corte)}, la ficha se recalcula`}>
                Los meses terminados hasta esa fecha pasan a calcularse con lo que se sabía ese día. El tablero puede cambiar.
              </Alert>
            )}
          </Stack>
        </Dialog>
      )}
    </Stack>
  );
}

/* ----------------------------------------------------------------- panel */

export default function Carga({ irA }) {
  const resumen = useDesempeno('/resumen');
  useCabeceraDesempeno(resumen.datos);
  const anio = resumen.datos?.anio;
  const fuentes = useDesempeno(anio ? '/fuentes' : null, { anio });
  const historial = useDesempeno(anio ? '/cargas' : null, { anio });
  const referencias = useDesempeno(anio ? '/referencias' : null, { anio });
  const verificadas = useDesempeno(anio ? '/verificadas' : null);

  const recargarTodo = () => {
    resumen.recargar();
    fuentes.recargar();
    historial.recargar();
    referencias.recargar();
    verificadas.recargar();
  };

  const primero = [resumen, fuentes].find((x) => x.error);
  if (primero) return <SinAcceso error={primero.error} status={primero.status} recargar={primero.recargar} />;
  if (!resumen.datos || !fuentes.datos) return <Cargando />;
  return <VistaCarga resumen={resumen} fuentes={fuentes} historial={historial} referencias={referencias} verificadas={verificadas} recargarTodo={recargarTodo} irA={irA} />;
}

/* Lo que se dibuja con todo ya leído (cada lectura es { datos, cargando, error }).
   Aparte para que la prueba de humo lo pinte con datos sin pasar por el servidor. */
export function VistaCarga({ resumen, fuentes, historial, referencias, verificadas, recargarTodo, irA }) {
  const anio = resumen.datos.anio;
  const [editando, setEditando] = useState(null);
  const [retirando, setRetirando] = useState(null); // la carga del historial que se va a retirar
  const [retirandoYa, setRetirandoYa] = useState(false);
  const [falloAlRetirar, setFalloAlRetirar] = useState(null);
  const [verPorObtener, setVerPorObtener] = useState(false);
  const [toast, setToast] = useState(null);
  const [ordenHistorial, setOrdenHistorial] = useState({ key: 'cargado_el', dir: 'desc' });

  const fichas = useMemo(() => resumen.datos.fichas.map((f) => f.ficha), [resumen.datos]);
  const nombres = useMemo(() => Object.fromEntries(fichas.map((f) => [f.numero, f.nombre_corto ?? f.nombre])), [fichas]);

  const { hoy } = fuentes.datos;
  const cargables = fuentes.datos.fuentes.filter((f) => f.cargable);
  const porObtener = fuentes.datos.fuentes.filter((f) => !f.cargable);
  const fichasEnEspera = new Set(porObtener.flatMap((f) => f.fichas)).size;
  /* Solo las cargas mensuales se retiran; las verificadas tienen su apartado. */
  const seRetira = (c) => c.vigente && cargables.some((f) => f.codigo === c.fuente && f.periodicidad === 'mensual');
  const mesesCargadosDe = (codigo) => (fuentes.datos.fuentes.find((f) => f.codigo === codigo)?.meses ?? []).filter((m) => m.carga).map((m) => m.mes);

  const retirar = async () => {
    setRetirandoYa(true);
    setFalloAlRetirar(null);
    const r = await api.desempeno('DELETE', `/fuentes/${encodeURIComponent(retirando.fuente)}/meses/${retirando.mes}`, { params: { anio } });
    setRetirandoYa(false);
    if (!r.ok) {
      setFalloAlRetirar(r.error);
      return;
    }
    setToast(`${retirando.fuente_nombre} de ${mesMinuscula(anio, retirando.mes)}: retirado. La ficha se recalculó.`);
    setRetirando(null);
    recargarTodo();
  };

  const columnasMeses = [
    {
      key: 'nombre',
      label: 'Fuente',
      tooltip: 'El sistema de origen y las fichas que alimenta.',
      render: (f) => (
        <Stack gap={1}>
          <strong>{f.nombre}</strong>
          <span className="hrl-nota">{f.formato ? `${f.formato} · ` : ''}fichas {fichasTexto(f.fichas)}{f.verificadas != null ? ` · ${plural(f.verificadas, 'verificada', 'verificadas')}` : ''}</span>
          <Button tone="link" onClick={() => setEditando(f)}>
            Editar fichas
          </Button>
        </Stack>
      ),
    },
    ...MESES.map((m) => ({
      key: `m${m}`,
      label: nombreMes(anio, m).slice(0, 3),
      width: 64,
      align: 'center',
      tooltip: `${nombreMes(anio, m)} ${anio}`,
      render: (f) => {
        const delMes = f.meses.find((x) => x.mes === m);
        if (!delMes) return <span className="hrl-nota">—</span>;
        const c = delMes.carga;
        const detalle = c ? `${c.archivo} · ${plural(c.filas, 'fila', 'filas')}${c.fecha_extraccion ? ` · descargado el ${fechaCorta(c.fecha_extraccion)}` : ''}${delMes.versiones > 1 ? ` · ${delMes.versiones} versiones` : ''}.` : '';
        return <EstadoDeCarga estado={delMes.estado} detalle={detalle} />;
      },
    })),
  ];

  const columnasPorObtener = [
    {
      key: 'nombre',
      label: 'Fuente',
      tooltip: 'El sistema o registro que el hospital todavía no descarga, y con quién gestionarlo. Abre sus fichas y su área.',
      render: (f) => (
        <Stack gap={1}>
          <Button tone="link" onClick={() => setEditando(f)}>
            {f.nombre}
          </Button>
          <span className="hrl-nota">{f.area_responsable ?? 'Sin área responsable'}</span>
        </Stack>
      ),
    },
    { key: 'fichas', label: 'Fichas', width: 200, tooltip: 'Las fichas que dependen de ella. Mientras falte, quedan sin resultado.', render: (f) => fichasTexto(f.fichas) },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (f) => (
        <div className="hrl-acciones-icono">
          <IconButton icon="sh-pencil" tone="action" aria-label={`Editar ${f.nombre}`} onClick={() => setEditando(f)} />
        </div>
      ),
    },
  ];

  const columnasMinsa = [
    { key: 'numero', label: 'Ficha', width: 70, tooltip: 'El número de la ficha.', render: (r) => (
      <Button tone="link" onClick={() => irA('monitoreo', { ficha: String(r.numero) })}>
        {String(r.numero).padStart(2, '0')}
      </Button>
    ) },
    { key: 'mes', label: 'Mes', width: 120, tooltip: 'El mes publicado.', render: (r) => `${nombreMes(r.anio, r.mes)}` },
    { key: 'minsa', label: 'MINSA', width: 100, align: 'right', tooltip: 'Numerador / denominador publicados.', render: (r) => `${r.numerador}/${r.denominador}` },
    { key: 'calculado', label: 'Hospital', width: 100, align: 'right', tooltip: 'Lo que calcula el hospital para ese mes.', render: (r) => (r.calculado ? `${r.calculado.numerador}/${r.calculado.denominador}` : 'sin cálculo') },
    { key: 'coincide', label: 'Comparación', width: 130, tooltip: 'Si las dos cifras son iguales.', render: (r) => (r.coincide == null ? '—' : <Badge label={r.coincide ? 'Coincide' : 'Difiere'} tone={r.coincide ? 'ok' : 'warn'} />) },
    { key: 'fecha_corte', label: 'Corte', width: 110, tooltip: 'La fecha de corte del reporte de MINSA. Sin ella, la cifra solo sirve para comparar.', render: (r) => (r.fecha_corte ? fechaCorta(r.fecha_corte) : '—') },
    { key: 'documento', label: 'Documento', tooltip: 'De dónde se tomaron las cifras.', render: (r) => r.documento ?? r.observacion ?? '—' },
  ];

  const columnasHistorial = [
    { key: 'cargado_el', label: 'Cargado', width: 160, sortable: true, tooltip: 'Cuándo se subió.', render: (c) => fechaHora(c.cargado_el) },
    { key: 'fuente_nombre', label: 'Fuente', width: 170, sortable: true, tooltip: 'El sistema de origen.' },
    { key: 'mes', label: 'Mes', width: 110, sortable: true, numeric: true, tooltip: 'El mes de los datos.', render: (c) => nombreMes(c.anio, c.mes) },
    { key: 'archivo', label: 'Archivo', tooltip: 'El archivo tal como se subió, y su huella (SHA-256) para saber exactamente cuál se usó.', render: (c) => (
      <Stack gap={1}>
        <span style={{ overflowWrap: 'anywhere' }}>{c.archivo}</span>
        <span className="hrl-nota">huella {c.huella.slice(0, 12)}…{c.fecha_extraccion ? ` · descargado el ${fechaCorta(c.fecha_extraccion)}` : ''}</span>
      </Stack>
    ) },
    { key: 'filas', label: 'Filas', width: 90, align: 'right', numeric: true, tooltip: 'Filas de ese mes.', render: (c) => numero(c.filas) },
    { key: 'version', label: 'Versión', width: 90, align: 'right', numeric: true, tooltip: 'Cuántas veces se cargó ese mes de esa fuente.' },
    {
      key: 'vigente',
      label: 'Estado',
      width: 130,
      tooltip: 'Vigente: la que usa el cálculo. Reemplazada: la sustituyó una carga posterior. Retirada: se quitó y su mes quedó sin datos.',
      render: (c) =>
        c.retirada_el ? (
          <Tooltip title="Retirada" body={`Se retiró el ${fechaHora(c.retirada_el)}. Para recuperarla se sube otra vez el archivo.`}>
            <Badge label="Retirada" tone="warn" />
          </Tooltip>
        ) : (
          <Badge label={c.vigente ? 'Vigente' : 'Reemplazada'} tone={c.vigente ? 'ok' : 'none'} />
        ),
    },
    { key: 'cargado_por', label: 'Por', width: 140, tooltip: 'La cuenta que lo subió.', render: (c) => c.cargado_por ?? '—' },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (c) =>
        seRetira(c) && (
          <div className="hrl-acciones-icono">
            <Tooltip title="Retirar esta carga" body="Quita los datos de ese mes y recalcula. Antes pide confirmación." focusable={false}>
              <IconButton icon="sh-trash" className="hrl-accion--peligro" aria-label={`Retirar ${c.fuente_nombre} de ${nombreMes(c.anio, c.mes)}`} onClick={() => setRetirando(c)} />
            </Tooltip>
          </div>
        ),
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <QueSubir porSubir={fuentes.datos.por_subir ?? []} anio={anio} />

      <Subida
        nombres={nombres}
        alCargar={(r) => {
          setToast(`${r.revision.fuente_nombre} cargado.`);
          recargarTodo();
        }}
      />

      <Card
        accent="var(--info)"
        icon="sh-calendar"
        title={`Meses cargados de cada fuente · ${anio}`}
        subtitle="Un mes terminado sin datos aparece como «Falta», no como cero. Pase el cursor por cada mes."
        actions={
          <Tooltip title="Volver a leer" body="Pide el estado de las fuentes otra vez al servidor." focusable={false}>
            <Button tone="ghost" size="sm" icon="sh-swap" onClick={recargarTodo} loading={fuentes.cargando}>
              Actualizar
            </Button>
          </Tooltip>
        }
        flush
      >
        <DataTable
          columns={columnasMeses}
          rows={cargables}
          rowKey={(f) => f.codigo}
          legend={
            <Stack direction="row" gap={4} wrap>
              {['cierre', 'preliminar', 'recargar', 'sin_fecha', 'falta', 'futuro'].map((e) => (
                <Stack key={e} direction="row" gap={2} align="center">
                  <Badge label={ESTADO_CARGA[e].corto} tone={ESTADO_CARGA[e].tono} />
                  <span>{ESTADO_CARGA[e].etiqueta}</span>
                </Stack>
              ))}
            </Stack>
          }
        />
      </Card>

      {/* Plegada: son las fuentes de las otras fichas, no lo que se carga cada mes. */}
      <Card
        accent="var(--warning)"
        icon="sh-folder"
        title="Fuentes por obtener"
        subtitle={
          porObtener.length
            ? `El hospital todavía no descarga ${plural(porObtener.length, 'fuente', 'fuentes')}. Mientras falten, ${plural(fichasEnEspera, 'ficha queda', 'fichas quedan')} sin resultado (no en cero).`
            : 'Todas las fuentes se pueden cargar.'
        }
        actions={
          porObtener.length > 0 && (
            <Button tone="ghost" size="sm" icon={verPorObtener ? 'sh-eye-off' : 'sh-eye'} onClick={() => setVerPorObtener((v) => !v)}>
              {verPorObtener ? 'Ocultar' : `Ver las ${porObtener.length}`}
            </Button>
          )
        }
        flush={verPorObtener}
        wide
      >
        {verPorObtener && <PaginatedTable columns={columnasPorObtener} rows={porObtener} rowKey={(f) => f.codigo} presorted empty="Todas las fuentes se pueden cargar." />}
      </Card>

      <Verificadas
        lectura={verificadas}
        hoy={hoy}
        alCambiar={(t) => {
          setToast(t);
          recargarTodo();
        }}
      />

      <Card accent="var(--primary)" icon="sh-stamp" title="Lo publicado por MINSA" subtitle="Busque la fila del hospital en el Excel de MINSA y copie el numerador y el denominador del mes. Sirve para comparar con el cálculo del hospital." wide>
        <Stack gap={5} className="hrl-cuerpo">
          <RegistroMinsa
            fichas={fichas.filter((f) => f.aplica)}
            anio={anio}
            hoy={hoy}
            alGuardar={(t) => {
              setToast(t);
              recargarTodo();
            }}
          />
          {referencias.error && <Alert tone="error" title="No se pudo leer lo registrado de MINSA">{referencias.error}</Alert>}
          <DataTable columns={columnasMinsa} rows={referencias.datos ?? []} loading={referencias.cargando && !referencias.datos} rowKey={(r) => `${r.numero}-${r.mes}`} empty={`Todavía no hay nada registrado de MINSA para ${anio}.`} />
        </Stack>
      </Card>

      <Card accent="var(--neutral-text)" icon="sh-clock" title="Historial de cargas" subtitle={`Cada archivo de ${anio}, con su huella y su fecha de descarga. Una carga reemplazada sigue aquí.`} flush>
        {historial.error && <Alert tone="error" title="No se pudo leer el historial">{historial.error}</Alert>}
        <PaginatedTable columns={columnasHistorial} rows={historial.datos ?? []} sort={ordenHistorial} onSortChange={setOrdenHistorial} loading={historial.cargando && !historial.datos} rowKey={(c) => c.lote_mes_id} empty={`Todavía no se cargó ningún archivo de ${anio}.`} />
      </Card>

      {editando && (
        <EditarFuente
          fuente={editando}
          fichas={fichas.filter((f) => f.aplica)}
          anio={anio}
          alCerrar={() => setEditando(null)}
          alGuardar={(t) => {
            setEditando(null);
            setToast(t);
            recargarTodo();
          }}
        />
      )}
      {retirando && (
        <Dialog
          title={`Retirar ${retirando.fuente_nombre} de ${mesMinuscula(anio, retirando.mes)}`}
          subtitle={retirando.archivo}
          onClose={() => setRetirando(null)}
          maxWidth={560}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setRetirando(null)}>
                Cancelar
              </Button>
              <Button tone="danger" icon="sh-trash" loading={retirandoYa} loadingText="Retirando…" onClick={retirar}>
                Sí, retirar
              </Button>
            </Stack>
          }
        >
          <Stack gap={3}>
            <Alert tone="warning" title="Qué pasa al retirarla">
              {consecuenciaDeRetirar(retirando, mesesCargadosDe(retirando.fuente), anio)}
            </Alert>
            <p className="hrl-nota">
              Se borran las {plural(retirando.filas, 'fila', 'filas')} de ese mes y se recalcula. No vuelve la versión anterior: para recuperarla se sube otra vez el archivo. Queda en el historial como «Retirada».
            </p>
            {falloAlRetirar && <Alert tone="error" title="No se retiró">{falloAlRetirar}</Alert>}
          </Stack>
        </Dialog>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
