/* Los ocho reportes de Centro Quirúrgico de un mes, uno a la vez.

   Cinco muestran lo que se leyó del Excel (el resumen, el cuadro de
   indicadores, cirugía menor y mayor, las causas de suspensión); tres, lo que
   el sistema calcula con eso (Top Ten, el consolidado por especialidad, los
   indicadores). Se elige el reporte en la barra de pasos, que dice además cuál
   tiene algo por resolver.

   Solo lectura: las cifras se corrigen en el Excel y se vuelve a subir.

   Una cifra vacía muestra «—» y no 0. Una ilegible muestra lo que decía el
   Excel. Una con un hallazgo del bot lleva su marca y el hallazgo en su
   tooltip, con la celda de donde salió. */

import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, DataTable, Icon, Stack, Steps, Switch, Tooltip } from '@hrl/core-ui';
import { REPORTES, CONCEPTOS_RESUMEN, TIPOS, INSUMOS_INDICADORES, CAUSAS, ESPECIALIDADES, reporte as reporteDe, claveCasilla, celdaDeOrigen } from '@/app/datos/formatos/centro-quirurgico.js';
import { valor, sumar, topTen, consolidadoPorEspecialidad, indicadoresCalculados, validar } from '@/app/datos/formatos/centro-quirurgico-calculos.js';
import { pasosDe } from '@/app/datos/formatos/levantados.js';
import { numero, porcentaje, horasYMinutos } from '@/app/dominio/formato.js';

const AREA = 'centro-quirurgico';

/* En una casilla, la falta de dato es «—»; «Sin datos» no cabe y la cabecera
   ya explica qué es la columna. */
/* Las horas van en horas:minutos, como en el Excel del área (`horas`). */
const cifra = (v, decimales = 0, horas = false) => (v == null ? '—' : horas ? horasYMinutos(v) : numero(v, decimales));

const NIVEL = {
  error: { icono: 'sh-crit', color: 'var(--destructive-text)' },
  aviso: { icono: 'sh-warn', color: 'var(--warning-fg)' },
};

/* Los hallazgos de un cuadro, por la fila a la que apuntan. */
function marcasDe(informe, idCuadro) {
  const marcas = new Map();
  if (!informe) return marcas;
  for (const [nivel, lista] of [['error', informe.errores], ['aviso', informe.avisos]]) {
    for (const h of lista) {
      if (h.formato !== idCuadro || !h.fila) continue;
      // Un procedimiento lleva su fila de la hoja (`especialidad#fila`): se marca su especialidad.
      const fila = h.fila.split('#')[0];
      if (!marcas.has(fila) || nivel === 'error') marcas.set(fila, { ...h, nivel });
    }
  }
  return marcas;
}

/* Una cifra leída: su valor, o el texto ilegible, con la marca del bot. */
function Casilla({ datos, idCuadro, clave, marca, origen, decimales = 0, horas = false, fuerte = false }) {
  const v = valor(datos, idCuadro, clave);
  const ilegible = datos?.ilegibles?.[claveCasilla(idCuadro, clave)];
  const texto = v != null ? cifra(v, decimales, horas) : (ilegible ?? '—');
  const Contenedor = fuerte ? 'strong' : 'span';
  const contenido = (
    <Contenedor className="hrl-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', color: marca ? NIVEL[marca.nivel].color : v == null ? 'var(--subtle-foreground)' : undefined }}>
      {marca && <Icon name={NIVEL[marca.nivel].icono} size={13} />}
      {texto}
    </Contenedor>
  );
  if (!marca) return contenido;
  const celda = celdaDeOrigen(origen, idCuadro, clave);
  return (
    <Tooltip title={marca.titulo} body={`${marca.detalle ?? ''}${celda ? ` Celda ${celda.ref} de «${celda.hoja.trim()}».` : ''}`} focusable={false}>
      {contenido}
    </Tooltip>
  );
}

