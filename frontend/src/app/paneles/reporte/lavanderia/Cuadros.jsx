/* Las cifras del reporte de Lavandería, cuadro por cuadro.

   Cuatro cuadros, de tres formas distintas (ver el comentario de
   definicion.js del bot):
     f1  kilos por servicio     tabla de servicio × día, con su total
     f3  ropa sucia             tabla de categoría × día, con su total
     f2  confección             lista libre de trabajos, sin días
     f4  piezas e insumos       dos listas: grupos (con kilos derivados del
                                 Formato 1) e insumos de limpieza

   Solo lectura: las cifras se corrigen en el Excel y se vuelve a subir, como
   en Laboratorio. Una casilla vacía muestra «—» y no 0. Una ilegible muestra
   lo que decía el Excel. Una con un hallazgo del bot lleva su marca y el
   hallazgo en su tooltip. */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Card, DataTable, EmptyState, Icon, Steps, Tooltip } from '@hrl/core-ui';
import { SERVICIOS, GRUPOS, INSUMOS, FORMATOS, celdaDeOrigen } from '@/app/datos/formatos/lavanderia.js';
import { totalServicio, totalF1, totalesF3, kilosDelGrupo, piezasDelGrupo, validar } from '@/app/datos/formatos/lavanderia-calculos.js';
import { pasosDe } from '@/app/datos/formatos/levantados.js';
import { diasDelMes } from '@/app/dominio/periodos.js';
import { numero } from '@/app/dominio/formato.js';

const cifra = (v) => (v == null ? '—' : numero(v));

const NIVEL = {
  error: { icono: 'sh-crit', color: 'var(--destructive-text)' },
  aviso: { icono: 'sh-warn', color: 'var(--warning-fg)' },
};

/* Los hallazgos de f1 o f3, por la casilla (fila y día) a la que apuntan. */
function marcasDeDia(informe, idFormato) {
  const marcas = new Map();
  if (!informe) return marcas;
  const poner = (clave, h, nivel) => {
    if (!marcas.has(clave) || nivel === 'error') marcas.set(clave, { ...h, nivel });
  };
  for (const [nivel, lista] of [['error', informe.errores ?? []], ['aviso', informe.avisos ?? []]]) {
    for (const h of lista) {
      if (h.formato !== idFormato) continue;
      if (h.regla === 'incompleto' || h.id === 'incompleto') for (const c of h.casillas ?? []) poner(`${c.fila}|${c.dia}`, h, nivel);
      else if (h.fila && h.dia) poner(`${h.fila}|${h.dia}`, h, nivel);
    }
  }
  return marcas;
}

/* Los hallazgos de una fila entera (sin día): el total de un servicio o
   categoría que no cuadra. */
function marcasDeFila(informe, idFormato) {
  const marcas = new Map();
  if (!informe) return marcas;
  for (const e of informe.errores ?? []) {
    if (e.formato === idFormato && e.fila && !e.dia) marcas.set(e.fila, e);
  }
  return marcas;
}

function Casilla({ v, ilegible, marca, celda }) {
  const texto = v != null ? numero(v) : ilegible ?? '—';
  const contenido = (
    <span className="hrl-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', color: marca ? NIVEL[marca.nivel].color : v == null ? 'var(--subtle-foreground)' : undefined }}>
      {marca && <Icon name={NIVEL[marca.nivel].icono} size={13} />}
      {texto}
    </span>
  );
  if (!marca) return contenido;
  return (
    <Tooltip title={marca.titulo} body={`${marca.detalle ?? ''}${celda ? ` Celda ${celda.ref} de «${celda.hoja}».` : ''}`} focusable={false}>
      {contenido}
    </Tooltip>
  );
}

/* ------------------------------------------------------------------- f1 */

