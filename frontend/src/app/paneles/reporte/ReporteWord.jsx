/* Reporte del mes de las áreas que suben un Word: Diagnóstico por Imágenes,
   Farmacia, Nefrología y Epidemiología.

   El mismo recorrido que las áreas con Excel, en tres pasos:
     1. Subir el Word           el del mes, tal como lo prepara el área
     2. Revisar y resolver      lo que encontró el bot, formato por formato
     3. Enviar                  a Estadística y a las oficinas de su matriz, a la vez

   Hasta el 03/11/2026 estas cuatro áreas tenían otra pantalla: había que «abrir»
   el reporte antes de subir nada, sus formatos eran pestañas, la zona de subida
   nunca se iba y el envío era un diálogo. Enseñar y sostener dos recorridos para
   un mismo trabajo no tenía motivo: lo único distinto es el tipo de archivo. Lo
   propio de cada área (sus textos, sus ejemplos) está en `CONFIGURACION`.

   Nefrología sube siempre su cuadro del año: el bot lee solo la columna del mes.

   Sin servidor (el prototipo) se puede además digitar en los formatos; con él, las
   cifras solo entran subiendo el Word, porque lo digitado no llegaría a la base. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Dialog, Field, Icon, Mosaic, ProgressSteps, Stack, Toast } from '@hrl/core-ui';
import { reporteDe, registrarCarga, guardarDatos, leerEstado, useHoy } from '@/app/datos/store.js';
import { formularioDe, datosCompletos } from '@/app/datos/formatos/levantados.js';
import { examenesF1, examenesF2, examenesF3, examenesF4 } from '@/app/datos/formatos/imagenes-calculos.js';
import { totalAtenciones, totalSop, totalF3 } from '@/app/datos/formatos/farmacia-calculos.js';
import { destinosDe } from '@/app/datos/areas.js';
import { nombreOficina } from '@/app/datos/oficinas.js';
import * as api from '@/app/servicios/api.js';
import { validarArchivo, validarDatos, firmaDe, recordarArchivo } from '@/app/servicios/bot-validador.js';
import * as ejemplosImagenes from '@/app/servicios/ejemplos-imagenes.js';
import * as ejemplosFarmacia from '@/app/servicios/ejemplos-farmacia.js';
import * as ejemplosNefrologia from '@/app/servicios/ejemplos-nefrologia.js';
import * as ejemplosEpidemiologia from '@/app/servicios/ejemplos-epidemiologia.js';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { estado, esEditable, estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo, periodoVigente } from '@/app/dominio/periodos.js';
import { fechaHora } from '@/app/dominio/formato.js';
import EstadoPeriodo from '../EstadoPeriodo.jsx';
import PasoCarga from './nutricion/PasoCarga.jsx';
import PorResolver from './nutricion/PorResolver.jsx';
import Lectura from './nutricion/Lectura.jsx';
import HerramientasPrueba from './nutricion/HerramientasPrueba.jsx';
import { Constancia } from './nutricion/ReporteNutricion.jsx';
import PasoEnvioWord from './PasoEnvioWord.jsx';
import Correccion, { avisoDeCorreccion, TEXTO_CONFIRMADA } from './Correccion.jsx';
import { PANELES } from './formularios.js';
import { SelectorDeMes, AvisoMesAnterior } from './Comunes.jsx';
import CargaDeMeses from './CargaDeMeses.jsx';

/* El bot lee también el Word 97-2003 (.doc): Nefrología solo tiene su cuadro así. */
const WORD = Object.freeze({
  documento: 'Word',
  extension: 'docx',
  extensiones: Object.freeze(['docx', 'doc']),
  accept: '.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword',
  formatoAntiguo: /\.(rtf|odt)$/i,
  mensajeAntiguo: 'El bot lee el Word del área (.docx o .doc). Ábralo en Word y guárdelo como «Documento de Word (.docx)».',
});

const FRASES_COMUNES = Object.freeze(['Abriendo su Word…', 'Buscando los cuadros por sus rótulos…', 'Revisando que los totales cuadren…', 'Ya casi termino…']);

