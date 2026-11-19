/* Los pacientes del mes elegido: quiénes son y qué le pasa a cada uno.

   Sigue al mes que se elige en el tablero: el de septiembre muestra los que
   todavía pueden sumar; uno ya cerrado, quiénes llegaron a tiempo y quiénes
   no. Trae nombre, DNI e historia clínica (GET …/casos?mes=), así que la
   sección está siempre, plegada, y la lista se lee al desplegarla. Lo ven
   Estadística y el superadministrador (`desempeno.ver`); anotar el seguimiento
   es del superadministrador (`puede_editar`, que dice el servidor), y solo en
   los casos que todavía pueden sumar.

   El seguimiento no cambia el indicador: un caso marcado «tratado» o
   «corregido» suma solo cuando la siguiente carga del HIS lo confirma. */

import { useState } from 'react';
import { Alert, Badge, Button, Card, DetailDialog, Field, IconButton, Input, PaginatedTable, Stack, Toast, Tooltip } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';
import { fechaCorta, fechaHora } from '@/app/dominio/formato.js';
import { CLASES, diaMes, mesMinuscula, nombreMes, plural, prioridad, URGENTE_DIAS } from '@/app/dominio/desempeno.js';
import { useDesempeno } from './comunes.jsx';

const nombreDe = (p) => (p ? [[p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' '), p.nombres].filter(Boolean).join(', ') : null);
const documentoDe = (c) => `${c.tipo_documento ?? 'Doc.'} ${c.numero_documento}`;
const claseDe = (c) => CLASES.find((k) => k.clave === c.clase) ?? CLASES.at(-1);

function Seguimiento({ caso, editable, guardando, onCambiar }) {
  if (!caso.opciones.length) return <span className="hrl-nota">—</span>;
  const actual = caso.seguimiento?.estado ?? caso.opciones[0];
  const quien = caso.seguimiento?.por ? `${caso.seguimiento.por}, ${fechaHora(caso.seguimiento.el)}` : null;
  return (
    <Stack gap={1}>
      {editable ? (
        <Input
          label={`Seguimiento de ${nombreDe(caso.paciente) ?? documentoDe(caso)}`}
          labelHidden
          kind="select"
          value={actual}
          options={caso.opciones}
          disabled={guardando}
          onChange={(e) => onCambiar(caso, e.target.value)}
        />
      ) : (
        <span>{actual}</span>
      )}
      {quien && <span className="hrl-nota">{quien}</span>}
    </Stack>
  );
}

/* La situación de un caso, como insignia; con plazo vigente, cuántos días le quedan. */
function Situacion({ caso }) {
  const k = claseDe(caso);
  if (caso.clase === 'plazo_vigente') {
    const p = prioridad(caso.dias_restantes);
    return (
      <Tooltip title={`Vence el ${fechaCorta(caso.vence)} · ${p.etiqueta.toLowerCase()}`} body={`${plural(caso.dias_restantes, 'día', 'días')} para iniciar el tratamiento. Urgente: ${URGENTE_DIAS} días o menos.`}>
        <Badge label={`${k.etiqueta} · ${plural(caso.dias_restantes, 'día', 'días')}`} tone={p.tono === 'none' ? k.tono : p.tono} />
      </Tooltip>
    );
  }
  return (
    <Tooltip title={k.etiqueta} body={k.ayuda}>
      <Badge label={k.etiqueta} tone={k.tono} />
    </Tooltip>
  );
}

