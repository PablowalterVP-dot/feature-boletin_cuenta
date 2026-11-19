/* Reporte del mes de Costura y Lavandería.

   El mismo recorrido que Nutrición y Laboratorio, en tres pasos:
     1. Subir el Excel          el del mes, o el formato en blanco llenado
     2. Revisar y resolver      lo que encontró el bot y las cifras, cuadro por cuadro
     3. Enviar                  a Estadística y a las oficinas de su matriz, a la vez

   Dos diferencias con Nutrición y Laboratorio, y por qué:
     · El Excel real no nombra sus hojas ("Hoja1".."Hoja4"): el bot las
       reconoce por su contenido, no por su nombre (oficial.js del bot).
     · Trae cuatro cuadros de tres formas distintas, no cuatro iguales: kilos
       por servicio y ropa sucia son diarios; confección y el consolidado de
       piezas e insumos son mensuales. Solo el primero queda catalogado como
       indicador en la base (ver el comentario de definicion.js del bot); los
       otros tres se leen y se validan igual, pero viajan enteros en
       `carga.informe_bot`.

   Como en Nutrición y Laboratorio: no se digita en la pantalla. Para corregir
   está Dr. Mochi (`Correccion.jsx`): compara el Excel con el formulario del
   bot, explica cada error y, al finalizar, carga el mismo Excel con solo esas
   celdas cambiadas. Las alertas se corrigen o se confirman ahí, y la
   confirmación queda como su justificación (12/10/2026; ver ReporteNutricion.jsx). */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Dialog, Field, Icon, Mosaic, ProgressSteps, Stack, Toast } from '@hrl/core-ui';
import { reporteDe, registrarCarga, guardarDatos, leerEstado, validadoPara, useHoy } from '@/app/datos/store.js';
import * as api from '@/app/servicios/api.js';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { SERVICIOS, GRUPOS, formato } from '@/app/datos/formatos/lavanderia.js';
import { casillasLlenas, casillasDe, avisosPendientes } from '@/app/datos/formatos/lavanderia-calculos.js';
import { validarArchivo, validarDatos, firmaDe, recordarArchivo } from '@/app/servicios/bot-validador.js';
import * as ejemplos from '@/app/servicios/ejemplos-lavanderia.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { estado, esEditable, estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, periodoVigente } from '@/app/dominio/periodos.js';
import { fechaHora } from '@/app/dominio/formato.js';
import EstadoPeriodo from '../../EstadoPeriodo.jsx';
import { SelectorDeMes, AvisoMesAnterior } from '../Comunes.jsx';
import CargaDeMeses from '../CargaDeMeses.jsx';
import PasoCarga from '../nutricion/PasoCarga.jsx';
import PorResolver from '../nutricion/PorResolver.jsx';
import Lectura from '../nutricion/Lectura.jsx';
import HerramientasPrueba from '../nutricion/HerramientasPrueba.jsx';
import { Constancia } from '../nutricion/ReporteNutricion.jsx';
import PasoEnvio from './PasoEnvio.jsx';
import { Cuadros } from './Cuadros.jsx';
import Correccion, { avisoDeCorreccion, TEXTO_CONFIRMADA } from '../Correccion.jsx';

const CLAVE = 'lavanderia';
const NOMBRE = 'Costura y Lavandería';

const CONFIG_CARGA = Object.freeze({
  subtitulo: 'El mismo Excel de siempre: el bot reconoce sus cuatro hojas por su contenido, no por su nombre',
  frases: [
    'Abriendo su Excel…',
    'Buscando las cuatro hojas de kilos, confección, ropa sucia y consolidado…',
    'Contando los kilos día por día…',
    'Revisando que los totales cuadren…',
    'Buscando casillas vacías o con letras…',
    'Ya casi termino…',
  ],
  instrucciones: [
    'Lo normal es subir su propio Excel del mes: el sistema lo lee tal cual, sin importar cómo se llamen sus hojas.',
    'Si un día no hubo movimiento, escriba 0. Una casilla vacía significa «no registrado».',
    'Si no tiene el Excel a mano, descargue el formato en blanco, llénelo y súbalo.',
  ],
  nombreDeArchivo: ejemplos.nombreDePlantilla,
  ayudaFormato: (mes) => `El formato de ${mes} en blanco, con las cuatro hojas del Excel real y sus rótulos ya escritos.`,
  descargarPlantilla: ejemplos.descargarPlantilla,
  ejemploCorrecto: ejemplos.ejemploCorrecto,
  ejemploConErrores: ejemplos.ejemploConErrores,
  ayudaErrores: 'Trae una casilla con letras, un total de servicio tecleado encima de la fórmula y una cifra de piezas no entera (el error real de mayo de 2026).',
});

