/* El consolidado anual de Farmacia: el total de cada uno de sus tres cuadros
   (Atenciones del mes, Sala de Operaciones y Consultorios externos), mes a
   mes, con el acumulado del año.

   Farmacia no sube un Excel: su informe mensual es un Word, y no tiene un
   libro anual del que sacar una hoja CONSOLIDADO como Laboratorio. El bot
   arma este consolidado con los meses ENTREGADOS
   (areas/farmacia/consolidado.js) y lo descarga como un .xlsx propio,
   independiente del formato del informe de entrada. Un mes sin reporte
   entregado queda vacío, no en cero. */

import { Alert, Button, Card, DataTable, EmptyState, Mosaic, StatCard, Tooltip } from '@hrl/core-ui';
import { consolidado as consolidadoDelBot } from '@/app/servicios/bot-validador.js';
import { descargar } from '@/app/servicios/ejemplos-nutricion.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { numero } from '@/app/dominio/formato.js';

const AREA = 'farmacia';
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const cifra = (v) => (v == null ? '—' : numero(v));

export default function ConsolidadoFarmacia({ reportes, anio }) {
  const delAnio = reportes.filter((r) => r.area === AREA && r.periodo.startsWith(`${anio}-`) && estaEntregado(r.estado));
  const enCamino = delAnio.filter((r) => r.resumen);
  const meses = delAnio.filter((r) => !r.resumen).map((r) => ({ periodo: r.periodo, datos: r.datos }));
  const resultado = consolidadoDelBot(AREA, anio, meses, {});

  if (!delAnio.length) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-pill" title={`Todavía no hay meses entregados en ${anio}`} body="El consolidado se arma solo con los meses que el área ya envió. Aparecerá aquí con el primero." />
      </Mosaic>
    );
  }

  const c = resultado.consolidado;
  const conDato = c.conDato.filter(Boolean).length;
  const atenciones = c.cuadros.find((cu) => cu.id === 'f1');

  const columnas = [
    { key: 'titulo', label: 'Cuadro', width: 260 },
    ...MESES_CORTOS.map((m, i) => ({
      key: `m${i}`,
      label: m,
      align: 'right',
      tooltip: c.conDato[i] ? `${c.meses[i].toLowerCase()}: reporte entregado` : `${c.meses[i].toLowerCase()}: sin reporte entregado (no es cero)`,
      render: (cu) => <span className="hrl-mono">{cifra(cu.porMes[i])}</span>,
    })),
    { key: 'acumulado', label: 'Acumulado', align: 'right', tooltip: 'Suma de los meses con reporte entregado.', render: (cu) => <strong className="hrl-mono">{cifra(cu.acumulado)}</strong> },
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
        <StatCard label="Atenciones del año" value={cifra(atenciones?.acumulado)} note="Formato 1, acumulado" delay={60} info="Suma del total de Atenciones del mes (SIS, convenios y otros financiadores), en los meses con reporte entregado." />
      </div>

      <Card
        accent="var(--primary)"
        icon="sh-pill"
        title={`Atenciones por cuadro · ${anio}`}
        subtitle="El total de Atenciones del mes, Sala de Operaciones y Consultorios externos. Los meses sin reporte entregado van vacíos, no en cero"
        actions={
          <Tooltip title={resultado.nombre} body="El consolidado en Excel: los meses en columnas, el acumulado del año, con sus fórmulas." focusable={false}>
            <Button icon="sh-export" onClick={() => descargar(resultado.bytes, resultado.nombre)} disabled={!conDato}>
              Descargar el Excel
            </Button>
          </Tooltip>
        }
        flush
      >
        <DataTable columns={columnas} rows={c.cuadros} rowKey={(cu) => cu.id} />
      </Card>
    </Mosaic>
  );
}
