/* Cargar meses pasados de una vez: los archivos del año que el área ya tiene.

   Sirve para poblar el sistema con lo que el área reportó en papel antes de
   usarlo, y para ponerse al día con los meses que faltan. Lo comparten las
   siete áreas que se llenan subiendo su archivo (22/10/2026: antes solo
   Nutrición y Laboratorio), cada una con su forma de archivo:
     · un archivo por mes (Nutrición, Lavandería, Centro Quirúrgico,
       Gineco-Obstetricia y Farmacia, este en Word): se eligen varios a la vez;
     · uno por año: el libro de Laboratorio, con una hoja por mes, o el cuadro
       de Nefrología en Word, con una columna por mes: se elige ese.
   Nadie dice a qué mes va cada archivo: el bot lo reconoce (el mes del título,
   la hoja del mes) con `mesesDelArchivo`, y antes de cargar se muestra el plan
   para confirmarlo. Después, cada mes pasa por el mismo camino que una carga
   suelta: el bot lo lee y lo valida, y con el servidor queda con su archivo y
   su revisión.

   Solo los meses del año hasta el vigente: un mes que todavía no termina no se
   reporta. Lo que no se toca: un mes que ya salió del área. Para cambiarlo,
   Estadística lo reabre y vuelve a borrador. Un mes que ya tenía cifras se
   reemplaza, y por eso se confirma diciendo cuáles. Nada se envía solo: cada
   mes queda en borrador para revisarlo y enviarlo desde su reporte. */