const delEjemplo = (ejemplos) => ({
  nombreDeArchivo: ejemplos.nombreDePlantilla,
  descargarPlantilla: ejemplos.descargarPlantilla,
  ejemploCorrecto: ejemplos.ejemploCorrecto,
  ejemploConErrores: ejemplos.ejemploConErrores,
});

const CONFIGURACION = Object.freeze({
  imagenes: Object.freeze({
    ...delEjemplo(ejemplosImagenes),
    tipo: { ...WORD, noLeible: 'Se sube el oficio mensual en Word, el mismo que se imprime y se firma. Un PDF o una foto no se pueden leer.', pesoTipico: 'El oficio del mes, con sus cuatro hojas, pesa menos de 200 KB.' },
    subtitulo: (mes) => `El mismo oficio de ${mes} que se imprime: el bot lee sus cuatro hojas y llena los formatos`,
    bot: 'Lee el oficio en Word (Rayos X, tomografía, mamografía y ecografía), revisa que cada total cuadre con lo que suma y que los tecnólogos sumen los atendidos, y le muestra lo leído antes de enviar nada a Estadística.',
    frases: FRASES_COMUNES,
    instrucciones: [
      'Suba el oficio tal como lo prepara el departamento, con sus cuatro hojas.',
      'No cambie los títulos de las tablas ni los rótulos de sus filas: el bot encuentra cada cifra por ellos.',
      'Si un médico o un tecnólogo nuevo aparece en el mes, basta con agregar su fila en el Word.',
    ],
    ayudaFormato: (mes) => `Word con las tablas del oficio de ${mes}, sin cifras. No trae membrete: solo lo que el bot lee.`,
    ayudaErrores: 'La EXAM de un médico que no suma sus casillas y un tecnólogo de Rayos X con un dígito de más, como en los oficios de 2026.',
    limpio: 'Las cuatro hojas están completas y cada total del oficio cuadra con lo que suma',
    para: 'Llevarlo a la sección B del consolidado de servicios intermedios que se remite a DIRESA.',
    tieneCifras: (d) => [examenesF1(d?.f1), examenesF2(d?.f2), examenesF3(d?.f3), examenesF4(d?.f4)].some((v) => v != null),
  }),
  farmacia: Object.freeze({
    ...delEjemplo(ejemplosFarmacia),
    tipo: { ...WORD, noLeible: 'Se sube el informe mensual en Word, el mismo que prepara Control y Archivo. Un PDF o una foto no se pueden leer.', pesoTipico: 'Con sus gráficos, el informe de enero pesa 1,2 MB.' },
    subtitulo: (mes) => `El mismo Word de ${mes} que prepara Control y Archivo: el bot lo lee y llena los formatos`,
    bot: 'Lee el Word del informe, revisa que las cifras cuadren entre los cuadros y le muestra lo leído antes de enviar nada a Estadística.',
    frases: FRASES_COMUNES,
    instrucciones: [
      'Puede partir del formato en blanco: los mismos cuadros del informe, con el mes ya escrito.',
      'No cambie los rótulos de los cuadros: el bot encuentra cada cifra por el rótulo que la acompaña.',
    ],
    ayudaFormato: (mes) => `Word con los cuadros del informe mensual de ${mes}, sin cifras. No trae membrete ni gráficos: solo lo que el bot lee.`,
    ayudaErrores: 'Un total SIS mal sumado y consultas que no cuadran con el Formato 1.',
    limpio: 'Los cuadros cuadran entre sí y toda cifra es un entero sin signo',
    para: 'Llevarlo a la sección E del consolidado de servicios intermedios que se remite a DIRESA.',
    tieneCifras: (d) => [totalAtenciones(d?.f1), totalSop(d?.f2), totalF3(d?.f3)].some((v) => v != null),
  }),
  nefrologia: Object.freeze({
    ...delEjemplo(ejemplosNefrologia),
    tipo: { ...WORD, noLeible: 'Se sube el cuadro del año en Word, con la columna de este mes ya agregada. Un PDF o una foto no se pueden leer.', pesoTipico: 'El cuadro del servicio, sin gráficos, pesa poco menos de 200 KB.' },
    subtitulo: (mes) => `El mismo cuadro del año, ya con la columna de ${mes}: el bot lee solo esa columna`,
    bot: 'Lee el cuadro en Word, revisa que los trimestres, semestres y el total anual que ya trae calculados cuadren con sus meses, y le muestra lo leído antes de enviar nada a Estadística.',
    frases: FRASES_COMUNES,
    instrucciones: [
      'Suba el cuadro completo, con todas las columnas que ya tenga: el bot lee solo la del mes que reporta.',
      'No cambie los rótulos de los indicadores: el bot encuentra cada cifra por ellos.',
    ],
    ayudaFormato: (mes) => `Word con el cuadro del año, sin cifras, para llenar la columna de ${mes}.`,
    ayudaErrores: 'Un trimestre o un total anual que no cuadra con sus meses.',
    limpio: 'El mes tiene sus indicadores completos y los totales del cuadro cuadran con sus meses',
    para: 'Registrarlo con los demás reportes del mes.',
    /* El cuadro no se compara con el mes anterior: su lector y sus reglas miran solo la columna del mes. */
    sinComparar: true,
    tieneCifras: (d) => Object.values(d?.f1 ?? {}).some((v) => v != null),
  }),
  epidemiologia: Object.freeze({
    ...delEjemplo(ejemplosEpidemiologia),
    tipo: { ...WORD, noLeible: 'Se sube el oficio de vigilancia en Word, el mismo que se imprime y se firma. Un PDF o una foto no se pueden leer.', pesoTipico: 'El oficio de vigilancia, con su membrete, pesa unos 100 KB.' },
    subtitulo: (mes) => `El mismo oficio de vigilancia de ${mes}: el bot lee su tabla de infecciones intrahospitalarias`,
    bot: 'Lee el oficio de vigilancia en Word, revisa que la fila TOTAL cuadre con los grupos de edad y que cada caso esté en una edad posible para su columna, y le muestra lo leído antes de enviar nada a Estadística.',
    frases: FRASES_COMUNES,
    instrucciones: [
      'Suba el oficio tal como lo prepara la oficina, con su línea «MES:» sobre la tabla.',
      'Los grupos sin casos pueden quedar en blanco, como siempre: el bot los lee como 0.',
      'No cambie el orden ni los títulos de las columnas: el bot encuentra cada cifra por ellos.',
    ],
    ayudaFormato: (mes) => `Word con la tabla de vigilancia de ${mes}, sin cifras. No trae membrete: solo lo que el bot lee.`,
    ayudaErrores: 'Una fila TOTAL que no suma sus grupos de edad y una muerte neonatal anotada en la fila de 25 a 29 años.',
    limpio: 'La fila TOTAL cuadra con los grupos de edad y cada caso está en una edad posible',
    para: 'Llevarlo al indicador 16 de los indicadores de gestión que se remiten a DIRESA.',
    tieneCifras: (d) => Object.keys(d?.f1 ?? {}).length > 0,
  }),
});

