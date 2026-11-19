/* Reporte del mes de Nutrición y Dietética: un solo módulo, tres pasos.

     1. Subir el Excel          el del mes que el área ya llena (o digitar, si no hay Excel)
     2. Revisar y resolver      consolidado, lo que encontró el bot y el
                                detalle día por día, paginado por semana
     3. Enviar                  qué recibe cada oficina y para qué; confirmar

   El bot valida al subir, así que revisar y validar son un mismo paso. Si no
   encontró nada, el paso 2 lo dice arriba y ofrece enviar: el detalle queda
   plegado y es opcional. Es el caso de la mayoría de los meses.

   Toda corrección se vuelve a validar sola, a los pocos instantes de dejar de
   escribir: el informe se guarda con una firma de los datos y el envío exige
   que la firma coincida. Lo que llega a Estadística es siempre lo que el bot
   revisó.

   Con el backend (modo real) cambian tres cosas, decididas el 28/09/2026:
     · no se edita en la hoja ni se digita, porque esas cifras no llegaban al
       backend y Estadística recibía las del archivo, no las que el área vio.
       Se corrige con Dr. Mochi (Correccion.jsx), en su formulario: al
       finalizar, lo corregido se carga como un Excel más, sin que el área
       tenga que descargar ni subir nada; o subiendo el Excel corregido;
     · la revisión (el informe del bot) viene del backend, no se revalida en el
       navegador;
     · las justificaciones se guardan en el backend.

   Las alertas ya no se justifican escribiendo (12/10/2026): se revisan con Dr.
   Mochi, que propone corregirlas o deja confirmarlas. La confirmación se guarda
   como su justificación, que es lo que el envío exige. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Dialog, Field, Icon, Mosaic, ProgressSteps, Stack, Toast } from '@hrl/core-ui';
import { reporteDe, registrarCarga, guardarDatos, aplicarTransicion, leerEstado, useHoy } from '@/app/datos/store.js';
import * as api from '@/app/servicios/api.js';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { claveCasilla } from '@/app/datos/formatos/nutricion.js';
import { valoresDe, casillasLlenas, casillasDe, avisosPendientes } from '@/app/datos/formatos/nutricion-calculos.js';
import { validarArchivo, validarDatos, firmaDe, recordarArchivo } from '@/app/servicios/bot-validador.js';
import { destinosDe } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import { estado, esEditable, estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, periodoVigente } from '@/app/dominio/periodos.js';
import { fechaHora } from '@/app/dominio/formato.js';
import EstadoPeriodo from '../../EstadoPeriodo.jsx';
import { SelectorDeMes, AvisoMesAnterior } from '../Comunes.jsx';
import PasoCarga from './PasoCarga.jsx';
import PasoEnvio from './PasoEnvio.jsx';
import Consolidado from './Consolidado.jsx';
import PorResolver from './PorResolver.jsx';
import Lectura from './Lectura.jsx';
import Detalle from './Detalle.jsx';
import HerramientasPrueba from './HerramientasPrueba.jsx';
import Correccion, { avisoDeCorreccion, TEXTO_CONFIRMADA } from '../Correccion.jsx';
import CargaDeMeses, { cargarMes, otroMesDelArchivo } from '../CargaDeMeses.jsx';

const CLAVE = 'nutricion';
const ESPERA_REVALIDAR = 700;

/* Los meses anteriores del mismo año ya entregados: alimentan el acumulado
   anual y la comparación del bot con el mes previo. */
function historicoDe(reportes, periodo) {
  return reportes
    .filter((r) => r.area === CLAVE && r.periodo < periodo && r.periodo.slice(0, 4) === periodo.slice(0, 4) && estaEntregado(r.estado))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((r) => ({ periodo: r.periodo, datos: r.datos }));
}

/* Constancia: lo que el área se queda como prueba de entrega, a cada oficina.
   También la usa Laboratorio. */