import { useRef, useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, Dialog, IconButton, Stack, Toast, Tooltip } from '@hrl/core-ui';
import { leerEstado, registrarCarga, reporteDe } from '@/app/datos/store.js';
import * as api from '@/app/servicios/api.js';
import { AREAS_BOT, mesesDelArchivo, validarArchivo, recordarArchivo } from '@/app/servicios/bot-validador.js';
import { estado, esEditable, estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';

const TAMANO_MAXIMO = 5 * 1024 * 1024;

const mesDe = (periodo) => etiquetaPeriodo(periodo).toLowerCase();

/* Qué le pasará a cada mes si se confirma. `detectados`: lo que el bot
   reconoció en cada archivo ([{ archivo, meses, descartados }]). Si dos
   archivos traen el mismo mes, vale el primero: cargar dos veces el mismo mes
   en una tanda dejaría el resultado al azar del orden. */
export function planDe(reportes, claveArea, detectados) {
  const filas = [];
  const vistos = new Map();
  for (const d of detectados) {
    for (const periodo of d.meses ?? []) {
      const reporte = reporteDe(reportes, claveArea, periodo);
      const estado = reporte?.estado ?? 'no_iniciado';
      const base = { clave: `${periodo}|${d.archivo.name}`, periodo, archivo: d.archivo, estado };
      if (vistos.has(periodo)) {
        filas.push({ ...base, accion: 'omitir', texto: `Repetido: ya se carga desde «${vistos.get(periodo)}»` });
        continue;
      }
      vistos.set(periodo, d.archivo.name);
      if (estaEntregado(estado) || !(estado === 'no_iniciado' || esEditable(estado))) {
        filas.push({ ...base, accion: 'omitir', texto: 'No se toca: ya se entregó' });
        continue;
      }
      const conCifras = Boolean(reporte?.carga) || Object.keys(reporte?.datos ?? {}).length > 0;
      filas.push(
        conCifras
          ? { ...base, accion: 'reemplazar', texto: reporte?.carga ? `Reemplaza lo leído de «${reporte.carga.archivo.nombre}»` : 'Reemplaza las cifras actuales' }
          : { ...base, accion: 'cargar', texto: 'Se carga' },
      );
    }
    for (const x of d.descartados ?? []) {
      filas.push({ clave: `${x.periodo}|${d.archivo.name}|descartado`, periodo: x.periodo, archivo: d.archivo, estado: reporteDe(reportes, claveArea, x.periodo)?.estado ?? 'no_iniciado', accion: 'omitir', texto: x.titulo });
    }
  }
  return filas.sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/* El último mes ya entregado antes de `periodo`: la comparación del bot (sin servidor). */
function anteriorDe(claveArea, periodo) {
  return (
    leerEstado()
      .reportes.filter((r) => r.area === claveArea && r.periodo < periodo && estaEntregado(r.estado))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .map((r) => ({ periodo: r.periodo, datos: r.datos }))
      .at(-1) ?? null
  );
}

/* Un mes, con el servidor o sin él. Devuelve la fila de resultados. */
export async function cargarMes(claveArea, archivo, periodo, actor) {
  const fila = { clave: periodo, periodo, archivo: archivo.name };
  if (api.esAreaReal(claveArea)) {
    const r = await api.subirCarga(claveArea, periodo, archivo);
    if (!r.ok) return { ...fila, resultado: 'fallo', detalle: r.detail ?? 'El servidor no aceptó el archivo para este mes.' };
    if (r.informe?.bloqueo) return { ...fila, resultado: 'rechazado', detalle: r.informe.bloqueo.titulo };
    /* Como en la carga del mes: sin el archivo a mano, Dr. Mochi no tiene qué
       corregir cuando se abra ese mes. */
    recordarArchivo(claveArea, periodo, archivo);
    await api.sincronizarReporte(claveArea, periodo);
    return { ...fila, resultado: 'aceptado', errores: r.informe.errores.length, avisos: r.informe.avisos.length, hoja: r.informe.plantilla?.hoja };
  }
  const inf = await validarArchivo(archivo, { area: claveArea, periodo, anterior: anteriorDe(claveArea, periodo), pausa: 0 });
  if (inf.bloqueo) return { ...fila, resultado: 'rechazado', detalle: inf.bloqueo.titulo };
  recordarArchivo(claveArea, periodo, archivo);
  const carga = { archivo: inf.archivo, fecha: inf.fecha, plantilla: inf.plantilla, origen: inf.origen, leidas: inf.leidas };
  if (!registrarCarga(claveArea, periodo, { datos: { ...inf.datos, justificaciones: {} }, carga, actor })) {
    return { ...fila, resultado: 'fallo', detalle: 'El reporte de este mes ya no está en borrador.' };
  }
  return { ...fila, resultado: 'aceptado', errores: inf.errores.length, avisos: inf.avisos.length, hoja: inf.plantilla?.hoja };
}

/* Si un Excel rechazado por ser «de otro mes» es, en realidad, de un mes del
   año que todavía se puede cargar, cuál. Así el aviso del rechazo ofrece
   cargarlo donde corresponde en lugar de solo decir que no. */
export async function otroMesDelArchivo(claveArea, archivo, periodo, vigente, reportes) {
  const r = await mesesDelArchivo(archivo, { area: claveArea, anio: vigente.slice(0, 4), hasta: vigente });
  if (r.problema || r.meses.length !== 1 || r.meses[0] === periodo) return null;
  const estado = reporteDe(reportes, claveArea, r.meses[0])?.estado ?? 'no_iniciado';
  const reporte = reporteDe(reportes, claveArea, r.meses[0]);
  return {
    periodo: r.meses[0],
    entregado: estaEntregado(estado),
    conCifras: Boolean(reporte?.carga) || Object.keys(reporte?.datos ?? {}).length > 0,
  };
}

function insignia(fila) {
  if (fila.resultado === 'omitido') return <Badge label="No se tocó" tone="none" />;
  if (fila.resultado === 'rechazado') return <Badge label="Rechazado" tone="crit" />;
  if (fila.resultado === 'fallo') return <Badge label="No se cargó" tone="crit" />;
  if (fila.errores) return <Badge label={`${fila.errores} ${fila.errores === 1 ? 'error' : 'errores'}`} tone="crit" />;
  if (fila.avisos) return <Badge label={`${fila.avisos} ${fila.avisos === 1 ? 'alerta' : 'alertas'}`} tone="warn" />;
  return <Badge label="Sin observaciones" tone="ok" />;
}

function detalleDe(fila) {
  if (fila.resultado !== 'aceptado') return fila.detalle;
  const leida = fila.hoja ? `Hoja «${fila.hoja}» de «${fila.archivo}»` : `«${fila.archivo}»`;
  if (fila.errores) return `${leida}. Ábralo y corríjalo con Dr. Mochi: con errores no se puede enviar.`;
  if (fila.avisos) return `${leida}. Ábralo y justifique las alertas antes de enviar.`;
  return `${leida}. Listo para revisar y enviar.`;
}

/* El archivo de cada área: casi todas Excel; Farmacia y Nefrología, Word. */
const EXCEL = Object.freeze({ tipo: 'Excel', extension: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

export default function CargaDeMeses({ area: claveArea, reportes, vigente, usuario, onAbrir }) {
  const unMesPorArchivo = Boolean(AREAS_BOT[claveArea]?.unMesPorArchivo);
  const tipo = AREAS_BOT[claveArea]?.archivo ?? EXCEL;
  const word = tipo.tipo === 'Word';
  const anio = vigente.slice(0, 4);
  const entrada = useRef(null);
  const [revisando, setRevisando] = useState(false);
  const [detectados, setDetectados] = useState(null);
  const [rechazos, setRechazos] = useState([]);
  const [avance, setAvance] = useState(null);
  const [resultados, setResultados] = useState(null);
  const [toast, setToast] = useState(null);

  const plan = detectados ? planDe(reportes, claveArea, detectados) : [];
  const porCargar = plan.filter((m) => m.accion !== 'omitir');
  const porReemplazar = plan.filter((m) => m.accion === 'reemplazar');
  const variosArchivos = new Set(plan.map((m) => m.archivo.name)).size > 1 || unMesPorArchivo;

  /* Cada archivo pasa por el bot solo para saber de qué meses es; lo que no
     sirve se dice archivo por archivo, sin frenar a los demás. */
  const elegir = async (lista) => {
    setRechazos([]);
    if (!lista.length) return;
    setRevisando(true);
    const buenos = [];
    const malos = [];
    try {
      for (const archivo of lista) {
        if (!(tipo.extensiones ?? [tipo.extension]).some((e) => archivo.name.toLowerCase().endsWith(e))) {
          malos.push({ archivo: archivo.name, motivo: word ? 'No es un Word (.docx o .doc). Guárdelo como «Documento de Word (.docx)».' : 'No es un archivo .xlsx. Guárdelo como «Libro de Excel (.xlsx)».' });
          continue;
        }
        if (archivo.size > TAMANO_MAXIMO) {
          malos.push({ archivo: archivo.name, motivo: `Pesa más de 5 MB. Revise que sea el ${tipo.tipo} del área.` });
          continue;
        }
        const r = await mesesDelArchivo(archivo, { area: claveArea, anio, hasta: vigente });
        if (r.problema) malos.push({ archivo: archivo.name, motivo: `${r.problema.titulo}. ${r.problema.detalle ?? ''}`.trim() });
        else if (!r.meses.length && !r.descartados.length) malos.push({ archivo: archivo.name, motivo: `No trae ningún mes de enero a ${mesDe(vigente)} de ${anio}.` });
        else buenos.push({ archivo, ...r });
      }
    } finally {
      setRevisando(false);
    }
    setRechazos(malos);
    if (buenos.length) setDetectados(buenos);
  };

  /* Uno por uno y en orden de mes: cada mes se compara con el anterior, así que
     el anterior tiene que estar cargado antes. */
  const confirmar = async () => {
    const filas = [];
    const pendiente = plan;
    setDetectados(null);
    for (const [i, m] of pendiente.entries()) {
      if (m.accion === 'omitir') {
        filas.push({ clave: `${m.periodo}|${i}`, periodo: m.periodo, archivo: m.archivo.name, resultado: 'omitido', detalle: m.texto });
        continue;
      }
      setAvance({ periodo: m.periodo, n: i + 1, de: pendiente.length });
      try {
        filas.push({ ...(await cargarMes(claveArea, m.archivo, m.periodo, usuario.nombre)), clave: `${m.periodo}|${i}` });
      } catch {
        filas.push({ clave: `${m.periodo}|${i}`, periodo: m.periodo, archivo: m.archivo.name, resultado: 'fallo', detalle: 'Se interrumpió la carga de este mes. Vuelva a intentarlo.' });
      }
    }
    setAvance(null);
    setResultados(filas);
    const aceptados = filas.filter((f) => f.resultado === 'aceptado').length;
    const intentados = pendiente.filter((m) => m.accion !== 'omitir').length;
    setToast(`${aceptados} de ${intentados} ${intentados === 1 ? 'mes cargado' : 'meses cargados'}.`);
  };

  const abrir = (periodo) => {
    setResultados(null);
    onAbrir?.(periodo);
  };

  const columnasPlan = [
    { key: 'periodo', label: 'Mes', width: 140, tooltip: 'El mes que el bot reconoció en el archivo.', render: (m) => etiquetaPeriodo(m.periodo) },
    ...(variosArchivos ? [{ key: 'archivo', label: 'Archivo', width: 170, tooltip: 'De qué archivo sale ese mes.', render: (m) => <span className="hrl-mono">{m.archivo.name}</span> }] : []),
    { key: 'estado', label: 'Estado', width: 130, tooltip: 'En qué punto está hoy el reporte de ese mes.', render: (m) => <Badge label={estado(m.estado).label} tone={estado(m.estado).tono} /> },
    { key: 'accion', label: 'Qué pasará', render: (m) => (m.accion === 'reemplazar' ? <strong>{m.texto}</strong> : m.texto) },
  ];

  const columnasResultado = [
    {
      key: 'periodo',
      label: 'Mes',
      width: 140,
      tooltip: 'Abre el reporte de ese mes.',
      render: (f) =>
        onAbrir ? (
          <Button tone="link" onClick={() => abrir(f.periodo)}>
            {etiquetaPeriodo(f.periodo)}
          </Button>
        ) : (
          etiquetaPeriodo(f.periodo)
        ),
    },
    { key: 'resultado', label: 'Resultado', width: 150, tooltip: 'Lo que encontró el bot en ese mes.', render: insignia },
    { key: 'detalle', label: 'Detalle', render: detalleDe },
    {
      key: 'acciones',
      label: '',
      width: 64,
      align: 'right',
      render: (f) =>
        onAbrir ? (
          <div className="hrl-acciones-icono">
            <Tooltip title="Abrir el mes" body="El reporte de ese mes, con lo que encontró el bot y sus cifras." focusable={false}>
              <IconButton icon="sh-eye" tone="action" aria-label={`Abrir el reporte de ${etiquetaPeriodo(f.periodo)}`} onClick={() => abrir(f.periodo)} />
            </Tooltip>
          </div>
        ) : null,
    },
  ];

  const titulo = unMesPorArchivo ? 'Cargar meses pasados' : 'Actualizar varios meses con el libro completo';
  const subtitulo = unMesPorArchivo
    ? `Elija los ${tipo.tipo} de los meses que faltan, de enero a ${mesDe(vigente)}: el bot reconoce de qué mes es cada uno`
    : `Suba su ${word ? 'cuadro' : 'libro'} del año una sola vez: el bot lee cada mes, de enero a ${mesDe(vigente)}`;
  const boton = unMesPorArchivo ? `Elegir los ${tipo.tipo} de los meses` : `Subir el ${word ? 'cuadro' : 'libro'} completo`;

  return (
    <>
      <Card accent="var(--info)" icon="sh-folder" title={titulo} subtitle={subtitulo}>
        <Stack gap={3} className="hrl-cuerpo">
          <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
            Antes de cargar se le muestra a qué mes va cada archivo. Cada mes queda en borrador, con lo que encontró el bot, para revisarlo y enviarlo desde
            su reporte. Los meses ya entregados no se tocan.
          </p>
          <Tooltip
            title={boton}
            body={
              unMesPorArchivo
                ? `Puede elegir varios a la vez (ENERO${tipo.extension}, FEBRERO${tipo.extension}…). El mes sale de lo que dice el ${tipo.tipo}; si no lo dice, del nombre del archivo.`
                : `El ${word ? 'cuadro del año, con una columna por mes' : 'libro del año, con una hoja por mes'}. Se carga cada mes que traiga sus cifras.`
            }
            focusable={false}
          >
            <Button
              icon="sh-upload"
              tone="blue"
              disabled={Boolean(avance) || revisando}
              loading={revisando}
              loadingText="Reconociendo los meses…"
              onClick={() => entrada.current?.click()}
              style={{ alignSelf: 'flex-start', minHeight: 'var(--touch-target)' }}
            >
              {avance ? `Cargando ${mesDe(avance.periodo)} (${avance.n} de ${avance.de})…` : boton}
            </Button>
          </Tooltip>
          {/* El kit no tiene selector de archivos: el mismo input oculto que PasoCarga. */}
          <input
            ref={entrada}
            type="file"
            multiple
            accept={`${(tipo.extensiones ?? [tipo.extension]).join(',')},${tipo.mime}`}
            hidden
            onChange={(e) => {
              const lista = [...(e.target.files ?? [])];
              e.target.value = '';
              elegir(lista);
            }}
          />
          {rechazos.length > 0 && (
            <Alert tone="error" title={rechazos.length === 1 ? 'Un archivo no se puede usar' : `${rechazos.length} archivos no se pueden usar`}>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
                {rechazos.map((r) => (
                  <li key={r.archivo}>
                    <strong>{r.archivo}</strong>: {r.motivo}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </Stack>
      </Card>

      {detectados && (
        <Dialog
          title={porReemplazar.length ? '¿Cargar y reemplazar meses ya cargados?' : `¿Cargar ${porCargar.length} ${porCargar.length === 1 ? 'mes' : 'meses'}?`}
          subtitle={detectados.length === 1 ? `Archivo: «${detectados[0].archivo.name}»` : `${detectados.length} archivos`}
          onClose={() => setDetectados(null)}
          maxWidth={760}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setDetectados(null)}>
                Cancelar
              </Button>
              {porCargar.length > 0 && (
                <Button tone={porReemplazar.length ? 'danger' : 'cta'} icon="sh-upload" onClick={confirmar}>
                  {porReemplazar.length ? `Cargar y reemplazar ${porReemplazar.length}` : `Cargar ${porCargar.length}`}
                </Button>
              )}
            </Stack>
          }
        >
          <Stack gap={3}>
            {porReemplazar.length > 0 && (
              <Alert tone="warning" title={`${porReemplazar.length} ${porReemplazar.length === 1 ? 'mes ya tiene cifras' : 'meses ya tienen cifras'}`}>
                Si el bot acepta ese mes, sus cifras reemplazan a las actuales; si lo rechaza, el mes queda como estaba. Las alertas ya confirmadas
                que vuelvan a aparecer se conservan{api.esAreaReal(claveArea) ? '' : ' solo con el servidor; en esta demostración se pierden'}.
              </Alert>
            )}
            {porCargar.length === 0 && (
              <Alert tone="info" title="No hay ningún mes que cargar">
                Los meses de estos archivos ya se entregaron. Para cambiar uno, Estadística debe reabrirlo.
              </Alert>
            )}
            <DataTable columns={columnasPlan} rows={plan} rowKey={(m) => m.clave} />
          </Stack>
        </Dialog>
      )}

      {resultados && (
        <Dialog
          title="Lo que se cargó"
          subtitle="Cada mes quedó en borrador: ábralo para revisarlo y enviarlo"
          onClose={() => setResultados(null)}
          maxWidth={780}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button onClick={() => setResultados(null)}>Cerrar</Button>
            </Stack>
          }
        >
          <DataTable columns={columnasResultado} rows={resultados} rowKey={(f) => f.clave} />
        </Dialog>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}