function Formatos({ claveArea, datos, periodo, editable = false, onCambiar = () => {} }) {
  const formulario = formularioDe(claveArea);
  return formulario.formatos.map((f) => {
    const Panel = PANELES[claveArea][f.id];
    return <Panel key={f.id} datos={datos} periodo={periodo} editable={editable} onCambiar={onCambiar} />;
  });
}

function Entregado({ claveArea, reporte, periodo, herramientas, selector, cargaDelLibro }) {
  const formulario = formularioDe(claveArea);
  const estadoInfo = estado(reporte?.estado);
  const oficinas = reporte?.remision?.destinos ?? [];
  const datos = datosCompletos(claveArea, reporte?.datos);

  return (
    <Mosaic stacked className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={`${formulario.nombre} · enviado, en solo lectura`} meta={<EstadoPeriodo reporte={reporte} periodo={periodo} />} actions={selector}>
        <Stack gap={4} className="hrl-cuerpo">
          {periodo === formulario.periodoReal && formulario.notaReal && (
            <Alert tone="info" title="Cifras reales de este mes">
              {formulario.notaReal}
            </Alert>
          )}
          <div className="hrl-campos">
            <Field k="Constancia" v={reporte?.constancia} mono />
            <Field k="Enviado el" v={fechaHora(reporte?.enviadoEn)} />
            <Field k="Estadística" v={estadoInfo.descripcion ?? estadoInfo.label} />
            {reporte?.carga?.archivo?.nombre && <Field k="Archivo" v={reporte.carga.archivo.nombre} />}
            {oficinas.map((o) => (
              <Field key={o} k={nombreOficina(o)} v="Lo recibió al enviarlo" />
            ))}
          </div>
        </Stack>
      </Card>
      <Formatos claveArea={claveArea} datos={datos} periodo={periodo} />
      {cargaDelLibro}
      {herramientas}
    </Mosaic>
  );
}