function TablaF1({ datos, periodo, informe, origen }) {
  const n = diasDelMes(periodo);
  const marcasDia = useMemo(() => marcasDeDia(informe, 'f1'), [informe]);
  const marcasFila = useMemo(() => marcasDeFila(informe, 'f1'), [informe]);
  const ausentes = datos?.ausentes?.f1 ?? [];
  const servicios = SERVICIOS.filter((s) => !(s.ocasional && ausentes.includes(s.clave)));

  const columnas = [
    {
      key: 'servicio',
      label: 'Servicio',
      render: (s) =>
        s.tipo === 'total' ? (
          <strong>Total</strong>
        ) : (
          <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            {s.nombre}
            {ausentes.includes(s.clave) && (
              <Tooltip title="No figura en el Excel" body="El Excel de este mes no trae este servicio. Se toma como no registrado, no como cero." focusable={false}>
                <Badge label="No figura" tone="none" />
              </Tooltip>
            )}
          </span>
        ),
    },
    ...Array.from({ length: n }, (_, i) => i + 1).map((d) => ({
      key: `d${d}`,
      label: String(d),
      align: 'right',
      width: 48,
      render: (s) => {
        if (s.tipo === 'total') {
          const vs = servicios.map((x) => datos?.f1?.[x.clave]?.[d - 1]).filter((v) => typeof v === 'number');
          return <strong className="hrl-mono">{vs.length ? numero(vs.reduce((a, b) => a + b, 0)) : '—'}</strong>;
        }
        const v = datos?.f1?.[s.clave]?.[d - 1] ?? null;
        const ilegible = datos?.ilegibles?.[`f1|${s.clave}|${d}`];
        return <Casilla v={v} ilegible={ilegible} marca={marcasDia.get(`${s.clave}|${d}`)} celda={celdaDeOrigen(origen, 'f1', s.clave, d)} />;
      },
    })),
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      width: 92,
      render: (s) => {
        const total = s.tipo === 'total' ? totalF1(datos?.f1 ?? {}, periodo) : totalServicio(datos?.f1 ?? {}, s.clave, periodo);
        const marca = s.tipo === 'total' ? null : marcasFila.get(s.clave);
        const contenido = (
          <strong className="hrl-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', color: marca ? 'var(--destructive-text)' : undefined }}>
            {marca && <Icon name="sh-crit" size={13} />}
            {cifra(total)}
          </strong>
        );
        return marca ? (
          <Tooltip title={marca.titulo} body={marca.detalle} focusable={false}>
            {contenido}
          </Tooltip>
        ) : (
          contenido
        );
      },
    },
  ];

  const filas = [...servicios, { tipo: 'total', clave: '_total' }];
  return <DataTable columns={columnas} rows={filas} rowKey={(s) => s.clave} rowClass={(s) => (s.tipo === 'total' ? 'hrl-fila--total' : undefined)} />;
}

/* ------------------------------------------------------------------- f3 */

const CATEGORIAS_F3 = Object.freeze([
  { clave: 'comun', nombre: 'Ropa sucia común' },
  { clave: 'sucia', nombre: 'Ropa sucia' },
]);