const QUE_PASA = {
  plazo_vigente: (c) => ({ title: 'Qué falta', text: `Todavía no tiene tratamiento registrado en el HIS. Si inicia antes del ${fechaCorta(c.vence)}, suma al numerador.` }),
  por_corregir: (c, textos) => ({ title: 'Qué corregir', text: textos.por_corregir?.[c.motivo] ?? 'El registro del tratamiento no cumple la regla de la ficha.' }),
  a_tiempo: () => ({ title: 'Suma', text: 'Inició tratamiento dentro del plazo y está bien registrado.' }),
  esperando_datos: (c) => ({ title: 'Falta subir datos', text: `Su plazo venció el ${fechaCorta(c.vence)}, pero los datos cargados no llegan hasta ese día: su tratamiento puede estar en una trama que falta subir. Hasta entonces no se puede decir que no se trató.` }),
  sin_tratamiento: (c) => ({ title: 'No suma', text: `No tiene tratamiento registrado en el HIS dentro del plazo, que venció el ${fechaCorta(c.vence)}. Conviene revisar si se trató sin registrar o en otra institución.` }),
};

function DetalleDelCaso({ caso, textos, anio, onClose }) {
  const k = claseDe(caso);
  return (
    <DetailDialog
      icon="sh-profile"
      tone={k.color}
      badge={{ label: k.etiqueta, tone: k.tono }}
      title={nombreDe(caso.paciente) ?? documentoDe(caso)}
      subtitle={`${caso.nombre_categoria} · diagnóstico de ${mesMinuscula(anio, caso.mes)}`}
      fields={
        <>
          <Field k="Documento" v={documentoDe(caso)} mono />
          <Field k="Historia clínica" v={caso.paciente?.historia_clinica} mono />
          <Field k="Diagnóstico" v={fechaCorta(caso.fecha_diagnostico)} />
          <Field k="Vence el plazo" v={fechaCorta(caso.vence)} />
          {caso.fecha_atencion && <Field k="Atención por corregir" v={fechaCorta(caso.fecha_atencion)} />}
          {caso.cierre_his && <Field k="Se corrige hasta" v={fechaCorta(caso.cierre_his)} />}
          {caso.opciones.length > 0 && <Field k="Seguimiento" v={caso.seguimiento?.estado ?? caso.opciones[0]} />}
        </>
      }
      block={(QUE_PASA[caso.clase] ?? QUE_PASA.sin_tratamiento)(caso, textos)}
      note="Datos de salud de una persona: no se copian fuera del sistema."
      onClose={onClose}
    />
  );
}

