/* El consolidado anual de Laboratorio: la hoja CONSOLIDADO de su libro.

   En el libro del área, CONSOLIDADO suma las doce hojas con fórmulas que se
   rompen cuando cambian las filas de un mes (en el de 2025 varios totales dan
   #REF!). Aquí lo arma el bot (areas/laboratorio/consolidado.js) con los meses
   ENTREGADOS, casilla por casilla, y se descarga con la misma forma.

   Sale de los reportes que ya están en el almacén, con su detalle: a
   diferencia de Nutrición, que solo necesita el total de cada cuadro por mes,
   aquí cada casilla del año es la suma de esa casilla en cada mes. Con el
   servidor, el detalle de los meses más viejos llega en segundo plano
   (api.sincronizarArea); mientras falte alguno, la pantalla lo dice. */

import { Alert, Button, Card, DataTable, EmptyState, Mosaic, StatCard, Tooltip } from '@hrl/core-ui';
import { consolidado as consolidadoDelBot } from '@/app/servicios/bot-validador.js';
import { descargar } from '@/app/servicios/ejemplos-nutricion.js';
import { resumenDelReporte } from '@/app/datos/formatos/resumen.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { numero } from '@/app/dominio/formato.js';
import { Secciones } from './Secciones.jsx';

const AREA = 'laboratorio';
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const cifra = (v) => (v == null ? '—' : numero(v));

export default function ConsolidadoLaboratorio({ reportes, anio }) {
  const delAnio = reportes.filter((r) => r.area === AREA && r.periodo.startsWith(`${anio}-`) && estaEntregado(r.estado));
  const enCamino = delAnio.filter((r) => r.resumen);
  const meses = delAnio.filter((r) => !r.resumen).map((r) => ({ periodo: r.periodo, datos: r.datos }));
  const resultado = consolidadoDelBot(AREA, anio, meses, {});
  const c = resultado.consolidado;
  const conDato = c.conDato.filter(Boolean).length;

  if (!delAnio.length) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-table" title={`Todavía no hay meses entregados en ${anio}`} body="El consolidado se arma solo con los meses que el área ya envió. Aparecerá aquí con el primero." />
      </Mosaic>
    );
  }

  const [examenes, , , sangre] = resumenDelReporte(AREA, { datos: c.datos }, `${anio}-01`);

  const columnas = [
    { key: 'titulo', label: 'Sección', width: 220 },
    ...MESES_CORTOS.map((m, i) => ({
      key: `m${i}`,
      label: m,
      align: 'right',
      tooltip: c.conDato[i] ? `${c.meses[i].toLowerCase()}: reporte entregado` : `${c.meses[i].toLowerCase()}: sin reporte entregado (no es cero)`,
      render: (s) => <span className="hrl-mono">{cifra(s.porMes[i])}</span>,
    })),
    { key: 'acumulado', label: 'Acumulado', align: 'right', tooltip: 'Suma de los meses con reporte entregado.', render: (s) => <strong className="hrl-mono">{cifra(s.acumulado)}</strong> },
    {
      key: 'unidad',
      label: 'Cuenta',
      width: 110,
      render: (s) => (
        <Tooltip title={s.unidad} body={s.unidad === 'exámenes' ? 'Exámenes realizados.' : s.unidad === 'unidades' ? 'Unidades entregadas y pruebas de Banco de Sangre: no se suman a los exámenes.' : 'Actividades de programación, seguimiento y evaluación.'} focusable={false}>
          <span>{s.unidad}</span>
        </Tooltip>
      ),
    },
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
        <StatCard label={examenes.etiqueta} value={cifra(examenes.valor)} note="Acumulado del año" delay={60} info={examenes.ayuda} />
        <StatCard label={sangre.etiqueta} value={cifra(sangre.valor)} note="Unidades, acumulado del año" delay={120} info={sangre.ayuda} />
      </div>

      <Card accent="var(--primary)" icon="sh-table" title={`Total de cada sección por mes · ${anio}`} subtitle="Los meses sin reporte entregado van vacíos, no en cero" flush>
        <DataTable columns={columnas} rows={c.secciones} rowKey={(s) => s.id} />
      </Card>

      <Card
        accent="var(--primary)"
        icon="sh-flask"
        title={`Consolidado ${anio}, examen por examen`}
        subtitle="La hoja CONSOLIDADO del libro: cada casilla es la suma de los meses entregados"
        actions={
          <Tooltip title={resultado.nombre} body="La hoja CONSOLIDADO con la forma del libro del área, con sus fórmulas, lista para imprimir o archivar." focusable={false}>
            <Button tone="ghost" icon="sh-export" onClick={() => descargar(consolidadoDelBot(AREA, anio, meses, {}).bytes, resultado.nombre)}>
              Descargar el consolidado
            </Button>
          </Tooltip>
        }
      >
        <div className="hrl-cuerpo">
          <Secciones datos={c.datos} periodo={`${anio}-01`} informe={{ errores: [], avisos: [], info: [] }} origen={null} />
        </div>
      </Card>
    </Mosaic>
  );
}