/* La insignia de lo que el Excel de ese mes no trae: no aplica, no es cero. */
function NoFigura({ que = 'esta fila' }) {
  return (
    <Tooltip title="No figura en el Excel" body={`El Excel de este mes no trae ${que}. Se toma como no registrado, no como cero.`} focusable={false}>
      <Badge label="No figura" tone="none" />
    </Tooltip>
  );
}

/* ------------------------------------------------------------- resumen */

function TablaResumen({ datos, informe, origen }) {
  const marcas = useMemo(() => marcasDe(informe, 'resumen'), [informe]);
  const ausentes = datos?.ausentes?.resumen ?? [];
  const columnas = [
    {
      key: 'concepto',
      label: 'Concepto',
      render: (c) => (
        <Stack direction="row" gap={2} align="center" wrap>
          <span>{c.corto}</span>
          {ausentes.includes(`${c.clave}.programada`) && <NoFigura />}
        </Stack>
      ),
    },
    ...TIPOS.map((t) => ({
      key: t.clave,
      label: t.label,
      align: 'right',
      width: 130,
      tooltip: t.clave === 'programada' ? 'Cirugía electiva, programada con anticipación (CIRUGIA PROGR en el RESUMEN).' : 'Cirugía de emergencia (CIRUGIA EMERG en el RESUMEN).',
      render: (c) => <Casilla datos={datos} idCuadro="resumen" clave={`${c.clave}.${t.clave}`} marca={marcas.get(`${c.clave}.${t.clave}`)} origen={origen} horas={c.decimal} />,
    })),
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      width: 120,
      tooltip: 'Programada más emergencia, calculado por el sistema.',
      render: (c) => <strong className="hrl-mono">{cifra(sumar(TIPOS.map((t) => valor(datos, 'resumen', `${c.clave}.${t.clave}`))), 0, c.decimal)}</strong>,
    },
    { key: 'unidad', label: 'Unidad', width: 120, render: (c) => <span style={{ color: 'var(--muted-foreground)' }}>{c.unidad}</span> },
  ];
  return <DataTable columns={columnas} rows={CONCEPTOS_RESUMEN} rowKey={(c) => c.clave} />;
}

/* ---------------------------------------------------- cuadro de indicadores */

function TablaInsumos({ datos, informe, origen }) {
  const marcas = useMemo(() => marcasDe(informe, 'indicadores'), [informe]);
  const ausentes = datos?.ausentes?.indicadores ?? [];
  // Una fila ocasional (la encefalopatía) que el mes no trae no se muestra.
  const filas = INSUMOS_INDICADORES.filter((f) => !(f.ocasional && ausentes.includes(f.clave)));
  const columnas = [
    {
      key: 'insumo',
      label: 'Insumo',
      render: (f) => (
        <Stack direction="row" gap={2} align="center" wrap>
          <span>{f.corto}</span>
          {ausentes.includes(f.clave) && <NoFigura />}
        </Stack>
      ),
    },
    {
      key: 'valor',
      label: 'Cifra del mes',
      align: 'right',
      width: 150,
      tooltip: 'La columna del mes de la tabla izquierda del CUADRO DE INDICADORES.',
      render: (f) => <Casilla datos={datos} idCuadro="indicadores" clave={f.clave} marca={marcas.get(f.clave)} origen={origen} horas={f.decimal} />,
    },
    { key: 'unidad', label: 'Unidad', width: 130, render: (f) => <span style={{ color: 'var(--muted-foreground)' }}>{f.unidad}</span> },
  ];
  return <DataTable columns={columnas} rows={filas} rowKey={(f) => f.clave} />;
}

