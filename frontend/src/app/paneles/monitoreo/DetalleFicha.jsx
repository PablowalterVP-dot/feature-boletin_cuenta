/* El detalle de una ficha: cómo se calcula, de dónde sale y su mes a mes, con la lectura
   oficial y la del hospital separadas. En la 21 se ajustan las salas de operaciones. */

import { useMemo, useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, Mosaic, NumberCell, Stack, Toast } from '@hrl/core-ui';
import { DIMENSIONES, estadoDelIndicador, HALLAZGOS, hayDatos, lecturaRegistrada, nombreDeFuente, salasDelMes, SALAS_BASE, serieDelIndicador, serieDelModulo } from '@/app/datos/monitoreo.js';
import { fechaCorta, numero } from '@/app/dominio/formato.js';
import { ACUMULACION, acumuladoDe, textoDeLogro } from '@/app/dominio/monitoreo.js';
import { etiquetaPeriodo, mesesDelAnioHasta } from '@/app/dominio/periodos.js';
import * as api from '@/app/servicios/api.js';
import { useCifrasHospitalizacion } from '@/app/servicios/hospitalizacion.js';
import { esCoberturaCompleta, textoDeCobertura } from '@/app/hospitalizacion/datos/cobertura.js';
import { LECTURAS } from '@/app/datos/monitoreo-lecturas.js';
import { mejorDe } from '@/app/dominio/analisis.js';
import { useDesempeno } from '@/app/paneles/desempeno/comunes.jsx';
import GraficoIndicador from '@/app/paneles/monitoreo/GraficoIndicador.jsx';
import { ComparacionPropia, ParteOficial, PideDatos, periodoDe } from '@/app/paneles/monitoreo/PanelDesempeno.jsx';
import RegistrarDatos from '@/app/paneles/monitoreo/RegistrarDatos.jsx';
import { BotonVolver, Cifra, Conclusion, Estado, formatoDe, formatoDeGrafico, fraccionDe, frasesDe, Rotulo } from '@/app/paneles/monitoreo/comunes.jsx';

const entero = (n) => (n == null ? 'Sin datos' : numero(n, Number.isInteger(n) ? 0 : 2));

const columnasDelMes = (parte, f, retirar) => [
  { key: 'mes', label: 'Mes', render: (p) => etiquetaPeriodo(p.periodo) },
  { key: 'num', label: parte.numerador ?? 'Numerador', align: 'right', render: (p) => entero(p.num) },
  { key: 'den', label: parte.denominador ?? 'Denominador', align: 'right', render: (p) => entero(p.den) },
  { key: 'valor', label: 'Resultado', align: 'right', render: (p) => <strong>{f(p.valor)}</strong> },
  ...(retirar
    ? [{
        key: 'accion',
        label: '',
        width: 110,
        align: 'right',
        render: (p) =>
          p.origen === 'digitado' ? (
            <Button tone="ghost" size="sm" icon="sh-trash" aria-label={`Retirar la cifra de ${etiquetaPeriodo(p.periodo)}`} onClick={() => retirar(parte.clave, p.mes)}>
              Retirar
            </Button>
          ) : null,
      }]
    : []),
];