export function Constancia({ reporte, onCerrar }) {
  usePublicarGuia('constancia', {});
  return (
    <Dialog
      title="Reporte entregado"
      subtitle="Guarde esta constancia: sustituye al sello de recepción del oficio"
      onClose={onCerrar}
      maxWidth={580}
      footer={
        <Button data-guia="constancia-cerrar" icon="sh-ok" onClick={onCerrar}>
          Entendido
        </Button>
      }
    >
      <Stack gap={4}>
        <Alert tone="success" title={`Entregado a Estadística${reporte.remision?.destinos.length ? ` y a ${reporte.remision.destinos.map(nombreOficina).join(', ')}` : ''}`}>
          Llegó validado por el bot, sin errores y con sus alertas justificadas. Ya no es editable desde el área.
        </Alert>
        <div className="hrl-campos">
          <Field k="Constancia" v={reporte.constancia} mono />
          <Field k="Folio" v={reporte.folio} mono />
          <Field k="Periodo" v={etiquetaPeriodo(reporte.periodo)} />
          <Field k="Fecha y hora" v={fechaHora(reporte.enviadoEn)} />
          <Field k="Estadística" v="Recibido · validado por el bot" />
          {(reporte.remision?.destinos ?? []).map((o) => (
            <Field key={o} k={nombreOficina(o)} v="Recibido · validado por el bot" />
          ))}
        </div>
      </Stack>
    </Dialog>
  );
}

/* Un reporte que ya salió del área: qué se envió, a quién y en qué estado está. */
function Entregado({ reporte, periodo, historico, herramientas, selector, cargaDeMeses }) {
  const estadoInfo = estado(reporte?.estado);
  const oficinas = reporte?.remision?.destinos ?? [];

  return (
    <Mosaic stacked className="hrl-panel">
      <Card accent="var(--primary)"
        icon="sh-calendar"
        title={`Reporte de ${etiquetaPeriodo(periodo)}`}
        subtitle="Nutrición y Dietética · enviado, en solo lectura"
        meta={<EstadoPeriodo reporte={reporte} periodo={periodo} />}
        actions={selector}
      >
        <Stack gap={3} className="hrl-cuerpo">
          <div className="hrl-campos">
            <Field k="Constancia" v={reporte?.constancia} mono />
            <Field k="Enviado el" v={fechaHora(reporte?.enviadoEn)} />
            <Field k="Estadística" v={estadoInfo.descripcion ?? estadoInfo.label} />
            {oficinas.map((o) => (
              <Field key={o} k={nombreOficina(o)} v="Lo recibió al enviarlo" />
            ))}
            {reporte.carga && <Field k="Archivo" v={reporte.carga.archivo.nombre} />}
          </div>
          {/* Solo sobre los datos sembrados: un reporte traído del backend trae su `informe`. */}
          {periodo === '2026-06' && !reporte.informe && (
            <Alert tone="info" title="Junio viene de un oficio de ejemplo">
              Transcrito casilla por casilla del oficio N.º 122-2026, que es un ejemplo y no un documento real. De enero a mayo el reparto por día está simulado.
            </Alert>
          )}
        </Stack>
      </Card>
      <Consolidado datos={reporte.datos} periodo={periodo} anterior={historico.at(-1) ?? null} />
      <Card accent="var(--primary)" icon="sh-table" title="Detalle día por día" subtitle="Una semana a la vez">
        <div className="hrl-cuerpo">
          <Detalle datos={reporte.datos} periodo={periodo} editable={false} origen={reporte.carga?.origen} />
        </div>
      </Card>
      {cargaDeMeses}
      {herramientas}
    </Mosaic>
  );
}

/* `pruebas`: la sesión la abrió administración; ofrece las herramientas de prueba. */
/* `pasoPedido`: el paso que pide la URL (#/reporte?paso=carga), por ejemplo
   desde un botón de la cabecera. */
