/* El consolidado anual de Gineco-Obstetricia: cada columna de los dos
   cuadros (controles prenatales; partos, cesáreas y nacidos), sumada entre
   sus filas, mes a mes, con el acumulado del año.

   El bot arma este consolidado con los meses ENTREGADOS
   (areas/ginecologia/consolidado.js) y lo descarga como un .xlsx propio. Un
   mes sin reporte entregado queda vacío, no en cero — y lo mismo un mes
   entregado cuyo Excel no traía el cuadro 2 (de enero a agosto de 2026). */

import { Alert, Card, Button, DataTable, EmptyState, Mosaic, StatCard, Tooltip } from '@hrl/core-ui';
import { consolidado as consolidadoDelBot } from '@/app/servicios/bot-validador.js';
import { descargar } from '@/app/servicios/ejemplos-nutricion.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { numero } from '@/app/dominio/formato.js';

const AREA = 'ginecologia';
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const cifra = (v) => (v == null ? '—' : numero(v));

export default function ConsolidadoGinecologia({ reportes, anio }) {
  const delAnio = reportes.filter((r) => r.area === AREA && r.periodo.startsWith(`${anio}-`) && estaEntregado(r.estado));
  const enCamino = delAnio.filter((r) => r.resumen);
  const meses = delAnio.filter((r) => !r.resumen).map((r) => ({ periodo: r.periodo, datos: r.datos }));
  const resultado = consolidadoDelBot(AREA, anio, meses, {});

  if (!delAnio.length) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-baby" title={`Todavía no hay meses entregados en ${anio}`} body="El consolidado se arma solo con los meses que el área ya envió. Aparecerá aquí con el primero." />
      </Mosaic>
    );
  }

  const c = resultado.consolidado;
  const conDato = c.conDato.filter(Boolean).length;
  const controles = c.indicadores.find((i) => i.id === 'f1.controles_prenatales');
  const partos = c.indicadores.find((i) => i.id === 'f2.total_partos');

  const columnas = [
    { key: 'titulo', label: 'Indicador', width: 280 },
    ...MESES_CORTOS.map((m, i) => ({
      key: `m${i}`,
      label: m,
      align: 'right',
      tooltip: c.conDato[i] ? `${c.meses[i].toLowerCase()}: reporte entregado` : `${c.meses[i].toLowerCase()}: sin reporte entregado (no es cero)`,
      render: (ind) => <span className="hrl-mono">{cifra(ind.porMes[i])}</span>,
    })),
    { key: 'acumulado', label: 'Acumulado', align: 'right', tooltip: 'Suma de los meses con reporte entregado.', render: (ind) => <strong className="hrl-mono">{cifra(ind.acumulado)}</strong> },
  ];

  return (
    <Mosaic className="hrl-panel">
      {enCamino.length > 0 && (
        <Alert tone="info" title={`Faltan llegar ${enCamino.length === 1 ? 'un mes' : `${enCamino.length} meses`} del servidor`}>
          El consolidado se completa solo cuando llegue su detalle. Mientras tanto, esos meses no se suman.
        </Alert>
      )}
      <div className="hrl-kpis">
        <StatCard label="Meses con reporte" value={`${conDato} de 12`} info="Meses del año con reporte entregado a Estadística. Un mes sin reporte queda vacío, no en cero." />
        <StatCard label="Controles prenatales del año" value={cifra(controles?.acumulado)} note="Cuadro 1, acumulado" delay={60} info="Suma del indicador «Controles prenatales realizados», en los meses con reporte entregado." />
        <StatCard label="Partos del año" value={cifra(partos?.acumulado)} note="Cuadro 2, acumulado" delay={120} info="Suma del indicador «Total de partos»: solo cuenta desde que el Excel trae el cuadro 2 (setiembre de 2026)." />
      </div>

      <Card
        accent="var(--primary)"
        icon="sh-baby"
        title={`Eventos bajo vigilancia institucional · ${anio}`}
        subtitle="Las columnas de los dos cuadros, mes a mes. Los meses sin reporte entregado, o sin ese cuadro, van vacíos"
        actions={
          <Tooltip title={resultado.nombre} body="El consolidado en Excel: los meses en columnas, el acumulado del año." focusable={false}>
            <Button icon="sh-export" onClick={() => descargar(resultado.bytes, resultado.nombre)} disabled={!conDato}>
              Descargar el Excel
            </Button>
          </Tooltip>
        }
        flush
      >
        <DataTable columns={columnas} rows={c.indicadores} rowKey={(ind) => ind.id} />
      </Card>
    </Mosaic>
  );
}