/* Dónde cae un hallazgo, para la lista de lo que hay por resolver. */
function ubicar(h) {
  const f = formato(h.formato);
  if (!f) return null;
  if (h.formato === 'f1') {
    const s = SERVICIOS.find((x) => x.clave === h.fila);
    return [f.corto, s && `${s.nombre}${h.dia ? ` · día ${h.dia}` : ''}`].filter(Boolean).join(' · ');
  }
  if (h.formato === 'f3') {
    const nombre = h.fila === 'comun' ? 'Ropa sucia común' : h.fila === 'sucia' ? 'Ropa sucia' : null;
    return [f.corto, nombre && `${nombre}${h.dia ? ` · día ${h.dia}` : ''}`].filter(Boolean).join(' · ');
  }
  if (h.formato === 'f4' && h.fila) {
    const g = GRUPOS.find((x) => x.clave === h.fila);
    return [f.corto, g?.nombre].filter(Boolean).join(' · ');
  }
  return f.corto;
}

/* Un reporte que ya salió del área: qué se envió, a quién y en qué estado está. */
function Entregado({ reporte, periodo, herramientas, selector, cargaDelLibro }) {
  const estadoInfo = estado(reporte?.estado);
  const oficinas = [...new Set([...(reporte?.entregas ?? []).map((e) => e.oficina), ...(reporte?.remision?.destinos ?? [])])];

  return (
    <Mosaic stacked className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={`${NOMBRE} · enviado, en solo lectura`} meta={<EstadoPeriodo reporte={reporte} periodo={periodo} />} actions={selector}>
        <div className="hrl-campos hrl-cuerpo">
          <Field k="Constancia" v={reporte?.constancia} mono />
          <Field k="Enviado el" v={fechaHora(reporte?.enviadoEn)} />
          <Field k="Estadística" v={estadoInfo.descripcion ?? estadoInfo.label} />
          {oficinas.map((o) => (
            <Field key={o} k={nombreOficina(o)} v={validadoPara(reporte, o) ? 'Recibió la versión validada' : 'Recibió el reporte sin validar'} />
          ))}
          {reporte.carga && <Field k="Archivo" v={reporte.carga.archivo.nombre} />}
        </div>
      </Card>
      <Card accent="var(--primary)" icon="sh-table" title="Las cifras enviadas" subtitle="Cuadro por cuadro">
        <div className="hrl-cuerpo">
          <Cuadros datos={reporte.datos} periodo={periodo} informe={reporte.informe} origen={reporte.carga?.origen} />
        </div>
      </Card>
      {cargaDelLibro}
      {herramientas}
    </Mosaic>
  );
}

