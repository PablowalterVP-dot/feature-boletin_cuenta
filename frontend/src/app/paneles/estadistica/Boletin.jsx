/* Boletín estadístico mensual.

   Se arma solo con lo que hay en la base de datos (`datos/boletin/`): cada
   capítulo entra cuando su área tiene su formato en la base y entregó el
   reporte del mes, que desde el 12/10/2026 ya llega validado por el bot.Nada se digita aquí, ninguna cifra está escrita
   en esta pantalla y nada simulado llega al documento; lo único editable son
   los textos y las fotos de la portada, el directorio y los separadores.

   Se descarga como PDF (`servicios/boletin-pdf.js`: cada hoja tal como se ve,
   sin pasar por el diálogo de impresión) o se imprime con el del navegador; la
   hoja de impresión oculta el menú, la barra superior y estos controles. */

import { useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Grid, Icon, Stack, Toast, Tooltip } from '@hrl/core-ui';
import { construirBoletin, ultimoPeriodoConDatos, ESTADO_CAPITULO } from '@/app/datos/boletin/construir.js';
import { editorialDe } from '@/app/datos/boletin/editorial.js';
import { editarBoletin, restablecerBoletin, useHoy } from '@/app/datos/store.js';
import { areasEnBase, MODO_API } from '@/app/servicios/api.js';
import { descargarBoletinPdf } from '@/app/servicios/boletin-pdf.js';
import { periodoVigente, etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { plural } from '@/app/dominio/formato.js';
import { SelectorPeriodo } from './comunes.jsx';
import { PaginaPortada, PaginaPresentacion, PaginaDirectorio, PaginasIndice } from './boletin/PaginasPreliminares.jsx';
import { Capitulo } from './boletin/Capitulo.jsx';
import { Glosario } from './boletin/Glosario.jsx';
import './boletin-editorial.css';

const AYUDA_ESTADO = {
  incluido: 'El reporte del mes está en la base de datos, entregado y validado por el bot: el capítulo ya está en el documento.',
  'espera-area': 'El formato del área está en la base de datos, pero no hay reporte entregado de este mes. El capítulo aparece cuando el área lo entregue.',
  'sin-base': 'Todavía no hay datos de esto en la base de datos. El capítulo está preparado y aparece solo cuando el formato se instale y llegue el primer reporte entregado.',
};

const ORIGEN = {
  area: 'Reporte del área',
  propio: 'Datos de Estadística',
  mixta: 'Áreas y datos de Estadística',
};

function AvanceCapitulo({ capitulo }) {
  const e = ESTADO_CAPITULO[capitulo.estado];
  return (
    <Tooltip title={`Capítulo ${capitulo.romano}: ${capitulo.titulo}`} body={`${AYUDA_ESTADO[capitulo.estado]} Origen de las cifras: ${ORIGEN[capitulo.fuente].toLowerCase()}.`}>
      <div className="boletin-avance">
        <Icon name={e.icono} />
        <div className="boletin-avance-texto">
          <strong>
            {capitulo.romano}. {capitulo.titulo}
          </strong>
          <span>{ORIGEN[capitulo.fuente]}</span>
        </div>
        <Badge tone={e.tone} label={e.label} />
      </div>
    </Tooltip>
  );
}

export default function Boletin({ reportes = [], editoriales = {} }) {
  /* Los reportes de la base llegan después de iniciar sesión, cuando el
     boletín ya puede estar abierto. Mientras nadie elija un mes, el boletín
     sigue al último mes con datos a medida que llegan; al elegir uno, se
     queda en él. */
  const hoy = useHoy();
  const [elegido, setPeriodo] = useState(null);
  const ultimoConDatos = useMemo(() => ultimoPeriodoConDatos(reportes, { areasEnBase: areasEnBase() }), [reportes]);
  const periodo = elegido ?? ultimoConDatos ?? periodoVigente(hoy);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState(null);
  /* Por qué hoja va la descarga del PDF ({ hecho, total }), o null. */
  const [armando, setArmando] = useState(null);
  const documento = useRef(null);

  const boletin = useMemo(() => construirBoletin(periodo, reportes, { areasEnBase: areasEnBase() }), [periodo, reportes]);
  const editorial = useMemo(() => editorialDe(editoriales[periodo]), [editoriales, periodo]);
  const editar = (ruta, valor) => editarBoletin(periodo, ruta, valor);
  const editado = Boolean(editoriales[periodo]);

  const total = boletin.capitulos.length;
  const sinBase = boletin.pendientes.filter((c) => c.estado === 'sin-base').length;

  const descargarPdf = async () => {
    setArmando({ hecho: 0, total: 0 });
    try {
      const hojas = documento.current?.querySelectorAll('.hoja-a4') ?? [];
      const { paginas } = await descargarBoletinPdf(hojas, `Boletin estadistico HRL ${periodo}.pdf`, {
        titulo: `Boletín Estadístico HRL ${etiquetaPeriodo(periodo)}`,
        alAvanzar: (hecho, total) => setArmando({ hecho, total }),
      });
      setAviso(`Boletín de ${etiquetaPeriodo(periodo)} descargado en PDF: ${plural(paginas, 'página', 'páginas')}.`);
    } catch (e) {
      setAviso(`No se pudo armar el PDF: ${e.message}`);
    } finally {
      setArmando(null);
    }
  };

  const restablecer = () => {
    restablecerBoletin(periodo);
    setConfirmando(false);
    setAviso('Se restablecieron los textos y las fotos originales.');
  };

  return (
    <div className="boletin-escritorio" ref={documento}>
      <div className="hrl-no-imprimir boletin-controles">
        <Card
          title={`Boletín estadístico · ${etiquetaPeriodo(periodo)}`}
          subtitle="Se arma solo con los reportes entregados que están en la base de datos"
          total={`${boletin.incluidos} de ${total} capítulos`}
          accent="var(--primary)"
        >
          <Stack gap={4} style={{ padding: 'var(--space-4) var(--space-5)' }}>
            <Stack direction="row" gap={3} align="end" justify="between" wrap>
              <SelectorPeriodo periodo={periodo} onCambiar={setPeriodo} />
              <Stack direction="row" gap={2} wrap>
                <Tooltip title="Editar textos y fotos" body="Permite cambiar la portada, la presentación, el directorio, las introducciones y las fotos de los capítulos escribiendo sobre las hojas. Las cifras no se editan: salen de los reportes.">
                  <Button
                    icon={modoEdicion ? 'sh-check' : 'sh-pencil'}
                    tone={modoEdicion ? 'cta' : 'ghost'}
                    onClick={() => setModoEdicion(!modoEdicion)}
                    style={{ minHeight: 'var(--touch-target-lg)' }}
                  >
                    {modoEdicion ? 'Terminar edición' : 'Editar textos y fotos'}
                  </Button>
                </Tooltip>
                {editado && (
                  <Tooltip title="Restablecer originales" body="Devuelve los textos y las fotos de este mes a sus valores de partida.">
                    <Button tone="plain" icon="sh-swap" onClick={() => setConfirmando(true)} style={{ minHeight: 'var(--touch-target-lg)' }}>
                      Restablecer
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title="Imprimir" body="Abre el diálogo de impresión del navegador, para mandarlo a una impresora. El texto de lo impreso es más nítido que el del PDF descargado.">
                  <Button tone="ghost" icon="sh-print" onClick={() => window.print()} disabled={armando != null} style={{ minHeight: 'var(--touch-target-lg)' }}>
                    Imprimir
                  </Button>
                </Tooltip>
                <Tooltip title="Descargar en PDF" body="Descarga el boletín tal como se ve, una hoja A4 por página, sin pasar por el diálogo de impresión. Cada hoja va como imagen: el texto no se puede seleccionar.">
                  <Button icon="sh-export" onClick={descargarPdf} disabled={armando != null} style={{ minHeight: 'var(--touch-target-lg)' }}>
                    {armando ? (armando.total ? `Armando el PDF… hoja ${Math.min(armando.hecho + 1, armando.total)} de ${armando.total}` : 'Preparando el PDF…') : 'Descargar PDF'}
                  </Button>
                </Tooltip>
              </Stack>
            </Stack>

            <Grid min={260} gap={2}>
              {boletin.capitulos.map((c) => (
                <AvanceCapitulo key={c.clave} capitulo={c} />
              ))}
            </Grid>
          </Stack>
        </Card>

        {MODO_API.tipo !== 'real' ? (
          <Alert tone="warning" title="Sin conexión con la base de datos">
            El boletín solo publica lo que está en la base de datos, y esta sesión no está conectada al backend: no hay
            capítulos que mostrar. {MODO_API.detalle}
          </Alert>
        ) : (
          boletin.pendientes.length > 0 && (
            <Alert tone="info" title={`${plural(boletin.incluidos, 'capítulo', 'capítulos')} de ${total} con datos en la base`}>
              El boletín se completa solo: cada capítulo aparece cuando el área entrega su reporte del mes, ya validado por el bot.
              {sinBase > 0 && ` ${plural(sinBase, 'capítulo todavía no tiene', 'capítulos todavía no tienen')} datos en la base.`}
            </Alert>
          )
        )}

        {modoEdicion && (
          <Alert tone="info" title="Edición de textos y fotos">
            Haga clic en un título, un párrafo o un nombre del directorio para cambiarlo, o use el botón sobre una foto. Las
            cifras y los párrafos que las describen no se editan: salen de los reportes.
          </Alert>
        )}
      </div>

      <PaginaPortada periodo={periodo} editorial={editorial} modoEdicion={modoEdicion} editar={editar} />
      <PaginaPresentacion periodo={periodo} editorial={editorial} modoEdicion={modoEdicion} editar={editar} />
      <PaginaDirectorio periodo={periodo} editorial={editorial} modoEdicion={modoEdicion} editar={editar} />
      <PaginasIndice periodo={periodo} indice={boletin.indice} hojas={boletin.hojasIndice} />
      {boletin.capitulos
        .filter((c) => c.pagina)
        .map((c) => (
          <Capitulo key={c.clave} capitulo={c} periodo={periodo} editorial={editorial} modoEdicion={modoEdicion} editar={editar} />
        ))}
      <Glosario periodo={periodo} pagina={boletin.paginaGlosario} />

      {confirmando && (
        <Dialog
          title="Restablecer textos y fotos"
          subtitle={etiquetaPeriodo(periodo)}
          onClose={() => setConfirmando(false)}
          maxWidth={520}
          footer={
            <>
              <Button tone="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
              <Button tone="danger" onClick={restablecer}>
                Sí, restablecer
              </Button>
            </>
          }
        >
          <Alert tone="warning" title="Se perderán los cambios editoriales de este mes">
            La portada, la presentación, el directorio, las introducciones y las fotos vuelven a sus valores de partida. Las
            cifras no cambian.
          </Alert>
        </Dialog>
      )}

      <Toast message={aviso} onClose={() => setAviso(null)} />
    </div>
  );
}
