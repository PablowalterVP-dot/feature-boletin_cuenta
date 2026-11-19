/* Las cifras del reporte de Laboratorio, sección por sección.

   Una tabla por sección: un examen por fila, sus seis procedencias y su total.
   Al pie, el total de la sección por procedencia. Es una cifra por casilla
   (el reporte es mensual), así que no hay semanas que recorrer: se elige la
   sección en la barra de pasos, que dice además cuál tiene algo por resolver.

   Solo lectura: las cifras se corrigen en el Excel y se vuelve a subir (con el
   backend no hay otra forma, y en el prototipo se sigue el mismo criterio para
   que la demostración no prometa algo que el sistema real no hace).

   Una casilla vacía muestra «—» y no 0. Una ilegible muestra lo que decía el
   Excel. Una con un hallazgo del bot lleva su marca y el hallazgo en su
   tooltip. Los totales los calcula el sistema; si el Excel traía escrito otro,
   la columna lo marca. */

import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, DataTable, Icon, Steps, Tooltip } from '@hrl/core-ui';
import { CUADROS, ABREVIATURA, cuadro as cuadroDe, claveFila, claveCasilla, celdaDeOrigen, columnasDe } from '@/app/datos/formatos/laboratorio.js';
import { valor, totalExamen, totalProcedencia, totalCuadro, validar } from '@/app/datos/formatos/laboratorio-calculos.js';
import { pasosDe } from '@/app/datos/formatos/levantados.js';
import { numero } from '@/app/dominio/formato.js';

/* En una casilla, la falta de dato es «—»; «Sin datos» no cabe y la cabecera
   ya explica qué es la columna. */
const cifra = (v) => (v == null ? '—' : numero(v));

const NIVEL = {
  error: { icono: 'sh-crit', color: 'var(--destructive-text)' },
  aviso: { icono: 'sh-warn', color: 'var(--warning-fg)' },
};

/* Los hallazgos de una sección, por la casilla o el examen al que apuntan. */
function marcasDe(informe, idCuadro) {
  const marcas = new Map();
  if (!informe) return marcas;
  const poner = (clave, h, nivel) => {
    if (!marcas.has(clave) || nivel === 'error') marcas.set(clave, { ...h, nivel });
  };
  for (const [nivel, lista] of [['error', informe.errores], ['aviso', informe.avisos]]) {
    for (const h of lista) {
      if (h.formato !== idCuadro) continue;
      if (h.regla === 'incompleto') for (const c of h.casillas ?? []) poner(c, h, nivel);
      else if (h.regla === 'total-fila') poner(`total|${h.fila.split('.')[0]}`, h, nivel);
      else if (h.fila) poner(h.fila, h, nivel);
    }
  }
  return marcas;
}

function Casilla({ datos, idCuadro, clave, marca, origen }) {
  const v = valor(datos, idCuadro, clave);
  const ilegible = datos?.ilegibles?.[claveCasilla(idCuadro, clave)];
  const texto = v != null ? numero(v) : ilegible ?? '—';
  const contenido = (
    <span className="hrl-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', color: marca ? NIVEL[marca.nivel].color : v == null ? 'var(--subtle-foreground)' : undefined }}>
      {marca && <Icon name={NIVEL[marca.nivel].icono} size={13} />}
      {texto}
    </span>
  );
  if (!marca) return contenido;
  const celda = celdaDeOrigen(origen, idCuadro, clave);
  return (
    <Tooltip title={marca.titulo} body={`${marca.detalle ?? ''}${celda ? ` Celda ${celda.ref} de «${celda.hoja}».` : ''}`} focusable={false}>
      {contenido}
    </Tooltip>
  );
}

