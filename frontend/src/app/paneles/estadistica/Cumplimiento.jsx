/* Cumplimiento por área y periodo.

   La pantalla que hoy no existe en ninguna forma: el control de quién entregó
   vive en la memoria de la encargada.

   Desde el 12/10/2026 Estadística ya no valida ni remite: el bot valida al
   subir el Excel y, al enviar, el reporte llega a la vez a Estadística y a las
   oficinas de la matriz. Así que solo queda un problema que vigilar —**el área
   no ha enviado**—, y se resuelve llamando al área. */

import { Alert, Badge, Button, Card, DataTable, EmptyState, Icon, IconButton, Mosaic, StatCard, Tooltip } from '@hrl/core-ui';
import { areasDelFlujo, usaSoloDatosReales } from '@/app/servicios/api.js';
import { PERIODOS } from '@/app/datos/reportes.js';
import { reporteDe, estadoDe, useHoy, plazoRealDe, primerPeriodoDe } from '@/app/datos/store.js';
import { estado, ESPERA, estaEntregado } from '@/app/dominio/estados.js';
import { periodoVigente, etiquetaPeriodo, etiquetaCorta, estaVencido, mesAnterior, mesesDelAnioHasta, plazoEfectivo } from '@/app/dominio/periodos.js';
import { fechaCorta } from '@/app/dominio/formato.js';
import { LISTA, FILA, SECUNDARIO, AvisoAreasFuera } from './comunes.jsx';

/* Con el servidor, los meses del año hasta el que toca reportar. `PERIODOS` es la ventana fija
   del prototipo: con datos reales dejaba fuera enero y, desde noviembre, el propio mes en curso,
   aunque el servidor sí los traía. */
const periodosDeLaTabla = (vigente) => (usaSoloDatosReales() ? mesesDelAnioHasta(vigente) : PERIODOS);

/* Con un mes por columna, una insignia por celda obligaba a desplazar la tabla y escondía justo
   los meses recientes y el total. El icono cambia de forma con el estado, y el nombre está en
   el tooltip, en el lector de pantalla y en la leyenda de abajo. */
const LEYENDA_DE_ESTADOS = Object.freeze(['remitido', 'borrador', 'no_iniciado']);

function CeldaDeEstado({ clave, periodo }) {
  const e = estado(clave);
  return (
    <Tooltip title={e.label} body={etiquetaPeriodo(periodo)} focusable={false}>
      <span className={`hrl-cumplimiento__celda hrl-cumplimiento__celda--${clave === 'no_iniciado' ? 'vacio' : e.tono}`} role="img" aria-label={`${etiquetaPeriodo(periodo)}: ${e.label}`}>
        <Icon name={e.icono} size={16} />
      </span>
    </Tooltip>
  );
}

