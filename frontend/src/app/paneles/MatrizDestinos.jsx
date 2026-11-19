/* Matriz de destinos: qué oficina recibe el reporte de cada área.

   Es el único panel funcional de la Fase 0, y no por relleno: es el dato del
   que dependen la remisión, la bandeja de cada oficina y la promesa de que
   Planeamiento recibe siempre lo que necesita. Verlo dibujado es la forma de
   confirmar que se levantó bien antes de construir encima.

   Se pinta distinto según quién mire:
     Estadística → la matriz completa, nueve áreas por cinco receptores
     un área     → solo sus destinos, con el motivo de cada uno
     una oficina → solo las áreas que la alimentan */

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, DetailDialog, Field, Icon, IconButton, Mosaic, Tooltip } from '@hrl/core-ui';
import { AREAS, area, areasQueRemitenA, destinosDe } from '@/app/datos/areas.js';
import { OFICINAS, ESTADISTICA, nombreOficina, oficina } from '@/app/datos/oficinas.js';
import { ROL } from '@/app/dominio/roles.js';

/* Columnas de receptor: Estadística primero porque no es un destino más: la
   recibe siempre, de las nueve áreas. Ya no valida (12/10/2026): lo hace el bot
   antes de que el reporte salga del área. */
const RECEPTORES = [
  { clave: ESTADISTICA.clave, nombre: ESTADISTICA.nombre, sigla: ESTADISTICA.sigla, obligatorio: true,
    motivo: 'Recibe el reporte de las nueve áreas, ya validado por el bot, y lo consolida para DIRESA y el boletín.' },
  ...OFICINAS.map((o) => ({ clave: o.clave, nombre: o.nombre, sigla: o.sigla, motivo: o.motivo })),
];

function Marca({ presente, obligatorio }) {
  if (!presente) {
    return (
      <span style={{ color: 'var(--subtle-foreground)' }} aria-label="No recibe">
        <Icon name="sh-none" size={16} />
      </span>
    );
  }
  /* El color no es la única señal: el icono distingue el receptor obligatorio
     del que depende de la matriz. */
  return (
    <span style={{ color: obligatorio ? 'var(--primary-strong)' : 'var(--success-text)' }} aria-label="Recibe">
      <Icon name={obligatorio ? 'sh-shield' : 'sh-check'} size={16} />
    </span>
  );
}

function columnas(onVer) {
  return [
    {
      key: 'area',
      label: 'Área que reporta',
      width: 260,
      sortable: true,
      tooltip: 'Servicio, departamento u oficina que entrega un reporte mensual.',
      render: (f) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--muted-foreground)', flex: '0 0 auto' }}>
            <Icon name={f.icono} size={17} />
          </span>
          {/* La columna del identificador es el enlace que abre el registro. */}
          <Button tone="link" onClick={() => onVer(f)}>
            {f.nombreCorto}
          </Button>
        </span>
      ),
    },
    ...RECEPTORES.map((r) => ({
      key: r.clave,
      label: r.sigla,
      width: 96,
      align: 'center',
      tooltip: `${r.nombre}. ${r.motivo}`,
      render: (f) => <Marca presente={f.destinos.includes(r.clave)} obligatorio={r.obligatorio} />,
    })),
    {
      key: 'cuantos',
      label: 'Receptores',
      width: 110,
      align: 'right',
      sortable: true,
      numeric: true,
      tooltip: 'Cuántas oficinas reciben este reporte, contando a Estadística.',
      render: (f) => f.destinos.length,
    },
    {
      key: 'acciones',
      label: '',
      width: 64,
      align: 'right',
      render: (f) => (
        <div className="hrl-acciones-icono">
          <Tooltip title="Ver el detalle" body="Abre los destinos de esta área y el motivo de cada uno." focusable={false}>
            <IconButton icon="sh-eye" tone="action" aria-label={`Ver los destinos de ${f.nombreCorto}`} onClick={() => onVer(f)} />
          </Tooltip>
        </div>
      ),
    },
  ];
}

