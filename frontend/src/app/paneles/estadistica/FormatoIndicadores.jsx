/* Los 22 indicadores de gestión hospitalaria de un periodo, con su acumulado
   del año. Numerador y denominador están a la vista: un indicador sin su
   fracción no se puede verificar. */

import { Alert, Card, DataTable, Icon, Tooltip } from '@hrl/core-ui';
import { CATEGORIAS, decimalesDe } from '@/app/datos/diresa/indicadores.js';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { EstadoFuente } from './comunes.jsx';

export function textoIndicador(indicador, valor) {
  if (valor == null) return SIN_DATOS;
  const cifra = numero(valor, decimalesDe(indicador));
  if (indicador.unidad === '%') return `${cifra} %`;
  return indicador.unidad ? `${cifra} ${indicador.unidad}` : cifra;
}

function Termino({ termino, valor }) {
  return (
    <Tooltip title={termino.etiqueta} body={`Fuente: ${termino.fuente}.`} focusable={false}>
      <span style={{ fontVariantNumeric: 'tabular-nums', cursor: 'help', color: valor == null ? 'var(--subtle-foreground)' : undefined }}>
        {valor == null ? SIN_DATOS : numero(valor)}
      </span>
    </Tooltip>
  );
}

export default function FormatoIndicadores({ lista, acumulado, periodo, periodosAcumulados }) {
  const desde = periodosAcumulados[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Alert tone="info" title="Correcciones respecto de la hoja de cálculo actual">
        El porcentaje de cirugías suspendidas (n.º 22) usa el mismo factor ×100 todos los meses y un denominador vacío da «Sin
        datos», no #¡DIV/0!. El acumulado suma numeradores y denominadores y recalcula, igual que la columna TOTAL del
        cuadro: nunca promedia los valores mensuales.
      </Alert>

      {CATEGORIAS.map((cat) => {
        const filas = lista.filter((i) => i.categoria === cat.clave);

        const columnas = [
          { key: 'n', label: 'N.º', width: 56, render: (i) => <span className="hrl-mono">{i.n}</span> },
          {
            key: 'nombre',
            label: 'Indicador',
            render: (i) => (
              <Tooltip title={i.nombre} body={`${i.mide}${i.nota ? ` ${i.nota}` : ''}`} focusable={false}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'help' }}>
                  {i.nombre}
                  {i.nota && (
                    <span style={{ color: 'var(--warning-fg)', display: 'inline-flex' }} role="img" aria-label="Tiene una nota">
                      <Icon name="sh-warn" size={14} />
                    </span>
                  )}
                </span>
              </Tooltip>
            ),
          },
          { key: 'numerador', label: 'Numerador', width: 120, align: 'right', tooltip: 'Pase el cursor por la cifra para ver qué cuenta y de dónde sale.', render: (i) => <Termino termino={i.num} valor={i.numerador} /> },
          { key: 'denominador', label: 'Denominador', width: 120, align: 'right', tooltip: 'Pase el cursor por la cifra para ver qué cuenta y de dónde sale.', render: (i) => <Termino termino={i.den} valor={i.denominador} /> },
          { key: 'factor', label: 'Factor', width: 80, align: 'right', tooltip: 'Por cuánto se multiplica la fracción: 1, 100 (porcentaje) o 1000 (tasa por mil).', render: (i) => `×${numero(i.factor)}` },
          {
            key: 'valor',
            label: etiquetaPeriodo(periodo),
            width: 150,
            align: 'right',
            tooltip: 'Valor del mes. «Sin datos» cuando falta el numerador o el denominador, o el denominador es cero.',
            render: (i) => <strong style={{ fontVariantNumeric: 'tabular-nums', color: i.valor == null ? 'var(--subtle-foreground)' : undefined }}>{textoIndicador(i, i.valor)}</strong>,
          },
          {
            key: 'acumulado',
            label: 'Acumulado',
            width: 150,
            align: 'right',
            tooltip: `Desde ${etiquetaPeriodo(desde)} hasta ${etiquetaPeriodo(periodo)}.`,
            render: (i) => {
              const a = acumulado.find((x) => x.n === i.n);
              return (
                <Tooltip title="Acumulado del año" body={`${a.mesesConDato} mes(es) con dato. Numerador ${a.numerador == null ? SIN_DATOS : numero(a.numerador)}, denominador ${a.denominador == null ? SIN_DATOS : numero(a.denominador)}.`} focusable={false}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>{textoIndicador(i, a.valor)}</span>
                </Tooltip>
              );
            },
          },
          {
            key: 'fuente',
            label: 'Fuente',
            width: 230,
            tooltip: 'Estado del reporte del que salen los datos. Los datos de Estadística no dependen de ningún área.',
            render: (i) =>
              i.areas.length ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {i.areas.map((a) => (
                    <EstadoFuente key={a.area} area={a.area} estado={a.estado} />
                  ))}
                </span>
              ) : (
                <EstadoFuente estado="propio" />
              ),
          },
        ];

        return (
          <Card accent="var(--primary)" icon="sh-traffic-light" key={cat.clave} title={cat.titulo} total={`${filas.length} indicadores`}>
            <DataTable columns={columnas} rows={filas} rowKey={(i) => i.n} empty="Sin indicadores." />
          </Card>
        );
      })}
    </div>
  );
}
