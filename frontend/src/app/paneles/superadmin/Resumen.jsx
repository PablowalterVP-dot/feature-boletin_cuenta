/* Resumen del sistema: qué áreas reportan por el sistema, en qué va cada una
   este mes y cómo va el año. Todo sale de GET /api/admin/resumen, que lee la
   base: un área sin formato instalado figura como tal, no como atrasada. */

import { Badge, Button, Card, DataTable, IconButton, Mosaic, StatCard, Tooltip } from '@hrl/core-ui';
import { estado as estadoDe } from '@/app/dominio/estados.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { SIN_DATOS } from '@/app/dominio/formato.js';
import { useAdmin, Cargando, ErrorDeCarga, dia } from './comunes.jsx';

export default function Resumen({ irA }) {
  const { datos, cargando, error, recargar } = useAdmin('/resumen');
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorDeCarga error={error} recargar={recargar} />;

  const enFlujo = datos.areas.filter((a) => a.en_flujo);
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
      width: 170,
      tooltip: 'El formato con que el bot lee el Excel del área, y su versión activa.',
      render: (a) => (a.formato ? `${a.formato}${a.version_activa ? ` · ${a.version_activa}` : ' · sin versión activa'}` : 'Sin formato instalado'),
    },
    {
      key: 'flujo',
      label: 'Por el sistema',
      width: 150,
      tooltip: 'Si el área ya reporta por el sistema. Las demás siguen en papel y no cuentan como atrasadas.',
      render: (a) => <Badge label={a.en_flujo ? 'Sí' : 'Todavía no'} tone={a.en_flujo ? 'ok' : 'none'} />,
    },
    {
      key: 'estado',
      label: `Reporte de ${etiquetaPeriodo(datos.periodo_vigente).toLowerCase()}`,
      width: 190,
      tooltip: 'El estado del reporte del mes que se está entregando ahora.',
      render: (a) => (a.en_flujo ? <Badge label={estadoDe(a.estado_periodo_vigente).label} tone={estadoDe(a.estado_periodo_vigente).tono} /> : '—'),
    },
    {
      key: 'plazo',
      label: 'Vence',
      width: 130,
      tooltip: 'La fecha límite real del mes en curso, con el plazo del área y la regla de día hábil.',
      render: (a) => dia(a.fecha_limite_vigente),
    },
    {
      key: 'ultimo',
      label: 'Último envío',
      width: 210,
      tooltip: 'El envío más reciente del año, y si llegó dentro de su plazo.',
      render: (a) =>
        a.ultimo_envio ? (
          <span>
            {etiquetaPeriodo(a.ultimo_envio.periodo)} · <Badge label={a.ultimo_envio.a_tiempo ? 'A tiempo' : 'Fuera de plazo'} tone={a.ultimo_envio.a_tiempo ? 'ok' : 'warn'} />
          </span>
        ) : (
          'Ninguno este año'
        ),
    },
    {
      key: 'accion',
      label: '',
      width: 60,
      align: 'right',
      render: (a) => <IconButton icon="sh-gear" tone="action" aria-label={`Configurar ${a.nombre}`} onClick={() => irA('areas')} />,
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <div className="hrl-kpis">
        <StatCard
          label="Reportan por el sistema"
          value={`${enFlujo.length} de ${datos.areas.length}`}
          severity="neutral"
          percent={(enFlujo.length / datos.areas.length) * 100}
          info="Áreas con su formato instalado y sin pausar. Las demás aún entregan por la vía de siempre."
        />
        <StatCard
          label={`Puntualidad ${datos.anio}`}
          value={datos.puntualidad == null ? SIN_DATOS : `${datos.puntualidad.toLocaleString('es-PE')} %`}
          note={datos.enviados_del_anio ? `${datos.a_tiempo_del_anio} de ${datos.enviados_del_anio} envíos dentro del plazo` : 'Aún no hay envíos este año'}
          severity={datos.puntualidad == null ? 'nodata' : datos.puntualidad >= 90 ? 'normal' : 'suspect'}
          delay={60}
          info="Envíos que llegaron hasta su fecha límite, sobre todos los envíos del año. Cuenta envíos, no áreas."
        />
        <StatCard
          label="Rectificaciones"
          value={String(datos.rectificaciones_del_anio)}
          note={`Reportes reabiertos en ${datos.anio}`}
          severity={datos.rectificaciones_del_anio ? 'suspect' : 'normal'}
          delay={180}
          info="Veces que un reporte ya remitido se reabrió para corregirlo. Cada una deja a las oficinas con una versión que cambió."
        />
      </div>

      <Card
        accent="var(--primary)"
        icon="sh-table"
        title="Las áreas"
        subtitle={`Estado del reporte de ${etiquetaPeriodo(datos.periodo_vigente).toLowerCase()} y del año`}
        total={`${datos.areas.length} áreas`}
        actions={
          <Tooltip title="Volver a leer" body="Pide el resumen otra vez al servidor." focusable={false}>
            <Button tone="ghost" size="sm" icon="sh-swap" onClick={recargar} loading={cargando}>
              Actualizar
            </Button>
          </Tooltip>
        }
        flush
      >
        <DataTable columns={columnas} rows={datos.areas} rowKey={(a) => a.clave} />
      </Card>
    </Mosaic>
  );
}
