/* El consolidado anual de Costura y Lavandería: los kilogramos de ropa
   lavada del año, por los mismos diez grupos de servicios de la sección D
   del consolidado de servicios intermedios que se remite a DIRESA.

   A diferencia de Nutrición (el total de cuatro cuadros) y de Laboratorio
   (la hoja CONSOLIDADO, casilla por casilla), el reporte de Lavandería es
   diario: no existe un "Excel del año" con la forma de un mes. El bot arma
   este consolidado con los meses ENTREGADOS (areas/lavanderia/consolidado.js),
   agrupando el Formato 1 como ya lo agrupa el Formato 4. Un mes sin reporte
   entregado queda vacío, no en cero. */

import { Alert, Button, Card, DataTable, EmptyState, Mosaic, StatCard, Tooltip } from '@hrl/core-ui';
import { consolidado as consolidadoDelBot } from '@/app/servicios/bot-validador.js';
import { descargar } from '@/app/servicios/ejemplos-nutricion.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { numero } from '@/app/dominio/formato.js';

const AREA = 'lavanderia';
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const cifra = (v) => (v == null ? '—' : numero(v));

export default function ConsolidadoLavanderia({ reportes, anio }) {
  const delAnio = reportes.filter((r) => r.area === AREA && r.periodo.startsWith(`${anio}-`) && estaEntregado(r.estado));
  const enCamino = delAnio.filter((r) => r.resumen);
  const meses = delAnio.filter((r) => !r.resumen).map((r) => ({ periodo: r.periodo, datos: r.datos }));
  const resultado = consolidadoDelBot(AREA, anio, meses, {});

  if (!delAnio.length) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-washer" title={`Todavía no hay meses entregados en ${anio}`} body="El consolidado se arma solo con los meses que el área ya envió. Aparecerá aquí con el primero." />
      </Mosaic>
    );
  }

  const c = resultado.consolidado;
  const conDato = c.conDato.filter(Boolean).length;

  const columnas = [
    { key: 'titulo', label: 'Grupo de servicios', width: 260 },
    ...MESES_CORTOS.map((m, i) => ({
      key: `m${i}`,
      label: m,
      align: 'right',
      tooltip: c.conDato[i] ? `${c.meses[i].toLowerCase()}: reporte entregado` : `${c.meses[i].toLowerCase()}: sin reporte entregado (no es cero)`,
      render: (g) => <span className="hrl-mono">{g.total ? <strong>{cifra(g.porMes[i])}</strong> : cifra(g.porMes[i])}</span>,
    })),
    { key: 'acumulado', label: 'Acumulado', align: 'right', tooltip: 'Suma de los meses con reporte entregado.', render: (g) => <strong className="hrl-mono">{cifra(g.acumulado)}</strong> },
  ];

  const filas = [...c.grupos, { id: 'total', titulo: 'Total de kilogramos', porMes: c.total.porMes, acumulado: c.total.acumulado, total: true }];

  return (
    <Mosaic className="hrl-panel">
      {enCamino.length > 0 && (
        <Alert tone="info" title={`Faltan llegar ${enCamino.length === 1 ? 'un mes' : `${enCamino.length} meses`} del servidor`}>
          El consolidado se completa solo cuando llegue su detalle. Mientras tanto, esos meses no se suman.
        </Alert>
      )}
      <div className="hrl-kpis">
        <StatCard label="Meses con reporte" value={`${conDato} de 12`} info="Meses del año con reporte entregado a Estadística. Un mes sin reporte queda vacío, no en cero." />
        <StatCard label="Kilogramos del año" value={cifra(c.total.acumulado)} note="Ropa lavada, acumulado" delay={60} info="Suma de los kilos de los diez grupos de servicios, en los meses con reporte entregado." />
      </div>

      <Card
        accent="var(--primary)"
        icon="sh-washer"
        title={`Kilogramos de ropa lavada por grupo · ${anio}`}
        subtitle="Los mismos diez grupos de la sección D del consolidado de servicios intermedios (DIRESA). Los meses sin reporte entregado van vacíos, no en cero"
        actions={
          <Tooltip title={resultado.nombre} body="El consolidado en Excel: los meses en columnas, el acumulado del año, con sus fórmulas." focusable={false}>
            <Button icon="sh-export" onClick={() => descargar(resultado.bytes, resultado.nombre)} disabled={!conDato}>
              Descargar el Excel
            </Button>
          </Tooltip>
        }
        flush
      >
        <DataTable columns={columnas} rows={filas} rowKey={(g) => g.id} rowClass={(g) => (g.total ? 'hrl-fila--total' : undefined)} />
      </Card>
    </Mosaic>
  );
}
