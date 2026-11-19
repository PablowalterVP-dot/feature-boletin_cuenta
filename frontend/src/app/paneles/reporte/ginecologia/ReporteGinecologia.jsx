/* Reporte del mes de Gineco-Obstetricia.

   El mismo recorrido que Laboratorio, en tres pasos:
     1. Subir el Excel          el del mes, o el formato en blanco llenado
     2. Revisar y resolver      lo que encontró el bot, cuadro por cuadro
     3. Enviar                  a Estadística y a las oficinas de su matriz, a la vez

   Dos diferencias con Laboratorio, y por qué:
     · El área sube un Excel nuevo cada mes, no un libro con una hoja por
       mes: no hay «libro completo» que ofrecer, cada archivo es su propio
       reporte (plantilla.js, lector.js).
     · Las alertas no se justifican con un texto: se corrigen o se confirman
       con Dr. Mochi (Correccion.jsx), como los errores. Lo que no cuadra se
       corrige ahí, en cualquier mes cargado, y al finalizar se carga el mismo
       Excel con solo esas celdas cambiadas. (Antes se pedía subir el Excel
       de nuevo; desde el 21/10/2026 todas las áreas tienen la corrección.) */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Dialog, Field, Icon, Mosaic, ProgressSteps, Stack, Toast } from '@hrl/core-ui';
import { reporteDe, registrarCarga, guardarDatos, leerEstado, useHoy } from '@/app/datos/store.js';
import * as api from '@/app/servicios/api.js';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { validarArchivo, validarDatos, firmaDe, recordarArchivo } from '@/app/servicios/bot-validador.js';
import * as ejemplos from '@/app/servicios/ejemplos-ginecologia.js';
import { destinosDe } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { estado, esEditable, estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, periodoVigente } from '@/app/dominio/periodos.js';
import { fechaHora } from '@/app/dominio/formato.js';
import EstadoPeriodo from '../../EstadoPeriodo.jsx';
import PasoCarga from '../nutricion/PasoCarga.jsx';
import PorResolver from '../nutricion/PorResolver.jsx';
import Lectura from '../nutricion/Lectura.jsx';
import HerramientasPrueba from '../nutricion/HerramientasPrueba.jsx';
import { Constancia } from '../nutricion/ReporteNutricion.jsx';
import PasoEnvio from './PasoEnvio.jsx';
import { CuadroControlesPrenatales, CuadroPartosYNacidos } from './Cuadros.jsx';
import Correccion, { avisoDeCorreccion, TEXTO_CONFIRMADA } from '../Correccion.jsx';
import { SelectorDeMes, AvisoMesAnterior } from '../Comunes.jsx';
import CargaDeMeses from '../CargaDeMeses.jsx';

const CLAVE = 'ginecologia';
const NOMBRE = 'Departamento de Gineco-Obstetricia';

const CONFIG_CARGA = Object.freeze({
  subtitulo: 'El Excel EBVI del mes: el bot encuentra los dos cuadros por sus rótulos, no por su posición en la hoja',
  frases: [
    'Abriendo el Excel…',
    'Buscando el cuadro de controles prenatales…',
    'Buscando el cuadro de partos, cesáreas y nacidos…',
    'Revisando que los totales cuadren con sus filas…',
    'Comparando con el mes anterior…',
  ],
  instrucciones: [
    'Lo normal es subir el Excel del mes tal como lo prepara el área (EBVI_Consolidado_Mes_*.xlsx).',
    'No cambie los rótulos de las filas ni de las columnas: el bot encuentra cada cifra por ellos.',
    'Si el cuadro 2 (partos, cesáreas y nacidos) todavía no se reporta ese mes, no pasa nada: basta con el cuadro 1.',
  ],
  nombreDeArchivo: ejemplos.nombreDePlantilla,
  ayudaFormato: (mes) => `El Excel de ${mes} en blanco, con los dos cuadros y sus rótulos ya escritos.`,
  descargarPlantilla: ejemplos.descargarPlantilla,
  ejemploCorrecto: ejemplos.ejemploCorrecto,
  ejemploConErrores: ejemplos.ejemploConErrores,
  ayudaErrores: 'Trae una casilla con letras en el cuadro 1 y un total declarado que no cuadra con la suma de sus filas.',
});

