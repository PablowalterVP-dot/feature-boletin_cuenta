/* El consolidado anual de Diagnóstico por Imágenes y de Epidemiología: cada
   fila del consolidado del bot (las modalidades; los servicios con infección
   y las muertes), mes a mes, con el acumulado del año, y el Excel que arma el
   bot (areas/imagenes/consolidado.js, areas/epidemiologia/consolidado.js).

   Se arma con los meses ENTREGADOS. Un mes sin reporte entregado queda vacío,
   no en cero. Las dos áreas llegaron juntas el 27/10/2026 y comparten esta
   pantalla en lugar de dos copias de la de Nefrología. */

import { Alert, Button, Card, DataTable, EmptyState, Mosaic, StatCard, Tooltip } from '@hrl/core-ui';
import { consolidado as consolidadoDelBot } from '@/app/servicios/bot-validador.js';
import { descargar } from '@/app/servicios/ejemplos-nutricion.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { numero } from '@/app/dominio/formato.js';
import { LECTURA_IIH } from '@/app/datos/formatos/epidemiologia-calculos.js';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

const AREAS = Object.freeze({
  imagenes: Object.freeze({
    icono: 'sh-xray',
    titulo: 'Exámenes por modalidad',
    subtitulo: 'Rayos X, ecografía (con biopsias y procedimientos oncológicos), tomografía y mamografía, mes a mes. Los meses sin reporte entregado van vacíos, no en cero',
    etiqueta: 'Modalidad',
    filas: (c) => [...c.modalidades, { id: 'total', titulo: 'Total de exámenes', total: true, ...c.total }, { id: 'monto', titulo: 'Monto en soles', soles: true, ...c.monto }],
    cifraAnual: (c) => ({ etiqueta: 'Exámenes del año', valor: c.total.acumulado, info: 'Suma de las seis modalidades en los meses con reporte entregado. La mamografía incluye la campaña.' }),
  }),
  epidemiologia: Object.freeze({
    icono: 'sh-shield',
    titulo: 'Casos nuevos de infección intrahospitalaria',
    subtitulo: 'Por servicio o tipo de infección, mes a mes; las muertes que registra la misma tabla van al final y no suman. Los meses sin reporte entregado van vacíos, no en cero',
    etiqueta: 'Servicio o tipo',
    filas: (c) => [...c.grupos.filter((g) => g.infeccion), { id: 'infecciones', titulo: 'Infecciones intrahospitalarias', total: true, ...c.infecciones }, ...c.grupos.filter((g) => !g.infeccion)],
    cifraAnual: (c) => ({ etiqueta: 'Infecciones del año', valor: c.infecciones.acumulado, info: LECTURA_IIH }),
  }),
});

export default function ConsolidadoPorFilas({ claveArea, reportes, anio }) {
  const config = AREAS[claveArea];
  const delAnio = reportes.filter((r) => r.area === claveArea && r.periodo.startsWith(`${anio}-`) && estaEntregado(r.estado));
  const enCamino = delAnio.filter((r) => r.resumen);
  const meses = delAnio.filter((r) => !r.resumen).map((r) => ({ periodo: r.periodo, datos: r.datos }));

  if (!delAnio.length) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon={config.icono} title={`Todavía no hay meses entregados en ${anio}`} body="El consolidado se arma solo con los meses que el área ya envió. Aparecerá aquí con el primero." />
      </Mosaic>
    );
  }

  const resultado = consolidadoDelBot(claveArea, anio, meses, {});
  const c = resultado.consolidado;
  const conDato = c.conDato.filter(Boolean).length;
  const anual = config.cifraAnual(c);
  const cifra = (fila, v) => (v == null ? '—' : fila.soles ? `S/ ${numero(v, 2)}` : numero(v));

  const columnas = [
    { key: 'titulo', label: config.etiqueta, width: 260, render: (f) => (f.total ? <strong>{f.titulo}</strong> : f.titulo) },
    ...MESES_CORTOS.map((m, i) => ({
      key: `m${i}`,
      label: m,
      align: 'right',
      tooltip: c.conDato[i] ? `${c.meses[i].toLowerCase()}: reporte entregado` : `${c.meses[i].toLowerCase()}: sin reporte entregado (no es cero)`,
      render: (f) => <span className="hrl-mono">{cifra(f, f.porMes[i])}</span>,
    })),
    { key: 'acumulado', label: 'Acumulado', align: 'right', tooltip: 'Suma de los meses con reporte entregado.', render: (f) => <strong className="hrl-mono">{cifra(f, f.acumulado)}</strong> },
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
        <StatCard label={anual.etiqueta} value={anual.valor == null ? '—' : numero(anual.valor)} delay={60} info={anual.info} />
      </div>
      <Card
        accent="var(--primary)"
        icon={config.icono}
        title={`${config.titulo} · ${anio}`}
        subtitle={config.subtitulo}
        actions={
          <Tooltip title={resultado.nombre} body="El consolidado en Excel: los meses en columnas y el acumulado del año." focusable={false}>
            <Button icon="sh-export" onClick={() => descargar(resultado.bytes, resultado.nombre)} disabled={!conDato}>
              Descargar el Excel
            </Button>
          </Tooltip>
        }
        flush
      >
        <DataTable columns={columnas} rows={config.filas(c)} rowKey={(f) => f.id} />
      </Card>
    </Mosaic>
  );
}
