/* Remisión a DIRESA: dos formatos por mes.

   1. Consolidado de servicios intermedios (formato MINSA de 196 columnas).
   2. Indicadores de gestión hospitalaria (22 indicadores GERESA Loreto), también
      como consolidado anual en su Excel oficial (servicios/remision-diresa.js).

   Los dos se arman solos a partir de los reportes entregados por las áreas y de
   los datos propios de Estadística. Lo que no se entregó queda vacío, y el
   módulo lo dice antes de remitir. Se puede remitir con faltantes —el plazo
   manda—, pero hay que aceptarlo expresamente y la constancia lo registra. */

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, DataTable, Dialog, Icon, IconButton, Mosaic, StatCard, PageTabs, Toast, Tooltip } from '@hrl/core-ui';
import { construirServiciosIntermedios, filasCsvServiciosIntermedios } from '@/app/datos/diresa/servicios-intermedios.js';
import { calcularIndicadores, acumularIndicadores, filasCsvIndicadores } from '@/app/datos/diresa/indicadores.js';
import { ESTADO_FUENTE } from '@/app/datos/diresa/fuentes.js';
import { PERIODOS } from '@/app/datos/reportes.js';
import { nombreArea } from '@/app/datos/areas.js';
import { registrarRemisionDiresa, remisionDiresaDe, useHoy } from '@/app/datos/store.js';
import { periodoVigente, etiquetaPeriodo, plazoDiresaDe, mesesDelAnioHasta, ultimosPeriodos } from '@/app/dominio/periodos.js';
import { fechaCorta, fechaHora } from '@/app/dominio/formato.js';
import { descargarCsv } from '@/app/dominio/csv.js';
import { descargarIndicadoresGestion, descargarServiciosIntermedios } from '@/app/servicios/remision-diresa.js';
import { reportesConDetalle } from '@/app/servicios/api.js';
import { SelectorPeriodo, AvisoAreasFuera, sinServidor } from './comunes.jsx';
import FormatoServiciosIntermedios from './FormatoServiciosIntermedios.jsx';
import FormatoIndicadores from './FormatoIndicadores.jsx';
import DatosPropios from './DatosPropios.jsx';

/* Los dos grupos de la lista de fuentes: lo que ya entra y lo que depende de
   que el área envíe. Ya no hay «pendientes de validar»: lo que el área
   entrega llega validado por el bot (dominio/estados.js). */
const GRUPOS_FUENTE = Object.freeze([
  {
    estado: 'validado',
    titulo: 'Entregados',
    ayuda: 'Reportes que el área entregó, validados por el bot: sus cifras entran a los dos formatos.',
  },
  {
    estado: 'sin-reporte',
    titulo: 'Sin remitir',
    ayuda: 'El área no ha remitido su reporte de este periodo. Sus celdas quedan vacías, nunca en cero.',
  },
]);