/* Dónde cae un hallazgo, para la lista de lo que hay por resolver. */
function ubicar(h) {
  if (h.formato === 'f1') return 'Controles prenatales';
  if (h.formato === 'f2') return 'Partos, cesáreas y nacidos';
  return null;
}

/* El último mes ya entregado: la comparación del bot con el mes previo. */
function anteriorDe(reportes, periodo) {
  return (
    reportes
      .filter((r) => r.area === CLAVE && r.periodo < periodo && estaEntregado(r.estado))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .map((r) => ({ periodo: r.periodo, datos: r.datos }))
      .at(-1) ?? null
  );
}

function Entregado({ reporte, periodo, herramientas, selector, cargaDelLibro }) {
  const estadoInfo = estado(reporte?.estado);
  const oficinas = reporte?.remision?.destinos ?? [];

  return (
    <Mosaic stacked className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={`${NOMBRE} · enviado, en solo lectura`} meta={<EstadoPeriodo reporte={reporte} periodo={periodo} />} actions={selector}>
        <div className="hrl-campos hrl-cuerpo">
          <Field k="Constancia" v={reporte?.constancia} mono />
          <Field k="Enviado el" v={fechaHora(reporte?.enviadoEn)} />
          <Field k="Estadística" v={estadoInfo.descripcion ?? estadoInfo.label} />
          {oficinas.map((o) => (
            <Field key={o} k={nombreOficina(o)} v="Lo recibió al enviarlo" />
          ))}
        </div>
      </Card>
      <CuadroControlesPrenatales datos={reporte.datos} periodo={periodo} />
      <CuadroPartosYNacidos datos={reporte.datos} periodo={periodo} />
      {cargaDelLibro}
      {herramientas}
    </Mosaic>
  );
}

