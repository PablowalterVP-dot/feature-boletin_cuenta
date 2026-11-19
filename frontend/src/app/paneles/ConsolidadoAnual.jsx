/* El consolidado anual de un área: su «TOTAL».

   Nutrición lo armaba a mano copiando el total de cada uno de sus cuatro
   reportes, mes por mes, en un TOTAL.xlsx. Aquí lo arma el bot con los meses
   entregados (areas/nutricion/consolidado.js), y se descarga con el mismo
   diseño. Un mes sin reporte entregado queda vacío, no en cero; la meta anual
   todavía no se registra y lo dice. */

import { useEffect, useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, Mosaic, Skeleton, StatCard, Tooltip } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';
import { consolidado as consolidadoDelBot } from '@/app/servicios/bot-validador.js';
import { descargar } from '@/app/servicios/ejemplos-nutricion.js';
import { nombreArea } from '@/app/datos/areas.js';
import { useHoy } from '@/app/datos/store.js';
import { periodoVigente } from '@/app/dominio/periodos.js';
import { SIN_DATOS } from '@/app/dominio/formato.js';
import ConsolidadoLaboratorio from './reporte/laboratorio/Consolidado.jsx';
import ConsolidadoLavanderia from './reporte/lavanderia/Consolidado.jsx';
import ConsolidadoCentroQuirurgico from './reporte/centro-quirurgico/Consolidado.jsx';
import ConsolidadoFarmacia from './reporte/farmacia/Consolidado.jsx';
import ConsolidadoNefrologia from './reporte/nefrologia/Consolidado.jsx';
import ConsolidadoGinecologia from './reporte/ginecologia/Consolidado.jsx';
import ConsolidadoPorFilas from './reporte/ConsolidadoPorFilas.jsx';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const cifra = (v) => (v == null ? '—' : v.toLocaleString('es-PE'));

/* Cada área arma el suyo: Nutrición, el total de sus cuatro reportes mes por
   mes; Laboratorio, la hoja CONSOLIDADO de su libro, casilla por casilla;
   Centro Quirúrgico, su reporte 1 (la producción de los doce meses). */
export default function ConsolidadoAnual({ claveArea = 'nutricion', reportes }) {
  const anio = periodoVigente(useHoy()).slice(0, 4);
  if (claveArea === 'laboratorio') return <ConsolidadoLaboratorio reportes={reportes} anio={anio} />;
  if (claveArea === 'lavanderia') return <ConsolidadoLavanderia reportes={reportes} anio={anio} />;
  if (claveArea === 'centro-quirurgico') return <ConsolidadoCentroQuirurgico reportes={reportes} anio={anio} />;
  if (claveArea === 'farmacia') return <ConsolidadoFarmacia reportes={reportes} anio={anio} />;
  if (claveArea === 'nefrologia') return <ConsolidadoNefrologia reportes={reportes} anio={anio} />;
  if (claveArea === 'ginecologia') return <ConsolidadoGinecologia reportes={reportes} anio={anio} />;
  if (claveArea === 'imagenes' || claveArea === 'epidemiologia') return <ConsolidadoPorFilas claveArea={claveArea} reportes={reportes} anio={anio} />;
  return <ConsolidadoPorTotales claveArea={claveArea} reportes={reportes} anio={anio} />;
}