function ListaFuentes({ fuentes }) {
  return (
    <div className="hrl-diresa__fuentes">
      {GRUPOS_FUENTE.map((g) => {
        const e = ESTADO_FUENTE[g.estado];
        const areas = fuentes.filter((f) => f.estado === g.estado);
        return (
          <section key={g.estado} className={`hrl-diresa__grupo hrl-diresa__grupo--${e.tone}`} aria-label={`${g.titulo}: ${areas.length}`}>
            <Tooltip title={g.titulo} body={g.ayuda}>
              <span className="hrl-diresa__grupo-cabecera">
                <Icon name={e.icono} size={18} />
                <span className="hrl-diresa__grupo-titulo">{g.titulo}</span>
                <Badge label={String(areas.length)} tone={e.tone} />
              </span>
            </Tooltip>
            {areas.length ? (
              <ul className="hrl-diresa__areas">
                {areas.map((f) => (
                  <li key={f.area}>
                    <Icon name={e.icono} size={14} />
                    {nombreArea(f.area)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hrl-diresa__vacio">Ninguna área en este estado.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* De enero al mes elegido. Salía de `PERIODOS`, la ventana fija del prototipo
   (termina en setiembre de 2026): con el servidor, el acumulado de octubre se
   quedaba sin enero y sin el propio octubre. */
const periodosDelAnio = (periodo) => mesesDelAnioHasta(periodo);

export default function RemisionDiresa({ reportes, propios, remisiones, usuario, params = {} }) {
  const hoy = useHoy();
  const vigente = periodoVigente(hoy);
  const pendientes = ultimosPeriodos(PERIODOS.length, vigente)
    .reverse()
    .filter((p) => p < vigente && !remisionDiresaDe(remisiones, p));
  /* Con el backend no hay registro de remisiones a DIRESA (sinServidor()): no
     se puede saber qué mes quedó pendiente, así que se abre el vigente.
     Mientras nadie elija, el mes se deriva y no se guarda: el «hoy» del servidor
     llega después de abrir la pantalla, y con el `HOY` del prototipo se abría
     setiembre en lugar de octubre (16/11/2026). */
  const [elegido, setPeriodo] = useState(params.periodo ?? null);
  const periodo = elegido ?? (sinServidor() ? vigente : (pendientes[0] ?? vigente));
  const [pestana, setPestana] = useState('si');
  const [confirmando, setConfirmando] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [toast, setToast] = useState(null);
  /* Qué Excel se está armando: 'si', 'ind' o null. */
  const [generando, setGenerando] = useState(null);

  const si = useMemo(() => construirServiciosIntermedios(periodo, reportes, propios), [periodo, reportes, propios]);
  const indicadores = useMemo(() => calcularIndicadores(periodo, reportes, propios), [periodo, reportes, propios]);
  const acumulado = useMemo(() => acumularIndicadores(periodosDelAnio(periodo), reportes, propios), [periodo, reportes, propios]);

  /* Fuentes de área sin reporte en cualquiera de los dos formatos. */
  const faltantes = useMemo(() => {
    const mapa = new Map();
    for (const f of si.faltantes) mapa.set(f.area, f.estado);
    for (const ind of indicadores) {
      for (const a of ind.areas) if (a.estado !== 'validado') mapa.set(a.area, a.estado);
    }
    return [...mapa.entries()].map(([area, estado]) => ({ area, estado }));
  }, [si, indicadores]);

  /* Todas las áreas que alimentan cualquiera de los dos formatos, con su
     estado: la lista de la tarjeta las muestra también cuando están validadas. */
  const fuentes = useMemo(() => {
    const mapa = new Map();
    for (const f of Object.values(si.fuentes)) mapa.set(f.area, f.estado);
    for (const ind of indicadores) for (const a of ind.areas) if (!mapa.has(a.area)) mapa.set(a.area, a.estado);
    return [...mapa.entries()]
      .map(([area, estado]) => ({ area, estado }))
      .sort((a, b) => nombreArea(a.area).localeCompare(nombreArea(b.area), 'es'));
  }, [si, indicadores]);

  const remision = remisionDiresaDe(remisiones, periodo);
  const conValor = indicadores.filter((i) => i.valor != null).length;
  const plazo = plazoDiresaDe(periodo);
  const vencido = hoy > plazo;

  const cambiarPeriodo = (p) => {
    setPeriodo(p);
    setAcepta(false);
  };

  const registrar = () => {
    const registro = registrarRemisionDiresa(periodo, { actor: usuario.nombre, faltantes: faltantes.map((f) => f.area) });
    setConfirmando(false);
    setAcepta(false);
    if (registro) setToast(`Remisión de ${etiquetaPeriodo(periodo)} a DIRESA registrada. Constancia ${registro.constancia}.`);
  };

  const historial = [...remisiones].sort((a, b) => b.periodo.localeCompare(a.periodo));

  const columnasHistorial = [
    {
      key: 'periodo',
      label: 'Periodo',
      width: 160,
      tooltip: 'Abre los formatos de ese mes.',
      render: (r) => (
        <Button tone="link" onClick={() => { cambiarPeriodo(r.periodo); setPestana('si'); }}>
          {etiquetaPeriodo(r.periodo)}
        </Button>
      ),
    },
    { key: 'fecha', label: 'Remitido el', width: 170, render: (r) => fechaHora(r.fecha) },
    { key: 'constancia', label: 'Constancia', width: 150, tooltip: 'Comprobante de la remisión a DIRESA.', render: (r) => <span className="hrl-mono">{r.constancia}</span> },
    {
      key: 'faltantes',
      label: 'Cobertura',
      tooltip: 'Si la remisión se hizo con todas las fuentes entregadas o faltó alguna.',
      render: (r) => (r.faltantes.length ? `Sin ${r.faltantes.map(nombreArea).join(', ')}` : 'Completa'),
    },
    {
      key: 'acciones',
      label: '',
      width: 64,
      align: 'right',
      render: (r) => (
        <div className="hrl-acciones-icono">
          <Tooltip title="Ver los formatos" body={`Abre los formatos de ${etiquetaPeriodo(r.periodo)}.`} focusable={false}>
            <IconButton icon="sh-eye" tone="action" aria-label={`Ver los formatos de ${etiquetaPeriodo(r.periodo)}`} onClick={() => { cambiarPeriodo(r.periodo); setPestana('si'); }} />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <Mosaic className="hrl-panel">
      <AvisoAreasFuera />
      <Card accent="var(--primary)" icon="sh-send" title={`Consolidado de ${etiquetaPeriodo(periodo)}`} subtitle="Qué fuentes entregaron, el periodo y las descargas">
        <div className="hrl-diresa">
          <div className="hrl-diresa__estado">
            {remision ? (
              <Alert tone="success" title={`Remitido el ${fechaHora(remision.fecha)} · constancia ${remision.constancia}`}>
                {remision.faltantes.length
                  ? `Se remitió sin datos de ${remision.faltantes.map(nombreArea).join(', ')}.`
                  : 'Con todas sus fuentes entregadas.'}
              </Alert>
            ) : faltantes.length ? (
              <Alert tone="warning" title={`${faltantes.length} fuente(s) sin reporte`}>
                Las celdas que dependen de ellas quedan vacías, nunca en cero. Conviene esperar a que esas áreas envíen antes de remitir.
              </Alert>
            ) : (
              <Alert tone="success" title="Todas las fuentes están entregadas: listo para remitir" />
            )}
            <ListaFuentes fuentes={fuentes} />
          </div>

          <aside className="hrl-diresa__acciones" aria-label="Periodo y descargas">
            <SelectorPeriodo periodo={periodo} onCambiar={cambiarPeriodo} />
            <div className="hrl-diresa__descargas">
              <span className="hrl-diresa__rotulo">Descargas</span>
              <Tooltip as="div" title="Formato DIRESA en Excel" body={`El Excel oficial de servicios intermedios, sin cambiar su formato, con la fila del hospital llena en la hoja de ${etiquetaPeriodo(periodo).split(' ')[0].toLowerCase()}. Una celda sin dato queda vacía, no en cero.`} focusable={false}>
                <Button
                  tone="ghost"
                  icon="sh-export"
                  disabled={generando != null}
                  onClick={async () => {
                    setGenerando('si');
                    try {
                      const completos = await reportesConDetalle([periodo]);
                      const { hoja, fila } = await descargarServiciosIntermedios(construirServiciosIntermedios(periodo, completos, propios));
                      setToast(`Formato DIRESA descargado: hoja ${hoja}, fila ${fila}.`);
                    } catch (e) {
                      setToast(`No se pudo armar el Excel: ${e.message}`);
                    } finally {
                      setGenerando(null);
                    }
                  }}
                >
                  {generando === 'si' ? 'Armando el Excel…' : 'Formato DIRESA (Excel)'}
                </Button>
              </Tooltip>
              <Tooltip
                as="div"
                title="Indicadores del año en Excel"
                body={`El Excel oficial de indicadores de gestión, hoja ${periodo.slice(0, 4)}, con el numerador y el denominador de cada mes que el sistema puede calcular. Lo que falta queda vacío para completarlo a mano; los valores y el total los calcula Excel al abrirlo.`}
                focusable={false}
              >
                <Button
                  tone="ghost"
                  icon="sh-export"
                  disabled={generando != null}
                  onClick={async () => {
                    setGenerando('ind');
                    try {
                      const anio = periodo.slice(0, 4);
                      const completos = await reportesConDetalle(mesesDelAnioHasta(`${anio}-12`));
                      const { conDato, celdas, meses } = await descargarIndicadoresGestion(anio, completos, propios);
                      setToast(
                        meses.length
                          ? `Indicadores ${anio} descargados: ${conDato} de ${celdas} cifras llenas, de ${meses.length} ${meses.length === 1 ? 'mes' : 'meses'}. El resto queda vacío para completarlo.`
                          : `Indicadores ${anio} descargados vacíos: el sistema todavía no tiene cifras de ese año.`,
                      );
                    } catch (e) {
                      setToast(`No se pudo armar el Excel: ${e.message}`);
                    } finally {
                      setGenerando(null);
                    }
                  }}
                >
                  {generando === 'ind' ? 'Armando el Excel…' : 'Indicadores del año (Excel)'}
                </Button>
              </Tooltip>
              <Tooltip as="div" title="Consolidado en CSV" body="Las 196 columnas con su letra, su nombre y la fila del hospital. Excel lo abre directamente." focusable={false}>
                <Button
                  tone="ghost"
                  icon="sh-export"
                  disabled={generando != null}
                  onClick={async () => {
                    const completos = await reportesConDetalle([periodo]);
                    descargarCsv(`HRL_servicios_intermedios_${periodo}.csv`, filasCsvServiciosIntermedios(construirServiciosIntermedios(periodo, completos, propios)));
                  }}
                >
                  Consolidado CSV
                </Button>
              </Tooltip>
              <Tooltip as="div" title="Indicadores en CSV" body="Los 22 indicadores con numerador, denominador, factor, valor del mes y acumulado." focusable={false}>
                <Button
                  tone="ghost"
                  icon="sh-export"
                  disabled={generando != null}
                  onClick={async () => {
                    const meses = periodosDelAnio(periodo);
                    const completos = await reportesConDetalle(meses);
                    descargarCsv(
                      `HRL_indicadores_gestion_${periodo}.csv`,
                      filasCsvIndicadores(calcularIndicadores(periodo, completos, propios), acumularIndicadores(meses, completos, propios)),
                    );
                  }}
                >
                  Indicadores CSV
                </Button>
              </Tooltip>
            </div>
            {/* Sin servidor la remisión no tiene dónde guardarse: se perdería al
                recargar, así que el botón no se ofrece. */}
            {!remision && !sinServidor() && (
              <Tooltip as="div" title="Registrar remisión" body="Deja constancia de que los dos formatos de este mes se enviaron a DIRESA." focusable={false}>
                <Button icon="sh-send" onClick={() => setConfirmando(true)} style={{ minHeight: 'var(--touch-target-lg)' }}>
                  Registrar remisión
                </Button>
              </Tooltip>
            )}
          </aside>
        </div>
      </Card>

      <div className="hrl-kpis">
        <StatCard
          label="Consolidado: campos con dato"
          value={`${si.manualesConDato} de ${si.manuales}`}
          percent={(si.manualesConDato / si.manuales) * 100}
          severity={si.manualesConDato === si.manuales ? 'normal' : 'suspect'}
          info="Campos del formato de servicios intermedios que vienen de un área o de Estadística. Los 47 totales calculados y los 10 campos de identificación se completan solos."
        />
        <StatCard
          label="Indicadores con valor"
          value={`${conValor} de 22`}
          percent={(conValor / 22) * 100}
          severity={conValor === 22 ? 'normal' : 'suspect'}
          delay={60}
          info="Indicadores con numerador y denominador disponibles y denominador distinto de cero."
        />
        <StatCard
          label="Plazo de remisión"
          value={fechaCorta(plazo)}
          note={remision ? 'Remitido' : vencido ? 'Vencido' : 'En plazo'}
          severity={remision ? 'normal' : vencido ? 'abnormal' : 'neutral'}
          delay={120}
          info="Supuesto: día 15 del mes siguiente. El plazo real de DIRESA está por confirmar."
        />
        <StatCard
          label="Meses sin remitir"
          value={String(pendientes.length)}
          note={pendientes.map(etiquetaPeriodo).join(', ') || 'Ninguno'}
          severity={pendientes.length ? 'suspect' : 'normal'}
          delay={180}
          info="Meses cerrados que todavía no se remitieron a DIRESA."
        />
      </div>

      {/* Los formatos de la remisión son vistas de esta pantalla: van en la
          píldora del centro de la barra (PageTabs), no en una fila propia. */}
      <PageTabs
        label="Formatos de la remisión"
        tabs={[
          { key: 'si', label: 'Servicios intermedios' },
          { key: 'ind', label: 'Indicadores de gestión' },
          { key: 'propios', label: 'Datos de Estadística' },
          { key: 'historial', label: 'Remisiones anteriores' },
        ]}
        active={pestana}
        onChange={setPestana}
      />

      {pestana === 'si' && <FormatoServiciosIntermedios resultado={si} />}
      {pestana === 'ind' && (
        <FormatoIndicadores lista={indicadores} acumulado={acumulado} periodo={periodo} periodosAcumulados={periodosDelAnio(periodo)} />
      )}
      {pestana === 'propios' && <DatosPropios periodo={periodo} propios={propios} editable={!remision} permisos={usuario?.permisos} />}
      {pestana === 'historial' && (
        <Card accent="var(--primary)" icon="sh-clock" title="Remisiones a DIRESA" subtitle="Una por mes, con los dos formatos" total={String(historial.length)}>
          <DataTable columns={columnasHistorial} rows={historial} rowKey={(r) => r.id} empty="Todavía no se ha remitido ningún mes a DIRESA." />
        </Card>
      )}

      {confirmando && (
        <Dialog
          title={`Registrar la remisión de ${etiquetaPeriodo(periodo)} a DIRESA`}
          subtitle="Se registran los dos formatos a la vez. Una vez remitido, el mes no se vuelve a remitir desde el sistema."
          onClose={() => setConfirmando(false)}
          maxWidth={620}
          footer={
            <>
              <Button tone="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
              <Button icon="sh-send" disabled={faltantes.length > 0 && !acepta} onClick={registrar}>
                Registrar remisión
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 'var(--text-base)' }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>
                Consolidado de servicios intermedios: {si.manualesConDato} de {si.manuales} campos con dato.
              </li>
              <li>Indicadores de gestión: {conValor} de 22 con valor.</li>
            </ul>

            {faltantes.length > 0 ? (
              <>
                <Alert tone="warning" title="Hay fuentes sin reporte">
                  {faltantes.map((f) => `${nombreArea(f.area)} (${ESTADO_FUENTE[f.estado].label.toLowerCase()})`).join(', ')}. Sus
                  celdas irán vacías y la constancia registrará lo que faltó.
                </Alert>
                <Checkbox checked={acepta} onChange={setAcepta} label="Remitir de todos modos, con esas celdas vacías" />
              </>
            ) : (
              <Alert tone="success" title="Todas las fuentes entregadas" />
            )}

            {vencido && <Alert tone="warning" title={`El plazo supuesto venció el ${fechaCorta(plazo)}`} />}
          </div>
        </Dialog>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