function TablaIndicadores({ datos, periodo }) {
  const filas = indicadoresCalculados(datos, periodo);
  const columnas = [
    {
      key: 'indicador',
      label: 'Indicador',
      render: (i) => (
        <Tooltip title={i.label} body={`${i.formula}.`}>
          <span>{i.label}</span>
        </Tooltip>
      ),
    },
    {
      key: 'valor',
      label: 'Valor del mes',
      align: 'right',
      width: 150,
      tooltip: 'Calculado por el sistema con el cuadro de indicadores y el RESUMEN. «—»: falta un dato o el denominador es cero (no es 0).',
      render: (i) => <strong className="hrl-mono">{cifra(i.valor, i.decimales)}</strong>,
    },
    { key: 'unidad', label: 'Unidad', width: 170, render: (i) => <span style={{ color: 'var(--muted-foreground)' }}>{i.unidad}</span> },
    {
      key: 'estandar',
      label: 'Estándar',
      width: 120,
      tooltip: 'El estándar que el área anota en su cuadro de indicadores. El sistema no lo juzga: lo muestra al lado.',
      render: (i) => (i.estandar ? <span className="hrl-mono">{i.estandar}</span> : <span style={{ color: 'var(--subtle-foreground)' }}>—</span>),
    },
  ];
  return <DataTable columns={columnas} rows={filas} rowKey={(i) => i.clave} />;
}

/* ------------------------------------------------ cirugía mayor y menor */