function ConsolidadoPorTotales({ claveArea, reportes, anio }) {
  const [estado, setEstado] = useState({ cargando: true, meses: [], error: null });
  /* Con el servidor, los totales vienen de él: los reportes del almacén no
     son la fuente y no hace falta volver a pedir cada vez que cambian. */
  const fuente = api.usaSoloDatosReales() && api.esAreaReal(claveArea) ? null : reportes;

  useEffect(() => {
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true }));
    api.totalesDelAnio(claveArea, anio, fuente ?? []).then((r) => {
      if (vigente) setEstado({ cargando: false, meses: r.ok ? r.meses : [], error: r.ok ? null : r.error });
    });
    return () => {
      vigente = false;
    };
  }, [claveArea, anio, fuente]);

  const resultado = consolidadoDelBot(claveArea, anio, estado.meses, { generado: new Date().toLocaleDateString('es-PE') });
  if (!resultado) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-table" title="Esta área no lleva consolidado anual" body="Por ahora lo arman Nutrición y Dietética, Laboratorio, Costura y Lavandería, Farmacia, Nefrología y Hemodiálisis, Gineco-Obstetricia, Centro Quirúrgico, Diagnóstico por Imágenes y Epidemiología, con sus reportes entregados." />
      </Mosaic>
    );
  }
  if (estado.cargando) {
    return (
      <Mosaic stacked className="hrl-panel" aria-busy="true">
        <Skeleton height={120} radius="var(--radius-card)" />
        <Skeleton height={320} radius="var(--radius-card)" />
      </Mosaic>
    );
  }

  const c = resultado.consolidado;
  const conDato = c.conDato.filter(Boolean).length;
  const filas = c.bloques.flatMap((b) => [
    ...b.filas.map((x) => ({ id: `${b.id}-${x.formato}`, etiqueta: `${b.titulo === 'COMENSALES' ? 'Comensales' : 'Pacientes'} · ${x.etiqueta === 'HOSPITALIZACION' ? 'Hospitalización' : 'Emergencia'}`, valores: x.valores, acumulado: x.acumulado })),
    { id: `${b.id}-total`, etiqueta: `Total de ${b.titulo === 'COMENSALES' ? 'comensales' : 'pacientes'}`, valores: b.total, acumulado: b.acumulado, total: true },
  ]);
  filas.push({ id: 'general', etiqueta: 'Comensales y pacientes', valores: c.general, acumulado: c.acumuladoGeneral, total: true });

  const columnas = [
    { key: 'etiqueta', label: 'Raciones', width: 230, render: (f) => (f.total ? <strong>{f.etiqueta}</strong> : f.etiqueta) },
    ...MESES_CORTOS.map((m, i) => ({
      key: `m${i}`,
      label: m,
      align: 'right',
      tooltip: c.conDato[i] ? `${c.meses[i].toLowerCase()}: reporte entregado` : `${c.meses[i].toLowerCase()}: sin reporte entregado (no es cero)`,
      render: (f) => <span className="hrl-mono">{f.total ? <strong>{cifra(f.valores[i])}</strong> : cifra(f.valores[i])}</span>,
    })),
    { key: 'acumulado', label: 'Acumulado', align: 'right', tooltip: 'Suma de los meses con reporte entregado.', render: (f) => <strong className="hrl-mono">{cifra(f.acumulado)}</strong> },
  ];

  return (
    <Mosaic className="hrl-panel">
      {estado.error && <Alert tone="error" title="No se pudo leer el consolidado">{estado.error}</Alert>}
      <div className="hrl-kpis">
        <StatCard label={`Meses entregados ${anio}`} value={`${conDato} de 12`} severity="neutral" percent={(conDato / 12) * 100} info="Meses con su reporte entregado a Estadística. Solo esos entran en el consolidado." />
        <StatCard label="Raciones del año" value={c.acumuladoGeneral == null ? SIN_DATOS : cifra(c.acumuladoGeneral)} note="Comensales y pacientes, acumulado" severity={c.acumuladoGeneral == null ? 'nodata' : 'neutral'} delay={60} info="Suma de los totales mensuales de los cuatro reportes." />
        <StatCard label="Meta anual" value="Meta no definida" severity="nodata" delay={120} info="La meta anual de raciones todavía no se registra en el sistema. Sin meta, no hay porcentaje de avance que mostrar." />
      </div>

      <Card
        accent="var(--primary)"
        icon="sh-table"
        title={`Consolidado ${anio} · ${nombreArea(claveArea)}`}
        subtitle="El total de raciones de cada mes, como el TOTAL que el área armaba a mano. Lo arma el bot con los meses entregados"
        actions={
          <Tooltip title={resultado.nombre} body="El consolidado en Excel, con el diseño del TOTAL del área: los meses en columnas, el acumulado y la meta. Las sumas son fórmulas." focusable={false}>
            <Button icon="sh-export" onClick={() => descargar(resultado.bytes, resultado.nombre)} disabled={!conDato}>
              Descargar el Excel
            </Button>
          </Tooltip>
        }
        flush
      >
        {conDato ? (
          <DataTable columns={columnas} rows={filas} rowKey={(f) => f.id} />
        ) : (
          <div className="hrl-cuerpo">
            <EmptyState icon="sh-table" title={`Todavía no hay meses entregados en ${anio}`} body="El consolidado se arma solo, con cada reporte mensual que el área envía a Estadística." />
          </div>
        )}
      </Card>
    </Mosaic>
  );
}