/* La tabla de una sección. */
export function TablaSeccion({ datos, idCuadro, informe, origen }) {
  const c = cuadroDe(idCuadro);
  const marcas = useMemo(() => marcasDe(informe, idCuadro), [informe, idCuadro]);
  const ausentes = datos?.ausentes?.[idCuadro] ?? [];
  const escritos = datos?.escritos ?? {};

  const columnasExcel = columnasDe(idCuadro).porProcedencia;
  /* Un examen ocasional que el mes no trae no se muestra: no se ofreció. */
  const examenes = c.examenes.filter((e) => !(e.ocasional && ausentes.includes(e.clave)));
  const filas = [...examenes.map((e) => ({ tipo: 'examen', ...e })), ...(c.procedencias.length > 1 ? [{ tipo: 'total', clave: '_total', etiqueta: 'Total de la sección' }] : [])];

  const columnas = [
    {
      key: 'examen',
      label: 'Examen',
      render: (f) =>
        f.tipo === 'total' ? (
          <strong>{f.etiqueta}</strong>
        ) : (
          <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            {f.etiqueta}
            {ausentes.includes(f.clave) && (
              <Tooltip title="No figura en el Excel" body="El Excel de este mes no trae este examen. Se toma como no registrado, no como cero." focusable={false}>
                <Badge label="No figura" tone="none" />
              </Tooltip>
            )}
          </span>
        ),
    },
    ...c.procedencias.map((p) => ({
      key: p.clave,
      label: ABREVIATURA[p.clave],
      align: 'right',
      width: 92,
      group: c.procedencias.length > 1 ? 'Procedencia' : undefined,
      groupTooltip: c.procedencias.length > 1 ? 'De dónde viene la atención: el servicio que la pidió o, si es externa, cómo se paga.' : undefined,
      tooltip: `${p.label} (columna ${columnasExcel[p.clave]} de la hoja del mes).`,
      render: (f) =>
        f.tipo === 'total' ? (
          <strong className="hrl-mono">{cifra(totalProcedencia(datos, idCuadro, p.clave))}</strong>
        ) : (
          <Casilla datos={datos} idCuadro={idCuadro} clave={claveFila(f.clave, p.clave)} marca={marcas.get(claveFila(f.clave, p.clave))} origen={origen} />
        ),
    })),
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      width: 100,
      tooltip: 'Suma de las seis procedencias, calculada por el sistema. Si el Excel traía escrito otro total, se marca.',
      render: (f) => {
        const total = f.tipo === 'total' ? totalCuadro(datos, idCuadro) : totalExamen(datos, idCuadro, f.clave);
        const marca = f.tipo === 'examen' ? marcas.get(`total|${f.clave}`) : null;
        const escrito = f.tipo === 'examen' ? escritos.filas?.[`${idCuadro}|${f.clave}`] : datos?.declarados?.[idCuadro]?._total;
        const contenido = (
          <strong className="hrl-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', color: marca ? 'var(--destructive-text)' : undefined }}>
            {marca && <Icon name="sh-crit" size={13} />}
            {cifra(total)}
          </strong>
        );
        return marca ? (
          <Tooltip title={marca.titulo} body={`El Excel decía ${numero(escrito)}. ${marca.detalle}`} focusable={false}>
            {contenido}
          </Tooltip>
        ) : (
          contenido
        );
      },
    },
  ];
  // El resumen solo tiene la columna TOTAL: no hay otra que sumar.
  if (c.procedencias.length === 1) columnas.pop();

  return <DataTable columns={columnas} rows={filas} rowKey={(f) => f.clave} rowClass={(f) => (f.tipo === 'total' ? 'hrl-fila--total' : undefined)} />;
}

/* Todas las secciones, una a la vez, con la barra de pasos para elegir.
   `foco`: { formato } para abrir la sección de un hallazgo. */
export function Secciones({ datos, periodo, informe, origen, foco }) {
  const [activa, setActiva] = useState(foco?.formato ?? CUADROS[0].id);
  const validacion = useMemo(() => informe ?? validar(datos, periodo), [informe, datos, periodo]);
  const pasos = pasosDe('laboratorio', datos, periodo, validacion);

  useEffect(() => {
    if (foco?.formato) setActiva(foco.formato);
  }, [foco]);

  return (
    <>
      <Steps steps={pasos} active={activa} onChange={setActiva} label="Secciones del reporte" />
      <div style={{ marginTop: 'var(--space-4)' }}>
        <TablaSeccion datos={datos} idCuadro={activa} informe={informe} origen={origen} />
      </div>
    </>
  );
}

/* Laboratorio en las pantallas que recorren los formatos de cualquier área
   levantada (el visor de Estadística): un panel por sección, en solo lectura. */
function panel(c) {
  function Seccion({ datos }) {
    return (
      <Card accent="var(--primary)" icon="sh-flask" title={c.titulo} subtitle={c.procedencias.length > 1 ? `Cifras del mes por procedencia, en ${c.unidad}` : `Cifras del mes, en ${c.unidad}`}>
        <div className="hrl-cuerpo">
          <TablaSeccion datos={datos} idCuadro={c.id} informe={null} origen={null} />
        </div>
      </Card>
    );
  }
  Seccion.displayName = `Seccion_${c.id}`;
  return Seccion;
}

export const SECCIONES_LABORATORIO = Object.freeze(Object.fromEntries(CUADROS.map((c) => [c.id, panel(c)])));

/* Para la constancia y el envío: el total de cada sección. */
export function totalesPorSeccion(datos) {
  return CUADROS.map((c) => ({ ...c, total: totalCuadro(datos, c.id) }));
}