function TablaEspecialidades({ datos, informe, origen, tipo }) {
  const [conCeros, setConCeros] = useState(false);
  const marcas = useMemo(() => marcasDe(informe, tipo), [informe, tipo]);
  const ausentes = datos?.ausentes?.[tipo] ?? [];
  const detalle = datos?.procedimientos?.[tipo] ?? {};
  const declarados = datos?.declarados?.[tipo] ?? {};

  const filas = [];
  for (const e of ESPECIALIDADES.filter((x) => x.en.includes(tipo))) {
    const items = detalle[e.clave] ?? [];
    const enCero = items.filter((i) => i.valor === 0).length;
    filas.push({ tipo: 'especialidad', clave: e.clave, label: e.label, enCero, ausente: ausentes.includes(e.clave) });
    items
      .filter((i) => conCeros || i.valor !== 0)
      .forEach((i, n) => filas.push({ tipo: 'procedimiento', clave: `${e.clave}#${i.fila || n}`, especialidad: e.clave, label: i.rotulo, valor: i.valor, fila: i.fila }));
  }
  filas.push({ tipo: 'total', clave: '_total', label: `Total de cirugía ${tipo}` });

  const columnas = [
    {
      key: 'label',
      label: 'Especialidad y procedimiento',
      render: (f) => {
        if (f.tipo === 'procedimiento') return <span className="hrl-sangria">{f.label}</span>;
        if (f.tipo === 'total') return <strong>{f.label}</strong>;
        return (
          <Stack direction="row" gap={2} align="center" wrap>
            <span>{f.label}</span>
            {f.ausente && <NoFigura que="esta especialidad" />}
            {f.enCero > 0 && !conCeros && (
              <Tooltip title={`${f.enCero} ${f.enCero === 1 ? 'procedimiento' : 'procedimientos'} en 0`} body="Están en el Excel con cero este mes. Active «Mostrar los procedimientos en 0» para verlos." focusable={false}>
                <Badge label={`${f.enCero} en 0`} tone="none" />
              </Tooltip>
            )}
          </Stack>
        );
      },
    },
    {
      key: 'valor',
      label: 'Cifra del mes',
      align: 'right',
      width: 150,
      tooltip: 'La columna del mes de la hoja. El total de la especialidad lo calcula el sistema con sus procedimientos; si el Excel traía escrito otro, se marca.',
      render: (f) => {
        if (f.tipo === 'procedimiento') {
          const ilegible = datos?.ilegibles?.[`${tipo}|${f.especialidad}#${f.fila}`];
          return f.valor == null ? <span className="hrl-mono" style={{ color: NIVEL.error.color }}>{ilegible ?? '—'}</span> : <span className="hrl-mono">{cifra(f.valor)}</span>;
        }
        if (f.tipo === 'total') return <strong className="hrl-mono">{cifra(sumar(Object.values(datos?.[tipo] ?? {})))}</strong>;
        const marca = marcas.get(f.clave);
        const contenido = <Casilla datos={datos} idCuadro={tipo} clave={f.clave} marca={null} origen={origen} fuerte />;
        if (!marca) return contenido;
        return (
          <Tooltip title={marca.titulo} body={`${declarados[f.clave] != null ? `El Excel decía ${numero(declarados[f.clave])}. ` : ''}${marca.detalle ?? ''}`} focusable={false}>
            <strong className="hrl-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', color: NIVEL[marca.nivel].color }}>
              <Icon name={NIVEL[marca.nivel].icono} size={13} />
              {cifra(valor(datos, tipo, f.clave))}
            </strong>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Stack gap={3}>
      <Switch label="Mostrar los procedimientos en 0" checked={conCeros} onChange={setConCeros} description={conCeros ? 'Se muestran todos' : 'Solo los que tuvieron casos'} />
      <DataTable
        columns={columnas}
        rows={filas}
        rowKey={(f) => f.clave}
        rowClass={(f) => (f.tipo === 'total' ? 'hrl-fila--total' : f.tipo === 'especialidad' ? 'hrl-fila--grupo' : undefined)}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------ suspendidas */

function TablaSuspendidas({ datos, informe, origen }) {
  const marcas = useMemo(() => marcasDe(informe, 'suspendidas'), [informe]);
  const ausentes = datos?.ausentes?.suspendidas ?? [];
  const causas = CAUSAS.filter((c) => !(c.ocasional && ausentes.includes(c.clave)));
  const total = sumar(causas.map((c) => valor(datos, 'suspendidas', c.clave)));
  const filas = [...causas.map((c) => ({ ...c, tipo: 'causa' })), { tipo: 'total', clave: '_total', corto: 'Total de suspendidas' }];
  const columnas = [
    {
      key: 'causa',
      label: 'Causa',
      render: (c) =>
        c.tipo === 'total' ? (
          <strong>{c.corto}</strong>
        ) : (
          <Stack direction="row" gap={2} align="center" wrap>
            <span>{c.corto}</span>
            {ausentes.includes(c.clave) && <NoFigura />}
          </Stack>
        ),
    },
    {
      key: 'numero',
      label: 'Número',
      align: 'right',
      width: 120,
      render: (c) => (c.tipo === 'total' ? <strong className="hrl-mono">{cifra(total)}</strong> : <Casilla datos={datos} idCuadro="suspendidas" clave={c.clave} marca={marcas.get(c.clave)} origen={origen} />),
    },
    {
      key: 'parte',
      label: '%',
      align: 'right',
      width: 100,
      tooltip: 'Parte del total de suspendidas, calculada por el sistema.',
      render: (c) => <span className="hrl-mono">{c.tipo === 'total' ? (total ? '100 %' : '—') : porcentaje(valor(datos, 'suspendidas', c.clave), total).texto}</span>,
    },
  ];
  return <DataTable columns={columnas} rows={filas} rowKey={(c) => c.clave} rowClass={(c) => (c.tipo === 'total' ? 'hrl-fila--total' : undefined)} />;
}

/* --------------------------------------------------------- calculados */

function TablaTopTen({ datos }) {
  const columnas = [
    { key: 'puesto', label: 'N.º', width: 60, align: 'right', render: (p) => <span className="hrl-mono">{p.puesto}</span> },
    { key: 'rotulo', label: 'Procedimiento' },
    { key: 'especialidadLabel', label: 'Especialidad', width: 240, render: (p) => <span style={{ color: 'var(--muted-foreground)' }}>{p.especialidadLabel}</span> },
    { key: 'valor', label: 'Intervenciones', align: 'right', width: 140, render: (p) => <strong className="hrl-mono">{cifra(p.valor)}</strong> },
  ];
  return (
    <Stack gap={5}>
      {['mayor', 'menor'].map((tipo) => {
        const filas = topTen(datos, tipo).map((p, i) => ({ ...p, puesto: i + 1 }));
        return (
          <Stack gap={2} key={tipo}>
            <strong>Cirugía {tipo}</strong>
            <DataTable columns={columnas} rows={filas} rowKey={(p) => p.clave} empty={`Sin procedimientos de cirugía ${tipo} con casos este mes.`} />
          </Stack>
        );
      })}
    </Stack>
  );
}

function TablaConsolidado({ datos }) {
  const c = consolidadoPorEspecialidad(datos);
  const filas = [...c.filas.filter((f) => f.total != null), { clave: '_total', label: 'Total', mayor: c.mayor, menor: c.menor, total: c.total, esTotal: true }];
  const columnas = [
    { key: 'label', label: 'Especialidad' },
    { key: 'mayor', label: 'Cirugía mayor', align: 'right', width: 140, render: (f) => <span className="hrl-mono">{cifra(f.mayor)}</span> },
    { key: 'menor', label: 'Cirugía menor', align: 'right', width: 140, render: (f) => <span className="hrl-mono">{cifra(f.menor)}</span> },
    { key: 'total', label: 'Total', align: 'right', width: 120, tooltip: 'Mayor más menor, calculado por el sistema.', render: (f) => <strong className="hrl-mono">{cifra(f.total)}</strong> },
  ];
  return <DataTable columns={columnas} rows={filas} rowKey={(f) => f.clave} rowClass={(f) => (f.esTotal ? 'hrl-fila--total' : undefined)} />;
}

/* ---------------------------------------------------------------------- */

const TABLAS = Object.freeze({
  resumen: TablaResumen,
  top_ten: TablaTopTen,
  consolidado: TablaConsolidado,
  indicadores: TablaInsumos,
  indicadores_calculados: TablaIndicadores,
  menor: (p) => <TablaEspecialidades {...p} tipo="menor" />,
  mayor: (p) => <TablaEspecialidades {...p} tipo="mayor" />,
  suspendidas: TablaSuspendidas,
});

/* El encabezado de un reporte: qué es y si se leyó o se calcula. */
function Encabezado({ id }) {
  const r = reporteDe(id);
  return (
    <Stack direction="row" gap={2} align="center" wrap>
      <Badge label={r.leido ? 'Leído del Excel' : 'Calculado por el sistema'} tone={r.leido ? 'info' : 'ok'} />
      <span style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-sm)' }}>{r.descripcion}</span>
    </Stack>
  );
}

/* Los ocho reportes, uno a la vez, con la barra de pasos para elegir.
   `foco`: { formato } para abrir el reporte de un hallazgo. */
export function Cuadros({ datos, periodo, informe, origen, foco }) {
  const [activo, setActivo] = useState(foco?.formato ?? REPORTES[0].id);
  const validacion = useMemo(() => informe ?? validar(datos, periodo), [informe, datos, periodo]);
  const pasos = pasosDe(AREA, datos, periodo, validacion);
  const Tabla = TABLAS[activo];

  useEffect(() => {
    if (foco?.formato) setActivo(foco.formato);
  }, [foco]);

  return (
    <Stack gap={4}>
      <Steps steps={pasos} active={activo} onChange={setActivo} label="Reportes de Centro Quirúrgico" />
      <Encabezado id={activo} />
      <Tabla datos={datos} periodo={periodo} informe={informe} origen={origen} />
    </Stack>
  );
}

/* Centro Quirúrgico en las pantallas que recorren los formatos de cualquier
   área levantada (el visor de Estadística): un panel por reporte, en solo
   lectura. */
function panel(r) {
  const Tabla = TABLAS[r.id];
  function Reporte({ datos, periodo }) {
    return (
      <Card accent={r.leido ? 'var(--primary)' : 'var(--success)'} icon={r.icono} title={`${r.numero} · ${r.titulo}`} subtitle={r.descripcion}>
        <div className="hrl-cuerpo">
          <Tabla datos={datos} periodo={periodo} informe={null} origen={null} />
        </div>
      </Card>
    );
  }
  Reporte.displayName = `ReporteCqx_${r.id}`;
  return Reporte;
}

export const CUADROS_CENTRO_QUIRURGICO = Object.freeze(Object.fromEntries(REPORTES.map((r) => [r.id, panel(r)])));