/* `mes`: el objeto del mes elegido (sus cuentas por situación), del resultado. */
export default function Casos({ numero, anio, mes, abierto, alternar }) {
  const { datos, cargando, error, recargar } = useDesempeno(abierto ? `/fichas/${numero}/casos` : null, { anio, mes: mes.mes });
  const [cambios, setCambios] = useState({});
  const [guardando, setGuardando] = useState(null);
  const [toast, setToast] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [visto, setVisto] = useState(null);

  const casos = (datos?.casos ?? []).map((c) => cambios[c.id] ?? c);
  const editable = Boolean(datos?.puede_editar);
  const resumen = CLASES.filter((k) => mes[k.clave]).map((k) => `${mes[k.clave]} ${k.etiqueta.toLowerCase()}`).join(' · ');

  const cambiar = async (caso, estado) => {
    setGuardando(caso.id);
    setFallo(null);
    const r = await api.desempeno('PUT', `/fichas/${numero}/casos/${caso.id}`, { params: { anio }, cuerpo: { estado } });
    setGuardando(null);
    if (!r.ok) {
      setFallo(r.error);
      return;
    }
    setCambios((c) => ({ ...c, [caso.id]: { ...caso, ...r.body } }));
    setToast(`Seguimiento anotado: ${estado.toLowerCase()}.`);
  };

  const columnas = [
    {
      key: 'paciente',
      label: 'Paciente',
      tooltip: 'Nombre y documento de la atención más reciente en el HIS cargado. Abre el detalle del caso.',
      render: (c) => (
        <Stack gap={1}>
          <Button tone="link" onClick={() => setVisto(c)}>
            {nombreDe(c.paciente) ?? documentoDe(c)}
          </Button>
          <span className="hrl-nota">
            {documentoDe(c)}
            {c.paciente?.historia_clinica ? ` · HC ${c.paciente.historia_clinica}` : ''}
          </span>
        </Stack>
      ),
    },
    { key: 'nombre_categoria', label: 'Tipo', width: 150, tooltip: 'La categoría del caso según la ficha técnica.' },
    { key: 'fecha_diagnostico', label: 'Diagnóstico', width: 110, tooltip: 'Fecha del diagnóstico definitivo.', render: (c) => fechaCorta(c.fecha_diagnostico) },
    {
      key: 'situacion',
      label: 'Situación',
      width: 250,
      tooltip: 'Qué le pasa hoy. Lo que todavía puede sumar va primero.',
      render: (c) => (
        <Stack gap={1}>
          <Situacion caso={c} />
          {c.clase === 'por_corregir' && <span className="hrl-nota">{datos?.textos?.por_corregir?.[c.motivo] ?? ''} Hasta el {diaMes(c.cierre_his)}.</span>}
        </Stack>
      ),
    },
    {
      key: 'seguimiento',
      label: 'Seguimiento',
      width: 230,
      tooltip: editable ? 'Qué se está haciendo con el caso. Solo en los que todavía pueden sumar.' : 'Qué se está haciendo con el caso. Lo anota el superadministrador.',
      render: (c) => <Seguimiento caso={c} editable={editable} guardando={guardando === c.id} onCambiar={cambiar} />,
    },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (c) => (
        <div className="hrl-acciones-icono">
          <IconButton icon="sh-eye" tone="action" aria-label={`Ver el caso de ${nombreDe(c.paciente) ?? documentoDe(c)}`} onClick={() => setVisto(c)} />
        </div>
      ),
    },
  ];

  return (
    <Card
      accent={mes.por_gestionar ? 'var(--warning)' : 'var(--primary)'}
      icon="sh-people"
      title={`Pacientes de ${mesMinuscula(anio, mes.mes)} ${anio}`}
      subtitle={`${plural(mes.denominador, 'paciente', 'pacientes')}${resumen ? `: ${resumen}` : ''}. La lista trae nombre y documento: se lee al desplegarla.`}
      actions={
        <Stack direction="row" gap={2} wrap>
          {abierto && (
            <Tooltip title="Volver a leer" body="Pide los pacientes otra vez al servidor." focusable={false}>
              <IconButton icon="sh-swap" aria-label="Actualizar los pacientes" onClick={recargar} />
            </Tooltip>
          )}
          <Button tone={abierto ? 'ghost' : 'cta'} size="sm" icon={abierto ? 'sh-eye-off' : 'sh-eye'} onClick={alternar} disabled={!mes.denominador}>
            {abierto ? 'Ocultar' : `Mostrar los pacientes de ${nombreMes(anio, mes.mes).toLowerCase()}`}
          </Button>
        </Stack>
      }
      wide
    >
      {abierto && (
        <Stack gap={4} className="hrl-cuerpo">
          {error ? (
            <Alert tone="error" title="No se pudieron leer los pacientes" action={<Button tone="ghost" icon="sh-swap" onClick={recargar}>Reintentar</Button>}>
              {error}
            </Alert>
          ) : (
            <>
              {fallo && <Alert tone="error" title="No se anotó el seguimiento">{fallo}</Alert>}
              <PaginatedTable columns={columnas} rows={casos} rowKey={(c) => c.id} loading={cargando && !datos} accent="var(--primary)" presorted empty={`Ningún paciente en ${mesMinuscula(anio, mes.mes)}.`} />
              <p className="hrl-nota">
                {datos?.datos_al ? `Datos del HIS al ${fechaCorta(datos.datos_al)}. ` : ''}El seguimiento no cambia el indicador: los casos marcados como tratados o corregidos suman cuando la siguiente carga del HIS lo confirma.
              </p>
            </>
          )}
        </Stack>
      )}
      {visto && <DetalleDelCaso caso={casos.find((c) => c.id === visto.id) ?? visto} textos={datos?.textos ?? {}} anio={anio} onClose={() => setVisto(null)} />}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}
