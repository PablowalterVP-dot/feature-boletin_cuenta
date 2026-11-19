/* Consolidado de servicios intermedios, tal como se remite a DIRESA.

   Las 196 columnas del Excel oficial, agrupadas en tablas legibles. Cada celda
   dice en su tooltip su columna, si se digita o se calcula y de dónde sale.
   Con «Mostrar columnas del Excel» se ve la letra en la propia celda, para
   quien pase el dato a la hoja de DIRESA. */

import { useState } from 'react';
import { Badge, Button, Card, DataTable, Field, Tooltip } from '@hrl/core-ui';
import { SECCIONES, TABLAS, celda } from '@/app/datos/diresa/servicios-intermedios.js';
import { campoPropio } from '@/app/datos/estadistica-propios.js';
import { nombreArea } from '@/app/datos/areas.js';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import { EstadoFuente } from './comunes.jsx';

function origenDe(campo, fuentes) {
  if (campo.tipo === 'calculado') return `Calculado: ${campo.formula}. No se digita.`;
  if (campo.origen?.sinServicio) return campo.origen.sinServicio;
  if (campo.origen?.propio) return `Dato de Estadística: ${campoPropio(campo.origen.propio)?.label ?? campo.origen.propio}.`;
  if (campo.origen?.derivado) return 'Formato 1 de Lavandería, agrupado por servicio.';
  const fuente = fuentes[campo.origen.area];
  const estado = fuente?.estado === 'validado' ? '' : ' Queda vacío mientras el área no envíe su reporte.';
  if (campo.origen.detalle) return `${campo.origen.detalle}${estado}`;
  return `Reporte de ${nombreArea(campo.origen.area)}.${estado}`;
}

function CeldaSI({ campo, fuentes, letras }) {
  if (!campo) return null;
  const vacio = campo.valor == null;

  return (
    <Tooltip title={`Columna ${campo.col}`} body={`${campo.label}. ${origenDe(campo, fuentes)}`} focusable={false}>
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', cursor: 'help' }}>
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: campo.tipo === 'calculado' ? 'var(--weight-bold)' : 'var(--weight-medium)',
            color: vacio ? 'var(--subtle-foreground)' : 'var(--foreground)',
            fontSize: vacio ? 'var(--text-xs)' : 'var(--text-base)',
          }}
        >
          {vacio ? SIN_DATOS : numero(campo.valor)}
        </span>
        {letras && <span className="hrl-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--muted-foreground)' }}>{campo.col}</span>}
      </span>
    </Tooltip>
  );
}

function TablaSI({ tabla, resultado, letras }) {
  const columnas = [
    { key: 'label', label: 'Concepto', render: (fila) => (fila.clave === 'total' ? <strong>{fila.label}</strong> : fila.label) },
    ...tabla.columnas.map((col) => ({
      key: col.clave,
      label: col.label,
      width: 140,
      align: 'right',
      tooltip: col.clave === 'general' || col.clave === 'total' ? 'Suma automática. En el Excel es una fórmula.' : `Lo producido en ${col.label.toLowerCase()}.`,
      render: (fila) => <CeldaSI campo={celda(resultado, tabla.clave, fila.clave, col.clave)} fuentes={resultado.fuentes} letras={letras} />,
    })),
  ];

  return (
    <div>
      <p style={{ margin: 0, padding: '14px 20px 6px', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)' }}>{tabla.titulo}</p>
      <DataTable columns={columnas} rows={tabla.filas} rowKey={(f) => f.clave} empty="Sin campos." />
    </div>
  );
}

export default function FormatoServiciosIntermedios({ resultado }) {
  const [letras, setLetras] = useState(false);
  const identificacion = resultado.campos.filter((c) => c.seccion === 'id');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <Tooltip
          title="Cómo se cuentan los campos"
          body="En el Excel oficial son 146 manuales y 50 calculados. Aquí la identificación (7 manuales y 3 calculados en el Excel) se autocompleta, así que quedan 139 que vienen de un área o de Estadística y 47 totales calculados."
          focusable={false}
        >
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--muted-foreground)', cursor: 'help' }}>
            {resultado.manuales} campos de datos ({resultado.manualesConDato} con dato) · {resultado.calculados} totales calculados · 10 de
            identificación autocompletados
          </span>
        </Tooltip>
        <Button tone="ghost" size="sm" icon="sh-table" aria-pressed={letras} onClick={() => setLetras((v) => !v)}>
          {letras ? 'Ocultar columnas del Excel' : 'Mostrar columnas del Excel'}
        </Button>
      </div>

      <Card accent="var(--info)" icon="sh-home" title="0. Identificación del establecimiento y periodo" subtitle="Autocompletada y fija: no se digita" total="A–J">
        <div className="hrl-campos" style={{ padding: '16px 20px 20px' }}>
          {identificacion.map((c) => (
            <Field key={c.clave} k={letras ? `${c.col} · ${c.label}` : c.label} v={String(c.valor)} mono={c.clave === 'id.renipress' || c.clave === 'id.ubigeo'} />
          ))}
        </div>
      </Card>

      {SECCIONES.filter((s) => s.clave !== 'id').map((s) => {
        const tablas = TABLAS.filter((t) => t.seccion === s.clave);
        const campos = resultado.campos.filter((c) => c.seccion === s.clave);

        return (
          <Card accent="var(--primary)" icon="sh-flask" key={s.clave} title={s.titulo} subtitle={`Columnas ${campos[0].col} a ${campos.at(-1).col}`}>
            <div style={{ padding: '14px 20px 0', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              {s.areas.map((a) => (
                <EstadoFuente key={a} area={a} estado={resultado.fuentes[a].estado} />
              ))}
              {s.propios && (
                <Tooltip title="Dato de Estadística" body="Parte de esta sección no la envía ningún área: la digita Estadística en «Datos de Estadística»." focusable={false}>
                  <span>
                    <Badge label="Incluye datos de Estadística" tone="info" />
                  </span>
                </Tooltip>
              )}
            </div>
            {tablas.map((t) => (
              <TablaSI key={t.clave} tabla={t} resultado={resultado} letras={letras} />
            ))}
          </Card>
        );
      })}
    </div>
  );
}