/* `irA`: con él, el área cambia de mes desde el reporte (SelectorDeMes). */
export default function ReporteNutricion({ reportes, periodo: periodoPedido, usuario, pruebas = false, pasoPedido, irA }) {
  const mesVigente = periodoVigente(useHoy());
  const periodo = periodoPedido ?? mesVigente;
  const reporte = reporteDe(reportes, CLAVE, periodo);
  const estadoActual = reporte?.estado ?? 'no_iniciado';
  const datos = useMemo(() => reporte?.datos ?? {}, [reporte]);
  const historico = useMemo(() => historicoDe(reportes, periodo), [reportes, periodo]);
  const anterior = historico.at(-1) ?? null;
  const llenas = casillasLlenas(datos, periodo);
  const total = casillasDe(periodo, datos);
  const tieneDatos = llenas > 0 || Object.keys(datos.ilegibles ?? {}).length > 0;

  const [paso, setPaso] = useState(tieneDatos ? 'revision' : 'carga');
  /* La corrección con Dr. Mochi es un diálogo sobre la revisión, no un paso. */
  const [corrigiendo, setCorrigiendo] = useState(pasoPedido === 'correccion');
  const [foco, setFoco] = useState(null);
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
  const [revalidando, setRevalidando] = useState(false);
  const [constancia, setConstancia] = useState(null);
  const [toast, setToast] = useState(null);
  /* Solo puede pasar en modo real: el motor local (aplicarTransicion) nunca
     rechaza un botón que la propia pantalla decidió mostrar. */
  const [errorAccion, setErrorAccion] = useState(null);
  /* Modo real: el archivo que espera confirmar el reemplazo ANTES de subirse (el
     backend lo persiste al recibirlo, así que preguntar después sería tarde). */
  const [archivoPorConfirmar, setArchivoPorConfirmar] = useState(null);

  const real = api.esAreaReal(CLAVE);

  /* Tras una herramienta de prueba: lo que se deshizo vuelve al paso 1 sin el
     informe de antes, y una entrega simulada muestra su constancia. */
  const alProbar = ({ mensaje, constancia: nueva, alPaso1 }) => {
    setToast(mensaje);
    if (nueva) setConstancia(nueva);
    if (alPaso1) {
      setPaso('carga');
      setInforme(null);
      setFoco(null);
      setBloqueo(null);
    }
  };
  const herramientas = pruebas ? <HerramientasPrueba reporte={reporte} periodo={periodo} real={real} onHecho={alProbar} /> : null;
  const editable = esEditable(estadoActual) || estadoActual === 'no_iniciado';
  /* Las casillas solo se corrigen en la hoja sin backend; con backend, subiendo otro Excel. */
  const editableEnHoja = editable && !real;
  const firma = useMemo(() => firmaDe(datos), [datos]);
  const vigente = informe != null && !informe.bloqueo && informe.firma === firma;
  const pendientes = vigente ? avisosPendientes(informe, datos) : [];
  const listo = vigente && informe.errores.length === 0 && pendientes.length === 0;
  const limpio = vigente && informe.errores.length === 0 && informe.avisos.length === 0;

  /* Revalidación automática: al entrar al paso 2 sin informe, o al dejar de
     escribir tras corregir. Con backend no se revalida aquí: la revisión es la
     que el backend guardó de la carga vigente (llega con el reporte, `informe`),
     y como las cifras solo cambian subiendo otro Excel, no hay nada que revalidar. */
  useEffect(() => {
    if (paso === 'carga' || vigente || !tieneDatos) return undefined;
    if (real) {
      if (reporte?.informe) setInforme({ ...reporte.informe, firma: firmaDe(datos) });
      return undefined;
    }
    let sigue = true;
    setRevalidando(true);
    const t = setTimeout(() => {
      validarDatos(datos, { periodo, anterior }).then((inf) => {
        if (!sigue) return;
        setInforme({ ...inf, firma: firmaDe(datos) });
        setRevalidando(false);
      });
    }, informe ? ESPERA_REVALIDAR : 0);
    return () => {
      sigue = false;
      clearTimeout(t);
    };
    // Se revalida por cambio de datos o de paso, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, firma]);

  /* El envío no se pide desde fuera: exige que el bot haya revisado, y eso lo
     decide esta pantalla. */
  useEffect(() => {
    if (pasoPedido === 'carga' || pasoPedido === 'revision') setPaso(pasoPedido);
    if (pasoPedido === 'correccion') {
      setPaso('revision');
      setCorrigiendo(true);
    }
  }, [pasoPedido]);

  /* Un mes pasado se abre, se carga y se envía igual que el vigente; y los que
     faltan del año se pueden cargar de una vez (CargaDeMeses). */
  const abrirMes = (p) => irA?.('reporte', { periodo: p });
  const selector = irA ? <SelectorDeMes reportes={reportes} claveArea={CLAVE} periodo={periodo} vigente={mesVigente} onCambiar={abrirMes} /> : null;
  const cargaDeMeses = <CargaDeMeses area={CLAVE} reportes={reportes} vigente={mesVigente} usuario={usuario} onAbrir={irA ? abrirMes : null} />;

  if (estaEntregado(estadoActual)) {
    return (
      <>
        <Entregado reporte={reporte} periodo={periodo} historico={historico} herramientas={herramientas} selector={selector} cargaDeMeses={cargaDeMeses} />
        {constancia && <Constancia reporte={constancia} onCerrar={() => setConstancia(null)} />}
        <Toast message={toast} onClose={() => setToast(null)} />
      </>
    );
  }
  if (!editable) {
    return (
      <Mosaic stacked className="hrl-panel">
        <Card accent="var(--muted)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle="Nutrición y Dietética" actions={selector}>
          <div style={{ padding: '20px' }}>
            <Alert tone="warning" title="Periodo no disponible para edición">
              El estado actual del reporte es «{estado(estadoActual).label}». No se encuentra en llenado ni disponible para edición directa.
            </Alert>
          </div>
        </Card>
      </Mosaic>
    );
  }

  /* ------------------------------------------------------------ acciones */

  /* `corregidas`: viene de la corrección con Dr. Mochi (cuántas celdas). Una
     corrección no es un archivo nuevo: conserva las justificaciones escritas,
     como hace el backend con las alertas que vuelven a aparecer. */
  const avisarCarga = (inf, corregidas) => {
    const n = inf.errores.length + inf.avisos.length;
    setPaso('revision');
    setToast(corregidas ? avisoDeCorreccion(corregidas, inf) : `Se leyeron ${inf.leidas.toLocaleString('es-PE')} casillas${n ? `; hay ${n} ${n === 1 ? 'punto' : 'puntos'} por resolver` : ', sin observaciones'}.`);
  };

  const aplicarCarga = (inf, corregidas = null) => {
    const carga = { archivo: inf.archivo, fecha: inf.fecha, plantilla: inf.plantilla, origen: inf.origen, leidas: inf.leidas };
    /* Del almacén y no de `datos`: las alertas confirmadas con Dr. Mochi se
       guardan justo antes, y `datos` todavía no las tiene. */
    const vigentes = reporteDe(leerEstado().reportes, CLAVE, periodo)?.datos?.justificaciones ?? {};
    registrarCarga(CLAVE, periodo, { datos: { ...inf.datos, justificaciones: corregidas ? vigentes : {} }, carga, actor: usuario.nombre });
    setInforme({ ...inf, firma: firmaDe(inf.datos) });
    avisarCarga(inf, corregidas);
  };

  /* Modo real: el backend ya guardó las casillas y los hallazgos (y conservó las
     justificaciones de los avisos que se repiten). El store se toma del backend,
     no del informe, para que lo que se ve sea exactamente lo que quedó guardado. */
  const aplicarCargaReal = async (inf, corregidas = null) => {
    const r = await api.sincronizarReporte(CLAVE, periodo);
    if (!r.ok) {
      setErrorAccion(r.detail ?? 'El archivo se guardó, pero no se pudo traer el reporte actualizado. Recargue la página.');
      return;
    }
    setInforme({ ...inf, firma: firmaDe(r.reporte.datos) });
    avisarCarga(inf, corregidas);
  };

  /* Un Excel de otro mes no se carga aquí, pero si es de un mes del año que
     todavía se puede cargar, el aviso lo ofrece (PasoCarga, `otroMes`). */
  const rechazar = async (inf, archivo) => {
    const otroMes = archivo && inf.bloqueo.id === 'plantilla-periodo' ? await otroMesDelArchivo(CLAVE, archivo, periodo, mesVigente, reportes) : null;
    setBloqueo(otroMes ? { ...inf, otroMes, archivoDeOtroMes: archivo } : inf);
  };

  /* Carga el Excel rechazado en el mes al que pertenece y abre ese mes. */
  const cargarEnOtroMes = async (otro) => {
    const archivo = bloqueo?.archivoDeOtroMes;
    if (!archivo) return;
    setBloqueo(null);
    setProcesando(archivo.name);
    const r = await cargarMes(CLAVE, archivo, otro, usuario.nombre);
    setProcesando(null);
    if (r.resultado !== 'aceptado') {
      setErrorAccion(`${etiquetaPeriodo(otro)}: ${r.detalle}`);
      return;
    }
    if (irA) irA('reporte', { periodo: otro, paso: 'revision' });
    else setToast(`Se cargó «${archivo.name}» en ${etiquetaPeriodo(otro).toLowerCase()}.`);
  };

  const resolverInforme = (inf, corregidas = null, archivo = null) => {
    if (inf.bloqueo) return rechazar(inf, archivo);
    if (real) return aplicarCargaReal(inf, corregidas); // el reemplazo ya se confirmó antes de subir
    if (tieneDatos && !corregidas) return setPorReemplazar(inf);
    return aplicarCarga(inf, corregidas);
  };

  /* `corregidas`: el archivo sale de la corrección con Dr. Mochi. El área ya
     vio celda por celda qué cambia, así que no se le pregunta otra vez si
     reemplaza lo cargado (Correccion.jsx). */
  const subir = async (archivo, { confirmado = false, corregidas = null } = {}) => {
    setErrorAccion(null);
    setBloqueo(null);

    /* En modo real, el backend es quien le habla al bot: sube el archivo, no
       lo valida aquí. Y como lo persiste al recibirlo, el reemplazo se confirma
       ANTES de subir; preguntarlo después ya no podría deshacerlo. */
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
      return resolverInforme(r.informe, corregidas, archivo);
    }

    setProcesando(archivo.name);

    const inf = await validarArchivo(archivo, { periodo, anterior, alAvanzar: setEtapa });
    setProcesando(null);
    setEtapa(null);
    /* El archivo queda a mano para corregirlo con Dr. Mochi (bot-validador.js). */
    if (!inf.bloqueo) recordarArchivo(CLAVE, periodo, archivo);
    return resolverInforme(inf, corregidas, archivo);
  };

  const digitar = async () => {
    setErrorAccion(null);
    if (!reporte) {
      const r = await api.transicionar(CLAVE, periodo, 'crear', { actor: usuario.nombre, rol: 'area' });
      if (!r.ok && r.detail) {
        setErrorAccion(r.detail);
        return;
      }
    }
    setPaso('revision');
  };

  /* Uno o varios cambios en un cuadro (varios al pegar o copiar el día
     anterior). La casilla corregida guarda lo que decía el archivo, y el total
     escrito de su fila deja de valer: ya no describe la fila. */
  const cambiarCeldas = (idFormato, cambios) => {
    if (real) return; // con backend no se corrige en la hoja: se sube el Excel corregido
    if (!reporte) aplicarTransicion(CLAVE, periodo, 'crear', { actor: usuario.nombre, rol: 'area' });
    const cuadro = { ...datos[idFormato] };
    const editadas = { ...datos.editadas };
    const ilegibles = { ...datos.ilegibles };
    const declarados = { ...datos.declarados, [idFormato]: { ...datos.declarados?.[idFormato] } };

    for (const { fila, dia, valor } of cambios) {
      const valores = cuadro[fila] ? [...cuadro[fila]] : valoresDe(datos, idFormato, fila, periodo);
      const clave = claveCasilla(idFormato, fila, dia);
      /* Lo que decía el archivo: la cifra, o el texto ilegible que traía. */
      if (reporte?.carga && !Object.prototype.hasOwnProperty.call(editadas, clave)) editadas[clave] = valores[dia - 1] ?? ilegibles[clave] ?? null;
      if (Object.prototype.hasOwnProperty.call(editadas, clave) && editadas[clave] === valor && !ilegibles[clave]) delete editadas[clave];
      valores[dia - 1] = valor;
      cuadro[fila] = valores;
      delete ilegibles[clave];
      delete declarados[idFormato][fila];
      delete declarados[idFormato]._total;
    }
    guardarDatos(CLAVE, periodo, { [idFormato]: cuadro, editadas, ilegibles, declarados });
  };

  /* Las alertas que el área confirmó con Dr. Mochi quedan justificadas: en el
     almacén al instante y, con backend, en el servidor, que es quien decide si
     se puede enviar. Se guardan ANTES de cargar el libro corregido: el backend
     conserva la justificación de las alertas que vuelven a aparecer. */
  const confirmarAlertas = async (ids) => {
    if (!ids.length) return true;
    const actual = reporteDe(leerEstado().reportes, CLAVE, periodo);
    guardarDatos(CLAVE, periodo, { justificaciones: { ...actual?.datos?.justificaciones, ...Object.fromEntries(ids.map((id) => [id, TEXTO_CONFIRMADA])) } });
    if (!real) return true;
    const resultados = await Promise.all(ids.map((id) => api.justificar(CLAVE, periodo, id, TEXTO_CONFIRMADA)));
    const fallo = resultados.find((r) => !r.ok);
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
      note: reporte?.carga ? reporte.carga.archivo.nombre : tieneDatos ? 'Digitado en el sistema' : 'El Excel del mes',
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
    {
      key: 'envio',
      title: 'Enviar',
      note: ['A Estadística', ...destinosDe(CLAVE).filter((d) => d !== 'estadistica').map(nombreOficina)].join(' y '),
      status: 'empty',
    },
  ];

  const motivoNoListo = !tieneDatos
    ? { titulo: 'El reporte está vacío', detalle: 'Suba el Excel del mes o digite las cifras.', accion: 'Subir el Excel', paso: 'carga' }
    : !vigente
      ? { titulo: 'El bot todavía está revisando los últimos cambios', detalle: 'Toma un instante. Estadística recibe exactamente lo que el bot revisó.', accion: 'Ir a la revisión', paso: 'revision' }
      : informe.errores.length
        ? { titulo: `Hay ${informe.errores.length} ${informe.errores.length === 1 ? 'error' : 'errores'} por corregir`, detalle: 'Lo que no cuadra no sale del área: la revisión del bot es la validación del reporte.', accion: 'Ver lo que hay por resolver', paso: 'revision' }
        : { titulo: `Hay ${pendientes.length} ${pendientes.length === 1 ? 'alerta' : 'alertas'} por revisar`, detalle: 'Revíselas con Dr. Mochi: corrija la cifra o confirme que es correcta.', accion: 'Ver lo que hay por resolver', paso: 'revision' };

  return (
    <Mosaic stacked className="hrl-panel">
      <Card accent="var(--primary)"
        icon="sh-calendar"
        title={`Reporte de ${etiquetaPeriodo(periodo)}`}
        subtitle="Nutrición y Dietética · se llena subiendo su Excel"
        meta={<EstadoPeriodo reporte={reporte} periodo={periodo} />}
        actions={selector}
      >
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

      {/* Cada paso entra con un fundido suave; `key` hace que se repita al cambiar.
          Al subir el Excel se pasa a la revisión en cuanto el bot responde, sin
          esperar a nada más: la transición es la única pausa. */}
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
            onDigitar={real ? null : digitar}
            onVolver={() => setPaso('revision')}
            onCargarEnOtroMes={cargarEnOtroMes}
          />
        )}

        {paso === 'revision' &&
          (!reporte ? (
            <Card accent="var(--info)" icon="sh-info" title="Todavía no hay nada que revisar">
              <Stack gap={4} className="hrl-cuerpo">
                <p style={{ margin: 0 }}>
                  Suba el Excel del mes y aquí verá el consolidado, lo que encontró el bot y el detalle por semana.{real ? '' : ' Si no tiene Excel, puede digitar.'}
                </p>
                <Stack direction="row" gap={3} wrap>
                  <Button icon="sh-upload" onClick={() => setPaso('carga')}>
                    Subir el Excel
                  </Button>
                  {!real && (
                    <Button tone="ghost" icon="sh-pencil" onClick={digitar}>
                      Digitar sin Excel
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Card>
          ) : (
            <>
              <Lectura
                revisando={revalidando || !vigente}
                vacio={!tieneDatos}
                archivo={reporte.carga?.archivo?.nombre}
                errores={vigente ? informe.errores.length : 0}
                pendientes={pendientes.length}
                listo={listo}
                onEnviar={() => setPaso('envio')}
                onCorregir={reporte.carga ? () => setCorrigiendo(true) : undefined}
              />

              {tieneDatos && <Consolidado datos={datos} periodo={periodo} anterior={anterior} />}

              {vigente && !limpio && (
                <PorResolver informe={informe} datos={datos} />
              )}

              {/* Siempre a la vista: es lo que el Excel llenó, y revisarlo no
                  debe costar un clic. */}
              <Card accent="var(--primary)" icon="sh-table"
                title={reporte.carga ? 'Las cifras de su Excel' : 'Las cifras del mes'}
                subtitle={`Cuadro por cuadro y semana a semana · ${llenas.toLocaleString('es-PE')} de ${total.toLocaleString('es-PE')} casillas con dato`}
              >
                <div className="hrl-cuerpo">
                  <Detalle
                    datos={datos}
                    periodo={periodo}
                    editable={editableEnHoja}
                    onCambiar={cambiarCeldas}
                    origen={reporte.carga?.origen}
                    informe={vigente ? informe : null}
                    foco={foco}
                  />
                </div>
              </Card>

              <div className="hrl-acciones-paso">
                <Button data-guia="subir-otro" tone="ghost" icon="sh-upload" onClick={() => setPaso('carga')}>
                  {reporte.carga ? 'Subir otro archivo' : 'Subir un Excel'}
                </Button>
                <Button icon="sh-send" disabled={!listo} onClick={() => setPaso('envio')} style={{ minHeight: 'var(--touch-target-lg)' }}>
                  Continuar al envío
                </Button>
              </div>
              {!listo && tieneDatos && (
                <p className="hrl-acciones-paso__motivo">
                  <Icon name="sh-info" size={14} /> {motivoNoListo.titulo}.
                </p>
              )}
            </>
          ))}

        {paso === 'envio' && (
          <PasoEnvio
            datos={datos}
            periodo={periodo}
            carga={reporte?.carga}
            informe={informe}
            listo={listo}
            motivoNoListo={motivoNoListo}
            onIrA={setPaso}
            onEnviar={enviar}
          />
        )}
      </Mosaic>

      {!procesando && cargaDeMeses}
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

      {archivoPorConfirmar && (
        <Dialog
          title="¿Reemplazar lo que ya está cargado?"
          subtitle={`Archivo nuevo: «${archivoPorConfirmar.name}»`}
          onClose={() => setArchivoPorConfirmar(null)}
          maxWidth={540}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setArchivoPorConfirmar(null)}>
                Conservar lo actual
              </Button>
              <Button
                data-guia="confirmar-reemplazo"
                tone="danger"
                icon="sh-upload"
                onClick={() => {
                  const archivo = archivoPorConfirmar;
                  setArchivoPorConfirmar(null);
                  subir(archivo, { confirmado: true });
                }}
              >
                Subir y reemplazar
              </Button>
            </Stack>
          }
        >
          <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
            El reporte tiene {llenas.toLocaleString('es-PE')} casillas con dato
            {reporte?.carga ? `, leídas de «${reporte.carga.archivo.nombre}»` : ''}. Si el bot acepta el archivo nuevo, sus cifras reemplazan a todas las
            actuales; si lo rechaza, no cambia nada. Las alertas ya confirmadas que vuelvan a aparecer se conservan.
          </p>
        </Dialog>
      )}

      {porReemplazar && (
        <Dialog
          title="¿Reemplazar lo que ya está cargado?"
          subtitle={`Archivo nuevo: «${porReemplazar.archivo.nombre}»`}
          onClose={() => setPorReemplazar(null)}
          maxWidth={540}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setPorReemplazar(null)}>
                Conservar lo actual
              </Button>
              <Button
                data-guia="confirmar-reemplazo"
                tone="danger"
                icon="sh-upload"
                onClick={() => {
                  aplicarCarga(porReemplazar);
                  setPorReemplazar(null);
                }}
              >
                Reemplazar
              </Button>
            </Stack>
          }
        >
          <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
            El reporte tiene {llenas.toLocaleString('es-PE')} casillas con dato
            {reporte?.carga ? `, leídas de «${reporte.carga.archivo.nombre}»` : ', digitadas en el sistema'}. Se reemplazan por las{' '}
            {porReemplazar.leidas.toLocaleString('es-PE')} del archivo nuevo. Las correcciones hechas a mano y las alertas confirmadas se pierden.
          </p>
        </Dialog>
      )}

      {constancia && <Constancia reporte={constancia} onCerrar={() => setConstancia(null)} />}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