export default function ReporteWord({ claveArea, reportes, periodo: periodoPedido, usuario, pruebas = false, pasoPedido, irA }) {
  const formulario = formularioDe(claveArea);
  const config = CONFIGURACION[claveArea];
  const mesVigente = periodoVigente(useHoy());
  const periodo = periodoPedido ?? mesVigente;
  const mes = etiquetaPeriodo(periodo).toLowerCase();
  const reporte = reporteDe(reportes, claveArea, periodo);
  const estadoActual = reporte?.estado ?? 'no_iniciado';
  const datos = useMemo(() => reporte?.datos ?? {}, [reporte]);
  const completos = useMemo(() => datosCompletos(claveArea, reporte?.datos), [claveArea, reporte]);
  const anterior = useMemo(() => {
    if (config.sinComparar) return null;
    return (
      reportes
        .filter((r) => r.area === claveArea && r.periodo < periodo && estaEntregado(r.estado))
        .sort((a, b) => a.periodo.localeCompare(b.periodo))
        .map((r) => ({ periodo: r.periodo, datos: r.datos }))
        .at(-1) ?? null
    );
  }, [config, reportes, claveArea, periodo]);
  const tieneDatos = config.tieneCifras(datos);

  const [paso, setPaso] = useState(tieneDatos ? 'revision' : 'carga');
  /* La corrección con Dr. Mochi es un diálogo sobre la revisión, no un paso. */
  const [corrigiendo, setCorrigiendo] = useState(pasoPedido === 'correccion');
  const [procesando, setProcesando] = useState(null);
  usePublicarGuia('flujo', { paso, procesando: Boolean(procesando) });
  /* Las cifras del mes llegan del servidor un momento después de montar la
     pantalla: cuando llegan se pasa a la revisión, solo entonces (ver ReporteNutricion.jsx). */
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

  const real = api.esAreaReal(claveArea);

  const alProbar = ({ mensaje, constancia: nueva, alPaso1 }) => {
    setToast(mensaje);
    if (nueva) setConstancia(nueva);
    if (alPaso1) {
      setPaso('carga');
      setInforme(null);
      setBloqueo(null);
    }
  };
  const herramientas = pruebas ? <HerramientasPrueba clave={claveArea} nombre={formulario.nombre} reporte={reporte} periodo={periodo} real={real} onHecho={alProbar} /> : null;
  const editable = esEditable(estadoActual) || estadoActual === 'no_iniciado';
  const firma = useMemo(() => firmaDe(datos, claveArea), [datos, claveArea]);
  const vigente = informe != null && !informe.bloqueo && informe.firma === firma;
  const pendientes = vigente ? informe.avisos.filter((a) => !datos.justificaciones?.[a.id]) : [];
  const listo = vigente && informe.errores.length === 0 && pendientes.length === 0;
  const limpio = vigente && informe.errores.length === 0 && informe.avisos.length === 0;

  useEffect(() => {
    if (paso === 'carga' || vigente || !tieneDatos) return undefined;
    if (real) {
      if (reporte?.informe) setInforme({ ...reporte.informe, firma });
      return undefined;
    }
    let sigue = true;
    validarDatos(completos, { area: claveArea, periodo, anterior }).then((inf) => {
      if (sigue) setInforme({ ...inf, firma });
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

  const selector = irA ? <SelectorDeMes reportes={reportes} claveArea={claveArea} periodo={periodo} vigente={mesVigente} onCambiar={(p) => irA('reporte', { periodo: p })} /> : null;
  const cargaDelLibro = <CargaDeMeses area={claveArea} reportes={reportes} vigente={mesVigente} usuario={usuario} onAbrir={irA ? (p) => irA('reporte', { periodo: p }) : null} />;

  if (estaEntregado(estadoActual)) {
    return (
      <>
        <Entregado claveArea={claveArea} reporte={reporte} periodo={periodo} herramientas={herramientas} selector={selector} cargaDelLibro={cargaDelLibro} />
        {constancia && <Constancia reporte={constancia} onCerrar={() => setConstancia(null)} />}
        <Toast message={toast} onClose={() => setToast(null)} />
      </>
    );
  }
  if (!editable) {
    return (
      <Mosaic stacked className="hrl-panel">
        <Card accent="var(--muted)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={formulario.nombre} actions={selector}>
          <div className="hrl-cuerpo">
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
    setToast(`Se leyeron ${inf.leidas.toLocaleString('es-PE')} cifras${n ? `; hay ${n} ${n === 1 ? 'punto' : 'puntos'} por resolver` : ', sin observaciones'}.`);
  };

  const aplicarCarga = (inf, corregidas = null) => {
    const carga = { archivo: inf.archivo, fecha: inf.fecha, plantilla: inf.plantilla, origen: inf.origen, leidas: inf.leidas };
    const vigentes = reporteDe(leerEstado().reportes, claveArea, periodo)?.datos?.justificaciones ?? {};
    registrarCarga(claveArea, periodo, { datos: { lectura: [], ilegibles: {}, escritos: null, ...inf.datos, justificaciones: corregidas ? vigentes : {} }, carga, actor: usuario.nombre });
    setInforme({ ...inf, firma: firmaDe(inf.datos, claveArea) });
    avisar(inf, corregidas);
  };

  const aplicarCargaReal = async (inf, corregidas = null) => {
    const r = await api.sincronizarReporte(claveArea, periodo);
    if (!r.ok) {
      setErrorAccion(r.detail ?? 'El Word se guardó, pero no se pudo traer el reporte actualizado. Recargue la página.');
      return;
    }
    setInforme({ ...inf, firma: firmaDe(r.reporte.datos, claveArea) });
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
      const r = await api.subirCarga(claveArea, periodo, archivo);
      setProcesando(null);
      setEtapa(null);
      if (!r.ok) {
        if (r.detail) setErrorAccion(r.detail);
        return;
      }
      if (!r.informe?.bloqueo) recordarArchivo(claveArea, periodo, archivo);
      return resolverInforme(r.informe, corregidas);
    }
    setProcesando(archivo.name);
    const inf = await validarArchivo(archivo, { area: claveArea, periodo, anterior, alAvanzar: setEtapa });
    setProcesando(null);
    setEtapa(null);
    if (!inf.bloqueo) recordarArchivo(claveArea, periodo, archivo);
    return resolverInforme(inf, corregidas);
  };

  /* Las alertas confirmadas con Dr. Mochi quedan justificadas, antes de cargar el
     Word corregido (ver ReporteNutricion.jsx, `confirmarAlertas`). */
  const confirmarAlertas = async (ids) => {
    if (!ids.length) return true;
    const actual = reporteDe(leerEstado().reportes, claveArea, periodo);
    guardarDatos(claveArea, periodo, { justificaciones: { ...actual?.datos?.justificaciones, ...Object.fromEntries(ids.map((id) => [id, TEXTO_CONFIRMADA])) } });
    if (!real) return true;
    const resultados = await Promise.all(ids.map((id) => api.justificar(claveArea, periodo, id, TEXTO_CONFIRMADA)));
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

  /* Solo en el prototipo: abre el mes para digitar en los formatos. */
  const digitar = async () => {
    if (!reporte) await api.transicionar(claveArea, periodo, 'crear', { actor: usuario.nombre, rol: 'area' });
    setPaso('revision');
  };

  /* Una casilla corregida a mano: los totales escritos en el Word ya no describen
     lo que hay en el reporte, y compararlos marcaría errores sin arreglo posible. */
  const cambiar = (parcial) => guardarDatos(claveArea, periodo, datos.escritos ? { ...parcial, escritos: null } : parcial);

  const enviar = async () => {
    setErrorAccion(null);
    const r = await api.transicionar(claveArea, periodo, 'enviar', { actor: usuario.nombre, rol: 'area' });
    if (!r.ok) {
      if (r.detail) setErrorAccion(r.detail);
      return;
    }
    setConstancia(r.reporte);
  };

  const ubicar = (h) => formulario.formatos.find((f) => f.id === h.formato)?.titulo ?? null;

  const pasos = [
    {
      key: 'carga',
      title: 'Subir el Word',
      note: reporte?.carga?.archivo?.nombre ?? 'El Word del mes',
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
    { key: 'envio', title: 'Enviar', note: `A Estadística${destinosDe(claveArea).some((d) => d !== 'estadistica') ? ' y sus oficinas' : ''}`, status: 'empty' },
  ];

  const motivoNoListo = !tieneDatos
    ? { titulo: 'El reporte está vacío', detalle: 'Suba el Word del mes.', accion: 'Subir el Word', paso: 'carga' }
    : !vigente
      ? { titulo: 'El bot todavía está revisando', detalle: 'Toma un instante. Estadística recibe exactamente lo que el bot revisó.', accion: 'Ir a la revisión', paso: 'revision' }
      : informe.errores.length
        ? { titulo: `Hay ${informe.errores.length} ${informe.errores.length === 1 ? 'error' : 'errores'} por corregir`, detalle: 'Lo que no cuadra no sale del área: corríjalo con Dr. Mochi o suba el Word corregido.', accion: 'Ver lo que hay por resolver', paso: 'revision' }
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
        El reporte ya tiene cifras{reporte?.carga?.archivo?.nombre ? `, leídas de «${reporte.carga.archivo.nombre}»` : ''}. Si el bot acepta el archivo nuevo, sus
        cifras reemplazan a todas las actuales; si lo rechaza, no cambia nada.
      </p>
    </Dialog>
  );

  /* Sin servidor, un mes abierto se puede digitar aunque aún no tenga cifras. */
  const sinNadaQueRevisar = !reporte || (real && !tieneDatos);

  return (
    <Mosaic stacked className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={`${formulario.nombre} · se llena subiendo su Word`} meta={<EstadoPeriodo reporte={reporte} periodo={periodo} />} actions={selector}>
        <Stack gap={4} className="hrl-cuerpo">
          <AvisoMesAnterior periodo={periodo} vigente={mesVigente} archivo="el Word" />
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
            onDigitar={real ? null : digitar}
            onVolver={() => setPaso('revision')}
            config={{ ...config, subtitulo: config.subtitulo(mes) }}
          />
        )}

        {paso === 'revision' &&
          (sinNadaQueRevisar ? (
            <Alert tone="info" title="Todavía no hay nada que revisar">
              Suba el Word del mes y aquí verá lo que encontró el bot en cada formato.
              <div style={{ marginTop: 12 }}>
                <Button icon="sh-upload" onClick={() => setPaso('carga')}>
                  Subir el Word
                </Button>
              </div>
            </Alert>
          ) : (
            <>
              <Lectura
                documento="Word"
                revisando={tieneDatos && !vigente}
                vacio={!tieneDatos}
                archivo={reporte.carga?.archivo?.nombre}
                errores={vigente ? informe.errores.length : 0}
                pendientes={pendientes.length}
                listo={listo}
                onEnviar={() => setPaso('envio')}
                onCorregir={() => setCorrigiendo(true)}
              />

              {vigente && !limpio && (
                <PorResolver informe={informe} datos={datos} onConfirmar={reporte.carga ? undefined : (id) => confirmarAlertas([id])} ubicar={ubicar} textoLimpio={config.limpio} />
              )}

              {/* Con el servidor, las cifras solo entran subiendo el Word: corregir una
                  casilla aquí no llegaría a la base. */}
              <Formatos claveArea={claveArea} datos={completos} periodo={periodo} editable={editable && !real} onCambiar={cambiar} />

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
          <PasoEnvioWord claveArea={claveArea} datos={completos} periodo={periodo} carga={reporte?.carga} informe={informe} listo={listo} motivoNoListo={motivoNoListo} para={config.para} onIrA={setPaso} onEnviar={enviar} />
        )}
      </Mosaic>

      {!procesando && cargaDelLibro}
      {herramientas}

      {corrigiendo && (
        <Correccion
          area={claveArea}
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
