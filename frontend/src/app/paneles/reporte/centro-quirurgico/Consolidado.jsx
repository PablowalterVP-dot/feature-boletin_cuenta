/* El consolidado anual de Centro Quirúrgico: su reporte 1, «Producción
   asistencial de intervenciones quirúrgicas», con los doce meses.

   En el libro del área esta hoja se llena a mano o con vínculos a los libros
   de cada mes, que se rompen al moverlos. Aquí la arma el bot con los meses
   ENTREGADOS (areas/centro-quirurgico/consolidado.js): el área solo sube su
   libro del mes. Un mes sin reporte entregado queda vacío, no en cero. El
   Excel que se descarga trae además el consolidado por especialidad y el Top
   Ten del año. */

import { Alert, Button, Card, DataTable, EmptyState, Mosaic, StatCard, Tooltip } from '@hrl/core-ui';
import { consolidado as consolidadoDelBot } from '@/app/servicios/bot-validador.js';
import { descargar } from '@/app/servicios/ejemplos-nutricion.js';
import { TIPOS } from '@/app/datos/formatos/centro-quirurgico.js';
import { sumar } from '@/app/datos/formatos/centro-quirurgico-calculos.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { numero, horasYMinutos } from '@/app/dominio/formato.js';

const AREA = 'centro-quirurgico';
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
// Las horas, en horas:minutos como en el Excel del área.
const cifra = (v, horas = false) => (v == null ? '—' : horas ? horasYMinutos(v) : numero(v));

export default function ConsolidadoCentroQuirurgico({ reportes, anio }) {
  const delAnio = reportes.filter((r) => r.area === AREA && r.periodo.startsWith(`${anio}-`) && estaEntregado(r.estado));
  const enCamino = delAnio.filter((r) => r.resumen);
  const meses = delAnio.filter((r) => !r.resumen).map((r) => ({ periodo: r.periodo, datos: r.datos }));
  const resultado = consolidadoDelBot(AREA, anio, meses, {});

  if (!delAnio.length) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-scalpel" title={`Todavía no hay meses entregados en ${anio}`} body="El consolidado se arma solo con los meses que el área ya envió. Aparecerá aquí con el primero." />
      </Mosaic>
    );
  }

  const c = resultado.consolidado;
  const conDato = c.conDato.filter(Boolean).length;
  const realizadas = sumar(['mayores', 'menores'].map((k) => c.conceptos.find((x) => x.clave === k).acumulado.total));

  /* Una fila por concepto y tipo de cirugía, como el RESUMEN del área. */
  const filas = c.conceptos.flatMap((k) =>
    TIPOS.map((t) => ({ id: `${k.clave}.${t.clave}`, titulo: `${k.label} · ${t.label.toLowerCase()}`, decimal: k.decimal, porMes: k.porMes[t.clave], acumulado: k.acumulado[t.clave] })),
  );
  const columnas = [
    { key: 'titulo', label: 'Concepto', width: 280 },
    ...MESES_CORTOS.map((m, i) => ({
      key: `m${i}`,
      label: m,
      align: 'right',
      tooltip: c.conDato[i] ? `${c.meses[i].toLowerCase()}: reporte entregado` : `${c.meses[i].toLowerCase()}: sin reporte entregado (no es cero)`,
      render: (f) => <span className="hrl-mono">{cifra(f.porMes[i], f.decimal)}</span>,
    })),
    { key: 'acumulado', label: 'Acumulado', align: 'right', tooltip: 'Suma de los meses con reporte entregado.', render: (f) => <strong className="hrl-mono">{cifra(f.acumulado, f.decimal)}</strong> },
  ];

  const especialidades = c.especialidades
    .map((e) => ({ ...e, total: sumar([e.mayor.acumulado, e.menor.acumulado]) }))
    .filter((e) => e.total != null);
  const columnasEsp = [
    { key: 'label', label: 'Especialidad' },
    { key: 'mayor', label: 'Cirugía mayor', align: 'right', width: 140, render: (e) => <span className="hrl-mono">{cifra(e.mayor.acumulado)}</span> },
    { key: 'menor', label: 'Cirugía menor', align: 'right', width: 140, render: (e) => <span className="hrl-mono">{cifra(e.menor.acumulado)}</span> },
    { key: 'total', label: 'Total del año', align: 'right', width: 140, render: (e) => <strong className="hrl-mono">{cifra(e.total)}</strong> },
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
        <StatCard label="Cirugías del año" value={cifra(realizadas)} note="Mayores y menores, programadas y de emergencia" delay={60} info="Suma de las cirugías del RESUMEN de cada mes entregado. Cuenta intervenciones, no pacientes." />
      </div>

      <Card
        accent="var(--primary)"
        icon="sh-table"
        title={`Producción asistencial de intervenciones quirúrgicas · ${anio}`}
        subtitle="El reporte 1 del área, armado con el RESUMEN de cada mes entregado. Los meses sin reporte van vacíos, no en cero"
        actions={
          <Tooltip title={resultado.nombre} body="El consolidado en Excel: la producción de los doce meses (RESUMEN), las cirugías por especialidad y el Top Ten del año." focusable={false}>
            <Button icon="sh-export" onClick={() => descargar(resultado.bytes, resultado.nombre)} disabled={!conDato}>
              Descargar el Excel
            </Button>
          </Tooltip>
        }
        flush
      >
        <DataTable columns={columnas} rows={filas} rowKey={(f) => f.id} />
      </Card>

      <Card accent="var(--info)" icon="sh-pie" title={`Cirugías por especialidad · ${anio}`} subtitle="Acumulado de los meses entregados" flush>
        <DataTable columns={columnasEsp} rows={especialidades} rowKey={(e) => e.clave} />
      </Card>
    </Mosaic>
  );
}