function TablaF3({ datos, periodo, informe, origen: _origen }) {
  const n = diasDelMes(periodo);
  const marcasDia = useMemo(() => marcasDeDia(informe, 'f3'), [informe]);
  const marcasFila = useMemo(() => marcasDeFila(informe, 'f3'), [informe]);
  const totales = totalesF3(datos?.f3 ?? {}, periodo);

  const columnas = [
    { key: 'categoria', label: 'Categoría', render: (c) => (c.tipo === 'total' ? <strong>Total</strong> : c.nombre) },
    ...Array.from({ length: n }, (_, i) => i + 1).map((d) => ({
      key: `d${d}`,
      label: String(d),
      align: 'right',
      width: 48,
      render: (c) => {
        if (c.tipo === 'total') {
          const comun = datos?.f3?.comun?.[d - 1];
          const sucia = datos?.f3?.sucia?.[d - 1];
          const vs = [comun, sucia].filter((v) => typeof v === 'number');
          return <strong className="hrl-mono">{vs.length ? numero(vs.reduce((a, b) => a + b, 0)) : '—'}</strong>;
        }
        const v = datos?.f3?.[c.clave]?.[d - 1] ?? null;
        const ilegible = datos?.ilegibles?.[`f3|${c.clave}|${d}`];
        return <Casilla v={v} ilegible={ilegible} marca={marcasDia.get(`${c.clave}|${d}`)} celda={null} />;
      },
    })),
    {
      key: 'total',
      label: 'Total kg',
      align: 'right',
      width: 92,
      render: (c) => {
        const total = c.tipo === 'total' ? totales.kgTotal : c.clave === 'comun' ? totales.kgComun : totales.kgSucia;
        const marca = c.tipo === 'total' ? null : marcasFila.get(c.clave);
        const contenido = (
          <strong className="hrl-mono" style={{ color: marca ? 'var(--destructive-text)' : undefined }}>
            {cifra(total)}
          </strong>
        );
        return marca ? (
          <Tooltip title={marca.titulo} body={marca.detalle} focusable={false}>
            {contenido}
          </Tooltip>
        ) : (
          contenido
        );
      },
    },
  ];

  const filas = [...CATEGORIAS_F3, { tipo: 'total', clave: '_total' }];
  return (
    <>
      <DataTable columns={columnas} rows={filas} rowKey={(c) => c.clave} rowClass={(c) => (c.tipo === 'total' ? 'hrl-fila--total' : undefined)} />
      <div className="hrl-campos" style={{ padding: 'var(--space-4) var(--space-5) 0' }}>
        <Tooltip title="Importe del mes" body="Kilos por su tarifa: S/ 3,00 la ropa común y S/ 4,50 la ropa sucia. No se digita: se calcula." focusable={false}>
          <span>
            Importe del mes: <strong className="hrl-mono">S/ {numero(totales.importeTotal ?? 0, 2)}</strong> (común S/ {numero(totales.importeComun ?? 0, 2)} · sucia S/{' '}
            {numero(totales.importeSucia ?? 0, 2)})
          </span>
        </Tooltip>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- f2 */

function TablaF2({ datos, informe }) {
  const trabajos = datos?.f2 ?? [];
  const avisoIncompleta = (informe?.avisos ?? []).find((a) => a.formato === 'f2' && a.regla === 'confeccion-incompleta');

  if (!trabajos.length) {
    return <EmptyState icon="sh-scissors" title="Sin trabajos este mes" body="El Excel de este mes no trae ningún trabajo de confección registrado." />;
  }

  const columnas = [
    { key: 'descripcion', label: 'Descripción', render: (t) => t.descripcion ?? <span style={{ color: 'var(--subtle-foreground)' }}>—</span> },
    { key: 'confeccion', label: 'Confección', align: 'right', width: 140, render: (t) => (t.confeccion ? <span className="hrl-mono">{t.confeccion}</span> : <span style={{ color: 'var(--subtle-foreground)' }}>—</span>) },
    { key: 'servicio', label: 'Servicio', render: (t) => t.servicio ?? <span style={{ color: 'var(--subtle-foreground)' }}>—</span> },
    { key: 'tela', label: 'Tipo de tela', render: (t) => t.tela ?? <span style={{ color: 'var(--subtle-foreground)' }}>—</span> },
  ];

  return (
    <>
      {avisoIncompleta && (
        <Alert tone="warning" title={avisoIncompleta.titulo} style={{ margin: 'var(--space-4) var(--space-5) 0' }}>
          {avisoIncompleta.detalle}
        </Alert>
      )}
      <DataTable columns={columnas} rows={trabajos} rowKey={(t) => t.fila} />
    </>
  );
}

/* ------------------------------------------------------------------- f4 */

function TablaF4({ datos, periodo, informe }) {
  const ausentesGrupos = datos?.ausentes?.f4 ?? [];
  const avisoInsumo = (informe?.avisos ?? []).find((a) => a.formato === 'f4' && a.regla === 'insumo-sin-cantidad');

  const columnasGrupos = [
    {
      key: 'grupo',
      label: 'Grupo',
      render: (g) => (
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {g.nombre}
          {ausentesGrupos.includes(g.clave) && (
            <Tooltip title="No figura en el Excel" body="El Excel de este mes no trae este grupo en el consolidado." focusable={false}>
              <Badge label="No figura" tone="none" />
            </Tooltip>
          )}
        </span>
      ),
    },
    { key: 'piezas', label: 'Piezas', align: 'right', width: 100, render: (g) => <span className="hrl-mono">{cifra(piezasDelGrupo(datos?.f4 ?? {}, g.clave))}</span> },
    {
      key: 'kilos',
      label: 'Kilos',
      align: 'right',
      width: 100,
      tooltip: 'No se digita: es el Formato 1 agrupado.',
      render: (g) => <span className="hrl-mono">{cifra(kilosDelGrupo(datos?.f1 ?? {}, g.clave, periodo))}</span>,
    },
  ];

  const columnasInsumos = [
    { key: 'insumo', label: 'Insumo', render: (i) => i.nombre },
    { key: 'cantidad', label: 'Cantidad del mes', render: (i) => datos?.f4?.insumos?.[i.clave] || <span style={{ color: 'var(--subtle-foreground)' }}>Sin cantidad</span> },
  ];

  return (
    <>
      <Card accent="var(--primary)" icon="sh-box" title="Consolidado por grupo" subtitle="Piezas digitadas; kilos derivados del Formato 1" flush style={{ boxShadow: 'none', border: 'none' }}>
        <DataTable columns={columnasGrupos} rows={GRUPOS} rowKey={(g) => g.clave} />
      </Card>
      <Card accent="var(--primary)" icon="sh-flask" title="Insumos utilizados" flush style={{ boxShadow: 'none', border: 'none', marginTop: 'var(--space-4)' }}>
        {avisoInsumo && (
          <Alert tone="warning" title={avisoInsumo.titulo} style={{ margin: '0 var(--space-5) var(--space-3)' }}>
            {avisoInsumo.detalle}
          </Alert>
        )}
        <DataTable columns={columnasInsumos} rows={INSUMOS} rowKey={(i) => i.clave} />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------- el conjunto */

const TABLAS = Object.freeze({ f1: TablaF1, f3: TablaF3, f2: TablaF2, f4: TablaF4 });

export function TablaCuadro({ idCuadro, datos, periodo, informe, origen }) {
  const Tabla = TABLAS[idCuadro];
  return <Tabla datos={datos} periodo={periodo} informe={informe} origen={origen} />;
}

/* Todos los cuadros, uno a la vez, con la barra de pasos para elegir.
   `foco`: { formato } para abrir el cuadro de un hallazgo. */
export function Cuadros({ datos, periodo, informe, origen, foco }) {
  const [activo, setActivo] = useState(foco?.formato ?? FORMATOS[0].id);
  const validacion = useMemo(() => informe ?? validar(datos, periodo), [informe, datos, periodo]);
  const pasos = pasosDe('lavanderia', datos, periodo, validacion);

  useEffect(() => {
    if (foco?.formato) setActivo(foco.formato);
  }, [foco]);

  return (
    <>
      <Steps steps={pasos} active={activo} onChange={setActivo} label="Cuadros del reporte" />
      <div style={{ marginTop: 'var(--space-4)' }}>
        <TablaCuadro idCuadro={activo} datos={datos} periodo={periodo} informe={informe} origen={origen} />
      </div>
    </>
  );
}

/* Lavandería en las pantallas que recorren los formatos de cualquier área
   levantada (el visor de Estadística): un panel por cuadro, en solo lectura. */
function panel(f) {
  function Panel({ datos, periodo }) {
    return (
      <Card accent="var(--primary)" icon="sh-washer" title={f.titulo} subtitle={f.descripcion}>
        <div className="hrl-cuerpo">
          <TablaCuadro idCuadro={f.id} datos={datos} periodo={periodo} informe={null} origen={null} />
        </div>
      </Card>
    );
  }
  Panel.displayName = `Cuadro_${f.id}`;
  return Panel;
}

export const CUADROS_LAVANDERIA = Object.freeze(Object.fromEntries(FORMATOS.map((f) => [f.id, panel(f)])));