export default function ReporteLavanderia({ reportes, periodo: periodoPedido, usuario, pruebas = false, pasoPedido, irA }) {
  const mesVigente = periodoVigente(useHoy());
  const periodo = periodoPedido ?? mesVigente;
  /* Un mes pasado que no se envió se abre aquí y se carga con su propio Excel.
     Sin `irA` (la prueba de humo monta el panel suelto) no hay a dónde cambiar de mes. */
  const selector = irA ? <SelectorDeMes reportes={reportes} claveArea={CLAVE} periodo={periodo} vigente={mesVigente} onCambiar={(p) => irA('reporte', { periodo: p })} /> : null;
  /* Cargar meses pasados de una vez (CargaDeMeses.jsx), como en Laboratorio: en
     cualquier estado del mes abierto, también uno ya entregado. */
  const cargaDelLibro = <CargaDeMeses area={CLAVE} reportes={reportes} vigente={mesVigente} usuario={usuario} onAbrir={irA ? (p) => irA('reporte', { periodo: p }) : null} />;
  const reporte = reporteDe(reportes, CLAVE, periodo);
  const estadoActual = reporte?.estado ?? 'no_iniciado';
  const datos = useMemo(() => reporte?.datos ?? {}, [reporte]);
  const llenas = casillasLlenas(datos, periodo);
  const total = casillasDe(periodo, datos);
  const tieneDatos = llenas > 0 || Object.keys(datos.ilegibles ?? {}).length > 0 || (datos.f2 ?? []).length > 0;

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
  /* Con el backend, el reemplazo se confirma ANTES de subir: lo persiste al recibirlo. */
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
  const pendientes = vigente ? avisosPendientes(informe, datos) : [];
  const listo = vigente && informe.errores.length === 0 && pendientes.length === 0;
  const limpio = vigente && informe.errores.length === 0 && informe.avisos.length === 0;

  /* Al entrar a la revisión sin informe: con backend, el que guardó la carga
     vigente; sin él, se revalida aquí (los datos sembrados no traen informe). */
  useEffect(() => {
    if (paso === 'carga' || vigente || !tieneDatos) return undefined;
    if (real) {
      if (reporte?.informe) setInforme({ ...reporte.informe, firma: firmaDe(datos, CLAVE) });
      return undefined;
    }
    let sigue = true;
    validarDatos(datos, { area: CLAVE, periodo }).then((inf) => {
      if (sigue) setInforme({ ...inf, firma: firmaDe(datos, CLAVE) });
    });
    return () => {
      sigue = false;
    };
    // Se revalida por cambio de datos o de paso, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, firma]);

  useEffect(() => {
    if (pasoPedido === 'carga' || pasoPedido === 'revision') setPaso(pasoPedido);
    if (pasoPedido === 'correccion') {
      setPaso('revision');
      setCorrigiendo(true);
    }
  }, [pasoPedido]);

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
          <div style={{ padding: '20px' }}>
            <Alert tone="warning" title="Periodo no disponible para edición">
              El estado actual del reporte es «{estado(estadoActual).label}». No se encuentra en llenado ni disponible para edición directa.
            </Alert>
          </div>
        </Card>
        {cargaDelLibro}
      </Mosaic>
    );
  }

  /* ------------------------------------------------------------ acciones */

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

  /* Con el backend: lo que se ve se toma de lo que quedó guardado, no del informe. */
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
    const inf = await validarArchivo(archivo, { area: CLAVE, periodo, alAvanzar: setEtapa });
    setProcesando(null);
    setEtapa(null);
    /* El archivo queda a mano para corregirlo con Dr. Mochi. */
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

  /* --------------------------------------------------------- los pasos */

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
        ? `0 de ${total.toLocaleString('es-PE')} casillas`
        : !vigente
          ? 'El bot está revisando…'
          : informe.errores.length
            ? `${informe.errores.length} ${informe.errores.length === 1 ? 'error' : 'errores'} por corregir`
            : pendientes.length
              ? `${pendientes.length} ${pendientes.length === 1 ? 'alerta' : 'alertas'} por revisar`
              : 'Listo para enviar',
      status: !tieneDatos ? 'empty' : !vigente ? 'partial' : informe.errores.length ? 'error' : pendientes.length ? 'partial' : 'ok',
    },
    { key: 'envio', title: 'Enviar', note: 'A Estadística', status: 'empty' },
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
        El reporte tiene {llenas.toLocaleString('es-PE')} casillas con dato{reporte?.carga ? `, leídas de «${reporte.carga.archivo.nombre}»` : ''}. Si el bot acepta el archivo nuevo, sus
        cifras reemplazan a todas las actuales; si lo rechaza, no cambia nada. Las alertas ya confirmadas que vuelvan a aparecer se conservan
        {real ? '' : ' solo con el servidor; en esta demostración se pierden'}.
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
            <Card accent="var(--info)" icon="sh-info" title="Todavía no hay nada que revisar">
              <Stack gap={4} className="hrl-cuerpo">
                <p style={{ margin: 0 }}>Suba su Excel del mes y aquí verá lo que encontró el bot en cada cuadro.</p>
                <Button icon="sh-upload" onClick={() => setPaso('carga')} style={{ alignSelf: 'flex-start' }}>
                  Subir el Excel
                </Button>
              </Stack>
            </Card>
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
                  textoLimpio="Los cuatro cuadros están completos y cada total escrito cuadra con su suma"
                />
              )}

              <Card accent="var(--primary)" icon="sh-table" title={reporte.carga ? 'Las cifras de su Excel' : 'Las cifras del mes'} subtitle={`Cuadro por cuadro · ${llenas.toLocaleString('es-PE')} de ${total.toLocaleString('es-PE')} casillas con dato`}>
                <div className="hrl-cuerpo">
                  <Cuadros datos={datos} periodo={periodo} informe={vigente ? informe : null} origen={reporte.carga?.origen} />
                </div>
              </Card>

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