export default function ReporteGinecologia({ reportes, periodo: periodoPedido, usuario, pruebas = false, pasoPedido, irA }) {
  const mesVigente = periodoVigente(useHoy());
  const periodo = periodoPedido ?? mesVigente;
  const reporte = reporteDe(reportes, CLAVE, periodo);
  const estadoActual = reporte?.estado ?? 'no_iniciado';
  const datos = useMemo(() => reporte?.datos ?? {}, [reporte]);
  const anterior = useMemo(() => anteriorDe(reportes, periodo), [reportes, periodo]);
  const tieneDatos = Object.keys(datos.f1 ?? {}).length > 0 || Object.keys(datos.f2 ?? {}).length > 0;

  const [paso, setPaso] = useState(tieneDatos ? 'revision' : 'carga');
  /* La corrección con Dr. Mochi es un diálogo sobre la revisión, no un paso. */
  const [corrigiendo, setCorrigiendo] = useState(pasoPedido === 'correccion');
  const [procesando, setProcesando] = useState(null);
  usePublicarGuia('flujo', { paso, procesando: Boolean(procesando) });
  /* Con un enlace directo o recién iniciada la sesión, las cifras del mes llegan
     del servidor un momento después de montar la pantalla, y el paso ya se
     había elegido sin ellas: se quedaba en «Subir el archivo» sin forma de
     avanzar (22/10/2026). Cuando llegan, se pasa a la revisión; solo al
     llegar, no si el área volvió a la carga por su cuenta. */
  const teniaDatos = useRef(tieneDatos);
  useEffect(() => {
    if (tieneDatos && !teniaDatos.current && !procesando && pasoPedido !== 'carga') setPaso('revision');
    teniaDatos.current = tieneDatos;
  }, [tieneDatos, procesando, pasoPedido]);
  const [etapa, setEtapa] = useState(null);
  const [bloqueo, setBloqueo] = useState(null);
  const [porReemplazar, setPorReemplazar] = useState(null);
  const [informe, setInforme] = useState(null);
  const [constancia, setConstancia] = useState(null);
  const [toast, setToast] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const [archivoPorConfirmar, setArchivoPorConfirmar] = useState(null);

  const real = api.esAreaReal(CLAVE);

  const alProbar = ({ mensaje, constancia: nueva, alPaso1 }) => {
    setToast(mensaje);
    if (nueva) setConstancia(nueva);
    if (alPaso1) {
      setPaso('carga');
      setInforme(null);
      setBloqueo(null);
    }
  };
  const herramientas = pruebas ? <HerramientasPrueba clave={CLAVE} nombre={NOMBRE} reporte={reporte} periodo={periodo} real={real} onHecho={alProbar} /> : null;
  const editable = esEditable(estadoActual) || estadoActual === 'no_iniciado';
  const firma = useMemo(() => firmaDe(datos, CLAVE), [datos]);
  const vigente = informe != null && !informe.bloqueo && informe.firma === firma;
  const pendientes = vigente ? informe.avisos.filter((a) => !datos.justificaciones?.[a.id]) : [];
  const listo = vigente && informe.errores.length === 0 && pendientes.length === 0;
  const limpio = vigente && informe.errores.length === 0 && informe.avisos.length === 0;

  useEffect(() => {
    if (paso === 'carga' || vigente || !tieneDatos) return undefined;
    if (real) {
      if (reporte?.informe) setInforme({ ...reporte.informe, firma: firmaDe(datos, CLAVE) });
      return undefined;
    }
    let sigue = true;
    validarDatos(datos, { area: CLAVE, periodo, anterior }).then((inf) => {
      if (sigue) setInforme({ ...inf, firma: firmaDe(datos, CLAVE) });
    });
    return () => {
      sigue = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, firma]);

  useEffect(() => {
    if (pasoPedido === 'carga' || pasoPedido === 'revision') setPaso(pasoPedido);
    if (pasoPedido === 'correccion') {
      setPaso('revision');
      setCorrigiendo(true);
    }
  }, [pasoPedido]);

  const abrirMes = (p) => irA?.('reporte', { periodo: p });
  const selector = irA ? <SelectorDeMes reportes={reportes} claveArea={CLAVE} periodo={periodo} vigente={mesVigente} onCambiar={abrirMes} /> : null;
  /* Cargar meses pasados de una vez (CargaDeMeses.jsx), como en Laboratorio: en
     cualquier estado del mes abierto, también uno ya entregado. */
  const cargaDelLibro = <CargaDeMeses area={CLAVE} reportes={reportes} vigente={mesVigente} usuario={usuario} onAbrir={irA ? (p) => irA('reporte', { periodo: p }) : null} />;

  if (estaEntregado(estadoActual)) {
    return (
      <>
        <Entregado reporte={reporte} periodo={periodo} herramientas={herramientas} selector={selector} cargaDelLibro={cargaDelLibro} />
        {constancia && <Constancia reporte={constancia} onCerrar={() => setConstancia(null)} />}
        <Toast message={toast} onClose={() => setToast(null)} />
      </>
    );
  }
  if (!editable) {
    return (
      <Mosaic stacked className="hrl-panel">
        <Card accent="var(--muted)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={NOMBRE} actions={selector}>
          <div style={{ padding: 20 }}>
            <Alert tone="warning" title="Periodo no disponible para edición">
              El estado actual del reporte es «{estado(estadoActual).label}». No se encuentra en llenado ni disponible para edición directa.
            </Alert>
          </div>
        </Card>
        {cargaDelLibro}
      </Mosaic>
    );
  }

  /* `corregidas`: viene de la corrección con Dr. Mochi (ver ReporteNutricion.jsx). */
  const avisar = (inf, corregidas = null) => {
    const n = inf.errores.length + inf.avisos.length;
    setPaso('revision');
    if (corregidas) return setToast(avisoDeCorreccion(corregidas, inf));
    setToast(`Se leyeron ${inf.leidas.toLocaleString('es-PE')} casillas${n ? `; hay ${n} ${n === 1 ? 'punto' : 'puntos'} por resolver` : ', sin observaciones'}.`);
  };

  const aplicarCarga = (inf, corregidas = null) => {
    const carga = { archivo: inf.archivo, fecha: inf.fecha, plantilla: inf.plantilla, origen: inf.origen, leidas: inf.leidas };
    const vigentes = reporteDe(leerEstado().reportes, CLAVE, periodo)?.datos?.justificaciones ?? {};
    registrarCarga(CLAVE, periodo, { datos: { ...inf.datos, justificaciones: corregidas ? vigentes : {} }, carga, actor: usuario.nombre });
    setInforme({ ...inf, firma: firmaDe(inf.datos, CLAVE) });
    avisar(inf, corregidas);
  };

  const aplicarCargaReal = async (inf, corregidas = null) => {
    const r = await api.sincronizarReporte(CLAVE, periodo);
    if (!r.ok) {
      setErrorAccion(r.detail ?? 'El archivo se guardó, pero no se pudo traer el reporte actualizado. Recargue la página.');
      return;
    }
    setInforme({ ...inf, firma: firmaDe(r.reporte.datos, CLAVE) });
    avisar(inf, corregidas);
  };

  const resolverInforme = (inf, corregidas = null) => {
    if (inf.bloqueo) return setBloqueo(inf);
    if (real) return aplicarCargaReal(inf, corregidas);
    if (tieneDatos && !corregidas) return setPorReemplazar(inf);
    return aplicarCarga(inf, corregidas);
  };

  /* Lo corregido con Dr. Mochi no vuelve a pedir confirmar el reemplazo (Correccion.jsx). */
  const subir = async (archivo, { confirmado = false, corregidas = null } = {}) => {
    setErrorAccion(null);
    setBloqueo(null);
    if (real) {
      if (tieneDatos && !confirmado && !corregidas) {
        setArchivoPorConfirmar(archivo);
        return;
      }
      setProcesando(archivo.name);
      setEtapa('enviando');
      const r = await api.subirCarga(CLAVE, periodo, archivo);
      setProcesando(null);
      setEtapa(null);
      if (!r.ok) {
        if (r.detail) setErrorAccion(r.detail);
        return;
      }
      if (!r.informe?.bloqueo) recordarArchivo(CLAVE, periodo, archivo);
      return resolverInforme(r.informe, corregidas);
    }
    setProcesando(archivo.name);
    const inf = await validarArchivo(archivo, { area: CLAVE, periodo, anterior, alAvanzar: setEtapa });
    setProcesando(null);
    setEtapa(null);
    if (!inf.bloqueo) recordarArchivo(CLAVE, periodo, archivo);
    return resolverInforme(inf, corregidas);
  };

  /* Las alertas confirmadas con Dr. Mochi quedan justificadas, antes de cargar
     el libro corregido (ver ReporteNutricion.jsx, `confirmarAlertas`). */
  const confirmarAlertas = async (ids) => {
    if (!ids.length) return true;
    const actual = reporteDe(leerEstado().reportes, CLAVE, periodo);
    guardarDatos(CLAVE, periodo, { justificaciones: { ...actual?.datos?.justificaciones, ...Object.fromEntries(ids.map((id) => [id, TEXTO_CONFIRMADA])) } });
    if (!real) return true;
    const resultados = await Promise.all(ids.map((id) => api.justificar(CLAVE, periodo, id, TEXTO_CONFIRMADA)));
    const fallo = resultados.find((x) => !x.ok);
    if (fallo) setErrorAccion(fallo.detail ?? 'No se pudieron guardar las alertas confirmadas.');
    return !fallo;
  };

  const finalizarCorreccion = async (archivo, corregidas, confirmadas) => {
    setCorrigiendo(false);
    if (!(await confirmarAlertas(confirmadas))) return;
    if (archivo) return subir(archivo, { corregidas });
    setToast(`${confirmadas.length === 1 ? 'Alerta confirmada' : `${confirmadas.length} alertas confirmadas`}: quedan resueltas.`);
  };

  const enviar = async () => {
    setErrorAccion(null);
    const r = await api.transicionar(CLAVE, periodo, 'enviar', { actor: usuario.nombre, rol: 'area' });
    if (!r.ok) {
      if (r.detail) setErrorAccion(r.detail);
      return;
    }
    setConstancia(r.reporte);
  };

  const pasos = [
    {
      key: 'carga',
      title: 'Subir el Excel',
      note: reporte?.carga ? reporte.carga.archivo.nombre : 'El Excel del mes',
      status: reporte?.carga || tieneDatos ? 'ok' : 'empty',
    },
    {
      key: 'revision',
      title: 'Revisar y resolver',
      note: !tieneDatos
        ? 'Sin cifras todavía'
        : !vigente
          ? 'El bot está revisando…'
          : informe.errores.length
            ? `${informe.errores.length} ${informe.errores.length === 1 ? 'error' : 'errores'} por corregir`
            : pendientes.length
              ? `${pendientes.length} ${pendientes.length === 1 ? 'alerta' : 'alertas'} por revisar`
              : 'Listo para enviar',
      status: !tieneDatos ? 'empty' : !vigente ? 'partial' : informe.errores.length ? 'error' : pendientes.length ? 'partial' : 'ok',
    },
    { key: 'envio', title: 'Enviar', note: `A Estadística${destinosDe(CLAVE).some((d) => d !== 'estadistica') ? ' y sus oficinas' : ''}`, status: 'empty' },
  ];

  const motivoNoListo = !tieneDatos
    ? { titulo: 'El reporte está vacío', detalle: 'Suba el Excel del mes.', accion: 'Subir el Excel', paso: 'carga' }
    : !vigente
      ? { titulo: 'El bot todavía está revisando', detalle: 'Toma un instante. Estadística recibe exactamente lo que el bot revisó.', accion: 'Ir a la revisión', paso: 'revision' }
      : informe.errores.length
        ? { titulo: `Hay ${informe.errores.length} ${informe.errores.length === 1 ? 'error' : 'errores'} por corregir`, detalle: 'Lo que no cuadra no sale del área: corrija el Excel y súbalo otra vez.', accion: 'Ver lo que hay por resolver', paso: 'revision' }
        : { titulo: `Hay ${pendientes.length} ${pendientes.length === 1 ? 'alerta' : 'alertas'} por revisar`, detalle: 'Revíselas con Dr. Mochi: corrija la cifra o confirme que es correcta.', accion: 'Ver lo que hay por resolver', paso: 'revision' };

  const reemplazo = (archivoNuevo, onConfirmar, onCerrar) => (
    <Dialog
      title="¿Reemplazar lo que ya está cargado?"
      subtitle={`Archivo nuevo: «${archivoNuevo}»`}
      onClose={onCerrar}
      maxWidth={540}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={onCerrar}>
            Conservar lo actual
          </Button>
          <Button data-guia="confirmar-reemplazo" tone="danger" icon="sh-upload" onClick={onConfirmar}>
            Subir y reemplazar
          </Button>
        </Stack>
      }
    >
      <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
        El reporte ya tiene cifras{reporte?.carga ? `, leídas de «${reporte.carga.archivo.nombre}»` : ''}. Si el bot acepta el archivo nuevo, sus
        cifras reemplazan a todas las actuales; si lo rechaza, no cambia nada.
      </p>
    </Dialog>
  );

  return (
    <Mosaic stacked className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={`${NOMBRE} · se llena subiendo su Excel`} meta={<EstadoPeriodo reporte={reporte} periodo={periodo} />} actions={selector}>
        <Stack gap={4} className="hrl-cuerpo">
          <AvisoMesAnterior periodo={periodo} vigente={mesVigente} archivo="el Excel" />
          <div data-guia="pasos-reporte">
            <ProgressSteps steps={pasos} active={paso} label="Pasos del reporte" />
          </div>
        </Stack>
      </Card>

      {errorAccion && (
        <Alert tone="error" title="No se pudo completar la acción">
          {errorAccion}
        </Alert>
      )}

      <Mosaic stacked className="hrl-paso-entrada" key={paso}>
        {paso === 'carga' && (
          <PasoCarga
            periodo={periodo}
            carga={reporte?.carga}
            tieneDatos={tieneDatos}
            procesando={procesando}
            etapa={etapa}
            bloqueo={bloqueo}
            onArchivo={subir}
            onDigitar={null}
            onVolver={() => setPaso('revision')}
            config={CONFIG_CARGA}
          />
        )}

        {paso === 'revision' &&
          (!reporte || !tieneDatos ? (
            <Alert tone="info" title="Todavía no hay nada que revisar">
              Suba el Excel del mes y aquí verá lo que encontró el bot en cada cuadro.
              <div style={{ marginTop: 12 }}>
                <Button icon="sh-upload" onClick={() => setPaso('carga')}>
                  Subir el Excel
                </Button>
              </div>
            </Alert>
          ) : (
            <>
              <Lectura
                revisando={!vigente}
                vacio={!tieneDatos}
                archivo={reporte.carga?.archivo?.nombre}
                errores={vigente ? informe.errores.length : 0}
                pendientes={pendientes.length}
                listo={listo}
                onEnviar={() => setPaso('envio')}
                onCorregir={() => setCorrigiendo(true)}
              />

              {vigente && !limpio && (
                <PorResolver
                  informe={informe}
                  datos={datos}
                  onConfirmar={reporte.carga ? undefined : (id) => confirmarAlertas([id])}
                  ubicar={ubicar}
                  textoLimpio="Los dos cuadros están completos y los totales que trae el Excel cuadran con sus filas"
                />
              )}

              <CuadroControlesPrenatales datos={datos} periodo={periodo} />
              <CuadroPartosYNacidos datos={datos} periodo={periodo} />

              <div className="hrl-acciones-paso">
                <Button data-guia="subir-otro" tone="ghost" icon="sh-upload" onClick={() => setPaso('carga')}>
                  Subir otro archivo
                </Button>
                <Button icon="sh-send" disabled={!listo} onClick={() => setPaso('envio')} style={{ minHeight: 'var(--touch-target-lg)' }}>
                  Continuar al envío
                </Button>
              </div>
              {!listo && (
                <p className="hrl-acciones-paso__motivo">
                  <Icon name="sh-info" size={14} /> {motivoNoListo.titulo}.
                </p>
              )}
            </>
          ))}

        {paso === 'envio' && (
          <PasoEnvio datos={datos} periodo={periodo} carga={reporte?.carga} informe={informe} listo={listo} motivoNoListo={motivoNoListo} onIrA={setPaso} onEnviar={enviar} />
        )}
      </Mosaic>

      {!procesando && cargaDelLibro}
      {herramientas}

      {corrigiendo && (
        <Correccion
          area={CLAVE}
          periodo={periodo}
          carga={reporte?.carga}
          anterior={anterior}
          procesando={procesando}
          justificadas={datos.justificaciones}
          onSalir={() => setCorrigiendo(false)}
          onFinalizar={finalizarCorreccion}
        />
      )}

      {archivoPorConfirmar &&
        reemplazo(
          archivoPorConfirmar.name,
          () => {
            const archivo = archivoPorConfirmar;
            setArchivoPorConfirmar(null);
            subir(archivo, { confirmado: true });
          },
          () => setArchivoPorConfirmar(null),
        )}

      {porReemplazar &&
        reemplazo(
          porReemplazar.archivo.nombre,
          () => {
            aplicarCarga(porReemplazar);
            setPorReemplazar(null);
          },
          () => setPorReemplazar(null),
        )}

      {constancia && <Constancia reporte={constancia} onCerrar={() => setConstancia(null)} />}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
