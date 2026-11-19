/* Plazos y calendario: el día límite de cada área, el respaldo general, la
   regla de día hábil con sus feriados y el umbral de la alerta de semanas
   incompletas.

   Cambiar un plazo cambia la fecha límite que ve todo el sistema (la lista de
   reportes, la cabecera, los avisos) desde ese momento: el servidor la calcula
   en un solo lugar. */

import { useState } from 'react';
import { Alert, Button, Card, DataTable, Dialog, IconButton, Input, Mosaic, Stack, Switch, Toast, Tooltip } from '@hrl/core-ui';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import * as api from '@/app/servicios/api.js';
import { useAdmin, Cargando, ErrorDeCarga, dia } from './comunes.jsx';

const diaONulo = (v) => (v === '' || v == null ? null : Number(v));

function DialogoPlazo({ area, alCerrar, alGuardar }) {
  const [plazo, setPlazo] = useState(area.dia_propio ?? '');
  const [alerta, setAlerta] = useState(area.alerta_dias_propio ?? '');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    setEnviando(true);
    setError(null);
    const r1 = await api.admin('PUT', '/plazos', { area: area.codigo, destino: 'estadistica', dia: diaONulo(plazo) });
    const r2 = r1.ok ? await api.admin('PUT', '/alertas', { area: area.codigo, dias: diaONulo(alerta) }) : r1;
    setEnviando(false);
    if (r1.ok && r2.ok) alGuardar(`Plazo de ${area.nombre} guardado.`);
    else setError((r1.ok ? r2 : r1).error);
  };

  return (
    <Dialog title={`Plazo de ${area.nombre}`} subtitle="Vacío: usa el general" onClose={alCerrar} maxWidth={520}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button icon="sh-ok" loading={enviando} onClick={guardar}>
            Guardar
          </Button>
        </Stack>
      }
    >
      <Stack gap={4}>
        <Input label="Día límite de entrega a Estadística" kind="number" value={plazo} onChange={(e) => setPlazo(e.target.value)} info={`Del 1 al 28 del mes siguiente. Hoy rige el día ${area.dia_efectivo}.`} />
        <Input label="Días sin datos para avisar" kind="number" value={alerta} onChange={(e) => setAlerta(e.target.value)} info={`Del 1 al 7: con cuántos días vacíos en una semana se avisa al área. Hoy, ${area.alerta_dias_efectivo}.`} />
        {error && <Alert tone="error" title="No se guardó">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

function PlazosGenerales({ datos, alGuardar }) {
  const [valores, setValores] = useState({ estadistica: datos.respaldo_estadistica ?? '', planeamiento: datos.respaldo_planeamiento ?? '', diresa: datos.dia_diresa ?? '', alerta: datos.alerta_respaldo ?? '' });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k, v) => setValores((x) => ({ ...x, [k]: v }));
  const rigeSinPropio = datos.areas.find((a) => a.dia_propio == null)?.dia_efectivo ?? 10;

  const guardar = async () => {
    setEnviando(true);
    setError(null);
    const pasos = [
      ['PUT', '/plazos', { area: 'default', destino: 'estadistica', dia: diaONulo(valores.estadistica) }],
      ['PUT', '/plazos', { area: 'default', destino: 'planeamiento', dia: diaONulo(valores.planeamiento) }],
      ['PUT', '/plazos', { area: 'EST', destino: 'diresa', dia: diaONulo(valores.diresa) }],
      ['PUT', '/alertas', { area: 'default', dias: diaONulo(valores.alerta) }],
    ];
    for (const [m, ruta, cuerpo] of pasos) {
      const r = await api.admin(m, ruta, cuerpo);
      if (!r.ok) {
        setEnviando(false);
        setError(r.error);
        return;
      }
    }
    setEnviando(false);
    alGuardar('Plazos generales guardados.');
  };

  return (
    <Card accent="var(--primary)" icon="sh-calendar" title="Plazos generales" subtitle="Valen para toda área sin plazo propio">
      <div className="hrl-cuerpo">
        <Stack gap={4}>
          <Input
            label="Entrega a Estadística (día)"
            kind="number"
            value={valores.estadistica}
            onChange={(e) => cambiar('estadistica', e.target.value)}
            info="Del mes siguiente. Obligatorio: es el respaldo de todas."
            hint={datos.respaldo_estadistica == null ? `Sin configurar en la base: hoy rige el día ${rigeSinPropio}, el respaldo escrito en el código.` : undefined}
            required
          />
          <Input label="Entrega a Planeamiento (día)" kind="number" value={valores.planeamiento} onChange={(e) => cambiar('planeamiento', e.target.value)} info="CEPLAN cierra su aplicativo ese día. Vacío: sin plazo propio." />
          <Input label="Remisión de Estadística a DIRESA (día)" kind="number" value={valores.diresa} onChange={(e) => cambiar('diresa', e.target.value)} info="Del mes siguiente al periodo." />
          <Input label="Alerta de semana incompleta (días)" kind="number" value={valores.alerta} onChange={(e) => cambiar('alerta', e.target.value)} info="Del 1 al 7. Vacío: 1 día." />
          {error && <Alert tone="error" title="No se guardó todo">{error}</Alert>}
          <Stack direction="row" justify="end">
            <Button icon="sh-ok" loading={enviando} onClick={guardar}>
              Guardar los generales
            </Button>
          </Stack>
        </Stack>
      </div>
    </Card>
  );
}