/* Las salas de cada mes. Sin escribir son 4: se escribe solo el mes que quedó con menos. */
function AjusteDeSalas({ meses, propios, puede }) {
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const guardar = async (periodo, v) => {
    if (v != null && (v < 1 || v > SALAS_BASE || !Number.isInteger(v))) {
      setError(`Las salas van de 1 a ${SALAS_BASE}, en número entero.`);
      return;
    }
    /* Las 4 de siempre no se guardan: no son un ajuste. */
    const r = await api.guardarDatoDelMes(periodo, 'salasOperativas', v === SALAS_BASE ? null : v);
    setError(r.ok ? null : r.error);
    if (r.ok) setToast(`Salas de ${etiquetaPeriodo(periodo).toLowerCase()} actualizadas.`);
  };
  const columnas = [
    { key: 'mes', label: 'Mes', render: (p) => etiquetaPeriodo(p) },
    {
      key: 'salas',
      label: 'Salas operativas',
      width: 170,
      tooltip: `Sin escribir, son ${SALAS_BASE}. Se escribe solo el mes en que se inhabilitó alguna.`,
      render: (p) => (puede ? <NumberCell value={propios?.[p]?.salasOperativas ?? null} onChange={(v) => guardar(p, v)} width={80} suffix="salas" aria-label={`Salas operativas de ${etiquetaPeriodo(p)}`} /> : <span>{salasDelMes(propios, p)}</span>),
    },
    { key: 'usa', label: 'Se usan', width: 110, align: 'right', render: (p) => <strong>{salasDelMes(propios, p)}</strong> },
  ];
  return (
    <Card title="Salas de operaciones por mes" subtitle={`Son ${SALAS_BASE}. Si en un periodo se inhabilita alguna, escriba las que quedaron en ese mes`} wide>
      <Stack gap={3} className="hrl-monitoreo__cuerpo">
        {error && (
          <Alert tone="error" title="No se guardó">
            {error}
          </Alert>
        )}
        <DataTable columns={columnas} rows={meses} rowKey={(p) => p} />
        <span className="hrl-monitoreo__nota">Vale para este cálculo y para los indicadores 12, 13 y 14 de gestión hospitalaria. No cambia la cifra oficial de MINSA.</span>
      </Stack>
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}

/* Lo que mide el sistema de hospitalización, con la misma fórmula que la lectura propia
   (fase 4 de la decisión 0011). Solo de las áreas con plano: va aparte, rotulado como
   parcial, y no entra en el gráfico ni en la comparación con la cifra oficial. */
function DelSistemaDeHospitalizacion({ indicador, cifras, f }) {
  const filas = cifras.meses.map((m) => ({ periodo: m.mes, cerrado: m.cerrado, ...indicador.lectura.leerPropios(m) })).filter((p) => p.valor != null);
  const completa = esCoberturaCompleta(cifras.cobertura);
  const columnas = [
    ...columnasDelMes({ numerador: indicador.numerador, denominador: indicador.denominador }, f, null),
    { key: 'estado', label: 'Corte', render: (p) => (p.cerrado ? 'Mes cerrado' : 'Último censo cerrado') },
  ];
  return (
    <Card title="Sistema de hospitalización" subtitle={completa ? 'Desde los ingresos y egresos de cada cama' : 'Cobertura parcial: solo las áreas con plano'} wide>
      <Stack gap={4} className="hrl-monitoreo__cuerpo">
        {!completa && (
          <Alert tone="warning" title="No es la cifra del hospital">
            {textoDeCobertura(cifras.cobertura)} Sirve para comparar esas áreas, no para reemplazar el censo de Estadística ni la cifra oficial.
          </Alert>
        )}
        {filas.length ? (
          <DataTable columns={columnas} rows={filas} rowKey={(p) => p.periodo} />
        ) : (
          <EmptyState icon="sh-chart" title="Todavía no hay cifras este año" body="Aparecen cuando las áreas cierren su primer censo." />
        )}
      </Stack>
    </Card>
  );
}

export default function DetalleFicha({ indicador, reportes, propios, anio, vigente, panel, puede, volver, volverA, abrirModulo, veHospitalizacion = false }) {
  const cifrasHospitalizacion = useCifrasHospitalizacion(anio, veHospitalizacion && Boolean(indicador.lectura?.leerPropios));
  const [registrando, setRegistrando] = useState(false);
  const [errorRetiro, setErrorRetiro] = useState(null);
  const registrados = panel.datos?.resultados ?? [];
  const meses = useMemo(() => mesesDelAnioHasta(vigente), [vigente]);
  const esContexto = indicador.situacion === 'contexto';
  const lectura = useMemo(() => lecturaRegistrada(indicador, registrados, meses), [indicador, registrados, meses]);
  const region = useMemo(() => (esContexto ? lecturaRegistrada(indicador, registrados, meses, 'region') : null), [esContexto, indicador, registrados, meses]);
  const datos = useMemo(() => serieDelIndicador(indicador, { reportes, propios, anio, vigente }), [indicador, reportes, propios, anio, vigente]);
  const resumen = useDesempeno(indicador.modulo ? '/resumen' : null, { anio });
  const resultado14 = resumen.datos?.fichas?.find((f) => f.ficha?.numero === indicador.ficha)?.resultado ?? null;
  const propia = indicador.modulo ? serieDelModulo(datos.meses, resultado14) : datos.propia;
  const acumuladoPropio = propia ? acumuladoDe(propia, 'mensual', indicador.factor) : null;

  const f = formatoDe(indicador.decimales, indicador.unidad);
  const dimension = DIMENSIONES.find((d) => d.clave === indicador.dimension)?.nombre;

  const retirar = async (serie, mes) => {
    const r = await api.monitoreo('DELETE', `/${anio}/resultados`, { params: { ficha: indicador.ficha, serie, mes } });
    if (r.ok) panel.recargar();
    setErrorRetiro(r.ok ? null : r.error);
  };

  const logroTexto = (logro, unidad) => textoDeLogro(logro, unidad, (n) => numero(n, Number.isInteger(n) ? 0 : 1));

  return (
    <Mosaic stacked className="hrl-panel">
      <div>
        <BotonVolver onClick={volver} a={volverA} />
      </div>

      <Card title={`Ficha ${indicador.ficha}: ${indicador.nombre}`} subtitle={dimension} meta={<Estado estado={estadoDelIndicador(indicador, lectura)} />} wide>
        <Stack gap={3} className="hrl-monitoreo__cuerpo">
          <p className="hrl-monitoreo__motivo">
            <strong>Qué significa:</strong> {LECTURAS[indicador.ficha].significa}
          </p>
          {indicador.motivo && (
            <Alert tone="info" title="No se le evalúa al hospital">
              {indicador.motivo}
            </Alert>
          )}
          {indicador.formula && (
            <p className="hrl-monitoreo__motivo">
              <strong>Cómo se calcula:</strong> {indicador.formula}.
            </p>
          )}
          {indicador.numerador && (
            <p className="hrl-monitoreo__motivo">
              <strong>Numerador:</strong> {indicador.numerador}. <strong>Denominador:</strong> {indicador.denominador}.
            </p>
          )}
          <p className="hrl-monitoreo__motivo">
            <strong>Fuente oficial:</strong> {indicador.fuentes.map(nombreDeFuente).join(', ')}.
          </p>
          <p className="hrl-monitoreo__motivo">
            <strong>Meta:</strong> {indicador.series?.some((s) => s.logro) ? indicador.series.map((s) => `${s.nombre}: ${logroTexto(s.logro, s.unidad ?? indicador.unidad)}`).join('; ') : logroTexto(indicador.logro, indicador.unidad)}. <strong>{ACUMULACION[indicador.acumulacion].etiqueta}:</strong> {ACUMULACION[indicador.acumulacion].nota}
          </p>
          {indicador.tipo === 'resultado' && <Rotulo>El Anexo I la clasifica como indicador de resultado, no de desempeño.</Rotulo>}
          {indicador.cuidado && (
            <Alert tone="info" title="A tener en cuenta">
              {indicador.cuidado}
            </Alert>
          )}
          {indicador.hallazgo && (
            <Alert tone="warning" title={HALLAZGOS.fichas}>
              {indicador.hallazgo} Es una nota con fecha: no se recalcula con cada mes.
            </Alert>
          )}
        </Stack>
      </Card>

      {indicador.situacion === 'requiere' && (
        <Card title="Qué hace falta" subtitle={`Lo envía ${indicador.oficina} y lo registra Estadística`} wide>
          <PideDatos indicador={indicador} puede={puede} registrar={() => setRegistrando(true)} />
        </Card>
      )}

      {errorRetiro && (
        <Alert tone="error" title="No se retiró la cifra">
          {errorRetiro}
        </Alert>
      )}

      {lectura.partes.map((parte) => {
        const decimales = parte.factor === 1000 ? 2 : indicador.decimales;
        const fp = formatoDe(decimales, parte.unidad);
        /* Una ficha que no se le evalúa y no tiene fila del hospital: lo que hay es de la región. */
        if (!parte.acumulado && esContexto) return null;
        return (
          <Card key={parte.clave} title={parte.nombre ?? (esContexto ? 'Fila del hospital en el reporte' : indicador.situacion === 'requiere' ? 'Mes a mes' : 'Cifra oficial de MINSA')} subtitle={lectura.corte ? `Reporte DL 1153, corte al ${fechaCorta(lectura.corte)}` : undefined} wide>
            {parte.acumulado ? (
              <Stack gap={4} className="hrl-monitoreo__cuerpo">
                <ParteOficial indicador={indicador} parte={{ ...parte, nombre: null }} comparacion={indicador.lectura && parte.clave === lectura.partes[0].clave && !esContexto ? propia : null} nombreComparacion={indicador.lectura && parte.clave === lectura.partes[0].clave && !esContexto ? indicador.lectura.titulo : null} alto={320} maxFrases={null} />
                <DataTable columns={columnasDelMes(parte, fp, puede && indicador.situacion === 'requiere' ? retirar : null)} rows={parte.puntos.filter((p) => p.num != null)} rowKey={(p) => p.periodo} />
              </Stack>
            ) : (
              <EmptyState icon="sh-chart" title="Todavía no hay cifras este año" body={indicador.situacion === 'requiere' ? `Aparecen cuando Estadística registre lo que envíe ${indicador.oficina}.` : 'Aparecen al cargar el reporte DL 1153 de MINSA.'} />
            )}
          </Card>
        );
      })}

      {region?.hay && (
        <Card title="Región Loreto" subtitle="De toda la región, con todos sus establecimientos: no es una cifra del hospital" wide>
          <Stack gap={4} className="hrl-monitoreo__cuerpo">
            <Cifra valor={f(region.partes[0].acumulado.valor)} unidad={LECTURAS[indicador.ficha].medida} nota={`${periodoDe(region.partes[0].acumulado, indicador.acumulacion)}: ${fraccionDe(region.partes[0].acumulado.num, region.partes[0].acumulado.den, indicador.unidad)}`} />
            <Conclusion tono="info" titulo="Cifra de toda la región, no del hospital" frase={frasesDe(LECTURAS[indicador.ficha], region.partes[0].acumulado, f, { decimales: indicador.decimales })} />
            <GraficoIndicador
              etiqueta={`${indicador.nombre}, región Loreto`}
              puntos={region.partes[0].puntos}
              unidad={indicador.unidad}
              decimales={indicador.decimales}
              escribir={formatoDeGrafico(indicador.decimales, indicador.unidad)}
              leerMes={(p) => `En toda la región: ${frasesDe(LECTURAS[indicador.ficha], p, f, { decimales: indicador.decimales })}`}
              acumulada={indicador.acumulacion === 'acumulada'}
              mejor={mejorDe({ logro: indicador.logro })}
              alto={320}
            />
          </Stack>
        </Card>
      )}

      {indicador.lectura && (
        <Card title={indicador.lectura.titulo} subtitle={indicador.lectura.detalle} wide>
          <Stack gap={4} className="hrl-monitoreo__cuerpo">
            <Alert tone="info" title="Cómo leer esta cifra">
              {indicador.lectura.aclara}
            </Alert>
            {/* En la tarjeta no: solo aquí, donde se está mirando el detalle (03/11/2026). */}
            <ComparacionPropia indicador={indicador} lectura={{ serie: propia, acumulado: acumuladoPropio }} parte={lectura.partes[0]} />
            {indicador.modulo && (
              <div>
                <Button tone="ghost" icon="sh-chart" onClick={abrirModulo}>
                  Abrir la ficha en el módulo de desempeño
                </Button>
              </div>
            )}
            {hayDatos(propia) ? (
              <>
                <Cifra valor={f(acumuladoPropio?.valor ?? null)} unidad={LECTURAS[indicador.ficha].medida} nota={acumuladoPropio ? periodoDe(acumuladoPropio, 'mensual') : ''} />
                <GraficoIndicador
                  etiqueta={`${indicador.nombre}, ${indicador.lectura.titulo}`}
                  puntos={propia}
                  logro={indicador.logro}
                  unidad={indicador.unidad}
                  decimales={indicador.decimales}
                  escribir={formatoDeGrafico(indicador.decimales, indicador.unidad)}
                  describir={(p) => (p.num == null ? null : `${fraccionDe(p.num, p.den, indicador.unidad)}.`)}
                  textoLogro={logroTexto(indicador.logro, indicador.unidad)}
                  mejor={mejorDe({ logro: indicador.logro, menorEsMejor: indicador.menorEsMejor })}
                  alto={320}
                />
                <DataTable columns={columnasDelMes({ numerador: indicador.numerador, denominador: indicador.denominador }, f, null)} rows={propia.filter((p) => p.valor != null)} rowKey={(p) => p.periodo} />
              </>
            ) : (
              <EmptyState icon="sh-chart" title="Todavía no hay cifras este año" body="Aparecen cuando el área entregue su reporte o Estadística digite sus datos." />
            )}
          </Stack>
        </Card>
      )}

      {cifrasHospitalizacion && <DelSistemaDeHospitalizacion indicador={indicador} cifras={cifrasHospitalizacion} f={f} />}

      {indicador.ajustaSalas && <AjusteDeSalas meses={meses} propios={propios} puede={puede} />}

      {indicador.relacionado && (
        <Card title={indicador.relacionado.etiqueta} subtitle={`Dato relacionado, no es el indicador. Fuente: ${indicador.relacionado.fuente}`} wide>
          {hayDatos(datos.relacionada) ? (
            <Stack gap={4} className="hrl-monitoreo__cuerpo">
              <Alert tone="info" title="Cómo leer esta cifra">
                {indicador.relacionado.aclara}
              </Alert>
              <GraficoIndicador etiqueta={indicador.relacionado.etiqueta} puntos={datos.relacionada} unidad={indicador.relacionado.unidad} decimales={0} escribir={formatoDeGrafico(0, indicador.relacionado.unidad)} alto={280} />
            </Stack>
          ) : (
            <EmptyState icon="sh-chart" title="Todavía no hay cifras este año" body="Aparecen en cuanto el área entregue su reporte." />
          )}
        </Card>
      )}

      {registrando && <RegistrarDatos indicador={indicador} anio={anio} meses={meses} registrados={registrados} onClose={() => setRegistrando(false)} onGuardado={panel.recargar} />}
    </Mosaic>
  );
}