function DialogoArea({ fila, onClose }) {
  const externos = fila.destinos.filter((d) => d !== ESTADISTICA.clave);

  return (
    <DetailDialog
      icon={fila.icono}
      tone="var(--primary)"
      toneText="var(--primary-text)"
      badge={{ label: fila.sigla, tone: 'info' }}
      title={fila.nombre}
      subtitle={`Su reporte mensual llega a ${fila.destinos.length} ${fila.destinos.length === 1 ? 'receptor' : 'receptores'}.`}
      fields={
        <>
          <Field k="Sigla" v={fila.sigla} mono />
          <Field k="Receptores" v={String(fila.destinos.length)} />
          <Field
            k="Alcance en el prototipo"
            v={fila.profundidad === 'completa' ? 'Formulario modelado a fondo' : 'Formulario simplificado'}
          />
          <Field k="Doble rol" v={fila.tambienEsOficina ? 'Sí: también recibe reportes' : 'No'} />
        </>
      }
      block={{
        title: 'Cómo circula este reporte',
        text: externos.length
          ? `El área envía una sola vez y el sistema lo entrega a la vez a la Oficina de Estadística y a ${externos
              .map(nombreOficina)
              .join(', ')}, ya validado por el bot. El área no remite a nadie por su cuenta: ese es el cambio respecto del circuito en papel.`
          : 'El área envía a la Oficina de Estadística y ahí termina el recorrido: ninguna otra oficina del hospital requiere este reporte. Lo que Estadística remite después es el consolidado a DIRESA.',
      }}
      note="Los destinos provienen del levantamiento del flujo de oficios en papel. Modificarlos es una decisión institucional, no una configuración de usuario."
      aside={
        <div>
          <h4 className="hrl-hist__titulo">Receptores y motivo</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {fila.destinos.map((clave) => {
              const receptor = RECEPTORES.find((r) => r.clave === clave);
              return (
                <div key={clave} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--primary)', flex: '0 0 auto', marginTop: 2 }}>
                    <Icon name={clave === ESTADISTICA.clave ? 'sh-shield' : 'sh-check'} size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 'var(--text-base)' }}>{receptor.nombre}</strong>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)', lineHeight: 'var(--leading-normal)' }}>
                      {receptor.motivo}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      }
      onClose={onClose}
    />
  );
}

/* Vista para un área: sus destinos, sin la matriz completa. Lo que el área
   necesita saber es a dónde va lo que envía, no el mapa del hospital. */