function Calendario({ datos, alGuardar }) {
  const [nuevo, setNuevo] = useState({ fecha: '', descripcion: '' });
  const [quitar, setQuitar] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const hacer = async (que, metodo, ruta, cuerpo, mensaje) => {
    setOcupado(que);
    setError(null);
    const r = await api.admin(metodo, ruta, cuerpo);
    setOcupado(null);
    if (r.ok) alGuardar(mensaje);
    else setError(r.error);
    return r.ok;
  };

  return (
    <Card accent="var(--info)" icon="sh-calendar" title="Día hábil y feriados" subtitle="Qué pasa cuando un plazo cae en fin de semana o feriado">
      <div className="hrl-cuerpo">
        <Stack gap={4}>
          <Switch
            label="Correr el plazo al siguiente día hábil"
            checked={datos.correr_a_dia_habil}
            onChange={(v) => hacer('regla', 'PUT', '/plazos/dia-habil', { activa: v }, v ? 'Los plazos que caen en fin de semana o feriado se corren al siguiente día hábil.' : 'Los plazos vuelven a vencer el día exacto, caiga donde caiga.')}
            description={datos.correr_a_dia_habil ? 'Activado: un plazo en sábado, domingo o feriado vence el siguiente día hábil' : 'Desactivado: vence el día que diga el plazo, caiga donde caiga'}
          />
          {!datos.correr_a_dia_habil && datos.feriados.length > 0 && (
            <Alert tone="info" title="Los feriados no cuentan mientras la regla esté desactivada">Se guardan, pero ningún plazo se corre por ellos.</Alert>
          )}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {datos.feriados.length === 0 && <li style={{ color: 'var(--muted-foreground)' }}>Sin feriados registrados.</li>}
            {datos.feriados.map((f) => (
              <li key={f.fecha} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <span>
                  <strong>{dia(f.fecha)}</strong> · {f.descripcion}
                </span>
                <IconButton icon="sh-trash" aria-label={`Quitar el feriado del ${dia(f.fecha)}`} onClick={() => setQuitar(f)} />
              </li>
            ))}
          </ul>
          <Stack direction="row" gap={3} align="end" wrap>
            <Input label="Fecha" kind="date" value={nuevo.fecha} onChange={(e) => setNuevo((n) => ({ ...n, fecha: e.target.value }))} />
            <div style={{ flex: '1 1 220px' }}>
              <Input label="Feriado" value={nuevo.descripcion} onChange={(e) => setNuevo((n) => ({ ...n, descripcion: e.target.value }))} info="Por ejemplo: Combate de Angamos." />
            </div>
            <Button
              tone="ghost"
              icon="sh-calendar"
              disabled={!nuevo.fecha || !nuevo.descripcion.trim()}
              loading={ocupado === 'feriado'}
              onClick={async () => {
                if (await hacer('feriado', 'POST', '/feriados', nuevo, `Feriado del ${dia(nuevo.fecha)} registrado.`)) setNuevo({ fecha: '', descripcion: '' });
              }}
            >
              Agregar feriado
            </Button>
          </Stack>
          {error && <Alert tone="error" title="No se guardó">{error}</Alert>}
        </Stack>
      </div>
      {quitar && (
        <Dialog title={`¿Quitar el feriado del ${dia(quitar.fecha)}?`} subtitle={quitar.descripcion} onClose={() => setQuitar(null)} maxWidth={480}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setQuitar(null)}>
                Cancelar
              </Button>
              <Button tone="danger" loading={ocupado === 'quitar'} onClick={async () => { await hacer('quitar', 'DELETE', `/feriados/${quitar.fecha}`, undefined, 'Feriado quitado.'); setQuitar(null); }}>
                Quitar
              </Button>
            </Stack>
          }
        >
          <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
            Con la regla de día hábil activada, un plazo que caiga ese día dejará de correrse: vencerá ese mismo día.
          </p>
        </Dialog>
      )}
    </Card>
  );
}

