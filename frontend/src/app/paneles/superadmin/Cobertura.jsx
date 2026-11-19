/* Cobertura: qué meses tiene cada área en la base de este servidor, y con qué
   archivo. Existe porque cada integrante del equipo cargó meses solo en su
   base (22/10/2026) y nadie sabía cuál tenía qué. Lee GET /api/admin/cobertura
   (servicios/cobertura.py), lo mismo que imprime `inventario` en una consola:
   las dos vistas dicen siempre lo mismo.

   Un mes que todavía no toca no es una falta y no se pinta como tal. Uno
   eliminado no es lo mismo que uno que nunca llegó: alguien lo borró a
   propósito, y se dice. */

import { useState } from 'react';
import { Alert, Button, Card, DataTable, Icon, IconButton, Mosaic, SegmentedControl, StatCard, Tooltip } from '@hrl/core-ui';
import { estado as estadoDe } from '@/app/dominio/estados.js';
import { etiquetaMes, etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { SIN_DATOS } from '@/app/dominio/formato.js';
import { useAdmin, Cargando, ErrorDeCarga, dia } from './comunes.jsx';

/* Cómo se ve cada celda. El icono cambia con el estado: el color nunca es la
   única señal. */
const CELDA = Object.freeze({
  remitido: { icono: 'sh-ok', color: 'var(--success-text)', etiqueta: 'Entregado' },
  borrador: { icono: 'sh-pencil', color: 'var(--info-fg)', etiqueta: 'En llenado' },
  eliminado: { icono: 'sh-trash', color: 'var(--destructive-text)', etiqueta: 'Eliminado' },
  falta: { icono: 'sh-warn', color: 'var(--warning-fg)', etiqueta: 'Falta' },
  futuro: { icono: 'sh-none', color: 'var(--neutral-text)', etiqueta: 'Todavía no toca' },
});

function claseDeMes(mes) {
  if (mes.estado === 'no_iniciado') return mes.esperado ? 'falta' : 'futuro';
  return CELDA[mes.estado] ? mes.estado : 'remitido';
}

function explicacion(mes, area) {
  const clase = claseDeMes(mes);
  if (clase === 'futuro') return 'Este mes todavía no se reporta: no es una falta.';
  if (clase === 'falta') {
    return area.version_activa
      ? 'No hay reporte de este mes en la base del servidor. Si está en la base de otro integrante, tráigalo con importar_reportes.'
      : `El área no tiene su formato activo en esta base: no puede recibir ningún mes hasta activarlo.`;
  }
  if (clase === 'eliminado') return 'Alguien eliminó este reporte a propósito (con su motivo en la bitácora). importar_reportes no lo vuelve a cargar.';
  const partes = [estadoDe(mes.estado).descripcion];
  if (mes.archivo) partes.push(`Archivo: ${mes.archivo} (huella ${mes.huella.slice(0, 10)}…).`);
  if (mes.historica) partes.push('Carga histórica: su fecha de envío es la de la carga, no la de entrega del área.');
  else if (mes.fecha_envio) partes.push(`Enviado el ${dia(mes.fecha_envio)}.`);
  return partes.join(' ');
}

function Celda({ mes, area }) {
  const clase = claseDeMes(mes);
  const { icono, color, etiqueta } = CELDA[clase];
  return (
    <Tooltip title={`${area.nombre} · ${etiquetaPeriodo(mes.periodo)} · ${etiqueta}${mes.historica ? ' (histórica)' : ''}`} body={explicacion(mes, area)} focusable>
      <Icon name={icono} title={`${etiquetaPeriodo(mes.periodo)}: ${etiqueta}`} style={{ color }} />
    </Tooltip>
  );
}

export default function Cobertura({ irA }) {
  const [anio, setAnio] = useState(null);
  const { datos, cargando, error, recargar } = useAdmin('/cobertura', anio ? { anio } : undefined);
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorDeCarga error={error} recargar={recargar} />;

  const anioVigente = Number(datos.periodo_vigente.slice(0, 4));
  const esperados = datos.areas.reduce((s, a) => s + a.esperados, 0);
  const remitidos = datos.areas.reduce((s, a) => s + a.remitidos, 0);
  const faltan = datos.areas.reduce((s, a) => s + a.faltan, 0);
  const sinFormato = datos.areas.filter((a) => !a.version_activa);

  const columnas = [
    {
      key: 'nombre',
      label: 'Área',
      tooltip: 'Abre la configuración del área en «Áreas y matriz».',
      render: (a) => (
        <Button tone="link" onClick={() => irA('areas')}>
          {a.nombre}
        </Button>
      ),
    },
    {
      key: 'formato',
      label: 'Formato',
      width: 120,
      tooltip: 'El formato del área y su versión activa en esta base. Sin versión activa, el área no puede recibir ningún mes.',
      render: (a) => (a.version_activa ? a.version_activa : 'Sin formato activo'),
    },
    ...datos.meses.map((periodo, i) => ({
      key: periodo,
      label: etiquetaMes(periodo),
      width: 56,
      align: 'center',
      group: String(datos.anio),
      groupTooltip: 'Un mes por columna. Pase el cursor o el foco por cada celda para ver su estado y su archivo.',
      tooltip: etiquetaPeriodo(periodo),
      render: (a) => <Celda mes={a.meses[i]} area={a} />,
    })),
    {
      key: 'faltan',
      label: 'Faltan',
      width: 100,
      align: 'right',
      numeric: true,
      tooltip: 'Meses que ya debían estar entregados y no están en esta base (incluye los eliminados), sobre los que ya tocaban.',
      render: (a) => (a.esperados ? `${a.faltan} de ${a.esperados}` : SIN_DATOS),
    },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (a) => <IconButton icon="sh-gear" tone="action" aria-label={`Configurar ${a.nombre}`} onClick={() => irA('areas')} />,
    },
  ];

  const leyenda = (
    <span>
      {Object.values(CELDA).map(({ icono, color, etiqueta }) => (
        <span key={etiqueta} className="hrl-cobertura-leyenda">
          <Icon name={icono} size={16} style={{ color }} /> {etiqueta}
        </span>
      ))}
    </span>
  );

  return (
    <Mosaic className="hrl-panel">
      <Alert tone="info" title="Esta es la base del servidor, no la de cada integrante">
        Lo que alguien cargó solo en su base no aparece aquí. Para traerlo sin pisar nada: en su máquina,{' '}
        <code>exportar_reportes</code>; aquí, <code>importar_reportes</code>. Los pasos están en <code>docs/BASE_COMPARTIDA.md</code>.
      </Alert>

      <div className="hrl-kpis">
        <StatCard
          label={`Meses entregados ${datos.anio}`}
          value={esperados ? `${remitidos} de ${esperados}` : SIN_DATOS}
          severity={esperados ? (remitidos === esperados ? 'normal' : 'neutral') : 'nodata'}
          percent={esperados ? (remitidos / esperados) * 100 : undefined}
          info="Meses entregados en esta base, sobre los que ya tocaban en todas las áreas que reportan. No cuenta los que todavía no toca."
        />
        <StatCard
          label="Meses que faltan"
          value={String(faltan)}
          note="Ya debían estar y no están en esta base"
          severity={faltan ? 'suspect' : 'normal'}
          delay={60}
          info="Incluye los eliminados. Un mes en llenado no cuenta como falta, pero tampoco como entregado."
        />
        <StatCard
          label="Áreas sin formato activo"
          value={String(sinFormato.length)}
          note={sinFormato.length ? sinFormato.map((a) => a.nombre).join(', ') : 'Todas pueden recibir'}
          severity={sinFormato.length ? 'suspect' : 'normal'}
          delay={180}
          info="Un área sin versión activa de su formato no puede recibir ningún mes, ni subido ni importado. Se activa con cargar_catalogo_<área>."
        />
      </div>

      <Card
        accent="var(--primary)"
        icon="sh-calendar"
        title="Meses por área"
        subtitle={`Qué tiene la base del servidor en ${datos.anio}, mes a mes`}
        total={`${datos.areas.length} áreas`}
        actions={
          <>
            <SegmentedControl
              label="Año"
              options={[anioVigente - 1, anioVigente].map((a) => ({ value: String(a), label: String(a) }))}
              value={String(datos.anio)}
              onChange={(v) => setAnio(Number(v))}
            />
            <Tooltip title="Volver a leer" body="Pide la cobertura otra vez al servidor, por ejemplo después de importar." focusable={false}>
              <Button tone="ghost" size="sm" icon="sh-swap" onClick={recargar} loading={cargando}>
                Actualizar
              </Button>
            </Tooltip>
          </>
        }
        flush
      >
        <DataTable columns={columnas} rows={datos.areas} rowKey={(a) => a.clave} legend={leyenda} />
      </Card>
    </Mosaic>
  );
}