function ListaDelMes({ titulo, subtitulo, accent, icono, filas, vacio, detalle, accion }) {
  return (
    <Card accent={accent} icon={icono} title={`${titulo}: ${filas.length}`} subtitle={subtitulo}>
      {filas.length === 0 ? (
        <EmptyState icon="sh-ok" tone="var(--success)" title={vacio} />
      ) : (
        <ul style={LISTA}>
          {filas.map((f) => (
            <li key={f.area.clave} style={FILA}>
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 'var(--text-base)' }}>{f.area.nombreCorto}</strong>
                <span style={SECUNDARIO}>{detalle(f)}</span>
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                <Badge label={estado(f.estado).label} tone={estado(f.estado).tono} />
                {accion?.(f)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Cumplimiento({ reportes, plazosReales = {}, irA }) {
  const hoy = useHoy();
  const periodo = periodoVigente(hoy);
  const periodos = periodosDeLaTabla(periodo);
  const anterior = mesAnterior(periodo);
  const entregadosAntes = areasDelFlujo().filter((a) => estaEntregado(estadoDe(reportes, a.clave, anterior))).length;

  const delMes = areasDelFlujo().map((a) => {
    const reporte = reporteDe(reportes, a.clave, periodo);
    return { area: a, reporte, estado: reporte?.estado ?? 'no_iniciado' };
  });

  const entregados = delMes.filter((f) => estaEntregado(f.estado));
  const esperanArea = delMes.filter((f) => estado(f.estado).espera === ESPERA.AREA);
  /* Cada área puede tener su propio plazo real (Nutrición, día 5; las demás,
     el genérico del prototipo): no hay un solo «vencido» para el grupo. */
  const vencidas = esperanArea.filter((f) => estaVencido(periodo, hoy, plazoRealDe(plazosReales, f.area.clave, periodo)));
  const tarde = entregados.filter((f) => f.reporte.enviadoEn.slice(0, 10) > plazoEfectivo(periodo, plazoRealDe(plazosReales, f.area.clave, periodo)));

  /* Sin cerrar: desde el primer reporte de cada área. Los meses anteriores no
     son deuda del área: aún no reportaba por el sistema (primerPeriodoDe). */
  const arrastrados = periodos.filter((p) => p < periodo)
    .flatMap((p) => areasDelFlujo().map((a) => ({ area: a, periodo: p, estado: estadoDe(reportes, a.clave, p), desde: primerPeriodoDe(reportes, a.clave) })))
    .filter((x) => !estaEntregado(x.estado) && x.desde != null && x.periodo >= x.desde);

  const abrir = (claveArea, p = periodo) => irA('revision', { area: claveArea, periodo: p });

  const columnas = [
    {
      key: 'area',
      label: 'Área',
      width: 170,
      tooltip: 'Área que reporta. Abre su reporte del periodo en curso en la bandeja.',
      render: (f) => (
        <Tooltip title={f.area.nombre} body="Abre el reporte del periodo en curso en la bandeja." focusable={false}>
          <Button tone="link" onClick={() => abrir(f.area.clave)}>
            {f.area.nombreBreve}
          </Button>
        </Tooltip>
      ),
    },
    ...periodos.map((p) => ({
      key: p,
      label: etiquetaCorta(p),
      align: 'center',
      tooltip: `${etiquetaPeriodo(p)}${p === periodo ? ', periodo en curso' : ''}: estado del reporte de cada área.`,
      render: (f) => <CeldaDeEstado clave={f.estados[p]} periodo={p} />,
    })),
    {
      key: 'entregados',
      label: 'Entregados',
      width: 104,
      align: 'right',
      tooltip: 'Meses de esta tabla que el área ya entregó.',
      render: (f) => <strong>{periodos.filter((p) => estaEntregado(f.estados[p])).length} de {periodos.length}</strong>,
    },
    {
      key: 'acciones',
      label: '',
      width: 64,
      align: 'right',
      render: (f) => (
        <div className="hrl-acciones-icono">
          <Tooltip title="Abrir en la bandeja" body={`Abre el reporte de ${f.area.nombreCorto} de ${etiquetaPeriodo(periodo)}.`} focusable={false}>
            <IconButton icon="sh-eye" tone="action" aria-label={`Abrir ${f.area.nombreCorto} en la bandeja`} onClick={() => abrir(f.area.clave)} />
          </Tooltip>
        </div>
      ),
    },
  ];

  const filas = areasDelFlujo().map((a) => ({
    clave: a.clave,
    area: a,
    estados: Object.fromEntries(periodos.map((p) => [p, estadoDe(reportes, a.clave, p)])),
  }));

  return (
    <Mosaic className="hrl-panel">
      <AvisoAreasFuera />
      <div className="hrl-kpis">
        <StatCard
          label={`Entregados de ${etiquetaPeriodo(periodo).toLowerCase()}`}
          value={`${entregados.length} de ${areasDelFlujo().length}`}
          /* Mientras corre el plazo, faltar no es una alarma. */
          severity={entregados.length === areasDelFlujo().length ? 'normal' : vencidas.length ? 'suspect' : 'neutral'}
          percent={(entregados.length / areasDelFlujo().length) * 100}
          info="Reportes que ya salieron del área: validados por el bot y entregados a la vez a Estadística y a las oficinas de la matriz."
        />
        <StatCard
          label={`Entregados de ${etiquetaPeriodo(anterior).toLowerCase()}`}
          value={`${entregadosAntes} de ${areasDelFlujo().length}`}
          severity={entregadosAntes === areasDelFlujo().length ? 'normal' : 'suspect'}
          percent={(entregadosAntes / areasDelFlujo().length) * 100}
          delay={30}
          info="El mes anterior al que toca reportar: al empezar un plazo, el mes en curso aún no tiene entregas y este es el último que debería estar completo."
        />
        <StatCard
          label="Esperan al área"
          value={String(esperanArea.length)}
          severity={vencidas.length ? 'abnormal' : 'normal'}
          note={vencidas.length ? `${vencidas.length} de ${esperanArea.length} ya vencieron su plazo` : 'Aún en plazo'}
          delay={60}
          info="Áreas que no han enviado: no abrieron el reporte o lo tienen a medio llenar. Cada área puede tener su propio plazo."
        />
        <StatCard
          label="Entregados fuera de plazo"
          value={String(tarde.length)}
          severity={tarde.length ? 'suspect' : 'normal'}
          delay={120}
          info="Reportes que llegaron después del plazo de su área. Cuenta solo lo entregado; lo que falta está en «Esperan al área»."
        />
      </div>

      <>
        <ListaDelMes
          titulo="Esperan al área"
          subtitulo={`No han enviado ${etiquetaPeriodo(periodo)}`}
          accent="var(--warning)"
          icono="sh-clock"
          filas={esperanArea}
          vacio="Todas las áreas entregaron"
          detalle={(f) => (f.estado === 'borrador' ? 'Reporte a medio llenar' : 'Todavía no abre el reporte')}
        />
        <ListaDelMes
          titulo="Entregados"
          subtitulo="Validados por el bot y ya en sus oficinas"
          accent="var(--success)"
          icono="sh-inbox"
          filas={entregados}
          vacio="Todavía no llega ningún reporte"
          detalle={(f) => `Recibido el ${fechaCorta(f.reporte.enviadoEn)}`}
          accion={(f) => (
            <Tooltip title="Ver el reporte" body={`Abre en la bandeja lo que entregó ${f.area.nombreCorto}.`} focusable={false}>
              <Button tone="ghost" size="sm" icon="sh-eye" onClick={() => abrir(f.area.clave)}>
                Ver
              </Button>
            </Tooltip>
          )}
        />
      </>

      <Card accent="var(--primary)" icon="sh-traffic-light" title="Cumplimiento por periodo" subtitle={`Estado del reporte de las ${areasDelFlujo().length} áreas, de ${etiquetaPeriodo(periodos[0]).toLowerCase()} a ${etiquetaPeriodo(periodos.at(-1)).toLowerCase()}`} wide>
        <DataTable
          columns={columnas}
          rows={filas}
          rowKey={(f) => f.clave}
          empty="No hay áreas registradas."
          legend={
            <span className="hrl-cumplimiento__leyenda">
              {LEYENDA_DE_ESTADOS.map((clave) => (
                <span key={clave} className="hrl-cumplimiento__clave">
                  <span className={`hrl-cumplimiento__celda hrl-cumplimiento__celda--${clave === 'no_iniciado' ? 'vacio' : estado(clave).tono}`} aria-hidden="true">
                    <Icon name={estado(clave).icono} size={16} />
                  </span>
                  {estado(clave).label}
                </span>
              ))}
              <span>El área es el enlace a su reporte del mes en curso.</span>
            </span>
          }
        />
      </Card>

      {arrastrados.length > 0 && (
        <Alert tone="warning" title={`${arrastrados.length} reporte(s) de meses anteriores sin entregar`}>
          {arrastrados.map((x) => `${x.area.nombreCorto}: ${etiquetaPeriodo(x.periodo)} (${estado(x.estado).label.toLowerCase()})`).join('; ')}.
        </Alert>
      )}
    </Mosaic>
  );
}