export default function Plazos() {
  const { datos, cargando, error, recargar } = useAdmin('/plazos');
  const [editando, setEditando] = useState(null);
  const [toast, setToast] = useState(null);
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorDeCarga error={error} recargar={recargar} />;

  const guardado = (mensaje) => {
    setEditando(null);
    setToast(mensaje);
    recargar();
  };

  const columnas = [
    {
      key: 'nombre',
      label: 'Área',
      tooltip: 'Abre su plazo para cambiarlo.',
      render: (a) => (
        <Button tone="link" onClick={() => setEditando(a)}>
          {a.nombre}
        </Button>
      ),
    },
    { key: 'propio', label: 'Plazo propio', width: 130, tooltip: 'El día fijado para esta área. Vacío: usa el general.', render: (a) => (a.dia_propio ? `Día ${a.dia_propio}` : 'El general') },
    { key: 'efectivo', label: 'Rige', width: 100, tooltip: 'El día que de verdad se aplica.', render: (a) => `Día ${a.dia_efectivo}` },
    { key: 'vence', label: `Vence ${etiquetaPeriodo(datos.periodo_vigente).toLowerCase()}`, width: 190, tooltip: 'La fecha límite del mes en curso, ya con la regla de día hábil.', render: (a) => dia(a.fecha_limite_vigente) },
    { key: 'alerta', label: 'Alerta', width: 120, tooltip: 'Días vacíos en una semana a partir de los que se avisa al área.', render: (a) => `${a.alerta_dias_efectivo} ${a.alerta_dias_efectivo === 1 ? 'día' : 'días'}` },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (a) => (
        <Tooltip title="Cambiar" body={`El plazo y la alerta de ${a.nombre}.`} focusable={false}>
          <IconButton icon="sh-pencil" tone="action" aria-label={`Cambiar el plazo de ${a.nombre}`} onClick={() => setEditando(a)} />
        </Tooltip>
      ),
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <PlazosGenerales key={JSON.stringify([datos.respaldo_estadistica, datos.respaldo_planeamiento, datos.dia_diresa, datos.alerta_respaldo])} datos={datos} alGuardar={guardado} />
      <Calendario datos={datos} alGuardar={guardado} />
      <Card accent="var(--primary)" icon="sh-table" title="Plazo de cada área" subtitle="Entrega a Estadística, con la fecha real del mes en curso" total={`${datos.areas.length} áreas`} flush>
        <DataTable columns={columnas} rows={datos.areas} rowKey={(a) => a.codigo} />
      </Card>
      {editando && <DialogoPlazo area={editando} alCerrar={() => setEditando(null)} alGuardar={guardado} />}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