function VistaArea({ claveArea }) {
  const a = area(claveArea);
  const destinos = destinosDe(claveArea);
  const externos = destinos.filter((d) => d !== ESTADISTICA.clave);

  return (
    <>
      <Alert tone="info" title="Usted envía una sola vez">
        {externos.length
          ? `Al enviarlo, el reporte llega a la vez a la Oficina de Estadística y a ${externos
              .map(nombreOficina)
              .join(', ')}, ya validado por el bot. No hace falta enviar nada por separado a esas oficinas.`
          : 'Ninguna otra oficina del hospital requiere este reporte. Estadística lo usa para el consolidado que se remite a DIRESA y para el boletín.'}
      </Alert>

      <Card accent="var(--primary)" icon="sh-share" title={a.nombre} subtitle={`Sigla ${a.sigla} · ${destinos.length} ${destinos.length === 1 ? 'receptor' : 'receptores'}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '18px 20px 22px' }}>
          {destinos.map((clave) => {
            const receptor = RECEPTORES.find((r) => r.clave === clave);
            return (
              <div key={clave} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 38,
                    height: 38,
                    flex: '0 0 auto',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--muted)',
                    color: 'var(--primary-strong)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={clave === ESTADISTICA.clave ? 'sh-shield' : oficina(clave)?.icono ?? 'sh-folder'} size={19} />
                </span>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <strong style={{ fontSize: 'var(--text-md)' }}>
                    {receptor.nombre}
                    {clave === ESTADISTICA.clave && (
                      <span style={{ marginLeft: 8 }}>
                        <Badge label="Siempre" tone="ok" />
                      </span>
                    )}
                  </strong>
                  <span style={{ fontSize: 'var(--text-base)', color: 'var(--muted-foreground)', lineHeight: 'var(--leading-normal)' }}>
                    {receptor.motivo}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

/* Vista para una oficina receptora: qué áreas la alimentan. */
function VistaOficina({ claveOficina }) {
  const o = oficina(claveOficina);
  const alimentan = areasQueRemitenA(claveOficina);

  return (
    <>
      <Alert tone="info" title={`${alimentan.length} de las 9 áreas remiten a esta oficina`}>
        {o?.motivo} Los reportes llegan en cuanto el área los envía, ya validados por el bot; esta oficina no recibe borradores ni reportes que el área aún está llenando.
      </Alert>

      <Card accent="var(--info)" icon="sh-inbox" title={o?.nombre ?? claveOficina} subtitle="Áreas cuyos reportes llegan a esta oficina">
        <DataTable
          columns={[
            {
              key: 'nombreCorto',
              label: 'Área',
              sortable: true,
              render: (f) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    <Icon name={f.icono} size={17} />
                  </span>
                  {f.nombreCorto}
                </span>
              ),
            },
            { key: 'sigla', label: 'Sigla', width: 90, render: (f) => <span className="hrl-mono">{f.sigla}</span> },
            {
              key: 'otros',
              label: 'Otros receptores del mismo reporte',
              tooltip: 'Oficinas que reciben el mismo reporte, además de esta.',
              render: (f) => {
                const otros = f.destinos.filter((d) => d !== claveOficina);
                return otros.length ? otros.map(nombreOficina).join(' · ') : 'Ninguna más';
              },
            },
          ]}
          rows={alimentan}
          rowKey={(f) => f.clave}
          empty="Ninguna de las nueve áreas remite a esta oficina."
        />
      </Card>
    </>
  );
}

export default function MatrizDestinos({ rol, claveArea, claveOficina }) {
  const [sort, setSort] = useState({ key: 'cuantos', dir: 'desc' });
  const [detalle, setDetalle] = useState(null);

  const filas = useMemo(
    () => AREAS.map((a) => ({ ...a, destinos: destinosDe(a.clave), cuantos: destinosDe(a.clave).length })),
    [],
  );

  if (rol === ROL.AREA) {
    return (
      <Mosaic className="hrl-panel">
        <VistaArea claveArea={claveArea} />
      </Mosaic>
    );
  }

  if (rol === ROL.OFICINA) {
    return (
      <Mosaic className="hrl-panel">
        <VistaOficina claveOficina={claveOficina} />
      </Mosaic>
    );
  }

  return (
    <Mosaic className="hrl-panel">
      <Alert tone="info" title="Los destinos no se eligen al remitir: se confirman">
        Cada área tiene un conjunto fijo de receptores, levantado del circuito de oficios en papel. Al remitir, el
        sistema los precarga desde esta matriz. Dejarlos a criterio de quien remite quitaría la garantía de que cada
        oficina recibe siempre lo que necesita.
      </Alert>

      <Card accent="var(--primary)" icon="sh-table"
        title="Matriz de destinos"
        subtitle="Nueve áreas por cinco receptores. El escudo marca a Estadística, que lo recibe todo."
        total={`${filas.reduce((n, f) => n + f.destinos.length, 0)} envíos`}
      >
        <DataTable
          columns={columnas(setDetalle)}
          rows={filas}
          sort={sort}
          onSortChange={setSort}
          rowKey={(f) => f.clave}
          empty="No hay áreas registradas."
          legend={
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--primary-strong)' }}><Icon name="sh-shield" size={15} /></span>
                Receptor obligatorio: recibe el reporte de todas las áreas.
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--success-text)' }}><Icon name="sh-check" size={15} /></span>
                Recibe por remisión de Estadística.
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--subtle-foreground)' }}><Icon name="sh-none" size={15} /></span>
                No requiere este reporte.
              </span>
              <span>EPI aparece como receptor y como área: es la única con doble rol.</span>
            </>
          }
        />
      </Card>

      {detalle && <DialogoArea fila={detalle} onClose={() => setDetalle(null)} />}
    </Mosaic>
  );
}
